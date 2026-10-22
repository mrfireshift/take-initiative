import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import {
  createMenuMessage,
  readStoredMenuPayload,
} from "./menuPopoverProtocolCore.js";
import { sanitizeQuickActions } from "./quickActionsCore.js";
import { trackerQuickActionSummary } from "./trackerQuickActions.js";

const CHANNEL = `${ID}/tracker-quick-actions`;
const PAYLOAD_PREFIX = `${ID}/tracker-quick-actions/`;
const requestId = new URLSearchParams(window.location.search).get("request") || "";
// The room on the side of the click the menu opens towards (initiativeList.js); 0 when unknown.
const ROOM_HEIGHT = Math.max(0, Math.floor(Number(new URLSearchParams(window.location.search).get("maxHeight")) || 0));
const shell = document.querySelector("#shell");
const root = document.querySelector("#menu");
let resizeRevision = 0;
let closeOnBlurArmed = false;
let closeRequested = false;
const EXIT_ANIMATION_MS = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches
  ? 0
  : 90;

function send(type, details = {}) {
  void OBR.broadcast.sendMessage(
    CHANNEL,
    createMenuMessage(requestId, type, details),
    { destination: "LOCAL" },
  ).catch(() => {});
}

function revealMenu() {
  requestAnimationFrame(() => shell?.classList.add("is-open"));
}

function sendAfterExit(type, details = {}) {
  if (closeRequested) return;
  closeRequested = true;
  shell?.classList.remove("is-open");
  shell?.classList.add("is-closing");
  window.setTimeout(() => send(type, details), EXIT_ANIMATION_MS);
}

function requestMenuResize() {
  const revision = ++resizeRevision;
  requestAnimationFrame(async () => {
    if (revision !== resizeRevision || !root) return;
    root.style.maxHeight = "none";
    const naturalHeight = Math.ceil(root.scrollHeight + 2);
    let viewportHeight = 800;
    try { viewportHeight = Number(await OBR.viewport.getHeight()) || viewportHeight; } catch {}
    if (revision !== resizeRevision) return;
    // Never past the room on the menu's side of the click (ROOM_HEIGHT): beyond it the menu scrolls.
    const targetHeight = Math.max(88, Math.min(naturalHeight, viewportHeight - 24, ROOM_HEIGHT || Infinity));
    root.style.maxHeight = `${Math.max(86, targetHeight - 2)}px`;
    root.style.overflowY = naturalHeight > targetHeight ? "auto" : "hidden";
    send("resize", { height: targetHeight });
  });
}

function armClickAwayClose() {
  if (!shell) return;
  shell.tabIndex = -1;
  requestAnimationFrame(() => {
    try {
      window.focus();
      shell.focus({ preventScroll: true });
      closeOnBlurArmed = true;
    } catch {}
  });
}

// The 🪄 menu (spellbookCatalog.js spellbookMenuSections): [{ title, actionIds, inline }]. An inline section
// (the favourites) lists its actions in the menu; the others are submenus, one per spell level.
function menuSections(payload, actions) {
  const ids = new Set(actions.map((action) => action.id));
  return (Array.isArray(payload?.sections) ? payload.sections : [])
    .map((section) => ({
      title: String(section?.title || "").trim(),
      inline: section?.inline === true,
      actionIds: (Array.isArray(section?.actionIds) ? section.actionIds : [])
        .map((id) => String(id || "").trim())
        .filter((id) => ids.has(id)),
    }))
    .filter((section) => section.title && section.actionIds.length);
}

// openSection: the submenu shown, or null for the menu itself.
function render(payload, openSection = null) {
  const actions = sanitizeQuickActions(payload?.actions, { limit: 64 });
  const sections = menuSections(payload, actions);
  if (sections.length) document.body.dataset.tone = "spells";
  const disabledActionIds = new Set(
    (Array.isArray(payload?.disabledActionIds) ? payload.disabledActionIds : [])
      .map((id) => String(id || "").trim())
      .filter(Boolean),
  );
  const actionsById = new Map(actions.map((action) => [action.id, action]));
  const actionsOf = (section) => section.actionIds.map((id) => actionsById.get(id));
  const showMenu = (section) => {
    render(payload, section);
    requestMenuResize();
  };
  root.replaceChildren();

  if (openSection) {
    // A submenu: back to the menu, then the spells of its level.
    const back = document.createElement("button");
    back.type = "button";
    back.className = "back";
    back.title = "Torna al menu";
    const icon = document.createElement("span");
    icon.className = "icon";
    icon.textContent = "‹";
    const label = document.createElement("span");
    label.className = "label";
    label.textContent = openSection.title;
    back.append(icon, label);
    back.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      showMenu(null);
    });
    root.appendChild(back);
    for (const action of actionsOf(openSection)) root.appendChild(actionButton(action, disabledActionIds));
    back.focus({ preventScroll: true });
    return;
  }

  const title = document.createElement("div");
  title.className = "title";
  title.textContent = payload?.title || "Azioni rapide";
  root.appendChild(title);
  if (!sections.length) {
    for (const action of actions) root.appendChild(actionButton(action, disabledActionIds));
    return;
  }
  for (const section of sections) {
    if (section.inline) {
      const heading = document.createElement("div");
      heading.className = "section-title";
      heading.textContent = section.title;
      root.appendChild(heading);
      for (const action of actionsOf(section)) root.appendChild(actionButton(action, disabledActionIds));
      continue;
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = "submenu";
    button.setAttribute("role", "menuitem");
    button.setAttribute("aria-haspopup", "menu");
    button.title = `${section.title}: ${section.actionIds.length} incantesimi`;
    const label = document.createElement("span");
    label.className = "label";
    label.textContent = section.title;
    const count = document.createElement("span");
    count.className = "count";
    count.textContent = String(section.actionIds.length);
    const chevron = document.createElement("span");
    chevron.className = "chevron";
    chevron.textContent = "›";
    button.append(label, count, chevron);
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      showMenu(section);
    });
    root.appendChild(button);
  }
}

// One action of the menu: its icon, name and summary; a click runs it on the card.
function actionButton(action, disabledActionIds) {
  const button = document.createElement("button");
  const disabled = disabledActionIds.has(action.id);
  button.type = "button";
  button.setAttribute("role", "menuitem");
  button.disabled = disabled;
  button.setAttribute("aria-disabled", String(disabled));
  button.title = disabled
    ? `${trackerQuickActionSummary(action)} · Già attiva`
    : trackerQuickActionSummary(action);

  const icon = document.createElement("span");
  icon.className = "icon";
  icon.textContent = action.kind === "condition"
    ? "C"
    : action.kind === "feature"
      ? "◆"
      : action.kind === "attack"
        ? (action.source?.kind === "cantrip" ? "✧" : "⚔")
        : "✦";
  const copy = document.createElement("span");
  copy.className = "copy";
  const label = document.createElement("span");
  label.className = "label";
  label.textContent = action.label;
  const detail = document.createElement("span");
  detail.className = "detail";
  detail.textContent = trackerQuickActionSummary(action);
  copy.append(label, detail);
  button.append(icon, copy);
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    sendAfterExit("action", { actionId: action.id });
  });
  return button;
}

const payload = readStoredMenuPayload(localStorage, PAYLOAD_PREFIX, requestId);
if (requestId && payload && sanitizeQuickActions(payload.actions, { limit: 64 }).length) {
  render(payload);
  revealMenu();
  requestMenuResize();
  armClickAwayClose();
  if (document.fonts?.ready) {
    void document.fonts.ready.then(requestMenuResize).catch(() => {});
  }
} else {
  root.textContent = "Azioni rapide non disponibili";
  revealMenu();
  requestMenuResize();
}

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") sendAfterExit("close");
});
window.addEventListener("blur", () => {
  if (closeOnBlurArmed) sendAfterExit("close");
});
