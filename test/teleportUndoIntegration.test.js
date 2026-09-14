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
const {
  buildSpellUnifiedPanelContract,
  createSpellPanelSession,
} = await import("../src/spellUnifiedPanelCore.js");
const { buildSpellAreaResolutionCommand } = await import("../src/spellAreaResolutionCommandCore.js");
const { executeSpellAreaResolution } = await import("../src/spellAreaResolutionExecutor.js");
const { executeSpellUnifiedArea } = await import("../src/spellUnifiedAreaAdapter.js");

function resetScene(initialToken = null) {
  sceneState.metadata = {};
  sceneState.items = initialToken ? [clone(initialToken)] : [];
}

function dimensionDoorCommand({
  casterId = "dimension-caster",
  passengerId = "",
  destination = { x: 300, y: 300 },
  commandId = "dimension-door-command",
  hp = null,
  passengerRelativeOffset = null,
} = {}) {
  const contract = buildSpellUnifiedPanelContract({
    spellId: "dimension-door",
  });
  return buildSpellAreaResolutionCommand({
    contract,
    spellId: "dimension-door",
    phase: "cast",
    source: {
      kind: "cast",
      sceneEpoch: currentSceneEpoch(),
      commandId,
      correlationId: commandId,
    },
    commandId,
    correlationId: commandId,
    casterId,
    passengerId,
    targetIds: passengerId ? [passengerId] : [],
    passenger: passengerId ? { id: passengerId, layer: "CHARACTER" } : null,
    targetLocked: true,
    ...(hp ? { hp } : {}),
    placement: {
      status: "confirmed",
      confirmed: true,
      targetLocked: true,
      ruleId: contract.presentation.placement.ruleId,
      spellId: "dimension-door",
      casterId,
      preview: {
        type: "square",
        start: { ...destination },
        end: { x: destination.x + 150, y: destination.y + 150 },
        position: { ...destination },
        gridOrigin: { x: 0, y: 0 },
        dpi: 150,
        targetIds: [],
      },
    },
    sceneEpoch: currentSceneEpoch(),
    currentSceneEpoch: currentSceneEpoch(),
    validateSpatial: false,
    ...(passengerRelativeOffset ? {
      spatialValidation: { passengerRelativeOffset },
    } : {}),
  });
}

function dimensionDoorToken(id, position) {
  return {
    id,
    name: id,
    layer: "CHARACTER",
    position: clone(position),
    metadata: { [META_KEY]: { hp: 20, hpMax: 20, conditions: [] } },
  };
}

async function waitForPositions(ids, expectedPositions, timeoutMs = 3500) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const items = await sdkStub.scene.items.getItems(ids);
    if (items.length === ids.length
      && items.every((item, index) => (
        item?.position?.x === expectedPositions[index]?.x
        && item?.position?.y === expectedPositions[index]?.y
      ))) {
      return items;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return sdkStub.scene.items.getItems(ids);
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

test("Dimension Door E2E caster-only: contract, command, Effects, History e Undo sono una sola azione", async () => {
  const origin = { x: 0, y: 0 };
  const destination = { x: 300, y: 300 };
  resetScene(dimensionDoorToken("dimension-caster", origin));

  const contract = buildSpellUnifiedPanelContract({ spellId: "dimension-door" });
  assert.equal(contract.execution.lane, "area-transaction");
  assert.equal(contract.presentation.placement.required, true);
  assert.equal(contract.presentation.teleport.passenger.optional, true);
  const session = createSpellPanelSession({
    contract,
    casterId: "dimension-caster",
    targetIds: [],
    placement: {
      status: "confirmed",
      confirmed: true,
      targetLocked: true,
      ruleId: contract.presentation.placement.ruleId,
      spellId: "dimension-door",
      casterId: "dimension-caster",
      preview: {
        type: "square",
        start: { x: destination.x - 75, y: destination.y - 75 },
        end: { x: destination.x + 75, y: destination.y + 75 },
        position: { ...destination },
        gridOrigin: { x: 0, y: 0 },
        dpi: 150,
        targetIds: [],
      },
    },
  });
  const commandId = "dimension-door-unified-caster-command";
  const result = await executeSpellUnifiedArea({
    contract,
    session,
    source: {
      sceneEpoch: currentSceneEpoch(),
      commandId,
      correlationId: commandId,
    },
    runtime: {
      getSpatialValidation: async () => ({
        mode: "teleport",
        destination,
        invalidDestination: false,
        invalidPassengerIds: [],
      }),
      executor: executeSpellAreaResolution,
      getItems: sdkStub.scene.items.getItems,
      updateItems: sdkStub.scene.items.updateItems,
      getSceneMetadata: sdkStub.scene.getMetadata,
      currentSceneEpoch,
      isCurrent: () => true,
      syncHPVisuals: async () => {},
      readAuthoritativeHPVisualUpdates: async () => [],
      syncHPBatchToMemory: async () => {},
      emitFireballVisual: async () => {},
      emitMatchedSpellVisual: async () => {},
      onConcentrationWarnings: async () => {},
      onEffectSaveWarnings: async () => {},
    },
  });
  assert.equal(result.status, "applied", JSON.stringify(result));
  const command = result.command;
  assert.equal(command.valid, true, JSON.stringify(command.errors));
  assert.deepEqual(command.teleport.affectedTargetIds, ["dimension-caster"]);
  assert.equal(command.teleport.destination.x, destination.x);
  const afterCast = await waitForPositions(["dimension-caster"], [destination]);
  assert.deepEqual(afterCast[0].position, destination, JSON.stringify(result));
  const entries = await history.getHistoryEntries();
  assert.equal(entries.length, 1);
  assert.equal(entries[0].effectsMutation.commandId, command.commandId);
  assert.deepEqual(
    entries[0].effectsMutation.sideEffects.filter((effect) => effect.type === "token:teleport").map((effect) => effect.id),
    ["dimension-caster"],
  );

  const undone = await history.undoHistoryThrough(entries[0].id, {
    sceneEpoch: currentSceneEpoch(),
  });
  assert.equal(normalizeHistoryUndoResult(undone).outcome, HISTORY_UNDO_OUTCOME.COMMITTED);
  assert.deepEqual((await sdkStub.scene.items.getItems(["dimension-caster"]))[0].position, origin);
});

test("Dimension Door E2E composite: caster e passeggero condividono command identity, History e Undo", async () => {
  const casterOrigin = { x: 0, y: 0 };
  const passengerOrigin = { x: 150, y: 0 };
  const destination = { x: 450, y: 300 };
  resetScene(dimensionDoorToken("dimension-caster", casterOrigin));
  sceneState.items.push(dimensionDoorToken("dimension-passenger", passengerOrigin));

  const contract = buildSpellUnifiedPanelContract({ spellId: "dimension-door" });
  const session = createSpellPanelSession({
    contract,
    casterId: "dimension-caster",
    passengerId: "dimension-passenger",
    targetIds: ["dimension-passenger"],
    placement: {
      status: "confirmed",
      confirmed: true,
      targetLocked: true,
      ruleId: contract.presentation.placement.ruleId,
      spellId: "dimension-door",
      casterId: "dimension-caster",
      preview: {
        type: "square",
        start: { x: destination.x - 75, y: destination.y - 75 },
        end: { x: destination.x + 75, y: destination.y + 75 },
        position: { ...destination },
        gridOrigin: { x: 0, y: 0 },
        dpi: 150,
        targetIds: [],
      },
    },
  });
  const commandId = "dimension-door-composite-command";
  const passengerOffset = {
    x: passengerOrigin.x - casterOrigin.x,
    y: passengerOrigin.y - casterOrigin.y,
  };
  const result = await executeSpellUnifiedArea({
    contract,
    session,
    source: {
      sceneEpoch: currentSceneEpoch(),
      commandId,
      correlationId: commandId,
    },
    runtime: {
      getSpatialValidation: async () => ({
        mode: "teleport",
        destination,
        invalidDestination: false,
        passengerAdjacent: true,
        passengerRelativeOffset: passengerOffset,
        invalidPassengerIds: [],
      }),
      executor: executeSpellAreaResolution,
      getItems: sdkStub.scene.items.getItems,
      updateItems: sdkStub.scene.items.updateItems,
      getSceneMetadata: sdkStub.scene.getMetadata,
      currentSceneEpoch,
      isCurrent: () => true,
      syncHPVisuals: async () => {},
      readAuthoritativeHPVisualUpdates: async () => [],
      syncHPBatchToMemory: async () => {},
      emitFireballVisual: async () => {},
      emitMatchedSpellVisual: async () => {},
      onConcentrationWarnings: async () => {},
      onEffectSaveWarnings: async () => {},
    },
  });
  const command = result.command;
  assert.equal(command.valid, true, JSON.stringify(command.errors));
  assert.deepEqual(command.teleport.affectedTargetIds, ["dimension-caster", "dimension-passenger"]);
  const passengerDestination = {
    x: destination.x + passengerOrigin.x - casterOrigin.x,
    y: destination.y + passengerOrigin.y - casterOrigin.y,
  };

  assert.equal(result.status, "applied", JSON.stringify(result));
  const afterCast = await waitForPositions(
    ["dimension-caster", "dimension-passenger"],
    [destination, passengerDestination],
  );
  assert.deepEqual(
    afterCast.map((item) => item.position),
    [destination, passengerDestination],
    JSON.stringify(result),
  );
  const entries = await history.getHistoryEntries();
  assert.equal(entries.length, 1);
  const teleports = entries[0].effectsMutation.sideEffects
    .filter((effect) => effect.type === "token:teleport");
  assert.deepEqual(teleports.map((effect) => effect.id), ["dimension-caster", "dimension-passenger"]);
  assert.deepEqual(
    teleports.map((effect) => effect.afterPosition),
    [destination, passengerDestination],
  );
  assert.deepEqual(
    new Set(teleports.map((effect) => effect.operationId)),
    new Set([command.commandId]),
  );
  assert.deepEqual(
    entries[0].effectsMutation.targetIds.sort(),
    ["dimension-caster", "dimension-passenger"],
  );

  const undone = await history.undoHistoryThrough(entries[0].id, {
    sceneEpoch: currentSceneEpoch(),
  });
  assert.equal(normalizeHistoryUndoResult(undone).outcome, HISTORY_UNDO_OUTCOME.COMMITTED);
  const afterUndo = await sdkStub.scene.items.getItems(["dimension-caster", "dimension-passenger"]);
  assert.deepEqual(afterUndo.map((item) => item.position), [casterOrigin, passengerOrigin]);
});

test("Dimension Door applica al passeggero lo stesso delta reale del caster", async () => {
  const casterOrigin = { x: 300, y: 300 };
  const passengerOrigin = { x: 150, y: 300 };
  const destination = { x: 1800, y: 900 };
  const passengerDestination = { x: 1650, y: 900 };
  resetScene(dimensionDoorToken("dimension-caster", casterOrigin));
  sceneState.items.push(dimensionDoorToken("dimension-passenger", passengerOrigin));

  const command = dimensionDoorCommand({
    passengerId: "dimension-passenger",
    destination,
    commandId: "dimension-door-live-translation-command",
    // Simula un offset dei bounding box diverso da quello tra le item.position.
    passengerRelativeOffset: { x: -75, y: 0 },
  });
  assert.equal(command.valid, true, JSON.stringify(command.errors));

  const result = await executeSpellAreaResolution(command, {
    getItems: sdkStub.scene.items.getItems,
    updateItems: sdkStub.scene.items.updateItems,
    getSceneMetadata: sdkStub.scene.getMetadata,
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

  const afterCast = await waitForPositions(
    ["dimension-caster", "dimension-passenger"],
    [destination, passengerDestination],
  );
  assert.deepEqual(afterCast.map((item) => item.position), [destination, passengerDestination]);
  assert.deepEqual({
    x: afterCast[1].position.x - afterCast[0].position.x,
    y: afterCast[1].position.y - afterCast[0].position.y,
  }, {
    x: passengerOrigin.x - casterOrigin.x,
    y: passengerOrigin.y - casterOrigin.y,
  });
});

test("Dimension Door non raccoglie più un esito destinazione nel command", async () => {
  const casterOrigin = { x: 0, y: 0 };
  const passengerOrigin = { x: 150, y: 0 };
  resetScene(dimensionDoorToken("dimension-caster", casterOrigin));
  sceneState.items.push(dimensionDoorToken("dimension-passenger", passengerOrigin));
  const command = dimensionDoorCommand({
    passengerId: "dimension-passenger",
    commandId: "dimension-door-failure-command",
  });
  assert.equal(command.valid, true, JSON.stringify(command.errors));
  assert.equal(command.teleport.outcome, undefined);
  assert.equal(command.teleport.failure, undefined);

  const result = await executeSpellAreaResolution(command, {
    getItems: sdkStub.scene.items.getItems,
    updateItems: sdkStub.scene.items.updateItems,
    getSceneMetadata: sdkStub.scene.getMetadata,
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
  const items = await sdkStub.scene.items.getItems(["dimension-caster", "dimension-passenger"]);
  assert.deepEqual(items.map((item) => item.position), [
    { x: 300, y: 300 },
    { x: 450, y: 300 },
  ]);
  assert.equal((await history.getHistoryEntries()).length, 1);
});

test("Dimension Door mantiene il teleport se il VFX matched fallisce", async () => {
  const origin = { x: 0, y: 0 };
  const destination = { x: 600, y: 300 };
  resetScene(dimensionDoorToken("dimension-caster", origin));
  const command = dimensionDoorCommand({
    destination,
    commandId: "dimension-door-vfx-failure-command",
  });
  const result = await executeSpellAreaResolution(command, {
    getItems: sdkStub.scene.items.getItems,
    updateItems: sdkStub.scene.items.updateItems,
    getSceneMetadata: sdkStub.scene.getMetadata,
    currentSceneEpoch,
    isCurrent: () => true,
    syncHPVisuals: async () => {},
    readAuthoritativeHPVisualUpdates: async () => [],
    syncHPBatchToMemory: async () => {},
    emitFireballVisual: async () => {},
    emitMatchedSpellVisual: async () => {
      throw new Error("dimension-door-vfx-failure");
    },
    onConcentrationWarnings: async () => {},
    onEffectSaveWarnings: async () => {},
  });
  assert.equal(result.status, "applied", JSON.stringify(result));
  assert.deepEqual(
    (await sdkStub.scene.items.getItems(["dimension-caster"]))[0].position,
    destination,
  );
  assert.equal(result.visualEvents.some((event) => event.type === "matched-spell"), true);
  assert.equal((await history.getHistoryEntries()).length, 1);
});

test("Dimension Door stale non applica il comando alla scena successiva", async () => {
  const origin = { x: 0, y: 0 };
  resetScene(dimensionDoorToken("dimension-caster", origin));
  const command = dimensionDoorCommand({
    destination: { x: 300, y: 300 },
    commandId: "dimension-door-stale-command",
  });
  const result = await executeSpellAreaResolution(command, {
    getItems: sdkStub.scene.items.getItems,
    updateItems: async () => {
      throw new Error("stale-command-must-not-write");
    },
    getSceneMetadata: sdkStub.scene.getMetadata,
    currentSceneEpoch,
    isCurrent: () => false,
    syncHPVisuals: async () => {},
    readAuthoritativeHPVisualUpdates: async () => [],
    syncHPBatchToMemory: async () => {},
    emitFireballVisual: async () => {},
    emitMatchedSpellVisual: async () => {},
    onConcentrationWarnings: async () => {},
    onEffectSaveWarnings: async () => {},
  });
  assert.equal(result.status, "rejected");
  assert.deepEqual(
    (await sdkStub.scene.items.getItems(["dimension-caster"]))[0].position,
    origin,
  );
  assert.equal((await history.getHistoryEntries()).length, 0);
});
