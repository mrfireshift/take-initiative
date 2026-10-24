// The apply results the background coordinator sends back to the popovers: copies and unread fields are dropped, so
// a Boss action on characters full of effects no longer crosses the broadcast in dozens of 6 kB chunks.
import test, { mock } from "node:test";
import assert from "node:assert/strict";

mock.module("@owlbear-rodeo/sdk", {
  exports: {
    default: { onReady() {}, broadcast: { onMessage: () => () => {}, sendMessage: async () => {} } },
    buildLabel() {}, buildImage() {}, buildText() {}, buildPath() {}, buildShape() {}, Command: class {},
  },
});
const { compactBackgroundApplyTransportResult } = await import("../src/effectsMutations.js");
const { buildEffectsMutationResultMessages } = await import("../src/effectsMutationTransportCore.js");
const { sharedHpCommittedUpdates } = await import("../src/sharedHpViewCore.js");

const bytes = (value) => new TextEncoder().encode(JSON.stringify(value)).length;
const heavy = (id, count = 25) => Array.from({ length: count }, (_, index) => ({ id: `${id}-effect-${index}`, condition: "Benedetto", detail: "x".repeat(300) }));

// The coordinator result as the background broker sends it: the plan's keys spread at the top level (same objects).
function appliedResult({ kind = "monster-action", historyPending = false, effects = 25 } = {}) {
  const changes = ["dars", "mira"].map((id) => ({
    id,
    fields: { conditions: true, spells: false },
    before: { conditions: heavy(id, effects), spells: [], concentrations: {} },
    after: { conditions: [...heavy(id, effects), { id: `${id}-blinded`, condition: "Accecato" }], spells: [], concentrations: {} },
    metadataFields: { hp: true, hpMax: true },
    beforeMetadata: { hp: { present: true, value: 40 }, hpMax: { present: true, value: 60 } },
    afterMetadata: { hp: { present: true, value: 13 }, hpMax: { present: true, value: 60 } },
  }));
  const plan = {
    operations: [{ type: "hp:set" }],
    changes,
    changedIds: ["dars", "mira"],
    states: ["dars", "mira"].map((id) => ({ id, name: id.toUpperCase(), conditions: heavy(id), spells: [] })),
    metadataAssertions: [{ id: "auril", field: "initiativeCard", expected: { present: true, value: { huge: "y".repeat(5000) } } }],
    sharedHpGroups: [],
    preparedSideEffects: [],
  };
  const historyEntry = { id: "effects-history:slam-1", kind, label: "Auril: Hand Slam", changes, effectsMutation: { sceneIdentity: "scene-1", changes } };
  return {
    ...plan,
    status: "applied", commandId: "slam-1", correlationId: "slam-1", sceneEpoch: 0, sceneIdentity: "scene-1", kind,
    committed: true, plan, historyEntry, historyPending, historySkipped: false, postCommitErrors: [], sideEffectsPending: [],
    commitResult: { committed: true, recoveryManaged: true, historyEntry, changes: structuredClone(changes), sideEffectChanges: [], sideEffectsPending: [] },
  };
}

test("a Boss action's answer keeps what its console reads and drops the copies", () => {
  const full = appliedResult();
  const compact = compactBackgroundApplyTransportResult(full);
  assert.ok(bytes(full) > 100_000, "the full answer is heavy");
  assert.ok(bytes(compact) < 15 * 1024, `the compact answer fits one broadcast message (${bytes(compact)} B)`);
  assert.equal(buildEffectsMutationResultMessages("request-1", compact).length, 1);
  assert.equal(compact.status, "applied");
  assert.equal(compact.committed, true);
  assert.equal(compact.historyEntry.id, "effects-history:slam-1");
  assert.equal(compact.historyEntry.effectsMutation.sceneIdentity, "scene-1");
  assert.equal(compact.commitResult.recoveryManaged, true);
  assert.deepEqual(compact.plan.states, [{ id: "dars", name: "DARS" }, { id: "mira", name: "MIRA" }]);
  // What the console's HP projection reads once the client spreads the plan back (compatibilityPlan).
  const client = { ...compact.plan, ...compact, changes: compact.changes || compact.plan.changes };
  assert.deepEqual(sharedHpCommittedUpdates(client).map(({ tokenId, hp }) => [tokenId, hp]), [["dars", 13], ["mira", 13]]);
  assert.deepEqual(client.changedIds, ["dars", "mira"]);
});

test("other commands keep their full changes; a pending History keeps its full entry", () => {
  const spell = compactBackgroundApplyTransportResult(appliedResult({ kind: "spell" }));
  assert.equal(spell.plan.changes[0].after.conditions.length, 26, "a spell's callers read the conditions after");
  assert.equal(spell.historyEntry.changes, undefined);
  assert.equal(spell.plan.metadataAssertions, undefined);
  const pending = compactBackgroundApplyTransportResult(appliedResult({ historyPending: true, effects: 2 }));
  assert.equal(pending.historyEntry.changes.length, 2, "the client keeps a small pending History until it is appended");
  assert.equal(pending.plan.changes[0].before.conditions.length, 2, "and the plan it can rebuild it from");
  assert.equal(pending.historyBackgroundOnly, undefined);
  // An entry too large for the client's own 16 kB broadcast to the owner: only the background delivers it.
  const large = compactBackgroundApplyTransportResult(appliedResult({ historyPending: true }));
  assert.equal(large.historyBackgroundOnly, true);
  assert.equal(large.historyEntry.changes, undefined, "the entry stays in the background");
  assert.equal(large.historyEntry.id, "effects-history:slam-1");
  assert.equal(buildEffectsMutationResultMessages("request-2", large).length, 1, "the answer fits one message");
  const failed = { status: "conflict", committed: false, conflicts: [{ reason: "stale" }] };
  assert.deepEqual(compactBackgroundApplyTransportResult(failed), failed);
});
