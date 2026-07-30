import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import {
  buildPreparedSpellResolutionRequest,
  findPreparedSpellResolutionGroup,
  PREPARED_SPELL_RESOLUTION_CHANNEL,
  preparedSpellResolutionChoices,
  preparedSpellResolutionPopoverId,
} from "./preparedSpellResolutionCore.js";
import { executeSpellApplication } from "./spellApplicationExecutor.js";
import { spellResolveActionPresentation } from "./spellsPanelTargetPicker.js";

const META_KEY = `${ID}/meta`;
const instanceId = new URLSearchParams(window.location.search).get("instance") || "";
const app = document.getElementById("app");
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
let selectionTimer = null;
let refreshQueued = false;

const uniqueIds = (values = []) => Array.from(new Set(
  (Array.isArray(values) ? values : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean)
));

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
  if (!currentGroup) {
    resolveButton.disabled = true;
    resolveButton.textContent = "Risolto";
    return;
  }
  const presentation = spellResolveActionPresentation(currentTargetIds.length);
  resolveButton.disabled = resolving || !currentGroup || presentation.disabled;
  resolveButton.textContent = resolving ? "Risoluzione…" : presentation.text;
  resolveButton.title = presentation.title;
  status.textContent = currentTargetIds.length
    ? presentation.title
    : "Seleziona il bersaglio sul tabellone";
}

function renderGroup(group) {
  currentGroup = group;
  if (!group) {
    app.dataset.state = "stale";
    title.textContent = "Preparazione terminata";
    caster.textContent = "";
    choice.hidden = true;
    status.textContent = "L’incantesimo non è più risolvibile.";
    resolveButton.disabled = true;
    resolveButton.textContent = "Risolto";
    return;
  }

  app.dataset.state = "ready";
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
  if (resolving || !currentGroup || !currentTargetIds.length) return;
  resolving = true;
  updateResolvePresentation();
  try {
    const latestItems = await spellItems();
    const latestGroup = findPreparedSpellResolutionGroup(latestItems, instanceId);
    if (!latestGroup) throw new Error("prepared-spell-stale");
    const selection = await OBR.player.getSelection().catch(() => []);
    const targetIds = validSelectedTargets(selection, latestItems);
    if (!targetIds.length) throw new Error("prepared-spell-targets-required");

    const request = buildPreparedSpellResolutionRequest({
      group: latestGroup,
      targetIds,
      selectedChoice: choice.hidden ? "" : choice.value,
    });
    await executeSpellApplication({
      ...request,
      casterName: latestGroup.casterName,
    });
    await requestControllerSync();
    await OBR.popover.close(preparedSpellResolutionPopoverId(instanceId));
  } catch (error) {
    const code = String(error?.message || error);
    if (code === "prepared-spell-stale") {
      renderGroup(null);
      await requestControllerSync();
    } else if (code === "prepared-spell-targets-required") {
      status.textContent = "Seleziona almeno un bersaglio valido.";
    } else {
      status.textContent = "Risoluzione non riuscita. Riprova dal pannello Spells.";
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
  resolveButton.addEventListener("click", resolvePreparedSpell);
  unsubscribeItems = OBR.scene.items.onChange(queueRefresh);
  unsubscribePlayer = OBR.player.onChange((player) => {
    if (Array.isArray(player?.selection)) void refreshSelection(player.selection);
  });
  selectionTimer = window.setInterval(() => void refreshSelection(), 300);
  await refresh();
});

window.addEventListener("beforeunload", () => {
  unsubscribeItems?.();
  unsubscribePlayer?.();
  if (selectionTimer !== null) window.clearInterval(selectionTimer);
  selectionTimer = null;
});
