// Magic Missile in the spell panel (PHB 2014 text): three darts, one more per slot above 1st, each hitting for 1d4 + 1
// force damage, its own roll; the darts split among the targets. The expectations below are read from the 2014
// text, not from the definitions under test.
import test from "node:test";
import assert from "node:assert/strict";
import {
  magicMissileDartAllocation,
  magicMissileDartTotal,
  magicMissileDeathSaveHits,
  magicMissileTargetDamage,
  magicMissileTargetGuard,
  parseMagicMissileDarts,
} from "../src/magicMissileCore.js";
import {
  buildSpellPanelViewModel,
  buildSpellUnifiedPanelContract,
  createSpellPanelSession,
} from "../src/spellUnifiedPanelCore.js";
import { buildUnifiedPanelViewModel } from "../src/spellUnifiedPanelViewCore.js";
import { isSpellCastRecordOnly } from "../src/spells-srd.js";

const META_KEY = "com.thebigpicture.initiative/meta";

test("three darts at 1st level, one more for each slot above", () => {
  assert.deepEqual([1, 2, 3, 9].map(magicMissileDartTotal), [3, 4, 5, 11]);
});

test("each target lists the damage of its darts; every dart needs a target", () => {
  assert.deepEqual(parseMagicMissileDarts("4 3"), [4, 3]);
  assert.deepEqual(parseMagicMissileDarts(" 4, 3+5 "), [4, 3, 5]);
  assert.deepEqual(parseMagicMissileDarts(""), []);
  assert.equal(parseMagicMissileDarts("4 tre"), null);
  assert.equal(parseMagicMissileDarts("-2"), null);
  const split = (darts, targetIds = ["a", "b"], slotLevel = 1) => magicMissileDartAllocation({
    targetIds,
    targetContexts: Object.fromEntries(Object.entries(darts).map(([id, value]) => [id, { darts: value }])),
    slotLevel,
  });
  const valid = split({ a: "4 2", b: "5" });
  assert.equal(valid.valid, true);
  assert.deepEqual(valid.byTarget, { a: 2, b: 1 });
  assert.deepEqual(valid.damagesByTarget, { a: [4, 2], b: [5] });
  assert.equal(split({ a: "2 3 4" }).valid, true, "all three on one creature");
  assert.equal(split({ a: "2 3", b: "4 5" }).error, "over");
  assert.equal(split({ a: "2", b: "3" }).error, "under");
  assert.equal(split({ a: "2 x", b: "3 4" }).error, "invalid");
  assert.equal(split({}, []).valid, false);
});

test("each dart is its own damage: a resistance halves each one, Shield blocks them all", () => {
  const item = (meta) => ({ id: "t", metadata: { [META_KEY]: meta } });
  const plain = magicMissileTargetGuard(item({}));
  assert.equal(magicMissileTargetDamage({ rolls: [5, 3, 2], guard: plain }).damage, 10);
  const resistant = magicMissileTargetGuard(item({ initiativeCard: { damageDefenses: { resistances: ["force"] } } }));
  assert.equal(resistant.defense, "resistance");
  assert.deepEqual(magicMissileTargetDamage({ rolls: [5, 3, 3], guard: resistant }).dartDamages, [2, 1, 1],
    "2 + 1 + 1, not 11 / 2");
  const shielded = magicMissileTargetGuard(item({ conditions: { version: 2, instances: [
    { id: "s", condition: "Scudo", active: true, mechanics: { immunities: ["magic-missile"] } },
  ] } }));
  assert.equal(shielded.shielded, true);
  assert.equal(magicMissileTargetDamage({ rolls: [5, 3], guard: shielded }).damage, 0);
});

test("the darts that land at 0 hit points, one after the other", () => {
  assert.deepEqual(magicMissileDeathSaveHits({ hp: 0, dartDamages: [4, 2, 5] }), { hitsAtZero: 3, damageInstance: 5 });
  assert.deepEqual(magicMissileDeathSaveHits({ hp: 3, dartDamages: [4, 2, 5] }), { hitsAtZero: 2, damageInstance: 4 },
    "the first dart drops it with 1 left over");
  assert.deepEqual(magicMissileDeathSaveHits({ hp: 9, dartDamages: [4, 2] }).hitsAtZero, 0);
  assert.deepEqual(magicMissileDeathSaveHits({ hp: 0, dartDamages: [0, 0] }).hitsAtZero, 0, "Shield: nothing lands");
});

test("the panel resolves it in the area command: no save, no single damage, the darts written on each target", () => {
  assert.equal(isSpellCastRecordOnly("magic-missile"), false);
  const contract = buildSpellUnifiedPanelContract({ spellId: "magic-missile", phase: "cast", castContext: { slotLevel: 1 } });
  assert.equal(contract.execution.lane, "area-transaction");
  assert.equal(contract.presentation.inputs.outcomes.required, false);
  assert.equal(contract.presentation.inputs.damage.visible, false, "each dart has its own roll");
  assert.equal(contract.presentation.targeting.limit.maximum, 3, "no more creatures than darts");

  const candidates = [
    { key: "goblin", label: "Goblin", hp: 10, hpMax: 10, magicMissileGuard: { defense: null, shielded: false } },
    { key: "orc", label: "Orco", hp: 15, hpMax: 15, magicMissileGuard: { defense: "resistance", shielded: false } },
  ];
  const model = (sessionPatch) => {
    const session = createSpellPanelSession({ contract, casterId: "wizard", slotLevel: 1, ...sessionPatch });
    return buildUnifiedPanelViewModel({ contract, session, targetCandidates: candidates });
  };
  const view = model({ targetIds: ["goblin", "orc"], targetContext: { goblin: { darts: "4 2" }, orc: { darts: "5" } } });
  const darts = view.targets.context.magicMissile;
  assert.equal(darts.countLabel, "3/3 dardi");
  assert.equal(darts.invalid, false);
  assert.equal(darts.status, "Pronto.");
  assert.deepEqual(darts.targets.map((target) => [target.key, target.values, target.canAdd, target.hpLabel, target.note]), [
    ["goblin", [4, 2], false, "10 → 4 PF", ""],
    ["orc", [5], false, "15 → 13 PF", "Resistenza: metà per dardo"],
  ], "a box per dart, the + off with every dart assigned");
  assert.equal(view.effects.fields.some((field) => field.id === "damage"), false);
  assert.deepEqual(view.effects.preview.targets.map((target) => [target.key, target.afterHP, target.factorLabel]), [
    ["goblin", 4, "2 dardi · 4 + 2 = 6"],
    ["orc", 13, "1 dardo · 2 (resistenza)"],
  ]);

  const session = (targetContext) => createSpellPanelSession({ contract, casterId: "wizard", slotLevel: 1,
    targetIds: ["goblin", "orc"], targetContext });
  const validation = (targetContext) => buildSpellPanelViewModel(contract,
    { ...session(targetContext), executionGate: { allowed: true } }).validation;
  assert.equal(validation({ goblin: { darts: "4 2" }, orc: { darts: "5" } }).valid, true);
  const over = validation({ goblin: { darts: "4 2 3" }, orc: { darts: "5" } });
  assert.equal(over.valid, false);
  assert.equal(over.firstInvalidField, "darts");
  const tooMany = model({ targetIds: ["goblin", "orc"], targetContext: { goblin: { darts: "4 2 3" }, orc: { darts: "5" } } })
    .targets.context.magicMissile;
  assert.deepEqual([tooMany.countLabel, tooMany.invalid], ["4/3 dardi", true]);
  // Untouched targets share the darts, their boxes empty: the cast waits for every damage.
  const fresh = model({ targetIds: ["goblin", "orc"] }).targets.context.magicMissile;
  assert.deepEqual(fresh.targets.map((target) => [target.values, target.auto]), [[[null, null], true], [[null], true]]);
  assert.equal(fresh.status, "3 danni da inserire.");
  assert.equal(validation({}).valid, false, "no damage yet");
  assert.equal(validation({ goblin: { darts: "4 -" }, orc: { darts: "5" } }).firstInvalidField, "darts", "one box still empty");
});

test("the boxes' value: a dart still to roll is \"-\", read back as empty", async () => {
  const { magicMissileDartsValue } = await import("../src/magicMissileCore.js");
  assert.equal(magicMissileDartsValue([4, null, "3"]), "4 - 3");
  assert.deepEqual(parseMagicMissileDarts("4 - 3"), [4, null, 3]);
  const split = magicMissileDartAllocation({ targetIds: ["a", "b"], targetContexts: { a: { darts: "4 -" } }, slotLevel: 1 });
  assert.deepEqual([split.byTarget, split.missing, split.error], [{ a: 2, b: 1 }, 2, "missing"]);
});

test("the darts block: a column per target, a box per dart, − and + rewrite the target's darts", async () => {
  const { FakeNode } = await import("../test-support/fakeBossActionsDom.js");
  const { renderTargetMatrix } = await import("../src/spellUnifiedPanelTargetView.js");
  const doc = { createElement: (tag) => new FakeNode(doc, tag), createTextNode: (text) => new FakeNode(doc, "#text") };
  const contract = buildSpellUnifiedPanelContract({ spellId: "magic-missile", phase: "cast", castContext: { slotLevel: 1 } });
  const session = createSpellPanelSession({ contract, casterId: "wizard", slotLevel: 1, targetIds: ["goblin", "orc"],
    targetContext: { goblin: { darts: "4 -" } } });
  const model = buildUnifiedPanelViewModel({ contract, session, targetCandidates: [
    { key: "goblin", label: "Goblin", hp: 10, hpMax: 10 }, { key: "orc", label: "Orco", hp: 15, hpMax: 15 },
  ] });
  const writes = [];
  const section = renderTargetMatrix(doc, model, { onTargetContextChange: (key, field, value) => writes.push([key, field, value]) });
  const columns = section.querySelectorAll(".unified-darts__target");
  assert.equal(columns.length, 2, "a column per target");
  assert.deepEqual(columns.map((column) => column.querySelectorAll(".unified-darts__box").length), [2, 1], "a box per dart");
  assert.deepEqual(section.querySelectorAll(".unified-darts__box").map((box) => box.value), ["4", "", ""]);
  const steps = columns[0].querySelectorAll(".unified-darts__step");
  assert.deepEqual(steps.map((step) => [step.getAttribute("data-darts-step"), step.getAttribute("tabindex")]),
    [["remove", "-1"], ["add", "-1"]], "out of the Tab order");
  await steps[0].click();
  assert.deepEqual(writes.at(-1), ["goblin", "darts", "4"], "one dart less keeps the rolled one");
  assert.equal(steps[1].disabled, true, "every dart already has a target");
});
