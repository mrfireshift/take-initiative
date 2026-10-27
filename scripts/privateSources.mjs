// Where the private sources of the manuals live (compendio delle regole, fase 2, decision D8): next to the GM's PDFs,
// never in the repository. TAKE_INITIATIVE_PRIVATE_DIR overrides the default folder.
//
//   <dir>/sorgenti/incantesimi/   the raw spell files the catalog generators read
//   <dir>/testi/<book>/incantesimi.json   { book, spells: { [spellId]: { description, higherLevels } } }
//   <dir>/pacchetti/<book>.private-pack.json   what the GM imports in the encyclopedia (build-private-packs.mjs)
//
// The scripts and the tests that need a text read it from here; without the folder (a fresh clone, the CI) the tests
// that check the texts are skipped and everything else runs.
import fs from "node:fs";
import path from "node:path";

export const DEFAULT_PRIVATE_DIR = "L:/Dungeons & Dragons/Take Initiative";

export function privateDir(env = process.env) {
  return path.resolve(String(env.TAKE_INITIATIVE_PRIVATE_DIR || DEFAULT_PRIVATE_DIR));
}

export function hasPrivateDir(env = process.env) {
  return fs.existsSync(privateDir(env));
}

export function privateSourcePath(...parts) {
  return path.join(privateDir(), "sorgenti", ...parts);
}

export function privateSpellTextsPath(book) {
  return path.join(privateDir(), "testi", book, "incantesimi.json");
}

// { [spellId]: { description, higherLevels } } of a book, or null without the private folder or the file. Read once
// per process; writePrivateSpellTexts refreshes it.
const spellTextsByBook = new Map();

export function readPrivateSpellTexts(book) {
  if (spellTextsByBook.has(book)) return spellTextsByBook.get(book);
  const file = privateSpellTextsPath(book);
  const texts = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")).spells || {} : null;
  spellTextsByBook.set(book, texts);
  return texts;
}

// Writes the texts of a book's spells, sorted by id, for build-private-packs.mjs.
export function writePrivateSpellTexts(book, spells) {
  const file = privateSpellTextsPath(book);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const sorted = Object.fromEntries(Object.entries(spells).sort(([left], [right]) => left.localeCompare(right)));
  fs.writeFileSync(file, `${JSON.stringify({ book, spells: sorted }, null, 2)}\n`, "utf8");
  spellTextsByBook.set(book, sorted);
  return file;
}
