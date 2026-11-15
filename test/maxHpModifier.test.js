import assert from "node:assert/strict";
import test from "node:test";
import {
  maxHpBaseValues,
  maxHpBonusFromInstances,
  maxHpBonusOf,
  maxHpEffectiveValues,
  maxHpModifierOf,
  maxHpModifiersFromInstances,
} from "../src/maxHpModifierCore.js";

// CAP-MAXHP (docs/PIANO_CAP_MAXHP.md): the bonus of the pills, decision M2, and the memory's rule M0.
const pill = (id, amount, extra = {}) => ({
  id,
  condition: extra.condition || "Aiuto",
  spellId: extra.spellId ?? "aid",
  ...(extra.active === false ? { active: false } : {}),
  mechanics: { maxHp: { amount, ...(extra.raisesCurrent ? { raisesCurrent: true } : {}), ...(extra.stack ? { stack: extra.stack } : {}) } },
});

test("CAP-MAXHP: una pill attiva dice di quanto cambia il massimo, una spenta o senza importo no", () => {
  assert.deepEqual(maxHpModifierOf(pill("a", 5, { raisesCurrent: true })),
    { amount: 5, raisesCurrent: true, stack: "aid", instanceId: "a" });
  assert.equal(maxHpModifierOf(pill("b", 5, { active: false })), null);
  assert.equal(maxHpModifierOf(pill("c", 0)), null);
  assert.equal(maxHpModifierOf({ id: "d", condition: "Prono" }), null);
  // Without a spell the effect counts as itself.
  assert.equal(maxHpModifierOf(pill("e", -7, { spellId: "" })).stack, "e");
  assert.equal(maxHpModifierOf(pill("f", -7, { stack: "harm" })).stack, "harm");
});

test("CAP-MAXHP, M2: lo stesso incantesimo vale una volta, il più forte; incantesimi diversi si sommano", () => {
  // Aid twice, at the 2nd and at the 3rd: +10, not +15.
  assert.equal(maxHpBonusFromInstances([pill("a1", 5), pill("a2", 10)]), 10);
  // Aid and Heroes' Feast: they add up.
  assert.equal(maxHpBonusFromInstances([pill("a1", 5), pill("f1", 12, { spellId: "heroes-feast" })]), 17);
  // Harm twice: the larger reduction.
  assert.equal(maxHpBonusFromInstances([pill("h1", -40, { spellId: "harm" }), pill("h2", -20, { spellId: "harm" })]), -40);
  // A bonus and a reduction of different spells.
  assert.equal(maxHpBonusFromInstances([pill("a1", 5), pill("h1", -30, { spellId: "harm" })]), -25);
  assert.deepEqual(maxHpModifiersFromInstances([pill("a1", 5), pill("a2", 10)]).map((modifier) => modifier.instanceId), ["a2"]);
  // The pills as the tracker keeps them: a list or { instances }.
  assert.equal(maxHpBonusOf({ conditions: { instances: [pill("a1", 5)] } }), 5);
  assert.equal(maxHpBonusOf({ conditions: [pill("a1", 5), pill("x", 3, { active: false, spellId: "other" })] }), 5);
  assert.equal(maxHpBonusOf({}), 0);
});

test("CAP-MAXHP, M0: la memoria tiene la creatura come se gli effetti finissero adesso", () => {
  const aid = { conditions: [pill("a1", 5, { raisesCurrent: true })] };
  assert.deepEqual(maxHpBaseValues({ hp: 35, hpMax: 35 }, aid), { hp: 30, hpMax: 30 });
  assert.deepEqual(maxHpBaseValues({ hp: 32, hpMax: 35 }, aid), { hp: 30, hpMax: 30 });
  assert.deepEqual(maxHpBaseValues({ hp: 27, hpMax: 35 }, aid), { hp: 27, hpMax: 30 });
  // A reduction: the maximum comes back, the hit points stay.
  const harm = { conditions: [pill("h1", -49, { spellId: "harm" })] };
  assert.deepEqual(maxHpBaseValues({ hp: 40, hpMax: 51 }, harm), { hp: 40, hpMax: 100 });
  // The maximum is never below 1.
  assert.deepEqual(maxHpBaseValues({ hp: 3, hpMax: 3 }, aid), { hp: 1, hpMax: 1 });
});

test("CAP-MAXHP, M0: senza pill i valori restano quelli di oggi, anche i temporanei del vecchio formato", () => {
  assert.deepEqual(maxHpBaseValues({ hp: 35, hpMax: 30 }, { conditions: [] }), { hp: 35, hpMax: 30 });
  assert.deepEqual(maxHpEffectiveValues({ hp: 35, hpMax: 30 }, {}), { hp: 35, hpMax: 30 });
  assert.deepEqual(maxHpBaseValues({ hp: 12, hpMax: 24 }, null), { hp: 12, hpMax: 24 });
});

test("CAP-MAXHP, M0: un token riprende dalla memoria il bonus delle sue pill", () => {
  const aid = { conditions: [pill("a1", 5, { raisesCurrent: true })] };
  assert.deepEqual(maxHpEffectiveValues({ hp: 30, hpMax: 30 }, aid), { hp: 30, hpMax: 35 });
  assert.deepEqual(maxHpEffectiveValues({ hp: 27, hpMax: 30 }, aid), { hp: 27, hpMax: 35 });
  // A reduction: the hit points do not go above the reduced maximum.
  const harm = { conditions: [pill("h1", -49, { spellId: "harm" })] };
  assert.deepEqual(maxHpEffectiveValues({ hp: 80, hpMax: 100 }, harm), { hp: 51, hpMax: 51 });
  assert.deepEqual(maxHpEffectiveValues({ hp: 10, hpMax: 40 }, harm), { hp: 1, hpMax: 1 });
  // Back and forth: the base of the effective values is the base.
  const effective = maxHpEffectiveValues({ hp: 27, hpMax: 30 }, aid);
  assert.deepEqual(maxHpBaseValues(effective, aid), { hp: 27, hpMax: 30 });
});

const { planMaxHpChange, maxHpEffectForCast, maxHpConditionOptionsAsLabel, maxHpSummaryLabel } =
  await import("../src/maxHpModifierCore.js");

test("X1: la scrittura di un comando: il massimo si sposta della differenza, i PF salgono solo con una pill che lo dice", () => {
  const aid5 = pill("a5", 5, { raisesCurrent: true });
  const aid10 = pill("a10", 10, { raisesCurrent: true });
  const harm = pill("h", -30, { spellId: "harm" });
  // Aid arrives.
  assert.deepEqual(planMaxHpChange({ beforeInstances: [], afterInstances: [aid5], state: { hp: 20, hpMax: 30 } }),
    { hp: 25, hpMax: 35, bonusBefore: 0, bonusAfter: 5, raised: 5 });
  // Aid ends: the hit points only within the maximum.
  assert.deepEqual(planMaxHpChange({ beforeInstances: [aid5], afterInstances: [], state: { hp: 33, hpMax: 35 } }),
    { hp: 30, hpMax: 30, bonusBefore: 5, bonusAfter: 0, raised: 0 });
  // A stronger Aid over the first: 5 more, the hit points too.
  assert.equal(planMaxHpChange({ beforeInstances: [aid5], afterInstances: [aid5, aid10], state: { hp: 35, hpMax: 35 } }).hp, 40);
  // A reduction arrives and ends: the hit points never go up for it.
  assert.deepEqual(planMaxHpChange({ beforeInstances: [], afterInstances: [harm], state: { hp: 50, hpMax: 60 } }),
    { hp: 30, hpMax: 30, bonusBefore: 0, bonusAfter: -30, raised: 0 });
  assert.deepEqual(planMaxHpChange({ beforeInstances: [harm], afterInstances: [], state: { hp: 12, hpMax: 30 } }),
    { hp: 12, hpMax: 60, bonusBefore: -30, bonusAfter: 0, raised: 0 });
  // The maximum never below 1; nothing to do when the bonus stays.
  assert.equal(planMaxHpChange({ beforeInstances: [], afterInstances: [harm], state: { hp: 9, hpMax: 20 } }).hpMax, 1);
  assert.equal(planMaxHpChange({ beforeInstances: [aid5], afterInstances: [aid5], state: { hp: 9, hpMax: 20 } }), null);
});

test("X1: Aiuto prende l'importo del suo slot, e il chip lo dice", () => {
  const definition = { id: "aid-vitality", label: "Aiuto", summaryParts: [{ id: "aid-max-hp", label: "PF max +5" }, { id: "other", label: "Altro" }],
    mechanics: { maxHp: { base: 5, baseSlot: 2, perSlotAbove: 5, raisesCurrent: true } } };
  const third = maxHpEffectForCast(definition, 3);
  assert.deepEqual(third.mechanics.maxHp, { raisesCurrent: true, amount: 10 });
  assert.deepEqual(third.summaryParts.map((part) => part.label), ["PF max +10", "Altro"]);
  assert.equal(third.detail, "PF max +10", "the tooltip says it too");
  assert.equal(maxHpEffectForCast({ ...definition, detail: "Dura 8 ore." }, 2).detail, "PF max +5. Dura 8 ore.");
  assert.equal(maxHpEffectForCast(definition, null).mechanics.maxHp.amount, 5, "no slot: the base one");
  assert.equal(maxHpEffectForCast(definition, 1).mechanics.maxHp.amount, 5, "never below the base slot");
  assert.equal(maxHpEffectForCast(definition, 9).mechanics.maxHp.amount, 40);
  // A definition with no slot rule comes back as it is.
  const fixed = { id: "x", mechanics: { maxHp: { amount: -7 } } };
  assert.equal(maxHpEffectForCast(fixed, 5), fixed);
  assert.equal(maxHpSummaryLabel(-7), "PF max −7");
});

test("X1, M9: dove i PF non cambiano da soli la pill resta un'etichetta", () => {
  const options = { effectId: "aid-vitality", effectDetail: "PF aumentati.", summaryParts: [{ id: "aid-max-hp", label: "PF max +5" }],
    mechanics: { maxHp: { amount: 5, raisesCurrent: true } } };
  const label = maxHpConditionOptionsAsLabel(options);
  assert.equal(label.mechanics, undefined);
  assert.deepEqual(label.summaryParts, []);
  assert.match(label.effectDetail, /^PF aumentati\. Qui i PF non cambiano da soli/u);
  assert.deepEqual(maxHpConditionOptionsAsLabel({ mechanics: { maxHp: { amount: 5 }, carriage: { capacity: 1 } } }).mechanics,
    { carriage: { capacity: 1 } }, "the other mechanics stay");
});
