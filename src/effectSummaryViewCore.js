function summaryPartsForView(effect) {
  const seenLabels = new Set();
  return (Array.isArray(effect?.summaryParts) ? effect.summaryParts : [])
    .map((part, index) => ({
      id: String(part?.id || part?.key || `part-${index + 1}`).trim(),
      label: String(part?.label || part?.text || "").trim(),
      ...(part?.stack === true ? { stack: true } : {}),
    }))
    .filter((part) => {
      const key = part.label.toLocaleLowerCase("it").replace(/\s+/gu, " ");
      if (!part.id || !part.label || seenLabels.has(key)) return false;
      seenLabels.add(key);
      return true;
    });
}

export function buildEffectSummaryContainer(
  effect,
  parentPill,
  {
    documentRef = globalThis.document,
    preview = false,
    maxWidth = preview ? "100%" : "196px",
  } = {},
) {
  const parentLabel = String(effect?.label || "")
    .trim()
    .toLocaleLowerCase("it")
    .replace(/\s+/gu, " ");
  const summaryParts = summaryPartsForView(effect)
    .filter((part) => part.label.toLocaleLowerCase("it").replace(/\s+/gu, " ") !== parentLabel);
  if (!summaryParts.length) return parentPill;

  const document = documentRef || globalThis.document;
  const summary = document.createElement("div");
  const stackedParts = summaryParts.some((part) => part.stack === true);
  summary.title = effect?.title || effect?.label || "Effetto";
  Object.assign(summary.style, {
    width: "100%",
    maxWidth,
    minWidth: "0",
    display: "flex",
    flexDirection: stackedParts ? "column" : "row",
    flexWrap: stackedParts ? "nowrap" : "wrap",
    gap: "2px",
    alignItems: "center",
    justifyContent: "center",
    overflow: preview ? "hidden" : "visible",
  });
  summary.dataset.summaryParts = String(summaryParts.length);

  Object.assign(parentPill.style, {
    width: "100%",
    maxWidth: "100%",
    flex: "0 0 100%",
    overflow: preview ? "hidden" : "visible",
  });
  summary.appendChild(parentPill);

  for (const part of summaryParts) {
    const miniPill = document.createElement("span");
    miniPill.textContent = part.label;
    miniPill.title = part.label;
    miniPill.dataset.summaryPartId = part.id;
    Object.assign(miniPill.style, {
      minWidth: preview ? "0" : "max-content",
      maxWidth: preview ? "100%" : "none",
      height: preview ? "14px" : "17px",
      padding: "0 4px",
      boxSizing: "border-box",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      flex: preview ? "1 1 auto" : "0 0 auto",
      overflow: preview ? "hidden" : "visible",
      border: "1px solid rgba(255,255,255,.38)",
      borderRadius: "999px",
      background: "rgba(8,12,21,.82)",
      color: "#fff",
      fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
      fontSize: preview ? "7px" : "8px",
      fontWeight: "600",
      lineHeight: "1",
      whiteSpace: "nowrap",
      textOverflow: preview ? "ellipsis" : "clip",
      boxShadow: "0 1px 4px rgba(0,0,0,.35)",
    });
    summary.appendChild(miniPill);
  }

  return summary;
}
