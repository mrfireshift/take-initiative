import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { createVersionedIndexedDB, versionedKeyRange } from "../test-support/fakeVersionedIndexedDb.js";

globalThis.indexedDB = createVersionedIndexedDB();
globalThis.IDBKeyRange = versionedKeyRange;
globalThis.location = { pathname: "/background.html" };

const META_KEY = "com.thebigpicture.initiative/meta";
const HISTORY_KEY = "com.thebigpicture.initiative/history";
const clone = (value) => structuredClone(value);

let sceneItems = [];
let sceneMetadata = {};
let roomMetadata = {};
let role = "GM";
let testSequence = 0;
const broadcastListeners = new Map();

const sdk = {
  onReady() {},
  player: { getRole: async () => role },
  room: {
    id: "death-save-room",
    getMetadata: async () => clone(roomMetadata),
    setMetadata: async (update) => { roomMetadata = { ...roomMetadata, ...clone(update) }; },
    onMetadataChange: () => () => {},
  },
  scene: {
    isReady: async () => true,
    onReadyChange: () => () => {},
    grid: { getDpi: async () => 100, getScale: async () => ({ parsed: { multiplier: 5, unit: "ft" } }) },
    // The Embers renderer: the end of a cantrip's pill (Undo, expiry) removes its loop from the local items.
    local: { getItems: async () => [], addItems: async () => {}, updateItems: async () => {}, deleteItems: async () => {}, onChange: () => () => {} },
    getMetadata: async () => clone(sceneMetadata),
    setMetadata: async (update) => { sceneMetadata = { ...sceneMetadata, ...clone(update) }; },
    items: {
      getItems: async (ids) => clone(sceneItems.filter((item) => (
        !ids || (typeof ids === "function" ? ids(item) : ids.includes(item.id))
      ))),
      updateItems: async (ids, updater) => {
        const drafts = clone(sceneItems.filter((item) => (typeof ids === "function" ? ids(item) : ids.includes(item.id))));
        updater(drafts);
        const byId = new Map(drafts.map((item) => [item.id, item]));
        sceneItems = sceneItems.map((item) => byId.get(item.id) || item);
      },
      // A token is one 100 px cell from its position (the grid below: 100 dpi, 5 ft per cell).
      getItemBounds: async (ids) => {
        const item = sceneItems.find((candidate) => candidate.id === ids[0]);
        if (!item) throw new Error("missing item");
        const { x, y } = item.position || { x: 0, y: 0 };
        return { min: { x, y }, max: { x: x + 100, y: y + 100 }, width: 100, height: 100, center: { x: x + 50, y: y + 50 } };
      },
      addItems: async (items) => { sceneItems.push(...clone(items)); },
      deleteItems: async (ids) => { sceneItems = sceneItems.filter((item) => !ids.includes(item.id)); },
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

mock.module("@owlbear-rodeo/sdk", {
  exports: { default: sdk, buildLabel() {}, buildImage() {}, buildText() {}, buildPath() {}, buildShape() {}, Command: class {} },
});

const effects = await import("../src/effectsMutations.js");
const history = await import("../src/history.js");
const historyOwner = await import("../src/historyOwner.js");
const { currentSceneEpoch, markSceneEpochReady } = await import("../src/sceneEpoch.js");
const { resolveReminder } = await import("../src/reminderResolution.js");
const { planEffectSaveReminderNotices } = await import("../src/effectSaveReminderCore.js");
const { combatEventFromHistoryEntryV3 } = await import("../src/combatLogV3Core.js");
const { buildReminderResolutionPlan } = await import("../src/reminderResolutionCore.js");
const { buildCombatLogPresentation } = await import("../src/combatLogPresentationCore.js");

const meta = (id) => sceneItems.find((item) => item.id === id).metadata[META_KEY];
const pills = (id) => (meta(id).conditions?.instances || []).map((entry) => entry.condition).sort();
const pill = (id, condition, type) => ({ id, condition, active: true, targetId: "aria", type, expiry: { mode: "manual" } });

test.beforeEach(async () => {
  effects.unmountEffectsMutationCoordinatorService(); historyOwner.unmountHistoryOwner();
  sdk.room.id = `death-save-history-${++testSequence}`;
  role = "GM";
  sceneItems = [
    { id: "aria", name: "Aria", type: "IMAGE", layer: "CHARACTER", position: { x: 0, y: 0 }, metadata: { [META_KEY]: {
      attitude: "pc", hp: 0, hpMax: 30, inInitiative: true,
      conditions: { version: 2, instances: [pill("ko", "Privo di sensi", "hp-zero")] } } } },
    { id: "ghoul", name: "Ghoul", type: "IMAGE", layer: "CHARACTER", position: { x: 200, y: 0 }, metadata: { [META_KEY]: {
      attitude: "enemy", hp: 30, hpMax: 30, inInitiative: true } } },
  ];
  sceneMetadata = { ["com.thebigpicture.initiative/state"]: { round: 3, order: ["aria", "ghoul"], current: 0 },
    [HISTORY_KEY]: { version: 1, roomId: sdk.room.id, entries: [] } };
  roomMetadata = {};
  markSceneEpochReady("death-save-test");
  await historyOwner.mountHistoryOwner(); await effects.mountEffectsMutationCoordinatorService();
});
test.after(() => { effects.unmountEffectsMutationCoordinatorService(); historyOwner.unmountHistoryOwner(); });

async function roll(outcome) {
  // The Ghoul's turn passes to Aria's: the death save comes at the real start of her turn.
  const [notice] = planEffectSaveReminderNotices({
    items: sceneItems, initiativeState: sceneMetadata["com.thebigpicture.initiative/state"], includeCurrentTurnStart: true,
    previousInitiativeState: { round: 2, order: ["aria", "ghoul"], current: 1 },
  }).filter((entry) => entry.resolution?.mode === "death-save");
  assert.ok(notice, "the dying PC has its reminder");
  return resolveReminder({ notice, outcome, sceneEpoch: currentSceneEpoch() });
}
const lastEntry = async () => (await history.getHistoryEntries()).at(-1);

test("a failure from the popup is one History entry; Undo takes it back", async () => {
  const result = await roll("death-failure");
  assert.equal(result.status, "applied", result.message);
  assert.deepEqual(meta("aria").deathSaves, { successes: 0, failures: 1 });
  const entry = await lastEntry();
  assert.equal(entry.label, "TS contro la morte · Fallimento");
  await history.undoHistoryThrough(entry.id, { sceneEpoch: currentSceneEpoch() });
  assert.equal(meta("aria").deathSaves, undefined);
});

test("the third failure: Morto in place of Privo di sensi; Undo brings both back", async () => {
  meta("aria").deathSaves = { successes: 1, failures: 2 };
  assert.equal((await roll("death-failure")).status, "applied");
  assert.deepEqual(pills("aria"), ["Morto"]);
  assert.deepEqual(meta("aria").deathSaves, { successes: 1, failures: 3 });
  await history.undoHistoryThrough((await lastEntry()).id, { sceneEpoch: currentSceneEpoch() });
  assert.deepEqual(pills("aria"), ["Privo di sensi"]);
  assert.deepEqual(meta("aria").deathSaves, { successes: 1, failures: 2 });
});

test("a natural 20: 1 HP, awake, the tally gone", async () => {
  meta("aria").deathSaves = { successes: 0, failures: 2 };
  assert.equal((await roll("death-nat20")).status, "applied");
  assert.equal(meta("aria").hp, 1);
  assert.deepEqual(pills("aria"), []);
  assert.equal(meta("aria").deathSaves, undefined);
});

test("healing a stable PC ends Stabile and the tally in the healing's command", async () => {
  Object.assign(meta("aria"), { deathSaves: { successes: 1, failures: 1 },
    conditions: { version: 2, instances: [pill("ko", "Privo di sensi", "hp-zero"), pill("st", "Stabile", "death-save")] } });
  const mutation = await effects.runEffectsMutation([{ type: "hp:set", updates: [{ itemId: "aria", hp: 6, hpMax: 30,
    hpIntent: { mode: "heal", amount: 6, eventId: "heal" } }] }], { kind: "hp", label: "Cura", targetIds: ["aria"] });
  effects.requireAppliedEffectsMutation(mutation);
  assert.equal(meta("aria").hp, 6);
  assert.deepEqual(pills("aria"), []);
  assert.equal(meta("aria").deathSaves, undefined);
});

test("damage that leaves the HP maximum over at 0 HP is instant death: Morto, never Privo di sensi", async () => {
  Object.assign(meta("aria"), { hp: 10, conditions: { version: 2, instances: [] } });
  const mutation = await effects.runEffectsMutation([{ type: "hp:set", updates: [{ itemId: "aria", hp: 0, hpMax: 30,
    hpIntent: { mode: "damage", amount: 40, eventId: "hit" } }] }], { kind: "hp", label: "Danno", targetIds: ["aria"] });
  effects.requireAppliedEffectsMutation(mutation);
  assert.deepEqual(pills("aria"), ["Morto"]);
  assert.deepEqual(meta("aria").deathSaves, { successes: 0, failures: 3 });
});

test("damage that does not reach the HP maximum leaves the PC dying", async () => {
  Object.assign(meta("aria"), { hp: 10, conditions: { version: 2, instances: [] } });
  const mutation = await effects.runEffectsMutation([{ type: "hp:set", updates: [{ itemId: "aria", hp: 0, hpMax: 30,
    hpIntent: { mode: "damage", amount: 39, eventId: "hit" } }] }], { kind: "hp", label: "Danno", targetIds: ["aria"] });
  effects.requireAppliedEffectsMutation(mutation);
  assert.deepEqual(pills("aria"), ["Privo di sensi", "Prono"], "the usual automatic pills at 0 HP");
  assert.equal(meta("aria").deathSaves, undefined);
});

const hitAtZero = (amount, extra = {}) => effects.runEffectsMutation([{ type: "hp:set", updates: [{ itemId: "aria", hp: 0, hpMax: 30,
  hpIntent: { mode: "damage", amount, eventId: "hit", ...extra } }] }], { kind: "hp", label: "Danno", targetIds: ["aria"] });

test("a hit at 0 HP adds one failure, a critical two; Undo takes them back", async () => {
  effects.requireAppliedEffectsMutation(await hitAtZero(4));
  assert.deepEqual(meta("aria").deathSaves, { successes: 0, failures: 1 });
  assert.equal(meta("aria").hp, 0);
  effects.requireAppliedEffectsMutation(await hitAtZero(4, { critical: true }));
  assert.deepEqual(meta("aria").deathSaves, { successes: 0, failures: 3 });
  assert.deepEqual(pills("aria"), ["Morto"]);
  await history.undoHistoryThrough((await lastEntry()).id, { sceneEpoch: currentSceneEpoch() });
  assert.deepEqual(meta("aria").deathSaves, { successes: 0, failures: 1 });
  assert.deepEqual(pills("aria"), ["Privo di sensi"]);
});

// The damage of a reminder, a zone or an aura (Guardiani spirituali, an aura of the boss): a manual-damage reminder.
async function reminderDamage(amount) {
  const notice = { activationId: `burn:${amount}`, target: { id: "aria" }, targets: [{ id: "aria" }], resolution: { version: 1,
    mode: "manual-damage", damage: { dice: "2d8", type: "freddo" }, target: { id: "aria" }, source: { id: "ghoul" },
    activation: { kind: "effect-save", activationId: `burn:${amount}`, turnKey: "3:0:aria" } } };
  const plan = buildReminderResolutionPlan({ notice, items: sceneItems, outcome: "confirmed", damageRoll: amount, sceneMetadata });
  assert.equal(plan.status, "ready");
  return effects.runEffectsMutation(plan.operations, { kind: "reminder-resolution", label: "Bruciatura", targetIds: plan.targetIds,
    metadataPatches: plan.metadataPatches, sideEffects: plan.sideEffects, history: { kind: "reminder-resolution", label: "Bruciatura" } });
}

test("the damage of a reminder or a zone at 0 HP is a death save failure too", async () => {
  effects.requireAppliedEffectsMutation(await reminderDamage(7));
  assert.deepEqual(meta("aria").deathSaves, { successes: 0, failures: 1 });
  assert.equal(meta("aria").hp, 0);
});

test("a reminder's damage that drops a PC with its HP maximum left over is instant death", async () => {
  Object.assign(meta("aria"), { hp: 5, conditions: { version: 2, instances: [] } });
  effects.requireAppliedEffectsMutation(await reminderDamage(40));
  assert.deepEqual(pills("aria"), ["Morto"]);
});

test("a hit on a stable PC ends Stabile and starts the saves again", async () => {
  Object.assign(meta("aria"), {
    conditions: { version: 2, instances: [pill("ko", "Privo di sensi", "hp-zero"), pill("st", "Stabile", "death-save")] } });
  effects.requireAppliedEffectsMutation(await hitAtZero(2));
  assert.deepEqual(pills("aria"), ["Privo di sensi"]);
  assert.deepEqual(meta("aria").deathSaves, { successes: 0, failures: 1 });
});

test("the Combat Log names the death saves in plain words, never as a spell", async () => {
  meta("aria").deathSaves = { successes: 2, failures: 1 };
  await roll("death-success");
  Object.assign(meta("aria"), { conditions: { version: 2, instances: [pill("ko", "Privo di sensi", "hp-zero")] } });
  effects.requireAppliedEffectsMutation(await hitAtZero(3, { critical: true }));
  const events = (await history.getHistoryEntries()).map((entry) => combatEventFromHistoryEntryV3(entry, {}));
  const presentation = buildCombatLogPresentation({ id: "s", startedAt: 0 }, events);
  const rows = presentation.groups.flatMap((round) => round.turns.flatMap((turn) => turn.events));
  const [rollRow, hitRow] = rows;
  assert.equal(rollRow.title, "TS contro la morte · Successo · Stabile");
  assert.equal(rollRow.categoryLabel, "Tiro salvezza");
  assert.equal(rollRow.summary, "Aria: + Stabile · Aria: conteggio azzerato");
  assert.equal(rollRow.causality, null, "no spell causality");
  assert.match(hitRow.summary, /Aria: Successi ○○○ · Fallimenti ✕✕○/u);
  assert.ok(hitRow.details.some((section) => section.label === "TS contro la morte"));
  assert.ok(!rows.some((row) => /death-|Incantesimo/u.test(`${row.title} ${row.summary} ${row.categoryLabel}`)));
});
