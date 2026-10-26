import { isEpicActionId, isLairId } from "./initiativeSelectionProjectionCore.js";

// Who opens a creature's sheet from the tracker: anyone for a character or an ally; the GM for every other creature
// too (attacchi dei mostri, lotto 4: a monster's stat block is imported there, its attacks reach the console). Never a
// collapsed group, a Lair turn or an Epic Action slot.
export function canOpenInitiativeCardSheet(entry, { isGM = false } = {}) {
  if (!entry || entry.__groupCollapsed || isLairId(entry.id) || isEpicActionId(entry.id)) return false;
  return ["pc", "ally"].includes(entry.attitude) || isGM === true;
}
