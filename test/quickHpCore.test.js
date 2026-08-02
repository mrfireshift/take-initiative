import test from "node:test";
import assert from "node:assert/strict";
import {
  QUICK_HP_FACTORS,
  QUICK_HP_MODES,
  calculateQuickHPChange,
  createQuickHPVisualTransaction,
  failedQuickHPTargetIds,
  quickHPVisualUpdates,
  quickHPZeroReconcileTargetIds,
  scaledQuickHPAmount,
  shouldHandleQuickHPUndoShortcut,
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

test("seleziona soltanto i bersagli falliti dagli esiti TS", () => {
  const outcomes = new Map([
    ["passed", "passed"],
    ["failed", "failed"],
    ["immune", "immune"],
  ]);
  assert.deepEqual(
    failedQuickHPTargetIds([{ id: "passed" }, { id: "failed" }, { id: "immune" }], outcomes),
    ["failed"],
  );
});

test("prepara un unico lotto visuale per tutti i bersagli HP", () => {
  const entries = [
    { item: { id: "a" }, change: { hp: 20, afterHP: 13, hpMax: 20 } },
    { item: { id: "b" }, change: { hp: 12, afterHP: 5, hpMax: 12 } },
  ];
  assert.deepEqual(quickHPVisualUpdates(entries), [
    { tokenId: "a", hp: 13, hpMax: 20 },
    { tokenId: "b", hp: 5, hpMax: 12 },
  ]);
  assert.deepEqual(quickHPVisualUpdates(entries, { phase: "before" }), [
    { tokenId: "a", hp: 20, hpMax: 20 },
    { tokenId: "b", hp: 12, hpMax: 12 },
  ]);
});

test("la transazione visuale applica preview e recupero autorevole come lotti atomici", async () => {
  const calls = [];
  let releasePreview;
  const previewGate = new Promise((resolve) => { releasePreview = resolve; });
  const transaction = createQuickHPVisualTransaction([
    { tokenId: "a", hp: 4, hpMax: 10 },
    { tokenId: "b", hp: 7, hpMax: 12 },
  ], {
    syncVisuals: (updates) => {
      calls.push(updates);
      return calls.length === 1 ? previewGate : Promise.resolve();
    },
  });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].map((update) => update.tokenId), ["a", "b"]);
  let authoritativeReadStarted = false;
  const recovery = transaction.recover(async (targetIds) => {
    authoritativeReadStarted = true;
    assert.deepEqual(targetIds, ["a", "b"]);
    return [
      { tokenId: "a", hp: 10, hpMax: 10 },
      { tokenId: "b", hp: 12, hpMax: 12 },
    ];
  });
  await Promise.resolve();
  assert.equal(authoritativeReadStarted, false);

  releasePreview();
  await recovery;
  assert.equal(authoritativeReadStarted, true);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1], [
    { tokenId: "a", hp: 10, hpMax: 10 },
    { tokenId: "b", hp: 12, hpMax: 12 },
  ]);
});

test("la riconciliazione zero HP include soltanto i bersagli con una modifica reale", () => {
  const entries = ["stable", "add", "remove", "add"].map((id) => ({ item: { id } }));
  assert.deepEqual(
    quickHPZeroReconcileTargetIds(entries, (entry) => ({
      add: entry.item.id === "add",
      removeInstanceIds: entry.item.id === "remove" ? ["automatic"] : [],
    })),
    ["add", "remove"],
  );
});

test("Ctrl+Z usa l'undo atomico della Console HP solo quando disponibile", () => {
  assert.equal(shouldHandleQuickHPUndoShortcut({
    key: "z",
    ctrlKey: true,
    hasHistoryEntry: true,
  }), true);
  assert.equal(shouldHandleQuickHPUndoShortcut({
    key: "Z",
    metaKey: true,
    hasHistoryEntry: true,
  }), true);
  assert.equal(shouldHandleQuickHPUndoShortcut({
    key: "z",
    ctrlKey: true,
    shiftKey: true,
    hasHistoryEntry: true,
  }), false);
  assert.equal(shouldHandleQuickHPUndoShortcut({
    key: "z",
    ctrlKey: true,
    busy: true,
    hasHistoryEntry: true,
  }), false);
});
