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
  const row1 = documentRef.createElement("div");
  Object.assign(row1.style, {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: CHIP_GAP_PX + "px",
  });

  const row2 = documentRef.createElement("div");
  Object.assign(row2.style, {
    display: "none",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: "0px",
    paddingTop: "0px",
    position: "relative",
    zIndex: "1",
  });
  dock.style.rowGap = "0px";

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
  more.textContent = `+${hidden.length}`;
  more.dataset.cardSelectionIgnore = "1";
  more.setAttribute("aria-expanded", "false");
  more.setAttribute("aria-label", `Mostra altri ${hidden.length} effetti`);
  styleChipPill(more, { compact });
  Object.assign(more.style, {
    minHeight: "16px",
    height: "16px",
    padding: "0 4px",
    fontSize: "10px",
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
    more.textContent = expanded ? "−" : `+${hidden.length}`;
    more.style.background = expanded ? "rgba(59,130,246,.64)" : "rgba(0,0,0,.72)";
    more.title = expanded ? "Comprimi effetti" : `Mostra altri ${hidden.length} effetti`;
    const ownerCard = dock.closest('[data-tracker-card="1"]');
    const ownerZIndex = ownerCard?.style.zIndex || "";
    if (ownerCard) ownerCard.style.zIndex = expanded ? "30" : ownerZIndex;
  });

  row1.appendChild(more);
  dock.append(row1, row2);
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
