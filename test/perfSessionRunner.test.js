// The measurement session's runner (src/perfSessionRunner.js) and its dev-server save (scripts/perf-runs-dev-plugin.mjs).
import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import path from "node:path";
import { MONSTER_SESSION_BLOCKS, blockSummary, createPerfRunnerClient, installPerfRunnerRemote, runMonsterSession, savePerfRun, stopPerfSession }
  from "../src/perfSessionRunner.js";
import { perfRunFileName, perfRunsDevPlugin } from "../scripts/perf-runs-dev-plugin.mjs";

// Two ends of one BroadcastChannel: a message posted on one reaches the other's onmessage.
function channelPair() {
  const make = () => ({ onmessage: null, peer: null, closed: false,
    postMessage(data) { const peer = this.peer; queueMicrotask(() => peer.onmessage?.({ data: structuredClone(data) })); }, close() { this.closed = true; } });
  const a = make(), b = make();
  a.peer = b; b.peer = a;
  return [a, b];
}

function fakeTracker({ onTurn = () => {}, windows = { pcAttackAutoOpen: true } } = {}) {
  const [backgroundEnd, trackerEnd] = channelPair();
  const keys = [];
  const stored = { windows: { ...windows } };
  const target = { dispatchEvent: (event) => { keys.push(event.key); onTurn(); } };
  globalThis.KeyboardEvent ||= class { constructor(type, init) { this.type = type; Object.assign(this, init); } };
  installPerfRunnerRemote({ channel: trackerEnd, target, createStore: async () => ({
    start: async () => {}, read: () => structuredClone(stored),
    update: async (updater) => { const patch = updater(structuredClone(stored)); Object.assign(stored.windows, patch.windows); },
  }) });
  return { client: createPerfRunnerClient({ channel: backgroundEnd, timeoutMs: 200 }), keys, stored };
}

function fakeProbe(clock) {
  const events = [];
  let resets = 0;
  return {
    enabled: true, events,
    get resets() { return resets; },
    reset() { events.splice(0); resets += 1; },
    metadataSizes: async () => ({ sceneBytes: 100, roomBytes: 50 }),
    // A tick per turn, as the background records it after the tracker's apply.
    tick() { events.push({ type: "effects-command", kind: "apply", commandKind: "effects:tick-boundaries", at: clock.now }); },
    export(label) {
      return JSON.stringify({ label, summary: { transport: [{ key: "apply:effects:tick-boundaries", requests: events.length, roundTripMs: { p50: 1200, p95: 2000 } }],
        boot: [{ key: "pc-attack:ready", samples: 2 }] }, events });
    },
  };
}

test("the session runs every block: switches, consoles closed, probe cleared, turns with their tick, exports saved", async () => {
  const clock = { now: 1000 };
  const probe = fakeProbe(clock);
  const tracker = fakeTracker({ onTurn: () => { clock.now += 10; probe.tick(); } });
  const saved = [], closed = [], logs = [];
  const rows = await runMonsterSession({
    probe, client: tracker.client, turns: 3, settleMs: 0, betweenBlocksMs: 0,
    obr: { popover: { close: async (id) => { closed.push(id); } } },
    save: async ({ name, content }) => { saved.push({ name, content: JSON.parse(content) }); return { saved: true, file: `perf-runs/${name}.json` }; },
    wait: async (ms) => { clock.now += ms || 1; }, now: () => clock.now, log: (line) => logs.push(line),
  });
  assert.deepEqual(saved.map((entry) => entry.name), ["gm-mostri-dimensioni", ...MONSTER_SESSION_BLOCKS.map((block) => block.name)]);
  assert.deepEqual(saved[0].content, { label: "gm-mostri-dimensioni", sceneBytes: 100, roomBytes: 50 });
  assert.deepEqual(saved.slice(1).map((entry) => [entry.content.label, entry.content.events.length]), [["mostri-pg", 3], ["mostri-entrambi", 3], ["mostri-spenti", 3]]);
  assert.equal(tracker.keys.length, 9);
  assert.ok(tracker.keys.every((key) => key === "ArrowRight"), "the GM's own shortcut");
  assert.equal(probe.resets, 3);
  assert.equal(closed.length, 6, "both consoles closed before each block");
  assert.deepEqual(rows.map((row) => [row.blocco, row.ticks, row.turniSenzaTick]), [["mostri-pg", 3, ""], ["mostri-entrambi", 3, ""], ["mostri-spenti", 3, ""]]);
  assert.deepEqual(tracker.stored.windows, { pcAttackAutoOpen: true, pcAttackAutoOpenMonsters: null }, "the switches put back as they were");
  assert.match(logs.at(-1), /perf-compare\.mjs perf-runs\/gm-turni-flag-locale\.json perf-runs\/gm-mostri-pg\.json/);
});

test("a turn without a tick is reported, not waited for forever", async () => {
  const clock = { now: 0 };
  const probe = fakeProbe(clock);
  const tracker = fakeTracker();
  const rows = await runMonsterSession({ probe, client: tracker.client, blocks: [MONSTER_SESSION_BLOCKS[0]], turns: 2, settleMs: 0, betweenBlocksMs: 0, tickTimeoutMs: 1000,
    save: async () => ({ saved: true, file: "x" }), wait: async (ms) => { clock.now += ms || 1; }, now: () => clock.now, log: () => {} });
  assert.equal(rows[0].turniSenzaTick, "1, 2");
});

test("a failure in the middle still puts the switches back", async () => {
  const clock = { now: 0 };
  const probe = fakeProbe(clock);
  const tracker = fakeTracker({ windows: { pcAttackAutoOpen: false, pcAttackAutoOpenMonsters: true }, onTurn: () => probe.tick() });
  await assert.rejects(runMonsterSession({ probe, client: tracker.client, turns: 1, settleMs: 0, betweenBlocksMs: 0,
    save: async ({ name }) => { if (name === "gm-mostri-pg") throw new Error("disco pieno"); return { saved: true, file: name }; },
    wait: async (ms) => { clock.now += ms || 1; }, now: () => clock.now, log: () => {} }), /disco pieno/);
  assert.deepEqual(tracker.stored.windows, { pcAttackAutoOpen: false, pcAttackAutoOpenMonsters: true });
});

test("stop: the session ends after the current turn", async () => {
  const clock = { now: 0 };
  const probe = fakeProbe(clock);
  let turns = 0;
  const tracker = fakeTracker({ onTurn: () => { turns += 1; probe.tick(); if (turns === 2) stopPerfSession(); } });
  const rows = await runMonsterSession({ probe, client: tracker.client, turns: 5, settleMs: 0, betweenBlocksMs: 0,
    save: async ({ name }) => ({ saved: true, file: name }), wait: async (ms) => { clock.now += ms || 1; }, now: () => clock.now, log: () => {} });
  assert.equal(turns, 2);
  assert.equal(rows.length, 1);
});

test("without the probe on, or without a tracker, nothing runs", async () => {
  await assert.rejects(runMonsterSession({ probe: { enabled: false }, client: {} }), /Accendi prima il probe/);
  const [backgroundEnd] = channelPair();
  const client = createPerfRunnerClient({ channel: backgroundEnd, timeoutMs: 20 });
  await assert.rejects(runMonsterSession({ probe: { enabled: true }, client, log: () => {} }), /Il tracker non risponde/);
});

test("saving: the dev server's answer, or the export printed to copy by hand", async () => {
  const ok = await savePerfRun({ name: "gm-mostri-pg", content: "{}", fetchImpl: async () => ({ ok: true, json: async () => ({ file: "perf-runs/gm-mostri-pg.json" }) }) });
  assert.deepEqual(ok, { saved: true, file: "perf-runs/gm-mostri-pg.json" });
  const lines = [];
  const failed = await savePerfRun({ name: "gm-mostri-pg", content: "{\"a\":1}", fetchImpl: async () => ({ ok: false, status: 404 }), log: (line) => lines.push(line) });
  assert.equal(failed.saved, false);
  assert.match(lines[0], /HTTP 404/);
  assert.equal(lines[1], "{\"a\":1}");
});

test("the block's line: ticks, p50 and p95, console openings", () => {
  const content = JSON.stringify({ summary: { transport: [{ key: "apply:effects:tick-boundaries", requests: 10, roundTripMs: { p50: 1253, p95: 2550 } }],
    boot: [{ key: "pc-attack:ready", samples: 4 }, { key: "boss-actions:ready", samples: 1 }] } });
  assert.deepEqual(blockSummary(content), { ticks: 10, tickP50: 1253, tickP95: 2550, pcAttackOpens: 4, bossOpens: 1 });
});

test("the dev server's file name: a slug, never an existing file overwritten", () => {
  const directory = path.join("perf-runs");
  const taken = new Set([path.join(directory, "gm-mostri-pg.json"), path.join(directory, "gm-mostri-pg-2.json")]);
  assert.equal(perfRunFileName(directory, "gm-mostri-pg", (file) => taken.has(file)), path.join(directory, "gm-mostri-pg-3.json"));
  assert.equal(perfRunFileName(directory, "Gm-Mostri-Spenti", () => false), path.join(directory, "gm-mostri-spenti.json"));
  for (const bad of ["../segreti", "a/b", "", "nome con spazi"]) assert.throws(() => perfRunFileName(directory, bad, () => false), /nome non valido/);
});

test("the dev server's route: POST only, valid JSON only", async () => {
  let middleware = null;
  perfRunsDevPlugin({ directory: "unused" }).configureServer({ middlewares: { use: (handler) => { middleware = handler; } } });
  const call = (method, body) => new Promise((resolve) => {
    const request = new EventEmitter();
    Object.assign(request, { url: "/__perf-runs", method, destroy() {} });
    const response = { statusCode: 200, headers: {}, writableEnded: false, setHeader(key, value) { this.headers[key] = value; },
      end(text) { this.writableEnded = true; resolve({ status: this.statusCode, body: JSON.parse(text) }); } };
    middleware(request, response, () => resolve({ status: "next" }));
    if (method === "POST") { request.emit("data", Buffer.from(body)); request.emit("end"); }
  });
  assert.deepEqual(await call("GET"), { status: 405, body: { error: "solo POST" } });
  assert.equal((await call("POST", JSON.stringify({ name: "x", content: "non json" }))).status, 400);
  assert.equal((await call("POST", JSON.stringify({ name: "../x", content: "{}" }))).status, 400);
  let passed = false;
  middleware({ url: "/altro" }, {}, () => { passed = true; });
  assert.equal(passed, true, "other routes pass through");
});
