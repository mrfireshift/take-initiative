import assert from "node:assert/strict";
import test, { mock } from "node:test";
import {
  createVersionedIndexedDB,
  versionedKeyRange,
} from "../test-support/fakeVersionedIndexedDb.js";
import { combatEventFromHistoryEntry } from "../src/combatLogCore.js";

const previousIndexedDB = globalThis.indexedDB;
const previousKeyRange = globalThis.IDBKeyRange;
globalThis.indexedDB = createVersionedIndexedDB();
globalThis.IDBKeyRange = versionedKeyRange;

const ID = "com.thebigpicture.initiative";
const META_KEY = `${ID}/meta`;
const CONCENTRATION_KEY = `${ID}/concentration`;
const CONCENTRATION_CHANNEL = `${ID}/concentration-warning`;
const TARGET_ID = "target";

const clone = (value) => (
  value === undefined ? undefined : structuredClone(value)
);

const sceneState = {
  ready: true,
  metadata: {},
  items: [],
};
const readyListeners = new Set();
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

const sdkStub = {
  onReady: () => {},
  player: {
    getRole: async () => "GM",
    getId: async () => "gm-user",
    getName: async () => "GM",
    getSelection: async () => [],
    onChange: () => () => {},
  },
  room: { id: "concentration-undo-room", getMetadata: async () => ({}) },
  scene: {
    isReady: async () => sceneState.ready,
    onReadyChange(listener) {
      readyListeners.add(listener);
      return () => readyListeners.delete(listener);
    },
    getMetadata: async () => clone(sceneState.metadata),
    setMetadata: async (update) => {
      sceneState.metadata = { ...sceneState.metadata, ...clone(update) };
    },
    items: {
      getItems: async (ids) => currentItems(ids),
      onChange: () => () => {},
      updateItems: async (ids, updater) => {
        const drafts = currentItems(ids);
        await updater(drafts);
        const byId = new Map(drafts.map((item) => [item.id, item]));
        sceneState.items = sceneState.items.map((item) => byId.get(item.id) || item);
      },
      deleteItems: async (ids) => {
        const wanted = new Set(ids || []);
        sceneState.items = sceneState.items.filter((item) => !wanted.has(item.id));
      },
      addItems: async (items) => {
        sceneState.items.push(...clone(items || []));
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
    buildLabel: (...args) => ({
      type: "LABEL",
      args,
      plainText() { return this; },
      position() { return this; },
      width() { return this; },
      height() { return this; },
      padding() { return this; },
      fontSize() { return this; },
      fontWeight() { return this; },
      fillColor() { return this; },
      strokeColor() { return this; },
      strokeWidth() { return this; },
      backgroundColor() { return this; },
      backgroundOpacity() { return this; },
      cornerRadius() { return this; },
      pointerWidth() { return this; },
      pointerHeight() { return this; },
      attachedTo() { return this; },
      layer() { return this; },
      locked() { return this; },
      disableHit() { return this; },
      zIndex() { return this; },
      name() { return this; },
      metadata() { return this; },
      build() { return { id: "mock-label" }; },
    }),
    buildImage: (...args) => ({ type: "IMAGE", args, build() { return { id: "mock-image" }; } }),
    buildPath: (...args) => ({ type: "PATH", args, build() { return { id: "mock-path" }; } }),
    buildText: (...args) => ({ type: "TEXT", args, build() { return { id: "mock-text" }; } }),
    buildShape: (...args) => ({ type: "SHAPE", args, build() { return { id: "mock-shape" }; } }),
    Command: class Command {},
  },
});

const effects = await import("../src/effectsMutations.js");
const history = await import("../src/history.js");
const historyOwner = await import("../src/historyOwner.js");
const reminderResolution = await import("../src/reminderResolution.js");
const { currentSceneEpoch } = await import("../src/sceneEpoch.js");

function targetItem() {
  return {
    id: TARGET_ID,
    name: "Target",
    metadata: {
      [META_KEY]: {
        hp: 20,
        hpMax: 20,
        conditions: [],
        [CONCENTRATION_KEY]: {
          web: { instanceId: "conc-1", name: "Ragnatela" },
        },
      },
    },
  };
}

function damageReminderNotice() {
  return {
    activationId: "reminder-damage-a",
    targets: [{ id: TARGET_ID, name: "Target" }],
    resolution: {
      target: { id: TARGET_ID },
      damage: { dice: "1d6", type: "fuoco", onSave: "none" },
      outcomes: {
        passed: { actions: [] },
        failed: { actions: [] },
        immune: { actions: [] },
      },
      activation: {
        kind: "reminder",
        activationId: "reminder-damage-a",
      },
    },
  };
}

function resetScene() {
  sceneState.ready = true;
  sceneState.metadata = {};
  sceneState.items = [targetItem()];
}

async function mountRuntime() {
  historyOwner.unmountHistoryOwner();
  effects.unmountEffectsMutationCoordinatorService();
  resetScene();
  await historyOwner.mountHistoryOwner();
  await effects.mountEffectsMutationCoordinatorService();
}

async function waitForHistoryCount(count) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const entries = await history.getHistoryEntries();
    if (entries.length >= count) return entries;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail(`History did not reach ${count} entries`);
}

async function persistDeferredEntry(entry) {
  const commandId = String(entry?.effectsMutation?.commandId || `retry:${entry?.id || "entry"}`);
  await history.recordEffectsMutationHistory({
    command: {
      commandId,
      correlationId: commandId,
    },
    historyEntry: entry,
    sceneEpoch: currentSceneEpoch(),
  });
}

async function createCauseAndResolution(messages, resolutionOutcome = "failed") {
  const sceneEpoch = currentSceneEpoch();
  const first = await reminderResolution.resolveReminder({
    notice: damageReminderNotice(),
    outcome: "failed",
    damageRoll: 8,
    sceneEpoch,
  });
  assert.equal(first.status, "applied");
  assert.deepEqual(first.mutation.historyEntry.payload.hpChange, {
    before: 20,
    after: 12,
    hpMax: 20,
  });
  const firstCombatEvent = combatEventFromHistoryEntry(first.mutation.historyEntry);
  assert.deepEqual(firstCombatEvent.facets.hp.targets[0], {
    id: TARGET_ID,
    name: "Target",
    before: { hp: 20, hpMax: 20 },
    after: { hp: 12, hpMax: 20 },
    delta: -8,
    hpMaxDelta: 0,
  });

  const causeHistoryEntryId = first.mutation.historyEntry.id;
  await persistDeferredEntry(first.mutation.historyEntry);
  const initialWarningMessage = messages.find(
    (message) => message.type === "show-concentration-warning",
  );
  assert.ok(initialWarningMessage);
  assert.equal(initialWarningMessage.sceneEpoch, sceneEpoch);
  const warning = initialWarningMessage.warnings[0];
  assert.equal(warning.notice.causeHistoryEntryId, causeHistoryEntryId);

  const entriesAfterCause = await waitForHistoryCount(1);
  const causeEntry = entriesAfterCause.find((entry) => entry.id === causeHistoryEntryId);
  assert.ok(causeEntry);

  const second = await reminderResolution.resolveReminder({
    notice: warning.notice,
    outcome: resolutionOutcome,
    historyReplay: { type: "concentration-warning", warning },
    sceneEpoch,
  });
  assert.equal(second.status, "applied");
  const concentrationOutcomeLabel = {
    passed: "TS superato",
    failed: "TS fallito",
    immune: "TS immune",
  }[second.plan.outcome] || "Confermato";
  assert.equal(
    second.mutation.historyEntry.label,
    `Concentrazione: Ragnatela · ${concentrationOutcomeLabel}`,
  );
  await persistDeferredEntry(second.mutation.historyEntry);

  const entriesAfterResolution = await waitForHistoryCount(2);
  const resolutionEntry = entriesAfterResolution.find((entry) => entry.id !== causeHistoryEntryId);
  assert.ok(resolutionEntry);
  return { causeEntry, resolutionEntry, warning, sceneEpoch };
}

async function assertResolutionReplayCombination(firstOutcome, secondOutcome) {
  const messages = [];
  const unsubscribe = sdkStub.broadcast.onMessage(CONCENTRATION_CHANNEL, (event) => {
    messages.push(event.data);
  });
  try {
    const {
      causeEntry,
      resolutionEntry,
      warning,
      sceneEpoch,
    } = await createCauseAndResolution(messages, firstOutcome);
    const firstCommandId = resolutionEntry.effectsMutation.commandId;
    const firstConcentration = sceneState.items[0].metadata[META_KEY][CONCENTRATION_KEY];
    if (firstOutcome === "failed") {
      assert.deepEqual(firstConcentration, {});
    } else {
      assert.deepEqual(firstConcentration, {
        web: { instanceId: "conc-1", name: "Ragnatela" },
      });
    }

    const beforeUndo = messages.length;
    const undone = await history.undoHistoryThrough(resolutionEntry.id, { sceneEpoch });
    assert.equal(undone[0].id, resolutionEntry.id);
    assert.deepEqual(
      sceneState.items[0].metadata[META_KEY][CONCENTRATION_KEY],
      { web: { instanceId: "conc-1", name: "Ragnatela" } },
    );

    const replay = messages.slice(beforeUndo).find(
      (message) => message.type === "show-concentration-warning",
    );
    assert.ok(replay);
    assert.equal(replay.sceneEpoch, sceneEpoch);
    const replayWarning = replay.warnings[0];
    assert.equal(replayWarning.notice.activationId, warning.notice.activationId);
    assert.equal(replayWarning.notice.causeHistoryEntryId, causeEntry.id);

    const second = await reminderResolution.resolveReminder({
      notice: replayWarning.notice,
      outcome: secondOutcome,
      historyReplay: { type: "concentration-warning", warning: replayWarning },
      sceneEpoch,
    });

    assert.equal(second.status, "applied");
    assert.notEqual(second.mutation.historyEntry.id, resolutionEntry.id);
    assert.notEqual(second.mutation.commandId, firstCommandId);
    assert.match(
      second.mutation.commandId,
      new RegExp(`^reminder-resolution:${warning.notice.activationId}:`),
    );
    assert.equal(second.plan.activationId, warning.notice.activationId);
    assert.equal(
      second.mutation.historyEntry.payload.replay.warning.notice.causeHistoryEntryId,
      causeEntry.id,
    );

    const secondConcentration = sceneState.items[0].metadata[META_KEY][CONCENTRATION_KEY];
    if (secondOutcome === "failed") {
      assert.deepEqual(secondConcentration, {});
    } else {
      assert.deepEqual(secondConcentration, {
        web: { instanceId: "conc-1", name: "Ragnatela" },
      });
    }
    assert.ok(
      sceneState.items[0].metadata[META_KEY].reminderResolutions?.[warning.notice.activationId],
    );
  } finally {
    unsubscribe();
  }
}

test.beforeEach(async () => {
  await mountRuntime();
  reminderResolution.clearReminderResolutionQueue();
});

test.after(() => {
  effects.unmountEffectsMutationCoordinatorService();
  historyOwner.unmountHistoryOwner();
  globalThis.indexedDB = previousIndexedDB;
  globalThis.IDBKeyRange = previousKeyRange;
});

test("Undo della causa invia la dismissal con l'ID causale del warning", async () => {
  const messages = [];
  const unsubscribe = sdkStub.broadcast.onMessage(CONCENTRATION_CHANNEL, (event) => {
    messages.push(event.data);
  });

  const first = await reminderResolution.resolveReminder({
    notice: damageReminderNotice(),
    outcome: "failed",
    damageRoll: 8,
    sceneEpoch: currentSceneEpoch(),
  });
  const causeHistoryEntryId = first.mutation.historyEntry.id;
  await persistDeferredEntry(first.mutation.historyEntry);
  await waitForHistoryCount(1);

  const beforeUndo = messages.length;
  await history.undoHistoryThrough(causeHistoryEntryId, {
    sceneEpoch: currentSceneEpoch(),
  });
  const undoMessages = messages.slice(beforeUndo);
  const dismissal = undoMessages.find(
    (message) => message.type === "dismiss-concentration-warnings-by-history",
  );

  assert.ok(dismissal);
  assert.ok(dismissal.historyEntryIds.includes(causeHistoryEntryId));
  unsubscribe();
});

test("Undo della sola resolution riproduce il warning se la causa resta presente", async () => {
  const messages = [];
  const unsubscribe = sdkStub.broadcast.onMessage(CONCENTRATION_CHANNEL, (event) => {
    messages.push(event.data);
  });
  const { causeEntry, resolutionEntry, warning } = await createCauseAndResolution(messages);

  const beforeUndo = messages.length;
  await history.undoHistoryThrough(resolutionEntry.id, {
    sceneEpoch: currentSceneEpoch(),
  });
  const undoMessages = messages.slice(beforeUndo);
  const replay = undoMessages.filter(
    (message) => message.type === "show-concentration-warning",
  );

  assert.equal(causeEntry.id, warning.notice.causeHistoryEntryId);
  assert.equal(replay.length, 1);
  assert.equal(
    replay[0].warnings[0].notice.causeHistoryEntryId,
    causeEntry.id,
  );
  unsubscribe();
});

test("il replay concentration usa l'identità background corrente dopo un remount", async () => {
  const messages = [];
  const unsubscribe = sdkStub.broadcast.onMessage(CONCENTRATION_CHANNEL, (event) => {
    messages.push(event.data);
  });
  try {
    const { resolutionEntry, warning } = await createCauseAndResolution(messages);
    const historicalScope = String(warning.warningRuntimeScope || "").trim();
    assert.ok(historicalScope);

    effects.unmountEffectsMutationCoordinatorService();
    await effects.mountEffectsMutationCoordinatorService();
    const currentScope = String(
      (await effects.getEffectsMutationSceneContext({ commandId: "scope-remount" }))
        ?.sceneIdentity || "",
    ).trim();
    assert.ok(currentScope);
    assert.notEqual(currentScope, historicalScope);

    const beforeUndo = messages.length;
    await history.undoHistoryThrough(resolutionEntry.id, {
      sceneEpoch: currentSceneEpoch(),
    });
    const replay = messages.slice(beforeUndo).find(
      (message) => message.type === "show-concentration-warning",
    );
    assert.ok(replay);
    assert.equal(replay.warnings[0].warningRuntimeScope, currentScope);
    assert.notEqual(replay.warnings[0].warningRuntimeScope, historicalScope);
  } finally {
    unsubscribe();
  }
});

for (const [damage, expectedDc] of [[8, 10], [30, 15]]) {
  test(`danno reale ${damage} produce il warning concentration con CD ${expectedDc}`, async () => {
    const messages = [];
    const unsubscribe = sdkStub.broadcast.onMessage(CONCENTRATION_CHANNEL, (event) => {
      messages.push(event.data);
    });
    try {
      if (damage === 30) {
        sceneState.items[0].metadata[META_KEY].hp = 30;
        sceneState.items[0].metadata[META_KEY].hpMax = 30;
      }
      const result = await reminderResolution.resolveReminder({
        notice: damageReminderNotice(),
        outcome: "failed",
        damageRoll: damage,
        sceneEpoch: currentSceneEpoch(),
      });
      assert.equal(result.status, "applied");
      const warningMessage = messages.find(
        (message) => message.type === "show-concentration-warning",
      );
      assert.ok(warningMessage);
      const warning = warningMessage.warnings[0];
      assert.equal(warning.damage, damage);
      assert.equal(warning.dc, expectedDc);
      assert.equal(
        warning.notice.causeHistoryEntryId,
        result.mutation.historyEntry.id,
      );
    } finally {
      unsubscribe();
    }
  });
}

test("Undo della causa e della resolution nello stesso batch non riproduce il warning", async () => {
  const messages = [];
  const unsubscribe = sdkStub.broadcast.onMessage(CONCENTRATION_CHANNEL, (event) => {
    messages.push(event.data);
  });
  const { causeEntry, resolutionEntry } = await createCauseAndResolution(messages);

  const beforeUndo = messages.length;
  await history.undoHistoryThrough(causeEntry.id, {
    sceneEpoch: currentSceneEpoch(),
  });
  const undoMessages = messages.slice(beforeUndo);
  const dismissal = undoMessages.find(
    (message) => message.type === "dismiss-concentration-warnings-by-history",
  );
  const replay = undoMessages.filter(
    (message) => message.type === "show-concentration-warning",
  );

  assert.ok(dismissal);
  assert.ok(dismissal.historyEntryIds.includes(causeEntry.id));
  assert.ok(dismissal.historyEntryIds.includes(resolutionEntry.id));
  assert.equal(replay.length, 0);
  unsubscribe();
});

for (const [firstOutcome, secondOutcome] of [
  ["passed", "passed"],
  ["passed", "failed"],
  ["failed", "passed"],
  ["failed", "failed"],
]) {
  test(`risoluzione concentrazione ${firstOutcome} -> Undo -> ${secondOutcome} usa un nuovo tentativo`, async () => {
    await assertResolutionReplayCombination(firstOutcome, secondOutcome);
  });
}
