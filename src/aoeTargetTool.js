import OBR, { buildPath, buildText, Command } from "@owlbear-rodeo/sdk";
import { ID, TRACKER_PANEL_REQUEST_CHANNEL } from "./constants.js";
import { openTrackedPopover } from "./popoverDragHost.js";
import {
  areaHitsBounds,
  buildArea,
  buildCellBoundaryLoops,
  nearestGridSnap,
} from "./aoeGeometryCore.js";
import {
  AOE_SETTINGS_POPOVER_ID,
  AOE_AREA_META_KEY,
  AOE_STYLE_CHANNEL,
  loadAoEStyle,
  normalizeAoEStyle,
} from "./aoeStyle.js";

const TOOL_ID = `${ID}/aoe-target-tool`;
const MODE_IDS = {
  circle: `${ID}/aoe-target-circle`,
  square: `${ID}/aoe-target-square`,
  cone: `${ID}/aoe-target-cone`,
  line: `${ID}/aoe-target-line`,
};
const META_KEY = `${ID}/meta`;
const STATE_KEY = `${ID}/state`;
const PREVIEW_META_KEY = `${ID}/aoePreview`;
const AREA_META_KEY = AOE_AREA_META_KEY;
const STYLE_ACTION_ID = `${ID}/aoe-style-action`;
const RESELECT_CONTEXT_ID = `${ID}/aoe-reselect-targets`;
const CONDITIONS_CONTEXT_ID = `${ID}/aoe-select-conditions`;
const SPELLS_CONTEXT_ID = `${ID}/aoe-select-spells`;
const QUICK_HP_CONTEXT_ID = `${ID}/aoe-select-quick-hp`;
let activeDrag = null;
let currentStyle = loadAoEStyle();
let areaSelectionRevision = 0;
let areaSelectionTimer = null;
let pendingMovedArea = null;
const areaTransforms = new Map();

function point(value) {
  const x = Number(value?.x);
  const y = Number(value?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function boundaryCommands(cells) {
  const commands = [];
  for (const loop of buildCellBoundaryLoops(cells)) {
    if (!loop.length) continue;
    commands.push([Command.MOVE, loop[0].x, loop[0].y]);
    for (let index = 1; index < loop.length; index += 1) {
      commands.push([Command.LINE, loop[index].x, loop[index].y]);
    }
    commands.push([Command.CLOSE]);
  }
  return commands;
}

function geometryCommands(area) {
  if (area?.type === "circle") {
    const { x, y } = area.origin;
    const radius = area.radius;
    const handle = radius * 0.5522847498;
    return [
      [Command.MOVE, x + radius, y],
      [Command.CUBIC, x + radius, y + handle, x + handle, y + radius, x, y + radius],
      [Command.CUBIC, x - handle, y + radius, x - radius, y + handle, x - radius, y],
      [Command.CUBIC, x - radius, y - handle, x - handle, y - radius, x, y - radius],
      [Command.CUBIC, x + handle, y - radius, x + radius, y - handle, x + radius, y],
      [Command.CLOSE],
    ];
  }
  if (!Array.isArray(area?.points) || !area.points.length) return [];
  const commands = [[Command.MOVE, area.points[0].x, area.points[0].y]];
  for (let index = 1; index < area.points.length; index += 1) {
    commands.push([Command.LINE, area.points[index].x, area.points[index].y]);
  }
  commands.push([Command.CLOSE]);
  return commands;
}

function previewPath(
  name,
  fillOpacity,
  strokeOpacity,
  strokeWidth,
  fillColor = currentStyle.fillColor,
  strokeColor = currentStyle.strokeColor,
) {
  return buildPath()
    .commands([])
    .fillRule("evenodd")
    .fillColor(fillColor)
    .fillOpacity(fillOpacity)
    .strokeColor(strokeColor)
    .strokeOpacity(strokeOpacity)
    .strokeWidth(strokeWidth)
    .locked(true)
    .disableHit(true)
    .layer("DRAWING")
    .metadata({ [PREVIEW_META_KEY]: true })
    .name(name)
    .build();
}

function radiusLabel(dpi) {
  const width = Math.max(180, dpi * 3.2);
  const height = Math.max(64, dpi * 0.72);
  return buildText()
    .plainText("")
    .textType("PLAIN")
    .width(width)
    .height(height)
    .padding(Math.max(4, dpi * 0.035))
    .fontFamily("Helvetica, Arial, sans-serif")
    .fontSize(Math.max(32, dpi * 0.31))
    .fontWeight(700)
    .textAlign("CENTER")
    .textAlignVertical("MIDDLE")
    .fillColor("#ffffff")
    .strokeColor("#0f172a")
    .strokeOpacity(0.95)
    .strokeWidth(Math.max(2, dpi * 0.018))
    .locked(true)
    .disableHit(true)
    .layer("TEXT")
    .metadata({ [PREVIEW_META_KEY]: true })
    .name("Raggio AoE")
    .build();
}

function formatMeasure(value) {
  return new Intl.NumberFormat("it-IT", { maximumFractionDigits: 1 }).format(value);
}

function areaLabelPosition(area) {
  if (area.type === "circle") return area.origin;
  const points = Array.isArray(area.points) ? area.points : [area.origin];
  return points.reduce((result, entry) => ({
    x: result.x + entry.x / points.length,
    y: result.y + entry.y / points.length,
  }), { x: 0, y: 0 });
}

function renderDrag(state) {
  if (!state?.ready || !state.interaction || !state.start || !state.end) return null;
  const area = buildArea(state.type, state.start, state.end, state.dpi, state.gridOrigin);
  state.area = area;
  const [update] = state.interaction;
  update((items) => {
    if (items[0]) items[0].commands = boundaryCommands(area.cells);
    if (items[1]) items[1].commands = geometryCommands(area);
    if (items[2]) {
      const worldDistance = area.squares * state.multiplier;
      items[2].text.plainText = `${formatMeasure(worldDistance)} ${state.unit}`.trim();
      const center = areaLabelPosition(area);
      const width = Number(items[2].text?.width) || Math.max(120, state.dpi * 2.4);
      const height = Number(items[2].text?.height) || Math.max(44, state.dpi * 0.48);
      items[2].position = { x: center.x - width / 2, y: center.y - height / 2 };
    }
  });
  return area;
}

async function prepareDrag(state) {
  try {
    const [dpi, cornerStart, scale] = await Promise.all([
      OBR.scene.grid.getDpi(),
      OBR.scene.grid.snapPosition(state.rawStart, 1, true, false),
      OBR.scene.grid.getScale().catch(() => ({ parsed: { multiplier: 1.5, unit: "m" } })),
    ]);
    if (activeDrag !== state || state.cancelled) return;
    state.dpi = Math.max(1, Number(dpi) || 150);
    state.multiplier = Math.max(0, Number(scale?.parsed?.multiplier) || 1.5);
    state.unit = String(scale?.parsed?.unit || "m").trim();
    const corner = point(cornerStart) || state.rawStart;
    const snapped = nearestGridSnap(state.rawStart, corner, state.dpi);
    state.start = snapped?.position || corner;
    state.gridOrigin = snapped?.gridOrigin || corner;
    state.style = { ...currentStyle };
    const outlineWidth = Math.max(2, state.dpi * 0.035 * state.style.strokeWidth);
    state.interaction = await OBR.interaction.startItemInteraction([
      previewPath("Area sagomata", state.style.fillOpacity, 0.95, outlineWidth, state.style.fillColor, state.style.strokeColor),
      previewPath("Sagoma geometrica", 0, 0.9, Math.max(2, outlineWidth * 0.72), state.style.fillColor, state.style.strokeColor),
      radiusLabel(state.dpi),
    ]);
    if (activeDrag !== state || state.cancelled) {
      state.interaction[1]();
      return;
    }
    state.ready = true;
    renderDrag(state);
    if (state.ended) await finishDrag(state);
  } catch (error) {
    if (activeDrag === state) activeDrag = null;
    console.warn("[aoe-target] preview error:", error?.message || error);
  }
}

function trackedInitiativeItem(item, orderedSet) {
  const meta = item?.metadata?.[META_KEY];
  return item?.layer === "CHARACTER"
    && !item?.attachedTo
    && !!meta
    && (meta.inInitiative === true || orderedSet.has(item.id))
    && Number.isFinite(Number(meta.hp))
    && Number.isFinite(Number(meta.hpMax));
}

async function findHitTargetIds(area) {
  const sceneMetadata = await OBR.scene.getMetadata().catch(() => ({}));
  const order = sceneMetadata?.[STATE_KEY]?.order || [];
  const orderedSet = new Set(order.map((id) => String(id).split("::p")[0]));
  const candidates = await OBR.scene.items.getItems((item) => trackedInitiativeItem(item, orderedSet));
  const bounds = await Promise.all(candidates.map(async (item) => {
    try { return await OBR.scene.items.getItemBounds([item.id]); }
    catch { return null; }
  }));
  return candidates.filter((item, index) => areaHitsBounds(area, bounds[index])).map((item) => item.id);
}

async function selectAreaTargets(area) {
  const revision = ++areaSelectionRevision;
  const targetIds = await findHitTargetIds(area);
  if (revision !== areaSelectionRevision) return [];
  if (targetIds.length) await OBR.player.select(targetIds, true);
  else await OBR.player.deselect();
  return targetIds;
}

async function selectAreaTargetsAndOpen(area, panel) {
  const targetIds = await selectAreaTargets(area);
  if (!targetIds.length) {
    await OBR.notification.show("Nessun token nell'area.", "INFO");
    return;
  }
  await OBR.broadcast.sendMessage(TRACKER_PANEL_REQUEST_CHANNEL, {
    type: "open",
    panel,
  }, { destination: "LOCAL" });
}

function persistentAreaMetadata(state) {
  return {
    version: 2,
    singlePath: true,
    type: state.type,
    start: state.start,
    end: state.end,
    dpi: state.dpi,
    gridOrigin: state.gridOrigin,
    basePosition: { x: 0, y: 0 },
    style: state.style,
  };
}

async function persistArea(state, area) {
  const metadata = persistentAreaMetadata(state);
  const outlineWidth = Math.max(2, state.dpi * 0.035 * state.style.strokeWidth);
  const fill = previewPath("Area sagomata", state.style.fillOpacity, 0.95, outlineWidth, state.style.fillColor, state.style.strokeColor);
  fill.locked = false;
  fill.disableHit = false;
  fill.commands = boundaryCommands(area.cells);
  fill.position = { x: 0, y: 0 };
  fill.metadata = { [AREA_META_KEY]: metadata };
  const geometry = previewPath("Sagoma geometrica", 0, 0.9, Math.max(2, outlineWidth * 0.72), state.style.fillColor, state.style.strokeColor);
  geometry.commands = geometryCommands(area);
  geometry.position = { x: 0, y: 0 };
  geometry.attachedTo = fill.id;
  geometry.metadata = { [AREA_META_KEY]: { parentId: fill.id, dpi: state.dpi, visual: "geometry" } };
  await OBR.scene.items.addItems([fill, geometry]);
  areaTransforms.set(fill.id, { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
}

function translatedAreaFromItem(item) {
  const metadata = item?.metadata?.[AREA_META_KEY];
  if (!metadata?.type || !metadata?.start || !metadata?.end) return null;
  const position = point(item.position) || { x: 0, y: 0 };
  const base = point(metadata.basePosition) || { x: 0, y: 0 };
  const delta = { x: position.x - base.x, y: position.y - base.y };
  const translate = (entry) => ({ x: Number(entry.x) + delta.x, y: Number(entry.y) + delta.y });
  return buildArea(
    metadata.type,
    translate(metadata.start),
    translate(metadata.end),
    metadata.dpi,
    translate(metadata.gridOrigin || metadata.start),
  );
}

async function applyStyleToExistingAreas(style) {
  await OBR.scene.items.updateItems(
    (item) => {
      const metadata = item?.metadata?.[AREA_META_KEY];
      return !!metadata?.type || !!metadata?.parentId;
    },
    (items) => {
      for (const item of items) {
        const metadata = item.metadata?.[AREA_META_KEY] || {};
        if (metadata.type) {
          item.style.fillColor = style.fillColor;
          item.style.strokeColor = style.strokeColor;
          item.style.fillOpacity = style.fillOpacity;
          item.style.strokeOpacity = metadata.singlePath ? 0.95 : 0;
          item.style.strokeWidth = metadata.singlePath
            ? Math.max(2, Number(metadata.dpi || 150) * 0.035 * style.strokeWidth)
            : 1;
          metadata.style = style;
        } else {
          item.style.fillColor = style.fillColor;
          item.style.strokeColor = style.strokeColor;
          item.style.fillOpacity = 0;
          item.style.strokeOpacity = 0.95;
          const baseWidth = Math.max(2, Number(metadata.dpi || 150) * 0.035 * style.strokeWidth);
          item.style.strokeWidth = metadata.visual === "geometry" ? Math.max(2, baseWidth * 0.72) : baseWidth;
        }
      }
    },
  );
}

async function openStyleSettings() {
  let viewportWidth = 1200;
  try { viewportWidth = Number(await OBR.viewport.getWidth()) || viewportWidth; } catch {}
  await OBR.popover.close(AOE_SETTINGS_POPOVER_ID).catch(() => {});
  await openTrackedPopover({
    id: AOE_SETTINGS_POPOVER_ID,
    url: "/aoe-settings.html",
    width: 312,
    height: 264,
    anchorReference: "POSITION",
    anchorPosition: { left: Math.max(12, viewportWidth - 390), top: 88 },
    anchorOrigin: { horizontal: "LEFT", vertical: "TOP" },
    transformOrigin: { horizontal: "LEFT", vertical: "TOP" },
    disableClickAway: false,
    marginThreshold: 12,
    hidePaper: true,
  });
}

function transformSignature(item) {
  return {
    x: Number(item?.position?.x) || 0,
    y: Number(item?.position?.y) || 0,
    rotation: Number(item?.rotation) || 0,
    scaleX: Number(item?.scale?.x) || 1,
    scaleY: Number(item?.scale?.y) || 1,
  };
}

function sameTransform(a, b) {
  return !!a && !!b
    && a.x === b.x && a.y === b.y
    && a.rotation === b.rotation
    && a.scaleX === b.scaleX && a.scaleY === b.scaleY;
}

function scheduleMovedAreaSelection(item) {
  pendingMovedArea = item;
  if (areaSelectionTimer) window.clearTimeout(areaSelectionTimer);
  areaSelectionTimer = window.setTimeout(() => {
    areaSelectionTimer = null;
    const current = pendingMovedArea;
    pendingMovedArea = null;
    const area = translatedAreaFromItem(current);
    if (area) void selectAreaTargets(area);
  }, 90);
}

function mountPersistentAreaListener() {
  OBR.scene.items.onChange((items) => {
    for (const item of items || []) {
      if (!item?.metadata?.[AREA_META_KEY]?.type) continue;
      const next = transformSignature(item);
      const previous = areaTransforms.get(item.id);
      areaTransforms.set(item.id, next);
      if (previous && !sameTransform(previous, next)) scheduleMovedAreaSelection(item);
    }
  });
}

async function finishDrag(state) {
  if (activeDrag !== state || state.finishing || !state.ready) return;
  state.finishing = true;
  const area = renderDrag(state);
  state.interaction?.[1]?.();
  activeDrag = null;
  if (!area) return;
  try {
    await persistArea(state, area);
    await selectAreaTargets(area);
  } catch (error) {
    console.warn("[aoe-target] target error:", error?.message || error);
    await OBR.notification.show("Impossibile calcolare i bersagli dell'area.", "ERROR");
  }
}

function cancelDrag() {
  const state = activeDrag;
  if (!state) return;
  state.cancelled = true;
  state.interaction?.[1]?.();
  activeDrag = null;
}

function startDrag(type, event) {
  cancelDrag();
  const pointer = point(event?.pointerPosition);
  if (!pointer) return;
  const state = {
    type,
    rawStart: pointer,
    start: null,
    end: pointer,
    dpi: 150,
    gridOrigin: null,
    multiplier: 1.5,
    unit: "m",
    style: { ...currentStyle },
    ready: false,
    ended: false,
    cancelled: false,
    finishing: false,
    interaction: null,
    area: null,
  };
  activeDrag = state;
  void prepareDrag(state);
}

function moveDrag(event) {
  const pointer = point(event?.pointerPosition);
  if (!activeDrag || !pointer) return;
  activeDrag.end = pointer;
  renderDrag(activeDrag);
}

function endDrag(event) {
  const state = activeDrag;
  if (!state) return;
  state.end = point(event?.pointerPosition) || state.end;
  state.ended = true;
  if (state.ready) void finishDrag(state);
}

function modeDefinition(type, label, icon) {
  return {
    id: MODE_IDS[type],
    icons: [{ icon, label, filter: { activeTools: [TOOL_ID], roles: ["GM"] } }],
    cursors: [{ cursor: "crosshair", filter: { activeTools: [TOOL_ID], activeModes: [MODE_IDS[type]] } }],
    onToolDragStart: (_context, event) => startDrag(type, event),
    onToolDragMove: (_context, event) => moveDrag(event),
    onToolDragEnd: (_context, event) => endDrag(event),
    onToolDragCancel: () => cancelDrag(),
    onDeactivate: () => cancelDrag(),
  };
}

OBR.onReady(async () => {
  if (await OBR.player.getRole() !== "GM") return;
  mountPersistentAreaListener();
  OBR.broadcast.onMessage(AOE_STYLE_CHANNEL, (event) => {
    if (event?.data?.type !== "change") return;
    currentStyle = normalizeAoEStyle(event.data.style);
    void applyStyleToExistingAreas(currentStyle);
  });
  for (const id of Object.values(MODE_IDS)) {
    try { await OBR.tool.removeMode(id); } catch {}
  }
  try { await OBR.tool.remove(TOOL_ID); } catch {}
  try { await OBR.tool.removeAction(STYLE_ACTION_ID); } catch {}
  try { await OBR.contextMenu.remove(RESELECT_CONTEXT_ID); } catch {}
  try { await OBR.contextMenu.remove(CONDITIONS_CONTEXT_ID); } catch {}
  try { await OBR.contextMenu.remove(SPELLS_CONTEXT_ID); } catch {}
  try { await OBR.contextMenu.remove(QUICK_HP_CONTEXT_ID); } catch {}
  await OBR.tool.create({
    id: TOOL_ID,
    icons: [{ icon: "/aoe-target.svg", label: "Targeting area", filter: { roles: ["GM"] } }],
    defaultMode: MODE_IDS.circle,
  });
  await OBR.tool.createMode(modeDefinition("circle", "Cerchio", "/aoe-circle.svg"));
  await OBR.tool.createMode(modeDefinition("square", "Quadrato", "/aoe-square.svg"));
  await OBR.tool.createMode(modeDefinition("cone", "Cono", "/aoe-cone.svg"));
  await OBR.tool.createMode(modeDefinition("line", "Linea", "/aoe-line.svg"));
  await OBR.tool.createAction({
    id: STYLE_ACTION_ID,
    icons: [{ icon: "/aoe-style.svg", label: "Aspetto area", filter: { activeTools: [TOOL_ID], roles: ["GM"] } }],
    onClick: () => void openStyleSettings(),
  });
  await OBR.contextMenu.create({
    id: RESELECT_CONTEXT_ID,
    icons: [{
      icon: "/aoe-reselect.svg",
      label: "Riseleziona bersagli",
      filter: {
        roles: ["GM"],
        min: 1,
        every: [{
          key: ["metadata", AREA_META_KEY, "type"],
          operator: "!=",
          value: undefined,
        }],
      },
    }],
    onClick: (context) => {
      const item = context.items?.find((entry) => entry?.metadata?.[AREA_META_KEY]?.type);
      const area = translatedAreaFromItem(item);
      if (area) void selectAreaTargets(area);
    },
  });
  await OBR.contextMenu.create({
    id: CONDITIONS_CONTEXT_ID,
    icons: [{
      icon: "/conditions-panel.svg",
      label: "Seleziona e apri Condizioni",
      filter: {
        roles: ["GM"],
        min: 1,
        every: [{
          key: ["metadata", AREA_META_KEY, "type"],
          operator: "!=",
          value: undefined,
        }],
      },
    }],
    onClick: (context) => {
      const item = context.items?.find((entry) => entry?.metadata?.[AREA_META_KEY]?.type);
      const area = translatedAreaFromItem(item);
      if (area) void selectAreaTargetsAndOpen(area, "conditions");
    },
  });
  await OBR.contextMenu.create({
    id: SPELLS_CONTEXT_ID,
    icons: [{
      icon: "/spells-panel.svg",
      label: "Seleziona e apri Incantesimi",
      filter: {
        roles: ["GM"],
        min: 1,
        every: [{
          key: ["metadata", AREA_META_KEY, "type"],
          operator: "!=",
          value: undefined,
        }],
      },
    }],
    onClick: (context) => {
      const item = context.items?.find((entry) => entry?.metadata?.[AREA_META_KEY]?.type);
      const area = translatedAreaFromItem(item);
      if (area) void selectAreaTargetsAndOpen(area, "spells");
    },
  });
  await OBR.contextMenu.create({
    id: QUICK_HP_CONTEXT_ID,
    icons: [{
      icon: "/quick-damage.svg",
      label: "Seleziona e apri Console HP Rapida",
      filter: {
        roles: ["GM"],
        min: 1,
        every: [{
          key: ["metadata", AREA_META_KEY, "type"],
          operator: "!=",
          value: undefined,
        }],
      },
    }],
    onClick: (context) => {
      const item = context.items?.find((entry) => entry?.metadata?.[AREA_META_KEY]?.type);
      const area = translatedAreaFromItem(item);
      if (area) void selectAreaTargetsAndOpen(area, "quick-hp");
    },
  });
});
