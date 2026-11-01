-- =====================================================================
--  Ώρα εκδήλωσης «δεν γνωρίζουμε ακόμη» (event_time = null):
--  ειδοποίηση στους διαχειριστές όταν απομένουν ≤ 3 μήνες
-- =====================================================================
create or replace function public.run_automations(p_event uuid default null)
returns int language plpgsql security definer set search_path = public, private as $$
declare
  t public.message_templates; r record; v_count int := 0; v_due timestamptz;
  v_crew jsonb; v_today date := (now() at time zone 'Europe/Athens')::date;
begin
  for t in select * from public.message_templates where enabled loop
    if t.trigger_type = 'on_booking' then
      for r in select e.id from public.events e
                where e.status = 'booked' and e.customer_id is not null
                  and e.created_at > now() - interval '2 days'
                  and (p_event is null or e.id = p_event)
                  and (cardinality(t.categories) = 0 or e.category = any(t.categories)) loop
        perform private.enqueue_message(t, r.id, null, now()); v_count := v_count + 1;
      end loop;

    elsif t.trigger_type = 'on_payment' then
      for r in select p.id, p.event_id from public.payments p join public.events e on e.id = p.event_id
                where p.created_at > now() - interval '2 days' and p.amount > 0
                  and e.customer_id is not null
                  and (p_event is null or p.event_id = p_event)
                  and (cardinality(t.categories) = 0 or e.category = any(t.categories)) loop
        perform private.enqueue_message(t, r.event_id, r.id, now()); v_count := v_count + 1;
      end loop;

    elsif t.trigger_type in ('before_event','after_event','unpaid_after_event') then
      for r in select e.id, e.event_date from public.events e
                where e.status = 'booked' and e.customer_id is not null
                  and (p_event is null or e.id = p_event)
                  and (cardinality(t.categories) = 0 or e.category = any(t.categories))
                  and e.event_date between v_today - 30 and v_today + 400 loop
        v_due := (((r.event_date + case when t.trigger_type = 'before_event' then -t.offset_days else t.offset_days end)::timestamp)
                  + make_interval(hours => t.send_hour)) at time zone 'Europe/Athens';
        continue when v_due > now() or v_due < now() - interval '3 days';
        if t.trigger_type = 'unpaid_after_event' then
          continue when not exists (
            select 1 from public.event_finance f
             where f.event_id = r.id and coalesce(f.package_price, 0) > 0
               and (select coalesce(sum(amount), 0) from public.payments where event_id = r.id)
                   < f.package_price * coalesce(t.threshold_pct, 80) / 100);
        end if;
        perform private.enqueue_message(t, r.id, null, v_due); v_count := v_count + 1;
      end loop;
    end if;
  end loop;

  -- Υπενθύμιση προς το συνεργείο (π.χ. την προηγούμενη μέρα στις 18:00)
  select value into v_crew from public.app_settings where key = 'crew_reminder';
  if coalesce((v_crew->>'enabled')::boolean, true) then
    for r in select e.id, e.event_date, e.event_time, e.church_location, ec.user_id, pr.lang,
                    concat_ws(' & ', nullif(cu.name1, ''), nullif(cu.name2, '')) as couple
               from public.events e
               join public.event_crew ec on ec.event_id = e.id
               join public.profiles pr on pr.id = ec.user_id and pr.active
               left join public.customers cu on cu.id = e.customer_id
              where e.status = 'booked'
                and (p_event is null or e.id = p_event)
                and e.event_date between v_today and v_today + 7 loop
      v_due := (((r.event_date - coalesce((v_crew->>'days_before')::int, 1))::timestamp)
                + make_interval(hours => coalesce((v_crew->>'hour')::int, 18))) at time zone 'Europe/Athens';
      continue when v_due > now();
      begin
        insert into private.sent_keys(key) values ('crew:' || r.id || ':' || r.user_id || ':' || r.event_date);
        insert into public.notifications(user_id, kind, title, body, link)
        values (r.user_id, 'reminder',
                private.tr(r.lang, 'Υπενθύμιση εκδήλωσης · ', 'Event reminder · ') || private.fmt_date(r.event_date),
                coalesce(r.couple, '') || ' · ' || coalesce(to_char(r.event_time, 'HH24:MI'), private.tr(r.lang, 'ώρα: δεν έχει οριστεί', 'time: not set yet')) || ' · ' || coalesce(r.church_location, ''),
                '#/event/' || r.id);
      exception when unique_violation then null;
      end;
    end loop;
  end if;

  -- Εκδηλώσεις χωρίς ώρα («δεν γνωρίζουμε ακόμη») 3 μήνες πριν → ειδοποίηση στους διαχειριστές (μία φορά ανά ημερομηνία)
  for r in select e.id, e.event_date from public.events e
            where e.status = 'booked' and e.event_time is null
              and (p_event is null or e.id = p_event)
              and e.event_date between v_today and v_today + 90 loop
    begin
      insert into private.sent_keys(key) values ('notime:' || r.id || ':' || r.event_date);
      perform private.notify_admins('reminder',
        '⏰ Δεν έχει οριστεί ακόμη ώρα', '⏰ Event time not set yet',
        private.event_label(r.id) || ' · σε ' || (r.event_date - v_today) || ' ημέρες. Συμπληρώστε την ώρα της εκδήλωσης.',
        private.event_label(r.id) || ' · in ' || (r.event_date - v_today) || ' days. Please set the event time.',
        '#/event/' || r.id);
    exception when unique_violation then null;
    end;
  end loop;

  -- Ραντεβού/προσφορές χωρίς απάντηση για 10 ημέρες → ειδοποίηση (μία φορά)
  for r in select a.id, a.appt_date, concat_ws(' & ', nullif(a.name1, ''), nullif(a.name2, '')) as nm
             from public.appointments a
            where a.status = 'pending' and a.stale_notified_at is null
              and a.status_at < now() - interval '10 days' loop
    update public.appointments set stale_notified_at = now() where id = r.id;
    perform private.notify_admins('appointment',
      'Ραντεβού χωρίς απάντηση (10 ημέρες)', 'Appointment without an answer (10 days)',
      coalesce(r.nm, '—') || ' · ραντεβού ' || private.fmt_date(r.appt_date),
      coalesce(r.nm, '—') || ' · appointment ' || private.fmt_date(r.appt_date),
      '#/appointments');
  end loop;
  return v_count;
end $$;
