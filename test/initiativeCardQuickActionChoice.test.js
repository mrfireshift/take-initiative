import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { CLASS_FEATURE_BY_ID, getEnabledClassFeatures } from "../src/classFeatureCatalog.js";
import { classFeatureRequiresActivationChoice } from "../src/classFeatureCore.js";

// The quick actions bar of the sheet built a feature's variant dropdown without the profile's enabled features, unlike
// the feature cards (renderClassFeatures): the two could part on a variant the profile fixes. It passes them now. Since
// 7/11 only a configuration is the sheet's (Storm Aura's environment): Beast Form's form is chosen at each rage, and the
// bar's dropdown is there whatever card the sheet enables.
const source = readFileSync(new URL("../src/initiative-card-modal.js", import.meta.url), "utf8");

const BEAST_FORM = "barbaro-cammino-della-bestia-forma-della-bestia";

function section(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0 && end > start, `sezione assente: ${startMarker}`);
  return source.slice(start, end);
}

test("Beast Form with the Tail's card alone: the form is still asked, with the profile's features or without them", () => {
  const profile = {
    characterBuild: [{ classId: "barbaro", level: 3, subclassId: "barbaro-cammino-della-bestia" }],
    classFeaturesConfigured: true,
    enabledClassFeatureIds: [BEAST_FORM, `${BEAST_FORM}-coda`],
  };
  const enabled = getEnabledClassFeatures(profile).map((entry) => entry.id);
  assert.ok(enabled.includes(`${BEAST_FORM}-coda`));
  const beastForm = CLASS_FEATURE_BY_ID.get(BEAST_FORM);
  assert.equal(classFeatureRequiresActivationChoice(beastForm, enabled, CLASS_FEATURE_BY_ID), true, "chosen at each rage");
  assert.equal(classFeatureRequiresActivationChoice(beastForm, [], CLASS_FEATURE_BY_ID), true);
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

// Wild Surge's d8 is rolled at the table each time Rage starts (Tasha's): its dropdown starts empty, never on the 1st
// outcome, and the feature card's Attiva and the quick bar wait for the roll.
test("a rolled outcome starts empty in the sheet, and Attiva and the quick bar wait for the roll", () => {
  const control = section("function classFeatureChoiceControl(", "return select;");
  assert.match(control, /if \(feature\?\.choiceMode === "roll"\) \{\s*const placeholder = document\.createElement\("option"\);\s*placeholder\.value = "";/);
  assert.match(control, /select\.dataset\.rolled = "1";/);
  const unrolled = /classFeatureUnrolledControl\(\[choiceControl, \.\.\.autoChoiceControls\.values\(\)\]\)/;
  const bar = section("function renderQuickActionList(", "actionEntry.appendChild(button);");
  assert.match(bar, unrolled);
  assert.match(bar, /if \(unrolled\) \{[\s\S]*?status\.dataset\.tone = "error";\s*return;\s*\}/);
  const cards = section("function renderClassFeatures(", "appendFeatureControl(activate);");
  assert.match(cards, unrolled);
  assert.match(cards, /if \(unrolled\) throw new Error\(`Indica l'esito tirato/);
});
