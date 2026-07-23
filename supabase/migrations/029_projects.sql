-- Projekty: zisková analýza napříč klienty (např. "WTA Šťavnice")
-- Příjmy se přiřazují podle klíčových slov v income.project_name / note,
-- náklady podle klíčových slov v názvu tasku z Notionu (vč. cesťáků).

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  client text,
  keywords text not null,          -- čárkou oddělená klíčová slova ("WTA, Šťavnice")
  date_from date,
  date_to date,
  active boolean not null default true,
  created_at timestamptz default now()
);

alter table projects enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'projects' and policyname = 'admin_all') then
    create policy "admin_all" on projects for all
      using (auth.role() = 'authenticated');
  end if;
end $$;
