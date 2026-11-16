// Statblock da testo, lotto ST2 (docs/STUDIO_IMPORT_STATBLOCK_TESTO.md §4): il testo incollato nel pannello Importa
// diventa il blocco del plugin con l'origine della scheda (manual, «Nome|testo»), il riepilogo «Da testo» e il rapporto;
// il mostro letto resta per lo Statblock originale, la scheda Capacità e gli avvisi di reazione. Mostri inventati.
import assert from "node:assert/strict";
import test from "node:test";
import { looksLikeStatblockText, statblockTextImport, statblockTextImportSummary } from "../src/monsterStatblockTextImportCore.js";
import { parseCharacterSheetImport } from "../src/characterSheetImportCore.js";
import { monsterStatblockTextRecord, monsterStatblockTextView } from "../src/monsterStatblockTextCore.js";
import { pcAttackMonsterTraitEntries } from "../src/pcAttackMonsterTraitsCore.js";
import { monsterReactionsFromView } from "../src/monsterReactionParseCore.js";

const raider = [
  "Frost Raider",
  "Medium humanoid (human), chaotic evil",
  "Armor Class 14 (hide armor)",
  "Hit Points 32 (5d8 + 10)",
  "Speed 30 ft.",
  "STR DEX CON INT WIS CHA",
  "16 (+3) 12 (+1) 14 (+2) 9 (−1) 11 (+0) 10 (+0)",
  "Senses passive Perception 10",
  "Languages Common",
  "Challenge 1 (200 XP)",
  "Cold Blooded. The raider has advantage on saving throws against being frightened.",
  "Actions",
  "Multiattack. The raider makes two attacks with its handaxe.",
  "Handaxe. Melee or Ranged Weapon Attack: +5 to hit, reach 5 ft. or range 20/60 ft., one target. Hit: 6 (1d6 + 3) slashing damage.",
  "Frost Horn (Recharge 5–6). The raider blows a horn. Each creature of its choice within 30 feet of it must succeed on a DC 12 Wisdom saving throw or be frightened until the end of the raider's next turn.",
  "Signal Fire. The raider lights a beacon that can be seen for miles.",
  "Reactions",
  "Parry. The raider adds 2 to its AC against one melee attack that would hit it. To do so, the raider must see the attacker and be wielding a melee weapon.",
  "Lair Actions",
  "The raider's camp fills with smoke.",
].join("\n");

test("il testo incollato: il blocco del plugin con l'origine della scheda, il riepilogo e il rapporto", () => {
  assert.equal(looksLikeStatblockText(raider), true);
  const read = statblockTextImport(raider);
  assert.equal(read.error, "");
  assert.equal(read.block.source, "manual");
  assert.equal(read.block.ref, "Frost Raider|testo");
  assert.equal(read.block.portrait, undefined);
  assert.equal(read.summary, "Da testo: Frost Raider, 2 azioni registrabili, 1 da gestire al tavolo.");
  assert.ok(read.report.includes("sezione non letta: Lair Actions"), "the parser's lines");
  assert.ok(read.report.includes("da gestire al tavolo: Signal Fire"), "and the adapter's");
  const sheet = parseCharacterSheetImport(JSON.stringify(read.block));
  assert.equal(sheet.error, "");
  assert.equal(sheet.name, "Frost Raider");
  assert.equal(sheet.monster.source, "manual");
  assert.equal(sheet.monster.ref, "Frost Raider|testo");
  assert.deepEqual(sheet.hitPoints, { average: 32, formula: "5d8+10" });
  assert.equal(sheet.tokenSize, "medium");
  assert.deepEqual(sheet.sections.attacks.map((attack) => attack.label), ["Handaxe", "Frost Horn"]);
});

test("il mostro letto resta per lo Statblock originale, la scheda Capacità e gli avvisi di reazione", () => {
  const read = statblockTextImport(raider);
  const record = monsterStatblockTextRecord({ ref: read.block.ref, name: read.block.name, fiveTools: read.monster });
  assert.equal(record.kind, "5etools");
  assert.equal(record.key, "frost raider|testo");
  const view = monsterStatblockTextView(record);
  assert.equal(view.header.find((row) => row.label === "Hit Points").text, "32 (5d8 + 10)");
  assert.deepEqual(pcAttackMonsterTraitEntries(view).map((entry) => `${entry.group}:${entry.label}`),
    ["monster-trait:Cold Blooded", "monster-trait:Testo non letto", "monster-reaction:Parry"]);
  assert.deepEqual(monsterReactionsFromView(view).map((reaction) => [reaction.kind, reaction.amount]), [["ac-bonus", 2]]);
});

test("armi magiche col nome attaccato all'attacco e un incantesimo preparato lanciato da un'azione", () => {
  // A site that dropped the space after the name ("Sabre +1.Melee Weapon Attack"), with the weapon's bonus in the name;
  // an action that casts a spell the card prepares: the slots', no innate copy.
  const hunter = [
    "Mirela Vask",
    "Medium humanoid (human), neutral good",
    "Armor Class 16 (studded leather)",
    "Hit Points 60 (8d8 + 24)",
    "Speed 30 ft.",
    "STR DEX CON INT WIS CHA",
    "12 (+1) 18 (+4) 16 (+3) 10 (+0) 14 (+2) 11 (+0)",
    "Challenge 3 (700 XP)",
    "",
    "Spellcasting. Mirela is a 5th-level spellcaster. Her spellcasting ability is Wisdom (spell save DC 12, +4 to hit with spell attacks). Mirela has the following ranger spells prepared:",
    "",
    "1st level (4 slots): hunter's mark, longstrider",
    "",
    "Actions",
    "Multiattack. Mirela makes two attacks with her +1 sabre.",
    "",
    "Sabre +1.Melee Weapon Attack: +7 to hit, reach 5 ft., one target. Hit: 8 (1d6 + 5) slashing damage.",
    "",
    "Light Crossbow.Ranged Weapon Attack: +6 to hit, range 80/320 ft., one target. Hit: 8 (1d8 + 4) piercing damage.",
    "",
    "Bonus Actions",
    "Cast Spell. Mirela casts hunter's mark.",
  ].join("\n");
  const read = statblockTextImport(hunter);
  assert.equal(read.error, "");
  assert.deepEqual(read.block.actions.map((action) => [action.name, action.attack.bonus]), [["Sabre +1", 7], ["Light Crossbow", 6]]);
  assert.equal(read.block.innateSpells, undefined);
  assert.deepEqual(read.block.spells.map((spell) => spell.name), ["hunter's mark", "longstrider"]);
  assert.ok(read.report.includes("Cast Spell (bonus action): hunter's mark, tra gli incantesimi preparati (con gli slot)"));
});

test("un testo che il parser rifiuta porta il suo motivo; un testo qualsiasi non è uno statblock", () => {
  const italian = statblockTextImport("Capo goblin\nClasse Armatura 17\nPunti Ferita 21 (6d6)");
  assert.equal(italian.block, null);
  assert.match(italian.error, /italiano.*prompt per un assistente/);
  assert.match(statblockTextImport("Goblin Warrior\nSmall Fey (Goblinoid), Chaotic Neutral\nAC 15 Initiative +2 (12)\nHP 10 (3d6)\n\nActions\nScimitar. Melee Attack Roll: +4, reach 5 ft. Hit: 5 (1d6 + 2) Slashing damage.").error,
    /2024.*JSON di 5eTools/);
  assert.equal(looksLikeStatblockText("Ciao a tutti"), false);
  assert.equal(statblockTextImportSummary({ name: "Ogre" }, { full: 1 }), "Da testo: Ogre, 1 azione registrabile.");
});
