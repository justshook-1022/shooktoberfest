-- Manual slots, stable team IDs, and stable tee assignments. Only the server
-- service role may call this operation; the API authorizes the event admin.
create or replace function public.admin_apply_team_pairings(p_event_id uuid, p_pairings jsonb)
returns void language plpgsql security invoker set search_path = public as $$
declare
  pairing jsonb;
  target_team uuid;
  a_id uuid;
  b_id uuid;
  expected_count int;
  submitted_count int;
begin
  if p_pairings is null or jsonb_typeof(p_pairings) <> 'array' then
    raise exception 'Pairings must be a JSON array';
  end if;
  perform pg_advisory_xact_lock(hashtext(p_event_id::text));
  perform 1 from events where id = p_event_id for update;
  if not found then raise exception 'Event not found'; end if;
  perform 1 from players where event_id = p_event_id for update;
  perform 1 from teams where event_id = p_event_id for update;

  if exists (select 1 from scores s join teams t on t.id = s.team_id where t.event_id = p_event_id)
    or exists (select 1 from team_rounds r join teams t on t.id = r.team_id where t.event_id = p_event_id) then
    raise exception 'Pairings cannot be changed after a round has started';
  end if;

  for pairing in select value from jsonb_array_elements(p_pairings) loop
    if jsonb_typeof(pairing) <> 'object' or not (pairing ?& array['teamId','aPlayerId','bPlayerId']) then
      raise exception 'Reload the draw and choose A and B players manually';
    end if;
    target_team := nullif(pairing->>'teamId', '')::uuid;
    a_id := nullif(pairing->>'aPlayerId', '')::uuid;
    b_id := nullif(pairing->>'bPlayerId', '')::uuid;
    if target_team is not null and not exists (select 1 from teams where id = target_team and event_id = p_event_id) then
      raise exception 'Team does not belong to this event';
    end if;
    if target_team is null and a_id is null and b_id is null then
      raise exception 'New teams must contain at least one player';
    end if;
  end loop;

  if exists (
    select 1 from jsonb_array_elements(p_pairings) r
    where nullif(r->>'teamId','') is not null
    group by (r->>'teamId')::uuid having count(*) > 1
  ) then raise exception 'A team cannot appear more than once'; end if;
  if exists (
    select 1 from teams t where t.event_id = p_event_id and not exists (
      select 1 from jsonb_array_elements(p_pairings) r where nullif(r->>'teamId','')::uuid = t.id
    )
  ) then raise exception 'Saved teams have changed. Reload the draw before saving'; end if;

  select count(*) into expected_count from players where event_id = p_event_id and payment_status in ('paid','comped');
  select count(*) into submitted_count from jsonb_array_elements(p_pairings) r
    cross join lateral (values (nullif(r->>'aPlayerId','')::uuid), (nullif(r->>'bPlayerId','')::uuid)) m(id)
    where m.id is not null;
  if submitted_count <> expected_count then raise exception 'Every paid or comped player must appear exactly once'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_pairings) r
    cross join lateral (values (nullif(r->>'aPlayerId','')::uuid), (nullif(r->>'bPlayerId','')::uuid)) m(id)
    where m.id is not null group by m.id having count(*) > 1
  ) then raise exception 'A player cannot appear more than once'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_pairings) r
    cross join lateral (values (nullif(r->>'aPlayerId','')::uuid), (nullif(r->>'bPlayerId','')::uuid)) m(id)
    where m.id is not null and not exists (
      select 1 from players p where p.id = m.id and p.event_id = p_event_id and p.payment_status in ('paid','comped')
    )
  ) then raise exception 'Every selected player must be paid or comped in this event'; end if;

  update players set team_id = null, flight = null where event_id = p_event_id;
  for pairing in select value from jsonb_array_elements(p_pairings) loop
    target_team := nullif(pairing->>'teamId','')::uuid;
    a_id := nullif(pairing->>'aPlayerId','')::uuid;
    b_id := nullif(pairing->>'bPlayerId','')::uuid;
    if target_team is null then
      insert into teams(event_id) values(p_event_id) returning id into target_team;
    end if;
    update players set team_id = target_team, flight = 'A' where id = a_id and event_id = p_event_id;
    update players set team_id = target_team, flight = 'B' where id = b_id and event_id = p_event_id;
    update teams set name = coalesce((select string_agg(last_name, ' / ' order by last_name, first_name) from players where team_id = target_team), 'Players pending') where id = target_team;
  end loop;
end;
$$;
revoke execute on function public.admin_apply_team_pairings(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.admin_apply_team_pairings(uuid,jsonb) to service_role;
-- Retire the legacy automatic draw entirely.
revoke execute on function public.draw_teams(uuid,boolean) from public, anon, authenticated, service_role;
