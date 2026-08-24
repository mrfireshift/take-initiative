import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../src/customAuraController.js", import.meta.url),
  "utf8",
);
const background = readFileSync(
  new URL("../src/background.js", import.meta.url),
  "utf8",
);

import { planOwnedSceneItemReconcile } from "../src/sceneItemReconcileCore.js";
import { CUSTOM_AURA_META_KEY, normalizeCustomAura } from "../src/customAuraCore.js";
import { planCustomAuraReminder } from "../src/customAuraReminderCore.js";

test("il controller custom aura e autonomo, GM-only e usa il reconciler protetto", () => {
  assert.match(source, /role !== "GM"/);
  assert.match(source, /reconcileOwnedSceneItems/);
  assert.match(source, /currentSceneEpoch/);
  assert.match(source, /isCurrentSceneEpoch/);
  assert.match(source, /metadata\?\.\[CUSTOM_AURA_META_KEY\]/);
  assert.match(background, /mountCustomAuraController/);
});

test("disegna solo attachment dedicati e applica le pill dal coordinatore", () => {
  assert.match(source, /\.attachedTo\(aura\.sourceId\)/);
  assert.match(source, /\.layer\("DRAWING"\)/);
  assert.match(source, /\.locked\(true\)/);
  assert.match(source, /runEffectsMutation\(operations/);
  assert.match(source, /staleCustomAuraEffectRemovals/);
  assert.match(source, /type: "show-zone-trigger-notices"/);
});

test("tratta esplicitamente le self-invalidation da mutation ed emette notice su owned write", () => {
  assert.match(source, /requestCustomAuraReconcile\(\{ reason: "effects-mutation" \}\)/);
  assert.match(source, /auraVisualReconcilePerformedOwnedWrite\(auraVisualReconcile\)/);
});

test("eliminare o disabilitare un'aura pianifica la rimozione della drawing visuale owned sulla mappa", () => {
  const existingDrawing = {
    id: "drawing-1",
    layer: "DRAWING",
    attachedTo: "source-1",
    metadata: {
      [CUSTOM_AURA_META_KEY]: {
        instanceId: "source-1:ward",
        auraId: "ward",
      },
    },
  };

  // Quando l'aura non è più attiva (desired è vuoto)
  const plan = planOwnedSceneItemReconcile({
    desired: [],
    existing: [existingDrawing],
    identityOfDesired: (desired) => desired.aura.instanceId,
    identityOfItem: (item) => item?.metadata?.[CUSTOM_AURA_META_KEY]?.instanceId,
  });

  assert.deepEqual(plan.additions, []);
  assert.deepEqual(plan.deleteIds, ["drawing-1"]);
});

test("i warning di turno vengono generati con il payload notice corretto per il canale di notifica", () => {
  const aura = {
    ...normalizeCustomAura({
      id: "ward",
      name: "Aura Difensiva",
      warnings: {
        start: { enabled: true, label: "Allerta inizio turno!" },
      },
    }),
    sourceId: "paladin",
    sourceName: "Paladino",
    instanceId: "paladin:ward",
  };

  const initial = planCustomAuraReminder({
    aura,
    desiredTargetIds: ["rogue"],
    initiativeState: { order: ["paladin", "rogue"], current: 0, round: 1 },
    itemsById: new Map([
      ["paladin", { id: "paladin", name: "Paladino" }],
      ["rogue", { id: "rogue", name: "Ladro" }],
    ]),
    areaPosition: { x: 0, y: 0 },
    now: 100,
  });

  const update = planCustomAuraReminder({
    aura,
    auraItem: { id: "drawing-1", metadata: { [CUSTOM_AURA_META_KEY]: { triggerRuntime: initial.runtime } } },
    desiredTargetIds: ["rogue"],
    initiativeState: { order: ["paladin", "rogue"], current: 1, round: 1 },
    itemsById: new Map([
      ["paladin", { id: "paladin", name: "Paladino" }],
      ["rogue", { id: "rogue", name: "Ladro" }],
    ]),
    areaPosition: { x: 0, y: 0 },
    now: 200,
  });

  assert.equal(update.notices.length, 1);
  assert.equal(update.notices[0].spellName, "Aura Difensiva");
  assert.equal(update.notices[0].instruction, "Allerta inizio turno!");
  assert.equal(update.notices[0].targets[0].id, "rogue");
  assert.deepEqual(update.newActivations[0].targetIds, ["rogue"]);
});



