import OBR from "@owlbear-rodeo/sdk";
import {
  DISTANCE_3D_CHANNEL,
  loadDistanceContext,
  measureItems,
  readElevation,
} from "./distance3d.js";
import { formatDistance } from "./distance3dCore.js";

const app = document.querySelector("#app");
let context = { items: [], dpi: 1, multiplier: 1, unit: "", digits: 0 };
let originId = null;
let renderRevision = 0;
let resizeFrame = 0;
let lastRequestedHeight = 0;
let dragState = null;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function itemLabel(item) {
  return String(item?.name || "Token").trim() || "Token";
}

function unitSuffix() {
  return context.unit ? ` ${escapeHtml(context.unit)}` : "";
}

function precision() {
  return Math.max(1, context.digits || 0);
}

function elevationText(item) {
  return `${formatDistance(readElevation(item), precision())}${unitSuffix()}`;
}

function originMarkup(origin) {
  const options = context.items.map((item) => (
    `<option value="${escapeHtml(item.id)}"${item.id === origin.id ? " selected" : ""}>${escapeHtml(itemLabel(item))}</option>`
  )).join("");
  return `<section class="origin-panel">
    <label class="origin-select-label"><span>Origine</span><select data-action="origin">${options}</select></label>
    <div class="origin-elevation">Quota <b>${elevationText(origin)}</b></div>
  </section>`;
}

function targetMarkup(origin, target) {
  const result = measureItems(origin, target, context);
  const digits = precision();
  return `<article class="distance-card">
    <div class="distance-card-header">
      <strong>${escapeHtml(itemLabel(target))}</strong>
      <span class="distance-result">${formatDistance(result.spatial, digits)}${unitSuffix()}</span>
    </div>
    <div class="distance-breakdown">
      <span>Piano <b>${formatDistance(result.squares, 1)} caselle · ${formatDistance(result.horizontal, digits)}${unitSuffix()}</b></span>
      <span>Dislivello <b>${formatDistance(result.vertical, digits)}${unitSuffix()}</b></span>
      <span>Quota <b>${elevationText(target)}</b></span>
    </div>
  </article>`;
}

function requestPopoverResize() {
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => {
    const style = getComputedStyle(app);
    const padding = (Number.parseFloat(style.paddingTop) || 0) + (Number.parseFloat(style.paddingBottom) || 0);
    const gap = Number.parseFloat(style.rowGap || style.gap) || 0;
    const children = Array.from(app.children);
    const content = children.reduce((total, child) => (
      total + (child.classList.contains("distance-list") ? child.scrollHeight : child.offsetHeight)
    ), 0);
    const height = Math.ceil(padding + content + gap * Math.max(0, children.length - 1) + 2);
    if (height === lastRequestedHeight) return;
    lastRequestedHeight = height;
    void OBR.broadcast.sendMessage(
      DISTANCE_3D_CHANNEL,
      { type: "resize", height },
      { destination: "LOCAL" }
    ).catch(() => {});
  });
}

function render() {
  const ids = new Set(context.items.map((item) => item.id));
  if (!originId || !ids.has(originId)) originId = context.items[0]?.id || null;

  if (context.items.length < 2) {
    app.innerHTML = `<header class="distance-header" data-drag-handle draggable="true" title="Trascina per spostare"><strong>Distanza 3D</strong></header>
      <div class="distance-empty">
        <b>Seleziona almeno due token</b>
        <span>Imposta la quota dal menu contestuale del token, poi seleziona i token da confrontare.</span>
      </div>`;
    requestPopoverResize();
    return;
  }

  const origin = context.items.find((item) => item.id === originId) || context.items[0];
  const targets = context.items.filter((item) => item.id !== origin.id);
  app.innerHTML = `<header class="distance-header" data-drag-handle draggable="true" title="Trascina per spostare">
      <strong>Distanza 3D</strong>
    </header>
    ${originMarkup(origin)}
    <section class="distance-list">${targets.map((target) => targetMarkup(origin, target)).join("")}</section>`;
  requestPopoverResize();
}

async function refresh() {
  const revision = ++renderRevision;
  const next = await loadDistanceContext();
  if (revision !== renderRevision) return;
  context = next;
  render();
}

app.addEventListener("change", (event) => {
  const control = event.target;
  if (control?.dataset?.action === "origin") {
    originId = control.value;
    render();
  }
});

app.addEventListener("dragstart", (event) => {
  const handle = event.target.closest("[data-drag-handle]");
  if (!handle || event.target.closest("button, input, select, details")) {
    event.preventDefault();
    return;
  }
  const rect = app.getBoundingClientRect();
  dragState = { screenX: event.screenX, screenY: event.screenY };
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", "distance-3d-panel");
  event.dataTransfer.setDragImage(
    app,
    Math.max(0, event.clientX - rect.left),
    Math.max(0, event.clientY - rect.top),
  );
  handle.classList.add("is-dragging");
});

app.addEventListener("dragend", (event) => {
  if (!dragState) return;
  const deltaX = event.screenX - dragState.screenX;
  const deltaY = event.screenY - dragState.screenY;
  dragState = null;
  app.querySelector("[data-drag-handle]")?.classList.remove("is-dragging");
  if (!Number.isFinite(event.screenX) || !Number.isFinite(event.screenY)) return;
  if (Math.abs(deltaX) + Math.abs(deltaY) < 4) return;
  void OBR.broadcast.sendMessage(
    DISTANCE_3D_CHANNEL,
    { type: "drag-end", deltaX, deltaY },
    { destination: "LOCAL" },
  ).catch(() => {});
});

OBR.onReady(async () => {
  await OBR.broadcast.sendMessage(DISTANCE_3D_CHANNEL, { type: "opened" }, { destination: "LOCAL" }).catch(() => {});
  OBR.player.onChange(() => void refresh());
  OBR.scene.items.onChange(() => void refresh());
  OBR.scene.grid.onChange(() => void refresh());
  await refresh();
});

window.addEventListener("pagehide", () => {
  void OBR.broadcast.sendMessage(DISTANCE_3D_CHANNEL, { type: "closed" }, { destination: "LOCAL" }).catch(() => {});
});
