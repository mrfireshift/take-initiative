// Attacchi dei mostri, fase 4, lotto 4b: il testo integrale dello statblock, nella memoria del browser del GM, letto
// nella tab Statistiche della scheda di un PNG.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createVersionedIndexedDB } from "../test-support/fakeVersionedIndexedDb.js";
import { fiveToolsMonsterToStatblock, fiveToolsSpellName, fiveToolsStatblockSections } from "../src/fiveToolsMonsterCore.js";
import { monsterStatblockTextRecord, monsterStatblockTextRef, monsterStatblockTextView, MAX_MONSTER_STATBLOCK_TEXT } from "../src/monsterStatblockTextCore.js";
import { createMonsterStatblockTextStore } from "../src/monsterStatblockTextStore.js";
import { monsterImportRef } from "../src/monsterStatblockImportCore.js";

const srd = JSON.parse(readFileSync(new URL("../test-support/fivetools-srd-monsters.json", import.meta.url), "utf8"));
const goblin = srd.monster.find((monster) => monster.name === "Goblin");

test("lo statblock come lo stampa 5eTools: intestazione, tratti, azioni; i tag in chiaro", () => {
  // The fixture keeps the SRD goblin's numbers; its type line comes from the book's fields.
  const { monster } = fiveToolsMonsterToStatblock({ ...goblin, size: ["S"], type: { type: "humanoid", tags: ["goblinoid"] }, alignment: ["N", "E"],
    senses: ["darkvision 60 ft."] });
  const { header, sections } = fiveToolsStatblockSections(monster);
  const line = (label) => header.find((row) => row.label === label)?.text;
  assert.match(header[0].text, /^Small humanoid \(goblinoid\), neutral evil$/);
  assert.equal(line("Hit Points"), "7 (2d6)");
  assert.match(line("Armor Class"), /^15 \(leather armor, shield\)$/);
  assert.ok(header.some((row) => row.text.startsWith("STR 8 (−1)  DEX 14 (+2)")));
  assert.match(line("Senses"), /passive Perception 9$/);
  const actions = sections.find((section) => section.title === "Actions").entries;
  assert.equal(actions[0].name, "Scimitar");
  assert.match(actions[0].text, /^Melee Weapon Attack: \+4 to hit, reach 5 ft\., one target\. Hit: 5 \(1d6 \+ 2\) slashing damage\.$/);
  assert.ok(!JSON.stringify(sections).includes("{@"), "no 5eTools tag left");
});

test("incantesimi, leggendarie e voci nascoste: come nel libro", () => {
  const caster = { name: "Archmage", source: "X", legendary: [{ name: "Cantrip", entries: ["The archmage casts a cantrip."] }],
    spellcasting: [{ name: "Spellcasting", headerEntries: ["The archmage is an 18th-level spellcaster."],
      spells: { 0: { spells: ["{@spell fire bolt}"] }, 1: { slots: 4, spells: ["{@spell shield}*"] } },
      will: ["{@spell detect magic}", { entry: "{@spell mage hand}", hidden: true }], daily: { "1e": ["{@spell fly}"] }, footerEntries: ["*Cast before combat."] }] };
  const { sections } = fiveToolsStatblockSections(caster);
  const spellcasting = sections[0].entries[0];
  assert.equal(spellcasting.text, "The archmage is an 18th-level spellcaster.\nCantrips (at will): fire bolt\n1st level (4 slots): shield*\nAt will: detect magic\n1/day each: fly\n*Cast before combat.");
  const legendary = sections.find((section) => section.title === "Legendary Actions").entries;
  assert.match(legendary[0].text, /^The archmage can take 3 legendary actions/);
  assert.equal(fiveToolsSpellName({ entry: "{@spell mage hand}", hidden: true }), "mage hand", "a hidden spell is still cast");
});

test("il record: per riferimento, il mostro di 5eTools o il testo incollato; mai vuoto o enorme", () => {
  const { monster } = fiveToolsMonsterToStatblock(goblin);
  const record = monsterStatblockTextRecord({ ref: "Goblin|MM", name: "Goblin", fiveTools: monster }, 5);
  assert.deepEqual([record.key, record.kind, record.savedAt], ["goblin|mm", "5etools", 5]);
  assert.equal(monsterStatblockTextView(record).sections[1].title, "Actions");
  const pasted = monsterStatblockTextRecord({ ref: "Capo goblin|testo", text: "  Capo goblin\r\nCA 17  " });
  assert.deepEqual(monsterStatblockTextView(pasted), { header: [], sections: [{ title: "", entries: [{ name: "", text: "Capo goblin\nCA 17" }] }] });
  assert.equal(monsterStatblockTextRecord({ ref: "x|testo", text: "y".repeat(MAX_MONSTER_STATBLOCK_TEXT + 50) }).data.length, MAX_MONSTER_STATBLOCK_TEXT);
  assert.equal(monsterStatblockTextRecord({ ref: "", text: "testo" }), null);
  assert.equal(monsterStatblockTextRecord({ ref: "x|y" }), null);
  assert.equal(monsterStatblockTextRecord({ ref: "x|y", fiveTools: { blob: "z".repeat(70000) } }), null);
});

test("il formato del plugin con il testo prende un riferimento dal nome", () => {
  assert.equal(monsterImportRef({ kind: "monster", name: "Capo goblin", text: "..." }), "Capo goblin|testo");
  assert.equal(monsterImportRef({ kind: "monster", name: "Capo goblin" }), "");
  assert.equal(monsterImportRef({ kind: "monster", name: "Goblin", ref: "Goblin|MM", text: "..." }), "Goblin|MM");
});

test("solo la scheda di un PNG (alleato, neutrale, nemico), solo per il GM", () => {
  const card = { monster: { source: "5etools", ref: "Goblin|MM" } };
  for (const attitude of ["enemy", "neutral", "ally", ""]) assert.equal(monsterStatblockTextRef({ isGM: true, attitude, card }), "Goblin|MM", attitude);
  assert.equal(monsterStatblockTextRef({ isGM: true, attitude: "pc", card }), "");
  assert.equal(monsterStatblockTextRef({ isGM: false, attitude: "enemy", card }), "");
  assert.equal(monsterStatblockTextRef({ isGM: true, attitude: "enemy", card: { armorClass: 12 } }), "");
});

test("la memoria del browser: salva, rilegge per riferimento, l'ultimo import vince; senza IndexedDB solo per la sessione", async () => {
  const store = createMonsterStatblockTextStore({ indexedDB: createVersionedIndexedDB() });
  const first = monsterStatblockTextRecord({ ref: "Goblin|MM", text: "uno" });
  assert.deepEqual(await store.put(first), { persisted: true, reason: "" });
  await store.put(monsterStatblockTextRecord({ ref: "goblin|mm", text: "due" }));
  assert.equal((await store.get("GOBLIN|MM")).data, "due");
  assert.equal(await store.get("Orc|MM"), null);
  const offline = createMonsterStatblockTextStore({ indexedDB: null });
  const kept = await offline.put(first);
  assert.equal(kept.persisted, false);
  assert.equal((await offline.get("Goblin|MM")).data, "uno");
  await assert.rejects(store.put({ key: "x" }));
});
