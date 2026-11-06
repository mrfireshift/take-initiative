import assert from "node:assert/strict";
import test from "node:test";
import { CLASS_FEATURE_BY_ID, getAvailableClassFeatures, getEnabledClassFeatures } from "../src/classFeatureCatalog.js";
import { classFeatureChoiceOptions, classFeatureRequiresActivationChoice } from "../src/classFeatureCore.js";
import { pcAttackFeatureForm, pcAttackFeatureState } from "../src/pcAttackFeatureFormCore.js";

// classFeatureRequiresActivationChoice looked a variant feature's parent up in CLASS_FEATURE_BY_ID, a name
// classFeatureCore.js does not define: a ReferenceError for every feature with variants and a duration tied to another
// feature (Beast Form and Wild Surge, both until Rage). The character sheet calls it on each feature card and for Rage's
// automatic outcomes, and lost its features list. The catalog's map now comes from the caller (the catalog imports
// classFeatureCore.js), and the rule is the attack console's own (requiresChoice, pcAttackFeatureFormCore.js).

const RAGE = "barbaro-ira";
const BEAST_FORM = "barbaro-cammino-della-bestia-forma-della-bestia";
const WILD_SURGE = "barbaro-cammino-della-magia-selvaggia-impeto-selvaggio";
const STORM_AURA = "barbaro-cammino-dell-araldo-della-tempesta-aura-tempestosa";

// A 3rd level barbarian of the subclass: its default features, plus the ones given.
const barbarian = (subclassId, extraIds = []) => {
  const characterBuild = [{ classId: "barbaro", level: 3, subclassId }];
  if (!extraIds.length) return { characterBuild };
  const defaults = getAvailableClassFeatures(characterBuild).filter((entry) => entry.defaultEnabled).map((entry) => entry.id);
  return { characterBuild, classFeaturesConfigured: true, enabledClassFeatureIds: [...defaults, ...extraIds] };
};
const feature = (id) => CLASS_FEATURE_BY_ID.get(id);
// The sheet's call (renderClassFeatures, classFeatureChoiceControl): the profile's enabled ids and the catalog's map.
const sheetAsks = (profile, id) => classFeatureRequiresActivationChoice(
  feature(id),
  getEnabledClassFeatures(profile).map((entry) => entry.id),
  CLASS_FEATURE_BY_ID,
);
// Whether the console asks it: the field its requiresChoice adds, "choice", or "auto:<child>" on the parent's form.
const consoleAsks = (profile, id, fieldId = "choice") => pcAttackFeatureForm(
  feature(id),
  pcAttackFeatureState(profile, {}, getEnabledClassFeatures(profile), 1),
  { characterBuild: profile.characterBuild },
).fields.some((field) => field.id === fieldId);

test("Beast Form asks its variant as the console does, and nothing once a variant is enabled", () => {
  const beast = barbarian("barbaro-cammino-della-bestia", [BEAST_FORM]);
  assert.equal(sheetAsks(beast, BEAST_FORM), true);
  assert.equal(sheetAsks(beast, BEAST_FORM), consoleAsks(beast, BEAST_FORM));
  const claws = barbarian("barbaro-cammino-della-bestia", [BEAST_FORM, `${BEAST_FORM}-artigli`]);
  assert.equal(sheetAsks(claws, BEAST_FORM), false, "Claws enabled: the variant is the sheet's");
  assert.equal(sheetAsks(claws, BEAST_FORM), consoleAsks(claws, BEAST_FORM));
});

test("Wild Surge asks its outcome on its own card and as Rage's automatic outcome, as the console does", () => {
  const wild = barbarian("barbaro-cammino-della-magia-selvaggia");
  assert.ok(feature(RAGE).autoActivateFeatureIds.includes(WILD_SURGE));
  assert.equal(sheetAsks(wild, WILD_SURGE), true);
  assert.equal(sheetAsks(wild, WILD_SURGE), consoleAsks(wild, WILD_SURGE));
  assert.equal(sheetAsks(wild, WILD_SURGE), consoleAsks(wild, RAGE, `auto:${WILD_SURGE}`), "Rage's control for the outcome");
  const fixed = barbarian("barbaro-cammino-della-magia-selvaggia", [`${WILD_SURGE}-risultato-2`]);
  assert.equal(sheetAsks(fixed, WILD_SURGE), false, "an outcome enabled as a sub-feature: nothing to ask");
  assert.equal(sheetAsks(fixed, WILD_SURGE), consoleAsks(fixed, RAGE, `auto:${WILD_SURGE}`));
});

test("a duration tied to a feature with variants asks nothing, as in the console: the sheet passes the map for it", () => {
  assert.ok(classFeatureChoiceOptions(feature(STORM_AURA)).length > 0, "the parent has variants");
  const child = {
    id: "prova-figlio-dell-aura", name: "Figlio dell'aura (prova)", classId: "barbaro",
    choiceOptions: [{ id: "a", label: "A" }, { id: "b", label: "B" }],
    duration: { rounds: null, untilFeatureId: STORM_AURA },
    runtimeSupport: { status: "implemented", adapter: "condition" },
    activation: { primary: "azione_bonus" },
  };
  const storm = barbarian("barbaro-cammino-dell-araldo-della-tempesta");
  const consoleForm = pcAttackFeatureForm(child, pcAttackFeatureState(storm, {}, getEnabledClassFeatures(storm), 1),
    { characterBuild: storm.characterBuild });
  assert.equal(consoleForm.fields.some((field) => field.id === "choice"), false);
  assert.equal(classFeatureRequiresActivationChoice(child, [], CLASS_FEATURE_BY_ID), false);
  assert.equal(classFeatureRequiresActivationChoice(child, []), true, "without the map the parent is unknown");
});

test("no feature of the catalog throws, with the map or without it", () => {
  for (const entry of CLASS_FEATURE_BY_ID.values()) {
    assert.doesNotThrow(() => classFeatureRequiresActivationChoice(entry, [], CLASS_FEATURE_BY_ID), entry.id);
    assert.doesNotThrow(() => classFeatureRequiresActivationChoice(entry, []), entry.id);
  }
});
