import test from "node:test";
import assert from "node:assert/strict";

import {
  CLASS_FEATURE_BY_ID,
  CLASS_FEATURE_CATALOG,
  CLASS_FEATURE_RESOURCE_POOL_BY_ID,
  buildClassFeatureQuickActions,
  classFeatureIsReferenceOnly,
  classFeatureRuntimeSupport,
} from "../src/classFeatureCatalog.js";
import {
  classFeatureConditionInstancesForActivation,
  planClassFeatureActivation,
} from "../src/classFeatureCore.js";
import { resolveMovementProfile } from "../src/movementProfileCore.js";

const SUPERIORITY = "guerriero-dadi-superiorita";
const ARCANE_SHOT = "guerriero-arciere-arcano-tiro-arcano-usi";
const PSIONIC = "guerriero-guerriero-psionico-potere-psionico-usi";

function feature(id) {
  const value = CLASS_FEATURE_BY_ID.get(id);
  assert.ok(value, id);
  return value;
}

function fighter(level, subclassId = "") {
  return [{ classId: "guerriero", level, ...(subclassId ? { subclassId } : {}) }];
}

function activate(id, { build, targetIds = [], state = null, instanceId = `${id}-1` }) {
  const value = feature(id);
  const activation = planClassFeatureActivation({
    state,
    feature: value,
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: build,
    sourceId: "fighter",
    targetIds,
    currentRound: 1,
    currentTurnKey: "1:fighter",
    instanceId,
  });
  assert.equal(activation.ok, true, `${id}: ${activation.reason || ""}`);
  return {
    activation,
    conditions: classFeatureConditionInstancesForActivation(
      value,
      activation.instance,
      "Bryn",
      build,
    ),
  };
}

test("Guerriero: il batch implementa 38 capacità senza adapter nuovi", () => {
  const implemented = CLASS_FEATURE_CATALOG.features.filter((entry) =>
    entry.classId === "guerriero" && entry.runtimeSupport.status === "implemented"
  );
  assert.equal(implemented.length, 38);
  const adapters = new Set(implemented.map((entry) => entry.runtimeSupport.adapter));
  assert.deepEqual([...adapters].sort(), ["condition", "resource-only"]);
});

// Pill attese per ogni capacità del batch con adapter condition.
const CONDITIONS = {
  "guerriero-maestro-di-battaglia-manovre-attacco-adescante": ["Attacco Adescante", "single-target"],
  "guerriero-maestro-di-battaglia-manovre-attacco-minaccioso": ["Spaventato", "single-target"],
  "guerriero-maestro-di-battaglia-manovre-colpo-distraente": ["Colpo Distraente", "single-target"],
  "guerriero-arciere-arcano-tiro-arcano-freccia-afferrante": ["Rovi Afferranti", "single-target"],
  "guerriero-arciere-arcano-tiro-arcano-freccia-ammaliante": ["Affascinato", "single-target"],
  "guerriero-arciere-arcano-tiro-arcano-freccia-d-ombra": ["Freccia d'Ombra", "single-target"],
  "guerriero-arciere-arcano-tiro-arcano-freccia-esiliante": ["Esiliato", "single-target"],
  "guerriero-arciere-arcano-tiro-arcano-freccia-indebolente": ["Freccia Indebolente", "single-target"],
  "guerriero-cavaliere-runico-potenza-del-gigante": ["Potenza del Gigante", "self"],
  "guerriero-cavaliere-runico-intagliatore-di-rune-runa-del-fuoco": ["Trattenuto", "single-target"],
  "guerriero-cavaliere-runico-intagliatore-di-rune-runa-del-gelo": ["Runa del Gelo", "self"],
  "guerriero-cavaliere-runico-intagliatore-di-rune-runa-della-pietra": ["Affascinato", "single-target"],
  "guerriero-cavaliere-runico-intagliatore-di-rune-runa-delle-colline": ["Runa delle Colline", "self"],
  "guerriero-cavaliere-runico-intagliatore-di-rune-runa-delle-tempeste": ["Stato Profetico", "self"],
  "guerriero-guerriero-psionico-baluardo-della-forza": ["Baluardo della Forza", "single-target"],
  "guerriero-cavaliere-errante-marchio-incrollabile": ["Marchio Incrollabile", "single-target"],
};

const RESOURCE_ONLY = [
  "guerriero-azione-impetuosa",
  "guerriero-indomito",
  "guerriero-cavaliere-runico-scudo-runico",
  "guerriero-samurai-forza-di-fronte-alla-morte",
  "guerriero-guerriero-psionico-potere-psionico-campo-protettivo",
  "guerriero-guerriero-psionico-potere-psionico-colpo-psionico",
  "guerriero-arciere-arcano-tiro-arcano-freccia-cercatrice",
  "guerriero-arciere-arcano-tiro-arcano-freccia-esplosiva",
  "guerriero-arciere-arcano-tiro-arcano-freccia-perforante",
  "guerriero-maestro-di-battaglia-manovre-attacco-con-affondo",
  "guerriero-maestro-di-battaglia-manovre-attacco-con-finta",
  "guerriero-maestro-di-battaglia-manovre-attacco-con-manovra",
  "guerriero-maestro-di-battaglia-manovre-attacco-con-spazzata",
  "guerriero-maestro-di-battaglia-manovre-attacco-con-spinta",
  "guerriero-maestro-di-battaglia-manovre-attacco-disarmante",
  "guerriero-maestro-di-battaglia-manovre-attacco-preciso",
  "guerriero-maestro-di-battaglia-manovre-attacco-sbilanciante",
  "guerriero-maestro-di-battaglia-manovre-colpo-del-comandante",
  "guerriero-maestro-di-battaglia-manovre-incoraggiamento",
  "guerriero-maestro-di-battaglia-manovre-parata",
  "guerriero-maestro-di-battaglia-manovre-replica",
  "guerriero-maestro-di-battaglia-manovre-scarto-elusivo",
];

test("ogni capacità del batch dichiara adapter, pill e bersaglio attesi", () => {
  assert.equal(Object.keys(CONDITIONS).length + RESOURCE_ONLY.length, 38);
  for (const [id, [conditionName, mode]] of Object.entries(CONDITIONS)) {
    const value = feature(id);
    assert.equal(value.runtimeSupport.adapter, "condition", id);
    assert.equal(value.effectPlan.conditionName, conditionName, id);
    assert.equal(value.targeting.mode, mode, id);
    assert.equal(value.trackingMode, "active", id);
  }
  for (const id of RESOURCE_ONLY) {
    const value = feature(id);
    assert.equal(value.runtimeSupport.adapter, "resource-only", id);
    assert.equal(value.trackingMode, "instant", id);
    assert.ok(value.resourceCosts.length > 0, id);
  }
});

test("Azione Impetuosa e Indomito consumano il proprio pool senza pill", () => {
  for (const [id, poolId, level] of [
    ["guerriero-azione-impetuosa", "guerriero-azione-impetuosa-usi", 2],
    ["guerriero-indomito", "guerriero-indomito-usi", 9],
  ]) {
    const { activation, conditions } = activate(id, { build: fighter(level) });
    assert.equal(activation.state.resources[poolId].current, 0, id);
    assert.equal(conditions.length, 0, id);
    assert.equal(activation.state.instances.length, 0, id);
  }
  const quickActions = buildClassFeatureQuickActions({ characterBuild: fighter(9) })
    .map((entry) => entry.featureId);
  assert.ok(quickActions.includes("guerriero-azione-impetuosa"));
  assert.ok(quickActions.includes("guerriero-indomito"));
});

test("ogni manovra spende un dado di Superiorità", () => {
  const maneuvers = CLASS_FEATURE_CATALOG.features.filter((entry) =>
    entry.id.startsWith("guerriero-maestro-di-battaglia-manovre-")
  );
  assert.equal(maneuvers.length, 16);
  for (const maneuver of maneuvers) {
    assert.equal(classFeatureRuntimeSupport(maneuver).ready, true, maneuver.id);
    assert.deepEqual(maneuver.resourceCosts, [{ poolId: SUPERIORITY, amount: 1 }], maneuver.id);
    assert.equal(maneuver.defaultEnabled, false, maneuver.id);
  }
  const build = fighter(3, "guerriero-maestro-di-battaglia");
  const { activation } = activate("guerriero-maestro-di-battaglia-manovre-parata", { build });
  assert.equal(activation.state.resources[SUPERIORITY].current, 3);
  assert.equal(activation.state.resources[SUPERIORITY].maximum, 4);
});

test("Attacco Minaccioso applica Spaventato fino alla fine del prossimo turno", () => {
  const { activation, conditions } = activate(
    "guerriero-maestro-di-battaglia-manovre-attacco-minaccioso",
    { build: fighter(3, "guerriero-maestro-di-battaglia"), targetIds: ["goblin"] },
  );
  assert.equal(activation.state.resources[SUPERIORITY].current, 3);
  assert.equal(conditions.length, 1);
  assert.equal(conditions[0].condition, "Spaventato");
  assert.equal(conditions[0].targetId, "goblin");
  assert.equal(conditions[0].expiry.mode, "turn-end");
  assert.equal(conditions[0].expiry.anchor, "next-turn");
  assert.match(conditions[0].effectDetail, /TS superato/u);
});

test("Tiro Arcano è un contenitore: le frecce spendono il pool", () => {
  const parent = feature("guerriero-arciere-arcano-tiro-arcano");
  assert.equal(classFeatureIsReferenceOnly(parent), true);
  assert.deepEqual(parent.resourceCosts, []);
  assert.deepEqual(parent.trackedResourcePoolIds, [ARCANE_SHOT]);

  const build = fighter(3, "guerriero-arciere-arcano");
  const { activation, conditions } = activate(
    "guerriero-arciere-arcano-tiro-arcano-freccia-afferrante",
    { build, targetIds: ["ogre"] },
  );
  assert.equal(activation.state.resources[ARCANE_SHOT].current, 1);
  assert.equal(conditions[0].condition, "Rovi Afferranti");
  assert.equal(resolveMovementProfile(9, conditions).speedMeters, 6);

  const banished = activate(
    "guerriero-arciere-arcano-tiro-arcano-freccia-esiliante",
    { build, targetIds: ["ogre"], instanceId: "banish-1" },
  );
  assert.equal(banished.conditions[0].condition, "Esiliato");
  assert.equal(resolveMovementProfile(9, banished.conditions).speedMeters, 0);
});

test("le rune del Cavaliere Runico applicano le pill RAW", () => {
  const build = fighter(7, "guerriero-cavaliere-runico");
  const stone = activate(
    "guerriero-cavaliere-runico-intagliatore-di-rune-runa-della-pietra",
    { build, targetIds: ["troll"] },
  );
  assert.equal(stone.conditions[0].condition, "Affascinato");
  assert.equal(resolveMovementProfile(9, stone.conditions).speedMeters, 0);

  const frost = activate(
    "guerriero-cavaliere-runico-intagliatore-di-rune-runa-del-gelo",
    { build, targetIds: ["fighter"] },
  );
  assert.equal(frost.conditions[0].targetId, "fighter");
  // 10 minuti = 100 round, contando il round di attivazione.
  assert.equal(frost.activation.instance.expiresRound, 100);

  const giant = activate("guerriero-cavaliere-runico-potenza-del-gigante", {
    build,
    targetIds: ["fighter"],
  });
  assert.equal(
    giant.activation.state.resources["guerriero-cavaliere-runico-potenza-del-gigante-usi"].current,
    2,
  );
});

test("Baluardo della Forza accetta più bersagli, guerriero incluso", () => {
  const { conditions } = activate("guerriero-guerriero-psionico-baluardo-della-forza", {
    build: fighter(15, "guerriero-guerriero-psionico"),
    targetIds: ["fighter", "ally-1", "ally-2"],
  });
  assert.deepEqual(conditions.map((entry) => entry.targetId).sort(), ["ally-1", "ally-2", "fighter"]);
  assert.equal(conditions[0].displayLabel, "Mezza copertura");
});

test("le opzioni di Potere Psionico spendono un dado di Energia Psionica", () => {
  const build = fighter(3, "guerriero-guerriero-psionico");
  const { activation } = activate(
    "guerriero-guerriero-psionico-potere-psionico-colpo-psionico",
    { build },
  );
  assert.equal(activation.state.resources[PSIONIC].maximum, 4);
  assert.equal(activation.state.resources[PSIONIC].current, 3);
  assert.equal(
    classFeatureIsReferenceOnly(feature("guerriero-guerriero-psionico-potere-psionico")),
    true,
  );
});

test("le capacità non rappresentabili restano carte descrittive", () => {
  for (const id of [
    "guerriero-cavaliere-errante-mantenere-la-posizione",
    "guerriero-cavaliere-mistico-arma-vincolata",
    "guerriero-cavaliere-runico-colosso-runico",
    "guerriero-guerriero-psionico-adepto-telecinetico",
  ]) {
    assert.equal(classFeatureIsReferenceOnly(feature(id)), true, id);
  }
  // Recuperare Energie aspetta la primitiva value-input.
  assert.equal(classFeatureRuntimeSupport(feature("guerriero-recuperare-energie")).ready, false);
});
