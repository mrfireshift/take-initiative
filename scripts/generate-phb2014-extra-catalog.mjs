import fs from "node:fs";
import path from "node:path";

const OUTPUT_PATH = "src/spells-phb2014-extra.json";
const SCHEMA_VERSION = 1;
const EXPECTED_SPELL_COUNT = 41;
const SOURCE = Object.freeze({
  id: "phb2014",
  title: "Manuale del Giocatore 2014",
  pageRange: Object.freeze({ from: 211, to: 289 }),
});
const REQUIRED_FIELDS = Object.freeze([
  "nome",
  "scuola",
  "livello",
  "rituale",
  "scuola_e_livello",
  "tempo_di_lancio",
  "gittata",
  "componenti",
  "durata",
  "descrizione",
]);

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    values[arg.slice(2)] = argv[index + 1];
    index += 1;
  }
  return values;
}

function normalizedLookup(value) {
  return String(value || "")
    .trim()
    .toLocaleLowerCase("it")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function cleanText(value) {
  return String(value || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitDescription(value) {
  const clean = cleanText(value);
  const marker = /\n\nAi Livelli Superiori\.\s*/iu;
  const match = marker.exec(clean);
  if (!match) return { description: clean, higherLevels: "" };
  return {
    description: clean.slice(0, match.index).trim(),
    higherLevels: clean.slice(match.index + match[0].length).trim(),
  };
}

function durationDetails(value) {
  const duration = cleanText(value);
  const normalized = duration.toLocaleLowerCase("it");
  const concentration = normalized.startsWith("concentrazione");
  const base = normalized.replace(/^concentrazione,\s*fino a\s+/, "");
  const match = base.match(/^(\d+)\s+(round|minuto|minuti|ora|ore|giorno|giorni)$/u);
  const amount = Number(match?.[1]);
  const unit = match?.[2] || "";
  const multiplier = unit === "round"
    ? 1
    : unit === "minuto" || unit === "minuti"
      ? 10
      : unit === "ora" || unit === "ore"
        ? 600
        : unit === "giorno" || unit === "giorni"
          ? 14400
          : null;
  const defaultTurns = Number.isFinite(amount) && multiplier ? amount * multiplier : null;
  const durationKind = normalized === "istantanea"
    ? "instantaneous"
    : concentration
      ? "concentration"
      : defaultTurns !== null
        ? "rounds"
        : "special";
  return { duration, concentration, durationKind, defaultTurns };
}

function areaCandidate(range, description) {
  const sample = `${range}\n${description.slice(0, 700)}`;
  const patterns = [
    ["line", /\blinea(?: lunga)?(?: fino a)? ([\d,.]+ metri)/iu],
    ["cone", /\bcono(?: lungo)?(?: fino a)? (?:di )?([\d,.]+ metri)/iu],
    ["cylinder", /\bcilindro(?: del raggio)? (?:di )?([\d,.]+ metri)/iu],
    ["cube", /\bcubo(?: con spigolo)? (?:di )?([\d,.]+ metri)/iu],
    ["sphere", /\bsfera(?: del raggio)? (?:di )?([\d,.]+ metri)/iu],
    ["radius", /\braggio di ([\d,.]+ metri)/iu],
  ];
  for (const [type, pattern] of patterns) {
    const match = sample.match(pattern);
    if (match) return { type, sizeText: match[1], confidence: "candidate" };
  }
  return null;
}

function targetModeCandidate(range, description, area) {
  const selfRange = /^incantatore(?:\s*\(|$)/iu.test(range);
  const firstParagraph = description.split("\n\n")[0] || "";
  const selfArea = selfRange && (
    /\b(?:raggio|linea|cono)\b/iu.test(range)
    || /\bogni (?:altra )?creatura\b/iu.test(firstParagraph)
  );
  const selfSelected = selfRange
    && /\b(?:contro|sceglie|colpisce) una creatura\b|\bun bersaglio\b/iu.test(firstParagraph);
  if (selfArea) return "area";
  if (selfSelected) return "selected";
  if (selfRange) return "self";
  return area ? "area" : "selected";
}

function normalizeSpell(rawSpell) {
  const { description, higherLevels } = splitDescription(rawSpell.descrizione);
  const range = cleanText(rawSpell.gittata);
  const area = areaCandidate(range, description);
  return {
    id: `${SOURCE.id}-${normalizedLookup(rawSpell.nome)}`,
    name: cleanText(rawSpell.nome),
    level: Number(rawSpell.livello) || 0,
    school: cleanText(rawSpell.scuola),
    ritual: rawSpell.rituale === true,
    castingTime: cleanText(rawSpell.tempo_di_lancio),
    range,
    components: cleanText(rawSpell.componenti),
    ...durationDetails(rawSpell.durata),
    description,
    higherLevels,
    source: SOURCE.id,
    sourceTitle: SOURCE.title,
    sourcePageRange: { ...SOURCE.pageRange },
    targetModeCandidate: targetModeCandidate(range, description, area),
    areaCandidate: area,
  };
}

const args = parseArgs(process.argv.slice(2));
if (!args.input) throw new Error("Percorso --input mancante.");
const raw = JSON.parse(fs.readFileSync(args.input, "utf8"));
if (!Array.isArray(raw)) throw new Error("La radice del JSON deve essere un array.");
if (raw.length !== EXPECTED_SPELL_COUNT) {
  throw new Error(`Attese ${EXPECTED_SPELL_COUNT} spell, ricevute ${raw.length}.`);
}
for (const [index, spell] of raw.entries()) {
  const missing = REQUIRED_FIELDS.filter((field) =>
    spell?.[field] === undefined
    || spell?.[field] === null
    || (typeof spell[field] === "string" && !spell[field].trim())
  );
  if (missing.length) throw new Error(`Spell ${index}: campi mancanti ${missing.join(", ")}.`);
}

const spells = raw.map(normalizeSpell);
const ids = spells.map((spell) => spell.id);
if (new Set(ids).size !== ids.length) throw new Error("ID duplicati nel catalogo PHB 2014.");
const payload = {
  schemaVersion: SCHEMA_VERSION,
  language: "it",
  ruleset: "D&D 5e (2014)",
  generatedAt: new Date().toISOString().slice(0, 10),
  intendedUse: "private",
  source: {
    ...SOURCE,
    pageRange: { ...SOURCE.pageRange },
    inputFile: path.basename(args.input),
    spellCount: spells.length,
  },
  approvedIds: ids,
  spells,
};

fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(`Scritti ${spells.length} incantesimi in ${OUTPUT_PATH}`);
