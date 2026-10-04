-- Additive beta schema. Existing Shooktoberfest tables and policies are untouched.
create table public.ls_organizations (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 name text not null check(length(name) between 1 and 100), created_at timestamptz not null default now(),
 unique(owner_id), unique(id,owner_id)
);
create table public.ls_leagues (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 organization_id uuid not null, name text not null check(length(name) between 1 and 100),
 course text not null check(length(course) between 1 and 140), season text not null check(length(season) between 1 and 40),
 timezone text not null default 'America/Chicago', holes integer not null check(holes in (9,18)),
 team_size integer not null check(team_size in (1,2,4)), allowance text not null check(allowance in ('average','weighted')),
 season_fee_cents integer not null default 0 check(season_fee_cents between 0 and 10000000),
 points jsonb not null default '[10,9,8,7,6,5,4,3,2,1]' check(jsonb_typeof(points)='array'),
 prizes jsonb not null default '[0]' check(jsonb_typeof(prizes)='array'), description text not null default '',
 status text not null default 'active' check(status in ('active','archived')), created_at timestamptz not null default now(),
 unique(id,owner_id), foreign key(organization_id,owner_id) references public.ls_organizations(id,owner_id) on delete cascade
);
create table public.ls_players (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null, league_id uuid not null,
 name text not null check(length(name) between 1 and 100), email text not null default '' check(length(email)<=254),
 handicap numeric(4,1) not null default 0 check(handicap between -10 and 72), active boolean not null default true,
 created_at timestamptz not null default now(), unique(id,league_id,owner_id),
 foreign key(league_id,owner_id) references public.ls_leagues(id,owner_id) on delete cascade
);
create table public.ls_rounds (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null, league_id uuid not null,
 name text not null, round_date date not null, first_time text not null check(first_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
 interval_minutes integer not null default 10 check(interval_minutes between 5 and 30),
 status text not null default 'draft' check(status in ('draft','published','completed','cancelled')),
 attendance jsonb not null default '{}' check(jsonb_typeof(attendance)='object'),
 assignments jsonb not null default '[]' check(jsonb_typeof(assignments)='array'),
 results jsonb not null default '[]' check(jsonb_typeof(results)='array'),
 version integer not null default 1 check(version>0), created_at timestamptz not null default now(),
 unique(league_id,round_date), foreign key(league_id,owner_id) references public.ls_leagues(id,owner_id) on delete cascade
);
create table public.ls_ledger (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null, league_id uuid not null, player_id uuid not null,
 kind text not null check(kind in ('dues','payout')), amount_cents integer not null check(amount_cents between 1 and 10000000),
 note text not null default '' check(length(note)<=300), created_at timestamptz not null default now(),
 foreign key(player_id,league_id,owner_id) references public.ls_players(id,league_id,owner_id) on delete cascade
);
create table public.ls_feedback (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 body text not null check(length(body) between 1 and 4000), created_at timestamptz not null default now()
);
create index ls_leagues_owner on public.ls_leagues(owner_id,created_at desc);
create index ls_players_league on public.ls_players(owner_id,league_id);
create index ls_rounds_league on public.ls_rounds(owner_id,league_id,round_date);
create index ls_ledger_league on public.ls_ledger(owner_id,league_id,created_at desc);
create index ls_feedback_owner on public.ls_feedback(owner_id);
-- Separate operation policies explicitly restrict both existing and newly written ownership.
do $$ declare t text; begin
 foreach t in array array['ls_organizations','ls_leagues','ls_players','ls_rounds','ls_ledger','ls_feedback'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public, anon, authenticated',t);
  execute format('grant select,insert,update,delete on public.%I to authenticated',t);
  execute format('create policy owner_select on public.%I for select to authenticated using ((select auth.uid())=owner_id)',t);
  execute format('create policy owner_insert on public.%I for insert to authenticated with check ((select auth.uid())=owner_id)',t);
  execute format('create policy owner_update on public.%I for update to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id)',t);
  execute format('create policy owner_delete on public.%I for delete to authenticated using ((select auth.uid())=owner_id)',t);
 end loop;
end $$;
-- Financial records are append-only from authenticated clients.
revoke update,delete on public.ls_ledger from authenticated;
