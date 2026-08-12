import test from "node:test";
import assert from "node:assert/strict";

import {
  ANIMATED_OBJECT_COMMON_STATS,
  ANIMATED_OBJECTS_MAX_COST,
  ANIMATED_OBJECT_SIZES,
  animatedObjectCompositionCost,
  animatedObjectCompositionCount,
  expandAnimatedObjectComposition,
  getAnimatedObjectSize,
  validateAnimatedObjectComposition,
} from "../src/animatedObjectsCore.js";

test("il contratto delle taglie degli oggetti animati è dichiarativo e congelato", () => {
  assert.equal(Object.isFrozen(ANIMATED_OBJECT_COMMON_STATS), true);
  assert.deepEqual(ANIMATED_OBJECT_COMMON_STATS, {
    constitution: 10,
    intelligence: 3,
    wisdom: 3,
    charisma: 1,
    blindsightMeters: 9,
  });
  assert.equal(Object.isFrozen(ANIMATED_OBJECT_SIZES), true);
  assert.equal(Object.isFrozen(ANIMATED_OBJECT_SIZES[0]), true);
  assert.equal(ANIMATED_OBJECTS_MAX_COST, 10);
  assert.deepEqual(getAnimatedObjectSize("Large"), {
    id: "large",
    label: "Grande",
    sizeCategory: "Large",
    cost: 4,
    hp: 50,
    armorClass: 10,
    attackBonus: 6,
    attackDamage: "2d10 + 2",
    strength: 14,
    dexterity: 10,
    spaceCells: 2,
    assetPath: "/spell-token-animated-large-huge.webp",
    assetPixelSize: 560,
  });
});

test("la composizione rispetta il costo massimo e rifiuta opzioni sconosciute", () => {
  const valid = validateAnimatedObjectComposition({
    counts: { tiny: 2, medium: 1, large: 1 },
  });
  assert.equal(valid.valid, true);
  assert.equal(valid.cost, 8);
  assert.equal(valid.count, 4);
  assert.equal(animatedObjectCompositionCost(valid), 8);
  assert.equal(animatedObjectCompositionCount(valid), 4);

  const overLimit = validateAnimatedObjectComposition({
    counts: { large: 1, huge: 1, tiny: 3 },
  });
  assert.equal(overLimit.valid, false);
  assert.ok(overLimit.errors.includes("composition-limit-exceeded"));

  const unknown = validateAnimatedObjectComposition({
    counts: { tiny: 1, gargantuan: 1 },
  });
  assert.equal(unknown.valid, false);
  assert.ok(unknown.errors.includes("composition-option-invalid"));

  const invalidCount = validateAnimatedObjectComposition({
    counts: { small: 1.5 },
  });
  assert.equal(invalidCount.valid, false);
  assert.ok(invalidCount.errors.includes("composition-count-invalid"));
});

test("l'espansione produce una pedina per oggetto con statistiche e ordine stabili", () => {
  const objects = expandAnimatedObjectComposition({
    counts: { tiny: 1, large: 2 },
  });
  assert.deepEqual(objects.map((object) => [object.id, object.ordinal, object.hp]), [
    ["tiny", 0, 20],
    ["large", 1, 50],
    ["large", 2, 50],
  ]);
  assert.deepEqual(objects.map((object) => object.spaceCells), [0.5, 2, 2]);
  assert.deepEqual(expandAnimatedObjectComposition({ counts: { huge: 2 } }), []);
});
