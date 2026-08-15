import OBR from "@owlbear-rodeo/sdk";
import {
  EFFECT_SAVE_REMINDER_NOTICE_CHANNEL,
  ID,
  RUNTIME_CACHE_CLEANUP_CHANNEL,
} from "./constants.js";
import { planEffectSaveReminderNotices } from "./effectSaveReminderCore.js";
import { currentSceneEpoch, isCurrentSceneEpoch } from "./sceneEpoch.js";
import {
  readSceneItemsSnapshot,
  subscribeSceneItemChanges,
} from "./sceneItemEvents.js";
import { sendProjectedReminderPayload } from "./options/reminderProjectionBroadcast.js";
import { createSceneMetadataKeyWatcher } from "./sceneMetadataDigest.js";

const STATE_KEY = `${ID}/state`;
const announcedActivationIds = new Set();
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
const stateMetadataWatcher = createSceneMetadataKeyWatcher(STATE_KEY);
let unsubscribeMetadata = null;
let unsubscribeItems = null;
let unsubscribeSceneReady = null;
let unsubscribeRuntimeCacheCleanup = null;

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

async function reconcileEffectSaveReminders(
  sceneMetadata = null,
  sceneItems = null,
  options = {},
) {
  const sceneEpoch = currentSceneEpoch();
  if (!sceneReady) {
    previousInitiativeState = null;
    announcedActivationIds.clear();
    return;
  }
  if (!isCurrentSceneEpoch(sceneEpoch)) return;
  const metadata = sceneMetadata && typeof sceneMetadata === "object"
    ? sceneMetadata
    : await OBR.scene.getMetadata().catch(() => ({}));
  if (!isCurrentSceneEpoch(sceneEpoch)) return;
  const initiativeState = snapshot(metadata?.[STATE_KEY]);
  const sharedSnapshot = readSceneItemsSnapshot(sceneEpoch);
  const items = Array.isArray(sceneItems)
    ? sceneItems
    : sharedSnapshot.complete
      ? sharedSnapshot.items
      : await OBR.scene.items.getItems();
  if (!isCurrentSceneEpoch(sceneEpoch)) return;
  if (!stateMetadataWatcher.initialized) stateMetadataWatcher.seed(metadata);
  const generation = Number(options.generation)
    || Number(sharedSnapshot?.generation)
    || (Array.isArray(sceneItems) ? "provided" : "full");
  const reconcileKey = JSON.stringify({
    sceneEpoch,
    generation,
    stateDigest: stateMetadataWatcher.digest,
  });
  if (options.force !== true && completedReconcileKey === reconcileKey) return;
  const previousState = previousInitiativeState;
  const notices = planEffectSaveReminderNotices({
    items,
    previousInitiativeState: previousState,
    initiativeState,
    includeCurrentTurnStart: previousState !== null,
  }).filter((notice) => !announcedActivationIds.has(notice.activationId));
  if (!isCurrentSceneEpoch(sceneEpoch)) return;
  previousInitiativeState = initiativeState;
  if (!notices.length) {
    if (isCurrentSceneEpoch(sceneEpoch)) completedReconcileKey = reconcileKey;
    return;
  }
  for (const notice of notices) announcedActivationIds.add(notice.activationId);
  if (announcedActivationIds.size > 500) {
    const recent = [...announcedActivationIds].slice(-250);
    announcedActivationIds.clear();
    for (const activationId of recent) announcedActivationIds.add(activationId);
  }
  if (!isCurrentSceneEpoch(sceneEpoch)) return;
  await sendProjectedReminderPayload(
    EFFECT_SAVE_REMINDER_NOTICE_CHANNEL,
    { type: "show-effect-save-notices", notices },
  );
  if (isCurrentSceneEpoch(sceneEpoch)) completedReconcileKey = reconcileKey;
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
        await reconcileEffectSaveReminders(metadata, items, { generation, force });
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
      reason: "items",
    });
  }, {
    domains: ["effects"],
    filter: (event) => !event?.derived?.output,
  });
  unsubscribeSceneReady = OBR.scene.onReadyChange((ready) => {
    sceneReady = !!ready;
    if (!ready) {
      previousInitiativeState = null;
      announcedActivationIds.clear();
      completedReconcileKey = null;
      stateMetadataWatcher.reset();
      return;
    }
    enqueueReconcile();
  });
  unsubscribeRuntimeCacheCleanup = OBR.broadcast.onMessage(
    RUNTIME_CACHE_CLEANUP_CHANNEL,
    (event) => {
      if (event?.data?.type !== "clear-runtime-caches") return;
      previousInitiativeState = null;
      announcedActivationIds.clear();
      completedReconcileKey = null;
      if (sceneReady) enqueueReconcile(null, null, { force: true, reason: "runtime-cache-cleanup" });
    },
  );
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
  sceneReady = false;
  previousInitiativeState = null;
  announcedActivationIds.clear();
  reconcileRunning = false;
  reconcileRequested = false;
  queuedSceneMetadata = null;
  queuedItems = null;
  queuedItemGeneration = 0;
  queuedForce = false;
  completedReconcileKey = null;
  stateMetadataWatcher.reset();
  mounted = false;
}
