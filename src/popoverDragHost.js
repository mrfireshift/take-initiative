import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { POPOVER_DRAG_CHANNEL } from "./popoverDrag.js";

const POSITION_PREFIX = `${ID}/popover-position/`;
const trackedPopovers = new Map();
// What the other iframes opened. The one that opened a popover may close while the popover stays open (the spell panel, a
// console, the ⚡ menu): a drag would find nobody, so whoever is still there takes it over.
const standbyPopovers = new Map();
const MAX_STANDBY_POPOVERS = 40;
const takeOvers = new Map();
const TAKE_OVER_MS = 150;
let answeredDragId = "";
// This iframe, among the ones that open tracked popovers (the tracker, the background, …).
const HOST_ID = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

function tellOthers(message) {
  void Promise.resolve()
    .then(() => OBR.broadcast.sendMessage(POPOVER_DRAG_CHANNEL, { ...message, hostId: HOST_ID }, { destination: "LOCAL" }))
    .catch(() => {});
}

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
  // The tracker keeps its own placement (side and distance): never a stale generic position.
  if (!isTopLeftPopover(options) || options.id === `${ID}/tracker-popover`) return options;
  const stored = readStoredPosition(options.id);
  return stored ? { ...options, anchorPosition: stored } : options;
}

export async function openTrackedPopover(options) {
  const next = withStoredPosition({ ...options });
  if (isTopLeftPopover(next)) {
    trackedPopovers.set(next.id, next);
    // Only the last iframe that opened a popover moves it: the others forget it (no drag applied twice).
    tellOthers({ type: "claim", id: next.id });
    tellOthers({ type: "standby", id: next.id, options: next });
  }
  await OBR.popover.open(next);
}

async function moveTrackedPopover(id, deltaX, deltaY) {
  const current = trackedPopovers.get(id);
  if (!current) return;

  // The four reads in one round trip, each with its own fallback as before.
  const read = (call, fallback) => Promise.resolve().then(call).catch(() => fallback);
  const [rawViewportWidth, rawViewportHeight, rawWidth, rawHeight] = await Promise.all([
    read(() => OBR.viewport.getWidth(), null),
    read(() => OBR.viewport.getHeight(), null),
    read(() => OBR.popover.getWidth(id), current.width),
    read(() => OBR.popover.getHeight(id), current.height),
  ]);
  const viewportWidth = Number(rawViewportWidth) || 1200;
  const viewportHeight = Number(rawViewportHeight) || 800;
  const width = Number(rawWidth) || current.width;
  const height = Number(rawHeight) || current.height;
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
  tellOthers({ type: "standby", id, options: next });
  await OBR.popover.open(next);
}

function cancelTakeOver(id) {
  clearTimeout(takeOvers.get(id));
  takeOvers.delete(id);
}

function handleDragEnd({ id, dragId, deltaX, deltaY }) {
  if (trackedPopovers.has(id)) {
    tellOthers({ type: "drag-answered", id, dragId });
    void moveTrackedPopover(id, deltaX, deltaY);
    return;
  }
  // The iframe that owns it answers at once. If it does not, it has closed: one of those still here moves it, and owns it from
  // now on. Waiting a different time each, the first to move stops the others.
  if (!standbyPopovers.has(id) || takeOvers.has(id) || (dragId && dragId === answeredDragId)) return;
  takeOvers.set(id, setTimeout(() => {
    takeOvers.delete(id);
    trackedPopovers.set(id, standbyPopovers.get(id));
    tellOthers({ type: "claim", id });
    tellOthers({ type: "drag-answered", id, dragId });
    void moveTrackedPopover(id, deltaX, deltaY);
  }, TAKE_OVER_MS + Math.random() * TAKE_OVER_MS));
}

OBR.onReady(() => {
  OBR.broadcast.onMessage(POPOVER_DRAG_CHANNEL, (event) => {
    const data = event?.data;
    if (data?.type === "claim" && data.id) {
      if (data.hostId !== HOST_ID) {
        trackedPopovers.delete(data.id);
        cancelTakeOver(data.id);
      }
      return;
    }
    if (data?.type === "standby" && data.id) {
      if (data.hostId !== HOST_ID) {
        standbyPopovers.delete(data.id);
        standbyPopovers.set(data.id, data.options);
        if (standbyPopovers.size > MAX_STANDBY_POPOVERS) standbyPopovers.delete(standbyPopovers.keys().next().value);
      }
      return;
    }
    if (data?.type === "drag-answered" && data.id) {
      answeredDragId = data.dragId;
      if (data.hostId !== HOST_ID) cancelTakeOver(data.id);
      return;
    }
    if (data?.type !== "drag-end" || !data.id) return;
    handleDragEnd(data);
  });
});
