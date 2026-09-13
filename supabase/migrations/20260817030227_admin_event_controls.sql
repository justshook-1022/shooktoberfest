-- Atomic service-role operations used by the event admin UI. Keeping these
-- multi-row changes in Postgres prevents a failed request from leaving the
-- draw, tee sheet, or scorecard half-updated.

create or replace function public.admin_apply_team_pairings(
  p_event_id uuid,
  p_pairings jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  eligible_count int;
  submitted_count int;
  pairing jsonb;
  new_team_id uuid;
begin
  if jsonb_typeof(p_pairings) <> 'array' then
    raise exception 'Pairings must be a JSON array';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_pairings) as item(value)
    where jsonb_typeof(item.value) <> 'array'
       or jsonb_array_length(item.value) not between 1 and 2
  ) then
    raise exception 'Every team must contain one or two players';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_event_id::text));

  if exists (
    select 1
    from scores s
    join teams t on t.id = s.team_id
    where t.event_id = p_event_id
  ) then
    raise exception 'Pairings cannot be changed after scoring has started';
  end if;

  select count(*) into eligible_count
  from players
  where event_id = p_event_id
    and payment_status in ('paid', 'comped');

  select coalesce(sum(jsonb_array_length(item.value)), 0)::int
    into submitted_count
  from jsonb_array_elements(p_pairings) as item(value);

  if submitted_count <> eligible_count then
    raise exception 'Pairings must include all % paid or comped players exactly once', eligible_count;
  end if;

  if exists (
    with submitted as (
      select member.value::uuid as player_id
      from jsonb_array_elements(p_pairings) as item(value)
      cross join lateral jsonb_array_elements_text(item.value) as member(value)
    )
    select 1 from submitted group by player_id having count(*) > 1
  ) then
    raise exception 'A player cannot appear in more than one team';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_pairings) as item(value)
    cross join lateral jsonb_array_elements_text(item.value) as member(value)
    left join players p
      on p.id = member.value::uuid
     and p.event_id = p_event_id
     and p.payment_status in ('paid', 'comped')
    where p.id is null
  ) then
    raise exception 'Every paired player must be paid or comped in this event';
  end if;

  -- Clear structural assignments first. Any later validation error rolls the
  -- transaction back, so the previous draw remains intact.
  update players
  set team_id = null, flight = null
  where event_id = p_event_id;

  delete from teams where event_id = p_event_id;

  -- Use deterministic tie-breakers for the A/B split. Randomness belongs in
  -- the pairings, not in deciding which side of the field a tied player lands.
  with ranked as (
    select id,
           row_number() over (
             order by coalesce(course_handicap, handicap_index, 99),
                      last_name, first_name, id
           ) as rn,
           count(*) over () as total
    from players
    where event_id = p_event_id
      and payment_status in ('paid', 'comped')
  )
  update players p
  set flight = case when r.rn <= (r.total / 2) then 'A'::flight else 'B'::flight end
  from ranked r
  where p.id = r.id;

  if exists (
    with submitted as (
      select item.ordinality as team_number, member.value::uuid as player_id
      from jsonb_array_elements(p_pairings) with ordinality as item(value, ordinality)
      cross join lateral jsonb_array_elements_text(item.value) as member(value)
    )
    select 1
    from submitted s
    join players p on p.id = s.player_id
    group by s.team_number
    having count(*) = 2 and count(distinct p.flight) <> 2
  ) then
    raise exception 'Each two-player team must contain one A-flight and one B-flight player';
  end if;

  for pairing in select value from jsonb_array_elements(p_pairings)
  loop
    insert into teams (event_id) values (p_event_id) returning id into new_team_id;

    update players
    set team_id = new_team_id
    where id in (select value::uuid from jsonb_array_elements_text(pairing));

    update teams t
    set name = names.team_name
    from (
      select string_agg(last_name, ' / ' order by last_name, first_name) as team_name
      from players
      where team_id = new_team_id
    ) names
    where t.id = new_team_id;
  end loop;
end;
$$;

create or replace function public.admin_set_tee_group_assignments(
  p_event_id uuid,
  p_assignments jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  team_count int;
  submitted_count int;
begin
  if jsonb_typeof(p_assignments) <> 'array' then
    raise exception 'Tee-group assignments must be a JSON array';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_event_id::text));

  select count(*) into team_count from teams where event_id = p_event_id;
  select count(*) into submitted_count
  from jsonb_to_recordset(p_assignments) as x(team_id uuid, tee_group_id uuid);

  if submitted_count <> team_count then
    raise exception 'Every team must have one tee-group assignment';
  end if;

  if (
    select count(distinct x.team_id)
    from jsonb_to_recordset(p_assignments) as x(team_id uuid, tee_group_id uuid)
  ) <> team_count then
    raise exception 'A team cannot appear more than once';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_assignments) as x(team_id uuid, tee_group_id uuid)
    left join teams t on t.id = x.team_id and t.event_id = p_event_id
    left join tee_groups g on g.id = x.tee_group_id and g.event_id = p_event_id
    where t.id is null or (x.tee_group_id is not null and g.id is null)
  ) then
    raise exception 'Every team and tee group must belong to this event';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_assignments) as x(team_id uuid, tee_group_id uuid)
    where x.tee_group_id is not null
    group by x.tee_group_id
    having count(*) > 2
  ) then
    raise exception 'A tee group can contain at most two teams';
  end if;

  update teams set tee_group_id = null where event_id = p_event_id;

  update teams t
  set tee_group_id = x.tee_group_id
  from jsonb_to_recordset(p_assignments) as x(team_id uuid, tee_group_id uuid)
  where t.id = x.team_id and t.event_id = p_event_id;
end;
$$;

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

  delete from scores where team_id = p_team_id;

  insert into scores (team_id, hole, strokes, entered_by)
  select p_team_id, score.hole::int, score.strokes::int, p_entered_by
  from jsonb_each_text(p_scores) as score(hole, strokes);
end;
$$;

revoke execute on function public.admin_apply_team_pairings(uuid, jsonb)
  from public, anon, authenticated;
revoke execute on function public.admin_set_tee_group_assignments(uuid, jsonb)
  from public, anon, authenticated;
revoke execute on function public.admin_save_scorecard(uuid, uuid, jsonb, uuid)
  from public, anon, authenticated;

grant execute on function public.admin_apply_team_pairings(uuid, jsonb) to service_role;
grant execute on function public.admin_set_tee_group_assignments(uuid, jsonb) to service_role;
grant execute on function public.admin_save_scorecard(uuid, uuid, jsonb, uuid) to service_role;
