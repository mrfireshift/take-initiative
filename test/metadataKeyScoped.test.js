import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  clearSceneMetadataKey,
  METADATA_CLEAR_TOMBSTONE,
  METADATA_OWNERSHIP,
  writeRoomMetadataKey,
  writeSceneMetadataKey,
} from "../src/metadataKeyScoped.js";
import {
  DeterministicMetadataHarness,
  DeterministicSceneEpochHarness,
} from "../test-support/metadataKeyScopedHarness.js";

const STATE_KEY = METADATA_OWNERSHIP.INITIATIVE_STATE.key;
const HISTORY_KEY = METADATA_OWNERSHIP.HISTORY.key;
const CLOCKS_KEY = METADATA_OWNERSHIP.CLOCKS.key;
const COMBAT_SESSION_KEY = METADATA_OWNERSHIP.COMBAT_LOG_SESSION.key;
const REGISTRY_KEY = METADATA_OWNERSHIP.REGISTRY.key;
const CARDS_KEY = METADATA_OWNERSHIP.INITIATIVE_CARDS.key;
const ROOM_MEMORY_KEY = METADATA_OWNERSHIP.ROOM_MEMORY.key;
const SPEED_CONTROL_KEY = METADATA_OWNERSHIP.SPEED_CHECK_CONTROL.key;
const combatLogSource = readFileSync(new URL("../src/combatLog.js", import.meta.url), "utf8");

function pendingId(harness, predicate) {
  const operation = harness.pendingOperations().find(predicate);
  assert.ok(operation, "operazione metadata attesa non trovata");
  return operation.id;
}

test("ARCH-002 scrive una sola chiave top-level e conserva gli unknown", async () => {
  const harness = new DeterministicMetadataHarness({
    scene: {
      [STATE_KEY]: { round: 1 },
      "com.other.extension/unknown": { keep: true },
    },
  });
  const api = harness.api("scene");

  const stale = await api.getMetadata();
  const write = writeSceneMetadataKey(
    api,
    METADATA_OWNERSHIP.INITIATIVE_STATE,
    { ...stale[STATE_KEY], current: 2 },
    { runtime: "test-runtime" },
  );
  const [operation] = harness.pendingOperations();
  assert.deepEqual(Object.keys(operation.update), [STATE_KEY]);
  harness.commit(operation.id);
  await write;

  assert.deepEqual(harness.snapshot("scene"), {
    [STATE_KEY]: { round: 1, current: 2 },
    "com.other.extension/unknown": { keep: true },
  });
});

test("ARCH-002 initiative state sopravvive a un commit history fuori ordine", async () => {
  const harness = new DeterministicMetadataHarness({
    scene: {
      [STATE_KEY]: { round: 1, current: 0 },
      [HISTORY_KEY]: { version: 1, entries: [] },
    },
  });
  const api = harness.api("scene");
  const staleState = await api.getMetadata();
  const initiativeWrite = writeSceneMetadataKey(
    api,
    METADATA_OWNERSHIP.INITIATIVE_STATE,
    { ...staleState[STATE_KEY], current: 1 },
    { runtime: "initiativeList" },
  );
  const historyWrite = writeSceneMetadataKey(
    api,
    METADATA_OWNERSHIP.HISTORY,
    { version: 1, entries: [{ id: "history-b" }] },
    { runtime: "history" },
  );

  harness.commit(pendingId(harness, (operation) => operation.scope === "scene"
    && Object.hasOwn(operation.update, HISTORY_KEY)));
  harness.commit(pendingId(harness, (operation) => operation.scope === "scene"
    && Object.hasOwn(operation.update, STATE_KEY)));
  await Promise.all([initiativeWrite, historyWrite]);

  assert.equal(harness.snapshot("scene")[STATE_KEY].current, 1);
  assert.deepEqual(harness.snapshot("scene")[HISTORY_KEY].entries, [{ id: "history-b" }]);
});

test("ARCH-002 history sopravvive a un cambio initiative state fuori ordine", async () => {
  const harness = new DeterministicMetadataHarness({
    scene: {
      [STATE_KEY]: { round: 1, current: 0 },
      [HISTORY_KEY]: { version: 1, entries: [] },
    },
  });
  const api = harness.api("scene");
  const staleHistory = await api.getMetadata();
  const historyWrite = writeSceneMetadataKey(
    api,
    METADATA_OWNERSHIP.HISTORY,
    { ...staleHistory[HISTORY_KEY], entries: [{ id: "history-a" }] },
    { runtime: "history" },
  );
  const initiativeWrite = writeSceneMetadataKey(
    api,
    METADATA_OWNERSHIP.INITIATIVE_STATE,
    { round: 2, current: 1 },
    { runtime: "initiativeList" },
  );

  harness.commit(pendingId(harness, (operation) => Object.hasOwn(operation.update, STATE_KEY)));
  harness.commit(pendingId(harness, (operation) => Object.hasOwn(operation.update, HISTORY_KEY)));
  await Promise.all([historyWrite, initiativeWrite]);

  assert.deepEqual(harness.snapshot("scene")[STATE_KEY], { round: 2, current: 1 });
  assert.deepEqual(harness.snapshot("scene")[HISTORY_KEY].entries, [{ id: "history-a" }]);
});

test("ARCH-002 clocks e combat session restano separati in qualunque ordine", async () => {
  const harness = new DeterministicMetadataHarness({
    scene: {
      [CLOCKS_KEY]: { clocks: [{ id: "rituale", value: 1 }] },
      [COMBAT_SESSION_KEY]: { version: 1, sessionId: "session-a" },
    },
  });
  const api = harness.api("scene");
  const clocksWrite = writeSceneMetadataKey(
    api,
    METADATA_OWNERSHIP.CLOCKS,
    { clocks: [{ id: "rituale", value: 2 }] },
    { runtime: "clocks" },
  );
  const sessionWrite = writeSceneMetadataKey(
    api,
    METADATA_OWNERSHIP.COMBAT_LOG_SESSION,
    { version: 1, sessionId: "session-b" },
    { runtime: "combatLog" },
  );

  harness.commit(pendingId(harness, (operation) => Object.hasOwn(operation.update, COMBAT_SESSION_KEY)));
  harness.commit(pendingId(harness, (operation) => Object.hasOwn(operation.update, CLOCKS_KEY)));
  await Promise.all([clocksWrite, sessionWrite]);

  assert.equal(harness.snapshot("scene")[CLOCKS_KEY].clocks[0].value, 2);
  assert.equal(harness.snapshot("scene")[COMBAT_SESSION_KEY].sessionId, "session-b");
});

test("ARCH-002 Room separa registry, initiative cards, memory e speed control senza ripristinare unknown", async () => {
  const unknownKey = "com.other.extension/room-unknown";
  const harness = new DeterministicMetadataHarness({
    room: {
      [REGISTRY_KEY]: { pc: { updatedAt: 1 } },
      [CARDS_KEY]: { hero: { updatedAt: 1 } },
      [ROOM_MEMORY_KEY]: { hero: { hp: 8, hpMax: 10 } },
      [unknownKey]: { keep: "yes" },
    },
  });
  const api = harness.api("room");
  const registryWrite = writeRoomMetadataKey(
    api,
    METADATA_OWNERSHIP.REGISTRY,
    { pc: { updatedAt: 2 } },
    { runtime: "factionRegistry" },
  );
  const cardsWrite = writeRoomMetadataKey(
    api,
    METADATA_OWNERSHIP.INITIATIVE_CARDS,
    { hero: { updatedAt: 2 } },
    { runtime: "initiativeCards" },
  );
  const memoryWrite = writeRoomMetadataKey(
    api,
    METADATA_OWNERSHIP.ROOM_MEMORY,
    { hero: { hp: 6, hpMax: 10 } },
    { runtime: "hpMemory" },
  );
  const speedControlWrite = writeRoomMetadataKey(
    api,
    METADATA_OWNERSHIP.SPEED_CHECK_CONTROL,
    { version: 1, enabled: true, updatedAt: 10 },
    { runtime: "speedCheck" },
  );

  // Il budget Room deve leggere il documento completo prima del setMetadata.
  // Lasciamo completare quel read per poter controllare le quattro operazioni
  // key-scoped già accodate nel harness.
  await new Promise((resolve) => setImmediate(resolve));

  harness.commit(pendingId(harness, (operation) => Object.hasOwn(operation.update, ROOM_MEMORY_KEY)));
  harness.commit(pendingId(harness, (operation) => Object.hasOwn(operation.update, REGISTRY_KEY)));
  harness.commit(pendingId(harness, (operation) => Object.hasOwn(operation.update, CARDS_KEY)));
  harness.commit(pendingId(harness, (operation) => Object.hasOwn(operation.update, SPEED_CONTROL_KEY)));
  await Promise.all([registryWrite, cardsWrite, memoryWrite, speedControlWrite]);

  assert.equal(harness.snapshot("room")[REGISTRY_KEY].pc.updatedAt, 2);
  assert.equal(harness.snapshot("room")[CARDS_KEY].hero.updatedAt, 2);
  assert.equal(harness.snapshot("room")[ROOM_MEMORY_KEY].hero.hp, 6);
  assert.equal(harness.snapshot("room")[SPEED_CONTROL_KEY].enabled, true);
  assert.deepEqual(harness.snapshot("room")[unknownKey], { keep: "yes" });
});

test("ARCH-002 fallimenti includono scope, dominio, chiave e runtime senza log di default", async () => {
  const calls = [];
  const api = {
    setMetadata(update) {
      calls.push(update);
      return Promise.reject(new Error("permesso negato"));
    },
  };

  await assert.rejects(
    writeSceneMetadataKey(
      api,
      METADATA_OWNERSHIP.HISTORY,
      { entries: [] },
      { runtime: "history-test" },
    ),
    (error) => error.name === "MetadataKeyWriteError"
      && error.message.includes("scene/history")
      && error.message.includes(HISTORY_KEY)
      && error.message.includes("history-test")
      && error.cause?.message === "permesso negato",
  );
  assert.deepEqual(Object.keys(calls[0]), [HISTORY_KEY]);
});

test("ARCH-002 clear usa un tombstone null sulla sola chiave posseduta", async () => {
  const unknownKey = "com.other.extension/scene-unknown";
  const harness = new DeterministicMetadataHarness({
    scene: {
      [STATE_KEY]: { round: 4, current: 2 },
      [COMBAT_SESSION_KEY]: { version: 1, sessionId: "session-old" },
      [unknownKey]: { keep: true },
    },
  });
  const clear = clearSceneMetadataKey(
    harness.api("scene"),
    METADATA_OWNERSHIP.COMBAT_LOG_SESSION,
    { runtime: "combatLog" },
  );
  const [operation] = harness.pendingOperations();
  assert.deepEqual(Object.keys(operation.update), [COMBAT_SESSION_KEY]);
  assert.equal(operation.update[COMBAT_SESSION_KEY], METADATA_CLEAR_TOMBSTONE);
  harness.commit(operation.id);
  await clear;

  const cleared = harness.snapshot("scene");
  assert.equal(cleared[COMBAT_SESSION_KEY], null);
  assert.deepEqual(cleared[STATE_KEY], { round: 4, current: 2 });
  assert.deepEqual(cleared[unknownKey], { keep: true });
});

test("ARCH-002 il tombstone disattiva la sessione e consente di crearne una nuova", async () => {
  const harness = new DeterministicMetadataHarness({
    scene: { [COMBAT_SESSION_KEY]: { version: 1, sessionId: "session-old" } },
  });
  const api = harness.api("scene");
  const clear = clearSceneMetadataKey(
    api,
    METADATA_OWNERSHIP.COMBAT_LOG_SESSION,
    { runtime: "combatLog" },
  );
  harness.commitNext();
  await clear;
  assert.equal(harness.snapshot("scene")[COMBAT_SESSION_KEY], null);

  const replacement = {
    version: 1,
    sessionId: "session-new",
    name: "Nuova sessione",
    startedAt: 42,
  };
  const create = writeSceneMetadataKey(
    api,
    METADATA_OWNERSHIP.COMBAT_LOG_SESSION,
    replacement,
    { runtime: "combatLog" },
  );
  harness.commitNext();
  await create;
  assert.deepEqual(harness.snapshot("scene")[COMBAT_SESSION_KEY], replacement);

  assert.match(combatLogSource, /function normalizeSessionState\(value\)/);
  assert.match(combatLogSource, /value === null \|\| value === undefined/);
  assert.match(combatLogSource, /return normalizeSessionState\(metadata\?\.\[SESSION_STATE_KEY\]\)/);
});

test("ARCH-002 rifiuta undefined e i clear di produzione usano l'helper dedicato", async () => {
  const calls = [];
  await assert.rejects(
    writeSceneMetadataKey(
      { setMetadata(update) { calls.push(update); } },
      METADATA_OWNERSHIP.COMBAT_LOG_SESSION,
      undefined,
      { runtime: "test" },
    ),
    /Valore undefined non JSON-safe/,
  );
  assert.deepEqual(calls, []);

  const deleteStart = combatLogSource.indexOf("export async function deleteCombatLogSession");
  const deleteEnd = combatLogSource.indexOf("export async function getActiveCombatLogData", deleteStart);
  const deleteSection = combatLogSource.slice(deleteStart, deleteEnd);
  assert.match(deleteSection, /clearSceneMetadataKey\(/);
  assert.doesNotMatch(deleteSection, /writeSceneMetadataKey\([\s\S]*?undefined/);
});

test("ARCH-002 non risolve due mutazioni concorrenti sulla stessa chiave", async () => {
  const harness = new DeterministicMetadataHarness({
    scene: { [STATE_KEY]: { round: 1, current: 0 } },
  });
  const api = harness.api("scene");
  const stale = await api.getMetadata();
  const first = writeSceneMetadataKey(
    api,
    METADATA_OWNERSHIP.INITIATIVE_STATE,
    { ...stale[STATE_KEY], current: 1 },
    { runtime: "runtime-a" },
  );
  const second = writeSceneMetadataKey(
    api,
    METADATA_OWNERSHIP.INITIATIVE_STATE,
    { ...stale[STATE_KEY], current: 2 },
    { runtime: "runtime-b" },
  );

  const pending = harness.pendingOperations();
  harness.commit(pending[1].id);
  harness.commit(pending[0].id);
  await Promise.all([first, second]);

  // È esplicito: la semantica resta last-commit-wins sulla stessa chiave.
  assert.equal(harness.snapshot("scene")[STATE_KEY].current, 1);
});

test("ARCH-001: cambio scena, baseline e scarto dell'epoch precedente restano protetti", () => {
  const source = readFileSync(new URL("../src/hpbar-items.js", import.meta.url), "utf8");
  assert.match(source, /let\s+_sceneEpoch\s*=\s*0/);
  assert.match(source, /function resetRuntimeState\(\)\s*\{[\s\S]*?_sceneEpoch\s*\+=\s*1/);
  assert.ok((source.match(/epoch !== _sceneEpoch/g) || []).length >= 4);

  const harness = new DeterministicSceneEpochHarness();
  harness.changeScene({ sceneId: "scene-a" });
  const oldOperation = harness.capture({ kind: "baseline", sceneId: "scene-a" });
  harness.changeScene({ sceneId: "scene-b" });
  const currentOperation = harness.capture({ kind: "baseline", sceneId: "scene-b" });
  assert.equal(harness.commit(oldOperation), false);
  assert.deepEqual(harness.commit(currentOperation), { kind: "baseline", sceneId: "scene-b" });
});
