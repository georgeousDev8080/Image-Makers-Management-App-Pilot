-- Διόρθωση: το events_before καλεί private.editing_from_video· χωρίς security definer
-- οι χρήστες (ρόλος authenticated) έπαιρναν «permission denied for schema private»
-- σε κάθε αλλαγή εκδήλωσης. Το trigger τρέχει πλέον με τα δικαιώματα του ιδιοκτήτη.
create or replace function private.events_before()
returns trigger language plpgsql security definer set search_path = public, private as $$
begin
  if new.photo_status = 'samples_pickup' then new.photo_status := 'samples_waiting'; end if;
  if coalesce(new.coverage, 'both') <> 'photo' then
    new.editing_status := private.editing_from_video(new.video_status, new.shop_status, new.photo_status);
  end if;
  if tg_op = 'INSERT' then
    new.photo_status_at := coalesce(new.photo_status_at, now());
    new.editing_status_at := coalesce(new.editing_status_at, now());
    return new;
  end if;
  if new.photo_status is distinct from old.photo_status then new.photo_status_at := now(); end if;
  if new.editing_status is distinct from old.editing_status then new.editing_status_at := now(); end if;
  return new;
end $$;
