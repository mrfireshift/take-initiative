import assert from "node:assert/strict";
import test, { mock } from "node:test";

const sdkState = { role: "GM", roomReads: 0, roomWrites: [] };
const sdkStub = {
  onReady: () => {},
  player: { getRole: async () => sdkState.role },
  room: {
    getMetadata: async () => {
      sdkState.roomReads += 1;
      return {};
    },
    setMetadata: async (update) => {
      sdkState.roomWrites.push(update);
    },
  },
  scene: {
    getMetadata: async () => ({}),
    isReady: async () => true,
    onReadyChange: () => () => {},
    onMetadataChange: () => () => {},
    items: {
      onChange: () => () => {},
      getItems: async () => [],
      updateItems: async () => {},
    },
  },
  broadcast: { onMessage: () => () => {}, sendMessage: async () => {} },
};
mock.module("@owlbear-rodeo/sdk", {
  exports: {
    default: sdkStub,
    buildLabel: (...args) => ({ type: "LABEL", ...args }),
    buildImage: (...args) => ({ type: "IMAGE", ...args }),
    buildPath: (...args) => ({ type: "PATH", ...args }),
    buildText: (...args) => ({ type: "TEXT", ...args }),
    buildShape: (...args) => ({ type: "SHAPE", ...args }),
    Command: class Command {},
  },
});

const { initHPMemory } = await import("../src/hpMemory.js");

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 20));
}

// PLAYER first: initHPMemory mounts its item watcher once per module instance.
test("initHPMemory su un client Player non legge né scrive la memoria in room", async () => {
  sdkState.role = "PLAYER";
  sdkState.roomReads = 0;
  sdkState.roomWrites = [];
  await initHPMemory();
  await settle();
  assert.equal(sdkState.roomReads, 0);
  assert.deepEqual(sdkState.roomWrites, []);
});

test("initHPMemory sul GM inizializza ancora la memoria in room", async () => {
  sdkState.role = "GM";
  sdkState.roomReads = 0;
  sdkState.roomWrites = [];
  await initHPMemory();
  await settle();
  assert.ok(sdkState.roomReads >= 1);
  assert.ok(sdkState.roomWrites.length >= 1);
  assert.ok(sdkState.roomWrites.every((update) => Object.keys(update).length === 1));
});
