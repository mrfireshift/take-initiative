import test from "node:test";
import assert from "node:assert/strict";

import {
  COMPACT_TRACKER_MAX_WIDTH,
  COMPACT_TRACKER_MIN_WIDTH,
  compactTrackerGroupProgress,
  compactTrackerManualResizeWidth,
  compactTrackerResizeWidth,
  compactTrackerStageSize,
  compactTrackerViewportWidth,
  compactTrackerWidth,
} from "../src/trackerCompactSizingCore.js";

test("compactTrackerWidth grows with the visible card count", () => {
  assert.equal(compactTrackerWidth(1), 394);
  assert.equal(compactTrackerWidth(5), 782);
});

test("compactTrackerWidth respects its minimum and maximum caps", () => {
  assert.equal(compactTrackerWidth(0), COMPACT_TRACKER_MIN_WIDTH);
  assert.equal(compactTrackerWidth(100), COMPACT_TRACKER_MAX_WIDTH);
});

test("compactTrackerViewportWidth clamps manual sizing to the tracker and viewport bounds", () => {
  assert.equal(compactTrackerViewportWidth(800, 1200), 800);
  assert.equal(compactTrackerViewportWidth(200, 1200), COMPACT_TRACKER_MIN_WIDTH);
  assert.equal(compactTrackerViewportWidth(1400, 1600), COMPACT_TRACKER_MAX_WIDTH);
  assert.equal(compactTrackerViewportWidth(800, 700), 668);
  assert.equal(compactTrackerViewportWidth(320, 280), 260);
});

test("compactTrackerWidth omits the GM toolbar for players", () => {
  assert.equal(compactTrackerWidth(1, { showToolbar: false }), COMPACT_TRACKER_MIN_WIDTH);
  assert.equal(compactTrackerWidth(5, { showToolbar: false }), 682);
});

test("compactTrackerWidth omits navigation when the player view has no arrows", () => {
  assert.equal(compactTrackerWidth(5, { showToolbar: false, showNavigation: false }), 620);
});

test("compactTrackerResizeWidth follows a clamped ease-out transition", () => {
  assert.equal(compactTrackerResizeWidth(1180, 782, -1), 1180);
  assert.equal(compactTrackerResizeWidth(1180, 782, 0.5), 832);
  assert.equal(compactTrackerResizeWidth(1180, 782, 2), 782);
});

test("compactTrackerGroupProgress follows the rendered accordion geometry", () => {
  assert.equal(compactTrackerGroupProgress([92], [383], [237.5]), 0.5);
  assert.equal(compactTrackerGroupProgress([383], [92], [237.5]), 0.5);
  assert.equal(compactTrackerGroupProgress([92, 286], [286, 92], [180, 198]), 1);
});

test("compactTrackerStageSize keeps the final geometry after the animation stage is detached", () => {
  assert.equal(compactTrackerStageSize(237.5, 383, true), 237.5);
  assert.equal(compactTrackerStageSize(0, 383, false), 383);
});

test("compactTrackerManualResizeWidth follows either centered side grip", () => {
  assert.equal(compactTrackerManualResizeWidth(800, 40, "right", 1200), 880);
  assert.equal(compactTrackerManualResizeWidth(800, 40, "left", 1200), 720);
  assert.equal(compactTrackerManualResizeWidth(1160, 40, "right", 1200), 1168);
});
