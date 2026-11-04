// Velocità dei mostri, lotto 1: le velocità oltre la camminata, dallo statblock al profilo del mostro sulla scheda.
import assert from "node:assert/strict";
import test from "node:test";
import { fiveToolsMonsterToStatblock } from "../src/fiveToolsMonsterCore.js";
import { parseCharacterSheetImport } from "../src/characterSheetImportCore.js";
import { MONSTER_PROFILE_STATBLOCK_FIELDS, monsterSpeedsText, sanitizeMonsterProfile } from "../src/monsterProfileCore.js";

const convert = (speed) => fiveToolsMonsterToStatblock({ name: "Test", source: "MM", ac: [15], hp: { average: 10 }, speed,
  action: [{ name: "Claw", entries: ["{@atk mw} {@hit 4} to hit, reach 5 ft., one target. {@h}5 ({@damage 1d6 + 2}) slashing damage."] }] });
const importedMonster = (fields) => parseCharacterSheetImport(JSON.stringify({ kind: "monster", name: "Test", actions: [], armorClass: 12, ...fields })).monster;

test("da 5eTools: le modalità in piedi, lo stazionario, la camminata resta speed", () => {
  const { block, report } = convert({ walk: 40, fly: 80, swim: 40, climb: 20, burrow: 10 });
  assert.equal(block.speed, "40 ft");
  assert.deepEqual(block.speeds, { fly: "80 ft", swim: "40 ft", climb: "20 ft", burrow: "10 ft" });
  assert.ok(!report.some((line) => line.startsWith("velocità")));
  assert.equal(convert({ walk: 30 }).block.speeds, undefined, "only walking: nothing more on the token");
  const hovering = convert({ walk: 0, fly: { number: 20, condition: "(hover)" }, canHover: true }).block;
  assert.deepEqual([hovering.speed, hovering.speeds], [undefined, { fly: "20 ft", hover: true }]);
  assert.deepEqual(convert({ walk: 30, fly: { number: 40, condition: "(hover)" } }).block.speeds, { fly: "40 ft", hover: true });
});

test("da 5eTools: una velocità solo in una forma o in un caso non è una modalità, va nel rapporto", () => {
  const form = convert({ walk: { number: 40, condition: "(wolf form only)" }, fly: { number: 60, condition: "(owl form only)" }, climb: 30 });
  assert.equal(form.block.speed, "40 ft", "as before: the card's speed");
  assert.deepEqual(form.block.speeds, { climb: "30 ft" });
  assert.ok(form.report.includes("velocità da gestire al tavolo: camminare 40 ft (wolf form only)"));
  assert.ok(form.report.includes("velocità da gestire al tavolo: volare 60 ft (owl form only)"));
  const magic = convert({ walk: 30, fly: { number: 50, condition: "(hover, Graystaff magic)" } });
  assert.equal(magic.block.speeds, undefined);
  assert.ok(magic.report.includes("velocità da gestire al tavolo: volare 50 ft (hover, Graystaff magic)"));
  const alternate = convert({ walk: 30, alternate: { walk: [{ number: 40, condition: "(bear form only)" }] } });
  assert.ok(alternate.report.includes("velocità da gestire al tavolo: camminare 40 ft (bear form only)"));
  const choice = convert({ walk: 5, choose: { from: ["climb", "fly"], amount: 20, note: "(DM's choice)" } });
  assert.equal(choice.block.speeds, undefined);
  assert.ok(choice.report.includes("velocità da gestire al tavolo: scalare o volare 20 ft (DM's choice)"));
});

test("dal JSON: speeds in piedi o metri, in italiano, oppure speed a oggetto; arriva in metri nel profilo", () => {
  assert.deepEqual(importedMonster({ speed: "40 ft", speeds: { fly: "80 ft", swim: 12, hover: true } }).speeds, { fly: 24, swim: 12 });
  assert.equal(importedMonster({ speed: "40 ft", speeds: { fly: "80 ft", hover: true } }).hover, true);
  assert.deepEqual(importedMonster({ speeds: { volo: "24 m", scavo: "10 piedi" } }).speeds, { fly: 24, burrow: 3 });
  const object = parseCharacterSheetImport(JSON.stringify({ kind: "monster", name: "Test", actions: [], speed: { walk: "40 ft", climb: "20 ft" } }));
  assert.equal(object.sections.stats.speed, 12);
  assert.deepEqual(object.monster.speeds, { climb: 6 });
  assert.equal(importedMonster({ speed: "30 ft" }).speeds, undefined);
});

test("sul profilo: solo modalità note e positive, lo stazionario solo con il volo; un nuovo blocco le sostituisce", () => {
  assert.deepEqual(sanitizeMonsterProfile({ source: "5etools", speeds: { fly: 24, swim: 0, teleport: 9, climb: "6" }, hover: true }),
    { source: "5etools", speeds: { fly: 24, climb: 6 }, hover: true });
  assert.deepEqual(sanitizeMonsterProfile({ source: "manual", speeds: { swim: 12 }, hover: true }), { source: "manual", speeds: { swim: 12 } });
  assert.deepEqual(sanitizeMonsterProfile({ source: "manual", speeds: {} }), { source: "manual" });
  for (const field of ["speeds", "hover"]) assert.ok(MONSTER_PROFILE_STATBLOCK_FIELDS.includes(field));
});

test("in parole: le modalità nell'ordine, in metri con la virgola, lo stazionario", () => {
  assert.equal(monsterSpeedsText({ speeds: { swim: 7.5, fly: 24 }, hover: true }), "Volare 24 m (stazionario) · Nuotare 7,5 m");
  assert.equal(monsterSpeedsText({ source: "manual" }), "");
  assert.equal(monsterSpeedsText(null), "");
});
