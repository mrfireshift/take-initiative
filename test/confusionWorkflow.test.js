import test from "node:test";
import assert from "node:assert/strict";

import { ID } from "../src/constants.js";
import { buildEffectsMutationPlan } from "../src/effectsMutationCore.js";
import { planEffectSaveReminderNotices } from "../src/effectSaveReminderCore.js";
import { effectSummaryPartsFor } from "../src/effectLabelCore.js";
import {
  buildReminderResolutionPlan,
  REMINDER_OUTCOMES,
} from "../src/reminderResolutionCore.js";
import { resolveSaveSpellResolution } from "../src/saveSpellCore.js";
import { saveSpellResolutionOperations } from "../src/saveSpellOperationsCore.js";
import {
  getAreaSaveAutomation,
  getSpellDefinition,
} from "../src/spells-srd.js";

const META_KEY = `${ID}/meta`;
const SPELL_ID = "confusion";
const SPELL_INSTANCE_ID = "confusion-cast";
const automation = getAreaSaveAutomation(SPELL_ID);
const spell = getSpellDefinition(SPELL_ID);

function token(id) {
  return {
    id,
    name: id === "caster" ? "Caster" : `Target ${id}`,
    spells: [],
    concentrations: {},
    conditions: [],
  };
}

function preparedOperations(operations) {
  let conditionSequence = 0;
  return operations.map((operation, index) => {
    const operationId = `confusion-operation-${index}`;
    const targetIds = Array.isArray(operation.targetIds) ? operation.targetIds : [];
    if (operation.type === "spell:upsert") {
      return {
        ...operation,
        operationId,
        entryIds: Object.fromEntries(targetIds.map((id) => [
          id,
          `${SPELL_INSTANCE_ID}:spell:${id}`,
        ])),
      };
    }
    if (operation.type === "condition:add") {
      conditionSequence += 1;
      return {
        ...operation,
        operationId,
        createdAt: 100 + index,
        instanceIds: Object.fromEntries(targetIds.map((id) => [
          id,
          `${SPELL_INSTANCE_ID}:condition:${conditionSequence}:${id}`,
        ])),
      };
    }
    return { ...operation, operationId };
  });
}

function stateOf(plan, id) {
  return plan.states.find((entry) => entry.id === id);
}

function confusionResolution(outcomes) {
  return resolveSaveSpellResolution({
    spell,
    casterId: "caster",
    targetIds: Object.keys(outcomes),
    outcomes,
    automation,
    validateSpatial: false,
  });
}

function appliedConfusion(outcomes = {
  "target-a": REMINDER_OUTCOMES.FAILED,
  "target-b": REMINDER_OUTCOMES.FAILED,
}) {
  const resolution = confusionResolution(outcomes);
  assert.equal(resolution.valid, true, resolution.errors?.join(", "));
  const operations = saveSpellResolutionOperations({
    resolution,
    instanceId: SPELL_INSTANCE_ID,
    casterName: "Caster",
    spellExpiry: { mode: "concentration" },
    appliedAt: { round: 1, actorId: "caster", turnKey: "1:0:caster" },
  });
  return buildEffectsMutationPlan([
    token("caster"),
    token("target-a"),
    token("target-b"),
    token("target-c"),
  ], preparedOperations(operations));
}

function reminderItems(plan) {
  return plan.states.map((entry) => ({
    id: entry.id,
    name: entry.name,
    metadata: {
      [META_KEY]: {
        initiativeCard: entry.id === "caster" ? { spellSaveDC: 15 } : undefined,
        conditions: entry.conditions,
        [`${ID}/spells`]: entry.spells,
        ...(entry.reminderResolutions
          ? { reminderResolutions: entry.reminderResolutions }
          : {}),
      },
    },
  }));
}

function targetBoundary(previousCurrent, nextCurrent, round = 1) {
  return {
    previousInitiativeState: {
      order: ["caster", "target-a", "target-b"],
      current: previousCurrent,
      round,
    },
    initiativeState: {
      order: ["caster", "target-a", "target-b"],
      current: nextCurrent,
      round,
    },
    includeCurrentTurnStart: false,
  };
}

test("Confusione applica l'effect solo ai fallimenti e mantiene identity/parent", () => {
  const applied = appliedConfusion({
    "target-a": REMINDER_OUTCOMES.FAILED,
    "target-b": REMINDER_OUTCOMES.PASSED,
    "target-c": REMINDER_OUTCOMES.IMMUNE,
  });
  const failed = stateOf(applied, "target-a");
  const effect = failed.conditions[0];

  assert.equal(failed.conditions.length, 1);
  assert.equal(effect.effectId, "confusion-random-turn");
  assert.equal(effect.parentEffectId, SPELL_INSTANCE_ID);
  assert.equal(failed.spells.length, 1);
  assert.deepEqual(stateOf(applied, "target-b").conditions, []);
  assert.deepEqual(stateOf(applied, "target-c").conditions, []);
  assert.deepEqual(effectSummaryPartsFor(effect), [
    { id: "confusion-no-reactions", label: "No reaz." },
    { id: "confusion-random-table", label: "Tira d10 inizio turno" },
  ]);
});

test("Confusione espone tabella RAW, d10 fisico e reminder TS senza automazione nuova", () => {
  const rule = automation.failed.find((entry) => entry.effectId === "confusion-random-turn");
  const turnStart = rule.saveReminder.find((entry) => entry.timing === "turn-start");
  const turnEnd = rule.saveReminder.find((entry) => entry.timing === "turn-end");

  assert.ok(rule);
  assert.match(rule.effectDetail, /Niente reazioni/u);
  assert.match(rule.effectDetail, /d10/u);
  assert.match(rule.effectDetail, /d8/u);
  assert.match(rule.effectDetail, /2-6/u);
  assert.match(rule.effectDetail, /7-8/u);
  assert.match(rule.effectDetail, /9-10/u);
  assert.match(rule.effectDetail, /manuali al tavolo/u);
  assert.deepEqual(turnStart, {
    timing: "turn-start",
    mode: "consume",
    label: "Tira il d10 fisico: 1 movimento casuale + d8 direzione, no azione; 2-6 niente; 7-8 attacco mischia casuale se disponibile; 9-10 normale.",
  });
  assert.equal(turnStart.dice, undefined);
  assert.equal(turnStart.resolution, undefined);
  assert.deepEqual(turnEnd, {
    ability: "wis",
    timing: "turn-end",
    dcSource: "source-spell",
    label: "Se supera il TS, termina Confusione su di sé.",
  });
});

test("il reminder turn-start di Confusione è target-scoped, consumabile e non rimuove l'effect", () => {
  const applied = appliedConfusion();
  const items = reminderItems(applied);
  const notices = planEffectSaveReminderNotices({
    items,
    ...targetBoundary(0, 1),
  });
  const turnStart = notices.find((notice) => notice.timing === "turn-start");

  assert.ok(turnStart);
  assert.equal(turnStart.target.id, "target-a");
  assert.match(turnStart.instruction, /d10 fisico/u);
  assert.match(turnStart.instruction, /2-6/u);
  assert.match(turnStart.instruction, /7-8/u);
  assert.match(turnStart.instruction, /9-10/u);
  assert.equal(turnStart.resolution.mode, "consume");
  assert.equal(turnStart.resolution.damage, undefined);
  assert.equal(turnStart.resolution.save, undefined);
  assert.equal(turnStart.dice, undefined);
  assert.equal(
    notices.some((notice) => notice.timing === "turn-start" && notice.target.id !== "target-a"),
    false,
  );

  const dismissed = buildReminderResolutionPlan({
    notice: turnStart,
    items,
    outcome: "",
  });
  assert.equal(dismissed.status, "ready");
  assert.deepEqual(dismissed.operations, []);
  assert.equal(
    dismissed.metadataPatches[0].fields.reminderResolutions.value[turnStart.activationId].outcome,
    "",
  );
  assert.equal(stateOf(applied, "target-a").conditions.length, 1);
});

test("consume del reminder non lo ripropone al reload e sparisce con l'effect", () => {
  const applied = appliedConfusion();
  const items = reminderItems(applied);
  const [turnStart] = planEffectSaveReminderNotices({
    items,
    ...targetBoundary(0, 1),
  }).filter((notice) => notice.timing === "turn-start");
  const dismissed = buildReminderResolutionPlan({
    notice: turnStart,
    items,
    outcome: "",
  });
  const marker = dismissed.metadataPatches[0].fields.reminderResolutions.value;
  const reloadedItems = items.map((item) => item.id === "target-a"
    ? {
      ...item,
      metadata: {
        ...item.metadata,
        [META_KEY]: {
          ...item.metadata[META_KEY],
          reminderResolutions: marker,
        },
      },
    }
    : item);

  assert.deepEqual(planEffectSaveReminderNotices({
    items: reloadedItems,
    ...targetBoundary(0, 1),
  }), []);

  const ended = buildEffectsMutationPlan(applied.states, [{
    type: "condition:remove-instances",
    removals: [{ itemId: "target-a", instanceId: "confusion-cast:condition:1:target-a" }],
  }]);
  assert.deepEqual(planEffectSaveReminderNotices({
    items: reminderItems(ended),
    ...targetBoundary(0, 1),
  }), []);
});

test("TS di Confusione: fallimento mantiene, successo pulisce solo il target e la concentrazione pulisce il resto", () => {
  const applied = appliedConfusion();
  const items = reminderItems(applied);
  const notices = planEffectSaveReminderNotices({
    items,
    ...targetBoundary(1, 2),
  });
  const turnEnd = notices.find((notice) => notice.timing === "turn-end");

  assert.ok(turnEnd);
  assert.equal(turnEnd.target.id, "target-a");
  assert.equal(turnEnd.saveLabel, "TS Saggezza CD 15");
  assert.match(turnEnd.instruction, /termina Confusione/u);

  const failed = buildReminderResolutionPlan({
    notice: turnEnd,
    items,
    outcome: REMINDER_OUTCOMES.FAILED,
  });
  assert.equal(failed.status, "ready");
  assert.equal(failed.operations.some((operation) => operation.type === "condition:remove-instances"), false);
  const afterFailed = buildEffectsMutationPlan(applied.states, failed.operations);
  assert.equal(stateOf(afterFailed, "target-a").conditions.length, 1);
  assert.equal(stateOf(afterFailed, "target-a").spells.length, 1);

  const passed = buildReminderResolutionPlan({
    notice: turnEnd,
    items,
    outcome: REMINDER_OUTCOMES.PASSED,
  });
  assert.equal(passed.status, "ready");
  const afterPassed = buildEffectsMutationPlan(applied.states, passed.operations);
  assert.deepEqual(stateOf(afterPassed, "target-a").conditions, []);
  assert.deepEqual(stateOf(afterPassed, "target-a").spells, []);
  assert.equal(stateOf(afterPassed, "target-b").conditions.length, 1);
  assert.equal(stateOf(afterPassed, "target-b").spells.length, 1);
  assert.deepEqual(
    stateOf(afterPassed, "caster").concentrations.confusione.targets,
    ["target-b"],
  );

  const afterConcentration = buildEffectsMutationPlan(afterPassed.states, [{
    type: "concentration:break",
    casterIds: ["caster"],
  }]);
  assert.deepEqual(stateOf(afterConcentration, "target-b").conditions, []);
  assert.deepEqual(stateOf(afterConcentration, "target-b").spells, []);
});
