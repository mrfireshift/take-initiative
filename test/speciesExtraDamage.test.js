// The species traits that add damage to a PC attack: Fury of the Small and Astral Spark spend their use as an
// activation, Savage Attacks adds a weapon die on a melee critical; Surprise Attack and the aasimar's transformations
// are riders (no use), limited by the combat's turn and the transformation's pill.
import assert from "node:assert/strict";
import test from "node:test";
import { buildPcAttackMutation, pcAttackActivationOptions, pcAttackRiderOptions, PC_ATTACK_STATE_FIELD } from "../src/pcAttackCore.js";
import { CLASS_FEATURE_STATE_FIELD } from "../src/classFeatureCore.js";

const META = "com.thebigpicture.initiative/meta";
const sword = { id: "sword", label: "Spada lunga", kind: "attack", range: "melee", components: [{ type: "slashing", formula: "1d8+3" }] };
const bow = { id: "bow", label: "Arco lungo", kind: "attack", range: "ranged", components: [{ type: "piercing", formula: "1d8+2" }] };
const blast = { id: "cantrip", label: "Trucchetto", kind: "attack", source: { kind: "cantrip", spellIds: ["fire-bolt"] } };
const creature = (id, name, meta = {}) => ({ id, name, type: "IMAGE", layer: "CHARACTER", metadata: { [META]: { hp: 40, hpMax: 40, inInitiative: true, ...meta } } });
const actor = (species, level = 5, meta = {}) => creature("pc", "Pg", { initiativeCard: { characterBuild: [{ classId: "guerriero", level }],
  abilityModifiers: { str: 3, dex: 2, con: 2, int: 0, wis: 1, cha: 2 }, species, quickActions: [sword, bow, blast] }, ...meta });
const ogre = () => creature("ogre", "Ogre");
const ownTurn = { round: 2, order: ["pc", "ogre"], current: 0 };
const option = (list, id) => list.find((entry) => entry.id === id);
const activations = (sourceItem, overrides = {}) => pcAttackActivationOptions({ action: sword, sourceItem, targetItem: ogre(), turnState: ownTurn, outcome: "hit", ...overrides });
const riders = (sourceItem, overrides = {}) => pcAttackRiderOptions({ action: sword, sourceItem, targetItem: ogre(), turnState: ownTurn, ...overrides });
const attack = (sourceItem, extra, overrides = {}) => buildPcAttackMutation({ action: sword, sourceItem, targetItem: ogre(), outcome: "hit",
  componentAmounts: { c1: 8 }, attackInstanceId: "a1", turnState: ownTurn, expectedDefenses: {}, ...extra, ...overrides });
const after = (result, item) => ({ ...item, metadata: { [META]: { ...item.metadata[META],
  [PC_ATTACK_STATE_FIELD]: result.options.metadataPatches[0].fields[PC_ATTACK_STATE_FIELD].value,
  ...(result.options.metadataPatches[0].fields[CLASS_FEATURE_STATE_FIELD]
    ? { [CLASS_FEATURE_STATE_FIELD]: result.options.metadataPatches[0].fields[CLASS_FEATURE_STATE_FIELD].value } : {}) } } });

test("Fury of the Small: the level (Volo) with its one use, the proficiency bonus once per turn (Mostri del Multiverso)", () => {
  const goblin = actor({ id: "goblin" });
  const fury = option(activations(goblin), "specie-goblin-furia-dei-piccoli");
  assert.deepEqual([fury.dice, fury.types, fury.available, fury.size], ["+5", ["slashing"], true, "contro una creatura più grande del goblin"]);
  assert.equal(option(activations(goblin, { action: blast, spellId: "fire-bolt" }), "specie-goblin-furia-dei-piccoli").available, true, "with a spell attack too");
  const result = attack(goblin, { activations: [{ id: "specie-goblin-furia-dei-piccoli", type: "slashing", amount: 5 }] });
  assert.equal(result.change.requested, 13);
  assert.equal(result.options.metadataPatches[0].fields[CLASS_FEATURE_STATE_FIELD].value.resources["specie-goblin-furia-dei-piccoli-usi"].current, 0);
  assert.match(option(activations(after(result, goblin)), "specie-goblin-furia-dei-piccoli").reason, /nessun uso rimasto/);
  const motm = actor({ id: "goblin-multiverso" });
  assert.equal(option(activations(motm), "specie-goblin-multiverso-furia-dei-piccoli").dice, "+3");
  const once = attack(motm, { activations: [{ id: "specie-goblin-multiverso-furia-dei-piccoli", type: "slashing", amount: 3 }] });
  assert.equal(option(activations(after(once, motm)), "specie-goblin-multiverso-furia-dei-piccoli").reason, "Già usato in questo turno.");
});

test("Astral Spark: force equal to the proficiency bonus, with a weapon only", () => {
  const giff = actor({ id: "giff" });
  const spark = option(activations(giff), "specie-giff-scintilla-astrale");
  assert.deepEqual([spark.dice, spark.types, spark.available], ["+3", ["force"], true]);
  assert.equal(option(activations(giff, { action: blast, spellId: "fire-bolt" }), "specie-giff-scintilla-astrale").reason, "Solo per gli attacchi con arma.");
});

test("Savage Attacks: one die of the weapon on a melee critical, not doubled again", () => {
  const halfOrc = actor({ id: "mezzorco" });
  assert.equal(option(activations(halfOrc), "specie-mezzorco-attacchi-selvaggi").reason, "Solo con un colpo critico.");
  const savage = option(activations(halfOrc, { outcome: "critical" }), "specie-mezzorco-attacchi-selvaggi");
  assert.deepEqual([savage.dice, savage.noCriticalDouble, savage.available], ["1d8", true, true]);
  assert.equal(option(activations(halfOrc, { action: bow, outcome: "critical" }), "specie-mezzorco-attacchi-selvaggi").reason, "Solo per gli attacchi in mischia.");
});

test("Surprise Attack: the bugbear's first turn (Volo), a creature that has not acted yet (Mostri del Multiverso)", () => {
  const volo = actor({ id: "bugbear" });
  const firstRound = { round: 1, order: ["pc", "ogre"], current: 0 };
  assert.equal(option(riders(volo, { turnState: firstRound }), "specie-bugbear-attacco-a-sorpresa").available, true);
  assert.equal(option(riders(volo), "specie-bugbear-attacco-a-sorpresa").reason, "Solo nel primo round del combattimento.");
  assert.equal(option(riders(volo, { turnState: null }), "specie-bugbear-attacco-a-sorpresa").reason, "Solo in combattimento.");
  const motm = actor({ id: "bugbear-multiverso" });
  const surprise = option(riders(motm, { turnState: firstRound }), "specie-bugbear-multiverso-attacco-a-sorpresa");
  assert.deepEqual([surprise.available, surprise.dice], [true, "2d6"], "the ogre comes after the bugbear");
  assert.equal(option(riders(motm, { turnState: { round: 1, order: ["ogre", "pc"], current: 1 } }), "specie-bugbear-multiverso-attacco-a-sorpresa").reason,
    "Il bersaglio ha già agito in questo combattimento.");
  assert.equal(option(riders(motm, { action: { ...blast, source: { kind: "cantrip", spellIds: ["poison-spray"] } }, spellId: "poison-spray", turnState: firstRound }),
    "specie-bugbear-multiverso-attacco-a-sorpresa").reason, "Solo con un tiro per colpire.", "never with a saving throw");
});

test("the aasimar's transformations: while active, once on the aasimar's turn, the level or the proficiency bonus", () => {
  const off = actor({ id: "aasimar", ancestryId: "protettore" });
  assert.match(option(riders(off), "specie-aasimar-anima-radiosa").reason, /non è attiva/);
  const on = actor({ id: "aasimar", ancestryId: "protettore" }, 5, { [CLASS_FEATURE_STATE_FIELD]: { version: 1, resources: {},
    instances: [{ instanceId: "t1", featureId: "specie-aasimar-anima-radiosa", sourceId: "pc", targetIds: ["pc"], startedRound: 2, expiresRound: 11 }] } });
  const soul = option(riders(on), "specie-aasimar-anima-radiosa");
  assert.deepEqual([soul.available, soul.dice, soul.types], [true, "+5", ["radiant"]]);
  const result = attack(on, { riders: [{ id: "specie-aasimar-anima-radiosa", type: "radiant", amount: 5 }] });
  assert.equal(result.change.requested, 13);
  assert.equal(option(riders(after(result, on)), "specie-aasimar-anima-radiosa").reason, "Già usato in questo turno.");
  assert.equal(option(riders(on, { turnState: { ...ownTurn, current: 1 } }), "specie-aasimar-anima-radiosa").reason, "Solo nel proprio turno.");
  const motm = actor({ id: "aasimar-multiverso", ancestryId: "consunzione-radiosa" }, 5, { [CLASS_FEATURE_STATE_FIELD]: { version: 1, resources: {},
    instances: [{ instanceId: "t2", featureId: "specie-aasimar-multiverso-rivelazione-celestiale-radiosita", sourceId: "pc", targetIds: ["pc"],
      startedRound: 2, expiresRound: 11 }] } });
  assert.equal(option(riders(motm), "specie-aasimar-multiverso-rivelazione-celestiale-radiosita").dice, "+3");
});
