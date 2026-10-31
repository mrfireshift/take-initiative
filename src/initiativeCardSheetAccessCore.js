import { isEpicActionId, isLairId } from "./initiativeSelectionProjectionCore.js";

// Who opens a creature's sheet from the tracker: anyone for a character or an ally; the GM for every other creature
// too (attacchi dei mostri, lotto 4: a monster's stat block is imported there, its attacks reach the console). Never a
// collapsed group, a Lair turn or an Epic Action slot.
// Lot U2 of the system UX audit: a character's or an ally's sheet; for any other creature it holds a stat block.
export function initiativeCardSheetLabel(entry) {
  return ["pc", "ally"].includes(entry?.attitude) ? "Scheda personaggio" : "Statblock";
}

export function canOpenInitiativeCardSheet(entry, { isGM = false } = {}) {
  if (!entry || entry.__groupCollapsed || isLairId(entry.id) || isEpicActionId(entry.id)) return false;
  if (isGM === true) return true;
  // A player's screen in the Online room profile: only their own character's sheet, the card assigned to them.
  if (entry.onlinePlayerView === true) return entry.assignedPlayer?.mine === true;
  return ["pc", "ally"].includes(entry.attitude);
}

// The reaction indicator: the GM marks it on any creature, the table screen shows it on PCs and allies. A player's
// screen in the Online room profile has no use for it.
export function showsReactionIndicator(entry, { isGM = false } = {}) {
  if (isGM === true) return true;
  return entry?.onlinePlayerView !== true && ["pc", "ally"].includes(entry?.attitude);
}
