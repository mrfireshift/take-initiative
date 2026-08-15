import assert from "node:assert/strict";
import test from "node:test";
import { mock } from "node:test";

const sdkStub = {
  onReady: () => {},
  scene: {
    isReady: async () => true,
    onReadyChange: () => () => {},
    onMetadataChange: () => () => {},
    getMetadata: async () => ({}),
    items: {
      onChange: () => () => {},
      getItems: async () => [],
      getItemBounds: async () => null,
    },
    grid: {
      onChange: () => () => {},
      getDpi: async () => 150,
      getScale: async () => ({ parsed: { multiplier: 1.5, unit: "m" } }),
    },
  },
};
mock.module("@owlbear-rodeo/sdk", { exports: { default: sdkStub } });

const { createSceneItemBoundsCache } = await import("../src/sceneItemBoundsCache.js");
const { createSpatialSceneSnapshotService } = await import("../src/spatialSceneSnapshot.js");
const { createPerformanceFixture } = await import("../test-support/performanceFixture.js");
const { createPerformanceObr } = await import("../test-support/performanceObr.js");

function item(id, x = 0) {
  return {
    id,
    type: "IMAGE",
    layer: "CHARACTER",
    position: { x, y: 0 },
    scale: { x: 1, y: 1 },
    image: { width: 150, height: 150, url: `${id}.png` },
  };
}

function bounds(x) {
  return {
    min: { x, y: 0 },
    max: { x: x + 150, y: 150 },
    width: 150,
    height: 150,
    center: { x: x + 75, y: 75 },
  };
}

function makeHarness({ subscriptions = null } = {}) {
  let epoch = 1;
  let identity = "scene-a";
  let ready = true;
  let generation = 1;
  let sourceItems = [item("one", 0), item("two", 200)];
  let metadata = { revision: 1 };
  let dpi = 150;
  let scale = { parsed: { multiplier: 1.5, unit: "m" } };
  let resolveBounds = null;
  const calls = [];
  const reads = { items: 0, metadata: 0, dpi: 0, scale: 0 };
  const cache = createSceneItemBoundsCache((id) => {
    calls.push(id);
    if (resolveBounds) {
      return new Promise((resolve) => {
        resolveBounds = () => resolve(bounds(sourceItems.find((entry) => entry.id === id)?.position.x || 0));
      });
    }
    return Promise.resolve(bounds(sourceItems.find((entry) => entry.id === id)?.position.x || 0));
  }, { timeoutMs: 100 });
  const service = createSpatialSceneSnapshotService({
    readItemsSnapshot: () => {
      reads.items += 1;
      return { complete: ready, generation, items: sourceItems };
    },
    readSceneMetadata: () => {
      reads.metadata += 1;
      return metadata;
    },
    readGridDpi: () => {
      reads.dpi += 1;
      return dpi;
    },
    readGridScale: () => {
      reads.scale += 1;
      return scale;
    },
    isSceneReady: () => ready,
    getSceneEpoch: () => epoch,
    isCurrentEpoch: (value) => ready && Number(value) === epoch,
    getSceneIdentity: () => identity,
    boundsCache: cache,
    subscribeItems: (handler) => {
      if (subscriptions) subscriptions.items = handler;
      return () => {};
    },
    subscribeGrid: (handler) => {
      if (subscriptions) subscriptions.grid = handler;
      return () => {};
    },
    subscribeSceneReady: (handler) => {
      if (subscriptions) subscriptions.ready = handler;
      return () => {};
    },
    subscribeSceneMetadata: (handler) => {
      if (subscriptions) subscriptions.metadata = handler;
      return () => {};
    },
    subscribeEpoch: (handler) => {
      if (subscriptions) subscriptions.epoch = handler;
      return () => {};
    },
  });
  return {
    service,
    cache,
    calls,
    reads,
    setSource(next) {
      if (next.epoch !== undefined) epoch = next.epoch;
      if (next.identity !== undefined) identity = next.identity;
      if (next.ready !== undefined) ready = next.ready;
      if (next.generation !== undefined) generation = next.generation;
      if (next.items !== undefined) sourceItems = next.items;
      if (next.metadata !== undefined) metadata = next.metadata;
      if (next.dpi !== undefined) dpi = next.dpi;
      if (next.scale !== undefined) scale = next.scale;
    },
    blockNextBounds() {
      resolveBounds = () => {};
    },
    releaseBounds() {
      resolveBounds?.();
      resolveBounds = null;
    },
  };
}

test("snapshot spaziale coalesced: tre consumer condividono snapshot e miss bounds", async () => {
  const harness = makeHarness();
  const snapshots = await Promise.all([
    harness.service.getSnapshot({ sceneEpoch: 1 }),
    harness.service.getSnapshot({ sceneEpoch: 1 }),
    harness.service.getSnapshot({ sceneEpoch: 1 }),
  ]);
  assert.equal(new Set(snapshots).size, 1);
  assert.deepEqual(harness.reads, { items: 1, metadata: 1, dpi: 1, scale: 1 });

  const results = await Promise.all(snapshots.map((snapshot, index) => (
    harness.service.ensureBounds(snapshot, harness.setIds || snapshot.items, {
      consumer: ["spell-aura", "class-feature-aura", "custom-aura"][index],
    })
  )));
  assert.equal(results.every((result) => result.complete), true);
  assert.deepEqual(harness.calls, ["one", "two"]);
  assert.equal(harness.cache.getDiagnostics().sdkLoads, 2);

  const warm = await harness.service.getSnapshot({ sceneEpoch: 1 });
  await harness.service.ensureBounds(warm, warm.items, { consumer: "spell-aura" });
  assert.equal(harness.reads.items, 1);
  assert.equal(harness.reads.metadata, 1);
  assert.deepEqual(harness.calls, ["one", "two"]);
});

test("movement ricarica solo la geometria cambiata; metadata/grid riusano bounds", async () => {
  const harness = makeHarness();
  const first = await harness.service.getSnapshot({ sceneEpoch: 1 });
  await harness.service.ensureBounds(first, first.items, { consumer: "spell-aura" });

  harness.setSource({
    generation: 2,
    items: [item("one", 25), item("two", 200)],
  });
  harness.service.invalidate({ reason: "items" });
  const moved = await harness.service.getSnapshot({ sceneEpoch: 1 });
  await harness.service.ensureBounds(moved, moved.items, { consumer: "custom-aura" });
  assert.deepEqual(harness.calls, ["one", "two", "one"]);

  harness.setSource({ metadata: { revision: 2 } });
  harness.service.invalidate({ reason: "metadata" });
  const metadataSnapshot = await harness.service.getSnapshot({ sceneEpoch: 1 });
  await harness.service.ensureBounds(metadataSnapshot, metadataSnapshot.items, { consumer: "class-feature-aura" });
  harness.service.invalidate({ reason: "grid" });
  const gridSnapshot = await harness.service.getSnapshot({ sceneEpoch: 1 });
  await harness.service.ensureBounds(gridSnapshot, gridSnapshot.items, { consumer: "spell-aura" });
  assert.deepEqual(harness.calls, ["one", "two", "one"]);
  assert.equal(harness.reads.metadata, 4);
  assert.equal(harness.reads.dpi, 4);
  assert.equal(harness.reads.scale, 4);
});

test("zero aura non chiede bounds e scene switch non riusa ID della scena precedente", async () => {
  const harness = makeHarness();
  const first = await harness.service.getSnapshot({ sceneEpoch: 1 });
  const skipped = await harness.service.ensureBounds(first, [], { consumer: "custom-aura" });
  assert.equal(skipped.complete, true);
  assert.deepEqual(harness.calls, []);

  harness.setSource({
    epoch: 2,
    identity: "scene-b",
    generation: 1,
    items: [item("one", 900), item("two", 1100)],
  });
  harness.service.invalidateScene("scene-switch");
  const second = await harness.service.getSnapshot({ sceneEpoch: 2 });
  await harness.service.ensureBounds(second, second.items, { consumer: "spell-aura" });
  assert.deepEqual(harness.calls, ["one", "two"]);
  assert.equal(second.sceneIdentity, "scene-b");
  assert.equal(second.itemsById.get("one").position.x, 900);
});

test("incomplete e invalidation durante bounds load non producono risultato parziale", async () => {
  const harness = makeHarness();
  harness.setSource({ ready: false });
  harness.service.invalidateScene("unload");
  const incomplete = await harness.service.getSnapshot({ sceneEpoch: 1 });
  assert.equal(incomplete.complete, false);

  harness.setSource({ ready: true, generation: 2 });
  harness.service.invalidate({ reason: "scene-ready" });
  const recovered = await harness.service.getSnapshot({ sceneEpoch: 1 });
  assert.equal(recovered.complete, true);

  harness.blockNextBounds();
  const pending = harness.service.ensureBounds(recovered, recovered.items, { consumer: "spell-aura" });
  await Promise.resolve();
  harness.service.invalidate({ reason: "items" });
  harness.releaseBounds();
  const stale = await pending;
  assert.equal(stale.complete, false);
  assert.equal(stale.stale, true);
});

test("fake OBR rispetta il contratto SDK: getItemBounds restituisce un BoundingBox aggregato", async () => {
  const fixture = createPerformanceFixture({
    seed: "aggregate-bounds",
    config: { tokens: 2, zones: 0, effects: 2 },
  });
  const server = createPerformanceObr({
    scenes: fixture.scenes,
    initialSceneId: fixture.scenes[0].id,
  });
  const gm = server.createRealm({ id: "gm", role: "GM" });
  const result = await gm.scene.items.getItemBounds(fixture.tokenIds);
  assert.equal(Array.isArray(result), false);
  assert.equal(result.min.x < result.max.x, true);
  assert.equal(result.min.y < result.max.y, true);
  assert.equal(result.center.x, (result.min.x + result.max.x) / 2);
});

test("mount centralizzato invalida logical snapshot e pulisce geometria al cambio scena", async () => {
  const subscriptions = {};
  const harness = makeHarness({ subscriptions });
  harness.service.mount();
  const first = await harness.service.getSnapshot({ sceneEpoch: 1 });
  subscriptions.metadata?.();
  const metadataSnapshot = await harness.service.getSnapshot({ sceneEpoch: 1 });
  assert.notEqual(metadataSnapshot.key, first.key);
  subscriptions.grid?.();
  const gridSnapshot = await harness.service.getSnapshot({ sceneEpoch: 1 });
  assert.notEqual(gridSnapshot.key, metadataSnapshot.key);
  subscriptions.ready?.(false);
  assert.equal(harness.cache.getDiagnostics().cacheSize, 0);
  harness.service.unmount();
});
