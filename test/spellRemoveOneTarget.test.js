import assert from "node:assert/strict";
import test, { mock } from "node:test";

mock.module("@owlbear-rodeo/sdk", {
  exports: {
    default: { onReady() {}, scene: { items: { getItems: async () => [] } } },
    buildPath: () => ({}), buildLabel: () => ({}), buildImage: () => ({}), buildText: () => ({}), buildShape: () => ({}),
    Command: { MOVE: 0, LINE: 1, CUBIC: 2, CLOSE: 3 },
  },
});

const { getSpellDefinition } = await import("../src/spells-srd.js");
const { buildSpellApplicationIntent, buildSpellApplicationPlan } = await import("../src/spellApplicationPlanCore.js");
const { buildEffectsMutationPlan } = await import("../src/effectsMutationCore.js");

// Lot L4 of the bugfix pass (SP-5): the × on one target's pill of a spell without concentration removed the spell's
// effects from its other targets too, while they kept the spell.
let sequence = 0;
const prepared = (operations) => operations.map((operation) => {
  sequence += 1;
  return {
    ...operation,
    operationId: `op-${sequence}`,
    entryIds: Object.fromEntries((operation.targetIds || []).map((id) => [id, `entry-${id}-${sequence}`])),
    instanceIds: Object.fromEntries((operation.targetIds || []).map((id) => [id, `condition-${id}-${sequence}`])),
  };
});
const blank = (id) => ({ id, name: id, spells: [], concentrations: {}, conditions: [] });
const stateOf = (states, id) => states.find((state) => state.id === id);

function cast(spellId, casterId, targetIds) {
  const spell = getSpellDefinition(spellId);
  const intent = buildSpellApplicationIntent({
    spell, enteredName: spell.displayName, turns: spell.defaultTurns, casterId, targetIds,
    castContext: { slotLevel: spell.level || 1 },
  });
  const plan = buildSpellApplicationPlan({
    intent, instanceId: `${spellId}-1`, casterName: casterId, appliedAt: { round: 1, turnKey: "1:x" },
  });
  return buildEffectsMutationPlan([casterId, ...targetIds].map(blank), prepared(plan.operations)).states;
}

test("L4: il × di Suggestione di massa su un bersaglio lascia gli effetti agli altri", () => {
  let states = cast("mass-suggestion", "bard", ["a", "b", "c"]);
  for (const id of ["a", "b", "c"]) assert.equal(stateOf(states, id).conditions.length, 1, `${id} follows the suggestion`);
  states = buildEffectsMutationPlan(states, prepared([
    { type: "spell:remove-instance", targetIds: ["a"], instanceId: "mass-suggestion-1" },
  ])).states;
  assert.deepEqual(stateOf(states, "a").spells, []);
  assert.deepEqual(stateOf(states, "a").conditions, []);
  for (const id of ["b", "c"]) {
    assert.deepEqual(stateOf(states, id).spells.map((spell) => spell.instanceId), ["mass-suggestion-1"]);
    assert.equal(stateOf(states, id).conditions.length, 1, `${id} still follows the suggestion`);
  }
});

test("L4: rimosso l'ultimo bersaglio, gli effetti dell'incantesimo finiscono ovunque", () => {
  const states = [
    { ...blank("caster"), spells: [{ id: "zone-entry", name: "Zona", instanceId: "zone-1", casterId: "caster", turns: 10 }] },
    { ...blank("target"), conditions: [{ id: "child-1", condition: "Trattenuto", active: true, parentEffectId: "zone-1" }] },
  ];
  const next = buildEffectsMutationPlan(states, prepared([
    { type: "spell:remove-instance", targetIds: ["caster"], instanceId: "zone-1" },
  ])).states;
  assert.deepEqual(stateOf(next, "caster").spells, []);
  assert.deepEqual(stateOf(next, "target").conditions, [], "the child on another token ends with its spell");
});
