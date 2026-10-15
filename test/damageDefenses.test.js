// Actor Profile damage defenses: data contract, profile persistence shape and Boss Action arithmetic.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { mock } from "node:test";

mock.module("@owlbear-rodeo/sdk", { exports: { default: { onReady() {} }, buildLabel() {}, buildImage() {}, buildText() {}, buildPath() {}, buildShape() {}, Command: class {} } });
const { sanitizeDamageDefenses, componentDamageAfterDefense, damageDefenseFor, relevantDamageDefenses, hasDamageDefenses } = await import("../src/damageDefensesCore.js");
const { sanitizeInitiativeCard, hasInitiativeCardValues } = await import("../src/initiativeCards.js");
const { importBossActionHTML } = await import("../src/bossActionProfileCore.js");
const { buildBossActionMutation, buildBossActionGroupMutation } = await import("../src/bossActionExecutionCore.js");
const { bossDefendedDamage } = await import("../src/bossActionsViewCore.js");

const META = "com.thebigpicture.initiative/meta";
const p2 = await importBossActionHTML(await readFile(new URL("fixtures/boss-actions/auril-phase-2.html", import.meta.url), "utf8"));
const p3 = await importBossActionHTML(await readFile(new URL("fixtures/boss-actions/auril-phase-3.html", import.meta.url), "utf8"));
const ability = (profile, name) => profile.abilities.find((entry) => entry.name === name);
const creature = (id, hp, defenses) => ({ id, name: id, type: "IMAGE", layer: "CHARACTER",
  metadata: { [META]: { hp, hpMax: hp, inInitiative: true, ...(defenses ? { initiativeCard: { damageDefenses: defenses } } : {}) } } });
const boss = creature("auril", 580);
// v20: Breath of the Long Night follows Breathe Deep in the same round (the round log on the boss token).
const { withEpicLog } = await import("../test-support/bossSequenceState.js");
const breathBoss = withEpicLog(boss, p2, 1, ["breathe-deep"]);
const AREA = { ruleId: "boss-action-area:cone:60ft", start: { x: 0, y: 0 }, end: { x: 9, y: 0 }, areaTargetIds: [] };

test("defenses are sanitized to known types with one defense per type", () => {
  assert.deepEqual(sanitizeDamageDefenses({ resistances: ["cold", "Cold", "fire", "made-up"], immunities: ["fire"], vulnerabilities: ["cold", "thunder"] }),
    { immunities: ["fire"], resistances: ["cold"], vulnerabilities: ["thunder"] });
  assert.deepEqual(sanitizeDamageDefenses(null), { immunities: [], resistances: [], vulnerabilities: [] });
  assert.equal(damageDefenseFor({ resistances: ["cold"] }, "cold"), "resistance");
  assert.equal(hasDamageDefenses({ resistances: [] }), false);
});

test("save halving first, then resistance, vulnerability or immunity, all with the shared floor policy", () => {
  assert.equal(componentDamageAfterDefense(33, "full", "resistance"), 16);
  assert.equal(componentDamageAfterDefense(33, "half", "resistance"), 8);
  assert.equal(componentDamageAfterDefense(7, "half", "resistance"), 1);
  assert.equal(componentDamageAfterDefense(9, "half", "vulnerability"), 8);
  assert.equal(componentDamageAfterDefense(46, "full", "immunity"), 0);
  assert.equal(componentDamageAfterDefense(13, "half", null), 6);
});

test("the Actor Profile keeps the field optional and sanitized", () => {
  assert.equal(Object.hasOwn(sanitizeInitiativeCard({ armorClass: 15 }), "damageDefenses"), false, "existing profiles keep their shape");
  assert.deepEqual(sanitizeInitiativeCard({ damageDefenses: { resistances: ["cold", "bogus"] } }).damageDefenses,
    { immunities: [], resistances: ["cold"], vulnerabilities: [] });
  assert.equal(hasInitiativeCardValues(sanitizeInitiativeCard({ damageDefenses: { resistances: ["cold"] } })), true);
});

test("single-target actions: Icekiss and Polar Ray halve only the resisted component", () => {
  const icekiss = buildBossActionMutation({ profile: p2, action: ability(p2, "Icekiss +2"), sourceItem: boss,
    targetItem: creature("dars", 60, { resistances: ["cold"] }), mode: "melee", outcome: "hit",
    componentAmounts: { slashing: 18, cold: 7 }, actionInstanceId: "ice-1", round: 1, expectedDefenses: { resistances: ["cold"] } });
  assert.deepEqual(icekiss.damageComponents.map((c) => [c.type, c.inputAmount, c.defense, c.amount]), [["slashing", 18, null, 18], ["cold", 7, "resistance", 3]]);
  assert.equal(icekiss.change.afterHP, 39);
  const polar = buildBossActionMutation({ profile: p3, action: ability(p3, "Polar Ray"), sourceItem: boss,
    targetItem: creature("dars", 60, { immunities: ["necrotic"] }), mode: "ranged", outcome: "hit",
    componentAmounts: { cold: 10, necrotic: 10 }, actionInstanceId: "polar-1", round: 1 });
  assert.deepEqual(polar.damageComponents.map((c) => c.amount), [10, 0]);
});

test("Blizzard success plus cold resistance; an ignored defense is recorded and not applied", () => {
  const action = ability(p3, "Blizzard Strike");
  const target = creature("mira", 45, { resistances: ["cold"] });
  const passed = buildBossActionMutation({ profile: p3, action, sourceItem: boss, targetItem: target, outcome: "passed",
    componentAmounts: { bludgeoning: 9, cold: 9 }, actionInstanceId: "bliz-1", round: 1 });
  assert.deepEqual(passed.damageComponents.map((c) => c.amount), [4, 2]);
  const ignored = buildBossActionMutation({ profile: p3, action, sourceItem: boss, targetItem: target, outcome: "failed",
    componentAmounts: { bludgeoning: 9, cold: 9 }, actionInstanceId: "bliz-2", round: 1, ignoredDefenses: ["cold"] });
  assert.deepEqual(ignored.damageComponents[1], { id: "cold", formula: "2d8", type: "cold", average: 9, inputAmount: 9, factor: "full",
    defense: null, defenseSource: "actor-profile", defenseIgnored: "resistance", amount: 9 });
});

test("Breath with 4 of 6 PCs resistant to cold: per component and per outcome", () => {
  const ids = ["a", "b", "c", "d", "e", "f"];
  const targets = ids.map((id, index) => creature(id, 100, index < 4 ? { resistances: ["cold"] } : null));
  const outcomes = { a: "failed", b: "passed", c: "failed", d: "passed", e: "failed", f: "passed" };
  const plan = buildBossActionGroupMutation({ profile: p2, action: ability(p2, "Breath of the Long Night"), sourceItem: breathBoss,
    targetItems: targets, outcomes, componentAmounts: { cold: 33, necrotic: 13 }, actionInstanceId: "breath-res", round: 1,
    manualConfirmed: true, areaPlacement: { ...AREA, areaTargetIds: ids } });
  assert.deepEqual(plan.causality.targets.map((t) => [t.id, t.outcome, t.requestedDamage]),
    [["a", "failed", 29], ["b", "passed", 14], ["c", "failed", 29], ["d", "passed", 14], ["e", "failed", 46], ["f", "passed", 22]]);
  assert.equal(plan.causality.targets[0].damageComponents[0].defenseSource, "actor-profile");
  assert.equal(plan.options.metadataPatches.filter((patch) => patch.fields.initiativeCard?.mode === "assert").length, 1 + 6,
    "the boss card plus every damaged target's profile are commit preconditions");
});

test("a profile that changed since the preview refuses the plan before any mutation", () => {
  assert.throws(() => buildBossActionGroupMutation({ profile: p2, action: ability(p2, "Breath of the Long Night"), sourceItem: breathBoss,
    targetItems: [creature("a", 50, { resistances: ["cold"] })], outcomes: { a: "failed" }, componentAmounts: { cold: 33, necrotic: 13 },
    actionInstanceId: "breath-stale", round: 1, manualConfirmed: true, areaPlacement: AREA, expectedDefenses: { a: {} } }), /difese ai danni di a sono cambiate/);
});

test("console preview uses the same arithmetic and lists only relevant defenses", () => {
  const components = ability(p2, "Breath of the Long Night").execution.damage;
  assert.equal(bossDefendedDamage(components, { cold: "33", necrotic: "13" }, "passed", { resistances: ["cold"] }), 14);
  assert.equal(bossDefendedDamage(components, { cold: "33", necrotic: "13" }, "passed", { resistances: ["cold"] }, ["cold"]), 22);
  assert.deepEqual(relevantDamageDefenses({ resistances: ["cold", "fire"] }, components), [{ type: "cold", defense: "resistance", ignored: false }]);
});
