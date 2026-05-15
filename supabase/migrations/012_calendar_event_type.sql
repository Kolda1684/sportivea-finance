-- Typ eventu v kalendáři (natáčení, dovolená, workshop, jiné)
alter table calendar_events
  add column if not exists event_type text not null default 'jine'
  check (event_type in ('nataceni', 'dovolena', 'workshop', 'jine'));
