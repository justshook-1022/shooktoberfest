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

test("social auth replaces passwords", async () => {
  const [authForm, registerRoute] = await Promise.all([
    read("app/login/AuthForm.tsx"),
    read("app/api/register/route.ts"),
  ]);
  assert.match(authForm, /provider: Provider/);
  assert.match(authForm, /"google"/);
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
  const [registerRoute, webhookRoute, stripeClient] = await Promise.all([
    read("app/api/register/route.ts"),
    read("app/api/stripe/webhook/route.ts"),
    read("lib/stripe.ts"),
  ]);
  assert.match(registerRoute, /integration_identifier/);
  assert.match(registerRoute, /idempotencyKey/);
  assert.match(registerRoute, /payment_intent_data/);
  assert.doesNotMatch(registerRoute, /payment_method_types/);
  assert.match(webhookRoute, /constructEventAsync/);
  assert.match(webhookRoute, /checkout\.session\.async_payment_succeeded/);
  assert.match(webhookRoute, /charge\.refunded/);
  assert.match(webhookRoute, /stripe_webhook_events/);
  assert.match(stripeClient, /new Stripe\(apiKey\)/);
});

test("the custom route totals are unchanged", async () => {
  const source = await read("lib/event.ts");
  const pars = [...source.matchAll(/\bpar: (\d+)/g)].map((match) => Number(match[1]));
  const yards = [...source.matchAll(/yards: (\d+)/g)].map((match) => Number(match[1]));
  assert.equal(pars.reduce((sum, value) => sum + value, 0), 70);
  assert.equal(yards.reduce((sum, value) => sum + value, 0), 5925);
});
