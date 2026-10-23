// Reorder at equal initiative (lot 6.8). A card can be dragged among the cards that share its initiative; Lair turns and
// Epic Actions are virtual cards at the initiative of the creature they follow, so they never make a tie.

export function tieInitiativeKey(entry) {
  return String(entry?.initiative || 0);
}

// The initiatives held by two or more real cards (a collapsed group counts as one card). At the Lair's initiative the
// Epic Bosses are pinned at the head of the tie (initiativeOrderCore.js), so there they are no partner to swap with.
export function realTieInitiatives(entries = [], isVirtualId = () => false, { lairInitiative = null } = {}) {
  const counts = new Map();
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!entry?.id || isVirtualId(entry.id)) continue;
    if (entry.isEpic && lairInitiative !== null && (Number(entry.initiative) || 0) === lairInitiative) continue;
    const key = tieInitiativeKey(entry);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return new Set([...counts].filter(([, count]) => count > 1).map(([key]) => key));
}

// The GM's cards that can be dragged: a real card, not an Epic Boss (which keeps its place), in a real tie.
export function showsTieReorderHandle(entry, ties, { isGM = false, isVirtualId = () => false } = {}) {
  return !!isGM
    && !!entry?.id
    && !isVirtualId(entry.id)
    && !entry.isEpic
    && ties instanceof Set
    && ties.has(tieInitiativeKey(entry));
}

// A grip shown on hover (index.html): outside the extended card's right edge, in the compact card's bottom-left
// corner. Dragging it drags the card; the card itself stays draggable as before.
export function buildTieReorderHandle({ compact = false, documentRef = globalThis.document } = {}) {
  const handle = documentRef.createElement("span");
  handle.dataset.tieReorderHandle = "1";
  handle.dataset.cardSelectionIgnore = "1";
  handle.textContent = "⠿";
  handle.title = "Trascina per riordinare a parità di iniziativa";
  handle.setAttribute("aria-hidden", "true");
  Object.assign(handle.style, {
    position: "absolute",
    width: "12px",
    height: "18px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    color: "rgba(255,255,255,.85)",
    fontSize: "12px",
    lineHeight: "1",
    cursor: "grab",
    zIndex: "9",
    ...(compact
      ? { left: "4px", bottom: "3px" }
      : { left: "calc(100% + 3px)", top: "50%", transform: "translateY(-50%)" }),
  });
  return handle;
}
