// "Condizioni…" in OBR's token menu (lot 6.7): the card menu's quick conditions (quickConditionsCore.js) for the
// tokens the menu was opened on, with their state (on every token, on some, on none). A click adds the condition or
// takes it off through the effects panel's operation and automation, with History and the map labels, and the grid
// shows the new state, so several can be set in a row. "Tutte le condizioni…" opens the full panel on those tokens.
import OBR from "@owlbear-rodeo/sdk";
import { ID, TRACKER_PANEL_REQUEST_CHANNEL } from "./constants.js";
import { createSceneLifecycleAdapter } from "./sceneLifecycle.js";
import { quickConditionMenuEntries, quickConditionToggleTargets } from "./quickConditionsCore.js";

// The conditions catalogue and the effects coordinator weigh about 1 MB with what they import: loaded alongside,
// not before the page, so the submenu draws at once and OBR's "ready" is not held up by their parsing.
const conditionsModule = import("./conditions.js");
const mutationsModule = import("./effectsMutations.js");

const META_KEY = `${ID}/meta`;
const sceneLifecycle = createSceneLifecycleAdapter({ obr: OBR });
const grid = document.getElementById("grid");
const allConditionsButton = document.getElementById("allConditions") as HTMLButtonElement | null;

let currentIds: string[] = [];
let lastScope = [];
let emojiByName = {};
let busy = false;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// The tokens of the context menu (a few retries: OBR fills the context just after opening), else the selection.
async function contextItemIds({ robust = false } = {}): Promise<string[]> {
  const tries = robust ? 6 : 1;
  for (let i = 0; i < tries; i++) {
    try {
      const context = await OBR.contextMenu.getContext();
      const ids = (context?.items || []).map((item) => item.id).filter(Boolean);
      if (ids.length) return ids;
    } catch {}
    if (robust) await sleep(40);
  }
  try {
    const selection = await OBR.player.getSelection();
    return Array.isArray(selection) ? selection : [];
  } catch {
    return [];
  }
}

async function readScope(ids: string[]) {
  if (!ids.length) return [];
  const { getConditionInstances } = await conditionsModule;
  const wanted = new Set(ids);
  const items = await OBR.scene.items.getItems((item) => wanted.has(item.id));
  return items.map((item) => ({
    id: item.id,
    conditions: getConditionInstances(item?.metadata?.[META_KEY]?.conditions || {})
      .map((instance) => instance.condition),
  }));
}

function render(scope) {
  if (!grid) return;
  lastScope = scope;
  grid.replaceChildren();
  for (const entry of quickConditionMenuEntries(scope, emojiByName)) {
    const button = document.createElement("button");
    button.type = "button";
    // Clicks wait for the scene lifecycle (their stale-scene guard); the states show as soon as OBR is ready.
    button.disabled = busy || !scope.length || !sceneLifecycle.isReady();
    button.dataset.state = entry.state;
    button.setAttribute("aria-pressed", entry.state === "on" ? "true" : entry.state === "mixed" ? "mixed" : "false");
    button.title = entry.state === "on"
      ? `Togli ${entry.name}`
      : entry.state === "mixed"
      ? `${entry.name} solo su alcuni: applica a tutti`
      : `Applica ${entry.name}`;
    const emoji = document.createElement("span");
    emoji.className = "emoji";
    emoji.setAttribute("aria-hidden", "true");
    emoji.textContent = entry.emoji;
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = entry.name;
    button.append(emoji, name);
    button.addEventListener("click", () => { void toggle(entry.name); });
    grid.appendChild(button);
  }
  if (allConditionsButton) allConditionsButton.disabled = !scope.length;
}

async function refresh() {
  if (!OBR.isReady) return;
  render(await readScope(currentIds));
}

function queueRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => { void refresh(); }, 30);
}

async function toggle(conditionName: string) {
  if (busy || !sceneLifecycle.isReady()) return;
  const operation = sceneLifecycle.capture({ operationId: `ctx-condition:${conditionName}:${Date.now().toString(36)}` });
  busy = true;
  try {
    const ids = currentIds.length ? currentIds : await contextItemIds();
    if (!sceneLifecycle.isCurrent(operation) || !ids.length) return;
    const plan = quickConditionToggleTargets(await readScope(ids), conditionName);
    if (!sceneLifecycle.isCurrent(operation) || !plan.targetIds.length) return;
    const [{ refreshConditionLabels }, {
      conditionMutationOperations,
      getEffectsMutationSceneContext,
      requireAppliedEffectsMutation,
      runEffectsMutation,
    }] = await Promise.all([conditionsModule, mutationsModule]);
    if (!sceneLifecycle.isCurrent(operation)) return;
    const label = `${plan.mode === "remove" ? "Rimossa" : "Applicata"}: ${conditionName}${ids.length > 1 ? " (selezione)" : ""}`;
    const owner = await getEffectsMutationSceneContext({ commandId: operation.operationId });
    if (!sceneLifecycle.isCurrent(operation)) return;
    const mutation = await runEffectsMutation(conditionMutationOperations({
      targetIds: plan.targetIds,
      conditionName,
      mode: plan.mode === "remove" ? "toggle" : "add",
    }), {
      kind: "condition",
      label,
      targetIds: plan.targetIds,
      history: { kind: "condition", label },
      commandId: owner.commandId,
      sceneIdentity: owner.sceneIdentity,
    });
    if (!sceneLifecycle.isCurrent(operation)) return;
    requireAppliedEffectsMutation(mutation);
    await refreshConditionLabels(plan.targetIds);
  } catch (error) {
    console.warn("[ctx-conditions] condizione rapida:", (error as Error)?.message || error);
    // Said only in the console before (lot L19).
    void OBR.notification.show("Condizione non applicata: il token è cambiato nel frattempo. Riprova.", "WARNING").catch(() => {});
  } finally {
    busy = false;
    queueRefresh();
  }
}

async function applyTheme() {
  try {
    const theme = await OBR.theme.getTheme();
    document.documentElement.style.setProperty("--obrt-text", theme?.text?.primary ?? "#fff");
  } catch {}
}

async function mount() {
  // OBR's "ready" reaches an embedded submenu late: as soon as it does, the tokens and their conditions come first,
  // while the theme and the scene lifecycle (needed only by the clicks) load alongside.
  void applyTheme();
  const lifecycleMounted = sceneLifecycle.mount();

  allConditionsButton?.addEventListener("click", async () => {
    const ids = currentIds.length ? currentIds : await contextItemIds();
    if (!ids.length) return;
    // The full panel works on the selection: select the menu's tokens, then ask the tracker to open it.
    try { await OBR.player.select(ids, false); } catch {}
    await OBR.broadcast.sendMessage(TRACKER_PANEL_REQUEST_CHANNEL, { type: "open", panel: "conditions" }, { destination: "LOCAL" });
  });

  currentIds = await contextItemIds({ robust: true });
  await refresh();
  await lifecycleMounted;
  if (!sceneLifecycle.isReady()) return;
  await refresh();
  window.addEventListener("focus", async () => {
    currentIds = await contextItemIds({ robust: true });
    queueRefresh();
  });
  OBR.scene.items.onChange(() => queueRefresh());
  OBR.theme.onChange(() => { void applyTheme(); });
}

// Drawn at once, before OBR is ready: the submenu never opens empty (emoji, states and clicks follow).
render([]);
conditionsModule.then((module) => {
  emojiByName = module.CONDITION_EMOJI;
  render(lastScope);
}).catch((error) => console.error("[ctx-conditions] conditions:", error));

sceneLifecycle.subscribe((event) => {
  if (event.phase === "unavailable") {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = null;
    currentIds = [];
    document.querySelectorAll("button").forEach((element) => { (element as HTMLButtonElement).disabled = true; });
  }
});

// OBR.onReady takes a callback (it returns no promise to await): the page mounts from it, like the other embeds.
OBR.onReady(() => {
  mount().catch((error) => {
    console.error("[ctx-conditions] mount error:", error);
  });
});

window.addEventListener("pagehide", () => sceneLifecycle.dispose());
