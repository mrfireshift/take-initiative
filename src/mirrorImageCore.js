import { ID } from "./constants.js";
import { abilityModifier } from "./abilityModifiersCore.js";

// Mirror Image (PHB 2014) where an attack is recorded (lotto C): the creature attacked keeps duplicates, the attacker
// rolls a d20 to aim at one instead (6 or more with three, 8 with two, 11 with one). A duplicate's AC is 10 + the
// caster's Dexterity modifier; an attack that hits it destroys it. The consoles show it on the target and destroy a
// duplicate with the spell's own action (spellInstanceActionRunner.js).
const META_KEY = `${ID}/meta`;
const SPELLS_KEY = `${ID}/spells`;

export const MIRROR_IMAGE_SPELL_ID = "mirror-image";
export const MIRROR_IMAGE_DESTROY_ACTION_ID = "mirror-image-duplicate-destroyed";
const THRESHOLDS = Object.freeze({ 3: 6, 2: 8, 1: 11 });

export function mirrorImageThreshold(duplicates) {
  const count = Math.max(0, Math.min(3, Math.floor(Number(duplicates) || 0)));
  return THRESHOLDS[count] || null;
}

// The duplicates of the creature itself (the caster is the target of its own Mirror Image), null without any left.
export function mirrorImageState(item) {
  const meta = item?.metadata?.[META_KEY] || {};
  const spells = Array.isArray(meta[SPELLS_KEY]) ? meta[SPELLS_KEY] : [];
  const entry = spells.find((spell) => (
    String(spell?.spellId || "").trim() === MIRROR_IMAGE_SPELL_ID
    && String(spell?.instanceId || "").trim()
    && (!spell?.casterId || String(spell.casterId) === String(item?.id || ""))
    && Number(spell?.castContext?.uses?.remaining) > 0
  ));
  if (!entry) return null;
  const remaining = Math.floor(Number(entry.castContext.uses.remaining));
  const dex = abilityModifier(meta.initiativeCard?.abilityModifiers, "dex");
  return {
    instanceId: String(entry.instanceId).trim(),
    remaining,
    threshold: mirrorImageThreshold(remaining),
    armorClass: Number.isFinite(dex) ? 10 + dex : null,
  };
}

export function mirrorImageNotice(state) {
  if (!state) return "";
  const duplicates = `${state.remaining} ${state.remaining === 1 ? "duplicato" : "duplicati"}`;
  const ac = state.armorClass === null ? "CA 10 + Des del caster" : `CA ${state.armorClass}`;
  return `Immagine speculare: ${duplicates}. Tira un d20: con ${state.threshold} o più l'attacco bersaglia un duplicato`
    + ` (${ac}); se lo colpisce, il duplicato è distrutto e il caster non subisce nulla.`;
}
