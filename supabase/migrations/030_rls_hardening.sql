-- Row-Level Security: sjednocení ochrany tabulek.
-- Migrace 001 a 009 RLS u těchto tabulek zapínaly, v živé databázi ale aktivní
-- nebylo. Ostatní tabulky projektu ho mají zapnuté — tohle je dorovnává.
-- Aplikace čte přes service role (RLS obchází), takže se jí zapnutí nedotkne.

alter table invoices           enable row level security;
alter table expense_invoices   enable row level security;
alter table bank_transactions  enable row level security;

-- Politiky by měly existovat z 001/009; pro jistotu se dozaloží
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'invoices' and policyname = 'authenticated_all') then
    create policy "authenticated_all" on invoices for all using (auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where tablename = 'expense_invoices' and policyname = 'authenticated_all') then
    create policy "authenticated_all" on expense_invoices for all using (auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where tablename = 'bank_transactions' and policyname = 'authenticated_all') then
    create policy "authenticated_all" on bank_transactions for all using (auth.role() = 'authenticated');
  end if;
end $$;

-- Kontrola: všechny tři řádky musí mít rls_zapnuto = true
select relname as tabulka, relrowsecurity as rls_zapnuto
from pg_class
where relname in ('invoices','expense_invoices','bank_transactions');
