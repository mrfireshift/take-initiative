import OBR from "@owlbear-rodeo/sdk";
import {
  EFFECT_SAVE_REMINDER_NOTICE_CHANNEL,
  ID,
} from "./constants.js";
import { currentInitiativeTurnKey } from "./turnBoundaryCore.js";
import { subscribeSceneItemChanges } from "./sceneItemEvents.js";
import {
  relentlessRageNotice,
  shouldAnnounceRelentlessRage,
} from "./classFeatureReminderCore.js";

const STATE_KEY = `${ID}/state`;
let mounted = false;
let unsubscribeItems = null;
const zeroHPItems = new Set();
let noticeSequence = 0;

async function sceneTurnSnapshot() {
  const metadata = await OBR.scene.getMetadata().catch(() => ({}));
  const state = metadata?.[STATE_KEY] || {};
  return {
    round: Math.max(1, Math.floor(Number(state.round) || 1)),
    turnKey: currentInitiativeTurnKey(state),
  };
}

async function reconcileRelentlessRageReminders(event) {
  const turn = await sceneTurnSnapshot();
  const notices = [];
  for (const record of event?.changedRecords || []) {
    const beforeItem = record?.before?.item;
    const afterItem = record?.after?.item;
    const itemId = String(afterItem?.id || beforeItem?.id || "").trim();
    if (!itemId || afterItem?.layer !== "CHARACTER" || afterItem?.attachedTo) continue;

    const afterHP = Number(afterItem?.metadata?.[`${ID}/meta`]?.hp);
    if (Number.isFinite(afterHP) && afterHP > 0) {
      zeroHPItems.delete(itemId);
      continue;
    }
    if (zeroHPItems.has(itemId)) continue;
    if (!shouldAnnounceRelentlessRage({
      beforeItem,
      afterItem,
      currentRound: turn.round,
    })) continue;

    zeroHPItems.add(itemId);
    const notice = relentlessRageNotice({
      item: afterItem,
      activationId: `relentless-rage:${itemId}:${++noticeSequence}`,
      turnKey: turn.turnKey,
    });
    if (notice) notices.push(notice);
  }
  if (!notices.length) return;
  await OBR.broadcast.sendMessage(
    EFFECT_SAVE_REMINDER_NOTICE_CHANNEL,
    { type: "show-effect-save-notices", notices },
    { destination: "ALL" },
  );
}

export async function mountClassFeatureReminderController() {
  if (mounted) return true;
  const role = await OBR.player.getRole().catch(() => "PLAYER");
  if (role !== "GM") return false;
  mounted = true;
  unsubscribeItems = subscribeSceneItemChanges((event) => {
    void reconcileRelentlessRageReminders(event).catch((error) => {
      console.warn("[class-feature-reminder] reconcile:", error?.message || error);
    });
  }, { immediate: true });
  return true;
}

export function unmountClassFeatureReminderController() {
  unsubscribeItems?.();
  unsubscribeItems = null;
  zeroHPItems.clear();
  noticeSequence = 0;
  mounted = false;
}
