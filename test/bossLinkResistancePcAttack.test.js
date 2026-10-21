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
    id: "pc-attack-link-room",
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

const effects = await import("../src/effectsMutations.js");
const history = await import("../src/history.js");
const historyOwner = await import("../src/historyOwner.js");
const { currentSceneEpoch, markSceneEpochReady } = await import("../src/sceneEpoch.js");
const { createPcAttackRuntime } = await import("../src/pcAttackExecution.js");
const { combatEventFromHistoryEntryV3 } = await import("../src/combatLogV3Core.js");

const { damageDefensesForItem } = await import("../src/damageDefensesCore.js");
const { BOSS_LINK_DAMAGE_TYPE_IDS } = await import("../src/bossLinkResistanceCore.js");

// Rimebound Link in the PC attack console (GM only): a Titan token linked to Auril resists in memory while the link is
// active, the preview and the commit halve the same way, and the coordinator says the damage was already halved.
const sword = { id: "holy-sword", label: "Spada sacra", kind: "attack", range: "melee",
  components: [{ type: "slashing", formula: "1d8+3" }, { type: "radiant", formula: "2d8" }] };
const record = { enabled: true, name: "Rimebound Link", holder: "Titano", breaker: "Proiezione Fatata" };
const meta = (id) => sceneItems.find((item) => item.id === id).metadata[META_KEY];
const notices = [];
sdk.viewport = { getWidth: async () => 1200, getHeight: async () => 800 };
sdk.popover = { close: async () => {}, open: async ({ url }) => { notices.push(JSON.parse(new URLSearchParams(url.split("?")[1]).get("payload"))); } };
let runtime;

test.beforeEach(async () => {
  effects.unmountEffectsMutationCoordinatorService(); historyOwner.unmountHistoryOwner();
  sdk.room.id = `pc-attack-link-${++testSequence}`;
  role = "GM";
  notices.length = 0;
  const creature = (id, extra) => ({ id, name: id, type: "IMAGE", layer: "CHARACTER", position: { x: 0, y: 0 }, metadata: { [META_KEY]: extra } });
  sceneItems = [
    creature("aria", { hp: 40, hpMax: 40, inInitiative: true, attitude: "pc", initiativeCard: { quickActions: [sword] } }),
    creature("auril", { hp: 300, hpMax: 400, inInitiative: true, bossLinkResistance: record }),
    { ...creature("hand", { hp: 300, hpMax: 400, sharedHpSourceId: "auril", sharedHpExcludeFromInitiative: true }), name: "Mano del Titano" },
  ];
  sceneMetadata = { ["com.thebigpicture.initiative/state"]: { round: 2, order: ["aria", "auril"], current: 0 },
    [HISTORY_KEY]: { version: 1, roomId: sdk.room.id, entries: [] } };
  roomMetadata = {};
  markSceneEpochReady("pc-attack-link-test");
  await historyOwner.mountHistoryOwner(); await effects.mountEffectsMutationCoordinatorService();
  runtime = createPcAttackRuntime({ api: sdk, emitVisual: async () => ({ sent: false }), postDamage: async () => [] });
});
test.after(() => { effects.unmountEffectsMutationCoordinatorService(); historyOwner.unmountHistoryOwner(); });
const settle = () => new Promise((resolve) => setTimeout(resolve, 10));

async function attack(targetId) {
  const presentation = await runtime.getPcAttackPresentation("aria", "holy-sword");
  const target = presentation.targets.find((item) => item.id === targetId);
  return { presentation, result: await runtime.executePcAttack({ sourceId: "aria", actionId: "holy-sword", targetId, sceneIdentity: presentation.sceneIdentity,
    expectedAction: presentation.action, expectedDefenses: damageDefensesForItem(target, META_KEY), outcome: "hit", componentAmounts: { c1: 8, c2: 9 } }) };
}

test("the Titan resists while the link is active: 8 + 9 becomes 4 + 4 on the shared pool, already halved for the GM", async () => {
  const { presentation, result } = await attack("hand");
  const hand = presentation.targets.find((item) => item.id === "hand");
  assert.deepEqual(damageDefensesForItem(hand, META_KEY).resistances, [...BOSS_LINK_DAMAGE_TYPE_IDS].sort(), "the console sees the resistance");
  assert.equal(damageDefensesForItem(presentation.targets.find((item) => item.id === "auril"), META_KEY).resistances.length, 0, "the Projection does not resist");
  assert.equal(result.hpChange.after, 292);
  assert.deepEqual([meta("auril").hp, meta("hand").hp], [292, 292]);
  assert.equal(meta("hand").conditions, undefined, "no pill or effect is ever written on the Titan");
  assert.deepEqual(meta("auril").bossLinkResistance, record);
  await settle();
  assert.deepEqual(notices.map((card) => [card.tone, card.lines[0].strong + card.lines[0].text]),
    [["active", "Mano del Titano: Resistenza a tutti i danni, danno già dimezzato."]]);
});

test("a hit on Auril is full damage and breaks the link; the next hit on the Titan is full damage too", async () => {
  await attack("auril");
  assert.equal(meta("auril").hp, 283);
  assert.equal(meta("auril").bossLinkResistance.brokenRound, 2);
  await settle();
  assert.equal(notices.at(-1).title, "Link interrotto");
  const { result } = await attack("hand");
  assert.equal(result.hpChange.after, 266, "no resistance for the rest of the round");
});
