// Builds the GM's private packs (compendio delle regole, fase 2) from the private folder (scripts/privateSources.mjs):
// one pack per manual of PRIVATE_PACK_BOOKS that has texts there, written to <dir>/pacchetti/<book>.private-pack.json
// for the encyclopedia's Pacchetti panel. Never writes in the repository.
//
//   node scripts/build-private-packs.mjs
//
// Today a pack carries the texts of its spells (<dir>/testi/<book>/incantesimi.json); the rules and the class
// features join it in the next lots. Every pack is checked with the validation the encyclopedia runs on import.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PRIVATE_PACK_BOOKS, PRIVATE_PACK_FORMAT, PRIVATE_PACK_SCHEMA_VERSION, privatePackContentsLabel, privatePackSummary, validatePrivatePack } from "../src/privatePackCore.js";
import { privateDir, readPrivateSpellTexts } from "./privateSources.mjs";

export function buildPrivatePack(book, { spells = null, generatedAt = new Date().toISOString().slice(0, 10) } = {}) {
  const pack = {
    format: PRIVATE_PACK_FORMAT,
    schemaVersion: PRIVATE_PACK_SCHEMA_VERSION,
    id: book.id,
    title: book.title,
    badge: book.badge,
    generatedAt,
    ...(spells ? { spells } : {}),
  };
  const { error } = validatePrivatePack(pack);
  if (error) throw new Error(error);
  return pack;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outDir = path.join(privateDir(), "pacchetti");
  let written = 0;
  for (const book of Object.values(PRIVATE_PACK_BOOKS)) {
    const spells = readPrivateSpellTexts(book.id);
    if (!spells) continue;
    const pack = buildPrivatePack(book, { spells });
    const text = `${JSON.stringify(pack)}\n`;
    fs.mkdirSync(outDir, { recursive: true });
    const file = path.join(outDir, `${book.id}.private-pack.json`);
    fs.writeFileSync(file, text, "utf8");
    written += 1;
    console.log(`${book.badge} ${book.title}: ${privatePackContentsLabel(privatePackSummary(pack))} → ${file}`);
  }
  if (!written) console.log(`Nessun testo privato in ${privateDir()}.`);
}
