-- Oddělení e-shop (drinkr/Shopify) faktur od agenturních.
-- E-shop faktury poznáme podle custom_id z Fakturoidu (Shopify order ID) — flag plní sync.

alter table invoices add column if not exists is_eshop boolean not null default false;
create index if not exists invoices_is_eshop_idx on invoices (is_eshop) where is_eshop = true;
