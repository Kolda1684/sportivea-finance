-- Hodinová sazba na profilu uživatele
alter table profiles add column if not exists hourly_rate numeric default null;
