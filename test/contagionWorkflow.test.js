import test from "node:test";
import assert from "node:assert/strict";

import { ID } from "../src/constants.js";
import { buildEffectsMutationPlan } from "../src/effectsMutationCore.js";
import { effectSaveReminderNoticesForDamage, planEffectSaveReminderNotices } from "../src/effectSaveReminderCore.js";
import { effectSummaryPartsFor } from "../src/effectLabelCore.js";
import {
  advanceRepeatedSaveProgress,
  repeatedSaveProgressLabel,
} from "../src/repeatedSaveProgressCore.js";
import {
  buildReminderResolutionPlan,
} from "../src/reminderResolutionCore.js";
import {
  buildSpellApplicationIntent,
  buildSpellApplicationPlan,
} from "../src/spellApplicationPlanCore.js";
import {
  CONTAGION_DISEASES,
  contagionReminderForInstance,
} from "../src/contagionRules.js";
import {
  getSpellAttackResolution,
  getSpellDefinition,
  getSpellEffectChoices,
  getSpellEffects,
} from "../src/spells-srd.js";
import {
  buildSpellUnifiedPanelContract,
  SPELL_UNIFIED_TARGETING_MODES,
} from "../src/spellUnifiedPanelCore.js";
import { __compactEffectItems } from "../src/initiativeCardCompact.js";

const META_KEY = `${ID}/meta`;
const SPELLS_KEY = `${ID}/spells`;
const STATE_KEY = `${ID}/state`;

function source({ id = "caster", spellSaveDC = 17 } = {}) {
  return {
    id,
    name: "Mago",
    metadata: {
      [META_KEY]: {
        initiativeCard: { spellSaveDC },
      },
    },
  };
}

function parentSpell(instanceId, casterId = "caster") {
  return {
    id: `${instanceId}:spell`,
    name: "Contagio",
    spellId: "contagion",
    instanceId,
    casterId,
    conc: false,
    turns: 100800,
    expiry: { mode: "rounds", remaining: 100800 },
  };
}

function diseaseInstance({
  diseaseId = "viscous-devastation",
  id = "contagion-effect-1",
  parentEffectId = "contagion-parent-1",
  targetId = "target",
  sourceId = "caster",
  successes = 0,
  failures = 0,
  snapshotDC = null,
} = {}) {
  const spell = getSpellDefinition("contagion");
  const choice = getSpellEffects(spell, diseaseId)[0];
  const progress = {
    successes,
    failures,
    successThreshold: 3,
    failureThreshold: 3,
  };
  const reminder = Array.isArray(choice.saveReminder)
    ? choice.saveReminder.map((entry) => ({
      ...entry,
      ...(snapshotDC === null || entry.ability !== "con" ? {} : { dc: snapshotDC }),
    }))
    : choice.saveReminder;
  return {
    id,
    condition: choice.label,
    active: true,
    targetId,
    sourceId,
    sourceName: "Mago",
    parentEffectId,
    type: "spell",
    effectId: choice.id,
    effectKind: "debuff",
    ...(choice.displayLabel ? { displayLabel: choice.displayLabel } : {}),
    effectDetail: `${choice.detail} Progressione: ${repeatedSaveProgressLabel(progress)}.`,
    mechanics: {
      ...choice.mechanics,
      contagionDiseaseId: diseaseId,
      repeatedSaveProgress: progress,
    },
    summaryParts: [
      { ...choice.summaryParts[0] },
      { id: "contagion-progress", label: repeatedSaveProgressLabel(progress) },
    ],
    saveReminder: reminder,
    expiry: { mode: "rounds", remaining: 100800 },
    manualRemoval: true,
    endsParentOnRemoval: true,
    parentRemoval: "target",
  };
}

function target({ id = "target", instance = null, parentId = "contagion-parent-1" } = {}) {
  return {
    id,
    name: id === "target" ? "Bersaglio" : "Altro bersaglio",
    metadata: {
      [META_KEY]: {
        [SPELLS_KEY]: [parentSpell(parentId)],
        conditions: { version: 2, instances: instance ? [instance] : [] },
      },
    },
  };
}

function canonicalState(item) {
  const meta = item?.metadata?.[META_KEY] || {};
  return {
    id: item.id,
    name: item.name,
    spells: structuredClone(meta[SPELLS_KEY] || []),
    concentrations: {},
    conditions: structuredClone(meta.conditions?.instances || []),
  };
}

function preparedOperations(operations, prefix = "contagion") {
  return operations.map((operation, index) => {
    if (operation.type !== "condition:add") return { ...operation, operationId: `${prefix}:${index}` };
    const targetIds = Array.isArray(operation.targetIds) ? operation.targetIds : [];
    return {
      ...operation,
      operationId: `${prefix}:${index}`,
      createdAt: 100 + index,
      instanceIds: Object.fromEntries(targetIds.map((id) => [id, `${prefix}:condition:${id}`])),
    };
  });
}

function turnEndNotice(items) {
  return planEffectSaveReminderNotices({
    items,
    previousInitiativeState: {
      order: ["caster", "target"],
      current: 1,
      round: 1,
    },
    initiativeState: {
      order: ["caster", "target"],
      current: 0,
      round: 2,
    },
    includeCurrentTurnStart: false,
  }).find((notice) => notice.target?.id === "target");
}

test("Contagio usa il lifecycle persistente standard: un target, Contatto manuale, scelta obbligatoria, nessun attacco automatico", () => {
  const spell = getSpellDefinition("contagion");
  const contract = buildSpellUnifiedPanelContract({ spell });
  assert.equal(contract.presentation.targeting.mode, SPELL_UNIFIED_TARGETING_MODES.DISCRETE);
  assert.equal(contract.presentation.targeting.limit.maximum, 1);
  assert.equal(contract.presentation.targeting.spatialRules.label, "Portata: Contatto · verifica manuale");
  assert.equal(contract.presentation.caster.required, true);
  assert.equal(contract.presentation.inputs.variant.required, true);
  assert.equal(contract.presentation.inputs.outcomes.visible, false);
  assert.equal(getSpellAttackResolution(spell), null);

  const intent = buildSpellApplicationIntent({
    spell,
    casterId: "caster",
    targetIds: ["target"],
    turns: 100800,
    selectedChoice: "viscous-devastation",
    castContext: { spellSaveDC: 17 },
  });
  const plan = buildSpellApplicationPlan({
    intent,
    instanceId: "contagion-parent-1",
    casterName: "Mago",
  });
  const parent = plan.operations.find((operation) => operation.type === "spell:upsert");
  const disease = plan.operations.find((operation) => operation.type === "condition:add");
  assert.equal(parent.conc, false);
  assert.equal(parent.turns, 100800);
  assert.equal(parent.instanceId, "contagion-parent-1");
  assert.equal(disease.options.parentEffectId, "contagion-parent-1");
  assert.deepEqual(disease.options.summaryParts.map((part) => part.label), [
    "Devastazione vischiosa",
    "S 0/3 · F 0/3",
  ]);
  assert.equal(disease.options.saveReminder[0].dc, 17);
  assert.equal(plan.attackResolution, null);
});

test("le sei malattie sono scelte singole e producono descriptor RAW distinti", () => {
  const spell = getSpellDefinition("contagion");
  const choices = getSpellEffectChoices(spell);
  assert.deepEqual(choices.map((choice) => choice.label), CONTAGION_DISEASES.map((disease) => disease.label));
  for (const choice of choices) {
    const effect = getSpellEffects(spell, choice.value)[0];
    assert.equal(effect.mechanics.contagionDiseaseId, choice.value);
    assert.match(effect.detail, /S 0\/3 · F 0\/3/u);
    assert.match(effect.detail, /TS Costituzione/u);
    assert.equal(effect.summaryParts.length, 2);
  }

  const blind = getSpellEffects(spell, "blinding-sickness")[0];
  assert.equal(blind.label, "Accecato");
  assert.equal(blind.mechanics.canonicalCondition, "Accecato");
  assert.equal(blind.displayLabel, "Contagio · Infermità accecante");

  const mindFire = getSpellEffects(spell, "mind-fire")[0];
  assert.equal(mindFire.saveReminder.some((reminder) => reminder.ability === "wis"), false);
  assert.match(mindFire.saveReminder.find((reminder) => reminder.timing === "turn-start").label, /fisicamente il d10/u);
  const viscous = getSpellEffects(spell, "viscous-devastation")[0];
  assert.equal(viscous.saveReminder.some((reminder) => reminder.timing === "damage"), true);
  assert.equal(viscous.saveReminder.find((reminder) => reminder.timing === "damage").resolution.mode, "choice");
});

test("il core shared conta successi/fallimenti non consecutivi e blocca il quarto risultato terminale", () => {
  let progress = { successes: 0, failures: 0 };
  for (const outcome of ["failed", "passed", "failed", "passed", "failed"]) {
    progress = advanceRepeatedSaveProgress(progress, outcome).progress;
  }
  const terminal = advanceRepeatedSaveProgress(progress, "failed");
  assert.deepEqual(
    { successes: progress.successes, failures: progress.failures },
    { successes: 2, failures: 3 },
  );
  assert.equal(terminal.terminal, "failure");
  assert.equal(terminal.changed, false);
  assert.equal(repeatedSaveProgressLabel(progress), "S 2/3 · F 3/3");
});

test("il reminder COS aggiorna la stessa disease instance, termina a S3 e stabilizza a F3", () => {
  const first = diseaseInstance({ successes: 0, failures: 0 });
  const initial = turnEndNotice([source(), target({ instance: first })]);
  assert.ok(initial);
  assert.equal(initial.dc, 17);
  assert.match(initial.instruction, /S 0\/3 · F 0\/3/u);

  const passedResolution = buildReminderResolutionPlan({
    notice: initial,
    items: [source(), target({ instance: first })],
    outcome: "passed",
  });
  assert.equal(passedResolution.status, "ready");
  const progressedMutation = buildEffectsMutationPlan(
    [canonicalState(source()), canonicalState(target({ instance: first }))],
    preparedOperations(passedResolution.operations, "contagion-pass"),
  );
  const progressed = progressedMutation.states.find((state) => state.id === "target");
  assert.deepEqual(
    progressed.conditions[0].mechanics.repeatedSaveProgress,
    { successes: 1, failures: 0, successThreshold: 3, failureThreshold: 3 },
  );
  assert.deepEqual(effectSummaryPartsFor(progressed.conditions[0]).map((part) => part.label), [
    "Devastazione vischiosa",
    "S 1/3 · F 0/3",
  ]);

  const terminalSuccess = diseaseInstance({ successes: 2, failures: 1 });
  const terminalNotice = turnEndNotice([source(), target({ instance: terminalSuccess })]);
  const successPlan = buildReminderResolutionPlan({
    notice: terminalNotice,
    items: [source(), target({ instance: terminalSuccess })],
    outcome: "passed",
  });
  const successMutation = buildEffectsMutationPlan(
    [canonicalState(source()), canonicalState(target({ instance: terminalSuccess }))],
    preparedOperations(successPlan.operations, "contagion-terminal-success"),
  );
  const successTarget = successMutation.states.find((state) => state.id === "target");
  assert.deepEqual(successTarget.spells, []);
  assert.deepEqual(successTarget.conditions, []);

  const terminalFailure = diseaseInstance({ successes: 1, failures: 2 });
  const failureNotice = turnEndNotice([source(), target({ instance: terminalFailure })]);
  const failurePlan = buildReminderResolutionPlan({
    notice: failureNotice,
    items: [source(), target({ instance: terminalFailure })],
    outcome: "failed",
  });
  const failureMutation = buildEffectsMutationPlan(
    [canonicalState(source()), canonicalState(target({ instance: terminalFailure }))],
    preparedOperations(failurePlan.operations, "contagion-terminal-failure"),
  );
  const failureTarget = failureMutation.states.find((state) => state.id === "target");
  assert.equal(failureTarget.spells.length, 1);
  assert.equal(failureTarget.conditions[0].mechanics.repeatedSaveProgress.failures, 3);
  assert.deepEqual(failureTarget.conditions[0].summaryParts, [
    { id: "contagion-terminal-name:viscous-devastation", label: "Devastazione vischiosa", stack: true },
    { id: "contagion-terminal-debuff:viscous-devastation", label: "Cos − / TS Cos − / Danni → Stordito", stack: true },
  ]);
  assert.equal(turnEndNotice([
    source(),
    {
      ...target({ instance: failureTarget.conditions[0] }),
      metadata: {
        [META_KEY]: {
          [SPELLS_KEY]: failureTarget.spells,
          conditions: { version: 2, instances: failureTarget.conditions },
        },
      },
    },
  ]), undefined);
});

test("il cleanup di S3 è identity/target-scoped e non tocca un'altra istanza", () => {
  const first = diseaseInstance({
    id: "contagion-effect-first",
    parentEffectId: "contagion-parent-first",
    successes: 2,
    failures: 0,
  });
  const second = diseaseInstance({
    id: "contagion-effect-second",
    parentEffectId: "contagion-parent-second",
    targetId: "other",
    successes: 0,
    failures: 1,
  });
  const firstTarget = target({ id: "target", instance: first, parentId: "contagion-parent-first" });
  const secondTarget = target({ id: "other", instance: second, parentId: "contagion-parent-second" });
  const notice = turnEndNotice([source(), firstTarget, secondTarget]);
  const plan = buildReminderResolutionPlan({
    notice,
    items: [source(), firstTarget, secondTarget],
    outcome: "passed",
  });
  const mutation = buildEffectsMutationPlan(
    [canonicalState(source()), canonicalState(firstTarget), canonicalState(secondTarget)],
    preparedOperations(plan.operations, "contagion-scoped"),
  );
  const untouched = mutation.states.find((state) => state.id === "other");
  assert.equal(mutation.states.find((state) => state.id === "target").spells.length, 0);
  assert.equal(untouched.spells.length, 1);
  assert.equal(untouched.conditions.length, 1);
});

test("rimozione del caster non rende stale il TS quando la CD è snapshot sull'effect", () => {
  const instance = diseaseInstance({ snapshotDC: 17 });
  const notice = turnEndNotice([target({ instance })]);
  assert.ok(notice);
  assert.equal(notice.dc, 17);
  const plan = buildReminderResolutionPlan({
    notice,
    items: [target({ instance })],
    outcome: "failed",
  });
  assert.equal(plan.status, "ready");
});

test("Devastazione vischiosa usa il damage reminder shared per Stordito e la scadenza next-turn", () => {
  const instance = diseaseInstance();
  const targetItem = target({ instance });
  const notices = effectSaveReminderNoticesForDamage({
    items: [source(), targetItem],
    damageById: new Map([["target", 5]]),
    eventId: "damage-1",
  });
  assert.equal(notices.length, 1);
  assert.equal(notices[0].resolution.mode, "choice");
  assert.match(notices[0].instruction, /Stordito/u);

  const resolution = buildReminderResolutionPlan({
    notice: notices[0],
    items: [source(), targetItem],
    outcome: "passed",
    sceneMetadata: {
      [STATE_KEY]: {
        order: ["target", "other"],
        current: 0,
        round: 1,
      },
    },
  });
  assert.equal(resolution.status, "ready");
  const add = resolution.operations.find((operation) => operation.type === "condition:add");
  assert.equal(add.conditionName, "Stordito");
  assert.equal(add.options.expiry.anchor, "next-turn");
  assert.equal(add.options.appliedAt.turnKey, "1:0:target");

  const mutation = buildEffectsMutationPlan(
    [canonicalState(source()), canonicalState(targetItem)],
    preparedOperations(resolution.operations, "contagion-damage"),
  );
  const afterDamage = mutation.states.find((state) => state.id === "target");
  const stunned = afterDamage.conditions.find((condition) => condition.condition === "Stordito");
  assert.ok(stunned);
  assert.equal(stunned.expiry.anchor, "next-turn");
  assert.equal(stunned.appliedAt.turnKey, "1:0:target");

  const afterCurrentTurn = buildEffectsMutationPlan(mutation.states, [{
    type: "effects:tick-boundaries",
    targetIds: ["target"],
    boundaries: [{ phase: "end", actorId: "target", turnKey: "1:0:target" }],
  }]);
  assert.ok(afterCurrentTurn.states.find((state) => state.id === "target").conditions.some((condition) => condition.condition === "Stordito"));
  const afterNextTurn = buildEffectsMutationPlan(afterCurrentTurn.states, [{
    type: "effects:tick-boundaries",
    targetIds: ["target"],
    boundaries: [{ phase: "end", actorId: "target", turnKey: "2:0:target" }],
  }]);
  assert.equal(afterNextTurn.states.find((state) => state.id === "target").conditions.some((condition) => condition.condition === "Stordito"), false);
});

test("la card iniziativa riceve le summaryParts dinamiche dalla stessa effect instance", () => {
  const instance = diseaseInstance({ successes: 1, failures: 2 });
  const parts = __compactEffectItems(
    [instance],
    [parentSpell("contagion-parent-1")],
    false,
  ).find((entry) => entry.kind === "spell")?.summaryParts;
  assert.deepEqual(parts.map((part) => part.label), [
    "Devastazione vischiosa",
    "S 1/3 · F 2/3",
  ]);
});
