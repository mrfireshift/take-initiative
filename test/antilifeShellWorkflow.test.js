import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildEffectsMutationPlan } from "../src/effectsMutationCore.js";
import {
  collectActiveMobileAuras,
  mobileAuraMembershipPlan,
  mobileAuraTargetIds,
} from "../src/spellAuraCore.js";
import { planMobileAuraReminder } from "../src/spellAuraReminderCore.js";
import { getSpellAreaRules, getSpellAreaRuleById, validateSpellAreaRule } from "../src/spellAreaRules.js";
import { buildSpellAreaResolutionCommand } from "../src/spellAreaResolutionCommandCore.js";
import { saveSpellResolutionOperations } from "../src/saveSpellOperationsCore.js";
import { getSpellDefinition, getSpellDurationTurns, getSpellSummaryParts } from "../src/spells-srd.js";
import { spellLifecycleOperations } from "../src/spellLifecycleOperationsCore.js";
import { planOwnedSceneItemReconcile } from "../src/sceneItemReconcileCore.js";
import { buildSpellUnifiedPanelContract } from "../src/spellUnifiedPanelCore.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const controllerSource = fs.readFileSync(
  path.join(root, "src", "spellAuraController.js"),
  "utf8",
);
const executorSource = fs.readFileSync(
  path.join(root, "src", "spellAreaResolutionExecutor.js"),
  "utf8",
);
const auraMetaKey = "meta";
const spellsKey = "spells";

function token(id, { spells = [], conditions = [], attitude = "neutral" } = {}) {
  return {
    id,
    name: id,
    metadata: {
      [auraMetaKey]: {
        [spellsKey]: spells,
        attitude,
        ...(conditions.length
          ? { conditions: { version: 2, instances: conditions } }
          : {}),
      },
    },
  };
}

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

function bounds(x, y, size = 100) {
  return {
    min: { x, y },
    max: { x: x + size, y: y + size },
  };
}

function antilifeCastOperations() {
  const spell = getSpellDefinition("antilife-shell");
  return saveSpellResolutionOperations({
    resolution: {
      valid: true,
      spellId: spell.id,
      spellName: spell.displayName,
      casterId: "caster",
      spellTargetIds: ["caster"],
      concentration: spell.concentration,
      conditionApplications: [],
    },
    instanceId: "anti-1",
    turns: spell.defaultTurns,
    spellExpiry: { mode: "concentration" },
    castContext: { mobileAura: true },
    summaryParts: getSpellSummaryParts(spell),
  });
}

function casterState(plan) {
  return plan.states.find((entry) => entry.id === "caster");
}

test("il RAW locale di Guscio Anti-vita alimenta i fatti normalizzati", () => {
  const rawCatalog = JSON.parse(fs.readFileSync(
    path.join(root, "docs", "class-features", "raw", "incantesimi_manualedelgiocatore_pagine_211_289_BOZZA.json"),
    "utf8",
  ));
  const raw = rawCatalog.find((entry) => entry.nome === "Guscio Anti-vita");
  assert.ok(raw);
  assert.equal(raw.tempo_di_lancio, "1 azione");
  assert.equal(raw.gittata, "Incantatore (raggio di 3 metri)");
  assert.equal(raw.durata, "Concentrazione, fino a 1 ora");
  assert.match(raw.descrizione, /si muove assieme a lui/i);
  assert.match(raw.descrizione, /costrutti e non morti/i);
  assert.match(raw.descrizione, /attraversarla o di protendersi/i);
  assert.match(raw.descrizione, /armi a distanza o armi con portata/i);
  assert.match(raw.descrizione, /l'incantesimo termina/i);

  const spell = getSpellDefinition("antilife-shell");
  assert.equal(spell.range, "Self");
  assert.equal(spell.concentration, true);
  assert.equal(spell.defaultTurns, 600);
  assert.equal(getSpellDurationTurns(spell), 600);
});

test("Guscio Anti-vita usa l'aura mobile shared senza effetti di membership", () => {
  const rule = getSpellAreaRuleById("antilife-shell:cast");
  assert.deepEqual(validateSpellAreaRule(rule), { valid: true, errors: [] });
  assert.equal(rule.kind, "aura");
  assert.deepEqual(rule.geometry.size, {
    value: 3,
    unit: "m",
    measure: "radius",
  });
  assert.deepEqual(rule.placement, {
    origin: "caster",
    direction: "none",
    anchor: "caster",
  });
  assert.deepEqual(rule.lifecycle, {
    persistence: "spell",
    endsWithSpell: true,
  });
  assert.deepEqual(rule.targeting, {
    filter: "all",
    includeCaster: true,
    confirmTargets: false,
  });
  assert.deepEqual(rule.effectPolicy, { mode: "manual-trigger" });
  assert.equal(rule.zonePolicy, undefined);
  assert.equal(rule.triggerPolicy, undefined);
  assert.deepEqual(getSpellAreaRules("antilife-shell", { triggerType: "active-action" }), []);
});

test("il cast persiste la parent instance sul caster con concentrazione, 1 ora e summaryParts", () => {
  const spell = getSpellDefinition("antilife-shell");
  const contract = buildSpellUnifiedPanelContract({ spellId: spell.id, phase: "cast" });
  assert.equal(contract.presentation.inputs.targets.required, false);
  assert.equal(contract.presentation.placement.policy, "automatic");

  const command = buildSpellAreaResolutionCommand({
    contract,
    spellId: spell.id,
    phase: "cast",
    source: { kind: "cast", sceneEpoch: 3 },
    casterId: "caster",
    slotLevel: 5,
    targetIds: [],
    candidateTargetIds: [],
    targetLocked: true,
    placement: null,
    sceneEpoch: 3,
    currentSceneEpoch: 3,
    validateSpatial: false,
  });
  assert.equal(command.valid, true, command.errors?.join(", "));
  assert.equal(command.execution.lane, "area-transaction");
  assert.deepEqual(command.resolution.conditionApplications, []);

  const operations = antilifeCastOperations();
  assert.deepEqual(operations.map((operation) => operation.type), [
    "concentration:break",
    "spell:upsert",
    "concentration:register",
  ]);
  const upsert = operations.find((operation) => operation.type === "spell:upsert");
  assert.deepEqual(upsert.targetIds, ["caster"]);
  assert.equal(upsert.conc, true);
  assert.equal(upsert.turns, 600);
  assert.deepEqual(upsert.expiry, { mode: "concentration" });
  assert.deepEqual(upsert.castContext, { mobileAura: true });
  assert.deepEqual(upsert.summaryParts, [
    { id: "antilife-shell-no-crossing", label: "Non attraversabile" },
  ]);
  assert.equal(operations.some((operation) => operation.type === "condition:add"), false);
  assert.match(executorSource, /mobileAura && placementRule\?\.targeting\?\.confirmTargets === false/);
});

test("il lifecycle shared pulisce Guscio Anti-vita a concentrazione, expiry, dismiss e rimozione", () => {
  const cast = buildEffectsMutationPlan(
    [stateToken("caster")],
    antilifeCastOperations(),
  );
  const active = casterState(cast);
  assert.equal(active.spells.length, 1);
  assert.equal(active.spells[0].instanceId, "anti-1");
  assert.equal(active.spells[0].turns, 600);
  assert.equal(active.spells[0].conc, true);
  assert.deepEqual(active.spells[0].expiry, { mode: "concentration" });
  assert.deepEqual(active.spells[0].castContext, { mobileAura: true });
  assert.deepEqual(active.conditions, []);
  assert.equal(Object.values(active.concentrations)[0].instanceId, "anti-1");

  const concentrationEnded = buildEffectsMutationPlan(cast.states, [{
    type: "concentration:break",
    casterIds: ["caster"],
    reference: "anti-1",
  }]);
  assert.deepEqual(casterState(concentrationEnded).spells, []);
  assert.deepEqual(casterState(concentrationEnded).concentrations, {});

  const expired = buildEffectsMutationPlan(cast.states, [{
    type: "spell:adjust",
    targetIds: ["caster"],
    delta: -600,
  }]);
  assert.deepEqual(casterState(expired).spells, []);
  assert.deepEqual(casterState(expired).concentrations, {});

  const dismissed = buildEffectsMutationPlan(
    cast.states,
    spellLifecycleOperations({
      targetIds: ["caster"],
      casterId: "caster",
      name: "Guscio anti-vita",
      concentration: true,
      instanceId: "anti-1",
      spellId: "antilife-shell",
      concentrationAction: "dismiss",
      concentrationReference: "anti-1",
    }),
  );
  assert.deepEqual(casterState(dismissed).spells, []);
  assert.deepEqual(casterState(dismissed).concentrations, {});

  const removed = buildEffectsMutationPlan(cast.states, [
    { type: "concentration:break", casterIds: ["caster"], reference: "anti-1" },
    { type: "spell:remove-instance", targetIds: ["caster"], instanceId: "anti-1" },
  ]);
  assert.deepEqual(casterState(removed).spells, []);
  assert.deepEqual(casterState(removed).concentrations, {});
});

test("l'aura include il caster come owner/centro ma non applica Condition artificiali", () => {
  const caster = token("caster", {
    spells: [{
      spellId: "antilife-shell",
      instanceId: "anti-1",
      casterId: "caster",
      castContext: { mobileAura: true },
    }],
  });
  const inside = token("inside");
  const outside = token("outside");
  const [aura] = collectActiveMobileAuras([caster], {
    metaKey: auraMetaKey,
    spellsKey,
  });
  assert.equal(aura.rule.kind, "aura");

  const desiredTargetIds = mobileAuraTargetIds({
    aura,
    area: { cells: [{ x: 0, y: 0, width: 300, height: 300 }] },
    metaKey: auraMetaKey,
    candidates: [
      { item: caster, bounds: bounds(100, 100) },
      { item: inside, bounds: bounds(250, 100) },
      { item: outside, bounds: bounds(400, 100) },
    ],
  });
  assert.deepEqual(desiredTargetIds, ["caster", "inside"]);

  const membership = mobileAuraMembershipPlan({
    aura,
    desiredTargetIds,
    items: [caster, inside, outside],
    metaKey: auraMetaKey,
  });
  assert.deepEqual(membership.operations, []);
  assert.deepEqual(caster.metadata[auraMetaKey].conditions, undefined);
  assert.deepEqual(inside.metadata[auraMetaKey].conditions, undefined);
  assert.deepEqual(outside.metadata[auraMetaKey].conditions, undefined);
});

test("Guscio Anti-vita non genera reminder o active action", () => {
  const caster = token("caster", {
    spells: [{
      spellId: "antilife-shell",
      instanceId: "anti-1",
      casterId: "caster",
      castContext: { mobileAura: true },
    }],
  });
  const [aura] = collectActiveMobileAuras([caster], {
    metaKey: auraMetaKey,
    spellsKey,
  });
  const reminder = planMobileAuraReminder({
    aura,
    desiredTargetIds: ["caster"],
    initiativeState: { order: ["caster"], current: 0, round: 1 },
    itemsById: new Map([["caster", caster]]),
    areaPosition: { x: 150, y: 150 },
    now: 1,
  });
  assert.deepEqual(reminder.newActivations, []);
  assert.deepEqual(reminder.notices, []);
  assert.deepEqual(reminder.runtime.pending, []);
  assert.equal(getSpellAreaRules("antilife-shell", { triggerType: "active-action" }).length, 0);
});

test("il confine visuale segue il caster e il reconcile per instance non duplica l'aura", () => {
  assert.match(controllerSource, /\.position\(center\)/);
  assert.match(controllerSource, /\.attachedTo\(aura\.casterId\)/);
  assert.match(controllerSource, /buildArea\(/);
  assert.match(controllerSource, /identityOfDesired: \(desired\) => desired\.aura\.instanceId/);
  assert.match(controllerSource, /reconcileOwnedSceneItems/);

  const visualSpec = (center) => ({
    aura: { instanceId: "anti-1" },
    center,
  });
  const duplicate = planOwnedSceneItemReconcile({
    desired: [visualSpec({ x: 100, y: 100 })],
    existing: [
      { id: "anti-visual-a", metadata: { meta: { instanceId: "anti-1" } } },
      { id: "anti-visual-duplicate", metadata: { meta: { instanceId: "anti-1" } } },
    ],
    identityOfDesired: (desired) => desired.aura.instanceId,
    identityOfItem: (item) => item.metadata?.meta?.instanceId,
    isCompatible: () => true,
    needsUpdate: () => false,
  });
  assert.deepEqual(duplicate.additions, []);
  assert.deepEqual(duplicate.deleteIds, ["anti-visual-duplicate"]);

  const moved = planOwnedSceneItemReconcile({
    desired: [visualSpec({ x: 300, y: 100 })],
    existing: [{
      id: "anti-visual-a",
      center: { x: 100, y: 100 },
      metadata: { meta: { instanceId: "anti-1" } },
    }],
    identityOfDesired: (desired) => desired.aura.instanceId,
    identityOfItem: (item) => item.metadata?.meta?.instanceId,
    isCompatible: () => true,
    needsUpdate: (item, desired) => JSON.stringify(item.center) !== JSON.stringify(desired.center),
  });
  assert.equal(moved.updates.length, 1);
  assert.deepEqual(moved.updates[0].spec.center, { x: 300, y: 100 });
});
