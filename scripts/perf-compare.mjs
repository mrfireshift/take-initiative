// Compares exports of the browser performance probe (src/perfProbe.js, docs/PERFORMANCE-PROBE.md) side by side:
// node scripts/perf-compare.mjs perf-runs/gm-turni-flag-locale.json perf-runs/gm-mostri-pg.json ...
// One column per export: the turn tick (round trip of "apply:effects:tick-boundaries" seen by the tracker, and the
// coordinator's handling in the background), the SDK calls that weigh on it, the consoles' openings and long tasks,
// and the bytes this client received. Reads only; prints a table.
import { readFileSync } from "node:fs";
import { basename } from "node:path";

const files = process.argv.slice(2);
if (!files.length) {
  console.error("Uso: node scripts/perf-compare.mjs <export.json> [altri export…]");
  process.exit(1);
}

const exportsByName = files.map((file) => {
  const data = JSON.parse(readFileSync(file, "utf8"));
  if (!data?.summary) throw new Error(`${file}: non è un export del probe (manca summary)`);
  return { name: data.label || basename(file, ".json"), summary: data.summary };
});

const find = (list, key, value) => (Array.isArray(list) ? list.find((entry) => entry?.[key] === value) : null) || null;
const ms = (value) => (Number.isFinite(value) ? `${Math.round(value)} ms` : "—");
const count = (value) => (Number.isFinite(value) ? String(value) : "—");
const kb = (value) => (Number.isFinite(value) ? `${Math.round(value / 1024)} KB` : "—");

const rows = [
  ["Cambi turno (apply)", (s) => count(find(s.transport, "key", "apply:effects:tick-boundaries")?.requests)],
  ["Tick p50 (tracker)", (s) => ms(find(s.transport, "key", "apply:effects:tick-boundaries")?.roundTripMs?.p50)],
  ["Tick p95 (tracker)", (s) => ms(find(s.transport, "key", "apply:effects:tick-boundaries")?.roundTripMs?.p95)],
  ["Tick p50 (background)", (s) => ms(find(s.effectsPhases, "kind", "effects:tick-boundaries")?.handleMs?.p50)],
  ["Commit p50", (s) => ms(find(s.effectsPhases, "kind", "effects:tick-boundaries")?.commit)],
  ["updateItems: chiamate", (s) => count(find(s.sdkCalls, "method", "scene.items.updateItems")?.calls)],
  ["updateItems: p50", (s) => ms(find(s.sdkCalls, "method", "scene.items.updateItems")?.durationMs?.p50)],
  ["getItems: chiamate", (s) => count(find(s.sdkCalls, "method", "scene.items.getItems")?.calls)],
  ["Aperture console attacchi", (s) => count(find(s.boot, "key", "pc-attack:ready")?.samples ?? 0)],
  ["Aperture console Boss", (s) => count(find(s.boot, "key", "boss-actions:ready")?.samples ?? 0)],
  ["Long task console attacchi", (s) => ms(find(s.longTasks, "page", "pc-attack")?.totalMs ?? 0)],
  ["Long task console Boss", (s) => ms(find(s.longTasks, "page", "boss-actions")?.totalMs ?? 0)],
  ["Eventi item ricevuti", (s) => count(find(s.received, "type", "scene-items-received")?.events)],
  ["Byte item ricevuti", (s) => kb(find(s.received, "type", "scene-items-received")?.bytesTotal)],
  ["Evento item più grande", (s) => kb(find(s.received, "type", "scene-items-received")?.bytesMax)],
];

const table = [["", ...exportsByName.map((entry) => entry.name)], ...rows.map(([label, read]) => [label, ...exportsByName.map((entry) => read(entry.summary))])];
const widths = table[0].map((_, column) => Math.max(...table.map((row) => String(row[column]).length)));
for (const [index, row] of table.entries()) {
  console.log(row.map((cell, column) => (column ? String(cell).padStart(widths[column]) : String(cell).padEnd(widths[column]))).join("  "));
  if (!index) console.log(widths.map((width) => "-".repeat(width)).join("  "));
}
