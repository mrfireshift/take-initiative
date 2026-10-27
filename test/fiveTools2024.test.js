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

// Sotto-lotto 3: gli attacchi 2024. L'intestazione «{@atkr m} {@hit 7}, reach 5 ft.», i tipi con l'iniziale maiuscola,
// le condizioni «has the X condition» al colpo con la loro durata, la presa 2024; i danni solo in certi casi nella nota (D4).
import { importedMonsterActions } from "../src/monsterStatblockImportCore.js";
import { sanitizeQuickAction } from "../src/quickActionsCore.js";

const assassin = { name: "Test Assassin", source: "XMM", ac: [16], hp: { average: 97 }, action: [
  { name: "Shortsword", entries: ["{@atkr m} {@hit 7}, reach 5 ft. {@h}7 ({@damage 1d6 + 4}) Piercing damage plus 17 ({@damage 5d6}) Poison damage, and the target has the {@condition Poisoned|XPHB} condition until the start of the assassin's next turn."] },
  { name: "Rapier", entries: ["{@atkr m} {@hit 5}, reach 5 ft. {@h}6 ({@damage 1d8 + 2}) Piercing damage plus 7 ({@damage 2d6}) Piercing damage if the attack roll had Advantage."] },
  { name: "Tentacle", entries: ["{@atkr m} {@hit 7}, reach 10 ft. {@h}7 ({@damage 1d6 + 4}) Slashing damage. The target has the {@condition Grappled|XPHB} condition (escape {@dc 14}), and it has the {@condition Restrained|XPHB} condition until the grapple ends."] },
  { name: "Gore", entries: ["{@atkr m} {@hit 6}, reach 5 ft. {@h}9 ({@damage 2d6 + 2}) Piercing damage. If the target is a Large or smaller creature and the bull moved 20+ feet straight toward it immediately before the hit, the target has the {@condition Prone|XPHB} condition."] },
  { name: "Longbow", entries: ["{@atkr r} {@hit 4}, range 150/600 ft. {@h}6 ({@damage 1d8 + 2}) Piercing damage."] },
  { name: "Hand Crossbow", entries: ["{@atkr m,r} {@hit 6} to hit, reach 5 ft. or range 30/120 ft. {@h}5 ({@damage 1d6 + 3}) Piercing damage."] },
] };
const cardsOf = (block) => importedMonsterActions(block, { resolveDamageType: (type) => type, resolveAbility: (value) => value, unresolved: [] })
  .attacks.map((fields) => sanitizeQuickAction({ id: fields.label, ...fields }));

test("attacchi 2024: intestazione, gittata, tipi in minuscolo; la condizione al colpo con la sua durata arriva alla scheda", () => {
  const block = fiveToolsMonsterToStatblock(assassin, { allow2024: true }).block;
  const byName = Object.fromEntries(block.actions.map((action) => [action.name, action]));
  assert.deepEqual([byName.Shortsword.attack, byName.Shortsword.damage], [{ bonus: 7, type: "melee", reach: 5 },
    [{ type: "piercing", formula: "1d6+4" }, { type: "poison", formula: "5d6" }]]);
  assert.deepEqual(byName.Shortsword.onHit, { conditions: ["poisoned"], duration: { until: "turn-start", anchor: "source" } });
  assert.equal(byName.Shortsword.note, undefined, "the condition is played: nothing left to read");
  assert.deepEqual(byName.Longbow.attack, { bonus: 4, type: "ranged", range: { normal: 150, long: 600 } });
  assert.equal(byName["Hand Crossbow"].attack.reach, 5);
  // D4: the damage only with Advantage stays in the note, never added.
  assert.deepEqual(byName.Rapier.damage, [{ type: "piercing", formula: "1d8+2" }]);
  assert.match(byName.Rapier.note, /if the attack roll had Advantage/);
  assert.deepEqual(byName.Tentacle.onHit, { grapple: { escapeDC: 14, conditions: ["restrained"] } });
  // Prone only after a charge: the table judges it.
  assert.equal(byName.Gore.onHit, undefined);
  assert.match(byName.Gore.note, /has the Prone condition/);
  const cards = Object.fromEntries(cardsOf(block).map((card) => [card.label, card]));
  assert.deepEqual(cards.Shortsword.onHit, { apply: { condition: "Avvelenato", until: "turn-start", anchor: "source" } });
  assert.deepEqual(cards.Tentacle.onHit, { grapple: { escapeDC: 14, restrained: true } });
});

test("attacchi 2024: «feet» per esteso, condizioni al plurale; ciò che dura finché si è afferrati resta della presa", () => {
  const block = fiveToolsMonsterToStatblock({ name: "Test Giant", source: "XMM", ac: [16], hp: { average: 230 }, action: [
    { name: "Thunderbolt", entries: ["{@atkr r} {@hit 14}, range 500 feet. {@h}22 ({@damage 2d12 + 9}) Lightning damage, and the target has the {@condition Blinded|XPHB} and {@condition Deafened|XPHB} conditions until the start of the giant's next turn."] },
    { name: "Handaxe", entries: ["{@atkr m,r} {@hit 7}, reach 5 ft or range 20/60 ft. {@h}14 ({@damage 3d6 + 4}) Slashing damage."] },
    { name: "Smother", entries: ["{@atkr m} {@hit 5}, reach 5 ft. {@h}10 ({@damage 2d6 + 3}) Bludgeoning damage. The target has the {@condition Grappled|XPHB} condition (escape {@dc 13}). Until the grapple ends, the target has the {@condition Blinded|XPHB} and {@condition Restrained|XPHB} conditions."] },
    { name: "Dust", entries: ["{@atkr r} {@hit 5}, range 60 ft. {@h}The target has the {@condition Charmed|XPHB} or {@condition Poisoned|XPHB} condition (pixie's choice) until the start of the pixie's next turn."] },
  ] }, { allow2024: true }).block;
  const byName = Object.fromEntries(block.actions.map((action) => [action.name, action]));
  assert.deepEqual(byName.Thunderbolt.attack, { bonus: 14, type: "ranged", range: { normal: 500 } });
  assert.deepEqual(byName.Thunderbolt.onHit, { conditions: ["blinded", "deafened"], duration: { until: "turn-start", anchor: "source" } });
  assert.deepEqual(byName.Handaxe.attack, { bonus: 7, type: "melee", reach: 5, range: { normal: 20, long: 60 } });
  // Never Restrained for good: the card plays restrained while held, the blindness stays to read.
  assert.deepEqual(byName.Smother.onHit, { grapple: { escapeDC: 13, conditions: ["blinded", "restrained"] } });
  assert.match(byName.Smother.note, /Blinded and Restrained conditions/);
  assert.equal(byName.Dust, undefined, "no damage and a choice: the table's, from the block's text");
});

test("nel 2014 le condizioni dirette non si leggono; la presa prende «restrained until the grapple ends»", () => {
  const block = fiveToolsMonsterToStatblock({ name: "Test Canoloth", source: "MTF", ac: [16], hp: { average: 120 }, action: [
    { name: "Tongue", entries: ["{@atk mw} {@hit 9} to hit, reach 30 ft., one target. {@h}17 ({@damage 2d12 + 4}) piercing damage. If the target is Medium or smaller, it is {@condition grappled} (escape {@dc 15}), pulled up to 30 feet toward the canoloth, and is {@condition restrained} until the grapple ends."] },
    { name: "Tentacles", entries: ["{@atk mw} {@hit 6} to hit, reach 5 ft., one target. {@h}4 ({@damage 1d4 + 2}) poison damage, and the target must succeed on a {@dc 13} Constitution saving throw or be {@condition poisoned} for 1 minute. Until this poison ends, the target is {@condition paralyzed}."] },
  ] }).block;
  const byName = Object.fromEntries(block.actions.map((action) => [action.name, action]));
  assert.deepEqual(byName.Tongue.onHit, { grapple: { escapeDC: 15, conditions: ["restrained"] } });
  assert.equal(byName.Tentacles.onHit.conditions, undefined, "the paralysis follows the save: never a condition of its own");
});
