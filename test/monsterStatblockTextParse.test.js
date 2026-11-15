// Statblock da testo, lotto ST1 (docs/STUDIO_IMPORT_STATBLOCK_TESTO.md): il testo di uno statblock riletto in un mostro di
// 5eTools e passato all'adattatore di oggi. Mostri dell'SRD 5.1 (CC-BY-4.0, test-support/fivetools-srd-monsters.json) e
// mostri inventati, scritti come li copiano un PDF, D&D Beyond e Homebrewery.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fiveToolsMonsterToStatblock, fiveToolsStatblockSections } from "../src/fiveToolsMonsterCore.js";
import { isStatblockEntryName, looksLikeStatblockText, MAX_STATBLOCK_TEXT, parseStatblockText, UNREAD_TEXT_TRAIT } from "../src/monsterStatblockTextParseCore.js";
import { printedStatblockText } from "../test-support/statblockTextPrint.js";

const srd = JSON.parse(readFileSync(new URL("../test-support/fivetools-srd-monsters.json", import.meta.url), "utf8"));
const withoutOrigin = ({ ref: _ref, source: _source, portrait: _portrait, ...block }) => block;
const read = (text) => {
  const parsed = parseStatblockText(text);
  assert.equal(parsed.error, "");
  return { ...parsed, block: fiveToolsMonsterToStatblock(parsed.monster).block };
};
const header = (lines) => ["Armor Class 12", "Hit Points 9 (2d8)", "Speed 30 ft.", ...lines].join("\n");

const raider = [
  "Frost Raider",
  "Medium humanoid (human), chaotic evil",
  "Armor Class 14 (hide armor)",
  "Hit Points 32 (5d8 + 10)",
  "Speed 30 ft.",
  "STR DEX CON INT WIS CHA",
  "16 (+3) 12 (+1) 14 (+2) 9 (−1) 11 (+0) 10 (+0)",
  "Saving Throws Con +4",
  "Damage Resistances cold",
  "Senses passive Perception 10",
  "Languages Common",
  "Challenge 1 (200 XP)",
  "Cold Blooded. The raider has advantage on saving throws against being frightened.",
  "Actions",
  "Multiattack. The raider makes two attacks with its handaxe.",
  "Handaxe. Melee or Ranged Weapon Attack: +5 to hit, reach 5 ft. or range 20/60 ft., one target. Hit: 6 (1d6 + 3) slashing damage.",
  "Frost Horn (Recharge 5–6). The raider blows a horn. Each creature of its choice within 30 feet of it must succeed on a DC 12 Wisdom saving throw or be frightened until the end of the raider's next turn.",
  "Reactions",
  "Parry. The raider adds 2 to its AC against one melee attack that would hit it. To do so, the raider must see the attacker and be wielding a melee weapon.",
].join("\n");

test("i mostri SRD stampati e riletti danno lo stesso blocco, con i punteggi su una riga o su due", () => {
  for (const monster of srd.monster) {
    for (const abilities of ["inline", "table"]) {
      const direct = fiveToolsMonsterToStatblock(monster);
      const parsed = parseStatblockText(printedStatblockText(direct.monster, { abilities }));
      assert.equal(parsed.error, "", monster.name);
      assert.deepEqual(withoutOrigin(fiveToolsMonsterToStatblock(parsed.monster).block), withoutOrigin(direct.block), `${monster.name} (${abilities})`);
    }
  }
});

test("un mostro inventato come nel libro: attacco da lancio, TS con area e condizione, reazione", () => {
  assert.equal(looksLikeStatblockText(raider), true);
  const { monster, block } = read(raider);
  assert.equal(monster.source, "testo");
  assert.equal(block.armorClass, 14);
  assert.deepEqual(block.hitPoints, { average: 32, formula: "5d8 + 10" });
  assert.deepEqual(block.abilities, { str: 16, dex: 12, con: 14, int: 9, wis: 11, cha: 10 });
  assert.equal(block.multiattack, "The raider makes two attacks with its handaxe.");
  assert.deepEqual(block.actions[0], { name: "Handaxe", attack: { bonus: 5, type: "melee", reach: 5, range: { normal: 20, long: 60 } },
    damage: [{ type: "slashing", formula: "1d6+3" }] });
  assert.deepEqual(block.actions[1], { name: "Frost Horn", save: { ability: "wis", dc: 12, half: false },
    area: { shape: "sphere", size: 30, origin: "self", choice: true },
    onFail: { condition: "frightened", duration: { until: "turn-end", anchor: "source" } }, damage: [], recharge: 5 });
  assert.equal(monster.reaction[0].name, "Parry");
});

test("copiato da un PDF: righe spezzate, sillabe, legature, segno meno, maiuscoletto", () => {
  const { monster, block } = read([
    "GLACIER TROLL",
    "Large giant, chaotic evil",
    "Armor Class 15 (natural armor)",
    "Hit Points 84 (8d10 + 40)",
    "Speed 30 ft., swim 30 ft.",
    "STR DEX CON INT WIS CHA",
    "18 (+4) 8 (−1) 20 (+5) 7 (−2) 9 (−1) 7 (−2)",
    "Damage Resistances cold; bludgeoning, piercing, and",
    "slashing from nonmagical attacks",
    "Senses darkvision 60 ft., passive Perception 9",
    "Languages Giant",
    "Challenge 6 (2,300 XP)",
    "Icy Regeneration. The troll regains 10 hit points at",
    `the start of its turn. If the troll takes ${String.fromCharCode(0xfb01)}re damage,`,
    "this trait doesn't function at the start of the troll's",
    "next turn.",
    "Frost Aura. At the start of each of its turns, the troll",
    "deals 5 cold damage to each creature within 5 feet of it, other than Celestials and",
    "Undead. A creature that touches the troll takes the same damage.",
    "A CTIONS",
    "Multiattack. The troll makes two claw attacks.",
    "Claw. Melee Weapon Attack: +7 to hit, reach 10 ft., one",
    "target. Hit: 11 (2d6 + 4) slashing damage plus 3 (1d6 − 1)",
    "cold damage.",
    "Glacial Breath (Recharge 5–6). The troll exhales a 30-",
    "foot cone of ice. Each creature in that area must make a",
    "DC 16 Constitution saving throw, taking 21 (6d6) cold dam-",
    "age on a failed save, or half as much damage on a suc-",
    "cessful one.",
  ].join("\n"));
  assert.equal(block.name, "Glacier Troll");
  assert.deepEqual(monster.trait.map((trait) => trait.name), ["Icy Regeneration", "Frost Aura"], "«Undead.» after a broken line is not a trait");
  assert.match(monster.trait[0].entries[0], /takes fire damage/);
  assert.deepEqual(block.abilities, { str: 18, dex: 8, con: 20, int: 7, wis: 9, cha: 7 });
  assert.deepEqual(block.damageDefenses, { resistances: ["cold", "bludgeoning", "piercing", "slashing"], immunities: [], vulnerabilities: [],
    nonmagical: ["bludgeoning", "piercing", "slashing"] });
  assert.deepEqual(block.speeds, { swim: "30 ft" });
  assert.deepEqual(block.actions[0], { name: "Claw", attack: { bonus: 7, type: "melee", reach: 10 },
    damage: [{ type: "slashing", formula: "2d6+4" }, { type: "cold", formula: "1d6-1" }] });
  assert.deepEqual(block.actions[1], { name: "Glacial Breath", save: { ability: "con", dc: 16, half: true }, area: { shape: "cone", size: 30, origin: "self" },
    damage: [{ type: "cold", formula: "6d6" }], recharge: 5 });
});

test("copiato da D&D Beyond: un punteggio per riga, maiuscole, righe vuote, bonus di competenza", () => {
  const { monster, block, report } = read([
    "Ash Hound",
    "Medium Monstrosity, Unaligned",
    "Armor Class 13 (Natural Armor)",
    "Hit Points 26 (4d8 + 8)",
    "Speed 40 ft.",
    "STR", "14 (+2)", "DEX", "15 (+2)", "CON", "14 (+2)", "INT", "3 (-4)", "WIS", "12 (+1)", "CHA", "6 (-2)",
    "Skills Perception +3",
    "Damage Immunities Fire",
    "Senses Darkvision 60 ft., Passive Perception 13",
    "Languages —",
    "Challenge 1 (200 XP)",
    "Proficiency Bonus +2",
    "",
    "Keen Smell. The hound has advantage on Wisdom (Perception) checks that rely on smell.",
    "",
    "Actions",
    "Bite. Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 7 (2d4 + 2) piercing damage plus 3 (1d6) fire damage.",
  ].join("\n"));
  assert.deepEqual(report, []);
  assert.deepEqual(monster.size, ["M"]);
  assert.deepEqual(monster.alignment, ["U"]);
  assert.equal(monster.languages, null);
  assert.deepEqual(block.abilities, { str: 14, dex: 15, con: 14, int: 3, wis: 12, cha: 6 });
  assert.deepEqual(block.damageDefenses.immunities, ["fire"]);
  assert.equal(block.passivePerception, 13);
  assert.deepEqual(block.actions[0].damage, [{ type: "piercing", formula: "2d4+2" }, { type: "fire", formula: "1d6" }]);
});

test("il Markdown di Homebrewery: niente markup, i nomi delle voci marcati", () => {
  const { block, monster } = read([
    "{{monster,frame",
    "## Cinder Imp",
    "*Tiny fiend (devil), lawful evil*",
    "___",
    "**Armor Class** :: 13",
    "**Hit Points** :: 10 (3d4 + 3)",
    "**Speed** :: 20 ft., fly 40 ft.",
    "___",
    "|STR|DEX|CON|INT|WIS|CHA|",
    "|:---:|:---:|:---:|:---:|:---:|:---:|",
    "|6 (-2)|17 (+3)|13 (+1)|11 (+0)|12 (+1)|14 (+2)|",
    "___",
    "**Damage Immunities** :: fire, poison",
    "**Condition Immunities** :: poisoned",
    "**Senses** :: darkvision 120 ft., passive Perception 11",
    "**Languages** :: Infernal",
    "**Challenge** :: 1 (200 XP)",
    "___",
    "***Devil's Sight.*** Magical darkness doesn't impede the imp's darkvision.",
    ":",
    "### Actions",
    "***Sting.*** *Melee Weapon Attack:* +5 to hit, reach 5 ft., one target. *Hit:* 5 (1d4 + 3) piercing damage, and the target must make a DC 11 Constitution saving throw, taking 10 (3d6) poison damage on a failed save, or half as much damage on a successful one.",
    "}}",
  ].join("\n"));
  assert.equal(block.name, "Cinder Imp");
  assert.equal(block.size, "tiny");
  assert.equal(block.speed, "20 ft");
  assert.deepEqual(block.speeds, { fly: "40 ft" });
  assert.deepEqual(block.abilities, { str: 6, dex: 17, con: 13, int: 11, wis: 12, cha: 14 });
  assert.deepEqual(block.conditionImmunities, ["avvelenato"]);
  assert.deepEqual(monster.trait.map((trait) => trait.name), ["Devil's Sight"]);
  assert.deepEqual(block.actions[0].attack, { bonus: 5, type: "melee", reach: 5 });
  assert.deepEqual(block.actions[0].damage, [{ type: "piercing", formula: "1d4+3" }]);
  assert.equal(block.actions[0].onHit.save.dc, 11);
});

test("i soffi come nel libro, una lista numerata nel testo, le leggendarie con il loro numero", () => {
  const { monster, block } = read([
    "Mist Wyrm",
    "Large dragon, neutral",
    "Armor Class 17 (natural armor)",
    "Hit Points 120 (16d10 + 32)",
    "Speed 40 ft., fly 80 ft.",
    "STR DEX CON INT WIS CHA",
    "19 (+4) 12 (+1) 15 (+2) 12 (+1) 13 (+1) 14 (+2)",
    "Senses blindsight 30 ft., darkvision 120 ft., passive Perception 11",
    "Languages Draconic",
    "Challenge 8 (3,900 XP)",
    "Legendary Resistance (1/Day). If the wyrm fails a saving throw, it can choose to succeed instead.",
    "Actions",
    "Bite. Melee Weapon Attack: +7 to hit, reach 10 ft., one target. Hit: 15 (2d10 + 4) piercing damage.",
    "Breath Weapons (Recharge 5–6). The wyrm uses one of the following breath weapons.",
    "Fog Breath. The wyrm exhales fog in a 30-foot cone. Each creature in that area must succeed on a DC 14 Constitution saving throw or be blinded until the end of its next turn.",
    "Chill Breath. The wyrm exhales a freezing mist in a 30-foot cone. Each creature in that area must make a DC 14 Constitution saving throw, taking 27 (6d8) cold damage on a failed save, or half as much damage on a successful one.",
    "Each breath weapon leaves the wyrm hidden in mist.",
    "Mist Eyes. The wyrm shoots one of the following rays at a creature it can see within 60 feet of it: 1. Blinding Ray. The target must succeed on a DC 14 Wisdom saving throw or be blinded for 1 minute. 2. Slowing Ray. The target must succeed on a DC 14 Dexterity saving throw or be restrained until the end of its next turn.",
    "Legendary Actions",
    "The wyrm can take 2 legendary actions, choosing from the options below. Only one legendary action option can be used at a time and only at the end of another creature's turn. The wyrm regains spent legendary actions at the start of its turn.",
    "Detect. The wyrm makes a Wisdom (Perception) check.",
    "Wing Attack (Costs 2 Actions). The wyrm beats its wings.",
  ].join("\n"));
  assert.deepEqual(block.actions.map((action) => action.name), ["Bite", "Fog Breath", "Chill Breath", "1. Blinding Ray", "2. Slowing Ray"]);
  assert.deepEqual(block.actions.filter((action) => action.name.endsWith("Breath")).map((action) => action.recharge), [5, 5]);
  assert.equal(block.actions[2].note, undefined, "what speaks of every breath stays with the action");
  assert.equal(monster.action[1].entries.at(-1), "Each breath weapon leaves the wyrm hidden in mist.");
  assert.equal(block.actions[3].onFail.condition, "blinded");
  assert.deepEqual(block.legendary, { actions: 2, resistances: 1 });
  assert.deepEqual(monster.legendary.map((entry) => entry.name), ["Detect", "Wing Attack (Costs 2 Actions)"]);
});

test("una lista nel testo: ciò che parla di ogni voce resta all'azione", () => {
  const { monster, block } = read(header([
    "Actions",
    "Furnace Mouth. The golem uses one of the following options: Lance Strike. Each creature in a 30-foot line that is 5 feet wide must make a DC 13 Dexterity saving throw, taking 9 (2d8) fire damage on a failed save, or half as much damage on a successful one. Ember Spray. Each creature in a 15-foot cone must succeed on a DC 13 Constitution saving throw or be blinded until the end of its next turn. If the chosen option deals damage, the golem regains 5 hit points.",
  ]).replace("Armor Class", "Ember Golem\nArmor Class"));
  assert.deepEqual(block.actions.map((action) => action.name), ["Lance Strike", "Ember Spray"]);
  assert.equal(block.actions[1].note, undefined);
  assert.equal(monster.action[0].entries.at(-1), "If the chosen option deals damage, the golem regains 5 hit points.");
});

test("gli incantesimi: slot, elenchi spezzati, innati a uso, innati nominati nell'intestazione", () => {
  const { block } = read([
    "Frost Witch",
    "Medium humanoid (human), neutral evil",
    "Armor Class 12 (15 with mage armor)",
    "Hit Points 49 (11d8)",
    "Speed 30 ft.",
    "STR DEX CON INT WIS CHA",
    "9 (−1) 14 (+2) 11 (+0) 17 (+3) 12 (+1) 11 (+0)",
    "Saving Throws Int +6, Wis +4",
    "Senses passive Perception 11",
    "Languages Common, Giant",
    "Challenge 6 (2,300 XP)",
    "Spellcasting. The witch is a 9th-level spellcaster. Its spellcasting ability is Intelligence (spell save DC 14, +6 to hit with spell attacks). The witch can cast mage armor at will and has the following wizard spells prepared:",
    "Cantrips (at will): ray of frost, mage hand",
    "1st level (4 slots): shield, magic missile,",
    "sleep",
    "2nd level (3 slots): misty step, hold person",
    "3rd level (3 slots): counterspell, sleet storm",
    "4th level (3 slots): ice storm",
    "5th level (1 slot): cone of cold",
    "Innate Spellcasting. The witch's innate spellcasting ability is Charisma (spell save DC 13). It can innately cast the following spells, requiring no material components:",
    "3/day each: fog cloud, detect evil and good",
    "1/day: invisibility (self only)",
    "Actions",
    "Dagger. Melee or Ranged Weapon Attack: +5 to hit, reach 5 ft. or range 20/60 ft., one target. Hit: 4 (1d4 + 2) piercing damage.",
  ].join("\n"));
  assert.equal(block.armorClass, 12);
  assert.equal(block.spellSaveDC, 14);
  assert.equal(block.spellAttackBonus, 6);
  assert.deepEqual(block.classes, [{ class: "wizard", level: 9 }]);
  assert.deepEqual(block.spells.map((spell) => spell.name), ["ray of frost", "mage hand", "shield", "magic missile", "sleep", "misty step", "hold person",
    "counterspell", "sleet storm", "ice storm", "cone of cold"]);
  assert.deepEqual(block.innateSpells, [{ name: "mage armor" }, { name: "fog cloud", perDay: 3 }, { name: "detect evil and good", perDay: 3 },
    { name: "invisibility", perDay: 1 }]);
});

test("gli innati nominati nell'intestazione hanno gli usi del nome del blocco o dell'intestazione", () => {
  const { block } = read(header([
    "Innate Spellcasting (1/Day). The mephit can innately cast sleep, requiring no material components. Its innate spellcasting ability is Charisma.",
    "Blink Magic. The mephit's innate spellcasting ability is Charisma. It can innately cast misty step up to three times per day, requiring no components.",
  ]).replace("Armor Class", "Dust Mephit\nArmor Class"));
  assert.deepEqual(block.innateSpells, [{ name: "sleep", perDay: 1 }]);
  const sephek = read(header(["Innate Spellcasting. Sephek can innately cast misty step up to three times per day, requiring no components."])
    .replace("Armor Class", "Sephek\nArmor Class")).block;
  assert.deepEqual(sephek.innateSpells, [{ name: "misty step", perDay: 3 }]);
});

test("l'intestazione: CA con l'alternativa, PF speciali, volo stazionario, difese senza punto e virgola", () => {
  const { monster, block } = read([
    "Odd Spirit",
    "Medium undead, neutral",
    "Armor Class 12 (15 with mage armor)",
    "Hit Points equal to half the summoner's hit point maximum",
    "Speed 0 ft., fly 30 ft. (hover)",
    "Damage Resistances acid, cold, bludgeoning, piercing, slashing from nonmagical attacks",
  ].join("\n"));
  assert.deepEqual(monster.ac, [12, { ac: 15, condition: "with mage armor", braces: true }]);
  assert.deepEqual(monster.hp, { special: "equal to half the summoner's hit point maximum" });
  assert.deepEqual(monster.speed, { walk: 0, fly: { number: 30, condition: "(hover)" }, canHover: true });
  assert.deepEqual(monster.resist, ["acid", "cold", { resist: ["bludgeoning", "piercing", "slashing"], note: "from nonmagical attacks", cond: true }]);
  assert.deepEqual(block.speeds, { fly: "30 ft", hover: true });
});

test("una voce dopo un paragrafo intero senza punto finale; mai dopo una riga spezzata", () => {
  const paragraph = "Sticky Line. The fisher extends a filament up to 60 feet that adheres to anything that touches it, and can extrude another on its next turn";
  const { monster } = read(header([paragraph, "Flammable Blood. If the fisher drops to half its hit points or fewer, it gains vulnerability to fire damage."]).replace("Armor Class", "Line Fisher\nArmor Class"));
  assert.deepEqual(monster.trait.map((trait) => trait.name), ["Sticky Line", "Flammable Blood"]);
});

test("i nomi delle voci", () => {
  for (const name of ["Multiattack (Humanoid or Hybrid Form Only)", "Wing Attack (Costs 2 Actions)", "Keen Hearing and Smell", "Devil's Sight",
    "Psychic Screech (Hybrid Form Only; Recharges after a Short or Long Rest)"]) assert.equal(isStatblockEntryName(name), true, name);
  for (const name of ["The lich can take 3 legendary actions", "If the target", "DC 15 Wisdom saving throw", "Cantrips:"]) assert.equal(isStatblockEntryName(name), false, name);
});

test("una sezione che il parser non legge finisce nel tratto «Testo non letto» e nel rapporto", () => {
  const { monster, report } = parseStatblockText(`${raider}\nLair Actions\nThe raider's lair shakes.`);
  assert.equal(monster.trait.at(-1).name, UNREAD_TEXT_TRAIT);
  assert.ok(report.includes("sezione non letta: Lair Actions"));
});

test("testo italiano, statblock 2024, testo qualsiasi e testo troppo lungo", () => {
  assert.match(parseStatblockText("Capo goblin\nClasse Armatura 17\nPunti Ferita 21 (6d6)").error, /italiano/);
  assert.match(parseStatblockText("Goblin Warrior\nSmall Fey (Goblinoid), Chaotic Neutral\nAC 15 Initiative +2 (12)\nHP 10 (3d6)").error, /2024/);
  assert.match(parseStatblockText("Ciao a tutti").error, /Non sembra uno statblock/);
  assert.match(parseStatblockText("Armor Class 12\nHit Points 9 (2d8)").error, /Manca il nome/);
  assert.match(parseStatblockText("  ").error, /vuoto/);
  assert.equal(looksLikeStatblockText("Ciao a tutti"), false);
  const long = parseStatblockText(`${raider}\n${"Filler. ".repeat(MAX_STATBLOCK_TEXT / 8)}`);
  assert.ok(long.report.includes("testo tagliato a 20.000 caratteri"));
});

test("le difese come nel libro: i gruppi con una nota dopo il punto e virgola (D10)", () => {
  const view = fiveToolsStatblockSections({ name: "Prova", source: "X",
    resist: ["cold", { resist: ["bludgeoning", "piercing", "slashing"], note: "from nonmagical attacks that aren't silvered", cond: true }],
    immune: ["fire", "poison"], conditionImmune: ["charmed", "poisoned"] });
  const line = (label) => view.header.find((row) => row.label === label)?.text;
  assert.equal(line("Damage Resistances"), "cold; bludgeoning, piercing, and slashing from nonmagical attacks that aren't silvered");
  assert.equal(line("Damage Immunities"), "fire, poison");
  assert.equal(line("Condition Immunities"), "charmed, poisoned");
});
