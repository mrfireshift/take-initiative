import test from "node:test";
import assert from "node:assert/strict";
import { buildCoordinatedEffectsUndoPlan } from "../src/effectsMutationUndoCore.js";

const metadataKeys = {
  conditions: "conditions",
  spells: "plugin/spells",
  concentrations: "plugin/concentration",
};
const normalizeConditions = (value) => Array.isArray(value?.instances) ? value.instances : [];
const snapshot = (value) => value === undefined
  ? { present: false }
  : { present: true, value };

function state(id, conditions = [], metadata = {}) {
  return { id, conditions, spells: [], concentrations: {}, metadata };
}

test("un batch misto effectsMutation + legacy simula la sequenza prima di committare", () => {
  const conditionA = [{ id: "A" }];
  const conditionB = [{ id: "A" }, { id: "B" }];
  const latestEffects = {
    id: "effects-new",
    effectsMutation: {
      changes: [{
        id: "token-1",
        fields: { conditions: true },
        before: { conditions: conditionA },
        after: { conditions: conditionB },
      }],
    },
  };
  const olderLegacy = {
    id: "legacy-old",
    changes: [{
      id: "token-1",
      before: { conditions: snapshot({ version: 2, instances: [] }) },
      after: { conditions: snapshot({ version: 2, instances: conditionA }) },
    }],
  };
  const plan = buildCoordinatedEffectsUndoPlan({
    currentStates: [state("token-1", conditionB, {
      conditions: { version: 2, instances: conditionB },
      foreign: { keep: true },
    })],
    entryOrEntries: [latestEffects, olderLegacy],
    metadataKeys,
    normalizeConditions,
  });
  assert.equal(plan.status, undefined);
  assert.deepEqual(plan.changes[0].after.conditions, []);
  assert.equal(plan.changes[0].metadataFields, undefined);
});

test("un conflitto su un solo target rifiuta atomicamente tutto il batch misto", () => {
  const entry = {
    id: "effects-multi",
    effectsMutation: {
      changes: ["token-1", "token-2"].map((id) => ({
        id,
        fields: { conditions: true },
        before: { conditions: [] },
        after: { conditions: [{ id: `expected-${id}` }] },
      })),
    },
  };
  const plan = buildCoordinatedEffectsUndoPlan({
    currentStates: [
      state("token-1", [{ id: "expected-token-1" }], { foreign: 1 }),
      state("token-2", [{ id: "changed-later" }], { foreign: 2 }),
    ],
    entryOrEntries: [entry],
    metadataKeys,
    normalizeConditions,
  });
  assert.equal(plan.status, "conflict");
  assert.equal(plan.changes, undefined);
  assert.equal(plan.conflicts[0].itemId, "token-2");
});

test("Undo di una zona aggiornata confronta solo il metadata posseduto", () => {
  const zoneKey = "plugin/static-zone";
  const beforeZone = { ruleChoice: "before", unrelated: true };
  const afterZone = { ruleChoice: "after", unrelated: true };
  const entry = {
    id: "effects-zone",
    effectsMutation: {
      changes: [{
        id: "token-1",
        fields: { conditions: true },
        before: { conditions: [] },
        after: { conditions: [{ id: "active" }] },
      }],
      sideEffects: [{
        id: "zone-1",
        type: "metadata",
        metadataKey: zoneKey,
        before: snapshot(beforeZone),
        after: snapshot(afterZone),
      }],
    },
  };
  const plan = buildCoordinatedEffectsUndoPlan({
    currentStates: [state("token-1", [{ id: "active" }])],
    sceneItems: [{
      id: "zone-1",
      position: { x: 999, y: 999 },
      metadata: { [zoneKey]: afterZone, "other/domain": { changed: true } },
    }],
    entryOrEntries: [entry],
    metadataKeys,
    normalizeConditions,
  });
  assert.equal(plan.status, undefined);
  assert.deepEqual(plan.undoSideEffects[0], {
    id: "zone-1",
    type: "metadata",
    metadataKey: zoneKey,
    restore: snapshot(beforeZone),
    expected: snapshot(afterZone),
  });
});

test("Undo non crea un conflitto per il diverso ordine delle chiavi metadata", () => {
  const entry = {
    id: "effects-order",
    effectsMutation: {
      changes: [{
        id: "token-1",
        fields: { conditions: true },
        before: { conditions: [] },
        after: {
          conditions: [{
            id: "condition-1",
            condition: "Benedizione",
            active: true,
            targetId: "token-1",
            expiry: {
              mode: "concentration",
              actor: "target",
              actorId: "token-1",
              anchor: "next-turn",
            },
          }],
        },
      }],
    },
  };
  const plan = buildCoordinatedEffectsUndoPlan({
    currentStates: [state("token-1", [{
      condition: "Benedizione",
      id: "condition-1",
      active: true,
      targetId: "token-1",
      expiry: {
        actorId: "token-1",
        anchor: "next-turn",
        actor: "target",
        mode: "concentration",
      },
    }])],
    entryOrEntries: entry,
    metadataKeys,
    normalizeConditions,
  });
  assert.equal(plan.status, undefined);
  assert.deepEqual(plan.states[0].conditions, []);
});

test("Undo confronta anche i reminder differiti delle condizioni", () => {
  const condition = {
    id: "condition-1",
    condition: "Acido ritardato",
    active: true,
    targetId: "token-1",
    expiry: { mode: "turn-end", remaining: 1, actor: "target", anchor: "next-turn" },
    deferredEffects: [{
      id: "acid-1",
      timing: "turn-end",
      actor: "target",
      anchor: "next-turn",
      reminder: "2d4 danni da acido",
      damage: { dice: "2d4", type: "acido" },
      once: true,
    }],
  };
  const plan = buildCoordinatedEffectsUndoPlan({
    currentStates: [state("token-1", [{
      ...condition,
      expiry: { anchor: "next-turn", actor: "target", remaining: 1, mode: "turn-end" },
      deferredEffects: [{
        ...condition.deferredEffects[0],
        damage: { type: "acido", dice: "2d4" },
      }],
    }])],
    entryOrEntries: {
      id: "effects-deferred",
      effectsMutation: {
        changes: [{
          id: "token-1",
          fields: { conditions: true },
          before: { conditions: [] },
          after: { conditions: [condition] },
        }],
      },
    },
    metadataKeys,
    normalizeConditions,
  });
  assert.equal(plan.status, undefined);
  assert.deepEqual(plan.states[0].conditions, []);
});

test("Undo di un side-effect token:teleport confronta solo la posizione posseduta", () => {
  const origin = { x: 0, y: 0 };
  const destination = { x: 300, y: 300 };
  const entry = {
    id: "effects-teleport",
    effectsMutation: {
      changes: [],
      sideEffects: [{
        id: "caster-1",
        type: "token:teleport",
        beforePosition: origin,
        afterPosition: destination,
      }],
    },
  };
  const plan = buildCoordinatedEffectsUndoPlan({
    currentStates: [state("caster-1", [])],
    sceneItems: [{
      id: "caster-1",
      position: destination,
      metadata: { hp: 15, unrelated: "modified-after-teleport" },
      name: "Mago",
    }],
    entryOrEntries: [entry],
    metadataKeys,
    normalizeConditions,
  });
  assert.equal(plan.status, undefined);
  assert.equal(plan.undoSideEffects.length, 1);
  assert.deepEqual(plan.undoSideEffects[0], {
    id: "caster-1",
    type: "token:teleport",
    restorePosition: origin,
    expectedPosition: destination,
  });
});

test("un movimento successivo del token teletrasportato produce un conflitto di posizione", () => {
  const origin = { x: 0, y: 0 };
  const destination = { x: 300, y: 300 };
  const laterPosition = { x: 450, y: 450 };
  const entry = {
    id: "effects-teleport-conflict",
    effectsMutation: {
      changes: [],
      sideEffects: [{
        id: "caster-1",
        type: "token:teleport",
        beforePosition: origin,
        afterPosition: destination,
      }],
    },
  };
  const plan = buildCoordinatedEffectsUndoPlan({
    currentStates: [state("caster-1", [])],
    sceneItems: [{
      id: "caster-1",
      position: laterPosition,
      metadata: {},
    }],
    entryOrEntries: [entry],
    metadataKeys,
    normalizeConditions,
  });
  assert.equal(plan.status, "conflict");
  assert.equal(plan.conflicts[0].itemId, "caster-1");
  assert.equal(plan.conflicts[0].field, "position");
});

test("se il token teletrasportato viene rimosso dalla scena, Undo segnala conflict per item mancante", () => {
  const entry = {
    id: "effects-teleport-missing",
    effectsMutation: {
      changes: [],
      sideEffects: [{
        id: "caster-1",
        type: "token:teleport",
        beforePosition: { x: 0, y: 0 },
        afterPosition: { x: 300, y: 300 },
      }],
    },
  };
  const plan = buildCoordinatedEffectsUndoPlan({
    currentStates: [],
    sceneItems: [],
    entryOrEntries: [entry],
    metadataKeys,
    normalizeConditions,
  });
  assert.equal(plan.status, "conflict");
  assert.equal(plan.conflicts[0].itemId, "caster-1");
  assert.equal(plan.conflicts[0].reason, "token-teleport-target-missing");
});
