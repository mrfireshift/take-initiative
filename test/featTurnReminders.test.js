// Lot F8-1 of docs/STUDIO_TALENTI.md (decisions P1, P2, P5, P6): Charger's +5 on a melee hit of its own turn, warned without a
// Dash of the console and its Shove to 3 m; Shield Master's and Tavern Brawler's bonus actions as reminders after the attack;
// Shield Master's reminder on a Dexterity save; Skulker's ranged miss that leaves Nascosto. The expectations are read from
// the Player's Handbook's text, not from the definitions under test.
import assert from "node:assert/strict";
import test, { mock } from "node:test";

mock.module("@owlbear-rodeo/sdk", {
  exports: {
    default: { onReady() {}, scene: { items: { getItems: async () => [] } } },
    buildPath: () => ({}), buildLabel: () => ({}), buildImage: () => ({}), buildText: () => ({}), buildShape: () => ({}),
    Command: { MOVE: 0, LINE: 1, CUBIC: 2, CLOSE: 3 },
  },
});

const { HIDDEN_CONDITION, pcAttackTargetNotes } = await import("../src/pcAttackTurnActionCore.js");
const { SHIELD_MASTER_SAVE_NOTE, shieldMasterDexSave } = await import("../src/attackAdvantagePillsCore.js");
const { buildPcAttackMutation, pcAttackActivationOptions, pcAttackFollowUps } = await import("../src/pcAttackCore.js");
const { buildPcManeuverMutation } = await import("../src/pcAttackManeuverCore.js");

const META = "com.thebigpicture.initiative/meta";
const sword = { id: "sword", label: "Spada lunga", kind: "attack", range: "melee", components: [{ type: "slashing", formula: "1d8+3" }] };
const bow = { id: "bow", label: "Arco lungo", kind: "attack", range: "ranged", components: [{ type: "piercing", formula: "1d8+2" }] };
const fist = { id: "fist", label: "Colpo senz'armi", kind: "attack", range: "melee", components: [{ type: "bludgeoning", formula: "1d4+3" }] };
const mug = { id: "mug", label: "Boccale (arma improvvisata)", kind: "attack", range: "melee", components: [{ type: "bludgeoning", formula: "1d4+3" }] };
const creature = (id, name, meta = {}) => ({ id, name, type: "IMAGE", layer: "CHARACTER", position: { x: 0, y: 0 },
  metadata: { [META]: { hp: 30, hpMax: 30, inInitiative: true, ...meta } } });
const pc = (feats, meta = {}) => creature("pc", "Pg", { attitude: "pc", initiativeCard: { characterBuild: [{ classId: "guerriero", level: 4 }],
  abilityModifiers: { str: 3, dex: 2 }, quickActions: [sword, bow, fist, mug], feats: feats.map((id) => ({ id })) }, ...meta });
const ogre = creature("ogre", "Ogre", { attitude: "enemy" });
const ownTurn = { round: 2, order: ["pc", "ogre"], current: 0 };
const ogreTurn = { ...ownTurn, current: 1 };
const CHARGE = "talento-carica";
const charge = (sourceItem, extra = {}) => pcAttackActivationOptions({ action: sword, sourceItem, targetItem: ogre, turnState: ownTurn, outcome: "hit", ...extra })
  .find((entry) => entry.id === CHARGE);
const dashed = (item) => ({ ...item, metadata: { [META]: { ...item.metadata[META], pcAttackState: { version: 1, turnActions: { turnKey: "2:0:pc", dashes: 1 } } } } });

test("Charger: «Carica (+5)» on a melee hit of its own turn, warned without a Dash of the console; not at range nor off its turn", () => {
  const listed = charge(pc(["carica"]));
  assert.deepEqual([listed.label, listed.dice, listed.available], ["Carica (+5)", "+5", true]);
  assert.match(listed.warning, /Nessuno Scatto dalla console in questo turno/u);
  assert.equal(charge(dashed(pc(["carica"]))).warning, undefined, "after the console's Dash");
  assert.equal(charge(pc(["carica"]), { action: bow }).available, false);
  assert.equal(charge(pc(["carica"]), { turnState: ogreTurn }).reason, "Solo nel proprio turno.");
  assert.equal(charge(pc([])), undefined, "without the feat");
  const hit = buildPcAttackMutation({ action: sword, sourceItem: dashed(pc(["carica"])), targetItem: ogre, outcome: "hit", componentAmounts: { c1: 8 },
    attackInstanceId: "a1", turnState: ownTurn, expectedDefenses: {}, activations: [{ id: CHARGE, type: "slashing", amount: 5 }] });
  assert.equal(hit.change.requested, 13);
});

test("Charger's Shove: the push up to 3 m in its note", () => {
  const shove = (feats) => buildPcManeuverMutation({ kind: "shove", sourceItem: pc(feats), targetItem: ogre, outcome: "success", effect: "push",
    attackInstanceId: "s1", turnState: ownTurn }).causality.maneuver.manual;
  assert.match(shove(["carica"]), /fino a 3 m con la Carica/u);
  assert.doesNotMatch(shove([]), /Carica/u);
});

test("the reminders after the attack: Shield Master's shove after a weapon attack, Tavern Brawler's grapple after an unarmed or improvised hit", () => {
  const card = (feats) => pc(feats).metadata[META].initiativeCard;
  const notes = (feats, attack, outcome = "hit") => pcAttackFollowUps(card(feats), [], [], { attack, outcome });
  assert.ok(notes(["maestro-degli-scudi"], sword).some((note) => /Maestro degli Scudi: con l'azione di Attacco, puoi spingere/u.test(note)));
  assert.ok(notes(["maestro-degli-scudi"], sword, "miss").some((note) => /Maestro degli Scudi/u.test(note)), "the shove does not need a hit");
  assert.ok(notes(["lottatore-da-taverna"], fist).some((note) => /Lottatore da Taverna: nel tuo turno puoi tentare di afferrare/u.test(note)));
  assert.ok(notes(["lottatore-da-taverna"], mug).some((note) => /Lottatore da Taverna/u.test(note)));
  assert.equal(notes(["lottatore-da-taverna"], fist, "miss").some((note) => /Lottatore da Taverna/u.test(note)), false, "only on a hit");
  assert.equal(notes(["lottatore-da-taverna"], sword).some((note) => /Lottatore da Taverna/u.test(note)), false, "a sword");
  assert.deepEqual(notes([], sword), []);
});

test("Shield Master on a Dexterity save: the reminder, not on another save, not without the feat", () => {
  assert.equal(shieldMasterDexSave(pc(["maestro-degli-scudi"]), "dex"), true);
  assert.equal(shieldMasterDexSave(pc(["maestro-degli-scudi"]), "con"), false);
  assert.equal(shieldMasterDexSave(pc([]), "dex"), false);
  assert.match(SHIELD_MASTER_SAVE_NOTE, /0 se supera/u);
});

test("Skulker: a ranged weapon's miss leaves Nascosto; a hit, a melee miss, or no feat reveal", () => {
  const hidden = (feats) => pc(feats, { conditions: { instances: [{ id: "hide-1", condition: HIDDEN_CONDITION, active: true, sourceId: "pc" }] } });
  const ends = (feats, action, outcome) => (buildPcAttackMutation({ action, sourceItem: hidden(feats), targetItem: ogre, outcome,
    componentAmounts: outcome === "miss" ? {} : { c1: 6 }, attackInstanceId: "a1", turnState: ownTurn, expectedDefenses: {} }).causality.linkEnds || [])
    .map((end) => end.condition);
  assert.deepEqual(ends(["appostato"], bow, "miss"), []);
  assert.deepEqual(ends(["appostato"], bow, "hit"), [HIDDEN_CONDITION]);
  assert.deepEqual(ends(["appostato"], sword, "miss"), [HIDDEN_CONDITION]);
  assert.deepEqual(ends([], bow, "miss"), [HIDDEN_CONDITION]);
  assert.ok(pcAttackTargetNotes({ attack: bow, targetItem: ogre, sourceItem: hidden(["appostato"]) })
    .includes("Nascosto: vantaggio all'attacco; se manca, resta nascosto (Appostato)."));
});
