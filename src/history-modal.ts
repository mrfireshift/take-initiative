import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { getHistoryEntries, undoHistoryThrough } from "./history.js";

const MODAL_ID = `${ID}/history-modal`;
const TRACKER_POPOVER_TOGGLE_CHANNEL = `${ID}/tracker-popover-toggle`;

function closeHistoryPopover() {
  void OBR.broadcast.sendMessage(TRACKER_POPOVER_TOGGLE_CHANNEL, {
    type: "closed",
    id: MODAL_ID,
  }, { destination: "LOCAL" }).catch(() => {});
  void OBR.popover.close(MODAL_ID);
}

function styleButton(button: HTMLButtonElement) {
  Object.assign(button.style, {
    minHeight: "34px",
    padding: "0 12px",
    border: "1px solid rgba(255,255,255,.18)",
    borderRadius: "6px",
    background: "rgba(0,0,0,.55)",
    color: "#fff",
    fontSize: "13px",
    fontWeight: "750",
    cursor: "pointer",
  });
}

function snapshotValue(change: any, side: "before" | "after", field: string) {
  const snapshot = change?.[side]?.[field];
  return snapshot?.present ? snapshot.value : null;
}

function numberText(value: any) {
  const n = Number(value) || 0;
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function signedText(value: any) {
  const n = Number(value) || 0;
  const text = numberText(Math.abs(n));
  return n > 0 ? `+${text}` : n < 0 ? `-${text}` : "0";
}

function entryDetail(entry: any) {
  const changes = Array.isArray(entry?.changes) ? entry.changes : [];
  if (entry?.kind === "hp") {
    return changes.slice(0, 3).map((change: any) => {
      const beforeHP = snapshotValue(change, "before", "hp") ?? 0;
      const beforeMax = snapshotValue(change, "before", "hpMax") ?? 0;
      const afterHP = snapshotValue(change, "after", "hp") ?? 0;
      const afterMax = snapshotValue(change, "after", "hpMax") ?? 0;
      return `${change.name}: ${beforeHP}/${beforeMax} -> ${afterHP}/${afterMax}`;
    }).join(" | ");
  }
  if (entry?.kind === "move") {
    return changes.slice(0, 3).map((change: any) => {
      const cells = Number(change?.movement?.cells) || 0;
      const unit = Math.abs(cells - 1) < 0.001 ? "casella" : "caselle";
      return `${change.name}: ${numberText(cells)} ${unit} (X ${signedText(change?.movement?.dxCells)}, Y ${signedText(change?.movement?.dyCells)})`;
    }).join(" | ");
  }
  const names = changes.slice(0, 3).map((change: any) => change.name).join(", ");
  const more = changes.length > 3 ? ` +${changes.length - 3}` : "";
  return `${names}${more}`;
}

async function render(message = "") {
  const app = document.getElementById("app");
  if (!app) return;

  const role = await OBR.player.getRole();
  const entries = role === "GM" ? await getHistoryEntries() : [];
  const newestFirst = [...entries].reverse();
  let selectedDepth = newestFirst.length ? 1 : 0;

  const panel = document.createElement("div");
  Object.assign(panel.style, {
    height: "100vh",
    boxSizing: "border-box",
    padding: "14px",
    background: "linear-gradient(180deg, rgba(12,16,22,.96), rgba(12,16,22,.88))",
    color: "#fff",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    display: "flex",
    flexDirection: "column",
  });

  const header = document.createElement("div");
  Object.assign(header.style, {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "10px",
    marginBottom: "10px",
  });

  const title = document.createElement("div");
  title.textContent = "Cronologia";
  Object.assign(title.style, { fontSize: "16px", fontWeight: "800" });

  const actions = document.createElement("div");
  Object.assign(actions.style, { display: "flex", gap: "8px" });

  const undo = document.createElement("button");
  undo.type = "button";
  styleButton(undo);

  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "Chiudi";
  styleButton(close);
  close.addEventListener("click", closeHistoryPopover);

  actions.append(undo, close);
  header.append(title, actions);

  const status = document.createElement("div");
  status.textContent = role !== "GM"
    ? "Solo il GM puo usare la cronologia."
    : message || "La selezione include automaticamente tutte le azioni piu recenti.";
  Object.assign(status.style, {
    minHeight: "18px",
    marginBottom: "8px",
    color: "rgba(255,255,255,.68)",
    fontSize: "12px",
  });

  const list = document.createElement("div");
  Object.assign(list.style, {
    display: "grid",
    gap: "7px",
    overflowY: "auto",
    minHeight: "0",
    paddingRight: "2px",
  });

  const selectableRows: Array<{ checkbox: HTMLInputElement; row: HTMLDivElement }> = [];
  const updateSelection = () => {
    selectableRows.forEach(({ checkbox, row }, index) => {
      const selected = index < selectedDepth;
      checkbox.checked = selected;
      row.style.borderColor = selected
        ? "rgba(129,140,248,.72)"
        : "rgba(255,255,255,.12)";
      row.style.background = selected
        ? "rgba(49,46,129,.34)"
        : "rgba(0,0,0,.36)";
    });
    undo.textContent = selectedDepth <= 1 ? "Undo ultima" : `Undo ${selectedDepth} azioni`;
    undo.disabled = role !== "GM" || selectedDepth === 0;
    undo.style.opacity = undo.disabled ? ".45" : "1";
  };

  if (!newestFirst.length) {
    const empty = document.createElement("div");
    empty.textContent = "Nessuna operazione registrata.";
    Object.assign(empty.style, {
      padding: "18px",
      textAlign: "center",
      color: "rgba(255,255,255,.65)",
      border: "1px solid rgba(255,255,255,.12)",
      borderRadius: "6px",
      background: "rgba(0,0,0,.28)",
    });
    list.appendChild(empty);
  } else {
    newestFirst.forEach((entry: any, index: number) => {
      const row = document.createElement("div");
      Object.assign(row.style, {
        padding: "8px 10px",
        border: "1px solid rgba(255,255,255,.12)",
        borderRadius: "6px",
        background: "rgba(0,0,0,.36)",
        display: "grid",
        gridTemplateColumns: "18px minmax(0, 1fr)",
        gap: "8px",
        cursor: "pointer",
      });

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.title = "Annulla fino a questa azione";
      checkbox.style.margin = "2px 0 0";

      const body = document.createElement("div");
      const top = document.createElement("div");
      Object.assign(top.style, {
        display: "flex",
        justifyContent: "space-between",
        gap: "12px",
        alignItems: "baseline",
      });
      const label = document.createElement("span");
      label.textContent = String(entry.label || "Modifica");
      Object.assign(label.style, { fontSize: "13px", fontWeight: "750" });
      const time = document.createElement("span");
      time.textContent = new Date(Number(entry.at) || Date.now()).toLocaleTimeString("it-IT", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      Object.assign(time.style, { fontSize: "11px", color: "rgba(255,255,255,.55)" });
      top.append(label, time);

      const detail = document.createElement("div");
      detail.textContent = entryDetail(entry);
      Object.assign(detail.style, {
        marginTop: "4px",
        fontSize: "11px",
        lineHeight: "1.35",
        color: "rgba(255,255,255,.68)",
        overflowWrap: "anywhere",
      });
      body.append(top, detail);
      row.append(checkbox, body);

      checkbox.addEventListener("click", (event) => event.stopPropagation());
      checkbox.addEventListener("change", () => {
        selectedDepth = checkbox.checked ? index + 1 : index;
        updateSelection();
      });
      row.addEventListener("click", () => {
        selectedDepth = index + 1;
        updateSelection();
      });

      selectableRows.push({ checkbox, row });
      list.appendChild(row);
    });
  }

  updateSelection();
  undo.addEventListener("click", async () => {
    if (selectedDepth < 1) return;
    undo.disabled = true;
    undo.style.opacity = ".45";
    try {
      const target = newestFirst[selectedDepth - 1];
      const undone = await undoHistoryThrough(target?.id);
      await render(undone.length === 1
        ? `Annullato: ${undone[0].label}`
        : `Annullate ${undone.length} azioni.`);
    } catch (err: any) {
      await render(`Undo fallito: ${err?.message || err}`);
    }
  });

  panel.append(header, status, list);
  app.replaceChildren(panel);
}

OBR.onReady(async () => {
  document.documentElement.style.margin = "0";
  document.body.style.margin = "0";
  document.body.style.background = "transparent";
  await render();
});