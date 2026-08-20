import test, { mock } from "node:test";
import assert from "node:assert/strict";

const clone = (value) => (
  value === undefined ? undefined : structuredClone(value)
);

let plannedResolution;
let mutationResult;
let mutationGate = null;
const mutationCalls = [];
const warningCalls = [];

const sdkStub = {
  player: {
    getRole: async () => "GM",
  },
  scene: {
    isReady: async () => true,
    getMetadata: async () => ({}),
    items: {
      getItems: async () => [{ id: "target", name: "Target" }],
    },
  },
};

mock.module("@owlbear-rodeo/sdk", {
  exports: { default: sdkStub },
});

mock.module("../src/reminderResolutionCore.js", {
  exports: {
    buildReminderResolutionPlan: ({ notice }) => ({
      ...plannedResolution,
      activationId: plannedResolution.activationId || notice?.activationId,
    }),
  },
});

mock.module("../src/effectsMutations.js", {
  exports: {
    EFFECTS_MUTATION_STATUS: Object.freeze({
      APPLIED: "applied",
      REJECTED: "rejected",
      FAILED: "failed",
      CONFLICT: "conflict",
    }),
    runEffectsMutation: async (operations, options) => {
      if (mutationGate) await mutationGate;
      mutationCalls.push({
        operations: clone(operations),
        options: clone(options),
      });
      return clone(mutationResult);
    },
  },
});

mock.module("../src/concentrationSaveReminder.js", {
  exports: {
    broadcastConcentrationSaveWarnings: async (changes, options) => {
      warningCalls.push({ changes: clone(changes), options: clone(options) });
      return [{
        notice: {
          causeHistoryEntryId: options?.causeHistoryEntryId,
        },
      }];
    },
  },
});

mock.module("../src/hpbar-items.js", {
  exports: {
    syncHPBarNow: () => {},
    syncHPTextBatchNow: async () => {},
  },
});

mock.module("../src/hpMemory.js", {
  exports: {
    syncHPBatchToMemory: async () => {},
  },
});

mock.module("../src/sceneEpoch.js", {
  exports: {
    currentSceneEpoch: () => 1,
    isCurrentSceneEpoch: () => true,
  },
});

mock.module("../src/combatLogCausalityCore.js", {
  exports: {
    buildSpellCausality: (payload) => payload,
  },
});

const {
  clearReminderResolutionQueue,
  resolveReminder,
} = await import("../src/reminderResolution.js");

function notice(activationId) {
  return {
    activationId,
    targets: [{ id: "target", name: "Target" }],
    resolution: {
      damage: { dice: "1d6" },
      activation: { kind: "zone" },
    },
  };
}

function configureRuntime({ activationId = "reminder-concentration-1" } = {}) {
  plannedResolution = {
    status: "ready",
    activationId,
    targetId: "target",
    targetIds: ["target"],
    outcome: "failed",
    resolutionMode: "apply",
    operations: [],
    damage: { amount: 8, factor: 1, roll: 8 },
    hpChange: { before: 20, after: 12, hpMax: 20 },
    metadataPatches: [],
    sideEffects: [],
    sceneMetadataPreconditions: [],
  };
  mutationResult = {
    status: "applied",
    changedIds: ["target"],
    historyPending: true,
    historyEntry: {
      id: `effects-history:reminder-resolution:${activationId}`,
      version: 1,
      at: 1234.5,
      kind: "reminder-resolution",
    },
    commitResult: { sideEffectsPending: [] },
  };
  mutationCalls.length = 0;
  warningCalls.length = 0;
  mutationGate = null;
  clearReminderResolutionQueue();
}

test.beforeEach(() => {
  configureRuntime();
});

test("propaga l'ID della Effects History entry deferred al warning di concentrazione", async () => {
  const result = await resolveReminder({
    notice: notice("reminder-concentration-1"),
    outcome: "failed",
    damageRoll: 8,
  });

  assert.equal(result.status, "applied");
  assert.equal(mutationCalls.length, 1);
  assert.equal(mutationCalls[0].options.deferHistory, true);
  assert.match(
    mutationCalls[0].options.commandId,
    /^reminder-resolution:reminder-concentration-1:/u,
  );
  assert.equal(mutationResult.historyPending, true);
  assert.equal(warningCalls.length, 1);
  assert.equal(
    warningCalls[0].options.causeHistoryEntryId,
    mutationResult.historyEntry.id,
  );
  assert.equal(
    warningCalls[0].options.eventId,
    "reminder-resolution:reminder-concentration-1",
  );
  assert.notEqual(
    warningCalls[0].options.causeHistoryEntryId,
    warningCalls[0].options.eventId,
  );
});

test("il retry della History mantiene l'ID causale dell'entry immutabile", async () => {
  const activationId = "reminder-concentration-retry";
  const immutableHistoryEntry = clone(mutationResult.historyEntry);
  immutableHistoryEntry.id = `effects-history:reminder-resolution:${activationId}`;
  plannedResolution.activationId = activationId;
  mutationResult.historyEntry = immutableHistoryEntry;

  await resolveReminder({
    notice: notice(activationId),
    outcome: "failed",
    damageRoll: 8,
  });
  const pendingCauseId = warningCalls[0].options.causeHistoryEntryId;
  const firstCommandId = mutationCalls[0].options.commandId;

  mutationResult = {
    ...mutationResult,
    historyPending: false,
    historyEntry: immutableHistoryEntry,
  };
  await resolveReminder({
    notice: notice(activationId),
    outcome: "failed",
    damageRoll: 8,
  });

  assert.equal(warningCalls.length, 2);
  assert.notEqual(mutationCalls[1].options.commandId, firstCommandId);
  assert.match(
    mutationCalls[1].options.commandId,
    new RegExp(`^reminder-resolution:${activationId}:`),
  );
  assert.equal(pendingCauseId, immutableHistoryEntry.id);
  assert.equal(
    warningCalls[1].options.causeHistoryEntryId,
    immutableHistoryEntry.id,
  );
});

test("invocazioni concorrenti dello stesso activationId condividono un solo tentativo", async () => {
  let release;
  mutationGate = new Promise((resolve) => { release = resolve; });
  plannedResolution.activationId = "reminder-concentration-concurrent";

  const firstPromise = resolveReminder({
    notice: notice("reminder-concentration-concurrent"),
    outcome: "failed",
    damageRoll: 8,
  });
  const secondPromise = resolveReminder({
    notice: notice("reminder-concentration-concurrent"),
    outcome: "passed",
    damageRoll: 0,
  });

  await Promise.resolve();
  assert.equal(mutationCalls.length, 0);
  release();
  const [first, second] = await Promise.all([firstPromise, secondPromise]);

  assert.equal(first.status, "applied");
  assert.deepEqual(second, first);
  assert.equal(mutationCalls.length, 1);
  assert.match(
    mutationCalls[0].options.commandId,
    /^reminder-resolution:reminder-concentration-concurrent:/u,
  );
});
