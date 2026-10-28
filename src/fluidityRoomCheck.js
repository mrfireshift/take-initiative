import { ID } from "./constants.js";
import { blockSummary, savePerfRun } from "./perfSessionRunner.js";

// Dev tool: the automatic room check of the fluidity lots (docs/PROVA_STANZA_FLUIDITA.md). With the probe on:
// - the GM, from the background's console: `await __tbpPerf.runFluidityCheck()`;
// - the table screen, from its background's console, before the GM starts: `await __tbpPerf.watchFluidity()`.
// The pages of this browser (tracker, turn notice, Boss console) answer through a native BroadcastChannel (no Owlbear
// broadcast, no network) while the probe is on. The turn moves by pressing the tracker's own buttons, so it goes
// through every queue and guard of a click; the tool never writes the initiative state. The only scene write is one
// token's HP (merged into its metadata) for the bar check, put back at the end, also when a step fails.
const CHECK_CHANNEL = `${ID}/fluidity-check`;
const META_KEY = `${ID}/meta`;
const STATE_KEY = `${ID}/state`;
const HPBAR_META = `${ID}/hpbar`;
const HPTEXT_META = `${ID}/hptext`;
const TRACKER_POPOVER_ID = `${ID}/tracker-popover`;
const BOSS_POPOVER_ID = `${ID}/boss-actions`;
const UI_CHANNEL = `${ID}/turn-notice/ui`;
const TICK_PATTERN = /tick-boundaries/;
const BAR_INSET = 2;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const text = (node) => String(node?.textContent || "").replace(/\s+/g, " ").trim();

// ---- pure checks (tested in test/fluidityRoomCheck.test.js) ----

// The token's map widgets as the bar code leaves them: one background and one fill shape and one label attached to
// it, the label showing "hp/hpMax", the fill as wide as the bar's inner width times the HP ratio.
export function evaluateHpWidgets(items, tokenId, hp, hpMax) {
  const mine = (Array.isArray(items) ? items : []).filter((item) => (
    item?.metadata?.[HPBAR_META]?.targetId === tokenId || item?.metadata?.[HPTEXT_META]?.targetId === tokenId
  ));
  const bg = mine.filter((item) => item.metadata?.[HPBAR_META]?.kind === "bg");
  const fg = mine.filter((item) => item.metadata?.[HPBAR_META]?.kind === "fg");
  const labels = mine.filter((item) => item.metadata?.[HPTEXT_META]);
  const problems = [];
  if (bg.length !== 1 || fg.length !== 1) problems.push(`barre: ${bg.length} sfondi e ${fg.length} riempimenti invece di 1 e 1`);
  if (labels.length !== 1) problems.push(`${labels.length} testi invece di 1`);
  const expectedText = `${Math.max(0, Math.floor(hp))}/${Math.max(0, Math.floor(hpMax))}`;
  if (labels.length === 1 && labels[0].text?.plainText !== expectedText) {
    problems.push(`testo «${labels[0].text?.plainText}» invece di «${expectedText}»`);
  }
  if (bg.length === 1 && fg.length === 1 && hpMax > 0) {
    const inner = Math.max(0, Number(bg[0].width) - BAR_INSET * 2);
    const expectedWidth = Math.floor(inner * Math.max(0, Math.min(1, hp / hpMax)));
    if (Math.abs(Number(fg[0].width) - expectedWidth) > 1) problems.push(`riempimento largo ${fg[0].width} invece di ${expectedWidth}`);
  }
  return { ok: problems.length === 0, problems, expectedText };
}

// The notice names the creature whose turn it is: "Turno di <name>".
// The "(2) " the tracker puts before creatures with the same name is ignored on both sides.
export function noticeNamesActor(title, actorName) {
  const bare = (value) => String(value || "").replace(/^\(\d+\)\s*/, "").trim().toLocaleLowerCase("it");
  const shown = bare(String(title || "").replace(/^Turno di\s+/i, ""));
  const wanted = bare(actorName);
  return !!shown && !!wanted && (shown === wanted || shown.startsWith(wanted) || wanted.startsWith(shown));
}

// The notices a page received, in arrival order: each must carry a higher noticeId than the one before, and the one
// on screen must be the latest.
export function evaluateNoticeOrder(received, shownNoticeId = null) {
  const ids = (Array.isArray(received) ? received : []).map((entry) => Number(entry?.noticeId) || 0).filter(Boolean);
  const outOfOrder = ids.filter((id, index) => index > 0 && id <= ids[index - 1]).length;
  const latest = ids.length ? Math.max(...ids) : 0;
  const shownIsLatest = shownNoticeId === null || !latest || Number(shownNoticeId) === latest;
  return { ok: outOfOrder === 0 && shownIsLatest, received: ids.length, outOfOrder, latest, shownIsLatest };
}

// The table screen's log: a moment where the notice on screen named someone other than the tracker's active
// creature, for longer than the settle time, is an anomaly; so is a notice that came after a newer one.
export function evaluateWatchLog(samples, { settleMs = 2500 } = {}) {
  const anomalies = [];
  let mismatchSince = null;
  for (const sample of Array.isArray(samples) ? samples : []) {
    const mismatch = !!sample.noticeTitle && !!sample.activeName && !sample.activeVirtual
      && !noticeNamesActor(sample.noticeTitle, sample.activeName);
    if (mismatch) {
      mismatchSince ??= sample.at;
      if (sample.at - mismatchSince >= settleMs) {
        anomalies.push({ at: sample.at, kind: "avviso-diverso-dal-tracker", notice: sample.noticeTitle, tracker: sample.activeName });
        mismatchSince = Infinity;
      }
    } else {
      mismatchSince = null;
    }
  }
  return anomalies;
}

// ---- the pages' side ----

function trackerSnapshot(documentRef) {
  const cards = Array.from(documentRef.querySelectorAll("[data-tracker-card='1']")).map((card) => ({
    itemId: card.dataset.itemId || "",
    active: card.dataset.active === "1",
    hpMode: card.__hpMode || "",
    hpText: text(card.querySelector("[data-card-hp-text='1']")) || text(card.querySelector("[data-badge='hp']")),
    knockedOut: card.dataset.knockedOut === "1",
    styleHeight: card.style?.height || "",
  }));
  return { cards, active: cards.find((card) => card.active) || null };
}

function pressTrackerButton(documentRef, title) {
  const button = Array.from(documentRef.querySelectorAll("button"))
    .find((candidate) => (candidate.title || candidate.getAttribute("aria-label")) === title && !candidate.disabled);
  if (!button) return false;
  button.click();
  return true;
}

export function installFluidityCheckRemote({
  realm,
  obr = null,
  channel = typeof globalThis.BroadcastChannel === "function" ? new globalThis.BroadcastChannel(CHECK_CHANNEL) : null,
  documentRef = globalThis.document,
  windowRef = globalThis,
  now = () => Date.now(),
} = {}) {
  if (!channel || !documentRef) return () => {};
  const installedAt = now();
  const received = [];
  let panelEverVisible = false;
  let stopSampling = () => {};
  if (realm === "turn-notice") {
    try {
      const urlNotice = JSON.parse(new URLSearchParams(windowRef.location?.search || "").get("payload") || "null");
      if (urlNotice?.type === "show-turn-notice") received.push({ noticeId: urlNotice.noticeId, name: urlNotice.currentName, at: installedAt, via: "url" });
    } catch {}
    const unsubscribe = obr?.broadcast?.onMessage?.(UI_CHANNEL, (event) => {
      const data = event?.data;
      if (data?.type === "show-turn-notice") received.push({ noticeId: data.noticeId, name: data.currentName, at: now(), via: "broadcast" });
    });
    stopSampling = () => unsubscribe?.();
  }
  if (realm === "boss-actions") {
    // Whether the panel was ever on screen since this page started (a console reopened reduced must never show it).
    const sample = () => {
      const panel = documentRef.querySelector(".panel");
      if (panel && windowRef.getComputedStyle?.(panel)?.display !== "none" && panel.offsetHeight > 0) panelEverVisible = true;
    };
    sample();
    const timer = windowRef.setInterval?.(sample, 16);
    windowRef.setTimeout?.(() => windowRef.clearInterval?.(timer), 4000);
    stopSampling = () => windowRef.clearInterval?.(timer);
  }
  const reply = (id, payload) => channel.postMessage({ to: "fluidity-runner", from: realm, id, ...payload });
  // Whether this page draws frames now: the notice shows its panel and the chips are measured in a frame, and a page
  // the browser does not paint (a covered or minimised window) runs none.
  const nextFrame = (timeoutMs) => new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    (windowRef.requestAnimationFrame || ((callback) => setTimeout(callback, 0)))(() => { clearTimeout(timer); resolve(true); });
  });
  channel.onmessage = async (message) => {
    const data = message?.data;
    if (!data || data.to !== realm || !data.id) return;
    try {
      const base = { ok: true, installedAt, mark: windowRef.__fluidityCheckMark ?? null, search: String(windowRef.location?.search || ""),
        size: { width: Number(windowRef.innerWidth) || 0, height: Number(windowRef.innerHeight) || 0 } };
      if (data.command === "ping") return reply(data.id, base);
      if (data.command === "mark") { windowRef.__fluidityCheckMark = data.token; return reply(data.id, { ...base, mark: data.token }); }
      if (realm === "index") {
        if (data.command === "snapshot") return reply(data.id, { ...base, ...trackerSnapshot(documentRef) });
        // The tracker's own diagnostic log (initiativeList.js), on for the length of the check: when each metadata event
        // is processed and each render runs. Its times are this page's, so the page's time origin goes with them.
        if (data.command === "diagnostics") {
          const api = windowRef.__tbpInitiativeDiagnostics;
          if (!api) return reply(data.id, { ...base, ok: false, error: "diagnostica del tracker non disponibile" });
          if (data.action === "start") { api.enable(); api.clear(); return reply(data.id, base); }
          const events = api.dump();
          api.disable();
          return reply(data.id, { ...base, timeOrigin: Number(windowRef.performance?.timeOrigin) || 0, events });
        }
        if (data.command === "turn") {
          const pressed = pressTrackerButton(documentRef, data.direction < 0 ? "Turno precedente" : "Turno successivo");
          return reply(data.id, { ...base, ok: pressed, error: pressed ? "" : "pulsante del turno non trovato o disattivato" });
        }
        if (data.command === "chip-check") {
          const cards = Array.from(documentRef.querySelectorAll("[data-chip-dock-card='1']"));
          if (!cards.length) return reply(data.id, { ...base, cards: 0, changed: 0 });
          const { syncChipDockCardHeight } = await import("./initiativeChipOverflow.js");
          // Two passes: the first corrects what was stale, the second says whether the measure itself is stable.
          const pass = () => cards.map((card) => {
            const before = card.style.height;
            syncChipDockCardHeight(card);
            return { itemId: card.dataset.itemId || "", active: card.dataset.active === "1", before, after: card.style.height };
          }).filter((entry) => entry.before !== entry.after);
          const first = pass();
          const framesRun = await nextFrame(300);
          const second = pass();
          return reply(data.id, { ...base, cards: cards.length, changed: first.length, details: first, unstable: second.length, framesRun,
            visibility: String(documentRef.visibilityState || "") });
        }
      }
      if (realm === "turn-notice" && data.command === "snapshot") {
        // The turn's panel among the page's panels (save and zone reminders use the same class).
        const panels = Array.from(documentRef.querySelectorAll(".notice")).map((panel) => ({
          visible: panel.classList.contains("is-visible"),
          title: text(panel.querySelector(".title")),
        }));
        const turnPanel = panels.filter((panel) => panel.visible && /^Turno di\s/i.test(panel.title)).at(-1);
        // A turn panel drawn but never shown: only a frame adds its visible class, so say whether frames run here.
        const hiddenTurnPanel = !turnPanel && panels.some((panel) => /^Turno di\s/i.test(panel.title));
        const framesRun = hiddenTurnPanel ? await nextFrame(250) : null;
        return reply(data.id, { ...base, title: turnPanel?.title || "", panels, received: [...received],
          visibility: String(documentRef.visibilityState || ""), framesRun });
      }
      if (realm === "boss-actions") {
        if (data.command === "snapshot") {
          return reply(data.id, { ...base, minimized: documentRef.body?.dataset?.minimized === "true", panelEverVisible });
        }
        if (data.command === "minimize") {
          const minimized = documentRef.body?.dataset?.minimized === "true";
          if (minimized !== !!data.value) documentRef.getElementById("boss-minimize")?.click();
          return reply(data.id, base);
        }
      }
      return reply(data.id, { ok: false, error: `comando ${data.command} non previsto in ${realm}` });
    } catch (error) {
      return reply(data.id, { ok: false, error: String(error?.message || error) });
    }
  };
  return () => { stopSampling(); channel.close?.(); };
}

// ---- the background's side ----

export function createFluidityCheckClient({
  channel = typeof globalThis.BroadcastChannel === "function" ? new globalThis.BroadcastChannel(CHECK_CHANNEL) : null,
  timeoutMs = 3000,
} = {}) {
  if (!channel) throw new Error("BroadcastChannel non disponibile in questo browser.");
  const pending = new Map();
  let sequence = 0;
  channel.onmessage = (message) => {
    const data = message?.data;
    if (!data || data.to !== "fluidity-runner" || !pending.has(data.id)) return;
    const { resolve, timer } = pending.get(data.id);
    clearTimeout(timer);
    pending.delete(data.id);
    resolve(data);
  };
  const request = (realm, command, payload = {}, { timeout = timeoutMs } = {}) => {
    const id = `${Date.now().toString(36)}-${++sequence}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${realm} non risponde`)); }, timeout);
      pending.set(id, { resolve, timer });
      channel.postMessage({ to: realm, id, command, ...payload });
    });
  };
  return {
    request,
    // The answer, or null when the page is not open (or not yet booted).
    async tryRequest(realm, command, payload = {}, options = {}) {
      try { return await request(realm, command, payload, options); } catch { return null; }
    },
    close: () => channel.close?.(),
  };
}

function hasTickSince(events, since) {
  return (events || []).some((event) => event?.type === "effects-command" && Number(event.at) >= since
    && (TICK_PATTERN.test(String(event.commandKind || "")) || TICK_PATTERN.test(String(event.kind || ""))));
}

// The tracker's diagnostic events on the shared clock (epoch ms), to line them up with the other exports.
function trackerDiagnosticsOf(answer) {
  if (!answer?.ok || !Array.isArray(answer.events)) return null;
  return answer.events.map((event) => ({ ...event, at: Math.round(answer.timeOrigin + Number(event.ms || 0)) }));
}

async function waitFor(check, { timeoutMs, stepMs = 150, wait = sleep, now = () => Date.now() }) {
  const deadline = now() + timeoutMs;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (now() >= deadline) return null;
    await wait(stepMs);
  }
}

async function activeActor(obr) {
  const metadata = await obr.scene.getMetadata();
  const state = metadata?.[STATE_KEY] || {};
  const order = Array.isArray(state.order) ? state.order : [];
  const id = String(order[Math.max(0, Math.min(order.length - 1, Number(state.current) || 0))] || "");
  const virtual = id.startsWith("__") || id.includes("::");
  const [item] = virtual || !id ? [] : await obr.scene.items.getItems([id]).catch(() => []);
  return { id, virtual, name: item?.name || "", round: Number(state.round) || 0 };
}

/**
 * The GM's run. probe: the background's __tbpPerf; obr: its SDK. Each step adds a row { verifica, esito, dettaglio }
 * (esito: "ok", "ATTENZIONE", "saltata"); the rows are printed, saved as perf-runs/verifica-fluidita.json with the
 * measurement block's export, and returned.
 */
export async function runFluidityCheck({
  probe, obr, turns = 5, measureTurns = 10, settleMs = 3000, tickTimeoutMs = 15000,
  client = createFluidityCheckClient(), save = savePerfRun, wait = sleep, now = () => Date.now(), log = console.log,
  importTrackerPopover = () => import("./trackerPopover.js"),
  importBossLauncher = () => import("./bossActionsLauncher.js"),
} = {}) {
  if (!probe?.enabled) throw new Error("Accendi prima il probe: __tbpPerf.enable() e ricarica Owlbear.");
  if (!obr) throw new Error("SDK del background non disponibile: esegui dal contesto background.html.");
  if (await obr.player.getRole() !== "GM") throw new Error("La verifica guidata si esegue sulla finestra del GM.");
  if (!await client.tryRequest("index", "ping")) throw new Error("Il tracker non risponde: aprilo in questa finestra e riprova.");
  const rows = [];
  const row = (verifica, esito, dettaglio = "") => { rows.push({ verifica, esito, dettaglio }); log(`[verifica] ${verifica}: ${esito}${dettaglio ? ` · ${dettaglio}` : ""}`); };
  const turnOnce = async (direction = 1) => {
    const answer = await client.request("index", "turn", { direction });
    if (!answer.ok) throw new Error(answer.error || "turno non avanzato");
  };
  let movedTurns = 0;
  let hpRestore = null;
  let trackerDiagnostics = null;
  try {
    // D6 (V1): the tracker reopened with its own id and URL, without closing it first.
    {
      const token = `d6-${now().toString(36)}`;
      await client.request("index", "mark", { token });
      const [width, height] = await Promise.all([
        obr.popover.getWidth(TRACKER_POPOVER_ID).catch(() => 420),
        obr.popover.getHeight(TRACKER_POPOVER_ID).catch(() => 600),
      ]);
      const before = await client.tryRequest("index", "ping", {}, { timeout: 800 });
      // Another place and another size: OBR must apply both to the same page.
      const asked = { width: Math.max(320, width - 60), height: Math.max(300, height - 80) };
      const startedAt = now();
      log("[verifica] D6: il tracker salta in alto a sinistra, più piccolo, poi torna al suo posto. Guardalo.");
      await obr.popover.open({
        id: TRACKER_POPOVER_ID, url: "/?surface=tracker", ...asked, anchorReference: "POSITION",
        anchorPosition: { left: 300, top: 80 }, anchorOrigin: { horizontal: "LEFT", vertical: "TOP" },
        transformOrigin: { horizontal: "LEFT", vertical: "TOP" }, disableClickAway: true, marginThreshold: 12, hidePaper: true,
      });
      await wait(1200);
      const answer = await waitFor(() => client.tryRequest("index", "ping", {}, { timeout: 800 }), { timeoutMs: 10000, wait, now });
      const kept = answer?.mark === token;
      const resized = !!answer && Math.abs(answer.size.width - asked.width) <= 2 && Math.abs(answer.size.height - asked.height) <= 2;
      row("D6 · tracker riaperto senza chiuderlo", kept && resized ? "ok" : "ATTENZIONE",
        kept ? `stessa pagina, nessun ricaricamento; misura ${answer.size.width}×${answer.size.height} (chiesta ${asked.width}×${asked.height}, prima ${before?.size?.width ?? "?"}×${before?.size?.height ?? "?"})${resized ? "" : ": OBR non ha applicato la misura"}`
          : answer ? `pagina ricaricata (pronta dopo ${now() - startedAt} ms)` : "il tracker non risponde più");
      // V1's own path puts it back: the tracker's place and size from the stored placement, the page kept.
      const { openTrackerPopover } = await importTrackerPopover();
      await openTrackerPopover({ reposition: true });
      await wait(1200);
      const back = await waitFor(() => client.tryRequest("index", "ping", {}, { timeout: 800 }), { timeoutMs: 10000, wait, now });
      const backKept = back?.mark === token;
      const backSized = !!back && !!before && Math.abs(back.size.width - before.size.width) <= 2 && Math.abs(back.size.height - before.size.height) <= 2;
      row("V1 · tracker rimesso al suo posto senza chiuderlo", backKept && backSized ? "ok" : "ATTENZIONE",
        !back ? "il tracker non risponde più"
          : `${backKept ? "stessa pagina" : "pagina ricaricata"}; misura ${back.size.width}×${back.size.height} (quella di partenza ${before?.size?.width ?? "?"}×${before?.size?.height ?? "?"}). Controlla a occhio che sia tornato al suo posto.`);
      await wait(800);
    }

    // P4b, T1, T7: each turn reaches the tracker and the notice, which names the active creature.
    {
      const latencies = [];
      const problems = [];
      for (let index = 0; index < turns; index += 1) {
        const before = await activeActor(obr);
        const startedAt = now();
        await turnOnce(1);
        movedTurns += 1;
        const actor = await waitFor(async () => {
          const current = await activeActor(obr);
          return current.id && (current.id !== before.id || current.round !== before.round) ? current : null;
        }, { timeoutMs: 6000, wait, now });
        if (!actor) { problems.push(`turno ${index + 1}: lo stato non è cambiato`); continue; }
        const tracker = await waitFor(async () => {
          const snapshot = await client.tryRequest("index", "snapshot");
          return snapshot?.active?.itemId === actor.id ? snapshot : null;
        }, { timeoutMs: 4000, wait, now });
        if (!tracker) problems.push(`turno ${index + 1}: il tracker non mostra attivo ${actor.name || actor.id}`);
        if (actor.virtual) continue;
        const seen = new Set();
        const notice = await waitFor(async () => {
          const snapshot = await client.tryRequest("turn-notice", "snapshot", {}, { timeout: 800 });
          for (const panel of snapshot?.panels || []) if (panel.title) seen.add(panel.title);
          return snapshot && noticeNamesActor(snapshot.title, actor.name) ? snapshot : null;
        }, { timeoutMs: 6000, wait, now });
        if (!notice) problems.push(`turno ${index + 1}: nessun avviso per ${actor.name}${seen.size ? ` (pannelli visti: ${[...seen].join(" | ")})` : " (pagina dell'avviso senza pannelli)"}`);
        else latencies.push(now() - startedAt);
        await wait(settleMs);
      }
      const sorted = [...latencies].sort((a, b) => a - b);
      const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
      row("Turno e avviso (P4b, T1, T7)", problems.length ? "ATTENZIONE" : "ok",
        problems.length ? problems.join("; ") : `${latencies.length} avvisi, dal clic al disegno p50 ${median} ms (lettura ogni 150 ms)`);
    }

    // P4b: three turns in a row; the notice left on screen is the latest one.
    {
      for (let index = 0; index < 3; index += 1) { await turnOnce(1); movedTurns += 1; await wait(150); }
      // The notice closes by itself after 4.5 s: it is read while it is on screen, and the last one read counts.
      let notice = null;
      const until = now() + 4000;
      while (now() < until) {
        const snapshot = await client.tryRequest("turn-notice", "snapshot", {}, { timeout: 800 });
        if (snapshot?.title) notice = snapshot;
        else if (snapshot && !notice?.title) notice = { ...snapshot, title: "" };
        await wait(250);
      }
      const actor = await activeActor(obr);
      const order = evaluateNoticeOrder(notice?.received || []);
      // A virtual turn (Lair, Epic Action) has no creature name to compare: only the order is checked then.
      const named = actor.virtual || noticeNamesActor(notice?.title, actor.name);
      const drawnTitles = (notice?.panels || []).map((panel) => `${panel.title}${panel.visible ? "" : " (non visibile)"}`).join(" | ");
      const frames = notice?.framesRun === false ? "; la pagina non disegna fotogrammi (finestra coperta o ridotta?)"
        : notice?.framesRun === true ? "; la pagina disegna fotogrammi" : "";
      row("Tre turni di fila: vince l'ultimo (P4b)", notice && order.received && named && order.outOfOrder === 0 ? "ok" : "ATTENZIONE",
        !notice ? "la pagina dell'avviso non risponde"
          : `sullo schermo «${notice.title || "nessun avviso"}», attivo ${actor.name || actor.id}${actor.virtual ? " (turno virtuale: solo l'ordine)" : ""}; ${order.received} avvisi ricevuti, ${order.outOfOrder} fuori ordine${!notice.title && drawnTitles ? `; pannelli: ${drawnTitles}` : ""}${frames}`);
    }

    // T5: the chip heights the tracker kept are the ones a fresh measure gives.
    {
      const answer = await client.tryRequest("index", "chip-check");
      if (!answer?.ok) row("Altezza delle chip (T5)", "saltata", answer?.error || "tracker non raggiungibile");
      else if (!answer.cards) row("Altezza delle chip (T5)", "saltata", "nessuna card con chip nella vista attuale (serve la vista classica con condizioni)");
      else {
        const details = (answer.details || []).map((entry) => `${entry.itemId}${entry.active ? " (attiva)" : ""} ${entry.before || "-"} → ${entry.after}`).join(", ");
        row("Altezza delle chip (T5)", answer.changed ? "ATTENZIONE" : "ok",
          `${answer.cards} card con chip, ${answer.changed} con un'altezza diversa da una misura nuova${details ? `: ${details}` : ""}`
          + (answer.changed ? `; alla seconda misura ${answer.unstable ? `${answer.unstable} cambiano ancora (misura instabile)` : "stabili"}` : "")
          + (answer.framesRun === false ? "; il tracker non disegna fotogrammi (finestra coperta o ridotta?)" : ""));
      }
    }

    // S6, S7: one HP change reaches the tracker and the map widgets, then the HP goes back.
    {
      const items = await obr.scene.items.getItems();
      const candidates = items.filter((item) => item?.metadata?.[META_KEY]?.inInitiative === true && Number(item.metadata[META_KEY].hpMax) > 0);
      const token = candidates.find((item) => item.metadata[META_KEY].attitude === "enemy") || candidates[0];
      if (!token) {
        row("PF e barre sulla mappa (S6, S7)", "saltata", "nessun token in iniziativa con PF");
      } else {
        const meta = token.metadata[META_KEY];
        const hpMax = Number(meta.hpMax);
        const original = Number(meta.hp) || 0;
        const changed = original > 3 ? original - 3 : Math.min(hpMax, original + 3);
        hpRestore = { id: token.id, hp: meta.hp };
        const writeHp = (value) => obr.scene.items.updateItems([token.id], (drafts) => {
          for (const draft of drafts) draft.metadata[META_KEY] = { ...(draft.metadata[META_KEY] || {}), hp: value };
        });
        const problems = [];
        for (const value of [changed, original]) {
          await writeHp(value);
          const result = await waitFor(async () => {
            const evaluated = evaluateHpWidgets(await obr.scene.items.getItems(), token.id, value, hpMax);
            return evaluated.ok ? evaluated : null;
          }, { timeoutMs: 5000, wait, now });
          if (!result) problems.push(`${value}/${hpMax}: ${evaluateHpWidgets(await obr.scene.items.getItems(), token.id, value, hpMax).problems.join(", ")}`);
          const card = (await client.tryRequest("index", "snapshot"))?.cards?.find((entry) => entry.itemId === token.id);
          if (card && card.hpMode === "exact" && !card.hpText.includes(String(value))) problems.push(`card del tracker «${card.hpText}» invece di ${value}`);
          await wait(800);
        }
        hpRestore = null;
        row("PF e barre sulla mappa (S6, S7)", problems.length ? "ATTENZIONE" : "ok",
          problems.length ? problems.join("; ") : `${token.name}: ${changed}/${hpMax} e ritorno a ${original}/${hpMax}, barre e testo giusti`);
      }
    }

    // V3: a reduced Boss console comes back reduced, never showing its panel.
    {
      const boss = await client.tryRequest("boss-actions", "snapshot", {}, { timeout: 800 });
      const source = new URLSearchParams(boss?.search || "").get("source");
      if (!boss || !source) {
        row("Console Boss riaperta ridotta (V3)", "saltata", "apri la console Boss di un boss prima di avviare la verifica");
      } else {
        const wasMinimized = boss.minimized;
        await client.request("boss-actions", "minimize", { value: true });
        await wait(600);
        await obr.popover.close(BOSS_POPOVER_ID).catch(() => {});
        await wait(500);
        const { openBossActionsPopover } = await importBossLauncher();
        await openBossActionsPopover(source);
        const reopened = await waitFor(() => client.tryRequest("boss-actions", "snapshot", {}, { timeout: 800 }), { timeoutMs: 10000, wait, now });
        await wait(1500);
        const after = reopened ? await client.tryRequest("boss-actions", "snapshot", {}, { timeout: 800 }) : null;
        row("Console Boss riaperta ridotta (V3)", after?.minimized && !after.panelEverVisible ? "ok" : "ATTENZIONE",
          after ? `ridotta: ${after.minimized ? "sì" : "no"}, pannello mai visibile: ${after.panelEverVisible ? "no" : "sì"}` : "la console non si è riaperta");
        if (after && !wasMinimized) await client.request("boss-actions", "minimize", { value: false }).catch(() => {});
      }
    }

    // The measurement block, as on 24/10: the probe's export after measureTurns turns, each waiting for its tick.
    if (measureTurns > 0) {
      probe.reset();
      await client.tryRequest("index", "diagnostics", { action: "start" });
      const missed = [];
      for (let index = 1; index <= measureTurns; index += 1) {
        const since = now() - 50;
        await turnOnce(1);
        movedTurns += 1;
        const ticked = await waitFor(() => hasTickSince(probe.events, since), { timeoutMs: tickTimeoutMs, stepMs: 200, wait, now });
        if (!ticked) missed.push(index);
        await wait(settleMs);
      }
      trackerDiagnostics = trackerDiagnosticsOf(await client.tryRequest("index", "diagnostics", { action: "stop" }));
      const content = probe.export("turni-fluidita");
      const { file } = await save({ name: "gm-turni-fluidita", content });
      const summary = blockSummary(content);
      row("Misura del cambio turno", missed.length ? "ATTENZIONE" : "ok",
        `tick p50 ${summary.tickP50} ms, p95 ${summary.tickP95} ms su ${summary.ticks} tick${missed.length ? `; turni senza tick: ${missed.join(", ")}` : ""}${file ? ` · ${file}` : ""}`);
    }
  } catch (error) {
    row("Verifica interrotta", "ATTENZIONE", String(error?.message || error));
  } finally {
    if (hpRestore) {
      await obr.scene.items.updateItems([hpRestore.id], (drafts) => {
        for (const draft of drafts) draft.metadata[META_KEY] = { ...(draft.metadata[META_KEY] || {}), hp: hpRestore.hp };
      }).catch((error) => log(`[verifica] PF non ripristinati: ${error?.message || error}`));
    }
    // The turns go back where they were, through the tracker's "previous" button.
    for (let index = 0; index < movedTurns; index += 1) {
      const answer = await client.tryRequest("index", "turn", { direction: -1 });
      if (!answer?.ok) { log(`[verifica] turno non riportato indietro (${movedTurns - index} mancanti): fallo a mano.`); break; }
      await wait(700);
    }
  }
  console.table?.(rows);
  await save({ name: "verifica-fluidita", content: JSON.stringify({ label: "verifica-fluidita", at: new Date(now()).toISOString(), rows, trackerDiagnostics }, null, 2) });
  log("[verifica] fine. Da guardare a occhio: tracker che non si svuota spostandolo, alone e chip senza scatti, tiro contro la morte, Cronologia e Combat Log.");
  client.close?.();
  return rows;
}

/**
 * The table screen's side: it watches its own tracker and turn notice while the GM runs the check, then saves
 * perf-runs/proiettore-verifica-fluidita.json (samples and anomalies) and the probe's export.
 */
export async function watchFluidity({
  probe, obr = null, durationMs = 240000, stepMs = 300,
  client = createFluidityCheckClient({ timeoutMs: 600 }), save = savePerfRun, wait = sleep, now = () => Date.now(), log = console.log,
} = {}) {
  if (!probe?.enabled) throw new Error("Accendi prima il probe: __tbpPerf.enable() e ricarica Owlbear.");
  probe.reset();
  await client.tryRequest("index", "diagnostics", { action: "start" });
  log(`[verifica] osservo tracker e avvisi di questo schermo per ${Math.round(durationMs / 1000)} s: ora avvia la verifica sul GM.`);
  const samples = [];
  const until = now() + durationMs;
  let lastReceived = [];
  const names = new Map();
  const nameOf = async (id) => {
    if (!id || id.startsWith("__") || id.includes("::")) return "";
    if (!names.has(id)) names.set(id, (await obr?.scene?.items?.getItems?.([id]).catch(() => []))?.[0]?.name || "");
    return names.get(id);
  };
  while (now() < until) {
    const [tracker, notice] = await Promise.all([
      client.tryRequest("index", "snapshot"),
      client.tryRequest("turn-notice", "snapshot", {}, { timeout: 400 }),
    ]);
    if (notice?.received) lastReceived = notice.received;
    const active = tracker?.active || null;
    samples.push({
      at: now(),
      activeId: active?.itemId || "",
      activeVirtual: !!active && (active.itemId.startsWith("__") || active.itemId.includes("::")),
      activeName: active ? await nameOf(active.itemId) : "",
      noticeTitle: notice?.title || "",
      // Whether the notice page answered at all, and its panels (title and visibility) when it has no turn title.
      noticePage: !!notice,
      ...(notice && !notice.title && notice.panels?.length ? { noticePanels: notice.panels } : {}),
      ...(notice?.framesRun !== null && notice?.framesRun !== undefined ? { noticeFramesRun: notice.framesRun } : {}),
      ...(notice?.visibility ? { noticeVisibility: notice.visibility } : {}),
      enemyHp: (tracker?.cards || []).filter((card) => card.hpMode && card.hpMode !== "exact").map((card) => `${card.itemId}:${card.hpText}${card.knockedOut ? ":KO" : ""}`).join(" "),
    });
    await wait(stepMs);
  }
  const trackerDiagnostics = trackerDiagnosticsOf(await client.tryRequest("index", "diagnostics", { action: "stop" }, { timeout: 2000 }));
  const anomalies = evaluateWatchLog(samples);
  const order = evaluateNoticeOrder(lastReceived);
  if (order.outOfOrder) anomalies.push({ kind: "avvisi-fuori-ordine", count: order.outOfOrder });
  const noticeSeen = {
    pageAnswered: samples.filter((sample) => sample.noticePage).length,
    withTurnTitle: samples.filter((sample) => sample.noticeTitle).length,
    withPanelsOnly: samples.filter((sample) => sample.noticePanels).length,
    // A turn panel not shown while the page draws frames is the plugin's problem; without frames, the window's.
    hiddenWhileFramesRun: samples.filter((sample) => sample.noticeFramesRun === true).length,
    hiddenWithoutFrames: samples.filter((sample) => sample.noticeFramesRun === false).length,
  };
  // A panel is hidden for a moment as it enters and as it fades out: only a turn never seen on screen is one.
  const shownTitles = new Set(samples.map((sample) => sample.noticeTitle).filter(Boolean));
  const neverShown = [...new Set(samples.filter((sample) => sample.noticeFramesRun === true)
    .flatMap((sample) => (sample.noticePanels || []).map((panel) => panel.title))
    .filter((title) => /^Turno di\s/i.test(title) && !shownTitles.has(title)))];
  noticeSeen.neverShown = neverShown;
  if (neverShown.length) anomalies.push({ kind: "avviso-mai-visibile-con-fotogrammi", titles: neverShown });
  if (noticeSeen.hiddenWithoutFrames) anomalies.push({ kind: "pagina-senza-fotogrammi", count: noticeSeen.hiddenWithoutFrames,
    note: "il browser non disegna questa finestra (coperta, ridotta o in un'altra scheda): gli avvisi non si vedono" });
  if (!noticeSeen.withTurnTitle) anomalies.push({ kind: "nessun-avviso-letto", ...noticeSeen });
  await save({ name: "proiettore-verifica-fluidita", content: JSON.stringify({ label: "proiettore-verifica-fluidita", samples, anomalies, noticeOrder: order, noticeSeen, trackerDiagnostics }, null, 2) });
  await save({ name: "proiettore-turni-fluidita", content: probe.export("proiettore-turni-fluidita") });
  log(anomalies.length ? `[verifica] ${anomalies.length} anomalie sullo schermo del tavolo:` : "[verifica] schermo del tavolo: nessuna anomalia.");
  if (anomalies.length) console.table?.(anomalies);
  client.close?.();
  return { anomalies, samples: samples.length, noticeOrder: order };
}
