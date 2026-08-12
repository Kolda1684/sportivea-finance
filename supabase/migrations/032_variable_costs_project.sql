-- Ruční přiřazení tasku k projektu (doplněk ke klíčovým slovům).
-- Klíčová slova zůstávají jako našeptávač; ruční přiřazení má přednost:
--   project_id = projekt  → task se počítá do projektu vždy
--   project_id = jiný     → task se do projektu nepočítá, ani když sedí klíčové slovo
--   project_id = null     → rozhodují klíčová slova

alter table variable_costs
  add column if not exists project_id uuid references projects(id) on delete set null;

create index if not exists variable_costs_project_id_idx
  on variable_costs (project_id) where project_id is not null;
