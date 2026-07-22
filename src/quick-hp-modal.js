import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { syncHPBarNow, syncHPTextBatchNow } from "./hpbar-items.js";
import { saveHPToMemoryByItemId } from "./hpMemory.js";
import { getHistoryEntries, undoHistoryThrough, withItemMetaHistory } from "./history.js";
import { QUICK_HP_FACTORS, QUICK_HP_MODES, calculateQuickHPChange } from "./quickHpCore.js";
import {
  getZeroHPConditionHistoryIds,
  reconcileZeroHPConditionsForItems,
} from "./hpConditionAutomation.js";

const META_KEY = ID + "/meta";
const STATE_KEY = ID + "/state";
const SPELLS_KEY = ID + "/spells";
const CONCENTRATION_KEY = ID + "/concentration";
const CONCENTRATION_WARNING_CHANNEL = ID + "/concentration-warning";
const MODAL_ID = ID + "/quick-hp-modal";
const TOGGLE_CHANNEL = ID + "/tracker-popover-toggle";
const LAIR_ID = "__LAIR__";
const EPIC_PREFIX = "__EPIC__";
const factorOptions = [
  { value: QUICK_HP_FACTORS.DOUBLE, label: "\u00d72", title: "Doppio" },
  { value: QUICK_HP_FACTORS.FULL, label: "1", title: "Intero" },
  { value: QUICK_HP_FACTORS.HALF, label: "\u00bd", title: "Meta" },
  { value: QUICK_HP_FACTORS.QUARTER, label: "\u00bc", title: "Quarto" },
];

let mode = QUICK_HP_MODES.DAMAGE;
let targets = [];
let selectedIds = new Set();
let factors = new Map();
let selectionWriteDepth = 0;
let selectionPollBusy = false;
let selectionUnsubscribe = null;
let selectionTimer = null;
let busy = false;
let lastEntryId = "";

const closeButton = document.getElementById("close");
const amountInput = document.getElementById("amount");
const targetList = document.getElementById("targetList");
const bulkActions = document.getElementById("bulkActions");
const summary = document.getElementById("summary");
const status = document.getElementById("status");
const applyButton = document.getElementById("apply");
const undoButton = document.getElementById("undo");
const targetNameFilter = document.getElementById("targetNameFilter");
const factionFilterButtons = Array.from(document.querySelectorAll("[data-hp-faction]"));
const activeFactionFilters = new Set();

function splitVirtualId(value) {
  const id = String(value || "");
  const index = id.indexOf("::p");
  return index >= 0 ? id.slice(0, index) : id;
}
function isRealTokenId(id) {
  return !!id && id !== LAIR_ID && !id.startsWith(EPIC_PREFIX);
}
function hasTrackedHP(item) {
  const meta = item && item.metadata && item.metadata[META_KEY];
  return !!meta
    && Object.prototype.hasOwnProperty.call(meta, "hp")
    && Object.prototype.hasOwnProperty.call(meta, "hpMax")
    && Number.isFinite(Number(meta.hp))
    && Number.isFinite(Number(meta.hpMax))
    && Number(meta.hpMax) > 0;
}
function displayName(item) {
  return String(item && item.name || "").trim() || "Token";
}
function factionKey(item) {
  const meta = item && item.metadata && item.metadata[META_KEY] || {};
  const attitude = String(meta.attitude || "neutral").toLowerCase();
  return ["pc", "ally", "neutral", "enemy"].includes(attitude) ? attitude : "neutral";
}
function factionColor(item) {
  const attitude = factionKey(item);
  if (attitude === "enemy") return "#ef4444";
  if (attitude === "ally") return "#22c55e";
  if (attitude === "pc") return "#38bdf8";
  return "#eab308";
}
function currentValue() {
  return Math.max(0, Math.floor(Number(amountInput.value) || 0));
}
function factorFor(id) {
  return factors.get(id) || QUICK_HP_FACTORS.FULL;
}
function previewFor(item) {
  const meta = item.metadata[META_KEY] || {};
  return calculateQuickHPChange({ mode, value: currentValue(), factor: factorFor(item.id), hp: meta.hp, hpMax: meta.hpMax });
}
function selectedTargetItems() {
  return targets.filter((item) => selectedIds.has(item.id) && hasTrackedHP(item));
}
function sameSelection(nextIds) {
  if (nextIds.size !== selectedIds.size) return false;
  for (const id of nextIds) if (!selectedIds.has(id)) return false;
  return true;
}
function orderedTargets() {
  const selected = [];
  const unselected = [];
  for (const item of targets) {
    if (selectedIds.has(item.id) && hasTrackedHP(item)) selected.push(item);
    else unselected.push(item);
  }
  return selected.concat(unselected);
}
function activeChanges() {
  return selectedTargetItems().map((item) => ({ item, change: previewFor(item) })).filter((entry) => entry.change.changed);
}
function signed(value) {
  const number = Math.floor(Number(value) || 0);
  return number > 0 ? "+" + number : String(number);
}
function modeLabel() {
  if (mode === QUICK_HP_MODES.HEAL) return "cura";
  if (mode === QUICK_HP_MODES.TEMP) return "HP temporanei";
  return "danno";
}
function updateControls() {
  document.querySelectorAll("[data-mode]").forEach((button) => button.classList.toggle("active", button.dataset.mode === mode));
  applyButton.className = "apply " + mode;
  applyButton.textContent = mode === QUICK_HP_MODES.HEAL ? "Applica cura" : mode === QUICK_HP_MODES.TEMP ? "Applica HP temp." : "Applica danno";
  const selected = selectedTargetItems();
  const changes = activeChanges();
  const total = changes.reduce((sum, entry) => sum + Math.abs(entry.change.delta), 0);
  summary.textContent = !selected.length ? "Nessun bersaglio selezionato" : selected.length + " bersagli - " + changes.length + " modificati - " + total + " HP";
  applyButton.disabled = busy || currentValue() <= 0 || changes.length === 0;
  targetNameFilter.disabled = busy;
  for (const button of factionFilterButtons) button.disabled = busy;
  amountInput.disabled = busy;
}
async function updateSceneSelection(ids, selected, replace) {
  selectionWriteDepth += 1;
  try {
    if (selected) await OBR.player.select(ids, !!replace);
    else await OBR.player.deselect(ids);
  } finally {
    selectionWriteDepth -= 1;
    await refreshSelectionFromScene();
  }
}
function setSelectedFromScene(ids) {
  const available = new Set(targets.map((item) => item.id));
  const nextIds = new Set((Array.isArray(ids) ? ids : []).map(splitVirtualId).filter((id) => available.has(id)));
  if (sameSelection(nextIds)) return;
  selectedIds = nextIds;
  renderTargets();
}
async function refreshSelectionFromScene() {
  if (selectionPollBusy || selectionWriteDepth > 0) return;
  selectionPollBusy = true;
  try {
    setSelectedFromScene(await OBR.player.getSelection());
  } catch {
  } finally {
    selectionPollBusy = false;
  }
}
function mountSelectionSync() {
  if (!selectionUnsubscribe) {
    selectionUnsubscribe = OBR.player.onChange((player) => {
      if (selectionWriteDepth === 0 && Array.isArray(player && player.selection)) setSelectedFromScene(player.selection);
    });
  }
  if (!selectionTimer) selectionTimer = window.setInterval(refreshSelectionFromScene, 150);
}
function renderFactorButtons(item, disabled) {
  const group = document.createElement("div");
  group.className = "factor-group";
  const current = factorFor(item.id);
  for (const option of factorOptions) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "factor" + (current === option.value ? " active" : "");
    button.textContent = option.label;
    button.title = option.title;
    button.dataset.factor = option.value;
    button.disabled = disabled || busy;
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      if (disabled || busy) return;
      factors.set(item.id, option.value);
      if (!selectedIds.has(item.id)) {
        selectedIds.add(item.id);
        renderTargets();
        void updateSceneSelection([item.id], true, false);
      } else renderTargets();
    });
    group.appendChild(button);
  }
  return group;
}
function renderTargets() {
  targetList.replaceChildren();
  if (!targets.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Nessun token in iniziativa.";
    targetList.appendChild(empty);
    updateControls();
    return;
  }
  const nameQuery = targetNameFilter.value.trim().toLocaleLowerCase("it");
  const visibleTargets = orderedTargets().filter((item) => {
    const matchesFaction = activeFactionFilters.size === 0 || activeFactionFilters.has(factionKey(item));
    const matchesName = !nameQuery || displayName(item).toLocaleLowerCase("it").includes(nameQuery);
    return matchesFaction && matchesName;
  });
  if (!visibleTargets.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Nessun bersaglio corrisponde ai filtri.";
    targetList.appendChild(empty);
    updateControls();
    return;
  }
  for (const item of visibleTargets) {
    const disabled = !hasTrackedHP(item);
    const selected = selectedIds.has(item.id) && !disabled;
    const row = document.createElement("div");
    row.className = "target" + (selected ? " selected" : "") + (disabled ? " disabled" : "");
    row.dataset.itemId = item.id;
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = selected;
    checkbox.disabled = disabled || busy;
    checkbox.setAttribute("aria-label", "Seleziona " + displayName(item));
    const identity = document.createElement("div");
    identity.className = "identity";
    const faction = document.createElement("span");
    faction.className = "faction";
    faction.style.background = factionColor(item);
    faction.style.color = factionColor(item);
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = displayName(item);
    identity.append(faction, name);
    const preview = document.createElement("div");
    preview.className = "hp-preview";
    if (disabled) {
      preview.textContent = "HP non tracciati";
    } else {
      const result = previewFor(item);
      const before = document.createElement("span");
      before.className = "before";
      before.textContent = result.hp + "/" + result.hpMax + " -> ";
      const after = document.createElement("strong");
      after.textContent = result.afterHP;
      const delta = document.createElement("span");
      delta.className = "delta " + mode;
      delta.textContent = " (" + signed(result.delta) + ")";
      preview.append(before, after, delta);
    }
    row.append(checkbox, identity, preview, renderFactorButtons(item, disabled));
    const toggle = () => {
      if (disabled || busy) return;
      const next = !selectedIds.has(item.id);
      if (next) selectedIds.add(item.id); else selectedIds.delete(item.id);
      renderTargets();
      void updateSceneSelection([item.id], next, false);
    };
    checkbox.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggle();
    });
    row.addEventListener("click", (event) => {
      if (event.target.closest("[data-factor]")) return;
      toggle();
    });
    targetList.appendChild(row);
  }
  updateControls();
}
function renderBulkActions() {
  bulkActions.replaceChildren();
  for (const option of factorOptions) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "small";
    button.textContent = option.title;
    button.title = "Imposta " + option.title.toLowerCase() + " sui bersagli selezionati";
    button.addEventListener("click", () => {
      for (const item of selectedTargetItems()) factors.set(item.id, option.value);
      renderTargets();
    });
    bulkActions.appendChild(button);
  }
}
async function loadTargets() {
  const metadata = await OBR.scene.getMetadata();
  const state = metadata && metadata[STATE_KEY] || { order: [] };
  const orderedIds = Array.from(new Set((Array.isArray(state.order) ? state.order : []).map(splitVirtualId).filter(isRealTokenId)));
  const orderIndex = new Map(orderedIds.map((id, index) => [id, index]));
  const orderedSet = new Set(orderedIds);
  const items = await OBR.scene.items.getItems((item) => {
    const meta = item.metadata && item.metadata[META_KEY];
    return !!meta && (meta.inInitiative === true || orderedSet.has(item.id));
  });
  items.sort((a, b) => {
    const ai = orderIndex.has(a.id) ? orderIndex.get(a.id) : Number.MAX_SAFE_INTEGER;
    const bi = orderIndex.has(b.id) ? orderIndex.get(b.id) : Number.MAX_SAFE_INTEGER;
    return ai !== bi ? ai - bi : displayName(a).localeCompare(displayName(b), "it");
  });
  targets = items;
  for (const item of targets) if (!factors.has(item.id)) factors.set(item.id, QUICK_HP_FACTORS.FULL);
}
function portraitUrl(item) {
  return String(item && item.image && (item.image.url || item.image.src) || item && item.asset && item.asset.image && item.asset.image.url || "");
}
async function showConcentrationWarnings(entries) {
  if (mode !== QUICK_HP_MODES.DAMAGE) return;
  const warnings = entries.filter((entry) => {
    const concentration = entry.item.metadata && entry.item.metadata[META_KEY] && entry.item.metadata[META_KEY][CONCENTRATION_KEY];
    return entry.change.requested > 0 && concentration && typeof concentration === "object" && Object.keys(concentration).length > 0;
  }).map((entry) => ({
    name: displayName(entry.item),
    damage: entry.change.requested,
    dc: Math.max(10, Math.floor(entry.change.requested / 2)),
    portrait: portraitUrl(entry.item),
    attitude: entry.item.metadata[META_KEY].attitude || "neutral",
  }));
  if (warnings.length) {
    await OBR.broadcast.sendMessage(CONCENTRATION_WARNING_CHANNEL, {
      type: "show-concentration-warning", warnings, createdAt: Date.now(),
    }, { destination: "ALL" });
  }
}
function setBusy(next) {
  busy = !!next;
  renderTargets();
}
async function applyOperation() {
  if (busy) return;
  const candidateIds = selectedTargetItems().map((item) => item.id);
  if (!candidateIds.length || currentValue() <= 0) return;
  setBusy(true);
  status.textContent = "";
  try {
    const liveItems = await OBR.scene.items.getItems(candidateIds);
    const factorSnapshot = new Map(factors);
    const entries = liveItems.filter(hasTrackedHP).map((item) => {
      const meta = item.metadata[META_KEY] || {};
      const change = calculateQuickHPChange({
        mode, value: currentValue(), factor: factorSnapshot.get(item.id) || QUICK_HP_FACTORS.FULL, hp: meta.hp, hpMax: meta.hpMax,
      });
      return { item, change };
    }).filter((entry) => entry.change.changed);
    if (!entries.length) {
      status.textContent = "Nessuna modifica da applicare.";
      return;
    }
    let recordedEntry = null;
    const ids = entries.map((entry) => entry.item.id);
    const historyIds = await getZeroHPConditionHistoryIds(ids);
    await withItemMetaHistory({
      kind: "hp",
      label: modeLabel().charAt(0).toUpperCase() + modeLabel().slice(1) + " rapido: " + currentValue() + " - " + ids.length + " bersagli",
      itemIds: historyIds,
      fields: ["hp", "hpMax", "conditions", SPELLS_KEY, CONCENTRATION_KEY],
      onRecorded: (entry) => { recordedEntry = entry; },
    }, async () => {
      const updates = new Map(entries.map((entry) => [entry.item.id, entry.change]));
      await OBR.scene.items.updateItems(ids, (drafts) => {
        for (const item of drafts) {
          const update = updates.get(item.id);
          if (!update) continue;
          const previous = item.metadata && item.metadata[META_KEY] || {};
          item.metadata = Object.assign({}, item.metadata || {}, {
            [META_KEY]: Object.assign({}, previous, { hp: update.afterHP, hpMax: update.hpMax }),
          });
        }
      });
      await reconcileZeroHPConditionsForItems(ids);
    });
    // Accoda tutti i bersagli nel batch grafico condiviso: barra e testo HP
    // esistenti vengono aggiornati insieme da una sola chiamata OBR.
    for (const entry of entries) {
      syncHPBarNow(entry.item.id, entry.change.afterHP, entry.change.hpMax);
    }
    await syncHPTextBatchNow(entries.map((entry) => ({
      tokenId: entry.item.id,
      hp: entry.change.afterHP,
      hpMax: entry.change.hpMax,
    })));

    // La memoria stanza usa read-modify-write: resta intenzionalmente seriale.
    for (const entry of entries) {
      try {
        await saveHPToMemoryByItemId(entry.item.id, entry.change.afterHP, entry.change.hpMax);
      } catch (error) {
        console.warn("[quick-hp] HP memory:", error && error.message || error);
      }
    }
    await showConcentrationWarnings(entries).catch((error) => console.warn("[quick-hp] concentration warning:", error && error.message || error));
    lastEntryId = recordedEntry && recordedEntry.id || "";
    undoButton.hidden = !lastEntryId;
    status.textContent = "Applicato a " + entries.length + " bersagli.";
    await loadTargets();
  } catch (error) {
    console.error("[quick-hp] apply:", error);
    status.textContent = "Applicazione non riuscita.";
  } finally {
    busy = false;
    renderTargets();
  }
}
async function undoLastOperation() {
  if (busy || !lastEntryId) return;
  setBusy(true);
  try {
    const history = await getHistoryEntries();
    const latest = history[history.length - 1];
    if (!latest || latest.id !== lastEntryId) {
      status.textContent = "Sono presenti modifiche successive: usa la Cronologia.";
      lastEntryId = "";
      undoButton.hidden = true;
      return;
    }
    await undoHistoryThrough(lastEntryId);
    lastEntryId = "";
    undoButton.hidden = true;
    status.textContent = "Ultima applicazione annullata.";
    await loadTargets();
  } catch (error) {
    console.error("[quick-hp] undo:", error);
    status.textContent = "Undo non riuscito.";
  } finally {
    busy = false;
    renderTargets();
  }
}
function closePopover() {
  void OBR.broadcast.sendMessage(TOGGLE_CHANNEL, { type: "closed", id: MODAL_ID }, { destination: "LOCAL" }).catch(() => {});
  void OBR.popover.close(MODAL_ID);
}
document.querySelectorAll("[data-mode]").forEach((button) => {
  button.addEventListener("click", () => {
    mode = button.dataset.mode;
    status.textContent = "";
    renderTargets();
  });
});
amountInput.addEventListener("input", () => {
  amountInput.value = String(amountInput.value || "").replace(/\D+/g, "").slice(0, 5);
  status.textContent = "";
  renderTargets();
});
amountInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !applyButton.disabled) void applyOperation();
});
targetNameFilter.addEventListener("input", renderTargets);
for (const button of factionFilterButtons) {
  button.addEventListener("click", () => {
    const faction = button.dataset.hpFaction;
    if (activeFactionFilters.has(faction)) activeFactionFilters.delete(faction);
    else activeFactionFilters.add(faction);
    const active = activeFactionFilters.has(faction);
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
    renderTargets();
  });
}
applyButton.addEventListener("click", () => void applyOperation());
undoButton.addEventListener("click", () => void undoLastOperation());
closeButton.addEventListener("click", closePopover);
window.addEventListener("beforeunload", () => {
  if (selectionUnsubscribe) selectionUnsubscribe();
  if (selectionTimer) window.clearInterval(selectionTimer);
});
OBR.onReady(async () => {
  if (await OBR.player.getRole() !== "GM") {
    targetList.textContent = "La console HP rapida e disponibile solo per il GM.";
    return;
  }
  renderBulkActions();
  mountSelectionSync();
  await loadTargets();
  renderTargets();
  await refreshSelectionFromScene();
  amountInput.focus();
  amountInput.select();
});
