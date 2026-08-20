import assert from "node:assert/strict";
import test, { mock } from "node:test";

const sdkStub = {
  onReady() {},
  room: { id: "test-room", getMetadata: async () => ({}) },
  player: { getRole: async () => "GM" },
  scene: {
    isReady: async () => true,
    getMetadata: async () => ({}),
    grid: {
      getDpi: async () => 150,
      getScale: async () => ({ parsed: { multiplier: 1.5, unit: "m" } }),
    },
    local: {
      getItems: async () => [],
      deleteItems: async () => {},
      addItems: async () => {},
    },
    items: {
      getItems: async () => [],
      updateItems: async () => {},
    },
  },
  broadcast: {
    onMessage: () => () => {},
    sendMessage: async () => {},
  },
};

const fluentPathMock = () => {
  const node = {};
  const methods = [
    "commands", "fillRule", "fillColor", "fillOpacity", "strokeColor",
    "strokeOpacity", "strokeWidth", "position", "locked", "disableHit",
    "layer", "metadata", "name", "visible", "zIndex",
  ];
  for (const m of methods) node[m] = () => node;
  node.build = () => ({ id: "mock-path", type: "PATH" });
  return node;
};

mock.module("@owlbear-rodeo/sdk", {
  exports: {
    default: sdkStub,
    buildLabel: (...args) => ({ type: "LABEL", args, build: () => ({ id: "mock-label" }) }),
    buildImage: (...args) => ({ type: "IMAGE", args, build: () => ({ id: "mock-image" }) }),
    buildPath: fluentPathMock,
    buildText: (...args) => ({ type: "TEXT", args, build: () => ({ id: "mock-text" }) }),
    buildShape: (...args) => ({ type: "SHAPE", args, build: () => ({ id: "mock-shape" }) }),
    Command: { MOVE: 0, LINE: 1, CUBIC: 2, CLOSE: 3 },
  },
});

const { getSpellDefinition } = await import("../src/spells-srd.js");
const { buildSpellApplicationIntent, buildSpellApplicationPlan } = await import("../src/spellApplicationPlanCore.js");
const { buildEffectsMutationPlan } = await import("../src/effectsMutationCore.js");
const { buildCoordinatedEffectsUndoPlan } = await import("../src/effectsMutationUndoCore.js");

const state = (plan, id) => plan.states.find((entry) => entry.id === id);

function preparedOperations(operations, prefix = "test-op") {
  return operations.map((operation, index) => {
    const operationId = `${prefix}-${index}`;
    const targetIds = operation.targetIds || [];
    if (operation.type === "spell:upsert") {
      return {
        ...operation,
        operationId,
        entryIds: Object.fromEntries(targetIds.map((id) => [id, `${operationId}:entry:${id}`])),
      };
    }
    if (operation.type === "condition:add") {
      return {
        ...operation,
        operationId,
        createdAt: 100 + index,
        instanceIds: Object.fromEntries(targetIds.map((id) => [id, `${operationId}:condition:${id}`])),
      };
    }
    return { ...operation, operationId };
  });
}

function castSpell(spellId, {
  casterId = "caster-1",
  casterName = "Mago Caster",
  targetId = "target-a",
  instanceId = "hideous-laughter-instance-1",
} = {}) {
  const rawSpell = getSpellDefinition(spellId);
  assert.ok(rawSpell, `Spell ${spellId} must exist in catalog`);

  const displayName = spellId === "hideous-laughter" ? "Risata Incontenibile"
    : spellId === "hold-person" ? "Blocca Persone"
    : spellId === "irresistible-dance" ? "Danza Irresistibile di Otto"
    : rawSpell.name;

  const spell = { ...rawSpell, displayName };

  const intent = buildSpellApplicationIntent({
    spell,
    enteredName: displayName,
    casterId,
    targetIds: [targetId],
    turns: 10,
    requestedConcentration: spell.concentration === true,
  });

  const appPlan = buildSpellApplicationPlan({
    intent,
    instanceId,
    casterName,
  });

  const initialItems = [
    { id: casterId, spells: [], conditions: [], concentrations: {} },
    { id: targetId, spells: [], conditions: [] },
  ];

  return {
    spell,
    instanceId,
    casterId,
    targetId,
    plan: buildEffectsMutationPlan(initialItems, preparedOperations(appPlan.operations, `${spellId}-cast`)),
  };
}

test("R1: Initial State — Risata Incontenibile applica Spells, Incapacitato e Prono collegati", () => {
  const { plan, targetId, casterId, instanceId } = castSpell("hideous-laughter");
  const targetState = state(plan, targetId);
  const casterState = state(plan, casterId);

  // Target ha la spell Risata Incontenibile in spells
  assert.equal(targetState.spells.length, 1);
  assert.equal(targetState.spells[0].name, "Risata Incontenibile");
  assert.equal(targetState.spells[0].instanceId, instanceId);
  assert.equal(targetState.spells[0].conc, true);

  // Target ha entrambe le condizioni collegate allo stesso instanceId
  assert.equal(targetState.conditions.length, 2);
  const incapacitated = targetState.conditions.find((c) => c.condition === "Incapacitato");
  const prone = targetState.conditions.find((c) => c.condition === "Prono");

  assert.ok(incapacitated, "Incapacitato must be present");
  assert.ok(prone, "Prono must be present");
  assert.equal(incapacitated.parentEffectId, instanceId);
  assert.equal(prone.parentEffectId, instanceId);
  assert.equal(incapacitated.type, "spell");
  assert.equal(prone.type, "spell");

  // Incapacitato espone i due saveReminder (turn-end e damage)
  assert.ok(Array.isArray(incapacitated.saveReminder));
  assert.equal(incapacitated.saveReminder.length, 2);
  assert.equal(incapacitated.saveReminder[0].timing, "turn-end");
  assert.equal(incapacitated.saveReminder[1].timing, "damage");

  // Caster ha concentrazione attiva su Risata Incontenibile con Target A
  assert.ok(casterState.concentrations["risata incontenibile"]);
  assert.equal(casterState.concentrations["risata incontenibile"].instanceId, instanceId);
  assert.deepEqual(casterState.concentrations["risata incontenibile"].targets, [targetId]);
});

test("R2: Turn-End Repeat Save Success — Rimuove Incapacitato, Prono, Spell Pill e Concentrazione", () => {
  const { plan: castPlan, targetId, casterId } = castSpell("hideous-laughter");
  const targetCastState = state(castPlan, targetId);
  const incapacitated = targetCastState.conditions.find((c) => c.condition === "Incapacitato");
  assert.ok(incapacitated);

  // Target A supera il repeat save di fine turno
  const repeatSavePlan = buildEffectsMutationPlan(castPlan.states, [{
    type: "condition:remove-instances",
    removals: [{ itemId: targetId, instanceId: incapacitated.id }],
  }]);

  const targetAfterSave = state(repeatSavePlan, targetId);
  const casterAfterSave = state(repeatSavePlan, casterId);

  // Target A è completamente pulito: nessuna condizione orfana e nessuno spell record orfano
  assert.equal(targetAfterSave.conditions.length, 0, "All spell-linked conditions (Incapacitato & Prono) must be removed");
  assert.equal(targetAfterSave.spells.length, 0, "Spell pill/record 'Risata Incontenibile' must be removed from target");

  // Concentrazione del caster terminata
  assert.equal(
    Object.keys(casterAfterSave.concentrations || {}).length,
    0,
    "Caster concentration must terminate when the only target saves",
  );
});

test("R3: Damage Repeat Save Success — Rimuove Incapacitato, Prono, Spell Pill e Concentrazione", () => {
  const { plan: castPlan, targetId, casterId } = castSpell("hideous-laughter");
  const targetCastState = state(castPlan, targetId);
  const incapacitated = targetCastState.conditions.find((c) => c.condition === "Incapacitato");
  assert.ok(incapacitated);

  // Simulo risoluzione reminder per danno con esito 'passed'
  const repeatSavePlan = buildEffectsMutationPlan(castPlan.states, [{
    type: "condition:remove-instances",
    removals: [{ itemId: targetId, instanceId: incapacitated.id }],
  }]);

  const targetAfterSave = state(repeatSavePlan, targetId);
  const casterAfterSave = state(repeatSavePlan, casterId);

  assert.equal(targetAfterSave.conditions.length, 0);
  assert.equal(targetAfterSave.spells.length, 0);
  assert.equal(Object.keys(casterAfterSave.concentrations || {}).length, 0);
});

test("R4: No Orphan Metadata — Nessun record residuo con instanceId su Target o Caster", () => {
  const { plan: castPlan, targetId, casterId, instanceId } = castSpell("hideous-laughter");
  const targetCastState = state(castPlan, targetId);
  const incapacitated = targetCastState.conditions.find((c) => c.condition === "Incapacitato");
  assert.ok(incapacitated);

  const repeatSavePlan = buildEffectsMutationPlan(castPlan.states, [{
    type: "condition:remove-instances",
    removals: [{ itemId: targetId, instanceId: incapacitated.id }],
  }]);

  const targetAfterSave = state(repeatSavePlan, targetId);
  const casterAfterSave = state(repeatSavePlan, casterId);

  // Controllo exhaustivo di ogni stato residuo con instanceId
  const remainingTargetSpells = targetAfterSave.spells.filter((s) => s.instanceId === instanceId);
  const remainingTargetConditions = targetAfterSave.conditions.filter((c) => c.parentEffectId === instanceId);
  const remainingCasterConcentrations = Object.values(casterAfterSave.concentrations || {}).filter(
    (conc) => conc.instanceId === instanceId,
  );

  assert.equal(remainingTargetSpells.length, 0, "No orphaned spells by instanceId");
  assert.equal(remainingTargetConditions.length, 0, "No orphaned conditions by instanceId");
  assert.equal(remainingCasterConcentrations.length, 0, "No orphaned concentration by instanceId");
});

test("R5: History / Undo — Ripristino atomico di Incapacitato, Prono, Spells e Concentrazione", () => {
  const { plan: castPlan, targetId, casterId } = castSpell("hideous-laughter");
  const targetCastState = state(castPlan, targetId);
  const incapacitated = targetCastState.conditions.find((c) => c.condition === "Incapacitato");
  assert.ok(incapacitated);

  const repeatSavePlan = buildEffectsMutationPlan(castPlan.states, [{
    type: "condition:remove-instances",
    removals: [{ itemId: targetId, instanceId: incapacitated.id }],
  }]);

  // Esegue l'Undo coordinato attraverso il core di History Undo
  const undoPlan = buildCoordinatedEffectsUndoPlan({
    currentStates: repeatSavePlan.states,
    entryOrEntries: [{
      id: "history-repeat-save",
      effectsMutation: {
        changes: repeatSavePlan.changes,
      },
      changes: repeatSavePlan.changes,
    }],
  });

  assert.equal(undoPlan.conflicts.length, 0, "Undo must have no conflicts");

  const targetRestored = state(undoPlan, targetId);
  const casterRestored = state(undoPlan, casterId);

  assert.equal(targetRestored.spells.length, 1);
  assert.equal(targetRestored.spells[0].name, "Risata Incontenibile");
  assert.equal(targetRestored.conditions.length, 2);
  assert.ok(targetRestored.conditions.some((c) => c.condition === "Incapacitato"));
  assert.ok(targetRestored.conditions.some((c) => c.condition === "Prono"));
  assert.ok(casterRestored.concentrations["risata incontenibile"]);
  assert.deepEqual(casterRestored.concentrations["risata incontenibile"].targets, [targetId]);
});

test("R6: Manual Concentration Control — Interruzione manuale da Caster rimuove Spells, Incapacitato e Prono", () => {
  const { plan: castPlan, targetId, casterId, instanceId } = castSpell("hideous-laughter");

  // Caster interrompe manualmente la concentrazione
  const breakConcPlan = buildEffectsMutationPlan(castPlan.states, [{
    type: "concentration:break",
    casterId,
    reference: instanceId,
  }]);

  const targetAfterBreak = state(breakConcPlan, targetId);
  const casterAfterBreak = state(breakConcPlan, casterId);

  assert.equal(targetAfterBreak.spells.length, 0);
  assert.equal(targetAfterBreak.conditions.length, 0);
  assert.equal(Object.keys(casterAfterBreak.concentrations || {}).length, 0);
});

test("R7: Control Spells — Hold Person e Danza Irresistibile mantengono il cleanup invariato", () => {
  // 1. Control Hold Person
  const { plan: holdCast, targetId: holdTarget, casterId: holdCaster } = castSpell("hold-person");
  const holdTargetState = state(holdCast, holdTarget);
  const paralyzed = holdTargetState.conditions.find((c) => c.condition === "Paralizzato");
  assert.ok(paralyzed);

  const holdSavePlan = buildEffectsMutationPlan(holdCast.states, [{
    type: "condition:remove-instances",
    removals: [{ itemId: holdTarget, instanceId: paralyzed.id }],
  }]);
  assert.equal(state(holdSavePlan, holdTarget).conditions.length, 0);
  assert.equal(state(holdSavePlan, holdTarget).spells.length, 0);
  assert.equal(Object.keys(state(holdSavePlan, holdCaster).concentrations || {}).length, 0);

  // 2. Control Irresistible Dance
  const { plan: danceCast, targetId: danceTarget, casterId: danceCaster } = castSpell("irresistible-dance");
  const danceTargetState = state(danceCast, danceTarget);
  assert.equal(danceTargetState.conditions.length, 1);
  const danceCond = danceTargetState.conditions[0];

  const danceSavePlan = buildEffectsMutationPlan(danceCast.states, [{
    type: "condition:remove-instances",
    removals: [{ itemId: danceTarget, instanceId: danceCond.id }],
  }]);
  assert.equal(state(danceSavePlan, danceTarget).conditions.length, 0);
  assert.equal(state(danceSavePlan, danceTarget).spells.length, 0);
  assert.equal(Object.keys(state(danceSavePlan, danceCaster).concentrations || {}).length, 0);
});

test("Caution: Manual removal di Incapacitato termina coerentemente anche parent effect e proneness", () => {
  const { plan: castPlan, targetId, casterId } = castSpell("hideous-laughter");
  const targetCastState = state(castPlan, targetId);
  const incapacitated = targetCastState.conditions.find((c) => c.condition === "Incapacitato");
  assert.ok(incapacitated);

  // Rimozione manuale diretta di Incapacitato
  const manualRemovePlan = buildEffectsMutationPlan(castPlan.states, [{
    type: "condition:remove-instances",
    removals: [{ itemId: targetId, instanceId: incapacitated.id }],
  }]);

  const targetAfterManual = state(manualRemovePlan, targetId);
  const casterAfterManual = state(manualRemovePlan, casterId);

  assert.equal(targetAfterManual.conditions.length, 0);
  assert.equal(targetAfterManual.spells.length, 0);
  assert.equal(Object.keys(casterAfterManual.concentrations || {}).length, 0);
});
