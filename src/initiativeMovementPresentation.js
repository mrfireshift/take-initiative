export function makeMovementStepper(
  label,
  onDecrease,
  onIncrease,
  { documentRef = globalThis.document } = {},
) {
  const wrap = documentRef.createElement("div");
  Object.assign(wrap.style, {
    display: "grid",
    gridTemplateColumns: "24px minmax(0, 1fr) 24px",
    alignItems: "center",
    gap: "4px",
    padding: "4px",
    border: "1px solid rgba(255,255,255,.11)",
    borderRadius: "6px",
    background: "rgba(255,255,255,.055)",
  });
  const decrease = documentRef.createElement("button");
  const increase = documentRef.createElement("button");
  const value = documentRef.createElement("strong");
  decrease.type = increase.type = "button";
  decrease.textContent = "-";
  increase.textContent = "+";
  value.textContent = label;
  Object.assign(value.style, {
    overflow: "hidden",
    fontSize: "10px",
    textAlign: "center",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  });
  for (const button of [decrease, increase]) {
    Object.assign(button.style, {
      width: "24px",
      height: "24px",
      padding: "0",
      border: "1px solid rgba(255,255,255,.18)",
      borderRadius: "50%",
      background: "rgba(0,0,0,.28)",
      color: "#fff",
      fontSize: "15px",
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
