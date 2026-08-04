import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import {
  createMenuMessage,
  isAllowedInitiativeCardMenuAction,
  readStoredMenuPayload,
} from "./menuPopoverProtocolCore.js";

const CHANNEL = `${ID}/initiative-card-context-menu`;
const PAYLOAD_PREFIX = `${ID}/initiative-card-context-menu/`;
const requestId = new URLSearchParams(window.location.search).get("request") || "";
const shell = document.querySelector("#shell");
const root = document.querySelector("#menu");
let openSubmenu = null;
let resizeRevision = 0;
let lastMeasuredNaturalHeight = 0;
let closeOnBlurArmed = false;
let closeRequested = false;
const EXIT_ANIMATION_MS = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches
  ? 0
  : 90;

function send(type, action = "", value = "", details = {}) {
  if (type === "action" && !isAllowedInitiativeCardMenuAction(action, value)) return;
  void OBR.broadcast.sendMessage(
    CHANNEL,
    createMenuMessage(requestId, type, { action, value, ...details }),
    { destination: "LOCAL" }
  ).catch(() => {});
}

function revealMenu() {
  requestAnimationFrame(() => shell?.classList.add("is-open"));
}

function sendAfterExit(type, action = "", value = "", details = {}) {
  if (closeRequested) return;
  closeRequested = true;
  shell?.classList.remove("is-open");
  shell?.classList.add("is-closing");
  window.setTimeout(
    () => send(type, action, value, details),
    EXIT_ANIMATION_MS,
  );
}

function asset(name) {
  return `${import.meta.env.BASE_URL || "/"}${name}`;
}

function requestMenuResize() {
  const revision = ++resizeRevision;
  requestAnimationFrame(async () => {
    if (revision !== resizeRevision || !root || !shell) return;

    root.style.maxHeight = "none";
    const naturalHeight = Math.ceil(root.scrollHeight + 2);
    let viewportHeight = 800;
    try { viewportHeight = Number(await OBR.viewport.getHeight()) || viewportHeight; } catch {}
    if (revision !== resizeRevision) return;

    const availableHeight = Math.max(120, viewportHeight - 24);
    const targetHeight = Math.max(120, Math.min(naturalHeight, availableHeight));
    root.style.maxHeight = `${Math.max(118, targetHeight - 2)}px`;
    root.style.overflowY = naturalHeight > targetHeight ? "auto" : "hidden";
    lastMeasuredNaturalHeight = naturalHeight;
    send("resize", "", "", { height: targetHeight });
  });
}

function mountResizeObserver() {
  if (!root || typeof ResizeObserver !== "function") return;
  const observer = new ResizeObserver(() => {
    if (root.style.maxHeight === "none") return;
    if (Math.ceil(root.scrollHeight + 2) !== lastMeasuredNaturalHeight) {
      requestMenuResize();
    }
  });
  observer.observe(root);
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

function iconNode(icon, color) {
  if (color) {
    const dot = document.createElement("span");
    dot.className = "dot";
    dot.style.background = color;
    return dot;
  }
  const image = document.createElement("img");
  image.className = "icon";
  image.src = asset(icon);
  image.alt = "";
  if (!["conditions-panel.svg", "spells-panel.svg", "character-sheet.svg"].includes(icon)) {
    image.style.filter = "brightness(0) invert(1)";
  }
  return image;
}

function makeAction(parent, label, icon, action, options = {}) {
  const button = document.createElement("button");
  button.type = "button";
  button.setAttribute("role", "menuitem");
  button.disabled = !!options.disabled;
  button.setAttribute("aria-disabled", String(!!options.disabled));
  if (options.current) button.setAttribute("aria-current", "true");
  if (options.title) button.title = options.title;
  if (options.danger) button.classList.add("danger");

  const row = document.createElement("span");
  row.className = "action";
  row.appendChild(iconNode(icon, options.color));

  const labelNode = document.createElement("span");
  labelNode.className = "label";
  labelNode.textContent = label;
  row.appendChild(labelNode);

  if (options.trailing) {
    const trailing = document.createElement("span");
    trailing.className = "trailing";
    trailing.textContent = options.trailing;
    row.appendChild(trailing);
  }

  button.appendChild(row);
  if (action && !options.disabled) {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      sendAfterExit("action", action, options.value || "");
    });
  }
  parent.appendChild(button);
  return button;
}

function addSubmenu(parent, label, icon, entries) {
  const wrap = document.createElement("div");
  const content = document.createElement("div");
  content.className = "submenu";
  const trigger = makeAction(wrap, label, icon, "", { trailing: ">" });
  trigger.setAttribute("aria-haspopup", "menu");
  trigger.setAttribute("aria-expanded", "false");
  trigger.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (openSubmenu && openSubmenu.content !== content) {
      openSubmenu.content.style.display = "none";
      openSubmenu.trigger.setAttribute("aria-expanded", "false");
    }
    const show = content.style.display !== "block";
    content.style.display = show ? "block" : "none";
    trigger.setAttribute("aria-expanded", String(show));
    openSubmenu = show ? { content, trigger } : null;
    requestMenuResize();
  });
  for (const entry of entries) {
    makeAction(content, entry.label, entry.icon, entry.action, entry.options);
  }
  wrap.appendChild(content);
  parent.appendChild(wrap);
}

function divider(parent) {
  const line = document.createElement("div");
  line.className = "divider";
  parent.appendChild(line);
}

function classFeatureMenuEntries(features) {
  const entries = [];
  for (const feature of Array.isArray(features) ? features : []) {
    const activeInstances = Array.isArray(feature?.activeInstances)
      ? feature.activeInstances
      : [];
    const resourceEntries = Array.isArray(feature?.resources)
      ? feature.resources
      : [];
    const resourceLabel = resourceEntries.length
      ? resourceEntries.map((entry) => entry.unlimited
        ? "∞"
        : `${entry.current ?? "–"}/${entry.maximum ?? "–"}`).join(" · ")
      : "";
    const rangeLabel = feature?.rangeMeters
      ? ` · ${feature.targetLabel || "bersaglio"} ${feature.rangeMeters} m`
      : ` · ${feature.targetLabel || "su di sé"}`;
    const themeColor = feature?.theme?.accent || "#38bdf8";

    if (activeInstances.length) {
      for (const instance of activeInstances) {
        const remaining = Number(instance?.remainingRounds);
        entries.push({
          label: `Termina ${feature.label || feature.plainName || feature.featureId}`,
          icon: "mark.svg",
          action: "class-feature-deactivate",
          options: {
            value: instance?.instanceId,
            color: themeColor,
            danger: true,
            trailing: Number.isFinite(remaining) ? `${remaining} r` : "Attiva",
            title: `Termina ${feature.plainName || feature.featureId}${rangeLabel}`,
          },
        });
      }
      continue;
    }

    entries.push({
      label: `Attiva ${feature.label || feature.plainName || feature.featureId}`,
      icon: "mark.svg",
      action: "class-feature-activate",
      options: {
        value: feature.featureId,
        color: themeColor,
        disabled: feature.resourceReady === false || feature.runtimeReady === false,
        trailing: feature.runtimeReady === false ? "Non automatizzata" : resourceLabel || "",
        title: feature.runtimeReady === false
          ? `Non ancora automatizzata: ${feature.plainName || feature.featureId}`
          : feature.resourceReady === false
          ? `Usi esauriti: ${feature.plainName || feature.featureId}`
          : `Attiva ${feature.plainName || feature.featureId}${rangeLabel}`,
      },
    });
  }
  return entries;
}

function render(payload) {
  root.replaceChildren();

  const title = document.createElement("div");
  title.className = "title";
  title.textContent = payload.title || "Azioni";
  root.appendChild(title);

  makeAction(root, "Condizioni", "conditions-panel.svg", "conditions");
  if (payload.expandedTokenMenu) {
    makeAction(root, "Rimuovi condizioni", "conditions-panel.svg", "clear-conditions", { danger: true });
    divider(root);
  }

  makeAction(root, "Incantesimi", "spells-panel.svg", "spells");
  if (payload.expandedTokenMenu) {
    makeAction(root, "Termina incantesimi", "spells-panel.svg", "clear-spells", { danger: true });
    makeAction(root, "Termina concentrazione", "spells-panel.svg", "clear-concentration", {
      danger: true,
      disabled: !payload.hasActiveConcentration,
      title: payload.hasActiveConcentration
        ? "Termina la concentrazione attiva"
        : "Nessuna concentrazione attiva",
    });
    divider(root);
  }

  const classFeatureEntries = classFeatureMenuEntries(payload.classFeatures);
  if (classFeatureEntries.length) {
    addSubmenu(root, "Capacità di classe", "mark.svg", classFeatureEntries);
  }
  if (payload.showClassFeatureResourceReset) {
    makeAction(root, "Ricarica risorse di classe", "mark.svg", "class-feature-reset-resources", {
      title: "Ripristina tutte le risorse di classe disponibili",
    });
  }
  if (classFeatureEntries.length || payload.showClassFeatureResourceReset) {
    divider(root);
  }

  if (payload.showInitiativeCard) {
    makeAction(root, "Scheda iniziativa", "character-sheet.svg", "initiative-card");
    divider(root);
  } else if (!payload.expandedTokenMenu) {
    divider(root);
  }

  const attitudes = [
    { value: "ally", label: "Alleato", color: "#22c55e" },
    { value: "neutral", label: "Neutrale", color: "#eab308" },
    { value: "pc", label: "Personaggio", color: "#3b82f6" },
    { value: "enemy", label: "Nemico", color: "#ef4444" },
  ];
  addSubmenu(root, "Cambia fazione", "mark.svg", attitudes.map((item) => ({
    label: item.label,
    icon: "mark.svg",
    action: "attitude",
    options: {
      value: item.value,
      color: item.color,
      current: (!payload.isBulkScope || payload.groupCollapsed) && payload.attitude === item.value,
      trailing: (!payload.isBulkScope || payload.groupCollapsed) && payload.attitude === item.value ? "Attiva" : "",
    },
  })));

  if (payload.showBossMenu) {
    const modes = [
      { value: "none", label: "Nessuno", icon: "boss-remove.svg" },
      { value: "legendary", label: "Azioni Leggendarie", icon: "boss.svg" },
      { value: "paragon", label: "Paragon Boss", icon: "boss.svg" },
      { value: "epic", label: "Epic Boss", icon: "boss.svg" },
    ];
    addSubmenu(root, "Tipo di Boss", "boss.svg", modes.map((item) => ({
      label: item.label,
      icon: item.icon,
      action: "boss-mode",
      options: {
        value: item.value,
        current: payload.activeMode === item.value,
        trailing: payload.activeMode === item.value ? "Attivo" : "",
      },
    })));
  }

  divider(root);
  makeAction(root, "Rimuovi dall'iniziativa", "remove.svg", "remove", {
    danger: true,
    trailing: payload.isBulkScope ? String(payload.scopeCount || "") : "",
  });
}

const payload = readStoredMenuPayload(localStorage, PAYLOAD_PREFIX, requestId);

if (requestId && payload) {
  render(payload);
  revealMenu();
  mountResizeObserver();
  requestMenuResize();
  armClickAwayClose();
  if (document.fonts?.ready) {
    void document.fonts.ready.then(requestMenuResize).catch(() => {});
  }
} else {
  root.textContent = "Menu non disponibile";
  revealMenu();
  mountResizeObserver();
  requestMenuResize();
}

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") sendAfterExit("close");
});

window.addEventListener("blur", () => {
  if (closeOnBlurArmed) sendAfterExit("close");
});

document.addEventListener("pointerdown", (event) => {
  if (event.button !== 2) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
}, { capture: true });

document.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  sendAfterExit("close");
}, { capture: true });
