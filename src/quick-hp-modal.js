import OBR from "@owlbear-rodeo/sdk";
import { sendProjectedReminderPayload } from "./options/reminderProjectionBroadcast.js";
import {
  EFFECT_SAVE_REMINDER_NOTICE_CHANNEL,
  ID,
} from "./constants.js";
import { syncHPBarNow, syncHPTextBatchNow } from "./hpbar-items.js";
import { syncHPBatchToMemory } from "./hpMemory.js";
import { getHistoryEntries, undoHistoryThrough, withItemMetaHistory } from "./history.js";
import {
  QUICK_HP_FACTORS,
  QUICK_HP_MODES,
  calculateQuickHPChange,
  createQuickHPVisualTransaction,
  quickHPVisualUpdates,
  quickHPZeroReconcileTargetIds,
  shouldHandleQuickHPUndoShortcut,
} from "./quickHpCore.js";
import { APPLICABLE_CONDITION_LIST, getConditionInstances } from "./conditions.js";
import { resolveZeroHPUnconsciousAction } from "./hpConditionRulesCore.js";
import { currentSceneEpoch, isCurrentSceneEpoch } from "./sceneEpoch.js";
import {
  conditionMutationOperations,
  requireAppliedEffectsMutation,
  runEffectsMutation,
} from "./effectsMutations.js";
import { getZeroHPConditionHistoryIds } from "./hpConditionAutomation.js";
import { currentInitiativeTurnKey } from "./turnBoundaryCore.js";
import { effectSaveReminderNoticesForDamage } from "./effectSaveReminderCore.js";
import { broadcastConcentrationSaveWarnings } from "./concentrationSaveReminder.js";
import { decorateCompositeEffectsHistoryEntry } from "./effectsMutationCompositeHistoryCore.js";
import { mountCombatLogEventSink } from "./combatLog.js";
import "./popoverDrag.js";

const META_KEY = `${ID}/meta`;
const STATE_KEY = `${ID}/state`;
const MODAL_ID = `${ID}/quick-hp-modal`;
const TOGGLE_CHANNEL = `${ID}/tracker-popover-toggle`;
const SAVE_OUTCOMES = Object.freeze({
  PASSED: "passed",
  FAILED: "failed",
  IMMUNE: "immune",
});
const outcomeOptions = [
  { value: SAVE_OUTCOMES.PASSED, label: "Superato", shortLabel: "Superato" },
  { value: SAVE_OUTCOMES.FAILED, label: "Fallito", shortLabel: "Fallito" },
  { value: SAVE_OUTCOMES.IMMUNE, label: "Immune", shortLabel: "Immune" },
];
const factorOptions = [
  { value: QUICK_HP_FACTORS.DOUBLE, label: "×2", title: "Doppio" },
  { value: QUICK_HP_FACTORS.FULL, label: "1", title: "Intero" },
  { value: QUICK_HP_FACTORS.HALF, label: "½", title: "Metà" },
  { value: QUICK_HP_FACTORS.QUARTER, label: "¼", title: "Quarto" },
];

let mode = QUICK_HP_MODES.SAVE;
let targets = [];
let selectedIds = new Set();
let factors = new Map();
let saveOutcomes = new Map();
let selectionWriteDepth = 0;
let selectionPollBusy = false;
let selectionUnsubscribe = null;
let selectionTimer = null;
let busy = false;
let lastEntryId = "";
let effectSaveDamageSequence = 0;

const closeButton = document.getElementById("close");
const amountInput = document.getElementById("amount");
const targetList = document.getElementById("targetList");
const bulkActions = document.getElementById("bulkActions");
const summary = document.getElementById("summary");
const status = document.getElementById("status");
const applyButton = document.getElementById("apply");
const undoButton = document.getElementById("undo");
const targetNameFilter = document.getElementById("targetNameFilter");
const saveOptions = document.getElementById("saveOptions");
const conditionSelect = document.getElementById("conditionSelect");
const conditionSourceSelect = document.getElementById("conditionSource");
const conditionExpirySelect = document.getElementById("conditionExpiry");
const conditionActorSelect = document.getElementById("conditionActor");
const conditionDurationInput = document.getElementById("conditionDuration");
const conditionDurationWrap = document.getElementById("conditionDurationWrap");
const conditionActorWrap = document.getElementById("conditionActorWrap");
const conditionSourceWrap = document.getElementById("conditionSourceWrap");
const factionFilterButtons = Array.from(document.querySelectorAll("[data-hp-faction]"));
const activeFactionFilters = new Set();

function quickHpEffectsHistoryEntry(entry, mutation = null) {
  return decorateCompositeEffectsHistoryEntry({
    entry,
    mutation,
    effectMetadataFields: ["conditions"],
  });
}

function text(value) {
  return String(value ?? "").trim();
}

function uniqueIds(values = []) {
  return Array.from(new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => text(value))
      .filter(Boolean),
  ));
}

function splitVirtualId(value) {
  const id = text(value);
  const index = id.indexOf("::p");
  return index >= 0 ? id.slice(0, index) : id;
}

function isRealTokenId(id) {
  const value = text(id);
  return !!value && value !== "__LAIR__" && !value.startsWith("__EPIC__");
}

function itemForId(id) {
  const wanted = text(id);
  return targets.find((item) => item.id === wanted) || null;
}

async function currentInitiativeActorId() {
  const metadata = await OBR.scene.getMetadata().catch(() => ({}));
  const state = metadata?.[STATE_KEY] || {};
  const order = Array.isArray(state.order) ? state.order : [];
  const current = Math.max(0, Math.min(order.length - 1, Number(state.current) || 0));
  for (let index = current; index < order.length; index += 1) {
    const id = splitVirtualId(order[index]);
    if (isRealTokenId(id) && itemForId(id)) return id;
  }
  return "";
}

function displayName(item) {
  return text(item?.name) || "Token";
}

function hasTrackedHP(item) {
  const meta = item?.metadata?.[META_KEY];
  return !!meta
    && Object.prototype.hasOwnProperty.call(meta, "hp")
    && Object.prototype.hasOwnProperty.call(meta, "hpMax")
    && Number.isFinite(Number(meta.hp))
    && Number.isFinite(Number(meta.hpMax))
    && Number(meta.hpMax) > 0;
}

function factionKey(item) {
  const attitude = text(item?.metadata?.[META_KEY]?.attitude || "neutral").toLowerCase();
  return ["pc", "ally", "neutral", "enemy"].includes(attitude) ? attitude : "neutral";
}

function factionColor(item) {
  return {
    enemy: "#ef4444",
    ally: "#22c55e",
    pc: "#38bdf8",
    neutral: "#eab308",
  }[factionKey(item)];
}

function currentValue() {
  return Math.max(0, Math.floor(Number(amountInput.value) || 0));
}

function factorFor(id) {
  return factors.get(id) || QUICK_HP_FACTORS.FULL;
}

function conditionExpiry() {
  const expiryMode = conditionExpirySelect.value || "manual";
  const expiry = { mode: expiryMode };
  if (["rounds", "turn-start", "turn-end"].includes(expiryMode)) {
    expiry.remaining = Math.max(1, Math.floor(Number(conditionDurationInput.value) || 1));
  }
  if (["turn-start", "turn-end"].includes(expiryMode)) {
    const sourceId = text(conditionSourceSelect.value);
    expiry.actor = conditionActorSelect.value === "source" && sourceId
      ? "source"
      : "target";
    if (expiry.actor === "source") {
      expiry.actorId = sourceId;
      expiry.actorName = displayName(itemForId(sourceId));
    }
  }
  return expiry;
}

function conditionOptions(appliedAt) {
  const sourceId = text(conditionSourceSelect.value);
  const source = itemForId(sourceId);
  return {
    sourceId,
    sourceName: sourceId ? displayName(source) : "",
    appliedAt,
    expiry: conditionExpiry(),
  };
}

function expirySummary() {
  const expiry = conditionExpiry();
  if (expiry.mode === "concentration") return "fino a fine concentrazione";
  if (expiry.mode === "rounds") return `per ${expiry.remaining} round`;
  if (["turn-start", "turn-end"].includes(expiry.mode)) {
    const boundary = expiry.mode === "turn-start" ? "inizio" : "fine";
    const actor = expiry.actor === "source" ? "della fonte" : "del bersaglio";
    return `fino a ${boundary} turno ${actor}`;
  }
  return "rimozione manuale";
}

function appliedAtFromState(state) {
  return {
    round: Math.max(1, Number(state?.round) || 1),
    actorId: "",
    phase: "turn",
    turnKey: currentInitiativeTurnKey(state || {}),
  };
}

function saveOutcomeRequired() {
  return mode === QUICK_HP_MODES.SAVE && (
    !!text(conditionSelect.value)
    || currentValue() > 0
  );
}

function selectedTargetItems() {
  return targets.filter((item) => selectedIds.has(item.id));
}

function targetSelectable(item) {
  return mode === QUICK_HP_MODES.SAVE || hasTrackedHP(item);
}

function previewFor(item) {
  const meta = item?.metadata?.[META_KEY] || {};
  const outcome = saveOutcomes.get(item.id);
  if (saveOutcomeRequired() && !outcome) return null;
  const effectiveMode = mode === QUICK_HP_MODES.SAVE
    ? QUICK_HP_MODES.DAMAGE
    : mode;
  const factor = mode === QUICK_HP_MODES.SAVE
    ? outcome === SAVE_OUTCOMES.PASSED
      ? QUICK_HP_FACTORS.HALF
      : QUICK_HP_FACTORS.FULL
    : factorFor(item.id);
  return calculateQuickHPChange({
    mode: effectiveMode,
    value: outcome === SAVE_OUTCOMES.IMMUNE ? 0 : currentValue(),
    factor,
    hp: meta.hp,
    hpMax: meta.hpMax,
  });
}

function activeChanges() {
  return selectedTargetItems()
    .filter(hasTrackedHP)
    .map((item) => ({ item, change: previewFor(item) }))
    .filter((entry) => entry.change?.changed);
}

function sameSelection(nextIds) {
  if (nextIds.size !== selectedIds.size) return false;
  return [...nextIds].every((id) => selectedIds.has(id));
}

function orderedTargets() {
  return [
    ...targets.filter((item) => selectedIds.has(item.id)),
    ...targets.filter((item) => !selectedIds.has(item.id)),
  ];
}

function signed(value) {
  const number = Math.floor(Number(value) || 0);
  return number > 0 ? `+${number}` : String(number);
}

function modeLabel() {
  if (mode === QUICK_HP_MODES.HEAL) return "cura";
  if (mode === QUICK_HP_MODES.TEMP) return "HP temporanei";
  if (mode === QUICK_HP_MODES.SAVE) return "effetto manuale";
  return "danno";
}

async function updateSceneSelection(ids, selected, replace = false) {
  selectionWriteDepth += 1;
  try {
    if (selected) await OBR.player.select(ids, replace);
    else await OBR.player.deselect(ids);
  } finally {
    selectionWriteDepth -= 1;
    await refreshSelectionFromScene();
  }
}

function setSelectedFromScene(ids) {
  const available = new Set(targets.map((item) => item.id));
  const nextIds = new Set(
    (Array.isArray(ids) ? ids : [])
      .map(splitVirtualId)
      .filter((id) => available.has(id)),
  );
  if (sameSelection(nextIds)) return;
  for (const id of selectedIds) {
    if (!nextIds.has(id)) saveOutcomes.delete(id);
  }
  selectedIds = nextIds;
  renderTargets();
}

async function refreshSelectionFromScene() {
  if (selectionPollBusy || selectionWriteDepth > 0) return;
  selectionPollBusy = true;
  try {
    setSelectedFromScene(await OBR.player.getSelection());
  } catch {}
  finally {
    selectionPollBusy = false;
  }
}

function mountSelectionSync() {
  if (!selectionUnsubscribe) {
    selectionUnsubscribe = OBR.player.onChange((player) => {
      if (selectionWriteDepth === 0 && Array.isArray(player?.selection)) {
        setSelectedFromScene(player.selection);
      }
    });
  }
  if (!selectionTimer) selectionTimer = window.setInterval(refreshSelectionFromScene, 150);
}

function renderFactorButtons(item, disabled) {
  const group = document.createElement("div");
  group.className = "factor-group";
  for (const option of factorOptions) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `factor${factorFor(item.id) === option.value ? " active" : ""}`;
    button.textContent = option.label;
    button.title = option.title;
    button.disabled = disabled || busy;
    button.dataset.factor = option.value;
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      if (button.disabled) return;
      factors.set(item.id, option.value);
      if (!selectedIds.has(item.id)) {
        selectedIds.add(item.id);
        void updateSceneSelection([item.id], true);
      }
      renderTargets();
    });
    group.appendChild(button);
  }
  return group;
}

function renderOutcomeButtons(item, disabled) {
  const group = document.createElement("div");
  group.className = "outcome-group";
  for (const option of outcomeOptions) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `outcome${saveOutcomes.get(item.id) === option.value ? " active" : ""}`;
    button.textContent = option.shortLabel;
    button.title = option.label;
    button.dataset.outcome = option.value;
    button.disabled = disabled || busy;
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      if (button.disabled) return;
      saveOutcomes.set(item.id, option.value);
      if (!selectedIds.has(item.id)) {
        selectedIds.add(item.id);
        void updateSceneSelection([item.id], true);
      }
      renderTargets();
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
  const query = text(targetNameFilter.value).toLocaleLowerCase("it");
  const visible = orderedTargets().filter((item) => {
    const factionMatch = activeFactionFilters.size === 0
      || activeFactionFilters.has(factionKey(item));
    const nameMatch = !query || displayName(item).toLocaleLowerCase("it").includes(query);
    return factionMatch && nameMatch;
  });
  if (!visible.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Nessun bersaglio corrisponde ai filtri.";
    targetList.appendChild(empty);
    updateControls();
    return;
  }
  for (const item of visible) {
    const trackedHP = hasTrackedHP(item);
    const disabled = mode !== QUICK_HP_MODES.SAVE && !trackedHP;
    const selected = selectedIds.has(item.id) && !disabled;
    const row = document.createElement("div");
    row.className = `target${mode === QUICK_HP_MODES.SAVE ? " save-target" : ""}${selected ? " selected" : ""}${disabled ? " disabled" : ""}`;
    row.dataset.itemId = item.id;

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = selected;
    checkbox.disabled = disabled || busy;
    checkbox.setAttribute("aria-label", `Seleziona ${displayName(item)}`);
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
    if (!trackedHP) {
      preview.textContent = mode === QUICK_HP_MODES.SAVE
        ? "HP non tracciati · solo condizioni"
        : "HP non tracciati";
    } else if (saveOutcomeRequired() && !saveOutcomes.has(item.id)) {
      preview.textContent = "Esito mancante";
    } else {
      const result = previewFor(item);
      if (result) {
        const before = document.createElement("span");
        before.className = "before";
        before.textContent = `${result.hp}/${result.hpMax} → `;
        const after = document.createElement("strong");
        after.textContent = String(result.afterHP);
        const delta = document.createElement("span");
        delta.className = `delta ${mode === QUICK_HP_MODES.SAVE ? QUICK_HP_MODES.DAMAGE : mode}`;
        delta.textContent = ` (${signed(result.delta)})`;
        preview.append(before, after, delta);
      }
    }
    row.append(
      checkbox,
      identity,
      preview,
      mode === QUICK_HP_MODES.SAVE
        ? renderOutcomeButtons(item, disabled)
        : renderFactorButtons(item, disabled),
    );

    const toggle = () => {
      if (disabled || busy) return;
      const next = !selectedIds.has(item.id);
      if (next) selectedIds.add(item.id);
      else saveOutcomes.delete(item.id), selectedIds.delete(item.id);
      renderTargets();
      void updateSceneSelection([item.id], next);
    };
    checkbox.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggle();
    });
    row.addEventListener("click", (event) => {
      if (event.target.closest("[data-factor], [data-outcome]")) return;
      toggle();
    });
    targetList.appendChild(row);
  }
  updateControls();
}

function renderBulkActions() {
  bulkActions.replaceChildren();
  const options = mode === QUICK_HP_MODES.SAVE ? outcomeOptions : factorOptions;
  for (const option of options) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "small";
    button.textContent = mode === QUICK_HP_MODES.SAVE ? option.label : option.title;
    button.title = `Imposta ${option.title || option.label} sui bersagli selezionati`;
    button.addEventListener("click", () => {
      for (const item of selectedTargetItems()) {
        if (mode === QUICK_HP_MODES.SAVE) saveOutcomes.set(item.id, option.value);
        else factors.set(item.id, option.value);
      }
      renderTargets();
    });
    bulkActions.appendChild(button);
  }
}

function updateControls() {
  document.querySelectorAll("[data-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === mode);
  });
  saveOptions.hidden = mode !== QUICK_HP_MODES.SAVE;
  const selected = selectedTargetItems();
  const changes = activeChanges();
  const failedIds = mode === QUICK_HP_MODES.SAVE
    ? selected.filter((item) => saveOutcomes.get(item.id) === SAVE_OUTCOMES.FAILED).map((item) => item.id)
    : [];
  const counts = outcomeOptions.map((option) => selected.filter(
    (item) => saveOutcomes.get(item.id) === option.value,
  ).length);
  const missing = selected.length - counts.reduce((sum, count) => sum + count, 0);
  if (mode === QUICK_HP_MODES.SAVE) {
    const condition = text(conditionSelect.value);
    summary.textContent = `${selected.length} bersagli · Superati ${counts[0]} · Falliti ${counts[1]} · Immune ${counts[2]}${missing ? ` · ${missing} senza esito` : ""}${condition && failedIds.length ? ` · ${condition}, ${expirySummary()}` : ""}`;
  } else {
    const total = changes.reduce((sum, entry) => sum + Math.abs(entry.change.delta), 0);
    summary.textContent = !selected.length
      ? "Nessun bersaglio selezionato"
      : `${selected.length} bersagli · ${changes.length} modificati · ${total} HP`;
  }
  const outcomesComplete = !saveOutcomeRequired()
    || selected.every((item) => saveOutcomes.has(item.id));
  const hasManualCondition = mode === QUICK_HP_MODES.SAVE && failedIds.length > 0 && !!text(conditionSelect.value);
  const hasEffect = changes.length > 0 || hasManualCondition;
  applyButton.className = `apply ${mode === QUICK_HP_MODES.SAVE ? QUICK_HP_MODES.DAMAGE : mode}`;
  applyButton.textContent = mode === QUICK_HP_MODES.HEAL
    ? "Applica cura"
    : mode === QUICK_HP_MODES.TEMP
      ? "Applica HP temp."
      : mode === QUICK_HP_MODES.SAVE
        ? "Applica effetti"
        : "Applica danno";
  applyButton.disabled = busy
    || !selected.length
    || !outcomesComplete
    || !hasEffect;
  targetNameFilter.disabled = busy;
  amountInput.disabled = busy;
  for (const button of factionFilterButtons) button.disabled = busy;
  renderBulkActions();
}

async function loadTargets() {
  const metadata = await OBR.scene.getMetadata().catch(() => ({}));
  const state = metadata?.[STATE_KEY] || { order: [] };
  const orderedIds = uniqueIds(
    (Array.isArray(state.order) ? state.order : [])
      .map(splitVirtualId)
      .filter(isRealTokenId),
  );
  const orderIndex = new Map(orderedIds.map((id, index) => [id, index]));
  const orderedSet = new Set(orderedIds);
  const items = await OBR.scene.items.getItems((item) => {
    const meta = item?.metadata?.[META_KEY];
    return !!meta && (meta.inInitiative === true || orderedSet.has(item.id));
  });
  items.sort((a, b) => {
    const ai = orderIndex.has(a.id) ? orderIndex.get(a.id) : Number.MAX_SAFE_INTEGER;
    const bi = orderIndex.has(b.id) ? orderIndex.get(b.id) : Number.MAX_SAFE_INTEGER;
    return ai !== bi ? ai - bi : displayName(a).localeCompare(displayName(b), "it");
  });
  targets = items;
  for (const item of targets) {
    if (!factors.has(item.id)) factors.set(item.id, QUICK_HP_FACTORS.FULL);
  }
}

async function refreshConditionSourceOptions() {
  const previous = text(conditionSourceSelect.value);
  const activeId = await currentInitiativeActorId();
  conditionSourceSelect.replaceChildren(new Option("Nessuna fonte", ""));
  for (const item of targets) {
    conditionSourceSelect.appendChild(new Option(displayName(item), item.id));
  }
  const next = previous && itemForId(previous) ? previous : activeId;
  conditionSourceSelect.value = next || "";
  conditionActorSelect.value = next ? conditionActorSelect.value : "target";
}

async function appliedAt() {
  const metadata = await OBR.scene.getMetadata().catch(() => ({}));
  return appliedAtFromState(metadata?.[STATE_KEY] || {});
}

function syncHPVisualUpdates(updates = []) {
  for (const update of updates) syncHPBarNow(update.tokenId, update.hp, update.hpMax);
  return syncHPTextBatchNow(updates);
}

async function readAuthoritativeHPVisualUpdates(itemIds = [], sceneEpoch = currentSceneEpoch()) {
  if (!isCurrentSceneEpoch(sceneEpoch)) return [];
  const ids = uniqueIds(itemIds);
  if (!ids.length) return [];
  const items = await OBR.scene.items.getItems(ids);
  if (!isCurrentSceneEpoch(sceneEpoch)) return [];
  return items.filter(hasTrackedHP).map((item) => ({
    tokenId: item.id,
    hp: Math.max(0, Math.floor(Number(item.metadata?.[META_KEY]?.hp) || 0)),
    hpMax: Math.max(0, Math.floor(Number(item.metadata?.[META_KEY]?.hpMax) || 0)),
  }));
}

async function showConcentrationWarnings(entries) {
  const damage = entries
    .filter((entry) => entry.change.requested > 0)
    .map((entry) => ({ itemId: entry.item.id, damage: entry.change.requested }));
  if (damage.length) await broadcastConcentrationSaveWarnings(damage);
}

async function showEffectSaveDamageWarnings(entries) {
  const damageById = new Map(entries
    .filter((entry) => entry.change.requested > 0)
    .map((entry) => [entry.item.id, entry.change.requested]));
  if (!damageById.size) return;
  const notices = effectSaveReminderNoticesForDamage({
    items: targets,
    damageById,
    eventId: `${Date.now()}-${++effectSaveDamageSequence}`,
  });
  if (!notices.length) return;
  await sendProjectedReminderPayload(EFFECT_SAVE_REMINDER_NOTICE_CHANNEL, {
    type: "show-effect-save-notices",
    notices,
  });
}

async function applyOperation() {
  if (busy) return;
  const selected = selectedTargetItems();
  const conditionName = text(conditionSelect.value);
  const failedIds = mode === QUICK_HP_MODES.SAVE
    ? selected.filter((item) => saveOutcomes.get(item.id) === SAVE_OUTCOMES.FAILED).map((item) => item.id)
    : [];
  if (saveOutcomeRequired() && selected.some((item) => !saveOutcomes.has(item.id))) {
    status.textContent = "Imposta un esito per ogni bersaglio.";
    return;
  }

  const operationSceneEpoch = currentSceneEpoch();
  const liveItems = await OBR.scene.items.getItems(selected.map((item) => item.id));
  const entries = liveItems.filter(hasTrackedHP).map((item) => ({
    item,
    change: previewFor(item),
  })).filter((entry) => entry.change?.changed);
  const effectOperations = failedIds.length && conditionName
    ? conditionMutationOperations({
      targetIds: failedIds,
      conditionName,
      options: conditionOptions(await appliedAt()),
      automate: true,
    })
    : [];
  if (!entries.length && !effectOperations.length) {
    status.textContent = "Nessuna modifica da applicare.";
    return;
  }

  busy = true;
  renderTargets();
  let hpVisualTransaction = null;
  let recordedEntry = null;
  let coordinatedMutation = null;
  const ids = entries.map((entry) => entry.item.id);
  const zeroHPReconcileIds = quickHPZeroReconcileTargetIds(entries, (entry) => {
    const meta = entry.item.metadata?.[META_KEY] || {};
    return resolveZeroHPUnconsciousAction({
      ...meta,
      hp: entry.change.afterHP,
      hpMax: entry.change.hpMax,
    }, getConditionInstances(meta.conditions || {}));
  });
  const affectedIds = uniqueIds([...ids, ...failedIds]);
  const historyIds = uniqueIds([
    ...affectedIds,
    ...await getZeroHPConditionHistoryIds(ids),
  ]);
  const optimisticUpdates = quickHPVisualUpdates(entries);
  if (optimisticUpdates.length && isCurrentSceneEpoch(operationSceneEpoch)) {
    hpVisualTransaction = createQuickHPVisualTransaction(optimisticUpdates, {
      syncVisuals: syncHPVisualUpdates,
      onPreviewError: (error) => console.warn("[quick-hp] visual sync:", error?.message || error),
    });
  }

  try {
    await withItemMetaHistory({
      kind: mode === QUICK_HP_MODES.SAVE ? "save-resolution" : "hp",
      label: mode === QUICK_HP_MODES.SAVE
        ? `Effetto manuale: ${conditionName || currentValue()} · ${affectedIds.length} bersagli`
        : `${modeLabel().replace(/^./, (value) => value.toUpperCase())} rapido: ${currentValue()} · ${ids.length} bersagli`,
      itemIds: historyIds,
      fields: ["hp", "hpMax", "conditions"],
      onRecorded: (entry) => { recordedEntry = entry; },
      decorateEntry: (entry) => quickHpEffectsHistoryEntry(entry, coordinatedMutation),
    }, async () => {
      if (entries.length) {
        const updates = new Map(entries.map((entry) => [entry.item.id, entry.change]));
        await OBR.scene.items.updateItems(ids, (drafts) => {
          for (const item of drafts) {
            const update = updates.get(item.id);
            if (!update) continue;
            const previous = item.metadata?.[META_KEY] || {};
            item.metadata = {
              ...(item.metadata || {}),
              [META_KEY]: {
                ...previous,
                hp: update.afterHP,
                hpMax: update.hpMax,
              },
            };
          }
        });
      }
      const coordinatedOperations = [
        ...(zeroHPReconcileIds.length ? [{
          type: "condition:reconcile-zero-hp",
          targetIds: zeroHPReconcileIds,
        }] : []),
        ...effectOperations,
      ];
      if (coordinatedOperations.length) {
        coordinatedMutation = await runEffectsMutation(coordinatedOperations, {
          history: false,
          kind: mode === QUICK_HP_MODES.SAVE ? "save-resolution" : "hp-effects",
          label: "Effetti collegati alla modifica HP",
          targetIds: affectedIds,
        });
        requireAppliedEffectsMutation(coordinatedMutation);
      }
    });
    if (hpVisualTransaction) await hpVisualTransaction.completion;
    await Promise.all([
      syncHPBatchToMemory(entries.map((entry) => ({
        itemId: entry.item.id,
        hp: entry.change.afterHP,
        hpMax: entry.change.hpMax,
      })), {
        sceneEpoch: operationSceneEpoch,
        items: entries.map((entry) => entry.item),
      }),
      showConcentrationWarnings(entries),
      showEffectSaveDamageWarnings(entries),
    ]);
    lastEntryId = recordedEntry?.id || "";
    undoButton.hidden = !lastEntryId;
    status.textContent = mode === QUICK_HP_MODES.SAVE
      ? `Risoluzione applicata a ${affectedIds.length} bersagli.`
      : `Applicato a ${entries.length} bersagli.`;
    await loadTargets();
    await refreshConditionSourceOptions();
  } catch (error) {
    console.error("[quick-hp] apply:", error);
    if (hpVisualTransaction) {
      await hpVisualTransaction.recover((itemIds) => (
        readAuthoritativeHPVisualUpdates(itemIds, operationSceneEpoch)
      )).catch(() => {});
    }
    status.textContent = "Applicazione non riuscita.";
  } finally {
    busy = false;
    renderTargets();
  }
}

async function undoLastOperation() {
  if (busy || !lastEntryId) return;
  busy = true;
  renderTargets();
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
    await refreshConditionSourceOptions();
  } catch (error) {
    console.error("[quick-hp] undo:", error);
    status.textContent = "Undo non riuscito.";
  } finally {
    busy = false;
    renderTargets();
  }
}

function closePopover() {
  void OBR.broadcast.sendMessage(
    TOGGLE_CHANNEL,
    { type: "closed", id: MODAL_ID },
    { destination: "LOCAL" },
  ).catch(() => {});
  void OBR.popover.close(MODAL_ID);
}

function populateConditionOptions() {
  conditionSelect.replaceChildren(new Option("Nessuna condizione", ""));
  for (const condition of APPLICABLE_CONDITION_LIST) {
    conditionSelect.appendChild(new Option(condition, condition));
  }
}

document.querySelectorAll("[data-mode]").forEach((button) => {
  button.addEventListener("click", () => {
    if (busy) return;
    mode = button.dataset.mode;
    saveOutcomes.clear();
    status.textContent = "";
    renderTargets();
  });
});
conditionSelect.addEventListener("change", () => {
  status.textContent = "";
  renderTargets();
});
conditionSourceSelect.addEventListener("change", () => {
  conditionActorSelect.value = conditionSourceSelect.value ? "source" : "target";
  renderTargets();
});
conditionExpirySelect.addEventListener("change", renderTargets);
conditionActorSelect.addEventListener("change", renderTargets);
conditionDurationInput.addEventListener("input", renderTargets);
amountInput.addEventListener("input", () => {
  amountInput.value = text(amountInput.value).replace(/\D+/g, "").slice(0, 5);
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
    button.classList.toggle("active", activeFactionFilters.has(faction));
    button.setAttribute("aria-pressed", String(activeFactionFilters.has(faction)));
    renderTargets();
  });
}
applyButton.addEventListener("click", () => void applyOperation());
undoButton.addEventListener("click", () => void undoLastOperation());
closeButton.addEventListener("click", closePopover);
window.addEventListener("keydown", (event) => {
  if (!shouldHandleQuickHPUndoShortcut({
    key: event.key,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    shiftKey: event.shiftKey,
    busy,
    hasHistoryEntry: !!lastEntryId,
  })) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  void undoLastOperation();
}, true);
window.addEventListener("beforeunload", () => {
  if (selectionUnsubscribe) selectionUnsubscribe();
  if (selectionTimer) window.clearInterval(selectionTimer);
});

OBR.onReady(async () => {
  await mountCombatLogEventSink();
  if (await OBR.player.getRole() !== "GM") {
    targetList.textContent = "La console HP rapida è disponibile solo per il GM.";
    return;
  }
  populateConditionOptions();
  renderBulkActions();
  mountSelectionSync();
  await loadTargets();
  await refreshConditionSourceOptions();
  renderTargets();
  await refreshSelectionFromScene();
  amountInput.focus();
  amountInput.select();
});
