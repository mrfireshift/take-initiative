import test from "node:test";
import assert from "node:assert/strict";
import {
  runCoordinatedEffectsStressScenario,
  runEffectsStressScenario,
  seededEffectsRandom,
} from "../test-support/effectsSdkHarness.js";

test("SDK simulato: 10-20 mutazioni effetti rapide su due client sono diagnosticabili e convergono", async () => {
  let lockSkipped = 0;
  let staleRevisions = 0;
  let widgetMutations = 0;
  let concurrentScenarios = 0;

  for (let seed = 1; seed <= 16; seed++) {
    const random = seededEffectsRandom(seed);
    const mutationCount = 10 + Math.floor(random() * 11);
    const report = await runEffectsStressScenario({ seed, mutationCount });
    const context = `seed=${seed}, mutations=${mutationCount}`;

    assert.equal(report.clientCount, 2, context);
    assert.equal(report.operationLog.length, mutationCount, context);
    assert.equal(report.finalState.consistent, true, context);
    assert.equal(report.finalState.actualWidgets, report.finalState.expectedWidgets, context);
    assert.ok(report.clients.every((client) => client.sdk.calls.getItems > 0), context);

    if (report.sdk.maxConcurrentCalls > 1) concurrentScenarios += 1;
    for (const client of report.clients) {
      lockSkipped += client.lockSkipped;
      staleRevisions += client.staleRevisions;
      widgetMutations += client.widgets.added + client.widgets.updated + client.widgets.deleted;
    }
  }

  assert.ok(concurrentScenarios > 0, "il mock deve esercitare chiamate SDK concorrenti");
  assert.ok(lockSkipped > 0, "il mock deve esercitare i lock saltati");
  assert.ok(staleRevisions > 0, "il mock deve rilevare revisioni stale");
  assert.ok(widgetMutations > 0, "il mock deve modificare widget condivisi");
});

test("writer GM seriale: due client convergono senza sweep o scritture del player", async () => {
  for (let seed = 1; seed <= 8; seed += 1) {
    const random = seededEffectsRandom(seed ^ 0x27d4eb2d);
    const mutationCount = 10 + Math.floor(random() * 11);
    const report = await runCoordinatedEffectsStressScenario({ seed, mutationCount });
    const context = `seed=${seed}, mutations=${mutationCount}`;

    assert.equal(report.operationLog.length, mutationCount, context);
    assert.equal(report.finalState.consistent, true, context);
    assert.deepEqual(report.renderedBy, ["gm-background"], context);
    assert.equal(report.writer.lockSkipped, 0, context);
    assert.equal(report.writer.staleRevisions, 0, context);
    assert.ok(report.observer.metadataEvents > 0, context);
    assert.ok(report.observer.widgetEvents > 0, context);
    assert.equal(report.queue.running, false, context);
    assert.equal(report.queue.latestRevision, report.queue.completedRevision, context);
  }
});
