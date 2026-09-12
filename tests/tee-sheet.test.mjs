import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = await readFile(new URL("../lib/supabase/public.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });

async function sheetFor(rows) {
  const query = { select() { return this; }, not() { return this; }, async order() { return { data: rows }; } };
  const context = {
    exports: {},
    process: { env: { NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "test" } },
    require: () => ({ createClient: () => ({ from: () => query }) }),
  };
  vm.runInNewContext(outputText, context);
  return JSON.parse(JSON.stringify(await context.exports.getTeeSheet()));
}

const player = (id, first, last, team, name) => ({ player_id: id, first_name: first, last_name: last, team_id: team, team_name: name, tee_time: "2026-10-02T15:10:00Z", starting_hole: 1 });

test("interleaved live roster rows stay with their saved teammates", async () => {
  const rows = [
    player("1", "Giuseppe", "Infusino", "a", "Infusino / Schaefer"),
    player("2", "Bret", "Williams", "b", "Vincenti / Williams"),
    player("3", "Brandon", "Schaefer", "a", "Infusino / Schaefer"),
    player("4", "Rocco", "Vincenti", "b", "Vincenti / Williams"),
  ];
  for (const order of [rows, [...rows].reverse(), [rows[2], rows[1], rows[0], rows[3]]]) {
    const [group] = await sheetFor(order);
    assert.equal(group.time, "10:10 AM");
    assert.deepEqual(group.teams.find(team => team.id === "a").players.sort(), ["Brandon Schaefer", "Giuseppe Infusino"]);
    assert.deepEqual(group.teams.find(team => team.id === "b").players.sort(), ["Bret Williams", "Rocco Vincenti"]);
  }
});

test("duplicate team names and incomplete teams cannot borrow another team's player", async () => {
  const [group] = await sheetFor([
    player("1", "One", "Player", "a", "Same name"),
    player("2", "Two", "Player", "b", "Same name"),
    player("3", "Three", "Player", "b", "Same name"),
    player("4", "Four", "Player", null, null),
    player("5", "Five", "Player", null, null),
  ]);
  assert.deepEqual(group.teams.map(team => team.players.length), [1, 2, 1, 1]);
});
