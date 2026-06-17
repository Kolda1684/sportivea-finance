-- Notion Tasks → variable_costs (přesun mapování z tasks na variable_costs)

alter table variable_costs
  add column if not exists notion_page_id text,
  add column if not exists notion_last_synced timestamptz;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'variable_costs_notion_page_id_key') then
    alter table variable_costs add constraint variable_costs_notion_page_id_key unique (notion_page_id);
  end if;
end $$;

create index if not exists idx_variable_costs_notion on variable_costs(notion_page_id) where notion_page_id is not null;
