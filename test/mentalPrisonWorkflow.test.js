import test from "node:test";
import assert from "node:assert/strict";
import { getAreaSaveAutomation, getSpellDefinition } from "../src/spells-srd.js";
import { getSpellSaveWorkflowRule } from "../src/spellSaveWorkflowRules.js";
import { spellSaveDamageFormula } from "../src/spellCastResolutionRules.js";
import { buildSpellUnifiedPanelContract } from "../src/spellUnifiedPanelCore.js";
import { buildSpellAreaResolutionCommand } from "../src/spellAreaResolutionCommandCore.js";
import { saveSpellResolutionOperations } from "../src/saveSpellOperationsCore.js";
import { resolveSaveSpellResolution } from "../src/saveSpellCore.js";
import { buildEffectsMutationPlan } from "../src/effectsMutationCore.js";
import { getSpellOverviewActions } from "../src/spellActiveActionCore.js";
import {
  getSpellResolutionAction,
  resolveSpellActiveResolutionDamage,
  validateSpellActiveResolutionAction,
} from "../src/spellActiveResolutionCore.js";

const SPELL_ID = "xanathar-prigione-mentale";
const ACTION_ID = "mental-prison-break";
const spell = () => getSpellDefinition(SPELL_ID);
const contract = () => buildSpellUnifiedPanelContract({ spellId: SPELL_ID });

function resolution(outcome) {
  return resolveSaveSpellResolution({
    spell: spell(), casterId: "caster", targetIds: ["target"],
    outcomes: { target: outcome }, automation: getAreaSaveAutomation(spell()),
    saveWorkflowRule: getSpellSaveWorkflowRule(SPELL_ID), slotLevel: 6,
    validateSpatial: false,
  });
}

function command(outcome) {
  return buildSpellAreaResolutionCommand({
    contract: contract(), spellId: SPELL_ID, phase: "cast",
    source: { kind: "cast", sceneEpoch: 4 }, casterId: "caster", slotLevel: 6,
    targetIds: ["target"], candidateTargetIds: ["target"],
    outcomes: { target: outcome }, hp: { mode: "damage", amount: 27 },
    casterDistancesMeters: { target: 12 }, sceneEpoch: 4, currentSceneEpoch: 4,
    validateSpatial: false,
  });
}

function lifecycle() {
  const result = command("failed");
  assert.equal(result.valid, true, result.errors?.join(", "));
  const operations = saveSpellResolutionOperations({
    resolution: resolution("failed"), instanceId: "prison-1", turns: 10,
    castContext: { slotLevel: 6 },
  }).map((operation, i) => ({
    ...operation, operationId: `prison-op-${i}`,
    ...(operation.type === "condition:add" ? { instanceIds: { target: `prison-condition-${i}` } } : {}),
  }));
  const tokens = ["caster", "target"].map(id => ({
    id, spells: [], concentrations: {}, conditions: [],
  }));
  return buildEffectsMutationPlan(tokens, operations);
}

test("Prigione Mentale richiede TS Int, danno e un bersaglio entro 18 m", () => {
  const model = contract();
  assert.equal(model.presentation.inputs.outcomes.required, true);
  assert.equal(model.presentation.inputs.damage.required, true);
  assert.equal(model.presentation.targeting.limit.maximum, 1);
  assert.equal(model.execution.lane, "area-transaction");
  const rule = getSpellSaveWorkflowRule(SPELL_ID);
  assert.equal(rule.ability, "int");
  assert.deepEqual(rule.targeting.spatial, { mode: "caster-range", maxMeters: 18 });
  assert.deepEqual(rule.outcomeOptions, ["passed", "failed"]);
});

test("TS superato conserva tutti i 5d10 e non persiste", () => {
  const result = command("passed");
  assert.equal(result.valid, true, result.errors?.join(", "));
  assert.equal(result.hp.outcomeFactors.target, "full");
  assert.deepEqual(result.resolution.spellTargetIds, []);
  assert.deepEqual(result.resolution.conditionApplications, []);
  const operations = saveSpellResolutionOperations({ resolution: resolution("passed"), instanceId: "passed", turns: 10 });
  assert.equal(operations.some(op => ["spell:upsert", "concentration:register"].includes(op.type)), false);
  for (const slot of [6, 7, 9]) {
    assert.equal(spellSaveDamageFormula(SPELL_ID, "passed", slot), "5d10");
    assert.equal(spellSaveDamageFormula(SPELL_ID, "failed", slot), "5d10");
  }
});

test("TS fallito applica danno pieno, Trattenuto e isolamento sensoriale senza Affascinato o TS ripetuti", () => {
  const result = command("failed");
  assert.equal(result.valid, true, result.errors?.join(", "));
  assert.equal(result.hp.outcomeFactors.target, "full");
  assert.deepEqual(result.resolution.spellTargetIds, ["target"]);
  const applications = result.resolution.conditionApplications;
  assert.ok(applications.some(app => app.conditionName === "Trattenuto"));
  const isolation = applications.find(app => app.options.effectId === "mental-prison-link");
  assert.ok(isolation);
  assert.match(isolation.options.effectDetail, /non può vedere né sentire.*oltre/i);
  assert.ok(isolation.options.summaryParts.length > 0);
  assert.equal(applications.some(app => ["Affascinato", "Accecato", "Assordato"].includes(app.conditionName)), false);
  assert.equal(applications.some(app => app.options.saveReminder), false);
  assert.ok(getAreaSaveAutomation(spell()));
});

test("anche il lancio con TS superato interrompe una concentrazione precedente senza registrare la prigione", () => {
  const operations = saveSpellResolutionOperations({
    resolution: resolution("passed"), instanceId: "passed-prison", turns: 10,
  });
  const before = [
    { id: "caster", spells: [], conditions: [], concentrations: {
      old: { name: "Vecchio incantesimo", instanceId: "old", targets: ["old-target"] },
    } },
    { id: "old-target", spells: [{ name: "Vecchio incantesimo", instanceId: "old", casterId: "caster", conc: true, turns: 5 }],
      conditions: [{ id: "old-condition", condition: "Spaventato", parentEffectId: "old", sourceId: "caster", active: true }], concentrations: {} },
    { id: "target", spells: [], conditions: [], concentrations: {} },
  ];
  const after = buildEffectsMutationPlan(before, operations).states;
  assert.deepEqual(after.find(state => state.id === "caster").concentrations, {});
  assert.deepEqual(after.find(state => state.id === "old-target").conditions, []);
  assert.deepEqual(after.find(state => state.id === "old-target").spells, []);
  assert.deepEqual(after.find(state => state.id === "target").spells, []);
});

test("fine concentrazione e scadenza eliminano tutti gli effetti collegati senza detonazione", () => {
  const cast = lifecycle();
  assert.equal(cast.states.find(s => s.id === "target").conditions.length, 2);
  const end = buildEffectsMutationPlan(cast.states, [{
    type: "concentration:break", casterIds: ["caster"], reference: "prison-1",
  }]);
  assert.deepEqual(end.states.find(s => s.id === "target").conditions, []);
  assert.deepEqual(end.states.find(s => s.id === "target").spells, []);
  assert.deepEqual(end.pendingTerminations || [], []);
  let ticked = cast;
  for (let i = 0; i < 10; i++) ticked = buildEffectsMutationPlan(ticked.states, [{
    type: "effects:tick-round", targetIds: ["target"], delta: -1,
  }]);
  assert.deepEqual(ticked.states.find(s => s.id === "target").conditions, []);
  assert.deepEqual(ticked.states.find(s => s.id === "target").spells, []);
  assert.deepEqual(ticked.pendingTerminations || [], []);
});

test("attraversamento GM disponibile subito: 10d10 senza TS né limite di gittata successivo al lancio", () => {
  const action = getSpellResolutionAction(SPELL_ID, ACTION_ID);
  assert.ok(action);
  assert.equal(validateSpellActiveResolutionAction(action).valid, true);
  assert.equal(action.economy, "gm");
  assert.equal(action.manualSaveAtTable, true);
  assert.equal(action.assumedOutcome, "failed");
  assert.equal(action.requiredTargetEffectId, "mental-prison-link");
  assert.equal(action.concentrationAction, "dismiss");
  assert.equal(action.range, undefined);
  const overview = getSpellOverviewActions({
    spell: spell(), casterId: "caster", targetIds: ["target"],
    effectInstances: [{ itemId: "target", effectId: "mental-prison-link", active: true }],
    appliedAt: { turnKey: "1:caster" }, currentTurnKey: "1:caster",
  });
  assert.equal(overview.find(a => a.id === ACTION_ID)?.unavailableReason, undefined);
  const damage = resolveSpellActiveResolutionDamage({ action, slotLevel: 9, outcome: "failed", roll: 53 });
  assert.equal(damage.scaledFormula, "10d10");
  assert.equal(damage.amount, 53);
});
