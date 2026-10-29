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

// Lot L16: a token the GM keeps hidden leaves no trace with the players. In their copy a hidden target is dropped,
// and a notice whose source (caster, creature) is hidden is dropped whole; the GM gets every notice.
export function withoutHiddenTokenNotices(notices, hiddenIds) {
  const hidden = hiddenIds instanceof Set ? hiddenIds : new Set(hiddenIds || []);
  if (!hidden.size) return notices;
  return notices.flatMap((notice) => {
    if ([notice?.sourceId, notice?.casterId].some((id) => id && hidden.has(String(id)))) return [];
    if (notice?.target?.id && hidden.has(String(notice.target.id))) return [];
    if (!Array.isArray(notice?.targets)) return [notice];
    const targets = notice.targets.filter((target) => !hidden.has(String(target?.id || "")));
    if (!targets.length) return [];
    return [targets.length === notice.targets.length ? notice : { ...notice, targets }];
  });
}

function noticeTokenIds(notices) {
  const ids = new Set();
  for (const notice of notices) {
    for (const id of [notice?.sourceId, notice?.casterId, notice?.target?.id,
      ...(Array.isArray(notice?.targets) ? notice.targets.map((target) => target?.id) : [])]) {
      if (id) ids.add(String(id));
    }
  }
  return [...ids];
}

async function hiddenTokenIds(notices) {
  const ids = noticeTokenIds(notices);
  if (!ids.length) return new Set();
  try {
    const items = await OBR.scene.items.getItems(ids);
    return new Set(items.filter((item) => item?.visible === false).map((item) => item.id));
  } catch {
    return new Set();
  }
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
  const projectedPlayerNotices = projectReminderNotices(rawNotices, {
    role: "PLAYER",
    policy: projection.player,
    directResolution: projection.directResolution,
  });
  const playerNotices = projectedPlayerNotices.length
    ? withoutHiddenTokenNotices(projectedPlayerNotices, await hiddenTokenIds(projectedPlayerNotices))
    : projectedPlayerNotices;
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
