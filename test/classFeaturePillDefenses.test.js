// Class features' damage defenses while their pill is active (L1 of the class features' defenses, 06/11). The pill stays
// as it is: no defense in its metadata, no micropill; the defense is read from the catalog by every reader.
import assert from "node:assert/strict";
import test, { mock } from "node:test";

mock.module("@owlbear-rodeo/sdk", { exports: { default: { onReady() {} }, buildLabel() {}, buildImage() {}, buildText() {}, buildPath() {}, buildShape() {}, Command: class {} } });
const { CLASS_FEATURES, CLASS_FEATURE_BY_ID, getEnabledClassFeatures } = await import("../src/classFeatureCatalog.js");
const { classFeatureConditionInstancesForActivation } = await import("../src/classFeatureCore.js");
const { CLASS_FEATURE_AREA_EFFECT_TYPE, classFeatureAuraEffectId, collectActiveClassFeatureAuras, classFeatureAuraMembershipPlan } =
  await import("../src/classFeatureAuraCore.js");
const { classFeaturePillDamageDefenses, damageDefenseCount, damageDefensesForItem, sanitizeDamageDefenses } =
  await import("../src/damageDefensesCore.js");
const { bossDefendedDamage, bossDefenseCounts } = await import("../src/bossActionsViewCore.js");
const { defendedComponents } = await import("../src/bossActionExecutionCore.js");
const { magicalDamageDefensesForItem } = await import("../src/spellDamageDefenseCore.js");
const { effectSummaryPartsFor } = await import("../src/effectLabelCore.js");

const META = "com.thebigpicture.initiative/meta";
const BPS = ["bludgeoning", "piercing", "slashing"];
const ALL = ["acid", "bludgeoning", "cold", "fire", "force", "lightning", "necrotic", "piercing", "poison", "psychic", "radiant", "slashing", "thunder"];
const allBut = (...types) => ALL.filter((type) => !types.includes(type));
const NONE = { immunities: [], resistances: [], vulnerabilities: [] };

const IRA = "barbaro-ira";
const CORPO_VUOTO = "monaco-corpo-vuoto";
const CONQUISTATORE = "paladino-giuramento-di-conquista-conquistatore-invincibile";
const FORMA_D_OMBRA = "stregone-magia-delle-ombre-forma-d-ombra";
const RUNA_COLLINE = "guerriero-cavaliere-runico-intagliatore-di-rune-runa-delle-colline";
const LEVISTUS = "warlock-suppliche-occulte-tomba-di-levistus";
const TEMPESTA_PROTETTRICE = "barbaro-cammino-dell-araldo-della-tempesta-tempesta-protettrice";
const STORM_HERALD = "barbaro-cammino-dell-araldo-della-tempesta";
const ORSO = "barbaro-cammino-del-combattente-totemico-spirito-totemico-orso";
const TOTEM_WARRIOR = "barbaro-cammino-del-combattente-totemico";
const MANTO = "druido-circolo-delle-stelle-manto-di-stelle";
const FORMA_SIDERALE = "druido-circolo-delle-stelle-forma-siderale";
const STARS = "druido-circolo-delle-stelle";

const creature = (id, card = {}, extra = {}) => ({
  id, name: id, type: "IMAGE", layer: "CHARACTER", position: { x: 0, y: 0 },
  metadata: { [META]: { hp: 40, hpMax: 40, inInitiative: true, initiativeCard: card, ...extra } },
});
const withPills = (item, instances) => ({
  ...item,
  metadata: { ...item.metadata, [META]: { ...item.metadata[META], conditions: { version: 2, instances } } },
});
const pillsOf = (featureId, build, sourceId = "hero") => classFeatureConditionInstancesForActivation(
  CLASS_FEATURE_BY_ID.get(featureId),
  { instanceId: `${featureId}-1`, sourceId, targetIds: [sourceId], startedRound: 1 },
  sourceId,
  build,
);
const hit = (type, amount, defenses) => bossDefendedDamage([{ id: "c1", type }], { c1: amount }, "hit", defenses);

const EXPECTED = new Map([
  [IRA, { resistances: BPS }],
  [CORPO_VUOTO, { resistances: allBut("force") }],
  [CONQUISTATORE, { resistances: ALL }],
  [FORMA_D_OMBRA, { resistances: allBut("radiant", "force") }],
  [RUNA_COLLINE, { resistances: BPS }],
  [LEVISTUS, { vulnerabilities: ["fire"] }],
  [ORSO, { resistances: allBut("psychic") }],
  [MANTO, { resistances: BPS }],
]);
const BUILDS = new Map([
  [IRA, [{ classId: "barbaro", level: 5 }]],
  [CORPO_VUOTO, [{ classId: "monaco", level: 18 }]],
  [CONQUISTATORE, [{ classId: "paladino", level: 20, subclassId: "paladino-giuramento-di-conquista" }]],
  [FORMA_D_OMBRA, [{ classId: "stregone", level: 18, subclassId: "stregone-magia-delle-ombre" }]],
  [RUNA_COLLINE, [{ classId: "guerriero", level: 7, subclassId: "guerriero-cavaliere-runico" }]],
  [LEVISTUS, [{ classId: "warlock", level: 5 }]],
  [ORSO, [{ classId: "barbaro", level: 3, subclassId: TOTEM_WARRIOR }]],
  [MANTO, [{ classId: "druido", level: 14, subclassId: STARS }]],
]);

test("the catalog gives each feature its defense, in the plan and not in the pill's mechanics", () => {
  for (const [featureId, defenses] of EXPECTED) {
    const plan = CLASS_FEATURE_BY_ID.get(featureId)?.effectPlan;
    assert.ok(plan, featureId);
    assert.deepEqual(plan.damageDefenses, defenses, featureId);
    assert.deepEqual(sanitizeDamageDefenses(plan.damageDefenses), sanitizeDamageDefenses(defenses), `${featureId}: known types, in order`);
  }
  const environments = new Map(CLASS_FEATURE_BY_ID.get(TEMPESTA_PROTETTRICE).choiceOptions
    .map((option) => [option.id, option.effectPlan.targetEffect.damageDefenses]));
  assert.deepEqual(Object.fromEntries(environments),
    { deserto: { resistances: ["fire"] }, mare: { resistances: ["lightning"] }, tundra: { resistances: ["cold"] } });
  // No class feature puts a defense where a pill would copy it.
  const plans = (feature) => [feature.effectPlan, ...(feature.choiceOptions || []).map((option) => option.effectPlan)].filter(Boolean);
  const inMechanics = CLASS_FEATURES.filter((feature) => plans(feature).some((plan) => plan.mechanics?.damageDefenses
    || plan.targetEffect?.mechanics?.damageDefenses
    || (plan.secondaryEffects || []).some((effect) => effect?.mechanics?.damageDefenses)));
  assert.deepEqual(inMechanics.map((feature) => feature.id), []);
});

test("the pill is as today: no defense in its metadata, no micropill", () => {
  for (const [featureId, build] of BUILDS) {
    const pills = pillsOf(featureId, build);
    assert.equal(pills.length, 1, featureId);
    assert.equal(pills[0].mechanics?.damageDefenses, undefined, featureId);
    const parts = effectSummaryPartsFor(pills[0]).map((part) => part.label);
    assert.ok(!parts.some((label) => /^(Res|Imm|Vuln)\./u.test(label)), `${featureId}: ${parts.join(", ")}`);
  }
  // Tomb of Levistus keeps its movement, and its text says what to do with the hit that triggers it.
  const [tomb] = pillsOf(LEVISTUS, BUILDS.get(LEVISTUS));
  assert.deepEqual(tomb.mechanics, { movement: { setMeters: 0 } });
  assert.match(tomb.effectDetail, /Se quel danno è da fuoco, per quel colpo ignora la vulnerabilità\.$/u);
  assert.ok(CLASS_FEATURE_BY_ID.get(LEVISTUS).effectPlan.detail.length <= 240, "the pill's text is not cut");
});

test("while the pill is active, every reader counts its defense", () => {
  const defensesOf = (featureId) => damageDefensesForItem(withPills(creature("hero"), pillsOf(featureId, BUILDS.get(featureId))), META);
  const rage = defensesOf(IRA);
  assert.deepEqual(rage, { ...NONE, resistances: BPS });
  assert.equal(hit("slashing", 12, rage), 6);
  assert.equal(hit("fire", 12, rage), 12);
  assert.equal(damageDefenseCount(bossDefenseCounts([{ id: "c1", type: "slashing" }], { c1: 12 }, "hit", rage)[0]), "Res. taglienti: 12 → 6");

  assert.equal(hit("force", 10, defensesOf(CORPO_VUOTO)), 10);
  assert.equal(hit("fire", 10, defensesOf(CORPO_VUOTO)), 5);
  assert.equal(hit("force", 10, defensesOf(CONQUISTATORE)), 5);
  assert.equal(hit("radiant", 10, defensesOf(FORMA_D_OMBRA)), 10);
  assert.equal(hit("necrotic", 10, defensesOf(FORMA_D_OMBRA)), 5);
  assert.equal(hit("piercing", 9, defensesOf(RUNA_COLLINE)), 4);
  assert.equal(hit("fire", 10, defensesOf(LEVISTUS)), 20);
  assert.equal(hit("psychic", 10, defensesOf(ORSO)), 10);
  assert.equal(hit("force", 10, defensesOf(ORSO)), 5);
  assert.equal(hit("slashing", 10, defensesOf(MANTO)), 5);
  assert.equal(hit("radiant", 10, defensesOf(MANTO)), 10);

  // The consoles' commit credits the effect, and the spells' readers (panel, areas, reminders) see it.
  const raging = withPills(creature("hero"), pillsOf(IRA, BUILDS.get(IRA)));
  const [component] = defendedComponents([{ id: "c1", type: "slashing" }], { c1: 12 }, "full", raging, [], rage);
  assert.equal(component.amount, 6);
  assert.equal(component.defenseSource, "effect");
  assert.deepEqual(magicalDamageDefensesForItem(raging, META).resistances, BPS);
});

test("the PC console's preview and commit halve the damage of a raging barbarian", async () => {
  const { buildPcAttackMutation, pcAttackPreview } = await import("../src/pcAttackCore.js");
  const sword = { id: "holy-sword", label: "Spada sacra", kind: "attack", range: "melee",
    components: [{ type: "slashing", formula: "1d8+3" }, { type: "radiant", formula: "2d8" }] };
  const source = { id: "paladin", name: "Aria", type: "IMAGE", layer: "CHARACTER",
    metadata: { [META]: { initiativeCard: { quickActions: [sword] }, hp: 40, hpMax: 40, inInitiative: true } } };
  const raging = withPills(creature("thorg"), pillsOf(IRA, BUILDS.get(IRA), "thorg"));
  const preview = pcAttackPreview({ action: sword, targetItem: raging, outcome: "hit", amounts: { c1: "12", c2: "9" } });
  assert.equal(preview.total, 6 + 9);
  const plan = buildPcAttackMutation({ action: sword, sourceItem: source, targetItem: raging, outcome: "hit",
    componentAmounts: { c1: 12, c2: 9 }, attackInstanceId: "a1", turnState: { round: 1, current: 0, order: ["paladin", "thorg"] } });
  assert.equal(plan.change.afterHP, 40 - 15);
});

test("the totem's effects that last while raging start with the Rage, and Full of Stars with the Starry Form", () => {
  // The Totem Spirit's Bear, Eagle and Wolf (an aura), and the Totemic Attunement's Eagle and Bear (an aura) last while the
  // barbarian rages: they start with it, as Storm Aura does. The Attunement's Wolf is a bonus action, not a state.
  const whileRaging = [ORSO, ...["spirito-totemico-aquila", "spirito-totemico-lupo", "sintonia-totemica-aquila", "sintonia-totemica-orso"]
    .map((id) => `${TOTEM_WARRIOR}-${id}`)];
  for (const spirit of whileRaging) {
    assert.ok(CLASS_FEATURE_BY_ID.get(IRA).autoActivateFeatureIds.includes(spirit), spirit);
    assert.equal(CLASS_FEATURE_BY_ID.get(spirit).duration.untilFeatureId, IRA, spirit);
    assert.equal(CLASS_FEATURE_BY_ID.get(spirit).choiceOptions, undefined, `${spirit}: nothing to choose when it starts`);
  }
  assert.ok(!CLASS_FEATURE_BY_ID.get(IRA).autoActivateFeatureIds.includes(`${TOTEM_WARRIOR}-sintonia-totemica-lupo`));
  assert.deepEqual(CLASS_FEATURE_BY_ID.get(FORMA_SIDERALE).autoActivateFeatureIds, [MANTO]);
  const manto = CLASS_FEATURE_BY_ID.get(MANTO);
  assert.equal(manto.runtimeSupport.status, "implemented");
  assert.equal(manto.duration.untilFeatureId, FORMA_SIDERALE);
  assert.equal(manto.trackingMode, "active");
  // The runtime starts a child only when it is enabled: the Bear once the GM chose it, Full of Stars from the 14th level.
  const enabled = (profile) => getEnabledClassFeatures(profile).map((feature) => feature.id);
  const totem = { characterBuild: [{ classId: "barbaro", level: 3, subclassId: TOTEM_WARRIOR }] };
  assert.ok(!enabled(totem).includes(ORSO));
  assert.ok(enabled({ ...totem, classFeaturesConfigured: true, enabledClassFeatureIds: [IRA, ORSO] }).includes(ORSO));
  assert.ok(!enabled({ characterBuild: [{ classId: "druido", level: 10, subclassId: STARS }] }).includes(MANTO));
  assert.ok(enabled({ characterBuild: [{ classId: "druido", level: 14, subclassId: STARS }] }).includes(MANTO));
});

test("the pill that ends takes its defense with it, and an open console notices", () => {
  const pills = pillsOf(IRA, BUILDS.get(IRA), "thorg");
  const expected = damageDefensesForItem(withPills(creature("thorg"), pills), META);
  const calm = withPills(creature("thorg"), []);
  assert.deepEqual(damageDefensesForItem(calm, META), NONE);
  assert.throws(() => defendedComponents([{ id: "c1", type: "slashing" }], { c1: 12 }, "full", calm, [], expected),
    /Le difese ai danni di thorg sono cambiate: riapri l’azione/u);
  const off = withPills(creature("thorg"), pills.map((pill) => ({ ...pill, active: false })));
  assert.deepEqual(damageDefensesForItem(off, META), NONE);
});

test("Shielding Storm: the creatures chosen in the aura resist the environment's damage, from the real aura", () => {
  const feature = CLASS_FEATURE_BY_ID.get(TEMPESTA_PROTETTRICE);
  const build = [{ classId: "barbaro", level: 10, subclassId: STORM_HERALD }];
  for (const [environment, type] of [["deserto", "fire"], ["mare", "lightning"], ["tundra", "cold"]]) {
    const source = creature("thorg", { characterBuild: build }, {
      attitude: "pc",
      classFeatureState: { version: 1, resources: {}, instances: [
        { instanceId: "tp-1", featureId: feature.id, sourceId: "thorg", targetIds: ["ally"], startedRound: 1, choiceId: environment },
      ] },
    });
    const ally = creature("ally", {}, { attitude: "pc" });
    const [aura] = collectActiveClassFeatureAuras([source, ally], {
      metaKey: META, featureById: CLASS_FEATURE_BY_ID, currentRound: 1, characterBuildBySourceId: new Map([["thorg", build]]),
    });
    assert.ok(aura, environment);
    const plan = classFeatureAuraMembershipPlan({ aura, desiredTargetIds: ["ally"], items: [source, ally], metaKey: META });
    const add = plan.operations.find((operation) => operation.type === "condition:add");
    assert.ok(add, JSON.stringify(plan.operations));
    assert.equal(add.options.mechanics?.damageDefenses, undefined, `${environment}: the member's pill carries no defense`);
    const inside = withPills(ally, [{ id: "m1", active: true, condition: add.conditionName, ...add.options }]);
    assert.deepEqual(damageDefensesForItem(inside, META).resistances, [type], environment);
    assert.equal(hit(type, 14, damageDefensesForItem(inside, META)), 7, environment);
  }
});

test("only a class feature's own pill or aura reads the catalog", () => {
  const area = classFeatureAuraEffectId({ featureId: TEMPESTA_PROTETTRICE });
  assert.equal(CLASS_FEATURE_AREA_EFFECT_TYPE, "class-feature-area");
  assert.equal(area, `${TEMPESTA_PROTETTRICE}:area`);
  const member = (condition, extra = {}) => ({ type: CLASS_FEATURE_AREA_EFFECT_TYPE, effectId: area, condition, ...extra });
  assert.deepEqual(classFeaturePillDamageDefenses(member("Resistenza: Freddo")), { resistances: ["cold"] });
  assert.equal(classFeaturePillDamageDefenses(member("Resistenza: Anima Tempestosa")), null, "no environment, no defense");
  assert.equal(classFeaturePillDamageDefenses(member("Resistenza: Freddo", { effectId: `${IRA}:area` })), null);
  assert.equal(classFeaturePillDamageDefenses({ type: "spell", effectId: IRA, condition: "Ira" }), null);
  assert.equal(classFeaturePillDamageDefenses({ type: "class-feature", effectId: `${IRA}:secondary:1` }), null);
  assert.equal(classFeaturePillDamageDefenses(null), null);
});

test("each feature names its aura's defended effects apart, so a member's condition says which one it is", () => {
  for (const feature of CLASS_FEATURES) {
    const effects = [feature.effectPlan, ...(feature.choiceOptions || []).map((option) => option.effectPlan)]
      .map((plan) => plan?.targetEffect)
      .filter((effect) => effect?.damageDefenses || effect?.spellDamageResistance);
    const names = effects.map((effect) => effect.conditionName);
    assert.equal(new Set(names).size, names.length, `${feature.id}: ${names.join(", ")}`);
  }
});
