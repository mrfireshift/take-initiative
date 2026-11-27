// Indomitable (27/11, Lorghoth the Decayer, Strahd Reloaded): "Lorghoth can repeat the saving throw against one effect
// or condition currently affecting him (no effect if it didn't originally require it to fail a saving throw)". The
// effects that allow it are the ones whose pill carries a save to repeat (saveReminder with an ability): the plugin knows
// their ability and DC, and the reminder's own resolution ends them on a success. Pure.
import { ID } from "./constants.js";
import { normalizeEffectSaveReminders } from "./effectSaveReminderCore.js";

const META_KEY = `${ID}/meta`;
const ABILITY_LABELS = Object.freeze({ str: "Forza", dex: "Destrezza", con: "Costituzione", int: "Intelligenza", wis: "Saggezza", cha: "Carisma" });

function instancesOf(item) {
  const conditions = item?.metadata?.[META_KEY]?.conditions;
  return Array.isArray(conditions) ? conditions : Array.isArray(conditions?.instances) ? conditions.instances : [];
}

/**
 * The effects on item a repeated save can end: [{ instanceId, label, ability, abilityLabel, dc, reminder }], dc null
 * when the reminder takes it from its source (dcSource). items: the scene's, for the source's spell save DC.
 */
export function repeatableSaveEffects(item, items = []) {
  const byId = new Map((Array.isArray(items) ? items : []).filter((entry) => entry?.id).map((entry) => [entry.id, entry]));
  const out = [];
  for (const instance of instancesOf(item)) {
    if (!instance || instance.active === false || !instance.id) continue;
    const reminder = normalizeEffectSaveReminders(instance.saveReminder).find((entry) => entry.ability && entry.success !== "keep-effect");
    if (!reminder) continue;
    const sourceDc = Number(byId.get(String(instance.sourceId || ""))?.metadata?.[META_KEY]?.initiativeCard?.spellSaveDC);
    const dc = Number.isInteger(reminder.dc) ? reminder.dc : reminder.dcSource === "source-spell" && Number.isFinite(sourceDc) ? sourceDc : null;
    out.push({
      instanceId: String(instance.id),
      label: String(instance.displayLabel || instance.spellName || instance.condition || "Effetto"),
      ability: reminder.ability,
      abilityLabel: ABILITY_LABELS[reminder.ability] || reminder.ability,
      dc,
      reminder,
    });
  }
  return out;
}
