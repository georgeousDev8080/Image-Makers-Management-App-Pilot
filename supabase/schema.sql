-- =====================================================================
--  IMAGE MAKERS · Studio Manager — Βάση δεδομένων (Supabase)
--  Αντιγράψτε ΟΛΟ το αρχείο στο Supabase → SQL Editor → Run.
--  Μπορεί να εκτελεστεί ξανά με ασφάλεια (δεν σβήνει δεδομένα).
--  Στο τέλος εμφανίζεται ο «Κωδικός ιδιοκτήτη» για τον πρώτο διαχειριστή.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- Προαιρετικά extensions για αυτοματισμούς & push (υπάρχουν δωρεάν στο Supabase)
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
  end if;
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
  end if;
end $$;

create schema if not exists private;
revoke all on schema private from public;
do $$ begin
  revoke all on schema private from anon, authenticated;
exception when others then null; end $$;

create table if not exists private.config (
  key   text primary key,
  value text not null
);

create table if not exists private.sent_keys (
  key text primary key,
  at  timestamptz not null default now()
);

-- Μυστικό που προστατεύει τη συνάρτηση push (δημιουργείται αυτόματα)
insert into private.config(key, value)
values ('push_secret', encode(extensions.gen_random_bytes(24), 'hex'))
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
--  Βοηθητικές
-- ---------------------------------------------------------------------
create or replace function private.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create or replace function private.tr(p_lang text, p_el text, p_en text) returns text
language sql immutable as $$
  select case when coalesce(p_lang, 'el') = 'en' then p_en else p_el end
$$;

create or replace function private.fmt_money(p numeric) returns text
language sql immutable as $$
  select case when p is null then '—' else
    replace(replace(replace(to_char(round(p, 2), 'FM999,999,990.00'), ',', '#'), '.', ','), '#', '.') || ' €'
  end
$$;

create or replace function private.fmt_date(p date) returns text
language sql immutable as $$
  select case when p is null then '—' else to_char(p, 'DD/MM/YYYY') end
$$;

create or replace function private.athens_now() returns timestamp
language sql stable as $$ select (now() at time zone 'Europe/Athens') $$;

-- ---------------------------------------------------------------------
--  Προφίλ χρηστών & ρόλοι
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  username   text not null,
  full_name  text not null default '',
  role       text check (role in ('admin_photo','admin_video','photographer','videographer')),
  phone      text,
  color      text,
  lang       text not null default 'el' check (lang in ('el','en')),
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists profiles_username_ci on public.profiles (lower(username));

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function private.touch_updated_at();

create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and active
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('admin_photo','admin_video') from public.profiles
                   where id = auth.uid() and active), false)
$$;

create or replace function public.is_video_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin_video' from public.profiles
                   where id = auth.uid() and active), false)
$$;

create or replace function public.has_role() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role is not null from public.profiles
                   where id = auth.uid() and active), false)
$$;

-- Δημιουργία προφίλ με την εγγραφή
create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = public, private as $$
declare
  v_username text := nullif(trim(coalesce(new.raw_user_meta_data->>'username', '')), '');
  v_name     text := coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), '');
  v_lang     text := coalesce(nullif(new.raw_user_meta_data->>'lang', ''), 'el');
begin
  if v_username is null then
    v_username := split_part(new.email, '@', 1);
  end if;
  if exists (select 1 from public.profiles where lower(username) = lower(v_username)) then
    v_username := v_username || '_' || substr(replace(new.id::text, '-', ''), 1, 4);
  end if;
  insert into public.profiles(id, email, username, full_name, lang)
  values (new.id, new.email, v_username, v_name, case when v_lang in ('el','en') then v_lang else 'el' end);
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- Διαθεσιμότητα username (χρησιμοποιείται στην εγγραφή)
create or replace function public.username_available(p_username text) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.profiles where lower(username) = lower(trim(p_username)))
$$;

-- Σύνδεση με username ή email
create or replace function public.login_email(p_identifier text) returns text
language sql stable security definer set search_path = public as $$
  select case
    when position('@' in p_identifier) > 0 then lower(trim(p_identifier))
    else (select email from public.profiles where lower(username) = lower(trim(p_identifier)) limit 1)
  end
$$;

-- ---------------------------------------------------------------------
--  Ημερολόγιο ενεργειών (ασφάλεια / ιστορικό)
-- ---------------------------------------------------------------------
create table if not exists public.activity_log (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  user_id    uuid,
  action     text not null,
  entity     text,
  entity_id  text,
  details    jsonb
);

create or replace function private.log(p_action text, p_entity text, p_entity_id text, p_details jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.activity_log(user_id, action, entity, entity_id, details)
  values (auth.uid(), p_action, p_entity, p_entity_id, p_details)
$$;

-- ---------------------------------------------------------------------
--  Κωδικοί πρόσκλησης (ασφαλής απόκτηση ρόλου / admin)
-- ---------------------------------------------------------------------
create table if not exists public.invite_codes (
  id         uuid primary key default gen_random_uuid(),
  code_hash  text not null unique,
  role       text not null check (role in ('owner','admin_photo','admin_video','photographer','videographer')),
  note       text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  used_by    uuid references public.profiles(id) on delete set null,
  used_at    timestamptz
);

create or replace function private.random_code() returns text
language plpgsql as $$
declare
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  bytes bytea := extensions.gen_random_bytes(8);
  out text := '';
begin
  for i in 0..7 loop
    out := out || substr(alphabet, (get_byte(bytes, i) % length(alphabet)) + 1, 1);
    if i = 3 then out := out || '-'; end if;
  end loop;
  return out;
end $$;

create or replace function private.hash_code(p_code text) returns text
language sql immutable as $$
  select encode(extensions.digest(upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')), 'sha256'), 'hex')
$$;

create or replace function public.admin_create_invite(p_role text, p_hours int default 48, p_note text default null)
returns text language plpgsql security definer set search_path = public, private as $$
declare v_code text;
begin
  if not public.is_admin() then raise exception 'not_allowed'; end if;
  if p_role not in ('admin_photo','admin_video','photographer','videographer') then raise exception 'bad_role'; end if;
  v_code := private.random_code();
  insert into public.invite_codes(code_hash, role, note, created_by, expires_at)
  values (private.hash_code(v_code), p_role, p_note, auth.uid(),
          now() + make_interval(hours => greatest(1, least(coalesce(p_hours, 48), 720))));
  perform private.log('invite_created', 'invite', null, jsonb_build_object('role', p_role, 'hours', p_hours));
  return v_code;
end $$;

create or replace function public.redeem_invite(p_code text, p_admin_role text default null)
returns text language plpgsql security definer set search_path = public, private as $$
declare
  v_inv public.invite_codes;
  v_role text;
  v_fail int;
begin
  if auth.uid() is null then raise exception 'not_logged_in'; end if;
  -- προστασία από δοκιμές: μέχρι 8 λάθος προσπάθειες ανά ώρα
  select count(*) into v_fail from public.activity_log
   where user_id = auth.uid() and action = 'invite_failed' and at > now() - interval '1 hour';
  if v_fail >= 8 then return 'error:too_many_attempts'; end if;

  select * into v_inv from public.invite_codes
   where code_hash = private.hash_code(p_code) and used_at is null
     and (expires_at is null or expires_at > now())
   for update;
  if not found then
    perform private.log('invite_failed', 'invite', null, null);
    return 'error:invalid_code';
  end if;

  v_role := v_inv.role;
  if v_role = 'owner' then
    v_role := case when p_admin_role = 'admin_video' then 'admin_video' else 'admin_photo' end;
  end if;

  update public.invite_codes set used_by = auth.uid(), used_at = now() where id = v_inv.id;
  update public.profiles set role = v_role, active = true where id = auth.uid();
  perform private.log('role_from_code', 'profile', auth.uid()::text, jsonb_build_object('role', v_role));

  insert into public.notifications(user_id, kind, title, body, link)
  select p.id, 'team',
         private.tr(p.lang, 'Νέο μέλος στην ομάδα', 'New team member'),
         (select coalesce(nullif(full_name, ''), username) from public.profiles where id = auth.uid())
           || ' · ' || v_role,
         '#/team'
    from public.profiles p
   where p.role in ('admin_photo','admin_video') and p.active and p.id <> auth.uid();
  return v_role;
end $$;

create or replace function public.admin_set_role(p_user uuid, p_role text)
returns void language plpgsql security definer set search_path = public, private as $$
declare v_old text; v_admins int;
begin
  if not public.is_admin() then raise exception 'not_allowed'; end if;
  if p_role is not null and p_role not in ('admin_photo','admin_video','photographer','videographer') then
    raise exception 'bad_role';
  end if;
  select role into v_old from public.profiles where id = p_user;
  if v_old in ('admin_photo','admin_video') and (p_role is null or p_role not in ('admin_photo','admin_video')) then
    select count(*) into v_admins from public.profiles where role in ('admin_photo','admin_video') and active;
    if v_admins <= 1 then raise exception 'last_admin'; end if;
  end if;
  update public.profiles set role = p_role where id = p_user;
  perform private.log('role_changed', 'profile', p_user::text, jsonb_build_object('from', v_old, 'to', p_role));
  insert into public.notifications(user_id, kind, title, body, link)
  select id, 'team',
         private.tr(lang, 'Ο ρόλος σας άλλαξε', 'Your role changed'),
         private.tr(lang, 'Ανανεώστε την εφαρμογή για να δείτε τις νέες δυνατότητες.', 'Reload the app to see your new options.'),
         '#/home'
    from public.profiles where id = p_user;
end $$;

create or replace function public.admin_set_active(p_user uuid, p_active boolean)
returns void language plpgsql security definer set search_path = public, private as $$
declare v_role text; v_admins int;
begin
  if not public.is_admin() then raise exception 'not_allowed'; end if;
  if p_user = auth.uid() and not p_active then raise exception 'cannot_disable_self'; end if;
  select role into v_role from public.profiles where id = p_user;
  if not p_active and v_role in ('admin_photo','admin_video') then
    select count(*) into v_admins from public.profiles where role in ('admin_photo','admin_video') and active;
    if v_admins <= 1 then raise exception 'last_admin'; end if;
  end if;
  update public.profiles set active = p_active where id = p_user;
  perform private.log(case when p_active then 'user_enabled' else 'user_disabled' end, 'profile', p_user::text, null);
end $$;

-- Μόνο από τον SQL Editor: νέος κωδικός ιδιοκτήτη (π.χ. αν χαθούν όλοι οι admin)
create or replace function public.new_owner_code() returns text
language plpgsql security definer set search_path = public, private as $$
declare v_code text;
begin
  update public.invite_codes set used_at = now(), note = 'Αντικαταστάθηκε'
   where role = 'owner' and used_at is null;
  v_code := private.random_code();
  insert into public.invite_codes(code_hash, role, note, expires_at)
  values (private.hash_code(v_code), 'owner', 'Κωδικός ιδιοκτήτη', now() + interval '30 days');
  return v_code;
end $$;
revoke execute on function public.new_owner_code() from public;
do $$ begin
  revoke execute on function public.new_owner_code() from anon, authenticated;
exception when others then null; end $$;

-- ---------------------------------------------------------------------
--  Ρυθμίσεις εφαρμογής
-- ---------------------------------------------------------------------
create table if not exists public.app_settings (
  key        text primary key,
  value      jsonb,
  updated_at timestamptz not null default now()
);

insert into public.app_settings(key, value) values
  ('business', jsonb_build_object(
      'name', 'Image Makers',
      'phone', '2410 550361',
      'email', 'digital.imagemakers@gmail.com',
      'address', '28ης Οκτωβρίου 40, Λάρισα',
      'website', 'www.imagemakers.gr')),
  ('crew_reminder', jsonb_build_object('enabled', true, 'days_before', 1, 'hour', 18)),
  ('payment_plan', jsonb_build_object('booking', 40, 'event_day', 40, 'delivery', 20))
on conflict (key) do nothing;

-- Ρύθμιση push από την εφαρμογή (μόνο admin)
create or replace function public.admin_set_push_config(p_functions_url text, p_vapid_public text,
                                                       p_vapid_private_jwk text, p_subject text)
returns void language plpgsql security definer set search_path = public, private as $$
begin
  if not public.is_admin() then raise exception 'not_allowed'; end if;
  if p_functions_url is not null then
    insert into private.config values ('functions_url', rtrim(p_functions_url, '/'))
      on conflict (key) do update set value = excluded.value;
  end if;
  if p_vapid_public is not null and p_vapid_private_jwk is not null then
    insert into private.config values ('vapid_private_jwk', p_vapid_private_jwk)
      on conflict (key) do update set value = excluded.value;
    insert into public.app_settings(key, value) values ('vapid_public', to_jsonb(p_vapid_public))
      on conflict (key) do update set value = excluded.value, updated_at = now();
  end if;
  insert into private.config values ('vapid_subject', coalesce(nullif(p_subject, ''), 'mailto:digital.imagemakers@gmail.com'))
    on conflict (key) do update set value = excluded.value;
  perform private.log('push_configured', 'settings', null, null);
end $$;

-- Καλείται ΜΟΝΟ από τη συνάρτηση push (service role)
create or replace function public.push_get_config() returns jsonb
language sql stable security definer set search_path = public, private as $$
  select jsonb_build_object(
    'push_secret', (select value from private.config where key = 'push_secret'),
    'vapid_private_jwk', (select value from private.config where key = 'vapid_private_jwk'),
    'vapid_public', (select value #>> '{}' from public.app_settings where key = 'vapid_public'),
    'subject', coalesce((select value from private.config where key = 'vapid_subject'), 'mailto:digital.imagemakers@gmail.com'))
$$;
revoke execute on function public.push_get_config() from public;
do $$ begin
  revoke execute on function public.push_get_config() from anon, authenticated;
  grant execute on function public.push_get_config() to service_role;
exception when others then null; end $$;

-- ---------------------------------------------------------------------
--  Πελάτες
-- ---------------------------------------------------------------------
create table if not exists public.customers (
  id         uuid primary key default gen_random_uuid(),
  name1      text not null,
  name2      text,
  phone1     text,
  phone2     text,
  email1     text,
  email2     text,
  notes      text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists customers_touch on public.customers;
create trigger customers_touch before update on public.customers
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------
--  Εκδηλώσεις (χωρίς οικονομικά — τα βλέπει και το συνεργείο)
-- ---------------------------------------------------------------------
create table if not exists public.events (
  id                 uuid primary key default gen_random_uuid(),
  customer_id        uuid references public.customers(id) on delete restrict,
  category           text not null default 'wedding'
                     check (category in ('wedding','baptism','wedding_baptism','promo','other')),
  event_date         date not null,
  event_time         time,
  church_location    text,
  house_location     text,
  reception_location text,
  resolution         text check (resolution in ('1080','4k')),
  notes              text,
  extra_crew         text,
  offer_path         text,
  offer_data         jsonb,
  offer_updated_at   timestamptz,
  photo_status       text not null default 'samples_todo'
                     check (photo_status in ('samples_todo','samples_pickup','samples_waiting','changes','lab','ready','delivered')),
  editing_status     text not null default 'none'
                     check (editing_status in ('none','todo','in_progress','done')),
  editing_pc         text check (editing_pc in ('mac_mini','macbook','win_pc')),
  video_notes        text,
  status             text not null default 'booked' check (status in ('booked','cancelled')),
  created_by         uuid references public.profiles(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists events_date_idx on public.events(event_date);
create index if not exists events_customer_idx on public.events(customer_id);

drop trigger if exists events_touch on public.events;
create trigger events_touch before update on public.events
  for each row execute function private.touch_updated_at();

-- Οικονομικά εκδήλωσης (μόνο admin)
create table if not exists public.event_finance (
  event_id      uuid primary key references public.events(id) on delete cascade,
  package_price numeric(12,2),
  package_name  text,
  second_crew   boolean,
  office_notes  text,
  updated_at    timestamptz not null default now()
);
drop trigger if exists event_finance_touch on public.event_finance;
create trigger event_finance_touch before update on public.event_finance
  for each row execute function private.touch_updated_at();

-- Ανάθεση συνεργείου
create table if not exists public.event_crew (
  event_id   uuid not null references public.events(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  duty       text not null default 'photo' check (duty in ('photo','video')),
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index if not exists event_crew_user_idx on public.event_crew(user_id);

create or replace function public.is_on_event(p_event uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.event_crew where event_id = p_event and user_id = auth.uid())
$$;

create or replace function public.can_see_customer(p_customer uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.events e join public.event_crew c on c.event_id = e.id
     where e.customer_id = p_customer and c.user_id = auth.uid())
$$;

-- ---------------------------------------------------------------------
--  Εισπράξεις (Μητρώο Εισπράξεων) & Έξοδα
-- ---------------------------------------------------------------------
create table if not exists public.payments (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid references public.events(id) on delete cascade,
  category    text not null default 'wedding'
              check (category in ('wedding','baptism','wedding_baptism','promo','other')),
  kind        text not null default 'installment' check (kind in ('deposit','installment','other')),
  label       text,
  amount      numeric(12,2) not null check (amount <> 0),
  paid_on     date default (now() at time zone 'Europe/Athens')::date,
  method      text check (method in ('cash','card','bank','iris','other')),
  description text,
  notes       text,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists payments_event_idx on public.payments(event_id);
create index if not exists payments_date_idx on public.payments(paid_on);

create table if not exists public.expenses (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('payroll','daily_wage','investment','shop','other')),
  subcategory text,
  crew_id     uuid references public.profiles(id) on delete set null,
  crew_name   text,
  for_month   date,
  paid_until  date,
  days        numeric(6,2),
  amount      numeric(12,2) not null check (amount <> 0),
  paid_on     date not null default (now() at time zone 'Europe/Athens')::date,
  method      text check (method in ('cash','card','bank','iris','other')),
  supplier    text,
  description text,
  notes       text,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists expenses_date_idx on public.expenses(paid_on);

-- ---------------------------------------------------------------------
--  Ειδοποιήσεις & push
-- ---------------------------------------------------------------------
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  kind       text not null default 'info',
  title      text not null,
  body       text,
  link       text,
  data       jsonb,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications(user_id, created_at desc);

create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  device      text,
  created_at  timestamptz not null default now(),
  last_ok_at  timestamptz
);

create or replace function public.push_status() returns jsonb
language sql stable security definer set search_path = public, private as $$
  select case when public.is_admin() then jsonb_build_object(
    'functions_url', (select value from private.config where key = 'functions_url'),
    'has_vapid', exists (select 1 from private.config where key = 'vapid_private_jwk'),
    'has_pg_net', exists (select 1 from pg_extension where extname = 'pg_net'),
    'has_pg_cron', exists (select 1 from pg_extension where extname = 'pg_cron'),
    'subscriptions', (select count(*) from public.push_subscriptions)
  ) else null end
$$;

-- Αποστολή push μέσω της Edge Function «push»
create or replace function private.on_notification_push() returns trigger
language plpgsql security definer set search_path = public, private as $$
declare v_url text; v_secret text;
begin
  select value into v_url from private.config where key = 'functions_url';
  select value into v_secret from private.config where key = 'push_secret';
  if v_url is null or not exists (select 1 from pg_extension where extname = 'pg_net') then
    return new;
  end if;
  begin
    execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 8000)'
      using v_url || '/push',
            jsonb_build_object('id', new.id),
            jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret);
  exception when others then
    null; -- ποτέ μην μπλοκάρεις την εφαρμογή επειδή απέτυχε ένα push
  end;
  return new;
end $$;

drop trigger if exists notifications_push on public.notifications;
create trigger notifications_push after insert on public.notifications
  for each row execute function private.on_notification_push();

create or replace function public.send_test_notification() returns void
language plpgsql security definer set search_path = public, private as $$
begin
  if auth.uid() is null then raise exception 'not_logged_in'; end if;
  insert into public.notifications(user_id, kind, title, body, link)
  select id, 'test',
         private.tr(lang, 'Δοκιμαστική ειδοποίηση ✅', 'Test notification ✅'),
         private.tr(lang, 'Αν το βλέπετε, οι ειδοποιήσεις δουλεύουν σε αυτή τη συσκευή.',
                          'If you can see this, notifications work on this device.'),
         '#/notifications'
    from public.profiles where id = auth.uid();
end $$;

create or replace function public.mark_all_read() returns void
language sql security definer set search_path = public as $$
  update public.notifications set read_at = now() where user_id = auth.uid() and read_at is null
$$;

-- Ειδοποίηση προς όλους τους admin (προαιρετικά μόνο videographer admin)
create or replace function private.notify_admins(p_kind text, p_title_el text, p_title_en text,
                                                 p_body_el text, p_body_en text, p_link text,
                                                 p_only_video boolean default false, p_data jsonb default null)
returns void language sql security definer set search_path = public, private as $$
  insert into public.notifications(user_id, kind, title, body, link, data)
  select id, p_kind, private.tr(lang, p_title_el, p_title_en), private.tr(lang, p_body_el, p_body_en), p_link, p_data
    from public.profiles
   where active and (case when p_only_video then role = 'admin_video' else role in ('admin_photo','admin_video') end)
$$;

-- ---------------------------------------------------------------------
--  Αιτήματα προσφοράς από πελάτες (σελίδα πελάτη)
-- ---------------------------------------------------------------------
create table if not exists public.offer_requests (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  partner1       text,
  partner2       text,
  phone1         text,
  phone2         text,
  email          text,
  wedding_date   date,
  church         text,
  church_time    text,
  reception      text,
  reception_time text,
  selections     jsonb,
  client_total   numeric(12,2),
  status         text not null default 'new' check (status in ('new','converted','archived')),
  customer_id    uuid references public.customers(id) on delete set null,
  event_id       uuid references public.events(id) on delete set null,
  handled_by     uuid references public.profiles(id) on delete set null,
  constraint offer_requests_sizes check (
    coalesce(length(partner1),0) <= 120 and coalesce(length(partner2),0) <= 120 and
    coalesce(length(phone1),0) <= 30 and coalesce(length(phone2),0) <= 30 and
    coalesce(length(email),0) <= 160 and coalesce(length(church),0) <= 200 and
    coalesce(length(reception),0) <= 200 and coalesce(length(church_time),0) <= 10 and
    coalesce(length(reception_time),0) <= 10 and coalesce(length(selections::text),0) <= 8000)
);

create or replace function private.on_offer_request() returns trigger
language plpgsql security definer set search_path = public, private as $$
declare v_recent int;
begin
  if tg_op = 'INSERT' then
    select count(*) into v_recent from public.offer_requests where created_at > now() - interval '10 minutes';
    if v_recent > 30 then raise exception 'rate_limited'; end if;
    new.status := 'new';
    new.customer_id := null; new.event_id := null; new.handled_by := null;
  end if;
  return new;
end $$;
drop trigger if exists offer_requests_guard on public.offer_requests;
create trigger offer_requests_guard before insert on public.offer_requests
  for each row execute function private.on_offer_request();

create or replace function private.after_offer_request() returns trigger
language plpgsql security definer set search_path = public, private as $$
begin
  perform private.notify_admins('request',
    'Νέο αίτημα προσφοράς', 'New offer request',
    concat_ws(' & ', nullif(new.partner1, ''), nullif(new.partner2, '')) || ' · ' || private.fmt_date(new.wedding_date),
    concat_ws(' & ', nullif(new.partner1, ''), nullif(new.partner2, '')) || ' · ' || private.fmt_date(new.wedding_date),
    '#/requests');
  return new;
end $$;
drop trigger if exists offer_requests_notify on public.offer_requests;
create trigger offer_requests_notify after insert on public.offer_requests
  for each row execute function private.after_offer_request();

-- ---------------------------------------------------------------------
--  Αυτοματοποιημένα μηνύματα προς πελάτες
-- ---------------------------------------------------------------------
create table if not exists public.message_templates (
  id            uuid primary key default gen_random_uuid(),
  key           text unique,
  name          text not null,
  trigger_type  text not null check (trigger_type in ('on_booking','before_event','after_event','on_payment','unpaid_after_event')),
  offset_days   int not null default 0,
  send_hour     int not null default 11 check (send_hour between 0 and 23),
  threshold_pct numeric(5,2) default 80,
  categories    text[] not null default '{}',
  channels      text[] not null default '{sms,email}',
  recipients    uuid[] not null default '{}',
  subject       text,
  body          text not null,
  enabled       boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
drop trigger if exists message_templates_touch on public.message_templates;
create trigger message_templates_touch before update on public.message_templates
  for each row execute function private.touch_updated_at();

create table if not exists public.message_queue (
  id          uuid primary key default gen_random_uuid(),
  template_id uuid references public.message_templates(id) on delete cascade,
  event_id    uuid references public.events(id) on delete cascade,
  payment_id  uuid references public.payments(id) on delete cascade,
  dedupe_key  text not null unique,
  due_at      timestamptz not null default now(),
  status      text not null default 'pending' check (status in ('pending','sent','dismissed')),
  channels    text[] not null default '{sms,email}',
  assigned_to uuid[] not null default '{}',
  to_phone    text,
  to_email    text,
  subject     text,
  body        text not null,
  sent_at     timestamptz,
  sent_by     uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists message_queue_status_idx on public.message_queue(status, created_at desc);

insert into public.message_templates(key, name, trigger_type, offset_days, send_hour, threshold_pct, subject, body) values
 ('booking_thanks', 'Ευχαριστήριο κράτησης', 'on_booking', 0, 11, null,
  'Image Makers · Σας ευχαριστούμε!',
  'Αγαπητοί {couple}, σας ευχαριστούμε θερμά για την εμπιστοσύνη! Η ημερομηνία {date} είναι πλέον επίσημα κλεισμένη για εσάς. Θα είμαστε δίπλα σας σε κάθε βήμα μέχρι τη μεγάλη μέρα. Για οτιδήποτε χρειαστείτε, είμαστε στη διάθεσή σας στο {business_phone}. Με εκτίμηση, Image Makers'),
 ('before_10', 'Υπενθύμιση 10 ημέρες πριν', 'before_event', 10, 11, null,
  'Image Makers · Λίγες μέρες ακόμη!',
  'Αγαπητοί {couple}, απομένουν {days_left} ημέρες για τη μεγάλη σας μέρα ({date})! Θα θέλαμε να επιβεβαιώσουμε τα στοιχεία: ώρα {time}, εκκλησία {church}, χώρος δεξίωσης {reception}. Αν έχει αλλάξει κάτι, ενημερώστε μας. Image Makers'),
 ('after_event', 'Ευχαριστήριο μετά την εκδήλωση', 'after_event', 1, 11, null,
  'Image Makers · Σας ευχαριστούμε!',
  'Αγαπητοί {couple}, σας ευχαριστούμε που μας επιτρέψατε να ζήσουμε μαζί σας μια τόσο όμορφη μέρα! Η ομάδα μας ξεκινά ήδη την επεξεργασία. Η πρώτη επιλογή φωτογραφιών και το προσχέδιο του album θα είναι έτοιμα σε περίπου 25 ημέρες. Image Makers'),
 ('payment_confirm', 'Επιβεβαίωση πληρωμής', 'on_payment', 0, 11, null,
  'Image Makers · Επιβεβαίωση πληρωμής',
  'Αγαπητοί {couple}, επιβεβαιώνουμε ότι λάβαμε {amount} ({payment_label}) στις {payment_date} με {payment_method}. Σύνολο πληρωμών: {paid_total} από {package_price}. Υπόλοιπο: {balance}. Σας ευχαριστούμε! Image Makers'),
 ('unpaid_after', 'Υπενθύμιση πληρωμής μετά την εκδήλωση', 'unpaid_after_event', 1, 12, 80,
  'Image Makers · Υπενθύμιση πληρωμής',
  'Αγαπητοί {couple}, ελπίζουμε να απολαύσατε τη μέρα σας! Σας υπενθυμίζουμε ότι, σύμφωνα με τη συμφωνία μας, μετά την εκδήλωση πρέπει να έχει καταβληθεί το {threshold}% της αξίας του πακέτου ({package_price}). Μέχρι σήμερα έχουν καταβληθεί {paid_total}. Ποσό προς τακτοποίηση: {due_now}. Σας ευχαριστούμε! Image Makers')
on conflict (key) do nothing;

-- Συμπλήρωση παραμέτρων κειμένου
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
  out := replace(out, '{house}', coalesce(nullif(e.house_location, ''), '—'));
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

create or replace function private.enqueue_message(t public.message_templates, p_event uuid, p_payment uuid, p_due timestamptz)
returns void language plpgsql security definer set search_path = public, private as $$
declare
  v_key text := t.id::text || ':' || p_event::text || ':' || coalesce(p_payment::text, '-');
  v_id uuid; c public.customers; v_body text; v_subject text; v_title text;
  v_recipients uuid[];
begin
  select cu.* into c from public.events e join public.customers cu on cu.id = e.customer_id where e.id = p_event;
  v_body := private.render_message(t.body, p_event, p_payment, t.threshold_pct);
  v_subject := private.render_message(t.subject, p_event, p_payment, t.threshold_pct);
  v_recipients := case when coalesce(array_length(t.recipients, 1), 0) = 0
                       then array(select id from public.profiles where role in ('admin_photo','admin_video') and active)
                       else t.recipients end;

  insert into public.message_queue(template_id, event_id, payment_id, dedupe_key, due_at, channels,
                                   assigned_to, to_phone, to_email, subject, body)
  values (t.id, p_event, p_payment, v_key, p_due, t.channels, v_recipients,
          coalesce(nullif(c.phone1, ''), nullif(c.phone2, '')), coalesce(nullif(c.email1, ''), nullif(c.email2, '')),
          v_subject, v_body)
  on conflict (dedupe_key) do nothing
  returning id into v_id;

  if v_id is not null then
    v_title := concat_ws(' & ', nullif(split_part(trim(c.name1), ' ', 1), ''), nullif(split_part(trim(coalesce(c.name2, '')), ' ', 1), ''));
    insert into public.notifications(user_id, kind, title, body, link, data)
    select pr.id, 'message',
           private.tr(pr.lang, 'Μήνυμα προς αποστολή: ', 'Message to send: ') || t.name,
           v_title || ' · ' || left(v_body, 120),
           '#/outbox/' || v_id::text,
           jsonb_build_object('queue_id', v_id)
      from public.profiles pr where pr.id = any(v_recipients) and pr.active;
  end if;
end $$;

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
  return v_count;
end $$;

-- ---------------------------------------------------------------------
--  Αυτοματισμοί εκδηλώσεων (κατάσταση φωτογραφιών → editing, ειδοποιήσεις)
-- ---------------------------------------------------------------------
create or replace function private.events_before() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.photo_status is distinct from old.photo_status
     and new.photo_status = 'changes' and new.editing_status = 'none' then
    new.editing_status := 'todo';
  end if;
  return new;
end $$;
drop trigger if exists events_before on public.events;
create trigger events_before before insert or update on public.events
  for each row execute function private.events_before();

create or replace function private.event_label(p_event uuid) returns text
language sql stable security definer set search_path = public, private as $$
  select concat_ws(' · ',
           nullif(concat_ws(' & ', nullif(c.name1, ''), nullif(c.name2, '')), ''),
           private.fmt_date(e.event_date))
    from public.events e left join public.customers c on c.id = e.customer_id
   where e.id = p_event
$$;

create or replace function private.events_after() returns trigger
language plpgsql security definer set search_path = public, private as $$
declare
  v_changes_el text[] := '{}'; v_changes_en text[] := '{}';
  v_label text;
begin
  if tg_op = 'INSERT' then
    insert into public.event_finance(event_id) values (new.id) on conflict do nothing;
    perform public.run_automations(new.id);
    return new;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  v_label := private.event_label(new.id);

  if new.event_date is distinct from old.event_date then
    v_changes_el := v_changes_el || ('Ημερομηνία: ' || private.fmt_date(new.event_date));
    v_changes_en := v_changes_en || ('Date: ' || private.fmt_date(new.event_date)); end if;
  if new.event_time is distinct from old.event_time then
    v_changes_el := v_changes_el || ('Ώρα: ' || coalesce(to_char(new.event_time, 'HH24:MI'), '—'));
    v_changes_en := v_changes_en || ('Time: ' || coalesce(to_char(new.event_time, 'HH24:MI'), '—')); end if;
  if new.church_location is distinct from old.church_location then
    v_changes_el := v_changes_el || ('Εκκλησία: ' || coalesce(new.church_location, '—'));
    v_changes_en := v_changes_en || ('Church: ' || coalesce(new.church_location, '—')); end if;
  if new.house_location is distinct from old.house_location then
    v_changes_el := v_changes_el || ('Σπίτι: ' || coalesce(new.house_location, '—'));
    v_changes_en := v_changes_en || ('House: ' || coalesce(new.house_location, '—')); end if;
  if new.reception_location is distinct from old.reception_location then
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

  -- Αλλαγές φωτογραφιών → editing «Να γίνει»
  if new.photo_status is distinct from old.photo_status and new.photo_status = 'changes'
     and new.editing_status = 'todo' and old.editing_status <> 'todo' then
    perform private.notify_admins('editing', 'Editing: Να γίνει', 'Editing: To do',
      v_label || ' · Οι φωτογραφίες πέρασαν σε «Αλλαγές»', v_label || ' · Photos moved to “Changes”',
      '#/sheets/mitsos', true);
  end if;
  -- Εκτύπωση στο εργαστήριο → SOS στο Mitsos
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
drop trigger if exists events_after on public.events;
create trigger events_after after insert or update on public.events
  for each row execute function private.events_after();

create or replace function private.events_before_delete() returns trigger
language plpgsql security definer set search_path = public, private as $$
begin
  insert into public.notifications(user_id, kind, title, body, link)
  select pr.id, 'event', private.tr(pr.lang, 'Η εκδήλωση διαγράφηκε', 'Event deleted'),
         private.event_label(old.id), '#/calendar'
    from public.event_crew ec join public.profiles pr on pr.id = ec.user_id
   where ec.event_id = old.id and pr.active and pr.id is distinct from auth.uid();
  perform private.log('event_deleted', 'event', old.id::text, to_jsonb(old));
  return old;
end $$;
drop trigger if exists events_before_delete on public.events;
create trigger events_before_delete before delete on public.events
  for each row execute function private.events_before_delete();

-- Ανάθεση / αφαίρεση συνεργείου → ειδοποίηση στο συγκεκριμένο μέλος
create or replace function private.crew_after() returns trigger
language plpgsql security definer set search_path = public, private as $$
declare v_lang text; v_label text; e public.events;
begin
  if tg_op = 'INSERT' then
    select lang into v_lang from public.profiles where id = new.user_id;
    select * into e from public.events where id = new.event_id;
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
  elsif tg_op = 'DELETE' then
    if exists (select 1 from public.events where id = old.event_id) then
      select lang into v_lang from public.profiles where id = old.user_id;
      insert into public.notifications(user_id, kind, title, body, link)
      values (old.user_id, 'assignment',
              private.tr(v_lang, 'Αφαιρεθήκατε από εκδήλωση', 'You were removed from an event'),
              private.event_label(old.event_id), '#/calendar');
    end if;
    return old;
  end if;
  return null;
end $$;
drop trigger if exists crew_after on public.event_crew;
create trigger crew_after after insert or delete on public.event_crew
  for each row execute function private.crew_after();

-- Αλλαγή στοιχείων πελάτη → ενημέρωση συνεργείου μελλοντικών εκδηλώσεων
create or replace function private.customers_after() returns trigger
language plpgsql security definer set search_path = public, private as $$
begin
  if (new.phone1, new.phone2, new.name1, new.name2) is distinct from (old.phone1, old.phone2, old.name1, old.name2) then
    insert into public.notifications(user_id, kind, title, body, link)
    select distinct pr.id, 'event', private.tr(pr.lang, 'Αλλαγή στοιχείων ζευγαριού', 'Couple details changed'),
           private.event_label(e.id), '#/event/' || e.id
      from public.events e join public.event_crew ec on ec.event_id = e.id
      join public.profiles pr on pr.id = ec.user_id
     where e.customer_id = new.id and e.event_date >= (now() at time zone 'Europe/Athens')::date
       and pr.active and pr.id is distinct from auth.uid();
  end if;
  return new;
end $$;
drop trigger if exists customers_after on public.customers;
create trigger customers_after after update on public.customers
  for each row execute function private.customers_after();

-- Πληρωμές: σωστή κατηγορία + αυτοματισμοί
create or replace function private.payments_before() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.event_id is not null then
    select category into new.category from public.events where id = new.event_id;
  end if;
  if new.created_by is null then new.created_by := auth.uid(); end if;
  return new;
end $$;
drop trigger if exists payments_before on public.payments;
create trigger payments_before before insert or update on public.payments
  for each row execute function private.payments_before();

create or replace function private.payments_after() returns trigger
language plpgsql security definer set search_path = public, private as $$
begin
  if tg_op = 'INSERT' and new.event_id is not null then
    perform public.run_automations(new.event_id);
  elsif tg_op = 'DELETE' then
    perform private.log('payment_deleted', 'payment', old.id::text, to_jsonb(old));
    return old;
  end if;
  return new;
end $$;
drop trigger if exists payments_after on public.payments;
create trigger payments_after after insert or delete on public.payments
  for each row execute function private.payments_after();

create or replace function private.expenses_after() returns trigger
language plpgsql security definer set search_path = public, private as $$
begin
  perform private.log('expense_deleted', 'expense', old.id::text, to_jsonb(old));
  return old;
end $$;
drop trigger if exists expenses_after on public.expenses;
create trigger expenses_after after delete on public.expenses
  for each row execute function private.expenses_after();

create or replace function private.expenses_before() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.created_by is null then new.created_by := auth.uid(); end if;
  if new.crew_id is not null and coalesce(new.crew_name, '') = '' then
    select coalesce(nullif(full_name, ''), username) into new.crew_name from public.profiles where id = new.crew_id;
  end if;
  return new;
end $$;
drop trigger if exists expenses_before on public.expenses;
create trigger expenses_before before insert or update on public.expenses
  for each row execute function private.expenses_before();

-- Νέος λογαριασμός → ειδοποίηση στους admin
create or replace function private.profiles_after_insert() returns trigger
language plpgsql security definer set search_path = public, private as $$
begin
  perform private.notify_admins('team', 'Νέος λογαριασμός περιμένει ρόλο', 'New account waiting for a role',
    coalesce(nullif(new.full_name, ''), new.username) || ' · ' || new.email,
    coalesce(nullif(new.full_name, ''), new.username) || ' · ' || new.email, '#/team');
  return new;
end $$;
drop trigger if exists profiles_after_insert on public.profiles;
create trigger profiles_after_insert after insert on public.profiles
  for each row execute function private.profiles_after_insert();

-- ---------------------------------------------------------------------
--  Δικαιώματα πρόσβασης (Row Level Security)
-- ---------------------------------------------------------------------
-- Ρητά δικαιώματα (ώστε να λειτουργεί ακόμη κι αν το «Automatically expose new tables» είναι κλειστό).
-- Την πραγματική προστασία την κάνει το Row Level Security πιο κάτω.
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
grant execute on all functions in schema public to authenticated, service_role;
revoke execute on function public.new_owner_code() from public, anon, authenticated, service_role;
revoke execute on function public.push_get_config() from public, anon, authenticated;

alter table public.profiles           enable row level security;
alter table public.activity_log       enable row level security;
alter table public.invite_codes       enable row level security;
alter table public.app_settings       enable row level security;
alter table public.customers          enable row level security;
alter table public.events             enable row level security;
alter table public.event_finance      enable row level security;
alter table public.event_crew         enable row level security;
alter table public.payments           enable row level security;
alter table public.expenses           enable row level security;
alter table public.notifications      enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.offer_requests     enable row level security;
alter table public.message_templates  enable row level security;
alter table public.message_queue      enable row level security;

-- profiles
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.has_role());
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from authenticated, anon;
grant update (full_name, phone, lang, color) on public.profiles to authenticated;
revoke insert, delete on public.profiles from authenticated, anon;

-- activity_log / invite_codes (μόνο ανάγνωση από admin)
drop policy if exists activity_admin on public.activity_log;
create policy activity_admin on public.activity_log for select to authenticated using (public.is_admin());
drop policy if exists invites_admin on public.invite_codes;
create policy invites_admin on public.invite_codes for select to authenticated using (public.is_admin());
drop policy if exists invites_admin_delete on public.invite_codes;
create policy invites_admin_delete on public.invite_codes for delete to authenticated using (public.is_admin());

-- app_settings
drop policy if exists settings_read on public.app_settings;
create policy settings_read on public.app_settings for select to authenticated using (public.has_role() or key = 'vapid_public');
drop policy if exists settings_write on public.app_settings;
create policy settings_write on public.app_settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin() and key <> 'vapid_public');

-- customers
drop policy if exists customers_select on public.customers;
create policy customers_select on public.customers for select to authenticated using (public.can_see_customer(id));
drop policy if exists customers_admin on public.customers;
create policy customers_admin on public.customers for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- events
drop policy if exists events_select on public.events;
create policy events_select on public.events for select to authenticated
  using (public.is_admin() or public.is_on_event(id));
drop policy if exists events_admin on public.events;
create policy events_admin on public.events for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- event_crew
drop policy if exists crew_select on public.event_crew;
create policy crew_select on public.event_crew for select to authenticated
  using (public.is_admin() or public.is_on_event(event_id));
drop policy if exists crew_admin on public.event_crew;
create policy crew_admin on public.event_crew for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- οικονομικά: μόνο admin
drop policy if exists finance_admin on public.event_finance;
create policy finance_admin on public.event_finance for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists payments_admin on public.payments;
create policy payments_admin on public.payments for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists expenses_admin on public.expenses;
create policy expenses_admin on public.expenses for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- notifications
drop policy if exists notif_own on public.notifications;
create policy notif_own on public.notifications for select to authenticated using (user_id = auth.uid());
drop policy if exists notif_own_update on public.notifications;
create policy notif_own_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists notif_own_delete on public.notifications;
create policy notif_own_delete on public.notifications for delete to authenticated using (user_id = auth.uid());
revoke insert on public.notifications from authenticated, anon;

-- push subscriptions
drop policy if exists push_own on public.push_subscriptions;
create policy push_own on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- offer requests: ο πελάτης μπορεί ΜΟΝΟ να στείλει, δεν βλέπει τίποτα
drop policy if exists requests_public_insert on public.offer_requests;
create policy requests_public_insert on public.offer_requests for insert to anon, authenticated
  with check (status = 'new');
drop policy if exists requests_admin on public.offer_requests;
create policy requests_admin on public.offer_requests for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
revoke select, update, delete on public.offer_requests from anon;

-- μηνύματα
drop policy if exists templates_admin on public.message_templates;
create policy templates_admin on public.message_templates for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists queue_admin on public.message_queue;
create policy queue_admin on public.message_queue for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Κανείς ανώνυμος δεν διαβάζει/γράφει τίποτα άλλο
revoke all on public.profiles, public.activity_log, public.invite_codes, public.app_settings,
              public.customers, public.events, public.event_finance, public.event_crew,
              public.payments, public.expenses, public.notifications, public.push_subscriptions,
              public.message_templates, public.message_queue from anon;
grant insert on public.offer_requests to anon;

-- ---------------------------------------------------------------------
--  Αρχεία προσφορών (Storage) — μόνο admin
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('offers', 'offers', false)
on conflict (id) do nothing;

drop policy if exists offers_admin_select on storage.objects;
create policy offers_admin_select on storage.objects for select to authenticated
  using (bucket_id = 'offers' and public.is_admin());
drop policy if exists offers_admin_insert on storage.objects;
create policy offers_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'offers' and public.is_admin());
drop policy if exists offers_admin_update on storage.objects;
create policy offers_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'offers' and public.is_admin());
drop policy if exists offers_admin_delete on storage.objects;
create policy offers_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'offers' and public.is_admin());

-- ---------------------------------------------------------------------
--  Realtime (ζωντανή ενημέρωση σε όλες τις συσκευές)
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['notifications','events','event_crew','event_finance','payments','expenses',
                             'customers','message_queue','offer_requests','profiles'] loop
      if not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

-- ---------------------------------------------------------------------
--  Χρονοπρογραμματισμός (κάθε 15 λεπτά)
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'imagemakers-automations') then
      perform cron.unschedule('imagemakers-automations');
    end if;
    perform cron.schedule('imagemakers-automations', '*/15 * * * *', 'select public.run_automations()');
  end if;
end $$;

-- Δικαιώματα εκτέλεσης
grant execute on function public.username_available(text) to anon, authenticated;
grant execute on function public.login_email(text) to anon, authenticated;
revoke execute on function public.run_automations(uuid) from anon;
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
revoke execute on function public.new_owner_code() from authenticated, service_role;
revoke execute on function public.push_get_config() from authenticated;
grant execute on function public.username_available(text) to anon;
grant execute on function public.login_email(text) to anon;

-- ---------------------------------------------------------------------
--  Κωδικός ιδιοκτήτη (μόνο αν δεν υπάρχει ακόμη admin)
-- ---------------------------------------------------------------------
select case
  when exists (select 1 from public.profiles where role in ('admin_photo','admin_video'))
    then 'Υπάρχει ήδη διαχειριστής — δεν χρειάζεται κωδικός ιδιοκτήτη.'
  else 'ΚΩΔΙΚΟΣ ΙΔΙΟΚΤΗΤΗ: ' || public.new_owner_code() || '  (ισχύει 30 ημέρες, μία χρήση)'
end as "Αποτέλεσμα";


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

-- Διαγραφή λογαριασμού που ήταν σε συνεργείο: να μην αποτυγχάνει η ειδοποίηση «Αφαιρεθήκατε»
create or replace function private.crew_after_remove() returns trigger
language plpgsql security definer set search_path = public, private as $$
declare v_lang text;
begin
  if exists (select 1 from public.events where id = old.event_id)
     and exists (select 1 from public.profiles where id = old.user_id) then
    select lang into v_lang from public.profiles where id = old.user_id;
    insert into public.notifications(user_id, kind, title, body, link)
    values (old.user_id, 'assignment',
            private.tr(v_lang, 'Αφαιρεθήκατε από εκδήλωση', 'You were removed from an event'),
            private.event_label(old.event_id), '#/calendar');
  end if;
  return old;
end $$;

-- Απενεργοποιημένος λογαριασμός: δεν βλέπει πλέον εκδηλώσεις/πελάτες και σταματούν οι ειδοποιήσεις
create or replace function public.is_on_event(p_event uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_role() and exists (select 1 from public.event_crew where event_id = p_event and user_id = auth.uid())
$$;

create or replace function public.can_see_customer(p_customer uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or (public.has_role() and exists (
    select 1 from public.events e join public.event_crew c on c.event_id = e.id
     where e.customer_id = p_customer and c.user_id = auth.uid()))
$$;

create or replace function public.admin_set_active(p_user uuid, p_active boolean) returns void
language plpgsql security definer set search_path = public, private as $$
declare v_role text; v_admins int;
begin
  if not public.is_admin() then raise exception 'not_allowed'; end if;
  if p_user = auth.uid() and not p_active then raise exception 'cannot_disable_self'; end if;
  select role into v_role from public.profiles where id = p_user;
  if not p_active and v_role in ('admin_photo','admin_video') then
    select count(*) into v_admins from public.profiles where role in ('admin_photo','admin_video') and active;
    if v_admins <= 1 then raise exception 'last_admin'; end if;
  end if;
  update public.profiles set active = p_active where id = p_user;
  if not p_active then
    delete from public.push_subscriptions where user_id = p_user;
  end if;
  perform private.log(case when p_active then 'user_enabled' else 'user_disabled' end, 'profile', p_user::text, null);
end $$;

grant execute on function public.is_on_event(uuid), public.can_see_customer(uuid), public.admin_set_active(uuid, boolean) to authenticated;
revoke execute on function public.is_on_event(uuid), public.can_see_customer(uuid), public.admin_set_active(uuid, boolean) from anon, public;
-- =====================================================================
--  Όροι χρήσης / Πολιτική απορρήτου — καταγραφή αποδοχής ανά χρήστη
-- =====================================================================
alter table public.profiles add column if not exists terms_version text;
alter table public.profiles add column if not exists terms_accepted_at timestamptz;

create or replace function public.accept_terms(p_version text)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare v_at timestamptz := now();
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if coalesce(trim(p_version), '') = '' or length(p_version) > 20 then raise exception 'invalid version'; end if;
  update public.profiles set terms_version = p_version, terms_accepted_at = v_at where id = auth.uid();
  if not found then raise exception 'no profile'; end if;
  perform private.log('terms_accepted', 'profile', auth.uid()::text, jsonb_build_object('version', p_version));
  return v_at;
end $$;
revoke all on function public.accept_terms(text) from public, anon;
grant execute on function public.accept_terms(text) to authenticated;
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
-- Σελίδα προσφοράς: όριο μεγέθους αιτήματος (προστασία από κατάχρηση)
create or replace function private.on_offer_request()
returns trigger language plpgsql security definer set search_path = public, private as $$
declare v_recent int;
begin
  if tg_op = 'INSERT' then
    select count(*) into v_recent from public.offer_requests where created_at > now() - interval '10 minutes';
    if v_recent > 30 then raise exception 'rate_limited'; end if;
    if pg_column_size(new) > 100000 then raise exception 'too_large'; end if;
    new.status := 'new';
    new.customer_id := null; new.event_id := null; new.handled_by := null;
  end if;
  return new;
end $$;
-- =====================================================================
--  Ειδοποιήσεις: η συσκευή ανήκει πάντα στον τελευταίο συνδεδεμένο
--  λογαριασμό, και ανανεώνεται μόνη της αν αλλάξει η συνδρομή push
--  (ακόμη κι όταν η εφαρμογή είναι κλειστή).
-- =====================================================================
create or replace function public.push_claim(p_endpoint text, p_p256dh text, p_auth text, p_device text default null)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and active) then raise exception 'not_allowed'; end if;
  if p_endpoint !~ '^https://' or length(p_endpoint) > 1000 or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then
    raise exception 'invalid subscription';
  end if;
  -- η ίδια συσκευή μπορεί να ανήκει μόνο σε έναν λογαριασμό: τον τελευταίο που συνδέθηκε
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id <> auth.uid();
  insert into public.push_subscriptions(user_id, endpoint, p256dh, auth, device)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_device, 60))
  on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth, device = excluded.device, user_id = auth.uid();
  return true;
end $$;
revoke all on function public.push_claim(text, text, text, text) from public, anon;
grant execute on function public.push_claim(text, text, text, text) to authenticated;

-- Καλείται από τον service worker (χωρίς σύνδεση) όταν ο browser αλλάξει τη συνδρομή.
-- Το παλιό endpoint είναι μυστικό που γνωρίζει μόνο η συσκευή και η βάση.
create or replace function public.push_rotate(p_old text, p_endpoint text, p_p256dh text, p_auth text)
returns boolean language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if p_endpoint !~ '^https://' or length(p_endpoint) > 1000 or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then
    return false;
  end if;
  if p_old = p_endpoint then
    update public.push_subscriptions set p256dh = p_p256dh, auth = p_auth where endpoint = p_old;
  else
    delete from public.push_subscriptions where endpoint = p_endpoint;
    update public.push_subscriptions set endpoint = p_endpoint, p256dh = p_p256dh, auth = p_auth where endpoint = p_old;
  end if;
  get diagnostics n = row_count;
  return n > 0;
end $$;
revoke all on function public.push_rotate(text, text, text, text) from public;
grant execute on function public.push_rotate(text, text, text, text) to anon, authenticated;
