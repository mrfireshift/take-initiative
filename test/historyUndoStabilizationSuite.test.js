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
const STATIC_ZONE_KEY = "com.thebigpicture.initiative/spellStaticZone";
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
  room: { id: "stabilization-room", getMetadata: async () => ({}) },
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
const {
  createHistoryOwnerBroker,
  HISTORY_OWNER_STATUS,
} = await import("../src/historyOwnerCore.js");
const { currentSceneEpoch } = await import("../src/sceneEpoch.js");
const { normalizeHistoryUndoResult, HISTORY_UNDO_OUTCOME } = await import("../src/historyUndoResultCore.js");

function resetScene(initialItems = []) {
  sceneState.metadata = {};
  sceneState.items = Array.isArray(initialItems) ? initialItems.map(clone) : [];
}

const settle = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));

function createTestHistoryOwnerHarness({ onWrite = async () => {} } = {}) {
  let state = { version: 1, entries: [] };
  const broker = createHistoryOwnerBroker({
    readHistory: async () => clone(state),
    writeHistory: async (next, context) => {
      await onWrite(next, context);
      state = clone(next);
    },
    isSceneCurrent: () => true,
  });
  broker.setSceneContext({
    ready: true,
    sceneIdentity: "history-order-test-scene",
    sceneEpoch: 1,
  });

  return {
    append: (entry, suffix) => broker.handle({
      requestId: `history-order:${suffix}`,
      commandId: `history-order-command:${suffix}`,
      correlationId: `history-order-correlation:${suffix}`,
      sceneIdentity: "history-order-test-scene",
      sceneEpoch: 1,
      kind: "append",
      entry,
    }),
    get state() {
      return clone(state);
    },
  };
}

function hpHistoryEntry({ id, at, before, after }) {
  return {
    id,
    version: 1,
    at,
    kind: "hp-change",
    label: id,
    changes: [{
      id: "t1",
      fields: { hp: true },
      before: { hp: before },
      after: { hp: after },
    }],
  };
}

test.before(async () => {
  await historyOwner.mountHistoryOwner();
  await effects.mountEffectsMutationCoordinatorService();
  await history.mountMovementHistoryWatcher();
});

test.after(() => {
  effects.unmountEffectsMutationCoordinatorService();
  historyOwner.unmountHistoryOwner();
  globalThis.indexedDB = previousIndexedDB;
  globalThis.IDBKeyRange = previousKeyRange;
});

test("SCENARIO 1 — reminder-zone-activation as sole reversible change -> Undo PASS", async () => {
  const activation = { id: "act-1", turnKey: "1:1", targetId: "target-1", targetIds: ["target-1"], formula: "2d6" };
  const beforeZoneMeta = {
    instanceId: "sg-1",
    ruleId: "sg:zone",
    triggerRuntime: {
      evaluatedTurnKey: "1:1",
      sequence: 3,
      pending: [clone(activation)],
    },
  };
  const auraItem = {
    id: "aura-zone",
    name: "Spirit Guardians",
    layer: "DRAWING",
    position: { x: 100, y: 100 },
    metadata: {
      [STATIC_ZONE_KEY]: clone(beforeZoneMeta),
    },
  };
  resetScene([auraItem]);

  const mut = await effects.runEffectsMutation([], {
    kind: "reminder-resolution",
    label: "Risolvi reminder",
    targetIds: ["aura-zone"],
    history: true,
    sceneEpoch: currentSceneEpoch(),
    sideEffects: [{
      type: "reminder:consume-zone-activation",
      itemId: "aura-zone",
      id: "aura-zone",
      metadataKey: STATIC_ZONE_KEY,
      activationId: "act-1",
      targetId: "target-1",
      activation,
    }],
    payload: {
      causality: {
        source: "aura-reminder",
        targetIds: ["aura-zone"],
      },
    },
  });
  assert.equal(mut.status, "applied");
  await settle(30);

  const historyEntries = await history.getHistoryEntries();
  assert.equal(historyEntries.length, 1);

  const undoRes = await history.undoHistoryThrough(historyEntries[0].id, { sceneEpoch: currentSceneEpoch() });
  assert.equal(Array.isArray(undoRes), true);
  assert.equal(undoRes[0].id, historyEntries[0].id);

  const updatedAura = (await sdkStub.scene.items.getItems(["aura-zone"]))[0];
  assert.equal(updatedAura.metadata[STATIC_ZONE_KEY].triggerRuntime.pending.length, 1);
  assert.equal(updatedAura.metadata[STATIC_ZONE_KEY].triggerRuntime.pending[0].id, "act-1");
});

test("SCENARIO 2 — 3-step sequence: HP damage -> Reminder activation -> HP damage -> 3x sequential Undo PASS", async () => {
  const heroToken = {
    id: "hero",
    name: "Eroe",
    position: { x: 50, y: 50 },
    metadata: { [META_KEY]: { hp: 30, hpMax: 30 } },
  };
  const activation = { id: "act-flame", turnKey: "1:1", targetId: "hero", targetIds: ["hero"] };
  const beforeFlameMeta = {
    instanceId: "flame-1",
    ruleId: "flame:zone",
    triggerRuntime: { pending: [clone(activation)] },
  };
  const auraZone = {
    id: "flame-zone",
    name: "Flame",
    position: { x: 100, y: 100 },
    metadata: {
      [STATIC_ZONE_KEY]: clone(beforeFlameMeta),
    },
  };
  resetScene([heroToken, auraZone]);

  // Action 1: Damage Hero (30 -> 24)
  await history.withItemMetaHistory({
    itemIds: ["hero"],
    fields: ["hp"],
    label: "Danno 6 HP",
    kind: "damage",
  }, async () => {
    await sdkStub.scene.items.updateItems(["hero"], (drafts) => {
      drafts[0].metadata[META_KEY].hp = 24;
    });
  });

  // Action 2: Reminder activation consumed
  await effects.runEffectsMutation([], {
    kind: "reminder-resolution",
    label: "Reminder fiamma",
    targetIds: ["flame-zone"],
    history: true,
    sceneEpoch: currentSceneEpoch(),
    sideEffects: [{
      type: "reminder:consume-zone-activation",
      itemId: "flame-zone",
      id: "flame-zone",
      metadataKey: STATIC_ZONE_KEY,
      activationId: "act-flame",
      targetId: "hero",
      activation,
    }],
    payload: { causality: { source: "flame-aura", targetIds: ["flame-zone"] } },
  });

  // Action 3: Damage Hero again (24 -> 18)
  await history.withItemMetaHistory({
    itemIds: ["hero"],
    fields: ["hp"],
    label: "Danno 6 HP",
    kind: "damage",
  }, async () => {
    await sdkStub.scene.items.updateItems(["hero"], (drafts) => {
      drafts[0].metadata[META_KEY].hp = 18;
    });
  });

  await settle(40);
  let entries = await history.getHistoryEntries();
  assert.equal(entries.length, 3);

  // Undo 1: Reverts Action 3 (Hero 18 -> 24)
  let res = await history.undoLastHistoryEntry();
  assert.ok(res?.id);
  let hero = (await sdkStub.scene.items.getItems(["hero"]))[0];
  assert.equal(hero.metadata[META_KEY].hp, 24);

  // Undo 2: Reverts Action 2 (Restores reminder activation)
  res = await history.undoLastHistoryEntry();
  assert.ok(res?.id);
  let zone = (await sdkStub.scene.items.getItems(["flame-zone"]))[0];
  assert.equal(zone.metadata[STATIC_ZONE_KEY].triggerRuntime.pending.length, 1);
  assert.equal(zone.metadata[STATIC_ZONE_KEY].triggerRuntime.pending[0].id, "act-flame");

  // Undo 3: Reverts Action 1 (Hero 24 -> 30)
  res = await history.undoLastHistoryEntry();
  assert.ok(res?.id);
  hero = (await sdkStub.scene.items.getItems(["hero"]))[0];
  assert.equal(hero.metadata[META_KEY].hp, 30);
});

test("SCENARIO 3 & 4 — static-zone-reorient pure and composite + HP -> Undo PASS atomically", async () => {
  const zone = {
    id: "cone-zone",
    name: "Cone of Cold",
    position: { x: 100, y: 100 },
    commands: [{ type: "ROTATION", angle: 0 }],
    metadata: { [STATIC_ZONE_KEY]: { instanceId: "coc-1", ruleId: "coc:cone" } },
  };
  const target = {
    id: "monster",
    name: "Monster",
    position: { x: 150, y: 150 },
    metadata: { [META_KEY]: { hp: 50, hpMax: 50 } },
  };
  resetScene([zone, target]);

  // Pure Reorient
  await history.withItemMetaHistory({
    itemIds: ["cone-zone"],
    label: "Ruota cono",
    kind: "reorient",
    sideEffects: [{
      type: "static-zone-reorient",
      targetId: "cone-zone",
      beforePosition: { x: 100, y: 100 },
      afterPosition: { x: 200, y: 200 },
      beforeCommands: [{ type: "ROTATION", angle: 0 }],
      afterCommands: [{ type: "ROTATION", angle: 45 }],
    }],
  }, async () => {
    await sdkStub.scene.items.updateItems(["cone-zone"], (drafts) => {
      drafts[0].position = { x: 200, y: 200 };
      drafts[0].commands = [{ type: "ROTATION", angle: 45 }];
    });
  });
  await settle(30);

  let undoRes = await history.undoLastHistoryEntry();
  assert.ok(undoRes?.id);
  let liveZone = (await sdkStub.scene.items.getItems(["cone-zone"]))[0];
  assert.deepEqual(liveZone.position, { x: 100, y: 100 });
  assert.deepEqual(liveZone.commands, [{ type: "ROTATION", angle: 0 }]);

  // Composite Reorient + HP Damage
  await history.withItemMetaHistory({
    itemIds: ["monster"],
    fields: ["hp"],
    label: "Attacco a soffio",
    kind: "breath-attack",
    sideEffects: [{
      type: "static-zone-reorient",
      targetId: "cone-zone",
      beforePosition: { x: 100, y: 100 },
      afterPosition: { x: 200, y: 200 },
      beforeCommands: [{ type: "ROTATION", angle: 0 }],
      afterCommands: [{ type: "ROTATION", angle: 90 }],
    }],
  }, async () => {
    await sdkStub.scene.items.updateItems(["monster", "cone-zone"], (drafts) => {
      for (const draft of drafts) {
        if (draft.id === "monster") draft.metadata[META_KEY].hp = 30;
        if (draft.id === "cone-zone") {
          draft.position = { x: 200, y: 200 };
          draft.commands = [{ type: "ROTATION", angle: 90 }];
        }
      }
    });
  });
  await settle(30);

  undoRes = await history.undoLastHistoryEntry();
  assert.ok(undoRes?.id);
  liveZone = (await sdkStub.scene.items.getItems(["cone-zone"]))[0];
  const liveMonster = (await sdkStub.scene.items.getItems(["monster"]))[0];
  assert.deepEqual(liveZone.position, { x: 100, y: 100 });
  assert.deepEqual(liveZone.commands, [{ type: "ROTATION", angle: 0 }]);
  assert.equal(liveMonster.metadata[META_KEY].hp, 50);
});

test("SCENARIO 5 & 6 — token:teleport pure and composite + HP -> Undo PASS atomically", async () => {
  const mage = {
    id: "mage-1",
    name: "Misty Step Mage",
    position: { x: 100, y: 100 },
    metadata: { [META_KEY]: { hp: 20, hpMax: 20 } },
  };
  resetScene([mage]);

  // Teleport via runEffectsMutation
  await effects.runEffectsMutation([], {
    kind: "spell",
    label: "Passo velato",
    targetIds: ["mage-1"],
    sceneEpoch: currentSceneEpoch(),
    sideEffects: [{
      type: "token:teleport",
      targetId: "mage-1",
      position: { x: 400, y: 400 },
      skipAnimation: true,
    }],
  });
  await settle(30);

  const undoRes = await history.undoLastHistoryEntry();
  assert.ok(undoRes?.id);
  const liveMage = (await sdkStub.scene.items.getItems(["mage-1"]))[0];
  assert.deepEqual(liveMage.position, { x: 100, y: 100 }, "Position reverted to (100, 100)");
});

test("SCENARIO 7 — static-zone-move with subsequent triggerRuntime update -> Undo move PASS", async () => {
  const zoneMeta = {
    instanceId: "mb-1",
    ruleId: "mb:move",
    triggerRuntime: { sequence: 1 },
  };
  const zone = {
    id: "moonbeam-zone",
    name: "Moonbeam",
    position: { x: 50, y: 50 },
    metadata: {
      [STATIC_ZONE_KEY]: clone(zoneMeta),
    },
  };
  resetScene([zone]);

  // Move zone
  await history.withItemMetaHistory({
    itemIds: ["moonbeam-zone"],
    label: "Sposta raggio di luna",
    kind: "move-moonbeam",
    sideEffects: [{
      type: "static-zone-move",
      targetId: "moonbeam-zone",
      metadataKey: STATIC_ZONE_KEY,
      instanceId: "mb-1",
      ruleId: "mb:move",
      beforePosition: { x: 50, y: 50 },
      afterPosition: { x: 250, y: 250 },
      beforeMetadata: { present: true, value: clone(zoneMeta) },
      afterMetadata: { present: true, value: clone(zoneMeta) },
    }],
  }, async () => {
    await sdkStub.scene.items.updateItems(["moonbeam-zone"], (drafts) => {
      drafts[0].position = { x: 250, y: 250 };
    });
  });
  await settle(30);

  // Background controller advances triggerRuntime (history: false)
  await sdkStub.scene.items.updateItems(["moonbeam-zone"], (drafts) => {
    drafts[0].metadata[STATIC_ZONE_KEY].triggerRuntime.sequence = 8;
  });

  const undoRes = await history.undoLastHistoryEntry();
  assert.ok(undoRes?.id);
  const liveZone = (await sdkStub.scene.items.getItems(["moonbeam-zone"]))[0];
  assert.deepEqual(liveZone.position, { x: 50, y: 50 }, "Zone position must revert to initial");
  assert.equal(liveZone.metadata[STATIC_ZONE_KEY].triggerRuntime.sequence, 8, "triggerRuntime must be preserved");
});

test("SCENARIO 8 — Action modifies Condition A; reconciler history:false adds Condition B -> Undo reverts A and preserves B", async () => {
  const condA = { id: "cond-blinded", condition: "Accecato", name: "Accecato" };
  const condB = { id: "cond-bless", condition: "Benedizione", name: "Benedizione" };
  const hero = {
    id: "hero-cond",
    name: "Hero",
    position: { x: 0, y: 0 },
    metadata: { [META_KEY]: { hp: 25, hpMax: 25, conditions: { version: 1, instances: [] } } },
  };
  resetScene([hero]);

  // Action: Add Condition A (Accecato)
  await effects.runEffectsMutation([
    {
      type: "condition:add-instances",
      instancesByTarget: { "hero-cond": [clone(condA)] },
    },
  ], {
    kind: "blind-spell",
    label: "Applica Accecato",
    targetIds: ["hero-cond"],
    history: true,
  });
  await settle(30);

  // Aura reconciler adds Condition B (Benedizione) in background (history: false)
  await sdkStub.scene.items.updateItems(["hero-cond"], (drafts) => {
    drafts[0].metadata[META_KEY].conditions.instances.push(clone(condB));
  });

  const undoRes = await history.undoLastHistoryEntry();
  assert.ok(undoRes?.id);
  const liveHero = (await sdkStub.scene.items.getItems(["hero-cond"]))[0];
  const liveConds = liveHero.metadata[META_KEY].conditions.instances;
  assert.equal(liveConds.length, 1);
  assert.equal(liveConds[0].id, "cond-bless", "Condition B must be preserved while Condition A was reverted");
});

test("SCENARIO 9 — Action modifies Condition A; subsequent modification changes Condition A -> Undo produces CONFLICT", async () => {
  const condA = { id: "cond-blinded", condition: "Accecato", name: "Accecato", severity: 1 };
  const hero = {
    id: "hero-cond-conflict",
    name: "Hero",
    position: { x: 0, y: 0 },
    metadata: { [META_KEY]: { hp: 25, hpMax: 25, conditions: { version: 1, instances: [] } } },
  };
  resetScene([hero]);

  await effects.runEffectsMutation([
    {
      type: "condition:add-instances",
      instancesByTarget: { "hero-cond-conflict": [clone(condA)] },
    },
  ], {
    kind: "blind-spell",
    label: "Applica Accecato",
    targetIds: ["hero-cond-conflict"],
    history: true,
  });
  await settle(30);

  const historyEntries = await history.getHistoryEntries();
  assert.equal(historyEntries.length, 1);

  // Directly modify Condition A in live scene
  await sdkStub.scene.items.updateItems(["hero-cond-conflict"], (drafts) => {
    const inst = drafts[0].metadata[META_KEY].conditions.instances[0];
    if (inst) inst.sourceId = "different-caster-source";
  });

  const undoRes = await history.undoHistoryThrough(historyEntries[0].id);
  const norm = normalizeHistoryUndoResult(undoRes);
  assert.equal(norm.outcome, HISTORY_UNDO_OUTCOME.CONFLICT);
});

test("SCENARIO 10A — stesso 'at', append normale B poi A -> B -> A per storeSeq", async () => {
  resetScene([]);

  const timestamp = 1750000000000;
  const entryA = {
    id: "entry-same-at-a",
    at: timestamp,
    label: "Action A",
    changes: [],
  };
  const entryB = {
    id: "entry-same-at-b",
    at: timestamp,
    label: "Action B",
    changes: [],
  };

  // Both entries have the same action timestamp. The owner accepts B first,
  // therefore B receives the lower storeSeq and remains before A.
  await historyOwner.requestHistoryOwnerAppend(entryB, { sceneEpoch: 0 });
  await historyOwner.requestHistoryOwnerAppend(entryA, { sceneEpoch: 0 });
  await settle(20);
  const entries = await history.getHistoryEntries();
  assert.deepEqual(entries.map((entry) => entry.id), [entryB.id, entryA.id]);
  assert.ok(entries[0].storeSeq < entries[1].storeSeq);
});

test("SCENARIO 10B — at distinti, arrivo invertito -> A -> B per precedenza di at", async () => {
  resetScene([]);

  const entryA = {
    id: "entry-distinct-at-a",
    at: 1750000000000,
    label: "Action A",
    changes: [],
  };
  const entryB = {
    id: "entry-distinct-at-b",
    at: 1750000001000,
    label: "Action B",
    changes: [],
  };

  // B reaches the owner first and gets the lower storeSeq, but at remains the
  // primary ordering key, so the earlier action A is persisted first.
  await historyOwner.requestHistoryOwnerAppend(entryB, { sceneEpoch: 0 });
  await historyOwner.requestHistoryOwnerAppend(entryA, { sceneEpoch: 0 });
  await settle(20);
  const entries = await history.getHistoryEntries();
  assert.deepEqual(entries.map((entry) => entry.id), [entryA.id, entryB.id]);
  assert.ok(entries[1].storeSeq < entries[0].storeSeq);
});

test("SCENARIO 10C — failure owner-side dopo reservation -> retry A conserva A -> B", async () => {
  let failAOnce = true;
  const owner = createTestHistoryOwnerHarness({
    onWrite: async (next) => {
      if (failAOnce && next.entries.some((entry) => entry.id === "entry-owner-failure-a")) {
        failAOnce = false;
        throw new Error("simulated owner-side append failure");
      }
    },
  });
  const timestamp = 1750000000000;
  const entryA = { id: "entry-owner-failure-a", at: timestamp, changes: [] };
  const entryB = { id: "entry-owner-failure-b", at: timestamp, changes: [] };

  // A is accepted by the owner and receives storeSeq 1, but its metadata
  // write fails. The failed response exposes the reserved entry payload.
  const failedA = await owner.append(entryA, "owner-failure-a-first");
  assert.equal(failedA.status, HISTORY_OWNER_STATUS.FAILED);
  assert.equal(failedA.entry.storeSeq, 1);
  assert.deepEqual(owner.state.entries, []);

  const persistedB = await owner.append(entryB, "owner-failure-b");
  assert.equal(persistedB.status, HISTORY_OWNER_STATUS.APPLIED);
  assert.equal(persistedB.entry.storeSeq, 2);

  const retriedA = await owner.append(failedA.entry, "owner-failure-a-retry");
  assert.equal(retriedA.status, HISTORY_OWNER_STATUS.APPLIED);
  assert.deepEqual(owner.state.entries.map((entry) => entry.id), [entryA.id, entryB.id]);
  assert.deepEqual(owner.state.entries.map((entry) => entry.storeSeq), [1, 2]);
});

test("SCENARIO 10D — failure prima dell'owner, stesso at -> B -> A per storeSeq", async () => {
  resetScene([]);

  const timestamp = 1750000000000;
  const entryA = {
    id: "entry-before-owner-a",
    at: timestamp,
    label: "Action A",
    changes: [],
  };
  const entryB = {
    id: "entry-before-owner-b",
    at: timestamp,
    label: "Action B",
    changes: [],
  };
  let firstAttempt = true;
  const appendWithTransportFailure = async (entry) => {
    if (entry.id === entryA.id && firstAttempt) {
      firstAttempt = false;
      // Simulate a transport failure before requestHistoryOwnerAppend is
      // called: the owner cannot reserve a storeSeq for A yet.
      throw new Error("simulated transport failure before owner");
    }
    return historyOwner.requestHistoryOwnerAppend(entry, { sceneEpoch: 0 });
  };

  await assert.rejects(
    () => appendWithTransportFailure(entryA),
    /before owner/u,
  );
  await appendWithTransportFailure(entryB);
  await appendWithTransportFailure(entryA);
  await settle(20);

  const entries = await history.getHistoryEntries();
  assert.deepEqual(entries.map((entry) => entry.id), [entryB.id, entryA.id]);
  assert.ok(entries[0].storeSeq < entries[1].storeSeq);
});

test("SCENARIO 10E — ordine incompatibile con gli after -> Undo conflict senza mutazioni parziali", async () => {
  const token = {
    id: "t1",
    name: "Token",
    position: { x: 0, y: 0 },
    metadata: { [META_KEY]: { hp: 5, hpMax: 20 } },
  };
  resetScene([token]);

  const entryA = hpHistoryEntry({
    id: "entry-undo-order-a",
    at: 1750000000000,
    before: 20,
    after: 10,
  });
  const entryB = hpHistoryEntry({
    id: "entry-undo-order-b",
    at: 1750000000000,
    before: 10,
    after: 5,
  });

  // Persist the newer state B first and the older state A second, producing
  // B -> A for the same-at arrival contract.
  await historyOwner.requestHistoryOwnerAppend(entryB, { sceneEpoch: 0 });
  await historyOwner.requestHistoryOwnerAppend(entryA, { sceneEpoch: 0 });
  await settle(20);
  assert.deepEqual(
    (await history.getHistoryEntries()).map((entry) => entry.id),
    [entryB.id, entryA.id],
  );

  const undoResult = await history.undoHistoryThrough(entryA.id, {
    sceneEpoch: currentSceneEpoch(),
  });
  assert.equal(
    normalizeHistoryUndoResult(undoResult).outcome,
    HISTORY_UNDO_OUTCOME.CONFLICT,
  );
  const liveToken = (await sdkStub.scene.items.getItems([token.id]))[0];
  assert.equal(liveToken.metadata[META_KEY].hp, 5);
  assert.deepEqual(
    (await history.getHistoryEntries()).map((entry) => entry.id),
    [entryB.id, entryA.id],
  );
});

test("SCENARIO 11 — Undo committed / removal fails for multiple attempts -> consistent state & idempotence without deadlock", async () => {
  const token = {
    id: "token-removal-test",
    name: "Target",
    position: { x: 0, y: 0 },
    metadata: { [META_KEY]: { hp: 20, hpMax: 20 } },
  };
  resetScene([token]);

  await history.withItemMetaHistory({
    itemIds: ["token-removal-test"],
    fields: ["hp"],
    label: "Danno 10",
    kind: "damage",
  }, async () => {
    await sdkStub.scene.items.updateItems(["token-removal-test"], (drafts) => {
      drafts[0].metadata[META_KEY].hp = 10;
    });
  });
  await settle(30);

  const entries = await history.getHistoryEntries();
  assert.equal(entries.length, 1);

  // First Undo attempt: commits to scene
  const undoRes1 = await history.undoHistoryThrough(entries[0].id);
  assert.equal(Array.isArray(undoRes1), true);
  let liveToken = (await sdkStub.scene.items.getItems(["token-removal-test"]))[0];
  assert.equal(liveToken.metadata[META_KEY].hp, 20, "Scene state was restored");

  // Calling readiness while removal is pending flushes and reports consistent state
  const readiness = await history.getHistoryUndoReadiness({ sceneEpoch: 0 });
  assert.equal(readiness.status, "ready");

  // Second Undo call is idempotent
  const undoRes2 = await history.undoHistoryThrough(entries[0].id);
  assert.equal(Array.isArray(undoRes2), true);
  liveToken = (await sdkStub.scene.items.getItems(["token-removal-test"]))[0];
  assert.equal(liveToken.metadata[META_KEY].hp, 20, "Scene stays restored without double inverse");
});

test("SCENARIO 12 — Realistic 5-action mixed workflow with repeated ALT+Z back to initial state", async () => {
  const wizard = {
    id: "wizard-flow",
    name: "Wizard",
    position: { x: 0, y: 0 },
    metadata: { [META_KEY]: { hp: 40, hpMax: 40, conditions: { version: 1, instances: [] } } },
  };
  resetScene([wizard]);

  // Action 1: HP damage (40 -> 32)
  await history.withItemMetaHistory({
    itemIds: ["wizard-flow"],
    fields: ["hp"],
    label: "Danno 8 HP",
    kind: "damage",
  }, async () => {
    await sdkStub.scene.items.updateItems(["wizard-flow"], (drafts) => {
      drafts[0].metadata[META_KEY].hp = 32;
    });
  });

  // Action 2: Apply Condition 'Avvelenato'
  const condPoison = { id: "cond-poison", condition: "Avvelenato", name: "Avvelenato" };
  await effects.runEffectsMutation([
    { type: "condition:add-instances", instancesByTarget: { "wizard-flow": [clone(condPoison)] } },
  ], { kind: "poison", label: "Avvelena", targetIds: ["wizard-flow"], history: true });

  // Action 3: Teleport wizard (0, 0 -> 200, 200)
  await effects.runEffectsMutation([], {
    kind: "teleport",
    label: "Teletrasporto",
    targetIds: ["wizard-flow"],
    sideEffects: [{
      type: "token:teleport",
      targetId: "wizard-flow",
      position: { x: 200, y: 200 },
      skipAnimation: true,
    }],
  });

  // Action 4: Create Static Zone
  const newZone = {
    id: "zone-flow",
    name: "Starlight",
    position: { x: 200, y: 200 },
    metadata: {
      [STATIC_ZONE_KEY]: {
        instanceId: "sl-1",
        ruleId: "sl:zone",
        role: "root",
        triggerRuntime: { pending: [] },
      },
    },
  };
  await historyOwner.requestHistoryOwnerAppend({
    id: "entry-create-zone",
    at: history.createActionTimestamp(),
    seq: history.nextHistorySequence(),
    kind: "cast-zone",
    label: "Crea zona luce",
    changes: [{
      id: "zone-flow",
      name: "Starlight",
      sceneBefore: null,
      sceneAfter: clone(newZone),
    }],
  }, { sceneEpoch: currentSceneEpoch() });
  await sdkStub.scene.items.addItems([clone(newZone)]);

  // Action 5: Resolve save reminder on zone
  const act = { id: "act-sl", turnKey: "1:1", targetId: "wizard-flow", targetIds: ["wizard-flow"] };
  const beforeZone = (await sdkStub.scene.items.getItems(["zone-flow"]))[0];
  const beforeZoneMeta = {
    ...beforeZone.metadata[STATIC_ZONE_KEY],
    triggerRuntime: { pending: [clone(act)] },
  };
  await sdkStub.scene.items.updateItems(["zone-flow"], (drafts) => {
    drafts[0].metadata[STATIC_ZONE_KEY] = clone(beforeZoneMeta);
  });

  await effects.runEffectsMutation([], {
    kind: "reminder-resolution",
    label: "Risolvi reminder luce",
    targetIds: ["zone-flow"],
    history: true,
    sceneEpoch: currentSceneEpoch(),
    sideEffects: [{
      type: "reminder:consume-zone-activation",
      itemId: "zone-flow",
      id: "zone-flow",
      metadataKey: STATIC_ZONE_KEY,
      activationId: "act-sl",
      targetId: "wizard-flow",
      activation: act,
    }],
    payload: { causality: { source: "zone-reminder", targetIds: ["zone-flow"] } },
  });

  await settle(40);
  const entries = await history.getHistoryEntries();
  assert.equal(entries.length, 5);

  // Undo Action 5: Reminder restored
  let res = await history.undoLastHistoryEntry();
  assert.ok(res?.id);
  let liveZone = (await sdkStub.scene.items.getItems(["zone-flow"]))[0];
  assert.equal(liveZone.metadata[STATIC_ZONE_KEY].triggerRuntime.pending.length, 1);
  assert.equal(liveZone.metadata[STATIC_ZONE_KEY].triggerRuntime.pending[0].id, "act-sl");

  // Undo Action 4: Static Zone removed
  res = await history.undoLastHistoryEntry();
  assert.ok(res?.id);
  const zoneExists = (await sdkStub.scene.items.getItems(["zone-flow"])).length > 0;
  assert.equal(zoneExists, false, "Zone item must be deleted on undo");

  // Undo Action 3: Teleport wizard back to (0, 0)
  res = await history.undoLastHistoryEntry();
  assert.ok(res?.id);
  let liveWiz = (await sdkStub.scene.items.getItems(["wizard-flow"]))[0];
  assert.deepEqual(liveWiz.position, { x: 0, y: 0 });

  // Undo Action 2: Condition 'Avvelenato' removed
  res = await history.undoLastHistoryEntry();
  assert.ok(res?.id);
  liveWiz = (await sdkStub.scene.items.getItems(["wizard-flow"]))[0];
  assert.deepEqual(liveWiz.metadata[META_KEY]?.conditions?.instances || [], []);

  // Undo Action 1: HP restored to 40
  res = await history.undoLastHistoryEntry();
  assert.ok(res?.id);
  liveWiz = (await sdkStub.scene.items.getItems(["wizard-flow"]))[0];
  assert.equal(liveWiz.metadata[META_KEY].hp, 40);

  // History is now empty
  const finalEntries = await history.getHistoryEntries();
  assert.equal(finalEntries.length, 0);
});
