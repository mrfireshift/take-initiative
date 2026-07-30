import { sanitizeQuickActions } from "./quickActionsCore.js";

const QUICK_ACTION_BUTTON_SIZE = 22;
const CLASSIC_COMBAT_BADGE_SIZE = 18;
const CLASSIC_COMBAT_BADGE_LEFT = -15;
const CLASSIC_QUICK_ACTION_LEFT = CLASSIC_COMBAT_BADGE_LEFT
  - ((QUICK_ACTION_BUTTON_SIZE - CLASSIC_COMBAT_BADGE_SIZE) / 2);

export function trackerQuickActionSummary(action) {
  const target = action?.targetMode === "self" ? "su di sé" : "bersaglio selezionato";
  if (action?.kind === "condition") {
    return `${action.conditionName} · ${target}`;
  }
  return `${action?.workflow === "area" ? "Area" : "Incantesimo"} · ${target}`;
}

export function buildTrackerQuickActionLauncher({
  actions = [],
  compact = false,
  expanded = false,
  onToggle = () => {},
  documentRef = globalThis.document,
} = {}) {
  const normalizedActions = sanitizeQuickActions(actions);
  if (!normalizedActions.length || !documentRef) return null;

  const container = documentRef.createElement("div");
  container.dataset.trackerQuickActions = "1";
  container.dataset.cardSelectionIgnore = "1";
  Object.assign(container.style, {
    position: "absolute",
    left: compact ? "18px" : `${CLASSIC_QUICK_ACTION_LEFT}px`,
    right: "auto",
    bottom: "auto",
    top: compact ? "1px" : "2px",
    zIndex: "12",
    pointerEvents: "auto",
  });

  const toggle = documentRef.createElement("button");
  toggle.type = "button";
  toggle.textContent = "⚡";
  toggle.title = `${expanded ? "Chiudi" : "Apri"} azioni rapide (${normalizedActions.length})`;
  toggle.setAttribute("aria-label", toggle.title);
  toggle.setAttribute("aria-haspopup", "menu");
  toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
  toggle.dataset.cardSelectionIgnore = "1";
  toggle.dataset.trackerQuickActionToggle = "1";
  Object.assign(toggle.style, {
    boxSizing: "border-box",
    minWidth: `${QUICK_ACTION_BUTTON_SIZE}px`,
    width: `${QUICK_ACTION_BUTTON_SIZE}px`,
    height: `${QUICK_ACTION_BUTTON_SIZE}px`,
    padding: "0",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: "2px solid #fde047",
    borderRadius: "50%",
    background: expanded
      ? "rgba(161,98,7,.94)"
      : "linear-gradient(180deg,rgba(51,65,85,.98),rgba(15,23,42,.98))",
    color: "#fef08a",
    fontSize: "11px",
    fontWeight: "750",
    lineHeight: "1",
    cursor: "pointer",
    boxShadow: expanded
      ? "0 0 0 2px rgba(253,224,71,.22),0 2px 7px rgba(0,0,0,.58)"
      : "0 2px 7px rgba(0,0,0,.58),inset 0 1px 0 rgba(255,255,255,.12)",
  });

  const stopPointer = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };
  toggle.addEventListener("pointerdown", stopPointer);
  toggle.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    onToggle(toggle, event);
  });

  container.appendChild(toggle);
  container.__quickActionToggle = toggle;
  return container;
}
