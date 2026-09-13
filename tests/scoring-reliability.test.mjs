import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  MAX_SCORE_SAVE_ATTEMPTS,
  isRetryableScoreError,
  scoreRetryDelay,
} from "../lib/scoring.ts";
import { holes, strokesReceived } from "../lib/event.ts";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("stroke allocation always adds up to the team handicap", () => {
  for (let handicap = -54; handicap <= 54; handicap += 1) {
    const allocated = holes.reduce((total, hole) => total + strokesReceived(handicap, hole.strokeIndex), 0);
    assert.equal(allocated, handicap, `handicap ${handicap}`);
  }
});

test("score retries use bounded exponential backoff", () => {
  assert.equal(MAX_SCORE_SAVE_ATTEMPTS, 5);
  assert.deepEqual(
    Array.from({ length: MAX_SCORE_SAVE_ATTEMPTS }, (_, attempt) => scoreRetryDelay(attempt)),
    [1000, 2000, 4000, 8000, 10000],
  );
});

test("only transient score-save failures are retried", () => {
  assert.equal(isRetryableScoreError({ message: "TypeError: Failed to fetch", code: "" }), true);
  assert.equal(isRetryableScoreError({ message: "upstream timeout", status: 504 }), true);
  assert.equal(isRetryableScoreError({ message: "service unavailable", status: 503 }), true);
  assert.equal(isRetryableScoreError({ message: "new row violates row-level security policy", code: "42501", status: 403 }), false);
  assert.equal(isRetryableScoreError({ message: "JWT expired", status: 401 }), false);
  assert.equal(isRetryableScoreError({ message: "strokes violates check constraint", code: "23514", status: 400 }), false);
});

test("score entry cannot report a local-only save and uses live course routing", async () => {
  const source = await read("app/score/ScoreEntry.tsx");
  assert.doesNotMatch(source, /localStorage|demo-scores/);
  assert.match(source, /course_holes/);
  assert.match(source, /scoring_open/);
  assert.match(source, /isRetryableScoreError/);
  assert.match(source, /MAX_SCORE_SAVE_ATTEMPTS/);
  assert.match(source, /Save failed · tap to retry/);
});

test("leaderboard is event-scoped and has a polling fallback for Realtime", async () => {
  const [leaderboard, publicData, currentEvent] = await Promise.all([
    read("app/leaderboard/LeaderboardClient.tsx"),
    read("lib/supabase/public.ts"),
    read("lib/supabase/current-event.ts"),
  ]);
  assert.match(leaderboard, /\.eq\("event_id", eventId\)/);
  assert.match(leaderboard, /setInterval/);
  assert.match(leaderboard, /visibilitychange/);
  assert.match(publicData, /\.eq\("event_id", event\.id\)/);
  assert.match(currentEvent, /event\.dateISO/);
});
