-- =====================================================================
--  Ειδοποιήσεις συνεργείου: όχι για περασμένες εκδηλώσεις ή ανενεργούς
--  (π.χ. επαναφορά αντιγράφου ή διόρθωση συνεργείου σε παλιά εκδήλωση)
-- =====================================================================
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
          v_label || ' · ' || coalesce(to_char(e.event_time, 'HH24:MI'), '') || ' · ' ||
            coalesce(e.church_location, '') || ' · ' ||
            private.tr(v_lang, case new.duty when 'video' then 'Βίντεο' else 'Φωτογραφία' end,
                                case new.duty when 'video' then 'Video' else 'Photo' end),
          '#/event/' || new.event_id);
  return new;
end $$;

create or replace function private.crew_after_remove()
returns trigger language plpgsql security definer set search_path = public, private as $$
declare v_lang text;
begin
  -- δεν ειδοποιούμε λογαριασμό που διαγράφεται/είναι ανενεργός, ούτε για περασμένη εκδήλωση
  if exists (select 1 from public.events where id = old.event_id
              and event_date >= (now() at time zone 'Europe/Athens')::date)
     and exists (select 1 from public.profiles where id = old.user_id and active) then
    select lang into v_lang from public.profiles where id = old.user_id;
    insert into public.notifications(user_id, kind, title, body, link)
    values (old.user_id, 'assignment',
            private.tr(v_lang, 'Αφαιρεθήκατε από εκδήλωση', 'You were removed from an event'),
            private.event_label(old.event_id), '#/calendar');
  end if;
  return old;
end $$;
