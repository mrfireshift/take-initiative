// Avvisi di reazione, lot R6 (docs/STUDIO_AVVISI_REAZIONE.md §6.14, decisions H1-H3): the GM's prompt on a player's
// screen, in the background page of every screen that is not the GM's. A small popover of its own, bottom centre
// (H1), apart from the turn notice: read only at the table (R6a), with Usa and Ignora for the player's own characters
// online (R6b). It closes with the GM's clear, or by itself after REACTION_NOTICE_TIMEOUT_MS.
import OBR from "@owlbear-rodeo/sdk";
import {
  REACTION_NOTICE_CHANNEL,
  REACTION_NOTICE_POPOVER_ID,
  REACTION_NOTICE_TIMEOUT_MS,
  normalizeReactionNotice,
  reactionNoticeHeight,
  reactionNoticeRowsFor,
} from "./reactionNoticeCore.js";

const NOTICE_WIDTH = 380;

let mounted = false;
let showingId = "";
let timer = null;
let queue = Promise.resolve();

async function closeNotice() {
  if (timer !== null) clearTimeout(timer);
  timer = null;
  if (!showingId) return;
  showingId = "";
  await OBR.popover.close(REACTION_NOTICE_POPOVER_ID).catch(() => {});
}

async function showNotice(notice) {
  let selfId = "";
  try { selfId = String(OBR.player.id || ""); } catch {}
  const { rows, interactive } = reactionNoticeRowsFor(notice, selfId);
  if (!rows.length) {
    if (showingId === notice.promptId) await closeNotice();
    return;
  }
  const [width, height] = await Promise.all([
    Promise.resolve(OBR.viewport.getWidth()).catch(() => 1200),
    Promise.resolve(OBR.viewport.getHeight()).catch(() => 800),
  ]);
  if (timer !== null) clearTimeout(timer);
  const payload = { ...notice, rows, interactive, selfId };
  await OBR.popover.open({
    id: REACTION_NOTICE_POPOVER_ID,
    url: `/reaction-notice.html?notice=${encodeURIComponent(JSON.stringify(payload))}`,
    width: NOTICE_WIDTH,
    height: reactionNoticeHeight(rows.length, interactive),
    anchorReference: "POSITION",
    anchorPosition: { left: Math.round((Number(width) || 1200) / 2), top: (Number(height) || 800) - 16 },
    anchorOrigin: { horizontal: "CENTER", vertical: "BOTTOM" },
    transformOrigin: { horizontal: "CENTER", vertical: "BOTTOM" },
    hidePaper: true,
    disableClickAway: true,
    marginThreshold: 8,
  });
  showingId = notice.promptId;
  timer = setTimeout(() => { queue = queue.then(closeNotice).catch(() => {}); }, REACTION_NOTICE_TIMEOUT_MS);
}

export function mountReactionNoticeHost() {
  if (mounted) return;
  mounted = true;
  void Promise.resolve(OBR.player.getRole()).then((role) => {
    if (role === "GM") return;
    OBR.broadcast.onMessage(REACTION_NOTICE_CHANNEL, (event) => {
      const notice = normalizeReactionNotice(event?.data);
      if (!notice || notice.type === "answer") return;
      queue = queue.then(() => (notice.type === "clear"
        ? (notice.promptId === showingId ? closeNotice() : undefined)
        : showNotice(notice))).catch((error) => console.warn("[reaction-notice] host:", error?.message || error));
    });
  }).catch(() => {});
}
