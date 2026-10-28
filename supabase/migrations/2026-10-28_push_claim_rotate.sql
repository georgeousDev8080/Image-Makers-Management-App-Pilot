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
