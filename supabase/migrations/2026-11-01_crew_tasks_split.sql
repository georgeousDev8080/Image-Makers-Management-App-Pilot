-- 1ο συνεργείο: «όλη η εκδήλωση» + σπίτι γαμπρού ή νύφης · 2ο: τα υπόλοιπα
alter table public.event_crew drop constraint if exists event_crew_tasks_check;
alter table public.event_crew add constraint event_crew_tasks_check
  check (tasks <@ array['all', 'groom_house', 'bride_house', 'houses', 'church', 'reception', 'drone']::text[]);
