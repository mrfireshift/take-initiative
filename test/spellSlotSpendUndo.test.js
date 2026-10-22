// A spell slot spent with the cast: same command, same History entry, given back by the production Undo.
// Harness: the in-memory SDK, effects coordinator and History owner of immolationRealUndoRepro.test.js.
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
  room: { id: "spell-slot-room", getMetadata: async () => ({}) },
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

const clientEffects = await import("../src/effectsMutations.js?slot-real-client");
globalThis.location = { pathname: "/background.html" };
const backgroundEffects = await import("../src/effectsMutations.js?slot-real-background");
globalThis.location = { pathname: "/plugin.html" };
const baseEffects = await import("../src/effectsMutations.js?slot-real-base");
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

const history = await import("../src/history.js?slot-real-history");
const historyOwner = await import("../src/historyOwner.js?slot-real-owner");
mock.module("../src/history.js", { exports: { ...history } });
const { currentSceneEpoch, markSceneEpochReady } = await import("../src/sceneEpoch.js");
const { buildSpellUnifiedPanelContract } = await import("../src/spellUnifiedPanelCore.js?slot-real-panel");
const { buildSpellAreaResolutionCommand } = await import("../src/spellAreaResolutionCommandCore.js?slot-real-command");
const { executeSpellAreaResolution } = await import("../src/spellAreaResolutionExecutor.js?slot-real-executor");
const { executeSpellApplication } = await import("../src/spellApplicationExecutor.js?slot-real-application");
const { getSpellDefinition } = await import("../src/spells-srd.js");
const { normalizeHistoryUndoResult, HISTORY_UNDO_OUTCOME } = await import("../src/historyUndoResultCore.js");
const { planSpellSlotSpend, spellSlotSpendOperation } = await import("../src/spellSlotSpendCore.js");

const CASTER_ID = "caster-slot";
const TARGET_ID = "target-slot";
const BUILD = [{ classId: "mago", level: 9 }];

async function resetScene() {
  historyOwner.unmountHistoryOwner();
  backgroundEffects.unmountEffectsMutationCoordinatorService();
  sceneState.metadata = {
    [STATE_KEY]: { round: 1, current: 0, order: [CASTER_ID, TARGET_ID] },
    ["com.thebigpicture.initiative/history"]: { version: 1, roomId: "spell-slot-room", entries: [] },
  };
  const token = (id, name, x, extra = {}) => ({
    id,
    name,
    layer: "CHARACTER",
    position: { x, y: 0 },
    metadata: { [META_KEY]: { hp: 60, hpMax: 60, inInitiative: true, conditions: [], [CONCENTRATION_KEY]: {}, [SPELLS_KEY]: [], ...extra } },
  });
  sceneState.items = [
    token(CASTER_ID, "Maga", 0, { attitude: "pc", initiativeCard: { characterBuild: BUILD } }),
    token(TARGET_ID, "Nemico", 200),
  ];
  markSceneEpochReady("slot-reset");
  await historyOwner.mountHistoryOwner();
  await backgroundEffects.mountEffectsMutationCoordinatorService();
}

async function convergeDeferredEffectsHistory() {
  const sceneEpoch = currentSceneEpoch();
  for (let attempt = 0; attempt < 20; attempt += 1) {
    clientEffects.flushPendingEffectsHistory(sceneEpoch);
    backgroundEffects.flushPendingEffectsHistory(sceneEpoch);
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (!clientEffects.hasPendingEffectsHistory(sceneEpoch) && !backgroundEffects.hasPendingEffectsHistory(sceneEpoch)) return;
  }
  assert.fail("Deferred Effects History did not converge");
}

async function casterSlots() {
  const [caster] = await sdkStub.scene.items.getItems([CASTER_ID]);
  return caster.metadata[META_KEY].classFeatureState?.resources || {};
}

function slotOperation(spellLevel) {
  const { spend } = planSpellSlotSpend({ characterBuild: BUILD, spellLevel });
  return spellSlotSpendOperation({ sourceId: CASTER_ID, poolId: spend.poolId, characterBuild: BUILD });
}

async function undoLast() {
  await convergeDeferredEffectsHistory();
  const entries = await history.getHistoryEntries();
  const last = entries[entries.length - 1];
  const result = normalizeHistoryUndoResult(await history.undoHistoryThrough(last.id, { sceneEpoch: currentSceneEpoch() }));
  assert.equal(result.outcome, HISTORY_UNDO_OUTCOME.COMMITTED, `Undo: ${result.outcome}`);
  return { entries, last };
}

const areaRuntime = () => ({
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

function immolationCommand(targetIds) {
  const contract = buildSpellUnifiedPanelContract({ spellId: "xanathar-immolazione" });
  return buildSpellAreaResolutionCommand({
    contract,
    spellId: "xanathar-immolazione",
    phase: "cast",
    casterId: CASTER_ID,
    slotLevel: 5,
    targetIds,
    outcomes: Object.fromEntries(targetIds.map((id) => [id, "failed"])),
    hpAmount: 28,
    validateSpatial: false,
  });
}

test.after(() => {
  backgroundEffects.unmountEffectsMutationCoordinatorService();
  historyOwner.unmountHistoryOwner();
  globalThis.indexedDB = previousIndexedDB;
  globalThis.IDBKeyRange = previousKeyRange;
  if (previousLocation === undefined) delete globalThis.location;
  else globalThis.location = previousLocation;
});

test("area cast: the slot is spent in the spell's command and the Undo gives it back", async () => {
  await resetScene();
  const result = await executeSpellAreaResolution(immolationCommand([TARGET_ID]), {
    ...areaRuntime(),
    extraOperations: [slotOperation(5)],
  });
  assert.equal(result.status, "applied");
  assert.deepEqual((await casterSlots())["spell-slot-5"], { current: 0, maximum: 1, unlimited: false });
  const [target] = await sdkStub.scene.items.getItems([TARGET_ID]);
  assert.equal(target.metadata[META_KEY].hp, 32);
  const { entries } = await undoLast();
  assert.equal(entries.length, 1, "spell and slot share one History entry");
  assert.equal((await casterSlots())["spell-slot-5"]?.current ?? 1, 1);
  const [restored] = await sdkStub.scene.items.getItems([TARGET_ID]);
  assert.equal(restored.metadata[META_KEY].hp, 60);
});

test("lifecycle cast: the slot is spent with the spell and the Undo gives it back", async () => {
  await resetScene();
  await executeSpellApplication({
    spell: getSpellDefinition("bless"),
    casterId: CASTER_ID,
    targetIds: [TARGET_ID],
    turns: 10,
    castContext: { slotLevel: 1, phase: "cast" },
    extraOperations: [slotOperation(1)],
  });
  const [caster] = await sdkStub.scene.items.getItems([CASTER_ID]);
  assert.ok(Object.keys(caster.metadata[META_KEY][CONCENTRATION_KEY] || {}).length, "Bless is cast");
  assert.equal((await casterSlots())["spell-slot-1"].current, 3);
  const { entries } = await undoLast();
  assert.equal(entries.length, 1, "spell and slot share one History entry");
  assert.equal((await casterSlots())["spell-slot-1"]?.current ?? 4, 4);
});

test("a cast without extra operations leaves the resources alone", async () => {
  await resetScene();
  await executeSpellApplication({
    spell: getSpellDefinition("bless"),
    casterId: CASTER_ID,
    targetIds: [TARGET_ID],
    turns: 10,
    castContext: { slotLevel: 1, phase: "cast" },
  });
  assert.deepEqual(await casterSlots(), {});
});

test("a Fireball that catches nobody still spends the slot, and the Undo gives it back", async () => {
  await resetScene();
  const contract = buildSpellUnifiedPanelContract({ spellId: "fireball", phase: "cast" });
  const ruleId = contract.presentation?.placement?.ruleId;
  const preview = { type: "circle", start: { x: 900, y: 900 }, end: { x: 1050, y: 900 }, gridOrigin: { x: 0, y: 0 }, dpi: 150, targetIds: [], targetLocked: true };
  const command = buildSpellAreaResolutionCommand({
    contract,
    spellId: "fireball",
    phase: "cast",
    casterId: CASTER_ID,
    slotLevel: 3,
    targetIds: [],
    candidateTargetIds: [],
    outcomes: {},
    placement: { status: "confirmed", confirmed: true, ruleId, spellId: "fireball", casterId: CASTER_ID, targetLocked: true, targetIds: [], preview },
    targetLocked: true,
    hp: { mode: "damage", amount: 12 },
    validateSpatial: false,
  });
  assert.equal(command.valid, true);
  const result = await executeSpellAreaResolution(command, { ...areaRuntime(), extraOperations: [slotOperation(3)] });
  assert.notEqual(result.status, "rejected");
  assert.equal((await casterSlots())["spell-slot-3"].current, 2);
  await undoLast();
  assert.equal((await casterSlots())["spell-slot-3"]?.current ?? 3, 3);
});
