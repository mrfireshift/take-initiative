import test from "node:test";
import assert from "node:assert/strict";

import { AREA_SAVE_SPELL_ID_SET } from "../src/areaSaveSpellRules.js";
import { ID } from "../src/constants.js";
import { buildEffectsMutationPlan } from "../src/effectsMutationCore.js";
import { buildCoordinatedEffectsUndoPlan } from "../src/effectsMutationUndoCore.js";
import { planEffectSaveReminderNotices } from "../src/effectSaveReminderCore.js";
import { buildReminderResolutionPlan } from "../src/reminderResolutionCore.js";
import { getSpellSaveWorkflowRule } from "../src/spellSaveWorkflowRules.js";
import { resolveSaveSpellResolution } from "../src/saveSpellCore.js";
import { saveSpellResolutionOperations } from "../src/saveSpellOperationsCore.js";
import { getAreaSaveAutomation, getSpellDefinition } from "../src/spells-srd.js";
import {
  buildSpellUnifiedPanelContract,
  SPELL_UNIFIED_TARGETING_MODES,
} from "../src/spellUnifiedPanelCore.js";

const SPELL_ID = "flesh-to-stone";
const META_KEY = `${ID}/meta`;
const SPELLS_META_KEY = `${ID}/spells`;
const CONC_META_KEY = `${ID}/concentrations`;

function conditionsMeta(instances = []) {
  return { instances };
}

function reminderFixture({ successes = 0, failures = 1, legacyProgress = false } = {}) {
  const source = {
    id: "caster",
    name: "Mago",
    metadata: {
      [META_KEY]: {
        initiativeCard: { spellSaveDC: 17 },
        [CONC_META_KEY]: {
          "Carne in pietra": {
            name: "Carne in pietra",
            instanceId: "fts-1",
            spellId: SPELL_ID,
            targets: ["target"],
          },
        },
      },
    },
  };
  const restrained = {
    id: "fts-restrained",
    condition: "Trattenuto",
    active: true,
    sourceId: "caster",
    sourceName: "Mago",
    parentEffectId: "fts-1",
    spellName: "Carne in pietra",
    spellId: SPELL_ID,
    type: "spell",
    effectId: "flesh-to-stone-restrained",
    expiry: { mode: "concentration" },
    endsParentOnRemoval: true,
    parentRemoval: "spell",
    saveReminder: {
      ability: "con",
      timing: "turn-end",
      dcSource: "source-spell",
      label: "Carne in pietra: ripeti il TS Costituzione.",
    },
    ...(legacyProgress
      ? {}
      : {
        mechanics: {
          fleshToStoneProgress: { successes, failures },
        },
      }),
  };
  const instances = [restrained];
  if (legacyProgress) {
    instances.push({
      id: "fts-progress",
      condition: "Carne in pietra · progresso",
      active: true,
      sourceId: "",
      sourceName: "",
      parentEffectId: "fts-1",
      spellId: SPELL_ID,
      type: "spell",
      effectId: "flesh-to-stone-progress",
      mapVisible: false,
      expiry: { mode: "concentration" },
      mechanics: {
        fleshToStoneProgress: { successes, failures },
      },
    });
  }
  const target = {
    id: "target",
    name: "Bersaglio",
    metadata: {
      [META_KEY]: {
        [SPELLS_META_KEY]: [{
          id: "spell-entry",
          name: "Carne in pietra",
          spellId: SPELL_ID,
          instanceId: "fts-1",
          casterId: "caster",
          conc: true,
          turns: 10,
        }],
        conditions: conditionsMeta(instances),
      },
    },
  };
  return { source, target };
}

function turnEndNotice(progress = {}) {
  const { source, target } = reminderFixture(progress);
  const notices = planEffectSaveReminderNotices({
    items: [source, target],
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
  });
  return notices.find((notice) => notice.target?.id === "target");
}

function canonicalStateFromToken(item) {
  const meta = item?.metadata?.[META_KEY] || {};
  return {
    id: item.id,
    name: item.name,
    spells: Array.isArray(meta[SPELLS_META_KEY]) ? structuredClone(meta[SPELLS_META_KEY]) : [],
    concentrations: meta[CONC_META_KEY] && typeof meta[CONC_META_KEY] === "object"
      ? structuredClone(meta[CONC_META_KEY])
      : {},
    conditions: Array.isArray(meta.conditions?.instances)
      ? structuredClone(meta.conditions.instances)
      : Array.isArray(meta.conditions)
        ? structuredClone(meta.conditions)
        : [],
  };
}

function preparedOperations(operations, prefix = "fts-reminder") {
  return (Array.isArray(operations) ? operations : []).map((operation, index) => {
    const operationId = `${prefix}-${index}`;
    const targetIds = Array.isArray(operation.targetIds) ? operation.targetIds : [];
    if (operation.type === "spell:upsert") {
      return {
        ...operation,
        operationId,
        entryIds: Object.fromEntries(targetIds.map((id) => [id, `${operationId}:spell:${id}`])),
      };
    }
    if (["condition:add", "condition:add-custom", "condition:toggle"].includes(operation.type)) {
      return {
        ...operation,
        operationId,
        createdAt: 100 + index,
        instanceIds: Object.fromEntries(targetIds.map((id) => [id, `${operationId}:condition:${id}`])),
        consequenceInstanceIds: Object.fromEntries(targetIds.map((id) => [
          id,
          { prono: `${operationId}:automatic:prono:${id}` },
        ])),
      };
    }
    return { ...operation, operationId };
  });
}

function resolutionMutation(progress, outcome) {
  const fixture = reminderFixture(progress);
  const notice = turnEndNotice(progress);
  const resolution = buildReminderResolutionPlan({
    notice,
    items: [fixture.source, fixture.target],
    outcome,
    now: 200,
  });
  assert.equal(resolution.status, "ready");

  const mutation = buildEffectsMutationPlan(
    [canonicalStateFromToken(fixture.source), canonicalStateFromToken(fixture.target)],
    preparedOperations(resolution.operations),
  );
  return { fixture, notice, resolution, mutation };
}

function state(mutation, id) {
  return mutation.states.find((entry) => entry.id === id);
}

function runtimeNormalizedConditions(instances = []) {
  // Replica i campi opzionali che il normalizzatore condiviso non conserva
  // quando rilegge le condizioni persistite dalla scena. History deve quindi
  // restare undoable anche dopo questo round-trip reale.
  return (Array.isArray(instances) ? instances : []).map((instance) => {
    const next = structuredClone(instance);
    delete next.spellName;
    delete next.spellId;
    return next;
  });
}

function reminderUndoPlan(progress, outcome) {
  const fixture = reminderFixture(progress);
  const notice = turnEndNotice(progress);
  const resolution = buildReminderResolutionPlan({
    notice,
    items: [fixture.source, fixture.target],
    outcome,
    now: 200,
  });
  assert.equal(resolution.status, "ready");

  // prepareEffectsMutation() usa condizioni già normalizzate dalla scena.
  const beforeStates = [
    canonicalStateFromToken(fixture.source),
    {
      ...canonicalStateFromToken(fixture.target),
      conditions: runtimeNormalizedConditions(
        canonicalStateFromToken(fixture.target).conditions,
      ),
    },
  ];
  const mutation = buildEffectsMutationPlan(
    beforeStates,
    preparedOperations(resolution.operations, "fts-history"),
  );
  const currentStates = mutation.states.map((entry) => ({
    ...structuredClone(entry),
    conditions: runtimeNormalizedConditions(entry.conditions),
    metadata: {},
  }));
  const historyEntry = {
    id: "fts-history-entry",
    effectsMutation: { changes: structuredClone(mutation.changes) },
  };
  return buildCoordinatedEffectsUndoPlan({
    currentStates,
    entryOrEntries: [historyEntry],
    metadataKeys: {
      conditions: "conditions",
      spells: SPELLS_META_KEY,
      concentrations: CONC_META_KEY,
    },
    normalizeConditions: (value) => Array.isArray(value?.instances)
      ? runtimeNormalizedConditions(value.instances)
      : [],
  });
}

test("SP-R06A — Carne in pietra è un singolo bersaglio discreto entro 18 m con TS COS", () => {
  assert.equal(AREA_SAVE_SPELL_ID_SET.has(SPELL_ID), false);

  const rule = getSpellSaveWorkflowRule(SPELL_ID);
  assert.ok(rule);
  assert.equal(rule.ability, "con");
  assert.equal(rule.targeting.baseMaximum, 1);
  assert.equal(rule.targeting.additionalPerSlotAbove, 0);
  assert.deepEqual(rule.targeting.spatial, { mode: "caster-range", maxMeters: 18 });

  const contract = buildSpellUnifiedPanelContract({ spellId: SPELL_ID });
  assert.equal(contract.presentation.targeting.mode, SPELL_UNIFIED_TARGETING_MODES.DISCRETE);
  assert.equal(contract.presentation.placement.available, false);
  assert.equal(contract.presentation.inputs.targets.required, true);
  assert.equal(contract.presentation.inputs.outcomes.required, true);
});

test("SP-R06A — il fallimento iniziale applica Trattenuto e inizializza 0 successi / 1 fallimento", () => {
  const spell = getSpellDefinition(SPELL_ID);
  const automation = getAreaSaveAutomation(spell);
  assert.ok(automation);
  assert.deepEqual(automation.trackOutcomes, ["failed"]);

  const restrained = automation.failed.find((rule) => rule.effectId === "flesh-to-stone-restrained");
  const progress = automation.failed.find((rule) => rule.effectId === "flesh-to-stone-progress");
  assert.ok(restrained);
  assert.equal(restrained.condition, "Trattenuto");
  assert.equal(restrained.expiry.mode, "concentration");
  assert.equal(restrained.saveReminder.ability, "con");
  assert.equal(restrained.saveReminder.timing, "turn-end");
  assert.equal(restrained.effectKind, undefined);
  assert.equal(restrained.options?.theme, null);
  assert.equal(restrained.options?.spellName, "");
  assert.equal(restrained.options?.spellId, "");
  assert.deepEqual(restrained.mechanics.fleshToStoneProgress, {
    successes: 0,
    failures: 1,
  });
  assert.deepEqual(restrained.summaryParts, [
    { id: "flesh-to-stone-progress", label: "S 0/3 · F 1/3" },
  ]);
  assert.equal(progress, undefined);
});

test("SP-R06A — il cast iniziale rende visibile la minipill S 0/3 · F 1/3", () => {
  const spell = getSpellDefinition(SPELL_ID);
  const resolution = resolveSaveSpellResolution({
    spell,
    casterId: "caster",
    targetIds: ["target"],
    outcomes: { target: "failed" },
    automation: getAreaSaveAutomation(spell),
    saveWorkflowRule: getSpellSaveWorkflowRule(SPELL_ID),
    slotLevel: 6,
    validateSpatial: false,
  });
  const operations = saveSpellResolutionOperations({
    resolution,
    instanceId: "fts-initial-cast",
    casterName: "Mago",
    turns: 10,
    spellExpiry: { mode: "concentration" },
  });
  const mutation = buildEffectsMutationPlan([
    { id: "caster", name: "Mago", spells: [], concentrations: {}, conditions: [] },
    { id: "target", name: "Bersaglio", spells: [], concentrations: {}, conditions: [] },
  ], preparedOperations(operations, "fts-initial-cast"));
  const restrained = state(mutation, "target").conditions.find((entry) =>
    entry.effectId === "flesh-to-stone-restrained"
  );

  assert.ok(restrained);
  assert.deepEqual(restrained.mechanics.fleshToStoneProgress, {
    successes: 0,
    failures: 1,
  });
  assert.deepEqual(restrained.summaryParts, [
    { id: "flesh-to-stone-progress", label: "S 0/3 · F 1/3" },
  ]);
});

test("SP-R06A — il reminder mostra i contatori e aggiorna lo stato senza rimuovere Trattenuto", () => {
  const notice = turnEndNotice({ successes: 1, failures: 1 });
  assert.ok(notice);
  assert.equal(notice.ability, "COS");
  assert.equal(notice.dc, 17);
  assert.match(notice.instruction, /Successi 1\/3/i);
  assert.match(notice.instruction, /Fallimenti 1\/3/i);

  const passed = resolutionMutation({ successes: 1, failures: 1 }, "passed");
  const passedTarget = state(passed.mutation, "target");
  assert.ok(passedTarget.conditions.some((entry) => entry.condition === "Trattenuto"));
  assert.deepEqual(
    passedTarget.conditions.find((entry) => entry.effectId === "flesh-to-stone-restrained")
      ?.mechanics?.fleshToStoneProgress,
    { successes: 2, failures: 1 },
  );
  assert.deepEqual(
    passedTarget.conditions.find((entry) => entry.effectId === "flesh-to-stone-restrained")
      ?.summaryParts,
    [{ id: "flesh-to-stone-progress", label: "S 2/3 · F 1/3" }],
  );

  const failed = resolutionMutation({ successes: 1, failures: 1 }, "failed");
  const failedTarget = state(failed.mutation, "target");
  assert.ok(failedTarget.conditions.some((entry) => entry.condition === "Trattenuto"));
  assert.deepEqual(
    failedTarget.conditions.find((entry) => entry.effectId === "flesh-to-stone-restrained")
      ?.mechanics?.fleshToStoneProgress,
    { successes: 1, failures: 2 },
  );
});

test("SP-R06A — la terza riuscita rimuove Trattenuto e termina spell + concentrazione", () => {
  const { mutation, resolution } = resolutionMutation({ successes: 2, failures: 1 }, "passed");
  assert.equal(resolution.operations.length, 1);
  assert.equal(resolution.operations[0].type, "condition:remove-instances");

  const caster = state(mutation, "caster");
  const target = state(mutation, "target");
  assert.deepEqual(caster.concentrations, {});
  assert.deepEqual(target.spells, []);
  assert.equal(target.conditions.some((entry) => entry.condition === "Trattenuto"), false);
  assert.equal(target.conditions.some((entry) => entry.effectId === "flesh-to-stone-progress"), false);
});

test("SP-R06A — il terzo fallimento sostituisce Trattenuto/progresso con la sola condizione Pietrificato", () => {
  const { mutation, resolution } = resolutionMutation({ successes: 1, failures: 2 }, "failed");
  assert.deepEqual(
    resolution.operations.map((operation) => operation.type),
    ["condition:remove-parent-effects", "condition:add", "condition:automate"],
  );

  const caster = state(mutation, "caster");
  const target = state(mutation, "target");
  assert.ok(caster.concentrations["Carne in pietra"]);
  assert.equal(target.spells.length, 1);
  assert.equal(target.conditions.some((entry) => entry.condition === "Trattenuto"), false);
  assert.equal(target.conditions.some((entry) => entry.effectId === "flesh-to-stone-progress"), false);

  const petrified = target.conditions.find((entry) => entry.condition === "Pietrificato");
  assert.ok(petrified);
  assert.equal(petrified.effectKind, undefined);
  assert.equal(petrified.theme, undefined);
  assert.equal(petrified.parentEffectId, "fts-1");
  assert.deepEqual(petrified.expiry, { mode: "concentration" });
  assert.equal(petrified.summaryParts, undefined);
  assert.equal(petrified.parentEndCondition?.condition, "Pietrificato");
  assert.equal(petrified.parentEndCondition?.naturalOnly, true);
});

test("SP-R06A — interrompere presto la concentrazione rimuove Pietrificato senza renderlo permanente", () => {
  const states = [
    {
      id: "caster",
      spells: [],
      conditions: [],
      concentrations: {
        "Carne in pietra": {
          name: "Carne in pietra",
          instanceId: "fts-1",
          spellId: SPELL_ID,
          targets: ["target"],
        },
      },
    },
    {
      id: "target",
      spells: [{
        id: "spell-entry",
        name: "Carne in pietra",
        spellId: SPELL_ID,
        instanceId: "fts-1",
        casterId: "caster",
        conc: true,
        turns: 4,
      }],
      concentrations: {},
      conditions: [{
        id: "petrified-linked",
        condition: "Pietrificato",
        active: true,
        sourceId: "caster",
        parentEffectId: "fts-1",
        type: "spell",
        effectId: "flesh-to-stone-petrified",
        expiry: { mode: "concentration" },
        parentEndCondition: {
          condition: "Pietrificato",
          naturalOnly: true,
          expiry: { mode: "manual" },
        },
      }],
    },
  ];

  const mutation = buildEffectsMutationPlan(states, [{
    type: "concentration:break",
    casterIds: ["caster"],
    reference: "fts-1",
  }]);
  assert.deepEqual(state(mutation, "caster").concentrations, {});
  assert.deepEqual(state(mutation, "target").spells, []);
  assert.equal(state(mutation, "target").conditions.some((entry) => entry.condition === "Pietrificato"), false);
});

test("SP-R06A — a concentrazione mantenuta per tutta la durata, Pietrificato diventa permanente", () => {
  const target = {
    id: "target",
    spells: [{
      id: "spell-entry",
      name: "Carne in pietra",
      spellId: SPELL_ID,
      instanceId: "fts-1",
      casterId: "caster",
      conc: true,
      turns: 1,
    }],
    concentrations: {},
    conditions: [{
      id: "petrified-linked",
      condition: "Pietrificato",
      active: true,
      sourceId: "caster",
      parentEffectId: "fts-1",
      type: "spell",
      effectId: "flesh-to-stone-petrified",
      expiry: { mode: "concentration" },
      parentEndCondition: {
        condition: "Pietrificato",
        naturalOnly: true,
        expiry: { mode: "manual" },
      },
    }],
  };
  const caster = {
    id: "caster",
    spells: [],
    conditions: [],
    concentrations: {
      "Carne in pietra": {
        name: "Carne in pietra",
        instanceId: "fts-1",
        spellId: SPELL_ID,
        targets: ["target"],
      },
    },
  };

  const mutation = buildEffectsMutationPlan([caster, target], [{
    type: "spell:adjust",
    targetIds: ["target"],
    delta: -1,
  }]);
  const targetAfter = state(mutation, "target");
  const casterAfter = state(mutation, "caster");
  assert.deepEqual(targetAfter.spells, []);
  assert.deepEqual(casterAfter.concentrations, {});
  const petrified = targetAfter.conditions.filter((condition) => condition.condition === "Pietrificato");
  assert.equal(petrified.length, 1);
  assert.equal(petrified[0].parentEffectId, undefined);
  assert.deepEqual(petrified[0].expiry, { mode: "manual" });
});

test("SP-R06A — la scadenza naturale non duplica un Pietrificato già indipendente", () => {
  const target = {
    id: "target",
    spells: [{
      id: "spell-entry",
      name: "Carne in pietra",
      spellId: SPELL_ID,
      instanceId: "fts-1",
      casterId: "caster",
      conc: true,
      turns: 1,
    }],
    concentrations: {},
    conditions: [
      {
        id: "petrified-linked",
        condition: "Pietrificato",
        active: true,
        sourceId: "caster",
        parentEffectId: "fts-1",
        type: "spell",
        effectId: "flesh-to-stone-petrified",
        expiry: { mode: "concentration" },
        parentEndCondition: {
          condition: "Pietrificato",
          naturalOnly: true,
          expiry: { mode: "manual" },
        },
      },
      {
        id: "petrified-independent",
        condition: "Pietrificato",
        active: true,
        expiry: { mode: "manual" },
      },
    ],
  };
  const caster = {
    id: "caster",
    spells: [],
    conditions: [],
    concentrations: {
      "Carne in pietra": {
        name: "Carne in pietra",
        instanceId: "fts-1",
        spellId: SPELL_ID,
        targets: ["target"],
      },
    },
  };

  const mutation = buildEffectsMutationPlan([caster, target], [{
    type: "spell:adjust",
    targetIds: ["target"],
    delta: -1,
  }]);
  const petrified = state(mutation, "target").conditions.filter((entry) =>
    entry.condition === "Pietrificato"
  );
  assert.equal(petrified.length, 1);
  assert.equal(petrified[0].id, "petrified-independent");
});



test("SP-R06A regression — un cast legacy migra il marker tecnico dentro Trattenuto al primo TS", () => {
  const fixture = reminderFixture({ successes: 1, failures: 1, legacyProgress: true });
  const notices = planEffectSaveReminderNotices({
    items: [fixture.source, fixture.target],
    previousInitiativeState: { order: ["caster", "target"], current: 1, round: 1 },
    initiativeState: { order: ["caster", "target"], current: 0, round: 2 },
    includeCurrentTurnStart: false,
  });
  const notice = notices.find((entry) => entry.target?.id === "target");
  assert.ok(notice);
  const resolution = buildReminderResolutionPlan({
    notice,
    items: [fixture.source, fixture.target],
    outcome: "passed",
    now: 200,
  });
  assert.equal(resolution.status, "ready");
  const mutation = buildEffectsMutationPlan(
    [canonicalStateFromToken(fixture.source), canonicalStateFromToken(fixture.target)],
    preparedOperations(resolution.operations, "fts-legacy"),
  );
  const target = state(mutation, "target");
  assert.equal(target.conditions.some((entry) => entry.effectId === "flesh-to-stone-progress"), false);
  assert.deepEqual(
    target.conditions.find((entry) => entry.effectId === "flesh-to-stone-restrained")
      ?.mechanics?.fleshToStoneProgress,
    { successes: 2, failures: 1 },
  );
});

test("SP-R06A regression — interrompere la concentrazione elimina anche lo stato di progresso prima di un recast", () => {
  const { source, target } = reminderFixture({ successes: 1, failures: 2 });
  const mutation = buildEffectsMutationPlan(
    [canonicalStateFromToken(source), canonicalStateFromToken(target)],
    [{ type: "concentration:break", casterIds: ["caster"], reference: "fts-1" }],
  );
  assert.deepEqual(state(mutation, "caster").concentrations, {});
  assert.deepEqual(state(mutation, "target").spells, []);
  assert.equal(state(mutation, "target").conditions.some((entry) =>
    entry.effectId === "flesh-to-stone-restrained"
    || entry.effectId === "flesh-to-stone-progress"
  ), false);

  const spell = getSpellDefinition(SPELL_ID);
  const automation = getAreaSaveAutomation(spell);
  const fresh = automation.failed.find((rule) => rule.effectId === "flesh-to-stone-restrained");
  assert.deepEqual(fresh.mechanics.fleshToStoneProgress, { successes: 0, failures: 1 });
});

test("SP-R06A regression — il reminder resta specializzato anche dopo la normalizzazione runtime che perde spellId", () => {
  const { source, target } = reminderFixture({ successes: 0, failures: 1 });
  const stored = target.metadata[META_KEY].conditions.instances;
  for (const instance of stored) {
    delete instance.spellId;
    delete instance.spellName;
  }
  const notices = planEffectSaveReminderNotices({
    items: [source, target],
    previousInitiativeState: { order: ["caster", "target"], current: 1, round: 1 },
    initiativeState: { order: ["caster", "target"], current: 0, round: 2 },
    includeCurrentTurnStart: false,
  });
  const notice = notices.find((entry) => entry.target?.id === "target");
  assert.ok(notice);
  assert.match(notice.instruction, /Successi 0\/3/i);
  assert.match(notice.instruction, /Fallimenti 1\/3/i);
});

test("SP-R06A regression — il progresso appartiene a Trattenuto e non a un marker tecnico separato", () => {
  const spell = getSpellDefinition(SPELL_ID);
  const automation = getAreaSaveAutomation(spell);
  const restrained = automation.failed.find((rule) => rule.effectId === "flesh-to-stone-restrained");
  const progressMarker = automation.failed.find((rule) => rule.effectId === "flesh-to-stone-progress");
  assert.ok(restrained);
  assert.equal(progressMarker, undefined);
  assert.deepEqual(restrained.mechanics?.fleshToStoneProgress, { successes: 0, failures: 1 });
});

test("SP-R06A — ogni risoluzione del TS resta un singolo piano Effects Mutation", () => {
  const intermediate = resolutionMutation({ successes: 1, failures: 1 }, "passed").resolution;
  const terminalFailure = resolutionMutation({ successes: 1, failures: 2 }, "failed").resolution;

  assert.equal(intermediate.status, "ready");
  assert.equal(intermediate.metadataPatches.length, 1);
  assert.ok(intermediate.operations.length >= 1);
  assert.equal(terminalFailure.status, "ready");
  assert.equal(terminalFailure.metadataPatches.length, 1);
  assert.deepEqual(terminalFailure.sideEffects, []);
});


test("SP-R06A regression — il TS intermedio resta annullabile dopo il round-trip runtime delle condizioni", () => {
  const undo = reminderUndoPlan({ successes: 0, failures: 1 }, "failed");
  assert.equal(undo.status, undefined);
  assert.equal(undo.conflicts?.length || 0, 0);
  const target = undo.states.find((entry) => entry.id === "target");
  assert.deepEqual(
    target.conditions.find((entry) => entry.effectId === "flesh-to-stone-restrained")
      ?.mechanics?.fleshToStoneProgress,
    { successes: 0, failures: 1 },
  );
});

test("SP-R06A regression — la transizione a Pietrificato resta annullabile e ripristina Trattenuto + counter", () => {
  const undo = reminderUndoPlan({ successes: 1, failures: 2 }, "failed");
  assert.equal(undo.status, undefined);
  assert.equal(undo.conflicts?.length || 0, 0);
  const target = undo.states.find((entry) => entry.id === "target");
  assert.equal(target.conditions.some((entry) => entry.condition === "Pietrificato"), false);
  assert.deepEqual(
    target.conditions.find((entry) => entry.effectId === "flesh-to-stone-restrained")
      ?.mechanics?.fleshToStoneProgress,
    { successes: 1, failures: 2 },
  );
});


test("SP-R06A regression — anche il cast iniziale resta annullabile dopo il round-trip runtime", () => {
  const spell = getSpellDefinition(SPELL_ID);
  const resolution = resolveSaveSpellResolution({
    spell,
    casterId: "caster",
    targetIds: ["target"],
    outcomes: { target: "failed" },
    automation: getAreaSaveAutomation(spell),
    saveWorkflowRule: getSpellSaveWorkflowRule(SPELL_ID),
    slotLevel: 6,
    validateSpatial: false,
  });
  assert.equal(resolution.valid, true);
  const operations = saveSpellResolutionOperations({
    resolution,
    instanceId: "fts-cast-history",
    casterName: "Mago",
    turns: 10,
    spellExpiry: { mode: "concentration" },
  });
  const mutation = buildEffectsMutationPlan([
    { id: "caster", name: "Mago", spells: [], concentrations: {}, conditions: [] },
    { id: "target", name: "Bersaglio", spells: [], concentrations: {}, conditions: [] },
  ], preparedOperations(operations, "fts-cast-history"));
  const currentStates = mutation.states.map((entry) => ({
    ...structuredClone(entry),
    conditions: runtimeNormalizedConditions(entry.conditions),
    metadata: {},
  }));
  const undo = buildCoordinatedEffectsUndoPlan({
    currentStates,
    entryOrEntries: [{
      id: "fts-cast-entry",
      effectsMutation: { changes: structuredClone(mutation.changes) },
    }],
    metadataKeys: {
      conditions: "conditions",
      spells: SPELLS_META_KEY,
      concentrations: CONC_META_KEY,
    },
    normalizeConditions: (value) => Array.isArray(value?.instances)
      ? runtimeNormalizedConditions(value.instances)
      : [],
  });
  assert.equal(undo.status, undefined);
  assert.equal(undo.conflicts?.length || 0, 0);
  assert.deepEqual(undo.states.find((entry) => entry.id === "target").conditions, []);
  assert.deepEqual(undo.states.find((entry) => entry.id === "target").spells, []);
});

test("SP-R06A regression — il terzo successo è annullabile e ripristina spell, concentrazione, Trattenuto e counter", () => {
  const undo = reminderUndoPlan({ successes: 2, failures: 1 }, "passed");
  assert.equal(undo.status, undefined);
  assert.equal(undo.conflicts?.length || 0, 0);
  const caster = undo.states.find((entry) => entry.id === "caster");
  const target = undo.states.find((entry) => entry.id === "target");
  assert.ok(caster.concentrations["Carne in pietra"]);
  assert.equal(target.spells.length, 1);
  assert.deepEqual(
    target.conditions.find((entry) => entry.effectId === "flesh-to-stone-restrained")
      ?.mechanics?.fleshToStoneProgress,
    { successes: 2, failures: 1 },
  );
});
