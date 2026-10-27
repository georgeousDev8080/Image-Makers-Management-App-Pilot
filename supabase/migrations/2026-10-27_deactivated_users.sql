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
