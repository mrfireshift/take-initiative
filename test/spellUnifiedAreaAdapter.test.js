import test from "node:test";
import assert from "node:assert/strict";

import {
  buildSpellUnifiedPanelContract,
  createSpellPanelSession,
} from "../src/spellUnifiedPanelCore.js";
import {
  executeSpellUnifiedArea,
  getSpellUnifiedAreaEligibility,
  SPELL_UNIFIED_AREA_ERROR_CODES,
  SPELL_UNIFIED_AREA_STATUS,
  undoSpellUnifiedArea,
} from "../src/spellUnifiedAreaAdapter.js";

const CASTER_ID = "caster-1";

function setup(spellId, {
  phase = "cast",
  slotLevel = null,
  ...overrides
} = {}) {
  const contract = buildSpellUnifiedPanelContract({ spellId, phase });
  const session = createSpellPanelSession({
    contract,
    casterId: CASTER_ID,
    slotLevel: slotLevel ?? contract.presentation.slot.default,
    ...overrides,
  });
  return { contract, session };
}

function confirmedPlacement(contract, targetIds = []) {
  return {
    state: "confirmed",
    status: "confirmed",
    confirmed: true,
    targetLocked: true,
    ruleId: contract.presentation.placement.ruleId,
    spellId: contract.spell.id,
    casterId: CASTER_ID,
    preview: {
      type: contract.presentation.placement.shape || "circle",
      start: { x: 0, y: 0 },
      end: { x: 150, y: 0 },
      gridOrigin: { x: 0, y: 0 },
      targetIds,
    },
    targetIds,
  };
}

function appliedExecutor(result = {}) {
  return async (command) => ({
    status: SPELL_UNIFIED_AREA_STATUS.APPLIED,
    spellId: command.spell.spellId,
    changedIds: command.targeting.targetIds,
    historyEntryId: "history-1",
    undoAvailable: true,
    hpChanges: [],
    effectChanges: [],
    sceneItemChanges: [],
    triggerChanges: [],
    warnings: [],
    errors: [],
    ...result,
  });
}

test("Palla di fuoco collega placement, esiti, HP e executor condiviso", async () => {
  const { contract, session } = setup("fireball", {
    targetIds: ["target-a", "target-b"],
    outcomes: { "target-a": "failed", "target-b": "passed" },
    hpValues: { damage: 20 },
  });
  const placement = confirmedPlacement(contract, ["target-a", "target-b"]);
  const calls = { spatial: 0, executor: 0 };
  const result = await executeSpellUnifiedArea({
    contract,
    session: { ...session, placement },
    source: { sceneEpoch: 7 },
    candidateTargetIds: ["target-a", "target-b"],
    runtime: {
      getSpatialValidation: async () => {
        calls.spatial += 1;
        return {};
      },
      executor: async (command) => {
        calls.executor += 1;
        assert.equal(command.execution.lane, "area-transaction");
        assert.equal(command.targeting.mode, "geometric");
        assert.equal(command.hp.mode, "damage");
        assert.equal(command.hp.amount, 20);
        assert.deepEqual(command.outcomes.byTarget, {
          "target-a": "failed",
          "target-b": "passed",
        });
        return appliedExecutor()(command);
      },
    },
  });

  assert.equal(getSpellUnifiedAreaEligibility(contract, { ...session, placement }).eligible, true);
  assert.equal(calls.spatial, 1);
  assert.equal(calls.executor, 1);
  assert.equal(result.status, SPELL_UNIFIED_AREA_STATUS.APPLIED);
  assert.equal(result.undoAvailable, true);
  assert.deepEqual(result.targetIds, ["target-a", "target-b"]);
});

test("Anatema usa targeting discreto e conserva gli esiti TS", async () => {
  const { contract, session } = setup("bane", {
    slotLevel: 1,
    targetIds: ["target-a", "target-b", "target-c"],
    outcomes: {
      "target-a": "failed",
      "target-b": "passed",
      "target-c": "immune",
    },
  });
  const result = await executeSpellUnifiedArea({
    contract,
    session,
    candidateTargetIds: ["target-a", "target-b", "target-c"],
    runtime: { executor: appliedExecutor() },
  });

  assert.equal(result.status, SPELL_UNIFIED_AREA_STATUS.APPLIED);
  assert.equal(result.command.targeting.mode, "discrete");
  assert.equal(result.command.placement, null);
  assert.deepEqual(result.command.outcomes.byTarget, {
    "target-a": "failed",
    "target-b": "passed",
    "target-c": "immune",
  });
});

test("Catena di fulmini delega la distanza e il primario alla command lane", async () => {
  const { contract, session } = setup("chain-lightning", {
    slotLevel: 6,
    targetIds: ["primary", "secondary"],
    primaryTargetId: "primary",
    outcomes: { primary: "failed", secondary: "passed" },
    hpValues: { damage: 20 },
  });
  const result = await executeSpellUnifiedArea({
    contract,
    session,
    runtime: {
      getSpatialValidation: async () => ({
        primaryDistanceMeters: 20,
        secondaryDistancesMeters: { secondary: 5 },
      }),
      executor: appliedExecutor(),
    },
  });

  assert.equal(result.status, SPELL_UNIFIED_AREA_STATUS.APPLIED);
  assert.equal(result.command.targeting.primaryTargetId, "primary");
  assert.equal(result.command.targeting.spatialValidation.primaryDistanceMeters, 20);
  assert.equal(result.command.resolution.targeting.maximumSecondaryTargets, 3);
});

test("Cura ferite di massa produce HP heal senza duplicare la regola", async () => {
  const { contract, session } = setup("mass-cure-wounds", {
    slotLevel: 5,
    targetIds: ["ally-a", "ally-b"],
    hpValues: { healing: 12 },
  });
  const placement = confirmedPlacement(contract, ["ally-a", "ally-b"]);
  const result = await executeSpellUnifiedArea({
    contract,
    session: { ...session, placement },
    candidateTargetIds: ["ally-a", "ally-b"],
    runtime: { executor: appliedExecutor() },
  });

  assert.equal(result.status, SPELL_UNIFIED_AREA_STATUS.APPLIED);
  assert.equal(result.command.hp.mode, "heal");
  assert.equal(result.command.hp.amount, 12);
});

test("il perimetro area distingue prepare lifecycle, resolve parent-bound e active", () => {
  for (const spellId of [
    "xanathar-sfera-della-tempesta",
    "arcane-hand",
    "xanathar-investitura-della-fiamma",
  ]) {
    const { contract, session } = setup(spellId);
    assert.equal(getSpellUnifiedAreaEligibility(contract, session).eligible, true, spellId);
  }

  const prepared = setup("phb2014-raffica-di-spine", { phase: "prepare" });
  assert.equal(getSpellUnifiedAreaEligibility(prepared.contract, prepared.session).eligible, false);
  assert.equal(
    getSpellUnifiedAreaEligibility(prepared.contract, prepared.session).code,
    SPELL_UNIFIED_AREA_ERROR_CODES.LANE_NOT_SUPPORTED,
  );

  const resolved = setup("phb2014-raffica-di-spine", {
    phase: "resolve",
    slotLevel: 2,
    activeConcentration: {
      instanceId: "prepared-1",
      spellId: "phb2014-raffica-di-spine",
    },
    targetIds: ["target-a"],
    outcomes: { "target-a": "failed" },
    hpValues: { damage: 12 },
  });
  const resolvedSession = {
    ...resolved.session,
    placement: confirmedPlacement(resolved.contract, ["target-a"]),
  };
  assert.equal(
    getSpellUnifiedAreaEligibility(resolved.contract, resolvedSession).eligible,
    true,
  );
  assert.equal(
    getSpellUnifiedAreaEligibility(resolved.contract, {
      ...resolvedSession,
      activeConcentration: null,
    }).code,
    SPELL_UNIFIED_AREA_ERROR_CODES.PREPARED_INSTANCE_REQUIRED,
  );
  assert.equal(
    getSpellUnifiedAreaEligibility(resolved.contract, {
      ...resolvedSession,
      activeConcentration: { instanceId: "prepared-1", spellId: "other-spell" },
    }).code,
    SPELL_UNIFIED_AREA_ERROR_CODES.PREPARED_INSTANCE_STALE,
  );

  const active = setup("arcane-hand", { activeActionId: "arcane-hand-forceful" });
  assert.equal(getSpellUnifiedAreaEligibility(active.contract, active.session).eligible, false);
  assert.equal(
    getSpellUnifiedAreaEligibility(active.contract, active.session).code,
    SPELL_UNIFIED_AREA_ERROR_CODES.ACTIVE_ACTION_NOT_SUPPORTED,
  );
});

test("i risultati persistenti espongono la kind normalizzata per zona, aura e pedina", async () => {
  const zone = setup("xanathar-sfera-della-tempesta", {
    targetIds: ["target-a"],
    outcomes: { "target-a": "failed" },
    hpValues: { damage: 5 },
  });
  const zoneResult = await executeSpellUnifiedArea({
    contract: zone.contract,
    session: {
      ...zone.session,
      placement: confirmedPlacement(zone.contract, ["target-a"]),
    },
    candidateTargetIds: ["target-a"],
    runtime: {
      executor: async (command) => appliedExecutor({
        instanceId: "zone-instance",
        sceneItemChanges: [{ id: "zone-root" }],
      })(command),
    },
  });
  assert.equal(zoneResult.status, SPELL_UNIFIED_AREA_STATUS.APPLIED);
  assert.equal(zoneResult.persistent.kind, "zone");
  assert.equal(zoneResult.persistent.instanceId, "zone-instance");

  const aura = setup("xanathar-investitura-della-fiamma");
  const auraResult = await executeSpellUnifiedArea({
    contract: aura.contract,
    session: aura.session,
    runtime: {
      executor: async (command) => appliedExecutor({
        instanceId: "aura-instance",
      })(command),
    },
  });
  assert.equal(auraResult.status, SPELL_UNIFIED_AREA_STATUS.APPLIED);
  assert.equal(auraResult.persistent.kind, "aura");

  const token = setup("arcane-hand");
  const tokenResult = await executeSpellUnifiedArea({
    contract: token.contract,
    session: {
      ...token.session,
      placement: {
        ...confirmedPlacement(token.contract),
        preview: { position: { x: 30, y: 40 }, targetIds: [] },
      },
    },
    runtime: {
      executor: async (command) => appliedExecutor({
        instanceId: "token-instance",
        sceneItemChanges: [{ id: "token-item" }],
      })(command),
    },
  });
  assert.equal(tokenResult.status, SPELL_UNIFIED_AREA_STATUS.APPLIED);
  assert.equal(tokenResult.persistent.kind, "board-token");
});

test("un trigger di zona entra nella stessa transazione area con bersagli bloccati", async () => {
  const { contract, session } = setup("xanathar-sfera-della-tempesta", {
    targetIds: ["target-a"],
    outcomes: { "target-a": "failed" },
    hpValues: { damage: 7 },
    triggerRuntime: {
      id: "zone-instance:storm-sphere-save-on-turn-end:turn:1:1",
      instanceId: "zone-instance",
      ruleId: "xanathar-sfera-della-tempesta:cast",
      spellId: "xanathar-sfera-della-tempesta",
      casterId: CASTER_ID,
      triggerId: "storm-sphere-save-on-turn-end",
      event: "turn-end",
      resolution: "manual-save",
      targetIds: ["target-a"],
      targetLocked: true,
      damage: { dice: "2d6" },
    },
    placement: {
      state: "confirmed",
      status: "confirmed",
      confirmed: true,
      targetLocked: true,
      ruleId: "xanathar-sfera-della-tempesta:cast",
      spellId: "xanathar-sfera-della-tempesta",
      casterId: CASTER_ID,
      targetIds: ["target-a"],
    },
  });
  const result = await executeSpellUnifiedArea({
    contract,
    session,
    candidateTargetIds: ["target-a"],
    source: { sceneEpoch: 3 },
    runtime: {
      executor: async (command) => {
        assert.equal(command.source.kind, "zone-trigger");
        assert.equal(command.execution.zoneTrigger.instanceId, "zone-instance");
        assert.equal(command.targeting.locked, true);
        return appliedExecutor()(command);
      },
    },
  });
  assert.equal(result.status, SPELL_UNIFIED_AREA_STATUS.APPLIED);
  assert.equal(result.command.source.kind, "zone-trigger");
  assert.equal(result.command.source.activationId, session.triggerRuntime.id);
});

test("un comando incompleto non raggiunge l'executor", async () => {
  const { contract, session } = setup("fireball", {
    targetIds: ["target-a"],
    outcomes: { "target-a": "failed" },
  });
  let executorCalls = 0;
  const result = await executeSpellUnifiedArea({
    contract,
    session,
    candidateTargetIds: ["target-a"],
    runtime: {
      executor: async () => {
        executorCalls += 1;
        return { status: "applied" };
      },
    },
  });

  assert.equal(result.status, SPELL_UNIFIED_AREA_STATUS.REJECTED);
  assert.equal(result.errors.some((error) => error.code === "placement-required"), true);
  assert.equal(result.errors.some((error) => error.code === "hp-required"), true);
  assert.equal(executorCalls, 0);
});

test("la validazione spaziale fallita interrompe prima dell'executor", async () => {
  const { contract, session } = setup("bane", {
    slotLevel: 1,
    targetIds: ["target-a"],
    outcomes: { "target-a": "failed" },
  });
  let executorCalls = 0;
  const result = await executeSpellUnifiedArea({
    contract,
    session,
    runtime: {
      getSpatialValidation: async () => {
        const error = new Error("distanza non disponibile");
        error.code = SPELL_UNIFIED_AREA_ERROR_CODES.SPATIAL_VALIDATION_FAILED;
        throw error;
      },
      executor: async () => {
        executorCalls += 1;
        return { status: "applied" };
      },
    },
  });

  assert.equal(result.status, SPELL_UNIFIED_AREA_STATUS.REJECTED);
  assert.equal(result.errors[0].code, SPELL_UNIFIED_AREA_ERROR_CODES.SPATIAL_VALIDATION_FAILED);
  assert.equal(executorCalls, 0);
});

test("undo separa capability dichiarata e disponibilità runtime", async () => {
  const { contract, session } = setup("fireball", {
    undoState: { state: "unavailable", available: false },
  });
  assert.equal(contract.execution.undo.capable, true);
  const unavailable = await undoSpellUnifiedArea({
    session,
    runtime: {
      undoHistoryThrough: async () => {
        throw new Error("non dovrebbe essere chiamato");
      },
    },
  });
  assert.equal(unavailable.status, SPELL_UNIFIED_AREA_STATUS.REJECTED);
  assert.equal(unavailable.errors[0].code, SPELL_UNIFIED_AREA_ERROR_CODES.UNDO_UNAVAILABLE);

  const entries = [{ changes: [{ id: "target-a" }] }];
  entries.status = "applied";
  const available = await undoSpellUnifiedArea({
    session: {
      ...session,
      undoState: {
        state: "available",
        available: true,
        activationId: "history-1",
      },
    },
    runtime: {
      undoHistoryThrough: async (entryId) => {
        assert.equal(entryId, "history-1");
        return entries;
      },
    },
  });
  assert.equal(available.status, SPELL_UNIFIED_AREA_STATUS.UNDONE);
  assert.deepEqual(available.changedIds, ["target-a"]);
});

test("undo del pannello usa la catena cronologica e non rimuove una entry intermedia", async () => {
  const { session } = setup("fireball", {
    undoState: {
      state: "available",
      available: true,
      activationId: "history-1",
    },
  });
  const entries = [{ changes: [{ id: "target-a" }] }];
  entries.status = "applied";
  let exactCalls = 0;
  let throughCalls = 0;
  const result = await undoSpellUnifiedArea({
    session,
    runtime: {
      undoHistoryEntry: async () => {
        exactCalls += 1;
        return entries;
      },
      undoHistoryThrough: async (entryId) => {
        throughCalls += 1;
        assert.equal(entryId, "history-1");
        return entries;
      },
    },
  });
  assert.equal(result.status, SPELL_UNIFIED_AREA_STATUS.UNDONE);
  assert.equal(exactCalls, 0);
  assert.equal(throughCalls, 1);
});
