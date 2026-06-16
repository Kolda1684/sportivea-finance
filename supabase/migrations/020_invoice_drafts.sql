-- AI Upload faktur: dvoufázový flow (DB draft → Fakturoid po schválení)

alter table expense_invoices
  add column if not exists review_status text default 'approved'
    check (review_status in ('draft', 'approved', 'rejected')),
  add column if not exists extracted_data jsonb,
  add column if not exists ocr_warnings jsonb,
  add column if not exists file_path text,
  add column if not exists supplier_ico text,
  add column if not exists original_filename text;

update expense_invoices set review_status = 'approved' where review_status is null;

create index if not exists idx_expense_invoices_review_status on expense_invoices(review_status);

create or replace function expense_invoice_dedup_key(
  ico text, vs text, amt numeric, dt date
) returns text language sql immutable as $$
  select md5(
    coalesce(ico, '') || '|' ||
    coalesce(vs, '') || '|' ||
    coalesce(amt::text, '') || '|' ||
    coalesce(dt::text, '')
  )
$$;

create index if not exists idx_expense_invoices_dedup
  on expense_invoices (expense_invoice_dedup_key(supplier_ico, variable_symbol, amount, date));

-- Storage bucket pro PDF/obrázky faktur (privátní)
insert into storage.buckets (id, name, public)
  values ('invoice-files', 'invoice-files', false)
  on conflict (id) do nothing;

do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'objects' and policyname = 'invoice_files_authenticated_read'
  ) then
    create policy "invoice_files_authenticated_read"
      on storage.objects for select
      to authenticated
      using (bucket_id = 'invoice-files');
  end if;
  if not exists (
    select 1 from pg_policies where tablename = 'objects' and policyname = 'invoice_files_authenticated_insert'
  ) then
    create policy "invoice_files_authenticated_insert"
      on storage.objects for insert
      to authenticated
      with check (bucket_id = 'invoice-files');
  end if;
  if not exists (
    select 1 from pg_policies where tablename = 'objects' and policyname = 'invoice_files_authenticated_delete'
  ) then
    create policy "invoice_files_authenticated_delete"
      on storage.objects for delete
      to authenticated
      using (bucket_id = 'invoice-files');
  end if;
end $$;
