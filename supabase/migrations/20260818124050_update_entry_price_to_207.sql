alter table public.events
  alter column entry_cents set default 20700;

update public.events
set entry_cents = 20700
where name = 'Shooktoberfest'
  and event_date = date '2026-10-02';
