import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const conditionsSource = read("../src/conditions.js");
const cardSource = read("../src/initiativeCardClassicBuilder.js");
const trackerSource = read("../src/initiativeList.js");

test("le pill condizioni della card classica espongono la X solo tramite callback GM", () => {
  assert.match(conditionsSource, /const canRemoveCondition = !hasClassFeatureInstance/);
  assert.match(conditionsSource, /opts\.onRemove\(group\)/);
  assert.match(cardSource, /onRemove: IS_GM && !isLairId\(e\.id\) && !isEpicActionId\(e\.id\)/);
  assert.match(cardSource, /__removeConditionOnTrackerCard\(e\.id, group\)/);
});

test("la rimozione dalla pill usa la lane effects e gli ID delle istanze", () => {
  assert.match(trackerSource, /async function __removeConditionOnTrackerCard\(itemId, group\)/);
  assert.match(trackerSource, /type: "condition:remove-instances"/);
  assert.match(trackerSource, /instanceId: String\(instance\?\.id \|\| ""\)\.trim\(\)/);
  assert.match(trackerSource, /requireAppliedEffectsMutation\(mutation\)/);
});

test("la card proietta gli effetti storici nella condizione canonica", () => {
  assert.match(trackerSource, /const safeConditions = __safeConditions\(meta\.conditions\);/);
  assert.match(
    trackerSource,
    /instances: getEffectiveConditionInstances\(safeConditions\)/,
  );
});
