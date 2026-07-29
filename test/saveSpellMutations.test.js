import test from "node:test";
import assert from "node:assert/strict";
import { buildEffectsMutationPlan } from "../src/effectsMutationCore.js";
import { exhaustionLevelFromInstances } from "../src/exhaustionCore.js";
import { resolveSaveSpellResolution } from "../src/saveSpellCore.js";
import {
  saveSpellResolutionOperations,
  saveSpellTriggerResolutionOperations,
} from "../src/saveSpellOperationsCore.js";

function resolutionFor(spell, outcomes = { failed: "failed", passed: "passed" }) {
  return resolveSaveSpellResolution({
    spell,
    casterId: "caster",
    targetIds: Object.keys(outcomes),
    outcomes,
  });
}

function preparedOperations(operations, prefix = "operation") {
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
        consequenceInstanceIds: Object.fromEntries(targetIds.map((id) => [
          id,
          { prono: `${operationId}:automatic:prono:${id}` },
        ])),
      };
    }
    return { ...operation, operationId };
  });
}

function state(plan, id) {
  return plan.states.find((entry) => entry.id === id);
}

test("una risoluzione concentrata produce una sola sequenza break/upsert/register", () => {
  const resolution = resolutionFor({
    id: "web",
    name: "Web",
    displayName: "Ragnatela",
    concentration: true,
    saveAutomation: {
      failed: [{ condition: "Trattenuto", expiry: { mode: "concentration" } }],
    },
  });
  const operations = saveSpellResolutionOperations({
    resolution,
    instanceId: "cast-1",
    casterName: "Mago",
    turns: 600,
    spellExpiry: { mode: "concentration" },
    appliedAt: { round: 2, turnKey: "2:1:caster" },
  });

  assert.deepEqual(operations.map((operation) => operation.type), [
    "concentration:break",
    "spell:upsert",
    "condition:add",
    "concentration:register",
    "condition:automate",
  ]);
  assert.deepEqual(operations[1].targetIds, ["failed"]);
  assert.equal(operations[1].instanceId, "cast-1");
  assert.equal(operations[2].options.parentEffectId, "cast-1");
  assert.equal(operations[2].options.sourceId, "caster");
  assert.deepEqual(operations[2].options.expiry, { mode: "concentration" });
  assert.deepEqual(operations[3].targetIds, ["failed"]);
});

test("riapplicare lo stesso spell estende la concentrazione senza duplicare la condizione", () => {
  const resolution = resolutionFor({
    id: "web",
    name: "Web",
    displayName: "Ragnatela",
    concentration: true,
    saveAutomation: {
      failed: [{ condition: "Trattenuto", expiry: { mode: "concentration" } }],
    },
  }, { target: "failed" });
  const operations = saveSpellResolutionOperations({
    resolution,
    instanceId: "active-web",
    concentrationAction: "extend",
    spellExpiry: { mode: "concentration" },
  });

  assert.deepEqual(operations.map((operation) => operation.type), [
    "spell:upsert",
    "condition:add",
    "concentration:register",
    "condition:automate",
  ]);

  const plan = buildEffectsMutationPlan([
    {
      id: "caster",
      concentrations: {
        ragnatela: {
          name: "Ragnatela",
          spellId: "web",
          instanceId: "active-web",
          targets: ["target"],
        },
      },
      spells: [],
      conditions: [],
    },
    {
      id: "target",
      concentrations: {},
      spells: [{
        id: "existing-spell",
        name: "Ragnatela",
        turns: 600,
        conc: true,
        casterId: "caster",
        instanceId: "active-web",
      }],
      conditions: [{
        id: "existing-condition",
        condition: "Trattenuto",
        active: true,
        sourceId: "caster",
        parentEffectId: "active-web",
        type: "spell",
        expiry: { mode: "concentration" },
      }],
    },
  ], preparedOperations(operations));

  assert.equal(state(plan, "target").conditions.length, 1);
  assert.equal(state(plan, "target").conditions[0].id, "existing-condition");
  assert.deepEqual(state(plan, "caster").concentrations.ragnatela.targets, ["target"]);
});

test("regole indipendenti possono evitare il legame parent con la concentrazione", () => {
  const resolution = resolutionFor({
    id: "wall-of-light",
    name: "Wall of Light",
    displayName: "Muro di Luce",
    concentration: true,
    saveAutomation: {
      failed: [{
        condition: "Accecato",
        expiry: { mode: "rounds", remaining: 10 },
        options: { parentEffectId: "" },
      }],
    },
  }, { failed: "failed" });
  const operations = saveSpellResolutionOperations({
    resolution,
    instanceId: "cast-2",
    spellExpiry: { mode: "concentration" },
  });
  const condition = operations.find((operation) => operation.type === "condition:add");

  assert.equal(condition.options.parentEffectId, "");
  assert.deepEqual(condition.options.expiry, { mode: "rounds", remaining: 10 });
});

test("più condizioni condividono la stessa istanza dello spell", () => {
  const resolution = resolutionFor({
    id: "hypnotic-pattern",
    name: "Hypnotic Pattern",
    displayName: "Trama Ipnotica",
    concentration: true,
    saveAutomation: {
      failed: [
        { condition: "Affascinato", expiry: { mode: "concentration" } },
        { condition: "Incapacitato", expiry: { mode: "concentration" } },
      ],
    },
  }, { first: "failed", second: "failed" });
  const operations = saveSpellResolutionOperations({
    resolution,
    instanceId: "cast-3",
    spellExpiry: { mode: "concentration" },
  });
  const conditions = operations.filter((operation) => operation.type === "condition:add");

  assert.equal(conditions.length, 2);
  assert.ok(conditions.every((operation) => operation.options.parentEffectId === "cast-3"));
  assert.deepEqual(conditions.map((operation) => operation.targetIds), [
    ["first", "second"],
    ["first", "second"],
  ]);
});

test("il builder rifiuta risoluzioni incomplete o prive di instance id", () => {
  const invalid = resolveSaveSpellResolution({
    spell: {
      id: "web",
      name: "Web",
      concentration: true,
      saveAutomation: { failed: ["Trattenuto"] },
    },
    targetIds: ["target"],
    outcomes: {},
  });

  assert.throws(
    () => saveSpellResolutionOperations({ resolution: invalid, instanceId: "cast" }),
    /outcomes-incomplete, caster-required/,
  );
  assert.throws(
    () => saveSpellResolutionOperations({
      resolution: { ...invalid, valid: true, errors: [] },
      instanceId: "",
    }),
    /instance-required/,
  );
});

test("uno spell concentrato viene registrato anche se nessun bersaglio conserva una pill", () => {
  const resolution = resolutionFor({
    id: "web",
    name: "Web",
    displayName: "Ragnatela",
    concentration: true,
    saveAutomation: {
      failed: [{ condition: "Trattenuto", expiry: { mode: "concentration" } }],
    },
  }, { immune: "immune" });

  assert.deepEqual(saveSpellResolutionOperations({
    resolution,
    instanceId: "unused-cast",
    spellExpiry: { mode: "concentration" },
  }).map((operation) => operation.type), [
    "concentration:break",
    "concentration:register",
  ]);
});

test("un effetto conclusivo interrompe la concentrazione senza registrarne una nuova", () => {
  const resolution = resolutionFor({
    id: "holy-weapon",
    name: "Holy Weapon",
    displayName: "Arma Sacra",
    concentration: true,
    saveAutomation: {
      trackOutcomes: [],
      failed: [{
        condition: "Accecato",
        expiry: { mode: "rounds", remaining: 10 },
        options: { parentEffectId: "" },
      }],
    },
  }, { target: "failed" });
  const operations = saveSpellResolutionOperations({
    resolution,
    instanceId: "holy-weapon-burst",
    concentrationAction: "dismiss",
  });

  assert.deepEqual(operations.map((operation) => operation.type), [
    "concentration:break",
    "condition:add",
    "condition:automate",
  ]);
  assert.equal(operations.some((operation) => operation.type === "concentration:register"), false);
  assert.equal(
    operations.find((operation) => operation.type === "condition:add").options.parentEffectId,
    "",
  );
});

test("Fulgore Nauseante accumula e poi rimuove soltanto il proprio Indebolimento", () => {
  const resolution = resolutionFor({
    id: "sickening-radiance",
    name: "Sickening Radiance",
    displayName: "Fulgore Nauseante",
    concentration: true,
    saveAutomation: {
      trackOutcomes: ["failed"],
      failed: [
        {
          condition: "Indebolimento",
          expiry: { mode: "concentration" },
          options: { exhaustionContribution: true },
        },
        {
          condition: "Fulgore: invisibilità inefficace",
          effectId: "sickening-radiance-no-invisibility",
          effectKind: "debuff",
          expiry: { mode: "concentration" },
        },
      ],
    },
  }, { target: "failed" });
  const initial = [
    {
      id: "caster",
      concentrations: {},
      spells: [],
      conditions: [],
    },
    {
      id: "target",
      concentrations: {},
      spells: [],
      conditions: [{
        id: "base-exhaustion",
        condition: "Indebolimento",
        active: true,
        level: 2,
        type: "initiative-card",
      }],
    },
  ];
  const first = buildEffectsMutationPlan(initial, preparedOperations(
    saveSpellResolutionOperations({
      resolution,
      instanceId: "radiance",
      concentrationAction: "replace",
      spellExpiry: { mode: "concentration" },
    })
  ));
  const second = buildEffectsMutationPlan(first.states, preparedOperations(
    saveSpellResolutionOperations({
      resolution,
      instanceId: "radiance",
      concentrationAction: "extend",
      spellExpiry: { mode: "concentration" },
    }),
    "second",
  ));

  assert.equal(exhaustionLevelFromInstances(state(first, "target").conditions), 3);
  assert.equal(exhaustionLevelFromInstances(state(second, "target").conditions), 4);
  assert.equal(
    state(second, "target").conditions.filter(
      (condition) => condition.effectId === "sickening-radiance-no-invisibility"
    ).length,
    1,
  );

  const ended = buildEffectsMutationPlan(second.states, [{
    type: "concentration:break",
    casterIds: ["caster"],
    operationId: "end-radiance",
  }]);
  assert.equal(exhaustionLevelFromInstances(state(ended, "target").conditions), 2);
  assert.deepEqual(
    state(ended, "target").conditions.map((condition) => condition.id),
    ["base-exhaustion"],
  );
});

test("i debuff del catalogo mantengono metadati e durata nella mutazione", () => {
  const resolution = resolutionFor({
    id: "synaptic-static",
    name: "Synaptic Static",
    displayName: "Scossa Sinaptica",
    concentration: false,
    saveAutomation: {
      failed: [{
        condition: "-1d6 Att/prove/TS concentrazione",
        effectId: "synaptic-static-penalty",
        effectKind: "debuff",
        effectDetail: "Sottrae 1d6.",
        manualRemoval: true,
        endsParentOnRemoval: true,
        expiry: { mode: "rounds", remaining: 10 },
      }],
    },
  }, { target: "failed" });
  const operations = saveSpellResolutionOperations({
    resolution,
    instanceId: "synaptic-cast",
  });
  const condition = operations.find((operation) => operation.type === "condition:add");

  assert.equal(condition.options.effectId, "synaptic-static-penalty");
  assert.equal(condition.options.effectKind, "debuff");
  assert.equal(condition.options.effectDetail, "Sottrae 1d6.");
  assert.equal(condition.options.manualRemoval, true);
  assert.equal(condition.options.endsParentOnRemoval, true);
  assert.deepEqual(condition.options.expiry, { mode: "rounds", remaining: 10 });
});

test("il lifecycle completo sostituisce e poi interrompe la concentrazione con gli effetti figli", () => {
  const resolution = resolutionFor({
    id: "web",
    name: "Web",
    displayName: "Ragnatela",
    concentration: true,
    saveAutomation: {
      failed: [{ condition: "Trattenuto", expiry: { mode: "concentration" } }],
    },
  }, { target: "failed" });
  const initial = [
    {
      id: "caster",
      name: "Caster",
      spells: [],
      conditions: [],
      concentrations: {
        vecchia: {
          name: "Vecchia",
          instanceId: "old-cast",
          targets: ["old-target"],
        },
      },
    },
    {
      id: "old-target",
      name: "Old Target",
      concentrations: {},
      spells: [{
        id: "old-entry",
        name: "Vecchia",
        turns: 10,
        conc: true,
        casterId: "caster",
        instanceId: "old-cast",
      }],
      conditions: [{
        id: "old-condition",
        condition: "Accecato",
        active: true,
        type: "spell",
        parentEffectId: "old-cast",
      }],
    },
    {
      id: "target",
      name: "Target",
      concentrations: {},
      spells: [],
      conditions: [],
    },
  ];
  const applied = buildEffectsMutationPlan(initial, preparedOperations(
    saveSpellResolutionOperations({
      resolution,
      instanceId: "new-cast",
      turns: 600,
      spellExpiry: { mode: "concentration" },
    })
  ));

  assert.deepEqual(state(applied, "old-target").spells, []);
  assert.deepEqual(state(applied, "old-target").conditions, []);
  assert.equal(state(applied, "target").spells[0].instanceId, "new-cast");
  assert.equal(state(applied, "target").conditions[0].parentEffectId, "new-cast");
  assert.deepEqual(state(applied, "caster").concentrations.ragnatela.targets, ["target"]);

  const interrupted = buildEffectsMutationPlan(applied.states, [{
    type: "concentration:break",
    casterIds: ["caster"],
  }]);

  assert.deepEqual(state(interrupted, "caster").concentrations, {});
  assert.deepEqual(state(interrupted, "target").spells, []);
  assert.deepEqual(state(interrupted, "target").conditions, []);
});

test("la risoluzione di un trigger collega la vittima senza rilanciare la spell", () => {
  const resolution = resolutionFor({
    id: "web",
    name: "Web",
    displayName: "Ragnatela",
    concentration: true,
    saveAutomation: {
      failed: [{ condition: "Trattenuto", expiry: { mode: "concentration" } }],
    },
  }, { target: "failed" });
  const operations = saveSpellTriggerResolutionOperations({
    resolution,
    instanceId: "existing-web",
    casterName: "Mago",
    turns: 580,
    spellExpiry: { mode: "concentration" },
  });

  assert.deepEqual(
    operations.map((operation) => operation.type),
    [
      "spell:upsert",
      "condition:add",
      "concentration:register",
      "condition:automate",
    ],
  );
  assert.deepEqual(operations[0].targetIds, ["target"]);
  assert.equal(operations[0].instanceId, "existing-web");
  assert.equal(operations[0].turns, 580);
  assert.deepEqual(operations[0].expiry, { mode: "concentration" });
  assert.equal(operations[1].options.parentEffectId, "existing-web");
  assert.equal(operations[1].options.sourceId, "caster");
  assert.deepEqual(operations[2].targetIds, ["target"]);
  assert.equal(
    operations.some((operation) =>
      operation.type === "concentration:break"
    ),
    false,
  );

  const applied = buildEffectsMutationPlan([
    {
      id: "caster",
      concentrations: {
        ragnatela: {
          name: "Ragnatela",
          spellId: "web",
          instanceId: "existing-web",
          targets: ["first-target"],
        },
      },
      spells: [],
      conditions: [],
    },
    {
      id: "first-target",
      concentrations: {},
      spells: [],
      conditions: [],
    },
    {
      id: "target",
      concentrations: {},
      spells: [],
      conditions: [],
    },
  ], preparedOperations(operations, "zone-trigger"));

  assert.equal(state(applied, "target").spells[0].instanceId, "existing-web");
  assert.equal(
    state(applied, "target").conditions[0].parentEffectId,
    "existing-web",
  );
  assert.deepEqual(
    state(applied, "caster").concentrations.ragnatela.targets,
    ["first-target", "target"],
  );

  const interrupted = buildEffectsMutationPlan(applied.states, [{
    type: "concentration:break",
    casterIds: ["caster"],
  }]);
  assert.deepEqual(state(interrupted, "target").spells, []);
  assert.deepEqual(state(interrupted, "target").conditions, []);
});
