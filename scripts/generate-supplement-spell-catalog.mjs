import fs from "node:fs";
import path from "node:path";

import italian from "../src/spells-it-2014.json" with { type: "json" };

const OUTPUT_PATH = "src/spells-supplements-2014.json";
const RUNTIME_OUTPUT_PATH = "src/spells-supplements-runtime.json";
const REPORT_PATH = "docs/archive/generated/REVISIONE_INCANTESIMI_SUPPLEMENTI.md";
const SCHEMA_VERSION = 1;

const SOURCES = Object.freeze({
  xanathar: Object.freeze({
    title: "Guida Omnicomprensiva di Xanathar",
    pageRange: Object.freeze({ from: 151, to: 172 }),
  }),
  tasha: Object.freeze({
    title: "Calderone Omnicomprensivo di Tasha",
    pageRange: Object.freeze({ from: 107, to: 117 }),
  }),
});

const LEGACY_NAMES = Object.freeze([
  "Manto del Crociato",
  "Scudiscio Mentale di Tasha",
]);

const TRUE_DUPLICATE_NAMES = Object.freeze(new Map([
  ["scudiscio-mentale-di-tasha", Object.freeze({
    id: "scudiscio-mentale-di-tasha",
    source: "legacy",
  })],
]));

const REQUIRED_FIELDS = Object.freeze([
  "nome",
  "scuola",
  "livello",
  "rituale",
  "tempo_di_lancio",
  "gittata",
  "componenti",
  "durata",
  "descrizione",
  "scuola_e_livello",
]);

const CONDITION_PATTERNS = Object.freeze([
  ["Accecato", /\baccecat[oaie]\b/iu],
  ["Affascinato", /\baffascinat[oaie]\b/iu],
  ["Afferrato", /\bafferrat[oaie]\b/iu],
  ["Assordato", /\bassordat[oaie]\b/iu],
  ["Avvelenato", /\bavvelenat[oaie]\b/iu],
  ["Incapacitato", /\bincapacitat[oaie]\b/iu],
  ["Invisibile", /\binvisibil[ei]\b/iu],
  ["Paralizzato", /\bparalizzat[oaie]\b/iu],
  ["Pietrificato", /\bpietrificat[oaie]\b/iu],
  ["Privo di sensi", /\bpriv[oaie] di sensi\b/iu],
  ["Prono", /\bpron[oaie]\b/iu],
  ["Spaventato", /\bspaventat[oaie]\b/iu],
  ["Stordito", /\bstordit[oaie]\b/iu],
  ["Trattenuto", /\btrattenut[oaie]\b/iu],
]);

const EFFECT_PATTERNS = Object.freeze([
  ["advantage", /\bvantaggio\b/iu],
  ["disadvantage", /\bsvantaggio\b/iu],
  ["armor-class", /\b(?:classe armatura|alla CA|bonus di \+\d+ alla CA)\b/iu],
  ["bonus-or-penalty", /\b(?:bonus (?:di|alla|al|ai|alle|pari)|sottrarr?e?|penalit[àa])\b/iu],
  ["damage-resistance", /\bresistenza ai danni|\bresistenza al tipo di danno/iu],
  ["damage-immunity", /\bimmunit[àa] ai danni|\bimmune ai danni/iu],
  ["extra-damage", /\bdanni extra\b/iu],
  ["healing-block", /\bnon pu[oò] recuperare punti ferita\b/iu],
  ["speed-change", /\bvelocit[àa].{0,40}(?:aument|ridott|dimezz|pari a 0)|\baumenta.{0,30}velocit[àa]\b/iu],
  ["temporary-hp", /\bpunti ferita temporanei\b/iu],
  ["reaction-block", /\bnon pu[oò] effettuare una reazione\b/iu],
  ["movement-restriction", /\b(?:non pu[oò] muoversi|terreno difficile|attacchi d['’]opportunit[àa])\b/iu],
]);

const ONE_ROUND_PROPOSALS = Object.freeze({
  "xanathar-assorbire-elementi": Object.freeze({
    integration: "multi-stage",
    spellExpiry: Object.freeze({ mode: "turn-end", actor: "source", remaining: 1, anchor: "next-turn" }),
    effects: Object.freeze([
      Object.freeze({
        id: "trigger-damage-resistance",
        kind: "buff",
        choice: "acido|freddo|fulmine|fuoco|tuono",
        expiry: Object.freeze({ mode: "turn-start", actor: "source", remaining: 1, anchor: "next-turn" }),
      }),
      Object.freeze({
        id: "next-melee-hit-extra-damage",
        kind: "buff",
        manualRemoval: true,
        endsParentOnRemoval: true,
        expiry: Object.freeze({ mode: "turn-end", actor: "source", remaining: 1, anchor: "next-turn" }),
      }),
    ]),
  }),
  "tasha-lama-roboante": Object.freeze({
    integration: "manual-trigger",
    spellExpiry: Object.freeze({ mode: "turn-start", actor: "source", remaining: 1, anchor: "next-turn" }),
    effects: Object.freeze([
      Object.freeze({
        id: "movement-triggered-thunder-damage",
        kind: "debuff",
        manualRemoval: true,
        endsParentOnRemoval: true,
        expiry: Object.freeze({ mode: "turn-start", actor: "source", remaining: 1, anchor: "next-turn" }),
      }),
    ]),
  }),
  "tasha-scheggia-della-mente": Object.freeze({
    integration: "manual-trigger",
    spellExpiry: Object.freeze({ mode: "turn-end", actor: "source", remaining: 1, anchor: "next-turn" }),
    effects: Object.freeze([
      Object.freeze({
        id: "next-saving-throw-penalty",
        kind: "debuff",
        manualRemoval: true,
        endsParentOnRemoval: true,
        expiry: Object.freeze({ mode: "turn-end", actor: "source", remaining: 1, anchor: "next-turn" }),
      }),
    ]),
  }),
  "tasha-scudiscio-mentale-di-tasha": Object.freeze({
    integration: "target-turn",
    spellExpiry: Object.freeze({ mode: "turn-end", actor: "target", remaining: 1, anchor: "next-turn" }),
    effects: Object.freeze([
      Object.freeze({
        id: "no-reaction-and-limited-turn-options",
        kind: "debuff",
        expiry: Object.freeze({ mode: "turn-end", actor: "target", remaining: 1, anchor: "next-turn" }),
      }),
    ]),
  }),
});

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
    .replace(/(\d)\s+°/gu, "$1°")
    .replace(/\btiuo\b/giu, "tipo")
    .replace(/\bdeve\s+'\s+effettuare\b/giu, "deve effettuare")
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
  const rounds = Number.isFinite(amount) && multiplier ? amount * multiplier : null;
  let kind = "special";
  if (normalized === "istantanea") kind = "instantaneous";
  else if (concentration) kind = "concentration";
  else if (rounds !== null) kind = "rounds";
  else if (/finch[eé] non viene dissolto/iu.test(normalized)) kind = "permanent";
  else if (/istantanea.+(?:ora|minuto|round)/iu.test(normalized)) kind = "hybrid";
  return { duration, concentration, durationKind: kind, defaultTurns: rounds };
}

function areaCandidate(range, description) {
  const sample = `${range}\n${description.slice(0, 500)}`;
  const patterns = [
    ["line", /\blinea(?: lunga)? di? ([\d,.]+ metri)/iu],
    ["cone", /\bcono(?: lungo)? di? ([\d,.]+ metri)/iu],
    ["cylinder", /\bcilindro(?: del raggio)? di? ([\d,.]+ metri)/iu],
    ["cube", /\bcubo(?: con spigolo)? di? ([\d,.]+ metri)/iu],
    ["sphere", /\bsfera(?: del raggio)? di? ([\d,.]+ metri)/iu],
    ["radius", /\braggio di ([\d,.]+ metri)/iu],
  ];
  for (const [type, pattern] of patterns) {
    const match = sample.match(pattern);
    if (match) return { type, sizeText: match[1], confidence: "candidate" };
  }
  return null;
}

function exactTurnPhrases(description) {
  const phrases = [];
  const pattern = /[^.!?\n]*(?:fino|prima|entro)[^.!?\n]{0,100}(?:inizio|fine|termine)[^.!?\n]{0,100}turno[^.!?\n]*[.!?]?/giu;
  for (const match of description.matchAll(pattern)) {
    const phrase = cleanText(match[0]);
    if (phrase && !phrases.includes(phrase)) phrases.push(phrase);
  }
  return phrases;
}

function correctionNotes(raw, cleaned) {
  const notes = [];
  if (/\btiuo\b/iu.test(raw)) notes.push("Corretto refuso «tiuo» → «tipo».");
  if (/\bdeve\s+'\s+effettuare\b/iu.test(raw)) notes.push("Rimosso apostrofo estraneo prima di «effettuare».");
  if (/(\d)\s+°/u.test(raw)) notes.push("Normalizzata la spaziatura dei simboli di livello.");
  if (raw !== cleaned && !notes.length) notes.push("Normalizzati spazi e interruzioni di riga.");
  return notes;
}

function readSource(sourceId, filePath) {
  if (!filePath) throw new Error(`Percorso --${sourceId} mancante.`);
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error(`${sourceId}: la radice deve essere un array.`);
  for (const [index, spell] of parsed.entries()) {
    const missing = REQUIRED_FIELDS.filter((field) =>
      spell?.[field] === undefined || spell?.[field] === null ||
      (typeof spell[field] === "string" && !spell[field].trim())
    );
    if (missing.length) {
      throw new Error(`${sourceId}[${index}] campi mancanti: ${missing.join(", ")}`);
    }
  }
  return { sourceId, filePath, entries: parsed };
}

const currentNames = new Map();
for (const [id, name] of Object.entries(italian.names || {})) {
  currentNames.set(normalizedLookup(name), { id, source: "srd" });
}
for (const name of LEGACY_NAMES) {
  currentNames.set(normalizedLookup(name), { id: normalizedLookup(name), source: "legacy" });
}

function normalizeSpell(sourceId, rawSpell) {
  const source = SOURCES[sourceId];
  const rawDescription = String(rawSpell.descrizione || "");
  const cleanedFullDescription = cleanText(rawDescription);
  const { description, higherLevels } = splitDescription(rawDescription);
  const duration = durationDetails(rawSpell.durata);
  const id = `${sourceId}-${normalizedLookup(rawSpell.nome)}`;
  const conditions = CONDITION_PATTERNS
    .filter(([, pattern]) => pattern.test(description))
    .map(([condition]) => condition);
  const effectTags = EFFECT_PATTERNS
    .filter(([, pattern]) => pattern.test(description))
    .map(([tag]) => tag);
  const area = areaCandidate(rawSpell.gittata, description);
  const exactPhrases = exactTurnPhrases(description);
  const nameKey = normalizedLookup(rawSpell.nome);
  const duplicate = TRUE_DUPLICATE_NAMES.get(nameKey) || null;
  const existingName = currentNames.get(nameKey) || null;
  const nameCollision = !duplicate && existingName ? existingName : null;
  const lingeringInstantaneous = duration.durationKind === "instantaneous" && (
    exactPhrases.length > 0 ||
    /\bper (?:le|i|la|il|un|una)?\s*(?:\d+|ventiquattro|sette)\s*(?:round|turn|ore?|giorni?|minuti?)\b/iu.test(description)
  );
  const choiceCandidate = /\b(?:sceglie|a scelta|una delle opzioni|forme? seguenti|tipo scelto)\b/iu.test(description);
  const flags = [];
  if (duplicate) flags.push("duplicate-existing");
  if (nameCollision) flags.push("name-collision-existing");
  if (duration.durationKind === "hybrid" || duration.durationKind === "special") flags.push("duration-review");
  if (exactPhrases.length) flags.push("exact-turn-boundary");
  if (conditions.length) flags.push("condition-candidate");
  if (effectTags.length) flags.push("effect-candidate");
  if (choiceCandidate) flags.push("choice-candidate");
  if (area) flags.push("area-candidate");
  if (lingeringInstantaneous) flags.push("instantaneous-lingering-effect");
  const notes = correctionNotes(rawDescription, cleanedFullDescription);
  if (notes.length) flags.push("text-normalized");
  const proposal = ONE_ROUND_PROPOSALS[id] || null;
  if (proposal?.integration === "multi-stage") flags.push("multi-stage");

  const range = cleanText(rawSpell.gittata);
  const selfRange = /^incantatore(?:\s*\(|$)/iu.test(range);
  const firstParagraph = description.split("\n\n")[0] || "";
  const selfArea = selfRange && (
    /\b(?:linea|cono)\b/iu.test(range) ||
    /\bogni (?:altra )?creatura\b/iu.test(firstParagraph)
  );
  const selfSelected = selfRange && /\b(?:contro|sceglie|colpisce) una creatura\b|\bun bersaglio\b/iu.test(firstParagraph);
  const targetModeCandidate = selfArea
    ? "area"
    : selfSelected
      ? "selected"
      : selfRange
        ? "self"
        : area
          ? "area"
          : "selected";
  if (selfRange && /\braggio\b/iu.test(range) && !selfArea) flags.push("target-review");
  const integrationStatus = duplicate
    ? "merge-existing"
    : nameCollision
      ? "collision-review"
    : duration.durationKind !== "instantaneous"
      ? "trackable-review"
      : lingeringInstantaneous
        ? "manual-review"
        : "reference-only";

  return {
    id,
    name: cleanText(rawSpell.nome),
    level: Number(rawSpell.livello) || 0,
    school: cleanText(rawSpell.scuola),
    ritual: rawSpell.rituale === true,
    castingTime: cleanText(rawSpell.tempo_di_lancio),
    range,
    components: cleanText(rawSpell.componenti),
    ...duration,
    description,
    higherLevels,
    source: sourceId,
    sourceTitle: source.title,
    sourcePageRange: { ...source.pageRange },
    targetModeCandidate,
    areaCandidate: area,
    review: {
      integrationStatus,
      duplicateOf: duplicate,
      nameCollisionWith: nameCollision,
      conditionCandidates: conditions,
      effectCandidates: effectTags,
      choiceCandidate,
      exactTurnPhrases: exactPhrases,
      flags: Array.from(new Set(flags)),
      normalizationNotes: notes,
      proposedAutomation: proposal,
    },
  };
}

function markdownReport(payload) {
  const rows = payload.spells;
  const counts = (field) => rows.reduce((map, spell) => {
    const key = field(spell);
    map.set(key, (map.get(key) || 0) + 1);
    return map;
  }, new Map());
  const statuses = counts((spell) => spell.review.integrationStatus);
  const sourceRows = payload.sources.map((source) =>
    `| ${source.title} | ${source.spellCount} | ${source.pageRange.from}–${source.pageRange.to} |`
  );
  const statusRows = Array.from(statuses, ([status, count]) => `| ${status} | ${count} |`);
  const priority = rows.filter((spell) =>
    spell.review.flags.some((flag) => [
      "duplicate-existing",
      "name-collision-existing",
      "duration-review",
      "exact-turn-boundary",
      "instantaneous-lingering-effect",
      "multi-stage",
    ].includes(flag))
  );
  const priorityRows = priority.map((spell) => {
    const flags = spell.review.flags.join(", ");
    const existing = spell.review.duplicateOf || spell.review.nameCollisionWith;
    const relation = existing
      ? `${spell.review.duplicateOf ? "merge" : "collisione"}: ${existing.source}:${existing.id}`
      : "—";
    return `| ${spell.name.replace(/\|/g, "\\|")} | ${spell.source} | ${spell.duration.replace(/\|/g, "\\|")} | ${spell.review.integrationStatus} | ${relation} | ${flags} |`;
  });
  const oneRoundRows = rows.filter((spell) => spell.duration === "1 round").map((spell) => {
    const proposal = spell.review.proposedAutomation;
    const expiry = proposal?.spellExpiry
      ? `${proposal.spellExpiry.mode}/${proposal.spellExpiry.actor}/${proposal.spellExpiry.anchor || "prima-boundary"}`
      : "da revisionare";
    return `| ${spell.name} | ${spell.source} | ${proposal?.integration || "manual-review"} | ${expiry} |`;
  });

  return `# Revisione incantesimi dei supplementi

Catalogo generato il ${payload.generatedAt}. Tutte le voci sono abilitate nel catalogo runtime; le automazioni restano limitate ai casi revisionati esplicitamente.

## Fonti

| Manuale | Incantesimi | Pagine del file fornito |
| --- | ---: | --- |
${sourceRows.join("\n")}

Totale: **${rows.length}** incantesimi.

## Stato di integrazione

| Stato | Totale |
| --- | ---: |
${statusRows.join("\n")}

- \`trackable-review\`: durata esplicita, candidato al tracker.
- \`reference-only\`: istantaneo senza effetto persistente rilevato.
- \`manual-review\`: istantaneo con effetto persistente nel testo.
- \`merge-existing\`: nome già presente nel catalogo SRD o legacy.
- \`collision-review\`: stesso nome italiano, ma incantesimo distinto da quello esistente.

## Incantesimi da 1 round

| Incantesimo | Fonte | Modello proposto | Scadenza spell proposta |
| --- | --- | --- | --- |
${oneRoundRows.join("\n")}

## Casi prioritari

| Incantesimo | Fonte | Durata | Stato | Relazione con voce esistente | Indicatori |
| --- | --- | --- | --- | --- | --- |
${priorityRows.join("\n")}

## Limiti della normalizzazione automatica

- Le classi abilitate non sono presenti nei JSON forniti.
- Le pagine sono note solo come intervallo del file, non per singolo incantesimo.
- Bersagli, aree, condizioni ed effetti sono candidati ricavati dal testo e devono essere confermati.
- Le descrizioni con più fasi possono richiedere pill figlie con scadenze diverse dalla spell.
`;
}

const args = parseArgs(process.argv.slice(2));
const inputs = [
  readSource("xanathar", args.xanathar),
  readSource("tasha", args.tasha),
];
const spells = inputs.flatMap((input) =>
  input.entries.map((spell) => normalizeSpell(input.sourceId, spell))
);
const ids = spells.map((spell) => spell.id);
if (new Set(ids).size !== ids.length) throw new Error("ID duplicati nel catalogo normalizzato.");

const payload = {
  schemaVersion: SCHEMA_VERSION,
  language: "it",
  ruleset: "D&D 5e (2014)",
  generatedAt: new Date().toISOString().slice(0, 10),
  intendedUse: "private",
  sources: inputs.map((input) => ({
    id: input.sourceId,
    title: SOURCES[input.sourceId].title,
    pageRange: { ...SOURCES[input.sourceId].pageRange },
    inputFile: path.basename(input.filePath),
    spellCount: input.entries.length,
  })),
  spells,
};

fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
const runtimeIds = spells.map((spell) => spell.id);
fs.writeFileSync(RUNTIME_OUTPUT_PATH, `${JSON.stringify({
  schemaVersion: SCHEMA_VERSION,
  generatedAt: payload.generatedAt,
  approvedIds: runtimeIds,
  spells: runtimeIds.map((id) => {
    const spell = spells.find((entry) => entry.id === id);
    if (!spell) throw new Error(`Incantesimo runtime approvato non trovato: ${id}`);
    return spell;
  }),
}, null, 2)}\n`, "utf8");
fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, markdownReport(payload), "utf8");
console.log(`Scritti ${spells.length} incantesimi in ${OUTPUT_PATH}`);
console.log(`Scritti ${runtimeIds.length} incantesimi in ${RUNTIME_OUTPUT_PATH}`);
console.log(`Rapporto scritto in ${REPORT_PATH}`);
