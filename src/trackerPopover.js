import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { openTrackedPopover } from "./popoverDragHost.js";
import { compactTrackerViewportWidth } from "./trackerCompactSizingCore.js";

export const TRACKER_POPOVER_ID = `${ID}/tracker-popover`;
export const COMPACT_ROUND_TAB_POPOVER_ID = `${ID}/compact-round-tab`;
export const COMPACT_SPEED_READOUT_POPOVER_ID = `${ID}/compact-speed-readout`;
const COMPACT_EFFECTS_POPOVER_ID = `${ID}/compact-effects-popover`;
const COMPACT_ADMIN_MENU_POPOVER_ID = `${ID}/compact-admin-menu`;
export const TRACKER_LAYOUT_CHANNEL = `${ID}/tracker-layout-change`;
export const TRACKER_LAYOUT_CLASSIC = "classic";
export const TRACKER_LAYOUT_COMPACT = "compact";
const TRACKER_LAYOUT_KEY = `${ID}/tracker-layout`;
const TRACKER_COMPACT_POSITION_KEY = `${ID}/tracker-compact-position`;
const TRACKER_COMPACT_MANUAL_WIDTH_KEY = `${ID}/tracker-compact-manual-width`;
const COMPACT_DEFAULT_WIDTH = 1180;
const COMPACT_MAX_WIDTH = 1180;
const COMPACT_HEIGHT = 156;
const COMPACT_ROUND_TAB_WIDTH = 124;
const COMPACT_SPEED_READOUT_WIDTH = 154;
const COMPACT_SPEED_READOUT_RIGHT_INSET = 18;
const COMPACT_ROUND_TAB_HEIGHT = 21;
const COMPACT_ROUND_TAB_OVERLAP = 4;
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

export function getCompactTrackerManualWidth() {
  const width = Number(localStorage.getItem(TRACKER_COMPACT_MANUAL_WIDTH_KEY));
  return Number.isFinite(width) && width > 0 ? Math.round(width) : null;
}

export function setCompactTrackerManualWidth(width) {
  const next = Number(width);
  if (!Number.isFinite(next) || next <= 0) {
    localStorage.removeItem(TRACKER_COMPACT_MANUAL_WIDTH_KEY);
    return null;
  }
  const rounded = Math.round(next);
  localStorage.setItem(TRACKER_COMPACT_MANUAL_WIDTH_KEY, String(rounded));
  return rounded;
}

async function refreshCompactTrackerPopoverAtStoredPosition() {
  const [width, height] = await Promise.all([
    OBR.popover.getWidth(TRACKER_POPOVER_ID).catch(() => undefined),
    OBR.popover.getHeight(TRACKER_POPOVER_ID).catch(() => undefined),
  ]);
  await openTrackerPopover({
    refresh: true,
    compactSize: { width, height },
  });
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
  await refreshCompactTrackerPopoverAtStoredPosition();
}

export async function resetCompactTrackerPopoverPosition() {
  localStorage.removeItem(TRACKER_COMPACT_POSITION_KEY);
  await refreshCompactTrackerPopoverAtStoredPosition();
}
const TRACKER_OPEN_KEY = `${ID}/tracker-popover-open`;

export function isTrackerPopoverOpen() {
  return localStorage.getItem(TRACKER_OPEN_KEY) === "1";
}

export function markTrackerPopoverClosed() {
  localStorage.setItem(TRACKER_OPEN_KEY, "0");
}

async function openCompactRoundTabPopover(anchorPosition, trackerHeight) {
  const top = Math.round(
    Number(anchorPosition?.top || 0)
      - Math.max(0, Number(trackerHeight) || COMPACT_HEIGHT)
      + COMPACT_ROUND_TAB_OVERLAP,
  );
  try {
    await OBR.popover.open({
      id: COMPACT_ROUND_TAB_POPOVER_ID,
      url: "/compact-round-tab.html?part=round",
      width: COMPACT_ROUND_TAB_WIDTH,
      height: COMPACT_ROUND_TAB_HEIGHT,
      anchorReference: "POSITION",
      anchorPosition: {
        left: Math.round(Number(anchorPosition?.left) || 0),
        top: Math.max(0, top),
      },
      anchorOrigin: { horizontal: "CENTER", vertical: "BOTTOM" },
      transformOrigin: { horizontal: "CENTER", vertical: "BOTTOM" },
      disableClickAway: true,
      marginThreshold: 0,
      hidePaper: true,
    });
  } catch (error) {
    console.warn("[tracker-layout] linguetta round non aperta:", error?.message || error);
  }
}

async function openCompactSpeedReadoutPopover(anchorPosition, trackerWidth, trackerHeight) {
  const top = Math.round(
    Number(anchorPosition?.top || 0)
      - Math.max(0, Number(trackerHeight) || COMPACT_HEIGHT)
      + COMPACT_ROUND_TAB_OVERLAP,
  );
  const right = Math.round(
    (Number(anchorPosition?.left) || 0)
      + Math.max(0, Number(trackerWidth) || COMPACT_DEFAULT_WIDTH) / 2
      - COMPACT_SPEED_READOUT_RIGHT_INSET,
  );
  try {
    await OBR.popover.open({
      id: COMPACT_SPEED_READOUT_POPOVER_ID,
      url: "/compact-round-tab.html?part=speed",
      width: COMPACT_SPEED_READOUT_WIDTH,
      height: COMPACT_ROUND_TAB_HEIGHT,
      anchorReference: "POSITION",
      anchorPosition: { left: right, top: Math.max(0, top) },
      anchorOrigin: { horizontal: "RIGHT", vertical: "BOTTOM" },
      transformOrigin: { horizontal: "RIGHT", vertical: "BOTTOM" },
      disableClickAway: true,
      marginThreshold: 0,
      hidePaper: true,
    });
  } catch (error) {
    console.warn("[tracker-layout] tracker velocità micro non aperto:", error?.message || error);
  }
}

export async function openTrackerPopover({ refresh = false, compactSize = null } = {}) {
  if (isTrackerPopoverOpen() && !refresh) return;
  if (refresh) {
    await Promise.all([
      OBR.popover.close(TRACKER_POPOVER_ID).catch(() => {}),
      OBR.popover.close(COMPACT_ROUND_TAB_POPOVER_ID).catch(() => {}),
      OBR.popover.close(COMPACT_SPEED_READOUT_POPOVER_ID).catch(() => {}),
      OBR.popover.close(COMPACT_EFFECTS_POPOVER_ID).catch(() => {}),
      OBR.popover.close(COMPACT_ADMIN_MENU_POPOVER_ID).catch(() => {}),
    ]);
  }
  const layout = getTrackerLayout();
  const compact = layout === TRACKER_LAYOUT_COMPACT;
  let viewportHeight = 900;
  let viewportWidth = 1200;
  const [nextHeight, nextWidth] = await Promise.all([
    Promise.resolve().then(() => OBR.viewport.getHeight()).catch(() => viewportHeight),
    Promise.resolve().then(() => OBR.viewport.getWidth()).catch(() => viewportWidth),
  ]);
  viewportHeight = Number(nextHeight) || viewportHeight;
  viewportWidth = Number(nextWidth) || viewportWidth;
  const preferredCompactWidth = Number(compactSize?.width)
    || getCompactTrackerManualWidth()
    || COMPACT_DEFAULT_WIDTH;
  const width = compact
    ? compactTrackerViewportWidth(
      Math.min(preferredCompactWidth, COMPACT_MAX_WIDTH),
      viewportWidth,
    )
    : 340;
  const height = compact
    ? Math.min(
      Math.max(150, Math.round(Number(compactSize?.height) || COMPACT_HEIGHT)),
      COMPACT_HEIGHT,
      Math.max(150, Math.floor(viewportHeight - 32)),
    )
    : Math.max(360, Math.floor(viewportHeight - 124));
  const compactAnchor = compactAnchorPosition(viewportWidth, viewportHeight);
  await openTrackedPopover({
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
  if (compact) {
    const [actualHeight, actualWidth] = await Promise.all([
      OBR.popover.getHeight(TRACKER_POPOVER_ID).catch(() => height),
      OBR.popover.getWidth(TRACKER_POPOVER_ID).catch(() => width),
    ]);
    await Promise.all([
      openCompactRoundTabPopover(compactAnchor, Number(actualHeight) || height),
      openCompactSpeedReadoutPopover(
        compactAnchor,
        Number(actualWidth) || width,
        Number(actualHeight) || height,
      ),
    ]);
  } else {
    await Promise.all([
      OBR.popover.close(COMPACT_ROUND_TAB_POPOVER_ID).catch(() => {}),
      OBR.popover.close(COMPACT_SPEED_READOUT_POPOVER_ID).catch(() => {}),
    ]);
  }
  localStorage.setItem(TRACKER_OPEN_KEY, "1");
}

export async function closeTrackerPopover() {
  try {
    await Promise.all([
      OBR.popover.close(TRACKER_POPOVER_ID).catch(() => {}),
      OBR.popover.close(COMPACT_ROUND_TAB_POPOVER_ID).catch(() => {}),
      OBR.popover.close(COMPACT_SPEED_READOUT_POPOVER_ID).catch(() => {}),
      OBR.popover.close(COMPACT_EFFECTS_POPOVER_ID).catch(() => {}),
      OBR.popover.close(COMPACT_ADMIN_MENU_POPOVER_ID).catch(() => {}),
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
