import test from "node:test";
import assert from "node:assert/strict";

import referenceData from "../src/spell-reference-it.json" with { type: "json" };
import { ID } from "../src/constants.js";
import {
  getProposedConditions,
  getSpellDefinition,
  getSpellDurationTurns,
} from "../src/spells-srd.js";
import {
  buildSpellUnifiedPanelContract,
  getSpellUnifiedActiveActionDeclarations,
} from "../src/spellUnifiedPanelCore.js";
import {
  buildSpellApplicationIntent,
  buildSpellApplicationPlan,
} from "../src/spellApplicationPlanCore.js";
import { buildEffectsMutationPlan } from "../src/effectsMutationCore.js";
import { effectSaveReminderNoticesForDamage } from "../src/effectSaveReminderCore.js";
import { buildReminderResolutionPlan } from "../src/reminderResolutionCore.js";

const META_KEY = `${ID}/meta`;
const SPELLS_KEY = `${ID}/spells`;
const CONCENTRATION_KEY = `${ID}/concentration`;
const DOMINATE_IDS = ["dominate-beast", "dominate-person", "dominate-monster"];
const DOMINATE_LABELS = {
  "dominate-beast": "Dominare Bestie",
  "dominate-person": "Dominare Persone",
  "dominate-monster": "Dominare Mostri",
};

const rawSpells = referenceData.spells || {};

function emptyState(id, name = id) {
  return {
    id,
    name,
    spells: [],
    concentrations: {},
    conditions: [],
  };
}

function reminderItems(states) {
  return states.map((state) => ({
    id: state.id,
    name: state.name,
    metadata: {
      [META_KEY]: {
        initiativeCard: { spellSaveDC: 16 },
        conditions: state.conditions,
        [SPELLS_KEY]: state.spells,
        [CONCENTRATION_KEY]: state.concentrations,
      },
    },
  }));
}

function preparedLifecycleOperations(operations, { parentId, targetId }) {
  return operations.map((operation, index) => ({
    ...operation,
    operationId: `${parentId}:operation:${index}`,
    createdAt: 100 + index,
    ...(operation.type === "spell:upsert"
      ? { entryIds: { ...(operation.entryIds || {}), [targetId]: `${parentId}:spell` } }
      : {}),
    ...(operation.type === "condition:add"
      ? { instanceIds: { ...(operation.instanceIds || {}), [targetId]: `${parentId}:condition` } }
      : {}),
  }));
}

function dominateCast({ id, casterId, targetId, parentId, slotLevel }) {
  const spell = getSpellDefinition(id);
  const intent = buildSpellApplicationIntent({
    spell,
    enteredName: id,
    turns: getSpellDurationTurns(spell, { slotLevel }),
    casterId,
    targetIds: [targetId],
    castContext: { slotLevel, spellSaveDC: 16 },
    requestedConcentration: true,
  });
  const application = buildSpellApplicationPlan({
    intent,
    instanceId: parentId,
    appliedAt: {
      round: 1,
      actorId: casterId,
      phase: "turn",
      turnKey: `1:0:${casterId}`,
    },
    casterName: casterId,
  });
  return {
    spell,
    intent,
    application,
    operations: preparedLifecycleOperations(application.operations, { parentId, targetId }),
  };
}

function stateOf(states, id) {
  return states.find((state) => state.id === id);
}

test("Dominare conserva il RAW locale, lo scaling e il contratto manuale del cast", () => {
  const expected = {
    "dominate-beast": {
      level: 4,
      slots: { 4: 10, 5: 100, 6: 600, 7: 4800, 8: 4800, 9: 4800 },
      creature: /soggiogare una bestia/u,
      higherLevels: /5°.*10 minuti.*6°.*1 ora.*7°.*8 ore/su,
    },
    "dominate-person": {
      level: 5,
      slots: { 5: 10, 6: 100, 7: 600, 8: 4800, 9: 4800 },
      creature: /soggiogare un umanoide/u,
      higherLevels: /6°.*10 minuti.*7°.*1 ora.*8°.*8 ore/su,
    },
    "dominate-monster": {
      level: 8,
      slots: { 8: 600, 9: 4800 },
      creature: /soggiogare una creatura/u,
      higherLevels: /9°.*8\s*ore/su,
    },
  };

  for (const id of DOMINATE_IDS) {
    const raw = rawSpells[id];
    const spell = getSpellDefinition(id);
    const proposed = getProposedConditions(spell);
    const condition = proposed.find((entry) => entry?.name === "Affascinato");
    const reminder = condition?.options?.saveReminder;
    const panel = buildSpellUnifiedPanelContract({ spellId: id });

    assert.ok(raw, id);
    assert.equal(spell.level, expected[id].level, id);
    assert.equal(raw.range, "18 metri", id);
    assert.equal(raw.concentration, true, id);
    assert.match(raw.duration, /Concentrazione/u, id);
    assert.match(raw.description, expected[id].creature, id);
    assert.match(raw.description, /deve superare un tiro salvezza su Saggezza/u, id);
    assert.match(raw.description, /Ogni volta che il bersaglio subisce danni/u, id);
    assert.match(raw.description, /controllo totale e preciso/u, id);
    assert.match(raw.higherLevels, expected[id].higherLevels, id);

    assert.deepEqual(proposed.map((entry) => entry.name), ["Affascinato"], id);
    assert.deepEqual(reminder, {
      ability: "wis",
      timing: "damage",
      dcSource: "source-spell",
      label: `Se supera il TS, termina ${DOMINATE_LABELS[id]}.`,
    }, id);
    assert.equal(condition.options.manualRemoval, true, id);
    assert.equal(condition.options.endsParentOnRemoval, true, id);
    assert.equal(condition.options.parentRemoval, "target", id);

    for (const [slotLevel, turns] of Object.entries(expected[id].slots)) {
      assert.equal(
        getSpellDurationTurns(spell, { slotLevel: Number(slotLevel) }),
        turns,
        `${id} slot ${slotLevel}`,
      );
    }

    assert.deepEqual(spell.activeActions, [], id);
    assert.deepEqual(getSpellUnifiedActiveActionDeclarations(id), [], id);
    assert.equal(panel.presentation.targeting.limit.maximum, 1, id);
    assert.deepEqual(panel.presentation.targeting.spatialRules, {
      mode: "caster-range",
      maxMeters: 18,
    }, id);
    assert.equal(panel.presentation.inputs.outcomes.required, false, id);
    assert.equal(panel.presentation.inputs.outcomes.visible, false, id);
    assert.deepEqual(panel.presentation.controls, ["caster", "slot-level", "targets"], id);
    assert.equal(panel.execution.activeResolution, false, id);
    assert.equal(panel.execution.undo.capable, true, id);
  }
});

test("il reminder su danno usa identity parent-scoped, cleanup e no-op stale per tutti i Dominare", () => {
  const cases = [
    ["dominate-beast", 4],
    ["dominate-person", 5],
    ["dominate-monster", 8],
  ];

  for (const [id, slotLevel] of cases) {
    const casterId = `${id}:caster`;
    const targetId = `${id}:target`;
    const parentId = `${id}:parent`;
    const cast = dominateCast({ id, casterId, targetId, parentId, slotLevel });
    const initialStates = [emptyState(casterId, "Caster"), emptyState(targetId, "Bersaglio")];

    assert.deepEqual(cast.intent.saveOutcomes, {}, id);
    assert.equal(cast.application.operations.some((operation) => /^save:/u.test(operation.type)), false, id);
    assert.equal(cast.application.operations.some((operation) => operation.type === "condition:add"), true, id);

    const applied = buildEffectsMutationPlan(initialStates, cast.operations);
    const caster = stateOf(applied.states, casterId);
    const target = stateOf(applied.states, targetId);
    const condition = target.conditions[0];
    const parentSpell = target.spells.find((spell) => spell.instanceId === parentId);
    const concentration = Object.values(caster.concentrations).find((entry) => entry.instanceId === parentId);

    assert.equal(applied.status, undefined, id);
    assert.equal(target.conditions.length, 1, id);
    assert.equal(condition.condition, "Affascinato", id);
    assert.equal(condition.effectId, "dominate-charmed", id);
    assert.equal(condition.parentEffectId, parentId, id);
    assert.equal(parentSpell.spellId, id, id);
    assert.equal(concentration.spellId, id, id);
    assert.equal(concentration.targets[0], targetId, id);

    const items = reminderItems(applied.states);
    const notices = effectSaveReminderNoticesForDamage({
      items,
      damageById: new Map([[targetId, 7]]),
      eventId: `${id}:damage:1`,
    });
    assert.equal(notices.length, 1, id);
    const [notice] = notices;
    assert.equal(notice.timing, "damage", id);
    assert.equal(notice.ability, "SAG", id);
    assert.equal(notice.dc, 16, id);
    assert.equal(notice.resolution.activation.kind, "effect-save", id);
    assert.equal(notice.resolution.activation.activationId, notice.activationId, id);
    assert.equal(notice.resolution.save.ability, "wis", id);
    assert.equal(notice.resolution.effect.instanceId, condition.id, id);
    assert.equal(notice.resolution.effect.parentEffectId, parentId, id);
    assert.equal(notice.resolution.source.id, casterId, id);

    const failed = buildReminderResolutionPlan({
      notice,
      items,
      outcome: "failed",
      now: 200,
    });
    assert.equal(failed.status, "ready", id);
    assert.deepEqual(failed.operations, [], id);
    assert.equal(failed.metadataPatches[0].fields.reminderResolutions.historyBefore.present, false, id);
    assert.equal(failed.metadataPatches[0].fields.reminderResolutions.historyAfter.present, true, id);
    const failedMutation = buildEffectsMutationPlan(applied.states, failed.operations);
    assert.deepEqual(failedMutation.changes, [], id);
    assert.equal(stateOf(failedMutation.states, targetId).conditions.length, 1, id);
    assert.equal(stateOf(failedMutation.states, targetId).spells.length, 1, id);
    assert.equal(Object.keys(stateOf(failedMutation.states, casterId).concentrations).length, 1, id);

    const passed = buildReminderResolutionPlan({
      notice,
      items,
      outcome: "passed",
      now: 201,
    });
    assert.equal(passed.status, "ready", id);
    assert.deepEqual(passed.operations, [{
      type: "condition:remove-instances",
      removals: [{ itemId: targetId, instanceId: condition.id }],
    }], id);
    const cleaned = buildEffectsMutationPlan(applied.states, passed.operations);
    assert.deepEqual(stateOf(cleaned.states, targetId).conditions, [], id);
    assert.deepEqual(stateOf(cleaned.states, targetId).spells, [], id);
    assert.deepEqual(stateOf(cleaned.states, casterId).concentrations, {}, id);

    const stale = buildReminderResolutionPlan({
      notice,
      items: reminderItems(cleaned.states),
      outcome: "passed",
      now: 202,
    });
    assert.equal(stale.status, "stale", id);
    const staleMutation = buildEffectsMutationPlan(cleaned.states, stale.operations || []);
    assert.deepEqual(staleMutation.changes, [], id);
  }
});

test("un TS riuscito rimuove solo il parent Dominare corretto quando coesistono due domini", () => {
  const targetId = "target";
  const first = dominateCast({
    id: "dominate-beast",
    casterId: "caster-a",
    targetId,
    parentId: "parent-a",
    slotLevel: 4,
  });
  const second = dominateCast({
    id: "dominate-person",
    casterId: "caster-b",
    targetId,
    parentId: "parent-b",
    slotLevel: 5,
  });
  let states = [
    emptyState("caster-a", "Caster A"),
    emptyState("caster-b", "Caster B"),
    emptyState(targetId, "Bersaglio"),
  ];
  states = buildEffectsMutationPlan(states, first.operations).states;
  states = buildEffectsMutationPlan(states, second.operations).states;

  const items = reminderItems(states);
  const target = stateOf(states, targetId);
  const notices = effectSaveReminderNoticesForDamage({
    items,
    damageById: new Map([[targetId, 5]]),
    eventId: "coexisting-domains:damage:1",
  });
  assert.equal(notices.length, 2);

  const firstNotice = notices.find((notice) => notice.resolution.effect.parentEffectId === "parent-a");
  const secondNotice = notices.find((notice) => notice.resolution.effect.parentEffectId === "parent-b");
  assert.ok(firstNotice);
  assert.ok(secondNotice);

  const passedFirst = buildReminderResolutionPlan({
    notice: firstNotice,
    items,
    outcome: "passed",
    now: 300,
  });
  states = buildEffectsMutationPlan(states, passedFirst.operations).states;

  assert.deepEqual(
    stateOf(states, targetId).conditions.map((condition) => condition.parentEffectId),
    ["parent-b"],
  );
  assert.deepEqual(
    stateOf(states, targetId).spells.map((spell) => spell.instanceId),
    ["parent-b"],
  );
  assert.deepEqual(stateOf(states, "caster-a").concentrations, {});
  assert.equal(Object.values(stateOf(states, "caster-b").concentrations)[0].instanceId, "parent-b");

  const staleFirst = buildReminderResolutionPlan({
    notice: firstNotice,
    items: reminderItems(states),
    outcome: "passed",
    now: 301,
  });
  assert.equal(staleFirst.status, "stale");

  const passedSecond = buildReminderResolutionPlan({
    notice: secondNotice,
    items: reminderItems(states),
    outcome: "passed",
    now: 302,
  });
  assert.equal(passedSecond.status, "ready");
  states = buildEffectsMutationPlan(states, passedSecond.operations).states;
  assert.deepEqual(stateOf(states, targetId).conditions, []);
  assert.deepEqual(stateOf(states, targetId).spells, []);
  assert.deepEqual(stateOf(states, "caster-b").concentrations, {});
});
