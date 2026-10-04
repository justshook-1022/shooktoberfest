import assert from "node:assert/strict";
import test from "node:test";
import { manualPairingsFromState, scrambleHandicap, validatePairingRows } from "../lib/admin.ts";
const players = Array.from({ length: 32 }, (_, i) => ({ id: String(i), first_name: "Player", last_name: String(i).padStart(2, "0"), payment_status: "paid", course_handicap: i, handicap_index: i, team_id: null }));
test("new fields have blank A and B selectors, with no handicap assignment", () => {
  const rows = manualPairingsFromState({ players, teams: [] });
  assert.equal(rows.length, 16);
  assert.ok(rows.every(r => r.aPlayerId === null && r.bPlayerId === ""));
  assert.ok(validatePairingRows(rows, players));
});
test("saved teams and flights survive handicap changes and player removal", () => {
  const saved = [
    { ...players[0], course_handicap: 50, team_id: "t1", flight: "A" },
    { ...players[1], course_handicap: 0, team_id: "t1", flight: "B" },
    { ...players[2], team_id: "t2", flight: "B" },
  ];
  const rows = manualPairingsFromState({ players: saved, teams: [{ id: "t1" }, { id: "t2" }] });
  assert.deepEqual(rows, [
    { teamId: "t1", aPlayerId: "0", bPlayerId: "1" },
    { teamId: "t2", aPlayerId: null, bPlayerId: "2" },
  ]);
  assert.equal(validatePairingRows(rows, saved), null);
  assert.equal(manualPairingsFromState({ players: [...saved, players[3]], teams: [{ id: "t1" }, { id: "t2" }] }).length, 2);
});
test("manual selections allow either flight solo and reject duplicates and ineligible players", () => {
  const field = players.slice(0, 3);
  const rows = [{ teamId: "t1", aPlayerId: "0", bPlayerId: "1" }, { teamId: "t2", aPlayerId: "2", bPlayerId: "" }];
  assert.equal(validatePairingRows(rows, field), null);
  assert.ok(validatePairingRows([{ ...rows[0], bPlayerId: "0" }, rows[1]], field));
  assert.ok(validatePairingRows(rows, field.map(p => ({ ...p, payment_status: p.id === "2" ? "unpaid" : "paid" }))));
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
