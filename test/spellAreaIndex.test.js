import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  SPELL_AREA_INDEX_OUTPUT,
  areaSaveChoiceValues,
  buildSpellAreaIndexSource,
} from "../scripts/generate-spell-area-index.mjs";
import { AREA_PLACEABLE_SPELL_IDS } from "../src/areaSaveSpellRules.js";
import { getAreaSaveAutomation, getSpellCatalog } from "../src/spells-srd.js";
import {
  AREA_SAVE_AUTOMATION_BY_ID,
  SPELL_AREA_GEOMETRY_BY_ID,
  lookupAreaSaveAutomation,
} from "../src/spellAreaIndex.js";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "src");
const json = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

test("the generated spell area index is up to date with the spell catalog", () => {
  const committed = fs.readFileSync(SPELL_AREA_INDEX_OUTPUT, "utf8").replace(/\r\n/g, "\n");
  assert.equal(
    committed,
    buildSpellAreaIndexSource(),
    "src/spellAreaIndex.js is stale: run `npm run generate:spell-area-index`",
  );
});

test("the area geometry matches the catalog area and range of every area-placeable spell", () => {
  const byId = new Map(getSpellCatalog().map((spell) => [spell.id, spell]));
  for (const spellId of AREA_PLACEABLE_SPELL_IDS) {
    const spell = byId.get(spellId);
    if (!spell) {
      assert.equal(Object.hasOwn(SPELL_AREA_GEOMETRY_BY_ID, spellId), false, spellId);
      continue;
    }
    assert.deepEqual(SPELL_AREA_GEOMETRY_BY_ID[spellId]?.area, json(spell.area), spellId);
    assert.deepEqual(SPELL_AREA_GEOMETRY_BY_ID[spellId]?.range, json(spell.range), spellId);
  }
});

test("lookupAreaSaveAutomation returns what getAreaSaveAutomation returns, for every spell and choice", () => {
  let compared = 0;
  for (const spell of getSpellCatalog()) {
    for (const choiceValue of ["", "__not-a-choice__", ...areaSaveChoiceValues(spell.id)]) {
      const expected = getAreaSaveAutomation(spell.id, choiceValue);
      assert.deepEqual(expected === null ? null : json(expected), expected, `${spell.id} is not plain JSON`);
      assert.deepEqual(lookupAreaSaveAutomation(spell.id, choiceValue), json(expected) ?? null, `${spell.id} / ${choiceValue}`);
      compared += 1;
    }
  }
  assert.ok(compared > getSpellCatalog().length);
  assert.ok(Object.keys(AREA_SAVE_AUTOMATION_BY_ID).length > 0);
  assert.equal(lookupAreaSaveAutomation("not-a-spell"), null);
});

test("lookupAreaSaveAutomation returns a copy that callers may change", () => {
  const spellId = Object.keys(AREA_SAVE_AUTOMATION_BY_ID).find((id) => AREA_SAVE_AUTOMATION_BY_ID[id][""]);
  const first = lookupAreaSaveAutomation(spellId);
  first.mutated = true;
  assert.equal(Object.hasOwn(lookupAreaSaveAutomation(spellId), "mutated"), false);
});

// The popovers that open often must not load spells-srd.js (1 MB minified) through static imports.
const LIGHT_ENTRIES = [
  "turn-notice.ts",
  "quick-hp-modal.js",
  "concentration-warning.ts",
  "effect-duration.js",
  "effects-modal.ts",
  "shared-hp-modal.js",
  "action-launcher.js",
  "options-modal.js",
  "history-modal.ts",
];
const STATIC_IMPORT = /(?:^|\n)\s*(?:import|export)\s[^;]*?from\s+["'](\.[^"']+)["']|(?:^|\n)\s*import\s+["'](\.[^"']+)["']/g;

function staticImportChain(entry, target) {
  const start = path.join(SRC, entry);
  const previous = new Map([[start, null]]);
  const queue = [start];
  while (queue.length) {
    const file = queue.shift();
    if (path.basename(file) === target) {
      const chain = [];
      for (let node = file; node; node = previous.get(node)) chain.unshift(path.basename(node));
      return chain;
    }
    const source = fs.readFileSync(file, "utf8");
    for (const match of source.matchAll(STATIC_IMPORT)) {
      let dependency = path.resolve(path.dirname(file), match[1] || match[2]);
      if (!fs.existsSync(dependency)) dependency = [".js", ".ts"].map((ext) => dependency + ext).find(fs.existsSync);
      if (!dependency || !/\.(js|ts)$/.test(dependency) || previous.has(dependency)) continue;
      previous.set(dependency, file);
      queue.push(dependency);
    }
  }
  return null;
}

test("the frequent popovers do not statically import the spell catalog", () => {
  for (const entry of LIGHT_ENTRIES) {
    const chain = staticImportChain(entry, "spells-srd.js");
    assert.equal(chain, null, `${entry} loads the spell catalog: ${chain?.join(" -> ")}`);
  }
});
