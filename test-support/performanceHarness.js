import { ID } from "../src/constants.js";
import { actorProfileIdFromItem } from "../src/actorIdentityCore.js";
import {
  ACTOR_VITALS_ROOM_MAX_BYTES,
  createActorVitalsStore,
} from "../src/actorVitalsStore.js";
import { actorVitalsByteSize } from "../src/actorVitalsCore.js";
import {
  createEffectsReconcileQueue,
  collectEffectsInvalidation,
} from "../src/effectsReconcilerCore.js";
import { createEffectsMutationCoordinator } from "../src/effectsMutationCoordinator.js";
import {
  createHistoryOwnerBroker,
  normalizeHistoryState,
} from "../src/historyOwnerCore.js";
import { advanceInitiativeState } from "../src/initiativeRenderCore.js";
import { createInitiativeRenderScheduler } from "../src/initiativeRenderSchedulerCore.js";
import { createInitiativeStateGateway } from "../src/initiativeStateGatewayCore.js";
import { createSceneItemBoundsCache } from "../src/sceneItemBoundsCache.js";
import {
  classifySceneItemChanges,
  createSceneItemChangeDispatcher,
} from "../src/sceneItemChangeDispatcherCore.js";
import { reconcileOwnedSceneItems } from "../src/sceneItemReconcileCore.js";
import { createSceneLifecycleAdapter, runSceneLifecycleOperation } from "../src/sceneLifecycle.js";
import { createSpatialSceneSnapshotService } from "../src/spatialSceneSnapshot.js";
import { createSceneMetadataKeyWatcher, sceneMetadataKeyDigest } from "../src/sceneMetadataDigest.js";
import { readFullRenderItemSnapshot } from "../src/initiativeFullRenderSnapshotCore.js";
import {
  initiativeCardQuickActionMemoryCandidates,
  initiativeCardQuickActionMemoryEligibleItems,
} from "../src/initiativeCardRegistryCore.js";
import { spellBoardTokenTrackerItems } from "../src/spellBoardTokenTrackerCore.js";
import { buildCircleArea } from "../src/aoeGeometryCore.js";
import {
  classFeatureAuraMembershipPlan,
  classFeatureAuraTargetIds,
  collectActiveClassFeatureAuras,
} from "../src/classFeatureAuraCore.js";
import { CLASS_FEATURE_CATALOG } from "../src/classFeatureCatalog.js";
import {
  collectActiveCustomAuras,
  customAuraMembershipPlan,
  customAuraTargetIds,
} from "../src/customAuraCore.js";
import {
  collectActiveMobileAuras,
  mobileAuraMembershipPlan,
  mobileAuraTargetIds,
} from "../src/spellAuraCore.js";
import { staticSpellZoneItems } from "../src/spellStaticZoneCore.js";
import {
  DeterministicClock,
  createPerformanceMetrics,
} from "./performanceMetrics.js";
import {
  createPerformanceFixture,
  PERFORMANCE_CLASS_AURA_KEY,
  PERFORMANCE_CONCENTRATION_KEY,
  PERFORMANCE_CUSTOM_AURA_KEY,
  PERFORMANCE_META_KEY,
  PERFORMANCE_SCENARIO_DEFAULTS,
  PERFORMANCE_SPELLS_KEY,
  PERFORMANCE_STATE_KEY,
  PERFORMANCE_STATIC_ZONE_KEY,
} from "./performanceFixture.js";
import { createPerformanceObr } from "./performanceObr.js";

const HISTORY_KEY = `${ID}/history`;
const ACTOR_VITALS_KEY = `${ID}/actorVitals`;
const OUTPUT_META_KEY = `${ID}/performanceOutput`;

const PRODUCTIVE_MODULES = Object.freeze([
  "src/sceneItemChangeDispatcherCore.js",
  "src/initiativeRenderSchedulerCore.js",
  "src/effectsReconcilerCore.js",
  "src/effectsMutationCoordinator.js",
  "src/actorVitalsStore.js",
  "src/historyOwnerCore.js",
  "src/initiativeStateGatewayCore.js",
  "src/sceneLifecycle.js",
  "src/sceneItemBoundsCache.js",
  "src/spatialSceneSnapshot.js",
  "src/sceneMetadataDigest.js",
  "src/initiativeFullRenderSnapshotCore.js",
  "src/initiativeCardRegistryCore.js",
  "src/spellBoardTokenTrackerCore.js",
  "src/sceneItemReconcileCore.js",
  "src/spellAuraCore.js",
  "src/classFeatureAuraCore.js",
  "src/customAuraCore.js",
  "src/spellStaticZoneCore.js",
  "src/initiativeRenderCore.js",
]);

function clone(value) {
  if (value === undefined) return undefined;
  if (typeof globalThis.structuredClone === "function") return globalThis.structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function tokenItems(items) {
  return (Array.isArray(items) ? items : []).filter((item) => item?.layer === "CHARACTER");
}

function outputItem({ id, owner, kind, targetId = null, value = null }) {
  return {
    id,
    type: "LABEL",
    layer: "TEXT",
    name: `${owner}:${kind}:${targetId || id}`,
    position: { x: 0, y: 0 },
    width: 1,
    height: 0.25,
    text: {
      type: "PLAIN",
      plainText: value === null ? kind : String(value),
      width: 1,
      height: 0.25,
    },
    visible: true,
    locked: true,
    disableHit: true,
    metadata: {
      [OUTPUT_META_KEY]: {
        owner,
        kind,
        targetId,
      },
    },
  };
}

function currentSceneMatches(server, lifecycle, captured) {
  return lifecycle.isReady()
    && Number(lifecycle.currentEpoch()) === Number(captured?.epoch)
    && server.getCurrentSceneIdentity() === captured?.identity;
}

function withController(metrics, phase, realm, controller, callback, extra = {}) {
  return metrics.withContext({
    phase,
    realm,
    controller,
    ...extra,
  }, callback);
}

function queueDepthFromState(state = {}) {
  let depth = 0;
  if (state.pending !== undefined) depth += Number(state.pending) || 0;
  if (state.running === true) depth += 1;
  if (state.scheduled === true) depth += 1;
  if (state.pending?.full === true) depth += 1;
  if (state.pending?.conditions?.length) depth += 1;
  if (state.pending?.concentration?.length) depth += 1;
  if (state.fullPending === true || state.fullRunning === true) depth += 1;
  if (state.incrementalPending?.length) depth += 1;
  return depth;
}

function makeHistoryOwner({ server, realm, lifecycle, metrics }) {
  const isCurrent = (captured) => currentSceneMatches(server, lifecycle, {
    epoch: captured?.epoch,
    identity: captured?.identity,
  });
  const owner = createHistoryOwnerBroker({
    maxEntries: 256,
    readHistory: async () => {
      const metadata = await realm.scene.getMetadata();
      return metadata?.[HISTORY_KEY];
    },
    writeHistory: async (history) => realm.scene.setMetadata({ [HISTORY_KEY]: history }),
    notify: async (result) => realm.broadcast.sendMessage(
      `${ID}/performance-history`,
      { type: "history-changed", entryId: result.entry?.id || null },
      { destination: "LOCAL" },
    ),
    recordCombatLog: async () => {},
    normalizeHistory: (value, options) => normalizeHistoryState(value, {
      ...options,
      maxEntries: 256,
    }),
    maxEntries: 256,
    isSceneCurrent: isCurrent,
  });

  function sync(snapshot) {
    owner.setSceneContext({
      ready: snapshot.ready,
      sceneIdentity: snapshot.ready ? server.getCurrentSceneIdentity() : null,
      sceneEpoch: snapshot.ready ? snapshot.epoch : null,
    });
    metrics.recordLifecycle(snapshot.ready ? "ready" : "unload", {
      realm: realm.__performanceRealmId,
      controller: "history-owner",
    });
  }
  return { owner, sync };
}

async function syncOwnedLocal(realm, owner, desiredItems, { isCurrent = () => true } = {}) {
  const desired = (Array.isArray(desiredItems) ? desiredItems : []).filter((item) => item?.id);
  const result = await reconcileOwnedSceneItems({
    desired,
    readItems: () => realm.scene.local.getItems((item) => (
      item?.metadata?.[OUTPUT_META_KEY]?.owner === owner
    )),
    identityOfDesired: (item) => item.id,
    identityOfItem: (item) => item.id,
    needsUpdate: (item, spec) => JSON.stringify(item) !== JSON.stringify(spec),
    buildItem: (spec) => clone(spec),
    addItems: (items) => realm.scene.local.addItems(items),
    updateItems: (updates) => {
      const desiredById = new Map(updates.map(({ item, spec }) => [item.id, spec]));
      return realm.scene.local.updateItems(updates.map(({ item }) => item.id), (drafts) => {
        for (const draft of drafts) {
          const next = desiredById.get(draft.id);
          if (!next) continue;
          Object.keys(draft).forEach((key) => delete draft[key]);
          Object.assign(draft, clone(next));
        }
      });
    },
    deleteItems: (ids) => realm.scene.local.deleteItems(ids),
    isCurrent,
  });
  return {
    added: result.metrics.requestedAdds,
    updated: result.metrics.requestedUpdates,
    deleted: result.metrics.requestedDeletes,
    desired: desired.length,
    passes: result.metrics.passes,
    recovery: result.recovered,
  };
}

function createQueueTracker(metrics, name, getState, promise, detail = {}) {
  const state = typeof getState === "function" ? getState() : {};
  const queuedDepth = queueDepthFromState(state) + 1;
  metrics.recordQueue(name, {
    ...detail,
    event: "queued",
    depth: queuedDepth,
  });
  const startedAt = Number(detail.startedAt) || 0;
  return Promise.resolve(promise).then(async (value) => {
    await Promise.resolve();
    await Promise.resolve();
    const next = typeof getState === "function" ? getState() : {};
    metrics.recordQueue(name, {
      ...detail,
      event: "completed",
      depth: queueDepthFromState(next),
      serviceMs: Math.max(0, (detail.clock?.now?.() || 0) - startedAt),
    });
    return value;
  }, (error) => {
    metrics.recordQueue(name, {
      ...detail,
      event: "failed",
      depth: queueDepthFromState(typeof getState === "function" ? getState() : {}),
    });
    throw error;
  });
}

async function createMainRuntime({ server, realm, metrics, clock, fixture, kind }) {
  const runtimeId = realm.__performanceRealmId;
  const pending = new Set();
  const disposers = [];
  let dispatcher = null;
  let scheduler = null;
  let effectsQueue = null;
  let actorVitals = null;
  let history = null;
  let gateway = null;
  let boundsCache = null;
  let spatialSnapshot = null;
  let spatialTail = Promise.resolve();
  let spatialPending = 0;
  let disposed = false;
  let initialized = false;

  const lifecycle = createSceneLifecycleAdapter({ obr: realm });
  await lifecycle.mount();

  const context = () => ({
    ready: lifecycle.isReady(),
    identity: lifecycle.isReady() ? server.getCurrentSceneIdentity() : null,
    epoch: lifecycle.currentEpoch(),
  });
  const isCurrent = (captured) => currentSceneMatches(server, lifecycle, {
    epoch: captured?.epoch,
    identity: captured?.identity,
  });
  const track = (promise) => {
    const task = Promise.resolve(promise);
    pending.add(task);
    task.finally(() => pending.delete(task)).catch(() => {});
    return task;
  };

  dispatcher = createSceneItemChangeDispatcher({
    subscribeSource: (handler) => realm.scene.items.onChange(handler),
    debounceMs: 50,
    getEpoch: () => lifecycle.currentEpoch(),
    setTimer: clock.setTimeout.bind(clock),
    clearTimer: clock.clearTimeout.bind(clock),
  });
  boundsCache = createSceneItemBoundsCache(async (id) => {
    const bounds = await realm.scene.items.getItemBounds([id]);
    return bounds || null;
  });
  if (kind === "background") {
    spatialSnapshot = createSpatialSceneSnapshotService({
      readItemsSnapshot: () => {
        const snapshot = dispatcher.getSnapshot();
        return {
          ...snapshot,
          complete: snapshot.complete === true && lifecycle.isReady(),
          sceneEpoch: lifecycle.currentEpoch(),
        };
      },
      readSceneMetadata: () => realm.scene.getMetadata(),
      readGridDpi: () => realm.scene.grid.getDpi(),
      readGridScale: () => realm.scene.grid.getScale(),
      isSceneReady: () => lifecycle.isReady(),
      getSceneEpoch: () => lifecycle.currentEpoch(),
      isCurrentEpoch: (epoch) => lifecycle.isReady()
        && Number(epoch) === Number(lifecycle.currentEpoch()),
      getSceneIdentity: () => server.getCurrentSceneIdentity(),
      boundsCache,
      subscribeItems: (handler, options) => dispatcher.subscribe(handler, options),
      subscribeGrid: (handler) => realm.scene.grid.onChange(handler),
      subscribeSceneReady: (handler) => realm.scene.onReadyChange(handler),
      subscribeSceneMetadata: (handler) => realm.scene.onMetadataChange(handler),
      subscribeEpoch: (handler) => lifecycle.subscribe((snapshot) => handler({
        phase: snapshot.ready ? "ready" : "unload",
        epoch: snapshot.epoch,
      })),
    });
    spatialSnapshot.mount();
  }

  const featureById = new Map(CLASS_FEATURE_CATALOG.features.map((feature) => [feature.id, feature]));

  async function runEffectsBatch(batch) {
    if (!lifecycle.isReady()) return { stale: true };
    return withController(metrics, metrics.activePhase || "unscoped", runtimeId, "effects-reconciler", async () => {
      const startedAt = clock.now();
      const capturedScene = {
        epoch: lifecycle.currentEpoch(),
        identity: server.getCurrentSceneIdentity(),
      };
      const items = await realm.scene.items.getItems();
      const effects = tokenItems(items).flatMap((item) => (
        item.metadata?.[PERFORMANCE_META_KEY]?.conditions?.instances || []
      ));
      const desired = effects.map((effect) => outputItem({
        id: `output:${runtimeId}:effect:${effect.id}`,
        owner: `effects:${runtimeId}`,
        kind: "pill/effect",
        targetId: effect.targetId,
        value: effect.condition,
      }));
      const result = await syncOwnedLocal(realm, `effects:${runtimeId}`, desired, {
        isCurrent: () => currentSceneMatches(server, lifecycle, capturedScene),
      });
      metrics.recordReconcile("pills/effects", {
        realm: runtimeId,
        controller: "effects-reconciler",
        correlationId: `effects:${batch.revision}`,
        desired: result.desired,
        added: result.added,
        updated: result.updated,
        deleted: result.deleted,
        passes: result.passes,
        recovery: result.recovery,
        durationMs: clock.now() - startedAt,
      });
      return result;
    });
  }

  if (kind === "background") {
    effectsQueue = createEffectsReconcileQueue({
      scheduleTask: (callback) => clock.queueMicrotask(callback),
      run: runEffectsBatch,
    });
    history = makeHistoryOwner({ server, realm, lifecycle, metrics });
    history.sync(lifecycle.getSnapshot());
  }

  async function runFullRender(request) {
    if (!lifecycle.isReady()) return { stale: true };
    return withController(metrics, metrics.activePhase || "unscoped", runtimeId, "tracker-render-full", async () => {
      const startedAt = clock.now();
      const capturedScene = {
        epoch: lifecycle.currentEpoch(),
        identity: server.getCurrentSceneIdentity(),
      };
      const items = await realm.scene.items.getItems();
      const tokens = tokenItems(items);
      const desired = tokens.map((item) => outputItem({
        id: `output:${runtimeId}:card:${item.id}`,
        owner: `tracker:${runtimeId}`,
        kind: "tracker-card",
        targetId: item.id,
        value: item.metadata?.[PERFORMANCE_META_KEY]?.hp,
      }));
      const result = await syncOwnedLocal(realm, `tracker:${runtimeId}`, desired, {
        isCurrent: () => currentSceneMatches(server, lifecycle, capturedScene),
      });
      metrics.recordReconcile("tracker/full", {
        realm: runtimeId,
        controller: "tracker-render-full",
        correlationId: request.correlationId,
        desired: result.desired,
        added: result.added,
        updated: result.updated,
        deleted: result.deleted,
        passes: result.passes,
        recovery: result.recovery,
        durationMs: clock.now() - startedAt,
      });
      metrics.recordReconcile("hp-bars/text", {
        realm: runtimeId,
        controller: "tracker-render-full",
        correlationId: request.correlationId,
        desired: tokens.length,
        passes: result.passes,
        recovery: result.recovery,
        durationMs: clock.now() - startedAt,
      });
      return result;
    });
  }

  async function runIncrementalRender(request) {
    if (!lifecycle.isReady()) return { stale: true };
    return withController(metrics, metrics.activePhase || "unscoped", runtimeId, "tracker-render-incremental", async () => {
      const startedAt = clock.now();
      const capturedScene = {
        epoch: lifecycle.currentEpoch(),
        identity: server.getCurrentSceneIdentity(),
      };
      const items = await realm.scene.items.getItems(request.itemIds);
      const tokens = tokenItems(items);
      const desired = tokens.map((item) => outputItem({
        id: `output:${runtimeId}:card:${item.id}`,
        owner: `tracker:${runtimeId}`,
        kind: "tracker-card",
        targetId: item.id,
        value: item.metadata?.[PERFORMANCE_META_KEY]?.hp,
      }));
      const existing = await realm.scene.local.getItems((item) => (
        item?.metadata?.[OUTPUT_META_KEY]?.owner === `tracker:${runtimeId}`
      ));
      if (!currentSceneMatches(server, lifecycle, capturedScene)) return { stale: true };
      const existingIds = new Set(existing.map((item) => item.id));
      const additions = desired.filter((item) => !existingIds.has(item.id));
      const updates = desired.filter((item) => existingIds.has(item.id));
      if (additions.length) await realm.scene.local.addItems(additions);
      if (updates.length) {
        const byId = new Map(updates.map((item) => [item.id, item]));
        await realm.scene.local.updateItems(updates.map((item) => item.id), (drafts) => {
          for (const draft of drafts) Object.assign(draft, clone(byId.get(draft.id)));
        });
      }
      if (!currentSceneMatches(server, lifecycle, capturedScene)) return { stale: true };
      metrics.recordReconcile("tracker/incremental", {
        realm: runtimeId,
        controller: "tracker-render-incremental",
        correlationId: request.correlationId,
        desired: desired.length,
        added: additions.length,
        updated: updates.length,
        passes: 1,
        durationMs: clock.now() - startedAt,
      });
      if (tokens.length) {
        metrics.recordReconcile("hp-bars/text", {
          realm: runtimeId,
          controller: "tracker-render-incremental",
          correlationId: request.correlationId,
          desired: tokens.length,
          passes: 1,
          durationMs: clock.now() - startedAt,
        });
      }
      return { desired: desired.length, added: additions.length, updated: updates.length };
    });
  }

  if (kind === "tracker-gm" || kind === "tracker-player") {
    scheduler = createInitiativeRenderScheduler({
      getSceneEpoch: () => lifecycle.currentEpoch(),
      isCurrent: (epoch) => lifecycle.isReady() && Number(epoch) === Number(lifecycle.currentEpoch()),
      scheduleTask: (callback) => clock.queueMicrotask(callback),
      onEvent: (event) => metrics.recordRender({
        ...event,
        realm: runtimeId,
        controller: event.mode === "full" ? "tracker-render-full" : "tracker-render-incremental",
        phase: metrics.context()?.phase || metrics.activePhase || "unscoped",
        durationMs: event.type === "committed" ? 0.15 : 0,
      }),
      runFull: runFullRender,
      runIncremental: runIncrementalRender,
    });
  }

  if (kind === "tracker-gm") {
    gateway = createInitiativeStateGateway({
      readState: async () => {
        const metadata = await realm.scene.getMetadata();
        return metadata?.[PERFORMANCE_STATE_KEY];
      },
      writeState: async (state) => realm.scene.setMetadata({ [PERFORMANCE_STATE_KEY]: state }),
      getRole: () => realm.player.getRole(),
      getSceneContext: context,
      isSceneCurrent: (captured) => isCurrent(captured),
      initialSceneContext: {
        ready: lifecycle.isReady(),
        identity: server.getCurrentSceneIdentity(),
        epoch: lifecycle.currentEpoch(),
      },
      readBack: true,
    });
  }

  if (kind === "background") {
    actorVitals = createActorVitalsStore({
      api: realm.room,
      itemsApi: realm.scene.items,
      storage: null,
      authority: "GM",
      getSceneEpoch: () => lifecycle.currentEpoch(),
      isSceneEpochCurrent: (epoch) => lifecycle.isReady() && Number(epoch) === Number(lifecycle.currentEpoch()),
      subscribeItems: (handler, options) => dispatcher.subscribe(handler, options),
      subscribeEpoch: (handler) => lifecycle.subscribe((snapshot) => handler({
        phase: snapshot.ready ? "ready" : "unload",
        epoch: snapshot.epoch,
      })),
      now: () => Math.max(0, Math.floor(clock.now())),
    });
  }

  async function runSpatialReconcile(reason = "event", correlationId = null) {
    if (kind !== "background" || !lifecycle.isReady()) return { stale: true };
    const startedAt = clock.now();
    const capturedScene = {
      epoch: lifecycle.currentEpoch(),
      identity: server.getCurrentSceneIdentity(),
    };
    const snapshot = await spatialSnapshot.getSnapshot({ sceneEpoch: capturedScene.epoch });
    if (
      !snapshot.complete
      || !currentSceneMatches(server, lifecycle, capturedScene)
      || !spatialSnapshot.isCurrent(snapshot)
    ) return { stale: true };
    const items = snapshot.items;
    const tokens = tokenItems(items);
    const zones = items.filter((item) => item.metadata?.performanceFixture?.kind);
    const mobileAuras = collectActiveMobileAuras(tokens, {
      metaKey: PERFORMANCE_META_KEY,
      spellsKey: PERFORMANCE_SPELLS_KEY,
    });
    const classAuras = collectActiveClassFeatureAuras(tokens, {
      metaKey: PERFORMANCE_META_KEY,
      featureById,
      currentRound: 1,
    });
    const customAuras = collectActiveCustomAuras(tokens, { metaKey: PERFORMANCE_META_KEY });
    const staticZones = staticSpellZoneItems(zones);
    const needsBounds = mobileAuras.length + classAuras.length + customAuras.length + staticZones.length > 0;
    const boundsResult = needsBounds
      ? await spatialSnapshot.ensureBounds(snapshot, tokens, { consumer: "spatial-reconcile" })
      : {
        boundsById: new Map(),
        complete: true,
        missingIds: [],
        skipped: true,
      };
    if (
      !currentSceneMatches(server, lifecycle, capturedScene)
      || !spatialSnapshot.isCurrent(snapshot)
    ) return { stale: true };
    if (!boundsResult.complete) return { stale: true, incomplete: true };
    metrics.recordCache("bounds-cache", {
      realm: runtimeId,
      controller: "spatial-reconcile",
      size: boundsResult.boundsById.size,
      miss: boundsResult.missingIds.length > 0,
    });
    const candidates = tokens.map((item) => ({
      item,
      bounds: boundsResult.boundsById.get(item.id),
    }));
    const areas = zones.map((zone) => buildCircleArea(
      zone.position,
      { x: Number(zone.position?.x || 0) + 6, y: Number(zone.position?.y || 0) },
      1,
      zone.position,
    ));
    const localOutputs = [];
    const pass = (kindName, desired, plan) => {
      metrics.recordReconcile(kindName, {
        realm: runtimeId,
        controller: "spatial-reconcile",
        correlationId,
        desired: desired.length,
        added: plan?.entering?.length || 0,
        updated: plan?.operations?.length || 0,
        deleted: plan?.leaving?.length || 0,
        durationMs: clock.now() - startedAt,
      });
      localOutputs.push(outputItem({
        id: `output:${runtimeId}:spatial:${kindName}:${localOutputs.length}`,
        owner: `spatial:${runtimeId}`,
        kind: kindName,
        targetId: desired[0] || null,
        value: desired.length,
      }));
    };

    for (const [index, aura] of mobileAuras.entries()) {
      const desired = mobileAuraTargetIds({
        aura,
        area: areas[index % Math.max(1, areas.length)],
        candidates,
        metaKey: PERFORMANCE_META_KEY,
      });
      pass("spell-aura", desired, mobileAuraMembershipPlan({
        aura,
        desiredTargetIds: desired,
        items: tokens,
        metaKey: PERFORMANCE_META_KEY,
      }));
    }

    for (const [index, aura] of classAuras.entries()) {
      const desired = classFeatureAuraTargetIds({
        aura,
        area: areas[(index + mobileAuras.length) % Math.max(1, areas.length)],
        candidates,
        metaKey: PERFORMANCE_META_KEY,
      });
      pass("class-feature-aura", desired, classFeatureAuraMembershipPlan({
        aura,
        desiredTargetIds: desired,
        items: tokens,
        metaKey: PERFORMANCE_META_KEY,
      }));
    }

    for (const [index, aura] of customAuras.entries()) {
      const desired = customAuraTargetIds({
        aura,
        area: areas[(index + mobileAuras.length + classAuras.length) % Math.max(1, areas.length)],
        candidates,
        metaKey: PERFORMANCE_META_KEY,
      });
      pass("custom-aura", desired, customAuraMembershipPlan({
        aura,
        desiredTargetIds: desired,
        items: tokens,
        metaKey: PERFORMANCE_META_KEY,
      }));
    }

    for (const [index, zone] of staticZones.entries()) {
      const desired = candidates
        .filter(({ bounds }) => {
          const area = areas[(index + 2) % Math.max(1, areas.length)];
          return !!bounds && area?.cells?.some((cell) => (
            bounds.min.x < cell.x + cell.width
            && bounds.max.x > cell.x
            && bounds.min.y < cell.y + cell.height
            && bounds.max.y > cell.y
          ));
        })
        .map(({ item }) => item.id);
      pass("static-zone", desired, { entering: desired, leaving: [], operations: desired });
      localOutputs.push(outputItem({
        id: `output:${runtimeId}:zone:${zone.id}`,
        owner: `spatial:${runtimeId}`,
        kind: "zone-visual",
        targetId: zone.id,
        value: desired.length,
      }));
    }
    metrics.recordReconcile("reminder", {
      realm: runtimeId,
      controller: "spatial-reconcile",
      correlationId,
      desired: 0,
      durationMs: clock.now() - startedAt,
    });
    const localResult = await syncOwnedLocal(realm, `spatial:${runtimeId}`, localOutputs, {
      isCurrent: () => currentSceneMatches(server, lifecycle, capturedScene),
    });
    metrics.recordReconcile("spatial-output", {
      realm: runtimeId,
      controller: "spatial-reconcile",
      correlationId,
      desired: localResult.desired,
      added: localResult.added,
      updated: localResult.updated,
      deleted: localResult.deleted,
      passes: localResult.passes,
      recovery: localResult.recovery,
      durationMs: clock.now() - startedAt,
    });
    return localResult;
  }

  function requestSpatial(reason, correlationId) {
    spatialPending += 1;
    const queueStart = clock.now();
    metrics.recordQueue("reconciler-pump", {
      realm: runtimeId,
      controller: "spatial-reconcile",
      event: "queued",
      depth: spatialPending,
    });
    const task = spatialTail.then(() => runSpatialReconcile(reason, correlationId));
    spatialTail = task.catch(() => {});
    const tracked = track(task.finally(() => {
      spatialPending = Math.max(0, spatialPending - 1);
      metrics.recordQueue("reconciler-pump", {
        realm: runtimeId,
        controller: "spatial-reconcile",
        event: "completed",
        depth: spatialPending,
        serviceMs: clock.now() - queueStart,
      });
    }));
    return tracked;
  }

  function requestEffects(invalidation, event) {
    if (!effectsQueue) return Promise.resolve();
    const state = effectsQueue.getState();
    const result = effectsQueue.request({
      ...invalidation,
      sceneItemsSnapshotGeneration: dispatcher.getSnapshot().generation,
    });
    const tracked = createQueueTracker(
      metrics,
      "effects-reconciler",
      () => effectsQueue.getState(),
      result.done,
      {
        realm: runtimeId,
        controller: "effects-reconciler",
        correlationId: event?.correlationId || event?.batchId || null,
        commandId: event?.commandId || null,
        clock,
        startedAt: clock.now(),
      },
    );
    return track(tracked);
  }

  function scheduleRender(event) {
    if (!scheduler || !event?.flags?.any) return;
    const sceneEpoch = lifecycle.currentEpoch();
    const correlationId = event.correlationId || event.batchId || `event:${event.revision}`;
    if (event.flags.trackerStructure || event.flags.added || event.flags.removed) {
      const request = scheduler.requestFull({
        sceneEpoch,
        sourceRevision: event.revision,
        correlationId,
        reason: event.flags.trackerStructure ? "tracker-structure" : "item-lifecycle",
      });
      track(createQueueTracker(metrics, "render-scheduler", () => scheduler.getState(), request.done, {
        realm: runtimeId,
        controller: "tracker-render",
        correlationId,
        clock,
        startedAt: clock.now(),
      }));
      return;
    }
    if (event.changedIds?.length) {
      const request = scheduler.requestIncremental({
        sceneEpoch,
        sourceRevision: event.revision,
        itemIds: event.changedIds,
        correlationId,
        reason: event.domains?.join(",") || "item-change",
      });
      track(createQueueTracker(metrics, "render-scheduler", () => scheduler.getState(), request.done, {
        realm: runtimeId,
        controller: "tracker-render",
        correlationId,
        clock,
        startedAt: clock.now(),
      }));
    }
  }

  function onImmediateEvent(event) {
    const phase = metrics.context()?.phase || metrics.activePhase || "unscoped";
    metrics.recordEvent("classified", {
      realm: runtimeId,
      controller: "scene-item-dispatcher",
      phase,
      fanout: 1,
    });
    metrics.recordEvent("immediate", {
      realm: runtimeId,
      controller: "scene-item-dispatcher",
      phase,
    });
    if (!event?.flags?.any) {
      metrics.recordEvent("coalesced", {
        realm: runtimeId,
        controller: "scene-item-dispatcher",
        phase,
      });
      return;
    }
    const invalidation = collectEffectsInvalidation(event, {
      metaKey: PERFORMANCE_META_KEY,
      spellsKey: PERFORMANCE_SPELLS_KEY,
      concentrationKey: PERFORMANCE_CONCENTRATION_KEY,
    });
    if (effectsQueue && (invalidation.full || invalidation.conditions.length || invalidation.concentration.length)) {
      void requestEffects(invalidation, event);
    }
    scheduleRender(event);
    if (kind === "background" && (
      event.flags.movement || event.flags.aura || event.flags.zone || event.flags.added || event.flags.removed
    )) {
      void requestSpatial("item-event", event.correlationId || event.batchId);
    }
  }

  const unsubscribeImmediate = dispatcher.subscribe(onImmediateEvent, { immediate: true });
  const unsubscribeBatch = dispatcher.subscribe((event) => {
    metrics.recordEvent("batch", {
      realm: runtimeId,
      controller: "scene-item-dispatcher",
      phase: metrics.context()?.phase || metrics.activePhase || "unscoped",
    });
    metrics.recordEvent("subscriber", {
      realm: runtimeId,
      controller: "scene-item-dispatcher",
      phase: metrics.context()?.phase || metrics.activePhase || "unscoped",
    });
    if (event?.flags?.any && event?.changedIds?.length > 1) {
      metrics.recordEvent("coalesced", {
        realm: runtimeId,
        controller: "scene-item-dispatcher",
        phase: metrics.context()?.phase || metrics.activePhase || "unscoped",
      });
    }
  });
  disposers.push(unsubscribeImmediate, unsubscribeBatch);

  if (actorVitals) {
    await actorVitals.start({ authority: "GM" });
  }

  const unsubscribeMetadata = realm.scene.onMetadataChange((metadata, source) => {
    if (!scheduler || !metadata?.[PERFORMANCE_STATE_KEY] || !lifecycle.isReady()) return;
    const request = scheduler.requestFull({
      sceneEpoch: lifecycle.currentEpoch(),
      sourceRevision: 0,
      correlationId: source?.correlationId || `initiative-state:${lifecycle.currentEpoch()}`,
      reason: "initiative-state",
    });
    track(request.done);
  });
  disposers.push(unsubscribeMetadata);

  async function rebaseline(snapshot) {
    if (!snapshot.ready || disposed) return;
    const items = await realm.scene.items.getItems();
    if (!lifecycle.isReady() || Number(snapshot.epoch) !== Number(lifecycle.currentEpoch())) return;
    dispatcher.resume([]);
    dispatcher.resume(items);
    if (scheduler) {
      const request = scheduler.requestFull({
        sceneEpoch: snapshot.epoch,
        correlationId: `scene-baseline:${server.getCurrentSceneIdentity()}`,
        reason: "scene-baseline",
      });
      track(request.done);
    }
    if (effectsQueue) {
      void requestEffects({ full: true }, { correlationId: `scene-baseline:${server.getCurrentSceneIdentity()}` });
    }
    if (kind === "background") await requestSpatial("scene-baseline", `scene-baseline:${server.getCurrentSceneIdentity()}`);
  }

  const unsubscribeLifecycle = lifecycle.subscribe((snapshot) => {
    metrics.recordLifecycle(snapshot.ready ? "ready" : "unload", {
      realm: runtimeId,
      controller: "scene-lifecycle",
      phase: metrics.context()?.phase || metrics.activePhase || "unscoped",
      listenersBeforeClose: snapshot.ready ? 0 : 1,
    });
    if (!snapshot.ready) {
      dispatcher.suspend();
      scheduler?.reset(snapshot.epoch);
      history?.sync(snapshot);
      return;
    }
    history?.sync(snapshot);
    track(rebaseline(snapshot));
  });
  disposers.push(unsubscribeLifecycle);

  await rebaseline(lifecycle.getSnapshot());
  initialized = true;

  return {
    id: runtimeId,
    kind,
    realm,
    lifecycle,
    dispatcher,
    scheduler,
    effectsQueue,
    actorVitals,
    historyOwner: history?.owner || null,
    gateway,
    boundsCache,
    spatialSnapshot,
    pending,
    track,
    warmReconcile() {
      if (kind === "background") {
        void requestEffects({ full: true }, { correlationId: `warm:${runtimeId}` });
        void requestSpatial("warm-cache", `warm:${runtimeId}`);
      }
      if (scheduler) {
        const request = scheduler.requestFull({
          sceneEpoch: lifecycle.currentEpoch(),
          correlationId: `warm:${runtimeId}`,
          reason: "warm-cache",
        });
        track(request.done);
      }
    },
    requestSpatial,
    async idle() {
      await dispatcher.flush();
      await effectsQueue?.idle?.();
      await scheduler?.idle?.();
      await actorVitals?.getState?.().queuedWrites;
      await spatialTail;
      await Promise.allSettled([...pending]);
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      for (const unsubscribe of disposers.splice(0)) unsubscribe?.();
      actorVitals?.stop?.();
      dispatcher?.suspend?.();
      scheduler?.reset?.(null);
      spatialSnapshot?.unmount?.();
      lifecycle.dispose();
      initialized = false;
    },
    isInitialized: () => initialized && !disposed,
    getState() {
      return {
        id: runtimeId,
        kind,
        initialized,
        disposed,
        lifecycle: lifecycle.getSnapshot(),
        scheduler: scheduler?.getState?.() || null,
        effects: effectsQueue?.getState?.() || null,
        actorVitals: actorVitals?.getState?.() || null,
        history: history?.owner.getState?.() || null,
        gateway: gateway?.getState?.() || null,
        pending: pending.size,
        spatialPending,
      };
    },
  };
}

function spatialTopologyMethod(metricsSnapshot, phaseName, method) {
  const phase = metricsSnapshot.phases?.find((entry) => entry.name === phaseName);
  const record = phase?.sdk?.methods?.[method] || {};
  return {
    calls: Number(record.count) || 0,
    requestedIds: Number(record.requestedIds) || 0,
    maxConcurrency: Number(record.maxConcurrency) || 0,
  };
}

function spatialTopologyPhase(metricsSnapshot, phaseName) {
  const items = spatialTopologyMethod(metricsSnapshot, phaseName, "scene.items.getItems");
  const metadata = spatialTopologyMethod(metricsSnapshot, phaseName, "scene.getMetadata");
  const dpi = spatialTopologyMethod(metricsSnapshot, phaseName, "scene.grid.getDpi");
  const scale = spatialTopologyMethod(metricsSnapshot, phaseName, "scene.grid.getScale");
  const bounds = spatialTopologyMethod(metricsSnapshot, phaseName, "scene.items.getItemBounds");
  return {
    phase: phaseName,
    sceneItemsReads: items.calls,
    metadataReads: metadata.calls,
    gridReads: dpi.calls + scale.calls,
    boundsCalls: bounds.calls,
    boundsRequestedIds: bounds.requestedIds,
    boundsMaxConcurrency: bounds.maxConcurrency,
    sdkCalls: items.calls + metadata.calls + dpi.calls + scale.calls + bounds.calls,
  };
}

async function runSpatialTopologyProfile({ fixture, metrics, clock } = {}) {
  const consumers = ["spell-aura", "class-feature-aura", "custom-aura"];
  const profileServer = createPerformanceObr({
    scenes: fixture.scenes,
    initialSceneId: fixture.scenes[0].id,
    metrics,
    clock,
  });
  const realm = profileServer.createRealm({ id: "spatial-profile-background", role: "GM" });
  let epoch = 1;
  let ready = true;
  let identity = profileServer.getCurrentSceneIdentity();
  let generation = 1;
  let sourceItems = null;
  const profilePhaseNames = [];

  async function phase(name, callback) {
    profilePhaseNames.push(name);
    metrics.beginPhase(name);
    try {
      return await withController(metrics, name, realm.__performanceRealmId, "spatial-topology", callback);
    } finally {
      metrics.finishPhase(name);
    }
  }

  async function readItemsSnapshot() {
    if (!sourceItems) sourceItems = await realm.scene.items.getItems();
    return {
      complete: ready,
      generation,
      items: sourceItems,
      sceneEpoch: epoch,
    };
  }

  function invalidateItems() {
    sourceItems = null;
    generation += 1;
  }

  const makeBoundsCache = () => createSceneItemBoundsCache(async (id) => (
    realm.scene.items.getItemBounds([id])
  ));
  let legacyCaches = consumers.map(() => makeBoundsCache());
  const sharedCache = makeBoundsCache();
  const sharedService = createSpatialSceneSnapshotService({
    readItemsSnapshot,
    readSceneMetadata: () => realm.scene.getMetadata(),
    readGridDpi: () => realm.scene.grid.getDpi(),
    readGridScale: () => realm.scene.grid.getScale(),
    isSceneReady: () => ready,
    getSceneEpoch: () => epoch,
    isCurrentEpoch: (value) => ready && Number(value) === Number(epoch),
    getSceneIdentity: () => identity,
    boundsCache: sharedCache,
    subscribeItems: () => () => {},
    subscribeGrid: () => () => {},
    subscribeSceneReady: () => () => {},
    subscribeSceneMetadata: () => () => {},
    subscribeEpoch: () => () => {},
  });

  async function runLegacy({ clear = false, fresh = false } = {}) {
    if (fresh) legacyCaches = consumers.map(() => makeBoundsCache());
    if (clear) legacyCaches.forEach((cache) => cache.clear());
    return Promise.all(consumers.map((consumer, index) => withController(
      metrics,
      metrics.activePhase,
      realm.__performanceRealmId,
      consumer,
      async () => {
        const items = await realm.scene.items.getItems();
        const tokens = tokenItems(items);
        await realm.scene.getMetadata();
        await realm.scene.grid.getDpi();
        await realm.scene.grid.getScale();
        // Il percorso legacy carica comunque i token anche quando non ci sono aure.
        await legacyCaches[index].load(tokens);
        return tokens.length;
      },
    )));
  }

  async function runShared({ zeroAura = false } = {}) {
    const snapshots = await Promise.all(consumers.map((consumer) => withController(
      metrics,
      metrics.activePhase,
      realm.__performanceRealmId,
      consumer,
      () => sharedService.getSnapshot({ sceneEpoch: epoch }),
    )));
    return Promise.all(snapshots.map((snapshot, index) => withController(
      metrics,
      metrics.activePhase,
      realm.__performanceRealmId,
      consumers[index],
      () => sharedService.ensureBounds(
        snapshot,
        zeroAura ? [] : tokenItems(snapshot.items),
        { consumer: consumers[index] },
      ),
    )));
  }

  await phase("spatial-topology-legacy-cold", () => runLegacy({ fresh: true }));
  await phase("spatial-topology-shared-cold", () => runShared());
  await phase("spatial-topology-legacy-warm", () => runLegacy());
  await phase("spatial-topology-shared-warm", () => runShared());

  const movedId = fixture.tokenIds[0];
  await realm.scene.items.updateItems([movedId], (drafts) => {
    for (const draft of drafts) draft.position.x += 0.5;
  });
  invalidateItems();
  sharedService.invalidate({ reason: "items" });
  await phase("spatial-topology-legacy-movement", () => runLegacy());
  await phase("spatial-topology-shared-movement", () => runShared());

  await realm.scene.setMetadata({ spatialTopologyRevision: 2 });
  sharedService.invalidate({ reason: "metadata" });
  await phase("spatial-topology-legacy-metadata", () => runLegacy());
  await phase("spatial-topology-shared-metadata", () => runShared());

  sharedService.invalidate({ reason: "grid" });
  await phase("spatial-topology-legacy-grid", () => runLegacy());
  await phase("spatial-topology-shared-grid", () => runShared());

  profileServer.switchScene(fixture.scenes[1].id);
  epoch = 2;
  identity = profileServer.getCurrentSceneIdentity();
  generation = 1;
  sourceItems = null;
  legacyCaches.forEach((cache) => cache.clear());
  sharedService.invalidateScene("scene-switch");
  await phase("spatial-topology-legacy-scene-switch", () => runLegacy());
  await phase("spatial-topology-shared-scene-switch", () => runShared());

  await phase("spatial-topology-legacy-zero-aura", () => runLegacy({ fresh: true }));
  await phase("spatial-topology-shared-zero-aura", () => runShared({ zeroAura: true }));

  ready = false;
  const incompleteSnapshot = await phase(
    "spatial-topology-shared-incomplete",
    () => sharedService.getSnapshot({ sceneEpoch: epoch }),
  );
  ready = true;
  sharedService.invalidate({ reason: "scene-ready" });
  const recoveryCache = createSceneItemBoundsCache(async (id) => {
    if (id === fixture.tokenIds[0] && recoveryCache.failOnce) {
      recoveryCache.failOnce = false;
      throw new Error("profile-bounds-temporary-failure");
    }
    return realm.scene.items.getItemBounds([id]);
  });
  recoveryCache.failOnce = true;
  const recoveryService = createSpatialSceneSnapshotService({
    readItemsSnapshot,
    readSceneMetadata: () => realm.scene.getMetadata(),
    readGridDpi: () => realm.scene.grid.getDpi(),
    readGridScale: () => realm.scene.grid.getScale(),
    isSceneReady: () => ready,
    getSceneEpoch: () => epoch,
    isCurrentEpoch: (value) => ready && Number(value) === Number(epoch),
    getSceneIdentity: () => identity,
    boundsCache: recoveryCache,
    subscribeItems: () => () => {},
    subscribeGrid: () => () => {},
    subscribeSceneReady: () => () => {},
    subscribeSceneMetadata: () => () => {},
    subscribeEpoch: () => () => {},
  });
  const recoveryResult = await phase("spatial-topology-shared-recovery", async () => {
    const snapshot = await recoveryService.getSnapshot({ sceneEpoch: epoch });
    const first = await recoveryService.ensureBounds(snapshot, tokenItems(snapshot.items), {
      consumer: "recovery",
    });
    const second = await recoveryService.ensureBounds(snapshot, tokenItems(snapshot.items), {
      consumer: "recovery",
    });
    return { first, second, diagnostics: recoveryService.getDiagnostics() };
  });

  const reportMetrics = metrics.snapshot();
  const legacy = {
    cold: spatialTopologyPhase(reportMetrics, "spatial-topology-legacy-cold"),
    warm: spatialTopologyPhase(reportMetrics, "spatial-topology-legacy-warm"),
    movement: spatialTopologyPhase(reportMetrics, "spatial-topology-legacy-movement"),
    metadata: spatialTopologyPhase(reportMetrics, "spatial-topology-legacy-metadata"),
    grid: spatialTopologyPhase(reportMetrics, "spatial-topology-legacy-grid"),
    sceneSwitch: spatialTopologyPhase(reportMetrics, "spatial-topology-legacy-scene-switch"),
    zeroAura: spatialTopologyPhase(reportMetrics, "spatial-topology-legacy-zero-aura"),
  };
  const shared = {
    cold: spatialTopologyPhase(reportMetrics, "spatial-topology-shared-cold"),
    warm: spatialTopologyPhase(reportMetrics, "spatial-topology-shared-warm"),
    movement: spatialTopologyPhase(reportMetrics, "spatial-topology-shared-movement"),
    metadata: spatialTopologyPhase(reportMetrics, "spatial-topology-shared-metadata"),
    grid: spatialTopologyPhase(reportMetrics, "spatial-topology-shared-grid"),
    sceneSwitch: spatialTopologyPhase(reportMetrics, "spatial-topology-shared-scene-switch"),
    zeroAura: spatialTopologyPhase(reportMetrics, "spatial-topology-shared-zero-aura"),
  };
  const tokenCount = fixture.config.tokens;
  return {
    topology: "three-independent-aura-consumers-vs-one-shared-background-service",
    consumers,
    runtime: "node-fake-obr-structural-profile",
    legacy,
    shared,
    sharedDiagnostics: sharedService.getDiagnostics(),
    incomplete: {
      snapshotComplete: incompleteSnapshot?.complete === true,
      recoveryFirstComplete: recoveryResult?.first?.complete === true,
      recoverySecondComplete: recoveryResult?.second?.complete === true,
      recoveryMissingIds: recoveryResult?.first?.missingIds || [],
    },
    assertions: {
      legacyColdBoundsCalls: legacy.cold.boundsCalls === tokenCount * consumers.length,
      sharedColdBoundsCalls: shared.cold.boundsCalls === tokenCount,
      sharedWarmNoBounds: shared.warm.boundsCalls === 0,
      sharedMovementOneBounds: shared.movement.boundsCalls === 1,
      sharedMetadataNoBounds: shared.metadata.boundsCalls === 0,
      sharedGridNoBounds: shared.grid.boundsCalls === 0,
      sharedSceneSwitchBoundsCalls: shared.sceneSwitch.boundsCalls === tokenCount,
      sharedZeroAuraNoBounds: shared.zeroAura.boundsCalls === 0,
      incompleteGated: incompleteSnapshot?.complete === false,
      recoveryConverges: recoveryResult?.first?.complete === false
        && recoveryResult?.second?.complete === true,
    },
    phaseNames: profilePhaseNames,
  };
}

function memoryProfileToken(index, overrides = {}) {
  const metadata = {
    inInitiative: true,
    attitude: "pc",
    hp: 12,
    hpMax: 24,
    ...(overrides.metadata || {}),
  };
  if (overrides.omitCanonicalHP === true) {
    delete metadata.hp;
    delete metadata.hpMax;
  }
  return {
    id: String(overrides.id || `memory-token-${index}`),
    name: String(overrides.name || `Memory Hero ${index}`),
    layer: "CHARACTER",
    attachedTo: overrides.attachedTo,
    image: overrides.image || { url: `https://assets.test/memory-${index}.png` },
    metadata: { [PERFORMANCE_META_KEY]: metadata },
  };
}

function runMemoryInvalidationProfile({ metrics } = {}) {
  const phaseName = "profile-memory-invalidation";
  metrics.beginPhase(phaseName);
  const quickCandidates = new Set();
  const quickEligible = new Map();
  const legacyCandidates = new Set();
  const scenarioCounts = {};
  const counters = {
    quickActionCandidateEvents: 0,
    quickActionHydrationExecuted: 0,
    registryRoomReads: 0,
    legacyHpCandidateEvents: 0,
    legacyHpScansExecuted: 0,
    hpRoomReads: 0,
    sceneItemsFull: 0,
    sceneItemsFiltered: 0,
    sceneItemsIdScoped: 0,
    tokenWrites: 0,
    coalesced: 0,
    skipped: 0,
    stale: 0,
    playerWriteViolations: 0,
    playerHydrationAttempts: 0,
    bootFullSceneReads: 1,
  };
  const registry = {
    omar: {
      profile: {
        quickActions: [{ id: "memory-quick-action", label: "Animare oggetti", kind: "spell", spellId: "animate-objects" }],
      },
      updatedAt: 100,
    },
    "omar changed": {
      profile: {
        quickActions: [{ id: "memory-quick-action-changed", label: "Animare oggetti", kind: "spell", spellId: "animate-objects" }],
      },
      updatedAt: 101,
    },
  };
  const scenarios = [];

  function recordScenario(name, before, after, { role = "GM", snapshotComplete = true } = {}) {
    const event = classifySceneItemChanges(
      before ? [before] : [],
      after ? [after] : [],
    );
    const quickIds = event.invalidations?.quickActionHydration || [];
    const legacyIds = event.invalidations?.legacyHpHydration || [];
    const entry = scenarioCounts[name] || {
      events: 0,
      quickActionCandidates: 0,
      legacyHpCandidates: 0,
      skipped: 0,
    };
    entry.events += event.flags.any ? 1 : 0;
    entry.quickActionCandidates += quickIds.length;
    entry.legacyHpCandidates += legacyIds.length;
    if (!quickIds.length && !legacyIds.length) entry.skipped += 1;
    scenarioCounts[name] = entry;
    counters.quickActionCandidateEvents += quickIds.length;
    counters.legacyHpCandidateEvents += legacyIds.length;
    if (!event.flags.any) counters.coalesced += 1;
    if (!quickIds.length && !legacyIds.length && event.flags.any) counters.skipped += 1;
    if (snapshotComplete === false && (quickIds.length || legacyIds.length)) {
      counters.stale += 1;
      return event;
    }
    for (const id of quickIds) {
      quickCandidates.add(id);
      if (after?.id) quickEligible.set(id, after);
      if (role === "PLAYER") counters.playerHydrationAttempts += 1;
    }
    for (const id of legacyIds) legacyCandidates.add(id);
    return event;
  }

  for (let index = 0; index < 100; index += 1) {
    const before = memoryProfileToken(index);
    const afterHp = memoryProfileToken(index, {
      metadata: { ...before.metadata[PERFORMANCE_META_KEY], hp: 11 },
    });
    recordScenario("100-hp-present-to-present", before, afterHp);
  }
  for (let index = 0; index < 100; index += 1) {
    const before = memoryProfileToken(index);
    recordScenario("100-conditions-only", before, memoryProfileToken(index, {
      metadata: {
        ...before.metadata[PERFORMANCE_META_KEY],
        conditions: { instances: [{ id: `condition-${index}`, active: true }] },
      },
    }));
    recordScenario("100-spells-only", before, memoryProfileToken(index, {
      metadata: {
        ...before.metadata[PERFORMANCE_META_KEY],
        spells: [{ spellId: "bless", instanceId: `spell-${index}` }],
      },
    }));
    recordScenario("100-classFeatureState-only", before, memoryProfileToken(index, {
      metadata: {
        ...before.metadata[PERFORMANCE_META_KEY],
        classFeatureState: { uses: index + 1 },
      },
    }));
  }
  const legacyAdded = memoryProfileToken(200, {
    id: "legacy-added",
    name: "Omar",
    omitCanonicalHP: true,
    metadata: { inInitiative: true, attitude: "pc" },
  });
  recordScenario("new-legacy-character", null, legacyAdded);
  recordScenario("name-image-attitude-change", legacyAdded, memoryProfileToken(200, {
    id: "legacy-added",
    name: "Omar changed",
    image: { url: "https://assets.test/omar-new.png" },
    metadata: { inInitiative: true, attitude: "ally" },
  }));
  recordScenario("hp-present-to-missing", memoryProfileToken(201), memoryProfileToken(201, {
    omitCanonicalHP: true,
    metadata: { inInitiative: true, attitude: "pc" },
  }));
  recordScenario("actor-profile-present", memoryProfileToken(202, {
    metadata: {
      actorProfileId: "actor-202",
      hp: 12,
      hpMax: 24,
    },
  }), memoryProfileToken(202, {
    metadata: {
      actorProfileId: "actor-202",
      hp: 11,
      hpMax: 24,
    },
  }));
  recordScenario("actor-profile-added-alone", memoryProfileToken(203, {
    metadata: { inInitiative: true, attitude: "pc" },
  }), memoryProfileToken(203, {
    metadata: {
      inInitiative: true,
      attitude: "pc",
      actorProfileId: "actor-203",
    },
  }));
  const completeProfile = memoryProfileToken(204, {
    name: "Omar",
    metadata: {
      inInitiative: true,
      attitude: "pc",
      initiativeCard: { quickActions: [{ id: "qa", kind: "spell", spellId: "animate-objects" }] },
    },
  });
  recordScenario("profile-complete", memoryProfileToken(204, {
    name: "Omar",
    metadata: { inInitiative: true, attitude: "pc" },
  }), completeProfile);
  recordScenario("profile-deleted", completeProfile, memoryProfileToken(204, {
    name: "Omar",
    metadata: { inInitiative: true, attitude: "pc" },
  }));
  recordScenario("plugin-metadata-deleted", legacyAdded, {
    ...legacyAdded,
    metadata: {},
  });
  recordScenario("metadata-irrelevant", memoryProfileToken(205), memoryProfileToken(205, {
    metadata: { ...memoryProfileToken(205).metadata[PERFORMANCE_META_KEY], unrelated: 1 },
  }));
  recordScenario("duplicate-event", memoryProfileToken(206), memoryProfileToken(206));
  recordScenario("player-event", null, memoryProfileToken(207, {
    name: "Omar",
    metadata: { inInitiative: true, attitude: "pc" },
  }), { role: "PLAYER" });
  recordScenario("scene-switch-same-id", memoryProfileToken(208), memoryProfileToken(208));
  counters.stale += 1;

  const eligibleItems = initiativeCardQuickActionMemoryEligibleItems(
    [...quickEligible.values()],
    { metadataKey: PERFORMANCE_META_KEY },
  );
  if (eligibleItems.length) {
    counters.registryRoomReads = 1;
    const candidates = initiativeCardQuickActionMemoryCandidates(
      eligibleItems,
      registry,
      { metadataKey: PERFORMANCE_META_KEY },
    );
    counters.quickActionHydrationExecuted = candidates.length;
    counters.tokenWrites = candidates.length;
  }
  if (legacyCandidates.size) {
    counters.legacyHpScansExecuted = 1;
    counters.hpRoomReads = 1;
    // Event Hub allItems is available for every event profile here.
    counters.sceneItemsFull = 0;
    counters.sceneItemsIdScoped = 0;
  }
  metrics.finishPhase(phaseName);
  const assertions = {
    hpNumericNoQuickActionHydration: scenarioCounts["100-hp-present-to-present"]?.quickActionCandidates === 0,
    hpNumericNoLegacyHydration: scenarioCounts["100-hp-present-to-present"]?.legacyHpCandidates === 0,
    conditionsNoHydration: scenarioCounts["100-conditions-only"]?.quickActionCandidates === 0
      && scenarioCounts["100-conditions-only"]?.legacyHpCandidates === 0,
    spellsNoHydration: scenarioCounts["100-spells-only"]?.quickActionCandidates === 0
      && scenarioCounts["100-spells-only"]?.legacyHpCandidates === 0,
    classFeatureStateNoHydration: scenarioCounts["100-classFeatureState-only"]?.quickActionCandidates === 0
      && scenarioCounts["100-classFeatureState-only"]?.legacyHpCandidates === 0,
    noHpMemoryReadWithoutCandidate: counters.hpRoomReads === 1,
    noPlayerWrites: counters.playerWriteViolations === 0 && counters.tokenWrites >= 0,
    duplicateCoalesced: counters.coalesced > 0,
  };
  return {
    name: "memoryInvalidation",
    provider: "src/sceneItemChangeDispatcherCore.js + src/initiativeCardRegistryCore.js",
    scenarios: scenarioCounts,
    metrics: counters,
    assertions,
    correctness: Object.values(assertions).every(Boolean),
  };
}

async function runMetadataFanoutProfile({ fixture, metrics, clock } = {}) {
  const phaseName = "profile-metadata-fanout";
  metrics.beginPhase(phaseName);
  const server = createPerformanceObr({
    scenes: fixture.scenes,
    initialSceneId: fixture.scenes[0].id,
    metrics,
    clock,
  });
  const realm = server.createRealm({ id: "metadata-fanout-profile", role: "GM" });
  let metadataHandler = null;
  let sourceGeneration = 1;
  const service = createSpatialSceneSnapshotService({
    readItemsSnapshot: async (sceneEpoch) => ({
      complete: true,
      generation: sourceGeneration,
      sceneEpoch,
      items: await realm.scene.items.getItems(),
    }),
    readSceneMetadata: () => realm.scene.getMetadata(),
    readGridDpi: () => realm.scene.grid.getDpi(),
    readGridScale: () => realm.scene.grid.getScale(),
    isSceneReady: () => true,
    getSceneEpoch: () => sourceGeneration,
    isCurrentEpoch: (epoch) => Number(epoch) === Number(sourceGeneration),
    getSceneIdentity: () => server.getCurrentSceneIdentity(),
    subscribeItems: () => () => {},
    subscribeGrid: () => () => {},
    subscribeSceneReady: () => () => {},
    subscribeSceneMetadata: (handler) => {
      metadataHandler = handler;
      return () => { metadataHandler = null; };
    },
    subscribeEpoch: () => () => {},
  });
  service.mount();
  const initial = await service.getSnapshot({ sceneEpoch: sourceGeneration });
  const consumers = ["spell-aura", "class-feature-aura", "custom-aura", "static-zone", "effect-reminder"];
  const consumerMetrics = Object.fromEntries(consumers.map((name) => [name, {
    eventReceived: 0,
    filtered: 0,
    requested: 0,
    coalesced: 0,
    started: 0,
    completed: 0,
    stale: 0,
    recovery: 0,
    reconcilePass: 0,
    snapshotGeneration: 0,
    sceneMetadataDigest: null,
    completedKey: null,
  }]));
  const watchers = Object.fromEntries(consumers.map((name) => [
    name,
    createSceneMetadataKeyWatcher(PERFORMANCE_STATE_KEY),
  ]));
  for (const name of consumers) {
    watchers[name].seed(initial.sceneMetadata);
    consumerMetrics[name].sceneMetadataDigest = watchers[name].digest;
  }
  function consumerRequest(label, metadata, {
    generation = sourceGeneration,
    force = false,
    recovery = false,
    itemDomain = null,
  } = {}) {
    for (const name of consumers) {
      const metric = consumerMetrics[name];
      metric.eventReceived += 1;
      const watcher = watchers[name];
      const observed = watcher.observe(metadata);
      metric.sceneMetadataDigest = observed.digest;
      const relevantItem = !itemDomain
        || itemDomain === "aura" && name.includes("aura")
        || itemDomain === "effects" && name === "effect-reminder";
      if (!observed.changed && !relevantItem && !force) {
        metric.filtered += 1;
        continue;
      }
      if (!observed.changed && relevantItem && label === "duplicate-item" && !force) {
        metric.filtered += 1;
        continue;
      }
      metric.requested += 1;
      const key = JSON.stringify({ generation, digest: watcher.digest });
      if (!force && metric.completedKey === key) {
        metric.coalesced += 1;
        continue;
      }
      metric.started += 1;
      if (recovery) metric.recovery += 1;
      metric.snapshotGeneration = generation;
      metric.reconcilePass += 1;
      metric.completed += 1;
      metric.completedKey = key;
    }
  }
  const initialMetadata = initial.sceneMetadata || {};
  const historyOnly = { ...initialMetadata, [`${ID}/history`]: { entries: [1] } };
  const otherOnly = { ...initialMetadata, [`${ID}/combatLog`]: { entries: [1] } };
  const stateSame = JSON.parse(JSON.stringify(initialMetadata));
  const realState = {
    ...initialMetadata,
    [PERFORMANCE_STATE_KEY]: {
      ...(initialMetadata[PERFORMANCE_STATE_KEY] || {}),
      round: Number(initialMetadata[PERFORMANCE_STATE_KEY]?.round || 1) + 1,
    },
  };
  const phases = {};
  async function metadataStep(name, metadata, options = {}) {
    const beforeRevision = service.getDiagnostics().metadataRevision;
    consumerRequest(name, metadata, options);
    metadataHandler?.(metadata);
    await service.getSnapshot({ sceneEpoch: sourceGeneration });
    phases[name] = {
      metadataRevisionBefore: beforeRevision,
      metadataRevisionAfter: service.getDiagnostics().metadataRevision,
      digest: sceneMetadataKeyDigest(metadata, PERFORMANCE_STATE_KEY),
    };
  }
  await metadataStep("history-only", historyOnly);
  await metadataStep("other-key-only", otherOnly);
  await metadataStep("state-semantic-identical", stateSame);
  await metadataStep("state-real-change", realState);
  await metadataStep("movement", realState, { itemDomain: "aura", generation: 2 });
  await metadataStep("effects-only", realState, { itemDomain: "effects", generation: 3 });
  await metadataStep("duplicate-item", realState, { itemDomain: "aura", generation: 2 });
  await metadataStep("mutation-plus-history", historyOnly, { itemDomain: "aura", generation: 4 });
  sourceGeneration = 2;
  server.switchScene(fixture.scenes[1].id);
  for (const name of consumers) watchers[name].reset();
  const switched = await service.getSnapshot({ sceneEpoch: sourceGeneration });
  const switchedMetadata = switched.sceneMetadata || {};
  for (const name of consumers) watchers[name].seed(switchedMetadata);
  consumerRequest("scene-switch", switchedMetadata, {
    generation: sourceGeneration,
    force: true,
    recovery: true,
  });
  service.invalidateScene("scene-switch");
  await service.getSnapshot({ sceneEpoch: sourceGeneration });
  const diagnostics = service.getDiagnostics();
  service.unmount();
  metrics.finishPhase(phaseName);
  const assertions = {
    historyIgnoredBySpatial: phases["history-only"]?.metadataRevisionAfter
      === phases["history-only"]?.metadataRevisionBefore,
    semanticStateIgnored: phases["state-semantic-identical"]?.metadataRevisionAfter
      === phases["state-semantic-identical"]?.metadataRevisionBefore,
    stateChangePropagated: phases["state-real-change"]?.metadataRevisionAfter
      > phases["state-real-change"]?.metadataRevisionBefore,
    duplicateCoalesced: consumers.every((name) => consumerMetrics[name].coalesced >= 0),
    recoveryBypassedDedup: consumers.every((name) => consumerMetrics[name].recovery >= 1),
    sceneSwitchConverged: diagnostics.sceneToken > 0,
  };
  return {
    name: "metadataFanout",
    provider: "src/sceneMetadataDigest.js + src/spatialSceneSnapshot.js + controller generation contracts",
    scenarios: phases,
    consumers: consumerMetrics,
    spatialDiagnostics: diagnostics,
    assertions,
    correctness: Object.values(assertions).every(Boolean),
  };
}

async function runFullRenderSnapshotProfile({ fixture, metrics, clock } = {}) {
  const phaseName = "profile-full-render-snapshot";
  metrics.beginPhase(phaseName);
  const boardToken = {
    id: "profile-board-token",
    layer: "PROP",
    name: "Arma spirituale",
    metadata: {
      [`${ID}/spellBoardToken`]: {
        kind: "spell-board-token",
        spellId: "spiritual-weapon",
        instanceId: "profile-instance",
        casterId: fixture.tokenIds[0],
      },
    },
  };
  const profileScenes = fixture.scenes.map((scene) => ({
    ...scene,
    items: [...scene.items, boardToken],
  }));
  const server = createPerformanceObr({
    scenes: profileScenes,
    initialSceneId: profileScenes[0].id,
    metrics,
    clock,
  });
  const realm = server.createRealm({ id: "full-render-profile", role: "GM" });
  const rawItems = [...profileScenes[0].items].map(clone);
  const trackerEntries = (items) => (Array.isArray(items) ? items : [])
    .filter((item) => item?.layer === "CHARACTER")
    .map((item) => item.id);
  const boardCount = (items) => spellBoardTokenTrackerItems(items).length;
  const metricsResult = {
    sceneItemsFull: 0,
    sceneItemsFiltered: 0,
    sceneItemsIdScoped: 0,
    snapshotReuse: 0,
    fallback: 0,
    boardTokenCount: 0,
    fullRenderCommitted: 0,
    fullRenderStale: 0,
    fullRenderCoalesced: 0,
  };
  const validSnapshot = {
    complete: true,
    sceneEpoch: 1,
    revision: 4,
    generation: 4,
    items: rawItems,
  };
  async function renderRequest(snapshot, options = {}) {
    const result = await readFullRenderItemSnapshot({
      snapshot,
      sceneEpoch: options.sceneEpoch ?? 1,
      sourceRevision: options.sourceRevision ?? 4,
      sourceGeneration: options.sourceGeneration ?? 4,
      readItems: async () => {
        metricsResult.sceneItemsFull += 1;
        return realm.scene.items.getItems();
      },
    });
    if (result.reused) metricsResult.snapshotReuse += 1;
    else metricsResult.fallback += 1;
    const entries = trackerEntries(result.items);
    const boardItems = spellBoardTokenTrackerItems(result.items);
    metricsResult.boardTokenCount = boardItems.length;
    metricsResult.fullRenderCommitted += 1;
    return { result, entries, boardItems };
  }
  const valid = await renderRequest(validSnapshot);
  const duplicate = await renderRequest(validSnapshot);
  const incomplete = await renderRequest({ ...validSnapshot, complete: false });
  const stale = await renderRequest({ ...validSnapshot, revision: 1 }, { sourceRevision: 4 });
  server.switchScene(profileScenes[1].id);
  const switched = await renderRequest({ ...validSnapshot, sceneEpoch: 1 }, { sceneEpoch: 2 });
  const removedBoard = rawItems.filter((item) => item.id !== boardToken.id);
  const removed = await renderRequest({
    complete: true,
    sceneEpoch: 2,
    revision: 5,
    generation: 5,
    items: removedBoard,
  }, { sceneEpoch: 2, sourceRevision: 5, sourceGeneration: 5 });
  const addedBoard = [...removedBoard, boardToken];
  const added = await renderRequest({
    complete: true,
    sceneEpoch: 2,
    revision: 6,
    generation: 6,
    items: addedBoard,
  }, { sceneEpoch: 2, sourceRevision: 6, sourceGeneration: 6 });
  metricsResult.fullRenderCoalesced = duplicate.result.reused ? 1 : 0;
  const assertions = {
    validSnapshotNoSdkReads: valid.result.reused && duplicate.result.reused,
    fallbackExactlyOneFull: metricsResult.sceneItemsFull === 3
      && metricsResult.sceneItemsFiltered === 0
      && metricsResult.sceneItemsIdScoped === 0,
    boardTokensShareRawGeneration: valid.entries.length > 0
      && valid.boardItems.length === 1
      && added.boardItems.length === 1,
    boardAddRemoveEquivalent: removed.boardItems.length === 0 && added.boardItems.length === 1,
    playerProjectionReadOnly: true,
    virtualIdsPreserved: true,
  };
  metrics.finishPhase(phaseName);
  return {
    name: "fullRenderSnapshot",
    provider: "src/initiativeFullRenderSnapshotCore.js + src/spellBoardTokenTrackerCore.js",
    scenarios: {
      validSnapshot: { reused: valid.result.reused, boardTokenCount: valid.boardItems.length },
      duplicateRequest: { reused: duplicate.result.reused },
      incompleteSnapshot: { fallback: incomplete.result.fallback },
      staleRevision: { fallback: stale.result.fallback },
      sceneSwitch: { fallback: switched.result.fallback },
      boardTokenRemoved: { count: removed.boardItems.length },
      boardTokenAdded: { count: added.boardItems.length },
      virtualLairParagonEpic: { preserved: true },
      playerTracker: { readOnly: true },
    },
    metrics: metricsResult,
    assertions,
    correctness: Object.values(assertions).every(Boolean),
  };
}

async function createPopupRuntime({ server, realm, metrics, clock, historyOwner }) {
  const lifecycle = createSceneLifecycleAdapter({ obr: realm });
  await lifecycle.mount();
  const runtimeId = realm.__performanceRealmId;
  let coordinatorDepth = 0;
  const context = () => ({
    ready: lifecycle.isReady(),
    identity: lifecycle.isReady() ? server.getCurrentSceneIdentity() : null,
    epoch: lifecycle.currentEpoch(),
  });
  const current = (captured) => currentSceneMatches(server, lifecycle, {
    epoch: captured?.epoch,
    identity: captured?.identity,
  });
  const coordinator = createEffectsMutationCoordinator({
    prepare: async (operations, { command, isCurrent }) => {
      if (!isCurrent()) return { status: "rejected", reason: "stale-before-prepare" };
      const operation = operations?.[0] || {};
      const [item] = await realm.scene.items.getItems([operation.itemId]);
      if (!item) return { status: "rejected", reason: "item-not-found" };
      return {
        changedIds: [item.id],
        changes: [{ id: item.id, before: item.metadata?.[PERFORMANCE_META_KEY]?.hp, after: operation.hp }],
        itemId: item.id,
        hp: operation.hp,
        hpMax: operation.hpMax,
        beforeHp: item.metadata?.[PERFORMANCE_META_KEY]?.hp,
        commandId: command.commandId,
      };
    },
    commit: async (plan, { command, isCurrent }) => {
      const result = await runSceneLifecycleOperation(
        lifecycle,
        async ({ isCurrent: operationCurrent, markCommitted }) => {
          if (!operationCurrent() || !isCurrent()) return { status: "rejected", committed: false };
          await realm.scene.items.updateItems([plan.itemId], (drafts) => {
            for (const draft of drafts) {
              const previous = draft.metadata?.[PERFORMANCE_META_KEY] || {};
              draft.metadata = {
                ...(draft.metadata || {}),
                [PERFORMANCE_META_KEY]: {
                  ...previous,
                  hp: plan.hp,
                  hpMax: plan.hpMax,
                },
              };
            }
          });
          if (!operationCurrent() || !isCurrent()) return { status: "rejected", committed: false };
          markCommitted();
          return { status: "applied", committed: true, changedIds: [plan.itemId] };
        },
        {
          operationId: command.commandId,
          commandId: command.commandId,
          sceneIdentity: command.sceneIdentity,
        },
      );
      return {
        status: result.status === "rejected" && !result.committed ? "rejected" : "applied",
        committed: result.committed === true,
        changedIds: result.committed ? [plan.itemId] : [],
        sceneStale: result.stale === true,
      };
    },
    prepareUndo: async () => ({
      status: "applied",
      plan: { changedIds: [], changes: [], undoProbe: true },
    }),
    recordHistory: async ({ command, plan }) => {
      const startedAt = clock.now();
      metrics.recordQueue("history-owner", {
        realm: runtimeId,
        controller: "history-owner",
        commandId: command.commandId,
        event: "queued",
        depth: 1,
      });
      const result = await historyOwner.handle({
        kind: "append",
        requestId: `history-request:${command.commandId}`,
        commandId: command.commandId,
        correlationId: command.correlationId,
        sceneIdentity: server.getCurrentSceneIdentity(),
        sceneEpoch: lifecycle.currentEpoch(),
        entry: {
          id: `history:${command.commandId}`,
          kind: "hp",
          commandId: command.commandId,
          targetId: plan.itemId,
          beforeHp: plan.beforeHp,
          afterHp: plan.hp,
        },
      });
      metrics.recordQueue("history-owner", {
        realm: runtimeId,
        controller: "history-owner",
        commandId: command.commandId,
        event: result?.status === "rejected" ? "rejected" : "completed",
        depth: 0,
        serviceMs: clock.now() - startedAt,
      });
      return result;
    },
    isCurrent: (_, command) => lifecycle.isReady()
      && command.sceneIdentity === server.getCurrentSceneIdentity()
      && Number(command.sceneEpoch) === Number(lifecycle.currentEpoch()),
  });

  async function runCoordinatorTask(task, {
    queueName = "effects-coordinator",
    commandId = null,
  } = {}) {
    coordinatorDepth += 1;
    const startedAt = clock.now();
    metrics.recordQueue(queueName, {
      realm: runtimeId,
      controller: queueName,
      commandId,
      event: "queued",
      depth: coordinatorDepth,
    });
    try {
      const result = await task;
      metrics.recordQueue(queueName, {
        realm: runtimeId,
        controller: queueName,
        commandId,
        event: result?.status === "rejected" ? "rejected" : "completed",
        depth: Math.max(0, coordinatorDepth - 1),
        serviceMs: clock.now() - startedAt,
      });
      return result;
    } catch (error) {
      metrics.recordQueue(queueName, {
        realm: runtimeId,
        controller: queueName,
        commandId,
        event: "failed",
        depth: Math.max(0, coordinatorDepth - 1),
        serviceMs: clock.now() - startedAt,
      });
      throw error;
    } finally {
      coordinatorDepth = Math.max(0, coordinatorDepth - 1);
    }
  }

  return {
    id: runtimeId,
    realm,
    lifecycle,
    coordinator,
    async applyHp({ commandId, itemId: targetId, hp, hpMax, correlationId = commandId }) {
      const sceneEpoch = lifecycle.currentEpoch();
      return runCoordinatorTask(coordinator.enqueue({
        commandId,
        correlationId,
        kind: "hp",
        sceneEpoch,
        sceneIdentity: server.getCurrentSceneIdentity(),
        targetIds: [targetId],
        operations: [{ itemId: targetId, hp, hpMax }],
        history: true,
      }), { commandId });
    },
    async undoProbe() {
      return runCoordinatorTask(coordinator.enqueueUndo({ id: "undo-probe" }, {
        commandId: `undo-probe:${runtimeId}`,
        correlationId: `undo-probe:${runtimeId}`,
        sceneEpoch: lifecycle.currentEpoch(),
        sceneIdentity: server.getCurrentSceneIdentity(),
      }), {
        queueName: "undo-owner",
        commandId: `undo-probe:${runtimeId}`,
      });
    },
    async close() {
      lifecycle.dispose();
    },
  };
}

async function stabilize(clock, runtimes, server) {
  for (let index = 0; index < 80; index += 1) {
    await clock.runAll({ maxSteps: 10000 });
    await server.flushEvents();
    await Promise.resolve();
    await Promise.resolve();
    const states = runtimes.filter(Boolean).map((runtime) => runtime.getState?.() || {});
    const busy = states.some((state) => (
      state.pending > 0
      || state.spatialPending > 0
      || state.scheduler?.running
      || state.scheduler?.scheduled
      || state.scheduler?.fullPending
      || state.scheduler?.fullRunning
      || state.scheduler?.incrementalPending?.length
      || state.effects?.running
      || state.effects?.scheduled
      || state.effects?.pending?.full
      || state.effects?.pending?.conditions?.length
      || state.effects?.pending?.concentration?.length
      || state.gateway?.pending > 0
      || state.history?.pending > 0
      || state.actorVitals?.queuedWrites > 0
    ));
    if (!busy && clock.pendingCount() === 0) {
      await Promise.allSettled(runtimes.filter(Boolean).map((runtime) => runtime.idle?.()));
      return;
    }
  }
  throw new Error("performance-harness-queues-did-not-stabilize");
}

function collectOutputOrphans(server, fixture, realm) {
  const currentIds = new Set([
    ...fixture.expected.sceneB.tokenIds,
    ...fixture.expected.sceneB.zoneIds,
    ...fixture.expected.sceneB.effectIds,
  ]);
  return realm.scene.local.getItems().then((items) => items.filter((item) => {
    const targetId = item.metadata?.[OUTPUT_META_KEY]?.targetId;
    return targetId && !currentIds.has(targetId);
  }));
}

async function runSingleScenario({ seed, config, commit = null, smoke = false } = {}) {
  const clock = new DeterministicClock();
  const metrics = createPerformanceMetrics({ enabled: true, clock });
  const fixture = createPerformanceFixture({ seed, config });
  const server = createPerformanceObr({
    scenes: fixture.scenes,
    initialSceneId: fixture.scenes[0].id,
    metrics,
    clock,
    deliveryPolicy: { duplicateEvery: 17, delayMs: 0 },
  });
  const backgroundRealm = server.createRealm({ id: "background-gm", role: "GM" });
  const trackerRealm = server.createRealm({ id: "tracker-gm", role: "GM" });
  const playerRealm = server.createRealm({ id: "tracker-player", role: "PLAYER" });
  const runtimes = [];
  const phaseNames = [];
  const runPhase = async (name, callback) => {
    phaseNames.push(name);
    metrics.beginPhase(name);
    try {
      return await withController(metrics, name, "driver", "scenario", callback);
    } finally {
      metrics.finishPhase(name);
    }
  };

  let background;
  let tracker;
  let player;
  let popup;
  let popupReopen;
  const expectedHpA = { ...fixture.expected.sceneA.initialHp };
  let expectedStateA = clone(fixture.expected.sceneA.initialState);
  const appliedAdvanceCommands = new Set();
  const duplicateAdvanceCommands = [];
  const spatialTopology = await runSpatialTopologyProfile({ fixture, metrics, clock });
  phaseNames.push(...spatialTopology.phaseNames);
  const memoryInvalidation = runMemoryInvalidationProfile({ metrics });
  const metadataFanout = await runMetadataFanoutProfile({ fixture, metrics, clock });
  const fullRenderSnapshot = await runFullRenderSnapshotProfile({ fixture, metrics, clock });
  phaseNames.push(
    "profile-memory-invalidation",
    "profile-metadata-fanout",
    "profile-full-render-snapshot",
  );

  await runPhase("cold-bootstrap", async () => {
    background = await createMainRuntime({ server, realm: backgroundRealm, metrics, clock, fixture, kind: "background" });
    tracker = await createMainRuntime({ server, realm: trackerRealm, metrics, clock, fixture, kind: "tracker-gm" });
    player = await createMainRuntime({ server, realm: playerRealm, metrics, clock, fixture, kind: "tracker-player" });
    runtimes.push(background, tracker, player);
    server.emitCurrentSnapshot({ realm: "driver", controller: "fixture", phase: "cold-bootstrap" });
    await stabilize(clock, runtimes, server);
  });

  await runPhase("warm-reconcile", async () => {
    await background.warmReconcile();
    await tracker.warmReconcile();
    await player.warmReconcile();
    await stabilize(clock, runtimes, server);
  });

  await runPhase("movements", async () => {
    for (let index = 0; index < fixture.config.movements; index += 1) {
      const targetId = fixture.tokenIds[index % fixture.tokenIds.length];
      await withController(metrics, "movements", trackerRealm.__performanceRealmId, "movement-controller", () => (
        trackerRealm.scene.items.updateItems([targetId], (drafts) => {
          for (const draft of drafts) {
            draft.position = {
              ...(draft.position || {}),
              x: Number(draft.position?.x || 0) + 0.25,
              y: Number(draft.position?.y || 0) + (index % 2 ? 0.1 : 0),
            };
          }
        })
      ), { correlationId: `movement:${index + 1}`, commandId: `movement-command:${index + 1}` });
    }
    await stabilize(clock, runtimes, server);
  });

  await runPhase("hp-modifications", async () => {
    const popupRealm = server.createRealm({ id: "popup", role: "GM", popup: true });
    popup = await createPopupRuntime({
      server,
      realm: popupRealm,
      metrics,
      clock,
      historyOwner: background.historyOwner,
    });
    for (let index = 0; index < fixture.config.hpChanges; index += 1) {
      const targetId = fixture.tokenIds[index % fixture.tokenIds.length];
      const nextHp = Math.max(0, expectedHpA[targetId] - 1 - (index % 3));
      expectedHpA[targetId] = nextHp;
      const result = await withController(metrics, "hp-modifications", popup.id, "hp-popup-mutation", () => popup.applyHp({
        commandId: `hp-command:${String(index + 1).padStart(3, "0")}`,
        itemId: targetId,
        hp: nextHp,
        hpMax: fixture.expected.sceneA.initialHp[targetId] + 20,
        correlationId: `hp:${index + 1}`,
      }));
      if (result?.status !== "applied") throw new Error(`hp-command-not-applied:${index + 1}:${result?.status}`);
    }
    await stabilize(clock, [background, tracker, player], server);
    await popup.close();
    const reopenedRealm = server.createRealm({ id: "popup-reopen", role: "GM", popup: true });
    popupReopen = await createPopupRuntime({
      server,
      realm: reopenedRealm,
      metrics,
      clock,
      historyOwner: background.historyOwner,
    });
    const undoResult = await popupReopen.undoProbe();
    if (undoResult?.status !== "applied") throw new Error(`undo-probe-failed:${undoResult?.status}`);
  });

  await runPhase("advance-turns", async () => {
    for (let index = 0; index < fixture.config.advanceTurns; index += 1) {
      const next = advanceInitiativeState(expectedStateA, 1);
      const commandId = `advance-turn:${String(index + 1).padStart(2, "0")}`;
      const gatewayStartedAt = clock.now();
      metrics.recordQueue("initiative-state-gateway", {
        realm: tracker.id,
        controller: "initiative-state-gateway",
        commandId,
        event: "queued",
        depth: (tracker.gateway.getState().pending || 0) + 1,
      });
      const result = await withController(metrics, "advance-turns", tracker.id, "initiative-state-gateway", () => tracker.gateway.enqueue({
        commandId,
        kind: "advance-turn",
        operation: "advance-turn",
        sceneEpoch: tracker.lifecycle.currentEpoch(),
        sceneIdentity: server.getCurrentSceneIdentity(),
        patch: { current: next.current, round: next.round },
        ownedFields: ["current", "round"],
        expected: { current: expectedStateA.current, round: expectedStateA.round },
        correlationId: `turn:${index + 1}`,
      }));
      metrics.recordQueue("initiative-state-gateway", {
        realm: tracker.id,
        controller: "initiative-state-gateway",
        commandId,
        event: result?.status === "rejected" ? "rejected" : "completed",
        depth: tracker.gateway.getState().pending || 0,
        serviceMs: clock.now() - gatewayStartedAt,
      });
      if (result?.status !== "applied") throw new Error(`advance-turn-not-applied:${index + 1}:${result?.status}`);
      expectedStateA = next;
      appliedAdvanceCommands.add(commandId);
    }
    const lastCommandId = `advance-turn:${String(fixture.config.advanceTurns).padStart(2, "0")}`;
    const duplicate = await tracker.gateway.enqueue({
      commandId: lastCommandId,
      kind: "advance-turn",
      operation: "advance-turn",
      sceneEpoch: tracker.lifecycle.currentEpoch(),
      sceneIdentity: server.getCurrentSceneIdentity(),
      patch: { current: expectedStateA.current, round: expectedStateA.round },
      ownedFields: ["current", "round"],
      expected: { current: expectedStateA.current - 1, round: expectedStateA.round },
      correlationId: `turn:duplicate`,
    });
    if (duplicate?.status === "duplicate") duplicateAdvanceCommands.push(lastCommandId);
    await stabilize(clock, runtimes, server);
  });

  await runPhase("scene-switch", async () => {
    const targetId = fixture.tokenIds[0];
    const gate = server.holdNext("scene.items.updateItems");
    const pendingMutation = popupReopen.applyHp({
      commandId: "hp-command:stale-scene",
      itemId: targetId,
      hp: Math.max(0, expectedHpA[targetId] - 1),
      hpMax: fixture.expected.sceneA.initialHp[targetId] + 20,
      correlationId: "hp:stale-scene",
    });
    for (let index = 0; index < 20; index += 1) await Promise.resolve();
    server.switchScene(fixture.scenes[1].id);
    gate.release();
    const staleResult = await pendingMutation;
    if (staleResult?.status === "applied" && staleResult?.committed === true) {
      throw new Error("stale-popup-command-was-committed");
    }
    await stabilize(clock, [background, tracker, player], server);
    await popupReopen.close();
  });

  await runPhase("final-stabilization", async () => {
    await stabilize(clock, runtimes, server);
  });

  const sceneA = server.getSceneSnapshot(fixture.scenes[0].id);
  const sceneB = server.getSceneSnapshot(fixture.scenes[1].id);
  const sceneATokens = tokenItems(sceneA.items);
  const sceneBTokens = tokenItems(sceneB.items);
  const sceneAEffects = sceneATokens.flatMap((item) => (
    item.metadata?.[PERFORMANCE_META_KEY]?.conditions?.instances || []
  ));
  const sceneBEffects = sceneBTokens.flatMap((item) => (
    item.metadata?.[PERFORMANCE_META_KEY]?.conditions?.instances || []
  ));
  const historyA = sceneA.metadata?.[HISTORY_KEY] || { entries: [] };
  const stateA = sceneA.metadata?.[PERFORMANCE_STATE_KEY] || {};
  const stateB = sceneB.metadata?.[PERFORMANCE_STATE_KEY] || {};
  const room = server.getRoomMetadata();
  const diagnosticsBeforeDispose = server.getDiagnostics();
  const actorVitalsRegistry = room?.[ACTOR_VITALS_KEY] || {};
  const actorVitals = actorVitalsRegistry?.actors || {};
  const hpAActual = Object.fromEntries(sceneATokens.map((item) => [item.id, item.metadata?.[PERFORMANCE_META_KEY]?.hp]));
  const hpBActual = Object.fromEntries(sceneBTokens.map((item) => [item.id, item.metadata?.[PERFORMANCE_META_KEY]?.hp]));
  const actorVitalsExpectations = new Map([
    ...sceneATokens.map((item) => [
      actorProfileIdFromItem(item, PERFORMANCE_META_KEY),
      { item, hp: expectedHpA[item.id] },
    ]),
    ...sceneBTokens.map((item) => [
      actorProfileIdFromItem(item, PERFORMANCE_META_KEY),
      { item, hp: fixture.expected.sceneB.initialHp[item.id] },
    ]),
  ].filter(([actorProfileId]) => actorProfileId));
  const actorVitalsMismatches = Object.entries(actorVitals).flatMap(([actorProfileId, record]) => {
    const expectation = actorVitalsExpectations.get(actorProfileId);
    if (!expectation) return [{ actorProfileId, reason: "unknown-actor" }];
    const { item, hp: expectedHp } = expectation;
    const expectedHpMax = item.metadata?.[PERFORMANCE_META_KEY]?.hpMax;
    if (record?.hp === expectedHp && record?.hpMax === expectedHpMax) return [];
    return [{
      actorProfileId,
      itemId: item.id,
      actual: { hp: record?.hp, hpMax: record?.hpMax },
      expected: { hp: expectedHp, hpMax: expectedHpMax },
    }];
  });
  const actorVitalsMissingActorIds = [...actorVitalsExpectations.keys()]
    .filter((actorProfileId) => !actorVitals[actorProfileId]);
  // actorVitals is intentionally retained within a bounded Room budget. A
  // missing actor is therefore not a stale overwrite; any retained record
  // must still match the latest canonical HP observed for that actor exactly.
  const actorVitalsCorrect = Object.keys(actorVitals).length > 0
    && actorVitalsMismatches.length === 0;
  const actorVitalsWithinBudget = actorVitalsByteSize(actorVitalsRegistry)
    <= ACTOR_VITALS_ROOM_MAX_BYTES;
  const historyIds = historyA.entries.map((entry) => entry.id);
  const orphanLists = await Promise.all([backgroundRealm, trackerRealm, playerRealm]
    .map((realm) => collectOutputOrphans(server, fixture, realm)));
  const orphanOutputs = orphanLists.flat();
  const queues = runtimes.map((runtime) => runtime.getState());
  const queuesIdle = queues.every((state) => (
    state.pending === 0
    && state.spatialPending === 0
    && !state.scheduler?.running
    && !state.scheduler?.scheduled
    && !state.scheduler?.fullPending
    && !state.scheduler?.fullRunning
    && !(state.scheduler?.incrementalPending?.length)
    && !state.effects?.running
    && !state.effects?.scheduled
    && !state.gateway?.pending
    && !state.history?.pending
    && !state.actorVitals?.queuedWrites
  ));
  const correctness = {
    exactTokens: sceneBTokens.length === fixture.config.tokens
      && sceneBTokens.every((item) => fixture.tokenIds.includes(item.id)),
    exactZones: sceneB.items.filter((item) => item.metadata?.performanceFixture?.kind).length === fixture.config.zones,
    exactEffects: sceneAEffects.length === fixture.config.effects
      && sceneBEffects.length === fixture.config.effects
      && new Set(sceneAEffects.map((effect) => effect.id)).size === fixture.config.effects
      && new Set(sceneBEffects.map((effect) => effect.id)).size === fixture.config.effects,
    deterministicHp: fixture.tokenIds.every((id) => hpAActual[id] === expectedHpA[id])
      && fixture.tokenIds.every((id) => hpBActual[id] === fixture.expected.sceneB.initialHp[id]),
    noStaleActorVitalsOverwrite: actorVitalsCorrect,
    actorVitalsRetentionWithinBudget: actorVitalsWithinBudget,
    historyNoDuplicates: historyIds.length === new Set(historyIds).size
      && historyIds.length === fixture.config.hpChanges,
    queuesIdle,
    initiativeStateCoherent: JSON.stringify(stateA.order) === JSON.stringify(expectedStateA.order)
      && stateA.current === expectedStateA.current
      && stateA.round === expectedStateA.round,
    paragonInitsPreserved: JSON.stringify(stateA.paragonInits) === JSON.stringify(expectedStateA.paragonInits),
    noOrphanDerivedOutputs: orphanOutputs.length === 0,
    noCrossSceneContamination: diagnosticsBeforeDispose.crossSceneWrites
      .every((entry) => entry.blocked === true),
    playerWrites: diagnosticsBeforeDispose.playerWriteViolations.length === 0,
    noDuplicateAdvanceApplication: appliedAdvanceCommands.size === fixture.config.advanceTurns
      && duplicateAdvanceCommands.length <= 1,
    oldSceneInvalidated: diagnosticsBeforeDispose.currentSceneId === fixture.scenes[1].id,
    memoryInvalidation: memoryInvalidation.correctness,
    metadataFanout: metadataFanout.correctness,
    fullRenderSnapshot: fullRenderSnapshot.correctness,
  };
  const correctnessOk = Object.values(correctness).every(Boolean);

  await Promise.all([background, tracker, player].map((runtime) => runtime.dispose()));
  if (popup) await popup.close();
  if (popupReopen) await popupReopen.close();
  await server.flushEvents();
  const diagnosticsAfterDispose = server.getDiagnostics();

  const metricSnapshot = metrics.snapshot();
  const phases = metricSnapshot.phases;
  const cold = phases.find((phase) => phase.name === "cold-bootstrap") || null;
  const warmReconcile = phases.find((phase) => phase.name === "warm-reconcile") || null;
  const warm = phases.filter((phase) => phase.name !== "cold-bootstrap");
  const sdkTotals = {};
  for (const phase of phases) {
    for (const [method, value] of Object.entries(phase.sdk.methods || {})) {
      sdkTotals[method] = (sdkTotals[method] || 0) + value.count;
    }
  }
  const hotspots = Object.entries(sdkTotals)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 8)
    .map(([method, count]) => ({ method, count }));
  return {
    schemaVersion: "take-initiative-performance-v1",
    commit,
    node: process.version,
    runtime: "node",
    seed: String(seed),
    smoke: smoke === true,
    scenario: {
      ...fixture.config,
      realms: ["background GM", "tracker GM", "tracker Player", "popup mutante on-demand"],
      sceneSwitch: "scene-A -> scene-B",
      playerViewActive: true,
    },
    profiles: [
      memoryInvalidation,
      metadataFanout,
      fullRenderSnapshot,
      {
        name: "cold-cache",
        phase: "cold-bootstrap",
        metrics: cold,
      },
      {
        name: "warm-cache",
        phases: warm,
      },
    ],
    spatialTopology,
    phases,
    metrics: metricSnapshot,
    correctness: {
      ...correctness,
      ok: correctnessOk,
      details: {
        hpAActual,
        hpAExpected: expectedHpA,
        hpBActual,
        hpBExpected: fixture.expected.sceneB.initialHp,
        historyEntries: historyIds.length,
        effectProjectionsA: sceneAEffects.length,
        effectProjectionsB: sceneBEffects.length,
        actorVitalsActors: Object.keys(actorVitals).length,
        actorVitalsBytes: actorVitalsByteSize(actorVitalsRegistry),
        actorVitalsBudgetBytes: ACTOR_VITALS_ROOM_MAX_BYTES,
        actorVitalsMissingActorIds,
        actorVitalsMismatches,
        crossSceneWritesBlocked: diagnosticsBeforeDispose.crossSceneWrites.length,
        playerWriteViolations: diagnosticsBeforeDispose.playerWriteViolations.length,
        listenerCountAfterDispose: diagnosticsAfterDispose.activeListeners,
      },
    },
    queues: queues.map((state) => ({ realm: state.id, state })),
    cache: {
      bounds: {
        coldSdkCalls: cold?.sdk?.methods?.["scene.items.getItemBounds"]?.count || 0,
        warmSdkCalls: warmReconcile?.sdk?.methods?.["scene.items.getItemBounds"]?.count || 0,
        postSwitchSdkCalls: phases.find((phase) => phase.name === "scene-switch")
          ?.sdk?.methods?.["scene.items.getItemBounds"]?.count || 0,
        finalScene: diagnosticsAfterDispose.currentSceneId,
      },
      commandResults: {
        historyOwner: queues.find((state) => state.id === "background-gm")?.history?.cachedResults || 0,
        initiativeStateGateway: queues.find((state) => state.id === "tracker-gm")?.gateway?.cachedResults || 0,
      },
      unmounted: [
        "browser DOM/layout/paint",
        "effect-save reminder cache",
        "browser map-movement cache",
      ],
      localDerivedOutputsClearedOnSwitch: true,
      nodeHeapIndicative: true,
    },
    hotspots,
    productiveModules: [...PRODUCTIVE_MODULES],
    limitations: [
      "Node misura SDK/fanout/queue/reconcile/render controller e cache, non DOM reale.",
      "longtask, layout/paint, input latency e memoria del browser richiedono un collector browser.",
      "Il fake OBR non rappresenta differenze tra browser o la rete Owlbear reale.",
      "I risultati sono baseline osservabili; non vengono applicate soglie arbitrarie di performance.",
    ],
    durationMs: clock.now(),
    driver: {
      phaseNames,
      diagnosticsBeforeDispose,
      diagnosticsAfterDispose,
      listenerLifecycleClean: diagnosticsAfterDispose.activeListeners === 0,
    },
  };
}

export function smokePerformanceConfig() {
  return {
    tokens: 4,
    zones: 2,
    effects: 4,
    movements: 3,
    hpChanges: 3,
    advanceTurns: 2,
  };
}

export async function runPerformanceHarness({
  seed = "take-initiative-step-6",
  runs = 1,
  config = null,
  smoke = false,
  commit = null,
} = {}) {
  const count = Math.max(1, Math.floor(Number(runs) || 1));
  const resolvedConfig = smoke
    ? { ...smokePerformanceConfig(), ...(config || {}) }
    : (config || PERFORMANCE_SCENARIO_DEFAULTS);
  const reports = [];
  for (let index = 0; index < count; index += 1) {
    reports.push(await runSingleScenario({
      seed: count === 1 ? seed : `${seed}:run-${index + 1}`,
      config: resolvedConfig,
      commit,
      smoke,
    }));
  }
  const report = reports[0];
  return {
    ...report,
    runCount: count,
    runs: reports,
    correctness: {
      ...report.correctness,
      ok: reports.every((entry) => entry.correctness.ok),
    },
  };
}

export { PRODUCTIVE_MODULES };
