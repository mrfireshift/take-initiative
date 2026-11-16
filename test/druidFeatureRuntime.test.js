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

const WILD_SHAPE = "druido-forma-selvatica-usi";

function feature(id) {
  const value = CLASS_FEATURE_BY_ID.get(id);
  assert.ok(value, id);
  return value;
}

function druid(level, subclassId = "") {
  return [{ classId: "druido", level, ...(subclassId ? { subclassId } : {}) }];
}

function plan(id, { build, state = null, targetIds = ["druid"], choiceId = "", instanceId = `${id}-1` }) {
  return planClassFeatureActivation({
    state,
    feature: feature(id),
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: build,
    sourceId: "druid",
    targetIds,
    currentRound: 1,
    currentTurnKey: "1:druid",
    instanceId,
    choiceId,
  });
}

function activate(id, options) {
  const activation = plan(id, options);
  assert.equal(activation.ok, true, `${id}: ${activation.reason || ""}`);
  return {
    activation,
    conditions: classFeatureConditionInstancesForActivation(feature(id), activation.instance, "Ilse", options.build),
  };
}

const CONDITIONS = [
  "druido-forma-selvatica",
  "druido-circolo-della-luna-forma-selvatica-elementale",
  "druido-circolo-delle-stelle-forma-siderale",
  "druido-circolo-delle-spore-entita-simbiotica",
  "druido-circolo-delle-spore-diffusione-di-spore",
  "druido-circolo-della-fiamma-evocare-spirito-della-fiamma",
  "druido-circolo-del-pastore-totem-spirituale",
];

const RESOURCE_ONLY = [
  "druido-circolo-delle-stelle-profezia-cosmica",
  "druido-circolo-della-fiamma-fiamme-cauterizzanti",
  "druido-circolo-della-fiamma-recupero-ardente",
  "druido-circolo-del-pastore-evocazioni-fedeli",
  "druido-circolo-dei-sogni-viandante-dei-sogni",
  "druido-circolo-della-terra-recupero-naturale",
];

test("Druido: il batch implementa 13 capacità senza adapter nuovi", () => {
  const implemented = CLASS_FEATURE_CATALOG.features.filter((entry) =>
    entry.classId === "druido" && entry.runtimeSupport.status === "implemented"
  );
  // 13 dal batch, più Infestazione Fungina e Legame Migliorato (P2-dati), Manto di Stelle (difese delle capacità, L2) e la
  // Forma Selvatica da Combattimento (Trasformazioni, lotto W6, con un adapter suo: la cura con lo slot).
  assert.equal(implemented.length, 17);
  assert.equal(CONDITIONS.length + RESOURCE_ONLY.length, 13);
  for (const id of CONDITIONS) assert.equal(feature(id).runtimeSupport.adapter, "condition", id);
  for (const id of RESOURCE_ONLY) {
    assert.equal(feature(id).runtimeSupport.adapter, "resource-only", id);
    assert.equal(feature(id).resourceCosts.length, 1, id);
  }
});

// Trasformazioni, lotto W2a (docs/PIANO_TRASFORMAZIONI.md): la pill porta la trasformazione; la forma la sceglie la
// console (classFeatureUndoIntegration.test.js). Senza forma, come dalla scheda, resta un segnaposto che non tocca i PF.
test("Forma Selvatica senza forma: spende un uso, porta la trasformazione da scegliere e non tocca i PF", () => {
  const { activation, conditions } = activate("druido-forma-selvatica", { build: druid(2) });
  assert.equal(activation.state.resources[WILD_SHAPE].maximum, 2);
  assert.equal(activation.state.resources[WILD_SHAPE].current, 1);
  assert.equal(conditions[0].condition, "Forma Selvatica");
  assert.deepEqual(conditions[0].mechanics, {
    transformation: { kind: "wild-shape", keepsMind: true, keepsFeatures: true, canCast: false },
  });
  assert.match(conditions[0].effectDetail, /La forma si sceglie nella console attacchi, che le dà i suoi PF: a 0 PF il druido torna ai suoi/u);
  assert.equal(activation.instance.expiresRound ?? null, null);
  const elemental = feature("druido-circolo-della-luna-forma-selvatica-elementale");
  assert.equal(elemental.effectPlan.mechanics.transformation.kind, "elemental-wild-shape");
});

test("al 20° livello Forma Selvatica è illimitata", () => {
  const { activation } = activate("druido-forma-selvatica", { build: druid(20) });
  assert.equal(activation.state.resources[WILD_SHAPE].unlimited, true);
});

test("Forma Elementale spende due usi di Forma Selvatica", () => {
  const { activation } = activate("druido-circolo-della-luna-forma-selvatica-elementale", {
    build: druid(10, "druido-circolo-della-luna"),
  });
  assert.equal(activation.state.resources[WILD_SHAPE].current, 0);
});

test("Forma Siderale e Totem Spirituale chiedono la variante", () => {
  const starry = feature("druido-circolo-delle-stelle-forma-siderale");
  assert.equal(classFeatureRequiresActivationChoice(starry), true);
  const { conditions } = activate(starry.id, {
    build: druid(2, "druido-circolo-delle-stelle"),
    choiceId: "drago",
  });
  assert.equal(conditions[0].displayLabel, "Forma Siderale · Drago");

  const totem = activate("druido-circolo-del-pastore-totem-spirituale", {
    build: druid(2, "druido-circolo-del-pastore"),
    choiceId: "orso",
    instanceId: "totem-1",
  });
  assert.equal(totem.conditions[0].displayLabel, "Totem Spirituale · Orso");
  assert.equal(totem.activation.instance.expiresRound, 10);
  for (const id of [
    "druido-circolo-delle-stelle-forma-siderale-calice",
    "druido-circolo-del-pastore-totem-spirituale-spirito-orso",
  ]) {
    assert.equal(classFeatureIsReferenceOnly(feature(id)), true, id);
  }
});

test("Diffusione di Spore richiede Entità Simbiotica attiva", () => {
  const build = druid(10, "druido-circolo-delle-spore");
  const blocked = plan("druido-circolo-delle-spore-diffusione-di-spore", { build });
  assert.equal(blocked.ok, false);

  const symbiotic = activate("druido-circolo-delle-spore-entita-simbiotica", { build });
  const spores = activate("druido-circolo-delle-spore-diffusione-di-spore", {
    build,
    state: symbiotic.activation.state,
    instanceId: "spores-1",
  });
  assert.equal(spores.conditions[0].condition, "Diffusione di Spore");
});

test("le cure variabili e le capacità senza pool restano fuori", () => {
  for (const id of [
    "druido-circolo-dei-sogni-balsamo-della-corte-dell-estate",
    "druido-circolo-dei-sogni-sentieri-nascosti",
  ]) {
    assert.equal(classFeatureRuntimeSupport(feature(id)).ready, false, id);
  }
  for (const id of [
    "druido-circolo-delle-spore-alone-di-spore",
  ]) {
    assert.equal(classFeatureIsReferenceOnly(feature(id)), true, id);
  }
  // Trasformazioni, lotto W6: la cura della Forma Selvatica da Combattimento ha un adapter suo, con lo slot e la forma.
  assert.equal(feature("druido-circolo-della-luna-forma-selvatica-da-combattimento").runtimeSupport.adapter, "wild-shape-slot-heal");
});
