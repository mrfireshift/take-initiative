// Lot F8-3 of docs/STUDIO_TALENTI.md (plan §7.34.4, decision P4): Dwarven Fortitude. With the Dodge of the attack console's
// Azioni tab, the Hit Die the GM writes + the Constitution modifier, never below 0, up to the maximum; the temporary hit
// points untouched; in the Dodge's own command. Empty, the Dodge of always. The numbers are those of §7.34.4.
import assert from "node:assert/strict";
import test, { mock } from "node:test";

mock.module("@owlbear-rodeo/sdk", {
  exports: {
    default: { onReady() {}, scene: { items: { getItems: async () => [] } } },
    buildPath: () => ({}), buildLabel: () => ({}), buildImage: () => ({}), buildText: () => ({}), buildShape: () => ({}),
    Command: { MOVE: 0, LINE: 1, CUBIC: 2, CLOSE: 3 },
  },
});

const { buildPcTurnActionMutation, pcDwarvenFortitudeOffered, pcDwarvenFortitudePlan, pcTurnActionBlocker } = await import("../src/pcAttackTurnActionCore.js");

const META = "com.thebigpicture.initiative/meta";
const dwarf = ({ hp = 20, hpMax = 45, tempHp = 0, con = 3, feats = [{ id: "tempra-nanica", ability: "con" }] } = {}) => ({ id: "nano", name: "Nano",
  type: "IMAGE", layer: "CHARACTER", position: { x: 0, y: 0 }, metadata: { [META]: { hp, hpMax, tempHp, inInitiative: true, attitude: "pc",
    initiativeCard: { characterBuild: [{ classId: "guerriero", level: 5 }], abilityModifiers: { con }, species: { id: "nano" }, feats } } } });
const turnState = { round: 2, order: ["nano", "ogre"], current: 0 };
const dodge = (item, fortitude) => buildPcTurnActionMutation({ kind: "dodge", sourceItem: item, attackInstanceId: "dodge-1", turnState, fortitude });
const hpSet = (result) => result.operations.find((operation) => operation.type === "hp:set")?.updates[0];

test("the numbers of the plan: 20/45, Con +3, roll 7: 30; roll 1, Con −2: +0; 43/45: 45", () => {
  assert.deepEqual([pcDwarvenFortitudePlan(dwarf(), "7").amount, pcDwarvenFortitudePlan(dwarf(), "7").change.afterHP], [10, 30]);
  assert.deepEqual([pcDwarvenFortitudePlan(dwarf({ con: -2 }), 1).amount, pcDwarvenFortitudePlan(dwarf({ con: -2 }), 1).change.afterHP], [0, 20]);
  assert.equal(pcDwarvenFortitudePlan(dwarf({ hp: 43 }), 7).change.afterHP, 45);
  assert.equal(pcDwarvenFortitudePlan(dwarf(), ""), null, "empty: nothing");
  assert.equal(pcDwarvenFortitudePlan(dwarf({ tempHp: 5 }), 7).change.afterTempHp, 5, "the temporary hit points untouched");
});

test("the Dodge's command: its pill and the cure in one command; empty, the Dodge of always", () => {
  const cured = dodge(dwarf(), "7");
  assert.deepEqual([hpSet(cured).hp, hpSet(cured).hpIntent.mode, hpSet(cured).hpIntent.amount], [30, "heal", 10]);
  assert.ok(cured.operations.some((operation) => operation.type === "condition:add" && operation.conditionName === "Schivata"));
  assert.deepEqual(cured.causality.turnAction.fortitude, { name: "Tempra Nanica", roll: 7, con: 3, amount: 10, before: 20, after: 30 });
  const plain = dodge(dwarf(), "");
  assert.equal(hpSet(plain), undefined);
  assert.equal(plain.causality.turnAction.fortitude, undefined);
  assert.equal(hpSet(dodge(dwarf({ con: -2 }), 1)), undefined, "+0: no write");
});

test("the roll: an integer from 1 to 12, only with the feat; offered only to who has it", () => {
  const blocker = (item, fortitude) => pcTurnActionBlocker({ kind: "dodge", sourceItem: item, turnState, fortitude });
  assert.equal(blocker(dwarf(), "0"), "Tempra Nanica: il tiro del Dado Vita, un intero da 1 a 12.");
  assert.equal(blocker(dwarf(), "13"), "Tempra Nanica: il tiro del Dado Vita, un intero da 1 a 12.");
  assert.equal(blocker(dwarf(), "2.5"), "Tempra Nanica: il tiro del Dado Vita, un intero da 1 a 12.");
  assert.equal(blocker(dwarf({ feats: [] }), "7"), "Tempra Nanica: il talento non è nella scheda.");
  assert.equal(blocker(dwarf(), ""), "");
  assert.throws(() => dodge(dwarf(), "13"), /un intero da 1 a 12/u);
  assert.equal(pcDwarvenFortitudeOffered(dwarf()), true);
  assert.equal(pcDwarvenFortitudeOffered(dwarf({ feats: [] })), false);
});
