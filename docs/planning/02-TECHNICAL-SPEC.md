# Shooktoberfest — Technical Spec

> **Design status:** This specification governs behavior and architecture only. The approved visual implementation is locked in `site/design-lock.json` to Vercel deployment `dpl_9EZcZh48DNhzz7fsiC3LWFSaYX7L`; feature work must preserve it.

Companion to `01-PRODUCT-BRIEF.md` and `shooktoberfest_schema.sql`.

## Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js (App Router), TypeScript | |
| Hosting | Vercel | |
| Database / Auth / Storage / Realtime | Supabase (Postgres 15+) | |
| Payments | Stripe Checkout + webhook | |
| Styling | Tailwind | |
| Email | Resend (or Postmark) | Auth emails only: one signup confirmation + password resets. Stripe's own receipt covers proof of payment |

## Non-negotiable architecture rule

**Two Supabase clients. Never blur them.**

| Client | Key | Used by | Enforces |
|---|---|---|---|
| Browser client | publishable/anon key | Public pages, player scoring, social | RLS + column grants |
| Server client | **service-role key** | Signup route, Stripe webhook, every admin action | Nothing — full access |

The service-role key must never reach the browser. Server-only, in route handlers or server actions.

**Why this is mandatory, not stylistic:** the schema uses column-level `GRANT`s to stop a signed-in golfer from editing their own handicap, marking themselves paid, moving to the winning team, or setting `is_admin = true`. Those grants apply to the `authenticated` role — which is also what an admin authenticates as. So admin writes through the browser client would be blocked by the same protection. The admin panel calls server routes that use the service-role key.

Signup is server-side for the same reason: `players` has no anonymous INSERT policy, deliberately. Otherwise anyone could POST a free registration and skip Stripe.

## Database

Apply `shooktoberfest_schema.sql` as the first migration, unmodified. It has been executed and behaviorally tested against Postgres 16 — schema, RLS as real `anon`/`authenticated` roles, the draw, stroke allocation, countback, and payout math. Do not "improve" it before it runs.

### Tables

`events` · `course_holes` · `tee_groups` · `teams` · `players` · `scores` · `greenies` · `photos` · `reactions` · `comments`

Reactions and comments target a `score` or a `photo` only — flat feed, no threads, no reacting to teams. Deleting a photo orphans its reactions/comments (polymorphic refs don't cascade); accepted at this scale, so don't build cleanup machinery.

### Views

| View | Purpose | Readable by |
|---|---|---|
| `leaderboard` | Ranked standings with position, gross, net, net_to_par, thru, countback | anyone |
| `roster` | Player names, teams, tee times — safe columns only | anyone |
| `team_scorecard` | Per-hole par, **tee color**, yardage, stroke index, strokes given, strokes taken, net | anyone |
| `payout_summary` | Live money math off the real paid count | anyone |

`players` itself is **not** anon-readable (it holds email, phone, payment data). Public pages read `roster`, never `players`. This is why `roster` exists — don't bypass it.

### Functions

| Function | Called by | Notes |
|---|---|---|
| `draw_teams(event_id, force default false)` | Admin, once | Refuses to run if scores exist unless forced — it cascade-deletes scores |
| `assign_tee_groups(event_id)` | Admin, after the draw | 2 teams per group, random |
| `team_handicap(team_id)` | Views | 35/15, rounded, `SECURITY DEFINER` |
| `strokes_received(hcp, stroke_index)` | Views | Allocation by hole difficulty |
| `is_admin()` / `my_team_id()` | RLS policies | |

## Routes

### Public

| Route | Content |
|---|---|
| `/` | Event details, what $207 covers, spots remaining, register CTA. Post-draw it becomes the hub |
| `/register` | Signup form → Stripe Checkout |
| `/register/success` | Confirmation after Stripe redirect |
| `/leaderboard` | Live standings. On event day this is the landing page |
| `/tee-times` | Tee sheet: group, time, both teams, all four players |
| `/photos` | Event photo wall |

### Player (email + password)

| Route | Content |
|---|---|
| `/login` · `/reset` | Sign in, password reset |
| `/score` | Score entry for your team. Only live when `events.scoring_open = true` |
| `/me` | Your team, partner, tee time, team handicap, which holes you get strokes on |

### Admin (`/admin/*`, server-side, service-role)

| Route | Content |
|---|---|
| `/admin` | Dashboard: signups vs cap, money collected, shirt counts, event-state toggles |
| `/admin/players` | Edit any field. Set course handicaps. Comp or refund |
| `/admin/draw` | Run the draw, review teams, assign tee groups, manually place the odd player out |
| `/admin/tee-times` | Edit times and starting holes |
| `/admin/cards` | Printable cart signs: team, tee time, players (optional) |
| `/admin/scoring` | Enter or fix any team's scores |
| `/admin/greenies` | Record closest-to-pin per par-3 |
| `/admin/results` | Final standings, record playoff result, payout sheet |

## Flows

### Signup

1. Form: first name, last name, email, phone, handicap index (int, optional), shirt size, wife attending (bool) → if yes, her name and shirt size.
2. POST to `/api/register` (server, service-role).
3. Server re-checks `signups_open` and the field cap. **Do not trust a client-side count.** (`signups_open` is enforced only at this route, deliberately — a DB trigger would also block Justin from adding a late player via admin.)
4. Create a confirmed Supabase auth user with the submitted email/password, then insert the linked `players` row with `payment_status = 'pending'`. Creating the user before redirect avoids storing a plaintext password for the asynchronous webhook.
5. Create Stripe Checkout Session, `client_reference_id = player.id`, 30-minute expiry.
6. Redirect to Stripe. Keep the credentials only in that browser's `sessionStorage` so the success page can sign in after payment; clear them immediately afterward.
7. Webhook `checkout.session.completed` → set `payment_status = 'paid'`, `amount_paid_cents`, `stripe_session_id`. Send confirmation email. The success page polls this status and signs in only after the webhook confirms payment.
8. Webhook `checkout.session.expired` → delete both the pending player row and provisional auth user to free the spot.

The DB enforces the cap via trigger counting `paid`/`pending`/`comped`, serialized with an advisory lock so two simultaneous signups at spot 32 cannot both get in (tested with concurrent transactions). Handle the rejection with a real message.

**Never mark a player paid from the success redirect.** Only the webhook.

### The draw

1. Justin closes signups (`signups_open = false`).
2. Sets `course_handicap` for everyone. UI should warn if any are null — the draw treats null as 99 and dumps them in B flight.
3. Runs `draw_teams(event_id)`. Show a preview and require confirmation; this is destructive.
4. With an odd field, one player is left unassigned by design. Surface them prominently for manual placement.
5. Runs `assign_tee_groups(event_id)`.
6. Sends the "you're in" email — partner and tee time.

### Event day scoring

1. Justin flips `scoring_open = true`.
2. Player opens `/score` — already signed in from registration in most cases.
3. Each hole's screen shows the hole number, par, yardage, and **the tee color for that hole, prominently** — the event plays a custom mixed-tee routing (course_holes.tee_name), and this screen is how players know which box to play. Color-code it (Black/Silver/Gold chips), don't just print the word.
4. Stepper for strokes, tap to save. Upsert on `(team_id, hole)`.
4. Optimistic UI. On a failed save: retry with backoff, keep the value in the stepper, show a subtle "retrying" state. Do not build a service-worker offline queue — the course has normal suburban LTE, and simple retry covers a dropped request.
5. Leaderboard subscribes to `scores` via Supabase Realtime with the publishable key — no auth.

RLS lets a player write only their own team's scores, and only while `scoring_open` is true. Admin can write any team's scores at any time — the fallback when a phone dies or someone is locked out.

### After the round

1. Close scoring.
2. Record 5 greenies (DB rejects a non-par-3 hole).
3. If 1st is tied: play the playoff hole, then set `playoff_rank` 1 and 2 on those teams. That overrides net in the ranking.
4. `/admin/results` renders final standings and the payout sheet from `payout_summary`.

## Leaderboard display

Columns: **Pos · Team · Thru · Net to par · Net**

- Sort by `position` from the view. It already handles: unstarted teams last, WD/DQ last, playoff override, net-to-par, then countback.
- Show `net_to_par` as the headline number (−5, E, +2). It's the only figure comparable across different hole counts.
- Show `thru` prominently. A team at −6 thru 9 leads −5 thru 18 on the live board, but the incomplete round is provisional and must be obvious.
- Teams with `holes_played = 0` show "—", never a number.
- Never re-sort client-side. The view's ordering encodes rules you'd have to reimplement.

## Auth

**Email + password.** Created during registration, not on event day.

Do not use magic links. The failure mode is specific and bad: tapping a link inside an email opens the mail app's *in-app* browser, the session is stored there, and when the player later opens Safari they are silently logged out. On a golf course with weak signal and 16 teams starting within 70 minutes, that becomes a support queue. Password sign-in has none of this — credentials are typed into the browser already open, and no email is sent.

**Flow:**
1. `/register` collects email and password along with the rest of the form.
2. The registration route creates the Supabase auth user before Stripe Checkout and links `players.auth_user_id`; an expired checkout deletes both records. This avoids ever persisting a plaintext password for later webhook processing.
3. After the signed Stripe webhook confirms payment, the success page signs the player in and clears the temporary browser-session credentials, so most never see a login screen again before October 2.
4. `/login` for anyone who gets signed out. `/reset` sends a password reset via Resend.

**This is what the schema already assumes.** RLS policies and the column-level grants are built on `auth.uid()` — a player can write only their own team's scores, and cannot edit their own handicap, payment status, team, or `is_admin` flag. All of it is tested against the real `authenticated` role. No changes needed.

**Reads are open.** `scores`, `leaderboard`, `roster`, and `team_scorecard` are anon-readable. The live leaderboard is a plain Supabase Realtime subscription with the publishable key — no login for spouses or spectators. Writing is the only thing that ever needed identity.

**Lockout fallback, in order:**
1. Password reset by email.
2. Admin score entry — `/admin/scoring` lets Justin post any team's score at any time. With 16 teams this is a 30-second fix, not an outage.
3. That's it. The token-link fallback that appeared in an earlier draft has been removed from the schema — unused security-sensitive code is a liability, and with 16 teams, admin entry covers every lockout scenario.

**Admin auth** is the same password login. `players.is_admin = true` on Justin's row, set once via SQL. Admin routes verify server-side.

**Email is needed for** signup confirmation and password reset — configure Resend. Neither is on the critical path during the round.

## Photo uploads

Bucket `event-photos`, public. Storage policies are in the schema. Compress client-side before upload (target ~1600px, JPEG) — 32 people uploading full-resolution phone photos will burn the free-tier quota fast.

## Realtime

Subscribe to `scores` for the leaderboard, and `photos` / `comments` / `reactions` for the feed. All are already in the `supabase_realtime` publication.

Debounce leaderboard re-renders. Sixteen teams entering scores produces bursts; don't re-render per event.

## Testing before October 2

Not optional. Seed a full dress rehearsal:

1. 32 test players, mixed handicaps, some with wives, one unpaid.
2. Run the draw. Confirm 16 teams, every one A+B, no orphans.
3. Enter partial scores for some teams, full for others. Confirm ranking uses net-to-par—not cumulative strokes—and that `thru` makes incomplete rounds obvious.
4. Force a tie and confirm countback resolves it.
5. Test on a real phone in sunlight, with airplane mode toggled mid-entry.
6. Run one real Stripe payment in live mode and refund it.

## Custom tee routing

The event is not played from one tee set. Justin picked a tee per hole off the physical scorecard (8 Black, 5 Silver, 5 Gold, ~5,925 yds total). Implications:

- `course_holes.tee_name` + `yardage` are the source of truth. Par and stroke index come from the card's single rows and are unaffected.
- Course rating/slope don't apply to a custom routing — irrelevant here, since course handicaps are admin-entered, not computed.
- Surface the tee color everywhere a hole is shown: score entry, `/me` scorecard, and the printed cart signs if used.
- Holes 4, 5, 11, 12, 13, 15 were ambiguous on the marked-up card and seeded with best reading. `/admin` must make these editable; Justin confirms before anything is printed.

## Known constraints

- Field cap is enforced on INSERT only. An admin can comp past 32 deliberately; that's intended, not a hole.
- `team_handicap` rounds half away from zero, so 6.5 → 7. Matches golf convention.
- Mid-round net reflects only holes played. Everyone starts on hole 1 (sequential), so allocation is uniform across the field. **If the format ever changes to a shotgun start, revisit this** — teams starting on different holes would receive different stroke allocations at the same "thru" count.
