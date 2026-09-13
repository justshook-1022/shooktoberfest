# Shooktoberfest website

Event website for the October 2, 2026 two-person scramble at Mt Prospect Golf Club.

## Work in GitHub

[Open this workspace in GitHub Codespaces](https://codespaces.new/justshook-1022/shooktoberfest/tree/cloud/github-workspace-20260912).

The complete project snapshot is on `cloud/github-workspace-20260912`. You can also select that branch on GitHub, choose **Code → Codespaces**, and create a codespace. The included development container supplies Node.js 22, installs dependencies with `npm ci`, and forwards port 3000.

In the codespace terminal, start the website:

```sh
npm run dev -- --hostname 0.0.0.0
```

Open the forwarded port 3000 to preview the site. Without service credentials, it uses representative event data. For connected development, add the values listed in `.env.example` as Codespaces secrets for this repository, or create a git-ignored `.env.local` inside the codespace. Use **Source Control → Commit → Sync Changes** to save subsequent work to GitHub.

For Codex cloud, choose this repository and branch, configure Node.js 22, and use `npm ci` as the setup command. The repository root is the website root; there is no extra `Website/site` directory in GitHub.

The repository also includes the original [planning documents and SQL drafts](docs/planning/README.md), the [team-selection workbook](artifacts/team-selection/Shooktoberfest%20Team%20Selection.xlsx), and its [source files and preview](artifacts/team-selection/README.md). Service credentials, installed dependencies, build caches, and local service state are excluded from Git.

## Design lock

The approved visual design is the photo-led green/yellow build recorded in `design-lock.json` and Vercel deployment `dpl_9EZcZh48DNhzz7fsiC3LWFSaYX7L`. The older planning files outside this directory describe product behavior, not the current visual design.

`npm run design:check` verifies the protected UI source, imagery, and public CSS before a build. Production releases must use a forced preview, pass `npm run deployment:check -- <preview-url>`, receive a browser check, and then promote that same artifact. Do not deploy a fresh build directly to production.

## What is included

- Public landing page, live leaderboard, tee sheet, and photo wall
- Three-step account onboarding: handicap ID, reusable profile photo, then Stripe Checkout
- Webhook-only payment confirmation; redirects never mark a golfer paid
- Google and email/password sign-in through Supabase Auth (cookie-based SSR sessions)
- Mobile score entry with color-coded mixed tees and retry-on-drop saves
- Player event card and admin control surfaces
- Versioned Supabase schema with RLS, restricted avatar uploads, OAuth identity binding, and public-safe profile-photo projections
- Open Graph sharing art in `public/og.png`

## Local setup

Copy `.env.example` to `.env.local` and add the service values. Without them the site runs safely in preview mode with representative event data and does not accept a real payment.

Apply every file in `supabase/migrations` in filename order. The latest onboarding migration adds handicap IDs, the `profile-photos` Storage bucket, owner-scoped upload policies, and the public-safe avatar path used by the tee sheet, leaderboard, and scorecard.

Use `npm run dev` for local work, `npm run build` for the design-locked deployment build, and `npm test` for the route and configuration checks.

## Production setup

1. Deploy this repository as a Next.js project on Vercel (Node.js 22 or newer).
2. Add every variable from `.env.example` to Vercel. Never expose the service-role or Stripe secret keys as `NEXT_PUBLIC_*` values.
3. In Supabase Auth, configure Google and email/password auth, set the Vercel domain as the Site URL, allow `https://<domain>/auth/callback` as a redirect URL, and configure SMTP for password-reset emails.
4. Create the $207 Stripe Price, set `STRIPE_PRICE_ID`, and subscribe a Stripe webhook to `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, and `charge.refunded` at `/api/stripe/webhook`.

Google requires OAuth web credentials from a Google Cloud project.

## Live round scoring

The event uses one shared scorecard per scramble team. Confirmed players sign in at `/me` and select **Start round** once the organizer opens scoring in the admin event controls. Either teammate can continue the round. The card saves gross strokes and putts per hole; net is gross minus the strokes allocated from the team's handicap and the hole's stroke index. Zero putts is valid; putts cannot exceed gross strokes.

The public leaderboard ranks teams by net relative to par through the holes they have completed, with the existing playoff/countback rules. It receives score changes through Supabase Realtime and refreshes every five seconds as a fallback. `/leaderboard?event=<event UUID>` shows a specific event; the default remains Shooktoberfest. Completed cards show `F` after all 18 holes are saved.

Saves are confirmed by the database. Temporary network failures retry with backoff and retain the current entry. Draft holes are marked with an asterisk and should be saved before leaving the page. A conflicting edit from another device shows the latest saved score for review. Closing scoring prevents further player edits and leaves saved cards available for review.

`npm run test:scoring` runs an actual browser walkthrough against `SCORING_TEST_URL` (default `http://localhost:3000`). It requires Chrome, the Supabase environment in `.env.local`, and the Playwright development dependency. It creates separate temporary events and test accounts, exercises mobile and desktop clients, checks the database and public leaderboard, and deletes those fixtures in a `finally` block. Screenshots go to `work/scoring-e2e`, or `SCORING_TEST_OUTPUT` when supplied. `npm run test:admin-db` additionally verifies Realtime delivery, permissions, countback, playoffs, and withdrawal handling.
