import assert from "node:assert/strict";
import test from "node:test";
import { ID } from "../src/constants.js";
import {
  buildEffectSaveReminderResolution,
  buildReminderResolutionPlan,
} from "../src/reminderResolutionCore.js";
import { buildHistoryUndoPlan } from "../src/historyUndoCore.js";

const META_KEY = `${ID}/meta`;
const TARGET_ID = "marker-history-target";
const SOURCE_ID = "marker-history-caster";

const clone = (value) => value === undefined ? undefined : structuredClone(value);

function repeatedSaveEffect({
  instanceId,
  spellId,
  spellName,
  ability,
  damage = null,
}) {
  return {
    id: instanceId,
    condition: spellName === "Immolazione"
      ? "In fiamme · 4d6 a fine turno"
      : `${spellName} · progresso`,
    sourceId: SOURCE_ID,
    parentEffectId: instanceId,
    spellId,
    spellName,
    saveReminder: {
      ability,
      timing: "turn-end",
      success: "keep-effect",
      failure: "keep-effect",
      ...(damage ? { damage } : {}),
    },
  };
}

const IMMOLATION = repeatedSaveEffect({
  instanceId: "immolation-marker-instance",
  spellId: "xanathar-immolazione",
  spellName: "Immolazione",
  ability: "dex",
  damage: { dice: "4d6", type: "fuoco", onSave: "none" },
});

const FLESH_TO_STONE = repeatedSaveEffect({
  instanceId: "flesh-to-stone-marker-instance",
  spellId: "flesh-to-stone",
  spellName: "Carne in pietra",
  ability: "con",
});

function markerTransition({ effect, currentMarkers, suffix, now }) {
  const activationId = `${effect.id}:turn-end:${suffix}:${TARGET_ID}`;
  const targetMeta = {
    hp: 100,
    hpMax: 100,
    conditions: [effect],
    ...(currentMarkers === undefined
      ? {}
      : { reminderResolutions: clone(currentMarkers) }),
  };
  const resolution = buildEffectSaveReminderResolution({
    item: {
      id: TARGET_ID,
      metadata: { [META_KEY]: targetMeta },
    },
    instance: effect,
    reminder: effect.saveReminder,
    dc: 17,
    activationId,
    turnKey: `${suffix}:0:${TARGET_ID}`,
  });
  const plan = buildReminderResolutionPlan({
    notice: {
      activationId,
      targets: [{ id: TARGET_ID, name: "Target" }],
      resolution,
    },
    items: [
      { id: TARGET_ID, metadata: { [META_KEY]: targetMeta } },
      { id: SOURCE_ID, metadata: { [META_KEY]: {} } },
    ],
    outcome: "failed",
    damageRoll: effect === IMMOLATION ? 14 : 0,
    now,
  });
  assert.equal(plan.status, "ready");
  const descriptor = plan.metadataPatches[0].fields.reminderResolutions;
  return {
    activationId,
    markers: clone(descriptor.value),
    entry: {
      id: `history:${activationId}`,
      effectsMutation: {
        changes: [{
          id: TARGET_ID,
          metadataFields: { reminderResolutions: true },
          beforeMetadata: { reminderResolutions: clone(descriptor.historyBefore) },
          afterMetadata: {
            reminderResolutions: clone(descriptor.historyAfter),
          },
        }],
        sideEffects: [],
      },
    },
  };
}

function undoMarkers(currentMarkers, entry) {
  const meta = currentMarkers === undefined
    ? {}
    : { reminderResolutions: clone(currentMarkers) };
  const result = buildHistoryUndoPlan({
    sceneItems: [{ id: TARGET_ID, metadata: { [META_KEY]: meta } }],
    entryOrEntries: [entry],
    metadataKey: META_KEY,
  });
  if (result.status === "conflict") return result;
  const restoredMeta = result.finalItems
    .find((candidate) => candidate.id === TARGET_ID)
    ?.item?.metadata?.[META_KEY] || {};
  return {
    result,
    markers: Object.prototype.hasOwnProperty.call(restoredMeta, "reminderResolutions")
      ? clone(restoredMeta.reminderResolutions)
      : undefined,
  };
}

test("Immolazione A → B → Undo B → Undo A ripristina la catena marker", () => {
  const a = markerTransition({ effect: IMMOLATION, suffix: "A", now: 100 });
  const b = markerTransition({
    effect: IMMOLATION,
    currentMarkers: a.markers,
    suffix: "B",
    now: 200,
  });

  assert.deepEqual(Object.keys(b.markers), [b.activationId]);
  const undoB = undoMarkers(b.markers, b.entry);
  assert.deepEqual(undoB.markers, a.markers);
  const undoA = undoMarkers(undoB.markers, a.entry);
  assert.equal(undoA.markers, undefined);
});

test("Immolazione A → B → C supporta tre Undo concatenati", () => {
  const a = markerTransition({ effect: IMMOLATION, suffix: "A3", now: 100 });
  const b = markerTransition({
    effect: IMMOLATION,
    currentMarkers: a.markers,
    suffix: "B3",
    now: 200,
  });
  const c = markerTransition({
    effect: IMMOLATION,
    currentMarkers: b.markers,
    suffix: "C3",
    now: 300,
  });

  const undoC = undoMarkers(c.markers, c.entry);
  assert.deepEqual(undoC.markers, b.markers);
  const undoB = undoMarkers(undoC.markers, b.entry);
  assert.deepEqual(undoB.markers, a.markers);
  const undoA = undoMarkers(undoB.markers, a.entry);
  assert.equal(undoA.markers, undefined);
});

test("Undo B ripristina A e preserva il marker indipendente di Carne in pietra", () => {
  const a = markerTransition({ effect: IMMOLATION, suffix: "A-X", now: 100 });
  const x = markerTransition({
    effect: FLESH_TO_STONE,
    currentMarkers: a.markers,
    suffix: "X",
    now: 150,
  });
  const b = markerTransition({
    effect: IMMOLATION,
    currentMarkers: x.markers,
    suffix: "B-X",
    now: 200,
  });

  const undoB = undoMarkers(b.markers, b.entry);
  assert.deepEqual(undoB.markers, x.markers);
  assert.ok(undoB.markers[a.activationId]);
  assert.ok(undoB.markers[x.activationId]);
});

test("il delta reale ripristina tutti i marker rimossi da una compaction legacy", () => {
  const previousMarkers = Object.fromEntries([
    ...Array.from({ length: 4 }, (_, index) => [
      `${IMMOLATION.id}:turn-end:legacy-${index + 1}:${TARGET_ID}`,
      { version: 1, outcome: "failed", resolvedAt: index + 1 },
    ]),
    [
      `${FLESH_TO_STONE.id}:turn-end:independent:${TARGET_ID}`,
      { version: 1, outcome: "passed", resolvedAt: 50 },
    ],
  ]);
  const next = markerTransition({
    effect: IMMOLATION,
    currentMarkers: previousMarkers,
    suffix: "legacy-next",
    now: 100,
  });

  const beforeDelta = next.entry.effectsMutation.changes[0]
    .beforeMetadata.reminderResolutions.value;
  const afterDelta = next.entry.effectsMutation.changes[0]
    .afterMetadata.reminderResolutions.value;
  assert.equal(Object.keys(beforeDelta).length, 4);
  assert.deepEqual(Object.keys(afterDelta), [next.activationId]);
  assert.equal(beforeDelta[`${FLESH_TO_STONE.id}:turn-end:independent:${TARGET_ID}`], undefined);

  const undone = undoMarkers(next.markers, next.entry);
  assert.deepEqual(undone.markers, previousMarkers);
});

test("Carne in pietra usa la stessa catena infrastrutturale A → B → Undo B → Undo A", () => {
  const a = markerTransition({ effect: FLESH_TO_STONE, suffix: "FTS-A", now: 100 });
  const b = markerTransition({
    effect: FLESH_TO_STONE,
    currentMarkers: a.markers,
    suffix: "FTS-B",
    now: 200,
  });

  const undoB = undoMarkers(b.markers, b.entry);
  assert.deepEqual(undoB.markers, a.markers);
  const undoA = undoMarkers(undoB.markers, a.entry);
  assert.equal(undoA.markers, undefined);
});

test("un overwrite reale del marker posseduto resta fail-closed", () => {
  const a = markerTransition({ effect: IMMOLATION, suffix: "OWN-A", now: 100 });
  const b = markerTransition({
    effect: IMMOLATION,
    currentMarkers: a.markers,
    suffix: "OWN-B",
    now: 200,
  });
  const overwritten = clone(b.markers);
  overwritten[b.activationId] = { ...overwritten[b.activationId], outcome: "passed" };

  const conflict = undoMarkers(overwritten, b.entry);
  assert.equal(conflict.status, "conflict");
  assert.equal(conflict.conflicts[0].field, "reminderResolutions");
  assert.equal(conflict.conflicts[0].markerKey, b.activationId);
  assert.equal(conflict.conflicts[0].reason, "current-value-mismatch");
});

test("molte resolution forward mantengono reminderResolutions bounded", () => {
  let markers;
  for (let index = 0; index < 180; index += 1) {
    const effect = repeatedSaveEffect({
      instanceId: `bounded-effect-${index}`,
      spellId: `bounded-spell-${index}`,
      spellName: `Bounded ${index}`,
      ability: "con",
    });
    markers = markerTransition({
      effect,
      currentMarkers: markers,
      suffix: index,
      now: index + 1,
    }).markers;
    assert.ok(Object.keys(markers).length <= 128);
  }
  assert.equal(Object.keys(markers).length, 128);
});
