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
  const [dodge] = reactionPromptCandidates({ event: hitEvents("rogue"), items, state }, "before");
  assert.equal(dodge.reactionId, "uncanny-dodge");
  assert.equal(dodge.flow, "modifier", "lot R3b: a line on the draft");
  assert.deepEqual(reactionPromptCandidates({ event: hitEvents("rogue"), items, state, skip: [dodge.key] }, "before"), [], "already on the draft");
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
  prompt.update({ event: [{ ...base, trigger: "miss", targetIds: ["mage"] }], items, state, draftKey: "d3" });
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

// Lot R2: Counterspell when a creature casts from the spell panel.
const { counterspellPopoverUrl } = await import("../src/counterspellLauncher.js");
const { sceneUnitToMeters } = await import("../src/reactionSceneContext.js");

test("a spell cast: Counterspell and Magic-User's Nemesis within 18 m, Spell Thief only on its target (R2, R2b)", () => {
  const shaman = creature("shaman", { attitude: "enemy" }, "Sciamano");
  const counter = creature("wiz", { initiativeCard: { spellbook: { spellIds: ["counterspell"] } } }, "Lia");
  const ranger = creature("ranger", { initiativeCard: { characterBuild: [{ classId: "ranger", level: 11, subclassId: "ranger-uccisore-di-mostri" }],
    classFeaturesConfigured: true, enabledClassFeatureIds: ["ranger-uccisore-di-mostri-nemesi-degli-incantatori"], spellSaveDC: 15 } }, "Kai");
  const thief = creature("thief", { initiativeCard: { characterBuild: [{ classId: "ladro", level: 17, subclassId: "ladro-mistificatore-arcano" }],
    classFeaturesConfigured: true, enabledClassFeatureIds: ["ladro-mistificatore-arcano-ladro-di-incantesimi"], spellSaveDC: 16 } }, "Vex");
  const scene = [shaman, counter, ranger, thief];
  const castState = { round: 1, current: 0, order: ["shaman", "wiz", "ranger", "thief"] };
  const event = { trigger: "spell-cast", casterId: "shaman", spellId: "fireball", spellName: "Palla di fuoco", spellLevel: 3 };
  const list = reactionPromptCandidates({ event, items: scene, state: castState, distance: () => 12 }, "before");
  assert.deepEqual(list.map((candidate) => candidate.reactionId), ["magic-users-nemesis", "counterspell"], "Kai, then Lia; Vex is not a target");
  const counterspell = list.find((candidate) => candidate.reactionId === "counterspell");
  assert.deepEqual(counterspell.targetIds, ["shaman"]);
  assert.match(reactionPromptEffectText(counterspell), /automatico fino al livello dello slot/u);
  assert.equal(reactionPromptEffectText(list[0], scene), "TS Saggezza CD 15: se lo fallisce, l'incantesimo fallisce e lo slot è perso");
  const onThief = reactionPromptCandidates({ event: { ...event, spellTargetIds: ["thief"] }, items: scene, state: castState, distance: () => 12 }, "before");
  const stolen = onThief.find((candidate) => candidate.reactionId === "spell-thief");
  assert.equal(stolen.featureId, "ladro-mistificatore-arcano-ladro-di-incantesimi");
  assert.match(reactionPromptEffectText(stolen, scene), /CD 16: se lo fallisce, non ha effetto sul ladro, che lo ruba/u);
  assert.deepEqual(reactionPromptCandidates({ event: { ...event, spellLevel: 0 }, items: scene, state: castState, distance: () => 12 }, "before")
    .map((candidate) => candidate.reactionId), ["magic-users-nemesis"], "Counterspell not on a cantrip, by default");
});

// Lot R3a: the class features that change the outcome, on the reactor or on an ally within reach.
const { useReactionFeature } = await import("../src/reactionFeatureRuntime.js");
const { reactionDistanceFunction } = await import("../src/reactionSceneContext.js");

test("R3a: a bonus to the AC says which rolls miss; on an ally only within its meters; a critical made a hit", () => {
  const paladin = creature("pal", { initiativeCard: { characterBuild: [{ classId: "paladino", level: 15, subclassId: "paladino-giuramento-di-gloria" }],
    classFeaturesConfigured: true, enabledClassFeatureIds: ["paladino-giuramento-di-gloria-difesa-gloriosa"], abilityModifiers: { cha: 4 } } }, "Ser");
  const ally = creature("ally", { initiativeCard: { armorClass: 14 } }, "Bram");
  const scene = [orc, paladin, ally];
  const glory = { round: 1, current: 0, order: ["orc", "pal", "ally"] };
  const near = reactionPromptCandidates({ event: hitEvents("ally"), items: scene, state: glory, distance: () => 3 }, "before");
  assert.deepEqual(near.map((candidate) => candidate.reactionId), ["glorious-defense"]);
  assert.equal(reactionPromptEffectText(near[0], scene), "+ Car alla CA su Bram · CA 14 → 18: un tiro da 14 a 17 diventa Mancato");
  assert.deepEqual(reactionPromptCandidates({ event: hitEvents("ally"), items: scene, state: glory, distance: () => 6 }, "before"), [], "beyond 3 m");
  assert.deepEqual(reactionPromptCandidates({ event: hitEvents("ally"), items: scene, state: glory }, "before"), [], "no distance yet");

  const cleric = creature("cleric", { initiativeCard: { characterBuild: [{ classId: "chierico", level: 6, subclassId: "chierico-dominio-della-tomba" }],
    classFeaturesConfigured: true, enabledClassFeatureIds: ["chierico-dominio-della-tomba-sentinella-alla-porta-della-morte"] } }, "Ilse");
  const tomb = { round: 1, current: 0, order: ["orc", "cleric", "ally"] };
  const critical = hitEvents("ally").map((event) => ({ ...event, critical: true }));
  const [sentinel] = reactionPromptCandidates({ event: critical, items: [orc, cleric, ally], state: tomb, distance: () => 6 }, "before");
  assert.equal(sentinel.reactionId, "sentinel-at-deaths-door");
  assert.equal(reactionPromptEffectText(sentinel), "Critico → colpo normale su Bram: Usa segna Colpito al posto di Critico");
  assert.deepEqual(reactionPromptCandidates({ event: hitEvents("ally"), items: [orc, cleric, ally], state: tomb, distance: () => 6 }, "before"), [],
    "not on an ordinary hit");
});

test("R2b, R3a: Usa on a class feature spends its resource with the reaction, or the reaction alone", async () => {
  const calls = [];
  const runtime = {
    adjustClassFeatureResource: async (...args) => { calls.push(["adjust", ...args]); },
    useClassFeatureReaction: async (args) => { calls.push(["reaction", args]); },
  };
  assert.equal((await useReactionFeature({ sourceId: "pal", featureId: "paladino-giuramento-di-gloria-difesa-gloriosa", runtime })).ok, true);
  assert.equal((await useReactionFeature({ sourceId: "cleric", featureId: "chierico-dominio-della-tomba-sentinella-alla-porta-della-morte", runtime })).ok, true);
  assert.deepEqual(calls, [
    ["adjust", "pal", "paladino-giuramento-di-gloria-difesa-gloriosa-usi", { delta: -1 }, { featureId: "paladino-giuramento-di-gloria-difesa-gloriosa" }],
    ["reaction", { sourceId: "cleric", featureId: "chierico-dominio-della-tomba-sentinella-alla-porta-della-morte" }],
  ]);
  const failing = { useClassFeatureReaction: async () => { throw new Error("Reazione già usata."); } };
  assert.deepEqual(await useReactionFeature({ sourceId: "c", featureId: "chierico-dominio-della-tomba-sentinella-alla-porta-della-morte", runtime: failing }),
    { ok: false, message: "Reazione già usata." });
  assert.equal((await useReactionFeature({ sourceId: "c", featureId: "nope", runtime })).ok, false);
  assert.equal(typeof reactionDistanceFunction({ dpi: 150, scale: { parsed: { multiplier: 5, unit: "ft" } } }), "function");
});

test("the prompt's hint is the window's: Registra in the consoles, Lancia in the spell panel", () => {
  const box = new FakeNode(createDocument(), "div");
  const prompt = createReactionPrompt(box, { documentRef: box.ownerDocument, option: fakeOption(), onUse: async () => {},
    ignoreHint: "Premi di nuovo il pulsante per lanciare senza reazione." });
  prompt.update({ event: hitEvents("mage"), items, state, draftKey: "d1" });
  assert.match(textOf(box), /Premi di nuovo il pulsante/u);
  assert.doesNotMatch(textOf(box), /Registra senza usarla/u);
});

test("Counterspell's popup filled in from the prompt; the scene's feet in meters", () => {
  const url = new URL(counterspellPopoverUrl({ sourceId: "wiz", targetId: "shaman", spellId: "fireball", spellLevel: 3, requestId: "r1" }), "http://x");
  assert.deepEqual(Object.fromEntries(url.searchParams), { source: "wiz", target: "shaman", spell: "fireball", spellLevel: "3", request: "r1" });
  assert.equal(new URL(counterspellPopoverUrl({ sourceId: "wiz", spellLevel: 0 }), "http://x").searchParams.get("spellLevel"), "0", "a cantrip");
  assert.equal(new URL(counterspellPopoverUrl({ sourceId: "wiz" }), "http://x").search, "?source=wiz", "as before, without a prompt");
  assert.equal(sceneUnitToMeters("ft"), 0.3);
  assert.equal(sceneUnitToMeters("m"), 1);
});

// Lot R3c: the reactions after the damage and after a miss, notices once Registra is applied.
test("R3c: after a miss, Riposte opens an attack off turn against the attacker; after a hit, Wrath of the Storm", () => {
  const fighter = creature("dars", { initiativeCard: { characterBuild: [{ classId: "guerriero", level: 5, subclassId: "guerriero-maestro-di-battaglia" }],
    classFeaturesConfigured: true, enabledClassFeatureIds: ["guerriero-maestro-di-battaglia-manovre-replica"] } }, "Dars");
  const fightState = { round: 1, current: 0, order: ["orc", "dars"] };
  const miss = [{ ...base, trigger: "miss", targetIds: ["dars"] }];
  assert.deepEqual(reactionPromptCandidates({ event: miss, items: [orc, fighter], state: fightState }, "before"), [], "nothing stops Registra");
  const [riposte] = reactionPromptCandidates({ event: miss, items: [orc, fighter], state: fightState }, "after");
  assert.equal(riposte.reactionId, "riposte");
  assert.equal(riposte.flow, "off-turn-attack");
  assert.deepEqual(riposte.targetIds, ["orc"]);
  assert.deepEqual(reactionPromptCandidates({ event: [{ ...miss[0], range: "ranged" }], items: [orc, fighter], state: fightState }, "after"), [],
    "a ranged miss");
  assert.deepEqual(reactionPromptCandidates({ event: miss, items: [orc, fighter], state: fightState, options: { triggers: { miss: false } } }, "after"), [],
    "the miss switch");

  const cleric = creature("ilse", { initiativeCard: { characterBuild: [{ classId: "chierico", level: 1, subclassId: "chierico-dominio-della-tempesta" }],
    classFeaturesConfigured: true, enabledClassFeatureIds: ["chierico-dominio-della-tempesta-collera-della-tempesta"] } }, "Ilse");
  const stormState = { round: 1, current: 0, order: ["orc", "ilse"] };
  const [wrath] = reactionPromptCandidates({ event: hitEvents("ilse"), items: [orc, cleric], state: stormState }, "after");
  assert.equal(wrath.reactionId, "wrath-of-the-storm");
  assert.equal(wrath.flow, "use-feature");
  assert.deepEqual(reactionPromptCandidates({ event: hitEvents("ilse"), items: [orc, cleric], state: stormState, distance: () => 6 }, "after"), [],
    "the attacker beyond 1.5 m");
});
