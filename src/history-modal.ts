import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import {
  COMBAT_LOG_CATEGORY_ORDER,
  buildCombatLogPresentation,
  filterCombatLogPresentation,
  formatCombatLogTimestamp,
  getCombatLogCategoryMeta,
  serializeCombatLogPresentationText,
} from "./combatLogPresentationCore.js";
import {
  addCombatLogNote,
  activateCombatLogSession,
  clearCombatLogSession,
  deleteCombatLogSession,
  exportCombatLogJSONFromStorage,
  getCombatLogExportData,
  getCombatLogStorageStats,
  importCombatLogJSON,
  peekActiveCombatLogData,
  isCombatLogEventSinkEnabled,
  listCombatLogSessions,
  mountCombatLogEventSink,
  previewCombatLogRetention,
  pruneCombatLogRetention,
  recordCombatTurn,
  startCombatLogSession,
  subscribeCombatLog,
} from "./combatLog.js";
import {
  getHistoryUndoReadiness,
  pruneNonUndoableHistoryEntries,
  undoHistoryThrough,
  waitForHistoryEntriesRemoved,
} from "./history.js";
import { HISTORY_UNDO_READINESS_STATUS } from "./historyUndoCleanupCore.js";
import {
  HISTORY_UNDO_OUTCOME,
  normalizeHistoryUndoResult,
} from "./historyUndoResultCore.js";
import {
  createCombatLogPageState,
  getCombatLogPageControlState,
  getCombatLogTimelineWindow,
  mergeCombatLogPageState,
  resetCombatLogPageState as resetCombatLogPageStateCore,
} from "./combatLogPaginationCore.js";
import { runtimeOptionsService } from "./options/optionsRuntime.js";
import { selectCombatLogEnabled } from "./options/optionsSelectors.js";
import { createSceneLifecycleAdapter } from "./sceneLifecycle.js";
import { subscribeSceneItemChanges } from "./sceneItemEvents.js";

const MODAL_ID = `${ID}/history-modal`;
const TRACKER_POPOVER_TOGGLE_CHANNEL = `${ID}/tracker-popover-toggle`;
const HISTORY_CHANGE_CHANNEL = `${ID}/history-change`;

let statusMessage = "";
let refreshQueued = false;
let logPanelOpen = true;
let undoPanelOpen = false;
let preferredPanel: "log" | "undo" | null = null;
let undoInProgress = false;
let undoCleanupInProgress = false;
let refreshAfterUndo = false;
let unsubscribeCombatLogOption: (() => void) | null = null;
let unsubscribeHistoryChange: (() => void) | null = null;
let unsubscribeUndoSceneItems: (() => void) | null = null;
let combatLogStorageAction = false;
let combatLogPageLoading = false;
let combatLogPageOperationToken = 0;
const COMBAT_LOG_TIMELINE_BATCH_SIZE = 250;
let combatLogTimelineVisibleLimit = COMBAT_LOG_TIMELINE_BATCH_SIZE;

type CombatLogPageRequest = {
  direction?: "backward" | "forward";
  beforeSequence?: number;
  afterSequence?: number;
  sessionId?: string;
};

type CombatLogRenderOptions = {
  loadAll?: boolean;
  pageRequest?: CombatLogPageRequest | null;
};

type PendingCombatLogRender = {
  message: string;
  dataOptions: CombatLogRenderOptions;
  waiters: Array<{
    resolve: () => void;
    reject: (error?: unknown) => void;
  }>;
};

let combatLogRenderInFlight: Promise<void> | null = null;
let combatLogRenderPending: PendingCombatLogRender | null = null;
const sceneLifecycle = createSceneLifecycleAdapter({ obr: OBR });
let unsubscribeSceneLifecycle: (() => void) | null = null;
const combatLogUiState = {
  query: "",
  category: "",
  participant: "",
  outcome: "",
  collapsedRounds: new Set<string>(),
  collapsedTurns: new Set<string>(),
  expandedEvents: new Set<string>(),
  timelineScrollTop: 0,
  focusControl: "",
  selectionStart: null as number | null,
  selectionEnd: null as number | null,
};

const combatLogPageState = createCombatLogPageState();

function resetCombatLogPageState(sessionId = "") {
  resetCombatLogPageStateCore(combatLogPageState, sessionId);
  combatLogTimelineVisibleLimit = COMBAT_LOG_TIMELINE_BATCH_SIZE;
}

function mergeCombatLogPage(session: any, page: any, { loadAll = false, requestedDirection = "backward" } = {}) {
  const sessionId = String(session?.id || "");
  if (combatLogPageState.sessionId !== sessionId) resetCombatLogPageState(sessionId);
  return mergeCombatLogPageState(combatLogPageState, session, page, { loadAll, requestedDirection });
}

function sceneOperationId(prefix = "history-modal") {
  return `${prefix}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`;
}

function closeHistoryPopover() {
  void OBR.broadcast.sendMessage(TRACKER_POPOVER_TOGGLE_CHANNEL, {
    type: "closed",
    id: MODAL_ID,
  }, { destination: "LOCAL" }).catch(() => {});
  void OBR.popover.close(MODAL_ID);
}

function captureAccordionState(app: HTMLElement) {
  const logPanel = app.querySelector('details[data-panel="log"]');
  const undoPanel = app.querySelector('details[data-panel="undo"]');
  if (logPanel instanceof HTMLDetailsElement) logPanelOpen = logPanel.open;
  if (undoPanel instanceof HTMLDetailsElement) undoPanelOpen = undoPanel.open;
  if (preferredPanel === "undo") {
    logPanelOpen = false;
    undoPanelOpen = true;
    preferredPanel = null;
  }
  captureCombatLogUiState(app);
}

function captureCombatLogUiState(app: HTMLElement) {
  const search = app.querySelector<HTMLInputElement>('[data-combat-log-control="search"]');
  const category = app.querySelector<HTMLSelectElement>('[data-combat-log-control="category"]');
  const participant = app.querySelector<HTMLSelectElement>('[data-combat-log-control="participant"]');
  const outcome = app.querySelector<HTMLSelectElement>('[data-combat-log-control="outcome"]');
  if (search) combatLogUiState.query = search.value;
  if (category) combatLogUiState.category = category.value;
  if (participant) combatLogUiState.participant = participant.value;
  if (outcome) combatLogUiState.outcome = outcome.value;
  combatLogUiState.collapsedRounds = new Set(
    [...app.querySelectorAll<HTMLDetailsElement>("details[data-round-key]")]
      .filter((details) => !details.open)
      .map((details) => details.dataset.roundKey || "")
      .filter(Boolean),
  );
  combatLogUiState.collapsedTurns = new Set(
    [...app.querySelectorAll<HTMLDetailsElement>("details[data-turn-key]")]
      .filter((details) => !details.open)
      .map((details) => details.dataset.turnKey || "")
      .filter(Boolean),
  );
  combatLogUiState.expandedEvents = new Set(
    [...app.querySelectorAll<HTMLDetailsElement>("details[data-event-id]")]
      .filter((details) => details.open)
      .map((details) => details.dataset.eventId || "")
      .filter(Boolean),
  );
  const timeline = app.querySelector<HTMLElement>("[data-combat-log-timeline]");
  if (timeline) combatLogUiState.timelineScrollTop = timeline.scrollTop;
  const active = document.activeElement;
  rememberCombatLogFocus(active);
}

function rememberCombatLogFocus(active: Element | null = document.activeElement) {
  if (!(active instanceof HTMLElement) || !active.dataset.combatLogControl) return;
  combatLogUiState.focusControl = active.dataset.combatLogControl;
  if (active instanceof HTMLInputElement) {
    combatLogUiState.selectionStart = active.selectionStart;
    combatLogUiState.selectionEnd = active.selectionEnd;
  } else {
    combatLogUiState.selectionStart = null;
    combatLogUiState.selectionEnd = null;
  }
}

function restoreCombatLogUiState(app: HTMLElement) {
  const search = app.querySelector<HTMLInputElement>('[data-combat-log-control="search"]');
  const category = app.querySelector<HTMLSelectElement>('[data-combat-log-control="category"]');
  const participant = app.querySelector<HTMLSelectElement>('[data-combat-log-control="participant"]');
  const outcome = app.querySelector<HTMLSelectElement>('[data-combat-log-control="outcome"]');
  if (search) search.value = combatLogUiState.query;
  if (category) category.value = combatLogUiState.category;
  if (participant) participant.value = combatLogUiState.participant;
  if (outcome) outcome.value = combatLogUiState.outcome;
  for (const details of app.querySelectorAll<HTMLDetailsElement>("details[data-round-key]")) {
    details.open = !combatLogUiState.collapsedRounds.has(details.dataset.roundKey || "");
  }
  for (const details of app.querySelectorAll<HTMLDetailsElement>("details[data-turn-key]")) {
    details.open = !combatLogUiState.collapsedTurns.has(details.dataset.turnKey || "");
  }
  for (const details of app.querySelectorAll<HTMLDetailsElement>("details[data-event-id]")) {
    details.open = combatLogUiState.expandedEvents.has(details.dataset.eventId || "");
  }
  const timeline = app.querySelector<HTMLElement>("[data-combat-log-timeline]");
  if (timeline) timeline.scrollTop = combatLogUiState.timelineScrollTop;
  if (!combatLogUiState.focusControl) return;
  const focus = app.querySelector<HTMLElement>(`[data-combat-log-control="${combatLogUiState.focusControl}"]`);
  if (!focus || !(focus instanceof HTMLInputElement || focus instanceof HTMLSelectElement || focus instanceof HTMLButtonElement)) return;
  focus.focus();
  if (focus instanceof HTMLInputElement && combatLogUiState.selectionStart !== null) {
    focus.setSelectionRange(combatLogUiState.selectionStart, combatLogUiState.selectionEnd ?? combatLogUiState.selectionStart);
  }
}

function syncCombatLogPageControls() {
  const app = document.getElementById("app");
  if (!(app instanceof HTMLElement) || !sceneLifecycle.isReady()) return;
  const panel = app.querySelector<HTMLElement>("[data-combat-log-session-id]");
  if (!panel || panel.dataset.combatLogSessionId !== combatLogPageState.sessionId) return;
  const loadOlder = app.querySelector<HTMLButtonElement>('[data-combat-log-control="load-older"]');
  const loadAll = app.querySelector<HTMLButtonElement>('[data-combat-log-control="load-all"]');
  if (!loadOlder || !loadAll) return;
  const controls = getCombatLogPageControlState(combatLogPageState, {
    loading: combatLogPageLoading,
    storageAction: combatLogStorageAction,
  });
  loadOlder.disabled = controls.loadOlderDisabled;
  loadAll.disabled = controls.loadAllDisabled;
  const pageHint = app.querySelector<HTMLElement>("[data-combat-log-page-hint]");
  if (pageHint) {
    pageHint.textContent = combatLogPageState.totalCount > controls.loadedCount
      ? "Filtri sulla pagina caricata"
      : "Registro completo caricato";
  }
}

function mergeCombatLogRenderOptions(
  current: CombatLogRenderOptions,
  next: CombatLogRenderOptions,
) {
  return {
    loadAll: current.loadAll === true || next.loadAll === true,
    // A queued page request belongs to the user action and must survive a
    // coalesced refresh that arrives before the queued render starts.
    pageRequest: next.pageRequest === null
      ? undefined
      : next.pageRequest || current.pageRequest,
  } satisfies CombatLogRenderOptions;
}

function startScheduledCombatLogRender(request: PendingCombatLogRender) {
  const task = Promise.resolve().then(() => render(request.message, request.dataOptions));
  combatLogRenderInFlight = task;
  void task.then(
    () => {
      if (combatLogRenderInFlight !== task) return;
      combatLogRenderInFlight = null;
      for (const waiter of request.waiters) waiter.resolve();
      const pending = combatLogRenderPending;
      combatLogRenderPending = null;
      if (pending) queueMicrotask(() => startScheduledCombatLogRender(pending));
    },
    (error) => {
      if (combatLogRenderInFlight !== task) return;
      combatLogRenderInFlight = null;
      for (const waiter of request.waiters) waiter.reject(error);
      const pending = combatLogRenderPending;
      combatLogRenderPending = null;
      if (pending) queueMicrotask(() => startScheduledCombatLogRender(pending));
    },
  );
}

function scheduleRender(
  message = statusMessage,
  dataOptions: CombatLogRenderOptions = {},
) {
  return new Promise<void>((resolve, reject) => {
    if (combatLogRenderInFlight) {
      if (combatLogRenderPending) {
        combatLogRenderPending.message = message;
        combatLogRenderPending.dataOptions = mergeCombatLogRenderOptions(
          combatLogRenderPending.dataOptions,
          dataOptions,
        );
        combatLogRenderPending.waiters.push({ resolve, reject });
      } else {
        combatLogRenderPending = {
          message,
          dataOptions,
          waiters: [{ resolve, reject }],
        };
      }
      return;
    }
    startScheduledCombatLogRender({
      message,
      dataOptions,
      waiters: [{ resolve, reject }],
    });
  });
}

function button(label: string, tone = "default", iconPath = "", iconOnly = false) {
  const control = document.createElement("button");
  control.type = "button";
  Object.assign(control.style, {
    minHeight: "32px",
    padding: "0 10px",
    border: tone === "primary"
      ? "1px solid rgba(96,165,250,.72)"
      : tone === "danger"
        ? "1px solid rgba(248,113,113,.72)"
        : "1px solid rgba(148,163,184,.24)",
    borderRadius: "8px",
    background: tone === "primary"
      ? "#2563eb"
      : tone === "danger"
        ? "rgba(153,27,27,.42)"
        : "#0f172a",
    color: "#fff",
    font: "inherit",
    fontSize: "var(--obrt-type-body, 12px)",
    fontWeight: "var(--obrt-weight-semibold, 600)",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "6px",
  });
  if (iconPath) {
    const icon = document.createElement("img");
    icon.src = `${import.meta.env.BASE_URL || "/"}${iconPath}`;
    icon.alt = "";
    Object.assign(icon.style, { width: "14px", height: "14px", flex: "0 0 auto", filter: "brightness(0) invert(1)", pointerEvents: "none" });
    control.appendChild(icon);
  }
  const text = document.createElement("span");
  text.dataset.buttonLabel = "1";
  text.textContent = label;
  if (iconOnly) {
    text.hidden = true;
    control.setAttribute("aria-label", label);
    Object.assign(control.style, { width: "34px", minWidth: "34px", padding: "0" });
  }
  control.appendChild(text);
  return control;
}

function setButtonLabel(control: HTMLButtonElement, label: string) {
  const text = control.querySelector<HTMLElement>("[data-button-label]");
  if (text) text.textContent = label;
  else control.textContent = label;
}

function toolbarMenu(label: string, iconPath: string, controls: HTMLButtonElement[]) {
  const wrap = document.createElement("div");
  Object.assign(wrap.style, { position: "relative", flex: "0 0 auto" });
  const trigger = button(label, "default", iconPath, true);
  trigger.title = label;
  trigger.setAttribute("aria-haspopup", "menu");
  trigger.setAttribute("aria-expanded", "false");
  const menu = document.createElement("div");
  menu.setAttribute("role", "menu");
  Object.assign(menu.style, {
    display: "none",
    position: "absolute",
    top: "calc(100% + 5px)",
    right: "0",
    zIndex: "20",
    minWidth: "190px",
    padding: "5px",
    border: "1px solid rgba(148,163,184,.28)",
    borderRadius: "9px",
    background: "rgba(15,23,42,.98)",
    boxShadow: "0 12px 30px rgba(0,0,0,.38)",
  });
  const setOpen = (open: boolean) => {
    menu.style.display = open ? "grid" : "none";
    menu.style.gap = open ? "4px" : "";
    trigger.setAttribute("aria-expanded", String(open));
  };
  trigger.addEventListener("click", () => setOpen(menu.style.display === "none"));
  for (const control of controls) {
    control.setAttribute("role", "menuitem");
    Object.assign(control.style, { width: "100%", justifyContent: "flex-start" });
    control.addEventListener("click", () => setOpen(false));
    menu.appendChild(control);
  }
  wrap.addEventListener("focusout", () => {
    window.setTimeout(() => {
      if (!wrap.contains(document.activeElement)) setOpen(false);
    }, 0);
  });
  wrap.append(trigger, menu);
  return wrap;
}

function download(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function safeFileName(value: string) {
  return String(value || "combattimento")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 80) || "combattimento";
}

function categoryBadge(event: any) {
  const badge = document.createElement("span");
  const meta = getCombatLogCategoryMeta(event?.category);
  badge.textContent = event?.categoryLabel || meta.label;
  badge.title = `Categoria ${meta.label} · kind ${String(event?.kind || "change")}`;
  Object.assign(badge.style, {
    display: "inline-flex",
    alignItems: "center",
    flex: "0 0 auto",
    padding: "2px 6px",
    borderRadius: "999px",
    color: meta.tone,
    background: "#0f172a",
    fontSize: "var(--obrt-type-micro, 9px)",
    fontWeight: "var(--obrt-weight-bold, 700)",
    letterSpacing: ".04em",
    textTransform: "uppercase",
  });
  return badge;
}

function eventTechnicalText(event: any) {
  const technical = event?.technical || {};
  const values = [
    `kind: ${technical.kind || event?.kind || "change"}`,
    `v${technical.version || 1}`,
    `sequence: ${event?.sequence ?? "—"}`,
  ];
  if (technical.historyEntryId) values.push(`History: ${technical.historyEntryId}`);
  if (technical.commandId) values.push(`command: ${technical.commandId}`);
  if (technical.correlationId) values.push(`correlation: ${technical.correlationId}`);
  if (technical.causality?.instanceId) values.push(`spell instance: ${technical.causality.instanceId}`);
  if (technical.causality?.actionId) values.push(`spell action: ${technical.causality.actionId}`);
  if (technical.causality?.reminderActivationId) {
    values.push(`activation: ${technical.causality.reminderActivationId}`);
  }
  return values.join(" · ");
}

function appendDetailSections(parent: HTMLElement, event: any) {
  for (const section of Array.isArray(event?.details) ? event.details : []) {
    const wrapper = document.createElement("section");
    Object.assign(wrapper.style, { display: "grid", gap: "2px", marginTop: "6px" });
    const heading = document.createElement("strong");
    heading.textContent = section.label;
    Object.assign(heading.style, { color: "rgba(255,255,255,.75)", fontSize: "var(--obrt-type-caption, 10px)" });
    wrapper.appendChild(heading);
    for (const line of Array.isArray(section.lines) ? section.lines : []) {
      const detailLine = document.createElement("div");
      detailLine.textContent = String(line);
      Object.assign(detailLine.style, {
        color: "rgba(255,255,255,.74)",
        fontSize: "var(--obrt-type-secondary, 11px)",
        lineHeight: "1.35",
        overflowWrap: "anywhere",
      });
      wrapper.appendChild(detailLine);
    }
    parent.appendChild(wrapper);
  }
  const technical = document.createElement("div");
  technical.textContent = eventTechnicalText(event);
  technical.title = "Dettagli tecnici del record, non attribuzione causale";
  Object.assign(technical.style, {
    marginTop: "7px",
    color: "rgba(255,255,255,.4)",
    fontSize: "var(--obrt-type-micro, 9px)",
    lineHeight: "1.3",
    overflowWrap: "anywhere",
  });
  parent.appendChild(technical);
}

function makeEventRow(event: any) {
  const meta = getCombatLogCategoryMeta(event?.category);
  const time = formatCombatLogTimestamp(event?.at, { timeOnly: true });
  const top = document.createElement("div");
  Object.assign(top.style, { display: "flex", alignItems: "center", gap: "6px", minWidth: "0" });
  const label = document.createElement("strong");
  label.textContent = String(event?.title || "Evento");
  Object.assign(label.style, { minWidth: "0", overflowWrap: "anywhere", fontSize: "var(--obrt-type-body, 12px)", fontWeight: "var(--obrt-weight-semibold, 600)" });
  const timestamp = document.createElement("span");
  timestamp.textContent = time;
  timestamp.title = formatCombatLogTimestamp(event?.at);
  Object.assign(timestamp.style, { marginLeft: "auto", flex: "0 0 auto", color: "rgba(255,255,255,.5)", fontSize: "var(--obrt-type-caption, 10px)", fontWeight: "var(--obrt-weight-regular, 400)" });
  top.append(categoryBadge(event), label, timestamp);

  if (event?.boundary) {
    const boundary = document.createElement("div");
    boundary.dataset.eventId = String(event?.id || "");
    boundary.setAttribute("role", "note");
    Object.assign(boundary.style, {
      display: "grid",
      gap: "3px",
      padding: "6px 8px",
      borderLeft: `3px solid ${meta.tone}`,
      borderRadius: "7px",
      background: "rgba(15,23,42,.46)",
    });
    boundary.appendChild(top);
    const boundarySummary = document.createElement("div");
    boundarySummary.textContent = String(event?.summary || "");
    Object.assign(boundarySummary.style, { color: "rgba(255,255,255,.58)", fontSize: "var(--obrt-type-caption, 10px)", overflowWrap: "anywhere" });
    if (event?.summary) boundary.appendChild(boundarySummary);
    return boundary;
  }

  const details = document.createElement("details");
  details.dataset.eventId = String(event?.id || "");
  details.open = combatLogUiState.expandedEvents.has(String(event?.id || ""));
  Object.assign(details.style, {
    display: "block",
    borderLeft: `3px solid ${meta.tone}`,
    borderRadius: "7px",
    background: "rgba(15,23,42,.72)",
    overflow: "visible",
  });
  details.addEventListener("toggle", () => {
    const id = String(event?.id || "");
    if (details.open) combatLogUiState.expandedEvents.add(id);
    else combatLogUiState.expandedEvents.delete(id);
    details.querySelector("summary")?.setAttribute("aria-expanded", String(details.open));
  });
  const summary = document.createElement("summary");
  summary.setAttribute("aria-label", `${event?.title || "Evento"} · ${event?.categoryLabel || meta.label} · ${event?.summary || ""}`);
  summary.setAttribute("aria-expanded", String(details.open));
  Object.assign(summary.style, { display: "grid", gap: "3px", padding: "7px 8px", cursor: "pointer", listStylePosition: "inside" });
  summary.appendChild(top);
  const essential = document.createElement("div");
  essential.textContent = String(event?.summary || "");
  Object.assign(essential.style, { color: "rgba(255,255,255,.7)", fontSize: "var(--obrt-type-secondary, 11px)", lineHeight: "1.35", overflowWrap: "anywhere" });
  if (event?.summary) summary.appendChild(essential);
  const body = document.createElement("div");
  Object.assign(body.style, { padding: "0 8px 8px 23px", overflowWrap: "anywhere" });
  appendDetailSections(body, event);
  details.append(summary, body);
  return details;
}

function undoReadinessLabel(row: any) {
  if (row?.status === HISTORY_UNDO_READINESS_STATUS.UNDOABLE) return "Annullabile";
  if (row?.status === HISTORY_UNDO_READINESS_STATUS.CONFLICT) return "Bloccata: stato cambiato";
  if (row?.status === HISTORY_UNDO_READINESS_STATUS.INVALID) return "Entry incompleta";
  if (row?.status === HISTORY_UNDO_READINESS_STATUS.NOOP) return "Nessuna modifica reversibile";
  return "Verifica non disponibile";
}

function undoReadinessTitle(row: any) {
  const conflicts = Array.isArray(row?.conflicts) ? row.conflicts : [];
  if (conflicts.length) {
    return conflicts.slice(0, 3).map((conflict: any) => [
      conflict?.itemId || conflict?.id,
      conflict?.field,
      conflict?.reason,
    ].filter(Boolean).join(" · ")).join(" | ");
  }
  return String(row?.reason || undoReadinessLabel(row));
}

function makeUndoPanel(undoState: any, onDone: (message: string) => Promise<void>) {
  const entries = Array.isArray(undoState?.entries) ? undoState.entries : [];
  const newest = Array.isArray(undoState?.rows) ? undoState.rows : [];
  const undoableCount = newest.filter((row: any) => row?.undoable === true).length;
  const details = document.createElement("details");
  details.dataset.panel = "undo";
  details.open = undoPanelOpen;
  Object.assign(details.style, {
    flex: "0 0 auto",
    border: "1px solid rgba(148,163,184,.18)",
    borderRadius: "11px",
    background: "rgba(15,23,42,.58)",
  });
  const summary = document.createElement("summary");
  summary.textContent = `Cronologia e Undo (${undoableCount} annullabili / ${entries.length})`;
  Object.assign(summary.style, { padding: "9px 10px", cursor: "pointer", fontSize: "var(--obrt-type-secondary, 11px)", fontWeight: "var(--obrt-weight-bold, 700)" });
  details.appendChild(summary);
  const body = document.createElement("div");
  Object.assign(body.style, { display: "grid", gap: "5px", padding: "0 9px 9px" });
  if (undoState?.status !== "ready") {
    const unavailable = document.createElement("div");
    unavailable.textContent = "Impossibile verificare con precisione le azioni annullabili. Attendi il completamento degli aggiornamenti della scena.";
    Object.assign(unavailable.style, { padding: "8px", color: "#fbbf24", fontSize: "11px", lineHeight: "1.4" });
    body.appendChild(unavailable);
  } else if (!newest.length) {
    const empty = document.createElement("div");
    empty.textContent = "Nessuna operazione reversibile.";
    Object.assign(empty.style, { padding: "8px", color: "rgba(255,255,255,.55)", fontSize: "11px" });
    body.appendChild(empty);
  } else {
    let selectedDepth = newest[0]?.undoable === true ? 1 : 0;
    const rows: Array<{ checkbox: HTMLInputElement; row: HTMLLabelElement }> = [];
    const undo = button("Undo ultima", "primary", "history.svg");
    const cleanup = button("Pulisci entry incomplete");
    cleanup.title = "Rimuove solo le entry incomplete; i conflitti restano visibili nella cronologia";
    const controls = document.createElement("div");
    Object.assign(controls.style, { display: "flex", flexWrap: "wrap", gap: "5px" });
    const refresh = () => {
      rows.forEach(({ checkbox, row }, index) => {
        const readiness = newest[index];
        const selected = selectedDepth > 0 && index < selectedDepth;
        checkbox.checked = selected;
        checkbox.disabled = readiness?.undoable !== true;
        row.style.background = selected ? "rgba(30,64,175,.24)" : "rgba(15,23,42,.72)";
        row.style.cursor = readiness?.undoable === true ? "pointer" : "not-allowed";
        row.style.opacity = readiness?.undoable === true ? "1" : ".68";
      });
      setButtonLabel(undo, selectedDepth === 1 ? "Undo ultima" : `Undo ${selectedDepth} azioni`);
      // The handlers keep the controls guarded while an async operation is
      // running. Do not derive the disabled state from those flags here:
      // onDone() can render a fresh panel before the finally block clears it.
      undo.disabled = selectedDepth < 1 || !sceneLifecycle.isReady();
      cleanup.disabled = !sceneLifecycle.isReady();
    };
    controls.append(undo, cleanup);
    body.appendChild(controls);
    newest.forEach((readiness: any, index: number) => {
      const entry = readiness?.entry || {};
      const row = document.createElement("label");
      row.title = undoReadinessTitle(readiness);
      Object.assign(row.style, { display: "grid", gridTemplateColumns: "auto minmax(0,1fr) auto", alignItems: "center", gap: "7px", padding: "6px 8px", borderRadius: "7px" });
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.style.accentColor = "#2563eb";
      const text = document.createElement("span");
      text.textContent = String(entry?.label || "Modifica");
      Object.assign(text.style, { fontSize: "var(--obrt-type-secondary, 11px)", fontWeight: "var(--obrt-weight-medium, 500)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" });
      const state = document.createElement("span");
      state.textContent = undoReadinessLabel(readiness);
      Object.assign(state.style, {
        fontSize: "9px",
        color: readiness?.undoable === true
          ? "#86efac"
          : readiness?.status === HISTORY_UNDO_READINESS_STATUS.CONFLICT
            ? "#fca5a5"
            : "#fbbf24",
        whiteSpace: "nowrap",
      });
      checkbox.addEventListener("change", () => {
        if (readiness?.undoable !== true) return;
        selectedDepth = checkbox.checked ? index + 1 : index;
        refresh();
      });
      row.append(checkbox, text, state);
      rows.push({ checkbox, row });
      body.appendChild(row);
    });
    undo.addEventListener("click", async () => {
      if (undoInProgress || selectedDepth < 1 || !sceneLifecycle.isReady()) return;
      const operation = sceneLifecycle.capture({ operationId: sceneOperationId("undo") });
      if (!sceneLifecycle.isCurrent(operation)) return;
      preferredPanel = "undo";
      undoInProgress = true;
      refresh();
      undo.disabled = true;
      cleanup.disabled = true;
      try {
        const selectedRow = newest[selectedDepth - 1];
        const selectedIds = newest.slice(0, selectedDepth).map((row: any) => row?.id);
        // Revalidate the exact suffix against the latest scene snapshot.
        // A conflict disables Undo but never deletes or skips an audit entry.
        const currentState = await getHistoryUndoReadiness({
          sceneEpoch: operation.sceneEpoch,
        });
        if (!sceneLifecycle.isCurrent(operation)) return;
        const currentRow = currentState?.rows?.[selectedDepth - 1];
        const currentIds = currentState?.rows
          ?.slice(0, selectedDepth)
          .map((row: any) => row?.id) || [];
        const selectionStable = currentState?.status === "ready"
          && currentState?.chainToken === undoState?.chainToken
          && currentRow?.id === selectedRow?.id
          && currentRow?.undoable === true
          && JSON.stringify(currentIds) === JSON.stringify(selectedIds);
        const target = selectionStable ? currentRow?.entry : null;
        if (!target?.id) {
          await onDone("La History è cambiata: aggiorna il pannello prima di riprovare.");
          return;
        }
        const undone = await undoHistoryThrough(target.id, {
          sceneEpoch: operation.sceneEpoch,
        });
        if (!sceneLifecycle.isCurrent(operation)) return;
        const outcome = normalizeHistoryUndoResult(undone);
        if (outcome.outcome === HISTORY_UNDO_OUTCOME.COMMITTED && outcome.historyRemovalPending) {
          await onDone("Undo applicato. La rimozione delle entry History verrà ritentata.");
        } else if (outcome.outcome === HISTORY_UNDO_OUTCOME.COMMITTED) {
          await waitForHistoryEntriesRemoved(
            outcome.entries.map((entry) => entry?.id).filter(Boolean),
            { sceneEpoch: operation.sceneEpoch },
          );
          await onDone(outcome.entries.length === 1
            ? `Annullato: ${outcome.entries[0].label}`
            : outcome.entries.length > 1
              ? `Annullate ${outcome.entries.length} azioni.`
              : "Undo applicato.");
        } else if (outcome.outcome === HISTORY_UNDO_OUTCOME.CONFLICT) {
          await onDone("Undo non applicato: lo stato della scena è cambiato; nessuna modifica è stata scritta.");
        } else if (outcome.outcome === HISTORY_UNDO_OUTCOME.RECOVERY_REQUIRED) {
          await onDone("Undo sospeso: è richiesta una verifica o una compensazione manuale; History conservata.");
        } else if (outcome.outcome === HISTORY_UNDO_OUTCOME.REJECTED) {
          await onDone("Undo rifiutato o non più valido: nessuna modifica è stata scritta; History conservata.");
        } else if (outcome.outcome === HISTORY_UNDO_OUTCOME.NOOP) {
          await onDone("Nessuna azione annullata: la History è invariata.");
        } else if (outcome.outcome === HISTORY_UNDO_OUTCOME.FAILED) {
          await onDone("Undo non applicato: la scena è rimasta nello stato precedente.");
        } else {
          await onDone("Undo non applicato: nessuna mutazione committata; History conservata.");
        }
      } catch (error: any) {
        if (!sceneLifecycle.isCurrent(operation)) return;
        await onDone(`Undo fallito: ${error?.message || error}`);
      } finally {
        preferredPanel = null;
        undoInProgress = false;
        if (refreshAfterUndo) {
          refreshAfterUndo = false;
          queueRefresh();
        }
      }
    });
    cleanup.addEventListener("click", async () => {
      if (undoInProgress || undoCleanupInProgress || !sceneLifecycle.isReady()) return;
      const operation = sceneLifecycle.capture({ operationId: sceneOperationId("undo-cleanup") });
      if (!sceneLifecycle.isCurrent(operation)) return;
      preferredPanel = "undo";
      undoCleanupInProgress = true;
      refresh();
      undo.disabled = true;
      cleanup.disabled = true;
      try {
        const result = await pruneNonUndoableHistoryEntries({
          sceneEpoch: operation.sceneEpoch,
          ownerAttempts: 3,
          ownerRetryDelayMs: 150,
        });
        if (!sceneLifecycle.isCurrent(operation)) return;
        if (result?.committed && result.removedIds?.length) {
          const removed = await waitForHistoryEntriesRemoved(
            result.removedIds,
            { sceneEpoch: operation.sceneEpoch },
          );
          if (!sceneLifecycle.isCurrent(operation)) return;
          await onDone(removed
            ? `Pulizia completata: rimosse ${result.removedIds.length} entry incomplete.`
            : "Pulizia inviata: la History non si è ancora aggiornata; riprova tra poco.");
        } else if (result?.pendingIds?.length) {
          await onDone("Pulizia non completata: History owner non disponibile; riprova tra poco.");
        } else {
          await onDone("Nessuna entry incompleta da rimuovere.");
        }
      } catch (error: any) {
        if (!sceneLifecycle.isCurrent(operation)) return;
        await onDone(`Pulizia Undo fallita: ${error?.message || error}`);
      } finally {
        preferredPanel = null;
        undoCleanupInProgress = false;
        if (refreshAfterUndo) {
          refreshAfterUndo = false;
          queueRefresh();
        }
      }
    });
    refresh();
  }
  details.appendChild(body);
  return details;
}

async function render(
  message = statusMessage,
  dataOptions: CombatLogRenderOptions = {},
) {
  const app = document.getElementById("app");
  if (!app) return;
  const operation = sceneLifecycle.capture({ operationId: sceneOperationId("render") });
  if (!sceneLifecycle.isCurrent(operation)) {
    app.textContent = "La scena non è disponibile. Riapri il Registro quando una scena è pronta.";
    return;
  }
  captureAccordionState(app);
  const role = await OBR.player.getRole();
  if (!sceneLifecycle.isCurrent(operation)) return;
  if (role !== "GM") {
    app.textContent = "Il Registro combattimento è disponibile solo per il GM.";
    return;
  }
  const pageRequest = dataOptions.pageRequest || null;
  const storagePageRequest = pageRequest
    ? {
      direction: pageRequest.direction,
      beforeSequence: pageRequest.beforeSequence,
      afterSequence: pageRequest.afterSequence,
    }
    : {};
  const activeData = await peekActiveCombatLogData({
    sceneEpoch: operation.epoch,
    loadAll: dataOptions.loadAll === true,
    pageSize: dataOptions.loadAll === true ? undefined : 50,
    ...storagePageRequest,
  });
  const { session } = activeData;
  if (pageRequest?.sessionId && String(session?.id || "") !== pageRequest.sessionId) return;
  const events = mergeCombatLogPage(session, dataOptions.loadAll === true
    ? { events: activeData.events, totalCount: activeData.events.length }
    : activeData.page, {
    loadAll: dataOptions.loadAll === true,
    requestedDirection: pageRequest?.direction || "backward",
  });
  const [undoState, sessions] = await Promise.all([
    getHistoryUndoReadiness({ sceneEpoch: operation.sceneEpoch }),
    listCombatLogSessions({ sceneEpoch: operation.epoch, includeStats: true }),
  ]);
  if (!sceneLifecycle.isCurrent(operation)) return;
  const presentation = buildCombatLogPresentation(session, events);
  const sessionSummary = presentation.sessionSummary;
  const combatLogEnabled = isCombatLogEventSinkEnabled();
  statusMessage = message;

  const panel = document.createElement("main");
  panel.dataset.combatLogSessionId = String(session?.id || "");
  Object.assign(panel.style, {
    width: "100%",
    height: "100vh",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    gap: "9px",
    padding: "12px",
    overflowY: "auto",
    background: "transparent",
    color: "#fff",
    fontFamily: 'var(--obrt-font-ui, "Helvetica Neue", Helvetica, Arial, sans-serif)',
    fontSize: "var(--obrt-type-body, 12px)",
  });

  const header = document.createElement("header");
  Object.assign(header.style, { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "10px", paddingRight: "38px", flexWrap: "wrap" });
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "X";
  close.title = "Chiudi";
  close.setAttribute("aria-label", "Chiudi");
  Object.assign(close.style, {
    position: "fixed",
    right: "12px",
    top: "9px",
    width: "30px",
    height: "30px",
    padding: "0",
    border: "1px solid transparent",
    borderRadius: "9px",
    background: "transparent",
    color: "inherit",
    font: "inherit",
    fontSize: "15px",
    cursor: "pointer",
    zIndex: "30",
  });
  close.addEventListener("click", closeHistoryPopover);
  const heading = document.createElement("div");
  Object.assign(heading.style, { minWidth: "180px", flex: "1 1 220px" });
  const title = document.createElement("h1");
  title.textContent = session?.name || "Nessun registro attivo";
  Object.assign(title.style, { margin: "0", fontSize: "var(--obrt-type-panel-title, 16px)", fontWeight: "var(--obrt-weight-bold, 700)", lineHeight: "1.1", letterSpacing: "-.01em" });
  const subtitle = document.createElement("div");
  subtitle.textContent = session
    ? `${combatLogPageState.totalCount || sessionSummary.totalEvents} eventi · iniziato ${formatCombatLogTimestamp(sessionSummary.startedAt)}`
    : "Il primo evento registrabile creerà una sessione.";
  Object.assign(subtitle.style, { marginTop: "3px", color: "rgba(255,255,255,.58)", fontSize: "var(--obrt-type-caption, 10px)", fontWeight: "var(--obrt-weight-regular, 400)" });
  const localStorageBadge = document.createElement("span");
  localStorageBadge.textContent = sessionSummary.localStorageLabel;
  localStorageBadge.title = "Il Combat Log è salvato nel browser locale del GM e non viene sincronizzato tra browser o scene.";
  Object.assign(localStorageBadge.style, {
    display: "inline-flex",
    width: "fit-content",
    marginTop: "6px",
    padding: "3px 7px",
    border: "1px solid rgba(148,163,184,.28)",
    borderRadius: "999px",
    color: "rgba(255,255,255,.62)",
    background: "rgba(15,23,42,.62)",
    fontSize: "var(--obrt-type-micro, 9px)",
    lineHeight: "1.2",
  });
  const sessionPicker = document.createElement("select");
  sessionPicker.title = "Apri o riprendi un registro archiviato";
  Object.assign(sessionPicker.style, {
    maxWidth: "220px",
    minHeight: "32px",
    marginTop: "5px",
    padding: "6px 8px",
    border: "1px solid rgba(148,163,184,.28)",
    borderRadius: "10px",
    background: "#0f172a",
    color: "rgba(255,255,255,.8)",
    font: "inherit",
    fontSize: "10px",
  });
  for (const candidate of sessions) {
    const option = document.createElement("option");
    option.value = candidate.id;
    option.textContent = candidate.name;
    option.selected = candidate.id === session?.id;
    Object.assign(option.style, { background: "#0f172a", color: "#fff" });
    sessionPicker.appendChild(option);
  }
  if (!sessions.length) {
    const option = document.createElement("option");
    option.textContent = "Nessun registro archiviato";
    option.disabled = true;
    option.selected = true;
    sessionPicker.appendChild(option);
  }
  sessionPicker.disabled = !session?.id || !sceneLifecycle.isReady();
  sessionPicker.addEventListener("change", async () => {
    if (!sceneLifecycle.isReady()) return;
    const operation = sceneLifecycle.capture({ operationId: sceneOperationId("session-select") });
    if (!sceneLifecycle.isCurrent(operation)) return;
    try {
      await activateCombatLogSession(sessionPicker.value, { sceneEpoch: operation.epoch });
      if (!sceneLifecycle.isCurrent(operation)) return;
      await scheduleRender("Registro aperto.", { pageRequest: null });
    } catch (error: any) {
      await scheduleRender(`Apertura fallita: ${error?.message || error}`, { pageRequest: null });
    }
  });
  heading.append(title, subtitle, localStorageBadge, sessionPicker);
  const headerActions = document.createElement("div");
  Object.assign(headerActions.style, { display: "flex", alignItems: "center", justifyContent: "flex-end", flex: "0 0 auto", gap: "5px" });
  const exportText = button("Esporta TXT", "default", "log-export.svg");
  const exportJson = button("Esporta JSON", "default", "log-export.svg");
  const importJson = button("Importa JSON");
  const storageStats = button("Statistiche storage");
  const retention = button("Conservazione…");
  const newSession = button("Nuovo registro", "default", "log-new.svg", true);
  const clearLog = button("Svuota eventi", "default", "log-clear.svg");
  const deleteLog = button("Elimina registro", "danger", "log-delete.svg");
  const importFile = document.createElement("input");
  importFile.type = "file";
  importFile.accept = ".json,application/json";
  importFile.hidden = true;
  exportText.title = "Esporta il registro in formato testo";
  exportJson.title = "Esporta il registro in formato JSON";
  newSession.title = "Crea un nuovo registro e archivia quello corrente";
  if (!combatLogEnabled || !sceneLifecycle.isReady()) {
    newSession.disabled = true;
    newSession.title = "Riattiva il Combat Log dalle Opzioni per creare un nuovo registro";
  }
  clearLog.title = "Rimuove gli eventi ma mantiene il registro nella lista";
  deleteLog.title = "Elimina definitivamente il registro selezionato";
  exportText.disabled = !session?.id || combatLogPageState.totalCount < 1 || combatLogStorageAction;
  exportJson.disabled = !session?.id || combatLogPageState.totalCount < 1 || combatLogStorageAction;
  importJson.disabled = combatLogStorageAction || !sceneLifecycle.isReady();
  storageStats.disabled = combatLogStorageAction || !sceneLifecycle.isReady();
  retention.disabled = combatLogStorageAction || !sceneLifecycle.isReady();
  clearLog.disabled = !session?.id || !events.length || !sceneLifecycle.isReady();
  deleteLog.disabled = !session?.id || !sceneLifecycle.isReady();
  exportText.addEventListener("click", async () => {
    if (combatLogStorageAction || !session?.id) return;
    combatLogStorageAction = true;
    try {
      const data = await getCombatLogExportData(session.id, { sceneEpoch: operation.epoch });
      if (!data) return;
      download(
        `${safeFileName(session.name)}.txt`,
        serializeCombatLogPresentationText(data.session, buildCombatLogPresentation(data.session, data.events)),
        "text/plain;charset=utf-8",
      );
    } catch (error: any) {
      await renderAfterStorageAction(`Esportazione fallita: ${error?.message || error}`);
    } finally {
      combatLogStorageAction = false;
    }
  });
  exportJson.addEventListener("click", async () => {
    if (combatLogStorageAction || !session?.id) return;
    combatLogStorageAction = true;
    try {
      const content = await exportCombatLogJSONFromStorage(session.id, { sceneEpoch: operation.epoch });
      if (content) download(`${safeFileName(session.name)}.json`, content, "application/json;charset=utf-8");
    } catch (error: any) {
      await renderAfterStorageAction(`Esportazione fallita: ${error?.message || error}`);
    } finally {
      combatLogStorageAction = false;
    }
  });
  importJson.addEventListener("click", () => {
    if (!combatLogStorageAction && sceneLifecycle.isReady()) importFile.click();
  });
  importFile.addEventListener("change", async () => {
    const file = importFile.files?.[0];
    importFile.value = "";
    if (!file || combatLogStorageAction || !sceneLifecycle.isReady()) return;
    const importOperation = sceneLifecycle.capture({ operationId: sceneOperationId("import-log") });
    if (!sceneLifecycle.isCurrent(importOperation)) return;
    combatLogStorageAction = true;
    try {
      const result = await importCombatLogJSON(await file.text(), { sceneEpoch: importOperation.epoch });
      if (!sceneLifecycle.isCurrent(importOperation)) return;
      await renderAfterStorageAction(result?.status === "reused"
        ? "Import già presente: nessuna copia duplicata creata."
        : `Import completato: ${result?.importedCount || 0} eventi aggiunti.`);
    } catch (error: any) {
      await renderAfterStorageAction(`Importazione fallita: ${error?.message || error}`);
    } finally {
      combatLogStorageAction = false;
    }
  });
  storageStats.addEventListener("click", async () => {
    if (combatLogStorageAction || !sceneLifecycle.isReady()) return;
    combatLogStorageAction = true;
    try {
      const stats = await getCombatLogStorageStats({ sceneEpoch: operation.epoch });
      if (!stats) return;
      await scheduleRender(`Storage locale: ${stats.sessionCount} registri, ${stats.eventCount} eventi (${stats.importedSessionCount} importati).`);
    } catch (error: any) {
      await renderAfterStorageAction(`Statistiche storage fallite: ${error?.message || error}`);
    } finally {
      combatLogStorageAction = false;
    }
  });
  retention.addEventListener("click", async () => {
    if (combatLogStorageAction || !sceneLifecycle.isReady()) return;
    const keepValue = window.prompt("Quanti registri locali vuoi conservare? Gli importati e quello attivo sono sempre esclusi.", "10");
    if (keepValue === null) return;
    const keepLastN = Math.max(0, Math.floor(Number(keepValue)));
    if (!Number.isFinite(keepLastN)) {
      await scheduleRender("Conservazione non applicata: inserisci un numero valido.");
      return;
    }
    const retentionOperation = sceneLifecycle.capture({ operationId: sceneOperationId("retention") });
    if (!sceneLifecycle.isCurrent(retentionOperation)) return;
    combatLogStorageAction = true;
    try {
      const preview = await previewCombatLogRetention({ keepLastN, sceneEpoch: retentionOperation.epoch });
      if (!sceneLifecycle.isCurrent(retentionOperation)) return;
      if (!preview?.candidates.length) {
        await renderAfterStorageAction("Conservazione: nessun registro idoneo da eliminare.");
        return;
      }
      const confirmed = window.confirm(
        `Anteprima conservazione: eliminare ${preview.sessionCount} registri e ${preview.eventCount} eventi? Questa azione è definitiva.`,
      );
      if (!confirmed) {
        await renderAfterStorageAction("Conservazione annullata: nessun registro eliminato.");
        return;
      }
      const result = await pruneCombatLogRetention({ keepLastN, sceneEpoch: retentionOperation.epoch });
      if (!sceneLifecycle.isCurrent(retentionOperation)) return;
      await renderAfterStorageAction(result?.failed?.length
        ? `Conservazione parziale: eliminati ${result.deletedIds.length}, falliti ${result.failed.length}.`
        : `Conservazione completata: eliminati ${result?.deletedIds?.length || 0} registri.`);
    } catch (error: any) {
      await renderAfterStorageAction(`Conservazione fallita: ${error?.message || error}`);
    } finally {
      combatLogStorageAction = false;
    }
  });
  newSession.addEventListener("click", async () => {
    if (!sceneLifecycle.isReady()) return;
    if (!isCombatLogEventSinkEnabled()) {
      await scheduleRender("Combat Log disattivato: nessun nuovo registro creato.");
      return;
    }
    if (events.length && !window.confirm("Creare un nuovo registro? Quello corrente resterà archiviato nel browser.")) return;
    const name = window.prompt("Nome del nuovo combattimento:", "") || "";
    const operation = sceneLifecycle.capture({ operationId: sceneOperationId("new-session") });
    if (!sceneLifecycle.isCurrent(operation)) return;
    try {
      await startCombatLogSession(name, { sceneEpoch: operation.sceneEpoch ?? operation.epoch });
      if (!sceneLifecycle.isCurrent(operation)) return;
      const metadata = await OBR.scene.getMetadata();
      if (!sceneLifecycle.isCurrent(operation)) return;
      await recordCombatTurn(metadata?.[`${ID}/state`], {
        sceneEpoch: operation.sceneEpoch ?? operation.epoch,
      });
      if (!sceneLifecycle.isCurrent(operation)) return;
      await scheduleRender("Nuovo registro creato.", { pageRequest: null });
    } catch (error: any) {
      await scheduleRender(`Creazione fallita: ${error?.message || error}`, { pageRequest: null });
    }
  });
  header.append(heading, headerActions);

  const clearConfirmation = document.createElement("div");
  Object.assign(clearConfirmation.style, {
    display: "none",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "10px",
    padding: "9px 10px",
    border: "1px solid rgba(248,113,113,.5)",
    borderRadius: "9px",
    background: "rgba(127,29,29,.3)",
  });
  const clearQuestion = document.createElement("strong");
  clearQuestion.textContent = "Cancellare definitivamente tutte le voci del log corrente?";
  Object.assign(clearQuestion.style, { fontSize: "var(--obrt-type-secondary, 11px)", fontWeight: "var(--obrt-weight-semibold, 600)", lineHeight: "1.3" });
  const clearActions = document.createElement("div");
  Object.assign(clearActions.style, { display: "flex", flex: "0 0 auto", gap: "5px" });
  const cancelClear = button("Annulla");
  const confirmClear = button("Cancella definitivamente", "danger");
  clearActions.append(cancelClear, confirmClear);
  clearConfirmation.append(clearQuestion, clearActions);
  clearLog.addEventListener("click", () => {
    if (!sceneLifecycle.isReady()) return;
    clearConfirmation.style.display = "flex";
    clearLog.disabled = true;
  });
  cancelClear.addEventListener("click", () => {
    clearConfirmation.style.display = "none";
    clearLog.disabled = false;
  });
  confirmClear.addEventListener("click", async () => {
    if (!sceneLifecycle.isReady()) return;
    const operation = sceneLifecycle.capture({ operationId: sceneOperationId("clear-log") });
    if (!sceneLifecycle.isCurrent(operation)) return;
    confirmClear.disabled = true;
    cancelClear.disabled = true;
    try {
      await clearCombatLogSession(session?.id, { sceneEpoch: operation.epoch });
      if (!sceneLifecycle.isCurrent(operation)) return;
      await scheduleRender("Registro cancellato. Il journal Undo non è stato modificato.", { pageRequest: null });
    } catch (error: any) {
      await scheduleRender(`Cancellazione fallita: ${error?.message || error}`, { pageRequest: null });
    }
  });

  const deleteConfirmation = document.createElement("div");
  Object.assign(deleteConfirmation.style, {
    display: "none",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "10px",
    padding: "9px 10px",
    border: "1px solid rgba(248,113,113,.62)",
    borderRadius: "9px",
    background: "rgba(127,29,29,.42)",
  });
  const deleteQuestion = document.createElement("strong");
  deleteQuestion.textContent = "Eliminare definitivamente questo registro dalla lista?";
  Object.assign(deleteQuestion.style, { fontSize: "var(--obrt-type-secondary, 11px)", fontWeight: "var(--obrt-weight-semibold, 600)", lineHeight: "1.3" });
  const deleteActions = document.createElement("div");
  Object.assign(deleteActions.style, { display: "flex", flex: "0 0 auto", gap: "5px" });
  const cancelDelete = button("Annulla");
  const confirmDelete = button("Elimina registro", "danger");
  deleteActions.append(cancelDelete, confirmDelete);
  deleteConfirmation.append(deleteQuestion, deleteActions);
  deleteLog.addEventListener("click", () => {
    if (!sceneLifecycle.isReady()) return;
    deleteConfirmation.style.display = "flex";
    deleteLog.disabled = true;
  });
  cancelDelete.addEventListener("click", () => {
    deleteConfirmation.style.display = "none";
    deleteLog.disabled = false;
  });
  confirmDelete.addEventListener("click", async () => {
    if (!sceneLifecycle.isReady()) return;
    const operation = sceneLifecycle.capture({ operationId: sceneOperationId("delete-log") });
    if (!sceneLifecycle.isCurrent(operation)) return;
    confirmDelete.disabled = true;
    cancelDelete.disabled = true;
    try {
      await deleteCombatLogSession(session?.id, { sceneEpoch: operation.epoch });
      if (!sceneLifecycle.isCurrent(operation)) return;
      await scheduleRender("Registro eliminato dalla lista.", { pageRequest: null });
    } catch (error: any) {
      await scheduleRender(`Eliminazione fallita: ${error?.message || error}`, { pageRequest: null });
    }
  });

  const filters = document.createElement("div");
  Object.assign(filters.style, { display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: "6px" });
  const filterField = (labelText: string, control: HTMLInputElement | HTMLSelectElement) => {
    const field = document.createElement("label");
    field.htmlFor = control.id;
    Object.assign(field.style, { display: "grid", gap: "3px", minWidth: "0" });
    const label = document.createElement("span");
    label.textContent = labelText;
    Object.assign(label.style, { color: "rgba(255,255,255,.55)", fontSize: "var(--obrt-type-micro, 9px)", fontWeight: "var(--obrt-weight-semibold, 600)" });
    field.append(label, control);
    return field;
  };
  const styleFilterControl = (control: HTMLInputElement | HTMLSelectElement) => {
    Object.assign(control.style, {
      minHeight: "32px",
      minWidth: "0",
      padding: "5px 9px",
      border: "1px solid rgba(148,163,184,.24)",
      borderRadius: "10px",
      background: "#0f172a",
      color: "#fff",
      font: "inherit",
      outline: "none",
    });
  };
  const search = document.createElement("input");
  search.type = "search";
  search.id = "combat-log-search";
  search.dataset.combatLogControl = "search";
  search.value = combatLogUiState.query;
  search.placeholder = "Cerca testo, attore o bersaglio…";
  const category = document.createElement("select");
  category.id = "combat-log-category";
  category.dataset.combatLogControl = "category";
  const allCategories = document.createElement("option");
  allCategories.value = "";
  allCategories.textContent = "Tutte le categorie";
  category.appendChild(allCategories);
  const categoryCounts = new Map(presentation.availableCategories.map((item) => [item.value, item.count]));
  for (const value of COMBAT_LOG_CATEGORY_ORDER) {
    const option = document.createElement("option");
    const meta = getCombatLogCategoryMeta(value);
    option.value = value;
    option.textContent = categoryCounts.has(value) ? `${meta.label} (${categoryCounts.get(value)})` : meta.label;
    category.appendChild(option);
  }
  const participant = document.createElement("select");
  participant.id = "combat-log-participant";
  participant.dataset.combatLogControl = "participant";
  const allParticipants = document.createElement("option");
  allParticipants.value = "";
  allParticipants.textContent = "Tutti i partecipanti";
  participant.appendChild(allParticipants);
  for (const name of presentation.participants) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    participant.appendChild(option);
  }
  const outcome = document.createElement("select");
  outcome.id = "combat-log-outcome";
  outcome.dataset.combatLogControl = "outcome";
  const allOutcomes = document.createElement("option");
  allOutcomes.value = "";
  allOutcomes.textContent = "Tutti gli esiti";
  outcome.appendChild(allOutcomes);
  for (const item of presentation.availableOutcomes) {
    const option = document.createElement("option");
    option.value = item.value;
    option.textContent = item.label;
    outcome.appendChild(option);
  }
  for (const control of [search, category, participant, outcome]) {
    styleFilterControl(control);
    control.querySelectorAll("option").forEach((option) => Object.assign((option as HTMLOptionElement).style, { background: "#0f172a", color: "#fff" }));
  }
  category.value = combatLogUiState.category;
  participant.value = combatLogUiState.participant;
  outcome.value = combatLogUiState.outcome;
  filters.append(
    filterField("Cerca", search),
    filterField("Categoria", category),
    filterField("Partecipante", participant),
    filterField("Esito", outcome),
  );

  const noteForm = document.createElement("form");
  Object.assign(noteForm.style, { display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: "6px" });
  const note = document.createElement("input");
  note.type = "text";
  note.disabled = !combatLogEnabled || !sceneLifecycle.isReady();
  note.placeholder = "Aggiungi una nota manuale al combattimento…";
  Object.assign(note.style, {
    minWidth: "0",
    minHeight: "32px",
    padding: "5px 9px",
    border: "1px solid rgba(148,163,184,.24)",
    borderRadius: "10px",
    background: "#0f172a",
    color: "#fff",
    font: "inherit",
    outline: "none",
  });
  const addNote = button("Aggiungi nota", "primary", "log-note.svg");
  addNote.disabled = !combatLogEnabled || !sceneLifecycle.isReady();
  noteForm.append(note, addNote);
  noteForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!note.value.trim()) return;
    if (!sceneLifecycle.isReady()) return;
    if (!isCombatLogEventSinkEnabled()) {
      await scheduleRender("Combat Log disattivato: nota non registrata.");
      return;
    }
    addNote.disabled = true;
    const operation = sceneLifecycle.capture({ operationId: sceneOperationId("note") });
    if (!sceneLifecycle.isCurrent(operation)) return;
    const created = await addCombatLogNote(note.value, { sceneEpoch: operation.epoch });
    if (!sceneLifecycle.isCurrent(operation)) return;
    await scheduleRender(created.length ? "Nota aggiunta." : "Combat Log disattivato: nota non registrata.");
  });

  const status = document.createElement("div");
  status.setAttribute("aria-live", "polite");
  status.textContent = combatLogEnabled
    ? (message || "Il registro non viene modificato dagli Undo: viene aggiunta una voce di annullamento.")
    : (message
      ? `${message} Combat Log disattivato: History/Undo e sessioni esistenti restano disponibili.`
      : "Combat Log disattivato: History/Undo e sessioni esistenti restano disponibili.");
  Object.assign(status.style, { minHeight: "14px", color: "rgba(255,255,255,.58)", fontSize: "var(--obrt-type-caption, 10px)", fontWeight: "var(--obrt-weight-regular, 400)" });

  const timeline = document.createElement("section");
  timeline.dataset.combatLogTimeline = "true";
  timeline.setAttribute("aria-label", "Timeline del Combat Log");
  Object.assign(timeline.style, {
    flex: "0 0 auto",
    height: "auto",
    minHeight: "0",
    display: "grid",
    alignContent: "start",
    gap: "6px",
    overflowY: "visible",
    padding: "1px 3px 1px 0",
    scrollbarWidth: "thin",
  });

  const projectionSummary = document.createElement("div");
  projectionSummary.setAttribute("aria-live", "polite");
  Object.assign(projectionSummary.style, {
    padding: "6px 8px",
    border: "1px solid rgba(148,163,184,.16)",
    borderRadius: "8px",
    color: "rgba(255,255,255,.64)",
    background: "rgba(15,23,42,.42)",
    fontSize: "var(--obrt-type-caption, 10px)",
    lineHeight: "1.35",
    overflowWrap: "anywhere",
  });

  const pageControls = document.createElement("div");
  Object.assign(pageControls.style, { display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px" });
  const loadOlder = button("Carica eventi precedenti");
  const loadAll = button("Carica tutto");
  loadOlder.dataset.combatLogControl = "load-older";
  loadAll.dataset.combatLogControl = "load-all";
  loadOlder.title = "Aggiunge la pagina precedente senza rimuovere gli eventi già caricati";
  loadAll.title = "Carica tutti gli eventi per applicare i filtri sull'intero registro";
  const loadedEventCount = combatLogPageState.events.size;
  loadOlder.disabled = !combatLogPageState.hasOlder || combatLogPageLoading || combatLogStorageAction;
  loadAll.disabled = combatLogPageState.totalCount <= loadedEventCount || combatLogPageLoading || combatLogStorageAction;
  const pageHint = document.createElement("span");
  pageHint.dataset.combatLogPageHint = "true";
  pageHint.textContent = combatLogPageState.totalCount > loadedEventCount
    ? "Filtri sulla pagina caricata"
    : "Registro completo caricato";
  pageHint.setAttribute("aria-live", "polite");
  Object.assign(pageHint.style, { color: "rgba(255,255,255,.5)", fontSize: "var(--obrt-type-micro, 9px)", overflowWrap: "anywhere" });
  pageControls.append(loadOlder, loadAll, pageHint);
  loadOlder.addEventListener("click", async () => {
    if (combatLogPageLoading || !combatLogPageState.hasOlder || !session?.id) return;
    const operation = sceneLifecycle.capture({ operationId: sceneOperationId("combat-log-page") });
    if (!sceneLifecycle.isCurrent(operation)) return;
    const loaded = [...combatLogPageState.events.values()]
      .map((event) => Number(event?.sequence))
      .filter(Number.isFinite);
    const beforeSequence = loaded.length ? Math.min(...loaded) : undefined;
    const operationToken = ++combatLogPageOperationToken;
    combatLogPageLoading = true;
    loadOlder.disabled = true;
    try {
      await scheduleRender("Caricamento degli eventi precedenti…", {
        pageRequest: {
          direction: "backward",
          beforeSequence,
          sessionId: String(session.id),
        },
      });
    } catch (error: any) {
      statusMessage = `Caricamento fallito: ${error?.message || error}`;
    } finally {
      if (operationToken !== combatLogPageOperationToken) return;
      combatLogPageLoading = false;
      if (sceneLifecycle.isCurrent(operation)) syncCombatLogPageControls();
    }
  });
  loadAll.addEventListener("click", async () => {
    if (combatLogPageLoading || !session?.id) return;
    const operation = sceneLifecycle.capture({ operationId: sceneOperationId("combat-log-load-all") });
    if (!sceneLifecycle.isCurrent(operation)) return;
    const operationToken = ++combatLogPageOperationToken;
    combatLogPageLoading = true;
    loadAll.disabled = true;
    try {
      await scheduleRender("Caricamento del registro completo…", { loadAll: true });
    } catch (error: any) {
      statusMessage = `Caricamento fallito: ${error?.message || error}`;
    } finally {
      if (operationToken !== combatLogPageOperationToken) return;
      combatLogPageLoading = false;
      if (sceneLifecycle.isCurrent(operation)) syncCombatLogPageControls();
    }
  });

  const timelineMore = button("Mostra altri eventi");
  timelineMore.dataset.combatLogControl = "timeline-more";
  timelineMore.hidden = true;
  timelineMore.title = "Aggiunge alla timeline gli eventi precedenti già caricati";
  timelineMore.addEventListener("click", () => {
    const shouldRestoreFocus = document.activeElement === timelineMore;
    const previousScrollTop = timeline.scrollTop;
    combatLogTimelineVisibleLimit += COMBAT_LOG_TIMELINE_BATCH_SIZE;
    renderTimeline();
    timeline.scrollTop = previousScrollTop;
    if (shouldRestoreFocus) timelineMore.focus();
  });

  const renderTimeline = () => {
    timeline.replaceChildren();
    timelineMore.hidden = true;
    combatLogUiState.query = search.value;
    combatLogUiState.category = category.value;
    combatLogUiState.participant = participant.value;
    combatLogUiState.outcome = outcome.value;
    const filteredPresentation = filterCombatLogPresentation(presentation, {
      query: combatLogUiState.query,
      category: combatLogUiState.category,
      participant: combatLogUiState.participant,
      outcome: combatLogUiState.outcome,
    });
    const filterSuffix = filteredPresentation.events.length === presentation.events.length
      ? ""
      : " filtrati";
    const categorySummary = Object.entries(sessionSummary.categoryCounts)
      .map(([categoryName, count]) => `${getCombatLogCategoryMeta(categoryName).label}: ${count}`)
      .join(" · ");
    const recordedInterval = sessionSummary.firstEventAt === null || sessionSummary.lastEventAt === null
      ? "nessun evento"
      : `${formatCombatLogTimestamp(sessionSummary.firstEventAt)} – ${formatCombatLogTimestamp(sessionSummary.lastEventAt)}`;
    const loadedSummary = combatLogPageState.totalCount > events.length
      ? `${events.length} caricati su ${combatLogPageState.totalCount}`
      : `${events.length} eventi`;
    const timelineWindow = getCombatLogTimelineWindow(
      filteredPresentation.events,
      combatLogTimelineVisibleLimit,
    );
    const visibleEvents = timelineWindow.events;
    const visibleEventIds = new Set(visibleEvents.map((event) => String(event?.id || "")));
    const visibleSuffix = timelineWindow.hasMore
      ? ` · mostrati ${visibleEvents.length} più recenti`
      : "";
    projectionSummary.textContent = [
      `${filteredPresentation.events.length} visibili · ${loadedSummary}${filterSuffix}${visibleSuffix}`,
      `${sessionSummary.roundCount} round`,
      `${sessionSummary.turnCount} turni`,
      `${sessionSummary.participantCount} partecipanti`,
      `Intervallo: ${recordedInterval}`,
      categorySummary ? `Categorie: ${categorySummary}` : "Nessuna categoria registrata",
    ].join(" · ");

    if (!filteredPresentation.events.length) {
      const empty = document.createElement("div");
      empty.textContent = !presentation.sessionSummary.hasSession
        ? "Nessun registro attivo. Il primo evento registrabile creerà una sessione."
        : presentation.events.length
          ? "Nessun evento corrisponde ai filtri."
          : "Il registro è vuoto. Le prossime operazioni verranno registrate qui.";
      Object.assign(empty.style, { padding: "18px", textAlign: "center", color: "rgba(255,255,255,.55)", overflowWrap: "anywhere" });
      timeline.appendChild(empty);
      return;
    }

    for (const round of [...filteredPresentation.groups].reverse()) {
      const visibleTurns = round.turns
        .map((turn) => ({
          ...turn,
          events: turn.events.filter((event) => visibleEventIds.has(String(event?.id || ""))),
        }))
        .filter((turn) => turn.events.length);
      if (!visibleTurns.length) continue;
      const roundDetails = document.createElement("details");
      const roundKey = String(round.round);
      roundDetails.dataset.roundKey = roundKey;
      roundDetails.open = !combatLogUiState.collapsedRounds.has(roundKey);
      Object.assign(roundDetails.style, {
        display: "block",
        border: "1px solid rgba(148,163,184,.16)",
        borderRadius: "8px",
        background: "rgba(15,23,42,.34)",
        overflow: "visible",
      });
      roundDetails.addEventListener("toggle", () => {
        if (roundDetails.open) combatLogUiState.collapsedRounds.delete(roundKey);
        else combatLogUiState.collapsedRounds.add(roundKey);
        roundDetails.querySelector("summary")?.setAttribute("aria-expanded", String(roundDetails.open));
      });
      const roundSummary = document.createElement("summary");
      roundSummary.textContent = `Round ${round.round} · ${visibleTurns.reduce((total, turn) => total + turn.events.length, 0)} eventi · ${visibleTurns.length} turni`;
      roundSummary.setAttribute("aria-label", roundSummary.textContent);
      roundSummary.setAttribute("aria-expanded", String(roundDetails.open));
      Object.assign(roundSummary.style, {
        padding: "7px 8px",
        cursor: "pointer",
        color: "rgba(255,255,255,.76)",
        fontSize: "var(--obrt-type-caption, 10px)",
        fontWeight: "var(--obrt-weight-bold, 700)",
        letterSpacing: ".04em",
      });
      roundDetails.appendChild(roundSummary);
      const roundBody = document.createElement("div");
      Object.assign(roundBody.style, { display: "grid", gap: "5px", padding: "0 5px 5px" });
      for (const turn of [...visibleTurns].reverse()) {
        const turnDetails = document.createElement("details");
        const turnKey = `${round.round}:${turn.turnKey}`;
        turnDetails.dataset.turnKey = turnKey;
        turnDetails.open = !combatLogUiState.collapsedTurns.has(turnKey);
        Object.assign(turnDetails.style, {
          display: "block",
          border: "1px solid rgba(148,163,184,.12)",
          borderRadius: "7px",
          background: "rgba(15,23,42,.28)",
          overflow: "visible",
        });
        turnDetails.addEventListener("toggle", () => {
          if (turnDetails.open) combatLogUiState.collapsedTurns.delete(turnKey);
          else combatLogUiState.collapsedTurns.add(turnKey);
          turnDetails.querySelector("summary")?.setAttribute("aria-expanded", String(turnDetails.open));
        });
        const turnSummary = document.createElement("summary");
        turnSummary.textContent = `${turn.turnName} · ${turn.events.length} eventi`;
        turnSummary.setAttribute("aria-label", `Turno di ${turn.turnName} · ${turn.events.length} eventi`);
        turnSummary.setAttribute("aria-expanded", String(turnDetails.open));
        Object.assign(turnSummary.style, {
          padding: "6px 8px",
          cursor: "pointer",
          color: "rgba(255,255,255,.68)",
          fontSize: "var(--obrt-type-caption, 10px)",
          fontWeight: "var(--obrt-weight-semibold, 600)",
        });
        const turnBody = document.createElement("div");
        Object.assign(turnBody.style, { display: "grid", gap: "5px", padding: "0 5px 5px" });
        for (const event of [...turn.events].reverse()) turnBody.appendChild(makeEventRow(event));
        turnDetails.append(turnSummary, turnBody);
        roundBody.appendChild(turnDetails);
      }
      roundDetails.appendChild(roundBody);
      timeline.appendChild(roundDetails);
    }
    if (timelineWindow.hasMore) {
      timelineMore.hidden = false;
      timelineMore.textContent = `Mostra altri eventi · ${visibleEvents.length} di ${filteredPresentation.events.length}`;
      timeline.appendChild(timelineMore);
    }
  };
  for (const control of [search, category, participant, outcome]) {
    control.addEventListener(control instanceof HTMLInputElement ? "input" : "change", () => {
      rememberCombatLogFocus(control);
      renderTimeline();
    });
  }
  renderTimeline();

  const logPanel = document.createElement("details");
  logPanel.dataset.panel = "log";
  logPanel.open = logPanelOpen;
  Object.assign(logPanel.style, {
    flex: "0 0 auto",
    border: "1px solid rgba(148,163,184,.18)",
    borderRadius: "11px",
    background: "rgba(15,23,42,.58)",
    overflow: "visible",
  });
  const logSummary = document.createElement("summary");
  logSummary.textContent = `Log di combattimento · ${session?.name || "Nessun registro attivo"} (${combatLogPageState.totalCount})`;
  Object.assign(logSummary.style, {
    padding: "10px",
    cursor: "pointer",
    fontSize: "var(--obrt-type-body, 12px)",
    fontWeight: "var(--obrt-weight-bold, 700)",
  });
  const logBody = document.createElement("div");
  Object.assign(logBody.style, {
    display: "flex",
    flexDirection: "column",
    gap: "9px",
    padding: "0 9px 9px",
    overflow: "visible",
  });
  headerActions.replaceChildren(
    newSession,
    toolbarMenu("Esporta/importa", "log-export.svg", [exportText, exportJson, importJson]),
    toolbarMenu("Gestisci registro", "log-more.svg", [clearLog, deleteLog, storageStats, retention]),
  );
  headerActions.appendChild(importFile);
  logBody.append(header, clearConfirmation, deleteConfirmation, filters, projectionSummary, pageControls, noteForm, status, timeline);
  logPanel.append(logSummary, logBody);

  const undoPanel = makeUndoPanel(undoState, async (undoMessage) => scheduleRender(undoMessage));
  panel.append(close, logPanel, undoPanel);
  app.replaceChildren(panel);
  restoreCombatLogUiState(app);
  syncCombatLogPageControls();
}

async function renderAfterStorageAction(message: string) {
  combatLogStorageAction = false;
  return scheduleRender(message);
}

function queueRefresh() {
  if (!sceneLifecycle.isReady()) return;
  if (undoInProgress || undoCleanupInProgress) {
    refreshAfterUndo = true;
    return;
  }
  if (refreshQueued) return;
  refreshQueued = true;
  window.setTimeout(() => {
    refreshQueued = false;
    if (undoInProgress || undoCleanupInProgress) {
      refreshAfterUndo = true;
      return;
    }
    if (!sceneLifecycle.isReady()) return;
    void scheduleRender().catch(() => {});
  }, 80);
}

OBR.onReady(async () => {
  unsubscribeSceneLifecycle = sceneLifecycle.subscribe((event) => {
    if (event.phase === "unavailable") {
      combatLogPageOperationToken += 1;
      combatLogPageLoading = false;
      statusMessage = "Scena cambiata: Undo e registrazioni sono sospesi finché non viene montata una nuova baseline.";
      void scheduleRender(statusMessage).catch(() => {});
    } else if (event.phase === "ready" && event.reason !== "scene-bootstrap-ready") {
      statusMessage = "Nuova scena pronta: verifica il registro prima di usare Undo.";
      void scheduleRender(statusMessage).catch(() => {});
    }
  });
  await sceneLifecycle.mount();
  if (!sceneLifecycle.isReady()) {
    document.getElementById("app")?.replaceChildren();
    const app = document.getElementById("app");
    if (app) app.textContent = "Scena non disponibile: riapri il Registro.";
    return;
  }
  await mountCombatLogEventSink();
  document.documentElement.style.margin = "0";
  document.body.style.margin = "0";
  document.body.style.background = "transparent";
  subscribeCombatLog(queueRefresh);
  unsubscribeHistoryChange = OBR.broadcast.onMessage(HISTORY_CHANGE_CHANNEL, (event) => {
    if (event?.data?.type === "changed") queueRefresh();
  });
  unsubscribeUndoSceneItems = subscribeSceneItemChanges(() => queueRefresh());
  unsubscribeCombatLogOption = runtimeOptionsService.subscribe(
    selectCombatLogEnabled,
    () => queueRefresh(),
    { emitCurrent: false },
  );
  await scheduleRender();
});

window.addEventListener("beforeunload", () => {
  combatLogPageOperationToken += 1;
  combatLogPageLoading = false;
  unsubscribeSceneLifecycle?.();
  sceneLifecycle.dispose();
  unsubscribeCombatLogOption?.();
  unsubscribeHistoryChange?.();
  unsubscribeUndoSceneItems?.();
});
