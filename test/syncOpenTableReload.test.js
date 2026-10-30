// Lot L9 of the bugfix pass (OP-01): the table screen (PLAYER) reloads while its localStorage still says the tracker
// is open. OBR has no popover after the reload: sync-open used to trust the flag and never opened it again.
import assert from "node:assert/strict";
import test, { mock } from "node:test";

const REPO = new URL("../", import.meta.url).href;
const ID = "com.thebigpicture.initiative";
const UI_KEY = `${ID}/ui`;
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
  viewport: { getWidth: async () => 1000, getHeight: async () => 500 },
  popover: {
    open: async (options) => { env.opened.push(clone(options)); },
    close: async (id) => { env.closed.push(id); },
    getWidth: async () => undefined,
    getHeight: async () => undefined,
  },
  broadcast: { onMessage: () => () => {}, sendMessage: async () => {} },
};
mock.module(`${REPO}node_modules/@owlbear-rodeo/sdk/lib/index.js`, { exports: { default: sdk } });
const stub = (path, namedExports) => mock.module(`${REPO}${path}`, { exports: namedExports });
const selectors = { selectTrackerOpenSyncEnabled() {}, selectTrackerPlacementSyncEnabled() {}, selectPlayerTrackerScale() {}, selectGmTrackerScale() {} };
stub("src/options/optionsSelectors.js", selectors);
stub("src/options/optionsRuntime.js", {
  startRuntimeOptions: async () => {},
  runtimeOptionsService: {
    get: (selector) => (selector === selectors.selectPlayerTrackerScale || selector === selectors.selectGmTrackerScale ? 1 : true),
    subscribe: () => () => {},
    updateLocal: async () => {},
  },
});
stub("src/metadataKeyScoped.js", { METADATA_OWNERSHIP: { SHARED_UI: { key: UI_KEY } }, writeRoomMetadataKey: async () => {} });
stub("src/popoverDragHost.js", { openTrackedPopover: (options) => sdk.popover.open(options) });
stub("src/trackerCompactSizingCore.js", { compactTrackerViewportWidth: (width) => width });

test("L9: dopo una ricarica della finestra del tavolo il tracker si riapre", async () => {
  memory.clear();
  const view = { layout: "classic", side: "left", inset: 0.022, top: 0.104 };
  env = { role: "PLAYER", room: { [UI_KEY]: { open: true, at: 1, view } }, opened: [], closed: [], roomListeners: [] };
  delete globalThis.__TBP_SYNC_OPEN_MOUNTED;
  await import(`${REPO}src/sync-open.js?first-load`);
  await settle();
  assert.equal(env.opened.filter((options) => options.id === `${ID}/tracker-popover`).length, 1);
  // The reload: OBR has no popover, the browser keeps its storage (the same incognito session).
  env = { role: "PLAYER", room: { [UI_KEY]: { open: true, at: 1, view } }, opened: [], closed: [], roomListeners: [] };
  delete globalThis.__TBP_SYNC_OPEN_MOUNTED;
  await import(`${REPO}src/sync-open.js?reload`);
  await settle();
  assert.equal(env.opened.filter((options) => options.id === `${ID}/tracker-popover`).length, 1, "the tracker opens again");
});

// The GM opens a room whose browser still says the tracker is open (Owlbear closed with it on screen): the icon's
// first click closed a tracker that was not there and only the second opened it.
test("all'avvio del GM il tracker risulta chiuso, così il primo clic sull'icona lo apre", async () => {
  memory.clear();
  localStorage.setItem(`${ID}/tracker-popover-open`, "1");
  env = { role: "GM", room: {}, opened: [], closed: [], roomListeners: [] };
  delete globalThis.__TBP_SYNC_OPEN_MOUNTED;
  await import(`${REPO}src/sync-open.js?gm-boot`);
  await settle();
  assert.equal(localStorage.getItem(`${ID}/tracker-popover-open`), "0");
  assert.equal(env.opened.length, 0, "the GM's tracker does not open by itself");
});
