-- Invoked only through the authenticated, event-scoped admin API.
-- One transaction resets the selected team's card or the whole event.
create function public.admin_reset_scoring(
  p_event_id uuid, p_team_id uuid default null, p_clear_greenies boolean default false
) returns void language plpgsql security invoker set search_path = '' as $$
declare selected_team uuid;
begin
  if p_event_id is null or not exists (select 1 from public.events where id = p_event_id) then
    raise exception 'Event not found.' using errcode = '22023';
  end if;
  if p_team_id is not null and not exists (
    select 1 from public.teams where id = p_team_id and event_id = p_event_id
  ) then
    raise exception 'Team does not belong to this event.' using errcode = '22023';
  end if;
  if p_team_id is not null and p_clear_greenies then
    raise exception 'Closest-to-pin results can only be cleared for the whole event.' using errcode = '22023';
  end if;
  -- Use the same team lock as score saves, in a consistent order.
  for selected_team in select id from public.teams
    where event_id = p_event_id and (p_team_id is null or id = p_team_id) order by id
  loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(selected_team::text, 0));
    delete from public.scores where team_id = selected_team;
    delete from public.team_rounds where team_id = selected_team;
    update public.teams set status = 'active', playoff_rank = null where id = selected_team;
  end loop;
  if p_clear_greenies then delete from public.greenies where event_id = p_event_id; end if;
end;
$$;
revoke all on function public.admin_reset_scoring(uuid,uuid,boolean) from public, anon, authenticated;
grant execute on function public.admin_reset_scoring(uuid,uuid,boolean) to service_role;

-- New clients include the round start timestamp. An old save/retry cannot
-- populate the new round, even if a teammate restarts before the request arrives.
create function public.save_started_team_hole(
  p_team_id uuid, p_player_id uuid, p_hole integer, p_strokes integer,
  p_putts integer, p_expected_updated_at timestamptz, p_round_started_at timestamptz
) returns setof public.scores language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_team_id::text, 0));
  if p_round_started_at is null or not exists (
    select 1 from public.team_rounds where team_id = p_team_id and started_at = p_round_started_at
  ) then
    raise exception 'This round was reset. Start or reload the current round before saving.' using errcode = 'PT410';
  end if;
  return query select * from public.save_team_hole(p_team_id,p_player_id,p_hole,p_strokes,p_putts,p_expected_updated_at);
end;
$$;
revoke all on function public.save_started_team_hole(uuid,uuid,integer,integer,integer,timestamptz,timestamptz) from public, anon;
grant execute on function public.save_started_team_hole(uuid,uuid,integer,integer,integer,timestamptz,timestamptz) to authenticated;

-- Serialize existing clients with an administrator reset as well.
create or replace function public.save_team_hole(
  p_team_id uuid, p_player_id uuid, p_hole integer, p_strokes integer,
  p_putts integer, p_expected_updated_at timestamptz default null
) returns setof public.scores
language plpgsql security invoker set search_path = '' as $$
declare previous public.scores;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_team_id::text, 0));
  if auth.uid() is null or not exists (
    select 1 from public.players p join public.teams t on t.id = p.team_id
    join public.events e on e.id = t.event_id
    join public.team_rounds r on r.team_id = t.id
    where p.id = p_player_id and p.auth_user_id = auth.uid()
      and p.team_id = p_team_id and p.event_id = t.event_id
      and p.payment_status in ('paid','comped') and t.status = 'active' and e.scoring_open
  ) then
    raise exception 'Scoring is closed or this scorecard is not available to your account.' using errcode = '42501';
  end if;
  if p_hole is null or p_hole not between 1 and 18 or p_strokes is null
     or p_strokes not between 1 and 15 or p_putts is null or p_putts not between 0 and p_strokes then
    raise exception 'Enter a gross score from 1 to 15 and putts from 0 to the gross score.' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_team_id::text || ':' || p_hole::text, 0));
  select * into previous from public.scores where team_id = p_team_id and hole = p_hole;
  if found and previous.strokes = p_strokes and previous.putts = p_putts then
    return next previous;
    return;
  end if;
  if previous.updated_at is distinct from p_expected_updated_at then
    raise exception 'This hole changed on another device. Review the latest score before saving again.' using errcode = 'PT409';
  end if;
  return query insert into public.scores (team_id, hole, strokes, putts, entered_by)
    values (p_team_id, p_hole, p_strokes, p_putts, p_player_id)
    on conflict (team_id, hole) do update set strokes = excluded.strokes,
      putts = excluded.putts, entered_by = excluded.entered_by
    returning *;
end;
$$;
