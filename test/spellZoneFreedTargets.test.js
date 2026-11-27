// Bug of 27/11: Entangle's area vanished when the GM removed the Restrained of the last creature in it (the card's ×).
// Freeing the last target of a concentration spell ended the concentration, and with it a zone that stays on the map
// without creatures. Now such a zone keeps its record on the caster and its concentration (Entangle, Reverse Gravity,
// Watery Sphere); a zone that exists only for its targets (Phantasmal Force's illusion) ends with them; a spell with no
// zone (Hold Person) ends with its last target as before. Through the sweep's real cast (test-support/spellSweepHarness.js).
import test from "node:test";
import assert from "node:assert/strict";

const { runSpellFreeTargetsSweep } = await import("../test-support/spellSweepHarness.js");

const records = await runSpellFreeTargetsSweep({
  spellIds: ["entangle", "reverse-gravity", "xanathar-sfera-acquea", "phb2014-allucinazione-di-forza", "hold-person"],
});
const byId = Object.fromEntries(records.map((record) => [record.id, record]));

for (const id of ["entangle", "reverse-gravity", "xanathar-sfera-acquea"]) {
  test(`${id}: every creature freed by hand, the zone, its concentration and the caster's pill stay`, () => {
    const record = byId[id];
    assert.ok(record && !record.thrown, JSON.stringify(record));
    assert.equal(record.removed, 2, "both creatures freed");
    assert.ok(record.zonesAfter > 0, "the zone is on the map");
    assert.equal(record.concentratingAfter, 1, "the caster still concentrates");
    assert.equal(record.casterPillsAfter, 1, "the spell stays on the caster, with its Termina");
  });
}

// The second bug of the same evening: the Vine Blight cast its Entangling Plants, its creatures were freed, and the damage
// it then took asked no concentration save (its concentration had ended with them).
test("a monster's Entangle (Vine Blight): its creatures freed, the damage it takes still asks its concentration save", async () => {
  const [record] = await runSpellFreeTargetsSweep({
    spellIds: ["entangle"],
    caster: { attitude: "enemy", initiativeCard: { abilityModifiers: { con: 2 }, spellSaveDC: 12, monsterProfile: { name: "Vine Blight" } } },
  });
  assert.ok(record && !record.thrown, JSON.stringify(record));
  assert.equal(record.concentratingAfter, 1);
  assert.equal(record.damageWarnings, 1);
});

test("Phantasmal Force: its illusion exists only for its target: freed, the spell ends", () => {
  assert.equal(byId["phb2014-allucinazione-di-forza"].concentratingAfter, 0);
});

test("Hold Person: no zone, the spell ends with its last creature, as before", () => {
  assert.equal(byId["hold-person"].concentratingAfter, 0);
});
