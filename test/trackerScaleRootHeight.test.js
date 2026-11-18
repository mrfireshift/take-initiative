// Tracker size above 100% (studio UI del tracker, T1): the page is zoomed, and Chrome's zoom multiplies vh too. The
// glass root of the tracker divides its 100vh by the zoom, so it stays as tall as its popover at every size: before,
// at 150% the compact strip was cut at the bottom and the classic list hid its last cards and the ▲ ▼ bar.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const trackerPage = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const tracker = readFileSync(new URL("../src/initiativeList.js", import.meta.url), "utf8");
const glass = readFileSync(new URL("../public/popover-glass.css", import.meta.url), "utf8");

test("the tracker's glass root divides 100vh by the tracker zoom, while the shared glass rule stays as it is", () => {
  assert.match(
    trackerPage,
    /#initiative-widget\[data-glass-popover="1"\] \{\s*min-height: calc\(100vh \/ var\(--tbp-tracker-zoom, 1\)\) !important;\s*\}/,
  );
  // The other glass popovers are never zoomed: their rule keeps the plain 100vh.
  assert.match(glass, /\[data-glass-popover="1"\] \{\s*min-height: 100vh !important;/);
});

test("the tracker zoom writes its scale for the root's height, and clears it at 100%", () => {
  const body = tracker.match(/function __setTrackerViewZoom\(scale\) \{([\s\S]*?)\n\}/)?.[1] || "";
  assert.match(body, /document\.documentElement\.style\.zoom = scale !== 1 \? String\(scale\) : "";/);
  assert.match(body, /if \(scale !== 1\) document\.documentElement\.style\.setProperty\("--tbp-tracker-zoom", String\(scale\)\);/);
  assert.match(body, /else document\.documentElement\.style\.removeProperty\("--tbp-tracker-zoom"\);/);
});
