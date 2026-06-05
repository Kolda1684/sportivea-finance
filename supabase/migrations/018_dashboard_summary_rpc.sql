-- ============================================================
-- Dashboard summary RPC – sjednocuje ~30 dotazů do jednoho round-tripu
-- ============================================================

-- Indexy pro rychlejší agregace dle měsíce
create index if not exists income_month_idx        on income (month);
create index if not exists variable_costs_month_idx on variable_costs (month);
create index if not exists extra_costs_month_idx    on extra_costs (month);
create index if not exists invoices_issued_on_idx   on invoices (issued_on);
create index if not exists invoices_status_idx      on invoices (status);
create index if not exists fixed_costs_active_idx   on fixed_costs (active) where active = true;

-- Hlavní funkce
create or replace function dashboard_summary(p_month text)
returns jsonb
language sql
stable
as $$
  with
    parsed as (
      select
        p_month as month,
        split_part(p_month, ',', 1)::int as mm,
        split_part(p_month, ',', 2)::int as yy
    ),
    bounds as (
      select
        make_date(yy, mm, 1) as from_date,
        (make_date(yy, mm, 1) + interval '1 month - 1 day')::date as to_date
      from parsed
    ),
    last6 as (
      select
        to_char(d, 'FMMM') || ',' || to_char(d, 'YYYY') as month_key,
        d as month_date
      from parsed, generate_series(
        date_trunc('month', make_date(parsed.yy, parsed.mm, 1)) - interval '5 months',
        date_trunc('month', make_date(parsed.yy, parsed.mm, 1)),
        interval '1 month'
      ) as d
    ),
    ytd_months as (
      select to_char(d, 'FMMM') || ',' || to_char(d, 'YYYY') as month_key
      from parsed, generate_series(
        make_date(parsed.yy, 1, 1),
        make_date(parsed.yy, parsed.mm, 1),
        interval '1 month'
      ) as d
    ),
    fixed_total as (
      select coalesce(sum(amount), 0)::numeric as total from fixed_costs where active = true
    ),
    month_income as (
      select coalesce(sum(amount), 0)::numeric as total
      from income, parsed where income.month = parsed.month
    ),
    month_var as (
      select coalesce(sum(price), 0)::numeric as total
      from variable_costs, parsed where variable_costs.month = parsed.month
    ),
    month_extra as (
      select coalesce(sum(amount), 0)::numeric as total
      from extra_costs, parsed where extra_costs.month = parsed.month
    ),
    var_by_client as (
      select
        coalesce(client, 'Neznámý') as client,
        count(*)::int as count,
        coalesce(sum(hours), 0)::numeric as hours,
        coalesce(sum(price), 0)::numeric as price
      from variable_costs, parsed
      where variable_costs.month = parsed.month
      group by client
      order by sum(price) desc nulls last
    ),
    var_by_member as (
      select
        coalesce(team_member, 'Neznámý') as member,
        count(*)::int as count,
        coalesce(sum(hours), 0)::numeric as hours,
        coalesce(sum(price), 0)::numeric as price
      from variable_costs, parsed
      where variable_costs.month = parsed.month
      group by team_member
      order by sum(price) desc nulls last
    ),
    top_clients as (
      select
        client,
        coalesce(sum(amount), 0)::numeric as total,
        count(*)::int as count
      from income, parsed
      where income.month = parsed.month
      group by client
      order by sum(amount) desc nulls last
      limit 6
    ),
    -- Měsíční agregace pro graf — jeden GROUP BY místo 6 N+1 dotazů
    income_by_month as (
      select month, coalesce(sum(amount), 0)::numeric as total
      from income
      where month in (select month_key from last6 union select month_key from ytd_months)
      group by month
    ),
    var_by_month as (
      select month, coalesce(sum(price), 0)::numeric as total
      from variable_costs
      where month in (select month_key from last6 union select month_key from ytd_months)
      group by month
    ),
    extra_by_month as (
      select month, coalesce(sum(amount), 0)::numeric as total
      from extra_costs
      where month in (select month_key from last6 union select month_key from ytd_months)
      group by month
    ),
    monthly_data as (
      select
        last6.month_key,
        coalesce((select total from income_by_month where month = last6.month_key), 0) as income,
        coalesce((select total from var_by_month where month = last6.month_key), 0)
          + coalesce((select total from extra_by_month where month = last6.month_key), 0)
          + (select total from fixed_total) as costs,
        last6.month_date
      from last6
      order by last6.month_date
    ),
    ytd_agg as (
      select
        coalesce(sum(coalesce((select total from income_by_month where month = ytd_months.month_key), 0)), 0) as income,
        coalesce(sum(
          coalesce((select total from var_by_month where month = ytd_months.month_key), 0)
          + coalesce((select total from extra_by_month where month = ytd_months.month_key), 0)
        ), 0) as variable_extra,
        count(*)::int as months
      from ytd_months
    ),
    invoices_month as (
      select coalesce(sum(total), 0)::numeric as total
      from invoices, bounds
      where issued_on >= bounds.from_date and issued_on <= bounds.to_date
    ),
    invoices_unpaid as (
      select
        coalesce(sum(total), 0)::numeric as sum,
        count(*)::int as count
      from invoices
      where status != 'paid'
    )
  select jsonb_build_object(
    'totalIncome', (select total from month_income),
    'totalVar', (select total from month_var),
    'totalExtra', (select total from month_extra),
    'totalFixed', (select total from fixed_total),
    'invoicedAmount', (select total from invoices_month),
    'unpaidSum', (select sum from invoices_unpaid),
    'unpaidCount', (select count from invoices_unpaid),
    'varByClient', coalesce(
      (select jsonb_agg(jsonb_build_object(
        'client', client, 'count', count, 'hours', hours, 'price', price
      )) from var_by_client),
      '[]'::jsonb
    ),
    'varByMember', coalesce(
      (select jsonb_agg(jsonb_build_object(
        'member', member, 'count', count, 'hours', hours, 'price', price
      )) from var_by_member),
      '[]'::jsonb
    ),
    'topClients', coalesce(
      (select jsonb_agg(jsonb_build_object(
        'client', client, 'total', total, 'count', count
      )) from top_clients),
      '[]'::jsonb
    ),
    'monthlyData', coalesce(
      (select jsonb_agg(jsonb_build_object(
        'month', month_key, 'income', income, 'costs', costs
      ) order by month_date) from monthly_data),
      '[]'::jsonb
    ),
    'ytd', jsonb_build_object(
      'income', (select income from ytd_agg),
      'costs', (select variable_extra + (select total from fixed_total) * months from ytd_agg),
      'months', (select months from ytd_agg)
    )
  );
$$;

grant execute on function dashboard_summary(text) to authenticated, service_role;
