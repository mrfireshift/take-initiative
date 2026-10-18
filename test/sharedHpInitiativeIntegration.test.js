import test from "node:test";
import assert from "node:assert/strict";
import { createSharedHpInitiativeController, sharedHpInitiativeState } from "../src/sharedHpInitiativeController.js";
const key = "com.thebigpicture.initiative/meta";
const items = ["hand", "head"].map(id => ({ id, metadata: { [key]: {
  sharedHpSourceId: "auril", sharedHpExcludeFromInitiative: true, inInitiative: true,
} } }));
test("initiative removal preserves foreign virtual IDs, active creature, round and metadata", () => {
  const state = { order: ["hand", "hand::p1", "auril", "__LAIR__", "__EPICACT__::auril::after::pc", "pc"],
    current: 2, round: 7, foreign: 42 };
  const next = sharedHpInitiativeState(state, items);
  assert.deepEqual(next.order, ["auril", "__LAIR__", "__EPICACT__::auril::after::pc", "pc"]);
  assert.equal(next.current, 0); assert.equal(next.round, 7); assert.equal(next.foreign, 42);
  assert.equal(state.order.length, 6);
});
test("background cleanup works without tracker and stops callbacks after teardown", async () => {
  let callback; let state = { order: ["hand", "auril", "__LAIR__"], current: 1, round: 4 };
  let reads = 0;
  const controller = createSharedHpInitiativeController({ readItems: async () => { reads++; return items; },
    enqueueStateReducer: async command => { state = { ...state, ...await command.reducer(state) }; return { status: "applied" }; },
    subscribeItems: handler => { callback = handler; return () => { callback = null; }; },
    isCurrent: () => true });
  await controller.start();
  assert.deepEqual(state.order, ["auril", "__LAIR__"]); assert.equal(state.current, 0);
  await callback({ flags: { trackerStructure: false }, items: [] });
  assert.equal(reads, 2);
  controller.stop(); assert.equal(callback, null);
});
