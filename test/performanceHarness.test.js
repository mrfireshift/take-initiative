import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { mock } from "node:test";
import { ID } from "../src/constants.js";
import {
  DeterministicClock,
  createPerformanceMetrics,
  percentile,
  summarizeDurations,
} from "../test-support/performanceMetrics.js";
import {
  countPerformanceFixture,
  createPerformanceFixture,
  PERFORMANCE_META_KEY,
} from "../test-support/performanceFixture.js";
import { createPerformanceObr } from "../test-support/performanceObr.js";

const sdkStub = {
  onReady: () => {},
  room: { getMetadata: async () => ({}) },
  scene: {
    isReady: async () => true,
    onReadyChange: () => () => {},
    items: { getItems: async () => [], onChange: () => () => {}, updateItems: async () => {} },
  },
  player: { getRole: async () => "GM" },
};
mock.module("@owlbear-rodeo/sdk", { exports: { default: sdkStub } });

const { runPerformanceHarness } = await import("../test-support/performanceHarness.js");

test("performance metrics count, attribution, reset e percentili", () => {
  assert.equal(percentile([4, 1, 3, 2], 50), 2);
  assert.deepEqual(summarizeDurations([1, 2, 3, 4]), {
    count: 4,
    totalMs: 10,
    p50Ms: 2,
    p95Ms: 4,
    maxMs: 4,
  });
  const clock = new DeterministicClock();
  const metrics = createPerformanceMetrics({ enabled: true, clock });
  metrics.beginPhase("cold");
  metrics.withContext({ realm: "tracker-gm", controller: "render" }, () => {
    metrics.recordSdk("scene.items.getItems", { full: true, durationMs: 2 });
  });
  metrics.finishPhase("cold");
  metrics.beginPhase("warm");
  metrics.recordSdk("scene.items.getItems", { idScoped: true, requestedIds: 2, durationMs: 1 });
  metrics.finishPhase("warm");
  const snapshot = metrics.snapshot();
  assert.equal(snapshot.phases[0].sdk.methods["scene.items.getItems"].count, 1);
  assert.equal(snapshot.phases[0].sdk.methods["scene.items.getItems"].byRealm["tracker-gm:render"].count, 1);
  assert.equal(snapshot.phases[1].sdk.methods["scene.items.getItems"].idScopedCalls, 1);
  assert.equal(snapshot.phases.length, 2);
});

test("fake OBR applica updateItems, full snapshot, metadata merge, broadcast e timer", async () => {
  const clock = new DeterministicClock();
  const fixture = createPerformanceFixture({
    seed: "fake-obr",
    config: { tokens: 2, zones: 1, effects: 2 },
  });
  const server = createPerformanceObr({
    scenes: fixture.scenes,
    initialSceneId: fixture.scenes[0].id,
    clock,
    deliveryPolicy: { duplicateEvery: 1, delayMs: 5 },
  });
  const gm = server.createRealm({ id: "gm", role: "GM" });
  const player = server.createRealm({ id: "player", role: "PLAYER" });
  const snapshots = [];
  gm.scene.items.onChange((items, context) => snapshots.push({ items, context }));
  server.emitCurrentSnapshot();
  await server.flushEvents();
  await gm.scene.items.updateItems([fixture.tokenIds[0]], (drafts) => {
    drafts[0].position.x += 3;
  });
  await server.flushEvents();
  assert.ok(snapshots.length >= 2);
  assert.equal(snapshots.at(-1).items.length, 3);
  assert.equal(snapshots.at(-1).items.find((item) => item.id === fixture.tokenIds[0]).position.x,
    fixture.scenes[0].items.find((item) => item.id === fixture.tokenIds[0]).position.x + 3);
  await gm.scene.setMetadata({ unrelated: { keep: true }, [`${ID}/state`]: { current: 1 } });
  await gm.scene.setMetadata({ [`${ID}/state`]: { current: 2 } });
  const sceneMetadata = await gm.scene.getMetadata();
  assert.deepEqual(sceneMetadata.unrelated, { keep: true });
  assert.deepEqual(sceneMetadata[`${ID}/state`], { current: 2 });
  await gm.room.setMetadata({ unrelatedRoom: { keep: true }, [`${ID}/actorVitals`]: { version: 1 } });
  await gm.room.setMetadata({ [`${ID}/actorVitals`]: { version: 2 } });
  const roomMetadata = await gm.room.getMetadata();
  assert.deepEqual(roomMetadata.unrelatedRoom, { keep: true });
  assert.deepEqual(roomMetadata[`${ID}/actorVitals`], { version: 2 });
  let received = null;
  player.broadcast.onMessage("perf-test", (event) => { received = event; });
  await gm.broadcast.sendMessage("perf-test", { value: 7 }, { destination: "PLAYER" });
  await server.flushEvents();
  assert.equal(received.data.value, 7);
  await player.scene.setMetadata({ [`${ID}/state`]: { current: 3 } });
  assert.equal(server.getDiagnostics().playerWriteViolations.length, 1);
  await player.scene.items.updateItems([fixture.tokenIds[0]], (drafts) => {
    drafts[0].position.x += 1;
  });
  assert.equal(server.getDiagnostics().playerWriteViolations.length, 2);
  let fired = false;
  clock.setTimeout(() => { fired = true; }, 10);
  clock.tick(9);
  await clock.flush();
  assert.equal(fired, false);
  clock.tick(1);
  await clock.flush();
  assert.equal(fired, true);
});

test("fake OBR separa scene A/B con stesso item ID e blocca la write stale", async () => {
  const clock = new DeterministicClock();
  const fixture = createPerformanceFixture({
    seed: "scene-switch",
    config: { tokens: 2, zones: 1, effects: 2 },
  });
  const server = createPerformanceObr({
    scenes: fixture.scenes,
    initialSceneId: fixture.scenes[0].id,
    clock,
  });
  const gm = server.createRealm({ id: "gm", role: "GM" });
  const gate = server.holdNext("scene.items.updateItems");
  const pending = gm.scene.items.updateItems([fixture.tokenIds[0]], (drafts) => {
    drafts[0].position.x = 999;
  });
  for (let index = 0; index < 10; index += 1) await Promise.resolve();
  server.switchScene(fixture.scenes[1].id);
  gate.release();
  await pending;
  const itemB = server.getSceneSnapshot(fixture.scenes[1].id).items
    .find((item) => item.id === fixture.tokenIds[0]);
  assert.notEqual(itemB.position.x, 999);
  assert.equal(server.getDiagnostics().crossSceneWrites.length, 1);
  assert.equal(server.getDiagnostics().crossSceneWrites[0].blocked, true);
});

test("fixture default ha 40 token, 10 zone/aura e 100 projection", () => {
  const fixture = createPerformanceFixture({ seed: "fixture-counts" });
  assert.deepEqual(countPerformanceFixture(fixture), {
    tokens: 40,
    zones: 10,
    effects: 100,
  });
  assert.equal(fixture.scenes[0].items
    .filter((item) => item.layer === "CHARACTER")
    .every((item) => item.metadata?.[PERFORMANCE_META_KEY]?.hpMax > 0), true);
  assert.equal(fixture.productiveFixtureInputs.classFeatureAvailable, true);
});

test("smoke harness produce schema, correctness e moduli produttivi", { timeout: 30000 }, async () => {
  const report = await runPerformanceHarness({ seed: "smoke-test", smoke: true });
  assert.equal(report.schemaVersion, "take-initiative-performance-v1");
  assert.equal(report.scenario.tokens, 4);
  assert.equal(report.scenario.zones, 2);
  assert.equal(report.scenario.effects, 4);
  assert.equal(report.correctness.ok, true);
  assert.ok(report.productiveModules.includes("src/actorVitalsStore.js"));
  assert.ok(report.productiveModules.includes("src/initiativeStateGatewayCore.js"));
  assert.ok(report.productiveModules.includes("src/sceneItemReconcileCore.js"));
  assert.ok(report.profiles.some((profile) => profile.name === "cold-cache"));
  assert.ok(report.profiles.some((profile) => profile.name === "warm-cache"));
  assert.equal(report.spatialTopology.assertions.sharedColdBoundsCalls, true);
  assert.equal(report.spatialTopology.assertions.sharedWarmNoBounds, true);
  assert.equal(report.spatialTopology.assertions.sharedMovementOneBounds, true);
  assert.equal(report.spatialTopology.assertions.sharedZeroAuraNoBounds, true);
  assert.equal(report.spatialTopology.incomplete.recoverySecondComplete, true);
  assert.equal(report.driver.listenerLifecycleClean, true);
});

test("comando perf:harness completo è eseguibile", { timeout: 30000 }, () => {
  const isWindows = process.platform === "win32";
  const output = execFileSync(
    isWindows ? (process.env.ComSpec || "cmd.exe") : "/bin/sh",
    isWindows
      ? ["/d", "/s", "/c", "npm.cmd run perf:harness -- --json"]
      : ["-c", "npm run perf:harness -- --json"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  assert.match(output, /take-initiative-performance-v1/);
  assert.match(output, /\"tokens\": 40/);
  assert.match(output, /\"correctness\"/);
});
