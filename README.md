# Shooktoberfest website

Event website for the October 2, 2026 two-person scramble at Mt Prospect Golf Club.

## What is included

- Public landing page, live leaderboard, tee sheet, and photo wall
- Stripe Checkout registration with webhook-only payment confirmation
- Google and Apple sign-in through Supabase Auth (cookie-based SSR sessions)
- Mobile score entry with color-coded mixed tees and retry-on-drop saves
- Player event card and admin control surfaces
- Versioned Supabase schema with RLS, restricted admin functions, and OAuth identity binding
- Open Graph sharing art in `public/og.png`

## Local setup

Copy `.env.example` to `.env.local` and add the service values. Without them the site runs safely in preview mode with representative event data and does not accept a real payment.

Apply the migrations in order:

1. `supabase/migrations/0001_shooktoberfest_schema.sql`
2. `supabase/migrations/0002_security_fixes.sql`
3. `supabase/migrations/0003_oauth_identity.sql`

The second migration closes player-score and admin-function permission gaps. The third binds registrations to social identities and limits public view grants.

Use `npm run dev` for local work, `npm run build` for the deployment build, and `npm test` for the route and configuration checks.

## Production setup

1. Deploy this repository as a Next.js project on Vercel (Node.js 22 or newer).
2. Add every variable from `.env.example` to Vercel. Never expose the service-role or Stripe secret keys as `NEXT_PUBLIC_*` values.
3. In Supabase Auth, configure Google and Apple, set the Vercel domain as the Site URL, and allow `https://<domain>/auth/callback` as a redirect URL.
4. Create the $200 Stripe Price, set `STRIPE_PRICE_ID`, and subscribe a Stripe webhook to `checkout.session.completed` and `checkout.session.expired` at `/api/stripe/webhook`.

Google requires OAuth web credentials. Apple requires an Apple Developer Services ID and a client secret that must be rotated on Apple’s schedule.
