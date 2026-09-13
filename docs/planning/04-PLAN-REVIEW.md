# Shooktoberfest — Plan Review

> **Design status:** This review is historical functional context. It does not supersede the approved visual implementation locked in `site/design-lock.json` to Vercel deployment `dpl_9EZcZh48DNhzz7fsiC3LWFSaYX7L`.

## Verdict

The product plan is clear and appropriately scoped for one private event. The database model, public/private data split, mixed-tee routing, team-handicap math, and net-to-par leaderboard rule all fit the real event.

The implementation plan had four contradictions or gaps that should be resolved before production:

1. **Authentication:** Phase 0 said players never authenticate and Phase 1 mentioned a magic link, while the technical spec correctly requires email + password. The build uses email + password only. The auth user is created before checkout so no plaintext password has to be stored for the webhook; an expired checkout deletes both the pending player and auth user. The success page waits for the signed Stripe webhook before signing the player in.
2. **Dropped-signal behavior:** Phase 4 asked for an offline queue while the technical spec explicitly rejects one. The build keeps the entered value visible and retries the active save with exponential backoff. There is no service worker or long-lived offline sync engine.
3. **Database permissions:** The base schema lets a player update an existing score after scoring closes, and its security-definer draw functions are callable unless execution is explicitly revoked. Apply `shooktoberfest_security_fixes.sql` immediately after the base schema.
4. **Player privacy and prize math:** The base schema lets any authenticated golfer read every private player row, and counts comped entries as prize-pot contributions. The fix migration limits player reads to self/admin and calculates payouts from money actually paid.

## Build decisions

- The implementation lives in `Website/site` so the source plans remain intact.
- Public pages work with realistic preview data before services are connected.
- Supabase and Stripe calls activate only when their environment variables are present; no secret reaches the browser.
- The public leaderboard uses the database view order as-is and never re-sorts in the browser.
- The score screen shows a large color-coded tee instruction on every hole and keeps retrying a failed save without clearing the value.
- Hosting uses OpenAI Sites for the current build. Supabase, Stripe, and Resend remain the external production services described in the technical spec.

## Production activation checklist

1. Create the Supabase project; apply `shooktoberfest_schema.sql`, then `shooktoberfest_security_fixes.sql`.
2. Create the Stripe $207 one-time price and point a webhook at `/api/stripe/webhook` for checkout completion, asynchronous payment results, expiration, and refunds.
3. Configure Resend and Supabase Auth, then add the environment values listed in `Website/site/.env.example` to the hosted site.
4. Mark Justin's player row as admin once, then run the full 32-player dress rehearsal from the technical spec.
5. Confirm the six ambiguous mixed-tee readings (holes 4, 5, 11, 12, 13, and 15) before printing cart cards.

The site should not accept real registrations until steps 1–3 are complete. In the meantime it deliberately identifies itself as preview/demo data in operational screens.
