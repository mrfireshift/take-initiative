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
  assert.equal(pcAttackCantripIds(cantrips).length, 20, "the area cantrips too; Create Bonfire stays in the spell panel");
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

test("a saving throw cantrip: failed takes the damage, passed none; its save and DC are recorded", () => {
  const cleric = caster([{ classId: "chierico", level: 5 }], { spellSaveDC: 13 });
  const failed = plan({ spellId: "sacred-flame", sourceItem: cleric, outcome: "failed", componentAmounts: { c1: 9 } });
  assert.equal(failed.change.afterHP, 21);
  assert.deepEqual(failed.causality.save, { ability: "dex", outcome: "failed", dc: 13 });
  assert.deepEqual([failed.causality.cantrip.dice, failed.causality.cantrip.saveLabel], ["2d8", "TS Destrezza (CD 13)"]);
  assert.equal(failed.causality.action.attackOutcome, undefined, "a save is not an attack roll");
  assert.equal(failed.causality.targets[0].outcome, "failed");
  const passed = plan({ spellId: "sacred-flame", sourceItem: cleric, outcome: "passed", componentAmounts: {} });
  assert.deepEqual([passed.change, passed.operations], [null, []]);
  assert.equal(passed.options.history.payload.manualRemainder, undefined);
  assert.throws(() => plan({ spellId: "sacred-flame", outcome: "hit" }), /esito del tiro salvezza/);
  assert.throws(() => plan({ spellId: "sacred-flame", outcome: "critical" }), /esito del tiro salvezza/);
  assert.throws(() => plan({ spellId: "fire-bolt", outcome: "failed" }), /esito dell'attacco/);
  assert.throws(() => plan({ spellId: "sacred-flame", outcome: "passed", componentAmounts: {}, extras: [{ type: "fire", amount: 2 }] }), /tiro salvezza fallisce/);
});

test("Toll the Dead records the d12s against a hurt target; the preview counts no damage on a passed save", () => {
  const hurt = goblin({ hp: 20 });
  assert.equal(plan({ spellId: "xanathar-rintocco-dei-morti", targetItem: hurt, outcome: "failed", componentAmounts: { c1: 13 } }).causality.cantrip.dice, "2d12");
  assert.equal(plan({ spellId: "xanathar-rintocco-dei-morti", outcome: "failed", componentAmounts: { c1: 9 } }).causality.cantrip.dice, "2d8");
  const base = { action: cantrips, spellId: "vicious-mockery", targetItem: goblin() };
  assert.equal(pcAttackPreview({ ...base, outcome: "hit", amounts: { c1: "3" } }).blocker, "Scegli l'esito del tiro salvezza.");
  const passed = pcAttackPreview({ ...base, outcome: "passed", amounts: { c1: "3" } });
  assert.deepEqual([passed.ready, passed.total, passed.hp.after], [true, 0, 30]);
  const failed = pcAttackPreview({ ...base, outcome: "failed", amounts: { c1: "3" } });
  assert.deepEqual([failed.ready, failed.total], [true, 3]);
});

test("a rule to know before the roll is never recorded as left to apply; a failed save's effect is", () => {
  const sacred = plan({ spellId: "sacred-flame", outcome: "failed", componentAmounts: { c1: 6 } });
  assert.equal(sacred.options.history.payload.manualRemainder, undefined);
  assert.match(sacred.causality.cantrip.ruleNote, /copertura/);
  const frostbite = plan({ spellId: "xanathar-morsa-del-gelo", outcome: "failed", componentAmounts: { c1: 6 } });
  assert.equal(frostbite.options.history.payload.manualRemainder, undefined, "its effect is a pill now");
  assert.deepEqual(frostbite.operations.filter((operation) => operation.type === "condition:add").map((operation) => operation.conditionName),
    ["Prossimo attacco con arma: svant."]);
  assert.match(plan({ spellId: "xanathar-infestazione", outcome: "failed", componentAmounts: { c1: 4 } }).options.history.payload.manualRemainder,
    /direzione casuale/, "a move on the map stays with the GM");
});

const optionFor = (sourceItem, action, spellId, id) => pcAttackRiderOptions({ action, spellId, sourceItem, targetItem: goblin(), turnState }).find((option) => option.id === id);
const AGONIZING = "warlock-suppliche-occulte-deflagrazione-agonizzante";
const weapon = { id: "staff", label: "Bastone", kind: "attack", range: "melee", components: [{ type: "bludgeoning" }] };

test("Agonizing Blast adds Charisma to Eldritch Blast only; casters' riders never apply to a weapon", () => {
  const warlock = caster([{ classId: "warlock", level: 5 }], { abilityModifiers: { cha: 4 }, classFeaturesConfigured: true, enabledClassFeatureIds: [AGONIZING] });
  const blast = optionFor(warlock, cantrips, "eldritch-blast", AGONIZING);
  assert.deepEqual([blast.available, blast.dice, blast.types], [true, "+4", ["force"]]);
  assert.deepEqual([optionFor(warlock, cantrips, "fire-bolt", AGONIZING).available, optionFor(warlock, cantrips, "fire-bolt", AGONIZING).reason],
    [false, "Solo per la Deflagrazione occulta."]);
  assert.equal(optionFor(warlock, weapon, "", AGONIZING).reason, "Solo per i trucchetti.");
  const result = plan({ sourceItem: warlock, spellId: "eldritch-blast", componentAmounts: { c1: 6 }, riders: [{ id: AGONIZING, type: "force", amount: 4 }] });
  assert.deepEqual([result.change.afterHP, result.causality.riders[0].name], [20, "Deflagrazione Agonizzante"]);
});

test("Potent Spellcasting and Empowered Evocation: on cantrips, with the ability modifier", () => {
  const lightCleric = caster([{ classId: "chierico", level: 8, subclassId: "chierico-dominio-della-luce" }], { abilityModifiers: { wis: 3 } });
  const potent = optionFor(lightCleric, cantrips, "sacred-flame", "chierico-dominio-della-luce-incantesimi-potenti");
  assert.deepEqual([potent.available, potent.dice, potent.label], [true, "+3", "Incantesimi Potenti (trucchetti da chierico)"]);
  assert.equal(optionFor(lightCleric, weapon, "", "chierico-dominio-della-luce-incantesimi-potenti").reason, "Solo per i trucchetti.");
  const evoker = caster([{ classId: "mago", level: 10, subclassId: "mago-scuola-di-invocazione" }], { abilityModifiers: { int: 5 } });
  assert.deepEqual([optionFor(evoker, cantrips, "fire-bolt", "mago-scuola-di-invocazione-invocazione-potente").available,
    optionFor(evoker, cantrips, "fire-bolt", "mago-scuola-di-invocazione-invocazione-potente").dice], [true, "+5"]);
});

test("Potent Cantrip: a passed save takes half the cantrip's damage, without extras", () => {
  const evoker = caster([{ classId: "mago", level: 6, subclassId: "mago-scuola-di-invocazione" }]);
  const passed = plan({ sourceItem: evoker, spellId: "poison-spray", outcome: "passed", componentAmounts: { c1: 11 } });
  assert.deepEqual([passed.change.requested, passed.change.afterHP], [5, 25]);
  assert.equal(passed.causality.save.potentCantrip, true);
  assert.equal(passed.options.history.payload.manualRemainder, undefined);
  assert.throws(() => plan({ sourceItem: evoker, spellId: "poison-spray", outcome: "passed", componentAmounts: { c1: 11 }, extras: [{ type: "fire", amount: 2 }] }),
    /tiro salvezza fallisce/);
  const preview = pcAttackPreview({ action: cantrips, spellId: "poison-spray", sourceItem: evoker, targetItem: goblin(), outcome: "passed", amounts: { c1: "11" } });
  assert.deepEqual([preview.ready, preview.total], [true, 5]);
  const plainWizard = caster([{ classId: "mago", level: 6, subclassId: "mago-scuola-di-abiurazione" }]);
  assert.equal(plan({ sourceItem: plainWizard, spellId: "poison-spray", outcome: "passed", componentAmounts: {} }).change, null);
  assert.equal(plan({ sourceItem: evoker, spellId: "fire-bolt", outcome: "miss", componentAmounts: {} }).change, null, "not on an attack roll");
});
