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
    ["features", "heal"],
  ]);
  assert.equal(entries[0].label, "Spada lunga");
  assert.equal(entries[2].label, "Dardo di fuoco");
  assert.equal(entries[4].label, "Dardo tracciante");
  assert.equal(entries[4].level, 1);
  assert.ok(entries.filter((entry) => entry.tab !== "features").every((entry) => entry.mode === "attack"), "without a book every attack entry is the console's");
});

test("a cantrip offered by two actions points at the first one", () => {
  const second = { ...cantrips, id: "cantrip-2", label: "Altri trucchetti", source: { kind: "cantrip", spellIds: ["fire-bolt", "chill-touch"] } };
  const entries = pcAttackPickerEntries([cantrips, second]);
  assert.deepEqual(entries.map((entry) => entry.key), ["cantrip::fire-bolt", "cantrip::ray-of-frost", "cantrip-2::chill-touch"]);
});

test("tabs appear only when they have entries", () => {
  assert.deepEqual(pcAttackPickerTabs(pcAttackPickerEntries([sword, bow])).map((tab) => tab.id), ["attacks"]);
  assert.deepEqual(pcAttackPickerTabs(pcAttackPickerEntries([sword, cantrips, spells])).map((tab) => tab.label), ["Attacchi", "Trucchetti", "Incantesimi"]);
  assert.deepEqual(pcAttackPickerTabs(pcAttackPickerEntries([heal])).map((tab) => tab.label), ["Capacità"]);
  assert.deepEqual(pcAttackPickerTabs(pcAttackPickerEntries([])), []);
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

const book = (spellIds, extra = {}) => ({ spellIds, ...extra });

test("with a book the cantrips and spells tabs list the book: attacks in the console, the rest launched", () => {
  const entries = pcAttackPickerEntries({ quickActions: [sword, { ...cantrips, source: { kind: "cantrip" } }, { ...spells, source: { kind: "spell" } }],
    spellbook: book(["fire-bolt", "mage-hand", "tasha-lama-roboante", "guiding-bolt", "bless", "fireball"], { pinnedIds: ["fireball"] }) });
  const view = entries.map((entry) => [entry.tab, entry.label, entry.mode]);
  assert.deepEqual(view, [
    ["attacks", "Spada lunga", "attack"],
    ["cantrips", "Dardo di fuoco", "attack"],
    ["cantrips", "Lama Roboante", "weapon"],
    ["cantrips", "Mano magica", "launch"],
    ["spells", "Benedizione", "launch"],
    ["spells", "Dardo tracciante", "attack"],
    ["spells", "Palla di fuoco", "launch"],
  ], "only the cantrips the actor knows, not every attack cantrip of the catalog");
  const bless = entries.find((entry) => entry.spellId === "bless");
  assert.deepEqual([bless.actionId, bless.level, bless.concentration], ["book:bless", 1, true]);
  const fire = entries.find((entry) => entry.spellId === "fire-bolt");
  assert.deepEqual([fire.actionId, fire.key], ["cantrip", "cantrip::fire-bolt"]);
});

test("an attack spell without its attack action is launched like the 🪄 menu; a spell not prepared is left out", () => {
  const entries = pcAttackPickerEntries({ quickActions: [], characterBuild: [{ classId: "chierico", level: 3 }],
    spellbook: book(["guiding-bolt", "bless", "cure-wounds"], { unpreparedIds: ["cure-wounds"] }) });
  assert.deepEqual(entries.map((entry) => [entry.spellId, entry.mode]), [["bless", "launch"], ["guiding-bolt", "launch"]]);
});

test("pinned spells come first in their level; a list named by the attack action stays beside the book", () => {
  const racial = { ...cantrips, id: "racial", source: { kind: "cantrip", spellIds: ["chill-touch"] } };
  const entries = pcAttackPickerEntries({ quickActions: [racial], spellbook: book(["light", "shield", "bless"], { pinnedIds: ["shield"] }) });
  assert.deepEqual(entries.map((entry) => entry.spellId), ["light", "chill-touch", "shield", "bless"]);
  assert.equal(entries.find((entry) => entry.spellId === "chill-touch").mode, "attack");
});

test("a dragonborn's breath weapon is an attack of the attacks tab", () => {
  const entries = pcAttackPickerEntries({ characterBuild: [{ classId: "paladino", level: 6 }], species: { id: "dragonide", ancestryId: "rosso" },
    abilityModifiers: { con: 2 }, quickActions: [sword] });
  assert.deepEqual(entries.map((entry) => [entry.tab, entry.mode]), [["attacks", "attack"], ["attacks", "attack"]]);
  assert.match(entries[1].actionId, /^breath:/);
});

test("the runtime's default is an attack: never a spell to launch", () => {
  const entries = pcAttackPickerEntries({ quickActions: [], spellbook: book(["bless"]) });
  assert.equal(pcAttackPickerDefault(entries, { attackOnly: true }), null);
  assert.equal(pcAttackPickerDefault(entries, {}).spellId, "bless");
});

test("the Capacità tab lists the card's ⚡ quick actions: features, conditions and spell actions of its own", () => {
  const rage = { id: "rage", label: "Ira", kind: "feature", featureId: "barbaro-ira" };
  const blessed = { id: "bless-me", label: "Benedetto", kind: "condition", conditionName: "Benedetto", targetMode: "self" };
  const entries = pcAttackPickerEntries({ quickActions: [sword, rage, blessed, heal], spellbook: book(["bless"]) });
  const features = entries.filter((entry) => entry.tab === "features");
  assert.deepEqual(features.map((entry) => [entry.label, entry.mode, entry.kind]),
    [["Ira", "use", "feature"], ["Benedetto", "use", "condition"], ["Cura", "use", "spell"]]);
  assert.equal(features[0].featureId, "barbaro-ira");
  assert.equal(features[0].key, "rage");
  assert.ok(!features.some((entry) => entry.actionId.startsWith("book:")), "the book's spells stay in their tabs");
  assert.equal(pcAttackPickerDefault(entries, { attackOnly: true }).key, "sword", "a feature is never the runtime's default");
});
