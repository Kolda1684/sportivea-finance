-- Mapování zaměstnanec → Notion Tasks DB (každý člen týmu má svojí DB v Notionu)

create table if not exists notion_employee_databases (
  id uuid primary key default gen_random_uuid(),
  team_member text not null,
  notion_database_id text not null,
  notes text,
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint notion_employee_databases_db_unique unique (notion_database_id),
  constraint notion_employee_databases_member_unique unique (team_member)
);

alter table notion_employee_databases enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'notion_employee_databases' and policyname = 'admin_all') then
    create policy "admin_all" on notion_employee_databases for all
      using (auth.role() = 'authenticated');
  end if;
end $$;

-- Pomocná view pro UI: jednotná konfigurace Notion syncu (Companies + zaměstnanci)
create or replace view notion_sync_config as
  select 'employee' as kind, team_member as label, notion_database_id, active, notes
  from notion_employee_databases;
