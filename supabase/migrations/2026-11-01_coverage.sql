-- =====================================================================
--  Κάλυψη εκδήλωσης: φωτογραφία & βίντεο / μόνο φωτογραφία / μόνο βίντεο
--  (μόνο φωτογραφία → χωρίς αυτοματισμούς editing/SOS βίντεο)
-- =====================================================================
alter table public.events add column if not exists coverage text not null default 'both';
alter table public.events drop constraint if exists events_coverage_check;
alter table public.events add constraint events_coverage_check check (coverage in ('both', 'photo', 'video'));

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
     and new.photo_status = 'changes' and new.editing_status = 'none' and new.coverage <> 'photo' then
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

create or replace function private.events_after()
returns trigger language plpgsql security definer set search_path = public, private as $$
declare
  v_changes_el text[] := '{}'; v_changes_en text[] := '{}';
  v_label text;
begin
  if tg_op = 'INSERT' then
    insert into public.event_finance(event_id) values (new.id) on conflict do nothing;
    perform public.run_automations(new.id);
    return new;
  end if;

  v_label := private.event_label(new.id);

  if new.event_date is distinct from old.event_date then
    v_changes_el := v_changes_el || ('Ημερομηνία: ' || private.fmt_date(new.event_date));
    v_changes_en := v_changes_en || ('Date: ' || private.fmt_date(new.event_date)); end if;
  if new.event_time is distinct from old.event_time then
    v_changes_el := v_changes_el || ('Ώρα: ' || coalesce(to_char(new.event_time, 'HH24:MI'), '—'));
    v_changes_en := v_changes_en || ('Time: ' || coalesce(to_char(new.event_time, 'HH24:MI'), '—')); end if;
  if new.church_location is distinct from old.church_location or new.church_geo is distinct from old.church_geo then
    v_changes_el := v_changes_el || ('Εκκλησία: ' || coalesce(new.church_location, '—'));
    v_changes_en := v_changes_en || ('Church: ' || coalesce(new.church_location, '—')); end if;
  if new.bride_house is distinct from old.bride_house or new.bride_geo is distinct from old.bride_geo then
    v_changes_el := v_changes_el || ('Σπίτι νύφης: ' || coalesce(new.bride_house, '—'));
    v_changes_en := v_changes_en || ('Bride home: ' || coalesce(new.bride_house, '—')); end if;
  if new.groom_house is distinct from old.groom_house or new.groom_geo is distinct from old.groom_geo then
    v_changes_el := v_changes_el || ('Σπίτι γαμπρού: ' || coalesce(new.groom_house, '—'));
    v_changes_en := v_changes_en || ('Groom home: ' || coalesce(new.groom_house, '—')); end if;
  if new.reception_location is distinct from old.reception_location or new.reception_geo is distinct from old.reception_geo then
    v_changes_el := v_changes_el || ('Δεξίωση: ' || coalesce(new.reception_location, '—'));
    v_changes_en := v_changes_en || ('Reception: ' || coalesce(new.reception_location, '—')); end if;
  if new.resolution is distinct from old.resolution then
    v_changes_el := v_changes_el || ('Ανάλυση: ' || coalesce(new.resolution, '—'));
    v_changes_en := v_changes_en || ('Resolution: ' || coalesce(new.resolution, '—')); end if;
  if new.coverage is distinct from old.coverage then
    v_changes_el := v_changes_el || ('Κάλυψη: ' || case new.coverage when 'photo' then 'Μόνο φωτογραφία' when 'video' then 'Μόνο βίντεο' else 'Φωτογραφία & βίντεο' end);
    v_changes_en := v_changes_en || ('Coverage: ' || case new.coverage when 'photo' then 'Photo only' when 'video' then 'Video only' else 'Photo & video' end); end if;
  if new.category is distinct from old.category then
    v_changes_el := v_changes_el || 'Κατηγορία'::text; v_changes_en := v_changes_en || 'Category'::text; end if;
  if new.notes is distinct from old.notes then
    v_changes_el := v_changes_el || 'Σημειώσεις'::text; v_changes_en := v_changes_en || 'Notes'::text; end if;
  if new.offer_path is distinct from old.offer_path or new.offer_data is distinct from old.offer_data then
    v_changes_el := v_changes_el || 'Λεπτομέρειες πακέτου'::text; v_changes_en := v_changes_en || 'Package details'::text; end if;
  if new.customer_id is distinct from old.customer_id then
    v_changes_el := v_changes_el || 'Πελάτης'::text; v_changes_en := v_changes_en || 'Customer'::text; end if;

  if new.status = 'cancelled' and old.status <> 'cancelled' then
    insert into public.notifications(user_id, kind, title, body, link)
    select pr.id, 'event', private.tr(pr.lang, 'Ακύρωση εκδήλωσης', 'Event cancelled'), v_label, '#/event/' || new.id
      from public.event_crew ec join public.profiles pr on pr.id = ec.user_id
     where ec.event_id = new.id and pr.active and pr.id is distinct from auth.uid();
  elsif cardinality(v_changes_el) > 0 then
    insert into public.notifications(user_id, kind, title, body, link)
    select pr.id, 'event',
           private.tr(pr.lang, 'Αλλαγή σε εκδήλωσή σας', 'Change in your event'),
           v_label || E'\n' || array_to_string(case when pr.lang = 'en' then v_changes_en else v_changes_el end, ' · '),
           '#/event/' || new.id
      from public.event_crew ec join public.profiles pr on pr.id = ec.user_id
     where ec.event_id = new.id and pr.active and pr.id is distinct from auth.uid();
  end if;

  if new.photo_status is distinct from old.photo_status and new.photo_status = 'changes'
     and new.editing_status = 'todo' and old.editing_status <> 'todo' then
    perform private.notify_admins('editing', 'Editing: Να γίνει', 'Editing: To do',
      v_label || ' · Οι φωτογραφίες πέρασαν σε «Αλλαγές»', v_label || ' · Photos moved to “Changes”',
      '#/sheets/mitsos', true);
  end if;
  if new.photo_status is distinct from old.photo_status and new.photo_status = 'lab'
     and new.editing_status <> 'done' and new.coverage <> 'photo' then
    perform private.notify_admins('sos', '🔴 SOS · Το album πάει για εκτύπωση', '🔴 SOS · Album sent to print',
      v_label || ' · Το video πρέπει να ολοκληρωθεί', v_label || ' · The video must be finished',
      '#/sheets/mitsos', true);
  end if;

  if new.event_date is distinct from old.event_date then
    perform public.run_automations(new.id);
  end if;
  return new;
end $$;
