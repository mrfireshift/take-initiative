// Tranche 11: Hurl (throw the held creature) and Epic Resistance (a flat d20 ends one effect on the boss).
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { importBossActionHTML, validateBossActionProfile } from "../src/bossActionProfileCore.js";
import { bossActiveEffects, bossThrowDistances, buildBossEffectEndMutation, buildBossThrowMutation } from "../src/bossActionExecutionCore.js";
import { bossActionExecutionKind, bossActionResultSummary, bossActionRowMeta, validateBossEffectEndSelection, validateBossThrowSelection } from "../src/bossActionsViewCore.js";
import { bossEdgeSaveNotice } from "../src/bossEdgeSaveCore.js";
import { withoutLinkResistance } from "../test-support/bossLegacyProfile.js";

const META = "com.thebigpicture.initiative/meta";
const SPELLS = "com.thebigpicture.initiative/spells";
const phase2HTML = await readFile(new URL("fixtures/boss-actions/auril-phase-2.html", import.meta.url), "utf8");
const phase3HTML = await readFile(new URL("fixtures/boss-actions/auril-phase-3.html", import.meta.url), "utf8");
const p2 = await importBossActionHTML(phase2HTML);
const p3 = await importBossActionHTML(phase3HTML);
const ability = (profile, name) => profile.abilities.find((entry) => entry.name === name);
const hurl = ability(p2, "Hurl");
const resistance = ability(p2, "Epic Resistance");
const creature = (id, hp, extra = {}) => ({ id, name: id, type: "IMAGE", layer: "CHARACTER", metadata: { [META]: { hp, hpMax: hp, inInitiative: true, ...extra } } });
const held = (extra = {}) => ({ conditions: { version: 2, instances: [
  { id: "grab", condition: "Afferrato", active: true, sourceId: "auril" },
  { id: "hold", condition: "Trattenuto", active: true, sourceId: "auril" },
  { id: "other", condition: "Afferrato", active: true, sourceId: "ogre" }] }, ...extra });
const throwPlan = (overrides = {}) => buildBossThrowMutation({ profile: p2, action: hurl, sourceItem: creature("auril", 580), targetItem: creature("dars", 60, held()),
  distance: 20, damage: 7, landing: "platform", actionInstanceId: "boss-action:t11", round: 2, grappledIds: ["dars"], ...overrides });

test("Hurl and Epic Resistance: the printed mechanics as closed v16 data", () => {
  assert.equal(hurl.automation, "PARTIAL");
  assert.deepEqual(hurl.execution, { kind: "throw", target: { mode: "single", maxTargets: 1 }, grapple: "release", distance: { max: 30, step: 10 },
    damage: [{ id: "bludgeoning", formula: "1d6", type: "bludgeoning", printedAverage: 3 }], onLanding: { condition: "Prono" }, edge: { save: { ability: "dex", dc: 15 } } });
  assert.deepEqual(bossThrowDistances(hurl.execution), [10, 20, 30]);
  for (const profile of [p2, p3]) {
    const entry = ability(profile, "Epic Resistance");
    assert.equal(entry.automation, "PARTIAL");
    assert.deepEqual(entry.execution, { kind: "effect-end", roll: { die: 20, threshold: 11 } });
    assert.deepEqual(entry.usage, {}, "no counter");
  }
  assert.match(resistance.manualText, /resta disponibile durante Gather the Winter Sky/);
  assert.equal(bossActionExecutionKind(hurl), "throw");
  assert.equal(bossActionExecutionKind(resistance), "effect-end");
  assert.equal(bossActionRowMeta(hurl, {}).tag, "Lancio fino a 30 ft · 1d6 ogni 10 ft");
  assert.equal(bossActionRowMeta(resistance, {}).tag, "d20 · 11+ termina un effetto");
});

test("altered Hurl or Epic Resistance texts stay manual; v15 profiles cannot carry the new shapes", async () => {
  for (const [html, name, from, to] of [
    [phase2HTML, "Hurl", "cade Prono se atterra sulla piattaforma", "cade Prono"],
    [phase2HTML, "Hurl", "Tiro Salvezza su Destrezza: CD 15. Fallimento: il bersaglio precipita.", "Tiro Salvezza su Forza: CD 15. Fallimento: il bersaglio precipita."],
    [phase3HTML, "Epic Resistance", "Con 11+, l'effetto termina", "Con 15+, l'effetto termina su di lei e su un alleato. Con 11+, l'effetto termina"],
    [phase3HTML, "Epic Resistance", "non può avere Vantaggio o Svantaggio", "può avere Vantaggio"],
  ]) {
    assert.equal(html.split(from).length, 2, from);
    assert.equal(ability(await importBossActionHTML(html.replace(from, to)), name).automation, "UNSUPPORTED", to);
  }
  for (const mutate of [
    (profile) => { ability(profile, "Hurl").execution.distance.step = 7; },
    (profile) => { ability(profile, "Hurl").execution.damage[0].type = "cold"; },
    (profile) => { ability(profile, "Hurl").execution.onLanding.condition = "Stordito"; },
    (profile) => { ability(profile, "Hurl").execution.grapple = "hold"; },
    (profile) => { ability(profile, "Epic Resistance").execution.roll.die = 12; },
    (profile) => { ability(profile, "Epic Resistance").execution.roll.bonus = 2; },
  ]) {
    const invalid = structuredClone(p2);
    mutate(invalid);
    assert.throws(() => validateBossActionProfile(invalid), /invalid|unsupported|unexpected/i);
  }
  const v15 = structuredClone({ ...p2, profileVersion: 15, parserVersion: 15 });
  for (const entry of v15.abilities) delete entry.sequence; // v20 shapes
  withoutLinkResistance(v15); // v26 shape
  assert.throws(() => validateBossActionProfile(v15), /unexpected field (grapple|roll)/);
});

test("Hurl on the platform: damage with defenses, the boss's grapple ends, Prono as a standard condition", () => {
  const plan = throwPlan({ targetItem: creature("dars", 60, held({ initiativeCard: { damageDefenses: { immunities: [], resistances: ["bludgeoning"], vulnerabilities: [] } } })) });
  assert.equal(plan.change.afterHP, 57, "7 bludgeoning, halved by resistance");
  assert.deepEqual(plan.released, [{ id: "grab", condition: "Afferrato" }, { id: "hold", condition: "Trattenuto" }], "only the boss's grapple");
  const ops = Object.fromEntries(plan.operations.map((operation) => [operation.type, operation]));
  assert.deepEqual(ops["condition:remove-instances"].removals, [{ itemId: "dars", instanceId: "grab" }, { itemId: "dars", instanceId: "hold" }]);
  assert.equal(ops["condition:add"].conditionName, "Prono");
  assert.deepEqual(ops["condition:add"].options, { sourceId: "auril", sourceName: "auril", parentEffectId: "", type: "automatic", manualRemoval: true, expiry: { mode: "manual" } });
  assert.equal(plan.edge, null);
  assert.deepEqual(plan.causality.throw, { distance: 20, landing: "platform", releasedConditions: plan.released, condition: "Prono" });
  assert.match(plan.options.label, /Hurl → dars \(20 ft, sulla piattaforma\)/);
});

test("Hurl beyond the edge: no Prono, an «Appeso al bordo» pill whose DEX save keeps it on a success and ends it on a failure", () => {
  const plan = throwPlan({ landing: "edge", distance: 30, damage: 10 });
  const add = plan.operations.find((operation) => operation.type === "condition:add");
  assert.equal(add.conditionName, "Appeso al bordo");
  assert.equal(add.options.effectKind, "debuff");
  assert.equal(plan.edge.instanceId, add.instanceIds.dars);
  assert.deepEqual(plan.edge.save, { ability: "dex", dc: 15 });
  const target = creature("dars", 50, { conditions: { version: 2, instances: [{ id: plan.edge.instanceId, condition: "Appeso al bordo", active: true,
    sourceId: "auril", effectId: add.options.effectId, effectKind: "debuff", manualRemoval: true, type: "automatic" }] } });
  const notice = bossEdgeSaveNotice({ item: target, edge: plan.edge, sourceName: "Auril", activationId: "boss-action:t11:edge" });
  assert.equal(notice.saveLabel, "TS DES CD 15");
  assert.equal(notice.resolution.outcomes.passed.mode, "keep-effect", "a success: still hanging");
  assert.deepEqual(notice.resolution.outcomes.failed.actions, [{ kind: "condition", action: "remove-instance", targetId: "dars", instanceId: plan.edge.instanceId }],
    "a failure: it falls");
  assert.equal(bossEdgeSaveNotice({ item: creature("dars", 50), edge: plan.edge }), null, "no pill, no reminder");
});

test("Hurl refuses a creature the boss does not hold, a distance off the steps, a missing landing", () => {
  assert.throws(() => throwPlan({ grappledIds: [] }), /Afferrato dal boss/);
  assert.throws(() => throwPlan({ distance: 15 }), /distanza/);
  assert.throws(() => throwPlan({ landing: "" }), /dove atterra/);
  assert.throws(() => throwPlan({ damage: "" }), /Inserisci il danno/);
  const targets = [creature("auril", 580), creature("dars", 60)];
  assert.equal(validateBossThrowSelection({ sourceId: "auril", action: hurl, targetId: "dars", targets, grappledIds: [], distance: 10, damage: 3, landing: "edge" }).error, "Il bersaglio deve essere Afferrato dal boss.");
  assert.deepEqual(validateBossThrowSelection({ sourceId: "auril", action: hurl, targetId: "dars", targets, grappledIds: ["dars"], distance: 10, damage: "3", landing: "edge" }).value,
    { sourceId: "auril", actionId: "hurl", targetId: "dars", distance: 10, damage: 3, landing: "edge" });
});

test("Epic Resistance lists every effect on the boss: spells with the conditions they impose, then conditions and pills", () => {
  const boss = creature("auril", 300, {
    [SPELLS]: [{ instanceId: "hold-1", name: "Blocca mostri", casterId: "mira", casterName: "Mira", conc: true }],
    conditions: { version: 2, instances: [
      { id: "para", condition: "Paralizzato", active: true, parentEffectId: "hold-1" },
      { id: "blind", condition: "Accecato", active: true, sourceName: "Dars" },
      { id: "faerie", condition: "Luminescenza", active: true, effectKind: "debuff" },
      { id: "old", condition: "Spaventato", active: false },
    ] },
  });
  assert.deepEqual(bossActiveEffects(boss), [
    { kind: "spell", instanceId: "hold-1", name: "Blocca mostri", sourceName: "Mira", concentration: true, conditions: ["Paralizzato"] },
    { kind: "condition", instanceId: "blind", name: "Accecato", sourceName: "Dars" },
    { kind: "condition", instanceId: "faerie", name: "Luminescenza", effectKind: "debuff" },
  ]);
  const plan = (effect, roll) => buildBossEffectEndMutation({ profile: p3, action: ability(p3, "Epic Resistance"), sourceItem: boss, effect, roll, actionInstanceId: "boss-action:er", round: 3 });
  const failed = plan({ kind: "condition", instanceId: "blind" }, 10);
  assert.equal(failed.passed, false);
  assert.deepEqual(failed.operations, [], "a failed roll ends nothing");
  assert.match(failed.options.history.label, /Epic Resistance fallita \(10\) · Accecato/);
  assert.deepEqual(failed.causality.effectEnd, { effect: bossActiveEffects(boss)[1], roll: 10, die: 20, threshold: 11, outcome: "failed", ended: false });
  const condition = plan({ kind: "condition", instanceId: "blind" }, 11);
  assert.deepEqual(condition.operations[0], { type: "condition:remove-instances", targetIds: ["auril"], removals: [{ itemId: "auril", instanceId: "blind" }] });
  const spell = plan({ kind: "spell", instanceId: "hold-1" }, 20);
  assert.deepEqual(spell.operations[0], { type: "spell:remove-requested", targetIds: ["auril"], instanceId: "hold-1" });
  assert.throws(() => plan({ kind: "condition", instanceId: "old" }, 15), /non è più attivo/);
  assert.throws(() => plan({ kind: "condition", instanceId: "blind" }, 0), /Inserisci il risultato del d20/);
  assert.throws(() => plan({ kind: "condition", instanceId: "blind" }, 21), /Inserisci il risultato del d20/);
  assert.equal(bossActionResultSummary({ effectEnd: { name: "Accecato", roll: 10, threshold: 11, passed: false } }), "fallita (10 su 11+): Accecato resta");
  assert.equal(validateBossEffectEndSelection({ sourceId: "auril", action: resistance, effects: [], effect: null, roll: 12 }).error, "Nessun effetto attivo sul boss.");
});
