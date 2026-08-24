import test from "node:test";
import assert from "node:assert/strict";

import { ID } from "../src/constants.js";
import { getAreaSaveAutomation, getSpellDefinition } from "../src/spells-srd.js";
import { getSpellSaveWorkflowRule } from "../src/spellSaveWorkflowRules.js";
import {
  getSpellCastResolutionRule,
  spellSaveDamageFormula,
} from "../src/spellCastResolutionRules.js";
import {
  buildSpellUnifiedPanelContract,
  createSpellPanelSession,
} from "../src/spellUnifiedPanelCore.js";
import { buildUnifiedPanelViewModel } from "../src/spellUnifiedPanelViewCore.js";
import { buildSpellAreaResolutionCommand } from "../src/spellAreaResolutionCommandCore.js";
import { resolveSaveSpellResolution } from "../src/saveSpellCore.js";
import { saveSpellResolutionOperations } from "../src/saveSpellOperationsCore.js";
import {
  getSpellResolutionAction,
  resolveSpellActiveResolutionDamage,
} from "../src/spellActiveResolutionCore.js";
import {
  ENERVATION_TURN_PROMPT_ACTION_ID,
  spellTurnPromptRequests,
} from "../src/callLightningTurnPromptCore.js";

const SPELL_ID = "xanathar-debilitazione";
const META_KEY = `${ID}/meta`;
const SPELLS_KEY = `${ID}/spells`;

function spell() {
  return getSpellDefinition(SPELL_ID);
}

function contract(slotLevel = 5) {
  return buildSpellUnifiedPanelContract({
    spellId: SPELL_ID,
    phase: "cast",
    castContext: { slotLevel },
  });
}

function command(outcome, amount = 20, slotLevel = 5) {
  return buildSpellAreaResolutionCommand({
    contract: contract(slotLevel),
    spellId: SPELL_ID,
    phase: "cast",
    source: { kind: "cast", sceneEpoch: 4 },
    casterId: "caster",
    slotLevel,
    targetIds: ["target"],
    candidateTargetIds: ["target"],
    outcomes: { target: outcome },
    hp: { mode: "damage", amount },
    casterDistancesMeters: { target: 12 },
    sceneEpoch: 4,
    currentSceneEpoch: 4,
    validateSpatial: false,
  });
}

function item(id, spells = [], conditions = []) {
  return {
    id,
    name: id,
    layer: "CHARACTER",
    metadata: {
      [META_KEY]: {
        [SPELLS_KEY]: spells,
        conditions,
      },
    },
  };
}

function activeSpell(instanceId, casterId, castTurn, slotLevel = 5) {
  return {
    name: "Debilitazione",
    spellId: SPELL_ID,
    instanceId,
    casterId,
    appliedAt: { round: 1, actorId: casterId, turnKey: castTurn },
    conc: true,
    castContext: { slotLevel },
  };
}

test("SP-B06B.1 — cast espone TS Destrezza a due esiti e danno pieno manuale", () => {
  const rule = getSpellSaveWorkflowRule(SPELL_ID);
  const castRule = getSpellCastResolutionRule(SPELL_ID);
  const model = contract(5);

  assert.ok(rule);
  assert.equal(rule.ability, "dex");
  assert.equal(rule.targeting.baseMaximum, 1);
  assert.equal(rule.targeting.additionalPerSlotAbove, 0);
  assert.equal(rule.targeting.baseSlot, 5);
  assert.equal(rule.targeting.spatial.mode, "caster-range");
  assert.equal(rule.targeting.spatial.maxMeters, 18);
  assert.deepEqual(rule.outcomeOptions, ["passed", "failed"]);

  assert.equal(castRule.initialHP, true);
  assert.equal(castRule.successfulSaveDamage, "full");
  assert.equal(model.presentation.inputs.outcomes.visible, true);
  assert.deepEqual(model.presentation.outcomes.options, [
    { value: "passed", label: "Superato" },
    { value: "failed", label: "Fallito" },
  ]);
  assert.equal(model.presentation.inputs.damage.visible, true);
  assert.equal(model.presentation.inputs.damage.required, true);
  assert.equal(spellSaveDamageFormula(SPELL_ID, "passed", 5), "2d8");
  assert.equal(spellSaveDamageFormula(SPELL_ID, "failed", 5), "4d8");
  assert.equal(spellSaveDamageFormula(SPELL_ID, "passed", 7), "4d8");
  assert.equal(spellSaveDamageFormula(SPELL_ID, "failed", 7), "6d8");

  const session = createSpellPanelSession({
    contract: model,
    casterId: "caster",
    targetIds: ["target"],
    outcomes: { target: "failed" },
    slotLevel: 7,
  });
  const view = buildUnifiedPanelViewModel({
    contract: model,
    session,
    casterOptions: [{ value: "caster", label: "Caster" }],
    targetCandidates: [{ key: "target", label: "Target", subtitle: "Creatura" }],
  });
  assert.equal(view.effects.fields[0].label, "Danno · 6d8");
  assert.equal(view.effects.fields[0].hint, "");
});

test("SP-B06B.2 — Superato applica il danno inserito senza metà e non persiste la spell", () => {
  const result = command("passed", 13, 6);
  assert.equal(result.valid, true, result.errors?.join(", "));
  assert.equal(result.hp.outcomeFactors.target, "full");
  assert.deepEqual(result.resolution.spellTargetIds, []);
  assert.equal(result.resolution.conditionApplications.length, 0);

  const currentSpell = spell();
  const resolution = resolveSaveSpellResolution({
    spell: currentSpell,
    casterId: "caster",
    targetIds: ["target"],
    outcomes: { target: "passed" },
    automation: getAreaSaveAutomation(currentSpell),
    saveWorkflowRule: getSpellSaveWorkflowRule(SPELL_ID),
    slotLevel: 6,
    casterDistancesMeters: { target: 12 },
    validateSpatial: false,
  });
  const operations = saveSpellResolutionOperations({
    resolution,
    instanceId: "enervation-pass",
    casterName: "Caster",
    turns: 10,
    spellExpiry: { mode: "concentration" },
    castContext: { slotLevel: 6 },
  });
  assert.equal(operations.some((operation) => operation.type === "spell:upsert"), false);
  assert.equal(operations.some((operation) => operation.type === "concentration:register"), false);
});

test("SP-B06B.3 — Fallito persiste solo sul bersaglio e applica il link per l'azione ripetibile", () => {
  const currentSpell = spell();
  const rule = getSpellSaveWorkflowRule(SPELL_ID);
  const resolution = resolveSaveSpellResolution({
    spell: currentSpell,
    casterId: "caster",
    targetIds: ["target"],
    outcomes: { target: "failed" },
    automation: getAreaSaveAutomation(currentSpell),
    saveWorkflowRule: rule,
    slotLevel: 5,
    casterDistancesMeters: { target: 12 },
    validateSpatial: false,
  });

  assert.equal(resolution.valid, true, resolution.errors?.join(", "));
  assert.deepEqual(resolution.spellTargetIds, ["target"]);
  assert.equal(resolution.conditionApplications.length, 1);
  assert.equal(resolution.conditionApplications[0].conditionName, "Debilitazione: danni e cura");
  assert.equal(resolution.conditionApplications[0].options.effectId, "enervation-link");
  assert.equal(resolution.conditionApplications[0].options.manualRemoval, true);
  assert.equal(resolution.conditionApplications[0].options.endsParentOnRemoval, true);
  assert.equal(resolution.conditionApplications[0].options.parentRemoval, "spell");
});

test("SP-B06B.4 — azione successiva usa il bersaglio collegato, niente nuovo TS e scala con l'upcast", () => {
  const action = getSpellResolutionAction(SPELL_ID, ENERVATION_TURN_PROMPT_ACTION_ID);
  assert.ok(action);
  assert.equal(action.id, "enervation-repeat");
  assert.equal(action.turnStartPrompt, true);
  assert.equal(action.availableAfterCast, true);
  assert.equal(action.resolutionKind, "single-save");
  assert.equal(action.manualSaveAtTable, true);
  assert.equal(action.assumedOutcome, "failed");
  assert.equal(action.requiredTargetEffectId, "enervation-link");
  assert.equal(action.rangeOrigin, "caster");
  assert.deepEqual(action.range, { value: 18, unit: "m" });
  assert.equal(action.damage.formula, "4d8");
  assert.equal(action.damage.baseSlot, 5);
  assert.equal(action.damage.additionalPerSlotAbove, 1);

  const base = resolveSpellActiveResolutionDamage({
    action,
    slotLevel: 5,
    outcome: "failed",
    roll: 21,
  });
  const upcast = resolveSpellActiveResolutionDamage({
    action,
    slotLevel: 7,
    outcome: "failed",
    roll: 29,
  });
  assert.equal(base.scaledFormula, "4d8");
  assert.equal(upcast.scaledFormula, "6d8");
  assert.equal(upcast.amount, 29);
});

test("SP-B06B.5 — il prompt compare dal turno successivo solo se esiste l'istanza fallita", () => {
  const castTurn = "1:0:caster";
  const spellEntry = activeSpell("enervation-1", "caster", castTurn, 6);
  const linkedCondition = {
    id: "enervation-link-1",
    condition: "Debilitazione: danni e cura",
    effectId: "enervation-link",
    parentEffectId: "enervation-1",
    sourceId: "caster",
  };
  const items = [
    item("caster"),
    item("target", [spellEntry], [linkedCondition]),
  ];

  assert.deepEqual(spellTurnPromptRequests({
    items,
    actorId: "caster",
    sceneEpoch: 9,
    turnKey: castTurn,
  }), []);

  const requests = spellTurnPromptRequests({
    items,
    actorId: "caster",
    sceneEpoch: 9,
    turnKey: "2:0:caster",
  });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].kind, "action");
  assert.equal(requests[0].payload.spellId, SPELL_ID);
  assert.equal(requests[0].payload.actionId, "enervation-repeat");
  assert.equal(requests[0].payload.slotLevel, 6);
  assert.equal(requests[0].payload.instanceId, "enervation-1");
  assert.equal(requests[0].payload.linkedTargetId, "target");
});

test("SP-B06B.6 — il repeat conserva il bersaglio persistente nel payload e dichiara la cura automatica", async () => {
  const { buildSpellActiveResolutionPayload } = await import("../src/spellActiveResolutionCore.js");
  const spellDef = spell();
  const action = getSpellResolutionAction(SPELL_ID, ENERVATION_TURN_PROMPT_ACTION_ID);
  const group = {
    instanceId: "enervation-1",
    casterId: "caster",
    casterName: "Caster",
    castContext: { slotLevel: 5 },
    effectInstances: [
      { itemId: "target", instanceId: "cond-1", effectId: "enervation-link", active: true },
    ],
  };
  const payload = buildSpellActiveResolutionPayload({
    spell: spellDef,
    action,
    group,
    sceneEpoch: 4,
    turnKey: "2:0:caster",
  });

  assert.equal(payload.linkedTargetId, "target");
  assert.equal(action.casterHealingFromAppliedDamage, 0.5);
  assert.equal(getSpellCastResolutionRule(SPELL_ID).casterHealingFromAppliedDamage, 0.5);
});

test("SP-B06B.7 — la cura automatica usa metà del danno finale inserito e arrotonda per difetto", async () => {
  const { spellCasterHealingAmount, spellCasterHealingChange } = await import("../src/spellDamageHealingCore.js");
  assert.equal(spellCasterHealingAmount(17, 0.5), 8);
  assert.equal(spellCasterHealingAmount(18, 0.5), 9);
  assert.equal(spellCasterHealingAmount(0, 0.5), 0);
  assert.equal(spellCasterHealingAmount(20, 0), 0);

  const normal = spellCasterHealingChange({
    damageChanges: [{ hp: 30, afterHP: 13 }],
    ratio: 0.5,
    hp: 10,
    hpMax: 30,
  });
  assert.equal(normal.requested, 8);
  assert.equal(normal.afterHP, 18);

  const overkill = spellCasterHealingChange({
    damageChanges: [{ requested: 17, hp: 5, afterHP: 0 }],
    ratio: 0.5,
    hp: 10,
    hpMax: 30,
  });
  assert.equal(overkill.requested, 8);
  assert.equal(overkill.afterHP, 18);
});

test("SP-B06B.8 — il popup repeat è compatto e usa il linkedTargetId prima della discovery geometrica", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const controller = fs.readFileSync(path.join(root, "src", "callLightningTurnPromptController.js"), "utf8");
  const popup = fs.readFileSync(path.join(root, "src", "spell-active-resolution.js"), "utf8");
  const adapter = fs.readFileSync(path.join(root, "src", "spellUnifiedActiveAdapter.js"), "utf8");

  assert.match(controller, /ENERVATION_POPOVER_HEIGHT\s*=\s*2\d\d/);
  assert.match(controller, /payload\?\.spellId === "xanathar-debilitazione"/);
  assert.match(adapter, /payload\?\.spellId === "xanathar-debilitazione"[\s\S]*?2\d\d/);
  assert.match(popup, /const linkedTargetId = String\(payload\?\.linkedTargetId/);
  assert.match(popup, /if \(linkedTargetId\)/);
});

test("SP-B06B.9 — cast e repeat applicano la cura del caster nella stessa mutazione HP/History", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const castExecutor = fs.readFileSync(path.join(root, "src", "spellAreaResolutionExecutor.js"), "utf8");
  const activeExecutor = fs.readFileSync(path.join(root, "src", "spellApplicationExecutor.js"), "utf8");

  assert.match(castExecutor, /getSpellCastResolutionRule\(spell\.id\)\?\.casterHealingFromAppliedDamage/);
  assert.match(castExecutor, /entries\.push\(casterHealingEntry\)/);
  assert.ok(
    castExecutor.indexOf("entries.push(casterHealingEntry)") < castExecutor.lastIndexOf("withItemMetaHistory"),
    "la cura iniziale deve entrare nella stessa history HP del cast",
  );

  assert.match(activeExecutor, /action\?\.casterHealingFromAppliedDamage/);
  assert.match(activeExecutor, /metadataPatches\.push\(\{[\s\S]*?id: payload\.casterId/);
  assert.ok(
    activeExecutor.indexOf("id: payload.casterId") < activeExecutor.indexOf("const mutation = await runEffectsMutation(operations"),
    "la cura del repeat deve entrare nella stessa Effects Mutation del danno",
  );
});


test("SP-B06B.10 — renderSingleSave definisce requiredEffectId nel proprio scope prima di usarlo", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const popup = fs.readFileSync(path.join(root, "src", "spell-active-resolution.js"), "utf8");
  const start = popup.indexOf("async function renderSingleSave()");
  const end = popup.indexOf("async function renderStorm()", start);
  const block = popup.slice(start, end);

  assert.match(block, /const requiredEffectId = String\(payload\?\.action\?\.requiredTargetEffectId \|\| ""\)\.trim\(\);/);
  assert.ok(
    block.indexOf("const requiredEffectId") < block.indexOf("const maximilianLinkedTarget"),
    "requiredEffectId deve essere dichiarato nello scope di renderSingleSave prima dell'uso",
  );
});
