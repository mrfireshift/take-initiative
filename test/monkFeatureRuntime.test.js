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
  planClassFeatureActivation,
} from "../src/classFeatureCore.js";
import { resolveMovementProfile } from "../src/movementProfileCore.js";

const KI = "monaco-punti-ki";

function feature(id) {
  const value = CLASS_FEATURE_BY_ID.get(id);
  assert.ok(value, id);
  return value;
}

function monk(level, subclassId = "") {
  return [{ classId: "monaco", level, ...(subclassId ? { subclassId } : {}) }];
}

function activate(id, { build, targetIds = [], instanceId = `${id}-1` }) {
  const value = feature(id);
  const activation = planClassFeatureActivation({
    state: null,
    feature: value,
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: build,
    sourceId: "monk",
    targetIds,
    currentRound: 1,
    currentTurnKey: "1:monk",
    instanceId,
  });
  assert.equal(activation.ok, true, `${id}: ${activation.reason || ""}`);
  return {
    activation,
    conditions: classFeatureConditionInstancesForActivation(value, activation.instance, "Kaito", build),
  };
}

// Costo in Ki RAW e adapter di ogni capacità del batch.
const KI_COSTS = {
  "monaco-ki-difesa-paziente": [1, "condition"],
  "monaco-ki-passo-del-vento": [1, "resource-only"],
  "monaco-ki-raffica-di-colpi": [1, "resource-only"],
  "monaco-colpo-stordente": [1, "condition"],
  "monaco-anima-adamantina": [1, "resource-only"],
  "monaco-corpo-vuoto": [4, "condition"],
  "monaco-via-della-mano-aperta-palmo-tremante": [3, "condition"],
  "monaco-via-del-kensei-tutt-uno-con-la-lama": [1, "resource-only"],
  "monaco-via-dell-ombra-arti-dell-ombra": [2, "resource-only"],
  "monaco-via-dei-quattro-elementi-discipline-elementali-forma-del-fiume-fluente": [1, "resource-only"],
  "monaco-via-dei-quattro-elementi-discipline-elementali-frusta-d-acqua": [2, "resource-only"],
  "monaco-via-dei-quattro-elementi-discipline-elementali-pugno-dell-aria-inviolabile": [2, "resource-only"],
  "monaco-via-dei-quattro-elementi-discipline-elementali-zanne-del-serpente-di-fuoco": [1, "condition"],
  "monaco-via-dei-quattro-elementi-discipline-elementali-colpo-della-cenere-turbinante": [2, "resource-only"],
  "monaco-via-dei-quattro-elementi-discipline-elementali-pugno-dei-quattro-tuoni": [2, "resource-only"],
  "monaco-via-dei-quattro-elementi-discipline-elementali-spiriti-della-burrasca-impetuosa": [2, "resource-only"],
  "monaco-via-dei-quattro-elementi-discipline-elementali-gong-della-sommita": [3, "resource-only"],
  "monaco-via-dei-quattro-elementi-discipline-elementali-morsa-del-vento-del-nord": [3, "resource-only"],
  "monaco-via-dei-quattro-elementi-discipline-elementali-cavalcare-il-vento": [4, "resource-only"],
  "monaco-via-dei-quattro-elementi-discipline-elementali-fiamme-della-fenice": [4, "resource-only"],
  "monaco-via-dei-quattro-elementi-discipline-elementali-postura-della-nebbia": [4, "resource-only"],
  "monaco-via-dei-quattro-elementi-discipline-elementali-difesa-della-montagna-eterna": [5, "resource-only"],
  "monaco-via-dei-quattro-elementi-discipline-elementali-fiume-della-fiamma-famelica": [5, "resource-only"],
  "monaco-via-dei-quattro-elementi-discipline-elementali-onda-della-terra-tumultuosa": [6, "resource-only"],
  "monaco-via-dei-quattro-elementi-discipline-elementali-soffio-dell-inverno": [6, "resource-only"],
  "monaco-via-del-maestro-ubriaco-andatura-ondeggiante": [1, "resource-only"],
  "monaco-via-del-maestro-ubriaco-fortuna-dell-ubriacone": [2, "resource-only"],
  "monaco-via-dell-anima-solare-dardo-del-sole-radioso": [1, "resource-only"],
  "monaco-via-dell-anima-solare-colpo-dell-onda-incandescente": [2, "resource-only"],
  "monaco-via-della-misericordia-mano-del-dolore": [1, "resource-only"],
  "monaco-via-della-misericordia-mano-guaritrice": [1, "resource-only"],
  "monaco-via-della-misericordia-mano-della-misericordia-suprema": [5, "resource-only"],
  "monaco-via-del-se-astrale-braccia-del-se-astrale": [1, "condition"],
  "monaco-via-del-se-astrale-volto-del-se-astrale": [1, "condition"],
  "monaco-via-del-se-astrale-se-astrale-risvegliato": [5, "condition"],
};

// Capacità del batch senza costo in Ki.
const FREE = [
  "monaco-via-della-mano-aperta-tranquillita",
  "monaco-via-del-kensei-cammino-del-kensei-parata-agile",
  "monaco-via-del-kensei-cammino-del-kensei-tiro-del-kensei",
  "monaco-via-dell-ombra-passo-dell-ombra",
  "monaco-via-dell-ombra-manto-di-ombre",
  "monaco-via-del-maestro-ubriaco-tecnica-dell-ubriaco",
  "monaco-via-della-misericordia-tocco-del-medico",
];

test("Monaco: il batch implementa 42 capacità senza adapter nuovi", () => {
  const implemented = CLASS_FEATURE_CATALOG.features.filter((entry) =>
    entry.classId === "monaco" && entry.runtimeSupport.status === "implemented"
  );
  assert.equal(implemented.length, 42);
  assert.equal(Object.keys(KI_COSTS).length + FREE.length, 42);
});

test("ogni capacità spende il Ki RAW con un costo fisso", () => {
  for (const [id, [amount, adapter]] of Object.entries(KI_COSTS)) {
    const value = feature(id);
    assert.equal(value.runtimeSupport.adapter, adapter, id);
    const ki = value.resourceCosts.find((cost) => cost.poolId === KI);
    assert.equal(ki?.amount, amount, id);
    assert.notEqual(ki?.variable, true, id);
  }
  for (const id of FREE) {
    assert.equal(feature(id).runtimeSupport.adapter, "condition", id);
    assert.deepEqual(feature(id).resourceCosts, [], id);
  }
});

test("Difesa Paziente e Colpo Stordente scadono al prossimo turno del monaco", () => {
  const build = monk(5);
  const dodge = activate("monaco-ki-difesa-paziente", { build, targetIds: ["monk"] });
  assert.equal(dodge.activation.state.resources[KI].current, 4);
  assert.equal(dodge.conditions[0].condition, "Schivata");
  assert.equal(dodge.conditions[0].expiry.mode, "turn-start");

  const stun = activate("monaco-colpo-stordente", { build, targetIds: ["ogre"], instanceId: "stun-1" });
  assert.equal(stun.conditions[0].condition, "Stordito");
  assert.equal(stun.conditions[0].expiry.mode, "turn-end");
  assert.equal(stun.conditions[0].expiry.anchor, "next-turn");
});

test("le discipline che lanciano incantesimi spendono il Ki senza pill", () => {
  const { activation, conditions } = activate(
    "monaco-via-dei-quattro-elementi-discipline-elementali-fiamme-della-fenice",
    { build: monk(11, "monaco-via-dei-quattro-elementi") },
  );
  assert.equal(activation.state.resources[KI].current, 7);
  assert.equal(conditions.length, 0);
});

test("Mano della Misericordia Suprema spende l'uso giornaliero e 5 Ki", () => {
  const { activation } = activate("monaco-via-della-misericordia-mano-della-misericordia-suprema", {
    build: monk(17, "monaco-via-della-misericordia"),
  });
  assert.equal(activation.state.resources[KI].current, 12);
  assert.equal(
    activation.state.resources["monaco-via-della-misericordia-mano-della-misericordia-suprema-usi"].current,
    0,
  );
});

test("Tecnica dell'Ubriaco aggiunge 3 m fino alla fine del turno", () => {
  const { conditions } = activate("monaco-via-del-maestro-ubriaco-tecnica-dell-ubriaco", {
    build: monk(3, "monaco-via-del-maestro-ubriaco"),
    targetIds: ["monk"],
  });
  assert.equal(resolveMovementProfile(12, conditions).speedMeters, 15);
  assert.equal(conditions[0].expiry.mode, "turn-end");
});

test("Palmo Tremante e Tranquillità restano finché il GM non le termina", () => {
  const palm = activate("monaco-via-della-mano-aperta-palmo-tremante", {
    build: monk(17, "monaco-via-della-mano-aperta"),
    targetIds: ["dragon"],
  });
  assert.equal(palm.activation.state.resources[KI].current, 14);
  assert.equal(palm.activation.instance.expiresRound ?? null, null);
  const calm = activate("monaco-via-della-mano-aperta-tranquillita", {
    build: monk(11, "monaco-via-della-mano-aperta"),
    targetIds: ["monk"],
    instanceId: "calm-1",
  });
  assert.equal(calm.conditions[0].displayLabel, "Santuario · Tranquillità");
});

test("costi variabili e capacità gratuite non diventano azioni", () => {
  // Affilare la Lama spende 1-3 Ki a scelta: serve la primitiva value-input.
  assert.equal(classFeatureRuntimeSupport(feature("monaco-via-del-kensei-affilare-la-lama")).ready, false);
  for (const id of [
    "monaco-via-del-kensei-cammino-del-kensei",
    "monaco-via-dell-anima-solare-esplosione-solare-incandescente",
    "monaco-deviare-proiettili",
  ]) {
    assert.equal(classFeatureIsReferenceOnly(feature(id)), true, id);
  }
});
