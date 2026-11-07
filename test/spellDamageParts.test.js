// Two types in one damage (decisions D1–D4 of 6/11): Flame Strike, Ice Storm, Meteor Swarm and Destructive Wave have a box
// for each part in the panel, each with its type and its own defense, then the sum. The dice are read from the 2014 texts.
import test from "node:test";
import assert from "node:assert/strict";

// The harness mocks the SDK: the executors import it.
await import("../test-support/spellSweepHarness.js");
const {
  SPELL_DAMAGE_PART_FIELDS,
  spellCastDamageParts,
  spellCastDamagePartsHint,
  spellSaveDamageFormula,
} = await import("../src/spellCastResolutionRules.js");
const { spellDamagePartsAfterDefense, SPELL_DAMAGE_TYPE_LEFT_TO_GM } = await import("../src/spellDamageDefenseCore.js");
const { buildSpellUnifiedPanelContract, createSpellPanelSession } = await import("../src/spellUnifiedPanelCore.js");
const { buildUnifiedPanelViewModel } = await import("../src/spellUnifiedPanelViewCore.js");
const { buildSpellUnifiedAreaCommand } = await import("../src/spellUnifiedAreaAdapter.js");
const { buildSpellAreaResolutionExecutionPlan, spellAreaCausality } = await import("../src/spellAreaResolutionExecutor.js");
const { getAreaSaveAutomation } = await import("../src/spells-srd.js");

const META = "com.thebigpicture.initiative/meta";
const brief = (parts) => parts.map((part) => `${part.field}:${part.type}:${part.dice}`);

test("the four spells with two types in one damage, each part with its dice and its type", () => {
  assert.deepEqual(SPELL_DAMAGE_PART_FIELDS, ["damage", "secondDamage"]);
  assert.deepEqual(brief(spellCastDamageParts("flame-strike", { slotLevel: 5 })), ["damage:fire:4d6", "secondDamage:radiant:4d6"]);
  assert.deepEqual(brief(spellCastDamageParts("flame-strike", { slotLevel: 7 })), ["damage:fire:4d6", "secondDamage:radiant:4d6"],
    "its extra dice go where the caster wants: the boxes keep their own");
  assert.deepEqual(brief(spellCastDamageParts("ice-storm", { slotLevel: 4 })), ["damage:bludgeoning:2d8", "secondDamage:cold:4d6"]);
  assert.deepEqual(brief(spellCastDamageParts("ice-storm", { slotLevel: 6 })), ["damage:bludgeoning:4d8", "secondDamage:cold:4d6"],
    "1d8 bludgeoning more for each slot above the 4th");
  assert.deepEqual(brief(spellCastDamageParts("meteor-swarm", { slotLevel: 9 })), ["damage:fire:20d6", "secondDamage:bludgeoning:20d6"]);
  assert.deepEqual(brief(spellCastDamageParts("phb2014-onda-distruttiva", { slotLevel: 5 })), ["damage:thunder:5d6", "secondDamage:radiant:5d6"]);
  assert.deepEqual(brief(spellCastDamageParts("phb2014-onda-distruttiva", { slotLevel: 5, choiceValue: "necrotic" })),
    ["damage:thunder:5d6", "secondDamage:necrotic:5d6"]);
  assert.equal(spellCastDamageParts("phb2014-onda-distruttiva", { choiceValue: "necrotic" })[1].choice, true);
  assert.equal(spellSaveDamageFormula("phb2014-onda-distruttiva", "failed", 5), "5d6+5d6", "the thunder too: 10d6 in all");
  assert.equal(SPELL_DAMAGE_TYPE_LEFT_TO_GM["phb2014-onda-distruttiva"], undefined, "no longer left to the GM");
  for (const spellId of ["fireball", "cone-of-cold", "xanathar-coltello-di-ghiaccio", "prismatic-spray"]) {
    assert.deepEqual(spellCastDamageParts(spellId, { slotLevel: 7 }), [], spellId);
  }
});

test("Flame Strike above the 5th: where the extra dice go is the caster's choice, said under the boxes", () => {
  assert.equal(spellCastDamagePartsHint("flame-strike", 5), "");
  assert.equal(spellCastDamagePartsHint("flame-strike", 6), "Slot superiore: +1d6 al fuoco o ai radiosi, a tua scelta. Scrivili nella casella che scegli.");
  assert.match(spellCastDamagePartsHint("flame-strike", 8), /^Slot superiore: \+3d6 /u);
  assert.equal(spellCastDamagePartsHint("ice-storm", 6), "", "Ice Storm's extra dice are in its box");
});

test("each part halves on a save, then meets its own defense, then the sum, as the Boss console counts", () => {
  const parts = [{ type: "fire", amount: 13 }, { type: "radiant", amount: 15 }];
  const count = (factor, defenses, ignoredTypes = []) => spellDamagePartsAfterDefense({ parts, factor, defenses, ignoredTypes });
  assert.deepEqual(count("full", {}), { before: 28, after: 28, rows: [] });
  assert.deepEqual(count("half", {}), { before: 13, after: 13, rows: [] }, "6 + 7: each part halves on its own (D3)");
  const resistsFire = count("full", { resistances: ["fire"] });
  assert.equal(resistsFire.after, 6 + 15, "only the fire is halved");
  assert.deepEqual(resistsFire.rows, [{ type: "fire", defense: "resistance", ignored: false, before: 13, after: 6 }]);
  assert.equal(count("half", { resistances: ["fire"] }).after, 3 + 7, "13 → 6 for the save → 3 for the resistance; 15 → 7");
  assert.equal(count("full", { immunities: ["radiant"] }).after, 13);
  assert.equal(count("full", { vulnerabilities: ["radiant"] }).after, 13 + 30);
  assert.equal(count("full", { resistances: ["fire", "radiant"] }).after, 6 + 7);
  assert.equal(count("full", { resistances: ["fire"] }, ["fire"]).after, 28, "a defense ignored in this cast");
  assert.equal(count("full", { resistances: ["fire"] }, ["fire"]).rows[0].ignored, true);
  assert.equal(count("zero", { resistances: ["fire"] }).after, 0);
});

const sceneTokens = () => [
  { key: "goblin", label: "goblin", hp: 40, hpMax: 40, damageDefenses: { resistances: ["fire"] } },
  { key: "sera", label: "sera", hp: 40, hpMax: 40, damageDefenses: { vulnerabilities: ["radiant"] } },
  { key: "mira", label: "mira", hp: 40, hpMax: 40, damageDefenses: {} },
];

function panel({ spellId = "flame-strike", slotLevel = 5, variant = "", hpValues = { damage: 13, secondDamage: 15 },
  outcomes = { goblin: "failed", sera: "passed", mira: "failed" }, ignoredDefenses = {} } = {}) {
  const contract = buildSpellUnifiedPanelContract({ spellId, phase: "cast", choiceValue: variant, castContext: { slotLevel } });
  const ruleId = contract.presentation.placement.ruleId;
  const targetIds = Object.keys(outcomes);
  const session = createSpellPanelSession({
    contract, casterId: "caster", slotLevel, variant, targetIds, outcomes, hpValues, ignoredDefenses,
    placement: { status: "confirmed", confirmed: true, ruleId, spellId, casterId: "caster", targetLocked: true, targetIds,
      preview: { type: "circle", start: { x: 0, y: 0 }, end: { x: 70, y: 0 }, radius: 70, gridOrigin: { x: 0, y: 0 }, dpi: 70,
        targetIds, targetLocked: true } },
  });
  const view = buildUnifiedPanelViewModel({ contract, session, targetCandidates: sceneTokens() });
  return { contract, session, view };
}

test("the panel shows a box for each part, named by its type, and asks both", () => {
  const { view, contract } = panel({ slotLevel: 6 });
  assert.equal(contract.presentation.inputs.secondDamage.required, true);
  const fields = view.effects.fields.filter((field) => SPELL_DAMAGE_PART_FIELDS.includes(field.id));
  assert.deepEqual(fields.map((field) => [field.id, field.label]), [["damage", "Fuoco · 4d6"], ["secondDamage", "Radiosi · 4d6"]]);
  assert.match(fields[1].hint, /\+1d6 al fuoco o ai radiosi/u);
  assert.equal(fields[0].hint, "");
  const wave = panel({ spellId: "phb2014-onda-distruttiva", variant: "necrotic" });
  assert.deepEqual(wave.view.effects.fields.filter((field) => SPELL_DAMAGE_PART_FIELDS.includes(field.id)).map((field) => field.label),
    ["Tuono · 5d6", "Necrotici · 5d6"], "the variant names the second box");
  assert.deepEqual(wave.contract.presentation.variant.options.map((option) => option.label), ["Radiosi", "Necrotici"]);
  const fireball = buildSpellUnifiedPanelContract({ spellId: "fireball", phase: "cast", castContext: { slotLevel: 3 } });
  assert.equal(fireball.presentation.inputs.secondDamage.required, false, "a damage of one type keeps its one box");
  const missing = panel({ hpValues: { damage: 13 } });
  assert.equal(missing.view.workflow.validation.firstInvalidField, "secondDamage", "the second box is asked too");
  assert.ok(missing.view.workflow.validation.errors.includes("second-damage-required"));
  assert.equal(missing.view.workflow.primaryAction.label, "Inserisci il danno di tutte e due le parti");
});

test("the preview counts each part with its defense, and each chip says what it did to its part", () => {
  const { view } = panel();
  const row = (key) => view.targets.candidates.find((target) => target.key === key);
  assert.equal(row("goblin").hpPreview.afterHP, 40 - (6 + 15), "resists fire: 13 → 6, the radiant in full");
  assert.deepEqual(row("goblin").defenseChips.map((chip) => chip.text), ["Res. fuoco: 13 → 6"]);
  assert.equal(row("sera").hpPreview.afterHP, 40 - (6 + 14), "passed: 6 fire, 7 radiant doubled by the vulnerability");
  assert.deepEqual(row("sera").defenseChips.map((chip) => chip.text), ["Vuln. radiosi: 7 → 14"]);
  assert.equal(row("mira").hpPreview.afterHP, 40 - 28);
  assert.deepEqual(row("mira").defenseChips, []);
  const ignored = panel({ ignoredDefenses: { goblin: ["fire"] } }).view.targets.candidates.find((target) => target.key === "goblin");
  assert.equal(ignored.hpPreview.afterHP, 12, "the defense ignored: 28 in full");
  assert.equal(ignored.defenseChips[0].ignored, true);
});

async function planOf(options = {}) {
  const { contract, session } = panel(options);
  const items = sceneTokens().map((token) => ({ id: token.key, name: token.label, type: "IMAGE", layer: "CHARACTER",
    position: { x: 0, y: 0 }, metadata: { [META]: { hp: token.hp, hpMax: token.hpMax, inInitiative: true,
      initiativeCard: { damageDefenses: token.damageDefenses } } } }))
    .concat([{ id: "caster", name: "caster", type: "IMAGE", layer: "CHARACTER", position: { x: 0, y: 0 },
      metadata: { [META]: { hp: 30, hpMax: 30, inInitiative: true } } }]);
  const command = buildSpellUnifiedAreaCommand({ contract, session, source: { kind: "cast", sceneEpoch: 3 }, sceneEpoch: 3, currentSceneEpoch: 3 });
  assert.equal(command.valid, true, JSON.stringify(command.errors));
  const plan = await buildSpellAreaResolutionExecutionPlan(command, {
    sceneEpoch: 3, isCurrent: () => true,
    readItems: async (ids) => items.filter((item) => ids.includes(item.id)),
    readAllItems: async () => items, readSceneMetadata: async () => ({}),
    getInitiativeActorId: async () => null, createSpellInstanceId: async () => "instance",
    getStaticZoneItems: async () => [], buildStaticZoneItems: () => [],
  });
  assert.equal(plan.valid !== false, true, JSON.stringify(plan.errors));
  return { command, plan };
}

test("the command pairs each box with the type of its part, from the rules, and the damage is their sum", async () => {
  const { command } = await planOf();
  assert.deepEqual(command.hp.parts, [{ type: "fire", amount: 13 }, { type: "radiant", amount: 15 }]);
  assert.equal(command.hp.amount, 28);
  const wave = await planOf({ spellId: "phb2014-onda-distruttiva", variant: "necrotic", hpValues: { damage: 17, secondDamage: 19 } });
  assert.deepEqual(wave.command.hp.parts, [{ type: "thunder", amount: 17 }, { type: "necrotic", amount: 19 }]);
  const { contract, session } = panel({ hpValues: { damage: 13 } });
  const missing = buildSpellUnifiedAreaCommand({ contract, session, source: { kind: "cast", sceneEpoch: 3 }, sceneEpoch: 3, currentSceneEpoch: 3 });
  assert.equal(missing.valid, false, "a box left empty stops the cast");
});

test("the commit writes what the preview showed, one damage for each creature, and the log says each defense", async () => {
  const { plan } = await planOf();
  const entry = (id) => plan.entries.find((candidate) => candidate.item.id === id).change;
  assert.equal(entry("goblin").afterHP, 40 - 21);
  assert.equal(entry("goblin").requested, 21, "one damage: one concentration save, one death save failure");
  assert.equal(entry("goblin").factor, "full", "the factor stays the outcome's");
  assert.equal(entry("sera").afterHP, 40 - 20);
  assert.equal(entry("sera").factor, "half");
  assert.equal(entry("mira").afterHP, 40 - 28);
  const defensesOf = (id) => spellAreaCausality(plan).targets.find((target) => target.id === id).defenses;
  assert.deepEqual(defensesOf("goblin"), [{ type: "fire", defense: "resistance" }]);
  assert.deepEqual(defensesOf("sera"), [{ type: "radiant", defense: "vulnerability" }]);
  assert.equal(defensesOf("mira"), undefined);
  const ignored = await planOf({ ignoredDefenses: { goblin: ["fire"] } });
  assert.equal(ignored.plan.entries.find((candidate) => candidate.item.id === "goblin").change.afterHP, 12);
  assert.deepEqual(spellAreaCausality(ignored.plan).targets.find((target) => target.id === "goblin").defenses,
    [{ type: "fire", defense: "resistance", ignored: true }]);
});

test("Destructive Wave's choice is a damage type: its own label, and changing it keeps the area, the targets and the boxes", async () => {
  const { readFileSync } = await import("node:fs");
  const wave = buildSpellUnifiedPanelContract({ spellId: "phb2014-onda-distruttiva", phase: "cast", castContext: { slotLevel: 5 } });
  assert.equal(wave.presentation.variant.label, "Tipo di danno");
  assert.equal(wave.presentation.variant.damageTypeOnly, true);
  const rock = buildSpellUnifiedPanelContract({ spellId: "xanathar-trasmutare-roccia", phase: "cast", castContext: { slotLevel: 5 } });
  assert.equal(rock.presentation.variant.damageTypeOnly, undefined, "a variant that changes the area still starts over");
  assert.equal(rock.presentation.variant.label, "Modalità");
  const source = readFileSync(new URL("../src/spell-unified-panel.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(source, /if \(nextContract\?\.presentation\?\.variant\?\.damageTypeOnly === true\) \{\n {8}state\.session = updateSpellPanelSession\(state\.session, \{ variant \}\);/u);
});

test("Destructive Wave keeps its prone on a failed save, with either choice", () => {
  for (const choice of ["radiant", "necrotic"]) {
    const automation = getAreaSaveAutomation("phb2014-onda-distruttiva", choice);
    assert.ok((automation?.failed || []).some((rule) => rule.condition === "Prono"), choice);
  }
});
