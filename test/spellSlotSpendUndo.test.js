// A spell slot spent with the cast: same command, same History entry, given back by the production Undo.
// Harness: the in-memory SDK, effects coordinator and History owner of immolationRealUndoRepro.test.js.
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

const clone = (value) => value === undefined ? undefined : structuredClone(value);
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

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

const itemChangeListeners = new Set();

function emitItemsChange() {
  const items = sceneState.items.map(clone);
  for (const listener of [...itemChangeListeners]) {
    try { listener(items); } catch {}
  }
}

const sdkStub = {
  onReady: () => {},
  player: { getRole: async () => "GM" },
  room: { id: "spell-slot-room", getMetadata: async () => ({}) },
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
      getItems: async (predicateOrIds) => {
        if (!predicateOrIds) return currentItems();
        if (Array.isArray(predicateOrIds)) return currentItems(predicateOrIds);
        if (typeof predicateOrIds === "function") {
          return sceneState.items.filter(predicateOrIds).map(clone);
        }
        return currentItems();
      },
      updateItems: async (predicateOrIds, updater) => {
        let targets = [];
        if (typeof predicateOrIds === "function") {
          targets = sceneState.items.filter(predicateOrIds).map(clone);
        } else if (Array.isArray(predicateOrIds)) {
          const set = new Set(predicateOrIds);
          targets = sceneState.items.filter((it) => set.has(it.id)).map(clone);
        } else {
          targets = sceneState.items.map(clone);
        }
        await updater(targets);
        const byId = new Map(targets.map((item) => [item.id, item]));
        sceneState.items = sceneState.items.map((item) => byId.get(item.id) || item);
        emitItemsChange();
      },
      deleteItems: async (ids) => {
        const wanted = new Set(ids || []);
        sceneState.items = sceneState.items.filter((item) => !wanted.has(item.id));
        emitItemsChange();
      },
      addItems: async (items) => {
        sceneState.items.push(...clone(items || []));
        emitItemsChange();
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
      for (const listener of [...(broadcastListeners.get(channel) || [])]) {
        await listener({ data: clone(data) });
      }
    },
  },
};

mock.module("@owlbear-rodeo/sdk", {
  exports: {
    default: sdkStub,
    buildLabel: (...args) => ({ type: "LABEL", args }),
    buildImage: (...args) => ({ type: "IMAGE", args }),
    buildPath: () => ({
      commands: () => ({
        fillRule: () => ({
          fillColor: () => ({
            fillOpacity: () => ({
              strokeColor: () => ({
                strokeOpacity: () => ({
                  strokeWidth: () => ({
                    position: () => ({
                      locked: () => ({
                        disableHit: () => ({
                          layer: () => ({
                            metadata: () => ({
                              name: () => ({
                                build: () => ({ id: "mock-path" }),
                              }),
                            }),
                          }),
                        }),
                      }),
                    }),
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    }),
    buildText: (...args) => ({ type: "TEXT", args }),
    buildShape: (...args) => ({ type: "SHAPE", args }),
    Command: class Command {},
  },
});

const clientEffects = await import("../src/effectsMutations.js?slot-real-client");
globalThis.location = { pathname: "/background.html" };
const backgroundEffects = await import("../src/effectsMutations.js?slot-real-background");
globalThis.location = { pathname: "/plugin.html" };
const baseEffects = await import("../src/effectsMutations.js?slot-real-base");
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

const history = await import("../src/history.js?slot-real-history");
const historyOwner = await import("../src/historyOwner.js?slot-real-owner");
mock.module("../src/history.js", { exports: { ...history } });
const { currentSceneEpoch, markSceneEpochReady } = await import("../src/sceneEpoch.js");
const { buildSpellUnifiedPanelContract } = await import("../src/spellUnifiedPanelCore.js?slot-real-panel");
const { buildSpellAreaResolutionCommand } = await import("../src/spellAreaResolutionCommandCore.js?slot-real-command");
const { executeSpellAreaResolution } = await import("../src/spellAreaResolutionExecutor.js?slot-real-executor");
const { executeSpellApplication } = await import("../src/spellApplicationExecutor.js?slot-real-application");
const { getSpellDefinition } = await import("../src/spells-srd.js");
const { normalizeHistoryUndoResult, HISTORY_UNDO_OUTCOME } = await import("../src/historyUndoResultCore.js");
const { planSpellSlotSpend, spellSlotSpendOperation } = await import("../src/spellSlotSpendCore.js");

const CASTER_ID = "caster-slot";
const TARGET_ID = "target-slot";
const BUILD = [{ classId: "mago", level: 9 }];

async function resetScene() {
  historyOwner.unmountHistoryOwner();
  backgroundEffects.unmountEffectsMutationCoordinatorService();
  sceneState.metadata = {
    [STATE_KEY]: { round: 1, current: 0, order: [CASTER_ID, TARGET_ID] },
    ["com.thebigpicture.initiative/history"]: { version: 1, roomId: "spell-slot-room", entries: [] },
  };
  const token = (id, name, x, extra = {}) => ({
    id,
    name,
    layer: "CHARACTER",
    position: { x, y: 0 },
    metadata: { [META_KEY]: { hp: 60, hpMax: 60, inInitiative: true, conditions: [], [CONCENTRATION_KEY]: {}, [SPELLS_KEY]: [], ...extra } },
  });
  sceneState.items = [
    token(CASTER_ID, "Maga", 0, { attitude: "pc", initiativeCard: { characterBuild: BUILD } }),
    token(TARGET_ID, "Nemico", 200),
  ];
  markSceneEpochReady("slot-reset");
  await historyOwner.mountHistoryOwner();
  await backgroundEffects.mountEffectsMutationCoordinatorService();
}

async function convergeDeferredEffectsHistory() {
  const sceneEpoch = currentSceneEpoch();
  for (let attempt = 0; attempt < 20; attempt += 1) {
    clientEffects.flushPendingEffectsHistory(sceneEpoch);
    backgroundEffects.flushPendingEffectsHistory(sceneEpoch);
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (!clientEffects.hasPendingEffectsHistory(sceneEpoch) && !backgroundEffects.hasPendingEffectsHistory(sceneEpoch)) return;
  }
  assert.fail("Deferred Effects History did not converge");
}

async function casterSlots() {
  const [caster] = await sdkStub.scene.items.getItems([CASTER_ID]);
  return caster.metadata[META_KEY].classFeatureState?.resources || {};
}

function slotOperation(spellLevel) {
  const { spend } = planSpellSlotSpend({ characterBuild: BUILD, spellLevel });
  return spellSlotSpendOperation({ sourceId: CASTER_ID, poolId: spend.poolId, characterBuild: BUILD });
}

async function undoLast() {
  await convergeDeferredEffectsHistory();
  const entries = await history.getHistoryEntries();
  const last = entries[entries.length - 1];
  const result = normalizeHistoryUndoResult(await history.undoHistoryThrough(last.id, { sceneEpoch: currentSceneEpoch() }));
  assert.equal(result.outcome, HISTORY_UNDO_OUTCOME.COMMITTED, `Undo: ${result.outcome}`);
  return { entries, last };
}

const areaRuntime = () => ({
  getItems: sdkStub.scene.items.getItems,
  updateItems: sdkStub.scene.items.updateItems,
  deleteItems: sdkStub.scene.items.deleteItems,
  getSceneMetadata: sdkStub.scene.getMetadata,
  setSceneMetadata: sdkStub.scene.setMetadata,
  currentSceneEpoch,
  isCurrent: () => true,
  syncHPVisuals: async () => {},
  emitFireballVisual: async () => {},
  withItemMetaHistory: history.withItemMetaHistory,
});

function immolationCommand(targetIds) {
  const contract = buildSpellUnifiedPanelContract({ spellId: "xanathar-immolazione" });
  return buildSpellAreaResolutionCommand({
    contract,
    spellId: "xanathar-immolazione",
    phase: "cast",
    casterId: CASTER_ID,
    slotLevel: 5,
    targetIds,
    outcomes: Object.fromEntries(targetIds.map((id) => [id, "failed"])),
    hpAmount: 28,
    validateSpatial: false,
  });
}

test.after(() => {
  backgroundEffects.unmountEffectsMutationCoordinatorService();
  historyOwner.unmountHistoryOwner();
  globalThis.indexedDB = previousIndexedDB;
  globalThis.IDBKeyRange = previousKeyRange;
  if (previousLocation === undefined) delete globalThis.location;
  else globalThis.location = previousLocation;
});

test("area cast: the slot is spent in the spell's command and the Undo gives it back", async () => {
  await resetScene();
  const result = await executeSpellAreaResolution(immolationCommand([TARGET_ID]), {
    ...areaRuntime(),
    extraOperations: [slotOperation(5)],
  });
  assert.equal(result.status, "applied");
  assert.deepEqual((await casterSlots())["spell-slot-5"], { current: 0, maximum: 1, unlimited: false });
  const [target] = await sdkStub.scene.items.getItems([TARGET_ID]);
  assert.equal(target.metadata[META_KEY].hp, 32);
  const { entries } = await undoLast();
  assert.equal(entries.length, 1, "spell and slot share one History entry");
  assert.equal((await casterSlots())["spell-slot-5"]?.current ?? 1, 1);
  const [restored] = await sdkStub.scene.items.getItems([TARGET_ID]);
  assert.equal(restored.metadata[META_KEY].hp, 60);
});

test("lifecycle cast: the slot is spent with the spell and the Undo gives it back", async () => {
  await resetScene();
  await executeSpellApplication({
    spell: getSpellDefinition("bless"),
    casterId: CASTER_ID,
    targetIds: [TARGET_ID],
    turns: 10,
    castContext: { slotLevel: 1, phase: "cast" },
    extraOperations: [slotOperation(1)],
  });
  const [caster] = await sdkStub.scene.items.getItems([CASTER_ID]);
  assert.ok(Object.keys(caster.metadata[META_KEY][CONCENTRATION_KEY] || {}).length, "Bless is cast");
  assert.equal((await casterSlots())["spell-slot-1"].current, 3);
  const { entries } = await undoLast();
  assert.equal(entries.length, 1, "spell and slot share one History entry");
  assert.equal((await casterSlots())["spell-slot-1"]?.current ?? 4, 4);
});

// An innate spell of the species (speciesInnateSpellCore.js): the trait's use is the cast's cost, in the same command.
test("an innate spell of the species spends the trait's use with the cast, and one Undo gives it back", async () => {
  await resetScene();
  const { planSpeciesSpellCost, speciesSpellActionId, speciesSpellCast } = await import("../src/speciesInnateSpellCore.js");
  const card = { characterBuild: BUILD, abilityModifiers: { cha: 3 }, species: { id: "yuan-ti", ancestryId: "" } };
  const cast = speciesSpellCast({ actionId: speciesSpellActionId("specie-yuan-ti-incantesimi-innati-suggestione"), card, spellId: "suggestion" });
  const { operation } = planSpeciesSpellCost({ cast, sourceId: CASTER_ID, card });
  await executeSpellApplication({
    spell: getSpellDefinition("suggestion"),
    casterId: CASTER_ID,
    targetIds: [TARGET_ID],
    turns: 4800,
    castContext: { slotLevel: 2, phase: "cast", spellSaveDC: cast.dc },
    extraOperations: [operation],
  });
  assert.equal((await casterSlots())["specie-yuan-ti-suggestione-usi"].current, 0);
  assert.equal((await casterSlots())["spell-slot-2"], undefined, "no slot spent");
  const { entries } = await undoLast();
  assert.equal(entries.length, 1, "spell and use share one History entry");
  assert.equal((await casterSlots())["specie-yuan-ti-suggestione-usi"]?.current ?? 1, 1);
});

test("a cast without extra operations leaves the resources alone", async () => {
  await resetScene();
  await executeSpellApplication({
    spell: getSpellDefinition("bless"),
    casterId: CASTER_ID,
    targetIds: [TARGET_ID],
    turns: 10,
    castContext: { slotLevel: 1, phase: "cast" },
  });
  assert.deepEqual(await casterSlots(), {});
});

test("a Fireball that catches nobody still spends the slot, and the Undo gives it back", async () => {
  await resetScene();
  const contract = buildSpellUnifiedPanelContract({ spellId: "fireball", phase: "cast" });
  const ruleId = contract.presentation?.placement?.ruleId;
  const preview = { type: "circle", start: { x: 900, y: 900 }, end: { x: 1050, y: 900 }, gridOrigin: { x: 0, y: 0 }, dpi: 150, targetIds: [], targetLocked: true };
  const command = buildSpellAreaResolutionCommand({
    contract,
    spellId: "fireball",
    phase: "cast",
    casterId: CASTER_ID,
    slotLevel: 3,
    targetIds: [],
    candidateTargetIds: [],
    outcomes: {},
    placement: { status: "confirmed", confirmed: true, ruleId, spellId: "fireball", casterId: CASTER_ID, targetLocked: true, targetIds: [], preview },
    targetLocked: true,
    hp: { mode: "damage", amount: 12 },
    validateSpatial: false,
  });
  assert.equal(command.valid, true);
  const result = await executeSpellAreaResolution(command, { ...areaRuntime(), extraOperations: [slotOperation(3)] });
  assert.notEqual(result.status, "rejected");
  assert.equal((await casterSlots())["spell-slot-3"].current, 2);
  await undoLast();
  assert.equal((await casterSlots())["spell-slot-3"]?.current ?? 3, 3);
});

const { createClassFeatureSpellSlot, convertClassFeatureSpellSlot } = await import("../src/classFeatureRuntime.js?slot-real-runtime");
const SORCERER = [{ classId: "stregone", level: 5 }];

async function resetSorcerer(resources = {}) {
  await resetScene();
  const caster = sceneState.items.find((item) => item.id === CASTER_ID);
  caster.metadata[META_KEY].initiativeCard = { characterBuild: SORCERER };
  caster.metadata[META_KEY].classFeatureState = { version: 1, resources, instances: [] };
}

test("Font of Magic: a created slot joins the inventory above the maximum, in one Undo with its points", async () => {
  await resetSorcerer();
  await createClassFeatureSpellSlot({ sourceId: CASTER_ID, slotLevel: 1 });
  const created = await casterSlots();
  assert.equal(created["spell-slot-1"].current, 5, "4 slots of 1st level and the created one");
  assert.equal(created["stregone-punti-stregoneria"].current, 3);
  const { entries } = await undoLast();
  assert.equal(entries.length, 1);
  const restored = await casterSlots();
  assert.equal(restored["spell-slot-1"]?.current ?? 4, 4);
  assert.equal(restored["stregone-punti-stregoneria"]?.current ?? 5, 5);
});

test("Font of Magic: converting spends a slot of that level for its points, or is refused without one", async () => {
  await resetSorcerer({ "stregone-punti-stregoneria": { current: 1, maximum: 5 } });
  await convertClassFeatureSpellSlot({ sourceId: CASTER_ID, slotLevel: 3 });
  const converted = await casterSlots();
  assert.equal(converted["spell-slot-3"].current, 1);
  assert.equal(converted["stregone-punti-stregoneria"].current, 4);
  await undoLast();
  assert.equal((await casterSlots())["spell-slot-3"]?.current ?? 2, 2);

  await resetSorcerer({ "spell-slot-3": { current: 0, maximum: 2 } });
  await assert.rejects(
    convertClassFeatureSpellSlot({ sourceId: CASTER_ID, slotLevel: 3 }),
    /Nessuno slot di quel livello disponibile/,
  );
  await assert.rejects(convertClassFeatureSpellSlot({ sourceId: CASTER_ID, slotLevel: 4 }), /Nessuno slot/);
});

const { shortRestClassFeatureResources, resetClassFeatureResources } = await import("../src/classFeatureRuntime.js?slot-real-runtime");

test("a short rest restores Pact Magic but not the other slots; the long rest restores everything, quick action uses too", async () => {
  await resetScene();
  const caster = sceneState.items.find((item) => item.id === CASTER_ID);
  caster.metadata[META_KEY].initiativeCard = {
    characterBuild: [{ classId: "stregone", level: 3 }, { classId: "warlock", level: 2 }],
    quickActions: [{ version: 2, id: "misty", label: "Passo velato", kind: "spell", spellId: "misty-step", targetMode: "self",
      slotLevel: null, turns: null, applyAutomations: true, launchMode: "auto", cost: "uses", uses: 1 }],
  };
  caster.metadata[META_KEY].classFeatureState = { version: 1, instances: [], resources: {
    "spell-slot-1": { current: 0, maximum: 4 },
    "spell-slot-pact": { current: 0, maximum: 2 },
    "stregone-punti-stregoneria": { current: 0, maximum: 3 },
    "quick-action-uses:misty": { current: 0, maximum: 1 },
  } };
  await shortRestClassFeatureResources(CASTER_ID);
  let resources = await casterSlots();
  assert.equal(resources["spell-slot-pact"].current, 2);
  assert.equal(resources["spell-slot-1"].current, 0);
  assert.equal(resources["stregone-punti-stregoneria"].current, 0);
  assert.equal(resources["quick-action-uses:misty"].current, 0);
  await resetClassFeatureResources(CASTER_ID);
  resources = await casterSlots();
  assert.deepEqual([resources["spell-slot-1"].current, resources["stregone-punti-stregoneria"].current, resources["quick-action-uses:misty"].current], [4, 3, 1]);
});

// A spell the plugin does not automate (spellCastRecord.js): the cast spends its slot in its own command and History
// entry, with no pill, and the production Undo gives the slot back; a cast that spends nothing goes to the combat log.
const { getActiveCombatLogData } = await import("../src/combatLog.js");

async function combatLogSpellEvents() {
  const { events } = await getActiveCombatLogData();
  return events.filter((event) => event.category === "spell");
}

test("a recorded cast spends its slot in one History entry, leaves no pill, and the Undo gives the slot back", async () => {
  await resetScene();
  await executeSpellApplication({
    spell: getSpellDefinition("counterspell"),
    casterId: CASTER_ID,
    casterName: "Maga",
    targetIds: [TARGET_ID],
    castContext: { slotLevel: 3, phase: "cast" },
    extraOperations: [slotOperation(3)],
    castCost: "slot di 3° livello",
    recordOnly: true,
  });
  assert.equal((await casterSlots())["spell-slot-3"].current, 2);
  const [target] = await sdkStub.scene.items.getItems([TARGET_ID]);
  assert.deepEqual(target.metadata[META_KEY][SPELLS_KEY], [], "no pill: the table resolves Counterspell");
  await convergeDeferredEffectsHistory();
  const [entry] = await history.getHistoryEntries();
  assert.equal(entry.label, "Incantesimo: Controincantesimo");
  assert.equal(entry.payload.causality.recorded, true);
  assert.deepEqual(entry.payload.causality.cost, { label: "slot di 3° livello" });
  assert.deepEqual(entry.payload.causality.targets, [{ id: TARGET_ID, name: "Nemico" }]);
  const [logged] = await combatLogSpellEvents();
  assert.equal(logged?.label, "Incantesimo: Controincantesimo", "the History owner writes its combat log entry");
  const { entries } = await undoLast();
  assert.equal(entries.length, 1);
  assert.equal((await casterSlots())["spell-slot-3"]?.current ?? 3, 3);
});

test("a recorded cast that spends nothing has no History entry and goes to the combat log", async () => {
  await resetScene();
  await executeSpellApplication({
    spell: getSpellDefinition("mending"),
    casterId: CASTER_ID,
    casterName: "Maga",
    targetIds: [],
    castContext: { slotLevel: 0, phase: "cast" },
    recordOnly: true,
  });
  await convergeDeferredEffectsHistory();
  assert.deepEqual(await history.getHistoryEntries(), [], "nothing changed, nothing to undo");
  assert.deepEqual(await casterSlots(), {});
  const events = await combatLogSpellEvents();
  const logged = events.find((event) => event.label === "Incantesimo: Riparare");
  assert.ok(logged, "the cast is in the combat log");
  assert.equal(logged.historyEntryId, "");
  assert.equal(logged.provenance?.recordingSource, "spell-cast-record");
  assert.equal(logged.payload?.causality?.recorded, true);
});

test("an automated cast names what it spent in its causality", async () => {
  await resetScene();
  await executeSpellApplication({
    spell: getSpellDefinition("bless"),
    casterId: CASTER_ID,
    targetIds: [TARGET_ID],
    turns: 10,
    castContext: { slotLevel: 1, phase: "cast" },
    extraOperations: [slotOperation(1)],
    castCost: "slot di 1° livello",
  });
  await convergeDeferredEffectsHistory();
  const [entry] = await history.getHistoryEntries();
  assert.deepEqual(entry.payload.causality.cost, { label: "slot di 1° livello" });
  assert.equal(entry.payload.causality.recorded, undefined);
  const [target] = await sdkStub.scene.items.getItems([TARGET_ID]);
  assert.equal(target.metadata[META_KEY][SPELLS_KEY].length, 1, "Bless keeps its pill");
});

test("an area cast names its slot level and what it spent in its causality", async () => {
  await resetScene();
  const result = await executeSpellAreaResolution(immolationCommand([TARGET_ID]), {
    ...areaRuntime(),
    extraOperations: [slotOperation(5)],
    castCost: "slot di 5° livello",
  });
  assert.equal(result.status, "applied");
  await convergeDeferredEffectsHistory();
  const [entry] = await history.getHistoryEntries();
  assert.equal(entry.payload.causality.slotLevel, 5);
  assert.deepEqual(entry.payload.causality.cost, { label: "slot di 5° livello" });
});

// CAP-LINK: Hex moved to a new creature once the cursed one drops to 0 hit points, through the real coordinator. One
// History entry, one Undo: the spell, its pill and the concentration's target go back to the first creature.
test("Hex moves to a new creature with its ability, and one Undo moves it back", async () => {
  await resetScene();
  const SECOND_ID = "second-slot";
  sceneState.items.push({ id: SECOND_ID, name: "Secondo", layer: "CHARACTER", position: { x: 400, y: 0 },
    metadata: { [META_KEY]: { hp: 30, hpMax: 30, inInitiative: true, conditions: [], [CONCENTRATION_KEY]: {}, [SPELLS_KEY]: [] } } });
  const hex = getSpellDefinition("phb2014-sortilegio");
  await executeSpellApplication({ spell: hex, casterId: CASTER_ID, targetIds: [TARGET_ID], turns: 600, selectedChoice: "forza",
    castContext: { slotLevel: 1, phase: "cast", choice: "forza" } });
  const target = sceneState.items.find((item) => item.id === TARGET_ID);
  target.metadata[META_KEY].hp = 0;
  const { spellOverviewGroups } = await import("../src/spellsPanelViewCore.js");
  const { executeSpellActiveAction } = await import("../src/spellApplicationExecutor.js?slot-real-application");
  const group = spellOverviewGroups(sceneState.items).find((entry) => entry.spellId === "phb2014-sortilegio");
  assert.ok(group, "Hex is on the field");
  await executeSpellActiveAction({ spell: hex, actionId: "hex-move", group, selectedTargetIds: [SECOND_ID], casterName: "Maga" });
  await convergeDeferredEffectsHistory();
  const meta = (id) => sceneState.items.find((item) => item.id === id).metadata[META_KEY];
  const pills = (id) => (Array.isArray(meta(id).conditions) ? meta(id).conditions : meta(id).conditions?.instances || []).map((entry) => entry.effectId);
  assert.deepEqual(pills(SECOND_ID), ["hex-forza"], "the same ability on the new creature");
  assert.equal(meta(SECOND_ID)[SPELLS_KEY].length, 1);
  assert.deepEqual(pills(TARGET_ID), []);
  assert.equal(meta(TARGET_ID)[SPELLS_KEY].length, 0);
  const concentration = Object.values(meta(CASTER_ID)[CONCENTRATION_KEY])[0];
  assert.deepEqual(concentration.targets, [SECOND_ID]);
  await undoLast();
  assert.deepEqual(pills(TARGET_ID), ["hex-forza"]);
  assert.deepEqual(pills(SECOND_ID), []);
  assert.deepEqual(Object.values(meta(CASTER_ID)[CONCENTRATION_KEY])[0].targets, [TARGET_ID]);
});
