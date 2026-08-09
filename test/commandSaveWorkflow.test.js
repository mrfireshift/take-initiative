import assert from "node:assert/strict";
import test from "node:test";

import { getEffectiveConditionInstances } from "../src/conditionRulesCore.js";
import { buildEffectsMutationPlan } from "../src/effectsMutationCore.js";
import { buildCoordinatedEffectsUndoPlan } from "../src/effectsMutationUndoCore.js";
import { resolveSaveSpellResolution } from "../src/saveSpellCore.js";
import {
  saveSpellResolutionOperations,
} from "../src/saveSpellOperationsCore.js";
import {
  getAreaSaveAutomation,
  getSpellDefinition,
} from "../src/spells-srd.js";
import { getSpellSaveWorkflowRule } from "../src/spellSaveWorkflowRules.js";

const command = getSpellDefinition("command");
const commandRule = getSpellSaveWorkflowRule("command");

function resolutionFor(choiceValue, outcomes) {
  return resolveSaveSpellResolution({
    spell: command,
    casterId: "caster",
    targetIds: Object.keys(outcomes),
    outcomes,
    automation: getAreaSaveAutomation("command", choiceValue),
    saveWorkflowRule: commandRule,
    slotLevel: 4,
    choiceValue,
  });
}

function token(id) {
  return {
    id,
    name: id,
    spells: [],
    concentrations: {},
    conditions: [],
  };
}

function preparedOperations(operations) {
  return operations.map((operation, index) => {
    const operationId = `command-operation-${index}`;
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

test("Comando conserva esiti indipendenti e applica la stessa scelta ai soli fallimenti", () => {
  const resolution = resolutionFor("supplica", {
    failedA: "failed",
    passed: "passed",
    immune: "immune",
    failedB: "failed",
  });

  assert.equal(resolution.valid, true);
  assert.equal(resolution.choice.value, "supplica");
  assert.equal(resolution.spellName, "Comando · Supplica");
  assert.deepEqual(resolution.spellTargetIds, ["failedA", "failedB"]);
  assert.deepEqual(resolution.conditionApplications, [{
    outcome: "failed",
    targetIds: ["failedA", "failedB"],
    conditionName: "Prono",
    options: {
      parentEffectId: "",
      manualRemoval: true,
      activation: {
        mode: "turn-start",
        actor: "target",
        remaining: 1,
        anchor: "next-turn",
      },
    },
  }]);

  const nonProne = resolutionFor("fermo", {
    failed: "failed",
    passed: "passed",
    immune: "immune",
  });
  assert.equal(nonProne.valid, true);
  assert.deepEqual(nonProne.spellTargetIds, ["failed"]);
  assert.deepEqual(nonProne.conditionApplications, []);
  assert.equal(nonProne.spellName, "Comando · Fermo");
});

test("Comando produce un unico lifecycle Undoabile e scade al turno successivo di ogni bersaglio", () => {
  const resolution = resolutionFor("supplica", {
    failedA: "failed",
    passed: "passed",
    failedB: "failed",
    immune: "immune",
  });
  const operations = saveSpellResolutionOperations({
    resolution,
    instanceId: "command-instance",
    casterName: "Mago",
    spellExpiry: command.expiry,
    appliedAt: {
      round: 1,
      actorId: "caster",
      phase: "turn",
      turnKey: "1:0:caster",
    },
    castContext: { slotLevel: 4, choice: "supplica" },
  });

  assert.deepEqual(operations.map((operation) => operation.type), [
    "spell:upsert",
    "condition:add",
    "condition:automate",
  ]);
  assert.deepEqual(operations[0].targetIds, ["failedA", "failedB"]);
  assert.equal(operations[0].name, "Comando · Supplica");
  assert.deepEqual(operations[0].castContext, { slotLevel: 4, choice: "supplica" });
  assert.deepEqual(operations[1].targetIds, ["failedA", "failedB"]);
  assert.equal(operations[1].conditionName, "Prono");
  assert.equal(operations[1].options.parentEffectId, "");
  assert.equal(operations[1].options.manualRemoval, true);
  assert.deepEqual(operations[1].options.activation, {
    mode: "turn-start",
    actor: "target",
    remaining: 1,
    anchor: "next-turn",
  });

  const initial = [
    token("caster"),
    token("failedA"),
    token("failedB"),
    token("passed"),
    token("immune"),
  ];
  const applied = buildEffectsMutationPlan(initial, preparedOperations(operations));
  assert.equal(state(applied, "failedA").spells.length, 1);
  assert.equal(state(applied, "failedA").conditions[0].condition, "Prono");
  assert.equal(state(applied, "failedA").conditions[0].active, false);
  assert.deepEqual(state(applied, "failedA").conditions[0].activation, {
    mode: "turn-start",
    actor: "target",
    actorId: "failedA",
    remaining: 1,
    anchor: "next-turn",
  });
  assert.deepEqual(getEffectiveConditionInstances(state(applied, "failedA").conditions), []);
  assert.equal(state(applied, "passed").spells.length, 0);
  assert.equal(state(applied, "passed").conditions.length, 0);
  assert.equal(state(applied, "immune").spells.length, 0);
  assert.equal(state(applied, "immune").conditions.length, 0);

  const started = buildEffectsMutationPlan(applied.states, [{
    type: "effects:tick-boundaries",
    targetIds: ["failedA", "failedB"],
    boundaries: [
      { phase: "start", actorId: "failedA", turnKey: "1:1:failedA" },
      { phase: "start", actorId: "failedB", turnKey: "1:1:failedB" },
    ],
  }]);
  assert.equal(state(started, "failedA").conditions[0].active, true);
  assert.equal(state(started, "failedA").conditions[0].activation, undefined);
  assert.deepEqual(
    getEffectiveConditionInstances(state(started, "failedA").conditions)
      .map((instance) => instance.condition),
    ["Prono"],
  );
  assert.equal(state(started, "failedB").conditions[0].active, true);
  assert.equal(state(started, "failedB").conditions[0].activation, undefined);

  const expired = buildEffectsMutationPlan(started.states, [{
    type: "effects:tick-boundaries",
    targetIds: ["failedA", "failedB"],
    boundaries: [
      { phase: "end", actorId: "failedA", turnKey: "1:1:failedA" },
      { phase: "end", actorId: "failedB", turnKey: "1:1:failedB" },
    ],
  }]);
  assert.deepEqual(state(expired, "failedA").spells, []);
  assert.equal(state(expired, "failedA").conditions[0].condition, "Prono");
  assert.deepEqual(state(expired, "failedA").conditions[0].expiry, { mode: "manual" });
  assert.deepEqual(state(expired, "failedB").spells, []);
  assert.equal(state(expired, "failedB").conditions[0].condition, "Prono");
  assert.deepEqual(state(expired, "failedB").conditions[0].expiry, { mode: "manual" });

  const undo = buildCoordinatedEffectsUndoPlan({
    currentStates: applied.states,
    entryOrEntries: [{
      id: "command-history",
      effectsMutation: { changes: applied.changes },
    }],
  });
  assert.equal(undo.status, undefined);
  assert.deepEqual(state(undo, "failedA").spells, []);
  assert.deepEqual(state(undo, "failedA").conditions, []);
  assert.deepEqual(state(undo, "failedB").spells, []);
  assert.deepEqual(state(undo, "failedB").conditions, []);
});
