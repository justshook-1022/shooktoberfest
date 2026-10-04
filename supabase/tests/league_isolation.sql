begin;
create temporary table ls_test_ids as select (select id from auth.users order by created_at limit 1) a,(select id from auth.users order by created_at limit 1 offset 1) b,gen_random_uuid() org,gen_random_uuid() league,gen_random_uuid() player;
grant select on ls_test_ids to authenticated,anon;
select set_config('request.jwt.claim.sub',(select a::text from ls_test_ids),true);
set local role authenticated;
insert into public.ls_organizations(id,owner_id,name) select org,a,'Isolation test' from ls_test_ids;
insert into public.ls_leagues(id,owner_id,organization_id,name,course,season,holes,team_size,allowance) select league,a,org,'Test','Test','2027',9,2,'average' from ls_test_ids;
insert into public.ls_players(id,owner_id,league_id,name) select player,a,league,'Test player' from ls_test_ids;
insert into public.ls_rounds(owner_id,league_id,name,round_date,first_time) select a,league,'Test round','2027-05-01','16:00' from ls_test_ids;
insert into public.ls_ledger(owner_id,league_id,player_id,kind,amount_cents) select a,league,player,'dues',1000 from ls_test_ids;
insert into public.ls_feedback(owner_id,body) select a,'Test feedback' from ls_test_ids;
do $$begin
 if (select count(*) from public.ls_players)<>1 then raise exception 'Owner read failed';end if;
 begin
  update public.ls_players set owner_id=(select b from ls_test_ids);
  raise exception 'Owner reassignment allowed';
 exception when insufficient_privilege then null;end;
 begin
  update public.ls_ledger set amount_cents=1;
  raise exception 'Ledger mutation allowed';
 exception when insufficient_privilege then null;end;
end$$;
reset role;
select set_config('request.jwt.claim.sub',(select b::text from ls_test_ids),true);
set local role authenticated;
do $$declare t text; n integer;begin
 foreach t in array array['ls_organizations','ls_leagues','ls_players','ls_rounds','ls_ledger','ls_feedback'] loop
  execute format('select count(*) from public.%I',t) into n;
  if n<>0 then raise exception 'Cross-owner read on %',t;end if;
 end loop;
 update public.ls_players set name='Unauthorized' where id=(select player from ls_test_ids);
 get diagnostics n=row_count;if n<>0 then raise exception 'Cross-owner update allowed';end if;
 delete from public.ls_rounds where league_id=(select league from ls_test_ids);
 get diagnostics n=row_count;if n<>0 then raise exception 'Cross-owner delete allowed';end if;
 begin
  insert into public.ls_players(owner_id,league_id,name) select a,league,'Spoofed' from ls_test_ids;
  raise exception 'Spoofed owner insert allowed';
 exception when insufficient_privilege then null;end;
 begin
  insert into public.ls_players(owner_id,league_id,name) select b,league,'Cross-parent' from ls_test_ids;
  raise exception 'Cross-owner parent allowed';
 exception when foreign_key_violation then null;end;
end$$;
reset role;
set local role anon;
do $$declare t text;begin
 foreach t in array array['ls_organizations','ls_leagues','ls_players','ls_rounds','ls_ledger','ls_feedback'] loop
  begin
   execute format('select * from public.%I',t);
   raise exception 'Anonymous read on %',t;
  exception when insufficient_privilege then null;end;
 end loop;
end$$;
reset role;
select 'PASS: owner CRUD, owner reassignment denial, cross-owner read/update/delete/insert denial, cross-owner parent constraint, anonymous denial, append-only ledger' as result;
rollback;
