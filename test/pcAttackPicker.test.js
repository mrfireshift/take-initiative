import assert from "node:assert/strict";
import test from "node:test";
import { pcAttackPickerDefault, pcAttackPickerEntries, pcAttackPickerEntryFor, pcAttackPickerTabs } from "../src/pcAttackPickerCore.js";

const sword = { id: "sword", label: "Spada lunga", kind: "attack", range: "melee", components: [{ type: "slashing", formula: "1d8+3" }] };
const bow = { id: "bow", label: "Arco lungo", kind: "attack", range: "ranged", components: [{ type: "piercing", formula: "1d8+2" }] };
const cantrips = { id: "cantrip", label: "Trucchetto", kind: "attack", source: { kind: "cantrip", spellIds: ["fire-bolt", "booming-blade", "ray-of-frost"] } };
const spells = { id: "spells", label: "Incantesimi", kind: "attack", source: { kind: "spell", spellIds: ["guiding-bolt"] } };
const heal = { id: "heal", label: "Cura", kind: "spell", spellId: "cure-wounds" };

test("the picker lists weapons, then cantrips, then attack spells, one entry each", () => {
  const entries = pcAttackPickerEntries([heal, spells, cantrips, sword, bow]);
  assert.deepEqual(entries.map((entry) => [entry.tab, entry.key]), [
    ["attacks", "sword"], ["attacks", "bow"],
    ["cantrips", "cantrip::fire-bolt"], ["cantrips", "cantrip::ray-of-frost"],
    ["spells", "spells::guiding-bolt"],
  ]);
  assert.equal(entries[0].label, "Spada lunga");
  assert.equal(entries[2].label, "Dardo di fuoco");
  assert.match(entries[4].label, /Dardo tracciante · 1°/);
});

test("a cantrip offered by two actions points at the first one", () => {
  const second = { ...cantrips, id: "cantrip-2", label: "Altri trucchetti", source: { kind: "cantrip", spellIds: ["fire-bolt", "chill-touch"] } };
  const entries = pcAttackPickerEntries([cantrips, second]);
  assert.deepEqual(entries.map((entry) => entry.key), ["cantrip::fire-bolt", "cantrip::ray-of-frost", "cantrip-2::chill-touch"]);
});

test("tabs appear only when they have entries", () => {
  assert.deepEqual(pcAttackPickerTabs(pcAttackPickerEntries([sword, bow])).map((tab) => tab.id), ["attacks"]);
  assert.deepEqual(pcAttackPickerTabs(pcAttackPickerEntries([sword, cantrips, spells])).map((tab) => tab.label), ["Attacchi", "Trucchetti", "Incantesimi"]);
  assert.deepEqual(pcAttackPickerTabs(pcAttackPickerEntries([heal])), []);
});

test("the entry for an action and spell falls back to the action's first entry", () => {
  const entries = pcAttackPickerEntries([sword, cantrips]);
  assert.equal(pcAttackPickerEntryFor(entries, "cantrip", "ray-of-frost").key, "cantrip::ray-of-frost");
  assert.equal(pcAttackPickerEntryFor(entries, "cantrip", "").key, "cantrip::fire-bolt");
  assert.equal(pcAttackPickerEntryFor(entries, "missing", ""), null);
});

test("the default entry: the request, then the last attack, then the first weapon", () => {
  const entries = pcAttackPickerEntries([cantrips, sword, bow]);
  const lastAttack = { quickActionId: "cantrip", spellId: "ray-of-frost" };
  assert.equal(pcAttackPickerDefault(entries, { actionId: "bow", lastAttack }).key, "bow");
  assert.equal(pcAttackPickerDefault(entries, { actionId: "cantrip", spellId: "fire-bolt", lastAttack }).key, "cantrip::fire-bolt");
  assert.equal(pcAttackPickerDefault(entries, { lastAttack }).key, "cantrip::ray-of-frost");
  assert.equal(pcAttackPickerDefault(entries, { lastAttack: { quickActionId: "gone" } }).key, "sword");
  assert.equal(pcAttackPickerDefault(entries, {}).key, "sword");
  assert.equal(pcAttackPickerDefault([], {}), null);
});

test("within a tab the default stays in that tab", () => {
  const entries = pcAttackPickerEntries([sword, bow, cantrips]);
  assert.equal(pcAttackPickerDefault(entries, { tab: "cantrips", lastAttack: { quickActionId: "bow" } }).key, "cantrip::fire-bolt");
  assert.equal(pcAttackPickerDefault(entries, { tab: "attacks", lastAttack: { quickActionId: "bow" } }).key, "bow");
});
