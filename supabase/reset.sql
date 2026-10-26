-- =====================================================================
--  IMAGE MAKERS · Καθάρισμα πριν την παράδοση
--  Σβήνει ΟΛΑ τα δεδομένα και ΟΛΟΥΣ τους λογαριασμούς (και τους demo).
--  Κρατά: πρότυπα μηνυμάτων, ρυθμίσεις, τη δομή της βάσης.
--  Supabase → SQL Editor → New query → επικόλληση → Run.
--  Στο τέλος εμφανίζεται ο νέος ΚΩΔΙΚΟΣ ΙΔΙΟΚΤΗΤΗ.
--  Τα PDF σβήνονται χωριστά: Storage → offers → επιλογή όλων → Delete.
-- =====================================================================
delete from public.appointments;
delete from public.offer_requests;
delete from public.message_queue;
delete from public.payments;
delete from public.event_crew;
delete from public.expenses;
delete from public.events;
delete from public.customers;
delete from auth.users;
delete from public.invite_codes;
delete from public.activity_log;
delete from public.notifications;
delete from public.push_subscriptions;
delete from private.sent_keys;
delete from private.config where key in ('functions_url','vapid_private_jwk','vapid_subject');
delete from public.app_settings where key = 'vapid_public';
select public.new_owner_code() as "ΚΩΔΙΚΟΣ ΙΔΙΟΚΤΗΤΗ";
