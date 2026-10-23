import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { sanitizeQuickActions } from "../src/quickActionsCore.js";
import { isSpellbookQuickAction } from "../src/spellbookCore.js";

const CHANNEL = "com.thebigpicture.initiative/pc-attack-spell-launch";
const source = readFileSync(new URL("../src/initiativeList.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");

// The tracker's listener for the attack console's Lancia and Usa, cut out of initiativeList.js with its collaborators
// faked. classFeatures: the entry's context menu features (buildClassFeatureContextEntries).
function harness({ isGm = true, current = true, entries = null, run = async () => ({ mode: "review" }), activate = async () => ({}),
  rageActive = false } = {}) {
  const start = source.indexOf("function mountPcAttackSpellLaunchListener()");
  const end = source.indexOf("function __toggleTrackerQuickActionsPopover", start);
  assert.ok(start >= 0 && end > start);
  const listeners = [], sent = [], runs = [], activations = [];
  const OBR = { broadcast: {
    onMessage: (channel, listener) => { listeners.push({ channel, listener }); return () => {}; },
    sendMessage: async (channel, data, options) => { sent.push({ channel, data, options }); },
  } };
  const bless = { id: "book:bless", label: "Benedizione", kind: "spell", spellId: "bless" };
  const mace = { id: "mace", label: "Mazza", kind: "attack", range: "melee", components: [{ type: "bludgeoning", formula: "1d6" }] };
  const rageAction = { id: "rage", label: "Ira", kind: "feature", featureId: "barbaro-ira" };
  const classFeatures = [
    { featureId: "barbaro-ira", label: "Ira", plainName: "Ira", targetMode: "self", active: rageActive },
    { featureId: "paladino-imposizione-delle-mani", label: "Imposizione delle Mani", targetMode: "single-target", active: true },
  ];
  const list = entries || [{ id: "mira", name: "Mira", quickActions: [mace, bless, rageAction], classFeatures }];
  const mount = new Function("OBR", "PC_ATTACK_SPELL_LAUNCH_CHANNEL", "IS_GM", "currentSceneEpoch", "readEntries",
    "__isCurrentSceneOperation", "sanitizeQuickActions", "isSpellbookQuickAction", "__runTrackerQuickAction", "__activateClassFeatureFromContext",
    `${source.slice(start, end)}\nreturn mountPcAttackSpellLaunchListener;`)(
    OBR, CHANNEL, isGm, () => 7, async () => list, () => current, sanitizeQuickActions, isSpellbookQuickAction,
    async (entry, action) => { runs.push([entry.id, action.id]); return run(entry, action); },
    async (entry, featureId) => { activations.push([entry.id, featureId]); return activate(entry, featureId); });
  mount();
  const send = async (data) => {
    for (const { channel, listener } of listeners) if (channel === CHANNEL) listener({ data });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  const results = () => sent.filter((message) => message.data.type === "launch-result").map((message) => message.data);
  return { send, sent, runs, activations, results };
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

test("only the book's spells by actionId: an attack, a ⚡ quick action or an unknown action is refused, never run", async () => {
  const h = harness();
  await h.send({ type: "launch", requestId: "r2", sourceId: "mira", actionId: "mace" });
  await h.send({ type: "launch", requestId: "r3", sourceId: "mira", actionId: "rage" });
  await h.send({ type: "launch", requestId: "r4", sourceId: "mira", actionId: "book:fireball" });
  await h.send({ type: "launch", requestId: "r5", sourceId: "ghost", actionId: "book:bless" });
  assert.deepEqual(h.runs, []);
  assert.deepEqual(h.results().map((result) => [result.requestId, result.ok]), [["r2", false], ["r3", false], ["r4", false], ["r5", false]]);
  assert.match(h.results()[1].message, /non più nel grimorio/);
});

test("Usa activates a feature of the context menu by its id, as the card's context menu does", async () => {
  const h = harness();
  await h.send({ type: "launch", requestId: "f1", sourceId: "mira", featureId: "barbaro-ira" });
  assert.deepEqual(h.activations, [["mira", "barbaro-ira"]]);
  assert.deepEqual(h.runs, [], "never through the quick actions");
  assert.deepEqual(h.results(), [{ requestId: "f1", type: "launch-result", ok: true, mode: "activated" }]);
  // Active on a target (single-target), it can be activated again.
  await h.send({ type: "launch", requestId: "f2", sourceId: "mira", featureId: "paladino-imposizione-delle-mani" });
  assert.equal(h.activations.length, 2);
});

test("a feature already active on its owner, or not in the context menu, is refused", async () => {
  const active = harness({ rageActive: true });
  await active.send({ type: "launch", requestId: "f3", sourceId: "mira", featureId: "barbaro-ira" });
  assert.deepEqual(active.activations, []);
  assert.deepEqual(active.results().at(-1), { requestId: "f3", type: "launch-result", ok: false, message: "Ira: già attiva." });
  const h = harness();
  await h.send({ type: "launch", requestId: "f4", sourceId: "mira", featureId: "paladino-attacco-extra" });
  assert.deepEqual(h.activations, []);
  assert.equal(h.results().at(-1).message, "Capacità non più disponibile.");
});

test("a player's tracker, a request without id or another message type stays silent", async () => {
  const player = harness({ isGm: false });
  await player.send({ type: "launch", requestId: "r6", sourceId: "mira", actionId: "book:bless" });
  assert.deepEqual([player.runs, player.sent], [[], []]);
  const gm = harness();
  await gm.send({ type: "launch", sourceId: "mira", actionId: "book:bless" });
  await gm.send({ type: "launch-result", requestId: "r7" });
  assert.deepEqual([gm.runs, gm.sent], [[], []]);
});

test("a scene change or a failed cast answers with the reason", async () => {
  const stale = harness({ current: false });
  await stale.send({ type: "launch", requestId: "r8", sourceId: "mira", featureId: "barbaro-ira" });
  assert.deepEqual([stale.runs, stale.activations], [[], []]);
  assert.deepEqual(stale.results().at(-1), { requestId: "r8", type: "launch-result", ok: false, message: "Scena cambiata." });
  const failing = harness({ activate: async () => { throw new Error("Nessuna Ira rimasta."); } });
  await failing.send({ type: "launch", requestId: "r9", sourceId: "mira", featureId: "barbaro-ira" });
  assert.deepEqual(failing.results().at(-1), { requestId: "r9", type: "launch-result", ok: false, message: "Nessuna Ira rimasta." });
});
