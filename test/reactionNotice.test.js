// Avvisi di reazione, lot R6 (docs/STUDIO_AVVISI_REAZIONE.md §6.14, decisions H1-H5): the GM's prompt on the players'
// screens. Only the characters' rows leave the GM's client (D1); the table screen reads, the player online answers,
// the GM confirms (D9).
import test, { mock } from "node:test";
import assert from "node:assert/strict";

mock.module("@owlbear-rodeo/sdk", {
  exports: {
    default: { onReady() {}, scene: { items: { getItems: async () => [] } } },
    buildPath: () => ({}), buildLabel: () => ({}), buildImage: () => ({}), buildText: () => ({}), buildShape: () => ({}),
    Command: { MOVE: 0, LINE: 1, CUBIC: 2, CLOSE: 3 },
  },
});

const {
  REACTION_NOTICE_CHANNEL, buildReactionNoticePayload, normalizeReactionNotice, reactionNoticeId, reactionNoticeRowsFor,
} = await import("../src/reactionNoticeCore.js");
const { createReactionNoticeBroadcaster } = await import("../src/reactionNoticeBroadcast.js");
const { createReactionPrompt, reactionPromptCandidates } = await import("../src/reactionPromptView.js");
const { FakeNode, textOf } = await import("../test-support/fakeBossActionsDom.js");

const META = "com.thebigpicture.initiative/meta";
const creature = (id, meta = {}, name = id, extra = {}) => ({ id, name, ...extra, metadata: { [META]: { hp: 30, hpMax: 30, attitude: "pc", ...meta } } });
const PLAYER = "a1b2c3d4-0000-4000-8000-000000000001";
const orc = creature("orc", { attitude: "enemy" }, "Orco");
const hiddenOrc = creature("orc", { attitude: "enemy" }, "Orco", { visible: false });
const mage = creature("mage", { initiativeCard: { armorClass: 15, spellbook: { spellIds: ["shield"] } },
  assignedPlayer: { id: PLAYER, name: "Anna" } }, "Mira");
const guard = creature("guard", { attitude: "ally", initiativeCard: { spellbook: { spellIds: ["shield"] } } }, "Guardia");
const state = { round: 1, current: 0, order: ["orc", "mage", "guard"] };
const event = (targetId) => [{ trigger: "hit", attackerId: "orc", targetIds: [targetId], range: "melee", attackRoll: true, damageTypes: ["slashing"] }];
const npcsOn = { actors: { pcs: true, npcs: true } };
const shownFor = (targetId, items, phase = "before") => {
  const list = reactionPromptCandidates({ event: event(targetId), items, state, options: npcsOn }, phase);
  return { phase, signature: `${phase}|draft|${targetId}`, list, items };
};

test("the payload: only the characters' rows, their players, a hidden attacker unnamed", () => {
  const shown = shownFor("mage", [orc, mage, guard]);
  assert.deepEqual(shown.list.map((candidate) => candidate.reactorId), ["mage"], "Shield only on its target");
  const payload = buildReactionNoticePayload({ shown, event: event("mage"), mode: "table", effectText: () => "+5 CA" });
  assert.deepEqual(payload.rows, [{ key: shown.list[0].key, reactorName: "Mira", label: "Scudo", effect: "+5 CA", playerIds: [PLAYER] }]);
  assert.equal(payload.promptId, reactionNoticeId(shown.signature));
  assert.match(payload.why, /^Colpo di Orco su Mira/u);
  const hidden = buildReactionNoticePayload({ shown: { ...shown, items: [hiddenOrc, mage, guard] }, event: event("mage"), mode: "table" });
  assert.match(hidden.why, /^Colpo di una creatura su Mira/u);
  const ally = shownFor("guard", [orc, mage, guard]);
  assert.equal(ally.list.length, 1, "the ally's Shield is the GM's");
  assert.equal(buildReactionNoticePayload({ shown: ally, event: event("guard"), mode: "online" }), null, "no character: nothing leaves");
  assert.equal(buildReactionNoticePayload({ shown, event: event("mage"), mode: "" }), null, "no mode: nothing");
});

test("what a screen shows (H3): every row at the table, read only; online only the player's own, with buttons", () => {
  const notice = normalizeReactionNotice({ type: "show", promptId: "rp-abc", mode: "table", why: "x", rows: [{ key: "k", reactorName: "Mira", label: "Scudo", effect: "", playerIds: [PLAYER] }] });
  assert.deepEqual(reactionNoticeRowsFor(notice, "someone").rows.map((row) => row.key), ["k"]);
  assert.equal(reactionNoticeRowsFor(notice, "someone").interactive, false);
  const online = { ...notice, mode: "online" };
  assert.deepEqual(reactionNoticeRowsFor(online, "someone").rows, []);
  assert.deepEqual(reactionNoticeRowsFor(online, PLAYER), { rows: notice.rows, interactive: true });
  assert.deepEqual(normalizeReactionNotice({ type: "answer", promptId: "rp-abc", key: "k", choice: "use", playerName: "Anna" }),
    { type: "answer", promptId: "rp-abc", key: "k", choice: "use", playerId: "", playerName: "Anna" });
  assert.equal(normalizeReactionNotice({ type: "answer", promptId: "rp-abc", key: "k", choice: "cast" }), null);
  assert.equal(normalizeReactionNotice({ type: "show", promptId: "bad id", mode: "table", rows: [] }), null);
});

function fakeObr() {
  const sent = [];
  const listeners = new Set();
  return {
    sent, listeners,
    broadcast: {
      sendMessage: async (channel, data, options) => { sent.push({ channel, data, destination: options?.destination }); },
      onMessage: (channel, listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    },
    hear: (data) => { for (const listener of listeners) listener({ data }); },
  };
}

test("the sender (H4): the table only with the screen option, online always; one show per change, a clear at the end", async () => {
  const obr = fakeObr();
  const shown = shownFor("mage", [orc, mage, guard]);
  const off = createReactionNoticeBroadcaster({ obr, online: async () => false });
  await off.update({ shown, event: event("mage"), options: { screen: false } });
  assert.deepEqual(obr.sent, [], "table profile, option off");
  await off.update({ shown, event: event("mage"), options: { screen: true } });
  await off.update({ shown, event: event("mage"), options: { screen: true } });
  assert.deepEqual(obr.sent.map((message) => [message.channel, message.data.type, message.data.mode, message.destination]),
    [[REACTION_NOTICE_CHANNEL, "show", "table", "REMOTE"]], "sent once");
  await off.update({ shown: { phase: "", signature: "", list: [], items: [] }, options: { screen: true } });
  assert.deepEqual(obr.sent.at(-1).data, { type: "clear", promptId: reactionNoticeId(shown.signature) });
  const online = createReactionNoticeBroadcaster({ obr, online: async () => true });
  await online.update({ shown, event: event("mage"), options: { screen: false } });
  assert.equal(obr.sent.at(-1).data.mode, "online");
  await online.stop();
  assert.equal(obr.sent.at(-1).data.type, "clear", "a console that closes clears its prompt");
});

test("the GM's prompt: a player's Usa lights the row's Usa; Ignora is only a sign; another prompt's answer is not heard", async () => {
  const doc = { createElement: (tag) => new FakeNode(doc, tag) };
  const box = new FakeNode(doc, "div");
  let listener = null;
  const updates = [];
  const notices = { update: async (payload) => { updates.push(payload); }, onAnswer: (value) => { listener = value; }, stop: async () => {} };
  const option = { read: () => undefined, subscribe: async (value) => { value(undefined); return () => {}; }, stop() {} };
  const prompt = createReactionPrompt(box, { documentRef: doc, option, onUse: async () => {}, notices });
  prompt.update({ event: event("mage"), items: [orc, mage, guard], state, draftKey: "draft-1" });
  assert.equal(updates.at(-1).shown.list.length, 1, "the shown prompt goes to the sender");
  const [candidate] = prompt.current();
  const promptId = reactionNoticeId(updates.at(-1).shown.signature);
  listener({ type: "answer", promptId: "rp-other", key: candidate.key, choice: "use", playerName: "Anna" });
  assert.doesNotMatch(textOf(box), /Anna/u);
  listener({ type: "answer", promptId, key: candidate.key, choice: "use", playerName: "Anna" });
  assert.match(textOf(box), /Anna: Usa/u);
  const use = box.querySelectorAll("BUTTON").find((node) => node.dataset.reactionPromptUse === candidate.key);
  assert.match(use.className, /reaction-prompt-use-requested/u);
  listener({ type: "answer", promptId, key: candidate.key, choice: "ignore", playerName: "Anna" });
  assert.match(textOf(box), /Anna: ignora/u);
  prompt.destroy();
});
