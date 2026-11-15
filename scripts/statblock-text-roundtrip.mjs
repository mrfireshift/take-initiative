#!/usr/bin/env node
// L'oracolo del parser di testo (statblock da testo, lotto ST1, docs/STUDIO_IMPORT_STATBLOCK_TESTO.md §6.1): ogni mostro di
// 5eTools stampato come nel libro, riletto dal parser e passato all'adattatore deve dare lo stesso blocco dell'import
// diretto. Ogni campo esce uguale, mancante (il diretto lo ha, il testo no) o diverso (il testo ha un valore sbagliato, o
// in più). La soglia del lotto (D8) è zero diversi; i mancanti vanno nel rapporto del parser.
//
//   node scripts/statblock-text-roundtrip.mjs bestiary-mm.json bestiary-vgm.json [...] [--table] [--samples]
//
// --table: i punteggi su due righe, come nel Manuale dei Mostri (altrimenti su una, come la tab Statistiche).
// --samples: fino a 5 esempi per campo. I file restano dove sono; i derivati trovano la base fra tutti i file passati.
// Esce con 1 se c'è anche un solo valore diverso.
import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { fiveToolsCollection, fiveToolsMonsterToStatblock } from "../src/fiveToolsMonsterCore.js";
import { parseStatblockText } from "../src/monsterStatblockTextParseCore.js";
import { printedStatblockText } from "../test-support/statblockTextPrint.js";

const args = process.argv.slice(2);
const files = args.filter((arg) => !arg.startsWith("--"));
const abilities = args.includes("--table") ? "table" : "inline";
const showSamples = args.includes("--samples");
if (!files.length) {
  console.error("Uso: node scripts/statblock-text-roundtrip.mjs <bestiario.json> [...] [--table] [--samples]");
  process.exit(1);
}
const { pool, monsters } = fiveToolsCollection(files.map((file) => JSON.parse(readFileSync(file, "utf8"))));
const IGNORED = new Set(["ref", "source", "portrait"]);
const count = { mostri: 0, identici: 0, "solo mancanti": 0, "con diversi": 0, "rifiutati dal parser": 0 };
const fields = {};
const samples = {};
const bump = (field, outcome) => {
  fields[field] ||= { mancante: 0, diverso: 0 };
  fields[field][outcome] += 1;
};
const sample = (key, text) => {
  (samples[key] ||= []).length < 5 && samples[key].push(text);
};
const short = (value) => {
  const text = JSON.stringify(value);
  return text && text.length > 160 ? `${text.slice(0, 159)}…` : text;
};

// One block against the other: { missing, different } with the field of each difference ("actions[Bite].attack").
function compare(direct, read) {
  const missing = [];
  const different = [];
  const keys = new Set([...Object.keys(direct), ...Object.keys(read)].filter((key) => !IGNORED.has(key) && key !== "actions"));
  for (const key of keys) {
    if (isDeepStrictEqual(direct[key], read[key])) continue;
    if (read[key] === undefined) missing.push({ field: key, direct: direct[key] });
    else different.push({ field: key, direct: direct[key], read: read[key] });
  }
  const directActions = direct.actions || [];
  const readActions = [...(read.actions || [])];
  for (const action of directActions) {
    const index = readActions.findIndex((entry) => entry.name === action.name);
    if (index < 0) {
      missing.push({ field: "actions[?]", direct: action.name });
      continue;
    }
    const [other] = readActions.splice(index, 1);
    for (const key of new Set([...Object.keys(action), ...Object.keys(other)])) {
      if (isDeepStrictEqual(action[key], other[key])) continue;
      const field = `actions.${key}`;
      if (other[key] === undefined) missing.push({ field, direct: action[key], name: action.name });
      else different.push({ field, direct: action[key], read: other[key], name: action.name });
    }
  }
  for (const extra of readActions) different.push({ field: "actions[+]", direct: undefined, read: extra.name });
  return { missing, different };
}

for (const monster of monsters) {
  const converted = fiveToolsMonsterToStatblock(monster, { pool });
  if (!converted.block) continue;
  count.mostri += 1;
  const text = printedStatblockText(converted.monster, { abilities });
  const parsed = parseStatblockText(text);
  if (parsed.error) {
    count["rifiutati dal parser"] += 1;
    sample("rifiutati", `${monster.name} (${monster.source}): ${parsed.error}`);
    continue;
  }
  const again = fiveToolsMonsterToStatblock(parsed.monster);
  if (!again.block) {
    count["rifiutati dal parser"] += 1;
    sample("rifiutati", `${monster.name} (${monster.source}): ${again.error}`);
    continue;
  }
  const { missing, different } = compare(converted.block, again.block);
  if (!missing.length && !different.length) count.identici += 1;
  else if (!different.length) count["solo mancanti"] += 1;
  else count["con diversi"] += 1;
  for (const entry of missing) {
    bump(entry.field, "mancante");
    sample(`mancante ${entry.field}`, `${monster.name} (${monster.source})${entry.name ? ` / ${entry.name}` : ""}: ${short(entry.direct)}`);
  }
  for (const entry of different) {
    bump(entry.field, "diverso");
    sample(`diverso ${entry.field}`, `${monster.name} (${monster.source})${entry.name ? ` / ${entry.name}` : ""}: ${short(entry.direct)} → ${short(entry.read)}`);
  }
  if (parsed.report.length) sample("rapporto del parser", `${monster.name}: ${parsed.report.join(" · ")}`);
}

console.log(`Punteggi: ${abilities === "table" ? "su due righe" : "su una riga"}`);
for (const [key, value] of Object.entries(count)) console.log(`${key}: ${value}`);
const rows = Object.entries(fields).sort(([left], [right]) => left.localeCompare(right));
if (rows.length) {
  console.log("\nCampo: mancanti / diversi");
  for (const [field, value] of rows) console.log(`  ${field}: ${value.mancante} / ${value.diverso}`);
}
if (showSamples || count["con diversi"] || count["rifiutati dal parser"]) {
  for (const [key, list] of Object.entries(samples)) {
    if (!showSamples && !key.startsWith("diverso") && key !== "rifiutati") continue;
    console.log(`\n${key}:`);
    for (const line of list) console.log(`  ${line}`);
  }
}
process.exit(count["con diversi"] || count["rifiutati dal parser"] ? 1 : 0);
