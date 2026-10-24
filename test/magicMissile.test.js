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
  assert.equal(view.targets.context.summary, "Dardi assegnati 3/3 · un tiro di 1d4+1 per dardo");
  assert.equal(view.targets.context.summaryInvalid, false);
  assert.deepEqual(view.targets.context.fields.map((field) => [field.id, field.label, field.type]),
    [["darts", "Danni dei dardi", "text"]]);
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
  assert.equal(model({ targetIds: ["goblin", "orc"], targetContext: { goblin: { darts: "4 2 3" }, orc: { darts: "5" } } })
    .targets.context.summary, "Dardi assegnati 4/3 · un tiro di 1d4+1 per dardo");
});
