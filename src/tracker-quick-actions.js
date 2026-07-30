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
const shell = document.querySelector("#shell");
const root = document.querySelector("#menu");
let resizeRevision = 0;
let closeOnBlurArmed = false;

function send(type, details = {}) {
  void OBR.broadcast.sendMessage(
    CHANNEL,
    createMenuMessage(requestId, type, details),
    { destination: "LOCAL" },
  ).catch(() => {});
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
    const targetHeight = Math.max(88, Math.min(naturalHeight, viewportHeight - 24));
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

function render(payload) {
  const actions = sanitizeQuickActions(payload?.actions);
  root.replaceChildren();
  const title = document.createElement("div");
  title.className = "title";
  title.textContent = payload?.title || "Azioni rapide";
  root.appendChild(title);

  for (const action of actions) {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("role", "menuitem");
    button.title = trackerQuickActionSummary(action);

    const icon = document.createElement("span");
    icon.className = "icon";
    icon.textContent = action.kind === "condition" ? "C" : "✦";
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
      send("action", { actionId: action.id });
    });
    root.appendChild(button);
  }
}

const payload = readStoredMenuPayload(localStorage, PAYLOAD_PREFIX, requestId);
if (requestId && payload && sanitizeQuickActions(payload.actions).length) {
  render(payload);
  requestMenuResize();
  armClickAwayClose();
  if (document.fonts?.ready) {
    void document.fonts.ready.then(requestMenuResize).catch(() => {});
  }
} else {
  root.textContent = "Azioni rapide non disponibili";
  requestMenuResize();
}

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") send("close");
});
window.addEventListener("blur", () => {
  if (closeOnBlurArmed) send("close");
});
