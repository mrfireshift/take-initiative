// Player tracker scale (room option `playerView.trackerScale`): the players' tracker, shown on the table screen
// and read from a distance, is drawn larger. Pure geometry; the GM view always stays at 1.
// The popover grows by the scale and the tracker page is zoomed by the same factor, so the content keeps its
// layout (cards, fonts, labels) and only gets bigger. The scale shrinks when the screen cannot hold it.
import { compactTrackerViewportWidth } from "./trackerCompactSizingCore.js";

export const TRACKER_SCALE_DEFAULT = 1;
export const TRACKER_SCALE_MIN = 1;
export const TRACKER_SCALE_MAX = 2;
export const TRACKER_SCALE_STEP = 0.25;
export const TRACKER_SCALE_CHOICES = Object.freeze([1, 1.25, 1.5, 1.75, 2]);

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
  const snapped = Math.round(clamp(scale, TRACKER_SCALE_MIN, TRACKER_SCALE_MAX) / TRACKER_SCALE_STEP)
    * TRACKER_SCALE_STEP;
  return clamp(snapped, TRACKER_SCALE_MIN, TRACKER_SCALE_MAX);
}

// Only the player view is scaled: the GM keeps the tracker as it is.
export function effectiveTrackerScale(scale, role) {
  return String(role || "").toUpperCase() === "PLAYER" ? normalizeTrackerScale(scale) : TRACKER_SCALE_DEFAULT;
}

// Extended tracker: the width grows with the scale, as far as the screen allows from its docked edge
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
    : 1;
  return {
    scale: fitted,
    width: Math.round(CLASSIC_TRACKER_BASE_WIDTH * fitted),
    height: Math.max(
      CLASSIC_TRACKER_MIN_HEIGHT,
      Math.floor((Number(viewportHeight) || 900) - (Number(top) || 0) - CLASSIC_TRACKER_BOTTOM_GAP),
    ),
  };
}

// Compact bar: the height grows with the scale as far as the screen allows; the width is the unscaled bar width
// times the scale, capped by the screen (the bar already adapts to a narrower frame).
export function compactTrackerScale(scale, { viewportHeight = 900 } = {}) {
  const requested = normalizeTrackerScale(scale);
  if (requested <= 1) return 1;
  const available = (Number(viewportHeight) || 900) - COMPACT_TRACKER_VERTICAL_MARGIN;
  return clamp(floorScale(available / COMPACT_TRACKER_BASE_HEIGHT), 1, requested);
}

// `currentHeight` is the open popover's height on screen: at scale 1 it is kept (as before); a larger scale
// always asks for the full scaled height, so a bar opened before the scale changed does not stay short.
export function compactTrackerScaledHeight(scale, { viewportHeight = 900, currentHeight = null } = {}) {
  const fitted = compactTrackerScale(scale, { viewportHeight });
  const scaledHeight = Math.round(COMPACT_TRACKER_BASE_HEIGHT * fitted);
  const requested = fitted > 1 ? scaledHeight : Math.round(Number(currentHeight) || COMPACT_TRACKER_BASE_HEIGHT);
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
