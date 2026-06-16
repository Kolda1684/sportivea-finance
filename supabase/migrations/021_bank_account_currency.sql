-- Multi-currency podpora pro bankovní účty + manuální transakce

alter table bank_accounts
  add column if not exists currency text not null default 'CZK',
  add column if not exists sort_order integer;

-- Nastavit pořadí podle vzniku, ať to vypadá konzistentně
update bank_accounts
  set sort_order = sub.rn
  from (select id, row_number() over (order by created_at) as rn from bank_accounts) sub
  where bank_accounts.id = sub.id
    and bank_accounts.sort_order is null;

create index if not exists idx_bank_accounts_sort on bank_accounts(sort_order nulls last, created_at);
