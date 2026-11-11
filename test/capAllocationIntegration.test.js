// Mass Heal (CAP-ALLOCATION) in the area command, through the real executor, coordinator and History: 700 hit points
// split among the targets, Heal's conditions ended, undead and dead creatures left as they are, one Undo.
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
  room: { id: "cap-allocation-room", getMetadata: async () => ({}) },
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

const clientEffects = await import("../src/effectsMutations.js?cap-allocation-real-client");
globalThis.location = { pathname: "/background.html" };
const backgroundEffects = await import("../src/effectsMutations.js?cap-allocation-real-background");
globalThis.location = { pathname: "/plugin.html" };
const baseEffects = await import("../src/effectsMutations.js?cap-allocation-real-base");
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

const history = await import("../src/history.js?cap-allocation-real-history");
const historyOwner = await import("../src/historyOwner.js?cap-allocation-real-owner");
mock.module("../src/history.js", { exports: { ...history } });
const { currentSceneEpoch, markSceneEpochReady } = await import("../src/sceneEpoch.js");
const { buildSpellUnifiedPanelContract } = await import("../src/spellUnifiedPanelCore.js?cap-allocation-real-panel");
const { buildSpellAreaResolutionCommand } = await import("../src/spellAreaResolutionCommandCore.js?cap-allocation-real-command");
const { executeSpellAreaResolution } = await import("../src/spellAreaResolutionExecutor.js?cap-allocation-real-executor");
const { planEffectSaveReminderNotices } = await import("../src/effectSaveReminderCore.js?cap-allocation-real-reminder-core");
const { resolveReminder, clearReminderResolutionQueue } = await import("../src/reminderResolution.js?cap-allocation-real-reminder");
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
      roomId: "cap-allocation-room",
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

const SPELL_ID = "mass-heal";

async function massHeal(targetIds, shares = {}, { status = "applied" } = {}) {
  const contract = buildSpellUnifiedPanelContract({ spellId: SPELL_ID, phase: "cast", castContext: { slotLevel: 9 } });
  const command = buildSpellAreaResolutionCommand({
    contract, spellId: SPELL_ID, phase: "cast", casterId: CASTER, slotLevel: 9, targetIds,
    targetContexts: Object.fromEntries(Object.entries(shares).map(([id, share]) => [id, { share }])),
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
  assert.equal(result.status, status, JSON.stringify(result.errors || result.message || result));
  if (status === "applied") await convergeDeferredEffectsHistory();
  return result;
}

test("A-D1: everyone back to full while the 700 last, in the targets' order; one Undo for all", async () => {
  await resetScene([token(CASTER, 50, 50), token("dars", 10, 60), token("sera", 0, 38, { attitude: "pc" }), token("bryn", 20, 20)]);
  await massHeal(["dars", "sera", "bryn"]);
  assert.equal(meta("dars").hp, 60);
  assert.equal(meta("sera").hp, 38);
  assert.equal(meta("bryn").hp, 20);
  const entry = (await history.getHistoryEntries()).at(-1);
  assert.equal(entry.label, "Incantesimo · Guarigione di massa");
  await undoLast();
  assert.equal(meta("dars").hp, 10);
  assert.equal(meta("sera").hp, 0);
});

test("the 700 run out: the last targets take what is left", async () => {
  await resetScene([token(CASTER, 50, 50), token("a", 0, 300), token("b", 0, 300), token("c", 0, 300), token("d", 0, 300)]);
  await massHeal(["a", "b", "c", "d"]);
  assert.deepEqual(["a", "b", "c", "d"].map((id) => meta(id).hp), [300, 300, 100, 0]);
});

test("a box the GM writes comes first and stops at what the creature misses", async () => {
  await resetScene([token(CASTER, 50, 50), token("dars", 10, 60), token("sera", 5, 38)]);
  await massHeal(["dars", "sera"], { dars: "20", sera: "500" });
  assert.equal(meta("dars").hp, 30);
  assert.equal(meta("sera").hp, 38);
});

test("A-D2: Accecato, Assordato and Contagion's disease end, on a creature already at full HP too", async () => {
  await resetScene([token(CASTER, 50, 50), token("dars", 60, 60, conditions([
    pill("blind", "Accecato", "dars"),
    pill("deaf", "Assordato", "dars"),
    pill("fear", "Spaventato", "dars"),
    pill("fever", "Contagio: Febbre", "dars", { effectId: "contagion-fever" }),
  ]))]);
  await massHeal(["dars"]);
  assert.deepEqual(pills("dars"), ["Spaventato"]);
  assert.equal(meta("dars").hp, 60);
});

test("A-D3 and A-D4: an undead and a dead creature stay as they are, with a note", async () => {
  await resetScene([token(CASTER, 50, 50), token("zombie", 5, 22, { creatureType: "Non morto" }),
    token("bryn", 0, 30, { attitude: "pc", ...conditions([pill("dead", "Morto", "bryn")]) }), token("dars", 10, 60)]);
  const result = await massHeal(["zombie", "bryn", "dars"]);
  assert.equal(meta("zombie").hp, 5);
  assert.equal(meta("bryn").hp, 0);
  assert.equal(meta("dars").hp, 60);
  assert.ok((result.notes || []).some((note) => /zombie: nessun effetto su costrutti e non morti/u.test(note)), JSON.stringify(result.notes));
  assert.ok((result.notes || []).some((note) => /bryn: è morta/u.test(note)), JSON.stringify(result.notes));
});

test("beyond the 700 or a box that is not a number: the cast is refused and nothing changes", async () => {
  await resetScene([token(CASTER, 50, 50), token("a", 0, 500), token("b", 0, 500)]);
  const before = (await history.getHistoryEntries()).length;
  const over = await massHeal(["a", "b"], { a: "400", b: "400" }, { status: "rejected" });
  assert.match(JSON.stringify(over.errors || over), /PF assegnati 800\/700/u);
  assert.equal(meta("a").hp, 0);
  assert.equal((await history.getHistoryEntries()).length, before);
});

test("an undead first in the order takes nothing on its own: the 700 go to the creatures the spell heals", async () => {
  await resetScene([token(CASTER, 50, 50), token("zombie", 0, 300, { creatureType: "Non morto" }),
    token("a", 0, 300), token("b", 0, 300), token("c", 0, 300)]);
  await massHeal(["zombie", "a", "b", "c"]);
  assert.deepEqual(["zombie", "a", "b", "c"].map((id) => meta(id).hp), [0, 300, 300, 100]);
});
