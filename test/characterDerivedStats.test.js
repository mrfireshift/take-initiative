// 28/11: the sheet's spell save DC, spell attack and saving throws come from the class tables, never typed; the items'
// bonuses in «Altri bonus»; a multiclass character casts with its spellcasting class of most levels.
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { proficiencyBonusForLevel } from "../src/abilityModifiersCore.js";
import { derivedCharacterStats, withDerivedCharacterStats } from "../src/characterDerivedStatsCore.js";

mock.module("@owlbear-rodeo/sdk", { exports: { default: { onReady() {} }, buildLabel() {}, buildImage() {}, buildText() {}, buildPath() {}, buildShape() {}, Command: class {} } });
const { sanitizeInitiativeCard } = await import("../src/initiativeCards.js");

const modifiers = { str: 3, dex: 1, con: 2, int: -1, wis: 1, cha: 4 };

test("the proficiency bonus of the table: +2 at 1-4, +3 at 5-8, +4 at 9-12, +5 at 13-16, +6 at 17-20", () => {
  const expected = { 1: 2, 4: 2, 5: 3, 8: 3, 9: 4, 12: 4, 13: 5, 16: 5, 17: 6, 20: 6 };
  for (const [level, bonus] of Object.entries(expected)) assert.equal(proficiencyBonusForLevel(Number(level)), bonus, `level ${level}`);
});

test("a wizard 5: DC 8 + 3 + Int, attack 3 + Int, Int and Wis saves proficient", () => {
  const stats = derivedCharacterStats({ characterBuild: [{ classId: "mago", level: 5 }], abilityModifiers: { ...modifiers, int: 4 } });
  assert.equal(stats.proficiency, 3);
  assert.equal(stats.spellSaveDC, 15);
  assert.equal(stats.spellAttackBonus, 7);
  assert.deepEqual(stats.savingThrows, { str: 3, dex: 1, con: 2, int: 7, wis: 4, cha: 4 });
});

test("a multiclass character: the saves of the first class, the DC of the spellcasting class of most levels", () => {
  const stats = derivedCharacterStats({
    characterBuild: [{ classId: "guerriero", level: 2 }, { classId: "chierico", level: 3 }, { classId: "mago", level: 5 }],
    abilityModifiers: { ...modifiers, int: 2, wis: 3 },
  });
  assert.equal(stats.proficiency, 4, "level 10");
  assert.deepEqual(stats.proficientSaves, ["str", "con"], "the fighter's");
  assert.equal(stats.spellcasting.classId, "mago");
  assert.equal(stats.spellSaveDC, 14);
});

test("a tie between two spellcasting classes: the first one on the sheet", () => {
  const stats = derivedCharacterStats({ characterBuild: [{ classId: "bardo", level: 3 }, { classId: "druido", level: 3 }], abilityModifiers: modifiers });
  assert.equal(stats.spellcasting.classId, "bardo");
});

test("spellcasting from its level: a paladin 1 and a fighter without Eldritch Knight have no DC; an Eldritch Knight 3 has one", () => {
  assert.equal(derivedCharacterStats({ characterBuild: [{ classId: "paladino", level: 1 }], abilityModifiers: modifiers }).spellSaveDC, null);
  assert.equal(derivedCharacterStats({ characterBuild: [{ classId: "guerriero", level: 5 }], abilityModifiers: modifiers }).spellSaveDC, null);
  const knight = derivedCharacterStats({ characterBuild: [{ classId: "guerriero", level: 3, subclassId: "guerriero-cavaliere-mistico" }], abilityModifiers: modifiers });
  assert.equal(knight.spellcasting.ability, "int");
  assert.equal(knight.spellSaveDC, 9);
});

test("Resilient, Diamond Soul and Slippery Mind add their saves", () => {
  const resilient = derivedCharacterStats({ characterBuild: [{ classId: "mago", level: 1 }], abilityModifiers: modifiers, feats: [{ id: "resiliente", ability: "con" }] });
  assert.ok(resilient.proficientSaves.includes("con"));
  assert.equal(derivedCharacterStats({ characterBuild: [{ classId: "monaco", level: 14 }], abilityModifiers: modifiers }).proficientSaves.length, 6);
  assert.ok(derivedCharacterStats({ characterBuild: [{ classId: "ladro", level: 15 }], abilityModifiers: modifiers }).proficientSaves.includes("wis"));
});

test("«Altri bonus»: a Rod of the Pact Keeper on the DC and the attack, a Cloak of Protection on every save", () => {
  const stats = derivedCharacterStats({ characterBuild: [{ classId: "warlock", level: 1 }], abilityModifiers: modifiers,
    otherBonuses: { spellSaveDC: 1, spellAttackBonus: 1, savingThrows: 1 } });
  assert.equal(stats.spellSaveDC, 15);
  assert.equal(stats.spellAttackBonus, 7);
  assert.deepEqual(stats.savingThrows, { str: 4, dex: 2, con: 3, int: 0, wis: 4, cha: 7 });
});

test("the card stores the computed values in place of the typed ones; what cannot be computed stays as typed", () => {
  const card = sanitizeInitiativeCard({ characterBuild: [{ classId: "chierico", level: 5 }], abilityModifiers: { ...modifiers, int: "" },
    spellSaveDC: 20, spellAttackBonus: 1, savingThrows: { str: 9, int: 5 }, otherBonuses: { savingThrows: 0 } });
  assert.equal(card.spellSaveDC, 12);
  assert.equal(card.spellAttackBonus, 4);
  assert.equal(card.savingThrows.str, 3);
  assert.equal(card.savingThrows.int, 5, "no Intelligence modifier: the typed save stays");
  assert.deepEqual(card.otherBonuses, {});
});

test("a monster's sheet and a sheet without a level keep their values", () => {
  const monster = { characterBuild: [{ classId: "mago", level: 5 }], abilityModifiers: modifiers, monster: { name: "Mage" }, spellSaveDC: 14 };
  assert.equal(withDerivedCharacterStats(monster), monster);
  assert.equal(sanitizeInitiativeCard({ abilityModifiers: modifiers, spellSaveDC: 13 }).spellSaveDC, 13);
});
