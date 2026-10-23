import assert from "node:assert/strict";
import test, { mock } from "node:test";

// Two iframes (two module instances) share one simulated SDK: the broadcast reaches both, like OBR's LOCAL messages.
const listeners = new Map();
const opened = [];
const sdk = {
  onReady(callback) { callback(); },
  broadcast: {
    onMessage(channel, listener) { (listeners.get(channel) || listeners.set(channel, new Set()).get(channel)).add(listener); return () => {}; },
    async sendMessage(channel, data) { for (const listener of [...(listeners.get(channel) || [])]) await listener({ data: structuredClone(data) }); },
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
const tracker = await import("../src/popoverDragHost.js?tracker");
const background = await import("../src/popoverDragHost.js?background");
const { POPOVER_DRAG_CHANNEL } = await import("../src/popoverDrag.js");
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

const options = (id) => ({ id, url: "/pc-attack.html", width: 380, height: 560, anchorReference: "POSITION", anchorPosition: { left: 80, top: 60 },
  anchorOrigin: { horizontal: "LEFT", vertical: "TOP" }, transformOrigin: { horizontal: "LEFT", vertical: "TOP" } });

test("a popover opened by two iframes moves once on a drag: the last opener owns it", async () => {
  await tracker.openTrackedPopover(options("console"));
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
