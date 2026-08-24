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

const META_KEY = "com.thebigpicture.initiative/meta";
const STATE_KEY = "com.thebigpicture.initiative/state";
const SPELLS_KEY = "com.thebigpicture.initiative/spells";
const CONCENTRATION_KEY = "com.thebigpicture.initiative/concentration";
const HISTORY_KEY = "com.thebigpicture.initiative/history";

const clone = (value) => value === undefined ? undefined : structuredClone(value);
const sceneState = { metadata: {}, items: [] };
const broadcastListeners = new Map();

function currentItems(ids) {
  const wanted = Array.isArray(ids) ? new Set(ids) : null;
  return sceneState.items
    .filter((item) => !wanted || wanted.has(item?.id))
    .map(clone);
}

const sdkStub = {
  onReady: () => {},
  player: {
    getRole: async () => "GM",
    getId: async () => "gm-lightning",
    getName: async () => "GM",
    getSelection: async () => [],
    onChange: () => () => {},
  },
  room: { id: "lightning-arrow-room", getMetadata: async () => ({}) },
  scene: {
    isReady: async () => true,
    onReadyChange: () => () => {},
    getMetadata: async () => clone(sceneState.metadata),
    setMetadata: async (update) => {
      sceneState.metadata = { ...sceneState.metadata, ...clone(update) };
    },
    items: {
      getItems: async (ids) => currentItems(ids),
      onChange: () => () => {},
      getItemBounds: async (ids) => {
        const item = sceneState.items.find((candidate) => candidate.id === ids?.[0]);
        const position = item?.position;
        if (!position) return null;
        return {
          min: { x: position.x, y: position.y },
          max: { x: position.x + 150, y: position.y + 150 },
          center: { x: position.x + 75, y: position.y + 75 },
        };
      },
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
        await listener({ data: clone(data) });
      }
    },
  },
};

mock.module("@owlbear-rodeo/sdk", {
  exports: {
    default: sdkStub,
    buildLabel: (...args) => ({ type: "LABEL", args, build: () => ({ id: "label" }) }),
    buildImage: (...args) => ({ type: "IMAGE", args, build: () => ({ id: "image" }) }),
    buildShape: (...args) => ({ type: "SHAPE", args, build: () => ({ id: "shape" }) }),
    buildText: (...args) => ({ type: "TEXT", args, build: () => ({ id: "text" }) }),
    buildPath: () => ({
      commands() { return this; },
      fillRule() { return this; },
      fillColor() { return this; },
      fillOpacity() { return this; },
      strokeColor() { return this; },
      strokeOpacity() { return this; },
      strokeWidth() { return this; },
      position() { return this; },
      locked() { return this; },
      disableHit() { return this; },
      layer() { return this; },
      metadata() { return this; },
      name() { return this; },
      build() { return { id: "path" }; },
    }),
    Command: { MOVE: 0, LINE: 1, CUBIC: 2, CLOSE: 3 },
  },
});

const clientEffects = await import("../src/effectsMutations.js?lightning-arrow-client");
globalThis.location = { pathname: "/background.html" };
const backgroundEffects = await import("../src/effectsMutations.js?lightning-arrow-background");
globalThis.location = { pathname: "/plugin.html" };
const baseEffects = await import("../src/effectsMutations.js?lightning-arrow-base");
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

const history = await import("../src/history.js?lightning-arrow-history");
const historyOwner = await import("../src/historyOwner.js?lightning-arrow-owner");
mock.module("../src/history.js", { exports: { ...history } });
const { currentSceneEpoch, markSceneEpochReady } = await import("../src/sceneEpoch.js");
const { buildSpellUnifiedPanelContract, createSpellPanelSession } = await import(
  "../src/spellUnifiedPanelCore.js?lightning-arrow-panel",
);
const { buildSpellAreaResolutionCommand } = await import(
  "../src/spellAreaResolutionCommandCore.js?lightning-arrow-command",
);
const { executeSpellAreaResolution } = await import(
  "../src/spellAreaResolutionExecutor.js?lightning-arrow-executor",
);
const { executeSpellApplication } = await import(
  "../src/spellApplicationExecutor.js?lightning-arrow-application",
);
const { executeSpellUnifiedLifecycle } = await import(
  "../src/spellUnifiedLifecycleAdapter.js?lightning-arrow-lifecycle",
);
const { normalizeHistoryUndoResult, HISTORY_UNDO_OUTCOME } = await import(
  "../src/historyUndoResultCore.js",
);

const CASTER_ID = "lightning-caster";
const PRIMARY_ID = "lightning-primary";
const SECONDARY_ID = "lightning-secondary";
const SPELL_ID = "phb2014-freccia-folgorante";

function sleep() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function settleEffectsHistory() {
  const epoch = currentSceneEpoch();
  for (let attempt = 0; attempt < 30; attempt += 1) {
    clientEffects.flushPendingEffectsHistory(epoch);
    backgroundEffects.flushPendingEffectsHistory(epoch);
    await sleep();
    if (!clientEffects.hasPendingEffectsHistory(epoch)
      && !backgroundEffects.hasPendingEffectsHistory(epoch)) return;
  }
  assert.fail("Effects History non converge");
}

async function resetScene() {
  historyOwner.unmountHistoryOwner();
  backgroundEffects.unmountEffectsMutationCoordinatorService();
  sceneState.metadata = {
    [STATE_KEY]: { round: 1, current: 0, order: [CASTER_ID, PRIMARY_ID, SECONDARY_ID] },
    [HISTORY_KEY]: { version: 1, roomId: sdkStub.room.id, entries: [] },
  };
  sceneState.items = [
    {
      id: CASTER_ID,
      name: "Mago",
      layer: "CHARACTER",
      position: { x: 0, y: 0 },
      metadata: {
        [META_KEY]: {
          hp: 50,
          hpMax: 50,
          conditions: [],
          [SPELLS_KEY]: [],
          [CONCENTRATION_KEY]: {},
        },
      },
    },
    {
      id: PRIMARY_ID,
      name: "Primario",
      layer: "CHARACTER",
      position: { x: 300, y: 300 },
      metadata: { [META_KEY]: { hp: 50, hpMax: 50, conditions: [], [SPELLS_KEY]: [] } },
    },
    {
      id: SECONDARY_ID,
      name: "Secondario",
      layer: "CHARACTER",
      position: { x: 450, y: 300 },
      metadata: { [META_KEY]: { hp: 30, hpMax: 30, conditions: [], [SPELLS_KEY]: [] } },
    },
  ];
  markSceneEpochReady("lightning-arrow-reset");
  await historyOwner.mountHistoryOwner();
  await backgroundEffects.mountEffectsMutationCoordinatorService();
}

function runtimeFor(epoch) {
  return {
    sceneEpoch: epoch,
    isCurrent: () => true,
    readItems: sdkStub.scene.items.getItems,
    readAllItems: () => sdkStub.scene.items.getItems(),
    readSceneMetadata: sdkStub.scene.getMetadata,
    getInitiativeActorId: async () => CASTER_ID,
    updateItems: sdkStub.scene.items.updateItems,
    addItems: sdkStub.scene.items.addItems,
    deleteItems: sdkStub.scene.items.deleteItems,
    validateSpatial: async () => ({ valid: true, errors: [] }),
    createSpellInstanceId: async () => "lightning-runtime-instance",
    runEffectsMutation: clientEffects.runEffectsMutation,
    requireAppliedEffectsMutation: clientEffects.requireAppliedEffectsMutation,
    withItemMetaHistory: history.withItemMetaHistory,
    getHistoryEntries: history.getHistoryEntries,
    syncHPVisuals: async () => {},
    readAuthoritativeHPVisualUpdates: async () => [],
    syncHPBatchToMemory: async () => {},
    getZeroHPConditionHistoryIds: async () => [],
    onConcentrationWarnings: async () => {},
    onEffectSaveWarnings: async () => {},
    emitFireballVisual: async () => {},
    emitMatchedSpellVisual: async () => {},
  };
}

test.after(() => {
  backgroundEffects.unmountEffectsMutationCoordinatorService();
  historyOwner.unmountHistoryOwner();
  globalThis.indexedDB = previousIndexedDB;
  globalThis.IDBKeyRange = previousKeyRange;
  if (previousLocation === undefined) delete globalThis.location;
  else globalThis.location = previousLocation;
});

test("Lightning Arrow: prepare → resolve composito → Undo ripristina HP, parent e concentrazione", async () => {
  await resetScene();
  const epoch = currentSceneEpoch();
  const runtime = runtimeFor(epoch);

  const prepareContract = buildSpellUnifiedPanelContract({
    spellId: SPELL_ID,
    phase: "prepare",
    castContext: { slotLevel: 3 },
  });
  const prepareSession = createSpellPanelSession({
    contract: prepareContract,
    phase: "prepare",
    casterId: CASTER_ID,
    slotLevel: 3,
    requestedConcentration: true,
  });
  const prepared = await executeSpellUnifiedLifecycle({
    contract: prepareContract,
    session: prepareSession,
    runtime: {
      sceneEpoch: epoch,
      isCurrent: () => true,
      executor: executeSpellApplication,
    },
  });
  assert.equal(prepared.status, "committed", JSON.stringify(prepared));
  await settleEffectsHistory();

  const casterAfterPrepare = (await sdkStub.scene.items.getItems([CASTER_ID]))[0];
  const parent = casterAfterPrepare.metadata[META_KEY][SPELLS_KEY]
    .find((entry) => entry.spellId === SPELL_ID);
  assert.ok(parent?.instanceId, "prepare deve creare l'istanza parent");
  const preparedSpellSnapshot = clone(casterAfterPrepare.metadata[META_KEY][SPELLS_KEY]);
  const preparedConcentrationSnapshot = clone(casterAfterPrepare.metadata[META_KEY][CONCENTRATION_KEY]);

  const resolveContract = buildSpellUnifiedPanelContract({
    spellId: SPELL_ID,
    phase: "resolve",
    castContext: { slotLevel: 3 },
  });
  const placement = {
    status: "confirmed",
    confirmed: true,
    ruleId: `${SPELL_ID}:cast`,
    spellId: SPELL_ID,
    casterId: CASTER_ID,
    targetLocked: true,
    targetIds: [PRIMARY_ID, SECONDARY_ID],
    anchorTargetId: PRIMARY_ID,
    preview: {
      type: "circle",
      start: { x: 375, y: 375 },
      end: { x: 675, y: 375 },
      radius: 450,
      gridOrigin: { x: 0, y: 0 },
      dpi: 150,
      anchorTargetId: PRIMARY_ID,
      anchorOrigin: { x: 375, y: 375 },
      targetIds: [PRIMARY_ID, SECONDARY_ID],
      targetLocked: true,
    },
  };
  const resolveSession = createSpellPanelSession({
    contract: resolveContract,
    phase: "resolve",
    casterId: CASTER_ID,
    slotLevel: 3,
    activeConcentration: {
      instanceId: parent.instanceId,
      spellId: SPELL_ID,
      name: "Freccia Folgorante",
    },
    targetIds: [PRIMARY_ID, SECONDARY_ID],
    primaryTargetId: PRIMARY_ID,
    outcomes: { [PRIMARY_ID]: "failed", [SECONDARY_ID]: "passed" },
    hpValues: { primaryDamage: 13, damage: 7 },
    placement,
  });
  const command = buildSpellAreaResolutionCommand({
    contract: resolveContract,
    session: resolveSession,
    source: { kind: "prepared-resolution", sceneEpoch: epoch, parentInstanceId: parent.instanceId },
    casterId: CASTER_ID,
    parentInstanceId: parent.instanceId,
    targetIds: [PRIMARY_ID, SECONDARY_ID],
    candidateTargetIds: [PRIMARY_ID, SECONDARY_ID],
    primaryTargetId: PRIMARY_ID,
    outcomes: { [PRIMARY_ID]: "failed", [SECONDARY_ID]: "passed" },
    hp: { mode: "damage", amount: 7, primaryAmount: 13 },
    placement,
    targetLocked: true,
    sceneEpoch: epoch,
    currentSceneEpoch: epoch,
    validateSpatial: false,
  });
  assert.equal(command.valid, true, command.errors?.join(", "));
  assert.equal(command.outcomes.attack, undefined);
  assert.equal(command.hp.primaryDamageMode, "final-applied");

  const resolved = await executeSpellAreaResolution(command, runtime);
  assert.equal(resolved.status, "applied", JSON.stringify(resolved));
  await settleEffectsHistory();
  const afterResolve = await sdkStub.scene.items.getItems();
  const primaryAfterResolve = afterResolve.find((item) => item.id === PRIMARY_ID);
  const secondaryAfterResolve = afterResolve.find((item) => item.id === SECONDARY_ID);
  const casterAfterResolve = afterResolve.find((item) => item.id === CASTER_ID);
  assert.equal(primaryAfterResolve.metadata[META_KEY].hp, 30);
  assert.equal(secondaryAfterResolve.metadata[META_KEY].hp, 27);
  assert.equal(casterAfterResolve.metadata[META_KEY][SPELLS_KEY].some((entry) => entry.instanceId === parent.instanceId), false);
  assert.equal(Object.keys(casterAfterResolve.metadata[META_KEY][CONCENTRATION_KEY]).length, 0);

  const staleSecondResolve = await executeSpellAreaResolution(command, runtime);
  assert.equal(staleSecondResolve.status, "rejected");
  assert.equal(staleSecondResolve.errors[0].code, "prepared-instance-missing");

  const entries = await history.getHistoryEntries();
  const resolutionEntry = entries.find((entry) => entry.id === resolved.historyEntryId);
  assert.ok(resolutionEntry, "la risoluzione deve produrre una History entry");
  assert.deepEqual(
    resolutionEntry.changes.map((change) => change.id).sort(),
    [CASTER_ID, PRIMARY_ID, SECONDARY_ID].sort(),
  );
  const effectChanges = resolutionEntry.effectsMutation?.changes || [];
  assert.ok(resolutionEntry.changes.some((change) => change.after?.hp?.value === 30));
  assert.ok(resolutionEntry.changes.some((change) => change.after?.hp?.value === 27));
  assert.ok(effectChanges.some((change) => change.fields?.spells));
  assert.ok(effectChanges.some((change) => change.fields?.concentrations));
  assert.ok(effectChanges.some((change) => change.metadataFields?.hp));

  const undo = await history.undoHistoryThrough(resolved.historyEntryId, { sceneEpoch: epoch });
  assert.equal(
    normalizeHistoryUndoResult(undo).outcome,
    HISTORY_UNDO_OUTCOME.COMMITTED,
    JSON.stringify(undo),
  );
  const afterUndo = await sdkStub.scene.items.getItems();
  const primaryAfterUndo = afterUndo.find((item) => item.id === PRIMARY_ID);
  const secondaryAfterUndo = afterUndo.find((item) => item.id === SECONDARY_ID);
  const casterAfterUndo = afterUndo.find((item) => item.id === CASTER_ID);
  assert.equal(primaryAfterUndo.metadata[META_KEY].hp, 50);
  assert.equal(secondaryAfterUndo.metadata[META_KEY].hp, 30);
  assert.deepEqual(casterAfterUndo.metadata[META_KEY][SPELLS_KEY], preparedSpellSnapshot);
  assert.deepEqual(casterAfterUndo.metadata[META_KEY][CONCENTRATION_KEY], preparedConcentrationSnapshot);

  await sdkStub.scene.items.updateItems([CASTER_ID], (drafts) => {
    const meta = drafts[0].metadata[META_KEY];
    meta[SPELLS_KEY] = meta[SPELLS_KEY].map((entry) => ({
      ...entry,
      instanceId: "lightning-new-instance",
    }));
    meta[CONCENTRATION_KEY] = Object.fromEntries(
      Object.entries(meta[CONCENTRATION_KEY]).map(([key, entry]) => [
        key,
        { ...entry, instanceId: "lightning-new-instance" },
      ]),
    );
  });
  const oldPopupAgainstNewInstance = await executeSpellAreaResolution(command, runtime);
  assert.equal(oldPopupAgainstNewInstance.status, "rejected");
  assert.equal(oldPopupAgainstNewInstance.errors[0].code, "prepared-instance-stale");
});
