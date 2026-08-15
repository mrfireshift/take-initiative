import assert from "node:assert/strict";
import test from "node:test";
import { createActionLauncherReadinessCoordinator } from "../src/actionLauncherReadinessCore.js";

test("un click action arrivato prima della scena viene eseguito quando la readiness diventa true", async () => {
  let ready = false;
  const toggles = [];
  const coordinator = createActionLauncherReadinessCoordinator({
    isReady: () => ready,
    runToggle: async () => { toggles.push("toggle"); return true; },
  });

  await coordinator.onActionOpenChange(true);
  assert.deepEqual(toggles, []);
  assert.equal(coordinator.pendingOpen, true);

  ready = true;
  await coordinator.onSceneState({ ready: true });
  assert.deepEqual(toggles, ["toggle"]);
  assert.equal(coordinator.pendingOpen, false);
});

test("chiusura dell'action prima della readiness annulla il toggle pendente", async () => {
  let ready = false;
  let toggles = 0;
  const coordinator = createActionLauncherReadinessCoordinator({
    isReady: () => ready,
    runToggle: async () => { toggles += 1; return true; },
  });

  await coordinator.onActionOpenChange(true);
  await coordinator.onActionOpenChange(false);
  ready = true;
  await coordinator.onSceneState({ ready: true });
  assert.equal(toggles, 0);
  assert.equal(coordinator.pendingOpen, false);
});

test("l'apertura iniziale già pronta esegue il toggle una sola volta", async () => {
  const toggles = [];
  const coordinator = createActionLauncherReadinessCoordinator({
    isReady: () => true,
    runToggle: async () => { toggles.push("toggle"); return true; },
  });

  await coordinator.setInitialOpen(true);
  await coordinator.onSceneState({ ready: true });
  assert.deepEqual(toggles, ["toggle"]);
});

test("dispose elimina il pending e blocca aperture successive", async () => {
  const toggles = [];
  const coordinator = createActionLauncherReadinessCoordinator({
    isReady: () => true,
    runToggle: async () => { toggles.push("toggle"); return true; },
  });

  coordinator.dispose();
  await coordinator.onActionOpenChange(true);
  assert.deepEqual(toggles, []);
  assert.equal(coordinator.pendingOpen, false);
});
