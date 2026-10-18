import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { FakeNode } from "../test-support/fakeBossActionsDom.js";

// Chip rendering has no SDK or mutation side effects; fail if it crosses that boundary.
const unexpectedMutation = () => { throw new Error("rendering a spell chip must not mutate the scene"); };
mock.module("@owlbear-rodeo/sdk", { exports: { default: {} } });
mock.module("../src/effectsMutations.js", { exports: { requireAppliedEffectsMutation: unexpectedMutation, runEffectsMutation: unexpectedMutation, tickRoundEffects: unexpectedMutation } });
const { buildSpellChips } = await import("../src/spells.js");
const doc = { createElement: tag => { const node = new FakeNode(doc, tag); node.style = {}; return node; },
  createDocumentFragment: () => doc.createElement("fragment") };
globalThis.document = doc;

test("the concentration marker is nested in the spell pill and termination keeps the actual spell", async () => {
  const spell = { name: "Animare oggetti", instanceId: "cast-1", turns: 5 };
  const terminated = [];
  const fragment = buildSpellChips([spell], { concentrating: true, onTerminate: value => terminated.push(value) });
  assert.equal(fragment.children.length, 1);
  const chip = fragment.children[0];
  assert.equal(chip.dataset.referenceEntry, "Animare oggetti");
  const marker = chip.querySelector('[data-concentration-marker="1"]');
  assert.ok(marker, "C is inside the associated spell pill");
  assert.equal(marker.textContent, "C");
  assert.equal(marker.querySelector("button"), null);
  await chip.querySelector("button").click();
  assert.deepEqual(terminated, [spell]);
  assert.equal(buildSpellChips([spell]).querySelector('[data-concentration-marker="1"]'), null);
});

test("a concentration-only reference does not invent an expired round counter", () => {
  const chip = buildSpellChips([{ name: "Turbine" }], { concentrating: true, concentrationOnly: true }).children[0];
  assert.equal(chip.children[1].textContent, "Turbine");
  assert.match(chip.title, /Concentrazione attiva/);
});
