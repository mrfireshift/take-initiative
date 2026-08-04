import test from "node:test";
import assert from "node:assert/strict";
import { ID } from "../src/constants.js";
import { CUSTOM_AURA_META_KEY, normalizeCustomAura } from "../src/customAuraCore.js";
import { planCustomAuraReminder } from "../src/customAuraReminderCore.js";

const META_KEY = `${ID}/meta`;

function aura() {
  return {
    ...normalizeCustomAura({
      id: "ward",
      name: "Aura del Custode",
      warnings: {
        start: { enabled: true, label: "Avviso iniziale." },
        end: { enabled: true, label: "Avviso finale." },
      },
    }),
    sourceId: "source",
    sourceName: "Custode",
    instanceId: "source:ward",
  };
}

const state = (current) => ({
  order: ["source", "target", "other"],
  current,
  round: 1,
});

const itemsById = new Map([
  ["source", { id: "source", name: "Custode", metadata: { [META_KEY]: {} } }],
  ["target", { id: "target", name: "Bersaglio", metadata: { [META_KEY]: {} } }],
  ["other", { id: "other", name: "Altro", metadata: { [META_KEY]: {} } }],
]);

test("inizializza il runtime senza reminder retroattivi", () => {
  const plan = planCustomAuraReminder({
    aura: aura(),
    desiredTargetIds: ["target"],
    initiativeState: state(0),
    itemsById,
    areaPosition: { x: 0, y: 0 },
    now: 100,
  });
  assert.deepEqual(plan.newActivations, []);
  assert.equal(plan.runtime.initialized, true);
});

test("emette warning personalizzati a fine turno precedente e inizio turno corrente", () => {
  const initial = planCustomAuraReminder({
    aura: aura(),
    desiredTargetIds: ["source", "target"],
    initiativeState: state(0),
    itemsById,
    areaPosition: { x: 0, y: 0 },
    now: 100,
  });
  const auraItem = {
    id: "aura-visual",
    metadata: {
      [CUSTOM_AURA_META_KEY]: { triggerRuntime: initial.runtime },
    },
  };
  const plan = planCustomAuraReminder({
    aura: aura(),
    auraItem,
    desiredTargetIds: ["source", "target"],
    initiativeState: state(1),
    itemsById,
    areaPosition: { x: 0, y: 0 },
    now: 200,
  });

  assert.deepEqual(
    plan.newActivations.map(({ event, label, targetIds }) => ({ event, label, targetIds })),
    [
      { event: "turn-start", label: "Avviso iniziale.", targetIds: ["target"] },
      { event: "turn-end", label: "Avviso finale.", targetIds: ["source"] },
    ],
  );
  assert.equal(plan.notices.length, 2);
  assert.equal(plan.notices[0].spellName, "Aura del Custode");
  assert.equal(plan.notices[0].eyebrow, "Aura personalizzata");
  assert.equal(plan.notices[0].instruction, "Avviso iniziale.");
});
