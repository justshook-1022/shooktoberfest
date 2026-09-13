begin;
select plan(18);

select has_table('public', 'events', 'events table exists');
select has_table('public', 'players', 'players table exists');
select is((select count(*)::integer from public.events), 1, 'one event is seeded');
select is((select count(*)::integer from public.course_holes), 18, 'all 18 holes are seeded');
select is((select sum(par)::integer from public.course_holes), 70, 'course routing totals par 70');
select is((select sum(yardage)::integer from public.course_holes), 5925, 'course routing totals 5,925 yards');
select ok(
  not has_function_privilege('anon', 'public.draw_teams(uuid, boolean)', 'EXECUTE'),
  'anonymous visitors cannot run the team draw'
);
select has_function('public', 'admin_apply_team_pairings', array['uuid', 'jsonb'], 'atomic admin pairing function exists');
select has_function('public', 'admin_set_tee_group_assignments', array['uuid', 'jsonb'], 'atomic tee assignment function exists');
select has_function('public', 'admin_save_scorecard', array['uuid', 'uuid', 'jsonb', 'uuid'], 'atomic scorecard function exists');
select ok(
  not has_function_privilege('anon', 'public.admin_apply_team_pairings(uuid, jsonb)', 'EXECUTE'),
  'anonymous visitors cannot apply team pairings'
);
select ok(
  not has_function_privilege('authenticated', 'public.admin_save_scorecard(uuid, uuid, jsonb, uuid)', 'EXECUTE'),
  'players cannot call the admin scorecard function'
);
select ok(
  has_function_privilege('service_role', 'public.admin_set_tee_group_assignments(uuid, jsonb)', 'EXECUTE'),
  'the service role can adjust tee groups'
);
select is(public.strokes_received(0, 1), 0, 'scratch teams receive no strokes');
select is(public.strokes_received(20, 1), 2, 'handicaps over 18 wrap to a second stroke');
select is(public.strokes_received(-2, 18), -1, 'plus handicaps give strokes back from the easiest holes');
select ok(
  exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'scores'
  ),
  'scores are published for Realtime'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.scores'::regclass),
  'scores enforce row level security'
);

select * from finish();
rollback;
