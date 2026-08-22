import assert from "node:assert/strict";
import test, { mock } from "node:test";

const HISTORY_KEY = "com.thebigpicture.initiative/history";
const clone = (value) => structuredClone(value);

const sceneState = {
  metadata: {
    [HISTORY_KEY]: {
      version: 1,
      roomId: "authoritative-pending-room",
      entries: [{ id: "pending-history-entry", kind: "hp-change", changes: [] }],
    },
  },
  items: [],
};
let authoritativePending = true;
let authoritativeChecks = 0;
let metadataReads = 0;

const broadcastListeners = new Map();
const sdkStub = {
  onReady: () => {},
  player: { getRole: async () => "GM" },
  room: { id: "authoritative-pending-room", getMetadata: async () => ({}) },
  scene: {
    isReady: async () => true,
    onReadyChange: () => () => {},
    getMetadata: async () => {
      metadataReads += 1;
      return clone(sceneState.metadata);
    },
    setMetadata: async (update) => {
      sceneState.metadata = { ...sceneState.metadata, ...clone(update) };
    },
    items: {
      getItems: async () => clone(sceneState.items),
      onChange: () => () => {},
      updateItems: async () => {},
      deleteItems: async () => {},
      addItems: async () => {},
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
        await listener({ data: clone(data) });
      }
    },
  },
};

mock.module("@owlbear-rodeo/sdk", {
  exports: {
    default: sdkStub,
    buildLabel: (...args) => ({ type: "LABEL", args }),
    buildImage: (...args) => ({ type: "IMAGE", args }),
    buildText: (...args) => ({ type: "TEXT", args }),
    buildShape: (...args) => ({ type: "SHAPE", args }),
    Command: class Command {},
  },
});

mock.module("../src/effectsMutations.js", {
  exports: {
    flushPendingEffectsHistory: () => {},
    hasPendingEffectsHistory: () => false,
    hasPendingEffectsHistoryAuthoritative: async () => {
      authoritativeChecks += 1;
      return authoritativePending;
    },
  },
});

const history = await import("../src/history.js?authoritative-pending-barrier");
const { currentSceneEpoch } = await import("../src/sceneEpoch.js");

test("History readiness e Undo rispettano il pending autorevole di un altro realm", async () => {
  authoritativePending = true;
  authoritativeChecks = 0;
  metadataReads = 0;

  const readiness = await history.getHistoryUndoReadiness({
    sceneEpoch: currentSceneEpoch(),
    attempts: 1,
  });
  assert.equal(readiness.status, "blocked");
  assert.equal(readiness.reason, "history-pending");

  const undone = await history.undoHistoryThrough("pending-history-entry", {
    sceneEpoch: currentSceneEpoch(),
  });
  assert.equal(undone.status, "rejected");
  assert.equal(undone.result.reason, "history-pending");
  assert.deepEqual(undone.result.changedIds, []);
  assert.equal(metadataReads, 0, "Undo must stop before selecting a History entry");
  assert.ok(authoritativeChecks > 2, "Undo retries the transient barrier within a bounded window");
});
