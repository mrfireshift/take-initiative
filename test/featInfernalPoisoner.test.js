// Lot F7-1 of docs/STUDIO_TALENTI.md (decision N3): Infernal Constitution's resistance to cold and poison, read as a class
// feature's passive defenses, and Poisoner's potent poison, an activation of the attack console on a weapon's hit: a
// Constitution save DC 14; on a failure 2d8 poison and Poisoned until the end of the attacker's next turn; on a success
// nothing. The expectations are read from the books' text, not from the definitions under test.
import test, { mock } from "node:test";
import assert from "node:assert/strict";

mock.module("@owlbear-rodeo/sdk", {
  exports: {
    default: { onReady() {}, scene: { items: { getItems: async () => [] } } },
    buildPath: () => ({}), buildLabel: () => ({}), buildImage: () => ({}), buildText: () => ({}), buildShape: () => ({}),
    Command: { MOVE: 0, LINE: 1, CUBIC: 2, CLOSE: 3 },
  },
});

const { damageDefensesForItem, profileDamageDefenses } = await import("../src/damageDefensesCore.js");
const { buildPcAttackMutation, pcAttackActivationOptions, pcAttackPreview } = await import("../src/pcAttackCore.js");

const META = "com.thebigpicture.initiative/meta";
const POISON = "talento-maestria-dei-veleni-veleno-potente";
const dagger = { id: "dagger", label: "Pugnale", kind: "attack", range: "melee", components: [{ type: "piercing", formula: "1d4+3" }] };
const creature = (id, name, meta = {}) => ({ id, name, type: "IMAGE", layer: "CHARACTER", metadata: { [META]: { hp: 30, hpMax: 30, inInitiative: true, ...meta } } });
const tiefling = (feats) => creature("tief", "Tiefling", { attitude: "pc", initiativeCard: { characterBuild: [{ classId: "ladro", level: 4 }],
  species: { id: "tiefling" }, abilityModifiers: { con: 2 }, feats } });
const poisoner = (feats = [{ id: "maestria-dei-veleni" }]) => creature("pc", "Pg", { attitude: "pc", initiativeCard: {
  characterBuild: [{ classId: "ladro", level: 4 }], abilityModifiers: { dex: 3 }, quickActions: [dagger], feats } });
const ogre = creature("ogre", "Ogre", { attitude: "enemy" });
const ownTurn = { round: 2, order: ["pc", "ogre"], current: 0 };
const option = (sourceItem, overrides = {}) => pcAttackActivationOptions({ action: dagger, sourceItem, targetItem: ogre, turnState: ownTurn,
  outcome: "hit", ...overrides }).find((entry) => entry.id === POISON);
const attack = (saveOutcome, extra = {}) => buildPcAttackMutation({ action: dagger, sourceItem: poisoner(), targetItem: ogre, outcome: "hit",
  componentAmounts: { c1: 5 }, attackInstanceId: "a1", turnState: ownTurn, expectedDefenses: {},
  activations: [{ id: POISON, type: "poison", amount: 7, saveOutcome, ...extra }] });

test("Infernal Constitution: resistance to cold and poison with the feat, beside the tiefling's fire, never written on the card", () => {
  const card = (item) => item.metadata[META].initiativeCard;
  assert.deepEqual(profileDamageDefenses(card(tiefling([]))).resistances, ["fire"]);
  assert.deepEqual(profileDamageDefenses(card(tiefling([{ id: "costituzione-infernale", ability: "con" }]))).resistances, ["cold", "fire", "poison"]);
  assert.deepEqual(profileDamageDefenses({ feats: [{ id: "costituzione-infernale", ability: "con" }] }).resistances, ["cold", "poison"],
    "without a class build too");
  const item = tiefling([{ id: "costituzione-infernale", ability: "con" }]);
  assert.deepEqual(damageDefensesForItem(item, META).resistances, ["cold", "fire", "poison"]);
  assert.equal(item.metadata[META].initiativeCard.damageDefenses, undefined);
});

test("Infernal Constitution in the attack console: 9 cold become 4", () => {
  const frost = { id: "frost", label: "Ascia gelida", kind: "attack", range: "melee", components: [{ type: "cold", formula: "1d8" }] };
  const target = tiefling([{ id: "costituzione-infernale", ability: "con" }]);
  const result = buildPcAttackMutation({ action: frost, sourceItem: creature("orc", "Orco", { attitude: "enemy", initiativeCard: { quickActions: [frost] } }),
    targetItem: target, outcome: "hit", componentAmounts: { c1: 9 }, attackInstanceId: "a1", turnState: { round: 1, order: ["orc", "tief"], current: 0 },
    expectedDefenses: damageDefensesForItem(target, META) });
  assert.equal(result.change.requested, 4);
});

test("the potent poison: on a weapon's hit, Constitution save DC 14, 2d8 poison; not for a spell, not without the feat", () => {
  const listed = option(poisoner());
  assert.deepEqual([listed.label, listed.dice, listed.types, listed.save.ability, listed.save.dc, listed.damageOnFailedSave, listed.available],
    ["Veleno potente", "2d8", ["poison"], "con", 14, true, true]);
  assert.equal(option(poisoner([])), undefined);
  assert.equal(option(poisoner(), { outcome: "miss" }).available, false);
});

test("a failed save: 7 poison more and Poisoned until the end of the attacker's next turn", () => {
  const result = attack("failed");
  assert.equal(result.change.requested, 12);
  const poisoned = result.operations.find((operation) => operation.type === "condition:add" && operation.conditionName === "Avvelenato");
  assert.deepEqual(poisoned.targetIds, ["ogre"]);
  assert.deepEqual(poisoned.options.expiry, { mode: "turn-end", actor: "source", remaining: 1, anchor: "next-turn", actorId: "pc" });
  const record = result.causality.activations.find((entry) => entry.featureId === POISON);
  assert.deepEqual([record.save.dc, record.save.outcome, record.amount], [14, "failed", 7]);
});

test("a passed save: no damage and no condition; the console asks no number", () => {
  const result = attack("passed");
  assert.equal(result.change.requested, 5);
  assert.equal(result.operations.some((operation) => operation.conditionName === "Avvelenato"), false);
  const preview = pcAttackPreview({ action: dagger, sourceItem: poisoner(), targetItem: ogre, outcome: "hit", amounts: { c1: 5 }, turnState: ownTurn,
    activations: [{ id: POISON, type: "poison", amount: "", saveOutcome: "passed" }] });
  assert.deepEqual([preview.ready, preview.total], [true, 5]);
  const asked = pcAttackPreview({ action: dagger, sourceItem: poisoner(), targetItem: ogre, outcome: "hit", amounts: { c1: 5 }, turnState: ownTurn,
    activations: [{ id: POISON, type: "poison", amount: "", saveOutcome: "failed" }] });
  assert.equal(asked.blocker, "Inserisci il danno di Veleno potente.");
});
