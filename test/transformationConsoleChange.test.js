// Trasformazioni, decision G28 (docs/PIANO_TRASFORMAZIONI.md): «Cambia forma» nella scheda Capacità della console, mentre
// dura Trasformazione o Forme Animali: il campo «Forma nuova» con i limiti dell'incantesimo e le forme rapide di chi lo
// lancia, e un solo comando (transformationChangeRuntime.js, qui finto).
import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { FakeNode, textOf } from "../test-support/fakeBossActionsDom.js";

const META = "com.thebigpicture.initiative/meta";
const sdk = { onReady() {}, broadcast: { onMessage: () => () => {}, sendMessage: async () => {} }, scene: { items: { getItems: async () => [] } }, popover: { close: async () => {} } };
mock.module("@owlbear-rodeo/sdk", { exports: { default: sdk, buildLabel() {}, buildImage() {}, buildPath() {}, buildShape() {}, buildText() {}, Command: class {} } });
const { bootPcAttack } = await import("../src/pc-attack.js");
const { transformationFormKey } = await import("../src/transformationFormsCore.js");
const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

// The console's DOM, as test/pcAttackPopover.test.js builds it.
const IDS = ["pc-attack-reaction", "pc-attack-turn", "pc-attack-picker-search", "pc-attack-minimize", "pc-attack-picker-dropdown", "pc-attack-picker-dropdown-button", "pc-attack-picker-menu", "pc-attack-use-selected-row", "pc-attack-title", "pc-attack-subtitle", "pc-attack-facts", "pc-attack-close", "pc-attack-form", "pc-attack-target", "pc-attack-target-hint", "pc-attack-target-note",
  "pc-attack-outcomes", "pc-attack-damage", "pc-attack-defenses", "pc-attack-total", "pc-attack-apply", "pc-attack-status", "pc-attack-undo",
  "pc-attack-extras-section", "pc-attack-riders", "pc-attack-extras", "pc-attack-add-extra", "pc-attack-cantrip-row", "pc-attack-cantrip",
  "pc-attack-cantrip-note", "pc-attack-extras-caption", "pc-attack-woven", "pc-attack-activations", "pc-attack-activations-caption",
  "pc-attack-palm", "pc-attack-palm-note", "pc-attack-palm-outcomes", "pc-attack-palm-amount", "pc-attack-palm-apply",
  "pc-attack-mode", "pc-attack-outcome-block", "pc-attack-target-caption", "pc-attack-area", "pc-attack-area-list",
  "pc-attack-area-propose", "pc-attack-area-all-failed", "pc-attack-area-all-passed", "pc-attack-picker", "pc-attack-picker-tabs", "pc-attack-picker-select",
  "pc-attack-auto-open-row", "pc-attack-auto-open", "pc-attack-attack-view", "pc-attack-launch", "pc-attack-caster", "pc-attack-follow", "pc-attack-picker-list",
  "pc-attack-launch-button", "pc-attack-spell-details", "pc-attack-spell-details-body", "pc-attack-use-selected",
  "pc-attack-grapple", "pc-attack-maneuver", "pc-attack-maneuver-target", "pc-attack-maneuver-hint", "pc-attack-maneuver-effects", "pc-attack-maneuver-contest",
  "pc-attack-maneuver-outcomes", "pc-attack-maneuver-note", "pc-attack-multiattack", "pc-attack-monster-note", "pc-attack-auto-open-monsters", "pc-attack-mode-caption", "pc-attack-picker-caption", "pc-attack-target-dropdown", "pc-attack-target-button", "pc-attack-target-menu", "pc-attack-maneuver-button", "pc-attack-maneuver-menu", "pc-attack-spell-controls", "pc-attack-more", "pc-attack-more-menu",
  "pc-attack-turn-action", "pc-attack-help-mode-row", "pc-attack-help-modes", "pc-attack-help-target-row", "pc-attack-help-caption", "pc-attack-help-dropdown",
  "pc-attack-help-button", "pc-attack-help-menu", "pc-attack-hide-row", "pc-attack-hide-stealth",
  "pc-attack-ready-mode-row", "pc-attack-ready-modes", "pc-attack-ready-spell-row", "pc-attack-ready-spell", "pc-attack-ready-slot-row", "pc-attack-ready-slot"];
const BUTTONS = new Set(["pc-attack-target-button", "pc-attack-maneuver-button", "pc-attack-help-button", "pc-attack-more", "pc-attack-close", "pc-attack-apply", "pc-attack-launch-button", "pc-attack-use-selected", "pc-attack-undo", "pc-attack-add-extra", "pc-attack-palm-apply",
  "pc-attack-area-propose", "pc-attack-area-all-failed", "pc-attack-area-all-passed"]);
function createDocument() {
  const doc = {
    listeners: {},
    createElement: (tag) => new FakeNode(doc, tag),
    getElementById: (id) => doc.root.querySelector("#" + id),
    addEventListener(type, callback) { (doc.listeners[type] ||= []).push(callback); },
  };
  doc.root = new FakeNode(doc, "body"); doc.body = doc.root;
  for (const id of IDS) {
    const node = new FakeNode(doc, ["pc-attack-target", "pc-attack-cantrip", "pc-attack-mode", "pc-attack-picker-select", "pc-attack-maneuver-target", "pc-attack-ready-spell", "pc-attack-ready-slot"].includes(id) ? "select" : BUTTONS.has(id) ? "button"
      : ["pc-attack-auto-open", "pc-attack-auto-open-monsters", "pc-attack-picker-search", "pc-attack-hide-stealth"].includes(id) ? "input" : id === "pc-attack-spell-details" ? "details" : "div");
    node.id = id; doc.root.appendChild(node);
  }
  return doc;
}

const OGRE = { name: "Ogre", type: "giant", cr: "2", size: "large", hitPoints: { average: 59 }, armorClass: 11, speeds: { walk: 12 } };
const BEAR = { name: "Brown Bear", type: "beast", cr: "1", size: "large", hitPoints: { average: 34 }, armorClass: 11, speeds: { walk: 12 } };
const sword = { id: "sword", label: "Spada", kind: "attack", range: "melee", attackBonus: 5, components: [{ id: "c1", type: "slashing", formula: "1d8+3" }] };

function fixture({ kind = "shapechange", sourceId = "kriv" } = {}) {
  const documentRef = createDocument();
  const pill = { id: "spell:shape:kriv", condition: kind === "shapechange" ? "Trasformazione" : "Forme Animali", active: true, type: "spell",
    sourceId: kind === "shapechange" ? "kriv" : "mage", sourceName: kind === "shapechange" ? "Kriv" : "Maga", parentEffectId: "cast-1",
    mechanics: { transformation: { kind, keepsMind: true, keepsFeatures: kind === "shapechange", canCast: kind === "shapechange", form: OGRE,
      formHp: 59, stash: { hp: 30, hpMax: 30 } } } };
  const creature = (id, name, extra = {}) => ({ id, name, type: "IMAGE", layer: "CHARACTER", metadata: { [META]: { hp: 30, hpMax: 30, inInitiative: true, ...extra } } });
  const items = [
    creature("kriv", "Kriv", { attitude: "pc", conditions: { version: 2, instances: [pill] },
      initiativeCard: { characterBuild: [{ classId: "mago", level: 17 }], quickActions: [sword], transformationForms: [BEAR] } }),
    creature("mage", "Maga", { attitude: "pc", initiativeCard: { characterBuild: [{ classId: "druido", level: 15 }], transformationForms: [BEAR, OGRE] } }),
  ];
  const api = {
    player: { getRole: async () => "GM", getSelection: async () => [], onChange: () => () => {} },
    scene: { isReady: async () => true, onReadyChange: () => () => {}, onMetadataChange: () => () => {},
      items: { getItems: async (ids) => Array.isArray(ids) ? items.filter((item) => ids.includes(item.id)) : items, onChange: () => () => {} } },
    popover: { close: async () => {} },
  };
  const runtime = {
    getPcAttackPresentation: async () => ({ item: items.find((item) => item.id === sourceId), action: null, actionId: "",
      targets: items.filter((item) => item.id !== sourceId), turnState: null, sceneIdentity: "scene-A", picker: [] }),
    getPcAttackNearby: async () => [],
  };
  const calls = [];
  const formChangeRuntime = { changeTransformationForm: async (request) => { calls.push(request); return { label: `Kriv: Trasformazione · ${request.form.name}` }; } };
  const controller = bootPcAttack(documentRef, { api, runtime, sourceId, actionId: "", schedule: (callback) => setTimeout(callback, 0), formChangeRuntime });
  return { $: (id) => documentRef.getElementById(id), controller, calls };
}

async function openChange(f) {
  await f.controller.ready; await tick();
  await [...f.$("pc-attack-picker-tabs").querySelectorAll("button")].find((button) => button.textContent === "Capacità").click(); await tick();
  const row = f.$("pc-attack-picker-list").querySelectorAll("button").find((button) => textOf(button).includes("Cambia forma"));
  assert.ok(row, "the row of Cambia forma");
  await row.click(); await tick();
}
// 27/11: «Cambia forma» is the fixed row's button, as every action of the console.
const changeButton = (f) => (f.$("pc-attack-launch-button").textContent === "Cambia forma" && !f.$("pc-attack-launch-button").hidden
  ? f.$("pc-attack-launch-button") : undefined);

test("G28: Trasformazione: «Cambia forma» in Capacità, la forma nuova dalle rapide, un comando con la forma", async () => {
  const f = fixture();
  await openChange(f);
  assert.match(textOf(f.$("pc-attack-launch")), /Con un'azione: una forma nuova, con le stesse regole della prima\./u);
  assert.equal(changeButton(f).disabled, true, "no form chosen yet");
  const select = f.$("pc-attack-launch").querySelectorAll("select")[0];
  select.value = transformationFormKey(BEAR); await select.emit("change"); await tick();
  assert.equal(changeButton(f).disabled, false);
  await changeButton(f).click(); await tick(); await tick();
  assert.deepEqual([f.calls.length, f.calls[0].sourceId, f.calls[0].form.name], [1, "kriv", "Brown Bear"]);
  assert.equal(f.$("pc-attack-status").textContent, "Registrato: Kriv: Trasformazione · Brown Bear.");
});

test("G28: Forme Animali: le forme rapide sono quelle di chi lancia, e il testo dice di chi è l'azione", async () => {
  const f = fixture({ kind: "animal-shapes" });
  await openChange(f);
  assert.match(textOf(f.$("pc-attack-launch")), /Con un'azione di Maga: una forma nuova per questa creatura/u);
  const options = f.$("pc-attack-launch").querySelectorAll("select")[0].children.map((option) => option.textContent);
  assert.ok(options.some((text) => text.includes("Brown Bear")) && options.some((text) => text.includes("Ogre")), options.join(" | "));
});
