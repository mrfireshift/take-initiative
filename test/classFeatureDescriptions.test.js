// The rules text of the class features lives apart from the runtime catalog: only the character sheet loads it.
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import catalog from "../src/class-features-runtime.json" with { type: "json" };
import descriptions from "../src/class-features-descriptions.json" with { type: "json" };
import {
  classFeatureDescription,
  classFeatureDescriptionsLoaded,
  loadClassFeatureDescriptions,
  classFeatureMissingText,
} from "../src/classFeatureDescriptions.js";

test("the runtime catalog carries no description; every description belongs to a feature", () => {
  assert.equal(catalog.features.some((feature) => Object.hasOwn(feature, "description")), false);
  const ids = new Set(catalog.features.map((feature) => feature.id));
  // Only the SRD texts stay in the repository: the others are in the GM's private packs (compendio, fase 2).
  assert.ok(Object.keys(descriptions).length >= 70 && Object.keys(descriptions).length < 100);
  assert.deepEqual(Object.keys(descriptions).filter((id) => !ids.has(id)), []);
});

test("the sheet reads a description once loaded; a species trait keeps its own", async () => {
  const feature = { id: Object.keys(descriptions)[0], source: "phb2014" };
  // Not SRD text: in the Manuale del Giocatore pack, which Node (no IndexedDB) never has.
  const privateFeature = { id: "mago-scuola-di-invocazione-saturazione-magica", source: "phb2014" };
  assert.equal(classFeatureDescriptionsLoaded(), false);
  assert.equal(classFeatureDescription(feature), "");
  assert.equal(classFeatureMissingText(privateFeature), "");
  assert.equal(classFeatureDescription({ id: "species-trait", description: "Scurovisione." }), "Scurovisione.");
  await loadClassFeatureDescriptions();
  assert.equal(classFeatureDescription(feature), descriptions[feature.id]);
  assert.equal(classFeatureMissingText(feature), "");
  assert.equal(classFeatureDescription(privateFeature), "");
  assert.equal(classFeatureMissingText(privateFeature), "phb2014");
  assert.equal(classFeatureMissingText({ id: "species-trait", source: "species", description: "" }), "");
});

test("only the description loader imports the descriptions, and on demand", () => {
  const importers = readdirSync(new URL("../src/", import.meta.url))
    .filter((file) => file.endsWith(".js"))
    .filter((file) => /from "\.\/class-features-descriptions\.json"/u.test(readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8")));
  assert.deepEqual(importers, ["classFeatureDescriptionsData.js"]);
  const loader = readFileSync(new URL("../src/classFeatureDescriptions.js", import.meta.url), "utf8");
  assert.match(loader, /import\("\.\/classFeatureDescriptionsData\.js"\)/u);
});
