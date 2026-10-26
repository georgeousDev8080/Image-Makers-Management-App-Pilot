-- =====================================================================
--  IMAGE MAKERS · Αναβάθμιση v2 (26/10/2026)
--  Προσφορές/Ραντεβού · Κατάσταση Εργασιών (workflow) · χρόνοι σταδίων
--  Τρέχει με ασφάλεια όσες φορές θέλετε (δεν σβήνει δεδομένα).
-- =====================================================================

-- 1) Χρόνος αλλαγής κατάστασης φωτογραφιών / video (για τα χρώματα του workflow)
alter table public.events add column if not exists photo_status_at timestamptz;
alter table public.events add column if not exists editing_status_at timestamptz;
update public.events set photo_status = 'samples_waiting' where photo_status = 'samples_pickup';
update public.events set photo_status_at = coalesce(photo_status_at, updated_at, created_at),
                         editing_status_at = coalesce(editing_status_at, updated_at, created_at)
 where photo_status_at is null or editing_status_at is null;

create or replace function private.events_before() returns trigger
language plpgsql as $$
begin
  -- «Να πάρουν δείγματα» καταργήθηκε
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
  if new.photo_status is distinct from old.photo_status then new.photo_status_at := now(); end if;
  if new.editing_status is distinct from old.editing_status then new.editing_status_at := now(); end if;
  return new;
end $$;

-- 2) Προσφορές / Ραντεβού (παρουσίαση στο μαγαζί ή ηλεκτρονικά)
create table if not exists public.appointments (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  mode              text not null default 'store' check (mode in ('store','online')),
  appt_date         date not null default ((now() at time zone 'Europe/Athens')::date),
  category          text not null default 'wedding'
                    check (category in ('wedding','baptism','wedding_baptism','promo','other')),
  name1             text,
  name2             text,
  phone             text,
  email             text,
  event_date        date,
  church            text,
  church_time       text,
  reception         text,
  reception_time    text,
  notes             text,
  offer_path        text,
  offer_data        jsonb,
  selections        jsonb,
  total             numeric(12,2),
  status            text not null default 'pending' check (status in ('pending','confirmed','rejected')),
  status_at         timestamptz not null default now(),
  reason            text,
  comments          text,
  stale_notified_at timestamptz,
  request_id        uuid references public.offer_requests(id) on delete set null,
  customer_id       uuid references public.customers(id) on delete set null,
  event_id          uuid references public.events(id) on delete set null,
  created_by        uuid references public.profiles(id) on delete set null,
  handled_by        uuid references public.profiles(id) on delete set null
);
create index if not exists appointments_date_idx on public.appointments(appt_date desc);
alter table public.appointments enable row level security;
revoke all on public.appointments from anon;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'appointments' and policyname = 'appointments_admin') then
    create policy appointments_admin on public.appointments for all to authenticated
      using (public.is_admin()) with check (public.is_admin());
  end if;
end $$;

create or replace function private.appointments_before() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    if new.status is distinct from old.status then new.status_at := now(); end if;
    if new.status_at is distinct from old.status_at then new.stale_notified_at := null; end if;
  end if;
  return new;
end $$;
create or replace trigger appointments_before before insert or update on public.appointments
  for each row execute function private.appointments_before();

-- Η σελίδα προσφοράς πελάτη δημιουργεί αυτόματα «ηλεκτρονικό» ραντεβού
create or replace function private.after_offer_request() returns trigger
language plpgsql security definer set search_path = public, private as $$
begin
  insert into public.appointments(mode, appt_date, category, name1, name2, phone, email, event_date,
                                  church, church_time, reception, reception_time, selections, total, request_id, status_at)
  values ('online', (new.created_at at time zone 'Europe/Athens')::date, 'wedding', new.partner1, new.partner2,
          coalesce(nullif(new.phone1, ''), new.phone2), new.email, new.wedding_date,
          new.church, new.church_time, new.reception, new.reception_time, new.selections, new.client_total, new.id, new.created_at);
  perform private.notify_admins('request',
    'Νέα ηλεκτρονική προσφορά', 'New online offer',
    concat_ws(' & ', nullif(new.partner1, ''), nullif(new.partner2, '')) || ' · ' || private.fmt_date(new.wedding_date),
    concat_ws(' & ', nullif(new.partner1, ''), nullif(new.partner2, '')) || ' · ' || private.fmt_date(new.wedding_date),
    '#/appointments');
  return new;
end $$;

-- Παλιά αιτήματα → ραντεβού (μία φορά)
insert into public.appointments(mode, appt_date, category, name1, name2, phone, email, event_date, church, church_time,
                                reception, reception_time, selections, total, request_id, status, event_id, customer_id, created_at, status_at)
select 'online', (r.created_at at time zone 'Europe/Athens')::date, 'wedding', r.partner1, r.partner2,
       coalesce(nullif(r.phone1, ''), r.phone2), r.email, r.wedding_date, r.church, r.church_time, r.reception, r.reception_time,
       r.selections, r.client_total, r.id,
       case r.status when 'converted' then 'confirmed' when 'archived' then 'rejected' else 'pending' end,
       r.event_id, r.customer_id, r.created_at, r.created_at
  from public.offer_requests r
 where not exists (select 1 from public.appointments a where a.request_id = r.id);

-- 3) Μηνύματα workflow (χειροκίνητα, ανά κατάσταση φωτογραφιών)
alter table public.message_queue add column if not exists title text;
create table if not exists public.workflow_templates (
  id         uuid primary key default gen_random_uuid(),
  key        text unique,
  name       text not null,
  stage      text not null default 'any',
  channels   text[] not null default '{email,sms}',
  subject    text,
  body       text not null,
  enabled    boolean not null default true,
  sort       int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.workflow_templates enable row level security;
revoke all on public.workflow_templates from anon;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'workflow_templates' and policyname = 'wf_templates_admin') then
    create policy wf_templates_admin on public.workflow_templates for all to authenticated
      using (public.is_admin()) with check (public.is_admin());
  end if;
end $$;
create or replace trigger workflow_templates_touch before update on public.workflow_templates
  for each row execute function private.touch_updated_at();

insert into public.workflow_templates(key, name, stage, sort, subject, body) values
 ('wf_editing_started', 'Ξεκίνησε η επεξεργασία', 'samples_todo', 10, 'Image Makers · Ξεκινήσαμε!',
  'Αγαπητοί {couple}, σας ευχαριστούμε και πάλι για την υπέροχη μέρα σας ({date})! Η ομάδα μας δουλεύει ήδη τις φωτογραφίες σας και θα σας ενημερώσουμε μόλις είναι έτοιμα τα δείγματα. Με εκτίμηση, Image Makers'),
 ('wf_samples_ready', 'Τα δείγματα είναι έτοιμα', 'samples_todo', 20, 'Image Makers · Τα δείγματά σας είναι έτοιμα',
  'Αγαπητοί {couple}, τα δείγματα των φωτογραφιών σας είναι έτοιμα! Μπορείτε να περάσετε από το studio για να τα παραλάβετε ή να μας πείτε πώς προτιμάτε να σας τα στείλουμε. Για οτιδήποτε, είμαστε στο {business_phone}. Image Makers'),
 ('wf_choose_reminder', 'Υπενθύμιση επιλογής φωτογραφιών', 'samples_waiting', 30, 'Image Makers · Η επιλογή των φωτογραφιών σας',
  'Αγαπητοί {couple}, ελπίζουμε να απολαμβάνετε τα δείγματα! Όταν ολοκληρώσετε την επιλογή των φωτογραφιών για το album, στείλτε μας τις επιλογές σας για να προχωρήσουμε. Αν χρειάζεστε βοήθεια, είμαστε στο {business_phone}. Image Makers'),
 ('wf_changes', 'Λάβαμε τις αλλαγές σας', 'changes', 40, 'Image Makers · Λάβαμε τις επιλογές σας',
  'Αγαπητοί {couple}, λάβαμε τις επιλογές και τις αλλαγές σας και προχωράμε στη διαμόρφωση του album. Θα σας ενημερώσουμε μόλις σταλεί για εκτύπωση. Image Makers'),
 ('wf_lab', 'Το album στάλθηκε για εκτύπωση', 'lab', 50, 'Image Makers · Το album σας τυπώνεται',
  'Αγαπητοί {couple}, το album σας στάλθηκε για εκτύπωση! Θα σας ενημερώσουμε μόλις είναι έτοιμο για παραλαβή. Image Makers'),
 ('wf_ready', 'Έτοιμο για παραλαβή', 'ready', 60, 'Image Makers · Έτοιμο για παραλαβή!',
  'Αγαπητοί {couple}, το album σας είναι έτοιμο! Μπορείτε να περάσετε από το studio να το παραλάβετε. Πείτε μας ποια μέρα σας εξυπηρετεί στο {business_phone}. Image Makers'),
 ('wf_pickup_reminder', 'Υπενθύμιση παραλαβής', 'ready', 70, 'Image Makers · Σας περιμένουμε!',
  'Αγαπητοί {couple}, σας υπενθυμίζουμε ότι το album σας είναι έτοιμο και σας περιμένει στο studio! Πείτε μας πότε σας εξυπηρετεί να περάσετε στο {business_phone}. Image Makers'),
 ('wf_thanks_review', 'Ευχαριστούμε & κριτική', 'delivered', 80, 'Image Makers · Σας ευχαριστούμε!',
  'Αγαπητοί {couple}, σας ευχαριστούμε θερμά που μας εμπιστευτήκατε! Αν μείνατε ικανοποιημένοι, θα χαρούμε πολύ να μας αφήσετε μια κριτική ή να μας προτείνετε σε φίλους σας. Image Makers'),
 ('wf_general', 'Γενικό μήνυμα', 'any', 90, 'Image Makers',
  'Αγαπητοί {couple}, ')
on conflict (key) do nothing;

-- 4) Αυτοματισμοί (προστέθηκε: ειδοποίηση για ραντεβού χωρίς απάντηση)
-- Κύριος έλεγχος αυτοματισμών (τρέχει κάθε 15' από pg_cron + μετά από κάθε αλλαγή)
create or replace function public.run_automations(p_event uuid default null)
returns int language plpgsql security definer set search_path = public, private as $$
declare
  t public.message_templates; r record; v_count int := 0; v_due timestamptz;
  v_crew jsonb; v_today date := (now() at time zone 'Europe/Athens')::date;
begin
  for t in select * from public.message_templates where enabled loop
    if t.trigger_type = 'on_booking' then
      for r in select e.id from public.events e
                where e.status = 'booked' and e.customer_id is not null
                  and e.created_at > now() - interval '2 days'
                  and (p_event is null or e.id = p_event)
                  and (cardinality(t.categories) = 0 or e.category = any(t.categories)) loop
        perform private.enqueue_message(t, r.id, null, now()); v_count := v_count + 1;
      end loop;

    elsif t.trigger_type = 'on_payment' then
      for r in select p.id, p.event_id from public.payments p join public.events e on e.id = p.event_id
                where p.created_at > now() - interval '2 days' and p.amount > 0
                  and e.customer_id is not null
                  and (p_event is null or p.event_id = p_event)
                  and (cardinality(t.categories) = 0 or e.category = any(t.categories)) loop
        perform private.enqueue_message(t, r.event_id, r.id, now()); v_count := v_count + 1;
      end loop;

    elsif t.trigger_type in ('before_event','after_event','unpaid_after_event') then
      for r in select e.id, e.event_date from public.events e
                where e.status = 'booked' and e.customer_id is not null
                  and (p_event is null or e.id = p_event)
                  and (cardinality(t.categories) = 0 or e.category = any(t.categories))
                  and e.event_date between v_today - 30 and v_today + 400 loop
        v_due := (((r.event_date + case when t.trigger_type = 'before_event' then -t.offset_days else t.offset_days end)::timestamp)
                  + make_interval(hours => t.send_hour)) at time zone 'Europe/Athens';
        continue when v_due > now() or v_due < now() - interval '3 days';
        if t.trigger_type = 'unpaid_after_event' then
          continue when not exists (
            select 1 from public.event_finance f
             where f.event_id = r.id and coalesce(f.package_price, 0) > 0
               and (select coalesce(sum(amount), 0) from public.payments where event_id = r.id)
                   < f.package_price * coalesce(t.threshold_pct, 80) / 100);
        end if;
        perform private.enqueue_message(t, r.id, null, v_due); v_count := v_count + 1;
      end loop;
    end if;
  end loop;

  -- Υπενθύμιση προς το συνεργείο (π.χ. την προηγούμενη μέρα στις 18:00)
  select value into v_crew from public.app_settings where key = 'crew_reminder';
  if coalesce((v_crew->>'enabled')::boolean, true) then
    for r in select e.id, e.event_date, e.event_time, e.church_location, ec.user_id, pr.lang,
                    concat_ws(' & ', nullif(cu.name1, ''), nullif(cu.name2, '')) as couple
               from public.events e
               join public.event_crew ec on ec.event_id = e.id
               join public.profiles pr on pr.id = ec.user_id and pr.active
               left join public.customers cu on cu.id = e.customer_id
              where e.status = 'booked'
                and (p_event is null or e.id = p_event)
                and e.event_date between v_today and v_today + 7 loop
      v_due := (((r.event_date - coalesce((v_crew->>'days_before')::int, 1))::timestamp)
                + make_interval(hours => coalesce((v_crew->>'hour')::int, 18))) at time zone 'Europe/Athens';
      continue when v_due > now();
      begin
        insert into private.sent_keys(key) values ('crew:' || r.id || ':' || r.user_id || ':' || r.event_date);
        insert into public.notifications(user_id, kind, title, body, link)
        values (r.user_id, 'reminder',
                private.tr(r.lang, 'Υπενθύμιση εκδήλωσης · ', 'Event reminder · ') || private.fmt_date(r.event_date),
                coalesce(r.couple, '') || ' · ' || coalesce(to_char(r.event_time, 'HH24:MI'), '') || ' · ' || coalesce(r.church_location, ''),
                '#/event/' || r.id);
      exception when unique_violation then null;
      end;
    end loop;
  end if;

  -- Ραντεβού/προσφορές χωρίς απάντηση για 10 ημέρες → ειδοποίηση (μία φορά)
  for r in select a.id, a.appt_date, concat_ws(' & ', nullif(a.name1, ''), nullif(a.name2, '')) as nm
             from public.appointments a
            where a.status = 'pending' and a.stale_notified_at is null
              and a.status_at < now() - interval '10 days' loop
    update public.appointments set stale_notified_at = now() where id = r.id;
    perform private.notify_admins('appointment',
      'Ραντεβού χωρίς απάντηση (10 ημέρες)', 'Appointment without an answer (10 days)',
      coalesce(r.nm, '—') || ' · ραντεβού ' || private.fmt_date(r.appt_date),
      coalesce(r.nm, '—') || ' · appointment ' || private.fmt_date(r.appt_date),
      '#/appointments');
  end loop;
  return v_count;
end $$;


-- 5) Realtime για τους νέους πίνακες
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['appointments','workflow_templates'] loop
      if not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

grant execute on all functions in schema public to authenticated, service_role;
revoke execute on function public.run_automations(uuid) from anon;

-- Ασφάλεια: αυτές οι δύο συναρτήσεις ΔΕΝ πρέπει να καλούνται από χρήστες της εφαρμογής
revoke execute on function public.new_owner_code() from public, anon, authenticated, service_role;
revoke execute on function public.push_get_config() from public, anon, authenticated;
grant execute on function public.push_get_config() to service_role;
alter function private.events_before() set search_path = public, private;
alter function private.appointments_before() set search_path = public, private;
