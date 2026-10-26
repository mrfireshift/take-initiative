// Attacchi dei mostri, fase 3, lotto 1: il client dell'archivio di 5eTools (indirizzi, indice, controlli), senza rete.
import assert from "node:assert/strict";
import test from "node:test";
import { fiveToolsArchiveBookForSource, fiveToolsArchiveBookUrl, fiveToolsArchiveIndexUrl, fiveToolsArchiveRecord, fiveToolsArchiveSizeLabel,
  fiveToolsBook, fiveToolsBookLabel, normalizeFiveToolsArchiveBase, parseFiveToolsArchiveIndex, validateFiveToolsArchiveBook } from "../src/fiveToolsArchiveCore.js";

const BASE = "https://archivio.example/5etools/data/";

test("l'indirizzo della cartella dei dati, in qualsiasi forma lo scriva il GM", () => {
  for (const value of ["https://archivio.example/5etools/data", "https://archivio.example/5etools/data/", "https://archivio.example/5etools/data/bestiary/index.json",
    "https://archivio.example/5etools/data/bestiary/", "https://archivio.example/5etools/data/bestiary/bestiary-mm.json?x=1#y", "  https://archivio.example/5etools/data  "]) {
    assert.equal(normalizeFiveToolsArchiveBase(value), BASE, value);
  }
  assert.equal(normalizeFiveToolsArchiveBase("http://localhost:5173/data"), "http://localhost:5173/data/");
  for (const bad of ["", "archivio", "http://archivio.example/data", "ftp://archivio.example/data", "https://utente:segreto@archivio.example/data", "javascript:alert(1)"]) {
    assert.equal(normalizeFiveToolsArchiveBase(bad), "", bad);
  }
});

test("indirizzi dell'indice e dei file; un nome di file non da bestiario non diventa un indirizzo", () => {
  assert.equal(fiveToolsArchiveIndexUrl(BASE), `${BASE}bestiary/index.json`);
  assert.equal(fiveToolsArchiveBookUrl(BASE, "bestiary-idrotf.json"), `${BASE}bestiary/bestiary-idrotf.json`);
  for (const bad of ["../secret.json", "bestiary-mm.json/../x", "index.json", "bestiary-MM.json?x"]) assert.equal(fiveToolsArchiveBookUrl(BASE, bad), "", bad);
  assert.equal(fiveToolsArchiveIndexUrl("non un indirizzo"), "");
});

test("l'indice: libri con nome e anno, in ordine; i 2024 disattivati salvo l'opzione; le voci strane fuori", () => {
  const index = { MM: "bestiary-mm.json", IDRotF: "bestiary-idrotf.json", XMM: "bestiary-xmm.json", ZZZ: "bestiary-zzz.json",
    "../x": "bestiary-x.json", BAD: "altro.json" };
  const books = parseFiveToolsArchiveIndex(index);
  assert.deepEqual(books.map((book) => [book.code, book.name, book.year, book.disabled]), [
    ["IDRotF", "Icewind Dale: Rime of the Frostmaiden", 2020, false],
    ["MM", "Monster Manual (2014)", 2014, false],
    ["XMM", "Monster Manual (2025)", 2025, true],
    ["ZZZ", "ZZZ", null, false],
  ]);
  assert.equal(parseFiveToolsArchiveIndex(index, { allow2024: true }).find((book) => book.code === "XMM").disabled, false);
  assert.deepEqual(parseFiveToolsArchiveIndex(null), []);
  assert.deepEqual(parseFiveToolsArchiveIndex(["MM"]), []);
});

test("i nomi dei libri: noti, sconosciuti, delle regole 2024", () => {
  assert.equal(fiveToolsBookLabel(fiveToolsBook("idrotf")), "Icewind Dale: Rime of the Frostmaiden (IDRotF)");
  assert.equal(fiveToolsBookLabel(fiveToolsBook("XPHB")), "Player's Handbook (2024) (XPHB) · regole 2024");
  assert.equal(fiveToolsBookLabel({ code: "HB" }), "HB");
  assert.equal(fiveToolsBook("VEoR").rules2024, false, "uscito a maggio 2024, regole 2014");
  assert.equal(fiveToolsBook("FRAiF").rules2024, true);
});

test("il file scaricato è il libro chiesto, o niente cache", () => {
  const book = { monster: [{ name: "Goblin", source: "MM" }, { name: "Bugbear", source: "MM" }] };
  assert.deepEqual(validateFiveToolsArchiveBook(book, "MM"), { ok: true, monsters: 2, error: "" });
  assert.equal(validateFiveToolsArchiveBook({ spell: [] }, "MM").error, "Il file scaricato non è un bestiario di 5eTools.");
  assert.equal(validateFiveToolsArchiveBook(book, "IDRotF").error, "Il file scaricato non contiene mostri di IDRotF.");
  const record = fiveToolsArchiveRecord({ code: "mm", file: "bestiary-mm.json", url: `${BASE}bestiary/bestiary-mm.json`, text: JSON.stringify(book), data: book, fetchedAt: 42 });
  assert.deepEqual({ ...record, data: undefined }, { version: 1, code: "MM", file: "bestiary-mm.json", url: `${BASE}bestiary/bestiary-mm.json`, fetchedAt: 42,
    bytes: JSON.stringify(book).length, monsters: 2, data: undefined });
  assert.throws(() => fiveToolsArchiveRecord({ code: "IDRotF", data: book }), /non contiene mostri di IDRotF/);
});

test("il libro della base di un mostro derivato, e le dimensioni per il pannello", () => {
  const books = parseFiveToolsArchiveIndex({ MM: "bestiary-mm.json", ToA: "bestiary-toa.json" });
  assert.equal(fiveToolsArchiveBookForSource(books, "toa").file, "bestiary-toa.json");
  assert.equal(fiveToolsArchiveBookForSource(books, "HB"), null);
  assert.deepEqual([162195, 1573606, 10].map(fiveToolsArchiveSizeLabel), ["158 KB", "1,5 MB", "1 KB"]);
});
