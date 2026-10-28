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
  room: { id: "hp-branch-room", getMetadata: async () => ({}) },
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

const clientEffects = await import("../src/effectsMutations.js?area-concentration-zones-client");
globalThis.location = { pathname: "/background.html" };
const backgroundEffects = await import("../src/effectsMutations.js?area-concentration-zones-background");
globalThis.location = { pathname: "/plugin.html" };
const baseEffects = await import("../src/effectsMutations.js?area-concentration-zones-base");
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

const history = await import("../src/history.js?area-concentration-zones-history");
const historyOwner = await import("../src/historyOwner.js?area-concentration-zones-owner");
mock.module("../src/history.js", { exports: { ...history } });
const { currentSceneEpoch, markSceneEpochReady } = await import("../src/sceneEpoch.js");
const { buildSpellUnifiedPanelContract } = await import("../src/spellUnifiedPanelCore.js?area-concentration-zones-panel");
const { buildSpellAreaResolutionCommand } = await import("../src/spellAreaResolutionCommandCore.js?area-concentration-zones-command");
const { executeSpellAreaResolution } = await import("../src/spellAreaResolutionExecutor.js?area-concentration-zones-executor");
const { planEffectSaveReminderNotices } = await import("../src/effectSaveReminderCore.js?area-concentration-zones-reminder-core");
const { resolveReminder, clearReminderResolutionQueue } = await import("../src/reminderResolution.js?area-concentration-zones-reminder");
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
      roomId: "hp-branch-room",
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

async function cast(spellId, slotLevel, targetId, { outcome = "", amount, status = "applied" } = {}) {
  const contract = buildSpellUnifiedPanelContract({ spellId, phase: "cast", castContext: { slotLevel } });
  const command = buildSpellAreaResolutionCommand({
    contract, spellId, phase: "cast", casterId: CASTER, slotLevel, targetIds: [targetId],
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
  assert.equal(result.status, status, JSON.stringify(result.errors || result.message || result));
  await convergeDeferredEffectsHistory();
  return result;
}


const ZONE_KEY = "com.thebigpicture.initiative/spellStaticZone";
const AREA_KEY = "com.thebigpicture.initiative/aoeArea";
const zoneRoot = (id, spellId, instanceId) => ({ id, name: `Zona: ${spellId}`, type: "PATH", layer: "DRAWING", position: { x: 0, y: 0 },
  metadata: {
    [ZONE_KEY]: { version: 1, role: "root", instanceId, spellId, ruleId: `${spellId}:cast`, casterId: CASTER },
    [AREA_KEY]: { version: 2, type: "square", start: { x: 0, y: 0 }, end: { x: 300, y: 300 }, dpi: 150, gridOrigin: { x: 0, y: 0 }, basePosition: { x: 0, y: 0 } },
  } });

// Lot L24 of the bugfix pass (MP-01): every concentration cast plans concentration:break, also when the caster holds
// nothing. The area executor then deleted every zone of the caster before the commit, those kept without
// concentration too (Guardian of Faith, Grease, a Glyph).
test("L24: un incantesimo a concentrazione lascia le zone senza concentrazione del caster", async () => {
  const grease = { spellId: "grease", instanceId: "grease-1", casterId: CASTER, name: "Unto", conc: false, turns: 10 };
  await resetScene([
    token(CASTER, 30, 30, { attitude: "pc", [SPELLS_KEY]: [grease] }),
    token("ogre", 59, 59, { attitude: "enemy" }),
    zoneRoot("grease-zone", "grease", "grease-1"),
  ]);
  await cast("bane", 1, "ogre", { outcome: "failed" });
  assert.ok(sceneState.items.some((item) => item.id === "grease-zone"), "Grease keeps its zone");
  assert.deepEqual((meta(CASTER)[SPELLS_KEY] || []).map((spell) => spell.spellId), ["grease"]);
});

test("L24: la zona dell'incantesimo su cui il caster si concentra finisce con il nuovo incantesimo", async () => {
  const web = { spellId: "web", instanceId: "web-1", casterId: CASTER, name: "Ragnatela", conc: true, turns: 600 };
  await resetScene([
    token(CASTER, 30, 30, {
      attitude: "pc",
      [SPELLS_KEY]: [web],
      [CONCENTRATION_KEY]: { ragnatela: { name: "Ragnatela", spellId: "web", instanceId: "web-1", casterId: CASTER, targets: [CASTER] } },
    }),
    token("ogre", 59, 59, { attitude: "enemy" }),
    zoneRoot("web-zone", "web", "web-1"),
  ]);
  await cast("bane", 1, "ogre", { outcome: "failed" });
  assert.ok(!sceneState.items.some((item) => item.id === "web-zone"), "the concentration zone ends");
});

// Lot L24 of the bugfix pass (MP-05): Mano arcana brought to 0 HP by an area spell left the map, but its spell and the
// caster's concentration stayed; an HP write ends both (planZeroHpSpellBoardToken).
test("L24: la Mano arcana portata a 0 PF da un'area chiude incantesimo e concentrazione", async () => {
  const BOARD_KEY = "com.thebigpicture.initiative/spellBoardToken";
  const parent = {
    spellId: "arcane-hand", instanceId: "hand-1", casterId: CASTER, name: "Mano arcana", conc: true, turns: 10,
    castContext: { slotLevel: 5, boardToken: true },
  };
  await resetScene([
    token(CASTER, 60, 60, { attitude: "pc", [SPELLS_KEY]: [parent], [CONCENTRATION_KEY]: { "mano arcana": { ...parent, targets: [CASTER] } } }),
    { id: "hand", name: "Mano arcana (caster)", type: "IMAGE", layer: "PROP", position: { x: 0, y: 0 },
      metadata: { [META_KEY]: { hp: 10, hpMax: 60, attitude: "pc" },
        [BOARD_KEY]: { version: 1, kind: "spell-board-token", spellId: "arcane-hand", instanceId: "hand-1", casterId: CASTER,
          state: { revision: 0, hp: 60, hpMax: 60, mode: "", targetIds: [] } } } },
    token("ogre", 59, 59, { attitude: "enemy" }),
  ]);
  await cast("blight", 4, "hand", { outcome: "failed", amount: 12 });
  assert.ok(!sceneState.items.some((item) => item.id === "hand"), "the hand leaves the map");
  assert.deepEqual(meta(CASTER)[SPELLS_KEY] || [], []);
  assert.deepEqual(Object.keys(meta(CASTER)[CONCENTRATION_KEY] || {}), []);
});

// Lot L8 of the bugfix pass (AV-03, decision D4): a creature brought to 0 HP loses its concentration. Privo di sensi
// broke it only for a character; a monster at 0 HP kept concentrating, and Morto (instant death) never broke it.
test("L8: un mostro concentrato portato a 0 PF perde la concentrazione", async () => {
  const bane = { spellId: "bane", instanceId: "bane-1", casterId: "cleric", name: "Anatema", conc: true, turns: 10 };
  await resetScene([
    token(CASTER, 30, 30, { attitude: "pc" }),
    token("cleric", 8, 30, {
      attitude: "enemy",
      [SPELLS_KEY]: [bane],
      [CONCENTRATION_KEY]: { anatema: { ...bane, targets: ["cleric"] } },
    }),
  ]);
  await cast("blight", 4, "cleric", { outcome: "failed", amount: 20 });
  assert.equal(meta("cleric").hp, 0);
  assert.deepEqual(Object.keys(meta("cleric")[CONCENTRATION_KEY] || {}), []);
  assert.deepEqual(meta("cleric")[SPELLS_KEY] || [], []);
});

test("L8: un PG concentrato ucciso sul colpo (danno massiccio) perde la concentrazione", async () => {
  const bless = { spellId: "bless", instanceId: "bless-1", casterId: "aria", name: "Benedizione", conc: true, turns: 10 };
  await resetScene([
    token(CASTER, 30, 30, { attitude: "pc" }),
    token("aria", 12, 20, {
      attitude: "pc",
      [SPELLS_KEY]: [bless],
      [CONCENTRATION_KEY]: { benedizione: { ...bless, targets: ["aria"] } },
    }),
  ]);
  await cast("blight", 8, "aria", { outcome: "failed", amount: 35 });
  assert.equal(meta("aria").hp, 0);
  assert.ok(pills("aria").includes("Morto"), JSON.stringify(pills("aria")));
  assert.deepEqual(Object.keys(meta("aria")[CONCENTRATION_KEY] || {}), []);
});

test("L8: anche una scrittura dei PF dal coordinatore (console PF, console Boss) a 0 PF rompe la concentrazione", async () => {
  const bane = { spellId: "bane", instanceId: "bane-2", casterId: "cleric", name: "Anatema", conc: true, turns: 10 };
  await resetScene([
    token(CASTER, 30, 30, { attitude: "pc" }),
    token("cleric", 8, 30, {
      attitude: "enemy",
      [SPELLS_KEY]: [bane],
      [CONCENTRATION_KEY]: { anatema: { ...bane, targets: ["cleric"] } },
    }),
  ]);
  const result = await clientEffects.runEffectsMutation([{
    type: "hp:set", updates: [{ itemId: "cleric", hp: 0, hpMax: 30 }],
  }], { kind: "hp", label: "Danno", targetIds: ["cleric"], history: false });
  assert.equal(result.status, "applied", JSON.stringify(result));
  await convergeDeferredEffectsHistory();
  assert.equal(meta("cleric").hp, 0);
  assert.deepEqual(Object.keys(meta("cleric")[CONCENTRATION_KEY] || {}), []);
});
