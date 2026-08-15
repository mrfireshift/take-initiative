import test from "node:test";
import assert from "node:assert/strict";
import {
  createCombatLogPageState,
  getCombatLogPageControlState,
  getCombatLogTimelineWindow,
  mergeCombatLogPageState,
} from "../src/combatLogPaginationCore.js";

const session = { id: "session-behavior" };

function event(sequence) {
  return {
    id: `event-${sequence}`,
    sequence,
  };
}

function page(first, last, totalCount = 5_000) {
  return {
    events: Array.from({ length: last - first + 1 }, (_, index) => event(first + index)),
    totalCount,
    hasOlder: first > 1,
    hasNewer: last < totalCount,
  };
}

test("la paginazione combat log conserva tre pagine, stato controlli e append concorrenti", async () => {
  const state = createCombatLogPageState();

  mergeCombatLogPageState(state, session, page(4_951, 5_000));
  assert.equal(state.events.size, 50);
  assert.deepEqual(getCombatLogPageControlState(state), {
    loadedCount: 50,
    loadOlderDisabled: false,
    loadAllDisabled: false,
  });

  mergeCombatLogPageState(state, session, page(4_901, 4_950));
  assert.equal(state.events.size, 100);
  assert.equal(new Set(state.events.keys()).size, 100);

  mergeCombatLogPageState(state, session, page(4_851, 4_900));
  assert.equal(state.events.size, 150);
  assert.equal(new Set(state.events.keys()).size, 150);
  assert.ok(state.events.has("event-5000"), "l'evento più recente resta presente");
  assert.equal(getCombatLogPageControlState(state).loadAllDisabled, false);

  let loading = true;
  try {
    throw new Error("errore di caricamento simulato");
  } catch {
    // Il modal visualizza lo stato di errore senza alterare la pagina già caricata.
  } finally {
    loading = false;
  }
  const afterError = getCombatLogPageControlState(state, { loading });
  assert.equal(afterError.loadOlderDisabled, false);
  assert.equal(afterError.loadAllDisabled, false);

  const olderConcurrentPage = page(4_801, 4_850);
  const appendRefreshPage = {
    events: [...page(4_952, 5_000).events, event(5_001)],
    totalCount: 5_001,
    hasOlder: true,
    hasNewer: false,
  };
  await Promise.all([
    Promise.resolve().then(() => mergeCombatLogPageState(state, session, olderConcurrentPage)),
    Promise.resolve().then(() => mergeCombatLogPageState(state, session, appendRefreshPage)),
  ]);
  assert.equal(state.events.size, 201);
  assert.equal(new Set(state.events.keys()).size, 201);
  assert.ok(state.events.has("event-5001"), "l'append concorrente non viene perso");
  assert.equal(getCombatLogPageControlState(state).loadAllDisabled, false);

  mergeCombatLogPageState(
    state,
    session,
    { events: Array.from({ length: 5_001 }, (_, index) => event(index + 1)), totalCount: 5_001 },
    { loadAll: true },
  );
  assert.equal(state.events.size, 5_001);
  assert.equal(getCombatLogPageControlState(state).loadAllDisabled, true);

  const timelineWindow = getCombatLogTimelineWindow(
    Array.from({ length: 5_000 }, (_, index) => event(index + 1)),
    250,
  );
  assert.equal(timelineWindow.events.length, 250);
  assert.equal(timelineWindow.hasMore, true);
  assert.equal(timelineWindow.events.at(-1).id, "event-5000");
  assert.equal(new Set(timelineWindow.events.map((item) => item.id)).size, 250);
});
