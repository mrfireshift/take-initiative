// Batch P2-dati: pill di legame su token esistenti (anche fuori dall'iniziativa)
// e durata legata alla capacità madre. Nessun codice runtime nuovo.
import test from "node:test";
import assert from "node:assert/strict";

import {
  CLASS_FEATURE_BY_ID,
  CLASS_FEATURE_RESOURCE_POOL_BY_ID,
  classFeatureIsReferenceOnly,
  classFeatureRuntimeSupport,
} from "../src/classFeatureCatalog.js";
import {
  classFeatureConditionInstancesForActivation,
  planClassFeatureActivation,
} from "../src/classFeatureCore.js";

const PACT_OF_THE_CHAIN = "warlock-dono-del-patto-patto-della-catena";
const FUNGAL_INFESTATION = "druido-circolo-delle-spore-infestazione-fungina";
const FUNGAL_INFESTATION_POOL = "druido-circolo-delle-spore-infestazione-fungina-usi";
const ENHANCED_BOND = "druido-circolo-della-fiamma-legame-migliorato";
const WILDFIRE_SPIRIT = "druido-circolo-della-fiamma-evocare-spirito-della-fiamma";

function feature(id) {
  const value = CLASS_FEATURE_BY_ID.get(id);
  assert.ok(value, id);
  return value;
}

function plan(id, { build, state = null, sourceId, targetIds, abilityModifiers = null, instanceId = `${id}-1` }) {
  return planClassFeatureActivation({
    state,
    feature: feature(id),
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: build,
    abilityModifiers,
    sourceId,
    targetIds,
    currentRound: 1,
    currentTurnKey: `1:${sourceId}`,
    instanceId,
  });
}

function activate(id, options, sourceName) {
  const activation = plan(id, options);
  assert.equal(activation.ok, true, `${id}: ${activation.reason || ""}`);
  return {
    activation,
    conditions: classFeatureConditionInstancesForActivation(feature(id), activation.instance, sourceName, options.build),
  };
}

test("Patto della Catena: pill di legame sul famiglio, senza scadenza, opzione del Dono del Patto", () => {
  const value = feature(PACT_OF_THE_CHAIN);
  assert.equal(value.runtimeSupport.status, "implemented");
  assert.equal(value.runtimeSupport.adapter, "condition");
  assert.equal(value.optionGroup, "warlock-dono-del-patto");
  assert.equal(value.defaultEnabled, false);
  assert.equal(value.targeting.mode, "single-target");
  assert.equal(value.targeting.excludeSource, true);
  const build = [{ classId: "warlock", level: 3 }];
  // Il famiglio può non essere in iniziativa: la pill si applica comunque al suo token.
  const { activation, conditions } = activate(PACT_OF_THE_CHAIN, {
    build,
    sourceId: "warlock",
    targetIds: ["familiar"],
  }, "Vesper");
  assert.deepEqual(activation.instance.targetIds, ["familiar"]);
  assert.equal(conditions.length, 1);
  assert.equal(conditions[0].condition, "Famiglio del Patto");
  assert.equal(conditions[0].targetId, "familiar");
  assert.equal(conditions[0].sourceId, "warlock");
  assert.equal(activation.instance.expiresRound ?? null, null);
});

test("Infestazione Fungina: zombi entro 3 m per 1 ora, usi pari alla Saggezza", () => {
  const value = feature(FUNGAL_INFESTATION);
  assert.equal(value.runtimeSupport.status, "implemented");
  assert.equal(value.targeting.rangeMeters, 3);
  assert.equal(value.duration.rounds, 600);
  assert.deepEqual(value.resourceCosts.map((cost) => cost.poolId), [FUNGAL_INFESTATION_POOL]);
  const pool = CLASS_FEATURE_RESOURCE_POOL_BY_ID.get(FUNGAL_INFESTATION_POOL);
  assert.equal(pool.capacity.expression, "max(1, modificatore_saggezza)");
  const build = [{ classId: "druido", level: 6, subclassId: "druido-circolo-delle-spore" }];
  const { activation, conditions } = activate(FUNGAL_INFESTATION, {
    build,
    sourceId: "druid",
    targetIds: ["corpse"],
    abilityModifiers: { wis: 3 },
  }, "Ilse");
  assert.deepEqual(activation.state.resources[FUNGAL_INFESTATION_POOL], { current: 2, maximum: 3, unlimited: false });
  assert.equal(conditions[0].condition, "Zombi Fungino");
  assert.equal(conditions[0].targetId, "corpse");
});

test("Legame Migliorato: richiede lo Spirito della Fiamma attivo e ne segue la durata", () => {
  const build = [{ classId: "druido", level: 6, subclassId: "druido-circolo-della-fiamma" }];
  const value = feature(ENHANCED_BOND);
  assert.equal(value.runtimeSupport.status, "implemented");
  assert.equal(value.duration.untilFeatureId, WILDFIRE_SPIRIT);
  const without = plan(ENHANCED_BOND, { build, sourceId: "druid", targetIds: ["druid"] });
  assert.equal(without.ok, false);
  assert.equal(without.reason, "parent-feature-required");
  const spirit = activate(WILDFIRE_SPIRIT, { build, sourceId: "druid", targetIds: ["druid"] }, "Ilse");
  const bond = activate(ENHANCED_BOND, {
    build,
    state: spirit.activation.state,
    sourceId: "druid",
    targetIds: ["druid"],
  }, "Ilse");
  assert.equal(bond.conditions[0].condition, "Legame Migliorato");
  assert.equal(bond.conditions[0].targetId, "druid");
  assert.equal(bond.activation.instance.parentInstanceId, spirit.activation.instance.instanceId);
});

test("reazioni del compagno e capacità sulle evocazioni da incantesimo restano fuori", () => {
  for (const id of [
    "warlock-l-insondabile-spirale-guardiana",
    "ranger-revised-conclave-della-bestia-attacco-coordinato",
    "ranger-revised-conclave-della-bestia-tempesta-di-artigli-e-zanne",
    "ranger-revised-conclave-della-bestia-difesa-superiore-della-bestia",
    "druido-circolo-del-pastore-spirito-guardiano",
    "mago-scuola-di-negromanzia-servitori-non-morti",
  ]) {
    assert.equal(classFeatureRuntimeSupport(feature(id)).ready, false, id);
  }
  assert.equal(classFeatureIsReferenceOnly(feature("warlock-l-insondabile-spirale-guardiana")), true);
});
