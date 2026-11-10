// Avvisi di reazione, lot R3b-5 (docs/STUDIO_AVVISI_REAZIONE.md §6.10): the reactions to a spell's damage cast from the
// panel, through the area command, the real coordinator, History and Undo (the harness of hpBranchSpellsIntegration.test.js).
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
  room: { id: "spell-damage-reaction-room", getMetadata: async () => ({}) },
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

const clientEffects = await import("../src/effectsMutations.js?spell-damage-reaction-client");
globalThis.location = { pathname: "/background.html" };
const backgroundEffects = await import("../src/effectsMutations.js?spell-damage-reaction-background");
globalThis.location = { pathname: "/plugin.html" };
const baseEffects = await import("../src/effectsMutations.js?spell-damage-reaction-base");
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

const history = await import("../src/history.js?spell-damage-reaction-history");
const historyOwner = await import("../src/historyOwner.js?spell-damage-reaction-owner");
mock.module("../src/history.js", { exports: { ...history } });
const { currentSceneEpoch, markSceneEpochReady } = await import("../src/sceneEpoch.js");
const { buildSpellUnifiedPanelContract } = await import("../src/spellUnifiedPanelCore.js?spell-damage-reaction-panel");
const { buildSpellAreaResolutionCommand } = await import("../src/spellAreaResolutionCommandCore.js?spell-damage-reaction-command");
const { executeSpellAreaResolution } = await import("../src/spellAreaResolutionExecutor.js?spell-damage-reaction-executor");
const { planEffectSaveReminderNotices } = await import("../src/effectSaveReminderCore.js?spell-damage-reaction-reminder-core");
const { resolveReminder, clearReminderResolutionQueue } = await import("../src/reminderResolution.js?spell-damage-reaction-reminder");
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
      roomId: "spell-damage-reaction-room",
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


const { planReactionFeatureSpend } = await import("../src/reactionFeatureRuntime.js");

const CASTER = "caster";
const token = (id, hp, hpMax, extra = {}) => ({ id, name: id, type: "IMAGE", layer: "CHARACTER", position: { x: 0, y: 0 },
  metadata: { [META_KEY]: { hp, hpMax, conditions: { version: 2, instances: [] }, [CONCENTRATION_KEY]: {}, [SPELLS_KEY]: [], ...extra } } });
const meta = (id) => sceneState.items.find((item) => item.id === id).metadata[META_KEY];
const pills = (id) => (meta(id).conditions?.instances || []).filter((entry) => entry.active !== false).map((entry) => entry.condition).sort();
const psion = { characterBuild: [{ classId: "guerriero", level: 3, subclassId: "guerriero-guerriero-psionico" }], classFeaturesConfigured: true,
  enabledClassFeatureIds: ["guerriero-guerriero-psionico-potere-psionico-campo-protettivo"] };
const field = (targetId, amount) => ({ reactionId: "protective-field", reactorId: "dars", reactorName: "Dars",
  featureId: "guerriero-guerriero-psionico-potere-psionico-campo-protettivo", targetId, amount });

// As the panel's commit does it: the reactors' spend read from the scene, in the cast's extra operations.
// An area's placement, confirmed, as the panel sends it (test/spellAreaResolutionExecutor.test.js).
function placementFor(contract, spellId, targetIds) {
  const descriptor = contract.presentation?.placement;
  if (!descriptor?.ruleId || descriptor.policy === "automatic") return null;
  return { status: "confirmed", confirmed: true, ruleId: descriptor.ruleId, spellId, casterId: CASTER, targetLocked: true, targetIds,
    preview: { type: "circle", start: { x: 0, y: 0 }, end: { x: 150, y: 0 }, gridOrigin: { x: 0, y: 0 }, dpi: 150, targetIds, targetLocked: true } };
}

async function cast(spellId, slotLevel, outcomes, { amount, damageReactions = [], status = "applied" } = {}) {
  const contract = buildSpellUnifiedPanelContract({ spellId, phase: "cast", castContext: { slotLevel } });
  const targetIds = Object.keys(outcomes);
  const placement = placementFor(contract, spellId, targetIds);
  const command = buildSpellAreaResolutionCommand({
    contract, spellId, phase: "cast", casterId: CASTER, slotLevel, targetIds, outcomes,
    ...(placement ? { placement, targetLocked: true, candidateTargetIds: targetIds } : {}),
    ...(amount !== undefined ? { hpAmount: amount } : {}),
    damageReactions,
    validateSpatial: false,
  });
  assert.equal(command.valid, true, JSON.stringify(command.errors));
  const extraOperations = [];
  for (const reaction of damageReactions) {
    const spend = planReactionFeatureSpend({ reactorItem: sceneState.items.find((item) => item.id === reaction.reactorId),
      reaction, initiativeState: sceneState.metadata[STATE_KEY], operationId: `cast:${reaction.reactorId}:${reaction.reactionId}` });
    assert.equal(spend.ok, true, spend.message);
    extraOperations.push(...spend.operations);
  }
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
    extraOperations,
  });
  assert.equal(result.status, status, JSON.stringify(result.errors || result.message || result));
  await convergeDeferredEffectsHistory();
  return { result, command };
}

async function undoLast() {
  const entries = await history.getHistoryEntries();
  const result = await history.undoHistoryThrough(entries.at(-1).id, { sceneEpoch: currentSceneEpoch() });
  assert.equal(normalizeHistoryUndoResult(result).outcome, HISTORY_UNDO_OUTCOME.COMMITTED, JSON.stringify(result));
}

test("the command keeps the reactions on the cast's own targets only", async () => {
  await resetScene([token(CASTER, 30, 30), token("vex", 30, 30, { attitude: "pc" }), token("dars", 40, 40, { attitude: "pc", initiativeCard: psion })]);
  const contract = buildSpellUnifiedPanelContract({ spellId: "blight", phase: "cast", castContext: { slotLevel: 4 } });
  const command = buildSpellAreaResolutionCommand({ contract, spellId: "blight", phase: "cast", casterId: CASTER, slotLevel: 4,
    targetIds: ["vex"], outcomes: { vex: "failed" }, hpAmount: 20, validateSpatial: false,
    damageReactions: [field("vex", 4), field("somebody-else", 4), { reactionId: "protective-field", targetId: "vex" }] });
  assert.deepEqual(command.hp.damageReactions, [{ reactionId: "protective-field", reactorId: "dars", reactorName: "Dars",
    featureId: "guerriero-guerriero-psionico-potere-psionico-campo-protettivo", targetId: "vex", amount: 4 }]);
});

test("Blight with Protective Field on the target: the reduction off the damage, the reactor's reaction and die in the same command; one Undo", async () => {
  await resetScene([token(CASTER, 30, 30), token("vex", 30, 30, { attitude: "pc" }), token("dars", 40, 40, { attitude: "pc", initiativeCard: psion })]);
  await cast("blight", 4, { vex: "failed" }, { amount: 20, damageReactions: [field("vex", 6)] });
  assert.equal(meta("vex").hp, 30 - 14, "20 less the field's 6");
  assert.deepEqual(pills("dars"), ["Reazione usata"]);
  assert.deepEqual(pills("vex"), []);
  const entries = await history.getHistoryEntries();
  assert.equal(entries.length, 1, "one command, one entry");
  assert.ok(JSON.stringify(entries.at(-1).payload).includes("Campo Protettivo di Dars: −6"), JSON.stringify(entries.at(-1).payload));
  await undoLast();
  assert.equal(meta("vex").hp, 30);
  assert.deepEqual(pills("dars"), [], "the reaction is free again");
});

test("a passed save: the reduction after the halving (decision E1)", async () => {
  await resetScene([token(CASTER, 30, 30), token("vex", 30, 30, { attitude: "pc" }), token("dars", 40, 40, { attitude: "pc", initiativeCard: psion })]);
  await cast("blight", 4, { vex: "passed" }, { amount: 20, damageReactions: [field("vex", 4)] });
  assert.equal(meta("vex").hp, 30 - 6, "20 halved is 10, less 4");
});

test("no reactions: the cast is written as before", async () => {
  await resetScene([token(CASTER, 30, 30), token("vex", 30, 30, { attitude: "pc" })]);
  await cast("blight", 4, { vex: "failed" }, { amount: 20 });
  assert.equal(meta("vex").hp, 10);
  assert.equal(JSON.stringify((await history.getHistoryEntries()).at(-1).payload).includes("Campo Protettivo"), false);
});

test("the combat log says why: the reaction's line on the target's HP", async () => {
  const { combatEventFromHistoryEntry } = await import("../src/combatLogCore.js");
  const { buildCombatLogPresentation } = await import("../src/combatLogPresentationCore.js");
  await resetScene([token(CASTER, 30, 30), token("vex", 30, 30, { attitude: "pc" }), token("dars", 40, 40, { attitude: "pc", initiativeCard: psion })]);
  await cast("blight", 4, { vex: "failed" }, { amount: 20, damageReactions: [field("vex", 6)] });
  const entry = (await history.getHistoryEntries()).at(-1);
  const lines = buildCombatLogPresentation({}, [combatEventFromHistoryEntry(entry, { round: 1 })])
    .events[0].details.flatMap((section) => section.lines);
  assert.ok(lines.some((line) => line.includes("Campo Protettivo di Dars: −6")), lines.join("\n"));
});

// Cutting Words: one line on the roll, every creature of the cast pays it, before the save; the bard's reaction and
// one Bardic Inspiration once.
test("Cutting Words on a two-creature cast: the roll reduced for both, before the halving; one reaction and one die", async () => {
  const bard = { characterBuild: [{ classId: "bardo", level: 5, subclassId: "bardo-collegio-della-sapienza" }], classFeaturesConfigured: true,
    enabledClassFeatureIds: ["bardo-collegio-della-sapienza-parole-taglienti"], abilityModifiers: { cha: 3 } };
  await resetScene([token(CASTER, 30, 30, { attitude: "enemy" }), token("vex", 30, 30, { attitude: "pc" }), token("mira", 30, 30, { attitude: "pc" }),
    token("bard", 30, 30, { attitude: "pc", initiativeCard: bard })]);
  const words = { reactionId: "cutting-words", reactorId: "bard", reactorName: "Piumazzo", featureId: "bardo-collegio-della-sapienza-parole-taglienti",
    targetId: "vex", amount: 4 };
  await cast("fireball", 3, { vex: "failed", mira: "passed" }, { amount: 20, damageReactions: [words] });
  assert.equal(meta("vex").hp, 30 - 16, "20 − 4");
  assert.equal(meta("mira").hp, 30 - 8, "(20 − 4) / 2");
  assert.deepEqual(pills("bard"), ["Reazione usata"]);
  const inspiration = Object.values(meta("bard").classFeatureState?.resources || {});
  assert.equal(inspiration.length, 1, "one pool spent");
  assert.equal(inspiration[0].current, inspiration[0].maximum - 1, "one Bardic Inspiration");
  await undoLast();
  assert.equal(meta("vex").hp, 30);
  assert.equal(meta("mira").hp, 30);
  assert.deepEqual(pills("bard"), []);
  assert.ok(Object.values(meta("bard").classFeatureState?.resources || {}).every((pool) => pool.current === undefined || pool.current === pool.maximum),
    "the die is back");
});
