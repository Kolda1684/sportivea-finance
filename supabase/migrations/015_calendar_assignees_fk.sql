-- Fix calendar_event_assignees.user_id FK: point to profiles instead of auth.users
-- This enables the PostgREST embedded join: assignees(profile:profiles(...))

alter table calendar_event_assignees
  drop constraint if exists calendar_event_assignees_user_id_fkey;

alter table calendar_event_assignees
  add constraint calendar_event_assignees_user_id_fkey
  foreign key (user_id) references profiles(id) on delete cascade;
