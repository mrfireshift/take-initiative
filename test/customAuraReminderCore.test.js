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

test("genera notice per reminder manual-save con TS Des, CD fissa, danno e failureCondition", () => {
  const saveAura = {
    ...normalizeCustomAura({
      id: "storm",
      name: "Aura della Tempesta",
      reminders: [{
        id: "lightning",
        enabled: true,
        event: "turn-start",
        label: "TS Destrezza contro la tempesta",
        resolution: "manual-save",
        ability: "dex",
        dcMode: "fixed",
        dc: 15,
        damage: { dice: "3d6", type: "fulmine", onSave: "half" },
        failureCondition: { condition: "Prono" },
      }],
    }),
    sourceId: "source",
    sourceName: "Custode",
    instanceId: "source:storm",
  };

  const initial = planCustomAuraReminder({
    aura: saveAura,
    desiredTargetIds: ["target"],
    initiativeState: state(0),
    itemsById,
    areaPosition: { x: 0, y: 0 },
    now: 100,
  });

  const auraItem = {
    id: "aura-storm-visual",
    metadata: {
      [CUSTOM_AURA_META_KEY]: { triggerRuntime: initial.runtime },
    },
  };

  const plan = planCustomAuraReminder({
    aura: saveAura,
    auraItem,
    desiredTargetIds: ["target"],
    initiativeState: state(1),
    itemsById,
    areaPosition: { x: 0, y: 0 },
    now: 200,
  });

  assert.equal(plan.newActivations.length, 1);
  assert.equal(plan.newActivations[0].ability, "dex");
  assert.equal(plan.newActivations[0].dc, 15);
  assert.equal(plan.newActivations[0].damage.dice, "3d6");
  assert.equal(plan.newActivations[0].failureCondition.condition, "Prono");

  assert.equal(plan.notices.length, 1);
  const notice = plan.notices[0];
  assert.equal(notice.dc, 15);
  assert.equal(notice.resolution.save.ability, "dex");
  assert.equal(notice.resolution.save.dc, 15);
  assert.equal(notice.resolution.damage.dice, "3d6");
  assert.equal(notice.resolution.damage.onPassed, "half");
  assert.equal(notice.resolution.damage.onFailed, "full");
  assert.equal(notice.resolution.outcomes.failed.actions.length, 1);
  assert.equal(notice.resolution.outcomes.failed.actions[0].name, "Prono");
});




test("genera notice per danno diretto senza TS con resolution manual-damage", () => {
  const directDamageAura = {
    ...normalizeCustomAura({
      id: "radiation",
      name: "Aura Radiante",
      reminders: [{
        id: "burn",
        enabled: true,
        event: "turn-start",
        label: "Bruciatura radiante",
        resolution: "manual-damage",
        damage: { dice: "2d8", type: "radioso" },
      }],
    }),
    sourceId: "source",
    sourceName: "Custode",
    instanceId: "source:radiation",
  };

  const initial = planCustomAuraReminder({
    aura: directDamageAura,
    desiredTargetIds: ["target"],
    initiativeState: state(0),
    itemsById,
    areaPosition: { x: 0, y: 0 },
    now: 100,
  });

  const auraItem = {
    id: "aura-rad-visual",
    metadata: {
      [CUSTOM_AURA_META_KEY]: { triggerRuntime: initial.runtime },
    },
  };

  const plan = planCustomAuraReminder({
    aura: directDamageAura,
    auraItem,
    desiredTargetIds: ["target"],
    initiativeState: state(1),
    itemsById,
    areaPosition: { x: 0, y: 0 },
    now: 200,
  });

  assert.equal(plan.notices.length, 1);
  assert.equal(plan.notices[0].resolution.mode, "manual-damage");
  assert.equal(plan.notices[0].resolution.damage.dice, "2d8");
});

test("innesca reminder su eventi di entrata ed uscita dall'aura", () => {
  const geoAura = {
    ...normalizeCustomAura({
      id: "barrier",
      name: "Barriera Eterea",
      reminders: [
        { id: "enter-warning", enabled: true, event: "enter", label: "Entra nella barriera" },
        { id: "leave-warning", enabled: true, event: "leave", label: "Esce dalla barriera" },
      ],
    }),
    sourceId: "source",
    sourceName: "Custode",
    instanceId: "source:barrier",
  };

  // Inizializzazione con target all'interno
  const initial = planCustomAuraReminder({
    aura: geoAura,
    desiredTargetIds: ["target"],
    initiativeState: state(0),
    itemsById,
    areaPosition: { x: 0, y: 0 },
    now: 100,
  });

  const auraItem = {
    id: "barrier-visual",
    metadata: { [CUSTOM_AURA_META_KEY]: { triggerRuntime: initial.runtime } },
  };

  // Un altro token ("other") entra, e "target" esce
  const step = planCustomAuraReminder({
    aura: geoAura,
    auraItem,
    desiredTargetIds: ["other"],
    initiativeState: state(0),
    itemsById,
    areaPosition: { x: 0, y: 0 },
    now: 200,
  });

  const enterActivation = step.newActivations.find((a) => a.event === "enter");
  const leaveActivation = step.newActivations.find((a) => a.event === "leave");
  assert.ok(enterActivation);
  assert.ok(leaveActivation);
  assert.deepEqual(enterActivation.targetIds, ["other"]);
  assert.deepEqual(leaveActivation.targetIds, ["target"]);
});

