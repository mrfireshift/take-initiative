import OBR from "@owlbear-rodeo/sdk";
import { ID, RUNTIME_CACHE_CLEANUP_CHANNEL } from "./constants.js";
import { FACTION_CONFIGURATOR_ID } from "./factionRegistry.js";
import { openTrackedPopover } from "./popoverDragHost.js";
import {
  effectiveOptionsPanelShared,
  normalizeOptionsPanelDraft,
  rebaseOptionsPanelDraft,
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
import { createSceneLifecycleAdapter } from "./sceneLifecycle.js";

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
const sceneLifecycle = createSceneLifecycleAdapter({ obr: OBR });
let draft = null;
let editScope = "room";
let dirty = false;
let saving = false;
let cleaning = false;
let savedLayout = "classic";
// The draft as the panel loaded it, and the scene it was loaded in: Salva writes only what the GM changed since, and
// only in that scene.
let draftBaseline = null;
let draftOperation = null;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function adoptDraftBaseline() {
  draftBaseline = normalizeOptionsPanelDraft(draft);
  draftOperation = sceneLifecycle.capture({ operationId: "options-draft" });
}

function typedValue(control) {
  if (control.type === "checkbox") return control.checked;
  if (control.dataset.valueType === "boolean") return control.value === "true";
  return control.value;
}

// Prova (attacchi dei mostri, fase 3): reads the archive's index at the address written, says how many books it holds.
async function testFiveToolsArchive() {
  const status = document.querySelector("[data-fivetools-archive-status]");
  const input = document.getElementById("fiveToolsArchiveInput");
  const setStatus = (text, tone = "") => { if (status) { status.textContent = text; status.dataset.tone = tone; } };
  const { fiveToolsArchiveIndexUrl, parseFiveToolsArchiveIndex } = await import("./fiveToolsArchiveCore.js");
  const url = fiveToolsArchiveIndexUrl(input?.value);
  if (!url) {
    setStatus("Indirizzo non valido: serve un indirizzo https della cartella dei dati.", "error");
    return;
  }
  setStatus("Leggo l'indice dell'archivio…");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: "no-store" });
    if (!response.ok) throw new Error(`l'archivio risponde ${response.status}`);
    const books = parseFiveToolsArchiveIndex(await response.json());
    if (!books.length) throw new Error("all'indirizzo non c'è un indice di bestiari di 5eTools");
    setStatus(`Archivio raggiungibile: ${books.length} libri, ${books.filter((book) => !book.disabled).length} delle regole 2014. Premi Salva.`, "ok");
  } catch (error) {
    setStatus(`Archivio non raggiungibile: ${error?.name === "AbortError" ? "nessuna risposta in 15 secondi" : error?.message || error}.`, "error");
  } finally {
    clearTimeout(timer);
  }
}

// Prova (fase 4, lotto 3): loads one token image from the folder written (the Goblin of the Monster Manual).
async function testFiveToolsImages() {
  const status = document.querySelector("[data-fivetools-images-status]");
  const input = document.getElementById("fiveToolsImagesInput");
  const setStatus = (text, tone = "") => { if (status) { status.textContent = text; status.dataset.tone = tone; } };
  const { fiveToolsTokenUrl } = await import("./fiveToolsArchiveCore.js");
  const url = fiveToolsTokenUrl(input?.value, "bestiary/tokens/MM/Goblin.webp");
  if (!url) {
    setStatus("Indirizzo non valido: serve un indirizzo https della cartella delle immagini.", "error");
    return;
  }
  setStatus("Carico un'immagine di prova…");
  const image = new Image();
  const loaded = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), 15000);
    image.onload = () => { clearTimeout(timer); resolve(true); };
    image.onerror = () => { clearTimeout(timer); resolve(false); };
    image.src = url;
  });
  if (loaded) setStatus(`Immagini raggiungibili (Goblin, ${image.naturalWidth}×${image.naturalHeight}). Premi Salva.`, "ok");
  else setStatus("Immagini non raggiungibili: all'indirizzo non c'è bestiary/tokens/MM/Goblin.webp.", "error");
}

function setControlValue(control, value) {
  if (control.type === "checkbox") control.checked = !!value;
  else control.value = String(value);
  if (control.type === "range") renderRangeOutput(control);
}

// Tracker scale sliders: the current value as a percentage next to the label.
function renderRangeOutput(control) {
  const output = control.closest(".option-range")?.querySelector("output");
  if (output) output.textContent = `${Math.round(Number(control.value) * 100)}%`;
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
  const deathSaveDetail = shared.reminders.visibility !== "hidden" && shared.reminders.showDeathSaves === false
    ? "; TS contro la morte nascosti"
    : "";
  const cards = [
    ["Tracker", `HP nemici: ${hpModeLabels[hp.trackerClassic.enemy]}. Effetti: ${effectLabels[shared.effects.conditions]}.`],
    ["Promemoria", `${reminderLabels[shared.reminders.visibility]}${reminderDetails}${deathSaveDetail}.`],
    ["Turno e mappa", `Avviso di turno ${shared.popup ? "attivo" : "disattivo"}; risoluzione ${shared.directResolution === "assisted" ? "assistita" : "informativa"}; promemoria di movimento ${shared.movementReminder ? "attivo" : "disattivo"}; nome sulla mappa ${shared.activeTurnLabel ? "attivo" : "disattivo"}; dettagli sotto le etichette ${shared.summaryParts ? "attivi" : "disattivati"}.`],
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
  if (!draft || !sceneLifecycle.isReady()) return;
  for (const button of document.querySelectorAll("[data-scope]")) {
    button.setAttribute("aria-pressed", String(button.dataset.scope === editScope));
  }
  document.getElementById("scope-help").textContent = editScope === "room"
    ? "Valori condivisi per tutte le scene."
    : "Eredita dalla stanza o personalizza questa scena.";
  for (const badge of document.querySelectorAll("[data-current-scope-badge]")) {
    badge.textContent = editScope === "room" ? "Stanza" : "Scena";
  }
  for (const node of document.querySelectorAll("[data-room-only]")) node.hidden = editScope !== "room";
  for (const node of document.querySelectorAll("[data-room-section]")) node.hidden = editScope !== "room";
  for (const node of document.querySelectorAll(".scene-mode, .scene-choice")) node.hidden = editScope !== "scene";
  for (const node of document.querySelectorAll(".room-value")) node.hidden = editScope === "scene";

  // A switch still inherited (null) shows the one it follows (data-local-fallback).
  for (const control of document.querySelectorAll("[data-local]")) {
    setControlValue(control, draft.local[control.dataset.local] ?? draft.local[control.dataset.localFallback]);
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
      && (["showDc", "showCaster"].includes(control.dataset.path)
        ? activeFamilyValue("reminders").visibility !== "full"
        : control.dataset.path === "showDeathSaves" && activeFamilyValue("reminders").visibility === "hidden");
    control.disabled = sceneInherited || inactiveReminderDetail;
    const toggle = control.closest(".option-toggle");
    if (toggle) {
      toggle.classList.toggle("is-disabled", control.disabled);
      toggle.title = !inactiveReminderDetail ? ""
        : control.dataset.path === "showDeathSaves" ? "I promemoria sono nascosti ai giocatori" : "Disponibile solo con Contenuto: Completo";
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
  if (!sceneLifecycle.isReady()) return;
  const operation = sceneLifecycle.capture({ operationId: `options-open-factions:${Date.now().toString(36)}` });
  if (!sceneLifecycle.isCurrent(operation)) return;
  const viewportWidth = Number(await OBR.viewport.getWidth().catch(() => 1200)) || 1200;
  const viewportHeight = Number(await OBR.viewport.getHeight().catch(() => 900)) || 900;
  if (!sceneLifecycle.isCurrent(operation)) return;
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
    if (!sceneLifecycle.isCurrent(operation)) return;
  } catch (error) {
    if (!sceneLifecycle.isCurrent(operation)) return;
    console.warn("[options-panel] configuratore fazioni:", error?.message || error);
    await OBR.notification.show("Impossibile aprire il configuratore fazioni.", "ERROR").catch(() => {});
  }
}

// The store's codes (sceneOptionsStore.js) in words; any other error keeps its own message.
const OPTIONS_SAVE_ERROR_TEXT = Object.freeze({
  "scene-options-changed-during-write": "le opzioni della scena sono cambiate durante il salvataggio. Riapri il pannello e riprova.",
  "scene-stale-after-options-layout": "la scena è cambiata durante il salvataggio. Riapri il pannello Opzioni.",
});

function optionsSaveErrorText(error) {
  const message = String(error?.message || error || "");
  return OPTIONS_SAVE_ERROR_TEXT[message] || message;
}

// A 5eTools address that is not https (or a local http), or carries credentials, was replaced in silence by the
// empty default when saved (lot L19): the save stops and says which field.
async function invalidFiveToolsFields() {
  const { normalizeFiveToolsArchiveBase, normalizeFiveToolsImagesBase } = await import("./fiveToolsArchiveCore.js");
  return [
    ["fiveToolsArchiveInput", "Archivio 5eTools", normalizeFiveToolsArchiveBase],
    ["fiveToolsImagesInput", "Immagini 5eTools", normalizeFiveToolsImagesBase],
  ].filter(([id, , normalize]) => {
    const value = String(document.getElementById(id)?.value || "").trim();
    return value && !normalize(value);
  }).map(([, label]) => label);
}

async function save() {
  if (saving || !draft) return;
  const invalidUrls = await invalidFiveToolsFields().catch(() => []);
  if (invalidUrls.length) {
    const message = `Indirizzo non valido in «${invalidUrls.join("» e «")}»: serve un indirizzo https completo, senza nome utente né password.`;
    errorNode.textContent = message;
    errorNode.hidden = false;
    statusNode.textContent = message;
    return;
  }
  const operation = sceneLifecycle.capture({ operationId: `options-save:${Date.now().toString(36)}` });
  if (!sceneLifecycle.isCurrent(operation)) return;
  saving = true;
  saveButton.disabled = true;
  errorNode.hidden = true;
  statusNode.textContent = "Salvataggio in corso…";
  // A draft taken in another scene: its scene overrides belong to that scene, never to this one.
  if (!draftOperation || !sceneLifecycle.isCurrent(draftOperation)) {
    saving = false;
    errorNode.hidden = false;
    errorNode.textContent = "Scena cambiata: riapri il pannello Opzioni.";
    statusNode.textContent = "Scena cambiata: riapri il pannello Opzioni.";
    return;
  }
  // Only what the GM changed here: the rest takes its current value (the tracker may have changed it meanwhile).
  const requestedDraft = rebaseOptionsPanelDraft(draft, draftBaseline,
    runtimeOptionsService.get(selectOptionsPanelModel));
  const layout = requestedDraft.local.layout;
  try {
    await saveOptionsPanelDraft(runtimeOptionsService, requestedDraft, {
      isCurrent: () => sceneLifecycle.isCurrent(operation),
    });
    if (!sceneLifecycle.isCurrent(operation)) throw new Error("scene-stale-after-options-save");
    draft = await verifyOptionsPanelDraft(runtimeOptionsService, requestedDraft);
    if (!sceneLifecycle.isCurrent(operation)) throw new Error("scene-stale-after-options-verify");
    adoptDraftBaseline();
    await broadcastRuntimeOptionsInvalidation("options-panel-save").catch((error) => {
      console.warn("[options-panel] invalidation broadcast:", error?.message || error);
    });
    if (layout !== savedLayout) {
      await setTrackerLayout(layout).catch((error) => {
        console.warn("[options-panel] bridge layout:", error?.message || error);
      });
    }
    if (!sceneLifecycle.isCurrent(operation)) throw new Error("scene-stale-after-options-layout");
    savedLayout = draft.local.layout;
    dirty = false;
    statusNode.textContent = "Opzioni salvate.";
    if (!sceneLifecycle.isCurrent(operation)) return;
    await OBR.notification.show("Opzioni salvate.", "SUCCESS").catch(() => {});
    if (!sceneLifecycle.isCurrent(operation)) return;
    render();
  } catch (error) {
    if (!sceneLifecycle.isCurrent(operation)) {
      errorNode.hidden = false;
      errorNode.textContent = "Scena cambiata: riapri il pannello Opzioni.";
      statusNode.textContent = "Scena cambiata: riapri il pannello Opzioni.";
      return;
    }
    let details = "";
    if (String(error?.message || error).includes("Room")) {
      const diagnostics = await runtimeOptionsService.inspectRoomStorage().catch(() => null);
      if (diagnostics) {
        const largest = diagnostics.ownedEntries
          .slice(0, 3)
          .map((entry) => `${entry.key} ${entry.bytes} B`)
          .join(", ");
        details = ` Metadata della stanza: ${diagnostics.totalBytes}/${diagnostics.limitBytes} B; `
          + `liberi ${diagnostics.availableBytes} B`
          + (largest ? `; chiavi maggiori: ${largest}.` : ".");
      }
    }
    const message = `Impossibile salvare le opzioni: ${optionsSaveErrorText(error)}${details}`;
    errorNode.textContent = message;
    errorNode.hidden = false;
    statusNode.textContent = message;
    await OBR.notification.show(message, "ERROR").catch(() => {});
  } finally {
    saving = false;
    saveButton.disabled = !sceneLifecycle.isReady();
  }
}

async function cleanRuntimeData() {
  if (cleaning) return;
  const operation = sceneLifecycle.capture({ operationId: `options-cleanup:${Date.now().toString(36)}` });
  if (!sceneLifecycle.isCurrent(operation)) return;
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
    if (!sceneLifecycle.isCurrent(operation)) return;
    const plan = planPluginDerivedDataCleanup(items);
    if (plan.deleteIds.length) {
      if (!sceneLifecycle.isCurrent(operation)) return;
      await OBR.scene.items.deleteItems(plan.deleteIds);
    }
    if (!sceneLifecycle.isCurrent(operation)) return;
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
    if (!sceneLifecycle.isCurrent(operation)) return;
    await OBR.notification.show(message, "SUCCESS").catch(() => {});
  } catch (error) {
    if (!sceneLifecycle.isCurrent(operation)) {
      errorNode.hidden = false;
      errorNode.textContent = "Scena cambiata: riapri il pannello Opzioni.";
      statusNode.textContent = "Scena cambiata: riapri il pannello Opzioni.";
      return;
    }
    const message = `Pulizia non riuscita: ${error?.message || error}`;
    errorNode.textContent = message;
    errorNode.hidden = false;
    statusNode.textContent = message;
    await OBR.notification.show(message, "ERROR").catch(() => {});
  } finally {
    cleaning = false;
    if (cleanupButton) cleanupButton.disabled = !sceneLifecycle.isReady();
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
    if (action === "test-fivetools-archive") void testFiveToolsArchive();
    if (action === "test-fivetools-images") void testFiveToolsImages();
    if (action === "save") void save();
  });
  root.addEventListener("input", (event) => {
    if (event.target.matches?.('input[type="range"]')) renderRangeOutput(event.target);
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
  sceneLifecycle.subscribe((event) => {
    if (event.phase === "unavailable") {
      document.querySelectorAll("input, select, textarea, button").forEach((control) => { control.disabled = true; });
      statusNode.textContent = "Scena non disponibile: riapri il pannello Opzioni.";
    } else if (event.phase === "ready" && event.reason !== "scene-bootstrap-ready") {
      document.querySelectorAll("input, select, textarea, button").forEach((control) => { control.disabled = false; });
      statusNode.textContent = "Scena pronta: riapri il pannello Opzioni se necessario.";
    }
  });
  await sceneLifecycle.mount();
  if (!sceneLifecycle.isReady()) {
    statusNode.textContent = "Scena non disponibile: riapri il pannello Opzioni.";
    return;
  }
  const role = await OBR.player.getRole().catch(() => "PLAYER");
  if (role !== "GM") {
    await OBR.notification.show("Le opzioni condivise sono disponibili solo al GM.", "WARNING").catch(() => {});
    closeModal();
    return;
  }
  try {
    await startRuntimeOptions();
    if (!sceneLifecycle.isReady()) return;
    draft = normalizeOptionsPanelDraft(runtimeOptionsService.get(selectOptionsPanelModel));
    adoptDraftBaseline();
    savedLayout = draft.local.layout;
    runtimeOptionsService.subscribe(selectOptionsPanelModel, (model) => {
      if (dirty || saving) return;
      draft = normalizeOptionsPanelDraft(model);
      adoptDraftBaseline();
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

window.addEventListener("pagehide", () => sceneLifecycle.dispose());
