import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { sanitizeQuickActions } from "../src/quickActionsCore.js";
import { isSpellbookQuickAction } from "../src/spellbookCore.js";

const CHANNEL = "com.thebigpicture.initiative/pc-attack-spell-launch";
const source = readFileSync(new URL("../src/initiativeList.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");

// The tracker's listener for the attack console's Lancia, cut out of initiativeList.js with its collaborators faked.
function harness({ isGm = true, current = true, entries = null, run = async () => ({ mode: "review" }) } = {}) {
  const start = source.indexOf("// The attack console (pc-attack.js) launches a spell");
  const end = source.indexOf("function __toggleTrackerQuickActionsPopover", start);
  assert.ok(start >= 0 && end > start);
  const listeners = [], sent = [], runs = [];
  const OBR = { broadcast: {
    onMessage: (channel, listener) => { listeners.push({ channel, listener }); return () => {}; },
    sendMessage: async (channel, data, options) => { sent.push({ channel, data, options }); },
  } };
  const bless = { id: "book:bless", label: "Benedizione", kind: "spell", spellId: "bless" };
  const mace = { id: "mace", label: "Mazza", kind: "attack", range: "melee", components: [{ type: "bludgeoning", formula: "1d6" }] };
  const list = entries || [{ id: "mira", name: "Mira", quickActions: [mace, bless] }];
  const mount = new Function("OBR", "PC_ATTACK_SPELL_LAUNCH_CHANNEL", "IS_GM", "currentSceneEpoch", "readEntries",
    "__isCurrentSceneOperation", "sanitizeQuickActions", "isSpellbookQuickAction", "__runTrackerQuickAction",
    `${source.slice(start, end)}\nreturn mountPcAttackSpellLaunchListener;`)(
    OBR, CHANNEL, isGm, () => 7, async () => list, () => current, sanitizeQuickActions, isSpellbookQuickAction,
    async (entry, action) => { runs.push([entry.id, action.id]); return run(entry, action); });
  mount();
  const send = async (data) => {
    for (const { channel, listener } of listeners) if (channel === CHANNEL) listener({ data });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  return { send, sent, runs };
}

test("Lancia runs the 🪄 routing for a spell of the book, acknowledged at once and answered with the result", async () => {
  const h = harness();
  await h.send({ type: "launch", requestId: "r1", sourceId: "mira", actionId: "book:bless" });
  assert.deepEqual(h.runs, [["mira", "book:bless"]]);
  assert.deepEqual(h.sent.map((message) => message.data), [
    { requestId: "r1", type: "launch-accepted" },
    { requestId: "r1", type: "launch-result", ok: true, mode: "review" },
  ]);
  assert.ok(h.sent.every((message) => message.channel === CHANNEL && message.options?.destination === "LOCAL"));
});

test("only the book's spell actions: an attack or an unknown action is refused, never run", async () => {
  const h = harness();
  await h.send({ type: "launch", requestId: "r2", sourceId: "mira", actionId: "mace" });
  await h.send({ type: "launch", requestId: "r3", sourceId: "mira", actionId: "book:fireball" });
  await h.send({ type: "launch", requestId: "r4", sourceId: "ghost", actionId: "book:bless" });
  assert.deepEqual(h.runs, []);
  const results = h.sent.filter((message) => message.data.type === "launch-result").map((message) => message.data);
  assert.deepEqual(results.map((result) => [result.requestId, result.ok]), [["r2", false], ["r3", false], ["r4", false]]);
  assert.match(results[0].message, /non più nel grimorio/);
});

test("a player's tracker, a request without id or another message type stays silent", async () => {
  const player = harness({ isGm: false });
  await player.send({ type: "launch", requestId: "r5", sourceId: "mira", actionId: "book:bless" });
  assert.deepEqual([player.runs, player.sent], [[], []]);
  const gm = harness();
  await gm.send({ type: "launch", sourceId: "mira", actionId: "book:bless" });
  await gm.send({ type: "launch-result", requestId: "r6" });
  assert.deepEqual([gm.runs, gm.sent], [[], []]);
});

test("a scene change or a failed cast answers with the reason", async () => {
  const stale = harness({ current: false });
  await stale.send({ type: "launch", requestId: "r7", sourceId: "mira", actionId: "book:bless" });
  assert.deepEqual(stale.runs, []);
  assert.deepEqual(stale.sent.at(-1).data, { requestId: "r7", type: "launch-result", ok: false, message: "Scena cambiata." });
  const failing = harness({ run: async () => { throw new Error("Slot esauriti."); } });
  await failing.send({ type: "launch", requestId: "r8", sourceId: "mira", actionId: "book:bless" });
  assert.deepEqual(failing.sent.at(-1).data, { requestId: "r8", type: "launch-result", ok: false, message: "Slot esauriti." });
});
