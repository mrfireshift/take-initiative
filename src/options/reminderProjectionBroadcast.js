import OBR from "@owlbear-rodeo/sdk";
import { projectReminderNotices } from "./optionsProjection.js";
import { runtimeOptionsService, startRuntimeOptions } from "./optionsRuntime.js";
import { selectReminderProjectionPolicy } from "./optionsSelectors.js";

let reminderSenderIsGMPromise = null;

function reminderSenderIsGM() {
  if (reminderSenderIsGMPromise) return reminderSenderIsGMPromise;
  const pending = OBR.player.getRole()
    .then((role) => role === "GM")
    .catch(() => {
      if (reminderSenderIsGMPromise === pending) reminderSenderIsGMPromise = null;
      return false;
    });
  reminderSenderIsGMPromise = pending;
  return pending;
}

export async function sendProjectedReminderPayload(channel, payload = {}) {
  const [, isGM] = await Promise.all([
    startRuntimeOptions().catch(() => {}),
    reminderSenderIsGM(),
  ]);
  if (!isGM) {
    return { gm: 0, player: 0 };
  }
  const projection = runtimeOptionsService.get(selectReminderProjectionPolicy);
  const rawNotices = Array.isArray(payload.notices) ? payload.notices : [];
  const gmNotices = projectReminderNotices(rawNotices, {
    role: "GM",
    policy: projection.player,
    directResolution: projection.directResolution,
  });
  const playerNotices = projectReminderNotices(rawNotices, {
    role: "PLAYER",
    policy: projection.player,
    directResolution: projection.directResolution,
  });
  const deliveries = [];
  if (gmNotices.length) {
    deliveries.push(sendProjectedPayload(channel, payload, "LOCAL", gmNotices));
  }
  if (playerNotices.length) {
    deliveries.push(sendProjectedPayload(channel, payload, "REMOTE", playerNotices));
  }
  await Promise.all(deliveries);
  return { gm: gmNotices.length, player: playerNotices.length };
}

function sendProjectedPayload(channel, basePayload, destination, notices) {
  const payload = { ...basePayload, notices };
  let delivery;
  try {
    delivery = OBR.broadcast.sendMessage(channel, payload, { destination });
  } catch (error) {
    throw error;
  }
  if (!delivery || typeof delivery.then !== "function") {
    return delivery;
  }
  return delivery.then(() => {
    return undefined;
  }, (error) => {
    throw error;
  });
}
