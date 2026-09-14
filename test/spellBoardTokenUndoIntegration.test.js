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
const SPELLS_KEY = "com.thebigpicture.initiative/spells";
const CONCENTRATION_KEY = "com.thebigpicture.initiative/concentration";
const BOARD_TOKEN_KEY = "com.thebigpicture.initiative/spellBoardToken";
const HISTORY_KEY = "com.thebigpicture.initiative/history";
const clone = (value) => value === undefined ? undefined : structuredClone(value);

const sceneState = {
  ready: true,
  metadata: {},
  items: [],
  addCalls: [],
  addAttempts: 0,
  failAddAt: null,
};
const readyListeners = new Set();
const broadcastListeners = new Map();

function currentItems(selector) {
  if (typeof selector === "function") {
    return sceneState.items.filter(selector).map(clone);
  }
  const wanted = Array.isArray(selector) ? new Set(selector) : null;
  return sceneState.items
    .filter((item) => !wanted || wanted.has(item?.id))
    .map(clone);
}

function imageBuilder() {
  let item = { type: "IMAGE" };
  const builder = {};
  const setters = [
    "id",
    "position",
    "plainText",
    "textItemType",
    "textPadding",
    "fontFamily",
    "fontSize",
    "fontWeight",
    "textLineHeight",
    "textAlign",
    "textAlignVertical",
    "textFillColor",
    "textStrokeColor",
    "textStrokeWidth",
    "scale",
    "rotation",
    "locked",
    "disableHit",
    "layer",
    "visible",
    "disableAutoZIndex",
    "zIndex",
    "metadata",
    "name",
  ];
  for (const key of setters) {
    builder[key] = (value) => {
      item = { ...item, [key]: clone(value) };
      return builder;
    };
  }
  builder.build = () => clone(item);
  return builder;
}

const sdkStub = {
  onReady: () => {},
  player: { getRole: async () => "GM" },
  room: { id: "board-token-undo-room", getMetadata: async () => ({}) },
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
    grid: {
      getDpi: async () => 150,
      getScale: async () => ({ parsed: { multiplier: 1.5, unit: "m" } }),
    },
    items: {
      getItems: async (selector) => currentItems(selector),
      getItemBounds: async (ids) => {
        const [item] = currentItems(ids);
        const x = Number(item?.position?.x);
        const y = Number(item?.position?.y);
        return {
          center: { x, y },
          max: { x: x + 50, y: y + 50 },
        };
      },
      updateItems: async (selector, updater) => {
        const drafts = currentItems(selector);
        await updater(drafts);
        const byId = new Map(drafts.map((item) => [item.id, item]));
        sceneState.items = sceneState.items.map((item) => byId.get(item.id) || item);
      },
      deleteItems: async (ids) => {
        const wanted = new Set(ids || []);
        sceneState.items = sceneState.items.filter((item) => !wanted.has(item.id));
      },
      addItems: async (items) => {
        const rawItems = clone(items || []);
        sceneState.addAttempts += rawItems.length;
        if (sceneState.failAddAt !== null && sceneState.addAttempts >= sceneState.failAddAt) {
          throw new Error("injected-board-token-add-failure");
        }
        sceneState.addCalls.push(rawItems);
        // OBR adds SDK-owned defaults during persistence. This is the field
        // difference that exposed the duplicate lifecycle representation.
        sceneState.items.push(...rawItems.map((item) => ({
          ...item,
          zIndex: item.zIndex ?? 0,
        })));
      },
    },
    local: {
      getItems: async () => [],
      getItemBounds: async () => null,
      addItems: async () => {},
      updateItems: async () => {},
      deleteItems: async () => {},
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
        await listener({ data: clone(data) });
      }
    },
  },
};

mock.module("@owlbear-rodeo/sdk", {
  exports: {
    default: sdkStub,
    buildImage: () => imageBuilder(),
    buildLabel: (...args) => ({ type: "LABEL", args }),
    buildPath: (...args) => ({ type: "PATH", args }),
    buildText: (...args) => ({ type: "TEXT", args }),
    buildShape: (...args) => ({ type: "SHAPE", args }),
    Command: class Command {},
  },
});

const effects = await import("../src/effectsMutations.js");
const clientEffects = await import("../src/effectsMutations.js?board-token-client");
const backgroundEffects = await import("../src/effectsMutations.js?board-token-background");
const history = await import("../src/history.js");
const historyOwner = await import("../src/historyOwner.js");
const { currentSceneEpoch } = await import("../src/sceneEpoch.js");
const { buildSpellUnifiedPanelContract } = await import("../src/spellUnifiedPanelCore.js");
const { buildSpellAreaResolutionCommand } = await import("../src/spellAreaResolutionCommandCore.js");
const { executeSpellAreaResolution } = await import("../src/spellAreaResolutionExecutor.js");
const { normalizeHistoryUndoResult, HISTORY_UNDO_OUTCOME } = await import("../src/historyUndoResultCore.js");

function casterItem() {
  return {
    id: "caster-board-token",
    name: "Mago",
    type: "IMAGE",
    layer: "CHARACTER",
    position: { x: 0, y: 0 },
    metadata: {
      [META_KEY]: {
        hp: 50,
        hpMax: 50,
        attitude: "friendly",
        conditions: [],
        [SPELLS_KEY]: [],
        [CONCENTRATION_KEY]: {},
      },
    },
  };
}

function resetScene() {
  sceneState.metadata = {
    [HISTORY_KEY]: {
      version: 1,
      roomId: sdkStub.room.id,
      entries: [],
    },
  };
  sceneState.items = [casterItem()];
  sceneState.addCalls = [];
  sceneState.addAttempts = 0;
  sceneState.failAddAt = null;
}

function animateObjectsCommand(positions) {
  const castContext = {
    animatedObjects: { counts: { tiny: 1, large: positions.length > 1 ? 1 : 0 } },
  };
  const contract = buildSpellUnifiedPanelContract({
    spellId: "animate-objects",
    phase: "cast",
    castContext,
  });
  return buildSpellAreaResolutionCommand({
    contract,
    spellId: "animate-objects",
    phase: "cast",
    source: { kind: "cast", sceneEpoch: currentSceneEpoch() },
    casterId: "caster-board-token",
    slotLevel: 5,
    castContext,
    targetIds: [],
    candidateTargetIds: [],
    targetLocked: true,
    placement: {
      status: "confirmed",
      confirmed: true,
      ruleId: "animate-objects:board-token",
      spellId: "animate-objects",
      casterId: "caster-board-token",
      targetLocked: true,
      preview: {
        type: "square",
        start: { x: 0, y: 0 },
        end: { x: 300, y: 0 },
        gridOrigin: { x: 0, y: 0 },
        dpi: 150,
        position: positions[0],
        positions: positions.map((position, ordinal) => ({
          objectSize: ordinal === 0 ? "tiny" : "large",
          ordinal,
          position,
        })),
      },
    },
    sceneEpoch: currentSceneEpoch(),
    currentSceneEpoch: currentSceneEpoch(),
    validateSpatial: false,
  });
}

function arcaneHandCommand() {
  const contract = buildSpellUnifiedPanelContract({ spellId: "arcane-hand", phase: "cast" });
  return buildSpellAreaResolutionCommand({
    contract,
    spellId: "arcane-hand",
    phase: "cast",
    source: { kind: "cast", sceneEpoch: currentSceneEpoch() },
    casterId: "caster-board-token",
    slotLevel: 5,
    targetIds: [],
    candidateTargetIds: [],
    targetLocked: true,
    placement: {
      status: "confirmed",
      confirmed: true,
      ruleId: "arcane-hand:board-token",
      spellId: "arcane-hand",
      casterId: "caster-board-token",
      targetLocked: true,
      preview: {
        type: "circle",
        position: { x: 75, y: 75 },
      },
    },
    sceneEpoch: currentSceneEpoch(),
    currentSceneEpoch: currentSceneEpoch(),
    validateSpatial: false,
  });
}

async function cast(command) {
  const result = await executeSpellAreaResolution(command, {
    getItems: sdkStub.scene.items.getItems,
    updateItems: sdkStub.scene.items.updateItems,
    deleteItems: sdkStub.scene.items.deleteItems,
    addItems: sdkStub.scene.items.addItems,
    getItemBounds: sdkStub.scene.items.getItemBounds,
    getSceneMetadata: sdkStub.scene.getMetadata,
    setSceneMetadata: sdkStub.scene.setMetadata,
    currentSceneEpoch,
    isCurrent: () => true,
    syncHPVisuals: async () => {},
    readAuthoritativeHPVisualUpdates: async () => [],
    syncHPBatchToMemory: async () => {},
    emitFireballVisual: async () => {},
    emitMatchedSpellVisual: async () => {},
    onConcentrationWarnings: async () => {},
    onEffectSaveWarnings: async () => {},
  });
  assert.equal(result.status, "applied", JSON.stringify(result));
  return result;
}

async function boardTokens() {
  return (await sdkStub.scene.items.getItems())
    .filter((item) => item.metadata?.[BOARD_TOKEN_KEY]?.kind === "spell-board-token");
}

function isSceneLifecycleChange(change) {
  return Object.prototype.hasOwnProperty.call(change || {}, "sceneBefore")
    && Object.prototype.hasOwnProperty.call(change || {}, "sceneAfter");
}

function sdkCanonicalItem(item) {
  const { zIndex, ...rest } = item || {};
  return rest;
}

async function undoEntry(entry) {
  const result = await history.undoHistoryThrough(entry.id, { sceneEpoch: currentSceneEpoch() });
  return normalizeHistoryUndoResult(result);
}

function directBoardTokenPlaces({ instanceId, spellId = "animate-objects", count = 3 }) {
  return Array.from({ length: count }, (_, index) => ({
    type: "spell-board-token:place",
    entityId: `injected-board-token-${index + 1}`,
    spellId,
    instanceId,
    casterId: "caster-board-token",
    slotLevel: 5,
    position: { x: 75 + index * 150, y: 75 },
    ...(spellId === "animate-objects"
      ? { objectSize: index === 0 ? "tiny" : "large", batch: true }
      : {}),
  }));
}

test.before(async () => {
  await historyOwner.mountHistoryOwner();
  await effects.mountEffectsMutationCoordinatorService();
});

test.after(() => {
  effects.unmountEffectsMutationCoordinatorService();
  historyOwner.unmountHistoryOwner();
  globalThis.indexedDB = previousIndexedDB;
  globalThis.IDBKeyRange = previousKeyRange;
});

test("R1/T1/T4/T5 — un solo token Animate Objects è nella stessa History e l'Undo lo rimuove", async () => {
  resetScene();
  const castResult = await cast(animateObjectsCommand([{ x: 75, y: 75 }]));
  const created = await boardTokens();
  const entries = await history.getHistoryEntries();
  assert.equal(created.length, 1);
  assert.equal(entries.length, 1);
  assert.equal(castResult.historyEntryId, entries[0].id);

  const entry = entries[0];
  const itemChanges = entry.effectsMutation.sideEffects
    .filter((change) => change.type === "item");
  assert.deepEqual(itemChanges.map((change) => change.id), created.map((item) => item.id));
  assert.ok(itemChanges.every((change) => change.before === null && change.after?.id));
  for (const change of itemChanges) {
    const [current] = await sdkStub.scene.items.getItems([change.id]);
    assert.deepEqual(sdkCanonicalItem(current), change.after);
    assert.equal(current.zIndex, 0);
    assert.equal(change.after.zIndex, undefined);
  }
  assert.equal(entry.effectsMutation.changes.some((change) => change.id === "caster-board-token"), true);
  assert.deepEqual(
    entry.changes.filter(isSceneLifecycleChange).map((change) => change.id),
    [],
  );

  const readiness = await history.getHistoryUndoReadiness({ sceneEpoch: currentSceneEpoch() });
  const row = readiness.rows.find((candidate) => candidate.id === entry.id);
  assert.equal(row?.undoable, true, JSON.stringify(row));
  const outcome = await undoEntry(entry);
  assert.equal(outcome.outcome, HISTORY_UNDO_OUTCOME.COMMITTED, JSON.stringify(outcome));
  assert.equal((await boardTokens()).length, 0);
  const [caster] = await sdkStub.scene.items.getItems(["caster-board-token"]);
  assert.deepEqual(caster.metadata[META_KEY][SPELLS_KEY], []);
  assert.deepEqual(caster.metadata[META_KEY][CONCENTRATION_KEY], {});
});

test("R2/T2/T3/T7 — Animate Objects multi-token conserva tutte le identità in una sola azione", async () => {
  resetScene();
  await cast(animateObjectsCommand([{ x: 75, y: 75 }, { x: 300, y: 300 }]));
  const created = await boardTokens();
  const [entry] = await history.getHistoryEntries();
  const itemChanges = entry.effectsMutation.sideEffects.filter((change) => change.type === "item");
  assert.equal(created.length, 2);
  assert.equal(itemChanges.length, 2);
  assert.deepEqual(
    new Set(itemChanges.map((change) => change.id)),
    new Set(created.map((item) => item.id)),
  );
  assert.equal((await history.getHistoryEntries()).length, 1);
  assert.equal((await undoEntry(entry)).outcome, HISTORY_UNDO_OUTCOME.COMMITTED);
  assert.equal((await boardTokens()).length, 0);
  assert.equal(
    (await sdkStub.scene.items.getItems()).some((item) => item.metadata?.[BOARD_TOKEN_KEY]),
    false,
  );
});

test("T10 — Mano Arcana usa la stessa primitive board-token e l'Undo ripristina il parent", async () => {
  resetScene();
  await cast(arcaneHandCommand());
  assert.equal((await boardTokens()).length, 1);
  const [entry] = await history.getHistoryEntries();
  assert.equal((await undoEntry(entry)).outcome, HISTORY_UNDO_OUTCOME.COMMITTED);
  assert.equal((await boardTokens()).length, 0);
  const [caster] = await sdkStub.scene.items.getItems(["caster-board-token"]);
  assert.deepEqual(caster.metadata[META_KEY][CONCENTRATION_KEY], {});
});

test("T6 — una modifica canonica successiva dell'identità blocca l'Undo del cast", async () => {
  resetScene();
  await cast(animateObjectsCommand([{ x: 75, y: 75 }, { x: 300, y: 300 }]));
  const created = await boardTokens();
  const [entry] = await history.getHistoryEntries();
  await sdkStub.scene.items.updateItems([created[0].id], (drafts) => {
    drafts[0].metadata[BOARD_TOKEN_KEY].instanceId = "tampered-instance-id";
  });

  const readiness = await history.getHistoryUndoReadiness({ sceneEpoch: currentSceneEpoch() });
  const row = readiness.rows.find((candidate) => candidate.id === entry.id);
  assert.equal(row?.undoable, false);
  const outcome = await undoEntry(entry);
  assert.equal(outcome.outcome, HISTORY_UNDO_OUTCOME.CONFLICT);
  assert.equal((await boardTokens()).length, 2);
  const [caster] = await sdkStub.scene.items.getItems(["caster-board-token"]);
  assert.equal(caster.metadata[META_KEY][SPELLS_KEY].length, 1);
  assert.equal(Object.keys(caster.metadata[META_KEY][CONCENTRATION_KEY]).length, 1);
});

test("T8/T9 — dopo Undo il reconcile non ricrea child e il cast successivo usa nuove identità", async () => {
  resetScene();
  await cast(animateObjectsCommand([{ x: 75, y: 75 }]));
  const firstTokenId = (await boardTokens())[0].id;
  const [firstEntry] = await history.getHistoryEntries();
  assert.equal((await undoEntry(firstEntry)).outcome, HISTORY_UNDO_OUTCOME.COMMITTED);

  await effects.runEffectsMutation([], {
    commandId: "board-token-reconcile-after-undo",
    kind: "board-token-reconcile",
    history: false,
    targetIds: [],
    sceneEpoch: currentSceneEpoch(),
  });
  assert.equal((await boardTokens()).length, 0);

  await cast(animateObjectsCommand([{ x: 75, y: 75 }]));
  const secondTokenId = (await boardTokens())[0].id;
  assert.notEqual(secondTokenId, firstTokenId);
  assert.equal((await history.getHistoryEntries()).length, 1);
});

test("T11 — il failure sequenziale segue il contract pending e converge senza perdere i token", async () => {
  resetScene();
  const instanceId = "injected-board-token-instance";
  const options = {
    commandId: "board-token-sequential-failure",
    kind: "board-token-sequential-create",
    label: "Create board tokens failure injection",
    targetIds: [],
    sceneEpoch: currentSceneEpoch(),
    sideEffects: directBoardTokenPlaces({ instanceId }),
  };
  sceneState.failAddAt = 3;
  const previousLocation = globalThis.location;
  effects.unmountEffectsMutationCoordinatorService();
  globalThis.location = { pathname: "/background.html" };
  await backgroundEffects.mountEffectsMutationCoordinatorService();
  globalThis.location = { pathname: "/plugin.html" };
  try {
    const partial = await clientEffects.runEffectsMutation([], options);
    assert.equal(partial.status, "applied");
    assert.equal(partial.commitResult.sideEffectChanges.length, 2);
    assert.equal(partial.commitResult.sideEffectsPending.length, 1);
    assert.equal((await boardTokens()).length, 2);
    assert.equal((await history.getHistoryEntries()).length, 0);

    sceneState.failAddAt = null;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      clientEffects.flushPendingEffectsHistory(currentSceneEpoch());
      backgroundEffects.flushPendingEffectsHistory(currentSceneEpoch());
      await new Promise((resolve) => setTimeout(resolve, 10));
      if (
        !clientEffects.hasPendingEffectsHistory(currentSceneEpoch())
        && !backgroundEffects.hasPendingEffectsHistory(currentSceneEpoch())
      ) break;
    }
    assert.equal((await boardTokens()).length, 3);
    const entries = await history.getHistoryEntries();
    assert.equal(entries.length, 1);
    assert.equal(entries[0].effectsMutation.sideEffects.filter((change) => change.type === "item").length, 3);
  } finally {
    backgroundEffects.unmountEffectsMutationCoordinatorService();
    if (previousLocation === undefined) delete globalThis.location;
    else globalThis.location = previousLocation;
    await effects.mountEffectsMutationCoordinatorService();
  }
});

test("T12 — retry dello stesso commandId è idempotente per scena e History", async () => {
  resetScene();
  const options = {
    commandId: "board-token-idempotent-command",
    kind: "board-token-idempotent-create",
    label: "Idempotent board token create",
    targetIds: [],
    sceneEpoch: currentSceneEpoch(),
    sideEffects: directBoardTokenPlaces({
      instanceId: "idempotent-board-token-instance",
      count: 1,
    }),
  };
  const first = await effects.runEffectsMutation([], options);
  const second = await effects.runEffectsMutation([], options);
  assert.equal(first.status, "applied");
  assert.equal(second.status, "applied");
  assert.equal((await boardTokens()).length, 1);
  const entries = await history.getHistoryEntries();
  assert.equal(entries.length, 1);
  assert.equal(entries[0].effectsMutation.sideEffects.filter((change) => change.type === "item").length, 1);
});
