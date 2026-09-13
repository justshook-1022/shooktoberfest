-- Apply immediately after shooktoberfest_schema.sql.
-- Security and consistency corrections identified during implementation review.

-- SECURITY DEFINER admin functions must never be callable by public roles.
revoke execute on function draw_teams(uuid, boolean) from public, anon, authenticated;
revoke execute on function assign_tee_groups(uuid) from public, anon, authenticated;
grant execute on function draw_teams(uuid, boolean) to service_role;
grant execute on function assign_tee_groups(uuid) to service_role;

-- Keep the public roster limited to entries that currently hold a field spot.
-- This makes public counts correct after a refund without exposing payment data.
create or replace view roster as
select p.id as player_id, p.event_id, p.first_name, p.last_name,
       p.team_id, t.name as team_name, p.flight,
       g.tee_time, g.starting_hole
from players p
left join teams t on t.id = p.team_id
left join tee_groups g on g.id = t.tee_group_id
where p.payment_status in ('paid','pending','comped');

-- A signed-in golfer may read only their own private player row.
-- Public names, teams, and times continue to come from the roster view.
drop policy if exists player_read on players;
create policy player_read on players for select using (
  auth_user_id = auth.uid() or is_admin()
);

-- Players may insert/update their own team's score only while scoring is open,
-- and may attribute the entry only to themselves. Service-role admin writes bypass RLS.
drop policy if exists score_insert on scores;
create policy score_insert on scores for insert with check (
  is_admin() or (
    team_id = my_team_id()
    and entered_by in (select id from players where auth_user_id = auth.uid())
    and exists (
      select 1 from teams t join events e on e.id = t.event_id
      where t.id = team_id and e.scoring_open
    )
  )
);

drop policy if exists score_update on scores;
create policy score_update on scores for update
  using (
    is_admin() or (
      team_id = my_team_id()
      and exists (
        select 1 from teams t join events e on e.id = t.event_id
        where t.id = team_id and e.scoring_open
      )
    )
  )
  with check (
    is_admin() or (
      team_id = my_team_id()
      and entered_by in (select id from players where auth_user_id = auth.uid())
      and exists (
        select 1 from teams t join events e on e.id = t.event_id
        where t.id = team_id and e.scoring_open
      )
    )
  );

-- Admin can moderate reactions just like photos and comments.
drop policy if exists react_owner on reactions;
create policy react_owner on reactions for delete using (
  player_id in (select id from players where auth_user_id = auth.uid()) or is_admin()
);

-- Prize money is funded by paid entries. A comped golfer still plays but does
-- not silently add an unfunded $75 to the pot.
create or replace view payout_summary as
with cfg as (
  select e.id as event_id, e.pot_cents, e.greenie_cents,
         e.payout_first_pct, e.payout_second_pct, e.payout_third_pct,
         (select count(*) from players p
            where p.event_id = e.id and p.payment_status = 'paid') as paid_players,
         (select count(*) from course_holes ch
            where ch.event_id = e.id and ch.par = 3) as par3_count
  from events e
),
calc as (
  select *, paid_players * pot_cents as pot_cents_total,
            par3_count * greenie_cents as greenie_pool_cents,
            greatest(0, paid_players * pot_cents - par3_count * greenie_cents) as distributable_cents
  from cfg
)
select event_id, paid_players, pot_cents_total, par3_count, greenie_cents,
       greenie_pool_cents, distributable_cents,
       round(distributable_cents * payout_first_pct)::int  as first_cents,
       round(distributable_cents * payout_second_pct)::int as second_cents,
       round(distributable_cents * payout_third_pct)::int  as third_cents
from calc;

-- Status is the outermost ranking bucket so WD/DQ teams are always last.
create or replace view leaderboard as
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
         order by (status <> 'active'),
                  (holes_played = 0),
                  playoff_rank nulls last,
                  case when holes_played = 0 then null else net_to_par_raw end,
                  countback
       ) as position
from agg;
