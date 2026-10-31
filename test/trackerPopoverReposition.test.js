// Lot V1: moving, turning or scaling the tracker opens it again in place (reposition) instead of closing it first
// (refresh), so it never shows empty; its companion popovers still close as before, and a closed tracker just opens.
import test, { mock } from "node:test";
import assert from "node:assert/strict";

const ID = "com.thebigpicture.initiative";
const TRACKER = `${ID}/tracker-popover`;
const store = new Map();
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => { store.set(key, String(value)); },
  removeItem: (key) => { store.delete(key); },
};
const closed = [];
const opened = [];
mock.module("@owlbear-rodeo/sdk", {
  exports: {
    default: {
      player: { getRole: async () => "GM" },
      viewport: { getWidth: async () => 1600, getHeight: async () => 900 },
      popover: {
        open: async (options) => { opened.push(options); },
        close: async (id) => { closed.push(id); },
        getWidth: async () => 420, getHeight: async () => 700,
      },
      broadcast: { sendMessage: async () => {}, onMessage: () => () => {} },
      room: { getMetadata: async () => ({}), onMetadataChange: () => () => {} },
    },
  },
});
mock.module("../src/popoverDragHost.js", { namedExports: { openTrackedPopover: async (options) => { opened.push(options); } } });
const tracker = await import("../src/trackerPopover.js");

function reset(open) {
  closed.length = 0;
  opened.length = 0;
  store.set(`${ID}/tracker-popover-open`, open ? "1" : "0");
}

test("refresh closes the open tracker before opening it again", async () => {
  reset(true);
  await tracker.openTrackerPopover({ refresh: true });
  assert.ok(closed.includes(TRACKER));
  assert.equal(opened.filter((options) => options.id === TRACKER).length, 1);
});

test("reposition opens the open tracker again in place and still closes its companions", async () => {
  reset(true);
  await tracker.openTrackerPopover({ reposition: true });
  assert.equal(closed.includes(TRACKER), false, "the tracker is not closed");
  assert.ok(closed.length > 0, "the companion popovers close as with refresh");
  const reopened = opened.filter((options) => options.id === TRACKER);
  assert.equal(reopened.length, 1);
  assert.equal(reopened[0].url, "/?surface=tracker", "the same URL, so OBR keeps the page");
});

test("a closed tracker opens with reposition as with a plain open, and an open one stays as it is without either", async () => {
  reset(false);
  await tracker.openTrackerPopover({ reposition: true });
  assert.equal(closed.includes(TRACKER), false);
  assert.equal(opened.filter((options) => options.id === TRACKER).length, 1);
  reset(true);
  await tracker.openTrackerPopover();
  assert.equal(opened.length, 0, "an open tracker is left alone");
});

test("the handle's moves and the side switch reposition the tracker", async () => {
  for (const action of [() => tracker.moveClassicTrackerPopover(40, 20), () => tracker.toggleClassicTrackerSide()]) {
    reset(true);
    await action();
    assert.equal(closed.includes(TRACKER), false);
    assert.equal(opened.filter((options) => options.id === TRACKER).length, 1);
  }
});

// The menus of the extended tracker (the card's context menu, ⚡) are placed from the tracker's frame. A page in the
// tracker cannot read its frame's position in Owlbear: docked on the right, they opened at the screen's left edge.
test("the extended tracker's frame on screen follows its side, for the menus opened from it", async () => {
  reset(true);
  const screen = { viewportWidth: 1600, viewportHeight: 900 };
  store.delete(`${ID}/tracker-classic-placement`);
  assert.deepEqual(tracker.getClassicTrackerFrameOrigin(1, screen), { left: 22, top: 52, side: "left" });
  await tracker.toggleClassicTrackerSide();
  assert.deepEqual(tracker.getClassicTrackerFrameOrigin(1, screen), { left: 1600 - 96 - 340, top: 52, side: "right" });
  store.delete(`${ID}/tracker-classic-placement`);
});
