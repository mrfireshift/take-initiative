import catalogData from "./spells-srd-5.1.json" with { type: "json" };
import italianData from "./spells-it-2014.json" with { type: "json" };

export const SPELL_CATALOG_VERSION = 1;

const ITALIAN_ALIASES = Object.freeze({
  "animal-friendship": ["Amicizia con gli Animali"],
  "animate-objects": ["Animare Oggetti"],
  "aura-of-vitality": ["Aura di Vitalità"],
  "bane": ["Anatema"],
  "bless": ["Benedizione"],
  "blindness-deafness": ["Cecità/Sordità"],
  "charm-person": ["Charme su Persone"],
  "crusaders-mantle": ["Manto del Crociato"],
  "dominate-beast": ["Dominare Bestie"],
  "dominate-monster": ["Dominare Mostri"],
  "dominate-person": ["Dominare Persone"],
  "entangle": ["Intralciare"],
  "faerie-fire": ["Luminescenza"],
  "fear": ["Paura"],
  "fly": ["Volare"],
  "greater-invisibility": ["Invisibilità Superiore"],
  "haste": ["Velocità"],
  "hideous-laughter": ["Risata Incontenibile"],
  "hold-monster": ["Blocca Mostri"],
  "hold-person": ["Blocca Persone"],
  "hunters-mark": ["Marchio del Cacciatore"],
  "hypnotic-pattern": ["Trama Ipnotica"],
  "invisibility": ["Invisibilità"],
  "mage-armor": ["Armatura Magica"],
  "polymorph": ["Metamorfosi"],
  "protection-from-evil-and-good": ["Protezione dal Bene e dal Male"],
  "shield": ["Scudo"],
  "shield-of-faith": ["Scudo della Fede"],
  "silence": ["Silenzio"],
  "sleep": ["Sonno"],
  "slow": ["Lentezza"],
  "spirit-guardians": ["Spiriti Guardiani"],
  "stoneskin": ["Pelle di Pietra"],
  "web": ["Ragnatela"],
});

const AUTOMATION = Object.freeze({
  "animal-friendship": { mode: "confirm", conditions: ["Affascinato"] },
  "blindness-deafness": { mode: "choice", choices: ["Accecato", "Assordato"] },
  "charm-person": { mode: "confirm", conditions: ["Affascinato"] },
  "dominate-beast": { mode: "confirm", conditions: ["Affascinato"] },
  "dominate-monster": { mode: "confirm", conditions: ["Affascinato"] },
  "dominate-person": { mode: "confirm", conditions: ["Affascinato"] },
  "entangle": { mode: "confirm", conditions: ["Trattenuto"], targetMode: "area" },
  "fear": { mode: "confirm", conditions: ["Spaventato"], targetMode: "area" },
  "greater-invisibility": { mode: "automatic", conditions: ["Invisibile"] },
  "hideous-laughter": { mode: "confirm", conditions: ["Prono", "Incapacitato"] },
  "hold-monster": { mode: "confirm", conditions: ["Paralizzato"] },
  "hold-person": { mode: "confirm", conditions: ["Paralizzato"] },
  "hypnotic-pattern": {
    mode: "confirm",
    conditions: ["Affascinato", "Incapacitato"],
    targetMode: "area",
  },
  "invisibility": { mode: "automatic", conditions: ["Invisibile"] },
  "sleep": { mode: "confirm", conditions: ["Privo di sensi"], targetMode: "area" },
  "web": { mode: "confirm", conditions: ["Trattenuto"], targetMode: "area" },
});

const LEGACY_MANUAL = Object.freeze([
  {
    id: "legacy-aura-of-vitality",
    name: "Aura di Vitalità",
    level: 3,
    duration: "Up to 1 minute",
    concentration: true,
    range: "Self",
    area: null,
    source: "legacy",
  },
  {
    id: "legacy-crusaders-mantle",
    name: "Manto del Crociato",
    level: 3,
    duration: "Up to 1 minute",
    concentration: true,
    range: "Self",
    area: null,
    source: "legacy",
  },
  {
    id: "legacy-tashas-mind-whip",
    name: "Scudiscio Mentale di Tasha",
    level: 2,
    duration: "1 round",
    concentration: false,
    range: "",
    area: null,
    source: "legacy",
  },
]);

function normalizeLookup(value) {
  return String(value || "")
    .trim()
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function durationToRounds(duration) {
  const clean = String(duration || "").trim().toLocaleLowerCase();
  const match = clean.match(/^(?:up to\s+)?(\d+)\s+(round|minute|hour|day)s?$/);
  if (!match) return null;
  const amount = Number(match[1]);
  const multiplier = {
    round: 1,
    minute: 10,
    hour: 600,
    day: 14400,
  }[match[2]];
  return Number.isFinite(amount) && multiplier ? amount * multiplier : null;
}

const RAW_SPELLS = Array.isArray(catalogData?.spells) ? catalogData.spells : [];
const ITALIAN_NAMES = italianData?.names && typeof italianData.names === "object"
  ? italianData.names
  : {};
const MISSING_ITALIAN_NAMES = RAW_SPELLS.filter((spell) => !ITALIAN_NAMES[spell.id]);
if (MISSING_ITALIAN_NAMES.length) {
  throw new Error(
    "Missing Italian spell names: "
    + MISSING_ITALIAN_NAMES.map((spell) => spell.id).join(", ")
  );
}
const ALL_SPELLS = [...RAW_SPELLS, ...LEGACY_MANUAL].map((spell) => {
  const italianName = String(ITALIAN_NAMES[spell.id] || "").trim();
  const aliases = Array.from(new Set([
    italianName,
    ...(ITALIAN_ALIASES[spell.id] || []),
  ].filter(Boolean)));
  const automation = AUTOMATION[spell.id] || null;
  const exactSelf = String(spell.range || "").trim().toLocaleLowerCase() === "self";
  return Object.freeze({
    ...spell,
    aliases: Object.freeze([...aliases]),
    displayName: italianName || aliases[0] || spell.name,
    defaultTurns: durationToRounds(spell.duration),
    targetMode: automation?.targetMode || (exactSelf ? "self" : "selected"),
    automation,
  });
});

const TRACKABLE_SPELLS = ALL_SPELLS.filter((spell) =>
  spell.source === "legacy" || String(spell.duration).toLocaleLowerCase() !== "instantaneous"
);

const BY_LOOKUP = new Map();
for (const spell of ALL_SPELLS) {
  for (const value of [spell.id, spell.name, spell.displayName, ...spell.aliases]) {
    const key = normalizeLookup(value);
    if (key && !BY_LOOKUP.has(key)) BY_LOOKUP.set(key, spell);
  }
}

export const SPELLS_5E_SRD = Object.freeze(TRACKABLE_SPELLS.map((spell) => spell.displayName));

export function getTrackableSpellOptions() {
  return TRACKABLE_SPELLS.map((spell) => ({
    id: spell.id,
    value: spell.displayName,
    label: spell.displayName,
    level: spell.level,
  }));
}

export function getSpellDefinition(value) {
  return BY_LOOKUP.get(normalizeLookup(value)) || null;
}

export function getProposedConditions(spell, choice = "") {
  const automation = spell?.automation;
  if (!automation) return [];
  if (automation.mode === "choice") {
    const selected = String(choice || "").trim();
    return automation.choices?.includes(selected) ? [selected] : [];
  }
  return Array.isArray(automation.conditions) ? [...automation.conditions] : [];
}

export { durationToRounds };
