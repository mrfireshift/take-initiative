import test from "node:test";
import assert from "node:assert/strict";

import { buildEffectsMutationPlan } from "../src/effectsMutationCore.js";
import { resolveSaveSpellResolution } from "../src/saveSpellCore.js";
import { saveSpellResolutionOperations } from "../src/saveSpellOperationsCore.js";
import {
  getSpellSaveTargetMaximum,
  resolveSpellSaveTargeting,
} from "../src/spellSaveTargetingCore.js";
import {
  getSpellSaveWorkflowRule,
  getSpellSaveWorkflowChoiceOptions,
} from "../src/spellSaveWorkflowRules.js";
import {
  buildSpellUnifiedPanelContract,
} from "../src/spellUnifiedPanelCore.js";
import { buildSpellAreaResolutionCommand } from "../src/spellAreaResolutionCommandCore.js";
import {
  getAreaSaveAutomation,
  getSpellDefinition,
} from "../src/spells-srd.js";

const SPELL_ID = "blindness-deafness";

function preparedOperations(operations, prefix = "blindness-deafness") {
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

function resolution({
  choiceValue = "accecato",
  slotLevel = 2,
  targetIds = ["target-a"],
  outcomes = { "target-a": "failed" },
} = {}) {
  const spell = getSpellDefinition(SPELL_ID);
  return resolveSaveSpellResolution({
    spell,
    casterId: "caster",
    targetIds,
    outcomes,
    automation: getAreaSaveAutomation(spell, choiceValue),
    saveWorkflowRule: getSpellSaveWorkflowRule(SPELL_ID),
    slotLevel,
    choiceValue,
    validateSpatial: false,
  });
}

test("SP-B05B.1 — Cecità/Sordità dichiara scelta di condizione, TS CON e scaling RAW", () => {
  const rule = getSpellSaveWorkflowRule(SPELL_ID);
  assert.ok(rule);
  assert.equal(rule.ability, "con");
  assert.equal(rule.targeting.baseSlot, 2);
  assert.equal(rule.targeting.baseMaximum, 1);
  assert.equal(rule.targeting.additionalPerSlotAbove, 1);
  assert.deepEqual(rule.targeting.spatial, {
    mode: "caster-range",
    maxMeters: 9,
  });

  assert.equal(getSpellSaveTargetMaximum(SPELL_ID, 2), 1);
  assert.equal(getSpellSaveTargetMaximum(SPELL_ID, 3), 2);
  assert.equal(getSpellSaveTargetMaximum(SPELL_ID, 5), 4);
  assert.equal(getSpellSaveTargetMaximum(SPELL_ID, 9), 8);

  assert.deepEqual(
    getSpellSaveWorkflowChoiceOptions(SPELL_ID).map(({ value, label }) => ({ value, label })),
    [
      { value: "accecato", label: "Accecato" },
      { value: "assordato", label: "Assordato" },
    ],
  );
});

test("SP-B05B.1 — pannello unificato richiede la condizione e scala il numero di target", () => {
  const base = buildSpellUnifiedPanelContract({
    spellId: SPELL_ID,
    castContext: { slotLevel: 2 },
  });
  assert.equal(base.presentation.variant.required, true);
  assert.deepEqual(base.presentation.variant.options.map((entry) => entry.label), ["Accecato", "Assordato"]);
  assert.equal(base.presentation.inputs.targets.maximum, 1);
  assert.equal(base.presentation.inputs.outcomes.visible, true);
  assert.equal(base.presentation.inputs.outcomes.required, true);

  const upcast = buildSpellUnifiedPanelContract({
    spellId: SPELL_ID,
    choiceValue: "accecato",
    castContext: { slotLevel: 4 },
  });
  assert.equal(upcast.presentation.inputs.targets.maximum, 3);
});

test("SP-B05B.1 — target limit viene validato sullo slot", () => {
  const valid = resolveSpellSaveTargeting({
    spellId: SPELL_ID,
    slotLevel: 3,
    choiceValue: "assordato",
    targetIds: ["a", "b"],
    casterDistancesMeters: { a: 8, b: 9 },
  });
  assert.equal(valid.valid, true, valid.errors.join(", "));

  const exceeded = resolveSpellSaveTargeting({
    spellId: SPELL_ID,
    slotLevel: 3,
    choiceValue: "assordato",
    targetIds: ["a", "b", "c"],
    casterDistancesMeters: { a: 5, b: 5, c: 5 },
  });
  assert.equal(exceeded.valid, false);
  assert.ok(exceeded.errors.includes("target-limit-exceeded"));
});

test("SP-B05B.2 — Accecato viene applicato solo ai falliti e porta il repeat save CON", () => {
  const result = resolution({
    choiceValue: "accecato",
    slotLevel: 3,
    targetIds: ["target-a", "target-b"],
    outcomes: { "target-a": "failed", "target-b": "passed" },
  });

  assert.equal(result.valid, true, result.errors.join(", "));
  assert.deepEqual(result.spellTargetIds, ["target-a"]);
  assert.equal(result.conditionApplications.length, 1);
  const application = result.conditionApplications[0];
  assert.equal(application.conditionName, "Accecato");
  assert.deepEqual(application.targetIds, ["target-a"]);
  assert.equal(application.options.saveReminder.ability, "con");
  assert.equal(application.options.saveReminder.timing, "turn-end");
  assert.equal(application.options.endsParentOnRemoval, true);
  assert.equal(application.options.parentRemoval, "target");
});

test("SP-B05B.2 — Assordato usa lo stesso lifecycle indipendente per ogni bersaglio", () => {
  const result = resolution({
    choiceValue: "assordato",
    slotLevel: 3,
    targetIds: ["target-a", "target-b"],
    outcomes: { "target-a": "failed", "target-b": "failed" },
  });
  assert.equal(result.valid, true, result.errors.join(", "));
  assert.equal(result.conditionApplications[0].conditionName, "Assordato");

  const operations = saveSpellResolutionOperations({
    resolution: result,
    instanceId: "blindness-instance",
    casterName: "Caster",
    turns: 10,
  });
  const initial = buildEffectsMutationPlan([
    { id: "caster", spells: [], conditions: [], concentrations: {} },
    { id: "target-a", spells: [], conditions: [] },
    { id: "target-b", spells: [], conditions: [] },
  ], preparedOperations(operations));

  assert.equal(state(initial, "target-a").conditions[0].condition, "Assordato");
  assert.equal(state(initial, "target-b").conditions[0].condition, "Assordato");
  assert.equal(state(initial, "target-a").spells.length, 1);
  assert.equal(state(initial, "target-b").spells.length, 1);

  const conditionA = state(initial, "target-a").conditions[0].id;
  const afterA = buildEffectsMutationPlan(initial.states, [{
    type: "condition:remove-instances",
    operationId: "repeat-save-a",
    removals: [{ itemId: "target-a", instanceId: conditionA }],
  }]);

  assert.equal(state(afterA, "target-a").conditions.length, 0);
  assert.equal(state(afterA, "target-a").spells.length, 0);
  assert.equal(state(afterA, "target-b").conditions.length, 1);
  assert.equal(state(afterA, "target-b").spells.length, 1);
});


test("SP-B05B.3 — il comando richiede la scelta e conserva gli esiti misti", () => {
  const missingChoiceContract = buildSpellUnifiedPanelContract({
    spellId: SPELL_ID,
    castContext: { slotLevel: 3 },
  });
  const missingChoice = buildSpellAreaResolutionCommand({
    contract: missingChoiceContract,
    spellId: SPELL_ID,
    phase: "cast",
    source: { kind: "cast", sceneEpoch: 7 },
    casterId: "caster",
    slotLevel: 3,
    targetIds: ["target-a", "target-b"],
    candidateTargetIds: ["target-a", "target-b"],
    outcomes: { "target-a": "failed", "target-b": "passed" },
    sceneEpoch: 7,
    currentSceneEpoch: 7,
    validateSpatial: false,
  });
  assert.equal(missingChoice.valid, false);
  assert.ok(missingChoice.errors.includes("choice-required"));

  const selectedContract = buildSpellUnifiedPanelContract({
    spellId: SPELL_ID,
    choiceValue: "accecato",
    castContext: { slotLevel: 3 },
  });
  const command = buildSpellAreaResolutionCommand({
    contract: selectedContract,
    spellId: SPELL_ID,
    phase: "cast",
    source: { kind: "cast", sceneEpoch: 7 },
    casterId: "caster",
    slotLevel: 3,
    choiceValue: "accecato",
    targetIds: ["target-a", "target-b"],
    candidateTargetIds: ["target-a", "target-b"],
    outcomes: { "target-a": "failed", "target-b": "passed" },
    sceneEpoch: 7,
    currentSceneEpoch: 7,
    validateSpatial: false,
  });
  assert.equal(command.valid, true, command.errors.join(", "));
  assert.equal(command.spell.choiceValue, "accecato");
  assert.deepEqual(command.targeting.targetIds, ["target-a", "target-b"]);
});
