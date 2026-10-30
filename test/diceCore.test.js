import assert from "node:assert/strict";
import test from "node:test";
import {
  createDiceRollRecord,
  DICE_MAX_COUNT,
  diceRollDetail,
  diceRollHistoryWith,
  diceThrowParameters,
  formatDiceFormula,
  formulaFromDiceCounts,
  normalizeDiceRollRecord,
  parseDiceFormula,
  percentileDigits,
  physicalDiceOf,
  randomDieValue,
  rollDiceFormula,
  withAdvantage,
} from "../src/diceCore.js";

// Online dice tray, lot D-1 (docs/PIANO_DADI_ONLINE.md): formula, unbiased random values, result, throw, record.
const sequence = (...values) => {
  let index = 0;
  return () => values[index++ % values.length];
};
// A uint32 draw that gives `value` on a die of `sides` (value - 1, below every rejection limit).
const draw = (value) => value - 1;

test("la formula accetta gruppi, segni, tieni il più alto o il più basso, d% e modificatore", () => {
  assert.deepEqual(parseDiceFormula(" 2d6 + 1d20kh1 - 1d4 + 3 "), {
    ok: true,
    groups: [
      { count: 2, sides: 6, sign: 1, keep: null },
      { count: 1, sides: 20, sign: 1, keep: { mode: "high", count: 1 } },
      { count: 1, sides: 4, sign: -1, keep: null },
    ],
    modifier: 3,
  });
  assert.deepEqual(parseDiceFormula("d%").groups, [{ count: 1, sides: 100, sign: 1, keep: null }]);
  assert.deepEqual(parseDiceFormula("4d6k3").groups[0].keep, { mode: "high", count: 3 });
  assert.deepEqual(parseDiceFormula("2D20KL1").groups[0].keep, { mode: "low", count: 1 });
  assert.equal(formatDiceFormula(parseDiceFormula("d20-2+1")), "1d20-1");
});

test("una formula sbagliata dice perché", () => {
  assert.match(parseDiceFormula("").error, /Scrivi una formula/);
  assert.match(parseDiceFormula("1d7").error, /d7/);
  assert.match(parseDiceFormula("4d6kh5").error, /da 1 a 4/);
  assert.match(parseDiceFormula(`${DICE_MAX_COUNT + 1}d6`).error, /Al massimo/);
  assert.match(parseDiceFormula("5").error, /almeno un dado/);
  assert.match(parseDiceFormula("2d6*2").error, /non valid/);
  assert.match(parseDiceFormula("0d6").error, /almeno un dado/);
});

test("vantaggio e svantaggio raddoppiano l'unico d20", () => {
  const advantage = withAdvantage(parseDiceFormula("1d20+5"), "advantage");
  assert.equal(formatDiceFormula(advantage), "2d20kh1+5");
  assert.equal(formatDiceFormula(withAdvantage(parseDiceFormula("d20"), "disadvantage")), "2d20kl1");
  assert.match(withAdvantage(parseDiceFormula("2d20"), "advantage").error, /un solo d20/);
  assert.equal(formatDiceFormula(withAdvantage(parseDiceFormula("d20"), null)), "1d20");
});

test("i pulsanti del vassoio compongono la formula", () => {
  assert.equal(formulaFromDiceCounts({ 6: 2, 20: 1 }, 3), "1d20+2d6+3");
  assert.equal(formulaFromDiceCounts({ 100: 1, 4: 1 }, -1), "1d100+1d4-1");
  assert.equal(formulaFromDiceCounts({}, 0), "");
});

test("i valori sono senza distorsione: le estrazioni oltre l'ultimo multiplo si scartano", () => {
  const limit = Math.floor(0x100000000 / 6) * 6;
  assert.equal(randomDieValue(6, sequence(limit, limit + 5, 13)), 2, "two draws thrown away, then 13 % 6 + 1");
  assert.equal(randomDieValue(20, sequence(19)), 20);
  const real = Array.from({ length: 500 }, () => randomDieValue(20));
  assert.ok(real.every((value) => value >= 1 && value <= 20));
});

test("il tiro tiene il dado giusto e calcola il totale con i segni", () => {
  const parsed = withAdvantage(parseDiceFormula("1d20+1d6-1d4+2"), "advantage");
  const result = rollDiceFormula(parsed, { nextUint32: sequence(draw(9), draw(14), draw(5), draw(3)) });
  assert.deepEqual(result.groups[0].dice, [{ value: 9, kept: false }, { value: 14, kept: true }]);
  assert.equal(result.total, 14 + 5 - 3 + 2);
  assert.equal(diceRollDetail(result), "2d20kh1: 9 scartato, 14 · 1d6: 5 · −1d4: 3 · +2 = 18");
  const ties = rollDiceFormula(parseDiceFormula("3d6kl1"), { nextUint32: sequence(draw(2), draw(2), draw(6)) });
  assert.deepEqual(ties.groups[0].dice.map((die) => die.kept), [true, false, false], "a tie keeps the first die");
});

test("un d100 sono due d10, decine e unità; 100 è 00 e 0", () => {
  assert.deepEqual(percentileDigits(37), { tens: 30, units: 7 });
  assert.deepEqual(percentileDigits(100), { tens: 0, units: 0 });
  assert.deepEqual(percentileDigits(5), { tens: 0, units: 5 });
  const result = rollDiceFormula(parseDiceFormula("1d100+1d8"), { nextUint32: sequence(draw(42), draw(8)) });
  assert.deepEqual(physicalDiceOf(result), [
    { sides: 10, face: 40, percentile: "tens", kept: true },
    { sides: 10, face: 2, percentile: "units", kept: true },
    { sides: 8, face: 8, kept: true },
  ]);
});

test("i parametri del lancio sono numeri piccoli, uno per dado fisico", () => {
  const throws = diceThrowParameters(3);
  assert.equal(throws.length, 3);
  for (const entry of throws) {
    assert.ok(entry.position.y >= 1.5 && entry.position.y <= 2.5);
    assert.ok(Math.abs(Math.hypot(entry.rotation.x, entry.rotation.y, entry.rotation.z, entry.rotation.w) - 1) < 0.001);
  }
  assert.ok(JSON.stringify(diceThrowParameters(2 * DICE_MAX_COUNT)).length < 16_000, "a whole roll fits a broadcast");
});

test("un tiro ricevuto si controlla e il totale si ricalcola dai valori", () => {
  const result = rollDiceFormula(parseDiceFormula("2d6+3"), { nextUint32: sequence(draw(4), draw(5)) });
  const record = createDiceRollRecord({
    id: "roll-1",
    result,
    throws: diceThrowParameters(2),
    player: { id: "user-mario", connectionId: "c1", name: "Mario" },
    character: "Eroe",
    at: 1000,
  });
  const received = normalizeDiceRollRecord({ ...record, total: 99, extra: "<b>" });
  assert.equal(received.total, 12, "the sender's total is not trusted");
  assert.equal(received.extra, undefined);
  assert.equal(received.throws.length, 2);
  assert.equal(normalizeDiceRollRecord({ ...record, groups: [{ sides: 6, dice: [{ value: 7 }] }] }), null);
  assert.equal(normalizeDiceRollRecord({ ...record, groups: [{ sides: 7, dice: [{ value: 3 }] }] }), null);
  assert.equal(normalizeDiceRollRecord({ ...record, id: "bad id!" }), null);
  assert.equal(normalizeDiceRollRecord({ ...record, throws: [{}] }).throws.length, 0, "a throw per physical die or none");
});

test("lo storico tiene gli ultimi tiri, dal più recente, senza doppioni", () => {
  let history = [];
  for (let index = 0; index < 60; index += 1) history = diceRollHistoryWith(history, { id: `r${index}`, at: index });
  assert.equal(history.length, 50);
  assert.equal(history[0].id, "r59");
  history = diceRollHistoryWith(history, { id: "r59", at: 59 });
  assert.equal(history.filter((entry) => entry.id === "r59").length, 1);
});
