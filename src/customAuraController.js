import OBR, { buildPath, Command } from "@owlbear-rodeo/sdk";
import { ID, SPELL_ZONE_TRIGGER_NOTICE_CHANNEL } from "./constants.js";
import { buildArea } from "./aoeGeometryCore.js";
import {
  CUSTOM_AURA_META_KEY,
  collectActiveCustomAuras,
  customAuraMembershipPlan,
  customAuraTargetIds,
  staleCustomAuraEffectRemovals,
} from "./customAuraCore.js";
import {
  mergeCustomAuraReminderMetadata,
  planCustomAuraReminder,
} from "./customAuraReminderCore.js";
import {
  requireAppliedEffectsMutation,
  runEffectsMutation,
} from "./effectsMutations.js";
import { reconcileOwnedSceneItems } from "./sceneItemReconcileCore.js";
import { createSceneItemBoundsCache } from "./sceneItemBoundsCache.js";
import { subscribeSceneItemChanges } from "./sceneItemEvents.js";
import { currentSceneEpoch, isCurrentSceneEpoch } from "./sceneEpoch.js";
import { spellAreaGridCells } from "./spellAreaPlacementCore.js";

const META_KEY = `${ID}/meta`;
const STATE_KEY = `${ID}/state`;
const RECONCILE_DELAY_MS = 70;
const RECONCILE_RECOVERY_DELAY_MS = 250;
const ITEM_BOUNDS_TIMEOUT_MS = 1200;

let mounted = false;
let running = false;
let requested = false;
let timer = null;
let recoveryTimer = null;
let unsubscribeItems = null;
let unsubscribeGrid = null;
let unsubscribeSceneReady = null;
let unsubscribeSceneMetadata = null;
const sceneItemBounds = createSceneItemBoundsCache(
  (itemId) => OBR.scene.items.getItemBounds([itemId]),
  { timeoutMs: ITEM_BOUNDS_TIMEOUT_MS },
);

function point(value) {
  const x = Number(value?.x);
  const y = Number(value?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function boundsCenter(bounds) {
  return point(bounds?.center) || (
    point(bounds?.min) && point(bounds?.max)
      ? {
        x: (Number(bounds.min.x) + Number(bounds.max.x)) / 2,
        y: (Number(bounds.min.y) + Number(bounds.max.y)) / 2,
      }
      : null
  );
}

function circleCommands(radius) {
  const handle = radius * 0.5522847498;
  return [
    [Command.MOVE, radius, 0],
    [Command.CUBIC, radius, handle, handle, radius, 0, radius],
    [Command.CUBIC, -handle, radius, -radius, handle, -radius, 0],
    [Command.CUBIC, -radius, -handle, -handle, -radius, 0, -radius],
    [Command.CUBIC, handle, -radius, radius, -handle, radius, 0],
    [Command.CLOSE],
  ];
}

function trackedCreature(item, orderedIds) {
  const meta = item?.metadata?.[META_KEY];
  return !!item?.id
    && !!meta
    && (meta.inInitiative === true || orderedIds.has(item.id));
}

function auraVisualMetadata(aura, dpi, sizeCells) {
  return {
    version: 1,
    instanceId: aura.instanceId,
    auraId: aura.id,
    sourceId: aura.sourceId,
    name: aura.name,
    radiusMeters: aura.radiusMeters,
    dpi,
    sizeCells,
    fillColor: aura.style.fillColor,
    fillOpacity: aura.style.fillOpacity,
    strokeColor: aura.style.strokeColor,
    strokeWidth: aura.style.strokeWidth,
  };
}

function buildAuraVisual({
  aura,
  center,
  source,
  dpi,
  sizeCells,
  reminderUpdate = null,
}) {
  const radius = sizeCells * dpi;
  const metadata = mergeCustomAuraReminderMetadata(
    auraVisualMetadata(aura, dpi, sizeCells),
    reminderUpdate,
  );
  return buildPath()
    .commands(circleCommands(radius))
    .fillRule("evenodd")
    .fillColor(aura.style.fillColor)
    .fillOpacity(aura.style.fillOpacity)
    .strokeColor(aura.style.strokeColor)
    .strokeOpacity(0.9)
    .strokeWidth(Math.max(2, dpi * 0.025 * aura.style.strokeWidth))
    .position(center)
    .attachedTo(aura.sourceId)
    .locked(true)
    .disableHit(true)
    .layer("DRAWING")
    .disableAttachmentBehavior(["ROTATION", "VISIBLE", "COPY", "SCALE"])
    .visible(true)
    .zIndex((Number(source?.zIndex) || 0) - 1)
    .metadata({ [CUSTOM_AURA_META_KEY]: metadata })
    .name(`Aura personalizzata: ${aura.name}`)
    .build();
}

function auraVisualIsCompatible(item, desired) {
  const expected = auraVisualMetadata(
    desired.aura,
    desired.dpi,
    desired.sizeCells,
  );
  const actual = item?.metadata?.[CUSTOM_AURA_META_KEY] || {};
  return item.layer === "DRAWING"
    && item.attachedTo === desired.aura.sourceId
    && actual.auraId === expected.auraId
    && actual.name === expected.name
    && Number(actual.radiusMeters) === expected.radiusMeters
    && Number(actual.dpi) === expected.dpi
    && Number(actual.sizeCells) === expected.sizeCells
    && actual.fillColor === expected.fillColor
    && Number(actual.fillOpacity) === expected.fillOpacity
    && actual.strokeColor === expected.strokeColor
    && Number(actual.strokeWidth) === expected.strokeWidth;
}

function auraVisualNeedsUpdate(item, desired) {
  if (!desired.reminderUpdate?.changed) return false;
  const metadata = item?.metadata?.[CUSTOM_AURA_META_KEY] || {};
  const merged = mergeCustomAuraReminderMetadata(
    metadata,
    desired.reminderUpdate,
  );
  return JSON.stringify(metadata) !== JSON.stringify(merged);
}

async function reconcileAuraVisuals(desiredVisuals, sceneEpoch) {
  return reconcileOwnedSceneItems({
    desired: desiredVisuals,
    identityOfDesired: (desired) => desired.aura.instanceId,
    readItems: () => OBR.scene.items.getItems(
      (item) => !!item?.metadata?.[CUSTOM_AURA_META_KEY],
    ),
    identityOfItem: (item) => item?.metadata?.[CUSTOM_AURA_META_KEY]?.instanceId,
    isCompatible: auraVisualIsCompatible,
    needsUpdate: auraVisualNeedsUpdate,
    buildItem: buildAuraVisual,
    addItems: (items) => OBR.scene.items.addItems(items),
    updateItems: async (updates) => {
      const byId = new Map(updates.map(({ item, spec }) => [item.id, spec]));
      await OBR.scene.items.updateItems([...byId.keys()], (drafts) => {
        for (const item of drafts) {
          const desired = byId.get(item.id);
          const metadata = item.metadata?.[CUSTOM_AURA_META_KEY];
          if (!desired || !metadata) continue;
          item.metadata = {
            ...(item.metadata || {}),
            [CUSTOM_AURA_META_KEY]: mergeCustomAuraReminderMetadata(
              metadata,
              desired.reminderUpdate,
            ),
          };
        }
      });
    },
    deleteItems: (ids) => OBR.scene.items.deleteItems(ids),
    isCurrent: () => isCurrentSceneEpoch(sceneEpoch),
  });
}

async function reconcileCustomAuras() {
  const sceneEpoch = currentSceneEpoch();
  if (!await OBR.scene.isReady().catch(() => false)) return;
  const [items, sceneMetadata, dpiValue, scale] = await Promise.all([
    OBR.scene.items.getItems(),
    OBR.scene.getMetadata().catch(() => ({})),
    OBR.scene.grid.getDpi(),
    OBR.scene.grid.getScale().catch(() => ({
      parsed: { multiplier: 1.5, unit: "m" },
    })),
  ]);
  if (!isCurrentSceneEpoch(sceneEpoch)) return;
  const auras = collectActiveCustomAuras(items, { metaKey: META_KEY });
  const byId = new Map(items.map((item) => [item.id, item]));
  const order = Array.isArray(sceneMetadata?.[STATE_KEY]?.order)
    ? sceneMetadata[STATE_KEY].order
    : [];
  const orderedIds = new Set(
    order.map((id) => String(id || "").replace(/::p\d+$/u, "")),
  );
  const creatures = items.filter((item) => trackedCreature(item, orderedIds));
  const requiredIds = new Set([
    ...creatures.map((item) => item.id),
    ...auras.map((aura) => aura.sourceId),
  ]);
  const boundedItems = [...requiredIds]
    .map((id) => byId.get(id))
    .filter(Boolean);
  const boundsResult = await sceneItemBounds.load(boundedItems);
  if (!isCurrentSceneEpoch(sceneEpoch)) return;
  if (!boundsResult.complete) {
    scheduleCustomAuraRecovery();
    return;
  }
  const boundsById = boundsResult.boundsById;
  const candidates = creatures.map((item) => ({
    item,
    bounds: boundsById.get(item.id),
  }));
  const dpi = Math.max(1, Number(dpiValue) || 150);
  const gridScale = {
    multiplier: Number(scale?.parsed?.multiplier) || 1.5,
    unit: String(scale?.parsed?.unit || "m"),
  };
  const operations = [];
  const desiredVisuals = [];
  const newTriggerNotices = [];
  const existingAuraVisualByInstance = new Map(
    items
      .filter((item) => item?.metadata?.[CUSTOM_AURA_META_KEY]?.instanceId)
      .map((item) => [
        String(item.metadata[CUSTOM_AURA_META_KEY].instanceId),
        item,
      ]),
  );

  for (const aura of auras) {
    const source = byId.get(aura.sourceId);
    const sourceBounds = boundsById.get(aura.sourceId);
    const center = boundsCenter(sourceBounds) || point(source?.position);
    const cleanupMembership = () => {
      operations.push(...customAuraMembershipPlan({
        aura,
        desiredTargetIds: [],
        items,
        metaKey: META_KEY,
      }).operations);
    };
    if (!source || !center) {
      cleanupMembership();
      continue;
    }
    const sizeCells = spellAreaGridCells(
      { value: aura.radiusMeters, unit: "m" },
      gridScale,
    );
    if (!sizeCells) {
      cleanupMembership();
      continue;
    }
    const gridOrigin = point(
      await OBR.scene.grid.snapPosition(center, 1, true, false).catch(() => center),
    ) || center;
    const area = buildArea(
      "circle",
      center,
      { x: center.x + sizeCells * dpi, y: center.y },
      dpi,
      gridOrigin,
    );
    const desiredTargetIds = customAuraTargetIds({
      aura,
      area,
      candidates,
      metaKey: META_KEY,
    });
    operations.push(...customAuraMembershipPlan({
      aura,
      desiredTargetIds,
      items,
      metaKey: META_KEY,
    }).operations);
    const reminderUpdate = planCustomAuraReminder({
      aura,
      auraItem: existingAuraVisualByInstance.get(aura.instanceId) || null,
      desiredTargetIds,
      initiativeState: sceneMetadata?.[STATE_KEY] || {},
      itemsById: byId,
      areaPosition: center,
    });
    newTriggerNotices.push(...reminderUpdate.notices);
    desiredVisuals.push({
      aura,
      center,
      source,
      dpi,
      sizeCells,
      reminderUpdate,
    });
  }

  const staleRemovals = staleCustomAuraEffectRemovals(items, {
    activeInstanceIds: auras.map((aura) => aura.instanceId),
    metaKey: META_KEY,
  });
  if (staleRemovals.length) {
    operations.unshift({
      type: "condition:remove-instances",
      removals: staleRemovals,
    });
  }
  if (!isCurrentSceneEpoch(sceneEpoch)) return;
  if (operations.length) {
    const mutation = await runEffectsMutation(operations, {
      history: false,
      kind: "custom-aura",
      label: "Aggiornata membership aura personalizzata",
    });
    requireAppliedEffectsMutation(mutation);
  }
  if (!isCurrentSceneEpoch(sceneEpoch)) return;
  await reconcileAuraVisuals(desiredVisuals, sceneEpoch);
  if (!isCurrentSceneEpoch(sceneEpoch)) return;
  if (newTriggerNotices.length) {
    void OBR.broadcast.sendMessage(
      SPELL_ZONE_TRIGGER_NOTICE_CHANNEL,
      {
        type: "show-zone-trigger-notices",
        activationIds: newTriggerNotices.map((notice) => notice.activationId),
        notices: newTriggerNotices,
      },
      { destination: "ALL" },
    ).catch((error) => {
      console.warn("[custom-aura] trigger notice:", error?.message || error);
    });
  }
}

function scheduleCustomAuraRecovery() {
  if (!mounted || recoveryTimer) return;
  recoveryTimer = setTimeout(() => {
    recoveryTimer = null;
    requestCustomAuraReconcile();
  }, RECONCILE_RECOVERY_DELAY_MS);
}

async function pump() {
  if (running) return;
  running = true;
  try {
    while (requested) {
      requested = false;
      try {
        await reconcileCustomAuras();
      } catch (error) {
        console.error("[custom-aura] reconcile:", error);
        scheduleCustomAuraRecovery();
      }
    }
  } finally {
    running = false;
  }
}

export function requestCustomAuraReconcile() {
  if (recoveryTimer) clearTimeout(recoveryTimer);
  recoveryTimer = null;
  requested = true;
  if (running || timer) return;
  timer = setTimeout(() => {
    timer = null;
    void pump();
  }, RECONCILE_DELAY_MS);
}

export async function mountCustomAuraController() {
  if (mounted) return true;
  const role = await OBR.player.getRole().catch(() => "PLAYER");
  if (role !== "GM") return false;
  mounted = true;
  unsubscribeItems = subscribeSceneItemChanges(
    () => requestCustomAuraReconcile(),
    {
      domains: ["aura"],
      filter: (event) => !event?.derived?.output,
    },
  );
  unsubscribeGrid = OBR.scene.grid.onChange(() => {
    sceneItemBounds.clear();
    requestCustomAuraReconcile();
  });
  unsubscribeSceneReady = OBR.scene.onReadyChange((ready) => {
    if (!ready) {
      sceneItemBounds.clear();
      if (recoveryTimer) clearTimeout(recoveryTimer);
      recoveryTimer = null;
      return;
    }
    requestCustomAuraReconcile();
  });
  unsubscribeSceneMetadata = OBR.scene.onMetadataChange(
    requestCustomAuraReconcile,
  );
  requestCustomAuraReconcile();
  return true;
}

export function unmountCustomAuraController() {
  unsubscribeItems?.();
  unsubscribeItems = null;
  unsubscribeGrid?.();
  unsubscribeGrid = null;
  unsubscribeSceneReady?.();
  unsubscribeSceneReady = null;
  unsubscribeSceneMetadata?.();
  unsubscribeSceneMetadata = null;
  if (timer) clearTimeout(timer);
  timer = null;
  if (recoveryTimer) clearTimeout(recoveryTimer);
  recoveryTimer = null;
  sceneItemBounds.clear();
  requested = false;
  mounted = false;
  running = false;
}

globalThis.__tbpCustomAuraController = {
  request: requestCustomAuraReconcile,
  state: () => ({ mounted, running, requested }),
};
