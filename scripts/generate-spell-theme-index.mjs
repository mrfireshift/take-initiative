import fs from "node:fs";
import { getSpellCatalog } from "../src/spells-srd.js";

const THEMES = Object.freeze({
  arcane: { hue: 218, saturation: 34, lightness: 31 },
  acid: { hue: 82, saturation: 68, lightness: 36 },
  cold: { hue: 196, saturation: 72, lightness: 38 },
  fire: { hue: 12, saturation: 76, lightness: 40 },
  lightning: { hue: 275, saturation: 70, lightness: 43 },
  thunder: { hue: 235, saturation: 64, lightness: 43 },
  poison: { hue: 112, saturation: 58, lightness: 34 },
  necrotic: { hue: 286, saturation: 58, lightness: 38 },
  psychic: { hue: 322, saturation: 64, lightness: 41 },
  radiant: { hue: 45, saturation: 80, lightness: 40 },
  force: { hue: 262, saturation: 70, lightness: 43 },
  healing: { hue: 145, saturation: 58, lightness: 34 },
  abjuration: { hue: 207, saturation: 70, lightness: 37 },
  conjuration: { hue: 31, saturation: 74, lightness: 40 },
  divination: { hue: 190, saturation: 52, lightness: 38 },
  enchantment: { hue: 335, saturation: 62, lightness: 42 },
  evocation: { hue: 5, saturation: 72, lightness: 40 },
  illusion: { hue: 268, saturation: 57, lightness: 42 },
  necromancy: { hue: 288, saturation: 52, lightness: 35 },
  transmutation: { hue: 104, saturation: 54, lightness: 36 },
});

const ELEMENT_TERMS = Object.freeze([
  ["acid", ["acido", "acida", "acid"]],
  ["cold", ["fredd", "gelo", "ghiaccio", "ice", "cold"]],
  ["fire", ["fuoco", "fiamma", "fiamme", "incandesc", "fire", "flame"]],
  ["lightning", ["fulmine", "folgor", "lightning"]],
  ["thunder", ["tuono", "tonante", "thunder"]],
  ["poison", ["veleno", "velen", "poison"]],
  ["necrotic", ["necrot", "necromant", "necrotic"]],
  ["psychic", ["psichic", "mentale", "dissonant", "psychic"]],
  ["radiant", ["radios", "radiante", "radian", "radiant"]],
  ["force", ["danni da forza", "force damage", "force"]],
]);

const SCHOOL_THEMES = Object.freeze([
  ["abiurazione", "abjuration"],
  ["abjuration", "abjuration"],
  ["ammaliamento", "enchantment"],
  ["enchantment", "enchantment"],
  ["divinazione", "divination"],
  ["divination", "divination"],
  ["evocazione", "conjuration"],
  ["conjuration", "conjuration"],
  ["illusione", "illusion"],
  ["illusion", "illusion"],
  ["invocazione", "evocation"],
  ["evocation", "evocation"],
  ["necromanzia", "necromancy"],
  ["necromancy", "necromancy"],
  ["trasmutazione", "transmutation"],
  ["transmutation", "transmutation"],
]);

const SUPPORT_TERMS = Object.freeze([
  "guarig", "cura ferite", "curare", "healing", "vigore", "heal",
]);

const NAME_THEME_HINTS = Object.freeze([
  ["radiant", [
    "manto del crociato", "crusader's mantle", "crusaders mantle",
  ]],
  ["abjuration", [
    "scudo", "armatura", "protezione", "resistenza", "barriera", "interdizione",
    "benedizione", "aiuto", "aura di vita", "aura di purezza", "cerchio di potere",
    "shield", "ward", "protection",
  ]],
  ["enchantment", [
    "charme", "ammalia", "dominare", "suggestione", "comando", "sonno", "paura",
    "confusione", "ipnotic", "charm", "dominate", "suggestion", "command",
  ]],
  ["illusion", [
    "illus", "invisibil", "immagine", "allucinazione", "camuffare", "mascherare",
    "phantasmal", "invisibility", "image", "disguise",
  ]],
  ["necromancy", [
    "animare morti", "morte", "necrom", "risucchio", "ferire", "contagio", "vampir",
    "animate dead", "death", "vampiric",
  ]],
  ["divination", [
    "individuare", "scrutare", "presagio", "identificare", "percezione", "conoscenza",
    "divin", "detect", "scry", "identify", "foresight",
  ]],
  ["conjuration", [
    "evoca", "evocare", "teletrasporto", "portale", "porta dimensionale", "convocare",
    "summon", "teleport", "portal", "dimension door",
  ]],
  ["transmutation", [
    "velocità", "volare", "forma", "ingrandire", "rimpicciolire", "metamorfosi",
    "pietra", "haste", "fly", "enlarge", "polymorph",
  ]],
]);

const SPELL_THEME_OVERRIDES = Object.freeze({
  "xanathar-sfera-al-vetriolo": "acid",
});

function normalized(value) {
  return String(value || "").trim().toLocaleLowerCase("it");
}

function findElement(text) {
  const matches = ELEMENT_TERMS
    .filter(([, terms]) => terms.some((term) => text.includes(term)))
    .map(([theme]) => theme);
  return matches.length === 1 ? matches[0] : null;
}

function themeForSpell(spell) {
  const reference = spell?.italianReference && typeof spell.italianReference === "object"
    ? spell.italianReference
    : {};
  const idAndName = normalized([
    spell?.id,
    spell?.name,
    spell?.displayName,
  ].filter(Boolean).join(" "));
  const description = normalized(spell?.description || reference.description);
  const damageType = normalized(spell?.damageType || reference.damageType);

  const explicitTheme = SPELL_THEME_OVERRIDES[normalized(spell?.id)];
  if (explicitTheme) return explicitTheme;

  const structuredElement = findElement(damageType);
  if (structuredElement) return structuredElement;

  if (idAndName.includes("forza") || idAndName.includes("force")) return "force";

  const namedElement = findElement(idAndName);
  if (namedElement) return namedElement;

  const allText = `${idAndName} ${description}`;
  const describedElement = findElement(allText);
  if (describedElement) return describedElement;

  if (SUPPORT_TERMS.some((term) => allText.includes(term))) return "healing";

  const school = normalized(spell?.school || reference.school);
  for (const [term, theme] of SCHOOL_THEMES) {
    if (school.includes(term)) return theme;
  }

  for (const [theme, terms] of NAME_THEME_HINTS) {
    if (terms.some((term) => idAndName.includes(term))) return theme;
  }

  return "arcane";
}

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

const catalog = getSpellCatalog();
const index = {};

for (const spell of catalog) {
  const theme = themeForSpell(spell);
  const aliases = Array.isArray(spell.aliases) ? spell.aliases : (spell.alias ? [spell.alias] : []);
  for (const val of [spell.id, spell.name, spell.displayName, spell.catalogLabel, ...aliases]) {
    const key = normalizeLookup(val);
    if (key && !index[key]) index[key] = theme;
  }
}

const sortedKeys = Object.keys(index).sort();
const lines = [
  "// Generated by scripts/generate-spell-theme-index.mjs - DO NOT EDIT MANUALLY",
  "export const SPELL_THEMES_BY_KEY = Object.freeze({",
  ...sortedKeys.map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(index[k])},`),
  "});",
  "",
  "export function lookupSpellTheme(key) {",
  "  return SPELL_THEMES_BY_KEY[key] || null;",
  "}",
  "",
];

const outputPath = "src/spellThemeIndex.js";
fs.writeFileSync(outputPath, lines.join("\n"), "utf8");
console.log(`Wrote ${sortedKeys.length} spell themes to ${outputPath}`);
