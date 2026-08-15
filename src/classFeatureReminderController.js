import OBR from "@owlbear-rodeo/sdk";
import { sendProjectedReminderPayload } from "./options/reminderProjectionBroadcast.js";
import {
  EFFECT_SAVE_REMINDER_NOTICE_CHANNEL,
  ID,
} from "./constants.js";
import { currentInitiativeTurnKey } from "./turnBoundaryCore.js";
import { subscribeSceneItemChanges } from "./sceneItemEvents.js";
import { currentSceneEpoch, isCurrentSceneEpoch } from "./sceneEpoch.js";
import { createSceneMetadataKeyWatcher } from "./sceneMetadataDigest.js";
import {
  relentlessRageNotice,
  shouldAnnounceRelentlessRage,
} from "./classFeatureReminderCore.js";

const STATE_KEY = `${ID}/state`;
let mounted = false;
let unsubscribeItems = null;
let unsubscribeMetadata = null;
let unsubscribeSceneReady = null;
const zeroHPItems = new Set();
let noticeSequence = 0;
let initiativeStateSnapshot = {};
const stateMetadataWatcher = createSceneMetadataKeyWatcher(STATE_KEY);

function sceneTurnSnapshot() {
  const state = initiativeStateSnapshot || {};
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
  await sendProjectedReminderPayload(
    EFFECT_SAVE_REMINDER_NOTICE_CHANNEL,
    { type: "show-effect-save-notices", notices },
  );
}

export async function mountClassFeatureReminderController() {
  if (mounted) return true;
  const role = await OBR.player.getRole().catch(() => "PLAYER");
  if (role !== "GM") return false;
  mounted = true;
  const updateInitiativeState = (metadata, seed = false) => {
    const sceneEpoch = currentSceneEpoch();
    if (!isCurrentSceneEpoch(sceneEpoch)) return;
    const observed = seed || !stateMetadataWatcher.initialized
      ? stateMetadataWatcher.seed(metadata)
      : stateMetadataWatcher.observe(metadata);
    initiativeStateSnapshot = observed.value && typeof observed.value === "object"
      ? observed.value
      : {};
  };
  unsubscribeMetadata = OBR.scene.onMetadataChange((metadata) => {
    updateInitiativeState(metadata);
  });
  unsubscribeSceneReady = OBR.scene.onReadyChange((ready) => {
    if (!ready) {
      zeroHPItems.clear();
      initiativeStateSnapshot = {};
      stateMetadataWatcher.reset();
      return;
    }
    void OBR.scene.getMetadata().then((metadata) => {
      updateInitiativeState(metadata, true);
    }).catch(() => {});
  });
  try {
    const metadata = await OBR.scene.getMetadata();
    updateInitiativeState(metadata, true);
  } catch {}
  unsubscribeItems = subscribeSceneItemChanges((event) => {
    void reconcileRelentlessRageReminders(event).catch((error) => {
      console.warn("[class-feature-reminder] reconcile:", error?.message || error);
    });
  }, { immediate: true, domains: ["hp"] });
  return true;
}

export function unmountClassFeatureReminderController() {
  unsubscribeItems?.();
  unsubscribeItems = null;
  unsubscribeMetadata?.();
  unsubscribeMetadata = null;
  unsubscribeSceneReady?.();
  unsubscribeSceneReady = null;
  zeroHPItems.clear();
  noticeSequence = 0;
  initiativeStateSnapshot = {};
  stateMetadataWatcher.reset();
  mounted = false;
}
