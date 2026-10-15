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
  classFeatureEffectProjection,
  classFeatureRequiresActivationChoice,
  planClassFeatureActivation,
} from "../src/classFeatureCore.js";
import { resolveMovementProfile } from "../src/movementProfileCore.js";

function feature(id) {
  const value = CLASS_FEATURE_BY_ID.get(id);
  assert.ok(value, id);
  return value;
}

function warlock(level, subclassId = "") {
  return [{ classId: "warlock", level, ...(subclassId ? { subclassId } : {}) }];
}

function activate(id, { build, targetIds = [], choiceId = "", instanceId = `${id}-1` }) {
  const value = feature(id);
  const activation = planClassFeatureActivation({
    state: null,
    feature: value,
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: build,
    sourceId: "warlock",
    targetIds,
    currentRound: 1,
    currentTurnKey: "1:warlock",
    instanceId,
    choiceId,
  });
  assert.equal(activation.ok, true, `${id}: ${activation.reason || ""}`);
  return {
    activation,
    conditions: classFeatureConditionInstancesForActivation(value, activation.instance, "Vesper", build),
  };
}

// Pill attese per ogni capacità del batch con adapter condition.
const CONDITIONS = {
  "warlock-il-signore-fatato-presenza-fatata": "Affascinato",
  "warlock-il-signore-fatato-fuga-velata": "Invisibile",
  "warlock-il-signore-fatato-difese-seducenti": "Affascinato",
  "warlock-il-signore-fatato-delirio-oscuro": "Affascinato",
  "warlock-il-grande-antico-creare-servitore": "Affascinato",
  "warlock-la-lama-del-sortilegio-maledizione-della-lama-del-sortilegio": "Maledizione della Lama del Sortilegio",
  "warlock-il-genio-dono-elementale": "Dono Elementale",
  "warlock-l-insondabile-tentacoli-delle-profondita": "Tentacolo delle Profondità",
  "warlock-l-immondo-scagliare-all-inferno": "Scagliato all'Inferno",
  "warlock-suppliche-occulte-lancia-della-letargia": "Lancia della Letargia",
  "warlock-suppliche-occulte-sguardo-fantasma": "Sguardo Fantasma",
  "warlock-suppliche-occulte-tomba-di-levistus": "Tomba di Levistus",
};

const RESOURCE_ONLY = [
  "warlock-il-grande-antico-interdizione-entropica",
  "warlock-la-lama-del-sortilegio-spettro-maledetto",
  "warlock-il-celestiale-vendetta-incandescente",
  "warlock-il-genio-recipiente-del-genio",
  "warlock-l-insondabile-presa-dei-tentacoli",
  "warlock-l-insondabile-immersione-insondabile",
];

test("Warlock: il batch implementa 19 capacità senza adapter nuovi", () => {
  const implemented = CLASS_FEATURE_CATALOG.features.filter((entry) =>
    entry.classId === "warlock" && entry.runtimeSupport.status === "implemented"
  );
  assert.equal(implemented.length, 19);
  assert.equal(Object.keys(CONDITIONS).length + RESOURCE_ONLY.length + 1, 19);
  for (const [id, conditionName] of Object.entries(CONDITIONS)) {
    assert.equal(feature(id).runtimeSupport.adapter, "condition", id);
    assert.equal(feature(id).effectPlan.conditionName, conditionName, id);
  }
  for (const id of RESOURCE_ONLY) {
    assert.equal(feature(id).runtimeSupport.adapter, "resource-only", id);
    assert.equal(feature(id).resourceCosts.length, 1, id);
  }
});

test("Presenza Fatata chiede affascinato o spaventato e spende l'uso", () => {
  const value = feature("warlock-il-signore-fatato-presenza-fatata");
  assert.equal(classFeatureRequiresActivationChoice(value), true);
  const build = warlock(1, "warlock-il-signore-fatato");
  const scared = activate(value.id, { build, targetIds: ["orc-1", "orc-2"], choiceId: "spaventato" });
  assert.equal(scared.activation.state.resources["warlock-il-signore-fatato-presenza-fatata-usi"].current, 0);
  assert.deepEqual(scared.conditions.map((entry) => entry.condition), ["Spaventato", "Spaventato"]);
  assert.equal(scared.conditions[0].expiry.anchor, "next-turn");

  const charmed = activate(value.id, {
    build,
    targetIds: ["orc-1"],
    choiceId: "affascinato",
    instanceId: "fey-2",
  });
  assert.equal(charmed.conditions[0].displayLabel, "Affascinato · Presenza Fatata");
});

test("Delirio Oscuro termina con il danno", () => {
  const { conditions } = activate("warlock-il-signore-fatato-delirio-oscuro", {
    build: warlock(14, "warlock-il-signore-fatato"),
    targetIds: ["mage"],
    choiceId: "spaventato",
  });
  assert.equal(conditions[0].condition, "Spaventato");
  assert.equal(conditions[0].mechanics.endsOnDamage, true);
});

test("Maledizione della Lama del Sortilegio dura 10 round sul bersaglio", () => {
  const { activation, conditions } = activate(
    "warlock-la-lama-del-sortilegio-maledizione-della-lama-del-sortilegio",
    { build: warlock(1, "warlock-la-lama-del-sortilegio"), targetIds: ["knight"] },
  );
  assert.equal(activation.instance.expiresRound, 10);
  assert.equal(conditions[0].targetId, "knight");
});

test("Dono Elementale concede volo 9 m; Lancia della Letargia riduce la velocità", () => {
  const flight = activate("warlock-il-genio-dono-elementale", {
    build: warlock(6, "warlock-il-genio"),
    targetIds: ["warlock"],
  });
  assert.equal(resolveMovementProfile(9, flight.conditions, [], "fly").modes.fly.speedMeters, 9);

  const lethargy = activate("warlock-suppliche-occulte-lancia-della-letargia", {
    build: warlock(2),
    targetIds: ["ogre"],
  });
  assert.equal(resolveMovementProfile(12, lethargy.conditions).speedMeters, 9);
});

test("Creare Servitore resta finché il GM non lo termina", () => {
  const { activation, conditions } = activate("warlock-il-grande-antico-creare-servitore", {
    build: warlock(14, "warlock-il-grande-antico"),
    targetIds: ["guard"],
  });
  assert.equal(conditions[0].displayLabel, "Affascinato · Servitore");
  assert.equal(activation.instance.expiresRound ?? null, null);
});

test("Mantello di Mosche è un'aura di 1,5 m con promemoria a inizio turno", () => {
  const value = feature("warlock-suppliche-occulte-mantello-di-mosche");
  assert.equal(value.runtimeSupport.adapter, "aura");
  const projection = classFeatureEffectProjection(value, "", warlock(5));
  assert.equal(projection.radiusMeters, 1.5);
  assert.equal(projection.membershipTargeting.filter, "all");
  assert.equal(projection.triggerPolicy.triggers[0].event, "turn-start");
});

test("le Suppliche che lanciano incantesimi restano carte descrittive", () => {
  for (const id of [
    "warlock-suppliche-occulte-presagio-di-sventura",
    "warlock-suppliche-occulte-armatura-delle-ombre",
    "warlock-suppliche-occulte-sortilegio-della-pazzia",
    "warlock-la-lama-del-sortilegio-armatura-dei-sortilegi",
  ]) {
    assert.equal(classFeatureIsReferenceOnly(feature(id)), true, id);
  }
  // Luce Guaritrice spende un numero variabile di dadi: primitiva value-input.
  assert.equal(classFeatureRuntimeSupport(feature("warlock-il-celestiale-luce-guaritrice")).ready, false);
});
