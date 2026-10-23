// Species traits with a save or a condition: Daunting Roar, Taunt and Unsettling Presence put their pill on the
// creatures the GM selects (as Conquering Presence); Acid Spit and the metallic breath are resolved in the attack
// console, like the breath (one creature without damage on a success; a cone that puts a condition on a failure).
import assert from "node:assert/strict";
import test from "node:test";
import { SPECIES_FEATURES, speciesHasSpellAbilityChoice } from "../src/speciesTraitCore.js";
import { speciesTraitSave } from "../src/speciesInnateSpellCore.js";
import { classFeatureConditionInstancesForActivation } from "../src/classFeatureCore.js";
import { buildPcAttackAreaMutation, pcAttackAreaPreview, pcAttackBreathAction, pcAttackBreathActionsForCard, pcAttackResolvedAction,
  pcAttackOutcomesFor } from "../src/pcAttackCore.js";
import { pcAttackBreathActionId, pcAttackBreathFeatureId, pcAttackBreathVariant } from "../src/pcAttackBreathId.js";
import { CLASS_FEATURE_STATE_FIELD } from "../src/classFeatureCore.js";
import { buildCombatLogPresentation } from "../src/combatLogPresentationCore.js";

const META = "com.thebigpicture.initiative/meta";
const feature = (id) => SPECIES_FEATURES.find((entry) => entry.id === id);
const creature = (id, name, meta = {}) => ({ id, name, type: "IMAGE", layer: "CHARACTER", metadata: { [META]: { hp: 30, hpMax: 30, inInitiative: true, ...meta } } });
const card = (species, level = 5, mods = {}) => ({ characterBuild: [{ classId: "guerriero", level }],
  abilityModifiers: { str: 3, dex: 1, con: 2, int: 0, wis: 1, cha: 2, ...mods }, species, quickActions: [] });
const logLines = (result) => buildCombatLogPresentation(null, [{ category: "attack", payload: result.options.history.payload }]).events[0]
  .details.flatMap((section) => section.lines);
const SPIT = "specie-ibrido-simic-potenziamento-sputo-acido";
const METALLIC = "specie-dragonide-metallico-arma-a-soffio-metallica-oro";

test("Daunting Roar, Taunt and Unsettling Presence: a pill on the creatures selected, ending with the source's turn", () => {
  const roar = feature("specie-leonin-ruggito-intimidatorio");
  assert.deepEqual([roar.runtimeSupport.adapter, roar.targetMode, roar.targeting.rangeMeters, roar.targeting.maxTargets, roar.targeting.excludeSource],
    ["condition", "selection", 3, null, true]);
  const [pill] = classFeatureConditionInstancesForActivation(roar, { instanceId: "i1", sourceId: "leo", targetIds: ["leo", "orc"], startedRound: 2 }, "Leo");
  assert.equal(pill.targetId, "orc", "never the leonin itself");
  assert.equal(pill.condition, "Spaventato");
  assert.deepEqual(pill.expiry, { mode: "turn-end", actor: "source", actorId: "leo", remaining: 1, anchor: "next-turn" });
  const taunt = feature("specie-kender-provocazione");
  const [provoked] = classFeatureConditionInstancesForActivation(taunt, { instanceId: "i2", sourceId: "kip", targetIds: ["orc"], startedRound: 2 }, "Kip");
  assert.equal(provoked.condition, "Provocato");
  assert.deepEqual(provoked.expiry, { mode: "turn-start", actor: "source", actorId: "kip", remaining: 1, anchor: "next-turn" });
  assert.equal(taunt.targeting.maxTargets, 1);
  const presence = feature("dono-hollow-one-presenza-inquietante");
  const [unsettled] = classFeatureConditionInstancesForActivation(presence, { instanceId: "i3", sourceId: "ho", targetIds: ["orc"], startedRound: 2,
    expiresRound: 11 }, "Ho");
  assert.equal(unsettled.condition, "Turbato");
  assert.equal(presence.speciesSave, undefined, "no save: the GM picks the creature");
});

test("the save's DC: 8 + proficiency + the trait's ability; the kender's is chosen like the innate spells'", () => {
  assert.equal(speciesTraitSave(feature("specie-leonin-ruggito-intimidatorio"), card({ id: "leonin" })).label, "TS Saggezza CD 13 (Costituzione)");
  const kender = card({ id: "kender" }, 5, { int: 1, wis: 3, cha: 2 });
  assert.equal(speciesTraitSave(feature("specie-kender-provocazione"), kender).dc, 14, "Wis +3, the highest");
  assert.equal(speciesTraitSave(feature("specie-kender-provocazione"), { ...kender, speciesSpellAbility: "cha" }).dc, 13);
  assert.equal(speciesHasSpellAbilityChoice("kender"), true);
});

test("Acid Spit: one creature, Dexterity save, no damage on a success, the use spent", () => {
  const simic = card({ id: "ibrido-simic", ancestryId: "planata-sputo" });
  const action = pcAttackBreathAction(simic, pcAttackBreathActionId(SPIT));
  assert.equal(action.components[0].formula, "2d10");
  assert.equal(pcAttackBreathAction(card({ id: "ibrido-simic", ancestryId: "planata-sputo" }, 11), pcAttackBreathActionId(SPIT)).components[0].formula, "3d10");
  const attack = pcAttackResolvedAction(action);
  assert.deepEqual([attack.save, attack.saveHalf, attack.area], ["dex", false, { manual: true, shape: "target", maxTargets: 1, rangeFeet: 30 }]);
  const source = creature("vorel", "Vorel", { initiativeCard: simic });
  const two = pcAttackAreaPreview({ action, sourceItem: source, members: [{ item: creature("a", "A"), outcome: "failed" }, { item: creature("b", "B"), outcome: "failed" }],
    amounts: { c1: "9" } });
  assert.match(two.blocker, /un solo bersaglio/);
  const passed = buildPcAttackAreaMutation({ action, sourceItem: source, members: [{ item: creature("a", "A"), outcome: "passed" }], componentAmounts: { c1: 9 },
    attackInstanceId: "spit-1" });
  assert.equal(passed.rows[0].change.requested, 0, "nothing on a success");
  const hit = buildPcAttackAreaMutation({ action, sourceItem: source, members: [{ item: creature("a", "A"), outcome: "failed" }], componentAmounts: { c1: 9 },
    attackInstanceId: "spit-2" });
  assert.equal(hit.rows[0].change.afterHP, 21);
  assert.equal(hit.options.metadataPatches[0].fields[CLASS_FEATURE_STATE_FIELD].value.resources["specie-ibrido-simic-sputo-acido-usi"].current, 1,
    "Con +2: two uses, one left");
  const lines = logLines(hit);
  assert.ok(lines.some((line) => /^Soffio: Sputo acido \(2d10 acido\) · TS Destrezza CD 13, niente se superato/.test(line)), lines.join(" | "));
  assert.ok(lines.includes("Area: 1 creatura come bersaglio"), lines.join(" | "));
});

test("the metallic breath: one action per option, a cone without damage, the condition on the creatures that fail", () => {
  const gold = card({ id: "dragonide-metallico", ancestryId: "oro" });
  assert.deepEqual(pcAttackBreathActionsForCard(gold).map((entry) => entry.label),
    ["Arma a soffio (fuoco)", "Arma a soffio metallica: Soffio debilitante", "Arma a soffio metallica: Soffio repulsivo"]);
  assert.equal(pcAttackBreathActionsForCard(card({ id: "dragonide-metallico", ancestryId: "oro" }, 4)).length, 1, "from 5th level");
  assert.equal(pcAttackBreathAction(gold, pcAttackBreathActionId(METALLIC)).id, pcAttackBreathActionId(METALLIC, "debilitante"), "the first option by default");
  assert.equal(pcAttackBreathFeatureId(pcAttackBreathActionId(METALLIC, "repulsivo")), METALLIC);
  assert.equal(pcAttackBreathVariant(pcAttackBreathActionId(METALLIC, "repulsivo")), "repulsivo");
  const enervating = pcAttackBreathAction(gold, pcAttackBreathActionId(METALLIC, "debilitante"));
  assert.deepEqual(enervating.components, []);
  const attack = pcAttackResolvedAction(enervating);
  assert.equal(attack.save, "con");
  assert.deepEqual(pcAttackOutcomesFor(attack), ["failed", "passed"]);
  const source = creature("aur", "Aurum", { initiativeCard: gold });
  const members = [{ item: creature("orc", "Orco"), outcome: "failed" }, { item: creature("gob", "Goblin"), outcome: "passed" }];
  const preview = pcAttackAreaPreview({ action: enervating, sourceItem: source, members });
  assert.equal(preview.ready, true, preview.blocker);
  const result = buildPcAttackAreaMutation({ action: enervating, sourceItem: source, members, attackInstanceId: "metal-1",
    turnState: { round: 3, current: 0, order: ["aur"], turnKey: "3:aur" } });
  assert.deepEqual(result.operations.map((operation) => operation.type), ["condition:add"], "no HP write, one condition");
  const [condition] = result.operations;
  assert.deepEqual([condition.targetIds, condition.conditionName], [["orc"], "Incapacitato"]);
  assert.deepEqual(condition.options.expiry, { mode: "turn-start", actor: "source", remaining: 1, anchor: "next-turn", actorId: "aur" });
  assert.deepEqual(result.labelTargetIds, ["orc"]);
  assert.equal(result.options.metadataPatches[0].fields[CLASS_FEATURE_STATE_FIELD].value.resources["specie-dragonide-metallico-arma-a-soffio-metallica-usi"].current, 0);
  assert.ok(logLines(result).includes("Soffio: Arma a soffio metallica: Soffio debilitante · TS Costituzione CD 13, Incapacitato se fallito · Arma a soffio metallica 1 → 0"),
    logLines(result).join(" | "));
  const repulsion = buildPcAttackAreaMutation({ action: pcAttackBreathAction(gold, pcAttackBreathActionId(METALLIC, "repulsivo")), sourceItem: source,
    members: [{ item: creature("orc", "Orco"), outcome: "failed" }], attackInstanceId: "metal-2" });
  assert.deepEqual([repulsion.operations[0].conditionName, repulsion.operations[0].options.expiry], ["Prono", { mode: "manual" }]);
  assert.ok(logLines(repulsion).includes("Da fare: Spinto di 6 m lontano dal dragonide: sposta il token a mano."));
});
