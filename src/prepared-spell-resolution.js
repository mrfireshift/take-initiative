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
import {
  executeSpellActiveAction,
  executeSpellApplication,
} from "./spellApplicationExecutor.js";
import { spellExecutionHistoryDetails } from "./spellExecutionHistoryCore.js";
import { spellActiveActionPresentation } from "./spellActiveActionCore.js";
import { spellResolveActionPresentation } from "./spellsPanelTargetPicker.js";
import {
  buildSpellUnifiedPopupEvent,
  SPELL_UNIFIED_PANEL_POPUP_CHANNEL,
  SPELL_UNIFIED_PANEL_POPUP_STATUSES,
} from "./spellUnifiedPopupProtocol.js";

const META_KEY = `${ID}/meta`;
const instanceId = new URLSearchParams(window.location.search).get("instance") || "";
const app = document.getElementById("app");
const eyebrow = document.getElementById("eyebrow");
const title = document.getElementById("spellName");
const caster = document.getElementById("casterName");
const choice = document.getElementById("resolutionChoice");
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
  resolveButton.disabled = resolving || !currentGroup || presentation.disabled;
  resolveButton.textContent = resolving
    ? manual ? "Attivazione…" : "Risoluzione…"
    : presentation.text;
  resolveButton.title = presentation.title;
  if (manual && action.subjectMode === "caster") {
    status.textContent = "Pronto sul caster";
  } else {
    status.textContent = currentTargetIds.length
      ? presentation.title
      : "Seleziona il bersaglio sul tabellone";
  }
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
  updateResolvePresentation();
}

async function refreshSelection(selection = null) {
  const selected = Array.isArray(selection)
    ? selection
    : await OBR.player.getSelection().catch(() => []);
  currentTargetIds = validSelectedTargets(selected, currentItems);
  updateResolvePresentation();
}

async function refresh() {
  if (!instanceId) {
    renderGroup(null);
    return;
  }
  currentItems = await spellItems();
  renderGroup(findPreparedSpellResolutionGroup(currentItems, instanceId));
  await refreshSelection();
}

function queueRefresh() {
  if (refreshQueued) return;
  refreshQueued = true;
  window.setTimeout(() => {
    refreshQueued = false;
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
  if (resolving || !currentGroup) return;
  resolving = true;
  updateResolvePresentation();
  try {
    const latestItems = await spellItems();
    const latestGroup = findPreparedSpellResolutionGroup(latestItems, instanceId);
    if (!latestGroup) throw new Error("prepared-spell-stale");
    const action = preparedSpellResolutionAction(latestGroup);
    if (!action) throw new Error("prepared-spell-stale");
    const selection = await OBR.player.getSelection().catch(() => []);
    const targetIds = validSelectedTargets(selection, latestItems);
    const presentation = action.type === "manual"
      ? spellActiveActionPresentation(action, targetIds)
      : spellResolveActionPresentation(targetIds.length);
    if (presentation.disabled) throw new Error("prepared-spell-targets-invalid");

    let executionResult;
    if (action.type === "manual") {
      executionResult = await executeSpellActiveAction({
        spell: preparedSpellDefinition(latestGroup),
        actionId: action.id,
        group: latestGroup,
        selectedTargetIds: targetIds,
        casterName: latestGroup.casterName,
      });
    } else {
      const request = buildPreparedSpellResolutionRequest({
        group: latestGroup,
        targetIds,
        selectedChoice: choice.hidden ? "" : choice.value,
      });
      executionResult = await executeSpellApplication({
        ...request,
        casterName: latestGroup.casterName,
      });
    }
    await notifyParent(
      SPELL_UNIFIED_PANEL_POPUP_STATUSES.COMPLETED,
      "",
      executionResult,
    );
    await requestControllerSync();
    await refresh();
    if (!currentGroup) {
      await closePopup();
    }
  } catch (error) {
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
  const role = await OBR.player.getRole().catch(() => "PLAYER");
  if (role !== "GM") {
    renderGroup(null);
    return;
  }
  document.getElementById("close")?.addEventListener("click", () => void closePopup());
  resolveButton.addEventListener("click", resolvePreparedSpell);
  unsubscribeItems = OBR.scene.items.onChange(queueRefresh);
  unsubscribePlayer = OBR.player.onChange((player) => {
    if (Array.isArray(player?.selection)) void refreshSelection(player.selection);
  });
  await refresh();
});

window.addEventListener("beforeunload", () => {
  void notifyParent(SPELL_UNIFIED_PANEL_POPUP_STATUSES.CLOSED);
  unsubscribeItems?.();
  unsubscribePlayer?.();
});
