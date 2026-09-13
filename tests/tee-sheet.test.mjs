import assert from "node:assert/strict";
import test from "node:test";
import { groupTeeTeams } from "../lib/tee-sheet.ts";

const player = (playerId, name, teamId, teamName) => ({ playerId, name, teamId, teamName, photoUrl: `/photos/${playerId}.jpg` });
test("interleaved roster rows keep each player's name and photo with their saved pairing", () => {
  const rows = [
    player("bill", "Bill Shanahan", "a", "Coldagelli / Shanahan"),
    player("kyle", "Kyle Gajewski", "b", "Gajewski / Grueter"),
    player("tony", "Tony Coldagelli", "a", "Coldagelli / Shanahan"),
    player("jason", "Jason Grueter", "b", "Gajewski / Grueter"),
  ];
  for (const roster of [rows, [...rows].reverse(), [rows[1], rows[2], rows[3], rows[0]]]) {
    const teams = groupTeeTeams(roster);
    assert.equal(teams.length, 2);
    assert.deepEqual(teams.find(team => team.id === "a").players.map(p => p.playerId).sort(), ["bill", "tony"]);
    assert.deepEqual(teams.find(team => team.id === "b").players.map(p => p.playerId).sort(), ["jason", "kyle"]);
    assert.ok(teams.flatMap(team => team.players).every(p => p.photoUrl === `/photos/${p.playerId}.jpg`));
  }
});
test("duplicate team names and missing partners cannot move players to a different team", () => {
  const teams = groupTeeTeams([player("1", "Alex Smith", "a", "Smith / Jones"), player("2", "Sam Smith", "b", "Smith / Jones"), player("3", "Pat Jones", "b", "Smith / Jones")]);
  assert.deepEqual(teams.map(team => team.players.length), [1, 2]);
  assert.equal(teams[0].players[0].name, "Alex Smith");
  assert.deepEqual(groupTeeTeams([]), []);
});
