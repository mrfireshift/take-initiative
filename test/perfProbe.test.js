import test from "node:test";
import assert from "node:assert/strict";
import {
  perfBootPage,
  perfJsonBytes,
  perfProbeEnabled,
  perfRecord,
  perfSetContext,
  summarizePerfEvents,
} from "../src/perfProbe.js";
import {
  METADATA_OWNERSHIP,
  writeSceneMetadataKey,
} from "../src/metadataKeyScoped.js";

function fakeSceneApi({ fail = false } = {}) {
  const calls = [];
  return {
    calls,
    async setMetadata(update) {
      calls.push(update);
      if (fail) throw new Error("Too many requests");
    },
  };
}

function countingValue(counter) {
  return { entries: [{ id: "a" }], toJSON() { counter.count += 1; return { entries: [{ id: "a" }] }; } };
}

// Disabled tests run first: the flag is read once per process and these tests must see it off.
test("perf probe spento: nessun evento e nessuna serializzazione aggiunta", async () => {
  assert.equal(perfProbeEnabled(), false);
  perfRecord("metadata-write", { bytes: 1 });
  assert.equal(globalThis.__tbpPerf.events.length, 0);

  const counter = { count: 0 };
  const api = fakeSceneApi();
  await writeSceneMetadataKey(api, METADATA_OWNERSHIP.HISTORY, countingValue(counter), { runtime: "test" });
  assert.equal(counter.count, 0, "a probe spento il writer non deve serializzare il valore");
  assert.equal(api.calls.length, 1);
  assert.equal(globalThis.__tbpPerf.events.length, 0);
});

test("perf probe spento: perfBootPage non registra listener OBR", () => {
  let onReadyCalls = 0;
  perfBootPage({ onReady() { onReadyCalls += 1; } });
  assert.equal(onReadyCalls, 0);
  assert.equal(globalThis.__tbpPerf.events.length, 0);
});

test("perf probe acceso: la scrittura key-scoped registra byte e durata senza cambiare l'update", async () => {
  globalThis.__tbpPerf.enable();
  assert.equal(perfProbeEnabled(), true);
  globalThis.__tbpPerf.reset();

  const value = { entries: [{ id: "è" }] };
  const api = fakeSceneApi();
  await writeSceneMetadataKey(api, METADATA_OWNERSHIP.HISTORY, value, { runtime: "historyOwner" });
  assert.deepEqual(api.calls, [{ [METADATA_OWNERSHIP.HISTORY.key]: value }]);
  assert.equal(api.calls[0][METADATA_OWNERSHIP.HISTORY.key], value, "il valore scritto resta lo stesso oggetto");

  const [event] = globalThis.__tbpPerf.events;
  assert.equal(event.type, "metadata-write");
  assert.equal(event.scope, "scene");
  assert.equal(event.key, METADATA_OWNERSHIP.HISTORY.key);
  assert.equal(event.runtime, "historyOwner");
  assert.equal(event.ok, true);
  assert.equal(event.bytes, perfJsonBytes(value));
  assert.equal(event.bytes, JSON.stringify(value).length + 1, "byte UTF-8, non caratteri");
  assert.ok(Number.isFinite(event.setMetadataMs));
});

test("perf probe acceso: una scrittura fallita è registrata e l'errore resta invariato", async () => {
  globalThis.__tbpPerf.reset();
  const api = fakeSceneApi({ fail: true });
  await assert.rejects(
    writeSceneMetadataKey(api, METADATA_OWNERSHIP.HISTORY, { entries: [] }, { runtime: "historyOwner" }),
    (error) => error.name === "MetadataKeyWriteError" && /Too many requests/u.test(error.message),
  );
  const [event] = globalThis.__tbpPerf.events;
  assert.equal(event.ok, false);
  assert.match(event.error, /Too many requests/u);
});

test("summarizePerfEvents aggrega scritture, trasporto e avvio", () => {
  const key = METADATA_OWNERSHIP.HISTORY.key;
  const summary = summarizePerfEvents([
    { type: "metadata-write", scope: "scene", key, bytes: 100, setMetadataMs: 10, ok: true },
    { type: "metadata-write", scope: "scene", key, bytes: 300, setMetadataMs: 30, ok: true },
    { type: "metadata-write", scope: "room", key: "x/y", bytes: 5, setMetadataMs: 1, ok: false },
    { type: "effects-transport", kind: "apply", commandKind: "hp", durationMs: 40, status: "applied" },
    { type: "effects-transport", kind: "apply", commandKind: "hp", durationMs: 80, status: "failed" },
    { type: "boot", realm: "turn-notice", stage: "module", sinceNavigationMs: 250 },
    { type: "long-task", realm: "background", durationMs: 70 },
    { type: "broadcast-rate-limited", channel: "c", attempt: 1 },
  ]);
  assert.deepEqual(summary.metadataWrites[0], {
    key: "scene:history",
    writes: 2,
    failed: 0,
    bytesTotal: 400,
    bytesMax: 300,
    setMetadataMs: { p50: 10, p95: 30, max: 30 },
  });
  assert.equal(summary.metadataWrites[1].failed, 1);
  assert.deepEqual(summary.transport, [{
    key: "apply:hp",
    requests: 2,
    failed: 1,
    roundTripMs: { p50: 40, p95: 80, max: 80 },
  }]);
  assert.deepEqual(summary.boot, [{ key: "turn-notice:module", samples: 1, sinceNavigationMs: { p50: 250, p95: 250, max: 250 } }]);
  assert.deepEqual(summary.longTasks, [{ page: "background", tasks: 1, totalMs: 70, maxMs: 70 }]);
  assert.equal(summary.rateLimited, 1);
});

test("perf probe acceso: il contesto del comando etichetta gli eventi registrati nel frattempo", () => {
  globalThis.__tbpPerf.reset();
  perfSetContext({ commandId: "cmd-1", commandKind: "effects:tick-boundaries" });
  perfRecord("metadata-write", { key: "k", bytes: 1 });
  perfSetContext(null);
  perfRecord("metadata-write", { key: "k", bytes: 2 });
  const [tagged, untagged] = globalThis.__tbpPerf.events;
  assert.equal(tagged.cmd, "cmd-1");
  assert.equal(tagged.cmdKind, "effects:tick-boundaries");
  assert.equal(untagged.cmd, undefined);
});

test("perf probe acceso: le chiamate SDK restano le stesse e l'annidata di updateItems non conta due volte", async () => {
  globalThis.__tbpPerf.reset();
  const calls = [];
  const items = {
    getItems(ids) {
      calls.push(["getItems", ids]);
      return Promise.resolve([{ id: "a" }]);
    },
    updateItems(ids, update) {
      calls.push(["updateItems", ids]);
      return this.getItems(ids).then((found) => { update(found); return "updated"; });
    },
  };
  const obr = { scene: { items }, onReady() {} };
  perfBootPage(obr, { observeSdk: true });

  const readPromise = obr.scene.items.getItems(["a"]);
  assert.ok(readPromise instanceof Promise);
  assert.deepEqual(await readPromise, [{ id: "a" }]);
  let updated = null;
  assert.equal(await obr.scene.items.updateItems(["a"], (found) => { updated = found; }), "updated");
  assert.deepEqual(updated, [{ id: "a" }]);
  assert.deepEqual(calls, [["getItems", ["a"]], ["updateItems", ["a"]], ["getItems", ["a"]]]);
  await new Promise((resolve) => setTimeout(resolve, 0));

  const sdk = globalThis.__tbpPerf.events.filter((event) => event.type === "sdk-call");
  assert.deepEqual(sdk.map((event) => [event.method, event.nested, event.ids]).sort(), [
    ["scene.items.getItems", false, 1],
    ["scene.items.getItems", true, 1],
    ["scene.items.updateItems", false, 1],
  ].sort());
  const summary = summarizePerfEvents(globalThis.__tbpPerf.events);
  assert.deepEqual(summary.sdkCalls.map((row) => [row.method, row.calls]).sort(), [
    ["scene.items.getItems", 1],
    ["scene.items.updateItems", 1],
  ]);
});

test("summarizePerfEvents scompone comandi effetti e owner History per fase", () => {
  const summary = summarizePerfEvents([
    { type: "effects-command", kind: "apply", commandKind: "effects:tick-boundaries", commandId: "c1", handleMs: 3000, totalMs: 3100 },
    { type: "effects-phase", phase: "before-command", commandId: "c1", durationMs: 100 },
    { type: "effects-phase", phase: "prepare", commandId: "c1", durationMs: 900 },
    { type: "effects-phase", phase: "commit", commandId: "c1", durationMs: 1500 },
    { type: "effects-phase", phase: "record-history", commandId: "c1", durationMs: 400 },
    { type: "sdk-call", method: "scene.items.updateItems", cmd: "c1", durationMs: 600, nested: false },
    { type: "sdk-call", method: "scene.items.getItems", cmd: "c1", durationMs: 50, nested: true },
    { type: "history-owner-command", kind: "append", commandId: "r1", handledMs: 700, totalMs: 720 },
    { type: "history-owner-phase", phase: "write", commandId: "r1", durationMs: 150 },
    { type: "history-owner-phase", phase: "combat-log", commandId: "r1", durationMs: 400 },
  ]);
  assert.deepEqual(summary.effectsPhases, [{
    kind: "effects:tick-boundaries",
    commands: 1,
    handleMs: { p50: 3000, p95: 3000, max: 3000 },
    "before-command": 100,
    prepare: 900,
    commit: 1500,
    "record-history": 400,
    outsidePhases: 100,
    sdkCalls: 1,
    sdkMs: 600,
  }]);
  assert.deepEqual(summary.historyOwner, [{
    kind: "append",
    commands: 1,
    handledMs: { p50: 700, p95: 700, max: 700 },
    write: 150,
    "combat-log": 400,
    queueAndOther: 150,
  }]);
});

test("export produce JSON con eventi e riepilogo", () => {
  globalThis.__tbpPerf.reset();
  perfRecord("boot", { stage: "module", sinceNavigationMs: 12 });
  const exported = JSON.parse(globalThis.__tbpPerf.export("prova"));
  assert.equal(exported.schema, 1);
  assert.equal(exported.label, "prova");
  assert.equal(exported.events.length, 1);
  assert.equal(exported.summary.events, 1);
  globalThis.__tbpPerf.disable();
  assert.equal(perfProbeEnabled(), false);
});
