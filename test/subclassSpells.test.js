// The spells a subclass gives: always prepared or known, never stored, never counted; a patron only suggests.
import test from "node:test";
import assert from "node:assert/strict";
import { CLASS_FEATURE_SUBCLASSES } from "../src/classFeatureCatalog.js";
import { getSpellDefinition } from "../src/spells-srd.js";
import { subclassGrantedSpells, subclassSpellId, subclassSuggestedSpells } from "../src/subclassSpellsCatalog.js";
import { spellbookGroupsForProfile, spellbookPreparation, spellbookTrackerQuickActions } from "../src/spellbookCatalog.js";

test("every spell of every subclass table resolves in the catalog", () => {
  const missing = [];
  for (const subclass of CLASS_FEATURE_SUBCLASSES.filter((entry) => entry.additionalSpellsByLevel)) {
    for (const names of Object.values(subclass.additionalSpellsByLevel)) {
      for (const name of names) if (!getSpellDefinition(subclassSpellId(name))) missing.push(`${subclass.id}: ${name}`);
    }
  }
  assert.deepEqual(missing, []);
  assert.equal(subclassSpellId("Guscio Antivita"), "antilife-shell");
  assert.equal(subclassSpellId("Palla di fuoco"), "fireball");
});

test("a domain gives its spells up to the cleric level reached, with the domain as their source", () => {
  const cleric = (level) => ({ characterBuild: [{ classId: "chierico", level, subclassId: "chierico-dominio-dell-ordine" }] });
  assert.deepEqual(subclassGrantedSpells(cleric(1)).map((entry) => entry.spellId), ["command", "heroism"]);
  assert.deepEqual(subclassGrantedSpells(cleric(6)).map((entry) => entry.spellId),
    ["command", "heroism", "hold-person", "zone-of-truth", "mass-healing-word", "slow"]);
  assert.equal(subclassGrantedSpells(cleric(1))[0].source, "Dominio dell'Ordine");
  assert.deepEqual(subclassGrantedSpells({ characterBuild: [{ classId: "chierico", level: 6 }] }), [], "no subclass, no spells");
});

test("the subclass's spells join the book always prepared, outside the count, and reach the tracker", () => {
  const oren = {
    characterBuild: [{ classId: "chierico", level: 3, subclassId: "chierico-dominio-dell-ordine" }],
    abilityModifiers: { wis: 3 },
    spellbook: { spellIds: ["bless", "hold-person"], pinnedIds: [], unpreparedIds: ["hold-person"] },
  };
  const rows = spellbookGroupsForProfile(oren).flatMap((group) => group.spells)
    .map((spell) => [spell.id, spell.prepared, spell.granted || ""]);
  assert.deepEqual(rows, [
    ["bless", true, ""],
    ["command", true, "Dominio dell'Ordine"],
    ["heroism", true, "Dominio dell'Ordine"],
    ["hold-person", true, "Dominio dell'Ordine"],
    ["zone-of-truth", true, "Dominio dell'Ordine"],
  ], "Hold Person is a domain spell: always prepared, even when the book lists it as unprepared");
  assert.deepEqual(spellbookPreparation(oren).prepared, 1, "only Bless counts");
  assert.ok(spellbookTrackerQuickActions(oren).some((action) => action.id === "book:command"));
});

test("a warlock's patron suggests its spells up to the Pact Magic level, and adds none", () => {
  const warlock = { characterBuild: [{ classId: "warlock", level: 5, subclassId: "warlock-l-immondo" }] };
  assert.deepEqual(subclassGrantedSpells(warlock), []);
  const suggested = subclassSuggestedSpells(warlock).map((entry) => entry.spellId);
  assert.ok(suggested.includes("fireball"));
  assert.equal(suggested.includes("fire-shield"), false, "a 4th-level spell waits for 4th-level pact slots");
});
