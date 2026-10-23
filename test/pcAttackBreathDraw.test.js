// A dragonborn's breath weapon drawn on the map from the PC attack console: the shared area tool's cone or line,
// leaving the attacker's token, coloured by the damage type; the creatures inside are ticked, never the attacker.
import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { FakeNode, textOf } from "../test-support/fakeBossActionsDom.js";

const META = "com.thebigpicture.initiative/meta";
const sdk = { onReady() {}, broadcast: { onMessage: () => () => {}, sendMessage: async () => {} }, scene: { items: { getItems: async () => [] } }, popover: { close: async () => {} } };
mock.module("@owlbear-rodeo/sdk", { exports: { default: sdk, buildLabel() {}, buildImage() {}, buildPath() {}, buildShape() {}, buildText() {}, Command: class {} } });
const { bootPcAttack } = await import("../src/pc-attack.js");
const { pcAttackBreathAction } = await import("../src/pcAttackCore.js");
const { pcAttackBreathActionId, pcBreathAreaRuleId } = await import("../src/pcAttackBreathId.js");
const { getSpellAreaRuleById } = await import("../src/spellAreaRules.js");
const { spellAreaTheme } = await import("../src/spellAreaStyleCore.js");
const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

const IDS = ["pc-attack-title", "pc-attack-subtitle", "pc-attack-close", "pc-attack-form", "pc-attack-target", "pc-attack-target-hint",
  "pc-attack-outcomes", "pc-attack-damage", "pc-attack-defenses", "pc-attack-total", "pc-attack-apply", "pc-attack-status", "pc-attack-undo",
  "pc-attack-extras-section", "pc-attack-riders", "pc-attack-extras", "pc-attack-add-extra", "pc-attack-cantrip-row", "pc-attack-cantrip",
  "pc-attack-cantrip-note", "pc-attack-extras-caption", "pc-attack-woven", "pc-attack-activations", "pc-attack-activations-caption",
  "pc-attack-palm", "pc-attack-palm-note", "pc-attack-palm-outcomes", "pc-attack-palm-amount", "pc-attack-palm-apply",
  "pc-attack-mode", "pc-attack-outcome-block", "pc-attack-target-caption", "pc-attack-area", "pc-attack-area-note", "pc-attack-area-list",
  "pc-attack-area-propose", "pc-attack-area-draw", "pc-attack-area-all-failed", "pc-attack-area-all-passed", "pc-attack-picker", "pc-attack-picker-tabs",
  "pc-attack-picker-select", "pc-attack-picker-list", "pc-attack-auto-open-row", "pc-attack-auto-open", "pc-attack-attack-view", "pc-attack-launch",
  "pc-attack-caster", "pc-attack-follow"];
const BUTTONS = new Set(["pc-attack-close", "pc-attack-apply", "pc-attack-undo", "pc-attack-add-extra", "pc-attack-palm-apply",
  "pc-attack-area-propose", "pc-attack-area-draw", "pc-attack-area-all-failed", "pc-attack-area-all-passed"]);
function createDocument() {
  const doc = { listeners: {}, createElement: (tag) => new FakeNode(doc, tag), getElementById: (id) => doc.root.querySelector("#" + id),
    addEventListener(type, callback) { (doc.listeners[type] ||= []).push(callback); } };
  doc.root = new FakeNode(doc, "body"); doc.body = doc.root;
  for (const id of IDS) {
    const node = new FakeNode(doc, ["pc-attack-target", "pc-attack-cantrip", "pc-attack-mode", "pc-attack-picker-select"].includes(id) ? "select"
      : BUTTONS.has(id) ? "button" : id === "pc-attack-auto-open" ? "input" : "div");
    node.id = id; doc.root.appendChild(node);
  }
  return doc;
}

const RED = "specie-dragonide-arma-a-soffio-rosso";
const card = { characterBuild: [{ classId: "paladino", level: 6 }], abilityModifiers: { str: 3, dex: 0, con: 2, int: 0, wis: 1, cha: 2 },
  species: { id: "dragonide", ancestryId: "rosso" }, quickActions: [] };

function fixture({ placement }) {
  const documentRef = createDocument();
  const creature = (id, name, hp, extra = {}) => ({ id, name, type: "IMAGE", layer: "CHARACTER", metadata: { [META]: { hp, hpMax: hp, inInitiative: true, ...extra } } });
  const items = [creature("kriv", "Kriv", 40, { initiativeCard: card }), creature("ghoul", "Ghoul", 30), creature("imp", "Imp", 10)];
  const heights = [], requests = [];
  const api = {
    player: { getRole: async () => "GM", getSelection: async () => [], onChange: () => () => {} },
    scene: { isReady: async () => true, onReadyChange: () => () => {}, items: { getItems: async () => items, onChange: () => () => {} } },
    popover: { close: async () => {}, getHeight: async () => 560, setHeight: async (id, height) => { heights.push(height); } },
  };
  const action = pcAttackBreathAction(card, pcAttackBreathActionId(RED));
  const runtime = {
    getPcAttackPresentation: async () => ({ item: items[0], action, targets: items.slice(1), turnState: null, sceneIdentity: "scene-A" }),
    getPcAttackNearby: async () => [],
  };
  const controller = bootPcAttack(documentRef, { api, runtime, sourceId: "kriv", actionId: action.id, schedule: (callback) => setTimeout(callback, 0),
    placeArea: async (request) => { requests.push(request); return placement(request); }, cancelArea: async () => {} });
  return { $: (id) => documentRef.getElementById(id), controller, heights, requests };
}

test("the breath's rules: a cone or a line from the attacker, coloured by the damage type", () => {
  assert.equal(pcBreathAreaRuleId("cone", "fire"), "pc-breath-area:cone:fire");
  assert.equal(pcBreathAreaRuleId("circle", "fire"), "", "only cones and lines");
  const cone = getSpellAreaRuleById("pc-breath-area:cone:fire");
  assert.deepEqual([cone.geometry.shape, cone.geometry.size.value, cone.placement.origin, cone.placement.anchor, cone.targeting.includeCaster],
    ["cone", 4.5, "caster-adjacent", "caster", false]);
  const line = getSpellAreaRuleById("pc-breath-area:line:lightning");
  assert.deepEqual([line.geometry.shape, line.geometry.size.value, line.geometry.width.value], ["line", 9, 1.5]);
  assert.equal(line.lifecycle.persistence, "preview", "the shape is gone once confirmed");
  assert.deepEqual(["acid", "cold", "fire", "lightning", "poison"].map((type) => spellAreaTheme(getSpellAreaRuleById(`pc-breath-area:cone:${type}`).spellId)),
    ["acid", "cold", "fire", "storm", "poison"]);
  assert.equal(getSpellAreaRuleById("pc-breath-area:circle:fire"), null);
});

test("Disegna: the console folds while the GM draws, then ticks the creatures inside (never the attacker)", async () => {
  const f = fixture({ placement: (request) => ({ status: "confirmed", requestId: request.requestId, preview: { targetIds: ["kriv", "ghoul", "barrel"] } }) });
  await f.controller.ready; await tick();
  const draw = f.$("pc-attack-area-draw");
  assert.equal(draw.hidden, false, "the breath shows the draw button");
  assert.match(textOf(f.$("pc-attack-area-note")), /Cono di 4,5 m: disegnalo sulla mappa/);
  await draw.click(); await tick();
  assert.equal(f.requests.length, 1);
  assert.deepEqual([f.requests[0].ruleId, f.requests[0].casterId], ["pc-breath-area:cone:fire", "kriv"]);
  assert.equal(f.heights.length, 2, "folded, then restored");
  assert.ok(f.heights[0] < 100 && f.heights[1] === 560);
  const members = f.controller.getDraft().area.members;
  assert.deepEqual(["ghoul", "imp"].map((id) => !!members[id]?.on), [true, false]);
  assert.match(textOf(f.$("pc-attack-status")), /Nel cono: 1 creatura \(1 senza PF tracciati, escluse\)\. Segna i tiri salvezza\./);
});

test("a cancelled drawing leaves the ticks as they were", async () => {
  const f = fixture({ placement: (request) => ({ status: "cancelled", requestId: request.requestId }) });
  await f.controller.ready; await tick();
  await f.$("pc-attack-area-draw").click(); await tick();
  assert.deepEqual(Object.values(f.controller.getDraft().area.members).filter((member) => member.on), []);
  assert.equal(textOf(f.$("pc-attack-status")), "Disegno annullato.");
  assert.equal(f.$("pc-attack-area-draw").disabled, false);
});
