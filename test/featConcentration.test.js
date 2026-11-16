// Lot F4 of docs/STUDIO_TALENTI.md: on the concentration save after damage, War Caster's advantage and the disadvantage of
// the attacker's Mage Slayer, with the sheet's Constitution save, in the warning's notice (saveHint); the two consoles
// say who dealt the damage.
import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { createVersionedIndexedDB, versionedKeyRange } from "../test-support/fakeVersionedIndexedDb.js";

globalThis.indexedDB = createVersionedIndexedDB();
globalThis.IDBKeyRange = versionedKeyRange;
globalThis.location = { pathname: "/background.html" };

const META_KEY = "com.thebigpicture.initiative/meta";
const HISTORY_KEY = "com.thebigpicture.initiative/history";
const CONCENTRATION_KEY = "com.thebigpicture.initiative/concentration";
const clone = (value) => structuredClone(value);

let sceneItems = [];
let sceneMetadata = {};
let roomMetadata = {};
let testSequence = 0;
const broadcastListeners = new Map();

const sdk = {
  onReady() {},
  player: { getRole: async () => "GM" },
  room: {
    id: "feat-concentration-room",
    getMetadata: async () => clone(roomMetadata),
    setMetadata: async (update) => { roomMetadata = { ...roomMetadata, ...clone(update) }; },
    onMetadataChange: () => () => {},
  },
  scene: {
    isReady: async () => true,
    onReadyChange: () => () => {},
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

const { buildConcentrationSaveWarning, concentrationSaveWarningsForItems } = await import("../src/concentrationSaveReminderCore.js");
const { broadcastConcentrationSaveWarnings } = await import("../src/concentrationSaveReminder.js");
const effects = await import("../src/effectsMutations.js");
const historyOwner = await import("../src/historyOwner.js");
const { markSceneEpochReady } = await import("../src/sceneEpoch.js");
const { createPcAttackRuntime } = await import("../src/pcAttackExecution.js");
const { createBossActionRuntime } = await import("../src/bossActionExecution.js");
const { importBossActionHTML } = await import("../src/bossActionProfileCore.js");
const { createBossActionProfileStore } = await import("../src/bossActionProfileStore.js");
const { damageDefensesForItem } = await import("../src/damageDefensesCore.js");
const { readFile } = await import("node:fs/promises");

const concentrating = (id, card = {}, extra = {}) => ({ id, name: id, type: "IMAGE", layer: "CHARACTER", position: { x: 0, y: 0 },
  metadata: { [META_KEY]: { hp: 20, hpMax: 30, attitude: "pc", initiativeCard: card,
    [CONCENTRATION_KEY]: { bless: { instanceId: "bless-1", name: "Benedizione" } }, ...extra } } });
const hints = (items, changes) => concentrationSaveWarningsForItems({ items, changes, eventId: "e" })
  .map((warning) => warning.notice.saveHint ?? null);
const warCaster = concentrating("aela", { feats: [{ id: "incantatore-da-guerra" }], savingThrows: { con: 5 } });
const slayer = concentrating("bran", { feats: [{ id: "sterminatore-di-maghi" }] });
const plain = concentrating("lyra");

test("War Caster gives advantage, the attacker's Mage Slayer disadvantage, both cancel; the sheet's Constitution save is the total", () => {
  assert.deepEqual(hints([warCaster], [{ itemId: "aela", damage: 12 }]),
    [{ bonus: 5, roll: "vantaggio", reason: "Vantaggio: Incantatore da Guerra" }]);
  assert.deepEqual(hints([plain, slayer], [{ itemId: "lyra", damage: 12, sourceId: "bran" }]),
    [{ bonus: null, roll: "svantaggio", reason: "Svantaggio: Sterminatore di Maghi di chi ha colpito" }]);
  assert.deepEqual(hints([warCaster, slayer], [{ itemId: "aela", damage: 12, sourceId: "bran" }]), [{ bonus: 5,
    roll: "vantaggio e svantaggio annullati", reason: "Incantatore da Guerra e Sterminatore di Maghi di chi ha colpito: si annullano" }]);
  // Without the attacker (the tracker, the quick HP), no disadvantage; nor from the creature itself.
  assert.deepEqual(hints([plain, slayer], [{ itemId: "lyra", damage: 12 }]), [null]);
  assert.deepEqual(hints([slayer], [{ itemId: "bran", damage: 12, sourceId: "bran" }]), [null]);
  // A monster of a stat block saves with its modifier; a character without the save on the sheet shows nothing (its
  // proficiency is the sheet's to say).
  assert.deepEqual(hints([concentrating("mago", { abilityModifiers: { con: -1 }, monster: { name: "Mage" } }, { attitude: "enemy" })],
    [{ itemId: "mago", damage: 9 }]), [{ bonus: -1, roll: "", reason: "" }]);
  assert.deepEqual(hints([concentrating("pg", { abilityModifiers: { con: 2 } })], [{ itemId: "pg", damage: 9 }]), [null]);
});

test("a warning with nothing to add keeps its notice as it was, an aura's save without damage too", () => {
  const [warning] = concentrationSaveWarningsForItems({ items: [plain], changes: [{ itemId: "lyra", damage: 12 }], eventId: "e" });
  assert.deepEqual(Object.keys(warning.notice), ["activationId", "spellName", "targets", "resolution"]);
  assert.deepEqual(warning.notice.resolution.save, { ability: "con", dc: 10 });
  const aura = buildConcentrationSaveWarning({ casterId: "aela", casterName: "Aela", concentration: { bless: { name: "Benedizione" } },
    cause: "Primal Blizzard" });
  assert.equal("saveHint" in aura.notice, false);
});

test("the broadcast reads the attacker with the damaged creature, and sends the hint in the notice", async () => {
  const run = async (changes) => {
    const asked = [];
    const sent = [];
    await broadcastConcentrationSaveWarnings(changes, { sceneEpoch: 1, warningRuntimeScope: "scene-a",
      getItems: async (ids) => { asked.push([...ids]); return clone([plain, slayer].filter((item) => ids.includes(item.id))); },
      sendMessage: async (channel, payload) => { sent.push(payload); } });
    return { asked, warnings: sent.flatMap((payload) => payload.warnings) };
  };
  const withAttacker = await run([{ itemId: "lyra", damage: 12, sourceId: "bran" }]);
  assert.deepEqual(withAttacker.asked, [["lyra"], ["bran"]]);
  assert.deepEqual(withAttacker.warnings.map((warning) => [warning.name, warning.notice.saveHint.roll]), [["lyra", "svantaggio"]]);
  const without = await run([{ itemId: "lyra", damage: 12 }]);
  assert.deepEqual(without.asked, [["lyra"]], "no attacker, no second read");
  assert.equal(without.warnings[0].notice.saveHint, undefined);
});

// The two consoles: the damage's projection hears who dealt it.
const sword = { id: "sword", label: "Spada lunga", kind: "attack", range: "melee", components: [{ type: "slashing", formula: "1d8+3" }] };
async function mountScene(items, order) {
  effects.unmountEffectsMutationCoordinatorService(); historyOwner.unmountHistoryOwner();
  sdk.room.id = `feat-concentration-${++testSequence}`;
  sceneItems = clone(items);
  sceneMetadata = { ["com.thebigpicture.initiative/state"]: { round: 1, order, current: 0 },
    [HISTORY_KEY]: { version: 1, roomId: sdk.room.id, entries: [] } };
  roomMetadata = {};
  markSceneEpochReady(`feat-concentration-${testSequence}`);
  await historyOwner.mountHistoryOwner(); await effects.mountEffectsMutationCoordinatorService();
}
test.after(() => { effects.unmountEffectsMutationCoordinatorService(); historyOwner.unmountHistoryOwner(); });

test("the attack console tells the damage's projection who dealt it", async () => {
  const attacker = { id: "aria", name: "Aria", type: "IMAGE", layer: "CHARACTER", position: { x: 0, y: 0 },
    metadata: { [META_KEY]: { hp: 40, hpMax: 40, inInitiative: true, attitude: "pc",
      initiativeCard: { quickActions: [sword], feats: [{ id: "sterminatore-di-maghi" }] } } } };
  const mage = concentrating("mage", {}, { inInitiative: true, attitude: "enemy" });
  await mountScene([attacker, mage], ["aria", "mage"]);
  const calls = [];
  const runtime = createPcAttackRuntime({ api: sdk, emitVisual: async () => ({ sent: false }),
    postDamage: async ({ item, sourceId }) => { calls.push([item.id, sourceId]); return []; } });
  const presentation = await runtime.getPcAttackPresentation("aria", "sword");
  const target = presentation.targets.find((item) => item.id === "mage");
  await runtime.executePcAttack({ sourceId: "aria", actionId: "sword", targetId: "mage", sceneIdentity: presentation.sceneIdentity,
    expectedAction: presentation.action, expectedDefenses: damageDefensesForItem(target, META_KEY), outcome: "hit", componentAmounts: { c1: 8 } });
  assert.deepEqual(calls, [["mage", "aria"]]);
});

test("the Boss console tells it too", async () => {
  const profile = await importBossActionHTML(await readFile(new URL("./fixtures/boss-actions/auril-phase-2.html", import.meta.url), "utf8"));
  const memory = new Map();
  const store = createBossActionProfileStore({ storage: { getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) } });
  store.put(profile);
  await mountScene([
    { id: "auril", name: "Auril", type: "IMAGE", layer: "CHARACTER", position: { x: 0, y: 0 },
      metadata: { [META_KEY]: { hp: 580, hpMax: 580, inInitiative: true, epic: true } } },
    { id: "dars", name: "Dars", type: "IMAGE", layer: "CHARACTER", position: { x: 40, y: 20 },
      metadata: { [META_KEY]: { hp: 60, hpMax: 60, inInitiative: true } } },
  ], ["auril", "dars"]);
  const calls = [];
  const runtime = createBossActionRuntime({ api: sdk, store, postDamage: async ({ item, sourceId }) => { calls.push([item.id, sourceId]); return []; } });
  await runtime.bindBossActionProfile("auril", profile);
  const presentation = await runtime.getBossActionPresentation("auril");
  const actionId = (profile.abilities.find((entry) => entry.execution?.kind === "attack-damage" && entry.automation === "SUPPORTED")
    || profile.abilities.find((entry) => entry.execution?.kind === "attack-damage")).id;
  await runtime.executeBossAction({ sourceId: "auril", actionId, targetId: "dars", profileId: profile.profileId,
    profileRevision: profile.profileRevision, bossInstanceId: presentation.bossInstanceId, sceneIdentity: presentation.sceneIdentity,
    actionInstanceId: "feat-concentration-boss", mode: "melee", outcome: "hit", componentAmounts: { slashing: 18, cold: 7 } });
  assert.deepEqual(calls, [["dars", "auril"]]);
});
