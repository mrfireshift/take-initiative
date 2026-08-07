import test from "node:test";
import assert from "node:assert/strict";

import { retainHPMapWithinByteBudget } from "../src/hpMemoryRetention.js";

function bytes(value) {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

test("hpMemory Room rispetta il budget senza alterare una mappa già compatta", () => {
  const source = {
    hero: { hp: 8, hpMax: 10, attitude: "pc", t: 10 },
  };
  const retained = retainHPMapWithinByteBudget(source, 1_000);

  assert.deepEqual(retained, source);
  assert.notEqual(retained, source);
});

test("hpMemory Room privilegia i record HP rispetto alle sole attitude", () => {
  const source = {
    "old-hero": { hp: 8, hpMax: 10, attitude: "pc", t: 1 },
    "recent-attitude": { attitude: "enemy", tAtt: 999, note: "x".repeat(120) },
    "older-attitude": { attitude: "ally", tAtt: 500, note: "y".repeat(120) },
  };
  const heroOnlyBudget = bytes({ "old-hero": source["old-hero"] });
  const retained = retainHPMapWithinByteBudget(source, heroOnlyBudget);

  assert.deepEqual(retained, { "old-hero": source["old-hero"] });
  assert.ok(bytes(retained) <= heroOnlyBudget);
});

test("hpMemory Room conserva i record più recenti a parità di priorità", () => {
  const source = {
    old: { attitude: "ally", tAtt: 1, note: "o".repeat(80) },
    recent: { attitude: "ally", tAtt: 2, note: "r".repeat(80) },
  };
  const oneEntryBudget = bytes({ recent: source.recent });
  const retained = retainHPMapWithinByteBudget(source, oneEntryBudget);

  assert.deepEqual(retained, { recent: source.recent });
  assert.ok(bytes(retained) <= oneEntryBudget);
});
