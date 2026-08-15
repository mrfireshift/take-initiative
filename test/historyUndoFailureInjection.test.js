import assert from "node:assert/strict";
import test, { mock } from "node:test";

const META_KEY = "com.thebigpicture.initiative/meta";
const HISTORY_KEY = "com.thebigpicture.initiative/history";
const clone = (value) => structuredClone(value);

const sceneState = {
  ready: true,
  items: [],
  metadata: {},
};
const failure = {
  update: "normal",
  add: "normal",
  delete: "normal",
  readBackFailures: 0,
  armReadBackFailure: false,
  gateFirstRead: null,
};
const readyListeners = new Set();
const broadcastListeners = new Map();
const trace = [];

function snapshot(value) {
  return value === undefined
    ? { present: false }
    : { present: true, value: clone(value) };
}

function currentItems(ids) {
  const wanted = Array.isArray(ids) ? new Set(ids) : null;
  return sceneState.items
    .filter((item) => !wanted || wanted.has(item?.id))
    .map(clone);
}

function replaceItems(drafts, ids = null) {
  const wanted = new Set(Array.isArray(ids) ? ids : drafts.map((item) => item?.id));
  const byId = new Map(drafts.map((item) => [item?.id, item]));
  sceneState.items = sceneState.items.map((item) => (
    wanted.has(item?.id) && byId.has(item.id) ? clone(byId.get(item.id)) : item
  ));
}

function emitReady(ready) {
  sceneState.ready = ready === true;
  for (const listener of [...readyListeners]) listener(sceneState.ready);
}

const sdkStub = {
  onReady() {},
  player: { getRole: async () => "GM" },
  room: { id: "undo-failure-room", getMetadata: async () => ({}) },
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
      getItems: async (ids) => {
        trace.push(`read:${Array.isArray(ids) ? ids.join(",") : "all"}`);
        if (failure.gateFirstRead) {
          const gate = failure.gateFirstRead;
          failure.gateFirstRead = null;
          await gate.promise;
        }
        if (failure.readBackFailures > 0) {
          failure.readBackFailures -= 1;
          throw new Error("injected read-back failure");
        }
        return currentItems(ids);
      },
      updateItems: async (ids, updater) => {
        trace.push(`update:${Array.isArray(ids) ? ids.join(",") : "all"}`);
        if (failure.update === "throw-before") {
          failure.update = "normal";
          throw new Error("injected update failure");
        }
        const drafts = currentItems(ids);
        if (failure.update === "partial-once") {
          await updater(drafts);
          if (drafts[0]) replaceItems([drafts[0]], [drafts[0].id]);
          failure.update = "normal";
          throw new Error("injected partial update failure");
        }
        if (failure.update === "throw-after") {
          await updater(drafts);
          replaceItems(drafts, ids);
          failure.update = "normal";
          throw new Error("injected post-write update failure");
        }
        await updater(drafts);
        replaceItems(drafts, ids);
        if (failure.armReadBackFailure) {
          failure.armReadBackFailure = false;
          failure.readBackFailures += 1;
        }
      },
      addItems: async (items) => {
        trace.push(`add:${items.map((item) => item?.id).join(",")}`);
        if (failure.add === "throw-before") {
          failure.add = "normal";
          throw new Error("injected add failure");
        }
        sceneState.items.push(...clone(items || []));
        if (failure.add === "throw-after") {
          failure.add = "normal";
          throw new Error("injected post-write add failure");
        }
      },
      deleteItems: async (ids) => {
        trace.push(`delete:${ids.join(",")}`);
        if (failure.delete === "throw-before") {
          failure.delete = "normal";
          throw new Error("injected delete failure");
        }
        const wanted = new Set(ids || []);
        sceneState.items = sceneState.items.filter((item) => !wanted.has(item?.id));
        if (failure.delete === "throw-after") {
          failure.delete = "normal";
          throw new Error("injected post-write delete failure");
        }
      },
    },
    grid: {
      getDpi: async () => 1,
      getScale: async () => ({ parsed: { multiplier: 1, unit: "m" } }),
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
const { createEffectsMutationBackgroundBroker } = await import("../src/effectsMutationBroker.js");
const { currentSceneEpoch, markSceneEpochReady } = await import("../src/sceneEpoch.js");
const { EFFECTS_MUTATION_STATUS } = await import("../src/effectsMutationCoordinator.js");

function item(id, hp, foreign = { untouched: true }) {
  return {
    id,
    name: id,
    layer: "CHARACTER",
    position: { x: 1, y: 1 },
    metadata: {
      [META_KEY]: { hp, hpMax: 20, foreign: clone(foreign) },
      "other/domain": { untouched: true },
    },
  };
}

function fieldEntry(id, before, after, entryId = `undo-${id}`) {
  return {
    id: entryId,
    label: entryId,
    changes: [{
      id,
      before: { hp: snapshot(before) },
      after: { hp: snapshot(after) },
    }],
  };
}

function lifecycleEntry(id, before, after, entryId) {
  return {
    id: entryId,
    label: entryId,
    changes: [{ id, sceneBefore: before, sceneAfter: after }],
  };
}

function reset({ items = [], entries = [] } = {}) {
  sceneState.items = clone(items);
  sceneState.metadata = {
    [HISTORY_KEY]: {
      version: 1,
      roomId: sdkStub.room.id,
      entries: clone(entries),
    },
  };
  failure.update = "normal";
  failure.add = "normal";
  failure.delete = "normal";
  failure.readBackFailures = 0;
  failure.armReadBackFailure = false;
  failure.gateFirstRead = null;
  trace.length = 0;
  if (!sceneState.ready) {
    emitReady(true);
  } else {
    markSceneEpochReady("undo-failure-test-reset");
  }
}

async function undoInBackground(entry, commandId) {
  return effects.undoEffectsMutation(entry, {
    transport: "background",
    sceneEpoch: currentSceneEpoch(),
    commandId,
  });
}

async function undoThroughHistory(entry, commandId) {
  sceneState.metadata[HISTORY_KEY].entries = [clone(entry)];
  return history.undoHistoryThrough(entry.id, {
    sceneEpoch: currentSceneEpoch(),
    commandId,
  });
}

test.before(async () => {
  await effects.mountEffectsMutationCoordinatorService();
  await historyOwner.mountHistoryOwner();
});

test.after(() => {
  historyOwner.unmountHistoryOwner();
  effects.unmountEffectsMutationCoordinatorService();
});

test("preflight conflict è atomico: zero scritture e History conservata", async () => {
  const entry = fieldEntry("token-1", 20, 5, "preflight-conflict");
  reset({ items: [item("token-1", 4)], entries: [entry] });

  const result = await undoThroughHistory(entry, "undo-preflight-conflict");

  assert.equal(result.status, EFFECTS_MUTATION_STATUS.CONFLICT);
  assert.equal(trace.some((event) => /^(update|add|delete):/u.test(event)), false);
  assert.equal(sceneState.metadata[HISTORY_KEY].entries.length, 1);
});

test("la readiness UI espone solo il suffisso realmente annullabile e non elimina i conflitti", async () => {
  const entry = fieldEntry("token-1", 20, 5, "ui-readiness");
  reset({ items: [item("token-1", 5)], entries: [entry] });

  const ready = await history.getHistoryUndoReadiness({ sceneEpoch: currentSceneEpoch() });
  assert.equal(ready.status, "ready");
  assert.equal(ready.rows.length, 1);
  assert.equal(ready.rows[0].undoable, true);

  sceneState.items[0].metadata[META_KEY].hp = 4;
  const conflicted = await history.getHistoryUndoReadiness({ sceneEpoch: currentSceneEpoch() });
  assert.equal(conflicted.status, "ready");
  assert.equal(conflicted.rows[0].status, "conflict");
  assert.equal(conflicted.rows[0].undoable, false);

  const cleanup = await history.pruneNonUndoableHistoryEntries({
    sceneEpoch: currentSceneEpoch(),
  });
  assert.deepEqual(cleanup.removedIds, []);
  assert.equal(sceneState.metadata[HISTORY_KEY].entries.length, 1);
});

test("successo commit completo: metadata field-scoped e rimozione History una volta", async () => {
  const entry = fieldEntry("token-1", 20, 5, "success");
  reset({
    items: [item("token-1", 5, { keep: { value: 7 } })],
    entries: [entry],
  });
  let historyWrites = 0;
  const originalSetMetadata = sdkStub.scene.setMetadata;
  sdkStub.scene.setMetadata = async (update) => {
    if (Object.prototype.hasOwnProperty.call(update, HISTORY_KEY)) historyWrites += 1;
    return originalSetMetadata(update);
  };

  try {
    const result = await undoThroughHistory(entry, "undo-success");
    assert.equal(result.status, "applied");
    assert.equal(result.result.committed, true);
    assert.equal(sceneState.items[0].metadata[META_KEY].hp, 20);
    assert.deepEqual(sceneState.items[0].metadata[META_KEY].foreign, { keep: { value: 7 } });
    assert.deepEqual(sceneState.items[0].metadata["other/domain"], { untouched: true });
    assert.equal(historyWrites, 1);
    assert.deepEqual(sceneState.metadata[HISTORY_KEY].entries, []);
  } finally {
    sdkStub.scene.setMetadata = originalSetMetadata;
  }
});

test("errore update prima della scrittura non rimuove History", async () => {
  const entry = fieldEntry("token-1", 20, 5, "update-failure");
  reset({ items: [item("token-1", 5)], entries: [entry] });
  failure.update = "throw-before";

  const result = await undoThroughHistory(entry, "undo-update-failure");

  assert.equal(result.status, "failed");
  assert.equal(result.result.committed, false);
  assert.equal(sceneState.items[0].metadata[META_KEY].hp, 5);
  assert.equal(sceneState.metadata[HISTORY_KEY].entries.length, 1);
});

test("errore add prima della scrittura conserva l'assenza del token e History", async () => {
  const restored = item("deleted-token", 5);
  const entry = lifecycleEntry("deleted-token", restored, null, "add-failure");
  reset({ items: [], entries: [entry] });
  failure.add = "throw-before";

  const result = await undoThroughHistory(entry, "undo-add-failure");

  assert.equal(result.status, "failed");
  assert.equal(sceneState.items.length, 0);
  assert.equal(sceneState.metadata[HISTORY_KEY].entries.length, 1);
});

test("errore delete prima della scrittura conserva il token e History", async () => {
  const created = item("created-token", 5);
  const entry = lifecycleEntry("created-token", null, created, "delete-failure");
  reset({ items: [created], entries: [entry] });
  failure.delete = "throw-before";

  const result = await undoThroughHistory(entry, "undo-delete-failure");

  assert.equal(result.status, "failed");
  assert.equal(sceneState.items.length, 1);
  assert.equal(sceneState.metadata[HISTORY_KEY].entries.length, 1);
});

test("read-back ambiguo dopo una scrittura resta applied solo con stato finale verificato", async () => {
  const entry = fieldEntry("token-1", 20, 5, "read-back");
  reset({ items: [item("token-1", 5)], entries: [entry] });
  failure.armReadBackFailure = true;

  const result = await undoThroughHistory(entry, "undo-read-back");

  assert.equal(result.status, "applied");
  assert.equal(result.result.committed, true);
  assert.equal(result.result.postCommitErrors.some((error) => error.phase === "read-back"), true);
  assert.equal(sceneState.items[0].metadata[META_KEY].hp, 20);
  assert.deepEqual(sceneState.metadata[HISTORY_KEY].entries, []);
});

test("read-back non verificabile è recoveryRequired e conserva History", async () => {
  const entry = fieldEntry("token-1", 20, 5, "read-back-ambiguous");
  reset({ items: [item("token-1", 5)], entries: [entry] });
  const originalUpdate = sdkStub.scene.items.updateItems;
  sdkStub.scene.items.updateItems = async (...args) => {
    await originalUpdate(...args);
    failure.readBackFailures += 2;
  };

  try {
    const result = await undoThroughHistory(entry, "undo-read-back-ambiguous");
    assert.equal(result.status, EFFECTS_MUTATION_STATUS.RECOVERY_REQUIRED);
    assert.equal(result.result.recoveryRequired, true);
    assert.equal(sceneState.metadata[HISTORY_KEY].entries.length, 1);
  } finally {
    sdkStub.scene.items.updateItems = originalUpdate;
  }
});

test("errore dopo una scrittura viene compensato e mantiene History", async () => {
  const entries = [
    fieldEntry("token-1", 20, 5, "partial-a"),
    fieldEntry("token-2", 20, 6, "partial-b"),
  ];
  reset({ items: [item("token-1", 5), item("token-2", 6)], entries });
  failure.update = "partial-once";

  const result = await undoInBackground(entries, "undo-compensated");

  assert.equal(result.status, "failed");
  assert.equal(result.commitResult.recovery.compensated, true);
  assert.equal(result.committed, false);
  assert.deepEqual(sceneState.items.map((entry) => entry.metadata[META_KEY].hp), [5, 6]);
});

test("compensazione incompleta restituisce recoveryRequired con diagnostica e non rimuove History", async () => {
  const entries = [
    fieldEntry("token-1", 20, 5, "recovery-a"),
    fieldEntry("token-2", 20, 6, "recovery-b"),
  ];
  reset({ items: [item("token-1", 5), item("token-2", 6)], entries });
  sceneState.metadata[HISTORY_KEY].entries = clone(entries);
  failure.update = "partial-once";
  const originalUpdate = sdkStub.scene.items.updateItems;
  let updateCalls = 0;
  sdkStub.scene.items.updateItems = async (...args) => {
    updateCalls += 1;
    if (updateCalls === 2) {
      failure.update = "throw-before";
    }
    return originalUpdate(...args);
  };

  try {
    const result = await history.undoHistoryThrough(entries[0].id, {
      sceneEpoch: currentSceneEpoch(),
      commandId: "undo-recovery-required",
    });
    assert.equal(result.status, EFFECTS_MUTATION_STATUS.RECOVERY_REQUIRED);
    assert.equal(result.result.recoveryRequired, true);
    assert.equal(result.result.commitResult.recovery.nonConvergent.some((entry) => entry.phase === "compensation"), true);
    assert.equal(sceneState.metadata[HISTORY_KEY].entries.length, 2);
  } finally {
    sdkStub.scene.items.updateItems = originalUpdate;
  }
});

test("cambio scena durante il preflight rifiuta il comando senza scritture", async () => {
  const entry = fieldEntry("token-1", 20, 5, "scene-change");
  reset({ items: [item("token-1", 5)], entries: [entry] });
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  failure.gateFirstRead = { promise: gate };
  const operation = undoInBackground(entry, "undo-scene-change");
  await new Promise((resolve) => setTimeout(resolve, 0));
  emitReady(false);
  release();

  const result = await operation;

  assert.equal(result.status, EFFECTS_MUTATION_STATUS.REJECTED);
  assert.equal(result.committed, false);
  assert.equal(trace.some((event) => /^(update|add|delete):/u.test(event)), false);
  assert.equal(sceneState.metadata[HISTORY_KEY].entries.length, 1);
  emitReady(true);
});

test("retry/risposta duplicata dello stesso comando Undo è idempotente", async () => {
  const entry = fieldEntry("token-1", 20, 5, "duplicate");
  reset({ items: [item("token-1", 5)], entries: [entry] });
  const context = await effects.getEffectsMutationSceneContext({ commandId: "undo-duplicate-context" });
  const broker = createEffectsMutationBackgroundBroker({
    executeApply: async () => ({ status: EFFECTS_MUTATION_STATUS.APPLIED }),
    executeUndo: (selected, command) => effects.undoEffectsMutation(selected, {
      ...command,
      transport: "background",
    }),
  });
  broker.setSceneIdentity(context.sceneIdentity);
  const message = {
    kind: "undo",
    requestId: "undo-duplicate-request-1",
    entry,
    options: {
      commandId: "undo-duplicate-command",
      sceneEpoch: currentSceneEpoch(),
      sceneIdentity: context.sceneIdentity,
    },
  };
  const first = await broker.handle(message);
  const writesAfterFirst = trace.filter((event) => event.startsWith("update:")).length;
  const second = await broker.handle({
    ...message,
    requestId: "undo-duplicate-request-2",
  });

  assert.equal(first.result.status, EFFECTS_MUTATION_STATUS.APPLIED);
  assert.equal(second.duplicate, true);
  assert.equal(second.result.status, EFFECTS_MUTATION_STATUS.APPLIED);
  assert.equal(trace.filter((event) => event.startsWith("update:")).length, writesAfterFirst);
  assert.equal(sceneState.items[0].metadata[META_KEY].hp, 20);
});

test("un epoch catturato da UI/shortcut non può eseguire dopo il cambio scena", async () => {
  const entry = fieldEntry("token-1", 20, 5, "stale-ui-command");
  reset({ items: [item("token-1", 5)], entries: [entry] });
  const capturedEpoch = currentSceneEpoch();
  emitReady(false);
  emitReady(true);

  const result = await history.undoHistoryThrough(entry.id, { sceneEpoch: capturedEpoch });

  assert.equal(result.status, "rejected");
  assert.equal(result.result.reason, "stale-scene-epoch");
  assert.equal(trace.some((event) => /^(update|add|delete):/u.test(event)), false);
  assert.equal(sceneState.items[0].metadata[META_KEY].hp, 5);
  assert.equal(sceneState.metadata[HISTORY_KEY].entries.length, 1);
});
