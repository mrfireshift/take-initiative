import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  CLASS_FEATURE_BY_ID,
  CLASS_FEATURE_RESOURCE_POOL_BY_ID,
  classFeatureTargeting,
  getEnabledClassFeatures,
} from "../src/classFeatureCatalog.js";
import {
  appendClassFeatureConditionInstances,
  classFeatureBreaksConcentration,
  classFeatureChoiceOptions,
  classFeatureConditionInstancesForActivation,
  classFeatureAutoActivateParentFeatureId,
  classFeatureDisplayName,
  classFeatureEffectProjection,
  classFeatureRequiresActivationChoice,
  classFeatureTargetIds,
  classFeatureTemporaryHpApplications,
  planClassFeatureActivation,
  planClassFeatureDeactivation,
} from "../src/classFeatureCore.js";
import {
  collectActiveClassFeatureAuras,
  classFeatureAuraTargetIds,
  classFeatureAuraMembershipPlan,
} from "../src/classFeatureAuraCore.js";
import { buildCircleArea } from "../src/aoeGeometryCore.js";
import { ID } from "../src/constants.js";

const PRIORITY_IDS = [
  "barbaro-ira",
  "barbaro-attacco-irruento",
  "barbaro-cammino-del-berserker-frenesia",
  "barbaro-cammino-del-berserker-presenza-intimidatoria",
  "barbaro-cammino-del-combattente-totemico-sintonia-totemica-aquila",
  "barbaro-cammino-del-combattente-totemico-spirito-totemico-aquila",
  "barbaro-cammino-del-combattente-totemico-spirito-totemico-lupo",
  "barbaro-cammino-del-combattente-totemico-spirito-totemico-orso",
  "barbaro-cammino-del-guardiano-ancestrale-protettori-ancestrali",
  "barbaro-cammino-della-bestia-forma-della-bestia",
  "barbaro-cammino-della-bestia-chiamata-alla-caccia",
  "barbaro-cammino-della-magia-selvaggia-magia-corroborante",
  "barbaro-cammino-della-magia-selvaggia-impeto-selvaggio-risultato-2",
  "barbaro-cammino-della-magia-selvaggia-impeto-selvaggio-risultato-5",
  "barbaro-cammino-dello-zelota-presenza-zelante",
];
const OPTION_GATED_IDS = new Set([
  "barbaro-cammino-del-combattente-totemico-sintonia-totemica-aquila",
  "barbaro-cammino-del-combattente-totemico-spirito-totemico-aquila",
  "barbaro-cammino-del-combattente-totemico-spirito-totemico-lupo",
  "barbaro-cammino-del-combattente-totemico-spirito-totemico-orso",
  "barbaro-cammino-della-bestia-forma-della-bestia",
  "barbaro-cammino-della-bestia-chiamata-alla-caccia",
  "barbaro-cammino-della-magia-selvaggia-magia-corroborante",
  "barbaro-cammino-della-magia-selvaggia-impeto-selvaggio-risultato-2",
  "barbaro-cammino-della-magia-selvaggia-impeto-selvaggio-risultato-5",
]);

test("tutti i candidati prioritari Barbaro sono pronti nel runtime", () => {
  for (const id of PRIORITY_IDS) {
    const feature = CLASS_FEATURE_BY_ID.get(id);
    assert.ok(feature, id);
    assert.equal(feature.runtimeSupport.status, "implemented", id);
    assert.equal(feature.defaultEnabled, !OPTION_GATED_IDS.has(id), id);
    assert.equal(feature.trackingMode, "active", id);
    assert.notEqual(feature.effectPlan, null, id);
  }
});

test("Ira e le varianti collegate dichiarano la rottura della concentrazione", () => {
  for (const id of [
    "barbaro-ira",
    "barbaro-cammino-del-berserker-frenesia",
    "barbaro-cammino-del-combattente-totemico-sintonia-totemica-aquila",
    "barbaro-cammino-del-combattente-totemico-spirito-totemico-aquila",
    "barbaro-cammino-del-combattente-totemico-spirito-totemico-lupo",
    "barbaro-cammino-del-combattente-totemico-spirito-totemico-orso",
    "barbaro-cammino-del-guardiano-ancestrale-protettori-ancestrali",
    "barbaro-cammino-della-bestia-forma-della-bestia",
    "barbaro-cammino-della-bestia-chiamata-alla-caccia",
    "barbaro-cammino-della-magia-selvaggia-impeto-selvaggio-risultato-2",
    "barbaro-cammino-della-magia-selvaggia-impeto-selvaggio-risultato-5",
  ]) {
    assert.equal(classFeatureBreaksConcentration(CLASS_FEATURE_BY_ID.get(id)), true, id);
  }
  assert.equal(
    classFeatureBreaksConcentration(
      CLASS_FEATURE_BY_ID.get("barbaro-attacco-irruento"),
    ),
    false,
  );
});

test("i bersagli dei marker Barbaro rispettano la semantica della capacità", () => {
  const intimidatoria = CLASS_FEATURE_BY_ID.get(
    "barbaro-cammino-del-berserker-presenza-intimidatoria",
  );
  const protettori = CLASS_FEATURE_BY_ID.get(
    "barbaro-cammino-del-guardiano-ancestrale-protettori-ancestrali",
  );
  const lupo = CLASS_FEATURE_BY_ID.get(
    "barbaro-cammino-del-combattente-totemico-spirito-totemico-lupo",
  );
  const presenza = CLASS_FEATURE_BY_ID.get(
    "barbaro-cammino-dello-zelota-presenza-zelante",
  );
  const chiamata = CLASS_FEATURE_BY_ID.get(
    "barbaro-cammino-della-bestia-chiamata-alla-caccia",
  );
  const magia = CLASS_FEATURE_BY_ID.get(
    "barbaro-cammino-della-magia-selvaggia-magia-corroborante",
  );
  assert.deepEqual(classFeatureTargeting(intimidatoria), {
    mode: "single-target",
    rangeMeters: 9,
    maxTargets: 1,
    excludeSource: true,
  });
  assert.deepEqual(classFeatureTargeting(protettori), {
    mode: "single-target",
    rangeMeters: null,
    maxTargets: 1,
    excludeSource: true,
  });
  assert.deepEqual(classFeatureTargeting(lupo), {
    mode: "aura",
    rangeMeters: 1.5,
    maxTargets: null,
    excludeSource: false,
  });
  assert.deepEqual(classFeatureTargeting(presenza), {
    mode: "single-target",
    rangeMeters: 18,
    maxTargets: 10,
    excludeSource: true,
  });
  assert.deepEqual(classFeatureTargeting(chiamata), {
    mode: "single-target",
    rangeMeters: 9,
    maxTargets: null,
    excludeSource: true,
  });
  assert.deepEqual(classFeatureTargeting(magia), {
    mode: "single-target",
    rangeMeters: 1.5,
    maxTargets: 1,
    excludeSource: false,
  });
});

test("Spirito Totemico: Lupo produce un'aura legata a Ira", () => {
  const rage = CLASS_FEATURE_BY_ID.get("barbaro-ira");
  const lupo = CLASS_FEATURE_BY_ID.get(
    "barbaro-cammino-del-combattente-totemico-spirito-totemico-lupo",
  );
  const withoutRage = planClassFeatureActivation({
    feature: lupo,
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: [{
      classId: "barbaro",
      level: 3,
      subclassId: "barbaro-cammino-del-combattente-totemico",
    }],
    sourceId: "barbarian",
    targetIds: ["barbarian"],
    currentRound: 2,
    instanceId: "wolf-without-rage",
  });
  assert.deepEqual(withoutRage, {
    ok: false,
    reason: "parent-feature-required",
    parentFeatureId: "barbaro-ira",
  });

  const rageActivation = planClassFeatureActivation({
    feature: rage,
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: [{
      classId: "barbaro",
      level: 3,
      subclassId: "barbaro-cammino-del-combattente-totemico",
    }],
    sourceId: "barbarian",
    targetIds: ["barbarian"],
    currentRound: 2,
    instanceId: "rage-parent",
  });
  const activation = planClassFeatureActivation({
    state: rageActivation.state,
    feature: lupo,
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: [{
      classId: "barbaro",
      level: 3,
      subclassId: "barbaro-cammino-del-combattente-totemico",
    }],
    sourceId: "barbarian",
    targetIds: ["barbarian"],
    currentRound: 2,
    instanceId: "wolf-1",
  });
  assert.equal(rageActivation.ok, true);
  assert.equal(activation.ok, true);
  assert.equal(activation.instance.parentInstanceId, "rage-parent");
  assert.equal(activation.instance.parentFeatureId, "barbaro-ira");

  const projection = classFeatureEffectProjection(lupo);
  assert.equal(projection.kind, "aura");
  assert.equal(projection.radiusMeters, 1.5);
  assert.equal(projection.targetEffect.conditionName, "Vantaggio: attacchi in mischia");
  assert.deepEqual(projection.targetEffects.map((effect) => ({
    conditionName: effect.conditionName,
    effectKind: effect.effectKind,
  })), [{
    conditionName: "Vantaggio: attacchi in mischia",
    effectKind: "buff",
  }]);
  assert.deepEqual(projection.secondaryEffects, []);
  assert.deepEqual(projection.membershipTargeting, {
    filter: "friendly",
    includeCaster: false,
  });
  const pills = classFeatureConditionInstancesForActivation(
    lupo,
    activation.instance,
    "Barbaro",
  );
  assert.equal(pills.length, 1);
  assert.equal(pills[0].targetId, "barbarian");
  assert.deepEqual(pills[0].mechanics, {
    area: {
      radiusMeters: 1.5,
      anchorId: "barbarian",
    },
  });

  const terminated = planClassFeatureDeactivation(activation.state, "rage-parent");
  assert.deepEqual(terminated.removedInstanceIds.sort(), ["rage-parent", "wolf-1"]);
  assert.equal(terminated.state.instances.length, 0);
});

test("Sintonia Totemica: Lupo applica Prono come effetto istantaneo riutilizzabile", () => {
  const rage = CLASS_FEATURE_BY_ID.get("barbaro-ira");
  const lupo = CLASS_FEATURE_BY_ID.get(
    "barbaro-cammino-del-combattente-totemico-sintonia-totemica-lupo",
  );
  const build = [{
    classId: "barbaro",
    level: 14,
    subclassId: "barbaro-cammino-del-combattente-totemico",
  }];
  const withoutRage = planClassFeatureActivation({
    feature: lupo,
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: build,
    sourceId: "barbarian",
    targetIds: ["enemy"],
    currentRound: 2,
    instanceId: "wolf-prone-without-rage",
  });
  assert.deepEqual(withoutRage, {
    ok: false,
    reason: "parent-feature-required",
    parentFeatureId: "barbaro-ira",
  });

  const rageActivation = planClassFeatureActivation({
    feature: rage,
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: build,
    sourceId: "barbarian",
    targetIds: ["barbarian"],
    currentRound: 2,
    instanceId: "rage-for-prone",
  });
  const first = planClassFeatureActivation({
    state: rageActivation.state,
    feature: lupo,
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: build,
    sourceId: "barbarian",
    targetIds: ["enemy"],
    currentRound: 2,
    instanceId: "wolf-prone-1",
  });
  assert.equal(first.ok, true);
  assert.equal(first.instance.parentFeatureId, undefined);
  assert.equal(first.instance.parentInstanceId, undefined);
  assert.equal(first.state.instances.some((entry) => entry.featureId === lupo.id), false);
  const [firstPill] = classFeatureConditionInstancesForActivation(
    lupo,
    first.instance,
    "Barbaro",
  );
  assert.equal(firstPill.condition, "Prono");
  assert.equal(firstPill.targetId, "enemy");
  assert.deepEqual(firstPill.expiry, { mode: "manual" });
  assert.equal(firstPill.parentFeatureId, undefined);
  assert.equal(firstPill.parentInstanceId, undefined);

  const second = planClassFeatureActivation({
    state: first.state,
    feature: lupo,
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: build,
    sourceId: "barbarian",
    targetIds: ["enemy-2"],
    currentRound: 2,
    instanceId: "wolf-prone-2",
  });
  assert.equal(second.ok, true);
  assert.equal(second.state.instances.filter((entry) => entry.featureId === lupo.id).length, 0);
  assert.notEqual(first.instance.instanceId, second.instance.instanceId);

  const rageEnded = planClassFeatureDeactivation(first.state, "rage-for-prone");
  assert.deepEqual(rageEnded.removedInstanceIds, ["rage-for-prone"]);
  assert.equal(rageEnded.state.instances.length, 0);
});

test("Protettori Ancestrali richiede Ira e lascia un solo reminder manuale sul bersaglio", () => {
  const rage = CLASS_FEATURE_BY_ID.get("barbaro-ira");
  const protettori = CLASS_FEATURE_BY_ID.get(
    "barbaro-cammino-del-guardiano-ancestrale-protettori-ancestrali",
  );
  const build = [{
    classId: "barbaro",
    level: 3,
    subclassId: "barbaro-cammino-del-guardiano-ancestrale",
  }];
  const withoutRage = planClassFeatureActivation({
    feature: protettori,
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: build,
    sourceId: "barbarian",
    targetIds: ["enemy"],
    currentRound: 3,
    instanceId: "ancestors-without-rage",
  });
  assert.deepEqual(withoutRage, {
    ok: false,
    reason: "parent-feature-required",
    parentFeatureId: "barbaro-ira",
  });

  const rageActivation = planClassFeatureActivation({
    feature: rage,
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: build,
    sourceId: "barbarian",
    targetIds: ["barbarian"],
    currentRound: 3,
    currentTurnKey: "3:2:barbarian",
    instanceId: "rage-parent",
  });
  const activation = planClassFeatureActivation({
    state: rageActivation.state,
    feature: protettori,
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: build,
    sourceId: "barbarian",
    targetIds: ["enemy"],
    currentRound: 3,
    currentTurnKey: "3:2:barbarian",
    instanceId: "ancestors-1",
  });
  assert.equal(rageActivation.ok, true);
  assert.equal(activation.ok, true);
  assert.equal(activation.instance.parentInstanceId, "rage-parent");
  assert.deepEqual(classFeatureTargetIds(protettori, "barbarian", [
    "barbarian",
    "enemy",
  ]), ["enemy"]);
  assert.equal(classFeatureTargeting(protettori).maxTargets, 1);

  const projection = classFeatureEffectProjection(protettori);
  assert.equal(projection.kind, "condition");
  assert.equal(projection.targetEffect, null);
  assert.deepEqual(projection.targetEffects, []);
  assert.deepEqual(projection.secondaryEffects, []);
  assert.equal(protettori.effectPlan.mechanics, undefined);
  assert.deepEqual(classFeatureTemporaryHpApplications(protettori, activation.instance), []);
  const [pill] = classFeatureConditionInstancesForActivation(
    protettori,
    activation.instance,
    "Barbaro",
  );
  assert.equal(pill.targetId, "enemy");
  assert.equal(pill.parentInstanceId, "rage-parent");
  assert.equal(pill.mechanics, undefined);
  assert.match(pill.effectDetail, /svantaggio/i);
  assert.match(pill.effectDetail, /resistenza/i);
  assert.match(pill.effectDetail, /manual/i);
  assert.deepEqual(pill.expiry, {
    mode: "turn-start",
    actor: "source",
    actorId: "barbarian",
    remaining: 1,
    anchor: "next-turn",
  });

  const targetTermination = planClassFeatureDeactivation(activation.state, "ancestors-1");
  assert.deepEqual(targetTermination.removedInstanceIds, ["ancestors-1"]);
  assert.deepEqual(targetTermination.state.instances.map((entry) => entry.instanceId), [
    "rage-parent",
  ]);
  const rageTermination = planClassFeatureDeactivation(activation.state, "rage-parent");
  assert.deepEqual(rageTermination.removedInstanceIds.sort(), [
    "ancestors-1",
    "rage-parent",
  ]);
  assert.equal(rageTermination.state.instances.length, 0);
});

test("Attacco Irruento scade all'inizio del prossimo turno del barbaro", () => {
  const feature = CLASS_FEATURE_BY_ID.get("barbaro-attacco-irruento");
  const activation = planClassFeatureActivation({
    feature,
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: [{ classId: "barbaro", level: 2, subclassId: "" }],
    sourceId: "barbarian",
    targetIds: ["barbarian"],
    currentRound: 3,
    currentTurnKey: "3:2:barbarian",
    instanceId: "reckless-1",
  });
  assert.equal(activation.ok, true);
  const [pill] = classFeatureConditionInstancesForActivation(
    feature,
    activation.instance,
    "Barbaro",
  );
  assert.deepEqual(pill.expiry, {
    mode: "turn-start",
    actor: "source",
    actorId: "barbarian",
    remaining: 1,
    anchor: "next-turn",
  });
  assert.equal(pill.appliedAt.turnKey, "3:2:barbarian");
});

test("Presenza Intimidatoria scade alla fine del prossimo turno del barbaro", () => {
  const feature = CLASS_FEATURE_BY_ID.get(
    "barbaro-cammino-del-berserker-presenza-intimidatoria",
  );
  const activation = planClassFeatureActivation({
    feature,
    poolsById: new Map(),
    characterBuild: [{ classId: "barbaro", level: 10, subclassId: "" }],
    sourceId: "barbarian",
    targetIds: ["enemy"],
    currentRound: 3,
    currentTurnKey: "3:2:barbarian",
    instanceId: "intimidating-2",
  });
  const [pill] = classFeatureConditionInstancesForActivation(
    feature,
    activation.instance,
    "Barbaro",
  );
  assert.deepEqual(pill.expiry, {
    mode: "turn-end",
    actor: "source",
    actorId: "barbarian",
    remaining: 1,
    anchor: "next-turn",
  });
  assert.match(feature.effectPlan.detail, /TS Saggezza fallito/i);
  assert.match(feature.effectPlan.detail, /rinnov/i);
  assert.match(feature.effectPlan.detail, /fuori linea/i);
  assert.match(feature.effectPlan.detail, /18 m/i);
  assert.match(feature.effectPlan.detail, /24 ore/i);
});

test("Frenesia usa lo stesso pool di Ira", () => {
  const feature = CLASS_FEATURE_BY_ID.get("barbaro-cammino-del-berserker-frenesia");
  assert.deepEqual(feature.resourceCosts, [{
    poolId: "barbaro-ira-usi",
    amount: 1,
    sharedWithFeatureId: "barbaro-ira",
  }]);
});

test("Frenesia si sceglie entrando in Ira e applica Indebolimento alla fine", () => {
  const feature = CLASS_FEATURE_BY_ID.get("barbaro-cammino-del-berserker-frenesia");
  assert.equal(classFeatureAutoActivateParentFeatureId(feature), "barbaro-ira");
  assert.equal(feature.activation.primary, "ingresso_in_ira");
  assert.match(feature.effectPlan.detail, /attiva prima Ira/i);
  assert.match(feature.effectPlan.detail, /entrando in Ira/i);
  assert.match(feature.effectPlan.detail, /turno oltre quello iniziale/i);
  assert.match(feature.effectPlan.detail, /automaticamente uno stack di Indebolimento/i);
  assert.deepEqual(feature.duration, {
    rounds: null,
    untilFeatureId: "barbaro-ira",
  });
});

test("l'overlay meccanico del Berserker separa scelta, TS assistito e blocco di 24 ore", () => {
  const mechanics = JSON.parse(fs.readFileSync(
    new URL("../data/class-features/phb2014_livello_meccanico_v1_1.json", import.meta.url),
    "utf8",
  )).mechanics;
  const frenzy = mechanics.find((entry) => entry.id === "barbaro-cammino-del-berserker-frenesia");
  const intimidatoria = mechanics.find((entry) => entry.id === "barbaro-cammino-del-berserker-presenza-intimidatoria");
  assert.equal(frenzy.activation.primary, "ingresso_in_ira");
  assert.equal(intimidatoria.automation_level, "assistita");
  assert.deepEqual(intimidatoria.activation, {
    primary: "azione",
    alternatives: [],
    trigger: "tiro_salvezza",
    timing: null,
    optional: true,
  });
  assert.equal(intimidatoria.manual_choice_required, true);
  assert.equal(intimidatoria.targets.range_meters, 9);
  assert.equal(intimidatoria.duration.type, "until_end_of_next_turn");
  assert.notEqual(intimidatoria.duration.value, 24);
  assert.deepEqual(intimidatoria.recovery, ["blocco_24_ore_dopo_tiro_salvezza_riuscito"]);
});

test("Presenza Zelante termina all'inizio del prossimo turno del barbaro", () => {
  const feature = CLASS_FEATURE_BY_ID.get(
    "barbaro-cammino-dello-zelota-presenza-zelante",
  );
  const activation = planClassFeatureActivation({
    feature,
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: [{ classId: "barbaro", level: 14, subclassId: "" }],
    sourceId: "barbarian",
    targetIds: ["ally-1", "ally-2"],
    currentRound: 3,
    currentTurnKey: "3:2:barbarian",
    instanceId: "zealous-1",
  });
  assert.equal(activation.ok, true);
  const instances = classFeatureConditionInstancesForActivation(
    feature,
    activation.instance,
    "Barbaro",
  );
  assert.deepEqual(instances.map((entry) => entry.expiry), [
    {
      mode: "turn-start",
      actor: "source",
      actorId: "barbarian",
      remaining: 1,
      anchor: "next-turn",
    },
    {
      mode: "turn-start",
      actor: "source",
      actorId: "barbarian",
      remaining: 1,
      anchor: "next-turn",
    },
  ]);
});

test("le varianti di Ira condividono l'istanza senza consumare una seconda Ira", () => {
  const rage = CLASS_FEATURE_BY_ID.get("barbaro-ira");
  const frenzy = CLASS_FEATURE_BY_ID.get("barbaro-cammino-del-berserker-frenesia");
  const rageActivation = planClassFeatureActivation({
    feature: rage,
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: [{ classId: "barbaro", level: 3, subclassId: "barbaro-cammino-del-berserker" }],
    sourceId: "barbarian",
    targetIds: ["barbarian"],
    currentRound: 2,
    instanceId: "rage-parent",
  });
  const frenzyActivation = planClassFeatureActivation({
    state: rageActivation.state,
    feature: frenzy,
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: [{ classId: "barbaro", level: 3, subclassId: "barbaro-cammino-del-berserker" }],
    sourceId: "barbarian",
    targetIds: ["barbarian"],
    currentRound: 2,
    instanceId: "frenzy-child",
  });
  assert.equal(rageActivation.ok, true);
  assert.equal(frenzyActivation.ok, true);
  assert.equal(frenzyActivation.instance.parentInstanceId, "rage-parent");
  assert.equal(frenzyActivation.state.resources["barbaro-ira-usi"].current, 2);
});

test("i risultati di Magia Selvaggia usano nomi semantici", () => {
  const names = [1, 2, 3, 4, 5, 6, 7, 8].map((number) => {
    const feature = CLASS_FEATURE_BY_ID.get(
      `barbaro-cammino-della-magia-selvaggia-impeto-selvaggio-risultato-${number}`,
    );
    return feature?.name;
  });
  assert.deepEqual(names, [
    "Magia Selvaggia: Viti Oscure",
    "Magia Selvaggia: Teletrasporto",
    "Magia Selvaggia: Spirito Esplosivo",
    "Magia Selvaggia: Arma Infusa",
    "Magia Selvaggia: Ritorsione della Forza",
    "Magia Selvaggia: Luci Protettive",
    "Magia Selvaggia: Rampicanti",
    "Magia Selvaggia: Dardo di Luce",
  ]);
});

test("le pill dei marker prioritari ereditano nome e tema della Feature", () => {
  const feature = CLASS_FEATURE_BY_ID.get(
    "barbaro-cammino-del-guardiano-ancestrale-protettori-ancestrali",
  );
  const instances = classFeatureConditionInstancesForActivation(feature, {
    instanceId: "ancestors-1",
    sourceId: "barbarian",
    targetIds: ["enemy"],
    startedRound: 3,
    expiresRound: 4,
  }, "Barbaro");
  assert.equal(instances.length, 1);
  assert.equal(instances[0].targetId, "enemy");
  assert.equal(instances[0].condition, "Protettori Ancestrali");
  assert.deepEqual(instances[0].theme, feature.theme);
});

test("una capacitÃ  a bersaglio non crea la pill anche sul caster", () => {
  const feature = CLASS_FEATURE_BY_ID.get(
    "barbaro-cammino-del-berserker-presenza-intimidatoria",
  );
  const instances = classFeatureConditionInstancesForActivation(feature, {
    instanceId: "intimidating-1",
    sourceId: "barbarian",
    targetIds: ["barbarian", "enemy"],
    startedRound: 3,
    expiresRound: 4,
  }, "Barbaro");
  assert.deepEqual(instances.map((entry) => entry.targetId), ["enemy"]);
});

test("il fallback della scheda non ricrea la pill del caster per un bersaglio", () => {
  const feature = CLASS_FEATURE_BY_ID.get(
    "barbaro-cammino-del-berserker-presenza-intimidatoria",
  );
  const state = {
    instances: [{
      instanceId: "intimidating-3",
      featureId: feature.id,
      sourceId: "barbarian",
      targetIds: ["enemy"],
      startedRound: 3,
      expiresRound: null,
    }],
  };
  const projected = appendClassFeatureConditionInstances(
    {},
    state,
    CLASS_FEATURE_BY_ID,
    3,
  );
  assert.deepEqual(projected.instances, []);
});

test("una capacità a contatto non ricrea la pill sul caster quando il bersaglio è un alleato", () => {
  const feature = CLASS_FEATURE_BY_ID.get(
    "barbaro-cammino-della-magia-selvaggia-magia-corroborante",
  );
  const projected = appendClassFeatureConditionInstances(
    {},
    {
      instances: [{
        instanceId: "magic-legacy",
        featureId: feature.id,
        sourceId: "barbarian",
        targetIds: ["ally"],
        choiceId: "bonus-d20",
        startedRound: 1,
        expiresRound: 100,
      }],
    },
    CLASS_FEATURE_BY_ID,
    2,
  );
  assert.deepEqual(projected.instances, []);
});

test("la proiezione dei marker resta una pill di classe e non una condizione neutra", () => {
  const feature = CLASS_FEATURE_BY_ID.get(
    "barbaro-cammino-della-magia-selvaggia-impeto-selvaggio-risultato-5",
  );
  const projection = classFeatureEffectProjection(feature);
  assert.equal(projection.kind, "condition");
  assert.equal(projection.conditionName, "Magia Selvaggia: Ritorsione della Forza");
  assert.equal(projection.theme.background, "#312e81");
});

test("le capacità a scelta persistono variante, nome e durata nella pill", () => {
  const feature = CLASS_FEATURE_BY_ID.get(
    "barbaro-cammino-della-bestia-forma-della-bestia",
  );
  assert.deepEqual(classFeatureChoiceOptions(feature).map((option) => option.id), [
    "morso",
    "artigli",
    "coda",
  ]);
  const activation = planClassFeatureActivation({
    state: {
      instances: [{
        instanceId: "rage-parent",
        featureId: "barbaro-ira",
        sourceId: "barbarian",
        targetIds: ["barbarian"],
        startedRound: 1,
        expiresRound: 10,
      }],
    },
    feature,
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: [{ classId: "barbaro", level: 3, subclassId: "barbaro-cammino-della-bestia" }],
    sourceId: "barbarian",
    targetIds: ["barbarian"],
    currentRound: 2,
    instanceId: "beast-form-1",
    choiceId: "coda",
  });
  assert.equal(activation.ok, true);
  assert.equal(activation.instance.choiceId, "coda");
  assert.equal(classFeatureDisplayName(feature, activation.instance.choiceId), "🐾 Forma della Bestia: Coda");
  const [pill] = classFeatureConditionInstancesForActivation(
    feature,
    activation.instance,
    "Barbaro",
  );
  assert.equal(pill.condition, "Forma della Bestia: Coda");
  assert.deepEqual(pill.expiry, { mode: "rounds", remaining: 9 });
});

test("Chiamata alla Caccia applica gli HP temporanei fissi al solo barbaro", () => {
  const feature = CLASS_FEATURE_BY_ID.get(
    "barbaro-cammino-della-bestia-chiamata-alla-caccia",
  );
  assert.deepEqual(classFeatureTemporaryHpApplications(feature, {
    sourceId: "barbarian",
    targetIds: ["ally-1", "ally-2", "ally-3"],
  }), [{ targetId: "barbarian", amount: 15 }]);
  assert.deepEqual(classFeatureTemporaryHpApplications(feature, {
    sourceId: "barbarian",
    targetIds: [],
  }), []);
});

test("Magia Corroborante richiede una scelta e dura 10 minuti", () => {
  const feature = CLASS_FEATURE_BY_ID.get(
    "barbaro-cammino-della-magia-selvaggia-magia-corroborante",
  );
  const missing = planClassFeatureActivation({
    feature,
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: [{ classId: "barbaro", level: 6, subclassId: "barbaro-cammino-della-magia-selvaggia" }],
    sourceId: "barbarian",
    targetIds: ["ally"],
    instanceId: "magic-1",
  });
  assert.deepEqual(missing, { ok: false, reason: "choice-required" });
  const activation = planClassFeatureActivation({
    ...missing,
    feature,
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: [{ classId: "barbaro", level: 6, subclassId: "barbaro-cammino-della-magia-selvaggia" }],
    sourceId: "barbarian",
    targetIds: ["ally"],
    instanceId: "magic-2",
    choiceId: "bonus-d20",
  });
  assert.equal(activation.ok, true);
  assert.equal(activation.instance.expiresRound, 100);
  assert.equal(activation.instance.choiceId, "bonus-d20");
});

test("Tempesta Protettrice propaga l'aura di resistenza agli alleati scelti con entry, exit, re-entry e cleanup", () => {
  const feature = CLASS_FEATURE_BY_ID.get(
    "barbaro-cammino-dell-araldo-della-tempesta-tempesta-protettrice",
  );
  assert.ok(feature);
  assert.equal(feature.runtimeSupport.adapter, "aura");
  assert.equal(feature.minimumLevel, 10);

  const rageFeature = CLASS_FEATURE_BY_ID.get("barbaro-ira");
  assert.ok(rageFeature);
  const rageActivation = planClassFeatureActivation({
    feature: rageFeature,
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: [{ classId: "barbaro", level: 10, subclassId: "barbaro-cammino-dell-araldo-della-tempesta" }],
    sourceId: "barbarian",
    targetIds: ["barbarian"],
    instanceId: "rage-instance",
  });
  assert.equal(rageActivation.ok, true);

  const auraFeature = CLASS_FEATURE_BY_ID.get(
    "barbaro-cammino-dell-araldo-della-tempesta-aura-tempestosa",
  );
  assert.ok(auraFeature);
  const auraActivation = planClassFeatureActivation({
    state: rageActivation.state,
    feature: auraFeature,
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: [{ classId: "barbaro", level: 10, subclassId: "barbaro-cammino-dell-araldo-della-tempesta" }],
    sourceId: "barbarian",
    targetIds: ["barbarian"],
    instanceId: "storm-aura-instance",
    choiceId: "deserto",
  });
  assert.equal(auraActivation.ok, true);

  const activation = planClassFeatureActivation({
    state: auraActivation.state,
    feature,
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: [{ classId: "barbaro", level: 10, subclassId: "barbaro-cammino-dell-araldo-della-tempesta" }],
    sourceId: "barbarian",
    targetIds: ["ally-1"],
    instanceId: "tempest-protect-instance",
  });
  assert.equal(activation.ok, true);

  const META_KEY = `${ID}/meta`;
  const items = [
    { id: "barbarian", name: "Barbaro", position: { x: 0, y: 0 }, metadata: { [META_KEY]: { attitude: "pc", classFeatureState: activation.state } } },
    { id: "ally-1", name: "Alleato 1", position: { x: 50, y: 0 }, metadata: { [META_KEY]: { attitude: "ally", conditions: { instances: [] } } } },
    { id: "ally-2", name: "Alleato 2", position: { x: 50, y: 0 }, metadata: { [META_KEY]: { attitude: "ally", conditions: { instances: [] } } } },
    { id: "enemy", name: "Nemico", position: { x: 50, y: 0 }, metadata: { [META_KEY]: { attitude: "enemy", conditions: { instances: [] } } } },
  ];

  const auras = collectActiveClassFeatureAuras(items, {
    metaKey: META_KEY,
    featureById: CLASS_FEATURE_BY_ID,
  });
  const aura = auras.find((a) => a.featureId === "barbaro-cammino-dell-araldo-della-tempesta-tempesta-protettrice");
  assert.ok(aura);

  const area = buildCircleArea(
    { x: 0, y: 0 },
    { x: 6, y: 0 },
    1,
    { x: 0, y: 0 },
  );
  const candidates = items.map((item, index) => ({
    item,
    bounds: {
      min: { x: index + 1, y: 0 },
      max: { x: index + 2, y: 1 },
    },
  }));

  // 1. Ally 1 (selected and friendly) is inside aura
  const insideTargets = classFeatureAuraTargetIds({
    aura,
    area,
    candidates,
    metaKey: META_KEY,
  });
  assert.deepEqual(insideTargets, ["ally-1"]);

  const entryPlan = classFeatureAuraMembershipPlan({
    aura,
    desiredTargetIds: insideTargets,
    items,
    metaKey: META_KEY,
  });
  assert.deepEqual(entryPlan.entering, ["ally-1"]);
  assert.equal(entryPlan.operations.length, 1);
  assert.equal(entryPlan.operations[0].type, "condition:add");
  assert.equal(entryPlan.operations[0].conditionName, "Resistenza: Fuoco");
  assert.deepEqual(entryPlan.operations[0].targetIds, ["ally-1"]);

  // Apply condition instance to ally-1
  const conditionInstance = {
    id: "storm-protect-ally-1",
    condition: "Resistenza: Fuoco",
    active: true,
    parentEffectId: aura.instanceId,
    effectId: aura.targetEffects[0].id,
    type: "class-feature-area",
  };
  items[1].metadata[META_KEY].conditions.instances.push(conditionInstance);

  // 2. Ally 1 exits aura
  const outsideTargets = [];
  const exitPlan = classFeatureAuraMembershipPlan({
    aura,
    desiredTargetIds: outsideTargets,
    items,
    metaKey: META_KEY,
  });
  assert.deepEqual(exitPlan.leaving, ["ally-1"]);
  assert.equal(exitPlan.operations.length, 1);
  assert.equal(exitPlan.operations[0].type, "condition:remove-instances");
  assert.deepEqual(exitPlan.operations[0].removals, [{
    itemId: "ally-1",
    instanceId: "storm-protect-ally-1",
    skipClassFeatureReconcile: true,
  }]);

  // Apply removal
  items[1].metadata[META_KEY].conditions.instances = [];

  // 3. Ally 1 re-enters aura
  const reEntryPlan = classFeatureAuraMembershipPlan({
    aura,
    desiredTargetIds: ["ally-1"],
    items,
    metaKey: META_KEY,
  });
  assert.deepEqual(reEntryPlan.entering, ["ally-1"]);
  assert.equal(reEntryPlan.operations.length, 1);
  assert.equal(reEntryPlan.operations[0].type, "condition:add");

  // 4. Aura ends -> cleanup
  items[1].metadata[META_KEY].conditions.instances.push(conditionInstance);
  const deactivationPlan = classFeatureAuraMembershipPlan({
    aura,
    desiredTargetIds: [],
    items,
    metaKey: META_KEY,
  });
  assert.deepEqual(deactivationPlan.leaving, ["ally-1"]);
  assert.equal(deactivationPlan.operations[0].type, "condition:remove-instances");
});

test("CF-B01C.1: Aura Tempestosa mutual exclusivity and choice normalization (Tests 1-4)", () => {
  const build = [{ classId: "barbaro", level: 10, subclassId: "barbaro-cammino-dell-araldo-della-tempesta" }];
  const stormAuraFeature = CLASS_FEATURE_BY_ID.get("barbaro-cammino-dell-araldo-della-tempesta-aura-tempestosa");
  const desertoId = "barbaro-cammino-dell-araldo-della-tempesta-aura-tempestosa-deserto";
  const mareId = "barbaro-cammino-dell-araldo-della-tempesta-aura-tempestosa-mare";
  const tundraId = "barbaro-cammino-dell-araldo-della-tempesta-aura-tempestosa-tundra";

  const rageFeature = CLASS_FEATURE_BY_ID.get("barbaro-ira");
  const rageAct = planClassFeatureActivation({
    feature: rageFeature,
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: build,
    sourceId: "barbarian",
    targetIds: ["barbarian"],
    instanceId: "rage-inst",
  });
  assert.equal(rageAct.ok, true);

  // TEST 1: Select Deserto
  const profileDeserto = {
    characterBuild: build,
    classFeaturesConfigured: true,
    enabledClassFeatureIds: ["barbaro-ira", stormAuraFeature.id, desertoId],
  };
  const enabledDeserto = getEnabledClassFeatures(profileDeserto);
  assert.ok(enabledDeserto.some((f) => f.id === desertoId));
  assert.ok(!enabledDeserto.some((f) => f.id === mareId));
  assert.ok(!enabledDeserto.some((f) => f.id === tundraId));

  const actDeserto = planClassFeatureActivation({
    state: rageAct.state,
    feature: stormAuraFeature,
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: build,
    enabledFeatureIds: enabledDeserto.map((f) => f.id),
    sourceId: "barbarian",
    instanceId: "storm-deserto-inst",
  });
  assert.equal(actDeserto.ok, true);
  assert.equal(actDeserto.state.instances.find((i) => i.featureId === stormAuraFeature.id)?.choiceId, "deserto");

  // TEST 2: Starting from Deserto, select Mare
  const profileMare = {
    characterBuild: build,
    classFeaturesConfigured: true,
    enabledClassFeatureIds: ["barbaro-ira", stormAuraFeature.id, mareId],
  };
  const enabledMare = getEnabledClassFeatures(profileMare);
  assert.ok(!enabledMare.some((f) => f.id === desertoId));
  assert.ok(enabledMare.some((f) => f.id === mareId));
  assert.ok(!enabledMare.some((f) => f.id === tundraId));

  const actMare = planClassFeatureActivation({
    state: rageAct.state,
    feature: stormAuraFeature,
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: build,
    enabledFeatureIds: enabledMare.map((f) => f.id),
    sourceId: "barbarian",
    instanceId: "storm-mare-inst",
  });
  assert.equal(actMare.ok, true);
  assert.equal(actMare.state.instances.find((i) => i.featureId === stormAuraFeature.id)?.choiceId, "mare");

  // TEST 3: Starting from Mare, select Tundra
  const profileTundra = {
    characterBuild: build,
    classFeaturesConfigured: true,
    enabledClassFeatureIds: ["barbaro-ira", stormAuraFeature.id, tundraId],
  };
  const enabledTundra = getEnabledClassFeatures(profileTundra);
  assert.ok(!enabledTundra.some((f) => f.id === desertoId));
  assert.ok(!enabledTundra.some((f) => f.id === mareId));
  assert.ok(enabledTundra.some((f) => f.id === tundraId));

  const actTundra = planClassFeatureActivation({
    state: rageAct.state,
    feature: stormAuraFeature,
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: build,
    enabledFeatureIds: enabledTundra.map((f) => f.id),
    sourceId: "barbarian",
    instanceId: "storm-tundra-inst",
  });
  assert.equal(actTundra.ok, true);
  assert.equal(actTundra.state.instances.find((i) => i.featureId === stormAuraFeature.id)?.choiceId, "tundra");

  // TEST 4 (Invalid State): Supplying both Deserto and Mare
  const profileInvalid = {
    characterBuild: build,
    classFeaturesConfigured: true,
    enabledClassFeatureIds: ["barbaro-ira", stormAuraFeature.id, desertoId, mareId, tundraId],
  };
  const enabledInvalid = getEnabledClassFeatures(profileInvalid);
  const environmentFeatures = enabledInvalid.filter((f) => f.optionGroup === "barbaro-aura-tempestosa-ambiente");
  assert.equal(environmentFeatures.length, 1, "Model must normalize multiple enabled optionGroup features to exactly 1");
});

test("CF-B01C.1: Sheet choice propagation to Tempesta Protettrice (Tests 5-6)", () => {
  const build = [{ classId: "barbaro", level: 10, subclassId: "barbaro-cammino-dell-araldo-della-tempesta" }];
  const rageFeature = CLASS_FEATURE_BY_ID.get("barbaro-ira");
  const stormAuraFeature = CLASS_FEATURE_BY_ID.get("barbaro-cammino-dell-araldo-della-tempesta-aura-tempestosa");
  const tempestProtectFeature = CLASS_FEATURE_BY_ID.get("barbaro-cammino-dell-araldo-della-tempesta-tempesta-protettrice");
  const tundraId = "barbaro-cammino-dell-araldo-della-tempesta-aura-tempestosa-tundra";

  // TEST 5: Tundra in sheet -> Aura Tempestosa (no choice arg) -> Tempesta Protettrice (no choice arg) -> Resistenza: Freddo
  const rageAct = planClassFeatureActivation({
    feature: rageFeature,
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: build,
    sourceId: "barbarian",
    targetIds: ["barbarian"],
    instanceId: "rage-inst",
  });

  const stormAct = planClassFeatureActivation({
    state: rageAct.state,
    feature: stormAuraFeature,
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: build,
    enabledFeatureIds: ["barbaro-ira", stormAuraFeature.id, tundraId],
    sourceId: "barbarian",
    instanceId: "storm-inst",
  });
  assert.equal(stormAct.ok, true);
  assert.equal(stormAct.state.instances.find((i) => i.featureId === stormAuraFeature.id)?.choiceId, "tundra");

  const protectAct = planClassFeatureActivation({
    state: stormAct.state,
    feature: tempestProtectFeature,
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: build,
    sourceId: "barbarian",
    targetIds: ["ally-1"],
    instanceId: "protect-inst",
  });
  assert.equal(protectAct.ok, true);
  assert.equal(protectAct.state.instances.find((i) => i.featureId === tempestProtectFeature.id)?.choiceId, "tundra");

  const META_KEY = `${ID}/meta`;
  const items = [
    {
      id: "barbarian",
      name: "Barbaro",
      position: { x: 0, y: 0 },
      metadata: { [META_KEY]: { attitude: "pc", classFeatureState: protectAct.state } },
    },
    {
      id: "ally-1",
      name: "Alleato 1",
      position: { x: 50, y: 0 },
      metadata: { [META_KEY]: { attitude: "ally", conditions: { instances: [] } } },
    },
  ];

  const auras = collectActiveClassFeatureAuras(items, {
    metaKey: META_KEY,
    featureById: CLASS_FEATURE_BY_ID,
    characterBuildBySourceId: new Map([["barbarian", build]]),
  });
  const protectAura = auras.find((a) => a.featureId === tempestProtectFeature.id);
  assert.ok(protectAura);
  assert.equal(protectAura.targetEffects[0].label, "Resistenza: Freddo");

  const plan = classFeatureAuraMembershipPlan({
    aura: protectAura,
    desiredTargetIds: ["ally-1"],
    items,
    metaKey: META_KEY,
  });
  assert.equal(plan.operations.length, 1);
  assert.equal(plan.operations[0].conditionName, "Resistenza: Freddo");

  // TEST 6: Switch propagation (Deserto -> Mare)
  // Ally has existing Resistenza: Fuoco
  items[1].metadata[META_KEY].conditions.instances = [
    {
      id: "cond-protect-fire",
      condition: "Resistenza: Fuoco",
      active: true,
      type: "class-feature-area",
      parentEffectId: "protect-inst",
      effectId: "barbaro-cammino-dell-araldo-della-tempesta-tempesta-protettrice:area",
      effectKind: "buff",
    },
  ];

  // Update Barbarian state to Mare
  items[0].metadata[META_KEY].classFeatureState = {
    instances: [
      {
        instanceId: "storm-inst",
        featureId: stormAuraFeature.id,
        choiceId: "mare",
        active: true,
      },
      {
        instanceId: "protect-inst",
        featureId: tempestProtectFeature.id,
        parentInstanceId: "storm-inst",
        choiceId: "mare",
        targetIds: ["ally-1"],
        active: true,
      },
    ],
  };

  const aurasAfterSwitch = collectActiveClassFeatureAuras(items, {
    metaKey: META_KEY,
    featureById: CLASS_FEATURE_BY_ID,
    characterBuildBySourceId: new Map([["barbarian", build]]),
  });
  const protectAuraAfterSwitch = aurasAfterSwitch.find((a) => a.featureId === tempestProtectFeature.id);
  assert.ok(protectAuraAfterSwitch);
  assert.equal(protectAuraAfterSwitch.targetEffects[0].label, "Resistenza: Fulmine");

  const switchPlan = classFeatureAuraMembershipPlan({
    aura: protectAuraAfterSwitch,
    desiredTargetIds: ["ally-1"],
    items,
    metaKey: META_KEY,
  });
  assert.equal(switchPlan.operations.length, 2, "Must remove old and add new condition");
  const removeOp = switchPlan.operations.find((op) => op.type === "condition:remove-instances");
  const addOp = switchPlan.operations.find((op) => op.type === "condition:add");
  assert.ok(removeOp);
  assert.ok(addOp);
  assert.equal(addOp.conditionName, "Resistenza: Fulmine");
});

test("CF-B01C.2: Zero runtime dropdowns on Ira, Aura Tempestosa, Tempesta Protettrice (Tests 4-6, 10)", () => {
  const build = [{ classId: "barbaro", level: 10, subclassId: "barbaro-cammino-dell-araldo-della-tempesta" }];
  const rageFeature = CLASS_FEATURE_BY_ID.get("barbaro-ira");
  const stormAuraFeature = CLASS_FEATURE_BY_ID.get("barbaro-cammino-dell-araldo-della-tempesta-aura-tempestosa");
  const tempestProtectFeature = CLASS_FEATURE_BY_ID.get("barbaro-cammino-dell-araldo-della-tempesta-tempesta-protettrice");
  const tundraId = "barbaro-cammino-dell-araldo-della-tempesta-aura-tempestosa-tundra";

  const enabledFeatureIds = ["barbaro-ira", stormAuraFeature.id, tundraId, tempestProtectFeature.id];

  // TEST 4: Ira action model with Tundra -> ZERO environment dropdown
  assert.equal(
    classFeatureRequiresActivationChoice(rageFeature, enabledFeatureIds),
    false,
    "Ira must NOT require any activation choice",
  );

  // Auto-activate child check on Ira
  const autoActivateChildren = (rageFeature.autoActivateFeatureIds || [])
    .map((id) => CLASS_FEATURE_BY_ID.get(id))
    .filter(Boolean);
  for (const child of autoActivateChildren) {
    if (child.id === stormAuraFeature.id) {
      assert.equal(
        classFeatureRequiresActivationChoice(child, enabledFeatureIds),
        false,
        "Aura Tempestosa auto-activated by Ira must NOT require activation choice dropdown",
      );
    }
  }

  // TEST 5: Aura Tempestosa action model -> ZERO environment dropdown
  assert.equal(
    classFeatureRequiresActivationChoice(stormAuraFeature, enabledFeatureIds),
    false,
    "Aura Tempestosa must NOT require activation choice dropdown when configured in sheet",
  );

  // TEST 6: Tempesta Protettrice action model -> ZERO environment dropdown, targeting preserved
  assert.equal(
    classFeatureRequiresActivationChoice(tempestProtectFeature, enabledFeatureIds),
    false,
    "Tempesta Protettrice must NOT require activation choice dropdown",
  );
  assert.equal(tempestProtectFeature.targeting.mode, "single-target", "Tempesta Protettrice must retain target selection");
  assert.equal(tempestProtectFeature.targeting.excludeSource, true);

  // TEST 10: Caller attempts to pass choiceId different from sheet configuration
  const rageAct = planClassFeatureActivation({
    feature: rageFeature,
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: build,
    sourceId: "barbarian",
    targetIds: ["barbarian"],
    instanceId: "rage-inst",
  });

  // Try to pass choiceId: "deserto" while enabledFeatureIds has tundra
  const stormOverrideAttempt = planClassFeatureActivation({
    state: rageAct.state,
    feature: stormAuraFeature,
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: build,
    enabledFeatureIds,
    choiceId: "deserto", // attempt override
    sourceId: "barbarian",
    instanceId: "storm-inst",
  });
  assert.equal(stormOverrideAttempt.ok, true);
  const stormInstance = stormOverrideAttempt.state.instances.find((i) => i.featureId === stormAuraFeature.id);
  assert.equal(
    stormInstance?.choiceId,
    "tundra",
    "Canonical configuration choice (tundra) must PREVAIL over runtime choiceId override (deserto)",
  );

  // Try to pass choiceId: "mare" to Tempesta Protettrice
  const protectOverrideAttempt = planClassFeatureActivation({
    state: stormOverrideAttempt.state,
    feature: tempestProtectFeature,
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: build,
    enabledFeatureIds,
    choiceId: "mare", // attempt override
    sourceId: "barbarian",
    targetIds: ["ally-1"],
    instanceId: "protect-inst",
  });
  assert.equal(protectOverrideAttempt.ok, true);
  const protectInstance = protectOverrideAttempt.state.instances.find((i) => i.featureId === tempestProtectFeature.id);
  assert.equal(
    protectInstance?.choiceId,
    "tundra",
    "Tempesta Protettrice must inherit parent tundra choice, ignoring runtime override",
  );
});
