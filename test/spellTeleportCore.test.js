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
  spellTeleportDestinationForSubject,
  spellTeleportDestinationPosition,
  spellTeleportGeometriesAdjacent,
} = await import("../src/spellTeleportCore.js");
const { buildSpellUnifiedPanelContract } = await import("../src/spellUnifiedPanelCore.js");
const { buildSpellAreaResolutionCommand } = await import("../src/spellAreaResolutionCommandCore.js");
const { buildSpellAreaResolutionExecutionPlan } = await import("../src/spellAreaResolutionExecutor.js");
const { buildSpellUnifiedCatalogEntries } = await import("../src/spellUnifiedPanelCatalogCore.js");
const { getSpellAreaRuleById } = await import("../src/spellAreaRules.js");

function dimensionPlacement(destination = { x: 300, y: 300 }) {
  return {
    status: "confirmed",
    confirmed: true,
    targetLocked: true,
    ruleId: "dimension-door:cast",
    spellId: "dimension-door",
    casterId: "caster-1",
    preview: {
      type: "square",
      start: { x: destination.x - 75, y: destination.y - 75 },
      end: { x: destination.x + 75, y: destination.y + 75 },
      position: { ...destination },
      gridOrigin: { x: 0, y: 0 },
      dpi: 150,
      targetIds: [],
    },
  };
}

function dimensionCommand({
  passengerId = "",
  passenger = passengerId ? { id: passengerId, layer: "CHARACTER" } : null,
  destination = { x: 300, y: 300 },
  ...overrides
} = {}) {
  const contract = buildSpellUnifiedPanelContract({
    spellId: "dimension-door",
  });
  return buildSpellAreaResolutionCommand({
    contract,
    spellId: "dimension-door",
    phase: "cast",
    source: { kind: "cast", sceneEpoch: 1, commandId: "dimension-command" },
    commandId: "dimension-command",
    correlationId: "dimension-command",
    casterId: "caster-1",
    passengerId,
    passenger,
    targetIds: passengerId ? [passengerId] : [],
    targetLocked: true,
    placement: dimensionPlacement(destination),
    sceneEpoch: 1,
    currentSceneEpoch: 1,
    validateSpatial: false,
    ...overrides,
  });
}

test("identifica correttamente gli incantesimi di teletrasporto", () => {
  assert.equal(isTeleportSpell("misty-step"), true);
  assert.equal(isTeleportSpell("dimension-door"), true);
  assert.equal(isTeleportSpell("fireball"), false);
  assert.equal(isTeleportSpell("cure-wounds"), false);

  const mistyRule = getSpellTeleportRule("misty-step");
  assert.ok(mistyRule);
  assert.equal(mistyRule.rangeMeters, 9);
  assert.equal(mistyRule.allowPassenger, false);

  const dimensionRule = getSpellTeleportRule("dimension-door");
  assert.equal(dimensionRule.rangeMeters, 150);
  assert.equal(dimensionRule.allowPassenger, true);
  assert.equal(dimensionRule.passengerMaxDistanceMeters, 1.5);
  assert.deepEqual(dimensionRule.passenger, {
    optional: true,
    maximum: 1,
    requireCreature: true,
    maxSizeRelation: "caster-or-smaller",
    adjacency: "grid-adjacent",
    destinationPlacement: "preserve-relative-offset",
  });
  assert.deepEqual(dimensionRule.failure.damage, {
    dice: "4d6",
    type: "force",
    requiresManualAmount: true,
  });
});

test("Dimension Door è esposta nel workflow unified con caster, destinazione e passeggero opzionale", () => {
  const entry = buildSpellUnifiedCatalogEntries().find((candidate) => candidate.key === "dimension-door");
  assert.ok(entry);
  const contract = buildSpellUnifiedPanelContract({ spellId: "dimension-door" });
  assert.equal(contract.execution.lane, "area-transaction");
  assert.equal(contract.presentation.placement.policy, "required");
  assert.equal(contract.presentation.placement.ruleId, "dimension-door:cast");
  assert.equal(contract.presentation.placement.rules[0].shape, "square");
  assert.equal(contract.presentation.placement.rules[0].mode, "point");
  assert.equal(contract.presentation.placement.rules[0].centered, true);
  assert.equal(getSpellAreaRuleById("dimension-door:cast").placement.mode, "point");
  assert.equal(contract.presentation.targeting.mode, "geometric");
  assert.equal(contract.presentation.targeting.subjectMode, "self");
  assert.equal(contract.presentation.targeting.spatialRules.mode, "teleport");
  assert.equal(contract.presentation.targeting.spatialRules.maxMeters, 150);
  assert.equal(contract.presentation.targeting.spatialRules.passengerMaxMeters, 1.5);
  assert.equal(contract.presentation.teleport.destination.source, "placement");
  assert.equal(contract.presentation.teleport.passenger.optional, true);
  assert.equal(contract.presentation.teleport.passenger.maximum, 1);
  assert.equal(contract.presentation.inputs.passenger.visible, true);
  assert.equal(contract.presentation.inputs.teleportOutcome, undefined);
  assert.equal(contract.presentation.teleport.outcome, undefined);
  assert.equal(contract.presentation.teleport.failure, undefined);
  assert.equal(contract.presentation.inputs.damage.required, false);
  assert.equal(contract.presentation.controls.includes("passenger"), true);
  assert.equal(contract.presentation.controls.includes("teleport-outcome"), false);
});

test("Dimension Door costruisce un DTO serializzabile con destinazione e ruoli distinti", () => {
  const command = dimensionCommand({ passengerId: "passenger-1" });
  assert.equal(command.valid, true, command.errors?.join(", "));
  assert.equal(command.commandId, "dimension-command");
  assert.equal(command.correlationId, "dimension-command");
  assert.deepEqual(command.teleport, {
    spellId: "dimension-door",
    destination: { x: 300, y: 300 },
    passengerId: "passenger-1",
    affectedTargetIds: ["caster-1", "passenger-1"],
    passengerPlacement: "preserve-relative-offset",
  });
  assert.deepEqual(command.targeting.targetIds, ["passenger-1"]);
  assert.deepEqual(structuredClone(command), command);
});

test("Dimension Door serializza l'offset relativo rilevato dal placement", () => {
  const command = dimensionCommand({
    passengerId: "passenger-1",
    validateSpatial: true,
    spatialValidation: {
      passengerAdjacent: true,
      passengerRelativeOffset: { x: 150, y: -150 },
    },
  });
  assert.equal(command.valid, true, command.errors?.join(", "));
  assert.deepEqual(command.teleport.passengerRelativeOffset, { x: 150, y: -150 });
  assert.deepEqual(structuredClone(command.teleport.passengerRelativeOffset), {
    x: 150,
    y: -150,
  });
});

test("Dimension Door riconosce l'adiacenza a griglia e preserva l'offset relativo", () => {
  const square = (x, y, width = 150, height = 150) => ({
    position: { x, y },
    size: { width, height },
  });
  assert.equal(
    spellTeleportGeometriesAdjacent(square(75, 75), square(225, 75), 150),
    true,
  );
  assert.equal(
    spellTeleportGeometriesAdjacent(square(75, 75), square(227.5, 227), 150),
    true,
  );
  assert.equal(
    spellTeleportGeometriesAdjacent(
      square(75.4, 74.8),
      square(225.8, 225.2),
      150,
    ),
    true,
  );
  assert.equal(
    spellTeleportGeometriesAdjacent(square(75, 75), square(75, 75), 150),
    false,
  );
  assert.equal(
    spellTeleportGeometriesAdjacent(square(75, 75), square(375, 75), 150),
    false,
  );
  assert.deepEqual(
    spellTeleportDestinationForSubject(
      { x: 600, y: 450 },
      { x: 75, y: 75 },
      { x: 225, y: 75 },
    ),
    { x: 750, y: 450 },
  );
});

test("Dimension Door resta caster-only e conserva la destinazione esplicita", () => {
  const command = dimensionCommand();
  assert.equal(command.valid, true, command.errors?.join(", "));
  assert.deepEqual(command.targeting.targetIds, []);
  assert.equal(command.teleport.passengerId, null);
  assert.deepEqual(command.teleport.affectedTargetIds, ["caster-1"]);
  assert.deepEqual(command.teleport.destination, { x: 300, y: 300 });
});

test("Dimension Door valida le restrizioni deterministiche del passeggero senza esito destinazione", () => {
  const nonCreature = dimensionCommand({
    passengerId: "object-1",
    passenger: { id: "object-1", layer: "PROP" },
  });
  assert.equal(nonCreature.valid, false);
  assert.equal(nonCreature.errors.includes("passenger-not-creature"), true);

  const tooFar = dimensionCommand({
    passengerId: "passenger-1",
    validateSpatial: true,
    spatialValidation: { invalidPassengerIds: ["passenger-1"] },
  });
  assert.equal(tooFar.valid, false);
  assert.equal(tooFar.errors.includes("passenger-out-of-range"), true);

  const notAdjacent = dimensionCommand({
    passengerId: "passenger-1",
    validateSpatial: true,
    spatialValidation: {
      passengerAdjacent: false,
      invalidPassengerIds: ["passenger-1"],
    },
  });
  assert.equal(notAdjacent.valid, false);
  assert.equal(notAdjacent.errors.includes("passenger-not-adjacent"), true);

  const legacyOutcome = dimensionCommand({
    castContext: { teleportOutcome: "destination-occupied" },
    teleportOutcome: "destination-occupied",
  });
  assert.equal(legacyOutcome.valid, true, legacyOutcome.errors?.join(", "));
  assert.equal("teleportOutcome" in legacyOutcome, false);
  assert.equal("teleportOutcome" in legacyOutcome.spell, false);
  assert.equal(legacyOutcome.teleport.outcome, undefined);
  assert.equal(legacyOutcome.teleport.failure, undefined);
});

test("Dimension Door rifiuta destinazione mancante o fuori gittata senza collision engine", () => {
  const missing = dimensionCommand({
    placement: {
      status: "confirmed",
      confirmed: true,
      targetLocked: true,
      ruleId: "dimension-door:cast",
      spellId: "dimension-door",
      casterId: "caster-1",
      preview: { type: "square" },
    },
  });
  assert.equal(missing.valid, false);
  assert.equal(missing.errors.includes("teleport-destination-required"), true);

  const outOfRange = dimensionCommand({
    validateSpatial: true,
    spatialValidation: { invalidDestination: true },
  });
  assert.equal(outOfRange.valid, false);
  assert.equal(outOfRange.errors.includes("teleport-destination-out-of-range"), true);
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

test("Dimension Door trasporta il passeggero ma anima soltanto il caster", async () => {
  const command = dimensionCommand({
    passengerId: "passenger-1",
    validateSpatial: true,
    spatialValidation: {
      passengerAdjacent: true,
      passengerRelativeOffset: { x: 150, y: 0 },
    },
  });
  const caster = {
    id: "caster-1",
    name: "Caster",
    layer: "CHARACTER",
    position: { x: 0, y: 0 },
    metadata: {},
  };
  const passenger = {
    id: "passenger-1",
    name: "Passenger",
    layer: "CHARACTER",
    position: { x: 150, y: 0 },
    metadata: {},
  };
  const sceneItems = [caster, passenger];

  const plan = await buildSpellAreaResolutionExecutionPlan(command, {
    sceneEpoch: 1,
    isCurrent: () => true,
    readItems: async (ids) => sceneItems.filter((item) => ids.includes(item.id)),
    readAllItems: async () => sceneItems,
    getStaticZoneItems: async () => [],
    getBoardTokenItems: async () => [],
    buildStaticZoneItems: () => [],
  });

  assert.equal(plan.valid, true);
  assert.deepEqual(
    plan.spellBoardTokenSideEffects
      .filter((effect) => effect.type === "token:teleport")
      .map((effect) => effect.targetId),
    ["caster-1", "passenger-1"],
  );
  assert.deepEqual(plan.matchedVisualContext.targetIds, ["caster-1"]);
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
