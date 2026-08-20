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

const META_KEY = "com.thebigpicture.initiative/meta";
const clone = (value) => value === undefined ? undefined : structuredClone(value);

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
  player: { getRole: async () => "GM" },
  room: { id: "teleport-room", getMetadata: async () => ({}) },
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
const combatLog = await import("../src/combatLog.js");
const { currentSceneEpoch } = await import("../src/sceneEpoch.js");
const { normalizeHistoryUndoResult, HISTORY_UNDO_OUTCOME } = await import("../src/historyUndoResultCore.js");
const { decorateCompositeEffectsHistoryEntry } = await import("../src/effectsMutationCompositeHistoryCore.js");

function resetScene(initialToken = null) {
  sceneState.metadata = {};
  sceneState.items = initialToken ? [clone(initialToken)] : [];
}

test.before(async () => {
  await historyOwner.mountHistoryOwner();
  await history.mountMovementHistoryWatcher();
  await effects.mountEffectsMutationCoordinatorService();
});

test.after(() => {
  effects.unmountEffectsMutationCoordinatorService();
  historyOwner.unmountHistoryOwner();
  globalThis.indexedDB = previousIndexedDB;
  globalThis.IDBKeyRange = previousKeyRange;
});

test("Normal teleport undo: ripristina la posizione iniziale del caster senza conflitti", async () => {
  const origin = { x: 0, y: 0 };
  const destination = { x: 300, y: 300 };
  const casterToken = {
    id: "caster-1",
    name: "Mago",
    position: clone(origin),
    metadata: { [META_KEY]: { hp: 20, hpMax: 20 } },
  };
  resetScene(casterToken);

  const mutation = await effects.runEffectsMutation([], {
    kind: "spell",
    label: "Lancio incantesimo · Passo Velato",
    targetIds: ["caster-1"],
    sceneEpoch: currentSceneEpoch(),
    sideEffects: [{
      type: "token:teleport",
      targetId: "caster-1",
      position: destination,
      skipAnimation: true,
    }],
    payload: {
      causality: {
        source: "spell-area",
        spellId: "misty-step",
        spellName: "Passo Velato",
        casterId: "caster-1",
        casterName: "Mago",
        teleport: true,
        targets: [{ id: "caster-1", name: "Mago" }],
      },
    },
  });

  assert.equal(mutation.status, "applied");
  const itemsAfterCast = await sdkStub.scene.items.getItems(["caster-1"]);
  assert.deepEqual(itemsAfterCast[0].position, destination);

  const entries = await history.getHistoryEntries();
  assert.equal(entries.length, 1);

  const undone = await history.undoHistoryThrough(entries[0].id, {
    sceneEpoch: currentSceneEpoch(),
  });
  const outcome = normalizeHistoryUndoResult(undone);
  assert.equal(outcome.outcome, HISTORY_UNDO_OUTCOME.COMMITTED);

  const itemsAfterUndo = await sdkStub.scene.items.getItems(["caster-1"]);
  assert.deepEqual(itemsAfterUndo[0].position, origin);
  assert.equal(itemsAfterUndo[0].metadata[META_KEY].hp, 20);
});

test("Genuine conflict regression: se il token è stato mosso manualmente dopo il teleport, Undo viene bloccato", async () => {
  const origin = { x: 0, y: 0 };
  const destination = { x: 300, y: 300 };
  const casterToken = {
    id: "caster-conflict",
    name: "Mago Conflitto",
    position: clone(origin),
    metadata: { [META_KEY]: { hp: 20, hpMax: 20 } },
  };
  resetScene(casterToken);

  const mutation = await effects.runEffectsMutation([], {
    kind: "spell",
    label: "Lancio incantesimo · Passo Velato",
    targetIds: ["caster-conflict"],
    sceneEpoch: currentSceneEpoch(),
    sideEffects: [{
      type: "token:teleport",
      targetId: "caster-conflict",
      position: destination,
      skipAnimation: true,
    }],
  });
  assert.equal(mutation.status, "applied");

  // Movimento manuale successivo verso (450, 450)
  await sdkStub.scene.items.updateItems(["caster-conflict"], (drafts) => {
    drafts[0].position = { x: 450, y: 450 };
  });

  const entries = await history.getHistoryEntries();
  assert.equal(entries.length, 1);

  const undone = await history.undoHistoryThrough(entries[0].id, {
    sceneEpoch: currentSceneEpoch(),
  });
  const outcome = normalizeHistoryUndoResult(undone);
  assert.equal(outcome.outcome, HISTORY_UNDO_OUTCOME.CONFLICT);

  // La posizione non deve essere stata sovrascritta
  const itemsAfterFailedUndo = await sdkStub.scene.items.getItems(["caster-conflict"]);
  assert.deepEqual(itemsAfterFailedUndo[0].position, { x: 450, y: 450 });
});

test("Unrelated metadata regression: modifiche a HP successive al teleport non bloccano l'Undo della posizione", async () => {
  const origin = { x: 0, y: 0 };
  const destination = { x: 300, y: 300 };
  const casterToken = {
    id: "caster-hp-change",
    name: "Mago HP",
    position: clone(origin),
    metadata: { [META_KEY]: { hp: 20, hpMax: 20 } },
  };
  resetScene(casterToken);

  await effects.runEffectsMutation([], {
    kind: "spell",
    label: "Lancio incantesimo · Passo Velato",
    targetIds: ["caster-hp-change"],
    sceneEpoch: currentSceneEpoch(),
    sideEffects: [{
      type: "token:teleport",
      targetId: "caster-hp-change",
      position: destination,
      skipAnimation: true,
    }],
  });

  // Modifica HP indipendente: 20 -> 15 (subisce danno)
  await sdkStub.scene.items.updateItems(["caster-hp-change"], (drafts) => {
    drafts[0].metadata[META_KEY].hp = 15;
  });

  const entries = await history.getHistoryEntries();
  const undone = await history.undoHistoryThrough(entries[0].id, {
    sceneEpoch: currentSceneEpoch(),
  });
  const outcome = normalizeHistoryUndoResult(undone);
  assert.equal(outcome.outcome, HISTORY_UNDO_OUTCOME.COMMITTED);

  const itemsAfterUndo = await sdkStub.scene.items.getItems(["caster-hp-change"]);
  // La posizione torna all'origine
  assert.deepEqual(itemsAfterUndo[0].position, origin);
  // L'HP modificato successivamente RESTA a 15 (non viene sovrascritto dallo snapshot iniziale)
  assert.equal(itemsAfterUndo[0].metadata[META_KEY].hp, 15);
});

test("Combat Log integration: il Combat Log traccia l'evento di lancio e l'evento di Undo collegato", async () => {
  const origin = { x: 0, y: 0 };
  const destination = { x: 300, y: 300 };
  const casterToken = {
    id: "caster-log",
    name: "Mago Log",
    position: clone(origin),
    metadata: { [META_KEY]: { hp: 20, hpMax: 20 } },
  };
  resetScene(casterToken);

  let coordinatedMutation = null;
  await history.withItemMetaHistory({
    itemIds: ["caster-log"],
    fields: ["hp", "hpMax"],
    kind: "spell",
    label: "Lancio incantesimo · Passo Velato",
    sceneEpoch: currentSceneEpoch(),
    payload: {
      causality: {
        source: "spell-area",
        spellId: "misty-step",
        spellName: "Passo Velato",
        casterId: "caster-log",
        casterName: "Mago Log",
        teleport: true,
        targets: [{ id: "caster-log", name: "Mago Log" }],
      },
    },
    decorateEntry: (entry) => {
      const decorated = decorateCompositeEffectsHistoryEntry({
        entry,
        mutation: coordinatedMutation,
      });
      return {
        ...decorated,
        payload: {
          ...(decorated?.payload || {}),
          causality: {
            source: "spell-area",
            spellId: "misty-step",
            spellName: "Passo Velato",
            casterId: "caster-log",
            casterName: "Mago Log",
            teleport: true,
            targets: [{ id: "caster-log", name: "Mago Log" }],
          },
        },
      };
    },
  }, async () => {
    coordinatedMutation = await effects.runEffectsMutation([], {
      history: false,
      kind: "spell",
      label: "Lancio incantesimo · Passo Velato",
      targetIds: ["caster-log"],
      sideEffects: [{
        type: "token:teleport",
        targetId: "caster-log",
        position: destination,
        skipAnimation: true,
      }],
      sceneEpoch: currentSceneEpoch(),
    });
  });

  const entries = await history.getHistoryEntries();
  assert.equal(entries.length, 1);
  const targetEntryId = entries[0].id;

  const logDataBeforeUndo = await combatLog.getActiveCombatLogData({ sceneEpoch: currentSceneEpoch() });
  const spellEvent = logDataBeforeUndo.events.find((e) => e.payload?.causality?.spellId === "misty-step");
  assert.ok(spellEvent, "L'evento di lancio deve essere presente nel Combat Log");

  const undone = await history.undoHistoryThrough(targetEntryId, {
    sceneEpoch: currentSceneEpoch(),
  });
  const outcome = normalizeHistoryUndoResult(undone);
  assert.equal(outcome.outcome, HISTORY_UNDO_OUTCOME.COMMITTED);

  const logDataAfterUndo = await combatLog.getActiveCombatLogData({ sceneEpoch: currentSceneEpoch() });
  const undoEvent = logDataAfterUndo.events.find((e) => e.kind === "undo" && e.payload?.historyEntryIds?.includes(targetEntryId));
  assert.ok(undoEvent, "L'evento di Undo deve essere registrato con riferimento alla History entry originale");
});
