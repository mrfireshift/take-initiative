import assert from "node:assert/strict";
import test from "node:test";

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
const SPELL_ID = "fear";
const SPELL_INSTANCE_ID = "fear-cast";
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
    const operationId = `fear-operation-${index}`;
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

function state(plan, id) {
  return plan.states.find((entry) => entry.id === id);
}

function fearResolution(outcomes) {
  return resolveSaveSpellResolution({
    spell,
    casterId: "caster",
    targetIds: Object.keys(outcomes),
    outcomes,
    automation,
    validateSpatial: false,
  });
}

function appliedFear(outcomes = {
  "target-a": SAVE_OUTCOME_FAILED,
  "target-b": SAVE_OUTCOME_FAILED,
}) {
  const resolution = fearResolution(outcomes);
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
      },
    },
  }));
}

const SAVE_OUTCOME_FAILED = REMINDER_OUTCOMES.FAILED;

test("Paura applica Spaventato e fuga solo ai fallimenti iniziali", () => {
  const applied = appliedFear({
    "target-a": SAVE_OUTCOME_FAILED,
    "target-b": REMINDER_OUTCOMES.PASSED,
    "target-c": REMINDER_OUTCOMES.IMMUNE,
  });
  const failed = state(applied, "target-a");

  assert.deepEqual(
    failed.conditions.map((instance) => instance.condition),
    ["Spaventato", "Paura: deve fuggire"],
  );
  assert.equal(failed.conditions.every((instance) => instance.parentEffectId === SPELL_INSTANCE_ID), true);
  assert.equal(failed.spells.length, 1);
  assert.deepEqual(state(applied, "target-b").conditions, []);
  assert.deepEqual(state(applied, "target-b").spells, []);
  assert.deepEqual(state(applied, "target-c").conditions, []);
  assert.deepEqual(state(applied, "target-c").spells, []);
});

test("Paura espone drop iniziale, regola turn-start e summaryParts senza automazioni nuove", () => {
  const forcedFlight = automation.failed.find((rule) => rule.effectId === "fear-forced-flight");
  const frightened = automation.failed.find((rule) => rule.condition === "Spaventato");

  assert.ok(forcedFlight);
  assert.match(forcedFlight.effectDetail, /fallimento iniziale/u);
  assert.match(forcedFlight.effectDetail, /lascia cadere ciò che impugna/u);
  assert.match(forcedFlight.effectDetail, /Scatto/u);
  assert.match(forcedFlight.effectDetail, /percorso disponibile più sicuro/u);
  assert.match(forcedFlight.effectDetail, /non abbia un luogo verso cui muoversi/u);
  assert.match(forcedFlight.effectDetail, /drop avviene una sola volta/u);
  assert.match(forcedFlight.effectDetail, /solo se il caster non è in vista/u);
  assert.deepEqual(forcedFlight.saveReminder, {
    timing: "turn-start",
    mode: "consume",
    label: "Nel tuo turno usa Scatto e allontanati dal caster lungo il percorso più sicuro, se hai un luogo verso cui muoverti.",
  });
  assert.equal(forcedFlight.saveReminder.dice, undefined);
  assert.equal(forcedFlight.attackLimit, undefined);
  assert.equal(forcedFlight.spellCastingInterception, undefined);
  assert.equal(frightened.saveReminder.ability, "wis");
  assert.equal(
    frightened.saveReminder.label,
    "Effettua questo TS solo se il caster non è in vista. Se lo supera, termina Paura su di sé.",
  );
  assert.deepEqual(forcedFlight.summaryParts, [
    { id: "fear-flight", label: "Scatto: allontanati dal caster" },
  ]);

  assert.deepEqual(effectSummaryPartsFor({ effectId: "fear-forced-flight" }), [
    { id: "fear-flight", label: "Scatto: allontanati dal caster" },
  ]);
});

test("il reminder turn-start è consumabile, non rimuove Paura e sparisce con l'effetto", () => {
  const applied = appliedFear();
  const items = reminderItems(applied);
  const notices = planEffectSaveReminderNotices({
    items,
    previousInitiativeState: {
      order: ["caster", "target-a", "target-b"],
      current: 0,
      round: 1,
    },
    initiativeState: {
      order: ["caster", "target-a", "target-b"],
      current: 1,
      round: 1,
    },
    includeCurrentTurnStart: false,
  });
  const reminder = notices.find((notice) => notice.timing === "turn-start");

  assert.ok(reminder);
  assert.match(reminder.instruction, /Scatto/u);
  assert.match(reminder.instruction, /allontanati dal caster/u);
  assert.match(reminder.instruction, /percorso più sicuro/u);
  assert.equal(reminder.resolution.mode, "consume");

  const dismissed = buildReminderResolutionPlan({
    notice: reminder,
    items,
    outcome: "",
  });
  assert.equal(dismissed.status, "ready");
  assert.deepEqual(dismissed.operations, []);
  assert.equal(state(buildEffectsMutationPlan(applied.states, dismissed.operations), "target-a").conditions.length, 2);

  const ended = buildEffectsMutationPlan(applied.states, [{
    type: "condition:remove-instances",
    removals: [{ itemId: "target-a", instanceId: "fear-cast:condition:1:target-a" }],
  }]);
  const afterEnd = reminderItems(ended);
  assert.deepEqual(
    planEffectSaveReminderNotices({
      items: afterEnd,
      previousInitiativeState: {
        order: ["caster", "target-a", "target-b"],
        current: 0,
        round: 1,
      },
      initiativeState: {
        order: ["caster", "target-a", "target-b"],
        current: 1,
        round: 1,
      },
      includeCurrentTurnStart: false,
    }),
    [],
  );
});

test("il TS di Paura conserva il target se fallisce e pulisce solo quel target se passa", () => {
  const applied = appliedFear();
  const items = reminderItems(applied);
  const notices = planEffectSaveReminderNotices({
    items,
    previousInitiativeState: {
      order: ["caster", "target-a", "target-b"],
      current: 1,
      round: 1,
    },
    initiativeState: {
      order: ["caster", "target-a", "target-b"],
      current: 2,
      round: 1,
    },
    includeCurrentTurnStart: false,
  });
  const reminder = notices.find((notice) => notice.timing === "turn-end");

  assert.ok(reminder);
  assert.equal(reminder.target.id, "target-a");
  assert.equal(
    reminder.instruction,
    "Effettua questo TS solo se il caster non è in vista. Se lo supera, termina Paura su di sé.",
  );

  const failed = buildReminderResolutionPlan({
    notice: reminder,
    items,
    outcome: REMINDER_OUTCOMES.FAILED,
  });
  assert.equal(failed.status, "ready");
  assert.equal(failed.operations.some((operation) => operation.type === "condition:remove-instances"), false);
  const afterFailed = buildEffectsMutationPlan(applied.states, failed.operations);
  assert.equal(state(afterFailed, "target-a").conditions.length, 2);
  assert.equal(state(afterFailed, "target-a").spells.length, 1);

  const passed = buildReminderResolutionPlan({
    notice: reminder,
    items,
    outcome: REMINDER_OUTCOMES.PASSED,
  });
  assert.equal(passed.status, "ready");
  const afterPassed = buildEffectsMutationPlan(applied.states, passed.operations);
  assert.deepEqual(state(afterPassed, "target-a").conditions, []);
  assert.deepEqual(state(afterPassed, "target-a").spells, []);
  assert.equal(state(afterPassed, "target-b").conditions.length, 2);
  assert.equal(state(afterPassed, "target-b").spells.length, 1);
  assert.deepEqual(
    state(afterPassed, "caster").concentrations.paura.targets,
    ["target-b"],
  );

  const afterConcentration = buildEffectsMutationPlan(afterPassed.states, [{
    type: "concentration:break",
    casterIds: ["caster"],
  }]);
  assert.deepEqual(state(afterConcentration, "target-b").conditions, []);
  assert.deepEqual(state(afterConcentration, "target-b").spells, []);
});
