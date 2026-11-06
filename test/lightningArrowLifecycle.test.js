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
const { buildSpellActiveResolutionPayload, getSpellResolutionAction } = await import(
  "../src/spellActiveResolutionCore.js",
);
const { executeSpellActiveResolution, executeSpellApplication } = await import(
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

test.after(() => {
  backgroundEffects.unmountEffectsMutationCoordinatorService();
  historyOwner.unmountHistoryOwner();
  globalThis.indexedDB = previousIndexedDB;
  globalThis.IDBKeyRange = previousKeyRange;
  if (previousLocation === undefined) delete globalThis.location;
  else globalThis.location = previousLocation;
});

test("Lightning Arrow: prepared in the panel, resolved in the popup of its action, one Undo puts back HP, parent and concentration", async () => {
  await resetScene();
  const epoch = currentSceneEpoch();

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

  // The popup of its action, as the caster's turn opens it: the arrow's hit on its target, then the burst around it.
  const payload = buildSpellActiveResolutionPayload({
    spell: { id: SPELL_ID, name: "Freccia Folgorante", level: 3 },
    action: getSpellResolutionAction(SPELL_ID, "lightning-arrow-area"),
    group: { instanceId: parent.instanceId, casterId: CASTER_ID, castContext: { slotLevel: 3 } },
    sceneEpoch: epoch,
  });
  const resolution = {
    payload,
    // 3 m around the target's centre, its cells counted from its own, as the area tool does.
    placement: {
      type: "circle",
      start: { x: 375, y: 375 },
      end: { x: 675, y: 375 },
      gridOrigin: { x: 300, y: 300 },
      dpi: 150,
      anchorTargetId: PRIMARY_ID,
      anchorOrigin: { x: 375, y: 375 },
      targetIds: [SECONDARY_ID],
    },
    targetIds: [SECONDARY_ID],
    outcomes: { [SECONDARY_ID]: "passed" },
    damageRoll: 7,
    directHit: { targetId: PRIMARY_ID, attackOutcome: "hit", damageRoll: 13 },
  };
  await executeSpellActiveResolution(resolution);
  await settleEffectsHistory();
  const byId = (items, id) => items.find((item) => item.id === id);
  const afterResolve = await sdkStub.scene.items.getItems();
  assert.equal(byId(afterResolve, PRIMARY_ID).metadata[META_KEY].hp, 37, "the hit, 13");
  assert.equal(byId(afterResolve, SECONDARY_ID).metadata[META_KEY].hp, 27, "the burst, 7 halved by the save");
  const casterAfterResolve = byId(afterResolve, CASTER_ID);
  assert.equal(casterAfterResolve.metadata[META_KEY][SPELLS_KEY].some((entry) => entry.instanceId === parent.instanceId), false);
  assert.equal(Object.keys(casterAfterResolve.metadata[META_KEY][CONCENTRATION_KEY]).length, 0);

  // The same popup pressed again: the arrow is spent.
  await assert.rejects(executeSpellActiveResolution(resolution), /spell-instance-missing/);

  const entries = await history.getHistoryEntries();
  const resolutionEntry = entries.at(-1);
  assert.ok(resolutionEntry, "la risoluzione deve produrre una History entry");
  assert.deepEqual(
    [...new Set(resolutionEntry.changes.map((change) => change.id))].sort(),
    [CASTER_ID, PRIMARY_ID, SECONDARY_ID].sort(),
  );

  const undo = await history.undoHistoryThrough(resolutionEntry.id, { sceneEpoch: epoch });
  assert.equal(
    normalizeHistoryUndoResult(undo).outcome,
    HISTORY_UNDO_OUTCOME.COMMITTED,
    JSON.stringify(undo),
  );
  const afterUndo = await sdkStub.scene.items.getItems();
  assert.equal(byId(afterUndo, PRIMARY_ID).metadata[META_KEY].hp, 50);
  assert.equal(byId(afterUndo, SECONDARY_ID).metadata[META_KEY].hp, 30);
  assert.deepEqual(byId(afterUndo, CASTER_ID).metadata[META_KEY][SPELLS_KEY], preparedSpellSnapshot);
  assert.deepEqual(byId(afterUndo, CASTER_ID).metadata[META_KEY][CONCENTRATION_KEY], preparedConcentrationSnapshot);

  // An old popup against a new instance of the arrow: refused.
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
  await assert.rejects(executeSpellActiveResolution(resolution), /spell-instance-missing/);
});
