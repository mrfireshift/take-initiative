import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveSpellEffect,
  resolveSpellMechanics,
  spellMechanicsLabel,
} from "../src/spellMechanicsCore.js";

test("risolve valori meccanici scalabili dal livello dello slot", () => {
  const mechanics = resolveSpellMechanics({
    deriveLabel: true,
    tempHp: {
      amount: { base: 5, baseSlot: 1, perSlotAbove: 5 },
    },
    retaliationDamage: {
      amount: { base: 5, baseSlot: 1, perSlotAbove: 5 },
      type: "freddo",
    },
  }, { slotLevel: 4 });

  assert.equal(mechanics.tempHp.amount, 20);
  assert.equal(mechanics.retaliationDamage.amount, 20);
  assert.equal(
    spellMechanicsLabel(mechanics),
    "20 PF temp. / 20 freddo a chi colpisce in mischia",
  );
});

test("scala anche le summaryParts di Armatura di Agathys", () => {
  const effect = resolveSpellEffect({
    id: "agathys-armor",
    label: "5 PF temp. / 5 freddo a chi colpisce in mischia",
    summaryParts: [
      { id: "agathys-temporary-hit-points", label: "5 PF temp." },
      { id: "agathys-cold-retaliation", label: "5 danni freddo in mischia" },
    ],
    mechanics: {
      deriveLabel: true,
      tempHp: {
        amount: { base: 5, baseSlot: 1, perSlotAbove: 5 },
      },
      retaliationDamage: {
        amount: { base: 5, baseSlot: 1, perSlotAbove: 5 },
        type: "freddo",
      },
    },
  }, { slotLevel: 4 });

  assert.deepEqual(effect.summaryParts, [
    { id: "agathys-temporary-hit-points", label: "20 PF temp." },
    { id: "agathys-cold-retaliation", label: "20 danni freddo in mischia" },
  ]);
});

test("deriva una label compatta da bonus misurabili", () => {
  const effect = resolveSpellEffect({
    label: "fallback",
    mechanics: {
      deriveLabel: true,
      attackRoll: { modifierDice: "1d4" },
      savingThrow: { modifierDice: "1d4" },
    },
  });

  assert.equal(effect.label, "+1d4 Att/TS");
});

test("scala bonus al colpire e dadi di danno dagli slot dispari", () => {
  const effect = resolveSpellEffect({
    label: "fallback",
    mechanics: {
      deriveLabel: true,
      attackRoll: {
        bonus: { base: 1, baseSlot: 3, perSlotAbove: 1, step: 2, max: 3 },
      },
      damageBonus: {
        dice: {
          count: { base: 1, baseSlot: 3, perSlotAbove: 1, step: 2, max: 3 },
          sides: 4,
        },
        type: "fuoco",
      },
    },
  }, { slotLevel: 5 });

  assert.equal(effect.mechanics.attackRoll.bonus, 2);
  assert.equal(effect.mechanics.damageBonus.dice, "2d4");
  assert.equal(effect.label, "+2 Att / +2d4 fuoco");
});

test("scala il bonus di Arma magica secondo la progressione RAW", () => {
  const effect = resolveSpellEffect({
    label: "Arma magica · +1",
    mechanics: {
      deriveLabel: true,
      weaponBonus: {
        label: "Arma magica",
        bonus: { base: 1, baseSlot: 2, perSlotAbove: 1, step: 2, max: 3 },
      },
    },
  }, { slotLevel: 6 });

  assert.equal(effect.mechanics.weaponBonus.bonus, 3);
  assert.equal(effect.label, "Arma magica · +3");
});

test("le meccaniche non dichiarate per la derivazione conservano la label curata", () => {
  assert.equal(
    resolveSpellEffect({
      label: "Vant. TS magia / 0 danni su TS riuscito",
      mechanics: { savingThrow: { advantage: true } },
    }).label,
    "Vant. TS magia / 0 danni su TS riuscito",
  );
});
