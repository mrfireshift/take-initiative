import assert from "node:assert/strict";
import test, { mock } from "node:test";
import {
  currentSceneEpoch,
  invalidateSceneEpoch,
  markSceneEpochReady,
} from "../src/sceneEpoch.js";

function deferred() {
  let resolve;
  const promise = new Promise((nextResolve) => { resolve = nextResolve; });
  return { promise, resolve };
}

const HISTORY_KEY = "com.thebigpicture.initiative/history";
const HISTORY_OWNER_RESULT_CHANNEL = "com.thebigpicture.initiative/history-owner-result";
const listeners = new Set();
const broadcastListeners = new Map();
const sceneState = {
  ready: true,
  metadata: { [HISTORY_KEY]: { version: 1, entries: [] } },
};
let pendingInitialRead = null;
let usePendingInitialRead = false;
let readinessSubscription = null;

const clone = (value) => structuredClone(value);

function emitReady(value) {
  sceneState.ready = value === true;
  for (const listener of [...listeners]) listener(sceneState.ready);
}

function waitForReadinessSubscription() {
  readinessSubscription = deferred();
  return readinessSubscription.promise;
}

const sdkStub = {
  player: { getRole: async () => "GM" },
  room: { id: "history-owner-lifecycle-room" },
  broadcast: {
    onMessage(channel, listener) {
      const channelListeners = broadcastListeners.get(channel) || new Set();
      channelListeners.add(listener);
      broadcastListeners.set(channel, channelListeners);
      return () => channelListeners.delete(listener);
    },
    async sendMessage(channel, data) {
      for (const listener of [...(broadcastListeners.get(channel) || [])]) {
        listener({ data: clone(data) });
      }
    },
  },
  scene: {
    isReady: async () => {
      if (usePendingInitialRead) return pendingInitialRead.promise;
      return sceneState.ready;
    },
    onReadyChange(listener) {
      listeners.add(listener);
      readinessSubscription?.resolve();
      readinessSubscription = null;
      return () => listeners.delete(listener);
    },
    getMetadata: async () => clone(sceneState.metadata),
    setMetadata: async (update) => {
      sceneState.metadata = { ...sceneState.metadata, ...clone(update) };
    },
  },
};

mock.module("@owlbear-rodeo/sdk", { exports: { default: sdkStub } });

const {
  getHistoryOwnerState,
  mountHistoryOwner,
  requestHistoryOwnerAppend,
  unmountHistoryOwner,
} = await import("../src/historyOwner.js");

function prepareInitialRead() {
  pendingInitialRead = deferred();
  usePendingInitialRead = true;
  sceneState.metadata = { [HISTORY_KEY]: { version: 1, entries: [] } };
}

async function mountReadyOwner() {
  usePendingInitialRead = false;
  sceneState.ready = true;
  assert.equal(await mountHistoryOwner(), true);
  return getHistoryOwnerState().scene;
}

function entry(id) {
  return {
    id,
    version: 1,
    at: 1,
    kind: "change",
    label: id,
    changes: [{ id: `token-${id}`, before: {}, after: {} }],
  };
}

test.afterEach(() => {
  unmountHistoryOwner();
  usePendingInitialRead = false;
  pendingInitialRead = null;
  sceneState.ready = true;
  sceneState.metadata = { [HISTORY_KEY]: { version: 1, entries: [] } };
  markSceneEpochReady("history-owner-test-reset");
});

test("History Owner applica latest-event-wins quando true arriva durante isReady pendente", async () => {
  prepareInitialRead();
  const attached = waitForReadinessSubscription();
  const mounting = mountHistoryOwner();
  await attached.promise;

  emitReady(true);
  pendingInitialRead.resolve(false);

  assert.equal(await mounting, true);
  const state = getHistoryOwnerState().scene;
  assert.equal(state.ready, true);
  assert.equal(state.generation, 1);
  assert.ok(state.identity);
});

test("History Owner mantiene false quando false arriva durante isReady e la risposta true è obsoleta", async () => {
  prepareInitialRead();
  const attached = waitForReadinessSubscription();
  const mounting = mountHistoryOwner();
  await attached.promise;

  emitReady(false);
  pendingInitialRead.resolve(true);

  assert.equal(await mounting, true);
  assert.deepEqual(getHistoryOwnerState().scene, {
    ready: false,
    identity: null,
    epoch: null,
    generation: 0,
  });
});

test("true/false duplicati sono idempotenti e true dopo unavailable ruota identity una sola volta", async () => {
  const first = await mountReadyOwner();
  emitReady(true);
  emitReady(true);
  assert.deepEqual(getHistoryOwnerState().scene, first);

  emitReady(false);
  const unavailable = getHistoryOwnerState().scene;
  emitReady(false);
  assert.deepEqual(getHistoryOwnerState().scene, unavailable);

  emitReady(true);
  const recovered = getHistoryOwnerState().scene;
  emitReady(true);
  assert.equal(recovered.generation, first.generation + 2);
  assert.notEqual(recovered.identity, first.identity);
  assert.deepEqual(getHistoryOwnerState().scene, recovered);
});

test("un comando in volo sopravvive a un ready duplicato senza cambiare generation", async () => {
  const first = await mountReadyOwner();
  const readStarted = deferred();
  const releaseRead = deferred();
  const originalGetMetadata = sdkStub.scene.getMetadata;
  let firstHistoryRead = true;
  sdkStub.scene.getMetadata = async () => {
    if (firstHistoryRead) {
      firstHistoryRead = false;
      readStarted.resolve();
      await releaseRead.promise;
    }
    return originalGetMetadata();
  };

  const command = requestHistoryOwnerAppend(entry("duplicate-ready"), {
    sceneEpoch: currentSceneEpoch(),
    sceneIdentity: first.identity,
    commandId: "history-owner-duplicate-ready",
  });
  await readStarted.promise;
  emitReady(true);
  assert.deepEqual(getHistoryOwnerState().scene, first);
  releaseRead.resolve();

  const result = await command;
  assert.equal(result.status, "appended");
  sdkStub.scene.getMetadata = originalGetMetadata;
});

test("un comando in volo durante il cambio di epoch viene rifiutato senza attendere il timeout", async () => {
  const first = await mountReadyOwner();
  const readStarted = deferred();
  const releaseRead = deferred();
  const originalGetMetadata = sdkStub.scene.getMetadata;
  let firstHistoryRead = true;
  sdkStub.scene.getMetadata = async () => {
    if (firstHistoryRead) {
      firstHistoryRead = false;
      readStarted.resolve();
      await releaseRead.promise;
    }
    return originalGetMetadata();
  };

  const command = requestHistoryOwnerAppend(entry("epoch-change"), {
    sceneEpoch: currentSceneEpoch(),
    sceneIdentity: first.identity,
    commandId: "history-owner-epoch-change",
  });
  await readStarted.promise;

  invalidateSceneEpoch("history-owner-test-change");
  markSceneEpochReady("history-owner-test-ready");
  await assert.rejects(command, (error) => error.code === "stale-scene");
  releaseRead.resolve();

  const recovered = getHistoryOwnerState().scene;
  assert.equal(recovered.ready, true);
  assert.notEqual(recovered.identity, first.identity);
  sdkStub.scene.getMetadata = originalGetMetadata;
});

test("una risposta con scene identity obsoleta viene rifiutata subito e non scade in timeout", async () => {
  const first = await mountReadyOwner();
  const originalSendMessage = sdkStub.broadcast.sendMessage;
  sdkStub.broadcast.sendMessage = async (channel, data, options) => {
    if (channel === HISTORY_OWNER_RESULT_CHANNEL
      && data?.result?.commandId === "history-owner-stale-response") {
      const stale = clone(data);
      stale.result.sceneIdentity = "history-owner-new-identity";
      return originalSendMessage(channel, stale, options);
    }
    return originalSendMessage(channel, data, options);
  };

  try {
    await assert.rejects(
      requestHistoryOwnerAppend(entry("stale-response"), {
        sceneEpoch: currentSceneEpoch(),
        sceneIdentity: first.identity,
        commandId: "history-owner-stale-response",
      }),
      (error) => error.code === "stale-scene-identity",
    );
  } finally {
    sdkStub.broadcast.sendMessage = originalSendMessage;
  }
});

test("dispose durante bootstrap impedisce qualunque aggiornamento tardivo", async () => {
  prepareInitialRead();
  const attached = waitForReadinessSubscription();
  const mounting = mountHistoryOwner();
  await attached.promise;

  unmountHistoryOwner();
  pendingInitialRead.resolve(true);

  assert.equal(await mounting, false);
  assert.equal(getHistoryOwnerState().scene.ready, false);
  assert.equal(listeners.size, 0);
});
