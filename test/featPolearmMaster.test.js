// Lot F6-3 of docs/STUDIO_TALENTI.md (decision K3): Polearm Master. The reach chosen on the sheet (3 m with a glaive, a
// halberd or a pike) counts for the opportunity attacks; a hostile creature entering the reach of a character with the
// feat provokes one (the Disengage and Zephyr Strike keep it out); the other end of the weapon is an attack of the card,
// with its reminder after a melee attack; the sheet's import reads the reach. The expectations are read from the PHB
// 2014 text, not from the definitions under test.
import test, { mock } from "node:test";
import assert from "node:assert/strict";

mock.module("@owlbear-rodeo/sdk", {
  exports: {
    default: { onReady() {}, scene: { items: { getItems: async () => [] } } },
    buildPath: () => ({}), buildLabel: () => ({}), buildImage: () => ({}), buildText: () => ({}), buildShape: () => ({}),
    Command: { MOVE: 0, LINE: 1, CUBIC: 2, CLOSE: 3 },
  },
});

const { movementReactionEvents, reactorReachMeters } = await import("../src/opportunityAttackCore.js");
const { reactionPromptCandidates, reactionPromptEffectText } = await import("../src/reactionPromptView.js");
const { reactionTriggerEntry, REACTION_TRIGGER_OPTION } = await import("../src/reactionTriggerCatalog.js");
const { CLASS_FEATURE_BY_ID } = await import("../src/classFeatureCatalog.js");
const { speciesNaturalWeaponAction } = await import("../src/speciesNaturalWeaponCore.js");
const { pcAttackAction, pcAttackFollowUps } = await import("../src/pcAttackCore.js");
const { parseCharacterSheetImport } = await import("../src/characterSheetImportCore.js");
const { FEATS } = await import("../src/featCatalog.js");

const META = "com.thebigpicture.initiative/meta";
// Positions in meters along a line: the distance is their difference.
const creature = (id, name, meta = {}, x = 0) => ({ id, name, type: "IMAGE", layer: "CHARACTER", position: { x, y: 0 },
  metadata: { [META]: { hp: 40, hpMax: 40, inInitiative: true, ...meta } } });
const distance = (a, b) => Math.abs(a.position.x - b.position.x);
const sheet = (feats, extra = {}) => ({ characterBuild: [{ classId: "guerriero", level: 5 }], abilityModifiers: { str: 3 }, feats, ...extra });
const polearm = (choice = null) => ({ id: "maestro-delle-armi-su-asta", ...(choice ? { choice } : {}) });
const guard = (feats) => creature("guard", "Guardia", { attitude: "pc", initiativeCard: sheet(feats) });
const orc = (pills = []) => creature("orc", "Orco", { attitude: "enemy",
  conditions: { version: 2, instances: pills.map((condition) => ({ id: condition, condition, active: true })) } }, 6);
const moving = (reactor, points, pills = []) => movementReactionEvents({ mover: orc(pills), path: points.map((x) => ({ x, y: 0 })),
  others: [reactor], distance });
const enterReach = (events) => events.filter((event) => event.trigger === "move-enter-reach").map((event) => event.reactorIds);

test("the reach chosen with the feat: 3 m, also for a creature leaving it", () => {
  assert.equal(reactorReachMeters(guard([polearm({ reachMeters: 3 })])), 3);
  assert.equal(reactorReachMeters(guard([polearm()])), 1.5, "a quarterstaff or a spear: 1.5 m");
  assert.equal(reactorReachMeters(guard([])), 1.5);
  // From 3 m to 4.5 m: out of the glaive's reach, never in a 1.5 m one.
  assert.deepEqual(moving(guard([polearm({ reachMeters: 3 })]), [3, 4.5]), [{ trigger: "move-leave", moverId: "orc", reactorIds: ["guard"] }]);
  assert.deepEqual(moving(guard([polearm()]), [3, 4.5]), []);
});

test("a creature entering the reach provokes, unless it disengaged or has Zephyr Strike's pill", () => {
  assert.deepEqual(enterReach(moving(guard([polearm({ reachMeters: 3 })]), [6, 4.5, 3])), [["guard"]]);
  assert.deepEqual(enterReach(moving(guard([polearm()]), [6, 4.5, 3])), [], "3 m away is outside a 1.5 m reach");
  assert.deepEqual(enterReach(moving(guard([polearm()]), [6, 3, 1.5])), [["guard"]]);
  assert.deepEqual(enterReach(moving(guard([]), [6, 3, 1.5])), [], "only a character with the feat");
  assert.deepEqual(enterReach(moving(guard([polearm()]), [1.5, 0])), [], "already inside: it does not enter");
  assert.deepEqual(enterReach(moving(guard([polearm()]), [6, 1.5], ["Disimpegno"])), []);
  // Sentinel's exception is for leaving the reach: entering it after a Disengage provokes nothing.
  assert.deepEqual(enterReach(moving(guard([polearm(), { id: "sentinella" }]), [6, 1.5], ["Disimpegno"])), []);
  assert.deepEqual(enterReach(moving(guard([polearm()]), [6, 1.5], ["Movimento: no AdO"])), []);
});

test("the prompt: an opportunity attack against the hostile creature entering, with the console off turn", () => {
  assert.equal(REACTION_TRIGGER_OPTION["move-enter-reach"], "move", "the Movimento switch");
  const reactor = guard([polearm({ reachMeters: 3 })]);
  const events = moving(reactor, [6, 3]);
  const state = { round: 1, current: 0, order: ["orc", "guard"] };
  const options = { triggers: { move: true }, actors: { pcs: true, npcs: false } };
  const [row, ...rest] = reactionPromptCandidates({ event: events, items: [orc(), reactor], state, options }, "after");
  assert.deepEqual([row.reactionId, row.flow, row.featureId, row.targetIds, row.why, rest.length],
    ["polearm-master-reach", "off-turn-attack", "talento-maestro-delle-armi-su-asta", ["orc"], "Orco entra nella portata.", 0]);
  assert.equal(reactionPromptEffectText(row, [orc(), reactor]), "Attacco di opportunità");
  assert.equal(reactionTriggerEntry("polearm-master-reach").timing, "after");
  assert.deepEqual(reactionPromptCandidates({ event: events, items: [orc(), reactor], state }, "after"), [], "Movimento is off by default");
  const friend = creature("orc", "Bram", { attitude: "pc" }, 6);
  assert.deepEqual(reactionPromptCandidates({ event: events, items: [friend, reactor], state, options }, "after"), [], "not a friend");
});

test("the other end: an attack of the card, 1d4 bludgeoning with Strength, and its reminder after a melee attack", () => {
  const record = CLASS_FEATURE_BY_ID.get("talento-maestro-delle-armi-su-asta");
  const otherEnd = speciesNaturalWeaponAction(record, sheet([polearm()]));
  assert.deepEqual([otherEnd.label, otherEnd.range, otherEnd.components[0].type, otherEnd.components[0].formula],
    ["Altra estremità dell'arma", "melee", "bludgeoning", "1d4+3"]);
  const card = sheet([polearm()]);
  const glaive = pcAttackAction({ id: "glaive", label: "Falcione", kind: "attack", range: "melee", components: [{ type: "slashing", formula: "1d10+3" }] });
  const reminder = pcAttackFollowUps(card, [], [], { attack: glaive, outcome: "hit" });
  assert.equal(reminder.length, 1);
  assert.match(reminder[0], /^Maestro delle Armi su Asta: nel tuo turno, dopo l'azione di Attacco con falcione, alabarda, bastone ferrato o lancia/u);
  assert.deepEqual(pcAttackFollowUps(card, [], [], { attack: pcAttackAction(otherEnd), outcome: "hit" }), [], "not after the other end itself");
  const bow = pcAttackAction({ id: "bow", label: "Arco", kind: "attack", range: "ranged", components: [{ type: "piercing", formula: "1d8" }] });
  assert.deepEqual(pcAttackFollowUps(card, [], [], { attack: bow, outcome: "hit" }), []);
  assert.deepEqual(pcAttackFollowUps(sheet([]), [], [], { attack: glaive, outcome: "hit" }), [], "without the feat");
});

test("the sheet's import reads the reach, in meters or in feet", () => {
  const imported = (entry) => parseCharacterSheetImport(JSON.stringify({ name: "Pg", feats: [entry] }));
  for (const reach of ["10 ft", "3", "3 m", 10]) {
    assert.deepEqual(imported({ name: "Polearm Master", reach }).sections.feats, [{ id: "maestro-delle-armi-su-asta", choice: { reachMeters: 3 } }], String(reach));
  }
  for (const reach of ["5 ft", "1,5"]) {
    const result = imported({ name: "Maestro delle Armi su Asta", portata: reach });
    assert.deepEqual([result.sections.feats, result.unresolved], [[{ id: "maestro-delle-armi-su-asta" }], []], `${reach}: the default`);
  }
  assert.deepEqual(imported({ name: "Polearm Master", reach: "15 ft" }).unresolved, ["portata \"15 ft\" per Maestro delle Armi su Asta"]);
  assert.deepEqual(imported({ name: "Robusto", portata: "3 m" }).unresolved, ["portata \"3 m\" per Robusto"]);
});

test("Polearm Master's line says where each part is", () => {
  const line = FEATS.find((entry) => entry.id === "maestro-delle-armi-su-asta").plugin;
  assert.match(line, /^La portata 3 m \(falcione, alabarda, picca\) si sceglie nei Talenti della scheda\./u);
  assert.match(line, /l'altra estremità \(1d4 contundenti\) si aggiunge agli Attacchi da questa card\.$/u);
});
