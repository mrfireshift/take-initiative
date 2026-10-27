import assert from "node:assert/strict";
import test, { mock } from "node:test";

const sdk = { onReady() {}, player: { getRole: async () => "GM" }, room: {}, broadcast: { onMessage: () => () => {}, sendMessage: async () => {} },
  scene: { items: { getItems: async () => [] }, getMetadata: async () => ({}) } };
mock.module("@owlbear-rodeo/sdk", { exports: { default: sdk, buildLabel() {}, buildImage() {}, buildPath() {}, buildShape() {}, buildText() {}, Command: class {} } });
const { createPcAttackRuntime } = await import("../src/pcAttackExecution.js");
const { createBossActionRuntime } = await import("../src/bossActionExecution.js");

const META = "com.thebigpicture.initiative/meta";
const archer = { id: "mira", name: "Mira", type: "IMAGE", layer: "CHARACTER", metadata: { [META]: { hp: 20, hpMax: 20 } } };
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };

// An SDK whose reads answer only when the test says so, and that records when each one started.
function slowApi({ role = "GM", items = [archer] } = {}) {
  const started = [];
  const gates = { role: deferred(), item: deferred(), metadata: deferred(), all: deferred() };
  const api = {
    player: { getRole: () => { started.push("role"); return gates.role.promise.then(() => role); } },
    scene: {
      items: { getItems: (ids) => {
        started.push(ids ? "item" : "all");
        const gate = ids ? gates.item : gates.all;
        return gate.promise.then(() => items.filter((item) => !ids || ids.includes(item.id)));
      } },
      getMetadata: () => { started.push("metadata"); return gates.metadata.promise.then(() => ({})); },
    },
  };
  const scene = deferred();
  const getSceneContext = () => { started.push("scene"); return scene.promise; };
  return { api, started, gates, scene, getSceneContext };
}

test("la console attacchi legge ruolo, scena, token, metadata e item tutti insieme", async () => {
  const fixture = slowApi();
  const runtime = createPcAttackRuntime({ api: fixture.api, getSceneContext: fixture.getSceneContext, getEpoch: () => 1, isCurrentEpoch: () => true });
  const presentation = runtime.getPcAttackPresentation("mira");
  await Promise.resolve();
  // Nothing has answered yet, and every read has already left.
  assert.deepEqual([...fixture.started].sort(), ["all", "item", "metadata", "role", "scene"]);
  fixture.gates.role.resolve(); fixture.scene.resolve({ sceneIdentity: "scene-a" }); fixture.gates.item.resolve();
  fixture.gates.metadata.resolve(); fixture.gates.all.resolve();
  const result = await presentation;
  assert.equal(result.item.id, "mira");
  assert.equal(result.sceneIdentity, "scene-a");
});

test("chi non è GM riceve subito l'errore del ruolo, senza aspettare il contesto di scena", async () => {
  const fixture = slowApi({ role: "PLAYER" });
  const runtime = createPcAttackRuntime({ api: fixture.api, getSceneContext: fixture.getSceneContext, getEpoch: () => 1, isCurrentEpoch: () => true });
  const presentation = runtime.getPcAttackPresentation("mira");
  fixture.gates.role.resolve();
  // The scene context, the token and the metadata never answer: the role's error does not wait for them.
  await assert.rejects(presentation, /Solo il GM può registrare un attacco/);
});

test("l'errore del token mancante vince ancora su un errore dei metadata, nell'ordine di prima", async () => {
  const fixture = slowApi({ items: [] });
  fixture.api.scene.getMetadata = () => Promise.reject(new Error("metadata non letti"));
  const runtime = createPcAttackRuntime({ api: fixture.api, getSceneContext: fixture.getSceneContext, getEpoch: () => 1, isCurrentEpoch: () => true });
  const presentation = runtime.getPcAttackPresentation("mira");
  fixture.gates.role.resolve(); fixture.scene.resolve({ sceneIdentity: "scene-a" }); fixture.gates.item.resolve(); fixture.gates.all.resolve();
  await assert.rejects(presentation, /L'attaccante non è più un token creatura nella scena/);
});

test("Boss Actions: chi non è GM riceve subito l'errore del ruolo, con le altre letture già partite", async () => {
  const fixture = slowApi({ role: "PLAYER" });
  const runtime = createBossActionRuntime({ api: fixture.api, getSceneContext: fixture.getSceneContext, getEpoch: () => 1, isCurrentEpoch: () => true });
  const presentation = runtime.getBossActionPresentation("mira");
  await Promise.resolve();
  assert.ok(["role", "scene", "item", "metadata"].every((read) => fixture.started.includes(read)));
  fixture.gates.role.resolve();
  await assert.rejects(presentation, /Solo il GM può usare Boss Actions/);
});
