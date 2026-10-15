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

function ranger(level, subclassId) {
  return [{ classId: "ranger", level, subclassId }];
}

function activate(id, { build, targetIds = ["ranger"], choiceId = "", instanceId = `${id}-1` }) {
  const activation = planClassFeatureActivation({
    state: null,
    feature: feature(id),
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: build,
    sourceId: "ranger",
    targetIds,
    currentRound: 1,
    currentTurnKey: "1:ranger",
    instanceId,
    choiceId,
  });
  assert.equal(activation.ok, true, `${id}: ${activation.reason || ""}`);
  return {
    activation,
    conditions: classFeatureConditionInstancesForActivation(feature(id), activation.instance, "Tamsin", build),
  };
}

const CONDITIONS = {
  "ranger-signore-delle-bestie-compagno-del-ranger": "Compagno del Ranger",
  "ranger-cacciatore-delle-tenebre-imboscata-terrificante": "Imboscata Terrificante",
  "ranger-uccisore-di-mostri-preda-dell-uccisore": "Preda dell'Uccisore",
  "ranger-viandante-dell-orizzonte-combattente-planare": "Combattente Planare",
  "ranger-viandante-dell-orizzonte-passo-etereo": "Forma Eterea",
  "ranger-viandante-fatato-scambio-seducente": "Affascinato",
  "ranger-custode-degli-sciami-marea-avvolgente": "Marea Avvolgente",
};

const RESOURCE_ONLY = [
  "ranger-uccisore-di-mostri-nemesi-degli-incantatori",
  "ranger-viandante-dell-orizzonte-individuazione-dei-portali",
  "ranger-viandante-fatato-rinforzi-fatati",
];

test("Ranger: il batch implementa 10 capacità senza adapter nuovi", () => {
  const implemented = CLASS_FEATURE_CATALOG.features.filter((entry) =>
    entry.classId === "ranger" && entry.runtimeSupport.status === "implemented"
  );
  assert.equal(implemented.length, 10);
  for (const [id, conditionName] of Object.entries(CONDITIONS)) {
    assert.equal(feature(id).runtimeSupport.adapter, "condition", id);
    assert.equal(feature(id).effectPlan.conditionName, conditionName, id);
  }
  for (const id of RESOURCE_ONLY) {
    assert.equal(feature(id).runtimeSupport.adapter, "resource-only", id);
    assert.equal(feature(id).resourceCosts.length, 1, id);
  }
});

test("il Compagno del Ranger è una pill senza scadenza sul token della bestia", () => {
  const { activation, conditions } = activate("ranger-signore-delle-bestie-compagno-del-ranger", {
    build: ranger(3, "ranger-signore-delle-bestie"),
    targetIds: ["wolf"],
  });
  assert.equal(conditions[0].targetId, "wolf");
  assert.equal(activation.instance.expiresRound ?? null, null);
});

test("Passo Etereo spende l'uso e dura fino alla fine del turno", () => {
  const { activation, conditions } = activate("ranger-viandante-dell-orizzonte-passo-etereo", {
    build: ranger(7, "ranger-viandante-dell-orizzonte"),
  });
  assert.equal(activation.state.resources["ranger-viandante-dell-orizzonte-passo-etereo-usi"].current, 0);
  assert.equal(conditions[0].expiry.mode, "turn-end");
});

test("Scambio Seducente chiede affascinato o spaventato", () => {
  const value = feature("ranger-viandante-fatato-scambio-seducente");
  assert.equal(classFeatureRequiresActivationChoice(value), true);
  const { conditions } = activate(value.id, {
    build: ranger(7, "ranger-viandante-fatato"),
    targetIds: ["hag"],
    choiceId: "spaventato",
  });
  assert.equal(conditions[0].condition, "Spaventato");
});

test("Imboscata Terrificante e Marea Avvolgente modificano il movimento", () => {
  const ambush = activate("ranger-cacciatore-delle-tenebre-imboscata-terrificante", {
    build: ranger(3, "ranger-cacciatore-delle-tenebre"),
  });
  assert.equal(resolveMovementProfile(9, ambush.conditions).speedMeters, 12);
  const swarm = activate("ranger-custode-degli-sciami-marea-avvolgente", {
    build: ranger(7, "ranger-custode-degli-sciami"),
    instanceId: "swarm-1",
  });
  assert.equal(resolveMovementProfile(9, swarm.conditions, [], "fly").modes.fly.speedMeters, 3);
});

test("le capacità senza pool o con usi legati alla Saggezza restano fuori", () => {
  assert.equal(classFeatureRuntimeSupport(feature("ranger-viandante-fatato-viandante-velato")).ready, false);
  for (const id of [
    "ranger-custode-degli-sciami-sciame-possente",
    "ranger-uccisore-di-mostri-percezione-del-cacciatore",
    "ranger-custode-degli-sciami-dispersione-brulicante",
  ]) {
    assert.equal(classFeatureIsReferenceOnly(feature(id)), true, id);
  }
});
