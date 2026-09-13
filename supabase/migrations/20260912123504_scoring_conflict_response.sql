-- A stale edit is an application conflict, not a retryable transaction failure.
create or replace function public.save_team_hole(
  p_team_id uuid, p_player_id uuid, p_hole integer, p_strokes integer,
  p_putts integer, p_expected_updated_at timestamptz default null
) returns setof public.scores
language plpgsql security invoker set search_path = '' as $$
declare previous public.scores;
begin
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
