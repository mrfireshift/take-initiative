import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";

export const TRACKER_POPOVER_ID = `${ID}/tracker-popover`;
const TRACKER_OPEN_KEY = `${ID}/tracker-popover-open`;

export function isTrackerPopoverOpen() {
  return localStorage.getItem(TRACKER_OPEN_KEY) === "1";
}

export async function openTrackerPopover({ refresh = false } = {}) {
  if (isTrackerPopoverOpen() && !refresh) return;
  if (refresh) {
    try { await OBR.popover.close(TRACKER_POPOVER_ID); } catch {}
  }
  let viewportHeight = 900;
  try { viewportHeight = Number(await OBR.viewport.getHeight()) || viewportHeight; } catch {}
  const height = Math.max(360, Math.floor(viewportHeight - 124));
  await OBR.popover.open({
    id: TRACKER_POPOVER_ID,
    url: "/?surface=tracker",
    width: 340,
    height,
    anchorReference: "POSITION",
    anchorPosition: { left: 22, top: 52 },
    anchorOrigin: { horizontal: "LEFT", vertical: "TOP" },
    transformOrigin: { horizontal: "LEFT", vertical: "TOP" },
    disableClickAway: true,
    marginThreshold: 12,
    hidePaper: true,
  });
  localStorage.setItem(TRACKER_OPEN_KEY, "1");
}

export async function closeTrackerPopover() {
  try {
    await OBR.popover.close(TRACKER_POPOVER_ID);
  } finally {
    localStorage.setItem(TRACKER_OPEN_KEY, "0");
  }
}

export async function setTrackerPopoverOpen(open, options) {
  if (open) await openTrackerPopover(options);
  else await closeTrackerPopover();
}