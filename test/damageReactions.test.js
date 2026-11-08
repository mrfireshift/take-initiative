// Avvisi di reazione, lot R3b-1 (docs/STUDIO_AVVISI_REAZIONE.md §6.7): the reactions that change the damage of one
// attack. The expectations follow the PHB 2014 and decisions E1 (halve, then reduce, then resistance and vulnerability)
// and E2 (a reduction from the components in the console's order, only from the types it covers, never below 0).
import test, { mock } from "node:test";
import assert from "node:assert/strict";

mock.module("@owlbear-rodeo/sdk", {
  exports: {
    default: { onReady() {}, scene: { items: { getItems: async () => [] } } },
    buildPath: () => ({}), buildLabel: () => ({}), buildImage: () => ({}), buildText: () => ({}), buildShape: () => ({}),
    Command: { MOVE: 0, LINE: 1, CUBIC: 2, CLOSE: 3 },
  },
});

const { adjustForDamageReactions, damageReactionAmount, defenseWithReactionResistance, normalizeDamageReactions } = await import("../src/damageReactionCore.js");
const { defendedComponents } = await import("../src/bossActionExecutionCore.js");

const META = "com.thebigpicture.initiative/meta";
const target = (damageDefenses = { immunities: [], resistances: [], vulnerabilities: [] }) => ({ id: "t", name: "Vex",
  metadata: { [META]: { hp: 40, hpMax: 40, attitude: "pc", initiativeCard: { damageDefenses } } } });
const uncanny = { reactionId: "uncanny-dodge", reactorId: "t", reactorName: "Vex", featureId: "ladro-schivata-prodigiosa" };
const parry = (amount) => ({ reactionId: "parry-maneuver", reactorId: "dars", reactorName: "Dars", featureId: "guerriero-maestro-di-battaglia-manovre-parata", amount });
const spectral = { reactionId: "spectral-defense", reactorId: "t", reactorName: "Vex", featureId: "ranger-viandante-dell-orizzonte-difesa-spettrale" };
const sum = (pieces) => pieces.reduce((total, piece) => total + piece.amount, 0);
const two = [{ id: "c1", type: "slashing" }, { id: "c2", type: "slashing" }];

test("the reactions a request may carry: R3b modifiers only, one per creature and reaction, their amounts", () => {
  assert.deepEqual(normalizeDamageReactions([uncanny, uncanny, { reactionId: "shield", reactorId: "t" }, { reactionId: "nope", reactorId: "t" },
    { reactionId: "tomb-of-levistus", reactorId: "t" }]).map((entry) => entry.reactionId), ["uncanny-dodge"], "Tomb of Levistus is its own flow (E6)");
  assert.equal(damageReactionAmount(parry(7)), 7);
  assert.equal(damageReactionAmount(parry(-3)), 0);
  assert.equal(damageReactionAmount({ reactionId: "song-of-defense", slotLevel: 3 }), 15, "E4: 5 × the slot's level");
  assert.equal(normalizeDamageReactions([{ reactionId: "warding-maneuver", reactorId: "k" }])[0].kind, "resistance", "E7");
});

test("halving follows the type's sum, as the defenses do: 7 + 3 slashing halved is 5", () => {
  const result = adjustForDamageReactions({ components: two, inputs: { c1: 7, c2: 3 }, factor: "full", reactions: [uncanny] });
  assert.equal(result.inputs.c1 + result.inputs.c2, 5);
  assert.equal(result.factor, "full", "the halving is in the inputs");
  assert.deepEqual(result.records, [{ reactionId: "uncanny-dodge", reactorId: "t", text: "Schivata Prodigiosa di Vex: danno dimezzato" }]);
  const save = adjustForDamageReactions({ components: two, inputs: { c1: 20, c2: 0 }, factor: "half", reactions: [uncanny] });
  assert.equal(save.inputs.c1 + save.inputs.c2, 5, "a passed save's half, then halved again");
  assert.equal(adjustForDamageReactions({ components: two, inputs: { c1: 7, c2: 3 }, factor: "zero", reactions: [uncanny] }).active, false, "no damage");
});

test("E1 and E2: halve, then reduce in the console's order, only the types covered, never below 0", () => {
  const mixed = [{ id: "c1", type: "slashing" }, { id: "c2", type: "fire" }];
  const both = adjustForDamageReactions({ components: mixed, inputs: { c1: 16, c2: 4 }, factor: "full", reactions: [parry(9), uncanny] });
  assert.deepEqual(both.inputs, { c1: 0, c2: 1 }, "halved to 8 + 2, then 9 off the slashing first, then the fire");
  assert.equal(both.records.find((record) => record.reactionId === "parry-maneuver").text, "Parata di Dars: −9");
  const energy = { reactionId: "deflect-energy", reactorId: "m", reactorName: "Mo", amount: 10 };
  assert.deepEqual(adjustForDamageReactions({ components: mixed, inputs: { c1: 6, c2: 6 }, factor: "full", reactions: [energy] }).inputs,
    { c1: 6, c2: 0 }, "Deflect Energy only on its types: the slashing stays");
  const big = adjustForDamageReactions({ components: mixed, inputs: { c1: 3, c2: 2 }, factor: "full", reactions: [parry(40)] });
  assert.deepEqual(big.inputs, { c1: 0, c2: 0 });
  assert.equal(big.records[0].text, "Parata di Dars: −5", "the record says what it took");
});

test("resistance from a reaction: on top of the target's defenses, never stacked", () => {
  assert.equal(defenseWithReactionResistance(null), "resistance");
  assert.equal(defenseWithReactionResistance("resistance"), "resistance");
  assert.equal(defenseWithReactionResistance("immunity"), "immunity");
  assert.equal(defenseWithReactionResistance("vulnerability"), "resistance-vulnerability");
  const dampen = { reactionId: "dampen-elements", reactorId: "c", reactorName: "Ilse" };
  const mixed = [{ id: "c1", type: "slashing" }, { id: "c2", type: "fire" }];
  assert.deepEqual(adjustForDamageReactions({ components: mixed, inputs: { c1: 5, c2: 5 }, factor: "full", reactions: [dampen] }).resistanceTypes, ["fire"],
    "Dampen Elements: the elemental types only");
});

test("defendedComponents: without reactions exactly as before; with them, after the defenses the GM saw", () => {
  const components = [{ id: "c1", type: "slashing" }, { id: "c2", type: "fire" }];
  const inputs = { c1: 13, c2: 7 };
  const plain = target({ immunities: [], resistances: ["slashing"], vulnerabilities: ["fire"] });
  const before = defendedComponents(components, inputs, "full", plain, [], undefined);
  assert.deepEqual(defendedComponents(components, inputs, "full", plain, [], undefined, false, { reactions: [] }), before, "no reactions: the same");
  assert.equal(sum(before), 6 + 14);

  // Uncanny Dodge: 13 slashing halved 6, resisted 3; 7 fire halved 3, doubled 6.
  const dodged = defendedComponents(components, inputs, "full", plain, [], undefined, false, { reactions: [uncanny] });
  assert.equal(sum(dodged), 3 + 6);
  assert.equal(dodged[0].inputAmount, 13, "what the GM typed stays on the piece");
  // Spectral Defense: the slashing resistance does not stack (6), the fire becomes resistance and vulnerability (7: half
  // rounded down 3, doubled 6, as lot M6).
  const spectralRow = defendedComponents(components, inputs, "full", plain, [], undefined, false, { reactions: [spectral] });
  assert.equal(sum(spectralRow), 6 + 6);
  assert.equal(spectralRow[1].defense, "resistance-vulnerability");
  // A Parry bigger than the damage: nothing left.
  assert.equal(sum(defendedComponents(components, inputs, "full", plain, [], undefined, false, { reactions: [parry(30)] })), 0);
  // The check of the defenses the GM saw comes first, reactions or not.
  assert.throws(() => defendedComponents(components, inputs, "full", plain, [], { immunities: [], resistances: [], vulnerabilities: [] }, false,
    { reactions: [uncanny] }), /sono cambiate/u);
  // A defense the GM ignored stays ignored; the reaction's resistance still counts.
  const ignored = defendedComponents(components, inputs, "full", plain, ["slashing"], undefined, false, { reactions: [spectral] });
  assert.equal(ignored[0].defense, "resistance");
  assert.equal(ignored[0].amount, 6);
});

// Lot R3b-5: the spell panel's count (parts by type, one defense per type), the same in its preview and its commit.
test("spell damage: no reactions, null (the panel's own count stays)", async () => {
  const { spellDamageWithReactions } = await import("../src/damageReactionCore.js");
  assert.equal(spellDamageWithReactions({ parts: [{ type: "fire", amount: 20 }], reactions: [] }), null);
});

test("spell damage: halved, then reduced, then the creature's own defense", async () => {
  const { spellDamageWithReactions } = await import("../src/damageReactionCore.js");
  const field = { reactionId: "protective-field", reactorId: "dars", reactorName: "Dars", amount: 3 };
  const result = spellDamageWithReactions({ parts: [{ type: "fire", amount: 21 }], factor: "half",
    defenseFor: () => "resistance", reactions: [field] });
  assert.equal(result.value, 3, "21 halved is 10, less 3 is 7, resisted is 3");
  assert.deepEqual(result.records.map((record) => record.text), ["Campo Protettivo di Dars: −3"]);
});

test("spell damage: a reaction's resistance does not stack, on a vulnerable creature it cancels out", async () => {
  const { spellDamageWithReactions } = await import("../src/damageReactionCore.js");
  const dampen = { reactionId: "dampen-elements", reactorId: "cleric", reactorName: "Ilse" };
  assert.equal(spellDamageWithReactions({ parts: [{ type: "fire", amount: 20 }], defenseFor: () => "resistance", reactions: [dampen] }).value, 10);
  assert.equal(spellDamageWithReactions({ parts: [{ type: "fire", amount: 20 }], defenseFor: () => "vulnerability", reactions: [dampen] }).value, 20);
  assert.equal(spellDamageWithReactions({ parts: [{ type: "fire", amount: 20 }], reactions: [dampen] }).value, 10);
});

test("spell damage in two parts: a reduction from the first part, each type with its own defense", async () => {
  const { spellDamageWithReactions } = await import("../src/damageReactionCore.js");
  const field = { reactionId: "protective-field", reactorId: "dars", reactorName: "Dars", amount: 5 };
  const result = spellDamageWithReactions({ parts: [{ type: "fire", amount: 4 }, { type: "radiant", amount: 10 }],
    defenseFor: (type) => (type === "radiant" ? "resistance" : null), reactions: [field] });
  assert.equal(result.value, 4, "fire 4 to 0, radiant 10 less the last 1 is 9, resisted is 4");
});
