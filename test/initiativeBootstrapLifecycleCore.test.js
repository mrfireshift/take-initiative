import assert from "node:assert/strict";
import test from "node:test";
import { createInitiativeReadinessHandshake } from "../src/initiativeBootstrapLifecycleCore.js";

function controlledScene({ initial = false, initialRead = null } = {}) {
  let sceneReady = initial;
  let resolveInitial;
  const readiness = initialRead || new Promise((resolve) => { resolveInitial = resolve; });
  const listeners = new Set();
  const calls = { metadata: 0, items: 0, subscriptions: 0, unsubscriptions: 0 };
  return {
    calls,
    readInitialReadiness: () => readiness,
    subscribeReadiness(listener) {
      calls.subscriptions += 1;
      listeners.add(listener);
      return () => {
        calls.unsubscriptions += 1;
        listeners.delete(listener);
      };
    },
    releaseInitial(value) {
      sceneReady = value === true;
      resolveInitial?.(value);
    },
    emit(value) {
      sceneReady = value === true;
      for (const listener of [...listeners]) listener(sceneReady);
    },
    async getMetadata() {
      calls.metadata += 1;
      if (!sceneReady) throw new Error("scene-not-ready");
      return { state: { order: ["token-1"] } };
    },
    async getItems() {
      calls.items += 1;
      if (!sceneReady) throw new Error("scene-not-ready");
      return [{ id: "token-1", name: "Goblin" }];
    },
  };
}

async function runTrackerBootstrap(scene, role = "GM") {
  const stateEvents = [];
  let roleReady = false;
  let rendered = 0;
  const gate = createInitiativeReadinessHandshake({
    subscribeReadiness: scene.subscribeReadiness,
    readInitialReadiness: scene.readInitialReadiness,
    onState: (state) => stateEvents.push(state),
  });
  gate.mount();
  roleReady = role === "GM" || role === "PLAYER";
  await gate.waitUntilReady();
  const operation = gate.getSnapshot();
  await scene.getMetadata();
  await scene.getItems();
  if (gate.isCurrent(operation)) rendered += 1;
  return { gate, stateEvents, roleReady, rendered };
}

test("regressione: readiness false ritardata non deve avviare letture scene prima del gate", async () => {
  const scene = controlledScene({ initial: false });
  const run = runTrackerBootstrap(scene);
  await Promise.resolve();
  assert.equal(scene.calls.metadata, 0);
  assert.equal(scene.calls.items, 0);
  scene.releaseInitial(false);
  scene.emit(true);
  const result = await run;
  assert.equal(result.rendered, 1);
  assert.equal(result.roleReady, true);
});

test("ready iniziale esegue bootstrap una volta per GM e Player", async () => {
  for (const role of ["GM", "PLAYER"]) {
    const scene = controlledScene({ initial: true, initialRead: Promise.resolve(true) });
    const result = await runTrackerBootstrap(scene, role);
    assert.equal(result.roleReady, true);
    assert.equal(result.rendered, 1);
    assert.equal(scene.calls.subscriptions, 1);
    assert.equal(scene.calls.metadata, 1);
    assert.equal(scene.calls.items, 1);
  }
});

test("un evento SDK durante isReady pending prevale sulla lettura iniziale più vecchia", async () => {
  const scene = controlledScene({ initial: false });
  const gate = createInitiativeReadinessHandshake({
    subscribeReadiness: scene.subscribeReadiness,
    readInitialReadiness: scene.readInitialReadiness,
  });
  const waiting = gate.waitUntilReady();
  scene.releaseInitial(false);
  scene.emit(true);
  const state = await waiting;
  assert.equal(state.ready, true);
  assert.equal(gate.getSnapshot().reason, "scene-ready");
});

test("false durante il render invalida l'operazione e true riacquisisce una baseline", async () => {
  const scene = controlledScene({ initial: true, initialRead: Promise.resolve(true) });
  const gate = createInitiativeReadinessHandshake({
    subscribeReadiness: scene.subscribeReadiness,
    readInitialReadiness: scene.readInitialReadiness,
  });
  await gate.waitUntilReady();
  const operation = gate.getSnapshot();
  let releaseRender;
  const renderGate = new Promise((resolve) => { releaseRender = resolve; });
  const render = renderGate.then(() => gate.isCurrent(operation));
  scene.emit(false);
  releaseRender();
  assert.equal(await render, false);
  const recovered = gate.waitUntilReady();
  scene.emit(true);
  assert.equal((await recovered).ready, true);
  assert.notEqual(gate.getSnapshot().generation, operation.generation);
});

test("la sequenza false/true ripetuta non duplica listener né render per epoch", async () => {
  const scene = controlledScene({ initial: true, initialRead: Promise.resolve(true) });
  const states = [];
  const gate = createInitiativeReadinessHandshake({
    subscribeReadiness: scene.subscribeReadiness,
    readInitialReadiness: scene.readInitialReadiness,
    onState: (state) => states.push(state),
  });
  await Promise.all([gate.mount(), gate.mount(), gate.waitUntilReady()]);
  scene.emit(true);
  scene.emit(false);
  scene.emit(false);
  scene.emit(true);
  scene.emit(true);
  scene.emit(false);
  scene.emit(true);
  assert.equal(scene.calls.subscriptions, 1);
  assert.deepEqual(states.map((state) => state.phase), [
    "ready", "unavailable", "ready", "unavailable", "ready",
  ]);
  gate.dispose();
  assert.equal(scene.calls.unsubscriptions, 1);
  scene.emit(false);
  assert.equal(states.length, 5);
});

test("isReady che rigetta non lascia il bootstrap morto: un true successivo sblocca la lista", async () => {
  const scene = controlledScene({ initial: false, initialRead: Promise.reject(new Error("temporary-read")) });
  const gate = createInitiativeReadinessHandshake({
    subscribeReadiness: scene.subscribeReadiness,
    readInitialReadiness: scene.readInitialReadiness,
  });
  const waiting = gate.waitUntilReady();
  await Promise.resolve();
  scene.emit(true);
  assert.equal((await waiting).ready, true);
});

test("close/reopen rimuove la subscription precedente", async () => {
  const scene = controlledScene({ initial: true, initialRead: Promise.resolve(true) });
  const first = createInitiativeReadinessHandshake({
    subscribeReadiness: scene.subscribeReadiness,
    readInitialReadiness: scene.readInitialReadiness,
  });
  await first.waitUntilReady();
  first.dispose();
  const second = createInitiativeReadinessHandshake({
    subscribeReadiness: scene.subscribeReadiness,
    readInitialReadiness: scene.readInitialReadiness,
  });
  await second.waitUntilReady();
  second.dispose();
  assert.equal(scene.calls.subscriptions, 2);
  assert.equal(scene.calls.unsubscriptions, 2);
});
