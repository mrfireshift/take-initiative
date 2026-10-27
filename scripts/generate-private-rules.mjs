// Builds the rules of a private manual for the GM's pack (compendio delle regole, fase 2, lotto P5), as the SRD
// compendium is built: the text pdftotext extracts from the GM's PDF, cut at the headings of an outline written by
// hand, with the same checks (every line lands in one entry, no word changes but the OCR corrections). Reads and
// writes the private folder only (scripts/privateSources.mjs):
//
//   pdftotext -enc UTF-8 "<manuale>.pdf" "<cartella privata>/sorgenti/regole/<book>.txt"
//   node scripts/generate-private-rules.mjs --book=xanathar [--preview]
//
// in: sorgenti/regole/<book>.txt and sorgenti/regole/<book>-indice.json; out: testi/<book>/regole.json and, with
// --preview, testi/<book>/regole-anteprima.md to read the result.
import fs from "node:fs";
import path from "node:path";

import { buildRulesReference, previewMarkdown, rulesReport } from "./generate-srd-rules-reference.mjs";
import { privateDir, privateRulesOutlinePath, privateRulesPath } from "./privateSources.mjs";

const argument = (name) => process.argv.slice(2).find((arg) => arg.startsWith(`--${name}`))?.split("=")[1] ?? null;
const book = argument("book");
if (!book) throw new Error("Uso: --book=<id del manuale> [--preview]");

const outline = JSON.parse(fs.readFileSync(privateRulesOutlinePath(book), "utf8"));
const pdfText = fs.readFileSync(path.join(privateDir(), "sorgenti", "regole", `${book}.txt`), "utf8");
const result = buildRulesReference(pdfText, outline);
const file = privateRulesPath(book);
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, `${JSON.stringify({ book, rules: { topics: result.reference.topics, entries: result.reference.entries } }, null, 2)}\n`, "utf8");
if (process.argv.includes("--preview")) {
  fs.writeFileSync(path.join(path.dirname(file), "regole-anteprima.md"), previewMarkdown(result), "utf8");
}
console.log(rulesReport(result, outline));
console.log(`Regole scritte in ${file}`);
