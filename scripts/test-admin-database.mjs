import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
assert.ok(url && serviceKey && publicKey, "Supabase test environment is not configured");

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const anonymous = createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
let eventId;
let realtimeChannel;
const authUserIds = [];

function assertQuery(result, label) {
  assert.equal(result.error, null, `${label}: ${result.error?.message}`);
  return result.data;
}

try {
  const authFixtures = await Promise.all(["one", "two"].map(async (label) => {
    const suffix = crypto.randomUUID();
    const email = `score-${label}-${suffix}@example.com`;
    const password = `Score-${suffix}-Aa9!`;
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    assert.equal(error, null, `create ${label} scorekeeper: ${error?.message}`);
    authUserIds.push(data.user.id);
    return { id: data.user.id, email, password };
  }));

  const event = assertQuery(await admin.from("events").insert({
    name: `Admin integration test ${crypto.randomUUID()}`,
    event_date: "2026-10-02",
    signups_open: false,
  }).select("id").single(), "create test event");
  eventId = event.id;

  assertQuery(await admin.from("course_holes").insert(Array.from({ length: 18 }, (_, index) => ({
    event_id: eventId,
    hole: index + 1,
    par: [4, 7, 10, 12, 16].includes(index + 1) ? 3 : 4,
    tee_name: "Black",
    yardage: 300 + index,
    stroke_index: index + 1,
  }))), "seed test holes");

  const groups = assertQuery(await admin.from("tee_groups").insert([
    { event_id: eventId, tee_time: "2026-10-02T15:00:00Z", starting_hole: 1, sort_order: 0 },
    { event_id: eventId, tee_time: "2026-10-02T15:10:00Z", starting_hole: 1, sort_order: 1 },
  ]).select("id,sort_order").order("sort_order"), "seed test tee groups");

  const players = assertQuery(await admin.from("players").insert([
    ...Array.from({ length: 6 }, (_, index) => ({
      event_id: eventId,
      auth_user_id: authFixtures[index]?.id ?? null,
      first_name: `Test${index + 1}`,
      last_name: `Golfer${index + 1}`,
      email: `admin-test-${crypto.randomUUID()}@example.com`,
      course_handicap: index + 1,
      shirt_size: "L",
      payment_status: "paid",
      amount_paid_cents: 20700,
    })),
    {
      event_id: eventId,
      first_name: "Not",
      last_name: "Eligible",
      email: `admin-test-${crypto.randomUUID()}@example.com`,
      course_handicap: 20,
      shirt_size: "L",
      payment_status: "unpaid",
      amount_paid_cents: 0,
    },
  ]).select("id,course_handicap,payment_status").order("course_handicap"), "seed test players");
  const eligible = players.filter((player) => player.payment_status === "paid");

  assertQuery(await admin.rpc("admin_apply_team_pairings", {
    p_event_id: eventId,
    p_pairings: [[eligible[0].id, eligible[3].id], [eligible[1].id, eligible[4].id], [eligible[2].id, eligible[5].id]],
  }), "save initial pairings");

  let teams = assertQuery(await admin.from("teams").select("id,tee_group_id").eq("event_id", eventId).order("created_at"), "read drawn teams");
  const drawnPlayers = assertQuery(await admin.from("players").select("id,flight,team_id,payment_status").eq("event_id", eventId), "read drawn players");
  assert.equal(teams.length, 3);
  assert.equal(drawnPlayers.filter((player) => player.flight === "A").length, 3);
  assert.equal(drawnPlayers.filter((player) => player.flight === "B").length, 3);
  assert.equal(drawnPlayers.find((player) => player.payment_status === "unpaid").team_id, null);

  assertQuery(await admin.rpc("admin_apply_team_pairings", {
    p_event_id: eventId,
    p_pairings: [[eligible[0].id, eligible[4].id], [eligible[1].id, eligible[5].id], [eligible[2].id, eligible[3].id]],
  }), "adjust saved pairings");
  teams = assertQuery(await admin.from("teams").select("id,tee_group_id").eq("event_id", eventId).order("created_at"), "read adjusted teams");

  assertQuery(await admin.rpc("assign_tee_groups", { p_event_id: eventId }), "randomly assign tee groups");
  const randomAssignments = assertQuery(await admin.from("teams").select("id,tee_group_id").eq("event_id", eventId), "read random tee assignments");
  assert.equal(randomAssignments.filter((team) => team.tee_group_id).length, 3);
  assert.ok(groups.every((group) => randomAssignments.filter((team) => team.tee_group_id === group.id).length <= 2));

  assertQuery(await admin.rpc("admin_set_tee_group_assignments", {
    p_event_id: eventId,
    p_assignments: [
      { team_id: teams[0].id, tee_group_id: groups[1].id },
      { team_id: teams[1].id, tee_group_id: groups[0].id },
      { team_id: teams[2].id, tee_group_id: groups[0].id },
    ],
  }), "adjust tee group pairings");
  const manualAssignments = assertQuery(await admin.from("teams").select("id,tee_group_id").eq("event_id", eventId), "read manual tee assignments");
  assert.equal(manualAssignments.filter((team) => team.tee_group_id === groups[0].id).length, 2);
  assert.equal(manualAssignments.filter((team) => team.tee_group_id === groups[1].id).length, 1);

  const scorekeepers = assertQuery(await admin.from("players").select("id,auth_user_id,team_id").in("auth_user_id", authUserIds), "read scorekeepers");
  const scorekeeperOne = scorekeepers.find((player) => player.auth_user_id === authFixtures[0].id);
  const scorekeeperTwo = scorekeepers.find((player) => player.auth_user_id === authFixtures[1].id);
  assert.ok(scorekeeperOne?.team_id && scorekeeperTwo?.team_id && scorekeeperOne.team_id !== scorekeeperTwo.team_id);

  const golferOne = createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const golferTwo = createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
  assertQuery(await golferOne.auth.signInWithPassword({ email: authFixtures[0].email, password: authFixtures[0].password }), "sign in first scorekeeper");
  assertQuery(await golferTwo.auth.signInWithPassword({ email: authFixtures[1].email, password: authFixtures[1].password }), "sign in second scorekeeper");

  const closedWrite = await golferOne.from("scores").upsert({
    team_id: scorekeeperOne.team_id,
    hole: 1,
    strokes: 4,
    entered_by: scorekeeperOne.id, putts: 2,
  }, { onConflict: "team_id,hole" });
  assert.ok(closedWrite.error, "player scoring must be rejected while scoring is closed");

  assertQuery(await admin.from("events").update({ scoring_open: true }).eq("id", eventId), "open scoring");
  assertQuery(await golferOne.from("team_rounds").insert({team_id: scorekeeperOne.team_id, started_by: scorekeeperOne.id}), "start first round");
  assertQuery(await golferTwo.from("team_rounds").insert({team_id: scorekeeperTwo.team_id, started_by: scorekeeperTwo.id}), "start second round");
  const foreignWrite = await golferOne.from("scores").upsert({
    team_id: scorekeeperTwo.team_id,
    hole: 1,
    strokes: 2,
    entered_by: scorekeeperOne.id, putts: 2,
  }, { onConflict: "team_id,hole" });
  assert.ok(foreignWrite.error, "a player must not score another team");

  let resolveChange;
  let rejectChange;
  const changed = new Promise((resolve, reject) => {
    resolveChange = resolve;
    rejectChange = reject;
  });
  const subscribed = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Realtime subscription timed out")), 20_000);
    realtimeChannel = anonymous
      .channel(`score-integration-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "scores" }, (payload) => {
        if (payload.new?.team_id === scorekeeperOne.team_id && payload.new?.hole === 2) resolveChange(payload.new);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          clearTimeout(timer);
          resolve();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          clearTimeout(timer);
          reject(new Error(`Realtime subscription failed: ${status}`));
        }
      });
  });
  const changeTimer = setTimeout(() => rejectChange(new Error("Realtime score event timed out")), 20_000);
  await subscribed;
  await new Promise((resolve) => setTimeout(resolve, 500));
  assertQuery(await golferOne.from("scores").upsert({
    team_id: scorekeeperOne.team_id,
    hole: 2,
    strokes: 5,
    entered_by: scorekeeperOne.id, putts: 2,
  }, { onConflict: "team_id,hole" }), "save player score");
  const realtimeScore = await changed;
  clearTimeout(changeTimer);
  assert.equal(realtimeScore.strokes, 5);

  assertQuery(await golferTwo.from("scores").upsert({
    team_id: scorekeeperTwo.team_id,
    hole: 1,
    strokes: 6,
    entered_by: scorekeeperTwo.id, putts: 2,
  }, { onConflict: "team_id,hole" }), "save second team score");

  assertQuery(await admin.rpc("admin_save_scorecard", {
    p_event_id: eventId,
    p_team_id: teams[0].id,
    p_scores: { 1: 4, 2: 5, 3: 3 },
    p_entered_by: null,
  }), "save admin scorecard");
  const savedScores = assertQuery(await admin.from("scores").select("hole,strokes").eq("team_id", teams[0].id).order("hole"), "read saved scorecard");
  assert.deepEqual(savedScores, [{ hole: 1, strokes: 4 }, { hole: 2, strokes: 5 }, { hole: 3, strokes: 3 }]);

  const lockedDraw = await admin.rpc("admin_apply_team_pairings", {
    p_event_id: eventId,
    p_pairings: [[eligible[0].id, eligible[3].id], [eligible[1].id, eligible[4].id], [eligible[2].id, eligible[5].id]],
  });
  assert.match(lockedDraw.error?.message ?? "", /cannot be changed after scoring has started/i);

  const publicAttempt = await anonymous.rpc("admin_save_scorecard", {
    p_event_id: eventId,
    p_team_id: teams[0].id,
    p_scores: { 1: 2 },
    p_entered_by: null,
  });
  assert.ok(publicAttempt.error, "anonymous callers must not execute admin scorecard writes");

  const courseHoles = assertQuery(await admin.from("course_holes").select("hole,par").eq("event_id", eventId).order("hole"), "read scoring route");
  const handicaps = assertQuery(await admin.from("leaderboard").select("team_id,team_hcp").eq("event_id", eventId), "read team handicaps");
  const handicapByTeam = new Map(handicaps.map((row) => [row.team_id, row.team_hcp]));
  const tiedCard = (teamId, adjustmentHole) => {
    const card = Object.fromEntries(courseHoles.map((hole) => [hole.hole, hole.par]));
    card[adjustmentHole] += handicapByTeam.get(teamId);
    return card;
  };
  assertQuery(await admin.rpc("admin_save_scorecard", {
    p_event_id: eventId,
    p_team_id: teams[0].id,
    p_scores: tiedCard(teams[0].id, 18),
    p_entered_by: null,
  }), "save first tied scorecard");
  assertQuery(await admin.rpc("admin_save_scorecard", {
    p_event_id: eventId,
    p_team_id: teams[1].id,
    p_scores: tiedCard(teams[1].id, 1),
    p_entered_by: null,
  }), "save second tied scorecard");
  let standings = assertQuery(await anonymous.from("leaderboard").select("team_id,position,holes_played,net_to_par").eq("event_id", eventId).order("position"), "read public standings");
  assert.equal(standings.find((row) => row.team_id === teams[0].id).net_to_par, 0);
  assert.equal(standings.find((row) => row.team_id === teams[1].id).net_to_par, 0);
  assert.equal(standings.find((row) => row.team_id === teams[0].id).holes_played, 18);
  assert.ok(
    standings.find((row) => row.team_id === teams[1].id).position < standings.find((row) => row.team_id === teams[0].id).position,
    "lower net score on hole 18 must win countback",
  );

  assertQuery(await admin.rpc("admin_save_scorecard", {
    p_event_id: eventId,
    p_team_id: teams[2].id,
    p_scores: { 1: 4 },
    p_entered_by: null,
  }), "save partial leading scorecard");
  standings = assertQuery(await anonymous.from("leaderboard").select("team_id,position,holes_played,net_to_par").eq("event_id", eventId).order("position"), "read partial standings");
  assert.equal(standings[0].team_id, teams[2].id, "live standings must rank a lower net-to-par first even before the round is complete");
  assert.equal(standings[0].holes_played, 1);
  assert.equal(standings[0].net_to_par, -1);

  assertQuery(await admin.from("teams").update({ playoff_rank: 1 }).eq("id", teams[0].id), "set playoff winner");
  assertQuery(await admin.from("teams").update({ playoff_rank: 2 }).eq("id", teams[1].id), "set playoff runner-up");
  standings = assertQuery(await anonymous.from("leaderboard").select("team_id,position").eq("event_id", eventId).order("position"), "read playoff standings");
  assert.equal(standings[0].team_id, teams[0].id, "playoff result must override live net-to-par and countback");

  assertQuery(await admin.from("teams").update({ status: "wd" }).eq("id", teams[0].id), "withdraw playoff winner");
  standings = assertQuery(await anonymous.from("leaderboard").select("team_id,position,status").eq("event_id", eventId).order("position"), "read withdrawal standings");
  assert.equal(standings[0].team_id, teams[1].id, "active teams must rank ahead of withdrawn teams");

  console.log("Event-day integration passed: RLS scoring gates, Realtime, score math, countback, playoff, withdrawal, draw lock, and admin permissions.");
} finally {
  if (realtimeChannel) await anonymous.removeChannel(realtimeChannel);
  if (eventId) {
    const cleanup = await admin.from("events").delete().eq("id", eventId);
    assert.equal(cleanup.error, null, `cleanup test event: ${cleanup.error?.message}`);
  }
  for (const userId of authUserIds) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    assert.equal(error, null, `cleanup auth user: ${error?.message}`);
  }
}
