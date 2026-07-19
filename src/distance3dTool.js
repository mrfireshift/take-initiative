import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import {
  DISTANCE_3D_CHANNEL,
  DISTANCE_3D_POPOVER_ID,
} from "./distance3d.js";

const DISTANCE_3D_TOOL_ID = `${ID}/distance-3d-tool`;
const DISTANCE_3D_POSITION_KEY = `${ID}/distance-3d-position`;
let popoverOpen = false;
let toggling = false;

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

function storedPosition(fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(DISTANCE_3D_POSITION_KEY));
    if (Number.isFinite(value?.left) && Number.isFinite(value?.top)) return value;
  } catch {}
  return fallback;
}

async function popoverOptions(positionOverride = null) {
  const width = 420;
  let viewportWidth = 1200;
  let viewportHeight = 800;
  try { viewportWidth = Number(await OBR.viewport.getWidth()) || viewportWidth; } catch {}
  try { viewportHeight = Number(await OBR.viewport.getHeight()) || viewportHeight; } catch {}
  const height = Math.min(260, Math.max(190, viewportHeight - 96));
  const fallback = {
    left: Math.max(12, viewportWidth - width - 78),
    top: Math.max(12, Math.round((viewportHeight - height) / 2)),
  };
  const requested = positionOverride || storedPosition(fallback);
  const position = {
    left: clamp(Number(requested.left) || fallback.left, 12, viewportWidth - width - 12),
    top: clamp(Number(requested.top) || fallback.top, 12, viewportHeight - height - 12),
  };
  return {
    id: DISTANCE_3D_POPOVER_ID,
    url: "/distance-3d-modal.html",
    width,
    height,
    anchorReference: "POSITION",
    anchorPosition: position,
    anchorOrigin: { horizontal: "LEFT", vertical: "TOP" },
    transformOrigin: { horizontal: "LEFT", vertical: "TOP" },
    disableClickAway: true,
    marginThreshold: 12,
    hidePaper: true,
  };
}

async function movePopover(deltaX, deltaY) {
  if (!popoverOpen) return;
  const options = await popoverOptions();
  let width = options.width;
  let height = options.height;
  try { width = Number(await OBR.popover.getWidth(DISTANCE_3D_POPOVER_ID)) || width; } catch {}
  try { height = Number(await OBR.popover.getHeight(DISTANCE_3D_POPOVER_ID)) || height; } catch {}
  const requested = {
    left: options.anchorPosition.left + (Number(deltaX) || 0),
    top: options.anchorPosition.top + (Number(deltaY) || 0),
  };
  const nextOptions = await popoverOptions(requested);
  nextOptions.width = width;
  nextOptions.height = height;
  localStorage.setItem(DISTANCE_3D_POSITION_KEY, JSON.stringify(nextOptions.anchorPosition));
  await OBR.popover.open(nextOptions);
}

async function resizePopover(requestedHeight) {
  if (!popoverOpen) return;
  let viewportHeight = 800;
  try { viewportHeight = Number(await OBR.viewport.getHeight()) || viewportHeight; } catch {}
  const height = Math.max(170, Math.min(520, viewportHeight - 96, Math.ceil(Number(requestedHeight) || 0)));
  await OBR.popover.setHeight(DISTANCE_3D_POPOVER_ID, height).catch(() => {});
}

async function togglePopover() {
  if (toggling) return;
  toggling = true;
  try {
    if (popoverOpen) {
      await OBR.popover.close(DISTANCE_3D_POPOVER_ID).catch(() => {});
      popoverOpen = false;
    } else {
      await OBR.popover.open(await popoverOptions());
      popoverOpen = true;
    }
  } finally {
    toggling = false;
  }
}

OBR.onReady(async () => {
  if (await OBR.player.getRole() !== "GM") return;

  OBR.broadcast.onMessage(DISTANCE_3D_CHANNEL, (event) => {
    if (event?.data?.type === "opened") popoverOpen = true;
    if (event?.data?.type === "closed") popoverOpen = false;
    if (event?.data?.type === "resize") void resizePopover(event.data.height);
    if (event?.data?.type === "drag-end") void movePopover(event.data.deltaX, event.data.deltaY);
  });

  try { await OBR.tool.remove(DISTANCE_3D_TOOL_ID); } catch {}
  await OBR.tool.create({
    id: DISTANCE_3D_TOOL_ID,
    icons: [{ icon: "/distance-3d.svg", label: "Distanza 3D" }],
    onClick: () => void togglePopover(),
  });
});
