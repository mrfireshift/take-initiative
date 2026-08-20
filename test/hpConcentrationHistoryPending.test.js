import assert from "node:assert/strict";
import test, { mock } from "node:test";
import {
  createVersionedIndexedDB,
  versionedKeyRange,
} from "../test-support/fakeVersionedIndexedDb.js";

const previousIndexedDB = globalThis.indexedDB;
const previousKeyRange = globalThis.IDBKeyRange;
globalThis.indexedDB = createVersionedIndexedDB();
globalThis.IDBKeyRange = versionedKeyRange;

const ID = "com.thebigpicture.initiative";
const META_KEY = `${ID}/meta`;
const HISTORY_KEY = `${ID}/history`;
const CONCENTRATION_KEY = `${ID}/concentration`;
const CONCENTRATION_CHANNEL = `${ID}/concentration-warning`;
const TARGET_ID = "hp-cause-target";

const clone = (value) => (
  value === undefined ? undefined : structuredClone(value)
);

const sceneState = {
  ready: true,
  metadata: {},
  items: [],
  failHistoryWrite: false,
  failHistoryWriteAfter: false,
};
const readyListeners = new Set();
const broadcastListeners = new Map();

function currentItems(ids) {
  if (typeof ids === "function") return sceneState.items.filter(ids).map(clone);
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
  room: { id: "hp-cause-room", getMetadata: async () => ({}) },
  scene: {
    isReady: async () => sceneState.ready,
    onReadyChange(listener) {
      readyListeners.add(listener);
      return () => readyListeners.delete(listener);
    },
    getMetadata: async () => clone(sceneState.metadata),
    setMetadata: async (update) => {
      const isHistoryWrite = Object.prototype.hasOwnProperty.call(update || {}, HISTORY_KEY);
      if (isHistoryWrite && sceneState.failHistoryWrite) {
        throw new Error("simulated History owner rejection");
      }
      sceneState.metadata = { ...sceneState.metadata, ...clone(update) };
      if (isHistoryWrite && sceneState.failHistoryWriteAfter) {
        sceneState.failHistoryWriteAfter = false;
        throw new Error("simulated lost History response after write");
      }
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
    grid: { getDpi: async () => 1, getScale: async () => ({ parsed: { multiplier: 1, unit: "m" } }) },
    history: { canRedo: async () => false },
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
    buildLabel: () => ({ build: () => ({ id: "mock-label" }) }),
    buildImage: () => ({ build: () => ({ id: "mock-image" }) }),
    buildPath: () => ({ build: () => ({ id: "mock-path" }) }),
    buildText: () => ({ build: () => ({ id: "mock-text" }) }),
    buildShape: () => ({ build: () => ({ id: "mock-shape" }) }),
    Command: class Command {},
  },
});

const history = await import("../src/history.js");
const historyOwner = await import("../src/historyOwner.js");
const effects = await import("../src/effectsMutations.js");
const { broadcastConcentrationSaveWarnings } = await import("../src/concentrationSaveReminder.js");
const { currentSceneEpoch } = await import("../src/sceneEpoch.js");

function targetItem(hp = 40) {
  return {
    id: TARGET_ID,
    name: "Target",
    metadata: {
      [META_KEY]: {
        hp,
        hpMax: 40,
        conditions: [],
        [CONCENTRATION_KEY]: {
          web: { instanceId: "concentration-1", name: "Ragnatela" },
        },
      },
    },
  };
}

function resetScene() {
  sceneState.ready = true;
  sceneState.metadata = {};
  sceneState.items = [targetItem()];
  sceneState.failHistoryWrite = false;
  sceneState.failHistoryWriteAfter = false;
}

async function mountRuntime() {
  await history.flushPendingHistoryAppends().catch(() => {});
  effects.unmountEffectsMutationCoordinatorService();
  historyOwner.unmountHistoryOwner();
  resetScene();
  await historyOwner.mountHistoryOwner();
  await effects.mountEffectsMutationCoordinatorService();
}

function warningMessages() {
  const messages = [];
  const unsubscribe = sdkStub.broadcast.onMessage(CONCENTRATION_CHANNEL, (event) => {
    messages.push(event.data);
  });
  return { messages, unsubscribe };
}

async function updateHP(nextHP) {
  await sdkStub.scene.items.updateItems([TARGET_ID], (drafts) => {
    drafts[0].metadata[META_KEY].hp = nextHP;
  });
}

async function emitWarning(causeHistoryEntryId, eventId) {
  const [item] = await sdkStub.scene.items.getItems([TARGET_ID]);
  await broadcastConcentrationSaveWarnings([{
    itemId: TARGET_ID,
    damage: 10,
  }], {
    items: [item],
    eventId,
    causeHistoryEntryId,
    sceneEpoch: currentSceneEpoch(),
  });
}

async function applyInlineHP({ failure = "none" } = {}) {
  sceneState.failHistoryWrite = failure === "before";
  sceneState.failHistoryWriteAfter = failure === "after";
  let lastHPHistoryEntryId = "";
  let concentrationCauseHistoryEntryId = "";
  const statuses = [];

  await history.withItemMetaHistory({
    kind: "hp",
    label: "Danno inline",
    itemIds: [TARGET_ID],
    fields: ["hp", "hpMax", "conditions", CONCENTRATION_KEY],
    onHistoryStatus: ({ status, entry }) => {
      statuses.push(status);
      const entryId = String(entry?.id || "").trim();
      if (entryId) concentrationCauseHistoryEntryId = entryId;
    },
    onRecorded: (entry) => {
      lastHPHistoryEntryId = String(entry?.id || "").trim();
    },
  }, async () => updateHP(30));

  await emitWarning(concentrationCauseHistoryEntryId, "inline-hp-damage");
  return {
    causeHistoryEntryId: concentrationCauseHistoryEntryId,
    lastHPHistoryEntryId,
    statuses,
  };
}

async function applyQuickHP({ failure = "none" } = {}) {
  sceneState.failHistoryWrite = failure === "before";
  sceneState.failHistoryWriteAfter = failure === "after";
  let recordedEntry = null;
  let concentrationCauseHistoryEntryId = "";
  const statuses = [];

  await history.withItemMetaHistory({
    kind: "hp",
    label: "Danno Quick HP",
    itemIds: [TARGET_ID],
    fields: ["hp", "hpMax", "conditions"],
    onHistoryStatus: ({ status, entry }) => {
      statuses.push(status);
      const entryId = String(entry?.id || "").trim();
      if (entryId) concentrationCauseHistoryEntryId = entryId;
    },
    onRecorded: (entry) => { recordedEntry = entry; },
  }, async () => updateHP(30));

  await emitWarning(concentrationCauseHistoryEntryId, "quick-hp-damage");
  return {
    causeHistoryEntryId: concentrationCauseHistoryEntryId,
    recordedEntry,
    statuses,
  };
}

async function undoAndReadDismissal(entryId, messages) {
  const result = await history.undoHistoryThrough(entryId, {
    sceneEpoch: currentSceneEpoch(),
  });
  const dismissal = messages.find(
    (message) => message.type === "dismiss-concentration-warnings-by-history",
  );
  return { result, dismissal };
}

test.beforeEach(async () => {
  await mountRuntime();
});

test.after(async () => {
  await history.flushPendingHistoryAppends().catch(() => {});
  effects.unmountEffectsMutationCoordinatorService();
  historyOwner.unmountHistoryOwner();
  for (const listeners of broadcastListeners.values()) listeners.clear();
  readyListeners.clear();
  globalThis.indexedDB = previousIndexedDB;
  globalThis.IDBKeyRange = previousKeyRange;
});

test("HP inline normale usa l'ID History e Undo invia la dismissal causale", async () => {
  const { messages, unsubscribe } = warningMessages();
  const applied = await applyInlineHP();
  const warning = messages.find((message) => message.type === "show-concentration-warning");

  assert.equal(applied.statuses.at(-1), "committed");
  assert.ok(applied.causeHistoryEntryId);
  assert.equal(applied.lastHPHistoryEntryId, applied.causeHistoryEntryId);
  assert.equal(warning.warnings[0].notice.causeHistoryEntryId, applied.causeHistoryEntryId);

  const { result, dismissal } = await undoAndReadDismissal(
    applied.causeHistoryEntryId,
    messages,
  );
  assert.equal(result.status, "applied");
  assert.ok(dismissal.historyEntryIds.includes(applied.causeHistoryEntryId));
  unsubscribe();
});

test("HP inline pending mostra subito la causa, blocca Undo e la riusa dopo il retry", async () => {
  const { messages, unsubscribe } = warningMessages();
  const applied = await applyInlineHP({ failure: "before" });
  const warning = messages.find((message) => message.type === "show-concentration-warning");

  assert.equal(applied.statuses.at(-1), "pending");
  assert.ok(applied.causeHistoryEntryId);
  assert.equal(applied.lastHPHistoryEntryId, "");
  assert.equal(warning.warnings[0].notice.causeHistoryEntryId, applied.causeHistoryEntryId);
  assert.equal(messages.filter((message) => message.type === "show-concentration-warning").length, 1);

  const blocked = await history.undoHistoryThrough(applied.causeHistoryEntryId, {
    sceneEpoch: currentSceneEpoch(),
  });
  assert.equal(blocked.status, "rejected");
  assert.equal(blocked.result.reason, "history-pending");

  sceneState.failHistoryWrite = false;
  await history.flushPendingHistoryAppends();
  const entries = await history.getHistoryEntries();
  assert.equal(entries.filter((entry) => entry.id === applied.causeHistoryEntryId).length, 1);
  assert.equal(messages.filter((message) => message.type === "show-concentration-warning").length, 1);

  const { result, dismissal } = await undoAndReadDismissal(
    applied.causeHistoryEntryId,
    messages,
  );
  assert.equal(result.status, "applied");
  assert.ok(dismissal.historyEntryIds.includes(applied.causeHistoryEntryId));
  unsubscribe();
});

test("failure ambiguo inline conserva un solo warning, ID e entry dopo DUPLICATE", async () => {
  const { messages, unsubscribe } = warningMessages();
  const applied = await applyInlineHP({ failure: "after" });
  const warning = messages.find((message) => message.type === "show-concentration-warning");
  const beforeRetry = await history.getHistoryEntries();

  assert.equal(applied.statuses.at(-1), "pending");
  assert.ok(applied.causeHistoryEntryId);
  assert.equal(warning.warnings[0].notice.causeHistoryEntryId, applied.causeHistoryEntryId);
  assert.equal(beforeRetry.filter((entry) => entry.id === applied.causeHistoryEntryId).length, 1);

  await history.flushPendingHistoryAppends();
  const afterRetry = await history.getHistoryEntries();
  const shownWarnings = messages.filter((message) => message.type === "show-concentration-warning");
  assert.equal(afterRetry.filter((entry) => entry.id === applied.causeHistoryEntryId).length, 1);
  assert.equal(shownWarnings.length, 1);
  assert.equal(shownWarnings[0].warnings[0].notice.activationId, warning.warnings[0].notice.activationId);
  unsubscribe();
});

test("Quick HP normale mantiene recordedEntry e usa lo stesso ID per il warning", async () => {
  const { messages, unsubscribe } = warningMessages();
  const applied = await applyQuickHP();
  const warning = messages.find((message) => message.type === "show-concentration-warning");

  assert.equal(applied.statuses.at(-1), "committed");
  assert.ok(applied.recordedEntry?.id);
  assert.equal(applied.recordedEntry.id, applied.causeHistoryEntryId);
  assert.equal(warning.warnings[0].notice.causeHistoryEntryId, applied.causeHistoryEntryId);
  const { result, dismissal } = await undoAndReadDismissal(
    applied.causeHistoryEntryId,
    messages,
  );
  assert.equal(result.status, "applied");
  assert.ok(dismissal.historyEntryIds.includes(applied.causeHistoryEntryId));
  unsubscribe();
});

test("Quick HP pending non valorizza recordedEntry ma conserva la causa fino al retry", async () => {
  const { messages, unsubscribe } = warningMessages();
  const applied = await applyQuickHP({ failure: "before" });
  const warning = messages.find((message) => message.type === "show-concentration-warning");

  assert.equal(applied.statuses.at(-1), "pending");
  assert.equal(applied.recordedEntry, null);
  assert.ok(applied.causeHistoryEntryId);
  assert.equal(warning.warnings[0].notice.causeHistoryEntryId, applied.causeHistoryEntryId);

  const blocked = await history.undoHistoryThrough(applied.causeHistoryEntryId, {
    sceneEpoch: currentSceneEpoch(),
  });
  assert.equal(blocked.status, "rejected");
  assert.equal(blocked.result.reason, "history-pending");

  sceneState.failHistoryWrite = false;
  await history.flushPendingHistoryAppends();
  assert.equal(messages.filter((message) => message.type === "show-concentration-warning").length, 1);

  const { result, dismissal } = await undoAndReadDismissal(
    applied.causeHistoryEntryId,
    messages,
  );
  assert.equal(result.status, "applied");
  assert.ok(dismissal.historyEntryIds.includes(applied.causeHistoryEntryId));
  unsubscribe();
});
