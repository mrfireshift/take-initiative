import test from "node:test";
import assert from "node:assert/strict";
import {
  exhaustionLevelFromInstances,
  normalizeExhaustionLevel,
  reconcileExhaustionInstances,
} from "../src/exhaustionCore.js";

test("normalizza Indebolimento nell'intervallo 0-5", () => {
  assert.equal(normalizeExhaustionLevel(-2), 0);
  assert.equal(normalizeExhaustionLevel(2.6), 3);
  assert.equal(normalizeExhaustionLevel(9), 5);
  assert.equal(normalizeExhaustionLevel("x"), 0);
});

test("una condizione legacy senza livello vale 1", () => {
  assert.equal(exhaustionLevelFromInstances([
    { id: "legacy", condition: "Indebolimento", active: true },
  ]), 1);
});

test("riconcilia i duplicati in una sola condizione manuale stabile", () => {
  const next = reconcileExhaustionInstances([
    { id: "a", condition: "Prono", active: true },
    { id: "old", condition: "Indebolimento", active: true, level: 1, sourceId: "spell" },
    { id: "duplicate", condition: "Indebolimento", active: true, level: 3 },
    { id: "b", condition: "Accecato", active: true },
  ], 4, { targetId: "token" });

  assert.deepEqual(next.map((instance) => instance.id), ["a", "old", "b"]);
  assert.deepEqual(next[1], {
    id: "old",
    condition: "Indebolimento",
    active: true,
    level: 4,
    targetId: "token",
    expiry: { mode: "manual" },
    type: "initiative-card",
    createdAt: next[1].createdAt,
  });
});

test("livello 0 rimuove solo Indebolimento", () => {
  const next = reconcileExhaustionInstances([
    { id: "keep", condition: "Prono", active: true },
    { id: "remove", condition: "Indebolimento", active: true, level: 2 },
  ], 0);
  assert.deepEqual(next, [{ id: "keep", condition: "Prono", active: true }]);
});
