// GM -> players: the tracker layout and position follow the GM (room option «Layout e posizione tracker», on by
// default), proportional to each screen, merged with the open state, redrawn only when they change.
import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { localTrackerView, sharedTrackerView } from "../src/trackerPlacementCore.js";

const ID = "com.thebigpicture.initiative";
const UI_KEY = `${ID}/ui`;
const LAYOUT_CHANNEL = `${ID}/tracker-layout-change`;
const clone = (value) => structuredClone(value);
const settle = async () => { for (let i = 0; i < 30; i += 1) await new Promise((resolve) => setImmediate(resolve)); };

const memory = new Map();
globalThis.window = globalThis;
globalThis.localStorage = {
  getItem: (key) => (memory.has(key) ? memory.get(key) : null),
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: (key) => memory.delete(key),
  clear: () => memory.clear(),
};

let env;
const sdk = {
  onReady: (callback) => { void callback(); },
  player: { getRole: async () => env.role },
  room: {
    getMetadata: async () => clone(env.room),
    onMetadataChange: (listener) => { env.roomListeners.push(listener); return () => {}; },
  },
  viewport: { getWidth: async () => env.viewportWidth, getHeight: async () => env.viewportHeight },
  popover: {
    open: async (options) => { env.opened.push(clone(options)); },
    close: async (id) => { env.closed.push(id); },
    getWidth: async () => undefined,
    getHeight: async () => undefined,
  },
  broadcast: {
    onMessage: (channel, listener) => { env.channels.set(channel, listener); return () => {}; },
    sendMessage: async () => {},
  },
};
mock.module("@owlbear-rodeo/sdk", { defaultExport: sdk });
const stub = (path, namedExports) => mock.module(new URL(path, import.meta.url).href, { namedExports });
const selectors = { selectTrackerOpenSyncEnabled() {}, selectTrackerPlacementSyncEnabled() {}, selectPlayerTrackerScale() {},
  selectGmTrackerScale() {} };
stub("../src/options/optionsSelectors.js", selectors);
stub("../src/options/optionsRuntime.js", {
  startRuntimeOptions: async () => {},
  runtimeOptionsService: {
    get: (selector) => {
      if (selector === selectors.selectPlayerTrackerScale || selector === selectors.selectGmTrackerScale) return 1;
      return selector === selectors.selectTrackerOpenSyncEnabled ? env.openSync : env.placementSync;
    },
    subscribe: () => () => {},
    updateLocal: async (update) => { env.local = update(env.local); },
  },
});
stub("../src/metadataKeyScoped.js", {
  METADATA_OWNERSHIP: { SHARED_UI: { key: UI_KEY } },
  writeRoomMetadataKey: async (_api, contract, value) => { env.room[contract.key] = clone(value); env.writes.push(clone(value)); },
});
stub("../src/popoverDragHost.js", { openTrackedPopover: (options) => sdk.popover.open(options) });
stub("../src/trackerCompactSizingCore.js", { compactTrackerViewportWidth: (width) => width });

let sequence = 0;
async function boot({ role, room = {}, viewportWidth = 2000, viewportHeight = 1000, openSync = true, placementSync = true } = {}) {
  memory.clear();
  delete globalThis.__TBP_SYNC_OPEN_MOUNTED;
  env = { role, room: clone(room), viewportWidth, viewportHeight, openSync, placementSync, opened: [], closed: [], writes: [],
    roomListeners: [], channels: new Map(), local: { tracker: { layout: "classic" } } };
  await import(new URL(`../src/sync-open.js?sync=${++sequence}`, import.meta.url).href);
  await settle();
}
const changeRoom = async (patch) => { Object.assign(env.room, clone(patch)); for (const listener of env.roomListeners) listener(clone(env.room)); await settle(); };
const trackerOpens = () => env.opened.filter((options) => options.id === `${ID}/tracker-popover`);

test("the shared view is proportional to the screen and survives a different one", () => {
  const view = sharedTrackerView({ layout: "classic", classic: { side: "right", inset: 96, top: 52 }, compact: { left: 1000, top: 982 },
    viewportWidth: 2000, viewportHeight: 1000 });
  assert.deepEqual(view, { layout: "classic", side: "right", inset: 0.048, top: 0.052, cx: 0.5, cy: 0.982 });
  assert.deepEqual(localTrackerView(view, { viewportWidth: 1000, viewportHeight: 500 }),
    { layout: "classic", classic: { side: "right", inset: 48, top: 26 }, compact: { left: 500, top: 491 } });
  assert.equal(localTrackerView({ layout: "wide", side: "right", inset: 0.1, top: 0.1 }), null);
  assert.equal(localTrackerView({ layout: "classic", side: "right", inset: "x", top: 0.1 }), null);
  assert.ok(JSON.stringify({ open: true, at: Date.now(), view }).length < 350, "fits the shared UI budget");
});

test("GM: a room without a view receives the GM's; a click on the handle publishes the new side, the open state stays", async () => {
  await boot({ role: "GM", room: { [UI_KEY]: { open: true, at: 1 } } });
  assert.deepEqual(env.room[UI_KEY], { open: true, at: 1, view: { layout: "classic", side: "left", inset: 0.011, top: 0.052 } });
  env.channels.get(LAYOUT_CHANNEL)({ data: { type: "tracker-side-toggle" } });
  await settle();
  assert.deepEqual(env.room[UI_KEY], { open: true, at: 1, view: { layout: "classic", side: "right", inset: 0.048, top: 0.052 } });
  const writes = env.writes.length;
  env.channels.get(LAYOUT_CHANNEL)({ data: { type: "tracker-position-change", deltaX: 0, deltaY: 0 } });
  await settle();
  assert.equal(env.writes.length, writes, "an unchanged view is not written again");
});

test("GM: with the option off nothing is published", async () => {
  await boot({ role: "GM", room: { [UI_KEY]: { open: true, at: 1 } }, placementSync: false });
  env.channels.get(LAYOUT_CHANNEL)({ data: { type: "tracker-side-toggle" } });
  await settle();
  assert.deepEqual(env.writes, []);
});

test("player: the GM's side on this screen; other room changes never redraw; a new layout updates the local options", async () => {
  await boot({ role: "PLAYER", viewportWidth: 1000, viewportHeight: 500,
    room: { [UI_KEY]: { open: true, at: 1, view: { layout: "classic", side: "right", inset: 0.048, top: 0.052 } } } });
  assert.deepEqual(JSON.parse(memory.get(`${ID}/tracker-classic-placement`)), { side: "right", inset: 48, top: 26 });
  assert.equal(trackerOpens().length, 1);
  assert.deepEqual([trackerOpens()[0].anchorPosition, trackerOpens()[0].transformOrigin.horizontal], [{ left: 952, top: 26 }, "RIGHT"]);
  await changeRoom({ [`${ID}/hpMemory`]: { any: 1 } });
  assert.equal(trackerOpens().length, 1, "an unrelated room change neither reopens nor redraws");
  await changeRoom({ [UI_KEY]: { open: true, at: 2, view: { layout: "compact", side: "right", inset: 0.048, top: 0.052, cx: 0.5, cy: 0.9 } } });
  assert.equal(memory.get(`${ID}/tracker-layout`), "compact");
  assert.equal(env.local.tracker.layout, "compact", "the tracker page follows its local options too");
  assert.equal(trackerOpens().length, 2, "redrawn once in the new layout");
  assert.deepEqual(trackerOpens()[1].anchorPosition, { left: 500, top: 450 });
});

test("player: a closed tracker takes the GM's view without opening; with the option off only the open state follows", async () => {
  await boot({ role: "PLAYER", room: { [UI_KEY]: { open: false, at: 1, view: { layout: "classic", side: "right", inset: 0.048, top: 0.052 } } } });
  assert.equal(trackerOpens().length, 0);
  assert.equal(JSON.parse(memory.get(`${ID}/tracker-classic-placement`)).side, "right");
  await boot({ role: "PLAYER", placementSync: false, room: { [UI_KEY]: { open: true, at: 1, view: { layout: "classic", side: "right", inset: 0.048, top: 0.052 } } } });
  assert.equal(memory.get(`${ID}/tracker-classic-placement`), undefined);
  assert.equal(trackerOpens().length, 1);
  assert.deepEqual(trackerOpens()[0].anchorPosition, { left: 22, top: 52 }, "the player's own (default) place");
});
