import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { isDeathSaveReminderNotice } from "./options/optionsProjection.js";

// The death saves leave the shared reminder popover for a popup of their own (death-save-notice.html), on the GM's
// screen and, when the options let them, on the table screen. The notices arrive already projected for each side
// (reminderProjectionBroadcast.js): this host only routes them, one PC at a time, the latest turn first.
export const DEATH_SAVE_NOTICE_POPOVER_ID = `${ID}/death-save-notice`;
const POPOVER_WIDTH = 380;
const POPOVER_HEIGHT = 300;

const shownActivationIds = new Set();
let hostQueue = Promise.resolve();

export function splitDeathSaveNotices(payload) {
  const notices = Array.isArray(payload?.notices) ? payload.notices : [];
  const deathSaves = notices.filter(isDeathSaveReminderNotice);
  return {
    deathSaves,
    rest: deathSaves.length ? { ...payload, notices: notices.filter((notice) => !isDeathSaveReminderNotice(notice)) } : payload,
  };
}

async function openDeathSavePopover(notice) {
  const viewportWidth = Number(await OBR.viewport.getWidth().catch(() => 1200)) || 1200;
  const viewportHeight = Number(await OBR.viewport.getHeight().catch(() => 800)) || 800;
  await OBR.popover.close(DEATH_SAVE_NOTICE_POPOVER_ID).catch(() => {});
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
  hostQueue = hostQueue.then(() => openDeathSavePopover(latest)).catch((error) => {
    console.warn("[death-save-notice] open:", error?.message || error);
  });
  return hostQueue;
}
