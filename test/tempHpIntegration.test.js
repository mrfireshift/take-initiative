// CAP-TEMP, lotto T0 (PHB 2014, p. 198): the temporary hit points in meta.tempHp, apart from the HP, through the real
// coordinator, the area executor and History. The harness is the one of reactionHpIntegration.test.js.
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
  room: { id: "temp-hp-room", getMetadata: async () => ({}) },
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

const clientEffects = await import("../src/effectsMutations.js?temp-hp-real-client");
globalThis.location = { pathname: "/background.html" };
const backgroundEffects = await import("../src/effectsMutations.js?temp-hp-real-background");
globalThis.location = { pathname: "/plugin.html" };
const baseEffects = await import("../src/effectsMutations.js?temp-hp-real-base");
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

const history = await import("../src/history.js?temp-hp-real-history");
const historyOwner = await import("../src/historyOwner.js?temp-hp-real-owner");
mock.module("../src/history.js", { exports: { ...history } });
const { currentSceneEpoch, markSceneEpochReady } = await import("../src/sceneEpoch.js");
const { buildSpellUnifiedPanelContract } = await import("../src/spellUnifiedPanelCore.js?temp-hp-real-panel");
const { buildSpellAreaResolutionCommand } = await import("../src/spellAreaResolutionCommandCore.js?temp-hp-real-command");
const { executeSpellAreaResolution } = await import("../src/spellAreaResolutionExecutor.js?temp-hp-real-executor");
const { planEffectSaveReminderNotices } = await import("../src/effectSaveReminderCore.js?temp-hp-real-reminder-core");
const { resolveReminder, clearReminderResolutionQueue } = await import("../src/reminderResolution.js?temp-hp-real-reminder");
const { normalizeHistoryUndoResult, HISTORY_UNDO_OUTCOME } = await import("../src/historyUndoResultCore.js");
const { refreshConditionLabels } = await import("../src/conditions.js");
const { DEATH_SAVES_FIELD } = await import("../src/deathSaveCore.js");


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
      roomId: "temp-hp-room",
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

async function undoLast() {
  const entries = await history.getHistoryEntries();
  const result = await history.undoHistoryThrough(entries.at(-1).id, { sceneEpoch: currentSceneEpoch() });
  assert.equal(normalizeHistoryUndoResult(result).outcome, HISTORY_UNDO_OUTCOME.COMMITTED, JSON.stringify(result));
}

const pill = (id, condition, mechanics, extra = {}) => ({ id, condition, active: true, mechanics, expiry: { mode: "manual" },
  endsParentOnRemoval: true, ...extra });
const conditions = (instances) => ({ conditions: { version: 2, instances } });
const ward = (id) => conditions([pill(`${id}-ward`, "Interdizione alla morte", { deathWard: true }, { targetId: id })]);
const bond = (id) => conditions([pill(`${id}-bond`, "Vincolo di interdizione", { wardingBond: true }, { targetId: id, sourceId: CASTER })]);

async function damage(itemId, amount) {
  const item = sceneState.items.find((entry) => entry.id === itemId);
  const before = item.metadata[META_KEY];
  const result = await clientEffects.runEffectsMutation([{ type: "hp:set", updates: [{
    itemId, hp: Math.max(0, before.hp - amount), hpMax: before.hpMax,
    hpIntent: { mode: "damage", amount, eventId: `hit-${itemId}-${amount}` },
  }] }], { kind: "hp", label: `Danno a ${itemId}`, targetIds: [itemId], history: { kind: "hp", label: `Danno a ${itemId}` } });
  clientEffects.requireAppliedEffectsMutation(result);
  await convergeDeferredEffectsHistory();
  return result;
}

async function castOn(spellId, slotLevel, targetId, { amount, outcome } = {}) {
  const contract = buildSpellUnifiedPanelContract({ spellId, phase: "cast", castContext: { slotLevel } });
  const command = buildSpellAreaResolutionCommand({
    contract, spellId, phase: "cast", casterId: "wizard", slotLevel, targetIds: [targetId],
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
  assert.equal(result.status, "applied", JSON.stringify(result.errors || result));
  await convergeDeferredEffectsHistory();
  return result;
}

const { calculateQuickHPChange, QUICK_HP_MODES } = await import("../src/quickHpCore.js");
const { magicMissileDeathSaveHits } = await import("../src/magicMissileCore.js");
const { planWardingBondDamage } = await import("../src/reactionHpCore.js");

// An HP change as the consoles write it: the change of quickHpCore.js, its temporary hit points included.
async function hit(itemId, amount, { mode = QUICK_HP_MODES.DAMAGE, critical = false } = {}) {
  const before = meta(itemId);
  const change = calculateQuickHPChange({ mode, value: amount, hp: before.hp, hpMax: before.hpMax, tempHp: before.tempHp,
    deathSaveDamage: before.attitude === "pc" });
  const result = await clientEffects.runEffectsMutation([{ type: "hp:set", updates: [{
    itemId, hp: change.afterHP, hpMax: change.hpMax, tempHp: change.afterTempHp,
    hpIntent: { mode, amount, eventId: `hit-${itemId}-${amount}`, ...(critical ? { critical: true } : {}) },
  }] }], { kind: "hp", label: `PF a ${itemId}`, targetIds: [itemId], history: { kind: "hp", label: `PF a ${itemId}` } });
  clientEffects.requireAppliedEffectsMutation(result);
  await convergeDeferredEffectsHistory();
  return result;
}

const hpOf = (id) => [meta(id).hp, meta(id).tempHp];

test("the coordinator: damage takes the temporary hit points first, healing leaves them, each Undo puts them back", async () => {
  await resetScene([token("hero", 20, 40, { tempHp: 8 })]);
  await hit("hero", 5);
  assert.deepEqual(hpOf("hero"), [20, 3], "the temporary hit points took all of it");
  await hit("hero", 10);
  assert.deepEqual(hpOf("hero"), [13, undefined], "3 from them, 7 from the HP; the field goes away at 0");
  await hit("hero", 6, { mode: QUICK_HP_MODES.TEMP });
  await hit("hero", 50, { mode: QUICK_HP_MODES.HEAL });
  assert.deepEqual(hpOf("hero"), [40, 6], "a wounded creature keeps its HP with them; healing never touches them");
  await undoLast();
  await undoLast();
  await undoLast();
  assert.deepEqual(hpOf("hero"), [20, 3]);
  await undoLast();
  assert.deepEqual(hpOf("hero"), [20, 8]);
});

test("at 0 HP: no death save failure while the temporary hit points take the hit, one for the damage past them", async () => {
  await resetScene([token("hero", 0, 40, { attitude: "pc", tempHp: 6 })]);
  await hit("hero", 4);
  assert.deepEqual(hpOf("hero"), [0, 2]);
  assert.equal(meta("hero")[DEATH_SAVES_FIELD]?.failures || 0, 0);
  await hit("hero", 5);
  assert.deepEqual(hpOf("hero"), [0, undefined]);
  assert.equal(meta("hero")[DEATH_SAVES_FIELD]?.failures, 1);
});

test("massive damage: the leftover past 0 counts after the temporary hit points", async () => {
  await resetScene([token("hero", 10, 10, { attitude: "pc", tempHp: 5 })]);
  await hit("hero", 24);
  assert.equal(meta("hero").hp, 0);
  assert.equal(pills("hero").includes("Morto"), false, "5 temporary, 10 HP, 9 past 0: less than the maximum");
  await resetScene([token("hero", 10, 10, { attitude: "pc", tempHp: 5 })]);
  await hit("hero", 25);
  assert.equal(pills("hero").includes("Morto"), true, "10 past 0: the maximum");
});

test("a write above hpMax keeps the part above as temporary hit points (the tracker's editor, the old encoding)", async () => {
  await resetScene([token("hero", 30, 40, { tempHp: 2 })]);
  const result = await clientEffects.runEffectsMutation([{ type: "hp:set", damageEnds: false, updates: [{ itemId: "hero", hp: 45, hpMax: 40 }] }],
    { kind: "hp", targetIds: ["hero"], history: false });
  clientEffects.requireAppliedEffectsMutation(result);
  assert.deepEqual(hpOf("hero"), [40, 5]);
  await clientEffects.requireAppliedEffectsMutation(await clientEffects.runEffectsMutation([{ type: "hp:set", damageEnds: false,
    updates: [{ itemId: "hero", hp: 25, hpMax: 40 }] }], { kind: "hp", targetIds: ["hero"], history: false }));
  assert.deepEqual(hpOf("hero"), [25, 5], "a write within hpMax and without tempHp leaves them");
});

test("Warding Bond: the caster's temporary hit points take its share first", async () => {
  await resetScene([token(CASTER, 12, 30, { tempHp: 5 }), token("hero", 40, 40, { tempHp: 4, ...bond("hero") })]);
  await hit("hero", 7);
  assert.deepEqual(hpOf("hero"), [37, undefined]);
  assert.deepEqual(hpOf(CASTER), [10, undefined], "7 on the caster too: 5 temporary, 2 HP");
  await undoLast();
  assert.deepEqual([hpOf("hero"), hpOf(CASTER)], [[40, 4], [12, 5]]);
  const plan = planWardingBondDamage({ writes: [{ itemId: "hero", damage: 3 }],
    itemsById: new Map(sceneState.items.map((item) => [item.id, item])) });
  assert.deepEqual([plan.writes[0].hp, plan.writes[0].tempHp], [12, 2]);
});

test("the area command writes and undoes the temporary hit points with the HP", async () => {
  await resetScene([token("wizard", 30, 30), token("orc", 20, 60, { attitude: "enemy", tempHp: 5 })]);
  await castOn("disintegrate", 6, "orc", { amount: 12, outcome: "failed" });
  assert.deepEqual(hpOf("orc"), [13, undefined]);
  await undoLast();
  assert.deepEqual(hpOf("orc"), [20, 5]);
});

test("the History records what the command did to the temporary hit points, for the combat log", async () => {
  await resetScene([token("hero", 20, 40, { tempHp: 8 })]);
  await hit("hero", 5);
  await hit("hero", 6, { mode: QUICK_HP_MODES.TEMP });
  const result = await clientEffects.runEffectsMutation([{ type: "hp:set", damageEnds: false, updates: [{ itemId: "hero",
    hp: 20, hpMax: 40, tempHp: 0 }] }], { kind: "hp", label: "Modifica", targetIds: ["hero"], history: { kind: "hp", label: "Modifica" } });
  clientEffects.requireAppliedEffectsMutation(result);
  await convergeDeferredEffectsHistory();
  const records = (await history.getHistoryEntries()).map((entry) => entry.payload?.tempHp?.[0]);
  assert.deepEqual(records.map((record) => record && [record.mode, record.before, record.after]),
    [["absorbed", 8, 3], ["raised", 3, 6], ["removed", 6, 0]]);
});

test("Magic Missile: the darts the temporary hit points take whole reach no HP", () => {
  assert.deepEqual(magicMissileDeathSaveHits({ hp: 0, tempHp: 4, dartDamages: [3, 3, 2] }), { hitsAtZero: 2, damageInstance: 2 },
    "the first dart and 1 of the second on the temporary hit points");
  assert.deepEqual(magicMissileDeathSaveHits({ hp: 0, tempHp: 9, dartDamages: [3, 3, 2] }).hitsAtZero, 0);
  assert.deepEqual(magicMissileDeathSaveHits({ hp: 5, tempHp: 2, dartDamages: [4, 4] }), { hitsAtZero: 0, damageInstance: 6 });
});

// CAP-TEMP, lotto T3a: the source of the temporary hit points (meta.tempHpSource), the pill whose end takes them.
const sourceOf = (id) => meta(id).tempHpSource;

async function grant(itemId, amount, sourceId) {
  const before = meta(itemId);
  const change = calculateQuickHPChange({ mode: QUICK_HP_MODES.TEMP, value: amount, hp: before.hp, hpMax: before.hpMax, tempHp: before.tempHp });
  const result = await clientEffects.runEffectsMutation([{ type: "hp:set", updates: [{ itemId, hp: change.afterHP, hpMax: change.hpMax,
    tempHp: change.afterTempHp, ...(sourceId ? { tempHpSourceId: sourceId } : {}),
    hpIntent: { mode: "temp", amount, eventId: `temp-${itemId}-${amount}` } }] }],
  { kind: "hp", label: `PF temporanei a ${itemId}`, targetIds: [itemId], history: { kind: "hp", label: "PF temporanei" } });
  clientEffects.requireAppliedEffectsMutation(result);
  await convergeDeferredEffectsHistory();
}

async function endPill(itemId, instanceId) {
  const result = await clientEffects.runEffectsMutation([{ type: "condition:remove-instances", removals: [{ itemId, instanceId }] }],
    { kind: "condition", label: "Fine", targetIds: [itemId], history: { kind: "condition", label: "Fine" } });
  clientEffects.requireAppliedEffectsMutation(result);
  await convergeDeferredEffectsHistory();
}

test("T3a: the temporary hit points of a pill go when it ends, with a record for the log; the Undo brings both back", async () => {
  await resetScene([token("hero", 20, 40, conditions([pill("fl-1", "Vita falsata", {})]))]);
  await grant("hero", 9, "fl-1");
  assert.deepEqual([...hpOf("hero"), sourceOf("hero")], [20, 9, "fl-1"]);
  await hit("hero", 4);
  assert.deepEqual([...hpOf("hero"), sourceOf("hero")], [20, 5, "fl-1"], "damage keeps the source");
  await endPill("hero", "fl-1");
  assert.deepEqual([...hpOf("hero"), sourceOf("hero")], [20, undefined, undefined]);
  const entries = await history.getHistoryEntries();
  assert.deepEqual(entries.at(-1).payload?.tempHp, [{ id: "hero", before: 5, after: 0, mode: "expired" }]);
  await undoLast();
  assert.deepEqual([...hpOf("hero"), sourceOf("hero"), pills("hero")], [20, 5, "fl-1", ["Vita falsata"]]);
});

test("T3a: a higher grant from elsewhere takes the pool over: the pill's end leaves it; none left, no source", async () => {
  await resetScene([token("hero", 20, 40, conditions([pill("fl-1", "Vita falsata", {})]))]);
  await grant("hero", 6, "fl-1");
  await grant("hero", 10);
  assert.deepEqual([...hpOf("hero"), sourceOf("hero")], [20, 10, undefined], "the console's grant has no pill");
  await endPill("hero", "fl-1");
  assert.deepEqual(hpOf("hero"), [20, 10], "not the pill's any more");
  await resetScene([token("hero", 20, 40, conditions([pill("fl-1", "Vita falsata", {})]))]);
  await grant("hero", 6, "fl-1");
  await hit("hero", 8);
  assert.deepEqual([...hpOf("hero"), sourceOf("hero")], [18, undefined, undefined]);
  assert.deepEqual(pills("hero"), ["Vita falsata"], "an ordinary pill stays");
});

test("T3a: a pill that ends when its temporary hit points are gone (Armor of Agathys), in the same command", async () => {
  const armor = () => conditions([pill("aoa-1", "Armatura di Agathys", { endsWhenTempHpGone: true })]);
  await resetScene([token("hero", 20, 40, armor())]);
  await grant("hero", 5, "aoa-1");
  await hit("hero", 3);
  assert.deepEqual(pills("hero"), ["Armatura di Agathys"], "2 left");
  await hit("hero", 6);
  assert.deepEqual([...hpOf("hero"), pills("hero")], [16, undefined, []]);
  await undoLast();
  assert.deepEqual([...hpOf("hero"), sourceOf("hero"), pills("hero")], [20, 2, "aoa-1", ["Armatura di Agathys"]]);
  await resetScene([token("wizard", 30, 30), token("orc", 20, 60, { attitude: "enemy", tempHp: 5, tempHpSource: "aoa-2",
    ...conditions([pill("aoa-2", "Armatura di Agathys", { endsWhenTempHpGone: true })]) })]);
  await castOn("disintegrate", 6, "orc", { amount: 12, outcome: "failed" });
  assert.deepEqual([...hpOf("orc"), sourceOf("orc"), pills("orc")], [13, undefined, undefined, []], "the area command too");
  await undoLast();
  assert.deepEqual([...hpOf("orc"), sourceOf("orc"), pills("orc")], [20, 5, "aoa-2", ["Armatura di Agathys"]]);
});

// CAP-TEMP, lotto T3b: the temporary hit points of a cast, with its pill, in the same command and History entry.
const { executeSpellApplication } = await import("../src/spellApplicationExecutor.js?temp-hp-cast");
const { getSpellDefinition } = await import("../src/spells-srd.js");

async function cast(spellId, slotLevel, { roll, targetIds = [CASTER] } = {}) {
  const spell = getSpellDefinition(spellId);
  const result = await executeSpellApplication({ spell, casterId: CASTER, casterName: "Maga", targetIds,
    turns: spell.defaultTurns || 10, castContext: { slotLevel }, requestedConcentration: spell.concentration === true,
    ...(roll !== undefined ? { temporaryHpRoll: roll } : {}), sceneEpoch: currentSceneEpoch(), isCurrent: () => true });
  await convergeDeferredEffectsHistory();
  return result;
}
const pillOf = (id, label) => (meta(id).conditions?.instances || []).find((entry) => entry.condition === label && entry.active !== false);

test("T3b: False Life gives the 1d4 rolled + 4 + 5 per slot above the 1st, its pill their source; its end takes them", async () => {
  await resetScene([token(CASTER, 18, 30)]);
  await cast("false-life", 2, { roll: 3 });
  const pill = pillOf(CASTER, "Vita falsata");
  assert.ok(pill, JSON.stringify(meta(CASTER).conditions));
  assert.deepEqual([...hpOf(CASTER), sourceOf(CASTER)], [18, 12, pill.id], "3 + 4 + 5, the wounded caster keeps 18");
  await assert.rejects(cast("false-life", 1), /spell-temporary-hp-roll-required/u, "no roll, no cast");
  await endPill(CASTER, pill.id);
  assert.deepEqual([...hpOf(CASTER), sourceOf(CASTER)], [18, undefined, undefined]);
  await undoLast();
  await undoLast();
  assert.deepEqual([...hpOf(CASTER), pillOf(CASTER, "Vita falsata")], [18, undefined, undefined], "one Undo takes the cast away");
});

test("T3b: Armor of Agathys, 5 per slot level, its pill ending when they are gone; Tenser's 50 outlast the spell", async () => {
  await resetScene([token(CASTER, 30, 30)]);
  await cast("phb2014-armatura-di-agathys", 2);
  const armor = (meta(CASTER).conditions?.instances || []).find((entry) => entry.effectId === "agathys-armor");
  assert.deepEqual([...hpOf(CASTER), sourceOf(CASTER)], [30, 10, armor?.id]);
  await hit(CASTER, 10);
  assert.equal((meta(CASTER).conditions?.instances || []).some((entry) => entry.effectId === "agathys-armor" && entry.active !== false), false,
    "none left: the armor ends");
  await resetScene([token(CASTER, 60, 60, { tempHp: 5 })]);
  await cast("xanathar-trasformazione-di-tenser", 6);
  assert.deepEqual([...hpOf(CASTER), sourceOf(CASTER)], [60, 50, undefined], "no source: they stay after the spell");
});

// CAP-TEMP, lotto T3c: Armor of Agathys' cold on an attacker that hits in melee, while its temporary hit points last.
const { attackTargetReactions } = await import("../src/attackReactionsCore.js");

test("T3c: the armor's retaliation, 5 cold per slot level, on a melee hit while its temporary hit points last", async () => {
  await resetScene([token(CASTER, 30, 30), token("ogre", 59, 59, { attitude: "enemy" })]);
  await cast("phb2014-armatura-di-agathys", 2);
  const reactions = (attack) => attackTargetReactions({ target: sceneState.items.find((item) => item.id === CASTER),
    attacker: { id: "ogre", name: "Ogre" }, attack: { roll: true, damageTypes: ["bludgeoning"], ...attack } });
  const [row] = reactions({ melee: true, outcome: "hit" }).retaliations;
  assert.deepEqual([row?.label, row?.amount, row?.type], ["Armatura di Agathys", 10, "cold"]);
  assert.match(row.text, /Ogre subisce 10 danni da freddo/u);
  assert.equal(reactions({ melee: false, outcome: "hit" }).retaliations.length, 0, "a ranged attack: none");
  assert.equal(reactions({ melee: true, outcome: "miss" }).retaliations.length, 0, "a miss: none");
  await hit(CASTER, 4);
  assert.equal(reactions({ melee: true, outcome: "hit" }).retaliations.length, 1, "6 left: still");
  await grant(CASTER, 20);
  assert.equal(reactions({ melee: true, outcome: "hit" }).retaliations.length, 0, "other temporary hit points: not the armor's");
});
