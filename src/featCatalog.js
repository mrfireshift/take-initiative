// The feats of the Manuale del Giocatore 2014, Xanathar and Tasha (docs/STUDIO_TALENTI.md, lot F0). Pure data: no SDK,
// no metadata writes, no rules text. A feat's text is its manual's entry in the GM's private pack (rulesEntryId, read by
// classFeatureDescriptions.js); the catalog keeps only what the plugin works with and a line of its own, "Nel plugin",
// on what the plugin does with the feat.
//
// Feats use the class-feature record shape, like the species traits (speciesTraitCore.js): they resolve by id, follow the
// species in getEnabledClassFeatures and stay out of CLASS_FEATURES, so the class editor and the catalog audits never
// list them. A feat with a use spends it with a button (Fortunato); the others are reference cards. Their automation
// arrives lot by lot (F1–F9 of the study), on the same records.
//
// The sheet stores initiativeCard.feats: [{ id, ability?, choice? }], written only when used. Its cleaning checks the
// shape, not the catalog: an id this version does not know stays, so an older client never drops a newer one's feats.
// A half feat's +1 is not applied: the sheet stores the modifiers, which already hold it (decision D4).

export const FEATS_FIELD = "feats";
export const MAX_FEATS = 20;
export const FEAT_ABILITY_KEYS = Object.freeze(["str", "dex", "con", "int", "wis", "cha"]);
export const FEAT_ABILITY_LABELS = Object.freeze({
  str: "Forza", dex: "Destrezza", con: "Costituzione", int: "Intelligenza", wis: "Saggezza", cha: "Carisma",
});
const ABILITY_SHORT = Object.freeze({ str: "For", dex: "Des", con: "Cos", int: "Int", wis: "Sag", cha: "Car" });
// Elemental Adept's types, with the labels of the damage defenses (damageDefensesCore.js).
export const FEAT_DAMAGE_TYPES = Object.freeze([
  Object.freeze({ id: "acid", label: "acido" }),
  Object.freeze({ id: "cold", label: "freddo" }),
  Object.freeze({ id: "fire", label: "fuoco" }),
  Object.freeze({ id: "lightning", label: "fulmine" }),
  Object.freeze({ id: "thunder", label: "tuono" }),
]);

const BOOKS = Object.freeze({
  phb: Object.freeze({ source: "phb2014", sourceLabel: "Manuale del Giocatore 2014", prefix: "phb" }),
  xge: Object.freeze({ source: "xanathar", sourceLabel: "Guida Omnicomprensiva di Xanathar", prefix: "xge" }),
  tce: Object.freeze({ source: "tasha", sourceLabel: "Calderone Omnicomprensivo di Tasha", prefix: "tce" }),
});
// The order of the books in the sheet's dropdown.
export const FEAT_BOOK_SOURCES = Object.freeze(Object.values(BOOKS).map((book) => book.source));

// The species a racial feat of Xanathar asks for, with the versions of the other manuals (a ghostwise halfling is a
// halfling). Only a hint: the sheet warns, never blocks (decision D8).
const DWARVES = ["nano", "duergar", "duergar-multiverso"];
const ELVES = ["elfo", "elfo-marino", "elfo-marino-multiverso", "elfo-pallido", "elfo-astrale", "eladrin", "eladrin-multiverso",
  "shadar-kai", "shadar-kai-multiverso"];
const HALFLINGS = ["halfling", "halfling-spettrale", "halfling-lotusden"];
const GNOMES = ["gnomo", "gnomo-profondita", "gnomo-profondita-multiverso"];
const HALF_ELVES = ["mezzelfo", "mezzelfo-variante"];
const TIEFLINGS = ["tiefling", "tiefling-variante", "tiefling-stirpe"];
const DRAGONBORN = ["dragonide", "dragonide-wildemount", "dragonide-cromatico", "dragonide-metallico", "dragonide-gemma"];
// Squat Nimbleness: a dwarf or a Small species, those that may be Small included (the GM picks the size).
const SMALL = [...HALFLINGS, ...GNOMES, "autognomo", "goblin", "goblin-multiverso", "coboldo", "coboldo-multiverso", "grung", "fata",
  "harengon", "owlin", "kender", "verdan", "lignaggio-personalizzato", "dhampir", "hexblood", "reborn", "plasmoide"];

const ALL_ABILITIES = FEAT_ABILITY_KEYS;
// The line of a feat the plugin leaves to the table, until its lot (F1–F9) automates it.
const LATER = "Per ora solo riferimento: si gestisce al tavolo.";
const AT_TABLE = "Si gestisce al tavolo.";
const ON_SHEET = "Le competenze vanno riportate nella scheda del personaggio.";

// abilities: the abilities a half feat may raise (decision D4: saved, not applied); choices: what the sheet asks with the
// feat; species: the racial feat's species (speciesOptions narrows them to a subrace); pool: a use of its own; srdEntryId
// and srdText: the SRD 5.1's text of the only feat it has, Lottatore, as the rules compendium has it
// (src/rules-reference-it.json): the card shows it when the GM has no pack of the manual.
const feat = (book, page, name, english, { prerequisite = "", abilities = [], choices = [], species = [], speciesOptions = [],
  repeatable = false, plugin = LATER, pool = null, srdEntryId = "", srdText = "" } = {}) => ({
  book, page, name, english, prerequisite, abilities, choices, species, speciesOptions, repeatable, plugin, pool, srdEntryId, srdText,
});
// CC-BY-4.0, Systems Reference Document 5.1 in italiano: the compendium's entry "lottatore", word for word (a test checks).
const GRAPPLER_SRD_TEXT = [
  "Prerequisito: Forza 13 o superiore",
  "",
  "Il personaggio ha sviluppato le abilità necessarie per farsi valere nella lotta corpo a corpo. Ottiene i seguenti benefici:",
  "• Dispone di vantaggio ai tiri per colpire contro una creatura con cui sta lottando.",
  "• Può usare la sua azione per tentare di immobilizzare una creatura da lui afferrata. Per farlo deve effettuare un'altra "
    + "prova di lotta. Se la supera, il personaggio e la creatura sono entrambi trattenuti fino alla fine della lotta.",
].join("\n");

const DEFINITIONS = [
  // Manuale del Giocatore 2014, capitolo 6, pp. 165–170.
  feat("phb", 165, "Abile", "Skilled", { plugin: ON_SHEET }),
  feat("phb", 165, "Adepto Elementale", "Elemental Adept", { prerequisite: "Saper lanciare almeno un incantesimo",
    choices: ["damageType"], repeatable: true }),
  feat("phb", 165, "Adepto Marziale", "Martial Adept"),
  feat("phb", 165, "Aggressore Selvaggio", "Savage Attacker"),
  feat("phb", 165, "Allerta", "Alert", {
    plugin: "Il +5 all'iniziativa lo somma chi la tira: il plugin non tira l'iniziativa e non gestisce la sorpresa." }),
  feat("phb", 165, "Appostato", "Skulker", { prerequisite: "Destrezza 13" }),
  feat("phb", 165, "Atleta", "Athlete", { abilities: ["str", "dex"], plugin: AT_TABLE }),
  feat("phb", 165, "Attore", "Actor", { abilities: ["cha"], plugin: AT_TABLE }),
  feat("phb", 166, "Carica", "Charger"),
  feat("phb", 166, "Cecchino Magico", "Spell Sniper", { prerequisite: "Saper lanciare almeno un incantesimo" }),
  feat("phb", 167, "Combattente a Due Armi", "Dual Wielder", {
    plugin: "Il +1 alla CA va compreso nella CA della scheda; il resto si gestisce al tavolo." }),
  feat("phb", 167, "Combattente in Sella", "Mounted Combatant", { plugin: AT_TABLE }),
  feat("phb", 167, "Condottiero Ispiratore", "Inspiring Leader", { prerequisite: "Carisma 13" }),
  feat("phb", 167, "Corazze Leggere", "Lightly Armored", { abilities: ["str", "dex"], plugin: ON_SHEET }),
  feat("phb", 167, "Corazze Medie", "Moderately Armored", { prerequisite: "Competenza nelle armature leggere",
    abilities: ["str", "dex"], plugin: ON_SHEET }),
  feat("phb", 167, "Corazze Pesanti", "Heavily Armored", { prerequisite: "Competenza nelle armature medie",
    abilities: ["str"], plugin: ON_SHEET }),
  feat("phb", 167, "Duellante Difensivo", "Defensive Duelist", { prerequisite: "Destrezza 13" }),
  feat("phb", 167, "Esperto di Balestre", "Crossbow Expert"),
  feat("phb", 167, "Esperto di Dungeon", "Dungeon Delver", { plugin: AT_TABLE }),
  feat("phb", 167, "Fortunato", "Lucky", {
    plugin: "3 punti fortuna, che tornano con il riposo lungo: il pulsante spende un punto, il d20 in più si tira al tavolo.",
    pool: { key: "punti", name: "Punti fortuna", count: 3 } }),
  feat("phb", 167, "Guaritore", "Healer"),
  feat("phb", 168, "Incantatore da Guerra", "War Caster", { prerequisite: "Saper lanciare almeno un incantesimo" }),
  feat("phb", 168, "Incantatore Rituale", "Ritual Caster", { prerequisite: "Intelligenza o Saggezza 13" }),
  feat("phb", 168, "Iniziato alla Magia", "Magic Initiate"),
  feat("phb", 168, "Linguista", "Linguist", { abilities: ["int"],
    plugin: "Le lingue vanno riportate nella scheda del personaggio." }),
  feat("phb", 168, "Lottatore", "Grappler", { prerequisite: "Forza 13", srdEntryId: "lottatore", srdText: GRAPPLER_SRD_TEXT }),
  feat("phb", 168, "Lottatore da Taverna", "Tavern Brawler", { abilities: ["str", "con"] }),
  feat("phb", 168, "Maestro d'Armi", "Weapon Master", { abilities: ["str", "dex"], plugin: ON_SHEET }),
  feat("phb", 168, "Maestro d'Armi Possenti", "Great Weapon Master"),
  feat("phb", 169, "Maestro degli Scudi", "Shield Master"),
  feat("phb", 169, "Maestro delle Armature Medie", "Medium Armor Master", { prerequisite: "Competenza nelle armature medie",
    plugin: "La CA va scritta nella scheda; il resto si gestisce al tavolo." }),
  feat("phb", 169, "Maestro delle Armature Pesanti", "Heavy Armor Master", { prerequisite: "Competenza nelle armature pesanti",
    abilities: ["str"] }),
  feat("phb", 170, "Maestro delle Armi su Asta", "Polearm Master"),
  feat("phb", 170, "Mente Acuta", "Keen Mind", { abilities: ["int"], plugin: AT_TABLE }),
  feat("phb", 170, "Mobilità", "Mobile"),
  feat("phb", 170, "Osservatore", "Observant", { abilities: ["int", "wis"],
    plugin: "Il +5 alla Percezione passiva va compreso in quella della scheda." }),
  feat("phb", 170, "Resiliente", "Resilient", { abilities: ALL_ABILITIES,
    plugin: "La competenza nel tiro salvezza va compresa nel totale della scheda." }),
  // Its line is counted on the character's level (featPluginLine).
  feat("phb", 170, "Robusto", "Tough", { plugin: "+2 PF massimi per livello, da comprendere nei PF massimi della scheda: il plugin non li scrive." }),
  feat("phb", 170, "Sentinella", "Sentinel"),
  feat("phb", 170, "Sterminatore di Maghi", "Mage Slayer"),
  feat("phb", 170, "Tenace", "Durable", { abilities: ["con"] }),
  feat("phb", 170, "Tiratore Scelto", "Sharpshooter"),

  // Guida Omnicomprensiva di Xanathar, capitolo 1, pp. 73–75: the racial feats.
  feat("xge", 74, "Agilità Tarchiata", "Squat Nimbleness", { prerequisite: "Nano o specie di taglia Piccola",
    species: [...DWARVES, ...SMALL], abilities: ["str", "dex"] }),
  feat("xge", 74, "Alta Magia Drow", "Drow High Magic", { prerequisite: "Elfo (drow)", species: ["elfo"], speciesOptions: ["drow"] }),
  feat("xge", 74, "Costituzione Infernale", "Infernal Constitution", { prerequisite: "Tiefling", species: TIEFLINGS,
    abilities: ["con"] }),
  feat("xge", 74, "Fiamme di Flegesto", "Flames of Phlegethos", { prerequisite: "Tiefling", species: TIEFLINGS,
    abilities: ["int", "cha"] }),
  feat("xge", 74, "Fortuna Generosa", "Bountiful Luck", { prerequisite: "Halfling", species: HALFLINGS,
    plugin: "Si gestisce al tavolo: gli avvisi di reazione non vedono i tiri." }),
  feat("xge", 74, "Furia Orchesca", "Orcish Fury", { prerequisite: "Mezzorco", species: ["mezzorco"], abilities: ["str", "con"] }),
  feat("xge", 74, "Magia degli Elfi dei Boschi", "Wood Elf Magic", { prerequisite: "Elfo (dei boschi)", species: ["elfo"],
    speciesOptions: ["boschi"] }),
  feat("xge", 74, "Paura Draconica", "Dragon Fear", { prerequisite: "Dragonide", species: DRAGONBORN, abilities: ["str", "con", "cha"] }),
  feat("xge", 75, "Pelle di Drago", "Dragon Hide", { prerequisite: "Dragonide", species: DRAGONBORN, abilities: ["str", "con", "cha"] }),
  feat("xge", 75, "Precisione Elfica", "Elven Accuracy", { prerequisite: "Elfo o mezzelfo", species: [...ELVES, ...HALF_ELVES],
    abilities: ["dex", "int", "wis", "cha"], plugin: "Si gestisce al tavolo, con i dadi." }),
  feat("xge", 75, "Prodigio", "Prodigy", { prerequisite: "Mezzelfo, mezzorco o umano", species: [...HALF_ELVES, "mezzorco", "umano"],
    plugin: ON_SHEET }),
  feat("xge", 75, "Scomparire", "Fade Away", { prerequisite: "Gnomo", species: GNOMES, abilities: ["dex", "int"] }),
  feat("xge", 75, "Seconda Possibilità", "Second Chance", { prerequisite: "Halfling", species: HALFLINGS,
    abilities: ["dex", "con", "cha"] }),
  feat("xge", 75, "Teletrasporto Fatato", "Fey Teleportation", { prerequisite: "Elfo (alto)", species: ["elfo"],
    speciesOptions: ["alto"], abilities: ["int", "cha"] }),
  feat("xge", 75, "Tempra Nanica", "Dwarven Fortitude", { prerequisite: "Nano", species: DWARVES, abilities: ["con"] }),

  // Calderone Omnicomprensivo di Tasha, capitolo 1, pp. 79–81.
  feat("tce", 79, "Abilità Impeccabile", "Skill Expert", { abilities: ALL_ABILITIES, plugin: ON_SHEET }),
  feat("tce", 79, "Adepto di Metamagia", "Metamagic Adept", { prerequisite: "Lanciare Incantesimi o Magia del Patto" }),
  feat("tce", 79, "Adepto Occulto", "Eldritch Adept", { prerequisite: "Lanciare Incantesimi o Magia del Patto" }),
  feat("tce", 79, "Bisturi da Battaglia", "Slasher", { abilities: ["str", "dex"] }),
  feat("tce", 80, "Contaminazione Fatata", "Fey Touched", { abilities: ["int", "wis", "cha"] }),
  feat("tce", 80, "Contaminazione Ombrosa", "Shadow Touched", { abilities: ["int", "wis", "cha"] }),
  feat("tce", 80, "Cuoco", "Chef", { abilities: ["con", "wis"] }),
  feat("tce", 80, "Maestria dei Veleni", "Poisoner"),
  feat("tce", 80, "Martello Vivente", "Crusher", { abilities: ["str", "con"] }),
  feat("tce", 80, "Pistolero", "Gunner", { abilities: ["dex"], plugin: AT_TABLE }),
  feat("tce", 80, "Rudimenti da Artefice", "Artificer Initiate"),
  feat("tce", 81, "Rudimenti da Guerriero", "Fighting Initiate", { prerequisite: "Competenza in un'arma da guerra" }),
  feat("tce", 81, "Stile Penetrante", "Piercer", { abilities: ["str", "dex"] }),
  feat("tce", 81, "Telecinesi", "Telekinetic", { abilities: ["int", "wis", "cha"] }),
  feat("tce", 81, "Telepatia", "Telepathic", { abilities: ["int", "wis", "cha"] }),
];

// "Maestro d'Armi Possenti" -> "maestro-d-armi-possenti": the slug of the pack's entries (generate-srd-rules-reference.mjs).
export function featSlug(value) {
  return String(value ?? "")
    .toLocaleLowerCase("it")
    .normalize("NFD")
    .replace(/[̀-ͯ]/gu, "")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "");
}

export const FEATS = Object.freeze(DEFINITIONS.map((definition) => {
  const book = BOOKS[definition.book];
  const id = featSlug(definition.name);
  return Object.freeze({
    id,
    name: definition.name,
    english: definition.english,
    aliases: Object.freeze([definition.english]),
    source: book.source,
    sourceLabel: book.sourceLabel,
    page: definition.page,
    rulesEntryId: `${book.prefix}-${id}`,
    prerequisite: definition.prerequisite,
    abilityChoices: Object.freeze([...definition.abilities]),
    choices: Object.freeze([...definition.choices]),
    speciesIds: Object.freeze([...definition.species]),
    speciesOptionIds: Object.freeze([...definition.speciesOptions]),
    repeatable: definition.repeatable,
    plugin: definition.plugin,
    pool: definition.pool ? Object.freeze({ ...definition.pool }) : null,
    srdEntryId: definition.srdEntryId,
    srdText: definition.srdText,
  });
}));
const FEAT_BY_ID = new Map(FEATS.map((entry) => [entry.id, entry]));

export function getFeat(id) {
  return FEAT_BY_ID.get(String(id ?? "").trim()) || null;
}

// The record id of a feat: "talento-robusto".
export function featFeatureId(featId) {
  return `talento-${featId}`;
}

const pool = (id, name, capacity) => Object.freeze({
  id, name, capacity: Object.freeze({ type: "fixed", value: capacity }), maximumByClassLevel: null,
  refresh: Object.freeze([Object.freeze({ event: "riposo_lungo", amount: "massimo" })]), refreshByClassLevel: Object.freeze([]),
});
const featPoolId = (entry) => `${featFeatureId(entry.id)}-${entry.pool.key}-usi`;

export const FEAT_RESOURCE_POOLS = Object.freeze(FEATS.filter((entry) => entry.pool)
  .map((entry) => pool(featPoolId(entry), entry.pool.name, entry.pool.count)));

const NOT_AUTOMATED = Object.freeze({ status: "not-automated", adapter: null, reason: "adapter-not-implemented" });
// A use resolved at the table: the button only spends it (speciesTraitCore.js, RESOURCE_ONLY).
const RESOURCE_ONLY = Object.freeze({ status: "implemented", adapter: "resource-only", reason: null });
const SELF_TARGETING = Object.freeze({ mode: "self", rangeMeters: null, maxTargets: 1, excludeSource: false });
export const FEAT_THEME = Object.freeze({ emoji: "🎖️", accent: "#facc15", background: "#422006", text: "#fefce8" });

function featRecord(entry) {
  const poolId = entry.pool ? featPoolId(entry) : "";
  return Object.freeze({
    id: featFeatureId(entry.id),
    name: entry.name,
    // The "Nel plugin" line: the rules text is the pack's entry (rulesEntryId).
    description: entry.plugin,
    classId: "",
    subclassId: "",
    featId: entry.id,
    minimumLevel: 1,
    source: entry.source,
    sourceLabel: entry.sourceLabel,
    page: entry.page,
    rulesEntryId: entry.rulesEntryId,
    // Lottatore's SRD text, shown without the pack (classFeatureDescriptions.js).
    ...(entry.srdText ? { srdText: entry.srdText } : {}),
    collection: "talenti",
    defaultEnabled: true,
    automationLevel: poolId ? "manuale" : "riferimento",
    completenessStatus: poolId ? "partial" : "reference",
    runtimeRequirements: Object.freeze([]),
    missingForExecution: Object.freeze([]),
    runtimeSupport: poolId ? RESOURCE_ONLY : NOT_AUTOMATED,
    activation: Object.freeze({ primary: poolId ? "innesco" : "passiva" }),
    trackedResourcePoolIds: Object.freeze(poolId ? [poolId] : []),
    targetMode: "self",
    targeting: SELF_TARGETING,
    theme: FEAT_THEME,
    effectPlan: null,
    breaksConcentration: false,
    duration: Object.freeze({ rounds: null }),
    trackingMode: "instant",
    resourceCosts: Object.freeze(poolId ? [Object.freeze({ poolId, amount: 1 })] : []),
  });
}

export const FEAT_FEATURES = Object.freeze(FEATS.map(featRecord));
const FEATURES_BY_FEAT = new Map(FEAT_FEATURES.map((feature) => [feature.featId, [feature]]));

const FEAT_ID = /^[a-z0-9][a-z0-9-]{0,47}$/u;
const CHOICE_KEY = /^[a-zA-Z][a-zA-Z0-9]{0,23}$/u;
const MAX_CHOICE_KEYS = 8;
const MAX_CHOICE_LIST = 12;
const MAX_CHOICE_TEXT = 64;

function sanitizeChoiceValue(value) {
  if (typeof value === "string") return value.trim().slice(0, MAX_CHOICE_TEXT) || undefined;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "boolean") return value;
  if (!Array.isArray(value)) return undefined;
  const list = value.filter((item) => typeof item === "string").map((item) => item.trim().slice(0, MAX_CHOICE_TEXT))
    .filter(Boolean).slice(0, MAX_CHOICE_LIST);
  return list.length ? list : undefined;
}

// The choices of a feat as plain values: strings, numbers, booleans and lists of strings, under short keys. Keys this
// version does not use stay (a newer client's spells or class).
function sanitizeFeatChoice(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value)
    .filter(([key]) => CHOICE_KEY.test(key))
    .slice(0, MAX_CHOICE_KEYS)
    .map(([key, item]) => [key, sanitizeChoiceValue(item)])
    .filter(([, item]) => item !== undefined);
  return entries.length ? Object.fromEntries(entries) : null;
}

// { id, ability?, choice? } or null. The shape only: an unknown id stays.
export function sanitizeFeatEntry(value) {
  const source = typeof value === "string" ? { id: value } : value;
  if (!source || typeof source !== "object" || Array.isArray(source)) return null;
  const id = String(source.id ?? "").trim();
  if (!FEAT_ID.test(id)) return null;
  const entry = { id };
  if (FEAT_ABILITY_KEYS.includes(source.ability)) entry.ability = source.ability;
  const choice = sanitizeFeatChoice(source.choice);
  if (choice) entry.choice = choice;
  return entry;
}

export function sanitizeFeats(value) {
  return (Array.isArray(value) ? value : []).map(sanitizeFeatEntry).filter(Boolean).slice(0, MAX_FEATS);
}

export function hasFeats(value) {
  return sanitizeFeats(value).length > 0;
}

// The records of the profile's feats, in the sheet's order, each once (Elemental Adept may be taken twice). An id
// this version does not know gives none.
export function featFeaturesForProfile(profile) {
  const seen = new Set();
  const result = [];
  for (const entry of sanitizeFeats(profile?.[FEATS_FIELD])) {
    for (const feature of FEATURES_BY_FEAT.get(entry.id) || []) {
      if (seen.has(feature.id)) continue;
      seen.add(feature.id);
      result.push(feature);
    }
  }
  return result;
}

// "Robusto", "Adepto Elementale · fuoco", "Atleta · Des"; an unknown id says so.
export function featDisplayName(entry) {
  const clean = sanitizeFeatEntry(entry);
  if (!clean) return "";
  const definition = getFeat(clean.id);
  if (!definition) return `Talento sconosciuto (${clean.id})`;
  const damageType = FEAT_DAMAGE_TYPES.find((type) => type.id === clean.choice?.damageType);
  return [
    definition.name,
    clean.ability && definition.abilityChoices.length > 1 ? ABILITY_SHORT[clean.ability] : "",
    damageType?.label || "",
  ].filter(Boolean).join(" · ");
}

function totalCharacterLevel(profile) {
  const build = Array.isArray(profile?.characterBuild) ? profile.characterBuild : [];
  return Math.min(20, build.reduce((total, entry) => total + (Number.isInteger(entry?.level) ? entry.level : 0), 0));
}

// The "Nel plugin" line of a feat's card, with the half feat's ability: Robusto's counted on the character's level.
export function featPluginLine(feature, profile = null) {
  const definition = getFeat(feature?.featId);
  if (!definition) return "";
  const level = totalCharacterLevel(profile);
  const line = definition.id === "robusto" && level
    ? `+${2 * level} PF massimi al ${level}° livello (2 per livello), da comprendere nei PF massimi della scheda: il plugin non li scrive.`
    : definition.plugin;
  if (!definition.abilityChoices.length) return line;
  const chosen = sanitizeFeats(profile?.[FEATS_FIELD]).find((entry) => entry.id === definition.id)?.ability;
  const abilities = chosen ? [chosen] : definition.abilityChoices;
  const names = abilities.map((key) => FEAT_ABILITY_LABELS[key]);
  const raised = names.length > 2 ? `${names.slice(0, -1).join(", ")} o ${names.at(-1)}` : names.join(" o ");
  return `${line} Il +1 a ${raised} è già nei modificatori della scheda.`;
}

// The sheet's warnings, never blocks (decision D8), one list per entry: a racial feat on another species, a feat
// taken twice (Elemental Adept only with another type).
export function featWarnings(entries, species = null) {
  const list = (Array.isArray(entries) ? entries : []).map(sanitizeFeatEntry);
  const speciesId = String(species?.id || "").trim();
  const optionId = String(species?.ancestryId || "").trim();
  return list.map((entry, index) => {
    const definition = entry ? getFeat(entry.id) : null;
    if (!definition) return [];
    const warnings = [];
    if (speciesId && definition.speciesIds.length && (!definition.speciesIds.includes(speciesId)
      || (definition.speciesOptionIds.length && !definition.speciesOptionIds.includes(optionId)))) {
      warnings.push(`Richiede: ${definition.prerequisite}.`);
    }
    const twin = list.slice(0, index).some((other) => other?.id === entry.id
      && (!definition.repeatable || (other.choice?.damageType || "") === (entry.choice?.damageType || "")));
    if (twin) warnings.push(definition.repeatable ? "Già scelto con lo stesso tipo di danno." : "Già scelto.");
    return warnings;
  });
}
