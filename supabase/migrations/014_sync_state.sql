-- Tracks the last successful sync time per integration key.
-- Used by incremental sync to pass updated_since to Fakturoid API.
create table if not exists sync_state (
  key text primary key,
  synced_at timestamptz not null,
  updated_at timestamptz default now()
);

alter table sync_state enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'sync_state' and policyname = 'authenticated_all'
  ) then
    create policy "authenticated_all" on sync_state for all using (auth.role() = 'authenticated');
  end if;
end;
$$;
