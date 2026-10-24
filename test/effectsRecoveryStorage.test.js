import test from "node:test";
import assert from "node:assert/strict";
import {
  EFFECTS_RECOVERY_KEY,
  createEffectsRecovery,
  createSceneEffectsRecoveryStorage,
} from "../src/effectsRecovery.js";

const ROOM_ID = "room-1";

function memoryStorage(initial) {
  let value = initial === undefined ? undefined : structuredClone(initial);
  const writes = [];
  return {
    writes,
    current: () => value,
    read: async () => (value === undefined ? undefined : structuredClone(value)),
    write: async (next) => {
      writes.push(structuredClone(next));
      value = structuredClone(next);
    },
  };
}

function sceneOnlyObr() {
  return {
    room: { id: ROOM_ID },
    scene: {
      getMetadata: async () => { throw new Error("scene metadata must not be read"); },
      setMetadata: async () => { throw new Error("scene metadata must not be written"); },
    },
  };
}

function recoveryWith(storage, appended) {
  return createEffectsRecovery({
    obr: sceneOnlyObr(),
    storage,
    buildHistory: async (command) => ({
      id: `effects-history:${command.commandId}`,
      changes: [{ id: "token-a" }],
      effectsMutation: { commandId: command.commandId, changes: [{ id: "token-a" }], sideEffects: [] },
    }),
    appendHistory: async (entry, commandId) => { appended.push({ entryId: entry.id, commandId }); },
    inspectCanonical: async () => "after",
    applySideEffect: async () => {},
  });
}

test("il journal usa lo storage iniettato e non tocca i metadata di scena", async () => {
  const storage = memoryStorage();
  const appended = [];
  const recovery = recoveryWith(storage, appended);
  const isCurrent = () => true;
  await recovery.load(isCurrent);

  const command = { commandId: "cmd-1", correlationId: "cmd-1", kind: "token:teleport" };
  const record = await recovery.prepare(command, { changes: [{ id: "token-a" }] }, [], isCurrent);
  assert.equal(record.phase, "PREPARED");
  const result = await recovery.resume(record, isCurrent, { canonicalCommitted: true });

  assert.equal(result.status, "applied");
  assert.equal(result.recoveryPending, false);
  assert.deepEqual(appended, [{ entryId: "effects-history:cmd-1", commandId: "cmd-1" }]);
  assert.deepEqual(storage.writes.map((value) => Object.values(value.records).map((entry) => entry.phase)), [
    ["PREPARED"],
    ["HISTORY_PENDING"],
    [],
  ]);
  assert.deepEqual(storage.current().receipts.map((receipt) => receipt.commandId), ["cmd-1"]);
});

test("un record pendente nello storage iniettato viene ripreso dopo un nuovo load", async () => {
  const first = memoryStorage();
  const recovery = recoveryWith(first, []);
  const isCurrent = () => true;
  await recovery.load(isCurrent);
  await recovery.prepare({ commandId: "cmd-2", correlationId: "cmd-2", kind: "token:teleport" }, { changes: [{ id: "token-a" }] }, [], isCurrent);

  const appended = [];
  const restarted = recoveryWith(memoryStorage(first.current()), appended);
  await restarted.load(isCurrent);
  assert.equal(restarted.pending(), true);
  await restarted.recover(isCurrent);
  assert.equal(restarted.pending(), false);
  assert.deepEqual(appended.map((entry) => entry.commandId), ["cmd-2"]);
});

test("lo storage di default legge e scrive solo la chiave del journal in scena", async () => {
  const updates = [];
  const obr = {
    scene: {
      getMetadata: async () => ({ [EFFECTS_RECOVERY_KEY]: { schemaVersion: 1 }, other: { keep: true } }),
      setMetadata: async (update) => { updates.push(update); },
    },
  };
  const storage = createSceneEffectsRecoveryStorage(obr);
  assert.deepEqual(await storage.read(), { schemaVersion: 1 });
  await storage.write({ schemaVersion: 1, scopeId: "s", records: {}, receipts: [] });
  assert.deepEqual(updates, [{ [EFFECTS_RECOVERY_KEY]: { schemaVersion: 1, scopeId: "s", records: {}, receipts: [] } }]);
});
