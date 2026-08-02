import { COMPACT_CARD_WIDTH } from "./initiativeCardCompact.js";

export const COMPACT_TRACKER_MAX_WIDTH = 1180;
export const COMPACT_TRACKER_MIN_WIDTH = 320;

const ROUND_PANEL_WIDTH = 118;
const TOOLBAR_WIDTH = 98;
const NAVIGATION_BUTTONS_WIDTH = 28 * 2;
const NAVIGATION_GAPS_WIDTH = 3 * 2;
const TRACK_HORIZONTAL_PADDING = 7 * 2;
const CARD_GAP = 5;
const COLUMN_GAP = 2;
const COLUMN_PADDING_AND_BORDER = 6;

function fixedChromeWidth(showToolbar) {
  const visibleSectionCount = showToolbar ? 3 : 2;
  return ROUND_PANEL_WIDTH
    + (showToolbar ? TOOLBAR_WIDTH : 0)
    + (visibleSectionCount - 1) * COLUMN_GAP
    + COLUMN_PADDING_AND_BORDER;
}

export function compactTrackerWidth(
  entryCount,
  { showToolbar = true, showNavigation = true } = {},
) {
  const count = Math.max(0, Math.floor(Number(entryCount) || 0));
  const cardStripWidth = count * COMPACT_CARD_WIDTH
    + Math.max(0, count - 1) * CARD_GAP
    + TRACK_HORIZONTAL_PADDING;
  const navigationWidth = showNavigation
    ? NAVIGATION_BUTTONS_WIDTH + NAVIGATION_GAPS_WIDTH
    : 0;
  const requestedWidth = navigationWidth
    + cardStripWidth
    + fixedChromeWidth(showToolbar);

  return Math.max(
    COMPACT_TRACKER_MIN_WIDTH,
    Math.min(COMPACT_TRACKER_MAX_WIDTH, requestedWidth),
  );
}

export function compactTrackerResizeWidth(startWidth, targetWidth, progress) {
  const start = Number(startWidth) || 0;
  const target = Number(targetWidth) || 0;
  const normalizedProgress = Math.max(0, Math.min(1, Number(progress) || 0));
  const easedProgress = 1 - Math.pow(1 - normalizedProgress, 3);
  return Math.round(start + (target - start) * easedProgress);
}

export function compactTrackerGroupProgress(initialSizes, finalSizes, currentSizes) {
  const sum = (values) => values.reduce((total, value) => total + (Number(value) || 0), 0);
  const initialSize = sum(initialSizes);
  const sizeDelta = sum(finalSizes) - initialSize;
  if (Math.abs(sizeDelta) < 0.5) return 1;
  return Math.max(0, Math.min(1, (sum(currentSizes) - initialSize) / sizeDelta));
}
