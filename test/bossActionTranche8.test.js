// Tranche 8: Meteor Swarm (multi-point area, inner-scoped bludgeoning) and Evasion from the Rogue class build.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { importBossActionHTML, validateBossActionProfile, BOSS_ACTION_PROFILE_VERSION } from "../src/bossActionProfileCore.js";
import { buildBossActionGroupMutation } from "../src/bossActionExecutionCore.js";
import { actorHasEvasion, evasionAppliesTo, EVASION_FEATURE, EVASION_DEFENSE } from "../src/damageDefensesCore.js";
import { bossFeetPerCell, bossInnerTargetIds, bossPointTooClose, bossDefendedDamage, validateBossActionGroupSelection } from "../src/bossActionsViewCore.js";

const META = "com.thebigpicture.initiative/meta";
const phase2HTML = await readFile(new URL("fixtures/boss-actions/auril-phase-2.html", import.meta.url), "utf8");
const p2 = await importBossActionHTML(phase2HTML);
const ability = (profile, name) => profile.abilities.find((entry) => entry.name === name);
const meteor = ability(p2, "Meteor Swarm");
const card = (extra) => ({ initiativeCard: extra });
const creature = (id, hp, extra = {}) => ({ id, name: id, type: "IMAGE", layer: "CHARACTER", metadata: { [META]: { hp, hpMax: hp, inInitiative: true, ...extra } } });
const boss = creature("auril", 580);
const rogue = (level, more = {}) => card({ characterBuild: [{ classId: "ladro", level }], ...more });
const circle = (x, areaTargetIds, innerTargetIds) => ({ ruleId: "boss-action-area:circle:40ft", start: { x, y: 0 }, end: { x: x + 600, y: 0 }, areaTargetIds, innerTargetIds });
const FOUR = [circle(0, ["a", "b"], ["a"]), circle(1000, ["b", "c"], []), circle(2000, ["d"], ["d"]), circle(3000, [], [])];

test("every profile version from 1 to the current one stays readable (a stored library never breaks on upgrade)", () => {
  const icekiss = (({ group, ...entry }) => entry)(ability(p2, "Icekiss +2"));
  const trait = ability(p2, "Rimebound Link"); // a manual trait: trait auras arrived with v11
  for (let version = 1; version <= BOSS_ACTION_PROFILE_VERSION; version += 1) {
    const legacy = { ...structuredClone(p2), profileVersion: version, parserVersion: version, abilities: [structuredClone(icekiss), structuredClone(trait)] };
    assert.doesNotThrow(() => validateBossActionProfile(legacy), `version ${version}`);
  }
});

test("Meteor Swarm: four 40 ft circles on free points, bludgeoning only within 10 ft, DEX 19, 1/Phase, a requirement to confirm", () => {
  assert.equal(meteor.automation, "PARTIAL");
  assert.deepEqual(meteor.usage, { limit: 1, period: "phase" });
  assert.deepEqual(meteor.execution, {
    kind: "save-damage", save: { ability: "dex", dc: 19 },
    target: { mode: "multiple", selection: "area", area: { shape: "circle", size: 40, origin: "punti scelti", count: 4, innerRadius: 10 } },
    damage: [{ id: "cold", formula: "14d6", type: "cold", printedAverage: 49 }, { id: "bludgeoning", formula: "6d10", type: "bludgeoning", printedAverage: 33, scope: "inner" }],
    success: "half", requiresConfirmation: true,
  });
  assert.match(meteor.manualText, /Gather the Winter Sky come prima Azione Epica.*ultima Azione Epica del round 2\.$/);
});

test("altered Meteor Swarm clauses stay manual; the v9 contract is closed", async () => {
  for (const [from, to] of [
    ["entro 10 ft. da almeno uno dei punti scelti", "entro 15 ft. da almeno uno dei punti scelti"],
    ["Una creatura subisce ciascuna componente di danno una sola volta", "Una creatura subisce i danni di ogni esplosione"],
    ["ogni creatura in una o più esplosioni", "ogni creatura in una esplosione"],
  ]) {
    assert.equal(phase2HTML.split(from).length, 2, from);
    assert.equal(ability(await importBossActionHTML(phase2HTML.replace(from, to)), "Meteor Swarm").automation, "UNSUPPORTED", to);
  }
  for (const mutate of [
    (e) => { e.execution.target.area.count = 9; },
    (e) => { e.execution.target.area.shape = "cone"; },
    (e) => { e.execution.target.area.innerRadius = 50; },
    (e) => { e.execution.damage[1].scope = "outer"; },
    (e) => { e.execution.damage[0].scope = "inner"; },
    (e) => { delete e.execution.damage[1].scope; },
    (e) => { e.execution.requiresConfirmation = false; },
  ]) {
    const invalid = structuredClone(p2);
    mutate(ability(invalid, "Meteor Swarm"));
    assert.throws(() => validateBossActionProfile(invalid), /invalid|unsupported|unexpected/i);
  }
  const v8 = structuredClone({ ...p2, profileVersion: 8, parserVersion: 8 });
  assert.throws(() => validateBossActionProfile(v8), /unexpected|unsupported|invalid/i);
});

test("Evasion comes from the Rogue class build (7th level, the catalog feature), only on DEX saves that halve damage", async () => {
  const catalog = JSON.parse(await readFile(new URL("../src/class-features-runtime.json", import.meta.url), "utf8"));
  const feature = catalog.features.find((entry) => entry.id === EVASION_FEATURE.id);
  assert.deepEqual({ classId: feature.classId, minimumLevel: feature.minimumLevel, defaultEnabled: feature.defaultEnabled, subclassId: feature.subclassId },
    { classId: EVASION_FEATURE.classId, minimumLevel: EVASION_FEATURE.minimumLevel, defaultEnabled: true, subclassId: "" }, "kept in step with the catalog");
  assert.equal(actorHasEvasion(rogue(7).initiativeCard), true);
  assert.equal(actorHasEvasion(rogue(6).initiativeCard), false);
  assert.equal(actorHasEvasion(rogue(9, { classFeaturesConfigured: true, enabledClassFeatureIds: [] }).initiativeCard), false, "turned off in the class features");
  assert.equal(actorHasEvasion(rogue(9, { classFeaturesConfigured: true, enabledClassFeatureIds: ["ladro-elusione"] }).initiativeCard), true);
  assert.equal(actorHasEvasion({ characterBuild: [{ classId: "guerriero", level: 20 }] }), false);
  assert.equal(evasionAppliesTo(meteor.execution), true);
  assert.equal(evasionAppliesTo(ability(p2, "Hand Slam").execution), true);
  assert.equal(evasionAppliesTo(ability(p2, "Titan's Grasp").execution), false, "a success already takes no damage");
  assert.equal(evasionAppliesTo(ability(p2, "Breath of the Long Night").execution), false, "a CON save");
});

test("multi-point geometry: feet per cell, within 10 ft of a drawn centre, and points that are too close", () => {
  assert.equal(bossFeetPerCell({ parsed: { multiplier: 5, unit: "ft" } }), 5);
  assert.equal(bossFeetPerCell({ parsed: { multiplier: 1.5, unit: "m" } }), 5);
  assert.equal(bossFeetPerCell({ parsed: { multiplier: 1, unit: "hex" } }), null);
  const box = (x, y, size = 150) => ({ min: { x: x - size / 2, y: y - size / 2 }, max: { x: x + size / 2, y: y + size / 2 } });
  const measure = { dpi: 150, feetPerCell: 5 };
  assert.deepEqual(bossInnerTargetIds({ center: { x: 0, y: 0 }, radiusFeet: 10, ...measure,
    bounds: [{ id: "near", bounds: box(225, 0) }, { id: "edge", bounds: box(0, 300) }, { id: "far", bounds: box(900, 0) }] }), ["near", "edge"]);
  assert.equal(bossPointTooClose({ x: 0, y: 0 }, [{ x: 3000, y: 0 }, { x: 450, y: 0 }], { radiusFeet: 10, ...measure }), 1, "15 ft from the second point");
  assert.equal(bossPointTooClose({ x: 0, y: 0 }, [{ x: 600, y: 0 }], { radiusFeet: 10, ...measure }), -1, "exactly 20 ft is allowed");
});

test("the plan needs all four points; the group is their union; bludgeoning only for the creatures kept within 10 ft", () => {
  const targets = [creature("a", 100), creature("b", 100), creature("c", 100), creature("d", 100)];
  const base = { profile: p2, action: meteor, sourceItem: boss, targetItems: targets, outcomes: { a: "failed", b: "failed", c: "passed", d: "failed" },
    componentAmounts: { cold: 49, bludgeoning: 33 }, actionInstanceId: "meteor-1", round: 2, manualConfirmed: true };
  assert.throws(() => buildBossActionGroupMutation({ ...base, areaPlacements: FOUR.slice(0, 3), innerIds: ["a"] }), /tutte le 4 esplosioni/);
  assert.throws(() => buildBossActionGroupMutation({ ...base, manualConfirmed: false, areaPlacements: FOUR, innerIds: ["a"] }), /Conferma/);
  // The GM drops "d" from the computed inner set and adds "b".
  const plan = buildBossActionGroupMutation({ ...base, areaPlacements: FOUR, innerIds: ["a", "b"] });
  assert.deepEqual(plan.causality.targets.map((target) => [target.id, target.requestedDamage, target.inner]),
    [["a", 82, true], ["b", 82, true], ["c", 24, false], ["d", 49, false]]);
  assert.deepEqual(plan.causality.area.areaTargetIds, ["a", "b", "c", "d"]);
  assert.deepEqual(plan.causality.area.innerTargetIds, ["a", "d"]);
  assert.deepEqual(plan.causality.area.innerAddedManually, ["b"]);
  assert.deepEqual(plan.causality.area.innerRemovedManually, ["d"]);
  assert.equal(plan.causality.area.placements.length, 4);
  assert.deepEqual(plan.causality.resources.map((row) => [row.period, row.afterUsed]), [["phase", 1]]);
  assert.match(plan.options.history.payload.manualRemainder, /4 cerchi di 40 ft\..*Entro 10 ft\. da un punto: 2/);
});

test("Evasion, cold resistance and the mark combine per creature on Meteor Swarm", () => {
  const mark = { conditions: { version: 2, instances: [{ id: "m", condition: "Mark of the Frostmaiden", effectId: "monster-mark:auril:mark-of-the-frostmaiden", active: true }] } };
  const targets = [
    creature("a", 100, rogue(7)),
    creature("b", 100, { ...rogue(7), initiativeCard: { ...rogue(7).initiativeCard, damageDefenses: { resistances: ["cold"] } } }),
    creature("c", 100, { initiativeCard: { damageDefenses: { resistances: ["cold"] } }, ...mark }),
    creature("d", 100, rogue(7)),
  ];
  const plan = buildBossActionGroupMutation({ profile: p2, action: meteor, sourceItem: boss, targetItems: targets,
    outcomes: { a: "passed", b: "failed", c: "failed", d: "failed" }, componentAmounts: { cold: 49, bludgeoning: 33 },
    actionInstanceId: "meteor-2", round: 2, manualConfirmed: true, areaPlacements: FOUR, innerIds: ["a", "b", "c", "d"],
    ignoredDefenses: { d: [EVASION_DEFENSE] }, expectedEvasionIds: ["a", "b", "d"] });
  assert.deepEqual(plan.causality.targets.map((target) => [target.id, target.requestedDamage, target.evasion || null]), [
    ["a", 0, "applied"],       // success with Evasion
    ["b", 12 + 16, "applied"],  // failure → half: cold 24 then resisted 12; bludgeoning 16
    ["c", 49 + 33, null],       // marked: the cold resistance is ignored this round
    ["d", 82, "ignored"],       // the GM ignored Evasion for this resolution
  ]);
  assert.throws(() => buildBossActionGroupMutation({ profile: p2, action: meteor, sourceItem: boss, targetItems: targets.slice(0, 1),
    outcomes: { a: "passed" }, componentAmounts: { cold: 49, bludgeoning: 33 }, actionInstanceId: "meteor-3", round: 2,
    manualConfirmed: true, areaPlacements: FOUR, innerIds: [], expectedEvasionIds: [] }), /Elusione di a è cambiata/);
});

test("the console preview uses the same arithmetic and the selection carries the four points and the inner choices", () => {
  const components = meteor.execution.damage;
  assert.equal(bossDefendedDamage(components, { cold: 49, bludgeoning: 33 }, "passed", {}, [], false, true), 0);
  assert.equal(bossDefendedDamage(components, { cold: 49, bludgeoning: 33 }, "failed", {}, [], false, true), 24 + 16);
  const selection = validateBossActionGroupSelection({ sourceId: "auril", action: meteor, targetIds: ["a"], targets: [creature("a", 10)],
    outcomes: { a: "failed" }, componentAmounts: { cold: 49, bludgeoning: 33 }, manualConfirmed: true, areas: FOUR.slice(0, 2), innerIds: ["a"] });
  assert.match(selection.error, /Disegna tutte le 4 esplosioni \(2\/4\)/);
  const ready = validateBossActionGroupSelection({ sourceId: "auril", action: meteor, targetIds: ["a"], targets: [creature("a", 10)],
    outcomes: { a: "failed" }, componentAmounts: { cold: 49, bludgeoning: 33 }, manualConfirmed: true, areas: FOUR, innerIds: ["a", "zzz"] });
  assert.equal(ready.ok, true, ready.error);
  assert.equal(ready.value.areaPlacements.length, 4);
  assert.deepEqual(ready.value.innerIds, ["a"]);
  assert.match(validateBossActionGroupSelection({ sourceId: "auril", action: meteor, targetIds: ["a"], targets: [creature("a", 10)],
    outcomes: { a: "failed" }, componentAmounts: { cold: 49, bludgeoning: 33 }, manualConfirmed: false, areas: FOUR }).error, /Conferma requisito e sequenza/);
});
