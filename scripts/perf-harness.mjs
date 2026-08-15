import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { mock } from "node:test";

const sdkStub = {
  onReady: () => {},
  room: {
    getMetadata: async () => ({}),
    setMetadata: async () => {},
    onMetadataChange: () => () => {},
  },
  scene: {
    isReady: async () => true,
    onReadyChange: () => () => {},
    getMetadata: async () => ({}),
    setMetadata: async () => {},
    onMetadataChange: () => () => {},
    items: {
      getItems: async () => [],
      getItemBounds: async () => null,
      updateItems: async () => {},
      addItems: async () => [],
      deleteItems: async () => [],
      onChange: () => () => {},
    },
    local: {
      getItems: async () => [],
      updateItems: async () => {},
      addItems: async () => [],
      deleteItems: async () => [],
      onChange: () => () => {},
    },
    grid: {
      getDpi: async () => 1,
      getScale: async () => 1,
    },
  },
  player: {
    getRole: async () => "GM",
    getSelection: async () => [],
    onChange: () => () => {},
  },
  broadcast: {
    sendMessage: async () => {},
    onMessage: () => () => {},
  },
};

// The production modules imported by ActorVitals/scene item events expect the
// SDK package at module evaluation time. The command injects only this inert
// bootstrap stub; all measured calls use the stateful fake OBR below.
mock.module("@owlbear-rodeo/sdk", { exports: { default: sdkStub } });

const { runPerformanceHarness } = await import("../test-support/performanceHarness.js");

function parseArgs(argv) {
  const options = {
    json: false,
    runs: 1,
    seed: "take-initiative-step-6",
    output: null,
    smoke: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--json") options.json = true;
    else if (argument === "--smoke") options.smoke = true;
    else if (argument === "--runs") options.runs = Number(argv[++index]);
    else if (argument === "--seed") options.seed = String(argv[++index] || options.seed);
    else if (argument === "--output") options.output = String(argv[++index] || "");
    else throw new Error(`argomento non riconosciuto: ${argument}`);
  }
  return options;
}

function commitAtHead() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

function humanSummary(report) {
  const failed = Object.entries(report.correctness || {})
    .filter(([key, value]) => key !== "ok" && key !== "details" && value === false)
    .map(([key]) => key);
  const phaseSummary = (report.phases || [])
    .map((phase) => `${phase.name}=${phase.durationMs.toFixed(2)}ms`)
    .join(", ");
  const sdkCalls = Object.values(report.metrics?.phases || [])
    .flatMap((phase) => Object.values(phase.sdk?.methods || {}))
    .reduce((sum, method) => sum + (method.count || 0), 0);
  return [
    "Take Initiative performance harness",
    `status=${report.correctness?.ok ? "ok" : "failed"} seed=${report.seed} runs=${report.runCount}`,
    `scenario: ${report.scenario.tokens} token, ${report.scenario.zones} zone/aura, ${report.scenario.effects} effect, ${report.scenario.movements} movimenti, ${report.scenario.hpChanges} HP, ${report.scenario.advanceTurns} turni`,
    `SDK calls=${sdkCalls}; phases: ${phaseSummary}`,
    `cold/warm bounds calls=${report.cache?.bounds?.coldSdkCalls}/${report.cache?.bounds?.warmSdkCalls}`,
    failed.length ? `correctness failures: ${failed.join(", ")}` : "correctness: tutte le asserzioni superate",
    `limitations: ${report.limitations?.length || 0} (DOM/long-task browser-only)`,
  ].join("\n");
}

function emit(report, options) {
  const json = JSON.stringify(report, null, 2);
  if (options.output) writeFileSync(options.output, `${json}\n`, "utf8");
  if (!options.json) {
    process.stdout.write(`${humanSummary(report)}\n\n--- structured JSON ---\n`);
  }
  process.stdout.write(`${json}\n`);
}

let options;
try {
  options = parseArgs(process.argv.slice(2));
  const report = await runPerformanceHarness({
    seed: options.seed,
    runs: options.runs,
    smoke: options.smoke,
    commit: commitAtHead(),
  });
  emit(report, options);
  if (!report.correctness?.ok) process.exitCode = 1;
} catch (error) {
  const report = {
    schemaVersion: "take-initiative-performance-v1",
    commit: commitAtHead(),
    node: process.version,
    runtime: "node",
    seed: options?.seed || null,
    status: "driver-error",
    correctness: { ok: false, driverError: String(error?.message || error) },
    limitations: ["Scenario non completato: errore del driver."],
  };
  emit(report, options || { json: false, output: null });
  process.exitCode = 1;
}
