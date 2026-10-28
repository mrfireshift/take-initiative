import test from "node:test";
import assert from "node:assert/strict";
import {
  advanceInitiativeState,
  createSerialProcessor,
  initiativeStateDigest,
  isCurrentRenderRevision,
} from "../src/initiativeRenderCore.js";

test("il digest dello stato iniziativa ignora l'ordine delle chiavi", () => {
  const first = {
    order: ["a", "b"],
    current: 1,
    round: 3,
    collapsed: { enemies: true },
    ui: { autoFocus: false },
  };
  const reordered = {
    ui: { autoFocus: false },
    collapsed: { enemies: true },
    round: 3,
    current: 1,
    order: ["a", "b"],
  };

  assert.equal(initiativeStateDigest(first), initiativeStateDigest(reordered));
});

test("il digest cambia per ogni parte significativa dello stato", () => {
  const base = {
    order: ["a", "b"],
    current: 0,
    round: 1,
    collapsed: { enemies: false },
    ui: { autoFocus: true },
  };

  assert.notEqual(initiativeStateDigest(base), initiativeStateDigest({ ...base, current: 1 }));
  assert.notEqual(initiativeStateDigest(base), initiativeStateDigest({ ...base, round: 2 }));
  assert.notEqual(initiativeStateDigest(base), initiativeStateDigest({ ...base, order: ["b", "a"] }));
  assert.notEqual(
    initiativeStateDigest(base),
    initiativeStateDigest({ ...base, collapsed: { enemies: true } }),
  );
  assert.notEqual(
    initiativeStateDigest(base),
    initiativeStateDigest({ ...base, ui: { autoFocus: false } }),
  );
});

test("il digest normalizza campi undefined come JSON metadata", () => {
  assert.equal(
    initiativeStateDigest({ order: [], optional: undefined }),
    initiativeStateDigest({ order: [] }),
  );
});

test("avanza e retrocede aggiornando il round solo al wrap", () => {
  const state = { order: ["a", "b", "c"], current: 2, round: 4 };
  assert.deepEqual(advanceInitiativeState(state, 1), {
    order: ["a", "b", "c"], current: 0, round: 5,
  });
  assert.deepEqual(advanceInitiativeState({ ...state, current: 0 }, -1), {
    order: ["a", "b", "c"], current: 2, round: 3,
  });
});

test("il processore seriale non sovrappone task asincroni", async () => {
  const processor = createSerialProcessor();
  let active = 0;
  let maximum = 0;
  const completed = [];
  const tasks = [8, 1, 4].map((delay, index) => processor.enqueue(async () => {
    active += 1;
    maximum = Math.max(maximum, active);
    await new Promise((resolve) => setTimeout(resolve, delay));
    completed.push(index);
    active -= 1;
  }));
  await Promise.all(tasks);
  assert.equal(maximum, 1);
  assert.deepEqual(completed, [0, 1, 2]);
  assert.equal(processor.pending, 0);
});

test("la revisione render accetta solamente la richiesta corrente", () => {
  assert.equal(isCurrentRenderRevision(7, 7), true);
  assert.equal(isCurrentRenderRevision(6, 7), false);
});

// Lot L6 of the bugfix pass (TR-03): ◀ at the first turn of round 1 went to the last creature, and the next ▶ counted
// a round that never passed.
test("L6: ◀ al primo turno del round 1 resta dov'è", () => {
  const state = { order: ["a", "b", "c"], current: 0, round: 1 };
  assert.equal(advanceInitiativeState(state, -1), state);
  assert.deepEqual(advanceInitiativeState({ ...state, round: 2 }, -1), { order: ["a", "b", "c"], current: 2, round: 1 });
  assert.deepEqual(advanceInitiativeState({ ...state, current: 1 }, -1), { order: ["a", "b", "c"], current: 0, round: 1 });
});
