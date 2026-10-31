import test from "node:test";
import assert from "node:assert/strict";
import {
  QUICK_HP_FACTORS,
  QUICK_HP_MODES,
  calculateQuickHPChange,
  createQuickHPVisualTransaction,
  failedQuickHPTargetIds,
  isQuickHPDamageChange,
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

// CAP-TEMP (PHB 2014, p. 198): the temporary hit points sit in meta.tempHp, apart from the HP up to hpMax.
const hpAndTemp = (change) => [change.afterHP, change.afterTempHp];

test("healing stops at max HP and never gives temporary hit points back", () => {
  assert.equal(calculateQuickHPChange({ mode: QUICK_HP_MODES.HEAL, value: 20, hp: 45, hpMax: 50 }).afterHP, 50);
  assert.deepEqual(hpAndTemp(calculateQuickHPChange({ mode: QUICK_HP_MODES.HEAL, value: 20, hp: 30, hpMax: 50, tempHp: 5 })),
    [50, 5]);
  assert.deepEqual(hpAndTemp(calculateQuickHPChange({ mode: QUICK_HP_MODES.HEAL, value: 20, hp: 55, hpMax: 50 })), [50, 5],
    "the old encoding: the part above hpMax is temporary");
});

test("temporary HP don't add up: the higher stays", () => {
  assert.deepEqual(hpAndTemp(calculateQuickHPChange({ mode: QUICK_HP_MODES.TEMP, value: 10, hp: 50, hpMax: 50 })), [50, 10]);
  assert.deepEqual(hpAndTemp(calculateQuickHPChange({ mode: QUICK_HP_MODES.TEMP, value: 5, hp: 50, hpMax: 50, tempHp: 10 })), [50, 10]);
  const higher = calculateQuickHPChange({ mode: QUICK_HP_MODES.TEMP, value: 15, hp: 50, hpMax: 50, tempHp: 10 });
  assert.deepEqual([...hpAndTemp(higher), higher.delta, higher.changed], [50, 15, 5, true]);
  assert.equal(calculateQuickHPChange({ mode: QUICK_HP_MODES.TEMP, value: 5, hp: 50, hpMax: 50, tempHp: 10 }).changed, false);
});

test("temporary HP on a wounded creature restore none of its HP", () => {
  assert.deepEqual(hpAndTemp(calculateQuickHPChange({ mode: QUICK_HP_MODES.TEMP, value: 10, hp: 30, hpMax: 50 })), [30, 10],
    "30/50 with 10 temporary, not 40");
});

test("damage takes the temporary hit points first, the rest from the HP", () => {
  const partial = calculateQuickHPChange({ mode: QUICK_HP_MODES.DAMAGE, value: 4, hp: 30, hpMax: 50, tempHp: 10 });
  assert.deepEqual([...hpAndTemp(partial), partial.absorbedByTempHp, partial.delta, isQuickHPDamageChange(partial)],
    [30, 6, 4, -4, true], "damage they take is damage all the same");
  const through = calculateQuickHPChange({ mode: QUICK_HP_MODES.DAMAGE, value: 14, hp: 30, hpMax: 50, tempHp: 10 });
  assert.deepEqual([...hpAndTemp(through), through.absorbedByTempHp, through.hpDelta], [26, 0, 10, -4]);
  assert.deepEqual(hpAndTemp(calculateQuickHPChange({ mode: QUICK_HP_MODES.DAMAGE, value: 8, hp: 55, hpMax: 50 })), [47, 0],
    "the old encoding: 5 temporary, then 3 from the HP");
});

test("quickHPWriteWithinMax: a write above hpMax keeps the part above as temporary hit points", async () => {
  const { quickHPWriteWithinMax, quickHPTempHpPatchField } = await import("../src/quickHpCore.js");
  assert.deepEqual(quickHPWriteWithinMax({ itemId: "a", hp: 13, hpMax: 10 }), { itemId: "a", hp: 10, hpMax: 10, tempHp: 3 });
  const within = { itemId: "a", hp: 8, hpMax: 10 };
  assert.equal(quickHPWriteWithinMax(within), within, "within hpMax and without tempHp: unchanged");
  assert.deepEqual(quickHPTempHpPatchField({}, 4), { value: 4 });
  assert.equal(quickHPTempHpPatchField({}, 0), null, "absent at 0");
  assert.deepEqual(quickHPTempHpPatchField({ tempHp: 3 }, 0), { mode: "delete" });
});

test("classifica come danno solo una diminuzione effettiva degli HP", () => {
  assert.equal(isQuickHPDamageChange(calculateQuickHPChange({
    mode: QUICK_HP_MODES.DAMAGE,
    value: 8,
    hp: 20,
    hpMax: 20,
  })), true);
  assert.equal(isQuickHPDamageChange(calculateQuickHPChange({
    mode: QUICK_HP_MODES.HEAL,
    value: 8,
    hp: 12,
    hpMax: 20,
  })), false);
  assert.equal(isQuickHPDamageChange(calculateQuickHPChange({
    mode: QUICK_HP_MODES.TEMP,
    value: 8,
    hp: 12,
    hpMax: 20,
  })), false);
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

// CAP-TEMP replaces lot L7's refusal (D6): at 0 HP the temporary hit points neither wake nor stabilize the creature,
// as they sit apart from its HP, and they take the damage first (PHB 2014, p. 198).
test("i PF temporanei a 0 PF non svegliano, ma assorbono i danni prima dei TS contro la morte", () => {
  const atZero = calculateQuickHPChange({ mode: QUICK_HP_MODES.TEMP, value: 6, hp: 0, hpMax: 20 });
  assert.deepEqual([atZero.afterHP, atZero.afterTempHp, atZero.changed], [0, 6, true]);
  const absorbed = calculateQuickHPChange({ mode: QUICK_HP_MODES.DAMAGE, value: 4, hp: 0, hpMax: 20, tempHp: 6,
    deathSaveDamage: true });
  assert.equal(absorbed.deathSaveDamage, undefined, "no death save failure: the temporary hit points took it");
  const through = calculateQuickHPChange({ mode: QUICK_HP_MODES.DAMAGE, value: 9, hp: 0, hpMax: 20, tempHp: 6,
    deathSaveDamage: true });
  assert.equal(through.deathSaveDamage, true);
});

test("the HP bar's parts: the HP, then the temporary hit points, on the maximum or on their total past it", async () => {
  const { quickHPBarSegments } = await import("../src/quickHpCore.js");
  assert.deepEqual(quickHPBarSegments({ hp: 20, hpMax: 40, tempHp: 10 }), { hpRatio: 0.5, tempRatio: 0.25, colorRatio: 0.5 });
  assert.deepEqual(quickHPBarSegments({ hp: 40, hpMax: 40, tempHp: 10 }), { hpRatio: 0.8, tempRatio: 0.2, colorRatio: 1 });
  assert.deepEqual(quickHPBarSegments({ hp: 50, hpMax: 40 }), { hpRatio: 0.8, tempRatio: 0.2, colorRatio: 1 }, "the old encoding");
  assert.deepEqual(quickHPBarSegments({ hp: 0, hpMax: 0 }), { hpRatio: 0, tempRatio: 0, colorRatio: 0 });
});
