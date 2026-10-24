import test from "node:test";
import assert from "node:assert/strict";
import {
  perfBootPage,
  perfJsonBytes,
  perfProbeEnabled,
  perfRecord,
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
