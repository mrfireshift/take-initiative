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
