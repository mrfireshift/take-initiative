// Lot F1 of docs/STUDIO_TALENTI.md: the feats in the attack console. Great Weapon Master and Sharpshooter's −5/+10,
// Piercer's and Orcish Fury's die, Slasher's and Crusher's pills and note, Dragon Hide's claws, and the reminders
// (Savage Attacker, Piercer's reroll, the bonus attacks of Great Weapon Master and Crossbow Expert).
import assert from "node:assert/strict";
import test from "node:test";
import { buildPcAttackMutation, pcAttackActivationOptions, pcAttackFollowUps, PC_ATTACK_STATE_FIELD } from "../src/pcAttackCore.js";
import { pcAttackTargetNotes } from "../src/pcAttackTurnActionCore.js";
import { CLASS_FEATURE_STATE_FIELD } from "../src/classFeatureCore.js";
import { CLASS_FEATURE_BY_ID, CLASS_FEATURE_RESOURCE_POOL_BY_ID } from "../src/classFeatureCatalog.js";
import { PC_ATTACK_ACTIVATIONS } from "../src/pcAttackActivationCatalog.js";
import { speciesNaturalWeaponAction } from "../src/speciesNaturalWeaponCore.js";

const META = "com.thebigpicture.initiative/meta";
const sword = { id: "sword", label: "Spada lunga", kind: "attack", range: "melee", components: [{ type: "slashing", formula: "1d8+3" }] };
const maul = { id: "maul", label: "Maglio", kind: "attack", range: "melee", components: [{ type: "bludgeoning", formula: "2d6+3" }] };
const rapier = { id: "rapier", label: "Stocco", kind: "attack", range: "melee", components: [{ type: "piercing", formula: "1d8+3" }] };
const bow = { id: "bow", label: "Arco lungo", kind: "attack", range: "ranged", components: [{ type: "piercing", formula: "1d8+2" }] };
const creature = (id, name, meta = {}) => ({ id, name, type: "IMAGE", layer: "CHARACTER", metadata: { [META]: { hp: 40, hpMax: 40, inInitiative: true, ...meta } } });
const actor = (feats, meta = {}) => creature("pc", "Pg", { initiativeCard: { characterBuild: [{ classId: "guerriero", level: 5 }],
  abilityModifiers: { str: 3, dex: 2, con: 2, int: 0, wis: 1, cha: 2 }, feats: feats.map((id) => ({ id })), quickActions: [sword, maul, rapier, bow] }, ...meta });
const ogre = (meta = {}) => creature("ogre", "Ogre", meta);
const ownTurn = { round: 2, order: ["pc", "ogre"], current: 0 };
const option = (list, id) => list.find((entry) => entry.id === id);
const activations = (sourceItem, overrides = {}) => pcAttackActivationOptions({ action: sword, sourceItem, targetItem: ogre(), turnState: ownTurn,
  outcome: "hit", ...overrides });
const attack = (sourceItem, extra, overrides = {}) => buildPcAttackMutation({ action: sword, sourceItem, targetItem: ogre(), outcome: "hit",
  componentAmounts: { c1: 8 }, attackInstanceId: "a1", turnState: ownTurn, expectedDefenses: {}, ...extra, ...overrides });
const after = (result, item) => ({ ...item, metadata: { [META]: { ...item.metadata[META],
  [PC_ATTACK_STATE_FIELD]: result.options.metadataPatches[0].fields[PC_ATTACK_STATE_FIELD].value,
  ...(result.options.metadataPatches[0].fields[CLASS_FEATURE_STATE_FIELD]
    ? { [CLASS_FEATURE_STATE_FIELD]: result.options.metadataPatches[0].fields[CLASS_FEATURE_STATE_FIELD].value } : {}) } } });
const GWM = "talento-maestro-d-armi-possenti";

test("the console's feats are records of the sheet's feats, never a class's or a species'", () => {
  const feats = PC_ATTACK_ACTIVATIONS.filter((activation) => CLASS_FEATURE_BY_ID.get(activation.id)?.featId).map((activation) => activation.id);
  // Sentinel's speed 0 (lot F6-2, test/featSentinel.test.js); Charger (lot F8-1, test/featTurnReminders.test.js); Poisoner's
  // potent poison (lot F7-1,
  // test/featInfernalPoisoner.test.js); Martial Adept's twelve maneuvers (lot F9-3, test/featMartialAdept.test.js).
  const maneuvers = ["attacco-minaccioso", "attacco-adescante", "colpo-distraente", "attacco-sbilanciante", "attacco-con-spinta",
    "attacco-disarmante", "attacco-con-manovra", "attacco-con-affondo", "attacco-con-spazzata", "attacco-preciso", "replica", "attacco-con-finta"];
  assert.deepEqual(feats, [GWM, "talento-tiratore-scelto", "talento-stile-penetrante", "talento-furia-orchesca", "talento-bisturi-da-battaglia",
    "talento-bisturi-da-battaglia-critico", "talento-martello-vivente", "talento-martello-vivente-critico", "talento-sentinella-velocita-zero",
    "talento-carica", "talento-maestria-dei-veleni-veleno-potente", ...maneuvers.map((slug) => `talento-adepto-marziale-${slug}`)]);
  assert.deepEqual(activations(actor([])).filter((entry) => entry.id.startsWith("talento-")), [], "without the feat, no activation");
});

test("Great Weapon Master: −5 to the roll before it, +10 to the damage only if the melee attack hits", () => {
  const pc = actor(["maestro-d-armi-possenti"]);
  const hit = option(activations(pc), GWM);
  assert.deepEqual([hit.label, hit.available, hit.preRoll, hit.rollBonus, hit.damage, hit.dice, hit.types],
    ["Maestro d'Armi Possenti (−5/+10)", true, true, "-5", true, "+10", ["slashing"]]);
  assert.equal(hit.hint, "Solo con un'arma pesante in cui sei competente.");
  const miss = option(activations(pc, { outcome: "miss" }), GWM);
  assert.deepEqual([miss.available, miss.rollBonus, miss.damage, miss.dice, miss.types], [true, "-5", false, null, []], "on a miss it keeps only the −5");
  assert.equal(option(activations(pc, { action: bow }), GWM).reason, "Solo per gli attacchi in mischia.");
  assert.equal(attack(pc, { activations: [{ id: GWM, type: "slashing", amount: 10 }] }).change.requested, 18);
  // A miss with −5 chosen asks no damage: the attack is recorded with the bonus it took on the roll.
  const missed = attack(pc, { activations: [{ id: GWM }] }, { outcome: "miss", componentAmounts: {} });
  assert.equal(missed.change, null);
  assert.deepEqual(missed.causality.activations.map((entry) => [entry.featureId, entry.rollBonus, entry.amount]), [[GWM, "-5", undefined]]);
});

test("Sharpshooter: the same −5/+10, with a ranged weapon only", () => {
  const pc = actor(["tiratore-scelto"]);
  const shot = option(activations(pc, { action: bow }), "talento-tiratore-scelto");
  assert.deepEqual([shot.available, shot.rollBonus, shot.dice, shot.types], [true, "-5", "+10", ["piercing"]]);
  assert.equal(option(activations(pc), "talento-tiratore-scelto").reason, "Solo per gli attacchi a distanza.");
});

test("Piercer: one more die of the weapon on a critical with piercing damage, not doubled again", () => {
  const pc = actor(["stile-penetrante"]);
  assert.equal(option(activations(pc, { action: rapier }), "talento-stile-penetrante").reason, "Solo con un colpo critico.");
  const crit = option(activations(pc, { action: rapier, outcome: "critical" }), "talento-stile-penetrante");
  assert.deepEqual([crit.available, crit.dice, crit.noCriticalDouble], [true, "1d8", true]);
  assert.equal(option(activations(pc, { action: bow, outcome: "critical" }), "talento-stile-penetrante").available, true, "a ranged weapon too");
  assert.match(option(activations(pc, { outcome: "critical" }), "talento-stile-penetrante").reason, /^Solo con danni da /u);
});

test("Orcish Fury: one more die of the weapon, its use back with a short rest", () => {
  const pc = actor(["furia-orchesca"]);
  const fury = option(activations(pc), "talento-furia-orchesca");
  assert.deepEqual([fury.available, fury.dice, fury.resources.map((entry) => [entry.current, entry.maximum])], [true, "1d8", [[1, 1]]]);
  const result = attack(pc, { activations: [{ id: "talento-furia-orchesca", type: "slashing", amount: 5 }] });
  assert.equal(result.change.requested, 13);
  assert.match(option(activations(after(result, pc)), "talento-furia-orchesca").reason, /nessun uso rimasto/u);
  assert.deepEqual(CLASS_FEATURE_RESOURCE_POOL_BY_ID.get("talento-furia-orchesca-dado-usi").refresh.map((entry) => entry.event),
    ["riposo_breve", "riposo_lungo"]);
});

test("Slasher: once per turn on a slashing hit, −3 m on the target until the attacker's next turn; on a critical, disadvantage", () => {
  const pc = actor(["bisturi-da-battaglia"]);
  const slash = option(activations(pc), "talento-bisturi-da-battaglia");
  assert.deepEqual([slash.available, slash.effect, slash.limit], [true, { kind: "pill", label: "Bisturi da Battaglia", self: false }, { per: "turn" }]);
  assert.match(option(activations(pc, { action: maul }), "talento-bisturi-da-battaglia").reason, /^Solo con danni da /u);
  assert.equal(option(activations(pc), "talento-bisturi-da-battaglia-critico").reason, "Solo con un colpo critico.");
  assert.equal(option(activations(pc, { outcome: "critical" }), "talento-bisturi-da-battaglia-critico").effect.label, "Bisturi da Battaglia: critico");
  const record = CLASS_FEATURE_BY_ID.get("talento-bisturi-da-battaglia");
  assert.deepEqual([record.effectPlan.mechanics, record.duration.timing], [{ movement: { addMeters: -3 } }, "next-turn"]);
  const result = attack(pc, { activations: [{ id: "talento-bisturi-da-battaglia" }] });
  assert.ok(result.labelTargetIds.includes("ogre"), "the pill goes on the target, in the attack's command");
  assert.equal(option(activations(after(result, pc)), "talento-bisturi-da-battaglia").reason, "Già usato in questo turno.");
});

test("Crusher: once per turn on a bludgeoning hit, the note to move the target; on a critical, advantage against it", () => {
  const pc = actor(["martello-vivente"]);
  const crush = option(activations(pc, { action: maul }), "talento-martello-vivente");
  assert.deepEqual([crush.available, crush.effect, crush.size, crush.limit],
    [true, { kind: "note", label: "Spostato di 1,5 m in uno spazio libero." }, "al massimo una taglia più grande di te", { per: "turn" }]);
  const crit = option(activations(pc, { action: maul, outcome: "critical" }), "talento-martello-vivente-critico");
  assert.deepEqual([crit.available, crit.effect.label, crit.limit], [true, "Martello Vivente", null]);
});

test("Dragon Hide's claws: an attack of the card, 1d4 + Strength slashing, like a species' natural weapon", () => {
  const claws = speciesNaturalWeaponAction(CLASS_FEATURE_BY_ID.get("talento-pelle-di-drago"), { abilityModifiers: { str: 3 } });
  assert.deepEqual([claws.label, claws.range, claws.components[0].type, claws.components[0].formula], ["Artigli", "melee", "slashing", "1d4+3"]);
});

test("the bonus attacks come after the attack: Great Weapon Master's after a critical or a creature dropped, Crossbow Expert's", () => {
  const card = { feats: [{ id: "maestro-d-armi-possenti" }, { id: "esperto-di-balestre" }] };
  const great = "Maestro d'Armi Possenti: nel tuo turno puoi fare un attacco in mischia con un'arma come azione bonus.";
  const crossbow = "Esperto di Balestre: se hai attaccato con un'arma a una mano, puoi attaccare con la balestra a mano come azione bonus.";
  assert.deepEqual(pcAttackFollowUps(card, [], [], { attack: sword, outcome: "critical" }), [great, crossbow]);
  assert.deepEqual(pcAttackFollowUps(card, [], [], { attack: sword, outcome: "hit" }), [crossbow]);
  assert.deepEqual(pcAttackFollowUps(card, [], [], { attack: sword, outcome: "hit", targetDown: true }), [great, crossbow]);
  assert.deepEqual(pcAttackFollowUps(card, [], [], { attack: bow, outcome: "critical" }), [crossbow]);
  assert.deepEqual(pcAttackFollowUps(card, [], [], { attack: { ...sword, cantrip: { spellId: "booming-blade" } }, outcome: "critical" }), []);
  assert.deepEqual(pcAttackFollowUps({}, [], [], { attack: sword, outcome: "critical" }), []);
  // In the attack's command: a creature dropped to 0 HP by a melee hit.
  const pc = actor(["maestro-d-armi-possenti"]);
  assert.deepEqual(attack(pc, {}, { targetItem: ogre({ hp: 5 }) }).followUps, [great]);
  assert.deepEqual(attack(pc, {}).followUps, []);
});

test("the reminders before the roll: Savage Attacker in melee, Piercer's reroll, the critical pills of Crusher and Slasher", () => {
  const notes = (sourceItem, action, targetItem = ogre()) => pcAttackTargetNotes({ attack: action, targetItem, sourceItem, items: [] });
  const savage = "Aggressore Selvaggio: una volta per turno puoi ritirare i dadi dell'arma e tenere il totale che preferisci.";
  const piercer = "Stile Penetrante: una volta per turno puoi ritirare un dado di danno perforante.";
  const pc = actor(["aggressore-selvaggio", "stile-penetrante"]);
  assert.deepEqual(notes(pc, sword), [savage]);
  assert.deepEqual(notes(pc, rapier), [savage, piercer]);
  assert.deepEqual(notes(pc, bow), [piercer]);
  assert.deepEqual(notes(actor([]), sword), []);
  const crushed = ogre({ conditions: [{ instanceId: "c1", condition: "Martello Vivente", active: true, sourceId: "bard" }] });
  assert.deepEqual(notes(actor([]), sword, crushed), ["Martello Vivente: vantaggio all'attacco."]);
  const slashed = actor([], { conditions: [{ instanceId: "c2", condition: "Bisturi da Battaglia: critico", active: true, sourceId: "ogre" }] });
  assert.deepEqual(notes(slashed, sword), ["Bisturi da Battaglia: svantaggio all'attacco."]);
});
