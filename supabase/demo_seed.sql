-- =====================================================================
--  IMAGE MAKERS · Δεδομένα επίδειξης (DEMO) για δοκιμές
--  Δημιουργεί 5 δοκιμαστικούς λογαριασμούς (PIN 123456) και ενδεικτικά
--  δεδομένα. Πριν την παράδοση: τρέξτε το supabase/reset.sql
-- =====================================================================
do $$
declare
  u_admin uuid := '0d000000-0000-4000-8000-000000000001';
  u_video uuid := '0d000000-0000-4000-8000-000000000002';
  u_photo uuid := '0d000000-0000-4000-8000-000000000003';
  u_vid   uuid := '0d000000-0000-4000-8000-000000000004';
  u_new   uuid := '0d000000-0000-4000-8000-000000000005';
  acc record; i int; c_id uuid; e_id uuid; d date; price numeric; cat text; pst text; est text;
  names text[][] := array[
    ['Γιάννης Αλεξίου','Μαρία Νικολάου'],['Αντώνης Δήμου','Κατερίνα Βλάχου'],['Βασίλης Γκούμας','Ειρήνη Σούλη'],
    ['Χρήστος Λιάπης','Δέσποινα Ράπτη'],['Θανάσης Μπίκας','Σοφία Καραγιάννη'],['Πέτρος Ζιώγας','Αθηνά Παππά'],
    ['Μιχάλης Τζήκας','Ευαγγελία Ντόκου'],['Λευτέρης Χατζής','Χαρά Αργυρίου'],['Παναγιώτης Σαββίδης','Αναστασία Μάνου'],
    ['Σπύρος Κουτσός','Βάσω Γεωργίου'],['Οικογένεια Τσακίρη',''],['Ηλίας Ρίζος','Δήμητρα Λαμπρίδου']];
  mails text[] := array['g.alexiou','a.dimou','v.goumas','ch.liapis','th.bikas','p.ziogas','m.tzikas','l.chatzis','p.savvidis','s.koutsos','tsakiri.fam','i.rizos'];
  offs int[] := array[-160,-128,-104,-78,-55,-34,-20,-9,3,12,24,60];
  cats text[] := array['wedding','wedding','wedding_baptism','wedding','baptism','wedding','wedding','promo','wedding','baptism','wedding','wedding'];
  psts text[] := array['delivered','ready','lab','changes','samples_waiting','samples_waiting','samples_todo','samples_todo','samples_todo','samples_todo','samples_todo','samples_todo'];
  ests text[] := array['done','done','in_progress','todo','in_progress','todo','none','none','none','none','none','none'];
  pst_age int[] := array[90,9,12,24,22,8,0,0,0,0,0,0];
  prices numeric[] := array[2900,3200,3600,2700,1100,3100,2950,650,3300,1050,2800,3450];
  churches text[] := array['Ι.Ν. Αγίου Αχιλλίου, Λάρισα','Ι.Ν. Αγίου Νικολάου, Λάρισα','Ι.Ν. Αγίου Κωνσταντίνου, Λάρισα','Ι.Ν. Αγίας Παρασκευής, Τύρναβος','Ι.Ν. Αγίου Αθανασίου, Αμπελώνας','Ι.Ν. Μεταμορφώσεως, Λάρισα'];
  recs text[] := array['Κτήμα Βαρδάκη, Λάρισα','Αίθουσα Divani, Λάρισα','Κτήμα Δήλος, Τύρναβος','Ktima Avra, Συκούριο','Κτήμα Αμάλθεια, Λάρισα'];
begin
  -- Λογαριασμοί (κωδικός / PIN: 123456)
  for acc in select * from (values
      (u_admin, 'demo.admin@imagemakers.demo', 'demo_admin', 'Demo Διαχειριστής (Φωτογράφος)', 'admin_photo'),
      (u_video, 'demo.video@imagemakers.demo', 'demo_video', 'Demo Διαχειριστής (Βιντεογράφος)', 'admin_video'),
      (u_photo, 'demo.photo@imagemakers.demo', 'demo_photo', 'Demo Φωτογράφος', 'photographer'),
      (u_vid,   'demo.vid@imagemakers.demo',   'demo_vid',   'Demo Βιντεογράφος', 'videographer'),
      (u_new,   'demo.new@imagemakers.demo',   'demo_new',   'Demo Νέος λογαριασμός', null)
    ) as t(id, email, username, full_name, role) loop
    if not exists (select 1 from auth.users where id = acc.id) then
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                              raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                              confirmation_token, recovery_token, email_change, email_change_token_new)
      values ('00000000-0000-0000-0000-000000000000', acc.id, 'authenticated', 'authenticated', acc.email,
              extensions.crypt('123456', extensions.gen_salt('bf')), now(),
              '{"provider":"email","providers":["email"]}',
              jsonb_build_object('username', acc.username, 'full_name', acc.full_name, 'lang', 'el'),
              now(), now(), '', '', '', '');
      update auth.users set email_change_token_current = '', phone_change = '', phone_change_token = '', reauthentication_token = '' where id = acc.id;
      insert into auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at, last_sign_in_at)
      values (gen_random_uuid(), acc.id, acc.id::text,
              jsonb_build_object('sub', acc.id::text, 'email', acc.email, 'email_verified', true),
              'email', now(), now(), now());
    end if;
    update public.profiles set role = acc.role, full_name = acc.full_name where id = acc.id;
  end loop;

  if exists (select 1 from public.events) then
    raise notice 'Υπάρχουν ήδη εκδηλώσεις — δεν προστέθηκαν δεδομένα επίδειξης.';
    return;
  end if;

  -- Πελάτες, εκδηλώσεις, πακέτα, συνεργείο, πληρωμές
  for i in 1..12 loop
    d := current_date + offs[i];
    insert into public.customers(name1, name2, phone1, phone2, email1, created_by, created_at)
    values (names[i][1], nullif(names[i][2], ''), '69' || (81234500 + i * 137)::text,
            case when names[i][2] <> '' then '69' || (91234500 + i * 211)::text end,
            mails[i] || '@gmail.com', u_admin, now() - interval '200 days')
    returning id into c_id;
    insert into public.events(customer_id, category, event_date, event_time, church_location, house_location, reception_location,
                              resolution, notes, offer_path, photo_status, editing_status, editing_pc, created_by, created_at)
    values (c_id, cats[i], d, (array['17:00','18:30','19:00','12:30'])[1 + i % 4]::time, churches[1 + i % 6], 'Λάρισα', recs[1 + i % 5],
            case when i % 3 = 0 then '1080' else '4k' end, case when i = 9 then 'Drone στην έξοδο της εκκλησίας' end, null,
            psts[i], ests[i], (array['mac_mini','macbook','win_pc'])[1 + i % 3], u_admin, now() - interval '150 days')
    returning id into e_id;
    update public.events set photo_status_at = now() - make_interval(days => pst_age[i]) where id = e_id;
    insert into public.event_finance(event_id, package_price, package_name, second_crew)
    values (e_id, prices[i], case cats[i] when 'baptism' then 'Βάπτιση Premium' when 'promo' then 'Promo video' else 'Γάμος Gold' end, i % 2 = 0)
    on conflict (event_id) do update set package_price = excluded.package_price, package_name = excluded.package_name, second_crew = excluded.second_crew;
    insert into public.event_crew(event_id, user_id, duty) values (e_id, u_photo, 'photo'), (e_id, u_vid, 'video') on conflict do nothing;
    insert into public.payments(event_id, category, kind, label, amount, paid_on, method, created_by, created_at)
    values (e_id, cats[i], 'deposit', 'Προκαταβολή', round(prices[i] * 0.3), d - 120, 'bank', u_admin, now() - interval '30 days');
    if offs[i] < 0 then
      insert into public.payments(event_id, category, kind, label, amount, paid_on, method, created_by, created_at)
      values (e_id, cats[i], 'installment', '2η δόση', round(prices[i] * case when i = 7 then 0.2 else 0.5 end), d + 1, 'cash', u_admin, now() - interval '20 days');
      if i <= 3 then
        insert into public.payments(event_id, category, kind, label, amount, paid_on, method, created_by, created_at)
        values (e_id, cats[i], 'installment', 'Εξόφληση', prices[i] - round(prices[i] * 0.3) - round(prices[i] * 0.5), d + 30, 'iris', u_admin, now() - interval '10 days');
      end if;
    end if;
  end loop;

  -- Έξοδα (τελευταίοι 6 μήνες)
  for i in 0..5 loop
    d := (date_trunc('month', current_date) - make_interval(months => i))::date + 4;
    insert into public.expenses(kind, subcategory, amount, paid_on, method, description) values
      ('shop', 'rent', 450, d, 'bank', 'Ενοίκιο'), ('shop', 'electricity', 85 + i * 7, d, 'card', 'ΔΕΗ'), ('shop', 'internet', 35, d, 'card', 'Cosmote');
    insert into public.expenses(kind, crew_id, crew_name, for_month, amount, paid_on, method)
      values ('payroll', u_photo, 'Demo Φωτογράφος', date_trunc('month', d)::date, 900, d, 'bank');
    insert into public.expenses(kind, crew_id, crew_name, paid_until, days, amount, paid_on, method)
      values ('daily_wage', u_vid, 'Demo Βιντεογράφος', d - 5, 4, 320, d, 'cash');
  end loop;
  insert into public.expenses(kind, amount, paid_on, method, supplier, description)
    values ('investment', 2450, current_date - 100, 'card', 'Kafkas', 'Sony FE 24-70mm GM II');

  -- Προσφορές / Ραντεβού
  insert into public.appointments(mode, appt_date, category, name1, name2, phone, email, event_date, church, total, status, status_at, reason, comments, created_by, created_at) values
    ('store',  current_date - 1,  'wedding', 'Δημήτρης Παππάς', 'Ελένη Καρρά', '6944556677', 'd.pappas@gmail.com', current_date + 240, 'Ι.Ν. Αγίου Νικολάου, Λάρισα', 3150, 'pending', now() - interval '1 day', null, null, u_admin, now() - interval '1 day'),
    ('store',  current_date - 14, 'wedding', 'Κωνσταντίνος Ρήγας', 'Ιωάννα Φλώρου', '6955234567', null, current_date + 300, 'Ι.Ν. Αγίας Παρασκευής, Τύρναβος', 2400, 'pending', now() - interval '14 days', null, 'Θα το συζητήσουν με τους γονείς', u_admin, now() - interval '14 days'),
    ('store',  current_date - 20, 'baptism', 'Οικογένεια Ζήση', null, '6933221100', null, current_date + 40, 'Ι.Ν. Αγίου Κωνσταντίνου, Λάρισα', 1150, 'rejected', now() - interval '8 days', 'price', 'Βρήκαν φθηνότερη προσφορά.', u_admin, now() - interval '20 days'),
    ('store',  current_date - 60, 'wedding', 'Σωτήρης Μπάρμπας', 'Κική Νάνου', '6977445566', null, current_date + 250, null, 2700, 'rejected', now() - interval '55 days', 'competitor', 'Ήθελαν πιο «documentary» ύφος.', u_admin, now() - interval '60 days'),
    ('online', current_date - 12, 'wedding', 'Νίκος Δήμου', 'Χρύσα Λάππα', '6977001122', 'n.dimou@gmail.com', current_date + 210, null, 2850, 'pending', now() - interval '12 days', null, null, null, now() - interval '12 days'),
    ('online', current_date - 40, 'wedding', 'Γιώργος Σταμούλης', 'Ρένα Τζιόλα', '6988112233', null, current_date + 300, null, 3300, 'rejected', now() - interval '30 days', 'date', 'Η ημερομηνία ήταν κλεισμένη.', null, now() - interval '40 days');
  insert into public.appointments(mode, appt_date, category, name1, name2, phone, event_date, church, total, status, status_at, event_id, customer_id, created_by, created_at)
  select case when rn % 2 = 0 then 'online' else 'store' end, e.event_date - 200, e.category, c.name1, c.name2, c.phone1, e.event_date, e.church_location,
         f.package_price, 'confirmed', now() - interval '100 days', e.id, c.id, u_admin, now() - interval '110 days'
    from (select e.*, row_number() over (order by e.event_date) rn from public.events e) e
    join public.customers c on c.id = e.customer_id join public.event_finance f on f.event_id = e.id
   where e.rn <= 6;

  -- Ηλεκτρονική προσφορά όπως έρχεται από τη σελίδα πελάτη (δημιουργεί και ραντεβού)
  insert into public.offer_requests(partner1, partner2, phone1, email, wedding_date, church, church_time, reception, reception_time, selections, client_total)
  values ('Άρης Καλογιάννης', 'Νεφέλη Στάθη', '6944123456', 'aris.k@gmail.com', current_date + 230, 'Ι.Ν. Αγίου Αχιλλίου', '19:00', 'Κτήμα Βαρδάκη', '21:00',
          '{"smallAlbums":3,"upgrades":{"secondCrew":"1"}}', 3650);

  perform public.run_automations();
end $$;
