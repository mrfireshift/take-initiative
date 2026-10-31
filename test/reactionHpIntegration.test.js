// CAP-REACTION, lotto 2, of docs/PIANO_AUTOMAZIONE_INCANTESIMI.md (PHB 2014): Death Ward and Warding Bond in the command of
// the damage, through the real coordinator, the area executor and History.
import assert from "node:assert/strict";
import test, { mock } from "node:test";
import {
  createVersionedIndexedDB,
  versionedKeyRange,
} from "../test-support/fakeVersionedIndexedDb.js";

const previousIndexedDB = globalThis.indexedDB;
const previousKeyRange = globalThis.IDBKeyRange;
const previousLocation = globalThis.location;
globalThis.indexedDB = createVersionedIndexedDB();
globalThis.IDBKeyRange = versionedKeyRange;
globalThis.location = { pathname: "/plugin.html" };

const META_KEY = "com.thebigpicture.initiative/meta";
const STATE_KEY = "com.thebigpicture.initiative/state";
const SPELLS_KEY = "com.thebigpicture.initiative/spells";
const CONCENTRATION_KEY = "com.thebigpicture.initiative/concentration";

const clone = (value) => value === undefined ? undefined : structuredClone(value);
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

const sceneState = {
  ready: true,
  metadata: {},
  items: [],
};
const readyListeners = new Set();
const broadcastListeners = new Map();

function currentItems(ids) {
  const wanted = Array.isArray(ids) ? new Set(ids) : null;
  return sceneState.items
    .filter((item) => !wanted || wanted.has(item?.id))
    .map(clone);
}

const itemChangeListeners = new Set();

function emitItemsChange() {
  const items = sceneState.items.map(clone);
  for (const listener of [...itemChangeListeners]) {
    try { listener(items); } catch {}
  }
}

const sdkStub = {
  onReady: () => {},
  player: { getRole: async () => "GM" },
  room: { id: "reaction-hp-room", getMetadata: async () => ({}) },
  scene: {
    isReady: async () => sceneState.ready,
    onReadyChange(listener) {
      readyListeners.add(listener);
      return () => readyListeners.delete(listener);
    },
    getMetadata: async () => clone(sceneState.metadata),
    setMetadata: async (update) => {
      sceneState.metadata = { ...sceneState.metadata, ...clone(update) };
    },
    items: {
      getItems: async (predicateOrIds) => {
        if (!predicateOrIds) return currentItems();
        if (Array.isArray(predicateOrIds)) return currentItems(predicateOrIds);
        if (typeof predicateOrIds === "function") {
          return sceneState.items.filter(predicateOrIds).map(clone);
        }
        return currentItems();
      },
      updateItems: async (predicateOrIds, updater) => {
        let targets = [];
        if (typeof predicateOrIds === "function") {
          targets = sceneState.items.filter(predicateOrIds).map(clone);
        } else if (Array.isArray(predicateOrIds)) {
          const set = new Set(predicateOrIds);
          targets = sceneState.items.filter((it) => set.has(it.id)).map(clone);
        } else {
          targets = sceneState.items.map(clone);
        }
        await updater(targets);
        const byId = new Map(targets.map((item) => [item.id, item]));
        sceneState.items = sceneState.items.map((item) => byId.get(item.id) || item);
        emitItemsChange();
      },
      deleteItems: async (ids) => {
        const wanted = new Set(ids || []);
        sceneState.items = sceneState.items.filter((item) => !wanted.has(item.id));
        emitItemsChange();
      },
      addItems: async (items) => {
        sceneState.items.push(...clone(items || []));
        emitItemsChange();
      },
    },
  },
  broadcast: {
    onMessage(channel, listener) {
      const listeners = broadcastListeners.get(channel) || new Set();
      listeners.add(listener);
      broadcastListeners.set(channel, listeners);
      return () => listeners.delete(listener);
    },
    async sendMessage(channel, data) {
      for (const listener of [...(broadcastListeners.get(channel) || [])]) {
        await listener({ data: clone(data) });
      }
    },
  },
};

mock.module("@owlbear-rodeo/sdk", {
  exports: {
    default: sdkStub,
    buildLabel: (...args) => ({ type: "LABEL", args }),
    buildImage: (...args) => ({ type: "IMAGE", args }),
    buildPath: () => ({
      commands: () => ({
        fillRule: () => ({
          fillColor: () => ({
            fillOpacity: () => ({
              strokeColor: () => ({
                strokeOpacity: () => ({
                  strokeWidth: () => ({
                    position: () => ({
                      locked: () => ({
                        disableHit: () => ({
                          layer: () => ({
                            metadata: () => ({
                              name: () => ({
                                build: () => ({ id: "mock-path" }),
                              }),
                            }),
                          }),
                        }),
                      }),
                    }),
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    }),
    buildText: (...args) => ({ type: "TEXT", args }),
    buildShape: (...args) => ({ type: "SHAPE", args }),
    Command: class Command {},
  },
});

const clientEffects = await import("../src/effectsMutations.js?reaction-hp-real-client");
globalThis.location = { pathname: "/background.html" };
const backgroundEffects = await import("../src/effectsMutations.js?reaction-hp-real-background");
globalThis.location = { pathname: "/plugin.html" };
const baseEffects = await import("../src/effectsMutations.js?reaction-hp-real-base");
mock.module("../src/effectsMutations.js", {
  exports: {
    ...baseEffects,
    EFFECTS_MUTATION_STATUS: clientEffects.EFFECTS_MUTATION_STATUS,
    runEffectsMutation: clientEffects.runEffectsMutation,
    undoEffectsMutation: clientEffects.undoEffectsMutation,
    hasPendingEffectsHistory: clientEffects.hasPendingEffectsHistory,
    flushPendingEffectsHistory: clientEffects.flushPendingEffectsHistory,
  },
});

const history = await import("../src/history.js?reaction-hp-real-history");
const historyOwner = await import("../src/historyOwner.js?reaction-hp-real-owner");
mock.module("../src/history.js", { exports: { ...history } });
const { currentSceneEpoch, markSceneEpochReady } = await import("../src/sceneEpoch.js");
const { buildSpellUnifiedPanelContract } = await import("../src/spellUnifiedPanelCore.js?reaction-hp-real-panel");
const { buildSpellAreaResolutionCommand } = await import("../src/spellAreaResolutionCommandCore.js?reaction-hp-real-command");
const { executeSpellAreaResolution } = await import("../src/spellAreaResolutionExecutor.js?reaction-hp-real-executor");
const { planEffectSaveReminderNotices } = await import("../src/effectSaveReminderCore.js?reaction-hp-real-reminder-core");
const { resolveReminder, clearReminderResolutionQueue } = await import("../src/reminderResolution.js?reaction-hp-real-reminder");
const { normalizeHistoryUndoResult, HISTORY_UNDO_OUTCOME } = await import("../src/historyUndoResultCore.js");
const { refreshConditionLabels } = await import("../src/conditions.js");


async function resetScene(tokens = []) {
  historyOwner.unmountHistoryOwner();
  backgroundEffects.unmountEffectsMutationCoordinatorService();
  clearReminderResolutionQueue();
  sceneState.metadata = {
    [STATE_KEY]: {
      round: 1,
      current: 0,
      order: tokens.map((t) => t.id),
    },
    ["com.thebigpicture.initiative/history"]: {
      version: 1,
      roomId: "reaction-hp-room",
      entries: [],
    },
  };
  sceneState.items = tokens.map(clone);
  markSceneEpochReady("test-reset");
  await historyOwner.mountHistoryOwner();
  await backgroundEffects.mountEffectsMutationCoordinatorService();
}

async function convergeDeferredEffectsHistory() {
  const sceneEpoch = currentSceneEpoch();
  for (let attempt = 0; attempt < 20; attempt += 1) {
    clientEffects.flushPendingEffectsHistory(sceneEpoch);
    backgroundEffects.flushPendingEffectsHistory(sceneEpoch);
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (
      !clientEffects.hasPendingEffectsHistory(sceneEpoch)
      && !backgroundEffects.hasPendingEffectsHistory(sceneEpoch)
    ) return;
  }
  assert.fail("Deferred Effects History did not converge");
}

test.before(async () => {
  await historyOwner.mountHistoryOwner();
  await backgroundEffects.mountEffectsMutationCoordinatorService();
});

test.after(() => {
  clearReminderResolutionQueue();
  backgroundEffects.unmountEffectsMutationCoordinatorService();
  historyOwner.unmountHistoryOwner();
  globalThis.indexedDB = previousIndexedDB;
  globalThis.IDBKeyRange = previousKeyRange;
  if (previousLocation === undefined) delete globalThis.location;
  else globalThis.location = previousLocation;
});


const CASTER = "caster";
const token = (id, hp, hpMax, extra = {}) => ({ id, name: id, type: "IMAGE", layer: "CHARACTER", position: { x: 0, y: 0 },
  metadata: { [META_KEY]: { hp, hpMax, conditions: { version: 2, instances: [] }, [CONCENTRATION_KEY]: {}, [SPELLS_KEY]: [], ...extra } } });
const meta = (id) => sceneState.items.find((item) => item.id === id).metadata[META_KEY];
const pills = (id) => (meta(id).conditions?.instances || []).filter((entry) => entry.active !== false).map((entry) => entry.condition).sort();

async function undoLast() {
  const entries = await history.getHistoryEntries();
  const result = await history.undoHistoryThrough(entries.at(-1).id, { sceneEpoch: currentSceneEpoch() });
  assert.equal(normalizeHistoryUndoResult(result).outcome, HISTORY_UNDO_OUTCOME.COMMITTED, JSON.stringify(result));
}

const pill = (id, condition, mechanics, extra = {}) => ({ id, condition, active: true, mechanics, expiry: { mode: "manual" },
  endsParentOnRemoval: true, ...extra });
const conditions = (instances) => ({ conditions: { version: 2, instances } });
const ward = (id) => conditions([pill(`${id}-ward`, "Interdizione alla morte", { deathWard: true }, { targetId: id })]);
const bond = (id) => conditions([pill(`${id}-bond`, "Vincolo di interdizione", { wardingBond: true }, { targetId: id, sourceId: CASTER })]);

async function damage(itemId, amount) {
  const item = sceneState.items.find((entry) => entry.id === itemId);
  const before = item.metadata[META_KEY];
  const result = await clientEffects.runEffectsMutation([{ type: "hp:set", updates: [{
    itemId, hp: Math.max(0, before.hp - amount), hpMax: before.hpMax,
    hpIntent: { mode: "damage", amount, eventId: `hit-${itemId}-${amount}` },
  }] }], { kind: "hp", label: `Danno a ${itemId}`, targetIds: [itemId], history: { kind: "hp", label: `Danno a ${itemId}` } });
  clientEffects.requireAppliedEffectsMutation(result);
  await convergeDeferredEffectsHistory();
  return result;
}

async function castOn(spellId, slotLevel, targetId, { amount, outcome } = {}) {
  const contract = buildSpellUnifiedPanelContract({ spellId, phase: "cast", castContext: { slotLevel } });
  const command = buildSpellAreaResolutionCommand({
    contract, spellId, phase: "cast", casterId: "wizard", slotLevel, targetIds: [targetId],
    ...(outcome ? { outcomes: { [targetId]: outcome } } : {}),
    ...(amount !== undefined ? { hpAmount: amount } : {}),
    validateSpatial: false,
  });
  assert.equal(command.valid, true, JSON.stringify(command.errors));
  const result = await executeSpellAreaResolution(command, {
    getItems: sdkStub.scene.items.getItems,
    updateItems: sdkStub.scene.items.updateItems,
    deleteItems: sdkStub.scene.items.deleteItems,
    getSceneMetadata: sdkStub.scene.getMetadata,
    setSceneMetadata: sdkStub.scene.setMetadata,
    currentSceneEpoch,
    isCurrent: () => true,
    syncHPVisuals: async () => {},
    emitFireballVisual: async () => {},
    withItemMetaHistory: history.withItemMetaHistory,
  });
  assert.equal(result.status, "applied", JSON.stringify(result.errors || result));
  await convergeDeferredEffectsHistory();
  return result;
}

test("Death Ward in the coordinator: damage that would drop to 0 leaves 1 HP and ends the ward; one Undo brings it back", async () => {
  await resetScene([token(CASTER, 30, 30), token("hero", 10, 40, { attitude: "pc", ...ward("hero") })]);
  await damage("hero", 25);
  assert.equal(meta("hero").hp, 1);
  assert.deepEqual(pills("hero"), [], "no ward, no Privo di sensi");
  await damage("hero", 5);
  assert.equal(meta("hero").hp, 0, "only the first time");
  await undoLast();
  await undoLast();
  assert.equal(meta("hero").hp, 10);
  assert.deepEqual(pills("hero"), ["Interdizione alla morte"]);
});

test("Warding Bond in the coordinator: the caster takes the same damage in the same command; at 0 HP the bond ends", async () => {
  await resetScene([token(CASTER, 12, 30), token("hero", 40, 40, bond("hero"))]);
  await damage("hero", 7);
  assert.deepEqual([meta("hero").hp, meta(CASTER).hp], [33, 5]);
  assert.deepEqual(pills("hero"), ["Vincolo di interdizione"]);
  await damage("hero", 6);
  assert.deepEqual([meta("hero").hp, meta(CASTER).hp], [27, 0]);
  assert.deepEqual(pills("hero"), [], "the caster at 0 HP ends the bond");
  await undoLast();
  assert.deepEqual([meta("hero").hp, meta(CASTER).hp], [33, 5], "one Undo for both creatures");
  assert.deepEqual(pills("hero"), ["Vincolo di interdizione"]);
});

test("Death Ward in the area command: Power Word Kill does nothing but end the ward; Disintegrate leaves 1 HP", async () => {
  await resetScene([token("wizard", 30, 30), token("orc", 50, 60, { attitude: "enemy", ...ward("orc") })]);
  const result = await castOn("power-word-kill", 9, "orc");
  assert.equal(meta("orc").hp, 50, "no death");
  assert.deepEqual(pills("orc"), []);
  assert.ok(result.notes?.some((note) => /non muore/u.test(note)), JSON.stringify(result.notes));
  await resetScene([token("wizard", 30, 30), token("orc", 20, 60, { attitude: "enemy", ...ward("orc") })]);
  await castOn("disintegrate", 6, "orc", { amount: 75, outcome: "failed" });
  assert.equal(meta("orc").hp, 1, "not reduced to dust");
  assert.deepEqual(pills("orc"), []);
});

test("Warding Bond in the area command: the caster's own entry, with its History", async () => {
  await resetScene([token(CASTER, 30, 30), token("wizard", 30, 30), token("hero", 40, 40, bond("hero"))]);
  await castOn("disintegrate", 6, "hero", { amount: 12, outcome: "failed" });
  assert.deepEqual([meta("hero").hp, meta(CASTER).hp], [28, 18]);
  await undoLast();
  assert.deepEqual([meta("hero").hp, meta(CASTER).hp], [40, 30]);
});
