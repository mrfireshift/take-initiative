import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import {
  CLASS_FEATURE_CATALOG,
  buildClassFeatureQuickActions,
  classFeatureIsReferenceOnly,
  classFeatureTargeting,
  getAvailableClassFeatures,
} from "../src/classFeatureCatalog.js";
import {
  activeClassFeatureInstances,
  classFeatureConditionInstancesForActivation,
  classFeatureEffectProjection,
  classFeatureTargetIds,
  planClassFeatureActivation,
  planClassFeatureDeactivation,
} from "../src/classFeatureCore.js";
import { getSpellDefinition } from "../src/spells-srd.js";

const RANGER_CLASS_ID = "ranger-revised";
const BEAST_CONCLAVE = "ranger-revised-conclave-della-bestia";
const HUNTER_CONCLAVE = "ranger-revised-conclave-del-cacciatore";
const DEEP_STALKER_CONCLAVE = "ranger-revised-conclave-del-cacciatore-delle-profondita";
const ASSISTED_IDS = new Set([
  "ranger-revised-nascondersi-in-piena-vista",
  "ranger-revised-conclave-della-bestia-compagno-animale",
]);

const catalog = JSON.parse(fs.readFileSync(
  new URL("../data/class-features/ranger_revised_database_finale.json", import.meta.url),
  "utf8",
));
const mechanics = JSON.parse(fs.readFileSync(
  new URL("../data/class-features/ranger_revised_livello_meccanico_v1_0.json", import.meta.url),
  "utf8",
));
const catalogReport = JSON.parse(fs.readFileSync(
  new URL("../data/class-features/ranger_revised_database_report_finale.json", import.meta.url),
  "utf8",
));
const mechanicsReport = JSON.parse(fs.readFileSync(
  new URL("../data/class-features/ranger_revised_livello_meccanico_report_v1_0.json", import.meta.url),
  "utf8",
));
const manifest = JSON.parse(fs.readFileSync(
  new URL("../data/class-features/ranger_revised_manifest_integrazione.json", import.meta.url),
  "utf8",
));

const sourceRecords = [...catalog.privilegi, ...catalog.opzioni];
const sourceIds = sourceRecords.map((entry) => entry.id);
const rangerFeatures = CLASS_FEATURE_CATALOG.features.filter((entry) =>
  entry.id.startsWith("ranger-revised-"),
);

function feature(id) {
  const entry = rangerFeatures.find((value) => value.id === id);
  assert.ok(entry, `feature ${id} should exist in the generated runtime`);
  return entry;
}

function rangerBuild(level, subclassId = "") {
  return [{ classId: RANGER_CLASS_ID, level, subclassId }];
}

function idsForBuild(level, subclassId = "") {
  return new Set(getAvailableClassFeatures(rangerBuild(level, subclassId)).map((entry) => entry.id));
}

function sha256(url) {
  return crypto.createHash("sha256").update(fs.readFileSync(url)).digest("hex");
}

test("il runtime Ranger Revised espone esattamente i 45 record del catalogo", () => {
  assert.equal(sourceRecords.length, 45);
  assert.equal(new Set(sourceIds).size, 45);
  assert.equal(mechanics.mechanics.length, 45);
  assert.deepEqual(
    mechanics.mechanics.map((entry) => entry.id).sort(),
    sourceIds.slice().sort(),
  );
  assert.equal(rangerFeatures.length, 45);
  assert.deepEqual(
    rangerFeatures.map((entry) => entry.id).sort(),
    sourceIds.slice().sort(),
  );
});

test("i 45 record Ranger Revised restano sempre sulla classe distinta", () => {
  assert.equal(rangerFeatures.every((entry) => entry.classId === RANGER_CLASS_ID), true);
  assert.equal(rangerFeatures.every((entry) => entry.source === RANGER_CLASS_ID), true);
  assert.equal(rangerFeatures.some((entry) => entry.classId === "ranger"), false);
});

test("i 43 reminder descrittivi non hanno effetti runtime o quick action", () => {
  const reminders = rangerFeatures.filter((entry) => !ASSISTED_IDS.has(entry.id));
  assert.equal(reminders.length, 43);
  for (const entry of reminders) {
    assert.equal(entry.runtimeSupport.status, "not-automated", entry.id);
    assert.equal(entry.automationLevel, "riferimento", entry.id);
    assert.equal(entry.quickActionEligible, false, entry.id);
    assert.equal(entry.effectPlan, null, entry.id);
  }
});

test("solo Nascondersi in Piena Vista e Compagno Animale sono assistiti", () => {
  assert.deepEqual(
    rangerFeatures
      .filter((entry) => entry.runtimeSupport.status === "implemented")
      .map((entry) => entry.id)
      .sort(),
    [...ASSISTED_IDS].sort(),
  );
  for (const id of ASSISTED_IDS) {
    assert.equal(feature(id).automationLevel, "assistita", id);
    assert.equal(feature(id).quickActionEligible, false, id);
  }
  assert.equal(rangerFeatures.some((entry) => entry.automationLevel === "automatica"), false);
});

test("le 15 opzioni usano esattamente i cinque gruppi esclusivi", () => {
  const expectedGroups = {
    "ranger-revised-stile-di-combattimento": 4,
    "ranger-revised-conclave-del-cacciatore-preda-del-cacciatore": 3,
    "ranger-revised-conclave-del-cacciatore-tattiche-difensive": 3,
    "ranger-revised-conclave-del-cacciatore-multiattacco": 2,
    "ranger-revised-conclave-del-cacciatore-difesa-superiore-del-cacciatore": 3,
  };
  const options = rangerFeatures.filter((entry) => entry.optionGroup);
  assert.equal(options.length, 15);
  for (const [group, count] of Object.entries(expectedGroups)) {
    const entries = options.filter((entry) => entry.optionGroup === group);
    assert.equal(entries.length, count, group);
    assert.equal(entries.every((entry) => entry.defaultEnabled === false), true, group);
    assert.equal(entries.every((entry) => entry.quickActionEligible === false), true, group);
    assert.equal(entries.every((entry) => entry.parentFeatureId === group), true, group);
  }
});

test("i parent delle scelte sono reference card e non attivabili", () => {
  const parentIds = [
    "ranger-revised-stile-di-combattimento",
    "ranger-revised-conclave-del-cacciatore-preda-del-cacciatore",
    "ranger-revised-conclave-del-cacciatore-tattiche-difensive",
    "ranger-revised-conclave-del-cacciatore-multiattacco",
    "ranger-revised-conclave-del-cacciatore-difesa-superiore-del-cacciatore",
  ];
  for (const id of parentIds) {
    const parent = feature(id);
    assert.equal(classFeatureIsReferenceOnly(parent), true, id);
    assert.equal(parent.defaultEnabled, true, id);
    assert.equal(parent.quickActionEligible, false, id);
    assert.equal(parent.effectPlan, null, id);
  }
});

test("livello e conclave filtrano classe e sottoclassi ai livelli Ranger Revised", () => {
  const baseByLevel = new Map([
    [1, ["ranger-revised-nemico-prescelto", "ranger-revised-esploratore-nato"]],
    [2, ["ranger-revised-stile-di-combattimento", "ranger-revised-incantesimi"]],
    [3, ["ranger-revised-consapevolezza-primordiale", "ranger-revised-conclave-ranger"]],
    [4, ["ranger-revised-aumento-dei-punteggi-di-caratteristica"]],
    [6, ["ranger-revised-nemico-prescelto-migliorato"]],
    [8, ["ranger-revised-passo-veloce"]],
    [10, ["ranger-revised-nascondersi-in-piena-vista"]],
    [14, ["ranger-revised-svanire"]],
    [18, ["ranger-revised-sensi-ferini"]],
    [20, ["ranger-revised-sterminatore-di-nemici"]],
  ]);
  for (const [level, ids] of baseByLevel) {
    const available = idsForBuild(level);
    for (const id of ids) assert.equal(available.has(id), true, `${id} at ${level}`);
  }

  const subclassByLevel = {
    [BEAST_CONCLAVE]: {
      3: "ranger-revised-conclave-della-bestia-compagno-animale",
      5: "ranger-revised-conclave-della-bestia-attacco-coordinato",
      7: "ranger-revised-conclave-della-bestia-difesa-della-bestia",
      11: "ranger-revised-conclave-della-bestia-tempesta-di-artigli-e-zanne",
      15: "ranger-revised-conclave-della-bestia-difesa-superiore-della-bestia",
    },
    [HUNTER_CONCLAVE]: {
      3: "ranger-revised-conclave-del-cacciatore-preda-del-cacciatore",
      5: "ranger-revised-conclave-del-cacciatore-attacco-extra",
      7: "ranger-revised-conclave-del-cacciatore-tattiche-difensive",
      11: "ranger-revised-conclave-del-cacciatore-multiattacco",
      15: "ranger-revised-conclave-del-cacciatore-difesa-superiore-del-cacciatore",
    },
    [DEEP_STALKER_CONCLAVE]: {
      3: "ranger-revised-conclave-del-cacciatore-delle-profondita-esploratore-dell-underdark",
      5: "ranger-revised-conclave-del-cacciatore-delle-profondita-attacco-extra",
      7: "ranger-revised-conclave-del-cacciatore-delle-profondita-mente-di-ferro",
      11: "ranger-revised-conclave-del-cacciatore-delle-profondita-raffica-del-cacciatore",
      15: "ranger-revised-conclave-del-cacciatore-delle-profondita-schivata-del-cacciatore",
    },
  };
  for (const [subclassId, entries] of Object.entries(subclassByLevel)) {
    for (const [level, id] of Object.entries(entries)) {
      assert.equal(idsForBuild(Number(level), subclassId).has(id), true, `${id} at ${level}`);
    }
  }
  assert.equal(idsForBuild(20, BEAST_CONCLAVE).has(
    "ranger-revised-conclave-del-cacciatore-preda-del-cacciatore",
  ), false);
  assert.equal(idsForBuild(20, HUNTER_CONCLAVE).has(
    "ranger-revised-conclave-della-bestia-compagno-animale",
  ), false);
});

test("Ranger PHB e Ranger Revised non ricevono le capacit\u00e0 della variante opposta", () => {
  const phb = getAvailableClassFeatures([{
    classId: "ranger",
    level: 20,
    subclassId: "ranger-cacciatore",
  }]);
  const revised = getAvailableClassFeatures(rangerBuild(20, BEAST_CONCLAVE));
  assert.equal(phb.some((entry) => entry.classId === RANGER_CLASS_ID), false);
  assert.equal(revised.some((entry) => entry.classId === "ranger"), false);
  assert.equal(phb.some((entry) => entry.id.startsWith("ranger-revised-")), false);
  assert.equal(revised.some((entry) => entry.id.startsWith("ranger-") && !entry.id.startsWith("ranger-revised-")), false);
});

test("Nascondersi in Piena Vista crea una sola pill manuale sul Ranger", () => {
  const value = feature("ranger-revised-nascondersi-in-piena-vista");
  const build = rangerBuild(10);
  const item = {
    id: "ranger-token",
    metadata: {
      "com.thebigpicture.initiative/meta": {
        hp: 27,
        hpMax: 31,
        movement: 9,
        conditions: [{ id: "concentrating" }],
      },
    },
  };
  const before = structuredClone(item);
  const activation = planClassFeatureActivation({
    state: null,
    feature: value,
    poolsById: new Map(),
    characterBuild: build,
    sourceId: item.id,
    targetIds: [item.id],
    currentRound: 4,
    currentTurnKey: "4:ranger-token",
    instanceId: "hide-1",
  });
  assert.equal(activation.ok, true);
  assert.equal(activation.instance.expiresRound, null);
  const pills = classFeatureConditionInstancesForActivation(
    value,
    activation.instance,
    "Ranger",
    build,
  );
  assert.equal(pills.length, 1);
  assert.equal(pills[0].targetId, item.id);
  assert.equal(pills[0].sourceId, item.id);
  assert.deepEqual(pills[0].expiry, { mode: "manual" });
  assert.equal(pills[0].manualRemoval, true);
  assert.equal("mechanics" in pills[0], false);
  assert.equal(classFeatureEffectProjection(value).kind, "condition");
  assert.deepEqual(item, before);
});

test("Compagno Animale seleziona un solo CHARACTER diverso dal Ranger e non muta lo stat block", () => {
  const value = feature("ranger-revised-conclave-della-bestia-compagno-animale");
  const build = rangerBuild(3, BEAST_CONCLAVE);
  assert.deepEqual(classFeatureTargeting(value, build), {
    mode: "single-target",
    rangeMeters: null,
    maxTargets: 1,
    excludeSource: true,
  });
  assert.deepEqual(
    classFeatureTargetIds(value, "ranger-token", ["ranger-token", "animal-token"], build),
    ["animal-token"],
  );
  const animal = {
    id: "animal-token",
    layer: "CHARACTER",
    metadata: {
      "com.thebigpicture.initiative/meta": {
        hp: 19,
        hpMax: 19,
        armorClass: 13,
        initiative: 8,
        statBlock: "external-source",
      },
    },
  };
  const before = structuredClone(animal);
  const activation = planClassFeatureActivation({
    state: null,
    feature: value,
    poolsById: new Map(),
    characterBuild: build,
    sourceId: "ranger-token",
    targetIds: ["animal-token"],
    currentRound: 4,
    instanceId: "companion-1",
  });
  assert.equal(activation.ok, true);
  const [pill] = classFeatureConditionInstancesForActivation(
    value,
    activation.instance,
    "Ranger",
    build,
  );
  assert.equal(pill.targetId, animal.id);
  assert.equal(pill.sourceId, "ranger-token");
  assert.deepEqual(pill.expiry, { mode: "manual" });
  assert.equal("mechanics" in pill, false);
  assert.deepEqual(animal, before);
  assert.deepEqual(Object.keys(activation.state), ["version", "resources", "instances"]);
});

test("terminazione e ripristino dei due reminder rimuovono solo stato e pill collegati", () => {
  const cases = [
    {
      id: "ranger-revised-nascondersi-in-piena-vista",
      build: rangerBuild(10),
      sourceId: "ranger-token",
      targetIds: ["ranger-token"],
      instanceId: "hide-lifecycle",
    },
    {
      id: "ranger-revised-conclave-della-bestia-compagno-animale",
      build: rangerBuild(3, BEAST_CONCLAVE),
      sourceId: "ranger-token",
      targetIds: ["animal-token"],
      instanceId: "companion-lifecycle",
    },
  ];
  for (const entry of cases) {
    const value = feature(entry.id);
    const activation = planClassFeatureActivation({
      state: null,
      feature: value,
      poolsById: new Map(),
      characterBuild: entry.build,
      sourceId: entry.sourceId,
      targetIds: entry.targetIds,
      currentRound: 6,
      instanceId: entry.instanceId,
    });
    assert.equal(activation.ok, true, entry.id);
    const pills = classFeatureConditionInstancesForActivation(
      value,
      activation.instance,
      "Ranger",
      entry.build,
    );
    assert.equal(pills.length, 1, entry.id);
    const terminated = planClassFeatureDeactivation(
      activation.state,
      activation.instance.instanceId,
    );
    assert.equal(terminated.changed, true, entry.id);
    assert.deepEqual(activeClassFeatureInstances(terminated.state, 6), [], entry.id);
    assert.deepEqual(
      pills.filter((pill) => !terminated.removedInstanceIds.includes(pill.parentEffectId)),
      [],
      entry.id,
    );
    assert.deepEqual(terminated.state, { version: 1, resources: {}, instances: [] });
  }
});

test("nessuna capacit\u00e0 Ranger Revised entra nelle quick action", () => {
  for (const profile of [
    { characterBuild: rangerBuild(20, BEAST_CONCLAVE) },
    { characterBuild: [{ classId: "ranger", level: 20, subclassId: "ranger-cacciatore" }] },
  ]) {
    assert.equal(
      buildClassFeatureQuickActions(profile).some((entry) => entry.featureId.startsWith("ranger-revised-")),
      false,
    );
  }
});

test("gli incantesimi del Cacciatore delle Profondit\u00e0 usano il catalogo spell comune", () => {
  const subclass = CLASS_FEATURE_CATALOG.subclasses.find((entry) => entry.id === DEEP_STALKER_CONCLAVE);
  assert.deepEqual(subclass?.additionalSpellsByLevel, {
    "3": ["camuffare se stesso"],
    "5": ["trucco della corda"],
    "9": ["glifo di interdizione"],
    "13": ["invisibilit\u00e0 superiore"],
    "17": ["sembrare"],
  });
  for (const [level, spellName] of Object.entries(subclass.additionalSpellsByLevel)) {
    assert.ok(getSpellDefinition(spellName), `${level}: ${spellName}`);
  }
});

test("una seconda generazione non modifica l'artefatto Ranger runtime", () => {
  const runtimePath = new URL("../src/class-features-runtime.json", import.meta.url);
  const generatorPath = fileURLToPath(new URL("../scripts/generate-class-feature-catalog.mjs", import.meta.url));
  const repoRoot = fileURLToPath(new URL("../", import.meta.url));
  const before = fs.readFileSync(runtimePath);
  execFileSync(process.execPath, [generatorPath], {
    cwd: repoRoot,
    stdio: "pipe",
  });
  assert.deepEqual(fs.readFileSync(runtimePath), before);
});

test("i report Ranger Revised continuano a verificare gli SHA-256 dichiarati", () => {
  assert.equal(
    sha256(new URL("../data/class-features/ranger_revised_database_finale.json", import.meta.url)),
    catalogReport.sha256,
  );
  assert.equal(
    sha256(new URL("../data/class-features/ranger_revised_livello_meccanico_v1_0.json", import.meta.url)),
    mechanicsReport.database_sha256,
  );
  assert.equal(
    sha256(new URL("../data/class-features/ranger_revised_livello_meccanico_schema_v1_0.json", import.meta.url)),
    mechanicsReport.schema_sha256,
  );
  assert.equal(manifest.class_id, RANGER_CLASS_ID);
  assert.equal(manifest.integration_policy.coexists_with_class_id, "ranger");
});
