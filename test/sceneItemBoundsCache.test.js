import test from "node:test";
import assert from "node:assert/strict";

import { createSceneItemBoundsCache } from "../src/sceneItemBoundsCache.js";

const item = (id, x = 0) => ({
  id,
  type: "IMAGE",
  layer: "CHARACTER",
  position: { x, y: 0 },
  scale: { x: 1, y: 1 },
  image: { width: 150, height: 150, url: `${id}.png` },
  grid: { dpi: 150, offset: { x: 75, y: 75 } },
});

const bounds = (x) => ({
  min: { x, y: 0 },
  max: { x: x + 150, y: 150 },
  width: 150,
  height: 150,
  center: { x: x + 75, y: 75 },
});

test("carica i bounds in serie e riusa la cache per geometrie immutate", async () => {
  let active = 0;
  let maximumActive = 0;
  const calls = [];
  const cache = createSceneItemBoundsCache(async (itemId) => {
    calls.push(itemId);
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await new Promise((resolve) => setTimeout(resolve, 2));
    active -= 1;
    return bounds(itemId === "first" ? 0 : 200);
  }, { timeoutMs: 100 });

  const first = await cache.load([item("first"), item("second", 200)]);
  const second = await cache.load([item("first"), item("second", 200)]);

  assert.equal(first.complete, true);
  assert.equal(second.complete, true);
  assert.equal(maximumActive, 1);
  assert.deepEqual(calls, ["first", "second"]);
});

test("una richiesta pendente non blocca il controller né produce membership parziale", async () => {
  let secondAttempt = 0;
  const calls = [];
  const cache = createSceneItemBoundsCache((itemId) => {
    calls.push(itemId);
    if (itemId === "first") return Promise.resolve(bounds(0));
    secondAttempt += 1;
    if (secondAttempt === 1) return new Promise(() => {});
    return Promise.resolve(bounds(200));
  }, { timeoutMs: 5 });

  const incomplete = await cache.load([
    item("first"),
    item("second", 200),
  ]);
  const recovered = await cache.load([
    item("first"),
    item("second", 200),
  ]);

  assert.equal(incomplete.complete, false);
  assert.deepEqual(incomplete.missingIds, ["second"]);
  assert.equal(recovered.complete, true);
  assert.deepEqual(calls, ["first", "second", "second"]);
  assert.equal(recovered.boundsById.get("second").min.x, 200);
});

test("un bounds in cache non rende completa una scansione fallita dopo il movimento", async () => {
  let failMovedItem = false;
  const cache = createSceneItemBoundsCache((itemId) => {
    if (failMovedItem) return Promise.reject(new Error("sdk unavailable"));
    return Promise.resolve(bounds(itemId === "target" ? 0 : 200));
  }, { timeoutMs: 20 });

  assert.equal((await cache.load([item("target")])).complete, true);
  failMovedItem = true;
  const moved = await cache.load([item("target", 100)]);

  assert.equal(moved.complete, false);
  assert.deepEqual(moved.missingIds, ["target"]);
  assert.equal(moved.boundsById.get("target").min.x, 0);
});

test("due richieste concorrenti della stessa geometria condividono il load SDK", async () => {
  let calls = 0;
  let resolveBounds;
  const cache = createSceneItemBoundsCache(() => {
    calls += 1;
    return new Promise((resolve) => { resolveBounds = resolve; });
  }, { timeoutMs: 100 });

  const first = cache.load([item("target")]);
  const second = cache.load([item("target")]);
  await Promise.resolve();
  resolveBounds(bounds(0));

  assert.equal((await first).complete, true);
  assert.equal((await second).complete, true);
  assert.equal(calls, 1);
});

test("un risultato precedente non sovrascrive la cache dopo invalidate", async () => {
  const resolvers = [];
  const cache = createSceneItemBoundsCache(() => new Promise((resolve) => {
    resolvers.push(resolve);
  }), { timeoutMs: 100 });

  const stale = cache.load([item("target")]);
  await Promise.resolve();
  cache.invalidate("target");
  const current = cache.load([item("target", 200)]);
  await Promise.resolve();
  resolvers[1](bounds(200));
  assert.equal((await current).boundsById.get("target").min.x, 200);
  resolvers[0](bounds(0));
  await stale;

  const cached = await cache.load([item("target", 200)]);
  assert.equal(cached.boundsById.get("target").min.x, 200);
  assert.equal(resolvers.length, 2);
});
