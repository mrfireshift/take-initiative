import { ID } from "./constants.js";
import { currentAfterOrderChange } from "./initiativeOrderCore.js";
import { blockSummary, savePerfRun } from "./perfSessionRunner.js";

// Dev tool: the automatic room check of the fluidity lots (docs/PROVA_STANZA_FLUIDITA.md). With the probe on:
// - the GM, from the background's console: `await __tbpPerf.runFluidityCheck()`;
// - the table screen, from its background's console, before the GM starts: `await __tbpPerf.watchFluidity()`.
// The pages of this browser (tracker, turn notice, Boss console) answer through a native BroadcastChannel (no Owlbear
// broadcast, no network) while the probe is on. The turn moves by pressing the tracker's own buttons, so it goes
// through every queue and guard of a click; the tool never writes the initiative state. The only scene write is one
// token's HP (merged into its metadata) for the bar check, put back at the end, also when a step fails.
// The bugfix plan's room check (`await __tbpPerf.runBugfixCheck()`, lot L23) lives here too: see runBugfixCheck.
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

// A Paragon's extra cards ("<id>::p1") are its creature; other ids with "::" and those starting with "__" are virtual
// turns (Lair, Epic) with no token.
const baseActorId = (id) => String(id || "").replace(/::p\d+$/u, "");
const isVirtualActor = (id) => {
  const value = String(id || "");
  return !value || value.startsWith("__") || (value.includes("::") && !/::p\d+$/u.test(value));
};
const AURA_SOURCE = [[`${ID}/spellAura`, "casterId"], [`${ID}/classFeatureAura`, "sourceId"], [`${ID}/customAura`, "sourceId"]];

// L6 (decision D3): where the turn must go when the active creature leaves the order, with its Paragon cards: the
// next one still there, or the first with the round after.
export function expectedTurnAfterRemoval(state, removedId) {
  const order = (Array.isArray(state?.order) ? state.order : []).map(String);
  const removed = baseActorId(removedId);
  const next = order.filter((id) => baseActorId(id) !== removed);
  const { current, round } = currentAfterOrderChange(order, state?.current, next, state?.round);
  return { id: next[current] || "", round };
}

// L16: what a screen shows of the tokens hidden from the players: a bar, an HP number or an aura not marked hidden,
// or a tracker card. On the players' side a token the scene does not list counts as hidden.
export function hiddenTokenLeaks(items, cardIds = []) {
  const list = Array.isArray(items) ? items : [];
  const byId = new Map(list.map((item) => [item?.id, item]));
  const hidden = (id) => !!id && (!byId.has(id) || byId.get(id)?.visible === false);
  const leaks = [];
  for (const item of list) {
    if (!item || item.visible === false) continue;
    const metadata = item.metadata || {};
    const barOf = metadata[HPBAR_META]?.targetId || metadata[HPTEXT_META]?.targetId;
    if (barOf && hidden(barOf)) leaks.push({ tokenId: barOf, kind: metadata[HPTEXT_META] ? "numero-pf" : "barra-pf", itemId: item.id });
    const [auraKey, sourceField] = AURA_SOURCE.find(([key]) => metadata[key]) || [];
    const auraOf = auraKey ? metadata[auraKey]?.[sourceField] || item.attachedTo : "";
    if (auraOf && hidden(auraOf)) leaks.push({ tokenId: auraOf, kind: "aura", itemId: item.id });
  }
  for (const id of Array.isArray(cardIds) ? cardIds : []) {
    if (!isVirtualActor(id) && hidden(baseActorId(id))) leaks.push({ tokenId: baseActorId(id), kind: "card", itemId: id });
  }
  return leaks;
}

// The table screen's samples: a leak that stays longer than the settle time (the time to hide what was just hidden)
// is an anomaly, once per token and kind.
export function evaluateHiddenLeakLog(samples, { settleMs = 2500 } = {}) {
  const anomalies = [];
  const since = new Map();
  for (const sample of Array.isArray(samples) ? samples : []) {
    const present = new Set();
    for (const leak of sample?.hiddenLeaks || []) {
      const key = `${leak.tokenId}:${leak.kind}`;
      present.add(key);
      if (!since.has(key)) since.set(key, sample.at);
      if (sample.at - since.get(key) >= settleMs) {
        anomalies.push({ at: sample.at, kind: "token-nascosto-visibile", what: leak.kind, tokenId: leak.tokenId, itemId: leak.itemId });
        since.set(key, Infinity);
      }
    }
    for (const key of [...since.keys()]) if (!present.has(key)) since.delete(key);
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
        // L27: the HP of a card's inline editor, opened as a press on its left half and saved as Enter saves it.
        if (data.command === "card-hp") {
          const pill = Array.from(documentRef.querySelectorAll("[data-badge='hp']")).find((node) => node.dataset?.itemId === data.itemId);
          if (!pill) return reply(data.id, { ...base, ok: false, error: "PF della card non modificabili qui (servono la vista del GM e i PF esatti)" });
          const bounds = pill.getBoundingClientRect?.() || { left: 0 };
          const PointerEventType = windowRef.PointerEvent || windowRef.MouseEvent;
          pill.dispatchEvent(new PointerEventType("pointerdown", { bubbles: true, cancelable: true, clientX: Number(bounds.left) + 1 }));
          documentRef.dispatchEvent?.(new PointerEventType("pointerup", { bubbles: true }));
          const deadline = now() + 3000;
          while ((!pill.__iHP || typeof pill.__commitFn !== "function") && now() < deadline) await sleep(50);
          if (!pill.__iHP || typeof pill.__commitFn !== "function") return reply(data.id, { ...base, ok: false, error: "l'editor dei PF non si è aperto" });
          pill.__iHP.value = String(data.value);
          const saved = await pill.__commitFn();
          return reply(data.id, { ...base, ok: saved !== false, error: saved === false ? "salvataggio dei PF rifiutato" : "" });
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
      // The size V1 asks is computed again from the window as it is now (it may differ from the start if the window
      // changed): the page must have the size OBR now gives the popover.
      const [obrWidth, obrHeight] = await Promise.all([
        obr.popover.getWidth(TRACKER_POPOVER_ID).catch(() => null),
        obr.popover.getHeight(TRACKER_POPOVER_ID).catch(() => null),
      ]);
      const backSized = !!back && Number.isFinite(Number(obrWidth)) && Number.isFinite(Number(obrHeight))
        && Math.abs(back.size.width - Number(obrWidth)) <= 2 && Math.abs(back.size.height - Number(obrHeight)) <= 2;
      row("V1 · tracker rimesso al suo posto senza chiuderlo", backKept && backSized ? "ok" : "ATTENZIONE",
        !back ? "il tracker non risponde più"
          : `${backKept ? "stessa pagina" : "pagina ricaricata"}; misura ${back.size.width}×${back.size.height}, quella del popover ${obrWidth ?? "?"}×${obrHeight ?? "?"} (all'inizio ${before?.size?.width ?? "?"}×${before?.size?.height ?? "?"}). Controlla a occhio che sia tornato al suo posto.`);
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
    // L16: the bars, auras and cards of the tokens hidden from the players (runBugfixCheck hides one for a while).
    const sceneItems = await obr?.scene?.items?.getItems?.().catch(() => null);
    const hiddenLeaks = sceneItems?.length && tracker ? hiddenTokenLeaks(sceneItems, (tracker.cards || []).map((card) => card.itemId)) : [];
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
      ...(hiddenLeaks.length ? { hiddenLeaks } : {}),
    });
    await wait(stepMs);
  }
  const trackerDiagnostics = trackerDiagnosticsOf(await client.tryRequest("index", "diagnostics", { action: "stop" }, { timeout: 2000 }));
  const anomalies = [...evaluateWatchLog(samples), ...evaluateHiddenLeakLog(samples)];
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

// ---- the bugfix plan's room check (lot L23, docs/PIANO_BUGFIX_POLISHING.md section 7) ----

const TEST_CONDITION = "Prova verifica";
const conditionsOf = (meta) => (Array.isArray(meta?.conditions) ? meta.conditions : []);

/**
 * The GM's run, from the background's console: `await __tbpPerf.runBugfixCheck()`, with the tracker open and, on the
 * table screen, `watchFluidity()` started first. It does what a GM would, through the same paths, and puts it back:
 * - L2: the tracker closed and opened again (a new page), then ▶: a test condition ending at the active creature's
 *   turn end goes away;
 * - L27: the HP from a Paragon boss's second card, through its inline editor (Cronologia: «Modifica HP»);
 * - L6: the active creature out of the initiative, as «Rimuovi dall'iniziativa» writes it: the turn goes to the next;
 * - L3: the two History entries undone together, as «Annulla N azioni» does;
 * - L16: a token hidden for hideMs: its bars and auras hidden on the GM's scene (the table screen checks its own).
 * It never writes the initiative state: the turn moves with the tracker's buttons and goes back with ◀ at the end.
 * Each step adds a row { verifica, esito, dettaglio }; the rows are printed, saved as perf-runs/verifica-bugfix.json
 * and returned.
 */
export async function runBugfixCheck({
  probe, obr, tickTimeoutMs = 15000, hideMs = 8000,
  client = createFluidityCheckClient(), save = savePerfRun, wait = sleep, now = () => Date.now(), log = console.log,
  importTrackerPopover = () => import("./trackerPopover.js"),
  importEffectsMutations = () => import("./effectsMutations.js"),
  importHistory = () => import("./history.js"),
} = {}) {
  if (!probe?.enabled) throw new Error("Accendi prima il probe: __tbpPerf.enable() e ricarica Owlbear.");
  if (!obr) throw new Error("SDK del background non disponibile: esegui dal contesto background.html.");
  if (await obr.player.getRole() !== "GM") throw new Error("La verifica guidata si esegue sulla finestra del GM.");
  if (!await client.tryRequest("index", "ping")) throw new Error("Il tracker non risponde: aprilo in questa finestra e riprova.");
  const rows = [];
  const row = (verifica, esito, dettaglio = "") => { rows.push({ verifica, esito, dettaglio }); log(`[verifica] ${verifica}: ${esito}${dettaglio ? ` · ${dettaglio}` : ""}`); };
  const readState = async () => {
    const state = (await obr.scene.getMetadata())?.[STATE_KEY] || {};
    const order = (Array.isArray(state.order) ? state.order : []).map(String);
    const current = Math.max(0, Math.min(order.length - 1, Number(state.current) || 0));
    return { order, current, round: Number(state.round) || 0, activeId: order[current] || "" };
  };
  const itemOf = async (id) => (await obr.scene.items.getItems([id]).catch(() => []))?.[0] || null;
  const writeMeta = (id, change) => obr.scene.items.updateItems([id], (drafts) => {
    for (const draft of drafts) {
      const meta = { ...(draft.metadata[META_KEY] || {}) };
      change(meta);
      draft.metadata[META_KEY] = meta;
    }
  });
  const writeVisible = (id, visible) => obr.scene.items.updateItems([id], (drafts) => { for (const draft of drafts) draft.visible = visible; });
  let forwardTurns = 0;
  // ▶ through the tracker, then the state that follows it.
  const advance = async () => {
    const before = await readState();
    const answer = await client.request("index", "turn", { direction: 1 });
    if (!answer.ok) throw new Error(answer.error || "turno non avanzato");
    forwardTurns += 1;
    const after = await waitFor(async () => {
      const state = await readState();
      return state.current !== before.current || state.round !== before.round ? state : null;
    }, { timeoutMs: 6000, wait, now });
    if (!after) throw new Error("dopo ▶ lo stato del turno non è cambiato");
    return after;
  };
  const start = await readState();
  if (!start.order.length) throw new Error("Nessuna creatura in iniziativa: prepara un combattimento e riprova.");
  const restore = { condition: null, removedId: "", hp: null, hiddenId: "" };
  let historyBefore = null;
  let paragon = null;
  let effects = null;
  try {
    // L2: a new tracker page still drives the turn's expiries.
    {
      const token = `l2-${now().toString(36)}`;
      await client.request("index", "mark", { token });
      log("[verifica] L2: il tracker si chiude e si riapre.");
      const { openTrackerPopover } = await importTrackerPopover();
      await openTrackerPopover({ refresh: true });
      await wait(1200);
      const reopened = await waitFor(async () => {
        const answer = await client.tryRequest("index", "ping", {}, { timeout: 800 });
        return answer && answer.mark !== token ? answer : null;
      }, { timeoutMs: 15000, wait, now });
      if (!reopened) throw new Error("il tracker non risponde dopo la riapertura");
      let state = await readState();
      for (let step = 0; isVirtualActor(state.activeId) && step < state.order.length; step += 1) state = await advance();
      const actorId = baseActorId(state.activeId);
      const actor = await itemOf(actorId);
      if (!actor) throw new Error("nessuna creatura attiva con un token");
      effects = await importEffectsMutations();
      const instanceId = `verifica-l2-${now().toString(36)}`;
      effects.requireAppliedEffectsMutation(await effects.runEffectsMutation([{
        type: "condition:add", targetIds: [actorId], conditionName: TEST_CONDITION, instanceIds: { [actorId]: instanceId },
        options: { expiry: { mode: "turn-end", actor: "target", actorId, remaining: 1 } },
      }], { kind: "condition", label: `Verifica: ${TEST_CONDITION}`, targetIds: [actorId], history: false }));
      restore.condition = { id: actorId, instanceId };
      await waitFor(async () => conditionsOf((await itemOf(actorId))?.metadata?.[META_KEY]).some((entry) => entry?.id === instanceId), { timeoutMs: 5000, wait, now });
      await advance();
      const gone = await waitFor(async () => !conditionsOf((await itemOf(actorId))?.metadata?.[META_KEY]).some((entry) => entry?.id === instanceId),
        { timeoutMs: tickTimeoutMs, stepMs: 250, wait, now });
      row("L2 · scadenze dopo la riapertura del tracker", gone ? "ok" : "ATTENZIONE",
        gone ? `pagina nuova; «${TEST_CONDITION}» su ${actor.name} scaduta alla fine del suo turno`
          : `«${TEST_CONDITION}» ancora su ${actor.name} ${Math.round(tickTimeoutMs / 1000)} s dopo ▶`);
    }

    const { getHistoryEntries, undoHistoryThrough } = await importHistory();
    historyBefore = new Set((await getHistoryEntries()).map((entry) => entry.id));

    // L27: the second card of a Paragon boss writes the boss's HP.
    {
      const state = await readState();
      const cardId = state.order.find((id) => /::p1$/u.test(id));
      const bossId = cardId ? baseActorId(cardId) : "";
      const boss = bossId ? await itemOf(bossId) : null;
      const meta = boss?.metadata?.[META_KEY] || {};
      const hp = Number(meta.hp) || 0;
      const hpMax = Number(meta.hpMax) || 0;
      if (!boss || hpMax <= 0) {
        row("L27 · PF dalla seconda card di un boss Paragon", "saltata", "nessun boss Paragon con PF in iniziativa");
      } else {
        const value = hp > 1 ? hp - 1 : Math.min(hpMax, hp + 1);
        restore.hp = { id: bossId, hp: meta.hp };
        const answer = await client.request("index", "card-hp", { itemId: cardId, value }, { timeout: 8000 });
        const written = answer.ok && await waitFor(async () => Number((await itemOf(bossId))?.metadata?.[META_KEY]?.hp) === value, { timeoutMs: 5000, wait, now });
        if (written) paragon = { id: bossId, name: boss.name, hp, value };
        else if (Number((await itemOf(bossId))?.metadata?.[META_KEY]?.hp) === hp) restore.hp = null;
        row("L27 · PF dalla seconda card di un boss Paragon", written ? "ok" : "ATTENZIONE",
          written ? `${boss.name}: ${hp} → ${value} dalla card ${cardId}` : answer.error || `i PF di ${boss.name} non sono diventati ${value}`);
      }
    }

    // L6: the active creature leaves the initiative; the turn goes to the next one still there.
    let removed = null;
    {
      let state = await readState();
      for (let step = 0; (isVirtualActor(state.activeId) || baseActorId(state.activeId) === paragon?.id) && step < state.order.length; step += 1) {
        state = await advance();
      }
      const removedId = baseActorId(state.activeId);
      const item = await itemOf(removedId);
      if (!item || isVirtualActor(state.activeId) || removedId === paragon?.id) throw new Error("nessuna creatura di turno da togliere");
      const expected = expectedTurnAfterRemoval(state, removedId);
      restore.removedId = removedId;
      await writeMeta(removedId, (meta) => { delete meta.inInitiative; });
      const after = await waitFor(async () => {
        const next = await readState();
        return next.order.some((id) => baseActorId(id) === removedId) ? null : next;
      }, { timeoutMs: 6000, wait, now });
      const tracker = after && await waitFor(async () => {
        const snapshot = await client.tryRequest("index", "snapshot");
        return snapshot?.active?.itemId === after.activeId ? snapshot : null;
      }, { timeoutMs: 4000, wait, now });
      const expectedName = (await itemOf(baseActorId(expected.id)))?.name || expected.id;
      const actualName = after ? (await itemOf(baseActorId(after.activeId)))?.name || after.activeId : "";
      const ok = !!after && after.activeId === expected.id && after.round === expected.round && !!tracker;
      removed = { id: removedId, name: item.name };
      row("L6 · tolta la creatura di turno", ok ? "ok" : "ATTENZIONE",
        !after ? `${item.name} è ancora nell'ordine`
          : `${item.name} tolta: di turno ${actualName} al round ${after.round} (atteso ${expectedName} al round ${expected.round})${tracker ? "" : "; il tracker non mostra attiva la card giusta"}`);
    }

    // L3: the two entries undone together from the History, as «Annulla N azioni» does.
    {
      const found = await waitFor(async () => {
        const entries = await getHistoryEntries();
        const fresh = entries.filter((entry) => !historyBefore.has(entry.id));
        const changesOf = (entry) => (Array.isArray(entry?.changes) ? entry.changes : []);
        const removal = fresh.find((entry) => entry.kind === "initiative-remove" && changesOf(entry).some((change) => change?.id === removed.id));
        const hpEntry = paragon ? fresh.find((entry) => entry !== removal && changesOf(entry).some((change) => change?.id === paragon.id)) : null;
        return removal && (!paragon || hpEntry) ? { entries, ours: [hpEntry, removal].filter(Boolean) } : null;
      }, { timeoutMs: 8000, stepMs: 300, wait, now });
      if (!found) {
        row("L3 · Annulla di due voci dalla Cronologia", "ATTENZIONE", "le voci di questa verifica non sono arrivate nella Cronologia (il tracker del GM è aperto?)");
      } else {
        const oldest = found.ours.reduce((first, entry) => (found.entries.indexOf(entry) < found.entries.indexOf(first) ? entry : first));
        const count = found.entries.length - found.entries.indexOf(oldest);
        let undone = null;
        for (let attempt = 0; attempt < 5; attempt += 1) {
          undone = await undoHistoryThrough(oldest.id);
          if (undone?.status !== "rejected") break;
          await wait(800);
        }
        const back = await waitFor(async () => {
          const removedBack = (await itemOf(removed.id))?.metadata?.[META_KEY]?.inInitiative === true;
          const hpBack = !paragon || Number((await itemOf(paragon.id))?.metadata?.[META_KEY]?.hp) === paragon.hp;
          return removedBack && hpBack;
        }, { timeoutMs: 6000, wait, now });
        if (back) { restore.removedId = ""; restore.hp = null; }
        const labels = found.ours.map((entry) => `«${entry.label}»`).join(" e ");
        row(`L3 · Annulla di ${found.ours.length === 2 ? "due voci" : "una voce"} dalla Cronologia`, back ? "ok" : "ATTENZIONE",
          `${labels}${count > found.ours.length ? ` (più ${count - found.ours.length} voci arrivate dopo)` : ""}: ${back
            ? `${removed.name} di nuovo in iniziativa${paragon ? `, ${paragon.name} di nuovo a ${paragon.hp} PF` : ""}`
            : `annullamento ${undone?.status || "senza risposta"}${undone?.result?.reason ? ` (${undone.result.reason})` : ""}`}${paragon ? "" : "; senza un boss Paragon una voce sola"}`);
      }
    }

    // L16: a hidden token keeps its bars and auras to the GM.
    {
      const items = await obr.scene.items.getItems();
      const state = await readState();
      const candidates = items.filter((item) => item?.metadata?.[META_KEY]?.inInitiative === true && item.visible !== false
        && Number(item.metadata[META_KEY].hpMax) > 0 && item.id !== baseActorId(state.activeId));
      const ownOf = (tokenId, list) => list.filter((item) => item?.metadata?.[HPBAR_META]?.targetId === tokenId || item?.metadata?.[HPTEXT_META]?.targetId === tokenId
        || AURA_SOURCE.some(([key, field]) => item?.metadata?.[key] && (item.metadata[key][field] || item.attachedTo) === tokenId));
      // A token with something on the map to hide, an enemy first.
      const withWidgets = candidates.filter((item) => ownOf(item.id, items).length);
      const token = withWidgets.find((item) => item.metadata[META_KEY].attitude === "enemy") || withWidgets[0];
      if (!token) {
        row("L16 · token nascosto: barre e aure solo al GM", "saltata", "nessun token visibile in iniziativa con barre o aure sulla mappa, oltre a quello di turno");
      } else {
        const own = (list) => ownOf(token.id, list);
        restore.hiddenId = token.id;
        log(`[verifica] L16: ${token.name} nascosto per ${Math.round(hideMs / 1000)} s. Sul tavolo non deve vedersi nulla di suo.`);
        await writeVisible(token.id, false);
        const hiddenOk = await waitFor(async () => {
          const current = await obr.scene.items.getItems();
          return hiddenTokenLeaks(current, []).every((leak) => leak.tokenId !== token.id) ? current : null;
        }, { timeoutMs: 5000, wait, now });
        const widgets = own(hiddenOk || await obr.scene.items.getItems());
        const leaks = hiddenOk ? [] : hiddenTokenLeaks(await obr.scene.items.getItems(), []).filter((leak) => leak.tokenId === token.id);
        await wait(hideMs);
        await writeVisible(token.id, true);
        restore.hiddenId = "";
        const shownAgain = await waitFor(async () => {
          const mine = own(await obr.scene.items.getItems());
          return mine.length && mine.every((item) => item.visible !== false) ? mine : null;
        }, { timeoutMs: 5000, wait, now });
        row("L16 · token nascosto: barre e aure solo al GM", hiddenOk && shownAgain ? "ok" : "ATTENZIONE",
          `${token.name}: ${widgets.length} tra barre, testo e aure${hiddenOk ? " nascosti ai giocatori" : `, visibili ai giocatori: ${leaks.map((leak) => leak.kind).join(", ")}`}`
          + `${shownAgain ? ", di nuovo visibili dopo" : "; dopo averlo mostrato non sono tornati visibili"}. Il tracker e la mappa del tavolo li controlla watchFluidity.`);
      }
    }
  } catch (error) {
    row("Verifica interrotta", "ATTENZIONE", String(error?.message || error));
  } finally {
    const put = async (label, action) => { try { await action(); } catch (error) { log(`[verifica] ${label} non ripristinato: ${error?.message || error}`); } };
    if (restore.hiddenId) await put("token nascosto", () => writeVisible(restore.hiddenId, true));
    // The test condition, if it is still there or came back (an Undo that reached its expiry entry).
    if (restore.condition) {
      const { id, instanceId } = restore.condition;
      await put("condizione di prova", async () => {
        if (!conditionsOf((await itemOf(id))?.metadata?.[META_KEY]).some((entry) => entry?.id === instanceId)) return;
        effects ||= await importEffectsMutations();
        effects.requireAppliedEffectsMutation(await effects.runEffectsMutation([{
          type: "condition:remove-instances", targetIds: [id], removals: [{ itemId: id, instanceId }],
        }], { kind: "condition", label: `Verifica: ${TEST_CONDITION}`, targetIds: [id], history: false }));
      });
    }
    if (restore.removedId) await put("iniziativa", () => writeMeta(restore.removedId, (meta) => { meta.inInitiative = true; }));
    if (restore.hp) await put("PF", () => writeMeta(restore.hp.id, (meta) => { meta.hp = restore.hp.hp; }));
    // The turn goes back to where it started, through the tracker's "previous" button.
    const startId = start.activeId;
    for (let step = 0; step < forwardTurns + 2; step += 1) {
      await wait(700);
      const state = await readState().catch(() => null);
      if (!state || (state.activeId === startId && state.round === start.round)) break;
      const answer = await client.tryRequest("index", "turn", { direction: -1 });
      if (!answer?.ok) { log("[verifica] turno non riportato indietro: fallo a mano."); break; }
    }
    const final = await readState().catch(() => null);
    if (final && (final.activeId !== startId || final.round !== start.round)) {
      log(`[verifica] il turno non è tornato a quello di partenza (round ${start.round}): riportalo a mano.`);
    }
  }
  console.table?.(rows);
  await save({ name: "verifica-bugfix", content: JSON.stringify({ label: "verifica-bugfix", at: new Date(now()).toISOString(), rows }, null, 2) });
  log("[verifica] fine. A mano: F5 sulla finestra del tavolo, il tracker deve tornare (L9); statblock su un goblin con omonimi feriti, poi cambio scena (L1). Sul tavolo leggi le anomalie di watchFluidity.");
  client.close?.();
  return rows;
}
