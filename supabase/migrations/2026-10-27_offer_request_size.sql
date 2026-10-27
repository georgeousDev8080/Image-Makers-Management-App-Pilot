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
