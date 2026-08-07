import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { aggregateCombatLogEvents, combatEventDetail } from "./combatLogCore.js";
import {
  addCombatLogNote,
  activateCombatLogSession,
  clearCombatLogSession,
  deleteCombatLogSession,
  exportCombatLogJSON,
  exportCombatLogText,
  getActiveCombatLogData,
  isCombatLogEventSinkEnabled,
  listCombatLogSessions,
  mountCombatLogEventSink,
  recordCombatTurn,
  startCombatLogSession,
  subscribeCombatLog,
} from "./combatLog.js";
import { getHistoryEntries, undoHistoryThrough } from "./history.js";
import { runtimeOptionsService } from "./options/optionsRuntime.js";
import { selectCombatLogEnabled } from "./options/optionsSelectors.js";

const MODAL_ID = `${ID}/history-modal`;
const TRACKER_POPOVER_TOGGLE_CHANNEL = `${ID}/tracker-popover-toggle`;
const HISTORY_CHANGE_CHANNEL = `${ID}/history-change`;

let statusMessage = "";
let refreshQueued = false;
let logPanelOpen = true;
let undoPanelOpen = false;
let preferredPanel: "log" | "undo" | null = null;
let undoInProgress = false;
let refreshAfterUndo = false;
let unsubscribeCombatLogOption: (() => void) | null = null;
let unsubscribeHistoryChange: (() => void) | null = null;

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

function eventTone(kind: string) {
  if (kind === "hp") return "#ef4444";
  if (kind === "spell") return "#a855f7";
  if (kind === "condition") return "#ec4899";
  if (kind === "move") return "#22c55e";
  if (kind === "turn" || kind === "round") return "#3b82f6";
  if (kind === "undo") return "#f59e0b";
  if (kind === "scene-add" || kind === "initiative-add") return "#14b8a6";
  if (kind === "scene-remove" || kind === "initiative-remove") return "#fb7185";
  if (kind === "note") return "#eab308";
  return "#94a3b8";
}

function kindLabel(kind: string) {
  const labels: Record<string, string> = {
    hp: "HP",
    spell: "Incantesimo",
    condition: "Condizione",
    move: "Movimento",
    turn: "Turno",
    round: "Round",
    note: "Nota",
    undo: "Undo",
    resource: "Risorsa",
    "scene-add": "Token aggiunto",
    "scene-remove": "Token rimosso",
    "initiative-add": "Iniziativa +",
    "initiative-remove": "Iniziativa -",
  };
  return labels[kind] || "Evento";
}

function makeEventRow(event: any) {
  const row = document.createElement("div");
  const tone = eventTone(event?.kind);
  Object.assign(row.style, {
    display: "grid",
    gridTemplateColumns: "4px minmax(0,1fr)",
    gap: "9px",
    padding: "8px 9px 8px 0",
    border: "1px solid rgba(148,163,184,.14)",
    borderRadius: "9px",
    background: "rgba(15,23,42,.72)",
  });
  const rail = document.createElement("div");
  Object.assign(rail.style, { borderRadius: "9px", background: tone, boxShadow: `0 0 10px ${tone}` });
  const body = document.createElement("div");
  const top = document.createElement("div");
  Object.assign(top.style, { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "10px" });
  const label = document.createElement("strong");
  label.textContent = String(event?.label || "Evento");
  Object.assign(label.style, { minWidth: "0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "var(--obrt-type-body, 12px)", fontWeight: "var(--obrt-weight-semibold, 600)" });
  const time = document.createElement("span");
  time.textContent = new Date(Number(event?.at) || Date.now()).toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  Object.assign(time.style, { flex: "0 0 auto", color: "rgba(255,255,255,.5)", fontSize: "var(--obrt-type-caption, 10px)", fontWeight: "var(--obrt-weight-regular, 400)" });
  top.append(label, time);
  const detailText = combatEventDetail(event);
  if (detailText) {
    const detail = document.createElement("div");
    detail.textContent = detailText;
    Object.assign(detail.style, {
      marginTop: "3px",
      color: "rgba(255,255,255,.68)",
      fontSize: "var(--obrt-type-secondary, 11px)",
      lineHeight: "1.35",
      overflowWrap: "anywhere",
    });
    body.append(top, detail);
  } else body.append(top);
  const badge = document.createElement("span");
  badge.textContent = kindLabel(String(event?.kind || ""));
  Object.assign(badge.style, {
    display: "inline-block",
    marginTop: "5px",
    padding: "2px 6px",
    borderRadius: "999px",
    color: tone,
    background: "#0f172a",
    fontSize: "var(--obrt-type-micro, 9px)",
    fontWeight: "var(--obrt-weight-bold, 700)",
    letterSpacing: ".05em",
    textTransform: "uppercase",
  });
  body.appendChild(badge);
  row.append(rail, body);
  return row;
}

function makeUndoPanel(entries: any[], onDone: (message: string) => Promise<void>) {
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
  summary.textContent = `Cronologia e Undo (${entries.length})`;
  Object.assign(summary.style, { padding: "9px 10px", cursor: "pointer", fontSize: "var(--obrt-type-secondary, 11px)", fontWeight: "var(--obrt-weight-bold, 700)" });
  details.appendChild(summary);
  const body = document.createElement("div");
  Object.assign(body.style, { display: "grid", gap: "5px", padding: "0 9px 9px" });
  const newest = [...entries].reverse();
  if (!newest.length) {
    const empty = document.createElement("div");
    empty.textContent = "Nessuna operazione reversibile.";
    Object.assign(empty.style, { padding: "8px", color: "rgba(255,255,255,.55)", fontSize: "11px" });
    body.appendChild(empty);
  } else {
    let selectedDepth = 1;
    const rows: Array<{ checkbox: HTMLInputElement; row: HTMLLabelElement }> = [];
    const undo = button("Undo ultima", "primary", "history.svg");
    const refresh = () => {
      rows.forEach(({ checkbox, row }, index) => {
        const selected = index < selectedDepth;
        checkbox.checked = selected;
        row.style.background = selected ? "rgba(30,64,175,.24)" : "rgba(15,23,42,.72)";
      });
      setButtonLabel(undo, selectedDepth === 1 ? "Undo ultima" : `Undo ${selectedDepth} azioni`);
      undo.disabled = selectedDepth < 1;
    };
    body.appendChild(undo);
    newest.slice(0, 10).forEach((entry, index) => {
      const row = document.createElement("label");
      Object.assign(row.style, { display: "flex", alignItems: "center", gap: "7px", padding: "6px 8px", borderRadius: "7px", cursor: "pointer" });
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.style.accentColor = "#2563eb";
      const text = document.createElement("span");
      text.textContent = String(entry?.label || "Modifica");
      Object.assign(text.style, { fontSize: "var(--obrt-type-secondary, 11px)", fontWeight: "var(--obrt-weight-medium, 500)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" });
      checkbox.addEventListener("change", () => {
        selectedDepth = checkbox.checked ? index + 1 : index;
        refresh();
      });
      row.append(checkbox, text);
      rows.push({ checkbox, row });
      body.appendChild(row);
    });
    undo.addEventListener("click", async () => {
      if (selectedDepth < 1) return;
      undo.disabled = true;
      preferredPanel = "undo";
      undoInProgress = true;
      try {
        const target = newest[selectedDepth - 1];
        const undone = await undoHistoryThrough(target?.id);
        await onDone(undone.length === 1
          ? `Annullato: ${undone[0].label}`
          : `Annullate ${undone.length} azioni.`);
      } catch (error: any) {
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
    refresh();
  }
  details.appendChild(body);
  return details;
}

async function render(message = statusMessage) {
  const app = document.getElementById("app");
  if (!app) return;
  captureAccordionState(app);
  const role = await OBR.player.getRole();
  if (role !== "GM") {
    app.textContent = "Il Registro combattimento è disponibile solo per il GM.";
    return;
  }
  const { session, events } = await getActiveCombatLogData();
  const [undoEntries, sessions] = await Promise.all([getHistoryEntries(), listCombatLogSessions()]);
  const displayEvents = aggregateCombatLogEvents(events);
  const combatLogEnabled = isCombatLogEventSinkEnabled();
  statusMessage = message;

  const panel = document.createElement("main");
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
  title.textContent = session?.name || "Registro combattimento";
  Object.assign(title.style, { margin: "0", fontSize: "var(--obrt-type-panel-title, 16px)", fontWeight: "var(--obrt-weight-bold, 700)", lineHeight: "1.1", letterSpacing: "-.01em" });
  const subtitle = document.createElement("div");
  subtitle.textContent = `${displayEvents.length} eventi · iniziato ${new Date(Number(session?.startedAt) || Date.now()).toLocaleString("it-IT")}`;
  Object.assign(subtitle.style, { marginTop: "3px", color: "rgba(255,255,255,.58)", fontSize: "var(--obrt-type-caption, 10px)", fontWeight: "var(--obrt-weight-regular, 400)" });
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
  sessionPicker.addEventListener("change", async () => {
    try {
      await activateCombatLogSession(sessionPicker.value);
      await render("Registro aperto.");
    } catch (error: any) {
      await render(`Apertura fallita: ${error?.message || error}`);
    }
  });
  heading.append(title, subtitle, sessionPicker);
  const headerActions = document.createElement("div");
  Object.assign(headerActions.style, { display: "flex", alignItems: "center", justifyContent: "flex-end", flex: "0 0 auto", gap: "5px" });
  const exportText = button("Esporta TXT", "default", "log-export.svg");
  const exportJson = button("Esporta JSON", "default", "log-export.svg");
  const newSession = button("Nuovo registro", "default", "log-new.svg", true);
  const clearLog = button("Svuota eventi", "default", "log-clear.svg");
  const deleteLog = button("Elimina registro", "danger", "log-delete.svg");
  exportText.title = "Esporta il registro in formato testo";
  exportJson.title = "Esporta il registro in formato JSON";
  newSession.title = "Crea un nuovo registro e archivia quello corrente";
  if (!combatLogEnabled) {
    newSession.disabled = true;
    newSession.title = "Riattiva il Combat Log dalle Opzioni per creare un nuovo registro";
  }
  clearLog.title = "Rimuove gli eventi ma mantiene il registro nella lista";
  deleteLog.title = "Elimina definitivamente il registro selezionato";
  exportText.disabled = !events.length;
  exportJson.disabled = !events.length;
  clearLog.disabled = !events.length;
  deleteLog.disabled = !session?.id;
  exportText.addEventListener("click", () => download(
    `${safeFileName(session?.name)}.txt`,
    exportCombatLogText(session, events),
    "text/plain;charset=utf-8"
  ));
  exportJson.addEventListener("click", () => download(
    `${safeFileName(session?.name)}.json`,
    exportCombatLogJSON(session, events),
    "application/json;charset=utf-8"
  ));
  newSession.addEventListener("click", async () => {
    if (!isCombatLogEventSinkEnabled()) {
      await render("Combat Log disattivato: nessun nuovo registro creato.");
      return;
    }
    if (events.length && !window.confirm("Creare un nuovo registro? Quello corrente resterà archiviato nel browser.")) return;
    const name = window.prompt("Nome del nuovo combattimento:", "") || "";
    try {
      await startCombatLogSession(name);
      const metadata = await OBR.scene.getMetadata();
      await recordCombatTurn(metadata?.[`${ID}/state`]);
      await render("Nuovo registro creato.");
    } catch (error: any) {
      await render(`Creazione fallita: ${error?.message || error}`);
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
    clearConfirmation.style.display = "flex";
    clearLog.disabled = true;
  });
  cancelClear.addEventListener("click", () => {
    clearConfirmation.style.display = "none";
    clearLog.disabled = false;
  });
  confirmClear.addEventListener("click", async () => {
    confirmClear.disabled = true;
    cancelClear.disabled = true;
    try {
      await clearCombatLogSession(session?.id);
      await render("Registro cancellato. Il journal Undo non è stato modificato.");
    } catch (error: any) {
      await render(`Cancellazione fallita: ${error?.message || error}`);
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
    deleteConfirmation.style.display = "flex";
    deleteLog.disabled = true;
  });
  cancelDelete.addEventListener("click", () => {
    deleteConfirmation.style.display = "none";
    deleteLog.disabled = false;
  });
  confirmDelete.addEventListener("click", async () => {
    confirmDelete.disabled = true;
    cancelDelete.disabled = true;
    try {
      await deleteCombatLogSession(session?.id);
      await render("Registro eliminato dalla lista.");
    } catch (error: any) {
      await render(`Eliminazione fallita: ${error?.message || error}`);
    }
  });

  const filters = document.createElement("div");
  Object.assign(filters.style, { display: "grid", gridTemplateColumns: "minmax(0,1fr) 130px", gap: "6px" });
  const search = document.createElement("input");
  search.type = "search";
  search.placeholder = "Cerca attore, bersaglio o evento…";
  const kind = document.createElement("select");
  for (const [value, label] of [
    ["", "Tutti gli eventi"], ["hp", "HP"], ["condition", "Condizioni"],
    ["spell", "Incantesimi"], ["move", "Movimento"], ["turn", "Turni e round"],
    ["note", "Note"], ["undo", "Undo"], ["resource", "Risorse"],
  ]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    kind.appendChild(option);
  }
  for (const control of [search, kind]) {
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
  }
  kind.querySelectorAll("option").forEach((option) => Object.assign((option as HTMLOptionElement).style, { background: "#0f172a", color: "#fff" }));
  filters.append(search, kind);

  const noteForm = document.createElement("form");
  Object.assign(noteForm.style, { display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: "6px" });
  const note = document.createElement("input");
  note.type = "text";
  note.disabled = !combatLogEnabled;
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
  addNote.disabled = !combatLogEnabled;
  noteForm.append(note, addNote);
  noteForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!note.value.trim()) return;
    if (!isCombatLogEventSinkEnabled()) {
      await render("Combat Log disattivato: nota non registrata.");
      return;
    }
    addNote.disabled = true;
    const created = await addCombatLogNote(note.value);
    await render(created.length ? "Nota aggiunta." : "Combat Log disattivato: nota non registrata.");
  });

  const status = document.createElement("div");
  status.textContent = combatLogEnabled
    ? (message || "Il registro non viene modificato dagli Undo: viene aggiunta una voce di annullamento.")
    : (message
      ? `${message} Combat Log disattivato: History/Undo e sessioni esistenti restano disponibili.`
      : "Combat Log disattivato: History/Undo e sessioni esistenti restano disponibili.");
  Object.assign(status.style, { minHeight: "14px", color: "rgba(255,255,255,.58)", fontSize: "var(--obrt-type-caption, 10px)", fontWeight: "var(--obrt-weight-regular, 400)" });

  const timeline = document.createElement("section");
  Object.assign(timeline.style, {
    flex: "1 1 auto",
    height: "min(52vh, 520px)",
    minHeight: "220px",
    display: "grid",
    alignContent: "start",
    gap: "6px",
    overflowY: "auto",
    padding: "1px 3px 1px 0",
    scrollbarWidth: "thin",
  });

  const renderTimeline = () => {
    timeline.replaceChildren();
    const query = search.value.trim().toLocaleLowerCase("it");
    const selectedKind = kind.value;
    const filtered = [...displayEvents].reverse().filter((event) => {
      const kindMatches = !selectedKind
        || event.kind === selectedKind
        || (selectedKind === "turn" && event.kind === "round");
      const haystack = `${event.label || ""} ${combatEventDetail(event)} ${(event.targets || []).map((target: any) => target.name).join(" ")}`.toLocaleLowerCase("it");
      return kindMatches && (!query || haystack.includes(query));
    });
    let lastRound: number | null = null;
    for (const event of filtered) {
      const round = Math.max(1, Number(event?.round) || 1);
      if (round !== lastRound) {
        const roundLabel = document.createElement("div");
        roundLabel.textContent = `ROUND ${round}`;
        Object.assign(roundLabel.style, {
          position: "sticky",
          top: "0",
          zIndex: "2",
          padding: "5px 7px",
          borderRadius: "7px",
          background: "rgba(15,23,42,.94)",
          color: "rgba(255,255,255,.72)",
          fontSize: "var(--obrt-type-caption, 10px)",
          fontWeight: "var(--obrt-weight-bold, 700)",
          letterSpacing: ".08em",
        });
        timeline.appendChild(roundLabel);
        lastRound = round;
      }
      timeline.appendChild(makeEventRow(event));
    }
    if (!filtered.length) {
      const empty = document.createElement("div");
      empty.textContent = displayEvents.length ? "Nessun evento corrisponde ai filtri." : "Il registro è vuoto. Le prossime operazioni verranno registrate qui.";
      Object.assign(empty.style, { padding: "18px", textAlign: "center", color: "rgba(255,255,255,.55)" });
      timeline.appendChild(empty);
    }
  };
  search.addEventListener("input", renderTimeline);
  kind.addEventListener("change", renderTimeline);
  renderTimeline();

  const logPanel = document.createElement("details");
  logPanel.dataset.panel = "log";
  logPanel.open = logPanelOpen;
  Object.assign(logPanel.style, {
    flex: "0 0 auto",
    border: "1px solid rgba(148,163,184,.18)",
    borderRadius: "11px",
    background: "rgba(15,23,42,.58)",
    overflow: "hidden",
  });
  const logSummary = document.createElement("summary");
  logSummary.textContent = `Log di combattimento · ${session?.name || "Combattimento"} (${displayEvents.length})`;
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
  });
  headerActions.replaceChildren(
    newSession,
    toolbarMenu("Esporta registro", "log-export.svg", [exportText, exportJson]),
    toolbarMenu("Gestisci registro", "log-more.svg", [clearLog, deleteLog]),
  );
  logBody.append(header, clearConfirmation, deleteConfirmation, filters, noteForm, status, timeline);
  logPanel.append(logSummary, logBody);

  const undoPanel = makeUndoPanel(undoEntries, async (undoMessage) => render(undoMessage));
  panel.append(close, logPanel, undoPanel);
  app.replaceChildren(panel);
}

function queueRefresh() {
  if (undoInProgress) {
    refreshAfterUndo = true;
    return;
  }
  if (refreshQueued) return;
  refreshQueued = true;
  window.setTimeout(() => {
    refreshQueued = false;
    if (undoInProgress) {
      refreshAfterUndo = true;
      return;
    }
    void render();
  }, 80);
}

OBR.onReady(async () => {
  await mountCombatLogEventSink();
  document.documentElement.style.margin = "0";
  document.body.style.margin = "0";
  document.body.style.background = "transparent";
  subscribeCombatLog(queueRefresh);
  unsubscribeHistoryChange = OBR.broadcast.onMessage(HISTORY_CHANGE_CHANNEL, (event) => {
    if (event?.data?.type === "changed") queueRefresh();
  });
  unsubscribeCombatLogOption = runtimeOptionsService.subscribe(
    selectCombatLogEnabled,
    () => queueRefresh(),
    { emitCurrent: false },
  );
  await render();
});

window.addEventListener("beforeunload", () => {
  unsubscribeCombatLogOption?.();
  unsubscribeHistoryChange?.();
});
