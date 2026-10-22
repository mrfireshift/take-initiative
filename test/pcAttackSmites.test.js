import assert from "node:assert/strict";
import test from "node:test";
import { buildPcAttackMutation, pcAttackPreview, pcAttackRiderOptions, PC_ATTACK_STATE_FIELD } from "../src/pcAttackCore.js";
import { getPcAttackRider, pcAttackRiderDice, pcAttackRiderSlotLevels } from "../src/pcAttackRiderCatalog.js";

const META = "com.thebigpicture.initiative/meta";
const longsword = { id: "longsword", label: "Spada lunga", kind: "attack", range: "melee", components: [{ type: "slashing", formula: "1d8+3" }] };
const javelin = { id: "javelin", label: "Giavellotto", kind: "attack", range: "ranged", components: [{ type: "piercing" }] };
const creature = (id, name, meta = {}) => ({ id, name, type: "IMAGE", layer: "CHARACTER", metadata: { [META]: { hp: 40, hpMax: 40, inInitiative: true, ...meta } } });
const actor = (card) => creature("hero", "Eroe", { initiativeCard: { quickActions: [longsword, javelin], ...card } });
const paladin = (level = 5, extra = {}) => actor({ characterBuild: [{ classId: "paladino", level, ...extra }] });
const warlock = (level = 5) => actor({ characterBuild: [{ classId: "warlock", level }], classFeaturesConfigured: true,
  enabledClassFeatureIds: ["warlock-suppliche-occulte-punizione-occulta"] });
const wight = () => creature("wight", "Spettro");
const turnState = { round: 1, order: ["hero", "wight"], current: 0 };
const option = (sourceItem, id, action = longsword) => pcAttackRiderOptions({ action, sourceItem, targetItem: wight(), turnState }).find((entry) => entry.id === id);
const plan = (sourceItem, riders, overrides = {}) => buildPcAttackMutation({ action: longsword, sourceItem, targetItem: wight(), outcome: "hit",
  componentAmounts: { c1: 8 }, attackInstanceId: "smite-1", turnState, riders, ...overrides });
const SMITE = "paladino-punizione-divina";
const ELDRITCH = "warlock-suppliche-occulte-punizione-occulta";

test("Divine Smite: 2d8 with a 1st-level slot, +1d8 per level, at most 5d8, +1d8 against undead or fiends", () => {
  const rider = getPcAttackRider(SMITE);
  assert.deepEqual([1, 2, 3, 4, 5].map((slotLevel) => pcAttackRiderDice(rider, {}, { slotLevel })), ["2d8", "3d8", "4d8", "5d8", "5d8"]);
  assert.deepEqual([1, 4, 5].map((slotLevel) => pcAttackRiderDice(rider, {}, { slotLevel, bonus: true })), ["3d8", "6d8", "6d8"]);
  assert.equal(pcAttackRiderDice(rider, {}), null, "no slot, no dice");
});

test("Eldritch Smite uses the pact slot, whose level follows the warlock level", () => {
  const rider = getPcAttackRider(ELDRITCH);
  const levels = (level) => pcAttackRiderSlotLevels(rider, { characterBuild: [{ classId: "warlock", level }] });
  assert.deepEqual([levels(1), levels(3), levels(5), levels(7), levels(9), levels(20)], [[1], [2], [3], [4], [5], [5]]);
  assert.equal(pcAttackRiderDice(rider, {}, { slotLevel: 3 }), "4d8");
  const eldritch = option(warlock(5), ELDRITCH);
  assert.deepEqual([eldritch.slotLevels, eldritch.dice, eldritch.limit, eldritch.onHit.condition, eldritch.bonus], [[3], "4d8", { per: "turn", scope: "attacker" }, "Prono", undefined]);
});

test("the paladin's options: every slot level with its dice, the bonus dice, melee only", () => {
  const smite = option(paladin(), SMITE);
  assert.deepEqual(smite.slotLevels, [1, 2, 3, 4, 5]);
  assert.deepEqual(smite.diceBySlot, { 1: "2d8", 2: "3d8", 3: "4d8", 4: "5d8", 5: "5d8" });
  assert.deepEqual(smite.bonus, { label: "Non morto o immondo", diceBySlot: { 1: "3d8", 2: "4d8", 3: "5d8", 4: "6d8", 5: "6d8" } });
  assert.deepEqual([smite.types, smite.limit], [["radiant"], null]);
  assert.deepEqual([option(paladin(), SMITE, javelin).available, option(paladin(), SMITE, javelin).reason], [false, "Solo per gli attacchi in mischia."]);
});

test("a Divine Smite records its slot (never decremented) and its bonus; no turn counter, a note for the slot", () => {
  const result = plan(paladin(), [{ id: SMITE, type: "radiant", amount: 18, slotLevel: 2, bonus: true }]);
  assert.equal(result.change.afterHP, 14);
  assert.deepEqual(result.causality.riders[0], { featureId: SMITE, name: "Punizione Divina", dice: "4d8", type: "radiant", typeLabel: "radiosi",
    inputAmount: 18, amount: 18, slotLevel: 2, slotTracked: false, bonus: "Non morto o immondo" });
  assert.equal(result.options.metadataPatches[0].fields[PC_ATTACK_STATE_FIELD].value.riderUses, undefined);
  assert.equal(result.options.sceneMetadataPreconditions, undefined);
  assert.deepEqual(result.followUps, ["Punizione Divina: slot di 2° livello speso."]);
});

test("Improved Divine Smite stacks with Divine Smite as a separate component", () => {
  const result = plan(paladin(11), [{ id: SMITE, type: "radiant", amount: 13, slotLevel: 3 }, { id: "paladino-punizione-divina-migliorata", type: "radiant", amount: 5 }]);
  assert.deepEqual(result.damageComponents.map((c) => [c.id, c.amount]), [["c1", 8], [`r:${SMITE}`, 13], ["r:paladino-punizione-divina-migliorata", 5]]);
});

test("an Oath of Glory paladin is reminded of Inspiring Smite after a Divine Smite", () => {
  const glory = paladin(3, { subclassId: "paladino-giuramento-di-gloria" });
  const result = plan(glory, [{ id: SMITE, type: "radiant", amount: 9, slotLevel: 1 }]);
  assert.match(result.followUps.join(" "), /Punizione Ispiratrice/);
  assert.doesNotMatch(plan(glory, []).followUps.join(" "), /Punizione Ispiratrice/, "no smite, no reminder");
});

test("Eldritch Smite knocks the target prone when the GM says so, once per turn", () => {
  const result = plan(warlock(5), [{ id: ELDRITCH, type: "force", amount: 20, slotLevel: 3, onHit: true }]);
  const add = result.operations.find((operation) => operation.type === "condition:add");
  assert.deepEqual([add.conditionName, add.targetIds, add.instanceIds, add.options.expiry, add.options.sourceId],
    ["Prono", ["wight"], { wight: "smite-1:prono:wight" }, { mode: "manual" }, "hero"]);
  assert.deepEqual(result.operations.at(-1), { type: "condition:automate", subjectIds: ["wight"] });
  assert.equal(result.causality.riders[0].condition, "Prono");
  assert.equal(result.causality.conditionsApplied[0].condition, "Prono");
  assert.equal(result.options.metadataPatches[0].fields[PC_ATTACK_STATE_FIELD].value.riderUses.length, 1);
  const without = plan(warlock(5), [{ id: ELDRITCH, type: "force", amount: 20, slotLevel: 3 }]);
  assert.equal(without.operations.some((operation) => operation.type === "condition:add"), false);
});

test("slot, bonus and on-hit effect are validated against the rider", () => {
  assert.throws(() => plan(paladin(), [{ id: SMITE, type: "radiant", amount: 9 }]), /scegli il livello dello slot/);
  assert.throws(() => plan(paladin(), [{ id: SMITE, type: "radiant", amount: 9, slotLevel: 6 }]), /scegli il livello dello slot/);
  assert.throws(() => plan(warlock(5), [{ id: ELDRITCH, type: "force", amount: 9, slotLevel: 2 }]), /scegli il livello dello slot/, "a pact slot has one level");
  assert.throws(() => plan(warlock(5), [{ id: ELDRITCH, type: "force", amount: 9, slotLevel: 3, bonus: true }]), /bonus non previsto/);
  assert.throws(() => plan(paladin(), [{ id: SMITE, type: "radiant", amount: 9, slotLevel: 1, onHit: true }]), /effetto non previsto/);
  const preview = pcAttackPreview({ action: longsword, sourceItem: paladin(), targetItem: wight(), outcome: "hit", amounts: { c1: "8" }, turnState,
    riders: [{ id: SMITE, type: "radiant", amount: "9" }] });
  assert.equal(preview.blocker, "Punizione Divina: scegli il livello dello slot.");
});
