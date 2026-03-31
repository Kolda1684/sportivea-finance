-- Přidej matching sloupce do bank_transactions
alter table bank_transactions
  add column if not exists match_confidence integer default 0,
  add column if not exists match_method text,
  add column if not exists match_zone text check (match_zone in ('auto', 'suggest', 'manual')),
  add column if not exists match_confirmed_at timestamptz,
  add column if not exists match_confirmed_by text;

-- Cache kurzů ČNB
create table if not exists exchange_rate_cache (
  id uuid primary key default gen_random_uuid(),
  currency text not null,
  date date not null,
  rate numeric not null,
  fetched_at timestamptz default now(),
  unique(currency, date)
);
