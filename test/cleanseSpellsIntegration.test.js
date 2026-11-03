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
  room: { id: "cleanse-room", getMetadata: async () => ({}) },
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

const clientEffects = await import("../src/effectsMutations.js?cleanse-real-client");
globalThis.location = { pathname: "/background.html" };
const backgroundEffects = await import("../src/effectsMutations.js?cleanse-real-background");
globalThis.location = { pathname: "/plugin.html" };
const baseEffects = await import("../src/effectsMutations.js?cleanse-real-base");
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

const history = await import("../src/history.js?cleanse-real-history");
const historyOwner = await import("../src/historyOwner.js?cleanse-real-owner");
mock.module("../src/history.js", { exports: { ...history } });
const { currentSceneEpoch, markSceneEpochReady } = await import("../src/sceneEpoch.js");
const { buildSpellUnifiedPanelContract } = await import("../src/spellUnifiedPanelCore.js?cleanse-real-panel");
const { buildSpellAreaResolutionCommand } = await import("../src/spellAreaResolutionCommandCore.js?cleanse-real-command");
const { executeSpellAreaResolution } = await import("../src/spellAreaResolutionExecutor.js?cleanse-real-executor");
const { planEffectSaveReminderNotices } = await import("../src/effectSaveReminderCore.js?cleanse-real-reminder-core");
const { resolveReminder, clearReminderResolutionQueue } = await import("../src/reminderResolution.js?cleanse-real-reminder");
const { normalizeHistoryUndoResult, HISTORY_UNDO_OUTCOME } = await import("../src/historyUndoResultCore.js");
const { refreshConditionLabels } = await import("../src/conditions.js");


async function resetScene(tokens = []) {
  historyOwner.unmountHistoryOwner();
  backgroundEffects.unmountEffectsMutationCoordinatorService();
  clearReminderResolutionQueue();
  sceneState.metadata = {
    [STATE_KEY]: {
      round: 1,
      current: 0,
      order: tokens.map((t) => t.id),
    },
    ["com.thebigpicture.initiative/history"]: {
      version: 1,
      roomId: "cleanse-room",
      entries: [],
    },
  };
  sceneState.items = tokens.map(clone);
  markSceneEpochReady("test-reset");
  await historyOwner.mountHistoryOwner();
  await backgroundEffects.mountEffectsMutationCoordinatorService();
}

async function convergeDeferredEffectsHistory() {
  const sceneEpoch = currentSceneEpoch();
  for (let attempt = 0; attempt < 20; attempt += 1) {
    clientEffects.flushPendingEffectsHistory(sceneEpoch);
    backgroundEffects.flushPendingEffectsHistory(sceneEpoch);
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (
      !clientEffects.hasPendingEffectsHistory(sceneEpoch)
      && !backgroundEffects.hasPendingEffectsHistory(sceneEpoch)
    ) return;
  }
  assert.fail("Deferred Effects History did not converge");
}

test.before(async () => {
  await historyOwner.mountHistoryOwner();
  await backgroundEffects.mountEffectsMutationCoordinatorService();
});

test.after(() => {
  clearReminderResolutionQueue();
  backgroundEffects.unmountEffectsMutationCoordinatorService();
  historyOwner.unmountHistoryOwner();
  globalThis.indexedDB = previousIndexedDB;
  globalThis.IDBKeyRange = previousKeyRange;
  if (previousLocation === undefined) delete globalThis.location;
  else globalThis.location = previousLocation;
});


const CASTER = "caster";
const token = (id, hp, hpMax, extra = {}) => ({ id, name: id, type: "IMAGE", layer: "CHARACTER", position: { x: 0, y: 0 },
  metadata: { [META_KEY]: { hp, hpMax, conditions: { version: 2, instances: [] }, [CONCENTRATION_KEY]: {}, [SPELLS_KEY]: [], ...extra } } });
const meta = (id) => sceneState.items.find((item) => item.id === id).metadata[META_KEY];
const pills = (id) => (meta(id).conditions?.instances || []).filter((entry) => entry.active !== false).map((entry) => entry.condition).sort();

async function cast(spellId, slotLevel, targetId, { outcome = "", amount, status = "applied" } = {}) {
  const contract = buildSpellUnifiedPanelContract({ spellId, phase: "cast", castContext: { slotLevel } });
  const command = buildSpellAreaResolutionCommand({
    contract, spellId, phase: "cast", casterId: CASTER, slotLevel, targetIds: [targetId],
    ...(outcome ? { outcomes: { [targetId]: outcome } } : {}),
    ...(amount !== undefined ? { hpAmount: amount } : {}),
    validateSpatial: false,
  });
  assert.equal(command.valid, true, JSON.stringify(command.errors));
  const result = await executeSpellAreaResolution(command, {
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
  assert.equal(result.status, status, JSON.stringify(result.errors || result.message || result));
  await convergeDeferredEffectsHistory();
  return result;
}

async function undoLast() {
  const entries = await history.getHistoryEntries();
  const result = await history.undoHistoryThrough(entries.at(-1).id, { sceneEpoch: currentSceneEpoch() });
  assert.equal(normalizeHistoryUndoResult(result).outcome, HISTORY_UNDO_OUTCOME.COMMITTED, JSON.stringify(result));
}


const pill = (id, condition, targetId, extra = {}) => ({ id, condition, active: true, targetId, expiry: { mode: "manual" }, ...extra });
const conditions = (instances) => ({ conditions: { version: 2, instances } });

async function castOn(spellId, slotLevel, targetId, targetContexts = null) {
  const contract = buildSpellUnifiedPanelContract({ spellId, phase: "cast", castContext: { slotLevel } });
  const command = buildSpellAreaResolutionCommand({
    contract, spellId, phase: "cast", casterId: CASTER, slotLevel, targetIds: [targetId],
    ...(targetContexts ? { targetContexts } : {}),
    validateSpatial: false,
  });
  assert.equal(command.valid, true, JSON.stringify(command.errors));
  const result = await executeSpellAreaResolution(command, {
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
  assert.equal(result.status, "applied", JSON.stringify(result.errors || result));
  await convergeDeferredEffectsHistory();
  return result;
}

test("Heal on a stable PC at 0 HP: 70 hit points, awake, blindness gone, the tally reset; one Undo restores it", async () => {
  await resetScene([token(CASTER, 60, 60), token("hero", 0, 90, { attitude: "pc", deathSaves: { successes: 0, failures: 1 },
    ...conditions([pill("ko", "Privo di sensi", "hero", { type: "hp-zero" }), pill("st", "Stabile", "hero", { type: "death-save" }),
      pill("blind", "Accecato", "hero")]) })]);
  await castOn("heal", 6, "hero");
  assert.equal(meta("hero").hp, 70);
  assert.equal(meta("hero").deathSaves, undefined);
  assert.deepEqual(pills("hero"), []);
  await undoLast();
  assert.equal(meta("hero").hp, 0);
  assert.deepEqual(meta("hero").deathSaves, { successes: 0, failures: 1 });
  assert.deepEqual(pills("hero"), ["Accecato", "Privo di sensi", "Stabile"]);
});

test("Lesser Restoration ends the poison the GM chose; one Undo brings it back", async () => {
  await resetScene([token(CASTER, 60, 60), token("hero", 20, 30, conditions([
    pill("poison", "Avvelenato", "hero"), pill("blind", "Accecato", "hero")]))]);
  await castOn("lesser-restoration", 2, "hero", { hero: { cleanseCondition: "Avvelenato" } });
  assert.deepEqual(pills("hero"), ["Accecato"]);
  await undoLast();
  assert.deepEqual(pills("hero"), ["Accecato", "Avvelenato"]);
});

test("Dispel Magic ends a concentration spell on its target only, the caster's concentration with it; Undo restores both", async () => {
  const bless = { instanceId: "bless-1", spellId: "bless", name: "Benedizione", conc: true, casterId: CASTER, source: CASTER };
  await resetScene([
    token(CASTER, 60, 60, { [CONCENTRATION_KEY]: { Benedizione: { instanceId: "bless-1", name: "Benedizione", targets: ["hero", "ally"] } } }),
    token("hero", 20, 30, { [SPELLS_KEY]: [bless], ...conditions([pill("blessed", "Benedetto", "hero", { parentEffectId: "bless-1", type: "spell" })]) }),
    token("ally", 20, 30, { [SPELLS_KEY]: [bless] }),
  ]);
  await castOn("dispel-magic", 3, "hero");
  assert.deepEqual(meta("hero")[SPELLS_KEY], []);
  assert.deepEqual(pills("hero"), []);
  assert.equal(meta("ally")[SPELLS_KEY].length, 1, "the other target keeps it");
  assert.deepEqual(meta(CASTER)[CONCENTRATION_KEY].Benedizione.targets, ["ally"]);
  await undoLast();
  assert.equal(meta("hero")[SPELLS_KEY].length, 1);
  assert.deepEqual(meta(CASTER)[CONCENTRATION_KEY].Benedizione.targets, ["hero", "ally"]);
});

test("a heal of the area command goes in the Combat Log as a spell, not as a saving throw", async () => {
  const { combatEventFromHistoryEntryV3 } = await import("../src/combatLogV3Core.js");
  await resetScene([token(CASTER, 60, 60), token("hero", 10, 90)]);
  await castOn("heal", 6, "hero");
  const entry = (await history.getHistoryEntries()).at(-1);
  assert.equal(entry.label, "Incantesimo · Guarigione");
  assert.equal(combatEventFromHistoryEntryV3(entry, {}).category, "spell");
});

// CAP-STABILIZE, lotto S1 (2014 texts): the cast through the real panel contract, coordinator and History.
const pcAtZero = (extra = {}) => token("aria", 0, 30, { attitude: "pc", ...extra });
const { combatEventFromHistoryEntry } = await import("../src/combatLogCore.js");
const { buildCombatLogPresentation } = await import("../src/combatLogPresentationCore.js");
const logOf = async () => {
  const entry = (await history.getHistoryEntries()).at(-1);
  return JSON.stringify(buildCombatLogPresentation({}, [combatEventFromHistoryEntry(entry, { round: 1 })]));
};
const entryCount = async () => (await history.getHistoryEntries()).length;

test("the panel asks only for the target: no save, no amount, one creature, no slot for the cantrip", () => {
  for (const [spellId, slotLevel] of [["spare-the-dying", 0], ["revivify", 3]]) {
    const contract = buildSpellUnifiedPanelContract({ spellId, phase: "cast", castContext: { slotLevel } });
    assert.equal(contract.execution.lane, "area-transaction", spellId);
    assert.equal(contract.presentation.inputs.outcomes.required, false, spellId);
    assert.equal(contract.presentation.inputs.damage?.required === true, false, spellId);
    assert.equal(contract.presentation.inputs.healing?.required === true, false, spellId);
    assert.equal(contract.presentation.targeting.limit.maximum, 1, spellId);
  }
});

test("S1: Spare the Dying: Stabile, the tally gone, the HP and Privo di sensi as they are; one Undo brings it all back", async () => {
  await resetScene([token(CASTER, 20, 20), pcAtZero({ deathSaves: { successes: 1, failures: 2 },
    ...conditions([pill("down-1", "Privo di sensi", "aria", { type: "hp-zero" })]) })]);
  const before = await entryCount();
  await cast("spare-the-dying", null, "aria");
  assert.deepEqual([meta("aria").hp, meta("aria").deathSaves, pills("aria")], [0, undefined, ["Privo di sensi", "Stabile"]]);
  assert.equal(await entryCount(), before + 1, "one History entry");
  const log = await logOf();
  assert.match(log, /Stabile/u, log);
  assert.doesNotMatch(log, /\+0 PF/u, log);
  await undoLast();
  assert.deepEqual([meta("aria").hp, meta("aria").deathSaves, pills("aria")],
    [0, { successes: 1, failures: 2 }, ["Privo di sensi"]]);
});

test("S1: a PC with no tally yet becomes stable too, with no HP entry", async () => {
  await resetScene([token(CASTER, 20, 20), pcAtZero()]);
  await cast("spare-the-dying", null, "aria");
  assert.ok(pills("aria").includes("Stabile"));
  await undoLast();
  assert.equal(pills("aria").includes("Stabile"), false);
});

test("S1: a target the spell cannot affect refuses the cast, with nothing written", async () => {
  await resetScene([token(CASTER, 20, 20), token("aria", 12, 30, { attitude: "pc" }), token("ogre", 0, 59, { attitude: "enemy" })]);
  const before = await entryCount();
  const living = await cast("spare-the-dying", null, "aria", { status: "rejected" });
  assert.match(JSON.stringify(living.errors), /non è a 0 PF/u);
  await cast("spare-the-dying", null, "ogre", { status: "rejected" });
  await cast("revivify", 3, "aria", { status: "rejected" });
  assert.deepEqual([meta("aria").hp, pills("aria"), pills("ogre")], [12, [], []]);
  assert.equal(await entryCount(), before, "no History entry");
});

test("S1: Revivify on a dead PC: 1 HP, awake, Morto and its three failures gone; one Undo kills it again", async () => {
  await resetScene([token(CASTER, 20, 20), pcAtZero({ deathSaves: { successes: 0, failures: 3 },
    ...conditions([pill("dead-1", "Morto", "aria", { type: "death-save" })]) })]);
  await cast("revivify", 3, "aria");
  assert.deepEqual([meta("aria").hp, meta("aria").deathSaves, pills("aria")], [1, undefined, []]);
  const log = await logOf();
  assert.match(log, /Rinascita/u, log);
  assert.match(log, /Morto/u, log);
  await undoLast();
  assert.deepEqual([meta("aria").hp, meta("aria").deathSaves, pills("aria")], [0, { successes: 0, failures: 3 }, ["Morto"]]);
});

test("S1: Revivify on a monster at 0 HP, and a zombie that was going to rise does not", async () => {
  await resetScene([token(CASTER, 20, 20), token("ogre", 0, 59, { attitude: "enemy", ...conditions([
    pill("zombie-1", "Si rianima come zombi", "ogre", { effectId: "negative-energy-flood-zombie" })]) })]);
  await cast("revivify", 3, "ogre");
  assert.deepEqual([meta("ogre").hp, pills("ogre")], [1, []]);
});

test("S1: Revivify refuses Disintegrate's dust, from the real spell", async () => {
  await resetScene([token(CASTER, 20, 20), token("ogre", 10, 59, { attitude: "enemy" })]);
  await cast("disintegrate", 6, "ogre", { outcome: "failed", amount: 75 });
  assert.deepEqual([meta("ogre").hp, pills("ogre")], [0, ["Morto"]]);
  const refused = await cast("revivify", 3, "ogre", { status: "rejected" });
  assert.match(JSON.stringify(refused.errors), /Resurrezione pura/u);
  assert.deepEqual([meta("ogre").hp, pills("ogre")], [0, ["Morto"]]);
});

test("S1: a stable PC hit again starts over, and a revived one dies again from the same rules", async () => {
  await resetScene([token(CASTER, 20, 20), pcAtZero({ deathSaves: { successes: 0, failures: 3 },
    ...conditions([pill("dead-1", "Morto", "aria", { type: "death-save" })]) })]);
  await cast("revivify", 3, "aria");
  const result = await clientEffects.runEffectsMutation([{ type: "hp:set", updates: [{ itemId: "aria", hp: 0, hpMax: 30,
    hpIntent: { mode: "damage", amount: 1, eventId: "hit-again" } }] }],
  { kind: "hp", label: "Danno", targetIds: ["aria"], history: { kind: "hp", label: "Danno" } });
  clientEffects.requireAppliedEffectsMutation(result);
  await convergeDeferredEffectsHistory();
  assert.equal(meta("aria").hp, 0);
  assert.ok(pills("aria").includes("Privo di sensi"), "dying again");
  assert.equal(pills("aria").includes("Morto"), false, "not dead");
});

// CAP-STABILIZE, lotto S2 (2014 texts): the two returns to life with no penalty.
test("S2: both ask only for the target, in the area command", () => {
  for (const [spellId, slotLevel] of [["reincarnate", 5], ["true-resurrection", 9]]) {
    const contract = buildSpellUnifiedPanelContract({ spellId, phase: "cast", castContext: { slotLevel } });
    assert.equal(contract.execution.lane, "area-transaction", spellId);
    assert.equal(contract.presentation.inputs.outcomes.required, false, spellId);
    assert.equal(contract.presentation.targeting.limit.maximum, 1, spellId);
  }
});

test("S2: True Resurrection: all the HP, poison, disease and curse gone, Prono stays; one Undo kills it again", async () => {
  await resetScene([token(CASTER, 20, 20), pcAtZero({ deathSaves: { successes: 0, failures: 3 }, ...conditions([
    pill("dead-1", "Morto", "aria", { type: "death-save" }),
    pill("poison-1", "Avvelenato", "aria"),
    pill("disease-1", "Febbre bruciante", "aria", { effectId: "contagion-slimy-doom" }),
    pill("curse-1", "Svant. prove/TS For", "aria", { effectId: "curse-ability-strength", spellId: "bestow-curse" }),
    pill("zombie-1", "Si rianima come zombi", "aria", { effectId: "finger-of-death-zombie" }),
    pill("down-1", "Prono", "aria"),
  ]) })]);
  await cast("true-resurrection", 9, "aria");
  assert.deepEqual([meta("aria").hp, meta("aria").deathSaves, pills("aria")], [30, undefined, ["Prono"]]);
  await undoLast();
  assert.equal(meta("aria").hp, 0);
  assert.deepEqual(meta("aria").deathSaves, { successes: 0, failures: 3 });
  assert.deepEqual(pills("aria"), ["Avvelenato", "Febbre bruciante", "Morto", "Prono", "Si rianima come zombi", "Svant. prove/TS For"].sort());
});

test("S2: True Resurrection brings Disintegrate's dust back, and refuses the living", async () => {
  await resetScene([token(CASTER, 20, 20), token("ogre", 10, 59, { attitude: "enemy" }), token("aria", 12, 30, { attitude: "pc" })]);
  await cast("disintegrate", 6, "ogre", { outcome: "failed", amount: 75 });
  await cast("true-resurrection", 9, "ogre");
  assert.deepEqual([meta("ogre").hp, pills("ogre")], [59, []]);
  const refused = await cast("true-resurrection", 9, "aria", { status: "rejected" });
  assert.match(JSON.stringify(refused.errors), /non è morta/u);
});

test("S2: Reincarnate: 1 HP, Morto gone, a note for the HP and the race; the poison stays; one Undo", async () => {
  await resetScene([token(CASTER, 20, 20), pcAtZero({ deathSaves: { successes: 0, failures: 3 }, ...conditions([
    pill("dead-1", "Morto", "aria", { type: "death-save" }), pill("poison-1", "Avvelenato", "aria")]) })]);
  const result = await cast("reincarnate", 5, "aria");
  assert.deepEqual([meta("aria").hp, meta("aria").deathSaves, pills("aria")], [1, undefined, ["Avvelenato"]]);
  assert.match(JSON.stringify(result.notes), /regolali tu/u);
  assert.match(JSON.stringify(result.notes), /d100/u);
  await undoLast();
  assert.deepEqual([meta("aria").hp, pills("aria")], [0, ["Avvelenato", "Morto"]]);
});

test("S2: Reincarnate refuses the dust and a creature the token says is no humanoid", async () => {
  await resetScene([token(CASTER, 20, 20), token("ogre", 10, 59, { attitude: "enemy" }), token("wolf", 0, 11, { attitude: "enemy", creatureType: "Bestia" })]);
  await cast("disintegrate", 6, "ogre", { outcome: "failed", amount: 75 });
  assert.match(JSON.stringify((await cast("reincarnate", 5, "ogre", { status: "rejected" })).errors), /Resurrezione pura/u);
  assert.match(JSON.stringify((await cast("reincarnate", 5, "wolf", { status: "rejected" })).errors), /umanoide/u);
  assert.deepEqual([meta("wolf").hp, pills("wolf")], [0, []]);
});

test("S2: True Resurrection ends the curse as a spell too, on this target only, with its caster's concentration; Undo restores it", async () => {
  const curse = { instanceId: "curse-1", spellId: "bestow-curse", name: "Scagliare maledizione", conc: true, casterId: CASTER, source: CASTER };
  await resetScene([
    token(CASTER, 60, 60, { [CONCENTRATION_KEY]: { Maledizione: { instanceId: "curse-1", name: "Scagliare maledizione", targets: ["aria", "ally"] } } }),
    token("aria", 0, 30, { attitude: "pc", deathSaves: { successes: 0, failures: 3 }, [SPELLS_KEY]: [curse], ...conditions([
      pill("dead-1", "Morto", "aria", { type: "death-save" }),
      pill("curse-pill", "Svant. prove/TS For", "aria", { effectId: "curse-ability-strength", parentEffectId: "curse-1", type: "spell" })]) }),
    token("ally", 20, 30, { [SPELLS_KEY]: [curse] }),
  ]);
  await cast("true-resurrection", 9, "aria");
  assert.deepEqual([meta("aria").hp, pills("aria"), meta("aria")[SPELLS_KEY]], [30, [], []]);
  assert.equal(meta("ally")[SPELLS_KEY].length, 1, "the other target keeps it");
  assert.deepEqual(meta(CASTER)[CONCENTRATION_KEY].Maledizione.targets, ["ally"]);
  await undoLast();
  assert.equal(meta("aria")[SPELLS_KEY].length, 1);
  assert.deepEqual(pills("aria"), ["Morto", "Svant. prove/TS For"]);
  assert.deepEqual(meta(CASTER)[CONCENTRATION_KEY].Maledizione.targets, ["aria", "ally"]);
});

// CAP-STABILIZE, lotto S3 (2014 texts): the two returns to life with the penalty of the return from death.
const returnPill = (id) => (meta(id).conditions?.instances || []).find((entry) => entry.effectId === "return-from-death" && entry.active !== false);

test("S3: both ask only for the target, in the area command", () => {
  for (const [spellId, slotLevel] of [["raise-dead", 5], ["resurrection", 7]]) {
    const contract = buildSpellUnifiedPanelContract({ spellId, phase: "cast", castContext: { slotLevel } });
    assert.equal(contract.execution.lane, "area-transaction", spellId);
    assert.equal(contract.presentation.inputs.outcomes.required, false, spellId);
    assert.equal(contract.presentation.targeting.limit.maximum, 1, spellId);
  }
});

test("S3: Raise Dead: 1 HP, the poison gone, the disease stays, −4 on its pill; one Undo takes it all back", async () => {
  await resetScene([token(CASTER, 20, 20), pcAtZero({ deathSaves: { successes: 0, failures: 3 }, ...conditions([
    pill("dead-1", "Morto", "aria", { type: "death-save" }), pill("poison-1", "Avvelenato", "aria"),
    pill("disease-1", "Febbre bruciante", "aria", { effectId: "contagion-slimy-doom" })]) })]);
  await cast("raise-dead", 5, "aria");
  assert.deepEqual([meta("aria").hp, meta("aria").deathSaves], [1, undefined]);
  assert.deepEqual(pills("aria"), ["Febbre bruciante", "Ritorno dalla morte −4"]);
  assert.equal(returnPill("aria").mechanics.returnFromDeathPenalty, 4);
  await undoLast();
  assert.deepEqual([meta("aria").hp, pills("aria")], [0, ["Avvelenato", "Febbre bruciante", "Morto"]]);
  assert.deepEqual(meta("aria").deathSaves, { successes: 0, failures: 3 });
});

test("S3: Resurrection: all the HP, a note for its caster; a second return starts the penalty over", async () => {
  await resetScene([token(CASTER, 20, 20), pcAtZero({ ...conditions([pill("dead-1", "Morto", "aria", { type: "death-save" }),
    pill("old-1", "Ritorno dalla morte −2", "aria", { effectId: "return-from-death", mechanics: { returnFromDeathPenalty: 2 } })]) })]);
  const result = await cast("resurrection", 7, "aria");
  assert.equal(meta("aria").hp, 30);
  assert.deepEqual(pills("aria"), ["Ritorno dalla morte −4"], "one pill, back to −4");
  assert.match(JSON.stringify(result.notes), /un anno o più/u);
});

test("S3: both refuse the dust, the living and an undead", async () => {
  await resetScene([token(CASTER, 20, 20), token("ogre", 10, 59, { attitude: "enemy" }), token("aria", 12, 30, { attitude: "pc" }),
    token("ghoul", 0, 22, { attitude: "enemy", creatureType: "Non morto" })]);
  await cast("disintegrate", 6, "ogre", { outcome: "failed", amount: 75 });
  for (const [spellId, slot] of [["raise-dead", 5], ["resurrection", 7]]) {
    assert.match(JSON.stringify((await cast(spellId, slot, "ogre", { status: "rejected" })).errors), /Resurrezione pura/u);
    assert.match(JSON.stringify((await cast(spellId, slot, "aria", { status: "rejected" })).errors), /non è morta/u);
    assert.match(JSON.stringify((await cast(spellId, slot, "ghoul", { status: "rejected" })).errors), /non morto/u);
  }
});
