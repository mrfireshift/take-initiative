// Lot 10 of docs/PIANO_POLISH_INCANTESIMI.md: what reading the tracked spells from the 4th to the 7th level has found.
import test from "node:test";
import assert from "node:assert/strict";

const { getAreaSaveAutomation, getSpellDefinition, getTrackableSpellOptions } = await import("../src/spells-srd.js");
const { buildSpellUnifiedPanelContract } = await import("../src/spellUnifiedPanelCore.js");
const { getSpellAreaRuleById, getSpellAreaRules } = await import("../src/spellAreaRules.js");

const contractOf = (spellId, slotLevel) => buildSpellUnifiedPanelContract({ spellId, phase: "cast", castContext: { slotLevel } });
const targetLimit = (spellId, slotLevel) => contractOf(spellId, slotLevel).presentation.targeting.limit.maximum;
const noteOf = (spellId) => getSpellAreaRuleById(`${spellId}:cast`).placementNote;

test("The spells with no creature in their text ask for no target: the pill stays with the caster", () => {
  for (const [spellId, slotLevel] of [
    ["conjure-celestial", 7],
    ["conjure-elemental", 5],
    ["conjure-fey", 6],
    ["creation", 5],
    ["guards-and-wards", 6],
    ["instant-summons", 6],
    ["magnificent-mansion", 7],
    ["passwall", 5],
    ["programmed-illusion", 6],
    ["project-image", 7],
    ["simulacrum", 7],
    ["transport-via-plants", 6],
    ["xanathar-danza-macabra", 5],
    ["xanathar-evoca-demone-maggiore", 4],
    ["xanathar-gabbia-dellanima", 6],
    ["xanathar-richiamo-infernale", 5],
    ["tasha-evoca-aberrazione", 4],
    ["tasha-evoca-celestiale", 5],
    ["tasha-evoca-costrutto", 4],
    ["tasha-evoca-elementale", 4],
    ["tasha-evoca-immondo", 6],
  ]) {
    assert.equal(getSpellDefinition(spellId).targetMode, "self", spellId);
    assert.equal(contractOf(spellId, slotLevel).presentation.inputs.targets.required, false, spellId);
  }
});

test("The spells with a creature in their text keep asking for it", () => {
  for (const [spellId, slotLevel, maximum] of [
    ["dream", 5, 1],
    ["etherealness", 7, 1],
    ["etherealness", 8, 3],
    ["modify-memory", 5, 1],
    ["planar-binding", 5, 1],
    ["sequester", 7, 1],
    ["telepathic-bond", 5, 8],
    ["true-seeing", 6, 1],
  ]) {
    assert.equal(contractOf(spellId, slotLevel).presentation.inputs.targets.required, true, spellId);
    assert.equal(targetLimit(spellId, slotLevel), maximum, spellId);
  }
});

test("Seeming changes any number of creatures", () => {
  assert.equal(targetLimit("seeming", 5), null);
});

test("Modify Memory charms and incapacitates who fails, and damage ends it", () => {
  const automation = getAreaSaveAutomation("modify-memory");
  assert.deepEqual(automation.trackOutcomes, ["failed"]);
  assert.deepEqual(automation.failed.map((rule) => rule.condition), ["Affascinato", "Incapacitato"]);
  for (const rule of automation.failed) {
    assert.deepEqual(rule.expiry, { mode: "concentration" });
    assert.equal(rule.endsParentOnRemoval, true);
    assert.equal(rule.mechanics.endsOnDamage, true);
  }
  assert.match(automation.failed[0].effectDetail, /vantaggio/u);
});

test("Mirage Arcane is only tracked, by the owner's decision: no shape, its pill on the caster for 10 days", () => {
  assert.equal(getSpellAreaRuleById("mirage-arcane:cast"), null);
  const spell = getSpellDefinition("mirage-arcane");
  assert.equal(spell.targetMode, "self");
  assert.equal(spell.defaultTurns, 144000);
  const contract = buildSpellUnifiedPanelContract({ spellId: "mirage-arcane", phase: "cast", castContext: { slotLevel: 7 } });
  assert.equal(contract.execution.hasZones, false);
  assert.equal(contract.presentation.placement.policy, "unavailable");
});

test("No area of the catalog is too large to rebuild", () => {
  for (const { id } of getTrackableSpellOptions()) {
    for (const rule of getSpellAreaRules(id) || []) {
      const size = Number(rule.geometry?.size?.value);
      if (!Number.isFinite(size)) continue;
      const side = size / 1.5;
      const cells = rule.geometry.shape === "circle" ? Math.PI * side * side : side * side;
      assert.ok(cells <= 20000, `${rule.id}: ${Math.round(cells)} caselle`);
    }
  }
});

test("Private Sanctum says what its shape shows", () => {
  assert.match(noteOf("private-sanctum"), /30 m/u);
});
