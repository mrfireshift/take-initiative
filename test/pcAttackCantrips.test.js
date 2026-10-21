import assert from "node:assert/strict";
import test from "node:test";
import { buildPcAttackMutation, pcAttackCantripIds, pcAttackPreview, pcAttackResolvedAction, pcAttackRiderOptions, PC_ATTACK_STATE_FIELD } from "../src/pcAttackCore.js";

const META = "com.thebigpicture.initiative/meta";
const cantrips = { id: "cantrip", label: "Trucchetto", kind: "attack", source: { kind: "cantrip" } };
const known = { ...cantrips, source: { kind: "cantrip", spellIds: ["eldritch-blast", "shocking-grasp"] } };
const creature = (id, name, meta = {}) => ({ id, name, type: "IMAGE", layer: "CHARACTER", metadata: { [META]: { hp: 30, hpMax: 30, inInitiative: true, ...meta } } });
const caster = (characterBuild, card = {}) => creature("lyra", "Lyra", { initiativeCard: { characterBuild, quickActions: [cantrips, known], ...card } });
const goblin = (meta = {}) => creature("goblin", "Goblin", meta);
const turnState = { round: 1, order: ["lyra", "goblin"], current: 0 };
const plan = (overrides = {}) => buildPcAttackMutation({ action: cantrips, spellId: "fire-bolt", sourceItem: caster([{ classId: "mago", level: 5 }]),
  targetItem: goblin(), outcome: "hit", componentAmounts: { c1: 11 }, attackInstanceId: "bolt-1", turnState, ...overrides });

test("a cantrip action offers the known cantrips (or all of them) and resolves the chosen one", () => {
  assert.equal(pcAttackCantripIds(cantrips).length, 8);
  assert.deepEqual(pcAttackCantripIds(known), ["eldritch-blast", "shocking-grasp"]);
  assert.deepEqual(pcAttackCantripIds({ id: "sword", label: "Spada", kind: "attack", components: [{ type: "slashing" }] }), []);
  const grasp = pcAttackResolvedAction(known, "shocking-grasp");
  assert.deepEqual([grasp.range, grasp.components, grasp.cantrip.name], ["melee", [{ id: "c1", type: "lightning" }], "Stretta folgorante"]);
  assert.equal(pcAttackResolvedAction(known, "fire-bolt"), null, "not among the known cantrips");
  assert.equal(pcAttackResolvedAction(cantrips, ""), null);
});

test("a cantrip is named by the spell; its dice follow the character level; the on-hit effect stays a manual note", () => {
  const result = plan();
  const causality = result.causality;
  assert.equal(result.change.afterHP, 19);
  assert.deepEqual([causality.cause.spellId, causality.cause.spellName, causality.action.label, causality.attack.source],
    ["fire-bolt", "Dardo di fuoco", "Dardo di fuoco", "cantrip"]);
  assert.equal(causality.cantrip.dice, "2d10");
  assert.equal(result.options.label, "Lyra: Dardo di fuoco → Goblin");
  assert.match(result.options.history.payload.manualRemainder, /prende fuoco/);
  assert.equal(result.options.metadataPatches[0].fields[PC_ATTACK_STATE_FIELD].value.lastAttack.spellId, "fire-bolt");
  assert.equal(plan({ outcome: "miss", componentAmounts: {} }).options.history.payload.manualRemainder, undefined, "a miss has no effect to apply");
  assert.equal(plan({ spellId: "eldritch-blast", sourceItem: caster([{ classId: "warlock", level: 11 }]) }).causality.cantrip.dice, "1d10");
});

test("weapon-only riders are disabled on a cantrip; Hexblade's Curse still applies", () => {
  const rogue = caster([{ classId: "ladro", level: 5 }]);
  const sneak = pcAttackRiderOptions({ action: cantrips, spellId: "fire-bolt", sourceItem: rogue, targetItem: goblin(), turnState })[0];
  assert.deepEqual([sneak.id, sneak.available, sneak.reason], ["ladro-attacco-furtivo", false, "Solo per gli attacchi con arma."]);
  assert.throws(() => plan({ sourceItem: rogue, riders: [{ id: "ladro-attacco-furtivo", type: "fire", amount: 7 }] }), /Solo per gli attacchi con arma/);
  const hexblade = caster([{ classId: "warlock", level: 5, subclassId: "warlock-la-lama-del-sortilegio" }]);
  const cursed = goblin({ conditions: [{ condition: "Maledizione della Lama del Sortilegio", sourceId: "lyra", active: true }] });
  const curse = pcAttackRiderOptions({ action: cantrips, spellId: "eldritch-blast", sourceItem: hexblade, targetItem: cursed, turnState })
    .find((option) => option.id === "warlock-la-lama-del-sortilegio-maledizione-della-lama-del-sortilegio");
  assert.deepEqual([curse.available, curse.types, curse.dice], [true, ["force"], "+3"]);
  const result = plan({ sourceItem: hexblade, targetItem: cursed, spellId: "eldritch-blast", componentAmounts: { c1: 6 },
    riders: [{ id: curse.id, type: "force", amount: 3 }] });
  assert.equal(result.change.afterHP, 21);
});

test("the cantrip must be one the action offers, and chosen before the preview is ready", () => {
  assert.throws(() => plan({ action: known, spellId: "fire-bolt" }), /Trucchetto non disponibile/);
  assert.throws(() => plan({ spellId: "" }), /Trucchetto non disponibile/);
  assert.equal(pcAttackPreview({ action: cantrips, targetItem: goblin(), outcome: "hit" }).blocker, "Scegli il trucchetto.");
  const ready = pcAttackPreview({ action: cantrips, spellId: "ray-of-frost", targetItem: goblin({ initiativeCard: { damageDefenses: { resistances: ["cold"] } } }),
    outcome: "critical", amounts: { c1: "9" } });
  assert.deepEqual([ready.ready, ready.total, ready.defenses.map((row) => row.type)], [true, 4, ["cold"]]);
});
