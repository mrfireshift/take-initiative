// Lot F6-4 of docs/STUDIO_TALENTI.md (decisions K4, K5): Mage Slayer's strike when a hostile creature within 1.5 m casts,
// offered at the spell panel's cast as Counterspell, its Usa the attack console off turn; War Caster's spell instead of
// an opportunity attack, a line of the opportunity attack's prompt. The expectations are read from the PHB 2014 text,
// not from the definitions under test.
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

mock.module("@owlbear-rodeo/sdk", {
  exports: {
    default: { onReady() {}, scene: { items: { getItems: async () => [] } } },
    buildPath: () => ({}), buildLabel: () => ({}), buildImage: () => ({}), buildText: () => ({}), buildShape: () => ({}),
    Command: { MOVE: 0, LINE: 1, CUBIC: 2, CLOSE: 3 },
  },
});

const { reactionPromptCandidates, reactionPromptEffectText } = await import("../src/reactionPromptView.js");
const { reactionTriggerEntry } = await import("../src/reactionTriggerCatalog.js");
const { getClassFeatureDefinition } = await import("../src/classFeatureCatalog.js");
const { FEATS } = await import("../src/featCatalog.js");

const META = "com.thebigpicture.initiative/meta";
// Positions in meters along a line: the distance is their difference.
const creature = (id, name, meta = {}, x = 0) => ({ id, name, type: "IMAGE", layer: "CHARACTER", position: { x, y: 0 },
  metadata: { [META]: { hp: 40, hpMax: 40, inInitiative: true, ...meta } } });
const distance = (a, b) => Math.abs(a.position.x - b.position.x);
const sheet = (feats) => ({ characterBuild: [{ classId: "guerriero", level: 5 }], feats: feats.map((id) => ({ id })) });
const slayer = (x = 1.5, feats = ["sterminatore-di-maghi"]) => creature("slayer", "Ilse", { attitude: "pc", initiativeCard: sheet(feats) }, x);
const mage = (attitude = "enemy") => creature("mage", "Cultista", { attitude }, 0);
const state = { round: 1, current: 0, order: ["mage", "slayer"] };
const cast = { trigger: "spell-cast", casterId: "mage", spellId: "hold-person", spellName: "Blocca persone", spellLevel: 2, spellTargetIds: ["slayer"] };

test("Mage Slayer: a hostile creature within 1.5 m casts, the strike before the cast, with the console off turn", () => {
  const offered = (items, extra = {}) => reactionPromptCandidates({ event: [cast], items, state, distance, ...extra }, "before");
  const [row, ...rest] = offered([mage(), slayer()]);
  assert.deepEqual([row.reactionId, row.flow, row.featureId, row.targetIds, row.why, rest.length],
    ["mage-slayer", "off-turn-attack", "talento-sterminatore-di-maghi", ["mage"], "Cultista lancia Blocca persone (2°).", 0]);
  assert.equal(reactionPromptEffectText(row, [mage(), slayer()]), "Attacco in mischia");
  assert.equal(getClassFeatureDefinition("talento-sterminatore-di-maghi").activation.primary, "reazione");
  assert.deepEqual(offered([mage(), slayer(3)]), [], "beyond 1.5 m");
  assert.deepEqual(reactionPromptCandidates({ event: [cast], items: [mage(), slayer()], state }, "before"), [], "an unknown distance");
  assert.deepEqual(offered([mage("pc"), slayer()]), [], "not a friend");
  assert.deepEqual(offered([mage(), slayer(1.5, [])]), [], "without the feat");
  // A cantrip too: the feat speaks of any spell.
  assert.equal(reactionPromptCandidates({ event: [{ ...cast, spellLevel: 0 }], items: [mage(), slayer()], state, distance }, "before")[0]?.reactionId,
    "mage-slayer");
});

test("the spell panel knows the flow: Usa opens the attack console off turn and the cast waits", () => {
  const panel = readFileSync(new URL("../src/spell-unified-panel.js", import.meta.url), "utf8");
  assert.match(panel, /const castPromptHandles = \(candidate\) => \[[^\]]*"off-turn-attack"[^\]]*\]\.includes\(candidate\?\.flow\)/u);
  assert.match(panel, /if \(candidate\?\.flow === "off-turn-attack"\) \{\s*const \{ openPcAttackConsoleForActor \} = await import\("\.\/pcAttackLauncher\.js"\);/u);
});

test("War Caster: the opportunity attack's line offers the spell instead", () => {
  const mover = creature("orc", "Orco", { attitude: "enemy" }, 0);
  const caster = creature("guard", "Guardia", { attitude: "pc", initiativeCard: sheet(["incantatore-da-guerra", "maestro-delle-armi-su-asta"]) }, 1.5);
  const plain = creature("guard", "Guardia", { attitude: "pc", initiativeCard: sheet(["maestro-delle-armi-su-asta"]) }, 1.5);
  const options = { triggers: { move: true }, actors: { pcs: true, npcs: false } };
  const rows = (reactor) => reactionPromptCandidates({ event: [{ trigger: "move-leave", moverId: "orc", reactorIds: ["guard"] },
    { trigger: "move-enter-reach", moverId: "orc", reactorIds: ["guard"] }], items: [mover, reactor], state: { round: 1, current: 0, order: ["orc", "guard"] },
  options }, "after").map((row) => [row.reactionId, reactionPromptEffectText(row, [mover, reactor])]);
  assert.deepEqual(rows(caster), [
    ["opportunity-attack", "Attacco in mischia, o un incantesimo da 1 azione solo su di lei (Incantatore da Guerra)"],
    ["polearm-master-reach", "Attacco di opportunità, o un incantesimo da 1 azione solo su di lei (Incantatore da Guerra)"],
  ]);
  assert.deepEqual(rows(plain), [["opportunity-attack", "Attacco in mischia"], ["polearm-master-reach", "Attacco di opportunità"]]);
  assert.equal(reactionTriggerEntry("sentinel-strike").opportunityAttack, undefined, "Sentinel's strike for another is no opportunity attack");
  // The movement popover shows the line under an opportunity attack only when it says more than the attack.
  const popover = readFileSync(new URL("../src/reaction-move.js", import.meta.url), "utf8");
  assert.match(popover, /candidate\.reactionId !== "opportunity-attack" \|\| effect !== candidate\.short/u);
});

test("the two feats' lines say where each part is", () => {
  const line = (id) => FEATS.find((entry) => entry.id === id).plugin;
  assert.match(line("sterminatore-di-maghi"), /^Avviso di reazione quando una creatura entro 1,5 m lancia dal pannello incantesimi: Usa apre la console\./u);
  assert.match(line("sterminatore-di-maghi"), /il vantaggio ai TS si tira al tavolo\.$/u);
  assert.match(line("incantatore-da-guerra"), /^Il vantaggio è nell'avviso del TS di concentrazione\. Negli avvisi di attacco di opportunità, la riga dell'incantesimo/u);
});
