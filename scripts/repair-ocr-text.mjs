// Mends the words an OCR split ("creazio ne", "s uoi", "svolge r e", "TI PI D I G ILDA") in the text pdftotext extracts
// from a private manual (compendio delle regole, fase 2), before generate-private-rules.mjs cuts it into entries.
// Two to four fragments next to each other become one word when together they make a known word and at least one of
// them alone is not one. The known words come from the Italian texts the plugin already has: the SRD compendium and
// spells and the private texts of every book (scripts/privateSources.mjs). Every mend goes to a log to review.
//
//   node scripts/repair-ocr-text.mjs --book=tasha
//
// in: <private folder>/sorgenti/regole/<book>-pdf.txt; out: <book>.txt and <book>-riparazioni.txt next to it.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { privateDir, privateRulesPath, readPrivateFeatureTexts, readPrivateRules, readPrivateSpellTexts } from "./privateSources.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BOOKS = ["phb2014", "xanathar", "tasha", "ranger-revised"];
const MAX_PARTS = 4;

const lettersOf = (token) => token.replace(/[^\p{L}]/gu, "").toLocaleLowerCase("it");
// The Italian words of one letter; any other single letter ("d" of the dice, "m" of the metres) is a fragment.
const ONE_LETTER_WORDS = new Set(["a", "e", "è", "i", "o"]);
const isKnown = (known, word) => (word.length === 1 ? ONE_LETTER_WORDS.has(word) : known.has(word));

// Every word of the texts given, lower case.
export function vocabularyOf(texts) {
  const vocabulary = new Set();
  for (const text of texts) for (const word of String(text).toLocaleLowerCase("it").match(/\p{L}+/gu) || []) vocabulary.add(word);
  return vocabulary;
}

// A line with its split words mended: [line, [[from, to]...]]. Only fragments made of letters (a trailing
// punctuation mark on the last one stays) are joined.
export function mendLine(line, known) {
  const tokens = line.split(" ");
  const out = [];
  const mends = [];
  for (let index = 0; index < tokens.length; index += 1) {
    let joined = null;
    for (let count = Math.min(MAX_PARTS, tokens.length - index); count >= 2; count -= 1) {
      const parts = tokens.slice(index, index + count);
      if (parts.slice(0, -1).some((part) => !/^\p{L}+$/u.test(part)) || !/^\p{L}+[^\p{L}\s]*$/u.test(parts.at(-1))) continue;
      const word = lettersOf(parts.join(""));
      if (!known.has(word) || parts.every((part) => isKnown(known, lettersOf(part)))) continue;
      joined = { text: parts.join(""), count };
      break;
    }
    if (joined) {
      mends.push([tokens.slice(index, index + joined.count).join(" "), joined.text]);
      out.push(joined.text);
      index += joined.count - 1;
    } else {
      out.push(tokens[index]);
    }
  }
  return [out.join(" "), mends];
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const book = process.argv.slice(2).find((arg) => arg.startsWith("--book="))?.slice("--book=".length);
  if (!book) throw new Error("Uso: --book=<id del manuale>");
  const dir = path.join(privateDir(), "sorgenti", "regole");
  const raw = fs.readFileSync(path.join(dir, `${book}-pdf.txt`), "utf8");
  const srd = JSON.parse(fs.readFileSync(path.join(ROOT, "src", "rules-reference-it.json"), "utf8"));
  const spells = JSON.parse(fs.readFileSync(path.join(ROOT, "src", "spell-reference-it.json"), "utf8"));
  const texts = [
    ...srd.entries.map((entry) => entry.text),
    ...Object.values(spells.spells).map((spell) => spell.description),
    ...BOOKS.flatMap((id) => [
      ...Object.values(readPrivateSpellTexts(id) || {}).map((spell) => spell.description),
      ...Object.values(readPrivateFeatureTexts(id) || {}),
      ...(id === book || !fs.existsSync(privateRulesPath(id)) ? [] : (readPrivateRules(id)?.entries || []).map((entry) => entry.text)),
    ]),
  ];
  const known = vocabularyOf(texts);
  // The book's own words, those it writes whole at least three times ("accademia", "patrono"…).
  const own = new Map();
  for (const word of raw.toLocaleLowerCase("it").match(/\p{L}{3,}/gu) || []) own.set(word, (own.get(word) || 0) + 1);
  for (const [word, times] of own) if (times >= 3) known.add(word);
  const log = new Map();
  const mended = raw.split(/\r?\n/u).map((line) => {
    const [text, mends] = mendLine(line, known);
    for (const [from, to] of mends) log.set(`${from} → ${to}`, (log.get(`${from} → ${to}`) || 0) + 1);
    return text;
  }).join("\n");
  fs.writeFileSync(path.join(dir, `${book}.txt`), mended, "utf8");
  const entries = [...log].sort((left, right) => right[1] - left[1]);
  fs.writeFileSync(path.join(dir, `${book}-riparazioni.txt`), entries.map(([mend, times]) => `${times}\t${mend}`).join("\n") + "\n", "utf8");
  console.log(`${known.size} parole note; ${entries.reduce((sum, [, times]) => sum + times, 0)} riparazioni (${entries.length} diverse).`);
}
