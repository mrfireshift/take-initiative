// Il Corpo Non Era Qui (profile v21): the boss teleports with the spells' engine (token:teleport side effect) in the
// same command as the save; the GM picks the destination cell within 60 ft (18 m) with one click.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { importBossActionHTML, validateBossActionProfile } from "../src/bossActionProfileCore.js";
import { buildBossActionMutation } from "../src/bossActionExecutionCore.js";
import { bossActionAutomationSummary, bossActionResultSummary, bossReachFeet, validateBossActionSelection } from "../src/bossActionsViewCore.js";
import { getSpellAreaRuleById } from "../src/spellAreaRules.js";

const META = "com.thebigpicture.initiative/meta";
const html = await readFile(new URL("fixtures/boss-actions/shothragoth.html", import.meta.url), "utf8");
const profile = await importBossActionHTML(html);
const corpo = profile.abilities.find((entry) => entry.name === "Il Corpo Non Era Qui");
const creature = (id, hp, position = { x: 0, y: 0 }) => ({ id, name: id, type: "IMAGE", layer: "CHARACTER", position,
  metadata: { [META]: { hp, hpMax: hp, inInitiative: true } } });
const boss = creature("shothragoth", 406, { x: 300, y: 300 });
const plan = (overrides = {}) => buildBossActionMutation({ profile, action: corpo, sourceItem: boss, targetItem: creature("mira", 45), outcome: "failed",
  componentAmounts: { force: 10 }, actionInstanceId: "boss-action:corpo", round: 1, teleport: { x: 750, y: 300 }, ...overrides });

test("v21 data: the teleport range comes from the stat block; the contract is closed", async () => {
  assert.deepEqual(corpo.execution.teleport, { range: 60 });
  assert.equal(profile.profileVersion, 25);
  const changed = await importBossActionHTML(html.replace("si teletrasporta fino a 60 ft.", "si teletrasporta fino a 45 ft."));
  assert.deepEqual(changed.abilities.find((entry) => entry.name === "Il Corpo Non Era Qui").execution.teleport, { range: 45 });
  for (const mutate of [
    (e) => { e.execution.teleport.range = 32; },
    (e) => { e.execution.teleport.extra = true; },
    (e) => { delete e.execution.target.range; },
  ]) {
    const invalid = structuredClone(profile);
    mutate(invalid.abilities.find((entry) => entry.name === "Il Corpo Non Era Qui"));
    assert.throws(() => validateBossActionProfile(invalid), /invalid|unexpected|unsupported|needs/i);
  }
  const v20 = structuredClone({ ...profile, profileVersion: 20, parserVersion: 20 });
  assert.throws(() => validateBossActionProfile(v20), /unexpected field teleport/);
  assert.match(bossActionAutomationSummary(corpo, {}).automatic, /teletrasporto del boss sulla casella scelta \(entro 60 ft\)/);
});

test("the destination rule: one cell within 60 ft (18 m) of the boss; the area tool takes a plain click", async () => {
  const rule = getSpellAreaRuleById("boss-action-area:teleport:60ft");
  assert.deepEqual([rule.geometry.shape, rule.geometry.size.value, rule.placement.mode, rule.placement.origin, rule.placement.range.value],
    ["square", 1.5, "point", "point", 18]);
  const tool = await readFile(new URL("../src/aoeTargetTool.js", import.meta.url), "utf8");
  assert.match(tool, /onToolClick: \(_context, event\) => \{\s*const runtime = spellPlacementSession;\s*if \(!runtime \|\| spellMovementSession \|\| !isPointPlacement\(runtime\.rule\)/);
  const console = await readFile(new URL("../src/boss-actions.js", import.meta.url), "utf8");
  assert.match(console, /pointSelection:true,directPointSelection:true,autoConfirmPoint:true/);
  assert.equal(getSpellAreaRuleById("boss-action-area:teleport:32ft"), null);
});

test("one command: the save, Prono and the boss's teleport as a side effect; no destination, no plan", () => {
  const failed = plan();
  assert.equal(failed.change.afterHP, 35);
  assert.deepEqual(failed.options.sideEffects, [{ type: "token:teleport", targetId: "shothragoth", position: { x: 750, y: 300 }, operationId: "boss-action:corpo" }]);
  assert.deepEqual(failed.options.targetIds, ["mira", "shothragoth"]);
  assert.deepEqual(failed.causality.teleport, { range: 60, from: { x: 300, y: 300 }, to: { x: 750, y: 300 } });
  assert.equal(plan({ outcome: "passed" }).options.sideEffects.length, 1, "the boss teleports whatever the save");
  assert.throws(() => plan({ teleport: null }), /Scegli sulla mappa dove si teletrasporta il boss/);
  assert.throws(() => plan({ teleport: { x: "a", y: 1 } }), /Scegli sulla mappa/);
  assert.equal(bossActionResultSummary({ teleport: failed.causality.teleport }), "boss teletrasportato");
  const targets = [boss, creature("mira", 45)];
  const selection = (teleport) => validateBossActionSelection({ sourceId: "shothragoth", action: corpo, targetId: "mira", targets, outcome: "failed",
    componentAmounts: { force: 10 }, teleport });
  assert.equal(selection(null).error, "Scegli sulla mappa dove si teletrasporta il boss.");
  assert.deepEqual(selection({ x: 750, y: 300 }).value.teleport, { x: 750, y: 300 });
});

test("the reach warning measures grid distance between the boss's space and the target (adjacent = 5 ft)", () => {
  const rect = (x, y, cells) => ({ min: { x, y }, max: { x: x + cells * 150, y: y + cells * 150 } });
  assert.equal(bossReachFeet(rect(0, 0, 3), rect(450, 0, 1), 150, 5), 5, "adjacent");
  assert.equal(bossReachFeet(rect(0, 0, 3), rect(600, 0, 1), 150, 5), 10, "one cell between");
  assert.equal(bossReachFeet(rect(0, 0, 3), rect(450, 450, 1), 150, 5), 5, "diagonal neighbour");
  assert.equal(bossReachFeet(rect(0, 0, 3), rect(0, 0, 1), 150, null), null, "no scale, no warning");
});
