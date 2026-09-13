# Shooktoberfest — Build Instructions for Claude Code

> **Design status:** These instructions are historical functional guidance, not permission to rebuild the presentation layer. Preserve the design recorded in `site/design-lock.json`. Every release must pass `npm run design:check`, deploy a forced preview, pass `npm run deployment:check -- <preview-url>`, receive a browser check, and promote that exact artifact.

Read `01-PRODUCT-BRIEF.md` and `02-TECHNICAL-SPEC.md` first. `shooktoberfest_schema.sql` is the database, already written and tested — apply it as-is.

---

## How much of this can actually be automated

Justin's goal: never open the Supabase or Stripe dashboard. Here is the honest split.

| Task | Automatable? | How |
|---|---|---|
| Create Supabase project | Yes | Supabase MCP `create_project` (after `get_cost` + `confirm_cost`) |
| Apply the schema | Yes | Supabase MCP `apply_migration` |
| Fetch project URL + publishable key | Yes | Supabase MCP `get_project_url`, `get_publishable_keys` |
| Seed and inspect data | Yes | Supabase MCP `execute_sql` |
| Create Stripe product + price | Yes | Stripe MCP `create_product`, `create_price` |
| Create Stripe webhook endpoint | Partly | Not a standard MCP tool. Use the Stripe API with a secret key via `curl` |
| Deploy to Vercel | No | Vercel MCP is read-only (list/inspect). Deploy via `vercel` CLI or a GitHub push |
| Configure Supabase Auth (redirect URLs, SMTP) | Partly | Not in the MCP toolset. Use the Supabase Management API with a personal access token |

**Unavoidable manual steps — four of them, each roughly a minute:**

1. **A Stripe account must exist.** Connectors authorize an account; they can't incorporate one. If Justin already has Stripe, this is just an OAuth click.
2. **Connect the Stripe and Vercel connectors** (one OAuth click each). Supabase is already connected.
3. **Generate a Stripe secret key and a Supabase personal access token**, paste into `.env.local`. These unlock webhook creation and auth config via API.
4. **`vercel login`** — device auth, one click in the browser.

Everything after that runs from Claude Code. Do not ask Justin to click through dashboard wizards; if a step isn't covered by a connector, use the vendor's REST API with the keys from step 3.

**Before starting, ask Justin for:**
- Whether he has a Stripe account already
- A Resend (or Postmark) API key. Scope is small: one signup-confirmation email and password resets. Enable Stripe's native email receipt for proof of payment instead of building your own
- Confirmation the domain (custom or `*.vercel.app`)

---

## Build order

Work in phases. Each ends in something Justin can look at. Don't build the whole app then integrate.

### Phase 0 — Infrastructure

1. Supabase MCP: `get_cost` → `confirm_cost` → `create_project`. Name it `shooktoberfest`, region `us-east-1`.
2. `apply_migration` with `shooktoberfest_schema.sql`, unmodified.
3. `execute_sql` to verify: 10 tables, 4 views, RLS on all 10, `select sum(par), sum(yardage) from course_holes` = (70, 5925), 8 tee groups from 10:00 to 11:10 AM Central.
4. `get_project_url` and `get_publishable_keys`. Grab the service-role key from project settings via the Management API.
5. Scaffold Next.js + TypeScript + Tailwind. Two Supabase client helpers: `lib/supabase/client.ts` (browser, publishable key) and `lib/supabase/admin.ts` (server-only, service-role, with a runtime guard that throws if imported client-side).
6. Stripe MCP: `create_product` "Shooktoberfest Entry", `create_price` $207 USD one-time. Store the price ID.
7. Configure Supabase Auth via Management API: site URL, redirect allow-list, and custom SMTP pointing at Resend. Every golfer authenticates with the email and password created during registration; Justin uses the same flow with `is_admin = true`.
8. Deploy an empty app to Vercel. Confirm the URL before wiring webhooks.

**Checkpoint:** empty app live, database provisioned and verified, Stripe product created.

### Phase 1 — Signup and payment

This is the only phase with a real deadline. Nothing else matters until 32 people can pay.

1. `/` landing page with event details and spots remaining (count from `roster`, not `players`).
2. `/register` form. Validate client-side, re-validate server-side.
3. `/api/register` — service-role. Re-check the cap, insert `pending`, create the Checkout Session with `client_reference_id = player.id` and 30-minute expiry, return the URL.
4. `/api/stripe/webhook` — verify the signature, handle `checkout.session.completed` (mark paid and send a plain confirmation; no magic link) and `checkout.session.expired` (delete the pending row and its provisional auth user).
5. Create the webhook endpoint via the Stripe API pointed at the deployed URL. Store the signing secret.
6. `/register/success`.

**Test before moving on:** a real payment in test mode, an abandoned checkout that frees its spot, a duplicate email, and the 33rd signup rejecting cleanly.

**Checkpoint:** Justin can send the link and collect money.

### Phase 2 — Admin panel

Every route server-side with the service-role key.

1. `/admin` dashboard — signups vs cap, money collected, shirt counts (golfers by size, plus wife shirts), toggles for `signups_open` and `scoring_open`.
2. `/admin/players` — editable table, all fields, comp/refund.
3. `/admin/draw` — warn on null handicaps, preview, confirm, run `draw_teams`, then `assign_tee_groups`. Surface any unassigned player prominently.
4. `/admin/tee-times` — edit times and starting holes.
5. `/admin/course` — edit each hole's tee color and yardage. Six holes are seeded from an ambiguous read of the marked scorecard (4, 5, 11, 12, 13, 15); Justin confirms them here.

**Checkpoint:** Justin can run the draw without SQL.

### Phase 3 — Player-facing

**Email + password, created at registration.** No magic links — see the Auth section of the spec for why.

1. `/login` and `/reset`. Sign players in automatically after payment and set a long session, so most never see a login screen on event day.
2. `/me` — partner, tee time, team handicap, which holes the team gets strokes on (from `team_scorecard`).
3. `/tee-times` — public tee sheet from `roster`.

### Phase 4 — Event day

The highest-stakes code. Build it early enough to test outdoors.

1. `/score` — one hole per screen, big stepper, optimistic save, and retry with backoff that keeps the active value visible. No service worker or offline sync queue.
2. `/leaderboard` — realtime, Pos / Team / Thru / Net to par / Net. Sort strictly by the view's `position`.
3. `/admin/scoring` — admin can fix any team's card.
4. Social: photo upload with client-side compression, reactions, comments.

### Phase 5 — Results

1. `/admin/greenies` — one winner per par-3.
2. `/admin/results` — final standings, playoff recording, payout sheet from `payout_summary`.

---

## Rules that will bite you if ignored

1. **Never expose the service-role key to the browser.** Guard the module.
2. **Never mark a player paid outside the Stripe webhook.** Not on the success redirect, not optimistically.
3. **Public pages read `roster`, never `players`.** `players` is not anon-readable and returns zero rows — silently, with no error.
4. **Never re-sort the leaderboard client-side.** The `position` column encodes unstarted-last, WD-last, playoff override, net-to-par, and countback.
5. **Rank on `net_to_par`, never cumulative net.** Cumulative strokes rank whoever has played fewest holes first. With a sequential start that inverts the board all day.
6. **`draw_teams` cascade-deletes scores.** It's guarded, but never call it with `force = true` from a UI button.
7. **All handicaps are integers.** No decimals in the DB or the UI.
8. **Never lose an entered score.** Retry failed saves with backoff and keep the value in the input. Do NOT build a service-worker offline queue — it's not warranted for a suburban course with normal LTE, and it's a large complexity tax.
9. **Do not use magic links.** Tapping a link inside an email opens the mail app's in-app browser and strands the session there. Email + password only.
10. **Do not add features the spec scoped out:** no threaded comments, no reacting to teams, no orphan-cleanup jobs for social rows, no multi-event support, no offline sync engine. When in doubt, this is a one-day event for 32 friends.

---

## Environment variables

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # server only
STRIPE_SECRET_KEY=                # server only
STRIPE_WEBHOOK_SECRET=            # server only
STRIPE_PRICE_ID=
RESEND_API_KEY=                   # server only
RESEND_FROM_EMAIL=                # verified sender, e.g. Shooktoberfest <golf@example.com>
NEXT_PUBLIC_SITE_URL=
```

Set them in Vercel via the CLI, not the dashboard.

---

## Definition of done

- 32 people can register and pay without Justin intervening.
- The draw runs from the admin panel; nobody touches SQL.
- On a phone, in sunlight, with intermittent signal, a golfer enters 18 scores without losing one.
- The leaderboard updates live for spectators who never signed into anything.
- At 11:00 AM with half the field on the course, the leaderboard is correct.
- Final standings and payout are right, and Justin can settle up from `/admin/results`.
