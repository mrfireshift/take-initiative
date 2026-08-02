import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ID } from "../src/constants.js";
import {
  classifySceneItemChanges,
  createSceneItemChangeDispatcher,
} from "../src/sceneItemChangeDispatcherCore.js";
import {
  createDirtyItemSet,
  createInitiativeRenderScheduler,
  RENDER_PRIORITY,
} from "../src/initiativeRenderSchedulerCore.js";
import { collectEffectsInvalidation } from "../src/effectsReconcilerCore.js";
import { planIncrementalTrackerItemRender } from "../src/initiativeIncrementalRenderCore.js";

const META_KEY = `${ID}/meta`;

function token(overrides = {}) {
  return {
    id: "token-1",
    type: "IMAGE",
    name: "Goblin",
    position: { x: 0, y: 0 },
    metadata: {
      [META_KEY]: {
        inInitiative: true,
        initiative: 12,
        attitude: "enemy",
        hp: 10,
        hpMax: 10,
      },
    },
    ...overrides,
  };
}

function controlledScheduler(options = {}) {
  const tasks = [];
  const scheduler = createInitiativeRenderScheduler({
    scheduleTask(callback) {
      tasks.push(callback);
    },
    getSceneEpoch: () => 1,
    ...options,
  });
  return {
    scheduler,
    runNext() {
      const task = tasks.shift();
      assert.ok(task, "manca un drain schedulato");
      task();
    },
  };
}

test("un full pendente attraversa la barriera prima dell'incrementale successivo", async () => {
  let releaseFull;
  const fullGate = new Promise((resolve) => { releaseFull = resolve; });
  const trace = [];
  const { scheduler, runNext } = controlledScheduler();

  const full = scheduler.requestFull({
    sceneEpoch: 1,
    reason: "structural",
    execute: async () => {
      trace.push("full:start");
      await fullGate;
      trace.push("full:end");
    },
  });
  const incremental = scheduler.requestIncremental({
    sceneEpoch: 1,
    itemIds: ["token-1"],
    execute: async () => trace.push("incremental"),
  });

  assert.equal(scheduler.getState().pendingPriority, RENDER_PRIORITY.FULL);
  runNext();
  await Promise.resolve();
  assert.deepEqual(trace, ["full:start"]);
  assert.equal(scheduler.getState().fullRunning, true);

  releaseFull();
  const [fullResult, incrementalResult] = await Promise.all([
    full.done,
    incremental.done,
  ]);

  assert.equal(fullResult.status, "committed");
  assert.equal(incrementalResult.status, "committed");
  assert.deepEqual(trace, ["full:start", "full:end", "incremental"]);
  assert.equal(scheduler.getState().pendingPriority, null);
});

test("gli incrementali accodati durante il full riprendono con gli ID dirty", async () => {
  let releaseFull;
  const fullGate = new Promise((resolve) => { releaseFull = resolve; });
  const seen = [];
  const { scheduler, runNext } = controlledScheduler({
    runIncremental: async ({ itemIds }) => seen.push(itemIds),
  });

  const full = scheduler.requestFull({
    sceneEpoch: 1,
    execute: async () => fullGate,
  });
  runNext();
  await Promise.resolve();

  const incremental = scheduler.requestIncremental({
    sceneEpoch: 1,
    itemIds: ["token-1", "token-2", "token-1"],
  });
  assert.deepEqual(scheduler.getState().incrementalPending, ["token-1", "token-2"]);

  releaseFull();
  await Promise.all([full.done, incremental.done]);
  assert.deepEqual(seen, [["token-1", "token-2"]]);
});

test("HP invalida tracker e barre, ma non aura o zone", () => {
  const before = token();
  const after = token({
    metadata: { [META_KEY]: { ...before.metadata[META_KEY], hp: 4 } },
  });
  const event = classifySceneItemChanges([before], [after]);

  assert.equal(event.flags.hpBars, true);
  assert.ok(event.domains.includes("tracker"));
  assert.ok(event.domains.includes("hp"));
  assert.equal(event.domains.includes("aura"), false);
  assert.equal(event.domains.includes("zone"), false);
  assert.deepEqual(event.invalidations.hp, ["token-1"]);
});

test("le invalidazioni di un batch misto restano field e item scoped", () => {
  const hpToken = token({ id: "hp-token" });
  const conditionToken = token({ id: "condition-token" });
  const nextHPToken = token({
    id: "hp-token",
    metadata: { [META_KEY]: { ...hpToken.metadata[META_KEY], hp: 6 } },
  });
  const nextConditionToken = token({
    id: "condition-token",
    metadata: {
      [META_KEY]: {
        ...conditionToken.metadata[META_KEY],
        conditions: {
          version: 2,
          instances: [{ id: "prone", condition: "Prono", active: true }],
        },
      },
    },
  });
  const event = classifySceneItemChanges(
    [hpToken, conditionToken],
    [nextHPToken, nextConditionToken],
  );

  assert.deepEqual(event.invalidations.hp, ["hp-token"]);
  assert.deepEqual(event.invalidations.effects, ["condition-token"]);
  assert.deepEqual(collectEffectsInvalidation(event, {
    metaKey: META_KEY,
    spellsKey: `${ID}/spells`,
  }).conditions, ["condition-token"]);
});

test("le condizioni delle Capacità sono input canonici e raggiungono il reconciler effetti", async () => {
  let emit;
  const before = token({ id: "barbarian" });
  const after = token({
    id: "barbarian",
    metadata: {
      [META_KEY]: {
        ...before.metadata[META_KEY],
        conditions: {
          version: 2,
          instances: [{
            id: "class-feature:rage:barbarian",
            condition: "Ira",
            active: true,
            targetId: "barbarian",
            sourceId: "barbarian",
            parentEffectId: "rage-instance",
            type: "class-feature",
            effectId: "barbaro-ira",
          }],
        },
      },
    },
  });
  const dispatcher = createSceneItemChangeDispatcher({
    initialItems: [before],
    subscribeSource(handler) {
      emit = handler;
      return () => {};
    },
    setTimer(callback) { return callback; },
    clearTimer() {},
  });
  const effectsEvents = [];
  dispatcher.subscribe((event) => effectsEvents.push(event), {
    domains: ["effects"],
    filter: (event) => !event?.derived?.output,
  });

  emit([after]);
  await dispatcher.flush();
  assert.equal(effectsEvents.length, 1);
  assert.equal(effectsEvents[0].derived.effects, false);
  assert.deepEqual(effectsEvents[0].invalidations.effects, ["barbarian"]);
  assert.deepEqual(collectEffectsInvalidation(effectsEvents[0], {
    metaKey: META_KEY,
    spellsKey: `${ID}/spells`,
  }).conditions, ["barbarian"]);
});

test("cambiamenti strutturali richiedono il piano full", () => {
  const before = token();
  const after = token({
    metadata: {
      [META_KEY]: {
        ...before.metadata[META_KEY],
        initiative: 18,
        group: "frontline",
      },
    },
  });
  const event = classifySceneItemChanges([before], [after]);

  assert.equal(event.flags.trackerStructure, true);
  assert.equal(planIncrementalTrackerItemRender(event).mode, "full");
});

test("il dirty set conserva le card saltate da un editor fino alla chiusura", () => {
  const dirty = createDirtyItemSet();
  dirty.add("token-1");
  dirty.addMany(["token-1", "token-2"]);

  assert.equal(dirty.size, 2);
  assert.deepEqual(dirty.take(), ["token-1", "token-2"]);
  assert.equal(dirty.size, 0);
});

test("dispatcher e scheduler compattano una raffica sullo stato finale", async () => {
  let emit;
  const initial = token();
  const dispatcher = createSceneItemChangeDispatcher({
    initialItems: [initial],
    subscribeSource(handler) {
      emit = handler;
      return () => {};
    },
    setTimer(callback) { return callback; },
    clearTimer() {},
  });
  const renderedHP = [];
  const scheduler = createInitiativeRenderScheduler({ getSceneEpoch: () => 1 });
  dispatcher.subscribe((event) => {
    const plan = planIncrementalTrackerItemRender(event);
    const latestHP = event.items[0]?.metadata?.[META_KEY]?.hp;
    return scheduler.requestIncremental({
      sceneEpoch: event.sceneEpoch,
      sourceRevision: event.revision,
      itemIds: plan.itemIds,
      execute: async () => renderedHP.push(latestHP),
    }).done;
  }, { domains: ["tracker"] });

  for (const hp of [9, 7, 3]) {
    emit([token({ metadata: { [META_KEY]: { ...initial.metadata[META_KEY], hp } } })]);
  }
  await dispatcher.flush();
  await scheduler.idle();
  assert.deepEqual(renderedHP, [3]);
});

test("gli eventi durante un editor vengono compattati e applicati alla chiusura", async () => {
  let emit;
  let latest = token();
  let editorOpen = true;
  let renderedHP = null;
  const dirty = createDirtyItemSet();
  const dispatcher = createSceneItemChangeDispatcher({
    initialItems: [latest],
    subscribeSource(handler) {
      emit = handler;
      return () => {};
    },
    setTimer(callback) { return callback; },
    clearTimer() {},
  });
  const scheduler = createInitiativeRenderScheduler({ getSceneEpoch: () => 1 });
  dispatcher.subscribe((event) => {
    if (editorOpen) {
      dirty.addMany(event.invalidations.tracker);
      return null;
    }
    return scheduler.requestIncremental({
      sceneEpoch: 1,
      sourceRevision: event.revision,
      itemIds: event.invalidations.tracker,
      execute: async () => {
        renderedHP = latest.metadata[META_KEY].hp;
      },
    }).done;
  }, { domains: ["tracker"] });

  for (const hp of [8, 2]) {
    latest = token({ metadata: { [META_KEY]: { ...latest.metadata[META_KEY], hp } } });
    emit([latest]);
    await dispatcher.flush();
  }
  assert.equal(renderedHP, null);
  assert.deepEqual(dirty.values(), ["token-1"]);

  editorOpen = false;
  const closeRender = scheduler.requestIncremental({
    sceneEpoch: 1,
    sourceRevision: 2,
    itemIds: dirty.take(),
    execute: async () => {
      renderedHP = latest.metadata[META_KEY].hp;
    },
  });
  await closeRender.done;
  assert.equal(renderedHP, 2);
  assert.equal(dirty.size, 0);
});

test("uno scene epoch precedente non può aggiornare il DOM corrente", async () => {
  let currentEpoch = 1;
  const calls = [];
  const { scheduler, runNext } = controlledScheduler({
    getSceneEpoch: () => currentEpoch,
    isCurrent: (epoch) => epoch === currentEpoch,
    runFull: async () => calls.push("full"),
    runIncremental: async () => calls.push("incremental"),
  });

  const oldIncremental = scheduler.requestIncremental({
    sceneEpoch: 1,
    sourceRevision: 1,
    itemIds: ["token-1"],
  });
  currentEpoch = 2;
  const currentFull = scheduler.requestFull({
    sceneEpoch: 2,
    sourceRevision: 2,
  });
  runNext();

  const [oldResult, currentResult] = await Promise.all([
    oldIncremental.done,
    currentFull.done,
  ]);
  assert.equal(oldResult.status, "stale");
  assert.equal(currentResult.status, "committed");
  assert.deepEqual(calls, ["full"]);
});

test("un incremental con revisione superata viene scartato dietro la barriera full", async () => {
  const calls = [];
  const { scheduler, runNext } = controlledScheduler({
    runFull: async () => calls.push("full:2"),
    runIncremental: async () => calls.push("incremental:1"),
  });
  const staleIncremental = scheduler.requestIncremental({
    sceneEpoch: 1,
    sourceRevision: 1,
    itemIds: ["token-1"],
  });
  const currentFull = scheduler.requestFull({
    sceneEpoch: 1,
    sourceRevision: 2,
  });
  runNext();

  const [staleResult, fullResult] = await Promise.all([
    staleIncremental.done,
    currentFull.done,
  ]);
  assert.equal(staleResult.status, "stale");
  assert.equal(fullResult.status, "committed");
  assert.deepEqual(calls, ["full:2"]);
});

test("un full richiesto durante un full resta nella lane e parte dopo il primo", async () => {
  let releaseFirst;
  const firstGate = new Promise((resolve) => { releaseFirst = resolve; });
  const trace = [];
  const { scheduler, runNext } = controlledScheduler();
  const first = scheduler.requestFull({
    sceneEpoch: 1,
    sourceRevision: 1,
    execute: async () => {
      trace.push("first:start");
      await firstGate;
      trace.push("first:end");
    },
  });
  runNext();
  await Promise.resolve();

  const second = scheduler.requestFull({
    sceneEpoch: 1,
    sourceRevision: 2,
    execute: async () => trace.push("second"),
  });
  assert.equal(scheduler.getState().fullRunning, true);
  assert.equal(scheduler.getState().fullPending, true);
  releaseFirst();

  await Promise.all([first.done, second.done]);
  assert.deepEqual(trace, ["first:start", "first:end", "second"]);
});

test("un errore di render rigetta il waiter ma non blocca la richiesta successiva", async () => {
  const { scheduler, runNext } = controlledScheduler();
  const failed = scheduler.requestFull({
    sceneEpoch: 1,
    execute: async () => { throw new Error("render-failed"); },
  });
  runNext();
  await assert.rejects(failed.done, /render-failed/);
  await scheduler.idle();

  const trace = [];
  const recovered = scheduler.requestFull({
    sceneEpoch: 1,
    execute: async () => trace.push("recovered"),
  });
  runNext();
  assert.equal((await recovered.done).status, "committed");
  assert.deepEqual(trace, ["recovered"]);
});

test("una revisione precedente non sostituisce callback e motivo della successiva", async () => {
  const trace = [];
  const { scheduler, runNext } = controlledScheduler();
  const current = scheduler.requestIncremental({
    sceneEpoch: 1,
    sourceRevision: 2,
    reason: "current",
    itemIds: ["token-1"],
    execute: async ({ reason }) => trace.push(reason),
  });
  const lateOld = scheduler.requestIncremental({
    sceneEpoch: 1,
    sourceRevision: 1,
    reason: "old",
    itemIds: ["token-2"],
    execute: async ({ reason }) => trace.push(reason),
  });
  runNext();
  await Promise.all([current.done, lateOld.done]);
  assert.deepEqual(trace, ["current"]);
});

test("gli output derivati espongono il dominio ma non riattivano il reconciler proprietario", () => {
  const before = {
    id: "zone-1",
    type: "SHAPE",
    position: { x: 0, y: 0 },
    metadata: { [`${ID}/spellStaticZone`]: { role: "root", triggerRuntime: { pending: [] } } },
  };
  const after = {
    ...before,
    metadata: { [`${ID}/spellStaticZone`]: { role: "root", triggerRuntime: { pending: [{ id: "activation-1" }] } } },
  };
  const event = classifySceneItemChanges([before], [after]);

  assert.equal(event.derived.output, true);
  assert.ok(event.domains.includes("zone"));
  assert.ok(event.domains.includes("derived"));
  assert.equal(event.flags.tracker, false);
});

test("un output zona derivato attraversa il dispatcher senza riaprire il writer", async () => {
  let emit;
  const before = {
    id: "zone-1",
    type: "SHAPE",
    position: { x: 0, y: 0 },
    metadata: { [`${ID}/spellStaticZone`]: { role: "root", revision: 1 } },
  };
  const after = {
    ...before,
    metadata: { [`${ID}/spellStaticZone`]: { role: "root", revision: 2 } },
  };
  const dispatcher = createSceneItemChangeDispatcher({
    initialItems: [before],
    subscribeSource(handler) {
      emit = handler;
      return () => {};
    },
    setTimer(callback) { return callback; },
    clearTimer() {},
  });
  let writerRuns = 0;
  dispatcher.subscribe(() => { writerRuns += 1; }, {
    domains: ["zone"],
    filter: (event) => !event?.derived?.output,
  });

  emit([after]);
  await dispatcher.flush();
  assert.equal(writerRuns, 0);
});

test("il dispatcher filtra per dominio e conserva il correlation ID disponibile", async () => {
  let emit;
  const dispatcher = createSceneItemChangeDispatcher({
    initialItems: [token()],
    subscribeSource(handler) {
      emit = handler;
      return () => {};
    },
    setTimer(callback) { return callback; },
    clearTimer() {},
  });
  const hpEvents = [];
  const auraEvents = [];
  dispatcher.subscribe((event) => hpEvents.push(event), { domains: ["hp"] });
  dispatcher.subscribe((event) => auraEvents.push(event), { domains: ["aura"] });

  emit([token({ metadata: { [META_KEY]: { ...token().metadata[META_KEY], hp: 5 } } })], {
    correlationId: "effects-command-1",
  });
  await dispatcher.flush();

  assert.equal(hpEvents.length, 1);
  assert.equal(hpEvents[0].correlationId, "effects-command-1");
  assert.equal(auraEvents.length, 0);
});

test("i quattro controller aura/zone usano soltanto invalidazioni dell'hub", () => {
  const contracts = [
    ["../src/spellAuraController.js", "aura"],
    ["../src/classFeatureAuraController.js", "aura"],
    ["../src/spellStaticZone.js", "zone"],
    ["../src/preparedSpellResolutionController.js", "prepared-spells"],
  ];
  for (const [path, domain] of contracts) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.match(source, /subscribeSceneItemChanges/);
    assert.match(source, new RegExp(`domains:\\s*\\["${domain}"\\]`));
    assert.doesNotMatch(source, /OBR\.scene\.items\.onChange/);
  }
});

test("i listener condivisi residui usano domini dell'hub", () => {
  const contracts = [
    ["../src/elevationLabel.js", "elevation"],
    ["../src/aoeTargetTool.js", "zone"],
    ["../src/classFeatureReminderController.js", "hp"],
  ];
  for (const [path, domain] of contracts) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.match(source, /subscribeSceneItemChanges/);
    assert.match(source, new RegExp(`domains:\\s*\\["${domain}"\\]`));
    assert.doesNotMatch(source, /OBR\.scene\.items\.onChange/);
  }
});

test("il gateway full produttivo non usa sentinel né bypassa lo scheduler", () => {
  const source = readFileSync(
    new URL("../src/initiativeList.js", import.meta.url),
    "utf8",
  );
  const requestStart = source.indexOf("async function renderAll");
  const executeStart = source.indexOf("async function __executeFullRenderRequest");
  assert.ok(requestStart >= 0 && executeStart > requestStart);
  const requestSource = source.slice(requestStart, executeStart);
  assert.match(requestSource, /scheduler\.requestFull/);
  assert.match(requestSource, /execute:\s*__executeFullRenderRequest/);
  assert.doesNotMatch(source, /__scheduledFullRender/);
  assert.doesNotMatch(requestSource, /setSceneState/);
  const executeEnd = source.indexOf("OBR.onReady(async () =>", executeStart);
  assert.ok(executeEnd > executeStart);
  const executeSource = source.slice(executeStart, executeEnd);
  assert.doesNotMatch(executeSource, /__reconcileSanitizedInitiativeState/);
  assert.doesNotMatch(executeSource, /setSceneState/);
});
