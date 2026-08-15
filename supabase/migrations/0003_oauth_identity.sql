-- Social login makes auth.users the canonical identity. Each identity may hold
-- at most one registration for this event, regardless of provider email aliases.
create unique index if not exists players_event_auth_user_unique
  on players (event_id, auth_user_id)
  where auth_user_id is not null;

-- Explicitly expose only public-safe projections from the protected player data.
revoke all on leaderboard, team_scorecard, roster, payout_summary from public;
grant select on leaderboard, team_scorecard, roster, payout_summary to anon, authenticated;
