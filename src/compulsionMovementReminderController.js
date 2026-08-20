import OBR from "@owlbear-rodeo/sdk";
import {
  EFFECT_SAVE_REMINDER_NOTICE_CHANNEL,
  ID,
} from "./constants.js";
import { planCompulsionMovementReminderNotices } from "./compulsionMovementReminderCore.js";
import { currentSceneEpoch, isCurrentSceneEpoch, subscribeSceneEpoch } from "./sceneEpoch.js";
import { subscribeSceneItemChanges } from "./sceneItemEvents.js";
import { sendProjectedReminderPayload } from "./options/reminderProjectionBroadcast.js";

const STATE_KEY = `${ID}/state`;
const announcedActivationIds = new Set();
let mounted = false;
let unsubscribeMovement = null;
let unsubscribeEpoch = null;

async function handleMovement(event) {
  const sceneEpoch = event?.sceneEpoch ?? currentSceneEpoch();
  if (!isCurrentSceneEpoch(sceneEpoch)) return;

  const metadata = await OBR.scene.getMetadata().catch(() => ({}));
  if (!isCurrentSceneEpoch(sceneEpoch)) return;

  const notices = planCompulsionMovementReminderNotices({
    items: event?.allItems,
    changedRecords: event?.changedRecords,
    initiativeState: metadata?.[STATE_KEY] || null,
  }).filter((notice) => !announcedActivationIds.has(notice.activationId));
  if (!notices.length || !isCurrentSceneEpoch(sceneEpoch)) return;

  for (const notice of notices) announcedActivationIds.add(notice.activationId);
  if (announcedActivationIds.size > 500) {
    const recent = [...announcedActivationIds].slice(-250);
    announcedActivationIds.clear();
    for (const activationId of recent) announcedActivationIds.add(activationId);
  }

  await sendProjectedReminderPayload(
    EFFECT_SAVE_REMINDER_NOTICE_CHANNEL,
    { type: "show-effect-save-notices", notices },
  );
}

export async function mountCompulsionMovementReminderController() {
  if (mounted) return true;
  const role = await OBR.player.getRole().catch(() => "PLAYER");
  if (role !== "GM") return false;

  mounted = true;
  unsubscribeMovement = subscribeSceneItemChanges((event) => {
    void handleMovement(event).catch((error) => {
      console.warn("[compulsion] movement reminder:", error?.message || error);
    });
  }, {
    domains: ["movement"],
    filter: (event) => !event?.derived?.output,
  });
  unsubscribeEpoch = subscribeSceneEpoch(({ phase }) => {
    if (phase === "unload") announcedActivationIds.clear();
  });
  return true;
}

export function unmountCompulsionMovementReminderController() {
  unsubscribeMovement?.();
  unsubscribeMovement = null;
  unsubscribeEpoch?.();
  unsubscribeEpoch = null;
  announcedActivationIds.clear();
  mounted = false;
}
