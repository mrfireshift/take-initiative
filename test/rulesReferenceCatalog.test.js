import test from "node:test";
import assert from "node:assert/strict";

import catalog from "../src/rules-reference-it.json" with { type: "json" };
import { CONDITION_REFERENCE } from "../src/referenceData.js";
import { buildRulesReference, pdfLines, slugify } from "../scripts/generate-srd-rules-reference.mjs";

const FOOTER = "Rivendita vietata. È permesso fotocopiare o stampare questo documento per il solo uso personale. Systems Reference Document 5.1";

test("il compendio dichiara la fonte SRD 5.1 e la licenza CC BY 4.0", () => {
  assert.equal(catalog.schemaVersion, 1);
  assert.equal(catalog.language, "it");
  assert.equal(catalog.license, "CC-BY-4.0");
  assert.match(catalog.source, /SRD_CC_v5\.1_IT\.pdf$/u);
  assert.ok(catalog.entries.length >= 180, `solo ${catalog.entries.length} voci`);
});

test("ogni voce ha un id unico, un argomento e una sezione che esistono", () => {
  const ids = new Set();
  for (const entry of catalog.entries) {
    assert.ok(!ids.has(entry.id), `id ripetuto: ${entry.id}`);
    ids.add(entry.id);
    const topic = catalog.topics.find((item) => item.id === entry.topic);
    assert.ok(topic, `argomento sconosciuto in ${entry.id}`);
    if (entry.section !== null) assert.ok(topic.sections.some((item) => item.id === entry.section), `sezione sconosciuta in ${entry.id}`);
    assert.ok(Number.isInteger(entry.page) && entry.page > 0, `pagina mancante in ${entry.id}`);
  }
  for (const topic of catalog.topics) {
    for (const section of topic.sections) {
      assert.ok(catalog.entries.some((entry) => entry.section === section.id), `sezione vuota: ${section.id}`);
    }
  }
});

test("ogni rimando porta a una voce del compendio o a una condizione dell'enciclopedia", () => {
  const ids = new Set(catalog.entries.map((entry) => entry.id));
  const conditions = new Set(CONDITION_REFERENCE.map((condition) => condition.name));
  for (const entry of catalog.entries) {
    for (const related of entry.related) {
      if (related.startsWith("condition:")) assert.ok(conditions.has(related.slice("condition:".length)), `${entry.id} → ${related}`);
      else assert.ok(ids.has(related), `${entry.id} → ${related}`);
    }
  }
});

test("i testi non hanno piè di pagina, non sono vuoti e le tabelle hanno righe della stessa lunghezza", () => {
  for (const entry of catalog.entries) {
    assert.ok(entry.text.trim(), `testo vuoto: ${entry.id}`);
    assert.ok(!entry.text.includes("Rivendita vietata"), `piè di pagina in ${entry.id}`);
    assert.ok(!entry.text.includes("Systems Reference Document"), `piè di pagina in ${entry.id}`);
    // Equipaggiamento d'avventura holds the description of every item: the only text this long.
    assert.ok(entry.text.length < 15000, `voce troppo lunga, forse un titolo mancante: ${entry.id}`);
    for (const block of entry.text.split("\n\n")) {
      const rows = block.split("\n").filter((line) => line.includes(" | "));
      if (!rows.length) continue;
      const widths = new Set(rows.map((row) => row.split(" | ").length));
      assert.equal(widths.size, 1, `righe di lunghezza diversa in ${entry.id}`);
    }
  }
});

test("le voci si trovano con i nomi delle regole più consultate", () => {
  const names = new Set(catalog.entries.map((entry) => entry.name));
  for (const name of ["Lottare", "Copertura", "Attacchi di opportunità", "Tiri salvezza contro morte", "Concentrazione", "Riposo breve", "Vantaggio e svantaggio", "Cadute", "Tabella delle armi"]) {
    assert.ok(names.has(name), `manca: ${name}`);
  }
  assert.ok(catalog.entries.find((entry) => entry.name === "Variante: ingombro").optional);
});

const page = (number, lines) => `${lines.join("\n")}\n\n${FOOTER} ${number}\n`;

test("il generatore toglie i piè di pagina e numera le pagine dal piè", () => {
  const lines = pdfLines([page(1, ["Uno"]), page(2, ["Due", "", "Tre"])].join("\f"));
  assert.deepEqual(lines, [
    { page: 1, line: 0, text: "Uno" },
    { page: 2, line: 0, text: "Due" },
    { page: 2, line: 2, text: "Tre" },
  ]);
  assert.equal(slugify("Attacchi di opportunità"), "attacchi-di-opportunita");
  assert.equal(slugify("L'ordine di combattimento"), "l-ordine-di-combattimento");
});

const fixture = [
  page(1, [
    "Combattimento",
    "Una frase che la colonna",
    "spezza a metà.",
    "Lottare",
    "Primo paragrafo.",
    "Opzioni: • prima • seconda",
    "Taglia Piccola Media",
    "Spazio 1,5 m 1,5 m",
    "Fine",
  ]),
].join("\f");

const outline = (tables) => ({
  source: "fonte",
  nodes: [
    { kind: "topic", id: "combattimento", name: "Combattimento" },
    { kind: "section", heading: "Combattimento", page: 1 },
    { kind: "entry", heading: "Lottare", page: 1, aliases: ["afferrare"], related: ["combattimento"] },
    { kind: "end", heading: "Fine", page: 1 },
  ],
  tables,
});

test("il generatore riunisce i paragrafi spezzati, separa gli elenchi e ricostruisce le tabelle", () => {
  const { reference } = buildRulesReference(fixture, outline([
    { label: "Taglia", page: 1, first: "Taglia Piccola", last: "Spazio", rows: [["Taglia", "Spazio"], ["Piccola", "1,5 m"], ["Media", "1,5 m"]] },
  ]));
  assert.deepEqual(reference.topics, [{ id: "combattimento", name: "Combattimento", sections: [{ id: "combattimento", name: "Combattimento" }] }]);
  assert.equal(reference.entries[0].text, "Una frase che la colonna spezza a metà.");
  assert.equal(reference.entries[1].text, "Primo paragrafo.\n\nOpzioni:\n• prima\n• seconda\n\nTaglia | Spazio\nPiccola | 1,5 m\nMedia | 1,5 m");
  assert.equal(reference.entries[1].section, "combattimento");
  assert.deepEqual(reference.entries[1].aliases, ["afferrare"]);
});

test("il generatore si ferma se una tabella aggiunge o perde parole, o se una riga resta senza voce", () => {
  assert.throws(() => buildRulesReference(fixture, outline([
    { label: "Taglia", page: 1, first: "Taglia Piccola", last: "Spazio", rows: [["Taglia", "Spazio"], ["Piccola", "1,5 m"], ["Grande", "1,5 m"]] },
  ])), /parole mancanti \[Media\], parole in più \[Grande\]/u);
  const missingHeading = outline([]);
  missingHeading.nodes.splice(2, 1, { kind: "entry", heading: "Afferrare", page: 1 });
  assert.throws(() => buildRulesReference(fixture, missingHeading), /Titolo non trovato a p\. 1/u);
});

// A private manual's outline (scripts/generate-private-rules.mjs): its own footer, page offset, id prefix, OCR
// corrections that may split a line, a topic the outline comes back to, and small tables rebuilt from their cells.
const bookPage = (lines) => `${lines.join("\n")}\n\nCAPITOLO 2 I STRUMENTI\n`;
const bookFixture = [bookPage([
  "CADUTE",
  "Una caduta da ld6 metri.",
  "ATTREZZI DA PROVA Gli attrezzi servono.",
  "ATTREZZI DA PROVA",
  "Attività",
  "CD",
  "Aprire una porta",
  "10 chiudere una porta",
  "15",
  "SONNO",
  "Si dorme.",
  "FINE",
])].join("\f");

const bookOutline = {
  source: "manuale finto",
  idPrefix: "mf-",
  pageOffset: -1,
  footer: "^CAPITOLO 2 I STRUMENTI$",
  corrections: [
    { from: String.raw`\bld(\d)`, to: "1d$1" },
    { from: "^((?:[A-Z]{2,} ){1,6}[A-Z]{2,}) ([A-Z][a-z])", to: "$1\n$2" },
  ],
  autoTables: [["Attività", "CD"]],
  nodes: [
    { kind: "topic", id: "avventura", name: "Avventura" },
    { kind: "entry", heading: "CADUTE", page: 1, name: "Cadute" },
    { kind: "topic", id: "equipaggiamento", name: "Equipaggiamento" },
    { kind: "entry", heading: "ATTREZZI DA PROVA", page: 1, name: "Attrezzi da prova" },
    { kind: "topic", id: "avventura", name: "Avventura" },
    { kind: "entry", heading: "SONNO", page: 1, name: "Sonno" },
    { kind: "end", heading: "FINE", page: 1 },
  ],
};

test("il generatore legge un manuale privato: piè di pagina, pagine, prefisso, correzioni e tabelle in celle", () => {
  const { reference } = buildRulesReference(bookFixture, bookOutline);
  assert.deepEqual(reference.topics.map((topic) => topic.id), ["avventura", "equipaggiamento"]);
  assert.deepEqual(reference.entries.map((entry) => [entry.id, entry.topic, entry.page]), [
    ["mf-cadute", "avventura", 0],
    ["mf-attrezzi-da-prova", "equipaggiamento", 0],
    ["mf-sonno", "avventura", 0],
  ]);
  assert.equal(reference.entries[0].text, "Una caduta da 1d6 metri.");
  assert.equal(reference.entries[1].text, "Gli attrezzi servono.\n\nATTREZZI DA PROVA\n\nAttività | CD\nAprire una porta | 10\nchiudere una porta | 15");
});

test("una tabella a dado con l'intestazione su una riga diventa una tabella, righe a capo comprese", () => {
  const fixture = [bookPage([
    "REGIONE FINTA",
    "Accade qualcosa.",
    "d100 Effetto",
    "01-50 Piove",
    "per un'ora.",
    "51-00",
    "Nevica.",
    "ALTRA VOCE",
    "Fine del testo.",
    "FINE",
  ])].join("\f");
  const { reference } = buildRulesReference(fixture, {
    source: "manuale finto",
    idPrefix: "mf-",
    footer: "^CAPITOLO 2 I STRUMENTI$",
    autoTables: [{ header: "d100 Effetto", columns: ["d100", "Effetto"] }],
    nodes: [
      { kind: "topic", id: "avventura", name: "Avventura" },
      { kind: "entry", heading: "REGIONE FINTA", page: 1, name: "Regione finta" },
      { kind: "entry", heading: "ALTRA VOCE", page: 1, name: "Altra voce" },
      { kind: "end", heading: "FINE", page: 1 },
    ],
  });
  assert.equal(reference.entries[0].text, "Accade qualcosa.\n\nd100 | Effetto\n01-50 | Piove per un'ora.\n51-00 | Nevica.");
});

test("la riparazione dell'OCR unisce i frammenti che formano una parola nota, mai due parole vere", async () => {
  const { mendLine, vocabularyOf } = await import("../scripts/repair-ocr-text.mjs");
  const known = vocabularyOf(["il suo personaggio di prova svolgere una gilda"]);
  assert.deepEqual(mendLine("il s uo pe rsonaggio", known), ["il suo personaggio", [["s uo", "suo"], ["pe rsonaggio", "personaggio"]]]);
  assert.deepEqual(mendLine("TIPI D I G ILDA", known)[0], "TIPI DI GILDA");
  assert.deepEqual(mendLine("svolge r e", known)[0], "svolgere");
  assert.deepEqual(mendLine("di prova", known), ["di prova", []]);
});

test("la riparazione non incolla dadi, parole in casi diversi o una parola a cui segue un'unione più lunga", async () => {
  const { mendLine, vocabularyOf } = await import("../scripts/repair-ocr-text.mjs");
  const known = vocabularyOf(["und di mettere ape perseguire medio evo tipi reame coni"]);
  assert.equal(mendLine("tira un d20", known)[0], "tira un d20");
  assert.equal(mendLine("nel Medio Evo", known)[0], "nel Medio Evo");
  assert.equal(mendLine("di me ttere", known)[0], "di mettere");
  assert.equal(mendLine("a pe rseguire", known)[0], "a perseguire");
  // Two words join only when together they make a word of five letters or more of the sure texts, and none is a
  // function word: "REA ME" is "REAME", "con i" stays.
  const sure = vocabularyOf(["reame coni"]);
  assert.equal(mendLine("DEL REA ME REMOTO", known, vocabularyOf(["rea me del remoto"]), sure)[0], "DEL REAME REMOTO");
  assert.equal(mendLine("con i mostri", known, vocabularyOf(["con mostri"]), sure)[0], "con i mostri");
});

test("la riparazione toglie gli spazi dell'apostrofo e delle preposizioni articolate e unisce le righe", async () => {
  const { mendAcrossLines, mendElisions, vocabularyOf } = await import("../scripts/repair-ocr-text.mjs");
  assert.deepEqual(mendElisions("discutere dell 'esperienza a ll'inizio"), ["discutere dell'esperienza all'inizio", [["dell '", "dell'"], ["a ll", "all"]]]);
  assert.equal(mendElisions("unirsi a i giocatori, Da i loro")[0], "unirsi ai giocatori, Dai loro");
  assert.equal(mendElisions("disse 'vai via' e poi")[0], "disse 'vai via' e poi");
  const known = vocabularyOf(["il personaggio può"]);
  assert.deepEqual(mendAcrossLines(["Il pe", "rsonaggio può", "\fpe", "rsonaggio"], known)[0], ["Il personaggio", "può", "\fpe", "rsonaggio"]);
});

test("la riparazione corregge le lettere scambiate dall'OCR e separa le parole incollate, non i nomi", async () => {
  const { fixLetters, TESSERACT_CONFUSIONS, vocabularyOf } = await import("../scripts/repair-ocr-text.mjs");
  const known = vocabularyOf(["egli nemici templi livello nobile pergamene causato ottenere fiala"]);
  assert.equal(fixLetters("egii vide i nemnici nei ternpli", known)[0], "egli vide i nemici nei templi");
  assert.equal(fixLetters("il LiveJlo", known)[0], "il Livello");
  // A name keeps its first letter, a pronoun glued to a verb is a word.
  assert.equal(fixLetters("Jiala e ottenerle", known)[0], "Jiala e ottenerle");
  // The confusions of Tesseract only when asked.
  assert.equal(fixLetters("il nobite", known)[0], "il nobite");
  assert.equal(fixLetters("il nobite", known, known, TESSERACT_CONFUSIONS)[0], "il nobile");
  assert.equal(fixLetters("lepergamene causatoda delFuoco", known)[0], "le pergamene causato da del Fuoco");
  assert.equal(fixLetters("inviolato", known)[0], "inviolato");
});
