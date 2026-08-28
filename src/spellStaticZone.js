import OBR, { buildPath, Command } from "@owlbear-rodeo/sdk";
import { sendProjectedReminderPayload } from "./options/reminderProjectionBroadcast.js";
import {
  areaIntersectsSegment,
  buildArea,
  buildCellBoundaryLoops,
  areaHitsBounds,
} from "./aoeGeometryCore.js";
import { AOE_AREA_META_KEY, loadAoEStyle, normalizeAoEStyle } from "./aoeStyle.js";
import {
  ID,
  REMINDER_HISTORY_REARM_CHANNEL,
  RUNTIME_CACHE_CLEANUP_CHANNEL,
  SPELL_ZONE_TRIGGER_NOTICE_CHANNEL,
} from "./constants.js";
import { queueSpellAreaEffectsMutation } from "./spellAreaMutationQueue.js";
import {
  areaMembershipEffectIds,
  areaMembershipPlan,
  areaMembershipTargetIds,
  staleAreaMembershipEffectRemovals,
} from "./spellAreaMembershipCore.js";
import {
  getSpellAreaRuleById,
  getSpellAreaRuleForPlacement,
  SPELL_AREA_RULES,
} from "./spellAreaRules.js";
import { spellAreaStyle } from "./spellAreaStyleCore.js";
import {
  SPELL_STATIC_ZONE_META_KEY,
  activeSpellInstanceIds,
  isStaticSpellZoneRule,
  staleStaticSpellZoneItemIds,
  staticSpellZoneItems,
  staticSpellZoneMetadata,
  scopedStaticSpellZoneTargetIds,
  spellStaticZoneFollowCasterPosition,
  translatedZoneArea,
  translatedZoneTriggerAreas,
} from "./spellStaticZoneCore.js";
import {
  SPELL_BOARD_TOKEN_META_KEY,
  spellBoardTokenItems,
} from "./spellBoardTokenCore.js";
import {
  SPELL_ZONE_TRIGGER_WORKFLOW_ENABLED,
  normalizeSpellZoneTriggerRuntime,
} from "./spellZoneTriggerCore.js";
import {
  clipChildZoneAreaToParent,
  isSpellChildZoneMetadata,
  spellChildZoneMetadata,
} from "./spellChildZoneCore.js";
import {
  mergeStaticSpellZoneReminderMetadata,
  planStaticSpellZoneReminder,
  rearmedStaticSpellZoneNotices,
} from "./spellStaticZoneReminderCore.js";
import { createSceneItemBoundsCache } from "./sceneItemBoundsCache.js";
import { runStaticSpellZoneRemovalTransaction } from "./staticSpellZoneRemovalCore.js";
import { subscribeSceneItemChanges } from "./sceneItemEvents.js";
import { currentSceneEpoch, isCurrentSceneEpoch } from "./sceneEpoch.js";
import { currentInitiativeTurnKey } from "./turnBoundaryCore.js";
import { itemHasEffectiveMovementMode } from "./movementProfileItemCore.js";
import {
  createSceneMetadataKeyWatcher,
  sceneMetadataKeyDigest,
} from "./sceneMetadataDigest.js";

const RECONCILE_DELAY_MS = 80;
const RECONCILE_WATCHDOG_MS = 5000;
const RECONCILE_RECOVERY_DELAY_MS = 250;
const ITEM_BOUNDS_TIMEOUT_MS = 1200;
const META_KEY = `${ID}/meta`;
const STATE_KEY = `${ID}/state`;
const CONCENTRATION_KEY = `${ID}/concentration`;
const HISTORY_CONTROL_CHANNEL = `${ID}/history-control`;
const MAX_HISTORY_UNDO_MOVEMENT_SUPPRESSIONS = 8;

function spellZoneLifecycleEffectIds() {
  return [...new Set(SPELL_AREA_RULES
    .filter((rule) => rule.kind === "zone")
    .flatMap((rule) => [
      ...areaMembershipEffectIds(rule),
      ...(Array.isArray(rule.zonePolicy?.triggers) ? rule.zonePolicy.triggers : [])
        .filter((trigger) => trigger?.removeLinkedConditionOnLeave === true)
        .map((trigger) => trigger.id),
    ])
    .filter(Boolean))];
}

let mounted = false;
let running = false;
let requested = false;
let pumpPromise = null;
let timer = null;
let watchdogTimer = null;
let recoveryTimer = null;
let unsubscribeItems = null;
let unsubscribeImmediateMovement = null;
let unsubscribeSceneReady = null;
let unsubscribeSceneMetadata = null;
let unsubscribeRuntimeCacheCleanup = null;
let unsubscribeRuntimeHistoryRearm = null;
let unsubscribeRuntimeHistoryUndo = null;
let queuedSceneMetadata = null;
let queuedSceneItems = null;
let queuedSceneGeneration = 0;
let queuedReconcileReason = "event";
let queuedReconcileForce = false;
const queuedRearmActivationIds = new Set();
const queuedHistoryUndoMovementSuppressions = [];
const queuedMovementRecords = new Map();
const pendingHistoryUndoMovementSuppressions = new Map();
let historyUndoRuntimeIdentity = null;
let activeSceneItemsOverride = null;
let activeSceneGeneration = 0;
let activeReconcileForce = false;
let completedGenerationKey = null;
const stateMetadataWatcher = createSceneMetadataKeyWatcher(STATE_KEY);
let fallbackGeneration = 0;
const undoRestoredActivationIds = new Set();
const sceneItemBounds = createSceneItemBoundsCache(
  (itemId) => OBR.scene.items.getItemBounds([itemId]),
  { timeoutMs: ITEM_BOUNDS_TIMEOUT_MS },
);

function scheduleStaticSpellZoneWatchdog(needsWatchdog) {
  if (watchdogTimer) clearTimeout(watchdogTimer);
  watchdogTimer = null;
  if (!mounted || !needsWatchdog) return;
  watchdogTimer = setTimeout(() => {
    watchdogTimer = null;
    requestStaticSpellZoneReconcile({ reason: "watchdog", force: true });
  }, RECONCILE_WATCHDOG_MS);
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
  if (area?.clippedToParent || area?.ring || area?.areaRole === "side-band") {
    return boundaryCommands(area.cells);
  }
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

function point(value) {
  const x = Number(value?.x);
  const y = Number(value?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function samePoint(left, right) {
  return !!left && !!right && left.x === right.x && left.y === right.y;
}

function queueMovementRecords(event) {
  if (event?.flags?.movement !== true) return;
  for (const record of Array.isArray(event?.changedRecords)
    ? event.changedRecords
    : []) {
    const beforeItem = record?.before?.item;
    const afterItem = record?.after?.item;
    const id = String(afterItem?.id || beforeItem?.id || "").trim();
    const beforePosition = point(beforeItem?.position);
    const afterPosition = point(afterItem?.position);
    if (!id || !beforePosition || !afterPosition || samePoint(beforePosition, afterPosition)) {
      continue;
    }
    const previous = queuedMovementRecords.get(id);
    queuedMovementRecords.set(id, {
      id,
      beforePosition: previous?.beforePosition || beforePosition,
      afterPosition,
      item: afterItem || previous?.item || null,
    });
  }
}

function installHistoryUndoMovementSuppressions(data) {
  const requestId = String(data?.requestId || "").trim();
  if (!requestId) return;
  const requestedUntil = Number(data?.until);
  const until = Math.max(Date.now() + 500, Number.isFinite(requestedUntil) ? requestedUntil : 0);
  const sceneEpoch = Number(data?.sceneEpoch);
  const sceneIdentity = String(data?.sceneIdentity || "").trim();
  if (
    sceneIdentity
    && historyUndoRuntimeIdentity
    && sceneIdentity !== historyUndoRuntimeIdentity
  ) {
    pendingHistoryUndoMovementSuppressions.clear();
    queuedHistoryUndoMovementSuppressions.length = 0;
    return;
  }
  if (sceneIdentity) historyUndoRuntimeIdentity = sceneIdentity;
  for (const rawId of Array.isArray(data?.ids) ? data.ids : []) {
    const id = String(rawId || "").trim();
    const positions = (Array.isArray(data?.positions?.[id]) ? data.positions[id] : [])
      .map(point)
      .filter(Boolean);
    if (!id || !positions.length) continue;
    const records = pendingHistoryUndoMovementSuppressions.get(id) || [];
    records.push({
      requestId,
      id,
      positions,
      until,
      ...(Number.isSafeInteger(sceneEpoch) ? { sceneEpoch } : {}),
      ...(sceneIdentity ? { sceneIdentity } : {}),
    });
    pendingHistoryUndoMovementSuppressions.set(
      id,
      records.slice(-MAX_HISTORY_UNDO_MOVEMENT_SUPPRESSIONS),
    );
  }
}

function consumeHistoryUndoMovementSuppressions(event) {
  if (!event?.flags?.movement) return;
  const eventEpoch = event?.sceneEpoch ?? currentSceneEpoch();
  if (!isCurrentSceneEpoch(eventEpoch)) return;
  for (const record of Array.isArray(event?.changedRecords) ? event.changedRecords : []) {
    const afterItem = record?.after?.item;
    const beforePosition = point(record?.before?.item?.position);
    const afterPosition = point(afterItem?.position);
    const id = String(afterItem?.id || record?.before?.item?.id || "").trim();
    if (!id || !beforePosition || !afterPosition || samePoint(beforePosition, afterPosition)) continue;
    const now = Date.now();
    const pending = pendingHistoryUndoMovementSuppressions.get(id) || [];
    const validPending = pending.filter((suppression) => (
      suppression.until > now
      && (!Number.isSafeInteger(suppression.sceneEpoch)
        || suppression.sceneEpoch === Number(eventEpoch))
    ));
    const matchingIndex = validPending.findIndex((suppression) => (
      suppression.positions.some((position) => samePoint(position, afterPosition))
    ));
    if (matchingIndex < 0) {
      // Un movimento dello stesso item verso un'altra posizione rende obsoleto
      // il contesto Undo: non deve riapparire su una successiva entrata reale.
      pendingHistoryUndoMovementSuppressions.delete(id);
      for (let index = queuedHistoryUndoMovementSuppressions.length - 1; index >= 0; index -= 1) {
        if (queuedHistoryUndoMovementSuppressions[index]?.id === id) {
          queuedHistoryUndoMovementSuppressions.splice(index, 1);
        }
      }
      continue;
    }
    const [suppression] = validPending.splice(matchingIndex, 1);
    if (validPending.length) pendingHistoryUndoMovementSuppressions.set(id, validPending);
    else pendingHistoryUndoMovementSuppressions.delete(id);
    queuedHistoryUndoMovementSuppressions.push({
      ...suppression,
      expectedPosition: afterPosition,
    });
  }
}

function historyUndoGeometricSuppressionTargetIds(records, items, sceneEpoch) {
  const byId = new Map((Array.isArray(items) ? items : []).map((item) => [item?.id, item]));
  const ids = [];
  for (const record of Array.isArray(records) ? records : []) {
    if (
      !record?.id
      || !(Number(record.until) > Date.now())
      || (Number.isSafeInteger(record.sceneEpoch) && record.sceneEpoch !== Number(sceneEpoch))
    ) continue;
    const currentPosition = point(byId.get(record.id)?.position);
    if (samePoint(currentPosition, record.expectedPosition)) ids.push(record.id);
  }
  return [...new Set(ids)];
}

function clone(value) {
  if (value === undefined) return undefined;
  if (typeof globalThis.structuredClone === "function") return globalThis.structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function boundsCenter(bounds) {
  const center = point(bounds?.center);
  if (center) return center;
  const min = point(bounds?.min);
  const max = point(bounds?.max);
  return min && max
    ? {
      x: (min.x + max.x) / 2,
      y: (min.y + max.y) / 2,
    }
    : null;
}

function trackedCreature(item, orderedIds) {
  const meta = item?.metadata?.[META_KEY];
  return !!item?.id
    && !!meta
    && (meta.inInitiative === true || orderedIds.has(item.id));
}

function conditionInstances(item) {
  const conditions = item?.metadata?.[META_KEY]?.conditions;
  if (Array.isArray(conditions)) return conditions;
  return Array.isArray(conditions?.instances) ? conditions.instances : [];
}

function itemIsConcentrating(item) {
  const concentration = item?.metadata?.[META_KEY]?.[CONCENTRATION_KEY];
  return !!concentration
    && typeof concentration === "object"
    && Object.keys(concentration).length > 0;
}

function suppressedTriggerTargets(rule, instanceId, candidates) {
  const suppressedByTrigger = {};
  for (const trigger of rule?.zonePolicy?.triggers || []) {
    const skippedNames = new Set(
      (Array.isArray(trigger?.skipLinkedConditions)
        ? trigger.skipLinkedConditions
        : [])
        .map((name) => String(name || "").trim().toLocaleLowerCase("it"))
        .filter(Boolean)
    );
    const skippedConditionNames = new Set(
      (Array.isArray(trigger?.skipConditions)
        ? trigger.skipConditions
        : [])
        .map((name) => String(name || "").trim().toLocaleLowerCase("it"))
        .filter(Boolean)
    );
    const requiredNames = new Set(
      (Array.isArray(trigger?.requireConditions)
        ? trigger.requireConditions
        : [])
        .map((name) => String(name || "").trim().toLocaleLowerCase("it"))
        .filter(Boolean)
    );
    const requiredMovementModes = new Set(
      (Array.isArray(trigger?.requireMovementModes)
        ? trigger.requireMovementModes
        : [])
        .map((mode) => String(mode || "").trim().toLocaleLowerCase("it"))
        .filter(Boolean)
    );
    const requiresConcentration = trigger?.requiresConcentration === true;
    if (
      !skippedNames.size
      && !skippedConditionNames.size
      && !requiredNames.size
      && !requiredMovementModes.size
      && !requiresConcentration
    ) {
      continue;
    }
    suppressedByTrigger[trigger.id] = candidates
      .filter(({ item }) => {
        const conditionNames = new Set(
          conditionInstances(item)
            .filter((condition) => condition?.active !== false)
            .map((condition) =>
              String(condition?.name || condition?.condition || "")
                .trim()
                .toLocaleLowerCase("it")
            )
            .filter(Boolean)
        );
        const linkedConditionNames = new Set(
          conditionInstances(item)
            .filter((condition) =>
              condition?.active !== false
              && String(condition?.parentEffectId || "") === String(instanceId || "")
            )
            .map((condition) =>
              String(condition?.name || condition?.condition || "")
                .trim()
                .toLocaleLowerCase("it")
            )
            .filter(Boolean)
        );
        const hasRequiredMovementMode = requiredMovementModes.size === 0
          || [...requiredMovementModes].some((mode) =>
            itemHasEffectiveMovementMode(item, mode)
          );
        return (requiresConcentration && !itemIsConcentrating(item))
          || [...skippedNames].some((name) => linkedConditionNames.has(name))
          || [...skippedConditionNames].some((name) => conditionNames.has(name))
          || (
            requiredNames.size > 0
            && ![...requiredNames].some((name) => conditionNames.has(name))
          )
          || !hasRequiredMovementMode;
      })
      .map(({ item }) => item.id);
  }
  return suppressedByTrigger;
}

function buildZonePath({
  name,
  commands,
  style,
  fillOpacity,
  strokeOpacity,
  strokeWidth,
  metadata,
  locked,
  disableHit,
}) {
  return buildPath()
    .commands(commands)
    .fillRule("evenodd")
    .fillColor(style.fillColor)
    .fillOpacity(fillOpacity)
    .strokeColor(style.strokeColor)
    .strokeOpacity(strokeOpacity)
    .strokeWidth(strokeWidth)
    .position({ x: 0, y: 0 })
    .locked(locked)
    .disableHit(disableHit)
    .layer("DRAWING")
    .metadata(metadata)
    .name(name)
    .build();
}

export function buildStaticSpellZoneItems({
  ruleId = "",
  instanceId = "",
  casterId = "",
  spellName = "",
  preview = null,
  style = null,
  ruleChoice = "",
  targetIds = [],
  exemptCreatureIds = [],
  followCaster = false,
  casterOrigin = null,
} = {}) {
  const baseRule = getSpellAreaRuleById(ruleId);
  const rule = getSpellAreaRuleForPlacement(baseRule?.id || ruleId, ruleChoice)
    || baseRule;
  if (!isStaticSpellZoneRule(rule)) throw new Error("static-zone-rule-invalid");
  if (!String(instanceId || "").trim()) throw new Error("static-zone-instance-required");
  const type = String(preview?.type || "");
  const start = preview?.start;
  const end = preview?.end;
  const gridOrigin = preview?.gridOrigin || start;
  const rawDpi = Number(preview?.dpi);
  if (
    type !== rule.geometry.shape
    || !start
    || !end
    || !Number.isFinite(rawDpi)
    || rawDpi <= 0
  ) {
    throw new Error("static-zone-preview-invalid");
  }
  const dpi = Math.max(1, rawDpi);
  const widthSquares = Number(preview?.widthSquares) > 0
    ? Math.max(1, Math.round(Number(preview.widthSquares)))
    : Math.max(
      1,
      Math.round(Number(rule.geometry?.width?.value) / 1.5 || 1),
    );
  const outerSquares = Math.max(
    1,
    Math.round(
      Math.hypot(Number(end.x) - Number(start.x), Number(end.y) - Number(start.y))
      / dpi,
    ),
  );
  const ringInnerSquares = rule.geometry?.ring === true
    ? Math.max(
      0,
      Math.round(Number(preview?.ringInnerSquares))
        || Math.max(0, outerSquares - widthSquares),
    )
    : 0;
  const hotBandSquares = rule.geometry?.hotBand
    ? Math.max(
      1,
      Math.round(
        Number(preview?.hotBand?.widthSquares)
        || Number(rule.geometry.hotBand.width?.value) / 1.5
        || 1,
      ),
    )
    : 0;

  const area = buildArea(
    type,
    start,
    end,
    dpi,
    gridOrigin,
    {
      widthSquares,
      widthAnchor: rule.geometry?.widthAnchor,
      ...(rule.geometry?.ring === true
        ? {
          ring: true,
          ringInnerSquares,
        }
        : {}),
    },
  );
  const hotBand = hotBandSquares > 0 && rule.geometry?.hotBand
    ? buildArea(
      type,
      start,
      end,
      dpi,
      gridOrigin,
      {
        widthSquares,
        widthAnchor: rule.geometry?.widthAnchor,
        ...(rule.geometry?.ring === true
          ? { ringInnerSquares }
          : {}),
        band: {
          side: preview?.hotBand?.side || rule.geometry.hotBand.side,
          bandSquares: hotBandSquares,
        },
      },
    )
    : null;
  const resolvedStyle = spellAreaStyle(
    rule.spellId,
    normalizeAoEStyle(style || loadAoEStyle()),
  );
  const outlineWidth = Math.max(2, dpi * 0.035 * resolvedStyle.strokeWidth);
  const rootZoneMetadata = staticSpellZoneMetadata({
    instanceId,
    ruleId: rule.id,
    spellId: rule.spellId,
    casterId,
    ruleChoice,
    targetIds,
    exemptCreatureIds,
    followCaster,
    casterOrigin,
    ...(followCaster === true ? { zoneOrigin: { x: 0, y: 0 } } : {}),
  });
  const rootAreaMetadata = {
    version: 2,
    singlePath: true,
    type,
    start,
    end,
    dpi,
    gridOrigin,
    basePosition: { x: 0, y: 0 },
    style: resolvedStyle,
    ...(widthSquares > 0
      ? {
        widthSquares,
      }
      : {}),
    ...(rule.geometry?.ring === true && ringInnerSquares > 0
      ? {
        ring: true,
        ringInnerSquares,
      }
      : {}),
    ...(hotBand
      ? {
        hotBand: {
          side: String(
            preview?.hotBand?.side || rule.geometry?.hotBand?.side || "",
          ).trim(),
          widthSquares: Math.max(
            1,
            hotBandSquares,
          ),
        },
      }
      : {}),
    ...(rule.geometry?.widthAnchor === "edge" ? { widthAnchor: "edge" } : {}),
};
  const label = String(spellName || rule.spellId || "Incantesimo").trim();
  const root = buildZonePath({
    name: `Zona: ${label}`,
    commands: boundaryCommands(area.cells),
    style: resolvedStyle,
    fillOpacity: resolvedStyle.fillOpacity,
    strokeOpacity: 0.95,
    strokeWidth: outlineWidth,
    metadata: {
      [AOE_AREA_META_KEY]: rootAreaMetadata,
      [SPELL_STATIC_ZONE_META_KEY]: rootZoneMetadata,
    },
    locked: false,
    disableHit: false,
  });
  const geometry = buildZonePath({
    name: `Geometria zona: ${label}`,
    commands: [
      ...geometryCommands(area),
      ...(hotBand ? geometryCommands(hotBand) : []),
    ],
    style: resolvedStyle,
    fillOpacity: hotBand ? Math.min(0.18, resolvedStyle.fillOpacity) : 0,
    strokeOpacity: 0.9,
    strokeWidth: Math.max(2, outlineWidth * 0.72),
    metadata: {
      [AOE_AREA_META_KEY]: {
        parentId: root.id,
        dpi,
        visual: "geometry",
      },
      [SPELL_STATIC_ZONE_META_KEY]: staticSpellZoneMetadata({
        instanceId,
        ruleId: rule.id,
        spellId: rule.spellId,
        casterId,
        role: "geometry",
        parentId: root.id,
        ruleChoice,
        targetIds,
        exemptCreatureIds,
      }),
    },
    locked: true,
    disableHit: true,
  });
  geometry.attachedTo = root.id;
  return [root, geometry];
}

export function buildStaticSpellZoneReorientationItems({
  root = null,
  geometry = null,
  preview = null,
  casterPosition = null,
} = {}) {
  const zoneMetadata = root?.metadata?.[SPELL_STATIC_ZONE_META_KEY];
  const areaMetadata = root?.metadata?.[AOE_AREA_META_KEY];
  const rule = getSpellAreaRuleById(zoneMetadata?.ruleId);
  const type = String(preview?.type || "").trim();
  const start = point(preview?.start);
  const end = point(preview?.end);
  const gridOrigin = point(preview?.gridOrigin) || start;
  const dpi = Number(preview?.dpi);
  if (
    !root
    || !zoneMetadata
    || !areaMetadata
    || !rule
    || type !== rule.geometry.shape
    || !start
    || !end
    || !gridOrigin
    || !Number.isFinite(dpi)
    || dpi <= 0
  ) {
    throw new Error("static-zone-reorientation-invalid");
  }
  const widthSquares = Number(preview?.widthSquares) > 0
    ? Math.max(1, Math.round(Number(preview.widthSquares)))
    : areaMetadata.widthSquares;
  const area = buildArea(
    type,
    start,
    end,
    Math.max(1, dpi),
    gridOrigin,
    {
      widthSquares,
      widthAnchor: areaMetadata.widthAnchor || rule.geometry?.widthAnchor,
    },
  );
  const nextRoot = clone(root);
  const rootMetadata = { ...(root.metadata || {}) };
  rootMetadata[AOE_AREA_META_KEY] = {
    ...(areaMetadata || {}),
    version: 2,
    singlePath: true,
    type,
    start,
    end,
    dpi: Math.max(1, dpi),
    gridOrigin,
    basePosition: { x: 0, y: 0 },
    ...(Number.isInteger(widthSquares) ? { widthSquares } : {}),
    ...((areaMetadata.widthAnchor || rule.geometry?.widthAnchor) === "edge"
      ? { widthAnchor: "edge" }
      : {}),
  };
  rootMetadata[SPELL_STATIC_ZONE_META_KEY] = {
    ...(zoneMetadata || {}),
    ...(zoneMetadata.followCaster === true
      ? {
        casterOrigin: point(casterPosition) || point(zoneMetadata.casterOrigin),
        zoneOrigin: { x: 0, y: 0 },
      }
      : {}),
  };
  nextRoot.position = { x: 0, y: 0 };
  nextRoot.commands = boundaryCommands(area.cells);
  nextRoot.metadata = rootMetadata;

  const nextGeometry = geometry ? clone(geometry) : null;
  if (nextGeometry) {
    nextGeometry.position = { x: 0, y: 0 };
    nextGeometry.commands = geometryCommands(area);
  }
  return { root: nextRoot, geometry: nextGeometry };
}

export function buildStaticSpellZoneSubzoneItem({
  ruleId = "",
  instanceId = "",
  casterId = "",
  parentId = "",
  spellName = "",
  center = null,
  radiusMeters = 3,
  dpi = 150,
  scale = {},
  expiresTurnKey = "",
  style = null,
} = {}) {
  const rule = getSpellAreaRuleById(ruleId);
  const origin = point(center);
  const safeDpi = Math.max(1, Number(dpi) || 150);
  const parsedScale = scale?.parsed && typeof scale.parsed === "object"
    ? scale.parsed
    : scale;
  const multiplier = Number(parsedScale?.multiplier);
  const unit = String(parsedScale?.unit || "m").trim().toLowerCase();
  const unitMeters = unit === "ft" || unit === "foot" || unit === "feet"
    ? 0.3048
    : 1;
  const metersPerCell = (Number.isFinite(multiplier) && multiplier > 0
    ? multiplier
    : 1.5) * unitMeters;
  const radiusCells = Math.max(
    1,
    Math.round(Math.max(0.1, Number(radiusMeters) || 3) / metersPerCell),
  );
  if (!rule || !origin || !String(instanceId || "").trim()) {
    throw new Error("static-zone-subzone-invalid");
  }
  const end = {
    x: origin.x + radiusCells * safeDpi,
    y: origin.y,
  };
  const area = buildArea(
    "circle",
    origin,
    end,
    safeDpi,
    origin,
  );
  const resolvedStyle = spellAreaStyle(
    rule.spellId,
    normalizeAoEStyle(style || loadAoEStyle()),
  );
  const outlineWidth = Math.max(2, safeDpi * 0.035 * resolvedStyle.strokeWidth);
  const label = String(spellName || rule.spellId || "Incantesimo").trim();
  const metadata = staticSpellZoneMetadata({
    instanceId,
    ruleId: rule.id,
    spellId: rule.spellId,
    casterId,
    role: "subzone",
    parentId,
  });
  metadata.subzoneType = "dust-cloud";
  metadata.effectLabel = "Pesantemente oscurato";
  if (String(expiresTurnKey || "").trim()) {
    metadata.expiresTurnKey = String(expiresTurnKey).trim();
  }
  return buildZonePath({
    name: `Nube di detriti: ${label} · Pesantemente oscurato`,
    commands: boundaryCommands(area.cells),
    style: resolvedStyle,
    fillOpacity: Math.min(0.36, Math.max(0.08, resolvedStyle.fillOpacity * 1.35)),
    strokeOpacity: 0.75,
    strokeWidth: outlineWidth,
    metadata: {
      [AOE_AREA_META_KEY]: {
        version: 2,
        singlePath: true,
        type: "circle",
        start: origin,
        end,
        dpi: safeDpi,
        gridOrigin: origin,
        basePosition: { x: 0, y: 0 },
        style: resolvedStyle,
        subzone: "dust-cloud",
      },
      [SPELL_STATIC_ZONE_META_KEY]: metadata,
    },
    locked: true,
    disableHit: true,
  });
}

export function buildStaticSpellChildZoneItem({
  ruleId = "",
  instanceId = "",
  casterId = "",
  parentId = "",
  parentArea = null,
  spellName = "",
  preview = null,
  childKind = "",
  childIndex = 0,
  activationId = "",
  sceneEpoch = 0,
  variant = "",
  triggers = null,
  style = null,
  depthRoll = null,
} = {}) {
  const rule = getSpellAreaRuleById(ruleId);
  const type = String(preview?.type || "").trim();
  const start = preview?.start;
  const end = preview?.end;
  const gridOrigin = preview?.gridOrigin || start;
  const dpi = Number(preview?.dpi);
  if (
    !rule
    || !String(instanceId || "").trim()
    || !String(parentId || "").trim()
    || !String(childKind || "").trim()
    || !String(activationId || "").trim()
    || type !== rule.geometry.shape
    || !start
    || !end
    || !Number.isFinite(dpi)
    || dpi <= 0
  ) {
    throw new Error("static-zone-child-preview-invalid");
  }
  let area = buildArea(
    type,
    start,
    end,
    dpi,
    gridOrigin,
    { widthSquares: preview?.widthSquares },
  );
  if (String(childKind || "").trim() === "fissure") {
    area = clipChildZoneAreaToParent({
      parentArea: preview?.parentClip || parentArea,
      childArea: {
        ...area,
        centerlineStart: start,
        centerlineEnd: end,
      },
    });
  }
  const parentClip = area?.parentClip || preview?.parentClip || null;
  const resolvedStyle = spellAreaStyle(
    rule.spellId,
    normalizeAoEStyle(style || loadAoEStyle()),
  );
  const outlineWidth = Math.max(2, dpi * 0.035 * resolvedStyle.strokeWidth);
  const label = String(spellName || rule.spellId || "Incantesimo").trim();
  const metadata = spellChildZoneMetadata({
    parentZoneId: parentId,
    parentInstanceId: instanceId,
    casterId,
    spellId: rule.spellId,
    ruleId: rule.id,
    childKind,
    childIndex,
    activationId,
    sceneEpoch,
    variant,
    ruleChoice: variant,
    geometry: {
      type,
      start,
      end,
      dpi,
      gridOrigin,
      ...(parentClip ? { parentClip } : {}),
      ...(String(childKind || "").trim() === "fissure"
        ? { centerlineStart: start, centerlineEnd: end }
        : {}),
      ...(Number(preview?.widthSquares) > 0
        ? { widthSquares: Math.max(1, Math.round(Number(preview.widthSquares))) }
        : {}),
      ...(Number.isInteger(Number(depthRoll))
        ? {
          depthRoll: Math.max(1, Math.floor(Number(depthRoll))),
          depthMeters: Math.max(1, Math.floor(Number(depthRoll))) * 3,
        }
        : {}),
    },
    style: resolvedStyle,
    triggers: triggers || rule.zonePolicy?.triggers || [],
  });
  return buildZonePath({
    name: `${label} · ${childKind}`,
    commands: boundaryCommands(area.cells),
    style: resolvedStyle,
    fillOpacity: Math.min(0.32, Math.max(0.08, resolvedStyle.fillOpacity * 1.2)),
    strokeOpacity: 0.9,
    strokeWidth: outlineWidth,
    metadata: {
      [AOE_AREA_META_KEY]: {
        version: 2,
        singlePath: true,
        type,
        start,
        end,
        dpi,
        gridOrigin,
        basePosition: { x: 0, y: 0 },
        style: resolvedStyle,
        subzone: childKind,
        ...(parentClip ? { parentClip } : {}),
        ...(String(childKind || "").trim() === "fissure"
          ? { centerlineStart: start, centerlineEnd: end }
          : {}),
        ...(Number(preview?.widthSquares) > 0
          ? { widthSquares: Math.max(1, Math.round(Number(preview.widthSquares))) }
          : {}),
      },
      [SPELL_STATIC_ZONE_META_KEY]: metadata,
    },
    locked: true,
    disableHit: true,
  });
}

export async function getStaticSpellZoneItems({
  instanceId = "",
  casterId = "",
} = {}) {
  const items = await OBR.scene.items.getItems();
  return staticSpellZoneItems(items, { instanceId, casterId });
}

export async function setStaticSpellZoneRuleChoice(
  zoneItems = [],
  ruleChoice = "",
) {
  const ids = (Array.isArray(zoneItems) ? zoneItems : [])
    .map((item) => item?.id)
    .filter(Boolean);
  const choice = String(ruleChoice || "").trim();
  if (!ids.length || !choice) return false;
  await OBR.scene.items.updateItems(ids, (drafts) => {
    for (const item of drafts) {
      const metadata = item.metadata?.[SPELL_STATIC_ZONE_META_KEY];
      if (!metadata) continue;
      const triggerRuntime = metadata.triggerRuntime
        && typeof metadata.triggerRuntime === "object"
        ? {
          ...metadata.triggerRuntime,
          pending: [],
        }
        : metadata.triggerRuntime;
      item.metadata = {
        ...(item.metadata || {}),
        [SPELL_STATIC_ZONE_META_KEY]: {
          ...metadata,
          ruleChoice: choice,
          ...(triggerRuntime ? { triggerRuntime } : {}),
        },
      };
    }
  });
  return true;
}

export async function commitWithStaticSpellZoneRemoval(
  zoneItems = [],
  action,
  { sceneEpoch = null, isCurrent = null } = {},
) {
  const snapshots = Array.isArray(zoneItems) ? zoneItems.filter(Boolean) : [];
  return runStaticSpellZoneRemovalTransaction({
    snapshots,
    action,
    isCurrent: typeof isCurrent === "function"
      ? () => isCurrent(sceneEpoch)
      : null,
    deleteItems: (ids) => OBR.scene.items.deleteItems(ids),
    addItems: (items) => OBR.scene.items.addItems(items),
    readItems: (ids) => OBR.scene.items.getItems(ids),
  });
}

function restoredStaticSpellZoneActivationIds(event) {
  if (event?.flags?.reminderResolutions !== true) return [];
  const restored = [];
  for (const record of Array.isArray(event?.changedRecords) ? event.changedRecords : []) {
    const beforeMetadata = record?.before?.item?.metadata?.[SPELL_STATIC_ZONE_META_KEY];
    const afterMetadata = record?.after?.item?.metadata?.[SPELL_STATIC_ZONE_META_KEY];
    if (!afterMetadata || !record?.after?.item?.id) continue;
    const beforeIds = new Set(
      normalizeSpellZoneTriggerRuntime(beforeMetadata?.triggerRuntime).pending
        .map((activation) => String(activation?.id || "").trim())
        .filter(Boolean),
    );
    for (const activation of normalizeSpellZoneTriggerRuntime(afterMetadata.triggerRuntime).pending) {
      const activationId = String(activation?.id || "").trim();
      if (activationId && !beforeIds.has(activationId)) restored.push(activationId);
    }
  }
  return [...new Set(restored)];
}

async function reconcileStaticSpellZones(
  sceneMetadataOverride = null,
  rearmActivationIds = [],
  historyUndoMovementSuppressions = [],
  movementRecords = [],
) {
  const sceneEpoch = currentSceneEpoch();
  if (!await OBR.scene.isReady().catch(() => false)) return;
  const suppliedItems = Array.isArray(activeSceneItemsOverride)
    ? activeSceneItemsOverride
    : null;
  const [items, fetchedSceneMetadata] = await Promise.all([
    suppliedItems ? Promise.resolve(suppliedItems) : OBR.scene.items.getItems(),
    sceneMetadataOverride && typeof sceneMetadataOverride === "object"
      ? Promise.resolve(sceneMetadataOverride)
      : OBR.scene.getMetadata().catch(() => ({})),
  ]);
  if (!isCurrentSceneEpoch(sceneEpoch)) return;
  scheduleStaticSpellZoneWatchdog(staticSpellZoneItems(items).length > 0);
  const sceneMetadata = sceneMetadataOverride
    && typeof sceneMetadataOverride === "object"
    && !Array.isArray(sceneMetadataOverride)
    ? sceneMetadataOverride
    : fetchedSceneMetadata;
  if (!stateMetadataWatcher.initialized) stateMetadataWatcher.seed(sceneMetadata);
  if (stateMetadataWatcher.initialized
      && sceneMetadataKeyDigest(sceneMetadata, STATE_KEY) !== stateMetadataWatcher.digest) {
    scheduleStaticSpellZoneRecovery();
    return;
  }
  const generation = activeSceneGeneration || ++fallbackGeneration;
  const generationKey = JSON.stringify({
    sceneEpoch,
    generation,
    stateDigest: stateMetadataWatcher.digest,
  });
  if (!activeReconcileForce && completedGenerationKey === generationKey) return;
  const activeInstances = activeSpellInstanceIds(items);
  const staleZoneIds = staleStaticSpellZoneItemIds(items);
  const orphanBoardTokenIds = spellBoardTokenItems(items)
    .filter((item) => !activeInstances.has(String(
      item?.metadata?.[SPELL_BOARD_TOKEN_META_KEY]?.instanceId || "",
    ).trim()))
    .map((item) => item.id)
    .filter(Boolean);
  const initialDerivedCleanupIds = [...new Set([
    ...staleZoneIds,
    ...orphanBoardTokenIds,
  ])];
  if (initialDerivedCleanupIds.length) {
    await OBR.scene.items.deleteItems(initialDerivedCleanupIds);
    if (!isCurrentSceneEpoch(sceneEpoch)) return;
  }
  const currentTurnKey = currentInitiativeTurnKey(sceneMetadata?.[STATE_KEY]);
  const expiredSubzoneIds = staticSpellZoneItems(items)
    .filter((item) => {
      const metadata = item?.metadata?.[SPELL_STATIC_ZONE_META_KEY];
      return metadata?.role === "subzone"
        && metadata?.expiresTurnKey
        && metadata.expiresTurnKey === currentTurnKey;
    })
    .map((item) => item.id)
    .filter(Boolean);
  if (expiredSubzoneIds.length) {
    if (!isCurrentSceneEpoch(sceneEpoch)) return;
    await OBR.scene.items.deleteItems(expiredSubzoneIds);
    if (!isCurrentSceneEpoch(sceneEpoch)) return;
  }
  let currentItems = items.filter((item) => (
    !initialDerivedCleanupIds.includes(item.id)
    && !expiredSubzoneIds.includes(item.id)
  ));
  let zoneRoots = staticSpellZoneItems(currentItems)
    .filter((item) =>
      item?.metadata?.[SPELL_STATIC_ZONE_META_KEY]?.role === "root"
    );
  const rootsById = new Map(zoneRoots.map((item) => [item.id, item]));
  const childBelongsToRoot = (item) => {
    const metadata = item?.metadata?.[SPELL_STATIC_ZONE_META_KEY];
    const root = rootsById.get(metadata?.parentZoneId);
    const rootMetadata = root?.metadata?.[SPELL_STATIC_ZONE_META_KEY];
    return isSpellChildZoneMetadata(metadata)
      && !!rootMetadata
      && metadata.parentInstanceId === rootMetadata.instanceId
      && metadata.casterId === rootMetadata.casterId
      && metadata.spellId === rootMetadata.spellId;
  };
  const childZones = staticSpellZoneItems(currentItems)
    .filter(childBelongsToRoot);
  const orphanChildIds = staticSpellZoneItems(currentItems)
    .filter((item) => isSpellChildZoneMetadata(
      item?.metadata?.[SPELL_STATIC_ZONE_META_KEY],
    ) && !childBelongsToRoot(item))
    .map((item) => item.id)
    .filter(Boolean);
  if (orphanChildIds.length) {
    if (!isCurrentSceneEpoch(sceneEpoch)) return;
    await OBR.scene.items.deleteItems(orphanChildIds);
    if (!isCurrentSceneEpoch(sceneEpoch)) return;
    currentItems = currentItems.filter((item) => !orphanChildIds.includes(item.id));
  }
  const currentItemsById = new Map(currentItems.map((item) => [item.id, item]));
  const followCasterUpdates = zoneRoots
    .map((item) => {
      const metadata = item.metadata[SPELL_STATIC_ZONE_META_KEY];
      const desiredPosition = spellStaticZoneFollowCasterPosition(
        metadata,
        currentItemsById.get(metadata.casterId)?.position,
      );
      const currentPosition = point(item.position) || { x: 0, y: 0 };
      return desiredPosition
        && (desiredPosition.x !== currentPosition.x || desiredPosition.y !== currentPosition.y)
        ? { id: item.id, position: desiredPosition }
        : null;
    })
    .filter(Boolean);
  if (followCasterUpdates.length) {
    if (!isCurrentSceneEpoch(sceneEpoch)) return;
    const positionsById = new Map(followCasterUpdates.map((entry) => [entry.id, entry.position]));
    await OBR.scene.items.updateItems(
      followCasterUpdates.map((entry) => entry.id),
      (drafts) => {
        for (const draft of drafts) {
          const position = positionsById.get(draft.id);
          if (position) draft.position = { ...position };
        }
      },
    );
    if (!isCurrentSceneEpoch(sceneEpoch)) return;
    currentItems = currentItems.map((item) => {
      const position = positionsById.get(item.id);
      return position ? { ...item, position: { ...position } } : item;
    });
    zoneRoots = staticSpellZoneItems(currentItems)
      .filter((item) => item?.metadata?.[SPELL_STATIC_ZONE_META_KEY]?.role === "root");
  }
  if (!zoneRoots.length) {
    // No canonical zone remains: any restored activation tied to a removed
    // cause/zone must stop receiving temporal-pruning protection.
    undoRestoredActivationIds.clear();
    const zoneEffectIds = spellZoneLifecycleEffectIds();
    const staleEffectRemovals = staleAreaMembershipEffectRemovals(items, {
      activeInstanceIds: [],
      effectIds: zoneEffectIds,
      metaKey: META_KEY,
    });
    if (staleEffectRemovals.length) {
      if (!isCurrentSceneEpoch(sceneEpoch)) return;
      await queueSpellAreaEffectsMutation([{
        type: "condition:remove-instances",
        removals: staleEffectRemovals,
      }]);
    }
    if (isCurrentSceneEpoch(sceneEpoch)) completedGenerationKey = generationKey;
    return;
  }
  const order = sceneMetadata?.[STATE_KEY]?.order || [];
  const orderedIds = new Set(
    order.map((id) => String(id || "").split("::p")[0])
  );
  const creatures = currentItems.filter((item) => trackedCreature(item, orderedIds));
  const byId = new Map(currentItems.map((item) => [item.id, item]));
  const requiredIds = new Set([
    ...creatures.map((item) => item.id),
    ...zoneRoots.map((item) =>
      item.metadata[SPELL_STATIC_ZONE_META_KEY]?.casterId
    ),
  ]);
  const boundedItems = [...requiredIds]
    .map((id) => byId.get(id))
    .filter(Boolean);
  const boundsResult = await sceneItemBounds.load(boundedItems);
  if (!isCurrentSceneEpoch(sceneEpoch)) return;
  if (!boundsResult.complete) {
    console.warn(
      "[spell-static-zone] bounds incompleti, reconcile rinviato:",
      boundsResult.missingIds,
    );
    scheduleStaticSpellZoneRecovery();
    return;
  }
  const boundsById = boundsResult.boundsById;
  const candidates = creatures.map((item) => ({
    item,
    bounds: boundsById.get(item.id),
    center: boundsCenter(boundsById.get(item.id)),
  }));
  const suppressGeometricActivationTargetIds = historyUndoGeometricSuppressionTargetIds(
    historyUndoMovementSuppressions,
    currentItems,
    sceneEpoch,
  );
  const operations = [];
  const triggerRuntimeUpdates = new Map();
  const newTriggerActivations = [];
  const newTriggerNotices = [];
  const rearmedTriggerNotices = [];
  const canonicalPendingActivationIds = new Set();
  const initiativeState = sceneMetadata?.[STATE_KEY] || {};

  for (const item of [...zoneRoots, ...childZones]) {
    const zoneMetadata = item.metadata[SPELL_STATIC_ZONE_META_KEY];
    const baseRule = getSpellAreaRuleById(zoneMetadata.ruleId);
    const rule = getSpellAreaRuleForPlacement(
      baseRule?.id || zoneMetadata.ruleId,
      zoneMetadata.ruleChoice,
    ) || baseRule;
    const triggerAreas = translatedZoneTriggerAreas(item);
    const area = triggerAreas.body;
    if (!rule || !area) continue;
    const desiredTargetIds = scopedStaticSpellZoneTargetIds({
      rule,
      zoneMetadata,
      targetIds: areaMembershipTargetIds({
        sourceId: zoneMetadata.casterId,
        rule,
        area,
        candidates,
        metaKey: META_KEY,
      }),
    });
    const directTargetIds = rule.zonePolicy?.triggers?.some(
      (trigger) => trigger?.targetMode === "direct-members"
    )
      ? scopedStaticSpellZoneTargetIds({
        rule,
        zoneMetadata,
        targetIds: areaMembershipTargetIds({
          sourceId: zoneMetadata.casterId,
          rule,
          area,
          candidates,
          metaKey: META_KEY,
          membershipPaddingSquares: 0,
        }),
      })
      : [];
    const currentTargetIdsByTrigger = {};
    const crossingTargetIdsByTrigger = {};
    const triggers = Array.isArray(rule.zonePolicy?.triggers)
      ? rule.zonePolicy.triggers
      : [];
    const usePerTriggerMembership = triggers.some((trigger) =>
      trigger?.requiresCrossing === true
      || ["hot-band", "body-or-hot-band", "proximity"].includes(trigger?.targetArea)
    );
    const hotBand = triggerAreas.hotBand;
    const unionArea = (areas) => {
      const cellsByKey = new Map();
      for (const candidateArea of areas.filter(Boolean)) {
        for (const cell of Array.isArray(candidateArea.cells) ? candidateArea.cells : []) {
          cellsByKey.set(`${cell.column}:${cell.row}`, cell);
        }
      }
      return {
        ...(areas.find(Boolean) || {}),
        cells: [...cellsByKey.values()],
      };
    };
    for (const trigger of triggers) {
      if (!usePerTriggerMembership) continue;
      const triggerArea = trigger.targetArea === "hot-band"
        ? hotBand
        : trigger.targetArea === "body-or-hot-band"
          ? unionArea([area, hotBand])
          : area;
      if (!triggerArea) continue;
      currentTargetIdsByTrigger[trigger.id] = scopedStaticSpellZoneTargetIds({
        rule,
        zoneMetadata,
        targetIds: areaMembershipTargetIds({
          sourceId: zoneMetadata.casterId,
          rule,
          area: triggerArea,
          candidates,
          metaKey: META_KEY,
          ...(trigger.targetArea === "proximity"
            ? { membershipPaddingSquares: trigger.proximityPaddingSquares }
            : {}),
        }),
      });
      if (trigger.requiresCrossing === true) {
        const crossing = [];
        for (const record of Array.isArray(movementRecords) ? movementRecords : []) {
          const candidate = candidates.find(({ item: candidateItem }) =>
            candidateItem.id === record.id
          );
          if (!candidate?.bounds || !candidate.center || !record.beforePosition || !record.afterPosition) {
            continue;
          }
          const delta = {
            x: record.afterPosition.x - record.beforePosition.x,
            y: record.afterPosition.y - record.beforePosition.y,
          };
          const beforeCenter = {
            x: candidate.center.x - delta.x,
            y: candidate.center.y - delta.y,
          };
          const beforeBounds = {
            min: {
              x: Number(candidate.bounds.min?.x) - delta.x,
              y: Number(candidate.bounds.min?.y) - delta.y,
            },
            max: {
              x: Number(candidate.bounds.max?.x) - delta.x,
              y: Number(candidate.bounds.max?.y) - delta.y,
            },
          };
          if (areaHitsBounds(area, beforeBounds)) continue;
          if (areaIntersectsSegment(area, beforeCenter, candidate.center, candidate.bounds)) {
            crossing.push(record.id);
          }
        }
        crossingTargetIdsByTrigger[trigger.id] = [...new Set(crossing)];
      }
    }
    const triggerTargetIds = [
      ...desiredTargetIds,
      ...Object.values(currentTargetIdsByTrigger).flat(),
    ];
    const caster = byId.get(zoneMetadata.casterId);
    operations.push(...areaMembershipPlan({
      instanceId: zoneMetadata.instanceId,
      sourceId: zoneMetadata.casterId,
      zoneId: item.id,
      rule,
      ruleChoice: zoneMetadata.ruleChoice,
      desiredTargetIds,
      items: currentItems,
      metaKey: META_KEY,
      sourceName: caster?.name || "",
      defaultExpiry: { mode: "manual" },
      removeLinkedTriggerConditions: zoneMetadata.role === "root",
    }).operations);
    if (!SPELL_ZONE_TRIGGER_WORKFLOW_ENABLED) continue;
    const triggerPlan = planStaticSpellZoneReminder({
      zoneItem: item,
      rule,
      desiredTargetIds,
      directTargetIds,
      currentTargetIdsByTrigger,
      crossingTargetIdsByTrigger,
      currentTargetPositions: Object.fromEntries(
        candidates
          .filter(({ item: candidate, center }) =>
            triggerTargetIds.includes(candidate.id) && center
          )
          .map(({ item: candidate, center }) => [candidate.id, center])
      ),
      initiativeState,
      suppressedTargetIdsByTrigger: suppressedTriggerTargets(
        rule,
        zoneMetadata.instanceId,
        candidates,
      ),
      preservePendingActivationIds: [...undoRestoredActivationIds],
      suppressGeometricActivationTargetIds,
      itemsById: byId,
    });
    if (triggerPlan.changed) {
      triggerRuntimeUpdates.set(item.id, {
        baseRuntime: triggerPlan.baseRuntime,
        runtime: triggerPlan.runtime,
        newActivations: triggerPlan.newActivations,
      });
    }
    newTriggerActivations.push(...triggerPlan.newActivations);
    newTriggerNotices.push(...triggerPlan.notices);
    for (const activation of triggerPlan.runtime.pending) {
      const activationId = String(activation?.id || "").trim();
      if (activationId) canonicalPendingActivationIds.add(activationId);
    }
    rearmedTriggerNotices.push(...rearmedStaticSpellZoneNotices({
      zoneItem: item,
      pendingActivations: triggerPlan.runtime.pending,
      rearmActivationIds,
      itemsById: byId,
    }));
  }

  for (const activationId of [...undoRestoredActivationIds]) {
    if (!canonicalPendingActivationIds.has(activationId)) {
      undoRestoredActivationIds.delete(activationId);
    }
  }

  const activeInstanceIds = zoneRoots
    .map((item) =>
      item.metadata[SPELL_STATIC_ZONE_META_KEY]?.instanceId
    )
    .filter(Boolean);
  const zoneEffectIds = spellZoneLifecycleEffectIds();
  const staleEffectRemovals = staleAreaMembershipEffectRemovals(items, {
    activeInstanceIds,
    effectIds: zoneEffectIds,
    metaKey: META_KEY,
  });
  if (staleEffectRemovals.length) {
    operations.unshift({
      type: "condition:remove-instances",
      removals: staleEffectRemovals,
    });
  }
  if (!isCurrentSceneEpoch(sceneEpoch)) return;
  if (operations.length) await queueSpellAreaEffectsMutation(operations);
  if (!isCurrentSceneEpoch(sceneEpoch)) return;
  if (triggerRuntimeUpdates.size) {
    await OBR.scene.items.updateItems(
      [...triggerRuntimeUpdates.keys()],
      (drafts) => {
        for (const item of drafts) {
          const update = triggerRuntimeUpdates.get(item.id);
          if (!update) continue;
          const metadata = item.metadata?.[SPELL_STATIC_ZONE_META_KEY] || {};
          item.metadata = {
            ...(item.metadata || {}),
            [SPELL_STATIC_ZONE_META_KEY]: mergeStaticSpellZoneReminderMetadata(
              metadata,
              update,
            ),
          };
        }
      },
    );
  }
  if (!isCurrentSceneEpoch(sceneEpoch)) return;
  const rearmedActivationIdsForDelivery = [...new Set(
    rearmedTriggerNotices.map((notice) => String(notice?.activationId || "").trim())
      .filter(Boolean),
  )];
  const deliveryNotices = [...newTriggerNotices, ...rearmedTriggerNotices];
  if (deliveryNotices.length) {
    // La coda persistente serve alla risoluzione in Effetti ad Area; il
    // reminder visivo riceve invece un payload live già completo.
    void sendProjectedReminderPayload(
      SPELL_ZONE_TRIGGER_NOTICE_CHANNEL,
      {
        type: "show-zone-trigger-notices",
        activationIds: [...new Set([
          ...newTriggerActivations.map((activation) => activation.id),
          ...rearmedActivationIdsForDelivery,
        ])],
        notices: deliveryNotices,
        ...(rearmedActivationIdsForDelivery.length
          ? { rearmActivationIds: rearmedActivationIdsForDelivery }
          : {}),
      },
    ).catch((error) => {
      console.warn(
        "[spell-static-zone] trigger notice:",
        error?.message || error,
      );
    });
  }
  if (isCurrentSceneEpoch(sceneEpoch)) completedGenerationKey = generationKey;
}

function scheduleStaticSpellZoneRecovery() {
  if (!mounted || recoveryTimer) return;
  recoveryTimer = setTimeout(() => {
    recoveryTimer = null;
    requestStaticSpellZoneReconcile({ reason: "recovery", force: true });
  }, RECONCILE_RECOVERY_DELAY_MS);
}

async function pump() {
  if (running) return pumpPromise;
  running = true;
  const currentPump = (async () => {
    try {
      while (requested) {
        requested = false;
        const sceneMetadataOverride = queuedSceneMetadata;
        queuedSceneMetadata = null;
        activeSceneItemsOverride = queuedSceneItems;
        activeSceneGeneration = queuedSceneGeneration;
        activeReconcileForce = queuedReconcileForce;
        const rearmActivationIds = [...queuedRearmActivationIds];
        queuedRearmActivationIds.clear();
        const historyUndoMovementSuppressions = [...queuedHistoryUndoMovementSuppressions];
        queuedHistoryUndoMovementSuppressions.length = 0;
        const movementRecords = [...queuedMovementRecords.values()];
        queuedMovementRecords.clear();
        queuedSceneItems = null;
        queuedSceneGeneration = 0;
        queuedReconcileReason = "event";
        queuedReconcileForce = false;
        try {
          await reconcileStaticSpellZones(
            sceneMetadataOverride,
            rearmActivationIds,
            historyUndoMovementSuppressions,
            movementRecords,
          );
        } catch (error) {
          for (const activationId of rearmActivationIds) {
            queuedRearmActivationIds.add(activationId);
          }
          queuedHistoryUndoMovementSuppressions.push(...historyUndoMovementSuppressions);
          for (const record of movementRecords) {
            const current = queuedMovementRecords.get(record.id);
            queuedMovementRecords.set(record.id, current
              ? {
                ...current,
                beforePosition: current.beforePosition || record.beforePosition,
                afterPosition: record.afterPosition,
              }
              : record);
          }
          console.error("[spell-static-zone] reconcile:", error);
          scheduleStaticSpellZoneRecovery();
        } finally {
          activeSceneItemsOverride = null;
          activeSceneGeneration = 0;
          activeReconcileForce = false;
        }
      }
    } finally {
      running = false;
      if (requested && !timer) {
        timer = setTimeout(() => {
          timer = null;
          void pump();
        }, 0);
      }
    }
  })();
  pumpPromise = currentPump;
  return currentPump;
}

export function requestStaticSpellZoneReconcile(options = {}) {
  const normalized = typeof options === "string" ? { reason: options } : options || {};
  if (recoveryTimer) clearTimeout(recoveryTimer);
  recoveryTimer = null;
  requested = true;
  queuedReconcileReason = String(normalized.reason || "event");
  queuedReconcileForce ||= normalized.force === true
    || queuedReconcileReason === "recovery"
    || queuedReconcileReason === "watchdog"
    || queuedReconcileReason === "runtime-cache-cleanup";
  if (normalized.immediate === true) {
    if (timer) clearTimeout(timer);
    timer = null;
    return pump();
  }
  if (running || timer) return;
  timer = setTimeout(() => {
    timer = null;
    void pump();
  }, RECONCILE_DELAY_MS);
}

export async function mountStaticSpellZoneController() {
  if (mounted) return true;
  const role = await OBR.player.getRole().catch(() => "PLAYER");
  if (role !== "GM") return false;
  mounted = true;
  unsubscribeImmediateMovement = subscribeSceneItemChanges(
    (event) => {
      consumeHistoryUndoMovementSuppressions(event);
      queueMovementRecords(event);
      // Un batch di update che torna alla posizione iniziale può non produrre
      // un delta netto nel dispatcher. Il reconcile immediato mantiene comunque
      // allineata la membership alla posizione finale osservata.
      requestStaticSpellZoneReconcile({ reason: "movement-immediate" });
    },
    { domains: ["movement"], immediate: true },
  );
  unsubscribeItems = subscribeSceneItemChanges(
    (event) => {
      queueMovementRecords(event);
      queuedSceneItems = Array.isArray(event?.allItems) ? event.allItems : null;
      queuedSceneGeneration = Number(event?.generation) || 0;
      const rearmActivationIds = restoredStaticSpellZoneActivationIds(event);
      for (const activationId of rearmActivationIds) {
        undoRestoredActivationIds.add(activationId);
        queuedRearmActivationIds.add(activationId);
      }
      requestStaticSpellZoneReconcile({ reason: "items" });
      if (rearmActivationIds.length) {
        requestStaticSpellZoneReconcile({
          reason: "reminder-resolution-undo",
          force: true,
        });
      }
    },
    {
      domains: ["zone"],
      filter: (event) => (
        !event?.derived?.output
        || restoredStaticSpellZoneActivationIds(event).length > 0
      ),
    },
  );
  unsubscribeSceneReady = OBR.scene.onReadyChange((ready) => {
    if (!ready) {
      queuedSceneMetadata = null;
      queuedSceneItems = null;
      queuedSceneGeneration = 0;
      queuedRearmActivationIds.clear();
      queuedHistoryUndoMovementSuppressions.length = 0;
      queuedMovementRecords.clear();
      pendingHistoryUndoMovementSuppressions.clear();
      historyUndoRuntimeIdentity = null;
      undoRestoredActivationIds.clear();
      completedGenerationKey = null;
      stateMetadataWatcher.reset();
      sceneItemBounds.clear();
      if (recoveryTimer) clearTimeout(recoveryTimer);
      recoveryTimer = null;
      scheduleStaticSpellZoneWatchdog(false);
      return;
    }
    requestStaticSpellZoneReconcile({ reason: "scene-ready", force: true });
  });
  unsubscribeSceneMetadata = OBR.scene.onMetadataChange((metadata) => {
    const observed = stateMetadataWatcher.initialized
      ? stateMetadataWatcher.observe(metadata)
      : stateMetadataWatcher.seed(metadata);
    if (!observed.changed) return;
    queuedSceneMetadata = metadata;
    requestStaticSpellZoneReconcile();
  });
  unsubscribeRuntimeCacheCleanup = OBR.broadcast.onMessage(
    RUNTIME_CACHE_CLEANUP_CHANNEL,
    (event) => {
      if (event?.data?.type !== "clear-runtime-caches") return;
      sceneItemBounds.clear();
      requestStaticSpellZoneReconcile({ reason: "runtime-cache-cleanup", force: true });
    },
  );
  unsubscribeRuntimeHistoryUndo = OBR.broadcast.onMessage(
    HISTORY_CONTROL_CHANNEL,
    (event) => {
      const data = event?.data;
      if (data?.type !== "suppress-history-undo") return;
      installHistoryUndoMovementSuppressions(data);
    },
  );
  unsubscribeRuntimeHistoryRearm = OBR.broadcast.onMessage(
    REMINDER_HISTORY_REARM_CHANNEL,
    (event) => {
      const data = event?.data;
      if (data?.type !== "restore-reminder-activation" || data?.owner !== "static-zone") return;
      const activationId = String(data?.activationId || "").trim();
      if (!activationId) return;
      undoRestoredActivationIds.add(activationId);
      queuedRearmActivationIds.add(activationId);
      requestStaticSpellZoneReconcile({ reason: "reminder-history-rearm", force: true });
    },
  );
  requestStaticSpellZoneReconcile({ reason: "mount", force: true });
  return true;
}

export function unmountStaticSpellZoneController() {
  unsubscribeImmediateMovement?.();
  unsubscribeImmediateMovement = null;
  unsubscribeItems?.();
  unsubscribeItems = null;
  unsubscribeSceneReady?.();
  unsubscribeSceneReady = null;
  unsubscribeSceneMetadata?.();
  unsubscribeSceneMetadata = null;
  unsubscribeRuntimeCacheCleanup?.();
  unsubscribeRuntimeCacheCleanup = null;
  unsubscribeRuntimeHistoryRearm?.();
  unsubscribeRuntimeHistoryRearm = null;
  unsubscribeRuntimeHistoryUndo?.();
  unsubscribeRuntimeHistoryUndo = null;
  if (watchdogTimer) clearTimeout(watchdogTimer);
  watchdogTimer = null;
  if (recoveryTimer) clearTimeout(recoveryTimer);
  recoveryTimer = null;
  if (timer) clearTimeout(timer);
  timer = null;
  queuedSceneMetadata = null;
  queuedSceneItems = null;
  queuedSceneGeneration = 0;
  queuedRearmActivationIds.clear();
  queuedHistoryUndoMovementSuppressions.length = 0;
  queuedMovementRecords.clear();
  pendingHistoryUndoMovementSuppressions.clear();
  historyUndoRuntimeIdentity = null;
  undoRestoredActivationIds.clear();
  queuedReconcileReason = "event";
  queuedReconcileForce = false;
  activeSceneItemsOverride = null;
  activeSceneGeneration = 0;
  activeReconcileForce = false;
  completedGenerationKey = null;
  stateMetadataWatcher.reset();
  sceneItemBounds.clear();
  requested = false;
  mounted = false;
}
