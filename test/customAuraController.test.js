import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../src/customAuraController.js", import.meta.url),
  "utf8",
);
const background = readFileSync(
  new URL("../src/background.js", import.meta.url),
  "utf8",
);

test("il controller custom aura e autonomo, GM-only e usa il reconciler protetto", () => {
  assert.match(source, /role !== "GM"/);
  assert.match(source, /reconcileOwnedSceneItems/);
  assert.match(source, /currentSceneEpoch/);
  assert.match(source, /isCurrentSceneEpoch/);
  assert.match(source, /metadata\?\.\[CUSTOM_AURA_META_KEY\]/);
  assert.match(background, /mountCustomAuraController/);
});

test("disegna solo attachment dedicati e applica le pill dal coordinatore", () => {
  assert.match(source, /\.attachedTo\(aura\.sourceId\)/);
  assert.match(source, /\.layer\("DRAWING"\)/);
  assert.match(source, /\.locked\(true\)/);
  assert.match(source, /runEffectsMutation\(operations/);
  assert.match(source, /staleCustomAuraEffectRemovals/);
  assert.match(source, /type: "show-zone-trigger-notices"/);
});
