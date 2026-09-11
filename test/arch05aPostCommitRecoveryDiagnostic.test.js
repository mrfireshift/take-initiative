import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { produce, isDraft, current } from "immer";
import {
  createVersionedIndexedDB,
  versionedKeyRange,
} from "../test-support/fakeVersionedIndexedDb.js";

const ID = "com.thebigpicture.initiative";
const META_KEY = `${ID}/meta`;
const SPELLS_KEY = `${ID}/spells`;
const CONCENTRATION_KEY = `${ID}/concentration`;
const STATE_KEY = `${ID}/state`;
const HISTORY_KEY = `${ID}/history`;
const RECOVERY_KEY = `${ID}/effects-recovery-v1`;
const pendingRecovery = () => Object.values(scene.metadata[RECOVERY_KEY]?.records || {});

const clone = (value) => value === undefined ? undefined : structuredClone(value);
const previousIndexedDB = globalThis.indexedDB;
const previousKeyRange = globalThis.IDBKeyRange;
const previousLocation = globalThis.location;
globalThis.indexedDB = createVersionedIndexedDB();
globalThis.IDBKeyRange = versionedKeyRange;
globalThis.location = { pathname: "/plugin.html" };

const scene = {
  ready: true,
  metadata: {},
  items: [],
};
const fault = {
  failHistoryWrites: false,
  failUpdateAt: 0,
  failAllItemReads: false,
  historyWriteAttempts: 0,
  updateCalls: 0,
  itemReadFailures: 0,
  failRecoveryPhase: null,
  failRecoveryCleanup: false,
  afterUpdate: null,
};
const readyListeners = new Set();
const metadataListeners = new Set();
const broadcastListeners = new Map();

function itemsFor(ids) {
  if (fault.failAllItemReads) {
    fault.itemReadFailures += 1;
    throw new Error("arch05a-injected-item-read-failure");
  }
  if (typeof ids === "function") return scene.items.filter(ids).map(clone);
  const wanted = Array.isArray(ids) ? new Set(ids) : null;
  return scene.items.filter((item) => !wanted || wanted.has(item.id)).map(clone);
}

function replaceDrafts(drafts) {
  const byId = new Map(drafts.map((item) => [item.id, item]));
  scene.items = scene.items.map((item) => byId.get(item.id) || item);
}

const sdkStub = {
  onReady() {},
  player: {
    getRole: async () => "GM",
    getId: async () => "arch05a-gm",
  },
  room: {
    id: "arch05a-room",
    getMetadata: async () => ({}),
    setMetadata: async () => {},
  },
  scene: {
    isReady: async () => scene.ready,
    onReadyChange(listener) {
      readyListeners.add(listener);
      return () => readyListeners.delete(listener);
    },
    onMetadataChange(listener) {
      metadataListeners.add(listener);
      return () => metadataListeners.delete(listener);
    },
    getMetadata: async () => clone(scene.metadata),
    setMetadata: async (update) => {
      if (update[RECOVERY_KEY]) {
        const records = Object.values(update[RECOVERY_KEY].records || {});
        if (fault.failRecoveryPhase && records.some((record) => record.phase === fault.failRecoveryPhase)) {
          fault.failRecoveryPhase = null;
          throw new Error("arch05b-recovery-phase-write-failure");
        }
        if (fault.failRecoveryCleanup && !records.length) {
          fault.failRecoveryCleanup = false;
          throw new Error("arch05b-recovery-cleanup-failure");
        }
      }
      if (Object.prototype.hasOwnProperty.call(update || {}, HISTORY_KEY)) {
        fault.historyWriteAttempts += 1;
        if (fault.failHistoryWrites) throw new Error("arch05a-injected-history-write-failure");
      }
      scene.metadata = { ...scene.metadata, ...clone(update) };
      if (fault.loseResponseKey && Object.hasOwn(update, fault.loseResponseKey)) {
        fault.loseResponseKey = null;
        throw new Error("arch05b-write-persisted-response-lost");
      }
      for (const listener of [...metadataListeners]) listener(clone(scene.metadata));
    },
    items: {
      getItems: async (ids) => itemsFor(ids),
      getItemBounds: async (ids) => Object.fromEntries(
        itemsFor(ids).map((item) => [item.id, {
          min: clone(item.position || { x: 0, y: 0 }),
          max: {
            x: Number(item.position?.x || 0) + 100,
            y: Number(item.position?.y || 0) + 100,
          },
        }]),
      ),
      updateItems: async (ids, updater) => {
        const call = ++fault.updateCalls;
        let drafts = itemsFor(ids);
        if (fault.immerDrafts) drafts = produce(drafts, updater);
        else await updater(drafts);
        if (fault.failUpdateAt === call) {
          throw new Error(`arch05a-injected-update-failure:${call}`);
        }
        replaceDrafts(drafts);
        if (fault.afterUpdate) await fault.afterUpdate(call);
      },
      addItems: async (items) => { scene.items.push(...clone(items || [])); },
      deleteItems: async (ids) => {
        const wanted = new Set(ids || []);
        scene.items = scene.items.filter((item) => !wanted.has(item.id));
      },
    },
    grid: {
      getDpi: async () => 150,
      getScale: async () => ({ parsed: { multiplier: 1.5, unit: "m" } }),
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
      for (const listener of [...(broadcastListeners.get(channel) || [])]) {
        listener({ data: clone(data) });
      }
    },
  },
  notification: { show: async () => {} },
};

mock.module("@owlbear-rodeo/sdk", {
  exports: {
    default: sdkStub,
    buildLabel: () => ({ build: () => ({ id: "label" }) }),
    buildImage: () => ({ build: () => ({ id: "image" }) }),
    buildText: () => ({ build: () => ({ id: "text" }) }),
    buildShape: () => ({ build: () => ({ id: "shape" }) }),
    buildPath: () => ({ build: () => ({ id: "path" }) }),
    Command: class Command {},
  },
});

const {
  buildReminderResolutionPlan,
  buildZoneTriggerReminderResolution,
} = await import("../src/reminderResolutionCore.js?arch05a-reminder-core");
const { pendingSpellZoneTriggerActivations } = await import(
  "../src/spellZoneTriggerCore.js?arch05a-trigger-core"
);
const { SPELL_STATIC_ZONE_META_KEY } = await import(
  "../src/spellStaticZoneCore.js?arch05a-static-zone-core"
);
const { reconcileOwnedSceneItems } = await import(
  "../src/sceneItemReconcileCore.js?arch05a-reconcile-core"
);
const sceneEpoch = await import("../src/sceneEpoch.js");

let runtimeSequence = 0;
const liveRuntimes = new Set();

function token(id, { hp = 10, hpMax = 10, position = { x: 0, y: 0 } } = {}) {
  return {
    id,
    name: id,
    layer: "CHARACTER",
    position: clone(position),
    visible: true,
    metadata: {
      [META_KEY]: { hp, hpMax, conditions: [] },
      [SPELLS_KEY]: [],
      [CONCENTRATION_KEY]: {},
    },
  };
}

function resetPersistentScene() {
  fault.immerDrafts = false;
  sdkStub.room.id = "arch05a-room";
  fault.loseResponseKey = null;
  scene.ready = true;
  scene.metadata = {
    [STATE_KEY]: { order: ["caster", "target"], current: 0, round: 1 },
  };
  scene.items = [
    token("caster", { position: { x: 0, y: 0 } }),
    token("target", { position: { x: 100, y: 100 } }),
    token("secondary", { position: { x: 200, y: 200 } }),
  ];
  Object.assign(fault, {
    failHistoryWrites: false,
    failUpdateAt: 0,
    failAllItemReads: false,
    historyWriteAttempts: 0,
    updateCalls: 0,
    itemReadFailures: 0,
    failRecoveryPhase: null,
    failRecoveryCleanup: false,
    afterUpdate: null,
  });
}

function historyEntries() {
  return scene.metadata?.[HISTORY_KEY]?.entries || [];
}

function item(id) {
  return scene.items.find((entry) => entry.id === id);
}

function conditionIds(id = "target") {
  const value = item(id)?.metadata?.[META_KEY]?.conditions;
  const entries = Array.isArray(value?.instances) ? value.instances : Array.isArray(value) ? value : [];
  return entries.map((entry) => entry.id);
}

function addConditionOperation(instanceId = "arch05a-condition", targetId = "target") {
  return [{
    type: "condition:add-instances",
    instancesByTarget: {
      [targetId]: [{
        id: instanceId,
        condition: "Prono",
        active: true,
        targetId,
        expiry: { mode: "manual" },
      }],
    },
  }];
}

async function eventually(predicate, timeoutMs = 2500) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return Boolean(await predicate());
}

async function bootRuntime(label = "runtime") {
  const suffix = `${label}-${++runtimeSequence}`;
  globalThis.location = { pathname: "/background.html" };
  const owner = await import(`../src/historyOwner.js?arch05a-owner-${suffix}`);
  const background = await import(`../src/effectsMutations.js?arch05a-background-${suffix}`);
  assert.equal(await owner.mountHistoryOwner(), true);
  assert.equal(await background.mountEffectsMutationCoordinatorService(), true);
  globalThis.location = { pathname: "/plugin.html" };
  const client = await import(`../src/effectsMutations.js?arch05a-client-${suffix}`);
  const runtime = { owner, background, client, stopped: false };
  liveRuntimes.add(runtime);
  return runtime;
}

function stopCaller(runtime) {
  runtime.client.unmountEffectsMutationCoordinatorService();
}

function stopRuntime(runtime) {
  if (!runtime || runtime.stopped) return;
  runtime.stopped = true;
  runtime.client.unmountEffectsMutationCoordinatorService();
  runtime.background.unmountEffectsMutationCoordinatorService();
  runtime.owner.unmountHistoryOwner();
  liveRuntimes.delete(runtime);
}

function setSceneReady(ready) {
  scene.ready = ready === true;
  for (const listener of [...readyListeners]) listener(scene.ready);
}

function reminderFixture() {
  fault.immerDrafts = true;
  const activationId = "arch05a-zone-activation";
  const resolution = buildZoneTriggerReminderResolution({
    activation: {
      id: activationId,
      resolution: "manual-save",
      ability: "dex",
      zoneItemId: "zone",
      targetIds: ["target"],
      turnKey: "1:0:target",
      failureCondition: { condition: "Prono" },
    },
    targetId: "target",
    sourceId: "caster",
    sourceName: "Caster",
    dc: 15,
    metadataKey: SPELL_STATIC_ZONE_META_KEY,
  });
  const zone = {
    id: "zone",
    name: "Zona diagnostica",
    layer: "DRAWING",
    metadata: {
      [SPELL_STATIC_ZONE_META_KEY]: {
        role: "root",
        instanceId: "arch05a-zone-instance",
        triggerRuntime: {
          pending: [{
            id: activationId,
            targetIds: ["target"],
            createdAt: 1,
          }],
        },
      },
    },
  };
  scene.items.push(zone);
  const notice = {
    activationId,
    targets: [{ id: "target", name: "Target" }],
    resolution,
  };
  const build = () => buildReminderResolutionPlan({
    notice,
    items: clone(scene.items),
    outcome: "failed",
    sceneMetadata: clone(scene.metadata),
    now: 100,
  });
  return { activationId, notice, build };
}

async function runReminderCommand(runtime, plan, commandId) {
  return runtime.client.runEffectsMutation(plan.operations, {
    commandId,
    kind: "reminder-resolution",
    label: "ARCH-05A reminder",
    targetIds: plan.targetIds,
    metadataPatches: plan.metadataPatches,
    sideEffects: plan.sideEffects,
    sceneMetadataPreconditions: plan.sceneMetadataPreconditions,
    requireChanges: true,
    deferHistory: true,
    history: {
      kind: "reminder-resolution",
      label: "ARCH-05A reminder",
      payload: { activationId: plan.activationId, outcome: plan.outcome },
    },
  });
}

test.beforeEach(() => {
  for (const runtime of [...liveRuntimes]) stopRuntime(runtime);
  resetPersistentScene();
});

test.after(() => {
  for (const runtime of [...liveRuntimes]) stopRuntime(runtime);
  globalThis.indexedDB = previousIndexedDB;
  globalThis.IDBKeyRange = previousKeyRange;
  globalThis.location = previousLocation;
});

test("F1 — failure before canonical commit leaves canonical, History and side effects untouched", async () => {
  const runtime = await bootRuntime("f1");
  fault.failUpdateAt = 1;

  const result = await runtime.client.runEffectsMutation(addConditionOperation(), {
    commandId: "arch05a-f1",
  });

  assert.equal(result.status, "failed");
  assert.equal(result.committed, false);
  assert.deepEqual(conditionIds(), []);
  assert.equal(historyEntries().length, 0);
  assert.deepEqual(item("target").position, { x: 100, y: 100 });
});

test("caller termination — background-owned History retry survives popup/tracker death", async () => {
  const runtime = await bootRuntime("caller-death");
  fault.failHistoryWrites = true;
  const result = await runtime.client.runEffectsMutation(addConditionOperation(), {
    commandId: "arch05a-caller-death",
  });
  assert.equal(result.status, "applied");
  assert.equal(result.historyPending, true);
  assert.deepEqual(conditionIds(), ["arch05a-condition"]);

  stopCaller(runtime);
  fault.failHistoryWrites = false;

  assert.equal(await eventually(() => historyEntries().length === 1), true);
  assert.equal(historyEntries()[0].effectsMutation.commandId, "arch05a-caller-death");
});

test("R1/F2/F4 — background replacement recovers immutable History and Undo", async () => {
  const first = await bootRuntime("f2-old");
  fault.failHistoryWrites = true;
  const result = await first.client.runEffectsMutation(addConditionOperation(), {
    commandId: "arch05a-f2-history",
  });
  assert.equal(result.status, "applied");
  assert.equal(result.committed, true);
  assert.equal(result.historyPending, true);
  assert.deepEqual(result.plan.changes[0].before.conditions, []);
  assert.deepEqual(conditionIds(), ["arch05a-condition"]);
  assert.equal(historyEntries().length, 0);

  stopRuntime(first);
  fault.failHistoryWrites = false;
  const second = await bootRuntime("f2-new");
  await new Promise((resolve) => setTimeout(resolve, 850));

  assert.equal(await second.client.hasPendingEffectsHistoryAuthoritative(), false);
  assert.equal(historyEntries().length, 1);
  assert.deepEqual(conditionIds(), ["arch05a-condition"]);
  assert.equal(pendingRecovery().length, 0);
  const undone = await second.background.undoEffectsMutation(historyEntries()[0], { transport: "background" });
  assert.equal(undone.status, "applied");
  assert.deepEqual(conditionIds(), []);
});

test("R8 — scene unload/reload retains and recovers a pending append", async () => {
  const runtime = await bootRuntime("scene-boundary");
  fault.failHistoryWrites = true;
  const result = await runtime.client.runEffectsMutation(addConditionOperation(), {
    commandId: "arch05a-scene-boundary",
  });
  assert.equal(result.historyPending, true);
  assert.deepEqual(conditionIds(), ["arch05a-condition"]);

  setSceneReady(false);
  fault.failHistoryWrites = false;
  setSceneReady(true);
  await new Promise((resolve) => setTimeout(resolve, 850));

  assert.equal(historyEntries().length, 1);
  assert.deepEqual(conditionIds(), ["arch05a-condition"]);
  assert.equal(await runtime.client.hasPendingEffectsHistoryAuthoritative(), false);
});

test("R3/F3 — restart completes only the missing physical side effect", async () => {
  const first = await bootRuntime("f3-old");
  fault.failUpdateAt = 3;
  const result = await first.client.runEffectsMutation(addConditionOperation(), {
    commandId: "arch05a-f3-partial-side-effects",
    sideEffects: [
      {
        type: "token:teleport",
        targetId: "target",
        position: { x: 300, y: 300 },
        skipAnimation: true,
      },
      {
        type: "token:teleport",
        targetId: "secondary",
        position: { x: 400, y: 400 },
        skipAnimation: true,
      },
    ],
  });

  assert.equal(result.status, "applied");
  assert.equal(result.committed, true);
  assert.equal(result.commitResult.sideEffectChanges.length, 1);
  assert.equal(result.commitResult.sideEffectsPending.length, 1);
  const preparedTeleport = result.plan.preparedSideEffects.find((effect) => effect.id === "target");
  assert.equal(preparedTeleport.type, "token:teleport");
  assert.equal(preparedTeleport.id, "target");
  assert.deepEqual(preparedTeleport.beforePosition, { x: 100, y: 100 });
  assert.deepEqual(preparedTeleport.afterPosition, { x: 300, y: 300 });
  assert.deepEqual(item("target").position, { x: 300, y: 300 });
  assert.deepEqual(item("secondary").position, { x: 200, y: 200 });
  assert.equal(historyEntries().length, 0);

  stopRuntime(first);
  fault.failUpdateAt = 0;
  await bootRuntime("f3-new");
  await new Promise((resolve) => setTimeout(resolve, 850));

  assert.deepEqual(item("target").position, { x: 300, y: 300 });
  assert.deepEqual(item("secondary").position, { x: 400, y: 400 });
  assert.equal(historyEntries().length, 1);
  assert.equal(pendingRecovery().length, 0);
});

test("token:teleport — incomplete recovery descriptor fails without a write", async () => {
  const first = await bootRuntime("teleport-invalid-old");
  const commandId = "arch05b-teleport-invalid";
  fault.failUpdateAt = 2;
  const result = await first.client.runEffectsMutation(addConditionOperation(), {
    commandId,
    sideEffects: [{
      type: "token:teleport",
      targetId: "target",
      position: { x: 300, y: 300 },
      skipAnimation: true,
    }],
  });

  assert.equal(result.status, "applied");
  assert.equal(result.recoveryPending, true);
  assert.deepEqual(item("target").position, { x: 100, y: 100 });
  assert.equal(pendingRecovery().length, 1);

  delete pendingRecovery()[0].sideEffects[0].afterPosition;
  stopRuntime(first);
  fault.failUpdateAt = 0;
  const second = await bootRuntime("teleport-invalid-new");

  assert.deepEqual(item("target").position, { x: 100, y: 100 });
  assert.equal(historyEntries().length, 0);
  assert.equal(pendingRecovery().length, 1);
  assert.deepEqual(pendingRecovery()[0].completedSideEffects, []);

  const retry = await second.client.runEffectsMutation(addConditionOperation(), { commandId });
  assert.equal(retry.status, "applied");
  assert.equal(retry.recoveryPending, true);
  assert.equal(retry.postCommitErrors[0]?.message, "token-teleport-invalid");
  assert.doesNotMatch(JSON.stringify(retry), /ReferenceError/u);
  assert.deepEqual(item("target").position, { x: 100, y: 100 });
  assert.equal(pendingRecovery().length, 1);
});

test("R6 — Quick HP ownership transfer survives loss of the caller's before", async () => {
  const first = await bootRuntime("quick-hp-old");
  fault.failHistoryWrites = true;
  const result = await first.client.runEffectsMutation([
    { type: "hp:set", updates: [{ itemId: "target", hp: 3, hpMax: 10 }] },
    ...addConditionOperation(),
  ], { commandId: "quick-hp-durable", kind: "hp", history: true });
  assert.equal(result.status, "applied");
  assert.equal(item("target").metadata[META_KEY].hp, 3);
  assert.equal(historyEntries().length, 0);
  stopRuntime(first);
  fault.failHistoryWrites = false;
  const second = await bootRuntime("quick-hp-new");
  assert.equal(historyEntries().length, 1);
  const undone = await second.background.undoEffectsMutation(historyEntries()[0], { transport: "background" });
  assert.equal(undone.status, "applied");
  assert.equal(item("target").metadata[META_KEY].hp, 10);
  assert.deepEqual(conditionIds(), []);
});

test("F5 — ACK loss is deduplicated in-runtime and state-idempotent after broker replacement", async () => {
  const first = await bootRuntime("f5-old");
  const commandId = "arch05a-f5-ack-loss";
  const operation = addConditionOperation("arch05a-f5-condition");
  const appliedButAckIgnored = await first.client.runEffectsMutation(operation, { commandId });
  assert.equal(appliedButAckIgnored.status, "applied");

  const sameRuntimeRetry = await first.client.runEffectsMutation(operation, { commandId });
  assert.equal(sameRuntimeRetry.status, "applied");
  assert.deepEqual(conditionIds(), ["arch05a-f5-condition"]);
  assert.equal(historyEntries().length, 1);

  stopRuntime(first);
  const second = await bootRuntime("f5-new");
  const crossRuntimeRetry = await second.client.runEffectsMutation(operation, { commandId });
  assert.equal(crossRuntimeRetry.status, "applied");
  assert.deepEqual(crossRuntimeRetry.changedIds, []);
  assert.deepEqual(conditionIds(), ["arch05a-f5-condition"]);
  assert.equal(historyEntries().length, 1);
});

test("R2/F6 — scheduled History retry survives replacement of its runtime", async () => {
  const first = await bootRuntime("f6-old");
  fault.failHistoryWrites = true;
  const result = await first.client.runEffectsMutation(addConditionOperation(), {
    commandId: "arch05a-f6-retry",
  });
  assert.equal(result.historyPending, true);
  assert.equal(await eventually(() => fault.historyWriteAttempts >= 2), true);
  const attemptsBeforeDeath = fault.historyWriteAttempts;

  stopRuntime(first);
  fault.failHistoryWrites = false;
  await bootRuntime("f6-new");
  await new Promise((resolve) => setTimeout(resolve, 850));

  assert.ok(attemptsBeforeDeath >= 2);
  assert.equal(historyEntries().length, 1);
  assert.deepEqual(conditionIds(), ["arch05a-condition"]);
});

test("R7 — reminder consumption and History converge on full reload", async () => {
  const fixture = reminderFixture();
  const plan = fixture.build();
  assert.equal(plan.status, "ready");
  const first = await bootRuntime("reminder-old");
  fault.failHistoryWrites = true;
  const result = await runReminderCommand(first, plan, "arch05a-reminder-history-loss");
  assert.equal(result.status, "applied");
  assert.equal(result.historyPending, true);
  assert.equal(historyEntries().length, 0);
  assert.equal(pendingSpellZoneTriggerActivations(scene.items).length, 0);
  assert.equal(
    item("target").metadata[META_KEY].reminderResolutions[fixture.activationId].outcome,
    "failed",
  );

  stopRuntime(first);
  fault.failHistoryWrites = false;
  await bootRuntime("reminder-new");
  await new Promise((resolve) => setTimeout(resolve, 850));

  assert.equal(fixture.build().status, "already-resolved");
  assert.equal(historyEntries().length, 1);
  assert.equal(pendingSpellZoneTriggerActivations(scene.items).length, 0);
});

test("R7 — resolved marker and pending activation converge after restart", async () => {
  const fixture = reminderFixture();
  const plan = fixture.build();
  const first = await bootRuntime("reminder-side-effect-old");
  fault.failUpdateAt = 2;
  const result = await runReminderCommand(first, plan, "arch05a-reminder-side-effect-loss");

  assert.equal(result.status, "applied");
  assert.equal(result.commitResult.sideEffectsPending.length, 1);
  assert.equal(fixture.build().status, "already-resolved");
  assert.deepEqual(
    pendingSpellZoneTriggerActivations(scene.items).map((entry) => entry.id),
    [fixture.activationId],
  );
  assert.equal(historyEntries().length, 0);

  stopRuntime(first);
  fault.failUpdateAt = 0;
  await bootRuntime("reminder-side-effect-new");
  await new Promise((resolve) => setTimeout(resolve, 850));

  assert.equal(fixture.build().status, "already-resolved");
  assert.deepEqual(
    pendingSpellZoneTriggerActivations(scene.items).map((entry) => entry.id),
    [],
  );
  assert.equal(historyEntries().length, 1);
});

test("projection control — a fresh reconciler rebuilds a missing visual from persisted desired state", async () => {
  await bootRuntime("projection-only");
  const recoveryBefore = clone(scene.metadata[RECOVERY_KEY]);
  assert.equal(recoveryBefore, undefined);
  const canonical = [{ id: "owner-1", visualId: "visual-1", label: "Prono" }];
  let visuals = [];
  const result = await reconcileOwnedSceneItems({
    desired: canonical,
    readItems: async () => clone(visuals),
    identityOfDesired: (entry) => entry.visualId,
    identityOfItem: (entry) => entry.id,
    isCompatible: (existing, desired) => existing.label === desired.label,
    buildItem: (desired) => ({ id: desired.visualId, label: desired.label }),
    addItems: async (items) => { visuals.push(...clone(items)); },
    updateItems: async () => {},
    deleteItems: async (ids) => {
      const removed = new Set(ids);
      visuals = visuals.filter((entry) => !removed.has(entry.id));
    },
    isCurrent: () => true,
  });

  assert.equal(result.outcome, "converged");
  assert.deepEqual(visuals, [{ id: "visual-1", label: "Prono" }]);
  assert.deepEqual(scene.metadata[RECOVERY_KEY], recoveryBefore);
});

test("R1 — abrupt background termination immediately after canonical SDK write", async () => {
  const first = await bootRuntime("crash-at-commit");
  fault.afterUpdate = () => { fault.afterUpdate = null; stopRuntime(first); };
  await first.background.runEffectsMutation(addConditionOperation(), { commandId: "crash-at-commit", transport: "background" }).catch(() => {});
  assert.equal(pendingRecovery()[0].phase, "PREPARED");
  assert.equal(historyEntries().length, 0);
  const second = await bootRuntime("recover-at-commit");
  assert.equal(historyEntries().length, 1); assert.equal(pendingRecovery().length, 0);
  const undone = await second.background.undoEffectsMutation(historyEntries()[0], { transport: "background" });
  assert.equal(undone.status, "applied"); assert.deepEqual(conditionIds(), []);
});

test("persistence — envelope write failure prevents canonical commit", async () => {
  const runtime = await bootRuntime("envelope-fail");
  fault.failRecoveryPhase = "PREPARED";
  const result = await runtime.client.runEffectsMutation(addConditionOperation(), { commandId: "envelope-fail" });
  assert.equal(result.status, "failed"); assert.equal(result.committed, false);
  assert.equal(fault.updateCalls, 0); assert.equal(historyEntries().length, 0); assert.equal(pendingRecovery().length, 0);
});

test("persistence — failed phase update after commit recovers by read-back", async () => {
  const first = await bootRuntime("phase-fail");
  fault.failRecoveryPhase = "CANONICAL_COMMITTED";
  const result = await first.client.runEffectsMutation(addConditionOperation(), { commandId: "phase-fail" });
  assert.equal(result.committed, true); assert.equal(result.historyPending, true);
  assert.equal(pendingRecovery()[0].phase, "PREPARED");
  stopRuntime(first); await bootRuntime("phase-recover");
  assert.equal(fault.updateCalls, 1); assert.equal(historyEntries().length, 1); assert.equal(pendingRecovery().length, 0);
});

test("R3/R4 — side effect applied without progress marker survives three cold restarts", async () => {
  let runtime = await bootRuntime("progress-old");
  fault.failRecoveryPhase = "SIDE_EFFECTS_PENDING";
  const commandId = "physical-cold-restarts";
  const result = await runtime.client.runEffectsMutation(addConditionOperation(), { commandId, sideEffects: [
    { type: "token:teleport", targetId: "target", position: { x: 300, y: 300 }, skipAnimation: true },
    { type: "token:teleport", targetId: "secondary", position: { x: 400, y: 400 }, skipAnimation: true },
  ] });
  assert.equal(result.historyPending, true); assert.equal(fault.updateCalls, 2);
  assert.deepEqual(pendingRecovery()[0].completedSideEffects, []);
  for (let i = 0; i < 3; i++) {
    if (i === 0) fault.failRecoveryPhase = "SIDE_EFFECTS_PENDING";
    stopRuntime(runtime); runtime = await bootRuntime(`progress-new-${i}`);
    if (i === 0) {
      assert.equal(historyEntries().length, 0); assert.equal(pendingRecovery().length, 1);
      assert.equal(fault.updateCalls, 2); // interrupted during recovery, A still not replayed
      continue;
    }
    assert.equal(historyEntries().length, 1); assert.equal(pendingRecovery().length, 0);
    assert.equal(fault.updateCalls, 3); // canonical, A, B: no replay of A
  }
});

test("R10 — cleanup failure leaves COMPLETE until a later bootstrap deletes only recovery", async () => {
  const first = await bootRuntime("cleanup-old"); fault.failRecoveryCleanup = true;
  await first.client.runEffectsMutation(addConditionOperation(), { commandId: "cleanup-fail" });
  assert.equal(historyEntries().length, 1); assert.equal(pendingRecovery()[0].phase, "COMPLETE");
  const attempts = fault.historyWriteAttempts;
  stopRuntime(first); await bootRuntime("cleanup-new");
  assert.equal(pendingRecovery().length, 0); assert.equal(historyEntries().length, 1);
  assert.equal(fault.historyWriteAttempts, attempts);
});

test("R4 — restart again while History is unavailable, then converge", async () => {
  let runtime = await bootRuntime("owner-unavailable-0"); fault.failHistoryWrites = true;
  await runtime.client.runEffectsMutation(addConditionOperation(), { commandId: "owner-unavailable" });
  for (let i = 1; i <= 2; i++) {
    stopRuntime(runtime); runtime = await bootRuntime(`owner-unavailable-${i}`);
    assert.equal(historyEntries().length, 0); assert.equal(pendingRecovery().length, 1);
    const retry = await runtime.client.runEffectsMutation(addConditionOperation(), { commandId: "owner-unavailable" });
    assert.equal(retry.committed, true); assert.equal(fault.updateCalls, 1);
  }
  stopRuntime(runtime); fault.failHistoryWrites = false; await bootRuntime("owner-available");
  assert.equal(historyEntries().length, 1); assert.equal(pendingRecovery().length, 0); assert.equal(fault.updateCalls, 1);
});

test("R8 — pending scene A never writes scene B and recovers on returning to A", async () => {
  const first = await bootRuntime("scene-A"); fault.failHistoryWrites = true;
  await first.client.runEffectsMutation(addConditionOperation(), { commandId: "scene-A-command" });
  stopRuntime(first);
  const savedA = clone(scene);
  resetPersistentScene();
  const second = await bootRuntime("scene-B");
  assert.deepEqual(conditionIds(), []); assert.equal(historyEntries().length, 0); assert.equal(pendingRecovery().length, 0);
  stopRuntime(second); Object.assign(scene, savedA); fault.failHistoryWrites = false;
  await bootRuntime("scene-A-return");
  assert.deepEqual(conditionIds(), ["arch05a-condition"]); assert.equal(historyEntries().length, 1); assert.equal(pendingRecovery().length, 0);
});

test("R9 — wrong-scene envelope is preserved without applying its side effects", async () => {
  const first = await bootRuntime("foreign-old"); fault.failHistoryWrites = true;
  await first.client.runEffectsMutation(addConditionOperation(), { commandId: "foreign" });
  stopRuntime(first); fault.failHistoryWrites = false;
  scene.metadata[RECOVERY_KEY].records.foreign.scopeId = "another-scene";
  const saved = clone(scene.metadata[RECOVERY_KEY]);
  await bootRuntime("foreign-new");
  assert.deepEqual(scene.metadata[RECOVERY_KEY], saved); assert.equal(historyEntries().length, 0);
});

test("concurrency — two records, same-command retry and a new mutation share the Effects lane", async () => {
  const first = await bootRuntime("concurrent-old"); fault.failHistoryWrites = true;
  await Promise.all([
    first.client.runEffectsMutation(addConditionOperation("one", "target"), { commandId: "one" }),
    first.client.runEffectsMutation(addConditionOperation("two", "secondary"), { commandId: "two" }),
  ]);
  assert.equal(pendingRecovery().length, 2); stopRuntime(first); fault.failHistoryWrites = false;
  const second = await bootRuntime("concurrent-new");
  await Promise.all([
    second.client.runEffectsMutation(addConditionOperation("one", "target"), { commandId: "one" }),
    second.client.runEffectsMutation(addConditionOperation("three", "caster"), { commandId: "three" }),
  ]);
  assert.equal(historyEntries().length, 3); assert.equal(fault.updateCalls, 3); assert.equal(pendingRecovery().length, 0);
});

test("conflict — recovery never overwrites a newer incompatible physical position", async () => {
  const first = await bootRuntime("conflict-old"); fault.failUpdateAt = 2;
  await first.client.runEffectsMutation(addConditionOperation(), { commandId: "physical-conflict", sideEffects: [
    { type: "token:teleport", targetId: "target", position: { x: 300, y: 300 }, skipAnimation: true },
  ] });
  stopRuntime(first); fault.failUpdateAt = 0; item("target").position = { x: 900, y: 900 };
  await bootRuntime("conflict-new");
  assert.deepEqual(item("target").position, { x: 900, y: 900 });
  assert.equal(pendingRecovery().length, 1); assert.equal(historyEntries().length, 0);
});

test("manual completion — already applied physical result is accepted without duplicate write", async () => {
  const first = await bootRuntime("manual-old"); fault.failUpdateAt = 2;
  await first.client.runEffectsMutation(addConditionOperation(), { commandId: "manual", sideEffects: [
    { type: "token:teleport", targetId: "target", position: { x: 300, y: 300 }, skipAnimation: true },
  ] });
  stopRuntime(first); fault.failUpdateAt = 0; item("target").position = { x: 300, y: 300 };
  const writes = fault.updateCalls; await bootRuntime("manual-new");
  assert.equal(fault.updateCalls, writes); assert.equal(historyEntries().length, 1); assert.equal(pendingRecovery().length, 0);
});

test("budget — oversized immutable before/after is rejected without truncation or commit", async () => {
  const first = await bootRuntime("budget");
  item("target").metadata[META_KEY].large = "x".repeat(140000);
  const result = await first.client.runEffectsMutation(addConditionOperation(), {
    commandId: "budget", metadataPatches: [{ id: "target", fields: { large: { value: "after" } } }],
  });
  assert.equal(result.status, "failed"); assert.equal(result.committed, false); assert.equal(fault.updateCalls, 0);
  assert.equal(item("target").metadata[META_KEY].large.length, 140000); assert.equal(pendingRecovery().length, 0);
});

test("budget — sixteen pending records are retained and the seventeenth cannot commit", async () => {
  const runtime = await bootRuntime("record-cap"); fault.failHistoryWrites = true;
  for (let index = 0; index < 16; index++) {
    const result = await runtime.background.runEffectsMutation(addConditionOperation(`cap-${index}`), { commandId: `cap-${index}`, transport: "background" });
    assert.equal(result.committed, true);
  }
  assert.equal(pendingRecovery().length, 16);
  const writes = fault.updateCalls;
  const result = await runtime.background.runEffectsMutation(addConditionOperation("cap-17"), { commandId: "cap-17", transport: "background" });
  assert.equal(result.status, "failed"); assert.equal(fault.updateCalls, writes); assert.equal(pendingRecovery().length, 16);
});

test("serialization — durable envelope contains no runtime-local epoch or warning scope", async () => {
  const runtime = await bootRuntime("serializable"); fault.failHistoryWrites = true;
  await runtime.client.runEffectsMutation(addConditionOperation(), { commandId: "serializable", history: {
    payload: { replay: { warning: { sceneEpoch: 500, warningRuntimeScope: "old-runtime" } } },
  } });
  const serialized = JSON.stringify(scene.metadata[RECOVERY_KEY]);
  assert.doesNotMatch(serialized, /"sceneEpoch"|"sceneIdentity"|"warningRuntimeScope"/);
  assert.equal(pendingRecovery()[0].historyEntry.effectsMutation.recoveryScope.scopeId, scene.metadata[RECOVERY_KEY].scopeId);
});

test("concurrency — newer command cannot erase an ambiguous canonical commit baseline", async () => {
  const runtime = await bootRuntime("ambiguous-newer"); fault.failRecoveryPhase = "CANONICAL_COMMITTED";
  await runtime.background.runEffectsMutation(addConditionOperation("old"), { commandId: "old", transport: "background" });
  assert.equal(pendingRecovery()[0].phase, "PREPARED");
  await runtime.background.runEffectsMutation(addConditionOperation("new"), { commandId: "new", transport: "background" });
  assert.equal(historyEntries().length, 2); assert.deepEqual(conditionIds(), ["old", "new"]); assert.equal(pendingRecovery().length, 0);
});

test("R2 — bootstrap retry completes when History becomes available without another restart", async () => {
  const first = await bootRuntime("resume-retry-old"); fault.failHistoryWrites = true;
  await first.client.runEffectsMutation(addConditionOperation(), { commandId: "resume-retry" });
  stopRuntime(first); await bootRuntime("resume-retry-new");
  assert.equal(historyEntries().length, 0); assert.equal(pendingRecovery().length, 1);
  fault.failHistoryWrites = false;
  assert.equal(await eventually(() => historyEntries().length === 1 && pendingRecovery().length === 0), true);
  assert.equal(fault.updateCalls, 1);
});

test("retention — completed receipts are bounded and the latest ACK remains deduplicated", async () => {
  const runtime = await bootRuntime("receipt-retention");
  for (let index = 0; index < 130; index++) {
    const result = await runtime.background.runEffectsMutation([
      { type: "hp:set", updates: [{ itemId: "target", hp: index % 2 ? 10 : 9, hpMax: 10 }] },
    ], { commandId: `receipt-${index}`, transport: "background" });
    assert.equal(result.status, "applied");
  }
  assert.equal(scene.metadata[RECOVERY_KEY].receipts.length, 128); assert.equal(pendingRecovery().length, 0);
  const writes = fault.updateCalls;
  const duplicate = await runtime.background.runEffectsMutation([
    { type: "hp:set", updates: [{ itemId: "target", hp: 10, hpMax: 10 }] },
  ], { commandId: "receipt-129", transport: "background" });
  assert.equal(duplicate.status, "applied"); assert.equal(fault.updateCalls, writes);
  assert.equal(duplicate.historyEntry.id, "effects-history:receipt-129");
});

test("room scope — saved scene does not recover another room's records or block new work", async () => {
  const first = await bootRuntime("room-old"); fault.failHistoryWrites = true;
  await first.client.runEffectsMutation(addConditionOperation("old-room"), { commandId: "old-room" });
  stopRuntime(first); fault.failHistoryWrites = false; sdkStub.room.id = "different-room";
  const second = await bootRuntime("room-new");
  assert.equal(historyEntries().length, 0); assert.equal(pendingRecovery().length, 1);
  await second.client.runEffectsMutation(addConditionOperation("new-room"), { commandId: "new-room" });
  assert.equal(historyEntries().length, 1); assert.equal(pendingRecovery()[0].commandId, "old-room");
  stopRuntime(second); sdkStub.room.id = "arch05a-room";
  await bootRuntime("room-return");
  // Existing History ownership is room-scoped and intentionally drops the
  // other room's entries; only the original room's pending entry is recovered.
  assert.deepEqual(historyEntries().map((entry) => entry.id), ["effects-history:old-room"]);
  assert.equal(pendingRecovery().length, 0);
});

test("lost recovery write response — durable PREPARED is read back and no canonical commit starts", async () => {
  const first = await bootRuntime("lost-envelope"); fault.loseResponseKey = RECOVERY_KEY;
  const result = await first.client.runEffectsMutation(addConditionOperation(), { commandId: "lost-envelope" });
  assert.equal(result.committed, false); assert.equal(fault.updateCalls, 0); assert.equal(pendingRecovery().length, 1);
  stopRuntime(first); const second = await bootRuntime("lost-envelope-new");
  assert.equal(pendingRecovery().length, 0);
  await second.client.runEffectsMutation(addConditionOperation(), { commandId: "lost-envelope" });
  assert.equal(fault.updateCalls, 1); assert.equal(historyEntries().length, 1);
});

test("lost History write response — restart deduplicates the already durable entry", async () => {
  const first = await bootRuntime("lost-history"); fault.loseResponseKey = HISTORY_KEY;
  await first.client.runEffectsMutation(addConditionOperation(), { commandId: "lost-history" });
  assert.equal(historyEntries().length, 1);
  stopRuntime(first); const second = await bootRuntime("lost-history-new");
  await second.client.runEffectsMutation(addConditionOperation(), { commandId: "lost-history" });
  assert.equal(historyEntries().length, 1); assert.equal(fault.updateCalls, 1); assert.equal(pendingRecovery().length, 0);
});

test("History owner unavailable — canonical result remains recoverable by the next owner", async () => {
  const first = await bootRuntime("no-owner"); first.owner.unmountHistoryOwner();
  const result = await first.background.runEffectsMutation(addConditionOperation(), { commandId: "no-owner", transport: "background" });
  assert.equal(result.committed, true); assert.equal(result.historyPending, true);
  assert.equal(pendingRecovery().length, 1); assert.equal(historyEntries().length, 0);
  stopRuntime(first); await bootRuntime("owner-back");
  assert.equal(historyEntries().length, 1); assert.equal(pendingRecovery().length, 0); assert.equal(fault.updateCalls, 1);
});

test("concurrency — mutation and duplicate submitted during physical recovery stay on the existing lane", async () => {
  const runtime = await bootRuntime("in-flight-recovery"); fault.failUpdateAt = 2;
  const options = { commandId: "in-flight", transport: "background", sideEffects: [
    { type: "token:teleport", targetId: "target", position: { x: 300, y: 300 }, skipAnimation: true },
  ] };
  await runtime.background.runEffectsMutation(addConditionOperation("first"), options);
  assert.equal(pendingRecovery().length, 1); fault.failUpdateAt = 0;
  let entered, release;
  const started = new Promise((resolve) => { entered = resolve; });
  const gate = new Promise((resolve) => { release = resolve; });
  fault.afterUpdate = async () => { fault.afterUpdate = null; entered(); await gate; };
  const recovery = runtime.background.runEffectsMutation(addConditionOperation("first"), options);
  await started;
  const duplicate = runtime.background.runEffectsMutation(addConditionOperation("first"), options);
  const newer = runtime.background.runEffectsMutation(addConditionOperation("second"), { commandId: "in-flight-new", transport: "background" });
  assert.deepEqual(conditionIds(), ["first"]);
  release(); await Promise.all([recovery, duplicate, newer]);
  assert.deepEqual(conditionIds(), ["first", "second"]);
  assert.deepEqual(item("target").position, { x: 300, y: 300 });
  assert.equal(historyEntries().length, 2); assert.equal(pendingRecovery().length, 0);
  assert.equal(fault.updateCalls, 4); // canonical, rejected physical, physical recovery, new canonical
});

async function incidentFixture(targetId = "target") {
  const { getSpellActiveResolutionActions } = await import("../src/spellActiveResolutionRules.js");
  const effect = getSpellActiveResolutionActions("eyebite").find((a) => a.id === "eyebite-sickened").failureEffects[0];
  const instance = { ...clone(effect), id: "incident-sickened", condition: "Nauseato", active: true, sourceId: "caster", targetId, parentEffectId: "incident-spell", type: "spell", effectId: "eyebite-sickened" };
  item(targetId).metadata[META_KEY].conditions = { version: 1, instances: [instance] };
  item("caster").metadata[META_KEY][CONCENTRATION_KEY] = { eyebite: { instanceId: "incident-spell", name: "Sguardo penetrante" } };
  fault.immerDrafts = true;
  return instance;
}

test("incident T4 — SDK Immer draft retains non-cloneable saveReminder in shallow condition normalization", async () => {
  await incidentFixture();
  const { getConditionInstances } = await import("../src/conditions.js");
  produce(item("target"), (draft) => {
    const normalized = getConditionInstances(draft.metadata[META_KEY].conditions)[0];
    assert.equal(isDraft(normalized.saveReminder), false);
    assert.equal(isDraft(normalized.saveReminder.resolution), true);
    assert.throws(() => structuredClone(normalized), { name: "DataCloneError" });
    assert.throws(() => structuredClone(normalized.saveReminder.resolution.success.actions), { name: "DataCloneError" });
    const detached = getConditionInstances(current(draft).metadata[META_KEY].conditions)[0];
    assert.deepEqual(structuredClone(detached).saveReminder, item("target").metadata[META_KEY].conditions.instances[0].saveReminder);
  });
});

test("incident T1/T5/T6/T7 — end-turn reminder with real SDK drafts survives restart and Undo", async () => {
  const instance = await incidentFixture();
  const first = await bootRuntime("incident-reminder");
  const { buildEffectSaveReminderResolution } = await import("../src/reminderResolutionCore.js");
  const resolution = buildEffectSaveReminderResolution({ item: item("target"), instance, reminder: instance.saveReminder, dc: 15, activationId: "incident-end-turn", turnKey: "1:1:target" });
  assert.ok(resolution);
  const plan = buildReminderResolutionPlan({ notice: { activationId: "incident-end-turn", resolution, targets: [{ id: "target" }] }, items: clone(scene.items), outcome: "passed", sceneMetadata: clone(scene.metadata), now: 100 });
  fault.failHistoryWrites = true;
  const result = await runReminderCommand(first, plan, "incident-reminder");
  assert.equal(result.status, "applied", JSON.stringify(result.error));
  assert.equal(conditionIds().includes(instance.id), false);
  assert.equal(pendingRecovery().length, 1);
  const before = pendingRecovery()[0].historyEntry;
  assert.ok(JSON.stringify(before).includes("remove-effect"));
  stopRuntime(first); fault.failHistoryWrites = false;
  const second = await bootRuntime("incident-reminder-restart");
  assert.equal(historyEntries().length, 1); assert.equal(pendingRecovery().length, 0);
  const undo = await second.background.undoEffectsMutation(historyEntries()[0], { transport: "background" });
  assert.equal(undo.status, "applied");
  assert.deepEqual(item("target").metadata[META_KEY].conditions.instances.find((i) => i.id === instance.id).saveReminder, instance.saveReminder);
});

test("incident T2 — concentration removal uses real SDK drafts", async () => {
  await incidentFixture();
  const runtime = await bootRuntime("incident-concentration");
  const result = await runtime.client.runEffectsMutation([{ type: "concentration:break", casterIds: ["caster"], reference: "incident-spell" }], { kind: "concentration", commandId: "incident-concentration" });
  assert.equal(result.status, "applied", JSON.stringify(result.error));
  assert.deepEqual(item("caster").metadata[META_KEY][CONCENTRATION_KEY], {});
  assert.equal(conditionIds().includes("incident-sickened"), false);
  assert.equal(historyEntries().length, 1);
});

test("incident T3 — damage on concentrating caster with nested reminder generates concentration save", async () => {
  await incidentFixture("caster");
  const runtime = await bootRuntime("incident-damage");
  const result = await runtime.client.runEffectsMutation([{ type: "hp:set", updates: [{ itemId: "caster", hp: 5, hpMax: 10 }] }], { commandId: "incident-damage", kind: "hp" });
  assert.equal(result.status, "applied", JSON.stringify(result.error));
  const { broadcastConcentrationSaveWarnings } = await import("../src/concentrationSaveReminder.js");
  const sent = [];
  const warnings = await broadcastConcentrationSaveWarnings([{ itemId: "caster", damage: 5 }], { sceneEpoch: sceneEpoch.currentSceneEpoch(), warningRuntimeScope: "incident-runtime", causeHistoryEntryId: result.historyEntry.id, sendMessage: async (...args) => sent.push(args) });
  assert.equal(warnings.length, 1); assert.equal(sent[0][1].type, "show-concentration-warning");
  assert.equal(warnings[0].notice.resolution.outcomes.failed.actions[0].reference, "incident-spell");
});

test("incident T1 failed-save — end-turn failure keeps the effect and records the resolution", async () => {
  const instance = await incidentFixture();
  const runtime = await bootRuntime("incident-failed-save");
  const { buildEffectSaveReminderResolution } = await import("../src/reminderResolutionCore.js");
  const resolution = buildEffectSaveReminderResolution({ item: item("target"), instance, reminder: instance.saveReminder, dc: 15, activationId: "incident-failed-save", turnKey: "1:1:target" });
  const plan = buildReminderResolutionPlan({ notice: { activationId: "incident-failed-save", resolution, targets: [{ id: "target" }] }, items: clone(scene.items), outcome: "failed", sceneMetadata: clone(scene.metadata), now: 100 });
  const result = await runReminderCommand(runtime, plan, "incident-failed-save");
  assert.equal(result.status, "applied", JSON.stringify(result.error));
  assert.deepEqual(conditionIds(), [instance.id]);
  assert.equal(historyEntries().length, 1);
  assert.equal(pendingRecovery().length, 0);
});
