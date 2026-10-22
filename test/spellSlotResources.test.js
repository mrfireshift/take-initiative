// Spell slots as class-feature resources: the existing state operations spend, clamp and reset them.
import test from "node:test";
import assert from "node:assert/strict";
import {
  CLASS_FEATURE_RESOURCE_POOLS,
  getClassFeatureResourcePool,
} from "../src/classFeatureCatalog.js";
import {
  planClassFeatureResourceAdjustment,
  planClassFeatureResourceReset,
  resolveClassFeatureResourceMaximum,
} from "../src/classFeatureCore.js";
import { planClassFeatureStateMutations } from "../src/classFeatureStateMutationCore.js";
import { SPELL_SLOT_RESOURCE_POOLS } from "../src/spellSlotCore.js";

const META = "com.thebigpicture.initiative/meta";
const wizardWarlock = [{ classId: "mago", level: 5 }, { classId: "warlock", level: 3 }];

test("slot pools resolve by id and keep out of the audited pool list", () => {
  assert.equal(getClassFeatureResourcePool("spell-slot-3")?.name, "Slot di 3° livello");
  assert.equal(getClassFeatureResourcePool("spell-slot-pact")?.name, "Slot del Patto");
  assert.equal(CLASS_FEATURE_RESOURCE_POOLS.some((pool) => pool.id.startsWith("spell-slot-")), false);
});

test("the maximum of a slot pool comes from the build; other pools are unchanged", () => {
  assert.deepEqual(resolveClassFeatureResourceMaximum(getClassFeatureResourcePool("spell-slot-3"), wizardWarlock),
    { maximum: 2, unlimited: false });
  assert.deepEqual(resolveClassFeatureResourceMaximum(getClassFeatureResourcePool("spell-slot-pact"), wizardWarlock),
    { maximum: 2, unlimited: false });
  assert.deepEqual(resolveClassFeatureResourceMaximum(getClassFeatureResourcePool("spell-slot-1"), [{ classId: "barbaro", level: 9 }]),
    { maximum: 0, unlimited: false });
  assert.deepEqual(
    resolveClassFeatureResourceMaximum(getClassFeatureResourcePool("stregone-punti-stregoneria"), [{ classId: "stregone", level: 5 }]),
    { maximum: 5, unlimited: false },
  );
});

test("a slot is spent and clamped like any resource, and the reset brings it back", () => {
  const pool = getClassFeatureResourcePool("spell-slot-3");
  const spent = planClassFeatureResourceAdjustment({}, pool, wizardWarlock, { delta: -1 });
  assert.deepEqual(spent.state.resources["spell-slot-3"], { current: 1, maximum: 2, unlimited: false });
  const empty = planClassFeatureResourceAdjustment(spent.state, pool, wizardWarlock, { delta: -5 });
  assert.equal(empty.state.resources["spell-slot-3"].current, 0);
  const poolsById = new Map(SPELL_SLOT_RESOURCE_POOLS.map((entry) => [entry.id, entry]));
  const reset = planClassFeatureResourceReset(empty.state, poolsById, wizardWarlock, ["spell-slot-3"]);
  assert.equal(reset.state.resources["spell-slot-3"].current, 2);
});

test("spending a slot is an ordinary class-feature state operation on the caster", () => {
  const item = { id: "nyx", metadata: { [META]: { initiativeCard: { characterBuild: wizardWarlock } } } };
  const plan = planClassFeatureStateMutations([item], [{
    type: "class-feature:adjust-resource",
    operationId: "spend",
    sourceId: "nyx",
    pool: getClassFeatureResourcePool("spell-slot-pact"),
    characterBuild: wizardWarlock,
    adjustment: { delta: -1 },
  }], { metadataKey: META });
  assert.equal(plan.status, undefined);
  assert.equal(plan.results[0].state.resources["spell-slot-pact"].current, 1);
  assert.equal(plan.patches.length, 1);
});

test("a created slot may stand above the maximum until it is spent or the reset", () => {
  const pool = getClassFeatureResourcePool("spell-slot-3");
  const created = planClassFeatureResourceAdjustment({}, pool, wizardWarlock, { delta: 1, allowAboveMaximum: true });
  assert.equal(created.state.resources["spell-slot-3"].current, 3);
  const plain = planClassFeatureResourceAdjustment({}, pool, wizardWarlock, { delta: 1 });
  assert.equal(plain.state.resources["spell-slot-3"].current, 2, "without the option the maximum holds");
  const spent = planClassFeatureResourceAdjustment(created.state, pool, wizardWarlock, { delta: -1 });
  assert.equal(spent.state.resources["spell-slot-3"].current, 2);
  const poolsById = new Map(SPELL_SLOT_RESOURCE_POOLS.map((entry) => [entry.id, entry]));
  const rested = planClassFeatureResourceReset(created.state, poolsById, wizardWarlock, ["spell-slot-3"]);
  assert.equal(rested.state.resources["spell-slot-3"].current, 2);
  const pips = planClassFeatureResourceAdjustment(created.state, pool, wizardWarlock, { current: 9 });
  assert.equal(pips.state.resources["spell-slot-3"].current, 2, "an explicit value stays within the maximum");
});

test("other resources never go above their maximum, even when asked", () => {
  const pool = getClassFeatureResourcePool("stregone-punti-stregoneria");
  const sorcerer = [{ classId: "stregone", level: 5 }];
  const result = planClassFeatureResourceAdjustment({ resources: { [pool.id]: { current: 5, maximum: 5 } } }, pool, sorcerer, { delta: 3, allowAboveMaximum: true });
  assert.equal(result.state.resources[pool.id].current, 5);
  const read = planClassFeatureResourceAdjustment({ resources: { [pool.id]: { current: 9, maximum: 5 } } }, pool, sorcerer, { delta: 0 });
  assert.equal(read.state.resources[pool.id].current, 5);
});
