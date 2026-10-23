import { isAttackQuickAction, sanitizeQuickAction, sanitizeQuickActions } from "./quickActionsCore.js";
import { isSpellbookQuickAction } from "./spellbookCore.js";
import { extendHitArea } from "./hitAreaCore.js";

const QUICK_ACTION_BUTTON_SIZE = 22;
const CLASSIC_COMBAT_BADGE_SIZE = 18;
const CLASSIC_COMBAT_BADGE_LEFT = -15;
const CLASSIC_QUICK_ACTION_LEFT = CLASSIC_COMBAT_BADGE_LEFT
  - ((QUICK_ACTION_BUTTON_SIZE - CLASSIC_COMBAT_BADGE_SIZE) / 2);
// ⚡ and the attack console's 🗡️ are 15px circles with a 1px ring. In the classic card they stand in a column
// centred on the portrait (the card's header, whatever rows of chips the card grows), rings touching: they are the
// GM's, and the GM view has no active-turn badge on that side of the portrait (initiativeCardClassicBuilder.js: the
// active card has its halo instead).
const LAUNCHER_SIZE = 15;
const LAUNCHER_RING = 1;
const LAUNCHER_PITCH = LAUNCHER_SIZE + 2 * LAUNCHER_RING;
// Fixed slots in pitches from the portrait's centre, so each keeps its place on a card without the other: ⚡ half a
// pitch above, the console half a pitch below (the 🪄 and 🗡️ menus, no longer on the card, keep their slots).
// The column straddles the portrait rim, a few px left of where the badge stands in the player view, towards
// the list's edge; no further, or the list would clip the ring of the active card (scaled 1.035 about its centre).
const CLASSIC_LAUNCHER_AXIS = -12;
const CLASSIC_LAUNCHER_SLOT = Object.freeze({ quick: -0.5, console: 0.5, spells: 0, attacks: 1 });
// The compact card: a column on the portrait's right, rings touching as in the classic card, the first circle level
// with the portrait's top. The initiative badge and the character sheet hold the left side, the KO badge sits on the
// portrait; only an Epic Boss keeps a badge in the top-right corner ("E"), and there the column starts below it.
const COMPACT_LAUNCHER_AXIS_RIGHT = 13.5;
const COMPACT_LAUNCHER_FIRST_CENTER = 15.5;
const COMPACT_LAUNCHER_BELOW_CORNER_CENTER = 42.5;

// Position of a compact launcher of `size` px in slot `offset` of the column.
export function compactLauncherSlot(offset, size, { belowCorner = false } = {}) {
  const index = Math.max(0, Math.floor(Number(offset) || 0));
  const firstCenter = belowCorner ? COMPACT_LAUNCHER_BELOW_CORNER_CENTER : COMPACT_LAUNCHER_FIRST_CENTER;
  return {
    left: "auto",
    right: px(COMPACT_LAUNCHER_AXIS_RIGHT - size / 2),
    top: px(firstCenter + index * LAUNCHER_PITCH - size / 2),
  };
}

function px(value) {
  return `${Math.round(value * 10) / 10}px`;
}

function launcherPosition(group, offset, compact, belowCorner = false) {
  if (compact) return compactLauncherSlot(offset, LAUNCHER_SIZE, { belowCorner });
  const slot = CLASSIC_LAUNCHER_SLOT[group] ?? 0;
  const top = Math.round((slot * LAUNCHER_PITCH - LAUNCHER_SIZE / 2) * 10) / 10;
  return {
    left: px(CLASSIC_LAUNCHER_AXIS - LAUNCHER_SIZE / 2),
    right: "auto",
    top: `calc(50% ${top < 0 ? "-" : "+"} ${Math.abs(top)}px)`,
  };
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
  if (normalized.kind === "attack" && normalized.source?.kind === "spell") {
    const count = normalized.source.spellIds?.length || 0;
    return count ? `Incantesimo d'attacco · ${count} ${count === 1 ? "conosciuto" : "conosciuti"}` : "Incantesimo d'attacco · scegli al lancio";
  }
  if (normalized.kind === "attack") {
    const range = normalized.range === "ranged" ? "distanza" : "mischia";
    const count = normalized.components?.length || 0;
    return `Attacco · ${range} · ${count} ${count === 1 ? "componente" : "componenti"}`;
  }
  const launch = normalized.launchMode === "review" ? "revisione" : "lancio rapido";
  // A spell of the character's spellbook (spellbookCore.js), listed in the 🪄 menu: no kind to repeat.
  if (isSpellbookQuickAction(normalized)) return `${launch[0].toUpperCase()}${launch.slice(1)} · ${target}`;
  return `Incantesimo · ${launch} · ${target}`;
}

// The quick actions (⚡), the spellbook (🪄) and the attacks (⚔) of a card: one launcher each, over the same menu.
const TRACKER_LAUNCHER_GROUPS = Object.freeze({
  quick: { icon: "⚡", name: "azioni rapide", border: "#fde047", color: "#fef08a", open: "rgba(161,98,7,.94)", ring: "rgba(253,224,71,.22)" },
  spells: { icon: "🪄", name: "incantesimi", border: "#a78bfa", color: "#ddd6fe", open: "rgba(91,33,182,.94)", ring: "rgba(167,139,250,.24)" },
  attacks: { icon: "🗡️", name: "attacchi", border: "#fb923c", color: "#fed7aa", open: "rgba(154,52,18,.94)", ring: "rgba(251,146,60,.24)" },
});

// Whether the attack console has something to show for this card (its attacks, breath, spells or features), read
// from the card alone so the tracker does not load the console's catalogs: attack quick actions, spells in the book,
// a class or a species. A card that passes with nothing to show opens the console on its empty state.
export function trackerHasConsoleEntries(card) {
  const value = card && typeof card === "object" ? card : {};
  const quickActions = Array.isArray(value.quickActions) ? value.quickActions : [];
  return quickActions.some((action) => isAttackQuickAction(action))
    || (Array.isArray(value.spellbook?.spellIds) && value.spellbook.spellIds.length > 0)
    || (Array.isArray(value.characterBuild) && value.characterBuild.some((entry) => entry?.classId))
    || !!String(value.species?.id || "").trim();
}

// The attack console's launcher: one click opens the console for this actor (no menu). It replaces the 🪄 and 🗡️
// menus on the card: the console lists the same spellbook and attacks, its features too.
export function buildTrackerConsoleLauncher({
  offset = 0,
  compact = false,
  belowCorner = false,
  onOpen = () => {},
  documentRef = globalThis.document,
} = {}) {
  if (!documentRef) return null;
  const look = TRACKER_LAUNCHER_GROUPS.attacks;
  const position = launcherPosition("console", offset, compact, belowCorner);
  const container = documentRef.createElement("div");
  container.dataset.trackerConsoleLauncher = "1";
  container.dataset.cardSelectionIgnore = "1";
  Object.assign(container.style, {
    position: "absolute", left: position.left, right: position.right, bottom: "auto", top: position.top, zIndex: "12", pointerEvents: "auto",
  });
  const button = documentRef.createElement("button");
  button.type = "button";
  button.textContent = look.icon;
  button.title = "Apri la console attacchi";
  button.setAttribute("aria-label", button.title);
  button.dataset.cardSelectionIgnore = "1";
  Object.assign(button.style, {
    boxSizing: "border-box", minWidth: `${LAUNCHER_SIZE}px`, width: `${LAUNCHER_SIZE}px`, height: `${LAUNCHER_SIZE}px`, padding: "0",
    display: "flex", alignItems: "center", justifyContent: "center", border: "0", borderRadius: "50%",
    background: "linear-gradient(180deg,rgba(51,65,85,.98),rgba(15,23,42,.98))", color: look.color,
    fontSize: "9px", fontWeight: "700", lineHeight: "1", cursor: "pointer",
    boxShadow: `0 0 0 ${LAUNCHER_RING}px ${look.border},0 2px 6px rgba(0,0,0,.85)`,
  });
  // The same 24px click area as the other launchers.
  extendHitArea(button, { documentRef });
  button.addEventListener("pointerdown", (event) => { event.preventDefault(); event.stopPropagation(); });
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    onOpen(event);
  });
  container.appendChild(button);
  container.__consoleButton = button;
  return container;
}

// The group of an action: the spellbook's spells (spellbookCore.js), the attacks, the other quick actions.
export function trackerQuickActionGroup(action) {
  if (isSpellbookQuickAction(action)) return "spells";
  return isAttackQuickAction(action) ? "attacks" : "quick";
}

export function trackerQuickActionsForGroup(actions, group = "quick") {
  return sanitizeQuickActions(actions, { limit: 64, attackLimit: 64 })
    .filter((action) => trackerQuickActionGroup(action) === group);
}

// offset: the launcher's place in the compact card's column (the classic card has fixed slots per group).
// belowCorner: the compact card has a badge in its top-right corner (an Epic Boss's "E").
export function buildTrackerQuickActionLauncher({
  actions = [],
  group = "quick",
  offset = 0,
  compact = false,
  belowCorner = false,
  expanded = false,
  onToggle = () => {},
  documentRef = globalThis.document,
} = {}) {
  const normalizedActions = trackerQuickActionsForGroup(actions, group);
  if (!normalizedActions.length || !documentRef) return null;
  const look = TRACKER_LAUNCHER_GROUPS[group] || TRACKER_LAUNCHER_GROUPS.quick;
  const position = launcherPosition(group, offset, compact, belowCorner);

  const container = documentRef.createElement("div");
  container.dataset.trackerQuickActions = group === "quick" ? "1" : group;
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
  toggle.dataset.trackerQuickActionToggle = group === "quick" ? "1" : group;
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
    fontSize: "9px",
    fontWeight: "700",
    lineHeight: "1",
    cursor: "pointer",
    // The ring is drawn outside the circle, like the badge's.
    boxShadow: expanded
      ? `0 0 0 ${LAUNCHER_RING}px ${look.border},0 0 0 ${LAUNCHER_RING + 2}px ${look.ring},0 2px 6px rgba(0,0,0,.85)`
      : `0 0 0 ${LAUNCHER_RING}px ${look.border},0 2px 6px rgba(0,0,0,.85)`,
  });

  // The circle stays 15px; a 24px square around it takes the clicks. Neighbouring launchers are 17-20px apart, so
  // their squares overlap by a few px, where the later launcher answers.
  extendHitArea(toggle, { documentRef });

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
  belowCorner = false,
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
  // Compact: a slot of the launchers' column, centred on its axis.
  const compactSlot = compact ? compactLauncherSlot(offset, QUICK_ACTION_BUTTON_SIZE, { belowCorner }) : null;
  Object.assign(button.style, {
    position: "absolute",
    left: compact ? compactSlot.left : `${CLASSIC_QUICK_ACTION_LEFT + step}px`,
    right: compact ? compactSlot.right : "auto",
    top: compact ? compactSlot.top : "2px",
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
