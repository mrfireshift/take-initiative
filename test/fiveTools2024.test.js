// Attacchi dei mostri, fase 3, lotto 6: gli statblock 2024 opzionali. Spenti, tutto come prima (rifiutati); accesi
// dall'opzione di questo browser, si importano segnati «· 2024» e si giocano con le regole 2014 del plugin.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fiveToolsCollection, fiveToolsMonsterLabel, fiveToolsMonsterToStatblock, isFiveTools2024 } from "../src/fiveToolsMonsterCore.js";
import { normalizeOptionsPanelDraft, buildOptionsPanelPatches } from "../src/options/optionsPanelCore.js";
import { resolveOptions } from "../src/options/optionsResolve.js";
import { selectFiveTools2024 } from "../src/options/optionsSelectors.js";

// A short 2024 block, written for the test: the 2024 tags, the 2025 Monster Manual's code.
const warrior = { name: "Test Warrior", source: "XMM", ac: [15], hp: { average: 10, formula: "3d6" },
  action: [{ name: "Scimitar", entries: ["{@atkr m} {@hit 4}, reach 5 ft. {@h}5 ({@damage 1d6 + 2}) Slashing damage."] }] };
const chief = { name: "Test Chief", source: "HOMEBREW", _copy: { name: "Test Warrior", source: "XMM" } };
const goblin = { name: "Goblin", source: "MM", ac: [15], hp: { average: 7 },
  action: [{ name: "Scimitar", entries: ["{@atk mw} {@hit 4} to hit, reach 5 ft., one target. {@h}5 ({@damage 1d6 + 2}) slashing damage."] }] };

test("spenti: un mostro 2024 e un derivato da una base 2024 restano rifiutati", () => {
  assert.equal(isFiveTools2024(warrior), true);
  assert.match(fiveToolsMonsterToStatblock(warrior).error, /regole 2024/);
  assert.match(fiveToolsMonsterToStatblock(chief, { pool: [warrior] }).error, /deriva da Test Warrior \(XMM\), un mostro delle regole 2024/);
  const collection = fiveToolsCollection([{ monster: [warrior, goblin] }]);
  assert.deepEqual([collection.monsters.map((monster) => monster.name), collection.excluded2024], [["Goblin"], 1]);
});

test("accesi: il mostro 2024 si importa, il rapporto dice che le regole restano 2014; l'elenco lo segna «· 2024»", () => {
  const converted = fiveToolsMonsterToStatblock(warrior, { allow2024: true });
  assert.equal(converted.error, "");
  assert.equal(converted.block.name, "Test Warrior");
  assert.equal(converted.report[0], "regole 2024: condizioni e regole del tracker restano quelle del 2014");
  const derived = fiveToolsMonsterToStatblock(chief, { pool: [warrior], allow2024: true });
  assert.equal(derived.error, "");
  assert.ok(derived.report.includes("regole 2024: condizioni e regole del tracker restano quelle del 2014"), "derived from a 2024 base");
  const collection = fiveToolsCollection([{ monster: [warrior, goblin] }], { allow2024: true });
  assert.deepEqual([collection.monsters.map((monster) => monster.name), collection.excluded2024], [["Goblin", "Test Warrior"], 0]);
  assert.equal(fiveToolsMonsterLabel(warrior), "Test Warrior (XMM) · 2024");
  assert.equal(fiveToolsMonsterLabel(goblin), "Goblin (MM)");
  assert.ok(!fiveToolsMonsterToStatblock(goblin, { allow2024: true }).report.some((line) => /regole 2024/.test(line)), "a 2014 monster says nothing");
});

test("l'opzione «Statblock 2024»: di questo browser, spenta di default, una casella nel pannello Opzioni", () => {
  assert.equal(selectFiveTools2024(resolveOptions({ local: {}, room: {}, scene: {} })), false);
  assert.equal(selectFiveTools2024(resolveOptions({ local: { tools: { fiveTools2024: true } }, room: {}, scene: {} })), true);
  assert.equal(selectFiveTools2024(resolveOptions({ local: { tools: { fiveTools2024: "sì" } }, room: {}, scene: {} })), false, "only true turns it on");
  const draft = normalizeOptionsPanelDraft({ local: { fiveTools2024: true } });
  assert.equal(buildOptionsPanelPatches(draft).local.tools.fiveTools2024, true);
  assert.match(readFileSync(new URL("../options-modal.html", import.meta.url), "utf8"), /type="checkbox" data-local="fiveTools2024"/);
});

// Sotto-lotto 2: i tag 2024 come li stampa il Monster Manual 2025, nel testo dell'adapter e in quello delle regole;
// lo statblock originale di un mostro 2024 con iniziativa, incantesimi al loro posto e leggendarie della tana.
import { fiveToolsPlainText, fiveToolsStatblockSections } from "../src/fiveToolsMonsterCore.js";
import { fiveTools2024TagText, monsterActionPlainText } from "../src/monsterActionHeuristicsCore.js";

test("i tag 2024 in chiaro: tiro per colpire, tiro salvezza, fallimenti, successo, innesco e risposta", () => {
  assert.deepEqual(["m", "r", "m,r"].map((kind) => fiveTools2024TagText("atkr", [kind])), ["Melee Attack Roll:", "Ranged Attack Roll:", "Melee or Ranged Attack Roll:"]);
  assert.equal(fiveTools2024TagText("actSave", ["wis"]), "Wisdom Saving Throw:");
  assert.deepEqual([[], ["1"], ["2"]].map((parts) => fiveTools2024TagText("actSaveFail", parts)), ["Failure:", "First Failure:", "Second Failure:"]);
  assert.equal(fiveTools2024TagText("actSaveFailBy", ["5"]), "Failure by 5 or More:");
  assert.deepEqual(["actSaveSuccess", "actSaveSuccessOrFail", "actTrigger", "actResponse", "hom"].map((tag) => fiveTools2024TagText(tag)),
    ["Success:", "Failure or Success:", "Trigger:", "Response:", "Hit or Miss:"]);
  assert.equal(fiveTools2024TagText("spell", ["Fireball|XPHB"]), null);
  const breath = "{@actSave dex} {@dc 21}, each creature in a 60-foot {@variantrule Cone [Area of Effect]|XPHB|Cone}. {@actSaveFail} 59 ({@damage 17d6}) Fire damage. {@actSaveSuccess} Half damage.";
  const printed = "Dexterity Saving Throw: DC 21, each creature in a 60-foot Cone. Failure: 59 (17d6) Fire damage. Success: Half damage.";
  assert.equal(fiveToolsPlainText(breath), printed);
  assert.equal(monsterActionPlainText(breath), printed, "one table for the adapter and the rules");
  assert.equal(fiveToolsPlainText("{@atkr m} {@hit 4}, reach 5 ft. {@h}5 ({@damage 1d6 + 2}) Slashing damage. {@condition Poisoned|XPHB}"),
    "Melee Attack Roll: +4, reach 5 ft. Hit: 5 (1d6 + 2) Slashing damage. Poisoned");
});

test("lo statblock originale 2024: iniziativa, incantesimi tra azioni, azioni bonus e reazioni, leggendarie della tana", () => {
  const archmage = { name: "Test Archmage", source: "XMM", size: ["M"], type: "humanoid", alignment: ["N"], ac: [17], hp: { average: 170, formula: "31d8 + 31" },
    str: 10, dex: 14, con: 12, int: 20, wis: 15, cha: 16, initiative: { proficiency: 1 }, cr: "12", passive: 12,
    action: [{ name: "Arcane Burst", entries: ["{@atkr m,r} {@hit 9}, reach 5 ft. or range 150 ft. {@h}27 ({@damage 4d10 + 5}) Force damage."] }],
    spellcasting: [
      { name: "Spellcasting", type: "spellcasting", headerEntries: ["The archmage casts one of the following spells (spell save {@dc 17}):"],
        will: ["{@spell Light|XPHB}"], daily: { "1e": ["{@spell Teleport|XPHB}"] }, ability: "int", displayAs: "action" },
      { name: "Misty Step (3/Day)", type: "spellcasting", headerEntries: ["The archmage casts {@spell Misty Step|XPHB}."], daily: { 3: ["{@spell Misty Step|XPHB}"] },
        ability: "int", displayAs: "bonus", hidden: ["daily"] },
      { name: "Protective Magic (3/Day)", type: "spellcasting", headerEntries: ["The archmage casts {@spell Shield|XPHB} in response to the spell's trigger."],
        daily: { 3: ["{@spell Shield|XPHB}"] }, ability: "int", displayAs: "reaction", hidden: ["daily"] },
    ],
    legendary: [{ name: "Blink", entries: ["The archmage teleports up to 30 feet."] }], legendaryActionsLair: 4 };
  const { header, sections } = fiveToolsStatblockSections(archmage);
  assert.equal(header.find((row) => row.label === "Initiative").text, "+6 (16)", "+2 Dexterity, +4 proficiency of CR 12");
  const titled = Object.fromEntries(sections.map((section) => [section.title, section.entries.map((entry) => entry.name)]));
  assert.deepEqual(titled.Actions, ["Arcane Burst", "Spellcasting"]);
  assert.deepEqual(titled["Bonus Actions"], ["Misty Step (3/Day)"]);
  assert.deepEqual(titled.Reactions, ["Protective Magic (3/Day)"]);
  assert.equal(sections.find((section) => section.title === "Bonus Actions").entries[0].text, "The archmage casts Misty Step.", "the hidden list is not printed");
  assert.match(sections.find((section) => section.title === "Legendary Actions").entries[0].text, /^Legendary Action Uses: 3 \(4 in Lair\)\. Immediately after another creature's turn/);
  assert.match(sections.find((section) => section.title === "Actions").entries[0].text, /^Melee or Ranged Attack Roll: \+9, reach 5 ft\. or range 150 ft\. Hit: 27/);
  // A 2014 monster keeps its own layout: no Initiative row, the 2014 legendary opening.
  const old = fiveToolsStatblockSections({ ...archmage, source: "MM", spellcasting: [], action: [], legendary: [{ name: "Blink", entries: ["x"] }] });
  assert.equal(old.header.some((row) => row.label === "Initiative"), false);
  assert.match(old.sections.find((section) => section.title === "Legendary Actions").entries[0].text, /^The test archmage can take 3 legendary actions/);
});
