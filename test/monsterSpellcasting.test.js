// Attacchi dei mostri, fase 4, lotto 4: gli incantesimi dello statblock. CD e bonus, classe e livello per gli slot (le
// capacità di classe spente), il libro, gli innati come azioni rapide gratuite o con usi propri.
import assert from "node:assert/strict";
import test from "node:test";
import { fiveToolsMonsterToStatblock, fiveToolsSpellName } from "../src/fiveToolsMonsterCore.js";
import { parseCharacterSheetImport, sheetImportSectionSummary } from "../src/characterSheetImportCore.js";
import { quickActionUsesPool } from "../src/quickActionsCore.js";

const spell = (name) => `{@spell ${name}}`;
const mage = {
  name: "Mage", source: "MM", ac: [12], hp: { average: 40, formula: "9d8" }, int: 17,
  spellcasting: [{
    name: "Spellcasting", type: "spellcasting", ability: "int",
    headerEntries: ["The mage is a 9th-level spellcaster. Its spellcasting ability is Intelligence (spell save {@dc 14}, {@hit 6} to hit with spell attacks). The mage has the following wizard spells prepared:"],
    spells: { 0: { spells: [spell("fire bolt"), spell("light")] }, 1: { slots: 4, spells: [`${spell("mage armor")}*`, spell("magic missile")] },
      2: { slots: 3, spells: [spell("Melf's acid arrow")] }, 3: { slots: 3, spells: [spell("fireball")] }, 4: { slots: 3, spells: [spell("ice storm")] },
      5: { slots: 1, spells: [spell("cone of cold")] } },
  }],
};
const innateCaster = {
  name: "Drow Priestess", source: "X", ac: [15], hp: { average: 30 },
  spellcasting: [
    { name: "Innate Spellcasting", type: "spellcasting", ability: "cha",
      headerEntries: ["The drow's spellcasting ability is Charisma (spell save {@dc 13}). It can innately cast the following spells:"],
      will: [spell("dancing lights"), spell("detect magic")], daily: { "1e": [spell("darkness"), `${spell("levitate")} (self only)`], 3: [spell("bless"), spell("command")] } },
  ],
};

test("i nomi degli incantesimi: tag, fonte, asterisco e note tolti; i maghi del Manuale dei Mostri con il nome dell'SRD", () => {
  assert.equal(fiveToolsSpellName("{@spell levitate} (self only)"), "levitate");
  assert.equal(fiveToolsSpellName("{@spell invisibility|PHB}"), "invisibility");
  assert.equal(fiveToolsSpellName("{@spell Evard's black tentacles}*"), "Black Tentacles");
  assert.equal(fiveToolsSpellName("{@spell Tasha's hideous laughter}"), "Hideous Laughter");
});

test("un incantatore a slot: CD, bonus, classe e livello, il libro con trucchetti e incantesimi preparati", () => {
  const { block, report } = fiveToolsMonsterToStatblock(mage);
  assert.equal(block.spellSaveDC, 14);
  assert.equal(block.spellAttackBonus, 6);
  assert.deepEqual(block.classes, [{ class: "wizard", level: 9 }]);
  assert.ok(!report.some((line) => /slot dello statblock/.test(line)), "a 9th-level wizard's slots are the plugin's");
  const sheet = parseCharacterSheetImport(JSON.stringify(block));
  assert.deepEqual(sheet.sections.classes, [{ classId: "mago", level: 9, subclassId: "" }]);
  assert.deepEqual(sheet.sections.spells.spellIds, ["fire-bolt", "light", "mage-armor", "magic-missile", "acid-arrow", "fireball", "ice-storm", "cone-of-cold"]);
  assert.deepEqual(sheet.sections.spells.unpreparedIds || [], [], "all prepared");
  assert.equal(sheet.sections.stats.spellSaveDC, 14);
  assert.equal(sheet.sections.innate, undefined);
});

test("slot dello statblock diversi da quelli della classe: segnalati, tengono quelli del plugin", () => {
  const acolyte = structuredClone(mage);
  acolyte.spellcasting[0].headerEntries = ["The acolyte is a 1st-level spellcaster. Its spellcasting ability is Wisdom (spell save {@dc 12}, {@hit 4} to hit with spell attacks). The acolyte has following cleric spells prepared:"];
  acolyte.spellcasting[0].spells = { 0: { spells: [spell("light")] }, 1: { slots: 3, spells: [spell("bless")] } };
  const { block, report } = fiveToolsMonsterToStatblock(acolyte);
  assert.deepEqual(block.classes, [{ class: "cleric", level: 1 }]);
  assert.ok(report.includes("Spellcasting: slot dello statblock 3×1°, quelli del plugin per cleric 1 2×1°"), report.join(" | "));
});

test("un incantatore senza classe: il libro sì, gli slot restano al tavolo", () => {
  const psion = structuredClone(mage);
  psion.spellcasting[0].headerEntries = ["The mind flayer is a 10th-level spellcaster. Its innate spellcasting ability is Intelligence (spell save {@dc 15}). It can innately cast the following spells:"];
  const { block, report } = fiveToolsMonsterToStatblock(psion);
  assert.equal(block.classes, undefined);
  assert.ok(block.spells.length);
  assert.ok(report.includes("Spellcasting: incantatore senza classe, gli slot restano al tavolo"));
});

test("gli innati: a volontà gratuiti, X/giorno con usi propri; i trucchetti a volontà nel libro; i pool in comune segnalati", () => {
  const { block, report } = fiveToolsMonsterToStatblock(innateCaster);
  assert.equal(block.spellSaveDC, 13);
  assert.deepEqual(block.innateSpells, [{ name: "dancing lights" }, { name: "detect magic" }, { name: "bless", perDay: 3 },
    { name: "command", perDay: 3 }, { name: "darkness", perDay: 1 }, { name: "levitate", perDay: 1 }], "the most uses first");
  assert.ok(report.some((line) => /3\/giorno in comune tra bless, command/.test(line)));
  const sheet = parseCharacterSheetImport(JSON.stringify(block));
  assert.deepEqual(sheet.sections.spells.spellIds, ["dancing-lights"], "a cantrip at will needs no slot: the book");
  const innate = sheet.sections.innate;
  assert.deepEqual(innate.map((action) => [action.spellId, action.cost, action.uses]),
    [["detect-magic", "free", undefined], ["bless", "uses", 3], ["command", "uses", 3], ["darkness", "uses", 1], ["levitate", "uses", 1]]);
  assert.ok(innate.every((action) => action.kind === "spell" && action.label && !action.id));
  assert.deepEqual(quickActionUsesPool({ ...innate[1], id: "q1" }).capacity, { type: "fixed", value: 3 }, "the uses come back at the long rest");
  assert.equal(sheetImportSectionSummary("innate", innate).split(", ")[0], `${innate[0].label} a volontà`);
});

test("le CD diverse tra i blocchi: la scheda tiene quella del blocco a slot, l'altra è segnalata", () => {
  const drowMage = { ...structuredClone(mage), spellcasting: [...structuredClone(innateCaster.spellcasting), ...structuredClone(mage.spellcasting)] };
  const { block, report } = fiveToolsMonsterToStatblock(drowMage);
  assert.equal(block.spellSaveDC, 14);
  assert.ok(report.includes("Innate Spellcasting: CD 13, sulla scheda 14"));
});

test("un nome fuori dal catalogo resta in rosso, mai indovinato", () => {
  const sheet = parseCharacterSheetImport(JSON.stringify({ kind: "monster", name: "X", innateSpells: [{ name: "witch bolt", perDay: 1 }], actions: [] }));
  assert.ok(sheet.unresolved.includes('incantesimo "witch bolt"'));
  assert.equal(sheet.sections.innate, undefined);
});
