export function makeMovementStepper(
  label,
  onDecrease,
  onIncrease,
  { documentRef = globalThis.document, decreaseLabel = "", increaseLabel = "" } = {},
) {
  const wrap = documentRef.createElement("div");
  Object.assign(wrap.style, {
    display: "grid",
    gridTemplateColumns: "20px minmax(0, 1fr) 20px",
    alignItems: "center",
    gap: "3px",
    padding: "2px",
    // The tiles of the tracker's tools row (initiativeToolbar.js).
    border: "1px solid rgba(148,163,184,.24)",
    borderRadius: "9px",
    background: "linear-gradient(180deg, rgba(255,255,255,.075), rgba(255,255,255,.025))",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,.04)",
  });
  const decrease = documentRef.createElement("button");
  const increase = documentRef.createElement("button");
  const value = documentRef.createElement("strong");
  decrease.type = increase.type = "button";
  // The minus sign, not the hyphen: as wide and as high as the "+" beside it.
  decrease.textContent = "−";
  increase.textContent = "+";
  value.textContent = label;
  Object.assign(value.style, {
    overflow: "hidden",
    fontSize: "11px",
    textAlign: "center",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  });
  for (const [button, buttonLabel] of [[decrease, decreaseLabel], [increase, increaseLabel]]) {
    // "-" and "+" say little to a screen reader or on a hover: the caller names what they change.
    if (buttonLabel) {
      button.title = buttonLabel;
      button.setAttribute("aria-label", buttonLabel);
    }
    Object.assign(button.style, {
      width: "20px",
      height: "20px",
      padding: "0",
      border: "1px solid rgba(148,163,184,.28)",
      borderRadius: "6px",
      background: "rgba(8,12,21,.72)",
      boxShadow: "inset 0 1px 0 rgba(255,255,255,.05)",
      color: "#fff",
      fontSize: "14px",
      lineHeight: "1",
      cursor: "pointer",
    });
  }
  decrease.addEventListener("click", (event) => {
    event.stopPropagation();
    onDecrease();
  });
  increase.addEventListener("click", (event) => {
    event.stopPropagation();
    onIncrease();
  });
  wrap.append(decrease, value, increase);
  return { wrap, value };
}

export function movementNumber(value) {
  return Number(value || 0).toLocaleString("it-IT", { maximumFractionDigits: 1 });
}

export function movementReadoutSummary(snapshot, compact = false) {
  if (!snapshot) return "";
  return compact
    ? movementNumber(snapshot.totalMeters) + "/" + movementNumber(snapshot.allowanceMeters) + " m · (" + movementNumber(snapshot.totalCells) + "/" + movementNumber(snapshot.allowanceCells) + ")"
    : movementNumber(snapshot.totalMeters) + " / " + movementNumber(snapshot.allowanceMeters) + " m · " + movementNumber(snapshot.totalCells) + "/" + movementNumber(snapshot.allowanceCells) + " caselle";
}

// The summary of the expanded tracker, in two parts: the metres, in bold, and the squares beside them. The word
// "caselle" stays in the tooltip, so the line keeps room for the name, the mode and the lock.
export function classicSpeedReadoutParts(snapshot) {
  if (!snapshot) return { meters: "", cells: "" };
  return {
    meters: movementNumber(snapshot.totalMeters) + " / " + movementNumber(snapshot.allowanceMeters) + " m",
    cells: movementNumber(snapshot.totalCells) + "/" + movementNumber(snapshot.allowanceCells),
  };
}

const COMPACT_MODE_LABELS = Object.freeze({ walk: "Piedi", fly: "Volo", swim: "Nuoto", climb: "Scalata", burrow: "Scavo" });

// The line of the compact tab. The GM of a creature with several modes also chooses among them (velocità dei mostri,
// D6). The tab stays as wide as it is: the choice shows a short word, the metres alone make room for it, and the
// squares stay in the tab's title.
export function compactSpeedReadout(snapshot, { gm = false } = {}) {
  const modes = gm && Array.isArray(snapshot?.movementModes) && snapshot.movementModes.length > 1
    ? snapshot.movementModes
    : [];
  return {
    summary: modes.length
      ? movementNumber(snapshot.totalMeters) + "/" + movementNumber(snapshot.allowanceMeters) + " m"
      : movementReadoutSummary(snapshot, true),
    modes: modes.map((mode) => ({ id: mode.id, label: mode.label + " · " + movementNumber(mode.speedMeters) + " m" })),
    activeLabel: modes.length ? COMPACT_MODE_LABELS[snapshot.activeMode] || snapshot.activeModeLabel : "",
  };
}
