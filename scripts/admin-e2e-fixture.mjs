import assert from "node:assert/strict";
import { readFile, rm, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const fixturePath = "/tmp/shooktoberfest-admin-e2e.json";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
assert.ok(url && serviceKey, "Supabase test environment is not configured");
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

async function cleanup() {
  let fixture;
  try {
    fixture = JSON.parse(await readFile(fixturePath, "utf8"));
  } catch {
    return;
  }
  if (fixture.eventId) await admin.from("events").delete().eq("id", fixture.eventId);
  if (fixture.userId) await admin.auth.admin.deleteUser(fixture.userId);
  await rm(fixturePath, { force: true });
}

if (process.argv[2] === "cleanup") {
  await cleanup();
  console.log("Admin browser fixture removed.");
  process.exit(0);
}

await cleanup();
const suffix = crypto.randomUUID();
const email = `codex-admin-e2e-${suffix}@example.com`;
const password = `Admin-${suffix}-Aa9!`;
let userId;
let eventId;

try {
  const { data: auth, error: authError } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(authError, null, authError?.message);
  userId = auth.user.id;

  const { data: event, error: eventError } = await admin.from("events").insert({
    name: "Admin Browser Test",
    event_date: "2026-10-02",
    signups_open: false,
    scoring_open: false,
  }).select("id").single();
  assert.equal(eventError, null, eventError?.message);
  eventId = event.id;

  const { error: holesError } = await admin.from("course_holes").insert(Array.from({ length: 18 }, (_, index) => ({
    event_id: eventId,
    hole: index + 1,
    par: [4, 7, 10, 12, 16].includes(index + 1) ? 3 : 4,
    tee_name: index % 3 === 0 ? "Black" : index % 3 === 1 ? "Silver" : "Gold",
    yardage: 300 + index * 5,
    stroke_index: index + 1,
  })));
  assert.equal(holesError, null, holesError?.message);

  const { error: groupsError } = await admin.from("tee_groups").insert(Array.from({ length: 4 }, (_, index) => ({
    event_id: eventId,
    tee_time: new Date(Date.UTC(2026, 9, 2, 15, index * 10)).toISOString(),
    starting_hole: 1,
    sort_order: index,
  })));
  assert.equal(groupsError, null, groupsError?.message);

  const golfers = Array.from({ length: 6 }, (_, index) => ({
    event_id: eventId,
    auth_user_id: null,
    first_name: `Browser${index + 1}`,
    last_name: `Golfer${index + 1}`,
    email: `browser-golfer-${index + 1}-${suffix}@example.com`,
    handicap_id: `TEST-${index + 1}-${suffix.slice(0, 4)}`.toUpperCase(),
    handicap_index: index + 2,
    course_handicap: index + 3,
    shirt_size: index % 2 ? "XL" : "L",
    payment_status: "paid",
    amount_paid_cents: 20700,
    is_admin: false,
  }));
  const { error: playersError } = await admin.from("players").insert([
    {
      event_id: eventId,
      auth_user_id: userId,
      first_name: "Browser",
      last_name: "Admin",
      email,
      handicap_id: `ADMIN-${suffix.slice(0, 8)}`.toUpperCase(),
      handicap_index: 1,
      course_handicap: 1,
      shirt_size: "L",
      payment_status: "unpaid",
      amount_paid_cents: 0,
      is_admin: true,
    },
    ...golfers,
    {
      event_id: eventId,
      first_name: "Edit",
      last_name: "ThenRemove",
      email: `edit-remove-${suffix}@example.com`,
      handicap_id: `REMOVE-${suffix.slice(0, 6)}`.toUpperCase(),
      handicap_index: 20,
      course_handicap: 20,
      shirt_size: "M",
      payment_status: "unpaid",
      amount_paid_cents: 0,
      is_admin: false,
    },
  ]);
  assert.equal(playersError, null, playersError?.message);

  await writeFile(fixturePath, JSON.stringify({ userId, eventId, email, password }), { mode: 0o600 });
  console.log(JSON.stringify({ email, password, eventId }));
} catch (error) {
  if (eventId) await admin.from("events").delete().eq("id", eventId);
  if (userId) await admin.auth.admin.deleteUser(userId);
  throw error;
}
