import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("uses standard Next.js and Supabase SSR", async () => {
  const pkg = JSON.parse(await read("package.json"));
  assert.equal(pkg.scripts.dev, "next dev");
  assert.ok(pkg.dependencies.next);
  assert.ok(pkg.dependencies["@supabase/ssr"]);
  assert.equal(pkg.devDependencies?.vinext, undefined);
});

test("sign-up, login, callback redirect, and password recovery are wired", async () => {
  const [authForm, loginPage, registerPage, callback, appProxy, resetForm, header, registerRoute] = await Promise.all([
    read("app/login/AuthForm.tsx"),
    read("app/login/page.tsx"),
    read("app/register/page.tsx"),
    read("app/auth/callback/route.ts"),
    read("proxy.ts"),
    read("app/reset/ResetPasswordForm.tsx"),
    read("components/HeaderAccount.tsx"),
    read("app/api/register/route.ts"),
  ]);
  assert.match(authForm, /signInWithOAuth/);
  assert.match(authForm, /"google"/);
  assert.match(authForm, /client\.auth\.signUp/);
  assert.match(authForm, /emailRedirectTo: `\$\{getRedirectTo\(\)\}\?next=\$\{encodeURIComponent\(next\)\}`/);
  assert.match(authForm, /signInWithPassword/);
  assert.match(authForm, /data\.session/);
  assert.match(authForm, /next = "\/me"/);
  assert.match(authForm, /window\.location\.assign\(next\)/);
  assert.match(authForm, /Forgot password\?/);
  assert.match(loginPage, /const next = safeNext\(params\.next\)/);
  assert.match(loginPage, /<AuthForm next=\{next\} \/>/);
  assert.match(appProxy, /return updateSession\(request\)/);
  assert.doesNotMatch(appProxy, /searchParams\.delete\("next"\)/);
  assert.match(registerPage, /<AuthForm mode="sign-up" next="\/register" \/>/);
  assert.match(callback, /request\.cookies\.get\(AUTH_NEXT_COOKIE\)/);
  assert.match(callback, /exchangeCodeForSession/);
  assert.match(resetForm, /resetPasswordForEmail/);
  assert.match(resetForm, /updateUser\(\{ password \}\)/);
  assert.match(header, /"Sign in"/);
  assert.doesNotMatch(authForm, /"apple"/);
  assert.doesNotMatch(registerRoute, /createUser|password/);
  assert.match(registerRoute, /auth\.getUser\(\)/);
});

test("ships database security corrections", async () => {
  const [security, oauth, stripeWebhook, stripePolicy] = await Promise.all([
    read("supabase/migrations/0002_security_fixes.sql"),
    read("supabase/migrations/0003_oauth_identity.sql"),
    read("supabase/migrations/20260815213823_stripe_webhook_events.sql"),
    read("supabase/migrations/20260815214210_stripe_webhook_service_policy.sql"),
  ]);
  assert.match(security, /revoke execute on function draw_teams/);
  assert.match(security, /e\.scoring_open/);
  assert.match(oauth, /players_event_auth_user_unique/);
  assert.match(oauth, /revoke all on leaderboard/);
  assert.match(stripeWebhook, /stripe_webhook_events/);
  assert.match(stripeWebhook, /enable row level security/);
  assert.match(stripeWebhook, /revoke all on stripe_webhook_events from public, anon, authenticated/);
  assert.match(stripePolicy, /to service_role/);
});

test("Stripe Checkout and webhooks are retry-safe", async () => {
  const [registerRoute, resumeRoute, webhookRoute, stripeClient, checkoutHelper, eventConfig, registrationForm, resumeButton, stripeSetup] = await Promise.all([
    read("app/api/register/route.ts"),
    read("app/api/register/checkout/route.ts"),
    read("app/api/stripe/webhook/route.ts"),
    read("lib/stripe.ts"),
    read("lib/registration-checkout.ts"),
    read("lib/event.ts"),
    read("app/register/RegisterForm.tsx"),
    read("app/me/ResumePaymentButton.tsx"),
    read("scripts/setup-stripe.mjs"),
  ]);
  assert.doesNotMatch(registerRoute, /createRegistrationCheckout/);
  assert.match(resumeRoute, /createRegistrationCheckout/);
  assert.match(resumeRoute, /resource_missing/);
  assert.match(resumeRoute, /Stripe checkout session is stale; creating a replacement/);
  assert.match(resumeRoute, /Stripe checkout creation failed/);
  assert.match(resumeRoute, /standard-checkout-v1/);
  assert.match(checkoutHelper, /integration_identifier/);
  assert.match(checkoutHelper, /managed_payments:\s*\{\s*enabled:\s*false\s*\}/);
  assert.match(resumeRoute, /idempotencyKey/);
  assert.match(checkoutHelper, /payment_intent_data/);
  assert.doesNotMatch(checkoutHelper, /payment_method_types/);
  assert.match(resumeRoute, /checkout\.sessions\.retrieve/);
  assert.match(resumeRoute, /shooktoberfest-resume/);
  assert.match(webhookRoute, /constructEventAsync/);
  assert.match(webhookRoute, /checkout\.session\.async_payment_succeeded/);
  assert.match(webhookRoute, /charge\.refunded/);
  assert.match(webhookRoute, /stripe_webhook_events/);
  assert.match(webhookRoute, /payment_status: "unpaid"/);
  assert.match(webhookRoute, /eq\("stripe_session_id", session\.id\)/);
  assert.match(stripeClient, /new Stripe\(apiKey\)/);
  assert.match(eventConfig, /entry: 207/);
  assert.match(registrationForm, /\$\{event\.entry\}/);
  assert.match(resumeButton, /\$\{event\.entry\}/);
  assert.match(stripeSetup, /registrationPriceCents = 20_700/);
  assert.match(stripeSetup, /shooktoberfest_2026_registration/);
});

test("account onboarding requires handicap, editable photo, then payment", async () => {
  const [form, cropper, cropMath, registerRoute, photoRoute, checkoutRoute, migration, scorecard] = await Promise.all([
    read("app/register/RegisterForm.tsx"),
    read("app/register/ProfilePhotoCropper.tsx"),
    read("lib/profile-photo-crop.ts"),
    read("app/api/register/route.ts"),
    read("app/api/register/photo/route.ts"),
    read("app/api/register/checkout/route.ts"),
    read("supabase/migrations/20260816234748_account_onboarding_profiles.sql"),
    read("app/score/ScoreEntry.tsx"),
  ]);
  assert.match(form, /Handicap ID/);
  assert.match(form, /profile-photos/);
  assert.match(form, /createProfilePhotoBlob\(selectedPhoto, photoCrop\)/);
  assert.match(cropper, /onPointerMove/);
  assert.match(cropper, /type="range"/);
  assert.match(cropMath, /PROFILE_PHOTO_OUTPUT_SIZE = 720/);
  assert.match(cropMath, /safeCrop\.x \* maxPanX/);
  assert.match(form, /Pay securely with Stripe/);
  assert.match(registerRoute, /payment_status: "unpaid"/);
  assert.match(photoRoute, /profile_photo_path/);
  assert.match(checkoutRoute, /!player\.handicap_id \|\| !player\.profile_photo_path/);
  assert.match(migration, /add column handicap_id/);
  assert.match(migration, /profile-photos/);
  assert.match(migration, /profile_photo_path/);
  assert.match(scorecard, /PlayerAvatar/);
});

test("leaderboard shows team details and essential net scoring", async () => {
  const [page, leaderboard] = await Promise.all([
    read("app/leaderboard/page.tsx"),
    read("app/leaderboard/LeaderboardClient.tsx"),
  ]);
  assert.match(page, /Leader Board/);
  assert.match(leaderboard, />TEAM</);
  assert.match(leaderboard, />NET TO PAR</);
  assert.match(leaderboard, />THRU</);
  assert.doesNotMatch(leaderboard, />TODAY<|>TRACK<|>FAV<|board-status|board-note/);
});

test("pending players can resume payment from their profile", async () => {
  const [profile, button, migration] = await Promise.all([
    read("app/me/page.tsx"),
    read("app/me/ResumePaymentButton.tsx"),
    read("supabase/migrations/20260815223151_resumable_checkout.sql"),
  ]);
  assert.match(profile, /Complete your payment/);
  assert.match(profile, /Admin dashboard/);
  assert.match(button, /\/api\/register\/checkout/);
  assert.match(migration, /before insert or update of event_id, payment_status/);
});

test("the custom route totals are unchanged", async () => {
  const source = await read("lib/event.ts");
  const pars = [...source.matchAll(/\bpar: (\d+)/g)].map((match) => Number(match[1]));
  const yards = [...source.matchAll(/yards: (\d+)/g)].map((match) => Number(match[1]));
  assert.equal(pars.reduce((sum, value) => sum + value, 0), 70);
  assert.equal(yards.reduce((sum, value) => sum + value, 0), 5925);
});

test("admin UI and service route cover the complete event setup workflow", async () => {
  const [dashboard, sections, route, migration] = await Promise.all([
    read("app/admin/AdminDashboard.tsx"),
    read("app/admin/AdminSections.tsx"),
    read("app/api/admin/route.ts"),
    read("supabase/migrations/20260817030227_admin_event_controls.sql"),
  ]);
  assert.match(dashboard, /scoring_open/);
  assert.match(sections, /Choose your teams/);
  assert.match(sections, /Save teams/);
  assert.match(sections, /Save foursome pairings/);
  assert.match(sections, /datetime-local/);
  assert.match(sections, /Remove player/);
  assert.match(sections, /Save entire scorecard/);
  assert.match(route, /case "update-player"/);
  assert.match(route, /case "remove-player"/);
  assert.match(route, /case "assign-tee-groups"/);
  assert.match(migration, /admin_apply_team_pairings/);
  assert.match(migration, /admin_set_tee_group_assignments/);
  assert.match(migration, /Pairings cannot be changed after scoring has started/);
});
