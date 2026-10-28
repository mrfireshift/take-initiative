// Mends the words an OCR split ("creazio ne", "s uoi", "svolge r e", "TI PI D I G ILDA") in the text pdftotext extracts
// from a private manual (compendio delle regole, fase 2), before generate-private-rules.mjs cuts it into entries.
// First the spaces around an apostrophe and inside an articled preposition go ("dell 'esperienza", "a i"). Then two to
// four fragments next to each other become one word when together they make a known word and at least one of them
// alone is not one. Then a word the OCR misread ("nemnici", "egii") becomes the one known word a confusion of letters
// makes of it, or two words it glued are split ("lepergamene"). The known words come from the Italian word list of
// Tesseract's model
// (tessdata/ita-words.txt in the private folder, written by dawg2wordlist) and the Italian texts the plugin already
// has: the SRD compendium and spells, the private spells and class features (scripts/privateSources.mjs). Every mend
// goes to a log to review.
//
//   node scripts/repair-ocr-text.mjs --book=tasha
//   node scripts/repair-ocr-text.mjs --book=phb2014 --tesseract   (a text Tesseract read: see TESSERACT_CONFUSIONS)
//
// in: <private folder>/sorgenti/regole/<book>-pdf.txt; out: <book>.txt and <book>-riparazioni.txt next to it.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { privateDir, readPrivateFeatureTexts, readPrivateSpellTexts } from "./privateSources.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BOOKS = ["phb2014", "xanathar", "tasha", "ranger-revised"];
const MAX_PARTS = 4;

const lettersOf = (token) => token.replace(/[^\p{L}]/gu, "").toLocaleLowerCase("it");
// How an Italian word can start: a vowel, or a consonant (with "s" before it, or "l", "r", "h" after it) and then a
// vowel, or "gn", "ps", "pn". A piece of a word ("ltre", "ncantesimo") does not.
const ITALIAN_START = /^(?:[aeiouàèéìòù]|s?[bcdfghklmnpqrstvwxyzj][lrh]?[aeiouàèéìòùy]|s[lmnr][aeiouàèéìòù]|gn|ps|pn)/u;
// The Italian words of one letter; any other single letter ("d" of the dice, "m" of the metres) is a fragment.
const ONE_LETTER_WORDS = new Set(["a", "e", "è", "i", "o"]);
// The Italian words of two letters, and the coins ("5 mo"); any other pair ("pe" of "pe rsonaggio") is a fragment, even
// where a text has it. "do", "so" and "od" are left out: an OCR splits "dopo" and "sono" more often than a text has them.
const TWO_LETTER_WORDS = new Set(["ad", "ai", "al", "ce", "ci", "da", "di", "ed", "fa", "fu", "ha", "ho", "il", "in", "io",
  "la", "le", "li", "lo", "ma", "me", "mi", "mo", "mr", "ne", "no", "re", "sa", "se", "si", "sì", "su", "te", "ti", "tu", "tè",
  "un", "va", "ve", "vi", "là", "lì", "né", "dà", "dì"]);
const isKnown = (known, word) => {
  if (word.length === 1) return ONE_LETTER_WORDS.has(word);
  if (word.length === 2) return TWO_LETTER_WORDS.has(word);
  return known.has(word);
};

// Every word of the texts given, lower case.
export function vocabularyOf(texts) {
  const vocabulary = new Set();
  for (const text of texts) for (const word of String(text).toLocaleLowerCase("it").match(/\p{L}+/gu) || []) vocabulary.add(word);
  return vocabulary;
}

// One case for the whole word: all capitals, all lower case, or a capital and then lower case ("T iefling"). Two
// words in different cases ("Medio Evo", "pi Anello") are not one word split.
const ONE_CASE = /^(?:\p{Lu}+|\p{Ll}+|\p{Lu}\p{Ll}+)$/u;

// The articles, prepositions, pronouns and conjunctions: a fragment that is one of them is a word of its own next to
// another ("lo stregone", "in forma", "se sta"), whatever they make together.
const FUNCTION_WORDS = new Set(["a", "ad", "al", "allo", "alla", "ai", "agli", "alle", "che", "ci", "col", "con", "da", "dal",
  "dallo", "dalla", "dai", "dagli", "dalle", "del", "dello", "della", "dei", "degli", "delle", "di", "e", "ed", "fra", "gli",
  "i", "il", "in", "la", "le", "li", "lo", "ma", "mi", "ne", "nel", "nello", "nella", "nei", "negli", "nelle", "non", "o",
  "od", "per", "se", "si", "su", "sul", "sullo", "sulla", "sui", "sugli", "sulle", "ti", "tra", "un", "una", "uno", "vi"]);

// The words a glued word may start with, and end with, when fixLetters splits it.
const GLUED_BEFORE = new Set(["il", "lo", "la", "le", "gli", "un", "una", "uno", "non", "del", "dello", "della", "dei", "degli",
  "delle", "nel", "nello", "nella", "nei", "negli", "nelle", "sul", "sullo", "sulla", "sui", "sugli", "sulle", "dal", "dallo",
  "dalla", "dai", "dagli", "dalle", "alla", "alle", "agli"]);
const GLUED_AFTER = new Set(["da", "con", "del", "della", "delle", "dei", "degli", "nel", "nella", "nelle", "nei", "negli",
  "sul", "sulla", "sulle", "dal", "dalla", "dalle", "alla", "alle"]);

// The fragments from index that make one known word, from the longest run; null when none does. The fragments are
// words already when loose knows each of them, unless together they make a word of five letters or more of sure, the
// plugin's own texts, and none of them is a function word ("REA ME" is "REAME"; "con i" stays, "coni" is short, and
// so does "lo stregone").
function joinAt(tokens, index, known, loose, sure) {
  for (let count = Math.min(MAX_PARTS, tokens.length - index); count >= 2; count -= 1) {
    const parts = tokens.slice(index, index + count);
    if (parts.slice(0, -1).some((part) => !/^\p{L}+$/u.test(part)) || !/^\p{L}+[^\p{L}\p{N}\s]*$/u.test(parts.at(-1))) continue;
    const word = lettersOf(parts.join(""));
    if (!known.has(word)) continue;
    const surely = word.length >= 5 && sure.has(word) && !parts.some((part) => FUNCTION_WORDS.has(lettersOf(part)));
    if (!surely && parts.every((part) => isKnown(loose, lettersOf(part)))) continue;
    if (!ONE_CASE.test(parts.join("").replace(/[^\p{L}]/gu, ""))) continue;
    // An "l" before a word that starts with a vowel is the article that lost its apostrophe ("l aquila").
    if (/^l$/iu.test(parts[0]) && /^[aeiouàèéìòù]/iu.test(parts[1]) && loose.has(lettersOf(parts.slice(1).join("")))) continue;
    return { text: parts.join(""), count };
  }
  return null;
}

// A line with its split words mended: [line, [[from, to]...]]. Only fragments made of letters (a trailing
// punctuation mark on the last one stays, a number does not: "un d20") are joined. A word stays apart when a join that
// starts after it takes fewer fragments or makes a longer word ("di me ttere" is "di mettere", "a pe rseguire" is
// "a perseguire", while "termina re" is "terminare"). known holds the words a join may make, loose (all the words
// of the dictionary, when given) those a fragment may be on its own, sure the words that join even known fragments.
export function mendLine(line, known, loose = known, sure = new Set()) {
  const tokens = line.split(" ");
  const out = [];
  const mends = [];
  for (let index = 0; index < tokens.length; index += 1) {
    let joined = joinAt(tokens, index, known, loose, sure);
    if (joined && isKnown(loose, lettersOf(tokens[index])) && /^\p{L}+$/u.test(tokens[index])) {
      const later = joinAt(tokens, index + 1, known, loose, sure);
      if (later && (later.count < joined.count || later.text.length > joined.text.length)) joined = null;
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

// The lines with a word split at the end of one and the start of the next ("pe" / "rsonaggio") mended, on the first of
// them, by the rules of mendLine: [lines, [[from, to]...]]. A new page ("\f") is not the next line.
export function mendAcrossLines(lines, known, loose = known, sure = new Set()) {
  const out = [...lines];
  const mends = [];
  for (let index = 0; index + 1 < out.length; index += 1) {
    if (out[index + 1].startsWith("\f")) continue;
    const head = out[index].trimEnd().split(" ");
    const tail = out[index + 1].trimStart().split(" ");
    if (!head.at(-1) || !tail[0]) continue;
    const joined = joinAt([head.at(-1), tail[0]], 0, known, loose, sure);
    if (!joined) continue;
    mends.push([`${head.at(-1)} / ${tail[0]}`, joined.text]);
    out[index] = [...head.slice(0, -1), joined.text].join(" ");
    out[index + 1] = tail.slice(1).join(" ");
  }
  return [out, mends];
}

// The words Italian elides before an apostrophe, and the prepositions that join an article ("a" + "i" is "ai").
const ELIDED = "l|dell|dall|nell|sull|all|coll|un|quest|quell|nessun|ciascun|alcun|tutt|sant|bell|po|d|c|s|m|t|v|n";
const SPACED_APOSTROPHE = new RegExp(`(^|[^\\p{L}])(${ELIDED}) ?(['’]) ?(?=\\p{L})`, "giu");
const SPLIT_PREPOSITION = /(^|[^\p{L}])(a|da|de|ne|su|co) (i|gli|ll(?=['’]))(?=[^\p{L}]|$)/giu;

// A line with the spaces an OCR puts around an apostrophe ("dell 'esperienza", "a ll'inizio") and inside an articled
// preposition ("a i giocatori", "de gli") taken out: [line, [[from, to]...]].
export function mendElisions(line) {
  const mends = [];
  const record = (before, from, to) => {
    if (from !== to) mends.push([from, to]);
    return `${before}${to}`;
  };
  const text = line
    .replace(SPACED_APOSTROPHE, (match, before, word, mark) => record(before, match.slice(before.length), `${word}${mark}`))
    .replace(SPLIT_PREPOSITION, (match, before, preposition, article) => record(before, match.slice(before.length), `${preposition}${article}`));
  return [text, mends];
}

// The letters an OCR reads in place of others ("rn" or "mn" for "m", "ii" for "li", "1" for "l"). No other letter is
// dropped or added: the word list misses many Italian forms ("puniscono") and names, which a dropped letter would turn
// into other words ("uniscono"); nor is "m" read as "rn", which makes words of fragments ("EMIA" → "ERNIA").
export const CONFUSIONS = [["rn", "m"], ["mn", "m"], ["ii", "li"], ["ii", "il"], ["i", "l"], ["l", "i"], ["1", "l"],
  ["1", "i"], ["j", "l"], ["j", "i"], ["c", "e"], ["e", "c"], ["0", "o"]];
// Tesseract reads a thin "l" as "t" or "f", and "i" as "t" ("nobite", "vefocità"): only for a text it read
// (--tesseract), since in a PDF's own text layer they turn right words and names into others ("partano" → "parlano").
export const TESSERACT_CONFUSIONS = [...CONFUSIONS, ["t", "l"], ["f", "l"], ["t", "i"]];
// The pronouns Italian glues to a verb ("ottenerle", "colpendone"): a known stem before one makes a word.
const GLUED_PRONOUN = /(?:lo|la|li|le|ne|gli|glie|si|mi|ti|ci|vi)$/u;

function letterCandidates(word, confusions) {
  const out = new Set();
  for (const [from, to] of confusions) {
    for (let index = word.indexOf(from); index >= 0; index = word.indexOf(from, index + 1)) {
      out.add(word.slice(0, index) + to + word.slice(index + from.length));
    }
  }
  out.delete(word);
  return out;
}

function gluedPronoun(word, known) {
  const pronoun = GLUED_PRONOUN.exec(word);
  if (!pronoun) return false;
  const stem = word.slice(0, -pronoun[0].length);
  return [stem, `${stem}e`, `${stem}o`].some((candidate) => known.has(candidate));
}

const withCaseOf = (model, word) => {
  if (model.length > 1 && model === model.toLocaleUpperCase("it")) return word.toLocaleUpperCase("it");
  // A lower-case "l" the OCR read for a capital "I" ("lzumi"): the word is a name.
  if (model[0] !== model[0].toLocaleLowerCase("it") || (model[0] === "l" && word[0] === "i")) {
    return word.charAt(0).toLocaleUpperCase("it") + word.slice(1);
  }
  return word;
};

// A line with the words the OCR misread put right: [line, [[from, to]...]]. A word of four letters or more that the
// vocabulary does not know becomes the one known word a single confusion of letters makes of it; with
// none, or more than one, it stays. The first letter of a capitalised word stays: a name ("Jian", "Egil") is not a
// misread word. A word loose knows stays as it is; the right word must be one targets knows. With no such word, two
// words the OCR glued are split at the only cut that makes an article (or an articled preposition, "un", "non") and a
// known word of four letters or more ("lepergamene" is "le pergamene"), a known word and "da", "con" or an articled
// preposition ("causatoda" is "causato da"), or a function word and a capital ("delFuoco"). Prepositions that are
// prefixes too ("in", "di", "tra", "con") open no cut: "inviolato" and "discreditare" are words.
export function fixLetters(line, loose, targets = loose, confusions = CONFUSIONS) {
  const fixes = [];
  const text = line.replace(/[\p{L}0-9]*\p{L}[\p{L}0-9]*/gu, (token) => {
    const word = token.toLocaleLowerCase("it");
    if (word.length < 4 || loose.has(word) || gluedPronoun(word, loose)) return token;
    const capital = token[0] !== word[0];
    const found = [...letterCandidates(word, confusions)].filter((candidate) => /^\p{L}+$/u.test(candidate) && targets.has(candidate)
      && (!capital || candidate[0] === word[0]));
    if (!found.length && word.length === token.length) {
      const cuts = [];
      // A capital after a lower-case letter is where two words meet ("gliEsploratori", "delFuoco").
      const camel = /^(\p{L}\p{Ll}+)\p{Lu}\p{Ll}/u.exec(token);
      if (camel && FUNCTION_WORDS.has(camel[1].toLocaleLowerCase("it"))) cuts.push(camel[1].length);
      for (let cut = 2; !capital && cut <= word.length - 2; cut += 1) {
        const left = word.slice(0, cut);
        const right = word.slice(cut);
        if ((GLUED_BEFORE.has(left) && right.length >= 4 && targets.has(right))
          || (GLUED_AFTER.has(right) && left.length >= 4 && targets.has(left))) cuts.push(cut);
      }
      if (cuts.length !== 1) return token;
      const split = `${token.slice(0, cuts[0])} ${token.slice(cuts[0])}`;
      fixes.push([token, split]);
      return split;
    }
    if (found.length !== 1) return token;
    const fixed = withCaseOf(token, found[0]);
    fixes.push([token, fixed]);
    return fixed;
  });
  return [text, fixes];
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const book = process.argv.slice(2).find((arg) => arg.startsWith("--book="))?.slice("--book=".length);
  if (!book) throw new Error("Uso: --book=<id del manuale> [--tesseract]");
  const confusions = process.argv.includes("--tesseract") ? TESSERACT_CONFUSIONS : CONFUSIONS;
  const dir = path.join(privateDir(), "sorgenti", "regole");
  const raw = fs.readFileSync(path.join(dir, `${book}-pdf.txt`), "utf8");
  const srd = JSON.parse(fs.readFileSync(path.join(ROOT, "src", "rules-reference-it.json"), "utf8"));
  const spells = JSON.parse(fs.readFileSync(path.join(ROOT, "src", "spell-reference-it.json"), "utf8"));
  // sure: the words of the SRD texts; known: the words a mend may make; loose: also those a fragment or a word may be
  // on its own.
  const sure = vocabularyOf([
    ...srd.entries.map((entry) => entry.text),
    ...Object.values(spells.spells).map((spell) => spell.description),
  ]);
  const known = new Set(sure);
  const loose = new Set(sure);
  // The private spells and class features come from the same PDFs, with the same splits ("pe rsonaggio"): only their
  // words of three letters or more that start as an Italian word can count, and those of five or more join even known
  // fragments ("incoraggia re"). The rules of the books are left out.
  const privateTexts = BOOKS.flatMap((id) => [
    ...Object.values(readPrivateSpellTexts(id) || {}).map((spell) => spell.description),
    ...Object.values(readPrivateFeatureTexts(id) || {}),
  ]);
  for (const word of vocabularyOf(privateTexts)) {
    if (word.length < 3 || !ITALIAN_START.test(word)) continue;
    known.add(word);
    loose.add(word);
    if (word.length >= 5) sure.add(word);
  }
  // The Italian word list of Tesseract's model, when the private folder has it (tessdata/ita-words.txt). It holds
  // English and German words, pieces of words and words glued together too ("und", "accadem", "ltre", "dellamoda"):
  // only its words of three letters or more that start as an Italian word can and end in a vowel count, and a mend
  // makes only those of five or more.
  const dictionary = path.join(privateDir(), "tessdata", "ita-words.txt");
  if (fs.existsSync(dictionary)) {
    for (const word of vocabularyOf([fs.readFileSync(dictionary, "utf8")])) {
      if (word.length < 3 || !/[aeiouàèéìòù]$/u.test(word) || !ITALIAN_START.test(word)) continue;
      loose.add(word);
      if (word.length >= 5) known.add(word);
    }
  }
  // A misread word becomes a word of the texts or of the dictionary, never one of the book's own: they hold its errors.
  const targets = new Set(known);
  // The book's own words, those it writes whole at least three times ("accademia", "patrono"…): a mend may make them
  // and a misread word stays one, but they do not make a fragment a word, since an OCR repeats its splits ("accadem").
  const kept = new Set(loose);
  const own = new Map();
  for (const word of raw.toLocaleLowerCase("it").match(/\p{L}{3,}/gu) || []) own.set(word, (own.get(word) || 0) + 1);
  for (const [word, times] of own) {
    if (times < 3) continue;
    known.add(word);
    kept.add(word);
  }
  const log = new Map();
  const note = (mends) => {
    for (const [from, to] of mends) log.set(`${from} → ${to}`, (log.get(`${from} → ${to}`) || 0) + 1);
  };
  const joinedLines = raw.split(/\r?\n/u).map((line) => {
    const [elided, elisions] = mendElisions(line);
    const [joined, joins] = mendLine(elided, known, loose, sure);
    note([...elisions, ...joins]);
    return joined;
  });
  const [acrossLines, across] = mendAcrossLines(joinedLines, known, loose, sure);
  note(across);
  const mended = acrossLines.map((line) => {
    const [text, fixes] = fixLetters(line, kept, targets, confusions);
    note(fixes);
    return text;
  }).join("\n");
  fs.writeFileSync(path.join(dir, `${book}.txt`), mended, "utf8");
  const entries = [...log].sort((left, right) => right[1] - left[1]);
  fs.writeFileSync(path.join(dir, `${book}-riparazioni.txt`), entries.map(([mend, times]) => `${times}\t${mend}`).join("\n") + "\n", "utf8");
  console.log(`${known.size} parole note; ${entries.reduce((sum, [, times]) => sum + times, 0)} riparazioni (${entries.length} diverse).`);
}
