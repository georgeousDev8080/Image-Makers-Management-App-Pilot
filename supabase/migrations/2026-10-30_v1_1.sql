-- =====================================================================
--  v1.1 · Σπίτι νύφης / γαμπρού χωριστά, pin χάρτη, Drone στο συνεργείο
-- =====================================================================
alter table public.events add column if not exists bride_house text;
alter table public.events add column if not exists groom_house text;
alter table public.events add column if not exists church_geo text;
alter table public.events add column if not exists bride_geo text;
alter table public.events add column if not exists groom_geo text;
alter table public.events add column if not exists reception_geo text;
alter table public.events drop constraint if exists events_geo_check;
alter table public.events add constraint events_geo_check check (
  (church_geo is null or church_geo ~ '^-?[0-9]{1,2}(\.[0-9]+)?,-?[0-9]{1,3}(\.[0-9]+)?$') and
  (bride_geo is null or bride_geo ~ '^-?[0-9]{1,2}(\.[0-9]+)?,-?[0-9]{1,3}(\.[0-9]+)?$') and
  (groom_geo is null or groom_geo ~ '^-?[0-9]{1,2}(\.[0-9]+)?,-?[0-9]{1,3}(\.[0-9]+)?$') and
  (reception_geo is null or reception_geo ~ '^-?[0-9]{1,2}(\.[0-9]+)?,-?[0-9]{1,3}(\.[0-9]+)?$'));

-- Μεταφορά του παλιού κοινού πεδίου «Σπίτι νύφης / γαμπρού» (το παλιό πεδίο μένει ως αντίγραφο)
update public.events
   set bride_house = nullif(trim(split_part(house_location, '/', 1)), ''),
       groom_house = nullif(trim(substr(house_location, length(split_part(house_location, '/', 1)) + 2)), '')
 where house_location is not null and bride_house is null and groom_house is null;

-- Drone ως αρμοδιότητα συνεργείου
alter table public.event_crew drop constraint if exists event_crew_duty_check;
alter table public.event_crew add constraint event_crew_duty_check check (duty in ('photo', 'video', 'drone'));

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
            private.tr(v_lang, case new.duty when 'video' then 'Βίντεο' when 'drone' then 'Drone' else 'Φωτογραφία' end,
                                case new.duty when 'video' then 'Video' when 'drone' then 'Drone' else 'Photo' end),
          '#/event/' || new.event_id);
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
     and new.editing_status <> 'done' then
    perform private.notify_admins('sos', '🔴 SOS · Το album πάει για εκτύπωση', '🔴 SOS · Album sent to print',
      v_label || ' · Το video πρέπει να ολοκληρωθεί', v_label || ' · The video must be finished',
      '#/sheets/mitsos', true);
  end if;

  if new.event_date is distinct from old.event_date then
    perform public.run_automations(new.id);
  end if;
  return new;
end $$;

create or replace function private.render_message(p_text text, p_event uuid, p_payment uuid, p_threshold numeric)
returns text language plpgsql stable security definer set search_path = public, private as $$
declare
  e public.events; c public.customers; f public.event_finance; p public.payments;
  v_paid numeric; v_price numeric; v_due numeric; b jsonb; out text := coalesce(p_text, '');
  v_cat text;
begin
  select * into e from public.events where id = p_event;
  select * into c from public.customers where id = e.customer_id;
  select * into f from public.event_finance where event_id = p_event;
  if p_payment is not null then select * into p from public.payments where id = p_payment; end if;
  select coalesce(sum(amount), 0) into v_paid from public.payments where event_id = p_event;
  select value into b from public.app_settings where key = 'business';
  v_price := f.package_price;
  v_due := greatest(0, round(coalesce(v_price, 0) * coalesce(p_threshold, 80) / 100 - v_paid, 2));
  v_cat := case e.category when 'wedding' then 'Γάμος' when 'baptism' then 'Βάπτιση'
           when 'wedding_baptism' then 'Γαμοβάπτιση' when 'promo' then 'Διαφημιστικό' else 'Άλλο' end;

  out := replace(out, '{couple}', concat_ws(' & ', nullif(split_part(trim(c.name1), ' ', 1), ''), nullif(split_part(trim(coalesce(c.name2, '')), ' ', 1), '')));
  out := replace(out, '{name1}', coalesce(c.name1, ''));
  out := replace(out, '{name2}', coalesce(c.name2, ''));
  out := replace(out, '{date}', private.fmt_date(e.event_date));
  out := replace(out, '{time}', coalesce(to_char(e.event_time, 'HH24:MI'), '—'));
  out := replace(out, '{church}', coalesce(nullif(e.church_location, ''), '—'));
  out := replace(out, '{bride_house}', coalesce(nullif(e.bride_house, ''), '—'));
  out := replace(out, '{groom_house}', coalesce(nullif(e.groom_house, ''), '—'));
  out := replace(out, '{house}', coalesce(nullif(concat_ws(' / ', nullif(e.bride_house, ''), nullif(e.groom_house, '')), ''), nullif(e.house_location, ''), '—'));
  out := replace(out, '{reception}', coalesce(nullif(e.reception_location, ''), '—'));
  out := replace(out, '{category}', v_cat);
  out := replace(out, '{package_price}', private.fmt_money(v_price));
  out := replace(out, '{paid_total}', private.fmt_money(v_paid));
  out := replace(out, '{balance}', private.fmt_money(greatest(0, coalesce(v_price, 0) - v_paid)));
  out := replace(out, '{due_now}', private.fmt_money(v_due));
  out := replace(out, '{threshold}', trim(to_char(coalesce(p_threshold, 80), 'FM990.##')));
  out := replace(out, '{days_left}', greatest(0, e.event_date - (now() at time zone 'Europe/Athens')::date)::text);
  out := replace(out, '{amount}', private.fmt_money(p.amount));
  out := replace(out, '{payment_label}', coalesce(p.label, 'πληρωμή'));
  out := replace(out, '{payment_date}', private.fmt_date(p.paid_on));
  out := replace(out, '{payment_method}', case p.method when 'cash' then 'μετρητά' when 'card' then 'κάρτα'
                       when 'bank' then 'τραπεζική μεταφορά' when 'iris' then 'IRIS' else 'άλλο τρόπο' end);
  out := replace(out, '{business_phone}', coalesce(b->>'phone', ''));
  out := replace(out, '{business_email}', coalesce(b->>'email', ''));
  out := replace(out, '{business}', coalesce(b->>'name', 'Image Makers'));
  return out;
end $$;
