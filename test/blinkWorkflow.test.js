import assert from "node:assert/strict";
import test from "node:test";

import { ID } from "../src/constants.js";
import {
  BLINK_RAW,
  blinkCastContextForState,
  blinkInitialCastContext,
  blinkSemanticDetail,
  blinkStateFromCastContext,
  buildBlinkReturnOperations,
  buildBlinkRollStateOperation,
  validateBlinkReturnPlacement,
} from "../src/blinkRules.js";
import { buildEffectsMutationPlan } from "../src/effectsMutationCore.js";
import { planEffectSaveReminderNotices } from "../src/effectSaveReminderCore.js";
import { buildHistoryUndoPlan } from "../src/historyUndoCore.js";
import { buildReminderResolutionPlan } from "../src/reminderResolutionCore.js";
import { buildSpellApplicationIntent, buildSpellApplicationPlan } from "../src/spellApplicationPlanCore.js";
import { getSpellDefinition, getSpellSummaryParts } from "../src/spells-srd.js";
import {
  buildSpellActiveActionPlan,
  getSpellOverviewActions,
} from "../src/spellActiveActionCore.js";

const META_KEY = `${ID}/meta`;
const SPELLS_KEY = `${ID}/spells`;
const REMINDER_RESOLUTIONS_FIELD = "reminderResolutions";

function item(id, spells = [], position = { x: 100, y: 100 }, metadata = {}) {
  return {
    id,
    name: id === "caster" ? "Mago" : id,
    position,
    spells,
    concentrations: {},
    conditions: [],
    metadata: {
      [META_KEY]: {
        [SPELLS_KEY]: spells,
        ...metadata,
      },
    },
  };
}

function blinkEntry({
  instanceId = "blink-1",
  turns = 10,
  castTurnKey = "1:0:caster",
  state = null,
  pendingTermination = null,
} = {}) {
  const baseContext = blinkInitialCastContext({
    slotLevel: 3,
    phase: "cast",
    customField: "preserved",
  });
  return {
    id: `${instanceId}:entry`,
    name: "Intermittenza",
    spellId: "blink",
    instanceId,
    casterId: "caster",
    casterName: "Mago",
    turns,
    conc: false,
    appliedAt: { round: 1, actorId: "caster", turnKey: castTurnKey },
    castContext: state
      ? blinkCastContextForState(baseContext, state)
      : baseContext,
    ...(pendingTermination ? { pendingTermination } : {}),
  };
}

function state(plan, id = "caster") {
  return plan.states.find((entry) => entry.id === id);
}

function boundaryStates() {
  return {
    previousState: {
      order: ["caster", "other"],
      current: 0,
      round: 1,
    },
    nextState: {
      order: ["caster", "other"],
      current: 0,
      round: 2,
    },
  };
}

function turnEndNotice(items, previous = { order: ["caster", "other"], current: 0, round: 1 }, next = { order: ["caster", "other"], current: 1, round: 1 }) {
  return planEffectSaveReminderNotices({
    items,
    previousInitiativeState: previous,
    initiativeState: next,
    includeCurrentTurnStart: false,
  }).find((notice) => notice.spellId === "blink" && notice.timing === "turn-end");
}

function returnNotice(items, initiativeState = { order: ["caster", "other"], current: 0, round: 2 }) {
  return planEffectSaveReminderNotices({
    items,
    previousInitiativeState: null,
    initiativeState,
    includeCurrentTurnStart: false,
  }).find((notice) => notice.spellId === "blink" && notice.timing === "turn-start");
}

function applyResolution(items, notice, outcome, extra = {}) {
  return buildReminderResolutionPlan({
    notice,
    items,
    outcome,
    ...extra,
  });
}

test("RAW e cast di Intermittenza conservano il contratto minimo nella parent instance", () => {
  assert.equal(BLINK_RAW.id, "blink");
  assert.equal(BLINK_RAW.name, "Intermittenza");
  assert.equal(BLINK_RAW.level, 3);
  assert.equal(BLINK_RAW.school, "Trasmutazione");
  assert.equal(BLINK_RAW.castingTime, "1 azione");
  assert.equal(BLINK_RAW.range, "Incantatore");
  assert.equal(BLINK_RAW.duration, "1 minuto");
  assert.equal(BLINK_RAW.concentration, false);
  assert.match(BLINK_RAW.description, /pari o superiore a 11/u);
  assert.match(BLINK_RAW.description, /18 metri/u);
  assert.match(BLINK_RAW.description, /Con un'azione/u);

  const spell = getSpellDefinition("blink");
  const intent = buildSpellApplicationIntent({
    spell,
    casterId: "caster",
    targetIds: ["caster"],
    turns: 10,
    castContext: { slotLevel: 3, customField: "preserved" },
  });
  const application = buildSpellApplicationPlan({
    intent,
    instanceId: "blink-1",
    appliedAt: { round: 1, actorId: "caster", turnKey: "1:0:caster" },
    casterName: "Mago",
  });
  const upsert = application.operations.find((operation) => operation.type === "spell:upsert");

  assert.equal(spell.level, 3);
  assert.equal(spell.range, "Self");
  assert.equal(spell.duration, "1 minute");
  assert.equal(spell.concentration, false);
  assert.equal(intent.wantsConcentration, false);
  assert.equal(upsert.turns, 10);
  assert.equal(upsert.conc, false);
  assert.equal(upsert.castContext.slotLevel, 3);
  assert.equal(upsert.castContext.blink.plane, "material");
  assert.equal(upsert.castContext.blink.departurePosition, null);
  assert.equal(upsert.castContext.customField, "preserved");
  assert.equal(upsert.castContext.terminalResolution.kind, "blink-return");
  assert.deepEqual(upsert.summaryParts || [], []);
  assert.ok(upsert.castContext.turnBoundaryNotices.some((descriptor) => descriptor.id === "blink-turn-end"));
  assert.ok(upsert.castContext.turnBoundaryNotices.some((descriptor) => descriptor.id === "blink-turn-start-return"));
});

test("il primo prompt è alla fine del turno del cast e usa solo l'esito del d20 fisico", () => {
  const entry = blinkEntry();
  const items = [item("caster", [entry]), item("other")];
  const notice = turnEndNotice(items);

  assert.ok(notice);
  assert.equal(notice.activationId, "blink-1:blink-turn-end:1:0:caster");
  assert.equal(notice.timing, "turn-end");
  assert.equal(notice.target.id, "caster");
  assert.equal(notice.resolution.activation.kind, "spell-turn-boundary");
  assert.equal(notice.resolution.activation.instanceId, "blink-1");
  assert.deepEqual(
    notice.resolution.choiceLabels,
    { passed: "1–10 · Rimane", failed: "11+ · Piano Etereo" },
  );
  assert.match(notice.instruction, /fisicamente un d20/u);
  assert.equal(notice.dice, undefined);
  assert.equal(notice.resolution.activation.resolutionData.kind, "blink-roll");

  const duplicateBoundary = turnEndNotice(items);
  assert.equal(duplicateBoundary.activationId, notice.activationId);
});

test("1–10 non crea rumore; 11+ salva la posizione corrente e isola la transition per instanceId", () => {
  const entry = blinkEntry();
  const items = [item("caster", [entry])];
  const notice = turnEndNotice(items, {
    order: ["caster", "other"],
    current: 0,
    round: 1,
  }, {
    order: ["caster", "other"],
    current: 1,
    round: 1,
  });

  const stays = applyResolution(items, notice, "passed");
  assert.equal(stays.status, "ready");
  assert.deepEqual(stays.operations, []);
  assert.deepEqual(stays.damage, { roll: 0, factor: "zero", amount: 0 });

  const failed = applyResolution(items, notice, "failed");
  assert.equal(failed.status, "ready");
  assert.deepEqual(failed.damage, { roll: 0, factor: "zero", amount: 0 });
  assert.equal(failed.operations.length, 1);
  const etherealPlan = buildEffectsMutationPlan(items, failed.operations);
  const ethereal = state(etherealPlan).spells[0];
  const etherealState = blinkStateFromCastContext(ethereal.castContext);
  assert.equal(etherealState.plane, "ethereal");
  assert.deepEqual(etherealState.departurePosition, { x: 100, y: 100 });
  assert.equal(etherealState.departureTurnKey, "1:0:caster");
  assert.deepEqual(etherealPlan.states[0].position, undefined);
  assert.equal(ethereal.summaryParts[0].label, "Etereo");

  const duplicateSubmit = buildEffectsMutationPlan(etherealPlan.states, failed.operations);
  assert.equal(duplicateSubmit.status, "conflict");
  assert.equal(state(duplicateSubmit).spells[0].instanceId, "blink-1");
});

test("il boundary finale posticipa l'expiry, conserva il notice in reload e riprende il cleanup", () => {
  const entry = blinkEntry({ turns: 1 });
  const initial = [item("caster", [entry])];
  const { previousState, nextState } = boundaryStates();
  const deferred = buildEffectsMutationPlan(initial, [{
    type: "effects:tick-round",
    targetIds: ["caster"],
    delta: -1,
    boundaries: [{ mode: "turn-end", actorId: "caster", turnKey: "1:0:caster" }],
    previousState,
    nextState,
    operationId: "blink-final-round",
  }]);
  const deferredEntry = state(deferred).spells[0];
  assert.equal(deferredEntry.turns, 0);
  assert.equal(deferredEntry.castContext.pendingTurnBoundary.activationId, "blink-1:blink-turn-end:1:0:caster");

  const reloadedNotice = returnNotice([item("caster", [deferredEntry])], nextState);
  assert.equal(reloadedNotice, undefined);
  const pendingNotice = planEffectSaveReminderNotices({
    items: [item("caster", [deferredEntry])],
    previousInitiativeState: null,
    initiativeState: null,
    includeCurrentTurnStart: false,
  }).find((notice) => notice.activationId === "blink-1:blink-turn-end:1:0:caster");
  assert.ok(pendingNotice);

  const passed = applyResolution([item("caster", [deferredEntry])], pendingNotice, "passed");
  assert.ok(passed.operations.some((operation) => operation.type === "spell:remove-instance"));
  const expired = buildEffectsMutationPlan([item("caster", [deferredEntry])], passed.operations);
  assert.deepEqual(state(expired).spells, []);

  const failed = applyResolution([item("caster", [deferredEntry])], pendingNotice, "failed");
  const terminal = buildEffectsMutationPlan([item("caster", [deferredEntry])], failed.operations);
  assert.equal(terminal.pendingTerminations.length, 1);
  assert.equal(state(terminal).spells[0].pendingTermination.reason, "expiry");
  assert.equal(blinkStateFromCastContext(state(terminal).spells[0].castContext).plane, "ethereal");
});

test("il pass dell'ultimo turno persiste il boundary risolto e non riapre il prompt", () => {
  const entry = blinkEntry({ turns: 1 });
  const items = [item("caster", [entry])];
  const notice = turnEndNotice(items);
  const passed = applyResolution(items, notice, "passed");
  assert.equal(passed.status, "ready");
  assert.equal(passed.operations.length, 1);
  const resolved = buildEffectsMutationPlan(items, passed.operations);
  const resolvedEntry = state(resolved).spells[0];
  assert.equal(
    resolvedEntry.castContext.resolvedTurnBoundary.activationId,
    notice.activationId,
  );
  assert.equal(turnEndNotice([item("caster", [resolvedEntry])]), undefined);

  const roundTick = buildEffectsMutationPlan([item("caster", [resolvedEntry])], [{
    type: "effects:tick-round",
    targetIds: ["caster"],
    delta: -1,
    boundaries: [{ mode: "turn-end", actorId: "other", turnKey: "1:1:other" }],
    operationId: "blink-final-pass-round",
  }]);
  assert.deepEqual(state(roundTick).spells, []);
});

test("il ritorno al turno successivo usa departurePosition e lascia la destinazione al GM", () => {
  const entry = blinkEntry({
    state: {
      plane: "ethereal",
      departurePosition: { x: 100, y: 100 },
      departureTurnKey: "1:0:caster",
      returnTurnKey: "2:0:caster",
    },
  });
  const items = [item("caster", [entry])];
  const notice = returnNotice(items);

  assert.ok(notice);
  assert.equal(notice.activationId, "blink-1:blink-turn-start-return:2:0:caster");
  assert.equal(notice.resolution.activation.resolutionData.kind, "blink-return");
  assert.match(notice.instruction, /mappa/u);

  const chosenNotice = structuredClone(notice);
  chosenNotice.resolution.activation.resolutionData.returnPosition = { x: 150, y: 100 };
  const normal = applyResolution(items, chosenNotice, "passed", {
    gridDpi: 100,
    gridScale: { parsed: { multiplier: 1.5, unit: "m" } },
  });
  assert.equal(normal.status, "ready");
  assert.ok(normal.sideEffects.some((effect) => effect.type === "token:teleport"));
  const returned = buildEffectsMutationPlan(items, normal.operations);
  assert.equal(blinkStateFromCastContext(state(returned).spells[0].castContext).plane, "material");
  assert.equal(blinkStateFromCastContext(state(returned).spells[0].castContext).departurePosition, null);
  assert.equal(normal.sideEffects[0].position.x, 150);

  const gmChosenNotice = structuredClone(notice);
  gmChosenNotice.resolution.activation.resolutionData.returnPosition = { x: 350, y: 100 };
  const gmChosen = applyResolution(items, gmChosenNotice, "passed", {
    gridDpi: 100,
    gridScale: { parsed: { multiplier: 1.5, unit: "m" } },
  });
  assert.equal(gmChosen.status, "ready");
  assert.equal(gmChosen.errors?.length || 0, 0);
  assert.equal(gmChosen.sideEffects[0].position.x, 350);

  const tooFar = validateBlinkReturnPlacement({
    departurePosition: { x: 100, y: 100 },
    chosenPosition: { x: 350, y: 100 },
    dpi: 100,
    scale: { parsed: { multiplier: 1.5, unit: "m" } },
  });
  assert.equal(tooFar.valid, false);
  assert.ok(tooFar.errors.includes("blink-return-out-of-range"));
  const fallback = validateBlinkReturnPlacement({
    departurePosition: { x: 100, y: 100 },
    chosenPosition: { x: 350, y: 100 },
    dpi: 100,
    scale: { parsed: { multiplier: 1.5, unit: "m" } },
    fallback: true,
  });
  assert.equal(fallback.valid, true);
});

test("Undo Blink resta disponibile dopo il tick di round per cast, d20 e teleport", () => {
  const material10 = blinkEntry({ turns: 10 });
  const ethereal10 = blinkEntry({
    turns: 10,
    state: {
      plane: "ethereal",
      departurePosition: { x: 100, y: 100 },
      departureTurnKey: "1:0:caster",
      returnTurnKey: "2:0:caster",
    },
  });
  const ethereal9 = blinkEntry({
    turns: 9,
    state: {
      plane: "ethereal",
      departurePosition: { x: 100, y: 100 },
      departureTurnKey: "1:0:caster",
      returnTurnKey: "2:0:caster",
    },
  });
  const material9 = blinkEntry({ turns: 9 });
  const material8 = blinkEntry({ turns: 8 });
  const spellChange = (before, after) => ({
    id: "caster",
    fields: { spells: true },
    before: { spells: [before] },
    after: { spells: [after] },
  });
  const castEntry = {
    id: "blink-cast-history",
    effectsMutation: {
      changes: [{
        id: "caster",
        fields: { spells: true },
        before: { spells: [] },
        after: { spells: [material10] },
      }],
    },
  };
  const rollEntry = {
    id: "blink-roll-history",
    effectsMutation: { changes: [spellChange(material10, ethereal10)] },
  };
  const returnEntry = {
    id: "blink-return-history",
    effectsMutation: {
      changes: [spellChange(ethereal9, material9)],
      sideEffects: [{
        id: "caster",
        type: "token:teleport",
        operationId: "blink-return-history",
        beforePosition: { x: 100, y: 100 },
        afterPosition: { x: 150, y: 100 },
      }],
    },
  };
  const options = {
    metadataKey: META_KEY,
    effectKeys: {
      conditions: "conditions",
      spells: SPELLS_KEY,
      concentrations: `${ID}/concentration`,
    },
    normalizeConditions: (value) => Array.isArray(value) ? value : [],
  };

  const returnUndo = buildHistoryUndoPlan({
    sceneItems: [item("caster", [material8], { x: 150, y: 100 })],
    entryOrEntries: [returnEntry],
    ...options,
  });
  assert.equal(returnUndo.status, undefined);

  const rollUndo = buildHistoryUndoPlan({
    sceneItems: [item("caster", [ethereal9])],
    entryOrEntries: [rollEntry],
    ...options,
  });
  assert.equal(rollUndo.status, undefined);

  const throughUndo = buildHistoryUndoPlan({
    sceneItems: [item("caster", [material8], { x: 150, y: 100 })],
    entryOrEntries: [returnEntry, rollEntry, castEntry],
    ...options,
  });
  assert.equal(throughUndo.status, undefined);
  assert.deepEqual(
    throughUndo.finalItems.find((entry) => entry.id === "caster").item.metadata[META_KEY][SPELLS_KEY],
    [],
  );
});

test("il terminal gateway distingue Materiale/Etereo e il return resume rimuove la parent senza secondo store", () => {
  const material = buildEffectsMutationPlan([item("caster", [blinkEntry()])], [{
    type: "spell:remove-instance",
    targetIds: ["caster"],
    instanceId: "blink-1",
    reason: "manual",
  }]);
  assert.deepEqual(state(material).spells, []);
  assert.deepEqual(material.pendingTerminations || [], []);

  const etherealEntry = blinkEntry({
    state: {
      plane: "ethereal",
      departurePosition: { x: 100, y: 100 },
      departureTurnKey: "1:0:caster",
      returnTurnKey: null,
    },
  });
  const etherealRemoval = buildEffectsMutationPlan([item("caster", [etherealEntry])], [{
    type: "spell:remove-instance",
    targetIds: ["caster"],
    instanceId: "blink-1",
    reason: "manual",
    operationId: "blink-dismiss",
  }]);
  assert.equal(etherealRemoval.pendingTerminations.length, 1);
  assert.equal(state(etherealRemoval).spells[0].pendingTermination.instanceId, "blink-1");

  const returnPlan = buildBlinkReturnOperations({
    targetId: "caster",
    spellEntry: state(etherealRemoval).spells[0],
    chosenPosition: { x: 100, y: 100 },
    dpi: 100,
    scale: { parsed: { multiplier: 1.5, unit: "m" } },
  });
  const completed = buildEffectsMutationPlan(etherealRemoval.states, returnPlan.operations);
  assert.deepEqual(state(completed).spells, []);
  assert.equal((completed.pendingTerminations || []).length, 0);
});

test("expiry e cleanup esterni non perdono il parent etereo e attraversano la stessa gateway", () => {
  const entry = blinkEntry({
    state: {
      plane: "ethereal",
      departurePosition: { x: 100, y: 100 },
      departureTurnKey: "1:0:caster",
    },
  });
  const expired = buildEffectsMutationPlan([item("caster", [entry])], [{
    type: "effects:tick-round",
    targetIds: ["caster"],
    delta: -10,
    operationId: "blink-ethereal-expiry",
  }]);
  assert.equal(expired.pendingTerminations.length, 1);
  assert.equal(state(expired).spells[0].pendingTermination.instanceId, "blink-1");

  for (const type of ["spell:clear-non-concentration", "termination:request"]) {
    const result = buildEffectsMutationPlan([item("caster", [entry])], [{
      type,
      targetIds: ["caster"],
      casterId: "caster",
      instanceId: "blink-1",
      reference: "blink-1",
      operationId: `blink-${type}`,
    }]);
    assert.equal(result.pendingTerminations.length, 1, type);
    assert.equal(state(result).spells[0].pendingTermination.instanceId, "blink-1", type);
  }
});

test("spell:set esterno attraversa il gateway Blink prima di perdere il parent etereo", () => {
  const entry = blinkEntry({
    state: { plane: "ethereal", departurePosition: { x: 100, y: 100 } },
  });
  const plan = buildEffectsMutationPlan(
    [item("caster", [entry])],
    [{ type: "spell:set", targetIds: ["caster"], spells: [] }],
  );
  assert.equal(plan.pendingTerminations.length, 1);
  assert.equal(state(plan).spells[0].instanceId, "blink-1");
  assert.equal(state(plan).spells[0].pendingTermination.instanceId, "blink-1");
});

test("presentation e action economy non usano Invisibile e distinguono dismissal da return", () => {
  const spell = getSpellDefinition("blink");
  const materialContext = blinkInitialCastContext();
  const etherealContext = blinkCastContextForState(materialContext, {
    plane: "ethereal",
    departurePosition: { x: 100, y: 100 },
  });
  assert.deepEqual(getSpellSummaryParts(spell, "", materialContext), []);
  assert.equal(blinkSemanticDetail(materialContext), "");
  assert.deepEqual(getSpellSummaryParts(spell, "", etherealContext), [
    { id: "blink-ethereal", label: "Etereo" },
  ]);
  assert.equal(
    blinkSemanticDetail(etherealContext),
    "Piano Etereo · vista 18 m · interazioni solo eteree",
  );

  const materialActions = getSpellOverviewActions({
    spell,
    castContext: materialContext,
    casterId: "caster",
    appliedAt: { turnKey: "1:0:caster" },
    currentTurnKey: "1:0:caster",
  });
  assert.deepEqual(materialActions.map((action) => action.id), ["blink-terminate"]);
  assert.equal(materialActions[0].economy, "action");

  const dismissalPlan = buildSpellActiveActionPlan({
    spell,
    actionId: "blink-terminate",
    group: {
      instanceId: "blink-1",
      casterId: "caster",
      casterName: "Mago",
      spellId: "blink",
      name: "Intermittenza",
      castContext: materialContext,
    },
    appliedAt: { turnKey: "1:0:caster" },
  });
  assert.equal(dismissalPlan.valid, true);
  assert.equal(dismissalPlan.action.economy, "action");
  assert.equal(dismissalPlan.operations[0].reason, "voluntary-dismiss");

  const etherealActions = getSpellOverviewActions({
    spell,
    castContext: etherealContext,
    casterId: "caster",
    appliedAt: { turnKey: "1:0:caster" },
    currentTurnKey: "2:0:caster",
  });
  assert.deepEqual(
    etherealActions.map((action) => action.id).sort(),
    ["blink-return", "blink-terminate"].sort(),
  );
  assert.equal(etherealActions.some((action) => action.id === "invisible"), false);
  assert.equal(JSON.stringify(etherealActions).includes("Invisibile"), false);
});

test("esiti e instance stale non possono riattivare una Blink diversa o usare immune", () => {
  const entry = blinkEntry({ instanceId: "blink-new" });
  const notice = turnEndNotice([item("caster", [entry])]);
  const oldNotice = structuredClone(notice);
  oldNotice.activationId = "blink-old:blink-turn-end:1:0:caster";
  oldNotice.resolution.activation.instanceId = "blink-old";
  const stale = applyResolution([item("caster", [entry])], oldNotice, "failed");
  assert.equal(stale.status, "stale");

  const immune = applyResolution([item("caster", [entry])], notice, "immune");
  assert.equal(immune.status, "invalid");
  assert.equal(immune.operations, undefined);

  const wrongInstanceOperation = buildBlinkRollStateOperation({
    targetId: "caster",
    spellEntry: entry,
    outcome: "failed",
    currentPosition: { x: 100, y: 100 },
  });
  assert.equal(wrongInstanceOperation.expectedInstanceId, "blink-new");
  assert.equal(wrongInstanceOperation.instanceId, "blink-new");
});

test("l'outcome terminale finale può essere risolto prima del cleanup e non resta a turns zero", () => {
  const entry = blinkEntry({ turns: 1 });
  const { previousState, nextState } = boundaryStates();
  const deferred = buildEffectsMutationPlan([item("caster", [entry])], [{
    type: "effects:tick-round",
    targetIds: ["caster"],
    delta: -1,
    boundaries: [{ mode: "turn-end", actorId: "caster", turnKey: "1:0:caster" }],
    previousState,
    nextState,
  }]);
  const pendingNotice = planEffectSaveReminderNotices({
    items: [item("caster", [state(deferred).spells[0]])],
    includeCurrentTurnStart: false,
  }).find((notice) => notice.activationId === "blink-1:blink-turn-end:1:0:caster");
  const failed = applyResolution(
    [item("caster", [state(deferred).spells[0]])],
    pendingNotice,
    "failed",
  );
  assert.ok(failed.operations.some((operation) => operation.type === "spell:remove-instance"));
  const terminal = buildEffectsMutationPlan([item("caster", [state(deferred).spells[0]])], failed.operations);
  assert.equal(terminal.pendingTerminations[0].pendingTermination.reason, "expiry");
  assert.equal(state(terminal).spells[0].turns, 0);
  assert.equal(state(terminal).spells[0].pendingTermination.instanceId, "blink-1");
});
