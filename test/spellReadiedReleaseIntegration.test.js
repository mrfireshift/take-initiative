// The release of a readied spell, end to end (docs/STUDIO_AZIONI_DI_TURNO.md §9, lot T6c, decisions P6–P8): the hold
// through the real lifecycle executor, the release through the real area executor and History, as the panel sends them.
// One command: the spell's own effects, the reaction spent, the hold ended (record, pill, concentration); Undo puts the
// hold back. A hold that is gone releases nothing.
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
const sceneState = { ready: true, metadata: {}, items: [] };
const broadcastListeners = new Map();
const currentItems = (ids) => {
  const wanted = Array.isArray(ids) ? new Set(ids) : null;
  return sceneState.items.filter((item) => !wanted || wanted.has(item?.id)).map(clone);
};

const sdkStub = {
  onReady: () => {},
  player: { getRole: async () => "GM" },
  room: { id: "readied-release-room", getMetadata: async () => ({}) },
  scene: {
    isReady: async () => sceneState.ready,
    onReadyChange: () => () => {},
    getMetadata: async () => clone(sceneState.metadata),
    setMetadata: async (update) => { sceneState.metadata = { ...sceneState.metadata, ...clone(update) }; },
    items: {
      getItems: async (predicateOrIds) => {
        if (Array.isArray(predicateOrIds)) return currentItems(predicateOrIds);
        if (typeof predicateOrIds === "function") return sceneState.items.filter(predicateOrIds).map(clone);
        return currentItems();
      },
      updateItems: async (predicateOrIds, updater) => {
        const set = Array.isArray(predicateOrIds) ? new Set(predicateOrIds) : null;
        const targets = sceneState.items
          .filter((item) => (typeof predicateOrIds === "function" ? predicateOrIds(item) : !set || set.has(item.id)))
          .map(clone);
        await updater(targets);
        const byId = new Map(targets.map((item) => [item.id, item]));
        sceneState.items = sceneState.items.map((item) => byId.get(item.id) || item);
      },
      deleteItems: async (ids) => {
        const wanted = new Set(ids || []);
        sceneState.items = sceneState.items.filter((item) => !wanted.has(item.id));
      },
      addItems: async (items) => { sceneState.items.push(...clone(items || [])); },
      onChange: () => () => {},
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
      for (const listener of [...(broadcastListeners.get(channel) || [])]) await listener({ data: clone(data) });
    },
  },
};

const chain = () => new Proxy(() => {}, { get: (_, key) => (key === "build" ? () => ({ id: "mock-path" }) : chain()), apply: () => chain() });
mock.module("@owlbear-rodeo/sdk", {
  exports: {
    default: sdkStub,
    buildLabel: (...args) => ({ type: "LABEL", args }),
    buildImage: (...args) => ({ type: "IMAGE", args }),
    buildPath: () => chain(),
    buildText: (...args) => ({ type: "TEXT", args }),
    buildShape: (...args) => ({ type: "SHAPE", args }),
    Command: class Command {},
  },
});

const clientEffects = await import("../src/effectsMutations.js?readied-release-client");
globalThis.location = { pathname: "/background.html" };
const backgroundEffects = await import("../src/effectsMutations.js?readied-release-background");
globalThis.location = { pathname: "/plugin.html" };
const baseEffects = await import("../src/effectsMutations.js?readied-release-base");
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

const history = await import("../src/history.js?readied-release-history");
const historyOwner = await import("../src/historyOwner.js?readied-release-owner");
mock.module("../src/history.js", { exports: { ...history } });
const { currentSceneEpoch, markSceneEpochReady } = await import("../src/sceneEpoch.js");
const { getSpellDefinition } = await import("../src/spells-srd.js");
const { buildSpellUnifiedPanelContract, createSpellPanelSession } = await import("../src/spellUnifiedPanelCore.js?readied-release-panel");
const { routeSpellUnifiedPanelOpenRequest } = await import("../src/spellUnifiedPanelRoutingCore.js?readied-release-route");
const { buildSpellUnifiedLifecycleRequest, executeSpellUnifiedLifecycle } = await import("../src/spellUnifiedLifecycleAdapter.js?readied-release-lifecycle");
const { findActiveSpellConcentration } = await import("../src/spellCastPhaseCore.js");
const { executeSpellApplication } = await import("../src/spellApplicationExecutor.js?readied-release-application");
const { buildSpellAreaResolutionCommand } = await import("../src/spellAreaResolutionCommandCore.js?readied-release-command");
const { executeSpellAreaResolution } = await import("../src/spellAreaResolutionExecutor.js?readied-release-executor");
const { planSpellReactionSpend } = await import("../src/spellReactionCore.js");
const { normalizeHistoryUndoResult, HISTORY_UNDO_OUTCOME } = await import("../src/historyUndoResultCore.js");

async function resetScene(tokens = []) {
  historyOwner.unmountHistoryOwner();
  backgroundEffects.unmountEffectsMutationCoordinatorService();
  sceneState.metadata = {
    [STATE_KEY]: { round: 2, current: 1, order: tokens.map((token) => token.id) },
    "com.thebigpicture.initiative/history": { version: 1, roomId: "readied-release-room", entries: [] },
  };
  sceneState.items = tokens.map(clone);
  markSceneEpochReady("readied-release-reset");
  await historyOwner.mountHistoryOwner();
  await backgroundEffects.mountEffectsMutationCoordinatorService();
}

async function converge() {
  const sceneEpoch = currentSceneEpoch();
  for (let attempt = 0; attempt < 20; attempt += 1) {
    clientEffects.flushPendingEffectsHistory(sceneEpoch);
    backgroundEffects.flushPendingEffectsHistory(sceneEpoch);
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (!clientEffects.hasPendingEffectsHistory(sceneEpoch) && !backgroundEffects.hasPendingEffectsHistory(sceneEpoch)) return;
  }
  assert.fail("Deferred Effects History did not converge");
}

test.before(async () => {
  await historyOwner.mountHistoryOwner();
  await backgroundEffects.mountEffectsMutationCoordinatorService();
});

test.after(() => {
  backgroundEffects.unmountEffectsMutationCoordinatorService();
  historyOwner.unmountHistoryOwner();
  globalThis.indexedDB = previousIndexedDB;
  globalThis.IDBKeyRange = previousKeyRange;
  if (previousLocation === undefined) delete globalThis.location;
  else globalThis.location = previousLocation;
});

const token = (id, hp, extra = {}) => ({ id, name: id, type: "IMAGE", layer: "CHARACTER", position: { x: 0, y: 0 },
  metadata: { [META_KEY]: { hp, hpMax: hp, conditions: { version: 2, instances: [] }, [CONCENTRATION_KEY]: {}, [SPELLS_KEY]: [], ...extra } } });
const meta = (id) => sceneState.items.find((item) => item.id === id).metadata[META_KEY];
const pills = (id) => (meta(id).conditions?.instances || []).filter((entry) => entry.active !== false).map((entry) => entry.condition).sort();

// The hold, as the panel's «Prepara» sends it (lot T6b): the lifecycle request of the hold's session, executed for real.
async function hold(spellId, slotLevel) {
  const contract = buildSpellUnifiedPanelContract({ spellId, phase: "prepare", castContext: { slotLevel } });
  const session = createSpellPanelSession({ contract, phase: "prepare", casterId: "maga", castContext: { slotLevel } });
  const request = buildSpellUnifiedLifecycleRequest({ contract, session, spell: getSpellDefinition(spellId) });
  const result = await executeSpellApplication({ ...request, sceneEpoch: currentSceneEpoch(), isCurrent: () => true });
  assert.ok(result, "the hold is written");
  await converge();
  const record = meta("maga")[SPELLS_KEY].find((entry) => entry.castContext?.readied === true);
  assert.ok(record, JSON.stringify(meta("maga")[SPELLS_KEY]));
  return record.instanceId;
}

// The release, as the panel sends it: the route of the ⚡ or of the card's menu, the session it opens, the area command,
// and what prepareReadiedRelease adds (the reaction, the hold's concentration broken by its instance).
async function release(holdId, { status = "applied" } = {}) {
  const route = routeSpellUnifiedPanelOpenRequest({ spellId: "fireball", casterId: "maga", phase: "resolve", parentInstanceId: holdId, slotLevel: 3 });
  const session = createSpellPanelSession({ contract: route.contract, ...route.session });
  assert.deepEqual([session.phase, session.activeConcentration, session.readiedRelease], ["cast", null, { instanceId: holdId }]);
  const descriptor = route.contract.presentation?.placement;
  const targetIds = ["goblin"];
  const placement = { status: "confirmed", confirmed: true, ruleId: descriptor.ruleId, spellId: "fireball", casterId: "maga",
    targetLocked: true, targetIds,
    preview: { type: "circle", start: { x: 0, y: 0 }, end: { x: 150, y: 0 }, gridOrigin: { x: 0, y: 0 }, dpi: 150, targetIds, targetLocked: true } };
  const command = buildSpellAreaResolutionCommand({
    contract: route.contract, spellId: "fireball", phase: session.phase, casterId: "maga", slotLevel: 3, targetIds,
    outcomes: { goblin: "failed" }, hpAmount: 24, validateSpatial: false, castContext: session.castContext,
    placement, targetLocked: true, candidateTargetIds: targetIds, readiedRelease: session.readiedRelease,
  });
  assert.equal(command.valid, true, JSON.stringify(command.errors));
  assert.deepEqual(command.readiedRelease, { instanceId: holdId });
  const reaction = planSpellReactionSpend({ spellId: "fireball", caster: sceneState.items.find((item) => item.id === "maga"),
    initiativeState: sceneState.metadata[STATE_KEY], readiedRelease: true });
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
    extraOperations: [
      ...reaction.operations,
      { type: "concentration:break", casterIds: ["maga"], reference: holdId, reason: "readied-release" },
    ],
  });
  assert.equal(result.status, status, JSON.stringify(result.errors || result.message || result));
  await converge();
  return result;
}

test("Fireball readied, then released: its damage, the reaction, the hold gone in one command; Undo gives the hold back", async () => {
  await resetScene([token("maga", 30, { attitude: "pc" }), token("goblin", 40, { attitude: "enemy" })]);
  const holdId = await hold("fireball", 3);
  assert.deepEqual(pills("maga"), ["Azione preparata"]);
  assert.deepEqual(Object.values(meta("maga")[CONCENTRATION_KEY]).map((entry) => entry.instanceId), [holdId]);
  const before = (await history.getHistoryEntries()).length;

  await release(holdId);
  assert.equal(meta("goblin").hp, 16, "the spell's own damage, as a cast's");
  assert.deepEqual(pills("maga"), ["Reazione usata"], "the hold's pill gone, the reaction spent");
  assert.deepEqual(meta("maga")[SPELLS_KEY].filter((entry) => entry.instanceId === holdId), [], "the hold's record gone");
  assert.deepEqual(meta("maga")[CONCENTRATION_KEY], {}, "Fireball needs no concentration: the hold's ends with it");
  const entries = await history.getHistoryEntries();
  assert.equal(entries.length, before + 1, "one command");
  assert.equal(entries.at(-1).label, "Rilascio · Palla di fuoco");
  // Lot T6e: the log tells the hold released, never vanished.
  const { combatEventFromHistoryEntryV3 } = await import("../src/combatLogV3Core.js");
  const { buildCombatLogPresentation } = await import("../src/combatLogPresentationCore.js");
  const logLines = buildCombatLogPresentation(null, [combatEventFromHistoryEntryV3(entries.at(-1))]).events[0].details.flatMap((section) => section.lines);
  assert.ok(logLines.some((line) => /Palla di fuoco \(azione preparata, rilasciata\)/u.test(line)), logLines.join(" | "));

  const undone = await history.undoHistoryThrough(entries.at(-1).id, { sceneEpoch: currentSceneEpoch() });
  assert.equal(normalizeHistoryUndoResult(undone).outcome, HISTORY_UNDO_OUTCOME.COMMITTED, JSON.stringify(undone));
  assert.equal(meta("goblin").hp, 40);
  assert.deepEqual(pills("maga"), ["Azione preparata"], "Undo: the hold back, the reaction too");
  assert.deepEqual(Object.values(meta("maga")[CONCENTRATION_KEY]).map((entry) => entry.instanceId), [holdId]);
});

test("Bless readied, then released: a concentration of its own, its duration from the release, never the hold's (P7)", async () => {
  await resetScene([token("maga", 30, { attitude: "pc" }), token("aria", 20, { attitude: "pc" }), token("dars", 20, { attitude: "pc" })]);
  const holdId = await hold("bless", 1);
  const route = routeSpellUnifiedPanelOpenRequest({ spellId: "bless", casterId: "maga", phase: "resolve", parentInstanceId: holdId, slotLevel: 1 });
  const session = createSpellPanelSession({ contract: route.contract, ...route.session, targetIds: ["aria", "dars"] });
  const request = buildSpellUnifiedLifecycleRequest({ contract: route.contract, session, spell: getSpellDefinition("bless") });
  assert.deepEqual([request.phasePlan.phase, request.activeConcentration, request.readiedRelease, request.historyLabel],
    ["cast", null, { instanceId: holdId }, "Rilascio: Benedizione"]);
  assert.equal(request.castContext.readied, undefined, "the spell's own cast context");
  const reaction = planSpellReactionSpend({ spellId: "bless", caster: sceneState.items.find((item) => item.id === "maga"),
    initiativeState: sceneState.metadata[STATE_KEY], readiedRelease: true });
  // As the panel runs it: the lifecycle adapter, which for a cast looks for a concentration of the same spell. The
  // hold is one: the release must not take its instance, or ending the hold would end the spell just cast.
  const result = await executeSpellUnifiedLifecycle({ contract: route.contract, session, runtime: {
    spell: getSpellDefinition("bless"),
    resolveActiveConcentration: ({ spell: definition }) => findActiveSpellConcentration(meta("maga")[CONCENTRATION_KEY], definition),
    extraOperations: [...reaction.operations, { type: "concentration:break", casterIds: ["maga"], reference: holdId, reason: "readied-release" }],
    castCost: "reazione",
  } });
  assert.equal(result.status, "committed", JSON.stringify(result.error || result));
  await converge();
  assert.deepEqual(pills("maga"), ["Reazione usata"]);
  const concentrations = Object.values(meta("maga")[CONCENTRATION_KEY]);
  assert.equal(concentrations.length, 1);
  assert.notEqual(concentrations[0].instanceId, holdId, "a new instance: the hold's next-turn end cannot reach it");
  assert.deepEqual(meta("aria").conditions.instances.map((instance) => [instance.condition, instance.parentEffectId]),
    [["+1d4 Att/TS", concentrations[0].instanceId]], "Bless's pill, on the new instance");
  assert.deepEqual(concentrations[0].targets.sort(), ["aria", "dars"]);
  const record = meta("maga")[SPELLS_KEY].find((entry) => entry.instanceId === concentrations[0].instanceId)
    || meta("aria")[SPELLS_KEY].find((entry) => entry.instanceId === concentrations[0].instanceId);
  // Its own duration, counted from the release: concentration for 10 rounds, never the hold's end at the next turn.
  assert.deepEqual([record?.conc, record?.turns, record?.expiry, record?.appliedAt?.round], [true, 10, undefined, 2], JSON.stringify(record));
  assert.equal(record?.castContext?.readied, undefined);
  assert.deepEqual(meta("maga")[SPELLS_KEY].filter((entry) => entry.instanceId === holdId), []);
  assert.equal((await history.getHistoryEntries()).at(-1).label, "Rilascio: Benedizione");
});

// Lot T6e: brought to 0 HP, the caster loses the hold with its concentration (decision D4 of the bugfix pass); the log
// says it vanished.
test("Fireball readied, then the caster drops to 0 HP: the hold vanishes, the slot still spent; the log says so", async () => {
  const { combatEventFromHistoryEntryV3 } = await import("../src/combatLogV3Core.js");
  const { buildCombatLogPresentation } = await import("../src/combatLogPresentationCore.js");
  await resetScene([token("maga", 30, { attitude: "enemy" }), token("goblin", 40, { attitude: "enemy" })]);
  const holdId = await hold("fireball", 3);
  const result = await clientEffects.runEffectsMutation([{ type: "hp:set", updates: [{ itemId: "maga", hp: 0, hpMax: 30,
    hpIntent: { mode: "damage", amount: 30, eventId: "ko" } }] }], { kind: "hp", label: "Danni: Maga", targetIds: ["maga"],
    history: { kind: "hp", label: "Danni: Maga" } });
  assert.equal(result.status, "applied", JSON.stringify(result));
  await converge();
  assert.equal(meta("maga").hp, 0);
  assert.deepEqual([(meta("maga")[SPELLS_KEY] || []).filter((entry) => entry.instanceId === holdId), meta("maga")[CONCENTRATION_KEY]], [[], {}]);
  assert.equal(pills("maga").includes("Azione preparata"), false);
  const entry = (await history.getHistoryEntries()).at(-1);
  const lines = buildCombatLogPresentation(null, [combatEventFromHistoryEntryV3(entry)]).events[0].details.flatMap((section) => section.lines);
  assert.ok(lines.some((line) => /Palla di fuoco \(azione preparata, svanita\)/u.test(line)), lines.join(" | "));
});

test("a hold that is gone releases nothing: the spell is not cast for free", async () => {
  await resetScene([token("maga", 30, { attitude: "pc" }), token("goblin", 40, { attitude: "enemy" })]);
  const result = await release("hold-gone", { status: "rejected" });
  assert.equal(result.errors?.[0]?.code, "readied-hold-missing", JSON.stringify(result));
  assert.equal(meta("goblin").hp, 40);
  assert.deepEqual(pills("maga"), []);
});
