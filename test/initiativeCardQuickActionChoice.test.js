import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { CLASS_FEATURE_BY_ID, getEnabledClassFeatures } from "../src/classFeatureCatalog.js";
import { classFeatureRequiresActivationChoice } from "../src/classFeatureCore.js";

// The quick actions bar of the sheet built a feature's variant dropdown without the profile's enabled features: it showed
// it even when the profile fixes the variant (Beast Form with the Tail alone enabled), and the activation then applied the
// Tail whatever the GM picked. The bar passes them now, as the feature cards do (renderClassFeatures).
const source = readFileSync(new URL("../src/initiative-card-modal.js", import.meta.url), "utf8");

const BEAST_FORM = "barbaro-cammino-della-bestia-forma-della-bestia";

function section(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0 && end > start, `sezione assente: ${startMarker}`);
  return source.slice(start, end);
}

test("Beast Form with the Tail alone: no variant to ask with the profile's features, a dropdown without them", () => {
  const profile = {
    characterBuild: [{ classId: "barbaro", level: 3, subclassId: "barbaro-cammino-della-bestia" }],
    classFeaturesConfigured: true,
    enabledClassFeatureIds: [BEAST_FORM, `${BEAST_FORM}-coda`],
  };
  const enabled = getEnabledClassFeatures(profile).map((entry) => entry.id);
  assert.ok(enabled.includes(`${BEAST_FORM}-coda`));
  const beastForm = CLASS_FEATURE_BY_ID.get(BEAST_FORM);
  assert.equal(classFeatureRequiresActivationChoice(beastForm, enabled, CLASS_FEATURE_BY_ID), false);
  assert.equal(classFeatureRequiresActivationChoice(beastForm, [], CLASS_FEATURE_BY_ID), true, "the bar's call before");
});

test("the quick actions bar passes the profile's enabled features to the variant controls, as the feature cards do", () => {
  const list = section("function renderQuickActionList(", "button.addEventListener(\"click\"");
  assert.match(list, /const enabledFeatureIds = [^;]*getEnabledClassFeatures\(profile\)\.map\(\(entry\) => entry\.id\)/);
  assert.match(list, /classFeatureChoiceControl\(feature, \{ compact: true, enabledFeatureIds \}\)/);
  assert.match(list, /classFeatureAutoChoiceControls\(feature, \{ compact: true, enabledFeatureIds \}\)/);
  // No variant control of a feature is built from an empty list: each call names the enabled features (the feature
  // cards and this bar).
  const calls = source.match(/(?<!function )classFeature(?:Auto)?ChoiceControls?\(feature, \{[^}]*\}/g) || [];
  assert.ok(calls.length >= 4, `${calls.length} calls`);
  for (const call of calls) assert.match(call, /enabledFeatureIds/, call);
});
