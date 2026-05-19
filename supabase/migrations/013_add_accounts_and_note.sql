-- 013: Add note column, two new accounts, and manual transactions from PDF

-- note column for manual transaction descriptions
alter table bank_transactions
  add column if not exists note text;

-- Two new accounts
insert into bank_accounts (name, account_number, starting_balance)
values
  ('Účet 3',    '2103489805/2010', 0),
  ('Hotovost',  null,              0)
on conflict do nothing;

-- Update starting balances for FIO accounts based on PDF
update bank_accounts set starting_balance = 86756.09 where name = 'FIO_ucet_1';
update bank_accounts set starting_balance = 1508.74  where name = 'FIO_ucet_2';

-- Transactions for Účet 3 (2103489805/2010)
-- Data from Finanční deník PDF; amounts for rows 5-9 were cut off by A4 page width.
-- Row 2 amount (10 541,34) is inferred from balance chain: 15 000 - 4 458,66 = 10 541,34.
do $$
declare
  acc3_id uuid;
begin
  select id into acc3_id from bank_accounts where account_number = '2103489805/2010' limit 1;

  insert into bank_transactions
    (account_id, date, amount, amount_czk, currency, type, status, message)
  values
    -- 21.4: identifikační převod z jiného účtu → 15 000 příjmy
    (acc3_id, '2026-04-21', 15000,    15000,    'CZK', 'income',  'unmatched', 'Převod uvnitř banky'),
    -- 21.4: odchozí Sportivea převod (výdaje, odvozeno ze zůstatku 4 458,66)
    (acc3_id, '2026-04-21', 10541.34, 10541.34, 'CZK', 'expense', 'unmatched', 'Sportivea převod'),
    -- 21.4: identifikační platba Comgate (výdaje 67,57 → zůstatek 4 391,09)
    (acc3_id, '2026-04-21', 67.57,    67.57,    'CZK', 'expense', 'unmatched', 'Identifikační platba Comgate'),
    -- 21.4: výdaj 270,28 → zůstatek 4 120,81 (bez popisu v PDF)
    (acc3_id, '2026-04-21', 270.28,   270.28,   'CZK', 'expense', 'unmatched', null),
    -- 5.5: Comgate vratka (příjmy; částka v PDF oříznutá — doplnit ručně)
    (acc3_id, '2026-05-05', 0,        0,        'CZK', 'income',  'unmatched', 'Comgate vratka');
end $$;

-- Transactions for Hotovost (Pokladna)
do $$
declare
  cash_id uuid;
begin
  select id into cash_id from bank_accounts where name = 'Hotovost' limit 1;

  insert into bank_transactions
    (account_id, date, amount, amount_czk, currency, type, status, message, variable_symbol)
  values
    -- 15.1: Zámečnická práce, výdaje 2 000 Kč
    (cash_id, '2026-01-15', 2000, 2000, 'CZK', 'expense', 'unmatched', 'Zámečnická práce', 'N2026020');
end $$;
