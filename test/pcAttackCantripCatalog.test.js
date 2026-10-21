import assert from "node:assert/strict";
import test from "node:test";
import { PC_ATTACK_CANTRIPS, getPcAttackCantrip, pcAttackCantripBeams, pcAttackCantripDice, pcAttackCantripTier } from "../src/pcAttackCantripCatalog.js";
import { getSpellDefinition } from "../src/spells-srd.js";
import { QUICK_ACTION_ATTACK_DAMAGE_TYPES } from "../src/quickActionsCore.js";

test("every attack cantrip is a level-0 spell of the catalog, with its printed damage type", () => {
  assert.equal(PC_ATTACK_CANTRIPS.length, 23);
  const by = (delivery) => PC_ATTACK_CANTRIPS.filter((cantrip) => (cantrip.delivery || "attack") === delivery).length;
  assert.deepEqual([by("attack"), by("save"), by("weapon"), by("area"), by("panel")], [8, 9, 2, 3, 1]);
  for (const cantrip of PC_ATTACK_CANTRIPS) {
    const spell = getSpellDefinition(cantrip.spellId);
    assert.ok(spell, cantrip.spellId);
    assert.equal(spell.level, 0, cantrip.spellId);
    assert.equal(cantrip.name, spell.displayName || spell.name, cantrip.spellId);
    assert.ok(QUICK_ACTION_ATTACK_DAMAGE_TYPES.includes(cantrip.type), cantrip.spellId);
    if (spell.damageType) assert.equal(cantrip.type, spell.damageType, cantrip.spellId);
    if (!["weapon", "panel"].includes(cantrip.delivery)) assert.ok(["melee", "ranged"].includes(cantrip.range), cantrip.spellId);
  }
});

test("the damage dice grow at character levels 5, 11 and 17", () => {
  assert.deepEqual([1, 4, 5, 10, 11, 16, 17, 20].map(pcAttackCantripTier), [1, 1, 2, 2, 3, 3, 4, 4]);
  const fireBolt = getPcAttackCantrip("fire-bolt");
  assert.deepEqual([1, 5, 11, 17].map((level) => pcAttackCantripDice(fireBolt, level)), ["1d10", "2d10", "3d10", "4d10"]);
  assert.equal(pcAttackCantripDice(getPcAttackCantrip("phb2014-frusta-di-spine"), 11), "3d6");
  assert.equal(pcAttackCantripDice(fireBolt, 0), "1d10", "no level in the profile: the base dice");
});

test("Eldritch Blast keeps 1d10 per beam; the beams grow instead", () => {
  const blast = getPcAttackCantrip("eldritch-blast");
  assert.deepEqual([1, 5, 11, 17].map((level) => [pcAttackCantripDice(blast, level), pcAttackCantripBeams(blast, level)]),
    [["1d10", 1], ["1d10", 2], ["1d10", 3], ["1d10", 4]]);
  assert.equal(pcAttackCantripBeams(getPcAttackCantrip("fire-bolt"), 17), 1);
  assert.equal(getPcAttackCantrip("magic-stone"), null);
});

test("saving throw cantrips name a valid save; Toll the Dead rolls d12s against a hurt creature", async () => {
  const { PC_ATTACK_SAVE_LABELS } = await import("../src/pcAttackCantripCatalog.js");
  for (const cantrip of PC_ATTACK_CANTRIPS.filter((entry) => entry.save)) assert.ok(PC_ATTACK_SAVE_LABELS[cantrip.save], cantrip.spellId);
  assert.deepEqual(Object.fromEntries(PC_ATTACK_CANTRIPS.filter((entry) => entry.save).map((entry) => [entry.spellId, entry.save])), {
    "sacred-flame": "dex", "vicious-mockery": "wis", "poison-spray": "con", "acid-splash": "dex", "xanathar-rintocco-dei-morti": "wis",
    "xanathar-infestazione": "con", "xanathar-morsa-del-gelo": "con", "tasha-scheggia-della-mente": "int", "tasha-lenza-elettrizzante": "str",
    "xanathar-parola-radiosa": "con", "xanathar-rombo-di-tuono": "con", "tasha-turbine-di-spade": "dex",
  });
  const toll = getPcAttackCantrip("xanathar-rintocco-dei-morti");
  assert.deepEqual([pcAttackCantripDice(toll, 5), pcAttackCantripDice(toll, 5, { targetDamaged: true }), pcAttackCantripDice(toll, 17, { targetDamaged: true })],
    ["2d8", "2d12", "4d12"]);
  assert.equal(pcAttackCantripDice(getPcAttackCantrip("vicious-mockery"), 11), "3d4");
});
