import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { openTrackedPopover } from "./popoverDragHost.js";

// Counterspell's popup (counterspell.html): opened in place of the cast by the spell panel, the 🪄 menu and the attack
// console, so the GM names what it counters before the slot and the reaction are spent.
export const COUNTERSPELL_POPOVER_ID = `${ID}/counterspell`;
// Avvisi di reazione, lot R2: the popup opened from a reaction prompt says how it ended to the spell panel that waits
// (LOCAL broadcast): { requestId, outcome: "countered" | "failed" | "closed" }.
export const COUNTERSPELL_RESULT_CHANNEL = `${ID}/counterspell-result`;

// targetId, spellId, spellLevel, requestId (lot R2): the cast that triggered the reaction, filled in for the GM.
export function counterspellPopoverUrl({
  sourceId = "", quickActionId = "", slotLevel = null, slotSource = "", targetId = "", spellId = "", spellLevel = null, requestId = "",
} = {}) {
  const query = new URLSearchParams({ source: String(sourceId || "") });
  if (quickActionId) query.set("quickAction", String(quickActionId));
  if (Number.isInteger(Number(slotLevel)) && Number(slotLevel) > 0) query.set("slotLevel", String(Number(slotLevel)));
  if (slotSource) query.set("slotSource", String(slotSource));
  if (targetId) query.set("target", String(targetId));
  if (spellId) query.set("spell", String(spellId));
  if (spellLevel !== null && spellLevel !== "" && Number.isInteger(Number(spellLevel)) && Number(spellLevel) >= 0 && Number(spellLevel) <= 9) {
    query.set("spellLevel", String(Number(spellLevel)));
  }
  if (requestId) query.set("request", String(requestId));
  return `/counterspell.html?${query}`;
}

export async function openCounterspellPopover(request = {}) {
  try { await OBR.popover.close(COUNTERSPELL_POPOVER_ID); } catch {}
  await openTrackedPopover({
    id: COUNTERSPELL_POPOVER_ID,
    url: counterspellPopoverUrl(request),
    width: 380,
    height: 470,
    anchorReference: "POSITION",
    anchorPosition: { left: 90, top: 70 },
    anchorOrigin: { horizontal: "LEFT", vertical: "TOP" },
    transformOrigin: { horizontal: "LEFT", vertical: "TOP" },
    disableClickAway: true,
    hidePaper: true,
  });
}
