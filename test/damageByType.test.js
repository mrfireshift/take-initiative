// M3 of the class features' defenses (08/11): the pieces of one damage type are summed before the save and the defense, which
// halve the type once (PHB 2014): 7 + 3 slashing against a resistance are 5, not 3 + 1. The preview, the counts and the commit
// agree; the log keeps its pieces, the rounding's points on the type's first one.
import assert from "node:assert/strict";
import test, { mock } from "node:test";

mock.module("@owlbear-rodeo/sdk", { exports: { default: { onReady() {} }, buildLabel() {}, buildImage() {}, buildText() {}, buildPath() {}, buildShape() {}, Command: class {} } });
const { bossDefendedDamage, bossDefenseCounts } = await import("../src/bossActionsViewCore.js");
const { defendedComponents } = await import("../src/bossActionExecutionCore.js");

const META = "com.thebigpicture.initiative/meta";
const target = (damageDefenses) => ({ id: "t", name: "t", metadata: { [META]: { hp: 50, hpMax: 50, initiativeCard: { damageDefenses } } } });
const two = [{ id: "c1", type: "slashing" }, { id: "c2", type: "slashing" }];
const amounts = { c1: 7, c2: 3 };
const RES = { resistances: ["slashing"] };

test("one halving per type: resistance, a passed save, and both", () => {
  assert.equal(bossDefendedDamage(two, amounts, "hit", RES), 5, "resisted: 10 → 5");
  assert.equal(bossDefendedDamage(two, amounts, "passed", {}), 5, "a passed save: 10 → 5");
  assert.equal(bossDefendedDamage(two, amounts, "passed", RES), 2, "both: 10 → 5 → 2");
  assert.equal(bossDefendedDamage(two, amounts, "hit", { vulnerabilities: ["slashing"] }), 20);
  assert.equal(bossDefendedDamage(two, amounts, "hit", { immunities: ["slashing"] }), 0);
  assert.equal(bossDefendedDamage(two, amounts, "hit", RES, ["slashing"]), 10, "ignored by the GM");
  // Two types: each its own sum.
  const mixed = [{ id: "c1", type: "fire" }, { id: "c2", type: "cold" }, { id: "c3", type: "fire" }];
  assert.equal(bossDefendedDamage(mixed, { c1: 7, c2: 3, c3: 2 }, "hit", { resistances: ["fire", "cold"] }), 4 + 1);
});

test("the counts say the type's sum and what is left of it", () => {
  assert.deepEqual(bossDefenseCounts(two, amounts, "hit", RES), [{ type: "slashing", defense: "resistance", ignored: false, before: 10, after: 5 }]);
  assert.deepEqual(bossDefenseCounts(two, amounts, "passed", RES).map((row) => [row.before, row.after]), [[10, 2]]);
});

test("the commit's pieces add up to the preview, the rounding's point on the type's first piece", () => {
  const pieces = defendedComponents(two, amounts, "full", target(RES), []);
  assert.deepEqual(pieces.map((piece) => [piece.id, piece.inputAmount, piece.amount]), [["c1", 7, 4], ["c2", 3, 1]]);
  assert.equal(pieces.reduce((sum, piece) => sum + piece.amount, 0), bossDefendedDamage(two, amounts, "hit", RES));
  const halved = defendedComponents(two, amounts, "half", target({}), []);
  assert.deepEqual(halved.map((piece) => piece.amount), [4, 1], "a passed save without a defense: 5 too");
  const ignored = defendedComponents(two, amounts, "full", target(RES), ["slashing"]);
  assert.deepEqual(ignored.map((piece) => [piece.amount, piece.defense, piece.defenseIgnored]), [[7, null, "resistance"], [3, null, "resistance"]]);
  assert.deepEqual(defendedComponents(two, amounts, "zero", target(RES), []).map((piece) => piece.amount), [0, 0]);
  const single = defendedComponents([{ id: "c1", type: "slashing" }], { c1: 9 }, "full", target(RES), []);
  assert.deepEqual(single.map((piece) => piece.amount), [4], "one piece: as before");
});
