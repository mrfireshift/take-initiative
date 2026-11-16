// Trasformazioni (docs/PIANO_TRASFORMAZIONI.md), dopo le prove al banco di W5: finita la forma (Termina, 0 PF) la console
// ferma su un attacco della forma si riapre sull'azione predefinita della creatura, non su «Azione di attacco non trovata».
import assert from "node:assert/strict";
import test, { mock } from "node:test";

const sdk = { onReady() {}, player: { getRole: async () => "GM" }, room: {}, broadcast: { onMessage: () => () => {}, sendMessage: async () => {} },
  scene: { items: { getItems: async () => [] }, getMetadata: async () => ({}) } };
mock.module("@owlbear-rodeo/sdk", { exports: { default: sdk, buildLabel() {}, buildImage() {}, buildPath() {}, buildShape() {}, buildText() {}, Command: class {} } });
const { createPcAttackRuntime } = await import("../src/pcAttackExecution.js");
const { spellGrantedActionsForItem } = await import("../src/spellGrantedActionsCore.js");
const { pcAttackAction } = await import("../src/pcAttackCore.js");

const META = "com.thebigpicture.initiative/meta";
const bite = { id: "form-1", label: "Bite", kind: "attack", range: "melee", attackBonus: 4, components: [{ type: "piercing", formula: "2d4+2" }] };
const wolf = { name: "Wolf", ref: "Wolf|MM", source: "5etools", type: "beast", cr: "1/4", size: "medium", armorClass: 13,
  abilities: { str: 12, dex: 15, con: 12, int: 3, wis: 12, cha: 6 }, speeds: { walk: 12 }, actions: [bite] };
const scimitar = { id: "scimitar", label: "Scimitarra", kind: "attack", range: "melee", attackBonus: 4, components: [{ type: "slashing", formula: "1d6+2" }] };

function druid(active) {
  return { id: "druid", name: "Ilse", type: "IMAGE", layer: "CHARACTER", metadata: { [META]: {
    hp: 30, hpMax: 30, attitude: "pc",
    initiativeCard: { characterBuild: [{ classId: "druido", level: 4 }], quickActions: [scimitar] },
    conditions: { version: 2, instances: [{ id: "class-feature:ws1:druid", condition: "Forma Selvatica", active, effectId: "druido-forma-selvatica",
      parentEffectId: "ws1", mechanics: { transformation: { kind: "wild-shape", keepsMind: true, keepsFeatures: true, canCast: false, form: wolf } } }] },
  } } };
}

function runtimeFor(scene) {
  const api = {
    player: { getRole: async () => "GM" },
    scene: { items: { getItems: async (ids) => scene.items.filter((item) => !ids || ids.includes(item.id)) }, getMetadata: async () => ({}) },
  };
  return createPcAttackRuntime({ api, getSceneContext: async () => ({ sceneIdentity: "scene-A" }), getEpoch: () => 1, isCurrentEpoch: () => true });
}

test("finita la forma, la console sull'attacco della forma torna all'azione predefinita della creatura", async () => {
  const scene = { items: [druid(true)] };
  const runtime = runtimeFor(scene);
  const biteId = pcAttackAction(spellGrantedActionsForItem(scene.items[0])[0]).id;
  const inForm = await runtime.getPcAttackPresentation("druid", biteId);
  assert.equal(inForm.action.label, "Bite");

  scene.items = [druid(false)];
  const after = await runtime.getPcAttackPresentation("druid", biteId);
  assert.equal(after.action.label, "Scimitarra");
  assert.equal(after.actionId, after.action.id);
});

test("un'azione della scheda che non c'è più dà ancora l'errore di prima", async () => {
  const runtime = runtimeFor({ items: [druid(false)] });
  await assert.rejects(runtime.getPcAttackPresentation("druid", "gone"), /Azione di attacco non trovata nel profilo/);
});
