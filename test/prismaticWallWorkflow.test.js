import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { mock } from "node:test";

const META_KEY = "com.thebigpicture.initiative/meta";
const SPELLS_KEY = "com.thebigpicture.initiative/spells";
const ZONE_KEY = "com.thebigpicture.initiative/static-zone";
const STATE_KEY = "com.thebigpicture.initiative/state";

const sceneItems = new Map();
const mutationCalls = [];

const clone = (value) => value === undefined ? undefined : structuredClone(value);

const sdk = {
  onReady() {},
  room: { id: "prismatic-wall-test-room", getMetadata: async () => ({}) },
  player: { getRole: async () => "GM" },
  scene: {
    getMetadata: async () => ({
      [STATE_KEY]: { order: ["caster", "target"], current: 0, round: 1 },
    }),
    items: {
      getItems: async (ids) => {
        const selected = Array.isArray(ids)
          ? ids.map((id) => sceneItems.get(id)).filter(Boolean)
          : [...sceneItems.values()];
        return selected.map(clone);
      },
      getItemBounds: async () => null,
      updateItems: async () => {},
      deleteItems: async () => {},
      addItems: async () => {},
    },
    grid: {
      getDpi: async () => 100,
      getScale: async () => ({ parsed: { multiplier: 1.5, unit: "m" } }),
      snapPosition: async (position) => position,
    },
  },
  broadcast: {
    onMessage: () => () => {},
    sendMessage: async () => {},
  },
};

mock.module("@owlbear-rodeo/sdk", {
  exports: {
    default: sdk,
    buildLabel: () => ({ build: () => ({ id: "label" }) }),
    buildImage: () => ({ build: () => ({ id: "image" }) }),
    buildText: () => ({ build: () => ({ id: "text" }) }),
    buildShape: () => ({ build: () => ({ id: "shape" }) }),
    Command: { MOVE: 0, LINE: 1, CUBIC: 2, CLOSE: 3 },
    buildPath: () => ({
      commands: () => ({
        fillRule: () => ({
          fillColor: () => ({
            fillOpacity: () => ({
              strokeColor: () => ({
                strokeOpacity: () => ({
                  strokeWidth: () => ({
                    position: () => ({
                      locked: () => ({
                        disableHit: () => ({
                          layer: () => ({
                            metadata: () => ({
                              name: () => ({ build: () => ({ id: "path" }) }),
                            }),
                          }),
                        }),
                      }),
                    }),
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    }),
  },
});

mock.module("../src/effectsMutations.js", {
  exports: {
    runEffectsMutation: async (operations, options) => {
      mutationCalls.push({ operations, options });
      return {
        status: "applied",
        committed: true,
        changedIds: ["caster", "target"],
        historyEntryId: `history-${mutationCalls.length}`,
        undoAvailable: true,
      };
    },
    requireAppliedEffectsMutation: (result) => result,
    tickRoundEffects: async () => ({ status: "applied", changedIds: [] }),
  },
});

const raw = JSON.parse(readFileSync(new URL(
  "../docs/class-features/raw/incantesimi_manualedelgiocatore_pagine_211_289_BOZZA.json",
  import.meta.url,
), "utf8"));
const rawWall = raw.find((entry) => entry?.nome === "Muro Prismatico");

const {
  PRISMATIC_WALL_LAYER_IDS,
  PRISMATIC_WALL_LAYERS,
  prismaticWallCastContext,
  prismaticWallFirstRemainingLayer,
  prismaticWallLayerManagementPlan,
  prismaticWallStateFromCastContext,
  prismaticWallSummaryParts,
  prismaticWallTraversalMarker,
  prismaticWallTraversalPlan,
} = await import("../src/prismaticWallRules.js");
const { ID } = await import("../src/constants.js");
const {
  getSpellDefinition,
  getSpellSummaryParts,
} = await import("../src/spells-srd.js");
const {
  getSpellAreaRuleById,
  getSpellAreaRuleForPlacement,
} = await import("../src/spellAreaRules.js");
const {
  SPELL_STATIC_ZONE_META_KEY,
  scopedStaticSpellZoneTargetIds,
  staticSpellZoneMetadata,
} = await import("../src/spellStaticZoneCore.js");
const { buildArea } = await import("../src/aoeGeometryCore.js");
const { planStaticSpellZoneReminder } = await import("../src/spellStaticZoneReminderCore.js");
const {
  buildSpellUnifiedPanelContract,
} = await import("../src/spellUnifiedPanelCore.js");
const {
  buildUnifiedPanelViewModel,
} = await import("../src/spellUnifiedPanelViewCore.js");
const {
  buildSpellActiveResolutionPayload,
} = await import("../src/spellActiveResolutionCore.js");
const {
  executeSpellActiveResolution,
} = await import("../src/spellApplicationExecutor.js?prismatic-wall-runtime");
const { planEffectSaveReminderNotices } = await import("../src/effectSaveReminderCore.js");
const { buildReminderResolutionPlan } = await import("../src/reminderResolutionCore.js");

function wallContext({
  shape = "wall",
  remainingLayers = PRISMATIC_WALL_LAYER_IDS,
  exemptCreatureIds = [],
  resolvedTraversalIds = [],
} = {}) {
  return prismaticWallCastContext({
    castContext: {
      prismaticWall: {
        shape,
        remainingLayers,
        exemptCreatureIds,
        resolvedTraversalIds,
      },
    },
    shape,
    exemptCreatureIds,
  });
}

function resetScene({
  shape = "wall",
  remainingLayers = PRISMATIC_WALL_LAYER_IDS,
  exemptCreatureIds = [],
  resolvedTraversalIds = [],
  targetHp = 200,
  targetId = "target",
} = {}) {
  sceneItems.clear();
  mutationCalls.length = 0;
  const castContext = wallContext({
    shape,
    remainingLayers,
    exemptCreatureIds,
    resolvedTraversalIds,
  });
  sceneItems.set("caster", {
    id: "caster",
    name: "Mago",
    layer: "CHARACTER",
    metadata: {
      [META_KEY]: {
        hp: 40,
        hpMax: 40,
        [SPELLS_KEY]: [{
          spellId: "prismatic-wall",
          instanceId: "wall-instance",
          casterId: "caster",
          casterName: "Mago",
          name: "Muro Prismatico",
          turns: 100,
          conc: false,
          castContext,
          summaryParts: prismaticWallSummaryParts(castContext),
        }],
      },
    },
  });
  sceneItems.set(targetId, {
    id: targetId,
    name: "Bersaglio",
    layer: "CHARACTER",
    metadata: { [META_KEY]: { hp: targetHp, hpMax: targetHp, conditions: { instances: [] } } },
  });
  sceneItems.set("wall-root", {
    id: "wall-root",
    layer: "DRAWING",
    metadata: {
      [SPELL_STATIC_ZONE_META_KEY]: staticSpellZoneMetadata({
        instanceId: "wall-instance",
        ruleId: "prismatic-wall:cast",
        spellId: "prismatic-wall",
        casterId: "caster",
        exemptCreatureIds,
      }),
    },
  });
  return castContext;
}

function activePayload(actionId = "prismatic-wall-traversal", castContext = null) {
  const spell = getSpellDefinition("prismatic-wall");
  const action = spell.activeActions.find((entry) => entry.id === actionId);
  return buildSpellActiveResolutionPayload({
    spell,
    action,
    group: {
      instanceId: "wall-instance",
      casterId: "caster",
      casterName: "Mago",
      castContext: castContext || wallContext(),
    },
    sceneEpoch: 7,
    zoneItemId: "wall-root",
  });
}

function allFailedOutcomes() {
  return Object.fromEntries(PRISMATIC_WALL_LAYER_IDS.map((layerId) => [layerId, "failed"]));
}

function allDamageTotals() {
  return Object.fromEntries(PRISMATIC_WALL_LAYERS
    .filter((layer) => layer.damage)
    .map((layer, index) => [layer.id, (index + 1) * 10]));
}

test("RAW locale: Muro Prismatico resta la source of truth verificata", () => {
  assert.ok(rawWall);
  assert.equal(rawWall.livello, 9);
  assert.equal(rawWall.tempo_di_lancio, "1 azione");
  assert.equal(rawWall.gittata, "18 metri");
  assert.equal(rawWall.durata, "10 minuti");
  assert.equal(rawWall.componenti, "V, S");
  assert.match(rawWall.descrizione, /27 metri di lunghezza, 9 metri di altezza e 2, 5 cm/u);
  assert.match(rawWall.descrizione, /sfera del diametro massimo di 9 metri/u);
  assert.match(rawWall.descrizione, /passi attraverso uno spazio occupato da una creatura/u);
  assert.match(rawWall.descrizione, /entro 6 metri/u);
  assert.match(rawWall.descrizione, /sette strati/u);
  for (const phrase of [
    "10d6 danni da fuoco",
    "10d6 danni da acido",
    "10d6 danni da fulmine",
    "10d6 danni da veleno",
    "10d6 danni da freddo",
    "tre volte",
    "Pietrificato",
    "dissolvi magie",
  ]) assert.match(rawWall.descrizione, new RegExp(phrase, "iu"));
});

test("catalogo e placement espongono il sottoinsieme geometrico RAW supportato", () => {
  const spell = getSpellDefinition("prismatic-wall");
  const rule = getSpellAreaRuleById("prismatic-wall:cast");
  assert.equal(spell.level, 9);
  assert.equal(spell.concentration, false);
  assert.equal(spell.defaultTurns, 100);
  assert.equal(rule.geometry.shape, "line");
  assert.deepEqual(rule.geometry.size, { value: 27, unit: "m", measure: "length" });
  assert.deepEqual(rule.geometry.width, { value: 0.025, unit: "m", measure: "width" });
  assert.deepEqual(rule.placement.range, { value: 18, unit: "m", measure: "range" });
  assert.deepEqual(
    rule.placementChoices.map((choice) => [choice.id, choice.geometry.shape]),
    [["wall", "line"], ["sphere", "circle"]],
  );
  assert.deepEqual(getSpellAreaRuleForPlacement("prismatic-wall:cast", "sphere").geometry.size, {
    value: 4.5,
    unit: "m",
    measure: "radius",
  });
  assert.deepEqual(rule.zonePolicy.triggers.map((trigger) => trigger.event), ["enter", "turn-start"]);
  const proximityTrigger = rule.zonePolicy.triggers.find((trigger) => trigger.event === "turn-start");
  assert.equal(proximityTrigger.proximityMeters, 6);
  assert.equal(proximityTrigger.ability, "con");
  assert.equal(proximityTrigger.resolutionData.failureCondition.condition, "Accecato");
  assert.equal(proximityTrigger.resolutionData.failureCondition.options.expiry.remaining, 10);
  assert.equal(proximityTrigger.resolutionData.failureCondition.options.saveReminder, undefined);
  assert.match(proximityTrigger.failureEffect, /1 minuto/u);
  assert.doesNotMatch(proximityTrigger.failureEffect, /TS/u);
});

test("parent/state: una sola instance conserva forma, esenzioni, layer e summary derivata", () => {
  const context = wallContext({ shape: "sphere", exemptCreatureIds: ["friend", "friend"] });
  const state = prismaticWallStateFromCastContext(context);
  assert.deepEqual(state.remainingLayers, [...PRISMATIC_WALL_LAYER_IDS]);
  assert.deepEqual(state.exemptCreatureIds, ["friend"]);
  assert.equal(state.shape, "sphere");
  assert.deepEqual(prismaticWallSummaryParts(state), [{ id: "prismatic-wall-layers", label: "7/7 strati" }]);
  assert.deepEqual(getSpellSummaryParts(getSpellDefinition("prismatic-wall"), "", context), [
    { id: "prismatic-wall-layers", label: "7/7 strati" },
  ]);
  assert.equal(prismaticWallCastContext({ ruleChoice: "sphere" }).prismaticWall.shape, "sphere");
  assert.deepEqual(
    prismaticWallStateFromCastContext(prismaticWallCastContext({ casterId: "caster" })).exemptCreatureIds,
    ["caster"],
  );
  assert.deepEqual(
    prismaticWallStateFromCastContext(prismaticWallCastContext({
      castContext: {
        exemptCreatureIds: [],
        prismaticWall: { exemptCreatureIds: ["friend"] },
      },
      casterId: "caster",
    })).exemptCreatureIds,
    ["caster", "friend"],
  );
  assert.equal(prismaticWallStateFromCastContext({ remainingLayers: [] }).remainingLayers.length, 0);
});

test("prossimità: niente trigger al cast, esenzioni filtrate, ingresso e inizio turno separati", () => {
  const rule = getSpellAreaRuleById("prismatic-wall:cast");
  const triggerIds = Object.fromEntries(
    rule.zonePolicy.triggers.map((trigger) => [trigger.id, ["friend", "target"]]),
  );
  const zoneItem = {
    id: "wall-root",
    position: { x: 0, y: 0 },
    metadata: {
      [SPELL_STATIC_ZONE_META_KEY]: staticSpellZoneMetadata({
        instanceId: "wall-instance",
        ruleId: rule.id,
        spellId: rule.spellId,
        casterId: "caster",
        targetIds: [],
        exemptCreatureIds: ["friend"],
      }),
    },
  };
  const initial = planStaticSpellZoneReminder({
    zoneItem,
    rule,
    desiredTargetIds: ["friend", "target"],
    currentTargetIdsByTrigger: triggerIds,
    currentTargetPositions: { target: { x: 100, y: 100 } },
    initiativeState: { order: ["caster", "target"], current: 0, round: 1 },
  });
  assert.deepEqual(initial.newActivations, []);
  assert.deepEqual(
    initial.runtime.memberIdsByTrigger,
    Object.fromEntries(rule.zonePolicy.triggers.map((trigger) => [trigger.id, ["target"]])),
  );

  const entered = planStaticSpellZoneReminder({
    zoneItem: {
      ...zoneItem,
      metadata: {
        [SPELL_STATIC_ZONE_META_KEY]: {
          ...zoneItem.metadata[SPELL_STATIC_ZONE_META_KEY],
          triggerRuntime: initial.runtime,
        },
      },
    },
    rule,
    desiredTargetIds: ["target", "new-target"],
    currentTargetIdsByTrigger: Object.fromEntries(
      rule.zonePolicy.triggers.map((trigger) => [trigger.id, ["target", "new-target"]]),
    ),
    currentTargetPositions: {
      target: { x: 100, y: 100 },
      "new-target": { x: 110, y: 100 },
    },
    initiativeState: { order: ["caster", "target"], current: 0, round: 1 },
  });
  assert.deepEqual(entered.newActivations.map((activation) => activation.event), ["enter"]);
  assert.deepEqual(entered.newActivations[0].targetIds, ["new-target"]);

  const turnStart = planStaticSpellZoneReminder({
    zoneItem: {
      ...zoneItem,
      metadata: {
        [SPELL_STATIC_ZONE_META_KEY]: {
          ...zoneItem.metadata[SPELL_STATIC_ZONE_META_KEY],
          triggerRuntime: initial.runtime,
        },
      },
    },
    rule,
    desiredTargetIds: ["target"],
    currentTargetIdsByTrigger: Object.fromEntries(
      rule.zonePolicy.triggers.map((trigger) => [trigger.id, ["target"]]),
    ),
    currentTargetPositions: { target: { x: 100, y: 100 } },
    initiativeState: { order: ["caster", "target"], current: 1, round: 1 },
  });
  assert.deepEqual(turnStart.newActivations.map((activation) => activation.event), ["turn-start"]);
  assert.deepEqual(turnStart.newActivations[0].targetIds, ["target"]);
});

test("hot zone: il muro usa entrambi i lati e la sfera una fascia esterna visibile", () => {
  const rule = getSpellAreaRuleById("prismatic-wall:cast");
  assert.equal(rule.geometry.hotBand.side, "both");
  assert.equal(getSpellAreaRuleForPlacement("prismatic-wall:cast", "wall").geometry.hotBand.side, "both");
  assert.equal(getSpellAreaRuleForPlacement("prismatic-wall:cast", "sphere").geometry.hotBand.side, "outside");

  const lineSide = buildArea(
    "line",
    { x: 0, y: 0 },
    { x: 1000, y: 0 },
    100,
    { x: 0, y: 0 },
    { widthSquares: 1, band: { side: "left", bandSquares: 4 } },
  );
  const lineBoth = buildArea(
    "line",
    { x: 0, y: 0 },
    { x: 1000, y: 0 },
    100,
    { x: 0, y: 0 },
    { widthSquares: 1, band: { side: "both", bandSquares: 4 } },
  );
  assert.equal(lineBoth.bandSide, "both");
  assert.ok(lineBoth.cells.length > lineSide.cells.length);
  assert.ok(new Set(lineBoth.cells.map((cell) => cell.row)).size > 1);

  const sphereBand = buildArea(
    "circle",
    { x: 0, y: 0 },
    { x: 300, y: 0 },
    100,
    { x: 0, y: 0 },
    { widthSquares: 3, band: { side: "outside", bandSquares: 4 } },
  );
  assert.equal(sphereBand.areaRole, "side-band");
  assert.ok(sphereBand.cells.length > 0);
});

test("exemption instance-scoped: membership e UI non la trasformano in una condition", () => {
  const rule = getSpellAreaRuleById("prismatic-wall:cast");
  const metadata = staticSpellZoneMetadata({
    instanceId: "wall-instance",
    ruleId: rule.id,
    spellId: rule.spellId,
    casterId: "caster",
    exemptCreatureIds: ["friend"],
  });
  assert.deepEqual(scopedStaticSpellZoneTargetIds({
    rule,
    zoneMetadata: metadata,
    targetIds: ["caster", "friend", "foe"],
  }), ["caster", "foe"]);
  const contract = buildSpellUnifiedPanelContract({
    spellId: "prismatic-wall",
    phase: "cast",
    castContext: { slotLevel: 9, exemptCreatureIds: ["friend"] },
  });
  const model = buildUnifiedPanelViewModel({
    contract,
    session: {
      spellId: "prismatic-wall",
      phase: "cast",
      casterId: "caster",
      slotLevel: 9,
      castContext: { exemptCreatureIds: ["friend"] },
      targetIds: [],
    },
    targetCandidates: [
      { key: "friend", label: "Alleato" },
      { key: "foe", label: "Nemico" },
    ],
  });
  assert.equal(model.context.exemptions.visible, true);
  assert.deepEqual(model.context.exemptions.selectedIds, ["friend"]);
  assert.equal(model.context.exemptions.options.length, 2);
});

test("layer planner: ordine RAW, danni separati, full/half e immunità", () => {
  assert.equal(prismaticWallFirstRemainingLayer(["green", "violet"]), "green");
  const plan = prismaticWallTraversalPlan({
    targetId: "target",
    remainingLayers: PRISMATIC_WALL_LAYER_IDS,
    outcomes: allFailedOutcomes(),
    damageTotals: allDamageTotals(),
    parentEffectId: "wall-instance",
    sourceId: "caster",
    sourceName: "Mago",
  });
  assert.equal(plan.valid, true);
  assert.deepEqual(plan.targetPlans[0].layers.map((entry) => entry.layerId), PRISMATIC_WALL_LAYER_IDS);
  assert.deepEqual(plan.damageContributions.map((entry) => entry.amount), [10, 20, 30, 40, 50]);
  assert.deepEqual(plan.damageContributions.map((entry) => entry.type), [
    "fuoco", "acido", "fulmine", "veleno", "freddo",
  ]);
  assert.equal(plan.conditionApplications[0].conditionName, "Trattenuto");
  assert.equal(plan.conditionApplications[1].conditionName, "Accecato");
  const mixed = prismaticWallTraversalPlan({
    targetId: "target",
    remainingLayers: ["red", "orange"],
    outcomes: { red: "passed", orange: "immune" },
    damageTotals: { red: 11 },
    parentEffectId: "wall-instance",
  });
  assert.deepEqual(mixed.damageContributions.map((entry) => entry.amount), [5, 0]);
  assert.equal(prismaticWallTraversalPlan({
    targetId: "target",
    remainingLayers: ["red"],
    outcomes: { red: "failed" },
    parentEffectId: "wall-instance",
  }).valid, false);
  assert.equal(prismaticWallTraversalPlan({
    targetId: "target",
    remainingLayers: ["red"],
    parentEffectId: "wall-instance",
    exempt: true,
  }).valid, true);
});

test("layer destruction: solo il prossimo esposto è normalmente distruttibile", () => {
  const first = prismaticWallLayerManagementPlan({ remainingLayers: PRISMATIC_WALL_LAYER_IDS, layerId: "red" });
  assert.equal(first.valid, true);
  assert.deepEqual(first.remainingLayers, PRISMATIC_WALL_LAYER_IDS.slice(1));
  assert.equal(first.summaryParts[0].label, "6/7 strati");
  const invalid = prismaticWallLayerManagementPlan({ remainingLayers: PRISMATIC_WALL_LAYER_IDS, layerId: "blue" });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.includes("prismatic-wall-layer-order-invalid"));
  const empty = prismaticWallLayerManagementPlan({ remainingLayers: [], layerId: "red" });
  assert.equal(empty.valid, false);
  assert.ok(empty.errors.includes("prismatic-wall-no-layers-remaining"));
});

test("Indaco e Viola compongono condizioni canoniche e lifecycle distinti", () => {
  const plan = prismaticWallTraversalPlan({
    targetId: "target",
    remainingLayers: ["indigo", "violet"],
    outcomes: { indigo: "failed", violet: "failed" },
    parentEffectId: "wall-instance",
    sourceId: "caster",
    sourceName: "Mago",
  });
  const indigo = plan.conditionApplications.find((entry) => entry.conditionName === "Trattenuto");
  const violet = plan.conditionApplications.find((entry) => entry.conditionName === "Accecato");
  assert.equal(indigo.options.parentEffectId, "wall-instance");
  assert.deepEqual(indigo.options.mechanics.prismaticWallIndigoProgress, {
    successes: 0, failures: 0, successThreshold: 3, failureThreshold: 3, terminal: null,
  });
  assert.equal(indigo.options.saveReminder.timing, "turn-end");
  assert.equal(violet.options.parentEffectId, undefined);
  assert.equal(violet.options.saveReminder.ability, "wis");
  assert.equal(violet.options.saveReminder.actor, "source");
  assert.equal(violet.options.saveReminder.timing, "turn-start");
  assert.equal(violet.options.summaryParts[0].label, "TS Sag · prossimo turno caster");
  assert.match(violet.options.saveReminder.resolution.failure.actions[0].options.effectDetail, /movimento planare resta manuale/u);
});

test("turn-start reminder: Viola arriva al boundary del caster e fallisce in esito informativo", () => {
  const traversal = prismaticWallTraversalPlan({
    targetId: "target",
    remainingLayers: ["violet"],
    outcomes: { violet: "failed" },
    parentEffectId: "wall-instance",
    sourceId: "caster",
    sourceName: "Mago",
  });
  const options = traversal.conditionApplications[0].options;
  const condition = {
    id: "violet-effect",
    condition: "Accecato",
    active: true,
    sourceId: "caster",
    sourceName: "Mago",
    spellId: "prismatic-wall",
    type: "spell",
    appliedAt: { round: 1, actorId: "target", turnKey: "1:1:target" },
    ...options,
  };
  const items = [
    { id: "caster", name: "Mago", metadata: { [META_KEY]: { initiativeCard: { spellSaveDC: 17 } } } },
    { id: "target", name: "Bersaglio", metadata: { [META_KEY]: { conditions: { instances: [condition] } } } },
  ];
  const [notice] = planEffectSaveReminderNotices({
    items,
    previousInitiativeState: { order: ["caster", "target"], current: 1, round: 1 },
    initiativeState: { order: ["caster", "target"], current: 0, round: 2 },
    includeCurrentTurnStart: false,
  }).filter((entry) => entry.target?.id === "target");
  assert.ok(notice);
  assert.equal(notice.ability, "SAG");
  const failed = buildReminderResolutionPlan({ notice, items, outcome: "failed", now: 100 });
  assert.equal(failed.status, "ready");
  assert.equal(failed.operations.some((operation) => operation.type.startsWith("teleport")), false);
  const planar = failed.operations.find((operation) => operation.conditionName === "Trasferimento planare");
  assert.ok(planar);
  assert.equal(planar.options.summaryParts[0].label, "Trasferimento planare · GM");
});

test("active traversal: una transazione semantica, danni separati, marker e Undo condiviso", async () => {
  resetScene();
  const result = await executeSpellActiveResolution({
    payload: activePayload(),
    targetIds: ["target"],
    layerOutcomes: allFailedOutcomes(),
    layerDamage: allDamageTotals(),
    traversalId: "traversal-1",
    sceneEpoch: 7,
    isCurrent: () => true,
  });
  assert.equal(result.historyEntryId, "history-1");
  assert.equal(result.undoAvailable, true);
  assert.equal(mutationCalls.length, 1);
  const [{ operations, options }] = mutationCalls;
  assert.equal(options.metadataPatches.find((patch) => patch.id === "target").fields.hp.value, 50);
  assert.equal(operations.filter((operation) => operation.type === "condition:add").length, 2);
  assert.equal(operations.filter((operation) => operation.type === "spell:upsert").length, 1);
  assert.equal(operations.some((operation) => operation.type === "static-zone:remove-ended"), false);
  assert.equal(options.history.payload.prismaticWall.traversalId, "traversal-1");
  assert.deepEqual(options.history.payload.prismaticWall.damageContributions.map((entry) => entry.amount), [10, 20, 30, 40, 50]);
  assert.deepEqual(options.history.payload.prismaticWall.layers.map((entry) => entry.layerId), PRISMATIC_WALL_LAYER_IDS);
  assert.equal(options.operations, undefined);
  assert.equal(options.sideEffects[0].type, "spell-active-resolution:validate");
});

test("active layer management: aggiorna solo remainingLayers e rifiuta panel stale", async () => {
  resetScene();
  await executeSpellActiveResolution({
    payload: activePayload("prismatic-wall-layers"),
    targetIds: [],
    layerId: "red",
    sceneEpoch: 7,
    isCurrent: () => true,
  });
  const upsert = mutationCalls[0].operations.find((operation) => operation.type === "spell:upsert");
  assert.deepEqual(upsert.castContext.prismaticWall.remainingLayers, PRISMATIC_WALL_LAYER_IDS.slice(1));
  assert.deepEqual(upsert.summaryParts, [{ id: "prismatic-wall-layers", label: "6/7 strati" }]);
  assert.equal(upsert.castContext.prismaticWall.exemptCreatureIds.length, 0);

  resetScene({ remainingLayers: PRISMATIC_WALL_LAYER_IDS.slice(1) });
  await assert.rejects(
    executeSpellActiveResolution({
      payload: activePayload("prismatic-wall-layers"),
      targetIds: [],
      layerId: "red",
      sceneEpoch: 7,
      isCurrent: () => true,
    }),
    /prismatic-wall-state-stale/,
  );
  assert.equal(mutationCalls.length, 0);
});

test("active traversal: exemption bypassa esiti e damage, mentre il duplicate marker è idempotente", async () => {
  const context = resetScene({ exemptCreatureIds: ["target"], targetHp: 80 });
  await executeSpellActiveResolution({
    payload: activePayload("prismatic-wall-traversal", context),
    targetIds: ["target"],
    traversalId: "traversal-exempt",
    sceneEpoch: 7,
    isCurrent: () => true,
  });
  assert.equal(mutationCalls[0].options.metadataPatches.length, 0);
  assert.equal(mutationCalls[0].operations?.length || 0, 0);
  const markerContext = prismaticWallTraversalMarker(context, "traversal-exempt");
  resetScene({ exemptCreatureIds: ["target"], resolvedTraversalIds: ["traversal-exempt"] });
  await assert.rejects(
    executeSpellActiveResolution({
      payload: activePayload("prismatic-wall-traversal", context),
      targetIds: ["target"],
      traversalId: "traversal-exempt",
      sceneEpoch: 7,
      isCurrent: () => true,
    }),
    /prismatic-wall-traversal-already-resolved/,
  );
  assert.deepEqual(prismaticWallStateFromCastContext(markerContext).resolvedTraversalIds, ["traversal-exempt"]);
});
