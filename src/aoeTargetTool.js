import OBR, { buildPath, buildText, Command } from "@owlbear-rodeo/sdk";
import { ID, TRACKER_PANEL_REQUEST_CHANNEL } from "./constants.js";
import { openTrackedPopover } from "./popoverDragHost.js";
import {
  areaContainsBounds,
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
import {
  SPELL_AREA_PLACEMENT_CHANNEL,
  completeSpellAreaPlacement as completePlacementSession,
  constrainedSpellAreaEnd,
  createSpellAreaPlacementSession,
  nearestGridCellCenter,
  nearestGridCellSideCenter,
  nearestGridCorner,
  reviewSpellAreaPlacement,
  spellAreaPlacementParentUnavailable,
  spellAreaGridCells,
  spellAreaRangeCells,
  spellAreaOriginAdjacentToCaster,
  spellAreaOriginWithinRange,
} from "./spellAreaPlacementCore.js";
import {
  getSpellAreaRuleById,
  getSpellAreaRuleForPlacement,
} from "./spellAreaRules.js";
import {
  SPELL_STATIC_ZONE_META_KEY,
  translatedZoneArea,
} from "./spellStaticZoneCore.js";
import { SPELL_BOARD_TOKEN_META_KEY } from "./spellBoardTokenCore.js";
import { getAnimatedObjectSize } from "./animatedObjectsCore.js";
import {
  clipChildZoneAreaToParent,
  validateChildZoneContainment,
} from "./spellChildZoneCore.js";
import {
  spellZoneMovementDistanceMeters,
} from "./spellZoneMovementCore.js";
import { spellAreaStyle } from "./spellAreaStyleCore.js";
import { subscribeSceneItemChanges } from "./sceneItemEvents.js";
import { currentSceneEpoch } from "./sceneEpoch.js";

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
const SPELL_PLACEMENT_META_KEY = `${ID}/spellAreaPlacement`;
const SPELL_MOVEMENT_META_KEY = `${ID}/spellZoneMovement`;
const SPELL_PLACEMENT_CONFIRM_ACTION_ID = `${ID}/spell-area-confirm`;
const SPELL_PLACEMENT_CANCEL_ACTION_ID = `${ID}/spell-area-cancel`;
const SPELL_MOVEMENT_CONFIRM_ACTION_ID = `${ID}/spell-zone-move-confirm`;
const SPELL_MOVEMENT_CANCEL_ACTION_ID = `${ID}/spell-zone-move-cancel`;
let activeDrag = null;
let spellPlacementSession = null;
let spellMovementSession = null;
const spellPlacementStartingRequests = new Set();
let currentStyle = loadAoEStyle();
let areaSelectionRevision = 0;
let areaSelectionTimer = null;
let pendingMovedArea = null;
const areaTransforms = new Map();

function areaModeId(shape) {
  return MODE_IDS[shape === "rectangle" ? "line" : shape];
}

function isBoardTokenPlacement(value = spellPlacementSession?.rule) {
  return value?.kind === "board-token";
}

function point(value) {
  const x = Number(value?.x);
  const y = Number(value?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

async function setSpellPlacementToolState(active) {
  await OBR.tool.setMetadata(TOOL_ID, {
    [SPELL_PLACEMENT_META_KEY]: active === true,
  }).catch(() => {});
}

async function setSpellMovementToolState(active) {
  await OBR.tool.setMetadata(TOOL_ID, {
    [SPELL_MOVEMENT_META_KEY]: active === true,
  }).catch(() => {});
}

async function sendSpellPlacementResult(payload) {
  await OBR.broadcast.sendMessage(
    SPELL_AREA_PLACEMENT_CHANNEL,
    { type: "result", ...payload },
    { destination: "LOCAL" },
  ).catch(() => {});
}

async function sendSpellPlacementAccepted(payload = {}) {
  await OBR.broadcast.sendMessage(
    SPELL_AREA_PLACEMENT_CHANNEL,
    {
      type: "accepted",
      requestId: String(payload?.requestId || "").trim(),
      ruleId: String(payload?.ruleId || "").trim(),
    },
    { destination: "LOCAL" },
  ).catch(() => {});
}

function normalizedBatchObjects(context) {
  return (Array.isArray(context?.batch?.objects) ? context.batch.objects : [])
    .map((object) => ({
      id: String(object?.id || "").trim(),
      label: String(object?.label || object?.id || "oggetto").trim(),
    }))
    .filter((object) => object.id);
}

function currentBatchObject(runtime) {
  const objects = runtime?.batch?.objects || [];
  const index = Number(runtime?.batch?.positions?.length) || 0;
  return objects[index] || null;
}

async function sendSpellPlacementProgress(runtime) {
  const batch = runtime?.batch;
  if (!batch?.objects?.length) return;
  const placed = batch.positions.length;
  const next = currentBatchObject(runtime);
  await OBR.broadcast.sendMessage(
    SPELL_AREA_PLACEMENT_CHANNEL,
    {
      type: "progress",
      requestId: runtime.session.requestId,
      ruleId: runtime.session.ruleId,
      spellId: runtime.session.spellId,
      casterId: runtime.session.casterId,
      status: "placing",
      context: runtime.context,
      preview: runtime.session.preview,
      batchIndex: placed,
      batchTotal: batch.objects.length,
      message: next
        ? `Posiziona ${next.label.toLocaleLowerCase("it")} (${placed + 1}/${batch.objects.length}).`
        : "Tutti gli oggetti sono posizionati. Conferma il gruppo.",
    },
    { destination: "LOCAL" },
  ).catch(() => {});
}

async function casterGeometry(casterId) {
  if (!casterId) return null;
  try {
    const [bounds, items] = await Promise.all([
      OBR.scene.items.getItemBounds([casterId]),
      OBR.scene.items.getItems([casterId]).catch(() => []),
    ]);
    const min = point(bounds?.min);
    const max = point(bounds?.max);
    const center = point(bounds?.center)
      || (min && max ? {
        x: (Number(bounds.min.x) + Number(bounds.max.x)) / 2,
        y: (Number(bounds.min.y) + Number(bounds.max.y)) / 2,
      } : null);
    if (center && min && max) {
      return {
        center,
        bounds: { min, max },
        name: String(items?.[0]?.name || "").trim(),
      };
    }
  } catch {}
  return null;
}

async function restoreSpellPlacementTool(previousTool) {
  const toolId = String(previousTool?.id || "");
  const modeId = String(previousTool?.modeId || "");
  if (!toolId) return;
  await OBR.tool.activateTool(toolId).catch(() => {});
  if (modeId) await OBR.tool.activateMode(toolId, modeId).catch(() => {});
}

async function closeSpellPlacement(status, {
  error = "",
  reason = "",
  restoreTool = true,
} = {}) {
  const runtime = spellPlacementSession;
  if (!runtime) return;
  cancelDrag();
  for (const interaction of runtime.previewInteractions || []) interaction?.[1]?.();
  runtime.previewInteractions = [];
  runtime.rangePreview?.[1]?.();
  runtime.rangePreview = null;
  spellPlacementSession = null;
  const completed = completePlacementSession(runtime.session, status, error);
  await setSpellPlacementToolState(false);
  await sendSpellPlacementResult({
    requestId: completed.requestId,
    ruleId: completed.ruleId,
    spellId: completed.spellId,
    casterId: completed.casterId,
    ...(completed.ruleChoice ? { ruleChoice: completed.ruleChoice } : {}),
    ...(runtime.context && typeof runtime.context === "object"
      ? { context: runtime.context }
      : {}),
    status: completed.phase,
    preview: completed.preview,
    ...(completed.error ? { error: completed.error } : {}),
    ...(reason ? { reason } : {}),
  });
  if (restoreTool) await restoreSpellPlacementTool(completed.previousTool);
}

async function closeSpellZoneMovement(status, {
  error = "",
  reason = "",
  restoreTool = true,
} = {}) {
  const runtime = spellMovementSession;
  if (!runtime) return;
  cancelDrag();
  spellMovementSession = null;
  await setSpellMovementToolState(false);
  await sendSpellPlacementResult({
    requestId: runtime.requestId,
    ruleId: runtime.ruleId,
    spellId: runtime.rule?.spellId || "",
    casterId: runtime.casterId,
    instanceId: runtime.instanceId,
    zoneItemId: runtime.zoneItemId,
    status,
    ...(runtime.preview ? { preview: runtime.preview } : {}),
    ...(error ? { error } : {}),
    ...(reason ? { reason } : {}),
  });
  if (restoreTool) await restoreSpellPlacementTool(runtime.previousTool);
}

async function beginSpellPlacement(data) {
  const requestId = String(data?.requestId || "").trim();
  const ruleId = String(data?.ruleId || "").trim();
  const casterId = String(data?.casterId || "").trim();
  const ruleChoice = String(data?.ruleChoice || "").trim();
  if (!requestId || !ruleId) {
    await sendSpellPlacementResult({
      requestId,
      ruleId,
      status: "error",
      error: "placement-request-invalid",
    });
    return;
  }
  if (spellPlacementSession) {
    await sendSpellPlacementResult({
      requestId,
      ruleId,
      status: "error",
      error: "placement-session-busy",
    });
    return;
  }
  const placementContext = data?.context && typeof data.context === "object"
    ? data.context
    : null;
  const baseRule = getSpellAreaRuleById(ruleId);
  const rule = getSpellAreaRuleForPlacement(ruleId, ruleChoice, placementContext);
  const parentZoneId = String(placementContext?.parentZoneId || "").trim();
  const [parentZone] = parentZoneId
    ? await OBR.scene.items.getItems([parentZoneId]).catch(() => [])
    : [];
  const parentArea = parentZone ? translatedZoneArea(parentZone) : null;
  if (spellAreaPlacementParentUnavailable(placementContext, parentZone, parentArea)) {
    await sendSpellPlacementResult({
      requestId,
      ruleId,
      status: "error",
      error: "placement-parent-zone-unavailable",
      context: placementContext,
    });
    return;
  }
  if (
    baseRule?.placementChoices?.length
    && ruleChoice
    && !baseRule.placementChoices.some((choice) => choice.id === ruleChoice)
  ) {
    await sendSpellPlacementResult({
      requestId,
      ruleId,
      status: "error",
      error: "placement-choice-invalid",
    });
    return;
  }
  if (!rule) {
    await sendSpellPlacementResult({
      requestId,
      ruleId,
      status: "error",
      error: "placement-rule-unknown",
    });
    return;
  }
  const needsCaster = ["caster", "caster-adjacent"].includes(rule.placement.origin)
    || !!rule.placement.range;
  const caster = needsCaster ? await casterGeometry(casterId) : null;
  if (needsCaster && !caster) {
    await sendSpellPlacementResult({
      requestId,
      ruleId,
      status: "error",
      error: "placement-caster-unavailable",
    });
    return;
  }

  const [previousToolId, previousModeId] = await Promise.all([
    OBR.tool.getActiveTool().catch(() => ""),
    OBR.tool.getActiveToolMode().catch(() => ""),
  ]);
  const previousTool = {
    id: previousToolId,
    modeId: previousModeId,
  };
  let runtime = null;
  try {
    runtime = {
      session: createSpellAreaPlacementSession({
        requestId,
        rule,
        casterId,
        ruleChoice,
        previousToolId,
        previousModeId,
      }),
      rule,
      casterName: caster?.name || "",
      context: data?.context && typeof data.context === "object"
        ? data.context
        : null,
      parentArea,
      casterOrigin: caster?.center || null,
      casterBounds: caster?.bounds || null,
      rangePreview: null,
      batch: normalizedBatchObjects(data?.context).length
        ? {
          objects: normalizedBatchObjects(data?.context),
          positions: [],
        }
        : null,
      previewInteractions: [],
    };
    spellPlacementSession = runtime;
    const [dpiValue, scale] = await Promise.all([
      OBR.scene.grid.getDpi().catch(() => 150),
      OBR.scene.grid.getScale().catch(() => ({ parsed: { multiplier: 1.5, unit: "m" } })),
    ]);
    if (spellPlacementSession !== runtime) return;
    const dpi = Math.max(1, Number(dpiValue) || 150);
    const gridScale = {
      multiplier: Math.max(0, Number(scale?.parsed?.multiplier) || 1.5),
      unit: String(scale?.parsed?.unit || "m").trim(),
    };
    const rangePreview = await startSpellRangePreview({
      origin: runtime.casterOrigin,
      range: rule.placement.range,
      dpi,
      scale: gridScale,
      strokeWidth: Math.max(2, dpi * 0.035 * currentStyle.strokeWidth),
    });
    if (spellPlacementSession !== runtime) {
      rangePreview?.[1]?.();
      return;
    }
    runtime.rangePreview = rangePreview;
    await setSpellPlacementToolState(true);
    await OBR.tool.activateTool(TOOL_ID);
    await OBR.tool.activateMode(TOOL_ID, areaModeId(rule.geometry.shape));
  } catch (error) {
    if (spellPlacementSession !== runtime) return;
    const message = String(error?.message || error || "placement-start-failed");
    runtime?.rangePreview?.[1]?.();
    spellPlacementSession = null;
    await setSpellPlacementToolState(false);
    await sendSpellPlacementResult({
      requestId,
      ruleId,
      status: "error",
      error: message,
    });
    await restoreSpellPlacementTool(previousTool);
  }
}

async function beginSpellZoneMovement(data) {
  const requestId = String(data?.requestId || "").trim();
  const ruleId = String(data?.ruleId || "").trim();
  const casterId = String(data?.casterId || "").trim();
  const instanceId = String(data?.instanceId || "").trim();
  const zoneItemId = String(data?.zoneItemId || "").trim();
  if (!requestId || !ruleId || !instanceId || !zoneItemId) {
    await sendSpellPlacementResult({
      requestId,
      ruleId,
      status: "error",
      error: "movement-request-invalid",
    });
    return;
  }
  if (spellPlacementSession || spellMovementSession) {
    await sendSpellPlacementResult({
      requestId,
      ruleId,
      status: "error",
      error: "placement-session-busy",
    });
    return;
  }
  const rule = getSpellAreaRuleById(ruleId);
  const [zoneItem] = await OBR.scene.items.getItems([zoneItemId]).catch(() => []);
  const metadata = zoneItem?.metadata?.[SPELL_STATIC_ZONE_META_KEY];
  if (
    !rule
    || !zoneItem
    || metadata?.role !== "root"
    || String(metadata.instanceId || "") !== instanceId
    || (casterId && String(metadata.casterId || "") !== casterId)
  ) {
    await sendSpellPlacementResult({
      requestId,
      ruleId,
      status: "error",
      error: "movement-zone-stale",
    });
    return;
  }
  const [previousToolId, previousModeId, dpiValue, scale] = await Promise.all([
    OBR.tool.getActiveTool().catch(() => ""),
    OBR.tool.getActiveToolMode().catch(() => ""),
    OBR.scene.grid.getDpi().catch(() => 150),
    OBR.scene.grid.getScale().catch(() => ({ parsed: { multiplier: 1.5, unit: "m" } })),
  ]);
  const runtime = {
    requestId,
    ruleId,
    rule,
    casterId,
    instanceId,
    zoneItemId,
    zoneItem,
    initialPosition: point(zoneItem.position),
    contactTargetId: String(data?.contactTargetId || "").trim(),
    movementChoice: String(data?.movementChoice || "").trim(),
    sceneEpoch: Number.isFinite(Number(data?.sceneEpoch))
      ? Number(data.sceneEpoch)
      : currentSceneEpoch(),
    dpi: Math.max(1, Number(dpiValue) || 150),
    scale: {
      multiplier: Math.max(0, Number(scale?.parsed?.multiplier) || 1.5),
      unit: String(scale?.parsed?.unit || "m").trim(),
    },
    previousTool: { id: previousToolId, modeId: previousModeId },
    preview: null,
  };
  spellMovementSession = runtime;
  try {
    await setSpellMovementToolState(true);
    await OBR.tool.activateTool(TOOL_ID);
    await OBR.tool.activateMode(TOOL_ID, areaModeId(rule.geometry.shape));
  } catch (error) {
    if (spellMovementSession !== runtime) return;
    spellMovementSession = null;
    await setSpellMovementToolState(false);
    await sendSpellPlacementResult({
      requestId,
      ruleId,
      status: "error",
      error: String(error?.message || error || "movement-start-failed"),
    });
    await restoreSpellPlacementTool(runtime.previousTool);
  }
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
  if (area?.clippedToParent) return boundaryCommands(area.cells);
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

function spellRangePreviewPath(origin, radius, strokeWidth) {
  const preview = previewPath(
    "Portata incantesimo",
    0.04,
    0.9,
    Math.max(2, strokeWidth * 0.8),
    "#ef4444",
    "#ef4444",
  );
  preview.commands = geometryCommands({
    type: "circle",
    origin,
    radius,
  });
  return preview;
}

function radiusLabel(dpi, text = "", name = "Raggio AoE") {
  const width = Math.max(180, dpi * 3.2);
  const height = Math.max(64, dpi * 0.72);
  return buildText()
    .plainText(text)
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
    .name(name)
    .build();
}

async function startSpellRangePreview({
  origin = null,
  range = null,
  dpi = 150,
  scale = {},
  strokeWidth = 2,
} = {}) {
  const radius = spellAreaRangeCells(range, scale) * Math.max(1, Number(dpi) || 1);
  if (!origin || !(radius > 0)) return null;
  const path = spellRangePreviewPath(origin, radius, strokeWidth);
  const label = radiusLabel(
    dpi,
    `Gittata: ${formatMeasure(range.value)}m`,
    "Gittata incantesimo",
  );
  const width = Number(label.text?.width) || Math.max(180, dpi * 3.2);
  const height = Number(label.text?.height) || Math.max(64, dpi * 0.72);
  const gap = Math.max(8, dpi * 0.08);
  label.position = {
    x: origin.x - width / 2,
    y: origin.y - radius - height - gap,
  };
  return OBR.interaction.startItemInteraction([path, label]);
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

function updateConeOrigin(state) {
  if (state?.type !== "cone" || !state.originCellCenter) return;
  if (!state.spellPlacementRequestId && state.originSnapKind === "corner") {
    state.start = state.originCellCenter;
    return;
  }
  const sideDirection = state.rule?.placement?.origin === "caster-adjacent"
    && state.casterOrigin
    ? {
      x: state.casterOrigin.x - state.originCellCenter.x,
      y: state.casterOrigin.y - state.originCellCenter.y,
    }
    : {
      x: Number(state.rawEnd?.x) - state.originCellCenter.x,
      y: Number(state.rawEnd?.y) - state.originCellCenter.y,
    };
  if (!(Math.hypot(sideDirection.x, sideDirection.y) > 1e-9)) return;
  state.start = nearestGridCellSideCenter(
    state.originCellCenter,
    state.gridOrigin,
    state.dpi,
    sideDirection,
  ).position;
}

function fissureEndpoints(parentArea, rawStart, rawEnd) {
  const center = point(parentArea?.origin);
  const radius = Number(parentArea?.radius);
  if (!center || !Number.isFinite(radius) || radius <= 0) return null;
  const radial = {
    x: Number(rawStart?.x) - center.x,
    y: Number(rawStart?.y) - center.y,
  };
  const fallbackRadial = {
    x: Number(rawEnd?.x) - center.x,
    y: Number(rawEnd?.y) - center.y,
  };
  const radialLength = Math.hypot(radial.x, radial.y)
    || Math.hypot(fallbackRadial.x, fallbackRadial.y)
    || 1;
  const radialSource = Math.hypot(radial.x, radial.y) > 1e-9
    ? radial
    : fallbackRadial;
  const start = {
    x: center.x + radialSource.x * radius / radialLength,
    y: center.y + radialSource.y * radius / radialLength,
  };
  let direction = {
    x: Number(rawEnd?.x) - start.x,
    y: Number(rawEnd?.y) - start.y,
  };
  const inward = { x: center.x - start.x, y: center.y - start.y };
  if (
    !(Math.hypot(direction.x, direction.y) > 1e-9)
    || direction.x * inward.x + direction.y * inward.y <= 0
  ) {
    direction = inward;
  }
  const directionLength = Math.hypot(direction.x, direction.y) || 1;
  const normalized = {
    x: direction.x / directionLength,
    y: direction.y / directionLength,
  };
  const offset = { x: start.x - center.x, y: start.y - center.y };
  const distanceToExit = -2 * (
    offset.x * normalized.x + offset.y * normalized.y
  );
  if (!(distanceToExit > 0)) return null;
  return {
    start,
    end: {
      x: start.x + normalized.x * distanceToExit,
      y: start.y + normalized.y * distanceToExit,
    },
  };
}

function renderDrag(state) {
  if (!state?.ready || !state.interaction || !state.start || !state.end) return null;
  updateConeOrigin(state);
  if (state.spellPlacementRequestId) {
    if (
      state.context?.childKind === "fissure"
      && state.parentArea?.type === "circle"
      && point(state.parentArea.origin)
      && Number(state.parentArea.radius) > 0
    ) {
      const endpoints = fissureEndpoints(
        state.parentArea,
        state.rawStart,
        state.rawEnd,
      );
      if (endpoints) {
        state.start = endpoints.start;
        state.end = endpoints.end;
      }
    } else {
      state.end = constrainedSpellAreaEnd({
        shape: state.type,
        start: state.start,
        pointer: state.rawEnd,
        dpi: state.dpi,
        sizeCells: state.sizeCells,
      });
    }
  }
  let area = buildArea(
    state.type,
    state.start,
    state.end,
    state.dpi,
    state.gridOrigin,
    {
      widthSquares: state.widthCells,
      widthAnchor: state.rule?.geometry?.widthAnchor,
    },
  );
  if (state.context?.childKind === "fissure") {
    area = clipChildZoneAreaToParent({
      parentArea: state.parentArea,
      childArea: {
        ...area,
        centerlineStart: state.start,
        centerlineEnd: state.end,
      },
    });
  }
  state.area = area;
  const [update] = state.interaction;
  update((items) => {
    if (items[0]) items[0].commands = boundaryCommands(area.cells);
    if (items[1]) items[1].commands = geometryCommands(area);
    if (items[2]) {
      const worldDistance = area.squares * state.multiplier;
      items[2].text.plainText = state.measureLabel
        || `${formatMeasure(worldDistance)} ${state.unit}`.trim();
      const center = areaLabelPosition(area);
      const width = Number(items[2].text?.width) || Math.max(120, state.dpi * 2.4);
      const height = Number(items[2].text?.height) || Math.max(44, state.dpi * 0.48);
      items[2].position = { x: center.x - width / 2, y: center.y - height / 2 };
    }
  });
  return area;
}

function boardTokenGridVertex(pointer, gridOrigin, dpi) {
  return nearestGridCorner(pointer, gridOrigin, dpi)?.position || null;
}

function boardTokenPlacementSnap(pointer, gridOrigin, dpi, rule) {
  const objectSize = getAnimatedObjectSize(
    activeDrag?.context?.objectSize || spellPlacementSession?.context?.objectSize,
  );
  const spaceCells = Math.max(0.5, Number(
    objectSize?.spaceCells || rule?.boardToken?.spaceCells,
  ) || 1);
  const snapToVertex = spaceCells === 0.5 || spaceCells > 1;
  return snapToVertex
    ? boardTokenGridVertex(pointer, gridOrigin, dpi)
    : nearestGridCellCenter(pointer, gridOrigin, dpi)?.position || null;
}

function renderBoardTokenPlacement(state) {
  if (!state?.ready || !state.interaction || !state.gridOrigin) return null;
  const position = boardTokenPlacementSnap(
    state.rawEnd || state.rawStart,
    state.gridOrigin,
    state.dpi,
    state.rule,
  ) || state.start;
  if (!position) return null;
  state.start = position;
  state.end = position;
  state.boardTokenPosition = position;
  const [update] = state.interaction;
  update((items) => {
    if (items[0]) items[0].position = { ...position };
  });
  return position;
}

function proposedMovementPosition(state) {
  const runtime = spellMovementSession;
  if (!runtime?.initialPosition || !state?.rawStart || !state?.rawEnd) return null;
  return {
    x: runtime.initialPosition.x + state.rawEnd.x - state.rawStart.x,
    y: runtime.initialPosition.y + state.rawEnd.y - state.rawStart.y,
  };
}

function renderMovementDrag(state) {
  const runtime = spellMovementSession;
  if (
    !runtime
    || activeDrag !== state
    || !state?.ready
    || !state.interaction
    || !state.rawStart
    || !state.rawEnd
  ) return null;
  const proposed = proposedMovementPosition(state);
  const area = translatedZoneArea(runtime.zoneItem, proposed);
  if (!area) return null;
  state.proposedPosition = proposed;
  state.area = area;
  const distance = spellZoneMovementDistanceMeters(
    runtime.initialPosition,
    proposed,
    runtime.dpi,
    runtime.scale,
  );
  const [update] = state.interaction;
  update((items) => {
    if (items[0]) items[0].commands = boundaryCommands(area.cells);
    if (items[1]) items[1].commands = geometryCommands(area);
    if (items[2]) {
      const maximum = runtime.rule.zonePolicy.movement.maximumMeters;
      items[2].text.plainText = `${formatMeasure(distance)} / ${formatMeasure(maximum)} m`;
      const center = areaLabelPosition(area);
      const width = Number(items[2].text?.width) || Math.max(120, runtime.dpi * 2.4);
      const height = Number(items[2].text?.height) || Math.max(44, runtime.dpi * 0.48);
      items[2].position = { x: center.x - width / 2, y: center.y - height / 2 };
    }
  });
  return area;
}

async function prepareMovementDrag(state) {
  const runtime = spellMovementSession;
  if (!runtime || activeDrag !== state || state.cancelled) return;
  try {
    const style = spellAreaStyle(runtime.rule.spellId, currentStyle);
    const outlineWidth = Math.max(2, runtime.dpi * 0.035 * style.strokeWidth);
    state.interaction = await OBR.interaction.startItemInteraction([
      previewPath("Area sagomata", style.fillOpacity, 0.95, outlineWidth, style.fillColor, style.strokeColor),
      previewPath("Sagoma geometrica", 0, 0.9, Math.max(2, outlineWidth * 0.72), style.fillColor, style.strokeColor),
      radiusLabel(runtime.dpi, "", "Distanza movimento zona"),
    ]);
    if (activeDrag !== state || spellMovementSession !== runtime || state.cancelled) {
      state.interaction?.[1]?.();
      return;
    }
    state.ready = true;
    renderMovementDrag(state);
    if (state.ended) finishMovementDrag(state);
  } catch (error) {
    if (activeDrag === state) activeDrag = null;
    console.warn("[aoe-target] movement preview error:", error?.message || error);
  }
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
    const boardTokenPlacement = isBoardTokenPlacement(state.rule);
    const ruleWidthCells = state.rule?.geometry?.width
      ? spellAreaGridCells(state.rule.geometry.width, {
        multiplier: state.multiplier,
        unit: state.unit,
      })
      : 0;
    const snapToVertex = state.rule?.placement?.snapOrigin === "vertex"
      || state.rule?.placement?.snap === "vertex"
      || (state.spellPlacementRequestId && state.type === "square")
      || (state.spellPlacementRequestId && state.type === "line" && ruleWidthCells > 1);
    const snapped = state.rule?.placement?.origin === "caster-adjacent"
      ? nearestGridCellCenter(state.rawStart, corner, state.dpi)
      : boardTokenPlacement
        ? {
          position: boardTokenPlacementSnap(state.rawStart, corner, state.dpi, state.rule),
          gridOrigin: corner,
        }
      : snapToVertex
        ? nearestGridCorner(state.rawStart, corner, state.dpi)
        : !state.spellPlacementRequestId && state.type === "cone"
          ? nearestGridSnap(state.rawStart, corner, state.dpi)
          : nearestGridSnap(state.rawStart, corner, state.dpi);
    state.originCellCenter = snapped?.position || corner;
    state.originSnapKind = snapped?.kind || (snapToVertex ? "corner" : "center");
    state.start = state.originCellCenter;
    state.gridOrigin = snapped?.gridOrigin || corner;
    if (state.spellPlacementRequestId) {
      state.sizeCells = spellAreaGridCells(state.rule.geometry.size, {
        multiplier: state.multiplier,
        unit: state.unit,
      });
      state.widthCells = spellAreaGridCells(state.rule.geometry.width, {
        multiplier: state.multiplier,
        unit: state.unit,
      });
      state.measureLabel = `${formatMeasure(state.rule.geometry.size.value)} m`;
      if (
        state.rule.placement.origin === "caster-adjacent"
        && !spellAreaOriginAdjacentToCaster({
          origin: state.originCellCenter,
          casterBounds: state.casterBounds,
          dpi: state.dpi,
        })
      ) {
        state.cancelled = true;
        if (activeDrag === state) activeDrag = null;
        await OBR.notification.show(
          "Scegli una casella adiacente al caster come origine.",
          "WARNING",
        );
        return;
      }
      updateConeOrigin(state);
      const inRange = spellAreaOriginWithinRange({
        origin: state.start,
        casterOrigin: state.casterOrigin,
        range: state.rule.placement.range,
        dpi: state.dpi,
        scale: {
          multiplier: state.multiplier,
          unit: state.unit,
        },
      });
      if (!inRange) {
        state.cancelled = true;
        if (activeDrag === state) activeDrag = null;
        await OBR.notification.show("Il punto scelto supera la portata dell'incantesimo.", "WARNING");
        return;
      }
    }
    state.style = state.spellPlacementRequestId
      ? spellAreaStyle(state.rule?.spellId, currentStyle)
      : { ...currentStyle };
    if (boardTokenPlacement) {
      const { buildSpellBoardTokenItem } = await import("./spellBoardToken.js");
      const previewToken = buildSpellBoardTokenItem({
        spellId: state.rule.spellId,
        instanceId: `preview:${state.spellPlacementRequestId}`,
        casterId: spellPlacementSession?.session?.casterId || "preview-caster",
        casterName: spellPlacementSession?.casterName || "",
        casterHpMax: 1,
        objectSize: state.context?.objectSize || "",
        position: state.start,
      });
      previewToken.locked = true;
      previewToken.disableHit = true;
      const batch = spellPlacementSession?.batch;
      const currentObject = currentBatchObject(spellPlacementSession);
      previewToken.name = batch
        ? `Anteprima: ${currentObject?.label || state.rule.boardToken?.label || state.rule.spellId} (${batch.positions.length + 1}/${batch.objects.length})`
        : `Anteprima: ${state.rule.boardToken?.label || state.rule.spellId}`;
      state.interaction = await OBR.interaction.startItemInteraction([previewToken]);
      if (activeDrag !== state || state.cancelled) {
        state.interaction[1]();
        return;
      }
      state.ready = true;
      renderBoardTokenPlacement(state);
      if (state.ended) await finishDrag(state);
      return;
    }
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
  const boardToken = item?.metadata?.[SPELL_BOARD_TOKEN_META_KEY];
  const isHPBoardToken = item?.layer === "PROP"
    && !item?.attachedTo
    && boardToken?.kind === "spell-board-token"
    && Number.isFinite(Number(meta?.hpMax));
  // La membership geometrica identifica i token nell'area; la disponibilità
  // di hp/hpMax appartiene alla validazione dell'effetto che verrà applicato.
  return isHPBoardToken || (
    item?.layer === "CHARACTER"
      && !item?.attachedTo
      && !!meta
      && (meta.inInitiative === true || orderedSet.has(item.id))
  );
}

async function findHitTargetIds(area, rule = null) {
  const sceneMetadata = await OBR.scene.getMetadata().catch(() => ({}));
  const order = sceneMetadata?.[STATE_KEY]?.order || [];
  const orderedSet = new Set(order.map((id) => String(id).split("::p")[0]));
  const candidates = await OBR.scene.items.getItems((item) => trackedInitiativeItem(item, orderedSet));
  const bounds = await Promise.all(candidates.map(async (item) => {
    try { return await OBR.scene.items.getItemBounds([item.id]); }
    catch { return null; }
  }));
  const containsOnly = rule?.zonePolicy?.membershipTargeting?.containment === "fully-inside";
  return candidates
    .filter((item, index) => containsOnly
      ? areaContainsBounds(area, bounds[index])
      : areaHitsBounds(area, bounds[index]))
    .map((item) => item.id);
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
    ...(state.widthCells > 0 ? { widthSquares: state.widthCells } : {}),
    ...(state.rule?.geometry?.widthAnchor === "edge" ? { widthAnchor: "edge" } : {}),
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
    {
      widthSquares: metadata.widthSquares,
      widthAnchor: metadata.widthAnchor,
    },
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

async function mountPersistentAreaListener() {
  const initialAreas = await OBR.scene.items.getItems(
    (item) => !!item?.metadata?.[AREA_META_KEY]?.type,
  ).catch(() => []);
  for (const item of initialAreas) {
    areaTransforms.set(item.id, transformSignature(item));
  }

  subscribeSceneItemChanges((event) => {
    for (const item of event?.removedItems || []) {
      if (item?.metadata?.[AREA_META_KEY]?.type) areaTransforms.delete(item.id);
    }
    for (const item of event?.items || []) {
      if (!item?.metadata?.[AREA_META_KEY]?.type) continue;
      const next = transformSignature(item);
      const previous = areaTransforms.get(item.id);
      areaTransforms.set(item.id, next);
      if (previous && !sameTransform(previous, next)) scheduleMovedAreaSelection(item);
    }
  }, {
    domains: ["zone"],
    immediate: true,
    filter: (event) => [
      ...(event?.items || []),
      ...(event?.removedItems || []),
    ].some((item) => !!item?.metadata?.[AREA_META_KEY]?.type),
  });
}

async function finishDrag(state) {
  if (activeDrag !== state || state.finishing || !state.ready) return;
  state.finishing = true;
  if (
    state.spellPlacementRequestId
    && isBoardTokenPlacement(state.rule)
    && spellPlacementSession?.session?.requestId === state.spellPlacementRequestId
  ) {
    const position = renderBoardTokenPlacement(state);
    if (!position) return;
    if (!spellAreaOriginWithinRange({
      origin: position,
      casterOrigin: spellPlacementSession.casterOrigin,
      range: state.rule.placement.range,
      dpi: state.dpi,
      scale: { multiplier: state.multiplier, unit: state.unit },
    })) {
      state.finishing = false;
      await OBR.notification.show(
        "La casella scelta supera la portata dell'incantesimo.",
        "WARNING",
      );
      return;
    }
    const batch = spellPlacementSession.batch;
    if (batch?.objects?.length) {
      const object = currentBatchObject(spellPlacementSession);
      if (!object) {
        state.finishing = false;
        return;
      }
      batch.positions = [
        ...batch.positions,
        {
          position,
          objectSize: object.id,
          ordinal: batch.positions.length,
        },
      ];
      spellPlacementSession.session = reviewSpellAreaPlacement(
        spellPlacementSession.session,
        {
          type: "square",
          start: position,
          end: position,
          position,
          dpi: state.dpi,
          gridOrigin: state.gridOrigin,
          positions: batch.positions,
          targetIds: [],
        },
      );
      if (state.interaction) spellPlacementSession.previewInteractions.push(state.interaction);
      state.interaction = null;
      activeDrag = null;
      await sendSpellPlacementProgress(spellPlacementSession);
      return;
    }
    spellPlacementSession.session = reviewSpellAreaPlacement(
      spellPlacementSession.session,
      {
        type: "square",
        start: position,
        end: position,
        position,
        dpi: state.dpi,
        gridOrigin: state.gridOrigin,
        targetIds: [],
      },
    );
    return;
  }
  const area = renderDrag(state);
  if (
    area
    && state.spellPlacementRequestId
    && spellPlacementSession?.session?.requestId === state.spellPlacementRequestId
  ) {
    spellPlacementSession.session = reviewSpellAreaPlacement(
      spellPlacementSession.session,
      {
        type: state.type,
        start: state.start,
        end: state.end,
        ...(area.type === "circle" ? { radius: area.radius } : {}),
        dpi: state.dpi,
        gridOrigin: state.gridOrigin,
        widthSquares: state.widthCells,
      },
    );
    return;
  }
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

function finishMovementDrag(state) {
  const runtime = spellMovementSession;
  if (activeDrag !== state || state.finishing || !state.ready || !runtime) return;
  state.finishing = true;
  const area = renderMovementDrag(state);
  state.interaction?.[1]?.();
  activeDrag = null;
  if (!area || !state.proposedPosition) return;
  runtime.preview = {
    initialPosition: { ...runtime.initialPosition },
    proposedPosition: { ...state.proposedPosition },
    dpi: runtime.dpi,
    scale: { ...runtime.scale },
    ...(runtime.contactTargetId ? { contactTargetId: runtime.contactTargetId } : {}),
    ...(runtime.movementChoice ? { movementChoice: runtime.movementChoice } : {}),
    sceneEpoch: runtime.sceneEpoch,
  };
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
  if (spellMovementSession) {
    const state = {
      movement: true,
      rawStart: pointer,
      rawEnd: pointer,
      ready: false,
      ended: false,
      cancelled: false,
      finishing: false,
      interaction: null,
      area: null,
      proposedPosition: null,
    };
    activeDrag = state;
    void prepareMovementDrag(state);
    return;
  }
  const placement = spellPlacementSession;
  const constrained = !!placement;
  const effectiveType = constrained ? placement.rule.geometry.shape : type;
  const rawStart = constrained && placement.rule.placement.origin === "caster"
    ? placement.casterOrigin
    : pointer;
  const batchObject = currentBatchObject(placement);
  const placementContext = placement
    ? {
      ...(placement.context && typeof placement.context === "object" ? placement.context : {}),
      ...(batchObject
        ? {
          objectSize: batchObject.id,
          objectIndex: placement.batch.positions.length,
          objectCount: placement.batch.objects.length,
        }
        : {}),
    }
    : null;
  const state = {
    type: effectiveType,
    rawStart,
    rawEnd: pointer,
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
    originCellCenter: null,
    originSnapKind: "center",
    spellPlacementRequestId: constrained ? placement.session.requestId : "",
    rule: constrained ? placement.rule : null,
    context: placementContext,
    parentArea: constrained ? placement.parentArea : null,
    casterOrigin: constrained ? placement.casterOrigin : null,
    casterBounds: constrained ? placement.casterBounds : null,
    sizeCells: 0,
    widthCells: 0,
    measureLabel: "",
  };
  activeDrag = state;
  void prepareDrag(state);
}

function moveDrag(event) {
  const pointer = point(event?.pointerPosition);
  if (!activeDrag || !pointer) return;
  activeDrag.rawEnd = pointer;
  activeDrag.end = pointer;
  if (activeDrag.movement) renderMovementDrag(activeDrag);
  else if (isBoardTokenPlacement(activeDrag.rule)) renderBoardTokenPlacement(activeDrag);
  else renderDrag(activeDrag);
}

function endDrag(event) {
  const state = activeDrag;
  if (!state) return;
  const pointer = point(event?.pointerPosition);
  state.rawEnd = pointer || state.rawEnd;
  state.end = pointer || state.end;
  state.ended = true;
  if (state.ready) {
    if (state.movement) finishMovementDrag(state);
    else void finishDrag(state);
  }
}

async function confirmSpellZoneMovement() {
  const runtime = spellMovementSession;
  if (!runtime?.preview) {
    await OBR.notification.show("Trascina la zona prima di confermare il movimento.", "WARNING");
    return;
  }
  await closeSpellZoneMovement("confirmed");
}

async function confirmSpellPlacement() {
  const runtime = spellPlacementSession;
  const state = activeDrag;
  if (runtime && isBoardTokenPlacement(runtime.rule)) {
    if (runtime.batch?.objects?.length) {
      if (runtime.batch.positions.length !== runtime.batch.objects.length || !runtime.session.preview) {
        await OBR.notification.show(
          `Posiziona tutti gli oggetti prima di confermare (${runtime.batch.positions.length}/${runtime.batch.objects.length}).`,
          "WARNING",
        );
        return;
      }
      await closeSpellPlacement("confirmed");
      return;
    }
    if (
      !state?.ended
      || !state?.boardTokenPosition
      || state.spellPlacementRequestId !== runtime.session.requestId
      || !runtime.session.preview
    ) {
      await OBR.notification.show("Scegli prima la casella del token.", "WARNING");
      return;
    }
    await closeSpellPlacement("confirmed");
    return;
  }
  if (
    !runtime
    || !state?.ended
    || !state?.area
    || state.spellPlacementRequestId !== runtime.session.requestId
  ) {
    await OBR.notification.show("Posiziona prima la sagoma dell'incantesimo.", "WARNING");
    return;
  }
  const area = renderDrag(state);
  if (runtime.context?.childKind && !validateChildZoneContainment({
    parentArea: runtime.parentArea,
    childArea: area,
    childKind: runtime.context.childKind,
  })) {
    await OBR.notification.show(
      "La sottozona deve restare contenuta nella zona madre e attraversarla da bordo a bordo.",
      "WARNING",
    );
    return;
  }
  const hitTargetIds = await findHitTargetIds(area, runtime.rule);
  const targetIds = runtime.rule.targeting.includeCaster
    ? hitTargetIds
    : hitTargetIds.filter((id) => id !== runtime.session.casterId);
  runtime.session = reviewSpellAreaPlacement(runtime.session, {
    type: state.type,
    start: state.start,
    end: state.end,
    ...(area.type === "circle" ? { radius: area.radius } : {}),
    dpi: state.dpi,
    gridOrigin: state.gridOrigin,
    widthSquares: state.widthCells,
    ...(state.context?.childKind === "fissure" && state.parentArea?.type === "circle"
      ? {
        parentClip: {
          type: "circle",
          origin: point(state.parentArea.origin),
          radius: Number(state.parentArea.radius),
        },
      }
      : {}),
    targetIds,
  });
  await closeSpellPlacement("confirmed");
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
    onKeyDown: (_context, event) => {
      if (event?.key === "Escape" && (spellPlacementSession || spellMovementSession)) {
        if (spellPlacementSession) {
          void closeSpellPlacement("cancelled", { reason: "escape" });
        } else {
          void closeSpellZoneMovement("cancelled", { reason: "escape" });
        }
      }
    },
  };
}

OBR.onReady(async () => {
  if (await OBR.player.getRole() !== "GM") return;
  await mountPersistentAreaListener();
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
  try { await OBR.tool.removeAction(SPELL_PLACEMENT_CONFIRM_ACTION_ID); } catch {}
  try { await OBR.tool.removeAction(SPELL_PLACEMENT_CANCEL_ACTION_ID); } catch {}
  try { await OBR.tool.removeAction(SPELL_MOVEMENT_CONFIRM_ACTION_ID); } catch {}
  try { await OBR.tool.removeAction(SPELL_MOVEMENT_CANCEL_ACTION_ID); } catch {}
  try { await OBR.contextMenu.remove(RESELECT_CONTEXT_ID); } catch {}
  try { await OBR.contextMenu.remove(CONDITIONS_CONTEXT_ID); } catch {}
  try { await OBR.contextMenu.remove(SPELLS_CONTEXT_ID); } catch {}
  try { await OBR.contextMenu.remove(QUICK_HP_CONTEXT_ID); } catch {}
  await OBR.tool.create({
    id: TOOL_ID,
    icons: [{ icon: "/aoe-target.svg", label: "Targeting area", filter: { roles: ["GM"] } }],
    defaultMode: MODE_IDS.circle,
    defaultMetadata: {
      [SPELL_PLACEMENT_META_KEY]: false,
    },
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
  await OBR.tool.createAction({
    id: SPELL_PLACEMENT_CONFIRM_ACTION_ID,
    icons: [{
      icon: "/aoe-confirm.svg",
      label: "Conferma posizionamento",
      filter: {
        activeTools: [TOOL_ID],
        roles: ["GM"],
        metadata: [{
          key: SPELL_PLACEMENT_META_KEY,
          operator: "==",
          value: true,
        }],
      },
    }],
    onClick: () => void confirmSpellPlacement(),
  });
  await OBR.tool.createAction({
    id: SPELL_PLACEMENT_CANCEL_ACTION_ID,
    icons: [{
      icon: "/aoe-cancel.svg",
      label: "Annulla sagoma",
      filter: {
        activeTools: [TOOL_ID],
        roles: ["GM"],
        metadata: [{
          key: SPELL_PLACEMENT_META_KEY,
          operator: "==",
          value: true,
        }],
      },
    }],
    onClick: () => void closeSpellPlacement("cancelled", { reason: "action" }),
  });
  await OBR.tool.createAction({
    id: SPELL_MOVEMENT_CONFIRM_ACTION_ID,
    icons: [{
      icon: "/aoe-confirm.svg",
      label: "Conferma movimento zona",
      filter: {
        activeTools: [TOOL_ID],
        roles: ["GM"],
        metadata: [{
          key: SPELL_MOVEMENT_META_KEY,
          operator: "==",
          value: true,
        }],
      },
    }],
    onClick: () => void confirmSpellZoneMovement(),
  });
  await OBR.tool.createAction({
    id: SPELL_MOVEMENT_CANCEL_ACTION_ID,
    icons: [{
      icon: "/aoe-cancel.svg",
      label: "Annulla movimento zona",
      filter: {
        activeTools: [TOOL_ID],
        roles: ["GM"],
        metadata: [{
          key: SPELL_MOVEMENT_META_KEY,
          operator: "==",
          value: true,
        }],
      },
    }],
    onClick: () => void closeSpellZoneMovement("cancelled", { reason: "action" }),
  });
  OBR.tool.onToolChange((toolId) => {
    if (spellPlacementSession && toolId !== TOOL_ID) {
      void closeSpellPlacement("cancelled", {
        reason: "tool-changed",
        restoreTool: false,
      });
    }
    if (spellMovementSession && toolId !== TOOL_ID) {
      void closeSpellZoneMovement("cancelled", {
        reason: "tool-changed",
        restoreTool: false,
      });
    }
  });
  OBR.broadcast.onMessage(SPELL_AREA_PLACEMENT_CHANNEL, (event) => {
    const data = event?.data || {};
    if (data.type === "start") {
      const requestId = String(data.requestId || "").trim();
      const activeRequestId = String(
        spellPlacementSession?.session?.requestId || "",
      ).trim();
      if (
        requestId
        && (
          spellPlacementStartingRequests.has(requestId)
          || activeRequestId === requestId
        )
      ) {
        void sendSpellPlacementAccepted(data);
      } else if (
        requestId
        && spellPlacementStartingRequests.size
      ) {
        void sendSpellPlacementAccepted(data);
        void sendSpellPlacementResult({
          requestId,
          ruleId: String(data.ruleId || "").trim(),
          status: "error",
          error: "placement-session-busy",
        });
      } else {
        if (requestId) spellPlacementStartingRequests.add(requestId);
        void sendSpellPlacementAccepted(data);
        void beginSpellPlacement(data).finally(() => {
          if (requestId) spellPlacementStartingRequests.delete(requestId);
        });
      }
    }
    if (data.type === "move-start") void beginSpellZoneMovement(data);
    if (
      data.type === "cancel"
      && (
        spellPlacementSession?.session?.requestId === String(data.requestId || "")
        || spellMovementSession?.requestId === String(data.requestId || "")
      )
    ) {
      if (spellPlacementSession?.session?.requestId === String(data.requestId || "")) {
        void closeSpellPlacement("cancelled", { reason: "request" });
      } else {
        void closeSpellZoneMovement("cancelled", { reason: "request" });
      }
    }
    if (
      data.type === "confirm"
      && spellPlacementSession?.session?.requestId === String(data.requestId || "")
    ) {
      void confirmSpellPlacement();
    }
    if (
      data.type === "move-confirm"
      && spellMovementSession?.requestId === String(data.requestId || "")
    ) {
      void confirmSpellZoneMovement();
    }
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
      label: "Seleziona e apri Console effetti ad area",
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
