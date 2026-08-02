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
