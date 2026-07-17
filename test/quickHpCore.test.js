import test from "node:test";
import assert from "node:assert/strict";
import {
  QUICK_HP_FACTORS,
  QUICK_HP_MODES,
  calculateQuickHPChange,
  scaledQuickHPAmount,
} from "../src/quickHpCore.js";

test("rounds half damage down", () => {
  assert.equal(scaledQuickHPAmount(15, QUICK_HP_FACTORS.HALF), 7);
  assert.equal(scaledQuickHPAmount(15, QUICK_HP_FACTORS.QUARTER), 3);
});

test("applies full, double and quarter damage", () => {
  assert.equal(calculateQuickHPChange({ mode: QUICK_HP_MODES.DAMAGE, value: 8, hp: 20, hpMax: 20 }).afterHP, 12);
  assert.equal(calculateQuickHPChange({ mode: QUICK_HP_MODES.DAMAGE, value: 8, factor: QUICK_HP_FACTORS.DOUBLE, hp: 20, hpMax: 20 }).afterHP, 4);
  assert.equal(calculateQuickHPChange({ mode: QUICK_HP_MODES.DAMAGE, value: 8, factor: QUICK_HP_FACTORS.QUARTER, hp: 20, hpMax: 20 }).afterHP, 18);
});

test("damage never reduces HP below zero", () => {
  assert.equal(calculateQuickHPChange({ mode: QUICK_HP_MODES.DAMAGE, value: 50, hp: 12, hpMax: 12 }).afterHP, 0);
});

test("healing stops at max HP and preserves an existing surplus", () => {
  assert.equal(calculateQuickHPChange({ mode: QUICK_HP_MODES.HEAL, value: 20, hp: 45, hpMax: 50 }).afterHP, 50);
  assert.equal(calculateQuickHPChange({ mode: QUICK_HP_MODES.HEAL, value: 20, hp: 55, hpMax: 50 }).afterHP, 55);
});

test("temporary HP replace only a smaller existing surplus", () => {
  assert.equal(calculateQuickHPChange({ mode: QUICK_HP_MODES.TEMP, value: 10, hp: 50, hpMax: 50 }).afterHP, 60);
  assert.equal(calculateQuickHPChange({ mode: QUICK_HP_MODES.TEMP, value: 5, hp: 60, hpMax: 50 }).afterHP, 60);
  assert.equal(calculateQuickHPChange({ mode: QUICK_HP_MODES.TEMP, value: 15, hp: 60, hpMax: 50 }).afterHP, 65);
});

test("temporary HP add effective health without restoring missing normal HP", () => {
  assert.equal(calculateQuickHPChange({ mode: QUICK_HP_MODES.TEMP, value: 10, hp: 30, hpMax: 50 }).afterHP, 40);
});
