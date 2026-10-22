// Spell slots from the class build: the tables of every class, the multiclass rule and Pact Magic.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  SPELL_SLOT_PACT_POOL_ID,
  SPELL_SLOT_RESOURCE_POOLS,
  hasSpellSlots,
  isSpellSlotPool,
  spellSlotMaximums,
  spellSlotPoolId,
  spellSlotPoolMaximum,
  spellSlotStatus,
  spellcasterLevel,
} from "../src/spellSlotCore.js";

const database = (name) => JSON.parse(readFileSync(new URL(`../data/class-features/${name}`, import.meta.url), "utf8"));
const classTables = (data) => Object.values(data.classi || {});
const slotsOf = (row) => Object.fromEntries(Object.entries(row.slot_incantesimo || {}).map(([level, count]) => [Number(level), count]));

test("a single class has the slots of its own table, at every level", () => {
  const classes = [
    ...classTables(database("phb2014_classi_database_finale.json")),
    ...classTables(database("ranger_revised_database_finale.json")).map((entry) => ({ ...entry, id: "ranger-revised" })),
  ].filter((entry) => entry.progressione_livelli?.some((row) => row.slot_incantesimo));
  assert.deepEqual(classes.map((entry) => entry.id).sort(),
    ["bardo", "chierico", "druido", "mago", "paladino", "ranger", "ranger-revised", "stregone"]);
  for (const entry of classes) {
    for (const row of entry.progressione_livelli) {
      const expected = Object.fromEntries(Object.entries(slotsOf(row)).map(([level, count]) => [String(level), count]));
      assert.deepEqual(spellSlotMaximums([{ classId: entry.id, level: row.livello }]).slots, expected, `${entry.id} ${row.livello}`);
    }
  }
});

test("Pact Magic follows the warlock table and stays apart from the other slots", () => {
  const warlock = classTables(database("phb2014_classi_database_finale.json")).find((entry) => entry.id === "warlock");
  for (const row of warlock.progressione_livelli) {
    const { slots, pact } = spellSlotMaximums([{ classId: "warlock", level: row.livello }]);
    assert.deepEqual(slots, {}, `warlock ${row.livello}`);
    assert.deepEqual(pact, { count: row.slot_magia_del_patto, level: row.livello_slot_magia_del_patto }, `warlock ${row.livello}`);
  }
  assert.deepEqual(spellSlotMaximums([{ classId: "mago", level: 5 }, { classId: "warlock", level: 3 }]),
    { slots: { 1: 4, 2: 3, 3: 2 }, pact: { count: 2, level: 2 }, casterLevel: 5 });
});

test("the Eldritch Knight and the Arcane Trickster cast from 3rd level, a third of their level rounded up", () => {
  const knight = (level) => spellSlotMaximums([{ classId: "guerriero", level, subclassId: "guerriero-cavaliere-mistico" }]).slots;
  assert.deepEqual(knight(2), {});
  assert.deepEqual(knight(3), { 1: 2 });
  assert.deepEqual(knight(4), { 1: 3 });
  assert.deepEqual(knight(7), { 1: 4, 2: 2 });
  assert.deepEqual(knight(13), { 1: 4, 2: 3, 3: 2 });
  assert.deepEqual(knight(19), { 1: 4, 2: 3, 3: 3, 4: 1 });
  assert.deepEqual(spellSlotMaximums([{ classId: "ladro", level: 20, subclassId: "ladro-mistificatore-arcano" }]).slots, knight(20));
  assert.deepEqual(spellSlotMaximums([{ classId: "guerriero", level: 20, subclassId: "guerriero-campione" }]).slots, {});
});

test("two spellcasting classes add their levels, rounded down, on the multiclass table", () => {
  assert.equal(spellcasterLevel([{ classId: "paladino", level: 6 }, { classId: "stregone", level: 3 }]), 6);
  assert.equal(spellcasterLevel([{ classId: "guerriero", level: 3, subclassId: "guerriero-cavaliere-mistico" }, { classId: "mago", level: 2 }]), 3);
  assert.equal(spellcasterLevel([{ classId: "ranger", level: 5 }, { classId: "druido", level: 1 }]), 3);
  // A half caster below 2nd level has no Spellcasting yet: the other class keeps its own table.
  assert.equal(spellcasterLevel([{ classId: "paladino", level: 1 }, { classId: "ranger", level: 3 }]), 2);
  assert.equal(spellcasterLevel([{ classId: "paladino", level: 1 }, { classId: "guerriero", level: 5 }]), 0);
  assert.equal(spellcasterLevel([{ classId: "mago", level: 12 }, { classId: "chierico", level: 8 }]), 20);
});

test("slot pools: one per level and one for Pact Magic, their maximum from the build", () => {
  assert.deepEqual(SPELL_SLOT_RESOURCE_POOLS.map((pool) => pool.id),
    [...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(spellSlotPoolId), SPELL_SLOT_PACT_POOL_ID]);
  assert.equal(spellSlotPoolId(0), "");
  const pool = (id) => SPELL_SLOT_RESOURCE_POOLS.find((entry) => entry.id === id);
  const build = [{ classId: "mago", level: 5 }, { classId: "warlock", level: 3 }];
  assert.equal(spellSlotPoolMaximum(pool("spell-slot-3"), build), 2);
  assert.equal(spellSlotPoolMaximum(pool("spell-slot-4"), build), 0);
  assert.equal(spellSlotPoolMaximum(pool(SPELL_SLOT_PACT_POOL_ID), build), 2);
  assert.equal(spellSlotPoolMaximum({ capacity: { type: "fixed", value: 3 } }, build), null);
  assert.deepEqual(pool(SPELL_SLOT_PACT_POOL_ID).refresh.map((entry) => entry.event), ["riposo_breve", "riposo_lungo"]);
  assert.deepEqual(pool("spell-slot-1").refresh.map((entry) => entry.event), ["riposo_lungo"]);
  assert.equal(isSpellSlotPool(pool("spell-slot-1")), true);
  assert.equal(hasSpellSlots([{ classId: "barbaro", level: 10 }]), false);
  assert.equal(hasSpellSlots([{ classId: "warlock", level: 1 }]), true);
});

test("the sheet reads one row per slot level, then Pact Magic, unspent slots available, created slots above the maximum", () => {
  const rows = spellSlotStatus([{ classId: "mago", level: 5 }, { classId: "warlock", level: 3 }], {
    "spell-slot-1": { current: 1, maximum: 4 },
    "spell-slot-3": { current: 3, maximum: 2 },
    "spell-slot-pact": { current: null, maximum: 2 },
    "stregone-punti-stregoneria": { current: 1, maximum: 5 },
  });
  assert.deepEqual(rows, [
    { poolId: "spell-slot-1", maximum: 4, current: 1, temporary: 0, level: 1, pact: false },
    { poolId: "spell-slot-2", maximum: 3, current: 3, temporary: 0, level: 2, pact: false },
    { poolId: "spell-slot-3", maximum: 2, current: 3, temporary: 1, level: 3, pact: false },
    { poolId: "spell-slot-pact", maximum: 2, current: 2, temporary: 0, level: 2, pact: true },
  ]);
  assert.deepEqual(spellSlotStatus([{ classId: "barbaro", level: 5 }]), []);
});

test("spellSlotCore stays free of the catalogs and of classFeatureCore", () => {
  const source = readFileSync(new URL("../src/spellSlotCore.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /^\s*import\s/m);
});
