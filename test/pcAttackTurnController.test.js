import assert from "node:assert/strict";
import test, { mock } from "node:test";

const sdk = { onReady() {}, broadcast: { onMessage: () => () => {}, sendMessage: async () => {} }, player: { getRole: async () => "GM" },
  scene: { items: { getItems: async () => [] } }, room: {}, popover: {} };
mock.module("@owlbear-rodeo/sdk", { exports: { default: sdk, buildLabel() {}, buildImage() {}, buildPath() {}, buildShape() {}, buildText() {}, Command: class {} } });
const { createPcAttackTurnController, pcAttackTurnOf, pcAttackTurnSourceId, pcAttackTurnReady, PC_ATTACK_CONSOLE_CHANNEL } =
  await import("../src/pcAttackTurnController.js");

const META = "com.thebigpicture.initiative/meta";
const bow = { id: "bow", label: "Arco", kind: "attack", range: "ranged", components: [{ type: "piercing", formula: "1d6+3" }] };
const creature = (id, meta = {}) => ({ id, name: id, type: "IMAGE", layer: "CHARACTER", metadata: { [META]: { hp: 20, hpMax: 20, inInitiative: true, ...meta } } });
const archer = creature("mira", { initiativeCard: { quickActions: [bow] } });
const state = (current, round = 1, order = ["mira", "goblin", "__LAIR__", "mira::p1"]) => ({ order, current, round });

function fixture({ items = [archer, creature("goblin")], enabled = true, open = false } = {}) {
  const opened = [], followed = [];
  let consoleOpen = open, isEnabled = enabled;
  const controller = createPcAttackTurnController({
    api: { scene: { items: { getItems: async (ids) => items.filter((item) => ids.includes(item.id)) } } },
    isEnabled: () => isEnabled,
    openConsole: async (sourceId) => { opened.push(sourceId); },
    isConsoleOpen: async () => consoleOpen,
    followConsole: async (sourceId, name) => { followed.push([sourceId, name]); },
  });
  return { controller, opened, followed, setOpen: (value) => { consoleOpen = value; }, setEnabled: (value) => { isEnabled = value; } };
}

test("the turn key changes with the round or the actor, not with the order", () => {
  assert.deepEqual(pcAttackTurnOf(state(0, 2)), { actorId: "mira", key: "2|mira" });
  assert.equal(pcAttackTurnOf({ ...state(0, 2), order: ["goblin", "mira"], current: 1 }).key, "2|mira");
  assert.equal(pcAttackTurnOf({ order: [] }), null);
  assert.equal(pcAttackTurnOf(null), null);
});

test("the Lair and Epic Action slots have no console; a Paragon's extra turn is its creature's", () => {
  assert.equal(pcAttackTurnSourceId("__LAIR__"), "");
  assert.equal(pcAttackTurnSourceId("__EPIC__:auril:1"), "");
  assert.equal(pcAttackTurnSourceId("mira::p1"), "mira");
  assert.equal(pcAttackTurnSourceId("mira"), "mira");
});

test("only a standing creature with attacks gets the console", () => {
  assert.equal(pcAttackTurnReady(archer), true);
  assert.equal(pcAttackTurnReady(creature("goblin")), false, "no attacks");
  assert.equal(pcAttackTurnReady(creature("down", { hp: 0, initiativeCard: { quickActions: [bow] } })), false, "0 HP");
  assert.equal(pcAttackTurnReady(creature("unknown", { hp: undefined, initiativeCard: { quickActions: [bow] } })), true, "HP not tracked");
  assert.equal(pcAttackTurnReady({ ...archer, layer: "PROP" }), false, "not a creature token");
});

test("the first turn seen opens nothing; the next turns open for actors with attacks", async () => {
  const f = fixture();
  await f.controller.onState(state(0));
  assert.deepEqual(f.opened, [], "a reload or a scene change never opens the console");
  await f.controller.onState(state(1));
  await f.controller.onState(state(2));
  assert.deepEqual(f.opened, [], "the goblin has no attacks, the Lair has no console");
  await f.controller.onState(state(3));
  assert.deepEqual(f.opened, ["mira"], "the Paragon's extra turn opens the creature's console");
  await f.controller.onState(state(0, 2));
  assert.deepEqual(f.opened, ["mira", "mira"]);
});

test("one opening per turn: closing the console keeps it closed until the next turn", async () => {
  const f = fixture();
  await f.controller.onState(state(1));
  await f.controller.onState(state(0, 2));
  await f.controller.onState(state(0, 2));
  await f.controller.onState({ ...state(0, 2), order: ["mira", "goblin", "orc"] });
  assert.deepEqual(f.opened, ["mira"]);
});

test("the option off, or a console already open, opens nothing", async () => {
  const f = fixture({ enabled: false });
  await f.controller.onState(state(1));
  await f.controller.onState(state(0, 2));
  assert.deepEqual(f.opened, []);
  f.setEnabled(true); f.setOpen(true);
  await f.controller.onState(state(3, 2));
  assert.deepEqual(f.opened, [], "an open console is never reloaded");
  assert.deepEqual(f.followed, [["mira", "mira"]], "it is told to follow instead");
});

test("several turns in a row: only the latest one opens", async () => {
  const f = fixture({ items: [archer, creature("orc", { initiativeCard: { quickActions: [bow] } })] });
  const order = ["mira", "orc", "goblin"];
  await f.controller.onState({ order, current: 2, round: 1 });
  f.controller.onState({ order, current: 0, round: 2 });
  await f.controller.onState({ order, current: 1, round: 2 });
  assert.deepEqual(f.opened, ["orc"]);
});

test("a scene change records the new scene's turn without opening", async () => {
  const f = fixture();
  await f.controller.onState(state(1));
  f.controller.reset();
  await f.controller.onState(state(0, 3), { prime: true });
  assert.deepEqual(f.opened, []);
  await f.controller.onState(state(3, 3));
  assert.deepEqual(f.opened, ["mira"]);
});

test("the console channel is the one the console answers on", () => {
  assert.equal(PC_ATTACK_CONSOLE_CHANNEL, "com.thebigpicture.initiative/pc-attack-console");
});

test("an open console follows every turn: the actor, or nothing for a turn without one to show", async () => {
  const f = fixture({ open: true });
  await f.controller.onState(state(0));
  await f.controller.onState(state(1));
  await f.controller.onState(state(2));
  await f.controller.onState(state(3));
  assert.deepEqual(f.followed, [["", "goblin"], ["", ""], ["mira", "mira"]], "the goblin has no attacks, the Lair no creature");
  assert.deepEqual(f.opened, []);
  f.setEnabled(false);
  await f.controller.onState(state(0, 2));
  assert.equal(f.followed.length, 3, "the option off: the console stays where the GM left it");
});
