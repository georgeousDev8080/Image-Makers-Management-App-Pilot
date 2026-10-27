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
