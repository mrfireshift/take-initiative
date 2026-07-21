import test from "node:test";
import assert from "node:assert/strict";
import {
  InitiativeSdkHarness,
  RandomLatencyInitiativeSdk,
  seededRandom,
} from "../test-support/initiativeSdkHarness.js";

function expectedAfter(initialState, directions) {
  const orderLength = initialState.order.length;
  let current = initialState.current;
  let round = initialState.round;
  for (const direction of directions) {
    if (direction < 0) {
      current = (current - 1 + orderLength) % orderLength;
      if (current === orderLength - 1) round = Math.max(1, round - 1);
    } else {
      current = (current + 1) % orderLength;
      if (current === 0) round += 1;
    }
  }
  return { current, round, activeId: initialState.order[current] };
}

test("SDK simulato: 10-20 click rapidi convergono senza render stale", async () => {
  let duplicateMetadataObserved = 0;
  let staleRendersDiscarded = 0;
  let confirmedRenders = 0;
  let metadataProcessedScenarios = 0;
  for (let seed = 1; seed <= 24; seed++) {
    const random = seededRandom(seed);
    const latencyRandom = seededRandom(seed ^ 0x9e3779b9);
    const initialState = {
      order: ["a", "b", "c", "d", "e", "f", "g", "h"],
      current: 0,
      round: 3,
      collapsed: {},
      ui: { autoFocus: true },
    };
    const sdk = new RandomLatencyInitiativeSdk({ initialState, random: latencyRandom });
    const harness = new InitiativeSdkHarness({ initialState, sdk });
    const clickCount = 10 + Math.floor(random() * 11);
    const directions = [];

    for (let index = 0; index < clickCount; index++) {
      const direction = random() < 0.38 ? -1 : 1;
      directions.push(direction);
      harness.click(direction);
      if (random() < 0.45) await sdk.pause();
    }

    await harness.waitForIdle();
    const expected = expectedAfter(initialState, directions);
    const context = `seed=${seed}, clicks=${clickCount}`;

    assert.equal(sdk.state.current, expected.current, context);
    assert.equal(sdk.state.round, expected.round, context);
    assert.equal(harness.confirmedState.current, expected.current, context);
    assert.equal(harness.confirmedState.round, expected.round, context);
    assert.equal(harness.selection, expected.activeId, context);
    assert.equal(harness.label, `Turno di ${expected.activeId}`, context);
    assert.equal(harness.optimisticRenderCount, clickCount, context);
    assert.equal(harness.staleRenderCommits, 0, context);
    assert.ok(harness.maxMetadataConcurrency <= 1, context);
    if (harness.maxMetadataConcurrency === 1) metadataProcessedScenarios += 1;
    duplicateMetadataObserved += harness.skippedDuplicateMetadata;
    staleRendersDiscarded += harness.skippedStaleRenders;
    confirmedRenders += harness.confirmedRenderCount;
  }
  assert.ok(duplicateMetadataObserved > 0, "il mock deve produrre metadata duplicati");
  assert.ok(staleRendersDiscarded > 0, "il mock deve esercitare il filtro dei render stale");
  assert.ok(confirmedRenders > 0, "almeno un render confermato deve completare");
  assert.ok(metadataProcessedScenarios > 0, "il processore metadata deve essere esercitato");
});
