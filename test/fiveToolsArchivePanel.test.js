// Attacchi dei mostri, fase 3, lotto 4: il client di rete dell'archivio e il riquadro «Archivio online» della scheda.
import assert from "node:assert/strict";
import test from "node:test";
import { FakeNode, textOf } from "../test-support/fakeBossActionsDom.js";
import { createVersionedIndexedDB } from "../test-support/fakeVersionedIndexedDb.js";
import { createFiveToolsArchiveClient } from "../src/fiveToolsArchiveClient.js";
import { createFiveToolsArchiveStore } from "../src/fiveToolsArchiveStore.js";
import { createFiveToolsArchivePanel } from "../src/fiveToolsArchivePanel.js";
import { fiveToolsMonsterToStatblock, fiveToolsCollection } from "../src/fiveToolsMonsterCore.js";

const BASE = "https://archivio.example/data/";
const files = {
  "bestiary/index.json": { MM: "bestiary-mm.json", IDRotF: "bestiary-idrotf.json", XMM: "bestiary-xmm.json" },
  "bestiary/bestiary-mm.json": { monster: [{ name: "Owlbear", source: "MM", ac: [13], hp: { average: 59, formula: "7d10 + 21" },
    action: [{ name: "Beak", entries: ["{@atk mw} {@hit 7} to hit, reach 5 ft., one creature. {@h}10 ({@damage 1d10 + 5}) piercing damage."] }] }] },
  "bestiary/bestiary-idrotf.json": { monster: [{ name: "Snowy Owlbear", source: "IDRotF", _copy: { name: "Owlbear", source: "MM" }, speed: { walk: 40 } }] },
};
function fakeFetch(log = []) {
  return async (url) => {
    log.push(url);
    const path = url.slice(BASE.length);
    if (!(path in files)) return { ok: false, status: 404, text: async () => "" };
    return { ok: true, status: 200, text: async () => JSON.stringify(files[path]) };
  };
}
const doc = { createElement: (tag) => new FakeNode(doc, tag) };

test("il client: indice con i libri, download controllato; errori in italiano", async () => {
  const client = createFiveToolsArchiveClient({ fetchImpl: fakeFetch() });
  const books = await client.books(BASE);
  assert.deepEqual(books.map((book) => [book.code, book.disabled]), [["IDRotF", false], ["MM", false], ["XMM", true]]);
  const record = await client.download(BASE, books.find((book) => book.code === "MM"));
  assert.deepEqual([record.code, record.monsters, record.url], ["MM", 1, `${BASE}bestiary/bestiary-mm.json`]);
  await assert.rejects(client.download(BASE, books.find((book) => book.code === "XMM")), /regole 2024, non si scarica/);
  await assert.rejects(client.books(""), /nessun indirizzo dell'archivio/);
  await assert.rejects(client.download(BASE, { code: "ToA", file: "bestiary-toa.json" }), /l'archivio risponde 404/);
  const offline = createFiveToolsArchiveClient({ fetchImpl: async () => { throw new TypeError("Failed to fetch"); } });
  await assert.rejects(offline.books(BASE), /archivio non raggiungibile/);
  const slow = createFiveToolsArchiveClient({ timeoutMs: 20, fetchImpl: (url, { signal }) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(Object.assign(new Error("x"), { name: "AbortError" })))) });
  await assert.rejects(slow.books(BASE), /nessuna risposta in 0 secondi/);
});

function panel({ base = BASE, log = [] } = {}) {
  const container = new FakeNode(doc, "div");
  const changes = [];
  const view = createFiveToolsArchivePanel({ container, documentRef: doc, store: createFiveToolsArchiveStore({ indexedDB: createVersionedIndexedDB() }),
    client: createFiveToolsArchiveClient({ fetchImpl: fakeFetch(log) }), readBase: () => base, onChange: (data) => changes.push(data) });
  return { container, changes, view, log };
}

test("senza indirizzo il riquadro rimanda alle Opzioni e non va in rete", async () => {
  const { container, view, log } = panel({ base: "" });
  await view.refresh();
  assert.match(textOf(container), /Nessun archivio: scrivi l'indirizzo in Opzioni → Console attacchi → Archivio 5eTools/);
  assert.deepEqual(log, []);
  assert.equal(await view.ensureSource("MM"), false);
});

test("aggiungere un libro: elenco letto, libro scaricato e tenuto, i suoi mostri all'elenco della scheda; rimuoverlo", async () => {
  const { container, changes, view, log } = panel();
  await view.refresh();
  assert.match(textOf(container), /Nessun libro in memoria/);
  assert.deepEqual(log, [], "nothing downloaded before the GM asks");
  await view.loadIndex();
  const options = container.querySelector("[data-archive-books]").children;
  assert.deepEqual(options.map((option) => [option.value, option.disabled]), [["IDRotF", false], ["MM", false], ["XMM", true]]);
  assert.equal(await view.addBook("MM"), true);
  assert.match(textOf(container), /Monster Manual \(2014\) \(MM\) .*1 mostri/);
  assert.match(textOf(container), /Monster Manual \(2014\) \(MM\): 1 mostri\./);
  assert.deepEqual(changes.at(-1).map((data) => data.monster[0].name), ["Owlbear"]);
  assert.equal(container.querySelector("[data-archive-books]").children.some((option) => option.value === "MM"), false, "a kept book leaves the list to add");
  await container.querySelector('[data-archive-remove="MM"]').click();
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.deepEqual(changes.at(-1), []);
  assert.match(textOf(container), /tolto dalla memoria/);
});

test("la base di un mostro derivato si scarica da sola (D2), una volta", async () => {
  const { changes, view, log } = panel();
  await view.refresh();
  await view.addBook("IDRotF");
  const owlbear = fiveToolsCollection(changes.at(-1)).monsters.find((monster) => monster.name === "Snowy Owlbear");
  const first = fiveToolsMonsterToStatblock(owlbear, { pool: fiveToolsCollection(changes.at(-1)).pool });
  assert.equal(first.missingSource, "MM");
  assert.equal(await view.ensureSource("MM"), true);
  const second = fiveToolsMonsterToStatblock(owlbear, { pool: fiveToolsCollection(changes.at(-1)).pool });
  assert.equal(second.error, "");
  assert.deepEqual([second.block.armorClass, second.block.speed], [13, "40 ft"]);
  assert.equal(await view.ensureSource("MM"), false, "already kept: no second download");
  assert.equal(log.filter((url) => url.endsWith("bestiary-mm.json")).length, 1);
  assert.equal(await view.ensureSource("ToA"), false, "not in the archive");
});

test("aggiornare un libro lo riscarica; un errore di rete si dice e non cancella il libro tenuto", async () => {
  const { container, view, log } = panel();
  await view.refresh();
  await view.addBook("MM");
  await container.querySelector('[data-archive-update="MM"]').click();
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(log.filter((url) => url.endsWith("bestiary-mm.json")).length, 2);
  const broken = files["bestiary/bestiary-mm.json"];
  files["bestiary/bestiary-mm.json"] = { spell: [] };
  assert.equal(await view.addBook("MM", { update: true }), false);
  files["bestiary/bestiary-mm.json"] = broken;
  assert.match(textOf(container), /non scaricato: Il file scaricato non è un bestiario di 5eTools/);
  assert.match(textOf(container), /Monster Manual \(2014\) \(MM\) .*1 mostri/);
});
