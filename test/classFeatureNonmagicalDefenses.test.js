// Class features whose resistance holds only against nonmagical weapons or attacks (L5 of the class features' defenses,
// 06/11): Avatar of Battle and Saint of Forge and Fire (heavy armor taken as worn) count like a monster's limited defenses.
// The rows say «non magici», spells get through, and a weapon the GM knows to be magical is a click on the chip.
import assert from "node:assert/strict";
import test, { mock } from "node:test";

mock.module("@owlbear-rodeo/sdk", { exports: { default: { onReady() {} }, buildLabel() {}, buildImage() {}, buildText() {}, buildPath() {}, buildShape() {}, Command: class {} } });
const { classFeatureNonmagicalDamageDefenses, damageDefenseFor, damageDefensesForItem, markNonmagicalDefenses, nonmagicalDefenseMarker,
  nonmagicalDefenseMarkerForItem, profileDamageDefenses } = await import("../src/damageDefensesCore.js");
const { magicalDamageDefensesForItem } = await import("../src/spellDamageDefenseCore.js");
const { bossDefendedDamage } = await import("../src/bossActionsViewCore.js");
const { pcAttackPreview } = await import("../src/pcAttackCore.js");

const META = "com.thebigpicture.initiative/meta";
const BPS = ["bludgeoning", "piercing", "slashing"];
const WAR = "chierico-dominio-della-guerra";
const FORGE = "chierico-dominio-della-forgia";
const cleric = (level, subclassId, extra = {}) => ({ characterBuild: [{ classId: "chierico", level, subclassId }], ...extra });
const creature = (id, initiativeCard, instances = [], attitude = "pc") => ({ id, name: id, type: "IMAGE", layer: "CHARACTER", position: { x: 0, y: 0 },
  metadata: { [META]: { hp: 60, hpMax: 60, attitude, inInitiative: true, initiativeCard, conditions: { version: 2, instances } } } });
const ragePill = { id: "rage", active: true, type: "class-feature", effectId: "barbaro-ira", condition: "Ira" };

test("Avatar of Battle and Saint of Forge and Fire resist the weapons' damage from the 17th level", () => {
  for (const subclassId of [WAR, FORGE]) {
    assert.deepEqual(profileDamageDefenses(cleric(17, subclassId)).resistances, BPS, subclassId);
    assert.deepEqual(classFeatureNonmagicalDamageDefenses(cleric(17, subclassId)).resistances, BPS, subclassId);
    assert.ok(BPS.every((type) => !damageDefenseFor(profileDamageDefenses(cleric(16, subclassId)), type)), `${subclassId} at 16`);
  }
  assert.deepEqual(profileDamageDefenses(cleric(17, FORGE)).immunities, ["fire"], "the Saint's fire immunity holds against everything");
  const off = cleric(17, WAR, { classFeaturesConfigured: true, enabledClassFeatureIds: [] });
  assert.deepEqual(profileDamageDefenses(off).resistances, [], "switched off on the sheet");
});

test("the rows say «non magici», a weapon is halved, a spell gets through", () => {
  const avatar = creature("avatar", cleric(17, WAR));
  assert.deepEqual(nonmagicalDefenseMarkerForItem(avatar, META), { types: BPS, except: [] });
  const rows = markNonmagicalDefenses(BPS.map((type) => ({ type, defense: "resistance" })), avatar.metadata[META].initiativeCard);
  assert.deepEqual(rows.map((row) => row.nonmagical), ["non magici", "non magici", "non magici"]);
  assert.equal(bossDefendedDamage([{ id: "c1", type: "slashing" }], { c1: 12 }, "hit", damageDefensesForItem(avatar, META)), 6);
  assert.deepEqual(magicalDamageDefensesForItem(avatar, META).resistances, [], "a spell's bludgeoning is magical");
  assert.deepEqual(magicalDamageDefensesForItem(creature("saint", cleric(17, FORGE)), META).immunities, ["fire"]);

  // The attack console: a sword is halved, Thorn Whip (a cantrip) is not and its row is not offered.
  const hero = creature("hero", { characterBuild: [{ classId: "druido", level: 5 }],
    quickActions: [{ id: "c", label: "Trucchetto", kind: "attack", source: { kind: "cantrip" } }] });
  const sword = { version: 2, id: "sword", label: "Spada", kind: "attack", targetMode: "selection", range: "melee", components: [{ id: "c1", type: "slashing", formula: "1d8" }] };
  const weapon = pcAttackPreview({ action: sword, sourceItem: hero, targetItem: avatar, outcome: "hit", amounts: { c1: 10 } });
  assert.equal(weapon.total, 5);
  assert.deepEqual(weapon.defenses.map((row) => [row.type, row.nonmagical]), [["slashing", "non magici"]]);
  const whip = pcAttackPreview({ action: { id: "c", label: "Trucchetto", kind: "attack", source: { kind: "cantrip" } }, spellId: "phb2014-frusta-di-spine",
    sourceItem: hero, targetItem: avatar, outcome: "hit", amounts: { c1: 10 } });
  assert.equal(whip.total, 10);
  assert.deepEqual(whip.defenses, []);
});

test("another source of the same resistance holds against magic: the Rage keeps it", () => {
  const raging = creature("raging", cleric(17, WAR), [ragePill]);
  assert.equal(nonmagicalDefenseMarkerForItem(raging, META), null);
  assert.deepEqual(magicalDamageDefensesForItem(raging, META).resistances, BPS);
  const typed = creature("typed", cleric(17, WAR, { damageDefenses: { resistances: ["slashing"] } }));
  assert.deepEqual(nonmagicalDefenseMarkerForItem(typed, META).types, ["bludgeoning", "piercing"], "a resistance the GM typed holds against magic");
  assert.equal(damageDefenseFor(magicalDamageDefensesForItem(typed, META), "slashing"), "resistance");
});

test("a monster's marker is the one on its card, as before", () => {
  const marker = { types: ["slashing"], except: ["silvered"] };
  const card = { damageDefenses: { resistances: ["slashing"] }, monster: { source: "manual", nonmagicalDefenses: marker } };
  assert.equal(nonmagicalDefenseMarker(card), marker);
  assert.equal(nonmagicalDefenseMarker({}), null);
  assert.equal(nonmagicalDefenseMarker({ characterBuild: [{ classId: "ladro", level: 20 }] }), null);
});
