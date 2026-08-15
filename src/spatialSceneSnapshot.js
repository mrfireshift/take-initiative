import OBR from "@owlbear-rodeo/sdk";
import {
  readSceneItemsSnapshot,
  subscribeSceneItemChanges,
} from "./sceneItemEvents.js";
import { createSceneItemBoundsCache } from "./sceneItemBoundsCache.js";
import {
  currentSceneEpoch,
  isCurrentSceneEpoch,
  subscribeSceneEpoch,
} from "./sceneEpoch.js";
import { createSceneMetadataKeyWatcher } from "./sceneMetadataDigest.js";
import { ID } from "./constants.js";

const DEFAULT_DPI = 150;
const DEFAULT_GRID_SCALE = Object.freeze({ multiplier: 1.5, unit: "m" });
const ITEM_BOUNDS_TIMEOUT_MS = 1200;
const STATE_KEY = `${ID}/state`;

function numberOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function sceneIdentityFor(getSceneIdentity, sceneEpoch) {
  let identity = null;
  try {
    identity = typeof getSceneIdentity === "function"
      ? getSceneIdentity()
      : null;
  } catch {
    identity = null;
  }
  return String(identity || `epoch:${sceneEpoch}`).trim();
}

function normalizeItems(items) {
  return (Array.isArray(items) ? items : [])
    .filter((item) => String(item?.id || "").trim());
}

function normalizeGridScale(value) {
  const parsed = value?.parsed && typeof value.parsed === "object"
    ? value.parsed
    : value && typeof value === "object"
      ? value
      : {};
  return {
    ...(value && typeof value === "object" ? value : {}),
    parsed: {
      multiplier: numberOr(parsed.multiplier, DEFAULT_GRID_SCALE.multiplier),
      unit: String(parsed.unit || DEFAULT_GRID_SCALE.unit),
    },
  };
}

function emptyBoundsResult(snapshot, missingIds = []) {
  return {
    snapshotKey: snapshot?.key || null,
    boundsById: new Map(),
    complete: false,
    missingIds: [...new Set(missingIds.map((id) => String(id || "").trim()).filter(Boolean))],
    stale: true,
  };
}

function sourceGenerationOf(snapshot) {
  return Number.isFinite(Number(snapshot?.generation))
    ? Number(snapshot.generation)
    : String(snapshot?.generation || "0");
}

/**
 * Owns the one background spatial read model shared by mobile, class-feature,
 * and custom aura controllers. It deliberately separates the logical scene
 * snapshot from the per-item geometry cache: metadata/grid changes rebuild the
 * read model, while unchanged item geometry remains warm.
 */
export function createSpatialSceneSnapshotService({
  readItemsSnapshot = (sceneEpoch) => readSceneItemsSnapshot(sceneEpoch),
  readSceneMetadata = () => OBR.scene.getMetadata(),
  readGridDpi = () => OBR.scene.grid.getDpi(),
  readGridScale = () => OBR.scene.grid.getScale(),
  isSceneReady = () => OBR.scene.isReady(),
  getSceneEpoch = currentSceneEpoch,
  isCurrentEpoch = isCurrentSceneEpoch,
  getSceneIdentity = null,
  boundsCache = createSceneItemBoundsCache(
    (itemId) => OBR.scene.items.getItemBounds([itemId]),
    { timeoutMs: ITEM_BOUNDS_TIMEOUT_MS },
  ),
  subscribeItems = (handler, options) => subscribeSceneItemChanges(handler, options),
  subscribeGrid = (handler) => OBR.scene.grid.onChange(handler),
  subscribeSceneReady = (handler) => OBR.scene.onReadyChange(handler),
  subscribeSceneMetadata = (handler) => OBR.scene.onMetadataChange(handler),
  subscribeEpoch = (handler) => subscribeSceneEpoch(handler),
} = {}) {
  if (typeof readItemsSnapshot !== "function") {
    throw new TypeError("spatial-items-snapshot-reader-required");
  }
  if (!boundsCache || typeof boundsCache.load !== "function") {
    throw new TypeError("spatial-bounds-cache-required");
  }

  let mounted = false;
  let unsubscribeItems = null;
  let unsubscribeGrid = null;
  let unsubscribeSceneReady = null;
  let unsubscribeSceneMetadata = null;
  let unsubscribeEpoch = null;
  let sceneToken = 0;
  let metadataRevision = 0;
  let gridRevision = 0;
  let geometryRevision = 0;
  let cachedBase = null;
  let pendingBase = null;
  let pendingSourceRead = null;
  const stateMetadataWatcher = createSceneMetadataKeyWatcher(STATE_KEY);
  const diagnostics = {
    snapshotBuilds: 0,
    snapshotCacheHits: 0,
    snapshotCoalesced: 0,
    incompleteSnapshots: 0,
    staleSnapshots: 0,
    invalidations: 0,
    boundsRequests: 0,
    boundsRequestedIds: 0,
    boundsSkippedNoAuras: 0,
    boundsStaleRejects: 0,
    metadataReads: 0,
    metadataEventsIgnored: 0,
    metadataStateChanges: 0,
    metadataStateDigest: null,
    gridDpiReads: 0,
    gridScaleReads: 0,
    itemSnapshotReads: 0,
    consumers: {},
  };

  function currentEpoch() {
    return getSceneEpoch();
  }

  function currentIdentity(epoch = currentEpoch()) {
    return sceneIdentityFor(getSceneIdentity, epoch);
  }

  function isEpochCurrent(epoch) {
    try {
      return typeof isCurrentEpoch === "function"
        ? isCurrentEpoch(epoch)
        : Number(currentEpoch()) === Number(epoch);
    } catch {
      return false;
    }
  }

  function currentRevisionMatches(snapshot) {
    if (!snapshot) return false;
    if (!isEpochCurrent(snapshot.sceneEpoch)) return false;
    if (Number(snapshot.sceneEpoch) !== Number(currentEpoch())) return false;
    if (snapshot.sceneToken !== sceneToken) return false;
    if (snapshot.metadataRevision !== metadataRevision) return false;
    if (snapshot.gridRevision !== gridRevision) return false;
    if (snapshot.geometryRevision !== geometryRevision) return false;
    if (snapshot.sceneIdentity !== currentIdentity(snapshot.sceneEpoch)) return false;
    return true;
  }

  function currentContextMatches(snapshot) {
    return !!snapshot?.complete && currentRevisionMatches(snapshot);
  }

  function invalidate({ scope = "logical", reason = "manual", itemIds = [] } = {}) {
    diagnostics.invalidations += 1;
    cachedBase = null;
    if (scope === "scene") {
      sceneToken += 1;
      metadataRevision += 1;
      gridRevision += 1;
      geometryRevision += 1;
      boundsCache.clear?.();
      return { scope, reason, sceneToken };
    }
    if (scope === "geometry") {
      geometryRevision += 1;
      if (Array.isArray(itemIds) && itemIds.length) boundsCache.invalidate?.(itemIds);
      else boundsCache.clear?.();
      return { scope, reason, geometryRevision };
    }
    if (reason === "grid") gridRevision += 1;
    else metadataRevision += 1;
    return { scope, reason, metadataRevision, gridRevision };
  }

  async function readBaseSource(sceneEpoch) {
    diagnostics.itemSnapshotReads += 1;
    return readItemsSnapshot(sceneEpoch);
  }

  function incompleteSnapshot({
    sceneEpoch,
    sceneIdentity,
    key,
    itemGeneration = 0,
    reason = "incomplete",
    missing = [],
    stale = false,
  }) {
    diagnostics.incompleteSnapshots += 1;
    if (stale) diagnostics.staleSnapshots += 1;
    return {
      complete: false,
      stale,
      reason,
      missing,
      key,
      snapshotKey: key,
      sceneEpoch,
      sceneIdentity,
      sceneToken,
      itemGeneration,
      metadataRevision,
      gridRevision,
      geometryRevision,
      items: [],
      itemsById: new Map(),
      sceneMetadata: null,
      dpi: null,
      dpiValue: null,
      scale: null,
      boundsById: new Map(),
    };
  }

  async function buildBase({ sceneEpoch, sceneIdentity, source, key, itemGeneration }) {
    if (source?.complete !== true) {
      return incompleteSnapshot({
        sceneEpoch,
        sceneIdentity,
        key,
        itemGeneration,
        reason: "items-incomplete",
        missing: ["items"],
      });
    }
    const [metadataResult, dpiResult, scaleResult] = await Promise.allSettled([
      Promise.resolve().then(() => {
        diagnostics.metadataReads += 1;
        return readSceneMetadata();
      }),
      Promise.resolve().then(() => {
        diagnostics.gridDpiReads += 1;
        return readGridDpi();
      }),
      Promise.resolve().then(() => {
        diagnostics.gridScaleReads += 1;
        return readGridScale();
      }),
    ]);
    if (!isEpochCurrent(sceneEpoch) || sceneToken !== Number(key.sceneToken)) {
      return incompleteSnapshot({
        sceneEpoch,
        sceneIdentity,
        key,
        itemGeneration,
        reason: "stale-context",
        missing: ["scene"],
        stale: true,
      });
    }
    const rejected = [
      ["metadata", metadataResult],
      ["dpi", dpiResult],
      ["scale", scaleResult],
    ].filter(([, result]) => result.status !== "fulfilled");
    if (rejected.length) {
      return incompleteSnapshot({
        sceneEpoch,
        sceneIdentity,
        key,
        itemGeneration,
        reason: "spatial-read-failed",
        missing: rejected.map(([name]) => name),
      });
    }
    if (!currentRevisionMatches({
      complete: true,
      sceneEpoch,
      sceneIdentity,
      sceneToken: key.sceneToken,
      metadataRevision: key.metadataRevision,
      gridRevision: key.gridRevision,
      geometryRevision: key.geometryRevision,
    })) {
      return incompleteSnapshot({
        sceneEpoch,
        sceneIdentity,
        key,
        itemGeneration,
        reason: "snapshot-invalidated-during-load",
        missing: ["snapshot"],
        stale: true,
      });
    }
    const items = normalizeItems(source.items);
    const itemsById = new Map(items.map((item) => [String(item.id), item]));
    const snapshot = {
      complete: true,
      stale: false,
      reason: null,
      key,
      snapshotKey: key,
      sceneEpoch,
      sceneIdentity,
      sceneToken,
      itemGeneration,
      metadataRevision,
      gridRevision,
      geometryRevision,
      items,
      itemsById,
      sceneMetadata: metadataResult.value || {},
      dpi: numberOr(dpiResult.value, DEFAULT_DPI),
      dpiValue: numberOr(dpiResult.value, DEFAULT_DPI),
      scale: normalizeGridScale(scaleResult.value),
      boundsById: new Map(),
    };
    if (!stateMetadataWatcher.initialized) {
      stateMetadataWatcher.seed(metadataResult.value || {});
    }
    boundsCache.syncLiveSet?.(items);
    return snapshot;
  }

  async function getSnapshot({ sceneEpoch = currentEpoch() } = {}) {
    const sceneIdentity = currentIdentity(sceneEpoch);
    if (!isEpochCurrent(sceneEpoch)) {
      return incompleteSnapshot({
        sceneEpoch,
        sceneIdentity,
        key: null,
        reason: "scene-not-current",
        missing: ["scene"],
        stale: true,
      });
    }
    const ready = await Promise.resolve().then(() => isSceneReady());
    if (ready === false) {
      return incompleteSnapshot({
        sceneEpoch,
        sceneIdentity,
        key: null,
        reason: "scene-not-ready",
        missing: ["scene"],
      });
    }
    if (cachedBase?.snapshot && currentRevisionMatches(cachedBase.snapshot)) {
      diagnostics.snapshotCacheHits += 1;
      return cachedBase.snapshot;
    }
    const sourceKey = JSON.stringify({
      sceneEpoch,
      sceneIdentity,
      sceneToken,
      metadataRevision,
      gridRevision,
      geometryRevision,
    });
    let source = null;
    try {
      if (pendingSourceRead?.key === sourceKey) {
        source = await pendingSourceRead.promise;
      } else {
        const sourceEntry = { key: sourceKey, promise: null };
        sourceEntry.promise = Promise.resolve()
          .then(() => readBaseSource(sceneEpoch))
          .finally(() => {
            if (pendingSourceRead === sourceEntry) pendingSourceRead = null;
          });
        pendingSourceRead = sourceEntry;
        source = await sourceEntry.promise;
      }
    } catch {
      return incompleteSnapshot({
        sceneEpoch,
        sceneIdentity,
        key: null,
        reason: "items-read-failed",
        missing: ["items"],
      });
    }
    const itemGeneration = sourceGenerationOf(source);
    const key = {
      sceneEpoch,
      sceneIdentity,
      sceneToken,
      itemGeneration,
      metadataRevision,
      gridRevision,
      geometryRevision,
    };
    const keyString = JSON.stringify(key);
    if (cachedBase?.keyString === keyString) {
      diagnostics.snapshotCacheHits += 1;
      return cachedBase.snapshot;
    }
    if (pendingBase?.keyString === keyString) {
      diagnostics.snapshotCoalesced += 1;
      return pendingBase.promise;
    }
    diagnostics.snapshotBuilds += 1;
    const entry = {
      keyString,
      promise: null,
    };
    entry.promise = buildBase({
      sceneEpoch,
      sceneIdentity,
      source,
      key,
      itemGeneration,
    }).then((snapshot) => {
      if (snapshot.complete && currentRevisionMatches(snapshot)) {
        cachedBase = { keyString, snapshot };
      }
      return snapshot;
    }).finally(() => {
      if (pendingBase === entry) pendingBase = null;
    });
    pendingBase = entry;
    return entry.promise;
  }

  async function ensureBounds(
    snapshot,
    requiredItems = [],
    { consumer = "unknown" } = {},
  ) {
    const name = String(consumer || "unknown");
    diagnostics.boundsRequests += 1;
    diagnostics.consumers[name] = (diagnostics.consumers[name] || 0) + 1;
    const requested = (Array.isArray(requiredItems) ? requiredItems : [])
      .map((value) => typeof value === "object" ? value?.id : value)
      .map((id) => String(id || "").trim())
      .filter(Boolean);
    const uniqueIds = [...new Set(requested)];
    diagnostics.boundsRequestedIds += uniqueIds.length;
    if (!snapshot?.complete || !currentContextMatches(snapshot)) {
      diagnostics.boundsStaleRejects += 1;
      return emptyBoundsResult(snapshot, uniqueIds);
    }
    if (!uniqueIds.length) {
      diagnostics.boundsSkippedNoAuras += 1;
      boundsCache.syncLiveSet?.(snapshot.items);
      return {
        snapshotKey: snapshot.key,
        boundsById: new Map(),
        complete: true,
        missingIds: [],
        skipped: true,
      };
    }
    const items = uniqueIds
      .map((id) => snapshot.itemsById.get(id))
      .filter(Boolean);
    const result = await boundsCache.load(items, {
      liveItems: snapshot.items,
      preserveLiveSet: true,
    });
    if (!currentContextMatches(snapshot)) {
      diagnostics.boundsStaleRejects += 1;
      return emptyBoundsResult(snapshot, uniqueIds);
    }
    return {
      ...result,
      snapshotKey: snapshot.key,
      consumer: name,
      stale: false,
    };
  }

  function mount() {
    if (mounted) return true;
    mounted = true;
    try {
      unsubscribeItems = typeof subscribeItems === "function"
        ? subscribeItems(
          () => invalidate({ reason: "items" }),
          { immediate: true },
        )
        : null;
    } catch {
      unsubscribeItems = null;
    }
    try {
      unsubscribeGrid = typeof subscribeGrid === "function"
        ? subscribeGrid(() => invalidate({ reason: "grid" }))
        : null;
    } catch {
      unsubscribeGrid = null;
    }
    try {
      unsubscribeSceneMetadata = typeof subscribeSceneMetadata === "function"
        ? subscribeSceneMetadata((metadata) => {
          if (metadata === undefined) {
            // Compatibilità con provider legacy che non inoltrano il payload:
            // in quel caso la chiave non è osservabile, quindi invalidiamo in
            // modo conservativo invece di riusare uno snapshot potenzialmente stale.
            invalidate({ reason: "metadata" });
            return;
          }
          const observed = stateMetadataWatcher.initialized
            ? stateMetadataWatcher.observe(metadata)
            : stateMetadataWatcher.seed(metadata);
          diagnostics.metadataStateDigest = observed.digest;
          if (!observed.changed) {
            diagnostics.metadataEventsIgnored += 1;
            return;
          }
          diagnostics.metadataStateChanges += 1;
          invalidate({ reason: "metadata-state" });
        })
        : null;
    } catch {
      unsubscribeSceneMetadata = null;
    }
    try {
      unsubscribeSceneReady = typeof subscribeSceneReady === "function"
        ? subscribeSceneReady((ready) => {
          if (ready === false) invalidate({ scope: "scene", reason: "scene-unload" });
          else invalidate({ reason: "scene-ready" });
        })
        : null;
    } catch {
      unsubscribeSceneReady = null;
    }
    try {
      unsubscribeEpoch = typeof subscribeEpoch === "function"
        ? subscribeEpoch(({ phase }) => {
          if (phase === "unload") {
            stateMetadataWatcher.reset();
            diagnostics.metadataStateDigest = null;
            invalidate({ scope: "scene", reason: "scene-epoch-unload" });
          } else if (phase === "ready") {
            stateMetadataWatcher.reset();
            invalidate({ reason: "scene-epoch-ready" });
          }
        })
        : null;
    } catch {
      unsubscribeEpoch = null;
    }
    return true;
  }

  function unmount() {
    unsubscribeItems?.();
    unsubscribeItems = null;
    unsubscribeGrid?.();
    unsubscribeGrid = null;
    unsubscribeSceneReady?.();
    unsubscribeSceneReady = null;
    unsubscribeSceneMetadata?.();
    unsubscribeSceneMetadata = null;
    unsubscribeEpoch?.();
    unsubscribeEpoch = null;
    mounted = false;
    stateMetadataWatcher.reset();
    invalidate({ scope: "scene", reason: "service-unmount" });
  }

  return {
    mount,
    unmount,
    getSnapshot,
    ensureBounds,
    invalidate,
    invalidateScene(reason = "scene-boundary") {
      return invalidate({ scope: "scene", reason });
    },
    isCurrent: currentContextMatches,
    getDiagnostics() {
      return {
        mounted,
        sceneToken,
        metadataRevision,
        gridRevision,
        geometryRevision,
        ...diagnostics,
        metadataStateDigest: stateMetadataWatcher.digest,
        consumers: { ...diagnostics.consumers },
        boundsCache: boundsCache.getDiagnostics?.() || null,
      };
    },
  };
}

let sharedService = null;

export function getSpatialSceneSnapshotService() {
  if (!sharedService) sharedService = createSpatialSceneSnapshotService();
  return sharedService;
}

export function mountSpatialSceneSnapshotService() {
  return getSpatialSceneSnapshotService().mount();
}

export function unmountSpatialSceneSnapshotService() {
  return getSpatialSceneSnapshotService().unmount();
}

globalThis.__tbpSpatialSceneSnapshotService = {
  get: getSpatialSceneSnapshotService,
  mount: mountSpatialSceneSnapshotService,
  unmount: unmountSpatialSceneSnapshotService,
};
