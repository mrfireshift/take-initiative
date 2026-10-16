// Tranche 12 (profile v20): Auril's Epic Action sequence. Breathe Deep and Gather the Winter Sky open the round;
// Breath of the Long Night and Meteor Swarm close it after them; Rock only in Gather's round; during Gather only
// the listed epic actions.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { importBossActionHTML, validateBossActionProfile } from "../src/bossActionProfileCore.js";
import { bossGroupRequiresConfirmation, bossSequenceBlocker, buildBossActionMutation } from "../src/bossActionExecutionCore.js";
import { bossActionAutomationSummary, bossActionRowMeta, validateBossActionSelection } from "../src/bossActionsViewCore.js";
import { bossStateWithEpicLog, withEpicLog } from "../test-support/bossSequenceState.js";

const META = "com.thebigpicture.initiative/meta";
const html = await readFile(new URL("fixtures/boss-actions/auril-phase-2.html", import.meta.url), "utf8");
const p2 = await importBossActionHTML(html);
const ability = (profile, name) => profile.abilities.find((entry) => entry.name === name);
const named = (name) => ability(p2, name);
const creature = (id, hp) => ({ id, name: id, type: "IMAGE", layer: "CHARACTER", metadata: { [META]: { hp, hpMax: hp, inInitiative: true } } });
const auril = creature("auril", 580);
const state = (round, ids) => bossStateWithEpicLog(auril, p2, round, ids);
const blocker = (name, round, ids) => bossSequenceBlocker(p2, named(name), state(round, ids), round, "Auril");

test("the sequence as closed v20 data: two openers, two closers after them, Rock after Gather, Gather's list", () => {
  assert.deepEqual([p2.profileVersion, p2.parserVersion], [22, 22]);
  assert.deepEqual(named("Breathe Deep").sequence, { slot: "first" });
  assert.equal(named("Breathe Deep").automation, "UNSUPPORTED", "a manual registration");
  assert.deepEqual(named("Gather the Winter Sky").sequence, { slot: "first",
    allowOnly: ["titan-s-grasp", "crush", "hurl", "hand-slam", "rock", "epic-resistance"] });
  assert.match(named("Gather the Winter Sky").manualText, /^Nel round 2 è obbligatoria come prima Azione Epica/);
  assert.deepEqual(named("Breath of the Long Night").sequence, { slot: "last", after: "breathe-deep" });
  assert.deepEqual(named("Meteor Swarm").sequence, { slot: "last", after: "gather-the-winter-sky" });
  assert.equal(named("Meteor Swarm").execution.requiresConfirmation, undefined);
  assert.deepEqual(named("Rock").sequence, { after: "gather-the-winter-sky" });
  for (const name of ["Breath of the Long Night", "Meteor Swarm"]) assert.equal(bossGroupRequiresConfirmation(named(name)), false, name);
  assert.equal(bossActionRowMeta(named("Breathe Deep"), {}).tag, "Manuale · prima del round");
  assert.equal(bossActionRowMeta(named("Rock"), {}).tag, "Attacco +10", "Rock has no slot of its own");
  assert.match(bossActionAutomationSummary(named("Rock"), {}).automatic, /requisito di sequenza verificato dal registro del round/);
  assert.doesNotMatch(bossActionAutomationSummary(named("Rock"), {}).manual, /prerequisito da confermare/);
});

test("printed variants keep the v19 behaviour: the confirmation, the manual prerequisite, no list", async () => {
  // Without Gather the Winter Sky in the profile: Meteor Swarm asks for the confirmation, Rock for its prerequisite.
  const noGather = await importBossActionHTML(html.replace("Gather the Winter Sky (1/Phase).", "Raccolta del Cielo (1/Phase)."));
  assert.equal(ability(noGather, "Meteor Swarm").sequence, undefined);
  assert.equal(ability(noGather, "Meteor Swarm").execution.requiresConfirmation, true);
  assert.match(ability(noGather, "Meteor Swarm").manualText, /soltanto se ha usato Gather the Winter Sky come prima Azione Epica/);
  assert.equal(ability(noGather, "Rock").sequence, undefined);
  assert.equal(validateBossActionSelection({ sourceId: "auril", action: ability(noGather, "Rock"), targetId: "dars", targets: [auril, creature("dars", 60)],
    mode: "ranged", outcome: "hit", componentAmounts: { bludgeoning: 29 } }).error, "Conferma il prerequisito manuale prima di risolvere l’azione.");
  // Without Breathe Deep: Breath keeps its confirmation.
  const noDeep = await importBossActionHTML(html.replace("Breathe Deep (1/Round).", "Respiro Profondo (1/Round)."));
  assert.equal(ability(noDeep, "Breath of the Long Night").sequence, undefined);
  assert.equal(bossGroupRequiresConfirmation(ability(noDeep, "Breath of the Long Night")), true);
  // An unknown name in Gather's list: the restriction stays manual text, the slot stays.
  const list = await importBossActionHTML(html.replace("Hand Slam, Rock o Epic Resistance;", "Hand Slam, Rock o Valanga;"));
  assert.deepEqual(ability(list, "Gather the Winter Sky").sequence, { slot: "first" });
  // An altered Breathe Deep text stays a plain manual registration.
  const deep = await importBossActionHTML(html.replace("e non nello stesso round di Gather the Winter Sky.", "anche nello stesso round di Gather the Winter Sky."));
  assert.equal(ability(deep, "Breathe Deep").sequence, undefined);
  assert.equal(ability(deep, "Breath of the Long Night").sequence, undefined, "its closer falls back too");
});

test("a v19 profile cannot carry the v20 shapes; v20 refuses an after that is not an opener", () => {
  const v19 = structuredClone({ ...p2, profileVersion: 19, parserVersion: 19 });
  assert.throws(() => validateBossActionProfile(v19), /sequence/);
  for (const name of ["Rock", "Gather the Winter Sky"]) {
    const only = structuredClone({ ...p2, profileVersion: 19, parserVersion: 19 });
    for (const entry of only.abilities) if (entry.name !== name) delete entry.sequence;
    assert.throws(() => validateBossActionProfile(only), /sequence/, name);
  }
  for (const mutate of [
    (p) => { ability(p, "Rock").sequence.after = "icekiss-2"; },
    (p) => { ability(p, "Rock").sequence.after = "rock"; },
    (p) => { ability(p, "Breath of the Long Night").sequence.slot = "middle"; },
    (p) => { ability(p, "Gather the Winter Sky").sequence.allowOnly.push("aura-gelida"); },
    (p) => { ability(p, "Gather the Winter Sky").sequence.allowOnly.push("gather-the-winter-sky"); },
    (p) => { ability(p, "Breathe Deep").sequence.allowOnly = ["crush"]; ability(p, "Breathe Deep").sequence.slot = "last"; },
    (p) => { ability(p, "Rock").sequence = {}; },
  ]) {
    const invalid = structuredClone(p2);
    mutate(invalid);
    assert.throws(() => validateBossActionProfile(invalid), /invalid|unexpected/i);
  }
});

test("the round log: one opener per round, each closer after its own opener, Rock only in Gather's round", () => {
  assert.equal(blocker("Breathe Deep", 1, []), "");
  assert.equal(blocker("Gather the Winter Sky", 2, []), "");
  assert.match(blocker("Gather the Winter Sky", 1, ["breathe-deep"]), /prima Azione Epica del round: nel round 1 Auril ha già usato Breathe Deep/);
  assert.match(blocker("Breathe Deep", 1, ["icekiss-2"]), /prima Azione Epica/);
  assert.equal(blocker("Breath of the Long Night", 1, ["breathe-deep", "icekiss-2"]), "");
  assert.match(blocker("Breath of the Long Night", 1, ["icekiss-2"]), /richiede Breathe Deep nello stesso round/);
  assert.match(blocker("Breath of the Long Night", 2, []), /richiede Breathe Deep/, "the recharge does not carry over");
  assert.equal(blocker("Rock", 2, ["gather-the-winter-sky"]), "");
  assert.match(blocker("Rock", 2, []), /Rock richiede Gather the Winter Sky nello stesso round/);
  assert.match(bossSequenceBlocker(p2, named("Rock"), state(2, ["gather-the-winter-sky"]), 3, "Auril"), /richiede Gather/, "Gather ends with its round");
  assert.equal(blocker("Meteor Swarm", 2, ["gather-the-winter-sky", "crush"]), "");
  assert.match(blocker("Meteor Swarm", 2, ["breathe-deep"]), /richiede Gather the Winter Sky/);
});

test("during Gather the Winter Sky only the listed epic actions, Rock and Meteor Swarm", () => {
  const during = (name) => blocker(name, 2, ["gather-the-winter-sky"]);
  for (const name of ["Titan's Grasp", "Crush", "Hurl", "Hand Slam", "Rock", "Epic Resistance", "Meteor Swarm"]) assert.equal(during(name), "", name);
  for (const name of ["Icekiss +2", "Frostmaiden's Kiss", "Mark of the Frostmaiden", "Spellcasting", "Breath of the Long Night", "Breathe Deep"]) {
    assert.equal(during(name), "Durante Gather the Winter Sky Auril può usare soltanto Titan's Grasp, Crush, Hurl, Hand Slam, Rock, Epic Resistance, Meteor Swarm.", name);
  }
  assert.equal(blocker("Icekiss +2", 3, []), "", "the next round is free again");
});

test("Rock resolves without the manual confirmation once Gather opened the round", () => {
  const rock = named("Rock");
  const targets = [auril, creature("dars", 60)];
  const selection = validateBossActionSelection({ sourceId: "auril", action: rock, targetId: "dars", targets, mode: "ranged", outcome: "hit", componentAmounts: { bludgeoning: 29 } });
  assert.equal(selection.ok, true, selection.error);
  assert.equal(selection.value.manualConfirmed, undefined);
  const plan = buildBossActionMutation({ profile: p2, action: rock, sourceItem: withEpicLog(auril, p2, 2, ["gather-the-winter-sky"]), targetItem: creature("dars", 60),
    mode: "ranged", outcome: "hit", componentAmounts: { bludgeoning: 29 }, actionInstanceId: "boss-action:rock", round: 2 });
  assert.equal(plan.change.afterHP, 31);
  assert.deepEqual(plan.options.metadataPatches[0].fields.bossActionState.value.epicLog, { round: 2, actionIds: ["gather-the-winter-sky", "rock"] });
  assert.throws(() => buildBossActionMutation({ profile: p2, action: rock, sourceItem: auril, targetItem: creature("dars", 60),
    mode: "ranged", outcome: "hit", componentAmounts: { bludgeoning: 29 }, actionInstanceId: "boss-action:rock-2", round: 2 }), /richiede Gather/);
});
