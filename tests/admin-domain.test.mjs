import assert from "node:assert/strict";
import test from "node:test";
import {
  centralTimeInputToIso,
  pairingsFromState,
  teeTimeInputValue,
  validatePairingRows,
} from "../lib/admin.ts";

function player(id, handicap, overrides = {}) {
  return {
    id,
    auth_user_id: null,
    first_name: `Player ${id}`,
    last_name: `Last ${id}`,
    email: `${id}@example.com`,
    phone: null,
    handicap_id: null,
    handicap_index: handicap,
    course_handicap: handicap,
    flight: null,
    shirt_size: "L",
    team_id: null,
    wife_attending: false,
    wife_name: null,
    wife_shirt_size: null,
    payment_status: "paid",
    amount_paid_cents: 20700,
    profile_photo_path: null,
    is_admin: false,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

test("pairing validation catches duplicates and omissions", () => {
  const players = [player("1", 1), player("2", 2), player("3", 3), player("4", 4)];
  const invalid = [{ aPlayerId: "1", bPlayerId: "3" }, { aPlayerId: "1", bPlayerId: "4" }];
  assert.match(validatePairingRows(invalid, players), /exactly once/);
});

test("saved teams are reconstructed into editable A/B rows", () => {
  const players = [
    player("1", 1, { flight: "A", team_id: "t1" }),
    player("2", 2, { flight: "A", team_id: "t2" }),
    player("3", 12, { flight: "B", team_id: "t2" }),
    player("4", 14, { flight: "B", team_id: "t1" }),
  ];
  const rows = pairingsFromState({ players, teams: [{ id: "t1" }, { id: "t2" }] });
  assert.deepEqual(rows, [
    { teamId: "t1", aPlayerId: "1", bPlayerId: "4" },
    { teamId: "t2", aPlayerId: "2", bPlayerId: "3" },
  ]);
});

test("tee-time form values are rendered in Central Time", () => {
  assert.equal(teeTimeInputValue("2026-10-02T15:10:00Z"), "2026-10-02T10:10");
  assert.equal(centralTimeInputToIso("2026-10-02T10:10"), "2026-10-02T15:10:00.000Z");
  assert.equal(centralTimeInputToIso("2026-12-04T10:10"), "2026-12-04T16:10:00.000Z");
});
