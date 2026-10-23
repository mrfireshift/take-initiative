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

const clientEffects = await import("../src/effectsMutations.js?hp-branch-real-client");
globalThis.location = { pathname: "/background.html" };
const backgroundEffects = await import("../src/effectsMutations.js?hp-branch-real-background");
globalThis.location = { pathname: "/plugin.html" };
const baseEffects = await import("../src/effectsMutations.js?hp-branch-real-base");
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

const history = await import("../src/history.js?hp-branch-real-history");
const historyOwner = await import("../src/historyOwner.js?hp-branch-real-owner");
mock.module("../src/history.js", { exports: { ...history } });
const { currentSceneEpoch, markSceneEpochReady } = await import("../src/sceneEpoch.js");
const { buildSpellUnifiedPanelContract } = await import("../src/spellUnifiedPanelCore.js?hp-branch-real-panel");
const { buildSpellAreaResolutionCommand } = await import("../src/spellAreaResolutionCommandCore.js?hp-branch-real-command");
const { executeSpellAreaResolution } = await import("../src/spellAreaResolutionExecutor.js?hp-branch-real-executor");
const { planEffectSaveReminderNotices } = await import("../src/effectSaveReminderCore.js?hp-branch-real-reminder-core");
const { resolveReminder, clearReminderResolutionQueue } = await import("../src/reminderResolution.js?hp-branch-real-reminder");
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

async function undoLast() {
  const entries = await history.getHistoryEntries();
  const result = await history.undoHistoryThrough(entries.at(-1).id, { sceneEpoch: currentSceneEpoch() });
  assert.equal(normalizeHistoryUndoResult(result).outcome, HISTORY_UNDO_OUTCOME.COMMITTED, JSON.stringify(result));
}

test("Power Word Kill on a PC: 0 HP, Morto and three failures in one command, never Privo di sensi; Undo restores it", async () => {
  await resetScene([token(CASTER, 60, 60), token("hero", 40, 40, { attitude: "pc" })]);
  await cast("power-word-kill", 9, "hero");
  assert.equal(meta("hero").hp, 0);
  assert.deepEqual(pills("hero"), ["Morto"]);
  assert.deepEqual(meta("hero").deathSaves, { successes: 0, failures: 3 });
  await undoLast();
  assert.equal(meta("hero").hp, 40);
  assert.deepEqual(pills("hero"), []);
  assert.equal(meta("hero").deathSaves, undefined);
});

test("Power Word Kill spares a creature above 100 hit points", async () => {
  await resetScene([token(CASTER, 60, 60), token("giant", 140, 160, { attitude: "enemy" })]);
  await cast("power-word-kill", 9, "giant", { status: "noop" });
  assert.equal(meta("giant").hp, 140);
  assert.deepEqual(pills("giant"), []);
});

test("Disintegrate on a monster: dust, Morto with its detail", async () => {
  await resetScene([token(CASTER, 60, 60), token("ogre", 59, 59, { attitude: "enemy" })]);
  await cast("disintegrate", 6, "ogre", { outcome: "failed", amount: 75 });
  assert.equal(meta("ogre").hp, 0);
  assert.deepEqual(pills("ogre"), ["Morto"]);
  const dead = meta("ogre").conditions.instances.find((entry) => entry.condition === "Morto");
  assert.match(String(dead.effectDetail || dead.detail || ""), /Disintegrato/u);
});

// The area command writes the HP itself: its death saves are planned with them (planAreaDeathSaves).
const ko = { id: "ko", condition: "Privo di sensi", active: true, targetId: "hero", type: "hp-zero", expiry: { mode: "manual" } };

test("an area spell that hits a PC at 0 HP adds a death save failure; Undo takes it back", async () => {
  await resetScene([token(CASTER, 60, 60), token("hero", 0, 40, { attitude: "pc",
    deathSaves: { successes: 1, failures: 1 }, conditions: { version: 2, instances: [ko] } })]);
  await cast("blight", 4, "hero", { outcome: "failed", amount: 12 });
  assert.equal(meta("hero").hp, 0);
  assert.deepEqual(meta("hero").deathSaves, { successes: 1, failures: 2 });
  await undoLast();
  assert.deepEqual(meta("hero").deathSaves, { successes: 1, failures: 1 });
});

test("the third failure from an area spell: Morto in place of Privo di sensi", async () => {
  await resetScene([token(CASTER, 60, 60), token("hero", 0, 40, { attitude: "pc",
    deathSaves: { successes: 0, failures: 2 }, conditions: { version: 2, instances: [ko] } })]);
  await cast("blight", 4, "hero", { outcome: "failed", amount: 12 });
  assert.deepEqual(pills("hero"), ["Morto"]);
  assert.deepEqual(meta("hero").deathSaves, { successes: 0, failures: 3 });
});

test("an area heal on a stable PC ends Stabile and the tally", async () => {
  await resetScene([token(CASTER, 60, 60), token("hero", 0, 40, { attitude: "pc", deathSaves: { successes: 0, failures: 1 },
    conditions: { version: 2, instances: [ko, { ...ko, id: "st", condition: "Stabile", type: "death-save" }] } })]);
  await cast("cure-wounds", 1, "hero", { amount: 7 });
  assert.equal(meta("hero").hp, 7);
  assert.equal(meta("hero").deathSaves, undefined);
  assert.equal(pills("hero").includes("Stabile"), false);
});

test("the Combat Log shows the tally an area spell changes", async () => {
  const { combatEventFromHistoryEntryV3 } = await import("../src/combatLogV3Core.js");
  const { buildCombatLogPresentation } = await import("../src/combatLogPresentationCore.js");
  await resetScene([token(CASTER, 60, 60), token("hero", 0, 40, { attitude: "pc",
    deathSaves: { successes: 1, failures: 0 }, conditions: { version: 2, instances: [ko] } })]);
  await cast("blight", 4, "hero", { outcome: "failed", amount: 12 });
  const events = (await history.getHistoryEntries()).map((entry) => combatEventFromHistoryEntryV3(entry, {}));
  const rows = buildCombatLogPresentation({ id: "s", startedAt: 0 }, events).groups
    .flatMap((round) => round.turns.flatMap((turn) => turn.events));
  assert.ok(rows.some((row) => row.details.some((section) => section.label === "TS contro la morte"
    && section.lines.includes("hero: Successi ●○○ · Fallimenti ✕○○"))), JSON.stringify(rows.map((row) => row.details)));
});
