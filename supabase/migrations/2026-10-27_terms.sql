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
