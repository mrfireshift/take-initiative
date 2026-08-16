import assert from "node:assert/strict";
import test, { mock } from "node:test";
import {
  createVersionedIndexedDB,
  versionedKeyRange,
} from "../test-support/fakeVersionedIndexedDb.js";
import {
  createSceneEpochController,
  currentSceneEpoch,
  invalidateSceneEpoch,
  markSceneEpochReady,
} from "../src/sceneEpoch.js";
import {
  buildMatchedVisualEvent,
} from "../src/embersMatchedVisualCore.js";

globalThis.indexedDB = createVersionedIndexedDB();
globalThis.IDBKeyRange = versionedKeyRange;

const clone = (value) => (value === undefined ? undefined : structuredClone(value));

const localState = {
  items: [],
};

const localCalls = {
  getItems: [],
  addItems: [],
  deleteItems: [],
  updateItems: [],
};

const localHooks = {
  onAddItems: null,
  onDeleteItems: null,
};

function resetLocal() {
  localState.items = [];
  localCalls.getItems = [];
  localCalls.addItems = [];
  localCalls.deleteItems = [];
  localCalls.updateItems = [];
  localHooks.onAddItems = null;
  localHooks.onDeleteItems = null;
}

const broadcastListeners = new Map();

const sceneItemsState = [
  {
    id: "caster-1",
    name: "Caster",
    position: { x: 100, y: 100 },
    metadata: {},
  },
  {
    id: "target-1",
    name: "Target",
    position: { x: 250, y: 250 },
    metadata: {},
  },
];

const sceneMetadataState = {};

const sdkStub = {
  onReady() {},
  player: { getRole: async () => "GM" },
  room: { id: "epoch-test-room", getMetadata: async () => ({}) },
  scene: {
    isReady: async () => true,
    onReadyChange() {
      return () => {};
    },
    getMetadata: async () => clone(sceneMetadataState),
    setMetadata: async (update) => {
      Object.assign(sceneMetadataState, clone(update));
    },
    grid: {
      getDpi: async () => 150,
      getScale: async () => ({ parsed: { multiplier: 1.5, unit: "m" } }),
    },
    items: {
      getItems: async (ids) => {
        if (typeof ids === "function") {
          return sceneItemsState.filter(ids).map(clone);
        }
        const wanted = Array.isArray(ids) ? new Set(ids) : null;
        return sceneItemsState.filter((item) => !wanted || wanted.has(item.id)).map(clone);
      },
      getItemBounds: async () => ({
        min: { x: 0, y: 0 },
        max: { x: 150, y: 150 },
        width: 150,
        height: 150,
      }),
      updateItems: async (ids, updater) => {
        const wanted = new Set(Array.isArray(ids) ? ids : []);
        const drafts = sceneItemsState.filter((item) => wanted.has(item.id)).map(clone);
        await updater(drafts);
        const byId = new Map(drafts.map((item) => [item.id, item]));
        for (let i = 0; i < sceneItemsState.length; i++) {
          if (byId.has(sceneItemsState[i].id)) {
            sceneItemsState[i] = clone(byId.get(sceneItemsState[i].id));
          }
        }
      },
      deleteItems: async (ids) => {
        const toDelete = new Set(Array.isArray(ids) ? ids : []);
        for (let i = sceneItemsState.length - 1; i >= 0; i--) {
          if (toDelete.has(sceneItemsState[i].id)) sceneItemsState.splice(i, 1);
        }
      },
      addItems: async (items) => {
        sceneItemsState.push(...items.map(clone));
      },
    },
    local: {
      getItems: async (predicate) => {
        localCalls.getItems.push(predicate ? "predicate" : "all");
        if (typeof predicate === "function") {
          return localState.items.filter(predicate).map(clone);
        }
        return localState.items.map(clone);
      },
      addItems: async (items) => {
        localCalls.addItems.push(items.map((it) => it?.id));
        if (typeof localHooks.onAddItems === "function") {
          await localHooks.onAddItems(items);
        }
        localState.items.push(...items.map(clone));
      },
      deleteItems: async (ids) => {
        localCalls.deleteItems.push(clone(ids));
        if (typeof localHooks.onDeleteItems === "function") {
          await localHooks.onDeleteItems(ids);
        }
        const toDelete = new Set(Array.isArray(ids) ? ids : []);
        localState.items = localState.items.filter((it) => !toDelete.has(it.id));
      },
      updateItems: async (items, updater) => {
        localCalls.updateItems.push(items.map((it) => it?.id));
        await updater(items);
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

function buildLocalItemMock(props, meta) {
  const item = {
    id: `local-item-${Math.random().toString(36).slice(2, 8)}`,
    ...props,
    metadata: {},
  };
  const builder = {
    scale: (s) => { item.scale = s; return builder; },
    position: (p) => { item.position = p; return builder; },
    rotation: (r) => { item.rotation = r; return builder; },
    disableHit: (dh) => { item.disableHit = dh; return builder; },
    locked: (l) => { item.locked = l; return builder; },
    layer: (ly) => { item.layer = ly; return builder; },
    disableAutoZIndex: (d) => { item.disableAutoZIndex = d; return builder; },
    visible: (v) => { item.visible = v; return builder; },
    zIndex: (z) => { item.zIndex = z; return builder; },
    metadata: (m) => { item.metadata = { ...item.metadata, ...m }; return builder; },
    name: (n) => { item.name = n; return builder; },
    attachedTo: (a) => { item.attachedTo = a; return builder; },
    build: () => item,
  };
  return builder;
}

mock.module("@owlbear-rodeo/sdk", {
  exports: {
    default: sdkStub,
    buildLabel: (...args) => ({
      type: "LABEL",
      args,
      build: () => ({ id: "mock-label" }),
      text: () => ({ build: () => ({ id: "mock-label" }) }),
    }),
    buildText: (...args) => ({ type: "TEXT", args }),
    buildShape: (...args) => ({ type: "SHAPE", args }),
    buildImage: (props, meta) => buildLocalItemMock(props, meta),
    buildPath: () => {
      const pathObj = { id: `path-${Math.random().toString(36).slice(2, 8)}`, style: {} };
      const builder = {
        commands: () => builder,
        fillRule: () => builder,
        fillColor: () => builder,
        fillOpacity: () => builder,
        strokeColor: () => builder,
        strokeOpacity: () => builder,
        strokeWidth: () => builder,
        position: (p) => { pathObj.position = p; return builder; },
        scale: (s) => { pathObj.scale = s; return builder; },
        layer: () => builder,
        locked: () => builder,
        disableHit: () => builder,
        disableAutoZIndex: () => builder,
        visible: () => builder,
        zIndex: (z) => { pathObj.zIndex = z; return builder; },
        metadata: (m) => { pathObj.metadata = { ...pathObj.metadata, ...m }; return builder; },
        name: () => builder,
        build: () => pathObj,
      };
      return builder;
    },
    Command: { MOVE: 0, LINE: 1, CUBIC: 2, CLOSE: 3 },
  },
});

const {
  emitMatchedSpellVisual,
  emitMatchedSpellVisualEnd,
  mountEmbersMatchedVisualRenderer,
  unmountEmbersMatchedVisualRenderer,
  emitMatchedVisualEndsFromMutation,
} = await import("../src/embersMatchedVisualRenderer.js");

const {
  mountEffectsMutationCoordinatorService,
  unmountEffectsMutationCoordinatorService,
  runEffectsMutation,
} = await import("../src/effectsMutations.js");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("TEST 1 — delayed matched layer: aborts cleanly when scene switches before timer fires", async () => {
  resetLocal();
  await unmountEmbersMatchedVisualRenderer();
  mountEmbersMatchedVisualRenderer();

  const startEpoch = currentSceneEpoch();

  // Banishment has 2 layers: rays (delay 0) and portal (delay ~600ms)
  await emitMatchedSpellVisual({
    spellId: "banishment",
    casterId: "caster-1",
    targetIds: ["target-1"],
    sceneEpoch: startEpoch,
  });

  // Let initial 0ms timer fire and add layer 1
  await sleep(50);
  assert.equal(localCalls.addItems.length, 1, "Rays layer added on Scene A");

  // Scene switch before delayed layer (+600ms)
  invalidateSceneEpoch("scene-change-to-B");
  markSceneEpochReady("scene-B-ready");
  assert.notEqual(currentSceneEpoch(), startEpoch);

  // Wait past the 600ms delay
  await sleep(700);

  // Assert no delayed layer was added on Scene B
  assert.equal(localCalls.addItems.length, 1, "Delayed portal layer must NOT be added to Scene B");
  await unmountEmbersMatchedVisualRenderer();
});

test("TEST 2 — scene switch during addItems: post-await check prevents further lifecycle work on Scene B", async () => {
  resetLocal();
  await unmountEmbersMatchedVisualRenderer();
  mountEmbersMatchedVisualRenderer();

  const startEpoch = currentSceneEpoch();
  let addItemsPendingGate = null;
  const addItemsGate = new Promise((resolve) => {
    addItemsPendingGate = resolve;
  });

  localHooks.onAddItems = async () => {
    // Hold addItems promise open
    await addItemsGate;
  };

  const emitPromise = emitMatchedSpellVisual({
    spellId: "misty-step",
    casterId: "caster-1",
    targetIds: ["caster-1"],
    sceneEpoch: startEpoch,
  });

  // Give loop a tick to enter addItems
  await sleep(30);

  // Switch scene while addItems is pending
  invalidateSceneEpoch("scene-change-during-addItems");
  markSceneEpochReady("scene-B-ready");

  // Resolve addItems
  addItemsPendingGate();
  await emitPromise;
  await sleep(50);

  // Verify no new timers/deletes scheduled against Scene B
  localCalls.deleteItems = [];
  await sleep(1500);

  assert.equal(localCalls.deleteItems.length, 0, "No deleteItems scheduled or executed on Scene B");
  await unmountEmbersMatchedVisualRenderer();
});

test("TEST 3 — transient cleanup after scene switch: deleteItems is NOT called against Scene B", async () => {
  resetLocal();
  await unmountEmbersMatchedVisualRenderer();
  mountEmbersMatchedVisualRenderer();

  const startEpoch = currentSceneEpoch();

  // Single-target transient spell
  await emitMatchedSpellVisual({
    spellId: "misty-step",
    casterId: "caster-1",
    targetIds: ["caster-1"],
    sceneEpoch: startEpoch,
  });

  await sleep(50);
  assert.equal(localCalls.addItems.length, 1, "Transient item created in Scene A");

  // Switch to Scene B before transient cleanup timer expires
  invalidateSceneEpoch("switch-to-B-before-cleanup");
  markSceneEpochReady("scene-B-ready");

  // Advance time past the cleanup delay
  await sleep(1200);

  // Assert deleteItems was NOT called against Scene B
  assert.equal(localCalls.deleteItems.length, 0, "deleteItems must not be called on Scene B");
  await unmountEmbersMatchedVisualRenderer();
});

test("TEST 4 — recovery sweeper stale transient: discards old scene records without writing to Scene B", async () => {
  resetLocal();
  await unmountEmbersMatchedVisualRenderer();
  mountEmbersMatchedVisualRenderer();

  const startEpoch = currentSceneEpoch();

  // Fail the initial deleteItems to force it into recovery sweeper
  let failDeletes = true;
  localHooks.onDeleteItems = async () => {
    if (failDeletes) throw new Error("Simulated SDK transient delete failure");
  };

  await emitMatchedSpellVisual({
    spellId: "misty-step",
    casterId: "caster-1",
    targetIds: ["caster-1"],
    sceneEpoch: startEpoch,
  });

  await sleep(50);
  assert.equal(localCalls.addItems.length, 1);

  // Switch scene
  invalidateSceneEpoch("switch-to-B");
  markSceneEpochReady("scene-B-ready");

  failDeletes = false;
  localCalls.deleteItems = [];

  // Wait for recovery sweeper interval (1000ms)
  await sleep(1500);

  // Assert sweeper did not execute delete against Scene B
  assert.equal(localCalls.deleteItems.length, 0, "Recovery sweeper must not delete on Scene B");
  await unmountEmbersMatchedVisualRenderer();
});

test("TEST 5 — persistent visual stale end: end event from old epoch does not delete or create in Scene B", async () => {
  resetLocal();
  await unmountEmbersMatchedVisualRenderer();
  mountEmbersMatchedVisualRenderer();

  const epochA = currentSceneEpoch();

  // Start persistent visual in Scene A (e.g. Bless / Benedizione)
  await emitMatchedSpellVisual({
    spellId: "bless",
    casterId: "caster-1",
    targetIds: ["target-1"],
    lifecycleId: "bless-lifecycle-1",
    mode: "start",
    sceneEpoch: epochA,
  });

  await sleep(50);
  assert.equal(localCalls.addItems.length, 1, "Bless loop added to Scene A");

  // Switch to Scene B
  invalidateSceneEpoch("switch-to-B");
  markSceneEpochReady("scene-B-ready");

  localCalls.deleteItems = [];
  localCalls.addItems = [];

  // Deliver stale end event from epoch A
  await emitMatchedSpellVisualEnd({
    spellId: "bless",
    casterId: "caster-1",
    targetIds: ["target-1"],
    lifecycleId: "bless-lifecycle-1",
    sceneEpoch: epochA,
  });

  await sleep(300);

  assert.equal(localCalls.deleteItems.length, 0, "No persistent delete called against Scene B");
  assert.equal(localCalls.addItems.length, 0, "No outro created in Scene B");
  await unmountEmbersMatchedVisualRenderer();
});

test("TEST 6 — same-scene normal behavior: transient, persistent, and explicit end work correctly", async () => {
  resetLocal();
  await unmountEmbersMatchedVisualRenderer();
  mountEmbersMatchedVisualRenderer();

  const epoch = currentSceneEpoch();

  // 1. Transient: added then cleaned up
  await emitMatchedSpellVisual({
    spellId: "cure-wounds",
    casterId: "caster-1",
    targetIds: ["caster-1"],
    sceneEpoch: epoch,
  });

  await sleep(50);
  assert.equal(localCalls.addItems.length, 1, "Cure wounds added");

  await sleep(2600);
  assert.equal(localCalls.deleteItems.length, 1, "Cure wounds cleaned up");

  // 2. Persistent: added and stays
  localCalls.addItems = [];
  localCalls.deleteItems = [];

  await emitMatchedSpellVisual({
    spellId: "bless",
    casterId: "caster-1",
    targetIds: ["target-1"],
    lifecycleId: "bless-same-scene",
    mode: "start",
    sceneEpoch: epoch,
  });

  await sleep(50);
  assert.equal(localCalls.addItems.length, 1, "Bless persistent loop added");

  // Remains active
  await sleep(500);
  assert.equal(localCalls.deleteItems.length, 0, "Bless stays alive");

  // End event removes persistent loop
  await emitMatchedSpellVisualEnd({
    spellId: "bless",
    casterId: "caster-1",
    targetIds: ["target-1"],
    lifecycleId: "bless-same-scene",
    sceneEpoch: epoch,
  });

  await sleep(50);
  assert.equal(localCalls.deleteItems.length, 1, "Bless removed on end");
  await unmountEmbersMatchedVisualRenderer();
});

test("TEST 9 — True Effects Late Capture Regression: origin epoch captured at mutation entry is preserved after async delay", async () => {
  await mountEffectsMutationCoordinatorService();
  const epochA = currentSceneEpoch();

  let broadcastEventData = null;
  const unsubscribe = sdkStub.broadcast.onMessage(
    "com.thebigpicture.initiative/embers-matched-visual",
    (event) => {
      broadcastEventData = event?.data;
    },
  );

  // Set up caster-1 with concentration
  sceneItemsState[0].metadata["com.thebigpicture.initiative/meta"] = {
    concentrations: {
      "bless-1": {
        instanceId: "bless-instance-1",
        spellId: "bless",
        targets: ["target-1"],
      },
    },
    spells: [],
  };

  // Run effects mutation that breaks concentration WITHOUT passing explicit sceneEpoch,
  // so runEffectsMutation captures currentSceneEpoch() at entry
  const mutationPromise = runEffectsMutation([
    {
      type: "concentration:break",
      casterIds: ["caster-1"],
    },
  ], {
    kind: "spell",
    label: "Break Concentration",
    targetIds: ["caster-1"],
  });

  // Switch scene while mutation is running
  invalidateSceneEpoch("scene-switch-during-effects-mutation");
  markSceneEpochReady("scene-B-ready");

  const epochB = currentSceneEpoch();
  assert.notEqual(epochB, epochA, "Scene epoch must have advanced to B");

  const result = await mutationPromise.catch((err) => err?.result || err);
  await sleep(50);

  if (result?.status === "applied") {
    assert.ok(broadcastEventData != null, "Applied mutation must emit visual end");
    assert.equal(broadcastEventData.sceneEpoch, epochA, "Emitted visual end MUST retain origin epoch A");
    assert.notEqual(broadcastEventData.sceneEpoch, epochB, "Emitted visual end MUST NEVER be relabelled as epoch B");
  } else {
    // Operation was correctly rejected as stale across scene switch boundary
    assert.ok(
      result?.status === "rejected" || result?.status === "failed" || result?.error != null,
      "Stale operation must be rejected across scene switch boundary",
    );
    assert.notEqual(broadcastEventData?.sceneEpoch, epochB, "Stale operation must never emit with epoch B");
  }

  unsubscribe();
  unmountEffectsMutationCoordinatorService();
});

test("TEST 9B — emitMatchedVisualEndsFromMutation preserves captured origin epoch", async () => {
  const epochA = currentSceneEpoch();

  let broadcastEventData = null;
  const unsubscribe = sdkStub.broadcast.onMessage(
    "com.thebigpicture.initiative/embers-matched-visual",
    (event) => {
      broadcastEventData = event?.data;
    },
  );

  const fakeMutation = {
    status: "applied",
    commandId: "test-mutation-9b",
    changes: [
      {
        id: "caster-1",
        before: {
          concentrations: {
            "bless-1": {
              instanceId: "bless-instance-1",
              spellId: "bless",
              targets: ["target-1"],
            },
          },
          spells: [],
        },
        after: {
          concentrations: {},
          spells: [],
        },
      },
    ],
  };

  await emitMatchedVisualEndsFromMutation(fakeMutation, { sceneEpoch: epochA });

  assert.ok(broadcastEventData != null, "Broadcast message must be received");
  assert.equal(broadcastEventData.sceneEpoch, epochA, "Visual end must retain origin epoch A");

  unsubscribe();
});

test("TEST 11 — Cross-Realm numeric epoch mismatch: visual renders when emitter epoch differs from receiver epoch", async () => {
  resetLocal();
  await unmountEmbersMatchedVisualRenderer();
  mountEmbersMatchedVisualRenderer();

  // Receiver is at its own local epoch (e.g. currentSceneEpoch())
  const receiverEpoch = currentSceneEpoch();

  // Build a valid visual event with an emitter epoch from a different realm (e.g. epoch 7)
  const event = buildMatchedVisualEvent({
    spellId: "bless",
    eventId: "cross-realm-bless-1",
    casterId: "caster-1",
    targetIds: ["target-1"],
    caster: { id: "caster-1", center: { x: 100, y: 100 }, size: 150 },
    targets: [{ id: "target-1", center: { x: 250, y: 250 }, size: 150 }],
    sceneDpi: 150,
    gridScale: { multiplier: 1.5, unit: "m" },
    mode: "start",
    lifecycleId: "bless-cross-realm",
    sceneEpoch: 7, // Emitter-local epoch: 7
  });

  // Broadcast the event with emitter epoch 7 to the receiver (which has receiverEpoch !== 7)
  assert.notEqual(7, receiverEpoch, "Emitter epoch 7 must differ from receiver epoch");
  await sdkStub.broadcast.sendMessage("com.thebigpicture.initiative/embers-matched-visual", event);

  await sleep(100);

  // Assert that the receiver rendered the visual into the current scene (did not reject due to 7 !== receiverEpoch)
  assert.equal(localCalls.addItems.length, 1, "Cross-realm visual must render into current scene");
  await unmountEmbersMatchedVisualRenderer();
});

test("TEST 12 — Cross-Realm late delivery: old Scene A event arriving in Scene B is aborted due to absent anchors", async () => {
  resetLocal();
  await unmountEmbersMatchedVisualRenderer();
  mountEmbersMatchedVisualRenderer();

  // Event belongs to tokens from Scene A that DO NOT exist in current scene items
  const staleEvent = buildMatchedVisualEvent({
    spellId: "bless",
    eventId: "stale-scene-a-event",
    casterId: "nonexistent-caster-scene-a",
    targetIds: ["nonexistent-target-scene-a"],
    caster: { id: "nonexistent-caster-scene-a", center: { x: 100, y: 100 }, size: 150 },
    targets: [{ id: "nonexistent-target-scene-a", center: { x: 250, y: 250 }, size: 150 }],
    sceneDpi: 150,
    gridScale: { multiplier: 1.5, unit: "m" },
    mode: "start",
    lifecycleId: "stale-scene-a-lifecycle",
    sceneEpoch: 0,
  });

  // Broadcast arrives in current scene where nonexistent tokens are absent
  await sdkStub.broadcast.sendMessage("com.thebigpicture.initiative/embers-matched-visual", staleEvent);

  await sleep(100);

  // Assert that no scene-local items were created in Scene B
  assert.equal(localCalls.addItems.length, 0, "No items must be added when event anchors are absent from current scene");
  await unmountEmbersMatchedVisualRenderer();
});

test("TEST 13 — Scene Unload Bookkeeping Reset: phase unload resets internal state without cross-scene deleteItems", async () => {
  resetLocal();
  await unmountEmbersMatchedVisualRenderer();
  mountEmbersMatchedVisualRenderer();

  // Start a persistent visual
  await emitMatchedSpellVisual({
    spellId: "bless",
    casterId: "caster-1",
    targetIds: ["target-1"],
    lifecycleId: "unload-reset-test",
    mode: "start",
  });

  await sleep(50);
  assert.equal(localCalls.addItems.length, 1);

  // Invalidate scene epoch (triggers phase === "unload")
  localCalls.deleteItems = [];
  invalidateSceneEpoch("scene-unload-test");

  // Assert: reset on unload must NOT perform deleteItems against the new/unloaded scene
  assert.equal(localCalls.deleteItems.length, 0, "Unload reset must NOT call deleteItems against scene");

  // Mark ready
  markSceneEpochReady("scene-ready-test");

  // Advance time: any old-scene timers must be canceled or inert
  await sleep(500);
  assert.equal(localCalls.deleteItems.length, 0, "No stale timers fired after unload reset");

  await unmountEmbersMatchedVisualRenderer();
});

test("TEST 16 — Stale Broadcast END event arriving in Scene B: aborted when anchors absent and not locally owned", async () => {
  resetLocal();
  await unmountEmbersMatchedVisualRenderer();
  mountEmbersMatchedVisualRenderer();

  // Switch to Scene B
  invalidateSceneEpoch("scene-change-to-scene-B");
  markSceneEpochReady("scene-B-ready");

  localCalls.addItems = [];
  localCalls.deleteItems = [];

  // Deliver old wire END from Scene A (caster and targets belong to Scene A and do NOT exist in Scene B)
  const staleEndEvent = {
    type: "embers-matched",
    mode: "end",
    spellId: "bless",
    eventId: "stale-end-event-1",
    lifecycleId: "stale-lifecycle-scene-a",
    casterId: "scene-a-caster",
    targetIds: ["scene-a-target"],
    layers: [],
    sceneEpoch: 0,
  };

  await sdkStub.broadcast.sendMessage("com.thebigpicture.initiative/embers-matched-visual", staleEndEvent);
  await sleep(100);

  // Assert: 0 addItems, 0 deleteItems, no Scene B contamination
  assert.equal(localCalls.addItems.length, 0, "No items added on stale wire END");
  assert.equal(localCalls.deleteItems.length, 0, "No deleteItems called on stale wire END");

  await unmountEmbersMatchedVisualRenderer();
});

test("TEST 17 — Same-scene END when token was removed: locally owned lifecycle is safely cleared", async () => {
  resetLocal();
  await unmountEmbersMatchedVisualRenderer();
  mountEmbersMatchedVisualRenderer();

  // 1. Start persistent visual for caster-1 in current scene
  await emitMatchedSpellVisual({
    spellId: "bless",
    casterId: "caster-1",
    targetIds: ["target-1"],
    lifecycleId: "bless-token-removed-lifecycle",
    mode: "start",
  });

  await sleep(50);
  assert.equal(localCalls.addItems.length, 1, "Bless item added");

  // 2. Token disappears / is deleted from scene items before END event arrives
  const savedCaster = sceneItemsState.shift(); // Remove caster-1 from scene items
  localCalls.deleteItems = [];

  // 3. Deliver wire END for that lifecycle
  const endEvent = {
    type: "embers-matched",
    mode: "end",
    spellId: "bless",
    eventId: "bless-end-token-removed",
    lifecycleId: "bless-token-removed-lifecycle",
    casterId: "caster-1",
    targetIds: ["target-1"],
    layers: [],
  };

  await sdkStub.broadcast.sendMessage("com.thebigpicture.initiative/embers-matched-visual", endEvent);
  await sleep(50);

  // Assert: persistent item was deleted safely because lifecycle was locally owned
  assert.equal(localCalls.deleteItems.length, 1, "Locally owned lifecycle was cleared despite missing token");

  // Restore caster-1
  if (savedCaster) sceneItemsState.unshift(savedCaster);
  await unmountEmbersMatchedVisualRenderer();
});

test("TEST 18 — Embers Normal Unmount Fallback Cleanup: tracked ID is deleted even if local.getItems fails", async () => {
  resetLocal();
  await unmountEmbersMatchedVisualRenderer();
  mountEmbersMatchedVisualRenderer();

  // Create a persistent visual so activeLocalVideoIds has the item ID
  await emitMatchedSpellVisual({
    spellId: "bless",
    casterId: "caster-1",
    targetIds: ["target-1"],
    lifecycleId: "unmount-fallback-test",
    mode: "start",
  });

  await sleep(50);
  assert.equal(localCalls.addItems.length, 1);
  const createdItemId = localCalls.addItems[0][0];

  localCalls.deleteItems = [];

  // Mock OBR.scene.local.getItems to throw an error during unmount
  const originalGetItems = sdkStub.scene.local.getItems;
  sdkStub.scene.local.getItems = async () => {
    throw new Error("Simulated SDK getItems failure during unmount");
  };

  try {
    await unmountEmbersMatchedVisualRenderer();

    // Assert: deleteItems was still called with the tracked ID!
    assert.equal(localCalls.deleteItems.length, 1, "deleteItems called during unmount");
    assert.ok(localCalls.deleteItems[0].includes(createdItemId), "Tracked item ID was deleted in unmount fallback");
  } finally {
    sdkStub.scene.local.getItems = originalGetItems;
  }
});

