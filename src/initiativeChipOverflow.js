import { CHIP_GAP_PX } from "./initiativeChipFallback.js";
import { openReferencePopover } from "./referencePopover.js";

export const MAX_VISIBLE_CHIPS = 3;

export function styleChipPill(element, { compact = true } = {}) {
  Object.assign(element.style, {
    fontSize: compact ? "10px" : "11px",
    fontWeight: "600",
    padding: compact ? "1px 6px" : "2px 8px",
    borderRadius: "999px",
    background: "rgba(0,0,0,.72)",
    color: "#fff",
    border: "1px solid rgba(255,255,255,.18)",
    lineHeight: "1",
    whiteSpace: "nowrap",
    userSelect: "none",
    cursor: "pointer",
  });
}

export function collectChipsDeep(fragment, { documentRef = globalThis.document } = {}) {
  const temporary = documentRef.createElement("div");
  temporary.appendChild(fragment);

  const chips = [];
  const seen = new Set();
  const explicit = temporary.querySelectorAll(
    ".chip, .spell-chip, .condition-chip, .cond-chip, [data-chip]",
  );
  explicit.forEach((element) => {
    if (!seen.has(element)) {
      seen.add(element);
      chips.push(element);
    }
  });

  const leaves = temporary.querySelectorAll("span, div");
  leaves.forEach((element) => {
    for (const explicitChip of seen) {
      if (explicitChip !== element && explicitChip.contains?.(element)) return;
    }
    if (element.children.length === 0 && !seen.has(element)) {
      const label = (element.textContent || "").trim();
      if (label.length) {
        seen.add(element);
        chips.push(element);
      }
    }
  });

  return chips;
}

export function mountChipsWithOverflow(
  dock,
  fragment,
  {
    compact = true,
    limit = MAX_VISIBLE_CHIPS,
    documentRef = globalThis.document,
  } = {},
) {
  const chips = collectChipsDeep(fragment, { documentRef });
  dock.style.flexDirection = "column";
  dock.style.alignItems = "flex-start";
  // Chips sit side by side while they fit the card width and wrap to the next line otherwise.
  const row1 = documentRef.createElement("div");
  row1.dataset.chipRow = "1";
  Object.assign(row1.style, {
    display: "flex",
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: CHIP_GAP_PX + "px",
    maxWidth: "100%",
  });

  const row2 = documentRef.createElement("div");
  Object.assign(row2.style, {
    display: "none",
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    maxWidth: "100%",
    gap: CHIP_GAP_PX + "px",
    paddingTop: CHIP_GAP_PX + "px",
    position: "relative",
    zIndex: "1",
  });
  dock.style.rowGap = "0px";

  for (const chip of chips) {
    chip.style.maxWidth = "100%";
    if (compact) Object.assign(chip.style, { fontSize: "9.5px", padding: "1px 5px", borderWidth: "1.5px" });
  }
  if (chips.length <= limit) {
    row1.append(...chips);
    dock.append(row1);
    return;
  }

  const visible = chips.slice(0, limit);
  const hidden = chips.slice(limit);
  row1.append(...visible);
  row2.append(...hidden);

  const more = documentRef.createElement("button");
  more.type = "button";
  more.textContent = "…";
  more.dataset.cardSelectionIgnore = "1";
  more.setAttribute("aria-expanded", "false");
  more.setAttribute("aria-label", `Mostra altri ${hidden.length} effetti`);
  styleChipPill(more, { compact });
  Object.assign(more.style, {
    minHeight: "16px",
    height: "16px",
    padding: "0 6px",
    fontSize: "11px",
    fontFamily: "inherit",
    borderColor: "rgba(255,255,255,.24)",
    boxShadow: "none",
  });
  more.title = `Mostra altri ${hidden.length} effetti`;
  let expanded = false;

  more.addEventListener("click", (event) => {
    event.stopPropagation();
    expanded = !expanded;
    row2.style.display = expanded ? "flex" : "none";
    more.setAttribute("aria-expanded", expanded ? "true" : "false");
    more.setAttribute(
      "aria-label",
      expanded ? "Comprimi effetti" : `Mostra altri ${hidden.length} effetti`,
    );
    more.textContent = expanded ? "−" : "…";
    more.style.background = expanded ? "rgba(59,130,246,.64)" : "rgba(0,0,0,.72)";
    more.title = expanded ? "Comprimi effetti" : `Mostra altri ${hidden.length} effetti`;
    const ownerCard = dock.closest('[data-tracker-card="1"]');
    const ownerZIndex = ownerCard?.style.zIndex || "";
    if (ownerCard) ownerCard.style.zIndex = expanded ? "30" : ownerZIndex;
  });

  row1.appendChild(more);
  dock.append(row1, row2);
}

// The card grows to hold the visible chip lines, measured on screen. The parameters live in data
// attributes, so they survive the tracker reconciling a live card with a freshly built one; after
// every render (and on resize) one sweep measures every card on screen. The "…" list stays an overlay.
const CHIP_DOCK_CARD_SELECTOR = "[data-chip-dock-card='1']";
let chipDockResizeBound = false;
let chipDockSweepScheduled = false;

export function syncChipDockCardHeight(card) {
  if (!card?.isConnected || card.dataset?.chipDockCard !== "1") return false;
  const baseHeight = Number(card.dataset.chipBaseHeight) || 0;
  const dockTop = Number(card.dataset.chipDockTop) || 0;
  const row = card.querySelector?.("[data-chip-dock='1'] [data-chip-row='1']")
    || card.querySelector?.("[data-chip-dock='1']")?.firstElementChild;
  const lines = Math.ceil(Number(row?.offsetHeight) || 0);
  const height = Math.max(baseHeight, lines ? dockTop + lines + 3 : baseHeight);
  if (card.style.height !== `${height}px`) card.style.height = `${height}px`;
  return true;
}

function sweepChipDockCards(documentRef) {
  for (const card of documentRef?.querySelectorAll?.(CHIP_DOCK_CARD_SELECTOR) || []) syncChipDockCardHeight(card);
}

export function fitCardToChipDock(card, dock, { baseHeight, dockTop, windowRef = globalThis.window } = {}) {
  if (!card || !dock) return;
  card.dataset.chipDockCard = "1";
  card.dataset.chipBaseHeight = String(Number(baseHeight) || 0);
  card.dataset.chipDockTop = String(Number(dockTop) || 0);
  dock.dataset.chipDock = "1";
  const frame = windowRef?.requestAnimationFrame?.bind(windowRef);
  if (frame && !chipDockSweepScheduled) {
    chipDockSweepScheduled = true;
    // Before the next paint the render has inserted or reconciled the cards; a second sweep covers late inserts.
    frame(() => {
      chipDockSweepScheduled = false;
      sweepChipDockCards(windowRef.document);
      frame(() => sweepChipDockCards(windowRef.document));
    });
  }
  if (!chipDockResizeBound && windowRef?.addEventListener) {
    chipDockResizeBound = true;
    windowRef.addEventListener("resize", () => sweepChipDockCards(windowRef.document));
  }
}

export function bindReferenceChips(dock) {
  for (const chip of dock.querySelectorAll("[data-reference-entry]")) {
    const hasNestedAction = !!chip.querySelector("button");
    chip.dataset.cardSelectionIgnore = "1";
    chip.setAttribute("role", hasNestedAction ? "group" : "button");
    chip.setAttribute("tabindex", "0");
    chip.title = `${chip.title ? `${chip.title} · ` : ""}Apri nell'Enciclopedia DM`;
    const open = (event) => {
      event.preventDefault();
      event.stopPropagation();
      void openReferencePopover({
        tab: chip.dataset.referenceType === "spells" ? "spells" : "conditions",
        entry: chip.dataset.referenceEntry || "",
      });
    };
    chip.addEventListener("click", open);
    chip.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      open(event);
    });
  }
}
