-- Vedlejší náklady (půjčovné, doprava, materiál) často patří ke konkrétnímu
-- projektu. Bez tohohle počítaly projekty jen práci z Notionu a zisk vycházel
-- vyšší, než ve skutečnosti je.
--
-- Přijaté faktury sem schválně nepatří: faktura od člena týmu je úhrada jeho
-- tasků, které už se do nákladů počítají přes variable_costs.

alter table extra_costs
  add column if not exists project_id uuid references projects(id) on delete set null;

create index if not exists extra_costs_project_id_idx
  on extra_costs (project_id) where project_id is not null;
