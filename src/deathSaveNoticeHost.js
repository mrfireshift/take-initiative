import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { isDeathSaveReminderNotice } from "./options/optionsProjection.js";
import { historyReminderReplayWithdrawal } from "./historyReminderReplayCore.js";

// The death saves leave the shared reminder popover for a popup of their own (death-save-notice.html), on the GM's
// screen and, when the options let them, on the table screen. The notices arrive already projected for each side
// (reminderProjectionBroadcast.js): this host only routes them, one PC at a time, the latest turn first.
export const DEATH_SAVE_NOTICE_POPOVER_ID = `${ID}/death-save-notice`;
const POPOVER_WIDTH = 380;
const POPOVER_HEIGHT = 300;

const shownActivationIds = new Set();
let hostQueue = Promise.resolve();
// The death save in the popup now, and the ones the last History Undo reopened (historyReminderReplayCore.js).
let openActivationId = "";
let historyReplayActivationIds = new Set();

export function splitDeathSaveNotices(payload) {
  const notices = Array.isArray(payload?.notices) ? payload.notices : [];
  const deathSaves = notices.filter(isDeathSaveReminderNotice);
  return {
    deathSaves,
    rest: deathSaves.length ? { ...payload, notices: notices.filter((notice) => !isDeathSaveReminderNotice(notice)) } : payload,
  };
}

async function openDeathSavePopover(notice) {
  // The screen's size and the close of the previous popup at once (they do not depend on each other), then the open.
  const [reportedWidth, reportedHeight] = await Promise.all([
    OBR.viewport.getWidth().catch(() => 1200),
    OBR.viewport.getHeight().catch(() => 800),
    OBR.popover.close(DEATH_SAVE_NOTICE_POPOVER_ID).catch(() => {}),
  ]);
  const viewportWidth = Number(reportedWidth) || 1200;
  const viewportHeight = Number(reportedHeight) || 800;
  await OBR.popover.open({
    id: DEATH_SAVE_NOTICE_POPOVER_ID,
    url: `/death-save-notice.html?payload=${encodeURIComponent(JSON.stringify({ notice }))}`,
    width: POPOVER_WIDTH,
    height: POPOVER_HEIGHT,
    anchorReference: "POSITION",
    anchorPosition: { left: viewportWidth / 2, top: Math.max(12, Math.round(viewportHeight * 0.18)) },
    anchorOrigin: { horizontal: "CENTER", vertical: "TOP" },
    transformOrigin: { horizontal: "CENTER", vertical: "TOP" },
    hidePaper: true,
    disableClickAway: true,
    marginThreshold: 12,
  });
}

// Shown once per activation: a later reconcile of the same turn does not reopen it; an Undo that re-arms the
// reminder (rearmActivationIds) does.
export function receiveDeathSaveNotices(notices, rearmActivationIds = []) {
  const rearmed = new Set((Array.isArray(rearmActivationIds) ? rearmActivationIds : []).map((id) => String(id || "")));
  const fresh = (Array.isArray(notices) ? notices : []).filter((notice) => {
    const activationId = String(notice?.activationId || "").trim();
    return activationId && (!shownActivationIds.has(activationId) || rearmed.has(activationId));
  });
  const latest = fresh.at(-1);
  if (!latest) return hostQueue;
  for (const notice of fresh) shownActivationIds.add(String(notice.activationId));
  hostQueue = hostQueue.then(() => {
    openActivationId = String(latest.activationId);
    return openDeathSavePopover(latest);
  }).catch((error) => {
    console.warn("[death-save-notice] open:", error?.message || error);
  });
  return hostQueue;
}

// A History Undo: the death save the previous Undo reopened closes, unless this Undo reopens it.
export function withdrawHistoryReplayDeathSaves(data) {
  const withdrawal = historyReminderReplayWithdrawal(historyReplayActivationIds, data);
  if (!withdrawal) return hostQueue;
  historyReplayActivationIds = withdrawal.next;
  if (!openActivationId || !withdrawal.withdraw.includes(openActivationId)) return hostQueue;
  openActivationId = "";
  hostQueue = hostQueue.then(() => OBR.popover.close(DEATH_SAVE_NOTICE_POPOVER_ID)).catch(() => {});
  return hostQueue;
}
