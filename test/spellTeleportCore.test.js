import test, { mock } from "node:test";
import assert from "node:assert/strict";

const sdkStub = {
  onReady: () => {},
  room: { getMetadata: async () => ({}) },
  scene: {
    getMetadata: async () => ({}),
    items: {
      getItems: async () => [],
      onChange: () => () => {},
      updateItems: async () => {},
    },
    grid: {
      getDpi: async () => 150,
      getScale: async () => ({ parsed: { multiplier: 1.5, unit: "m" } }),
    },
  },
};

mock.module("@owlbear-rodeo/sdk", {
  exports: {
    default: sdkStub,
    buildLabel: (...args) => ({ type: "LABEL", args }),
    buildImage: (...args) => ({ type: "IMAGE", args }),
    buildPath: (...args) => ({ type: "PATH", args }),
    buildText: (...args) => ({ type: "TEXT", args }),
    buildShape: (...args) => ({ type: "SHAPE", args }),
    Command: class Command {},
  },
});

const {
  isTeleportSpell,
  getSpellTeleportRule,
  spellTeleportDestinationPosition,
} = await import("../src/spellTeleportCore.js");
const { buildSpellUnifiedPanelContract } = await import("../src/spellUnifiedPanelCore.js");
const { buildSpellAreaResolutionCommand } = await import("../src/spellAreaResolutionCommandCore.js");
const { buildSpellAreaResolutionExecutionPlan } = await import("../src/spellAreaResolutionExecutor.js");

test("identifica correttamente gli incantesimi di teletrasporto", () => {
  assert.equal(isTeleportSpell("misty-step"), true);
  assert.equal(isTeleportSpell("dimension-door"), true);
  assert.equal(isTeleportSpell("fireball"), false);
  assert.equal(isTeleportSpell("cure-wounds"), false);

  const mistyRule = getSpellTeleportRule("misty-step");
  assert.ok(mistyRule);
  assert.equal(mistyRule.rangeMeters, 9);
  assert.equal(mistyRule.allowPassenger, false);
});

test("costruisce il contratto per Passo Velato con placement richiesto a 9m", () => {
  const contract = buildSpellUnifiedPanelContract({ spellId: "misty-step" });
  assert.ok(contract);
  assert.equal(contract.spell.id, "misty-step");
  assert.equal(contract.spell.level, 2);
  assert.equal(contract.spell.concentration, false);
  assert.equal(contract.execution.lane, "area-transaction");
  assert.equal(contract.presentation.placement.policy, "required");
  assert.equal(contract.presentation.placement.ruleId, "misty-step:cast");
});

test("genera il comando e il piano di esecuzione con side-effect token:teleport per Passo Velato", async () => {
  const contract = buildSpellUnifiedPanelContract({ spellId: "misty-step" });
  const destination = { x: 300, y: 300 };
  const command = buildSpellAreaResolutionCommand({
    contract,
    spellId: "misty-step",
    casterId: "caster-1",
    placement: {
      status: "confirmed",
      confirmed: true,
      ruleId: contract.presentation.placement.ruleId,
      spellId: "misty-step",
      casterId: "caster-1",
      preview: {
        type: "circle",
        start: destination,
        end: destination,
        position: destination,
        gridOrigin: { x: 0, y: 0 },
        dpi: 150,
        targetIds: [],
      },
    },
  });

  assert.equal(command.valid, true);

  const mockCaster = {
    id: "caster-1",
    name: "Mago",
    position: { x: 0, y: 0 },
    metadata: {},
  };

  const plan = await buildSpellAreaResolutionExecutionPlan(command, {
    sceneEpoch: 1,
    isCurrent: () => true,
    readItems: async (ids) => ids.map((id) => id === "caster-1" ? mockCaster : null).filter(Boolean),
    readAllItems: async () => [mockCaster],
    getStaticZoneItems: async () => [],
    getBoardTokenItems: async () => [],
    buildStaticZoneItems: () => [],
  });

  assert.equal(plan.valid, true);
  assert.ok(plan.spellBoardTokenSideEffects.some((sideEffect) => (
    sideEffect.type === "token:teleport"
      && sideEffect.targetId === "caster-1"
      && sideEffect.position.x === 300
      && sideEffect.position.y === 300
  )));
  assert.ok(plan.matchedVisualContext);
  assert.equal(plan.matchedVisualContext.spellId, "misty-step");
  assert.equal(plan.matchedVisualContext.preview.origin.x, 0);
  assert.equal(plan.matchedVisualContext.preview.destination.x, 300);
});

test("il pannello unificato mostra 'Posiziona destinazione' per Passo Velato", async () => {
  const { buildSpellPanelViewModel } = await import("../src/spellUnifiedPanelCore.js");
  const contract = buildSpellUnifiedPanelContract({ spellId: "misty-step" });
  const model = buildSpellPanelViewModel(contract, {
    casterId: "caster-1",
    placement: { state: "idle", confirmed: false },
  });

  assert.equal(model.primaryAction.id, "place");
  assert.equal(model.primaryAction.label, "Posiziona destinazione");
});

test("l'evento di teletrasporto viene convertito correttamente nel Combat Log con caster come bersaglio", async () => {
  const { combatEventFromHistoryEntry } = await import("../src/combatLogCore.js");
  const historyEntry = {
    id: "history-teleport-1",
    kind: "spell",
    label: "Lancio incantesimo · Passo Velato",
    at: Date.now(),
    changes: [],
    effectsMutation: {
      commandId: "cmd-1",
      commandType: "spell",
      changes: [],
      sideEffects: [
        {
          id: "caster-1",
          type: "item",
          before: { id: "caster-1", name: "Mago", position: { x: 0, y: 0 } },
          after: { id: "caster-1", name: "Mago", position: { x: 300, y: 300 } },
        },
      ],
    },
    payload: {
      causality: {
        source: "spell-area",
        spellId: "misty-step",
        spellName: "Passo Velato",
        casterId: "caster-1",
        casterName: "Mago",
        teleport: true,
        targets: [{ id: "caster-1", name: "Mago" }],
      },
    },
  };

  const combatEvent = combatEventFromHistoryEntry(historyEntry);
  assert.ok(combatEvent);
  assert.equal(combatEvent.category, "spell");
  assert.equal(combatEvent.targets.length, 1);
  assert.equal(combatEvent.targets[0].id, "caster-1");
  assert.equal(combatEvent.targets[0].name, "Mago");
});

test("calcola il centro esatto della casella di destinazione anziché lo spigolo di intersezione", () => {
  const squarePreview = {
    type: "square",
    start: { x: 0, y: 0 },
    end: { x: 150, y: 150 },
    gridOrigin: { x: 0, y: 0 },
    dpi: 150,
  };
  const destination = spellTeleportDestinationPosition(squarePreview);
  assert.deepEqual(destination, { x: 75, y: 75 });
});

test("il layer plan di Passo Velato posiziona mistyStepOut sull'origine e mistyStepIn sulla destinazione", async () => {
  const { buildMatchedVisualEvent } = await import("../src/embersMatchedVisualCore.js");
  const event = buildMatchedVisualEvent({
    spellId: "misty-step",
    eventId: "evt-1",
    casterId: "caster-1",
    caster: { center: { x: 75, y: 75 }, diameter: 150 },
    preview: {
      destination: { x: 375, y: 375 },
      origin: { x: 75, y: 75 },
      start: { x: 375, y: 375 },
      end: { x: 375, y: 375 },
      type: "circle",
    },
    sceneDpi: 150,
  });

  assert.ok(event);
  assert.equal(event.layers.length, 2);

  const outLayer = event.layers.find((l) => l.effectId === "mistyStepOut");
  assert.ok(outLayer);
  assert.deepEqual(outLayer.center, { x: 75, y: 75 });
  assert.equal(outLayer.delay, 0);
  assert.equal(outLayer.oneShot, true);

  const inLayer = event.layers.find((l) => l.effectId === "mistyStepIn");
  assert.ok(inLayer);
  assert.deepEqual(inLayer.center, { x: 375, y: 375 });
  assert.equal(inLayer.delay, 1500);
  assert.equal(inLayer.oneShot, true);
});
