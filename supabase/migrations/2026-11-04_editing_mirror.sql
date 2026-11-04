-- =====================================================================
--  «Κατάσταση editing» (μεγάλο Excel) = καθρέφτης της «Κατάστασης Βίντεο»
--  του φύλλου Dimitris:
--    όχι έτοιμο            → — (ή «Να γίνει» αν οι φωτογραφίες είναι σε Αλλαγές / εργαστήριο / έτοιμες / παραδόθηκαν)
--    υπό επεξεργασία       → Σε επεξεργασία
--    έτοιμο να γίνει export→ Σε επεξεργασία
--    έτοιμο                → Σε επεξεργασία, εκτός αν «παραδόθηκε στο μαγαζί» → Ολοκληρώθηκε
--  Υπολογίζεται σε κάθε αλλαγή, οπότε ένα λάθος διορθώνεται απλώς γυρνώντας πίσω την κατάσταση.
-- =====================================================================
create or replace function private.editing_from_video(p_video text, p_shop text, p_photo text)
returns text language sql immutable set search_path = public, private as $$
  select case coalesce(p_video, 'not_ready')
    when 'ready' then case when p_shop = 'delivered' then 'done' else 'in_progress' end
    when 'export' then 'in_progress'
    when 'in_progress' then 'in_progress'
    else case when p_photo in ('changes', 'lab', 'ready', 'delivered') then 'todo' else 'none' end
  end
$$;

create or replace function private.events_before()
returns trigger language plpgsql set search_path = public, private as $$
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

-- Ευθυγράμμιση των υπαρχόντων (εκτός από όσες είχαν σημειωθεί «Ολοκληρώθηκε» με το χέρι
-- χωρίς να έχει συμπληρωθεί ποτέ η Κατάσταση Βίντεο — αυτές μένουν όπως είναι)
update public.events
   set editing_status = private.editing_from_video(video_status, shop_status, photo_status)
 where coalesce(coverage, 'both') <> 'photo'
   and editing_status is distinct from private.editing_from_video(video_status, shop_status, photo_status)
   and not (editing_status = 'done' and coalesce(video_status, 'not_ready') = 'not_ready');
