import test from "node:test";
import assert from "node:assert/strict";

import { rulesTextBlocks } from "../src/rulesTextCore.js";
import { rulesTextBlock, rulesTextNodes } from "../src/rulesTextView.js";
import { CONDITION_REFERENCE } from "../src/referenceData.js";
import { classFeatureDescription, loadClassFeatureDescriptions } from "../src/classFeatureDescriptions.js";
import { loadSpellbookSpellReference, spellbookSpellDetails } from "../src/spellbookCatalog.js";
import { readPrivateFeatureTexts, readPrivateSpellTexts } from "../scripts/privateSources.mjs";

// The texts of the Xanathar and Tasha spells are in the GM's private folder (compendio delle regole, fase 2).
const supplementTexts = readPrivateSpellTexts("xanathar") && readPrivateSpellTexts("tasha")
  ? { ...readPrivateSpellTexts("xanathar"), ...readPrivateSpellTexts("tasha") }
  : null;
const noSupplementTexts = !supplementTexts && "testi privati assenti";
// The class features whose text is not SRD, likewise: the SRD text from the sheet's file, the others from the folder.
const featureBooks = ["phb2014", "xanathar", "tasha", "ranger-revised"].map(readPrivateFeatureTexts);
const privateFeatureTexts = featureBooks.every(Boolean) ? Object.assign({}, ...featureBooks) : null;
const noFeatureTexts = !privateFeatureTexts && "testi privati assenti";
const featureText = (feature) => classFeatureDescription(feature) || privateFeatureTexts?.[feature.id] || "";

function createTestDocument() {
  const makeNode = (tagName) => ({
    tagName: String(tagName).toUpperCase(),
    children: [],
    className: "",
    textContent: "",
    append(...children) {
      this.children.push(...children);
    },
  });
  return { createElement: makeNode };
}

const tags = (nodes) => nodes.map((node) => node.tagName);

test("ogni riga è un paragrafo, le righe vuote non contano", () => {
  assert.deepEqual(rulesTextBlocks("Primo paragrafo.\n\nSecondo paragrafo.\r\nTerzo."), [
    { kind: "paragraph", text: "Primo paragrafo." },
    { kind: "paragraph", text: "Secondo paragrafo." },
    { kind: "paragraph", text: "Terzo." },
  ]);
  assert.deepEqual(rulesTextBlocks(""), []);
  assert.deepEqual(rulesTextBlocks(null), []);
});

test("le voci con •, - o * formano un solo elenco fra due paragrafi", () => {
  assert.deepEqual(rulesTextBlocks("Opzioni:\n• prima\n- seconda\n* terza\n\nPer esempio, così."), [
    { kind: "paragraph", text: "Opzioni:" },
    { kind: "list", items: ["prima", "seconda", "terza"] },
    { kind: "paragraph", text: "Per esempio, così." },
  ]);
  // A lone dash or a negative number is not an item.
  assert.deepEqual(rulesTextBlocks("-\n-2 alla CA"), [
    { kind: "paragraph", text: "-" },
    { kind: "paragraph", text: "-2 alla CA" },
  ]);
});

test("le righe con | formano una tabella, la prima è l'intestazione", () => {
  assert.deepEqual(rulesTextBlocks("Forme Bestiali\n\nLivello | GS Max\n2° | 1/4\n8° | 1 | -"), [
    { kind: "paragraph", text: "Forme Bestiali" },
    { kind: "table", rows: [["Livello", "GS Max"], ["2°", "1/4"], ["8°", "1", "-"]] },
  ]);
});

test("le condizioni dell'enciclopedia hanno elenchi e la tabella dell'indebolimento", () => {
  const paralyzed = CONDITION_REFERENCE.find((entry) => entry.name === "Paralizzato");
  assert.deepEqual(rulesTextBlocks(paralyzed.details).map((block) => block.kind), ["list"]);
  assert.equal(rulesTextBlocks(paralyzed.details)[0].items.length, 4);
  const exhaustion = CONDITION_REFERENCE.find((entry) => entry.name === "Indebolimento");
  const table = rulesTextBlocks(exhaustion.details).find((block) => block.kind === "table");
  assert.deepEqual(table.rows[0], ["Livello", "Effetto"]);
  assert.equal(table.rows.length, 7);
});

test("la vista crea paragrafi, elenchi e tabelle come nodi, con il testo come testo", () => {
  const documentRef = createTestDocument();
  const nodes = rulesTextNodes("Testo <b>non</b> HTML.\n• una\n• due\nA | B\n1 | 2", {
    document: documentRef,
    paragraphClass: "spell-text",
  });
  assert.deepEqual(tags(nodes), ["P", "UL", "TABLE"]);
  assert.equal(nodes[0].textContent, "Testo <b>non</b> HTML.");
  assert.equal(nodes[0].className, "spell-text");
  assert.equal(nodes[0].children.length, 0);
  assert.equal(nodes[1].className, "rules-list");
  assert.deepEqual(nodes[1].children.map((item) => [item.tagName, item.textContent]), [["LI", "una"], ["LI", "due"]]);
  const [head, body] = nodes[2].children;
  assert.deepEqual(tags([head, body]), ["THEAD", "TBODY"]);
  assert.deepEqual(head.children[0].children.map((cell) => [cell.tagName, cell.textContent]), [["TH", "A"], ["TH", "B"]]);
  assert.deepEqual(body.children[0].children.map((cell) => [cell.tagName, cell.textContent]), [["TD", "1"], ["TD", "2"]]);
});

test("il blocco è un div rules-text con la classe della vista", () => {
  const block = rulesTextBlock("Uno.\nDue.", { document: createTestDocument(), className: "text" });
  assert.equal(block.tagName, "DIV");
  assert.equal(block.className, "rules-text text");
  assert.deepEqual(block.children.map((node) => node.textContent), ["Uno.", "Due."]);
});

test("gli incantesimi SRD hanno di nuovo paragrafi, elenchi e tabelle", async () => {
  await loadSpellbookSpellReference();
  const kinds = (spellId) => rulesTextBlocks(spellbookSpellDetails(spellId).description).map((block) => block.kind);
  assert.deepEqual(kinds("commune-with-nature"), ["paragraph", "paragraph", "list", "paragraph"]);
  assert.deepEqual(kinds("bestow-curse"), ["paragraph", "list", "paragraph"]);
  assert.ok(kinds("contagion").filter((kind) => kind === "paragraph").length >= 9);
  const confusion = rulesTextBlocks(spellbookSpellDetails("confusion").description);
  assert.deepEqual(confusion.find((block) => block.kind === "table").rows.map((row) => row[0]), ["d10", "1", "2-6", "7-8", "9-10"]);
  const reincarnate = rulesTextBlocks(spellbookSpellDetails("reincarnate").description);
  assert.equal(reincarnate.find((block) => block.kind === "table").rows.length, 15);
  const animated = rulesTextBlocks(spellbookSpellDetails("animate-objects").description);
  const table = animated.find((block) => block.kind === "table");
  assert.deepEqual(table.rows.at(-1), ["Enorme", "80", "10", "+8 al tiro per colpire, 2d12 + 4 danni", "18", "6"]);
  assert.ok(animated.some((block) => block.kind === "paragraph" && block.text.startsWith("Un oggetto animato è un costrutto")));
});

test("Forma Selvatica ha la tabella delle forme bestiali e l'elenco delle regole", async () => {
  await loadClassFeatureDescriptions();
  const blocks = rulesTextBlocks(classFeatureDescription({ id: "druido-forma-selvatica" }));
  assert.deepEqual(blocks.map((block) => block.kind), ["paragraph", "paragraph", "paragraph", "table", "paragraph", "paragraph", "list"]);
  assert.deepEqual(blocks[3].rows[0], ["Livello", "GS Max", "Limitazioni", "Esempio"]);
  assert.equal(blocks[6].items.length, 5);
});

test("le capacità con un elenco in linea lo hanno su righe proprie, un prodotto resta testo", { skip: noFeatureTexts }, async () => {
  await loadClassFeatureDescriptions();
  const stone = rulesTextBlocks(featureText({ id: "mago-scuola-di-trasmutazione-pietra-del-trasmutatore" }));
  assert.equal(stone.find((block) => block.kind === "list").items.length, 4);
  const blades = featureText({ id: "ladro-lama-spirituale-lame-dell-anima" });
  assert.match(blades, /3 metri \* il risultato del dado/);
  assert.ok(!rulesTextBlocks(blades).some((block) => block.kind === "list"));
});

test("gli incantesimi di Xanathar e Tasha tengono paragrafi, elenchi e tabelle", { skip: noSupplementTexts }, () => {
  const spell = (id) => supplementTexts[id];
  const moldEarth = rulesTextBlocks(spell("xanathar-modellare-terra").description);
  assert.deepEqual(moldEarth.map((block) => block.kind), ["paragraph", "list", "paragraph"]);
  assert.deepEqual(moldEarth[1].items.map((item) => item.split(" ").slice(0, 4).join(" ")), [
    "Se l'incantatore bersaglia un'area",
    "L'incantatore fa comparire forme,",
    "Se il terriccio o",
  ]);
  const breath = spell("xanathar-soffio-del-drago");
  assert.doesNotMatch(breath.description, /Ai Livelli Superiori/iu);
  assert.match(breath.higherLevels, /^Quando l'incantatore lancia questo incantesimo usando uno slot incantesimo di 3° livello/u);
  const chaosBolt = rulesTextBlocks(spell("xanathar-dardo-di-caos").description);
  assert.equal(chaosBolt.find((block) => block.kind === "table").rows.length, 9);
  const otherworldly = rulesTextBlocks(spell("tasha-abito-ultraterreno-di-tasha").description);
  assert.ok(otherworldly.find((block) => block.kind === "list").items.length >= 5);
});

test("Controllare tempo atmosferico e Creazione hanno le loro tabelle, come nel PDF", async () => {
  await loadSpellbookSpellReference();
  const weather = rulesTextBlocks(spellbookSpellDetails("control-weather").description);
  const tables = weather.filter((block) => block.kind === "table");
  assert.deepEqual(tables.map((table) => table.rows.length), [6, 7, 6]);
  assert.ok(tables.every((table) => table.rows[0].join("|") === "Grado|Condizione"));
  assert.deepEqual(weather.filter((block) => block.kind === "paragraph").slice(-3).map((block) => block.text),
    ["Precipitazioni", "Temperatura", "Vento"]);
  assert.deepEqual([tables[0].rows[2], tables[1].rows[1], tables[2].rows[3]],
    [["2", "Poco nuvoloso"], ["1", "Caldo insopportabile"], ["3", "Vento forte"]]);
  const creation = rulesTextBlocks(spellbookSpellDetails("creation").description);
  const durations = creation.find((block) => block.kind === "table").rows;
  assert.deepEqual(durations[0], ["Materiale", "Durata"]);
  assert.deepEqual(durations[3], ["Metalli preziosi", "1 ora"]);
  assert.equal(creation.at(-1).kind, "paragraph");
});

test("le capacità di Xanathar e Tasha hanno i paragrafi e gli elenchi del manuale", { skip: noFeatureTexts }, async () => {
  await loadClassFeatureDescriptions();
  const kinds = (id) => rulesTextBlocks(featureText({ id })).map((block) => block.kind);
  assert.deepEqual(kinds("stregone-anima-meccanica-cavalleria-meccanica"), ["paragraph", "paragraph", "list", "paragraph"]);
  assert.equal(rulesTextBlocks(featureText({ id: "stregone-anima-meccanica-cavalleria-meccanica" }))
    .find((block) => block.kind === "list").items.length, 3);
  assert.deepEqual(kinds("guerriero-samurai-forza-di-fronte-alla-morte"), ["paragraph", "paragraph"]);
  assert.deepEqual(kinds("ladro-lama-spirituale-lame-psichiche"), ["paragraph", "paragraph"]);
  assert.ok(kinds("monaco-via-del-kensei-cammino-del-kensei").length >= 4);
  assert.ok(kinds("barbaro-cammino-della-bestia-forma-della-bestia").length >= 4);
});

test("gli incantesimi di Xanathar corretti come nel PDF, Sudario spirituale resta a 3 metri", { skip: noSupplementTexts }, () => {
  const spell = (id) => supplementTexts[id];
  for (const id of ["creare-falo", "ferocia-primordiale", "infestazione", "morsa-del-gelo", "parola-radiosa", "rintocco-dei-morti", "rombo-di-tuono"]) {
    assert.match(spell(`xanathar-${id}`).description, /\), l'11° livello \(/u, id);
  }
  assert.match(spell("xanathar-rombo-di-tuono").description, /17° livello \(4d6\)\.$/u);
  assert.match(spell("xanathar-legame-con-le-bestie").description, /entro linea di vista l'uno dall'altra/u);
  assert.match(spell("tasha-sudario-spirituale").description, /inizia il suo turno entro 3 metri da lui/u);
});

test("le quattro capacità di Tasha riscritte hanno i paragrafi del libro e gli errori corretti", { skip: noFeatureTexts }, async () => {
  await loadClassFeatureDescriptions();
  const text = (id) => featureText({ id });
  const kinds = (id) => rulesTextBlocks(text(id)).map((block) => block.kind);
  const bond = "chierico-dominio-della-pace-legame-incoraggiante";
  assert.deepEqual(kinds(bond), ["paragraph", "paragraph"]);
  assert.match(text(bond), /non più di una volta per turno\.\n\nIl personaggio/u);
  assert.match(text(bond), /tra di loro per 10 minuti/u);
  assert.deepEqual(kinds("chierico-dominio-del-crepuscolo-occhi-della-notte"), ["paragraph", "paragraph"]);
  const sanctuary = "chierico-dominio-del-crepuscolo-incanalare-divinita-santuario-del-crepuscolo";
  assert.deepEqual(kinds(sanctuary), ["paragraph", "paragraph", "list"]);
  assert.match(text(sanctuary), /pone termine a un effetto che causa alla creatura la condizione affascinato o spaventato/u);
  const telepathy = "stregone-mente-aberrante-conversazione-telepatica";
  assert.deepEqual(kinds(telepathy), ["paragraph", "paragraph"]);
  assert.match(text(telepathy), /1,5 km\. Affinché si capiscano/u);
});
