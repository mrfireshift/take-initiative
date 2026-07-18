import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { aggregateCombatLogEvents, combatEventDetail } from "./combatLogCore.js";
import {
  addCombatLogNote,
  activateCombatLogSession,
  clearCombatLogSession,
  exportCombatLogJSON,
  exportCombatLogText,
  getActiveCombatLogData,
  listCombatLogSessions,
  recordCombatTurn,
  startCombatLogSession,
  subscribeCombatLog,
} from "./combatLog.js";
import { getHistoryEntries, undoHistoryThrough } from "./history.js";

let statusMessage = "";
let refreshQueued = false;

function button(label: string, tone = "default") {
  const control = document.createElement("button");
  control.type = "button";
  control.textContent = label;
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
      ? "rgba(37,99,235,.36)"
      : tone === "danger"
        ? "rgba(153,27,27,.42)"
        : "rgba(255,255,255,.055)",
    color: "#fff",
    font: "inherit",
    fontSize: "var(--obrt-type-body, 12px)",
    fontWeight: "var(--obrt-weight-semibold, 600)",
    cursor: "pointer",
  });
  return control;
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
    background: "rgba(255,255,255,.025)",
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
    background: "rgba(0,0,0,.28)",
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
  Object.assign(details.style, {
    flex: "0 0 auto",
    border: "1px solid rgba(148,163,184,.18)",
    borderRadius: "10px",
    background: "rgba(0,0,0,.2)",
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
    const undo = button("Undo ultima", "primary");
    const refresh = () => {
      rows.forEach(({ checkbox, row }, index) => {
        const selected = index < selectedDepth;
        checkbox.checked = selected;
        row.style.background = selected ? "rgba(37,99,235,.18)" : "rgba(255,255,255,.025)";
      });
      undo.textContent = selectedDepth === 1 ? "Undo ultima" : `Undo ${selectedDepth} azioni`;
      undo.disabled = selectedDepth < 1;
    };
    body.appendChild(undo);
    newest.slice(0, 10).forEach((entry, index) => {
      const row = document.createElement("label");
      Object.assign(row.style, { display: "flex", alignItems: "center", gap: "7px", padding: "6px 8px", borderRadius: "7px", cursor: "pointer" });
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
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
      try {
        const target = newest[selectedDepth - 1];
        const undone = await undoHistoryThrough(target?.id);
        await onDone(undone.length === 1
          ? `Annullato: ${undone[0].label}`
          : `Annullate ${undone.length} azioni.`);
      } catch (error: any) {
        await onDone(`Undo fallito: ${error?.message || error}`);
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
  const role = await OBR.player.getRole();
  if (role !== "GM") {
    app.textContent = "Il Registro combattimento è disponibile solo per il GM.";
    return;
  }
  const { session, events } = await getActiveCombatLogData();
  const [undoEntries, sessions] = await Promise.all([getHistoryEntries(), listCombatLogSessions()]);
  const displayEvents = aggregateCombatLogEvents(events);
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
    background: "linear-gradient(145deg, rgba(28,35,48,.97), rgba(36,27,34,.94))",
    color: "#fff",
    fontFamily: 'var(--obrt-font-ui, "Helvetica Neue", Helvetica, Arial, sans-serif)',
    fontSize: "var(--obrt-type-body, 12px)",
  });

  const header = document.createElement("header");
  Object.assign(header.style, { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" });
  const heading = document.createElement("div");
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
    minHeight: "24px",
    marginTop: "5px",
    padding: "2px 6px",
    border: "1px solid rgba(148,163,184,.2)",
    borderRadius: "7px",
    background: "rgba(0,0,0,.24)",
    color: "rgba(255,255,255,.8)",
    font: "inherit",
    fontSize: "10px",
  });
  for (const candidate of sessions) {
    const option = document.createElement("option");
    option.value = candidate.id;
    option.textContent = candidate.name;
    option.selected = candidate.id === session?.id;
    Object.assign(option.style, { background: "#111827", color: "#fff" });
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
  Object.assign(headerActions.style, { display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: "5px" });
  const exportText = button("TXT");
  const exportJson = button("JSON");
  const newSession = button("Nuovo log");
  const clearLog = button("Cancella log", "danger");
  exportText.disabled = !events.length;
  exportJson.disabled = !events.length;
  clearLog.disabled = !events.length;
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
  headerActions.append(exportText, exportJson, newSession, clearLog);
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
      borderRadius: "8px",
      background: "rgba(0,0,0,.28)",
      color: "#fff",
      font: "inherit",
      outline: "none",
    });
  }
  kind.querySelectorAll("option").forEach((option) => Object.assign((option as HTMLOptionElement).style, { background: "#111827", color: "#fff" }));
  filters.append(search, kind);

  const noteForm = document.createElement("form");
  Object.assign(noteForm.style, { display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: "6px" });
  const note = document.createElement("input");
  note.type = "text";
  note.placeholder = "Aggiungi una nota manuale al combattimento…";
  Object.assign(note.style, {
    minWidth: "0",
    minHeight: "32px",
    padding: "5px 9px",
    border: "1px solid rgba(148,163,184,.24)",
    borderRadius: "8px",
    background: "rgba(0,0,0,.28)",
    color: "#fff",
    font: "inherit",
    outline: "none",
  });
  const addNote = button("Aggiungi nota", "primary");
  noteForm.append(note, addNote);
  noteForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!note.value.trim()) return;
    addNote.disabled = true;
    await addCombatLogNote(note.value);
    await render("Nota aggiunta.");
  });

  const status = document.createElement("div");
  status.textContent = message || "Il registro non viene modificato dagli Undo: viene aggiunta una voce di annullamento.";
  Object.assign(status.style, { minHeight: "14px", color: "rgba(255,255,255,.58)", fontSize: "var(--obrt-type-caption, 10px)", fontWeight: "var(--obrt-weight-regular, 400)" });

  const timeline = document.createElement("section");
  Object.assign(timeline.style, {
    flex: "0 0 330px",
    height: "330px",
    minHeight: "180px",
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
  logPanel.open = true;
  Object.assign(logPanel.style, {
    flex: "0 0 auto",
    border: "1px solid rgba(148,163,184,.18)",
    borderRadius: "10px",
    background: "rgba(0,0,0,.16)",
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
  logBody.append(header, clearConfirmation, filters, noteForm, status, timeline);
  logPanel.append(logSummary, logBody);

  const undoPanel = makeUndoPanel(undoEntries, async (undoMessage) => render(undoMessage));
  panel.append(logPanel, undoPanel);
  app.replaceChildren(panel);
}

function queueRefresh() {
  if (refreshQueued) return;
  refreshQueued = true;
  window.setTimeout(() => {
    refreshQueued = false;
    void render();
  }, 80);
}

OBR.onReady(async () => {
  document.documentElement.style.margin = "0";
  document.body.style.margin = "0";
  document.body.style.background = "transparent";
  subscribeCombatLog(queueRefresh);
  await render();
});
