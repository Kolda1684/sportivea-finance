-- ============================================================
-- Sportivea OS – Migrace 010
-- Přidává: profiles, tasks, calendar, CRM (companies, contacts)
-- ============================================================

-- ============================================================
-- PROFILY UŽIVATELŮ (musí být před get_my_role funkcí)
-- ============================================================
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  email text,
  role text not null default 'editor' check (role in ('admin', 'editor')),
  created_at timestamptz default now()
);

-- Pomocná funkce pro získání role (security definer = přeskakuje RLS)
create or replace function get_my_role()
returns text
language sql
security definer
stable
as $$
  select role from profiles where id = auth.uid()
$$;

alter table profiles enable row level security;

create policy "Profil: vlastní čtení" on profiles
  for select using (auth.uid() = id);

create policy "Profil: admin vše" on profiles
  for all using (get_my_role() = 'admin');

-- ============================================================
-- FIRMY (CRM)
-- ============================================================
create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  ico text,
  website text,
  note text,
  created_at timestamptz default now()
);

alter table companies enable row level security;
create policy "Firmy: admin vše" on companies
  for all using (get_my_role() = 'admin');

-- ============================================================
-- KONTAKTY (CRM)
-- ============================================================
create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  phone text,
  company_id uuid references companies(id) on delete set null,
  note text,
  created_at timestamptz default now()
);

alter table contacts enable row level security;
create policy "Kontakty: admin vše" on contacts
  for all using (get_my_role() = 'admin');

-- ============================================================
-- TASKY
-- ============================================================
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  deadline date,
  status text not null default 'zadano'
    check (status in ('zadano', 'v_procesu', 'na_checku', 'hotovo')),
  client text,
  company_id uuid references companies(id) on delete set null,
  hours numeric default 0,
  minutes integer default 0,
  reward numeric,
  one_time_reward numeric,
  task_type text,
  month text,
  assignee_id uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  variable_cost_id uuid references variable_costs(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table tasks enable row level security;

create policy "Tasky: admin vše" on tasks
  for all using (get_my_role() = 'admin');

create policy "Tasky: editor čte vlastní" on tasks
  for select using (assignee_id = auth.uid());

create policy "Tasky: editor upravuje vlastní" on tasks
  for update using (assignee_id = auth.uid())
  with check (assignee_id = auth.uid());

create index if not exists idx_tasks_assignee on tasks(assignee_id);
create index if not exists idx_tasks_month on tasks(month);
create index if not exists idx_tasks_status on tasks(status);
create index if not exists idx_tasks_deadline on tasks(deadline);

-- ============================================================
-- KOMENTÁŘE K TASKŮM
-- ============================================================
create table if not exists task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  author_name text,
  content text not null,
  created_at timestamptz default now()
);

alter table task_comments enable row level security;

create policy "Komentáře: přístup k vlastním taskům" on task_comments
  for all using (
    exists (
      select 1 from tasks t where t.id = task_id
      and (t.assignee_id = auth.uid() or get_my_role() = 'admin')
    )
  );

-- ============================================================
-- PŘÍLOHY K TASKŮM
-- ============================================================
create table if not exists task_attachments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  file_name text not null,
  file_url text not null,
  file_size bigint,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now()
);

alter table task_attachments enable row level security;

create policy "Přílohy: přístup k vlastním taskům" on task_attachments
  for all using (
    exists (
      select 1 from tasks t where t.id = task_id
      and (t.assignee_id = auth.uid() or get_my_role() = 'admin')
    )
  );

-- ============================================================
-- NATÁČECÍ KALENDÁŘ
-- ============================================================
create table if not exists calendar_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  start_date date not null,
  end_date date,
  client text,
  company_id uuid references companies(id) on delete set null,
  status text default 'planovano'
    check (status in ('planovano', 'potvrzeno', 'zruseno')),
  location text,
  description text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now()
);

create table if not exists calendar_event_assignees (
  event_id uuid not null references calendar_events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (event_id, user_id)
);

alter table calendar_events enable row level security;
create policy "Kalendář: všichni čtou" on calendar_events
  for select using (auth.uid() is not null);
create policy "Kalendář: admin píše" on calendar_events
  for all using (get_my_role() = 'admin');

alter table calendar_event_assignees enable row level security;
create policy "Kalendář assignees: všichni čtou" on calendar_event_assignees
  for select using (auth.uid() is not null);
create policy "Kalendář assignees: admin píše" on calendar_event_assignees
  for all using (get_my_role() = 'admin');

-- ============================================================
-- ROZŠÍŘENÍ variable_costs o task_id
-- ============================================================
alter table variable_costs add column if not exists
  task_id uuid references tasks(id) on delete set null;
