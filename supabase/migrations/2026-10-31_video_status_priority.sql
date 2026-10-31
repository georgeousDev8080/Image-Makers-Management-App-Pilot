-- =====================================================================
--  Φύλλο Dimitris: ξεχωριστή «Κατάσταση Βίντεο» (video_status).
--  Το editing_status (στο Excel «Κατάσταση editing», στο Dimitris
--  «Προτεραιότητα») κρατά τις αρχικές επιλογές και αλλάζει αυτόματα:
--    φωτογραφίες → «Αλλαγές»                 : — → Να γίνει
--    φωτογραφίες → «Εκτύπωση στο εργαστήριο» : SOS (υπολογίζεται στην εφαρμογή)
--    βίντεο «έτοιμο» ΚΑΙ «παραδόθηκε στο μαγαζί» : → Ολοκληρώθηκε (φεύγει το SOS)
-- =====================================================================
update public.events set editing_status = 'in_progress' where editing_status = 'export';
alter table public.events drop constraint if exists events_editing_status_check;
alter table public.events add constraint events_editing_status_check
  check (editing_status in ('none', 'todo', 'in_progress', 'done'));

alter table public.events add column if not exists video_status text not null default 'not_ready';
alter table public.events drop constraint if exists events_video_status_check;
alter table public.events add constraint events_video_status_check
  check (video_status in ('not_ready', 'in_progress', 'export', 'ready'));

create or replace function private.events_before()
returns trigger language plpgsql set search_path = public, private as $$
begin
  if new.photo_status = 'samples_pickup' then new.photo_status := 'samples_waiting'; end if;
  if tg_op = 'INSERT' then
    new.photo_status_at := coalesce(new.photo_status_at, now());
    new.editing_status_at := coalesce(new.editing_status_at, now());
    return new;
  end if;
  if new.photo_status is distinct from old.photo_status
     and new.photo_status = 'changes' and new.editing_status = 'none' then
    new.editing_status := 'todo';
  end if;
  -- βίντεο έτοιμο και παραδομένο στο μαγαζί → editing «Ολοκληρώθηκε» (φεύγει από το SOS)
  if new.video_status = 'ready' and new.shop_status = 'delivered'
     and (new.video_status is distinct from old.video_status or new.shop_status is distinct from old.shop_status)
     and new.editing_status <> 'done' then
    new.editing_status := 'done';
  end if;
  if new.photo_status is distinct from old.photo_status then new.photo_status_at := now(); end if;
  if new.editing_status is distinct from old.editing_status then new.editing_status_at := now(); end if;
  return new;
end $$;
