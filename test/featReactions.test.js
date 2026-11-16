// Lot F6-1 of docs/STUDIO_TALENTI.md: the feats' reactions through the flows that exist. Defensive Duelist adds the
// proficiency bonus to the AC against a melee hit (as Arcane Deflection); Second Chance makes the attacker reroll (as
// Runic Shield, with its use); Fade Away, after a damage, puts the Invisible pill on the gnome (as Hidden Step, ended by
// an attack). The expectations are read from the 2014 texts (PHB, Xanathar), not from the definitions under test.
import test, { mock } from "node:test";
import assert from "node:assert/strict";

mock.module("@owlbear-rodeo/sdk", {
  exports: {
    default: { onReady() {}, scene: { items: { getItems: async () => [] } } },
    buildPath: () => ({}), buildLabel: () => ({}), buildImage: () => ({}), buildText: () => ({}), buildShape: () => ({}),
    Command: { MOVE: 0, LINE: 1, CUBIC: 2, CLOSE: 3 },
  },
});

const { reactionTriggerEntry } = await import("../src/reactionTriggerCatalog.js");
const { REACTION_PROMPT_LOTS, reactionPromptCandidates, reactionPromptEffectText } = await import("../src/reactionPromptView.js");
const { useReactionFeature } = await import("../src/reactionFeatureRuntime.js");
const { CLASS_FEATURE_RESOURCE_POOL_BY_ID, getClassFeatureDefinition } = await import("../src/classFeatureCatalog.js");
const { classFeatureConditionInstancesForActivation } = await import("../src/classFeatureCore.js");
const { pcAttackLinkEnds } = await import("../src/pcAttackCore.js");
const { FEATS } = await import("../src/featCatalog.js");

const META = "com.thebigpicture.initiative/meta";
// A 5th-level character (proficiency +3) with the feats, its class features left off so that only the feats react.
const character = (id, name, feats, { resources = null, armorClass = 15 } = {}) => ({ id, name, layer: "CHARACTER", metadata: { [META]: {
  hp: 30, hpMax: 30, attitude: "pc",
  initiativeCard: { armorClass, characterBuild: [{ classId: "ladro", level: 5 }], classFeaturesConfigured: true, enabledClassFeatureIds: [], feats },
  ...(resources ? { classFeatureState: { resources } } : {}) } } });
const orc = { id: "orc", name: "Orco", layer: "CHARACTER", metadata: { [META]: { hp: 15, hpMax: 15, attitude: "enemy" } } };
const combat = (...ids) => ({ round: 2, current: 0, order: ["orc", ...ids] });
const attack = (targetId, extra = {}) => ({ attackerId: "orc", targetIds: [targetId], range: "melee", attackRoll: true, damageTypes: ["slashing"], ...extra });
// What the attack console sends on a hit: the hit, then its damage.
const hitEvents = (targetId, extra) => [{ ...attack(targetId, extra), trigger: "hit" }, { ...attack(targetId, extra), trigger: "damage" }];
const offered = (items, phase, extra) => reactionPromptCandidates({ event: hitEvents("pc", extra), items, state: combat("pc") }, phase);

test("the three feats are wired: their records use the reaction and the prompt shows them", () => {
  assert.ok(REACTION_PROMPT_LOTS.includes("F6"));
  for (const [id, featureId] of [["defensive-duelist", "talento-duellante-difensivo"], ["second-chance", "talento-seconda-possibilita"],
    ["fade-away", "talento-scomparire-invisibile"]]) {
    assert.deepEqual(reactionTriggerEntry(id).featureIds, [featureId], id);
    assert.equal(getClassFeatureDefinition(featureId).activation.primary, "reazione", featureId);
  }
});

test("Defensive Duelist: a melee hit with a roll, + proficiency to the AC and the rolls that become a miss", () => {
  const duelist = character("pc", "Mira", [{ id: "duellante-difensivo" }]);
  const [row, ...rest] = offered([orc, duelist], "before");
  assert.deepEqual([row.reactionId, row.flow, row.featureId, rest.length], ["defensive-duelist", "use-feature", "talento-duellante-difensivo", 0]);
  assert.equal(reactionPromptEffectText(row, [orc, duelist]), "+ competenza alla CA · CA 15 → 18: un tiro da 15 a 17 diventa Mancato");
  assert.deepEqual(offered([orc, duelist], "before", { range: "ranged" }), [], "not at range");
  assert.deepEqual(offered([orc, duelist], "before", { attackRoll: false }), [], "not on a save");
  // A 13th-level duelist: +5.
  const veteran = character("pc", "Mira", [{ id: "duellante-difensivo" }]);
  veteran.metadata[META].initiativeCard.characterBuild = [{ classId: "ladro", level: 13 }];
  assert.match(reactionPromptEffectText(offered([orc, veteran], "before")[0], [orc, veteran]), /CA 15 → 20/u);
  assert.deepEqual(offered([orc, character("pc", "Mira", [])], "before"), [], "without the feat, nothing");
});

test("Second Chance: the attacker rerolls, while its use is left; Usa spends it with the reaction", async () => {
  const halfling = character("pc", "Pip", [{ id: "seconda-possibilita" }]);
  const [row] = offered([orc, halfling], "before", { range: "ranged" });
  assert.deepEqual([row.reactionId, row.flow, row.featureId], ["second-chance", "use-feature", "talento-seconda-possibilita"]);
  assert.equal(reactionPromptEffectText(row, [orc, halfling]), "L'attaccante ritira il d20: segna l'esito del nuovo tiro");
  const spent = character("pc", "Pip", [{ id: "seconda-possibilita" }], { resources: { "talento-seconda-possibilita-uso-usi": { current: 0 } } });
  assert.deepEqual(offered([orc, spent], "before"), [], "its use spent");
  // One use, back with a short or a long rest.
  const pool = CLASS_FEATURE_RESOURCE_POOL_BY_ID.get("talento-seconda-possibilita-uso-usi");
  assert.deepEqual([pool.capacity, pool.refresh.map((entry) => entry.event)], [{ type: "fixed", value: 1 }, ["riposo_breve", "riposo_lungo"]]);
  const calls = [];
  const runtime = { adjustClassFeatureResource: async (...args) => { calls.push(args); } };
  assert.equal((await useReactionFeature({ sourceId: "pc", featureId: row.featureId, runtime })).ok, true);
  assert.deepEqual(calls, [["pc", "talento-seconda-possibilita-uso-usi", { delta: -1 }, { featureId: "talento-seconda-possibilita" }]]);
});

test("Fade Away: after a damage, its part puts the Invisible pill on the gnome until the end of its next turn", () => {
  const gnome = character("pc", "Nim", [{ id: "scomparire", ability: "int" }]);
  assert.deepEqual(offered([orc, gnome], "before"), [], "not before the damage");
  const [row, ...rest] = offered([orc, gnome], "after");
  assert.deepEqual([row.reactionId, row.flow, row.featureId, row.protectedId, rest.length],
    ["fade-away", "activate-feature", "talento-scomparire-invisibile", "pc", 0]);
  const part = getClassFeatureDefinition("talento-scomparire-invisibile");
  assert.deepEqual([part.targetMode, part.endsOnAttack, part.resourceCosts], ["self", true, [{ poolId: "talento-scomparire-uso-usi", amount: 1 }]]);
  const [pill] = classFeatureConditionInstancesForActivation(part, { instanceId: "i1", sourceId: "pc", targetIds: ["pc"], startedRound: 2 }, "Nim");
  assert.deepEqual([pill.targetId, pill.condition, pill.displayLabel, pill.expiry.mode, pill.expiry.anchor],
    ["pc", "Invisibile", "Invisibile · Scomparire", "turn-end", "next-turn"]);
  // The feat's card has no use of its own: its part spends the pool, back with a short or a long rest.
  assert.deepEqual(getClassFeatureDefinition("talento-scomparire").resourceCosts, []);
  assert.deepEqual(CLASS_FEATURE_RESOURCE_POOL_BY_ID.get("talento-scomparire-uso-usi").refresh.map((entry) => entry.event), ["riposo_breve", "riposo_lungo"]);
  const spent = character("pc", "Nim", [{ id: "scomparire" }], { resources: { "talento-scomparire-uso-usi": { current: 0 } } });
  assert.deepEqual(offered([orc, spent], "after"), [], "its use spent");
});

test("Fade Away's pill ends when the gnome attacks from the console, as Hidden Step's", () => {
  const gnome = character("pc", "Nim", [{ id: "scomparire" }]);
  gnome.metadata[META].conditions = { version: 2, instances: [
    { id: "pill-1", condition: "Invisibile", effectId: "talento-scomparire-invisibile", type: "class-feature", active: true, sourceId: "pc" },
    { id: "pill-2", condition: "Invisibile", effectId: "other-effect", active: true }] };
  assert.deepEqual(pcAttackLinkEnds({ sourceItem: gnome, targetItem: orc }).map((end) => [end.instanceId, end.featureId]),
    [["pill-1", "talento-scomparire-invisibile"]]);
});

test("the three feats' lines say what the prompt does", () => {
  const line = (id) => FEATS.find((entry) => entry.id === id).plugin;
  assert.match(line("duellante-difensivo"), /^Avviso di reazione quando è colpito in mischia: \+ bonus di competenza alla CA/u);
  assert.match(line("seconda-possibilita"), /l'attaccante ritira il d20\. Un uso, di nuovo col riposo breve o lungo; all'iniziativa lo rimette il GM con ↺\.$/u);
  assert.match(line("scomparire"), /^Avviso di reazione dopo un danno: Usa lo rende invisibile fino alla fine del suo prossimo turno/u);
});
