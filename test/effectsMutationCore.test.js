import test from "node:test";
import assert from "node:assert/strict";
import { buildEffectsMutationPlan } from "../src/effectsMutationCore.js";

function token(id, overrides = {}) {
  return {
    id,
    name: id,
    spells: [],
    concentrations: {},
    conditions: [],
    ...overrides,
  };
}

function state(plan, id) {
  return plan.states.find((entry) => entry.id === id);
}

test("un unico piano sostituisce concentrazione, bersagli, spell e condizioni figlie", () => {
  const items = [
    token("caster", {
      concentrations: {
        vecchia: {
          name: "Vecchia",
          instanceId: "old-instance",
          targets: ["old-target"],
        },
      },
    }),
    token("old-target", {
      spells: [{
        id: "old-entry",
        name: "Vecchia",
        turns: 3,
        conc: true,
        casterId: "caster",
        instanceId: "old-instance",
      }],
      conditions: [{
        id: "old-condition",
        condition: "Accecato",
        active: true,
        type: "spell",
        parentEffectId: "old-instance",
      }],
    }),
    token("new-target"),
  ];

  const plan = buildEffectsMutationPlan(items, [
    { type: "concentration:break", casterIds: ["caster"] },
    {
      type: "spell:upsert",
      operationId: "cast",
      targetIds: ["new-target"],
      entryIds: { "new-target": "new-entry" },
      name: "Nuova",
      turns: 10,
      conc: true,
      source: "caster",
      instanceId: "new-instance",
    },
    {
      type: "condition:add",
      operationId: "condition",
      createdAt: 100,
      targetIds: ["new-target"],
      instanceIds: { "new-target": "new-condition" },
      conditionName: "Accecato",
      options: {
        sourceId: "caster",
        parentEffectId: "new-instance",
        type: "spell",
        expiry: { mode: "concentration" },
      },
    },
    {
      type: "concentration:register",
      casterId: "caster",
      targetIds: ["new-target"],
      name: "Nuova",
      instanceId: "new-instance",
    },
  ]);

  assert.deepEqual(new Set(plan.changedIds), new Set(["caster", "old-target", "new-target"]));
  assert.deepEqual(state(plan, "caster").concentrations, {
    nuova: {
      name: "Nuova",
      instanceId: "new-instance",
      targets: ["new-target"],
    },
  });
  assert.deepEqual(state(plan, "old-target").spells, []);
  assert.deepEqual(state(plan, "old-target").conditions, []);
  assert.equal(state(plan, "new-target").spells[0].instanceId, "new-instance");
  assert.equal(state(plan, "new-target").conditions[0].parentEffectId, "new-instance");
});

test("una pill buff collegata alla spell conserva semantica e rimozione manuale indipendente", () => {
  const applied = buildEffectsMutationPlan([token("target")], [
    {
      type: "spell:upsert",
      operationId: "cast",
      targetIds: ["target"],
      entryIds: { target: "spell-entry" },
      name: "Benedizione",
      turns: 10,
      instanceId: "bless-instance",
    },
    {
      type: "condition:add",
      operationId: "effect",
      createdAt: 100,
      targetIds: ["target"],
      instanceIds: { target: "effect-instance" },
      conditionName: "+1d4 Att/TS",
      options: {
        type: "spell",
        parentEffectId: "bless-instance",
        effectId: "attack-save-bonus",
        effectKind: "buff",
        effectDetail: "Aggiunge 1d4 ai tiri.",
        manualRemoval: true,
        expiry: { mode: "concentration" },
      },
    },
  ]);

  assert.deepEqual(state(applied, "target").conditions[0], {
    id: "effect-instance",
    condition: "+1d4 Att/TS",
    active: true,
    targetId: "target",
    expiry: { mode: "concentration" },
    createdAt: 100,
    parentEffectId: "bless-instance",
    type: "spell",
    effectId: "attack-save-bonus",
    effectKind: "buff",
    effectDetail: "Aggiunge 1d4 ai tiri.",
    manualRemoval: true,
  });

  const removed = buildEffectsMutationPlan(applied.states, [{
    type: "condition:remove-instances",
    removals: [{ itemId: "target", instanceId: "effect-instance" }],
  }]);
  assert.equal(state(removed, "target").spells.length, 1);
  assert.deepEqual(state(removed, "target").conditions, []);
});

test("l'automazione rimuove nello stesso piano concentrazione, spell, condizioni figlie e prese", () => {
  const items = [
    token("caster", {
      concentrations: {
        velocita: {
          name: "Velocita",
          instanceId: "spell-1",
          targets: ["target"],
        },
      },
      conditions: [{ id: "stun", condition: "Stordito", active: true }],
    }),
    token("target", {
      spells: [{
        id: "entry",
        name: "Velocita",
        turns: 4,
        conc: true,
        casterId: "caster",
        instanceId: "spell-1",
      }],
      conditions: [{
        id: "spell-condition",
        condition: "Velocizzato",
        active: true,
        type: "spell",
        parentEffectId: "spell-1",
      }],
    }),
    token("grappled", {
      conditions: [{
        id: "grapple",
        condition: "Afferrato",
        active: true,
        sourceId: "caster",
      }],
    }),
  ];

  const plan = buildEffectsMutationPlan(items, [{
    type: "condition:automate",
    subjectIds: ["caster"],
  }]);

  assert.deepEqual(new Set(plan.changedIds), new Set(["caster", "target", "grappled"]));
  assert.deepEqual(state(plan, "caster").concentrations, {});
  assert.deepEqual(state(plan, "target").spells, []);
  assert.deepEqual(state(plan, "target").conditions, []);
  assert.deepEqual(state(plan, "grappled").conditions, []);
});

test("Privo di sensi e Prono vengono pianificati insieme prima della commit", () => {
  const plan = buildEffectsMutationPlan([token("pc")], [{
    type: "condition:add",
    operationId: "zero-hp",
    createdAt: 100,
    targetIds: ["pc"],
    instanceIds: { pc: "unconscious" },
    consequenceInstanceIds: { pc: { prono: "prone" } },
    conditionName: "Privo di sensi",
    options: { type: "hp-zero", expiry: { mode: "manual" } },
  }]);

  assert.deepEqual(
    state(plan, "pc").conditions.map((entry) => [entry.id, entry.condition, entry.type]),
    [
      ["unconscious", "Privo di sensi", "hp-zero"],
      ["prone", "Prono", "automatic"],
    ]
  );
  assert.equal(plan.changes.length, 1);
  assert.equal(plan.changes[0].fields.conditions, true);
});

test("ripetere una rimozione già applicata non produce una seconda mutazione", () => {
  const operation = { type: "concentration:break", casterIds: ["caster"] };
  const first = buildEffectsMutationPlan([
    token("caster", {
      concentrations: {
        prova: { name: "Prova", instanceId: "s1", targets: ["target"] },
      },
    }),
    token("target", {
      spells: [{ id: "e1", name: "Prova", instanceId: "s1", casterId: "caster", conc: true }],
    }),
  ], [operation]);
  const second = buildEffectsMutationPlan(first.states, [operation]);

  assert.ok(first.changes.length > 0);
  assert.equal(second.changes.length, 0);
  assert.deepEqual(second.changedIds, []);
});

test("la scadenza di una spell a concentrazione aggiorna caster e tutti i bersagli nello stesso piano", () => {
  const spell = (id) => ({
    id: `entry-${id}`,
    name: "Trama Ipnotica",
    turns: 1,
    conc: true,
    casterId: "caster",
    instanceId: "hypnotic-pattern",
  });
  const linked = (id) => ({
    id: `condition-${id}`,
    condition: "Incapacitato",
    active: true,
    type: "spell",
    parentEffectId: "hypnotic-pattern",
  });
  const plan = buildEffectsMutationPlan([
    token("caster", {
      concentrations: {
        "trama ipnotica": {
          name: "Trama Ipnotica",
          instanceId: "hypnotic-pattern",
          targets: ["a", "b"],
        },
      },
    }),
    token("a", { spells: [spell("a")], conditions: [linked("a")] }),
    token("b", { spells: [spell("b")], conditions: [linked("b")] }),
  ], [{ type: "spell:adjust", targetIds: ["a", "b"], delta: -1 }]);

  assert.deepEqual(new Set(plan.changedIds), new Set(["caster", "a", "b"]));
  assert.deepEqual(state(plan, "caster").concentrations, {});
  assert.deepEqual(state(plan, "a").spells, []);
  assert.deepEqual(state(plan, "a").conditions, []);
  assert.deepEqual(state(plan, "b").spells, []);
  assert.deepEqual(state(plan, "b").conditions, []);
});

test("terminare una concentrazione su un bersaglio lascia attivi gli altri bersagli", () => {
  const spell = (id) => ({
    id: `entry-${id}`,
    name: "Trama Ipnotica",
    turns: 1,
    conc: true,
    casterId: "caster",
    instanceId: "hypnotic-pattern",
  });
  const linked = (id) => ({
    id: `condition-${id}`,
    condition: "Incapacitato",
    active: true,
    type: "spell",
    parentEffectId: "hypnotic-pattern",
  });
  const plan = buildEffectsMutationPlan([
    token("caster", {
      concentrations: {
        "trama ipnotica": {
          name: "Trama Ipnotica",
          instanceId: "hypnotic-pattern",
          targets: ["a", "b"],
        },
      },
    }),
    token("a", { spells: [spell("a")], conditions: [linked("a")] }),
    token("b", { spells: [spell("b")], conditions: [linked("b")] }),
  ], [{
    type: "concentration:break-targets",
    casterIds: ["caster"],
    reference: "hypnotic-pattern",
    targetIds: ["a"],
  }]);

  assert.deepEqual(state(plan, "caster").concentrations, {
    "trama ipnotica": {
      name: "Trama Ipnotica",
      instanceId: "hypnotic-pattern",
      targets: ["b"],
    },
  });
  assert.deepEqual(state(plan, "a").spells, []);
  assert.deepEqual(state(plan, "a").conditions, []);
  assert.equal(state(plan, "b").spells[0].instanceId, "hypnotic-pattern");
  assert.deepEqual(state(plan, "b").conditions, [linked("b")]);
});

test("rimuovere una condizione target-linked conserva la concentrazione sugli altri bersagli", () => {
  const spell = (id) => ({
    id: `entry-${id}`,
    name: "Trama Ipnotica",
    turns: 10,
    conc: true,
    casterId: "caster",
    instanceId: "hypnotic-pattern",
  });
  const linked = (id) => ({
    id: `condition-${id}`,
    condition: "Incapacitato",
    active: true,
    type: "spell",
    sourceId: "caster",
    parentEffectId: "hypnotic-pattern",
    endsParentOnRemoval: true,
    parentRemoval: "target",
    expiry: { mode: "concentration" },
  });
  const plan = buildEffectsMutationPlan([
    token("caster", {
      concentrations: {
        "trama ipnotica": {
          name: "Trama Ipnotica",
          instanceId: "hypnotic-pattern",
          targets: ["a", "b"],
        },
      },
    }),
    token("a", { spells: [spell("a")], conditions: [linked("a")] }),
    token("b", { spells: [spell("b")], conditions: [linked("b")] }),
  ], [{
    type: "condition:remove-instances",
    removals: [{ itemId: "a", instanceId: "condition-a" }],
  }]);

  assert.deepEqual(state(plan, "caster").concentrations, {
    "trama ipnotica": {
      name: "Trama Ipnotica",
      instanceId: "hypnotic-pattern",
      targets: ["b"],
    },
  });
  assert.deepEqual(state(plan, "a").spells, []);
  assert.deepEqual(state(plan, "a").conditions, []);
  assert.equal(state(plan, "b").spells[0].instanceId, "hypnotic-pattern");
  assert.deepEqual(state(plan, "b").conditions, [linked("b")]);
});

test("le opzioni di fonte e durata vengono materializzate nel piano, non durante la commit", () => {
  const plan = buildEffectsMutationPlan([token("target")], [{
    type: "condition:add",
    operationId: "manual-condition",
    createdAt: 200,
    targetIds: ["target"],
    instanceIds: { target: "condition-1" },
    conditionName: "Accecato",
    options: {
      sourceId: "source",
      sourceName: "Mago",
      turns: 3,
      appliedAt: { round: 2, actorId: "source", phase: "turn" },
    },
  }]);

  assert.deepEqual(state(plan, "target").conditions[0], {
    id: "condition-1",
    condition: "Accecato",
    active: true,
    targetId: "target",
    sourceId: "source",
    sourceName: "Mago",
    expiry: { mode: "rounds", remaining: 3 },
    appliedAt: { round: 2, actorId: "source", phase: "turn" },
    createdAt: 200,
  });
});

test("effects:tick-round aggiorna sia incantesimi che durate delle condizioni a round nello stesso piano", () => {
  const items = [
    token("creature", {
      spells: [{
        id: "spell-1",
        name: "Benedizione",
        turns: 3,
      }],
      conditions: [
        {
          id: "cond-1",
          condition: "Spaventato",
          active: true,
          expiry: { mode: "rounds", remaining: 2 },
        },
        {
          id: "cond-2",
          condition: "Lotta",
          active: true,
          expiry: { mode: "manual" },
        },
      ],
    }),
  ];

  const plan = buildEffectsMutationPlan(items, [{
    type: "effects:tick-round",
    targetIds: ["creature"],
    delta: -1,
  }]);

  assert.deepEqual(plan.changedIds, ["creature"]);
  assert.equal(state(plan, "creature").spells[0].turns, 2);
  assert.equal(state(plan, "creature").conditions.find((c) => c.id === "cond-1").expiry.remaining, 1);
  assert.equal(state(plan, "creature").conditions.find((c) => c.id === "cond-2").expiry.mode, "manual");
});

test("effects:tick-round non consuma una spell a rimozione manuale", () => {
  const cast = buildEffectsMutationPlan([token("target")], [{
    type: "spell:upsert",
    operationId: "pain",
    targetIds: ["target"],
    entryIds: { target: "pain-entry" },
    name: "Parola del Potere Dolore",
    turns: 1,
    instanceId: "pain-instance",
    expiry: { mode: "manual" },
  }]);
  assert.deepEqual(state(cast, "target").spells[0].expiry, { mode: "manual" });

  const plan = buildEffectsMutationPlan(cast.states, [{
    type: "effects:tick-round",
    targetIds: ["target"],
    delta: -1,
  }]);

  assert.equal(state(plan, "target").spells.length, 1);
});

test("Scudo ignora il cambio round e scade solo all'inizio del turno del caster", () => {
  const cast = buildEffectsMutationPlan([
    token("caster"),
    token("target"),
  ], [
    {
      type: "spell:upsert",
      operationId: "shield",
      targetIds: ["target"],
      entryIds: { target: "shield-entry" },
      name: "Scudo",
      turns: 1,
      source: "caster",
      instanceId: "shield-instance",
      expiry: { mode: "turn-start", actor: "source", remaining: 1 },
    },
    {
      type: "condition:add",
      operationId: "shield-effect",
      createdAt: 100,
      targetIds: ["target"],
      instanceIds: { target: "shield-ac" },
      conditionName: "+5 CA",
      options: {
        sourceId: "caster",
        type: "spell",
        parentEffectId: "shield-instance",
        expiry: { mode: "turn-start", actor: "source", remaining: 1 },
      },
    },
  ]);

  assert.deepEqual(state(cast, "target").spells[0].expiry, {
    mode: "turn-start",
    remaining: 1,
    actor: "source",
    actorId: "caster",
  });

  const roundTick = buildEffectsMutationPlan(cast.states, [{
    type: "effects:tick-round",
    targetIds: ["caster", "target"],
    delta: -1,
  }]);
  assert.equal(state(roundTick, "target").spells.length, 1);
  assert.equal(state(roundTick, "target").conditions.length, 1);

  const otherTurn = buildEffectsMutationPlan(roundTick.states, [{
    type: "effects:tick-boundaries",
    targetIds: ["caster", "target"],
    boundaries: [{ phase: "start", actorId: "target" }],
  }]);
  assert.equal(state(otherTurn, "target").spells.length, 1);

  const casterTurn = buildEffectsMutationPlan(otherTurn.states, [{
    type: "effects:tick-boundaries",
    targetIds: ["caster", "target"],
    boundaries: [{ phase: "start", actorId: "caster" }],
  }]);
  assert.deepEqual(state(casterTurn, "target").spells, []);
  assert.deepEqual(state(casterTurn, "target").conditions, []);
});

test("una scadenza sul bersaglio usa la fine del suo turno", () => {
  const item = token("target", {
    spells: [{
      id: "command-entry",
      name: "Comando",
      turns: 1,
      casterId: "caster",
      instanceId: "command-instance",
      expiry: {
        mode: "turn-end",
        actor: "target",
        actorId: "target",
        remaining: 1,
      },
    }],
  });

  const atStart = buildEffectsMutationPlan([item], [{
    type: "effects:tick-boundaries",
    targetIds: ["target"],
    boundaries: [{ phase: "start", actorId: "target" }],
  }]);
  assert.equal(state(atStart, "target").spells.length, 1);

  const atEnd = buildEffectsMutationPlan(atStart.states, [{
    type: "effects:tick-boundaries",
    targetIds: ["target"],
    boundaries: [{ phase: "end", actorId: "target" }],
  }]);
  assert.deepEqual(state(atEnd, "target").spells, []);
});

test("Assorbire Elementi conserva il colpo caricato dopo la scadenza della resistenza", () => {
  const appliedAt = {
    round: 1,
    actorId: "caster",
    phase: "turn",
    turnKey: "1:0:caster",
  };
  const cast = buildEffectsMutationPlan([
    token("caster"),
  ], [
    {
      type: "spell:upsert",
      operationId: "absorb",
      targetIds: ["caster"],
      entryIds: { caster: "absorb-entry" },
      name: "Assorbire Elementi",
      turns: 1,
      source: "caster",
      instanceId: "absorb-instance",
      expiry: { mode: "turn-end", actor: "source", remaining: 1, anchor: "next-turn" },
      appliedAt,
    },
    {
      type: "condition:add",
      operationId: "resistance",
      createdAt: 100,
      targetIds: ["caster"],
      instanceIds: { caster: "resistance-fire" },
      conditionName: "Res. fuoco",
      options: {
        sourceId: "caster",
        type: "spell",
        parentEffectId: "absorb-instance",
        effectKind: "buff",
        appliedAt,
        expiry: { mode: "turn-start", actor: "source", remaining: 1, anchor: "next-turn" },
      },
    },
    {
      type: "condition:add",
      operationId: "charged-hit",
      createdAt: 100,
      targetIds: ["caster"],
      instanceIds: { caster: "charged-fire" },
      conditionName: "+1d6 fuoco in mischia",
      options: {
        sourceId: "caster",
        type: "spell",
        parentEffectId: "absorb-instance",
        effectKind: "buff",
        manualRemoval: true,
        endsParentOnRemoval: true,
        appliedAt,
        expiry: { mode: "turn-end", actor: "source", remaining: 1, anchor: "next-turn" },
      },
    },
  ]);

  const currentTurnEnd = buildEffectsMutationPlan(cast.states, [{
    type: "effects:tick-boundaries",
    targetIds: ["caster"],
    boundaries: [{ phase: "end", actorId: "caster", turnKey: "1:0:caster" }],
  }]);
  assert.equal(state(currentTurnEnd, "caster").spells.length, 1);
  assert.deepEqual(
    state(currentTurnEnd, "caster").conditions.map((condition) => condition.id),
    ["resistance-fire", "charged-fire"]
  );

  const atStart = buildEffectsMutationPlan(currentTurnEnd.states, [{
    type: "effects:tick-boundaries",
    targetIds: ["caster"],
    boundaries: [{ phase: "start", actorId: "caster", turnKey: "2:0:caster" }],
  }]);
  assert.equal(state(atStart, "caster").spells.length, 1);
  assert.deepEqual(
    state(atStart, "caster").conditions.map((condition) => condition.id),
    ["charged-fire"]
  );

  const consumed = buildEffectsMutationPlan(atStart.states, [{
    type: "condition:remove-instances",
    removals: [{ itemId: "caster", instanceId: "charged-fire" }],
  }]);
  assert.deepEqual(state(consumed, "caster").spells, []);
  assert.deepEqual(state(consumed, "caster").conditions, []);

  const atEnd = buildEffectsMutationPlan(atStart.states, [{
    type: "effects:tick-boundaries",
    targetIds: ["caster"],
    boundaries: [{ phase: "end", actorId: "caster", turnKey: "2:0:caster" }],
  }]);
  assert.deepEqual(state(atEnd, "caster").spells, []);
  assert.deepEqual(state(atEnd, "caster").conditions, []);
});

test("una scadenza turn-end non viene rinviata se l'effetto nasce fuori dal turno dell'attore", () => {
  const cast = buildEffectsMutationPlan([
    token("caster"),
    token("target"),
  ], [{
    type: "spell:upsert",
    operationId: "command",
    targetIds: ["target"],
    entryIds: { target: "command-entry" },
    name: "Comando",
    turns: 1,
    source: "caster",
    instanceId: "command-instance",
    expiry: { mode: "turn-end", actor: "target", remaining: 1, anchor: "next-turn" },
    appliedAt: {
      round: 1,
      actorId: "caster",
      phase: "turn",
      turnKey: "1:0:caster",
    },
  }]);

  const targetTurnEnd = buildEffectsMutationPlan(cast.states, [{
    type: "effects:tick-boundaries",
    targetIds: ["caster", "target"],
    boundaries: [{ phase: "end", actorId: "target", turnKey: "1:1:target" }],
  }]);
  assert.deepEqual(state(targetTurnEnd, "target").spells, []);
});

test("una condizione applicata durante il turno del bersaglio ignora quella fine turno", () => {
  const applied = buildEffectsMutationPlan([token("target")], [{
    type: "condition:add",
    operationId: "condition",
    createdAt: 100,
    targetIds: ["target"],
    instanceIds: { target: "condition-entry" },
    conditionName: "Turno limitato",
    options: {
      appliedAt: {
        round: 1,
        actorId: "target",
        phase: "turn",
        turnKey: "1:1:target",
      },
      expiry: { mode: "turn-end", actor: "target", remaining: 1, anchor: "next-turn" },
    },
  }]);

  const currentEnd = buildEffectsMutationPlan(applied.states, [{
    type: "effects:tick-boundaries",
    targetIds: ["target"],
    boundaries: [{ phase: "end", actorId: "target", turnKey: "1:1:target" }],
  }]);
  assert.equal(state(currentEnd, "target").conditions.length, 1);

  const nextEnd = buildEffectsMutationPlan(currentEnd.states, [{
    type: "effects:tick-boundaries",
    targetIds: ["target"],
    boundaries: [{ phase: "end", actorId: "target", turnKey: "2:1:target" }],
  }]);
  assert.deepEqual(state(nextEnd, "target").conditions, []);
});

test("un salto di iniziativa ignora solo la fine del turno di applicazione", () => {
  const cast = buildEffectsMutationPlan([token("caster")], [{
    type: "spell:upsert",
    operationId: "guiding-bolt",
    targetIds: ["caster"],
    entryIds: { caster: "guiding-bolt-entry" },
    name: "Dardo Tracciante",
    turns: 1,
    source: "caster",
    instanceId: "guiding-bolt-instance",
    expiry: { mode: "turn-end", actor: "source", remaining: 1, anchor: "next-turn" },
    appliedAt: {
      round: 1,
      actorId: "caster",
      phase: "turn",
      turnKey: "1:0:caster",
    },
  }]);

  const jumped = buildEffectsMutationPlan(cast.states, [{
    type: "effects:tick-boundaries",
    targetIds: ["caster"],
    boundaries: [
      { phase: "end", actorId: "caster", turnKey: "1:0:caster" },
      { phase: "start", actorId: "caster", turnKey: "2:0:caster" },
      { phase: "end", actorId: "caster", turnKey: "2:0:caster" },
    ],
  }]);
  assert.deepEqual(state(jumped, "caster").spells, []);
});
