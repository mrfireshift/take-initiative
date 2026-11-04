// Lot 9 of docs/PIANO_POLISH_INCANTESIMI.md: what reading the tracked spells from the 1st to the 4th level has found.
import test from "node:test";
import assert from "node:assert/strict";

const { getSpellDefinition, getSpellDurationTurns } = await import("../src/spells-srd.js");
const { spellForCastContext } = await import("../src/spellCastContextCore.js");
const {
  buildSpellUnifiedPanelContract,
  createSpellPanelSession,
  updateSpellPanelSession,
} = await import("../src/spellUnifiedPanelCore.js");
const { buildSpellUnifiedLifecycleRequest } = await import("../src/spellUnifiedLifecycleAdapter.js");
const { getSpellAreaRuleById } = await import("../src/spellAreaRules.js");

const contractOf = (spellId, slotLevel) => buildSpellUnifiedPanelContract({ spellId, phase: "cast", castContext: { slotLevel } });
const noteOf = (spellId) => getSpellAreaRuleById(`${spellId}:cast`).placementNote;

test("The spells with no creature in their text ask for no target: the pill stays with the caster", () => {
  for (const [spellId, slotLevel] of [
    ["animal-messenger", 2],
    ["arcane-eye", 4],
    ["arcane-lock", 2],
    ["clairvoyance", 3],
    ["conjure-animals", 3],
    ["conjure-minor-elementals", 4],
    ["conjure-woodland-beings", 4],
    ["continual-flame", 2],
    ["giant-insect", 4],
    ["magic-mouth", 2],
    ["major-image", 3],
    ["meld-into-stone", 3],
    ["phantom-steed", 3],
    ["rope-trick", 2],
    ["unseen-servant", 1],
    ["xanathar-evoca-demoni-minori", 3],
    ["xanathar-scritta-celeste", 2],
    ["xanathar-servitore-minuscolo", 3],
    ["tasha-evocare-bestia", 2],
    ["tasha-evoca-bestia-dombra", 3],
    ["tasha-evoca-folletto", 3],
    ["tasha-evoca-non-morto", 3],
  ]) {
    assert.equal(getSpellDefinition(spellId).targetMode, "self", spellId);
    assert.equal(contractOf(spellId, slotLevel).presentation.inputs.targets.required, false, spellId);
  }
});

test("The spells with a creature or a corpse in their text keep asking for it", () => {
  for (const [spellId, slotLevel, maximum] of [
    ["arcanists-magic-aura", 2, 1],
    ["darkvision", 2, 1],
    ["gentle-repose", 2, 1],
    ["nondetection", 3, 1],
    ["sending", 3, 1],
    ["speak-with-dead", 3, 1],
    ["tongues", 3, 1],
    ["water-breathing", 3, 10],
    ["water-walk", 3, 10],
  ]) {
    const { presentation } = contractOf(spellId, slotLevel);
    assert.equal(presentation.inputs.targets.required, true, spellId);
    assert.equal(presentation.targeting.limit.maximum, maximum, spellId);
  }
});

test("Speak with Plants is cast with nobody selected: the aura stays around the caster", () => {
  const { targeting } = getSpellAreaRuleById("speak-with-plants:cast");
  assert.equal(targeting.confirmTargets, false);
  const { presentation } = contractOf("speak-with-plants", 3);
  assert.equal(presentation.inputs.targets.required, false);
  assert.equal(presentation.placement.policy, "automatic");
  assert.match(noteOf("speak-with-plants"), /si decide al tavolo/u);
});

test("Tiny Hut says that it ends when the caster leaves it", () => {
  assert.match(noteOf("tiny-hut"), /Termina/u);
});

test("Animal Messenger lasts 48 hours more for each slot above the 2nd", () => {
  for (const [slotLevel, turns] of [[2, 14400], [3, 43200], [4, 72000], [9, 216000]]) {
    assert.equal(getSpellDurationTurns("animal-messenger", { slotLevel }), turns, `slot ${slotLevel}`);
  }
});

test("Planar Binding lasts as its slot says", () => {
  for (const [slotLevel, turns] of [[5, 14400], [6, 144000], [7, 432000], [8, 2592000], [9, 5270400]]) {
    assert.equal(getSpellDurationTurns("planar-binding", { slotLevel }), turns, `slot ${slotLevel}`);
  }
});

test("A choice with a duration of its own reaches the pill: Hex by its slot, the wedding of Ceremony", () => {
  const turnsOf = (spellId, slotLevel, variant) => {
    const contract = buildSpellUnifiedPanelContract({ spellId, phase: "cast", castContext: { slotLevel }, variant });
    const session = updateSpellPanelSession(createSpellPanelSession({ contract, casterId: "caster", slotLevel }), {
      targetIds: ["target"],
      variant,
    });
    return buildSpellUnifiedLifecycleRequest({ contract, session }).turns;
  };
  for (const [slotLevel, turns] of [[1, 600], [2, 600], [3, 4800], [4, 4800], [5, 14400], [9, 14400]]) {
    assert.equal(turnsOf("phb2014-sortilegio", slotLevel, "forza"), turns, `Hex, slot ${slotLevel}`);
  }
  assert.equal(turnsOf("xanathar-cerimonia", 1, "wedding"), 100800, "7 days");
  assert.equal(turnsOf("xanathar-cerimonia", 1, "funeral-rite"), 100800, "7 days");
  assert.equal(turnsOf("xanathar-cerimonia", 1, "dedication"), 14400, "24 hours");
  assert.equal(turnsOf("hunters-mark", 3), 4800, "a rule by slot stays as it is");
  assert.equal(turnsOf("bless", 1), 10, "no choice: the spell's own duration");
});

test("Major Image needs concentration up to the 5th level, and lasts until dispelled from the 6th", () => {
  const spell = getSpellDefinition("major-image");
  for (const slotLevel of [3, 4, 5]) {
    const cast = spellForCastContext(spell, { slotLevel });
    assert.equal(cast.concentration, true, `slot ${slotLevel}`);
    assert.notEqual(cast.expiry?.mode, "manual", `slot ${slotLevel}`);
    assert.equal(getSpellDurationTurns("major-image", { slotLevel }), 100, `slot ${slotLevel}`);
  }
  for (const slotLevel of [6, 9]) {
    const cast = spellForCastContext(spell, { slotLevel });
    assert.equal(cast.concentration, false, `slot ${slotLevel}`);
    assert.deepEqual(cast.expiry, { mode: "manual" }, `slot ${slotLevel}`);
  }
});
