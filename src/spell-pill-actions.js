// The actions of an active spell, opened by the ⚡ of its pill on the tracker card (GM only). Same overview and
// executor as the spell panel: an action that asks nothing runs at once, with Annulla; one with inputs opens its
// own resolution popup.
import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { createSceneLifecycleAdapter } from "./sceneLifecycle.js";
import { currentSceneEpoch } from "./sceneEpoch.js";
import {
  loadSpellInstanceOverview,
  runSpellInstanceAction,
  undoSpellInstanceAction,
} from "./spellInstanceActionRunner.js";
import {
  buildSpellPillActionsView,
  spellActionRunsDirectly,
  spellPillActionErrorText,
  spellPillActionNeedsTargets,
} from "./spellPillActionsCore.js";

export const SPELL_PILL_ACTIONS_POPOVER_ID = `${ID}/spell-pill-actions`;
const SPELLS_POPOVER_ID = `${ID}/spells-modal`;
const params = new URLSearchParams(window.location.search);
const request = {
  itemId: params.get("itemId") || "",
  spellInstanceId: params.get("spellInstanceId") || "",
};
const sceneLifecycle = createSceneLifecycleAdapter({ obr: OBR });
const $ = (id) => document.getElementById(id);
let overview = null;
let lastEntryId = "";
let lastEpoch = null;
let busy = false;

const close = () => { void OBR.popover.close(SPELL_PILL_ACTIONS_POPOVER_ID).catch(() => {}); };

// The popup opens with a guessed height; it then fits its content.
function fitHeight() {
  const shell = document.querySelector(".glass-shell");
  const height = Math.ceil(shell?.getBoundingClientRect?.().height || 0);
  if (height > 0) void OBR.popover.setHeight(SPELL_PILL_ACTIONS_POPOVER_ID, height).catch(() => {});
}

function setStatus(message, error = false) {
  $("status").textContent = message || "";
  $("status").classList.toggle("is-error", !!error);
}

const loadOverview = () => loadSpellInstanceOverview(request.spellInstanceId);

function render() {
  const view = buildSpellPillActionsView(overview);
  const list = $("actions");
  list.replaceChildren();
  if (!view) {
    $("counter").textContent = "";
    $("meta").textContent = lastEntryId ? "L'incantesimo è terminato." : "L'incantesimo non è più attivo.";
    $("panel").hidden = true;
    fitHeight();
    return;
  }
  // Back with the spell, after an Undo of its end (lot L20): hidden above, nothing showed it again.
  $("panel").hidden = false;
  $("title").textContent = view.title;
  $("title").title = view.title;
  $("counter").textContent = view.counter;
  $("meta").textContent = view.casterName ? `Caster: ${view.casterName}` : "";
  for (const action of view.actions) {
    const row = document.createElement("div");
    row.className = "action";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "primary";
    // An action with a choice or a zone to move is completed in the panel, already on it.
    const inPanel = !action.direct && !action.needsTargets;
    button.textContent = inPanel ? `${action.label} ›` : action.label;
    button.title = action.detail || action.label;
    button.disabled = busy || action.disabled;
    button.addEventListener("click", () => {
      if (inPanel) void openPanel(action.id).catch((error) => console.warn("[spell-pill-actions] panel", error));
      else void run(action.id);
    });
    const hint = document.createElement("div");
    hint.className = "hint";
    hint.textContent = action.disabled && action.reason
      ? action.reason
      : action.needsTargets ? "Seleziona sulla mappa la creatura, poi premi."
        : inPanel ? "Si completa nel pannello incantesimi." : "";
    row.append(button, hint);
    list.appendChild(row);
  }
  if (!view.actions.length) {
    const empty = document.createElement("div");
    empty.className = "hint";
    empty.textContent = "Nessuna azione disponibile ora.";
    list.appendChild(empty);
  }
  fitHeight();
}

async function run(actionId) {
  if (busy || !overview) return;
  const action = (overview.actions || []).find((entry) => String(entry?.id || "").trim() === actionId);
  if (!action || (!spellActionRunsDirectly(action) && !spellPillActionNeedsTargets(action))) return;
  const operation = sceneLifecycle.capture({ operationId: `spell-pill-action:${Date.now().toString(36)}` });
  if (!sceneLifecycle.isCurrent(operation)) return;
  // Busy before the map selection is read (lot L20): a double click ran the action twice while it was being read.
  busy = true;
  const selectedTargetIds = spellPillActionNeedsTargets(action)
    ? await Promise.resolve(OBR.player.getSelection()).then((ids) => (Array.isArray(ids) ? ids : [])).catch(() => [])
    : [];
  if (spellPillActionNeedsTargets(action) && !selectedTargetIds.length) {
    busy = false;
    setStatus("Seleziona prima sulla mappa la creatura dell'azione.", true);
    fitHeight();
    return;
  }
  setStatus("");
  render();
  try {
    const result = await runSpellInstanceAction({
      overview,
      actionId,
      selectedTargetIds,
      operation,
      isCurrent: () => sceneLifecycle.isCurrent(operation),
    });
    if (!sceneLifecycle.isCurrent(operation)) return;
    if (result.status === "popup-opened") {
      close();
      return;
    }
    if (result.status === "executed") {
      lastEntryId = result.undoAvailable === true && result.historyEntryId ? String(result.historyEntryId) : "";
      lastEpoch = operation.epoch;
      $("undo").hidden = !lastEntryId;
      setStatus(`✓ ${String(action.buttonLabel || action.label || "Azione").trim()}`);
      overview = await loadOverview();
      return;
    }
    setStatus(spellPillActionErrorText(result), true);
  } catch (error) {
    console.warn("[spell-pill-actions]", error?.message || error);
    setStatus("Azione non eseguita: riapri il menu.", true);
  } finally {
    busy = false;
    render();
  }
}

async function undo() {
  if (!lastEntryId || busy) return;
  busy = true;
  $("undo").disabled = true;
  try {
    const outcome = await undoSpellInstanceAction(lastEntryId, { sceneEpoch: lastEpoch ?? currentSceneEpoch() });
    if (!outcome.ok) {
      setStatus(outcome.message, true);
      return;
    }
    lastEntryId = "";
    $("undo").hidden = true;
    setStatus("Annullato.");
    overview = await loadOverview();
  } catch (error) {
    console.warn("[spell-pill-actions] undo", error?.message || error);
    setStatus("Annullamento non riuscito: usa la Cronologia.", true);
  } finally {
    busy = false;
    $("undo").disabled = false;
    render();
  }
}

// The whole panel, for what the menu does not cover (a choice, a zone to move), on the action when there is one.
async function openPanel(actionId = "") {
  const context = overview?.context || {};
  const { buildSpellUnifiedPanelRouteQuery } = await import("./spellUnifiedPanelRoutingCore.js");
  const query = buildSpellUnifiedPanelRouteQuery({
    spellId: context.spellId || "",
    casterId: context.casterId || "",
    ...(actionId ? { activeInstanceId: request.spellInstanceId, activeActionId: actionId } : {}),
  });
  try { await OBR.popover.close(SPELLS_POPOVER_ID); } catch {}
  await OBR.popover.open({
    id: SPELLS_POPOVER_ID,
    url: `/spell-unified-panel.html?${query}`,
    width: 640,
    height: 640,
    anchorReference: "POSITION",
    anchorPosition: { left: 60, top: 60 },
    anchorOrigin: { horizontal: "LEFT", vertical: "TOP" },
    transformOrigin: { horizontal: "LEFT", vertical: "TOP" },
    disableClickAway: true,
  });
  close();
}

$("close").addEventListener("click", close);
$("undo").addEventListener("click", () => { void undo(); });
$("panel").addEventListener("click", () => { void openPanel("").catch((error) => console.warn("[spell-pill-actions] panel", error)); });
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") close();
});

OBR.onReady(async () => {
  try {
    await sceneLifecycle.mount();
    overview = await loadOverview();
  } catch (error) {
    console.warn("[spell-pill-actions] load", error?.message || error);
    setStatus("Impossibile leggere l'incantesimo.", true);
  }
  render();
});
window.addEventListener("pagehide", () => sceneLifecycle.dispose());
