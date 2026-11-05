import assert from "node:assert/strict";
import test, { mock } from "node:test";

// Two iframes (two module instances) share one simulated SDK: the broadcast reaches both, like OBR's LOCAL messages.
const listeners = new Map();
const opened = [];
const sdk = {
  onReady(callback) { callback(); },
  broadcast: {
    onMessage(channel, listener) { (listeners.get(channel) || listeners.set(channel, new Set()).get(channel)).add(listener); return () => {}; },
    // As OBR does: one message reaches every iframe at once, and what they answer comes after.
    async sendMessage(channel, data) {
      const copy = structuredClone(data);
      setTimeout(() => { for (const listener of [...(listeners.get(channel) || [])]) listener({ data: copy }); }, 0);
    },
  },
  popover: {
    async open(options) { opened.push(options); },
    getWidth: async () => 380,
    getHeight: async () => 560,
  },
  viewport: { getWidth: async () => 1600, getHeight: async () => 900 },
};
globalThis.localStorage = { getItem: () => null, setItem() {} };
mock.module("@owlbear-rodeo/sdk", { exports: { default: sdk } });
const { POPOVER_DRAG_CHANNEL } = await import("../src/popoverDrag.js");
const tracker = await import("../src/popoverDragHost.js?tracker");
const [trackerListener] = listeners.get(POPOVER_DRAG_CHANNEL);
const background = await import("../src/popoverDragHost.js?background");
const tick = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));

const options = (id) => ({ id, url: "/pc-attack.html", width: 380, height: 560, anchorReference: "POSITION", anchorPosition: { left: 80, top: 60 },
  anchorOrigin: { horizontal: "LEFT", vertical: "TOP" }, transformOrigin: { horizontal: "LEFT", vertical: "TOP" } });

test("a popover opened by two iframes moves once on a drag: the last opener owns it", async () => {
  await tracker.openTrackedPopover(options("console"));
  await tick();
  await background.openTrackedPopover(options("console"));
  await tick();
  opened.length = 0;
  await sdk.broadcast.sendMessage(POPOVER_DRAG_CHANNEL, { type: "drag-end", id: "console", deltaX: 40, deltaY: 20 });
  await tick();
  assert.equal(opened.length, 1);
  assert.deepEqual(opened[0].anchorPosition, { left: 120, top: 80 });
});

test("a popover opened by one iframe still moves", async () => {
  await tracker.openTrackedPopover(options("solo"));
  await tick();
  opened.length = 0;
  await sdk.broadcast.sendMessage(POPOVER_DRAG_CHANNEL, { type: "drag-end", id: "solo", deltaX: -30, deltaY: 0 });
  await tick();
  assert.equal(opened.length, 1);
  assert.deepEqual(opened[0].anchorPosition, { left: 50, top: 60 });
});

test("the iframe that opened it has closed: the popover still moves, once, and the next drag starts from there", async () => {
  await tracker.openTrackedPopover(options("panel-popup"));
  await tick();
  // The opener closes: it hears nothing more.
  listeners.get(POPOVER_DRAG_CHANNEL).delete(trackerListener);
  opened.length = 0;
  await sdk.broadcast.sendMessage(POPOVER_DRAG_CHANNEL, { type: "drag-end", id: "panel-popup", dragId: "a", deltaX: 10, deltaY: 5 });
  await tick(400);
  assert.equal(opened.length, 1, "the iframe still here takes it over");
  assert.deepEqual(opened[0].anchorPosition, { left: 90, top: 65 });
  opened.length = 0;
  await sdk.broadcast.sendMessage(POPOVER_DRAG_CHANNEL, { type: "drag-end", id: "panel-popup", dragId: "b", deltaX: 10, deltaY: 5 });
  await tick();
  assert.equal(opened.length, 1, "it owns it now: at once");
  assert.deepEqual(opened[0].anchorPosition, { left: 100, top: 70 });
  listeners.get(POPOVER_DRAG_CHANNEL).add(trackerListener);
});

test("while the opener is open nobody else moves its popover, whatever the time it takes", async () => {
  await tracker.openTrackedPopover(options("alive"));
  await tick();
  opened.length = 0;
  await sdk.broadcast.sendMessage(POPOVER_DRAG_CHANNEL, { type: "drag-end", id: "alive", dragId: "c", deltaX: 7, deltaY: 0 });
  await tick(400);
  assert.equal(opened.length, 1);
  assert.deepEqual(opened[0].anchorPosition, { left: 87, top: 60 });
});

test("the others keep up with where it is: a takeover starts from the last position, not the first", async () => {
  await tracker.openTrackedPopover(options("moved-then-closed"));
  await tick();
  await sdk.broadcast.sendMessage(POPOVER_DRAG_CHANNEL, { type: "drag-end", id: "moved-then-closed", dragId: "d", deltaX: 20, deltaY: 0 });
  await tick();
  listeners.get(POPOVER_DRAG_CHANNEL).delete(trackerListener);
  opened.length = 0;
  await sdk.broadcast.sendMessage(POPOVER_DRAG_CHANNEL, { type: "drag-end", id: "moved-then-closed", dragId: "e", deltaX: 20, deltaY: 0 });
  await tick(400);
  assert.equal(opened.length, 1);
  assert.deepEqual(opened[0].anchorPosition, { left: 120, top: 60 });
  listeners.get(POPOVER_DRAG_CHANNEL).add(trackerListener);
});
