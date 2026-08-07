-- Slovník protistran.
--
-- Fio u odchozích plateb neposílá jméno protistrany (ověřeno: 0 ze 447), takže
-- párovač jede jen na částce a datu a tři čtvrtiny plateb končí u člověka.
-- Identita se dá odvodit dvěma jinými cestami:
--
--   kind='card'    platba kartou — jméno obchodníka je v textu ("Nákup: UBER *TRIP…")
--   kind='account' převod — identitu nese číslo protiúčtu
--
-- label je to, co se píše do finančního deníku ("Facebook ads"), supplier_name
-- je právní název na faktuře ("Meta Platforms Ireland Limited"). Jsou to různé
-- věci a je potřeba obojí: první pro účetní, druhé pro výběr faktury.

create table if not exists counterparty_aliases (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null check (kind in ('card', 'account')),
  -- Normalizovaný klíč: u karet jméno obchodníka bez čísla transakce,
  -- u převodů číslo účtu bez předvolby a vodicích nul.
  pattern       text not null,
  label         text not null,
  supplier_name text,
  -- Kolikrát se použil a kdy naposled — podklad pro úklid a pro řazení návrhů.
  hits          integer not null default 0,
  last_used_at  timestamptz,
  -- 'diary' = napočítáno z Google Sheetu, 'manual' = Janova oprava.
  -- Ruční má přednost a hromadný import ji nesmí přepsat.
  source        text not null default 'manual' check (source in ('diary', 'manual')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (kind, pattern)
);

create index if not exists counterparty_aliases_lookup_idx on counterparty_aliases (kind, pattern);

create or replace function touch_counterparty_aliases()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists counterparty_aliases_touch on counterparty_aliases;
create trigger counterparty_aliases_touch
  before update on counterparty_aliases
  for each row execute function touch_counterparty_aliases();

alter table counterparty_aliases enable row level security;
alter table counterparty_aliases force row level security;

-- Popisek do deníku a jak k němu systém došel. Uložený na transakci, aby se
-- Janova oprava neztratila, když se slovník později změní.
alter table bank_transactions add column if not exists diary_label text;
alter table bank_transactions add column if not exists diary_label_source text
  check (diary_label_source in ('alias', 'manual', 'diary_import'));
