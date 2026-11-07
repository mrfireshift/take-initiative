// Resistance to the damage of spells (L6 of the class features' defenses, 06/11): the Abjurer's Spell Resistance (passive)
// and the Aura of Warding (its members' pill, without data). Every type is resisted, but only the damage of a spell reads it:
// the spell panel and its areas, a spell's reminders, Magic Missile and the attack console's spells; a weapon does not.
import assert from "node:assert/strict";
import test, { mock } from "node:test";

mock.module("@owlbear-rodeo/sdk", { exports: { default: { onReady() {} }, buildLabel() {}, buildImage() {}, buildText() {}, buildPath() {}, buildShape() {}, Command: class {} } });
const { CLASS_FEATURE_BY_ID } = await import("../src/classFeatureCatalog.js");
const { collectActiveClassFeatureAuras, classFeatureAuraMembershipPlan } = await import("../src/classFeatureAuraCore.js");
const { damageDefensesForItem, spellDamageResistanceForItem } = await import("../src/damageDefensesCore.js");
const { magicalDamageDefensesForItem } = await import("../src/spellDamageDefenseCore.js");
const { reminderDamageDefenseRows } = await import("../src/reminderResolutionCore.js");
const { magicMissileTargetGuard } = await import("../src/magicMissileCore.js");
const { defendedComponents } = await import("../src/bossActionExecutionCore.js");
const { buildPcAttackMutation, pcAttackPreview } = await import("../src/pcAttackCore.js");

const META = "com.thebigpicture.initiative/meta";
const ALL = ["acid", "bludgeoning", "cold", "fire", "force", "lightning", "necrotic", "piercing", "poison", "psychic", "radiant", "slashing", "thunder"];
const WARDING = "paladino-giuramento-degli-antichi-aura-di-interdizione";
const creature = (id, initiativeCard = {}, extra = {}) => ({ id, name: id, type: "IMAGE", layer: "CHARACTER", position: { x: 0, y: 0 },
  metadata: { [META]: { hp: 60, hpMax: 60, attitude: "pc", inInitiative: true, initiativeCard, ...extra } } });
const abjurer = (level = 14, card = {}) => creature("abjurer", { characterBuild: [{ classId: "mago", level, subclassId: "mago-scuola-di-abiurazione" }], ...card });

test("the Abjurer's Spell Resistance: every type against a spell, nothing against a weapon", () => {
  const wizard = abjurer();
  assert.equal(spellDamageResistanceForItem(wizard, META), true);
  assert.deepEqual(magicalDamageDefensesForItem(wizard, META).resistances, ALL);
  assert.deepEqual(damageDefensesForItem(wizard, META).resistances, [], "a weapon's damage reads the plain defenses");
  assert.deepEqual(magicalDamageDefensesForItem(wizard, META, { spell: false }).resistances, [], "magical but not a spell's");
  assert.equal(spellDamageResistanceForItem(abjurer(13), META), false, "a 14th-level feature");
  const immune = magicalDamageDefensesForItem(abjurer(14, { damageDefenses: { immunities: ["fire"] } }), META);
  assert.deepEqual(immune.immunities, ["fire"], "an immunity stays an immunity");
  assert.ok(!immune.resistances.includes("fire"));
});

test("the Aura of Warding: the creatures in it resist spells, from the real aura, and their pill carries nothing", () => {
  const build = [{ classId: "paladino", level: 7, subclassId: "paladino-giuramento-degli-antichi" }];
  const paladin = creature("paladin", { characterBuild: build }, {
    classFeatureState: { version: 1, resources: {}, instances: [{ instanceId: "warding-1", featureId: WARDING, sourceId: "paladin", targetIds: ["paladin"], startedRound: 1 }] },
  });
  const ally = creature("ally");
  const [aura] = collectActiveClassFeatureAuras([paladin, ally], {
    metaKey: META, featureById: CLASS_FEATURE_BY_ID, currentRound: 1, characterBuildBySourceId: new Map([["paladin", build]]),
  });
  assert.ok(aura);
  const plan = classFeatureAuraMembershipPlan({ aura, desiredTargetIds: ["paladin", "ally"], items: [paladin, ally], metaKey: META });
  const add = plan.operations.find((operation) => operation.type === "condition:add");
  assert.ok(add, JSON.stringify(plan.operations));
  assert.deepEqual(add.targetIds, ["paladin", "ally"], "the paladin too");
  assert.equal(add.options.mechanics?.damageDefenses, undefined);
  const inside = { ...ally, metadata: { [META]: { ...ally.metadata[META], conditions: { version: 2, instances: [{ id: "m1", active: true, condition: add.conditionName, ...add.options }] } } } };
  assert.equal(spellDamageResistanceForItem(inside, META), true);
  assert.deepEqual(magicalDamageDefensesForItem(inside, META).resistances, ALL);
  assert.deepEqual(damageDefensesForItem(inside, META).resistances, []);
  assert.equal(spellDamageResistanceForItem(ally, META), false, "outside the aura");
});

test("a reminder reads it when its zone or its effect names a spell, not for a class feature's damage", () => {
  const damage = { dice: "2d10", type: "radiosi", onSave: "half" };
  const rows = (resolution) => reminderDamageDefenseRows({ resolution: { mode: "manual-save", damage, ...resolution }, target: abjurer() });
  assert.deepEqual(rows({ activation: { kind: "zone", spellId: "moonbeam" } }).map((row) => [row.type, row.defense]), [["radiant", "resistance"]]);
  assert.deepEqual(rows({ effect: { kind: "condition", spellId: "moonbeam" } }).map((row) => row.defense), ["resistance"]);
  assert.deepEqual(rows({ activation: { kind: "effect-save" } }), [], "a class feature's reminder: no spell");
});

test("Magic Missile's darts are resisted, each one", () => {
  assert.equal(magicMissileTargetGuard(abjurer()).defense, "resistance");
  assert.equal(magicMissileTargetGuard(creature("plain")).defense, null);
});

test("the attack console: a spell attack is halved in the preview and at the commit, a weapon is not", () => {
  const spells = { id: "spells", label: "Incantesimi d'attacco", kind: "attack", source: { kind: "spell" } };
  const caster = creature("cleric", { quickActions: [spells], characterBuild: [{ classId: "chierico", level: 5 }] });
  const target = abjurer();
  const turnState = { round: 2, order: ["cleric", "abjurer"], current: 0 };
  const spellCast = { castId: "cast-1", slotLevel: 1 };
  const preview = pcAttackPreview({ action: spells, spellId: "inflict-wounds", sourceItem: caster, targetItem: target, outcome: "hit",
    amounts: { c1: "20" }, turnState, spellCast });
  assert.equal(preview.total, 10);
  assert.deepEqual(preview.defenses.map((row) => [row.type, row.defense]), [["necrotic", "resistance"]]);
  assert.deepEqual(preview.profileDefenses.resistances, [], "the defenses expected at the commit stay the target's own");
  const committed = buildPcAttackMutation({ action: spells, spellId: "inflict-wounds", sourceItem: caster, targetItem: target, outcome: "hit",
    componentAmounts: { c1: 20 }, attackInstanceId: "a1", expectedDefenses: preview.profileDefenses, turnState, spellCast });
  assert.equal(committed.change.requested, 10);
  const sword = { version: 2, id: "sword", label: "Spada", kind: "attack", targetMode: "selection", range: "melee", components: [{ id: "c1", type: "necrotic", formula: "1d8" }] };
  assert.equal(pcAttackPreview({ action: sword, sourceItem: caster, targetItem: target, outcome: "hit", amounts: { c1: 20 } }).total, 20);
});

test("a monster's action in the Boss console is not a spell: the resistance does not count there", () => {
  const [component] = defendedComponents([{ id: "c1", type: "cold" }], { c1: 14 }, "full", abjurer(), [], undefined);
  assert.equal(component.amount, 14);
  const [spell] = defendedComponents([{ id: "c1", type: "cold" }], { c1: 14 }, "full", abjurer(), [], undefined, false, { spell: true });
  assert.equal(spell.amount, 7);
});
