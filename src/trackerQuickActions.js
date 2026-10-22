import { isAttackQuickAction, sanitizeQuickAction, sanitizeQuickActions } from "./quickActionsCore.js";
import { isSpellbookQuickAction } from "./spellbookCore.js";

const QUICK_ACTION_BUTTON_SIZE = 22;
const CLASSIC_COMBAT_BADGE_SIZE = 18;
const CLASSIC_COMBAT_BADGE_LEFT = -15;
const CLASSIC_QUICK_ACTION_LEFT = CLASSIC_COMBAT_BADGE_LEFT
  - ((QUICK_ACTION_BUTTON_SIZE - CLASSIC_COMBAT_BADGE_SIZE) / 2);
// ⚡ and ⚔ have the geometry of the active-turn badge (initiativeCardClassicBuilder.js): an 18px circle with
// a 2px ring. In the classic card they stand in a column above it, on its left edge: the badge sits at
// top 50% + translateY(55%) of its size, each launcher one pitch (circle + both rings) higher, rings touching.
const LAUNCHER_SIZE = CLASSIC_COMBAT_BADGE_SIZE;
const LAUNCHER_RING = 2;
const LAUNCHER_PITCH = LAUNCHER_SIZE + 2 * LAUNCHER_RING;
const CLASSIC_COMBAT_BADGE_TOP_OFFSET = 0.55 * CLASSIC_COMBAT_BADGE_SIZE;
// Fixed slots, top to bottom, so 🗡️ keeps its place on a card without ⚡.
// The column straddles the portrait rim, a few px left of the badge, towards the list's edge; no further, or
// the list would clip the ring of the active card (scaled 1.035 about its centre).
const CLASSIC_LAUNCHER_LEFT = -21;
const CLASSIC_LAUNCHER_SLOT = Object.freeze({ quick: 0, attacks: 1 });

function launcherPosition(group, offset, compact) {
  if (compact) {
    const index = Math.max(0, Math.floor(Number(offset) || 0));
    return { left: "auto", right: `${20 + index * (LAUNCHER_PITCH + 4)}px`, top: "37px" };
  }
  const above = 2 - (CLASSIC_LAUNCHER_SLOT[group] ?? 0);
  const top = Math.round((CLASSIC_COMBAT_BADGE_TOP_OFFSET - above * LAUNCHER_PITCH) * 10) / 10;
  return { left: `${CLASSIC_LAUNCHER_LEFT}px`, right: "auto", top: `calc(50% - ${Math.abs(top)}px)` };
}

export function trackerQuickActionSummary(action) {
  const normalized = sanitizeQuickAction(action) || action || {};
  const target = normalized.targetMode === "self" ? "su di sé" : "bersaglio selezionato";
  if (normalized.kind === "condition") {
    return `${normalized.conditionName} · ${target}`;
  }
  if (normalized.kind === "feature") {
    return `Capacità · ${target}`;
  }
  if (normalized.kind === "attack" && normalized.source?.kind === "cantrip") {
    const count = normalized.source.spellIds?.length || 0;
    return count ? `Trucchetto · ${count} ${count === 1 ? "conosciuto" : "conosciuti"}` : "Trucchetto · scegli al lancio";
  }
  if (normalized.kind === "attack") {
    const range = normalized.range === "ranged" ? "distanza" : "mischia";
    const count = normalized.components?.length || 0;
    return `Attacco · ${range} · ${count} ${count === 1 ? "componente" : "componenti"}`;
  }
  const launch = normalized.launchMode === "review" ? "revisione" : "lancio rapido";
  // A favourite of the character's spellbook (spellbookCore.js) rather than a quick action of its own.
  const source = isSpellbookQuickAction(normalized) ? "Incantesimi" : "Incantesimo";
  return `${source} · ${launch} · ${target}`;
}

// The quick actions (⚡) and the attacks (⚔) of a card: one launcher each, over the same menu.
const TRACKER_LAUNCHER_GROUPS = Object.freeze({
  quick: { icon: "⚡", name: "azioni rapide", border: "#fde047", color: "#fef08a", open: "rgba(161,98,7,.94)", ring: "rgba(253,224,71,.22)" },
  attacks: { icon: "🗡️", name: "attacchi", border: "#fb923c", color: "#fed7aa", open: "rgba(154,52,18,.94)", ring: "rgba(251,146,60,.24)" },
});

export function trackerQuickActionsForGroup(actions, group = "quick") {
  return sanitizeQuickActions(actions, { limit: 64, attackLimit: 64 })
    .filter((action) => isAttackQuickAction(action) === (group === "attacks"));
}

// offset: the launcher's place in the compact card's row (the classic card has fixed slots per group).
export function buildTrackerQuickActionLauncher({
  actions = [],
  group = "quick",
  offset = 0,
  compact = false,
  expanded = false,
  onToggle = () => {},
  documentRef = globalThis.document,
} = {}) {
  const normalizedActions = trackerQuickActionsForGroup(actions, group);
  if (!normalizedActions.length || !documentRef) return null;
  const look = TRACKER_LAUNCHER_GROUPS[group] || TRACKER_LAUNCHER_GROUPS.quick;
  const position = launcherPosition(group, offset, compact);

  const container = documentRef.createElement("div");
  container.dataset.trackerQuickActions = group === "attacks" ? "attacks" : "1";
  container.dataset.cardSelectionIgnore = "1";
  Object.assign(container.style, {
    position: "absolute",
    left: position.left,
    right: position.right,
    bottom: "auto",
    top: position.top,
    zIndex: "12",
    pointerEvents: "auto",
  });

  const toggle = documentRef.createElement("button");
  toggle.type = "button";
  toggle.textContent = look.icon;
  toggle.title = `${expanded ? "Chiudi" : "Apri"} ${look.name} (${normalizedActions.length})`;
  toggle.setAttribute("aria-label", toggle.title);
  toggle.setAttribute("aria-haspopup", "menu");
  toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
  toggle.dataset.cardSelectionIgnore = "1";
  toggle.dataset.trackerQuickActionToggle = group === "attacks" ? "attacks" : "1";
  Object.assign(toggle.style, {
    boxSizing: "border-box",
    minWidth: `${LAUNCHER_SIZE}px`,
    width: `${LAUNCHER_SIZE}px`,
    height: `${LAUNCHER_SIZE}px`,
    padding: "0",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "0",
    borderRadius: "50%",
    background: expanded
      ? look.open
      : "linear-gradient(180deg,rgba(51,65,85,.98),rgba(15,23,42,.98))",
    color: look.color,
    fontSize: "12px",
    fontWeight: "700",
    lineHeight: "1",
    cursor: "pointer",
    // The ring is drawn outside the circle, like the badge's.
    boxShadow: expanded
      ? `0 0 0 ${LAUNCHER_RING}px ${look.border},0 0 0 ${LAUNCHER_RING + 2}px ${look.ring},0 2px 6px rgba(0,0,0,.85)`
      : `0 0 0 ${LAUNCHER_RING}px ${look.border},0 2px 6px rgba(0,0,0,.85)`,
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

// Boss Actions entry on an Epic Boss card: the same round control as the quick-actions toggle, red like
// the "Boss Epico" pill. Without a bound profile it is dimmed and still opens the console (to bind one).
// offset moves it one slot aside when the card also shows the quick-actions toggle.
export function buildBossActionsLauncher({
  bound = false,
  compact = false,
  offset = 0,
  iconUrl = "",
  onOpen = () => {},
  documentRef = globalThis.document,
} = {}) {
  if (!documentRef) return null;
  const button = documentRef.createElement("button");
  button.type = "button";
  button.title = bound ? "Boss Actions" : "Boss Actions: collega un profilo";
  button.setAttribute("aria-label", button.title);
  button.dataset.cardSelectionIgnore = "1";
  button.dataset.bossActionsLauncher = bound ? "bound" : "unbound";
  const step = Math.max(0, Number(offset) || 0) * (QUICK_ACTION_BUTTON_SIZE + 4);
  Object.assign(button.style, {
    position: "absolute",
    left: compact ? "auto" : `${CLASSIC_QUICK_ACTION_LEFT + step}px`,
    right: compact ? `${18 + step}px` : "auto",
    top: compact ? "35px" : "2px",
    zIndex: "12",
    pointerEvents: "auto",
    boxSizing: "border-box",
    minWidth: `${QUICK_ACTION_BUTTON_SIZE}px`,
    width: `${QUICK_ACTION_BUTTON_SIZE}px`,
    height: `${QUICK_ACTION_BUTTON_SIZE}px`,
    padding: "0",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: `2px solid ${bound ? "#f87171" : "rgba(248,113,113,.45)"}`,
    borderRadius: "50%",
    background: "linear-gradient(180deg,rgba(51,65,85,.98),rgba(15,23,42,.98))",
    color: bound ? "#fecaca" : "rgba(254,202,202,.5)",
    fontSize: "11px",
    lineHeight: "1",
    cursor: "pointer",
    boxShadow: "0 2px 7px rgba(0,0,0,.58),inset 0 1px 0 rgba(255,255,255,.12)",
  });
  if (iconUrl) {
    // The boss.svg outline, painted in the button colour through a mask.
    const icon = documentRef.createElement("span");
    icon.setAttribute("aria-hidden", "true");
    const mask = `url("${iconUrl}") center / contain no-repeat`;
    Object.assign(icon.style, {
      display: "block",
      width: "14px",
      height: "14px",
      backgroundColor: "currentColor",
      mask,
      WebkitMask: mask,
    });
    button.appendChild(icon);
  } else {
    button.textContent = "B";
  }
  const stopPointer = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };
  button.addEventListener("pointerdown", stopPointer);
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    onOpen(event);
  });
  return button;
}
