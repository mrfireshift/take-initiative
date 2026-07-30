import OBR from "@owlbear-rodeo/sdk";
import { EFFECT_SAVE_REMINDER_NOTICE_CHANNEL, ID } from "./constants.js";
import { planEffectSaveReminderNotices } from "./effectSaveReminderCore.js";

const STATE_KEY = `${ID}/state`;
const announcedActivationIds = new Set();
let mounted = false;
let previousInitiativeState = null;
let reconcileQueue = Promise.resolve();
let unsubscribeMetadata = null;
let unsubscribeSceneReady = null;

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

async function reconcileEffectSaveReminders(sceneMetadata = null) {
  if (!await OBR.scene.isReady().catch(() => false)) {
    previousInitiativeState = null;
    announcedActivationIds.clear();
    return;
  }
  const metadata = sceneMetadata && typeof sceneMetadata === "object"
    ? sceneMetadata
    : await OBR.scene.getMetadata().catch(() => ({}));
  const initiativeState = snapshot(metadata?.[STATE_KEY]);
  if (!initiativeState) {
    previousInitiativeState = null;
    announcedActivationIds.clear();
    return;
  }
  const items = await OBR.scene.items.getItems();
  const notices = planEffectSaveReminderNotices({
    items,
    previousInitiativeState,
    initiativeState,
  }).filter((notice) => !announcedActivationIds.has(notice.activationId));
  previousInitiativeState = initiativeState;
  if (!notices.length) return;
  for (const notice of notices) announcedActivationIds.add(notice.activationId);
  if (announcedActivationIds.size > 500) {
    const recent = [...announcedActivationIds].slice(-250);
    announcedActivationIds.clear();
    for (const activationId of recent) announcedActivationIds.add(activationId);
  }
  await OBR.broadcast.sendMessage(
    EFFECT_SAVE_REMINDER_NOTICE_CHANNEL,
    { type: "show-effect-save-notices", notices },
    { destination: "ALL" },
  );
}

function enqueueReconcile(sceneMetadata = null) {
  const run = () => reconcileEffectSaveReminders(sceneMetadata);
  reconcileQueue = reconcileQueue.then(run, run).catch((error) => {
    console.warn(
      "[effect-save-reminder] reconcile:",
      error?.message || error,
    );
  });
}

export async function mountEffectSaveReminderController() {
  if (mounted) return true;
  const role = await OBR.player.getRole().catch(() => "PLAYER");
  if (role !== "GM") return false;
  mounted = true;
  unsubscribeMetadata = OBR.scene.onMetadataChange(enqueueReconcile);
  unsubscribeSceneReady = OBR.scene.onReadyChange((ready) => {
    if (!ready) {
      previousInitiativeState = null;
      announcedActivationIds.clear();
      return;
    }
    enqueueReconcile();
  });
  enqueueReconcile();
  return true;
}

export function unmountEffectSaveReminderController() {
  unsubscribeMetadata?.();
  unsubscribeMetadata = null;
  unsubscribeSceneReady?.();
  unsubscribeSceneReady = null;
  previousInitiativeState = null;
  announcedActivationIds.clear();
  reconcileQueue = Promise.resolve();
  mounted = false;
}
