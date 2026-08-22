import OBR from "@owlbear-rodeo/sdk";
import {
  EFFECT_SAVE_REMINDER_NOTICE_CHANNEL,
  ID,
  REMINDER_HISTORY_REARM_CHANNEL,
  RUNTIME_CACHE_CLEANUP_CHANNEL,
} from "./constants.js";
import {
  effectSaveReminderNoticeFromHistoryReplay,
  planEffectSaveReminderNotices,
} from "./effectSaveReminderCore.js";
import {
  currentSceneEpoch,
  isCurrentSceneEpoch,
  subscribeSceneEpoch,
} from "./sceneEpoch.js";
import {
  readSceneItemsSnapshot,
  subscribeSceneItemChanges,
} from "./sceneItemEvents.js";
import { sendProjectedReminderPayload } from "./options/reminderProjectionBroadcast.js";
import { createSceneMetadataKeyWatcher } from "./sceneMetadataDigest.js";

const STATE_KEY = `${ID}/state`;
const announcedActivationIds = new Set();
const rearmableActivationIds = new Set();
const pendingHistoryReplays = new Map();
let mounted = false;
let sceneReady = false;
let previousInitiativeState = null;
let reconcileRunning = false;
let reconcileRequested = false;
let queuedSceneMetadata = null;
let queuedItems = null;
let queuedItemGeneration = 0;
let queuedForce = false;
let completedReconcileKey = null;
let runtimeCacheRevision = 0;
const stateMetadataWatcher = createSceneMetadataKeyWatcher(STATE_KEY);
let unsubscribeMetadata = null;
let unsubscribeItems = null;
let unsubscribeSceneReady = null;
let unsubscribeRuntimeCacheCleanup = null;
let unsubscribeRuntimeHistoryRearm = null;
let unsubscribeSceneEpoch = null;

function snapshot(state) {
  const order = Array.isArray(state?.order) ? [...state.order] : [];
  if (!order.length) return null;
  return {
    order,
    current: Math.max(
      0,
      Math.min(order.length - 1, Math.floor(Number(state?.current) || 0)),
    ),
    round: Math.max(1, Math.floor(Number(state?.round) || 1)),
  };
}

function resetRuntimeState() {
  runtimeCacheRevision += 1;
  previousInitiativeState = null;
  announcedActivationIds.clear();
  rearmableActivationIds.clear();
  pendingHistoryReplays.clear();
  completedReconcileKey = null;
}

function isCurrentReconcile(sceneEpoch, revision) {
  return (
    mounted
    && sceneReady
    && runtimeCacheRevision === revision
    && isCurrentSceneEpoch(sceneEpoch)
  );
}

async function reconcileEffectSaveReminders(
  sceneMetadata = null,
  sceneItems = null,
  options = {},
) {
  const sceneEpoch = currentSceneEpoch();
  const reconcileRevision = runtimeCacheRevision;
  if (!sceneReady) {
    resetRuntimeState();
    return;
  }
  if (!isCurrentReconcile(sceneEpoch, reconcileRevision)) {
    return;
  }
  const metadata = sceneMetadata && typeof sceneMetadata === "object"
    ? sceneMetadata
    : await OBR.scene.getMetadata().catch(() => ({}));
  if (!isCurrentReconcile(sceneEpoch, reconcileRevision)) {
    return;
  }
  const initiativeState = snapshot(metadata?.[STATE_KEY]);
  const sharedSnapshot = readSceneItemsSnapshot(sceneEpoch);
  const items = Array.isArray(sceneItems)
    ? sceneItems
    : sharedSnapshot.complete
      ? sharedSnapshot.items
      : await OBR.scene.items.getItems();
  if (!isCurrentReconcile(sceneEpoch, reconcileRevision)) {
    return;
  }
  if (!stateMetadataWatcher.initialized) stateMetadataWatcher.seed(metadata);
  const generation = Number(options.generation)
    || Number(sharedSnapshot?.generation)
    || (Array.isArray(sceneItems) ? "provided" : "full");
  const reconcileKey = JSON.stringify({
    sceneEpoch,
    generation,
    stateDigest: stateMetadataWatcher.digest,
  });
  if (options.force !== true && completedReconcileKey === reconcileKey) {
    return;
  }
  const previousState = previousInitiativeState;
  const plannedNotices = planEffectSaveReminderNotices({
    items,
    previousInitiativeState: previousState,
    initiativeState,
    includeCurrentTurnStart: previousState !== null,
  });
  const replayNotices = [];
  for (const [activationId, replay] of [...pendingHistoryReplays]) {
    const notice = effectSaveReminderNoticeFromHistoryReplay({
      replay,
      items,
    });
    if (notice) {
      replayNotices.push(notice);
      continue;
    }
    const targetId = String(
      replay?.targetId
        || replay?.descriptor?.targetId
        || replay?.descriptor?.notice?.targets?.[0]?.id
        || "",
    ).trim();
    const targetPresent = items.some((item) => String(item?.id || "") === targetId);
    // A consumed or removed canonical target can never accept this replay.
    // A missing target may only be a short-lived item snapshot gap; bound the
    // retries so a stale owner request cannot grow indefinitely.
    if (!targetId || targetPresent) {
      pendingHistoryReplays.delete(activationId);
    } else {
      const attempts = Math.max(0, Math.floor(Number(replay?.replayAttempts) || 0));
      if (attempts >= 2) {
        pendingHistoryReplays.delete(activationId);
      } else {
        pendingHistoryReplays.set(activationId, {
          ...replay,
          replayAttempts: attempts + 1,
        });
      }
    }
  }
  const candidateNotices = [
    ...plannedNotices,
    ...replayNotices,
  ];
  const currentActivationIds = new Set(
    plannedNotices
      .map((notice) => String(notice?.activationId || "").trim())
      .filter(Boolean),
  );
  for (const activationId of announcedActivationIds) {
    if (currentActivationIds.has(activationId)) continue;
    announcedActivationIds.delete(activationId);
    rearmableActivationIds.add(activationId);
  }
  if (rearmableActivationIds.size > 500) {
    const recent = [...rearmableActivationIds].slice(-250);
    rearmableActivationIds.clear();
    for (const activationId of recent) rearmableActivationIds.add(activationId);
  }
  const notices = [...new Map(candidateNotices.map((notice) => [
    notice.activationId,
    notice,
  ])).values()]
    .filter((notice) => !announcedActivationIds.has(notice.activationId));
  if (!isCurrentReconcile(sceneEpoch, reconcileRevision)) {
    return;
  }
  if (!notices.length) {
    previousInitiativeState = initiativeState;
    completedReconcileKey = reconcileKey;
    return;
  }
  const pendingActivationIds = new Set(
    notices.map((notice) => notice.activationId),
  );
  const pendingRearmActivationIds = new Set(
    notices
      .map((notice) => notice.activationId)
      .filter((activationId) => rearmableActivationIds.has(activationId)),
  );
  const payload = {
    type: "show-effect-save-notices",
    notices,
    ...(pendingRearmActivationIds.size
      ? { rearmActivationIds: [...pendingRearmActivationIds] }
      : {}),
  };
  let delivery;
  try {
    delivery = await sendProjectedReminderPayload(
      EFFECT_SAVE_REMINDER_NOTICE_CHANNEL,
      payload,
    );
  } catch (error) {
    throw error;
  }
  if (!isCurrentReconcile(sceneEpoch, reconcileRevision)) {
    return;
  }
  if (!(Number(delivery?.gm) > 0 || Number(delivery?.player) > 0)) {
    return;
  }
  for (const activationId of pendingActivationIds) {
    announcedActivationIds.add(activationId);
    rearmableActivationIds.delete(activationId);
    pendingHistoryReplays.delete(activationId);
  }
  if (announcedActivationIds.size > 500) {
    const recent = [...announcedActivationIds].slice(-250);
    announcedActivationIds.clear();
    for (const activationId of recent) announcedActivationIds.add(activationId);
  }
  previousInitiativeState = initiativeState;
  completedReconcileKey = reconcileKey;
}

function enqueueReconcile(sceneMetadata = null, sceneItems = null, options = {}) {
  if (sceneMetadata && typeof sceneMetadata === "object") {
    queuedSceneMetadata = sceneMetadata;
  }
  if (Array.isArray(sceneItems)) queuedItems = sceneItems;
  if (options.generation !== undefined) queuedItemGeneration = Number(options.generation) || 0;
  queuedForce ||= options.force === true;
  reconcileRequested = true;
  if (reconcileRunning) return;
  reconcileRunning = true;
  const run = async () => {
    try {
      while (reconcileRequested) {
        reconcileRequested = false;
        const metadata = queuedSceneMetadata;
        const items = queuedItems;
        const generation = queuedItemGeneration;
        const force = queuedForce;
        queuedSceneMetadata = null;
        queuedItems = null;
        queuedItemGeneration = 0;
        queuedForce = false;
        await reconcileEffectSaveReminders(metadata, items, {
          generation,
          force,
          revision: options.revision ?? null,
        });
      }
    } catch (error) {
      console.warn(
        "[effect-save-reminder] reconcile:",
        error?.message || error,
      );
    } finally {
      reconcileRunning = false;
      if (reconcileRequested) enqueueReconcile();
    }
  };
  void run();
}

export async function mountEffectSaveReminderController() {
  if (mounted) return true;
  const role = await OBR.player.getRole().catch(() => "PLAYER");
  if (role !== "GM") return false;
  mounted = true;
  unsubscribeMetadata = OBR.scene.onMetadataChange((metadata) => {
    const observed = stateMetadataWatcher.initialized
      ? stateMetadataWatcher.observe(metadata)
      : stateMetadataWatcher.seed(metadata);
    if (observed.changed) enqueueReconcile(metadata, null, { reason: "metadata" });
  });
  unsubscribeItems = subscribeSceneItemChanges((event) => {
    enqueueReconcile(null, event?.allItems, {
      generation: event?.generation,
      revision: event?.revision,
      reason: "items",
    });
  }, {
    domains: ["effects"],
    filter: (event) => !event?.derived?.output,
  });
  unsubscribeSceneReady = OBR.scene.onReadyChange((ready) => {
    sceneReady = !!ready;
    if (!ready) {
      resetRuntimeState();
      stateMetadataWatcher.reset();
      return;
    }
    enqueueReconcile();
  });
  unsubscribeRuntimeCacheCleanup = OBR.broadcast.onMessage(
    RUNTIME_CACHE_CLEANUP_CHANNEL,
    (event) => {
      if (event?.data?.type !== "clear-runtime-caches") return;
      resetRuntimeState();
      if (sceneReady) enqueueReconcile(null, null, { force: true, reason: "runtime-cache-cleanup" });
    },
  );
  unsubscribeRuntimeHistoryRearm = OBR.broadcast.onMessage(
    REMINDER_HISTORY_REARM_CHANNEL,
    (event) => {
      const data = event?.data;
      if (data?.type !== "restore-reminder-activation" || data?.owner !== "effect-save") return;
      if (Number(data?.sceneEpoch) !== currentSceneEpoch()) return;
      const activationId = String(data?.activationId || "").trim();
      const descriptor = data?.descriptor && typeof data.descriptor === "object"
        ? data.descriptor
        : null;
      if (!activationId || !descriptor) return;
      pendingHistoryReplays.set(activationId, {
        activationId,
        ...descriptor,
        replayAttempts: 0,
      });
      announcedActivationIds.delete(activationId);
      rearmableActivationIds.add(activationId);
      enqueueReconcile(null, null, { force: true, reason: "reminder-history-rearm" });
    },
  );
  unsubscribeSceneEpoch = subscribeSceneEpoch(({ phase }) => {
    if (phase === "unload") resetRuntimeState();
  });
  sceneReady = await OBR.scene.isReady().catch(() => false);
  if (sceneReady) enqueueReconcile();
  return true;
}

export function unmountEffectSaveReminderController() {
  unsubscribeMetadata?.();
  unsubscribeMetadata = null;
  unsubscribeItems?.();
  unsubscribeItems = null;
  unsubscribeSceneReady?.();
  unsubscribeSceneReady = null;
  unsubscribeRuntimeCacheCleanup?.();
  unsubscribeRuntimeCacheCleanup = null;
  unsubscribeRuntimeHistoryRearm?.();
  unsubscribeRuntimeHistoryRearm = null;
  unsubscribeSceneEpoch?.();
  unsubscribeSceneEpoch = null;
  sceneReady = false;
  resetRuntimeState();
  reconcileRunning = false;
  reconcileRequested = false;
  queuedSceneMetadata = null;
  queuedItems = null;
  queuedItemGeneration = 0;
  queuedForce = false;
  stateMetadataWatcher.reset();
  mounted = false;
}
