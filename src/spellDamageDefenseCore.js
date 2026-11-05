// What a creature's defenses do to the damage of a spell, where the GM writes the damage by hand: the panel's cast and the ⚡
// actions. Pure data and arithmetic: the preview and the commit read the same rows, so they always agree.
import {
  DAMAGE_TYPES,
  componentDamageAfterDefense,
  damageDefenseCount,
  damageDefenseFor,
  damageDefenseTag,
  damageDefensesForItem,
  damageTypeLabel,
} from "./damageDefensesCore.js";
import { scaledQuickHPAmount } from "./quickHpCore.js";

const spellsOfType = (type, ids) => ids.map((id) => [id, Object.freeze([type])]);

// The type of the damage written in the panel, from the spell's text. A spell must be listed here or below: a test checks
// every spell with a damage field, because the catalog's damageType holds only the first type of a spell.
const SPELL_DAMAGE_TYPES = Object.freeze(Object.fromEntries([
  ...spellsOfType("acid", ["acid-arrow", "xanathar-sfera-al-vetriolo"]),
  ...spellsOfType("bludgeoning", ["wind-wall", "xanathar-catapulta", "xanathar-eruzione-terrestre", "xanathar-onda-di-marea",
    "xanathar-scossa-tellurica", "xanathar-sfera-della-tempesta", "xanathar-stretta-della-terra-di-maximilian", "xanathar-turbine",
    "phb2014-tsunami"]),
  ...spellsOfType("cold", ["cone-of-cold", "freezing-sphere", "ray-of-frost", "wall-of-ice", "xanathar-coltello-di-ghiaccio",
    "xanathar-morsa-del-gelo", "xanathar-sciame-di-palle-di-neve-di-snilloc"]),
  ...spellsOfType("fire", ["burning-hands", "delayed-blast-fireball", "fire-storm", "fireball", "heat-metal", "hellish-rebuke",
    "incendiary-cloud", "wall-of-fire", "xanathar-creare-falo", "xanathar-immolazione", "xanathar-minuscole-meteore-di-melf",
    "xanathar-vampa-di-aganazzar"]),
  ...spellsOfType("force", ["disintegrate", "tasha-turbine-di-spade"]),
  ...spellsOfType("lightning", ["call-lightning", "chain-lightning", "lightning-bolt", "phb2014-dardo-stregato",
    "phb2014-freccia-folgorante"]),
  ...spellsOfType("necrotic", ["blight", "chill-touch", "circle-of-death", "finger-of-death", "xanathar-debilitazione",
    "xanathar-flusso-di-energia-negativa", "xanathar-orrido-avvizzimento-di-abi-dalzim", "phb2014-braccia-di-hadar"]),
  ...spellsOfType("piercing", ["insect-plague", "wall-of-thorns", "phb2014-raffica-di-spine"]),
  ...spellsOfType("poison", ["phb2014-raggio-di-infermita"]),
  ...spellsOfType("psychic", ["feeblemind", "legacy-tashas-mind-whip", "xanathar-aculeo-mentale", "xanathar-prigione-mentale",
    "xanathar-scossa-sinaptica", "xanathar-urlo-psichico", "tasha-scheggia-della-mente", "phb2014-sussurri-dissonanti"]),
  ...spellsOfType("radiant", ["guiding-bolt", "sunbeam", "sunburst", "xanathar-alba", "xanathar-muro-di-luce",
    "xanathar-parola-radiosa"]),
  ...spellsOfType("thunder", ["shatter", "storm-of-vengeance", "thunderwave", "xanathar-passo-del-tuono", "xanathar-rombo-di-tuono"]),
  // Two types in one number: the panel cannot know how much is of each, and the defense stays with the GM.
  ["flame-strike", Object.freeze(["fire", "radiant"])],
  ["ice-storm", Object.freeze(["bludgeoning", "cold"])],
  ["meteor-swarm", Object.freeze(["bludgeoning", "fire"])],
]));

// With no fixed type to read: the GM still writes the damage after the defenses.
export const SPELL_DAMAGE_TYPE_LEFT_TO_GM = Object.freeze({
  // Its own count, dart by dart (magicMissileCore.js).
  "magic-missile": "dardi",
  // Radiant or necrotic, the caster's choice.
  "phb2014-onda-distruttiva": "a scelta",
  // The weapon's type.
  "phb2014-evoca-raffica": "dell'arma",
  "phb2014-evoca-pioggia-di-armi": "dell'arma",
  // Riders on a weapon's hit, written with the attack.
  "phb2014-punizione-accecante": "con l'attacco",
  "phb2014-punizione-collerica": "con l'attacco",
  "phb2014-punizione-demoralizzante": "con l'attacco",
  "phb2014-punizione-esiliante": "con l'attacco",
  "phb2014-punizione-incandescente": "con l'attacco",
  "phb2014-punizione-tonante": "con l'attacco",
});

export function spellDamageTypes(spellId) {
  return SPELL_DAMAGE_TYPES[String(spellId || "").trim()] || [];
}

// An action's damage by its Italian label or its key ("freddo": cold); [] for a type the GM chose ("del tipo scelto").
export function spellActionDamageTypes(action) {
  const wanted = String(action?.damage?.type || "").trim().toLocaleLowerCase("it");
  const type = DAMAGE_TYPES.find((entry) => entry.id === wanted || entry.label === wanted);
  return type ? [type.id] : [];
}

// The types of a damage written in the panel: a zone's trigger says its own, a cast those of the spell.
export function spellPanelDamageTypes(spellId, trigger = null) {
  return trigger?.damage ? spellActionDamageTypes(trigger) : spellDamageTypes(spellId);
}

// A spell's damage is magical: a monster's defense limited to nonmagical weapons (monsterProfileCore.js) does not count.
export function magicalDamageDefensesForItem(item, metaKey) {
  const defenses = damageDefensesForItem(item, metaKey);
  const nonmagical = item?.metadata?.[metaKey]?.initiativeCard?.monster?.nonmagicalDefenses?.types;
  if (!Array.isArray(nonmagical) || !nonmagical.length) return defenses;
  return Object.fromEntries(Object.entries(defenses)
    .map(([list, types]) => [list, types.filter((type) => !nonmagical.includes(type))]));
}

// One row for each defense of the creature against this damage. manual: two types in one number, the GM does the sum.
export function spellDamageDefenseRows({ types = [], defenses = null, ignoredTypes = [] } = {}) {
  const ignored = new Set(Array.isArray(ignoredTypes) ? ignoredTypes : []);
  const manual = types.length > 1;
  return types
    .map((type) => ({ type, defense: damageDefenseFor(defenses, type) }))
    .filter((row) => row.defense)
    .map((row) => ({ ...row, ignored: ignored.has(row.type), ...(manual ? { manual: true } : {}) }));
}

// The defense that changes the number, if any.
export function spellDamageDefenseApplied(rows = []) {
  return (Array.isArray(rows) ? rows : []).find((row) => !row.ignored && !row.manual)?.defense || null;
}

// The damage after the save and the defense. factor: "full" or "half".
export function spellDamageAfterDefense(amount, factor, defense = null) {
  return componentDamageAfterDefense(amount, factor, defense);
}

export function spellDamageBeforeDefense(amount, factor) {
  return scaledQuickHPAmount(amount, factor);
}

const damageWords = (type) => {
  const label = damageTypeLabel(type);
  return /i$/u.test(label) ? `danni ${label}` : `danni da ${label}`;
};
const DEFENSE_HOLDER = Object.freeze({
  resistance: { has: "ha resistenza ai", name: "la resistenza", effect: "dimezzato" },
  immunity: { has: "è immune ai", name: "l'immunità", effect: "azzerato" },
  vulnerability: { has: "è vulnerabile ai", name: "la vulnerabilità", effect: "raddoppiato" },
});

// The chip's words: the same as the consoles, with what the defense did to the damage written.
export function spellDamageDefenseText(row, { before = 0, after = 0 } = {}) {
  if (row?.manual) return `${damageDefenseTag(row)}: al GM`;
  return damageDefenseCount({ ...row, before, after });
}

// The chip's tooltip says who has what, and what it does to the number: the GM must know that a defense is at work.
export function spellDamageDefenseTitle(row, { name = "La creatura", before = 0, after = 0, where = "in questo lancio" } = {}) {
  const holder = DEFENSE_HOLDER[row?.defense];
  if (!holder) return "";
  const said = `${name} ${holder.has} ${damageWords(row.type)}`;
  if (row.manual) {
    return `${said}, ma questo incantesimo somma due tipi di danno in un solo numero. Il conto resta a te: scrivi il danno già ridotto.`;
  }
  if (row.ignored) return `${said}: ${holder.name} è ignorata ${where}. Clic per applicarla.`;
  const effect = before > 0
    ? `${before} ${before === 1 ? "danno diventa" : "danni diventano"} ${after}`
    : `il danno scritto sarà ${holder.effect}, quindi scrivilo intero`;
  return `${said}: ${effect}. Clic per ignorare ${holder.name} ${where}.`;
}
