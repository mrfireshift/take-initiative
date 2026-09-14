import test from "node:test";
import assert from "node:assert/strict";
import { decorateCompositeEffectsHistoryEntry } from "../src/effectsMutationCompositeHistoryCore.js";
import { buildHistoryUndoPlan } from "../src/historyUndoCore.js";

const present = (value) => ({ present: true, value });

test("la History composita usa gli effects before/after del piano background", () => {
  const entry = {
    id: "outer-history",
    kind: "save-resolution",
    changes: [{
      id: "token-1",
      before: {
        hp: present(10),
        conditions: present({ version: 2, instances: [{ id: "unrelated-before" }] }),
      },
      after: {
        hp: present(4),
        conditions: present({ version: 2, instances: [{ id: "unrelated-after" }] }),
      },
    }, {
      id: "zone-1",
      sceneBefore: null,
      sceneAfter: { id: "zone-1", metadata: { zone: true } },
    }],
  };
  const mutation = {
    commandId: "background-command",
    correlationId: "correlation",
    sceneEpoch: 7,
    sceneIdentity: "scene-A",
    changes: [{
      id: "token-1",
      fields: { conditions: true, spells: false, concentrations: false },
      before: { conditions: [{ id: "planned-before" }] },
      after: { conditions: [{ id: "planned-after" }] },
    }],
  };
  const decorated = decorateCompositeEffectsHistoryEntry({
    entry,
    mutation,
    effectMetadataFields: ["conditions", "plugin/spells", "plugin/concentration"],
  });
  const change = decorated.effectsMutation.changes[0];
  assert.deepEqual(change.before.conditions, [{ id: "planned-before" }]);
  assert.deepEqual(change.after.conditions, [{ id: "planned-after" }]);
  assert.deepEqual(change.beforeMetadata.hp, present(10));
  assert.deepEqual(change.afterMetadata.hp, present(4));
  assert.equal(change.metadataFields.conditions, undefined);
  assert.equal(decorated.effectsMutation.commandId, "background-command");
  // Scene lifecycle stays canonical in entry.changes and is not duplicated as
  // a sideEffect:item, otherwise the canonical Undo planner processes it twice.
  assert.equal(decorated.effectsMutation.sideEffects.length, 0);
  assert.equal(decorated.changes[1].id, "zone-1");
  assert.equal(decorated.changes[1].sceneBefore, null);
  assert.equal(decorated.changes[1].sceneAfter.id, "zone-1");
});

test("un lifecycle SDK-normalizzato già presente come side effect item non viene duplicato", () => {
  const boardToken = {
    id: "board-token-1",
    type: "IMAGE",
    layer: "PROP",
    position: { x: 75, y: 75 },
    metadata: {
      "com.thebigpicture.initiative/spellBoardToken": {
        kind: "spell-board-token",
        spellId: "animate-objects",
        instanceId: "spell-instance-1",
        casterId: "caster-1",
      },
    },
  };
  const sdkSnapshot = { ...boardToken, zIndex: 0 };
  const decorated = decorateCompositeEffectsHistoryEntry({
    entry: {
      id: "outer-create",
      kind: "save-resolution",
      changes: [{
        id: boardToken.id,
        sceneBefore: null,
        sceneAfter: sdkSnapshot,
      }],
    },
    mutation: {
      commandId: "background-create",
      commitResult: {
        sideEffectChanges: [{
          id: boardToken.id,
          type: "item",
          before: null,
          after: boardToken,
        }],
      },
    },
  });

  assert.deepEqual(decorated.changes, []);
  assert.deepEqual(decorated.effectsMutation.targetIds, [boardToken.id]);
  assert.equal(decorated.effectsMutation.sideEffects.length, 1);
  const plan = buildHistoryUndoPlan({
    sceneItems: [sdkSnapshot],
    entryOrEntries: [decorated],
  });
  assert.equal(plan.status, undefined);
  assert.deepEqual(plan.lifecycle[0], {
    id: boardToken.id,
    entryIds: [decorated.id],
    before: sdkSnapshot,
    after: null,
  });
});
