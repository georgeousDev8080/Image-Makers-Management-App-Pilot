-- =====================================================================
--  1 ή 2 συνεργεία ανά εκδήλωση, αρμοδιότητες συνεργείου, κείμενο
--  ανάθεσης ανά μέλος · Δηλώσεις απουσίας (μη διαθεσιμότητα)
-- =====================================================================
alter table public.events add column if not exists crew_mode text not null default 'single';
alter table public.events drop constraint if exists events_crew_mode_check;
alter table public.events add constraint events_crew_mode_check check (crew_mode in ('single', 'double'));

alter table public.event_crew add column if not exists team smallint;
alter table public.event_crew add column if not exists tasks text[] not null default '{}';
alter table public.event_crew add column if not exists brief text;
alter table public.event_crew drop constraint if exists event_crew_team_check;
alter table public.event_crew add constraint event_crew_team_check check (team is null or team in (1, 2));
alter table public.event_crew drop constraint if exists event_crew_tasks_check;
alter table public.event_crew add constraint event_crew_tasks_check check (tasks <@ array['houses', 'church', 'reception', 'drone']::text[]);
alter table public.event_crew drop constraint if exists event_crew_brief_len;
alter table public.event_crew add constraint event_crew_brief_len check (brief is null or length(brief) <= 4000);

-- Ειδοποίηση ανάθεσης: με το κείμενο ανάθεσης (συνεργείο, αρμοδιότητες, ποιοι είναι μαζί)
create or replace function private.crew_after_insert()
returns trigger language plpgsql security definer set search_path = public, private as $$
declare v_lang text; v_active boolean; v_label text; e public.events;
begin
  select lang, active into v_lang, v_active from public.profiles where id = new.user_id;
  select * into e from public.events where id = new.event_id;
  if not coalesce(v_active, false) or e.id is null
     or e.event_date < (now() at time zone 'Europe/Athens')::date then
    return new;
  end if;
  v_label := private.event_label(new.event_id);
  insert into public.notifications(user_id, kind, title, body, link)
  values (new.user_id, 'assignment',
          private.tr(v_lang, 'Σας ανατέθηκε εκδήλωση', 'You were assigned to an event'),
          case when nullif(trim(new.brief), '') is not null then v_label || E'\n' || new.brief
               else v_label || ' · ' || coalesce(to_char(e.event_time, 'HH24:MI'), '') || ' · ' ||
                    coalesce(e.church_location, '') || ' · ' ||
                    private.tr(v_lang, case new.duty when 'video' then 'Βίντεο' when 'drone' then 'Drone' else 'Φωτογραφία' end,
                                       case new.duty when 'video' then 'Video' when 'drone' then 'Drone' else 'Photo' end) end,
          '#/event/' || new.event_id);
  return new;
end $$;

-- Αλλαγή ανάθεσης (συνεργείο / αρμοδιότητες / κείμενο) → ειδοποίηση στο μέλος
create or replace function private.crew_after_update()
returns trigger language plpgsql security definer set search_path = public, private as $$
declare v_lang text; v_active boolean; e public.events;
begin
  if new.team is not distinct from old.team and new.tasks is not distinct from old.tasks
     and new.brief is not distinct from old.brief and new.duty is not distinct from old.duty then
    return new;
  end if;
  select lang, active into v_lang, v_active from public.profiles where id = new.user_id;
  select * into e from public.events where id = new.event_id;
  if not coalesce(v_active, false) or e.id is null or e.status = 'cancelled'
     or e.event_date < (now() at time zone 'Europe/Athens')::date then
    return new;
  end if;
  insert into public.notifications(user_id, kind, title, body, link)
  values (new.user_id, 'assignment',
          private.tr(v_lang, 'Αλλαγή στην ανάθεσή σας', 'Your assignment changed'),
          private.event_label(new.event_id) || coalesce(E'\n' || nullif(trim(new.brief), ''), ''),
          '#/event/' || new.event_id);
  return new;
end $$;
drop trigger if exists crew_after_update on public.event_crew;
create trigger crew_after_update after update on public.event_crew for each row execute function private.crew_after_update();

-- ---------------------------------------------------------------------
--  Δηλώσεις απουσίας
-- ---------------------------------------------------------------------
create table if not exists public.absences (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  day         date not null,
  start_time  time,
  end_time    time,
  note        text,
  created_by  uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  constraint absences_times_check check ((start_time is null and end_time is null) or (start_time is not null and end_time is not null and end_time > start_time)),
  constraint absences_note_len check (note is null or length(note) <= 300)
);
create index if not exists absences_day_idx on public.absences(day);
create index if not exists absences_user_day_idx on public.absences(user_id, day);
alter table public.absences enable row level security;
drop policy if exists absences_select on public.absences;
create policy absences_select on public.absences for select to authenticated
  using (public.is_admin() or user_id = auth.uid());
drop policy if exists absences_insert on public.absences;
create policy absences_insert on public.absences for insert to authenticated
  with check (public.has_role() and (public.is_admin() or user_id = auth.uid()));
drop policy if exists absences_update on public.absences;
create policy absences_update on public.absences for update to authenticated
  using (public.is_admin() or user_id = auth.uid()) with check (public.is_admin() or user_id = auth.uid());
drop policy if exists absences_delete on public.absences;
create policy absences_delete on public.absences for delete to authenticated
  using (public.is_admin() or user_id = auth.uid());
revoke all on public.absences from anon;
grant select, insert, update, delete on public.absences to authenticated;

-- Όταν μέλος του συνεργείου δηλώνει απουσία → ειδοποίηση στους διαχειριστές
create or replace function private.absence_after_insert()
returns trigger language plpgsql security definer set search_path = public, private as $$
declare v_name text; v_when text;
begin
  if public.is_admin() then return new; end if;
  select coalesce(nullif(full_name, ''), email) into v_name from public.profiles where id = new.user_id;
  v_when := private.fmt_date(new.day) || case when new.start_time is null then ' · όλη την ημέρα'
             else ' · ' || to_char(new.start_time, 'HH24:MI') || '–' || to_char(new.end_time, 'HH24:MI') end;
  perform private.notify_admins('absence', 'Δήλωση απουσίας: ' || coalesce(v_name, ''), 'Absence: ' || coalesce(v_name, ''),
    v_when || coalesce(' · ' || nullif(trim(new.note), ''), ''), v_when || coalesce(' · ' || nullif(trim(new.note), ''), ''), '#/calendar');
  return new;
end $$;
drop trigger if exists absence_after_insert on public.absences;
create trigger absence_after_insert after insert on public.absences for each row execute function private.absence_after_insert();

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'absences') then
    alter publication supabase_realtime add table public.absences;
  end if;
end $$;
