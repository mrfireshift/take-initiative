import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";

export const TRACKER_POPOVER_ID = `${ID}/tracker-popover`;
const COMPACT_EFFECTS_POPOVER_ID = `${ID}/compact-effects-popover`;
export const TRACKER_LAYOUT_CHANNEL = `${ID}/tracker-layout-change`;
export const TRACKER_LAYOUT_CLASSIC = "classic";
export const TRACKER_LAYOUT_COMPACT = "compact";
const TRACKER_LAYOUT_KEY = `${ID}/tracker-layout`;
const TRACKER_COMPACT_POSITION_KEY = `${ID}/tracker-compact-position`;
const COMPACT_DEFAULT_WIDTH = 1180;
const COMPACT_MAX_WIDTH = 1180;
const COMPACT_HEIGHT = 156;
const COMPACT_EDGE_MARGIN = 18;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function compactAnchorPosition(viewportWidth, viewportHeight) {
  const fallback = {
    left: Math.round(viewportWidth / 2),
    top: Math.round(viewportHeight - COMPACT_EDGE_MARGIN),
  };
  try {
    const stored = JSON.parse(localStorage.getItem(TRACKER_COMPACT_POSITION_KEY) || "null");
    if (!Number.isFinite(stored?.left) || !Number.isFinite(stored?.top)) return fallback;
    return {
      left: clamp(Math.round(stored.left), COMPACT_EDGE_MARGIN, viewportWidth - COMPACT_EDGE_MARGIN),
      top: clamp(Math.round(stored.top), 90, viewportHeight - COMPACT_EDGE_MARGIN),
    };
  } catch {
    return fallback;
  }
}


export function getTrackerLayout() {
  return localStorage.getItem(TRACKER_LAYOUT_KEY) === TRACKER_LAYOUT_COMPACT
    ? TRACKER_LAYOUT_COMPACT
    : TRACKER_LAYOUT_CLASSIC;
}

export async function setTrackerLayout(layout) {
  const next = layout === TRACKER_LAYOUT_COMPACT
    ? TRACKER_LAYOUT_COMPACT
    : TRACKER_LAYOUT_CLASSIC;
  localStorage.setItem(TRACKER_LAYOUT_KEY, next);
  await OBR.broadcast.sendMessage(TRACKER_LAYOUT_CHANNEL, {
    type: "tracker-layout-change",
    layout: next,
  }, { destination: "LOCAL" });
  return next;
}

export async function moveCompactTrackerPopover(deltaX, deltaY) {
  let viewportHeight = 900;
  let viewportWidth = 1200;
  try { viewportHeight = Number(await OBR.viewport.getHeight()) || viewportHeight; } catch {}
  try { viewportWidth = Number(await OBR.viewport.getWidth()) || viewportWidth; } catch {}
  const current = compactAnchorPosition(viewportWidth, viewportHeight);
  localStorage.setItem(TRACKER_COMPACT_POSITION_KEY, JSON.stringify({
    left: clamp(current.left + (Number(deltaX) || 0), COMPACT_EDGE_MARGIN, viewportWidth - COMPACT_EDGE_MARGIN),
    top: clamp(current.top + (Number(deltaY) || 0), 90, viewportHeight - COMPACT_EDGE_MARGIN),
  }));
  await openTrackerPopover({ refresh: true });
}

export async function resetCompactTrackerPopoverPosition() {
  localStorage.removeItem(TRACKER_COMPACT_POSITION_KEY);
  await openTrackerPopover({ refresh: true });
}
const TRACKER_OPEN_KEY = `${ID}/tracker-popover-open`;

export function isTrackerPopoverOpen() {
  return localStorage.getItem(TRACKER_OPEN_KEY) === "1";
}

export async function openTrackerPopover({ refresh = false } = {}) {
  if (isTrackerPopoverOpen() && !refresh) return;
  if (refresh) {
    await Promise.all([
      OBR.popover.close(TRACKER_POPOVER_ID).catch(() => {}),
      OBR.popover.close(COMPACT_EFFECTS_POPOVER_ID).catch(() => {}),
    ]);
  }
  const layout = getTrackerLayout();
  const compact = layout === TRACKER_LAYOUT_COMPACT;
  let viewportHeight = 900;
  let viewportWidth = 1200;
  try { viewportHeight = Number(await OBR.viewport.getHeight()) || viewportHeight; } catch {}
  try { viewportWidth = Number(await OBR.viewport.getWidth()) || viewportWidth; } catch {}
  const width = compact
    ? Math.max(260, Math.min(COMPACT_DEFAULT_WIDTH, COMPACT_MAX_WIDTH, Math.floor(viewportWidth - 32)))
    : 340;
  const height = compact
    ? Math.min(COMPACT_HEIGHT, Math.max(150, Math.floor(viewportHeight - 32)))
    : Math.max(360, Math.floor(viewportHeight - 124));
  const compactAnchor = compactAnchorPosition(viewportWidth, viewportHeight);
  await OBR.popover.open({
    id: TRACKER_POPOVER_ID,
    url: "/?surface=tracker",
    width,
    height,
    anchorReference: "POSITION",
    anchorPosition: compact ? compactAnchor : { left: 22, top: 52 },
    anchorOrigin: compact
      ? { horizontal: "CENTER", vertical: "BOTTOM" }
      : { horizontal: "LEFT", vertical: "TOP" },
    transformOrigin: compact
      ? { horizontal: "CENTER", vertical: "BOTTOM" }
      : { horizontal: "LEFT", vertical: "TOP" },
    disableClickAway: true,
    marginThreshold: 12,
    hidePaper: true,
  });
  localStorage.setItem(TRACKER_OPEN_KEY, "1");
}

export async function closeTrackerPopover() {
  try {
    await Promise.all([
      OBR.popover.close(TRACKER_POPOVER_ID).catch(() => {}),
      OBR.popover.close(COMPACT_EFFECTS_POPOVER_ID).catch(() => {}),
    ]);
  } finally {
    localStorage.setItem(TRACKER_OPEN_KEY, "0");
  }
}

export async function setTrackerPopoverOpen(open, options) {
  if (open) await openTrackerPopover(options);
  else await closeTrackerPopover();
}

export async function getCompactTrackerPopoverAnchor() {
  let viewportHeight = 900;
  let viewportWidth = 1200;
  try { viewportHeight = Number(await OBR.viewport.getHeight()) || viewportHeight; } catch {}
  try { viewportWidth = Number(await OBR.viewport.getWidth()) || viewportWidth; } catch {}
  return compactAnchorPosition(viewportWidth, viewportHeight);
}
