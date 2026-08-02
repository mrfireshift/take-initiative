import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";

function readDataFile(name) {
  return fs.readFileSync(
    new URL(`../data/class-features/${name}`, import.meta.url),
  );
}

function readJson(name) {
  return JSON.parse(readDataFile(name).toString("utf8"));
}

function sha256(name) {
  return crypto.createHash("sha256").update(readDataFile(name)).digest("hex");
}

const catalog = readJson("ranger_revised_database_finale.json");
const catalogReport = readJson("ranger_revised_database_report_finale.json");
const mechanics = readJson("ranger_revised_livello_meccanico_v1_0.json");
const mechanicsReport = readJson("ranger_revised_livello_meccanico_report_v1_0.json");
const manifest = readJson("ranger_revised_manifest_integrazione.json");
const runtime = readJson("../../src/class-features-runtime.json");

test("i sei file Ranger Revised conservano integrità e riferimenti dichiarati", () => {
  assert.equal(
    sha256("ranger_revised_database_finale.json"),
    catalogReport.sha256,
  );
  assert.equal(
    sha256("ranger_revised_livello_meccanico_v1_0.json"),
    mechanicsReport.database_sha256,
  );
  assert.equal(
    sha256("ranger_revised_livello_meccanico_schema_v1_0.json"),
    mechanicsReport.schema_sha256,
  );
  assert.equal(manifest.class_id, "ranger-revised");
  assert.equal(manifest.integration_policy.coexists_with_class_id, "ranger");
  assert.equal(manifest.integration_policy.spell_list_ref, "ranger");
  assert.equal(
    manifest.integration_policy.standard_spell_slot_pool_ref,
    "slot-incantesimo-standard-aggregati",
  );
});

test("catalogo e overlay meccanico coprono gli stessi 45 record senza collisioni", () => {
  assert.deepEqual(catalog.conteggi, {
    classi: 1,
    sottoclassi: 3,
    privilegi: 30,
    opzioni: 15,
    record_progressione_classi: 20,
  });
  const catalogIds = [...catalog.privilegi, ...catalog.opzioni]
    .map((record) => record.id);
  const mechanicIds = mechanics.mechanics.map((record) => record.id);
  assert.equal(new Set(catalogIds).size, 45);
  assert.equal(new Set(mechanicIds).size, 45);
  assert.deepEqual(new Set(mechanicIds), new Set(catalogIds));
  assert.deepEqual(mechanics.validation.broken_catalog_references, []);
  assert.deepEqual(mechanics.validation.broken_resource_pool_references, []);
});

test("il runtime espone Ranger Revised come classe distinta con tutti i conclavi", () => {
  assert.ok(runtime.sources.some((entry) => entry.id === "ranger-revised"));
  assert.ok(runtime.classes.some((entry) => entry.id === "ranger"));
  assert.ok(runtime.classes.some((entry) => entry.id === "ranger-revised"));
  assert.deepEqual(
    runtime.subclasses
      .filter((entry) => entry.classId === "ranger-revised")
      .map((entry) => entry.id)
      .sort(),
    manifest.integration_policy.default_subclass_ids.slice().sort(),
  );
});
