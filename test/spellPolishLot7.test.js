// Lot 7 of docs/PIANO_POLISH_INCANTESIMI.md: what reading the last automated spells and the first capabilities has found.
import test from "node:test";
import assert from "node:assert/strict";

const {
  getAreaSaveAutomation,
  getSpellDefinition,
  getSpellDurationTurns,
} = await import("../src/spells-srd.js");
const { spellForCastContext } = await import("../src/spellCastContextCore.js");
const { buildSpellUnifiedPanelContract } = await import("../src/spellUnifiedPanelCore.js");
const { getSpellAreaRuleById, getSpellAreaRules } = await import("../src/spellAreaRules.js");
const { spellHpCeiling, spellHpCeilingRefuses } = await import("../src/hpBranchSpellRules.js");
const { spellSaveDamageFormula } = await import("../src/spellCastResolutionRules.js");
const { ID } = await import("../src/constants.js");

const META = `${ID}/meta`;
const contractOf = (spellId, slotLevel) => buildSpellUnifiedPanelContract({ spellId, phase: "cast", castContext: { slotLevel } });
const creature = (hp, hpMax = hp) => ({ id: "c", name: "C", metadata: { [META]: { hp, hpMax } } });

test("Power Word Stun and Pain have no effect above their threshold of current hit points", () => {
  assert.equal(spellHpCeiling("power-word-stun"), 150);
  assert.equal(spellHpCeiling("xanathar-parola-del-potere-dolore"), 100);
  assert.equal(spellHpCeiling("hold-person"), null);
  assert.equal(spellHpCeilingRefuses("power-word-stun", creature(151)), true);
  assert.equal(spellHpCeilingRefuses("power-word-stun", creature(150)), false);
  assert.equal(spellHpCeilingRefuses("power-word-stun", creature(90, 300)), false, "the current ones count, not the maximum");
  assert.equal(spellHpCeilingRefuses("xanathar-parola-del-potere-dolore", creature(101)), true);
  assert.equal(spellHpCeilingRefuses("xanathar-parola-del-potere-dolore", creature(100)), false);
  assert.equal(spellHpCeilingRefuses("power-word-stun", { id: "c", metadata: {} }), false, "no hit points on the token: the GM decides");
  assert.equal(spellHpCeilingRefuses("hold-person", creature(500)), false);
});

test("Geas charms who fails, for the duration its slot says, and until dispelled from the 9th", () => {
  const cases = [[5, 432000], [6, 432000], [7, 5256000], [8, 5256000]];
  for (const [slotLevel, turns] of cases) {
    assert.equal(getSpellDurationTurns("geas", { slotLevel }), turns, `slot ${slotLevel}`);
    const [charmed] = getAreaSaveAutomation("geas", "", { slotLevel }).failed;
    assert.equal(charmed.condition, "Affascinato");
    assert.deepEqual(charmed.expiry, { mode: "rounds", remaining: turns }, `slot ${slotLevel}`);
    assert.equal(spellForCastContext(getSpellDefinition("geas"), { slotLevel }).expiry, getSpellDefinition("geas").expiry);
  }
  assert.deepEqual(getAreaSaveAutomation("geas", "", { slotLevel: 9 }).failed[0].expiry, { mode: "manual" });
  assert.deepEqual(spellForCastContext(getSpellDefinition("geas"), { slotLevel: 9 }).expiry, { mode: "manual" });
  assert.match(getAreaSaveAutomation("geas").failed[0].effectDetail, /5d10/u);
});

test("Lifting the end from a slot still goes through concentration for the spells that have it", () => {
  const curse = getSpellDefinition("bestow-curse");
  assert.equal(spellForCastContext(curse, { slotLevel: 4 }), curse);
  assert.equal(spellForCastContext(curse, { slotLevel: 5 }).concentration, false);
  assert.deepEqual(spellForCastContext(curse, { slotLevel: 9 }).expiry, { mode: "manual" });
  const bless = getSpellDefinition("bless");
  assert.equal(spellForCastContext(bless, { slotLevel: 9 }), bless, "no rule by slot: the spell as it is");
  const mageArmor = getSpellDefinition("mage-armor");
  assert.equal(spellForCastContext(mageArmor, { slotLevel: 9 }), mageArmor);
});

test("Antipathy/Sympathy asks the save of whoever ends the turn far from the target, for both effects", () => {
  for (const choice of ["antipathy", "sympathy"]) {
    const [effect] = getAreaSaveAutomation("antipathy-sympathy", choice).failed;
    assert.equal(effect.saveReminder.ability, "wis", choice);
    assert.equal(effect.saveReminder.timing, "turn-end", choice);
    assert.equal(effect.saveReminder.dcSource, "source-spell", choice);
    assert.match(effect.saveReminder.label, /18 m/u, choice);
  }
});

test("A wall of stone and a faithful hound ask for no target: the pill stays with the caster", () => {
  assert.equal(getSpellDefinition("faithful-hound").targetMode, "self");
  assert.equal(contractOf("faithful-hound", 4).presentation.inputs.targets.required, false);
  // CAP-STRUCTURE, lotto S1: the wall is a zone drawn on the map, its panels under the pill of the caster; no save at
  // the cast (only an enclosed creature saves, at the table).
  const wall = contractOf("wall-of-stone", 5);
  assert.equal(wall.presentation.placement.ruleId, "wall-of-stone:cast");
  assert.equal(wall.presentation.inputs.outcomes.required, false);
});

test("Dragon's Breath touches a creature: no cone at the cast, the pill on who will breathe", () => {
  assert.deepEqual(getSpellAreaRules("xanathar-soffio-del-drago"), []);
  const contract = contractOf("xanathar-soffio-del-drago", 2);
  assert.equal(contract.execution.lane, "spell-lifecycle");
  assert.equal(contract.presentation.inputs.targets.required, true);
  assert.equal(getSpellDefinition("xanathar-soffio-del-drago").targetMode, "selected");
});

test("Thunder Step deals its thunder at the cast, from where the caster was, and leaves the caster out", () => {
  const rule = getSpellAreaRuleById("xanathar-passo-del-tuono:cast");
  assert.equal(rule.targeting.includeCaster, false);
  for (const [slotLevel, dice] of [[3, "3d10"], [4, "4d10"], [6, "6d10"]]) {
    const contract = contractOf("xanathar-passo-del-tuono", slotLevel);
    assert.equal(contract.execution.castHasHP, true);
    assert.equal(contract.presentation.inputs.damage.required, true);
    assert.equal(spellSaveDamageFormula("xanathar-passo-del-tuono", "failed", slotLevel), dice, `slot ${slotLevel}`);
  }
});

test("Melf's Minute Meteors: the damage of the meteor of the cast, always 2d6: a higher slot gives more meteors", () => {
  for (const slotLevel of [3, 5]) {
    const contract = contractOf("xanathar-minuscole-meteore-di-melf", slotLevel);
    assert.equal(contract.execution.castHasHP, true);
    assert.equal(contract.presentation.inputs.damage.required, true);
    assert.equal(spellSaveDamageFormula("xanathar-minuscole-meteore-di-melf", "failed", slotLevel), "2d6", `slot ${slotLevel}`);
  }
});

test("Holy Aura says what it does to a fiend or an undead that hits in melee", () => {
  const effect = getSpellDefinition("holy-aura").effects.find((entry) => entry.id === "holy-aura-protection");
  assert.match(effect.detail, /Costituzione/u);
  assert.match(effect.detail, /accecato/u);
});
