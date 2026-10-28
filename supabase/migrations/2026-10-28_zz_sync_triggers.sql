-- =====================================================================
--  Συγχρονισμός με τη βάση παραγωγής (28/10/2026)
--  Οι παλιοί «συνδυαστικοί» triggers χωρίστηκαν σε ξεχωριστούς. Αυτό το
--  τμήμα κάνει μια νέα εγκατάσταση από το schema.sql ίδια με την παραγωγή.
-- =====================================================================
create or replace function private.payments_after_insert()
returns trigger language plpgsql security definer set search_path = public, private as $$
begin
  if new.event_id is not null then perform public.run_automations(new.event_id); end if;
  return new;
end $$;
create or replace function private.payments_after_remove()
returns trigger language plpgsql security definer set search_path = public, private as $$
begin
  perform private.log('payment_deleted', 'payment', old.id::text, to_jsonb(old));
  return old;
end $$;
create or replace function private.expenses_after_remove()
returns trigger language plpgsql security definer set search_path = public, private as $$
begin
  perform private.log('expense_deleted', 'expense', old.id::text, to_jsonb(old));
  return old;
end $$;

drop trigger if exists crew_after on public.event_crew;
drop trigger if exists events_before_delete on public.events;
drop trigger if exists payments_after on public.payments;
drop trigger if exists expenses_after on public.expenses;

drop trigger if exists crew_after_insert on public.event_crew;
create trigger crew_after_insert after insert on public.event_crew for each row execute function private.crew_after_insert();
drop trigger if exists crew_after_remove on public.event_crew;
create trigger crew_after_remove after delete on public.event_crew for each row execute function private.crew_after_remove();
drop trigger if exists events_before_remove on public.events;
create trigger events_before_remove before delete on public.events for each row execute function private.events_before_remove();
drop trigger if exists payments_after_insert on public.payments;
create trigger payments_after_insert after insert on public.payments for each row execute function private.payments_after_insert();
drop trigger if exists payments_after_remove on public.payments;
create trigger payments_after_remove after delete on public.payments for each row execute function private.payments_after_remove();
drop trigger if exists expenses_after_remove on public.expenses;
create trigger expenses_after_remove after delete on public.expenses for each row execute function private.expenses_after_remove();
drop trigger if exists appointments_before on public.appointments;
create trigger appointments_before before insert or update on public.appointments for each row execute function private.appointments_before();
drop trigger if exists workflow_templates_touch on public.workflow_templates;
create trigger workflow_templates_touch before update on public.workflow_templates for each row execute function private.touch_updated_at();
