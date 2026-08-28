import test, { mock } from "node:test";
import assert from "node:assert/strict";

import {
  DELAYED_BLAST_FIREBALL_ID,
  buildDelayedBlastFireballTerminalCommand,
  delayedBlastFireballBaseDice,
  delayedBlastFireballCastContext,
  delayedBlastFireballCurrentDice,
  delayedBlastFireballSummaryParts,
} from "../src/delayedBlastFireballRules.js";

const sdkStub = {
  onReady() {},
  room: { id: "dbf-test-room", getMetadata: async () => ({}) },
  player: { getRole: async () => "GM" },
  scene: {
    getMetadata: async () => ({}),
    items: {
      getItems: async () => [],
      getItemBounds: async () => null,
      updateItems: async () => {},
      addItems: async () => {},
      deleteItems: async () => {},
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

const fluentPathMock = () => {
  const node = {};
  for (const method of [
    "commands", "fillRule", "fillColor", "fillOpacity", "strokeColor",
    "strokeOpacity", "strokeWidth", "position", "locked", "disableHit",
    "layer", "metadata", "name", "visible", "zIndex",
  ]) node[method] = () => node;
  node.build = () => ({ id: "dbf-test-path" });
  return node;
};

mock.module("@owlbear-rodeo/sdk", {
  exports: {
    default: sdkStub,
    buildPath: fluentPathMock,
    buildLabel: () => ({ build: () => ({ id: "dbf-test-label" }) }),
    buildImage: () => ({ build: () => ({ id: "dbf-test-image" }) }),
    buildText: () => ({ build: () => ({ id: "dbf-test-text" }) }),
    buildShape: () => ({ build: () => ({ id: "dbf-test-shape" }) }),
    Command: { MOVE: 0, LINE: 1, CUBIC: 2, CLOSE: 3 },
  },
});

const { buildEffectsMutationPlan } = await import("../src/effectsMutationCore.js");
const { buildTerminationResumeOperation } = await import("../src/spellTerminationGatewayCore.js");
const {
  buildDelayedBlastFireballTerminalResolutionCommand,
  getDelayedBlastFireballTerminalContext,
} = await import("../src/delayedBlastFireballResolutionCore.js");
const { getSpellDefinition } = await import("../src/spells-srd.js");
const { getSpellAreaRuleById } = await import("../src/spellAreaRules.js");

const META_KEY = "com.thebigpicture.initiative/meta";
const AOE_AREA_META_KEY = "com.thebigpicture.initiative/aoeArea";
const SPELL_STATIC_ZONE_META_KEY = "com.thebigpicture.initiative/spellStaticZone";

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

function dbfState({
  instanceId = "dbf-1",
  slotLevel = 7,
  accumulatedDice = 0,
  turns = 10,
  expiry = { mode: "concentration" },
} = {}) {
  const castContext = delayedBlastFireballCastContext({
    slotLevel,
    position: { x: 10, y: 10 },
    spellSaveDC: 16,
    accumulatedDice,
  });
  const spell = {
    id: "dbf-entry",
    name: "Palla di fuoco ritardata",
    spellId: DELAYED_BLAST_FIREBALL_ID,
    turns,
    conc: true,
    casterId: "caster",
    instanceId,
    castContext,
    expiry,
  };
  return [
    stateToken("caster", {
      spells: [spell],
      concentrations: {
        [DELAYED_BLAST_FIREBALL_ID]: {
          name: "Palla di fuoco ritardata",
          spellId: DELAYED_BLAST_FIREBALL_ID,
          instanceId,
          targets: ["caster"],
          castContext,
        },
      },
    }),
  ];
}

function planState(plan, id) {
  return plan.states.find((entry) => entry.id === id);
}

test("DBF RAW e modello canonico: livello, concentrazione, raggio, placement e scaling", () => {
  const spell = getSpellDefinition(DELAYED_BLAST_FIREBALL_ID);
  assert.equal(spell.level, 7);
  assert.equal(spell.concentration, true);
  assert.equal(spell.defaultTurns, 10);
  assert.equal(spell.range, "150 feet");

  const rule = getSpellAreaRuleById(`${DELAYED_BLAST_FIREBALL_ID}:cast`);
  assert.equal(rule.kind, "zone");
  assert.equal(rule.geometry.shape, "circle");
  assert.equal(rule.geometry.size.value, 6);
  assert.equal(rule.placement.origin, "point");
  assert.equal(rule.placement.range.value, 45);
  assert.equal(rule.lifecycle.persistence, "spell");
  assert.equal(rule.lifecycle.endsWithSpell, true);

  assert.equal(delayedBlastFireballBaseDice(7), 12);
  assert.equal(delayedBlastFireballBaseDice(8), 13);
  assert.equal(delayedBlastFireballBaseDice(9), 14);
  assert.deepEqual(delayedBlastFireballSummaryParts({
    slotLevel: 7,
    delayedBlastFireball: { accumulatedDice: 2 },
  }), [
    { id: "delayed-blast-fireball-damage", label: "14d6 fuoco" },
  ]);
});

test("il contesto per-instance conserva posizione, CD, slot e descriptor terminale", () => {
  const context = delayedBlastFireballCastContext({
    slotLevel: 9,
    position: { x: 3, y: 4 },
    spellSaveDC: 18,
  });
  assert.equal(context.slotLevel, 9);
  assert.equal(context.delayedBlastFireball.baseDice, 14);
  assert.equal(context.delayedBlastFireball.accumulatedDice, 0);
  assert.deepEqual(context.delayedBlastFireball.position, { x: 3, y: 4 });
  assert.equal(context.spellSaveDC, 18);
  assert.equal(context.terminalResolution.kind, DELAYED_BLAST_FIREBALL_ID);
  assert.deepEqual(context.terminalResolution.save, { ability: "dex" });
  assert.equal(context.terminalResolution.damage.type, "fuoco");
});

test("fine turno accumula una volta, aggiorna la concentrazione e rispetta il cap", () => {
  let states = dbfState({ slotLevel: 7 });
  const tick = () => buildEffectsMutationPlan(states, [{
    type: "effects:tick-boundaries",
    targetIds: ["caster"],
    boundaries: [{ phase: "end", actorId: "caster", turnKey: "1:0:caster" }],
    operationId: "dbf-boundary",
  }]);

  let plan = tick();
  assert.equal(plan.pendingTerminations?.length || 0, 0);
  assert.equal(plan.terminalAccumulationApplied, true);
  assert.equal(planState(plan, "caster").spells[0].castContext.delayedBlastFireball.accumulatedDice, 1);
  assert.equal(
    planState(plan, "caster").concentrations[DELAYED_BLAST_FIREBALL_ID]
      .castContext.delayedBlastFireball.accumulatedDice,
    1,
  );
  states = plan.states;

  plan = tick();
  assert.equal(planState(plan, "caster").spells[0].castContext.delayedBlastFireball.accumulatedDice, 2);
  states = plan.states;

  plan = buildEffectsMutationPlan(states, [{
    type: "effects:tick-boundaries",
    targetIds: ["caster"],
    boundaries: Array.from({ length: 20 }, (_, index) => ({
      phase: "end",
      actorId: "caster",
      turnKey: `1:${index}:caster`,
    })),
    operationId: "dbf-cap",
  }]);
  assert.equal(planState(plan, "caster").spells[0].castContext.delayedBlastFireball.accumulatedDice, 10);
  assert.equal(delayedBlastFireballCurrentDice(planState(plan, "caster").spells[0].castContext), 22);

  const capped = buildEffectsMutationPlan(dbfState({ accumulatedDice: 10 }), [{
    type: "effects:tick-boundaries",
    targetIds: ["caster"],
    boundaries: [{ phase: "end", actorId: "caster", turnKey: "99:0:caster" }],
  }]);
  assert.equal(capped.terminalAccumulationApplied, undefined);
});

test("round e boundary dello stesso passaggio non perdono né duplicano l'accumulo", () => {
  const plan = buildEffectsMutationPlan(dbfState(), [
    {
      type: "effects:tick-round",
      targetIds: ["caster"],
      delta: -1,
      boundaries: [{ phase: "end", actorId: "caster", turnKey: "2:0:caster" }],
      operationId: "dbf-round-boundary-round",
    },
    {
      type: "effects:tick-boundaries",
      targetIds: ["caster"],
      boundaries: [{ phase: "end", actorId: "caster", turnKey: "2:0:caster" }],
      skipTerminalAccumulation: true,
      operationId: "dbf-round-boundary-boundary",
    },
  ]);
  assert.equal(planState(plan, "caster").spells[0].castContext.delayedBlastFireball.accumulatedDice, 1);
});

test("fine turno normalizza l'identità del caster paragon", () => {
  const plan = buildEffectsMutationPlan(dbfState(), [{
    type: "effects:tick-boundaries",
    targetIds: ["caster"],
    boundaries: [{ phase: "end", actorId: "caster::p2", turnKey: "1:0:caster::p2" }],
    operationId: "dbf-paragon-boundary",
  }]);
  assert.equal(planState(plan, "caster").spells[0].castContext.delayedBlastFireball.accumulatedDice, 1);
});

test("l'ultimo boundary viene applicato prima dell'expiry e crea pending senza cancellare il parent", () => {
  const plan = buildEffectsMutationPlan(dbfState({ turns: 1 }), [{
    type: "effects:tick-round",
    targetIds: ["caster"],
    delta: -1,
    boundaries: [{ phase: "end", actorId: "caster", turnKey: "10:0:caster" }],
    operationId: "dbf-expiry",
  }]);
  const caster = planState(plan, "caster");
  assert.equal(plan.pendingTerminations.length, 1);
  assert.equal(caster.spells.length, 1);
  assert.equal(caster.spells[0].castContext.delayedBlastFireball.accumulatedDice, 1);
  assert.equal(caster.concentrations[DELAYED_BLAST_FIREBALL_ID].pendingTermination.instanceId, "dbf-1");
});

test("una istanza pending non continua ad accumulare", () => {
  const pending = buildEffectsMutationPlan(dbfState(), [{
    type: "concentration:break",
    casterIds: ["caster"],
    reference: "dbf-1",
    reason: "manual",
    requestId: "dbf-terminal-1",
  }]);
  const next = buildEffectsMutationPlan(pending.states, [{
    type: "effects:tick-boundaries",
    targetIds: ["caster"],
    boundaries: [{ phase: "end", actorId: "caster", turnKey: "11:0:caster" }],
  }]);
  assert.equal(planState(next, "caster").spells[0].castContext.delayedBlastFireball.accumulatedDice, 0);
  assert.equal(
    planState(next, "caster").concentrations[DELAYED_BLAST_FIREBALL_ID]
      .pendingTermination.requestId,
    "dbf-terminal-1",
  );
});

test("il percorso della pill conserva pending e continuation prima della rimozione", () => {
  const pending = buildEffectsMutationPlan(dbfState(), [
    {
      type: "concentration:break-targets",
      casterIds: ["caster"],
      reference: "dbf-1",
      targetIds: ["caster"],
      reason: "manual",
      operationId: "dbf-pill-break",
    },
    {
      type: "spell:remove-instance",
      targetIds: ["caster"],
      instanceId: "dbf-1",
      operationId: "dbf-pill-remove",
    },
  ]);
  assert.equal(pending.pendingTerminations.length, 1);
  assert.equal(
    pending.pendingTerminations[0].pendingTermination.continuation.operations.length,
    1,
  );
  const resumed = buildEffectsMutationPlan(pending.states, [
    buildTerminationResumeOperation({
      casterId: "caster",
      instanceId: "dbf-1",
      requestId: pending.pendingTerminations[0].pendingTermination.requestId,
    }),
  ]);
  assert.deepEqual(planState(resumed, "caster").spells, []);
  assert.deepEqual(planState(resumed, "caster").concentrations, {});
});

test("il comando terminale congela il tiro corrente e i fattori Dex full/half", () => {
  const command = buildDelayedBlastFireballTerminalCommand({
    casterId: "caster",
    instanceId: "dbf-1",
    requestId: "dbf-terminal-2",
    sceneEpoch: 4,
    slotLevel: 8,
    castContext: delayedBlastFireballCastContext({ slotLevel: 8, accumulatedDice: 3 }),
    position: { x: 10, y: 10 },
    targetIds: ["a", "b"],
    outcomes: { a: "failed", b: "passed" },
    damage: 16,
  });
  assert.equal(command.valid, true);
  assert.equal(command.source.kind, "terminal-resolution");
  assert.equal(command.source.parentInstanceId, "dbf-1");
  assert.equal(command.spell.phase, "terminal");
  assert.equal(command.placement.preview.type, "circle");
  assert.equal(command.placement.preview.position.x, 10);
  assert.equal(command.placement.preview.end.x, 14);
  assert.deepEqual(command.hp.outcomeFactors, { a: "full", b: "half" });
  assert.equal(command.hp.amount, 16);
  assert.equal(command.execution.lane, "area-transaction");
  assert.equal(command.outcomes.required, true);
});

test("la membership del terminale viene ricalcolata alla posizione corrente della perla", async () => {
  const castContext = delayedBlastFireballCastContext({
    slotLevel: 7,
    position: { x: 0, y: 0 },
    accumulatedDice: 1,
  });
  const root = {
    id: "pearl-root",
    position: { x: 10, y: 0 },
    metadata: {
      [SPELL_STATIC_ZONE_META_KEY]: {
        instanceId: "dbf-1",
        casterId: "caster",
        spellId: DELAYED_BLAST_FIREBALL_ID,
        ruleId: `${DELAYED_BLAST_FIREBALL_ID}:cast`,
        role: "root",
      },
      [AOE_AREA_META_KEY]: {
        type: "circle",
        start: { x: 0, y: 0 },
        end: { x: 4, y: 0 },
        gridOrigin: { x: 0, y: 0 },
        dpi: 1,
        basePosition: { x: 0, y: 0 },
      },
    },
  };
  const items = [
    {
      id: "caster",
      name: "Caster",
      metadata: {
        [META_KEY]: {
          hp: 20,
          hpMax: 20,
          ["com.thebigpicture.initiative/concentration"]: {
            [DELAYED_BLAST_FIREBALL_ID]: {
              instanceId: "dbf-1",
              spellId: DELAYED_BLAST_FIREBALL_ID,
              name: "Palla di fuoco ritardata",
              targets: ["caster"],
              castContext,
            },
          },
          ["com.thebigpicture.initiative/spells"]: [{
            id: "dbf-entry",
            spellId: DELAYED_BLAST_FIREBALL_ID,
            name: "Palla di fuoco ritardata",
            instanceId: "dbf-1",
            casterId: "caster",
            conc: true,
            turns: 5,
            castContext,
          }],
        },
      },
    },
    {
      id: "inside",
      name: "Inside",
      metadata: { [META_KEY]: { hp: 10, hpMax: 10, attitude: "enemy" } },
    },
    {
      id: "outside",
      name: "Outside",
      metadata: { [META_KEY]: { hp: 10, hpMax: 10, attitude: "enemy" } },
    },
    root,
  ];
  const runtime = {
    readAllItems: () => Promise.resolve(items),
    getStaticZoneItems: () => Promise.resolve([root]),
    boundsById: {
      caster: { min: { x: 0, y: 0 }, max: { x: 1, y: 1 }, center: { x: 0.5, y: 0.5 } },
      inside: { min: { x: 9, y: 0 }, max: { x: 10, y: 1 }, center: { x: 9.5, y: 0.5 } },
      outside: { min: { x: 30, y: 0 }, max: { x: 31, y: 1 }, center: { x: 30.5, y: 0.5 } },
    },
  };
  const context = await getDelayedBlastFireballTerminalContext({
    casterId: "caster",
    instanceId: "dbf-1",
    runtime,
  });
  assert.equal(context.valid, true);
  assert.equal(context.currentDice, 13);
  assert.deepEqual(context.targetIds.sort(), ["inside"]);
  assert.deepEqual(context.position, { x: 10, y: 0 });

  const pending = buildEffectsMutationPlan(dbfState(), [{
    type: "concentration:break",
    casterIds: ["caster"],
    reference: "dbf-1",
    requestId: "dbf-live-request",
  }]);
  const built = await buildDelayedBlastFireballTerminalResolutionCommand({
    casterId: "caster",
    instanceId: "dbf-1",
    pendingTermination: pending.pendingTerminations[0].pendingTermination,
    runtime,
  });
  assert.equal(built.command.source.requestId, "dbf-live-request");
  assert.equal(built.command.hp.amount, 13);
});

test("resume terminale rimuove parent/concentrazione una sola volta e isola il recast", () => {
  const first = buildEffectsMutationPlan(dbfState(), [{
    type: "concentration:break",
    casterIds: ["caster"],
    reference: "dbf-1",
    requestId: "dbf-final-request",
  }]);
  const resumed = buildEffectsMutationPlan(first.states, [
    buildTerminationResumeOperation({
      casterId: "caster",
      instanceId: "dbf-1",
      requestId: "dbf-final-request",
    }),
  ]);
  assert.deepEqual(planState(resumed, "caster").spells, []);
  assert.deepEqual(planState(resumed, "caster").concentrations, {});
  const stale = buildEffectsMutationPlan(resumed.states, [
    buildTerminationResumeOperation({
      casterId: "caster",
      instanceId: "dbf-1",
      requestId: "dbf-final-request",
    }),
  ]);
  assert.equal(stale.status, "conflict");
});
