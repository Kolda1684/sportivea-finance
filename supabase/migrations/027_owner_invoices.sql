-- Ruční faktury majitelů: kdo si vystavuje / za co / klient / kolik.
-- Přičítá se do platů majitelů (přehled na /costs/salaries).

create table if not exists owner_invoices (
  id uuid primary key default gen_random_uuid(),
  owner_name text not null,
  description text,
  client text,
  amount numeric not null default 0,
  month text not null,            -- formát "M,YYYY" (např. "7,2026")
  created_at timestamptz default now()
);

create index if not exists owner_invoices_month_idx on owner_invoices (month);

alter table owner_invoices enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'owner_invoices' and policyname = 'admin_all') then
    create policy "admin_all" on owner_invoices for all
      using (auth.role() = 'authenticated');
  end if;
end $$;
