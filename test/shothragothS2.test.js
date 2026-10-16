// Shothragoth S2 (profile v18): Il Corpo Non Era Qui, Arto che Precede il Corpo (a chosen effect on a hit) and Scagliare
// (a flat throw with a collision save).
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { importBossActionHTML, validateBossActionProfile } from "../src/bossActionProfileCore.js";
import { buildBossActionMutation, buildBossThrowMutation } from "../src/bossActionExecutionCore.js";
import { bossActionResultSummary, bossActionRowMeta, validateBossActionSelection, validateBossThrowSelection } from "../src/bossActionsViewCore.js";

const META = "com.thebigpicture.initiative/meta";
const html = await readFile(new URL("fixtures/boss-actions/shothragoth.html", import.meta.url), "utf8");
const profile = await importBossActionHTML(html);
const ability = (name) => profile.abilities.find((entry) => entry.name === name);
const arto = ability("Arto che Precede il Corpo");
const corpo = ability("Il Corpo Non Era Qui");
const scagliare = ability("Scagliare");
const creature = (id, hp, extra = {}) => ({ id, name: id, type: "IMAGE", layer: "CHARACTER", metadata: { [META]: { hp, hpMax: hp, inInitiative: true, ...extra } } });
const defenses = (list) => ({ initiativeCard: { damageDefenses: { immunities: [], resistances: [], vulnerabilities: [], ...list } } });
const boss = creature("shothragoth", 406);
const held = { conditions: { version: 2, instances: [{ id: "grab-1", condition: "Afferrato", active: true, sourceId: "shothragoth" }] } };
const hit = (overrides = {}) => buildBossActionMutation({ profile, action: arto, sourceItem: boss, targetItem: creature("dars", 60), mode: "melee", outcome: "hit",
  componentAmounts: { bludgeoning: 16, psychic: 7 }, actionInstanceId: "boss-action:arto", round: 1, grappledIds: [], ...overrides });
const throwIt = (overrides = {}) => buildBossThrowMutation({ profile, action: scagliare, sourceItem: boss, targetItem: creature("dars", 60, held), damage: 13,
  actionInstanceId: "boss-action:scagliare", round: 1, grappledIds: ["dars"], ...overrides });

test("the three S2 abilities as closed v18 data", async () => {
  assert.deepEqual(arto.execution, { kind: "attack-damage", attack: { bonus: 10, type: "weapon", modes: ["melee"], reach: 20 }, target: { mode: "single", maxTargets: 1 },
    damage: [{ id: "bludgeoning", formula: "2d10+5", type: "bludgeoning", printedAverage: 16 }, { id: "psychic", formula: "2d6", type: "psychic", printedAverage: 7 }],
    onHit: { choices: [{ id: "pull", distance: 10, maxSize: "Enorme" }, { id: "grab", condition: "Afferrato", escapeDC: 18, maxSize: "Grande", single: true }] } });
  // v21: the teleport is the boss's own, picked on the map and applied with the save.
  assert.deepEqual(corpo.execution, { kind: "save-damage", save: { ability: "dex", dc: 18 }, target: { mode: "single", maxTargets: 1, range: 5 },
    damage: [{ id: "force", formula: "3d6", type: "force", printedAverage: 10 }], success: "half", onFailed: { conditions: [{ condition: "Prono", expiry: { mode: "manual" } }] },
    teleport: { range: 60 } });
  assert.match(corpo.manualText, /^Lo spazio d'arrivo dev'essere libero e percepito da Shothragoth; il bersaglio è una creatura entro 5 ft\./);
  assert.deepEqual(scagliare.execution, { kind: "throw", target: { mode: "single", maxTargets: 1 }, grapple: "release", distance: { max: 20 },
    damage: [{ id: "force", formula: "3d8", type: "force", printedAverage: 13 }], onLanding: { condition: "Prono" },
    collision: { save: { ability: "dex", dc: 18 }, onFailed: { sameDamage: true, condition: "Prono" } } });
  assert.equal(bossActionRowMeta(scagliare, {}).tag, "Lancio fino a 20 ft · 3d8");
  for (const [name, from, to] of [
    ["Arto che Precede il Corpo", "Shothragoth può tenere Afferrata una sola creatura alla volta.", "Shothragoth può tenere Afferrate due creature."],
    ["Il Corpo Non Era Qui", "Fallimento: 10 (3d6) danni da forza, e il bersaglio ha la condizione Prono.", "Fallimento: 10 (3d6) danni da forza, e il bersaglio ha la condizione Stordito."],
    ["Scagliare", "subisce gli stessi danni e ha la condizione Prono", "subisce metà danni"],
  ]) {
    assert.equal(html.split(from).length, 2, from);
    assert.equal((await importBossActionHTML(html.replace(from, to))).abilities.find((entry) => entry.name === name).automation, "UNSUPPORTED", to);
  }
  for (const mutate of [
    (p) => { p.abilities.find((e) => e.name === "Arto che Precede il Corpo").execution.onHit.choices[1].single = false; },
    (p) => { p.abilities.find((e) => e.name === "Arto che Precede il Corpo").execution.onHit.choices.pop(); },
    (p) => { p.abilities.find((e) => e.name === "Il Corpo Non Era Qui").execution.onFailed.conditions[0].condition = "Stordito"; },
    (p) => { p.abilities.find((e) => e.name === "Scagliare").execution.collision.onFailed.sameDamage = false; },
    (p) => { p.abilities.find((e) => e.name === "Scagliare").execution.edge = { save: { ability: "dex", dc: 15 } }; },
  ]) {
    const invalid = structuredClone(profile);
    mutate(invalid);
    assert.throws(() => validateBossActionProfile(invalid), /unsupported|unexpected|invalid/i);
  }
});

test("Arto che Precede il Corpo: a hit needs the chosen effect; a grab holds one creature at a time; a pull is a map reminder", () => {
  assert.throws(() => hit({ rider: "" }), /Scegli l’effetto del colpo/);
  const grab = hit({ rider: "grab" });
  assert.deepEqual(grab.conditions, [{ condition: "Afferrato", instanceId: "boss-action:arto:afferrato:dars", expiry: { mode: "manual" }, escapeDC: 18 }]);
  assert.equal(grab.operations.find((operation) => operation.type === "condition:add").conditionName, "Afferrato");
  assert.deepEqual(grab.causality.onHit, { choice: "grab", escapeDC: 18, heldBefore: [] });
  assert.throws(() => hit({ rider: "grab", grappledIds: ["mira"] }), /tiene già una creatura Afferrata/);
  const pull = hit({ rider: "pull" });
  assert.deepEqual(pull.conditions, []);
  assert.match(pull.manualText, /Trascina dars di 10 ft\. verso shothragoth sulla mappa \(se Enorme o più piccolo\)\./);
  assert.equal(pull.change.afterHP, 37);
  assert.deepEqual(hit({ outcome: "miss", rider: "" }).operations.filter((operation) => operation.type === "condition:add"), [], "a miss needs no choice");
  assert.equal(bossActionResultSummary({ onHit: { choice: "grab", escapeDC: 18 } }), "Afferrato (CD 18)");
  const targets = [boss, creature("dars", 60)];
  assert.equal(validateBossActionSelection({ sourceId: "shothragoth", action: arto, targetId: "dars", targets, mode: "melee", outcome: "hit",
    componentAmounts: { bludgeoning: 16, psychic: 7 } }).error, "Scegli l’effetto del colpo.");
  assert.equal(validateBossActionSelection({ sourceId: "shothragoth", action: arto, targetId: "dars", targets, mode: "melee", outcome: "hit",
    componentAmounts: { bludgeoning: 16, psychic: 7 }, rider: "pull" }).value.rider, "pull");
});

test("Il Corpo Non Era Qui: DEX 18, force damage, Prono as a standard condition on a failure, half and nothing else on a success", () => {
  const save = (outcome) => buildBossActionMutation({ profile, action: corpo, sourceItem: boss, targetItem: creature("mira", 45), outcome,
    componentAmounts: { force: 10 }, actionInstanceId: "boss-action:corpo", round: 1, teleport: { x: 450, y: 150 } });
  const failed = save("failed");
  assert.equal(failed.change.afterHP, 35);
  assert.deepEqual(failed.conditions.map((entry) => entry.condition), ["Prono"]);
  const add = failed.operations.find((operation) => operation.type === "condition:add");
  assert.deepEqual(add.options.expiry, { mode: "manual" });
  assert.equal(add.options.parentEffectId, "");
  const passed = save("passed");
  assert.equal(passed.change.afterHP, 40);
  assert.deepEqual(passed.conditions, []);
});

test("Scagliare: flat force damage, always Prono, the grapple ends; a creature it hits saves DEX 18 for the same roll and Prono", () => {
  const alone = throwIt();
  assert.equal(alone.change.afterHP, 47);
  assert.deepEqual(alone.released, [{ id: "grab-1", condition: "Afferrato" }]);
  assert.equal(alone.operations.find((operation) => operation.type === "condition:add").conditionName, "Prono");
  assert.equal(alone.causality.throw.distance, 20, "a flat throw records its reach");
  assert.equal(alone.edge, null);
  const failed = throwIt({ collisionItem: creature("mira", 45, defenses({ resistances: ["force"] })), collisionOutcome: "failed" });
  assert.deepEqual(failed.operations.find((operation) => operation.type === "hp:set").updates.map((update) => [update.itemId, update.hp]), [["dars", 47], ["mira", 39]],
    "Mira takes the same roll halved by her force resistance");
  assert.deepEqual(failed.operations.filter((operation) => operation.type === "condition:add").map((operation) => [operation.targetIds[0], operation.conditionName]),
    [["dars", "Prono"], ["mira", "Prono"]]);
  assert.equal(failed.extraChanges[0].item.id, "mira");
  assert.deepEqual([failed.causality.throw.collision.outcome, failed.causality.throw.collision.requestedDamage], ["failed", 6]);
  const passed = throwIt({ collisionItem: creature("mira", 45), collisionOutcome: "passed" });
  assert.deepEqual(passed.operations.filter((operation) => operation.type === "condition:add").map((operation) => operation.targetIds[0]), ["dars"]);
  assert.deepEqual(passed.extraChanges, []);
  assert.throws(() => throwIt({ collisionItem: creature("mira", 45) }), /esito del TS della creatura colpita/);
  assert.throws(() => throwIt({ collisionItem: creature("dars", 60, held), collisionOutcome: "failed" }), /un altro token/);
  assert.throws(() => throwIt({ grappledIds: [] }), /Afferrato dal boss/);
  assert.match(bossActionResultSummary({ throw: failed.causality.throw }), /contro mira: TS fallito, 6 danni e Prono/);
  const targets = [boss, creature("dars", 60), creature("mira", 45)];
  assert.deepEqual(validateBossThrowSelection({ sourceId: "shothragoth", action: scagliare, targetId: "dars", targets, grappledIds: ["dars"], damage: "13",
    collisionTargetId: "mira", collisionOutcome: "failed" }).value,
    { sourceId: "shothragoth", actionId: "scagliare", targetId: "dars", damage: 13, landing: "platform", collisionTargetId: "mira", collisionOutcome: "failed" });
  assert.equal(validateBossThrowSelection({ sourceId: "shothragoth", action: scagliare, targetId: "dars", targets, grappledIds: ["dars"], damage: "13",
    collisionTargetId: "mira" }).error, "Scegli l’esito del TS della creatura colpita.");
});
