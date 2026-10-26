// Attacchi dei mostri, fase 4, lotto 5: la modalità Leggendario dallo statblock (D7: sul token e sugli omonimi senza
// modalità boss, mai sovrascritta né tolta) e i tratti da leggere nella scheda Capacità della console (D9).
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createVersionedIndexedDB } from "../test-support/fakeVersionedIndexedDb.js";
import { fiveToolsMonsterToStatblock, fiveToolsStatblockSections } from "../src/fiveToolsMonsterCore.js";
import { parseCharacterSheetImport } from "../src/characterSheetImportCore.js";
import { hasBossMode, monsterLegendaryOf, monsterLegendarySummary, planMonsterLegendary, setMonsterLegendary } from "../src/monsterLegendaryCore.js";
import { legendaryActionCost, pcAttackMonsterTraitEntries } from "../src/pcAttackMonsterTraitsCore.js";
import { createMonsterStatblockTextLoader } from "../src/monsterStatblockTextLoader.js";
import { createMonsterStatblockTextStore } from "../src/monsterStatblockTextStore.js";
import { monsterStatblockTextRecord } from "../src/monsterStatblockTextCore.js";

const META = "com.thebigpicture.initiative/meta";
const srd = JSON.parse(readFileSync(new URL("../test-support/fivetools-srd-monsters.json", import.meta.url), "utf8"));
const dragon = srd.monster.find((monster) => monster.name === "Adult Silver Dragon");
const creature = (id, name, meta = {}) => ({ id, name, type: "IMAGE", layer: "CHARACTER", metadata: { [META]: { inInitiative: true, ...meta } } });

test("lo statblock dice quante azioni e resistenze leggendarie; senza azioni leggendarie, niente modalità", () => {
  const { block, report } = fiveToolsMonsterToStatblock(dragon);
  assert.deepEqual(block.legendary, { actions: 3, resistances: 3 });
  assert.deepEqual(parseCharacterSheetImport(JSON.stringify(block)).legendary, { actions: 3, resistances: 3 });
  assert.ok(!report.some((line) => /leggendarie non/.test(line)));
  const twoActions = fiveToolsMonsterToStatblock({ ...dragon, legendaryActions: 2, trait: [{ name: "Legendary Resistance (1/Day in This Form)", entries: ["…"] }] });
  assert.deepEqual(twoActions.block.legendary, { actions: 2, resistances: 1 });
  assert.ok(twoActions.report.includes("Legendary Resistance (1/Day in This Form): il contatore vale per la forma importata"));
  const marut = fiveToolsMonsterToStatblock({ name: "Marut", source: "X", trait: [{ name: "Legendary Resistance (3/Day)", entries: ["…"] }], action: [] });
  assert.equal(marut.block.legendary, undefined);
  assert.ok(marut.report.includes("Legendary Resistance (3/Day) senza azioni leggendarie: le resistenze si tengono al tavolo"));
  assert.equal(monsterLegendaryOf({ legendary: { actions: 9, resistances: 9 } }).actions, 5, "the tracker's pips go up to 5");
  assert.equal(monsterLegendaryOf({ legendary: { resistances: 3 } }), null);
  assert.equal(parseCharacterSheetImport(JSON.stringify({ name: "PG", legendary: { actions: 3 } })).legendary, undefined, "only a monster's block");
});

test("il piano: il token e gli omonimi senza modalità boss; Leggendario, Paragon, Epic e personaggi restano come sono", () => {
  const items = [
    creature("d1", "Drago"), creature("d2", "(2) Drago"), creature("d3", "Drago", { legendary: { max: 3, current: 1 } }),
    creature("d4", "Drago", { paragon: { actions: 2 } }), creature("d5", "Drago", { epic: { enabled: 1 } }), creature("pc", "Drago", { attitude: "pc" }),
    creature("o", "Orco"),
  ];
  const plan = planMonsterLegendary({ items, sourceId: "d1", legendary: { actions: 3, resistances: 3 } });
  assert.deepEqual(plan.targetIds, ["d1", "d2"]);
  assert.deepEqual(plan.skipped.map((entry) => [entry.id, entry.reason]), [["d3", "boss"], ["d4", "boss"], ["d5", "boss"], ["pc", "pc"]]);
  assert.deepEqual(planMonsterLegendary({ items, sourceId: "d3", legendary: { actions: 3, resistances: 3 } }).targetIds, ["d1", "d2"]);
  assert.deepEqual(planMonsterLegendary({ items, sourceId: "d1", legendary: null }), { targetIds: [], skipped: [] });
  assert.equal(monsterLegendarySummary({ written: 2, skipped: plan.skipped }), "Leggendario attivato su 2 token. 3 token hanno già una modalità boss: invariati.");
});

test("la scrittura fonde i metadata e si ricontrolla sul draft: un token diventato boss nel frattempo resta com'è", () => {
  const item = creature("d1", "Drago", { hp: 200, hpMax: 256, conditions: ["prone"] });
  item.metadata.other = { keep: true };
  assert.equal(setMonsterLegendary(item, { actions: 3, resistances: 2 }), true);
  assert.deepEqual(item.metadata[META], { inInitiative: true, hp: 200, hpMax: 256, conditions: ["prone"],
    legendary: { max: 3, current: 3 }, legendaryResistances: { max: 2, current: 2 } });
  assert.deepEqual(item.metadata.other, { keep: true });
  assert.equal(hasBossMode(item), true);
  const spent = creature("d3", "Drago", { legendary: { max: 3, current: 1 }, legendaryResistances: { max: 3, current: 0 } });
  assert.equal(setMonsterLegendary(spent, { actions: 3, resistances: 3 }), false);
  assert.deepEqual(spent.metadata[META].legendary, { max: 3, current: 1 }, "spent pips are never given back");
  const noResistances = creature("x", "X");
  setMonsterLegendary(noResistances, { actions: 3, resistances: 0 });
  assert.deepEqual(noResistances.metadata[META].legendaryResistances, { max: 0, current: 0 }, "not the tracker's default of 3");
});

test("la scheda Capacità: tratti, reazioni e azioni leggendarie con il loro testo e il costo", () => {
  const view = fiveToolsStatblockSections(fiveToolsMonsterToStatblock({ ...dragon,
    reaction: [{ name: "Parry", entries: ["The dragon adds 3 to its AC against one melee attack."] }] }).monster);
  const entries = pcAttackMonsterTraitEntries(view);
  const byGroup = (group) => entries.filter((entry) => entry.group === group).map((entry) => [entry.label, entry.activation]);
  assert.deepEqual(byGroup("monster-trait")[0], ["Legendary Resistance (3/Day)", ""]);
  assert.deepEqual(byGroup("monster-reaction"), [["Parry", "reazione"]]);
  assert.deepEqual(byGroup("monster-legendary"), [["Detect", "leggendaria"], ["Tail Attack", "leggendaria"], ["Wing Attack (Costs 2 Actions)", "leggendaria (2)"]]);
  assert.ok(entries.every((entry) => entry.tab === "features" && entry.mode === "monster" && entry.text));
  assert.equal(new Set(entries.map((entry) => entry.key)).size, entries.length);
  assert.ok(!entries.some((entry) => /^Bite|^Claw/.test(entry.label)), "the actions stay in Attacchi");
  assert.equal(legendaryActionCost("Wing Attack (Costs 2 Actions)"), 2);
  assert.equal(legendaryActionCost("Detect"), 1);
  assert.deepEqual(pcAttackMonsterTraitEntries({ header: [], sections: [{ title: "", entries: [{ name: "", text: "testo incollato" }] }] })
    .map((entry) => [entry.label, entry.text]), [["Statblock", "testo incollato"]]);
  assert.deepEqual(pcAttackMonsterTraitEntries(null), []);
});

test("il lettore condiviso: una lettura per riferimento e revisione della scheda; una nuova scheda rilegge", async () => {
  // The console open while the sheet saves: it looked before the import, and reloads on every token change.
  const store = createMonsterStatblockTextStore({ indexedDB: createVersionedIndexedDB() });
  let reads = 0;
  const counted = { get: async (ref) => { reads += 1; return store.get(ref); }, put: (record) => store.put(record) };
  const consoleView = createMonsterStatblockTextLoader({ store: counted, archive: () => ({ allData: async () => [] }) });
  const sheet = createMonsterStatblockTextLoader({ store });
  assert.equal(await consoleView.view("Goblin|MM", { fromArchive: true, revision: "old" }), null);
  for (let index = 0; index < 5; index += 1) await consoleView.view("Goblin|MM", { fromArchive: true, revision: "old" });
  assert.equal(reads, 1, "the reloads on every token change read nothing");
  // The import keeps the record, then writes the card: its new revision reads again.
  await sheet.put(monsterStatblockTextRecord({ ref: "Goblin|MM", text: "uno" }, 1));
  assert.equal((await consoleView.view("Goblin|MM", { fromArchive: true, revision: "new" })).sections[0].entries[0].text, "uno");
  assert.equal(reads, 2);
  await sheet.view("Goblin|MM", { revision: "new" });
  await sheet.put(monsterStatblockTextRecord({ ref: "Goblin|MM", text: "due" }, 2));
  assert.equal((await sheet.view("Goblin|MM", { revision: "new" })).sections[0].entries[0].text, "due", "the page that saved reads its own record");
  const fromArchive = createMonsterStatblockTextLoader({ store: createMonsterStatblockTextStore({ indexedDB: createVersionedIndexedDB() }),
    archive: () => ({ allData: async () => [srd] }) });
  assert.equal((await fromArchive.view("Adult Silver Dragon|MM", { fromArchive: true })).sections[1].title, "Actions");
});
