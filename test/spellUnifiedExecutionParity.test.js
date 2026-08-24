import test from "node:test";
import assert from "node:assert/strict";

import { buildSpellUnifiedCatalogEntries } from "../src/spellUnifiedPanelCatalogCore.js";
import {
  buildSpellUnifiedPanelContract,
  buildSpellPanelViewModel,
  createSpellPanelSession,
} from "../src/spellUnifiedPanelCore.js";
import {
  buildSpellUnifiedAreaCommand,
  getSpellUnifiedAreaEligibility,
} from "../src/spellUnifiedAreaAdapter.js";
import {
  buildSpellUnifiedLifecycleRequest,
  getSpellUnifiedLifecycleEligibility,
} from "../src/spellUnifiedLifecycleAdapter.js";
import { buildSpellAreaResolutionCommand } from "../src/spellAreaResolutionCommandCore.js";
import { getSpellDefinition } from "../src/spells-srd.js";
import {
  buildSpellActiveActionPlan,
  getSpellOverviewActions,
} from "../src/spellActiveActionCore.js";
import {
  getSpellUnifiedActiveActionDeclarations,
} from "../src/spellUnifiedPanelCore.js";
import {
  resolveSpellActiveResolutionDamage,
  validateSpellActiveResolutionAction,
} from "../src/spellActiveResolutionCore.js";
import {
  buildSpellUnifiedPreparedResolutionRequest,
} from "../src/spellUnifiedActiveAdapter.js";

const CASTS_WITHOUT_INITIAL_HP = [
  "branding-smite",
  "divine-favor",
  "dream",
  "faithful-hound",
  "fire-shield",
  "flame-blade",
  "phantasmal-killer",
  "produce-flame",
  "vampiric-touch",
];

function targetIdsFor(contract) {
  const inputs = contract.presentation.inputs || {};
  const targeting = contract.presentation.targeting || {};
  const required = inputs.targets?.required === true
    || targeting.mode !== "none"
    || targeting.confirmTargets === true;
  if (!required) return [];
  const maximum = Number.isInteger(inputs.targets?.maximum) && inputs.targets.maximum > 0
    ? inputs.targets.maximum
    : Number.isInteger(targeting.limit?.maximum) && targeting.limit.maximum > 0
      ? targeting.limit.maximum
      : 1;
  const count = contract.spell.id === "chain-lightning" ? Math.min(2, maximum) : 1;
  return Array.from({ length: count }, (_, index) => index ? `target-${index}` : "target");
}

function validContextValue(field) {
  if (Array.isArray(field?.options) && field.options.length) return field.options[0].value;
  if (["number", "integer", "numeric"].includes(field?.type)) return 1;
  if (["boolean", "checkbox"].includes(field?.type)) return true;
  return "current-plane";
}

function syntheticPlacement(contract, targetIds, castContext = {}) {
  const placement = contract.presentation.placement || {};
  const anchorTargetId = contract.presentation.targeting?.areaAnchor === "primary-target"
    ? targetIds[0]
    : "";
  if (placement.policy === "unavailable") return null;
  const rule = placement.rules?.[0] || {};
  if (placement.policy === "automatic") {
    return {
      status: "automatic",
      policy: "automatic",
      ruleId: rule.ruleId || placement.ruleId,
      spellId: contract.spell.id,
      casterId: "caster",
      confirmed: true,
      targetIds,
    };
  }
  const placementResult = {
    status: "confirmed",
    confirmed: true,
    policy: placement.policy,
    ruleId: rule.ruleId || placement.ruleId,
    spellId: contract.spell.id,
    casterId: "caster",
    targetIds,
    targetLocked: true,
    preview: {
      type: rule.shape || "circle",
      start: { x: 0, y: 0 },
      end: { x: 50, y: 0 },
      gridOrigin: { x: 0, y: 0 },
      dpi: 50,
      position: { x: 0, y: 0 },
      ...(anchorTargetId
        ? {
          anchorTargetId,
          anchorOrigin: { x: 0, y: 0 },
        }
        : {}),
      targetIds,
    },
    ...(anchorTargetId ? { anchorTargetId } : {}),
  };
  const composition = contract.presentation.composition;
  if (composition?.required) {
    const selected = castContext[composition.key || "composition"] || {};
    const counts = selected.counts && typeof selected.counts === "object"
      ? selected.counts
      : selected;
    placementResult.preview.positions = (composition.options || []).flatMap((option) => (
      Array.from({ length: Math.max(0, Math.floor(Number(counts?.[option.id]) || 0)) }, (_, index) => ({
        objectSize: option.id,
        ordinal: index,
        position: { x: index * 50, y: index * 50 },
      }))
    ));
  }
  return placementResult;
}

function completeSession(contract, overrides = {}) {
  const inputs = contract.presentation.inputs || {};
  const targetIds = overrides.targetIds || targetIdsFor(contract);
  const contextFields = contract.presentation.targeting?.workflow?.context?.fields || [];
  const targetContext = Object.fromEntries(targetIds.map((targetId) => [
    targetId,
    Object.fromEntries(contextFields
      .filter((field) => field.required === true)
      .map((field) => [field.id, validContextValue(field)])),
  ]));
  const attack = contract.presentation.outcomes?.mode === "attack";
  const composition = contract.presentation.composition;
  const castContext = composition?.required
    ? {
      [composition.key || "composition"]: {
        counts: { tiny: 1 },
      },
    }
    : {};
  return createSpellPanelSession({
    contract,
    casterId: "caster",
    slotLevel: inputs.slot?.required ? contract.presentation.slot.default : null,
    variant: inputs.variant?.required
      ? contract.presentation.variant.options?.[0]?.value
      : contract.presentation.placement?.choices?.[0]?.value || "",
    durationTurns: inputs.duration?.required ? 1 : null,
    targetIds,
    primaryTargetId: inputs.primaryTarget?.required ? targetIds[0] : "",
    outcomes: attack ? {} : Object.fromEntries(targetIds.map((id) => [id, "failed"])),
    attackOutcome: attack ? "hit" : "",
    targetContext,
    castContext,
    placement: syntheticPlacement(contract, targetIds, castContext),
    hpValues: {
      damage: inputs.damage?.required ? 12 : null,
      primaryDamage: inputs.primaryDamage?.required ? 13 : null,
      healing: inputs.healing?.required ? 12 : null,
    },
    activeConcentration: overrides.activeConcentration || null,
    phase: overrides.phase || contract.presentation.phase.selected,
    ...overrides,
  });
}

function commandFor(spellId, overrides = {}) {
  const contract = buildSpellUnifiedPanelContract({
    spellId,
    phase: overrides.phase || "",
    castContext: overrides.castContext || {},
  });
  const session = completeSession(contract, overrides);
  return {
    contract,
    session,
    command: buildSpellUnifiedAreaCommand({
      contract,
      session,
      source: { sceneEpoch: 1 },
      candidateTargetIds: ["target", "target-1", "target-2", "target-3"],
      spatialValidation: {
        primaryDistanceMeters: 1,
        casterDistancesMeters: { target: 1, "target-1": 1, "target-2": 1, "target-3": 1 },
        secondaryDistancesMeters: { "target-1": 1, "target-2": 1, "target-3": 1 },
        pairwiseDistancesMeters: [],
      },
    }),
  };
}

test("il catalogo completo ha un percorso canonico senza whitelist di eccezioni", () => {
  const entries = buildSpellUnifiedCatalogEntries();
  const unhandled = entries
    .map((entry) => {
      const contract = buildSpellUnifiedPanelContract({ spellId: entry.key });
      const lifecycle = getSpellUnifiedLifecycleEligibility(contract);
      const area = getSpellUnifiedAreaEligibility(contract, {});
      return lifecycle.eligible || area.eligible ? null : entry.key;
    })
    .filter(Boolean);

  assert.equal(entries.length, 392);
  assert.deepEqual(unhandled, []);
});

test("ogni cast esposto costruisce una sessione completa e un comando o request valido", () => {
  const failures = [];
  for (const entry of buildSpellUnifiedCatalogEntries()) {
    const contract = buildSpellUnifiedPanelContract({ spellId: entry.key });
    const session = completeSession(contract);
    const lifecycle = getSpellUnifiedLifecycleEligibility(contract);
    const area = getSpellUnifiedAreaEligibility(contract, session);
    const view = buildSpellPanelViewModel(contract, {
      ...session,
      executionGate: { allowed: true },
    });
    if (!view.validation.valid) {
      failures.push({ spellId: entry.key, path: "view", errors: view.validation.errors });
      continue;
    }
    if (lifecycle.eligible) {
      try {
        buildSpellUnifiedLifecycleRequest({ contract, session });
      } catch (error) {
        failures.push({ spellId: entry.key, path: "lifecycle", errors: error.details?.fields || [error.code] });
      }
      continue;
    }
    assert.equal(area.eligible, true, `${entry.key} non ha adapter area eleggibile`);
    const command = buildSpellUnifiedAreaCommand({
      contract,
      session,
      source: { sceneEpoch: 1 },
      candidateTargetIds: ["target", "target-1", "target-2", "target-3"],
      spatialValidation: {
        primaryDistanceMeters: 1,
        casterDistancesMeters: { target: 1, "target-1": 1, "target-2": 1, "target-3": 1 },
        secondaryDistancesMeters: { "target-1": 1, "target-2": 1, "target-3": 1 },
        pairwiseDistancesMeters: [],
      },
    });
    if (!command.valid) failures.push({ spellId: entry.key, path: "area", errors: command.errors });
  }
  assert.deepEqual(failures, []);
});

test("le spell lifecycle senza danno al lancio non espongono un input HP fantasma", () => {
  for (const spellId of CASTS_WITHOUT_INITIAL_HP) {
    const contract = buildSpellUnifiedPanelContract({ spellId });
    assert.equal(
      contract.presentation.inputs.damage.required,
      false,
      `${spellId} richiede erroneamente danno al lancio`,
    );
  }
});

test("i tre attacchi immediati distinguono colpito, mancato e gli effetti on-hit", () => {
  for (const spellId of ["chill-touch", "guiding-bolt", "ray-of-frost"]) {
    const contract = buildSpellUnifiedPanelContract({ spellId });
    assert.equal(contract.presentation.outcomes.mode, "attack", spellId);
    assert.deepEqual(contract.presentation.outcomes.options.map((option) => option.value), ["hit", "miss"]);
    const hit = commandFor(spellId).command;
    assert.equal(hit.valid, true, spellId);
    assert.equal(hit.outcomes.attack, "hit");
    assert.equal(hit.hp.outcomeFactors.target, "full");
    assert.ok(hit.resolution.attackResolution?.effects?.length || hit.resolution.attackResolution?.effect);
    const miss = commandFor(spellId, { attackOutcome: "miss" }).command;
    assert.equal(miss.valid, true, `${spellId} mancato`);
    assert.equal(miss.hp.outcomeFactors.target, "zero");
    assert.equal(miss.resolution.attackResolution?.effects, undefined);
  }
});

test("Riscaldare il Metallo separa cast iniziale e Ripeti calore", () => {
  const initial = commandFor("heat-metal");
  assert.equal(initial.command.valid, true);
  assert.equal(initial.contract.presentation.inputs.damage.required, true);
  assert.equal(initial.contract.presentation.concentration.required, true);
  const actions = getSpellUnifiedActiveActionDeclarations("heat-metal");
  const repeat = actions.find((action) => action.id === "heat-metal-repeat");
  assert.ok(repeat);
  assert.equal(validateSpellActiveResolutionAction(repeat).valid, true);
  const plan = buildSpellActiveActionPlan({
    spell: getSpellDefinition("heat-metal"),
    actionId: "heat-metal-repeat",
    group: { casterId: "caster", instanceId: "heat-1" },
    selectedTargetIds: ["target"],
  });
  assert.equal(plan.valid, true);
  assert.equal(plan.delegatedResolution, true);
  assert.equal(plan.resolutionKind, "single-save");
  assert.deepEqual(plan.operations, []);
});

test("le active action future non bloccano da sole il cast iniziale", () => {
  const zefiro = buildSpellUnifiedPanelContract({ spellId: "xanathar-colpo-dello-zefiro" });
  assert.equal(zefiro.execution.activeResolution, true);
  assert.equal(getSpellUnifiedLifecycleEligibility(zefiro).eligible, true);

  const eyebite = buildSpellUnifiedPanelContract({ spellId: "eyebite" });
  assert.equal(eyebite.execution.activeResolution, true);
  assert.equal(getSpellUnifiedLifecycleEligibility(eyebite).eligible, false);
  assert.equal(eyebite.presentation.inputs.targets.required, true);
  assert.equal(eyebite.presentation.inputs.variant.required, true);
});

test("Fireball, Bane, Chain Lightning, Storm Sphere e Arcane Hand usano il percorso area canonico", () => {
  for (const spellId of [
    "fireball",
    "bane",
    "chain-lightning",
    "xanathar-sfera-della-tempesta",
    "arcane-hand",
  ]) {
    const { command } = commandFor(spellId);
    assert.equal(command.valid, true, spellId);
  }
  const chain = commandFor("chain-lightning").command;
  assert.equal(chain.targeting.primaryTargetId, "target");
  assert.equal(chain.resolution.targeting.maximumSecondaryTargets, 3);
});

test("Esilio accetta planeOrigin testuale nel ViewModel e nel command builder", () => {
  const contract = buildSpellUnifiedPanelContract({ spellId: "banishment" });
  const session = completeSession(contract, {
    targetIds: ["target"],
    targetContext: { target: { planeOrigin: "current-plane" } },
  });
  const view = buildSpellPanelViewModel(contract, session);
  assert.equal(view.validation.errors.includes("target-context-required"), false);
  const command = buildSpellUnifiedAreaCommand({
    contract,
    session,
    source: { sceneEpoch: 1 },
    candidateTargetIds: ["target"],
    spatialValidation: { casterDistancesMeters: { target: 1 } },
  });
  assert.equal(command.valid, true);
  assert.equal(command.targeting.targetContexts.target.planeOrigin, "current-plane");
});

test("Raffica di Spine e Freccia Folgorante hanno un solo percorso prepare → resolve parent-bound", () => {
  for (const spellId of ["phb2014-raffica-di-spine", "phb2014-freccia-folgorante"]) {
    const prepare = buildSpellUnifiedPanelContract({ spellId, phase: "prepare" });
    assert.equal(getSpellUnifiedLifecycleEligibility(prepare).eligible, true, spellId);
    assert.doesNotThrow(() => buildSpellUnifiedLifecycleRequest({
      contract: prepare,
      session: completeSession(prepare, { phase: "prepare" }),
    }));

    const resolve = commandFor(spellId, {
      phase: "resolve",
      activeConcentration: { instanceId: "prepared-1", spellId },
    });
    assert.equal(resolve.command.valid, true, spellId);
    assert.equal(resolve.command.source.kind, "prepared-resolution");
    assert.equal(resolve.command.source.parentInstanceId, "prepared-1");
    assert.ok(resolve.command.phaseResolution);

    const missing = getSpellUnifiedAreaEligibility(resolve.contract, resolve.session);
    assert.equal(missing.eligible, true);
    const staleContract = buildSpellUnifiedPanelContract({ spellId, phase: "resolve" });
    const stale = getSpellUnifiedAreaEligibility(staleContract, {
      phase: "resolve",
      activeConcentration: { instanceId: "prepared-1", spellId: "other-spell" },
    });
    assert.equal(stale.code, "prepared-instance-stale");
  }
});

test("le active action abilitate hanno una delega o un piano di mutazione", () => {
  for (const [spellId, actionId] of [
    ["arcane-sword", "arcane-sword-attack"],
    ["spiritual-weapon", "spiritual-weapon-attack"],
    ["tasha-lama-del-disastro", "blade-of-disaster-attacks"],
  ]) {
    const action = getSpellUnifiedActiveActionDeclarations(spellId)
      .find((candidate) => candidate.id === actionId);
    assert.ok(action, actionId);
    assert.equal(validateSpellActiveResolutionAction(action).valid, true, actionId);
    const plan = buildSpellActiveActionPlan({
      spell: getSpellDefinition(spellId),
      actionId,
      group: { casterId: "caster", instanceId: "instance-1" },
      selectedTargetIds: ["target"],
    });
    assert.equal(plan.valid, true, actionId);
    assert.equal(plan.delegatedResolution, true, actionId);
    if (actionId === "blade-of-disaster-attacks") {
      assert.equal(action.maxAttacks, 2);
      assert.equal(resolveSpellActiveResolutionDamage({
        action,
        slotLevel: 9,
        outcome: "critical",
        roll: 12,
      }).scaledFormula, "12d12");
    }
  }
});

test("la richiesta preparata conserva parent, caster, slot e target anche nel route canonico", () => {
  const action = {
    id: "resolve-prepared",
    type: "resolve",
    subjectMode: "selected",
    requiresTargets: true,
  };
  const request = buildSpellUnifiedPreparedResolutionRequest({
    overview: {
      instanceId: "prepared-1",
      actions: [action],
      context: {
        spellId: "phb2014-raffica-di-spine",
        instanceId: "prepared-1",
        casterId: "caster",
        castContext: { phase: "prepare", slotLevel: 2 },
        targetIds: ["caster"],
        sceneEpoch: 7,
      },
    },
    action,
    targetIds: ["target"],
    sceneEpoch: 7,
  });
  assert.equal(request.status, "request-ready");
  assert.equal(request.request.unifiedPanelRoute.parentInstanceId, "prepared-1");
  assert.deepEqual(request.request.session.targetIds, ["target"]);
});

test("i quattro trucchetti senza slot non producono slot-level-invalid", () => {
  const cases = [
    ["xanathar-creare-falo", []],
    ["xanathar-parola-radiosa", ["target"]],
    ["xanathar-rombo-di-tuono", ["target"]],
    ["tasha-turbine-di-spade", []],
  ];
  for (const [spellId, targetIds] of cases) {
    const contract = buildSpellUnifiedPanelContract({ spellId });
    const command = buildSpellAreaResolutionCommand({
      contract,
      casterId: "caster",
      targetIds,
      outcomes: Object.fromEntries(targetIds.map((id) => [id, "failed"])),
      placement: syntheticPlacement(contract, targetIds),
      slotLevel: null,
    });
    assert.equal(command.errors.includes("slot-level-invalid"), false, spellId);
  }
});

test("il percorso diretto non viene usato quando concentrazione o input richiedono revisione", () => {
  const fireball = buildSpellUnifiedPanelContract({ spellId: "fireball" });
  assert.equal(getSpellUnifiedLifecycleEligibility(fireball).eligible, false);
  const bane = buildSpellUnifiedPanelContract({ spellId: "bane" });
  assert.equal(getSpellUnifiedLifecycleEligibility(bane).eligible, false);
  const self = buildSpellUnifiedPanelContract({ spellId: "divine-favor" });
  assert.equal(getSpellUnifiedLifecycleEligibility(self).eligible, true);
  assert.equal(self.execution.castHasHP, false);
});
