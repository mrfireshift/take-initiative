// Species traits stored in the Actor Profile (initiativeCard.species).
// Pure data: no SDK, no metadata writes. Traits use the class-feature record shape, so the
// class-feature runtime activates them (pill, duration, resource pool) like any other feature.
// The profile stores { id, ancestryId }: ancestryId is the species option, a dragonborn's ancestry or
// a subrace/variant ("ancestries" keeps its name). Species without options leave it empty.
// Tranche 1: the PHB 2014 species and the Fizban's dragonborn variants; tranche 2, declared in
// speciesCatalogVoloMordenkainen.js: Volo, Tomo dei Nemici and Mostri del Multiverso; tranche 3, in
// speciesCatalogCostaElementalEvil.js: Elemental Evil and Costa della Spada; tranche 4, in
// speciesCatalogEberron.js: Eberron; tranche 5, in speciesCatalogRavnicaTheros.js: Ravnica and Theros;
// tranche 6, in speciesCatalogWitchlightStrixhaven.js: Witchlight and Strixhaven (see docs/SPECIE.md).

import { SPECIES_CATALOG_MULTIVERSO, SPECIES_CATALOG_TOMO, SPECIES_CATALOG_VOLO } from "./speciesCatalogVoloMordenkainen.js";
import { SPECIES_CATALOG_COSTA, SPECIES_CATALOG_ELEMENTAL, SPECIES_CATALOG_MULTIVERSO_ELEMENTAL } from "./speciesCatalogCostaElementalEvil.js";
import { SPECIES_CATALOG_EBERRON, SPECIES_CATALOG_MULTIVERSO_EBERRON } from "./speciesCatalogEberron.js";
import { SPECIES_CATALOG_MULTIVERSO_RAVNICA_THEROS, SPECIES_CATALOG_RAVNICA, SPECIES_CATALOG_THEROS } from "./speciesCatalogRavnicaTheros.js";
import { SPECIES_CATALOG_STRIXHAVEN, SPECIES_CATALOG_WITCHLIGHT } from "./speciesCatalogWitchlightStrixhaven.js";

export const SPECIES_FIELD = "species";

const ancestry = (id, label, damageType, damageLabel) => Object.freeze({ id, label, damageType, damageLabel });
// fullName: the option's label names the character by itself ("Marchio dell'ombra (elfo)").
const option = (id, label, { aliases = [], resistances = [], fullName = false } = {}) =>
  Object.freeze({ id, label, aliases: Object.freeze(aliases), resistances: Object.freeze(resistances), immunities: Object.freeze([]), fullName });
const theme = (emoji, accent, background, text) => Object.freeze({ emoji, accent, background, text });
// sourceAliases let the sheet import pick the manual when a species is in more than one.
const book = (source, sourceLabel, sourceAliases) => Object.freeze({ source, sourceLabel, sourceAliases: Object.freeze(sourceAliases) });
const PHB = book("phb2014", "Manuale del Giocatore 2014", ["phb", "manuale del giocatore", "player s handbook", "players handbook"]);
const FIZBAN = book("fizban", "Il Tesoro dei Draghi di Fizban", ["fizban", "ftod", "fizban s treasury of dragons"]);
const BOOKS = Object.freeze({
  elemental: book("elemental-evil", "Elemental Evil Player's Companion", ["eepc", "elemental evil", "elemental evil player s companion"]),
  ravnica: book("ravnica", "Guildmasters' Guide to Ravnica", ["ggr", "ravnica", "guildmasters guide to ravnica", "guildmaster s guide to ravnica"]),
  theros: book("theros", "Mythic Odysseys of Theros", ["moot", "theros", "mythic odysseys of theros", "mitiche odissee di theros"]),
  witchlight: book("witchlight", "The Wild Beyond the Witchlight", ["wbtw", "witchlight", "the wild beyond the witchlight", "wild beyond the witchlight"]),
  strixhaven: book("strixhaven", "Strixhaven: A Curriculum of Chaos", ["scc", "strixhaven", "strixhaven a curriculum of chaos", "strixhaven un curriculum del caos"]),
  eberron: book("eberron", "Eberron: Rising from the Last War", ["erlw", "eberron", "rising from the last war", "eberron rising from the last war"]),
  costa: book("costa-della-spada", "Guida del Giocatore alla Costa della Spada", ["scag", "costa della spada", "sword coast", "sword coast adventurer s guide"]),
  volo: book("volo", "Guida di Volo ai Mostri", ["volo", "vgm", "guida di volo", "volo s guide to monsters"]),
  tomo: book("mordenkainen-nemici", "Il Tomo dei Nemici di Mordenkainen", ["mtof", "tomo dei nemici", "tome of foes", "mordenkainen s tome of foes"]),
  multiverso: book("mostri-multiverso", "Mordenkainen presenta: Mostri del Multiverso", ["motm", "mpmm", "mostri del multiverso", "multiverso", "monsters of the multiverse"]),
});

const DRAGON_ANCESTRIES = Object.freeze({
  nero: ancestry("nero", "Nero", "acid", "acido"),
  blu: ancestry("blu", "Blu", "lightning", "fulmine"),
  verde: ancestry("verde", "Verde", "poison", "veleno"),
  rosso: ancestry("rosso", "Rosso", "fire", "fuoco"),
  bianco: ancestry("bianco", "Bianco", "cold", "freddo"),
  ottone: ancestry("ottone", "Ottone", "fire", "fuoco"),
  bronzo: ancestry("bronzo", "Bronzo", "lightning", "fulmine"),
  rame: ancestry("rame", "Rame", "acid", "acido"),
  oro: ancestry("oro", "Oro", "fire", "fuoco"),
  argento: ancestry("argento", "Argento", "cold", "freddo"),
  ametista: ancestry("ametista", "Ametista", "force", "forza"),
  cristallo: ancestry("cristallo", "Cristallo", "radiant", "radiosi"),
  smeraldo: ancestry("smeraldo", "Smeraldo", "psychic", "psichici"),
  zaffiro: ancestry("zaffiro", "Zaffiro", "thunder", "tuono"),
  topazio: ancestry("topazio", "Topazio", "necrotic", "necrotici"),
});
const pick = (...ids) => Object.freeze(ids.map((id) => DRAGON_ANCESTRIES[id]));

const DRAGON_THEME = theme("🐉", "#a78bfa", "#3b0764", "#f5f3ff");

// optionLabel names the second select; resistances are passive defenses of the whole species,
// an option adds its own. aliases help the sheet import (English names included).
const speciesEntry = ({ id, label, book, optionLabel = "", options = [], resistances = [], immunities = [], aliases = [], look = DRAGON_THEME }) => Object.freeze({
  id, label, ...book, optionLabel, ancestries: Object.freeze(options), resistances: Object.freeze(resistances), immunities: Object.freeze(immunities),
  aliases: Object.freeze(aliases), theme: look,
});

const PHB_SPECIES = [
  speciesEntry({
    id: "nano", label: "Nano", book: PHB, optionLabel: "Sottorazza", resistances: ["poison"], aliases: ["dwarf"],
    look: theme("⛏️", "#f59e0b", "#451a03", "#fffbeb"),
    options: [
      option("colline", "Nano delle colline", { aliases: ["hill dwarf", "delle colline", "gold dwarf", "nano dorato"] }),
      option("montagne", "Nano delle montagne", { aliases: ["mountain dwarf", "delle montagne", "shield dwarf", "nano dello scudo"] }),
    ],
  }),
  speciesEntry({
    id: "elfo", label: "Elfo", book: PHB, optionLabel: "Sottorazza", aliases: ["elf"],
    look: theme("🍃", "#4ade80", "#052e16", "#f0fdf4"),
    options: [
      option("alto", "Alto elfo", { aliases: ["high elf", "elfo alto", "sun elf", "moon elf", "elfo del sole", "elfo della luna"] }),
      option("boschi", "Elfo dei boschi", { aliases: ["wood elf", "dei boschi"] }),
      option("drow", "Elfo oscuro (drow)", { aliases: ["drow", "dark elf", "elfo oscuro"] }),
    ],
  }),
  speciesEntry({
    id: "halfling", label: "Halfling", book: PHB, optionLabel: "Sottorazza",
    look: theme("🍀", "#a3e635", "#1a2e05", "#f7fee7"),
    options: [
      option("piedelesto", "Halfling piedelesto", { aliases: ["lightfoot", "lightfoot halfling", "piedelesto"] }),
      option("tozzo", "Halfling tozzo", { aliases: ["stout", "stout halfling", "tozzo", "strongheart", "strongheart halfling"], resistances: ["poison"] }),
    ],
  }),
  speciesEntry({
    id: "umano", label: "Umano", book: PHB, optionLabel: "Variante", aliases: ["human"],
    look: theme("🧭", "#94a3b8", "#0f172a", "#f8fafc"),
    options: [
      option("standard", "Umano", { aliases: ["human", "umano standard"] }),
      option("variante", "Umano variante", { aliases: ["variant human", "variant", "variante"] }),
    ],
  }),
  speciesEntry({
    id: "dragonide", label: "Dragonide", book: PHB, optionLabel: "Ascendenza", aliases: ["dragonborn"],
    options: pick("nero", "blu", "ottone", "bronzo", "rame", "oro", "verde", "rosso", "argento", "bianco"),
  }),
  speciesEntry({
    id: "gnomo", label: "Gnomo", book: PHB, optionLabel: "Sottorazza", aliases: ["gnome"],
    look: theme("⚙️", "#2dd4bf", "#042f2e", "#f0fdfa"),
    options: [
      option("foreste", "Gnomo delle foreste", { aliases: ["forest gnome", "delle foreste"] }),
      option("rocce", "Gnomo delle rocce", { aliases: ["rock gnome", "delle rocce"] }),
    ],
  }),
  speciesEntry({
    id: "mezzelfo", label: "Mezzelfo", book: PHB, aliases: ["half elf", "mezz elfo"],
    look: theme("🌗", "#818cf8", "#1e1b4b", "#eef2ff"),
  }),
  speciesEntry({
    id: "mezzorco", label: "Mezzorco", book: PHB, aliases: ["half orc", "mezz orco"],
    look: theme("🪓", "#f87171", "#450a0a", "#fef2f2"),
  }),
  speciesEntry({
    id: "tiefling", label: "Tiefling", book: PHB, resistances: ["fire"],
    look: theme("😈", "#fb7185", "#4c0519", "#fff1f2"),
  }),
];

const FIZBAN_SPECIES = [
  speciesEntry({
    id: "dragonide-cromatico", label: "Dragonide cromatico", book: FIZBAN, optionLabel: "Ascendenza", aliases: ["chromatic dragonborn"],
    options: pick("nero", "blu", "verde", "rosso", "bianco"),
  }),
  speciesEntry({
    id: "dragonide-metallico", label: "Dragonide metallico", book: FIZBAN, optionLabel: "Ascendenza", aliases: ["metallic dragonborn"],
    options: pick("ottone", "bronzo", "rame", "oro", "argento"),
  }),
  speciesEntry({
    id: "dragonide-gemma", label: "Dragonide di gemma", book: FIZBAN, optionLabel: "Ascendenza", aliases: ["gem dragonborn"],
    options: pick("ametista", "cristallo", "smeraldo", "zaffiro", "topazio"),
  }),
];

// A catalog entry (speciesCatalogVoloMordenkainen.js) as a species of the select.
// alsoIn: manuals with the same text (the Elemental Evil goliath is the Volo one), for the import.
const catalogBook = (spec) => (spec.alsoIn?.length
  ? book(BOOKS[spec.book].source, BOOKS[spec.book].sourceLabel, [...BOOKS[spec.book].sourceAliases,
    ...spec.alsoIn.flatMap((key) => [BOOKS[key].source, BOOKS[key].sourceLabel, ...BOOKS[key].sourceAliases])])
  : BOOKS[spec.book]);
const catalogSpecies = (spec) => speciesEntry({
  id: spec.id, label: spec.label, book: catalogBook(spec), optionLabel: spec.optionLabel || "",
  options: (spec.options || []).map((entry) => option(entry.id, entry.label, { aliases: entry.aliases, resistances: entry.resistances || [], fullName: entry.fullName === true })),
  resistances: spec.resistances || [], immunities: spec.immunities || [], aliases: spec.aliases || [], look: theme(...spec.look),
});
// Mostri del Multiverso gathers the reprints of several tranches, in its own alphabetical order.
const MULTIVERSO = [...SPECIES_CATALOG_MULTIVERSO, ...SPECIES_CATALOG_MULTIVERSO_ELEMENTAL, ...SPECIES_CATALOG_MULTIVERSO_EBERRON, ...SPECIES_CATALOG_MULTIVERSO_RAVNICA_THEROS]
  .sort((left, right) => left.label.localeCompare(right.label, "it"));
const BEFORE_FIZBAN = [...SPECIES_CATALOG_ELEMENTAL, ...SPECIES_CATALOG_COSTA, ...SPECIES_CATALOG_VOLO, ...SPECIES_CATALOG_TOMO,
  ...SPECIES_CATALOG_RAVNICA, ...SPECIES_CATALOG_EBERRON, ...SPECIES_CATALOG_THEROS, ...SPECIES_CATALOG_WITCHLIGHT];
const AFTER_FIZBAN = [...SPECIES_CATALOG_STRIXHAVEN];
const CATALOG = [...BEFORE_FIZBAN, ...AFTER_FIZBAN, ...MULTIVERSO];

// In order of publication: the select groups them by manual.
export const SPECIES = Object.freeze([
  ...PHB_SPECIES,
  ...BEFORE_FIZBAN.map(catalogSpecies),
  ...FIZBAN_SPECIES,
  ...AFTER_FIZBAN.map(catalogSpecies),
  ...MULTIVERSO.map(catalogSpecies),
]);
const SPECIES_BY_ID = new Map(SPECIES.map((entry) => [entry.id, entry]));

export function getSpecies(id) {
  return SPECIES_BY_ID.get(String(id || "").trim()) || null;
}

export function sanitizeSpecies(value) {
  const species = getSpecies(value?.id);
  if (!species) return null;
  const ancestryId = String(value?.ancestryId || "").trim();
  return { id: species.id, ancestryId: species.ancestries.some((entry) => entry.id === ancestryId) ? ancestryId : "" };
}

export function speciesAncestry(value) {
  const clean = sanitizeSpecies(value);
  return clean ? getSpecies(clean.id).ancestries.find((entry) => entry.id === clean.ancestryId) || null : null;
}

// A species with options (ancestry, subrace, variant) is complete only once one is chosen.
export function speciesOptionMissing(value) {
  const clean = sanitizeSpecies(value);
  return Boolean(clean && getSpecies(clean.id).ancestries.length && !clean.ancestryId);
}

export function speciesDisplayName(value) {
  const clean = sanitizeSpecies(value);
  if (!clean) return "";
  const ancestryValue = speciesAncestry(clean);
  const label = getSpecies(clean.id).label;
  if (!ancestryValue) return label;
  if (ancestryValue.damageLabel) return `${label} (${ancestryValue.label.toLocaleLowerCase("it")} · ${ancestryValue.damageLabel})`;
  // "Alto elfo" names its species; "Alato" (a tiefling variant) needs it: "Tiefling (alato)".
  return ancestryValue.fullName || ancestryValue.label.toLocaleLowerCase("it").includes(label.toLocaleLowerCase("it"))
    ? ancestryValue.label
    : `${label} (${ancestryValue.label.toLocaleLowerCase("it")})`;
}

// Passive defenses of the profile: the species' own (a dwarf's poison resistance, a yuan-ti's poison
// immunity), the option's (a stout halfling's) and a dragonborn's ancestry damage type.
export function speciesDamageDefenses(value) {
  const clean = sanitizeSpecies(value);
  if (!clean) return {};
  const ancestryValue = speciesAncestry(clean);
  const resistances = [...new Set([
    ...getSpecies(clean.id).resistances,
    ...(ancestryValue?.resistances || []),
    ...(ancestryValue?.damageType ? [ancestryValue.damageType] : []),
  ])];
  const immunities = [...new Set([...getSpecies(clean.id).immunities, ...(ancestryValue?.immunities || [])])];
  return {
    ...(immunities.length ? { immunities } : {}),
    ...(resistances.length ? { resistances } : {}),
  };
}

const SELF_TARGETING = Object.freeze({ mode: "self", rangeMeters: null, maxTargets: 1, excludeSource: false });
const NOT_AUTOMATED = Object.freeze({ status: "not-automated", adapter: null, reason: "adapter-not-implemented" });
const CONDITION_ADAPTER = Object.freeze({ status: "implemented", adapter: "condition", reason: null });
// A trait resolved at the table: the button only spends its use, without pills or effects.
const RESOURCE_ONLY = Object.freeze({ status: "implemented", adapter: "resource-only", reason: null });

const pool = (id, name, capacity, refresh) => Object.freeze({
  id, name, capacity: Object.freeze(capacity), maximumByClassLevel: null,
  refresh: Object.freeze(refresh.map((event) => Object.freeze({ event, amount: "massimo" }))), refreshByClassLevel: Object.freeze([]),
});

export const SPECIES_RESOURCE_POOLS = Object.freeze([
  pool("specie-dragonide-arma-a-soffio-usi", "Arma a soffio", { type: "fixed", value: 1 }, ["riposo_breve", "riposo_lungo"]),
  pool("specie-dragonide-fizban-arma-a-soffio-usi", "Arma a soffio", { type: "formula", expression: "bonus_competenza" }, ["riposo_lungo"]),
  pool("specie-dragonide-cromatico-interdizione-cromatica-usi", "Interdizione Cromatica", { type: "fixed", value: 1 }, ["riposo_lungo"]),
  pool("specie-dragonide-metallico-arma-a-soffio-metallica-usi", "Arma a soffio metallica", { type: "fixed", value: 1 }, ["riposo_lungo"]),
  pool("specie-dragonide-gemma-volo-della-gemma-usi", "Volo della Gemma", { type: "fixed", value: 1 }, ["riposo_lungo"]),
  pool("specie-elfo-drow-luminescenza-usi", "Magia drow: Luminescenza", { type: "fixed", value: 1 }, ["riposo_lungo"]),
  pool("specie-elfo-drow-oscurita-usi", "Magia drow: Oscurità", { type: "fixed", value: 1 }, ["riposo_lungo"]),
  pool("specie-mezzorco-tenacia-implacabile-usi", "Tenacia implacabile", { type: "fixed", value: 1 }, ["riposo_lungo"]),
  pool("specie-tiefling-intimorire-infernale-usi", "Eredità infernale: Intimorire infernale", { type: "fixed", value: 1 }, ["riposo_lungo"]),
  pool("specie-tiefling-oscurita-usi", "Eredità infernale: Oscurità", { type: "fixed", value: 1 }, ["riposo_lungo"]),
  ...CATALOG.flatMap((spec) => (spec.pools || []).map((entry) => pool(
    `specie-${spec.id}-${entry.key}-usi`, entry.name,
    // count: 1, "pb" or a pool formula ("max(1, modificatore_costituzione)").
    entry.count === "pb" ? { type: "formula", expression: "bonus_competenza" }
      : typeof entry.count === "string" ? { type: "formula", expression: entry.count } : { type: "fixed", value: entry.count },
    entry.rest === "breve" ? ["riposo_breve", "riposo_lungo"] : ["riposo_lungo"],
  ))),
]);

function trait({ key, speciesId, ancestryValue, name, description, minimumLevel = 1, activation, poolId, effectPlan = null, rounds = null, page }) {
  const species = getSpecies(speciesId);
  return Object.freeze({
    id: `specie-${speciesId}-${key}-${ancestryValue.id}`,
    name,
    description,
    classId: "",
    subclassId: "",
    speciesId,
    ancestryId: ancestryValue.id,
    minimumLevel,
    source: species.source,
    sourceLabel: species.sourceLabel,
    page,
    collection: "tratti-specie",
    defaultEnabled: true,
    automationLevel: effectPlan ? "assistita" : "manuale",
    completenessStatus: "partial",
    runtimeRequirements: Object.freeze([]),
    missingForExecution: Object.freeze([]),
    runtimeSupport: effectPlan ? CONDITION_ADAPTER : RESOURCE_ONLY,
    activation: Object.freeze({ primary: activation }),
    trackedResourcePoolIds: Object.freeze([poolId]),
    targetMode: "self",
    targeting: SELF_TARGETING,
    theme: species.theme,
    effectPlan,
    breaksConcentration: false,
    duration: Object.freeze({ rounds }),
    trackingMode: effectPlan ? "active" : "instant",
    resourceCosts: Object.freeze([Object.freeze({ poolId, amount: 1 })]),
  });
}

function breathWeapon(speciesId, ancestryValue) {
  const phb = speciesId === "dragonide";
  return trait({
    key: "arma-a-soffio", speciesId, ancestryValue, name: `Arma a soffio (${ancestryValue.damageLabel})`, activation: phb ? "azione" : "azione_attacco",
    poolId: phb ? "specie-dragonide-arma-a-soffio-usi" : "specie-dragonide-fizban-arma-a-soffio-usi", page: phb ? 34 : 20,
    description: phb
      ? `Esala energia distruttiva: danni da ${ancestryValue.damageLabel} 2d6 (3d6 al 6°, 4d6 all'11°, 5d6 al 16° livello), TS con CD 8 + Costituzione + competenza, metà se superato. Una volta per riposo breve o lungo.`
      : `Sostituisce un attacco: cono di 4,5 m o linea di 9 m, TS Destrezza con CD 8 + Costituzione + competenza, 1d10 danni da ${ancestryValue.damageLabel} (2d10 al 5°, 3d10 all'11°, 4d10 al 17° livello), metà se superato. Usi pari al bonus di competenza per riposo lungo.`,
  });
}

function chromaticWarding(ancestryValue) {
  return trait({
    key: "interdizione-cromatica", speciesId: "dragonide-cromatico", ancestryValue, name: "Interdizione Cromatica", minimumLevel: 5,
    activation: "azione", poolId: "specie-dragonide-cromatico-interdizione-cromatica-usi", rounds: 10, page: 21,
    description: `Dal 5° livello, con un'azione, ottieni per 1 minuto l'immunità ai danni da ${ancestryValue.damageLabel}. Una volta per riposo lungo.`,
    effectPlan: Object.freeze({
      kind: "condition",
      conditionName: "Interdizione Cromatica",
      effectKind: "buff",
      detail: `Immunità ai danni da ${ancestryValue.damageLabel} per 1 minuto.`,
      mechanics: Object.freeze({ damageDefenses: Object.freeze({ immunities: Object.freeze([ancestryValue.damageType]) }) }),
    }),
  });
}

function metallicBreath(ancestryValue) {
  return trait({
    key: "arma-a-soffio-metallica", speciesId: "dragonide-metallico", ancestryValue, name: "Arma a soffio metallica", minimumLevel: 5,
    activation: "azione", poolId: "specie-dragonide-metallico-arma-a-soffio-metallica-usi", page: 22,
    description: "Dal 5° livello, con un'azione, cono di 4,5 m: TS Costituzione (soffio debilitante, Incapacitato fino all'inizio del tuo prossimo turno) o TS Forza (soffio repulsivo, spinto di 6 m e Prono). Una volta per riposo lungo.",
  });
}

function gemFlight(ancestryValue) {
  return trait({
    key: "volo-della-gemma", speciesId: "dragonide-gemma", ancestryValue, name: "Volo della Gemma", minimumLevel: 5,
    activation: "azione_bonus", poolId: "specie-dragonide-gemma-volo-della-gemma-usi", rounds: 10, page: 21,
    description: "Dal 5° livello, con un'azione bonus, ali spettrali ti danno per 1 minuto una velocità di volare pari alla velocità camminando; puoi fluttuare. Una volta per riposo lungo.",
    effectPlan: Object.freeze({
      kind: "condition",
      conditionName: "Volo della Gemma",
      displayLabel: "Volo della Gemma · Volo",
      effectKind: "buff",
      detail: "Velocità di volare pari alla velocità camminando per 1 minuto; può fluttuare.",
    }),
  });
}

const DRAGONBORN_IDS = new Set(["dragonide", "dragonide-cromatico", "dragonide-metallico", "dragonide-gemma"]);

const DRAGONBORN_FEATURES = SPECIES.filter((entry) => DRAGONBORN_IDS.has(entry.id)).flatMap((species) => species.ancestries.flatMap((ancestryValue) => [
  breathWeapon(species.id, ancestryValue),
  ...(species.id === "dragonide-cromatico" ? [chromaticWarding(ancestryValue)] : []),
  ...(species.id === "dragonide-metallico" ? [metallicBreath(ancestryValue)] : []),
  ...(species.id === "dragonide-gemma" ? [gemFlight(ancestryValue)] : []),
]));

// A trait of the whole species (optionId empty) or of one subrace/variant. Passive traits are a
// reference card; the others spend their own use with a button and are resolved at the table. Proficiencies,
// languages, ability scores and plain darkvision stay out: they are part of the sheet, not of play.
// optionId may be a list: the trait then belongs to each of those options (an ibrido Simic's pairs).
function speciesTrait({ speciesId, optionId = "", key, name, page, description, activation = "passiva", minimumLevel = 1, poolId = "", effectPlan = null, rounds = null }) {
  const species = getSpecies(speciesId);
  const passive = activation === "passiva";
  // A trait with an effect plan (an aasimar's transformation) puts a pill on the character.
  const runtimeSupport = effectPlan ? CONDITION_ADAPTER : passive ? NOT_AUTOMATED : RESOURCE_ONLY;
  return Object.freeze({
    id: `specie-${speciesId}-${key}`,
    name,
    description,
    classId: "",
    subclassId: "",
    speciesId,
    ancestryId: Array.isArray(optionId) ? "" : optionId,
    ...(Array.isArray(optionId) ? { ancestryIds: Object.freeze([...optionId]) } : {}),
    minimumLevel,
    source: species.source,
    sourceLabel: species.sourceLabel,
    page,
    collection: "tratti-specie",
    defaultEnabled: true,
    automationLevel: effectPlan ? "assistita" : passive ? "riferimento" : "manuale",
    completenessStatus: passive ? "reference" : "partial",
    runtimeRequirements: Object.freeze([]),
    missingForExecution: Object.freeze([]),
    runtimeSupport,
    activation: Object.freeze({ primary: activation }),
    trackedResourcePoolIds: Object.freeze(poolId ? [poolId] : []),
    targetMode: "self",
    targeting: SELF_TARGETING,
    theme: species.theme,
    effectPlan,
    breaksConcentration: false,
    duration: Object.freeze({ rounds }),
    trackingMode: effectPlan ? "active" : "instant",
    resourceCosts: Object.freeze(poolId ? [Object.freeze({ poolId, amount: 1 })] : []),
  });
}

// Tranche 1: Manuale del Giocatore 2014, capitolo 2. Pages of the book, to check on the manual.
const PHB_FEATURES = [
  speciesTrait({ speciesId: "nano", key: "resilienza-nanica", name: "Resilienza nanica", page: 20,
    description: "Vantaggio ai tiri salvezza contro il veleno. La resistenza ai danni da veleno è già applicata alle difese." }),
  speciesTrait({ speciesId: "nano", optionId: "colline", key: "robustezza-nanica", name: "Robustezza nanica", page: 20,
    description: "Il massimo dei punti ferita aumenta di 1 e di 1 a ogni livello successivo: va compreso nei PF massimi della scheda." }),

  speciesTrait({ speciesId: "elfo", key: "ascendenza-fatata", name: "Ascendenza fatata", page: 23,
    description: "Vantaggio ai tiri salvezza per non essere affascinato; la magia non può farti addormentare." }),
  speciesTrait({ speciesId: "elfo", optionId: "alto", key: "trucchetto", name: "Trucchetto", page: 24,
    description: "Conosci un trucchetto a scelta dalla lista del mago, con Intelligenza come caratteristica da incantatore: aggiungilo al libro degli incantesimi." }),
  speciesTrait({ speciesId: "elfo", optionId: "boschi", key: "piede-lesto", name: "Piede lesto", page: 24,
    description: "Velocità base sul terreno 10,5 m: impostala nella velocità del profilo." }),
  speciesTrait({ speciesId: "elfo", optionId: "boschi", key: "maschera-della-selva", name: "Maschera della selva", page: 24,
    description: "Puoi tentare di nasconderti anche quando sei solo leggermente oscurato da fogliame, pioggia fitta, neve che cade, nebbia o altri fenomeni naturali." }),
  speciesTrait({ speciesId: "elfo", optionId: "drow", key: "sensibilita-alla-luce-del-sole", name: "Sensibilità alla luce del sole", page: 24,
    description: "Svantaggio ai tiri per colpire e alle prove di Saggezza (Percezione) basate sulla vista quando tu, il bersaglio o ciò che cerchi di percepire si trova alla luce diretta del sole." }),
  speciesTrait({ speciesId: "elfo", optionId: "drow", key: "magia-drow", name: "Magia drow", page: 24,
    description: "Conosci il trucchetto Luci danzanti. Dal 3° livello lanci Luminescenza e dal 5° Oscurità, una volta per riposo lungo ciascuno, con Carisma come caratteristica da incantatore." }),
  speciesTrait({ speciesId: "elfo", optionId: "drow", key: "magia-drow-luminescenza", name: "Magia drow: Luminescenza", page: 24,
    activation: "azione", minimumLevel: 3, poolId: "specie-elfo-drow-luminescenza-usi",
    description: "Lanci Luminescenza senza spendere slot, con Carisma come caratteristica da incantatore. Una volta per riposo lungo." }),
  speciesTrait({ speciesId: "elfo", optionId: "drow", key: "magia-drow-oscurita", name: "Magia drow: Oscurità", page: 24,
    activation: "azione", minimumLevel: 5, poolId: "specie-elfo-drow-oscurita-usi",
    description: "Lanci Oscurità senza spendere slot, con Carisma come caratteristica da incantatore. Una volta per riposo lungo." }),

  speciesTrait({ speciesId: "halfling", key: "fortunato", name: "Fortunato", page: 28,
    description: "Quando ottieni 1 naturale a un tiro per colpire, a una prova di caratteristica o a un tiro salvezza, puoi ritirare il dado e devi usare il nuovo risultato." }),
  speciesTrait({ speciesId: "halfling", key: "coraggioso", name: "Coraggioso", page: 28,
    description: "Vantaggio ai tiri salvezza per non essere spaventato." }),
  speciesTrait({ speciesId: "halfling", key: "agilita-halfling", name: "Agilità halfling", page: 28,
    description: "Puoi muoverti attraverso lo spazio di qualsiasi creatura di taglia più grande della tua." }),
  speciesTrait({ speciesId: "halfling", optionId: "piedelesto", key: "furtivita-innata", name: "Furtività innata", page: 28,
    description: "Puoi tentare di nasconderti anche quando sei oscurato soltanto da una creatura di almeno una taglia più grande della tua." }),
  speciesTrait({ speciesId: "halfling", optionId: "tozzo", key: "resilienza-dei-tozzi", name: "Resilienza dei tozzi", page: 28,
    description: "Vantaggio ai tiri salvezza contro il veleno. La resistenza ai danni da veleno è già applicata alle difese." }),

  speciesTrait({ speciesId: "umano", optionId: "variante", key: "talento", name: "Talento", page: 31,
    description: "Ottieni un talento a tua scelta e la competenza in un'abilità. Gli effetti del talento si configurano a parte: capacità, Azioni rapide, difese." }),

  speciesTrait({ speciesId: "gnomo", key: "astuzia-gnomesca", name: "Astuzia gnomesca", page: 37,
    description: "Vantaggio a tutti i tiri salvezza di Intelligenza, Saggezza e Carisma contro la magia." }),
  speciesTrait({ speciesId: "gnomo", optionId: "foreste", key: "illusionista-nato", name: "Illusionista nato", page: 37,
    description: "Conosci il trucchetto Illusione minore, con Intelligenza come caratteristica da incantatore." }),
  speciesTrait({ speciesId: "gnomo", optionId: "foreste", key: "parlare-con-le-piccole-bestie", name: "Parlare con le piccole bestie", page: 37,
    description: "Con suoni e gesti comunichi idee semplici alle bestie di taglia Piccola o inferiore." }),
  speciesTrait({ speciesId: "gnomo", optionId: "rocce", key: "inventore", name: "Inventore", page: 37,
    description: "Con gli arnesi da inventore costruisci in 1 ora un piccolo congegno a orologeria (CA 5, 1 PF): giocattolo, accendino o carillon. Funziona per 24 ore; al massimo tre alla volta." }),

  speciesTrait({ speciesId: "mezzelfo", key: "ascendenza-fatata", name: "Ascendenza fatata", page: 39,
    description: "Vantaggio ai tiri salvezza per non essere affascinato; la magia non può farti addormentare." }),

  speciesTrait({ speciesId: "mezzorco", key: "tenacia-implacabile", name: "Tenacia implacabile", page: 41,
    activation: "innesco", poolId: "specie-mezzorco-tenacia-implacabile-usi",
    description: "Quando scendi a 0 punti ferita ma non vieni ucciso sul colpo, puoi scendere invece a 1 punto ferita. Una volta per riposo lungo: riporta i PF a 1 e spendi l'uso." }),
  speciesTrait({ speciesId: "mezzorco", key: "attacchi-selvaggi", name: "Attacchi selvaggi", page: 41,
    description: "Con un colpo critico in un attacco con arma da mischia tiri un dado di danno dell'arma in più e lo aggiungi ai danni extra del critico." }),

  speciesTrait({ speciesId: "tiefling", key: "resistenza-infernale", name: "Resistenza infernale", page: 43,
    description: "Resistenza ai danni da fuoco, già applicata alle difese." }),
  speciesTrait({ speciesId: "tiefling", key: "eredita-infernale", name: "Eredità infernale", page: 43,
    description: "Conosci il trucchetto Taumaturgia. Dal 3° livello lanci Intimorire infernale come incantesimo di 2° livello e dal 5° Oscurità, una volta per riposo lungo ciascuno, con Carisma come caratteristica da incantatore." }),
  speciesTrait({ speciesId: "tiefling", key: "eredita-infernale-intimorire-infernale", name: "Eredità infernale: Intimorire infernale", page: 43,
    activation: "reazione", minimumLevel: 3, poolId: "specie-tiefling-intimorire-infernale-usi",
    description: "Lanci Intimorire infernale come incantesimo di 2° livello (3d10 fuoco), senza slot, con Carisma. Una volta per riposo lungo." }),
  speciesTrait({ speciesId: "tiefling", key: "eredita-infernale-oscurita", name: "Eredità infernale: Oscurità", page: 43,
    activation: "azione", minimumLevel: 5, poolId: "specie-tiefling-oscurita-usi",
    description: "Lanci Oscurità senza slot, con Carisma. Una volta per riposo lungo." }),
];

// Tranche 2: the catalog's traits, ids "specie-<species>-<key>" like those of the PHB.
const CATALOG_FEATURES = CATALOG.flatMap((spec) => spec.traits.map((entry) => speciesTrait({
  speciesId: spec.id, optionId: entry.option || "", key: entry.key, name: entry.name, page: entry.page ?? spec.page,
  description: entry.text, activation: entry.act || "passiva", minimumLevel: entry.level || 1,
  poolId: entry.uses ? `specie-${spec.id}-${entry.uses}-usi` : "",
  effectPlan: entry.effect ? Object.freeze({ kind: "condition", conditionName: entry.name, effectKind: "buff", detail: entry.effect.detail }) : null,
  rounds: entry.effect?.rounds ?? null,
})));

export const SPECIES_FEATURES = Object.freeze([...DRAGONBORN_FEATURES, ...PHB_FEATURES, ...CATALOG_FEATURES]);

// A species trait is available for the profile's species, and for its chosen option when the
// trait belongs to one, once the total character level reaches it. A species with options and none
// chosen has no traits. Without a class build the level is unknown, so every trait stays available.
export function speciesFeaturesForProfile(profile, totalCharacterLevel = 0) {
  const clean = sanitizeSpecies(profile?.[SPECIES_FIELD]);
  if (!clean || speciesOptionMissing(clean)) return [];
  const level = Number(totalCharacterLevel) || 0;
  return SPECIES_FEATURES.filter((feature) => feature.speciesId === clean.id
    && (feature.ancestryIds ? feature.ancestryIds.includes(clean.ancestryId) : !feature.ancestryId || feature.ancestryId === clean.ancestryId)
    && (!level || level >= feature.minimumLevel));
}
