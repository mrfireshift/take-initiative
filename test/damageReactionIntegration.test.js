// Avvisi di reazione, lot R3b-2 (docs/STUDIO_AVVISI_REAZIONE.md §6.7): a reaction to the damage of an attack from the
// attack console, through the real coordinator, History and Undo (the harness of reactionHpIntegration.test.js). One
// command writes the damage changed, the reactor's "Reazione usata" and its resource; one Undo gives all of them back.
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
  room: { id: "damage-reaction-room", getMetadata: async () => ({}) },
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

const clientEffects = await import("../src/effectsMutations.js?damage-reaction-real-client");
globalThis.location = { pathname: "/background.html" };
const backgroundEffects = await import("../src/effectsMutations.js?damage-reaction-real-background");
globalThis.location = { pathname: "/plugin.html" };
const baseEffects = await import("../src/effectsMutations.js?damage-reaction-real-base");
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

const history = await import("../src/history.js?damage-reaction-real-history");
const historyOwner = await import("../src/historyOwner.js?damage-reaction-real-owner");
mock.module("../src/history.js", { exports: { ...history } });
const { currentSceneEpoch, markSceneEpochReady } = await import("../src/sceneEpoch.js");
const { resolveReminder, clearReminderResolutionQueue } = await import("../src/reminderResolution.js?damage-reaction-real-reminder");
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
      roomId: "damage-reaction-room",
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


const { createPcAttackRuntime } = await import("../src/pcAttackExecution.js");

const token = (id, hp, hpMax, extra = {}) => ({ id, name: id, type: "IMAGE", layer: "CHARACTER", position: { x: 0, y: 0 },
  metadata: { [META_KEY]: { hp, hpMax, conditions: { version: 2, instances: [] }, [CONCENTRATION_KEY]: {}, [SPELLS_KEY]: [], ...extra } } });
const meta = (id) => sceneState.items.find((item) => item.id === id).metadata[META_KEY];
const pills = (id) => (meta(id).conditions?.instances || []).filter((entry) => entry.active !== false).map((entry) => entry.condition).sort();
const goblinCard = { quickActions: [{ id: "sword", label: "Spada lunga", kind: "attack", range: "melee",
  components: [{ type: "slashing", formula: "1d8+3" }] }] };
const rogueCard = { characterBuild: [{ classId: "ladro", level: 5 }], classFeaturesConfigured: true,
  enabledClassFeatureIds: ["ladro-schivata-prodigiosa"] };
const fighterCard = { characterBuild: [{ classId: "guerriero", level: 5, subclassId: "guerriero-maestro-di-battaglia" }],
  classFeaturesConfigured: true, enabledClassFeatureIds: ["guerriero-maestro-di-battaglia-manovre-parata"] };
const superiority = (id) => meta(id).classFeatureState?.resources?.["guerriero-dadi-superiorita"]?.current;

const runtime = createPcAttackRuntime({
  api: sdkStub,
  getSceneContext: clientEffects.getEffectsMutationSceneContext,
  runMutation: clientEffects.runEffectsMutation,
  requireApplied: clientEffects.requireAppliedEffectsMutation,
  postDamage: async () => [],
  postTempHp: async () => {},
  refreshLabels: async () => {},
  emitVisual: async () => {},
});

let attackSequence = 0;
async function attack(targetId, amount, damageReactions = [], extra = {}) {
  attackSequence += 1;
  const result = await runtime.executePcAttack({ sourceId: "goblin", actionId: "sword", targetId, outcome: "hit",
    componentAmounts: { c1: amount }, attackInstanceId: `attack-${attackSequence}`, damageReactions, ...extra });
  await convergeDeferredEffectsHistory();
  return result;
}

async function undoLast() {
  const entries = await history.getHistoryEntries();
  const result = await history.undoHistoryThrough(entries.at(-1).id, { sceneEpoch: currentSceneEpoch() });
  assert.equal(normalizeHistoryUndoResult(result).outcome, HISTORY_UNDO_OUTCOME.COMMITTED, JSON.stringify(result));
}

test("Uncanny Dodge: the damage halved, the rogue's reaction in the same command; one Undo gives both back", async () => {
  await resetScene([token("goblin", 7, 7, { attitude: "enemy", initiativeCard: goblinCard }),
    token("vex", 30, 30, { attitude: "pc", initiativeCard: rogueCard })]);
  const result = await attack("vex", 11, [{ reactionId: "uncanny-dodge", reactorId: "vex", reactorName: "vex", featureId: "ladro-schivata-prodigiosa" }]);
  assert.equal(meta("vex").hp, 30 - 5, "11 halved, rounded down");
  assert.deepEqual(pills("vex"), ["Reazione usata"]);
  assert.equal(result.hpChange.after, 25);
  const entries = await history.getHistoryEntries();
  assert.equal(entries.length, 1, "one command, one entry");
  assert.deepEqual(entries.at(-1).payload.damageReactions,
    [{ id: "vex", reactionId: "uncanny-dodge", reactorId: "vex", text: "Schivata Prodigiosa di vex: danno dimezzato" }]);
  await undoLast();
  assert.equal(meta("vex").hp, 30);
  assert.deepEqual(pills("vex"), [], "the reaction is free again");
});

test("Parry: the amount off the damage, the superiority die spent with the reaction; Undo gives back the die", async () => {
  await resetScene([token("goblin", 7, 7, { attitude: "enemy", initiativeCard: goblinCard }),
    token("dars", 40, 40, { attitude: "pc", initiativeCard: fighterCard })]);
  const parry = { reactionId: "parry-maneuver", reactorId: "dars", reactorName: "Dars", featureId: "guerriero-maestro-di-battaglia-manovre-parata", amount: 8 };
  await attack("dars", 12, [parry]);
  assert.equal(meta("dars").hp, 40 - 4);
  assert.deepEqual(pills("dars"), ["Reazione usata"]);
  assert.equal(superiority("dars"), 3, "4 dice at the 5th level, one spent");
  await undoLast();
  assert.equal(meta("dars").hp, 40);
  assert.deepEqual(pills("dars"), []);
  assert.notEqual(superiority("dars"), 3, "the die is back");
});

test("a reaction used meanwhile stops the commit: nothing written", async () => {
  const used = { conditions: { version: 2, instances: [{ id: "used", condition: "Reazione usata", active: true, expiry: { mode: "manual" } }] } };
  await resetScene([token("goblin", 7, 7, { attitude: "enemy", initiativeCard: goblinCard }),
    token("vex", 30, 30, { attitude: "pc", initiativeCard: rogueCard, ...used })]);
  await assert.rejects(attack("vex", 11, [{ reactionId: "uncanny-dodge", reactorId: "vex", reactorName: "vex", featureId: "ladro-schivata-prodigiosa" }]),
    /ha già usato la reazione/u);
  assert.equal(meta("vex").hp, 30);
  assert.deepEqual(await history.getHistoryEntries(), []);
});

test("no damage reactions: the attack is written as before", async () => {
  await resetScene([token("goblin", 7, 7, { attitude: "enemy", initiativeCard: goblinCard }),
    token("vex", 30, 30, { attitude: "pc", initiativeCard: rogueCard })]);
  await attack("vex", 11);
  assert.equal(meta("vex").hp, 19);
  assert.deepEqual(pills("vex"), []);
  assert.equal((await history.getHistoryEntries()).at(-1).payload.damageReactions, undefined);
});

test("the combat log says why: the reaction's line on the target's HP", async () => {
  const { combatEventFromHistoryEntry } = await import("../src/combatLogCore.js");
  const { buildCombatLogPresentation } = await import("../src/combatLogPresentationCore.js");
  await resetScene([token("goblin", 7, 7, { attitude: "enemy", initiativeCard: goblinCard }),
    token("vex", 30, 30, { attitude: "pc", initiativeCard: rogueCard })]);
  await attack("vex", 11, [{ reactionId: "uncanny-dodge", reactorId: "vex", reactorName: "Vex", featureId: "ladro-schivata-prodigiosa" }]);
  const entry = (await history.getHistoryEntries()).at(-1);
  const lines = buildCombatLogPresentation({}, [combatEventFromHistoryEntry(entry, { round: 1 })])
    .events[0].details.flatMap((section) => section.lines);
  assert.ok(lines.some((line) => line.includes("Schivata Prodigiosa di Vex: danno dimezzato")), lines.join("\n"));
});

// Lot R3b-4: an area from the attack console, each creature with its own reactions.
test("an area: Protective Field on one creature of the area, the other as before; one Undo for all", async () => {
  const cantrips = { id: "cantrip", label: "Trucchetto", kind: "attack", source: { kind: "cantrip" } };
  const lyra = { characterBuild: [{ classId: "mago", level: 5, subclassId: "mago-scuola-di-invocazione" }], classFeaturesConfigured: true,
    enabledClassFeatureIds: [], spellSaveDC: 14, quickActions: [cantrips] };
  const psion = { characterBuild: [{ classId: "guerriero", level: 3, subclassId: "guerriero-guerriero-psionico" }], classFeaturesConfigured: true,
    enabledClassFeatureIds: ["guerriero-guerriero-psionico-potere-psionico-campo-protettivo"] };
  await resetScene([token("lyra", 20, 20, { attitude: "enemy", initiativeCard: lyra }),
    token("vex", 30, 30, { attitude: "pc", initiativeCard: rogueCard }), token("dars", 40, 40, { attitude: "pc", initiativeCard: psion })]);
  const field = { reactionId: "protective-field", reactorId: "dars", reactorName: "Dars",
    featureId: "guerriero-guerriero-psionico-potere-psionico-campo-protettivo", targetId: "vex", amount: 4 };
  await runtime.executePcAttackArea({ sourceId: "lyra", actionId: "cantrip", spellId: "tasha-turbine-di-spade",
    members: [{ targetId: "vex", outcome: "failed" }, { targetId: "dars", outcome: "failed" }], componentAmounts: { c1: 10 },
    attackInstanceId: "whirl-r3b4", damageReactions: [field] });
  await convergeDeferredEffectsHistory();
  assert.equal(meta("vex").hp, 30 - 6, "10 less the field's 4");
  assert.equal(meta("dars").hp, 40 - 10, "the reactor's own damage as before");
  assert.deepEqual(pills("dars"), ["Reazione usata"]);
  assert.deepEqual(pills("vex"), []);
  const entry = (await history.getHistoryEntries()).at(-1);
  assert.deepEqual(entry.payload.damageReactions.map((record) => [record.id, record.text]), [["vex", "Campo Protettivo di Dars: −4"]]);
  await undoLast();
  assert.equal(meta("vex").hp, 30);
  assert.equal(meta("dars").hp, 40);
  assert.deepEqual(pills("dars"), []);
});

// Lot R4: a monster's Uncanny Dodge read from its stat block: the damage halved, only its reaction spent; one Undo.
test("a monster's halving reaction: the damage halved, its reaction only, no resource; one Undo gives both back", async () => {
  await resetScene([token("goblin", 7, 7, { attitude: "enemy", initiativeCard: goblinCard }),
    token("knight", 52, 52, { attitude: "enemy" })]);
  await attack("knight", 11, [{ reactionId: "monster-halve", reactorId: "knight", reactorName: "Cavaliere", featureId: "" }]);
  assert.equal(meta("knight").hp, 52 - 5);
  assert.deepEqual(pills("knight"), ["Reazione usata"]);
  assert.deepEqual((await history.getHistoryEntries()).at(-1).payload.damageReactions,
    [{ id: "knight", reactionId: "monster-halve", reactorId: "knight", text: "Schivata Prodigiosa di Cavaliere: danno dimezzato" }]);
  await undoLast();
  assert.equal(meta("knight").hp, 52);
  assert.deepEqual(pills("knight"), []);
});
