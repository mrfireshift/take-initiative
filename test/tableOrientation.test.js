import test, { mock } from "node:test";
import assert from "node:assert/strict";

import {
  TABLE_ORIENTATION_NAMESPACE,
  TABLE_SIDE_FIELD,
  activeInitiativeId,
  isTableOrientationHello,
  pluginMetaWithTableSide,
  tableOrientationFor,
  tableOrientationMessage,
  tableSideDegrees,
} from "../src/tableOrientationCore.js";
import { createTableOrientationBridge } from "../src/tableOrientationBridge.js";

// tableSideWriter.js imports the SDK; the tests pass their own fake to it.
mock.module("@owlbear-rodeo/sdk", { exports: { default: {} } });

const META_KEY = "com.thebigpicture.initiative/meta";
const STATE_KEY = "com.thebigpicture.initiative/state";
const token = (id, tableSide) => ({ id, metadata: { [META_KEY]: { hp: 10, hpMax: 10, ...(tableSide ? { [TABLE_SIDE_FIELD]: tableSide } : {}) } } });

test("each side turns the page's bottom edge toward the player", () => {
  assert.equal(tableSideDegrees("south"), 0);
  assert.equal(tableSideDegrees("west"), 90);
  assert.equal(tableSideDegrees("north"), 180);
  assert.equal(tableSideDegrees("EAST"), 270);
  assert.equal(tableSideDegrees("up"), null);
});

test("the orientation follows the active creature and falls back to null without a side", () => {
  const state = { order: ["a", "__LAIR__", "b"], current: 0, round: 1 };
  assert.deepEqual(tableOrientationFor({ state, activeItem: token("a", "north") }), { activeId: "a", side: "north", degrees: 180 });
  assert.deepEqual(tableOrientationFor({ state: { ...state, current: 2 }, activeItem: token("b") }), { activeId: "b", side: null, degrees: null });
  // A virtual entry is not a scene item: no side.
  assert.deepEqual(tableOrientationFor({ state: { ...state, current: 1 }, activeItem: null }), { activeId: "__LAIR__", side: null, degrees: null });
  // A stale item for another ID is ignored.
  assert.equal(tableOrientationFor({ state, activeItem: token("b", "east") }).side, null);
  assert.equal(activeInitiativeId({ order: [] }), null);
  assert.deepEqual(tableOrientationFor({}), { activeId: null, side: null, degrees: null });
});

test("setting the side keeps every other plugin field and clearing it removes only the side", () => {
  const metadata = { other: { keep: true }, [META_KEY]: { hp: 7, hpMax: 12, conditions: ["Prono"] } };
  const withSide = pluginMetaWithTableSide(metadata, "west");
  assert.deepEqual(withSide, { hp: 7, hpMax: 12, conditions: ["Prono"], tableSide: "west" });
  assert.deepEqual(pluginMetaWithTableSide({ [META_KEY]: withSide }, null), { hp: 7, hpMax: 12, conditions: ["Prono"] });
  assert.deepEqual(metadata[META_KEY], { hp: 7, hpMax: 12, conditions: ["Prono"] }, "the input is not mutated");
});

test("the protocol messages carry the namespace, the nonce and the degrees", () => {
  assert.equal(isTableOrientationHello({ ns: TABLE_ORIENTATION_NAMESPACE, type: "hello" }), true);
  assert.equal(isTableOrientationHello({ ns: "other", type: "hello" }), false);
  assert.deepEqual(tableOrientationMessage({ side: "north", degrees: 180 }, { nonce: "n1" }), {
    ns: TABLE_ORIENTATION_NAMESPACE, v: 1, type: "orientation", nonce: "n1", side: "north", degrees: 180,
  });
  assert.equal(tableOrientationMessage({ side: null, degrees: null }).degrees, null);
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function fakeEnvironment({ state, items, role = "PLAYER" }) {
  const listeners = { metadata: [], ready: [], items: [], message: [] };
  const calls = { getMetadata: 0, getItems: 0 };
  let metadata = { [STATE_KEY]: state };
  const obr = {
    player: { getRole: async () => role },
    scene: {
      isReady: async () => true,
      getMetadata: async () => { calls.getMetadata += 1; return metadata; },
      onMetadataChange: (handler) => { listeners.metadata.push(handler); return () => {}; },
      onReadyChange: (handler) => { listeners.ready.push(handler); return () => {}; },
      items: {
        getItems: async (ids) => { calls.getItems += 1; return items.filter((item) => ids.includes(item.id)); },
      },
    },
  };
  const top = { posted: [], postMessage(message, origin) { this.posted.push({ message, origin }); } };
  const windowRef = {
    parent: top,
    top,
    addEventListener: (type, handler) => { if (type === "message") listeners.message.push(handler); },
    removeEventListener: (type, handler) => {
      listeners.message = listeners.message.filter((entry) => entry !== handler);
    },
  };
  const subscribeItems = (handler) => { listeners.items.push(handler); return () => {}; };
  return {
    obr, windowRef, subscribeItems, top, calls, listeners,
    setState(next) { metadata = { [STATE_KEY]: next }; for (const handler of listeners.metadata) handler(metadata); },
    hello(source = top, nonce = "n1") {
      for (const handler of listeners.message) handler({ data: { ns: TABLE_ORIENTATION_NAMESPACE, type: "hello", nonce }, source, origin: "https://www.owlbear.rodeo" });
    },
  };
}

test("the bridge stays silent and reads nothing until the userscript says hello", async () => {
  const env = fakeEnvironment({ state: { order: ["a"], current: 0 }, items: [token("a", "north")] });
  const bridge = createTableOrientationBridge(env);
  bridge.mount();
  await bridge.refresh();
  assert.equal(env.top.posted.length, 0);
  assert.equal(env.listeners.metadata.length, 0, "no OBR listener before the hello");
  // A hello from anything but the hosting page is ignored.
  env.hello({ postMessage() {} });
  await settle();
  assert.equal(bridge.active, false);
  bridge.unmount();
});

test("the GM's window never answers, even with the userscript installed in the same browser", async () => {
  const env = fakeEnvironment({ state: { order: ["a"], current: 0 }, items: [token("a", "north")], role: "GM" });
  const bridge = createTableOrientationBridge(env);
  bridge.mount();
  env.hello();
  await settle();
  await bridge.refresh();
  assert.equal(bridge.active, false);
  assert.equal(env.top.posted.length, 0);
  assert.equal(env.listeners.metadata.length, 0);
  bridge.unmount();
});

test("after the hello the bridge answers with the nonce, then follows turn and side changes", async () => {
  const items = [token("a", "north"), token("b"), token("c", "east")];
  const env = fakeEnvironment({ state: { order: ["a", "b", "c"], current: 0, round: 1 }, items });
  const bridge = createTableOrientationBridge(env);
  bridge.mount();
  env.hello();
  await settle();
  await bridge.refresh();
  assert.deepEqual(env.top.posted.map(({ message }) => [message.nonce, message.degrees]), [["n1", 180]]);
  assert.equal(env.top.posted[0].origin, "https://www.owlbear.rodeo");

  env.setState({ order: ["a", "b", "c"], current: 1, round: 1 });
  await bridge.refresh();
  env.setState({ order: ["a", "b", "c"], current: 2, round: 1 });
  await bridge.refresh();
  assert.deepEqual(env.top.posted.slice(1).map(({ message }) => [message.nonce, message.side, message.degrees]),
    [[null, null, null], [null, "east", 270]]);

  // Unrelated metadata (same active creature) does not re-post.
  const before = env.top.posted.length;
  env.setState({ order: ["a", "b", "c"], current: 2, round: 1, collapsed: { x: true } });
  await bridge.refresh();
  assert.equal(env.top.posted.length, before);

  // The GM changes the active creature's side.
  items[2].metadata[META_KEY].tableSide = "west";
  for (const handler of env.listeners.items) handler({ items: [items[2]] });
  await bridge.refresh();
  assert.equal(env.top.posted.at(-1).message.degrees, 90);

  // A second hello (userscript reload) always gets an answer.
  env.hello(env.top, "n2");
  await settle();
  await bridge.refresh();
  assert.deepEqual([env.top.posted.at(-1).message.nonce, env.top.posted.at(-1).message.degrees], ["n2", 90]);
  bridge.unmount();
  assert.equal(env.listeners.message.length, 0);
});

test("the card menu offers the table side to one player creature and routes it to setTableSide", async () => {
  const { buildInitiativeCardContextMenuPayload, routeInitiativeCardContextMenuAction } = await import("../src/initiativeMenuActionsCore.js");
  const { isAllowedInitiativeCardMenuAction } = await import("../src/menuPopoverProtocolCore.js");

  const pc = { id: "aria", name: "Aria", attitude: "pc" };
  assert.deepEqual(
    [buildInitiativeCardContextMenuPayload({ sourceEntry: pc, scopeIds: ["aria"], tableSide: "north" })]
      .map(({ showTableSideMenu, tableSide }) => ({ showTableSideMenu, tableSide })),
    [{ showTableSideMenu: true, tableSide: "north" }],
  );
  assert.equal(buildInitiativeCardContextMenuPayload({ sourceEntry: pc, scopeIds: ["aria"], tableSide: null }).tableSide, "none");
  assert.equal(Object.hasOwn(buildInitiativeCardContextMenuPayload({ sourceEntry: pc, scopeIds: ["aria"] }), "tableSide"), false,
    "unknown side: no Attivo mark");
  // Not for enemies, groups or several cards at once.
  assert.equal(buildInitiativeCardContextMenuPayload({ sourceEntry: { ...pc, attitude: "enemy" }, scopeIds: ["aria"] }).showTableSideMenu, undefined);
  assert.equal(buildInitiativeCardContextMenuPayload({ sourceEntry: pc, scopeIds: ["aria", "borin"] }).showTableSideMenu, undefined);

  for (const value of ["south", "west", "north", "east", "none"]) assert.equal(isAllowedInitiativeCardMenuAction("table-side", value), true);
  assert.equal(isAllowedInitiativeCardMenuAction("table-side", "up"), false);

  const calls = [];
  const handlers = { setTableSide: async (entry, side) => calls.push([entry.id, side]) };
  assert.equal(await routeInitiativeCardContextMenuAction({ sourceEntry: pc, scopeIds: ["aria"] }, { action: "table-side", value: "east" }, handlers), true);
  assert.equal(await routeInitiativeCardContextMenuAction({ sourceEntry: pc, scopeIds: ["aria"] }, { action: "table-side", value: "none" }, handlers), true);
  assert.equal(await routeInitiativeCardContextMenuAction({ sourceEntry: pc, scopeIds: ["aria"] }, { action: "table-side", value: "up" }, handlers), false);
  assert.deepEqual(calls, [["aria", "east"], ["aria", null]]);
});

test("writeTableSide merges the side into each token's plugin metadata", async () => {
  const { writeTableSide } = await import("../src/tableSideWriter.js");
  const items = [{ id: "aria", metadata: { other: 1, [META_KEY]: { hp: 9, hpMax: 12 } } }];
  const obr = { scene: { items: { updateItems: async (ids, update) => update(items.filter((item) => ids.includes(item.id))) } } };
  assert.equal(await writeTableSide(["aria", "aria"], "west", { obr }), true);
  assert.deepEqual(items[0].metadata, { other: 1, [META_KEY]: { hp: 9, hpMax: 12, tableSide: "west" } });
  assert.equal(await writeTableSide(["aria"], null, { obr, isCurrent: () => false }), false);
  assert.equal(items[0].metadata[META_KEY].tableSide, "west", "a stale scene writes nothing");
  await writeTableSide(["aria"], null, { obr });
  assert.deepEqual(items[0].metadata[META_KEY], { hp: 9, hpMax: 12 });
});
