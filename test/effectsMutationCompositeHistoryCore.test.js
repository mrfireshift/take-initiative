import test from "node:test";
import assert from "node:assert/strict";
import { decorateCompositeEffectsHistoryEntry } from "../src/effectsMutationCompositeHistoryCore.js";

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
  assert.equal(decorated.effectsMutation.sideEffects.length, 1);
});
