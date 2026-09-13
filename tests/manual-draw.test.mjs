import assert from "node:assert/strict";
import test from "node:test";
import { manualPairingsFromState, scrambleHandicap, validatePairingRows } from "../lib/admin.ts";
const players = Array.from({ length: 32 }, (_, i) => ({ id: String(i), first_name: "Player", last_name: String(i).padStart(2, "0"), payment_status: "paid", course_handicap: i, handicap_index: i, team_id: null }));
test("manual draw starts with 16 fixed A players and blank B selections", () => {
  const rows = manualPairingsFromState({ players, teams: [] });
  assert.equal(rows.length, 16);
  assert.deepEqual(rows.map(r => r.aPlayerId), players.slice(0, 16).map(p => p.id));
  assert.ok(rows.every(r => r.bPlayerId === ""));
  assert.ok(validatePairingRows(rows, players));
  const complete = rows.map((r, i) => ({ ...r, bPlayerId: String(i + 16) }));
  assert.equal(validatePairingRows(complete, players), null);
  complete[0].bPlayerId = complete[1].bPlayerId;
  assert.ok(validatePairingRows(complete, players));
});
test("saved selections restore to the correct A row", () => {
  const saved = players.map(p => ({ ...p, team_id: ["0", "20"].includes(p.id) ? "team" : null }));
  const rows = manualPairingsFromState({ players: saved, teams: [{ id: "team" }] });
  assert.equal(rows[0].bPlayerId, "20");
  assert.equal(rows[1].bPlayerId, "");
});
test("odd fields retain a solo row and empty fields stay empty", () => {
  assert.equal(manualPairingsFromState({ players: players.slice(0, 3), teams: [] })[1].aPlayerId, null);
  assert.deepEqual(manualPairingsFromState({ players: [], teams: [] }), []);
});
test("scramble handicap matches whole-number database rounding", () => {
  assert.equal(scrambleHandicap(10, 20), 7);
  assert.equal(scrambleHandicap(20, 10), 7);
  assert.equal(scrambleHandicap(0, 0), 0);
  assert.equal(scrambleHandicap(-1, -1), -1);
  assert.equal(scrambleHandicap(null, 10), null);
  assert.equal(scrambleHandicap(10, null), null);
});
