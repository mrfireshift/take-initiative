// Compendio delle regole, fase 2, lotto P1: i pacchetti privati, il loro formato, l'unione con l'SRD e l'archivio
// nell'IndexedDB del browser del GM. Tutti i testi qui sono inventati: nessun manuale entra nei test.
import assert from "node:assert/strict";
import test from "node:test";
import { createVersionedIndexedDB } from "../test-support/fakeVersionedIndexedDb.js";
import {
  mergeRulesCatalogs,
  parsePrivatePack,
  PRIVATE_PACK_FORMAT,
  privatePackContentsLabel,
  privatePackSummary,
  validatePrivatePack,
} from "../src/privatePackCore.js";
import { createPrivatePackStore } from "../src/privatePackStore.js";
import { buildRulesIndex, rulesTree, searchRules } from "../src/rulesReferenceCore.js";

const srd = {
  schemaVersion: 1,
  topics: [
    { id: "combattimento", name: "Combattimento", sections: [{ id: "azioni", name: "Azioni" }] },
    { id: "avventura", name: "Avventura", sections: [] },
  ],
  entries: [
    { id: "scatto", topic: "combattimento", section: "azioni", name: "Scatto", page: 10, text: "Corri il doppio.", aliases: [], related: [], optional: false },
    { id: "cadute", topic: "avventura", section: null, name: "Cadute", page: 20, text: "Cadi e ti fai male.", aliases: [], related: [], optional: false },
  ],
};

const pack = (overrides = {}) => ({
  format: PRIVATE_PACK_FORMAT,
  schemaVersion: 1,
  id: "manuale-finto",
  title: "Manuale Finto",
  badge: "MF",
  generatedAt: "2026-10-27",
  rules: {
    topics: [
      { id: "combattimento", name: "Combattimento", sections: [{ id: "azioni", name: "Azioni" }, { id: "manovre", name: "Manovre" }] },
      { id: "regole-opzionali", name: "Regole opzionali", sections: [] },
    ],
    entries: [
      { id: "capriola-finta", topic: "combattimento", section: "manovre", name: "Capriola finta", page: 5, text: "Una capriola inventata.", aliases: ["rotolare"], related: ["scatto"], optional: false },
      { id: "ferite-finte", topic: "regole-opzionali", section: null, name: "Ferite finte", page: 7, text: "Una variante inventata.", aliases: [], related: [], optional: true },
      { id: "scatto", topic: "combattimento", section: "azioni", name: "Scatto doppione", page: 9, text: "Non deve coprire l'SRD.", aliases: [], related: [], optional: false },
    ],
  },
  spells: { "incantesimo-finto": { description: "Fa qualcosa di inventato.", higherLevels: "" } },
  classFeatures: { "capacita-finta": "Un potere inventato." },
  ...overrides,
});

test("un pacchetto valido passa; formato, versione, id, titolo e sigla sono obbligatori", () => {
  assert.equal(validatePrivatePack(pack()).pack.id, "manuale-finto");
  assert.match(validatePrivatePack({ ...pack(), format: "altro" }).error, /Non è un pacchetto/u);
  assert.match(validatePrivatePack(pack({ schemaVersion: 2 })).error, /Versione del pacchetto non supportata: 2/u);
  assert.match(validatePrivatePack(pack({ id: "Con Spazi" })).error, /identificativo/u);
  assert.match(validatePrivatePack(pack({ id: "srd" })).error, /identificativo/u);
  assert.match(validatePrivatePack(pack({ badge: "TROPPOLUNGA" })).error, /titolo o sigla/u);
  assert.match(validatePrivatePack(pack({ title: " " })).error, /titolo o sigla/u);
  assert.match(validatePrivatePack([]).error, /Non è un pacchetto/u);
});

test("le regole, gli incantesimi e le capacità di un pacchetto vengono controllati", () => {
  const broken = pack();
  broken.rules.entries[0].page = 0;
  assert.match(validatePrivatePack(broken).error, /"capriola-finta" non ha la pagina/u);
  const repeated = pack();
  repeated.rules.entries.push({ ...repeated.rules.entries[0] });
  assert.match(validatePrivatePack(repeated).error, /"capriola-finta" è ripetuta/u);
  assert.match(validatePrivatePack(pack({ rules: { topics: [] } })).error, /argomenti e voci/u);
  assert.match(validatePrivatePack(pack({ spells: { x: { description: 3 } } })).error, /incantesimi/u);
  assert.match(validatePrivatePack(pack({ classFeatures: { x: 3 } })).error, /capacità/u);
  // Solo testi: un pacchetto può non avere regole.
  assert.ok(validatePrivatePack(pack({ rules: undefined })).pack);
});

test("il file si legge come JSON e un errore di lettura si dice in italiano", () => {
  assert.equal(parsePrivatePack(JSON.stringify(pack())).pack.title, "Manuale Finto");
  assert.deepEqual(parsePrivatePack("{non json"), { error: "Il file non è un JSON leggibile." });
});

test("il riassunto conta regole, incantesimi e capacità senza i testi", () => {
  const summary = privatePackSummary(pack(), 2048);
  assert.deepEqual(summary, { id: "manuale-finto", title: "Manuale Finto", badge: "MF", generatedAt: "2026-10-27", rules: 3, spells: 1, classFeatures: 1, bytes: 2048 });
  assert.equal(privatePackContentsLabel(summary), "3 regole · 1 incantesimo · 1 capacità");
  assert.equal(privatePackContentsLabel({ rules: 0, spells: 0, classFeatures: 0 }), "nessun testo");
});

test("le regole del pacchetto entrano negli stessi argomenti dell'SRD, senza mai coprire una voce SRD", () => {
  const merged = mergeRulesCatalogs(srd, [pack()]);
  assert.deepEqual(merged.topics.map((topic) => [topic.id, topic.sections.map((section) => section.id)]), [
    ["combattimento", ["azioni", "manovre"]],
    ["avventura", []],
    ["regole-opzionali", []],
  ]);
  assert.deepEqual(merged.entries.map((entry) => [entry.id, entry.source]), [
    ["scatto", "srd"], ["cadute", "srd"], ["capriola-finta", "manuale-finto"], ["ferite-finte", "manuale-finto"],
  ]);
  assert.equal(merged.entries.find((entry) => entry.id === "scatto").name, "Scatto");
  assert.equal(merged.skipped, 1);
  assert.deepEqual(merged.sources.map((source) => source.badge), ["SRD", "MF"]);
  // L'SRD da solo resta com'è, con la fonte su ogni voce.
  const alone = mergeRulesCatalogs(srd, []);
  assert.deepEqual(alone.entries.map((entry) => entry.source), ["srd", "srd"]);
  assert.equal(srd.entries[0].source, undefined, "l'SRD caricato non viene modificato");
});

test("il catalogo unito si cerca e si mostra ad albero come l'SRD", () => {
  const merged = mergeRulesCatalogs(srd, [pack()]);
  const index = buildRulesIndex(merged);
  assert.equal(searchRules(index, "rotolare").results[0].id, "capriola-finta");
  const combat = rulesTree(merged).find((node) => node.topic.id === "combattimento");
  assert.deepEqual(combat.sections.map((group) => [group.section?.id ?? null, group.entries.map((entry) => entry.id)]), [
    ["azioni", ["scatto"]],
    ["manovre", ["capriola-finta"]],
  ]);
});

test("salvare, elencare senza i testi, rileggere, sostituire e rimuovere un pacchetto", async () => {
  const store = createPrivatePackStore({ indexedDB: createVersionedIndexedDB(), now: () => 1000 });
  assert.equal((await store.put(pack(), { bytes: 4096 })).persisted, true);
  await store.put(pack({ id: "altro-finto", title: "Altro Finto", badge: "AF", rules: undefined }));
  const list = await store.list();
  assert.deepEqual(list.map((info) => [info.title, info.rules, info.bytes, info.importedAt, info.persisted, Object.hasOwn(info, "spells")]), [
    ["Altro Finto", 0, 0, 1000, true, true],
    ["Manuale Finto", 3, 4096, 1000, true, true],
  ]);
  assert.equal((await store.get("manuale-finto")).classFeatures["capacita-finta"], "Un potere inventato.");
  await store.put(pack({ title: "Manuale Finto rivisto" }));
  assert.deepEqual((await store.list()).map((info) => info.title), ["Altro Finto", "Manuale Finto rivisto"]);
  assert.equal((await store.all()).length, 2);
  await store.remove("altro-finto");
  assert.deepEqual((await store.list()).map((info) => info.id), ["manuale-finto"]);
  assert.equal(await store.get("altro-finto"), null);
});

test("i pacchetti restano tra due aperture dello stesso browser", async () => {
  const indexedDB = createVersionedIndexedDB();
  await createPrivatePackStore({ indexedDB }).put(pack());
  assert.deepEqual((await createPrivatePackStore({ indexedDB }).list()).map((info) => info.id), ["manuale-finto"]);
});

test("senza IndexedDB (finestra in incognito) il pacchetto vale per la sessione e il motivo si dice", async () => {
  const store = createPrivatePackStore({ indexedDB: null });
  const saved = await store.put(pack());
  assert.deepEqual([saved.persisted, saved.reason], [false, "memoria del browser non disponibile"]);
  const [info] = await store.list();
  assert.deepEqual([info.id, info.persisted], ["manuale-finto", false]);
  assert.equal((await store.get("manuale-finto")).title, "Manuale Finto");
  await store.remove("manuale-finto");
  assert.deepEqual(await store.list(), []);
});

test("un pacchetto non valido non entra nell'archivio", async () => {
  const store = createPrivatePackStore({ indexedDB: createVersionedIndexedDB() });
  await assert.rejects(store.put({ ...pack(), format: "altro" }), /Non è un pacchetto/u);
  assert.deepEqual(await store.list(), []);
});

test("le tabelle delle capacità di un pacchetto hanno un testo per riga", () => {
  assert.ok(validatePrivatePack(pack({ classFeatureTables: { "capacita-finta": { "01-02": "Una riga inventata." } } })).pack);
  assert.match(validatePrivatePack(pack({ classFeatureTables: { "capacita-finta": { "01-02": 3 } } })).error, /tabelle delle capacità/u);
  assert.match(validatePrivatePack(pack({ classFeatureTables: [] })).error, /tabelle delle capacità/u);
});
