// Lot F7-3 of docs/STUDIO_TALENTI.md (rule R3 of §7.30, decisions D11, N4, N5): Heavy Armor Master. A nonmagical weapon's
// bludgeoning, piercing and slashing damage on the creature with the feat is 3 less on their sum, never below 0, before the
// reactions and the defenses, in the attack console and the boss console; the GM takes it off for one attack with its chip
// (HEAVY_ARMOR_DEFENSE among the ignored defenses). The numbers are those of §7.30.4.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { mock } from "node:test";

mock.module("@owlbear-rodeo/sdk", { exports: { default: { onReady() {} }, buildLabel() {}, buildImage() {}, buildText() {}, buildPath() {}, buildShape() {}, Command: class {} } });
const { HEAVY_ARMOR_DEFENSE, heavyArmorInputs } = await import("../src/damageDefensesCore.js");
const { buildPcAttackMutation, pcAttackDefenseText, pcAttackPreview } = await import("../src/pcAttackCore.js");
const { importBossActionHTML } = await import("../src/bossActionProfileCore.js");
const { buildBossActionMutation } = await import("../src/bossActionExecutionCore.js");
const { withEpicLog } = await import("../test-support/bossSequenceState.js");

const META = "com.thebigpicture.initiative/meta";
const HAM = { id: "maestro-delle-armature-pesanti", ability: "str" };
const creature = (id, name, card = {}, extra = {}) => ({ id, name, type: "IMAGE", layer: "CHARACTER",
  metadata: { [META]: { hp: 60, hpMax: 60, inInitiative: true, initiativeCard: card, ...extra } } });
const fighter = (defenses) => creature("pc", "Guerriero", { feats: [HAM], ...(defenses ? { damageDefenses: defenses } : {}) }, { attitude: "pc" });
const parts = (...types) => types.map((type, index) => ({ id: `c${index + 1}`, type }));
const cut = (components, inputs, options = {}) => heavyArmorInputs(components, inputs, { item: fighter(), metaKey: META, weapon: true, ...options });

test("the −3: on the sum of bludgeoning, piercing and slashing, from the first, never below 0; the other types untouched", () => {
  assert.deepEqual(cut(parts("slashing"), { c1: 6 }).inputs, { c1: 3 });
  assert.deepEqual(cut(parts("slashing"), { c1: 11 }).inputs, { c1: 8 }, "a critical, its dice already doubled");
  assert.deepEqual(cut(parts("slashing"), { c1: 2 }).inputs, { c1: 0 });
  assert.deepEqual(cut(parts("piercing", "bludgeoning"), { c1: 5, c2: 3 }).inputs, { c1: 2, c2: 3 });
  assert.deepEqual(cut(parts("piercing", "bludgeoning"), { c1: 1, c2: 3 }).inputs, { c1: 0, c2: 1 }, "what the first cannot take, the next");
  assert.deepEqual(cut(parts("slashing", "poison"), { c1: 6, c2: 4 }).inputs, { c1: 3, c2: 4 });
  assert.deepEqual(cut(parts("slashing"), { c1: "6" }).inputs, { c1: "3" }, "the preview's strings stay strings");
  assert.deepEqual(cut(parts("slashing"), { c1: 6 }).reduction, { before: 6, after: 3, amount: 3 });
  assert.deepEqual(cut(parts("fire"), { c1: 6 }).reduction, null, "no weapon type");
  assert.deepEqual(cut(parts("slashing"), { c1: 6 }, { weapon: false }).inputs, { c1: 6 }, "not a nonmagical weapon");
  const off = cut(parts("slashing"), { c1: 6 }, { ignoredTypes: [HEAVY_ARMOR_DEFENSE] });
  assert.deepEqual([off.inputs, off.off, off.reduction], [{ c1: 6 }, true, null], "taken off by the GM");
  assert.equal(heavyArmorInputs(parts("slashing"), { c1: 6 }, { item: creature("x", "X"), metaKey: META, weapon: true }).applies, false, "without the feat");
});

const scimitar = { id: "sc", label: "Scimitarra", kind: "attack", range: "melee", components: [{ type: "slashing", formula: "1d6+2" }] };
const goblin = creature("gob", "Goblin", { quickActions: [scimitar] }, { attitude: "enemy" });
const turn = { round: 1, order: ["gob", "pc"], current: 0 };
const preview = (target, amount, extra = {}) => pcAttackPreview({ action: scimitar, sourceItem: goblin, targetItem: target, outcome: "hit",
  amounts: { c1: amount }, turnState: turn, ...extra });
const commit = (target, amount, extra = {}) => buildPcAttackMutation({ action: scimitar, sourceItem: goblin, targetItem: target, outcome: "hit",
  componentAmounts: { c1: amount }, attackInstanceId: "a1", turnState: turn, expectedDefenses: target.metadata[META].initiativeCard.damageDefenses || {},
  ...extra });

test("the attack console: the goblin's scimitar 6 on the fighter, 3; the row says it, the commit counts the same", () => {
  const seen = preview(fighter(), 6);
  assert.equal(seen.total, 3);
  assert.deepEqual(seen.defenses[0], { type: HEAVY_ARMOR_DEFENSE, defense: "heavy-armor", ignored: false, reduction: { before: 6, after: 3, amount: 3 } });
  assert.equal(pcAttackDefenseText(seen.defenses[0]), "Arm. Pesanti: 6 → 3");
  const done = commit(fighter(), 6);
  assert.equal(done.change.requested, 3);
  assert.deepEqual(done.causality.heavyArmor, { name: "Maestro delle Armature Pesanti", before: 6, after: 3, amount: 3 });
  assert.equal(commit(fighter(), 11).change.requested, 8);
  assert.equal(commit(fighter(), 2).change.requested, 0);
});

test("before the resistance: 10 slashing on a raging fighter, (10 − 3) / 2 = 3; magic or taken off, 5", () => {
  const raging = fighter({ resistances: ["slashing"] });
  assert.equal(preview(raging, 10).total, 3);
  assert.equal(commit(raging, 10).change.requested, 3);
  const magic = { ...scimitar, magical: true };
  assert.equal(pcAttackPreview({ action: magic, sourceItem: creature("gob", "Goblin", { quickActions: [magic] }, { attitude: "enemy" }), targetItem: raging,
    outcome: "hit", amounts: { c1: 10 }, turnState: turn }).total, 5, "✦ Magica");
  const off = { ignoredDefenses: [HEAVY_ARMOR_DEFENSE] };
  assert.equal(preview(raging, 10, off).total, 5);
  assert.equal(pcAttackDefenseText(preview(raging, 10, off).defenses[0]), "Arm. Pesanti · tolto");
  assert.equal(commit(raging, 10, off).change.requested, 5);
  assert.deepEqual(commit(raging, 10, off).causality.heavyArmor, { name: "Maestro delle Armature Pesanti", off: true });
  assert.equal(preview(creature("x", "X", { damageDefenses: { resistances: ["slashing"] } }), 10).total, 5, "without the feat");
});

test("the boss console: Rock, a weapon, 12 bludgeoning, 9; Icekiss (a +2 weapon, no type) and Polar Ray (a spell) unchanged", async () => {
  const p2 = await importBossActionHTML(await readFile(new URL("fixtures/boss-actions/auril-phase-2.html", import.meta.url), "utf8"));
  const p3 = await importBossActionHTML(await readFile(new URL("fixtures/boss-actions/auril-phase-3.html", import.meta.url), "utf8"));
  const ability = (profile, name) => profile.abilities.find((entry) => entry.name === name);
  const boss = creature("auril", "Auril", {}, { hp: 580, hpMax: 580 });
  // Rock follows Gather the Winter Sky in the same round (the round log on the boss token).
  const rock = (ignoredDefenses = []) => buildBossActionMutation({ profile: p2, action: ability(p2, "Rock"),
    sourceItem: withEpicLog(boss, p2, 1, ["gather-the-winter-sky"]), targetItem: fighter(),
    mode: "ranged", outcome: "hit", componentAmounts: { bludgeoning: 12 }, actionInstanceId: "rock-1", round: 1, expectedDefenses: {},
    manualConfirmed: true, ignoredDefenses });
  const hit = rock();
  assert.deepEqual(hit.damageComponents.map((component) => [component.type, component.amount]), [["bludgeoning", 9]]);
  assert.equal(hit.change.afterHP, 60 - 9);
  assert.deepEqual(hit.causality.targets[0].heavyArmor, { name: "Maestro delle Armature Pesanti", before: 12, after: 9, amount: 3 });
  assert.equal(rock([HEAVY_ARMOR_DEFENSE]).change.afterHP, 60 - 12, "taken off");
  assert.deepEqual(rock([HEAVY_ARMOR_DEFENSE]).causality.targets[0].heavyArmor, { name: "Maestro delle Armature Pesanti", off: true });
  const icekiss = buildBossActionMutation({ profile: p2, action: ability(p2, "Icekiss +2"), sourceItem: boss, targetItem: fighter(),
    mode: "melee", outcome: "hit", componentAmounts: { slashing: 18, cold: 7 }, actionInstanceId: "ice-1", round: 1, expectedDefenses: {} });
  assert.equal(icekiss.change.requested, 25, "a magic weapon");
  const polarAction = ability(p3, "Polar Ray");
  const polar = buildBossActionMutation({ profile: p3, action: polarAction, sourceItem: boss, targetItem: fighter(), mode: "ranged", outcome: "hit",
    componentAmounts: Object.fromEntries(polarAction.execution.damage.map((component) => [component.id, 10])), actionInstanceId: "polar-1", round: 1,
    expectedDefenses: {} });
  assert.equal(polar.change.requested, 10 * polarAction.execution.damage.length, "a spell attack");
  assert.equal(polar.causality.targets[0].heavyArmor, undefined);
});
