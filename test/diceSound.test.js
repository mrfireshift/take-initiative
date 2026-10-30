import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import assets from "../src/diceAssets.json" with { type: "json" };
import { audibleImpacts, dieWeightClass, impactPan, impactVolume } from "../src/diceSoundCore.js";
import { createDefaultLocalOptions } from "../src/options/optionsDefaults.js";
import { normalizeLocalOptions } from "../src/options/optionsNormalize.js";
import { resolveOptions } from "../src/options/optionsResolve.js";
import { selectDiceSoundsEnabled } from "../src/options/optionsSelectors.js";

// Online dice tray, lot D-5 (docs/PIANO_DADI_ONLINE.md): the impact sounds of Owlbear Rodeo Dice.
test("il suono dipende dal peso del dado e da cosa colpisce, come nella Dice", () => {
  assert.equal(dieWeightClass("d20", "iron"), "heavy");
  assert.equal(dieWeightClass("d4", "iron"), "medium");
  assert.equal(dieWeightClass("d20", "glass"), "medium");
  assert.equal(dieWeightClass("d4", "galaxy"), "light");
  for (const weight of ["light", "medium", "heavy"]) {
    for (const surface of ["dice", "leather", "wood"]) assert.equal(assets.sounds[weight][surface].length, 4, `${weight}/${surface}`);
  }
  assert.equal(impactVolume(2.5), 0.5);
  assert.equal(impactVolume(12), 1);
  assert.equal(impactVolume(-1), 0);
  assert.equal(impactPan(0.46, 0.46), 0.6);
  assert.equal(impactPan(-9, 0.46), -0.6);
  assert.equal(impactPan(0, 0.46), 0);
});

test("ogni dado aspetta 200 ms prima di un altro suono, e gli urti impercettibili tacciono", () => {
  const impacts = [
    { die: 0, surface: "leather", time: 0.1, speed: 4 },
    { die: 0, surface: "wood", time: 0.2, speed: 4 },
    { die: 1, surface: "dice", time: 0.2, speed: 3 },
    { die: 0, surface: "leather", time: 0.31, speed: 2 },
    { die: 1, surface: "leather", time: 0.5, speed: 0.01 },
    { die: 1, surface: "roof", time: 0.6, speed: 5 },
  ];
  assert.deepEqual(audibleImpacts(impacts).map(({ die, time, volume }) => [die, time, volume]), [
    [0, 0.1, 0.8],
    [1, 0.2, 0.6],
    [0, 0.31, 0.4],
  ]);
});

test("i suoni si spengono in questo browser e il vassoio li suona agli urti", () => {
  assert.equal(createDefaultLocalOptions().tools.diceSounds, true);
  assert.equal(normalizeLocalOptions({ tools: { diceSounds: false } }).tools.diceSounds, false);
  assert.equal(normalizeLocalOptions({ tools: { diceSounds: "boh" } }).tools.diceSounds, true);
  assert.equal(selectDiceSoundsEnabled(resolveOptions({ local: { tools: { diceSounds: false } } })), false);
  const scene = readFileSync(new URL("../src/diceScene.js", import.meta.url), "utf8");
  assert.match(scene, /world\.addEventListener\("beginContact"/);
  assert.match(scene, /wall\(\[0, TRAY\.roof, 0\], \[1, 0, 0\], Math\.PI \/ 2, wallMaterial, null\);/, "the roof makes no sound");
  const tray = readFileSync(new URL("../src/dice-tray.js", import.meta.url), "utf8");
  assert.match(tray, /if \(!sound \|\| !soundsOn\(\)\) return \{\};/);
  assert.match(tray, /tools: \{ \.\.\.\(current\.tools \|\| \{\}\), diceSounds: on \}/);
  const notice = readFileSync(new URL("../src/dice-notice.js", import.meta.url), "utf8");
  assert.match(notice, /soundsOn \? import\("\.\/diceSound\.js"\)/);
});
