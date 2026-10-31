-- =====================================================================
--  Φύλλο Dimitris (Editing Workflow): νέα στήλη κατάστασης βίντεο
--  «έτοιμο να γίνει export» και στήλες μαγαζιού / αρχείων / αποθήκευσης
-- =====================================================================
alter table public.events drop constraint if exists events_editing_status_check;
alter table public.events add constraint events_editing_status_check
  check (editing_status in ('none', 'todo', 'in_progress', 'export', 'done'));

alter table public.events add column if not exists shop_status text;      -- Είναι στο μαγαζί;
alter table public.events add column if not exists files_copied text;     -- Περασμένα αρχεία
alter table public.events add column if not exists stored_at text;        -- Αποθηκευμένο σε
alter table public.events drop constraint if exists events_shop_status_check;
alter table public.events add constraint events_shop_status_check check (shop_status is null or shop_status in ('to_deliver', 'delivered'));
alter table public.events drop constraint if exists events_files_copied_check;
alter table public.events add constraint events_files_copied_check check (files_copied is null or files_copied in ('yes', 'no'));
alter table public.events drop constraint if exists events_stored_at_check;
alter table public.events add constraint events_stored_at_check check (stored_at is null or stored_at in ('home', 'shop', 'both'));

alter table public.events alter column shop_status set default 'to_deliver';
update public.events set shop_status = 'to_deliver' where shop_status is null;
