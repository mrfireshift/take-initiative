export const INITIATIVE_LAIR_ID = "__LAIR__";
export const INITIATIVE_EPIC_ACTION_PREFIX = "__EPIC__";

export function isLairId(id) {
  return id === INITIATIVE_LAIR_ID;
}

export function isEpicActionId(id) {
  return typeof id === "string" && id.startsWith(INITIATIVE_EPIC_ACTION_PREFIX);
}

// Virtual Paragon IDs preserve the historical "<baseId>::p<k>" contract.
export function isParagonVirtualId(id) {
  return typeof id === "string" && id.includes("::p");
}

export function splitParagonId(id) {
  if (!isParagonVirtualId(id)) return { baseId: id, idx: 0 };
  const [baseId, tail] = id.split("::p");
  const idx = Math.max(0, parseInt(tail, 10) || 0);
  return { baseId, idx };
}

export function selectionIdsForEntry(entry) {
  const members = Array.isArray(entry?.__groupMembers) && entry.__groupMembers.length
    ? entry.__groupMembers
    : [entry];
  return Array.from(new Set(members
    .map((member) => splitParagonId(member?.id).baseId)
    .filter((id) => id && !isLairId(id) && !isEpicActionId(id))));
}
