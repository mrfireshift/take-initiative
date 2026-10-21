import assert from "node:assert/strict";
import test from "node:test";
import { buildPcAttackMutation, pcAttackPreview, pcAttackRiderOptions, PC_ATTACK_STATE_FIELD } from "../src/pcAttackCore.js";

const META = "com.thebigpicture.initiative/meta";
const rapier = { id: "rapier", label: "Stocco", kind: "attack", range: "melee", components: [{ type: "piercing", formula: "1d8+4" }] };
const bow = { id: "bow", label: "Arco lungo", kind: "attack", range: "ranged", components: [{ type: "piercing" }] };
const creature = (id, name, meta = {}) => ({ id, name, type: "IMAGE", layer: "CHARACTER", metadata: { [META]: { hp: 30, hpMax: 30, inInitiative: true, ...meta } } });
const actor = (characterBuild, meta = {}) => creature("vex", "Vex", { initiativeCard: { characterBuild, quickActions: [rapier, bow] }, ...meta });
const rogue = (meta = {}) => actor([{ classId: "ladro", level: 5 }], meta);
const ghoul = (meta = {}) => creature("ghoul", "Ghoul", meta);
const imp = () => creature("imp", "Imp");
const ownTurn = { round: 2, order: ["vex", "ghoul", "imp"], current: 0 };
const ghoulTurn = { ...ownTurn, current: 1 };
const option = (options, id) => options.find((entry) => entry.id === id);
const plan = (overrides = {}) => buildPcAttackMutation({ action: rapier, sourceItem: rogue(), targetItem: ghoul(), outcome: "hit",
  componentAmounts: { c1: 7 }, attackInstanceId: "attack-one", turnState: ownTurn, ...overrides });
// The attacker as it is after a committed plan: its pcAttackState is the one the plan wrote.
const after = (result, item) => ({ ...item, metadata: { [META]: { ...item.metadata[META],
  [PC_ATTACK_STATE_FIELD]: result.options.metadataPatches[0].fields[PC_ATTACK_STATE_FIELD].value } } });
const sneak = { id: "ladro-attacco-furtivo", type: "piercing", amount: 11 };

test("a rogue's Sneak Attack: dice for its level and the weapon's damage type", () => {
  const sneakOption = option(pcAttackRiderOptions({ action: rapier, sourceItem: rogue(), targetItem: ghoul(), turnState: ownTurn }), "ladro-attacco-furtivo");
  assert.deepEqual([sneakOption.dice, sneakOption.types, sneakOption.available, sneakOption.limit], ["3d6", ["piercing"], true, { per: "turn", scope: "attacker" }]);
});

test("a rider is a typed component with its own defenses, counted for the turn the GM saw", () => {
  const defenses = { resistances: ["piercing"], immunities: [], vulnerabilities: [] };
  const result = plan({ targetItem: ghoul({ initiativeCard: { damageDefenses: defenses } }), expectedDefenses: defenses, riders: [sneak] });
  assert.deepEqual(result.damageComponents.map((c) => [c.id, c.type, c.amount, c.source.kind]), [["c1", "piercing", 3, "weapon"], ["r:ladro-attacco-furtivo", "piercing", 5, "class-feature"]]);
  assert.equal(result.change.afterHP, 22);
  const state = result.options.metadataPatches[0].fields[PC_ATTACK_STATE_FIELD].value;
  assert.deepEqual(state.riderUses, [{ riderId: "ladro-attacco-furtivo", turnKey: state.lastAttack.turnKey }]);
  assert.deepEqual(result.options.sceneMetadataPreconditions.map((entry) => [entry.field, entry.value]), [["round", 2], ["current", 0]]);
  assert.deepEqual(result.causality.riders, [{ featureId: "ladro-attacco-furtivo", name: "Attacco Furtivo", dice: "3d6", type: "piercing",
    typeLabel: "perforanti", inputAmount: 11, amount: 5, limit: { per: "turn", scope: "attacker" } }]);
});

test("once per turn: spent for the rest of the turn, available again in a reaction on another turn", () => {
  const spentRogue = after(plan({ riders: [sneak] }), rogue());
  const spent = option(pcAttackRiderOptions({ action: rapier, sourceItem: spentRogue, targetItem: imp(), turnState: ownTurn }), "ladro-attacco-furtivo");
  assert.deepEqual([spent.available, spent.reason], [false, "Già usato in questo turno."]);
  assert.throws(() => plan({ sourceItem: spentRogue, attackInstanceId: "attack-two", riders: [sneak] }), /Attacco Furtivo: Già usato in questo turno\. Riapri/);
  const reaction = plan({ sourceItem: spentRogue, attackInstanceId: "attack-two", turnState: ghoulTurn, riders: [sneak] });
  const uses = reaction.options.metadataPatches[0].fields[PC_ATTACK_STATE_FIELD].value.riderUses;
  assert.equal(uses.length, 1, "the uses of past turns are dropped");
  assert.notEqual(uses[0].turnKey, after(plan({ riders: [sneak] }), rogue()).metadata[META][PC_ATTACK_STATE_FIELD].riderUses[0].turnKey);
});

test("an attack without riders keeps the uses of the current turn and has no turn precondition", () => {
  const spentRogue = after(plan({ riders: [sneak] }), rogue());
  const result = plan({ sourceItem: spentRogue, attackInstanceId: "attack-two" });
  assert.equal(result.options.metadataPatches[0].fields[PC_ATTACK_STATE_FIELD].value.riderUses.length, 1);
  assert.equal(result.options.sceneMetadataPreconditions, undefined);
});

test("out of combat nothing is counted per turn", () => {
  const sneakOption = option(pcAttackRiderOptions({ action: rapier, sourceItem: rogue(), targetItem: ghoul(), turnState: null }), "ladro-attacco-furtivo");
  assert.equal(sneakOption.available, true);
  assert.match(sneakOption.warning, /Fuori dal combattimento/);
  const result = plan({ turnState: null, riders: [sneak] });
  assert.equal(result.options.metadataPatches[0].fields[PC_ATTACK_STATE_FIELD].value.riderUses, undefined);
  assert.equal(result.options.sceneMetadataPreconditions, undefined);
});

test("Divine Strike only on the cleric's own turn; a type chosen among the domain's", () => {
  const lifeCleric = actor([{ classId: "chierico", level: 8, subclassId: "chierico-dominio-della-vita" }]);
  const strike = (turnState) => option(pcAttackRiderOptions({ action: rapier, sourceItem: lifeCleric, targetItem: ghoul(), turnState }), "chierico-dominio-della-vita-colpo-divino");
  assert.deepEqual([strike(ownTurn).available, strike(ownTurn).types], [true, ["radiant"]]);
  assert.deepEqual([strike(ghoulTurn).available, strike(ghoulTurn).reason], [false, "Solo nel proprio turno."]);
  const natureCleric = actor([{ classId: "chierico", level: 14, subclassId: "chierico-dominio-della-natura" }]);
  const nature = option(pcAttackRiderOptions({ action: rapier, sourceItem: natureCleric, targetItem: ghoul(), turnState: ownTurn }), "chierico-dominio-della-natura-colpo-divino");
  assert.deepEqual([nature.dice, nature.types], ["2d8", ["cold", "fire", "lightning"]]);
  assert.throws(() => plan({ sourceItem: natureCleric, riders: [{ id: nature.id, type: "radiant", amount: 9 }] }), /tipo di danno non valido/);
});

test("once per turn per target: Dreadful Strikes again on another creature", () => {
  const feyRanger = actor([{ classId: "ranger", level: 3, subclassId: "ranger-viandante-fatato" }]);
  const strikes = { id: "ranger-viandante-fatato-colpi-terribili", type: "psychic", amount: 3 };
  const spent = after(plan({ sourceItem: feyRanger, riders: [strikes] }), feyRanger);
  const on = (target) => option(pcAttackRiderOptions({ action: rapier, sourceItem: spent, targetItem: target, turnState: ownTurn }), strikes.id);
  assert.deepEqual([on(ghoul()).available, on(ghoul()).reason], [false, "Già usato su questo bersaglio in questo turno."]);
  assert.equal(on(imp()).available, true);
});

test("requirements read from the live state: melee, Rage, the attacker's pill on the target, the target's hit points", () => {
  const paladin = actor([{ classId: "paladino", level: 11 }]);
  const smite = (action) => option(pcAttackRiderOptions({ action, sourceItem: paladin, targetItem: ghoul(), turnState: ownTurn }), "paladino-punizione-divina-migliorata");
  assert.equal(smite(rapier).available, true);
  assert.deepEqual([smite(bow).available, smite(bow).reason], [false, "Solo per gli attacchi in mischia."]);

  const zealotBuild = [{ classId: "barbaro", level: 10, subclassId: "barbaro-cammino-dello-zelota" }];
  const fury = (source) => option(pcAttackRiderOptions({ action: rapier, sourceItem: source, targetItem: ghoul(), turnState: ownTurn }), "barbaro-cammino-dello-zelota-furia-divina");
  assert.deepEqual([fury(actor(zealotBuild)).available, fury(actor(zealotBuild)).reason], [false, "Ira non è attiva."]);
  const raging = actor(zealotBuild, { classFeatureState: { version: 1, instances: [{ instanceId: "rage-1", featureId: "barbaro-ira" }] } });
  assert.deepEqual([fury(raging).available, fury(raging).dice, fury(raging).types], [true, "1d6+5", ["necrotic", "radiant"]]);
  assert.equal(fury(actor(zealotBuild, { conditions: [{ condition: "Ira", active: true }] })).available, true, "the Rage pill applied by hand counts");

  const hunter = actor([{ classId: "ranger", level: 3, subclassId: "ranger-cacciatore" }],
    { initiativeCard: { characterBuild: [{ classId: "ranger", level: 3, subclassId: "ranger-cacciatore" }], quickActions: [rapier], classFeaturesConfigured: true,
      enabledClassFeatureIds: ["ranger-cacciatore-preda-del-cacciatore-sterminatore-di-colossi"] } });
  const colossus = (target) => option(pcAttackRiderOptions({ action: rapier, sourceItem: hunter, targetItem: target, turnState: ownTurn }), "ranger-cacciatore-preda-del-cacciatore-sterminatore-di-colossi");
  assert.deepEqual([colossus(ghoul()).available, colossus(ghoul()).reason], [false, "Il bersaglio è al massimo dei PF."]);
  assert.equal(colossus(ghoul({ hp: 25 })).available, true);
  assert.equal(colossus(ghoul({ hp: 35 })).available, false, "temporary hit points never put it below its maximum");

  const slayer = actor([{ classId: "ranger", level: 3, subclassId: "ranger-uccisore-di-mostri" }]);
  const prey = (target) => option(pcAttackRiderOptions({ action: rapier, sourceItem: slayer, targetItem: target, turnState: ownTurn }), "ranger-uccisore-di-mostri-preda-dell-uccisore");
  assert.match(prey(ghoul()).reason, /non ha «Preda dell'Uccisore» di Vex/);
  assert.equal(prey(ghoul({ conditions: [{ condition: "Preda dell'Uccisore", sourceId: "vex", active: true }] })).available, true);
  assert.equal(prey(ghoul({ conditions: [{ condition: "Preda dell'Uccisore", sourceId: "someone", active: true }] })).available, false);
});

test("components added on the fly: typed, labelled, defended and only on a hit", () => {
  const defenses = { immunities: ["thunder"], resistances: [], vulnerabilities: [] };
  const result = plan({ targetItem: ghoul({ initiativeCard: { damageDefenses: defenses } }), expectedDefenses: defenses,
    extras: [{ type: "thunder", amount: 4, label: "Lama Roboante" }, { type: "fire", amount: 2 }] });
  assert.deepEqual(result.damageComponents.map((c) => [c.id, c.type, c.amount, c.label ?? null]), [["c1", "piercing", 7, null], ["x1", "thunder", 0, "Lama Roboante"], ["x2", "fire", 2, null]]);
  assert.deepEqual(result.causality.extras, [
    { label: "Lama Roboante", type: "thunder", typeLabel: "tuono", inputAmount: 4, amount: 0 },
    { type: "fire", typeLabel: "fuoco", inputAmount: 2, amount: 2 },
  ]);
  assert.equal(result.options.sceneMetadataPreconditions, undefined, "extras are not counted per turn");
  assert.throws(() => plan({ extras: [{ type: "holy", amount: 1 }] }), /Tipo di danno non valido/);
  assert.throws(() => plan({ extras: Array.from({ length: 4 }, () => ({ type: "fire", amount: 1 })) }), /Al massimo 3/);
  assert.throws(() => plan({ outcome: "miss", componentAmounts: {}, extras: [{ type: "fire", amount: 1 }] }), /solo se l'attacco colpisce/);
  assert.throws(() => plan({ outcome: "miss", componentAmounts: {}, riders: [sneak] }), /solo se l'attacco colpisce/);
  assert.throws(() => plan({ riders: [sneak, sneak] }), /due volte/);
  assert.throws(() => plan({ riders: [{ id: "paladino-punizione-divina-migliorata", type: "radiant", amount: 4 }] }), /non disponibile per questo attaccante/);
});

test("the preview counts riders and extras and names what is missing", () => {
  const base = { action: rapier, sourceItem: rogue(), targetItem: ghoul(), outcome: "hit", amounts: { c1: "7" }, turnState: ownTurn };
  const ready = pcAttackPreview({ ...base, riders: [{ ...sneak, amount: "11" }], extras: [{ type: "thunder", amount: "4", label: "" }] });
  assert.deepEqual([ready.ready, ready.total, ready.hp.after], [true, 22, 8]);
  assert.equal(pcAttackPreview({ ...base, riders: [{ ...sneak, amount: "" }] }).blocker, "Inserisci il danno di ogni extra.");
  assert.equal(pcAttackPreview({ ...base, extras: [{ type: "", amount: "3" }] }).blocker, "Scegli il tipo di ogni componente extra.");
  const spentRogue = after(plan({ riders: [sneak] }), rogue());
  assert.equal(pcAttackPreview({ ...base, sourceItem: spentRogue, riders: [{ ...sneak, amount: "11" }] }).blocker, "Attacco Furtivo: Già usato in questo turno.");
  const miss = pcAttackPreview({ ...base, outcome: "miss", amounts: {}, riders: [{ ...sneak, amount: "11" }] });
  assert.deepEqual([miss.ready, miss.total], [true, 0], "a miss ignores the extras");
});
