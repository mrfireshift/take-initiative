// Lot 6 of docs/PIANO_POLISH_INCANTESIMI.md: what reading the next 40 spells next to the engine has found.
import test from "node:test";
import assert from "node:assert/strict";

const {
  getAreaSaveAutomation,
  getSpellDefinition,
  getSpellDurationTurns,
  getSpellEffects,
} = await import("../src/spells-srd.js");
const { buildSpellPanelViewModel, buildSpellUnifiedPanelContract } = await import("../src/spellUnifiedPanelCore.js");
const { getSpellAreaRuleById } = await import("../src/spellAreaRules.js");
const { areaMembershipTargetIds } = await import("../src/spellAreaMembershipCore.js");
const { damageDefensesForItem } = await import("../src/damageDefensesCore.js");
const { effectSummaryPartsFor } = await import("../src/effectLabelCore.js");
const { normalizeZoneTriggerNotice } = await import("../src/zoneTriggerNoticeCore.js");
const { mergeSaveReminderNoticeBatch, saveReminderNoticeBatchPresentation } = await import("../src/saveReminderNoticeCore.js");

const META = "meta";

test("Circle of Power: cast with nobody selected, and only the caster's side is in the aura", () => {
  const rule = getSpellAreaRuleById("phb2014-cerchio-di-potere:cast");
  assert.equal(rule.targeting.filter, "friendly");
  assert.equal(rule.targeting.confirmTargets, false, "the aura sits on the caster: nothing to choose");
  assert.equal(rule.targeting.includeCaster, false, "the caster keeps the pill of the cast");

  const contract = buildSpellUnifiedPanelContract({ spellId: "phb2014-cerchio-di-potere", phase: "cast", castContext: { slotLevel: 5 } });
  const model = buildSpellPanelViewModel(contract, { casterId: "caster", slotLevel: 5, targetIds: [] });
  assert.equal(model.validation.errors.includes("targets-required"), false, JSON.stringify(model.validation.errors));

  const area = { cells: [{ x: 0, y: 0, width: 400, height: 400, column: 0, row: 0 }] };
  const creature = (id, attitude) => ({
    item: { id, metadata: { [META]: { attitude } } },
    bounds: { min: { x: 10, y: 10 }, max: { x: 60, y: 60 } },
  });
  const inside = areaMembershipTargetIds({
    sourceId: "caster",
    rule,
    area,
    metaKey: META,
    candidates: [creature("caster", "pc"), creature("ally", "ally"), creature("hero", "pc"), creature("stranger", "neutral"), creature("enemy", "enemy")],
  });
  assert.deepEqual(inside, ["ally", "hero"]);
});

test("Mass Suggestion lasts as its slot says, on the pill of the cast and on the creature's own", () => {
  const cases = [[6, 14400], [7, 144000], [8, 432000], [9, 5270400]];
  for (const [slotLevel, turns] of cases) {
    assert.equal(getSpellDurationTurns("mass-suggestion", { slotLevel }), turns, `slot ${slotLevel}`);
    assert.deepEqual(getSpellEffects("mass-suggestion", "", { slotLevel })[0].expiry, { mode: "rounds", remaining: turns }, `slot ${slotLevel}`);
    const [failed] = getAreaSaveAutomation("mass-suggestion", "", { slotLevel }).failed;
    assert.deepEqual(failed.expiry, { mode: "rounds", remaining: turns }, `slot ${slotLevel}`);
  }
  assert.equal(getSpellEffects("mass-suggestion")[0].expiry.remaining, 14400, "no slot: the base duration");
  assert.doesNotMatch(getSpellEffects("mass-suggestion")[0].detail, /24 ore/u);
});

test("a duration by slot touches no other pill: a shorter one, or one on concentration, stays", () => {
  const fixed = (spellId, slotLevel) => getSpellEffects(spellId, "", { slotLevel }).map((effect) => effect.expiry);
  assert.deepEqual(fixed("hunters-mark", 5), fixed("hunters-mark", 1));
  assert.deepEqual(fixed("bestow-curse", 7), fixed("bestow-curse", 3));
  assert.deepEqual(fixed("mage-armor", 9), fixed("mage-armor", 1));
});

const defensesOf = (effect) => damageDefensesForItem({
  id: "creature",
  metadata: { [META]: { conditions: { instances: [{ id: "effect", active: true, mechanics: effect.mechanics }] } } },
}, META);
const defensePartIds = (effect) => effectSummaryPartsFor(effect).map((part) => part.id).filter((id) => id.startsWith("damage-defense-"));

test("Ice and Flame Investiture give real defenses, with one micropill each", () => {
  const [ice] = getSpellEffects("xanathar-investitura-del-ghiaccio");
  assert.deepEqual(defensesOf(ice), { immunities: ["cold"], resistances: ["fire"], vulnerabilities: [] });
  assert.deepEqual(defensePartIds(ice), ["damage-defense-immunity-cold", "damage-defense-resistance-fire"]);
  const [flame] = getSpellEffects("xanathar-investitura-della-fiamma");
  assert.deepEqual(defensesOf(flame), { immunities: ["fire"], resistances: ["cold"], vulnerabilities: [] });
  assert.deepEqual(defensePartIds(flame), ["damage-defense-immunity-fire", "damage-defense-resistance-cold"]);
});

test("Otherworldly Guise gives the immunities of the planes chosen, and its flight stays", () => {
  const [lower] = getSpellEffects("tasha-abito-ultraterreno-di-tasha", "lower-planes");
  assert.deepEqual(defensesOf(lower).immunities, ["fire", "poison"]);
  assert.deepEqual(defensePartIds(lower), ["damage-defense-immunity-fire", "damage-defense-immunity-poison"]);
  assert.equal(lower.mechanics.movement.modes.fly.grantMeters, 12);
  const [upper] = getSpellEffects("tasha-abito-ultraterreno-di-tasha", "upper-planes");
  assert.deepEqual(defensesOf(upper).immunities, ["necrotic", "radiant"]);
  assert.deepEqual(defensePartIds(upper), ["damage-defense-immunity-necrotic", "damage-defense-immunity-radiant"]);
  assert.equal(upper.mechanics.movement.modes.fly.grantMeters, 12);
});

test("Wind Walk takes the caster and up to ten creatures", () => {
  const contract = buildSpellUnifiedPanelContract({ spellId: "wind-walk", phase: "cast", castContext: { slotLevel: 6 } });
  assert.equal(contract.presentation.targeting.limit.maximum, 11);
  assert.equal(getSpellDefinition("wind-walk").defaultTurns, 4800);
});

const zoneNotice = (activationId, extra) => normalizeZoneTriggerNotice({
  activationId,
  turnKey: "2:1:target",
  spellName: "Zona",
  label: "Cosa succede",
  timing: "turn-end",
  targets: [{ id: "target", name: "Nothic" }],
  ...extra,
});
const eyebrowOf = (...notices) => saveReminderNoticeBatchPresentation(mergeSaveReminderNoticeBatch(null, notices)).eyebrow;

test("A zone reminder says damage only when there is damage to write", () => {
  assert.equal(eyebrowOf(zoneNotice("a", { resolution: "informational" })), "Effetto di zona · Fine turno");
  assert.equal(eyebrowOf(zoneNotice("b", { resolution: { mode: "manual-condition", condition: "Prono" } })), "Effetto di zona · Fine turno");
  assert.equal(eyebrowOf(zoneNotice("c", { kind: "zone-effect" })), "Danno di zona · Fine turno");
  assert.equal(eyebrowOf(zoneNotice("d", { resolution: { mode: "manual-damage", damage: { formula: "4d8" } } })), "Danno di zona · Fine turno");
  assert.equal(
    eyebrowOf(zoneNotice("e", { kind: "zone-effect" }), zoneNotice("f", { kind: "zone-effect" })),
    "Danni di zona · Fine turno",
  );
  assert.equal(
    eyebrowOf(zoneNotice("g", { resolution: "informational" }), zoneNotice("h", { kind: "zone-effect" })),
    "Effetti di zona · Fine turno",
  );
});
