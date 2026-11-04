// Lot 8 of docs/PIANO_POLISH_INCANTESIMI.md: what reading 40 spells that wait for a capability or are only tracked has found.
import test from "node:test";
import assert from "node:assert/strict";

const {
  getAreaSaveAutomation,
  getAreaSaveRuleChoices,
  getSpellDefinition,
  getTrackableSpellOptions,
} = await import("../src/spells-srd.js");
const { buildSpellUnifiedPanelContract, createSpellPanelSession } = await import("../src/spellUnifiedPanelCore.js");
const { buildUnifiedPanelViewModel } = await import("../src/spellUnifiedPanelViewCore.js");
const { getSpellAreaRuleById } = await import("../src/spellAreaRules.js");
const { spellTurnsLabel } = await import("../src/spellsPanelViewCore.js");
const {
  spellCastSparesEveryTarget,
  spellSaveDamageFactor,
  spellSaveDamageFormula,
} = await import("../src/spellCastResolutionRules.js");

const contractOf = (spellId, slotLevel) => buildSpellUnifiedPanelContract({ spellId, phase: "cast", castContext: { slotLevel } });
const targetLimit = (spellId, slotLevel) => contractOf(spellId, slotLevel).presentation.targeting.limit.maximum;
const noteOf = (spellId) => getSpellAreaRuleById(`${spellId}:cast`).placementNote;

test("The spells with no creature in their text ask for no target: the pill stays with the caster", () => {
  for (const [spellId, slotLevel] of [
    ["dancing-lights", 0],
    ["floating-disk", 1],
    ["illusory-script", 1],
    ["light", 0],
    ["mage-hand", 0],
    ["minor-illusion", 0],
    ["prestidigitation", 0],
    ["shillelagh", 0],
    ["silent-image", 1],
    ["thaumaturgy", 0],
    ["xanathar-pietra-magica", 0],
  ]) {
    assert.equal(getSpellDefinition(spellId).targetMode, "self", spellId);
    assert.equal(contractOf(spellId, slotLevel).presentation.inputs.targets.required, false, spellId);
  }
});

test("The spells with a creature in their text keep asking for it", () => {
  for (const [spellId, slotLevel, maximum] of [
    ["message", 0, 1],
    ["feather-fall", 1, 5],
    ["polymorph", 4, 1],
    ["true-polymorph", 9, 1],
    ["imprisonment", 9, 1],
    ["animal-shapes", 8, null],
  ]) {
    assert.equal(contractOf(spellId, slotLevel).presentation.inputs.targets.required, true, spellId);
    assert.equal(targetLimit(spellId, slotLevel), maximum, spellId);
  }
});

test("Antimagic Field is cast with nobody selected, and the sphere takes the caster too", () => {
  const { targeting } = getSpellAreaRuleById("antimagic-field:cast");
  assert.equal(targeting.confirmTargets, false);
  assert.equal(targeting.includeCaster, true);
  const { presentation } = contractOf("antimagic-field", 8);
  assert.equal(presentation.inputs.targets.required, false);
  assert.equal(presentation.placement.policy, "automatic");
});

test("Storm of Vengeance: who passes the save of the cast takes nothing, who fails 2d6 and stays deafened", () => {
  assert.equal(spellSaveDamageFactor("storm-of-vengeance", "passed"), "zero");
  assert.equal(spellCastSparesEveryTarget("storm-of-vengeance", ["a"], { a: "passed" }), true);
  assert.equal(spellSaveDamageFormula("storm-of-vengeance", "failed", 9), "2d6");
  const [deafened] = getAreaSaveAutomation("storm-of-vengeance").failed;
  assert.equal(deafened.condition, "Assordato");
  assert.deepEqual(deafened.expiry, { mode: "rounds", remaining: 50 });
  assert.equal(getAreaSaveAutomation("storm-of-vengeance").passed?.length ?? 0, 0);
});

test("Storm of Vengeance has no variant for the later rounds: a second cast would restart the storm", () => {
  assert.deepEqual(getAreaSaveRuleChoices("storm-of-vengeance"), []);
  assert.match(noteOf("storm-of-vengeance"), /restano al tavolo/u);
});

test("A spell with no rounds to count keeps its pill until the GM takes it away", () => {
  for (const spellId of [
    "arcane-lock",
    "astral-projection",
    "continual-flame",
    "creation",
    "imprisonment",
    "instant-summons",
    "magic-jar",
    "magic-mouth",
    "programmed-illusion",
    "sequester",
    "simulacrum",
  ]) {
    const spell = getSpellDefinition(spellId);
    assert.deepEqual(spell.expiry, { mode: "manual" }, spellId);
    assert.equal(spell.defaultTurns, null, spellId);
  }
});

test("The list of active spells says a manual end, not the round its pill records", () => {
  assert.equal(spellTurnsLabel([1], ["M"]), "rimozione manuale");
  assert.equal(spellTurnsLabel([1, 1], ["M", "M"]), "rimozione manuale");
  assert.equal(spellTurnsLabel([3], ["3"]), "3 round", "a count stays a count");
  assert.equal(spellTurnsLabel([1, 3], ["M", "3"]), "1-3 round", "not all of them are manual");
  assert.equal(spellTurnsLabel([1], ["F C"]), "F C");
  assert.equal(spellTurnsLabel([], []), "Durata non indicata");
});

test("Every lifecycle spell with a lasting effect has rounds to count or a manual end", () => {
  const lasting = getTrackableSpellOptions()
    .map((option) => getSpellDefinition(option.id))
    .filter((spell) => /until dispelled|^special$/iu.test(spell.duration || "") || /finch[eé] non viene dissolto/iu.test(spell.duration || ""));
  assert.ok(lasting.length >= 11);
  for (const spell of lasting) {
    if (getSpellAreaRuleById(`${spell.id}:cast`)) continue; // A zone's pill has its own end: hallow, glyph-of-warding.
    assert.ok(spell.defaultTurns !== null || spell.expiry?.mode === "manual", spell.id);
  }
});

test("Mass Heal takes any number of creatures, Bones of the Earth six columns and two more for each slot", () => {
  assert.equal(targetLimit("mass-heal", 9), null);
  assert.equal(targetLimit("xanathar-ossa-della-terra", 6), 6);
  assert.equal(targetLimit("xanathar-ossa-della-terra", 8), 10);
});

test("The note of a shape reaches the panel, before and after the placement", () => {
  const viewOf = (spellId, slotLevel) => {
    const contract = contractOf(spellId, slotLevel);
    return buildUnifiedPanelViewModel({ contract, session: createSpellPanelSession({ contract, casterId: "caster", slotLevel }) });
  };
  assert.match(viewOf("wall-of-ice", 6).placement.note, /pannelli/u);
  assert.match(viewOf("sleep", 1).placement.note, /Modifica bersagli/u);
  assert.equal(viewOf("fireball", 3).placement.note, "", "no note, no line");
});

test("A shape says what it cannot draw", () => {
  assert.match(noteOf("fire-storm"), /dieci cubi/u);
  assert.match(noteOf("meteor-swarm"), /quattro esplosioni/u);
  assert.match(noteOf("phb2014-tsunami"), /restano al tavolo/u);
  assert.match(noteOf("glyph-of-warding"), /raggio 6 m/u);
  assert.match(noteOf("xanathar-boschetto-druidico"), /27 m/u);
  for (const spellId of ["sleep", "color-spray"]) {
    assert.match(noteOf(spellId), /Modifica bersagli/u, "the button the panel really has");
  }
});
