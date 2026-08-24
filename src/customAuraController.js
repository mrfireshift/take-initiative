import OBR, { buildPath, Command } from "@owlbear-rodeo/sdk";
import { sendProjectedReminderPayload } from "./options/reminderProjectionBroadcast.js";
import { ID, SPELL_ZONE_TRIGGER_NOTICE_CHANNEL } from "./constants.js";
import { buildArea } from "./aoeGeometryCore.js";
import {
  CUSTOM_AURAS_FIELD,
  CUSTOM_AURA_META_KEY,
  collectActiveCustomAuras,
  customAuraMembershipPlan,
  customAuraRule,
  customAuraTargetIds,
  staleCustomAuraEffectRemovals,
} from "./customAuraCore.js";
import { syncCustomAurasListWithPresets } from "./customAuraPresetCore.js";
import { getCustomAuraPresetStore } from "./customAuraPresetStore.js";

import {
  mergeCustomAuraReminderMetadata,
  planCustomAuraReminder,
} from "./customAuraReminderCore.js";
import {
  requireAppliedEffectsMutation,
  runEffectsMutation,
} from "./effectsMutations.js";
import { reconcileOwnedSceneItems } from "./sceneItemReconcileCore.js";
import { subscribeSceneItemChanges } from "./sceneItemEvents.js";
import { currentSceneEpoch, isCurrentSceneEpoch } from "./sceneEpoch.js";
import { spellAreaGridCells } from "./spellAreaPlacementCore.js";
import { getSpatialSceneSnapshotService } from "./spatialSceneSnapshot.js";
import {
  createSceneMetadataKeyWatcher,
  sceneMetadataKeyDigest,
} from "./sceneMetadataDigest.js";

const META_KEY = `${ID}/meta`;
const STATE_KEY = `${ID}/state`;
const RECONCILE_DELAY_MS = 70;
const RECONCILE_RECOVERY_DELAY_MS = 250;

let mounted = false;
let running = false;
let requested = false;
let timer = null;
let recoveryTimer = null;
let unsubscribeItems = null;
let unsubscribeGrid = null;
let unsubscribeSceneReady = null;
let unsubscribeSceneMetadata = null;
let unsubscribePresetStore = null;
let requestedReason = "event";

let requestedForce = false;
let completedSnapshotKey = null;
const stateMetadataWatcher = createSceneMetadataKeyWatcher(STATE_KEY);
const spatialSceneSnapshot = getSpatialSceneSnapshotService();

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

function auraVisualReconcilePerformedOwnedWrite(result) {
  const metrics = result?.metrics || {};
  return [metrics.addCalls, metrics.updateCalls, metrics.deleteCalls]
    .some((value) => Number(value) > 0);
}

async function reconcileAuraVisuals(desiredVisuals, sceneEpoch, snapshot = null) {
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
    isCurrent: () => isCurrentSceneEpoch(sceneEpoch)
      && (!snapshot || spatialSceneSnapshot.isCurrent(snapshot)),
  });
}

function spatialSnapshotProcessingKey(snapshot) {
  return JSON.stringify({
    sceneEpoch: snapshot?.sceneEpoch,
    sceneIdentity: snapshot?.sceneIdentity,
    itemGeneration: snapshot?.itemGeneration,
    metadataRevision: snapshot?.metadataRevision,
    gridRevision: snapshot?.gridRevision,
    geometryRevision: snapshot?.geometryRevision,
    stateDigest: stateMetadataWatcher.digest,
  });
}

async function reconcileCustomAuras({ reason = "event", force = false } = {}) {
  const sceneEpoch = currentSceneEpoch();
  if (!await OBR.scene.isReady().catch(() => false)) return;
  const snapshot = await spatialSceneSnapshot.getSnapshot({ sceneEpoch });
  if (
    !snapshot.complete
    || !isCurrentSceneEpoch(sceneEpoch)
    || !spatialSceneSnapshot.isCurrent(snapshot)
  ) {
    scheduleCustomAuraRecovery();
    return;
  }
  if (!stateMetadataWatcher.initialized) stateMetadataWatcher.seed(snapshot.sceneMetadata);
  if (stateMetadataWatcher.initialized
      && sceneMetadataKeyDigest(snapshot.sceneMetadata, STATE_KEY) !== stateMetadataWatcher.digest) {
    scheduleCustomAuraRecovery();
    return;
  }
  const processingKey = spatialSnapshotProcessingKey(snapshot);
  if (!force && completedSnapshotKey === processingKey) return;
  const {
    items,
    sceneMetadata,
    dpiValue,
    scale,
  } = snapshot;

  const presetCatalog = getCustomAuraPresetStore().readPresets();
  const presetUpdates = [];
  for (const item of items) {
    const rawAuras = item?.metadata?.[META_KEY]?.[CUSTOM_AURAS_FIELD];
    if (!Array.isArray(rawAuras) || !rawAuras.length) continue;
    const { auras: syncedAuras, changed } = syncCustomAurasListWithPresets(
      rawAuras,
      presetCatalog,
    );
    if (changed) {
      presetUpdates.push({ itemId: item.id, auras: syncedAuras });
    }
  }
  if (presetUpdates.length) {
    const updateMap = new Map(presetUpdates.map((u) => [u.itemId, u.auras]));
    await OBR.scene.items.updateItems(presetUpdates.map((u) => u.itemId), (drafts) => {
      for (const draft of drafts) {
        const nextAuras = updateMap.get(draft.id);
        if (!nextAuras) continue;
        draft.metadata = {
          ...(draft.metadata || {}),
          [META_KEY]: {
            ...(draft.metadata?.[META_KEY] || {}),
            [CUSTOM_AURAS_FIELD]: nextAuras,
          },
        };
      }
    });
    if (!isCurrentSceneEpoch(sceneEpoch)) return;
    requestCustomAuraReconcile({ reason: "preset-sync" });
    return;
  }

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
  const boundsResult = auras.length
    ? await spatialSceneSnapshot.ensureBounds(snapshot, boundedItems, {
      consumer: "custom-aura",
    })
    : {
      boundsById: new Map(),
      complete: true,
      missingIds: [],
      skipped: true,
    };
  if (!isCurrentSceneEpoch(sceneEpoch) || !spatialSceneSnapshot.isCurrent(snapshot)) return;
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

  const activeEffectKeys = new Set();
  for (const aura of auras) {
    const rule = customAuraRule(aura);
    for (const effect of (rule?.effectPolicy?.effects || [])) {
      const effectId = String(effect?.id || "").trim();
      if (effectId) activeEffectKeys.add(`${aura.instanceId}:${effectId}`);
    }
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
    if (!isCurrentSceneEpoch(sceneEpoch) || !spatialSceneSnapshot.isCurrent(snapshot)) return;
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
    activeEffectKeys,
    metaKey: META_KEY,
  });
  if (staleRemovals.length) {
    operations.unshift({
      type: "condition:remove-instances",
      removals: staleRemovals,
    });
  }
  if (!isCurrentSceneEpoch(sceneEpoch) || !spatialSceneSnapshot.isCurrent(snapshot)) return;
  if (operations.length) {
    const mutation = await runEffectsMutation(operations, {
      history: false,
      kind: "custom-aura",
      label: "Aggiornata membership aura personalizzata",
    });
    requireAppliedEffectsMutation(mutation);
  }
  if (!isCurrentSceneEpoch(sceneEpoch)) return;
  if (!spatialSceneSnapshot.isCurrent(snapshot)) {
    requestCustomAuraReconcile({ reason: "effects-mutation" });
    return;
  }
  const auraVisualReconcile = await reconcileAuraVisuals(
    desiredVisuals,
    sceneEpoch,
    snapshot,
  );
  if (!isCurrentSceneEpoch(sceneEpoch)) return;
  if (
    !spatialSceneSnapshot.isCurrent(snapshot)
    && !auraVisualReconcilePerformedOwnedWrite(auraVisualReconcile)
  ) {
    scheduleCustomAuraRecovery();
    return;
  }
  if (newTriggerNotices.length) {
    void sendProjectedReminderPayload(
      SPELL_ZONE_TRIGGER_NOTICE_CHANNEL,
      {
        type: "show-zone-trigger-notices",
        activationIds: newTriggerNotices.map((notice) => notice.activationId),
        notices: newTriggerNotices,
      },
    ).catch((error) => {
      console.warn("[custom-aura] trigger notice:", error?.message || error);
    });
  }
  if (isCurrentSceneEpoch(sceneEpoch) && spatialSceneSnapshot.isCurrent(snapshot)) {
    completedSnapshotKey = processingKey;
  }
}


function scheduleCustomAuraRecovery() {
  if (!mounted || recoveryTimer) return;
  recoveryTimer = setTimeout(() => {
    recoveryTimer = null;
    requestCustomAuraReconcile({ reason: "recovery", force: true });
  }, RECONCILE_RECOVERY_DELAY_MS);
}

async function pump() {
  if (running) return;
  running = true;
  try {
    while (requested) {
      requested = false;
      const reason = requestedReason;
      const force = requestedForce;
      requestedReason = "event";
      requestedForce = false;
      try {
        await reconcileCustomAuras({ reason, force });
      } catch (error) {
        console.error("[custom-aura] reconcile:", error);
        scheduleCustomAuraRecovery();
      }
    }
  } finally {
    running = false;
  }
}

export function requestCustomAuraReconcile(options = {}) {
  const normalized = typeof options === "string" ? { reason: options } : options || {};
  if (recoveryTimer) clearTimeout(recoveryTimer);
  recoveryTimer = null;
  requested = true;
  requestedReason = String(normalized.reason || "event");
  requestedForce ||= normalized.force === true || requestedReason === "recovery"
    || requestedReason === "runtime-cache-cleanup";
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
  spatialSceneSnapshot.mount();
  mounted = true;
  unsubscribeItems = subscribeSceneItemChanges(
    () => requestCustomAuraReconcile({ reason: "items" }),
    {
      domains: ["aura"],
      filter: (event) => !event?.derived?.output,
    },
  );
  unsubscribeGrid = OBR.scene.grid.onChange(() => {
    requestCustomAuraReconcile({ reason: "grid" });
  });
  unsubscribeSceneReady = OBR.scene.onReadyChange((ready) => {
    if (!ready) {
      if (recoveryTimer) clearTimeout(recoveryTimer);
      recoveryTimer = null;
      completedSnapshotKey = null;
      stateMetadataWatcher.reset();
      return;
    }
    requestCustomAuraReconcile({ reason: "scene-ready", force: true });
  });
  unsubscribeSceneMetadata = OBR.scene.onMetadataChange((metadata) => {
    const observed = stateMetadataWatcher.initialized
      ? stateMetadataWatcher.observe(metadata)
      : stateMetadataWatcher.seed(metadata);
    if (observed.changed) requestCustomAuraReconcile({ reason: "metadata" });
  });
  unsubscribePresetStore = getCustomAuraPresetStore().subscribe(() => {
    requestCustomAuraReconcile({ reason: "preset-store-change", force: true });
  });
  requestCustomAuraReconcile({ reason: "mount", force: true });
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
  unsubscribePresetStore?.();
  unsubscribePresetStore = null;
  if (timer) clearTimeout(timer);
  timer = null;
  if (recoveryTimer) clearTimeout(recoveryTimer);
  recoveryTimer = null;
  requested = false;
  requestedReason = "event";
  requestedForce = false;
  completedSnapshotKey = null;
  stateMetadataWatcher.reset();
  mounted = false;
  running = false;
}


globalThis.__tbpCustomAuraController = {
  request: requestCustomAuraReconcile,
  state: () => ({ mounted, running, requested }),
};
