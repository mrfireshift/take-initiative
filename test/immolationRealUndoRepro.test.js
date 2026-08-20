import assert from "node:assert/strict";
import test, { mock } from "node:test";
import {
  createVersionedIndexedDB,
  versionedKeyRange,
} from "../test-support/fakeVersionedIndexedDb.js";

const previousIndexedDB = globalThis.indexedDB;
const previousKeyRange = globalThis.IDBKeyRange;
globalThis.indexedDB = createVersionedIndexedDB();
globalThis.IDBKeyRange = versionedKeyRange;

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
  room: { id: "immolation-room", getMetadata: async () => ({}) },
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

const effects = await import("../src/effectsMutations.js");
const history = await import("../src/history.js");
const historyOwner = await import("../src/historyOwner.js");
const { currentSceneEpoch, markSceneEpochReady } = await import("../src/sceneEpoch.js");
const { buildSpellUnifiedPanelContract } = await import("../src/spellUnifiedPanelCore.js");
const { buildSpellAreaResolutionCommand } = await import("../src/spellAreaResolutionCommandCore.js");
const { executeSpellAreaResolution } = await import("../src/spellAreaResolutionExecutor.js");
const { planEffectSaveReminderNotices } = await import("../src/effectSaveReminderCore.js");
const { resolveReminder } = await import("../src/reminderResolution.js");
const { normalizeHistoryUndoResult, HISTORY_UNDO_OUTCOME } = await import("../src/historyUndoResultCore.js");
const { refreshConditionLabels } = await import("../src/conditions.js");

const CASTER_ID = "caster-immolation-repro";
const TARGET_ID = "target-immolation-repro";
const OTHER_ID = "other-token-repro";

async function resetScene(tokens = []) {
  await historyOwner.mountHistoryOwner();
  await effects.mountEffectsMutationCoordinatorService();
  sceneState.metadata = {
    [STATE_KEY]: {
      round: 1,
      current: 0,
      order: tokens.map((t) => t.id),
    },
    ["com.thebigpicture.initiative/history"]: {
      version: 1,
      roomId: "immolation-room",
      entries: [],
    },
  };
  sceneState.items = tokens.map(clone);
  markSceneEpochReady("test-reset");
  await new Promise((resolve) => setTimeout(resolve, 80));
}

test.before(async () => {
  await historyOwner.mountHistoryOwner();
  await effects.mountEffectsMutationCoordinatorService();
});

test.after(() => {
  effects.unmountEffectsMutationCoordinatorService();
  historyOwner.unmountHistoryOwner();
  globalThis.indexedDB = previousIndexedDB;
  globalThis.IDBKeyRange = previousKeyRange;
});

function createStandardTokens() {
  const casterToken = {
    id: CASTER_ID,
    name: "Mago",
    position: { x: 0, y: 0 },
    metadata: {
      [META_KEY]: {
        hp: 50,
        hpMax: 50,
        conditions: [],
        [CONCENTRATION_KEY]: {},
        [SPELLS_KEY]: [],
      },
    },
  };
  const otherToken = {
    id: OTHER_ID,
    name: "Guerriero",
    position: { x: 100, y: 0 },
    metadata: {
      [META_KEY]: {
        hp: 80,
        hpMax: 80,
        conditions: [],
        [CONCENTRATION_KEY]: {},
        [SPELLS_KEY]: [],
      },
    },
  };
  const targetToken = {
    id: TARGET_ID,
    name: "Nemico",
    position: { x: 200, y: 0 },
    metadata: {
      [META_KEY]: {
        hp: 100,
        hpMax: 100,
        conditions: [],
        [CONCENTRATION_KEY]: {},
        [SPELLS_KEY]: [],
      },
    },
  };
  return [casterToken, otherToken, targetToken];
}

async function castImmolation() {
  const contract = buildSpellUnifiedPanelContract({ spellId: "xanathar-immolazione" });
  const castCommand = buildSpellAreaResolutionCommand({
    contract,
    spellId: "xanathar-immolazione",
    phase: "cast",
    casterId: CASTER_ID,
    slotLevel: 5,
    targetIds: [TARGET_ID],
    outcomes: { [TARGET_ID]: "failed" },
    hpAmount: 28,
    validateSpatial: false,
  });

  const castResult = await executeSpellAreaResolution(castCommand, {
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
  assert.equal(castResult.status, "applied");
}

test("TEST 1 (SUCCESSFUL SAVE REAL UNDO) — Cast -> Passed Save -> Production Undo restores condition & concentration", async () => {
  await resetScene(createStandardTokens());
  await castImmolation();

  // Advance turn to target end of turn -> produce notice
  const itemsList = await sdkStub.scene.items.getItems();
  const notices = planEffectSaveReminderNotices({
    items: itemsList,
    previousInitiativeState: { round: 1, current: 2, order: [CASTER_ID, OTHER_ID, TARGET_ID] },
    initiativeState: { round: 2, current: 0, order: [CASTER_ID, OTHER_ID, TARGET_ID] },
    includeCurrentTurnStart: false,
  });
  const notice = notices.find((n) => n.effectName?.includes("In fiamme") || n.spellName === "Immolazione");
  assert.ok(notice, "Notice must be generated");

  // Resolve reminder: TS Superato (passed)
  const resolutionResult = await resolveReminder({
    notice,
    outcome: "passed",
    damageRoll: 24,
    sceneEpoch: currentSceneEpoch(),
  });
  console.log("Resolution result:", JSON.stringify(resolutionResult, null, 2));
  assert.equal(resolutionResult.status, "applied");

  // Allow async post-resolution derived tasks and condition label refresh
  await refreshConditionLabels([TARGET_ID, CASTER_ID]);
  await new Promise((resolve) => setTimeout(resolve, 50));

  // Inspect History entries and Readiness
  const entries = await history.getHistoryEntries();
  console.log("History entries after reminder:", JSON.stringify(entries, null, 2));
  assert.ok(entries.length >= 2, `Expected at least 2 entries, found ${entries.length}`);
  const lastEntry = entries[entries.length - 1];
  assert.match(lastEntry.label, /Immolazione · TS superato/);

  // Field-level comparison: expected-after in History vs live state
  const liveItems = await sdkStub.scene.items.getItems();
  const liveMap = new Map(liveItems.map((it) => [it.id, it]));

  if (lastEntry?.effectsMutation?.changes) {
    for (const change of lastEntry.effectsMutation.changes) {
      const live = liveMap.get(change.id);
      const liveMeta = live?.metadata?.[META_KEY] || {};
      for (const field of Object.keys(change.fields || {}).filter((k) => change.fields[k])) {
        const expected = change.after?.[field];
        const actual = field === "conditions"
          ? (Array.isArray(liveMeta.conditions) ? liveMeta.conditions : liveMeta.conditions?.instances || [])
          : field === "spells" ? liveMeta[SPELLS_KEY] : liveMeta[CONCENTRATION_KEY];
        assert.equal(same(expected, actual), true, `Mismatch on token ${change.id} field ${field}`);
      }
    }
  }

  // Readiness badge verification
  const readiness = await history.getHistoryUndoReadiness({ sceneEpoch: currentSceneEpoch() });
  const topRow = readiness.rows?.find((r) => r.id === lastEntry.id);
  assert.ok(topRow, "Top row must exist in readiness");
  assert.equal(topRow.undoable, true, `Top row readiness must be undoable, got status: ${topRow.status}, reason: ${topRow.reason}`);

  // Perform real production Undo through
  const undoResult = await history.undoHistoryThrough(lastEntry.id, {
    sceneEpoch: currentSceneEpoch(),
  });
  const normalized = normalizeHistoryUndoResult(undoResult);
  assert.equal(normalized.outcome, HISTORY_UNDO_OUTCOME.COMMITTED, `Undo failed with outcome: ${normalized.outcome}`);

  // Verify live state restored
  const liveItemsAfterUndo = await sdkStub.scene.items.getItems();
  const liveMapAfterUndo = new Map(liveItemsAfterUndo.map((it) => [it.id, it]));

  const liveTargetAfterUndo = liveMapAfterUndo.get(TARGET_ID);
  const targetConds = liveTargetAfterUndo.metadata[META_KEY].conditions || [];
  const instances = Array.isArray(targetConds) ? targetConds : targetConds.instances || [];
  assert.ok(instances.some((c) => c.condition?.includes("In fiamme") || c.name?.includes("In fiamme")), "Burning condition must be restored on target");

  const liveCasterAfterUndo = liveMapAfterUndo.get(CASTER_ID);
  const casterConcAfterUndo = liveCasterAfterUndo.metadata[META_KEY][CONCENTRATION_KEY] || {};
  assert.equal(Object.keys(casterConcAfterUndo).length, 1, "Concentration must be restored on caster");
});

test("TEST 2 (FAILED SAVE REAL UNDO) — Cast -> Failed Save -> Production Undo restores HP and preserves Immolation", async () => {
  await resetScene(createStandardTokens());
  await castImmolation();

  const itemsList = await sdkStub.scene.items.getItems();
  const notices = planEffectSaveReminderNotices({
    items: itemsList,
    previousInitiativeState: { round: 1, current: 2, order: [CASTER_ID, OTHER_ID, TARGET_ID] },
    initiativeState: { round: 2, current: 0, order: [CASTER_ID, OTHER_ID, TARGET_ID] },
    includeCurrentTurnStart: false,
  });
  const notice = notices.find((n) => n.effectName?.includes("In fiamme") || n.spellName === "Immolazione");
  assert.ok(notice);

  // Resolve reminder: TS Fallito (failed) with 14 damage
  const resolutionResult = await resolveReminder({
    notice,
    outcome: "failed",
    damageRoll: 14,
    sceneEpoch: currentSceneEpoch(),
  });
  assert.equal(resolutionResult.status, "applied");

  // Allow async tasks
  await refreshConditionLabels([TARGET_ID]);
  await new Promise((resolve) => setTimeout(resolve, 50));

  const liveTargetBeforeUndo = (await sdkStub.scene.items.getItems([TARGET_ID]))[0];
  assert.equal(liveTargetBeforeUndo.metadata[META_KEY].hp, 58, "Target HP must be 58 after 14 damage");

  // Inspect History
  const entries = await history.getHistoryEntries();
  const lastEntry = entries[entries.length - 1];
  assert.match(lastEntry.label, /Immolazione · TS fallito/);

  // Readiness badge verification
  const readiness = await history.getHistoryUndoReadiness({ sceneEpoch: currentSceneEpoch() });
  const topRow = readiness.rows?.find((r) => r.id === lastEntry.id);
  console.log("TEST 2 readiness topRow:", JSON.stringify(topRow, null, 2));
  assert.ok(topRow);
  assert.equal(topRow.undoable, true, `TEST 2 undoable failed: status=${topRow.status}, reason=${topRow.reason}, conflicts=${JSON.stringify(topRow.conflicts)}`);

  // Perform real production Undo
  const undoResult = await history.undoHistoryThrough(lastEntry.id, {
    sceneEpoch: currentSceneEpoch(),
  });
  const normalized = normalizeHistoryUndoResult(undoResult);
  assert.equal(normalized.outcome, HISTORY_UNDO_OUTCOME.COMMITTED);

  // Verify live state restored
  const liveTargetAfterUndo = (await sdkStub.scene.items.getItems([TARGET_ID]))[0];
  assert.equal(liveTargetAfterUndo.metadata[META_KEY].hp, 72, "Target HP must be restored to 72");

  const targetConds = liveTargetAfterUndo.metadata[META_KEY].conditions || [];
  const instances = Array.isArray(targetConds) ? targetConds : targetConds.instances || [];
  assert.ok(instances.some((c) => c.condition?.includes("In fiamme") || c.name?.includes("In fiamme")), "Burning condition must remain on target");

  const liveCasterAfterUndo = (await sdkStub.scene.items.getItems([CASTER_ID]))[0];
  const casterConc = liveCasterAfterUndo.metadata[META_KEY][CONCENTRATION_KEY] || {};
  assert.equal(Object.keys(casterConc).length, 1, "Concentration must remain active on caster");
});

test("TEST 3 (GLOBAL UNDO / ALT+Z) — undoLastHistoryEntry reverts top reminder resolution", async () => {
  await resetScene(createStandardTokens());
  await castImmolation();

  const itemsList = await sdkStub.scene.items.getItems();
  const notices = planEffectSaveReminderNotices({
    items: itemsList,
    previousInitiativeState: { round: 1, current: 2, order: [CASTER_ID, OTHER_ID, TARGET_ID] },
    initiativeState: { round: 2, current: 0, order: [CASTER_ID, OTHER_ID, TARGET_ID] },
    includeCurrentTurnStart: false,
  });
  const notice = notices.find((n) => n.effectName?.includes("In fiamme") || n.spellName === "Immolazione");
  assert.ok(notice);

  await resolveReminder({
    notice,
    outcome: "passed",
    damageRoll: 24,
    sceneEpoch: currentSceneEpoch(),
  });

  await new Promise((resolve) => setTimeout(resolve, 50));

  // Invoke global undo (undoLastHistoryEntry / Alt+Z equivalent)
  const undoneEntry = await history.undoLastHistoryEntry({
    sceneEpoch: currentSceneEpoch(),
  });
  assert.ok(undoneEntry, "undoLastHistoryEntry must return undone entry");
  assert.match(undoneEntry.label, /Immolazione · TS superato/);

  // Live check
  const liveTarget = (await sdkStub.scene.items.getItems([TARGET_ID]))[0];
  const targetConds = liveTarget.metadata[META_KEY].conditions || [];
  const instances = Array.isArray(targetConds) ? targetConds : targetConds.instances || [];
  assert.ok(instances.some((c) => c.condition?.includes("In fiamme") || c.name?.includes("In fiamme")));

  const liveCaster = (await sdkStub.scene.items.getItems([CASTER_ID]))[0];
  const casterConc = liveCaster.metadata[META_KEY][CONCENTRATION_KEY] || {};
  assert.equal(Object.keys(casterConc).length, 1);
});
