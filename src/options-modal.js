import OBR from "@owlbear-rodeo/sdk";
import { ID, RUNTIME_CACHE_CLEANUP_CHANNEL } from "./constants.js";
import { FACTION_CONFIGURATOR_ID } from "./factionRegistry.js";
import { openTrackedPopover } from "./popoverDragHost.js";
import {
  effectiveOptionsPanelShared,
  normalizeOptionsPanelDraft,
  saveOptionsPanelDraft,
  verifyOptionsPanelDraft,
} from "./options/optionsPanelCore.js";
import {
  broadcastRuntimeOptionsInvalidation,
  runtimeOptionsService,
  startRuntimeOptions,
} from "./options/optionsRuntime.js";
import { selectOptionsPanelModel } from "./options/optionsSelectors.js";
import { setTrackerLayout } from "./trackerPopover.js";
import { planPluginDerivedDataCleanup } from "./pluginDataCleanupCore.js";

const MODAL_ID = `${ID}/options-modal`;
const TRACKER_POPOVER_TOGGLE_CHANNEL = `${ID}/tracker-popover-toggle`;
const HP_SURFACES = Object.freeze([
  ["trackerClassic", "Tracker esteso"],
  ["trackerCompact", "Tracker compatto"],
  ["map", "Mappa"],
]);
const HP_ATTITUDES = Object.freeze([
  ["pc", "PG"],
  ["ally", "Alleati"],
  ["neutral", "Neutrali"],
  ["enemy", "Nemici"],
]);
const HP_MODES = Object.freeze([
  ["exact", "Valore"],
  ["bar", "Barra"],
  ["status", "Stato"],
  ["hidden", "Nascosti"],
]);

const root = document.getElementById("options-app");
const errorNode = document.getElementById("options-error");
const statusNode = document.getElementById("save-status");
const previewNode = document.getElementById("player-preview");
const hpMatrix = document.getElementById("hp-matrix");
const saveButton = document.querySelector('[data-action="save"]');
const cleanupButton = document.querySelector('[data-action="cleanup-runtime"]');
let draft = null;
let editScope = "room";
let dirty = false;
let saving = false;
let cleaning = false;
let savedLayout = "classic";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function typedValue(control) {
  if (control.type === "checkbox") return control.checked;
  if (control.dataset.valueType === "boolean") return control.value === "true";
  return control.value;
}

function setControlValue(control, value) {
  if (control.type === "checkbox") control.checked = !!value;
  else control.value = String(value);
}

function readPath(value, path) {
  return String(path || "").split(".").filter(Boolean)
    .reduce((current, part) => current?.[part], value);
}

function writePath(value, path, next) {
  const parts = String(path || "").split(".").filter(Boolean);
  let current = value;
  for (const part of parts.slice(0, -1)) {
    if (!current[part] || typeof current[part] !== "object") current[part] = {};
    current = current[part];
  }
  current[parts.at(-1)] = next;
}

function activeFamilyValue(family) {
  if (editScope !== "scene") return draft.room[family];
  return draft.scene[family].mode === "override"
    ? draft.scene[family].value
    : draft.room[family];
}

function markDirty() {
  dirty = true;
  statusNode.textContent = "Modifiche non salvate.";
}

function buildHpMatrix() {
  const corner = document.createElement("span");
  corner.className = "matrix-head";
  corner.textContent = "Superficie";
  hpMatrix.append(corner);
  for (const [, label] of HP_ATTITUDES) {
    const heading = document.createElement("span");
    heading.className = "matrix-head";
    heading.textContent = label;
    hpMatrix.append(heading);
  }
  for (const [surface, label] of HP_SURFACES) {
    const row = document.createElement("span");
    row.className = "matrix-row";
    row.textContent = label;
    hpMatrix.append(row);
    for (const [attitude] of HP_ATTITUDES) {
      const select = document.createElement("select");
      select.dataset.family = "hp";
      select.dataset.path = `${surface}.${attitude}`;
      select.setAttribute("aria-label", `${label}: ${attitude}`);
      for (const [mode, modeLabel] of HP_MODES) {
        const option = document.createElement("option");
        option.value = mode;
        option.textContent = modeLabel;
        select.append(option);
      }
      hpMatrix.append(select);
    }
  }
}

function renderPreview() {
  const shared = effectiveOptionsPanelShared(draft);
  const hp = shared.hp;
  const reminderHasDetails = shared.reminders.visibility === "full";
  const hpModeLabels = Object.fromEntries(HP_MODES);
  const effectLabels = { all: "dettagli completi", summary: "indicatore", hidden: "nascosti" };
  const reminderLabels = {
    full: "contenuto completo",
    summary: "riepilogo",
    notice: "solo avviso",
    hidden: "nascosti",
  };
  const reminderDetails = reminderHasDetails
    ? `; CD ${shared.reminders.showDc ? "visibile" : "nascosta"}, caster ${shared.reminders.showCaster ? "visibile" : "nascosto"}`
    : "";
  const cards = [
    ["Tracker", `HP nemici: ${hpModeLabels[hp.trackerClassic.enemy]}. Effetti: ${effectLabels[shared.effects.conditions]}.`],
    ["Reminder", `${reminderLabels[shared.reminders.visibility]}${reminderDetails}.`],
    ["Turno e mappa", `Popup ${shared.popup ? "attivo" : "disattivo"}; risoluzione ${shared.directResolution === "assisted" ? "assistita" : "informativa"}; label ${shared.activeTurnLabel ? "attiva" : "disattiva"}.`],
  ];
  previewNode.replaceChildren(...cards.map(([title, copy]) => {
    const card = document.createElement("article");
    card.className = "preview-card";
    const strong = document.createElement("strong");
    strong.textContent = title;
    const paragraph = document.createElement("p");
    paragraph.textContent = copy;
    card.append(strong, paragraph);
    return card;
  }));
}

function render() {
  if (!draft) return;
  for (const button of document.querySelectorAll("[data-scope]")) {
    button.setAttribute("aria-pressed", String(button.dataset.scope === editScope));
  }
  document.getElementById("scope-help").textContent = editScope === "room"
    ? "Valori condivisi per tutte le scene."
    : "Eredita dalla Room o personalizza questa scena.";
  for (const badge of document.querySelectorAll("[data-current-scope-badge]")) {
    badge.textContent = editScope === "room" ? "Room" : "Scena";
  }
  for (const node of document.querySelectorAll("[data-room-only]")) node.hidden = editScope !== "room";
  for (const node of document.querySelectorAll("[data-room-section]")) node.hidden = editScope !== "room";
  for (const node of document.querySelectorAll(".scene-mode, .scene-choice")) node.hidden = editScope !== "scene";
  for (const node of document.querySelectorAll(".room-value")) node.hidden = editScope === "scene";

  for (const control of document.querySelectorAll("[data-local]")) {
    setControlValue(control, draft.local[control.dataset.local]);
  }
  for (const control of document.querySelectorAll("[data-room]")) {
    setControlValue(control, draft.room[control.dataset.room]);
  }
  for (const control of document.querySelectorAll("[data-scene-mode]")) {
    setControlValue(control, draft.scene[control.dataset.sceneMode].mode);
  }
  for (const control of document.querySelectorAll("[data-scene-choice]")) {
    const entry = draft.scene[control.dataset.sceneChoice];
    setControlValue(control, entry.mode === "inherit" ? "inherit" : entry.value);
  }
  for (const control of document.querySelectorAll("[data-family]")) {
    const family = control.dataset.family;
    const familyValue = activeFamilyValue(family);
    const value = control.dataset.path === "value" && typeof familyValue !== "object"
      ? familyValue
      : readPath(familyValue, control.dataset.path);
    setControlValue(control, value);
    const sceneInherited = editScope === "scene" && draft.scene[family].mode === "inherit";
    const inactiveReminderDetail = family === "reminders"
      && ["showDc", "showCaster"].includes(control.dataset.path)
      && activeFamilyValue("reminders").visibility !== "full";
    control.disabled = sceneInherited || inactiveReminderDetail;
    const toggle = control.closest(".option-toggle");
    if (toggle) {
      toggle.classList.toggle("is-disabled", control.disabled);
      toggle.title = inactiveReminderDetail ? "Disponibile solo con Contenuto: Completo" : "";
    }
  }
  renderPreview();
}

function closeModal() {
  void OBR.broadcast.sendMessage(TRACKER_POPOVER_TOGGLE_CHANNEL, {
    type: "closed",
    id: MODAL_ID,
  }, { destination: "LOCAL" }).catch(() => {});
  void OBR.popover.close(MODAL_ID).catch(() => {});
}

async function openFactionConfigurator() {
  const viewportWidth = Number(await OBR.viewport.getWidth().catch(() => 1200)) || 1200;
  const viewportHeight = Number(await OBR.viewport.getHeight().catch(() => 900)) || 900;
  const width = 420;
  const height = 420;
  try {
    await openTrackedPopover({
      id: FACTION_CONFIGURATOR_ID,
      url: "/faction-configurator.html",
      width,
      height,
      anchorReference: "POSITION",
      anchorPosition: {
        left: Math.max(12, viewportWidth - width - 12),
        top: Math.max(12, Math.min(52, viewportHeight - height - 12)),
      },
      anchorOrigin: { horizontal: "LEFT", vertical: "TOP" },
      transformOrigin: { horizontal: "LEFT", vertical: "TOP" },
      disableClickAway: true,
      marginThreshold: 12,
      hidePaper: true,
    });
  } catch (error) {
    console.warn("[options-panel] configuratore fazioni:", error?.message || error);
    await OBR.notification.show("Impossibile aprire il configuratore fazioni.", "ERROR").catch(() => {});
  }
}

async function save() {
  if (saving || !draft) return;
  saving = true;
  saveButton.disabled = true;
  errorNode.hidden = true;
  statusNode.textContent = "Salvataggio in corso…";
  const layout = draft.local.layout;
  const requestedDraft = normalizeOptionsPanelDraft(draft);
  try {
    await saveOptionsPanelDraft(runtimeOptionsService, requestedDraft);
    draft = await verifyOptionsPanelDraft(runtimeOptionsService, requestedDraft);
    await broadcastRuntimeOptionsInvalidation("options-panel-save").catch((error) => {
      console.warn("[options-panel] invalidation broadcast:", error?.message || error);
    });
    if (layout !== savedLayout) {
      await setTrackerLayout(layout).catch((error) => {
        console.warn("[options-panel] bridge layout:", error?.message || error);
      });
    }
    savedLayout = draft.local.layout;
    dirty = false;
    statusNode.textContent = "Opzioni salvate.";
    await OBR.notification.show("Opzioni salvate.", "SUCCESS").catch(() => {});
    render();
  } catch (error) {
    let details = "";
    if (String(error?.message || error).includes("Room")) {
      const diagnostics = await runtimeOptionsService.inspectRoomStorage().catch(() => null);
      if (diagnostics) {
        const largest = diagnostics.ownedEntries
          .slice(0, 3)
          .map((entry) => `${entry.key} ${entry.bytes} B`)
          .join(", ");
        details = ` Room ${diagnostics.totalBytes}/${diagnostics.limitBytes} B; `
          + `liberi ${diagnostics.availableBytes} B`
          + (largest ? `; chiavi maggiori: ${largest}.` : ".");
      }
    }
    const message = `Impossibile salvare le opzioni: ${error?.message || error}${details}`;
    errorNode.textContent = message;
    errorNode.hidden = false;
    statusNode.textContent = message;
    await OBR.notification.show(message, "ERROR").catch(() => {});
  } finally {
    saving = false;
    saveButton.disabled = false;
  }
}

async function cleanRuntimeData() {
  if (cleaning) return;
  const confirmed = window.confirm(
    "Pulire i dati derivati orfani di questa scena? I metadata dei token, HP, condizioni, incantesimi, concentrazione e iniziativa non verranno modificati.",
  );
  if (!confirmed) return;
  cleaning = true;
  if (cleanupButton) cleanupButton.disabled = true;
  errorNode.hidden = true;
  statusNode.textContent = "Pulizia in corso…";
  try {
    const items = await OBR.scene.items.getItems();
    const plan = planPluginDerivedDataCleanup(items);
    if (plan.deleteIds.length) {
      await OBR.scene.items.deleteItems(plan.deleteIds);
    }
    await OBR.broadcast.sendMessage(
      RUNTIME_CACHE_CLEANUP_CHANNEL,
      { type: "clear-runtime-caches", reason: "options-maintenance" },
      { destination: "ALL" },
    ).catch((error) => {
      console.warn("[options-panel] runtime cleanup broadcast:", error?.message || error);
    });
    const zones = plan.staleZoneIds.length;
    const boardTokens = plan.staleBoardTokenIds.length;
    const total = plan.deleteIds.length;
    const message = total
      ? `Pulizia completata: ${total} derivati rimossi (${zones} zone, ${boardTokens} pedine).`
      : "Pulizia completata: nessun derivato orfano trovato.";
    statusNode.textContent = message;
    await OBR.notification.show(message, "SUCCESS").catch(() => {});
  } catch (error) {
    const message = `Pulizia non riuscita: ${error?.message || error}`;
    errorNode.textContent = message;
    errorNode.hidden = false;
    statusNode.textContent = message;
    await OBR.notification.show(message, "ERROR").catch(() => {});
  } finally {
    cleaning = false;
    if (cleanupButton) cleanupButton.disabled = false;
  }
}

function bindControls() {
  root.addEventListener("click", (event) => {
    const scope = event.target.closest("[data-scope]")?.dataset.scope;
    if (scope === "room" || scope === "scene") {
      editScope = scope;
      render();
      return;
    }
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (action === "close") closeModal();
    if (action === "open-faction-configurator") void openFactionConfigurator();
    if (action === "cleanup-runtime") void cleanRuntimeData();
    if (action === "save") void save();
  });
  root.addEventListener("change", (event) => {
    const control = event.target;
    if (control.matches("[data-local]")) {
      draft.local[control.dataset.local] = typedValue(control);
    } else if (control.matches("[data-room]")) {
      draft.room[control.dataset.room] = typedValue(control);
    } else if (control.matches("[data-scene-mode]")) {
      const family = control.dataset.sceneMode;
      draft.scene[family].mode = control.value;
      draft.scene[family].value = clone(draft.room[family]);
    } else if (control.matches("[data-scene-choice]")) {
      const family = control.dataset.sceneChoice;
      if (control.value === "inherit") {
        draft.scene[family] = { mode: "inherit", value: clone(draft.room[family]) };
      } else {
        draft.scene[family] = { mode: "override", value: typedValue(control) };
      }
    } else if (control.matches("[data-family]")) {
      const family = control.dataset.family;
      const value = typedValue(control);
      if (control.dataset.path === "value" && typeof activeFamilyValue(family) !== "object") {
        if (editScope === "scene") draft.scene[family].value = value;
        else draft.room[family] = value;
      } else {
        writePath(activeFamilyValue(family), control.dataset.path, value);
      }
    } else {
      return;
    }
    markDirty();
    render();
  });
}

buildHpMatrix();
bindControls();

OBR.onReady(async () => {
  const role = await OBR.player.getRole().catch(() => "PLAYER");
  if (role !== "GM") {
    await OBR.notification.show("Le opzioni condivise sono disponibili solo al GM.", "WARNING").catch(() => {});
    closeModal();
    return;
  }
  try {
    await startRuntimeOptions();
    draft = normalizeOptionsPanelDraft(runtimeOptionsService.get(selectOptionsPanelModel));
    savedLayout = draft.local.layout;
    runtimeOptionsService.subscribe(selectOptionsPanelModel, (model) => {
      if (dirty || saving) return;
      draft = normalizeOptionsPanelDraft(model);
      render();
    }, { emitCurrent: false });
    render();
  } catch (error) {
    errorNode.textContent = `Impossibile caricare le opzioni: ${error?.message || error}`;
    errorNode.hidden = false;
    statusNode.textContent = "Opzioni non disponibili.";
    saveButton.disabled = true;
  }
});
