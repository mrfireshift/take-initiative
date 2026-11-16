// Lot F7-2 of docs/STUDIO_TALENTI.md (decisions D12, N1, N2): Elemental Adept and Poisoner ignore a resistance, never an
// immunity. The shared functions (damageDefensesCore.js) and the attack console: the preview strikes the resistance through
// with its source, the commit counts the same, and the GM applies it again with the chip (reappliedDefenses). The spell
// panel, the area commit and the reminders are in test/spellDamageDefense.test.js. The numbers are those of §7.30.4.
import test, { mock } from "node:test";
import assert from "node:assert/strict";

mock.module("@owlbear-rodeo/sdk", {
  exports: {
    default: { onReady() {}, scene: { items: { getItems: async () => [] } } },
    buildPath: () => ({}), buildLabel: () => ({}), buildImage: () => ({}), buildText: () => ({}), buildShape: () => ({}),
    Command: { MOVE: 0, LINE: 1, CUBIC: 2, CLOSE: 3 },
  },
});

const { featResistanceBypass, withResistanceBypass, damageDefensesForItem } = await import("../src/damageDefensesCore.js");
const { defendedComponents } = await import("../src/bossActionExecutionCore.js");
const { buildPcAttackMutation, pcAttackDefenseText, pcAttackPreview } = await import("../src/pcAttackCore.js");

const META = "com.thebigpicture.initiative/meta";
const creature = (id, name, meta = {}) => ({ id, name, type: "IMAGE", layer: "CHARACTER", metadata: { [META]: { hp: 60, hpMax: 60, inInitiative: true, ...meta } } });
const target = (damageDefenses) => creature("ogre", "Ogre", { attitude: "enemy", initiativeCard: { damageDefenses } });
const ADEPT = { id: "adepto-elementale", choice: { damageType: "fire" } };
const fire = [{ id: "c1", type: "fire" }];

test("which resistances: Elemental Adept's types only on a spell, Poisoner's poison always, one row per type", () => {
  assert.deepEqual(featResistanceBypass({ feats: [ADEPT, { id: "maestria-dei-veleni" }] }, { spell: true }),
    [{ type: "fire", source: "Adepto Elementale" }, { type: "poison", source: "Maestria dei Veleni" }]);
  assert.deepEqual(featResistanceBypass({ feats: [ADEPT, { id: "maestria-dei-veleni" }] }), [{ type: "poison", source: "Maestria dei Veleni" }],
    "a weapon: no Elemental Adept");
  assert.deepEqual(featResistanceBypass({ feats: [ADEPT, { id: "adepto-elementale", choice: { damageType: "cold" } }] }, { spell: true })
    .map((row) => row.type), ["fire", "cold"], "taken twice, two types");
  assert.deepEqual(featResistanceBypass({ feats: [{ id: "adepto-elementale" }] }, { spell: true }), [], "no type chosen");
  assert.deepEqual(featResistanceBypass({}), []);
});

test("the defenses: the resistance goes, the immunity and the vulnerability stay; one applied again stays too", () => {
  const bypass = [{ type: "fire", source: "Adepto Elementale" }];
  assert.deepEqual(withResistanceBypass({ resistances: ["fire", "cold"] }, bypass),
    { immunities: [], resistances: ["cold"], vulnerabilities: [], bypassed: [{ type: "fire", source: "Adepto Elementale" }] });
  assert.deepEqual(withResistanceBypass({ immunities: ["fire"] }, bypass), { immunities: ["fire"] }, "immune: unchanged");
  assert.deepEqual(withResistanceBypass({ resistances: ["fire"], vulnerabilities: ["fire"] }, bypass),
    { immunities: [], resistances: [], vulnerabilities: ["fire"], bypassed: [] }, "resisted and vulnerable: vulnerable");
  assert.deepEqual(withResistanceBypass({ resistances: ["fire"] }, bypass, ["fire"]), { resistances: ["fire"] }, "applied again");
});

test("the numbers of the plan, through defendedComponents: Fireball 28 from a mage with Elemental Adept (fire)", () => {
  const bypass = [{ type: "fire", source: "Adepto Elementale" }];
  const amount = (defenses, factor = "full", options = { bypass }) => defendedComponents(fire, { c1: 28 }, factor, target(defenses), [], undefined, false,
    { spell: true, ...options })[0];
  assert.equal(amount({ resistances: ["fire"] }, "full", {}).amount, 14, "today");
  assert.equal(amount({ resistances: ["fire"] }).amount, 28);
  assert.equal(amount({ resistances: ["fire"] }).resistanceBypass, "Adepto Elementale");
  assert.equal(amount({ resistances: ["fire"] }, "half").amount, 14, "passed save");
  assert.equal(amount({ immunities: ["fire"] }).amount, 0);
  assert.equal(amount({ resistances: ["fire"], vulnerabilities: ["fire"] }).amount, 56);
  assert.equal(amount({ resistances: ["fire"] }, "full", { bypass, kept: ["fire"] }).amount, 14, "applied again by the GM");
});

const dagger = { id: "dagger", label: "Pugnale", kind: "attack", range: "melee", components: [{ type: "piercing", formula: "1d4+3" }] };
const poisoner = creature("pc", "Pg", { attitude: "pc", initiativeCard: { characterBuild: [{ classId: "ladro", level: 4 }], abilityModifiers: { dex: 3 },
  quickActions: [dagger], feats: [{ id: "maestria-dei-veleni" }] } });
const ownTurn = { round: 2, order: ["pc", "ogre"], current: 0 };
const POISON = [{ id: "talento-maestria-dei-veleni-veleno-potente", type: "poison", amount: 7, saveOutcome: "failed" }];
const preview = (defenses, extra = {}) => pcAttackPreview({ action: dagger, sourceItem: poisoner, targetItem: target(defenses), outcome: "hit",
  amounts: { c1: 5 }, turnState: ownTurn, activations: POISON, ...extra });
const commit = (defenses, extra = {}) => buildPcAttackMutation({ action: dagger, sourceItem: poisoner, targetItem: target(defenses), outcome: "hit",
  componentAmounts: { c1: 5 }, attackInstanceId: "a1", turnState: ownTurn, expectedDefenses: damageDefensesForItem(target(defenses), META),
  activations: POISON, ...extra });

test("the attack console, Poisoner: dagger 5 + 7 poison on a poison-resistant ogre, 12; the chip struck through", () => {
  const seen = preview({ resistances: ["poison"] });
  assert.equal(seen.total, 12);
  assert.deepEqual(seen.defenses, [{ type: "poison", defense: "resistance", bypass: "Maestria dei Veleni", ignored: true }]);
  assert.equal(pcAttackDefenseText(seen.defenses[0]), "Res. veleno · superata (Maestria dei Veleni)");
  const done = commit({ resistances: ["poison"] });
  assert.equal(done.change.requested, 12, "the commit counts as the preview");
  assert.equal(done.damageComponents.find((component) => component.type === "poison").resistanceBypass, "Maestria dei Veleni");
});

test("the attack console: the GM applies the resistance again, 8; an immunity stays, 5; without the feat, 8", () => {
  const again = preview({ resistances: ["poison"] }, { reappliedDefenses: ["poison"] });
  assert.equal(again.total, 8);
  assert.deepEqual(again.defenses.map((row) => [row.type, row.ignored, row.bypass]), [["poison", false, "Maestria dei Veleni"]]);
  assert.equal(commit({ resistances: ["poison"] }, { reappliedDefenses: ["poison"] }).change.requested, 8);
  assert.equal(preview({ immunities: ["poison"] }).total, 5);
  assert.equal(commit({ immunities: ["poison"] }).change.requested, 5);
  const plain = { ...poisoner, metadata: { [META]: { ...poisoner.metadata[META], initiativeCard: { ...poisoner.metadata[META].initiativeCard, feats: [] } } } };
  assert.equal(pcAttackPreview({ action: dagger, sourceItem: plain, targetItem: target({ resistances: ["poison"] }), outcome: "hit", amounts: { c1: 5 },
    turnState: ownTurn, extras: [{ type: "poison", amount: 7 }] }).total, 8);
});
