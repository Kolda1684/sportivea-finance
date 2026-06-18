-- Tag pro vlastní převody mezi účty (skryjí se z matching fronty)

alter table bank_transactions
  add column if not exists is_internal_transfer boolean default false;

create index if not exists idx_bank_transactions_internal_transfer
  on bank_transactions(is_internal_transfer)
  where is_internal_transfer = true;
