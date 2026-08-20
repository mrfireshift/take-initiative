import test from "node:test";
import assert from "node:assert/strict";

import { buildEffectsMutationPlan } from "../src/effectsMutationCore.js";
import {
  getAreaSaveAutomation,
  getSpellDefinition,
} from "../src/spells-srd.js";
import {
  buildSpellUnifiedPanelContract,
} from "../src/spellUnifiedPanelCore.js";
import { buildSpellAreaResolutionCommand } from "../src/spellAreaResolutionCommandCore.js";
import { resolveSaveSpellResolution } from "../src/saveSpellCore.js";
import { saveSpellResolutionOperations } from "../src/saveSpellOperationsCore.js";
import {
  getSpellSaveTargetMaximum,
  resolveSpellSaveTargeting,
} from "../src/spellSaveTargetingCore.js";
import { getSpellSaveWorkflowRule } from "../src/spellSaveWorkflowRules.js";

const SPELL_ID = "xanathar-urlo-psichico";

function spell() {
  return getSpellDefinition(SPELL_ID);
}

function preparedOperations(operations, prefix = "psychic-scream") {
  return operations.map((operation, index) => {
    const operationId = `${prefix}-${index}`;
    const targetIds = operation.targetIds || [];
    if (operation.type === "spell:upsert") {
      return {
        ...operation,
        operationId,
        entryIds: Object.fromEntries(targetIds.map((id) => [id, `${operationId}:spell:${id}`])),
      };
    }
    if (operation.type === "condition:add") {
      return {
        ...operation,
        operationId,
        createdAt: 100 + index,
        instanceIds: Object.fromEntries(targetIds.map((id) => [id, `${operationId}:condition:${id}`])),
      };
    }
    return { ...operation, operationId };
  });
}

function state(plan, id) {
  return plan.states.find((entry) => entry.id === id);
}

function resolution(outcomes = { failed: "failed", passed: "passed" }) {
  const currentSpell = spell();
  return resolveSaveSpellResolution({
    spell: currentSpell,
    casterId: "caster",
    targetIds: Object.keys(outcomes),
    outcomes,
    automation: getAreaSaveAutomation(currentSpell),
    saveWorkflowRule: getSpellSaveWorkflowRule(SPELL_ID),
    slotLevel: 9,
    validateSpatial: false,
  });
}

test("SP-B05D.1 — Urlo Psichico espone TS INT, massimo 10 target e range 27 m", () => {
  const rule = getSpellSaveWorkflowRule(SPELL_ID);
  assert.ok(rule);
  assert.equal(rule.ability, "int");
  assert.equal(rule.targeting.baseSlot, 9);
  assert.equal(rule.targeting.baseMaximum, 10);
  assert.equal(rule.targeting.additionalPerSlotAbove, 0);
  assert.deepEqual(rule.targeting.spatial, {
    mode: "caster-range",
    maxMeters: 27,
  });
  assert.equal(getSpellSaveTargetMaximum(SPELL_ID, 9), 10);

  const valid = resolveSpellSaveTargeting({
    spellId: SPELL_ID,
    slotLevel: 9,
    targetIds: Array.from({ length: 10 }, (_, index) => `target-${index}`),
    casterDistancesMeters: Object.fromEntries(
      Array.from({ length: 10 }, (_, index) => [`target-${index}`, 27]),
    ),
  });
  assert.equal(valid.valid, true, valid.errors.join(", "));

  const exceeded = resolveSpellSaveTargeting({
    spellId: SPELL_ID,
    slotLevel: 9,
    targetIds: Array.from({ length: 11 }, (_, index) => `target-${index}`),
    casterDistancesMeters: Object.fromEntries(
      Array.from({ length: 11 }, (_, index) => [`target-${index}`, 10]),
    ),
  });
  assert.equal(exceeded.valid, false);
  assert.ok(exceeded.errors.includes("target-limit-exceeded"));
});

test("SP-B05D.1 — il pannello unificato richiede danno e outcome TS", () => {
  const model = buildSpellUnifiedPanelContract({
    spellId: SPELL_ID,
    phase: "cast",
    castContext: { slotLevel: 9 },
  });

  assert.equal(model.presentation.inputs.targets.maximum, 10);
  assert.equal(model.presentation.inputs.outcomes.visible, true);
  assert.equal(model.presentation.inputs.outcomes.required, true);
  assert.equal(model.presentation.inputs.damage.visible, true);
  assert.equal(model.presentation.inputs.damage.required, true);
  assert.equal(model.execution.castHasHP, true);
  assert.equal(model.execution.lane, "area-transaction");
});

test("SP-B05D.2 — fallito = danno pieno + Stordito; superato = metà danno e nessuna condizione", () => {
  const currentSpell = spell();
  const contract = buildSpellUnifiedPanelContract({
    spellId: SPELL_ID,
    phase: "cast",
    castContext: { slotLevel: 9 },
  });
  const command = buildSpellAreaResolutionCommand({
    contract,
    spellId: SPELL_ID,
    phase: "cast",
    source: { kind: "cast", sceneEpoch: 11 },
    casterId: "caster",
    slotLevel: 9,
    targetIds: ["failed", "passed"],
    candidateTargetIds: ["failed", "passed"],
    outcomes: { failed: "failed", passed: "passed" },
    hp: { mode: "damage", amount: 42 },
    sceneEpoch: 11,
    currentSceneEpoch: 11,
    validateSpatial: false,
  });

  assert.equal(command.valid, true, command.errors?.join(", "));
  assert.equal(command.hp.outcomeFactors.failed, "full");
  assert.equal(command.hp.outcomeFactors.passed, "half");
  assert.equal(command.resolution.conditionApplications.length, 1);
  assert.equal(command.resolution.conditionApplications[0].conditionName, "Stordito");
  assert.deepEqual(command.resolution.conditionApplications[0].targetIds, ["failed"]);
  assert.equal(currentSpell.concentration, false);
});

test("SP-B05D.3 — Stordito porta repeat save INT e il successo termina il parent sul singolo target", () => {
  const result = resolution();
  assert.equal(result.valid, true, result.errors.join(", "));
  assert.deepEqual(result.spellTargetIds, ["failed"]);
  assert.equal(result.conditionApplications.length, 1);
  const application = result.conditionApplications[0];
  assert.equal(application.conditionName, "Stordito");
  assert.equal(application.options.saveReminder.ability, "int");
  assert.equal(application.options.saveReminder.timing, "turn-end");
  assert.equal(application.options.endsParentOnRemoval, true);
  assert.equal(application.options.parentRemoval, "target");

  const operations = saveSpellResolutionOperations({
    resolution: result,
    instanceId: "psychic-scream-1",
    casterName: "Caster",
    turns: 1,
    spellExpiry: { mode: "manual" },
  });
  const initial = buildEffectsMutationPlan([
    { id: "caster", spells: [], conditions: [], concentrations: {} },
    { id: "failed", spells: [], conditions: [], concentrations: {} },
    { id: "passed", spells: [], conditions: [], concentrations: {} },
  ], preparedOperations(operations));

  assert.equal(state(initial, "failed").spells.length, 1);
  assert.equal(state(initial, "failed").conditions[0].condition, "Stordito");
  assert.equal(state(initial, "passed").spells.length, 0);
  assert.equal(state(initial, "passed").conditions.length, 0);

  const stunnedId = state(initial, "failed").conditions[0].id;
  const afterSave = buildEffectsMutationPlan(initial.states, [{
    type: "condition:remove-instances",
    operationId: "psychic-scream-repeat-save",
    removals: [{ itemId: "failed", instanceId: stunnedId }],
  }]);

  assert.equal(state(afterSave, "failed").conditions.length, 0);
  assert.equal(state(afterSave, "failed").spells.length, 0);
});
