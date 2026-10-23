// A dragonborn's breath weapon in the PC attack console: an action built from the species trait, an area picked by
// hand, a save that halves, the targets' defenses, the trait's use spent with the damage.
import assert from "node:assert/strict";
import test from "node:test";
import { buildPcAttackAreaMutation, pcAttackAreaPreview, pcAttackBreathAction, pcAttackBreathActionsForCard, pcAttackBreathInfo,
  pcAttackModeOptions, pcAttackResolvedAction, pcAttackRiderOptions, pcAttackOutcomesFor } from "../src/pcAttackCore.js";
import { pcAttackBreathActionId } from "../src/pcAttackBreathId.js";
import { CLASS_FEATURE_STATE_FIELD } from "../src/classFeatureCore.js";
import { buildCombatLogPresentation } from "../src/combatLogPresentationCore.js";

const META = "com.thebigpicture.initiative/meta";
const RED = "specie-dragonide-arma-a-soffio-rosso";
const POOL = "specie-dragonide-arma-a-soffio-usi";
const creature = (id, name, meta = {}) => ({ id, name, type: "IMAGE", layer: "CHARACTER", metadata: { [META]: { hp: 20, hpMax: 20, inInitiative: true, ...meta } } });
const dragonbornCard = (level = 6, species = { id: "dragonide", ancestryId: "rosso" }) => ({
  characterBuild: [{ classId: "paladino", level }], abilityModifiers: { str: 3, dex: 0, con: 2, int: 0, wis: 1, cha: 2 }, species, quickActions: [] });
const kriv = (level = 6, meta = {}) => creature("kriv", "Kriv", { initiativeCard: dragonbornCard(level), ...meta });
const tiefling = () => creature("zar", "Zar", { initiativeCard: { species: { id: "tiefling" } } });
const orc = () => creature("orc", "Orco", { hp: 15, hpMax: 15 });
const breath = (card = dragonbornCard()) => pcAttackBreathAction(card, pcAttackBreathActionId(RED));
const logLines = (result) => buildCombatLogPresentation(null, [{ category: "attack", payload: result.options.history.payload }]).events[0]
  .details.flatMap((section) => section.lines);

test("the breath action is built from the enabled species trait, with its dice at the character's level", () => {
  const action = breath();
  assert.deepEqual(action, { version: 2, id: "breath:specie-dragonide-arma-a-soffio-rosso", label: "Arma a soffio (fuoco)", kind: "attack",
    targetMode: "selection", range: "ranged", source: { kind: "breath", featureId: RED }, components: [{ id: "c1", type: "fire", formula: "3d6" }] });
  assert.equal(breath(dragonbornCard(5)).components[0].formula, "2d6");
  assert.equal(breath(dragonbornCard(16)).components[0].formula, "5d6");
  assert.equal(pcAttackBreathAction({ species: { id: "elfo", ancestryId: "alto" } }, pcAttackBreathActionId(RED)), null, "not this card's trait");
  assert.equal(pcAttackBreathAction(dragonbornCard(6, { id: "dragonide", ancestryId: "blu" }), pcAttackBreathActionId(RED)), null, "another ancestry");
  const fizban = dragonbornCard(5, { id: "dragonide-cromatico", ancestryId: "bianco" });
  assert.deepEqual(pcAttackBreathActionsForCard(fizban).map((entry) => [entry.label, entry.components[0].formula]), [["Arma a soffio (freddo)", "2d10"]]);
});

test("resolved: a Dexterity save that halves, a 4.5 m cone picked by hand, DC 8 + Constitution + proficiency", () => {
  const attack = pcAttackResolvedAction(breath());
  assert.deepEqual([attack.save, attack.saveHalf, attack.area], ["dex", true, { manual: true, shape: "cone", lengthFeet: 15 }]);
  assert.deepEqual(pcAttackOutcomesFor(attack), ["failed", "passed"]);
  assert.deepEqual(pcAttackBreathInfo(attack, dragonbornCard()), { name: "Arma a soffio (fuoco)", dice: "3d6", damageType: "fire", shape: "cone", dc: 13, save: "dex" });
  const line = pcAttackResolvedAction(pcAttackBreathAction(dragonbornCard(6, { id: "dragonide", ancestryId: "nero" }), pcAttackBreathActionId("specie-dragonide-arma-a-soffio-nero")));
  assert.deepEqual(line.area, { manual: true, shape: "line", lengthFeet: 30, widthFeet: 5 });
  assert.deepEqual(pcAttackModeOptions({ action: breath(), sourceItem: kriv() }), [], "no arrow modes on a breath");
  assert.deepEqual(pcAttackRiderOptions({ action: breath(), sourceItem: kriv() }), [], "no riders: they ride on hits");
});

test("one damage roll: full on a failed save, half on a success, the targets' resistances, the breath's use spent", () => {
  const result = buildPcAttackAreaMutation({ action: breath(), sourceItem: kriv(),
    members: [{ item: tiefling(), outcome: "failed" }, { item: orc(), outcome: "passed" }], componentAmounts: { c1: 12 },
    attackInstanceId: "breath-1", expectedDefenses: {}, turnState: null });
  assert.deepEqual(result.rows.map((row) => [row.item.id, row.factor, row.change.requested, row.change.afterHP]), [["zar", "full", 6, 14], ["orc", "half", 6, 9]],
    "the tiefling resists fire: 12 → 6; the orc saves: 12 → 6");
  const patch = result.options.metadataPatches[0].fields;
  assert.equal(patch[CLASS_FEATURE_STATE_FIELD].value.resources[POOL].current, 0);
  assert.equal(result.causality.attack.source, "breath");
  assert.deepEqual(result.causality.breath.spent, [{ poolId: POOL, name: "Arma a soffio", amount: 1, before: 1, after: 0 }]);
  assert.deepEqual(result.causality.save, { ability: "dex", dc: 13 });
  assert.equal(result.options.label, "Kriv: Arma a soffio (fuoco) → 2 creature");
  const lines = logLines(result);
  assert.ok(lines.includes("Soffio: Arma a soffio (fuoco) (3d6 fuoco) · TS Destrezza CD 13, metà se superato · Arma a soffio 1 → 0"), lines.join(" | "));
  assert.ok(lines.includes("Area: 2 creature nel cono"), lines.join(" | "));
});

test("a breath without uses left is blocked in the preview and refused at the commit", () => {
  const spent = kriv(6, { [CLASS_FEATURE_STATE_FIELD]: { version: 1, resources: { [POOL]: { current: 0 } }, instances: [] } });
  const preview = pcAttackAreaPreview({ action: breath(), sourceItem: spent, members: [{ item: orc(), outcome: "failed" }], amounts: { c1: "7" } });
  assert.equal(preview.blocker, "Arma a soffio (fuoco): nessun uso rimasto.");
  assert.throws(() => buildPcAttackAreaMutation({ action: breath(), sourceItem: spent, members: [{ item: orc(), outcome: "failed" }],
    componentAmounts: { c1: 7 }, attackInstanceId: "breath-2" }), /nessun uso rimasto/);
  const ready = pcAttackAreaPreview({ action: breath(), sourceItem: kriv(), members: [{ item: orc(), outcome: "failed" }], amounts: { c1: "7" } });
  assert.equal(ready.ready, true, ready.blocker);
});
