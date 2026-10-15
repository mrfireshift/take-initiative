// Extended tracker placement: the side it docks to (left by default, right to leave OBR's extension panels free),
// a drag that docks to the nearer side, a click that switches side, side panels on the free side.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { defaultTrackerPlacement, moveTrackerPlacement, normalizeTrackerPlacement, toggleTrackerSide, trackerPlacementFrame,
  trackerSidePanelAnchor } from "../src/trackerPlacementCore.js";

const screen = { width: 340, viewportWidth: 2000, viewportHeight: 1000 };

test("the default is the historical position: left at 22 px, top 52, as tall as before", () => {
  const frame = trackerPlacementFrame(null, screen);
  assert.deepEqual(frame, { side: "left", left: 22, top: 52, width: 340, height: 1000 - 124,
    anchorPosition: { left: 22, top: 52 }, origin: { horizontal: "LEFT", vertical: "TOP" } });
  assert.deepEqual(normalizeTrackerPlacement({ side: "middle" }), defaultTrackerPlacement());
  assert.deepEqual(normalizeTrackerPlacement({ side: "right", inset: "x" }), defaultTrackerPlacement("right"));
});

test("the right side is anchored by its right edge, clear of OBR's tool column, and follows a resized window", () => {
  const frame = trackerPlacementFrame(defaultTrackerPlacement("right"), screen);
  assert.deepEqual([frame.side, frame.left, frame.top, frame.anchorPosition, frame.origin],
    ["right", 2000 - 96 - 340, 52, { left: 2000 - 96, top: 52 }, { horizontal: "RIGHT", vertical: "TOP" }]);
  assert.equal(trackerPlacementFrame(defaultTrackerPlacement("right"), { ...screen, viewportWidth: 1400 }).anchorPosition.left, 1400 - 96);
  // A distance larger than the window keeps the tracker on screen.
  assert.equal(trackerPlacementFrame({ side: "left", inset: 5000, top: 52 }, screen).left, 2000 - 340 - 12);
});

test("a drag docks to the nearer side at the dropped distance; lower means shorter, never below the minimum", () => {
  assert.deepEqual(moveTrackerPlacement(null, 100, 30, screen), { side: "left", inset: 122, top: 82 });
  assert.deepEqual(moveTrackerPlacement(null, 1500, 0, screen), { side: "right", inset: 2000 - (22 + 1500) - 340, top: 52 });
  assert.deepEqual(moveTrackerPlacement(defaultTrackerPlacement("right"), -1500, 0, screen), { side: "left", inset: 2000 - 96 - 340 - 1500, top: 52 });
  assert.deepEqual(moveTrackerPlacement(null, -400, -400, screen), { side: "left", inset: 12, top: 12 });
  const low = trackerPlacementFrame(moveTrackerPlacement(null, 0, 5000, screen), screen);
  assert.equal(low.height, 360);
  assert.equal(low.top, 1000 - 360 - 12);
});

test("a click switches side at its default distance and keeps the height on screen", () => {
  assert.deepEqual(toggleTrackerSide(null), { side: "right", inset: 96, top: 52 });
  assert.deepEqual(toggleTrackerSide({ side: "right", inset: 300, top: 120 }), { side: "left", inset: 22, top: 120 });
});

test("side panels open on the free side of the extended tracker", () => {
  assert.deepEqual(trackerSidePanelAnchor(null, { trackerWidth: 340, viewportWidth: 2000 }), { left: 354, top: 52 }, "unchanged by default");
  assert.deepEqual(trackerSidePanelAnchor({ side: "left", inset: 122, top: 52 }, { trackerWidth: 340, viewportWidth: 2000 }), { left: 454, top: 52 });
  assert.deepEqual(trackerSidePanelAnchor(defaultTrackerPlacement("right"), { trackerWidth: 340, viewportWidth: 2000, panelWidth: 560 }),
    { left: 2000 - 96 - 340 - 14 - 560, top: 52 });
  assert.equal(trackerSidePanelAnchor(defaultTrackerPlacement("right"), { trackerWidth: 340, viewportWidth: 800, panelWidth: 560 }).left, 12);
});

test("wiring: the handle shows in both layouts, a click switches side, the drag routes by layout", async () => {
  const list = await readFile(new URL("../src/initiativeList.js", import.meta.url), "utf8");
  assert.match(list, /trackerDragHandle\.style\.display = "inline-flex";/);
  assert.match(list, /type: "tracker-side-toggle"/);
  assert.doesNotMatch(list, /trackerDragHandle\.addEventListener\("dragstart", \(event\) => \{\s*if \(!isCompactTrackerLayout\(\)\)/);
  const sync = await readFile(new URL("../src/sync-open.js", import.meta.url), "utf8");
  assert.match(sync, /: moveClassicTrackerPopover\(event\.data\.deltaX, event\.data\.deltaY\)\);/);
  assert.match(sync, /"tracker-side-toggle"[\s\S]*toggleClassicTrackerSide\(\)/);
  const popover = await readFile(new URL("../src/trackerPopover.js", import.meta.url), "utf8");
  assert.match(popover, /anchorPosition: compact \? compactAnchor : classic\.anchorPosition/);
});
