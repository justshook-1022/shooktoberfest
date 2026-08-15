begin;
select plan(7);

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

select * from finish();
rollback;
