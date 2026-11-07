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
const { getAreaSaveAutomation, getSpellChoiceTiming, getSpellDefinition, getSpellSummaryParts, isSpellCastRecordOnly } = await import("../src/spells-srd.js");
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

// CAP-TERRAIN, lotto G1 of docs/PIANO_AUTOMAZIONE_INCANTESIMI.md, on the 2014 texts.
test("Transmute Rock: three variants; only the mud is a zone, with a Strength save on entering and at the end of the turn", () => {
  const rule = ruleOf("xanathar-trasmutare-roccia");
  assert.deepEqual([rule.geometry.shape, rule.geometry.size.value, rule.placement.range.value], ["square", 12, 36]);
  assert.equal(rule.zonePolicy.placementOptional, false);
  assert.deepEqual(getSpellDefinition("xanathar-trasmutare-roccia").expiry, { mode: "manual" }, "until dispelled");
  const variant = (choiceValue) => buildSpellUnifiedPanelContract({ spellId: "xanathar-trasmutare-roccia", phase: "cast", choiceValue, castContext: { slotLevel: 5 } });
  assert.deepEqual(
    ["rock-to-mud", "mud-to-rock", "falling-mud"].map((choice) => {
      const contract = variant(choice);
      return [choice, contract.presentation.outcomes.save.ability, contract.execution.castHasHP, contract.execution.hasZones];
    }),
    [["rock-to-mud", "str", false, true], ["mud-to-rock", "dex", false, false], ["falling-mud", "dex", true, false]],
  );
  assert.deepEqual(
    ["rock-to-mud", "mud-to-rock", "falling-mud"].map((choice) => (getAreaSaveAutomation(getSpellDefinition("xanathar-trasmutare-roccia"), choice).failed || []).map((rule) => rule.condition)),
    [["Trattenuto"], ["Trattenuto"], []],
  );
  const [terrain] = areaMembershipEffects(rule, "rock-to-mud");
  assert.equal(terrain.mechanics.movement.costMultiplier, 4);
  assert.deepEqual(rule.zonePolicy.triggers.map((trigger) => [trigger.event, trigger.resolution, trigger.ability, trigger.frequency, trigger.requiresRuleChoices]), [
    ["enter", "manual-save", "str", "once-per-turn", ["rock-to-mud"]],
    ["turn-end", "manual-save", "str", "once-per-turn", ["rock-to-mud"]],
  ]);
  for (const trigger of rule.zonePolicy.triggers) {
    assert.equal(trigger.resolutionData.failureCondition.condition, "Trattenuto");
    assert.deepEqual(trigger.skipConditions, ["Trattenuto"], "whoever is stuck does not save again");
  }
});

test("Transmute Rock: the mud asks for a Strength save on entering and at the end of the turn", async () => {
  const { planStaticSpellZoneReminder } = await import("../src/spellStaticZoneReminderCore.js");
  const { SPELL_STATIC_ZONE_META_KEY } = await import("../src/spellStaticZoneCore.js");
  const META = "com.thebigpicture.initiative/meta";
  const rule = ruleOf("xanathar-trasmutare-roccia");
  const token = (id, meta = {}) => ({ id, name: id, position: { x: 0, y: 0 }, metadata: { [META]: meta } });
  const zone = (ruleChoice) => ({
    id: "mud",
    name: "Trasmutare Roccia",
    position: { x: 0, y: 0 },
    metadata: {
      [SPELL_STATIC_ZONE_META_KEY]: {
        instanceId: "mud-1",
        ruleId: rule.id,
        spellId: rule.spellId,
        casterId: "caster",
        role: "root",
        ruleChoice,
        targetIds: [],
      },
    },
  });
  const initiativeState = (current) => ({ order: ["caster", "target"], current, round: 1 });
  const plan = (zoneItem, target, current = 0, now = 100) => planStaticSpellZoneReminder({
    zoneItem,
    rule,
    desiredTargetIds: ["target"],
    initiativeState: initiativeState(current),
    itemsById: new Map([
      ["mud", zoneItem],
      ["caster", token("caster", { initiativeCard: { spellSaveDC: 15 } })],
      ["target", target],
    ]),
    now,
  });

  const entered = plan(zone("rock-to-mud"), token("target"));
  assert.deepEqual(entered.newActivations.map((activation) => activation.event), ["enter"]);
  assert.equal(entered.newActivations[0].resolutionData.ability, "str");
  assert.equal(entered.newActivations[0].resolutionData.failureCondition.condition, "Trattenuto");

  const zoneAfterEntry = zone("rock-to-mud");
  zoneAfterEntry.metadata[SPELL_STATIC_ZONE_META_KEY] = {
    ...zoneAfterEntry.metadata[SPELL_STATIC_ZONE_META_KEY],
    targetIds: ["target"],
    triggerRuntime: entered.runtime,
  };
  const turnEnded = planStaticSpellZoneReminder({
    zoneItem: zoneAfterEntry,
    rule,
    desiredTargetIds: ["target"],
    initiativeState: { order: ["caster", "target"], current: 0, round: 2 },
    itemsById: new Map([
      ["mud", zoneAfterEntry],
      ["caster", token("caster", { initiativeCard: { spellSaveDC: 15 } })],
      ["target", token("target")],
    ]),
    now: 200,
  });
  assert.ok(turnEnded.newActivations.some((activation) => activation.event === "turn-end"), JSON.stringify(turnEnded.newActivations.map((activation) => activation.event)));
});

test("Symbol: the cast traces the glyph with no zone, Activate has the sphere, the save of its variant and damage only for Death", async () => {
  const { getSpellOverviewActions } = await import("../src/spellActiveActionCore.js");
  const { spellPillHasActions, spellActionRunsDirectly } = await import("../src/spellPillActionsCore.js");
  const spell = getSpellDefinition("symbol");
  const contract = (phase, choiceValue) => buildSpellUnifiedPanelContract({ spellId: "symbol", phase, choiceValue, castContext: { slotLevel: 7 } });
  const traced = contract("prepare", "death");
  assert.deepEqual([traced.execution.hasZones, traced.execution.castHasHP, traced.presentation.placement.policy], [false, false, "unavailable"]);
  assert.equal(traced.execution.lane, "spell-lifecycle");
  assert.deepEqual(
    ["death", "discord", "despair", "fear", "insanity", "pain", "sleep", "stunning"].map((choice) => {
      const activated = contract("resolve", choice);
      return [activated.presentation.outcomes.save.ability, activated.execution.castHasHP, activated.execution.hasZones];
    }),
    [["con", true, true], ["con", false, true], ["cha", false, true], ["wis", false, true], ["int", false, true], ["con", false, true], ["wis", false, true], ["wis", false, true]],
  );
  for (const choice of ["discord", "despair", "insanity"]) {
    assert.equal(getAreaSaveAutomation(spell, choice).failed[0].effectKind, undefined, "the card would hide it");
  }
  const rule = ruleOf("symbol");
  assert.deepEqual([rule.geometry.shape, rule.geometry.size.value, rule.zonePolicy.placementOptional], ["circle", 18, false]);
  assert.ok(rule.placement.range.value > 100, "the caster may be anywhere when the glyph goes off");
  assert.equal(spell.defaultTurns, 100, "10 minutes");
  assert.equal(spell.expiry, null);

  const castContext = { phase: "prepare", choice: "fear" };
  const [activate] = getSpellOverviewActions({ spell, castContext, casterId: "caster", targetIds: ["caster"] });
  assert.deepEqual([activate.id, activate.buttonLabel, activate.requiresTargets, activate.completesInPanel], ["resolve-prepared", "Attiva", false, true]);
  assert.equal(spellActionRunsDirectly(activate), false, "it is completed in the panel");
  assert.equal(spellPillHasActions({ spellId: "symbol", castContext }), true, "the glyph's pill has its bolt");
  assert.equal(spellPillHasActions({ spellId: "symbol", castContext: { phase: "resolve", choice: "fear" } }), false, "the sphere's does not");
  assert.deepEqual(getSpellOverviewActions({ spell, castContext: { choice: "fear", phase: "resolve" }, casterId: "caster", targetIds: [] }), []);
});

test("Symbol: each variant asks its own save on entering and at the end of the turn, and spares whoever already has its effect", async () => {
  const { planStaticSpellZoneReminder } = await import("../src/spellStaticZoneReminderCore.js");
  const { SPELL_STATIC_ZONE_META_KEY } = await import("../src/spellStaticZoneCore.js");
  const META = "com.thebigpicture.initiative/meta";
  const rule = ruleOf("symbol");
  assert.equal(rule.zonePolicy.triggers.length, 16);
  const token = (id, meta = {}) => ({ id, name: id, position: { x: 0, y: 0 }, metadata: { [META]: meta } });
  const enter = (ruleChoice) => {
    const zoneItem = {
      id: "sphere",
      name: "Simbolo",
      position: { x: 0, y: 0 },
      metadata: {
        [SPELL_STATIC_ZONE_META_KEY]: { instanceId: "glyph", ruleId: rule.id, spellId: "symbol", casterId: "caster", role: "root", ruleChoice, targetIds: [] },
      },
    };
    return planStaticSpellZoneReminder({
      zoneItem,
      rule,
      desiredTargetIds: ["target"],
      initiativeState: { order: ["caster", "target"], current: 0, round: 1 },
      itemsById: new Map([
        ["sphere", zoneItem],
        ["caster", token("caster", { initiativeCard: { spellSaveDC: 17 } })],
        ["target", token("target")],
      ]),
      now: 100,
    });
  };
  const [fear] = enter("fear").newActivations;
  assert.deepEqual([fear.event, fear.triggerId, fear.resolutionData.ability, fear.resolutionData.failureAutomation], ["enter", "symbol-fear-save-on-entry", "wis", "spell-save"]);
  assert.deepEqual(enter("fear").newActivations.length, 1, "only its own variant");
  const [insanity] = enter("insanity").newActivations;
  assert.equal(insanity.resolutionData.ability, "int");
  const death = rule.zonePolicy.triggers.find((trigger) => trigger.id === "symbol-death-save-on-entry");
  assert.deepEqual(death.damage, { dice: "10d10", type: "necrotici", onSave: "half" });
  assert.deepEqual(rule.zonePolicy.triggers.find((trigger) => trigger.id === "symbol-fear-save-on-turn-end").skipConditions, ["Spaventato"]);
  assert.equal(death.skipConditions, undefined, "Death has no condition to spare a new save");
});

test("Plant Growth: 30 m of radius within 45 m, four times the movement, optional for the 8 hours' use, no expiry", () => {
  const rule = ruleOf("plant-growth");
  assert.equal(rule.kind, "zone");
  assert.deepEqual([rule.geometry.shape, rule.geometry.size.value, rule.placement.range.value], ["circle", 30, 45]);
  assert.equal(rule.zonePolicy.placementOptional, true);
  const [terrain] = rule.zonePolicy.membershipEffects;
  assert.equal(terrain.mechanics.movement.costMultiplier, 4);
  assert.match(rule.placementNote, /uso da 8 ore/u);
  assert.equal(contractOf("plant-growth").execution.hasHP, false);
  assert.deepEqual(getSpellDefinition("plant-growth").expiry, { mode: "manual" });
  assert.equal(isSpellCastRecordOnly("plant-growth"), false);
});

test("Wall of Water: a line of 9 m or a ring of 6 m in diameter within 18 m, difficult terrain, a note for what crosses it", () => {
  const rule = ruleOf("xanathar-muro-dacqua");
  assert.equal(rule.kind, "zone");
  assert.equal(rule.placement.range.value, 18);
  assert.equal(rule.zonePolicy.placementOptional, false);
  assert.deepEqual(rule.placementChoices.map((choice) => [choice.id, choice.geometry.shape, choice.geometry.size.value]),
    [["line", "line", 9], ["ring", "circle", 3]]);
  assert.deepEqual([rule.placementChoices[1].geometry.ring, rule.placementChoices[1].geometry.innerSize.value], [true, 2.7]);
  assert.equal(rule.placementChoices[0].geometry.width.value, 0.3);
  const [terrain] = rule.zonePolicy.membershipEffects;
  assert.equal(terrain.mechanics.movement.costMultiplier, 2);
  assert.match(rule.placementNote, /svantaggio/u);
  assert.equal(contractOf("xanathar-muro-dacqua").execution.hasHP, false);
  assert.deepEqual(getSpellSummaryParts(getSpellDefinition("xanathar-muro-dacqua")).map((part) => part.label), ["A distanza: svant.", "Fuoco ½"]);
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
    // Two boxes, 12 bludgeoning and 8 cold (test/spellDamageParts.test.js): 20 on a failed save, 6 + 4 on a passed one.
    casterId: "druid", slotLevel: 4, targetIds, candidateTargetIds: targetIds, outcomes: { a: "failed", b: "passed" }, hpAmount: 12,
    secondDamageAmount: 8, placement, targetLocked: true, sceneEpoch: 3, currentSceneEpoch: 3, validateSpatial: false });
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
