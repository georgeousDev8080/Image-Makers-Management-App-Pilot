-- =====================================================================
--  Προστασία από απώλεια δεδομένων
--  1. Εκδήλωση με πληρωμές δεν διαγράφεται (ακύρωση ή πρώτα διαγραφή πληρωμών)
--  2. Πλήρες αντίγραφο (εκδήλωση + πακέτο + πελάτης + συνεργείο) στο ιστορικό σε κάθε διαγραφή
--  3. Ιστορικό και για διαγραφές ραντεβού / πελατών
--  4. Χωρίς διπλή ειδοποίηση «Αφαιρεθήκατε» όταν διαγράφεται εκδήλωση
-- =====================================================================
create or replace function private.events_before_remove()
returns trigger language plpgsql security definer set search_path = public, private as $$
begin
  if exists (select 1 from public.payments where event_id = old.id) then
    raise exception 'event_has_payments' using hint = 'Ακυρώστε την εκδήλωση ή διαγράψτε πρώτα τις πληρωμές της.';
  end if;
  perform set_config('im.deleting_event', old.id::text, true);
  insert into public.notifications(user_id, kind, title, body, link)
  select pr.id, 'event', private.tr(pr.lang, 'Η εκδήλωση διαγράφηκε', 'Event deleted'),
         private.event_label(old.id), '#/calendar'
    from public.event_crew ec join public.profiles pr on pr.id = ec.user_id
   where ec.event_id = old.id and pr.active and pr.id is distinct from auth.uid()
     and old.event_date >= (now() at time zone 'Europe/Athens')::date;
  perform private.log('event_deleted', 'event', old.id::text,
    to_jsonb(old) || jsonb_build_object(
      'finance', (select to_jsonb(f) from public.event_finance f where f.event_id = old.id),
      'customer', (select to_jsonb(c) from public.customers c where c.id = old.customer_id),
      'crew', (select coalesce(jsonb_agg(to_jsonb(ec)), '[]'::jsonb) from public.event_crew ec where ec.event_id = old.id)));
  return old;
end $$;

create or replace function private.crew_after_remove()
returns trigger language plpgsql security definer set search_path = public, private as $$
declare v_lang text;
begin
  -- όχι όταν διαγράφεται ολόκληρη η εκδήλωση (έχει ήδη σταλεί «Η εκδήλωση διαγράφηκε»)
  if coalesce(current_setting('im.deleting_event', true), '') = old.event_id::text then return old; end if;
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

create or replace function private.log_delete()
returns trigger language plpgsql security definer set search_path = public, private as $$
begin
  perform private.log(tg_argv[0], tg_table_name, old.id::text, to_jsonb(old));
  return old;
end $$;
drop trigger if exists appointments_after_remove on public.appointments;
create trigger appointments_after_remove after delete on public.appointments
  for each row execute function private.log_delete('appointment_deleted');
drop trigger if exists customers_after_remove on public.customers;
create trigger customers_after_remove after delete on public.customers
  for each row execute function private.log_delete('customer_deleted');
