// Lotto L2 of docs/PIANO_AUTOMAZIONE_INCANTESIMI.md: discrete heals, saves with damage, conditions that end on damage
// and repeated saves. The expectations below are read from the 2014 texts, not from the definitions under test.
import test, { mock } from "node:test";
import assert from "node:assert/strict";

mock.module("@owlbear-rodeo/sdk", {
  exports: {
    default: { onReady() {}, scene: { items: { getItems: async () => [] } } },
    buildPath: () => ({}),
    buildLabel: () => ({}),
    buildImage: () => ({}),
    buildText: () => ({}),
    buildShape: () => ({}),
    Command: { MOVE: 0, LINE: 1, CUBIC: 2, CLOSE: 3 },
  },
});

const {
  getAreaSaveAutomation,
  getAreaSaveSpellOptions,
  getQuickActionSpellOptions,
  getSpellDefinition,
  getSpellEffects,
  isSpellCastRecordOnly,
} = await import("../src/spells-srd.js");
const { AREA_SAVE_AUTOMATION_RULES } = await import("../src/areaSaveSpellRules.js");
const { buildSpellUnifiedPanelContract } = await import("../src/spellUnifiedPanelCore.js");
const { buildSpellAreaResolutionCommand } = await import("../src/spellAreaResolutionCommandCore.js");
const { buildSpellAreaResolutionExecutionPlan } = await import("../src/spellAreaResolutionExecutor.js");
const { getSpellSaveWorkflowRule } = await import("../src/spellSaveWorkflowRules.js");
const { spellSaveDamageFactor, spellSaveDamageFormula } = await import("../src/spellCastResolutionRules.js");
const { resolveSaveSpellResolution } = await import("../src/saveSpellCore.js");
const { saveSpellResolutionOperations } = await import("../src/saveSpellOperationsCore.js");
const { buildEffectsMutationPlan } = await import("../src/effectsMutationCore.js");
const { resolveDamageEndsConditionRemovals } = await import("../src/hpConditionRulesCore.js");
const { scaleReminderResolutionData } = await import("../src/reminderResolutionCore.js");
const { buildSpellApplicationIntent, buildSpellApplicationPlan } = await import("../src/spellApplicationPlanCore.js");

const META_KEY = "com.thebigpicture.initiative/meta";
const token = (id, hp, conditions = []) => ({
  id,
  name: id,
  type: "IMAGE",
  layer: "CHARACTER",
  position: { x: 0, y: 0 },
  metadata: { [META_KEY]: { hp, hpMax: 30, inInitiative: true, ...(conditions.length ? { conditions: { version: 2, instances: conditions } } : {}) } },
});

// The panel's area command and the real execution plan, with the targets the GM chose.
function areaCommand(spellId, { slotLevel, targetIds = ["target"], outcomes = {}, amount }) {
  const contract = buildSpellUnifiedPanelContract({ spellId, phase: "cast", castContext: { slotLevel } });
  return buildSpellAreaResolutionCommand({
    contract,
    spellId,
    phase: "cast",
    source: { kind: "cast", sceneEpoch: 3 },
    casterId: "caster",
    slotLevel,
    targetIds,
    candidateTargetIds: targetIds,
    outcomes,
    hpAmount: amount,
    targetLocked: true,
    sceneEpoch: 3,
    currentSceneEpoch: 3,
    validateSpatial: false,
  });
}

async function areaPlan(command, items) {
  return buildSpellAreaResolutionExecutionPlan(command, {
    sceneEpoch: 3,
    isCurrent: () => true,
    readItems: async (ids) => items.filter((item) => ids.includes(item.id)),
    readAllItems: async () => items,
    readSceneMetadata: async () => ({}),
    getInitiativeActorId: async () => null,
    createSpellInstanceId: async () => "instance",
  });
}

const hpAfter = (plan, id) => plan.sharedHpPreview.updates.find((update) => update.tokenId === id)?.hp;

// spellId: [maximum creatures, base slot]
const HEALS = Object.freeze({
  "cure-wounds": [1, 1],
  "healing-word": [1, 1],
  "prayer-of-healing": [6, 2],
  "mass-healing-word": [6, 3],
});

test("the four discrete heals resolve in the area command, on the creatures chosen", () => {
  const areaIds = new Set(getAreaSaveSpellOptions().map((option) => option.id));
  const quick = new Map(getQuickActionSpellOptions().map((option) => [option.id, option]));
  for (const [spellId, [maximum, slot]] of Object.entries(HEALS)) {
    const contract = buildSpellUnifiedPanelContract({ spellId, phase: "cast", castContext: { slotLevel: slot } });
    assert.equal(contract.execution.lane, "area-transaction", spellId);
    assert.equal(contract.execution.recordOnly, false, spellId);
    assert.equal(contract.presentation.targeting.mode, "discrete", spellId);
    assert.equal(contract.presentation.targeting.limit.maximum, maximum, spellId);
    assert.equal(contract.presentation.inputs.healing.required, true, spellId);
    assert.equal(contract.presentation.inputs.outcomes.required, false, `${spellId}: no save`);
    assert.equal(isSpellCastRecordOnly(spellId), false, spellId);
    assert.equal(areaIds.has(spellId), true, `${spellId}: in the panel's catalog`);
    assert.equal(quick.get(spellId).recordOnly, false, spellId);
    assert.equal(quick.get(spellId).automated, true, spellId);
  }
});

test("Cure Wounds heals through the area command, never above maximum HP", async () => {
  const command = areaCommand("cure-wounds", { slotLevel: 1, amount: 7 });
  assert.equal(command.valid, true);
  assert.equal(command.hp.mode, "heal");
  assert.equal(command.targeting.mode, "discrete");
  assert.equal(hpAfter(await areaPlan(command, [token("target", 10)]), "target"), 17);
  assert.equal(hpAfter(await areaPlan(command, [token("target", 28)]), "target"), 30);

  const prayer = areaCommand("prayer-of-healing", { slotLevel: 2, targetIds: ["a", "b"], amount: 9 });
  const plan = await areaPlan(prayer, [token("a", 5), token("b", 12)]);
  assert.deepEqual([hpAfter(plan, "a"), hpAfter(plan, "b")], [14, 21]);
  assert.equal(plan.hpMode, "heal");
});

// spellId: [ability, meters, base slot, dice at base, dice two slots above, damage on a successful save]
const SAVES = Object.freeze({
  "xanathar-catapulta": ["dex", 18, 1, "3d8", "5d8", "zero"],
  "hellish-rebuke": ["dex", 18, 1, "2d10", "4d10", null],
  "phb2014-sussurri-dissonanti": ["wis", 18, 1, "3d6", "5d6", null],
  "blight": ["con", 9, 4, "8d8", "10d8", null],
});

test("the four saves with damage take one creature, its save and the dice of the slot", () => {
  for (const [spellId, [ability, meters, slot, base, upcast, passed]] of Object.entries(SAVES)) {
    const contract = buildSpellUnifiedPanelContract({ spellId, phase: "cast", castContext: { slotLevel: slot } });
    assert.equal(contract.execution.lane, "area-transaction", spellId);
    assert.equal(contract.presentation.targeting.mode, "discrete", spellId);
    assert.equal(contract.presentation.targeting.limit.maximum, 1, spellId);
    assert.equal(contract.presentation.inputs.outcomes.required, true, spellId);
    assert.equal(contract.presentation.inputs.damage.required, true, spellId);
    assert.equal(isSpellCastRecordOnly(spellId), false, spellId);
    const rule = getSpellSaveWorkflowRule(spellId);
    assert.equal(rule.ability, ability, spellId);
    assert.equal(rule.targeting.spatial.maxMeters, meters, spellId);
    assert.equal(spellSaveDamageFormula(spellId, "failed", slot), base, spellId);
    assert.equal(spellSaveDamageFormula(spellId, "failed", slot + 2), upcast, spellId);
    assert.equal(spellSaveDamageFactor(spellId, "passed"), passed, spellId);
  }
});

test("the save decides the damage: half for Blight, none for Catapult, all on a failure", async () => {
  const blight = await areaPlan(areaCommand("blight", { slotLevel: 4, outcomes: { target: "passed" }, amount: 36 }), [token("target", 30)]);
  assert.equal(hpAfter(blight, "target"), 12);
  const catapult = await areaPlan(areaCommand("xanathar-catapulta", { slotLevel: 1, outcomes: { target: "passed" }, amount: 13 }), [token("target", 30)]);
  assert.equal(hpAfter(catapult, "target"), undefined, "no damage on a successful save");
  const rebuke = await areaPlan(areaCommand("hellish-rebuke", { slotLevel: 1, outcomes: { target: "failed" }, amount: 11 }), [token("target", 30)]);
  assert.equal(hpAfter(rebuke, "target"), 19);
});

// The ids the runtime gives each operation before planning it (effectsMutations.js prepareOperation).
function prepared(operations) {
  return operations.map((operation, index) => ({
    ...operation,
    operationId: `operation-${index}`,
    createdAt: 100 + index,
    ...(operation.type === "condition:add"
      ? { instanceIds: Object.fromEntries((operation.targetIds || []).map((id) => [id, `${id}-condition-${index}`])) }
      : {}),
    ...(operation.type === "spell:upsert"
      ? { entryIds: Object.fromEntries((operation.targetIds || []).map((id) => [id, `${id}-spell-${index}`])) }
      : {}),
  }));
}

function failedOn(spellId, targetIds, { turns = 10, spellExpiry = null } = {}) {
  const resolution = resolveSaveSpellResolution({
    spell: getSpellDefinition(spellId),
    casterId: "caster",
    targetIds,
    outcomes: Object.fromEntries(targetIds.map((id) => [id, "failed"])),
    automation: getAreaSaveAutomation(spellId),
    slotLevel: getSpellDefinition(spellId).level,
  });
  const operations = saveSpellResolutionOperations({ resolution, instanceId: `${spellId}-instance`, casterName: "Caster", turns, spellExpiry });
  const items = [{ id: "caster", spells: [], conditions: [], concentrations: {} }, ...targetIds.map((id) => ({ id, spells: [], conditions: [] }))];
  return buildEffectsMutationPlan(items, prepared(operations));
}

const stateOf = (plan, id) => plan.states.find((entry) => entry.id === id);
const removeDamaged = (plan, id) => buildEffectsMutationPlan(plan.states, [{
  type: "condition:remove-instances",
  removals: resolveDamageEndsConditionRemovals(stateOf(plan, id).conditions).map((instanceId) => ({ itemId: id, instanceId })),
}]);

test("Sleep: the sleeper that takes damage wakes, the others sleep on", () => {
  const plan = failedOn("sleep", ["a", "b"]);
  for (const id of ["a", "b"]) {
    const [asleep] = stateOf(plan, id).conditions;
    assert.equal(asleep.condition, "Privo di sensi", id);
    assert.equal(asleep.mechanics.endsOnDamage, true, id);
    assert.equal(asleep.manualRemoval, true, `${id}: shaken awake by hand`);
  }
  const woken = removeDamaged(plan, "a");
  // Awake, still prone from the fall (the automatic consequence of Unconscious).
  assert.deepEqual(stateOf(woken, "a").conditions.map((entry) => entry.condition), ["Prono"]);
  assert.equal(stateOf(woken, "a").spells.length, 0);
  assert.equal(stateOf(woken, "b").conditions[0].condition, "Privo di sensi");
  assert.equal(stateOf(woken, "b").spells.length, 1);
});

test("Hypnotic Pattern ends for the creature that takes damage; the concentration holds the others", () => {
  const plan = failedOn("hypnotic-pattern", ["a", "b"], { spellExpiry: { mode: "concentration" } });
  const conditions = stateOf(plan, "a").conditions;
  assert.deepEqual(conditions.map((entry) => entry.condition).sort(), ["Affascinato", "Incapacitato"]);
  assert.equal(conditions.every((entry) => entry.mechanics?.endsOnDamage === true), true);
  assert.equal(conditions.every((entry) => entry.parentRemoval === "target"), true);
  const woken = removeDamaged(plan, "a");
  assert.deepEqual(stateOf(woken, "a").conditions, []);
  assert.equal(stateOf(woken, "b").conditions.length, 2);
  assert.deepEqual(stateOf(woken, "caster").concentrations["trama ipnotica"].targets, ["b"]);
});

test("damage from a spell wakes a sleeping target in the same command", async () => {
  const asleep = { id: "sleep-a", condition: "Privo di sensi", active: true, mechanics: { endsOnDamage: true } };
  const blinded = { id: "other", condition: "Accecato", active: true };
  const plan = await areaPlan(areaCommand("hellish-rebuke", { slotLevel: 1, outcomes: { target: "failed" }, amount: 5 }),
    [token("target", 30, [asleep, blinded])]);
  assert.deepEqual(plan.damageEndsRemovals, [{ itemId: "target", instanceId: "sleep-a" }]);
});

test("Color Spray blinds until the end of the caster's next turn, as its area condition", () => {
  const expiry = { mode: "turn-end", actor: "source", remaining: 1, anchor: "next-turn" };
  assert.deepEqual(getSpellDefinition("color-spray").expiry, expiry);
  assert.deepEqual(AREA_SAVE_AUTOMATION_RULES["color-spray"].failed[0].expiry, expiry);
});

function castPlan(spellId) {
  const spell = getSpellDefinition(spellId);
  const intent = buildSpellApplicationIntent({
    spell,
    enteredName: spell.displayName,
    turns: spell.defaultTurns,
    casterId: "caster",
    targetIds: ["target"],
    castContext: {},
    requestedConcentration: spell.concentration === true,
  });
  return buildSpellApplicationPlan({ intent, instanceId: "instance", appliedAt: { round: 1 }, casterName: "Caster" });
}

test("Awaken charms the beast for 30 days; harm from the caster's side ends it by hand", () => {
  const spell = getSpellDefinition("awaken");
  assert.equal(spell.trackable, true);
  assert.equal(spell.defaultTurns, 30 * 24 * 60 * 10);
  assert.equal(isSpellCastRecordOnly("awaken"), false);
  const [effect] = getSpellEffects("awaken");
  assert.equal(effect.label, "Affascinato dal caster");
  assert.equal(effect.manualRemoval, true);
  assert.equal(effect.endsParentOnRemoval, true);
  assert.equal(effect.mechanics?.endsOnDamage, undefined, "not on any damage");
  const condition = castPlan("awaken").operations.find((operation) => operation.type === "condition:add");
  assert.equal(condition.conditionName, "Affascinato dal caster");
  assert.deepEqual(condition.options.expiry, { mode: "rounds", remaining: 432000 });
});

test("Maze banishes its target until a DC 20 Intelligence check ends the spell", () => {
  const [effect] = getSpellEffects("maze");
  assert.equal(effect.label, "Nel labirinto");
  assert.deepEqual(effect.summaryParts.map((part) => part.label), ["Esiliato", "Azione: prova Int CD 20"]);
  assert.equal(effect.endsParentOnRemoval, true);
  const plan = castPlan("maze");
  const condition = plan.operations.find((operation) => operation.type === "condition:add");
  assert.deepEqual(condition.options.expiry, { mode: "concentration" });
  assert.equal(plan.operations.some((operation) => operation.type === "concentration:register"), true);
});

test("Phantasmal Killer's damage at the end of the turn grows with the slot", () => {
  const { damage } = getSpellDefinition("phantasmal-killer").automation.conditionOptions.Spaventato.saveReminder;
  assert.equal(scaleReminderResolutionData({ damage, slotLevel: 4 }).damage.dice, "4d10");
  assert.equal(scaleReminderResolutionData({ damage, slotLevel: 6 }).damage.dice, "6d10");
});
