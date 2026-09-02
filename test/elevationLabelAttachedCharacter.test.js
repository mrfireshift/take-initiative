import test, { mock } from "node:test";
import assert from "node:assert/strict";

mock.module("@owlbear-rodeo/sdk", {
  exports: {
    default: { onReady() {} },
    buildLabel: () => ({ build: () => ({}) }),
  },
});

const { elevationLabelTokens } = await import(
  "../src/elevationLabel.js?attached-character-test"
);

const META_KEY = "com.thebigpicture.initiative/meta";

test("il renderer quota osserva un CHARACTER attached con elevation canonica", () => {
  const tokens = elevationLabelTokens([
    {
      id: "top-level",
      layer: "CHARACTER",
      metadata: { [META_KEY]: { elevation: 1.5 } },
    },
    {
      id: "carried",
      layer: "CHARACTER",
      attachedTo: "turbine-root",
      metadata: { [META_KEY]: { elevation: 3 } },
    },
    {
      id: "attached-without-elevation",
      layer: "CHARACTER",
      attachedTo: "other-root",
      metadata: { [META_KEY]: { hp: 10 } },
    },
    {
      id: "drawing",
      layer: "DRAWING",
      metadata: { [META_KEY]: { elevation: 3 } },
    },
  ]);

  assert.deepEqual(tokens.map((item) => item.id), ["top-level", "carried"]);
});
