import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { POPOVER_DRAG_CHANNEL } from "./popoverDrag.js";

const POSITION_PREFIX = `${ID}/popover-position/`;
const trackedPopovers = new Map();

function positionKey(id) {
  return `${POSITION_PREFIX}${String(id || "").replaceAll("/", "_")}`;
}

function readStoredPosition(id) {
  try {
    const value = JSON.parse(localStorage.getItem(positionKey(id)) || "null");
    if (Number.isFinite(value?.left) && Number.isFinite(value?.top)) return value;
  } catch {}
  return null;
}

function isTopLeftPopover(options) {
  return options?.anchorReference === "POSITION"
    && options?.anchorOrigin?.horizontal === "LEFT"
    && options?.anchorOrigin?.vertical === "TOP"
    && Number.isFinite(options?.anchorPosition?.left)
    && Number.isFinite(options?.anchorPosition?.top);
}

function withStoredPosition(options) {
  if (!isTopLeftPopover(options)) return options;
  const stored = readStoredPosition(options.id);
  return stored ? { ...options, anchorPosition: stored } : options;
}

export async function openTrackedPopover(options) {
  const next = withStoredPosition({ ...options });
  if (isTopLeftPopover(next)) trackedPopovers.set(next.id, next);
  await OBR.popover.open(next);
}

async function moveTrackedPopover(id, deltaX, deltaY) {
  const current = trackedPopovers.get(id);
  if (!current) return;

  let viewportWidth = 1200;
  let viewportHeight = 800;
  try { viewportWidth = Number(await OBR.viewport.getWidth()) || viewportWidth; } catch {}
  try { viewportHeight = Number(await OBR.viewport.getHeight()) || viewportHeight; } catch {}
  const width = Number(await OBR.popover.getWidth(id).catch(() => current.width)) || current.width;
  const height = Number(await OBR.popover.getHeight(id).catch(() => current.height)) || current.height;
  const left = Math.max(12, Math.min(
    current.anchorPosition.left + (Number(deltaX) || 0),
    Math.max(12, viewportWidth - width - 12),
  ));
  const top = Math.max(12, Math.min(
    current.anchorPosition.top + (Number(deltaY) || 0),
    Math.max(12, viewportHeight - height - 12),
  ));
  const next = { ...current, width, height, anchorPosition: { left, top } };
  trackedPopovers.set(id, next);
  localStorage.setItem(positionKey(id), JSON.stringify(next.anchorPosition));
  await OBR.popover.open(next);
}

OBR.onReady(() => {
  OBR.broadcast.onMessage(POPOVER_DRAG_CHANNEL, (event) => {
    const data = event?.data;
    if (data?.type !== "drag-end" || !data.id) return;
    void moveTrackedPopover(data.id, data.deltaX, data.deltaY);
  });
});
