import test from "node:test";
import assert from "node:assert/strict";

import {
  COMPACT_TRACKER_MAX_WIDTH,
  COMPACT_TRACKER_MIN_WIDTH,
  compactTrackerGroupProgress,
  compactTrackerResizeWidth,
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
