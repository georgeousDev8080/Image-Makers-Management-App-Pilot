-- =====================================================================
--  1) Προγραμματισμένα ραντεβού (status = 'scheduled', ώρα ραντεβού)
--  2) Next day / Ευχολόγιο: συνδεδεμένα με μια εκδήλωση (event_sessions)
-- =====================================================================

-- 1) Ραντεβού
alter table public.appointments add column if not exists appt_time time;
alter table public.appointments drop constraint if exists appointments_status_check;
alter table public.appointments add constraint appointments_status_check
  check (status in ('scheduled','pending','confirmed','rejected'));

-- 2) Next day / Ευχολόγιο
create table if not exists public.event_sessions (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events(id) on delete cascade,
  kind        text not null check (kind in ('next_day','blessing')),
  day         date not null,
  start_time  time,
  location    text,
  notes       text,
  created_by  uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint event_sessions_location_len check (location is null or length(location) <= 300),
  constraint event_sessions_notes_len check (notes is null or length(notes) <= 2000)
);
create index if not exists event_sessions_event_idx on public.event_sessions(event_id);
create index if not exists event_sessions_day_idx on public.event_sessions(day);
alter table public.event_sessions enable row level security;
drop policy if exists event_sessions_select on public.event_sessions;
create policy event_sessions_select on public.event_sessions for select to authenticated
  using (public.is_admin() or public.is_on_event(event_id));
drop policy if exists event_sessions_admin on public.event_sessions;
create policy event_sessions_admin on public.event_sessions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
revoke all on public.event_sessions from anon;
grant select, insert, update, delete on public.event_sessions to authenticated;

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'event_sessions') then
    alter publication supabase_realtime add table public.event_sessions;
  end if;
end $$;

-- Ειδοποίηση του συνεργείου της εκδήλωσης όταν προστίθεται ή αλλάζει Next day / Ευχολόγιο
create or replace function private.event_session_after()
returns trigger language plpgsql security definer set search_path = public, private as $$
declare e public.events;
begin
  if tg_op = 'UPDATE' and new.day is not distinct from old.day and new.start_time is not distinct from old.start_time
     and new.location is not distinct from old.location and new.event_id is not distinct from old.event_id then
    return new;
  end if;
  select * into e from public.events where id = new.event_id;
  if e.id is null or e.status = 'cancelled' or new.day < (now() at time zone 'Europe/Athens')::date then return new; end if;
  insert into public.notifications(user_id, kind, title, body, link)
  select pr.id, 'assignment',
         case when tg_op = 'INSERT'
              then private.tr(pr.lang, case new.kind when 'next_day' then 'Νέο Next day' else 'Νέο Ευχολόγιο' end,
                                       case new.kind when 'next_day' then 'New Next day' else 'New blessing' end)
              else private.tr(pr.lang, case new.kind when 'next_day' then 'Αλλαγή στο Next day' else 'Αλλαγή στο Ευχολόγιο' end,
                                       case new.kind when 'next_day' then 'Next day changed' else 'Blessing changed' end) end,
         concat_ws(' · ',
           private.tr(pr.lang, case new.kind when 'next_day' then 'Next day' else 'Ευχολόγιο' end, case new.kind when 'next_day' then 'Next day' else 'Blessing' end),
           nullif(coalesce(nullif(trim(new.location), ''), e.church_location), ''),
           private.fmt_date(new.day),
           coalesce(to_char(new.start_time, 'HH24:MI'), private.tr(pr.lang, 'ώρα: δεν έχει οριστεί', 'time: not set yet')))
           || E'\n' || coalesce(private.event_label(e.id), ''),
         '#/event/' || e.id
    from public.event_crew ec join public.profiles pr on pr.id = ec.user_id
   where ec.event_id = e.id and pr.active and pr.id is distinct from auth.uid();
  return new;
end $$;
drop trigger if exists event_session_after on public.event_sessions;
create trigger event_session_after after insert or update on public.event_sessions
  for each row execute function private.event_session_after();

create or replace function private.event_session_before()
returns trigger language plpgsql set search_path = public, private as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists event_session_before on public.event_sessions;
create trigger event_session_before before update on public.event_sessions
  for each row execute function private.event_session_before();
