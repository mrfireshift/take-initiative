import test from "node:test";
import assert from "node:assert/strict";

import {
  currentInitiativeTurnKey,
  initiativeTurnKeyAtOrdinal,
} from "../src/turnBoundaryCore.js";

test("la chiave del turno distingue round e posizione iniziativa", () => {
  const order = ["caster", "target"];
  assert.equal(initiativeTurnKeyAtOrdinal(order, 0), "1:0:caster");
  assert.equal(initiativeTurnKeyAtOrdinal(order, 1), "1:1:target");
  assert.equal(initiativeTurnKeyAtOrdinal(order, 2), "2:0:caster");
});

test("la chiave corrente conserva l'identità virtuale Paragon", () => {
  assert.equal(currentInitiativeTurnKey({
    order: ["boss", "boss::p1", "target"],
    current: 1,
    round: 3,
  }), "3:1:boss::p1");
});
