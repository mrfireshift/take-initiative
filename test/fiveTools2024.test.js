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

// Sotto-lotto 4: le azioni a TS 2024. «{@actSave dex} {@dc 21}, each creature in a 60-foot Cone. {@actSaveFail} …
// {@actSaveSuccess} Half damage.»: TS, CD, area, danni e condizioni del fallimento, metà al successo, tiro ripetuto,
// immunità; un secondo fallimento, «Failure or Success:» e le frasi non capite restano nella nota.
const tyrant = { name: "Test Tyrant", source: "XMM", ac: [18], hp: { average: 180 }, action: [
  { name: "Fire Breath {@recharge 5}", entries: ["{@actSave dex} {@dc 21}, each creature in a 60-foot {@variantrule Cone [Area of Effect]|XPHB|Cone}. {@actSaveFail} 59 ({@damage 17d6}) Fire damage. {@actSaveSuccess} Half damage."] },
  { name: "Lightning Breath", entries: ["{@actSave dex} {@dc 19}, each creature in a 90-foot-long, 5-foot-wide {@variantrule Line [Area of Effect]|XPHB|Line}. {@actSaveFail} 60 ({@damage 11d10}) Lightning damage. {@actSaveSuccess} Half damage."] },
  { name: "Mind Blast", entries: ["{@actSave int} {@dc 15}, each creature in a 60-foot {@variantrule Cone [Area of Effect]|XPHB|Cone}. {@actSaveFail} 31 ({@damage 6d8 + 4}) Psychic damage, and the target has the {@condition Stunned|XPHB} condition until the end of the mind flayer's next turn. {@actSaveSuccess} Half damage only."] },
  { name: "Moan", entries: ["{@actSave wis} {@dc 13}, each creature in a 60-foot {@variantrule Emanation [Area of Effect]|XPHB|Emanation} originating from the cloaker. {@actSaveFail} The target has the {@condition Frightened|XPHB} condition until the end of the cloaker's next turn. {@actSaveSuccess} The target is immune to this cloaker's Moan for 24 hours."] },
  { name: "Spores", entries: ["{@actSave con} {@dc 11}, each creature in a 20-foot {@variantrule Emanation [Area of Effect]|XPHB|Emanation} originating from the myconid. {@actSaveFail} The target has the {@condition Stunned|XPHB} condition, and it repeats the save at the end of each of its turns, ending the effect on itself on a success. After 1 minute, it succeeds automatically."] },
  { name: "Telekinetic Ray", entries: ["{@actSave str} {@dc 16}. {@actSaveFail} The target has the {@condition Restrained|XPHB} condition until the start of the beholder's next turn or until the beholder has the {@condition Incapacitated|XPHB} condition."] },
  { name: "Howl", entries: ["{@actSave con} {@dc 19}, each creature in a 30-foot {@variantrule Emanation [Area of Effect]|XPHB|Emanation} originating from the demilich. {@actSaveFail} 70 ({@damage 20d6}) Psychic damage. {@actSaveSuccess} Half damage. {@actSaveSuccessOrFail} The target has the {@condition Frightened|XPHB} condition until the start of the demilich's next turn."] },
  { name: "Psychic Crush", entries: ["{@actSave int} {@dc 10}, one creature the ooze can see within 60 feet. {@actSaveFail} 13 ({@damage 3d8}) Psychic damage."] },
  { name: "Claw", entries: ["{@atkr m} {@hit 4}, reach 5 ft. {@h}4 ({@damage 1d4 + 2}) Slashing damage. If the target is a creature that isn't an Undead or elf, it is subjected to the following effect. {@actSave con} {@dc 10}. {@actSaveFail} The target has the {@condition Paralyzed|XPHB} condition until the end of its next turn."] },
  { name: "Earth Burst", entries: ["{@atkr r} {@hit 10}, range 120 ft. {@h}15 ({@damage 2d8 + 6}) Bludgeoning damage. {@hom}Earth explodes from the target's space, creating the following effect. {@actSave dex} {@dc 16}, each creature in a 10-foot {@variantrule Emanation [Area of Effect]|XPHB|Emanation} originating from and including the target. {@actSaveFail} 10 ({@damage 3d6}) Thunder damage."] },
] };

test("TS 2024: area, danni, metà al successo; condizione con durata, tiro ripetuto, immunità; il resto nella nota", () => {
  const block = fiveToolsMonsterToStatblock(tyrant, { allow2024: true }).block;
  const byName = Object.fromEntries(block.actions.map((action) => [action.name, action]));
  assert.deepEqual(byName["Fire Breath"], { name: "Fire Breath", save: { ability: "dex", dc: 21, half: true }, area: { shape: "cone", size: 60, origin: "self" },
    damage: [{ type: "fire", formula: "17d6" }], recharge: 5 });
  assert.deepEqual(byName["Lightning Breath"].area, { shape: "line", size: 90, width: 5, origin: "self" });
  assert.deepEqual([byName["Mind Blast"].save.half, byName["Mind Blast"].onFail], [true, { condition: "stunned", duration: { until: "turn-end", anchor: "source" } }]);
  assert.equal(byName["Mind Blast"].note, undefined, "everything is played");
  assert.deepEqual([byName.Moan.area, byName.Moan.immuneHours, byName.Moan.note], [{ shape: "sphere", size: 60, origin: "self" }, 24, undefined]);
  assert.deepEqual(byName.Spores.onFail, { condition: "stunned", repeat: { timing: "turn-end", ends: true } });
  assert.equal(byName.Spores.note, "Failure: After 1 minute, it succeeds automatically.");
  // The beholder's own Incapacitated condition is never the target's.
  assert.deepEqual(byName["Telekinetic Ray"].onFail, { condition: "restrained", duration: { until: "turn-start", anchor: "source" } });
  assert.equal(byName.Howl.note, "Failure or Success: The target has the Frightened condition until the start of the demilich's next turn.");
  assert.deepEqual([byName["Psychic Crush"].area, byName["Psychic Crush"].save.half], [undefined, false]);
  // In a hit: the save of the hit, its lead-in for some targets kept; never after "Hit or Miss:".
  assert.deepEqual(byName.Claw.onHit, { save: { ability: "con", dc: 10, half: false, conditions: ["paralyzed"], duration: { until: "turn-end", anchor: "target" } } });
  assert.equal(byName.Claw.note, "If the target is a creature that isn't an Undead or elf, it is subjected to the following effect.");
  assert.equal(byName["Earth Burst"].onHit, undefined);
  assert.match(byName["Earth Burst"].note, /^Hit or Miss:/);
  const played = ["Mind Blast", "Moan", "Spores", "Claw"];
  const cards = Object.fromEntries(cardsOf({ ...block, actions: block.actions.filter((action) => played.includes(action.name)) }).map((card) => [card.label, card]));
  assert.deepEqual([cards["Mind Blast"].save, cards["Mind Blast"].saveDC, cards["Mind Blast"].saveHalf, cards["Mind Blast"].area, cards["Mind Blast"].onFail],
    ["int", 15, true, { shape: "cone", sizeFeet: 60, origin: "self" }, { condition: "Stordito", until: "turn-end", anchor: "source" }]);
  assert.deepEqual([cards.Moan.immuneHours, cards.Spores.onFail], [24, { condition: "Stordito", repeat: "turn-end" }]);
  assert.deepEqual(cards.Claw.onHit.save.onFail, { condition: "Paralizzato", until: "turn-end", anchor: "target" });
});

// Sotto-lotto 5: incantesimi e leggendarie 2024. «(level 5 version)» è il livello di lancio dell'azione rapida; «1/Long
// Rest» vale come 1/giorno; la magia della congrega resta al tavolo; leggendarie e resistenze fuori dalla tana (D5).
import { parseCharacterSheetImport } from "../src/characterSheetImportCore.js";

const lich = { name: "Test Lich", source: "XMM", ac: [17], hp: { average: 315 }, legendaryActionsLair: 4,
  trait: [{ name: "Legendary Resistance (4/Day, or 5/Day in Lair)", entries: ["If the lich fails a saving throw, it can choose to succeed instead."] }],
  legendary: [{ name: "Deathly Teleport", entries: ["The lich teleports up to 60 feet."] }],
  spellcasting: [
    { name: "Spellcasting", type: "spellcasting", headerEntries: ["The lich casts one of the following spells (spell save {@dc 20}):"], ability: "int", displayAs: "action",
      will: ["{@spell Detect Magic|XPHB}", "{@spell Fireball|XPHB} (level 5 version)", "{@spell Mage Hand|XPHB}"],
      daily: { "1e": ["{@spell Cone of Cold|XPHB} (level 9 version)", "{@spell Fly|XPHB}"] } },
    { name: "Coven Magic", type: "spellcasting", headerEntries: ["While in a coven, the lich casts (spell save {@dc 11}):"], ability: "int",
      restLong: { 1: ["{@spell Augury|XPHB}"] } },
    { name: "Ritual Magic", type: "spellcasting", headerEntries: ["The lich casts (spell save {@dc 20}):"], ability: "int",
      restLong: { 1: ["{@spell Scrying|XPHB}"] } },
  ] };

test("incantesimi 2024: il livello della versione, 1/riposo lungo come 1/giorno, la congrega al tavolo; la tana nel rapporto", () => {
  const converted = fiveToolsMonsterToStatblock(lich, { allow2024: true });
  assert.equal(converted.block.spellSaveDC, 20, "never the coven's DC");
  assert.deepEqual(converted.block.innateSpells, [{ name: "Detect Magic" }, { name: "Fireball", level: 5 }, { name: "Mage Hand" },
    { name: "Cone of Cold", perDay: 1, level: 9 }, { name: "Fly", perDay: 1 }, { name: "Scrying", perDay: 1 }]);
  assert.deepEqual(converted.block.legendary, { actions: 3, resistances: 4 });
  assert.ok(converted.report.includes("Coven Magic: incantesimi della congrega da gestire al tavolo"));
  assert.ok(converted.report.includes("nella tana: 4 azioni leggendarie e 5 resistenze leggendarie (sulla scheda i numeri fuori dalla tana: si cambiano dal tracker)"));
  const innate = parseCharacterSheetImport(JSON.stringify(converted.block)).sections.innate;
  const byLabel = Object.fromEntries(innate.map((action) => [action.spellId, action]));
  assert.deepEqual([byLabel.fireball.slotLevel, byLabel.fireball.cost], [5, "free"]);
  assert.deepEqual([byLabel["cone-of-cold"].slotLevel, byLabel["cone-of-cold"].cost, byLabel["cone-of-cold"].uses], [9, "uses", 1]);
  assert.equal(byLabel.fly.slotLevel, null, "no version: the catalog's level");
});
