import { ID } from "./constants.js";

// Dev tool for a measurement session in a real room (docs/MISURA_CONSOLE_MOSTRI.md). From the background's console,
// with the probe on: `await __tbpPerf.runMonsterSession()`. For each block it sets the console's auto-open switches,
// closes the consoles, clears the probe's events, moves the turn forward N times, waits for each turn's tick, then
// saves the probe's export in perf-runs/ through the dev server (scripts/perf-runs-dev-plugin.mjs).
// The turn moves through the tracker's own shortcut: the tracker receives a "→" key and clicks its Next button, with
// every guard of the GM's key (an editor open, the fill mode). The tool never writes the initiative state itself.
// The switches are written by the tracker's realm, so the background sees the change through the storage event, and
// they are put back as they were at the end, also when the session stops or fails.
const RUNNER_CHANNEL = `${ID}/perf-runner`;
export const PERF_SESSION_SAVE_URL = "/__perf-runs";
export const PERF_SESSION_SIZES_FILE = "gm-mostri-dimensioni";
export const MONSTER_SESSION_BLOCKS = Object.freeze([
  Object.freeze({ name: "gm-mostri-pg", label: "mostri-pg", pc: true, monsters: false }),
  Object.freeze({ name: "gm-mostri-entrambi", label: "mostri-entrambi", pc: true, monsters: true }),
  Object.freeze({ name: "gm-mostri-spenti", label: "mostri-spenti", pc: false, monsters: false }),
]);
const CONSOLE_POPOVER_IDS = Object.freeze([`${ID}/pc-attack`, `${ID}/boss-actions`]);
const TICK_PATTERN = /tick-boundaries/;

let stopRequested = false;

export function stopPerfSession() {
  stopRequested = true;
  return "La sessione si ferma dopo il turno in corso; le pillole tornano come erano.";
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The tracker's side: answers the background's commands. Installed in the tracker's realm only while the probe is on.
export function installPerfRunnerRemote({
  channel = typeof globalThis.BroadcastChannel === "function" ? new globalThis.BroadcastChannel(RUNNER_CHANNEL) : null,
  target = globalThis,
  createStore = () => import("./options/localOptionsStore.js").then((module) => module.createLocalOptionsStore()),
} = {}) {
  if (!channel) return () => {};
  let storePromise = null;
  const store = () => (storePromise ||= createStore().then(async (created) => { await created.start?.(); return created; }));
  const reply = (id, payload) => channel.postMessage({ to: "background", id, ...payload });
  channel.onmessage = async (message) => {
    const data = message?.data;
    if (!data || data.to !== "tracker" || !data.id) return;
    try {
      if (data.command === "ping") return reply(data.id, { ok: true });
      if (data.command === "turn") {
        target.dispatchEvent(new globalThis.KeyboardEvent("keydown", { key: "ArrowRight" }));
        return reply(data.id, { ok: true });
      }
      if (data.command === "auto-open") {
        const options = await store();
        const before = options.read?.()?.windows || {};
        const previous = { pc: before.pcAttackAutoOpen === true,
          monsters: typeof before.pcAttackAutoOpenMonsters === "boolean" ? before.pcAttackAutoOpenMonsters : null };
        await options.update(() => ({ windows: { pcAttackAutoOpen: data.pc === true,
          pcAttackAutoOpenMonsters: typeof data.monsters === "boolean" ? data.monsters : null } }));
        return reply(data.id, { ok: true, previous });
      }
      return reply(data.id, { ok: false, error: `comando sconosciuto: ${data.command}` });
    } catch (error) {
      return reply(data.id, { ok: false, error: String(error?.message || error) });
    }
  };
  return () => channel.close?.();
}

// The background's side of the channel: one request, one answer, or an error after timeoutMs.
export function createPerfRunnerClient({
  channel = typeof globalThis.BroadcastChannel === "function" ? new globalThis.BroadcastChannel(RUNNER_CHANNEL) : null,
  timeoutMs = 4000,
} = {}) {
  if (!channel) throw new Error("BroadcastChannel non disponibile in questo browser.");
  const pending = new Map();
  let sequence = 0;
  channel.onmessage = (message) => {
    const data = message?.data;
    if (!data || data.to !== "background" || !pending.has(data.id)) return;
    const { resolve, timer } = pending.get(data.id);
    clearTimeout(timer);
    pending.delete(data.id);
    resolve(data);
  };
  return {
    request(command, payload = {}) {
      const id = `${Date.now().toString(36)}-${++sequence}`;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error("Il tracker non risponde: aprilo (GM) in questa finestra e riprova."));
        }, timeoutMs);
        pending.set(id, { resolve, timer });
        channel.postMessage({ to: "tracker", id, command, ...payload });
      }).then((answer) => {
        if (!answer.ok) throw new Error(answer.error || "Il tracker ha rifiutato il comando.");
        return answer;
      });
    },
    close: () => channel.close?.(),
  };
}

// The probe's export, saved by the dev server under perf-runs/<name>.json (a free name if it exists). Without the dev
// server (a production build) the export is printed instead, to copy by hand.
export async function savePerfRun({ name, content, fetchImpl = globalThis.fetch, log = console.log } = {}) {
  try {
    const response = await fetchImpl(PERF_SESSION_SAVE_URL, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, content }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const { file } = await response.json();
    return { saved: true, file };
  } catch (error) {
    log(`[perf] ${name}: salvataggio automatico non riuscito (${error?.message || error}). Copia il testo qui sotto in perf-runs/${name}.json.`);
    log(content);
    return { saved: false, file: "" };
  }
}

// A new tick after `since` (epoch ms): the turn's "effects:tick-boundaries" command handled by the background.
function hasTickSince(events, since) {
  return events.some((event) => event?.type === "effects-command" && Number(event.at) >= since
    && (TICK_PATTERN.test(String(event.commandKind || "")) || TICK_PATTERN.test(String(event.kind || ""))));
}

export function blockSummary(content) {
  const summary = JSON.parse(content).summary || {};
  const tick = (summary.transport || []).find((entry) => entry.key === "apply:effects:tick-boundaries");
  const boot = (key) => (summary.boot || []).find((entry) => entry.key === key)?.samples || 0;
  return {
    ticks: tick?.requests || 0,
    tickP50: tick?.roundTripMs?.p50 ?? null,
    tickP95: tick?.roundTripMs?.p95 ?? null,
    pcAttackOpens: boot("pc-attack:ready"),
    bossOpens: boot("boss-actions:ready"),
  };
}

/**
 * Runs the session. probe: the background's __tbpPerf (reset, export, metadataSizes, events). obr: the background's
 * SDK, to close the consoles between blocks. Every wait is injectable for the tests. Returns one row per block.
 */
export async function runMonsterSession({
  probe, obr = null, blocks = MONSTER_SESSION_BLOCKS, turns = 10, settleMs = 3000, tickTimeoutMs = 15000, betweenBlocksMs = 2000,
  client = createPerfRunnerClient(), save = savePerfRun, wait = sleep, now = () => Date.now(), log = console.log,
} = {}) {
  if (!probe?.enabled) throw new Error("Accendi prima il probe: __tbpPerf.enable() e ricarica Owlbear.");
  const rounds = Math.max(1, Math.min(50, Math.floor(Number(turns) || 10)));
  stopRequested = false;
  await client.request("ping");
  let previous = null;
  const rows = [];
  try {
    const sizes = await probe.metadataSizes();
    await save({ name: PERF_SESSION_SIZES_FILE, content: JSON.stringify({ label: PERF_SESSION_SIZES_FILE, ...sizes }) });
    for (const block of blocks) {
      if (stopRequested) break;
      log(`[perf] blocco ${block.label}: PG ${block.pc ? "acceso" : "spento"}, Mostri ${block.monsters ? "acceso" : "spento"}, ${rounds} turni.`);
      const answer = await client.request("auto-open", { pc: block.pc, monsters: block.monsters });
      previous ||= answer.previous;
      for (const id of CONSOLE_POPOVER_IDS) await Promise.resolve(obr?.popover?.close?.(id)).catch(() => {});
      await wait(betweenBlocksMs);
      probe.reset();
      const missed = [];
      for (let turn = 1; turn <= rounds && !stopRequested; turn += 1) {
        const since = now() - 50;
        await client.request("turn");
        const deadline = now() + tickTimeoutMs;
        while (!hasTickSince(probe.events, since) && now() < deadline) await wait(200);
        if (!hasTickSince(probe.events, since)) missed.push(turn);
        await wait(settleMs);
      }
      const content = probe.export(block.label);
      const { file } = await save({ name: block.name, content });
      const row = { blocco: block.label, file: file || "(da copiare)", ...blockSummary(content), turniSenzaTick: missed.join(", ") };
      rows.push(row);
      log(`[perf] blocco ${block.label} salvato${file ? ` in ${file}` : ""}.`);
    }
  } finally {
    if (previous) await client.request("auto-open", previous).catch((error) => log(`[perf] pillole non ripristinate: ${error.message}`));
    client.close?.();
  }
  if (rows.length) console.table?.(rows);
  const files = rows.map((row) => row.file).filter((file) => file && file !== "(da copiare)");
  log(stopRequested ? "[perf] sessione fermata." : `[perf] sessione finita: node scripts/perf-compare.mjs perf-runs/gm-turni-flag-locale.json ${files.join(" ")}`);
  return rows;
}
