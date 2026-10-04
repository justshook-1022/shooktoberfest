# League Starter beta implementation

Goal: a first outside organizer signs in, creates a league, imports a roster, generates a season, records absences, publishes balanced rotating pairings, records results and reviews standings without database or developer help.

## Delivery
- Add an isolated /leagues application on a feature branch; preserve existing Shooktoberfest routes and design.
- Reuse Supabase Auth; store beta records in separately named tables protected by owner-based RLS and composite foreign keys.
- One account can own multiple organizations/leagues. Beta is free. Single organizer per workspace for beta; shared-admin membership is a later migration.
- Course, holes, schedule, team size, handicap allowance, points, prizes and dues are configurable.
- Handicap entry is a playing handicap for the selected round length, not an official Handicap Index calculation.
- Pairings rotate partners and groups using prior rounds, and keep teams together in four-player tee groups. Incomplete teams require an explicit roster change.
- Round results snapshot handicap, net score, points and prize cents. Ties share occupied points/prize positions. Each teammate receives team points and a share of team prizes.
- Ledger records externally collected dues and externally paid winnings. No charges or transfers occur in this beta.
- Closed rounds and optimistic versions prevent silent score/pairing overwrite.

## Before first tester
- Apply additive migration and test authenticated owner A, owner B, anonymous access, parent ownership constraints, and row edits.
- Test onboarding through roster, schedule, attendance, pairings, results, standings and ledger.
- Verify phone layout, empty states and actionable errors.
- Build, run existing regression tests, verify preview and sign-in redirect before distributing URL.

## Next releases
1. Player invitations, own schedule, attendance self-service and history; admin sharing.
2. Stripe subscription billing with beta entitlements preserved.
3. Connected organizer accounts and registration collection; separately evaluate supported prize payout workflows before promising transfers.
4. Course database and verified handicap conversions, custom domains, email reminders, exports and event templates.
5. Measure concurrency and support needs before selling broadly. Test 100 simultaneous 64-player events as a target, not a capacity claim.
