import assert from "node:assert/strict";
import test from "node:test";
import { createSceneEpochController } from "../src/sceneEpoch.js";
import {
  createSceneLifecycleAdapter,
  runSceneLifecycleOperation,
} from "../src/sceneLifecycle.js";

function fakeObr({ ready = true } = {}) {
  let sceneReady = ready;
  const listeners = new Set();
  let listenerCount = 0;
  let unsubscribeCount = 0;
  return {
    scene: {
      isReady: async () => sceneReady,
      onReadyChange: (listener) => {
        listenerCount += 1;
        listeners.add(listener);
        return () => {
          unsubscribeCount += 1;
          listeners.delete(listener);
        };
      },
    },
    setReady(nextReady) {
      sceneReady = nextReady === true;
      for (const listener of [...listeners]) listener(sceneReady);
    },
    get listenerCount() {
      return listenerCount;
    },
    get unsubscribeCount() {
      return unsubscribeCount;
    },
  };
}

test("scene lifecycle monta una sola subscription e tratta false/true duplicati come idempotenti", async () => {
  const obr = fakeObr();
  const lifecycle = createSceneLifecycleAdapter({
    obr,
    epochController: createSceneEpochController(),
  });
  const states = [];
  lifecycle.subscribe((state) => states.push(state));

  await Promise.all([lifecycle.mount(), lifecycle.mount(), lifecycle.mount()]);
  assert.equal(obr.listenerCount, 1);
  assert.equal(lifecycle.isReady(), true);
  assert.equal(lifecycle.currentEpoch(), 0);

  obr.setReady(false);
  assert.equal(lifecycle.isReady(), false);
  assert.equal(lifecycle.currentEpoch(), 1);
  obr.setReady(false);
  assert.equal(lifecycle.currentEpoch(), 1);
  obr.setReady(true);
  assert.equal(lifecycle.isReady(), true);
  assert.equal(lifecycle.currentEpoch(), 1);
  obr.setReady(true);
  assert.equal(lifecycle.currentEpoch(), 1);
  assert.deepEqual(states.map((state) => state.phase), ["ready", "unavailable", "ready"]);

  lifecycle.dispose();
  assert.equal(obr.unsubscribeCount, 1);
  assert.equal(lifecycle.getSnapshot().disposed, true);
});

test("scene lifecycle parte unavailable e blocca il lavoro fino alla nuova baseline", async () => {
  const obr = fakeObr({ ready: false });
  const lifecycle = createSceneLifecycleAdapter({
    obr,
    epochController: createSceneEpochController(),
  });
  const writes = [];

  await lifecycle.mount();
  assert.equal(lifecycle.isReady(), false);
  assert.equal(lifecycle.getSnapshot().phase, "unavailable");
  const rejected = await runSceneLifecycleOperation(lifecycle, async () => {
    writes.push("unexpected-write");
  }, { operationId: "quick-hp-bootstrap-unavailable" });
  assert.equal(rejected.status, "rejected");
  assert.equal(rejected.stale, true);
  assert.deepEqual(writes, []);

  obr.setReady(true);
  assert.equal(lifecycle.isReady(), true);
  assert.equal(lifecycle.getSnapshot().phase, "ready");
  assert.equal(lifecycle.currentEpoch(), 1);
});

test("scene lifecycle esegue cleanup di scena e invalida un contesto catturato", async () => {
  const obr = fakeObr();
  const epochController = createSceneEpochController();
  const lifecycle = createSceneLifecycleAdapter({ obr, epochController });
  let sceneCleanupCount = 0;
  lifecycle.registerSceneCleanup(() => { sceneCleanupCount += 1; });
  await lifecycle.mount();
  const context = lifecycle.capture({ operationId: "quick-hp-test" });
  assert.equal(lifecycle.isCurrent(context), true);

  obr.setReady(false);
  assert.equal(sceneCleanupCount, 1);
  assert.equal(lifecycle.isCurrent(context), false);
  assert.equal(epochController.isReady(), false);
  obr.setReady(true);
  assert.equal(sceneCleanupCount, 1);
  assert.equal(lifecycle.isCurrent(lifecycle.capture()), true);
});

test("dispose cancella cleanup locali e consente una riapertura senza listener accumulati", async () => {
  const obr = fakeObr();
  const first = createSceneLifecycleAdapter({ obr });
  let sceneCleanupCount = 0;
  let disposeCleanupCount = 0;
  first.registerSceneCleanup(() => { sceneCleanupCount += 1; });
  first.registerCleanup(() => { disposeCleanupCount += 1; });
  await first.mount();
  first.dispose();
  assert.equal(obr.unsubscribeCount, 1);
  assert.equal(disposeCleanupCount, 1);

  const second = createSceneLifecycleAdapter({ obr });
  await second.mount();
  assert.equal(obr.listenerCount, 2);
  obr.setReady(false);
  assert.equal(sceneCleanupCount, 1);
  assert.equal(second.isReady(), false);
  second.dispose();
  assert.equal(obr.unsubscribeCount, 2);
});

test("lifecycle distingue stale pre-commit e stale post-commit", async () => {
  const obr = fakeObr();
  const lifecycle = createSceneLifecycleAdapter({
    obr,
    epochController: createSceneEpochController(),
  });
  await lifecycle.mount();

  let releasePreCommit;
  const preCommitGate = new Promise((resolve) => { releasePreCommit = resolve; });
  const preCommit = runSceneLifecycleOperation(lifecycle, async () => {
    await preCommitGate;
    return "not-written";
  }, { operationId: "pre-commit" });
  obr.setReady(false);
  releasePreCommit();
  const preCommitResult = await preCommit;
  assert.equal(preCommitResult.status, "rejected");
  assert.equal(preCommitResult.stale, true);
  assert.equal(preCommitResult.committed, false);
  assert.equal(preCommitResult.operationId, "pre-commit");
  assert.equal(preCommitResult.reason, "scene-stale-before-commit");

  obr.setReady(true);
  let releasePostCommit;
  const postCommitGate = new Promise((resolve) => { releasePostCommit = resolve; });
  const postCommit = runSceneLifecycleOperation(lifecycle, async ({ markCommitted }) => {
    markCommitted();
    await postCommitGate;
    return "written";
  }, { operationId: "post-commit" });
  obr.setReady(false);
  releasePostCommit();
  const result = await postCommit;
  assert.equal(result.status, "applied");
  assert.equal(result.stale, true);
  assert.equal(result.committed, true);
  assert.equal(result.postCommitPending, true);
  assert.equal(result.reason, "scene-stale-post-commit");
});
