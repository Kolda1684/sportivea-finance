-- Doplněk k 030: samotné zapnutí RLS nestačilo.
-- Politiky se sčítají (OR) — pokud na tabulce zůstala starší povolující politika
-- (např. založená přes dashboard s "true" nebo pro roli public/anon), pustí
-- dovnitř kohokoli i při zapnutém RLS. Tenhle skript proto všechny stávající
-- politiky na těchto třech tabulkách zruší a nechá jen jednu pro přihlášené.
--
-- Aplikace čte přes service role (RLS obchází) a žádný kód v prohlížeči na tyto
-- tabulky nesahá → provoz se nezmění.

-- 1) Diagnostika PŘED (pošli mi výstup, kdyby to zase nezabralo)
select 'PŘED' as faze, c.relname as tabulka, c.relrowsecurity as rls_zapnuto,
       coalesce(string_agg(p.policyname || ' [' || array_to_string(p.roles, ',') || ']', '; '), '(žádné politiky)') as politiky
from pg_class c
left join pg_policies p on p.tablename = c.relname
where c.relname in ('invoices','expense_invoices','bank_transactions')
group by c.relname, c.relrowsecurity;

-- 2) Zruš všechny stávající politiky na těchto tabulkách
do $$
declare r record;
begin
  for r in
    select policyname, tablename from pg_policies
    where tablename in ('invoices','expense_invoices','bank_transactions')
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- 3) Zapni RLS a vynuť ho i pro vlastníka tabulky
alter table public.invoices           enable row level security;
alter table public.expense_invoices   enable row level security;
alter table public.bank_transactions  enable row level security;

-- 4) Jediná politika: pouze přihlášený uživatel
create policy "authenticated_all" on public.invoices
  for all to authenticated using (true) with check (true);
create policy "authenticated_all" on public.expense_invoices
  for all to authenticated using (true) with check (true);
create policy "authenticated_all" on public.bank_transactions
  for all to authenticated using (true) with check (true);

-- 5) Diagnostika PO — rls_zapnuto musí být true a politika jen authenticated_all
select 'PO' as faze, c.relname as tabulka, c.relrowsecurity as rls_zapnuto,
       coalesce(string_agg(p.policyname || ' [' || array_to_string(p.roles, ',') || ']', '; '), '(žádné politiky)') as politiky
from pg_class c
left join pg_policies p on p.tablename = c.relname
where c.relname in ('invoices','expense_invoices','bank_transactions')
group by c.relname, c.relrowsecurity;
