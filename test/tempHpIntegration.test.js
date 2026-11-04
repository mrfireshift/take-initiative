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

test("T3b: Armor of Agathys, 5 per slot level, its pill ending when they are gone; Tenser's 50 end with the spell", async () => {
  await resetScene([token(CASTER, 30, 30)]);
  await cast("phb2014-armatura-di-agathys", 2);
  const armor = (meta(CASTER).conditions?.instances || []).find((entry) => entry.effectId === "agathys-armor");
  assert.deepEqual([...hpOf(CASTER), sourceOf(CASTER)], [30, 10, armor?.id]);
  await hit(CASTER, 10);
  assert.equal((meta(CASTER).conditions?.instances || []).some((entry) => entry.effectId === "agathys-armor" && entry.active !== false), false,
    "none left: the armor ends");
  await resetScene([token(CASTER, 60, 60, { tempHp: 5 })]);
  await cast("xanathar-trasformazione-di-tenser", 6);
  const tenser = () => (meta(CASTER).conditions?.instances || []).find((entry) => entry.effectId === "tensers-transformation" && entry.active !== false);
  const form = tenser();
  assert.deepEqual([...hpOf(CASTER), sourceOf(CASTER)], [60, 50, form?.id], "the pill of the spell is their source");
  await hit(CASTER, 20);
  assert.deepEqual([...hpOf(CASTER), sourceOf(CASTER)], [60, 30, form?.id]);
  await endPill(CASTER, form.id);
  assert.deepEqual([...hpOf(CASTER), sourceOf(CASTER)], [60, undefined, undefined], "the ones left are lost when it ends");
  await resetScene([token(CASTER, 60, 60)]);
  await cast("xanathar-trasformazione-di-tenser", 6);
  await hit(CASTER, 50);
  assert.equal(hpOf(CASTER)[1], undefined);
  assert.ok(tenser(), "none left: the transformation goes on, unlike the armor");
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

// CAP-TEMP, lotto T3d: Heroism's reminder at the start of each of the target's turns, the caster's modifier entered.
const CLERIC_CARD = { spellSaveDC: 15, characterBuild: [{ classId: "cleric", level: 5 }] };
const heroismScene = (card = CLERIC_CARD) => [token(CASTER, 30, 30, card ? { initiativeCard: card } : {}), token("hero", 20, 40), token("ally", 15, 15)];
// The target's turn starts: the notice the controller would announce, as the popup gets it.
function heroismNotice(itemId = "hero", round = 1) {
  const state = sceneState.metadata[STATE_KEY];
  const index = state.order.indexOf(itemId);
  const previous = { ...state, round, current: index - 1 };
  const notice = planEffectSaveReminderNotices({ items: sceneState.items, previousInitiativeState: previous,
    initiativeState: { ...state, round, current: index } }).find((entry) => entry.effectName === "Eroismo" && entry.target.id === itemId);
  return notice ? { ...notice, targets: [notice.target] } : null;
}

const { combatEventFromHistoryEntry } = await import("../src/combatLogCore.js");
const { buildCombatLogPresentation } = await import("../src/combatLogPresentationCore.js");

test("T3e: Negative Energy Flood on an undead: half the roll as temporary hit points, in the log; another pill's source goes", async () => {
  await resetScene([token("wizard", 30, 30), token("ghoul", 10, 22, { attitude: "enemy", tempHp: 3, tempHpSource: "old",
    ...conditions([pill("old", "Vita falsata", {})]) })]);
  await castOn("xanathar-flusso-di-energia-negativa", 5, "ghoul", { amount: 31, outcome: "immune" });
  assert.deepEqual([...hpOf("ghoul"), sourceOf("ghoul")], [10, 15, undefined], "wounded and not healed, the 15 are nobody's");
  const entry = (await history.getHistoryEntries()).at(-1);
  assert.deepEqual(entry.payload?.tempHp, [{ id: "ghoul", before: 3, after: 15, mode: "raised" }]);
  const log = JSON.stringify(buildCombatLogPresentation({}, [combatEventFromHistoryEntry(entry, { round: 1 })]));
  assert.match(log, /PF temporanei da 3 a 15/u);
  assert.match(log, /Non morto/u, log);
  assert.doesNotMatch(log, /Immune/u, log);
  await undoLast();
  assert.deepEqual([...hpOf("ghoul"), sourceOf("ghoul")], [10, 3, "old"]);
});

test("T3d: Heroism: its pill on each target, the modifier offered at the start of its turn, the pill their source", async () => {
  await resetScene(heroismScene());
  await cast("heroism", 2, { targetIds: ["hero", "ally"] });
  const courage = pillOf("hero", "Eroismo");
  assert.ok(courage, "the pill on the target");
  assert.ok(pillOf("ally", "Eroismo"), "and on the second target of a 2nd-level slot");
  assert.equal(pillOf(CASTER, "Eroismo"), undefined);
  assert.equal(hpOf("hero")[1], undefined, "nothing at the cast: they come at the start of its turn");

  const notice = heroismNotice();
  assert.equal(notice.resolution.mode, "manual-heal");
  assert.equal(notice.resolution.activation.resolutionData.temporaryHp, true);
  assert.equal(notice.resolution.activation.resolutionData.suggestedAmount, 4, "DC 15 - 8 - proficiency 3");
  assert.deepEqual([notice.saveLabel, notice.eyebrow], ["PF temporanei", "Promemoria effetto"]);
  const applied = await resolveReminder({ notice, outcome: "apply", damageRoll: "4", sceneEpoch: currentSceneEpoch() });
  assert.equal(applied.status, "applied", JSON.stringify(applied));
  await convergeDeferredEffectsHistory();
  assert.deepEqual([...hpOf("hero"), sourceOf("hero")], [20, 4, courage.id], "the wounded target is not healed");
  assert.equal(heroismNotice(), null, "resolved: not offered again for this turn");
  assert.deepEqual((await history.getHistoryEntries()).at(-1).payload?.tempHp, [{ id: "hero", before: 0, after: 4, mode: "granted" }]);

  await hit("hero", 3);
  const next = heroismNotice("hero", 2);
  await resolveReminder({ notice: next, outcome: "apply", damageRoll: "4", sceneEpoch: currentSceneEpoch() });
  await convergeDeferredEffectsHistory();
  assert.deepEqual([...hpOf("hero"), sourceOf("hero")], [20, 4, courage.id], "back to the modifier, not added to what was left");
  await undoLast();
  assert.deepEqual([...hpOf("hero"), sourceOf("hero")], [20, 1, courage.id]);
});

test("T3d: Heroism's end, with the concentration, takes the ones left on every target; the Undo brings them back", async () => {
  await resetScene(heroismScene());
  await cast("heroism", 2, { targetIds: ["hero", "ally"] });
  await resolveReminder({ notice: heroismNotice(), outcome: "apply", damageRoll: "4", sceneEpoch: currentSceneEpoch() });
  await resolveReminder({ notice: heroismNotice("ally"), outcome: "apply", damageRoll: "4", sceneEpoch: currentSceneEpoch() });
  await convergeDeferredEffectsHistory();
  assert.deepEqual([hpOf("hero")[1], hpOf("ally")[1]], [4, 4]);
  const result = await clientEffects.runEffectsMutation([{ type: "concentration:break", casterIds: [CASTER] }],
    { kind: "concentration", label: "Fine", targetIds: [CASTER, "hero", "ally"], history: { kind: "concentration", label: "Fine" } });
  clientEffects.requireAppliedEffectsMutation(result);
  await convergeDeferredEffectsHistory();
  assert.deepEqual([...hpOf("hero"), sourceOf("hero"), pills("hero")], [20, undefined, undefined, []]);
  assert.deepEqual([...hpOf("ally"), sourceOf("ally"), pills("ally")], [15, undefined, undefined, []]);
  await undoLast();
  assert.deepEqual([hpOf("hero")[1], hpOf("ally")[1], pills("hero")], [4, 4, ["Eroismo"]]);
});

test("T3d: higher temporary hit points stay with their source; a card with no modifier leaves the field to the GM", async () => {
  await resetScene(heroismScene(null));
  await cast("heroism", 1, { targetIds: ["hero"] });
  await grant("hero", 9);
  const notice = heroismNotice();
  assert.equal(notice.resolution.activation.resolutionData.suggestedAmount, undefined);
  assert.match(notice.instruction, /Inserisci il modificatore da incantatore/u);
  assert.equal((await resolveReminder({ notice, outcome: "apply", damageRoll: "", sceneEpoch: currentSceneEpoch() })).status, "invalid",
    "no amount, nothing applied");
  await resolveReminder({ notice, outcome: "apply", damageRoll: "3", sceneEpoch: currentSceneEpoch() });
  await convergeDeferredEffectsHistory();
  assert.deepEqual([...hpOf("hero"), sourceOf("hero")], [20, 9, undefined], "the 9 stay, and the pill's end will leave them");
  await endPill("hero", pillOf("hero", "Eroismo").id);
  assert.deepEqual(hpOf("hero"), [20, 9]);
});

test("T3d: Ignora writes no hit points; a target under Heroism cannot be frightened", async () => {
  await resetScene(heroismScene());
  await cast("heroism", 1, { targetIds: ["hero"] });
  await resolveReminder({ notice: heroismNotice(), outcome: "ignore", sceneEpoch: currentSceneEpoch() });
  await convergeDeferredEffectsHistory();
  assert.deepEqual([...hpOf("hero"), sourceOf("hero")], [20, undefined, undefined]);
  assert.equal(heroismNotice(), null, "answered: not offered again");
  await clientEffects.runEffectsMutation([{ type: "condition:add", targetIds: ["hero", "ally"], conditionName: "Spaventato", options: { expiry: { mode: "manual" } } }],
    { kind: "condition", label: "Paura", targetIds: ["hero", "ally"], history: { kind: "condition", label: "Paura" } });
  await convergeDeferredEffectsHistory();
  assert.deepEqual([pills("hero"), pills("ally")], [["Eroismo"], ["Spaventato"]]);
});

// CAP-DURATION, CAP-MODE, CAP-REPEAT-HEAL (2014 texts): Bestow Curse, Alter Self, Regenerate, through the real coordinator.
const castWith = async (spellId, slotLevel, targetIds, extra = {}) => {
  const spell = getSpellDefinition(spellId);
  const result = await executeSpellApplication({ spell, casterId: CASTER, casterName: "Maga", targetIds,
    turns: getSpellDurationTurns(spell, { slotLevel }) || spell.defaultTurns || 10, castContext: { slotLevel },
    sceneEpoch: currentSceneEpoch(), isCurrent: () => true, ...extra });
  await convergeDeferredEffectsHistory();
  return result;
};
const { getSpellDurationTurns } = await import("../src/spells-srd.js");
const { buildSpellActiveActionPlan } = await import("../src/spellActiveActionCore.js");
const instancesOf = (id) => (meta(id).conditions?.instances || []).filter((entry) => entry.active !== false);
const spellOf = (id, spellId) => (meta(id)[SPELLS_KEY] || []).find((entry) => entry.spellId === spellId);

const curse = (slot) => castWith("bestow-curse", slot, ["hero"], { selectedChoice: "ability-strength", saveOutcomes: { hero: "failed" } });

test("Bestow Curse: concentration up to the 4th-level slot, with its duration", async () => {
  for (const [slot, turns] of [[3, 10], [4, 100]]) {
    await resetScene([token(CASTER, 30, 30), token("hero", 20, 40)]);
    await curse(slot);
    assert.equal(spellOf("hero", "bestow-curse").conc, true, `slot ${slot}`);
    assert.equal(spellOf("hero", "bestow-curse").turns, turns, `slot ${slot}`);
    assert.equal(instancesOf("hero")[0].expiry.mode, "concentration");
    assert.equal(Object.keys(meta(CASTER)[CONCENTRATION_KEY]).length, 1);
  }
});

test("Bestow Curse: from the 5th-level slot no concentration: an ongoing spell of the caster stays, the pill lasts its rounds", async () => {
  for (const [slot, turns] of [[5, 4800], [6, 4800], [7, 14400], [8, 14400]]) {
    await resetScene([token(CASTER, 30, 30), token("hero", 20, 40)]);
    await curse(slot);
    assert.equal(spellOf("hero", "bestow-curse").conc, false, `slot ${slot}`);
    assert.equal(spellOf("hero", "bestow-curse").turns, turns, `slot ${slot}`);
    assert.deepEqual([instancesOf("hero")[0].expiry.mode, instancesOf("hero")[0].expiry.remaining], ["rounds", turns]);
    assert.deepEqual(meta(CASTER)[CONCENTRATION_KEY] || {}, {}, `slot ${slot}: no concentration`);
  }
  await resetScene([token(CASTER, 30, 30), token("hero", 20, 40)]);
  await castWith("bless", 1, ["hero"], { selectedChoice: "" });
  await curse(5);
  assert.ok(spellOf("hero", "bless"), "the concentration on another spell is not broken");
  assert.ok(Object.values(meta(CASTER)[CONCENTRATION_KEY]).some((entry) => /Benedizione/u.test(entry.name)));
});

test("Bestow Curse with a 9th-level slot lasts until dispelled: the rounds do not end it; one Undo takes it off", async () => {
  await resetScene([token(CASTER, 30, 30), token("hero", 20, 40)]);
  await curse(9);
  assert.equal(instancesOf("hero")[0].expiry.mode, "manual");
  assert.equal(spellOf("hero", "bestow-curse").conc, false);
  const ticked = await clientEffects.runEffectsMutation([{ type: "effects:tick-round", targetIds: ["hero"] }], { history: false, kind: "effects:tick-round", targetIds: ["hero"] });
  clientEffects.requireAppliedEffectsMutation(ticked);
  assert.ok(spellOf("hero", "bestow-curse"), "still there after a round");
  assert.equal(instancesOf("hero").length, 1);
  await undoLast();
  assert.equal(spellOf("hero", "bestow-curse"), undefined);
});

const swapForm = async (formId) => {
  const spell = getSpellDefinition("alter-self");
  const entry = spellOf(CASTER, "alter-self");
  const plan = buildSpellActiveActionPlan({ spell, actionId: `alter-self-form-${formId}`, casterName: "Maga", group: {
    casterId: CASTER, instanceId: entry.instanceId, castContext: entry.castContext,
    effectInstances: instancesOf(CASTER).map((instance) => ({ itemId: CASTER, instanceId: instance.id, effectId: instance.effectId, active: true })),
  } });
  assert.equal(plan.valid, true, JSON.stringify(plan.errors));
  const result = await clientEffects.runEffectsMutation(plan.operations,
    { kind: "spell", label: plan.historyLabel, targetIds: [CASTER], history: { kind: "spell", label: plan.historyLabel } });
  clientEffects.requireAppliedEffectsMutation(result);
  await convergeDeferredEffectsHistory();
};

test("Alter Self: an action swaps the form, one at a time; the spell and the concentration stay; one Undo goes back", async () => {
  await resetScene([token(CASTER, 30, 30)]);
  await castWith("alter-self", 2, [CASTER], { selectedChoice: "natural-weapons" });
  const instanceId = spellOf(CASTER, "alter-self").instanceId;
  assert.deepEqual(instancesOf(CASTER).map((entry) => entry.effectId), ["alter-self-natural-weapons"]);
  await swapForm("aquatic-adaptation");
  assert.deepEqual(instancesOf(CASTER).map((entry) => entry.effectId), ["aquatic-adaptation"]);
  assert.equal(instancesOf(CASTER)[0].expiry.mode, "concentration");
  assert.deepEqual(instancesOf(CASTER)[0].mechanics.movement.modes.swim, { copyFrom: "walk" });
  assert.equal(spellOf(CASTER, "alter-self").instanceId, instanceId, "the same spell");
  assert.equal(Object.keys(meta(CASTER)[CONCENTRATION_KEY]).length, 1);
  await undoLast();
  assert.deepEqual(instancesOf(CASTER).map((entry) => entry.effectId), ["alter-self-natural-weapons"]);
  await swapForm("change-appearance");
  await swapForm("change-appearance");
  assert.deepEqual(instancesOf(CASTER).map((entry) => entry.effectId), ["alter-self-appearance"], "the appearance can change again");
  const ended = await clientEffects.runEffectsMutation([{ type: "concentration:break", casterIds: [CASTER] }],
    { kind: "concentration", label: "Fine", targetIds: [CASTER], history: { kind: "concentration", label: "Fine" } });
  clientEffects.requireAppliedEffectsMutation(ended);
  assert.deepEqual([instancesOf(CASTER), spellOf(CASTER, "alter-self")], [[], undefined], "the swapped form ends with the spell");
});

const regenerateNotice = (itemId = "hero", round = 1) => {
  const state = sceneState.metadata[STATE_KEY];
  const index = state.order.indexOf(itemId);
  const notice = planEffectSaveReminderNotices({ items: sceneState.items, previousInitiativeState: { ...state, round, current: index - 1 },
    initiativeState: { ...state, round, current: index } }).find((entry) => entry.effectName === "Rigenerazione" && entry.target.id === itemId);
  return notice ? { ...notice, targets: [notice.target] } : null;
};

test("Regenerate: the total of its 4d8 + 15 at the cast, required, with its pill; one Undo takes both back", async () => {
  await resetScene([token(CASTER, 30, 30), token("hero", 5, 60)]);
  await assert.rejects(castWith("regenerate", 7, ["hero"]), /spell-healing-required/u, "no total, no cast");
  await castWith("regenerate", 7, ["hero"], { castHealingValue: 33 });
  assert.equal(meta("hero").hp, 38);
  assert.equal(spellOf("hero", "regenerate").turns, 600);
  assert.deepEqual(instancesOf("hero").map((entry) => entry.effectId), ["regenerate-healing"]);
  await undoLast();
  assert.deepEqual([meta("hero").hp, instancesOf("hero"), spellOf("hero", "regenerate")], [5, [], undefined]);
});

test("Regenerate: at the start of its turn the reminder has the 1 entered; a dying PC wakes up; one Undo", async () => {
  await resetScene([token(CASTER, 30, 30), token("hero", 20, 60)]);
  await castWith("regenerate", 7, ["hero"], { castHealingValue: 10 });
  const notice = regenerateNotice();
  assert.equal(notice.resolution.mode, "manual-heal");
  assert.equal(notice.resolution.activation.resolutionData.suggestedAmount, 1);
  assert.equal(notice.resolution.activation.resolutionData.temporaryHp, undefined);
  assert.deepEqual([notice.saveLabel, notice.eyebrow], ["Cura", "Promemoria effetto"]);
  const applied = await resolveReminder({ notice, outcome: "apply", damageRoll: "1", sceneEpoch: currentSceneEpoch() });
  assert.equal(applied.status, "applied", JSON.stringify(applied));
  await convergeDeferredEffectsHistory();
  assert.equal(meta("hero").hp, 31);
  assert.equal(regenerateNotice(), null, "answered: not offered again in this turn");
  assert.ok(regenerateNotice("hero", 2), "and it is back in the next");
  await undoLast();
  assert.equal(meta("hero").hp, 30);

  await resetScene([token(CASTER, 30, 30), token("hero", 0, 60, { attitude: "pc", deathSaves: { successes: 1, failures: 2 } })]);
  await castWith("regenerate", 7, ["hero"], { castHealingValue: 0 });
  assert.deepEqual(meta("hero").deathSaves, { successes: 1, failures: 2 }, "a total of 0 changes nothing");
  await resolveReminder({ notice: regenerateNotice(), outcome: "apply", damageRoll: "1", sceneEpoch: currentSceneEpoch() });
  await convergeDeferredEffectsHistory();
  assert.deepEqual([meta("hero").hp, meta("hero").deathSaves], [1, undefined], "the tally goes with the first hit point");
});

test("Regenerate: no reminder at full hit points nor on the dead; any creature type can be healed", async () => {
  await resetScene([token(CASTER, 30, 30), token("hero", 60, 60)]);
  await castWith("regenerate", 7, ["hero"], { castHealingValue: 10 });
  assert.equal(regenerateNotice(), null, "full");
  await resetScene([token(CASTER, 30, 30), token("ogre", 0, 59, { attitude: "enemy" })]);
  await castWith("regenerate", 7, ["ogre"], { castHealingValue: 0 });
  assert.equal(regenerateNotice("ogre"), null, "dead");
  await resetScene([token(CASTER, 30, 30), token("ghoul", 3, 22, { attitude: "enemy", creatureType: "Non morto" })]);
  await castWith("regenerate", 7, ["ghoul"], { castHealingValue: 2 });
  await resolveReminder({ notice: regenerateNotice("ghoul"), outcome: "apply", damageRoll: "1", sceneEpoch: currentSceneEpoch() });
  await convergeDeferredEffectsHistory();
  assert.equal(meta("ghoul").hp, 6, "the text excludes no type");
});
