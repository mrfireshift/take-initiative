// CAP-DURATION, CAP-MODE, CAP-REPEAT-HEAL: Bestow Curse, Alter Self and Regenerate, the rules and the panel. The
// expectations below are read from the 2014 texts, not from the definitions under test.
import test, { mock } from "node:test";
import assert from "node:assert/strict";

mock.module("@owlbear-rodeo/sdk", {
  exports: {
    default: { onReady() {}, scene: { items: { getItems: async () => [] } } },
    buildPath: () => ({}),
    buildLabel: () => ({}),
    buildImage: () => ({}),
    buildText: () => ({}),
    buildShape: () => ({}),
    Command: { MOVE: 0, LINE: 1, CUBIC: 2, CLOSE: 3 },
  },
});

const { getSpellDefinition, getSpellDurationTurns, getSpellEffects } = await import("../src/spells-srd.js");
const { spellForCastContext } = await import("../src/spellCastContextCore.js");
const { buildSpellUnifiedPanelContract } = await import("../src/spellUnifiedPanelCore.js");
const { buildSpellActiveActionPlan } = await import("../src/spellActiveActionCore.js");
const { normalizeEffectSaveReminder } = await import("../src/effectSaveReminderCore.js");
const { spellCastHealingDice } = await import("../src/spellTemporaryHpRules.js");
const { getSpellUnifiedLifecycleEligibility } = await import("../src/spellUnifiedLifecycleAdapter.js");

const curse = getSpellDefinition("bestow-curse");

test("Bestow Curse: the slot decides the duration and the concentration", () => {
  const cases = [[3, 10, true], [4, 100, true], [5, 4800, false], [6, 4800, false], [7, 14400, false], [8, 14400, false], [9, 14400, false]];
  for (const [slotLevel, turns, concentration] of cases) {
    const cast = spellForCastContext(curse, { slotLevel });
    assert.equal(getSpellDurationTurns(curse, { slotLevel }), turns, `slot ${slotLevel}`);
    assert.equal(cast.concentration, concentration, `slot ${slotLevel}`);
    assert.equal(buildSpellUnifiedPanelContract({ spellId: "bestow-curse", phase: "cast", castContext: { slotLevel } }).spell.concentration, concentration);
  }
  assert.equal(spellForCastContext(curse, { slotLevel: 8 }).expiry, curse.expiry, "8 hours and 24 hours run out");
  assert.deepEqual(spellForCastContext(curse, { slotLevel: 9 }).expiry, { mode: "manual" }, "until dispelled");
  assert.equal(spellForCastContext(curse, {}), curse, "no slot: the spell as it is");
});

test("the panel's concentration badge follows the slot of this cast", async () => {
  const { buildUnifiedPanelViewModel } = await import("../src/spellUnifiedPanelViewCore.js");
  const { createSpellPanelSession } = await import("../src/spellUnifiedPanelCore.js");
  const badge = (slotLevel) => {
    const contract = buildSpellUnifiedPanelContract({ spellId: "bestow-curse", phase: "cast", castContext: { slotLevel } });
    return buildUnifiedPanelViewModel({ contract, session: createSpellPanelSession({ contract, casterId: "mage", slotLevel }), targetCandidates: [] })
      .catalog.selectedConcentration;
  };
  assert.deepEqual([badge(3), badge(4), badge(5), badge(9)], [true, true, false, false]);
});

test("the other spells keep their concentration at any slot", () => {
  const bless = getSpellDefinition("bless");
  assert.equal(spellForCastContext(bless, { slotLevel: 9 }), bless);
  const hunter = getSpellDefinition("hunters-mark");
  assert.equal(spellForCastContext(hunter, { slotLevel: 5 }).concentration, true, "a duration by slot alone lifts nothing");
  assert.equal(spellForCastContext(curse, { slotLevel: 3, withoutConcentration: "bestow-curse" }).concentration, false, "Wild Magic Surge as before");
});

const alter = getSpellDefinition("alter-self");
const form = (actionId, effectInstances = []) => buildSpellActiveActionPlan({ spell: alter, actionId, casterName: "Maga",
  group: { casterId: "mage", instanceId: "spell-1", castContext: { choice: "natural-weapons" }, effectInstances } });
const active = (effectId, instanceId) => ({ itemId: "mage", instanceId, effectId, active: true });

test("Alter Self: three buttons, each swaps the form in place for its own", () => {
  assert.deepEqual(alter.activeActions?.map?.((action) => action.buttonLabel) ?? null,
    ["Adattamento acquatico", "Armi naturali", "Cambiare aspetto"]);
  const plan = form("alter-self-form-aquatic-adaptation", [active("alter-self-natural-weapons", "pill-1"), active("other", "pill-2")]);
  assert.equal(plan.valid, true, JSON.stringify(plan.errors));
  const removal = plan.operations.find((operation) => operation.type === "condition:remove-instances");
  assert.deepEqual(removal.removals, [{ itemId: "mage", instanceId: "pill-1" }], "only a form makes way");
  const added = plan.operations.find((operation) => operation.type === "condition:add");
  assert.deepEqual([added.targetIds, added.options.effectId, added.options.expiry, added.options.parentEffectId],
    [["mage"], "aquatic-adaptation", { mode: "concentration" }, "spell-1"]);
  assert.equal(plan.operations.some((operation) => operation.type === "spell:remove-instance"), false, "the spell stays");
});

test("Alter Self: no form in place is no error, as after a pill taken off by hand", () => {
  const plan = form("alter-self-form-change-appearance", []);
  assert.equal(plan.valid, true, JSON.stringify(plan.errors));
  assert.equal(plan.operations.some((operation) => operation.type === "condition:remove-instances"), false);
});

test("Alter Self: the variants of the cast are the same forms as the buttons'", () => {
  const effectOf = (choiceValue) => getSpellEffects(alter, choiceValue).map((effect) => effect.id);
  assert.deepEqual(effectOf("aquatic-adaptation"), ["aquatic-adaptation"]);
  assert.deepEqual(effectOf("natural-weapons"), ["alter-self-natural-weapons"]);
  assert.deepEqual(effectOf("change-appearance"), ["alter-self-appearance"]);
});

test("Regenerate: the panel asks the total of the 4d8 + 15, one target", () => {
  assert.equal(spellCastHealingDice("regenerate"), "4d8+15");
  assert.equal(spellCastHealingDice("cure-wounds"), "");
  const contract = buildSpellUnifiedPanelContract({ spellId: "regenerate", phase: "cast", castContext: { slotLevel: 7 } });
  assert.deepEqual(contract.presentation.inputs.healing, { required: true, visible: true, dice: "4d8+15" });
  assert.equal(contract.execution.lane, "spell-lifecycle");
  assert.equal(contract.presentation.targeting.limit.maximum, 1);
  assert.equal(getSpellUnifiedLifecycleEligibility(contract).eligible, true, "the cast can be applied from the panel");
  const heal = buildSpellUnifiedPanelContract({ spellId: "cure-wounds", phase: "cast", castContext: { slotLevel: 1 } });
  assert.equal(getSpellUnifiedLifecycleEligibility(heal).eligible, false, "an area heal stays in its own lane");
});

test("the reminder of a fixed healing keeps its amount through the normalizer; a healing with nothing to give is refused", () => {
  assert.deepEqual(normalizeEffectSaveReminder({ mode: "manual-heal", timing: "turn-start", fixedHealing: 1 }),
    { timing: "turn-start", actor: "target", mode: "manual-heal", fixedHealing: 1 });
  assert.equal(normalizeEffectSaveReminder({ mode: "manual-heal", timing: "turn-start", fixedHealing: 0 }), null);
  assert.equal(normalizeEffectSaveReminder({ mode: "manual-heal", timing: "turn-start", fixedHealing: "x" }), null);
});
