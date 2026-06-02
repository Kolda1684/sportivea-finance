-- Rozšíření povolených hodnot status v calendar_events
-- Přidává: neni_potvrzeno, ceka_potvrzeni, potvrzeno_lidi

ALTER TABLE calendar_events DROP CONSTRAINT IF EXISTS calendar_events_status_check;

ALTER TABLE calendar_events
  ADD CONSTRAINT calendar_events_status_check
  CHECK (status IN ('neni_potvrzeno', 'ceka_potvrzeni', 'potvrzeno_lidi', 'potvrzeno', 'planovano', 'zruseno'));

ALTER TABLE calendar_events ALTER COLUMN status SET DEFAULT 'neni_potvrzeno';
