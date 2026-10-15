import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { importBossActionHTML } from "../src/bossActionProfileCore.js";
import { buildBossActionGroupMutation, bossConditionAppliedAt, isBossActionGroupExecution } from "../src/bossActionExecutionCore.js";
import { withEpicLog } from "../test-support/bossSequenceState.js";

const META = "com.thebigpicture.initiative/meta";
const profile = await importBossActionHTML(await readFile(new URL("fixtures/boss-actions/auril-phase-2.html", import.meta.url), "utf8"));
const breath = profile.abilities.find((entry) => entry.name === "Breath of the Long Night");
const creature = (id, hp) => ({ id, name: id, type: "IMAGE", layer: "CHARACTER", metadata: { [META]: { hp, hpMax: hp, inInitiative: true } } });
// v20: Breath of the Long Night follows Breathe Deep in the same round (the round log on the boss token).
const boss = withEpicLog(creature("auril", 580), profile, 1, ["breathe-deep"]);
const turnState = { round: 1, order: ["auril", "dars", "__EPIC__:auril:1", "mira"], current: 2 };
const build = (overrides = {}) => buildBossActionGroupMutation({ profile, action: breath, sourceItem: boss,
  targetItems: [creature("dars", 60), creature("mira", 45), creature("sera", 38)],
  outcomes: { dars: "failed", mira: "passed", sera: "passed" }, componentAmounts: { cold: 7, necrotic: 5 },
  actionInstanceId: "breath-1", round: 1, turnState, manualConfirmed: true,
  areaPlacement: { ruleId: "boss-action-area:cone:60ft", start: { x: 0, y: 0 }, end: { x: 600, y: 0 }, areaTargetIds: ["dars", "mira", "sera"] }, ...overrides });

test("odd base amounts are halved per component with the shared policy before summing", () => {
  const plan = build();
  const sera = plan.causality.targets.find((target) => target.id === "sera");
  assert.deepEqual(sera.damageComponents.map((c) => [c.inputAmount, c.factor, c.amount]), [[7, "half", 3], [5, "half", 2]]);
  assert.equal(sera.requestedDamage, 5, "not floor(12 / 2) = 6");
  assert.equal(plan.causality.targets.find((target) => target.id === "dars").requestedDamage, 12);
});

test("the plan is one hp:set for every target plus Accecato only for failures, inside one command", () => {
  const plan = build();
  assert.deepEqual(plan.operations.map((operation) => operation.type), ["hp:set", "condition:add", "condition:automate"]);
  assert.deepEqual(plan.operations[0].updates.map((update) => [update.itemId, update.hp]), [["dars", 48], ["mira", 40], ["sera", 33]]);
  const add = plan.operations[1];
  assert.deepEqual(add.targetIds, ["dars"]);
  assert.equal(add.conditionName, "Accecato");
  assert.equal(add.instanceIds.dars, "breath-1:accecato:dars");
  assert.equal(add.options.parentEffectId, "", "independent from any other Accecato");
  assert.equal(add.options.sourceId, "auril");
  assert.deepEqual(add.options.expiry, { mode: "turn-end", actor: "source", remaining: 1, anchor: "next-turn", actorId: "auril" });
  assert.deepEqual(add.options.appliedAt, { round: 1, actorId: "__EPIC__:auril:1", phase: "turn", turnKey: "1:2:__EPIC__:auril:1" });
  assert.equal(plan.options.commandId, "breath-1");
  assert.equal(plan.options.history.kind, "monster-action");
  assert.deepEqual(plan.options.targetIds, ["dars", "mira", "sera"]);
});

test("all passed saves add no condition; incomplete or unconfirmed decisions build nothing", () => {
  const passed = build({ outcomes: { dars: "passed", mira: "passed", sera: "passed" } });
  assert.deepEqual(passed.operations.map((operation) => operation.type), ["hp:set"]);
  assert.throws(() => build({ outcomes: { dars: "failed", mira: "passed" } }), /Manca l’esito/);
  assert.doesNotThrow(() => build({ manualConfirmed: false }), "v20: the recharge and the sequence come from the round log");
  assert.throws(() => build({ sourceItem: creature("auril", 580) }), /richiede Breathe Deep nello stesso round/);
  assert.throws(() => build({ componentAmounts: { cold: 7 } }), /danno/i);
  assert.throws(() => build({ targetItems: [] }), /almeno un bersaglio/);
  assert.throws(() => build({ targetItems: [{ ...creature("__EPIC__:auril:1", 1) }] }), /creatura reale/);
});

test("the drawn area is required, matched to the profile cone and recorded with manual adjustments", () => {
  assert.throws(() => build({ areaPlacement: null }), /Disegna l’area/);
  assert.throws(() => build({ areaPlacement: { ruleId: "boss-action-area:cone:30ft", start: { x: 0, y: 0 }, end: { x: 1, y: 0 }, areaTargetIds: [] } }), /Disegna l’area/);
  assert.throws(() => build({ areaPlacement: { ruleId: "boss-action-area:cone:60ft", start: { x: 5, y: 5 }, end: { x: 5, y: 5 }, areaTargetIds: [] } }), /Disegna l’area/);
  const plan = build({ targetItems: [creature("dars", 60), creature("sera", 38), creature("lyra", 30)], outcomes: { dars: "failed", sera: "passed", lyra: "passed" } });
  assert.deepEqual(plan.causality.area, { shape: "cone", size: 60, origin: "Titano", verification: "placed",
    placement: { ruleId: "boss-action-area:cone:60ft", start: { x: 0, y: 0 }, end: { x: 600, y: 0 } },
    areaTargetIds: ["dars", "mira", "sera"], addedManually: ["lyra"], removedManually: ["mira"] });
  assert.match(plan.causality.manualVerification.steps[0], /disegnato dal GM.*1 aggiunti e 1 tolti a mano/);
  assert.deepEqual(plan.causality.resources.map((r) => [r.period, r.limit, r.beforeUsed, r.afterUsed]), [["round", 1, 0, 1]], "Breath is counted 1/Round with the damage");
});

test("duplicate target items collapse to one application", () => {
  const plan = build({ targetItems: [creature("dars", 60), creature("dars", 60)], outcomes: { dars: "failed" } });
  assert.equal(plan.operations[0].updates.length, 1);
  assert.deepEqual(plan.operations[1].targetIds, ["dars"]);
});

test("helpers: group detection and appliedAt strip paragon suffixes", () => {
  assert.equal(isBossActionGroupExecution(breath), true);
  assert.equal(isBossActionGroupExecution(profile.abilities.find((entry) => entry.name === "Icekiss +2")), false);
  assert.equal(bossConditionAppliedAt({ round: 2, order: ["auril::p2"], current: 0 }).actorId, "auril");
  assert.equal(bossConditionAppliedAt(null), null);
});
