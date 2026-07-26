import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { openTrackedPopover } from "./popoverDragHost.js";

export const REFERENCE_POPUP_ID = `${ID}/reference-modal`;
const TRACKER_POPOVER_TOGGLE_CHANNEL = `${ID}/tracker-popover-toggle`;

async function getReferenceAnchor() {
  let trackerWidth = 340;
  try { trackerWidth = Math.max(240, Number(await OBR.action.getWidth()) || trackerWidth); } catch {}
  const viewportWidth = Math.max(
    Number(window.innerWidth) || 0,
    Number(document.documentElement?.getBoundingClientRect?.().width) || 0,
    Number(document.body?.getBoundingClientRect?.().width) || 0,
  );
  return {
    left: Math.ceil(Math.max(trackerWidth, viewportWidth)) + 14,
    top: 52,
  };
}

export async function openReferencePopover({
  tab = "conditions",
  entry = "",
  closeId = "",
  anchorPosition = null,
} = {}) {
  if (closeId && closeId !== REFERENCE_POPUP_ID) {
    await OBR.popover.close(closeId).catch(() => {});
  }
  try { await OBR.modal.close(REFERENCE_POPUP_ID); } catch {}
  try { await OBR.popover.close(REFERENCE_POPUP_ID); } catch {}

  const params = new URLSearchParams();
  if (tab === "spells") params.set("tab", "spells");
  if (entry) params.set("entry", entry);
  const query = params.toString();

  await openTrackedPopover({
    id: REFERENCE_POPUP_ID,
    url: `/reference-modal.html${query ? `?${query}` : ""}`,
    width: 680,
    height: 650,
    anchorReference: "POSITION",
    anchorPosition: anchorPosition || await getReferenceAnchor(),
    anchorOrigin: { horizontal: "LEFT", vertical: "TOP" },
    transformOrigin: { horizontal: "LEFT", vertical: "TOP" },
    disableClickAway: true,
    marginThreshold: 12,
    hidePaper: true,
  });
  void OBR.broadcast.sendMessage(TRACKER_POPOVER_TOGGLE_CHANNEL, {
    type: "opened",
    id: REFERENCE_POPUP_ID,
  }, { destination: "LOCAL" }).catch(() => {});
}
