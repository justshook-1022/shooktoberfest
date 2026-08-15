-- Preserve abandoned registrations so a signed-in golfer can resume payment,
-- while releasing their field spot until a replacement Checkout Session opens.
create or replace function check_field_cap() returns trigger
language plpgsql as $$
declare cap int; taken int;
begin
  if new.payment_status not in ('paid','pending','comped') then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext(new.event_id::text));
  select field_cap into cap from events where id = new.event_id;
  select count(*) into taken from players
    where event_id = new.event_id
      and payment_status in ('paid','pending','comped')
      and id <> new.id;
  if taken >= cap then raise exception 'Field is full (% of %)', taken, cap; end if;
  return new;
end $$;

drop trigger if exists trg_field_cap on players;
create trigger trg_field_cap
before insert or update of event_id, payment_status on players
for each row execute function check_field_cap();
