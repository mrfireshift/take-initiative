import test, { mock } from "node:test";
import assert from "node:assert/strict";

globalThis.location = { pathname: "/initiative.html" };

const clone = (value) => structuredClone(value);
const listeners = new Map();
const responses = [];

const sdkStub = {
  onReady() {},
  room: { id: "bootstrap-regression-room" },
  player: { getRole: async () => "GM" },
  scene: {
    isReady: async () => true,
    onReadyChange: () => () => {},
    getMetadata: async () => {
      throw new Error("simulated effects-recovery metadata failure");
    },
    setMetadata: async () => {},
    items: {
      getItems: async () => [],
      updateItems: async () => {},
      deleteItems: async () => {},
      addItems: async () => {},
    },
    local: {
      getItems: async () => [],
      deleteItems: async () => {},
      addItems: async () => {},
    },
    grid: {
      getDpi: async () => 150,
      getScale: async () => ({ parsed: { multiplier: 1.5, unit: "m" } }),
    },
  },
  broadcast: {
    onMessage(channel, listener) {
      const channelListeners = listeners.get(channel) || new Set();
      channelListeners.add(listener);
      listeners.set(channel, channelListeners);
      return () => channelListeners.delete(listener);
    },
    async sendMessage(channel, data) {
      for (const listener of [...(listeners.get(channel) || [])]) {
        await listener({ data: clone(data) });
      }
    },
  },
};

mock.module("@owlbear-rodeo/sdk", {
  exports: {
    default: sdkStub,
    buildImage: () => ({ type: "IMAGE" }),
    buildLabel: () => ({ type: "LABEL" }),
    buildText: () => ({ type: "TEXT" }),
    buildShape: () => ({ type: "SHAPE" }),
    Command: { MOVE: 0, LINE: 1, CUBIC: 2, CLOSE: 3 },
    buildPath: () => ({
      commands: () => ({
        fillRule: () => ({
          fillColor: () => ({
            fillOpacity: () => ({
              strokeColor: () => ({
                strokeOpacity: () => ({
                  strokeWidth: () => ({
                    position: () => ({
                      locked: () => ({
                        disableHit: () => ({
                          layer: () => ({
                            metadata: () => ({
                              name: () => ({
                                build: () => ({ id: "mock-path" }),
                              }),
                            }),
                          }),
                        }),
                      }),
                    }),
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    }),
  },
});

const {
  EFFECTS_MUTATION_COMMAND_CHANNEL,
  EFFECTS_MUTATION_RESULT_CHANNEL,
} = await import("../src/constants.js");
const {
  mountEffectsMutationCoordinatorService,
  unmountEffectsMutationCoordinatorService,
} = await import("../src/effectsMutations.js");

test("Shield transport keeps the background command channel alive when recovery bootstrap fails", async () => {
  listeners.clear();
  responses.length = 0;
  const resultUnsubscribe = sdkStub.broadcast.onMessage(
    EFFECTS_MUTATION_RESULT_CHANNEL,
    ({ data }) => responses.push(data),
  );

  try {
    assert.equal(await mountEffectsMutationCoordinatorService(), true);
    await sdkStub.broadcast.sendMessage(EFFECTS_MUTATION_COMMAND_CHANNEL, {
      requestId: "shield-context-after-recovery-failure",
      kind: "context",
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(responses.length, 1);
    assert.equal(responses[0].result.status, "applied");
    assert.ok(responses[0].result.sceneIdentity);
  } finally {
    resultUnsubscribe();
    unmountEffectsMutationCoordinatorService();
  }
});
