// Which classes prepare their spells, and how many (PHB 2014).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { preparesSpells, spellPreparationClasses, spellPreparationLimit } from "../src/spellPreparationCore.js";

test("clerics, druids and wizards prepare modifier + level; paladins modifier + half their level", () => {
  const mods = { str: 0, dex: 1, con: 2, int: 4, wis: 3, cha: 2 };
  assert.equal(spellPreparationLimit([{ classId: "chierico", level: 5 }], mods), 8);
  assert.equal(spellPreparationLimit([{ classId: "druido", level: 1 }], mods), 4);
  assert.equal(spellPreparationLimit([{ classId: "mago", level: 10 }], mods), 14);
  assert.equal(spellPreparationLimit([{ classId: "paladino", level: 5 }], mods), 4);
  // At least one spell, whatever the modifier.
  assert.equal(spellPreparationLimit([{ classId: "mago", level: 1 }], { int: -3 }), 1);
});

test("spellcasters that know their spells, and a paladin before 2nd level, prepare nothing", () => {
  for (const classId of ["bardo", "stregone", "warlock", "ranger", "ranger-revised", "guerriero", "ladro"]) {
    assert.equal(preparesSpells([{ classId, level: 10 }]), false, classId);
  }
  assert.equal(preparesSpells([{ classId: "paladino", level: 1 }]), false);
  assert.equal(spellPreparationLimit([{ classId: "bardo", level: 5 }], { cha: 4 }), null);
});

test("a multiclass sums its preparing classes; a missing modifier leaves the limit unknown", () => {
  const build = [{ classId: "chierico", level: 3 }, { classId: "mago", level: 2 }, { classId: "stregone", level: 1 }];
  assert.deepEqual(spellPreparationClasses(build, { wis: 2, int: 1 }), [
    { classId: "chierico", label: "Chierico", level: 3, limit: 5 },
    { classId: "mago", label: "Mago", level: 2, limit: 3 },
  ]);
  assert.equal(spellPreparationLimit(build, { wis: 2, int: 1 }), 8);
  assert.equal(spellPreparationLimit(build, { wis: 2 }), null);
  assert.equal(preparesSpells(build), true);
});

test("spellPreparationCore stays free of the catalogs", () => {
  const source = readFileSync(new URL("../src/spellPreparationCore.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /^\s*import\s/m);
});
