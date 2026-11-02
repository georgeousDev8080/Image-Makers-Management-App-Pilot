-- =====================================================================
--  «Άλλο» στο ημερολόγιο: ελεύθερη καταχώρηση (τίτλος + προαιρετικά ώρα,
--  τοποθεσία, σημειώσεις). Ορατή σε όλη την ομάδα ή μόνο στους διαχειριστές.
-- =====================================================================
create table if not exists public.calendar_notes (
  id           uuid primary key default gen_random_uuid(),
  day          date not null,
  start_time   time,
  title        text not null check (length(trim(title)) between 1 and 200),
  location     text check (location is null or length(location) <= 300),
  notes        text check (notes is null or length(notes) <= 2000),
  team_visible boolean not null default true,
  created_by   uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists calendar_notes_day_idx on public.calendar_notes(day);
alter table public.calendar_notes enable row level security;
drop policy if exists calendar_notes_select on public.calendar_notes;
create policy calendar_notes_select on public.calendar_notes for select to authenticated
  using (public.is_admin() or (team_visible and public.has_role()));
drop policy if exists calendar_notes_admin on public.calendar_notes;
create policy calendar_notes_admin on public.calendar_notes for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
revoke all on public.calendar_notes from anon;
grant select, insert, update, delete on public.calendar_notes to authenticated;
create or replace function private.calendar_notes_before()
returns trigger language plpgsql set search_path = public, private as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists calendar_notes_before on public.calendar_notes;
create trigger calendar_notes_before before update on public.calendar_notes
  for each row execute function private.calendar_notes_before();
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'calendar_notes') then
    alter publication supabase_realtime add table public.calendar_notes;
  end if;
end $$;
