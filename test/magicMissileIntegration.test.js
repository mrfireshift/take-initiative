// Magic Missile in the area command, through the real executor, coordinator and History (PHB 2014 text):
// the darts split among the targets, each one its own damage (resistance, Shield, concentration, death saves).
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
  room: { id: "magic-missile-room", getMetadata: async () => ({}) },
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

const clientEffects = await import("../src/effectsMutations.js?magic-missile-real-client");
globalThis.location = { pathname: "/background.html" };
const backgroundEffects = await import("../src/effectsMutations.js?magic-missile-real-background");
globalThis.location = { pathname: "/plugin.html" };
const baseEffects = await import("../src/effectsMutations.js?magic-missile-real-base");
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

const history = await import("../src/history.js?magic-missile-real-history");
const historyOwner = await import("../src/historyOwner.js?magic-missile-real-owner");
mock.module("../src/history.js", { exports: { ...history } });
const { currentSceneEpoch, markSceneEpochReady } = await import("../src/sceneEpoch.js");
const { buildSpellUnifiedPanelContract } = await import("../src/spellUnifiedPanelCore.js?magic-missile-real-panel");
const { buildSpellAreaResolutionCommand } = await import("../src/spellAreaResolutionCommandCore.js?magic-missile-real-command");
const { executeSpellAreaResolution } = await import("../src/spellAreaResolutionExecutor.js?magic-missile-real-executor");
const { planEffectSaveReminderNotices } = await import("../src/effectSaveReminderCore.js?magic-missile-real-reminder-core");
const { resolveReminder, clearReminderResolutionQueue } = await import("../src/reminderResolution.js?magic-missile-real-reminder");
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
      roomId: "magic-missile-room",
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

async function castDarts(darts, { slotLevel = 1, status = "applied" } = {}) {
  const targetIds = Object.keys(darts);
  const contract = buildSpellUnifiedPanelContract({ spellId: "magic-missile", phase: "cast", castContext: { slotLevel } });
  const command = buildSpellAreaResolutionCommand({
    contract, spellId: "magic-missile", phase: "cast", casterId: CASTER, slotLevel, targetIds,
    targetContexts: Object.fromEntries(Object.entries(darts).map(([id, value]) => [id, { darts: value }])),
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

const resistant = { initiativeCard: { damageDefenses: { resistances: ["force"] } } };
const shield = conditions([pill("shield", "Scudo", "shielded", { mechanics: { immunities: ["magic-missile"] } })]);

test("each dart its own roll: 2 darts of 4 and 3 on the goblin, one of 5 halved on the orc; one Undo", async () => {
  await resetScene([token(CASTER, 30, 30), token("goblin", 20, 20), token("orc", 20, 20, resistant)]);
  const result = await castDarts({ goblin: "4 3", orc: "5" });
  assert.equal(meta("goblin").hp, 13);
  assert.equal(meta("orc").hp, 18, "5 halved: 2");
  assert.deepEqual(result.notes, ["goblin: 2 dardi · 4 + 3 = 7", "orc: 1 dardo · 2 (resistenza)"]);
  const entry = (await history.getHistoryEntries()).at(-1);
  assert.equal(entry.label, "Incantesimo · Dardo incantato");
  assert.equal(entry.payload.castWithoutSave, true);
  await undoLast();
  assert.equal(meta("goblin").hp, 20);
  assert.equal(meta("orc").hp, 20);
});

test("five darts at 3rd level; Shield blocks its darts", async () => {
  await resetScene([token(CASTER, 30, 30), token("goblin", 20, 20), token("shielded", 20, 20, shield)]);
  const result = await castDarts({ goblin: "5 4 2", shielded: "3 3" }, { slotLevel: 3 });
  assert.equal(meta("goblin").hp, 9);
  assert.equal(meta("shielded").hp, 20, "Shield: no dart hits");
  assert.ok(result.notes.includes("shielded: 2 dardi · bloccati da Scudo"), JSON.stringify(result.notes));
});

test("every dart needs a target: too many or too few darts reject the cast", async () => {
  await resetScene([token(CASTER, 30, 30), token("goblin", 20, 20), token("orc", 20, 20)]);
  const over = await castDarts({ goblin: "2 3 4", orc: "5" }, { status: "rejected" });
  assert.match(JSON.stringify(over.errors), /Dardi assegnati 4\/3/u);
  await castDarts({ goblin: "2", orc: "3" }, { status: "rejected" });
  assert.equal(meta("goblin").hp, 20);
});

test("a concentrating target saves once per dart, with the damage of that dart", async () => {
  await resetScene([token(CASTER, 30, 30), token("mage", 30, 30, {
    [CONCENTRATION_KEY]: { Benedizione: { instanceId: "bless-1", name: "Benedizione", targets: [] } },
  }), token("goblin", 20, 20)]);
  await castDarts({ mage: "4 2", goblin: "5" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const mage = concentrationWarnings.filter((warning) => warning.notice.targets[0].id === "mage");
  assert.deepEqual(mage.map((warning) => [warning.damage, warning.dc]), [[4, 10], [2, 10]], "two darts, two saves");
  assert.notEqual(mage[0].notice.activationId, mage[1].notice.activationId);
  assert.ok(mage.every((warning) => warning.notice.causeHistoryEntryId), "Undo withdraws them");
});

test("a dying PC takes one failure per dart; a PC at 3 HP drops with the first and fails with the other two", async () => {
  await resetScene([token(CASTER, 30, 30),
    token("dying", 0, 20, { attitude: "pc", deathSaves: { successes: 1, failures: 0 },
      ...conditions([pill("ko", "Privo di sensi", "dying", { type: "hp-zero" })]) }),
    token("hero", 3, 20, { attitude: "pc" })]);
  await castDarts({ dying: "2 3 2" });
  assert.deepEqual(meta("dying").deathSaves, { successes: 1, failures: 3 }, "three darts: dead");
  assert.ok(pills("dying").includes("Morto"), JSON.stringify(pills("dying")));
  await castDarts({ hero: "4 5 2" });
  assert.equal(meta("hero").hp, 0);
  assert.deepEqual(meta("hero").deathSaves, { successes: 0, failures: 2 }, "the sum is never massive damage");
  assert.equal(pills("hero").includes("Morto"), false);
});
