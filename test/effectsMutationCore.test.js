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
