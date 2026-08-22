import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { createEffectsMutationBackgroundBroker } from "../src/effectsMutationBroker.js";

globalThis.location = { pathname: "/initiative.html" };

const listeners = new Map();
const clone = (value) => structuredClone(value);
const sdkStub = {
  onReady: () => {},
  scene: {
    isReady: async () => true,
    onReadyChange: () => () => {},
    getMetadata: async () => ({}),
    setMetadata: async () => {},
    items: {
      getItems: async () => [],
      updateItems: async () => {},
      deleteItems: async () => {},
      addItems: async () => {},
    },
    grid: {
      getDpi: async () => 150,
      getScale: async () => ({ parsed: { multiplier: 1, unit: "m" } }),
    },
  },
  player: { getRole: async () => "PLAYER" },
  broadcast: {
    onMessage(channel, listener) {
      const entries = listeners.get(channel) || new Set();
      entries.add(listener);
      listeners.set(channel, entries);
      return () => entries.delete(listener);
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
    buildLabel: () => ({ type: "LABEL" }),
    buildImage: () => ({ type: "IMAGE" }),
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

const { EFFECTS_MUTATION_COMMAND_CHANNEL, EFFECTS_MUTATION_RESULT_CHANNEL } =
  await import("../src/constants.js");
const { markSceneEpochReady } = await import("../src/sceneEpoch.js");
const { runEffectsMutation } = await import("../src/effectsMutations.js");
const { createInitiativeTemporalLane } = await import("../src/initiativeTemporalLaneCore.js");

test("response persa dopo commit: retry usa stesso commandId e il broker applica una sola volta", async () => {
  listeners.clear();
  markSceneEpochReady("transport-retry-test");

  const commandIds = [];
  const requestIds = [];
  let transportApplyRequests = 0;
  let mutationExecutions = 0;
  let semanticRequests = 0;
  const requestsByCommand = new Map();
  const executionsByCommand = new Map();
  const broker = createEffectsMutationBackgroundBroker({
    executeApply: async (_operations, command) => {
      mutationExecutions += 1;
      executionsByCommand.set(
        command.commandId,
        (executionsByCommand.get(command.commandId) || 0) + 1,
      );
      return {
        status: "applied",
        commandId: command.commandId,
        committed: true,
        plan: { changedIds: ["token-1"], changes: [] },
        changedIds: ["token-1"],
        changes: [],
      };
    },
    executeUndo: async () => ({ status: "applied" }),
    getContextState: () => ({}),
  });
  broker.setSceneIdentity("scene-retry");

  const unsubscribe = sdkStub.broadcast.onMessage(
    EFFECTS_MUTATION_COMMAND_CHANNEL,
    async ({ data }) => {
      requestIds.push(data.requestId);
      if (data.kind === "context") {
        await sdkStub.broadcast.sendMessage(EFFECTS_MUTATION_RESULT_CHANNEL, {
          requestId: data.requestId,
          result: { status: "applied", sceneIdentity: "scene-retry" },
        });
        return;
      }
      transportApplyRequests += 1;
      commandIds.push(data.command.commandId);
      const commandAttempt = (requestsByCommand.get(data.command.commandId) || 0) + 1;
      requestsByCommand.set(data.command.commandId, commandAttempt);
      if (data.command.commandId === "semantic-conflict") {
        semanticRequests += 1;
        await sdkStub.broadcast.sendMessage(EFFECTS_MUTATION_RESULT_CHANNEL, {
          requestId: data.requestId,
          result: {
            status: "conflict",
            commandId: data.command.commandId,
            conflicts: [{ reason: "effect-state-conflict" }],
          },
        });
        return;
      }
      const handled = await broker.handle(data);
      if (
        data.command.commandId === "temporal-retry-command"
        && commandAttempt === 1
      ) {
        // The broker has already committed and cached the result; only the
        // result broadcast is lost.
        return;
      }
      if (
        data.command.commandId === "temporal-recovery-command"
        && commandAttempt <= 2
      ) {
        // Both immediate attempts lose only the response; the third request
        // below must be served from the broker cache.
        return;
      }
      await sdkStub.broadcast.sendMessage(EFFECTS_MUTATION_RESULT_CHANNEL, {
        requestId: data.requestId,
        result: handled.result,
      });
    },
  );

  const result = await runEffectsMutation([{
    type: "condition:add-instances",
    instancesByTarget: {
      "token-1": [{
        id: "retry-condition",
        condition: "retry-condition",
        active: true,
        targetId: "token-1",
        expiry: { mode: "manual" },
      }],
    },
  }], {
    commandId: "temporal-retry-command",
    sceneIdentity: "scene-retry",
    transportTimeoutMs: 100,
    history: false,
  });

  assert.equal(result.status, "applied");
  assert.equal(transportApplyRequests, 2);
  assert.equal(mutationExecutions, 1);
  assert.equal(new Set(commandIds).size, 1);
  assert.notEqual(requestIds.at(-1), requestIds.at(-2));

  const recoveryOperation = {
    type: "condition:add-instances",
    instancesByTarget: {
      "token-1": [{
        id: "recovery-condition",
        condition: "recovery-condition",
        active: true,
        targetId: "token-1",
        expiry: { mode: "manual" },
      }],
    },
    operationId: "temporal-recovery-command:operation",
    createdAt: 1234,
  };
  let resolveRecoveryPending;
  const recoveryPending = new Promise((resolve) => {
    resolveRecoveryPending = resolve;
  });
  const recoveryLane = createInitiativeTemporalLane({
    recoveryDelayMs: null,
    apply: () => runEffectsMutation([recoveryOperation], {
      commandId: "temporal-recovery-command",
      sceneIdentity: "scene-retry",
      transportTimeoutMs: 100,
      history: false,
    }),
    isCurrent: () => true,
    onEvent: (event) => {
      if (event.type === "transport-pending") resolveRecoveryPending();
    },
  });
  const recoveryResult = recoveryLane.enqueue({
    transitionSeq: 2,
    roundCommandId: "temporal-recovery-command",
  });
  await recoveryPending;
  assert.equal(recoveryLane.getState().status, "transport-pending");
  assert.equal(requestsByCommand.get("temporal-recovery-command"), 2);
  assert.equal(executionsByCommand.get("temporal-recovery-command"), 1);
  assert.equal(recoveryLane.recover("transport-restored"), true);
  assert.equal((await recoveryResult).status, "applied");
  assert.equal(requestsByCommand.get("temporal-recovery-command"), 3);
  assert.equal(executionsByCommand.get("temporal-recovery-command"), 1);

  const semanticResult = await runEffectsMutation([], {
    commandId: "semantic-conflict",
    sceneIdentity: "scene-retry",
    transportTimeoutMs: 100,
    history: false,
  });
  assert.equal(semanticResult.status, "conflict");
  assert.equal(semanticRequests, 1);
  unsubscribe();
});
