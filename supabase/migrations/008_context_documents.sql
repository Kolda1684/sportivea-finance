-- ============================================================
-- Cenotvorba – paměť AI asistenta
-- ============================================================

create table context_documents (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  content text not null,
  file_type text default 'text',
  created_at timestamptz default now()
);

alter table context_documents enable row level security;

create policy "authenticated_all" on context_documents for all using (auth.role() = 'authenticated');
