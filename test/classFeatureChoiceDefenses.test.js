// Class features whose damage type is chosen at activation (L4 of the class features' defenses, 06/11): Elemental Affinity,
// Fiendish Resilience and the Transmuter's Stone are pills whose variant is the type; the defense is read from the catalog.
import assert from "node:assert/strict";
import test, { mock } from "node:test";

mock.module("@owlbear-rodeo/sdk", { exports: { default: { onReady() {} }, buildLabel() {}, buildImage() {}, buildText() {}, buildPath() {}, buildShape() {}, Command: class {} } });
const { CLASS_FEATURE_BY_ID, CLASS_FEATURE_RESOURCE_POOL_BY_ID } = await import("../src/classFeatureCatalog.js");
const { classFeatureChoiceOptions, classFeatureConditionInstancesForActivation, planClassFeatureActivation } =
  await import("../src/classFeatureCore.js");
const { damageDefensesForItem } = await import("../src/damageDefensesCore.js");
const { bossDefendedDamage } = await import("../src/bossActionsViewCore.js");
const { effectSummaryPartsFor } = await import("../src/effectLabelCore.js");

const META = "com.thebigpicture.initiative/meta";
const AFFINITY = "stregone-discendenza-draconica-affinita-elementale";
const RESILIENCE = "warlock-l-immondo-resilienza-immonda";
const STONE = "mago-scuola-di-trasmutazione-pietra-del-trasmutatore";
const ALL = ["acid", "bludgeoning", "cold", "fire", "force", "lightning", "necrotic", "piercing", "poison", "psychic", "radiant", "slashing", "thunder"];
const CASES = [
  [AFFINITY, [{ classId: "stregone", level: 6, subclassId: "stregone-discendenza-draconica" }], ["acid", "cold", "fire", "lightning", "poison"]],
  [RESILIENCE, [{ classId: "warlock", level: 10, subclassId: "warlock-l-immondo" }], ALL],
  [STONE, [{ classId: "mago", level: 6, subclassId: "mago-scuola-di-trasmutazione" }], ["acid", "cold", "fire", "lightning", "thunder"]],
];

const creature = (id, instances = []) => ({ id, name: id, type: "IMAGE", layer: "CHARACTER",
  metadata: { [META]: { hp: 40, hpMax: 40, inInitiative: true, conditions: { version: 2, instances } } } });
const pillsOf = (featureId, build, choiceId, targetIds = ["hero"]) => classFeatureConditionInstancesForActivation(
  CLASS_FEATURE_BY_ID.get(featureId),
  { instanceId: `${featureId}-1`, sourceId: "hero", targetIds, startedRound: 1, choiceId },
  "hero",
  build,
);

test("each type is a variant of the pill, and the chosen one is the defense", () => {
  for (const [featureId, build, types] of CASES) {
    const feature = CLASS_FEATURE_BY_ID.get(featureId);
    assert.equal(feature.runtimeSupport.status, "implemented", featureId);
    assert.deepEqual(classFeatureChoiceOptions(feature).map((option) => option.id), types, featureId);
    for (const type of types) {
      const [pill] = pillsOf(featureId, build, type);
      assert.equal(pill.choiceId, type);
      assert.equal(pill.mechanics?.damageDefenses, undefined, `${featureId}/${type}: the pill carries no defense`);
      assert.match(pill.displayLabel, new RegExp(`^${feature.name} · `, "u"));
      assert.ok(!effectSummaryPartsFor(pill).some((part) => /^(Res|Imm|Vuln)\./u.test(part.label)), `${featureId}/${type}: no micropill`);
      assert.deepEqual(damageDefensesForItem(creature("hero", [pill]), META).resistances, [type], `${featureId}/${type}`);
    }
  }
  const [fire] = pillsOf(RESILIENCE, CASES[1][1], "fire");
  assert.equal(fire.displayLabel, "Resilienza Immonda · Fuoco");
  assert.equal(bossDefendedDamage([{ id: "c1", type: "fire" }], { c1: 18 }, "hit", damageDefensesForItem(creature("hero", [fire]), META)), 9);
});

test("Elemental Affinity costs a sorcery point and lasts an hour; Fiendish Resilience stays until the GM ends it", () => {
  const activate = (featureId, build, choiceId) => {
    const feature = CLASS_FEATURE_BY_ID.get(featureId);
    const plan = planClassFeatureActivation({ state: null, feature, poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID, characterBuild: build,
      sourceId: "hero", targetIds: ["hero"], currentRound: 1, currentTurnKey: "1:hero", instanceId: `${featureId}-1`, choiceId });
    assert.equal(plan.ok, true, `${featureId}: ${plan.reason || ""}`);
    return { plan, pill: classFeatureConditionInstancesForActivation(feature, plan.instance, "hero", build)[0] };
  };
  const affinity = activate(AFFINITY, CASES[0][1], "fire");
  const points = affinity.plan.state.resources["stregone-punti-stregoneria"];
  assert.equal(points.current, points.maximum - 1);
  assert.deepEqual(affinity.pill.expiry, { mode: "rounds", remaining: 600 });
  const resilience = activate(RESILIENCE, CASES[1][1], "cold");
  assert.deepEqual(resilience.pill.expiry, { mode: "manual" });
  assert.match(resilience.pill.effectDetail, /armi magiche o d'argento la superano/u);
});

test("the Transmuter's Stone goes on its bearer, not on the wizard", () => {
  const [pill] = pillsOf(STONE, CASES[2][1], "thunder", ["ally"]);
  assert.equal(pill.targetId, "ally");
  assert.deepEqual(damageDefensesForItem(creature("ally", [pill]), META).resistances, ["thunder"]);
  assert.deepEqual(damageDefensesForItem(creature("hero"), META).resistances, []);
});
