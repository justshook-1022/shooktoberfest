-- Account onboarding adds a handicap identifier and one reusable profile photo
-- per golfer. Payment remains authoritative only through Stripe webhooks.
alter table public.players
  add column handicap_id text,
  add column profile_photo_path text;

alter table public.players
  add constraint players_handicap_id_format check (
    handicap_id is null or (
      length(handicap_id) between 3 and 32
      and handicap_id ~ '^[A-Z0-9 -]+$'
    )
  ),
  add constraint players_profile_photo_path_format check (
    profile_photo_path is null
    or profile_photo_path ~ '^[0-9a-f-]+/avatar\.jpg$'
  );

create unique index players_event_handicap_id_unique
  on public.players (event_id, handicap_id)
  where handicap_id is not null;

-- Profile photos are intentionally public: they appear on the public tee sheet
-- and leaderboard. Writes remain restricted to the signed-in user's one path.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-photos', 'profile-photos', true, 5242880, array['image/jpeg'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "players can read their profile photo record"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'profile-photos'
    and name = (select auth.uid())::text || '/avatar.jpg'
    and owner_id = (select auth.uid())::text
  );

create policy "players can upload their profile photo"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'profile-photos'
    and name = (select auth.uid())::text || '/avatar.jpg'
    and owner_id = (select auth.uid())::text
  );

create policy "players can replace their profile photo"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'profile-photos'
    and name = (select auth.uid())::text || '/avatar.jpg'
    and owner_id = (select auth.uid())::text
  )
  with check (
    bucket_id = 'profile-photos'
    and name = (select auth.uid())::text || '/avatar.jpg'
    and owner_id = (select auth.uid())::text
  );

create policy "players can delete their profile photo"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'profile-photos'
    and name = (select auth.uid())::text || '/avatar.jpg'
    and owner_id = (select auth.uid())::text
  );

-- The public roster is the intentionally narrow projection used by the site.
-- Contact details, the handicap ID, and payment data remain private.
create or replace view public.roster as
select p.id as player_id, p.event_id, p.first_name, p.last_name,
       p.team_id, t.name as team_name, p.flight,
       g.tee_time, g.starting_hole,
       p.profile_photo_path
from public.players p
left join public.teams t on t.id = p.team_id
left join public.tee_groups g on g.id = t.tee_group_id
where p.payment_status in ('paid','pending','comped');

revoke all on public.roster from public;
grant select on public.roster to anon, authenticated;
