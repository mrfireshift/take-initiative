// Tracker scale: the players' tracker (room option `playerView.trackerScale`, the table screen read from a distance)
// and the GM's tracker (local option `tracker.scale`, this browser), from 50% to 200%. Pure geometry.
// The popover follows the scale and the tracker page is zoomed by the same factor, so the content keeps its
// layout (cards, fonts, labels) and only gets bigger or smaller. A larger scale shrinks when the screen cannot hold it.
import { compactTrackerViewportWidth } from "./trackerCompactSizingCore.js";

export const TRACKER_SCALE_DEFAULT = 1;
export const TRACKER_SCALE_MIN = 0.5;
export const TRACKER_SCALE_MAX = 2;
export const TRACKER_SCALE_STEP = 0.05;
export const TRACKER_SCALE_CHOICES = Object.freeze([0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]);
const TRACKER_SCALE_STEPS_PER_UNIT = Math.round(1 / TRACKER_SCALE_STEP);

export const CLASSIC_TRACKER_BASE_WIDTH = 340;
export const CLASSIC_TRACKER_LEFT = 22;
export const CLASSIC_TRACKER_TOP = 52;
export const CLASSIC_TRACKER_BOTTOM_GAP = 72;
export const CLASSIC_TRACKER_MIN_HEIGHT = 360;
export const COMPACT_TRACKER_BASE_HEIGHT = 156;
export const COMPACT_TRACKER_MIN_HEIGHT = 150;
const COMPACT_TRACKER_VERTICAL_MARGIN = 32;
const EDGE = 12;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const floorScale = (value) => Math.floor(value * 100) / 100;

export function normalizeTrackerScale(value) {
  if (typeof value !== "number" && typeof value !== "string") return TRACKER_SCALE_DEFAULT;
  if (typeof value === "string" && !value.trim()) return TRACKER_SCALE_DEFAULT;
  const scale = Number(value);
  if (!Number.isFinite(scale)) return TRACKER_SCALE_DEFAULT;
  // Snapped to the slider step (5%), without floating point leftovers (1.3, not 1.3000000000000003).
  const snapped = Math.round(clamp(scale, TRACKER_SCALE_MIN, TRACKER_SCALE_MAX) * TRACKER_SCALE_STEPS_PER_UNIT)
    / TRACKER_SCALE_STEPS_PER_UNIT;
  return clamp(snapped, TRACKER_SCALE_MIN, TRACKER_SCALE_MAX);
}

// Players use the room scale (`scale`), the GM the scale of this browser (`gmScale`, 1 by default).
export function effectiveTrackerScale(scale, role, gmScale = TRACKER_SCALE_DEFAULT) {
  return normalizeTrackerScale(String(role || "").toUpperCase() === "PLAYER" ? scale : gmScale);
}

// Extended tracker: the width follows the scale (narrower below 100%) and grows as far as the screen allows from its docked edge
// (`inset`, 22 px from the left by default); the height still fills the screen below `top`.
export function classicTrackerScaledFrame(scale, {
  viewportWidth = 1200,
  viewportHeight = 900,
  inset = CLASSIC_TRACKER_LEFT,
  top = CLASSIC_TRACKER_TOP,
} = {}) {
  const requested = normalizeTrackerScale(scale);
  const available = (Number(viewportWidth) || 1200) - Math.max(0, Number(inset) || 0) - EDGE;
  const fitted = requested > 1
    ? clamp(floorScale(available / CLASSIC_TRACKER_BASE_WIDTH), 1, requested)
    : requested;
  return {
    scale: fitted,
    width: Math.round(CLASSIC_TRACKER_BASE_WIDTH * fitted),
    height: Math.max(
      CLASSIC_TRACKER_MIN_HEIGHT,
      Math.floor((Number(viewportHeight) || 900) - (Number(top) || 0) - CLASSIC_TRACKER_BOTTOM_GAP),
    ),
  };
}

// Compact bar: the height follows the scale (shorter below 100%, taller as far as the screen allows); the width is
// the unscaled bar width times the scale, capped by the screen (the bar already adapts to a narrower frame).
export function compactTrackerScale(scale, { viewportHeight = 900 } = {}) {
  const requested = normalizeTrackerScale(scale);
  if (requested <= 1) return requested;
  const available = (Number(viewportHeight) || 900) - COMPACT_TRACKER_VERTICAL_MARGIN;
  return clamp(floorScale(available / COMPACT_TRACKER_BASE_HEIGHT), 1, requested);
}

// `currentHeight` is the open popover's height on screen: at scale 1 it is kept (as before); any other scale
// always asks for the full scaled height, so a bar opened before the scale changed does not keep the old size.
export function compactTrackerScaledHeight(scale, { viewportHeight = 900, currentHeight = null } = {}) {
  const fitted = compactTrackerScale(scale, { viewportHeight });
  const scaledHeight = Math.round(COMPACT_TRACKER_BASE_HEIGHT * fitted);
  const requested = fitted !== 1 ? scaledHeight : Math.round(Number(currentHeight) || COMPACT_TRACKER_BASE_HEIGHT);
  return Math.min(
    Math.max(COMPACT_TRACKER_MIN_HEIGHT, requested),
    scaledHeight,
    Math.max(COMPACT_TRACKER_MIN_HEIGHT, Math.floor((Number(viewportHeight) || 900) - COMPACT_TRACKER_VERTICAL_MARGIN)),
  );
}

export function compactTrackerScaledWidth(baseWidth, scale, { viewportWidth = 1200, viewportHeight = 900 } = {}) {
  const fitted = compactTrackerScale(scale, { viewportHeight });
  return compactTrackerViewportWidth((Number(baseWidth) || 0) * fitted, viewportWidth, fitted);
}
