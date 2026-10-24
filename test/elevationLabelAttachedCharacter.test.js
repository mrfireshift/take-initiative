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

test("la Mano arcana, token PROP di un incantesimo, ha la sua quota come un CHARACTER", () => {
  const BOARD = "com.thebigpicture.initiative/spellBoardToken";
  const hand = { id: "hand", type: "IMAGE", layer: "PROP", metadata: { [META_KEY]: { hp: 40, hpMax: 40, elevation: 6 }, [BOARD]: { kind: "spell-board-token", spellId: "arcane-hand" } } };
  const wall = { id: "wall", type: "IMAGE", layer: "PROP", metadata: { [META_KEY]: { elevation: 6 }, [BOARD]: { kind: "spell-board-token", spellId: "wall-of-fire" } } };
  const prop = { id: "crate", type: "IMAGE", layer: "PROP", metadata: { [META_KEY]: { elevation: 6 } } };
  assert.deepEqual(elevationLabelTokens([hand, wall, prop]).map((item) => item.id), ["hand"]);
});
