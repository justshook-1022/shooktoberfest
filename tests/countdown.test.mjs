import assert from "node:assert/strict";
import test from "node:test";
import { EVENT_START, getCountdown } from "../lib/countdown.ts";

test("countdown targets 10 a.m. Chicago time, independent of visitor timezone", () => {
  assert.equal(new Date(EVENT_START).toISOString(), "2026-10-02T15:00:00.000Z");
  assert.deepEqual(getCountdown(Date.parse("2026-10-01T13:58:57Z")), { Days: 1, Hours: 1, Minutes: 1, Seconds: 3 });
});
test("countdown rolls over and never becomes negative", () => {
  const start = Date.parse(EVENT_START);
  assert.deepEqual(getCountdown(start - 1000), { Days: 0, Hours: 0, Minutes: 0, Seconds: 1 });
  assert.deepEqual(getCountdown(start - 1), { Days: 0, Hours: 0, Minutes: 0, Seconds: 1 });
  for (const now of [start, start + 86400000]) {
    assert.deepEqual(getCountdown(now), { Days: 0, Hours: 0, Minutes: 0, Seconds: 0 });
  }
});
