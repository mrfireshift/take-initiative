import test from "node:test";
import assert from "node:assert/strict";
import {
  createHistoryOwnerBroker,
  HISTORY_OWNER_STATUS,
} from "../src/historyOwnerCore.js";

const clone = (value) => structuredClone(value);
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function createHarness({
  onWrite = null,
  onRead = null,
  onNotify = null,
  onCombatLog = null,
} = {}) {
  let state = { version: 1, entries: [] };
  let activeEpoch = 1;
  const writes = [];
  const notifications = [];
  const combatLog = [];
  const reads = [];
  let broker;

  broker = createHistoryOwnerBroker({
    readHistory: async (context) => {
      reads.push(context.scene.identity);
      await onRead?.(context);
      return clone(state);
    },
    writeHistory: async (next, context) => {
      writes.push(clone(next));
      await onWrite?.(next, context);
      if (context.scene.epoch === activeEpoch) state = clone(next);
    },
    notify: async (result, context) => {
      notifications.push({ result: clone(result), context: clone(context.scene) });
      await onNotify?.(result, context);
    },
    recordCombatLog: async (entry, context) => {
      combatLog.push({ entry: clone(entry), context: clone(context.scene) });
      await onCombatLog?.(entry, context);
    },
    isSceneCurrent: (scene) => scene.epoch === activeEpoch,
  });
  broker.setSceneContext({ ready: true, sceneIdentity: "scene-A", sceneEpoch: activeEpoch });

  const command = (kind, payload = {}, suffix = `${kind}-${Math.random()}`) => broker.handle({
    requestId: `request:${suffix}`,
    commandId: `command:${suffix}`,
    correlationId: `correlation:${suffix}`,
    sceneIdentity: "scene-A",
    kind,
    ...payload,
  });

  return {
    broker,
    command,
    get state() { return clone(state); },
    writes,
    notifications,
    combatLog,
    reads,
    switchScene() {
      activeEpoch = 2;
      broker.setSceneContext({ ready: true, sceneIdentity: "scene-B", sceneEpoch: activeEpoch });
    },
  };
}

function entry(id, payload = {}) {
  return {
    id,
    version: 1,
    at: 1,
    kind: "change",
    label: id,
    changes: [{ id: `token-${id}`, before: {}, after: payload }],
  };
}

test("due realm concorrenti conservano entrambe le append nello stesso owner", async () => {
  const harness = createHarness();
  const [first, second] = await Promise.all([
    harness.command("append", { entry: entry("A") }, "A"),
    harness.command("append", { entry: entry("B") }, "B"),
  ]);

  assert.equal(first.status, HISTORY_OWNER_STATUS.APPLIED);
  assert.equal(second.status, HISTORY_OWNER_STATUS.APPLIED);
  assert.deepEqual(harness.state.entries.map((item) => item.id), ["A", "B"]);
  assert.equal(harness.writes.length, 2);
});

test("tre append concorrenti vengono serializzate in ordine di arrivo", async () => {
  const harness = createHarness();
  await Promise.all([
    harness.command("append", { entry: entry("A") }, "A"),
    harness.command("append", { entry: entry("B") }, "B"),
    harness.command("append", { entry: entry("C") }, "C"),
  ]);
  assert.deepEqual(harness.state.entries.map((item) => item.id), ["A", "B", "C"]);
  assert.deepEqual(harness.reads, ["scene-A", "scene-A", "scene-A"]);
});

test("le letture della stessa baseline non causano lost update", async () => {
  let releaseFirstRead;
  const firstRead = new Promise((resolve) => { releaseFirstRead = resolve; });
  let readCount = 0;
  const harness = createHarness({
    onRead: async () => {
      readCount += 1;
      if (readCount === 1) await firstRead;
    },
  });
  const first = harness.command("append", { entry: entry("A") }, "A");
  const second = harness.command("append", { entry: entry("B") }, "B");
  releaseFirstRead();
  await Promise.all([first, second]);
  assert.deepEqual(harness.state.entries.map((item) => item.id), ["A", "B"]);
});

test("retry dello stesso entry ID è duplicate senza riordino, retention o side effect", async () => {
  const harness = createHarness();
  for (const id of ["A", "B", "C"]) {
    await harness.command("append", { entry: entry(id) }, id);
  }
  const writes = harness.writes.length;
  const notifications = harness.notifications.length;
  const combatLog = harness.combatLog.length;
  const retry = await harness.command("append", { entry: entry("A") }, "retry-A");

  assert.equal(retry.status, HISTORY_OWNER_STATUS.DUPLICATE);
  assert.deepEqual(harness.state.entries.map((item) => item.id), ["A", "B", "C"]);
  assert.equal(harness.writes.length, writes);
  assert.equal(harness.notifications.length, notifications);
  assert.equal(harness.combatLog.length, combatLog);
});

test("same entry ID con payload diverso restituisce conflict e conserva il primo payload", async () => {
  const harness = createHarness();
  await harness.command("append", { entry: entry("A", { hp: 4 }) }, "first");
  const writes = harness.writes.length;
  const conflict = await harness.command("append", { entry: entry("A", { hp: 9 }) }, "conflict");

  assert.equal(conflict.status, HISTORY_OWNER_STATUS.CONFLICT);
  assert.equal(conflict.conflict.reason, "entry-id-payload-mismatch");
  assert.equal(harness.state.entries[0].changes[0].after.hp, 4);
  assert.equal(harness.writes.length, writes);
  assert.equal(harness.combatLog.length, 1);
});

test("rimozione ID-scoped accodata con append preserva la nuova entry", async () => {
  let appendQueued;
  const harness = createHarness({
    onWrite: async (next) => {
      if (next.entries.every((item) => item.id !== "old") && !appendQueued) {
        appendQueued = harness.command("append", { entry: entry("new") }, "new");
      }
    },
  });
  await harness.command("append", { entry: entry("old") }, "old");
  const removed = await harness.command("remove", { ids: ["old"] }, "remove-old");
  const appended = await appendQueued;

  assert.equal(removed.status, HISTORY_OWNER_STATUS.REMOVED);
  assert.equal(appended.status, HISTORY_OWNER_STATUS.APPLIED);
  assert.deepEqual(harness.state.entries.map((item) => item.id), ["new"]);
});

test("rimozione duplicata è idempotente", async () => {
  const harness = createHarness();
  await harness.command("append", { entry: entry("A") }, "A");
  const first = await harness.command("remove", { ids: ["A"] }, "remove-1");
  const writes = harness.writes.length;
  const notifications = harness.notifications.length;
  const second = await harness.command("remove", { ids: ["A"] }, "remove-2");

  assert.equal(first.status, HISTORY_OWNER_STATUS.REMOVED);
  assert.equal(second.status, HISTORY_OWNER_STATUS.NOOP);
  assert.equal(harness.writes.length, writes);
  assert.equal(harness.notifications.length, notifications);
});

test("la retention è centrale, resta a 30 e mantiene l'ordine", async () => {
  const harness = createHarness();
  for (let index = 0; index < 31; index += 1) {
    await harness.command("append", { entry: entry(`E${index}`) }, `E${index}`);
  }
  assert.equal(harness.state.entries.length, 30);
  assert.equal(harness.state.entries[0].id, "E1");
  assert.equal(harness.state.entries.at(-1).id, "E30");
});

test("un comando fallito non blocca il successivo", async () => {
  let fail = true;
  const harness = createHarness({
    onWrite: async () => {
      if (fail) {
        fail = false;
        throw new Error("write failed");
      }
    },
  });
  const [failed, applied] = await Promise.all([
    harness.command("append", { entry: entry("failed") }, "failed"),
    harness.command("append", { entry: entry("next") }, "next"),
  ]);
  assert.equal(failed.status, HISTORY_OWNER_STATUS.FAILED);
  assert.equal(applied.status, HISTORY_OWNER_STATUS.APPLIED);
  assert.deepEqual(harness.state.entries.map((item) => item.id), ["next"]);
});

test("retry dopo un timeout ambiguo converge a una sola entry", async () => {
  const harness = createHarness();
  const original = entry("ambiguous");
  const committed = await harness.command("append", { entry: original }, "first-request");
  assert.equal(committed.status, HISTORY_OWNER_STATUS.APPLIED);
  const retry = await harness.command("append", { entry: original }, "retry-request");
  assert.equal(retry.status, HISTORY_OWNER_STATUS.DUPLICATE);
  assert.equal(harness.state.entries.filter((item) => item.id === "ambiguous").length, 1);
  assert.equal(harness.combatLog.filter((item) => item.entry.id === "ambiguous").length, 1);
});

test("scene switch mentre il comando è in coda scarta il comando vecchio", async () => {
  let releaseWrite;
  const writeGate = new Promise((resolve) => { releaseWrite = resolve; });
  const harness = createHarness({ onWrite: () => writeGate });
  const first = harness.command("append", { entry: entry("A") }, "A");
  const second = harness.command("append", { entry: entry("B") }, "B");
  await tick();
  harness.switchScene();
  releaseWrite();
  const [firstResult, secondResult] = await Promise.all([first, second]);

  assert.equal(firstResult.status, HISTORY_OWNER_STATUS.REJECTED);
  assert.equal(secondResult.status, HISTORY_OWNER_STATUS.REJECTED);
  assert.deepEqual(harness.state.entries, []);
  assert.equal(harness.combatLog.length, 0);
});

test("scene switch durante getMetadata non arriva alla write", async () => {
  let releaseRead;
  const readGate = new Promise((resolve) => { releaseRead = resolve; });
  const harness = createHarness({ onRead: () => readGate });
  const pending = harness.command("append", { entry: entry("stale-read") }, "stale-read");
  await tick();
  harness.switchScene();
  releaseRead();
  const result = await pending;

  assert.equal(result.status, HISTORY_OWNER_STATUS.REJECTED);
  assert.equal(harness.writes.length, 0);
  assert.deepEqual(harness.state.entries, []);
});

test("un risultato stale che si risolve dopo lo switch non ripopola la cache nuova", async () => {
  let releaseRead;
  const readStarted = new Promise((resolve) => { releaseRead = resolve; });
  let unblockRead;
  const readGate = new Promise((resolve) => { unblockRead = resolve; });
  const harness = createHarness({
    onRead: async () => {
      releaseRead();
      await readGate;
    },
  });
  const staleRequest = harness.command("append", { entry: entry("stale-cache") }, "stale-cache");
  await readStarted;
  harness.switchScene();
  unblockRead();
  assert.equal((await staleRequest).status, HISTORY_OWNER_STATUS.REJECTED);

  const fresh = await harness.broker.handle({
    requestId: "request:stale-cache",
    commandId: "command:fresh-cache",
    correlationId: "correlation:fresh-cache",
    sceneIdentity: "scene-B",
    kind: "append",
    entry: entry("fresh-cache"),
  });
  assert.equal(fresh.status, HISTORY_OWNER_STATUS.APPLIED);
  assert.deepEqual(harness.state.entries.map((item) => item.id), ["fresh-cache"]);
});

test("scene switch durante write non emette side effect e la risposta è stale", async () => {
  let releaseWrite;
  const writeGate = new Promise((resolve) => { releaseWrite = resolve; });
  const harness = createHarness({ onWrite: () => writeGate });
  const pending = harness.command("append", { entry: entry("stale-write") }, "stale-write");
  await tick();
  harness.switchScene();
  releaseWrite();
  const result = await pending;

  assert.equal(result.status, HISTORY_OWNER_STATUS.REJECTED);
  assert.equal(result.committed, true);
  assert.equal(harness.notifications.length, 0);
  assert.equal(harness.combatLog.length, 0);
});

test("una risposta della scena precedente non riusa la cache nella scena nuova", async () => {
  const harness = createHarness();
  const first = await harness.command("append", { entry: entry("A") }, "A");
  assert.equal(first.status, HISTORY_OWNER_STATUS.APPLIED);
  harness.switchScene();
  const staleRequest = await harness.broker.handle({
    requestId: "request:A",
    commandId: "command:A",
    correlationId: "correlation:A",
    sceneIdentity: "scene-A",
    kind: "append",
    entry: entry("A"),
  });
  assert.equal(staleRequest.status, HISTORY_OWNER_STATUS.REJECTED);
  assert.equal(staleRequest.reason, "stale-scene-identity");
});

test("owner non pronto non effettua scritture", async () => {
  let writes = 0;
  const broker = createHistoryOwnerBroker({
    readHistory: async () => ({ entries: [] }),
    writeHistory: async () => { writes += 1; },
  });
  const result = await broker.handle({
    requestId: "player-request",
    commandId: "player-command",
    kind: "append",
    entry: entry("player"),
  });
  assert.equal(result.status, HISTORY_OWNER_STATUS.REJECTED);
  assert.equal(writes, 0);
});

test("Combat Log e notifica avvengono una volta per entry nuova e non invalidano History", async () => {
  const harness = createHarness({
    onNotify: async () => { throw new Error("notification unavailable"); },
    onCombatLog: async () => { throw new Error("combat log unavailable"); },
  });
  const result = await harness.command("append", { entry: entry("new") }, "new");
  assert.equal(result.status, HISTORY_OWNER_STATUS.APPLIED);
  assert.equal(result.changed, true);
  assert.equal(result.postCommitErrors.length, 2);
  assert.deepEqual(harness.state.entries.map((item) => item.id), ["new"]);
});

test("contesto duplicato conserva identity/generation e non invalida un comando in volo", async () => {
  let releaseRead;
  const readStarted = new Promise((resolve) => {
    releaseRead = resolve;
  });
  let unblockRead;
  const readGate = new Promise((resolve) => {
    unblockRead = resolve;
  });
  const harness = createHarness({
    onRead: async () => {
      releaseRead();
      await readGate;
    },
  });
  const before = harness.broker.getSceneContext();
  const pending = harness.command("append", { entry: entry("duplicate-context") }, "duplicate-context");
  await readStarted;

  const duplicate = harness.broker.setSceneContext({
    ready: true,
    sceneIdentity: "scene-different-but-same-epoch",
    sceneEpoch: 1,
  });
  assert.deepEqual(duplicate, before);
  unblockRead();
  assert.equal((await pending).status, HISTORY_OWNER_STATUS.APPLIED);

  const unavailable = harness.broker.setSceneContext({ ready: false, sceneEpoch: 2 });
  const duplicateUnavailable = harness.broker.setSceneContext({ ready: false, sceneEpoch: 3 });
  assert.equal(duplicateUnavailable.generation, unavailable.generation);
  assert.equal(duplicateUnavailable.identity, null);
});
