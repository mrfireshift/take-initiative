// Preview host for test-support/boss-actions-browser/frame.html: plays the Owlbear canvas + background iframe with a simulated SDK.
import OBR, { fakeHost } from "@owlbear-rodeo/sdk";
import { markSceneEpochReady } from "/src/sceneEpoch.js";
import { mountEffectsMutationCoordinatorService } from "/src/effectsMutations.js";
import { mountHistoryOwner } from "/src/historyOwner.js";
import { undoLastHistoryEntry } from "/src/history.js";
import { importBossActionHTML } from "/src/bossActionProfileCore.js";
import { createBossActionProfileStore } from "/src/bossActionProfileStore.js";
import { createBossActionRuntime } from "/src/bossActionExecution.js";
import { openBossActionsPopover } from "/src/bossActionsLauncher.js";
import "/src/popoverDragHost.js";
import { SPELL_AREA_PLACEMENT_CHANNEL } from "/src/spellAreaPlacementCore.js";
import { buildConeArea, buildCircleArea, buildFootprintEmanationArea, buildLineArea, areaHitsBounds } from "/src/aoeGeometryCore.js";
import { constrainedSpellAreaEnd } from "/src/spellAreaPlacementCore.js";
import { getSpellAreaRuleById } from "/src/spellAreaRules.js";

const META = "com.thebigpicture.initiative/meta";
const STATE = "com.thebigpicture.initiative/state";
const params = new URLSearchParams(location.search);
const phase = params.get("phase") === "3" ? 3 : 2;
// ?boss=shothragoth loads the second epic boss on the same token (the scene stays Auril's).
const fixtureName = params.get("boss") === "shothragoth" ? "shothragoth.html" : `auril-phase-${phase}.html`;
const scenario = params.get("scenario") || "";
const map = document.getElementById("map");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const creature = (id, name, hp, hpMax, x, y, size, color, extra = {}) => ({
  id, name, type: "IMAGE", layer: "CHARACTER", position: { x, y }, visible: true,
  metadata: { [META]: { hp, hpMax, inInitiative: true, ...extra } }, preview: { size, color },
});
const seed = [
  creature("auril", "Auril", 580, 580, 760, 250, 150, "#7c3aed", { epic: true }),
  creature("dars", "Dars", 60, 60, 960, 560, 70, "#b45309", { attitude: "pc", initiativeCard: { damageDefenses: { immunities: [], resistances: ["cold"], vulnerabilities: [] } } }),
  creature("mira", "Mira", 45, 45, 640, 600, 70, "#0e7490", { attitude: "pc" }),
  creature("sera", "Sera", 38, 38, 1100, 400, 70, "#be123c", { attitude: "pc", initiativeCard: { damageDefenses: { immunities: [], resistances: ["cold"], vulnerabilities: [] } } }),
  creature("goblin-a", "Goblin", 7, 7, 1200, 640, 56, "#4d7c0f"),
  creature("goblin-b", "Goblin", 7, 7, 1290, 560, 56, "#4d7c0f"),
  { id: "auril-hpbar", name: "HP bar", type: "SHAPE", layer: "ATTACHMENT", attachedTo: "auril", position: { x: 760, y: 160 }, metadata: {} },
];

// Areas kept on the map by the tool (keepOnMap: the seam of Cucitura del Non-Luogo).
const keptLayer = document.createElementNS("http://www.w3.org/2000/svg", "svg");
keptLayer.setAttribute("style", "position:absolute;inset:0;width:100%;height:100%;pointer-events:none");
function renderKept() {
  keptLayer.replaceChildren();
  for (const item of fakeHost.state.items.filter((entry) => entry.keptArea)) {
    for (const cell of item.keptArea.cells) {
      const rect = document.createElementNS(keptLayer.namespaceURI, "rect");
      Object.entries({ x: cell.x, y: cell.y, width: cell.width, height: cell.height, fill: "rgba(10,4,30,.85)", stroke: "rgba(196,181,253,.9)", "data-kept": item.id })
        .forEach(([k, v]) => rect.setAttribute(k, v));
      keptLayer.appendChild(rect);
    }
  }
}
function renderMap() {
  map.replaceChildren();
  if (!keptLayer.isConnected) document.body.insertBefore(keptLayer, map.nextSibling);
  renderKept();
  for (const item of fakeHost.state.items) {
    if (!item.preview) continue;
    const meta = item.metadata[META] || {};
    const token = document.createElement("div");
    token.className = "token" + (fakeHost.state.selection.includes(item.id) ? " selected" : "");
    Object.assign(token.style, { left: item.position.x - item.preview.size / 2 + "px", top: item.position.y - item.preview.size / 2 + "px", width: item.preview.size + "px", height: item.preview.size + "px", background: item.preview.color });
    token.textContent = item.name.slice(0, 2);
    const label = document.createElement("span"); label.className = "label"; label.textContent = `${item.name} · ${meta.hp}/${meta.hpMax}`;
    const hp = document.createElement("span"); hp.className = "hp"; const fill = document.createElement("i"); fill.style.width = Math.max(0, Math.min(100, (meta.hp / meta.hpMax) * 100)) + "%"; hp.appendChild(fill);
    token.append(hp, label);
    token.addEventListener("click", (event) => {
      event.stopPropagation();
      const current = fakeHost.state.selection;
      fakeHost.setSelection(event.shiftKey ? (current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id]) : [item.id]);
    });
    map.appendChild(token);
  }
  document.getElementById("round").textContent = "Round " + (fakeHost.state.sceneMetadata[STATE]?.round ?? "-");
}
map.addEventListener("click", (event) => { if (placement) placementClick(event); else fakeHost.setSelection([]); });

// ---- simulated shared area tool: same geometry and hit test as aoeTargetTool, drawn on a 70 px grid ----
const GRID = 70;
fakeHost.state.gridDpi = GRID; // the boss console measures "within 10 ft" on the same 70 px grid
let placement = null;
const overlay = document.createElementNS("http://www.w3.org/2000/svg", "svg");
overlay.setAttribute("style", "position:absolute;inset:0;width:100%;height:100%;pointer-events:none");
document.body.appendChild(overlay);
const toolbar = document.getElementById("toolbar");
const confirmButton = Object.assign(document.createElement("button"), { type: "button", textContent: "Conferma sagoma", hidden: true });
const cancelButton = Object.assign(document.createElement("button"), { type: "button", textContent: "Annulla sagoma", hidden: true });
toolbar.append(confirmButton, cancelButton);
function coneFor(origin, toward) {
  const rule = getSpellAreaRuleById(placement.ruleId);
  const cells = Math.round(rule.geometry.size.value / 1.5);
  const dx = toward.x - origin.x, dy = toward.y - origin.y, length = Math.hypot(dx, dy) || 1;
  const end = { x: origin.x + (dx / length) * cells * GRID, y: origin.y + (dy / length) * cells * GRID };
  return { end, area: buildConeArea(origin, end, GRID, { x: 0, y: 0 }) };
}
// Circle: one click on the centre. Emanation: centred on the caster token as soon as the tool starts.
function circleFor(rawCentre, footprint = null) {
  // Like the real tool, a circle is centred on a grid intersection.
  const centre = { x: Math.round(rawCentre.x / GRID) * GRID, y: Math.round(rawCentre.y / GRID) * GRID };
  placement.origin = centre;
  const rule = getSpellAreaRuleById(placement.ruleId);
  const cells = Math.round(rule.geometry.size.value / 1.5);
  const end = { x: centre.x + cells * GRID, y: centre.y };
  // An emanation radiates from the cells the boss token occupies (as the real tool does).
  return { end, area: footprint ? buildFootprintEmanationArea(centre, footprint, cells, GRID, { x: 0, y: 0 }) : buildCircleArea(centre, end, GRID) };
}
const placementShape = () => getSpellAreaRuleById(placement.ruleId)?.geometry.shape;
function lineFor(origin, toward) {
  const rule = getSpellAreaRuleById(placement.ruleId);
  const sizeCells = Math.round(rule.geometry.size.value / 1.5), widthCells = Math.round(rule.geometry.width.value / 1.5);
  const end = placement.preset ? placement.preset.end : constrainedSpellAreaEnd({ shape: "line", start: origin, pointer: toward, dpi: GRID, sizeCells, upTo: rule.geometry.lengthUpTo === true });
  // The grid corner next to the start, like the real tool (the cell scan runs around it).
  return { end, area: buildLineArea(origin, end, GRID, { x: Math.floor(origin.x / GRID) * GRID, y: Math.floor(origin.y / GRID) * GRID }, widthCells) };
}
function svgNode(tag, attributes) {
  const element = document.createElementNS(overlay.namespaceURI, tag);
  Object.entries(attributes).forEach(([k, v]) => element.setAttribute(k, v));
  return overlay.appendChild(element);
}
function drawShape(shape, label = "") {
  if (!shape?.origin) return;
  svgNode("circle", { cx: shape.origin.x, cy: shape.origin.y, r: 6, fill: "#93c5fd" });
  if (!shape.area) return;
  // Same palettes as the area tool: frost (Auril's areas, requested by the console) or the arcane default.
  const frost = placement?.theme === "frost";
  for (const cell of shape.area.cells) {
    const voidTheme = placement?.theme === "void";
    svgNode("rect", { x: cell.x, y: cell.y, width: cell.width, height: cell.height, fill: frost ? "rgba(125,211,252,.28)" : voidTheme ? "rgba(46,16,101,.45)" : "rgba(96,165,250,.22)",
      stroke: frost ? "rgba(240,249,255,.8)" : voidTheme ? "rgba(196,181,253,.8)" : "rgba(147,197,253,.55)" });
  }
  // The extra-damage circle (orange), on the same cells the console measures.
  const innerFeet = placement?.batch?.innerRadiusFeet;
  if (innerFeet > 0) {
    const inner = buildCircleArea(shape.origin, { x: shape.origin.x + (innerFeet / 5) * GRID, y: shape.origin.y }, GRID);
    for (const cell of inner.cells) {
      svgNode("rect", { x: cell.x, y: cell.y, width: cell.width, height: cell.height, fill: frost ? "rgba(30,58,138,.45)" : "rgba(249,115,22,.38)", stroke: frost ? "#bfdbfe" : "#f97316", "stroke-width": 2, "data-inner": label });
    }
  }
  if (label) svgNode("text", { x: shape.origin.x + 10, y: shape.origin.y - 10, fill: "#e0f2fe", "font-size": 16, "font-weight": 700 }).textContent = label;
}
function drawPlacement() {
  overlay.replaceChildren();
  if (!placement) return;
  (placement.shapes || []).forEach((shape) => drawShape(shape, `${shape.ordinal}/${placement.batch.count}`));
  drawShape(placement);
  if (placement.warning) svgNode("text", { x: 20, y: 120, fill: "#fdba74", "font-size": 16 }).textContent = placement.warning;
}
// areaBatch, like aoeTargetTool: a drag from an inner circle moves that explosion (it keeps its number);
// elsewhere it adds one while some are missing; with all of them placed, empty space does nothing.
function placementDrag(from, to) {
  const { batch, shapes } = placement;
  const handle = (Math.max(batch.innerRadiusFeet, 5) / 5) * GRID;
  const grabbed = shapes.findIndex((shape) => Math.hypot(shape.origin.x - from.x, shape.origin.y - from.y) <= handle);
  let ordinal = 0;
  if (grabbed >= 0) ordinal = shapes.splice(grabbed, 1)[0].ordinal;
  else if (shapes.length >= batch.count) { placement.warning = "Tutte sulla mappa: trascina il centro di una per spostarla"; drawPlacement(); return; }
  Object.assign(placement, circleFor(to)); // circleFor sets the snapped origin itself
  const tooClose = shapes.findIndex((shape) => Math.hypot(shape.origin.x - placement.origin.x, shape.origin.y - placement.origin.y) / GRID * 5 < batch.minDistanceFeet);
  if (tooClose >= 0) { placement.warning = `Troppo vicina all'esplosione ${shapes[tooClose].ordinal}`; drawPlacement(); return; }
  placement.warning = "";
  for (let next = 1; !ordinal && next <= batch.count; next += 1) if (!shapes.some((shape) => shape.ordinal === next)) ordinal = next;
  shapes.push({ ordinal, origin: placement.origin, end: placement.end, area: placement.area });
  shapes.sort((a, b) => a.ordinal - b.ordinal);
  Object.assign(placement, { origin: null, end: null, area: null });
  drawPlacement();
}
function placementClick(event) {
  const point = { x: event.clientX, y: event.clientY };
  if (placementShape() === "circle") {
    if (getSpellAreaRuleById(placement.ruleId).placement.origin === "caster") return;
    if (placement.batch) return placementDrag(point, point);
    placement.origin = point; Object.assign(placement, circleFor(point));
  } else if (placementShape() === "line") {
    if (placement.preset) return;
    // Like the real tool, a 5 ft line starts from a cell centre.
    if (!placement.origin) placement.origin = { x: (Math.floor(point.x / GRID) + 0.5) * GRID, y: (Math.floor(point.y / GRID) + 0.5) * GRID };
    else Object.assign(placement, lineFor(placement.origin, point));
  } else if (!placement.origin) placement.origin = point;
  else Object.assign(placement, coneFor(placement.origin, point));
  drawPlacement();
}
const hitIds = (current, area) => fakeHost.state.items
  .filter((item) => item.preview && item.metadata?.[META]?.inInitiative && item.id !== current.casterId)
  .filter((item) => areaHitsBounds(area, { min: { x: item.position.x - item.preview.size / 2, y: item.position.y - item.preview.size / 2 }, max: { x: item.position.x + item.preview.size / 2, y: item.position.y + item.preview.size / 2 } }))
  .map((item) => item.id);
async function finishPlacement(status) {
  if (!placement) return;
  const current = placement; placement = null; overlay.replaceChildren(); confirmButton.hidden = cancelButton.hidden = true;
  const type = getSpellAreaRuleById(current.ruleId).geometry.shape;
  let preview = null;
  if (status === "confirmed" && current.batch) {
    const areas = current.shapes.map((shape) => ({ start: shape.origin, end: shape.end, targetIds: hitIds(current, shape.area) }));
    preview = { type, start: areas[0].start, end: areas[0].end, targetIds: [...new Set(areas.flatMap((area) => area.targetIds))], areas };
  } else if (status === "confirmed") preview = { type, start: current.origin, end: current.end, targetIds: hitIds(current, current.area) };
  if (preview && current.keep) {
    await OBR.scene.items.addItems([
      { id: current.keep.id, name: current.keep.name, type: "PATH", layer: "DRAWING", metadata: current.keep.metadata, keptArea: { cells: current.area.cells } },
      { id: `${current.keep.id}-geometry`, name: "Sagoma geometrica", type: "PATH", layer: "DRAWING", attachedTo: current.keep.id, metadata: current.keep.metadata },
    ]);
  }
  await OBR.broadcast.sendMessage(SPELL_AREA_PLACEMENT_CHANNEL, { type: "result", requestId: current.requestId, ruleId: current.ruleId, status,
    ...(preview ? { preview } : {}) }, { destination: "LOCAL" });
}
confirmButton.addEventListener("click", () => {
  if (placement?.batch ? placement.shapes.length === placement.batch.count : placement?.area) void finishPlacement("confirmed");
});
cancelButton.addEventListener("click", () => void finishPlacement("cancelled"));
window.addEventListener("keydown", (event) => { if (event.key === "Escape" && placement) void finishPlacement("cancelled"); });
OBR.broadcast.onMessage(SPELL_AREA_PLACEMENT_CHANNEL, ({ data }) => {
  if (data?.type === "start") {
    void OBR.broadcast.sendMessage(SPELL_AREA_PLACEMENT_CHANNEL, { type: "accepted", requestId: data.requestId, ruleId: data.ruleId }, { destination: "LOCAL" });
    placement = { requestId: data.requestId, ruleId: data.ruleId, casterId: data.casterId, origin: null, area: null, end: null, theme: String(data.context?.areaTheme || "") };
    if (Number(data.context?.areaBatch?.count) >= 2) Object.assign(placement, { batch: { count: Number(data.context.areaBatch.count), minDistanceFeet: Number(data.context.areaBatch.minDistanceFeet) || 0, innerRadiusFeet: Number(data.context.areaBatch.innerRadiusFeet) || 0 }, shapes: [] });
    if (data.context?.keepOnMap?.id) placement.keep = structuredClone(data.context.keepOnMap);
    if (data.context?.presetLine?.start && data.context?.presetLine?.end) {
      placement.preset = structuredClone(data.context.presetLine); placement.origin = placement.preset.start;
      Object.assign(placement, lineFor(placement.origin, placement.preset.end)); drawPlacement();
    }
    if (getSpellAreaRuleById(data.ruleId)?.placement.origin === "caster") {
      const caster = fakeHost.state.items.find((item) => item.id === data.casterId);
      const cellsOf = (size) => Math.max(1, Math.round(size / GRID));
      placement.origin = { ...caster.position };
      Object.assign(placement, circleFor(placement.origin, { widthCells: cellsOf(caster.preview.size), heightCells: cellsOf(caster.preview.size) })); drawPlacement();
    }
    confirmButton.hidden = cancelButton.hidden = false;
  }
  if (data?.type === "cancel" && placement?.requestId === data.requestId) void finishPlacement("cancelled");
  if (data?.type === "confirm" && placement?.requestId === data.requestId && placement.area) void finishPlacement("confirmed");
});
// Scripted drawing: origin click, direction click, then the map confirm button.
async function drawCone(origin, toward) {
  await waitFor(() => placement);
  placementClick({ clientX: origin.x, clientY: origin.y });
  placementClick({ clientX: toward.x, clientY: toward.y });
  await sleep(150);
}
fakeHost.onSelection = renderMap; fakeHost.onItems = renderMap; fakeHost.onSceneMetadata = renderMap;

const frames = new Map();
fakeHost.onPopover = (type, options, previous) => {
  if (type === "close") { frames.get(options.id)?.remove(); frames.delete(options.id); return; }
  let frame = frames.get(options.id);
  // Reopen with the same URL repositions the existing iframe (assumption shared with every tracked popover).
  if (!frame || (type === "open" && previous?.url !== options.url)) {
    frame?.remove(); frame = document.createElement("iframe"); frame.className = "popover"; frame.src = options.url;
    frame.setAttribute("allowtransparency", "true"); if (params.has("shots")) frame.addEventListener("load", () => frame.contentDocument.head.insertAdjacentHTML("beforeend", "<style>*{transition:none!important}</style>")); document.body.appendChild(frame); frames.set(options.id, frame);
  }
  const current = fakeHost.state.popovers.get(options.id) || options;
  Object.assign(frame.style, { left: current.anchorPosition?.left + "px", top: current.anchorPosition?.top + "px", width: current.width + "px", height: current.height + "px" });
};

async function boot() {
  localStorage.clear(); sessionStorage.clear();
  fakeHost.state.items = structuredClone(seed);
  fakeHost.state.sceneMetadata = { [STATE]: { round: 2, order: ["auril", "sera", "dars", "mira", "goblin-a", "goblin-b"], current: 1 },
    "com.thebigpicture.initiative/history": { version: 1, roomId: "preview-room", entries: [] } };
  markSceneEpochReady("preview");
  await mountHistoryOwner(); await mountEffectsMutationCoordinatorService();
  const store = createBossActionProfileStore();
  const html = await (await fetch(`/test/fixtures/boss-actions/${fixtureName}`)).text();
  const profile = store.put(await importBossActionHTML(html, { sourceName: fixtureName }));
  if (scenario !== "unbound") await createBossActionRuntime({ api: OBR, store, postDamage: async () => [] }).bindBossActionProfile("auril", profile);
  renderMap();
}

document.getElementById("next-round").addEventListener("click", () => {
  const state = fakeHost.state.sceneMetadata[STATE]; fakeHost.setSceneMetadata({ [STATE]: { ...state, round: state.round + 1 } });
});
document.getElementById("open-boss").addEventListener("click", () => openBossActionsPopover("auril"));
document.getElementById("open-hp").addEventListener("click", () => OBR.popover.open({ id: "com.thebigpicture.initiative/quick-hp-modal", url: "/quick-hp-modal.html", width: 560, height: 760, anchorReference: "POSITION", anchorPosition: { left: 20, top: 60 }, anchorOrigin: { horizontal: "LEFT", vertical: "TOP" }, transformOrigin: { horizontal: "LEFT", vertical: "TOP" }, hidePaper: true }));
document.getElementById("undo-last").addEventListener("click", () => undoLastHistoryEntry());

// ---- scripted scenarios for reproducible screenshots ----
const bossFrame = () => frames.get("com.thebigpicture.initiative/boss-actions");
const doc = () => bossFrame()?.contentDocument;
async function waitFor(check, timeout = 6000) {
  const start = performance.now();
  while (performance.now() - start < timeout) { const value = check(); if (value) return value; await sleep(40); }
  throw new Error("timeout waiting");
}
const row = (name) => waitFor(() => [...(doc()?.querySelectorAll(".action-row") || [])].find((b) => b.querySelector(".action-name")?.textContent === name));
const press = async (selector) => { (await waitFor(() => doc()?.querySelector(selector))).click(); await sleep(150); };
async function openBoss() { await openBossActionsPopover("auril"); await waitFor(() => doc()?.querySelector(".action-row") || doc()?.querySelector("#boss-manage-view:not([hidden])")); await sleep(250); }
const scenarios = {
  async list() { await openBoss(); },
  async "list-target"() { fakeHost.setSelection(["dars"]); await openBoss(); },
  async icekiss() { fakeHost.setSelection(["dars"]); await openBoss(); (await row("Icekiss +2")).click(); await sleep(200); await press('[data-outcome="hit"]'); },
  async "icekiss-applied"() { await scenarios.icekiss(); await press("#boss-apply"); await sleep(400); },
  async rock() { fakeHost.setSelection(["sera"]); await openBoss(); (await row("Rock")).click(); await sleep(200); await press('[data-outcome="hit"]'); },
  async slow() { await openBoss(); (await row("Spellcasting")).click(); await sleep(200); },
  async "no-target"() { await openBoss(); (await row("Icekiss +2")).click(); await sleep(200); },
  async multi() { fakeHost.setSelection(["goblin-a", "goblin-b"]); await openBoss(); (await row("Icekiss +2")).click(); await sleep(200); },
  async locked() { fakeHost.setSelection(["dars"]); await openBoss(); (await row("Icekiss +2")).click(); await sleep(150); await press('[data-outcome="hit"]'); fakeHost.setSelection(["mira"]); await sleep(300); },
  async blizzard() { fakeHost.setSelection(["mira"]); await openBoss(); (await row("Blizzard Strike")).click(); await sleep(200); await press('[data-outcome="failed"]'); },
  async polar() { fakeHost.setSelection(["dars"]); await openBoss(); (await row("Polar Ray")).click(); await sleep(200); await press('[data-outcome="hit"]'); },
  async exhausted() { fakeHost.setSelection(["mira"]); await scenarios.blizzard(); await press("#boss-apply"); await sleep(400); },
  async minimized() { await scenarios.icekiss(); await press("#boss-minimize"); await sleep(200); },
  async manage() { await openBoss(); await press("#boss-manage-open"); },
  async unbound() { await openBoss(); },
  async "breath-drawing"() {
    await openBoss(); (await row("Breath of the Long Night")).click(); await sleep(250);
    await press("#boss-manual-confirmed"); await press("#boss-draw-area");
    await drawCone({ x: 770, y: 345 }, { x: 830, y: 900 }); },
  async "breath-drawn"() { await scenarios["breath-drawing"](); confirmButton.click(); await sleep(600); },
  async "breath-saves"() {
    await scenarios["breath-drawn"]();
    const pick = async (id, value) => { (await waitFor(() => doc().querySelector(`#boss-group-targets [data-target-id="${id}"] [data-group-outcome="${value}"]`))).click(); await sleep(80); };
    await pick("dars", "failed"); await pick("mira", "passed"); },
  async "breath-final"() { await scenarios["breath-saves"](); await press("#boss-apply"); await sleep(700); },
  async "breath-long"() {
    await openBoss(); (await row("Breath of the Long Night")).click(); await sleep(250);
    await press("#boss-manual-confirmed"); await press("#boss-draw-area");
    await drawCone({ x: 830, y: 330 }, { x: 1300, y: 600 }); confirmButton.click(); await sleep(600);
    await press('[data-group-all="failed"]'); },
  async "breath-locked"() { await scenarios["breath-saves"](); fakeHost.setSelection(["goblin-a"]); await sleep(300); },
  async "slam-drawn"() {
    await openBoss(); (await row("Hand Slam")).click(); await sleep(250); await press("#boss-draw-area");
    await waitFor(() => placement); placementClick({ clientX: 900, clientY: 560 }); await sleep(150); confirmButton.click(); await sleep(600);
    await press('[data-group-all="failed"]'); },
  async "slam-final"() { await scenarios["slam-drawn"](); await press("#boss-apply"); await sleep(700); },
  async "gleam-drawn"() {
    const mira = fakeHost.state.items.find((item) => item.id === "mira");
    mira.metadata[META].conditions = { version: 2, instances: [{ id: "imm-mira", condition: "Immune · Blinding Gleam", active: true, targetId: "mira",
      effectId: "monster-action:blinding-gleam:immune", effectKind: "buff", sourceId: "auril", sourceName: "Auril", parentEffectId: "", type: "automatic", manualRemoval: true, expiry: { mode: "manual" } }] };
    await openBoss(); (await row("Blinding Gleam")).click(); await sleep(250); await press("#boss-draw-area");
    await waitFor(() => placement?.area); await sleep(150); confirmButton.click(); await sleep(600);
    const pick = async (id, value) => { (await waitFor(() => doc().querySelector(`#boss-group-targets [data-target-id="${id}"] [data-group-outcome="${value}"]`))).click(); await sleep(80); };
    for (const [id, value] of [["dars", "failed"], ["mira", "failed"], ["sera", "passed"]]) { if (doc().querySelector(`#boss-group-targets [data-target-id="${id}"]`)) await pick(id, value); } },
  async "gleam-final"() { await scenarios["gleam-drawn"](); await press("#boss-apply"); await sleep(700); },
  async "grasp-final"() { fakeHost.setSelection(["dars"]); await openBoss(); (await row("Titan's Grasp")).click(); await sleep(250);
    await press('[data-outcome="failed"]'); await press("#boss-apply"); await sleep(700); },
  async "crush-ready"() { await scenarios["grasp-final"](); (await row("Crush")).click(); await sleep(250); await press('[data-outcome="passed"]'); },
  async "grasp-blocked"() { await scenarios["grasp-final"](); fakeHost.setSelection(["mira"]); await sleep(200); (await row("Titan's Grasp")).click(); await sleep(250); },
  async "numbing-saves"() { fakeHost.setSelection(["dars", "mira", "sera"]); await openBoss(); (await row("Soul-Numbing Cold")).click(); await sleep(300);
    for (const [id, value] of [["dars", "failed"], ["mira", "passed"], ["sera", "failed"]])
      { (await waitFor(() => doc().querySelector(`#boss-group-targets [data-target-id="${id}"] [data-group-outcome="${value}"]`))).click(); await sleep(80); } },
  async "numbing-final"() { await scenarios["numbing-saves"](); await press("#boss-apply"); await sleep(700); },
  async "mark-final"() { fakeHost.setSelection(["dars"]); await openBoss(); (await row("Mark of the Frostmaiden")).click(); await sleep(300);
    (await waitFor(() => doc().querySelector('#boss-group-targets [data-target-id="dars"] [data-group-outcome="failed"]'))).click(); await sleep(100);
    await press("#boss-apply"); await sleep(700); },
  async "marked-icekiss"() { await scenarios["mark-final"](); (await row("Icekiss +2")).click(); await sleep(250); await press('[data-outcome="hit"]'); },
  async "kiss-ready"() { fakeHost.setSelection(["mira"]); await openBoss(); (await row("Frostmaiden's Kiss")).click(); await sleep(250); await press('[data-outcome="hit"]'); },
  async "detonation-ready"() {
    const dars = fakeHost.state.items.find((item) => item.id === "dars");
    dars.metadata[META].conditions = { version: 2, instances: [{ id: "mark-seed", condition: "Mark of the Frostmaiden", active: true, targetId: "dars",
      effectId: "monster-mark:auril:mark-of-the-frostmaiden", effectKind: "debuff", sourceId: "auril", sourceName: "Auril", parentEffectId: "", type: "automatic", manualRemoval: true, expiry: { mode: "manual" } }] };
    fakeHost.setSelection(["dars"]); await openBoss(); (await row("Detonation of the Mark")).click(); await sleep(250); await press('[data-outcome="failed"]'); },
  async "detonation-final"() { await scenarios["detonation-ready"](); await press("#boss-apply"); await sleep(700); },
  async "breathe-registered"() { await openBoss(); (await row("Breathe Deep")).click(); await sleep(250);
    await press("#boss-manual-confirmed"); await press("#boss-register"); await sleep(700); },
  // One drawing: the four centres one after another (all still on the map), confirmation pending.
  async "meteor-drawing"() {
    const mira = fakeHost.state.items.find((item) => item.id === "mira");
    mira.metadata[META].initiativeCard = { characterBuild: [{ classId: "ladro", level: 7 }] };
    await openBoss(); (await row("Meteor Swarm")).click(); await sleep(300);
    await press("#boss-manual-confirmed");
    await press("#boss-draw-area"); await waitFor(() => placement);
    for (const point of [{ x: 980, y: 560 }, { x: 620, y: 600 }, { x: 1300, y: 300 }, { x: 300, y: 300 }]) {
      placementClick({ clientX: point.x, clientY: point.y }); await sleep(120);
    } },
  // Explosion 2 moved by dragging its orange centre: it keeps its number and the others stay put.
  async "meteor-moved"() {
    await scenarios["meteor-drawing"]();
    placementDrag({ x: 1500, y: 850 }, { x: 1500, y: 850 }); // empty space with all four placed: nothing happens
    const second = placement.shapes.find((shape) => shape.ordinal === 2).origin;
    placementDrag({ x: second.x + 20, y: second.y - 20 }, { x: 640, y: 860 }); await sleep(150);
  },
  async "meteor-moved-confirmed"() { await scenarios["meteor-moved"](); confirmButton.click(); await sleep(900); },
  async "meteor-drawn"() {
    await scenarios["meteor-drawing"]();
    confirmButton.click(); await sleep(900);
    for (const id of ["dars", "mira", "sera"]) {
      const choice = doc().querySelector(`#boss-group-targets [data-target-id="${id}"] [data-group-outcome="failed"]`);
      if (choice) { choice.click(); await sleep(80); }
    } },
  // Phase 3 (?phase=3): Auril below 105 PF, a Goblin at 0 PF left out, the frost emanation of 120 ft.
  async "brilliance-drawing"() {
    const meta = (id) => fakeHost.state.items.find((item) => item.id === id).metadata[META];
    meta("auril").hp = 98; meta("goblin-b").hp = 0;
    await openBoss(); await press("#boss-trigger-open"); await sleep(250);
    await press("#boss-manual-confirmed"); await press("#boss-draw-area"); await waitFor(() => placement?.area); await sleep(150);
  },
  async "brilliance-ready"() {
    await scenarios["brilliance-drawing"](); confirmButton.click(); await sleep(900);
    for (const [id, outcome] of [["dars", "hit"], ["mira", "hit"], ["sera", "miss"], ["goblin-a", "hit"]]) await press(`#boss-group-targets [data-target-id="${id}"] [data-group-outcome="${outcome}"]`);
  },
  async "brilliance-final"() { await scenarios["brilliance-ready"](); await press("#boss-apply"); await sleep(800); },
  // Hurl: Dars held by the Titan, 20 ft beyond the edge (the DEX save reminder follows the commit).
  async "hurl-ready"() {
    const dars = fakeHost.state.items.find((item) => item.id === "dars");
    dars.metadata[META].conditions = { version: 2, instances: [
      { id: "grab-1", condition: "Afferrato", active: true, sourceId: "auril", sourceName: "Auril", type: "automatic", manualRemoval: true, expiry: { mode: "manual" } },
      { id: "hold-1", condition: "Trattenuto", active: true, sourceId: "auril", sourceName: "Auril", type: "automatic", manualRemoval: true, expiry: { mode: "manual" } }] };
    await openBoss(); (await row("Hurl")).click(); await sleep(300);
    await press('#boss-throw-distance [data-throw-distance="20"]'); await press('#boss-throw-landing [data-throw-landing="edge"]');
  },
  async "hurl-final"() { await scenarios["hurl-ready"](); await press("#boss-apply"); await sleep(800); },
  // Epic Resistance: a spell and a condition on Auril; the condition, 14 on the d20.
  async "resist-ready"() {
    const auril = fakeHost.state.items.find((item) => item.id === "auril");
    auril.metadata[META]["com.thebigpicture.initiative/spells"] = [{ instanceId: "spell-hold", name: "Blocca mostri", casterId: "mira", casterName: "Mira", conc: true }];
    auril.metadata[META].conditions = { version: 2, instances: [
      { id: "para", condition: "Paralizzato", active: true, parentEffectId: "spell-hold", sourceId: "mira", sourceName: "Mira", type: "spell", expiry: { mode: "manual" } },
      { id: "blind", condition: "Accecato", active: true, sourceId: "dars", sourceName: "Dars", type: "automatic", manualRemoval: true, expiry: { mode: "manual" } }] };
    await openBoss(); (await row("Epic Resistance")).click(); await sleep(300);
    await press('#boss-effect-choices [data-effect-key="condition:blind"]');
    const input = doc().querySelector("[data-effect-roll]"); input.value = "14"; input.dispatchEvent(new Event("input")); await sleep(120);
  },
  async "resist-final"() { await scenarios["resist-ready"](); await press("#boss-apply"); await sleep(800); },
  // ?boss=shothragoth: Marea Informe, the 15 ft emanation in the void palette.
  async "marea-drawing"() {
    await openBoss(); (await row("Marea Informe")).click(); await sleep(300);
    await press("#boss-draw-area"); await waitFor(() => placement?.area); await sleep(150);
  },
  // ?boss=shothragoth: Arto che Precede il Corpo hits Dars and grabs him, then Scagliare throws him against Mira.
  async "arto-final"() {
    fakeHost.setSelection(["dars"]); await openBoss(); (await row("Arto che Precede il Corpo")).click(); await sleep(300);
    await press('#boss-outcome [data-outcome="hit"]'); await press('#boss-hit-rider [data-hit-rider="grab"]'); await press("#boss-apply"); await sleep(800);
  },
  async "scagliare-ready"() {
    await scenarios["arto-final"](); fakeHost.setSelection([]);
    (await row("Scagliare")).click(); await sleep(300);
    await press('#boss-collision-target [data-collision-target="mira"]'); await press('#boss-collision-outcome [data-collision-outcome="failed"]');
  },
  async "scagliare-final"() { await scenarios["scagliare-ready"](); await press("#boss-apply"); await sleep(800); },
  // ?boss=shothragoth: Cucitura del Non-Luogo drawn between two points (Sera's slot, the first of the round), then applied.
  async "cucitura-drawing"() {
    await openBoss(); (await row("Cucitura del Non-Luogo")).click(); await sleep(300);
    await press("#boss-draw-seam"); await waitFor(() => placement);
    placementClick({ clientX: 560, clientY: 520 }); placementClick({ clientX: 1240, clientY: 520 }); await sleep(150);
  },
  async "cucitura-final"() { await scenarios["cucitura-drawing"](); confirmButton.click(); await sleep(900); await press("#boss-apply"); await sleep(800); },
  // Strappare la Cucitura in Mira's slot (the last of the round): the line is laid on the seam, Dars and Mira fail.
  async "strappare-ready"() {
    await scenarios["cucitura-final"]();
    fakeHost.setSceneMetadata({ [STATE]: { ...fakeHost.state.sceneMetadata[STATE], current: 3 } }); await sleep(600);
    (await row("Strappare la Cucitura")).click(); await sleep(300);
    await press("#boss-draw-area"); await waitFor(() => placement?.area); await sleep(150); confirmButton.click(); await sleep(900);
    await press('[data-group-all="failed"]');
  },
  async "strappare-final"() { await scenarios["strappare-ready"](); await press("#boss-apply"); await sleep(900); },
  async "meteor-final"() { await scenarios["meteor-drawn"](); await press('[data-group-all="failed"]'); await press("#boss-apply"); await sleep(800); },
  async compare() { document.getElementById("open-hp").click(); await sleep(600); fakeHost.setSelection(["dars"]); await openBossActionsPopover("auril"); await sleep(400);
    const frame = bossFrame(); fakeHost.state.popovers.get("com.thebigpicture.initiative/boss-actions").anchorPosition = { left: 600, top: 60 }; frame.style.left = "600px"; frame.style.top = "60px";
    (await row("Icekiss +2")).click(); await sleep(200); await press('[data-outcome="hit"]'); },
};

boot().then(async () => {
  if (scenarios[scenario]) {
    try { await scenarios[scenario](); document.title = "READY " + scenario; }
    catch (error) { document.title = "FAILED " + scenario + ": " + error.message; console.error(error); }
  }
  const metrics = () => { const d = doc(); if (!d) return {}; const panel = d.getElementById("boss-panel"); return { panelScroll: panel?.scrollHeight, panelClient: panel?.clientHeight, status: d.getElementById("boss-status")?.textContent, applyDisabled: d.getElementById("boss-apply")?.disabled, hint: d.getElementById("boss-apply-hint")?.textContent, missing: fakeHost.state.missing.slice(0, 8) }; };
  window.__metrics = metrics; document.body.dataset.metrics = JSON.stringify(metrics());
}).catch((error) => { document.title = "BOOT FAILED " + error.message; console.error(error); });
