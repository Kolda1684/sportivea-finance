-- Tag pro transakce, které nemají a nebudou mít fakturu (nájem, daně, platy státu…)

alter table bank_transactions
  add column if not exists is_no_invoice boolean default false;

create index if not exists idx_bank_transactions_no_invoice
  on bank_transactions(is_no_invoice)
  where is_no_invoice = true;
