// Hurl beyond the edge: the DEX save as a reminder on the "Appeso al bordo" pill. A success keeps the
// creature hanging (the pill stays); a failure means it falls (the pill goes, the fall is the GM's).
import { buildEffectSaveReminderResolution } from "./reminderResolutionCore.js";
import { ID } from "./constants.js";

const META_KEY = `${ID}/meta`;
const ABILITY_LABELS = { str: "FOR", dex: "DES", con: "COS", int: "INT", wis: "SAG", cha: "CAR" };

function conditionInstances(item) {
  const value = item?.metadata?.[META_KEY]?.conditions;
  return Array.isArray(value) ? value : Array.isArray(value?.instances) ? value.instances : [];
}

export function bossEdgeSaveNotice({ item = null, edge = null, sourceName = "", activationId = "" } = {}) {
  const instance = conditionInstances(item).find((entry) => entry?.id === edge?.instanceId && entry.active !== false);
  if (!item?.id || !instance || !edge?.save) return null;
  const ability = String(edge.save.ability || "dex");
  const dc = Number(edge.save.dc);
  const label = `Oltre il bordo: TS ${ABILITY_LABELS[ability] || ability.toUpperCase()} CD ${dc}. Fallimento: precipita. Successo: resta appeso.`;
  const resolution = buildEffectSaveReminderResolution({
    item,
    instance,
    reminder: { ability, label, success: "keep-effect", resolution: { ability, dc, success: "keep-effect", failure: "remove-effect" } },
    dc,
    activationId,
  });
  if (!resolution) return null;
  return {
    activationId,
    effectName: edge.name || "Appeso al bordo",
    spellName: edge.name || "Appeso al bordo",
    saveLabel: `TS ${ABILITY_LABELS[ability] || ability.toUpperCase()} CD ${dc}`,
    instruction: label,
    timing: "damage",
    ability: ABILITY_LABELS[ability] || ability.toUpperCase(),
    dc,
    ...(sourceName ? { sourceName: String(sourceName).slice(0, 100) } : {}),
    kind: "effect-save",
    resolution,
    target: { id: item.id, name: String(item.name || "Token").slice(0, 100), portrait: String(item?.image?.url || "").slice(0, 2048) },
  };
}
