import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const classAuraSource = readFileSync(
  new URL("../src/classFeatureAuraController.js", import.meta.url),
  "utf8",
);
const spellAuraSource = readFileSync(
  new URL("../src/spellAuraController.js", import.meta.url),
  "utf8",
);

test("le aure mobili vengono disegnate sotto i token e migrano gli item legacy", () => {
  assert.match(classAuraSource, /\.layer\("DRAWING"\)/);
  assert.match(classAuraSource, /item\.layer === "DRAWING"/);
  assert.match(spellAuraSource, /\.layer\("DRAWING"\)/);
  assert.match(spellAuraSource, /item\.layer === "DRAWING"/);
});

test("i reminder informativi delle aure di classe arrivano al popup live del turno", () => {
  assert.match(classAuraSource, /type: "show-zone-trigger-notices"/);
  assert.doesNotMatch(classAuraSource, /type: "spell-zone-trigger-activations"/);
});

test("le aure di classe vengono terminate quando la fonte riceve una condizione di fine", () => {
  assert.match(classAuraSource, /classFeatureAuraEndsOnSourceCondition/);
  assert.match(classAuraSource, /deactivateClassFeature/);
  assert.match(classAuraSource, /requested = true/);
});
