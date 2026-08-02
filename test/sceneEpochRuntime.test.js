import assert from "node:assert/strict";
import test from "node:test";
import { buildEffectsMutationPlan } from "../src/effectsMutationCore.js";
import { recordCombatTurnForEpoch } from "../src/combatLogTurnCore.js";
import { cancelSceneEditorsWithoutCommit } from "../src/sceneEditorResetCore.js";
import {
  createSceneEpochController,
  runSceneEpochSteps,
} from "../src/sceneEpoch.js";
import { createSceneEpochTimer } from "../src/sceneEpochTimerCore.js";
import {
  createSceneItemChangeDispatcher,
  hydrateSceneItemChangeDispatcher,
} from "../src/sceneItemChangeDispatcherCore.js";
import { advanceInitiativeState } from "../src/initiativeRenderCore.js";
import { runStaticSpellZoneRemovalTransaction } from "../src/staticSpellZoneRemovalCore.js";
import { isTurnNoticeForScene } from "../src/turnNotice.js";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

function token(id, x = 0) {
  return {
    id,
    layer: "CHARACTER",
    name: id,
    position: { x, y: 0 },
    metadata: { "com.thebigpicture.initiative/meta": { hp: 10, hpMax: 10 } },
  };
}

test("una mutazione Combat Log accodata nella scena A non legge né scrive la scena B", async () => {
  const epochs = createSceneEpochController({ initialEpoch: 10 });
  const epochA = epochs.current();
  const queueGate = deferred();
  const calls = { ensure: 0, stored: 0, turn: 0, append: 0 };
  const task = queueGate.promise.then(() => recordCombatTurnForEpoch({
    state: { order: ["a"], current: 0, round: 5 },
    sceneEpoch: epochA,
    isCurrent: (epoch) => epochs.isCurrent(epoch),
    ensureSession: async () => {
      calls.ensure += 1;
      return { id: "scene-b-session" };
    },
    getStoredSession: async () => {
      calls.stored += 1;
      return null;
    },
    resolveTurn: async () => {
      calls.turn += 1;
      return { id: "a", name: "A" };
    },
    appendEvents: async () => {
      calls.append += 1;
      return ["written"];
    },
  }));

  epochs.invalidate();
  epochs.markReady();
  queueGate.resolve();

  assert.deepEqual(await task, []);
  assert.deepEqual(calls, { ensure: 0, stored: 0, turn: 0, append: 0 });
});

test("un normale avanzamento nello stesso epoch registra un solo evento round nel Combat Log", async () => {
  const epochs = createSceneEpochController({ initialEpoch: 20 });
  let commits = 0;
  const result = await recordCombatTurnForEpoch({
    state: { order: ["a"], current: 0, round: 6 },
    sceneEpoch: epochs.current(),
    isCurrent: (epoch) => epochs.isCurrent(epoch),
    ensureSession: async () => ({ id: "scene-a-session", lastRound: 5, lastTurnKey: "5:z" }),
    getStoredSession: async () => ({ lastRound: 5, lastTurnKey: "5:z" }),
    resolveTurn: async () => ({ id: "a", name: "A" }),
    appendEvents: async (_sessionId, inputs) => {
      commits += 1;
      return inputs;
    },
  });

  assert.equal(commits, 1);
  assert.equal(result.filter((entry) => entry.kind === "round").length, 1);
  assert.equal(result.filter((entry) => entry.kind === "turn").length, 1);
});

test("Combat Log ricontrolla l'epoch dopo una lettura asincrona prima di risolvere turno o commit", async () => {
  const epochs = createSceneEpochController({ initialEpoch: 25 });
  const storedStarted = deferred();
  const stored = deferred();
  const calls = { turn: 0, append: 0 };
  const task = recordCombatTurnForEpoch({
    state: { order: ["a"], current: 0, round: 5 },
    sceneEpoch: epochs.current(),
    isCurrent: (epoch) => epochs.isCurrent(epoch),
    ensureSession: async () => ({ id: "scene-a-session" }),
    getStoredSession: async () => {
      storedStarted.resolve();
      return stored.promise;
    },
    resolveTurn: async () => {
      calls.turn += 1;
      return { id: "a", name: "A" };
    },
    appendEvents: async () => {
      calls.append += 1;
      return ["written"];
    },
  });

  await storedStarted.promise;
  epochs.invalidate();
  epochs.markReady();
  stored.resolve({ lastRound: 4, lastTurnKey: "4:z" });

  assert.deepEqual(await task, []);
  assert.deepEqual(calls, { turn: 0, append: 0 });
});

test("timer HP/attitude obsoleto non esegue la callback anche se il runtime tenta di scaricarlo", async () => {
  const epochs = createSceneEpochController({ initialEpoch: 30 });
  const timers = [];
  const cleared = new Set();
  const timer = createSceneEpochTimer({
    isCurrent: (epoch) => epochs.isCurrent(epoch),
    setTimer(callback) {
      const handle = { callback };
      timers.push(handle);
      return handle;
    },
    clearTimer(handle) {
      cleared.add(handle);
    },
  });
  let reads = 0;
  let writes = 0;
  const apply = async () => {
    reads += 1;
    writes += 1;
  };

  const epochA = epochs.current();
  timer.schedule(epochA, 150, apply);
  epochs.invalidate();
  timer.cancel();
  timers[0].callback();
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(cleared.has(timers[0]), true);
  assert.equal(reads, 0);
  assert.equal(writes, 0);
});

test("il baseline item della scena B non produce history o notice, mentre un delta successivo sì", async () => {
  let emit;
  let epoch = 40;
  const dispatcher = createSceneItemChangeDispatcher({
    getEpoch: () => epoch,
    subscribeSource(callback) {
      emit = callback;
      return () => {};
    },
    setTimer(callback) {
      return callback;
    },
    clearTimer() {},
  });
  const history = [];
  const notices = [];
  dispatcher.subscribe((event) => {
    history.push(event.changedIds);
    notices.push(event.sceneEpoch);
  });

  dispatcher.suspend();
  epoch = 41;
  dispatcher.resume([token("b")]);
  emit([token("b")]);
  await dispatcher.flush();
  assert.deepEqual(history, []);
  assert.deepEqual(notices, []);

  emit([token("b", 70)]);
  await dispatcher.flush();
  assert.deepEqual(history, [["b"]]);
  assert.deepEqual(notices, [41]);
});

test("la transazione zone interrotta dopo delete non committa né ripristina nella scena B", async () => {
  const epochs = createSceneEpochController({ initialEpoch: 50 });
  const deleted = deferred();
  let actionCalls = 0;
  let rollbackCalls = 0;
  const task = runStaticSpellZoneRemovalTransaction({
    snapshots: [{ id: "zone-a" }],
    isCurrent: () => epochs.isCurrent(50),
    deleteItems: async () => deleted.promise,
    addItems: async () => { rollbackCalls += 1; },
    action: async () => { actionCalls += 1; },
  });

  epochs.invalidate();
  epochs.markReady();
  deleted.resolve();
  await task;

  assert.equal(actionCalls, 0);
  assert.equal(rollbackCalls, 0);
});

test("la transazione zone non esegue rollback quando l'epoch cambia durante una commit fallita", async () => {
  const epochs = createSceneEpochController({ initialEpoch: 55 });
  const actionStarted = deferred();
  const actionSettled = deferred();
  let rollbackCalls = 0;
  const task = runStaticSpellZoneRemovalTransaction({
    snapshots: [{ id: "zone-a" }],
    isCurrent: () => epochs.isCurrent(55),
    deleteItems: async () => {},
    addItems: async () => { rollbackCalls += 1; },
    action: async () => {
      actionStarted.resolve();
      await actionSettled.promise;
      throw new Error("commit-failed");
    },
  });

  await actionStarted.promise;
  epochs.invalidate();
  epochs.markReady();
  actionSettled.resolve();

  assert.equal(await task, undefined);
  assert.equal(rollbackCalls, 0);
});

test("la transazione zone nella stessa scena esegue una sola commit", async () => {
  const epochs = createSceneEpochController({ initialEpoch: 60 });
  let commits = 0;
  await runStaticSpellZoneRemovalTransaction({
    snapshots: [{ id: "zone-a" }],
    isCurrent: () => epochs.isCurrent(60),
    deleteItems: async () => {},
    addItems: async () => {},
    action: async () => { commits += 1; },
  });
  assert.equal(commits, 1);
});

test("una riconciliazione interrotta non avvia il backfill o la mutazione successiva", async () => {
  const epochs = createSceneEpochController({ initialEpoch: 70 });
  const sceneEpoch = epochs.current();
  const gcStarted = deferred();
  const gcSettled = deferred();
  let backfills = 0;
  let mutations = 0;

  const task = runSceneEpochSteps({
    sceneEpoch,
    isCurrent: (epoch) => epochs.isCurrent(epoch),
    steps: [
      async (epoch) => {
        gcStarted.resolve();
        await gcSettled.promise;
        if (epochs.isCurrent(epoch)) mutations += 1;
      },
      async () => { backfills += 1; },
    ],
  });

  await gcStarted.promise;
  epochs.invalidate();
  epochs.markReady();
  gcSettled.resolve();

  assert.equal(await task, false);
  assert.equal(mutations, 0);
  assert.equal(backfills, 0);
});

test("un Undo accodato nella scena A non avvia restore o history write nella scena B", async () => {
  const epochs = createSceneEpochController({ initialEpoch: 80 });
  const sceneEpoch = epochs.current();
  const queueGate = deferred();
  let restores = 0;
  let historyWrites = 0;

  const task = queueGate.promise.then(() => runSceneEpochSteps({
    sceneEpoch,
    isCurrent: (epoch) => epochs.isCurrent(epoch),
    steps: [
      async () => { restores += 1; },
      async () => { historyWrites += 1; },
    ],
  }));

  epochs.invalidate();
  epochs.markReady();
  queueGate.resolve();

  assert.equal(await task, false);
  assert.equal(restores, 0);
  assert.equal(historyWrites, 0);
});

test("un turn notice ritardato della scena A viene rifiutato nella scena B", () => {
  const epochs = createSceneEpochController({ initialEpoch: 90 });
  const payload = { type: "show-turn-notice", sceneEpoch: epochs.current() };
  assert.equal(isTurnNoticeForScene(payload, epochs.current(), epochs.isReady()), true);

  epochs.invalidate();
  epochs.markReady();

  assert.equal(isTurnNoticeForScene(payload, epochs.current(), epochs.isReady()), false);
});

test("una modifica item durante l'idratazione forza una nuova baseline senza perdere eventi", async () => {
  let emit;
  const firstRead = deferred();
  let reads = 0;
  const dispatcher = createSceneItemChangeDispatcher({
    subscribeSource(callback) {
      emit = callback;
      return () => {};
    },
    setTimer(callback) { return callback; },
    clearTimer() {},
  });
  const events = [];
  dispatcher.subscribe((event) => events.push(event));
  dispatcher.suspend();

  const hydration = hydrateSceneItemChangeDispatcher({
    dispatcher,
    readItems: async () => {
      reads += 1;
      if (reads === 1) return firstRead.promise;
      return [token("b", 70)];
    },
  });

  emit([token("b", 70)]);
  firstRead.resolve([token("b", 0)]);
  assert.equal(await hydration, true);
  assert.equal(reads, 2);

  emit([token("b", 70)]);
  await dispatcher.flush();
  assert.equal(events.length, 0);

  emit([token("b", 140)]);
  await dispatcher.flush();
  assert.equal(events.length, 1);
  assert.deepEqual(events[0].items[0].position, { x: 140, y: 0 });
});

test("il normale wrap di round nello stesso epoch produce un solo piano e una sola commit", async () => {
  const epochs = createSceneEpochController({ initialEpoch: 100 });
  const previous = { order: ["a", "b"], current: 1, round: 5 };
  const next = advanceInitiativeState(previous, 1);
  let plans = 0;
  let commits = 0;
  const plan = buildEffectsMutationPlan([{
    id: "a",
    name: "a",
    spells: [{ id: "spell-1", name: "Benedizione", turns: 3 }],
    concentrations: {},
    conditions: [],
  }], [{
    type: "effects:tick-round",
    targetIds: ["a"],
    delta: previous.round - next.round,
  }]);
  plans += 1;

  await runStaticSpellZoneRemovalTransaction({
    snapshots: [],
    isCurrent: () => epochs.isCurrent(100),
    deleteItems: async () => {},
    addItems: async () => {},
    action: async () => {
      commits += 1;
      return plan.changedIds;
    },
  });

  assert.equal(next.round, 6);
  assert.equal(plans, 1);
  assert.equal(commits, 1);
  assert.deepEqual(plan.changedIds, ["a"]);
  assert.equal(plan.states.find((entry) => entry.id === "a").spells[0].turns, 2);
});

test("il reset scena annulla gli editor aperti senza invocare commit", async () => {
  let commits = 0;
  let cancellations = 0;
  await cancelSceneEditorsWithoutCommit([
    {
      __commitFn: () => { commits += 1; },
      __cancelFn: () => { cancellations += 1; },
    },
    {
      __commitFn: () => { commits += 1; },
      __cancelFn: async () => { cancellations += 1; },
    },
  ]);

  assert.equal(commits, 0);
  assert.equal(cancellations, 2);
});
