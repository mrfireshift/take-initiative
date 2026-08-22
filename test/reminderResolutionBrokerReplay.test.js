import assert from "node:assert/strict";
import test, { mock } from "node:test";
import {
  createVersionedIndexedDB,
  versionedKeyRange,
} from "../test-support/fakeVersionedIndexedDb.js";

const previousIndexedDB = globalThis.indexedDB;
const previousKeyRange = globalThis.IDBKeyRange;
const previousLocation = globalThis.location;
globalThis.indexedDB = createVersionedIndexedDB();
globalThis.IDBKeyRange = versionedKeyRange;
globalThis.location = { pathname: "/plugin.html" };

const ID = "com.thebigpicture.initiative";
const META_KEY = `${ID}/meta`;
const STATE_KEY = "com.thebigpicture.initiative/state";
const CONCENTRATION_KEY = `${ID}/concentration`;
const CONCENTRATION_CHANNEL = `${ID}/concentration-warning`;
const clone = (value) => (value === undefined ? undefined : structuredClone(value));

const sceneState = {
  ready: true,
  metadata: {},
  items: [],
};
const readyListeners = new Set();
const metadataListeners = new Set();
const itemChangeListeners = new Set();
const broadcastListeners = new Map();

function currentItems(ids) {
  if (typeof ids === "function") {
    return sceneState.items.filter(ids).map(clone);
  }
  const wanted = Array.isArray(ids) ? new Set(ids) : null;
  return sceneState.items
    .filter((item) => !wanted || wanted.has(item?.id))
    .map(clone);
}

function emitSceneItems() {
  for (const listener of itemChangeListeners) listener(clone(sceneState.items));
}

const sdkStub = {
  onReady: (callback) => {
    queueMicrotask(() => callback?.());
  },
  player: {
    getRole: async () => "GM",
    getId: async () => "gm-user",
    getName: async () => "GM",
    getSelection: async () => [],
    onChange: () => () => {},
  },
  room: { id: "reminder-broker-replay-room", getMetadata: async () => ({}) },
  scene: {
    isReady: async () => sceneState.ready,
    onReadyChange(listener) {
      readyListeners.add(listener);
      return () => readyListeners.delete(listener);
    },
    onMetadataChange(listener) {
      metadataListeners.add(listener);
      return () => metadataListeners.delete(listener);
    },
    getMetadata: async () => clone(sceneState.metadata),
    setMetadata: async (update) => {
      sceneState.metadata = { ...sceneState.metadata, ...clone(update) };
      for (const listener of metadataListeners) listener(clone(sceneState.metadata));
    },
    items: {
      getItems: async (ids) => currentItems(ids),
      onChange: (listener) => {
        itemChangeListeners.add(listener);
        return () => itemChangeListeners.delete(listener);
      },
      updateItems: async (ids, updater) => {
        const drafts = currentItems(ids);
        await updater(drafts);
        const byId = new Map(drafts.map((item) => [item.id, item]));
        sceneState.items = sceneState.items.map((item) => byId.get(item.id) || item);
        for (const listener of itemChangeListeners) listener(clone(sceneState.items));
      },
      deleteItems: async (ids) => {
        const wanted = new Set(ids || []);
        sceneState.items = sceneState.items.filter((item) => !wanted.has(item.id));
        for (const listener of itemChangeListeners) listener(clone(sceneState.items));
      },
      addItems: async (items) => {
        sceneState.items.push(...clone(items || []));
        for (const listener of itemChangeListeners) listener(clone(sceneState.items));
      },
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
        listener({ data: clone(data) });
      }
    },
  },
};

mock.module("@owlbear-rodeo/sdk", {
  exports: {
    default: sdkStub,
    buildLabel: (...args) => ({ type: "LABEL", args, build() { return { id: "label" }; } }),
    buildImage: (...args) => ({ type: "IMAGE", args, build() { return { id: "image" }; } }),
    buildPath: (...args) => ({ type: "PATH", args, build() { return { id: "path" }; } }),
    buildText: (...args) => ({ type: "TEXT", args, build() { return { id: "text" }; } }),
    buildShape: (...args) => ({ type: "SHAPE", args, build() { return { id: "shape" }; } }),
    Command: class Command {},
  },
});

const controllerDeliveries = [];
mock.module("../src/options/reminderProjectionBroadcast.js", {
  exports: {
    sendProjectedReminderPayload(channel, payload) {
      controllerDeliveries.push({ channel, payload: clone(payload) });
      return Promise.resolve({
        gm: Array.isArray(payload?.notices) ? payload.notices.length : 0,
        player: 0,
      });
    },
  },
});

const clientEffects = await import("../src/effectsMutations.js?reminder-client");
globalThis.location = { pathname: "/background.html" };
const backgroundEffects = await import("../src/effectsMutations.js?reminder-background");
globalThis.location = { pathname: "/plugin.html" };
const baseEffects = await import("../src/effectsMutations.js");

// The resolver runs in a client-like realm. Undo is imported by history.js
// through this same transport facade; the actual coordinator and broker live
// in the separately loaded background module above.
mock.module("../src/effectsMutations.js", {
  exports: {
    ...baseEffects,
    EFFECTS_MUTATION_STATUS: clientEffects.EFFECTS_MUTATION_STATUS,
    runEffectsMutation: clientEffects.runEffectsMutation,
    undoEffectsMutation: clientEffects.undoEffectsMutation,
    hasPendingEffectsHistory: clientEffects.hasPendingEffectsHistory,
    flushPendingEffectsHistory: clientEffects.flushPendingEffectsHistory,
  },
});

const history = await import("../src/history.js?reminder-broker-replay");
const historyOwner = await import("../src/historyOwner.js?reminder-broker-replay");
const { currentSceneEpoch } = await import("../src/sceneEpoch.js");
const reminderResolution = await import("../src/reminderResolution.js?reminder-broker-replay");
const {
  mountEffectSaveReminderController,
  unmountEffectSaveReminderController,
} = await import("../src/effectSaveReminderController.js?reminder-broker-replay");

function targetItem() {
  return {
    id: "target",
    name: "Target",
    metadata: {
      [META_KEY]: {
        hp: 20,
        hpMax: 20,
        conditions: [],
        spells: [{ instanceId: "conc-1", name: "Ragnatela" }],
        [CONCENTRATION_KEY]: {
          web: { instanceId: "conc-1", name: "Ragnatela" },
        },
      },
    },
  };
}

function damageReminderNotice() {
  return {
    activationId: "reminder-damage-broker",
    targets: [{ id: "target", name: "Target" }],
    resolution: {
      target: { id: "target" },
      damage: { dice: "1d6", type: "fuoco", onSave: "none" },
      outcomes: {
        passed: { actions: [] },
        failed: { actions: [] },
        immune: { actions: [] },
      },
      activation: {
        kind: "reminder",
        activationId: "reminder-damage-broker",
      },
    },
  };
}

function genericReminderItem() {
  return {
    id: "target",
    name: "Target",
    image: { url: "target.png" },
    metadata: {
      [META_KEY]: {
        hp: 20,
        hpMax: 20,
        conditions: [{
          id: "generic-effect-1",
          condition: "Effetto persistente",
          active: true,
          saveReminder: {
          ability: "wis",
            timing: "turn-start",
            success: "keep-effect",
            resolution: {
              success: "keep-effect",
              failure: "keep-effect",
              immune: "keep-effect",
            },
          },
        }],
      },
    },
  };
}

function secondGenericReminderItem() {
  const item = genericReminderItem();
  item.id = "other";
  item.name = "Other";
  item.metadata[META_KEY].conditions[0].id = "generic-effect-2";
  return item;
}

function mixedReminderItem() {
  const item = genericReminderItem();
  item.metadata[META_KEY][CONCENTRATION_KEY] = {
    web: { instanceId: "conc-1", name: "Ragnatela" },
  };
  return item;
}

function resetScene() {
  sceneState.metadata = {};
  sceneState.items = [targetItem()];
  reminderResolution.clearReminderResolutionQueue();
}

const settle = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForControllerDelivery(count) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (controllerDeliveries.length >= count) return;
    await settle(10);
  }
  assert.fail(`Controller delivery did not reach ${count}`);
}

async function historyEntries() {
  return history.getHistoryEntries();
}

async function materialize(entry) {
  const entryId = String(entry?.id || "");
  for (let attempt = 0; attempt < 200; attempt += 1) {
    backgroundEffects.flushPendingEffectsHistory(currentSceneEpoch());
    clientEffects.flushPendingEffectsHistory(currentSceneEpoch());
    const entries = await historyEntries();
    const found = entries.find((candidate) => candidate.id === entryId);
    if (
      found
      && !backgroundEffects.hasPendingEffectsHistory(currentSceneEpoch())
      && !clientEffects.hasPendingEffectsHistory(currentSceneEpoch())
    ) return found;
    await settle();
  }
  assert.fail(`History entry did not materialize: ${entryId}`);
}

async function createCauseWarning(messages, sceneEpoch) {
  const cause = await reminderResolution.resolveReminder({
    notice: damageReminderNotice(),
    outcome: "failed",
    damageRoll: 8,
    sceneEpoch,
  });
  assert.equal(cause.status, "applied");
  const causeEntry = await materialize(cause.mutation.historyEntry);
  const shown = messages.find((message) => message.type === "show-concentration-warning");
  assert.ok(shown);
  assert.equal(shown.sceneEpoch, sceneEpoch);
  return {
    cause,
    causeEntry,
    warning: shown.warnings[0],
  };
}

async function runReplayCombination(firstOutcome, secondOutcome) {
  resetScene();
  const sceneEpoch = currentSceneEpoch();
  const messages = [];
  const unsubscribe = sdkStub.broadcast.onMessage(CONCENTRATION_CHANNEL, (event) => {
    messages.push(event.data);
  });
  try {
    const { causeEntry, warning } = await createCauseWarning(messages, sceneEpoch);
    const first = await reminderResolution.resolveReminder({
      notice: warning.notice,
      outcome: firstOutcome,
      historyReplay: { type: "concentration-warning", warning },
      sceneEpoch,
    });
    assert.equal(first.status, "applied");
    const firstEntry = await materialize(first.mutation.historyEntry);
    const firstCommandId = first.mutation.commandId;

    const undoStart = messages.length;
    const undone = await history.undoHistoryThrough(firstEntry.id, { sceneEpoch });
    assert.equal(undone[0].id, firstEntry.id);
    const replayMessage = messages.slice(undoStart).find(
      (message) => message.type === "show-concentration-warning",
    );
    assert.ok(replayMessage);
    assert.equal(replayMessage.sceneEpoch, sceneEpoch);
    const replayWarning = replayMessage.warnings[0];
    assert.equal(replayWarning.notice.activationId, warning.notice.activationId);
    assert.equal(replayWarning.notice.causeHistoryEntryId, causeEntry.id);

    const second = await reminderResolution.resolveReminder({
      notice: replayWarning.notice,
      outcome: secondOutcome,
      historyReplay: { type: "concentration-warning", warning: replayWarning },
      sceneEpoch,
    });
    assert.equal(second.status, "applied");
    const secondEntry = await materialize(second.mutation.historyEntry);

    assert.notEqual(firstCommandId, second.mutation.commandId);
    assert.notEqual(firstEntry.id, secondEntry.id);
    assert.equal(first.plan.activationId, second.plan.activationId);
    assert.equal(
      secondEntry.payload.replay.warning.notice.causeHistoryEntryId,
      causeEntry.id,
    );
    assert.ok(
      sceneState.items[0].metadata[META_KEY].reminderResolutions?.[warning.notice.activationId],
    );
  } finally {
    unsubscribe();
  }
}

test.before(async () => {
  globalThis.location = { pathname: "/background.html" };
  await historyOwner.mountHistoryOwner();
  await backgroundEffects.mountEffectsMutationCoordinatorService();
  globalThis.location = { pathname: "/plugin.html" };
});

test.after(() => {
  backgroundEffects.unmountEffectsMutationCoordinatorService();
  historyOwner.unmountHistoryOwner();
  globalThis.indexedDB = previousIndexedDB;
  globalThis.IDBKeyRange = previousKeyRange;
  if (previousLocation === undefined) delete globalThis.location;
  else globalThis.location = previousLocation;
});

for (const [firstOutcome, secondOutcome] of [
  ["passed", "passed"],
  ["passed", "failed"],
  ["failed", "passed"],
  ["failed", "failed"],
]) {
  test(`broker/replay ${firstOutcome} -> Undo -> ${secondOutcome} crea un nuovo comando`, async () => {
    await runReplayCombination(firstOutcome, secondOutcome);
  });
}

test("un reminder generico risolto, annullato e rieseguito usa una nuova identity", async () => {
  resetScene();
  sceneState.items[0].metadata[META_KEY][CONCENTRATION_KEY] = {};
  const sceneEpoch = currentSceneEpoch();
  const first = await reminderResolution.resolveReminder({
    notice: damageReminderNotice(),
    outcome: "failed",
    damageRoll: 8,
    sceneEpoch,
  });
  const firstEntry = await materialize(first.mutation.historyEntry);
  const undo = await history.undoHistoryThrough(firstEntry.id, { sceneEpoch });
  assert.equal(undo[0].id, firstEntry.id);

  const second = await reminderResolution.resolveReminder({
    notice: damageReminderNotice(),
    outcome: "failed",
    damageRoll: 8,
    sceneEpoch,
  });
  const secondEntry = await materialize(second.mutation.historyEntry);

  assert.equal(first.status, "applied");
  assert.equal(second.status, "applied");
  assert.notEqual(first.mutation.commandId, second.mutation.commandId);
  assert.notEqual(firstEntry.id, secondEntry.id);
});

test("E2E generic reminder: resolve -> Undo -> stesso activationId -> nuovo rendering", { concurrency: false }, async () => {
  resetScene();
  sceneState.items = [];
  controllerDeliveries.length = 0;
  const sceneEpoch = currentSceneEpoch();
  const announced = new Set();
  const rendered = [];
  const renderHistory = [];

  function consumeControllerPayload(payload) {
    const rearmIds = new Set(
      (Array.isArray(payload?.rearmActivationIds) ? payload.rearmActivationIds : [])
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    );
    for (const notice of Array.isArray(payload?.notices) ? payload.notices : []) {
      const activationId = String(notice?.activationId || "").trim();
      if (!activationId) continue;
      if (rearmIds.has(activationId)) announced.delete(activationId);
      if (announced.has(activationId)) continue;
      announced.add(activationId);
      rendered.push(notice);
      renderHistory.push(notice);
    }
  }

  sceneState.metadata = {
    [STATE_KEY]: { order: ["target"], current: 0, round: 1 },
  };
  const controllerMounted = await mountEffectSaveReminderController();
  assert.equal(controllerMounted, true);
  await settle(120);
  sceneState.items = [{ ...genericReminderItem(), name: "Target live" }];
  emitSceneItems();
  await settle(120);
  await waitForControllerDelivery(1);
  consumeControllerPayload(controllerDeliveries[0].payload);
  assert.equal(rendered.length, 1);
  const activationId = rendered[0].activationId;
  const originalTurnKey = rendered[0].turnKey;
  const historyReplayFor = (notice) => ({
    type: "reminder",
    owner: "effect-save",
    activationId,
    targetId: "target",
    descriptor: {
      activationId,
      targetId: "target",
      instanceId: "generic-effect-1",
      notice: structuredClone(notice),
    },
  });

  const first = await reminderResolution.resolveReminder({
    notice: rendered[0],
    outcome: "failed",
    sceneEpoch,
    historyReplay: historyReplayFor(rendered[0]),
  });
  assert.equal(first.status, "applied");
  const firstEntry = await materialize(first.mutation.historyEntry);
  await sdkStub.scene.setMetadata({
    [STATE_KEY]: { order: ["target", "other"], current: 1, round: 2 },
  });
  rendered.length = 0;
  await settle(120);
  assert.equal(controllerDeliveries.length, 1);
  assert.ok(announced.has(activationId));

  const undone = await history.undoHistoryThrough(firstEntry.id, { sceneEpoch });
  assert.equal(undone[0].id, firstEntry.id);
  await waitForControllerDelivery(2);
  assert.deepEqual(controllerDeliveries[1].payload.rearmActivationIds, [activationId]);
  consumeControllerPayload(controllerDeliveries[1].payload);
  assert.equal(rendered.length, 1);
  assert.equal(rendered[0].activationId, activationId);
  assert.equal(rendered[0].turnKey, originalTurnKey);

  const second = await reminderResolution.resolveReminder({
    notice: rendered[0],
    outcome: "failed",
    sceneEpoch,
    historyReplay: historyReplayFor(rendered[0]),
  });
  assert.equal(second.status, "applied");
  const secondEntry = await materialize(second.mutation.historyEntry);
  rendered.length = 0;
  await settle(120);
  assert.equal(controllerDeliveries.length, 2);

  const undoneAgain = await history.undoHistoryThrough(secondEntry.id, { sceneEpoch });
  assert.equal(undoneAgain[0].id, secondEntry.id);
  await waitForControllerDelivery(3);
  assert.deepEqual(controllerDeliveries[2].payload.rearmActivationIds, [activationId]);
  consumeControllerPayload(controllerDeliveries[2].payload);

  assert.equal(rendered.length, 1);
  assert.equal(renderHistory.length, 3);
  assert.deepEqual(renderHistory.map((notice) => notice.activationId), [
    activationId,
    activationId,
    activationId,
  ]);
  unmountEffectSaveReminderController();
});

test("E2E generic chained: R1 old-turn e R2 current-turn tornano con le stesse activation", { concurrency: false }, async () => {
  resetScene();
  sceneState.items = [];
  controllerDeliveries.length = 0;
  const sceneEpoch = currentSceneEpoch();
  const announced = new Set();
  const rendered = [];

  function consumeControllerPayload(payload) {
    const rearmIds = new Set(
      (Array.isArray(payload?.rearmActivationIds) ? payload.rearmActivationIds : [])
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    );
    for (const notice of Array.isArray(payload?.notices) ? payload.notices : []) {
      const activationId = String(notice?.activationId || "").trim();
      if (!activationId) continue;
      if (rearmIds.has(activationId)) announced.delete(activationId);
      if (announced.has(activationId)) continue;
      announced.add(activationId);
      rendered.push(notice);
    }
  }

  async function consumeUntilRearm(startIndex, activationId) {
    for (let attempt = 0; attempt < 120; attempt += 1) {
      for (let index = startIndex; index < controllerDeliveries.length; index += 1) {
        const payload = controllerDeliveries[index].payload;
        consumeControllerPayload(payload);
        if ((payload?.rearmActivationIds || []).includes(activationId)) return;
      }
      await settle(10);
    }
    assert.fail(`Missing owner rearm for ${activationId}`);
  }

  try {
    sceneState.metadata = {
      [STATE_KEY]: { order: ["target"], current: 0, round: 1 },
    };
    assert.equal(await mountEffectSaveReminderController(), true);
    await settle(120);
    sceneState.items = [
      { ...genericReminderItem(), name: "Target live" },
      secondGenericReminderItem(),
    ];
    emitSceneItems();
    await settle(120);
    await waitForControllerDelivery(1);
    consumeControllerPayload(controllerDeliveries[0].payload);
    assert.equal(rendered.length, 1);

    const r1 = rendered[0];
    const r1Replay = {
      type: "reminder",
      owner: "effect-save",
      activationId: r1.activationId,
      targetId: "target",
      descriptor: {
        activationId: r1.activationId,
        targetId: "target",
        instanceId: "generic-effect-1",
        notice: structuredClone(r1),
      },
    };
    const first = await reminderResolution.resolveReminder({
      notice: r1,
      outcome: "failed",
      sceneEpoch,
      historyReplay: r1Replay,
    });
    assert.equal(first.status, "applied");
    const firstEntry = await materialize(first.mutation.historyEntry);

    await sdkStub.scene.setMetadata({
      [STATE_KEY]: { order: ["target", "other"], current: 1, round: 2 },
    });
    await settle(120);
    await waitForControllerDelivery(2);
    consumeControllerPayload(controllerDeliveries[1].payload);
    const r2 = rendered.find((notice) => notice.activationId !== r1.activationId);
    assert.ok(r2);
    assert.equal(r2.target.id, "other");
    const r2Replay = {
      type: "reminder",
      owner: "effect-save",
      activationId: r2.activationId,
      targetId: "other",
      descriptor: {
        activationId: r2.activationId,
        targetId: "other",
        instanceId: "generic-effect-2",
        notice: structuredClone(r2),
      },
    };
    const second = await reminderResolution.resolveReminder({
      notice: r2,
      outcome: "failed",
      sceneEpoch,
      historyReplay: r2Replay,
    });
    assert.equal(second.status, "applied");
    const secondEntry = await materialize(second.mutation.historyEntry);

    const afterR2Undo = controllerDeliveries.length;
    await history.undoHistoryThrough(secondEntry.id, { sceneEpoch });
    await consumeUntilRearm(afterR2Undo, r2.activationId);
    assert.equal(rendered.filter((notice) => notice.activationId === r2.activationId).length, 2);

    const afterR1Undo = controllerDeliveries.length;
    await history.undoHistoryThrough(firstEntry.id, { sceneEpoch });
    await consumeUntilRearm(afterR1Undo, r1.activationId);
    await settle(120);
    assert.equal(rendered.filter((notice) => notice.activationId === r1.activationId).length, 2);
    assert.equal(rendered.filter((notice) => notice.activationId === r2.activationId).length, 2);
    assert.equal(rendered.at(-1).activationId, r1.activationId);
  } finally {
    unmountEffectSaveReminderController();
  }
});

test("catena mista reale: Undo concentrazione e generic rearm restano separati", { concurrency: false }, async () => {
  resetScene();
  sceneState.items = [];
  controllerDeliveries.length = 0;
  const sceneEpoch = currentSceneEpoch();
  const concentrationMessages = [];
  const unsubscribeConcentration = sdkStub.broadcast.onMessage(
    CONCENTRATION_CHANNEL,
    (event) => concentrationMessages.push(event.data),
  );
  const announced = new Set();
  const rendered = [];

  function consumeControllerPayload(payload) {
    const rearmIds = new Set(
      (Array.isArray(payload?.rearmActivationIds) ? payload.rearmActivationIds : [])
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    );
    for (const notice of Array.isArray(payload?.notices) ? payload.notices : []) {
      const activationId = String(notice?.activationId || "").trim();
      if (!activationId) continue;
      if (rearmIds.has(activationId)) announced.delete(activationId);
      if (announced.has(activationId)) continue;
      announced.add(activationId);
      rendered.push(notice);
    }
  }

  try {
    sceneState.metadata = {
      [STATE_KEY]: { order: ["target"], current: 0, round: 1 },
    };
    assert.equal(await mountEffectSaveReminderController(), true);
    await settle(120);
    sceneState.items = [{ ...mixedReminderItem(), name: "Target live" }];
    emitSceneItems();
    await settle(120);
    await waitForControllerDelivery(1);
    consumeControllerPayload(controllerDeliveries[0].payload);
    assert.equal(rendered.length, 1);

    const genericNotice = rendered[0];
    const genericActivationId = genericNotice.activationId;
    const genericReplay = {
      type: "reminder",
      owner: "effect-save",
      activationId: genericActivationId,
      targetId: "target",
      descriptor: {
        activationId: genericActivationId,
        targetId: "target",
        instanceId: "generic-effect-1",
        notice: structuredClone(genericNotice),
      },
    };
    const generic = await reminderResolution.resolveReminder({
      notice: genericNotice,
      outcome: "failed",
      sceneEpoch,
      historyReplay: genericReplay,
    });
    assert.equal(generic.status, "applied");
    const genericEntry = await materialize(generic.mutation.historyEntry);

    const cause = await reminderResolution.resolveReminder({
      notice: damageReminderNotice(),
      outcome: "failed",
      damageRoll: 8,
      sceneEpoch,
    });
    assert.equal(cause.status, "applied");
    const causeEntry = await materialize(cause.mutation.historyEntry);
    const causeWarningMessage = concentrationMessages.find(
      (message) => message.type === "show-concentration-warning"
        && message.warnings?.some(
          (warning) => warning.notice?.causeHistoryEntryId === causeEntry.id,
        ),
    );
    assert.ok(causeWarningMessage);
    const causeWarning = causeWarningMessage.warnings.find(
      (warning) => warning.notice?.causeHistoryEntryId === causeEntry.id,
    );

    const resolution = await reminderResolution.resolveReminder({
      notice: causeWarning.notice,
      outcome: "failed",
      sceneEpoch,
      historyReplay: { type: "concentration-warning", warning: causeWarning },
    });
    assert.equal(resolution.status, "applied");
    const resolutionEntry = await materialize(resolution.mutation.historyEntry);

    const beforeConcentrationUndo = concentrationMessages.length;
    await history.undoHistoryThrough(resolutionEntry.id, { sceneEpoch });
    assert.ok(
      concentrationMessages.slice(beforeConcentrationUndo).some(
        (message) => message.type === "show-concentration-warning",
      ),
    );

    const beforeGenericUndo = concentrationMessages.length;
    const deliveryCountBeforeGenericUndo = controllerDeliveries.length;
    await history.undoHistoryThrough(genericEntry.id, { sceneEpoch });
    await waitForControllerDelivery(deliveryCountBeforeGenericUndo + 1);
    const rearmDelivery = controllerDeliveries.at(-1).payload;
    assert.ok(rearmDelivery.rearmActivationIds.includes(genericActivationId));
    consumeControllerPayload(rearmDelivery);
    assert.equal(rendered.at(-1).activationId, genericActivationId);

    await settle(120);
    assert.equal(rendered.filter((notice) => notice.activationId === genericActivationId).length, 2);
    assert.ok(
      concentrationMessages.slice(beforeGenericUndo).some(
        (message) => message.type === "dismiss-concentration-warnings-by-history"
          && message.historyEntryIds.includes(causeEntry.id),
      ),
    );
    assert.equal(
      concentrationMessages.slice(beforeGenericUndo)
        .filter((message) => message.type === "show-concentration-warning").length,
      0,
    );
  } finally {
    unsubscribeConcentration();
    unmountEffectSaveReminderController();
  }
});
