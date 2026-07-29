import OBR, { buildPath, Command } from "@owlbear-rodeo/sdk";
import { buildArea, buildCellBoundaryLoops } from "./aoeGeometryCore.js";
import { AOE_AREA_META_KEY, loadAoEStyle, normalizeAoEStyle } from "./aoeStyle.js";
import { ID, SPELL_ZONE_TRIGGER_NOTICE_CHANNEL } from "./constants.js";
import { queueSpellAreaEffectsMutation } from "./spellAreaMutationQueue.js";
import {
  areaMembershipEffects,
  areaMembershipPlan,
  areaMembershipTargetIds,
  staleAreaMembershipEffectRemovals,
} from "./spellAreaMembershipCore.js";
import { getSpellAreaRuleById, SPELL_AREA_RULES } from "./spellAreaRules.js";
import { spellAreaStyle } from "./spellAreaStyleCore.js";
import {
  SPELL_STATIC_ZONE_META_KEY,
  isStaticSpellZoneRule,
  staticSpellZoneItems,
  staticSpellZoneMetadata,
} from "./spellStaticZoneCore.js";
import {
  SPELL_ZONE_TRIGGER_WORKFLOW_ENABLED,
  mergePlannedSpellZoneTriggerRuntime,
  normalizeSpellZoneTriggerRuntime,
  planSpellZoneTriggers,
} from "./spellZoneTriggerCore.js";

const RECONCILE_DELAY_MS = 80;
const RECONCILE_WATCHDOG_MS = 1000;
const META_KEY = `${ID}/meta`;
const STATE_KEY = `${ID}/state`;

let mounted = false;
let running = false;
let requested = false;
let timer = null;
let watchdogTimer = null;
let unsubscribeItems = null;
let unsubscribeSceneReady = null;
let unsubscribeSceneMetadata = null;
let queuedSceneMetadata = null;

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

function point(value) {
  const x = Number(value?.x);
  const y = Number(value?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function translatedZoneArea(item) {
  const metadata = item?.metadata?.[AOE_AREA_META_KEY];
  if (!metadata?.type || !metadata?.start || !metadata?.end) return null;
  const position = point(item.position) || { x: 0, y: 0 };
  const base = point(metadata.basePosition) || { x: 0, y: 0 };
  const delta = { x: position.x - base.x, y: position.y - base.y };
  const translate = (entry) => ({
    x: Number(entry.x) + delta.x,
    y: Number(entry.y) + delta.y,
  });
  return buildArea(
    metadata.type,
    translate(metadata.start),
    translate(metadata.end),
    metadata.dpi,
    translate(metadata.gridOrigin || metadata.start),
  );
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

function itemPortrait(item) {
  return String(
    item?.image?.url
    || item?.image?.src
    || item?.asset?.image?.url
    || ""
  ).trim().slice(0, 2048);
}

function suppressedTriggerTargets(rule, instanceId, candidates) {
  const suppressedByTrigger = {};
  for (const trigger of rule?.zonePolicy?.triggers || []) {
    const names = new Set(
      (Array.isArray(trigger?.skipLinkedConditions)
        ? trigger.skipLinkedConditions
        : [])
        .map((name) => String(name || "").trim().toLocaleLowerCase("it"))
        .filter(Boolean)
    );
    if (!names.size) continue;
    suppressedByTrigger[trigger.id] = candidates
      .filter(({ item }) => conditionInstances(item).some((condition) =>
        condition?.active !== false
        && String(condition?.parentEffectId || "") === String(instanceId || "")
        && names.has(
          String(condition?.name || condition?.condition || "")
            .trim()
            .toLocaleLowerCase("it")
        )
      ))
      .map(({ item }) => item.id);
  }
  return suppressedByTrigger;
}

async function itemBounds(items) {
  const entries = await Promise.all(items.map(async (item) => {
    try {
      return [item.id, await OBR.scene.items.getItemBounds([item.id])];
    } catch {
      return [item.id, null];
    }
  }));
  return new Map(entries);
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
} = {}) {
  const rule = getSpellAreaRuleById(ruleId);
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

  const area = buildArea(type, start, end, dpi, gridOrigin);
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
    commands: geometryCommands(area),
    style: resolvedStyle,
    fillOpacity: 0,
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
      }),
    },
    locked: true,
    disableHit: true,
  });
  geometry.attachedTo = root.id;
  return [root, geometry];
}

export async function getStaticSpellZoneItems({
  instanceId = "",
  casterId = "",
} = {}) {
  const items = await OBR.scene.items.getItems();
  return staticSpellZoneItems(items, { instanceId, casterId });
}

export async function commitWithStaticSpellZoneRemoval(zoneItems = [], action) {
  if (typeof action !== "function") throw new TypeError("static-zone-action-required");
  const snapshots = Array.isArray(zoneItems) ? zoneItems.filter(Boolean) : [];
  const zoneIds = snapshots.map((item) => item.id).filter(Boolean);
  if (!zoneIds.length) return action();
  await OBR.scene.items.deleteItems(zoneIds);
  try {
    return await action();
  } catch (error) {
    await OBR.scene.items.addItems(snapshots).catch(() => {});
    throw error;
  }
}

async function reconcileStaticSpellZones(sceneMetadataOverride = null) {
  if (!await OBR.scene.isReady().catch(() => false)) return;
  const [items, fetchedSceneMetadata] = await Promise.all([
    OBR.scene.items.getItems(),
    OBR.scene.getMetadata().catch(() => ({})),
  ]);
  const sceneMetadata = sceneMetadataOverride
    && typeof sceneMetadataOverride === "object"
    && !Array.isArray(sceneMetadataOverride)
    ? sceneMetadataOverride
    : fetchedSceneMetadata;
  const zoneRoots = staticSpellZoneItems(items)
    .filter((item) =>
      item?.metadata?.[SPELL_STATIC_ZONE_META_KEY]?.role === "root"
    );
  if (!zoneRoots.length) {
    const zoneEffectIds = SPELL_AREA_RULES
      .filter((rule) => rule.kind === "zone")
      .flatMap((rule) =>
        areaMembershipEffects(rule).map((effect) => effect.id)
      )
      .filter(Boolean);
    const staleEffectRemovals = staleAreaMembershipEffectRemovals(items, {
      activeInstanceIds: [],
      effectIds: zoneEffectIds,
      metaKey: META_KEY,
    });
    if (staleEffectRemovals.length) {
      await queueSpellAreaEffectsMutation([{
        type: "condition:remove-instances",
        removals: staleEffectRemovals,
      }]);
    }
    return;
  }
  const order = sceneMetadata?.[STATE_KEY]?.order || [];
  const orderedIds = new Set(
    order.map((id) => String(id || "").split("::p")[0])
  );
  const creatures = items.filter((item) => trackedCreature(item, orderedIds));
  const byId = new Map(items.map((item) => [item.id, item]));
  const requiredIds = new Set([
    ...creatures.map((item) => item.id),
    ...zoneRoots.map((item) =>
      item.metadata[SPELL_STATIC_ZONE_META_KEY]?.casterId
    ),
  ]);
  const boundedItems = [...requiredIds]
    .map((id) => byId.get(id))
    .filter(Boolean);
  const boundsById = await itemBounds(boundedItems);
  const candidates = creatures.map((item) => ({
    item,
    bounds: boundsById.get(item.id),
  }));
  const operations = [];
  const triggerRuntimeUpdates = new Map();
  const newTriggerActivations = [];
  const newTriggerNotices = [];
  const initiativeState = sceneMetadata?.[STATE_KEY] || {};

  for (const item of zoneRoots) {
    const zoneMetadata = item.metadata[SPELL_STATIC_ZONE_META_KEY];
    const rule = getSpellAreaRuleById(zoneMetadata.ruleId);
    const area = translatedZoneArea(item);
    if (!rule || !area) continue;
    const desiredTargetIds = areaMembershipTargetIds({
      sourceId: zoneMetadata.casterId,
      rule,
      area,
      candidates,
      metaKey: META_KEY,
    });
    const caster = byId.get(zoneMetadata.casterId);
    operations.push(...areaMembershipPlan({
      instanceId: zoneMetadata.instanceId,
      sourceId: zoneMetadata.casterId,
      rule,
      desiredTargetIds,
      items,
      metaKey: META_KEY,
      sourceName: caster?.name || "",
      defaultExpiry: { mode: "manual" },
    }).operations);
    if (!SPELL_ZONE_TRIGGER_WORKFLOW_ENABLED) continue;
    const previousRuntime = normalizeSpellZoneTriggerRuntime(
      zoneMetadata.triggerRuntime
    );
    const triggerPlan = planSpellZoneTriggers({
      rule,
      zoneMetadata,
      runtime: previousRuntime,
      currentTargetIds: desiredTargetIds,
      initiativeState,
      suppressedTargetIdsByTrigger: suppressedTriggerTargets(
        rule,
        zoneMetadata.instanceId,
        candidates,
      ),
      areaPosition: item.position,
    });
    if (
      JSON.stringify(previousRuntime) !== JSON.stringify(triggerPlan.runtime)
    ) {
      triggerRuntimeUpdates.set(item.id, {
        baseRuntime: previousRuntime,
        runtime: triggerPlan.runtime,
        newActivations: triggerPlan.newActivations,
      });
    }
    newTriggerActivations.push(...triggerPlan.newActivations);
    for (const activation of triggerPlan.newActivations) {
      const targets = activation.targetIds
        .map((targetId) => byId.get(targetId))
        .filter(Boolean)
        .map((target) => ({
          id: target.id,
          name: String(target.name || "Token").trim().slice(0, 100)
            || "Token",
          portrait: itemPortrait(target),
        }));
      if (!targets.length) continue;
      newTriggerNotices.push({
        activationId: activation.id,
        spellName: String(item.name || "Incantesimo")
          .replace(/^Zona:\s*/i, "")
          .trim()
          .slice(0, 100) || "Incantesimo",
        label: String(
          activation.label || "Tiro salvezza richiesto"
        ).trim().slice(0, 160) || "Tiro salvezza richiesto",
        targets,
      });
    }
  }

  const activeInstanceIds = zoneRoots
    .map((item) =>
      item.metadata[SPELL_STATIC_ZONE_META_KEY]?.instanceId
    )
    .filter(Boolean);
  const zoneEffectIds = SPELL_AREA_RULES
    .filter((rule) => rule.kind === "zone")
    .flatMap((rule) =>
      areaMembershipEffects(rule).map((effect) => effect.id)
    )
    .filter(Boolean);
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
  if (operations.length) await queueSpellAreaEffectsMutation(operations);
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
            [SPELL_STATIC_ZONE_META_KEY]: {
              ...metadata,
              triggerRuntime: mergePlannedSpellZoneTriggerRuntime(
                metadata.triggerRuntime,
                update.runtime,
                update.newActivations,
                update.baseRuntime,
              ),
            },
          };
        }
      },
    );
  }
  if (newTriggerNotices.length) {
    // La coda persistente serve alla risoluzione in Effetti ad Area; il
    // reminder visivo riceve invece un payload live già completo.
    void OBR.broadcast.sendMessage(
      SPELL_ZONE_TRIGGER_NOTICE_CHANNEL,
      {
        type: "show-zone-trigger-notices",
        activationIds: newTriggerActivations.map((activation) => activation.id),
        notices: newTriggerNotices,
      },
      { destination: "ALL" },
    ).catch((error) => {
      console.warn(
        "[spell-static-zone] trigger notice:",
        error?.message || error,
      );
    });
  }
}

async function pump() {
  if (running) return;
  running = true;
  try {
    while (requested) {
      requested = false;
      const sceneMetadataOverride = queuedSceneMetadata;
      queuedSceneMetadata = null;
      try {
        await reconcileStaticSpellZones(sceneMetadataOverride);
      } catch (error) {
        console.error("[spell-static-zone] reconcile:", error);
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
}

export function requestStaticSpellZoneReconcile() {
  requested = true;
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
  unsubscribeItems = OBR.scene.items.onChange(
    requestStaticSpellZoneReconcile
  );
  unsubscribeSceneReady = OBR.scene.onReadyChange((ready) => {
    if (!ready) {
      queuedSceneMetadata = null;
      return;
    }
    requestStaticSpellZoneReconcile();
  });
  unsubscribeSceneMetadata = OBR.scene.onMetadataChange((metadata) => {
    queuedSceneMetadata = metadata;
    requestStaticSpellZoneReconcile();
  });
  watchdogTimer = setInterval(
    requestStaticSpellZoneReconcile,
    RECONCILE_WATCHDOG_MS,
  );
  requestStaticSpellZoneReconcile();
  return true;
}

export function unmountStaticSpellZoneController() {
  unsubscribeItems?.();
  unsubscribeItems = null;
  unsubscribeSceneReady?.();
  unsubscribeSceneReady = null;
  unsubscribeSceneMetadata?.();
  unsubscribeSceneMetadata = null;
  if (watchdogTimer) clearInterval(watchdogTimer);
  watchdogTimer = null;
  if (timer) clearTimeout(timer);
  timer = null;
  queuedSceneMetadata = null;
  requested = false;
  mounted = false;
}
