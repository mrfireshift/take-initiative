import test, { mock } from "node:test";
import assert from "node:assert/strict";

const STATE_KEY = "com.test.initiative/state";
const EFFECT_CHANNEL = "com.test.initiative/effect-save-reminder";
const RUNTIME_CHANNEL = "com.test.initiative/runtime-cache";

const runtime = {
  epoch: 1,
  sceneReady: true,
};

let sceneMetadata = {};
let sceneItems = [];
let itemGeneration = 0;
let deliveryImpl = async () => ({ gm: 1, player: 0 });
let deliveryCalls = [];
let plannerCalls = [];
let plannedActivationIds = null;
const metadataListeners = new Set();
const itemListeners = new Set();
const readyListeners = new Set();
const broadcastListeners = new Map();
const epochListeners = new Set();

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function state(round) {
  return {
    order: ["actor"],
    current: 0,
    round,
  };
}

function resetRuntime() {
  runtime.epoch = 1;
  runtime.sceneReady = true;
  sceneMetadata = { [STATE_KEY]: state(1) };
  sceneItems = [];
  itemGeneration = 0;
  deliveryImpl = async () => ({ gm: 1, player: 0 });
  deliveryCalls = [];
  plannerCalls = [];
  plannedActivationIds = null;
  broadcastListeners.clear();
}

function emitMetadata(round) {
  sceneMetadata = { [STATE_KEY]: state(round) };
  for (const listener of metadataListeners) listener(clone(sceneMetadata));
}

function emitItems() {
  itemGeneration += 1;
  for (const listener of itemListeners) {
    listener({ allItems: clone(sceneItems), generation: itemGeneration });
  }
}

function emitReady(ready) {
  runtime.sceneReady = ready;
  for (const listener of readyListeners) listener(ready);
}

function emitRuntimeCacheReset() {
  for (const listener of broadcastListeners.get(RUNTIME_CHANNEL) || []) {
    listener({ data: { type: "clear-runtime-caches" } });
  }
}

function changeSceneEpoch() {
  runtime.epoch += 1;
  runtime.sceneReady = false;
  for (const listener of epochListeners) {
    listener({ phase: "unload", epoch: runtime.epoch });
  }
  emitReady(false);
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function flush() {
  for (let index = 0; index < 8; index += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

async function waitFor(predicate, message = "condition not reached") {
  for (let index = 0; index < 80; index += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.fail(message);
}

mock.module("@owlbear-rodeo/sdk", {
  exports: {
    default: {
      player: { getRole: async () => "GM" },
      scene: {
        isReady: async () => runtime.sceneReady,
        getMetadata: async () => clone(sceneMetadata),
        onMetadataChange(listener) {
          metadataListeners.add(listener);
          return () => metadataListeners.delete(listener);
        },
        onReadyChange(listener) {
          readyListeners.add(listener);
          return () => readyListeners.delete(listener);
        },
        items: {
          getItems: async () => clone(sceneItems),
          onChange: () => () => {},
        },
      },
      broadcast: {
        onMessage(channel, listener) {
          const listeners = broadcastListeners.get(channel) || new Set();
          listeners.add(listener);
          broadcastListeners.set(channel, listeners);
          return () => listeners.delete(listener);
        },
        sendMessage: async () => {},
      },
    },
  },
});

mock.module("../src/constants.js", {
  exports: {
    EFFECT_SAVE_REMINDER_NOTICE_CHANNEL: EFFECT_CHANNEL,
    ID: "com.test.initiative",
    RUNTIME_CACHE_CLEANUP_CHANNEL: RUNTIME_CHANNEL,
  },
});

mock.module("../src/effectSaveReminderCore.js", {
  exports: {
    planEffectSaveReminderNotices({ previousInitiativeState, initiativeState }) {
      plannerCalls.push({
        previous: clone(previousInitiativeState),
        current: clone(initiativeState),
      });
      if (Array.isArray(plannedActivationIds)) {
        return plannedActivationIds.map((activationId) => ({ activationId }));
      }
      if (
        initiativeState?.round === 3
        && previousInitiativeState?.round !== 3
      ) {
        return [{ activationId: "activation-1" }];
      }
      return [];
    },
  },
});

mock.module("../src/sceneEpoch.js", {
  exports: {
    currentSceneEpoch: () => runtime.epoch,
    isCurrentSceneEpoch: (candidate) => (
      runtime.sceneReady && Number(candidate) === runtime.epoch
    ),
    subscribeSceneEpoch(listener) {
      epochListeners.add(listener);
      return () => epochListeners.delete(listener);
    },
  },
});

mock.module("../src/sceneItemEvents.js", {
  exports: {
    readSceneItemsSnapshot: () => ({
      complete: true,
      generation: itemGeneration,
      items: clone(sceneItems),
    }),
    subscribeSceneItemChanges(listener) {
      itemListeners.add(listener);
      return () => itemListeners.delete(listener);
    },
  },
});

mock.module("../src/sceneMetadataDigest.js", {
  exports: {
    createSceneMetadataKeyWatcher() {
      let initialized = false;
      let digest = null;
      const readDigest = (metadata) => JSON.stringify(metadata?.[STATE_KEY] ?? null);
      const update = (metadata) => {
        const next = readDigest(metadata);
        const changed = !initialized || next !== digest;
        initialized = true;
        digest = next;
        return { changed, digest };
      };
      return {
        get initialized() {
          return initialized;
        },
        get digest() {
          return digest;
        },
        observe: update,
        seed(metadata) {
          const result = update(metadata);
          return { ...result, changed: false };
        },
        reset() {
          initialized = false;
          digest = null;
        },
      };
    },
  },
});

mock.module("../src/options/reminderProjectionBroadcast.js", {
  exports: {
    sendProjectedReminderPayload(channel, payload) {
      deliveryCalls.push({ channel, payload: clone(payload) });
      return deliveryImpl(channel, payload);
    },
  },
});

const {
  mountEffectSaveReminderController,
  unmountEffectSaveReminderController,
} = await import("../src/effectSaveReminderController.js");

test.beforeEach(async () => {
  unmountEffectSaveReminderController();
  resetRuntime();
  await mountEffectSaveReminderController();
  await flush();
});

test.afterEach(() => {
  unmountEffectSaveReminderController();
});

test("delivery riuscito committa l'ID e non duplica il reconcile accodato", async () => {
  const gate = deferred();
  deliveryImpl = () => gate.promise;

  emitMetadata(3);
  await waitFor(() => deliveryCalls.length === 1);
  emitItems();
  gate.resolve({ gm: 1, player: 0 });
  await flush();

  assert.equal(deliveryCalls.length, 1);
  assert.ok(
    plannerCalls.some((call) => call.current?.round === 3 && call.previous?.round === 1),
  );
  assert.ok(
    plannerCalls.some((call) => call.current?.round === 3 && call.previous?.round === 3),
  );
});

test("Promise rejection lascia la transizione ritentabile", async () => {
  const gate = deferred();
  deliveryImpl = (channel, payload) => (
    deliveryCalls.length === 1
      ? gate.promise
      : Promise.resolve({ gm: 1, player: 0 })
  );

  emitMetadata(3);
  await waitFor(() => deliveryCalls.length === 1);
  emitItems();
  gate.reject(new Error("remote delivery failed"));
  await waitFor(() => deliveryCalls.length === 2);

  assert.equal(deliveryCalls[1].payload.notices[0].activationId, "activation-1");
  assert.ok(
    plannerCalls.some((call) => call.current?.round === 3 && call.previous?.round === 1),
  );
});

test("{ gm: 0, player: 0 } non committa e consente un retry", async () => {
  deliveryImpl = () => Promise.resolve(
    deliveryCalls.length === 1
      ? { gm: 0, player: 0 }
      : { gm: 1, player: 0 },
  );

  emitMetadata(3);
  await waitFor(() => deliveryCalls.length === 1);
  emitItems();
  await waitFor(() => deliveryCalls.length === 2);

  assert.equal(deliveryCalls[1].payload.notices[0].activationId, "activation-1");
  assert.ok(
    plannerCalls.some((call) => call.current?.round === 3 && call.previous?.round === 1),
  );
});

test("GM riuscito con player non destinatario è un successo", async () => {
  deliveryImpl = () => Promise.resolve({ gm: 1, player: 0 });

  emitMetadata(3);
  await waitFor(() => deliveryCalls.length === 1);
  emitItems();
  await flush();

  assert.equal(deliveryCalls.length, 1);
});

test("reset runtime durante il delivery invalida il completamento precedente", async () => {
  const gate = deferred();
  deliveryImpl = () => (
    deliveryCalls.length === 1
      ? gate.promise
      : Promise.resolve({ gm: 1, player: 0 })
  );

  emitMetadata(3);
  await waitFor(() => deliveryCalls.length === 1);
  emitRuntimeCacheReset();
  gate.resolve({ gm: 1, player: 0 });
  await waitFor(() => deliveryCalls.length === 2);

  assert.equal(deliveryCalls[1].payload.notices[0].activationId, "activation-1");
  assert.ok(
    plannerCalls.some((call) => call.current?.round === 3 && call.previous === null),
  );
});

test("unmount durante il delivery ignora il completamento e consente il nuovo ciclo", async () => {
  const gate = deferred();
  deliveryImpl = () => (
    deliveryCalls.length === 1
      ? gate.promise
      : Promise.resolve({ gm: 1, player: 0 })
  );

  emitMetadata(3);
  await waitFor(() => deliveryCalls.length === 1);
  unmountEffectSaveReminderController();
  gate.resolve({ gm: 1, player: 0 });
  await flush();

  await mountEffectSaveReminderController();
  await waitFor(() => deliveryCalls.length === 2);
  assert.equal(deliveryCalls[1].payload.notices[0].activationId, "activation-1");
});

test("cambio scena/epoch durante il delivery ignora il completamento", async () => {
  const gate = deferred();
  deliveryImpl = () => (
    deliveryCalls.length === 1
      ? gate.promise
      : Promise.resolve({ gm: 1, player: 0 })
  );

  emitMetadata(3);
  await waitFor(() => deliveryCalls.length === 1);
  changeSceneEpoch();
  gate.resolve({ gm: 1, player: 0 });
  await flush();

  emitReady(true);
  await waitFor(() => deliveryCalls.length === 2);
  assert.equal(deliveryCalls[1].payload.notices[0].activationId, "activation-1");
});

test("un reconcile senza reminder avanza previousInitiativeState", async () => {
  emitMetadata(2);
  await flush();
  emitMetadata(3);
  await waitFor(() => deliveryCalls.length === 1);

  const noticePlan = plannerCalls.find((call) => call.current?.round === 3);
  assert.equal(noticePlan?.previous?.round, 2);
});

test("il pruning canonico riattiva solo l'ID tornato corrente e conserva il dedup normale", async () => {
  plannedActivationIds = ["activation-a", "activation-b"];
  emitItems();
  await waitFor(() => deliveryCalls.length === 1);
  assert.deepEqual(
    deliveryCalls[0].payload.notices.map((notice) => notice.activationId),
    ["activation-a", "activation-b"],
  );
  assert.equal(deliveryCalls[0].payload.rearmActivationIds, undefined);

  plannedActivationIds = ["activation-b"];
  emitItems();
  await flush();
  assert.equal(deliveryCalls.length, 1);

  plannedActivationIds = ["activation-a", "activation-b"];
  emitItems();
  await waitFor(() => deliveryCalls.length === 2);
  assert.deepEqual(
    deliveryCalls[1].payload.notices.map((notice) => notice.activationId),
    ["activation-a"],
  );
  assert.deepEqual(deliveryCalls[1].payload.rearmActivationIds, ["activation-a"]);

  emitItems();
  await flush();
  assert.equal(deliveryCalls.length, 2);
});

test("lo stesso activationId può completare due cicli resolve/Undo senza riannunciare gli altri", async () => {
  plannedActivationIds = ["activation-a", "activation-b"];
  emitItems();
  await waitFor(() => deliveryCalls.length === 1);

  plannedActivationIds = [];
  const prunePlannerCallCount = plannerCalls.length;
  emitItems();
  await waitFor(() => plannerCalls.length > prunePlannerCallCount);

  plannedActivationIds = ["activation-a"];
  emitItems();
  await waitFor(() => deliveryCalls.length === 2);
  assert.deepEqual(deliveryCalls[1].payload.notices.map((notice) => notice.activationId), ["activation-a"]);
  assert.deepEqual(deliveryCalls[1].payload.rearmActivationIds, ["activation-a"]);

  plannedActivationIds = [];
  emitItems();
  await flush();

  plannedActivationIds = ["activation-a"];
  emitItems();
  await waitFor(() => deliveryCalls.length === 3);
  assert.deepEqual(deliveryCalls[2].payload.notices.map((notice) => notice.activationId), ["activation-a"]);
  assert.deepEqual(deliveryCalls[2].payload.rearmActivationIds, ["activation-a"]);
});
