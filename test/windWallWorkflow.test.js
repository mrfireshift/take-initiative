import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { buildArea, areaHitsBounds } from "../src/aoeGeometryCore.js";
import { buildEffectsMutationPlan } from "../src/effectsMutationCore.js";
import {
  buildSpellAreaResolutionCommand,
} from "../src/spellAreaResolutionCommandCore.js";
import {
  spellAreaGridCells,
  spellAreaRangeCells,
  constrainedSpellAreaEnd,
} from "../src/spellAreaPlacementCore.js";
import {
  getSpellAreaRuleById,
  getSpellAreaRules,
  validateSpellAreaRule,
} from "../src/spellAreaRules.js";
import {
  getSpellCastResolutionRule,
  spellSaveDamageFactor,
  spellSaveDamageFormula,
} from "../src/spellCastResolutionRules.js";
import { saveSpellResolutionOperations } from "../src/saveSpellOperationsCore.js";
import { planOwnedSceneItemReconcile } from "../src/sceneItemReconcileCore.js";
import {
  SPELL_STATIC_ZONE_META_KEY,
  staticSpellZoneItems,
  staticSpellZoneItemsEndedByPlan,
  staticSpellZoneMetadata,
  staticSpellZoneOwnerOperation,
} from "../src/spellStaticZoneCore.js";
import { spellLifecycleOperations } from "../src/spellLifecycleOperationsCore.js";
import {
  getSpellDefinition,
  getSpellDurationTurns,
  getSpellSummaryParts,
} from "../src/spells-srd.js";
import { buildSpellUnifiedPanelContract } from "../src/spellUnifiedPanelCore.js";
import { buildUnifiedPanelViewModel } from "../src/spellUnifiedPanelViewCore.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const executorSource = fs.readFileSync(
  path.join(root, "src", "spellAreaResolutionExecutor.js"),
  "utf8",
);
const staticZoneSource = fs.readFileSync(
  path.join(root, "src", "spellStaticZone.js"),
  "utf8",
);

function stateToken(id, overrides = {}) {
  return {
    id,
    name: id,
    spells: [],
    concentrations: {},
    conditions: [],
    ...overrides,
  };
}

function windWallPlacement(targetIds = []) {
  return {
    status: "confirmed",
    confirmed: true,
    ruleId: "wind-wall:cast",
    spellId: "wind-wall",
    casterId: "caster",
    targetLocked: true,
    targetIds,
    preview: {
      type: "line",
      start: { x: 0, y: 0 },
      end: { x: 1000, y: 0 },
      gridOrigin: { x: 0, y: 0 },
      dpi: 100,
      widthSquares: 1,
      targetIds,
      targetLocked: true,
    },
  };
}

test("il RAW locale di Muro di Vento alimenta il workflow normalizzato", () => {
  const rawCatalog = JSON.parse(fs.readFileSync(
    path.join(
      root,
      "docs",
      "class-features",
      "raw",
      "incantesimi_manualedelgiocatore_pagine_211_289_BOZZA.json",
    ),
    "utf8",
  ));
  const raw = rawCatalog.find((entry) => entry.nome === "Muro di Vento");
  assert.ok(raw);
  assert.equal(raw.livello, 3);
  assert.equal(raw.tempo_di_lancio, "1 azione");
  assert.equal(raw.gittata, "36 metri");
  assert.equal(raw.durata, "Concentrazione, fino a 1 minuto");
  assert.match(raw.descrizione, /lungo fino a 15 metri, alto 4, 5 metri e spesso 30 cm/i);
  assert.match(raw.descrizione, /percorso continuo/i);
  assert.match(raw.descrizione, /tiro salvezza su Forza/i);
  assert.match(raw.descrizione, /3d8 danni contundenti/i);
  assert.match(raw.descrizione, /metà di quei danni/i);
  assert.match(raw.descrizione, /nebbia, il fumo e gli altri gas/i);
  assert.match(raw.descrizione, /volanti[\s\S]{0,40}Piccola o inferiore/i);
  assert.match(raw.descrizione, /materiali leggeri/i);
  assert.match(raw.descrizione, /proiettili ordinari/i);
  assert.match(raw.descrizione, /macigni scagliati dai giganti o dalle macchine d'assedio/i);
  assert.match(raw.descrizione, /forma gassosa/i);

  const spell = getSpellDefinition("wind-wall");
  assert.equal(spell.concentration, true);
  assert.equal(spell.defaultTurns, 10);
  assert.equal(getSpellDurationTurns(spell), 10);
});

test("Muro di Vento usa linea retta di 15 m, spessore a griglia e placement obbligatorio", () => {
  const rule = getSpellAreaRuleById("wind-wall:cast");
  assert.deepEqual(validateSpellAreaRule(rule), { valid: true, errors: [] });
  assert.equal(rule.kind, "zone");
  assert.deepEqual(rule.geometry.size, {
    value: 15,
    unit: "m",
    measure: "length",
  });
  assert.deepEqual(rule.geometry.width, {
    value: 0.3,
    unit: "m",
    measure: "width",
  });
  assert.deepEqual(rule.placement, {
    origin: "point",
    direction: "pointer",
    anchor: "world",
    range: { value: 36, unit: "m", measure: "range" },
  });
  assert.deepEqual(rule.lifecycle, {
    persistence: "spell",
    endsWithSpell: true,
  });
  assert.deepEqual(rule.zonePolicy.initialSave, { ability: "str" });
  assert.equal(rule.zonePolicy.movement, "fixed");
  assert.deepEqual(rule.zonePolicy.membershipEffects, []);
  assert.deepEqual(rule.zonePolicy.triggers, []);
  assert.equal(getSpellAreaRules("wind-wall", { triggerType: "active-action" }).length, 0);

  assert.equal(spellAreaGridCells(rule.geometry.size), 10);
  assert.equal(spellAreaGridCells(rule.geometry.width), 1);
  assert.equal(spellAreaRangeCells(rule.placement.range), 24);
  assert.deepEqual(
    constrainedSpellAreaEnd({
      shape: "line",
      start: { x: 0, y: 0 },
      pointer: { x: 9999, y: 0 },
      dpi: 100,
      sizeCells: 10,
    }),
    { x: 1000, y: 0 },
  );

  const area = buildArea(
    "line",
    { x: 0, y: 0 },
    { x: 1000, y: 0 },
    100,
    { x: 0, y: 0 },
    { widthSquares: 1 },
  );
  assert.equal(area.squares, 10);
  assert.equal(area.widthSquares, 1);
  assert.equal(areaHitsBounds(area, {
    min: { x: 450, y: 0 },
    max: { x: 550, y: 100 },
  }), true);
  assert.equal(areaHitsBounds(area, {
    min: { x: 450, y: 200 },
    max: { x: 550, y: 300 },
  }), false);
});

test("il contratto presenta il TS Forza e le sole quattro summaryParts operative", () => {
  const spell = getSpellDefinition("wind-wall");
  const summaryParts = getSpellSummaryParts(spell);
  assert.deepEqual(summaryParts, [
    { id: "wind-wall-length", label: "15 m" },
    { id: "wind-wall-ordinary-projectiles", label: "Proiettili ordinari: miss" },
    { id: "wind-wall-no-gas", label: "No gas" },
    { id: "wind-wall-small-flying", label: "Piccoli volanti: no pass" },
  ]);
  assert.equal(summaryParts.some((part) => /3d8|4,?5|30 cm/u.test(part.label)), false);

  const contract = buildSpellUnifiedPanelContract({
    spellId: "wind-wall",
    phase: "cast",
  });
  assert.equal(contract.presentation.placement.policy, "required");
  assert.equal(contract.presentation.inputs.outcomes.required, true);
  assert.equal(contract.presentation.inputs.damage.required, true);
  assert.deepEqual(contract.presentation.outcomes.save, {
    ability: "str",
    label: "Forza",
    timing: "cast",
  });
  assert.deepEqual(contract.presentation.activeActions, []);
  assert.equal(contract.execution.lane, "area-transaction");
  assert.equal(contract.execution.requiresCompositeUndo, true);

  const view = buildUnifiedPanelViewModel({
    contract,
    session: {
      targetIds: ["target"],
      casterId: "caster",
      outcomes: {},
      hpValues: {},
    },
    casterOptions: [{ value: "caster", label: "Caster" }],
    targetCandidates: [{ key: "target", label: "Target", subtitle: "Creatura" }],
  });
  assert.equal(view.targets.outcomes.label, "Esiti TS Forza");
  assert.deepEqual(view.targets.outcomes.save, {
    ability: "str",
    label: "Forza",
    timing: "cast",
  });
});

test("il cast risolve TS indipendenti e un solo danno 3d8 condiviso", () => {
  const spell = getSpellDefinition("wind-wall");
  const castRule = getSpellCastResolutionRule(spell);
  assert.equal(castRule.initialHP, true);
  assert.equal(spellSaveDamageFormula(spell, "failed", 3), "3d8");
  assert.equal(spellSaveDamageFormula(spell, "passed", 3), "3d8");
  assert.equal(castRule.damageByOutcome.failed.type, "contundenti");
  assert.equal(castRule.damageByOutcome.passed.type, "contundenti");
  assert.equal(spellSaveDamageFactor(spell, "failed"), null);
  assert.equal(spellSaveDamageFactor(spell, "passed"), null);

  const contract = buildSpellUnifiedPanelContract({
    spellId: spell.id,
    phase: "cast",
  });
  const targetIds = ["inside", "inside-2"];
  const command = buildSpellAreaResolutionCommand({
    contract,
    spellId: spell.id,
    phase: "cast",
    source: { kind: "cast", sceneEpoch: 3 },
    casterId: "caster",
    slotLevel: 3,
    targetIds,
    candidateTargetIds: targetIds,
    outcomes: { inside: "failed", "inside-2": "passed" },
    placement: windWallPlacement(targetIds),
    targetLocked: true,
    hp: { mode: "damage", amount: 16 },
    sceneEpoch: 3,
    currentSceneEpoch: 3,
    validateSpatial: false,
  });
  assert.equal(command.valid, true, command.errors?.join(", "));
  assert.equal(command.placement.policy, "required");
  assert.deepEqual(command.outcomes.byTarget, {
    inside: "failed",
    "inside-2": "passed",
  });
  assert.deepEqual(command.outcomes.save, { ability: "str" });
  assert.equal(command.hp.amount, 16);
  assert.deepEqual(command.hp.targetIds, targetIds);
  assert.equal(command.hp.outcomeFactors.inside, "full");
  assert.equal(command.hp.outcomeFactors["inside-2"], "half");
  assert.deepEqual(command.resolution.conditionApplications, []);

  const withoutPlacement = buildSpellAreaResolutionCommand({
    contract,
    spellId: spell.id,
    phase: "cast",
    source: { kind: "cast", sceneEpoch: 3 },
    casterId: "caster",
    slotLevel: 3,
    targetIds,
    candidateTargetIds: targetIds,
    outcomes: { inside: "failed", "inside-2": "passed" },
    placement: null,
    targetLocked: true,
    hp: { mode: "damage", amount: 16 },
    sceneEpoch: 3,
    currentSceneEpoch: 3,
    validateSpatial: false,
  });
  assert.equal(withoutPlacement.valid, false);
  assert.ok(withoutPlacement.errors.includes("placement-required"));
});

test("la parent instance concentra 1 minuto e termina con break, expiry, dismiss o rimozione", () => {
  const spell = getSpellDefinition("wind-wall");
  const rule = getSpellAreaRuleById("wind-wall:cast");
  const summaryParts = getSpellSummaryParts(spell);
  const owner = staticSpellZoneOwnerOperation({
    rule,
    spell,
    instanceId: "wind-wall-1",
    casterId: "caster",
    appliedAt: { round: 2, actorId: "caster", phase: "turn" },
    trackConcentration: true,
    slotLevel: 3,
    summaryParts,
  });
  assert.equal(owner.type, "spell:upsert");
  assert.deepEqual(owner.targetIds, ["caster"]);
  assert.equal(owner.turns, 10);
  assert.equal(owner.conc, true);
  assert.deepEqual(owner.expiry, { mode: "concentration" });
  assert.deepEqual(owner.summaryParts, summaryParts);
  assert.deepEqual(owner.castContext, {
    staticZoneOwner: true,
    staticZoneRuleId: "wind-wall:cast",
    slotLevel: 3,
  });

  const lifecycle = saveSpellResolutionOperations({
    resolution: {
      valid: true,
      spellId: spell.id,
      spellName: spell.displayName,
      casterId: "caster",
      spellTargetIds: [],
      concentration: true,
      conditionApplications: [],
    },
    instanceId: "wind-wall-1",
    turns: 10,
    spellExpiry: { mode: "concentration" },
    castContext: {
      staticZoneOwner: true,
      staticZoneRuleId: rule.id,
    },
    summaryParts,
  });
  assert.deepEqual(lifecycle.map((operation) => operation.type), [
    "concentration:break",
    "concentration:register",
  ]);

  const cast = buildEffectsMutationPlan(
    [stateToken("caster")],
    [lifecycle[0], owner, lifecycle[1]],
  );
  const active = cast.states.find((entry) => entry.id === "caster");
  assert.equal(active.spells.length, 1);
  assert.equal(active.spells[0].instanceId, "wind-wall-1");
  assert.equal(active.spells[0].turns, 10);
  assert.equal(active.spells[0].conc, true);
  assert.deepEqual(active.spells[0].expiry, { mode: "concentration" });
  assert.deepEqual(active.spells[0].summaryParts, summaryParts);
  assert.equal(Object.values(active.concentrations)[0].instanceId, "wind-wall-1");
  assert.deepEqual(active.conditions, []);

  const concentrationEnded = buildEffectsMutationPlan(cast.states, [{
    type: "concentration:break",
    casterIds: ["caster"],
    reference: "wind-wall-1",
  }]);
  assert.deepEqual(
    concentrationEnded.states.find((entry) => entry.id === "caster").spells,
    [],
  );
  assert.deepEqual(
    concentrationEnded.states.find((entry) => entry.id === "caster").concentrations,
    {},
  );

  const expired = buildEffectsMutationPlan(cast.states, [{
    type: "spell:adjust",
    targetIds: ["caster"],
    delta: -10,
  }]);
  assert.deepEqual(expired.states.find((entry) => entry.id === "caster").spells, []);
  assert.deepEqual(
    expired.states.find((entry) => entry.id === "caster").concentrations,
    {},
  );

  const dismissed = buildEffectsMutationPlan(
    cast.states,
    spellLifecycleOperations({
      targetIds: ["caster"],
      casterId: "caster",
      name: spell.displayName,
      concentration: true,
      instanceId: "wind-wall-1",
      spellId: spell.id,
      concentrationAction: "dismiss",
      concentrationReference: "wind-wall-1",
    }),
  );
  assert.deepEqual(dismissed.states.find((entry) => entry.id === "caster").spells, []);
  assert.deepEqual(
    dismissed.states.find((entry) => entry.id === "caster").concentrations,
    {},
  );

  const removed = buildEffectsMutationPlan(cast.states, [
    { type: "concentration:break", casterIds: ["caster"], reference: "wind-wall-1" },
    { type: "spell:remove-instance", targetIds: ["caster"], instanceId: "wind-wall-1" },
  ]);
  assert.deepEqual(removed.states.find((entry) => entry.id === "caster").spells, []);
  assert.deepEqual(
    removed.states.find((entry) => entry.id === "caster").concentrations,
    {},
  );
});

test("la zona statica ha confine visuale, identity per instance e reconcile senza duplicati", () => {
  const metadata = (role, parentId = "") => staticSpellZoneMetadata({
    instanceId: "wind-wall-1",
    ruleId: "wind-wall:cast",
    spellId: "wind-wall",
    casterId: "caster",
    role,
    parentId,
  });
  const zoneItems = [
    { id: "wind-root", metadata: { [SPELL_STATIC_ZONE_META_KEY]: metadata("root") } },
    {
      id: "wind-geometry",
      metadata: {
        [SPELL_STATIC_ZONE_META_KEY]: metadata("geometry", "wind-root"),
      },
    },
  ];
  assert.deepEqual(
    staticSpellZoneItems(zoneItems, { instanceId: "wind-wall-1" }).map((item) => item.id),
    ["wind-root", "wind-geometry"],
  );
  assert.deepEqual(
    staticSpellZoneItemsEndedByPlan(zoneItems, {
      changes: [{
        before: {
          spells: [{ instanceId: "wind-wall-1" }],
          concentrations: {},
        },
        after: {
          spells: [],
          concentrations: {},
        },
      }],
    }).map((item) => item.id),
    ["wind-root", "wind-geometry"],
  );

  const identity = (item) => {
    const entry = item?.metadata?.[SPELL_STATIC_ZONE_META_KEY];
    return entry ? entry.instanceId + ":" + entry.role : "";
  };
  const reconcile = planOwnedSceneItemReconcile({
    desired: [
      { identity: "wind-wall-1:root" },
      { identity: "wind-wall-1:geometry" },
    ],
    existing: [
      ...zoneItems,
      { id: "wind-geometry-duplicate", metadata: {
        [SPELL_STATIC_ZONE_META_KEY]: metadata("geometry", "wind-root"),
      } },
    ],
    identityOfDesired: (desired) => desired.identity,
    identityOfItem: identity,
    isCompatible: () => true,
    needsUpdate: () => false,
  });
  assert.deepEqual(reconcile.additions, []);
  assert.deepEqual(reconcile.deleteIds, ["wind-geometry-duplicate"]);
  assert.match(staticZoneSource, /buildCellBoundaryLoops/);
  assert.match(staticZoneSource, /buildStaticSpellZoneItems/);
  assert.match(executorSource, /withItemMetaHistory/);
  assert.match(executorSource, /sceneItemIds: plan\.staticZoneSceneItemIds/);
  assert.match(executorSource, /runEffectsMutation/);
});

