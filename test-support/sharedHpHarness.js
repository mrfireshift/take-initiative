import { mock } from "node:test";
import { createVersionedIndexedDB, versionedKeyRange } from "./fakeVersionedIndexedDb.js";

globalThis.indexedDB = createVersionedIndexedDB();
globalThis.IDBKeyRange = versionedKeyRange;
globalThis.location = { pathname: "/background.html" };
const clone = value => structuredClone(value);
export const META_KEY = "com.thebigpicture.initiative/meta";
export let items = [];
export let sceneMetadata = {};
let roomMetadata = {};
let sequence = 0;
let role = "GM";
let failWrite = false;
const channels = new Map();
export const sdk = {
  onReady() {}, player: { getRole: async () => role },
  room: { id: "shared-hp-test", getMetadata: async () => clone(roomMetadata),
    setMetadata: async patch => { roomMetadata = { ...roomMetadata, ...clone(patch) }; },
    onMetadataChange: () => () => {} },
  scene: { isReady: async () => true, onReadyChange: () => () => {},
    getMetadata: async () => clone(sceneMetadata),
    setMetadata: async patch => { sceneMetadata = { ...sceneMetadata, ...clone(patch) }; },
    items: {
      getItems: async ids => clone(items.filter(item => !ids || (typeof ids === "function" ? ids(item) : ids.includes(item.id)))),
      updateItems: async (ids, updater) => {
        if (failWrite) { failWrite = false; throw new Error("injected SDK failure"); }
        // A filter, ids or items, as the SDK takes them.
        const wanted = typeof ids === "function" ? null : ids.map(entry => (typeof entry === "object" ? entry?.id : entry));
        const drafts = clone(items.filter(item => wanted ? wanted.includes(item.id) : ids(item)));
        updater(drafts); const byId = new Map(drafts.map(item => [item.id, item]));
        items = items.map(item => byId.get(item.id) || item);
      },
      addItems: async added => { items.push(...clone(added)); },
      deleteItems: async ids => { items = items.filter(item => !ids.includes(item.id)); },
      onChange: () => () => {},
    },
  },
  broadcast: {
    onMessage(channel, callback) {
      if (!channels.has(channel)) channels.set(channel, new Set());
      channels.get(channel).add(callback); return () => channels.get(channel).delete(callback);
    },
    async sendMessage(channel, data) {
      for (const callback of [...(channels.get(channel) || [])]) await callback({ data: clone(data) });
    },
  },
};
mock.module("@owlbear-rodeo/sdk", { exports: { default: sdk,
  buildLabel() {}, buildImage() {}, buildText() {}, buildPath() {}, buildShape() {}, Command: class {} } });
export const effects = await import("../src/effectsMutations.js");
export const history = await import("../src/history.js");
const historyOwner = await import("../src/historyOwner.js");
const epoch = await import("../src/sceneEpoch.js");
export const token = (id, meta = {}) => ({ id, name: id, type: "IMAGE", layer: "CHARACTER",
  position: { x: 0, y: 0 }, metadata: { foreign: "keep", [META_KEY]: { hp: 300, hpMax: 400,
    attitude: "enemy", conditions: {}, ...meta } } });
export const group = (hp = 300) => [token("auril", { hp, inInitiative: true }),
  ...["body", "hand", "head"].map(id => token(id, { hp, sharedHpSourceId: "auril", sharedHpExcludeFromInitiative: true }))];
export const meta = id => items.find(item => item.id === id)?.metadata[META_KEY];
export const setRole = value => { role = value; };
export const failNextWrite = () => { failWrite = true; };
export const replaceItems = next => { items = clone(next); };
export const damage = (itemId, amount, eventId = "hit") => ({ type: "hp:set", updates: [
  { itemId, hp: 300 - amount, hpMax: 400, hpIntent: { mode: "damage", amount, eventId } },
] });
export const apply = (operations, options = {}) => effects.runEffectsMutation(operations,
  { transport: "background", ...options });
export async function reset(nextItems = group()) {
  effects.unmountEffectsMutationCoordinatorService(); historyOwner.unmountHistoryOwner();
  items = clone(nextItems); roomMetadata = {}; role = "GM"; failWrite = false;
  sdk.room.id = `shared-hp-${++sequence}`;
  sceneMetadata = { "com.thebigpicture.initiative/state": { order: ["auril"], current: 0, round: 1 },
    "com.thebigpicture.initiative/history": { version: 1, roomId: sdk.room.id, entries: [] } };
  epoch.markSceneEpochReady("shared-hp-test");
  await historyOwner.mountHistoryOwner(); await effects.mountEffectsMutationCoordinatorService();
}
export function cleanup() { effects.unmountEffectsMutationCoordinatorService(); historyOwner.unmountHistoryOwner(); }
