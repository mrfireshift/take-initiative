// Lotto L3 of docs/PIANO_AUTOMAZIONE_INCANTESIMI.md: zones and two repeatable area actions. The expectations below are
// read from the 2014 texts (Xanathar's for the xanathar-* spells), not from the definitions under test.
import test, { mock } from "node:test";
import assert from "node:assert/strict";

const fluentPath = () => new Proxy({}, { get: (node, key) => (key === "build" ? () => ({ id: "mock-path", type: "PATH" }) : () => fluentPathNode) });
const fluentPathNode = fluentPath();
mock.module("@owlbear-rodeo/sdk", {
  exports: {
    default: { onReady() {}, scene: { items: { getItems: async () => [] } } },
    buildPath: fluentPath,
    buildLabel: () => ({ build: () => ({}) }),
    buildImage: () => ({ build: () => ({}) }),
    buildText: () => ({ build: () => ({}) }),
    buildShape: () => ({ build: () => ({}) }),
    Command: { MOVE: 0, LINE: 1, CUBIC: 2, CLOSE: 3 },
  },
});

const { getSpellAreaRules } = await import("../src/spellAreaRules.js");
const { areaMembershipEffects } = await import("../src/spellAreaMembershipCore.js");
const {
  AREA_FIELD_NON_POPOVER_REASONS,
  AREA_SAVE_AUTOMATION_RULES,
} = await import("../src/areaSaveSpellRules.js");
const { getAreaSaveAutomation, getSpellChoiceTiming, getSpellDefinition } = await import("../src/spells-srd.js");
const { buildSpellUnifiedPanelContract } = await import("../src/spellUnifiedPanelCore.js");
const { buildSpellAreaResolutionCommand } = await import("../src/spellAreaResolutionCommandCore.js");
const { buildSpellAreaResolutionExecutionPlan } = await import("../src/spellAreaResolutionExecutor.js");
const {
  buildSpellActiveResolutionFailureOperations,
  getSpellResolutionAction,
  spellActiveResolutionDamageFormula,
  validateSpellActiveResolutionAction,
} = await import("../src/spellActiveResolutionCore.js");
const { getSpellCastResolutionRule } = await import("../src/spellCastResolutionRules.js");

const ruleOf = (spellId) => getSpellAreaRules(spellId)[0];
const labels = (effects) => effects.map((effect) => effect.condition || effect.label);
const contractOf = (spellId, castContext = {}) => buildSpellUnifiedPanelContract({ spellId, phase: "cast", castContext });

test("Wall of Sand: a 9 m wall that blinds and triples the movement inside", () => {
  const rule = ruleOf("xanathar-muro-di-sabbia");
  assert.equal(rule.kind, "zone");
  assert.deepEqual([rule.geometry.shape, rule.geometry.size.value, rule.geometry.width.value], ["line", 9, 3]);
  assert.equal(rule.placement.range.value, 27);
  const [blinded, terrain] = rule.zonePolicy.membershipEffects;
  assert.equal(blinded.condition, "Accecato");
  assert.equal(terrain.mechanics.movement.costMultiplier, 3);
  assert.equal(contractOf("xanathar-muro-di-sabbia").execution.hasHP, false);
});

test("Wall of Force: ten panels in a line or a dome, placed on the map, nothing passes", () => {
  const rule = ruleOf("wall-of-force");
  assert.equal(rule.kind, "zone");
  assert.equal(rule.zonePolicy.placementOptional, false);
  assert.deepEqual(rule.placementChoices.map((choice) => [choice.id, choice.geometry.shape, choice.geometry.size.value]),
    [["panels", "line", 30], ["dome", "circle", 3]]);
  assert.match(rule.placementNote, /Nulla attraversa/u);
  assert.equal(contractOf("wall-of-force").execution.hasHP, false);
});

test("Magic Circle: a ward or, reversed, a prison; one hour more for each slot above 3rd", () => {
  const rule = ruleOf("magic-circle");
  assert.deepEqual(contractOf("magic-circle").presentation.variant.options.map((option) => option.value), ["ward", "prison"]);
  assert.deepEqual(areaMembershipEffects(rule, "ward").map((effect) => effect.label), ["Cerchio magico: protetto"]);
  assert.deepEqual(areaMembershipEffects(rule, "prison").map((effect) => effect.label), ["Cerchio magico: trattenuto"]);
  const spell = getSpellDefinition("magic-circle");
  assert.equal(getSpellChoiceTiming(spell, "", { slotLevel: 3 }).defaultTurns, 600);
  assert.equal(getSpellChoiceTiming(spell, "", { slotLevel: 5 }).defaultTurns, 1800);
});

test("Globe of Invulnerability is an immobile zone around the caster", () => {
  const rule = ruleOf("globe-of-invulnerability");
  assert.equal(rule.kind, "zone");
  assert.equal(rule.zonePolicy.movement, "fixed");
  assert.equal(rule.placement.origin, "caster");
  assert.equal(rule.geometry.size.value, 3);
  assert.deepEqual(rule.zonePolicy.membershipEffects.map((effect) => effect.label), ["Globo: incantesimi ≤5° dall'esterno senza effetto"]);
});

test("Hallow: the ward plus the extra effect chosen, and the Charisma save to ignore it", () => {
  const rule = ruleOf("hallow");
  const options = contractOf("hallow").presentation.variant.options.map((option) => option.value);
  assert.equal(options.length, 10);
  for (const choice of options) {
    assert.equal(areaMembershipEffects(rule, choice)[0].label, "Santificato", choice);
  }
  assert.deepEqual(labels(areaMembershipEffects(rule, "fear")), ["Santificato", "Spaventato"]);
  assert.deepEqual(labels(areaMembershipEffects(rule, "silence")), ["Santificato", "Assordato"]);
  assert.deepEqual(labels(areaMembershipEffects(rule, "everlasting-rest")), ["Santificato"]);
  assert.deepEqual(rule.zonePolicy.triggers.map((trigger) => [trigger.event, trigger.resolution]),
    [["enter", "informational"], ["turn-start", "informational"]]);
});

test("Antipathy/Sympathy: a Wisdom save for the creature that comes near, by variant, and no HP", () => {
  const rule = ruleOf("antipathy-sympathy");
  const triggers = rule.zonePolicy.triggers;
  assert.deepEqual(triggers.map((trigger) => [trigger.event, trigger.resolution, trigger.ability, trigger.requiresRuleChoices]), [
    ["enter", "manual-save", "wis", ["antipathy"]],
    ["enter", "manual-save", "wis", ["sympathy"]],
  ]);
  assert.equal(triggers[0].resolutionData.failureCondition.condition, "Spaventato");
  assert.equal(triggers[1].resolutionData.failureCondition.condition, "Simpatia: attratto dalla destinazione");
  const contract = contractOf("antipathy-sympathy");
  assert.equal(contract.execution.hasHP, false);
  assert.equal(contract.presentation.inputs.outcomes.required, true, "the initial save stays");
});

test("Forbiddance: 5d10 radiant or necrotic, chosen at cast, on entering or starting the turn, no save", () => {
  assert.equal(Object.hasOwn(AREA_FIELD_NON_POPOVER_REASONS, "forbiddance"), false);
  const rule = ruleOf("forbiddance");
  assert.equal(rule.kind, "zone");
  assert.deepEqual([rule.geometry.shape, rule.geometry.size.value], ["square", 60]);
  assert.deepEqual(contractOf("forbiddance").presentation.variant.options.map((option) => option.value), ["radiant", "necrotic"]);
  assert.deepEqual(rule.zonePolicy.triggers.map((trigger) => [trigger.event, trigger.requiresRuleChoices[0], trigger.resolution, trigger.damage.dice, trigger.damage.type, trigger.damage.onSave]), [
    ["enter", "radiant", "manual-effect", "5d10", "radiosi", "none"],
    ["turn-start", "radiant", "manual-effect", "5d10", "radiosi", "none"],
    ["enter", "necrotic", "manual-effect", "5d10", "necrotici", "none"],
    ["turn-start", "necrotic", "manual-effect", "5d10", "necrotici", "none"],
  ]);
});

test("Sunbeam: a new line each turn, Constitution save, 6d8 radiant and blinded on a failure", () => {
  const action = getSpellResolutionAction("sunbeam", "sunbeam-line");
  assert.equal(validateSpellActiveResolutionAction(action).valid, true);
  assert.equal(action.economy, "action");
  assert.equal(action.placementRuleId, "sunbeam:cast");
  assert.deepEqual(action.save, { ability: "con", onSuccess: "half" });
  assert.equal(spellActiveResolutionDamageFormula({ action, slotLevel: 8 }).scaledFormula, "6d8", "no slot scaling");
  const operations = buildSpellActiveResolutionFailureOperations({
    action,
    payload: { casterId: "cleric", casterName: "Cleric", instanceId: "sunbeam-1" },
    targetIds: ["a", "b"],
    outcomes: { a: "failed", b: "passed" },
  });
  assert.equal(operations[0].conditionName, "Accecato");
  assert.deepEqual(operations[0].targetIds, ["a"]);
  assert.deepEqual(operations[0].options.expiry, { mode: "turn-start", actor: "source", remaining: 1, anchor: "next-turn" });
  assert.deepEqual(getSpellCastResolutionRule("sunbeam"), { initialHP: true, deferredHP: "active-action" });
});

test("Illusory Dragon: the breath as a bonus action, Intelligence save, 7d6 halved on a success", () => {
  const action = getSpellResolutionAction("xanathar-drago-illusorio", "illusory-dragon-breath");
  assert.equal(validateSpellActiveResolutionAction(action).valid, true);
  assert.equal(action.economy, "bonus-action");
  assert.deepEqual(action.save, { ability: "int", onSuccess: "half" });
  assert.deepEqual([action.damage.formula, action.damage.onSave], ["7d6", "half"]);
  assert.equal(action.placementRuleId, "xanathar-drago-illusorio:cast");
});

test("Ice Storm and Earth Tremor leave difficult terrain after the save of the cast", () => {
  for (const [spellId, turns, expiry] of [["ice-storm", 1, "turn-end"], ["xanathar-scossa-tellurica", 10, "manual"]]) {
    const rule = ruleOf(spellId);
    assert.equal(rule.kind, "zone", spellId);
    assert.equal(rule.zonePolicy.initialResolution, "manual-save", spellId);
    assert.deepEqual(rule.zonePolicy.initialSave, { ability: "dex" }, spellId);
    assert.equal(rule.zonePolicy.membershipEffects[0].mechanics.movement.costMultiplier, 2, spellId);
    const spell = getSpellDefinition(spellId);
    assert.equal(spell.trackable, true, spellId);
    assert.equal(spell.defaultTurns, turns, spellId);
    assert.equal(spell.expiry.mode, expiry, spellId);
  }
  assert.equal(ruleOf("ice-storm").zonePolicy.placementOptional, false);
  // Earth Tremor's prone stays independent of the zone.
  assert.equal(AREA_SAVE_AUTOMATION_RULES["xanathar-scossa-tellurica"].failed[0].options.parentEffectId, "");
});

test("Pyrotechnics: the fireworks blind within 3 m of the flame, the smoke obscures 6 m", () => {
  const rule = ruleOf("xanathar-pirotecnica");
  assert.equal(rule.kind, "zone");
  assert.deepEqual(rule.placementChoices.map((choice) => [choice.id, choice.geometry.size.value]), [["fireworks", 3], ["smoke", 6]]);
  assert.deepEqual(rule.zonePolicy.initialSave, { ability: "con" });
  assert.deepEqual(labels(areaMembershipEffects(rule, "fireworks")), []);
  assert.deepEqual(labels(areaMembershipEffects(rule, "smoke")), ["Accecato"]);
  assert.equal(getAreaSaveAutomation("xanathar-pirotecnica", "fireworks").failed[0].effectId, "fireworks-blinded");
  assert.equal(getAreaSaveAutomation("xanathar-pirotecnica", "smoke"), null);
  assert.equal(contractOf("xanathar-pirotecnica").execution.hasHP, false);
});

// The real area plan: the panel's command with a confirmed placement, then the execution plan.
const META_KEY = "com.thebigpicture.initiative/meta";
const token = (id, hp) => ({ id, name: id, type: "IMAGE", layer: "CHARACTER", position: { x: 0, y: 0 },
  metadata: { [META_KEY]: { hp, hpMax: 40, inInitiative: true } } });

test("Ice Storm deals the cast's damage and leaves the zone of difficult terrain on the creatures inside", async () => {
  const targetIds = ["a", "b"];
  const contract = contractOf("ice-storm", { slotLevel: 4 });
  const placement = { status: "confirmed", state: "confirmed", confirmed: true, targetLocked: true, ruleId: "ice-storm:cast",
    spellId: "ice-storm", casterId: "druid", targetIds,
    preview: { type: "circle", start: { x: 0, y: 0 }, end: { x: 600, y: 0 }, gridOrigin: { x: 0, y: 0 }, dpi: 150, targetIds, targetLocked: true } };
  const command = buildSpellAreaResolutionCommand({ contract, spellId: "ice-storm", phase: "cast", source: { kind: "cast", sceneEpoch: 3 },
    casterId: "druid", slotLevel: 4, targetIds, candidateTargetIds: targetIds, outcomes: { a: "failed", b: "passed" }, hpAmount: 20,
    placement, targetLocked: true, sceneEpoch: 3, currentSceneEpoch: 3, validateSpatial: false });
  assert.equal(command.valid, true, JSON.stringify(command.errors));
  const items = [token("druid", 40), token("a", 40), token("b", 40)];
  const plan = await buildSpellAreaResolutionExecutionPlan(command, {
    sceneEpoch: 3,
    isCurrent: () => true,
    readItems: async (ids) => items.filter((item) => ids.includes(item.id)),
    readAllItems: async () => items,
    readSceneMetadata: async () => ({}),
    getInitiativeActorId: async () => null,
    createSpellInstanceId: async () => "storm",
    validateSpatial: async () => ({ valid: true, errors: [] }),
  });
  assert.equal(plan.valid, true, JSON.stringify(plan.errors));
  assert.deepEqual(plan.sharedHpPreview.updates.map((update) => [update.tokenId, update.hp]), [["a", 20], ["b", 30]]);
  assert.ok(plan.nextStaticZoneItems.length > 0);
  const terrain = plan.effectOperations.find((operation) => operation.type === "condition:add");
  assert.equal(terrain.conditionName, "Terreno difficile / Tempesta di ghiaccio");
  assert.deepEqual(terrain.targetIds, targetIds);
});
