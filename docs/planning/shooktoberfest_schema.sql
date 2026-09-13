-- ============================================================
-- SHOOKTOBERFEST — Supabase schema (v5, audited)
--
-- 2-person scramble | 32-player field | $200/golfer
-- Signup = 1 golfer + wife | random A+B draw after signups close
-- Mt Prospect (Black tees), PAR 70, 6305 yds — scorecard verified
-- Sequential start, first tee 10:00 AM CT, Fri Oct 2 2026
-- Greenies: $50 each, 5 par-3s (4,7,10,12,16), paid to the INDIVIDUAL
-- Pot: remainder split 60/30/10
-- Ties: 1st decided by playoff hole (recorded in teams.playoff_rank);
--       2nd/3rd by low net countback on 18, 17, 16, 15 ...
--
-- NOTE ON SIGNUPS: players has NO anon INSERT policy, by design.
-- Signup rows are created server-side (Next.js route handler using the
-- service-role key) so nobody can register without going through Stripe.
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- EVENT / COURSE
-- ------------------------------------------------------------
create table events (
  id                uuid primary key default gen_random_uuid(),
  name              text not null default 'Shooktoberfest',
  event_date        date not null,
  course_name       text not null default 'Mt Prospect Golf Club',
  entry_cents       int not null default 20000,  -- $200: golf, $75 pot, food, drink, band
  pot_cents         int not null default 7500,   -- per-player contribution to pot
  greenie_cents     int not null default 5000,   -- payout per greenie
  payout_first_pct  numeric not null default 0.60,
  payout_second_pct numeric not null default 0.30,
  payout_third_pct  numeric not null default 0.10,
  field_cap         int not null default 32,
  signups_open      boolean not null default true,
  scoring_open      boolean not null default false,
  created_at        timestamptz default now()
);

create table course_holes (
  event_id      uuid references events(id) on delete cascade,
  hole          int not null check (hole between 1 and 18),
  par           int not null,
  tee_name      text,   -- custom routing: which tee box this hole is played from
  yardage       int,    -- yardage FROM THAT TEE, not a standard set
  stroke_index  int not null check (stroke_index between 1 and 18),
  primary key (event_id, hole),
  unique (event_id, stroke_index)
);

-- ------------------------------------------------------------
-- TEE GROUPS (foursome = 2 teams sharing a tee time)
-- ------------------------------------------------------------
create table tee_groups (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references events(id) on delete cascade,
  tee_time      timestamptz,
  starting_hole int not null default 1,
  sort_order    int,
  created_at    timestamptz default now()
);

-- ------------------------------------------------------------
-- TEAMS (2-player scramble team = the scoring unit)
-- ------------------------------------------------------------
create type team_status as enum ('active','wd','dq');

create table teams (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references events(id) on delete cascade,
  tee_group_id  uuid references tee_groups(id) on delete set null,
  name          text,
  status        team_status not null default 'active',
  playoff_rank  int,     -- set by admin only if there's a playoff for 1st
  created_at    timestamptz default now()
);

-- ------------------------------------------------------------
-- PLAYERS
-- ------------------------------------------------------------
create type shirt_size as enum ('S','M','L','XL','2XL','3XL');
create type pay_status as enum ('unpaid','pending','paid','refunded','comped');
create type flight     as enum ('A','B');

create table players (
  id                uuid primary key default gen_random_uuid(),
  event_id          uuid not null references events(id) on delete cascade,
  auth_user_id      uuid references auth.users(id) on delete set null,

  first_name        text not null,
  last_name         text not null,
  email             text not null,
  phone             text,

  handicap_index    int,            -- whole numbers only
  course_handicap   int,            -- whole numbers only; admin sets before the draw
  flight            flight,         -- assigned by draw_teams()
  shirt_size        shirt_size not null,

  team_id           uuid references teams(id) on delete set null,

  wife_attending    boolean not null default false,
  wife_name         text,
  wife_shirt_size   shirt_size,

  payment_status    pay_status not null default 'unpaid',
  stripe_session_id text,
  amount_paid_cents int not null default 0,

  is_admin          boolean not null default false,
  created_at        timestamptz default now(),
  unique (event_id, email),
  constraint wife_details_required check (
    not wife_attending or (wife_name is not null and wife_shirt_size is not null)
  )
);

create index on players (event_id, team_id);
create index on players (event_id, flight);
create index on players (event_id, payment_status);
create index on players (auth_user_id);

-- Max 2 golfers per team
create or replace function check_team_size() returns trigger
language plpgsql as $$
begin
  if new.team_id is not null and
     (select count(*) from players where team_id = new.team_id and id <> new.id) >= 2
  then raise exception 'Team % already has 2 players', new.team_id;
  end if;
  return new;
end $$;

create trigger trg_team_size before insert or update of team_id on players
for each row execute function check_team_size();

-- Field cap: paid/pending/comped hold a spot, abandoned checkouts don't
create or replace function check_field_cap() returns trigger
language plpgsql as $$
declare cap int; taken int;
begin
  -- Serialize concurrent signups for this event. Without this, two inserts
  -- landing at spot 32 simultaneously both count 31 taken and both pass,
  -- overselling the field. The lock releases at transaction end.
  perform pg_advisory_xact_lock(hashtext(new.event_id::text));
  select field_cap into cap from events where id = new.event_id;
  select count(*) into taken from players
    where event_id = new.event_id
      and payment_status in ('paid','pending','comped')
      and id <> new.id;
  if taken >= cap then raise exception 'Field is full (% of %)', taken, cap; end if;
  return new;
end $$;

create trigger trg_field_cap before insert on players
for each row execute function check_field_cap();

-- ------------------------------------------------------------
-- RANDOM A/B DRAW — admin runs once after signups close.
-- Ranks paid field by handicap, splits at median (A = low, B = high),
-- shuffles each flight, pairs A[i] with B[i].
--
-- GUARDED: deleting teams cascade-deletes scores, so re-running this
-- after play has started would wipe the tournament. Refuses to run if
-- any score exists unless p_force is explicitly true.
-- ------------------------------------------------------------
create or replace function draw_teams(p_event_id uuid, p_force boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare n int; half int; a_ids uuid[]; b_ids uuid[]; new_team uuid; i int; existing int;
begin
  select count(*) into existing from scores s
    join teams t on t.id = s.team_id where t.event_id = p_event_id;
  if existing > 0 and not p_force then
    raise exception
      'Refusing to redraw: % scores already recorded. This would delete them. Call draw_teams(event_id, true) to override.',
      existing;
  end if;
  update players set team_id = null, flight = null where event_id = p_event_id;
  delete from teams where event_id = p_event_id;

  select count(*) into n from players
    where event_id = p_event_id and payment_status in ('paid','comped');
  if n < 2 then raise exception 'Need at least 2 paid players'; end if;
  half := n / 2;

  with ranked as (
    select id, row_number() over (
      order by coalesce(course_handicap, handicap_index, 99), random()) as rn
    from players where event_id = p_event_id and payment_status in ('paid','comped')
  )
  update players p set flight = (case when r.rn <= half then 'A' else 'B' end)::flight
  from ranked r where p.id = r.id;

  select array_agg(id order by random()) into a_ids
    from players where event_id = p_event_id and flight = 'A';
  select array_agg(id order by random()) into b_ids
    from players where event_id = p_event_id and flight = 'B';

  for i in 1 .. coalesce(array_length(a_ids,1),0) loop
    insert into teams (event_id) values (p_event_id) returning id into new_team;
    update players set team_id = new_team where id = a_ids[i];
    if b_ids[i] is not null then
      update players set team_id = new_team where id = b_ids[i];
    end if;
  end loop;
  -- odd player out stays unassigned for admin placement

  -- name every team from its players' surnames, e.g. "Shook / Wood"
  update teams t set name = sub.nm
  from (select team_id, string_agg(last_name, ' / ' order by last_name) nm
        from players where event_id = p_event_id and team_id is not null
        group by team_id) sub
  where t.id = sub.team_id;

end $$;

-- Assign drawn teams to tee groups, 2 teams per group
create or replace function assign_tee_groups(p_event_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  with g as (select id, row_number() over (order by tee_time, sort_order) rn
             from tee_groups where event_id = p_event_id),
       t as (select id, row_number() over (order by random()) rn
             from teams where event_id = p_event_id)
  update teams tm set tee_group_id = g.id
  from t join g on g.rn = ((t.rn - 1) / 2) + 1
  where tm.id = t.id;
end $$;

-- ------------------------------------------------------------
-- TEAM HANDICAP — 2-person scramble: 35% low + 15% high,
-- rounded to a whole number so strokes allocate cleanly by hole.
-- ------------------------------------------------------------
-- SECURITY DEFINER is required: this function reads the RLS-protected
-- players table. As an invoker-rights function it returns 0 for
-- anonymous visitors, which would silently show gross scores as net
-- on the public leaderboard.
create or replace function team_handicap(p_team_id uuid)
returns int language sql stable security definer set search_path = public as $$
  with h as (
    select coalesce(course_handicap, handicap_index, 0) as ch,
           row_number() over (order by coalesce(course_handicap, handicap_index, 0)) as rn
    from players where team_id = p_team_id
  )
  select round(coalesce(sum(ch * case rn when 1 then 0.35 else 0.15 end), 0))::int from h;
$$;

-- ------------------------------------------------------------
-- STROKE ALLOCATION BY HOLE HANDICAP
-- A team with handicap N gets a stroke on the N hardest holes
-- (stroke_index 1..N), wrapping to a 2nd stroke past 18.
-- Plus handicaps give strokes back from the easiest holes down.
-- Verified: allocated strokes always sum exactly to the handicap.
-- ------------------------------------------------------------
create or replace function strokes_received(p_hcp int, p_si int)
returns int language sql immutable as $$
  select case
    when p_hcp is null then 0
    when p_hcp >= 0 then (p_hcp / 18) + (case when p_si <= (p_hcp % 18) then 1 else 0 end)
    else -((abs(p_hcp) / 18) + (case when p_si > 18 - (abs(p_hcp) % 18) then 1 else 0 end))
  end;
$$;

-- ------------------------------------------------------------
-- SCORING
-- ------------------------------------------------------------
create table scores (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid not null references teams(id) on delete cascade,
  hole       int not null check (hole between 1 and 18),
  strokes    int not null check (strokes between 1 and 15),
  entered_by uuid references players(id) on delete set null,
  updated_at timestamptz default now(),
  unique (team_id, hole)
);

create index on scores (team_id);

create or replace function touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

create trigger trg_scores_touch before update on scores
for each row execute function touch_updated_at();

-- ------------------------------------------------------------
-- LEADERBOARD
-- Net is computed hole by hole: strokes minus the strokes the team
-- receives on that hole (allocated by the hole's handicap index).
--
-- RANKING USES net_to_par, NOT cumulative net strokes. With a
-- sequential start, teams are always at different hole counts, and
-- cumulative strokes would rank whoever has played fewest holes first.
-- net_to_par is comparable at any point in the round and is identical
-- to net ordering once everyone has finished 18.
--
-- Sort order: unstarted last, WD/DQ last, playoff result (1st-place
-- playoff) first, then net_to_par, then countback on 18, 17, 16 ...
-- ------------------------------------------------------------
create view leaderboard as
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
  left join scores s        on s.team_id = h.team_id
  left join course_holes ch on ch.event_id = h.event_id and ch.hole = s.hole
),
agg as (
  select x.team_id, x.event_id, x.name, x.playoff_rank, x.status, x.team_hcp, g.tee_time,
         count(x.hole)                          as holes_played,
         coalesce(sum(x.strokes),0)             as gross,
         coalesce(sum(x.strokes - x.par),0)     as to_par,
         coalesce(sum(x.net_hole),0)            as net_raw,
         coalesce(sum(x.net_to_par_hole),0)     as net_to_par_raw,
         array_agg(x.net_hole order by x.hole desc)
           filter (where x.hole is not null)    as countback
  from holes x
  left join tee_groups g on g.id = x.tee_group_id
  group by x.team_id, x.event_id, x.name, x.playoff_rank, x.status, x.team_hcp, g.tee_time
)
select team_id, event_id, name as team_name, tee_time, status,
       holes_played, gross, to_par, team_hcp, playoff_rank,
       case when holes_played = 0 then null else net_raw end        as net,
       case when holes_played = 0 then null else net_to_par_raw end as net_to_par,
       countback,
       rank() over (
         order by (holes_played = 0),
                  (status <> 'active'),
                  playoff_rank nulls last,
                  case when holes_played = 0 then null else net_to_par_raw end,
                  countback
       ) as position
from agg;

-- Per-hole detail for the live scorecard view
create view team_scorecard as
select t.id as team_id, ch.hole, ch.par, ch.stroke_index, ch.tee_name, ch.yardage,
       strokes_received(team_handicap(t.id), ch.stroke_index) as strokes_given,
       s.strokes,
       s.strokes - strokes_received(team_handicap(t.id), ch.stroke_index) as net_hole
from teams t
join course_holes ch on ch.event_id = t.event_id
left join scores s   on s.team_id = t.id and s.hole = ch.hole;

-- ------------------------------------------------------------
-- PUBLIC ROSTER — safe columns only, readable by anonymous visitors.
-- The players table itself is NOT anon-readable (it holds email,
-- phone and payment data), so pairings and tee times render from here.
-- ------------------------------------------------------------
create view roster as
select p.id as player_id, p.event_id, p.first_name, p.last_name,
       p.team_id, t.name as team_name, p.flight,
       g.tee_time, g.starting_hole
from players p
left join teams t      on t.id = p.team_id
left join tee_groups g on g.id = t.tee_group_id;

-- ------------------------------------------------------------
-- GREENIES — closest to pin on each par-3, paid to the INDIVIDUAL
-- ------------------------------------------------------------
create table greenies (
  event_id   uuid not null references events(id) on delete cascade,
  hole       int not null,
  player_id  uuid references players(id) on delete set null,
  updated_at timestamptz default now(),
  primary key (event_id, hole)
);

create or replace function check_greenie_par3() returns trigger
language plpgsql as $$
begin
  if not exists (select 1 from course_holes
                 where event_id = new.event_id and hole = new.hole and par = 3)
  then raise exception 'Hole % is not a par 3', new.hole; end if;
  return new;
end $$;

create trigger trg_greenie_par3 before insert or update on greenies
for each row execute function check_greenie_par3();

-- ------------------------------------------------------------
-- PAYOUT SUMMARY (live money math off the real paid count)
-- ------------------------------------------------------------
create or replace view payout_summary as
with cfg as (
  select e.id as event_id, e.pot_cents, e.greenie_cents,
         e.payout_first_pct, e.payout_second_pct, e.payout_third_pct,
         (select count(*) from players p
            where p.event_id = e.id and p.payment_status in ('paid','comped')) as paid_players,
         (select count(*) from course_holes ch
            where ch.event_id = e.id and ch.par = 3) as par3_count
  from events e
),
calc as (
  select *, paid_players * pot_cents as pot_cents_total,
            par3_count * greenie_cents as greenie_pool_cents,
            paid_players * pot_cents - par3_count * greenie_cents as distributable_cents
  from cfg
)
select event_id, paid_players, pot_cents_total, par3_count, greenie_cents,
       greenie_pool_cents, distributable_cents,
       round(distributable_cents * payout_first_pct)::int  as first_cents,
       round(distributable_cents * payout_second_pct)::int as second_cents,
       round(distributable_cents * payout_third_pct)::int  as third_cents
from calc;

-- ------------------------------------------------------------
-- SOCIAL
-- ------------------------------------------------------------
-- Reactions and comments attach to a score or a photo. Nothing else:
-- no reacting to teams, no comments on comments. Keeps event-day social
-- a flat feed, which is all 32 people need.
-- Known limitation, accepted at this scale: target_id is polymorphic, so
-- deleting a photo orphans its reactions/comments rather than cascading.
create type target_kind as enum ('score','photo');

create table photos (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references events(id) on delete cascade,
  player_id    uuid references players(id) on delete set null,
  storage_path text not null,
  caption      text,
  created_at   timestamptz default now()
);

create table reactions (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references events(id) on delete cascade,
  player_id   uuid not null references players(id) on delete cascade,
  target_type target_kind not null,
  target_id   uuid not null,
  emoji       text not null,
  created_at  timestamptz default now(),
  unique (player_id, target_type, target_id, emoji)
);

create table comments (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references events(id) on delete cascade,
  player_id   uuid not null references players(id) on delete cascade,
  target_type target_kind not null,
  target_id   uuid not null,
  body        text not null check (length(body) between 1 and 1000),
  created_at  timestamptz default now()
);

create index on reactions (target_type, target_id);
create index on comments  (target_type, target_id);

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from players where auth_user_id = auth.uid() and is_admin);
$$;

create or replace function my_team_id() returns uuid
language sql stable security definer set search_path = public as $$
  select team_id from players where auth_user_id = auth.uid() limit 1;
$$;

alter table events       enable row level security;
alter table course_holes enable row level security;
alter table tee_groups   enable row level security;
alter table teams        enable row level security;
alter table players      enable row level security;
alter table scores       enable row level security;
alter table greenies     enable row level security;
alter table photos       enable row level security;
alter table reactions    enable row level security;
alter table comments     enable row level security;

create policy pub_read on events       for select using (true);
create policy pub_read on course_holes for select using (true);
create policy pub_read on tee_groups   for select using (true);
create policy pub_read on teams        for select using (true);
create policy pub_read on scores       for select using (true);
create policy pub_read on greenies     for select using (true);
create policy pub_read on photos       for select using (true);
create policy pub_read on reactions    for select using (true);
create policy pub_read on comments     for select using (true);

create policy player_read  on players for select using (auth.uid() is not null or is_admin());
create policy player_self  on players for update using (auth_user_id = auth.uid())
                                      with check (auth_user_id = auth.uid());
create policy player_admin on players for all using (is_admin()) with check (is_admin());

create policy score_insert on scores for insert with check (
  is_admin() or (team_id = my_team_id() and exists (
    select 1 from teams t join events e on e.id = t.event_id
    where t.id = team_id and e.scoring_open))
);
create policy score_update on scores for update
  using (is_admin() or team_id = my_team_id())
  with check (is_admin() or team_id = my_team_id());
create policy score_delete on scores for delete using (is_admin());

create policy greenie_admin on greenies for all using (is_admin()) with check (is_admin());

-- Social: you may only post AS YOURSELF
create policy photo_write on photos for insert with check (
  player_id in (select id from players where auth_user_id = auth.uid()));
create policy photo_owner on photos for delete using (
  player_id in (select id from players where auth_user_id = auth.uid()) or is_admin());
create policy react_write on reactions for insert with check (
  player_id in (select id from players where auth_user_id = auth.uid()));
create policy react_owner on reactions for delete using (
  player_id in (select id from players where auth_user_id = auth.uid()));
create policy comment_write on comments for insert with check (
  player_id in (select id from players where auth_user_id = auth.uid()));
create policy comment_owner on comments for delete using (
  player_id in (select id from players where auth_user_id = auth.uid()) or is_admin());

create policy admin_all on events       for all using (is_admin()) with check (is_admin());
create policy admin_all on course_holes for all using (is_admin()) with check (is_admin());
create policy admin_all on tee_groups   for all using (is_admin()) with check (is_admin());
create policy admin_all on teams        for all using (is_admin()) with check (is_admin());

-- ------------------------------------------------------------
-- COLUMN-LEVEL GRANTS  *** SECURITY CRITICAL ***
--
-- RLS alone is not enough here. The player_self policy lets a golfer
-- update their own row, but RLS cannot restrict WHICH columns — so a
-- player could set their own handicap to 0, mark themselves paid, move
-- to the winning team, or set is_admin = true and take over the event.
--
-- Column privileges are checked BEFORE RLS, so they close that hole.
-- Players may only edit their own contact and apparel details.
-- Everything scoring- or money-related is admin-only, and the admin
-- panel runs server-side with the service-role key (which bypasses RLS
-- and these grants entirely).
-- ------------------------------------------------------------
revoke insert, update, delete on players from anon, authenticated;
grant update (phone, shirt_size, wife_attending, wife_name, wife_shirt_size)
  on players to authenticated;

-- Structural tables are admin-only; never written from the browser.
revoke insert, update, delete on events, course_holes, tee_groups, teams, greenies
  from anon, authenticated;


-- ------------------------------------------------------------
-- STORAGE POLICIES (photo uploads)
-- storage.objects has RLS on by default in Supabase. Without these,
-- every photo upload fails even though the photos row inserts fine.
-- ------------------------------------------------------------
create policy "event photos are publicly viewable"
  on storage.objects for select
  using (bucket_id = 'event-photos');

create policy "signed-in players can upload event photos"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'event-photos' and owner = auth.uid());

create policy "players can delete their own photos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'event-photos' and (owner = auth.uid() or is_admin()));

-- ------------------------------------------------------------
-- REALTIME + STORAGE
-- ------------------------------------------------------------
alter publication supabase_realtime add table scores, greenies, photos, comments, reactions, teams, tee_groups;

insert into storage.buckets (id, name, public)
values ('event-photos','event-photos', true) on conflict do nothing;

-- ============================================================
-- SEED
-- ============================================================
do $$
declare eid uuid;
begin
  insert into events (name, event_date) values ('Shooktoberfest', '2026-10-02')
  returning id into eid;

  -- Mt Prospect — CUSTOM MIXED-TEE ROUTING chosen by Justin (marked
  -- scorecard). Par and stroke index are the card's single rows and are
  -- verified. Tee/yardage per hole is Justin's selection; holes 4, 5,
  -- 11, 12, 13, 15 were ambiguous on the marked card and seeded with
  -- best reading — confirm in admin before printing anything.
  insert into course_holes (event_id, hole, par, tee_name, yardage, stroke_index) values
   (eid, 1,5,'Black' ,575, 3),(eid, 2,4,'Gold'  ,380, 1),(eid, 3,4,'Silver',320,11),
   (eid, 4,3,'Silver',195,15),(eid, 5,4,'Black' ,355, 7),(eid, 6,4,'Silver',430, 5),
   (eid, 7,3,'Gold'  ,120,17),(eid, 8,4,'Silver',370, 9),(eid, 9,4,'Gold'  ,275,13),
   (eid,10,3,'Black' ,135,18),(eid,11,4,'Black' ,435, 6),(eid,12,3,'Black' ,180,16),
   (eid,13,4,'Black' ,365,12),(eid,14,4,'Black' ,385,10),(eid,15,5,'Silver',480, 2),
   (eid,16,3,'Gold'  ,155,14),(eid,17,5,'Black' ,480, 4),(eid,18,4,'Gold'  ,290, 8);

  -- 8 tee groups, sequential from 10:00 AM CT, 10 min apart
  insert into tee_groups (event_id, tee_time, sort_order)
  select eid, timestamptz '2026-10-02 10:00-05' + (n * interval '10 minutes'), n
  from generate_series(0,7) n;
end $$;
