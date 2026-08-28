import assert from "node:assert/strict";
import test, { mock } from "node:test";
import {
  currentSceneEpoch,
  invalidateSceneEpoch,
  markSceneEpochReady,
} from "../src/sceneEpoch.js";

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

let deleteFailuresRemaining = 0;
let addItemsGate = null;

function resetLocal() {
  localState.items = [];
  localCalls.getItems = [];
  localCalls.addItems = [];
  localCalls.deleteItems = [];
  localCalls.updateItems = [];
  deleteFailuresRemaining = 0;
  addItemsGate = null;
}

const broadcastListeners = new Map();

const sdkStub = {
  onReady() {},
  player: { getRole: async () => "GM" },
  room: { id: "epoch-test-room", getMetadata: async () => ({}) },
  scene: {
    isReady: async () => true,
    grid: {
      getDpi: async () => 150,
      getScale: async () => ({ parsed: { multiplier: 1.5, unit: "m" } }),
    },
    items: {
      getItems: async (ids) => {
        const wanted = Array.isArray(ids) ? new Set(ids) : null;
        const allItems = [{ id: "caster-1", name: "Caster", position: { x: 100, y: 100 } }];
        return allItems.filter((it) => !wanted || wanted.has(it.id)).map(clone);
      },
      getItemBounds: async () => null,
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
        if (addItemsGate) await addItemsGate.promise;
        localState.items.push(...items.map(clone));
      },
      deleteItems: async (ids) => {
        localCalls.deleteItems.push(clone(ids));
        if (deleteFailuresRemaining > 0) {
          deleteFailuresRemaining -= 1;
          throw new Error("Simulated SDK deleteItems failure during fireball cleanup");
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
    build: () => item,
  };
  return builder;
}

mock.module("@owlbear-rodeo/sdk", {
  exports: {
    default: sdkStub,
    buildLabel: (...args) => ({ type: "LABEL", args, build: () => ({ id: "mock-label" }) }),
    buildText: (...args) => ({ type: "TEXT", args }),
    buildShape: (...args) => ({ type: "SHAPE", args }),
    buildImage: (props, meta) => buildLocalItemMock(props, meta),
    buildPath: () => {
      const pathObj = { id: `path-${Math.random().toString(36).slice(2, 8)}`, style: {} };
      const builder = {
        commands: () => builder,
        fillRule: () => builder,
        fillColor: (c) => { pathObj.fillColor = c; return builder; },
        fillOpacity: (o) => { pathObj.style.fillOpacity = o; return builder; },
        strokeColor: (c) => { pathObj.strokeColor = c; return builder; },
        strokeOpacity: (o) => { pathObj.style.strokeOpacity = o; return builder; },
        strokeWidth: (w) => { pathObj.strokeWidth = w; return builder; },
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
  emitFireballVisual,
  mountFireballVisualRenderer,
  unmountFireballVisualRenderer,
} = await import("../src/fireballVisualRenderer.js");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function deferred() {
  let resolve;
  const promise = new Promise((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

test("TEST 7 — Fireball delayed scene switch: delayed explosion and updates are aborted on Scene B", async () => {
  resetLocal();
  await unmountFireballVisualRenderer();
  mountFireballVisualRenderer();

  const startEpoch = currentSceneEpoch();

  // Fireball with source and destination produces a WebM plan with beam (immediate) and explosion (+3000ms)
  await emitFireballVisual({
    preview: {
      start: { x: 500, y: 500 },
      end: { x: 500, y: 500 },
      radius: 600,
      dpi: 150,
    },
    casterId: "caster-1",
    eventId: "fireball-test-1",
    sceneEpoch: startEpoch,
  });

  // Probe delay is 120ms
  await sleep(150);
  assert.equal(localCalls.addItems.length, 1, "Initial beam added on Scene A");

  // Switch to Scene B before delayed explosion (scheduled for +3000ms)
  invalidateSceneEpoch("switch-to-B-before-explosion");
  markSceneEpochReady("scene-B-ready");

  // Advance time past explosion delay
  await sleep(3200);

  // Assert no new items were added to Scene B
  assert.equal(localCalls.addItems.length, 1, "Explosion must NOT be added to Scene B");
  assert.equal(localCalls.deleteItems.length, 0, "No deleteItems must be called against Scene B");
  await unmountFireballVisualRenderer();
});

test("TEST 8 — Fireball normal flow: all layers render and clean up within same scene", async () => {
  resetLocal();
  await unmountFireballVisualRenderer();
  mountFireballVisualRenderer();

  const epoch = currentSceneEpoch();

  // 1. Standard Fireball (WebM video rendering)
  await emitFireballVisual({
    preview: {
      start: { x: 500, y: 500 },
      radius: 600,
      dpi: 150,
    },
    eventId: "fireball-standard-1",
    sceneEpoch: epoch,
  });

  // Wait past probe delay (120ms)
  await sleep(150);
  assert.equal(localCalls.addItems.length, 1, "WebM explosion item added to scene");

  // Wait past duration (4040ms)
  await sleep(4100);
  assert.equal(localCalls.deleteItems.length, 1, "WebM explosion item deleted on completion");
  assert.equal(localState.items.length, 0, "WebM explosion is no longer present after cleanup");
  await sleep(1100);
  assert.equal(localCalls.addItems.length, 1, "Cleanup must not allow the video to start a second visual cycle");
  assert.equal(localCalls.deleteItems.length, 1, "Cleanup must not issue repeated deletes after success");
  await unmountFireballVisualRenderer();
});

test("TEST 14 — Fireball Cross-Realm numeric epoch mismatch: renders when wire epoch differs from receiver epoch", async () => {
  resetLocal();
  await unmountFireballVisualRenderer();
  mountFireballVisualRenderer();

  const receiverEpoch = currentSceneEpoch();

  // Send a fireball visual with wire sceneEpoch 9
  assert.notEqual(9, receiverEpoch);
  await sdkStub.broadcast.sendMessage("com.thebigpicture.initiative/fireball-visual", {
    type: "fireball",
    eventId: "remote-fireball-1",
    center: { x: 500, y: 500 },
    radius: 600,
    dpi: 150,
    sceneEpoch: 9,
  });

  await sleep(150);
  assert.equal(localCalls.addItems.length, 1, "Fireball rendered despite cross-realm wire epoch mismatch");
  await unmountFireballVisualRenderer();
});

test("TEST 15 — Fireball Unload Reset: phase unload resets timers without cross-scene deleteItems", async () => {
  resetLocal();
  await unmountFireballVisualRenderer();
  mountFireballVisualRenderer();

  // Emit fireball
  await emitFireballVisual({
    preview: {
      start: { x: 500, y: 500 },
      radius: 600,
      dpi: 150,
    },
    eventId: "fireball-unload-test",
  });

  await sleep(150);
  assert.equal(localCalls.addItems.length, 1);

  // Invalidate epoch (triggers phase === "unload")
  localCalls.deleteItems = [];
  invalidateSceneEpoch("fireball-scene-unload");

  assert.equal(localCalls.deleteItems.length, 0, "No deleteItems on unload");

  markSceneEpochReady("fireball-scene-ready");

  await sleep(500);
  assert.equal(localCalls.deleteItems.length, 0, "Old timers canceled by unload reset");
  await unmountFireballVisualRenderer();
});

test("TEST 19 — Fireball Normal Unmount Fallback Cleanup: tracked IDs are deleted even if local.getItems fails", async () => {
  resetLocal();
  await unmountFireballVisualRenderer();
  mountFireballVisualRenderer();

  // Emit fireball to register active tracked items
  await emitFireballVisual({
    preview: {
      start: { x: 500, y: 500 },
      radius: 600,
      dpi: 150,
    },
    eventId: "fireball-unmount-fallback-test",
  });

  await sleep(150);
  assert.equal(localCalls.addItems.length, 1);
  const createdItemId = localCalls.addItems[0][0];

  localCalls.deleteItems = [];

  // Mock OBR.scene.local.getItems to throw an error during unmount
  const originalGetItems = sdkStub.scene.local.getItems;
  sdkStub.scene.local.getItems = async () => {
    throw new Error("Simulated SDK getItems failure during fireball unmount");
  };

  try {
    await unmountFireballVisualRenderer();

    // Assert: deleteItems was called with the tracked ID!
    assert.equal(localCalls.deleteItems.length, 1, "deleteItems called during unmount");
    assert.ok(localCalls.deleteItems[0].includes(createdItemId), "Tracked fireball item ID was deleted in unmount fallback");
  } finally {
    sdkStub.scene.local.getItems = originalGetItems;
  }
});

test("TEST 20 — Fireball cleanup retry: a failed WebM delete is retried and eventually removes the item", async () => {
  resetLocal();
  await unmountFireballVisualRenderer();
  mountFireballVisualRenderer();

  await emitFireballVisual({
    preview: {
      start: { x: 500, y: 500 },
      radius: 600,
      dpi: 150,
    },
    eventId: "fireball-cleanup-retry-test",
  });

  await sleep(150);
  assert.equal(localCalls.addItems.length, 1);
  const createdItemId = localCalls.addItems[0][0];
  deleteFailuresRemaining = 1;

  await unmountFireballVisualRenderer();
  assert.ok(
    localState.items.some((item) => item.id === createdItemId),
    "The WebM remains available for retry after the first delete failure",
  );

  // The retry record is checked by a 1s sweeper; allow for its phase relative
  // to the first failed unmount cleanup.
  await sleep(2200);
  assert.equal(
    localState.items.some((item) => item.id === createdItemId),
    false,
    "The cleanup sweeper removes the transient WebM after the failure",
  );
  assert.ok(localCalls.deleteItems.length >= 2, "deleteItems is retried");
});

test("TEST 21 — Fireball in-flight add: an item added after unmount is cleaned immediately", async () => {
  resetLocal();
  await unmountFireballVisualRenderer();
  mountFireballVisualRenderer();

  const gate = deferred();
  addItemsGate = gate;
  await emitFireballVisual({
    preview: {
      start: { x: 500, y: 500 },
      radius: 600,
      dpi: 150,
    },
    eventId: "fireball-in-flight-add-test",
  });

  await sleep(180);
  assert.equal(localCalls.addItems.length, 1, "The WebM add is in flight");
  const createdItemId = localCalls.addItems[0][0];

  await unmountFireballVisualRenderer();
  gate.resolve();
  addItemsGate = null;
  await sleep(50);

  assert.equal(localState.items.length, 0, "The late item is deleted after unmount");
  assert.ok(
    localCalls.deleteItems.some((ids) => ids.includes(createdItemId)),
    "The late item ID is passed to deleteItems",
  );
});
