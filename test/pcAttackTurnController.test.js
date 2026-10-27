import assert from "node:assert/strict";
import test, { mock } from "node:test";

const sdk = { onReady() {}, broadcast: { onMessage: () => () => {}, sendMessage: async () => {} }, player: { getRole: async () => "GM" },
  scene: { items: { getItems: async () => [] } }, room: {}, popover: {} };
mock.module("@owlbear-rodeo/sdk", { exports: { default: sdk, buildLabel() {}, buildImage() {}, buildPath() {}, buildShape() {}, buildText() {}, Command: class {} } });
const { createPcAttackTurnController, pcAttackTurnOf, pcAttackTurnSourceId, pcAttackTurnReady, pcAttackEpicBossId, pcAttackTurnBoss, PC_ATTACK_CONSOLE_CHANNEL,
  pcAttackTurnGroup, pingConsole } =
  await import("../src/pcAttackTurnController.js");

const META = "com.thebigpicture.initiative/meta";
const bow = { id: "bow", label: "Arco", kind: "attack", range: "ranged", components: [{ type: "piercing", formula: "1d6+3" }] };
const creature = (id, meta = {}) => ({ id, name: id, type: "IMAGE", layer: "CHARACTER", metadata: { [META]: { hp: 20, hpMax: 20, inInitiative: true, ...meta } } });
const archer = creature("mira", { initiativeCard: { quickActions: [bow] } });
const state = (current, round = 1, order = ["mira", "goblin", "__LAIR__", "mira::p1"]) => ({ order, current, round });

// getCard: the raw card (a bound boss's binding is a strict profile identity, out of scope here).
function fixture({ items = [archer, creature("goblin")], enabled = true, open = false, bossOpen = false } = {}) {
  const opened = [], followed = [], bossOpened = [], bossClosed = [];
  let consoleOpen = open, isEnabled = enabled, bossConsoleOpen = bossOpen;
  const controller = createPcAttackTurnController({
    api: { scene: { items: { getItems: async (ids) => items.filter((item) => ids.includes(item.id)) } } },
    // enabled: one boolean for both switches, or { pc, monsters } (attacchi dei mostri, lotto 7).
    isEnabled: (group) => (isEnabled && typeof isEnabled === "object" ? isEnabled[group] === true : isEnabled),
    openConsole: async (sourceId) => { opened.push(sourceId); },
    isConsoleOpen: async () => consoleOpen,
    followConsole: async (sourceId, name) => { followed.push([sourceId, name]); },
    openBossConsole: async (sourceId) => { bossOpened.push(sourceId); bossConsoleOpen = { sourceId, idle: true }; },
    isBossConsoleOpen: async () => bossConsoleOpen,
    // An idle Boss Actions closes when asked; a busy one stays.
    closeBossConsole: async () => { bossClosed.push(bossConsoleOpen?.sourceId ?? true); if (bossConsoleOpen?.idle !== false) bossConsoleOpen = false; },
    closeSettleMs: 0,
    getCard: (item) => item?.metadata?.[META]?.initiativeCard || {},
  });
  return { controller, opened, followed, bossOpened, bossClosed, setOpen: (value) => { consoleOpen = value; }, setEnabled: (value) => { isEnabled = value; },
    setBossOpen: (value) => { bossConsoleOpen = value; } };
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

// Bosses: an Epic Boss and a creature bound to a boss profile.
const auril = creature("auril", { epic: true });
const bound = creature("frost", { initiativeCard: { bossActionBinding: { profileId: "frost" }, quickActions: [bow] } });
const bossOrder = ["auril", "mira", "__EPIC__::auril::after::mira", "frost", "goblin"];

test("the boss an Epic Action slot belongs to; a boss is an Epic Boss or a bound creature, standing", () => {
  assert.equal(pcAttackEpicBossId("__EPIC__::auril::after::mira"), "auril");
  assert.equal(pcAttackEpicBossId("mira"), "");
  const raw = (item) => item?.metadata?.[META]?.initiativeCard || {};
  assert.equal(pcAttackTurnBoss(auril, raw), true);
  assert.equal(pcAttackTurnBoss(bound, raw), true);
  assert.equal(pcAttackTurnBoss(archer, raw), false);
  assert.equal(pcAttackTurnBoss(creature("down", { epic: true, hp: 0 }), raw), false, "a boss at 0 HP");
});

test("a boss's turn and its Epic Action slots open Boss Actions, never the attack console", async () => {
  const f = fixture({ items: [auril, archer, bound, creature("goblin")] });
  await f.controller.onState({ order: bossOrder, current: 4, round: 1 });
  await f.controller.onState({ order: bossOrder, current: 0, round: 2 });
  assert.deepEqual([f.bossOpened, f.opened], [["auril"], []]);
  await f.controller.onState({ order: bossOrder, current: 1, round: 2 });
  assert.deepEqual(f.opened, ["mira"]);
  await f.controller.onState({ order: bossOrder, current: 2, round: 2 });
  assert.deepEqual(f.bossOpened, ["auril", "auril"], "the Epic Action slot after Mira's turn");
  await f.controller.onState({ order: bossOrder, current: 3, round: 2 });
  assert.deepEqual(f.bossOpened, ["auril", "auril", "frost"], "a bound boss, attacks or not");
  assert.deepEqual(f.opened, ["mira"]);
});

test("an open Boss Actions is never reloaded; a clean attack console left open closes on the boss's turn", async () => {
  const f = fixture({ items: [auril, archer], open: true, bossOpen: true });
  await f.controller.onState({ order: ["mira", "auril"], current: 0, round: 1 });
  await f.controller.onState({ order: ["mira", "auril"], current: 1, round: 1 });
  assert.deepEqual(f.bossOpened, [], "already open");
  assert.deepEqual(f.followed, [["", "auril"]], "the attack console is told the turn has nothing for it");
  f.setEnabled(false);
  f.setBossOpen(false);
  await f.controller.onState({ order: ["mira", "auril"], current: 1, round: 2 });
  assert.deepEqual(f.bossOpened, [], "the option off");
});

test("Boss Actions closes when the boss's turn or Epic Action is over, as long as it is idle", async () => {
  const f = fixture({ items: [auril, archer, bound, creature("goblin")] });
  await f.controller.onState({ order: bossOrder, current: 1, round: 2 });
  await f.controller.onState({ order: bossOrder, current: 2, round: 2 });
  assert.deepEqual(f.bossOpened, ["auril"], "the Epic Action slot after Mira's turn");
  await f.controller.onState({ order: bossOrder, current: 4, round: 2 });
  assert.deepEqual(f.bossClosed, ["auril"], "the slot is over: Boss Actions closes");
  f.setBossOpen({ sourceId: "auril", idle: false });
  await f.controller.onState({ order: bossOrder, current: 1, round: 3 });
  assert.deepEqual(f.bossClosed, ["auril", "auril"], "asked again; a busy console decides to stay");
});

test("from one boss to another: an idle Boss Actions gives way, a busy one stays", async () => {
  const f = fixture({ items: [auril, bound], bossOpen: { sourceId: "auril", idle: true } });
  await f.controller.onState({ order: ["auril", "frost"], current: 0, round: 1 });
  await f.controller.onState({ order: ["auril", "frost"], current: 1, round: 1 });
  assert.deepEqual([f.bossClosed, f.bossOpened], [["auril"], ["frost"]]);
  const busy = fixture({ items: [auril, bound], bossOpen: { sourceId: "auril", idle: false } });
  await busy.controller.onState({ order: ["auril", "frost"], current: 0, round: 1 });
  await busy.controller.onState({ order: ["auril", "frost"], current: 1, round: 1 });
  assert.deepEqual([busy.bossClosed, busy.bossOpened], [[], []], "a resolution in progress keeps Auril's console");
});

// Attacchi dei mostri, lotto 7: due interruttori, PG (personaggi e alleati) e Mostri (ogni altra creatura, i boss).
const orc = creature("orc", { attitude: "enemy", initiativeCard: { quickActions: [bow] } });
const villager = creature("npc", { attitude: "neutral", initiativeCard: { quickActions: [bow] } });
const friend = creature("ally", { attitude: "ally", initiativeCard: { quickActions: [bow] } });
const sideOrder = ["mira", "orc", "npc", "ally", "__LAIR__", "auril", "mira::p1"];

test("whose switch a turn follows: characters and allies PG, every other creature and every boss Mostri", () => {
  const raw = (item) => item?.metadata?.[META]?.initiativeCard || {};
  assert.equal(pcAttackTurnGroup(creature("hero", { attitude: "pc" }), raw), "pc");
  assert.equal(pcAttackTurnGroup(friend, raw), "pc");
  assert.equal(pcAttackTurnGroup(archer, raw), "pc", "no attitude: an ally, as the tracker shows it");
  assert.equal(pcAttackTurnGroup(orc, raw), "monsters");
  assert.equal(pcAttackTurnGroup(villager, raw), "monsters");
  assert.equal(pcAttackTurnGroup(creature("boss", { attitude: "pc", epic: true }), raw), "monsters", "a boss is a monster's turn");
});

test("PG on, Mostri off: the console opens for characters and allies only, a monster's turn moves nothing", async () => {
  const f = fixture({ items: [archer, orc, villager, friend, auril], enabled: { pc: true, monsters: false } });
  await f.controller.onState({ order: sideOrder, current: 6, round: 1 });
  for (let current = 0; current < 7; current += 1) await f.controller.onState({ order: sideOrder, current, round: 2 });
  assert.deepEqual(f.opened, ["mira", "ally", "mira"], "Mira, the ally, Mira's Paragon turn");
  assert.deepEqual(f.bossOpened, [], "the boss follows Mostri");
});

test("Mostri on, PG off: monsters and bosses only; an open console stays where it is on a character's turn", async () => {
  const f = fixture({ items: [archer, orc, villager, friend, auril], enabled: { pc: false, monsters: true } });
  await f.controller.onState({ order: sideOrder, current: 6, round: 1 });
  for (let current = 0; current < 7; current += 1) await f.controller.onState({ order: sideOrder, current, round: 2 });
  assert.deepEqual(f.opened, ["orc", "npc"]);
  assert.deepEqual(f.bossOpened, ["auril"]);
  const open = fixture({ items: [archer, orc], enabled: { pc: false, monsters: true }, open: "orc" });
  await open.controller.onState({ order: ["orc", "mira"], current: 0, round: 1 });
  await open.controller.onState({ order: ["orc", "mira"], current: 1, round: 1 });
  assert.deepEqual(open.followed, [], "Mira's turn: the PG switch is off, the console is left alone");
});

test("both off: nothing; the Lair turn follows either switch", async () => {
  const off = fixture({ items: [archer, orc], enabled: { pc: false, monsters: false }, open: true });
  await off.controller.onState({ order: ["mira", "orc", "__LAIR__"], current: 0, round: 1 });
  for (const current of [1, 2]) await off.controller.onState({ order: ["mira", "orc", "__LAIR__"], current, round: 1 });
  assert.deepEqual([off.opened, off.followed], [[], []]);
  const lair = fixture({ items: [archer, orc], enabled: { pc: false, monsters: true }, open: true });
  await lair.controller.onState({ order: ["orc", "__LAIR__"], current: 0, round: 1 });
  await lair.controller.onState({ order: ["orc", "__LAIR__"], current: 1, round: 1 });
  assert.deepEqual(lair.followed, [["", ""]], "the open console leaves the Lair turn empty");
});

// A console answers the ping with a pong while it is open; its popover's height is asked at the same time.
function pingApi({ height, pong = false, pongDelayMs = 5 }) {
  const listeners = new Set();
  return {
    broadcast: {
      onMessage: (_channel, listener) => { listeners.add(listener); return () => listeners.delete(listener); },
      sendMessage: async () => {
        if (pong) setTimeout(() => { for (const listener of [...listeners]) listener({ data: { type: "pong", sourceId: "mira" } }); }, pongDelayMs);
      },
    },
    ...(height === "missing" ? {} : { popover: { getHeight: async () => height } }),
  };
}

test("una console chiusa si riconosce subito dall'altezza del suo popover, senza aspettare il timeout del ping", async () => {
  const startedAt = Date.now();
  assert.equal(await pingConsole(pingApi({ height: undefined }), PC_ATTACK_CONSOLE_CHANNEL, 2000, "console"), false);
  assert.ok(Date.now() - startedAt < 500, "closed: no wait for the 2 s timeout");
});

test("una console con un'altezza resta attesa fino al suo pong: mai presa per chiusa e ricaricata", async () => {
  const open = await pingConsole(pingApi({ height: 420, pong: true, pongDelayMs: 40 }), PC_ATTACK_CONSOLE_CHANNEL, 2000, "console");
  assert.deepEqual(open, { type: "pong", sourceId: "mira" });
  // Without the popover's height (or its id) the ping alone decides, as before.
  const startedAt = Date.now();
  assert.equal(await pingConsole(pingApi({ height: "missing" }), PC_ATTACK_CONSOLE_CHANNEL, 120, "console"), false);
  assert.ok(Date.now() - startedAt >= 100, "no height to ask: the ping's timeout");
  assert.deepEqual(await pingConsole(pingApi({ height: undefined, pong: true }), PC_ATTACK_CONSOLE_CHANNEL, 2000), { type: "pong", sourceId: "mira" },
    "no popover id: the pong still counts");
});
