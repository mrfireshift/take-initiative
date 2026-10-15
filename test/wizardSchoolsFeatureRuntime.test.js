import test from "node:test";
import assert from "node:assert/strict";

import {
  CLASS_FEATURE_BY_ID,
  CLASS_FEATURE_CATALOG,
  CLASS_FEATURE_RESOURCE_POOL_BY_ID,
  classFeatureIsReferenceOnly,
  classFeatureRuntimeSupport,
} from "../src/classFeatureCatalog.js";
import {
  classFeatureConditionInstancesForActivation,
  classFeatureRequiresActivationChoice,
  planClassFeatureActivation,
} from "../src/classFeatureCore.js";
import { resolveMovementProfile } from "../src/movementProfileCore.js";

function feature(id) {
  const value = CLASS_FEATURE_BY_ID.get(id);
  assert.ok(value, id);
  return value;
}

function wizard(level, subclassId) {
  return [{ classId: "mago", level, subclassId }];
}

function activate(id, { build, targetIds = ["wizard"], choiceId = "", instanceId = `${id}-1` }) {
  const activation = planClassFeatureActivation({
    state: null,
    feature: feature(id),
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: build,
    sourceId: "wizard",
    targetIds,
    currentRound: 1,
    currentTurnKey: "1:wizard",
    instanceId,
    choiceId,
  });
  assert.equal(activation.ok, true, `${id}: ${activation.reason || ""}`);
  return {
    activation,
    conditions: classFeatureConditionInstancesForActivation(feature(id), activation.instance, "Nyx", build),
  };
}

const CONDITIONS = {
  "mago-scuola-di-divinazione-terzo-occhio": "Terzo Occhio",
  "mago-scuola-di-ammaliamento-sguardo-ipnotico": "Affascinato",
  "mago-magia-della-guerra-deviazione-arcana": "Deviazione Arcana",
  "mago-canto-della-lama-melodia-della-lama": "Melodia della Lama",
  "mago-scuola-di-negromanzia-comandare-non-morti": "Comandare Non Morti",
};

const RESOURCE_ONLY = [
  "mago-scuola-di-divinazione-portento",
  "mago-scuola-di-evocazione-trasposizione-benevola",
  "mago-ordine-degli-scribi-libro-degli-incantesimi-risvegliato",
  "mago-ordine-degli-scribi-mente-manifesta",
  "mago-ordine-degli-scribi-comunione-con-il-testo",
  "mago-scuola-di-illusione-sosia-illusorio",
];

test("Mago: il batch implementa 11 capacità senza adapter nuovi", () => {
  const implemented = CLASS_FEATURE_CATALOG.features.filter((entry) =>
    entry.classId === "mago" && entry.runtimeSupport.status === "implemented"
  );
  assert.equal(implemented.length, 11);
  for (const [id, conditionName] of Object.entries(CONDITIONS)) {
    assert.equal(feature(id).runtimeSupport.adapter, "condition", id);
    assert.equal(feature(id).effectPlan.conditionName, conditionName, id);
  }
  for (const id of RESOURCE_ONLY) {
    assert.equal(feature(id).runtimeSupport.adapter, "resource-only", id);
    assert.equal(feature(id).resourceCosts.length, 1, id);
  }
});

test("Portento spende un dado di preveggenza (tre dal 14°)", () => {
  const { activation } = activate("mago-scuola-di-divinazione-portento", {
    build: wizard(14, "mago-scuola-di-divinazione"),
  });
  assert.equal(activation.state.resources["mago-portento-dadi"].maximum, 3);
  assert.equal(activation.state.resources["mago-portento-dadi"].current, 2);
});

test("Terzo Occhio chiede il beneficio e resta fino al riposo", () => {
  const value = feature("mago-scuola-di-divinazione-terzo-occhio");
  assert.equal(classFeatureRequiresActivationChoice(value), true);
  const { activation, conditions } = activate(value.id, {
    build: wizard(10, "mago-scuola-di-divinazione"),
    choiceId: "invisibilita",
  });
  assert.equal(conditions[0].displayLabel, "Terzo Occhio · Vedere Invisibilità");
  assert.equal(activation.instance.expiresRound ?? null, null);
});

test("Sguardo Ipnotico non usa il pool sorgente: il limite RAW è per creatura", () => {
  const value = feature("mago-scuola-di-ammaliamento-sguardo-ipnotico");
  assert.deepEqual(value.resourceCosts, []);
  assert.equal((value.trackedResourcePoolIds || []).length, 0);
  const { conditions } = activate(value.id, {
    build: wizard(2, "mago-scuola-di-ammaliamento"),
    targetIds: ["guard"],
  });
  assert.equal(conditions[0].mechanics.endsOnDamage, true);
  assert.equal(resolveMovementProfile(9, conditions).speedMeters, 0);
  const instinctive = feature("mago-scuola-di-ammaliamento-fascino-istintivo");
  assert.equal(classFeatureIsReferenceOnly(instinctive), true);
  assert.equal((instinctive.trackedResourcePoolIds || []).length, 0);
});

test("Melodia della Lama aggiunge 3 m per 10 round", () => {
  const { activation, conditions } = activate("mago-canto-della-lama-melodia-della-lama", {
    build: wizard(2, "mago-canto-della-lama"),
  });
  assert.equal(activation.instance.expiresRound, 10);
  assert.equal(resolveMovementProfile(9, conditions).speedMeters, 12);
});

test("Recupero Arcano conserva la decisione del batch Invocazione", () => {
  const recovery = feature("mago-recupero-arcano");
  assert.equal(classFeatureIsReferenceOnly(recovery), true);
  assert.equal(classFeatureRuntimeSupport(recovery).ready, false);
});
