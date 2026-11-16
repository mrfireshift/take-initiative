// Trasformazioni, «Altra forma…» (lotto W2a, ritocco del 16/11/2026): la ricerca legge l'archivio 5eTools del browser a ogni
// apertura del pannello, quindi un libro aggiunto dalla scheda («Archivio online») con la console aperta compare alla
// riapertura, senza chiudere la console. Le creature sono finte, con solo tipo, GS, taglia e velocità.
import assert from "node:assert/strict";
import test from "node:test";
import { createBossActionsDocument, textOf } from "../test-support/fakeBossActionsDom.js";
import { createVersionedIndexedDB } from "../test-support/fakeVersionedIndexedDb.js";
import { fiveToolsArchiveRecord } from "../src/fiveToolsArchiveCore.js";
import { createFiveToolsArchiveStore } from "../src/fiveToolsArchiveStore.js";
import { transformationFormField } from "../src/pcAttackTransformationField.js";

const beast = (name, source, cr, size) => ({ name, source, type: "beast", cr, size: [size], speed: { walk: 40 } });
const book = (code, monsters) => fiveToolsArchiveRecord({
  code, file: `bestiary-${code.toLowerCase()}.json`, url: `https://archivio.example/data/bestiary/bestiary-${code.toLowerCase()}.json`,
  text: "{}", data: { monster: monsters }, fetchedAt: 1000,
});

async function until(check, label) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  assert.fail(`non è successo: ${label}`);
}

test("un libro aggiunto all'archivio con la console aperta compare alla riapertura di «Altra forma…»", async (t) => {
  const previous = globalThis.indexedDB;
  globalThis.indexedDB = createVersionedIndexedDB();
  t.after(() => { globalThis.indexedDB = previous; });
  const store = createFiveToolsArchiveStore();
  await store.put(book("MM", [beast("Cat", "MM", "0", "T")]));

  const documentRef = createBossActionsDocument();
  const container = documentRef.createElement("div");
  const values = {};
  // Druido di 8° livello senza Circolo della Luna: bestie fino a GS 1.
  const field = { type: "transformation-form", label: "Forma", context: { kind: "wild-shape", druidLevel: 8, circle: "" } };
  const render = () => container.replaceChildren(transformationFormField({ documentRef, field, values, rerender: render }));
  const button = (label) => container.querySelectorAll("BUTTON").find((node) => node.textContent === label);
  const search = async (text) => {
    const input = container.querySelector("INPUT");
    input.value = text;
    await input.emit("input");
  };
  render();

  await button("Altra forma…").click();
  await search("cat");
  await until(() => textOf(container).includes("Cat · GS 0 (MM)"), "la forma del MM nei risultati");

  // Il GM aggiunge un libro dalla scheda mentre la console è aperta.
  await store.put(book("VGM", [beast("Cow", "VGM", "1/4", "L")]));
  await button("Chiudi").click();
  await button("Altra forma…").click();
  await search("vgm");
  await until(() => textOf(container).includes("Cow · GS 1/4 (VGM)"), "la forma del libro nuovo nei risultati");
});

test("«Altra forma…» da un token nella stanza: il record dell'archivio se la card lo nomina, la card altrimenti", async (t) => {
  const previous = globalThis.indexedDB;
  globalThis.indexedDB = createVersionedIndexedDB();
  t.after(() => { globalThis.indexedDB = previous; });
  await createFiveToolsArchiveStore().put(book("MM", [{ ...beast("Cat", "MM", "0", "T"), hp: { average: 2 }, ac: [12] }]));
  const META = "com.thebigpicture.initiative/meta";
  const creatures = [
    { id: "druid", name: "Ilse", metadata: { [META]: { hp: 20, hpMax: 20, initiativeCard: {} } } },
    { id: "c1", name: "Micio", metadata: { [META]: { hp: 2, hpMax: 2, initiativeCard: { monster: { source: "5etools", ref: "Cat|MM" } } } } },
    { id: "r1", name: "Topo", metadata: { [META]: { hp: 1, hpMax: 1, initiativeCard: { armorClass: 10, monster: { source: "manual" } } } } },
  ];
  const documentRef = createBossActionsDocument();
  const container = documentRef.createElement("div");
  const values = {};
  const field = { type: "transformation-form", label: "Forma", context: { kind: "wild-shape", druidLevel: 8, circle: "" } };
  const render = () => container.replaceChildren(transformationFormField({ documentRef, field, values, item: creatures[0], creatures, rerender: render }));
  render();
  await container.querySelectorAll("BUTTON").find((node) => node.textContent === "Altra forma…").click();
  const pick = () => container.querySelectorAll("SELECT").find((node) => node.getAttribute("aria-label") === "Forma da un token nella stanza");
  assert.deepEqual(pick().children.map((option) => option.textContent), ["Da un token nella stanza…", "Micio (5eTools)", "Topo"]);
  pick().value = "c1";
  await pick().emit("change");
  await until(() => textOf(container).includes("Cat (bestia, GS 0)"), "la forma del gatto dall'archivio");
  pick().value = "r1";
  await pick().emit("change");
  await until(() => textOf(container).includes("Topo"), "la forma del topo dalla card");
  assert.ok(container.querySelectorAll("SELECT").some((node) => node.children.some((option) => option.textContent === "Tipo…")),
    "the type to fill in, as for a pasted text");
});
