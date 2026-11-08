// What a creature's defenses do to the damage of a spell, where the GM writes the damage by hand: the panel's cast, the ⚡
// actions and the smites' popup. Pure data and arithmetic: the preview and the commit read the same rows, so they always agree.
import {
  DAMAGE_TYPES,
  componentDamageAfterDefense,
  damageDefenseCount,
  damageDefenseFor,
  damageDefenseTag,
  damageDefensesForItem,
  damageTypeLabel,
  nonmagicalDefenseMarkerForItem,
  withSpellDamageResistance,
} from "./damageDefensesCore.js";
import { scaledQuickHPAmount } from "./quickHpCore.js";

const spellsOfType = (type, ids) => ids.map((id) => [id, Object.freeze([type])]);

// The type of the damage written in the panel, from the spell's text. A spell must be listed here or below: a test checks
// every spell with a damage field, because the catalog's damageType holds only the first type of a spell.
const SPELL_DAMAGE_TYPES = Object.freeze(Object.fromEntries([
  ...spellsOfType("acid", ["acid-arrow", "xanathar-sfera-al-vetriolo"]),
  ...spellsOfType("bludgeoning", ["wind-wall", "xanathar-catapulta", "xanathar-eruzione-terrestre", "xanathar-onda-di-marea",
    "xanathar-scossa-tellurica", "xanathar-sfera-della-tempesta", "xanathar-stretta-della-terra-di-maximilian",
    "xanathar-trasmutare-roccia", "xanathar-turbine", "phb2014-tsunami"]),
  ...spellsOfType("cold", ["cone-of-cold", "freezing-sphere", "ray-of-frost", "wall-of-ice", "xanathar-coltello-di-ghiaccio",
    "xanathar-morsa-del-gelo", "xanathar-sciame-di-palle-di-neve-di-snilloc"]),
  ...spellsOfType("fire", ["burning-hands", "delayed-blast-fireball", "fire-storm", "fireball", "heat-metal", "hellish-rebuke",
    "incendiary-cloud", "wall-of-fire", "xanathar-creare-falo", "xanathar-immolazione", "xanathar-minuscole-meteore-di-melf",
    "xanathar-vampa-di-aganazzar"]),
  ...spellsOfType("force", ["disintegrate", "tasha-turbine-di-spade"]),
  ...spellsOfType("lightning", ["call-lightning", "chain-lightning", "lightning-bolt", "phb2014-dardo-stregato",
    "phb2014-freccia-folgorante"]),
  ...spellsOfType("necrotic", ["blight", "chill-touch", "circle-of-death", "finger-of-death", "symbol", "xanathar-debilitazione",
    "xanathar-flusso-di-energia-negativa", "xanathar-orrido-avvizzimento-di-abi-dalzim", "phb2014-braccia-di-hadar"]),
  ...spellsOfType("piercing", ["insect-plague", "wall-of-thorns", "phb2014-raffica-di-spine"]),
  ...spellsOfType("poison", ["phb2014-raggio-di-infermita"]),
  ...spellsOfType("psychic", ["feeblemind", "legacy-tashas-mind-whip", "xanathar-aculeo-mentale", "xanathar-prigione-mentale",
    "xanathar-scossa-sinaptica", "xanathar-urlo-psichico", "tasha-scheggia-della-mente", "phb2014-sussurri-dissonanti"]),
  ...spellsOfType("radiant", ["guiding-bolt", "sunbeam", "sunburst", "xanathar-alba", "xanathar-muro-di-luce",
    "xanathar-parola-radiosa"]),
  ...spellsOfType("thunder", ["shatter", "storm-of-vengeance", "thunderwave", "xanathar-passo-del-tuono", "xanathar-rombo-di-tuono"]),
  // The smites: their popup asks for their own dice, apart from the weapon's, which the attack console registers with its type.
  ...spellsOfType("fire", ["phb2014-punizione-incandescente"]),
  ...spellsOfType("force", ["phb2014-punizione-esiliante"]),
  ...spellsOfType("psychic", ["phb2014-punizione-collerica", "phb2014-punizione-demoralizzante"]),
  ...spellsOfType("radiant", ["branding-smite", "phb2014-punizione-accecante"]),
  ...spellsOfType("thunder", ["phb2014-punizione-tonante"]),
  // Two types in one damage: a box for each part (spellCastDamageParts), each with its own defense
  // (spellDamagePartsAfterDefense). Destructive Wave's second part is radiant or necrotic, the cast's choice.
  ["flame-strike", Object.freeze(["fire", "radiant"])],
  ["ice-storm", Object.freeze(["bludgeoning", "cold"])],
  ["meteor-swarm", Object.freeze(["bludgeoning", "fire"])],
  ["phb2014-onda-distruttiva", Object.freeze(["thunder", "radiant", "necrotic"])],
]));

// With no fixed type to read: the GM still writes the damage after the defenses.
export const SPELL_DAMAGE_TYPE_LEFT_TO_GM = Object.freeze({
  // Its own count, dart by dart (magicMissileCore.js).
  "magic-missile": "dardi",
  // The weapon's type.
  "phb2014-evoca-raffica": "dell'arma",
  "phb2014-evoca-pioggia-di-armi": "dell'arma",
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

// A spell's damage is magical: a defense limited to nonmagical weapons does not count, a monster's (monsterProfileCore.js) or a
// class feature's (Avatar of Battle). And a resistance to the damage of spells does (the Aura of Warding). spell: false for a
// damage that is magical without being a spell's (a class feature's reminder).
export function magicalDamageDefensesForItem(item, metaKey, { spell = true } = {}) {
  const all = damageDefensesForItem(item, metaKey);
  const nonmagical = nonmagicalDefenseMarkerForItem(item, metaKey)?.types;
  // Only a resistance or an immunity holds against nonmagical weapons: a vulnerability to the same type stays (lotto M6).
  const defenses = !Array.isArray(nonmagical) || !nonmagical.length ? all : Object.fromEntries(Object.entries(all)
    .map(([list, types]) => [list, list === "vulnerabilities" ? types : types.filter((type) => !nonmagical.includes(type))]));
  return spell ? withSpellDamageResistance(defenses, item, metaKey) : defenses;
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

// Two types in one damage (spellCastDamageParts): each part with the save's factor, then its own defense, then the sum, as the
// Boss console counts its components (componentDamageAfterDefense). parts: [{ type, amount }]; factor: "full", "half" or
// "zero"; defenses and ignoredTypes as in spellDamageDefenseRows. rows: one for each part whose type meets a defense, with
// what that defense did to that part. The panel's preview and the area commit both count with this.
export function spellDamagePartsAfterDefense({ parts = [], factor = "full", defenses = null, ignoredTypes = [] } = {}) {
  let before = 0;
  let after = 0;
  const rows = [];
  for (const part of Array.isArray(parts) ? parts : []) {
    const amount = Math.max(0, Math.floor(Number(part?.amount) || 0));
    const [row] = spellDamageDefenseRows({ types: [part?.type].filter(Boolean), defenses, ignoredTypes });
    const partBefore = factor === "zero" ? 0 : spellDamageBeforeDefense(amount, factor);
    const partAfter = factor === "zero" ? 0 : componentDamageAfterDefense(amount, factor, row && !row.ignored ? row.defense : null);
    before += partBefore;
    after += partAfter;
    if (row) rows.push({ ...row, before: partBefore, after: partAfter });
  }
  return { before, after, rows };
}

// A part of a damage with its own type and its own save: a ray of Prismatic Spray, a layer of Prismatic Wall. part: { type (its
// label), roll, factor (1, 0.5, 0), amount }. A copy with what the defense leaves of it: the plans it comes from are frozen.
export function spellDamagePartAfterDefense(part, defenses, ignoredTypes = []) {
  const [row] = spellDamageDefenseRows({ types: spellActionDamageTypes({ damage: { type: part?.type } }), defenses, ignoredTypes });
  if (!row) return part;
  const factor = part.factor === 1 ? "full" : part.factor === 0.5 ? "half" : "";
  return {
    ...part,
    defense: row.defense,
    ...(row.ignored ? { defenseIgnored: true } : {}),
    ...(factor && !row.ignored ? { amount: spellDamageAfterDefense(part.roll, factor, row.defense) } : {}),
  };
}

// The defenses that counted in these parts, for the combat log, one for each type.
export function spellDamagePartsDefenses(parts = []) {
  const seen = new Set();
  return (Array.isArray(parts) ? parts : [])
    .filter((part) => part?.defense && part.factor > 0)
    .map((part) => ({
      type: spellActionDamageTypes({ damage: { type: part.type } })[0],
      defense: part.defense,
      ...(part.defenseIgnored ? { ignored: true } : {}),
    }))
    .filter((row) => row.type && !seen.has(row.type) && seen.add(row.type));
}

const damageWords = (type) => {
  const label = damageTypeLabel(type);
  return /i$/u.test(label) ? `danni ${label}` : `danni da ${label}`;
};
const DEFENSE_HOLDER = Object.freeze({
  resistance: { has: "ha resistenza ai", name: "la resistenza", effect: "dimezzato" },
  immunity: { has: "è immune ai", name: "l'immunità", effect: "azzerato" },
  vulnerability: { has: "è vulnerabile ai", name: "la vulnerabilità", effect: "raddoppiato" },
  // Two sources, both counted (lotto M6): halved, then doubled. RESISTANCE_VULNERABILITY of damageDefensesCore.js, written out:
  // the modules import each other, and this table is built while that one may still be loading.
  "resistance-vulnerability": { has: "ha resistenza e vulnerabilità ai", name: "resistenza e vulnerabilità", effect: "dimezzato e poi raddoppiato", plural: true },
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
  if (row.ignored) return `${said}: ${holder.name} ${holder.plural ? "sono ignorate" : "è ignorata"} ${where}. Clic per ${holder.plural ? "applicarle" : "applicarla"}.`;
  const effect = before > 0
    ? `${before} ${before === 1 ? "danno diventa" : "danni diventano"} ${after}`
    : `il danno scritto sarà ${holder.effect}, quindi scrivilo intero`;
  return `${said}: ${effect}. Clic per ignorare ${holder.name} ${where}.`;
}
