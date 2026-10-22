import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import {
  createMenuMessage,
  isAllowedCompactAdminMenuAction,
} from "./menuPopoverProtocolCore.js";

const CHANNEL = `${ID}/compact-admin-menu`;
const params = new URLSearchParams(window.location.search);
const requestId = params.get("request") || "";
// The current mode of the effect labels on the map; choosing the item moves to the next one.
const MAP_LABEL_MODES = Object.freeze({ compact: "compatte", all: "complete", selected: "complete sui selezionati" });
const mapLabelsMode = MAP_LABEL_MODES[params.get("mapLabels")] || MAP_LABEL_MODES.selected;
const shell = document.querySelector("#shell");
const menu = document.querySelector("#menu");
let closeOnBlurArmed = false;

function send(type, action = "") {
  if (type === "action" && !isAllowedCompactAdminMenuAction(action)) return;
  void OBR.broadcast.sendMessage(
    CHANNEL,
    createMenuMessage(requestId, type, { action }),
    { destination: "LOCAL" }
  ).catch(() => {});
}

function iconNode(icon) {
  const node = document.createElement("span");
  node.className = "icon";
  if (icon.endsWith(".svg")) {
    const image = document.createElement("img");
    image.src = `${import.meta.env.BASE_URL || "/"}${icon}`;
    image.alt = "";
    node.appendChild(image);
  } else {
    node.textContent = icon;
  }
  return node;
}

function addAction({ action, label, icon, danger = false, detail = "" }) {
  const button = document.createElement("button");
  button.type = "button";
  button.setAttribute("role", "menuitem");
  if (danger) button.classList.add("danger");
  button.appendChild(iconNode(icon));

  const text = document.createElement("span");
  text.className = "label";
  text.textContent = label;
  if (detail) {
    const value = document.createElement("span");
    value.className = "detail";
    value.textContent = detail;
    text.appendChild(value);
  }
  button.appendChild(text);
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    send("action", action);
  });
  menu.appendChild(button);
}

if (requestId) {
  [
    { action: "reset-round", label: "Reset round", icon: "↺" },
    { action: "history", label: "Cronologia", icon: "history.svg" },
    { action: "add-all", label: "Aggiungi attori", icon: "+" },
    { action: "fill-initiative", label: "Compila iniziativa", icon: "✎" },
    { action: "map-labels", label: "Etichette mappa", detail: mapLabelsMode, icon: "☷" },
    { action: "options", label: "Opzioni", icon: "options.svg" },
    { action: "clear-initiative", label: "Svuota iniziativa", icon: "×", danger: true },
  ].forEach(addAction);

  shell.tabIndex = -1;
  requestAnimationFrame(() => {
    try {
      window.focus();
      shell.focus({ preventScroll: true });
      closeOnBlurArmed = true;
    } catch {}
  });
} else {
  menu.textContent = "Menu non disponibile";
}

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") send("close");
});

window.addEventListener("blur", () => {
  if (closeOnBlurArmed) send("close");
});

document.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  event.stopPropagation();
  send("close");
}, { capture: true });
