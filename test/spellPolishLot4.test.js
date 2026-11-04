// Lot 4 of docs/PIANO_POLISH_INCANTESIMI.md: what reading the next 40 spells next to the engine has found.
import test from "node:test";
import assert from "node:assert/strict";

const { runSpellSweep } = await import("../test-support/spellSweepHarness.js");
const { getAreaSaveAutomation, getSpellDefinition } = await import("../src/spells-srd.js");
const { buildSpellUnifiedPanelContract } = await import("../src/spellUnifiedPanelCore.js");
const { buildSpellAreaResolutionCommand } = await import("../src/spellAreaResolutionCommandCore.js");
const { buildSpellAreaResolutionExecutionPlan } = await import("../src/spellAreaResolutionExecutor.js");
const { getSpellAreaRuleById } = await import("../src/spellAreaRules.js");
const { areaMembershipPlan } = await import("../src/spellAreaMembershipCore.js");
const { planSpellZoneTriggers } = await import("../src/spellZoneTriggerCore.js");
const { buildZoneTriggerReminderResolution, scaleReminderResolutionData } = await import("../src/reminderResolutionCore.js");

const META = "com.thebigpicture.initiative/meta";
const records = await runSpellSweep({ spellIds: ["phb2014-percezione-delle-bestie"] });
const contractOf = (spellId, slotLevel) => buildSpellUnifiedPanelContract({ spellId, phase: "cast", castContext: { slotLevel } });

// The panel's command with a confirmed placement and the real execution plan, for a failed save.
async function areaPlanOf(spellId, { slotLevel, choiceValue = "", shape = "circle" }) {
  const contract = buildSpellUnifiedPanelContract({ spellId, phase: "cast", castContext: { slotLevel }, choiceValue });
  const command = buildSpellAreaResolutionCommand({
    contract,
    spellId,
    phase: "cast",
    source: { kind: "cast", sceneEpoch: 3 },
    casterId: "caster",
    slotLevel,
    ...(choiceValue ? { choiceValue } : {}),
    targetIds: ["target"],
    candidateTargetIds: ["target"],
    outcomes: { target: "failed" },
    placement: {
      status: "confirmed",
      spellId,
      ruleId: `${spellId}:cast`,
      casterId: "caster",
      sceneEpoch: 3,
      ...(choiceValue ? { ruleChoice: choiceValue } : {}),
      preview: { type: shape, start: { x: 0, y: 0 }, end: { x: 600, y: 0 }, gridOrigin: { x: 0, y: 0 }, dpi: 150, targetIds: ["target"], targetLocked: true },
    },
    targetLocked: true,
    sceneEpoch: 3,
    currentSceneEpoch: 3,
    validateSpatial: false,
  });
  const items = ["caster", "target"].map((id) => ({
    id,
    name: id,
    type: "IMAGE",
    layer: "CHARACTER",
    position: { x: 0, y: 0 },
    metadata: { [META]: { hp: 30, hpMax: 30, inInitiative: true } },
  }));
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

const zoneMetadata = (rule) => ({
  ruleId: rule.id,
  spellId: rule.spellId,
  instanceId: "instance",
  casterId: "caster",
  casterName: "Dars",
  spellName: rule.spellId,
  zoneItemId: "zone",
});

// The trigger the engine raises on a creature, for an initiative where it is already on the zone or walks onto it.
function activationOf(rule, triggerId, { current = ["target"], before = [], turn = 0 } = {}) {
  const state = (index, round) => ({ order: ["target", "other"], current: index, round });
  const metadata = zoneMetadata(rule);
  const initialized = planSpellZoneTriggers({ rule, zoneMetadata: metadata, currentTargetIds: before, initiativeState: state(1, 1), now: 100 });
  const planned = planSpellZoneTriggers({ rule, zoneMetadata: metadata, runtime: initialized.runtime, currentTargetIds: current, initiativeState: state(turn, 2), now: 200 });
  return planned.newActivations.find((activation) => activation.triggerId === triggerId);
}

test("Snare asks the Dexterity save of whoever walks onto it, and the failure is the spell's own rule", () => {
  const rule = getSpellAreaRuleById("xanathar-trabocchetto:cast");
  assert.deepEqual(rule.zonePolicy.triggers.map((trigger) => `${trigger.event}:${trigger.resolution}`), ["enter:manual-save"]);
  const [trigger] = rule.zonePolicy.triggers;
  assert.equal(trigger.requiresCrossing, true, "a token dragged across the circle has moved onto it");
  assert.equal(trigger.persistsAfterExit, true, "and may have left it by the time the GM answers");
  assert.deepEqual(trigger.skipLinkedConditions, ["Trattenuto"], "whoever hangs there is not asked again");

  const activation = activationOf(rule, trigger.id);
  assert.equal(activation.ability, "dex");
  const resolution = buildZoneTriggerReminderResolution({
    activation: { ...activation, spellId: rule.spellId },
    targetId: "target",
    sourceId: "caster",
    sourceName: "Dars",
    dc: 14,
  });
  assert.deepEqual(resolution.outcomes.passed.actions, [], "the creature that passes is not restrained");
  const [applied] = resolution.outcomes.failed.actions;
  assert.equal(applied.name, "Trattenuto");
  assert.equal(applied.options.parentEffectId, "instance");
  assert.equal(applied.options.effectId, "snare-trapped");
  assert.equal(applied.options.saveReminder.ability, "dex");
  assert.equal(applied.options.saveReminder.timing, "turn-end");
  assert.match(applied.options.effectDetail, /Arcano/u);
});

test("Hunger of Hadar asks the cold at the start of the turn with its field, as the Cloud of Daggers does", () => {
  const rule = getSpellAreaRuleById("phb2014-fame-di-hadar:cast");
  const activation = activationOf(rule, "hunger-of-hadar-damage-on-turn-start", { before: ["target"] });
  assert.equal(activation.resolution, "manual-effect");
  const resolution = buildZoneTriggerReminderResolution({
    activation: { ...activation, spellId: rule.spellId },
    targetId: "target",
    sourceId: "caster",
    sourceName: "Dars",
  });
  assert.equal(resolution.mode, "manual-damage");
  assert.equal(resolution.damage.dice, "2d6");
  assert.equal(resolution.damage.type, "freddo");
});

test("Warding Wind deafens the caster too, and is difficult terrain only for the others", () => {
  const rule = getSpellAreaRuleById("xanathar-vento-di-interdizione:cast");
  assert.equal(rule.targeting.includeCaster, true);
  const plan = areaMembershipPlan({
    instanceId: "instance",
    sourceId: "caster",
    rule,
    desiredTargetIds: ["caster", "target"],
    items: [],
    metaKey: META,
    sourceName: "Dars",
  });
  const added = plan.operations.filter((operation) => operation.type === "condition:add");
  assert.deepEqual(added.find((operation) => operation.conditionName === "Assordato").targetIds, ["caster", "target"]);
  const terrain = added.find((operation) => operation.options.mechanics?.movement?.category === "difficult-terrain");
  assert.deepEqual(terrain.targetIds, ["target"]);
});

test("Warding Wind is cast with nobody selected: the wind takes whoever is in it", () => {
  const { targeting, inputs } = contractOf("xanathar-vento-di-interdizione", 2).presentation;
  assert.equal(targeting.confirmTargets, false);
  assert.equal(inputs.targets.required, false);
});

test("Caustic Brew reminds its acid at the start of the turn, and the slot reaches the reminder", async () => {
  const spellId = "tasha-miscela-caustica-di-tasha";
  const [rule] = getAreaSaveAutomation(spellId).failed;
  const { saveReminder } = rule;
  assert.equal(saveReminder.timing, "turn-start");
  assert.equal(saveReminder.mode, "manual-damage");
  assert.equal(scaleReminderResolutionData({ damage: saveReminder.damage, slotLevel: 1 }).damage.dice, "2d4");
  assert.equal(scaleReminderResolutionData({ damage: saveReminder.damage, slotLevel: 2 }).damage.dice, "4d4");
  assert.equal(scaleReminderResolutionData({ damage: saveReminder.damage, slotLevel: 4 }).damage.dice, "8d4");
  assert.doesNotMatch(rule.condition, /2d4/u, "the pill stays true at every slot: the dice are in the reminder");

  const { effectOperations } = await areaPlanOf(spellId, { slotLevel: 3, shape: "line" });
  const pill = effectOperations.find((operation) => operation.castContext);
  assert.equal(pill.castContext.slotLevel, 3);
});

test("Beast Sense neither blinds nor deafens at the cast: only while using the beast's senses, by hand", () => {
  assert.deepEqual(getSpellDefinition("phb2014-percezione-delle-bestie").automation.conditions, []);
  const cast = records.find((record) => record.id === "phb2014-percezione-delle-bestie");
  assert.deepEqual(cast.conditions.map((condition) => condition.name), ["Sensi della bestia"]);
  const [effect] = getSpellDefinition("phb2014-percezione-delle-bestie").effects;
  assert.match(effect.detail, /Accecato e Assordato/u);
  assert.match(effect.detail, /a mano/u);
});

test("Catapult measures the creature the object strikes: the 18 m of the object and its 27 m of flight", () => {
  const { spatialRules } = contractOf("xanathar-catapulta", 1).presentation.targeting;
  assert.equal(spatialRules.mode, "caster-range");
  assert.equal(spatialRules.maxMeters, 45);
});

test("Gaseous Form says on the card what it changes at the table", () => {
  const [effect] = getSpellDefinition("gaseous-form").effects;
  assert.deepEqual(effect.summaryParts.map((part) => part.id), [
    "gaseous-form-fly-only",
    "gaseous-form-nonmagical-resistance",
    "gaseous-form-save-advantage",
    "gaseous-form-no-attacks-spells",
  ]);
  assert.match(effect.detail, /0 PF/u);
});

test("Pyrotechnics: the smoke asks no save and lasts 1 minute", async () => {
  const spellId = "xanathar-pirotecnica";
  const contract = buildSpellUnifiedPanelContract({ spellId, phase: "cast", castContext: { slotLevel: 2 }, choiceValue: "smoke" });
  assert.equal(contract.presentation.inputs.outcomes.required, false);
  assert.equal(contract.presentation.outcomes.save, undefined);
  const { effectOperations } = await areaPlanOf(spellId, { slotLevel: 2, choiceValue: "smoke" });
  const blinded = effectOperations.filter((operation) => operation.type === "condition:add" && operation.conditionName === "Accecato");
  assert.deepEqual(blinded.map((operation) => operation.options.effectId), ["pyrotechnics-smoke"], "only the zone's own: no failed save");
  const pill = effectOperations.find((operation) => operation.type === "spell:upsert");
  assert.equal(pill.turns, 10);
  assert.equal(pill.expiry, undefined, "the rounds of the pill count");
});

test("Pyrotechnics: the fireworks' pill lasts as long as their blindness, until the end of the caster's next turn", async () => {
  const spellId = "xanathar-pirotecnica";
  const contract = buildSpellUnifiedPanelContract({ spellId, phase: "cast", castContext: { slotLevel: 2 }, choiceValue: "fireworks" });
  assert.equal(contract.presentation.inputs.outcomes.required, true);
  assert.equal(contract.presentation.outcomes.save.ability, "con");
  const { effectOperations } = await areaPlanOf(spellId, { slotLevel: 2, choiceValue: "fireworks" });
  const blinded = effectOperations.find((operation) => operation.type === "condition:add" && operation.conditionName === "Accecato");
  assert.equal(blinded.options.expiry.mode, "turn-end");
  const owner = effectOperations.find((operation) => operation.type === "spell:upsert");
  assert.equal(owner.expiry.mode, "turn-end");
  assert.equal(owner.expiry.actor, "source");
  assert.equal(owner.expiry.anchor, "next-turn");
});

test("Cause Fear: who shakes it off keeps no pill of the spell, as for Hold Person", () => {
  assert.equal(getAreaSaveAutomation("xanathar-incuti-paura").failed[0].parentRemoval, "target");
});

test("Phantasmal Killer no longer names 4d10 at a slot that rolls more: the reminder scales them", () => {
  const { saveReminder, summaryParts } = getSpellDefinition("phantasmal-killer").automation.conditionOptions.Spaventato;
  assert.doesNotMatch(saveReminder.label, /4d10/u);
  assert.doesNotMatch(summaryParts[0].label, /4d10/u);
  assert.equal(scaleReminderResolutionData({ damage: saveReminder.damage, slotLevel: 5 }).damage.dice, "5d10");
});
