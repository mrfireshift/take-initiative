import test from "node:test";
import assert from "node:assert/strict";
import { createEffectsDiagnostics } from "../src/effectsDiagnosticsCore.js";

test("diagnostica effetti aggrega SDK, widget, lock, stale e durata", () => {
  let clock = 100;
  const diagnostics = createEffectsDiagnostics({
    enabled: true,
    clientId: "test-client",
    now: () => clock,
  });
  const session = diagnostics.beginReconcile("conditions", { revision: 4 });
  diagnostics.sdkCall(session, "getItems");
  diagnostics.sdkResult(session, "getItems", { returnedItems: 3 });
  diagnostics.sdkCall(session, "updateItems", { requestedItems: 2 });
  diagnostics.widgetMutation(session, "updated", 2);
  diagnostics.lockSkipped(session, { tokenId: "token-a" });
  diagnostics.revisionStale(session, { latestRevision: 5, stage: "complete" });
  clock = 125.5;
  diagnostics.finishReconcile(session, { outcome: "completed", scannedTokens: 3 });

  const summary = diagnostics.summary();
  assert.equal(summary.clientId, "test-client");
  assert.equal(summary.started, 1);
  assert.equal(summary.finished, 1);
  assert.equal(summary.lockSkipped, 1);
  assert.equal(summary.staleRevisions, 1);
  assert.equal(summary.duration.averageMs, 25.5);
  assert.equal(summary.sdk.calls.getItems, 1);
  assert.equal(summary.sdk.calls.updateItems, 1);
  assert.equal(summary.sdk.returnedItems.getItems, 3);
  assert.equal(summary.widgets.updated, 2);
  assert.equal(summary.engines.conditions.duration.maxMs, 25.5);
});

