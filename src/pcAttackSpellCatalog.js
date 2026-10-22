// Leveled attack spells (lotto L4): one "Incantesimo d'attacco" quick action per caster, the spell and its slot are
// picked in the attack console, like the cantrips of pcAttackCantripCatalog.js.
// A closed, curated table: the values are read from the printed texts (PHB 2014, Xanathar, the PHB 2014 extras)
// and checked by test/pcAttackSpellCatalog.test.js against the catalog ids and levels. No imports: the quick action
// sanitizer and the tracker menu stay light.

export const PC_ATTACK_SPELL_CATALOG_VERSION = 1;

// dice: the damage at the spell's level; perSlot: the die added for each slot level above it. count: the rays or
// darts of one cast (base, + perSlot for each slot level above), each its own registration. types: the damage
// type is chosen for each attack (Chromatic Orb), in the order of the text (Chaos Bolt: its d8 table).
// delivery "auto": the darts hit without an attack roll. leap: Chaos Bolt's energy leaps to another creature within
// radiusFeet when both d8 match, never to a creature already targeted by the cast. casterHealRatio: the caster
// regains this part of the damage dealt (Vampiric Touch). fromActiveSpell: cast from the spell panel, which spends
// the slot and holds the concentration; the console records the attacks while the spell is active on the caster.
export const PC_ATTACK_SPELLS = Object.freeze([
  Object.freeze({ spellId: "inflict-wounds", name: "Infliggi ferite", level: 1, range: "melee", type: "necrotic",
    dice: "3d10", perSlot: "1d10" }),
  Object.freeze({ spellId: "guiding-bolt", name: "Dardo tracciante", level: 1, range: "ranged", type: "radiant",
    dice: "4d6", perSlot: "1d6" }),
  Object.freeze({ spellId: "phb2014-globo-cromatico", name: "Globo cromatico", level: 1, range: "ranged",
    types: Object.freeze(["acid", "cold", "lightning", "fire", "thunder", "poison"]), dice: "3d8", perSlot: "1d8",
    ruleNote: "Scegli il tipo del globo prima del tiro per colpire. Componente: un diamante da 50 mo." }),
  Object.freeze({ spellId: "xanathar-dardo-di-caos", name: "Dardo di caos", level: 1, range: "ranged",
    types: Object.freeze(["acid", "force", "cold", "lightning", "fire", "psychic", "thunder", "poison"]), dice: "2d8+1d6", perSlot: "1d6",
    leap: Object.freeze({ radiusFeet: 30 }),
    ruleNote: "Il tipo è quello di uno dei due d8: 1 acido, 2 forza, 3 freddo, 4 fulmine, 5 fuoco, 6 psichico, 7 tuono, 8 veleno. Con due d8 uguali il dardo balza su un'altra creatura entro 9 metri." }),
  Object.freeze({ spellId: "magic-missile", name: "Dardo incantato", level: 1, range: "ranged", delivery: "auto", type: "force",
    dice: "1d4+1", count: Object.freeze({ base: 3, perSlot: 1 }),
    ruleNote: "Ogni dardo colpisce senza tiro per colpire: registra un dardo alla volta, anche sullo stesso bersaglio." }),
  Object.freeze({ spellId: "scorching-ray", name: "Raggio rovente", level: 2, range: "ranged", type: "fire",
    dice: "2d6", count: Object.freeze({ base: 3, perSlot: 1 }),
    ruleNote: "Un tiro per colpire per raggio: registra un raggio alla volta, anche sullo stesso bersaglio." }),
  Object.freeze({ spellId: "vampiric-touch", name: "Tocco del vampiro", level: 3, range: "melee", type: "necrotic",
    dice: "3d6", perSlot: "1d6", casterHealRatio: 0.5, fromActiveSpell: true,
    ruleNote: "Lancialo dal pannello incantesimi: qui registri il tocco del lancio e quelli dei turni seguenti, finché dura la concentrazione." }),
]);

const SPELL_BY_ID = new Map(PC_ATTACK_SPELLS.map((spell) => [spell.spellId, spell]));

export function getPcAttackSpell(spellId) {
  return SPELL_BY_ID.get(String(spellId || "")) || null;
}

function slotLevelFor(spell, slotLevel) {
  const level = Math.floor(Number(slotLevel));
  return Number.isInteger(level) ? Math.max(spell.level, Math.min(9, level)) : spell.level;
}

// The dice of one attack at this slot level ("5d10"; Chaos Bolt "2d8+2d6"): perSlot adds its die to the term with
// the same die, or a new term.
export function pcAttackSpellDice(spell, slotLevel) {
  if (!spell) return null;
  const extra = slotLevelFor(spell, slotLevel) - spell.level;
  const [, addCount, addSides] = /^(\d+)d(\d+)$/u.exec(spell.perSlot || "") || [];
  if (!addCount || extra <= 0) return spell.dice;
  const terms = spell.dice.split("+");
  const index = terms.findIndex((term) => new RegExp(`^\\d+d${addSides}$`, "u").test(term));
  if (index < 0) return `${spell.dice}+${Number(addCount) * extra}d${addSides}`;
  const [count] = terms[index].split("d");
  terms[index] = `${Number(count) + Number(addCount) * extra}d${addSides}`;
  return terms.join("+");
}

// The rays or darts of one cast at this slot level (Scorching Ray at 3rd: 4); 1 for the others.
export function pcAttackSpellCount(spell, slotLevel) {
  if (!spell?.count) return 1;
  return spell.count.base + spell.count.perSlot * (slotLevelFor(spell, slotLevel) - spell.level);
}
