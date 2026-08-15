import OBR, { buildPath, Command } from "@owlbear-rodeo/sdk";
import { sendProjectedReminderPayload } from "./options/reminderProjectionBroadcast.js";
import { ID, SPELL_ZONE_TRIGGER_NOTICE_CHANNEL } from "./constants.js";
import { getConditionInstances } from "./conditions.js";
import { withItemMetaHistory } from "./history.js";
import { loadAoEStyle } from "./aoeStyle.js";
import { buildArea } from "./aoeGeometryCore.js";
import { spellAreaGridCells } from "./spellAreaPlacementCore.js";
import {
  CLASS_FEATURE_AURA_META_KEY,
  classFeatureAuraEndsOnSourceCondition,
  classFeatureAuraMembershipPlan,
  classFeatureAuraTargetIds,
  collectActiveClassFeatureAuras,
  staleClassFeatureAuraEffectRemovals,
} from "./classFeatureAuraCore.js";
import {
  CLASS_FEATURE_BY_ID,
} from "./classFeatureCatalog.js";
import { getInitiativeCard } from "./initiativeCards.js";
import {
  CLASS_FEATURE_STATE_FIELD,
  normalizeClassFeatureState,
} from "./classFeatureCore.js";
import { deactivateClassFeature } from "./classFeatureRuntime.js";
import { requireAppliedEffectsMutation, runEffectsMutation } from "./effectsMutations.js";
import {
  mergeClassFeatureAuraReminderMetadata,
  planClassFeatureAuraReminder,
} from "./classFeatureAuraReminderCore.js";
import { subscribeSceneItemChanges } from "./sceneItemEvents.js";
import { reconcileOwnedSceneItems } from "./sceneItemReconcileCore.js";
import { currentSceneEpoch, isCurrentSceneEpoch } from "./sceneEpoch.js";
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
let requestedReason = "event";
let requestedForce = false;
let completedSnapshotKey = null;
const stateMetadataWatcher = createSceneMetadataKeyWatcher(STATE_KEY);
// createSceneItemBoundsCache resta posseduta dal servizio condiviso, non dal controller.
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

function auraVisualMetadata(aura, dpi, sizeCells, style) {
  return {
    version: 2,
    instanceId: aura.instanceId,
    featureId: aura.featureId,
    sourceId: aura.sourceId,
    radiusMeters: aura.radiusMeters,
    dpi,
    sizeCells,
    fillColor: style.fillColor,
    strokeColor: style.strokeColor,
    theme: aura.theme,
  };
}

function classFeatureAuraStyle(aura) {
  const base = loadAoEStyle();
  const theme = aura?.theme && typeof aura.theme === "object"
    ? aura.theme
    : {};
  const color = (value, fallback) => /^#[0-9a-f]{6}$/iu.test(String(value || ""))
    ? value
    : fallback;
  return {
    ...base,
    fillColor: color(theme.background, base.fillColor),
    strokeColor: color(theme.accent, base.strokeColor),
  };
}

function buildAuraVisual({
  aura,
  center,
  caster,
  dpi,
  sizeCells,
  reminderUpdate = null,
}) {
  const style = classFeatureAuraStyle(aura);
  const radius = sizeCells * dpi;
  const metadata = mergeClassFeatureAuraReminderMetadata(
    auraVisualMetadata(aura, dpi, sizeCells, style),
    reminderUpdate,
  );
  return buildPath()
    .commands(circleCommands(radius))
    .fillRule("evenodd")
    .fillColor(style.fillColor)
    .fillOpacity(Math.min(0.18, Math.max(0.06, Number(style.fillOpacity) || 0.12)))
    .strokeColor(style.strokeColor)
    .strokeOpacity(0.9)
    .strokeWidth(Math.max(2, dpi * 0.025 * style.strokeWidth))
    .position(center)
    .attachedTo(aura.sourceId)
    .locked(true)
    .disableHit(true)
    .layer("DRAWING")
    .disableAttachmentBehavior(["ROTATION", "VISIBLE", "COPY", "SCALE"])
    .visible(true)
    .zIndex((Number(caster?.zIndex) || 0) - 1)
    .metadata({ [CLASS_FEATURE_AURA_META_KEY]: metadata })
    .name(`Aura capacità: ${aura.conditionName}`)
    .build();
}

function auraVisualIsCompatible(item, desired) {
  const style = classFeatureAuraStyle(desired.aura);
  const expected = auraVisualMetadata(
    desired.aura,
    desired.dpi,
    desired.sizeCells,
    style,
  );
  const actual = item?.metadata?.[CLASS_FEATURE_AURA_META_KEY] || {};
  return item.layer === "DRAWING"
    && item.attachedTo === desired.aura.sourceId
    && actual.featureId === expected.featureId
    && Number(actual.dpi) === expected.dpi
    && Number(actual.sizeCells) === expected.sizeCells
    && actual.fillColor === expected.fillColor
    && actual.strokeColor === expected.strokeColor;
}

function auraVisualNeedsUpdate(item, desired) {
  if (!desired.reminderUpdate?.changed) return false;
  const metadata = item?.metadata?.[CLASS_FEATURE_AURA_META_KEY] || {};
  const merged = mergeClassFeatureAuraReminderMetadata(
    metadata,
    desired.reminderUpdate,
  );
  return JSON.stringify(metadata) !== JSON.stringify(merged);
}

async function reconcileAuraVisuals(desiredVisuals, sceneEpoch, snapshot = null) {
  return reconcileOwnedSceneItems({
    desired: desiredVisuals,
    identityOfDesired: (desired) => desired.aura.instanceId,
    readItems: () => OBR.scene.items.getItems(
      (item) => !!item?.metadata?.[CLASS_FEATURE_AURA_META_KEY],
    ),
    identityOfItem: (item) => item?.metadata?.[CLASS_FEATURE_AURA_META_KEY]?.instanceId,
    isCompatible: auraVisualIsCompatible,
    needsUpdate: auraVisualNeedsUpdate,
    buildItem: buildAuraVisual,
    addItems: (items) => OBR.scene.items.addItems(items),
    updateItems: async (updates) => {
      const byId = new Map(updates.map(({ item, spec }) => [item.id, spec]));
      await OBR.scene.items.updateItems([...byId.keys()], (drafts) => {
        for (const item of drafts) {
          const desired = byId.get(item.id);
          const metadata = item.metadata?.[CLASS_FEATURE_AURA_META_KEY];
          if (!desired || !metadata) continue;
          item.metadata = {
            ...(item.metadata || {}),
            [CLASS_FEATURE_AURA_META_KEY]: mergeClassFeatureAuraReminderMetadata(
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

async function clearStaleSuppressions(plans, isCurrent = () => true) {
  const bySource = new Map();
  for (const plan of plans) {
    if (!plan?.sourceId || !plan?.instanceId || !plan.staleTargetIds?.length) continue;
    const entry = bySource.get(plan.sourceId) || new Map();
    entry.set(plan.instanceId, new Set(plan.staleTargetIds));
    bySource.set(plan.sourceId, entry);
  }
  if (!bySource.size) return;
  const sourceIds = [...bySource.keys()];
  await withItemMetaHistory({
    kind: "class-feature",
    label: "Aggiornata membership aura",
    itemIds: sourceIds,
    fields: [CLASS_FEATURE_STATE_FIELD],
    isCurrent: () => isCurrent(),
  }, () => OBR.scene.items.updateItems(sourceIds, (drafts) => {
    for (const draft of drafts) {
      const removals = bySource.get(draft.id);
      if (!removals) continue;
      const meta = { ...(draft.metadata?.[META_KEY] || {}) };
      const state = normalizeClassFeatureState(meta[CLASS_FEATURE_STATE_FIELD]);
      let changed = false;
      const instances = state.instances.map((instance) => {
        const stale = removals.get(instance.instanceId);
        if (!stale?.size) return instance;
        const nextSuppressed = instance.suppressedTargetIds
          .filter((targetId) => !stale.has(targetId));
        if (nextSuppressed.length === instance.suppressedTargetIds.length) return instance;
        changed = true;
        return { ...instance, suppressedTargetIds: nextSuppressed };
      });
      if (!changed) continue;
      meta[CLASS_FEATURE_STATE_FIELD] = { ...state, instances };
      draft.metadata = { ...(draft.metadata || {}), [META_KEY]: meta };
    }
  }));
}

async function currentRound(sceneMetadata) {
  return Math.max(1, Math.floor(Number(sceneMetadata?.[STATE_KEY]?.round) || 1));
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

async function reconcileClassFeatureAuras({ reason = "event", force = false } = {}) {
  const sceneEpoch = currentSceneEpoch();
  if (!await OBR.scene.isReady().catch(() => false)) return;
  const snapshot = await spatialSceneSnapshot.getSnapshot({ sceneEpoch });
  if (
    !snapshot.complete
    || !isCurrentSceneEpoch(sceneEpoch)
    || !spatialSceneSnapshot.isCurrent(snapshot)
  ) {
    scheduleClassFeatureAuraRecovery();
    return;
  }
  if (!stateMetadataWatcher.initialized) stateMetadataWatcher.seed(snapshot.sceneMetadata);
  if (stateMetadataWatcher.initialized
      && sceneMetadataKeyDigest(snapshot.sceneMetadata, STATE_KEY) !== stateMetadataWatcher.digest) {
    scheduleClassFeatureAuraRecovery();
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
  const round = await currentRound(sceneMetadata);
  if (!isCurrentSceneEpoch(sceneEpoch) || !spatialSceneSnapshot.isCurrent(snapshot)) return;
  const characterBuildBySourceId = new Map(
    items.map((item) => [item.id, getInitiativeCard(item).characterBuild])
  );
  const collectedAuras = collectActiveClassFeatureAuras(items, {
    metaKey: META_KEY,
    featureById: CLASS_FEATURE_BY_ID,
    currentRound: round,
    characterBuildBySourceId,
  });
  const byId = new Map(items.map((item) => [item.id, item]));
  const endedAuras = collectedAuras.filter((aura) => (
    classFeatureAuraEndsOnSourceCondition(
      aura,
      getConditionInstances(byId.get(aura.sourceId)?.metadata?.[META_KEY]?.conditions),
    )
  ));
  if (endedAuras.length) {
    for (const aura of endedAuras) {
      if (!isCurrentSceneEpoch(sceneEpoch) || !spatialSceneSnapshot.isCurrent(snapshot)) return;
      await deactivateClassFeature(aura.sourceId, aura.instanceId);
    }
    if (!isCurrentSceneEpoch(sceneEpoch) || !spatialSceneSnapshot.isCurrent(snapshot)) return;
    // La mutazione sopra innesca normalmente onChange; mantenere comunque
    // una nuova iterazione garantisce che area e pill spariscano subito.
    requested = true;
    return;
  }
  const auras = collectedAuras;
  const order = Array.isArray(sceneMetadata?.[STATE_KEY]?.order)
    ? sceneMetadata[STATE_KEY].order
    : [];
  const orderedIds = new Set(order.map((id) => String(id || "").split("::p")[0]));
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
      consumer: "class-feature-aura",
    })
    : {
      boundsById: new Map(),
      complete: true,
      missingIds: [],
      skipped: true,
    };
  if (!isCurrentSceneEpoch(sceneEpoch) || !spatialSceneSnapshot.isCurrent(snapshot)) return;
  if (!boundsResult.complete) {
    scheduleClassFeatureAuraRecovery();
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
  const suppressionPlans = [];
  const existingAuraVisualByInstance = new Map(
    items
      .filter((item) => item?.metadata?.[CLASS_FEATURE_AURA_META_KEY]?.instanceId)
      .map((item) => [
        String(item.metadata[CLASS_FEATURE_AURA_META_KEY].instanceId),
        item,
      ]),
  );
  const newTriggerNotices = [];

  for (const aura of auras) {
    const caster = byId.get(aura.sourceId);
    const casterBounds = boundsById.get(aura.sourceId);
    const center = boundsCenter(casterBounds) || point(caster?.position);
    const cleanupAuraMembership = () => {
      if (!aura.targetEffect) return;
      const suppressed = new Set(aura.activation.suppressedTargetIds || []);
      suppressionPlans.push({
        sourceId: aura.sourceId,
        instanceId: aura.instanceId,
        staleTargetIds: [...suppressed],
      });
      operations.push(...classFeatureAuraMembershipPlan({
        aura,
        desiredTargetIds: [],
        items,
        metaKey: META_KEY,
      }).operations);
    };
    if (!caster || !center || !aura.radiusMeters) {
      cleanupAuraMembership();
      continue;
    }
    const sizeCells = spellAreaGridCells({ value: aura.radiusMeters, unit: "m" }, gridScale);
    if (!sizeCells) {
      cleanupAuraMembership();
      continue;
    }
    const gridOrigin = point(
      await OBR.scene.grid.snapPosition(center, 1, true, false).catch(() => center)
    ) || center;
    if (!isCurrentSceneEpoch(sceneEpoch) || !spatialSceneSnapshot.isCurrent(snapshot)) return;
    const area = buildArea(
      "circle",
      center,
      { x: center.x + sizeCells * dpi, y: center.y },
      dpi,
      gridOrigin,
    );
    const rawTargetIds = classFeatureAuraTargetIds({
      aura,
      area,
      candidates,
      metaKey: META_KEY,
    });
    const suppressed = new Set(aura.activation.suppressedTargetIds || []);
    const staleTargetIds = [...suppressed].filter((targetId) => !rawTargetIds.includes(targetId));
    suppressionPlans.push({
      sourceId: aura.sourceId,
      instanceId: aura.instanceId,
      staleTargetIds,
    });
    const desiredTargetIds = rawTargetIds.filter((targetId) => !suppressed.has(targetId));
    operations.push(...classFeatureAuraMembershipPlan({
      aura,
      desiredTargetIds,
      items,
      metaKey: META_KEY,
    }).operations);
    const reminderUpdate = planClassFeatureAuraReminder({
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
      caster,
      dpi,
      sizeCells,
      reminderUpdate,
    });
  }

  const activeInstanceIds = auras.map((aura) => aura.instanceId);
  const staleRemovals = staleClassFeatureAuraEffectRemovals(items, {
    activeInstanceIds,
    suppressSourceCardPillInstanceIds: auras
      .filter((aura) => aura.feature?.suppressSourceCardPill === true)
      .map((aura) => aura.instanceId),
    metaKey: META_KEY,
  });
  if (staleRemovals.length) {
    operations.unshift({ type: "condition:remove-instances", removals: staleRemovals });
  }
  if (!isCurrentSceneEpoch(sceneEpoch) || !spatialSceneSnapshot.isCurrent(snapshot)) return;
  if (operations.length) {
    const mutation = await runEffectsMutation(operations, {
      history: false,
      kind: "class-feature-aura",
      label: "Aggiornata membership aura",
    });
    requireAppliedEffectsMutation(mutation);
  }
  if (!isCurrentSceneEpoch(sceneEpoch) || !spatialSceneSnapshot.isCurrent(snapshot)) return;
  await clearStaleSuppressions(
    suppressionPlans,
    () => isCurrentSceneEpoch(sceneEpoch) && spatialSceneSnapshot.isCurrent(snapshot),
  );
  if (!isCurrentSceneEpoch(sceneEpoch) || !spatialSceneSnapshot.isCurrent(snapshot)) return;
  await reconcileAuraVisuals(desiredVisuals, sceneEpoch, snapshot);
  if (!isCurrentSceneEpoch(sceneEpoch) || !spatialSceneSnapshot.isCurrent(snapshot)) return;
  if (newTriggerNotices.length) {
    void sendProjectedReminderPayload(
      SPELL_ZONE_TRIGGER_NOTICE_CHANNEL,
      {
        type: "show-zone-trigger-notices",
        activationIds: newTriggerNotices.map((notice) => notice.activationId),
        notices: newTriggerNotices,
      },
    ).catch((error) => {
      console.warn("[class-feature-aura] trigger notice:", error?.message || error);
    });
  }
  if (isCurrentSceneEpoch(sceneEpoch) && spatialSceneSnapshot.isCurrent(snapshot)) {
    completedSnapshotKey = processingKey;
  }
}

function scheduleClassFeatureAuraRecovery() {
  if (!mounted || recoveryTimer) return;
  recoveryTimer = setTimeout(() => {
    recoveryTimer = null;
    requestClassFeatureAuraReconcile({ reason: "recovery", force: true });
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
        await reconcileClassFeatureAuras({ reason, force });
      } catch (error) {
        console.error("[class-feature-aura] reconcile:", error);
        scheduleClassFeatureAuraRecovery();
      }
    }
  } finally {
    running = false;
  }
}

export function requestClassFeatureAuraReconcile(options = {}) {
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

export async function mountClassFeatureAuraController() {
  if (mounted) return true;
  const role = await OBR.player.getRole().catch(() => "PLAYER");
  if (role !== "GM") return false;
  spatialSceneSnapshot.mount();
  mounted = true;
  unsubscribeItems = subscribeSceneItemChanges(
    () => requestClassFeatureAuraReconcile({ reason: "items" }),
    {
      domains: ["aura"],
      filter: (event) => !event?.derived?.output,
    },
  );
  unsubscribeGrid = OBR.scene.grid.onChange(() => {
    requestClassFeatureAuraReconcile({ reason: "grid" });
  });
  unsubscribeSceneReady = OBR.scene.onReadyChange((ready) => {
    if (!ready) {
      if (recoveryTimer) clearTimeout(recoveryTimer);
      recoveryTimer = null;
      completedSnapshotKey = null;
      stateMetadataWatcher.reset();
      return;
    }
    requestClassFeatureAuraReconcile({ reason: "scene-ready", force: true });
  });
  unsubscribeSceneMetadata = OBR.scene.onMetadataChange((metadata) => {
    const observed = stateMetadataWatcher.initialized
      ? stateMetadataWatcher.observe(metadata)
      : stateMetadataWatcher.seed(metadata);
    if (observed.changed) requestClassFeatureAuraReconcile({ reason: "metadata" });
  });
  requestClassFeatureAuraReconcile({ reason: "mount", force: true });
  return true;
}

export function unmountClassFeatureAuraController() {
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
  requested = false;
  requestedReason = "event";
  requestedForce = false;
  completedSnapshotKey = null;
  stateMetadataWatcher.reset();
  mounted = false;
  running = false;
}

globalThis.__tbpClassFeatureAuraController = {
  request: requestClassFeatureAuraReconcile,
  state: () => ({ mounted, running, requested }),
};
