-- =====================================================================
--  «+ Drone» ανά μέλος συνεργείου: π.χ. Βίντεο + Drone.
--  Η παλιά αρμοδιότητα duty = 'drone' μένει ως «Μόνο drone».
-- =====================================================================
alter table public.event_crew add column if not exists drone boolean not null default false;
update public.event_crew set drone = true where duty = 'drone' and not drone;

create or replace function private.crew_duty_text(p_duty text, p_drone boolean, p_lang text)
returns text language sql immutable set search_path = public, private as $$
  select private.tr(p_lang,
           case p_duty when 'video' then 'Βίντεο' when 'drone' then 'Drone' else 'Φωτογραφία' end,
           case p_duty when 'video' then 'Video' when 'drone' then 'Drone' else 'Photo' end)
         || case when p_drone and p_duty <> 'drone' then ' + Drone' else '' end
$$;

create or replace function private.crew_after_insert()
returns trigger language plpgsql security definer set search_path = public, private as $$
declare v_lang text; v_active boolean; v_label text; e public.events;
begin
  select lang, active into v_lang, v_active from public.profiles where id = new.user_id;
  select * into e from public.events where id = new.event_id;
  if not coalesce(v_active, false) or e.id is null
     or coalesce(e.end_date, e.event_date) < (now() at time zone 'Europe/Athens')::date then
    return new;
  end if;
  v_label := private.event_label(new.event_id);
  insert into public.notifications(user_id, kind, title, body, link)
  values (new.user_id, 'assignment',
          private.tr(v_lang, 'Σας ανατέθηκε εκδήλωση', 'You were assigned to an event'),
          private.event_headline(e, v_lang) || E'\n' || v_label ||
          case when nullif(trim(new.brief), '') is not null then E'\n' || new.brief
               else E'\n' || private.crew_duty_text(new.duty, new.drone, v_lang) end,
          '#/event/' || new.event_id);
  return new;
end $$;

create or replace function private.crew_after_update()
returns trigger language plpgsql security definer set search_path = public, private as $$
declare v_lang text; v_active boolean; e public.events;
begin
  if new.team is not distinct from old.team and new.tasks is not distinct from old.tasks
     and new.brief is not distinct from old.brief and new.duty is not distinct from old.duty
     and new.drone is not distinct from old.drone then
    return new;
  end if;
  select lang, active into v_lang, v_active from public.profiles where id = new.user_id;
  select * into e from public.events where id = new.event_id;
  if not coalesce(v_active, false) or e.id is null or e.status = 'cancelled'
     or coalesce(e.end_date, e.event_date) < (now() at time zone 'Europe/Athens')::date then
    return new;
  end if;
  insert into public.notifications(user_id, kind, title, body, link)
  values (new.user_id, 'assignment',
          private.tr(v_lang, 'Αλλαγή στην ανάθεσή σας', 'Your assignment changed'),
          private.event_headline(e, v_lang) || E'\n' || private.event_label(new.event_id)
            || coalesce(E'\n' || nullif(trim(new.brief), ''), E'\n' || private.crew_duty_text(new.duty, new.drone, v_lang)),
          '#/event/' || new.event_id);
  return new;
end $$;
