// Life Transference (CAP-RELATION) in the area command, through the real executor, coordinator and History: the
// caster's damage, which nothing reduces, and the creature's healing, twice the damage taken, in one Undo.
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
  room: { id: "cap-relation-room", getMetadata: async () => ({}) },
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

const clientEffects = await import("../src/effectsMutations.js?cap-relation-real-client");
globalThis.location = { pathname: "/background.html" };
const backgroundEffects = await import("../src/effectsMutations.js?cap-relation-real-background");
globalThis.location = { pathname: "/plugin.html" };
const baseEffects = await import("../src/effectsMutations.js?cap-relation-real-base");
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

const history = await import("../src/history.js?cap-relation-real-history");
const historyOwner = await import("../src/historyOwner.js?cap-relation-real-owner");
mock.module("../src/history.js", { exports: { ...history } });
const { currentSceneEpoch, markSceneEpochReady } = await import("../src/sceneEpoch.js");
const { buildSpellUnifiedPanelContract } = await import("../src/spellUnifiedPanelCore.js?cap-relation-real-panel");
const { buildSpellAreaResolutionCommand } = await import("../src/spellAreaResolutionCommandCore.js?cap-relation-real-command");
const { executeSpellAreaResolution } = await import("../src/spellAreaResolutionExecutor.js?cap-relation-real-executor");
const { planEffectSaveReminderNotices } = await import("../src/effectSaveReminderCore.js?cap-relation-real-reminder-core");
const { resolveReminder, clearReminderResolutionQueue } = await import("../src/reminderResolution.js?cap-relation-real-reminder");
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
      roomId: "cap-relation-room",
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

const pill = (id, condition, targetId, extra = {}) => ({ id, condition, active: true, targetId, expiry: { mode: "manual" }, ...extra });
const conditions = (instances) => ({ conditions: { version: 2, instances } });

const concentrationWarnings = [];
sdkStub.broadcast.onMessage("com.thebigpicture.initiative/concentration-warning", (event) => {
  if (event.data?.type === "show-concentration-warning") concentrationWarnings.push(...event.data.warnings);
});

const SPELL_ID = "xanathar-trasferimento-di-vita";

async function transfer(targetIds, amount, { slotLevel = 3, status = "applied" } = {}) {
  const contract = buildSpellUnifiedPanelContract({ spellId: SPELL_ID, phase: "cast", castContext: { slotLevel } });
  const command = buildSpellAreaResolutionCommand({
    contract, spellId: SPELL_ID, phase: "cast", casterId: CASTER, slotLevel, targetIds,
    hp: { mode: "damage", amount },
    validateSpatial: false,
  });
  assert.equal(command.valid, true, JSON.stringify(command.errors));
  concentrationWarnings.length = 0;
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
  assert.equal(result.status, status, JSON.stringify(result.errors || result.message || result));
  if (status === "applied") await convergeDeferredEffectsHistory();
  return result;
}

const resistsNecrotic = { initiativeCard: { damageDefenses: { resistances: ["necrotic"] } } };

test("the caster takes the whole roll and the creature chosen regains twice of it; one Undo for both", async () => {
  await resetScene([token(CASTER, 40, 40), token("dars", 10, 60)]);
  await transfer(["dars"], 18);
  assert.equal(meta(CASTER).hp, 22);
  assert.equal(meta("dars").hp, 46);
  const entry = (await history.getHistoryEntries()).at(-1);
  assert.equal(entry.label, "Incantesimo · Trasferimento di Vita");
  await undoLast();
  assert.equal(meta(CASTER).hp, 40);
  assert.equal(meta("dars").hp, 10);
});

test("R-D1: nothing reduces the caster's damage, its necrotic resistance included", async () => {
  await resetScene([token(CASTER, 40, 40, resistsNecrotic), token("dars", 10, 60)]);
  await transfer(["dars"], 18);
  assert.equal(meta(CASTER).hp, 22, "18, not 9");
  assert.equal(meta("dars").hp, 46);
});

test("R-D2: temporary hit points take the damage first, and the healing counts all of it", async () => {
  await resetScene([token(CASTER, 30, 30, { tempHp: 10 }), token("dars", 10, 60)]);
  await transfer(["dars"], 18);
  assert.equal(meta(CASTER).tempHp ?? 0, 0);
  assert.equal(meta(CASTER).hp, 22);
  assert.equal(meta("dars").hp, 46);
});

test("a PC caster brought to 0 HP falls unconscious: the creature still regains twice the whole roll", async () => {
  await resetScene([token(CASTER, 10, 30, { attitude: "pc" }), token("dars", 10, 60)]);
  await transfer(["dars"], 18);
  assert.equal(meta(CASTER).hp, 0);
  assert.ok(pills(CASTER).includes("Privo di sensi"), JSON.stringify(pills(CASTER)));
  assert.equal(meta("dars").hp, 46);
});

test("4d8 + 1d8 per slot above the 3rd: the roll the GM writes is the damage", async () => {
  await resetScene([token(CASTER, 60, 60), token("dars", 0, 80)]);
  await transfer(["dars"], 27, { slotLevel: 5 });
  assert.equal(meta(CASTER).hp, 33);
  assert.equal(meta("dars").hp, 54);
});

test("R-D3: the caster cannot choose itself; nothing changes", async () => {
  await resetScene([token(CASTER, 40, 40), token("dars", 10, 60)]);
  const before = (await history.getHistoryEntries()).length;
  const result = await transfer([CASTER], 18, { status: "rejected" });
  assert.match(JSON.stringify(result.errors || result), /non può scegliere sé stesso/u);
  assert.equal(meta(CASTER).hp, 40);
  assert.equal((await history.getHistoryEntries()).length, before);
});
