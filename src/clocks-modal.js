import OBR from "@owlbear-rodeo/sdk";
import {
  CLOCKS_POPOVER_CHANNEL,
  CLOCKS_POPOVER_ID,
  CLOCKS_KEY,
  loadClocksState,
  updateClocksState,
} from "./clocks.js";
import {
  CLOCK_COLOR_OPTIONS,
  CLOCK_SEGMENT_OPTIONS,
  moveClock,
  normalizeClocksState,
} from "./clocksCore.js";

const COMPACT_KEY = "com.thebigpicture.initiative/clocks-compact";
const app = document.querySelector("#app");
let state = normalizeClocksState(null);
let isGM = false;
let compact = localStorage.getItem(COMPACT_KEY) === "1";
let renderQueued = false;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function clockId() {
  return globalThis.crypto?.randomUUID?.() || `clock-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function polar(cx, cy, radius, angle) {
  const radians = (angle - 90) * Math.PI / 180;
  return { x: cx + radius * Math.cos(radians), y: cy + radius * Math.sin(radians) };
}

function segmentPath(index, total) {
  const gap = Math.min(3.2, 13 / total);
  const start = (index * 360 / total) + gap;
  const end = ((index + 1) * 360 / total) - gap;
  const outerStart = polar(40, 40, 35, start);
  const outerEnd = polar(40, 40, 35, end);
  const innerEnd = polar(40, 40, 18, end);
  const innerStart = polar(40, 40, 18, start);
  return `M ${outerStart.x} ${outerStart.y} A 35 35 0 0 1 ${outerEnd.x} ${outerEnd.y} L ${innerEnd.x} ${innerEnd.y} A 18 18 0 0 0 ${innerStart.x} ${innerStart.y} Z`;
}

function ringMarkup(clock) {
  const paths = Array.from({ length: clock.segments }, (_, index) => {
    const active = index < clock.value;
    return `<path d="${segmentPath(index, clock.segments)}" fill="${active ? clock.color : "rgba(255,255,255,.10)"}" stroke="${active ? clock.color : "rgba(255,255,255,.18)"}" stroke-width="1"/>`;
  }).join("");
  return `<div class="clock-ring-wrap"><svg class="clock-ring" viewBox="0 0 80 80" aria-hidden="true">${paths}<circle cx="40" cy="40" r="14" fill="rgba(4,8,16,.82)" stroke="rgba(255,255,255,.12)"/></svg><span class="clock-ring-value">${clock.value}/${clock.segments}</span></div>`;
}

function colorsMarkup(selected, id = "new") {
  return CLOCK_COLOR_OPTIONS.map((color) => (
    `<button type="button" class="color-choice" style="--choice-color:${color}" data-action="color" data-id="${escapeHtml(id)}" data-color="${color}" aria-pressed="${color === selected}" aria-label="Colore ${color}"></button>`
  )).join("");
}

function createMarkup() {
  if (!isGM || compact) return "";
  return `<form class="clock-create" data-create-form>
    <input class="clock-input" name="name" maxlength="60" placeholder="Nome del clock" aria-label="Nome del clock" required />
    <select class="clock-select" name="segments" aria-label="Segmenti">${CLOCK_SEGMENT_OPTIONS.map((value) => `<option value="${value}"${value === 6 ? " selected" : ""}>${value}</option>`).join("")}</select>
    <button class="primary-button" type="submit">Crea</button>
    <div class="clock-color-row"><span class="field-label">Colore</span>${colorsMarkup(CLOCK_COLOR_OPTIONS[0])}</div>
    <input type="hidden" name="color" value="${CLOCK_COLOR_OPTIONS[0]}" />
  </form>`;
}

function settingsMarkup(clock, index) {
  if (!isGM || compact) return "";
  return `<details class="clock-settings">
    <summary>••• Gestisci</summary>
    <div class="clock-settings-grid">
      <input class="clock-input" data-field="name" data-id="${escapeHtml(clock.id)}" maxlength="60" value="${escapeHtml(clock.name)}" aria-label="Nome" />
      <select class="clock-select" data-field="segments" data-id="${escapeHtml(clock.id)}" aria-label="Segmenti">${CLOCK_SEGMENT_OPTIONS.map((value) => `<option value="${value}"${value === clock.segments ? " selected" : ""}>${value}</option>`).join("")}</select>
      <div class="clock-card-colors">${colorsMarkup(clock.color, clock.id)}</div>
      <div class="clock-settings-actions">
        <button type="button" class="quiet-button" data-action="visibility" data-id="${escapeHtml(clock.id)}">${clock.visible ? "Nascondi ai player" : "Mostra ai player"}</button>
        <button type="button" class="quiet-button" data-action="reset" data-id="${escapeHtml(clock.id)}">Azzera</button>
        <button type="button" class="quiet-button" data-action="move-up" data-id="${escapeHtml(clock.id)}" ${index === 0 ? "disabled" : ""}>↑</button>
        <button type="button" class="quiet-button" data-action="move-down" data-id="${escapeHtml(clock.id)}" ${index === state.clocks.length - 1 ? "disabled" : ""}>↓</button>
        <button type="button" class="quiet-button danger" data-action="delete" data-id="${escapeHtml(clock.id)}">Elimina</button>
      </div>
    </div>
  </details>`;
}

function cardMarkup(clock, index) {
  const percent = Math.round(clock.value / clock.segments * 100);
  return `<article class="clock-card${clock.visible ? "" : " is-hidden"}${clock.value === clock.segments ? " is-complete" : ""}" style="--clock-color:${clock.color};--clock-percent:${percent}%" data-clock-id="${escapeHtml(clock.id)}">
    ${ringMarkup(clock)}
    <div class="clock-main">
      <div class="clock-summary">
        <span class="clock-name" title="${escapeHtml(clock.name)}">${escapeHtml(clock.name)}</span>
        ${!clock.visible && isGM ? '<span class="visibility-pill">Solo GM</span>' : ""}
        <span class="clock-progress">${percent}%</span>
      </div>
      <div class="clock-controls">
        ${isGM ? `<button type="button" class="step-button" data-action="decrement" data-id="${escapeHtml(clock.id)}" aria-label="Arretra ${escapeHtml(clock.name)}">−</button>` : ""}
        <div class="clock-meter" aria-hidden="true"><span></span></div>
        ${isGM ? `<button type="button" class="step-button increment" data-action="increment" data-id="${escapeHtml(clock.id)}" aria-label="Avanza ${escapeHtml(clock.name)}">+</button>` : ""}
      </div>
    </div>
    ${settingsMarkup(clock, index)}
  </article>`;
}

async function resizePopover() {
  let viewportHeight = 800;
  try { viewportHeight = Number(await OBR.viewport.getHeight()) || viewportHeight; } catch {}
  const shellStyle = getComputedStyle(app);
  const header = app.querySelector(".clock-header");
  const list = app.querySelector(".clock-list");
  const measuredCompactHeight = Math.ceil(
    (parseFloat(shellStyle.paddingTop) || 0) +
    (parseFloat(shellStyle.paddingBottom) || 0) +
    (parseFloat(shellStyle.borderTopWidth) || 0) +
    (parseFloat(shellStyle.borderBottomWidth) || 0) +
    (parseFloat(shellStyle.rowGap) || 0) +
    (header?.offsetHeight || 0) +
    (list?.scrollHeight || 0)
  );
  const height = compact
    ? Math.min(Math.max(54, measuredCompactHeight), Math.max(120, viewportHeight - 24))
    : Math.min(620, Math.max(320, viewportHeight - 96));
  await OBR.broadcast.sendMessage(CLOCKS_POPOVER_CHANNEL, {
    type: "resize",
    width: compact ? 310 : 390,
    height,
  }, { destination: "LOCAL" }).catch(() => {});
}

function render() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    document.body.dataset.compact = String(compact);
    document.body.dataset.player = String(!isGM);
    const visibleClocks = isGM ? state.clocks : state.clocks.filter((clock) => clock.visible);
    app.innerHTML = `<header class="clock-header" data-drag-handle draggable="true" title="Trascina per spostare">
      <span class="clock-header-spacer"></span>
      <button type="button" class="icon-button" data-action="toggle-compact" aria-label="${compact ? "Espandi" : "Compatta"}" title="${compact ? "Espandi" : "Compatta"}">${compact ? "+" : "−"}</button>
    </header>
    ${createMarkup()}
    <section class="clock-list">
      ${visibleClocks.length ? visibleClocks.map((clock) => cardMarkup(clock, state.clocks.findIndex((entry) => entry.id === clock.id))).join("") : `<div class="clock-empty">${isGM ? "Crea il primo clock per questa scena." : "Nessun clock visibile in questa scena."}</div>`}
    </section>`;
    void resizePopover();
  });
}

async function mutateClock(id, updater) {
  state = await updateClocksState((current) => ({
    ...current,
    clocks: current.clocks.map((clock) => clock.id === id
      ? { ...clock, ...updater(clock), updatedAt: Date.now() }
      : clock),
  }));
  render();
}

async function handleAction(button) {
  const action = button.dataset.action;
  const id = button.dataset.id;
  if (action === "toggle-compact") {
    compact = !compact;
    localStorage.setItem(COMPACT_KEY, compact ? "1" : "0");
    await OBR.broadcast.sendMessage(CLOCKS_POPOVER_CHANNEL, { type: "compact-change", compact }, { destination: "LOCAL" }).catch(() => {});
    render();
    return;
  }
  if (action === "color" && id === "new") return;
  if (!isGM || !id) return;
  if (action === "increment") await mutateClock(id, (clock) => ({ value: Math.min(clock.segments, clock.value + 1) }));
  if (action === "decrement") await mutateClock(id, (clock) => ({ value: Math.max(0, clock.value - 1) }));
  if (action === "reset") await mutateClock(id, () => ({ value: 0 }));
  if (action === "visibility") await mutateClock(id, (clock) => ({ visible: !clock.visible }));
  if (action === "color") await mutateClock(id, () => ({ color: button.dataset.color }));
  if (action === "move-up" || action === "move-down") {
    state = await updateClocksState((current) => ({ ...current, clocks: moveClock(current.clocks, id, action === "move-up" ? -1 : 1) }));
    render();
  }
  if (action === "delete") {
    if (button.dataset.confirm !== "1") {
      button.dataset.confirm = "1";
      button.textContent = "Conferma";
      window.setTimeout(() => {
        if (button.isConnected) {
          button.dataset.confirm = "0";
          button.textContent = "Elimina";
        }
      }, 2500);
      return;
    }
    state = await updateClocksState((current) => ({ ...current, clocks: current.clocks.filter((clock) => clock.id !== id) }));
    render();
  }
}

app.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (button) void handleAction(button);
});

app.addEventListener("submit", async (event) => {
  const form = event.target.closest("[data-create-form]");
  if (!form || !isGM) return;
  event.preventDefault();
  const data = new FormData(form);
  const now = Date.now();
  const newClock = {
    id: clockId(),
    name: String(data.get("name") || "Nuovo clock"),
    segments: Number(data.get("segments")) || 6,
    value: 0,
    color: String(data.get("color") || CLOCK_COLOR_OPTIONS[0]),
    visible: true,
    createdAt: now,
    updatedAt: now,
  };
  state = await updateClocksState((current) => ({ ...current, clocks: [...current.clocks, newClock] }));
  render();
});

app.addEventListener("click", (event) => {
  const color = event.target.closest(".clock-create .color-choice");
  if (!color) return;
  const form = color.closest("form");
  form.elements.color.value = color.dataset.color;
  form.querySelectorAll(".color-choice").forEach((choice) => choice.setAttribute("aria-pressed", String(choice === color)));
});

app.addEventListener("change", async (event) => {
  const control = event.target.closest("[data-field][data-id]");
  if (!control || !isGM) return;
  const id = control.dataset.id;
  if (control.dataset.field === "name") {
    await mutateClock(id, () => ({ name: control.value }));
  }
  if (control.dataset.field === "segments") {
    const segments = Number(control.value);
    await mutateClock(id, (clock) => ({ segments, value: Math.min(segments, clock.value) }));
  }
});

let dragState = null;

function dragDelta(event) {
  if (!dragState) return { deltaX: 0, deltaY: 0 };
  return {
    deltaX: event.screenX - dragState.screenX,
    deltaY: event.screenY - dragState.screenY,
  };
}

app.addEventListener("dragstart", (event) => {
  const handle = event.target.closest("[data-drag-handle]");
  if (!handle || event.target.closest("button, input, select, details")) {
    event.preventDefault();
    return;
  }
  const rect = app.getBoundingClientRect();
  dragState = { screenX: event.screenX, screenY: event.screenY };
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", "clock-panel");
  event.dataTransfer.setDragImage(
    app,
    Math.max(0, event.clientX - rect.left),
    Math.max(0, event.clientY - rect.top),
  );
  handle.classList.add("is-dragging");
});

app.addEventListener("dragend", (event) => {
  if (!dragState) return;
  const delta = dragDelta(event);
  dragState = null;
  app.querySelector("[data-drag-handle]")?.classList.remove("is-dragging");
  if (!Number.isFinite(event.screenX) || !Number.isFinite(event.screenY)) return;
  if (Math.abs(delta.deltaX) + Math.abs(delta.deltaY) < 4) return;
  void OBR.broadcast.sendMessage(CLOCKS_POPOVER_CHANNEL, { type: "drag-end", ...delta }, { destination: "LOCAL" }).catch(() => {});
});

OBR.onReady(async () => {
  isGM = await OBR.player.getRole().then((role) => role === "GM").catch(() => false);
  state = await loadClocksState();
  render();
  await OBR.broadcast.sendMessage(CLOCKS_POPOVER_CHANNEL, { type: "opened" }, { destination: "LOCAL" }).catch(() => {});

  OBR.scene.onMetadataChange((metadata) => {
    state = normalizeClocksState(metadata?.[CLOCKS_KEY]);
    render();
  });
  OBR.scene.onReadyChange(async (ready) => {
    if (!ready) return;
    state = await loadClocksState();
    render();
  });
});

window.addEventListener("pagehide", () => {
  void OBR.broadcast.sendMessage(CLOCKS_POPOVER_CHANNEL, { type: "closed" }, { destination: "LOCAL" }).catch(() => {});
});
