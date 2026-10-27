// Species traits stored in the Actor Profile (initiativeCard.species).
// Pure data: no SDK, no metadata writes. Traits use the class-feature record shape, so the
// class-feature runtime activates them (pill, duration, resource pool) like any other feature.
// The profile stores { id, ancestryId }: ancestryId is the species option, a dragonborn's ancestry or
// a subrace/variant ("ancestries" keeps its name). Species without options leave it empty.
// Tranche 1: the PHB 2014 species and the Fizban's dragonborn variants; tranche 2, declared in
// speciesCatalogVoloMordenkainen.js: Volo, Tomo dei Nemici and Mostri del Multiverso; tranche 3, in
// speciesCatalogCostaElementalEvil.js: Elemental Evil and Costa della Spada; tranche 4, in
// speciesCatalogEberron.js: Eberron; tranche 5, in speciesCatalogRavnicaTheros.js: Ravnica and Theros;
// tranche 6, in speciesCatalogWitchlightStrixhaven.js: Witchlight and Strixhaven; tranche 7, in
// speciesCatalogMinori.js: the tortle and the minor species; tranche 8, in speciesCatalogWildemountRavenloft.js:
// Wildemount and Van Richten; tranche 9, in speciesCatalogSpelljammerDragonlance.js: Spelljammer and
// Dragonlance; tranche 10, in speciesCatalogTasha.js: the custom lineage (see docs/SPECIE.md).

import { SPECIES_CATALOG_MULTIVERSO, SPECIES_CATALOG_TOMO, SPECIES_CATALOG_VOLO } from "./speciesCatalogVoloMordenkainen.js";
import { SPECIES_CATALOG_COSTA, SPECIES_CATALOG_ELEMENTAL, SPECIES_CATALOG_MULTIVERSO_ELEMENTAL } from "./speciesCatalogCostaElementalEvil.js";
import { SPECIES_CATALOG_EBERRON, SPECIES_CATALOG_MULTIVERSO_EBERRON } from "./speciesCatalogEberron.js";
import { SPECIES_CATALOG_MULTIVERSO_RAVNICA_THEROS, SPECIES_CATALOG_RAVNICA, SPECIES_CATALOG_THEROS } from "./speciesCatalogRavnicaTheros.js";
import { SPECIES_CATALOG_STRIXHAVEN, SPECIES_CATALOG_WITCHLIGHT } from "./speciesCatalogWitchlightStrixhaven.js";
import { SPECIES_CATALOG_ACQUISITIONS, SPECIES_CATALOG_GRUNG, SPECIES_CATALOG_LOCATHAH, SPECIES_CATALOG_MULTIVERSO_TORTLE, SPECIES_CATALOG_TORTLE } from "./speciesCatalogMinori.js";
import { GIFT_CATALOG_WILDEMOUNT, SPECIES_CATALOG_RAVENLOFT, SPECIES_CATALOG_WILDEMOUNT } from "./speciesCatalogWildemountRavenloft.js";
import { SPECIES_CATALOG_DRAGONLANCE, SPECIES_CATALOG_SPELLJAMMER } from "./speciesCatalogSpelljammerDragonlance.js";
import { SPECIES_CATALOG_TASHA } from "./speciesCatalogTasha.js";

export const SPECIES_FIELD = "species";
// A supernatural gift (the Wildemount hollow one) is added to the species: { id }, optional like it.
export const SUPERNATURAL_GIFT_FIELD = "supernaturalGift";
// The casting ability of the species' innate spells when the book leaves it to the player (Intelligence, Wisdom or
// Charisma, chosen with the species: Mostri del Multiverso, fata, hexblood). Optional: without it the highest counts.
export const SPECIES_SPELL_ABILITY_FIELD = "speciesSpellAbility";
export const SPECIES_SPELL_ABILITIES = Object.freeze(["int", "wis", "cha"]);

export function sanitizeSpeciesSpellAbility(value) {
  const ability = String(value || "").trim();
  return SPECIES_SPELL_ABILITIES.includes(ability) ? ability : null;
}

// english: the colour or gem as English sheets name it, for the import.
// shape and save of the PHB breath weapon (Draconic Ancestry table: a 5 by 30 ft line or a 15 ft cone); the Fizban
// breath depends on the variant. breath is the same as text.
export const BREATH_SHAPE_TEXT = Object.freeze({ line: "linea larga 1,5 m e lunga 9 m", cone: "cono di 4,5 m" });
const SAVE_TEXT = Object.freeze({ dex: "Destrezza", con: "Costituzione" });
const ancestry = (id, label, damageType, damageLabel, english, shape = "", save = "") => Object.freeze({
  id, label, damageType, damageLabel, aliases: Object.freeze([english]),
  ...(shape ? { breathShape: shape, breathSave: save, breath: `${BREATH_SHAPE_TEXT[shape]}, TS su ${SAVE_TEXT[save]}` } : {}),
});
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
  tortle: book("tortle-package", "The Tortle Package", ["tortle package", "the tortle package", "ttp"]),
  grung: book("one-grung-above", "One Grung Above", ["one grung above", "oga"]),
  acquisitions: book("acquisitions-incorporated", "Acquisitions Incorporated", ["acquisitions incorporated", "acquisitions inc", "ai"]),
  locathah: book("locathah-rising", "Locathah Rising", ["locathah rising", "lr"]),
  wildemount: book("wildemount", "Explorer's Guide to Wildemount", ["egtw", "wildemount", "explorer s guide to wildemount", "guida dell esploratore a wildemount"]),
  ravenloft: book("ravenloft", "Van Richten's Guide to Ravenloft", ["vrgr", "ravenloft", "van richten", "van richten s guide to ravenloft", "guida di van richten a ravenloft"]),
  spelljammer: book("spelljammer", "Spelljammer: Astral Adventurer's Guide", ["spelljammer", "aag", "astral adventurer s guide", "spelljammer adventures in space"]),
  dragonlance: book("dragonlance", "Dragonlance: Shadow of the Dragon Queen", ["dragonlance", "dsotdq", "shadow of the dragon queen"]),
  tasha: book("tasha", "Calderone Omnicomprensivo di Tasha", ["tasha", "tcoe", "tasha s cauldron of everything", "calderone di tasha"]),
  witchlight: book("witchlight", "The Wild Beyond the Witchlight", ["wbtw", "witchlight", "the wild beyond the witchlight", "wild beyond the witchlight"]),
  strixhaven: book("strixhaven", "Strixhaven: A Curriculum of Chaos", ["scc", "strixhaven", "strixhaven a curriculum of chaos", "strixhaven un curriculum del caos"]),
  eberron: book("eberron", "Eberron: Rising from the Last War", ["erlw", "eberron", "rising from the last war", "eberron rising from the last war"]),
  costa: book("costa-della-spada", "Guida del Giocatore alla Costa della Spada", ["scag", "costa della spada", "sword coast", "sword coast adventurer s guide"]),
  volo: book("volo", "Guida di Volo ai Mostri", ["volo", "vgm", "guida di volo", "volo s guide to monsters"]),
  tomo: book("mordenkainen-nemici", "Il Tomo dei Nemici di Mordenkainen", ["mtof", "tomo dei nemici", "tome of foes", "mordenkainen s tome of foes"]),
  multiverso: book("mostri-multiverso", "Mordenkainen presenta: Mostri del Multiverso", ["motm", "mpmm", "mostri del multiverso", "multiverso", "monsters of the multiverse"]),
});

const DRAGON_ANCESTRIES = Object.freeze({
  nero: ancestry("nero", "Nero", "acid", "acido", "black", "line", "dex"),
  blu: ancestry("blu", "Blu", "lightning", "fulmine", "blue", "line", "dex"),
  verde: ancestry("verde", "Verde", "poison", "veleno", "green", "cone", "con"),
  rosso: ancestry("rosso", "Rosso", "fire", "fuoco", "red", "cone", "dex"),
  bianco: ancestry("bianco", "Bianco", "cold", "freddo", "white", "cone", "con"),
  ottone: ancestry("ottone", "Ottone", "fire", "fuoco", "brass", "line", "dex"),
  bronzo: ancestry("bronzo", "Bronzo", "lightning", "fulmine", "bronze", "line", "dex"),
  rame: ancestry("rame", "Rame", "acid", "acido", "copper", "line", "dex"),
  oro: ancestry("oro", "Oro", "fire", "fuoco", "gold", "cone", "dex"),
  argento: ancestry("argento", "Argento", "cold", "freddo", "silver", "cone", "con"),
  ametista: ancestry("ametista", "Ametista", "force", "forza", "amethyst"),
  cristallo: ancestry("cristallo", "Cristallo", "radiant", "radiosi", "crystal"),
  smeraldo: ancestry("smeraldo", "Smeraldo", "psychic", "psichici", "emerald"),
  zaffiro: ancestry("zaffiro", "Zaffiro", "thunder", "tuono", "sapphire"),
  topazio: ancestry("topazio", "Topazio", "necrotic", "necrotici", "topaz"),
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
const MULTIVERSO = [...SPECIES_CATALOG_MULTIVERSO, ...SPECIES_CATALOG_MULTIVERSO_ELEMENTAL, ...SPECIES_CATALOG_MULTIVERSO_EBERRON, ...SPECIES_CATALOG_MULTIVERSO_RAVNICA_THEROS,
  ...SPECIES_CATALOG_MULTIVERSO_TORTLE]
  .sort((left, right) => left.label.localeCompare(right.label, "it"));
const BEFORE_FIZBAN = [...SPECIES_CATALOG_ELEMENTAL, ...SPECIES_CATALOG_COSTA, ...SPECIES_CATALOG_VOLO, ...SPECIES_CATALOG_TORTLE,
  ...SPECIES_CATALOG_GRUNG, ...SPECIES_CATALOG_TOMO, ...SPECIES_CATALOG_RAVNICA, ...SPECIES_CATALOG_ACQUISITIONS, ...SPECIES_CATALOG_LOCATHAH,
  ...SPECIES_CATALOG_EBERRON, ...SPECIES_CATALOG_WILDEMOUNT, ...SPECIES_CATALOG_THEROS, ...SPECIES_CATALOG_TASHA, ...SPECIES_CATALOG_RAVENLOFT, ...SPECIES_CATALOG_WITCHLIGHT];
const AFTER_FIZBAN = [...SPECIES_CATALOG_STRIXHAVEN];
const AFTER_MULTIVERSO = [...SPECIES_CATALOG_SPELLJAMMER, ...SPECIES_CATALOG_DRAGONLANCE];
const CATALOG = [...BEFORE_FIZBAN, ...AFTER_FIZBAN, ...MULTIVERSO, ...AFTER_MULTIVERSO];

// In order of publication: the select groups them by manual.
export const SPECIES = Object.freeze([
  ...PHB_SPECIES,
  ...BEFORE_FIZBAN.map(catalogSpecies),
  ...FIZBAN_SPECIES,
  ...AFTER_FIZBAN.map(catalogSpecies),
  ...MULTIVERSO.map(catalogSpecies),
  ...AFTER_MULTIVERSO.map(catalogSpecies),
]);
const SPECIES_BY_ID = new Map(SPECIES.map((entry) => [entry.id, entry]));

const GIFT_CATALOG = [...GIFT_CATALOG_WILDEMOUNT];
export const SUPERNATURAL_GIFTS = Object.freeze(GIFT_CATALOG.map((spec) => Object.freeze({
  id: spec.id, label: spec.label, ...catalogBook(spec), aliases: Object.freeze(spec.aliases || []), theme: theme(...spec.look),
})));
const SUPERNATURAL_GIFT_BY_ID = new Map(SUPERNATURAL_GIFTS.map((entry) => [entry.id, entry]));

export function getSupernaturalGift(id) {
  return SUPERNATURAL_GIFT_BY_ID.get(String(id || "").trim()) || null;
}

export function sanitizeSupernaturalGift(value) {
  const gift = getSupernaturalGift(value?.id);
  return gift ? { id: gift.id } : null;
}

export function supernaturalGiftDisplayName(value) {
  const clean = sanitizeSupernaturalGift(value);
  return clean ? getSupernaturalGift(clean.id).label : "";
}

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
// Healing Hands: one creature touched, the character itself included (the token selected on the map, or itself).
const TOUCH_TARGETING = Object.freeze({ mode: "single-target", rangeMeters: 1.5, maxTargets: 1, excludeSource: false });

// The traits that put a condition on the creatures the GM selects, as Conquering Presence does: those that failed
// the save (speciesSave: its ability, and the ability of its DC, 8 + proficiency + that modifier; "choice" is the
// card's speciesSpellAbility), or the one creature unsettled. The pill ends with the timing of the source's turn.
// self: the pill goes on the character (Hidden Step, Grovel). endsOnAttack: the console ends it when the character
// attacks (as Invisibility). choices: the options picked at each use (Fey Gift), each with its pill; includeSource
// puts it on the character too, temporaryHp gives both temporary hit points (the die entered at the table).
const conditionTrait = ({ condition, label = "", detail, rangeMeters = null, maxTargets = null, timing = "", rounds, save = null,
  self = false, endsOnAttack = false, choices = null, excludeSource = true }) => Object.freeze({
  effectPlan: Object.freeze({ kind: "condition", conditionName: condition, ...(label ? { displayLabel: label } : {}), detail }),
  targeting: self ? SELF_TARGETING : Object.freeze({ mode: "single-target", rangeMeters, maxTargets, excludeSource }),
  duration: Object.freeze({ rounds, ...(timing ? { timing } : {}) }),
  ...(save ? { speciesSave: Object.freeze(save) } : {}),
  ...(self ? { self: true } : {}),
  ...(endsOnAttack ? { endsOnAttack: true } : {}),
  ...(choices ? { choiceOptions: Object.freeze(choices.map((choice) => Object.freeze(choice))) } : {}),
});
const HIDDEN_STEP = conditionTrait({ condition: "Invisibile", label: "Invisibile · Passo nascosto", self: true, endsOnAttack: true,
  timing: "next-turn", rounds: 1,
  detail: "Invisibile fino all'inizio del suo prossimo turno, o finché non attacca, tira danni o costringe una creatura a un tiro salvezza." });
const FEY_GIFT_HELP = "Aiutato dall'hobgoblin: vantaggio alla prossima prova di caratteristica o al primo tiro per colpire contro una creatura entro 1,5 m dall'hobgoblin, prima dell'inizio del suo prossimo turno.";
// Acid Spit (Simic hybrid): a save attack on one creature within 9 m, as the breath is resolved (the attack console),
// no damage on a success.
const SPECIES_TARGET_BREATHS = Object.freeze({
  "specie-ibrido-simic-potenziamento-sputo-acido": Object.freeze({ shape: "target", rangeFeet: 30, maxTargets: 1, save: "dex",
    damageType: "acid", dice: Object.freeze({ 5: "2d10", 11: "3d10", 17: "4d10" }), dc: "con", half: false }),
});

// The teleports of a species (speciesTeleportCore.js): up to 9 m to a free space the character can see, picked on the
// map. resistAllFromLevel: the shadar-kai's resistance to all damage until the start of its next turn. seasons: the
// eladrin's season (the species option) from 3rd level, its save DC (8 + proficiency + Charisma, or the species'
// chosen ability) and Summer's fire damage (Charisma, minimum 1, or the proficiency bonus).
const SPECIES_TELEPORTS = Object.freeze({
  "specie-eladrin-passo-fatato": Object.freeze({ rangeFeet: 30, seasons: Object.freeze({ fromLevel: 3, summer: "cha-min1" }) }),
  "specie-eladrin-multiverso-passo-fatato": Object.freeze({ rangeFeet: 30, seasons: Object.freeze({ fromLevel: 3, summer: "pb" }) }),
  "specie-shadar-kai-benedizione-della-regina-corvo": Object.freeze({ rangeFeet: 30, resistAllFromLevel: 3 }),
  "specie-shadar-kai-multiverso-benedizione-della-regina-corvo": Object.freeze({ rangeFeet: 30, resistAllFromLevel: 3 }),
  "specie-elfo-astrale-passo-di-luce-stellare": Object.freeze({ rangeFeet: 30 }),
});
// The eladrin's seasons force a Wisdom save: the DC's ability is Charisma (Tomo dei Nemici) or the species' choice.
const SEASON_SAVES = Object.freeze({
  "specie-eladrin-passo-fatato": Object.freeze({ ability: "wis", dc: "cha" }),
  "specie-eladrin-multiverso-passo-fatato": Object.freeze({ ability: "wis", dc: "choice" }),
});

const SPECIES_CONDITION_TRAITS = Object.freeze({
  "specie-leonin-ruggito-intimidatorio": conditionTrait({
    condition: "Spaventato", label: "Spaventato · Ruggito intimidatorio", rangeMeters: 3, timing: "next-turn-end", rounds: 1,
    detail: "Spaventato dal leonin fino alla fine del suo prossimo turno. Va solo su chi fallisce il TS su Saggezza.",
    save: { ability: "wis", dc: "con" } }),
  "specie-kender-provocazione": conditionTrait({
    condition: "Provocato", rangeMeters: 18, maxTargets: 1, timing: "next-turn", rounds: 1,
    detail: "Svantaggio ai tiri per colpire contro bersagli diversi dal kender, fino all'inizio del suo prossimo turno. Va solo se fallisce il TS su Saggezza.",
    save: { ability: "wis", dc: "choice" } }),
  "specie-firbolg-passo-nascosto": HIDDEN_STEP,
  "specie-firbolg-multiverso-passo-nascosto": HIDDEN_STEP,
  "specie-coboldo-strisciare-piagnucolare-implorare": conditionTrait({
    condition: "Strisciare", label: "Strisciare, piagnucolare e implorare", self: true, timing: "next-turn-end", rounds: 1,
    detail: "Gli alleati hanno vantaggio ai tiri per colpire contro i nemici entro 3 m dal coboldo che il coboldo può vedere, fino alla fine del suo prossimo turno." }),
  "specie-coboldo-multiverso-grido-draconico": conditionTrait({
    condition: "Grido draconico", rangeMeters: 3, timing: "next-turn", rounds: 1,
    detail: "Il coboldo e i suoi alleati hanno vantaggio ai tiri per colpire contro questa creatura, fino all'inizio del prossimo turno del coboldo. Va su chi può sentirlo." }),
  // Fey Gift: the Help action (a pill on the creature helped) and, from 3rd level, one benefit for each use.
  "specie-hobgoblin-multiverso-dono-fatato": conditionTrait({
    condition: "Aiutato", maxTargets: 1, excludeSource: false, timing: "next-turn", rounds: 1, detail: FEY_GIFT_HELP,
    choices: [
      { id: "aiutare", label: "Aiutare", effectPlan: { conditionName: "Aiutato", detail: FEY_GIFT_HELP } },
      { id: "ospitalita", label: "Ospitalità (dal 3° livello)", temporaryHp: { amount: "pb", bonusDie: "1d6" },
        effectPlan: { conditionName: "Aiutato", displayLabel: "Aiutato · Ospitalità",
          detail: `${FEY_GIFT_HELP} Ospitalità: l'hobgoblin e la creatura aiutata hanno ottenuto 1d6 + competenza PF temporanei.` } },
      { id: "passaggio", label: "Passaggio (dal 3° livello)", includeSource: true,
        effectPlan: { conditionName: "Passaggio", displayLabel: "Passaggio · +3 m",
          detail: "+3 m alla velocità camminando fino all'inizio del prossimo turno dell'hobgoblin (Dono fatato); la creatura aiutata ha anche l'aiuto." } },
      { id: "dispetto", label: "Dispetto (dal 3° livello)",
        effectPlan: { conditionName: "Aiutato", displayLabel: "Aiutato · Dispetto",
          detail: `${FEY_GIFT_HELP} Dispetto: la prima volta che colpisce un bersaglio con un tiro per colpire, quel bersaglio ha svantaggio al suo prossimo tiro per colpire entro 1 minuto.` } },
    ] }),
  "dono-hollow-one-presenza-inquietante": conditionTrait({
    condition: "Turbato", rangeMeters: 4.5, maxTargets: 1, rounds: 10,
    detail: "Svantaggio al prossimo tiro salvezza entro 1 minuto: togli la pill dopo quel tiro. Immuni costrutti, non morti e chi non può essere spaventato." }),
});

// The spells a species casts without a slot (speciesInnateSpellCore.js): the trait's text names the spell, the level
// it is cast at and the casting ability; this table gives the spell catalog's id for each name (spells-srd.js).
const INNATE_SPELL_IDS = Object.freeze({
  "Allarme": "alarm",
  "Amicizia con gli animali": "animal-friendship",
  "Anti-individuazione": "nondetection",
  "Arma magica": "magic-weapon",
  "Armatura di Agathys": "phb2014-armatura-di-agathys",
  "Armatura magica": "mage-armor",
  "Bocca magica": "magic-mouth",
  "Caduta morbida": "feather-fall",
  "Camminare sull'acqua": "water-walk",
  "Camuffare se stesso": "disguise-self",
  "Charme su persone": "charm-person",
  "Comprensione dei linguaggi": "comprehend-languages",
  "Corona di follia": "phb2014-corona-di-follia",
  "Creare o distruggere acqua": "create-or-destroy-water",
  "Crescita di spine": "spike-growth",
  "Cura ferite": "cure-wounds",
  "Disco fluttuante di Tenser": "floating-disk",
  "Estasiare": "enthrall",
  "Folata di vento": "gust-of-wind",
  "Individuazione dei pensieri": "detect-thoughts",
  "Individuazione del magico": "detect-magic",
  "Individuazione delle malattie e dei veleni": "detect-poison-and-disease",
  "Ingrandire/ridurre": "enlarge-reduce",
  "Interdizione alle lame": "phb2014-interdizione-alle-lame",
  "Intimorire infernale": "hellish-rebuke",
  "Intralciare": "entangle",
  "Invisibilità": "invisibility",
  "Lama infuocata": "flame-blade",
  "Levitazione": "levitate",
  "Localizza oggetto": "locate-object",
  "Luce diurna": "daylight",
  "Luminescenza": "faerie-fire",
  "Mani brucianti": "burning-hands",
  "Marchio del cacciatore": "hunters-mark",
  "Muro d'acqua": "xanathar-muro-dacqua",
  "Nube di nebbia": "fog-cloud",
  "Oscurità": "darkness",
  "Parlare con gli animali": "speak-with-animals",
  "Passare senza tracce": "pass-without-trace",
  "Passo velato": "misty-step",
  "Punizione incandescente": "phb2014-punizione-incandescente",
  "Punizione marchiante": "branding-smite",
  "Purificare cibo e bevande": "purify-food-and-drink",
  "Raggio di infermità": "phb2014-raggio-di-infermita",
  "Ristorare inferiore": "lesser-restoration",
  "Saltare": "jump",
  "Scudo": "shield",
  "Serratura arcana": "arcane-lock",
  "Servitore inosservato": "unseen-servant",
  "Sonno": "sleep",
  "Sortilegio": "phb2014-sortilegio",
  "Suggestione": "suggestion",
  "Vedere invisibilità": "see-invisibility",
});
const INNATE_SPELL_ABILITIES = Object.freeze({ Carisma: "cha", Costituzione: "con", Saggezza: "wis", Intelligenza: "int", Destrezza: "dex" });

// The innate spell of a trait that spends its own use: { spellId, slotLevel, ability, self }, or null. ability
// "choice": Intelligence, Wisdom or Charisma, chosen with the species (the card's speciesSpellAbility).
function innateSpellFromText(description) {
  const match = String(description || "").match(/^(?:Dal \d° livello )?[Ll]anci (.+?)(?= come incantesimo di| come azione bonus| su te stesso| senza (?:spendere|slot|componenti)|,)/u);
  const spellId = match ? INNATE_SPELL_IDS[match[1]] : "";
  if (!spellId) return null;
  const level = Number(description.match(/come incantesimo di (\d)° livello/u)?.[1]) || null;
  const ability = INNATE_SPELL_ABILITIES[description.match(/con (Carisma|Costituzione|Saggezza|Intelligenza|Destrezza)/u)?.[1]] || "choice";
  return Object.freeze({ spellId, slotLevel: level, ability, self: /su te stesso/u.test(description) });
}

// The traits that change hit points (speciesHpTraitCore.js): the kind of write and where its amount comes from.
// amount: "level", "pb", "2pb", "con-min1", "level-con-min1"; dice "pb-d4" (rolled at the table); onHit: Hungry Jaws'
// bite; bonusDie: Beasthide's extra d6; die and bonus: the reduction's roll.
const shiftTraits = (speciesId, amount) => Object.fromEntries(["pelle-bestiale", "zanna-lunga", "passo-rapido", "caccia-selvaggia"]
  .map((key) => [`specie-${speciesId}-mutazione-${key}`, Object.freeze({ kind: "shift", amount, ...(key === "pelle-bestiale" ? { bonusDie: "1d6" } : {}) })]));
const SPECIES_HP_TRAITS = Object.freeze({
  "specie-mezzorco-tenacia-implacabile": Object.freeze({ kind: "relentless" }),
  "specie-orco-multiverso-tenacia-implacabile": Object.freeze({ kind: "relentless" }),
  "specie-aasimar-mani-guaritrici": Object.freeze({ kind: "heal", amount: "level" }),
  "specie-aasimar-multiverso-mani-guaritrici": Object.freeze({ kind: "heal", dice: "pb-d4" }),
  "specie-orco-multiverso-scarica-di-adrenalina": Object.freeze({ kind: "temp", amount: "pb" }),
  "specie-lucertoloide-fauci-fameliche": Object.freeze({ kind: "temp", amount: "con-min1", onHit: true }),
  "specie-lucertoloide-multiverso-fauci-fameliche": Object.freeze({ kind: "temp", amount: "pb", onHit: true }),
  ...shiftTraits("shifter", "level-con-min1"),
  ...shiftTraits("shifter-multiverso", "2pb"),
  "specie-goliath-resistenza-della-pietra": Object.freeze({ kind: "reduce", die: "1d12", bonus: "con" }),
  "specie-goliath-multiverso-resistenza-della-pietra": Object.freeze({ kind: "reduce", die: "1d12", bonus: "con" }),
  "specie-hadozee-schivata-hadozee": Object.freeze({ kind: "reduce", die: "1d6", bonus: "pb" }),
});
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
  ...[...CATALOG.map((spec) => [spec, "specie"]), ...GIFT_CATALOG.map((spec) => [spec, "dono"])].flatMap(([spec, prefix]) => (spec.pools || []).map((entry) => pool(
    `${prefix}-${spec.id}-${entry.key}-usi`, entry.name,
    // count: 1, "pb" or a pool formula ("max(1, modificatore_costituzione)").
    entry.count === "pb" ? { type: "formula", expression: "bonus_competenza" }
      : typeof entry.count === "string" ? { type: "formula", expression: entry.count } : { type: "fixed", value: entry.count },
    entry.rest === "breve" ? ["riposo_breve", "riposo_lungo"] : ["riposo_lungo"],
  ))),
]);

function trait({ key, speciesId, ancestryValue, name, description, minimumLevel = 1, activation, poolId, effectPlan = null, rounds = null, page, breath = null }) {
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
    ...(breath ? { breath } : {}),
  });
}

// The breath weapon as the PC attack console resolves it: an area (manual pick of the creatures), a save that halves,
// one damage type, dice by total character level, DC 8 + Constitution + proficiency.
export const PHB_BREATH_DICE = Object.freeze({ 1: "2d6", 6: "3d6", 11: "4d6", 16: "5d6" });
export const FIZBAN_BREATH_DICE = Object.freeze({ 1: "1d10", 5: "2d10", 11: "3d10", 17: "4d10" });
export const breathSpec = (shape, save, damageType, dice) => Object.freeze({
  shape, lengthFeet: shape === "line" ? 30 : 15, ...(shape === "line" ? { widthFeet: 5 } : {}), save, damageType, dice, dc: "con",
});
const FIZBAN_BREATH = Object.freeze({ "dragonide-cromatico": "line", "dragonide-gemma": "cone", "dragonide-metallico": "cone" });

// The Fizban breath: a 9 m line for the chromatic dragonborn, a 4.5 m cone for the gem and metallic ones.
const FIZBAN_BREATH_SHAPE = Object.freeze({
  "dragonide-cromatico": "linea larga 1,5 m e lunga 9 m",
  "dragonide-gemma": "cono di 4,5 m",
  "dragonide-metallico": "cono di 4,5 m",
});

function breathWeapon(speciesId, ancestryValue) {
  const phb = speciesId === "dragonide";
  return trait({
    key: "arma-a-soffio", speciesId, ancestryValue, name: `Arma a soffio (${ancestryValue.damageLabel})`, activation: phb ? "azione" : "azione_attacco",
    poolId: phb ? "specie-dragonide-arma-a-soffio-usi" : "specie-dragonide-fizban-arma-a-soffio-usi", page: phb ? 34 : 20,
    breath: phb
      ? breathSpec(ancestryValue.breathShape, ancestryValue.breathSave, ancestryValue.damageType, PHB_BREATH_DICE)
      : breathSpec(FIZBAN_BREATH[speciesId], "dex", ancestryValue.damageType, FIZBAN_BREATH_DICE),
    description: phb
      ? `Con un'azione esali energia distruttiva: ${ancestryValue.breath} con CD 8 + Costituzione + competenza; 2d6 danni da ${ancestryValue.damageLabel} (3d6 al 6°, 4d6 all'11°, 5d6 al 16° livello), metà se superato. Una volta per riposo breve o lungo.`
      : `Durante l'azione di Attacco sostituisci un attacco: ${FIZBAN_BREATH_SHAPE[speciesId]}, TS su Destrezza con CD 8 + Costituzione + competenza; 1d10 danni da ${ancestryValue.damageLabel} (2d10 al 5°, 3d10 all'11°, 4d10 al 17° livello), metà se superato. Usi pari al bonus di competenza per riposo lungo.`,
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

// The metallic breath (Fizban): a 4.5 m cone without damage; each option puts its condition on the creatures that fail
// (the push of the repulsion breath stays a note: the GM moves the token).
const METALLIC_BREATH = Object.freeze({
  shape: "cone", lengthFeet: 15, save: "", damageType: "", dice: null, dc: "con", half: false,
  variants: Object.freeze({
    debilitante: Object.freeze({ label: "Soffio debilitante", save: "con", condition: "Incapacitato",
      expiry: Object.freeze({ mode: "turn-start", actor: "source", remaining: 1, anchor: "next-turn" }),
      when: "fino all'inizio del prossimo turno del dragonide" }),
    repulsivo: Object.freeze({ label: "Soffio repulsivo", save: "str", condition: "Prono",
      note: "Spinto di 6 m lontano dal dragonide: sposta il token a mano." }),
  }),
});

function metallicBreath(ancestryValue) {
  return trait({
    key: "arma-a-soffio-metallica", speciesId: "dragonide-metallico", ancestryValue, name: "Arma a soffio metallica", minimumLevel: 5,
    activation: "azione_attacco", poolId: "specie-dragonide-metallico-arma-a-soffio-metallica-usi", page: 22, breath: METALLIC_BREATH,
    description: "Dal 5° livello, durante l'azione di Attacco sostituisci un attacco con un cono di 4,5 m (CD 8 + Costituzione + competenza): soffio debilitante (TS su Costituzione o incapacitato fino all'inizio del tuo prossimo turno) o soffio repulsivo (TS su Forza o spinto di 6 m e prono). Una volta per riposo lungo.",
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
// Psionic Mind belongs to every gem dragonborn, whatever the ancestry.

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
// A supernatural gift's trait has the same shape, with giftId in place of the species.
function speciesTrait({ speciesId = "", giftId = "", optionId = "", key, name, page, description, activation = "passiva", minimumLevel = 1, poolId = "", effectPlan = null, rounds = null, breath = null }) {
  const species = giftId ? getSupernaturalGift(giftId) : getSpecies(speciesId);
  const passive = activation === "passiva";
  // A trait with an effect plan (an aasimar's transformation) puts a pill on the character.
  const id = giftId ? `dono-${giftId}-${key}` : `specie-${speciesId}-${key}`;
  const runtimeSupport = effectPlan || SPECIES_CONDITION_TRAITS[id] ? CONDITION_ADAPTER : passive ? NOT_AUTOMATED : RESOURCE_ONLY;
  const hpTrait = SPECIES_HP_TRAITS[id] || null;
  const innateSpell = poolId && !passive ? innateSpellFromText(description) : null;
  const conditionSpec = SPECIES_CONDITION_TRAITS[id] || null;
  const plan = conditionSpec?.effectPlan || effectPlan;
  return Object.freeze({
    id,
    name,
    description,
    classId: "",
    subclassId: "",
    speciesId,
    ...(giftId ? { giftId } : {}),
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
    targetMode: hpTrait?.kind === "heal" || (conditionSpec && !conditionSpec.self) ? "selection" : "self",
    targeting: conditionSpec?.targeting || (hpTrait?.kind === "heal" ? TOUCH_TARGETING : SELF_TARGETING),
    theme: species.theme,
    effectPlan: plan,
    breaksConcentration: false,
    duration: conditionSpec?.duration || Object.freeze({ rounds }),
    trackingMode: plan ? "active" : "instant",
    resourceCosts: Object.freeze(poolId ? [Object.freeze({ poolId, amount: 1 })] : []),
    ...(breath || SPECIES_TARGET_BREATHS[id] ? { breath: breath || SPECIES_TARGET_BREATHS[id] } : {}),
    ...(hpTrait ? { hpTrait } : {}),
    ...(innateSpell ? { innateSpell } : {}),
    ...(conditionSpec?.speciesSave ? { speciesSave: conditionSpec.speciesSave } : {}),
    ...(SPECIES_TELEPORTS[id] ? { speciesTeleport: SPECIES_TELEPORTS[id] } : {}),
    ...(SEASON_SAVES[id] ? { speciesSave: SEASON_SAVES[id] } : {}),
    ...(conditionSpec?.endsOnAttack ? { endsOnAttack: true } : {}),
    ...(conditionSpec?.choiceOptions ? { choiceOptions: conditionSpec.choiceOptions } : {}),
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
    description: "Quando scendi a 0 punti ferita ma non vieni ucciso sul colpo, puoi scendere invece a 1 punto ferita. Una volta per riposo lungo. A 0 PF, «Resta a 1 PF» riporta i PF a 1 e spende l'uso." }),
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
const catalogTraits = (spec, gift = false) => spec.traits.map((entry) => speciesTrait({
  ...(gift ? { giftId: spec.id } : { speciesId: spec.id }), optionId: entry.option || "", key: entry.key, name: entry.name, page: entry.page ?? spec.page,
  description: entry.text, activation: entry.act || "passiva", minimumLevel: entry.level || 1,
  poolId: entry.uses ? `${gift ? "dono" : "specie"}-${spec.id}-${entry.uses}-usi` : "",
  effectPlan: entry.effect ? Object.freeze({ kind: "condition", conditionName: entry.name, effectKind: "buff", detail: entry.effect.detail }) : null,
  rounds: entry.effect?.rounds ?? null,
  breath: entry.breath ? breathSpec(entry.breath.shape, entry.breath.save, entry.breath.damageType, PHB_BREATH_DICE) : null,
}));
const CATALOG_FEATURES = CATALOG.flatMap((spec) => catalogTraits(spec));
const GIFT_FEATURES = GIFT_CATALOG.flatMap((spec) => catalogTraits(spec, true));

// Gift traits ride with the species ones: same lookup by id, same runtime, same profile filter.
const GEM_PSIONIC_MIND = speciesTrait({ speciesId: "dragonide-gemma", key: "mente-psionica", name: "Mente psionica", page: 21,
  description: "Mandi messaggi telepatici a qualsiasi creatura che puoi vedere entro 9 m; non serve una lingua comune, ma deve capirne almeno una." });

export const SPECIES_FEATURES = Object.freeze([...DRAGONBORN_FEATURES, GEM_PSIONIC_MIND, ...PHB_FEATURES, ...CATALOG_FEATURES, ...GIFT_FEATURES]);

// Whether a species casts innate spells with the ability chosen by the player (the card shows the field then).
export function speciesHasSpellAbilityChoice(speciesId) {
  const id = String(speciesId || "").trim();
  return !!id && SPECIES_FEATURES.some((feature) => feature.speciesId === id
    && (feature.innateSpell?.ability === "choice" || feature.speciesSave?.dc === "choice"));
}

// A species trait is available for the profile's species, and for its chosen option when the
// trait belongs to one, once the total character level reaches it. A species with options and none
// chosen has no traits. Without a class build the level is unknown, so every trait stays available.
// The supernatural gift's traits follow, with or without a species.
export function speciesFeaturesForProfile(profile, totalCharacterLevel = 0) {
  const clean = sanitizeSpecies(profile?.[SPECIES_FIELD]);
  const gift = sanitizeSupernaturalGift(profile?.[SUPERNATURAL_GIFT_FIELD]);
  const level = Number(totalCharacterLevel) || 0;
  const reached = (feature) => !level || level >= feature.minimumLevel;
  const speciesFeatures = !clean || speciesOptionMissing(clean) ? [] : SPECIES_FEATURES.filter((feature) => feature.speciesId === clean.id
    && (feature.ancestryIds ? feature.ancestryIds.includes(clean.ancestryId) : !feature.ancestryId || feature.ancestryId === clean.ancestryId)
    && reached(feature));
  const giftFeatures = gift ? SPECIES_FEATURES.filter((feature) => feature.giftId === gift.id && reached(feature)) : [];
  return [...speciesFeatures, ...giftFeatures];
}
