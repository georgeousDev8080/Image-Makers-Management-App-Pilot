-- =====================================================================
--  Ασφάλεια
--  1. Χρώμα / όνομα / τηλέφωνο προφίλ: μόνο έγκυρες τιμές (προστασία από XSS)
--  2. Υποχρεωτική αλλαγή του αρχικού PIN με την πρώτη είσοδο
--  3. Αρχεία προσφορών: μόνο PDF έως 20 MB
-- =====================================================================
alter table public.profiles drop constraint if exists profiles_color_check;
alter table public.profiles add constraint profiles_color_check check (color is null or color ~ '^#[0-9A-Fa-f]{3,8}$');
alter table public.profiles drop constraint if exists profiles_text_len_check;
alter table public.profiles add constraint profiles_text_len_check check (coalesce(length(full_name), 0) <= 80 and coalesce(length(phone), 0) <= 30);

alter table public.profiles add column if not exists must_change_pin boolean not null default false;

create or replace function public.pin_changed()
returns void language sql security definer set search_path = public as $$
  update public.profiles set must_change_pin = false where id = auth.uid();
$$;
revoke all on function public.pin_changed() from public, anon;
grant execute on function public.pin_changed() to authenticated;

update storage.buckets set file_size_limit = 20971520, allowed_mime_types = array['application/pdf'] where id = 'offers';

-- Οι 7 αρχικοί λογαριασμοί (PIN 123456) αλλάζουν υποχρεωτικά PIN στην πρώτη είσοδο
update public.profiles set must_change_pin = true;
