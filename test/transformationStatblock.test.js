// Trasformazioni (16/11/2026): the stat block of a form to read, in the console's Capacità tab and behind the «Statblock»
// button of the «Forma» field (transformationStatblockCore.js).
import assert from "node:assert/strict";
import test from "node:test";
import { fiveToolsStatblockSections } from "../src/fiveToolsMonsterCore.js";
import {
  TRANSFORMATION_FORM_GROUP_TITLES,
  transformationFormEntries,
  transformationFormOf,
  transformationFormStatblockRef,
  transformationStatblockText,
} from "../src/transformationStatblockCore.js";

// The SRD 5.1 brown bear, as 5eTools writes it.
const BEAR_RECORD = {
  name: "Brown Bear", source: "MM", size: ["L"], type: "beast", alignment: ["U"], ac: [{ ac: 11, from: ["natural armor"] }],
  hp: { average: 34, formula: "4d10 + 12" }, speed: { walk: 40, climb: 30 }, str: 19, dex: 10, con: 16, int: 2, wis: 13, cha: 7,
  skill: { perception: "+3" }, passive: 13, cr: "1",
  trait: [{ name: "Keen Smell", entries: ["The bear has advantage on Wisdom ({@skill Perception}) checks that rely on smell."] }],
  action: [
    { name: "Multiattack", entries: ["The bear makes two attacks: one with its bite and one with its claws."] },
    { name: "Bite", entries: ["{@atk mw} {@hit 6} to hit, reach 5 ft., one target. {@h}8 ({@damage 1d8 + 4}) piercing damage."] },
    { name: "Claws", entries: ["{@atk mw} {@hit 6} to hit, reach 5 ft., one target. {@h}11 ({@damage 2d6 + 4}) slashing damage."] },
  ],
};
const BEAR_FORM = { name: "Brown Bear", ref: "Brown Bear|MM", source: "5etools", type: "beast", cr: "1", size: "large",
  hitPoints: { average: 34 }, armorClass: 11, speeds: { walk: 12, climb: 9 }, notes: "Tratti: Keen Smell.",
  multiattack: "The bear makes two attacks: one with its bite and one with its claws.", actions: [] };

test("statblock della forma: i tratti col testo, il multiattacco, niente attacchi doppi, lo statblock completo", () => {
  const view = fiveToolsStatblockSections(BEAR_RECORD);
  const entries = transformationFormEntries(BEAR_FORM, view);
  assert.deepEqual(entries.map((entry) => [entry.group, entry.label]), [
    ["form-trait", "Keen Smell"],
    ["form-action", "Multiattack"],
    ["form-statblock", "Statblock: Brown Bear"],
  ], "Bite and Claws are in the Attacchi tab already");
  assert.match(entries[0].text, /advantage on Wisdom \(Perception\) checks that rely on smell/);
  assert.ok(entries.every((entry) => entry.mode === "monster" && entry.tab === "features"));
  const full = entries.at(-1).text;
  for (const piece of ["Armor Class 11 (natural armor)", "Hit Points 34 (4d10 + 12)", "Keen Smell. The bear has advantage",
    "ACTIONS", "Bite.", "Claws."]) {
    assert.ok(full.includes(piece), piece);
  }
  assert.equal(transformationStatblockText(view), full);
  assert.equal(TRANSFORMATION_FORM_GROUP_TITLES["form-trait"], "Forma: tratti");
});

test("statblock della forma: senza l'archivio del GM, i nomi dei tratti e il multiattacco della forma salvata", () => {
  const entries = transformationFormEntries(BEAR_FORM, null);
  assert.deepEqual(entries.map((entry) => [entry.group, entry.label]),
    [["form-trait", "Keen Smell"], ["form-action", "Multiattack"], ["form-statblock", "Statblock: Brown Bear"]]);
  assert.equal(entries[0].text, "Il testo è nell'archivio di 5eTools del GM.");
  assert.match(entries.at(-1).text, /^Brown Bear \(bestia, GS 1\)/);
  assert.match(entries.at(-1).text, /Multiattack\. The bear makes two attacks/);
});

test("statblock della forma: il riferimento solo per le forme di 5eTools, e la forma della creatura", () => {
  assert.equal(transformationFormStatblockRef(BEAR_FORM), "Brown Bear|MM");
  assert.equal(transformationFormStatblockRef({ ...BEAR_FORM, source: "manual" }), "");
  assert.equal(transformationFormStatblockRef({ ...BEAR_FORM, ref: "Brown Bear" }), "");
  const pill = { id: "ws", condition: "Forma Selvatica", active: true, mechanics: { transformation: { kind: "wild-shape", form: BEAR_FORM } } };
  assert.equal(transformationFormOf({ conditions: { instances: [pill] } })?.name, "Brown Bear");
  assert.equal(transformationFormOf({ conditions: { instances: [{ ...pill, active: false }] } }), null);
  assert.deepEqual(transformationFormEntries(null, null), []);
});
