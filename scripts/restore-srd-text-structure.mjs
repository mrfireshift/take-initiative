// Gives back paragraphs, bulleted lists and tables to the Italian rules texts that reached the repo flattened into one
// block: the SRD spells of src/spell-reference-it.json and the class features of the PHB 2014 database (whose SRD
// part is the same text). The structure comes from the SRD 5.1 Italian PDF, read through Xpdf's pdftotext in its
// default mode, which writes every paragraph of the PDF on a line of its own:
//
//   pdftotext -enc UTF-8 SRD_CC_v5.1_IT.pdf srd-it.txt
//   node scripts/restore-srd-text-structure.mjs --pdf-text=srd-it.txt
//   npm run generate:class-features
//
// The subclasses of Xanathar's and Tasha's guides come back the same way from the text of those books (the user's own
// PDFs, never in the repo): --xanathar-text=xanathar.txt --tasha-text=tasha.txt, each optional.
//
// Only whitespace and list markers change: every text keeps the same words in the same order (checked before
// writing). The spells also get back the spaces the extraction lost inside a few words ("untiro" → "un tiro"),
// with the same letters (checked), and the words it misread (TEXT_CORRECTIONS, the cantrip dice), each checked against
// the PDF. Running it again on restored texts changes nothing.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SPELL_REFERENCE_PATH = path.join(ROOT, "src", "spell-reference-it.json");
// The copy of a few spells the rules modules read (test/spellReferenceRuntime.test.js keeps it equal).
const SPELL_REFERENCE_RUNTIME_PATH = path.join(ROOT, "src", "spell-reference-it-runtime.json");
const CLASS_DATABASE_PATH = path.join(ROOT, "data", "class-features", "phb2014_classi_database_finale.json");
// The subclasses of Xanathar and Tasha, restored from the text of their PDF (--xanathar-text=, --tasha-text=).
const BOOK_DATABASES = Object.freeze([
  { argument: "xanathar-text", title: "Xanathar", path: path.join(ROOT, "data", "class-features", "xanathar_sottoclassi_database_finale.json") },
  { argument: "tasha-text", title: "Tasha", path: path.join(ROOT, "data", "class-features", "tasha_sottoclassi_database_finale.json") },
]);

// Where a text is in the PDF: a run of this many words.
const KEY_WORDS = 6;
// A PDF paragraph is recognised by its first letters, spaces left out (the flattened texts keep a few joined words,
// such as "Unbersaglio"); shorter lines (headings, table cells) are too common to trust.
const KEY_LETTERS = 32;
const MIN_KEY_LETTERS = 18;

const PARAGRAPH_BREAK = "\n\n";
const BULLET_BREAK = "\n• ";

// The tables the extraction ran into the text, by the id of the spell or feature: the flattened run (from), the
// caption before the table, and its rows, header first, with the same words in the same order.
const TABLES = Object.freeze([
  {
    id: "confusion",
    from: "d10 Comportamento 1 La creatura utilizza tutti i suoi movimenti per spostarsi in una direzione casuale. Per determinare la direzione, l'incantatore tira un d8 assegnando una direzione a ogni faccia del dado. La creatura non effettua un'azione in questo turno. 2-6 La creatura non si muove né effettua un'azione in questo turno. 7-8 La creatura utilizza la sua azione per effettuare un attacco in mischia contro un'altra creatura nella sua portata determinata casualmente. Se non è presente alcuna creatura entro gittata, non fa nulla in questo turno. 9-10 La creatura può agire e muoversi normalmente.",
    rows: [
      ["d10", "Comportamento"],
      ["1", "La creatura utilizza tutti i suoi movimenti per spostarsi in una direzione casuale. Per determinare la direzione, l'incantatore tira un d8 assegnando una direzione a ogni faccia del dado. La creatura non effettua un'azione in questo turno."],
      ["2-6", "La creatura non si muove né effettua un'azione in questo turno."],
      ["7-8", "La creatura utilizza la sua azione per effettuare un attacco in mischia contro un'altra creatura nella sua portata determinata casualmente. Se non è presente alcuna creatura entro gittata, non fa nulla in questo turno."],
      ["9-10", "La creatura può agire e muoversi normalmente."],
    ],
  },
  {
    id: "animate-objects",
    from: "Statistiche degli oggetti animati\nTaglia | PF | CA | Attacco | For | Des\nMinuscola | 20 | 18 | +8 al tiro per colpire, 1d4 + 4 danni | 4 | 18\nPiccola | 25 | 16 | +6 al tiro per colpire, 1d8 + 2 danni | 6 | 14\nMedia | 40 | 13 | +5 al tiro per colpire, 2d6 + 1 danni | 10 | 12\nGrande | 50 | 10 | +6 al tiro per colpire, 2d10 + 2 danni | 14 | 10\nEnorme | 80 | 10 | +8 al tiro per colpire, 2d12 + 4 danni | 18 | 6",
    caption: "Statistiche degli oggetti animati",
    rows: [
      ["Taglia", "PF", "CA", "Attacco", "For", "Des"],
      ["Minuscola", "20", "18", "+8 al tiro per colpire, 1d4 + 4 danni", "4", "18"],
      ["Piccola", "25", "16", "+6 al tiro per colpire, 1d8 + 2 danni", "6", "14"],
      ["Media", "40", "13", "+5 al tiro per colpire, 2d6 + 1 danni", "10", "12"],
      ["Grande", "50", "10", "+6 al tiro per colpire, 2d10 + 2 danni", "14", "10"],
      ["Enorme", "80", "10", "+8 al tiro per colpire, 2d12 + 4 danni", "18", "6"],
    ],
  },
  {
    id: "reincarnate",
    from: "d100 Razza 01-04. Dragonide 05-13 Elfoalto 14-21 Elfo deiboschi 22-25 Elfo oscuro 26-29 Gnomo delle foreste 30-35 Gnomo delle rocce 36-43. Halfling piedelesto 44-51 Halflingtozzo 52-55 Mezzelfo 56-59 Mezzorco 60-68 Nano delle colline 69-76 Nano delle montagne 77-80 Tiefling 81-100. Umano",
    rows: [
      ["d100", "Razza"],
      ["01-04", "Dragonide"],
      ["05-13", "Elfoalto"],
      ["14-21", "Elfo deiboschi"],
      ["22-25", "Elfo oscuro"],
      ["26-29", "Gnomo delle foreste"],
      ["30-35", "Gnomo delle rocce"],
      ["36-43", "Halfling piedelesto"],
      ["44-51", "Halflingtozzo"],
      ["52-55", "Mezzelfo"],
      ["56-59", "Mezzorco"],
      ["60-68", "Nano delle colline"],
      ["69-76", "Nano delle montagne"],
      ["77-80", "Tiefling"],
      ["81-100", "Umano"],
    ],
  },
  {
    id: "druido-forma-selvatica",
    from: "Forme Bestiali Livello GS Max Limitazioni Esempio 2° 1/4 Nessuna velocità di nuotare o di volare Lupo 4° 1/2 Nessuna velocità di volare Coccodrillo 8° 1 - Aquila gigante",
    caption: "Forme Bestiali",
    rows: [
      ["Livello", "GS Max", "Limitazioni", "Esempio"],
      ["2°", "1/4", "Nessuna velocità di nuotare o di volare", "Lupo"],
      ["4°", "1/2", "Nessuna velocità di volare", "Coccodrillo"],
      ["8°", "1", "-", "Aquila gigante"],
    ],
  },
  {
    id: "chierico-distruggere-non-morti",
    from: "Livello da Chierico Distruggi Non Morti di GS 5° 1/2 o inferiore 8° 1 o inferiore 11° 2 o inferiore 14° 3 o inferiore 17° 4 o inferiore",
    rows: [
      ["Livello da Chierico", "Distruggi Non Morti di GS"],
      ["5°", "1/2 o inferiore"],
      ["8°", "1 o inferiore"],
      ["11°", "2 o inferiore"],
      ["14°", "3 o inferiore"],
      ["17°", "4 o inferiore"],
    ],
  },
  {
    id: "control-weather",
    from: "Precipitazioni Grado Condizione 1 Sereno 2° Poconuvoloso 3. Nuvoloso o nebbia 4 Pioggia, grandine o neve 5 Pioggia torrenziale, grandinata violenta o tormenta Temperatura Grado Condizione 1 Caldoinsopportabile 2° Caldo 3 Temperato 4 Fresco 5. Freddo 6 Freddo artico Vento Grado Condizione 1 Calmo 2 Vento moderato 3. Ventoforte 4 Burrasca 5 Tempesta",
    tables: [
      {
        caption: "Precipitazioni",
        rows: [
          ["Grado", "Condizione"],
          ["1", "Sereno"],
          ["2", "Poconuvoloso"],
          ["3", "Nuvoloso o nebbia"],
          ["4", "Pioggia, grandine o neve"],
          ["5", "Pioggia torrenziale, grandinata violenta o tormenta"],
        ],
      },
      {
        caption: "Temperatura",
        rows: [
          ["Grado", "Condizione"],
          ["1", "Caldoinsopportabile"],
          ["2", "Caldo"],
          ["3", "Temperato"],
          ["4", "Fresco"],
          ["5", "Freddo"],
          ["6", "Freddo artico"],
        ],
      },
      {
        caption: "Vento",
        rows: [
          ["Grado", "Condizione"],
          ["1", "Calmo"],
          ["2", "Vento moderato"],
          ["3", "Ventoforte"],
          ["4", "Burrasca"],
          ["5", "Tempesta"],
        ],
      },
    ],
  },
  {
    id: "creation",
    from: "Materiale Durata Materia vegetale 1 giorno Pietra o cristallo 12 ore Metalli preziosi 1ora Gemme 10 minuti Adamantio o mithral 1 minuto",
    rows: [
      ["Materiale", "Durata"],
      ["Materia vegetale", "1 giorno"],
      ["Pietra o cristallo", "12 ore"],
      ["Metalli preziosi", "1ora"],
      ["Gemme", "10 minuti"],
      ["Adamantio o mithral", "1 minuto"],
    ],
  },
]);

// The cantrips whose damage at the 5th, 11th and 17th level the extraction misread ("(2410)" for "(2d10)"): the die.
const CANTRIP_SCALING_DIE = Object.freeze({
  "acid-splash": "d6",
  "chill-touch": "d8",
  "fire-bolt": "d10",
  "poison-spray": "d12",
  "produce-flame": "d8",
  "ray-of-frost": "d8",
  "sacred-flame": "d8",
  "shocking-grasp": "d8",
  "vicious-mockery": "d4",
});
const CANTRIP_SCALING = /raggiunge il 5° livello \([^)]*\), [^(]{0,8}11° ?livello \([^)]*\) e il 17° ?livello \([^)]*\)/u;

// The words the extraction misread, by spell, as the SRD PDF writes them: [field, from, to]. Each "to" is checked
// against the PDF before writing.
const TEXT_CORRECTIONS = Object.freeze({
  "antipathy-sympathy": [["description", "il bersaglio ossi trova", "il bersaglio o si trova"]],
  "astral-projection": [["description", "un'incamazione separata", "un'incarnazione separata"]],
  "calm-emotions": [["description", "soppresso tomaa influenzare", "soppresso torna a influenzare"]],
  "charm-person": [["description", "contro di lu. Se lo", "contro di lui. Se lo"]],
  command: [["description", "Supplica. 1l bersaglio", "Supplica. Il bersaglio"]],
  "control-water": [["description", "e fino 215 metri alla sommità", "e fino a 15 metri alla sommità"]],
  "control-weather": [
    ["description", "2 | Poconuvoloso", "2 | Poco nuvoloso"],
    ["description", "1 | Caldoinsopportabile", "1 | Caldo insopportabile"],
    ["description", "3 | Ventoforte", "3 | Vento forte"],
  ],
  creation: [["description", "Metalli preziosi | 1ora", "Metalli preziosi | 1 ora"]],
  "create-or-destroy-water": [
    ["description", "crea fino a 4Slitri d'acqua", "crea fino a 45 litri d'acqua"],
    ["description", "distrugge fino a4Slitri d'acqua", "distrugge fino a 45 litri d'acqua"],
  ],
  dream: [["description", "1l messaggero può uscire", "Il messaggero può uscire"]],
  "flesh-to-stone": [["description", "corpo è di came.", "corpo è di carne."]],
  "fog-cloud": [["description", "si estende intono agli angoli", "si estende intorno agli angoli"]],
  forcecage: [["description", "non può uscime e spreca", "non può uscirne e spreca"]],
  "freezing-sphere": [["description", "o scagliarta con una fionda", "o scagliarla con una fionda"]],
  "guardian-of-faith": [["description", "1l guardiano svanisce", "Il guardiano svanisce"]],
  "ice-storm": [["higherLevels", "superiore ald@°.", "superiore al 4°."]],
  "locate-creature": [["description", "una creatura allui familiare", "una creatura a lui familiare"]],
  "magic-circle": [["description", "contro ii bersagli all'interno del cilindro. «1 bersagli", "contro i bersagli all'interno del cilindro. I bersagli"]],
  "meteor-swarm": [["description", "si estende intomo agli angoli", "si estende intorno agli angoli"]],
  "mind-blank": [["description", "o leggeme i pensieri", "o leggerne i pensieri"]],
  "planar-binding": [["higherLevels", "di unlivello superiore", "di un livello superiore"]],
  prestidigitation: [["description", "della tia mano", "della tua mano"]],
  "prismatic-spray": [["description", "5. Blu. ll bersaglio", "5. Blu. Il bersaglio"]],
  reincarnate: [
    ["description", "05-13 | Elfoalto", "05-13 | Elfo alto"],
    ["description", "44-51 | Halflingtozzo", "44-51 | Halfling tozzo"],
  ],
  "silent-image": [["description", "può alterame l'aspetto", "può alterarne l'aspetto"]],
  symbol: [["description", "Carisma. Sell fallisce", "Carisma. Se lo fallisce"]],
  "time-stop": [["description", "1d4 + 1 tumi consecutivamente", "1d4 + 1 turni consecutivamente"]],
  "tiny-hut": [["description", "all'estemo.", "all'esterno."]],
});

// "I" and "Il" read as "1" and "11" at the start of a sentence ("1 danni di questo incantesimo"), with the next two
// words: what the PDF must have.
const SENTENCE_ARTICLE = /(^|[.!?:]\s+|\n)(11|1) ([a-zàèéìòù]+(?: [^\s.,;:]+){0,2})/gu;

// The corrections of one spell: [field, from, to, check], the cantrip scaling and the misread articles included.
// check is the part of "to" the PDF must have (to itself when missing).
export function spellTextCorrections(id, spell) {
  const corrections = [...(TEXT_CORRECTIONS[id] || [])];
  const die = CANTRIP_SCALING_DIE[id];
  const scaling = die ? String(spell?.description || "").match(CANTRIP_SCALING)?.[0] : null;
  if (scaling) {
    corrections.push(["description", scaling, `raggiunge il 5° livello (2${die}), l'11° livello (3${die}) e il 17° livello (4${die})`]);
  }
  for (const field of ["description", "higherLevels"]) {
    for (const [from, lead, number, rest] of String(spell?.[field] || "").matchAll(SENTENCE_ARTICLE)) {
      const article = number === "11" ? "Il" : "I";
      corrections.push([field, from, `${lead}${article} ${rest}`, `${article} ${rest}`]);
    }
  }
  return corrections;
}

// A spell with its misread words corrected. A correction already made is skipped; one that finds neither its old
// nor its new text stops the script, as the data changed under it.
export function correctSpellText(id, spell) {
  const corrected = { ...spell };
  for (const [field, from, to] of spellTextCorrections(id, spell)) {
    const text = String(corrected[field] || "");
    // Done already, maybe with a paragraph or an item between its words since.
    const squashed = (value) => value.replace(/[•\s]+/gu, " ");
    if (text.split(from).length === 2) corrected[field] = text.replace(from, to);
    else if (!squashed(text).includes(squashed(to))) throw new Error(`${id}: «${from}» non trovato in ${field}.`);
  }
  return corrected;
}

// The class features of Tasha's guide that the database rewrote: the paragraphs and lists of the book, and the
// errors against it ("per turno" left out, "diloro", "affinché" after a full stop), by id: [from, to]. The rest of
// the wording stays, and so does the rule of Santuario del Crepuscolo, which the Italian book mistranslates.
const FEATURE_CORRECTIONS = Object.freeze({
  "chierico-dominio-della-pace-legame-incoraggiante": [
    ["tra diloro per 10 minuti", "tra di loro per 10 minuti"],
    ["non più di una volta Il personaggio può", "non più di una volta per turno.\n\nIl personaggio può"],
  ],
  "chierico-dominio-del-crepuscolo-occhi-della-notte": [
    ["luce fioca. Con un'azione, il chierico può condividere", "luce fioca.\n\nCon un'azione, il chierico può condividere"],
  ],
  "chierico-dominio-del-crepuscolo-incanalare-divinita-santuario-del-crepuscolo": [
    ["luce crepuscolare. Con un'azione, brandisce", "luce crepuscolare.\n\nCon un'azione, brandisce"],
    ["uno dei benefici seguenti: la creatura ottiene", "uno dei benefici seguenti:\n• la creatura ottiene"],
    ["più il livello da chierico; oppure il chierico pone", "più il livello da chierico;\n• oppure il chierico pone"],
  ],
  "stregone-mente-aberrante-conversazione-telepatica": [
    ["1,5 km. affinché si capiscano", "1,5 km. Affinché si capiscano"],
    ["comprensibile a entrambi. La connessione dura", "comprensibile a entrambi.\n\nLa connessione dura"],
  ],
});

// A feature with its corrections; one already made is skipped, one that finds neither its old nor its new text
// stops the script.
export function correctFeatureText(id, text) {
  let corrected = String(text || "");
  const squashed = (value) => value.replace(/[•\s]+/gu, " ");
  for (const [from, to] of FEATURE_CORRECTIONS[id] || []) {
    if (corrected.split(from).length === 2) corrected = corrected.replace(from, to);
    else if (!squashed(corrected).includes(squashed(to))) throw new Error(`${id}: «${from}» non trovato.`);
  }
  return corrected;
}

// The PDF text as one line, for checking the corrections: spaces collapsed, typographic apostrophes plain.
function flatPdfText(pdfText) {
  return String(pdfText || "").replace(/’/gu, "'").replace(/[•\s]+/gu, " ");
}

// The text with its tables, if any, each as its caption and rows of cells split by " | ", between blank lines. An
// entry has one table (caption, rows) or several (tables: [{ caption, rows }]).
export function restoreRulesTextTable(text, id) {
  const source = String(text || "");
  const table = TABLES.find((entry) => entry.id === id);
  const at = table ? source.indexOf(table.from) : -1;
  if (at < 0) return source;
  const before = source.slice(0, at).replace(/\s+$/u, "");
  const after = source.slice(at + table.from.length).replace(/^\s+/u, "");
  const output = [
    before,
    ...(table.tables || [table]).flatMap((part) => [
      part.caption || "",
      part.rows.map((row) => row.join(" | ")).join("\n"),
    ]),
    after,
  ].filter(Boolean).join(PARAGRAPH_BREAK);
  if (rulesTextWords(output) !== rulesTextWords(source)) {
    throw new Error(`La tabella di ${id} non ha le stesse parole del testo.`);
  }
  return output;
}

function normalizeWord(word) {
  return word.toLocaleLowerCase("it").normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// The words of a text with their position: { word, start, end }.
function textWords(text) {
  return Array.from(String(text || "").matchAll(/[\p{L}\p{N}]+/gu), (match) => ({
    word: normalizeWord(match[0]),
    start: match.index,
    end: match.index + match[0].length,
  }));
}

// The words alone, in order: what a restoration must never change.
export function rulesTextWords(text) {
  return textWords(text).map((entry) => entry.word).join(" ");
}

// The PDF as lines: { lines: [{ opens, words, bullets }], grams }, where words are the normalized words of the
// paragraph part of a line (before its first "•"), bullets the words of each bullet item, and grams maps every run of
// KEY_WORDS words of a line to that line (-1 when the run appears on more than one). Page footers are left out.
export function srdStructureIndex(pdfText) {
  const lines = [];
  const grams = new Map();
  const vocabulary = new Set();
  for (const rawLine of String(pdfText || "").split(/\r?\n|\f/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("Rivendita vietata")) continue;
    const [paragraph, ...bullets] = line.split("•");
    const entry = {
      // A line that starts in lower case continues the paragraph of the previous column or page.
      opens: /^[\p{Lu}\p{N}]/u.test(paragraph.trim()),
      words: textWords(paragraph).map((word) => word.word),
      bullets: bullets.map((part) => textWords(part).map((word) => word.word)),
    };
    const allWords = [...entry.words, ...entry.bullets.flat()];
    for (let at = 0; at + KEY_WORDS <= allWords.length; at += 1) {
      const gram = allWords.slice(at, at + KEY_WORDS).join(" ");
      grams.set(gram, grams.has(gram) && grams.get(gram) !== lines.length ? -1 : lines.length);
    }
    lines.push(entry);
    for (const word of allWords) vocabulary.add(word);
  }
  return { lines, grams, vocabulary };
}

// Where the text is in the PDF: the runs of its words found only once there ({ at, line }), from its first 200 words.
// A few words can differ, where the flattened text fixed or kept a typo.
function pdfHits(index, words) {
  const hits = [];
  for (let at = 0; at + KEY_WORDS <= Math.min(words.length, 200); at += 1) {
    const line = index.grams.get(words.slice(at, at + KEY_WORDS).map((entry) => entry.word).join(" "));
    if (line >= 0) hits.push({ at, line });
  }
  return hits;
}

// Where the text starts in the PDF, two guesses: its first run found, and the group of lines with the most runs of
// the text (a phrase such as "quando un monaco sceglie questa tradizione" can be found once in a book and still
// belong to another feature); in that group, the first line with at least two runs (a stray line before the text
// has one) and its run that comes first in the text. [{ start, found }]: start is a couple of lines earlier when the
// run is not the text's first.
function pdfAnchors(index, words) {
  const hits = pdfHits(index, words);
  if (!hits.length) return [];
  const group = (hit) => hits.filter((other) => other.line >= hit.line && other.line <= hit.line + 40);
  const widest = hits.reduce((winner, hit) => (group(hit).length > group(winner).length ? hit : winner));
  const members = group(widest);
  const runsOn = (line) => members.filter((hit) => hit.line === line).length;
  const dense = members.map((hit) => hit.line).filter((line) => runsOn(line) >= 2);
  const anchorLine = dense.length ? Math.min(...dense) : widest.line;
  const grouped = members.filter((hit) => hit.line === anchorLine).reduce((first, hit) => (hit.at < first.at ? hit : first));
  return [hits[0], grouped].map((hit) => ({ start: Math.max(0, hit.line - (hit.at ? 2 : 0)), found: hit.line }));
}

// The PDF lines around one text, in order: from each place where it may start, for about twice its length (a page or
// a column break can put other text in between). null when the PDF does not have it.
function pdfWindowLines(index, words) {
  const anchors = pdfAnchors(index, words);
  if (!anchors.length) return null;
  const positions = new Set();
  for (const anchor of anchors) {
    let seen = 0;
    for (let at = anchor.start; at < index.lines.length && seen < words.length * 2 + 50; at += 1) {
      positions.add(at);
      const line = index.lines[at];
      // The lines before the one found may belong to the previous text: they do not use up the window.
      if (at >= anchor.found) seen += line.words.length + line.bullets.reduce((total, bullet) => total + bullet.length, 0);
    }
  }
  return [...positions].sort((left, right) => left - right).map((at) => index.lines[at]);
}

// The words of those lines in order, bullet items included.
function pdfWindowWords(index, words) {
  return pdfWindowLines(index, words)?.flatMap((line) => [...line.words, ...line.bullets.flat()]) || null;
}

// The paragraph and bullet keys of the PDF lines around one text.
function localKeys(index, words) {
  const lines = pdfWindowLines(index, words);
  if (!lines) return null;
  const keys = { paragraphs: new Map(), bullets: new Map() };
  const add = (map, lineWords) => {
    const letters = keyLetters(lineWords.join(""));
    if (letters.length < MIN_KEY_LETTERS) return;
    const length = Math.min(letters.length, KEY_LETTERS);
    if (!map.has(length)) map.set(length, new Set());
    map.get(length).add(letters.slice(0, length));
  };
  for (const line of lines) {
    if (line.opens) add(keys.paragraphs, line.words);
    for (const bullet of line.bullets) add(keys.bullets, bullet);
  }
  return keys;
}

// The PDF words that a joined word is made of: two or three words of the PDF, in a row, with the same letters, next to
// the word's own previous or next word. null when there are none.
function joinedWordParts(pdfWords, word, previous, next) {
  for (let size = 2; size <= 3; size += 1) {
    for (let at = 0; at + size <= pdfWords.length; at += 1) {
      const parts = pdfWords.slice(at, at + size);
      if (parts.join("") !== word) continue;
      if ((previous && pdfWords[at - 1] === previous) || (next && pdfWords[at + size] === next)) return parts;
    }
  }
  return null;
}

function lettersOnly(text) {
  return String(text || "").replace(/\s+/gu, "");
}

// The words the extraction joined ("untiro", "Ilglifo"), split where the PDF has a space. Only a word the PDF never
// uses is split, and only spaces are added (checked): a word with other letters stays as it is.
export function restoreWordSpacing(text, index) {
  const source = String(text || "");
  const words = textWords(source);
  const pdfWords = words.length ? pdfWindowWords(index, words) : null;
  if (!pdfWords) return source;
  let output = "";
  let copied = 0;
  words.forEach((entry, at) => {
    if (index.vocabulary.has(entry.word)) return;
    const parts = joinedWordParts(pdfWords, entry.word, words[at - 1]?.word, words[at + 1]?.word);
    if (!parts) return;
    let offset = entry.start;
    const pieces = parts.map((part) => {
      const piece = source.slice(offset, offset + part.length);
      offset += part.length;
      return piece;
    });
    output += source.slice(copied, entry.start) + pieces.join(" ");
    copied = entry.end;
  });
  output += source.slice(copied);
  if (lettersOnly(output) !== lettersOnly(source)) {
    throw new Error(`La separazione delle parole ha cambiato le lettere di: ${source.slice(0, 60)}…`);
  }
  return output;
}

// The words of a text the PDF never uses, with the PDF word or words between the same neighbours when there are:
// [{ word, pdf, before, after }], pdf "" when the neighbours are not found. For a review by hand.
export function unmatchedRulesWords(text, index) {
  const source = String(text || "");
  const words = textWords(source);
  const pdfWords = words.length ? pdfWindowWords(index, words) : null;
  if (!pdfWords) return [];
  return words.flatMap((entry, at) => {
    if (index.vocabulary.has(entry.word)) return [];
    const previous = words[at - 1]?.word;
    const next = words[at + 1]?.word;
    let pdf = "";
    for (let size = 1; size <= 3 && !pdf; size += 1) {
      for (let start = 1; start + size < pdfWords.length; start += 1) {
        if (pdfWords[start - 1] === previous && pdfWords[start + size] === next) {
          pdf = pdfWords.slice(start, start + size).join(" ");
          break;
        }
      }
    }
    return [{
      word: source.slice(entry.start, entry.end),
      pdf,
      before: source.slice(Math.max(0, entry.start - 30), entry.start),
      after: source.slice(entry.end, entry.end + 30),
    }];
  });
}

// Letters compared without telling l from i, which the extraction confuses ("ll bersaglio").
function keyLetters(text) {
  return text.replace(/l/g, "i");
}

// Whether a PDF line starts at the at-th word of the text. letters: the text's words joined, with the offset of each.
function startsKey(map, letters, at) {
  for (const [length, keys] of map) {
    if (keys.has(letters.text.slice(letters.offsets[at], letters.offsets[at] + length))) return true;
  }
  return false;
}

// The text with the paragraph breaks and bullet items of the PDF. A "*" between two words is an item the flattened
// text kept; another item, or a paragraph, only starts after a sentence ends, or after a list.
export function restoreRulesTextStructure(text, index) {
  const source = String(text || "");
  const words = textWords(source);
  const keys = words.length ? localKeys(index, words) : null;
  if (!keys) return source;
  const letters = { text: "", offsets: [] };
  for (const entry of words) {
    letters.offsets.push(letters.text.length);
    letters.text += keyLetters(entry.word);
  }
  let output = source.slice(0, words[0].start);
  let inList = false;
  for (let at = 1; at <= words.length; at += 1) {
    output += source.slice(words[at - 1].start, words[at - 1].end);
    if (at === words.length) break;
    const separator = source.slice(words[at - 1].end, words[at].start);
    const head = separator.replace(/\s+$/u, "");
    // A stray quote of the extraction can follow the full stop (".' Una volta").
    const sentenceEnd = /[.:;!?»"”)]['’]?$/u.test(head);
    const capital = /^[\p{Lu}\p{N}]/u.test(source[words[at].start]);
    if (separator.includes("\n")) {
      output += separator;
    } else if (/•$/u.test(head)
      || (/\*$/u.test(head) && (inList || /[.:;]\s*\*$/u.test(head) || capital))
      // A "+" is a bullet the extraction misread only between two sentences ("cubo. + Ogni oggetto").
      || (/[.:;]\s*\+$/u.test(head) && capital)) {
      output += head.replace(/\s*[*•+]$/u, "") + BULLET_BREAK;
      inList = true;
    } else if (sentenceEnd && startsKey(keys.bullets, letters, at)) {
      output += head + BULLET_BREAK;
      inList = true;
    } else if (/^[\p{Lu}\p{N}]/u.test(source[words[at].start])
      && (sentenceEnd || (inList && !head.endsWith(",")))
      && startsKey(keys.paragraphs, letters, at)) {
      output += head + PARAGRAPH_BREAK;
      inList = false;
    } else {
      output += separator;
    }
  }
  output += source.slice(words[words.length - 1].end);
  if (rulesTextWords(output) !== rulesTextWords(source)) {
    throw new Error(`Il ripristino ha cambiato le parole di: ${source.slice(0, 60)}…`);
  }
  return output;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function restoreSpellReference(reference, index, pdfText) {
  const flatPdf = flatPdfText(pdfText);
  let changed = 0;
  for (const spell of Object.values(reference.spells || {})) {
    // The tables first, as their runs keep the words of the extraction; then the misread words, so that paragraphs
    // and spaces are found on the corrected text.
    const tabled = { ...spell, description: restoreRulesTextTable(spell.description, spell.id) };
    for (const [, , to, check = to] of spellTextCorrections(spell.id, tabled)) {
      // A table row is checked by its last cell, the PDF writing a table column by column.
      if (!flatPdf.includes(check.split(" | ").at(-1))) throw new Error(`${spell.id}: «${check}» non è nel PDF.`);
    }
    const corrected = correctSpellText(spell.id, tabled);
    const description = restoreWordSpacing(restoreRulesTextStructure(corrected.description, index), index);
    const higherLevels = restoreWordSpacing(corrected.higherLevels, index);
    if (description !== spell.description || higherLevels !== spell.higherLevels) changed += 1;
    spell.description = description;
    spell.higherLevels = higherLevels;
  }
  return changed;
}

function restoreClassDatabase(database, index) {
  let changed = 0;
  for (const collection of ["privilegi", "opzioni"]) {
    for (const record of database[collection] || []) {
      if (typeof record.descrizione !== "string") continue;
      const description = restoreRulesTextStructure(
        restoreRulesTextTable(correctFeatureText(record.id, record.descrizione), record.id),
        index,
      );
      if (description !== record.descrizione) changed += 1;
      record.descrizione = description;
    }
  }
  return changed;
}

// The JSON written as the file was: two spaces, and a final line break only where there was one.
function writeJson(filePath, value) {
  const finalBreak = fs.readFileSync(filePath, "utf8").endsWith("\n") ? "\n" : "";
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}${finalBreak}`, "utf8");
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const argument = (name) => process.argv.slice(2).find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) || "";
  const pdfTextPath = argument("pdf-text");
  if (!pdfTextPath && !BOOK_DATABASES.some((book) => argument(book.argument))) {
    throw new Error("Percorso --pdf-text=<testo di pdftotext dell'SRD> o di un manuale mancante.");
  }

  if (pdfTextPath) {
    const pdfText = fs.readFileSync(pdfTextPath, "utf8");
    const index = srdStructureIndex(pdfText);

    const reference = readJson(SPELL_REFERENCE_PATH);
    const spells = restoreSpellReference(reference, index, pdfText);
    writeJson(SPELL_REFERENCE_PATH, reference);
    const runtime = readJson(SPELL_REFERENCE_RUNTIME_PATH);
    for (const id of Object.keys(runtime.spells || {})) runtime.spells[id] = reference.spells[id];
    writeJson(SPELL_REFERENCE_RUNTIME_PATH, runtime);

    const database = readJson(CLASS_DATABASE_PATH);
    const features = restoreClassDatabase(database, index);
    writeJson(CLASS_DATABASE_PATH, database);
    console.log(`SRD: struttura ripristinata in ${spells} incantesimi e ${features} capacità di classe.`);
  }

  for (const book of BOOK_DATABASES) {
    const bookTextPath = argument(book.argument);
    if (!bookTextPath) continue;
    const database = readJson(book.path);
    const features = restoreClassDatabase(database, srdStructureIndex(fs.readFileSync(bookTextPath, "utf8")));
    writeJson(book.path, database);
    console.log(`${book.title}: struttura ripristinata in ${features} capacità di classe.`);
  }
}
