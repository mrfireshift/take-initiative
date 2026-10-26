// Attacchi dei mostri, fase 3, lotto 2: i libri dell'archivio di 5eTools nell'IndexedDB del browser del GM.
import assert from "node:assert/strict";
import test from "node:test";
import { createVersionedIndexedDB } from "../test-support/fakeVersionedIndexedDb.js";
import { createFiveToolsArchiveStore, fiveToolsArchiveErrorText } from "../src/fiveToolsArchiveStore.js";
import { fiveToolsArchiveRecord } from "../src/fiveToolsArchiveCore.js";

const book = (code, names) => fiveToolsArchiveRecord({ code, file: `bestiary-${code.toLowerCase()}.json`, url: `https://archivio.example/data/bestiary/bestiary-${code.toLowerCase()}.json`,
  text: "x".repeat(2048), data: { monster: names.map((name) => ({ name, source: code })) }, fetchedAt: 1000 });

test("salvare, elencare senza leggere i file, rileggere con il file, rimuovere", async () => {
  const store = createFiveToolsArchiveStore({ indexedDB: createVersionedIndexedDB() });
  assert.deepEqual(await store.put(book("MM", ["Goblin", "Ghoul"])), { persisted: true, reason: "" });
  assert.deepEqual(await store.put(book("IDRotF", ["Snowy Owlbear"])), { persisted: true, reason: "" });
  const list = await store.list();
  assert.deepEqual(list.map((entry) => [entry.code, entry.monsters, entry.bytes, entry.persisted, Object.hasOwn(entry, "data")]),
    [["IDRotF", 1, 2048, true, false], ["MM", 2, 2048, true, false]]);
  const mm = await store.get("mm");
  assert.deepEqual(mm.data.monster.map((monster) => monster.name), ["Goblin", "Ghoul"]);
  assert.equal(mm.persisted, true);
  assert.equal((await store.allData()).length, 2);
  await store.remove("MM");
  assert.deepEqual((await store.list()).map((entry) => entry.code), ["IDRotF"]);
  assert.equal(await store.get("MM"), null);
});

test("un libro riscaricato prende il posto del vecchio", async () => {
  const store = createFiveToolsArchiveStore({ indexedDB: createVersionedIndexedDB() });
  await store.put(book("MM", ["Goblin"]));
  await store.put({ ...book("MM", ["Goblin", "Orc"]), fetchedAt: 2000 });
  const [entry] = await store.list();
  assert.deepEqual([entry.monsters, entry.fetchedAt], [2, 2000]);
});

test("i libri restano tra due aperture dello stesso browser", async () => {
  const indexedDB = createVersionedIndexedDB();
  await createFiveToolsArchiveStore({ indexedDB }).put(book("MM", ["Goblin"]));
  assert.deepEqual((await createFiveToolsArchiveStore({ indexedDB }).list()).map((entry) => entry.code), ["MM"]);
});

test("senza IndexedDB (finestra in incognito) il libro vale per la sessione e il motivo si dice", async () => {
  const store = createFiveToolsArchiveStore({ indexedDB: null });
  assert.deepEqual(await store.put(book("MM", ["Goblin"])), { persisted: false, reason: "memoria del browser non disponibile" });
  const [entry] = await store.list();
  assert.deepEqual([entry.code, entry.persisted], ["MM", false]);
  assert.equal((await store.get("MM")).data.monster[0].name, "Goblin");
  await store.remove("MM");
  assert.deepEqual(await store.list(), []);
});

test("spazio esaurito: il libro resta per la sessione; il messaggio dice perché", async () => {
  const quota = Object.assign(new Error("The quota has been exceeded."), { name: "QuotaExceededError" });
  const later = (request, value) => { setTimeout(() => { request.result = value; request.onsuccess?.(); }); return request; };
  // An IndexedDB that opens and reads, but refuses every write for lack of space.
  const full = { objectStoreNames: { contains: () => true },
    transaction(_names, mode) {
      if (mode === "readwrite") throw quota;
      return { objectStore: () => ({ getAll: () => later({}, []), get: () => later({}, undefined) }) };
    } };
  const store = createFiveToolsArchiveStore({ indexedDB: { open: () => later({}, full) } });
  assert.deepEqual(await store.put(book("MM", ["Goblin"])), { persisted: false, reason: "spazio del browser esaurito" });
  assert.deepEqual((await store.list()).map((entry) => [entry.code, entry.persisted]), [["MM", false]]);
  assert.equal((await store.get("MM")).data.monster[0].name, "Goblin");
  assert.equal(fiveToolsArchiveErrorText(new Error("boom")), "boom");
});

test("un record non valido non si salva", async () => {
  const store = createFiveToolsArchiveStore({ indexedDB: createVersionedIndexedDB() });
  await assert.rejects(store.put({ code: "MM", data: {} }), /Libro dell'archivio non valido/);
  await assert.rejects(store.put({ ...book("MM", ["Goblin"]), version: 99 }), /non valido/);
});
