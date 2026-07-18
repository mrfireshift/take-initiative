import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import {
  CLOCKS_POPOVER_CHANNEL,
  CLOCKS_POPOVER_ID,
} from "./clocks.js";

const LEGACY_CLOCKS_ACTION_ID = `${ID}/clocks-action`;
const CLOCKS_TOOL_ID = `${ID}/clocks-tool`;
const CLOCKS_COMPACT_KEY = `${ID}/clocks-compact`;
const CLOCKS_POSITION_KEY = `${ID}/clocks-position`;
const LEGACY_CLOCKS_DRAG_PREVIEW_ID = `${ID}/clocks-drag-preview`;
let popoverOpen = false;
let toggling = false;
let resizing = false;

function isCompact() {
  return localStorage.getItem(CLOCKS_COMPACT_KEY) === "1";
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function storedPosition(fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(CLOCKS_POSITION_KEY) || "null");
    if (Number.isFinite(value?.left) && Number.isFinite(value?.top)) return value;
  } catch {}
  return fallback;
}

async function popoverOptions(positionOverride = null) {
  const compact = isCompact();
  let viewportWidth = 1200;
  let viewportHeight = 800;
  try { viewportWidth = Number(await OBR.viewport.getWidth()) || viewportWidth; } catch {}
  try { viewportHeight = Number(await OBR.viewport.getHeight()) || viewportHeight; } catch {}
  const width = compact ? 310 : 390;
  const height = Math.min(compact ? 430 : 620, Math.max(260, viewportHeight - 96));
  const fallback = { left: viewportWidth - width - 78, top: 72 };
  const requested = positionOverride || storedPosition(fallback);
  const anchorPosition = {
    left: clamp(Math.round(Number(requested.left) || fallback.left), 12, Math.max(12, viewportWidth - width - 12)),
    top: clamp(Math.round(Number(requested.top) || fallback.top), 12, Math.max(12, viewportHeight - 96)),
  };
  return {
    id: CLOCKS_POPOVER_ID,
    url: "/clocks-modal.html",
    width,
    height,
    anchorReference: "POSITION",
    anchorPosition,
    anchorOrigin: { horizontal: "LEFT", vertical: "TOP" },
    transformOrigin: { horizontal: "LEFT", vertical: "TOP" },
    disableClickAway: true,
    marginThreshold: 12,
    hidePaper: true,
  };
}

async function openClocksPopover() {
  await OBR.popover.close(CLOCKS_POPOVER_ID).catch(() => {});
  await OBR.popover.open(await popoverOptions());
  popoverOpen = true;
}

async function moveClocksPopover(deltaX, deltaY) {
  if (!popoverOpen) return;
  const options = await popoverOptions();
  const [currentWidth, currentHeight] = await Promise.all([
    OBR.popover.getWidth(CLOCKS_POPOVER_ID).catch(() => options.width),
    OBR.popover.getHeight(CLOCKS_POPOVER_ID).catch(() => options.height),
  ]);
  const requested = {
    left: options.anchorPosition.left + (Number(deltaX) || 0),
    top: options.anchorPosition.top + (Number(deltaY) || 0),
  };
  const nextOptions = await popoverOptions(requested);
  nextOptions.width = Number(currentWidth) || options.width;
  nextOptions.height = Number(currentHeight) || options.height;
  localStorage.setItem(CLOCKS_POSITION_KEY, JSON.stringify(nextOptions.anchorPosition));
  await OBR.popover.open(nextOptions);
}

async function resizeClocksPopover(width, height) {
  if (!popoverOpen || resizing) return;
  resizing = true;
  try {
    const options = await popoverOptions();
    const [currentWidth, currentHeight] = await Promise.all([
      OBR.popover.getWidth(CLOCKS_POPOVER_ID).catch(() => options.width),
      OBR.popover.getHeight(CLOCKS_POPOVER_ID).catch(() => options.height),
    ]);
    const nextWidth = Math.max(1, Math.round(Number(width) || options.width));
    const nextHeight = Math.max(1, Math.round(Number(height) || options.height));
    if (Math.abs(currentWidth - nextWidth) < 1 && Math.abs(currentHeight - nextHeight) < 1) return;
    await OBR.popover.open({
      ...options,
      width: nextWidth,
      height: nextHeight,
      hidePaper: true,
    });
  } finally {
    resizing = false;
  }
}

async function closeClocksPopover() {
  await OBR.popover.close(CLOCKS_POPOVER_ID).catch(() => {});
  popoverOpen = false;
}

async function toggleClocksPopover() {
  if (toggling) return;
  toggling = true;
  try {
    if (popoverOpen) await closeClocksPopover();
    else await openClocksPopover();
  } finally {
    toggling = false;
  }
}

OBR.onReady(async () => {
  await OBR.scene.local.deleteItems([LEGACY_CLOCKS_DRAG_PREVIEW_ID]).catch(() => {});
  OBR.broadcast.onMessage(CLOCKS_POPOVER_CHANNEL, (event) => {
    const type = event?.data?.type;
    if (type === "opened") popoverOpen = true;
    if (type === "closed") popoverOpen = false;
    if (type === "compact-change") {
      localStorage.setItem(CLOCKS_COMPACT_KEY, event.data.compact ? "1" : "0");
    }
    if (type === "resize") {
      void resizeClocksPopover(event.data.width, event.data.height);
    }
    if (type === "drag-end") {
      void moveClocksPopover(event.data.deltaX, event.data.deltaY);
    }
  });

  try { await OBR.tool.removeAction(LEGACY_CLOCKS_ACTION_ID); } catch {}
  try { await OBR.tool.remove(CLOCKS_TOOL_ID); } catch {}
  await OBR.tool.create({
    id: CLOCKS_TOOL_ID,
    icons: [{ icon: "/clock.svg", label: "Clock" }],
    onClick: () => void toggleClocksPopover(),
  });
});
