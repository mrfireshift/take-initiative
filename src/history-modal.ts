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
  deleteCombatLogEvent,
  deleteCombatLogEvents,
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
import { requestHistoryOwnerClear } from "./historyOwner.js";
import {
  historyUndoDepthWithCauses,
  isAutomaticConsequenceEntry,
  partitionHistoryUndoRows,
  shouldAutoRefreshHistoryUndoReadiness,
  shouldHandleHistoryUndoShortcut,
} from "./historyUndoUiCore.js";
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
let undoResetInProgress = false;
let refreshAfterUndo = false;
let historyPendingReadinessTimer: number | null = null;
const HISTORY_PENDING_READINESS_RECHECK_MS = 250;
let showNonUndoableHistory = false;
let unsubscribeCombatLogOption: (() => void) | null = null;
let unsubscribeHistoryChange: (() => void) | null = null;
let unsubscribeUndoSceneItems: (() => void) | null = null;
let combatLogStorageAction = false;
// The registro the two exports write (lot L20): the current one, or an archived one exported without becoming the
// active registro (the session picker makes it active, and the new events then went into it).
let combatLogExportSessionId = "";
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
  // Selection mode: several entries deleted together.
  selecting: false,
  selectedEvents: new Set<string>(),
  // Open delete confirmations survive the re-renders a scene change triggers.
  confirmDeleteEventId: "",
  confirmingSelectionDelete: false,
  // The registry whose «Svuota» or «Elimina registro» banner is open, and the note being typed: an item change rebuilds
  // the panel, and they must outlive it.
  confirmingClearSessionId: "",
  confirmingDeleteSessionId: "",
  noteDraft: "",
  timelineScrollTop: 0,
  focusControl: "",
  selectionStart: null as number | null,
  selectionEnd: null as number | null,
};

const combatLogPageState = createCombatLogPageState();

// "1 evento", "2 eventi": the counts of the Registro agree with their noun (lot L18).
function countText(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

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

let activeTab: "log" | "undo" = "log";

function captureAccordionState(app: HTMLElement) {
  const logTabBtn = app.querySelector('[data-tab="log"]');
  const undoTabBtn = app.querySelector('[data-tab="undo"]');
  if (logTabBtn?.getAttribute("aria-selected") === "true") activeTab = "log";
  if (undoTabBtn?.getAttribute("aria-selected") === "true") activeTab = "undo";
  if (preferredPanel === "undo") {
    activeTab = "undo";
    preferredPanel = null;
  } else if (preferredPanel === "log") {
    activeTab = "log";
    preferredPanel = null;
  }
  logPanelOpen = activeTab === "log";
  undoPanelOpen = activeTab === "undo";
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
  // Focus elsewhere: nothing to give it back to (not the control focused some time before, such as the search).
  if (!(active instanceof HTMLElement) || !active.dataset.combatLogControl) {
    combatLogUiState.focusControl = "";
    return;
  }
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
  const isPartial = combatLogPageState.totalCount > controls.loadedCount;
  loadOlder.style.display = combatLogPageState.hasOlder ? "inline-flex" : "none";
  loadAll.style.display = isPartial ? "inline-flex" : "none";
  const pageHint = app.querySelector<HTMLElement>("[data-combat-log-page-hint]");
  if (pageHint) {
    pageHint.textContent = isPartial ? "Filtri sulla pagina caricata" : "";
    pageHint.style.display = isPartial ? "inline" : "none";
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

function toolbarMenu(label: string, iconPath: string, controls: HTMLElement[]) {
  const wrap = document.createElement("div");
  wrap.className = "toolbar-menu-wrap";
  const trigger = button(label, "default", iconPath, true);
  trigger.title = label;
  trigger.setAttribute("aria-haspopup", "menu");
  trigger.setAttribute("aria-expanded", "false");
  const menu = document.createElement("div");
  menu.className = "toolbar-menu-dropdown";
  menu.setAttribute("role", "menu");
  menu.style.display = "none";
  const setOpen = (open: boolean) => {
    menu.style.display = open ? "grid" : "none";
    menu.style.gap = open ? "4px" : "";
    trigger.setAttribute("aria-expanded", String(open));
  };
  trigger.addEventListener("click", () => setOpen(menu.style.display === "none"));
  for (const control of controls) {
    if (control.tagName !== "BUTTON") {
      menu.appendChild(control);
      continue;
    }
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
  downloadBlob(name, new Blob([content], { type }));
}

function downloadBlob(name: string, blob: Blob) {
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
  const label = event?.categoryLabel || meta.label;
  badge.textContent = label;
  badge.title = label === meta.label
    ? `Categoria ${meta.label} · kind ${String(event?.kind || "change")}`
    : `Tipo ${label} · categoria tecnica ${meta.label} · kind ${String(event?.kind || "change")}`;
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
  if (technical.historyEntryId) values.push(`Cronologia: ${technical.historyEntryId}`);
  if (technical.commandId) values.push(`command: ${technical.commandId}`);
  if (technical.correlationId) values.push(`correlation: ${technical.correlationId}`);
  if (technical.causality?.instanceId) values.push(`istanza incantesimo: ${technical.causality.instanceId}`);
  if (technical.causality?.actionId) values.push(`azione incantesimo: ${technical.causality.actionId}`);
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

// Selection mode of the timeline: a checkbox replaces the trash button and a click on the row toggles it.
type EventRowSelection = { active: boolean; selected: boolean; onToggle: (event: any, selected: boolean) => void };

function bindRowSelection(row: HTMLElement, top: HTMLElement) {
  row.style.cursor = "pointer";
  row.addEventListener("click", (click) => {
    const checkbox = top.querySelector('[data-combat-log-control="select-event"]') as HTMLInputElement | null;
    if (!checkbox || checkbox.disabled || click.target === checkbox) return;
    // In selection mode a click selects the row instead of opening its details.
    click.preventDefault();
    checkbox.checked = !checkbox.checked;
    checkbox.dispatchEvent(new Event("change"));
  });
}

function makeEventRow(event: any, onDelete: (event: any) => Promise<void>, selection: EventRowSelection | null = null) {
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

  const selecting = !!selection?.active;
  if (selecting) {
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = !!selection?.selected;
    checkbox.dataset.combatLogControl = "select-event";
    checkbox.setAttribute("aria-label", `Seleziona: ${event?.title || "Evento"}`);
    checkbox.disabled = combatLogStorageAction || combatLogPageLoading || !sceneLifecycle.isReady();
    Object.assign(checkbox.style, { width: "14px", height: "14px", margin: "0", flex: "0 0 auto", accentColor: "#f87171", cursor: "pointer" });
    const paintSelected = () => {
      const row = top.closest("[data-event-id]") as HTMLElement | null;
      if (row) row.style.boxShadow = checkbox.checked ? "inset 0 0 0 1px rgba(248,113,113,.6)" : "";
    };
    checkbox.addEventListener("click", (click) => click.stopPropagation());
    checkbox.addEventListener("change", () => {
      paintSelected();
      selection?.onToggle(event, checkbox.checked);
    });
    queueMicrotask(paintSelected);
    top.prepend(checkbox);
  }

  // Delete: the trash button turns into a compact inline confirmation on the same line (Elimina · ✕, Esc cancels).
  const remove = button("Elimina evento dal registro", "danger", "log-delete.svg", true);
  remove.dataset.combatLogControl = "delete-event";
  remove.title = "Elimina questa voce dal registro";
  remove.disabled = combatLogStorageAction || combatLogPageLoading || !sceneLifecycle.isReady();
  Object.assign(remove.style, { minHeight: "24px", height: "24px", width: "24px", minWidth: "24px", flex: "0 0 auto", borderRadius: "7px" });
  const confirmation = document.createElement("span");
  confirmation.dataset.combatLogDeleteConfirmation = String(event?.id || "");
  confirmation.setAttribute("role", "group");
  confirmation.setAttribute("aria-label", "Eliminare definitivamente questa voce dal registro?");
  confirmation.title = "Eliminare definitivamente questa voce dal registro?";
  Object.assign(confirmation.style, { display: "none", alignItems: "center", gap: "4px", flex: "0 0 auto" });
  const cancel = button("Annulla", "default", "", true);
  cancel.textContent = "✕";
  cancel.setAttribute("aria-label", "Annulla");
  cancel.title = "Annulla";
  const confirm = button("Elimina", "danger");
  for (const control of [cancel, confirm]) {
    Object.assign(control.style, { minHeight: "24px", height: "24px", borderRadius: "7px", fontSize: "var(--obrt-type-caption, 10px)" });
  }
  Object.assign(cancel.style, { width: "24px", minWidth: "24px", padding: "0" });
  Object.assign(confirm.style, { padding: "0 8px" });
  confirmation.append(confirm, cancel);
  if (!selecting) top.append(remove, confirmation);
  const closeConfirmation = () => {
    combatLogUiState.confirmDeleteEventId = "";
    confirmation.style.display = "none";
    remove.style.display = "";
    remove.disabled = false;
    remove.focus();
  };
  const openConfirmation = (focus: boolean) => {
    combatLogUiState.confirmDeleteEventId = String(event?.id || "");
    confirmation.style.display = "inline-flex";
    remove.style.display = "none";
    remove.disabled = true;
    if (focus) confirm.focus();
  };
  remove.addEventListener("click", (click) => {
    click.preventDefault();
    click.stopPropagation();
    openConfirmation(true);
  });
  if (!selecting && !remove.disabled && event?.id && combatLogUiState.confirmDeleteEventId === String(event.id)) openConfirmation(false);
  cancel.addEventListener("click", (click) => {
    click.preventDefault();
    click.stopPropagation();
    closeConfirmation();
  });
  confirmation.addEventListener("keydown", (key: KeyboardEvent) => {
    if (key.key !== "Escape") return;
    key.preventDefault();
    key.stopPropagation();
    closeConfirmation();
  });
  confirm.addEventListener("click", async (click) => {
    click.preventDefault();
    click.stopPropagation();
    confirm.disabled = true;
    cancel.disabled = true;
    try {
      await onDelete(event);
    } finally {
      confirm.disabled = false;
      cancel.disabled = false;
    }
  });

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
    boundary.append(top);
    if (selecting) bindRowSelection(boundary, top);
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
  summary.append(top);
  if (selecting) bindRowSelection(summary, top);
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
  if (row?.status === HISTORY_UNDO_READINESS_STATUS.INVALID) return "Voce incompleta";
  if (row?.status === HISTORY_UNDO_READINESS_STATUS.NOOP) return "Nessuna modifica reversibile";
  return "Verifica non disponibile";
}

// Why an action can no longer be undone, in words (lot L18): no token id, no internal code.
const UNDO_CONFLICT_REASON_TEXT: Record<string, string> = {
  "current-value-mismatch": "è cambiato dopo l'operazione",
  "missing-item": "il token non è più nella scena",
  "scene-item-snapshot-mismatch": "il token è cambiato dopo l'operazione",
  "scene-item-not-absent": "il token è di nuovo nella scena",
};
const UNDO_CONFLICT_FIELD_TEXT: Record<string, string> = {
  hp: "PF", hpMax: "PF massimi", tempHp: "PF temporanei", conditions: "condizioni", spells: "incantesimi",
  concentration: "concentrazione", initiative: "iniziativa", position: "posizione", name: "nome",
  "owned-fields": "dati del token", item: "token", "scene-item": "token", commands: "comandi",
};

function undoConflictText(conflict: any) {
  const field = String(conflict?.field || "").split("/").pop() || "";
  const fieldText = UNDO_CONFLICT_FIELD_TEXT[field] || "";
  const reasonText = UNDO_CONFLICT_REASON_TEXT[String(conflict?.reason || "")] || "stato non compatibile";
  return fieldText && !reasonText.startsWith("il token") ? `${fieldText}: ${reasonText}` : reasonText;
}

function undoReadinessTitle(row: any) {
  const conflicts = Array.isArray(row?.conflicts) ? row.conflicts : [];
  if (conflicts.length) {
    return [...new Set(conflicts.map(undoConflictText))].slice(0, 3).join(" · ");
  }
  const reason = String(row?.reason || "");
  return reason && !/^[a-z]+(-[a-z]+)+$/.test(reason) ? reason : undoReadinessLabel(row);
}

function makeUndoPanel(undoState: any, onDone: (message: string) => Promise<void>) {
  const entries = Array.isArray(undoState?.entries) ? undoState.entries : [];
  const newest = Array.isArray(undoState?.rows) ? undoState.rows : [];
  const undoRows = partitionHistoryUndoRows(newest);
  const panel = document.createElement("div");
  panel.className = "history-tab-panel";
  panel.dataset.panel = "undo";
  panel.hidden = activeTab !== "undo";

  const controls = document.createElement("div");
  controls.className = "undo-controls-bar";

  const list = document.createElement("div");
  list.className = "undo-list-scroll";

  if (undoState?.status !== "ready") {
    const unavailable = document.createElement("div");
    unavailable.className = "undo-status-warning";
    unavailable.textContent = "Impossibile verificare con precisione le azioni annullabili. Attendi il completamento degli aggiornamenti della scena.";
    Object.assign(unavailable.style, { padding: "10px", fontSize: "11px", lineHeight: "1.4" });
    list.appendChild(unavailable);
  } else if (!newest.length) {
    const empty = document.createElement("div");
    empty.textContent = "Nessuna operazione reversibile.";
    Object.assign(empty.style, { padding: "18px", textAlign: "center", color: "var(--obrt-muted)", fontSize: "11px" });
    list.appendChild(empty);
  } else {
    if (undoRows.nonUndoable.length) {
      const hiddenSummary = document.createElement("div");
      hiddenSummary.className = "undo-hidden-history-summary";
      Object.assign(hiddenSummary.style, {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "8px",
        padding: "8px 9px",
        marginBottom: "6px",
        border: "1px solid rgba(148,163,184,.16)",
        borderRadius: "7px",
        background: "rgba(15,23,42,.5)",
        color: "var(--obrt-muted)",
        fontSize: "10px",
        lineHeight: "1.35",
      });
      const summaryText = document.createElement("span");
      summaryText.textContent = undoRows.undoable.length
        ? (undoRows.nonUndoable.length === 1
          ? "1 operazione precedente non è più annullabile."
          : `${undoRows.nonUndoable.length} operazioni precedenti non sono più annullabili.`)
        : `Nessuna operazione annullabile · ${undoRows.nonUndoable.length === 1
          ? "1 operazione precedente non è più compatibile"
          : `${undoRows.nonUndoable.length} operazioni precedenti non sono più compatibili`} con lo stato attuale.`;
      const toggleHistory = button(showNonUndoableHistory ? "Nascondi" : "Mostra");
      toggleHistory.classList.add("undo-hidden-history-toggle");
      toggleHistory.title = showNonUndoableHistory
        ? "Nasconde le voci non più annullabili"
        : "Mostra le voci conservate per diagnosi ma non più annullabili";
      toggleHistory.addEventListener("click", () => {
        showNonUndoableHistory = !showNonUndoableHistory;
        void onDone("");
      });
      hiddenSummary.append(summaryText, toggleHistory);
      list.appendChild(hiddenSummary);
    }

    // An automatic consequence comes with the entry that caused it (historyUndoDepthWithCauses).
    let selectedDepth = newest[0]?.undoable === true ? historyUndoDepthWithCauses(newest, 1) : 0;
    const rows: Array<{ checkbox: HTMLInputElement; row: HTMLLabelElement }> = [];
    const undo = button("Annulla l'ultima", "primary", "history.svg");
    const cleanup = button("Pulisci voci incomplete");
    cleanup.title = "Rimuove solo le voci incomplete; i conflitti restano visibili nella cronologia";
    const resetHistory = button("Azzera la cronologia", "danger");
    resetHistory.title = "Cancella l'intera cronologia senza modificare la scena o il registro combattimento";
    const refresh = () => {
      rows.forEach(({ checkbox, row }, index) => {
        const readiness = newest[index];
        const selected = selectedDepth > 0 && index < selectedDepth;
        checkbox.checked = selected;
        checkbox.disabled = readiness?.undoable !== true;
        if (selected) {
          row.classList.add("selected");
          row.style.background = "rgba(30,64,175,.28)";
        } else {
          row.classList.remove("selected");
          row.style.background = "rgba(15,23,42,.72)";
        }
        row.style.cursor = readiness?.undoable === true ? "pointer" : "not-allowed";
        row.style.opacity = readiness?.undoable === true ? "1" : ".68";
      });
      setButtonLabel(undo, selectedDepth === 1 ? "Annulla l'ultima" : `Annulla ${selectedDepth} azioni`);
      // The handlers keep the controls guarded while an async operation is
      // running. Do not derive the disabled state from those flags here:
      // onDone() can render a fresh panel before the finally block clears it.
      undo.disabled = selectedDepth < 1 || !sceneLifecycle.isReady();
      cleanup.disabled = !sceneLifecycle.isReady();
      resetHistory.disabled = !sceneLifecycle.isReady() || entries.length < 1;
    };
    controls.append(undo, cleanup, resetHistory);
    newest.forEach((readiness: any, index: number) => {
      const entry = readiness?.entry || {};
      const row = document.createElement("label");
      row.className = "undo-row-item";
      row.hidden = readiness?.undoable !== true && !showNonUndoableHistory;
      row.title = isAutomaticConsequenceEntry(entry)
        ? `${undoReadinessTitle(readiness)} · Automatica: si annulla insieme all'azione che l'ha causata.`
        : undoReadinessTitle(readiness);
      Object.assign(row.style, { display: "grid", gridTemplateColumns: "auto minmax(0,1fr) auto", alignItems: "center", gap: "7px", padding: "6px 8px", borderRadius: "7px" });
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.style.accentColor = "#2563eb";
      const text = document.createElement("span");
      text.className = "undo-row-label";
      text.textContent = String(entry?.label || "Modifica");
      Object.assign(text.style, { fontSize: "var(--obrt-type-secondary, 11px)", fontWeight: "var(--obrt-weight-medium, 500)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" });
      const state = document.createElement("span");
      state.className = `undo-row-status ${
        readiness?.undoable === true
          ? "undo-status-ready"
          : readiness?.status === HISTORY_UNDO_READINESS_STATUS.CONFLICT
            ? "undo-status-conflict"
            : "undo-status-warning"
      }`;
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
        selectedDepth = checkbox.checked
          ? historyUndoDepthWithCauses(newest, index + 1)
          : historyUndoDepthWithCauses(newest, index, { extend: false });
        refresh();
      });
      row.append(checkbox, text, state);
      rows.push({ checkbox, row });
      list.appendChild(row);
    });
    undo.addEventListener("click", async () => {
      if (undoInProgress || undoCleanupInProgress || undoResetInProgress || selectedDepth < 1 || !sceneLifecycle.isReady()) return;
      const operation = sceneLifecycle.capture({ operationId: sceneOperationId("undo") });
      if (!sceneLifecycle.isCurrent(operation)) return;
      preferredPanel = "undo";
      undoInProgress = true;
      refresh();
      undo.disabled = true;
      cleanup.disabled = true;
      resetHistory.disabled = true;
      try {
        const selectedRow = newest[selectedDepth - 1];
        const selectedIds = newest.slice(0, selectedDepth).map((row: any) => row?.id);
        // Revalidate the exact suffix against the latest scene snapshot.
        // A conflict disables Undo but never deletes or skips an audit entry.
        const currentState = await getHistoryUndoReadiness({
          sceneEpoch: operation.epoch,
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
        console.warn("[history][undo-debug][modal-preflight]", {
          epoch: operation.epoch,
          selectedDepth,
          selectedIds,
          currentIds,
          selectedRow: selectedRow ? { id: selectedRow.id, label: selectedRow.label } : null,
          currentStatus: currentState?.status || null,
          currentReason: currentState?.reason || null,
          chainTokenMatches: currentState?.chainToken === undoState?.chainToken,
          selectionStable,
          currentRow: currentRow ? {
            id: currentRow.id,
            label: currentRow.entry?.label || "",
            status: currentRow.status || null,
            undoable: currentRow.undoable === true,
            reason: currentRow.reason || null,
            conflicts: currentRow.conflicts || [],
          } : null,
        });
        const target = selectionStable ? currentRow?.entry : null;
        if (!target?.id) {
          console.warn("[history][undo-debug][modal-preflight-rejected]", {
            selectedIds,
            currentIds,
            currentStatus: currentState?.status || null,
            currentReason: currentState?.reason || null,
          });
          await onDone("La cronologia è cambiata: aggiorna il pannello prima di riprovare.");
          return;
        }
        const undone = await undoHistoryThrough(target.id, {
          sceneEpoch: operation.epoch,
        });
        if (!sceneLifecycle.isCurrent(operation)) return;
        const outcome = normalizeHistoryUndoResult(undone);
        console.warn("[history][undo-debug][modal-result]", {
          target: { id: target.id, label: target.label },
          status: outcome.status,
          outcome: outcome.outcome,
          committed: outcome.committed,
          reason: outcome.reason || null,
          changedIds: outcome.changedIds || [],
          historyRemovalPending: outcome.historyRemovalPending === true,
          conflicts: outcome.result?.conflicts || outcome.result?.plan?.conflicts || [],
          error: outcome.result?.error || null,
          commitReason: outcome.result?.commitResult?.reason || null,
          postCommitErrors: outcome.result?.postCommitErrors || outcome.result?.commitResult?.postCommitErrors || [],
        });
        if (outcome.outcome === HISTORY_UNDO_OUTCOME.COMMITTED && outcome.historyRemovalPending) {
          await onDone("Annullamento applicato. La rimozione delle voci della cronologia verrà ritentata.");
        } else if (outcome.outcome === HISTORY_UNDO_OUTCOME.COMMITTED) {
          await waitForHistoryEntriesRemoved(
            outcome.entries.map((entry) => entry?.id).filter(Boolean),
            { sceneEpoch: operation.epoch },
          );
          await onDone(outcome.entries.length === 1
            ? `Annullato: ${outcome.entries[0].label}`
            : outcome.entries.length > 1
              ? `Annullate ${outcome.entries.length} azioni.`
              : "Annullamento applicato.");
        } else if (outcome.outcome === HISTORY_UNDO_OUTCOME.CONFLICT) {
          await onDone("Annullamento non applicato: lo stato della scena è cambiato; nessuna modifica è stata scritta.");
        } else if (outcome.outcome === HISTORY_UNDO_OUTCOME.RECOVERY_REQUIRED) {
          await onDone("Annullamento sospeso: è richiesta una verifica o una compensazione manuale; cronologia conservata.");
        } else if (outcome.outcome === HISTORY_UNDO_OUTCOME.REJECTED) {
          await onDone("Annullamento rifiutato o non più valido: nessuna modifica è stata scritta; cronologia conservata.");
        } else if (outcome.outcome === HISTORY_UNDO_OUTCOME.NOOP) {
          await onDone("Nessuna azione annullata: la cronologia è invariata.");
        } else if (outcome.outcome === HISTORY_UNDO_OUTCOME.FAILED) {
          await onDone("Annullamento non applicato: la scena è rimasta nello stato precedente.");
        } else {
          await onDone("Annullamento non applicato: nessuna mutazione committata; cronologia conservata.");
        }
      } catch (error: any) {
        if (!sceneLifecycle.isCurrent(operation)) return;
        console.warn("[history][undo-debug][modal-exception]", {
          name: error?.name || "Error",
          message: error?.message || String(error),
          stack: error?.stack || "",
        });
        await onDone(`Annullamento fallito: ${error?.message || error}`);
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
      if (undoInProgress || undoCleanupInProgress || undoResetInProgress || !sceneLifecycle.isReady()) return;
      const operation = sceneLifecycle.capture({ operationId: sceneOperationId("undo-cleanup") });
      if (!sceneLifecycle.isCurrent(operation)) return;
      preferredPanel = "undo";
      undoCleanupInProgress = true;
      refresh();
      undo.disabled = true;
      cleanup.disabled = true;
      resetHistory.disabled = true;
      try {
        const result = await pruneNonUndoableHistoryEntries({
          sceneEpoch: operation.epoch,
          ownerAttempts: 3,
          ownerRetryDelayMs: 150,
        });
        if (!sceneLifecycle.isCurrent(operation)) return;
        if (result?.committed && result.removedIds?.length) {
          const removed = await waitForHistoryEntriesRemoved(
            result.removedIds,
            { sceneEpoch: operation.epoch },
          );
          if (!sceneLifecycle.isCurrent(operation)) return;
          await onDone(removed
            ? `Pulizia completata: ${result.removedIds.length === 1 ? "rimossa 1 voce incompleta" : `rimosse ${result.removedIds.length} voci incomplete`}.`
            : "Pulizia inviata: la cronologia non si è ancora aggiornata; riprova tra poco.");
        } else if (result?.pendingIds?.length) {
          await onDone("Pulizia non completata: gestore della cronologia non disponibile; riprova tra poco.");
        } else {
          await onDone("Nessuna voce incompleta da rimuovere.");
        }
      } catch (error: any) {
        if (!sceneLifecycle.isCurrent(operation)) return;
        await onDone(`Pulizia della cronologia fallita: ${error?.message || error}`);
      } finally {
        preferredPanel = null;
        undoCleanupInProgress = false;
        if (refreshAfterUndo) {
          refreshAfterUndo = false;
          queueRefresh();
        }
      }
    });
    resetHistory.addEventListener("click", async () => {
      if (undoInProgress || undoCleanupInProgress || undoResetInProgress || !sceneLifecycle.isReady()) return;
      const confirmed = window.confirm(
        "Azzerare tutta la cronologia? Questa operazione non modifica la scena né il registro combattimento e non può essere annullata.",
      );
      if (!confirmed) return;
      const operation = sceneLifecycle.capture({ operationId: sceneOperationId("undo-reset") });
      if (!sceneLifecycle.isCurrent(operation)) return;
      preferredPanel = "undo";
      undoResetInProgress = true;
      refresh();
      undo.disabled = true;
      cleanup.disabled = true;
      resetHistory.disabled = true;
      try {
        await requestHistoryOwnerClear({
          sceneEpoch: operation.epoch,
          commandId: `history-clear:${operation.operationId || sceneOperationId("undo-reset-owner")}`,
          correlationId: operation.operationId || "",
        });
        if (!sceneLifecycle.isCurrent(operation)) return;
        showNonUndoableHistory = false;
        await onDone("Cronologia azzerata. La scena e il registro combattimento non sono stati modificati.");
      } catch (error: any) {
        if (!sceneLifecycle.isCurrent(operation)) return;
        await onDone(`Azzeramento della cronologia fallito: ${error?.message || error}`);
      } finally {
        preferredPanel = null;
        undoResetInProgress = false;
        if (refreshAfterUndo) {
          refreshAfterUndo = false;
          queueRefresh();
        }
      }
    });
    refresh();
  }
  panel.append(controls, list);
  return panel;
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
    getHistoryUndoReadiness({ sceneEpoch: operation.epoch }),
    listCombatLogSessions({ sceneEpoch: operation.epoch, includeStats: true }),
  ]);
  if (!sceneLifecycle.isCurrent(operation)) return;
  const presentation = buildCombatLogPresentation(session, events);
  const sessionSummary = presentation.sessionSummary;
  const combatLogEnabled = isCombatLogEventSinkEnabled();
  statusMessage = message;

  const shell = document.createElement("main");
  shell.className = "history-shell history-panel";
  shell.dataset.combatLogSessionId = String(session?.id || "");

  // Fixed top header with drag handle
  const header = document.createElement("header");
  header.className = "history-header";
  header.setAttribute("data-drag-handle", "1");
  header.draggable = true;
  header.title = "Trascina per spostare";

  const titles = document.createElement("div");
  titles.className = "history-header-titles";
  const title = document.createElement("h1");
  title.className = "history-title";
  title.textContent = session?.name || "Registro combattimento";
  titles.append(title);

  const close = document.createElement("button");
  close.type = "button";
  close.className = "history-close-btn";
  close.textContent = "×";
  close.title = "Chiudi";
  close.setAttribute("aria-label", "Chiudi");
  close.addEventListener("click", closeHistoryPopover);
  header.append(titles, close);

  // Tab switch bar
  const tabsBar = document.createElement("div");
  tabsBar.className = "history-tabs-bar";
  const tabSwitch = document.createElement("div");
  tabSwitch.className = "history-tab-switch";
  tabSwitch.setAttribute("role", "tablist");
  tabSwitch.setAttribute("aria-label", "Sezioni");

  const tabLogBtn = document.createElement("button");
  tabLogBtn.type = "button";
  tabLogBtn.className = "history-tab-btn";
  tabLogBtn.dataset.tab = "log";
  tabLogBtn.setAttribute("role", "tab");
  tabLogBtn.setAttribute("aria-selected", String(activeTab === "log"));
  const tabLogText = document.createElement("span");
  tabLogText.textContent = "Registro";
  const tabLogBadge = document.createElement("span");
  tabLogBadge.className = "history-tab-badge";
  tabLogBadge.textContent = String(combatLogPageState.totalCount || sessionSummary.totalEvents || 0);
  tabLogBtn.append(tabLogText, tabLogBadge);

  const undoEntries = Array.isArray(undoState?.rows) ? undoState.rows : [];
  const undoableCount = undoEntries.filter((row: any) => row?.undoable === true).length;
  const tabUndoBtn = document.createElement("button");
  tabUndoBtn.type = "button";
  tabUndoBtn.className = "history-tab-btn";
  tabUndoBtn.dataset.tab = "undo";
  tabUndoBtn.setAttribute("role", "tab");
  tabUndoBtn.setAttribute("aria-selected", String(activeTab === "undo"));
  const tabUndoText = document.createElement("span");
  tabUndoText.textContent = "Cronologia";
  const tabUndoBadge = document.createElement("span");
  tabUndoBadge.className = "history-tab-badge";
  tabUndoBadge.textContent = String(undoableCount);
  tabUndoBtn.append(tabUndoText, tabUndoBadge);

  tabSwitch.append(tabLogBtn, tabUndoBtn);
  tabsBar.appendChild(tabSwitch);

  // Secondary Session Toolbar in Log
  const sessionBar = document.createElement("div");
  sessionBar.className = "session-bar";

  const sessionBarLeft = document.createElement("div");
  sessionBarLeft.className = "session-bar-left";

  const sessionPicker = document.createElement("select");
  sessionPicker.className = "session-select";
  sessionPicker.title = "Apri o riprendi un registro archiviato";
  for (const candidate of sessions) {
    const option = document.createElement("option");
    option.value = candidate.id;
    option.textContent = candidate.name;
    option.selected = candidate.id === session?.id;
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
  sessionBarLeft.appendChild(sessionPicker);

  const sessionBarActions = document.createElement("div");
  sessionBarActions.className = "session-bar-actions";
  const exportText = button("Esporta TXT", "default", "log-export.svg");
  const exportJson = button("Esporta JSON", "default", "log-export.svg");
  const importJson = button("Importa JSON");
  const storageStats = button("Statistiche archivio");
  const retention = button("Conservazione…");
  const newSession = button("Nuovo registro", "default", "log-new.svg", true);
  const clearLog = button("Svuota eventi", "default", "log-clear.svg");
  const deleteLog = button("Elimina registro", "danger", "log-delete.svg");
  const snapshotJson = button("Snapshot JSON", "default", "log-snapshot.svg");
  const snapshotPng = button("Mappa PNG", "default", "log-snapshot.svg");
  const snapshotSvg = button("Mappa SVG", "default", "log-snapshot.svg");
  const importFile = document.createElement("input");
  importFile.type = "file";
  importFile.accept = ".json,application/json";
  importFile.hidden = true;
  exportText.title = "Esporta il registro in formato testo";
  exportJson.title = "Esporta il registro in formato JSON";
  newSession.title = "Crea un nuovo registro e archivia quello corrente";
  if (!combatLogEnabled || !sceneLifecycle.isReady()) {
    newSession.disabled = true;
    newSession.title = "Riattiva il registro combattimento dalle Opzioni per crearne uno nuovo";
  }
  clearLog.title = "Rimuove gli eventi ma mantiene il registro nella lista";
  deleteLog.title = "Elimina definitivamente il registro selezionato";
  const exportCandidates = session?.id && !sessions.some((candidate: any) => candidate.id === session.id)
    ? [session, ...sessions]
    : sessions;
  if (!exportCandidates.some((candidate: any) => candidate.id === combatLogExportSessionId)) {
    combatLogExportSessionId = session?.id || "";
  }
  const exportTarget = document.createElement("select");
  exportTarget.className = "session-select";
  exportTarget.title = "Il registro da esportare: quello corrente o uno archiviato, senza riprenderlo";
  exportTarget.setAttribute("aria-label", "Registro da esportare");
  for (const candidate of exportCandidates) {
    const option = document.createElement("option");
    option.value = candidate.id;
    option.textContent = candidate.id === session?.id ? `${candidate.name} (corrente)` : candidate.name;
    option.selected = candidate.id === combatLogExportSessionId;
    exportTarget.appendChild(option);
  }
  exportTarget.disabled = !exportCandidates.length || combatLogStorageAction;
  const exportTargetField = document.createElement("label");
  Object.assign(exportTargetField.style, { display: "grid", gap: "2px", fontSize: "10px", color: "var(--obrt-muted)" });
  exportTargetField.append(document.createTextNode("Da esportare"), exportTarget);
  const exportSession = () => exportCandidates.find((candidate: any) => candidate.id === combatLogExportSessionId) || session;
  // The current registro is exported once it has events; an archived one whenever it is chosen.
  const syncExportButtons = () => {
    const current = !combatLogExportSessionId || combatLogExportSessionId === session?.id;
    const blocked = !exportSession()?.id || combatLogStorageAction || (current && combatLogPageState.totalCount < 1);
    exportText.disabled = blocked;
    exportJson.disabled = blocked;
  };
  exportTarget.addEventListener("change", () => {
    combatLogExportSessionId = exportTarget.value;
    syncExportButtons();
  });
  syncExportButtons();
  importJson.disabled = combatLogStorageAction || !sceneLifecycle.isReady();
  storageStats.disabled = combatLogStorageAction || !sceneLifecycle.isReady();
  retention.disabled = combatLogStorageAction || !sceneLifecycle.isReady();
  clearLog.disabled = !session?.id || !events.length || !sceneLifecycle.isReady();
  deleteLog.disabled = !session?.id || !sceneLifecycle.isReady();
  exportText.addEventListener("click", async () => {
    const target = exportSession();
    if (combatLogStorageAction || !target?.id) return;
    combatLogStorageAction = true;
    try {
      const data = await getCombatLogExportData(target.id, { sceneEpoch: operation.epoch });
      if (!data) return;
      download(
        `${safeFileName(target.name)}.txt`,
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
    const target = exportSession();
    if (combatLogStorageAction || !target?.id) return;
    combatLogStorageAction = true;
    try {
      const content = await exportCombatLogJSONFromStorage(target.id, { sceneEpoch: operation.epoch });
      if (content) download(`${safeFileName(target.name)}.json`, content, "application/json;charset=utf-8");
    } catch (error: any) {
      await renderAfterStorageAction(`Esportazione fallita: ${error?.message || error}`);
    } finally {
      combatLogStorageAction = false;
    }
  });
  importJson.addEventListener("click", () => {
    if (!combatLogStorageAction && sceneLifecycle.isReady()) importFile.click();
  });
  snapshotJson.title = "Fotografa lo stato del combattimento: lo aggiunge al registro e scarica il JSON";
  snapshotPng.title = "Immagine schematica del tabellone; lo sfondo è incluso solo se il suo host lo permette (CORS)";
  snapshotSvg.title = "Immagine schematica vettoriale; lo sfondo della mappa è collegato per URL";
  for (const control of [snapshotJson, snapshotPng, snapshotSvg]) {
    control.disabled = combatLogStorageAction || !sceneLifecycle.isReady();
  }
  const runSnapshotAction = async (kind: "json" | "png" | "svg") => {
    if (combatLogStorageAction || !sceneLifecycle.isReady()) return;
    const snapshotOperation = sceneLifecycle.capture({ operationId: sceneOperationId(`snapshot-${kind}`) });
    if (!sceneLifecycle.isCurrent(snapshotOperation)) return;
    combatLogStorageAction = true;
    try {
      // Loaded on demand: the snapshot pulls in the class-feature catalog.
      const [
        { captureCombatSnapshot, recordCombatSnapshotInLog, renderCombatSnapshotPng },
        { buildCombatSnapshotSvg, combatSnapshotFileName },
      ] = await Promise.all([import("./combatSnapshot.js"), import("./combatSnapshotCore.js")]);
      const snapshot = await captureCombatSnapshot({ sceneEpoch: snapshotOperation.epoch });
      if (!snapshot || !sceneLifecycle.isCurrent(snapshotOperation)) return;
      if (kind === "json") {
        const recorded = await recordCombatSnapshotInLog(snapshot, { sceneEpoch: snapshotOperation.epoch });
        download(combatSnapshotFileName(snapshot, "json"), JSON.stringify(snapshot, null, 2), "application/json;charset=utf-8");
        await renderAfterStorageAction(recorded?.length
          ? `Snapshot del round ${snapshot.round} salvato nel registro e scaricato.`
          : `Snapshot del round ${snapshot.round} scaricato (registro combattimento non attivo: nessuna voce aggiunta).`);
        return;
      }
      const svg = buildCombatSnapshotSvg(snapshot);
      if (kind === "svg") {
        download(combatSnapshotFileName(snapshot, "svg"), svg, "image/svg+xml;charset=utf-8");
        await renderAfterStorageAction("Mappa SVG scaricata: lo sfondo è collegato per URL e serve la connessione per vederlo.");
        return;
      }
      const png = await renderCombatSnapshotPng(snapshot);
      if (!png) {
        download(combatSnapshotFileName(snapshot, "svg"), svg, "image/svg+xml;charset=utf-8");
        await renderAfterStorageAction("Il browser non ha potuto creare il PNG: scaricata la mappa in SVG.");
        return;
      }
      downloadBlob(combatSnapshotFileName(snapshot, "png"), png.blob);
      await renderAfterStorageAction(png.backgrounds.blocked
        ? "Mappa PNG scaricata senza sfondo: l'host dell'immagine non consente la lettura (CORS). Usa Mappa SVG per lo sfondo."
        : png.backgrounds.drawn
          ? "Mappa PNG scaricata con lo sfondo."
          : "Mappa PNG scaricata (nessuno sfondo sulla scena).");
    } catch (error: any) {
      await renderAfterStorageAction(`Snapshot fallito: ${error?.message || error}`);
    } finally {
      combatLogStorageAction = false;
    }
  };
  snapshotJson.addEventListener("click", () => void runSnapshotAction("json"));
  snapshotPng.addEventListener("click", () => void runSnapshotAction("png"));
  snapshotSvg.addEventListener("click", () => void runSnapshotAction("svg"));
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
      // The action ends before its result is drawn (lot L20): drawn while it was running, every button stayed disabled.
      if (!stats) {
        await renderAfterStorageAction("Statistiche dell'archivio non disponibili.");
        return;
      }
      await renderAfterStorageAction(`Archivio locale: ${countText(stats.sessionCount, "registro", "registri")}, ${countText(stats.eventCount, "evento", "eventi")} (${countText(stats.importedSessionCount, "importato", "importati")}).`);
    } catch (error: any) {
      await renderAfterStorageAction(`Statistiche dell'archivio non disponibili: ${error?.message || error}`);
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
        `Anteprima conservazione: eliminare ${countText(preview.sessionCount, "registro", "registri")} e ${countText(preview.eventCount, "evento", "eventi")}? Questa azione è definitiva.`,
      );
      if (!confirmed) {
        await renderAfterStorageAction("Conservazione annullata: nessun registro eliminato.");
        return;
      }
      const result = await pruneCombatLogRetention({ keepLastN, sceneEpoch: retentionOperation.epoch });
      if (!sceneLifecycle.isCurrent(retentionOperation)) return;
      await renderAfterStorageAction(result?.failed?.length
        ? `Conservazione parziale: eliminati ${result.deletedIds.length}, falliti ${result.failed.length}.`
        : `Conservazione completata: ${(result?.deletedIds?.length || 0) === 1 ? "eliminato 1 registro" : `eliminati ${result?.deletedIds?.length || 0} registri`}.`);
    } catch (error: any) {
      await renderAfterStorageAction(`Conservazione fallita: ${error?.message || error}`);
    } finally {
      combatLogStorageAction = false;
    }
  });
  newSession.addEventListener("click", async () => {
    if (!sceneLifecycle.isReady()) return;
    if (!isCombatLogEventSinkEnabled()) {
      await scheduleRender("Registro combattimento disattivato: nessun nuovo registro creato.");
      return;
    }
    if (events.length && !window.confirm("Creare un nuovo registro? Quello corrente resterà archiviato nel browser.")) return;
    // Annulla on the name creates nothing (lot L19): it archived the current registro all the same.
    const typedName = window.prompt("Nome del nuovo combattimento:", "");
    if (typedName === null) return;
    const name = typedName;
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
  sessionBarActions.append(
    newSession,
    toolbarMenu("Snapshot del combattimento", "log-snapshot.svg", [snapshotJson, snapshotPng, snapshotSvg]),
    toolbarMenu("Esporta/importa", "log-export.svg", [exportTargetField, exportText, exportJson, importJson]),
    toolbarMenu("Gestisci registro", "log-more.svg", [clearLog, deleteLog, storageStats, retention]),
    importFile,
  );
  sessionBar.append(sessionBarLeft, sessionBarActions);

  const clearConfirmation = document.createElement("div");
  clearConfirmation.className = "history-confirmation-banner";
  clearConfirmation.style.display = "none";
  const clearQuestion = document.createElement("strong");
  clearQuestion.textContent = "Cancellare definitivamente tutte le voci del registro corrente?";
  const clearActions = document.createElement("div");
  Object.assign(clearActions.style, { display: "flex", flex: "0 0 auto", gap: "5px" });
  const cancelClear = button("Annulla");
  const confirmClear = button("Cancella definitivamente", "danger");
  clearActions.append(cancelClear, confirmClear);
  clearConfirmation.append(clearQuestion, clearActions);
  const showClearConfirmation = (open: boolean) => {
    combatLogUiState.confirmingClearSessionId = open ? String(session?.id || "") : "";
    clearConfirmation.style.display = open ? "flex" : "none";
    clearLog.disabled = open;
  };
  if (session?.id && combatLogUiState.confirmingClearSessionId === String(session.id) && !clearLog.disabled) showClearConfirmation(true);
  clearLog.addEventListener("click", () => {
    if (!sceneLifecycle.isReady()) return;
    showClearConfirmation(true);
  });
  cancelClear.addEventListener("click", () => {
    showClearConfirmation(false);
  });
  confirmClear.addEventListener("click", async () => {
    if (!sceneLifecycle.isReady()) return;
    const operation = sceneLifecycle.capture({ operationId: sceneOperationId("clear-log") });
    if (!sceneLifecycle.isCurrent(operation)) return;
    confirmClear.disabled = true;
    cancelClear.disabled = true;
    combatLogUiState.confirmingClearSessionId = "";
    try {
      await clearCombatLogSession(session?.id, { sceneEpoch: operation.epoch });
      if (!sceneLifecycle.isCurrent(operation)) return;
      await scheduleRender("Registro cancellato. La cronologia non è stata modificata.", { pageRequest: null });
    } catch (error: any) {
      await scheduleRender(`Cancellazione fallita: ${error?.message || error}`, { pageRequest: null });
    }
  });

  const deleteConfirmation = document.createElement("div");
  deleteConfirmation.className = "history-confirmation-banner";
  deleteConfirmation.style.display = "none";
  const deleteQuestion = document.createElement("strong");
  deleteQuestion.textContent = "Eliminare definitivamente questo registro dalla lista?";
  const deleteActions = document.createElement("div");
  Object.assign(deleteActions.style, { display: "flex", flex: "0 0 auto", gap: "5px" });
  const cancelDelete = button("Annulla");
  const confirmDelete = button("Elimina registro", "danger");
  deleteActions.append(cancelDelete, confirmDelete);
  deleteConfirmation.append(deleteQuestion, deleteActions);
  const showDeleteConfirmation = (open: boolean) => {
    combatLogUiState.confirmingDeleteSessionId = open ? String(session?.id || "") : "";
    deleteConfirmation.style.display = open ? "flex" : "none";
    deleteLog.disabled = open;
  };
  if (session?.id && combatLogUiState.confirmingDeleteSessionId === String(session.id) && !deleteLog.disabled) showDeleteConfirmation(true);
  deleteLog.addEventListener("click", () => {
    if (!sceneLifecycle.isReady()) return;
    showDeleteConfirmation(true);
  });
  cancelDelete.addEventListener("click", () => {
    showDeleteConfirmation(false);
  });
  confirmDelete.addEventListener("click", async () => {
    if (!sceneLifecycle.isReady()) return;
    const operation = sceneLifecycle.capture({ operationId: sceneOperationId("delete-log") });
    if (!sceneLifecycle.isCurrent(operation)) return;
    confirmDelete.disabled = true;
    cancelDelete.disabled = true;
    combatLogUiState.confirmingDeleteSessionId = "";
    try {
      await deleteCombatLogSession(session?.id, { sceneEpoch: operation.epoch });
      if (!sceneLifecycle.isCurrent(operation)) return;
      await scheduleRender("Registro eliminato dalla lista.", { pageRequest: null });
    } catch (error: any) {
      await scheduleRender(`Eliminazione fallita: ${error?.message || error}`, { pageRequest: null });
    }
  });

  const filters = document.createElement("div");
  filters.className = "history-filters";
  const filterField = (labelText: string, control: HTMLInputElement | HTMLSelectElement) => {
    const field = document.createElement("label");
    field.className = "history-filter-field";
    field.htmlFor = control.id;
    const label = document.createElement("span");
    label.textContent = labelText;
    field.append(label, control);
    return field;
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
  noteForm.className = "history-note-bar";
  const note = document.createElement("input");
  note.type = "text";
  note.disabled = !combatLogEnabled || !sceneLifecycle.isReady();
  note.placeholder = "Aggiungi una nota manuale al combattimento…";
  // The note being typed and its focus outlive the rebuilds an item change triggers.
  note.dataset.combatLogControl = "note";
  note.value = combatLogUiState.noteDraft;
  note.addEventListener("input", () => { combatLogUiState.noteDraft = note.value; });
  const addNote = button("Aggiungi nota", "primary", "log-note.svg");
  addNote.disabled = !combatLogEnabled || !sceneLifecycle.isReady();
  noteForm.append(note, addNote);
  noteForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!note.value.trim()) return;
    if (!sceneLifecycle.isReady()) return;
    if (!isCombatLogEventSinkEnabled()) {
      await scheduleRender("Registro combattimento disattivato: nota non registrata.");
      return;
    }
    addNote.disabled = true;
    const operation = sceneLifecycle.capture({ operationId: sceneOperationId("note") });
    if (!sceneLifecycle.isCurrent(operation)) return;
    const created = await addCombatLogNote(note.value, { sceneEpoch: operation.epoch });
    if (!sceneLifecycle.isCurrent(operation)) return;
    if (created.length) combatLogUiState.noteDraft = "";
    await scheduleRender(created.length ? "Nota aggiunta." : "Registro combattimento disattivato: nota non registrata.");
  });

  const status = document.createElement("div");
  status.className = "history-status-bar";
  status.setAttribute("aria-live", "polite");
  status.textContent = combatLogEnabled
    ? (message || "Il registro non viene modificato dagli annullamenti: viene aggiunta una voce di annullamento.")
    : (message
      ? `${message} Registro combattimento disattivato: cronologia e sessioni esistenti restano disponibili.`
      : "Registro combattimento disattivato: cronologia e sessioni esistenti restano disponibili.");

  const timeline = document.createElement("section");
  timeline.className = "history-timeline-scroll";
  timeline.dataset.combatLogTimeline = "true";
  timeline.setAttribute("aria-label", "Timeline del registro combattimento");

  const projectionSummary = document.createElement("div");
  projectionSummary.setAttribute("aria-live", "polite");

  const pageControls = document.createElement("div");
  pageControls.className = "history-page-actions";
  const loadOlder = button("Carica eventi precedenti");
  const loadAll = button("Carica tutto");
  loadOlder.dataset.combatLogControl = "load-older";
  loadAll.dataset.combatLogControl = "load-all";
  loadOlder.title = "Aggiunge la pagina precedente senza rimuovere gli eventi già caricati";
  loadAll.title = "Carica tutti gli eventi per applicare i filtri sull'intero registro";
  const loadedEventCount = combatLogPageState.events.size;
  const isPartial = combatLogPageState.totalCount > loadedEventCount;
  loadOlder.disabled = !combatLogPageState.hasOlder || combatLogPageLoading || combatLogStorageAction;
  loadAll.disabled = combatLogPageState.totalCount <= loadedEventCount || combatLogPageLoading || combatLogStorageAction;
  loadOlder.style.display = combatLogPageState.hasOlder ? "inline-flex" : "none";
  loadAll.style.display = isPartial ? "inline-flex" : "none";
  const pageHint = document.createElement("span");
  pageHint.dataset.combatLogPageHint = "true";
  pageHint.textContent = isPartial ? "Filtri sulla pagina caricata" : "";
  pageHint.setAttribute("aria-live", "polite");
  pageHint.style.display = isPartial ? "inline" : "none";
  Object.assign(pageHint.style, { color: "var(--obrt-muted)", fontSize: "var(--obrt-type-micro, 9px)", overflowWrap: "anywhere" });
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

  const compact = (control: HTMLButtonElement) => {
    Object.assign(control.style, { minHeight: "24px", height: "24px", padding: "0 8px", borderRadius: "7px", fontSize: "var(--obrt-type-caption, 10px)" });
    return control;
  };
  const selectToggle = compact(button(combatLogUiState.selecting ? "Fine" : "Seleziona", combatLogUiState.selecting ? "primary" : "default"));
  selectToggle.dataset.combatLogControl = "select-mode";
  selectToggle.title = combatLogUiState.selecting ? "Esci dalla selezione" : "Seleziona più voci da eliminare insieme";
  selectToggle.setAttribute("aria-pressed", String(combatLogUiState.selecting));
  selectToggle.style.marginLeft = "auto";
  selectToggle.disabled = !session?.id || !sceneLifecycle.isReady();

  const projectionRow = document.createElement("div");
  projectionRow.className = "history-projection-row";
  projectionRow.append(pageControls, projectionSummary, selectToggle);

  // Selection bar: count, all/none of the visible entries, delete with an inline confirmation.
  const selectionBar = document.createElement("div");
  selectionBar.className = "history-selection-bar";
  selectionBar.dataset.combatLogControl = "selection-bar";
  selectionBar.hidden = !combatLogUiState.selecting;
  const selectionCount = document.createElement("span");
  selectionCount.className = "history-selection-count";
  const selectAll = compact(button("Tutti"));
  selectAll.title = "Seleziona tutte le voci visibili";
  const selectNone = compact(button("Nessuno"));
  selectNone.title = "Deseleziona tutto";
  const deleteSelected = compact(button("Elimina", "danger", "log-delete.svg"));
  deleteSelected.dataset.combatLogControl = "delete-selected";
  const deleteSelectedConfirm = compact(button("Conferma", "danger"));
  const deleteSelectedCancel = compact(button("Annulla", "default", "", true));
  deleteSelectedCancel.textContent = "✕";
  deleteSelectedCancel.title = "Annulla";
  Object.assign(deleteSelectedCancel.style, { width: "24px", minWidth: "24px", padding: "0" });
  deleteSelectedConfirm.hidden = true;
  deleteSelectedCancel.hidden = true;
  deleteSelected.style.marginLeft = "auto";
  selectionBar.append(selectionCount, selectAll, selectNone, deleteSelected, deleteSelectedConfirm, deleteSelectedCancel);

  const setDeleteSelectedConfirming = (confirming: boolean, focus = true) => {
    combatLogUiState.confirmingSelectionDelete = confirming;
    deleteSelected.hidden = confirming;
    deleteSelectedConfirm.hidden = !confirming;
    deleteSelectedCancel.hidden = !confirming;
    if (confirming && focus) deleteSelectedConfirm.focus();
  };
  const syncSelectionBar = () => {
    const count = combatLogUiState.selectedEvents.size;
    const busy = combatLogStorageAction || combatLogPageLoading || !sceneLifecycle.isReady();
    selectionCount.textContent = count === 1 ? "1 voce selezionata" : `${count} voci selezionate`;
    deleteSelected.disabled = busy || count === 0;
    deleteSelectedConfirm.disabled = busy || count === 0;
    const label = deleteSelected.querySelector("[data-button-label]");
    if (label) label.textContent = count ? `Elimina ${count}` : "Elimina";
    deleteSelectedConfirm.textContent = `Elimina ${count} ${count === 1 ? "voce" : "voci"}`;
    setDeleteSelectedConfirming(combatLogUiState.selecting && count > 0 && combatLogUiState.confirmingSelectionDelete, false);
  };
  const toggleEventSelection = (event: any, selected: boolean) => {
    const id = String(event?.id || "");
    if (!id) return;
    if (selected) combatLogUiState.selectedEvents.add(id);
    else combatLogUiState.selectedEvents.delete(id);
    syncSelectionBar();
  };
  const rerenderKeepingScroll = () => {
    const previousScrollTop = timeline.scrollTop;
    renderTimeline();
    timeline.scrollTop = previousScrollTop;
  };
  selectToggle.addEventListener("click", () => {
    combatLogUiState.selecting = !combatLogUiState.selecting;
    combatLogUiState.selectedEvents.clear();
    combatLogUiState.confirmingSelectionDelete = false;
    combatLogUiState.confirmDeleteEventId = "";
    void scheduleRender();
  });
  selectAll.addEventListener("click", () => {
    for (const row of timeline.querySelectorAll<HTMLElement>("[data-event-id]")) {
      if (row.dataset.eventId) combatLogUiState.selectedEvents.add(row.dataset.eventId);
    }
    rerenderKeepingScroll();
  });
  selectNone.addEventListener("click", () => {
    combatLogUiState.selectedEvents.clear();
    rerenderKeepingScroll();
  });
  deleteSelected.addEventListener("click", () => setDeleteSelectedConfirming(true));
  deleteSelectedCancel.addEventListener("click", () => {
    setDeleteSelectedConfirming(false);
    deleteSelected.focus();
  });
  selectionBar.addEventListener("keydown", (key: KeyboardEvent) => {
    if (key.key !== "Escape" || deleteSelectedConfirm.hidden) return;
    key.preventDefault();
    key.stopPropagation();
    setDeleteSelectedConfirming(false);
    deleteSelected.focus();
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

  // A row of the log is one stored event, or a movement total made of several (sourceEventIds).
  const storedEventIds = (event: any): string[] => (
    Array.isArray(event?.sourceEventIds)
      ? event.sourceEventIds.map((id: any) => String(id || "").trim()).filter(Boolean)
      : [String(event?.id || "").trim()].filter(Boolean)
  );
  const storedEventIdsForRows = (rowIds: string[]): string[] => {
    const byId = new Map((presentation?.events || []).map((event: any) => [String(event?.id || ""), event]));
    return [...new Set(rowIds.flatMap((id) => (byId.has(id) ? storedEventIds(byId.get(id)) : [id])))];
  };

  const deleteEvent = async (event: any) => {
    if (combatLogStorageAction || combatLogPageLoading || !sceneLifecycle.isCurrent(operation)) return;
    combatLogStorageAction = true;
    syncCombatLogPageControls();
    let resultMessage = "";
    try {
      const sourceIds = storedEventIds(event);
      const deleted = Array.isArray(event?.sourceEventIds)
        ? (await deleteCombatLogEvents(session?.id, sourceIds, { sceneEpoch: operation.epoch })).length > 0
        : await deleteCombatLogEvent(session?.id, event?.id, { sceneEpoch: operation.epoch });
      if (!sceneLifecycle.isCurrent(operation)) return;
      combatLogUiState.confirmDeleteEventId = "";
      if (deleted) combatLogUiState.expandedEvents.delete(String(event?.id || ""));
      resultMessage = deleted
        ? "Evento eliminato dal registro. La scena e la cronologia non sono state modificate."
        : "L'evento non è più presente nel registro.";
    } catch (error: any) {
      resultMessage = `Eliminazione evento fallita: ${error?.message || error}`;
    } finally {
      combatLogStorageAction = false;
      if (sceneLifecycle.isCurrent(operation)) await scheduleRender(resultMessage);
    }
  };

  deleteSelectedConfirm.addEventListener("click", async () => {
    const ids = [...combatLogUiState.selectedEvents];
    if (!ids.length || combatLogStorageAction || combatLogPageLoading || !sceneLifecycle.isCurrent(operation)) return;
    combatLogStorageAction = true;
    syncCombatLogPageControls();
    syncSelectionBar();
    let resultMessage = "";
    try {
      const deletedIds = await deleteCombatLogEvents(session?.id, storedEventIdsForRows(ids), { sceneEpoch: operation.epoch });
      if (!sceneLifecycle.isCurrent(operation)) return;
      const deletedSet = new Set(deletedIds);
      // The rows gone: a movement total goes with the events it is made of.
      const deletedRows = ids.filter((id) => storedEventIdsForRows([id]).some((sourceId) => deletedSet.has(sourceId)));
      for (const id of deletedRows) {
        combatLogUiState.expandedEvents.delete(id);
        combatLogUiState.selectedEvents.delete(id);
      }
      if (deletedRows.length) combatLogUiState.selecting = false;
      resultMessage = deletedRows.length
        ? `${deletedRows.length === 1 ? "1 evento eliminato" : `${deletedRows.length} eventi eliminati`} dal registro. La scena e la cronologia non sono state modificate.`
        : "Gli eventi selezionati non sono più presenti nel registro.";
    } catch (error: any) {
      resultMessage = `Eliminazione eventi fallita: ${error?.message || error}`;
    } finally {
      combatLogStorageAction = false;
      if (sceneLifecycle.isCurrent(operation)) await scheduleRender(resultMessage);
    }
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
      : " (filtrati)";
    const loadedSuffix = combatLogPageState.totalCount > events.length
      ? ` (${events.length} su ${combatLogPageState.totalCount} caricati)`
      : "";
    const timelineWindow = getCombatLogTimelineWindow(
      filteredPresentation.events,
      combatLogTimelineVisibleLimit,
    );
    const visibleEvents = timelineWindow.events;
    const visibleEventIds = new Set(visibleEvents.map((event) => String(event?.id || "")));
    // Only visible entries can stay selected: a filter never deletes what the GM cannot see.
    for (const id of [...combatLogUiState.selectedEvents]) {
      if (!visibleEventIds.has(id)) combatLogUiState.selectedEvents.delete(id);
    }
    syncSelectionBar();
    const visibleSuffix = timelineWindow.hasMore
      ? ` · ${visibleEvents.length} più recenti`
      : "";
    projectionSummary.textContent = [
      `${countText(filteredPresentation.events.length, "evento", "eventi")}${filterSuffix}${visibleSuffix}${loadedSuffix}`,
      `${sessionSummary.roundCount} round`,
      countText(sessionSummary.turnCount, "turno", "turni"),
      countText(sessionSummary.participantCount, "partecipante", "partecipanti"),
    ].join(" · ");

    if (!filteredPresentation.events.length) {
      const empty = document.createElement("div");
      empty.textContent = !presentation.sessionSummary.hasSession
        ? "Nessun registro attivo. Il primo evento registrabile creerà una sessione."
        : presentation.events.length
          ? "Nessun evento corrisponde ai filtri."
          : "Il registro è vuoto. Le prossime operazioni verranno registrate qui.";
      Object.assign(empty.style, { padding: "18px", textAlign: "center", color: "var(--obrt-muted)", overflowWrap: "anywhere" });
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
      roundSummary.textContent = `Round ${round.round} · ${countText(visibleTurns.reduce((total, turn) => total + turn.events.length, 0), "evento", "eventi")} · ${countText(visibleTurns.length, "turno", "turni")}`;
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
        for (const event of [...turn.events].reverse()) {
          const selection = combatLogUiState.selecting
            ? {
              active: true,
              selected: combatLogUiState.selectedEvents.has(String(event?.id || "")),
              onToggle: toggleEventSelection,
            }
            : null;
          turnBody.appendChild(makeEventRow(event, deleteEvent, selection));
        }
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

  const logPanel = document.createElement("div");
  logPanel.className = "history-tab-panel";
  logPanel.dataset.panel = "log";
  logPanel.hidden = activeTab !== "log";
  Object.assign(logPanel.style, {
    display: activeTab === "log" ? "flex" : "none",
    flexDirection: "column",
    flex: "1 1 auto",
    minHeight: "0",
    overflow: "hidden",
  });

  logPanel.append(sessionBar, clearConfirmation, deleteConfirmation, filters, projectionRow, selectionBar, timeline, noteForm, status);

  const undoPanel = makeUndoPanel(undoState, async (undoMessage) => scheduleRender(undoMessage));
  Object.assign(undoPanel.style, {
    display: activeTab === "undo" ? "flex" : "none",
    flexDirection: "column",
    flex: "1 1 auto",
    minHeight: "0",
    overflow: "hidden",
  });

  tabLogBtn.addEventListener("click", () => {
    activeTab = "log";
    tabLogBtn.setAttribute("aria-selected", "true");
    tabUndoBtn.setAttribute("aria-selected", "false");
    logPanel.hidden = false;
    logPanel.style.display = "flex";
    undoPanel.hidden = true;
    undoPanel.style.display = "none";
  });
  tabUndoBtn.addEventListener("click", () => {
    activeTab = "undo";
    tabLogBtn.setAttribute("aria-selected", "false");
    tabUndoBtn.setAttribute("aria-selected", "true");
    logPanel.hidden = true;
    logPanel.style.display = "none";
    undoPanel.hidden = false;
    undoPanel.style.display = "flex";
  });

  shell.append(header, tabsBar, logPanel, undoPanel);
  app.replaceChildren(shell);
  restoreCombatLogUiState(app);
  syncCombatLogPageControls();
  syncHistoryPendingReadinessRefresh(undoState, operation);
}

async function renderAfterStorageAction(message: string) {
  combatLogStorageAction = false;
  return scheduleRender(message);
}

function clearHistoryPendingReadinessRefresh() {
  if (historyPendingReadinessTimer === null) return;
  window.clearTimeout(historyPendingReadinessTimer);
  historyPendingReadinessTimer = null;
}

function syncHistoryPendingReadinessRefresh(undoState: any, operation: any) {
  clearHistoryPendingReadinessRefresh();
  if (!shouldAutoRefreshHistoryUndoReadiness(undoState)) return;
  if (!sceneLifecycle.isCurrent(operation)) return;

  // HISTORY_CHANGE_CHANNEL can arrive while the background still owns a
  // pending History append/removal. When that operation settles there may be
  // no second broadcast, leaving the modal stuck behind a transient History
  // barrier until reload. Recheck only while that barrier is visible.
  historyPendingReadinessTimer = window.setTimeout(() => {
    historyPendingReadinessTimer = null;
    if (!sceneLifecycle.isCurrent(operation)) return;
    if (undoInProgress || undoCleanupInProgress || undoResetInProgress) {
      refreshAfterUndo = true;
      return;
    }
    void scheduleRender().catch(() => {});
  }, HISTORY_PENDING_READINESS_RECHECK_MS);
}

function queueRefresh() {
  if (!sceneLifecycle.isReady()) return;
  if (undoInProgress || undoCleanupInProgress || undoResetInProgress) {
    refreshAfterUndo = true;
    return;
  }
  if (refreshQueued) return;
  refreshQueued = true;
  window.setTimeout(() => {
    refreshQueued = false;
    if (undoInProgress || undoCleanupInProgress || undoResetInProgress) {
      refreshAfterUndo = true;
      return;
    }
    if (!sceneLifecycle.isReady()) return;
    void scheduleRender().catch(() => {});
  }, 80);
}

function historyUndoShortcutTargetIsEditable(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  return !!target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])');
}

async function undoLatestHistoryFromShortcut() {
  if (undoInProgress || undoCleanupInProgress || undoResetInProgress || !sceneLifecycle.isReady()) return;
  const operation = sceneLifecycle.capture({ operationId: sceneOperationId("undo-shortcut") });
  if (!sceneLifecycle.isCurrent(operation)) return;
  undoInProgress = true;
  let message = "";
  try {
    const undone = await undoHistoryThrough(undefined, {
      sceneEpoch: operation.epoch,
    });
    if (!sceneLifecycle.isCurrent(operation)) return;
    const outcome = normalizeHistoryUndoResult(undone);
    if (outcome.outcome === HISTORY_UNDO_OUTCOME.COMMITTED) {
      message = outcome.entries.length === 1
        ? `Annullato: ${outcome.entries[0]?.label || "ultima azione"}`
        : "Annullamento applicato.";
    } else if (outcome.outcome === HISTORY_UNDO_OUTCOME.CONFLICT) {
      message = "Annullamento non applicato: lo stato della scena è cambiato.";
    } else if (outcome.outcome === HISTORY_UNDO_OUTCOME.NOOP) {
      message = "Nessuna operazione annullabile.";
    } else if (outcome.outcome === HISTORY_UNDO_OUTCOME.REJECTED) {
      message = "Annullamento rifiutato o non più valido.";
    } else if (outcome.outcome === HISTORY_UNDO_OUTCOME.RECOVERY_REQUIRED) {
      message = "Annullamento sospeso: è richiesta una verifica manuale.";
    } else {
      message = "Annullamento non applicato.";
    }
  } catch (error: any) {
    if (!sceneLifecycle.isCurrent(operation)) return;
    message = `Annullamento fallito: ${error?.message || error}`;
  } finally {
    undoInProgress = false;
  }
  if (sceneLifecycle.isCurrent(operation)) await scheduleRender(message);
}

window.addEventListener("keydown", (event) => {
  if (!shouldHandleHistoryUndoShortcut({
    key: event.key,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    shiftKey: event.shiftKey,
    altKey: event.altKey,
    repeat: event.repeat,
    isComposing: event.isComposing,
    editableTarget: historyUndoShortcutTargetIsEditable(event.target),
    busy: undoInProgress || undoCleanupInProgress || undoResetInProgress,
    enabled: sceneLifecycle.isReady(),
  })) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  void undoLatestHistoryFromShortcut();
}, true);

OBR.onReady(async () => {
  unsubscribeSceneLifecycle = sceneLifecycle.subscribe((event) => {
    if (event.phase === "unavailable") {
      combatLogPageOperationToken += 1;
      combatLogPageLoading = false;
      statusMessage = "Scena cambiata: annullamenti e registrazioni sono sospesi finché non viene montata una nuova baseline.";
      void scheduleRender(statusMessage).catch(() => {});
    } else if (event.phase === "ready" && event.reason !== "scene-bootstrap-ready") {
      statusMessage = "Nuova scena pronta: verifica il registro prima di usare la cronologia.";
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
  clearHistoryPendingReadinessRefresh();
  combatLogPageOperationToken += 1;
  combatLogPageLoading = false;
  unsubscribeSceneLifecycle?.();
  sceneLifecycle.dispose();
  unsubscribeCombatLogOption?.();
  unsubscribeHistoryChange?.();
  unsubscribeUndoSceneItems?.();
});
