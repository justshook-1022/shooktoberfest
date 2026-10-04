# League Starter beta implementation

Goal: a first outside organizer signs in, creates a league, imports a roster, generates a season, records absences, publishes balanced rotating pairings, records results and reviews standings without database or developer help.

## Delivery
- Add an isolated /leagues application on a feature branch; preserve existing Shooktoberfest routes and design.
- Reuse Supabase Auth; store beta records in separately named tables protected by owner-based RLS and composite foreign keys.
- One account owns one workspace and can create multiple leagues. Beta is free. Single organizer per workspace for beta; shared-admin membership is a later migration.
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

## Verification and release gate (2026-10-04)
- Feature branch: `feat/league-starter-beta-v1`; first implementation commit `b927fde97404cc6bfa45f7d774d55add07c29a4a`.
- Vercel deployment `dpl_FBfC6fxJcFCuj1tuHyu5KUcCgUT9` is READY; browser confirmed the signed-out landing page renders.
- Build, typecheck, 33 automated tests, and all 42 protected design file checks passed.
- Applied the additive migration. Live rollback-only SQL tests passed owner CRUD, cross-owner read/write denial, anonymous denial, ownership reassignment denial, parent ownership constraints, and append-only ledger checks.
- READY FOR ONE INVITED ORGANIZER BETA: public client settings configured only for `feat/league-starter-beta-v1`; exact branch callback approved by Justin and saved in Supabase. Google sign-in verified in the browser.
- Stable tester URL: https://shooktoberfest-git-feat-league-starter-beta-v1-get-shook-llc.vercel.app/leagues
- Browser walkthrough passed: created Beta QA League; imported eight fictional golfers; generated four weekly rounds from May 3, 2027; drew four two-person teams into two tee groups; published; finalized a net-30 tie with 9.5 points each; verified season standings; recorded fictional $25 dues against $100 owed and verified $75 remaining; created a separate empty second league; reloaded and verified saved data.
- Test records are clearly named Beta QA League and Beta QA Second League under Justin's account. No invitations were sent and no actual money moved. New organizers start with their own empty workspace.
- Remaining verification beyond this beta: phone-device walkthrough, external-account OAuth eligibility, attendance edge cases in the browser, recovery/export workflow, and concurrent load testing. Automated isolation and scoring tests cover the core backend rules, but are not a large-scale load certification.
- Existing Shooktoberfest production deployment has not been replaced. Capacity for hundreds of simultaneous organizers is a design target, not a verified result.

## First tester walkthrough
1. Sign in with Google and create a clearly named test league with two-player teams, a course, timezone and season.
2. Add eight fictional players and their playing handicaps; generate four weekly dates.
3. Open round one, confirm attendance, generate pairings and publish the round. Verify every selected player appears once and tee times are readable on a phone.
4. Enter all team gross scores and finalize. Check standings, shared points for a tie, and earned prizes.
5. Record a fictional externally collected dues payment and verify the player's balance. This records bookkeeping only; no money moves.
6. Create a second league and confirm rosters, rounds and balances remain separate. Sign out/in and verify both leagues persist.
7. Submit feedback naming anything confusing or missing. Do not use real payment information during this test.

## Commercial rollout proposal
Keep the first beta free until organizers complete a season workflow without help. Then test workspace subscriptions with free player access: a tentative $29/month organizer plan and a $79/month larger-operator plan, with annual discounts and a separate one-event pass for occasional outings. These are pricing hypotheses, not researched market prices. Allow unlimited league creation while defining included active-player usage and charging separately for costly messaging. Validate willingness to pay before fixing tiers or building checkout. Subscription billing is not implemented in this beta.
