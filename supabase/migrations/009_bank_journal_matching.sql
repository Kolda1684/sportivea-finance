-- Bankovní deník: účty, Fio transakce a vazby na vydané/přijaté faktury.

create table if not exists bank_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  account_number text,
  starting_balance numeric default 0,
  created_at timestamptz default now()
);

create table if not exists bank_transactions (
  id uuid primary key default gen_random_uuid(),
  fio_id text unique,
  account_id uuid references bank_accounts(id) on delete set null,
  date date not null,
  amount numeric not null,
  amount_czk numeric,
  currency text default 'CZK',
  exchange_rate numeric,
  counterparty_name text,
  counterparty_account text,
  variable_symbol text,
  message text,
  type text check (type in ('income', 'expense')),
  status text default 'unmatched' check (status in ('unmatched', 'pending_review', 'matched', 'ignored')),
  matched_invoice_id uuid references invoices(id) on delete set null,
  matched_expense_invoice_id uuid,
  match_confidence integer default 0,
  match_method text,
  match_zone text check (match_zone in ('auto', 'suggest', 'manual')),
  match_confirmed_at timestamptz,
  match_confirmed_by text,
  created_at timestamptz default now()
);

create table if not exists expense_invoices (
  id uuid primary key default gen_random_uuid(),
  fakturoid_id text unique,
  supplier_name text,
  amount numeric,
  amount_czk numeric,
  currency text default 'CZK',
  date date,
  due_date date,
  variable_symbol text,
  status text default 'unpaid',
  note text,
  created_at timestamptz default now()
);

alter table bank_transactions
  add column if not exists matched_expense_invoice_id uuid,
  add column if not exists amount_czk numeric,
  add column if not exists exchange_rate numeric,
  add column if not exists account_id uuid,
  add column if not exists match_confidence integer default 0,
  add column if not exists match_method text,
  add column if not exists match_zone text check (match_zone in ('auto', 'suggest', 'manual')),
  add column if not exists match_confirmed_at timestamptz,
  add column if not exists match_confirmed_by text;

do $$
declare
  constraint_name text;
begin
  select conname into constraint_name
  from pg_constraint
  where conrelid = 'bank_transactions'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%status%'
    and pg_get_constraintdef(oid) like '%unmatched%';

  if constraint_name is not null then
    execute format('alter table bank_transactions drop constraint %I', constraint_name);
  end if;

  alter table bank_transactions
    add constraint bank_transactions_status_check
    check (status in ('unmatched', 'pending_review', 'matched', 'ignored'));
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'bank_transactions_matched_expense_invoice_id_fkey'
  ) then
    alter table bank_transactions
      add constraint bank_transactions_matched_expense_invoice_id_fkey
      foreign key (matched_expense_invoice_id) references expense_invoices(id) on delete set null;
  end if;
end $$;

alter table bank_accounts enable row level security;
alter table bank_transactions enable row level security;
alter table expense_invoices enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'bank_accounts' and policyname = 'authenticated_all') then
    create policy "authenticated_all" on bank_accounts for all using (auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where tablename = 'bank_transactions' and policyname = 'authenticated_all') then
    create policy "authenticated_all" on bank_transactions for all using (auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where tablename = 'expense_invoices' and policyname = 'authenticated_all') then
    create policy "authenticated_all" on expense_invoices for all using (auth.role() = 'authenticated');
  end if;
end $$;
