-- Notion sync: Tasks + Companies (read-only, webhook + denní cron)

alter table companies
  add column if not exists notion_page_id text,
  add column if not exists notion_last_synced timestamptz,
  add column if not exists status text default 'active',
  add column if not exists primary_contact_name text;

alter table tasks
  add column if not exists notion_page_id text,
  add column if not exists notion_last_synced timestamptz;

-- Unique constrainty (nullable, takže existující řádky bez notion_page_id zůstanou)
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'companies_notion_page_id_key') then
    alter table companies add constraint companies_notion_page_id_key unique (notion_page_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tasks_notion_page_id_key') then
    alter table tasks add constraint tasks_notion_page_id_key unique (notion_page_id);
  end if;
end $$;

create index if not exists idx_companies_notion on companies(notion_page_id) where notion_page_id is not null;
create index if not exists idx_tasks_notion on tasks(notion_page_id) where notion_page_id is not null;

-- Tabulka pro dedup webhook eventů (Notion občas posílá duplikáty)
create table if not exists notion_webhook_events (
  id text primary key,           -- event ID z Notion payload
  event_type text not null,
  entity_id text,                -- ID stránky/DB
  received_at timestamptz default now()
);

create index if not exists idx_notion_events_received on notion_webhook_events(received_at desc);

-- Cleanup starých event záznamů (>30 dnů) — manuálně nebo přes cron
