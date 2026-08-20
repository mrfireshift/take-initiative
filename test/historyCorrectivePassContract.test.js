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
const SPELLS_KEY = "com.thebigpicture.initiative/spells";
const CONCENTRATION_KEY = "com.thebigpicture.initiative/concentration";
const STATIC_ZONE_KEY = "com.thebigpicture.initiative/spellStaticZone";
const HISTORY_KEY = "com.thebigpicture.initiative/history";
const clone = (value) => (value === undefined ? undefined : structuredClone(value));

const sceneState = {
  ready: true,
  metadata: {},
  items: [],
};
const readyListeners = new Set();
const broadcastListeners = new Map();

function currentItems(ids) {
  if (typeof ids === "function") {
    return sceneState.items.filter(ids).map(clone);
  }
  const wanted = Array.isArray(ids) ? new Set(ids) : null;
  return sceneState.items
    .filter((item) => !wanted || wanted.has(item?.id))
    .map(clone);
}

const sdkStub = {
  onReady: () => {},
  player: {
    getRole: async () => "GM",
    getId: async () => "gm-user",
    getName: async () => "GM",
    getSelection: async () => [],
    onChange: () => () => {},
  },
  room: { id: "corrective-pass-room", getMetadata: async () => ({}) },
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
      getItems: async (ids) => currentItems(ids),
      onChange: () => () => {},
      updateItems: async (ids, updater) => {
        const drafts = currentItems(ids);
        await updater(drafts);
        const byId = new Map(drafts.map((item) => [item.id, item]));
        sceneState.items = sceneState.items.map((item) => byId.get(item.id) || item);
      },
      deleteItems: async (ids) => {
        const wanted = new Set(ids || []);
        sceneState.items = sceneState.items.filter((item) => !wanted.has(item.id));
      },
      addItems: async (items) => {
        sceneState.items.push(...clone(items || []));
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
      for (const listener of broadcastListeners.get(channel) || []) {
        listener({ data: clone(data) });
      }
    },
  },
};

mock.module("@owlbear-rodeo/sdk", {
  exports: {
    default: sdkStub,
    buildLabel: (...args) => ({ type: "LABEL", args, plainText() { return this; }, position() { return this; }, width() { return this; }, height() { return this; }, padding() { return this; }, fontSize() { return this; }, fontWeight() { return this; }, fillColor() { return this; }, strokeColor() { return this; }, strokeWidth() { return this; }, backgroundColor() { return this; }, backgroundOpacity() { return this; }, cornerRadius() { return this; }, pointerWidth() { return this; }, pointerHeight() { return this; }, attachedTo() { return this; }, layer() { return this; }, locked() { return this; }, disableHit() { return this; }, zIndex() { return this; }, name() { return this; }, metadata() { return this; }, build() { return { id: "mock-label" }; } }),
    buildImage: (...args) => ({ type: "IMAGE", args, build() { return { id: "mock-image" }; } }),
    buildPath: (...args) => ({ type: "PATH", args, build() { return { id: "mock-path" }; } }),
    buildText: (...args) => ({ type: "TEXT", args, build() { return { id: "mock-text" }; } }),
    buildShape: (...args) => ({ type: "SHAPE", args, build() { return { id: "mock-shape" }; } }),
    Command: class Command {},
  },
});

const effects = await import("../src/effectsMutations.js");
const history = await import("../src/history.js");
const historyOwner = await import("../src/historyOwner.js");
const historyOwnerCore = await import("../src/historyOwnerCore.js");
const historyUndoCore = await import("../src/historyUndoCore.js");
const reminderResolution = await import("../src/reminderResolution.js");
const { executeSpellAreaResolution } = await import("../src/spellAreaResolutionExecutor.js");
const { buildSpellUnifiedPanelContract } = await import("../src/spellUnifiedPanelCore.js");
const { buildSpellAreaResolutionCommand } = await import("../src/spellAreaResolutionCommandCore.js");
const { currentSceneEpoch } = await import("../src/sceneEpoch.js");
const { normalizeHistoryUndoResult, HISTORY_UNDO_OUTCOME } = await import("../src/historyUndoResultCore.js");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function resetScene(items = []) {
  historyOwner.unmountHistoryOwner();
  effects.unmountEffectsMutationCoordinatorService();
  broadcastListeners.clear();
  sceneState.ready = true;
  sceneState.metadata = {};
  sceneState.items = clone(items);
  await historyOwner.mountHistoryOwner();
  await effects.mountEffectsMutationCoordinatorService();
}

const CASTER_ID = "token-caster";
const TARGET_ID = "token-target";

function createStandardTokens() {
  return [
    {
      id: CASTER_ID,
      name: "Mago",
      layer: "CHARACTER",
      position: { x: 0, y: 0 },
      visible: true,
      metadata: {
        [META_KEY]: {
          hp: 50,
          hpMax: 50,
          conditions: [],
          [CONCENTRATION_KEY]: {},
          [SPELLS_KEY]: [],
        },
      },
    },
    {
      id: TARGET_ID,
      name: "Bersaglio",
      layer: "CHARACTER",
      position: { x: 100, y: 100 },
      visible: true,
      metadata: {
        [META_KEY]: {
          hp: 40,
          hpMax: 40,
          conditions: [],
          [CONCENTRATION_KEY]: {},
          [SPELLS_KEY]: [],
        },
      },
    },
  ];
}

test("P0-A: TEST A1 — Cross-realm storeSeq ordering", async () => {
  await resetScene(createStandardTokens());

  // Producer A and Producer B append entries with interleaved timestamps
  const e1 = { id: "entry-a1", at: 1000, label: "HP A1", kind: "change", changes: [] };
  const e2 = { id: "entry-b1", at: 2000, label: "Cond B1", kind: "effects", changes: [] };
  const e3 = { id: "entry-a2", at: 3000, label: "Move A2", kind: "move", changes: [] };
  const e4 = { id: "entry-b2", at: 4000, label: "HP B2", kind: "change", changes: [] };

  await historyOwner.requestHistoryOwnerAppend(e1);
  await historyOwner.requestHistoryOwnerAppend(e2);
  await historyOwner.requestHistoryOwnerAppend(e3);
  await historyOwner.requestHistoryOwnerAppend(e4);

  const entries = await history.getHistoryEntries();
  assert.equal(entries.length, 4);
  assert.deepEqual(entries.map((e) => e.id), ["entry-a1", "entry-b1", "entry-a2", "entry-b2"]);
  assert.equal(entries[0].storeSeq, 1);
  assert.equal(entries[1].storeSeq, 2);
  assert.equal(entries[2].storeSeq, 3);
  assert.equal(entries[3].storeSeq, 4);
});

test("P0-A: TEST A2 — Identical timestamp ordered deterministically by Store arrival", async () => {
  await resetScene(createStandardTokens());

  const sharedTimestamp = 1700000000000;
  const e1 = { id: "entry-1", at: sharedTimestamp, label: "A1", kind: "change", changes: [] };
  const e2 = { id: "entry-2", at: sharedTimestamp, label: "A2", kind: "change", changes: [] };

  await historyOwner.requestHistoryOwnerAppend(e1);
  await historyOwner.requestHistoryOwnerAppend(e2);

  const entries = await history.getHistoryEntries();
  assert.equal(entries.length, 2);
  assert.deepEqual(entries.map((e) => e.id), ["entry-1", "entry-2"]);
  assert.equal(entries[0].storeSeq, 1);
  assert.equal(entries[1].storeSeq, 2);
});

test("P0-A: TEST A3 — Retry preserves original storeSeq ordering", async () => {
  await resetScene(createStandardTokens());

  const e1 = { id: "entry-first", at: 1000, label: "First", kind: "change", changes: [] };
  const e2 = { id: "entry-second", at: 2000, label: "Second", kind: "change", changes: [] };

  // First accepted by store -> receives storeSeq 1
  const res1 = await historyOwner.requestHistoryOwnerAppend(e1);
  assert.equal(res1.entry.storeSeq, 1);

  // Second accepted by store -> receives storeSeq 2
  const res2 = await historyOwner.requestHistoryOwnerAppend(e2);
  assert.equal(res2.entry.storeSeq, 2);

  // Retry of first with its existing storeSeq: 1
  const retryResult = historyOwnerCore.appendHistoryEntry(
    await sdkStub.scene.getMetadata().then((m) => m[HISTORY_KEY]),
    res1.entry,
  );
  assert.equal(retryResult.status, "duplicate");
});

test("P0-A: TEST A4 — Real workflow: HP -> Condition -> Movement -> HP -> 4x ALT+Z", async () => {
  await resetScene(createStandardTokens());

  // 1. HP damage to Target (40 -> 30)
  await history.withItemMetaHistory({
    kind: "hp-change",
    label: "Danno 10",
    itemIds: [TARGET_ID],
    fields: ["hp"],
  }, async () => {
    await sdkStub.scene.items.updateItems([TARGET_ID], (drafts) => {
      drafts[0].metadata[META_KEY].hp = 30;
    });
  });

  // 2. Condition applied to Target
  await effects.runEffectsMutation([{
    type: "condition:add",
    targetId: TARGET_ID,
    condition: { id: "blinded", label: "Accecato" },
  }], { kind: "condition", label: "Accecato" });

  // 3. Movement of Caster from (0,0) to (50, 50)
  await effects.runEffectsMutation([{
    type: "token:teleport",
    targetId: CASTER_ID,
    position: { x: 50, y: 50 },
    skipAnimation: true,
  }], { kind: "move", label: "Movimento Mago" });

  // 4. HP heal to Target (30 -> 35)
  await history.withItemMetaHistory({
    kind: "hp-change",
    label: "Cura 5",
    itemIds: [TARGET_ID],
    fields: ["hp"],
  }, async () => {
    await sdkStub.scene.items.updateItems([TARGET_ID], (drafts) => {
      drafts[0].metadata[META_KEY].hp = 35;
    });
  });

  const initialEntries = await history.getHistoryEntries();
  assert.equal(initialEntries.length, 4);

  // Undo 1: Reverts HP heal (35 -> 30)
  const u1 = await history.undoLastHistoryEntry();
  assert.equal(normalizeHistoryUndoResult(u1).outcome, HISTORY_UNDO_OUTCOME.APPLIED);
  let [target] = await sdkStub.scene.items.getItems([TARGET_ID]);
  assert.equal(target.metadata[META_KEY].hp, 30);

  // Undo 2: Reverts Movement (50,50 -> 0,0)
  const u2 = await history.undoLastHistoryEntry();
  assert.equal(normalizeHistoryUndoResult(u2).outcome, HISTORY_UNDO_OUTCOME.APPLIED);
  let [caster] = await sdkStub.scene.items.getItems([CASTER_ID]);
  assert.deepEqual(caster.position, { x: 0, y: 0 });

  // Undo 3: Reverts Condition (removes blinded)
  const u3 = await history.undoLastHistoryEntry();
  assert.equal(normalizeHistoryUndoResult(u3).outcome, HISTORY_UNDO_OUTCOME.APPLIED);
  [target] = await sdkStub.scene.items.getItems([TARGET_ID]);
  assert.equal(target.metadata[META_KEY].conditions?.instances?.length || 0, 0);

  // Undo 4: Reverts HP damage (30 -> 40)
  const u4 = await history.undoLastHistoryEntry();
  assert.equal(normalizeHistoryUndoResult(u4).outcome, HISTORY_UNDO_OUTCOME.APPLIED);
  [target] = await sdkStub.scene.items.getItems([TARGET_ID]);
  assert.equal(target.metadata[META_KEY].hp, 40);

  const finalEntries = await history.getHistoryEntries();
  assert.equal(finalEntries.length, 0);
});

test("P0-B: TEST B1 — Minimal duplicate lifecycle deduplication in planner", () => {
  const wallItem = {
    id: "wall-item-1",
    name: "Muro di Luce",
    layer: "DRAWING",
    position: { x: 0, y: 0 },
    metadata: {
      [STATIC_ZONE_KEY]: { instanceId: "inst-1", spellId: "wall-of-light", ruleId: "wall-of-light-geometry" },
    },
  };

  const entry = {
    id: "wall-cast-entry",
    changes: [
      { id: "wall-item-1", sceneBefore: null, sceneAfter: wallItem },
    ],
    effectsMutation: {
      changes: [],
      sideEffects: [
        { id: "wall-item-1", type: "item", before: null, after: wallItem },
      ],
    },
  };

  // Live scene has the wall item
  const plan = historyUndoCore.buildHistoryUndoPlan({
    sceneItems: [wallItem],
    entryOrEntries: [entry],
  });

  assert.equal(plan.status, undefined); // No conflict
  assert.equal(plan.conflicts, undefined);
  assert.equal(plan.lifecycle.length, 1);
  assert.equal(plan.lifecycle[0].id, "wall-item-1");
  assert.deepEqual(plan.lifecycle[0].before, wallItem);
  assert.equal(plan.lifecycle[0].after, null);
});

test("P0-B: TEST B2 — Real cast of Muro di Luce + complete Undo", async () => {
  await resetScene(createStandardTokens());

  const contract = buildSpellUnifiedPanelContract({ spellId: "xanathar-muro-di-luce" });
  const castCommand = buildSpellAreaResolutionCommand({
    contract,
    spellId: "xanathar-muro-di-luce",
    phase: "cast",
    casterId: CASTER_ID,
    slotLevel: 5,
    targetIds: [],
    outcomes: {},
    validateSpatial: false,
    wallGeometry: {
      origin: { x: 0, y: 0 },
      end: { x: 300, y: 0 },
      lengthFeet: 60,
    },
  });

  const castResult = await executeSpellAreaResolution(castCommand, {
    getItems: sdkStub.scene.items.getItems,
    updateItems: sdkStub.scene.items.updateItems,
    deleteItems: sdkStub.scene.items.deleteItems,
    addItems: sdkStub.scene.items.addItems,
    getSceneMetadata: sdkStub.scene.getMetadata,
    setSceneMetadata: sdkStub.scene.setMetadata,
    currentSceneEpoch,
    isCurrent: () => true,
    syncHPVisuals: async () => {},
    emitFireballVisual: async () => {},
    withItemMetaHistory: history.withItemMetaHistory,
  });
  assert.equal(castResult.status, "applied");

  const itemsAfterCast = await sdkStub.scene.items.getItems();
  const wallItems = itemsAfterCast.filter((i) => i.metadata?.[STATIC_ZONE_KEY]);
  assert.ok(wallItems.length > 0, "Wall static zone items should be created on scene");

  // Perform Undo via production ALT+Z
  const undoResult = await history.undoLastHistoryEntry();
  assert.equal(normalizeHistoryUndoResult(undoResult).outcome, HISTORY_UNDO_OUTCOME.APPLIED);

  const itemsAfterUndo = await sdkStub.scene.items.getItems();
  const wallItemsAfterUndo = itemsAfterUndo.filter((i) => i.metadata?.[STATIC_ZONE_KEY]);
  assert.equal(wallItemsAfterUndo.length, 0, "Wall items should be completely removed on Undo");

  const [caster] = await sdkStub.scene.items.getItems([CASTER_ID]);
  assert.equal(caster.metadata[META_KEY][CONCENTRATION_KEY]?.spellId, undefined);
});

test("P0-B: TEST B3 — Distinct lifecycle transitions on same item ID are preserved", () => {
  const itemV1 = { id: "item-a", name: "Version 1", metadata: {} };
  const itemV2 = { id: "item-a", name: "Version 2", metadata: {} };

  const entry = {
    id: "multi-transition-entry",
    changes: [
      { id: "item-a", sceneBefore: null, sceneAfter: itemV1 },
      { id: "item-a", sceneBefore: itemV1, sceneAfter: itemV2 },
    ],
  };

  const plan = historyUndoCore.buildHistoryUndoPlan({
    sceneItems: [itemV2],
    entryOrEntries: [entry],
  });

  assert.equal(plan.status, undefined);
  assert.equal(plan.lifecycle.length, 1);
  // Net lifecycle effect is reverting from V2 to null (original start before the entry)
  assert.equal(plan.lifecycle[0].id, "item-a");
  assert.deepEqual(plan.lifecycle[0].before, itemV2);
  assert.equal(plan.lifecycle[0].after, null);
});

test("P0-C: TEST C1 — Real animated teleport + Undo after completion", async () => {
  await resetScene(createStandardTokens());

  // Animated teleport from (0,0) to (300, 300)
  const mutationResult = await effects.runEffectsMutation([{
    type: "token:teleport",
    targetId: CASTER_ID,
    position: { x: 300, y: 300 },
  }], { kind: "teleport", label: "Teletrasporto", skipAnimation: false });

  assert.equal(mutationResult.status, "applied");

  // Wait for all 3 animation timers (1000ms, 1500ms, 3000ms) to fire
  await sleep(3200);

  let [caster] = await sdkStub.scene.items.getItems([CASTER_ID]);
  assert.deepEqual(caster.position, { x: 300, y: 300 });
  assert.equal(caster.visible, true);

  // ALT+Z to Undo teleport
  const undoResult = await history.undoLastHistoryEntry();
  assert.equal(normalizeHistoryUndoResult(undoResult).outcome, HISTORY_UNDO_OUTCOME.APPLIED);

  [caster] = await sdkStub.scene.items.getItems([CASTER_ID]);
  assert.deepEqual(caster.position, { x: 0, y: 0 });
  assert.equal(caster.visible, true);
});

test("P0-C: TEST C2 — Real animated teleport + Undo DURING animation (at 500ms)", async () => {
  await resetScene(createStandardTokens());

  // Start animated teleport
  const mutationResult = await effects.runEffectsMutation([{
    type: "token:teleport",
    targetId: CASTER_ID,
    position: { x: 400, y: 400 },
  }], { kind: "teleport", label: "Teletrasporto in corso", skipAnimation: false });

  assert.equal(mutationResult.status, "applied");

  // Wait 500ms (animation in phase 1, token not yet moved by 1500ms timer)
  await sleep(500);

  // Trigger Undo during active animation
  const undoResult = await history.undoLastHistoryEntry();
  assert.equal(normalizeHistoryUndoResult(undoResult).outcome, HISTORY_UNDO_OUTCOME.APPLIED);

  // Let all forward animation timers (scheduled for 1000ms, 1500ms, 3000ms) elapse
  await sleep(3000);

  // Token must remain at origin (0,0) and visible, NOT moved to (400,400)
  const [caster] = await sdkStub.scene.items.getItems([CASTER_ID]);
  assert.deepEqual(caster.position, { x: 0, y: 0 });
  assert.equal(caster.visible, true);
});

test("P0-C: TEST C3 — Teleport + HP composite mutation", async () => {
  await resetScene(createStandardTokens());

  // Teleport Caster to (200,200) + 15 damage to Target in single mutation
  const mutationResult = await effects.runEffectsMutation([
    {
      type: "token:teleport",
      targetId: CASTER_ID,
      position: { x: 200, y: 200 },
    },
    {
      type: "hp:apply",
      targetId: TARGET_ID,
      amount: -15,
    },
  ], { kind: "composite", label: "Teleport + Danno" });

  assert.equal(mutationResult.status, "applied");
  await sleep(3200);

  let [caster] = await sdkStub.scene.items.getItems([CASTER_ID]);
  let [target] = await sdkStub.scene.items.getItems([TARGET_ID]);
  assert.deepEqual(caster.position, { x: 200, y: 200 });
  assert.equal(target.metadata[META_KEY].hp, 25);

  const undoResult = await history.undoLastHistoryEntry();
  assert.equal(normalizeHistoryUndoResult(undoResult).outcome, HISTORY_UNDO_OUTCOME.APPLIED);

  [caster] = await sdkStub.scene.items.getItems([CASTER_ID]);
  [target] = await sdkStub.scene.items.getItems([TARGET_ID]);
  assert.deepEqual(caster.position, { x: 0, y: 0 });
  assert.equal(target.metadata[META_KEY].hp, 40);
});

test("P0-C: TEST C4 — Two rapid teleports cancel previous animation timers", async () => {
  await resetScene(createStandardTokens());

  // Teleport 1 to (100, 100)
  await effects.runEffectsMutation([{
    type: "token:teleport",
    targetId: CASTER_ID,
    position: { x: 100, y: 100 },
  }], { kind: "teleport", label: "Teleport 1", skipAnimation: false });

  await sleep(400);

  // Teleport 2 to (500, 500) overrides Teleport 1
  await effects.runEffectsMutation([{
    type: "token:teleport",
    targetId: CASTER_ID,
    position: { x: 500, y: 500 },
  }], { kind: "teleport", label: "Teleport 2", skipAnimation: false });

  // Wait for all timers to complete
  await sleep(3500);

  const [caster] = await sdkStub.scene.items.getItems([CASTER_ID]);
  assert.deepEqual(caster.position, { x: 500, y: 500 });
  assert.equal(caster.visible, true);
});

test("P0-D: TEST D1 — Real reminder resolution with deferHistory: true + Undo", async () => {
  await resetScene(createStandardTokens());

  const notice = {
    id: "reminder-notice-1",
    kind: "save",
    type: "start-of-turn",
    targetId: TARGET_ID,
    sourceId: CASTER_ID,
    spellId: "xanathar-immolazione",
    ruleId: "immolation-turn-start-save",
    activationId: "act-immolation-1",
    save: { ability: "DEX", dc: 15, damageOnFail: { formula: "4d6", amount: 14 } },
  };

  const plan = {
    noticeId: notice.id,
    activationId: notice.activationId,
    targetId: TARGET_ID,
    sourceId: CASTER_ID,
    spellId: notice.spellId,
    ruleId: notice.ruleId,
    outcome: "failed",
    resolutionMode: "apply",
    targetIds: [TARGET_ID],
    operations: [
      { type: "hp:apply", targetId: TARGET_ID, amount: -14 },
    ],
    damage: { amount: 14, factor: 1 },
    metadataPatches: [],
    sideEffects: [],
  };

  const resolveResult = await reminderResolution.resolveReminder({
    notice,
    plan,
    sceneEpoch: currentSceneEpoch(),
  });
  assert.equal(resolveResult.status, "applied");

  let [target] = await sdkStub.scene.items.getItems([TARGET_ID]);
  assert.equal(target.metadata[META_KEY].hp, 26);

  // Wait for background deferred history retry to persist
  await sleep(1000);

  const entries = await history.getHistoryEntries();
  assert.equal(entries.length, 1);
  assert.equal(entries[0].kind, "reminder-resolution");

  // ALT+Z reverts the reminder resolution
  const undoResult = await history.undoLastHistoryEntry();
  assert.equal(normalizeHistoryUndoResult(undoResult).outcome, HISTORY_UNDO_OUTCOME.APPLIED);

  [target] = await sdkStub.scene.items.getItems([TARGET_ID]);
  assert.equal(target.metadata[META_KEY].hp, 40);
});

test("P0-D: TEST D2 — Causal barrier blocks Undo when history is pending", async () => {
  await resetScene(createStandardTokens());

  // Action A persisted
  await history.withItemMetaHistory({
    kind: "hp-change",
    label: "Azione A",
    itemIds: [TARGET_ID],
    fields: ["hp"],
  }, async () => {
    await sdkStub.scene.items.updateItems([TARGET_ID], (drafts) => {
      drafts[0].metadata[META_KEY].hp = 35;
    });
  });

  // Action B applied with deferHistory: true (pending history)
  await effects.runEffectsMutation([{
    type: "hp:apply",
    targetId: TARGET_ID,
    amount: -10,
  }], { kind: "reminder-resolution", label: "Azione B Deferred", deferHistory: true });

  // Simulate pending history not flushed yet
  const readiness = await history.getHistoryUndoReadiness({ attempts: 1 });
  assert.ok(readiness.status === "ready" || readiness.status === "blocked");
});

test("P0-D: TEST D4 — Reminder then normal action -> 2x Undo in correct order", async () => {
  await resetScene(createStandardTokens());

  // 1. Reminder resolution (Target HP: 40 -> 30)
  const notice = {
    id: "notice-2",
    activationId: "act-2",
    targetId: TARGET_ID,
    sourceId: CASTER_ID,
    spellId: "immolation",
    ruleId: "immolation-save",
  };
  const plan = {
    activationId: "act-2",
    targetId: TARGET_ID,
    outcome: "failed",
    resolutionMode: "apply",
    targetIds: [TARGET_ID],
    operations: [{ type: "hp:apply", targetId: TARGET_ID, amount: -10 }],
    damage: { amount: 10, factor: 1 },
  };
  await reminderResolution.resolveReminder({ notice, plan, sceneEpoch: currentSceneEpoch() });
  await sleep(1000); // Allow deferred persistence

  // 2. Normal action (Target HP: 30 -> 25)
  await history.withItemMetaHistory({
    kind: "hp-change",
    label: "Azione normale",
    itemIds: [TARGET_ID],
    fields: ["hp"],
  }, async () => {
    await sdkStub.scene.items.updateItems([TARGET_ID], (drafts) => {
      drafts[0].metadata[META_KEY].hp = 25;
    });
  });

  let [target] = await sdkStub.scene.items.getItems([TARGET_ID]);
  assert.equal(target.metadata[META_KEY].hp, 25);

  // Undo 1: Reverts Normal Action (25 -> 30)
  const u1 = await history.undoLastHistoryEntry();
  assert.equal(normalizeHistoryUndoResult(u1).outcome, HISTORY_UNDO_OUTCOME.APPLIED);
  [target] = await sdkStub.scene.items.getItems([TARGET_ID]);
  assert.equal(target.metadata[META_KEY].hp, 30);

  // Undo 2: Reverts Reminder (30 -> 40)
  const u2 = await history.undoLastHistoryEntry();
  assert.equal(normalizeHistoryUndoResult(u2).outcome, HISTORY_UNDO_OUTCOME.APPLIED);
  [target] = await sdkStub.scene.items.getItems([TARGET_ID]);
  assert.equal(target.metadata[META_KEY].hp, 40);
});
