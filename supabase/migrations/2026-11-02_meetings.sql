-- =====================================================================
--  Meetings: ημερομηνία, ώρα, τοποθεσία, συμμετέχοντες, λόγοι
--  Οι έτοιμοι λόγοι βρίσκονται στο app_settings('meeting_reasons') και
--  οι διαχειριστές τους προσθέτουν / αλλάζουν / αφαιρούν.
--  Κάθε συμμετέχων ειδοποιείται όταν δημιουργείται, αλλάζει ή ακυρώνεται.
-- =====================================================================
create table if not exists public.meetings (
  id           uuid primary key default gen_random_uuid(),
  day          date not null,
  start_time   time not null,
  location     text check (location is null or length(location) <= 300),
  reasons      text[] not null default '{}',
  notes        text check (notes is null or length(notes) <= 2000),
  participants uuid[] not null default '{}',
  created_by   uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint meetings_people check (cardinality(participants) between 1 and 60),
  constraint meetings_reasons check (cardinality(reasons) between 1 and 30)
);
create index if not exists meetings_day_idx on public.meetings(day);
alter table public.meetings enable row level security;
drop policy if exists meetings_select on public.meetings;
create policy meetings_select on public.meetings for select to authenticated
  using (public.is_admin() or auth.uid() = any(participants));
drop policy if exists meetings_admin on public.meetings;
create policy meetings_admin on public.meetings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
revoke all on public.meetings from anon;
grant select, insert, update, delete on public.meetings to authenticated;

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'meetings') then
    alter publication supabase_realtime add table public.meetings;
  end if;
end $$;

insert into public.app_settings(key, value)
values ('meeting_reasons', '["Προγραμματισμός εβδομάδας","Ενημέρωση για εκδήλωση","Αξιολόγηση / feedback","Εκπαίδευση / εξοπλισμός","Οργάνωση μοντάζ & παραδόσεων","Οικονομικά"]'::jsonb)
on conflict (key) do nothing;

create or replace function private.meeting_line(m public.meetings)
returns text language sql stable set search_path = public, private as $$
  select concat_ws(' · ', private.fmt_date(m.day), to_char(m.start_time, 'HH24:MI'), nullif(trim(m.location), ''))
$$;

create or replace function private.meeting_after()
returns trigger language plpgsql security definer set search_path = public, private as $$
declare v_body text;
begin
  if tg_op = 'DELETE' then
    if old.day < (now() at time zone 'Europe/Athens')::date then return old; end if;
    insert into public.notifications(user_id, kind, title, body, link)
    select pr.id, 'meeting', private.tr(pr.lang, 'Ακυρώθηκε meeting', 'Meeting cancelled'),
           private.meeting_line(old) || E'\n' || array_to_string(old.reasons, ', '), '#/calendar'
      from public.profiles pr where pr.id = any(old.participants) and pr.active and pr.id is distinct from auth.uid();
    return old;
  end if;
  if new.day < (now() at time zone 'Europe/Athens')::date then return new; end if;
  v_body := private.meeting_line(new) || E'\n' || array_to_string(new.reasons, ', ') || coalesce(E'\n' || nullif(trim(new.notes), ''), '');
  if tg_op = 'INSERT' then
    insert into public.notifications(user_id, kind, title, body, link)
    select pr.id, 'meeting', private.tr(pr.lang, 'Νέο meeting', 'New meeting'), v_body, '#/calendar?meeting=' || new.id
      from public.profiles pr where pr.id = any(new.participants) and pr.active and pr.id is distinct from auth.uid();
    return new;
  end if;
  -- UPDATE: όσοι προστέθηκαν → «Νέο meeting» · όσοι έμειναν → «Αλλαγή» (μόνο αν άλλαξε κάτι ουσιαστικό) · όσοι αφαιρέθηκαν → «Δεν σας αφορά πλέον»
  insert into public.notifications(user_id, kind, title, body, link)
  select pr.id, 'meeting', private.tr(pr.lang, 'Νέο meeting', 'New meeting'), v_body, '#/calendar?meeting=' || new.id
    from public.profiles pr where pr.id = any(new.participants) and not (pr.id = any(old.participants)) and pr.active and pr.id is distinct from auth.uid();
  if new.day is distinct from old.day or new.start_time is distinct from old.start_time or new.location is distinct from old.location
     or new.reasons is distinct from old.reasons or new.notes is distinct from old.notes then
    insert into public.notifications(user_id, kind, title, body, link)
    select pr.id, 'meeting', private.tr(pr.lang, 'Αλλαγή στο meeting', 'Meeting changed'), v_body, '#/calendar?meeting=' || new.id
      from public.profiles pr where pr.id = any(new.participants) and pr.id = any(old.participants) and pr.active and pr.id is distinct from auth.uid();
  end if;
  insert into public.notifications(user_id, kind, title, body, link)
  select pr.id, 'meeting', private.tr(pr.lang, 'Δεν συμμετέχετε πλέον σε meeting', 'You are no longer in a meeting'), private.meeting_line(old), '#/calendar'
    from public.profiles pr where pr.id = any(old.participants) and not (pr.id = any(new.participants)) and pr.active and pr.id is distinct from auth.uid();
  return new;
end $$;
drop trigger if exists meeting_after on public.meetings;
create trigger meeting_after after insert or update or delete on public.meetings
  for each row execute function private.meeting_after();

create or replace function private.meeting_before()
returns trigger language plpgsql set search_path = public, private as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists meeting_before on public.meetings;
create trigger meeting_before before update on public.meetings
  for each row execute function private.meeting_before();
