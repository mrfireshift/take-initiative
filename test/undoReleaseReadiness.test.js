import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { mock } from "node:test";

const META_KEY = "com.thebigpicture.initiative/meta";
const clone = (value) => structuredClone(value);
const sceneState = {
  ready: true,
  metadata: {},
  items: [],
};
const readyListeners = new Set();
const broadcastListeners = new Map();

function currentItems(ids) {
  const wanted = Array.isArray(ids) ? new Set(ids) : null;
  return sceneState.items
    .filter((item) => !wanted || wanted.has(item?.id))
    .map(clone);
}

const sdkStub = {
  onReady: () => {},
  player: { getRole: async () => "GM" },
  room: { id: "release-room", getMetadata: async () => ({}) },
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
    buildLabel: (...args) => ({ type: "LABEL", args }),
    buildImage: (...args) => ({ type: "IMAGE", args }),
    buildPath: (...args) => ({ type: "PATH", args }),
    buildText: (...args) => ({ type: "TEXT", args }),
    buildShape: (...args) => ({ type: "SHAPE", args }),
    Command: class Command {},
  },
});

const effects = await import("../src/effectsMutations.js");
const history = await import("../src/history.js");
const historyOwner = await import("../src/historyOwner.js");
const { currentSceneEpoch } = await import("../src/sceneEpoch.js");
const {
  HISTORY_UNDO_OUTCOME,
  normalizeHistoryUndoResult,
} = await import("../src/historyUndoResultCore.js");

const historyModalSource = readFileSync(
  new URL("../src/history-modal.ts", import.meta.url),
  "utf8",
);
const quickHpSource = readFileSync(
  new URL("../src/quick-hp-modal.js", import.meta.url),
  "utf8",
);

function condition(id = "condition-1") {
  return {
    id,
    condition: "Prono",
    active: true,
    targetId: "token-1",
    expiry: { mode: "manual" },
  };
}

function setPostMutationState() {
  const value = condition();
  sceneState.items = [{
    id: "token-1",
    name: "Token",
    layer: "CHARACTER",
    metadata: {
      [META_KEY]: {
        conditions: { version: 1, instances: [value] },
      },
    },
  }];
  return value;
}

function undoEntry(value) {
  return {
    id: "history-undo-release",
    effectsMutation: {
      changes: [{
        id: "token-1",
        fields: { conditions: true },
        before: { conditions: [] },
        after: { conditions: [value] },
      }],
    },
  };
}

function compositeQuickHpUndoEntry(values) {
  return {
    id: "history-quick-hp-composite",
    effectsMutation: {
      changes: [{
        id: "token-1",
        fields: { conditions: true },
        before: { conditions: [] },
        after: { conditions: values },
        metadataFields: { hp: true, hpMax: true },
        beforeMetadata: {
          hp: { present: true, value: 12 },
          hpMax: { present: true, value: 12 },
        },
        afterMetadata: {
          hp: { present: true, value: 0 },
          hpMax: { present: true, value: 12 },
        },
      }],
    },
  };
}

function emitReady(value) {
  sceneState.ready = value === true;
  for (const listener of [...readyListeners]) listener(sceneState.ready);
}

test.before(async () => {
  await effects.mountEffectsMutationCoordinatorService();
});

test.after(() => {
  effects.unmountEffectsMutationCoordinatorService();
});

test("ready=true duplicato non invalida la scena e Undo produttivo ripristina davvero", async () => {
  const beforeEpoch = currentSceneEpoch();
  emitReady(true);
  assert.equal(currentSceneEpoch(), beforeEpoch);

  const value = setPostMutationState();
  const result = await effects.undoEffectsMutation(undoEntry(value), {
    transport: "background",
    sceneEpoch: currentSceneEpoch(),
    commandId: "undo-after-duplicate-ready",
  });

  assert.equal(result.status, "applied");
  assert.equal(result.committed, true);
  assert.deepEqual(sceneState.items[0].metadata[META_KEY].conditions, undefined);
  assert.equal(currentSceneEpoch(), beforeEpoch);
});

test("Undo composito Quick HP ripristina HP e tutte le condizioni a 0 PF in un commit", async () => {
  const values = [
    { id: "unconscious", condition: "Privo di sensi", active: true },
    { id: "prone", condition: "Prono", active: true },
    { id: "incapacitated", condition: "Incapacitato", active: true },
  ];
  sceneState.items = [{
    id: "token-1",
    name: "Token",
    layer: "CHARACTER",
    metadata: {
      [META_KEY]: {
        hp: 0,
        hpMax: 12,
        conditions: { version: 2, instances: values },
      },
    },
  }];

  const result = await effects.undoEffectsMutation(compositeQuickHpUndoEntry(values), {
    transport: "background",
    sceneEpoch: currentSceneEpoch(),
    commandId: "undo-quick-hp-composite",
  });

  assert.equal(result.status, "applied");
  assert.equal(result.committed, true);
  assert.equal(sceneState.items[0].metadata[META_KEY].hp, 12);
  assert.equal(sceneState.items[0].metadata[META_KEY].hpMax, 12);
  assert.equal(sceneState.items[0].metadata[META_KEY].conditions, undefined);
});

test("un Undo History composito rimuove la entry al primo commit", async () => {
  await historyOwner.mountHistoryOwner();
  const values = [
    { id: "unconscious-history", condition: "Privo di sensi", active: true },
    { id: "prone-history", condition: "Prono", active: true },
    { id: "incapacitated-history", condition: "Incapacitato", active: true },
  ];
  sceneState.items = [{
    id: "token-1",
    name: "Token",
    layer: "CHARACTER",
    metadata: {
      [META_KEY]: {
        hp: 0,
        hpMax: 12,
        conditions: { version: 2, instances: values },
      },
    },
  }];
  sceneState.metadata = {
    [`com.thebigpicture.initiative/history`]: {
      version: 1,
      roomId: "release-room",
      entries: [compositeQuickHpUndoEntry(values)],
    },
  };

  try {
    const result = await history.undoHistoryThrough("history-quick-hp-composite");

    assert.equal(result.status, "applied");
    assert.equal(result.result.committed, true);
    assert.equal(sceneState.items[0].metadata[META_KEY].hp, 12);
    assert.equal(sceneState.items[0].metadata[META_KEY].conditions, undefined);
    assert.deepEqual(
      sceneState.metadata["com.thebigpicture.initiative/history"].entries,
      [],
    );
  } finally {
    historyOwner.unmountHistoryOwner();
  }
});

test("il bootstrap History conserva una entry valida ma in conflitto", async () => {
  await historyOwner.mountHistoryOwner();
  const values = [
    { id: "unconscious-stale", condition: "Privo di sensi", active: true },
    { id: "prone-stale", condition: "Prono", active: true },
    { id: "incapacitated-stale", condition: "Incapacitato", active: true },
  ];
  sceneState.items = [{
    id: "token-1",
    name: "Token",
    layer: "CHARACTER",
    metadata: { [META_KEY]: { hp: 12, hpMax: 12 } },
  }];
  sceneState.metadata = {
    [`com.thebigpicture.initiative/history`]: {
      version: 1,
      roomId: "release-room",
      entries: [compositeQuickHpUndoEntry(values)],
    },
  };

  try {
    const cleanup = await history.pruneNonUndoableHistoryEntries({
      sceneEpoch: currentSceneEpoch(),
    });
    assert.deepEqual(cleanup.removedIds, []);
    assert.equal(
      sceneState.metadata["com.thebigpicture.initiative/history"].entries[0].id,
      "history-quick-hp-composite",
    );
    const readiness = await history.getHistoryUndoReadiness({
      sceneEpoch: currentSceneEpoch(),
    });
    assert.equal(readiness.status, "ready");
    assert.equal(readiness.rows[0].status, "conflict");
    assert.equal(readiness.rows[0].undoable, false);
  } finally {
    sceneState.metadata = {
      "com.thebigpicture.initiative/history": {
        version: 1,
        roomId: "release-room",
        entries: [],
      },
    };
    historyOwner.unmountHistoryOwner();
  }
});

test("true-false-true invalida il contesto solo al vero unload e recupera Undo", async () => {
  const previousEpoch = currentSceneEpoch();
  emitReady(false);
  assert.equal(currentSceneEpoch(), previousEpoch + 1);
  emitReady(false);
  assert.equal(currentSceneEpoch(), previousEpoch + 1);

  const stale = await effects.undoEffectsMutation(undoEntry(condition()), {
    transport: "background",
    sceneEpoch: previousEpoch,
    commandId: "undo-stale-after-unload",
  });
  assert.equal(stale.status, "rejected");
  assert.equal(stale.committed, false);
  assert.equal(sceneState.items.length, 1);

  emitReady(true);
  assert.equal(currentSceneEpoch(), previousEpoch + 1);
  const value = setPostMutationState();
  const recovered = await effects.undoEffectsMutation(undoEntry(value), {
    transport: "background",
    sceneEpoch: currentSceneEpoch(),
    commandId: "undo-after-recovery",
  });
  assert.equal(recovered.status, "applied");
  assert.equal(recovered.committed, true);
  assert.equal(sceneState.items[0].metadata[META_KEY].conditions, undefined);
});

test("history.js espone rejected/no-op invece di array vuoti ambigui", async () => {
  sceneState.metadata = {
    "com.thebigpicture.initiative/history": {
      version: 1,
      roomId: "release-room",
      entries: [],
    },
  };
  const empty = await history.undoHistoryThrough();
  assert.equal(empty.status, "noop");
  assert.equal(empty.result.committed, false);

  emitReady(false);
  const stale = await history.undoHistoryThrough();
  assert.equal(stale.status, "rejected");
  assert.equal(stale.result.reason, "stale-scene-epoch");
  assert.equal(stale.result.committed, false);
  emitReady(true);
});

test("normalizzazione Undo e contratti UI separano commit, no-op, stale, conflict e failed", () => {
  const cases = [
    [{ result: { status: "applied", committed: true } }, HISTORY_UNDO_OUTCOME.COMMITTED],
    [{ result: { status: "noop", committed: false } }, HISTORY_UNDO_OUTCOME.NOOP],
    [{ result: { status: "rejected", committed: false } }, HISTORY_UNDO_OUTCOME.REJECTED],
    [{ result: { status: "conflict", committed: false } }, HISTORY_UNDO_OUTCOME.CONFLICT],
    [{ result: { status: "recovery-required", committed: false } }, HISTORY_UNDO_OUTCOME.RECOVERY_REQUIRED],
    [{ result: { status: "failed", committed: false } }, HISTORY_UNDO_OUTCOME.FAILED],
  ];
  for (const [value, expected] of cases) assert.equal(normalizeHistoryUndoResult(value).outcome, expected);
  assert.match(historyModalSource, /undoInProgress \|\| undoCleanupInProgress \|\| undoResetInProgress \|\| selectedDepth < 1/);
  assert.match(historyModalSource, /normalizeHistoryUndoResult\(undone\)/);
  assert.match(historyModalSource, /HISTORY_UNDO_OUTCOME\.COMMITTED/);
  assert.match(historyModalSource, /HISTORY_UNDO_OUTCOME\.REJECTED/);
  assert.match(historyModalSource, /HISTORY_UNDO_OUTCOME\.NOOP/);
  assert.match(historyModalSource, /HISTORY_UNDO_OUTCOME\.CONFLICT/);
  assert.match(historyModalSource, /HISTORY_UNDO_OUTCOME\.FAILED/);
  assert.match(historyModalSource, /button\("Pulisci entry incomplete"\)/);
  assert.match(historyModalSource, /button\("Azzera Undo", "danger"\)/);
  assert.match(historyModalSource, /requestHistoryOwnerClear/);
  assert.match(historyModalSource, /ownerAttempts: 3/);
  assert.match(historyModalSource, /pruneNonUndoableHistoryEntries/);
  assert.match(historyModalSource, /waitForHistoryEntriesRemoved/);
  assert.match(quickHpSource, /normalizeHistoryUndoResult\(undone\)/);
  assert.match(quickHpSource, /outcome\.outcome !== HISTORY_UNDO_OUTCOME\.COMMITTED/);
  const quickUndo = quickHpSource.slice(
    quickHpSource.indexOf("async function undoLastOperation"),
    quickHpSource.indexOf("function closePopover"),
  );
  assert.ok(quickUndo.lastIndexOf("lastEntryId = \"\";") > quickUndo.indexOf("outcome.outcome !== HISTORY_UNDO_OUTCOME.COMMITTED"));
});

test("dispose rimuove il listener produttivo e non lascia duplicati", () => {
  assert.equal(readyListeners.size, 1);
  effects.unmountEffectsMutationCoordinatorService();
  assert.equal(readyListeners.size, 0);
});
