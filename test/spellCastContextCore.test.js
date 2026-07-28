import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveSpellConcentration,
  resolveSpellSlotLevel,
  resolveSpellSubjectIds,
} from "../src/spellCastContextCore.js";
import { getSpellDefinition } from "../src/spells-srd.js";

test("le spell con effetto emesso dal caster applicano gli esiti ai bersagli scelti", () => {
  for (const name of [
    "Bagliore solare",
    "Punizione Collerica",
    "Punizione Tonante",
    "Allucinazione di Forza",
  ]) {
    const spell = getSpellDefinition(name);
    assert.ok(spell, name);
    assert.equal(spell.targetMode, "selected", name);
    assert.deepEqual(resolveSpellSubjectIds({
      spell,
      casterId: "caster",
      selectedIds: ["target-a", "target-b"],
    }), ["target-a", "target-b"], name);
  }
});

test("le spell realmente personali continuano a risolvere il caster", () => {
  const spell = getSpellDefinition("Scudo");
  assert.ok(spell);
  assert.equal(spell.targetMode, "self");
  assert.deepEqual(resolveSpellSubjectIds({
    spell,
    casterId: "caster",
    selectedIds: ["target"],
  }), ["caster"]);
});

test("concentrazione e livello slot del catalogo prevalgono sui valori liberi", () => {
  const concentrationSpell = getSpellDefinition("Sortilegio");
  const normalSpell = getSpellDefinition("Armatura Magica");

  assert.equal(resolveSpellConcentration(concentrationSpell, false), true);
  assert.equal(resolveSpellConcentration(normalSpell, true), false);
  assert.equal(resolveSpellConcentration(null, true), true);
  assert.equal(resolveSpellSlotLevel(concentrationSpell, 5), 5);
  assert.equal(resolveSpellSlotLevel(concentrationSpell, 0), concentrationSpell.level);
});
