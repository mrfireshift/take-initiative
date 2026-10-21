// Attack cantrips (C1: attack rolls, C2: single-target saves): one "Trucchetto" quick action per actor, the cantrip
// is picked in the attack console.
// A closed, curated table: the spell catalog has no structured dice for cantrips, so the values below are
// read from the printed texts (PHB 2014, Xanathar) and checked by test/pcAttackCantripCatalog.test.js
// against the catalog ids. No imports: the quick action sanitizer and the tracker menu stay light.

export const PC_ATTACK_CANTRIP_CATALOG_VERSION = 1;

// scaling "dice": the damage dice grow at character levels 5/11/17. "beams": the dice stay, the number of
// beams grows (Eldritch Blast: one registration per beam). The pills a hit (or a failed save) applies come from
// the spell catalog (SPELL_EFFECTS / SPELL_EXPIRY) through the spell pipeline: they are not repeated here.
// effectNote: what a hit (or a failed save) also does that no pill represents (a move on the map, an object set
// on fire), left to the GM and recorded as such. ruleNote: a rule to know before rolling, shown as it is.
export const PC_ATTACK_CANTRIPS = Object.freeze([
  Object.freeze({ spellId: "fire-bolt", name: "Dardo di fuoco", range: "ranged", type: "fire", dice: "1d10", scaling: "dice",
    effectNote: "Un oggetto infiammabile non indossato né trasportato prende fuoco." }),
  Object.freeze({ spellId: "eldritch-blast", name: "Deflagrazione occulta", range: "ranged", type: "force", dice: "1d10", scaling: "beams" }),
  Object.freeze({ spellId: "chill-touch", name: "Tocco gelido", range: "ranged", type: "necrotic", dice: "1d8", scaling: "dice",
    effectNote: "Se è un non morto: svantaggio ai tiri per colpire contro l'incantatore fino alla fine del prossimo turno dell'incantatore." }),
  Object.freeze({ spellId: "ray-of-frost", name: "Raggio di gelo", range: "ranged", type: "cold", dice: "1d8", scaling: "dice" }),
  Object.freeze({ spellId: "shocking-grasp", name: "Stretta folgorante", range: "melee", type: "lightning", dice: "1d8", scaling: "dice",
    ruleNote: "Vantaggio al tiro per colpire contro un bersaglio con armatura di metallo." }),
  Object.freeze({ spellId: "produce-flame", name: "Produrre fiamma", range: "ranged", type: "fire", dice: "1d8", scaling: "dice" }),
  Object.freeze({ spellId: "phb2014-frusta-di-spine", name: "Frusta di Spine", range: "melee", type: "piercing", dice: "1d6", scaling: "dice",
    effectNote: "Se è di taglia Grande o inferiore, l'incantatore può trascinarla fino a 3 metri verso di sé." }),
  Object.freeze({ spellId: "xanathar-ferocia-primordiale", name: "Ferocia Primordiale", range: "melee", type: "acid", dice: "1d10", scaling: "dice" }),
  // C2: single-target saving throw cantrips. The target saves (save: ability); a failure takes the damage,
  // a success takes none (no cantrip halves it). Toll the Dead uses diceIfDamaged when the target is hurt.
  Object.freeze({ spellId: "sacred-flame", name: "Fiamma sacra", delivery: "save", save: "dex", range: "ranged", type: "radiant", dice: "1d8", scaling: "dice",
    ruleNote: "Il bersaglio non trae beneficio dalla copertura per questo tiro salvezza." }),
  Object.freeze({ spellId: "vicious-mockery", name: "Beffa crudele", delivery: "save", save: "wis", range: "ranged", type: "psychic", dice: "1d4", scaling: "dice" }),
  Object.freeze({ spellId: "poison-spray", name: "Spruzzo velenoso", delivery: "save", save: "con", range: "ranged", type: "poison", dice: "1d12", scaling: "dice" }),
  Object.freeze({ spellId: "acid-splash", name: "Fiotto acido", delivery: "save", save: "dex", range: "ranged", type: "acid", dice: "1d6", scaling: "dice",
    ruleNote: "Un secondo bersaglio entro 1,5 metri dal primo: registralo a parte con lo stesso tiro di danno." }),
  Object.freeze({ spellId: "xanathar-rintocco-dei-morti", name: "Rintocco dei Morti", delivery: "save", save: "wis", range: "ranged", type: "necrotic",
    dice: "1d8", diceIfDamaged: "1d12", scaling: "dice" }),
  Object.freeze({ spellId: "xanathar-infestazione", name: "Infestazione", delivery: "save", save: "con", range: "ranged", type: "poison", dice: "1d6", scaling: "dice",
    effectNote: "Si muove di 1,5 metri in una direzione casuale (d4: 1 nord, 2 sud, 3 est, 4 ovest), senza provocare attacchi di opportunità." }),
  Object.freeze({ spellId: "xanathar-morsa-del-gelo", name: "Morsa del Gelo", delivery: "save", save: "con", range: "ranged", type: "cold", dice: "1d6", scaling: "dice" }),
  Object.freeze({ spellId: "tasha-scheggia-della-mente", name: "Scheggia della Mente", delivery: "save", save: "int", range: "ranged", type: "psychic", dice: "1d6", scaling: "dice" }),
  Object.freeze({ spellId: "tasha-lenza-elettrizzante", name: "Lenza Elettrizzante", delivery: "save", save: "str", range: "ranged", type: "lightning", dice: "1d8", scaling: "dice",
    effectNote: "Trascinato fino a 3 metri verso l'incantatore; subisce il danno solo se arriva entro 1,5 metri da lui (altrimenti registra 0)." }),
  // C4: cantrips cast as part of a melee weapon attack. They are not picked in the cantrip console: a melee weapon
  // attack offers them when the actor knows them (ticked in a cantrip quick action, or that action offers all).
  // From 5th level the hit deals hitDice extra; Booming Blade leaves a pill whose movement damage is triggerDice;
  // Green-Flame Blade jumps to a second creature: spellcasting modifier (+ secondaryDice from 5th level).
  Object.freeze({ spellId: "tasha-lama-roboante", name: "Lama Roboante", delivery: "weapon", type: "thunder", dice: "1d8", scaling: "weapon",
    trigger: true }),
  Object.freeze({ spellId: "tasha-lama-verdefiamma", name: "Lama Verdefiamma", delivery: "weapon", type: "fire", dice: "1d8", scaling: "weapon",
    secondary: true }),
  // 3C: area cantrips around the caster. One damage roll, a save for each creature in the area (no damage on a success,
  // half with Potent Cantrip). area.radiusFeet: the emanation the console proposes its creatures from; chosen: the
  // caster picks among them (Word of Radiance), otherwise every creature but the caster is hit, allies included.
  Object.freeze({ spellId: "xanathar-parola-radiosa", name: "Parola Radiosa", delivery: "area", save: "con", range: "melee", type: "radiant",
    dice: "1d6", scaling: "dice", area: Object.freeze({ radiusFeet: 5, chosen: true }),
    ruleNote: "Solo le creature che scegli, entro 1,5 metri, che puoi vedere." }),
  Object.freeze({ spellId: "xanathar-rombo-di-tuono", name: "Rombo di Tuono", delivery: "area", save: "con", range: "melee", type: "thunder",
    dice: "1d6", scaling: "dice", area: Object.freeze({ radiusFeet: 5 }),
    ruleNote: "Ogni creatura entro 1,5 metri, alleati compresi; il rombo si sente fino a 30 metri." }),
  Object.freeze({ spellId: "tasha-turbine-di-spade", name: "Turbine di Spade", delivery: "area", save: "dex", range: "melee", type: "force",
    dice: "1d6", scaling: "dice", area: Object.freeze({ radiusFeet: 5 }),
    ruleNote: "Ogni creatura entro 1,5 metri, alleati compresi." }),
  // Create Bonfire: a lasting zone with concentration and a save on entering it, the spell panel's job (it already
  // places and tracks it). The cantrip console points there.
  Object.freeze({ spellId: "xanathar-creare-falo", name: "Creare Falò", delivery: "panel", type: "fire", dice: "1d8", scaling: "dice" }),
]);

// Booming Blade / Green-Flame Blade at this character level: the extra dice on the hit (none before 5th), the
// movement damage of Booming Blade's pill, the second creature's dice of Green-Flame Blade (plus the modifier).
export function pcAttackWeaponCantripDice(cantrip, characterLevel) {
  if (cantrip?.delivery !== "weapon") return null;
  const tier = pcAttackCantripTier(characterLevel);
  const [, , sides] = /^(\d+)d(\d+)$/u.exec(cantrip.dice) || [];
  const dice = (count) => (count > 0 ? `${count}d${sides}` : "");
  return {
    hit: dice(tier - 1),
    ...(cantrip.trigger ? { trigger: dice(tier) } : {}),
    ...(cantrip.secondary ? { secondary: tier > 1 ? `${dice(tier - 1)} + mod.` : "mod." } : {}),
  };
}

export const PC_ATTACK_SAVE_LABELS = Object.freeze({ str: "Forza", dex: "Destrezza", con: "Costituzione", int: "Intelligenza", wis: "Saggezza", cha: "Carisma" });

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
// targetDamaged: Toll the Dead rolls its larger die against a creature missing hit points.
export function pcAttackCantripDice(cantrip, characterLevel, { targetDamaged = false } = {}) {
  if (!cantrip) return null;
  const base = targetDamaged && cantrip.diceIfDamaged ? cantrip.diceIfDamaged : cantrip.dice;
  if (cantrip.scaling !== "dice") return base;
  const [, count, sides] = /^(\d+)d(\d+)$/u.exec(base) || [];
  return count ? `${Number(count) * pcAttackCantripTier(characterLevel)}d${sides}` : base;
}

// Eldritch Blast: the beams this caster fires (each beam is its own attack roll and registration).
export function pcAttackCantripBeams(cantrip, characterLevel) {
  return cantrip?.scaling === "beams" ? pcAttackCantripTier(characterLevel) : 1;
}
