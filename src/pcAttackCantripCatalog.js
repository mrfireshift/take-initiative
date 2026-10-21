// Attack cantrips (C1): one "Trucchetto" quick action per actor, the cantrip is picked in the attack console.
// A closed, curated table: the spell catalog has no structured dice for cantrips, so the values below are
// read from the printed texts (PHB 2014, Xanathar) and checked by test/pcAttackCantripCatalog.test.js
// against the catalog ids. No imports: the quick action sanitizer and the tracker menu stay light.

export const PC_ATTACK_CANTRIP_CATALOG_VERSION = 1;

// scaling "dice": the damage dice grow at character levels 5/11/17. "beams": the dice stay, the number of
// beams grows (Eldritch Blast: one registration per beam). effectNote: what a hit also does, applied by hand
// (or from the spell panel) until the on-hit effects are automated.
export const PC_ATTACK_CANTRIPS = Object.freeze([
  Object.freeze({ spellId: "fire-bolt", name: "Dardo di fuoco", range: "ranged", type: "fire", dice: "1d10", scaling: "dice",
    effectNote: "Un oggetto infiammabile non indossato né trasportato prende fuoco." }),
  Object.freeze({ spellId: "eldritch-blast", name: "Deflagrazione occulta", range: "ranged", type: "force", dice: "1d10", scaling: "beams" }),
  Object.freeze({ spellId: "chill-touch", name: "Tocco gelido", range: "ranged", type: "necrotic", dice: "1d8", scaling: "dice",
    effectNote: "Non può recuperare PF fino all'inizio del prossimo turno dell'incantatore; un non morto ha anche svantaggio ai tiri per colpire contro di lui." }),
  Object.freeze({ spellId: "ray-of-frost", name: "Raggio di gelo", range: "ranged", type: "cold", dice: "1d8", scaling: "dice",
    effectNote: "Velocità ridotta di 3 metri fino all'inizio del prossimo turno dell'incantatore." }),
  Object.freeze({ spellId: "shocking-grasp", name: "Stretta folgorante", range: "melee", type: "lightning", dice: "1d8", scaling: "dice",
    effectNote: "Non può effettuare reazioni fino all'inizio del suo prossimo turno. Vantaggio al tiro per colpire contro un'armatura di metallo." }),
  Object.freeze({ spellId: "produce-flame", name: "Produrre fiamma", range: "ranged", type: "fire", dice: "1d8", scaling: "dice" }),
  Object.freeze({ spellId: "phb2014-frusta-di-spine", name: "Frusta di Spine", range: "melee", type: "piercing", dice: "1d6", scaling: "dice",
    effectNote: "Se è di taglia Grande o inferiore, l'incantatore può trascinarla fino a 3 metri verso di sé." }),
  Object.freeze({ spellId: "xanathar-ferocia-primordiale", name: "Ferocia Primordiale", range: "melee", type: "acid", dice: "1d10", scaling: "dice" }),
]);

const CANTRIP_BY_ID = new Map(PC_ATTACK_CANTRIPS.map((cantrip) => [cantrip.spellId, cantrip]));

export function getPcAttackCantrip(spellId) {
  return CANTRIP_BY_ID.get(String(spellId || "")) || null;
}

// How many times the cantrip's base effect applies at this character level: 1, 2 at 5th, 3 at 11th, 4 at 17th.
export function pcAttackCantripTier(characterLevel) {
  const level = Math.floor(Number(characterLevel) || 0);
  return level >= 17 ? 4 : level >= 11 ? 3 : level >= 5 ? 2 : 1;
}

// The dice the GM rolls for one attack with this cantrip ("2d10"); Eldritch Blast keeps 1d10 per beam.
export function pcAttackCantripDice(cantrip, characterLevel) {
  if (!cantrip) return null;
  if (cantrip.scaling !== "dice") return cantrip.dice;
  const [, count, sides] = /^(\d+)d(\d+)$/u.exec(cantrip.dice) || [];
  return count ? `${Number(count) * pcAttackCantripTier(characterLevel)}d${sides}` : cantrip.dice;
}

// Eldritch Blast: the beams this caster fires (each beam is its own attack roll and registration).
export function pcAttackCantripBeams(cantrip, characterLevel) {
  return cantrip?.scaling === "beams" ? pcAttackCantripTier(characterLevel) : 1;
}
