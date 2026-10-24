import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";

// Counterspell's popup (counterspell.html): opened in place of the cast by the spell panel, the 🪄 menu and the attack
// console, so the GM names what it counters before the slot and the reaction are spent.
export const COUNTERSPELL_POPOVER_ID = `${ID}/counterspell`;

export function counterspellPopoverUrl({ sourceId = "", quickActionId = "", slotLevel = null, slotSource = "" } = {}) {
  const query = new URLSearchParams({ source: String(sourceId || "") });
  if (quickActionId) query.set("quickAction", String(quickActionId));
  if (Number.isInteger(Number(slotLevel)) && Number(slotLevel) > 0) query.set("slotLevel", String(Number(slotLevel)));
  if (slotSource) query.set("slotSource", String(slotSource));
  return `/counterspell.html?${query}`;
}

export async function openCounterspellPopover(request = {}) {
  try { await OBR.popover.close(COUNTERSPELL_POPOVER_ID); } catch {}
  await OBR.popover.open({
    id: COUNTERSPELL_POPOVER_ID,
    url: counterspellPopoverUrl(request),
    width: 380,
    height: 500,
    anchorReference: "POSITION",
    anchorPosition: { left: 90, top: 70 },
    anchorOrigin: { horizontal: "LEFT", vertical: "TOP" },
    transformOrigin: { horizontal: "LEFT", vertical: "TOP" },
    disableClickAway: true,
    hidePaper: true,
  });
}
