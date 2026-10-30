import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { buildEffectsMutationPlan, roundAnchoredDelta } from "../src/effectsMutationCore.js";

// Lot L20 (replacing decision D5): going back in rounds gave every effect back as many rounds as the jump, with no
// limit: an effect cast at round 4 for 10 rounds had 13 after a reset to round 1, 9 after its Undo. Each effect now
// counts from the round it was applied, so back, forward, a reset and its Undo agree.
const token = (id, overrides = {}) => ({ id, name: id, spells: [], concentrations: {}, conditions: [], ...overrides });
const state = (plan, id) => plan.states.find((entry) => entry.id === id);
const tick = (states, previousRound, nextRound) => buildEffectsMutationPlan(states, [{
  type: "effects:tick-round", targetIds: ["orc"], delta: previousRound - nextRound, previousRound, nextRound,
}]).states;

test("L20: i round tolti o restituiti a un effetto contano dal round in cui è stato applicato", () => {
  const change = (previousRound, nextRound) => ({ delta: previousRound - nextRound, previousRound, nextRound });
  assert.equal(roundAnchoredDelta(change(3, 4), 1), -1, "a step forward, as before");
  assert.equal(roundAnchoredDelta(change(3, 4), 3), -1, "applied in the round that ends, as before");
  assert.equal(roundAnchoredDelta(change(5, 1), 4), 1, "a reset gives back only the round it had spent");
  assert.equal(roundAnchoredDelta(change(5, 1), 5), 0, "applied in this round: nothing to give back");
  assert.equal(roundAnchoredDelta(change(1, 5), 4), -1, "the reset's Undo takes back what it gave");
  assert.equal(roundAnchoredDelta(change(3, 2), 1), 1, "◀ over the start of a round");
  assert.equal(roundAnchoredDelta(change(1, 2), 4), 0, "after a reset, the rounds before its own spend nothing");
  assert.equal(roundAnchoredDelta({ delta: -2 }, 4), -2, "no rounds of the change (a manual adjustment): its delta");
  assert.equal(roundAnchoredDelta(change(5, 1), undefined), 4, "no round of its own (older data): the delta");
});

test("L20: un incantesimo lanciato al round 4 resta coerente fra avanti, reset, Annulla del reset e ◀", () => {
  const cast = (round) => token("orc", { spells: [{ id: "s", name: "Benedizione", instanceId: "bless", casterId: "cleric", turns: 10,
    appliedAt: { round, actorId: "cleric", turnKey: `${round}:0:cleric` } }] });
  const turns = (states) => state({ states }, "orc").spells[0]?.turns;
  let states = tick([cast(4)], 4, 5);
  assert.equal(turns(states), 9, "round 5");
  states = tick(states, 5, 1);
  assert.equal(turns(states), 10, "reset to round 1: its whole duration, not 13");
  states = tick(states, 1, 5);
  assert.equal(turns(states), 9, "the reset undone: as before it");
  states = tick(states, 5, 4);
  assert.equal(turns(states), 10, "◀ back into round 4");
  states = tick(states, 4, 5);
  assert.equal(turns(states), 9, "▶ again");
  const fresh = tick([cast(5)], 5, 1);
  assert.equal(turns(fresh), 10, "cast in this round: a reset leaves it as it is");
});

test("L20: una condizione a round segue la stessa regola; una scaduta non ricompare", () => {
  const condition = (remaining, round) => token("orc", { conditions: [{ id: "c", condition: "Spaventato", active: true,
    appliedAt: { round }, expiry: { mode: "rounds", remaining } }] });
  const remaining = (states) => state({ states }, "orc").conditions[0]?.expiry?.remaining;
  let states = tick([condition(3, 2)], 4, 1);
  assert.equal(remaining(states), 5, "spent two rounds (2→4): two back");
  states = tick(states, 1, 4);
  assert.equal(remaining(states), 3);
  const ended = tick([condition(1, 3)], 3, 4);
  assert.deepEqual(state({ states: ended }, "orc").conditions, [], "ran out going forward");
  assert.deepEqual(state({ states: tick(ended, 4, 1) }, "orc").conditions, [], "going back does not bring it back");
});

test("L20: il tracker passa al core i round del cambio", () => {
  const tracker = readFileSync(new URL("../src/initiativeList.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(tracker, /delta: descriptor\.roundDelta,\n(\s+\/\/.*\n)+\s+\.\.\.\(Number\.isFinite\(Number\(descriptor\.previousRound\)\) && Number\.isFinite\(Number\(descriptor\.nextRound\)\)\n\s+\? \{ previousRound: Number\(descriptor\.previousRound\), nextRound: Number\(descriptor\.nextRound\) \}/);
});
