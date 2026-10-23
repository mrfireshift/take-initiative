// Character sheet import: a JSON block extracted from a character sheet (PDF, by hand or with an assistant)
// becomes sections the GM picks and applies to the sheet editor. Nothing is saved here: the editor's Salva
// stores what the GM kept. Names are matched in Italian or English through the catalogs; what is not
// recognised is reported, never guessed. HP stay out: they live in the token's canonical metadata.
// Loads the spell and class catalogs: import it only from the character sheet.
import { getSpellDefinition } from "./spells-srd.js";
import { CLASS_FEATURE_CLASSES, getClassFeatureSubclasses } from "./classFeatureCatalog.js";
import { MAX_CHARACTER_CLASSES, sanitizeCharacterBuild } from "./classFeatureCore.js";
import { SPECIES } from "./speciesTraitCore.js";
import { DAMAGE_TYPES, sanitizeDamageDefenses, hasDamageDefenses } from "./damageDefensesCore.js";
import { ABILITY_KEYS, sanitizeAbilityModifiers, hasAbilityModifiers } from "./abilityModifiersCore.js";
import { MAX_QUICK_ACTION_ATTACKS, sanitizeQuickAction } from "./quickActionsCore.js";
import { MAX_SPELLBOOK_SPELLS, sanitizeSpellbook } from "./spellbookCore.js";
import { normalizeSpeedMeters } from "./speedCheckCore.js";

// In the order the import panel lists them.
export const SHEET_IMPORT_SECTIONS = Object.freeze([
  Object.freeze({ id: "classes", label: "Classi e livelli" }),
  Object.freeze({ id: "species", label: "Specie" }),
  Object.freeze({ id: "stats", label: "Statistiche" }),
  Object.freeze({ id: "abilities", label: "Modificatori di caratteristica" }),
  Object.freeze({ id: "saves", label: "Tiri salvezza" }),
  Object.freeze({ id: "defenses", label: "Difese ai danni" }),
  Object.freeze({ id: "spells", label: "Incantesimi" }),
  Object.freeze({ id: "attacks", label: "Attacchi" }),
  Object.freeze({ id: "notes", label: "Note" }),
]);

// The list sections can be added to the current list or replace it.
export const SHEET_IMPORT_LIST_SECTIONS = Object.freeze(["spells", "attacks"]);

export const SHEET_IMPORT_ABILITY_LABELS = Object.freeze({ str: "FOR", dex: "DES", con: "COS", int: "INT", wis: "SAG", cha: "CAR" });

export const SHEET_IMPORT_STAT_LABELS = Object.freeze({
  armorClass: "CA",
  speed: "Velocità",
  passivePerception: "Percezione passiva",
  spellSaveDC: "CD incantesimi",
  spellAttackBonus: "Attacco incantesimi",
});

const STAT_KEYS = Object.freeze(Object.keys(SHEET_IMPORT_STAT_LABELS));

// Lower case, no accents, words separated by single spaces: "Scuola d'Invocazione" -> "scuola d invocazione".
function lookupKey(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function text(value) {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

// "+7", "7", 7 -> 7; anything else -> null.
function integer(value) {
  if (typeof value === "number") return Number.isFinite(value) ? Math.round(value) : null;
  const match = text(value).replace(",", ".").match(/^([+\-−]?)\s*(\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const number = Math.round(Number(match[2]));
  return match[1] === "-" || match[1] === "−" ? -number : number;
}

const ABILITY_ALIASES = Object.freeze({
  str: ["str", "for", "forza", "strength"],
  dex: ["dex", "des", "destrezza", "dexterity"],
  con: ["con", "cos", "costituzione", "constitution"],
  int: ["int", "intelligenza", "intelligence"],
  wis: ["wis", "sag", "saggezza", "wisdom"],
  cha: ["cha", "car", "carisma", "charisma"],
});
const ABILITY_BY_ALIAS = new Map(Object.entries(ABILITY_ALIASES)
  .flatMap(([key, aliases]) => aliases.map((alias) => [alias, key])));

// { "FOR": 3, "destrezza": "+2" } -> { str: 3, dex: 2 }; read(value) turns each value into a number.
function abilityValues(source, read) {
  if (!source || typeof source !== "object" || Array.isArray(source)) return {};
  const values = {};
  for (const [rawKey, rawValue] of Object.entries(source)) {
    const key = ABILITY_BY_ALIAS.get(lookupKey(rawKey));
    const value = key ? read(rawValue) : null;
    if (key && value !== null && values[key] === undefined) values[key] = value;
  }
  return values;
}

function modifierFromScore(score) {
  return score === null ? null : Math.floor((score - 10) / 2);
}

// abilities: { str: 16 } (scores) or { str: { score: 16, modifier: 3 } }; abilityScores: scores;
// abilityModifiers: modifiers. A stated modifier wins over one computed from the score.
function importedAbilityModifiers(data) {
  const fromAbilities = abilityValues(data.abilities, (value) => (
    value && typeof value === "object"
      ? integer(value.modifier ?? value.mod) ?? modifierFromScore(integer(value.score ?? value.value))
      : modifierFromScore(integer(value))
  ));
  const fromScores = abilityValues(data.abilityScores, (value) => modifierFromScore(integer(value)));
  const fromModifiers = abilityValues(data.abilityModifiers, integer);
  const modifiers = sanitizeAbilityModifiers({ ...fromScores, ...fromAbilities, ...fromModifiers });
  return hasAbilityModifiers(modifiers) ? modifiers : null;
}

function importedSaves(data) {
  const saves = abilityValues(data.savingThrows ?? data.saves, (value) => {
    const bonus = integer(value && typeof value === "object" ? value.bonus ?? value.modifier : value);
    return bonus === null ? null : Math.max(-99, Math.min(99, bonus));
  });
  return Object.keys(saves).length
    ? Object.fromEntries(ABILITY_KEYS.map((key) => [key, saves[key] ?? null]))
    : null;
}

// 9, "9 m", "9,5 metri" -> metres; "30 ft", "30 piedi" -> 9 m (1,5 m every 5 feet).
function importedSpeed(value) {
  if (typeof value === "number") return normalizeSpeedMeters(value);
  const source = text(value).toLowerCase();
  const match = source.match(/(\d+(?:[.,]\d+)?)/);
  if (!match) return null;
  const number = Number(match[1].replace(",", "."));
  const feet = /\b(ft|feet|foot|piedi|piede)\b|'/.test(source);
  return normalizeSpeedMeters(feet ? number * 0.3 : number);
}

function importedStats(data) {
  const values = {
    armorClass: integer(data.armorClass ?? data.ac ?? data.ca),
    speed: importedSpeed(data.speed ?? data.velocita ?? data.velocità),
    passivePerception: integer(data.passivePerception),
    spellSaveDC: integer(data.spellSaveDC ?? data.spellSaveDc),
    spellAttackBonus: integer(data.spellAttackBonus),
  };
  const limits = { armorClass: [0, 99], passivePerception: [0, 99], spellSaveDC: [0, 99], spellAttackBonus: [-99, 99] };
  const stats = {};
  for (const key of STAT_KEYS) {
    let value = values[key];
    if (value === null || value === undefined) continue;
    if (limits[key]) value = Math.max(limits[key][0], Math.min(limits[key][1], value));
    stats[key] = value;
  }
  return Object.keys(stats).length ? stats : null;
}

const CLASS_ENGLISH_NAMES = Object.freeze({
  barbarian: "barbaro", bard: "bardo", cleric: "chierico", druid: "druido", fighter: "guerriero",
  rogue: "ladro", wizard: "mago", monk: "monaco", paladin: "paladino", ranger: "ranger",
  sorcerer: "stregone", warlock: "warlock",
});
const CLASS_BY_KEY = new Map(CLASS_FEATURE_CLASSES.flatMap((entry) => [
  [lookupKey(entry.id), entry.id],
  [lookupKey(entry.name), entry.id],
]));
for (const [english, classId] of Object.entries(CLASS_ENGLISH_NAMES)) CLASS_BY_KEY.set(english, classId);

function resolveClassId(value) {
  return CLASS_BY_KEY.get(lookupKey(value)) || "";
}

// Exact name or id first; then the only subclass whose name contains, or is contained in, the given one.
function resolveSubclassId(classId, value) {
  const wanted = lookupKey(value);
  if (!wanted) return "";
  const subclasses = getClassFeatureSubclasses(classId);
  const exact = subclasses.find((entry) => lookupKey(entry.id) === wanted || lookupKey(entry.name) === wanted);
  if (exact) return exact.id;
  const partial = subclasses.filter((entry) => {
    const name = lookupKey(entry.name);
    return name.includes(wanted) || wanted.includes(name);
  });
  return partial.length === 1 ? partial[0].id : "";
}

// classes: [{ class, level, subclass }], or class/level/subclass at the top level for one class.
function importedClasses(data, unresolved) {
  const source = Array.isArray(data.classes)
    ? data.classes
    : data.class || data.classe ? [{ class: data.class ?? data.classe, level: data.level ?? data.livello, subclass: data.subclass ?? data.sottoclasse }] : [];
  const build = [];
  for (const entry of source) {
    const raw = entry && typeof entry === "object" ? entry : { class: entry };
    const name = text(raw.class ?? raw.classe ?? raw.name ?? raw.id);
    const classId = resolveClassId(name);
    if (!classId) {
      if (name) unresolved.push(`classe "${name}"`);
      continue;
    }
    const subclassName = text(raw.subclass ?? raw.sottoclasse);
    const subclassId = resolveSubclassId(classId, subclassName);
    if (subclassName && !subclassId) unresolved.push(`sottoclasse "${subclassName}"`);
    build.push({ classId, level: integer(raw.level ?? raw.livello) ?? 1, subclassId });
  }
  const clean = sanitizeCharacterBuild(build).slice(0, MAX_CHARACTER_CLASSES);
  return clean.length ? clean : null;
}

// species: "Elfo oscuro (drow)", "Hill Dwarf" or { name, ancestry | subrace | variant }. A name may be the
// species, one of its aliases or directly one of its options (ancestry, subrace, variant).
function speciesNameMatches(entry, key) {
  return [entry.id, entry.label, ...(entry.aliases || [])].some((name) => lookupKey(name) === key);
}

function importedSpecies(data, unresolved) {
  const raw = data.species ?? data.specie ?? data.race ?? data.razza;
  if (raw === undefined || raw === null || raw === "") return null;
  const source = typeof raw === "object" ? raw : { name: raw };
  const name = text(source.name ?? source.id);
  const key = lookupKey(name);
  const optionName = source.ancestry ?? source.ascendenza ?? source.subrace ?? source.sottorazza ?? source.variant ?? source.variante;
  let species = SPECIES.find((entry) => speciesNameMatches(entry, key));
  let ancestry = null;
  if (!species && key) {
    for (const entry of SPECIES) {
      ancestry = entry.ancestries.find((choice) => speciesNameMatches(choice, key));
      if (ancestry) { species = entry; break; }
    }
  }
  if (!species) {
    if (name) unresolved.push(`specie "${name}" (non ancora nel catalogo del plugin)`);
    return null;
  }
  const ancestryName = lookupKey(optionName);
  if (ancestryName) {
    ancestry = species.ancestries.find((entry) => speciesNameMatches(entry, ancestryName)) || null;
    if (!ancestry) unresolved.push(`${(species.optionLabel || "opzione").toLocaleLowerCase("it")} "${text(optionName)}"`);
  }
  return { id: species.id, ancestryId: ancestry?.id || "" };
}

const DAMAGE_TYPE_BY_KEY = new Map(DAMAGE_TYPES.flatMap((entry) => [
  [lookupKey(entry.id), entry.id],
  [lookupKey(entry.label), entry.id],
]));
// The singular and the usual Italian forms that differ from the labels.
for (const [alias, id] of Object.entries({
  contundente: "bludgeoning", perforante: "piercing", tagliente: "slashing", necrotico: "necrotic",
  psichico: "psychic", radioso: "radiant", forza: "force", veleno: "poison", tuono: "thunder",
  fulmine: "lightning", fuoco: "fire", acido: "acid", freddo: "cold",
})) {
  if (!DAMAGE_TYPE_BY_KEY.has(alias)) DAMAGE_TYPE_BY_KEY.set(alias, id);
}

function resolveDamageType(value) {
  return DAMAGE_TYPE_BY_KEY.get(lookupKey(value)) || "";
}

function importedDefenses(data, unresolved) {
  const source = data.damageDefenses && typeof data.damageDefenses === "object" ? data.damageDefenses : data;
  const lists = {
    resistances: source.resistances ?? source.resistenze,
    immunities: source.immunities ?? source.immunita ?? source.immunità,
    vulnerabilities: source.vulnerabilities ?? source.vulnerabilita ?? source.vulnerabilità,
  };
  const defenses = {};
  for (const [list, values] of Object.entries(lists)) {
    defenses[list] = (Array.isArray(values) ? values : []).map((value) => {
      const type = resolveDamageType(value);
      if (!type && text(value)) unresolved.push(`tipo di danno "${text(value)}"`);
      return type;
    }).filter(Boolean);
  }
  const clean = sanitizeDamageDefenses(defenses);
  return hasDamageDefenses(clean) ? clean : null;
}

// spells: ["Palla di fuoco", { name: "Shield", pinned: true }] or by level, { "0": [...], "1": [...] };
// cantrips: a list of its own, added first.
function importedSpells(data, unresolved) {
  const entries = [];
  const collect = (value) => {
    if (Array.isArray(value)) entries.push(...value);
    else if (value && typeof value === "object") Object.values(value).forEach(collect);
  };
  collect(data.cantrips ?? data.trucchetti);
  collect(data.spells ?? data.incantesimi);
  const spellIds = [];
  const pinnedIds = [];
  const unpreparedIds = [];
  for (const entry of entries) {
    const raw = entry && typeof entry === "object" ? entry : { name: entry };
    const name = text(raw.name ?? raw.nome ?? raw.id);
    if (!name) continue;
    const spell = getSpellDefinition(name);
    if (!spell) {
      unresolved.push(`incantesimo "${name}"`);
      continue;
    }
    if (!spellIds.includes(spell.id)) spellIds.push(spell.id);
    if (raw.pinned === true && !pinnedIds.includes(spell.id)) pinnedIds.push(spell.id);
    // A spell in the book but not prepared today (a wizard's spellbook): spellPreparationCore.js.
    if (raw.prepared === false && !unpreparedIds.includes(spell.id)) unpreparedIds.push(spell.id);
  }
  if (spellIds.length > MAX_SPELLBOOK_SPELLS) unresolved.push(`${spellIds.length - MAX_SPELLBOOK_SPELLS} incantesimi oltre il limite di ${MAX_SPELLBOOK_SPELLS}`);
  const spellbook = sanitizeSpellbook({ spellIds, pinnedIds, unpreparedIds });
  return spellbook.spellIds.length ? spellbook : null;
}

// The same entries as the Attacks import (label, range, components: [{ type, formula }], or a cantrip
// source); the damage type may also be written in Italian.
function importedAttacks(data, unresolved) {
  const source = Array.isArray(data.attacks ?? data.attacchi) ? data.attacks ?? data.attacchi : [];
  const attacks = [];
  let invalid = 0;
  for (const entry of source) {
    if (!entry || typeof entry !== "object") {
      invalid += 1;
      continue;
    }
    const components = Array.isArray(entry.components)
      ? entry.components.map((component) => ({ ...component, type: resolveDamageType(component?.type) }))
      : entry.components;
    const attack = sanitizeQuickAction({ ...entry, label: entry.label ?? entry.name ?? entry.nome, components, id: "import", kind: "attack" });
    if (!attack) {
      invalid += 1;
      continue;
    }
    const { id: _id, ...draft } = attack;
    attacks.push(draft);
  }
  if (invalid) unresolved.push(`${invalid} ${invalid === 1 ? "attacco non valido" : "attacchi non validi"}`);
  if (attacks.length > MAX_QUICK_ACTION_ATTACKS) unresolved.push(`${attacks.length - MAX_QUICK_ACTION_ATTACKS} attacchi oltre il limite di ${MAX_QUICK_ACTION_ATTACKS}`);
  return attacks.length ? attacks.slice(0, MAX_QUICK_ACTION_ATTACKS) : null;
}

/**
 * Reads a pasted block. Returns { error, name, sections, unresolved }: sections holds only what the block
 * contains (classes, species, stats, abilities, saves, defenses, spells, attacks, notes), unresolved the
 * names the catalogs did not recognise. A block is never thrown on.
 */
export function parseCharacterSheetImport(value) {
  let data;
  try {
    data = JSON.parse(String(value ?? ""));
  } catch {
    return { error: "Blocco non leggibile: incolla il JSON così com'è.", name: "", sections: {}, unresolved: [] };
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { error: "Il blocco deve essere un oggetto JSON con i dati della scheda.", name: "", sections: {}, unresolved: [] };
  }
  const unresolved = [];
  const notes = text(data.notes ?? data.note).slice(0, 280);
  const candidates = {
    classes: importedClasses(data, unresolved),
    species: importedSpecies(data, unresolved),
    stats: importedStats(data),
    abilities: importedAbilityModifiers(data),
    saves: importedSaves(data),
    defenses: importedDefenses(data, unresolved),
    spells: importedSpells(data, unresolved),
    attacks: importedAttacks(data, unresolved),
    notes: notes || null,
  };
  const sections = Object.fromEntries(Object.entries(candidates).filter(([, section]) => section !== null));
  const error = Object.keys(sections).length ? "" : "Nel blocco non c'è nessun dato della scheda riconosciuto.";
  return { error, name: text(data.name ?? data.nome).slice(0, 80), sections, unresolved };
}

function signed(value) {
  return value >= 0 ? `+${value}` : String(value);
}

const DEFENSE_LIST_LABELS = Object.freeze({ resistances: "Res.", immunities: "Imm.", vulnerabilities: "Vuln." });

// One line per section, for the import panel.
export function sheetImportSectionSummary(id, section, { classNameOf = (classId) => classId, subclassNameOf = () => "", spellNameOf = (spellId) => spellId } = {}) {
  if (!section) return "";
  if (id === "classes") {
    return section.map((entry) => {
      const subclass = entry.subclassId ? subclassNameOf(entry.classId, entry.subclassId) : "";
      return `${classNameOf(entry.classId)} ${entry.level}${subclass ? ` (${subclass})` : ""}`;
    }).join(" / ");
  }
  if (id === "species") {
    const species = SPECIES.find((entry) => entry.id === section.id);
    const ancestry = species?.ancestries.find((entry) => entry.id === section.ancestryId);
    if (ancestry) return ancestry.damageLabel ? `${species.label} (${ancestry.label.toLocaleLowerCase("it")})` : ancestry.label;
    return `${species?.label || section.id}${species?.ancestries.length ? ` · ${species.optionLabel.toLocaleLowerCase("it")} da scegliere` : ""}`;
  }
  if (id === "stats") {
    return STAT_KEYS.filter((key) => section[key] !== undefined).map((key) => {
      const value = key === "speed" ? `${String(section[key]).replace(".", ",")} m` : key === "spellAttackBonus" ? signed(section[key]) : section[key];
      return `${SHEET_IMPORT_STAT_LABELS[key]} ${value}`;
    }).join(" · ");
  }
  if (id === "abilities" || id === "saves") {
    return ABILITY_KEYS.filter((key) => section[key] !== null && section[key] !== undefined)
      .map((key) => `${SHEET_IMPORT_ABILITY_LABELS[key]} ${signed(section[key])}`).join(" · ");
  }
  if (id === "defenses") {
    return Object.entries(DEFENSE_LIST_LABELS)
      .filter(([list]) => section[list]?.length)
      .map(([list, label]) => `${label} ${section[list].map((type) => DAMAGE_TYPES.find((entry) => entry.id === type)?.label || type).join(", ")}`)
      .join(" · ");
  }
  if (id === "spells") {
    const names = section.spellIds.map(spellNameOf);
    return `${names.length} ${names.length === 1 ? "incantesimo" : "incantesimi"}: ${names.slice(0, 6).join(", ")}${names.length > 6 ? "…" : ""}`;
  }
  if (id === "attacks") {
    return `${section.length} ${section.length === 1 ? "attacco" : "attacchi"}: ${section.map((attack) => attack.label).join(", ")}`;
  }
  if (id === "notes") return section.length > 60 ? `${section.slice(0, 60)}…` : section;
  return "";
}

// The book after an import: "add" keeps the current spells and adds the missing ones, "replace" keeps only
// the imported ones. Favourites survive when their spell is still in the book; an imported spell takes the
// preparation the block gives it (prepared unless "prepared": false).
export function mergeImportedSpellbook(current, imported, mode = "add") {
  const base = sanitizeSpellbook(current);
  const incoming = sanitizeSpellbook(imported);
  if (mode === "replace") {
    return sanitizeSpellbook({
      spellIds: incoming.spellIds,
      pinnedIds: [...incoming.pinnedIds, ...base.pinnedIds],
      unpreparedIds: incoming.unpreparedIds || [],
    });
  }
  const importedIds = new Set(incoming.spellIds);
  return sanitizeSpellbook({
    spellIds: [...base.spellIds, ...incoming.spellIds],
    pinnedIds: [...base.pinnedIds, ...incoming.pinnedIds],
    unpreparedIds: [...(base.unpreparedIds || []).filter((id) => !importedIds.has(id)), ...(incoming.unpreparedIds || [])],
  });
}
