// The controller of the prepared spells' popup, with the scene mocked: it opens on the caster's turn, beside the token, it does
// not come back on the same turn once closed, it closes when the turn passes and opens again when it returns.
import assert from "node:assert/strict";
import test, { mock } from "node:test";

const STATE_KEY = "com.thebigpicture.initiative/state";
const settle = async () => { for (let turn = 0; turn < 8; turn += 1) await new Promise((resolve) => setTimeout(resolve, 0)); };

let groups = [];
let metadata = {};
const openedPopovers = [];
const closedPopovers = [];
let itemsChanged = () => {};
let metadataChanged = () => {};
let broadcast = () => {};
let role = "GM";
const intervals = [];
const realSetInterval = globalThis.setInterval;
globalThis.setInterval = (...args) => { intervals.push(args); return realSetInterval(...args); };
globalThis.window = globalThis;

mock.module("@owlbear-rodeo/sdk", {
  defaultExport: {
    player: { getRole: async () => role },
    scene: {
      isReady: async () => true,
      getMetadata: async () => metadata,
      onReadyChange: () => () => {},
      onMetadataChange: (callback) => { metadataChanged = callback; return () => {}; },
      items: {
        getItems: async () => [],
        getItemBounds: async ([id]) => ({ center: { x: id === "dars" ? 100 : 500, y: 200 }, min: { x: 60, y: 160 } }),
      },
    },
    viewport: { transformPoint: async (point) => ({ x: point.x + 1, y: point.y + 2 }) },
    popover: { close: async (id) => { closedPopovers.push(id); } },
    broadcast: { onMessage: (_channel, callback) => { broadcast = callback; return () => {}; } },
  },
});
mock.module("../src/preparedSpellResolutionCore.js", {
  namedExports: { PREPARED_SPELL_RESOLUTION_CHANNEL: "channel", preparedSpellResolutionGroups: () => groups },
});
mock.module("../src/spellUnifiedActiveAdapter.js", {
  namedExports: {
    SPELL_UNIFIED_PREPARED_AREA_SPELL_IDS: ["phb2014-raffica-di-spine"],
    buildSpellUnifiedPreparedPopoverRequest: (group, { width }) => ({
      id: `popup/${group.instanceId}`, url: `/spell-active-resolution.html?instance=${group.instanceId}`, width, height: 300,
    }),
  },
});
mock.module("../src/popoverDragHost.js", {
  namedExports: { openTrackedPopover: async (options) => { openedPopovers.push(options); } },
});
mock.module("../src/sceneItemEvents.js", {
  namedExports: { subscribeSceneItemChanges: (callback) => { itemsChanged = callback; return () => {}; } },
});

const { mountPreparedSpellResolutionController, unmountPreparedSpellResolutionController } = await import("../src/preparedSpellResolutionController.js");

const onTurn = (actorId) => ({ [STATE_KEY]: { order: ["sera", "dars", "mira"], current: ["sera", "dars", "mira"].indexOf(actorId) } });
const setTurn = async (actorId) => {
  metadata = onTurn(actorId);
  metadataChanged(metadata);
  await settle();
};
const smite = { instanceId: "smite", casterId: "dars", spellId: "thunderous-smite" };

test("a player never mounts it", async () => {
  role = "PLAYER";
  assert.equal(await mountPreparedSpellResolutionController(), false);
  role = "GM";
});

test("it opens on the caster's turn only, beside the token, in the common popup", async () => {
  groups = [smite];
  metadata = onTurn("sera");
  assert.equal(await mountPreparedSpellResolutionController(), true);
  await settle();
  assert.deepEqual(openedPopovers, [], "another's turn: nothing");
  await setTurn("dars");
  assert.equal(openedPopovers.length, 1);
  const options = openedPopovers[0];
  assert.equal(options.id, "popup/smite");
  assert.match(options.url, /^\/spell-active-resolution\.html/);
  assert.equal(options.width, 360);
  assert.equal(options.height, 300);
  assert.deepEqual(options.anchorPosition, { left: 101, top: 152 }, "the top of the token, 10 px above");
  assert.equal(options.hidePaper, true);
});

test("no timer: an open popup is the GM's to move, and nothing moves it", async () => {
  assert.deepEqual(intervals, []);
  const before = openedPopovers.length;
  itemsChanged();
  broadcast({ data: { type: "request-sync" } });
  await settle();
  assert.equal(openedPopovers.length, before, "a scene change does not open it again");
  assert.deepEqual(closedPopovers, []);
});

test("the turn passes: it closes. It comes back when the turn returns", async () => {
  await setTurn("mira");
  assert.deepEqual(closedPopovers, ["popup/smite"]);
  const before = openedPopovers.length;
  await setTurn("dars");
  assert.equal(openedPopovers.length, before + 1);
  assert.equal(openedPopovers.at(-1).id, "popup/smite");
});

test("closed with the ×, it stays closed for this turn: it is still counted as open", async () => {
  const before = openedPopovers.length;
  itemsChanged();
  await settle();
  assert.equal(openedPopovers.length, before);
});

test("a second prepared spell of the same caster stands above the first", async () => {
  groups = [smite, { instanceId: "second", casterId: "dars", spellId: "wrathful-smite" }];
  itemsChanged();
  await settle();
  const second = openedPopovers.at(-1);
  assert.equal(second.id, "popup/second");
  assert.equal(second.anchorPosition.top, 152 - (300 + 8));
});

test("a spell that resolves in the panel never opens here, and a resolved one closes", async () => {
  const before = openedPopovers.length;
  closedPopovers.length = 0;
  groups = [smite, { instanceId: "thorns", casterId: "dars", spellId: "phb2014-raffica-di-spine" }];
  itemsChanged();
  await settle();
  assert.equal(openedPopovers.length, before, "Raffica di Spine belongs to the panel");
  assert.deepEqual(closedPopovers, ["popup/second"]);
});

test("unmounted, it closes what is open and nothing runs any more", async () => {
  closedPopovers.length = 0;
  await unmountPreparedSpellResolutionController();
  assert.deepEqual(closedPopovers, ["popup/smite"]);
  const before = openedPopovers.length;
  itemsChanged();
  await settle();
  assert.equal(openedPopovers.length, before);
});
