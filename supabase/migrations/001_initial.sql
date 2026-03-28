-- ============================================================
-- Finanční Dashboard – Migrační soubor 001
-- Spustit v Supabase SQL Editoru
-- ============================================================

-- Rozšíření pro šifrování
create extension if not exists pgcrypto;

-- ============================================================
-- TABULKY
-- ============================================================

create table transactions (
  id uuid primary key default gen_random_uuid(),
  fio_id text unique,
  date date not null,
  amount numeric not null,
  currency text default 'CZK',
  counterparty_name text,
  counterparty_account text,
  variable_symbol text,
  specific_symbol text,
  constant_symbol text,
  message text,
  type text check (type in ('income', 'expense')),
  status text default 'unmatched' check (status in ('unmatched', 'matched', 'ignored')),
  matched_invoice_id uuid,
  created_at timestamptz default now()
);

create table invoices (
  id uuid primary key default gen_random_uuid(),
  fakturoid_id text unique,
  number text,
  subject_name text,
  issued_on date,
  due_on date,
  total numeric,
  currency text default 'CZK',
  status text,
  variable_symbol text,
  note text,
  pdf_url text,
  synced_at timestamptz default now()
);

-- Přidáme FK pro transactions.matched_invoice_id po vytvoření invoices
alter table transactions
  add constraint fk_transactions_invoice
  foreign key (matched_invoice_id) references invoices(id);

create table invoice_payments (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid references transactions(id),
  invoice_id uuid references invoices(id),
  matched_at timestamptz default now(),
  matched_by text default 'manual' check (matched_by in ('manual', 'auto', 'ai'))
);

create table income (
  id uuid primary key default gen_random_uuid(),
  client text not null,
  project_name text not null,
  amount numeric,
  currency text default 'CZK',
  date date,
  status text default 'cekame' check (status in ('cekame', 'potvrzeno', 'vystaveno', 'zaplaceno')),
  invoice_id uuid references invoices(id),
  note text,
  month text,
  created_at timestamptz default now()
);

create table variable_costs (
  id uuid primary key default gen_random_uuid(),
  team_member text,
  client text,
  hours numeric,
  price numeric,
  task_type text,
  date date,
  task_name text,
  month text,
  external_id text unique,
  created_at timestamptz default now()
);

create table fixed_costs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  amount numeric not null,
  currency text default 'CZK',
  active boolean default true,
  note text
);

create table extra_costs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  amount numeric not null,
  date date,
  category text,
  note text,
  month text,
  fio_transaction_id uuid references transactions(id),
  created_at timestamptz default now()
);

create table team_members (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  hourly_rate numeric default 300,
  active boolean default true
);

-- Nastavení aplikace (API klíče šifrovaně)
create table app_settings (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  value text not null,
  updated_at timestamptz default now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table transactions enable row level security;
alter table invoices enable row level security;
alter table invoice_payments enable row level security;
alter table income enable row level security;
alter table variable_costs enable row level security;
alter table fixed_costs enable row level security;
alter table extra_costs enable row level security;
alter table team_members enable row level security;
alter table app_settings enable row level security;

-- Politiky: pouze přihlášení uživatelé
create policy "authenticated_all" on transactions for all using (auth.role() = 'authenticated');
create policy "authenticated_all" on invoices for all using (auth.role() = 'authenticated');
create policy "authenticated_all" on invoice_payments for all using (auth.role() = 'authenticated');
create policy "authenticated_all" on income for all using (auth.role() = 'authenticated');
create policy "authenticated_all" on variable_costs for all using (auth.role() = 'authenticated');
create policy "authenticated_all" on fixed_costs for all using (auth.role() = 'authenticated');
create policy "authenticated_all" on extra_costs for all using (auth.role() = 'authenticated');
create policy "authenticated_all" on team_members for all using (auth.role() = 'authenticated');
create policy "authenticated_all" on app_settings for all using (auth.role() = 'authenticated');

-- ============================================================
-- FUNKCE PRO ŠIFROVÁNÍ API KLÍČŮ
-- Vyžaduje nastavení: ALTER DATABASE postgres SET app.encryption_key = 'váš-tajný-klíč';
-- ============================================================

create or replace function set_encrypted_setting(setting_key text, setting_value text)
returns void
language plpgsql
security definer
as $$
begin
  insert into app_settings (key, value)
  values (
    setting_key,
    encode(
      encrypt(
        convert_to(setting_value, 'utf8'),
        convert_to(current_setting('app.encryption_key'), 'utf8'),
        'aes'
      ),
      'base64'
    )
  )
  on conflict (key) do update
    set value = encode(
      encrypt(
        convert_to(setting_value, 'utf8'),
        convert_to(current_setting('app.encryption_key'), 'utf8'),
        'aes'
      ),
      'base64'
    ),
    updated_at = now();
end;
$$;

create or replace function get_decrypted_setting(setting_key text)
returns text
language plpgsql
security definer
as $$
declare
  encrypted_val text;
begin
  select value into encrypted_val from app_settings where key = setting_key;
  if encrypted_val is null then return null; end if;
  return convert_from(
    decrypt(
      decode(encrypted_val, 'base64'),
      convert_to(current_setting('app.encryption_key'), 'utf8'),
      'aes'
    ),
    'utf8'
  );
end;
$$;

-- ============================================================
-- SEED DATA
-- ============================================================

-- Členové týmu
insert into team_members (name, hourly_rate, active) values
  ('Vojtěch Kepka', 300, true),
  ('Ondřej Kolář', 300, true);

-- Fixní náklady (celkem 33 259,29 Kč/měsíc)
insert into fixed_costs (name, amount, active, note) values
  ('Ubytování',           11300.00, true, 'Pronájem kanceláře/bytu'),
  ('Vojta Německo',       10000.00, true, 'Pravidelná platba Vojtovi'),
  ('Ondra Německo',        4350.00, true, 'Pravidelná platba Ondrovi'),
  ('Higgsfield AI',        1209.00, true, 'Předplatné AI nástroje'),
  ('Facebook Ads',         2000.00, true, 'Fixní měsíční budget na reklamu'),
  ('Adobe Creative Cloud', 1300.00, true, 'Předplatné Adobe'),
  ('GoDaddy',               800.00, true, 'Doménové hostingové služby'),
  ('Parkování',            1500.00, true, 'Měsíční parkování'),
  ('Loveabel',              800.00, true, 'Software předplatné'),
  ('Ostatní',               0.29,   true, 'Zaokrouhlovací položka');
