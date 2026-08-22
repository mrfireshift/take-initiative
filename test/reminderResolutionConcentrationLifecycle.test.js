import test, { mock } from "node:test";
import assert from "node:assert/strict";

const clone = (value) => (
  value === undefined ? undefined : structuredClone(value)
);

let plannedResolution;
let mutationResult;
let mutationResults = null;
let mutationGate = null;
const mutationCalls = [];
const warningCalls = [];
const sceneContextCalls = [];
const executedCommandIds = new Set();
const historyEntryWrites = new Set();
let backgroundExecutionCount = 0;
let hpBarSyncCalls = 0;
let hpTextSyncCalls = 0;
let hpMemorySyncCalls = 0;
let canonicalItem = { id: "target", name: "Target" };
let canonicalProbeGate = null;
let canonicalReadCount = 0;

const META_KEY = "com.thebigpicture.initiative/meta";
const REMINDER_RESOLUTIONS_FIELD = "reminderResolutions";

const sdkStub = {
  player: {
    getRole: async () => "GM",
  },
  scene: {
    isReady: async () => true,
    getMetadata: async () => ({}),
    items: {
      getItems: async () => {
        canonicalReadCount += 1;
        if (canonicalProbeGate && canonicalReadCount >= 2) await canonicalProbeGate;
        return [clone(canonicalItem)];
      },
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
    getEffectsMutationSceneContext: async ({ commandId }) => {
      sceneContextCalls.push(commandId);
      return {
        commandId,
        sceneIdentity: "scene-reminder-concentration",
      };
    },
    runEffectsMutation: async (operations, options) => {
      if (mutationGate) await mutationGate;
      mutationCalls.push({
        operations: clone(operations),
        options: clone(options),
      });
      const commandId = String(options?.commandId || "");
      if (commandId && !executedCommandIds.has(commandId)) {
        executedCommandIds.add(commandId);
        backgroundExecutionCount += 1;
      }
      const result = clone(mutationResults ? mutationResults.shift() : mutationResult);
      if (result?.status === "applied" && result.historyEntry?.id) {
        historyEntryWrites.add(result.historyEntry.id);
      }
      return result;
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
    syncHPBarNow: () => { hpBarSyncCalls += 1; },
    syncHPTextBatchNow: async () => { hpTextSyncCalls += 1; },
  },
});

mock.module("../src/hpMemory.js", {
  exports: {
    syncHPBatchToMemory: async () => { hpMemorySyncCalls += 1; },
  },
});

mock.module("../src/sceneEpoch.js", {
  exports: {
    currentSceneEpoch: () => 1,
    isCurrentSceneEpoch: () => true,
    subscribeSceneEpoch: () => () => {},
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

function notice(activationId, activationKind = "zone") {
  return {
    activationId,
    targets: [{ id: "target", name: "Target" }],
    resolution: {
      damage: { dice: "1d6" },
      activation: { kind: activationKind },
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
  sceneContextCalls.length = 0;
  executedCommandIds.clear();
  historyEntryWrites.clear();
  backgroundExecutionCount = 0;
  hpBarSyncCalls = 0;
  hpTextSyncCalls = 0;
  hpMemorySyncCalls = 0;
  canonicalItem = { id: "target", name: "Target" };
  canonicalProbeGate = null;
  canonicalReadCount = 0;
  mutationResults = null;
  mutationGate = null;
  clearReminderResolutionQueue();
}

const RECOVERY_DELAYS_MS = [750, 1500, 3000, 5000];

async function flushMicrotasks(count = 8) {
  for (let index = 0; index < count; index += 1) await Promise.resolve();
}

async function waitForMutationCall(count) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (mutationCalls.length >= count) {
      await flushMicrotasks(12);
      return;
    }
    await flushMicrotasks();
  }
  assert.equal(mutationCalls.length, count);
}

function transportFailure(message = "response lost after commit") {
  return {
    status: "failed",
    error: {
      name: "BackgroundTransportError",
      message,
    },
  };
}

function setCanonicalMarker({
  activationId = plannedResolution.activationId,
  outcome = "failed",
  damage = 8,
  resolvedAt = 123456,
} = {}) {
  const marker = {
    version: 1,
    outcome,
    ...(damage ? { damage } : {}),
    resolvedAt,
  };
  plannedResolution.metadataPatches = [{
    id: "target",
    fields: {
      [REMINDER_RESOLUTIONS_FIELD]: {
        expected: { present: false },
        value: { [activationId]: clone(marker) },
      },
    },
  }];
  canonicalItem = {
    id: "target",
    name: "Target",
    metadata: {
      [META_KEY]: {
        hp: 12,
        hpMax: 20,
        [REMINDER_RESOLUTIONS_FIELD]: {
          [activationId]: clone(marker),
        },
      },
    },
  };
  return marker;
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
  assert.equal(result.mutation.historyPending, true);
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

test("response lost after commit: recovery ripetute riusano la stessa resolution", async () => {
  plannedResolution.activationId = "reminder-concentration-transport";
  const applied = {
    ...clone(mutationResult),
    historyPending: false,
    historyRecovered: true,
    historyEntry: {
      ...clone(mutationResult.historyEntry),
      id: "effects-history:reminder-resolution:transport-stable",
    },
  };
  mutationResults = [
    transportFailure(),
    transportFailure(),
    transportFailure(),
    applied,
  ];

  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const firstPromise = resolveReminder({
      notice: notice(plannedResolution.activationId),
      outcome: "failed",
      damageRoll: 8,
    });
    await waitForMutationCall(1);
    const secondPromise = resolveReminder({
      notice: notice(plannedResolution.activationId),
      outcome: "passed",
      damageRoll: 0,
    });
    assert.strictEqual(secondPromise, firstPromise);

    for (let recoveryAttempt = 1; recoveryAttempt <= 3; recoveryAttempt += 1) {
      mock.timers.tick(RECOVERY_DELAYS_MS[Math.min(recoveryAttempt - 1, 3)]);
      await waitForMutationCall(recoveryAttempt + 1);
    }

    const result = await firstPromise;
    assert.equal(result.status, "applied");
    assert.equal(result.mutation.historyRecovered, true);
    assert.equal(mutationCalls.length, 4);
    assert.equal(sceneContextCalls.length, 1);
    assert.equal(backgroundExecutionCount, 1);
    assert.equal(mutationCalls[0].options.commandId, mutationCalls[3].options.commandId);
    assert.equal(mutationCalls[0].options.sceneIdentity, mutationCalls[3].options.sceneIdentity);
    assert.deepEqual(mutationCalls[0].operations, mutationCalls[3].operations);
    assert.deepEqual(mutationCalls[0].options, mutationCalls[3].options);
    assert.equal(historyEntryWrites.size, 1);
    assert.equal(hpBarSyncCalls, 1);
    assert.equal(hpTextSyncCalls, 1);
    assert.equal(hpMemorySyncCalls, 1);
    assert.equal(warningCalls.length, 1);
    assert.equal(
      warningCalls[0].options.causeHistoryEntryId,
      applied.historyEntry.id,
    );
  } finally {
    mock.timers.reset();
  }
});

test("Immolazione effect-save: marker canonico recupera la resolution senza seconda mutation", async () => {
  plannedResolution.activationId = "immolation-burning:turn-end:target";
  setCanonicalMarker({ activationId: plannedResolution.activationId });
  mutationResults = [transportFailure()];

  const result = await resolveReminder({
    notice: notice(plannedResolution.activationId, "effect-save"),
    outcome: "failed",
    damageRoll: 8,
  });

  assert.equal(result.status, "applied");
  assert.equal(mutationCalls.length, 1);
  assert.equal(backgroundExecutionCount, 1);
  assert.equal(warningCalls.length, 1);
  assert.equal(result.mutation.historyPending, true);
  assert.equal(
    result.mutation.historyEntry.id,
    `effects-history:${mutationCalls[0].options.commandId}`,
  );
  assert.equal(result.mutation.commitResult.sideEffectsPending.length, 0);
});

test("marker canonico zone non salta il consumo dell'attivazione", async () => {
  plannedResolution.activationId = "cloudkill:turn-start:target";
  setCanonicalMarker({ activationId: plannedResolution.activationId });
  plannedResolution.sideEffects = [{
    type: "reminder:consume-zone-activation",
    itemId: "zone",
    metadataKey: "spell-zone",
    activationId: plannedResolution.activationId,
    targetId: "target",
  }];
  mutationResults = [
    transportFailure(),
    { ...clone(mutationResult), historyPending: false },
  ];

  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const pending = resolveReminder({
      notice: notice(plannedResolution.activationId, "zone"),
      outcome: "failed",
      damageRoll: 8,
    });
    await waitForMutationCall(1);
    mock.timers.tick(RECOVERY_DELAYS_MS[0]);
    await waitForMutationCall(2);
    const result = await pending;
    assert.equal(result.status, "applied");
    assert.equal(mutationCalls.length, 2);
  } finally {
    mock.timers.reset();
  }
});

test("marker assente non produce synthetic applied e mantiene la recovery", async () => {
  plannedResolution.activationId = "immolation-marker-absent";
  mutationResults = [
    transportFailure("response unavailable"),
    {
      ...clone(mutationResult),
      historyPending: false,
    },
  ];

  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const pending = resolveReminder({
      notice: notice(plannedResolution.activationId, "effect-save"),
      outcome: "failed",
      damageRoll: 8,
    });
    await waitForMutationCall(1);
    mock.timers.tick(RECOVERY_DELAYS_MS[0]);
    await waitForMutationCall(2);
    const result = await pending;
    assert.equal(result.status, "applied");
    assert.equal(mutationCalls.length, 2);
    assert.equal(warningCalls.length, 1);
  } finally {
    mock.timers.reset();
  }
});

test("marker mismatch non è un commit canonico", async () => {
  plannedResolution.activationId = "immolation-marker-mismatch";
  setCanonicalMarker({ activationId: plannedResolution.activationId, outcome: "failed", damage: 8 });
  canonicalItem.metadata[META_KEY][REMINDER_RESOLUTIONS_FIELD][plannedResolution.activationId] = {
    version: 1,
    outcome: "passed",
    damage: 8,
    resolvedAt: 123456,
  };
  mutationResults = [
    transportFailure("response unavailable"),
    { ...clone(mutationResult), historyPending: false },
  ];

  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const pending = resolveReminder({
      notice: notice(plannedResolution.activationId, "effect-save"),
      outcome: "failed",
      damageRoll: 8,
    });
    await waitForMutationCall(1);
    mock.timers.tick(RECOVERY_DELAYS_MS[0]);
    await waitForMutationCall(2);
    const result = await pending;
    assert.equal(result.status, "applied");
    assert.equal(mutationCalls.length, 2);
  } finally {
    mock.timers.reset();
  }
});

test("scene reset durante il canonical probe rende stale la vecchia resolution", async () => {
  plannedResolution.activationId = "immolation-canonical-scene-reset";
  setCanonicalMarker({ activationId: plannedResolution.activationId });
  mutationResults = [transportFailure()];
  let releaseProbe;
  canonicalProbeGate = new Promise((resolve) => { releaseProbe = resolve; });

  const pending = resolveReminder({
    notice: notice(plannedResolution.activationId, "effect-save"),
    outcome: "failed",
    damageRoll: 8,
  });
  await waitForMutationCall(1);
  clearReminderResolutionQueue();
  releaseProbe();

  const result = await pending;
  assert.equal(result.status, "stale");
  assert.equal(mutationCalls.length, 1);
  assert.equal(warningCalls.length, 0);
});

test("recovery multipla mantiene FIFO del descriptor e non diventa failed durante outage", async () => {
  plannedResolution.activationId = "reminder-concentration-recovery-fifo";
  mutationResults = [
    transportFailure(),
    transportFailure(),
    transportFailure(),
    {
      ...clone(mutationResult),
      historyPending: false,
      historyEntry: {
        ...clone(mutationResult.historyEntry),
        id: "effects-history:recovery-fifo",
      },
    },
  ];

  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const pending = resolveReminder({
      notice: notice(plannedResolution.activationId),
      outcome: "failed",
      damageRoll: 8,
    });
    await waitForMutationCall(1);
    const duplicateClick = resolveReminder({
      notice: notice(plannedResolution.activationId),
      outcome: "passed",
      damageRoll: 0,
    });
    assert.strictEqual(duplicateClick, pending);

    for (let recoveryAttempt = 1; recoveryAttempt <= 3; recoveryAttempt += 1) {
      mock.timers.tick(RECOVERY_DELAYS_MS[Math.min(recoveryAttempt - 1, 3)]);
      await waitForMutationCall(recoveryAttempt + 1);
    }
    const result = await pending;
    assert.equal(result.status, "applied");
    assert.equal(mutationCalls.length, 4);
    assert.equal(new Set(mutationCalls.map(({ options }) => options.commandId)).size, 1);
    assert.deepEqual(
      mutationCalls.map(({ operations }) => operations),
      [mutationCalls[0].operations, mutationCalls[0].operations, mutationCalls[0].operations, mutationCalls[0].operations],
    );
  } finally {
    mock.timers.reset();
  }
});

test("outage lungo resta recoverable e pendingResolutions occupato", async () => {
  plannedResolution.activationId = "reminder-concentration-long-outage";
  mutationResults = Array.from({ length: 11 }, () => transportFailure("transport unavailable"));

  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const pending = resolveReminder({
      notice: notice(plannedResolution.activationId),
      outcome: "failed",
      damageRoll: 8,
    });
    await waitForMutationCall(1);
    const duplicateClick = resolveReminder({
      notice: notice(plannedResolution.activationId),
      outcome: "passed",
      damageRoll: 0,
    });
    assert.strictEqual(duplicateClick, pending);

    for (let recoveryAttempt = 1; recoveryAttempt <= 10; recoveryAttempt += 1) {
      mock.timers.tick(RECOVERY_DELAYS_MS[Math.min(recoveryAttempt - 1, 3)]);
      await waitForMutationCall(recoveryAttempt + 1);
    }

    let settled = false;
    void pending.then(() => { settled = true; });
    await flushMicrotasks();
    assert.equal(settled, false);
    assert.equal(mutationCalls.length, 11);
    assert.equal(backgroundExecutionCount, 1);
    clearReminderResolutionQueue();
    const result = await pending;
    assert.equal(result.status, "stale");
    assert.equal(warningCalls.length, 0);
  } finally {
    mock.timers.reset();
  }
});

test("un conflitto dopo la recovery resta semanticamente terminale", async () => {
  plannedResolution.activationId = "reminder-concentration-semantic-after-recovery";
  mutationResults = [
    transportFailure("transport unavailable"),
    {
      status: "conflict",
      conflicts: [{ reason: "effect-state-conflict" }],
    },
  ];

  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const pending = resolveReminder({
      notice: notice(plannedResolution.activationId),
      outcome: "failed",
      damageRoll: 8,
    });
    await waitForMutationCall(1);
    mock.timers.tick(RECOVERY_DELAYS_MS[0]);
    await waitForMutationCall(2);
    const result = await pending;
    assert.equal(result.status, "stale");
    assert.equal(mutationCalls.length, 2);
    assert.equal(warningCalls.length, 0);
  } finally {
    mock.timers.reset();
  }
});

test("semantic failure termina senza recovery", async () => {
  plannedResolution.activationId = "reminder-concentration-semantic-failure";
  mutationResults = [{
    status: "conflict",
    conflicts: [{ reason: "effect-state-conflict" }],
  }];

  const result = await resolveReminder({
    notice: notice(plannedResolution.activationId),
    outcome: "failed",
    damageRoll: 8,
  });

  assert.equal(result.status, "stale");
  assert.equal(mutationCalls.length, 1);
  assert.equal(warningCalls.length, 0);
});

test("scene reset invalida il transport-pending senza retry o side-effect stale", async () => {
  plannedResolution.activationId = "reminder-concentration-scene-reset";
  mutationResults = [{
    status: "failed",
    error: {
      name: "BackgroundTransportError",
      message: "transport unavailable",
    },
  }];

  const pending = resolveReminder({
    notice: notice(plannedResolution.activationId),
    outcome: "failed",
    damageRoll: 8,
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  clearReminderResolutionQueue();

  const result = await pending;
  assert.equal(result.status, "stale");
  assert.equal(mutationCalls.length, 1);
  assert.equal(warningCalls.length, 0);
  await new Promise((resolve) => setTimeout(resolve, 800));
  assert.equal(mutationCalls.length, 1);
});
