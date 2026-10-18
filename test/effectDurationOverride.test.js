// Manual duration override from a pill: one value for the whole effect.
import test from "node:test";
import assert from "node:assert/strict";
import { ID } from "../src/constants.js";
import { buildEffectsMutationPlan } from "../src/effectsMutationCore.js";
import { planClassFeatureStateMutations } from "../src/classFeatureStateMutationCore.js";
import { describeEffectDurationTarget, planEffectDurationOverride } from "../src/effectDurationOverrideCore.js";

const META = `${ID}/meta`;
const SPELLS = `${ID}/spells`;
const sceneItem = (id, meta = {}) => ({ id, name: id, metadata: { [META]: meta } });
const stateToken = (id, overrides = {}) => ({ id, name: id, spells: [], concentrations: {}, conditions: [], ...overrides });
const stateOf = (plan, id) => plan.states.find((entry) => entry.id === id);

const hasteOnFighter = {
  id: "haste-entry", name: "Velocità", turns: 7, conc: true, casterId: "wizard", instanceId: "haste-1",
};
const hastePill = { id: "haste-pill", condition: "Velocità", active: true, type: "spell", parentEffectId: "haste-1", effectKind: "buff", expiry: { mode: "concentration" } };

test("a spell pill targets the whole spell on every token", () => {
  const items = [
    sceneItem("wizard"),
    sceneItem("fighter", { [SPELLS]: [hasteOnFighter], conditions: { instances: [hastePill] } }),
  ];
  const target = describeEffectDurationTarget(items, { itemId: "fighter", conditionInstanceId: "haste-pill" });
  assert.equal(target.kind, "spell");
  assert.equal(target.remaining, 7);
  assert.equal(target.concentration, true);
  assert.deepEqual(target.targetIds, ["fighter"]);
  const plan = planEffectDurationOverride(target, { mode: "rounds", remaining: 3 });
  const result = buildEffectsMutationPlan([stateToken("wizard"), stateToken("fighter", { spells: [hasteOnFighter], conditions: [hastePill] })], plan.operations);
  const fighter = stateOf(result, "fighter");
  assert.equal(fighter.spells[0].turns, 3);
  assert.deepEqual(fighter.conditions[0].expiry, { mode: "concentration" }, "the pill keeps following its spell");
});

test("a consumable buff changes only its own instance; manual removes the timer", () => {
  const buff = { id: "potion", condition: "Pozione di Resistenza", active: true, effectId: "buff:pozione-di-resistenza", effectKind: "buff", expiry: { mode: "rounds", remaining: 600 } };
  const other = { id: "prone", condition: "Prono", active: true, expiry: { mode: "rounds", remaining: 2 } };
  const items = [sceneItem("pc", { conditions: { instances: [buff, other] } })];
  const target = describeEffectDurationTarget(items, { itemId: "pc", conditionInstanceId: "potion" });
  assert.equal(target.kind, "condition");
  for (const [override, expected] of [[{ mode: "rounds", remaining: 12 }, { mode: "rounds", remaining: 12 }], [{ mode: "manual" }, { mode: "manual" }]]) {
    const plan = planEffectDurationOverride(target, override);
    const pc = stateOf(buildEffectsMutationPlan([stateToken("pc", { conditions: [buff, other] })], plan.operations), "pc");
    assert.deepEqual(pc.conditions[0].expiry, expected);
    assert.deepEqual(pc.conditions[1].expiry, { mode: "rounds", remaining: 2 });
  }
  assert.equal(planEffectDurationOverride(target, { mode: "rounds", remaining: 0 }).ok, false);
});

test("a turn-anchored effect keeps its anchor and only changes how many turns remain", () => {
  const instance = { id: "mark", condition: "Marchio", active: true, expiry: { mode: "turn-end", actor: "source", actorId: "boss", remaining: 1 } };
  const target = describeEffectDurationTarget([sceneItem("pc", { conditions: { instances: [instance] } })], { itemId: "pc", conditionInstanceId: "mark" });
  const plan = planEffectDurationOverride(target, { mode: "rounds", remaining: 3 });
  const pc = stateOf(buildEffectsMutationPlan([stateToken("pc", { conditions: [instance] })], plan.operations), "pc");
  assert.deepEqual(pc.conditions[0].expiry, { mode: "turn-end", actor: "source", actorId: "boss", remaining: 3 });
});

test("a class-feature pill updates the activation in the source state and every pill", () => {
  const pill = (targetId) => ({ id: `class-feature:ward-1:${targetId}`, condition: "Interdizione Cromatica", active: true, type: "class-feature",
    sourceId: "kriv", parentEffectId: "ward-1", targetId, expiry: { mode: "rounds", remaining: 4 } });
  const classFeatureState = { version: 1, resources: {}, instances: [{ instanceId: "ward-1", featureId: "specie-dragonide-cromatico-interdizione-cromatica-bianco",
    sourceId: "kriv", targetIds: ["kriv"], suppressedTargetIds: [], startedRound: 3, startedTurnKey: "", expiresRound: 12, createdAt: 1 }] };
  const items = [sceneItem("kriv", { classFeatureState, conditions: { instances: [pill("kriv")] } })];
  const target = describeEffectDurationTarget(items, { itemId: "kriv", conditionInstanceId: "class-feature:ward-1:kriv" });
  assert.equal(target.kind, "class-feature");
  const plan = planEffectDurationOverride(target, { mode: "rounds", remaining: 10 }, { currentRound: 9 });
  const [stateOperation, durationOperation] = plan.operations;
  const statePlan = planClassFeatureStateMutations(items, [stateOperation], { metadataKey: META });
  assert.equal(statePlan.patches[0].fields.classFeatureState.value.instances[0].expiresRound, 18);
  const kriv = stateOf(buildEffectsMutationPlan([stateToken("kriv", { conditions: [pill("kriv")] })], [durationOperation]), "kriv");
  assert.deepEqual(kriv.conditions[0].expiry, { mode: "rounds", remaining: 10 });
  const manual = planEffectDurationOverride(target, { mode: "manual" }, { currentRound: 9 });
  assert.equal(planClassFeatureStateMutations(items, [manual.operations[0]], { metadataKey: META }).patches[0].fields.classFeatureState.value.instances[0].expiresRound, null);
});

test("a potion spell (rounds expiry) gets its new duration on both turns and expiry", () => {
  const spell = { id: "e", name: "Velocità", turns: 10, conc: false, casterId: "pc", instanceId: "potion-haste", expiry: { mode: "rounds", remaining: 10 } };
  const target = describeEffectDurationTarget([sceneItem("pc", { [SPELLS]: [spell] })], { itemId: "pc", spellInstanceId: "potion-haste" });
  const plan = planEffectDurationOverride(target, { mode: "rounds", remaining: 4 });
  const pc = stateOf(buildEffectsMutationPlan([stateToken("pc", { spells: [spell] })], plan.operations), "pc");
  assert.equal(pc.spells[0].turns, 4);
  assert.deepEqual(pc.spells[0].expiry, { mode: "rounds", remaining: 4 });
});
