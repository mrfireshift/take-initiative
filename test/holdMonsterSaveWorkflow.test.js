import assert from "node:assert/strict";
import test from "node:test";

import {
  getSpellSaveTargetMaximum,
  resolveSpellSaveTargeting,
} from "../src/spellSaveTargetingCore.js";
import { getSpellSaveWorkflowRule } from "../src/spellSaveWorkflowRules.js";
import { buildSpellUnifiedPanelContract } from "../src/spellUnifiedPanelCore.js";
import { getAreaSaveAutomation, getSpellDefinition } from "../src/spells-srd.js";
import { resolveSaveSpellResolution } from "../src/saveSpellCore.js";
import { saveSpellResolutionOperations } from "../src/saveSpellOperationsCore.js";
import { buildEffectsMutationPlan } from "../src/effectsMutationCore.js";

const SPELL_ID = "hold-monster";

function preparedOperations(operations, prefix = "hold-monster-op") {
  return operations.map((operation, index) => {
    const operationId = `${prefix}-${index}`;
    const targetIds = operation.targetIds || [];
    if (operation.type === "spell:upsert") {
      return {
        ...operation,
        operationId,
        entryIds: Object.fromEntries(targetIds.map((id) => [id, `${operationId}:entry:${id}`])),
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

const state = (plan, id) => plan.states.find((entry) => entry.id === id);

test("SP-B05A — Blocca Mostri replica Blocca Persone con slot base 5", () => {
  const rule = getSpellSaveWorkflowRule(SPELL_ID);
  assert.ok(rule);
  assert.equal(rule.ability, "wis");
  assert.equal(rule.targeting.baseSlot, 5);
  assert.equal(rule.targeting.baseMaximum, 1);
  assert.equal(rule.targeting.additionalPerSlotAbove, 1);
  assert.deepEqual(rule.targeting.spatial, {
    mode: "pairwise-distance",
    maxMeters: 9,
  });

  assert.equal(getSpellSaveTargetMaximum(SPELL_ID, 5), 1);
  assert.equal(getSpellSaveTargetMaximum(SPELL_ID, 6), 2);
  assert.equal(getSpellSaveTargetMaximum(SPELL_ID, 7), 3);
  assert.equal(getSpellSaveTargetMaximum(SPELL_ID, 9), 5);
});

test("SP-B05A — Blocca Mostri applica il limite pairwise di 9 m", () => {
  const valid = resolveSpellSaveTargeting({
    spellId: SPELL_ID,
    slotLevel: 6,
    targetIds: ["a", "b"],
    pairwiseDistancesMeters: [{ targetIds: ["a", "b"], distanceMeters: 9 }],
  });
  assert.equal(valid.valid, true);

  const invalid = resolveSpellSaveTargeting({
    spellId: SPELL_ID,
    slotLevel: 6,
    targetIds: ["a", "b"],
    pairwiseDistancesMeters: [{ targetIds: ["a", "b"], distanceMeters: 9.5 }],
  });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.includes("pairwise-distance-exceeded"));
});

test("SP-B05A — pannello cast espone bersagli ed esiti TS come Blocca Persone", () => {
  const base = buildSpellUnifiedPanelContract({
    spellId: SPELL_ID,
    phase: "cast",
    castContext: { slotLevel: 5 },
  });
  const upcast = buildSpellUnifiedPanelContract({
    spellId: SPELL_ID,
    phase: "cast",
    castContext: { slotLevel: 7 },
  });

  assert.equal(base.presentation.inputs.targets.maximum, 1);
  assert.equal(upcast.presentation.inputs.targets.maximum, 3);
  assert.equal(base.presentation.inputs.outcomes.visible, true);
  assert.equal(base.presentation.inputs.outcomes.required, true);
  assert.equal(base.presentation.outcomes.mode, "save");
});

test("SP-B05A — fallimento applica Paralizzato con repeat save e cleanup target indipendente", () => {
  const spell = getSpellDefinition(SPELL_ID);
  const automation = getAreaSaveAutomation(spell);
  assert.deepEqual(automation.trackOutcomes, ["failed"]);
  assert.equal(automation.failed.length, 1);
  assert.equal(automation.failed[0].condition, "Paralizzato");
  assert.equal(automation.failed[0].parentRemoval, "target");
  assert.equal(automation.failed[0].endsParentOnRemoval, true);
  assert.deepEqual(automation.failed[0].saveReminder, {
    ability: "wis",
    timing: "turn-end",
    dcSource: "source-spell",
    label: "Se supera il TS, termina Blocca Mostri.",
  });

  const resolution = resolveSaveSpellResolution({
    spell,
    casterId: "caster",
    targetIds: ["target"],
    outcomes: { target: "failed" },
    automation,
    saveWorkflowRule: getSpellSaveWorkflowRule(SPELL_ID),
    slotLevel: 5,
    validateSpatial: false,
  });
  assert.equal(resolution.valid, true, resolution.errors.join(", "));
  assert.equal(resolution.conditionApplications.length, 1);

  const operations = saveSpellResolutionOperations({
    resolution,
    instanceId: "hold-monster-1",
    casterName: "Caster",
    turns: 10,
    spellExpiry: { mode: "concentration" },
  });
  const initial = buildEffectsMutationPlan([
    { id: "caster", spells: [], concentrations: {}, conditions: [] },
    { id: "target", spells: [], concentrations: {}, conditions: [] },
  ], preparedOperations(operations));

  assert.equal(state(initial, "target").conditions[0].condition, "Paralizzato");
  assert.equal(state(initial, "target").conditions[0].parentEffectId, "hold-monster-1");
  assert.equal(state(initial, "caster").spells.length, 0);
  assert.equal(state(initial, "target").spells.length, 1);
});
