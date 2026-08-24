import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import {
  buildPreparedSpellResolutionRequest,
  findPreparedSpellResolutionGroup,
  PREPARED_SPELL_RESOLUTION_CHANNEL,
  preparedSpellDefinition,
  preparedSpellResolutionAction,
  preparedSpellResolutionChoices,
  preparedSpellResolutionPopoverId,
} from "./preparedSpellResolutionCore.js";
import { getSpellCastPhasePlan } from "./spellCastPhaseCore.js";
import {
  executeSpellActiveAction,
  executeSpellApplication,
} from "./spellApplicationExecutor.js";
import { getEffectsMutationSceneContext } from "./effectsMutations.js";
import { spellExecutionHistoryDetails } from "./spellExecutionHistoryCore.js";
import { spellActiveActionPresentation } from "./spellActiveActionCore.js";
import { spellResolveActionPresentation } from "./spellsPanelTargetPicker.js";
import {
  buildSpellUnifiedPopupEvent,
  SPELL_UNIFIED_PANEL_POPUP_CHANNEL,
  SPELL_UNIFIED_PANEL_POPUP_STATUSES,
} from "./spellUnifiedPopupProtocol.js";
import { createSceneLifecycleAdapter } from "./sceneLifecycle.js";

const META_KEY = `${ID}/meta`;
const instanceId = new URLSearchParams(window.location.search).get("instance") || "";
const app = document.getElementById("app");
const eyebrow = document.getElementById("eyebrow");
const title = document.getElementById("spellName");
const caster = document.getElementById("casterName");
const choice = document.getElementById("resolutionChoice");
const saveOutcome = document.getElementById("saveOutcome");
const damageValue = document.getElementById("damageValue");
const status = document.getElementById("status");
const resolveButton = document.getElementById("resolve");

let currentGroup = null;
let currentItems = [];
let currentTargetIds = [];
let resolving = false;
let unsubscribeItems = null;
let unsubscribePlayer = null;
let refreshQueued = false;
let parentNotified = false;
const sceneLifecycle = createSceneLifecycleAdapter({ obr: OBR });

function sceneOperationId(prefix = "prepared-spell") {
  return `${prefix}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`;
}

const uniqueIds = (values = []) => Array.from(new Set(
  (Array.isArray(values) ? values : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean)
));

async function notifyParent(status, message = "", executionResult = null) {
  if (parentNotified) return;
  parentNotified = true;
  const history = spellExecutionHistoryDetails(executionResult);
  await OBR.broadcast.sendMessage(
    SPELL_UNIFIED_PANEL_POPUP_CHANNEL,
    buildSpellUnifiedPopupEvent({
      source: "prepared-spell-resolution",
      status,
      instanceId,
      actionId: preparedSpellResolutionAction(currentGroup)?.id || "",
      popoverId: preparedSpellResolutionPopoverId(instanceId),
      message,
      ...(history.historyEntryId
        ? {
          historyEntryId: history.historyEntryId,
          undoAvailable: history.undoAvailable,
        }
        : {}),
    }),
    { destination: "LOCAL" },
  ).catch(() => {});
}

async function closePopup() {
  await notifyParent(SPELL_UNIFIED_PANEL_POPUP_STATUSES.CLOSED);
  await OBR.popover.close(preparedSpellResolutionPopoverId(instanceId)).catch(() => {});
}

async function spellItems() {
  return OBR.scene.items.getItems((item) =>
    item?.layer === "CHARACTER" && !!item?.metadata?.[META_KEY]
  );
}

function validSelectedTargets(selection, items) {
  const validIds = new Set(items.map((item) => item.id));
  return uniqueIds(selection).filter((targetId) => validIds.has(targetId));
}

function updateResolvePresentation() {
  const action = preparedSpellResolutionAction(currentGroup);
  if (!currentGroup || !action) {
    resolveButton.disabled = true;
    resolveButton.textContent = "Risolto";
    return;
  }
  const manual = action.type === "manual";
  const presentation = manual
    ? spellActiveActionPresentation(action, currentTargetIds)
    : spellResolveActionPresentation(currentTargetIds.length);
  const spell = preparedSpellDefinition(currentGroup);
  const phasePlan = spell
    ? getSpellCastPhasePlan(spell, "resolve", currentGroup.castContext || {})
    : null;
  const damageRequired = !!phasePlan?.resolution?.mechanics?.damageBonus;
  const damageMissing = !manual
    && damageRequired
    && !String(damageValue.value || "").trim();
  const targetMissing = !manual && currentTargetIds.length === 0;
  damageValue.disabled = !damageRequired;
  resolveButton.disabled = !sceneLifecycle.isReady()
    || resolving || !currentGroup || presentation.disabled || targetMissing || damageMissing;
  resolveButton.textContent = resolving
    ? manual ? "Attivazione…" : "Risoluzione…"
    : manual ? presentation.text : "Risolvi";
  resolveButton.title = manual ? presentation.title : "";
  if (manual && action.subjectMode === "caster") {
    status.textContent = "Pronto sul caster";
  } else if (targetMissing) {
    status.textContent = "Seleziona un bersaglio prima di continuare.";
  } else if (damageMissing) {
    status.textContent = "Inserisci il danno extra prima di continuare.";
  } else {
    status.textContent = "";
  }
}

function setOptions(select, options = [], selected = "") {
  select.replaceChildren();
  for (const optionValue of options) {
    const option = document.createElement("option");
    option.value = optionValue.value;
    option.textContent = optionValue.label;
    select.appendChild(option);
  }
  if (selected && options.some((option) => option.value === selected)) {
    select.value = selected;
  }
}

function updateManualResolutionControls(group) {
  const spell = preparedSpellDefinition(group);
  const phasePlan = group && spell
    ? getSpellCastPhasePlan(spell, "resolve", group.castContext || {})
    : null;
  const saveRequired = !!phasePlan?.resolution?.mechanics?.savingThrow;
  setOptions(saveOutcome, [
    { value: "", label: "Seleziona esito" },
    { value: "failed", label: "Fallito" },
    { value: "passed", label: "Superato" },
    { value: "immune", label: "Immune" },
  ], saveOutcome.value || "");
  saveOutcome.hidden = !saveRequired;
  const damageRequired = !!phasePlan?.resolution?.mechanics?.damageBonus;
  damageValue.hidden = !damageRequired;
  damageValue.required = damageRequired;
  damageValue.placeholder = "Totale";
  damageValue.disabled = !damageRequired;
  if (!damageRequired) damageValue.value = "";
}

function renderGroup(group) {
  currentGroup = group;
  if (!group) {
    app.dataset.state = "stale";
    eyebrow.textContent = "Incantesimo";
    title.textContent = "Attivazione terminata";
    caster.textContent = "";
    choice.hidden = true;
    status.textContent = "L’azione non è più disponibile.";
    resolveButton.disabled = true;
    resolveButton.textContent = "Risolto";
    return;
  }

  const action = preparedSpellResolutionAction(group);
  app.dataset.state = "ready";
  eyebrow.textContent = action?.type === "manual"
    ? "Incantesimo attivo"
    : "Incantesimo preparato";
  title.textContent = group.name;
  caster.textContent = `Caster: ${group.casterName}`;
  const choices = preparedSpellResolutionChoices(group);
  choice.replaceChildren();
  choice.hidden = choices.length <= 1;
  for (const entry of choices) {
    const option = document.createElement("option");
    option.value = entry.value;
    option.textContent = entry.label;
    choice.appendChild(option);
  }
  const storedChoice = String(group.castContext?.choice || "");
  if (storedChoice && choices.some((entry) => entry.value === storedChoice)) {
    choice.value = storedChoice;
  }
  updateManualResolutionControls(group);
  updateResolvePresentation();
}

async function refreshSelection(selection = null) {
  const operation = sceneLifecycle.capture({ operationId: sceneOperationId("selection") });
  if (!sceneLifecycle.isCurrent(operation)) return;
  const selected = Array.isArray(selection)
    ? selection
    : await OBR.player.getSelection().catch(() => []);
  if (!sceneLifecycle.isCurrent(operation)) return;
  currentTargetIds = validSelectedTargets(selected, currentItems);
  updateResolvePresentation();
}

async function refresh() {
  const operation = sceneLifecycle.capture({ operationId: sceneOperationId("refresh") });
  if (!sceneLifecycle.isCurrent(operation)) return false;
  if (!instanceId) {
    renderGroup(null);
    return;
  }
  currentItems = await spellItems();
  if (!sceneLifecycle.isCurrent(operation)) return false;
  renderGroup(findPreparedSpellResolutionGroup(currentItems, instanceId));
  await refreshSelection();
  return sceneLifecycle.isCurrent(operation);
}

function queueRefresh() {
  if (!sceneLifecycle.isReady()) return;
  if (refreshQueued) return;
  refreshQueued = true;
  window.setTimeout(() => {
    refreshQueued = false;
    if (!sceneLifecycle.isReady()) return;
    void refresh().catch((error) => {
      status.textContent = String(error?.message || error);
    });
  }, 60);
}

async function requestControllerSync() {
  await OBR.broadcast.sendMessage(
    PREPARED_SPELL_RESOLUTION_CHANNEL,
    { type: "request-sync", instanceId },
    { destination: "LOCAL" },
  ).catch(() => {});
}

async function resolvePreparedSpell() {
  if (resolving || !currentGroup || !sceneLifecycle.isReady()) return;
  const operation = sceneLifecycle.capture({ operationId: sceneOperationId("resolve") });
  if (!sceneLifecycle.isCurrent(operation)) return;
  resolving = true;
  updateResolvePresentation();
  try {
    const latestItems = await spellItems();
    if (!sceneLifecycle.isCurrent(operation)) return;
    const latestGroup = findPreparedSpellResolutionGroup(latestItems, instanceId);
    if (!latestGroup) throw new Error("prepared-spell-stale");
    const action = preparedSpellResolutionAction(latestGroup);
    if (!action) throw new Error("prepared-spell-stale");
    const selection = await OBR.player.getSelection().catch(() => []);
    if (!sceneLifecycle.isCurrent(operation)) return;
    const targetIds = validSelectedTargets(selection, latestItems);
    const presentation = action.type === "manual"
      ? spellActiveActionPresentation(action, targetIds)
      : spellResolveActionPresentation(targetIds.length);
    if (presentation.disabled) throw new Error("prepared-spell-targets-invalid");

    let executionResult;
    const ownerSceneContext = await getEffectsMutationSceneContext({
      commandId: operation.operationId,
    });
    if (!sceneLifecycle.isCurrent(operation)) return;
    if (action.type === "manual") {
      executionResult = await executeSpellActiveAction({
        spell: preparedSpellDefinition(latestGroup),
        actionId: action.id,
        group: latestGroup,
        selectedTargetIds: targetIds,
        casterName: latestGroup.casterName,
        sceneEpoch: operation.epoch,
        sceneIdentity: ownerSceneContext?.sceneIdentity || null,
        commandId: ownerSceneContext?.commandId || operation.operationId,
        isCurrent: () => sceneLifecycle.isCurrent(operation),
      });
    } else {
      const request = buildPreparedSpellResolutionRequest({
        group: latestGroup,
        targetIds,
        selectedChoice: choice.hidden ? "" : choice.value,
        attackOutcome: "hit",
        saveOutcome: saveOutcome.hidden ? "" : saveOutcome.value,
        damageValue: damageValue.hidden ? undefined : damageValue.value,
      });
      executionResult = await executeSpellApplication({
        ...request,
        casterName: latestGroup.casterName,
        sceneEpoch: operation.epoch,
        sceneIdentity: ownerSceneContext?.sceneIdentity || null,
        commandId: ownerSceneContext?.commandId || operation.operationId,
        isCurrent: () => sceneLifecycle.isCurrent(operation),
      });
    }
    if (!sceneLifecycle.isCurrent(operation)) return;
    if (executionResult?.status === "miss" && executionResult?.pending === true) {
      status.textContent = "La preparazione resta disponibile.";
      await requestControllerSync();
      if (!sceneLifecycle.isCurrent(operation)) return;
      await refresh();
      return;
    }
    if (executionResult?.status === "stale") {
      renderGroup(null);
      await notifyParent(SPELL_UNIFIED_PANEL_POPUP_STATUSES.CLOSED, "prepared-spell-stale");
      await requestControllerSync();
      return;
    }
    await notifyParent(
      SPELL_UNIFIED_PANEL_POPUP_STATUSES.COMPLETED,
      "",
      executionResult,
    );
    await requestControllerSync();
    if (!sceneLifecycle.isCurrent(operation)) return;
    await refresh();
    if (!currentGroup) {
      await closePopup();
    }
  } catch (error) {
    if (!sceneLifecycle.isCurrent(operation)) return;
    const code = String(error?.message || error);
    if (code === "prepared-spell-stale") {
      renderGroup(null);
      await notifyParent(SPELL_UNIFIED_PANEL_POPUP_STATUSES.CLOSED, code);
      await requestControllerSync();
    } else if (
      code === "prepared-spell-targets-required"
      || code === "prepared-spell-targets-invalid"
    ) {
      status.textContent = "Seleziona un bersaglio valido.";
    } else {
      await notifyParent(SPELL_UNIFIED_PANEL_POPUP_STATUSES.FAILED, code);
      status.textContent = "Attivazione non riuscita. Riprova dal pannello Spells.";
      console.warn("[prepared-spell-resolution] resolve:", code);
    }
  } finally {
    resolving = false;
    updateResolvePresentation();
  }
}

OBR.onReady(async () => {
  sceneLifecycle.subscribe((event) => {
    if (event.phase === "unavailable") {
      currentGroup = null;
      currentItems = [];
      currentTargetIds = [];
      resolving = false;
      renderGroup(null);
      status.textContent = "Scena cambiata: riapri la risoluzione dal pannello Spells.";
      return;
    }
    if (event.phase === "ready" && event.reason !== "scene-bootstrap-ready") {
      currentGroup = null;
      currentItems = [];
      currentTargetIds = [];
      status.textContent = "Nuova scena pronta: seleziona di nuovo il bersaglio.";
      void refresh();
    }
  });
  await sceneLifecycle.mount();
  if (!sceneLifecycle.isReady()) {
    renderGroup(null);
    status.textContent = "Scena non disponibile: riapri la risoluzione dal pannello Spells.";
    return;
  }
  const role = await OBR.player.getRole().catch(() => "PLAYER");
  if (role !== "GM") {
    renderGroup(null);
    return;
  }
  document.getElementById("close")?.addEventListener("click", () => void closePopup());
  resolveButton.addEventListener("click", resolvePreparedSpell);
  [saveOutcome, damageValue].forEach((control) => {
    control?.addEventListener("input", updateResolvePresentation);
    control?.addEventListener("change", updateResolvePresentation);
  });
  unsubscribeItems = OBR.scene.items.onChange(queueRefresh);
  unsubscribePlayer = OBR.player.onChange((player) => {
    if (Array.isArray(player?.selection)) void refreshSelection(player.selection);
  });
  await refresh();
});

window.addEventListener("beforeunload", () => {
  sceneLifecycle.dispose();
  void notifyParent(SPELL_UNIFIED_PANEL_POPUP_STATUSES.CLOSED);
  unsubscribeItems?.();
  unsubscribePlayer?.();
});
