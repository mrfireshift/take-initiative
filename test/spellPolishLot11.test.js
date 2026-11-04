// Lot 11 of docs/PIANO_POLISH_INCANTESIMI.md, the last of the reading: the tracked spells of the highest levels and the
// recorded ones.
import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const { getSpellDefinition, getSpellEffects } = await import("../src/spells-srd.js");
const { buildSpellUnifiedPanelContract } = await import("../src/spellUnifiedPanelCore.js");
const { getSpellAreaRuleById } = await import("../src/spellAreaRules.js");
const { spellCastSaveAbility, spellCastSaveOnlyIfUnwilling } = await import("../src/spellCastResolutionRules.js");
const { damageDefensesForItem } = await import("../src/damageDefensesCore.js");
const { ID } = await import("../src/constants.js");

const META = `${ID}/meta`;
const contractOf = (spellId, slotLevel) => buildSpellUnifiedPanelContract({ spellId, phase: "cast", castContext: { slotLevel } });
const targetLimit = (spellId, slotLevel) => contractOf(spellId, slotLevel).presentation.targeting.limit.maximum;

test("Gate, Demiplane and Mighty Fortress ask for no target: the pill stays with the caster", () => {
  for (const [spellId, slotLevel] of [["gate", 9], ["demiplane", 8], ["xanathar-fortezza-possente", 8]]) {
    assert.equal(getSpellDefinition(spellId).targetMode, "self", spellId);
    assert.equal(contractOf(spellId, slotLevel).presentation.inputs.targets.required, false, spellId);
  }
});

test("The number of targets is the one the text says", () => {
  for (const [spellId, slotLevel, maximum] of [
    ["astral-projection", 9, 9],
    ["teleport", 7, 9],
    ["plane-shift", 7, 9],
    ["tasha-sogno-del-velo-celeste", 7, 9],
    ["word-of-recall", 6, 6],
    ["xanathar-disperdere", 6, 5],
    ["animate-dead", 3, 1],
    ["animate-dead", 5, 5],
    ["create-undead", 6, 3],
    ["create-undead", 9, 6],
  ]) {
    assert.equal(targetLimit(spellId, slotLevel), maximum, `${spellId} al ${slotLevel}°`);
  }
});

test("Mind Blank is a real immunity to psychic damage and to being charmed", () => {
  const [effect] = getSpellEffects("mind-blank");
  assert.deepEqual(effect.mechanics.conditionImmunities.names, ["Affascinato"]);
  assert.notEqual(effect.mechanics.conditionImmunities.magicalOnly, true);
  const defenses = damageDefensesForItem({
    metadata: { [META]: { conditions: { instances: [{ id: "mind-blank", condition: effect.label, mechanics: effect.mechanics }] } } },
  }, META);
  assert.deepEqual(defenses.immunities, ["psychic"]);
  assert.ok(effect.summaryParts.some((part) => part.id === "damage-defense-immunity-psychic"), "the mini pill the defenses share");
});

test("Scatter says its save, for who is not willing", () => {
  assert.equal(spellCastSaveAbility("xanathar-disperdere"), "wis");
  assert.equal(spellCastSaveOnlyIfUnwilling("xanathar-disperdere"), true);
});

test("Temple of the Gods says what stays at the table, in the entry the catalog really uses", () => {
  assert.match(getSpellAreaRuleById("xanathar-tempio-degli-dei:cast").placementNote, /TS Carisma/u);
  assert.equal(getSpellAreaRuleById("xanathar-tempio-degli-dei:cast").geometry.size.value, 36);
});

test("An override of the area catalog appears once: the later one would silently replace the earlier", () => {
  const source = fs.readFileSync(new URL("../src/spellAreaCatalog.js", import.meta.url), "utf8");
  const keys = source.split("\n").map((line) => line.match(/^ {2}"([a-z0-9-]+)": \{$/)?.[1]).filter(Boolean);
  assert.deepEqual(keys.filter((key, index) => keys.indexOf(key) !== index), []);
});

test("The reading is over: every spell of the register has been read", () => {
  const register = JSON.parse(fs.readFileSync(new URL("../data/spell-polish-register.json", import.meta.url), "utf8"));
  const left = register.spells.filter((spell) => !["letto", "corretto"].includes(spell.reading?.state)).map((spell) => spell.id);
  assert.deepEqual(left, []);
});
