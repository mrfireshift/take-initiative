// Compact tracker: a creature's linked tokens and summons beside its card instead of a stack under it, so the bar
// never grows downwards. Closed, a narrow tab on the card's right shows up to three portraits and the count; open, the
// companion rows (the extended card's, with their HP editor and click-to-select) stand in columns as tall as the card,
// and the cards after it move right. Which drawers are open is remembered for the session, per caster and spells.
import { appendCompactSideDock } from "./initiativeCardCompact.js";
import { buildSpellBoardTokenCompanionCard } from "./spellBoardTokenTrackerCore.js";

const openDrawers = new Set();

export const COMPACT_COMPANION_TAB_WIDTH = 22;
const ROWS_PER_COLUMN = 4;
const ROW_HEIGHT = 24;
const ROW_GAP = 2;
// Room for a name and "HP 495 / 495" side by side.
const COLUMN_WIDTH = 172;
const COLUMN_GAP = 6;
// The rows' portraits stand 8px out of their left edge.
const PANEL_PADDING_LEFT = 12;
const PANEL_PADDING = 4;

function normalizedId(value) {
  return String(value || "").trim();
}

export function compactCompanionDrawerKey(companions = []) {
  const list = Array.isArray(companions) ? companions : [];
  return [
    normalizedId(list[0]?.casterId) || "unknown-caster",
    ...[...new Set(list.map((companion) => normalizedId(companion?.instanceId)))].sort(),
  ].join("|");
}

// Width of the open panel: one column per four companions.
export function compactCompanionPanelWidth(count) {
  const columns = Math.max(1, Math.ceil(Math.max(0, Number(count) || 0) / ROWS_PER_COLUMN));
  return PANEL_PADDING_LEFT + PANEL_PADDING + columns * COLUMN_WIDTH + (columns - 1) * COLUMN_GAP;
}

export function compactCompanionSummary(companions = []) {
  const list = Array.isArray(companions) ? companions : [];
  const hasShared = list.some((companion) => companion?.sharedHp);
  const hasSummons = list.some((companion) => !companion?.sharedHp);
  const kind = hasShared && hasSummons
    ? "Token collegati ed evocazioni"
    : hasShared
      ? (list.length === 1 ? "Token collegato" : "Token collegati")
      : (list.length === 1 ? "Evocazione" : "Evocazioni");
  return `${kind} · ${list.length}`;
}

export function appendCompactCompanionDrawer(
  card,
  companions = [],
  {
    faction = null,
    onBindHP = null,
    onSelect = null,
    onOpenCard = null,
    onOpenActions = null,
    selectedIds = null,
    onLayoutChange = null,
    documentRef = globalThis.document,
  } = {},
) {
  const list = Array.isArray(companions) ? companions.filter(Boolean) : [];
  if (!card || !list.length || !documentRef?.createElement) return null;
  const key = compactCompanionDrawerKey(list);
  const border = faction?.border || "rgba(147,197,253,.72)";
  const summary = compactCompanionSummary(list);

  const dockElement = documentRef.createElement("div");
  dockElement.dataset.compactCompanionDrawer = "1";
  dockElement.dataset.cardSelectionIgnore = "1";
  Object.assign(dockElement.style, {
    display: "flex",
    alignItems: "stretch",
    gap: "3px",
    zIndex: "6",
    pointerEvents: "auto",
  });
  // Clicks in the drawer stay there: on the card they would select the caster.
  dockElement.addEventListener?.("click", (event) => event?.stopPropagation?.());
  dockElement.addEventListener?.("pointerdown", (event) => event?.stopPropagation?.());

  const tab = documentRef.createElement("button");
  tab.type = "button";
  tab.dataset.compactCompanionTab = "1";
  Object.assign(tab.style, {
    flex: `0 0 ${COMPACT_COMPANION_TAB_WIDTH}px`,
    width: `${COMPACT_COMPANION_TAB_WIDTH}px`,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "3px",
    padding: "4px 0",
    boxSizing: "border-box",
    border: `1px solid ${border}`,
    borderRadius: "8px",
    background: "rgba(13,18,27,.86)",
    color: "#fff",
    font: "inherit",
    fontSize: "var(--obrt-type-micro, 10px)",
    fontWeight: "800",
    lineHeight: "1",
    cursor: "pointer",
  });
  list.slice(0, 3).forEach((companion, index) => {
    const portrait = documentRef.createElement("img");
    portrait.src = companion.iconUrl || "/quick-damage.svg";
    portrait.alt = "";
    portrait.setAttribute("aria-hidden", "true");
    Object.assign(portrait.style, {
      width: "16px",
      height: "16px",
      marginTop: index ? "-6px" : "0",
      borderRadius: "50%",
      border: `1px solid ${border}`,
      boxSizing: "border-box",
      background: "#0f172a",
      objectFit: "cover",
      pointerEvents: "none",
    });
    tab.appendChild(portrait);
  });
  const count = documentRef.createElement("span");
  count.textContent = String(list.length);
  count.style.pointerEvents = "none";
  const chevron = documentRef.createElement("span");
  chevron.style.pointerEvents = "none";
  chevron.style.opacity = ".8";
  tab.appendChild(count);
  tab.appendChild(chevron);

  const panel = documentRef.createElement("div");
  panel.dataset.compactCompanionPanel = "1";
  Object.assign(panel.style, {
    flex: "0 0 auto",
    display: "grid",
    gridAutoFlow: "column",
    gridTemplateRows: `repeat(${Math.min(ROWS_PER_COLUMN, list.length)}, ${ROW_HEIGHT}px)`,
    gridAutoColumns: `${COLUMN_WIDTH}px`,
    alignContent: "center",
    columnGap: `${COLUMN_GAP}px`,
    rowGap: `${ROW_GAP}px`,
    padding: `${PANEL_PADDING}px ${PANEL_PADDING}px ${PANEL_PADDING}px ${PANEL_PADDING_LEFT}px`,
    boxSizing: "border-box",
    border: `1px solid ${border}`,
    borderRadius: "8px",
    background: "rgba(13,18,27,.72)",
  });
  for (const companion of list) {
    const row = buildSpellBoardTokenCompanionCard(companion, {
      compact: false,
      faction,
      onBindHP,
      onSelect,
      onOpenCard,
      onOpenActions,
      selectedIds,
      documentRef,
    });
    row.style.minWidth = "0";
    panel.appendChild(row);
  }

  dockElement.appendChild(tab);
  dockElement.appendChild(panel);
  const dock = appendCompactSideDock(card, dockElement, COMPACT_COMPANION_TAB_WIDTH);

  const apply = () => {
    const open = openDrawers.has(key);
    panel.style.display = open ? "grid" : "none";
    chevron.textContent = open ? "◂" : "▸";
    tab.title = `${summary}: ${open ? "chiudi" : "apri"}`;
    tab.setAttribute("aria-label", tab.title);
    tab.setAttribute("aria-expanded", String(open));
    dock.resize(open ? COMPACT_COMPANION_TAB_WIDTH + 3 + compactCompanionPanelWidth(list.length) : COMPACT_COMPANION_TAB_WIDTH);
  };
  tab.addEventListener?.("click", (event) => {
    event?.stopPropagation?.();
    if (openDrawers.has(key)) openDrawers.delete(key);
    else openDrawers.add(key);
    apply();
    onLayoutChange?.();
    // The strip scrolls so the opened drawer shows whole.
    if (openDrawers.has(key)) panel.scrollIntoView?.({ block: "nearest", inline: "nearest", behavior: "smooth" });
  });
  apply();
  return dockElement;
}
