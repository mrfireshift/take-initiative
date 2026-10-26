// Attacchi dei mostri, lotto 5: i PF dallo statblock. Un solo comando "hp:set" dal coordinatore (come l'editor HP del
// tracker), con i valori attesi; mai sui PF di un token che li ha già (salvo «Sostituisci»), mai su un personaggio, mai
// su una riserva di PF condivisi; poi barre e testi HP sulla mappa.
import assert from "node:assert/strict";
import test, { mock } from "node:test";

const META = "com.thebigpicture.initiative/meta";
const creature = (id, name, meta = {}) => ({ id, name, type: "IMAGE", layer: "CHARACTER", metadata: { [META]: { inInitiative: true, ...meta } } });
let sceneItems = [];
const mutations = [], bars = [], texts = [];
mock.module("@owlbear-rodeo/sdk", { exports: { default: { onReady() {}, scene: { items: { getItems: async () => sceneItems } } },
  buildLabel() {}, buildImage() {}, buildText() {}, buildPath() {}, buildShape() {}, Command: class {} } });
mock.module("../src/effectsMutations.js", { exports: {
  getEffectsMutationSceneContext: async ({ sceneIdentity } = {}) => ({ commandId: "cmd-hp", sceneIdentity: sceneIdentity || "scene-A" }),
  requireAppliedEffectsMutation: (mutation) => mutation,
  runEffectsMutation: async (operations, options) => { mutations.push({ operations, options }); return { status: "applied", committed: true, historyEntry: { id: "h1" } }; },
} });
mock.module("../src/hpbar-items.js", { exports: {
  syncHPBarNow: (id, hp, hpMax) => { bars.push([id, hp, hpMax]); },
  syncHPTextBatchNow: async (updates) => { texts.push(updates); },
} });
const { hasCanonicalHitPoints, monsterHitPointsSummary, monsterNameKey, monsterNamesakes, planMonsterHitPointsImport } =
  await import("../src/monsterHitPointsImportCore.js");
const { applyMonsterHitPoints } = await import("../src/monsterHitPointsImport.js");

const scene = () => [
  creature("g1", "Goblin"),
  creature("g2", "(2) Goblin", { hp: 3, hpMax: 7 }),
  creature("g3", "goblin"),
  creature("pc", "Goblin", { attitude: "pc", hp: 20, hpMax: 20 }),
  creature("orc", "Orco"),
  { id: "bar", name: "Goblin", type: "SHAPE", layer: "ATTACHMENT", attachedTo: "g1", metadata: {} },
];

test("i token omonimi: stesso nome senza il numero, solo creature, mai il token stesso", () => {
  assert.equal(monsterNameKey("(3) Goblin "), "goblin");
  assert.deepEqual(monsterNamesakes(scene(), "g1").map((item) => item.id), ["g2", "g3", "pc"]);
  assert.deepEqual(monsterNamesakes(scene(), "orc"), []);
  assert.equal(hasCanonicalHitPoints(creature("x", "X", { hp: 0, hpMax: 7 })), true, "0 PF sono PF");
  assert.equal(hasCanonicalHitPoints(creature("x", "X", { hp: 5 })), false);
});

test("un token senza PF riceve hp = hpMax = la media, con i valori attesi assenti", () => {
  const plan = planMonsterHitPointsImport({ items: scene(), sourceId: "g1", hp: 7 });
  assert.deepEqual(plan.updates, [{ itemId: "g1", hp: 7, hpMax: 7, expectedHP: { present: false }, expectedHPMax: { present: false } }]);
  assert.deepEqual(plan.skipped, []);
});

test("con gli omonimi: chi ha già PF resta com'è, il personaggio mai", () => {
  const plan = planMonsterHitPointsImport({ items: scene(), sourceId: "g1", hp: 7, sameName: true });
  assert.deepEqual(plan.targetIds, ["g1", "g3"]);
  assert.deepEqual(plan.skipped.map((entry) => [entry.id, entry.reason]), [["g2", "has-hp"], ["pc", "pc"]]);
  assert.equal(monsterHitPointsSummary(plan, 7),
    "PF 7 impostati su 2 token. (2) Goblin ha già i suoi PF (spunta «Sostituisci» per riscriverli); Goblin è un personaggio: i PF dei personaggi si impostano dal tracker.");
  const both = planMonsterHitPointsImport({ items: [creature("a", "Goblin", { hp: 7, hpMax: 7 }), creature("b", "Goblin", { hp: 2, hpMax: 7 })],
    sourceId: "a", hp: 9, sameName: true });
  assert.equal(monsterHitPointsSummary(both, 9), "PF non impostati. 2 token hanno già i loro PF (spunta «Sostituisci» per riscriverli).");
});

test("«Sostituisci» riscrive i PF attuali, con i valori attesi presenti", () => {
  const plan = planMonsterHitPointsImport({ items: scene(), sourceId: "g2", hp: 9, overwrite: true });
  assert.deepEqual(plan.updates, [{ itemId: "g2", hp: 9, hpMax: 9, expectedHP: { present: true, value: 3 }, expectedHPMax: { present: true, value: 7 } }]);
  const same = planMonsterHitPointsImport({ items: [creature("g", "Goblin", { hp: 7, hpMax: 7 })], sourceId: "g", hp: 7, overwrite: true });
  assert.deepEqual(same.updates, []);
  assert.equal(monsterHitPointsSummary(same, 7), "PF non impostati.", "già quei PF: niente da dire");
});

test("una riserva di PF condivisi non si imposta dallo statblock", () => {
  const items = [creature("swarm-a", "Sciame", { hp: 20, hpMax: 20 }), creature("swarm-b", "Sciame", { sharedHpSourceId: "swarm-a" }), creature("s3", "Sciame")];
  const plan = planMonsterHitPointsImport({ items, sourceId: "swarm-a", hp: 22, overwrite: true, sameName: true });
  assert.deepEqual(plan.targetIds, ["s3"]);
  assert.deepEqual(plan.skipped.map((entry) => [entry.id, entry.reason]), [["swarm-a", "shared"], ["swarm-b", "shared"]]);
  assert.equal(monsterHitPointsSummary(plan, 22), "PF 22 impostati su 1 token. 2 token condividono i PF con altri token: la riserva si imposta dal tracker.");
});

test("valori assurdi o token sparito: errore, niente scritto", () => {
  assert.throws(() => planMonsterHitPointsImport({ items: scene(), sourceId: "g1", hp: 0 }), /Punti ferita non validi/);
  assert.throws(() => planMonsterHitPointsImport({ items: scene(), sourceId: "g1", hp: 7.5 }), /Punti ferita non validi/);
  assert.throws(() => planMonsterHitPointsImport({ items: scene(), sourceId: "gone", hp: 7 }), /non è più nella scena/);
});

test("il passo runtime: un comando hp:set con History, poi barre e testi HP", async () => {
  sceneItems = scene();
  mutations.length = 0; bars.length = 0; texts.length = 0;
  const result = await applyMonsterHitPoints({ sourceId: "g1", hp: 7, sameName: true, sceneIdentity: "scene-A" });
  assert.equal(result.committed, true);
  assert.equal(mutations.length, 1);
  const [{ operations, options }] = mutations;
  assert.deepEqual(operations, [{ type: "hp:set", updates: [
    { itemId: "g1", hp: 7, hpMax: 7, expectedHP: { present: false }, expectedHPMax: { present: false } },
    { itemId: "g3", hp: 7, hpMax: 7, expectedHP: { present: false }, expectedHPMax: { present: false } },
  ] }]);
  assert.equal(options.history, true);
  assert.equal(options.kind, "hp");
  assert.equal(options.label, "Goblin: PF dallo statblock (7) · 2 token");
  assert.deepEqual(options.targetIds, ["g1", "g3"]);
  assert.deepEqual([options.commandId, options.sceneIdentity], ["cmd-hp", "scene-A"]);
  assert.deepEqual(bars, [["g1", 7, 7], ["g3", 7, 7]]);
  assert.deepEqual(texts[0].map((update) => update.tokenId), ["g1", "g3"]);
});

test("niente da scrivere: nessun comando", async () => {
  sceneItems = [creature("g", "Goblin", { hp: 5, hpMax: 7 })];
  mutations.length = 0;
  const result = await applyMonsterHitPoints({ sourceId: "g", hp: 7 });
  assert.equal(result.committed, false);
  assert.equal(mutations.length, 0);
  assert.deepEqual(result.plan.skipped.map((entry) => entry.reason), ["has-hp"]);
});

test("con «Sostituisci» il token della scheda cambia anche se ferito; un omonimo ferito mai", () => {
  const items = [creature("g1", "Goblin", { hp: 2, hpMax: 7 }), creature("g2", "Goblin", { hp: 3, hpMax: 7 }), creature("g3", "Goblin", { hp: 7, hpMax: 7 })];
  const plan = planMonsterHitPointsImport({ items, sourceId: "g1", hp: 9, overwrite: true, sameName: true });
  assert.deepEqual(plan.targetIds, ["g1", "g3"]);
  assert.deepEqual(plan.skipped.map((entry) => [entry.id, entry.reason]), [["g2", "wounded"]]);
  assert.equal(monsterHitPointsSummary(plan, 9), "PF 9 impostati su 2 token. Goblin è ferito: i PF di un mostro ferito non si toccano.");
});
