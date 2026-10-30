import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import assets from "../src/diceAssets.json" with { type: "json" };
import {
  dieSymmetries,
  faceSymmetry,
  locatorDirections,
  multiplyQuaternions,
  physicalDieAsset,
  rotateVector,
  upFaceValue,
} from "../src/diceFaceCore.js";
import { diceThrowParameters, physicalDiceOf, parseDiceFormula, rollDiceFormula } from "../src/diceCore.js";

// Online dice tray, lot D-2 (docs/PIANO_DADI_ONLINE.md): the meshes of Owlbear Rodeo Dice carry a locator per number;
// a symmetry of each die brings the value drawn where the physics left the top number. Checked on the real assets.
const EXPECTED_GROUP = { d4: 12, d6: 24, d8: 24, d10: 10, d12: 60, d20: 60, d100: 10 };

test("ogni dado ha i suoi numeri e tutte le simmetrie del solido", () => {
  for (const [key, entry] of Object.entries(assets.dice)) {
    assert.equal(dieSymmetries(entry).length, EXPECTED_GROUP[key], key);
    const values = entry.locators.map((locator) => locator.value).sort((a, b) => a - b);
    const sides = key === "d100" ? 10 : Number(key.slice(1));
    assert.equal(values.length, sides, `${key}: one locator per number`);
  }
  assert.deepEqual(assets.dice.d10.locators.map((l) => l.value).sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(assets.dice.d100.locators.map((l) => l.value).sort((a, b) => a - b), [0, 10, 20, 30, 40, 50, 60, 70, 80, 90]);
});

test("per ogni coppia di numeri c'è la simmetria che porta l'uno dove stava l'altro", () => {
  for (const [key, entry] of Object.entries(assets.dice)) {
    const directions = locatorDirections(entry);
    for (const from of directions.keys()) {
      for (const to of directions.keys()) {
        const q = faceSymmetry(entry, from, to);
        assert.ok(q, `${key} ${from}→${to}`);
        const turned = rotateVector(q, directions.get(from));
        const target = directions.get(to);
        assert.ok(turned[0] * target[0] + turned[1] * target[1] + turned[2] * target[2] > 0.99, `${key} ${from}→${to}`);
      }
    }
  }
});

test("a dado fermo, la simmetria mette in alto il valore estratto", () => {
  const entry = assets.dice.d20;
  const rest = { x: 0.3, y: -0.5, z: 0.7, w: 0.4 };
  const length = Math.hypot(rest.x, rest.y, rest.z, rest.w);
  const q = { x: rest.x / length, y: rest.y / length, z: rest.z / length, w: rest.w / length };
  const landed = upFaceValue(entry, q);
  for (let wanted = 1; wanted <= 20; wanted += 1) {
    assert.equal(upFaceValue(entry, multiplyQuaternions(q, faceSymmetry(entry, wanted, landed))), wanted);
  }
});

test("ogni dado fisico trova il suo modello e il numero da mostrare", () => {
  const result = rollDiceFormula(parseDiceFormula("1d10+1d100+1d4"), { nextUint32: (() => {
    const values = [9, 36, 3];
    let index = 0;
    return () => values[index++];
  })() });
  assert.deepEqual(physicalDiceOf(result).map(physicalDieAsset), [
    { key: "d10", value: 0 },
    { key: "d100", value: 30 },
    { key: "d10", value: 7 },
    { key: "d4", value: 4 },
  ]);
  assert.equal(diceThrowParameters(4).length, 4);
});

test("gli asset elencati esistono e ogni materiale ha le sue mappe", () => {
  const files = [
    assets.environment, assets.tray.mesh,
    ...Object.values(assets.dice).map((entry) => entry.mesh),
    ...Object.values(assets.styles).flatMap((style) => Object.values(style.maps)),
  ];
  for (const file of files) assert.ok(existsSync(new URL(`../public/${file}`, import.meta.url)), file);
  assert.equal(Object.keys(assets.styles).filter((key) => key !== "tray").length, 8);
  assert.match(assets.source.license, /GPL-3\.0/);
});
