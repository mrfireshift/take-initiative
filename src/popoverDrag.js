import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";

export const POPOVER_DRAG_CHANNEL = `${ID}/popover-drag`;

function pointerCoordinate(event, primary, fallback) {
  const first = Number(event?.[primary]);
  if (Number.isFinite(first)) return first;
  const second = Number(event?.[fallback]);
  return Number.isFinite(second) ? second : null;
}

export function initializePopoverDrag(popoverRoot = document.querySelector("[data-popover-id]")) {
  const root = popoverRoot;
  if (!root || root.dataset.popoverDragReady === "1") return;
  root.dataset.popoverDragReady = "1";

  const findDragHandle = () => root.querySelector("[data-drag-handle], header, .header, h1, .title") || null;
  const markDragHandle = () => {
    const handle = findDragHandle();
    if (!handle) return;
    handle.dataset.dragHandle = "1";
    handle.draggable = true;
    if (!handle.title) handle.title = "Trascina per spostare";
  };

  let dragState = null;
  markDragHandle();

  const observer = new MutationObserver(markDragHandle);
  observer.observe(root, { childList: true, subtree: true });

  root.addEventListener("dragstart", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const handle = target?.closest("[data-drag-handle]");
    if (!handle || !root.contains(handle) || target.closest("button, input, select, textarea, details, [contenteditable='true']")) {
      event.preventDefault();
      return;
    }
    const startX = pointerCoordinate(event, "clientX", "screenX");
    const startY = pointerCoordinate(event, "clientY", "screenY");
    const rect = root.getBoundingClientRect();
    dragState = { startX, startY, handle };
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", root.dataset.popoverId);
    event.dataTransfer.setDragImage(
      root,
      Math.max(0, event.clientX - rect.left),
      Math.max(0, event.clientY - rect.top),
    );
    handle.classList.add("is-dragging");
  });

  root.addEventListener("dragend", (event) => {
    if (!dragState) return;
    const state = dragState;
    dragState = null;
    state.handle.classList.remove("is-dragging");
    const endX = pointerCoordinate(event, "clientX", "screenX");
    const endY = pointerCoordinate(event, "clientY", "screenY");
    if (!Number.isFinite(endX) || !Number.isFinite(endY)) return;
    const deltaX = endX - state.startX;
    const deltaY = endY - state.startY;
    if (Math.abs(deltaX) + Math.abs(deltaY) < 4) return;
    void OBR.broadcast.sendMessage(POPOVER_DRAG_CHANNEL, {
      type: "drag-end",
      id: root.dataset.popoverId,
      deltaX,
      deltaY,
    }, { destination: "LOCAL" }).catch(() => {});
  });
}

initializePopoverDrag();
