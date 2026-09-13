-- Shared scramble rounds. Existing cards remain resumable after deployment.
alter table public.scores add column putts integer;
alter table public.scores add constraint scores_putts_valid
  check (putts is null or (putts >= 0 and putts <= strokes));

create table public.team_rounds (
  team_id uuid primary key references public.teams(id) on delete cascade,
  started_by uuid references public.players(id) on delete set null,
  started_at timestamptz not null default now()
);
alter table public.team_rounds enable row level security;
revoke all on public.team_rounds from public, anon, authenticated;
grant select on public.team_rounds to anon, authenticated;
grant insert (team_id, started_by) on public.team_rounds to authenticated;
grant all on public.team_rounds to service_role;
create policy round_read on public.team_rounds for select to anon, authenticated using (true);
create policy round_start on public.team_rounds for insert to authenticated with check (
  exists (
    select 1 from public.players p
    join public.teams t on t.id = p.team_id and t.event_id = p.event_id
    join public.events e on e.id = t.event_id
    where p.id = started_by and p.auth_user_id = (select auth.uid())
      and p.team_id = team_rounds.team_id and p.payment_status in ('paid','comped')
      and t.status = 'active' and e.scoring_open
  )
);
insert into public.team_rounds (team_id, started_at)
select team_id, coalesce(min(updated_at), now()) from public.scores group by team_id;

-- Keep authorization at the database boundary, including direct API writes.
drop policy score_insert on public.scores;
drop policy score_update on public.scores;
create policy score_insert on public.scores for insert to authenticated with check (
  is_admin() or (putts is not null and exists (
    select 1 from public.players p
    join public.teams t on t.id = p.team_id and t.event_id = p.event_id
    join public.events e on e.id = t.event_id
    join public.team_rounds r on r.team_id = t.id
    where p.auth_user_id = (select auth.uid()) and p.id = scores.entered_by
      and p.team_id = scores.team_id and p.payment_status in ('paid','comped')
      and t.status = 'active' and e.scoring_open
  ))
);
create policy score_update on public.scores for update to authenticated using (
  is_admin() or exists (
    select 1 from public.players p
    join public.teams t on t.id = p.team_id and t.event_id = p.event_id
    join public.events e on e.id = t.event_id
    join public.team_rounds r on r.team_id = t.id
    where p.auth_user_id = (select auth.uid()) and p.team_id = scores.team_id
      and p.payment_status in ('paid','comped') and t.status = 'active' and e.scoring_open
  )
) with check (
  is_admin() or (putts is not null and exists (
    select 1 from public.players p
    join public.teams t on t.id = p.team_id and t.event_id = p.event_id
    join public.events e on e.id = t.event_id
    join public.team_rounds r on r.team_id = t.id
    where p.auth_user_id = (select auth.uid()) and p.id = scores.entered_by
      and p.team_id = scores.team_id and p.payment_status in ('paid','comped')
      and t.status = 'active' and e.scoring_open
  ))
);

-- Serialize saves to a hole. A retry is idempotent; a stale teammate edit
-- receives a conflict instead of silently overwriting a more recent score.
create function public.save_team_hole(
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
    raise exception 'This hole changed on another device. Review the latest score before saving again.' using errcode = '40001';
  end if;
  return query insert into public.scores (team_id, hole, strokes, putts, entered_by)
    values (p_team_id, p_hole, p_strokes, p_putts, p_player_id)
    on conflict (team_id, hole) do update set strokes = excluded.strokes,
      putts = excluded.putts, entered_by = excluded.entered_by
    returning *;
end;
$$;
revoke all on function public.save_team_hole(uuid,uuid,integer,integer,integer,timestamptz) from public, anon;
grant execute on function public.save_team_hole(uuid,uuid,integer,integer,integer,timestamptz) to authenticated;

alter publication supabase_realtime add table public.team_rounds;

-- The scorecard is a public-safe projection of public course and score data.
create or replace view public.team_scorecard with (security_invoker = true) as
select t.id as team_id, ch.hole, ch.par, ch.stroke_index, ch.tee_name, ch.yardage,
       public.strokes_received(public.team_handicap(t.id), ch.stroke_index) as strokes_given,
       s.strokes,
       s.strokes - public.strokes_received(public.team_handicap(t.id), ch.stroke_index) as net_hole,
       s.putts
from public.teams t
join public.course_holes ch on ch.event_id = t.event_id
left join public.scores s on s.team_id = t.id and s.hole = ch.hole;

-- Rank each event independently.
create or replace view public.leaderboard with (security_invoker = true) as
with hcp as (
  select id as team_id, event_id, name, tee_group_id, playoff_rank, status,
         team_handicap(id) as team_hcp
  from teams
),
holes as (
  select h.team_id, h.event_id, h.name, h.playoff_rank, h.status, h.team_hcp,
         h.tee_group_id, s.hole, s.strokes, ch.par, ch.stroke_index,
         s.strokes - strokes_received(h.team_hcp, ch.stroke_index) as net_hole,
         s.strokes - ch.par - strokes_received(h.team_hcp, ch.stroke_index) as net_to_par_hole
  from hcp h
  left join scores s on s.team_id = h.team_id
  left join course_holes ch on ch.event_id = h.event_id and ch.hole = s.hole
),
agg as (
  select x.team_id, x.event_id, x.name, x.playoff_rank, x.status, x.team_hcp, g.tee_time,
         count(x.hole) as holes_played,
         coalesce(sum(x.strokes),0) as gross,
         coalesce(sum(x.strokes - x.par),0) as to_par,
         coalesce(sum(x.net_hole),0) as net_raw,
         coalesce(sum(x.net_to_par_hole),0) as net_to_par_raw,
         array_agg(x.net_hole order by x.hole desc) filter (where x.hole is not null) as countback
  from holes x
  left join tee_groups g on g.id = x.tee_group_id
  group by x.team_id, x.event_id, x.name, x.playoff_rank, x.status, x.team_hcp, g.tee_time
)
select team_id, event_id, name as team_name, tee_time, status,
       holes_played, gross, to_par, team_hcp, playoff_rank,
       case when holes_played = 0 then null else net_raw end as net,
       case when holes_played = 0 then null else net_to_par_raw end as net_to_par,
       countback,
       rank() over (
         partition by event_id
         order by (status <> 'active'),
                  (holes_played = 0),
                  playoff_rank nulls last,
                  case when holes_played = 0 then null else net_to_par_raw end,
                  countback
       ) as position
from agg;

-- Admin corrections retain recorded putts whenever they remain valid.
create or replace function public.admin_save_scorecard(
  p_event_id uuid,
  p_team_id uuid,
  p_scores jsonb,
  p_entered_by uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if jsonb_typeof(p_scores) <> 'object' then
    raise exception 'Scores must be a JSON object';
  end if;

  if not exists (select 1 from teams where id = p_team_id and event_id = p_event_id) then
    raise exception 'Team does not belong to this event';
  end if;

  if p_entered_by is not null and not exists (
    select 1 from players where id = p_entered_by and event_id = p_event_id
  ) then
    raise exception 'Scorekeeper does not belong to this event';
  end if;

  if exists (
    select 1
    from jsonb_each_text(p_scores) as score(hole, strokes)
    where score.hole !~ '^([1-9]|1[0-8])$'
       or score.strokes !~ '^[0-9]+$'
       or score.strokes::int not between 1 and 15
  ) then
    raise exception 'Scores require holes 1-18 and strokes 1-15';
  end if;

  delete from scores where team_id = p_team_id and not (p_scores ? hole::text);

  insert into scores (team_id, hole, strokes, entered_by)
  select p_team_id, score.hole::int, score.strokes::int, p_entered_by
  from jsonb_each_text(p_scores) as score(hole, strokes)
  on conflict (team_id, hole) do update set
    strokes = excluded.strokes, entered_by = excluded.entered_by,
    putts = case when scores.putts <= excluded.strokes then scores.putts else null end;
end;
$$;

