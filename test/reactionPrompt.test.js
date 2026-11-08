// Reaction prompts, lot R1 of docs/STUDIO_AVVISI_REAZIONE.md: the prompt above Registra (who, with what, why; Usa,
// Ignora, Non chiedere più), the soft stop of decision D2 and the GM's local options.
import test, { mock } from "node:test";
import assert from "node:assert/strict";

mock.module("@owlbear-rodeo/sdk", {
  exports: {
    default: { onReady() {}, scene: { items: { getItems: async () => [] } } },
    buildPath: () => ({}), buildLabel: () => ({}), buildImage: () => ({}), buildText: () => ({}), buildShape: () => ({}),
    Command: { MOVE: 0, LINE: 1, CUBIC: 2, CLOSE: 3 },
  },
});

const { FakeNode, textOf } = await import("../test-support/fakeBossActionsDom.js");
const { createReactionPrompt, reactionPromptCandidates, reactionPromptEffectText } = await import("../src/reactionPromptView.js");
const { createReactionPromptOption } = await import("../src/reactionPromptOption.js");
const { createLocalOptionsStore } = await import("../src/options/localOptionsStore.js");
const { LOCAL_OPTIONS_KEY } = await import("../src/options/optionsDefaults.js");

const META = "com.thebigpicture.initiative/meta";
const creature = (id, meta = {}, name = id) => ({ id, name, metadata: { [META]: { hp: 30, hpMax: 30, attitude: "pc", ...meta } } });
const orc = creature("orc", { attitude: "enemy" }, "Orco");
const mage = creature("mage", { initiativeCard: { armorClass: 15, spellbook: { spellIds: ["shield", "xanathar-assorbire-elementi", "hellish-rebuke"] } } }, "Mira");
const rogue = creature("rogue", { initiativeCard: { characterBuild: [{ classId: "ladro", level: 5 }], classFeaturesConfigured: true,
  enabledClassFeatureIds: ["ladro-schivata-prodigiosa"] } }, "Vex");
const items = [orc, mage, rogue];
const state = { round: 1, current: 0, order: ["orc", "mage", "rogue"] };
const base = { attackerId: "orc", range: "melee", attackRoll: true, damageTypes: ["fire"] };
const hitEvents = (targetId) => [{ ...base, trigger: "hit", targetIds: [targetId] }, { ...base, trigger: "damage", targetIds: [targetId] }];

function createDocument() {
  const doc = { createElement: (tag) => new FakeNode(doc, tag) };
  return doc;
}
const fakeOption = (initial = undefined) => {
  const calls = [];
  return { calls, read: () => initial, subscribe: async (listener) => { listener(initial); return () => {}; },
    mute: async (...args) => { calls.push(args); }, stop() {} };
};
const buttons = (box, attribute) => box.querySelectorAll("BUTTON").filter((node) => node.dataset[attribute] !== undefined);

test("the candidates of a phase: before (Shield, Absorb Elements), after (Hellish Rebuke), only the lots wired", () => {
  const before = reactionPromptCandidates({ event: hitEvents("mage"), items, state }, "before");
  assert.deepEqual(before.map((candidate) => candidate.reactionId), ["shield", "absorb-elements"]);
  assert.equal(before[1].variant, "fuoco");
  const after = reactionPromptCandidates({ event: hitEvents("mage"), items, state }, "after");
  assert.deepEqual(after.map((candidate) => candidate.reactionId), ["hellish-rebuke"]);
  assert.deepEqual(reactionPromptCandidates({ event: hitEvents("rogue"), items, state }, "before"), [], "Uncanny Dodge waits for R3b");
  assert.deepEqual(reactionPromptCandidates({ event: null, items, state }, "before"), []);
});

test("Shield says which rolls it turns into a miss, from the sheet's AC", () => {
  const [shield] = reactionPromptCandidates({ event: hitEvents("mage"), items, state }, "before");
  assert.equal(reactionPromptEffectText(shield, items), "+5 CA · CA 15 → 20: un tiro da 15 a 19 diventa Mancato");
  assert.match(reactionPromptEffectText(shield, [orc]), /segna Mancato/u, "no AC on the sheet");
  const [, absorb] = reactionPromptCandidates({ event: hitEvents("mage"), items, state }, "before");
  assert.equal(reactionPromptEffectText(absorb, items), "Resistenza ai danni da fuoco, anche ora");
});

test("the prompt: shown at the outcome, Ignora closes it, the same event does not come back, a new draft does", async () => {
  const box = new FakeNode(createDocument(), "div");
  const prompt = createReactionPrompt(box, { documentRef: box.ownerDocument, option: fakeOption(), onUse: async () => {} });
  prompt.update({ event: hitEvents("mage"), items, state, draftKey: "d1" });
  assert.equal(box.hidden, false);
  assert.match(textOf(box), /Colpo di Orco su Mira, in mischia/u);
  assert.match(textOf(box), /Mira · Scudo/u);
  assert.match(textOf(box), /Registra senza usarla vale come Ignora/u);
  assert.equal(buttons(box, "reactionPromptUse").length, 2);
  await buttons(box, "reactionPromptIgnore")[0].click();
  assert.equal(box.hidden, true);
  prompt.update({ event: hitEvents("mage"), items, state, draftKey: "d1" });
  assert.equal(box.hidden, true, "answered");
  prompt.update({ event: hitEvents("mage"), items, state, draftKey: "d2" });
  assert.equal(box.hidden, false, "the next attack");
  prompt.update({ event: null, items, state, draftKey: "d2" });
  assert.equal(box.hidden, true, "no outcome");
});

test("Usa runs the console's flow and closes; Registra counts as Ignora; the notice after the damage", async () => {
  const used = [];
  const box = new FakeNode(createDocument(), "div");
  const prompt = createReactionPrompt(box, { documentRef: box.ownerDocument, option: fakeOption(), onUse: async (candidate, phase) => { used.push([candidate.reactionId, phase, candidate.reactorId]); } });
  prompt.update({ event: hitEvents("mage"), items, state, draftKey: "d1" });
  await buttons(box, "reactionPromptUse")[0].click();
  assert.deepEqual(used, [["shield", "before", "mage"]]);
  assert.equal(box.hidden, true);

  prompt.update({ event: hitEvents("mage"), items, state, draftKey: "d2" });
  const context = { event: hitEvents("mage"), items, state, draftKey: "d2" };
  prompt.dismiss();
  assert.equal(box.hidden, true, "Registra");
  prompt.update({ event: null, items, state, draftKey: "d3" });
  prompt.showAfter(context);
  assert.equal(box.hidden, false);
  assert.match(textOf(box), /Intimorire infernale/u);
  assert.doesNotMatch(textOf(box), /Registra senza usarla/u);
  prompt.update({ event: null, items, state, draftKey: "d3" });
  assert.equal(box.hidden, false, "still there while the next attack has no outcome");
  prompt.update({ event: hitEvents("rogue"), items, state, draftKey: "d3" });
  assert.equal(box.hidden, true, "the GM moved on");
});

test("Non chiedere più: the row goes, the option is written with the creature's name", async () => {
  const option = fakeOption();
  const box = new FakeNode(createDocument(), "div");
  const prompt = createReactionPrompt(box, { documentRef: box.ownerDocument, option, onUse: async () => {} });
  prompt.update({ event: hitEvents("mage"), items, state, draftKey: "d1" });
  await buttons(box, "reactionPromptMute")[0].click();
  assert.deepEqual(prompt.current().map((candidate) => candidate.reactionId), ["absorb-elements"]);
  assert.equal(option.calls.length, 1);
  assert.equal(option.calls[0][1], "shield");
  assert.equal(option.calls[0][3], "Mira");
  assert.deepEqual(createReactionPrompt(null), createReactionPrompt(undefined), "no box: nothing");
});

test("the local options: under «reactions», the rest of the document kept", async () => {
  const data = new Map();
  const storage = { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), removeItem: (key) => data.delete(key) };
  const store = createLocalOptionsStore({ storage, eventTarget: null });
  await store.write({ windows: { pcAttackAutoOpen: true } });
  const option = createReactionPromptOption(store);
  let seen = null;
  await option.subscribe((value) => { seen = value; });
  assert.equal(seen.enabled, true);
  await option.mute("n1abc", "shield", true, "Mira");
  assert.deepEqual(option.read().muted, [{ actor: "n1abc", reaction: "shield", name: "Mira" }]);
  await option.set({ ...option.read(), triggers: { hit: false } });
  const stored = JSON.parse(data.get(LOCAL_OPTIONS_KEY));
  assert.equal(stored.windows.pcAttackAutoOpen, true, "the console's own switch kept");
  assert.equal(stored.reactions.triggers.hit, false);
  assert.equal(stored.reactions.muted.length, 1);
  await option.mute("n1abc", "shield", false);
  assert.deepEqual(option.read().muted, [], "↺");
  assert.equal(seen.muted.length, 0, "the subscribers follow");
});
