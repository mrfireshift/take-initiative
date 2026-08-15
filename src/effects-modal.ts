import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import {
  APPLICABLE_CONDITION_LIST,
  formatConditionName,
  formatConditionInstance,
  getConditionInstances,
  refreshConditionLabels,
} from "./conditions.js";
import {
  conditionMutationOperations,
  getEffectsMutationSceneContext,
  requireAppliedEffectsMutation,
  runEffectsMutation,
} from "./effectsMutations.js";
import { createSceneLifecycleAdapter } from "./sceneLifecycle.js";
import { openReferencePopover } from "./referencePopover.js";
import { makeReferenceButton } from "./referenceButton.js";
import { currentInitiativeTurnKey } from "./turnBoundaryCore.js";
import { getInitiativeCard } from "./initiativeCards.js";
import { findQuickAction } from "./quickActionsCore.js";
import { executeConditionApplication } from "./conditionApplicationExecutor.js";

const META_KEY = `${ID}/meta`;
const STATE_KEY = `${ID}/state`;
const MODAL_ID = `${ID}/effects-modal`;
const TRACKER_POPOVER_TOGGLE_CHANNEL = ID + "/tracker-popover-toggle";
const QUICK_ACTION_ID = new URLSearchParams(window.location.search).get("quickAction") || "";
const sceneLifecycle = createSceneLifecycleAdapter({ obr: OBR });

function sceneOperationId(prefix = "effects-modal") {
  return `${prefix}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`;
}

function closeEffectsPopover() {
  void OBR.broadcast.sendMessage(TRACKER_POPOVER_TOGGLE_CHANNEL, {
    type: "closed",
    id: MODAL_ID,
  }, { destination: "LOCAL" }).catch(() => {});
  void OBR.popover.close(MODAL_ID);
}
const LAIR_ID = "__LAIR__";
const EPIC_ACT_PREFIX = "__EPIC__";
let effectsSelectionApply: ((ids: string[]) => void) | null = null;
let effectsSelectionUnsubscribe: (() => void) | null = null;
let effectsSelectionPollTimer: number | null = null;
let effectsSelectionPollBusy = false;
let effectsSelectionWriteDepth = 0;

async function refreshEffectsSelectionFromScene() {
  if (effectsSelectionPollBusy || effectsSelectionWriteDepth > 0) return;
  const operation = sceneLifecycle.capture({ operationId: sceneOperationId("selection-read") });
  if (!sceneLifecycle.isCurrent(operation)) return;
  effectsSelectionPollBusy = true;
  try {
    const selected = await OBR.player.getSelection();
    if (sceneLifecycle.isCurrent(operation)) {
      effectsSelectionApply?.(Array.isArray(selected) ? selected : []);
    }
  } catch {} finally {
    effectsSelectionPollBusy = false;
  }
}

function mountEffectsSelectionSync() {
  if (effectsSelectionUnsubscribe) return;
  effectsSelectionUnsubscribe = OBR.player.onChange((player) => {
    if (sceneLifecycle.isReady() && effectsSelectionWriteDepth === 0 && Array.isArray(player?.selection)) {
      effectsSelectionApply?.(player.selection);
    }
  });
  effectsSelectionPollTimer = window.setInterval(refreshEffectsSelectionFromScene, 120);
}

async function updateSceneTargetSelection(ids: string[], selected: boolean, replace = false) {
  const operation = sceneLifecycle.capture({ operationId: sceneOperationId("selection-write") });
  if (!sceneLifecycle.isCurrent(operation)) return false;
  effectsSelectionWriteDepth += 1;
  try {
    if (selected) await OBR.player.select(ids, replace);
    else await OBR.player.deselect(ids);
    if (!sceneLifecycle.isCurrent(operation)) return false;
  } finally {
    effectsSelectionWriteDepth -= 1;
    if (sceneLifecycle.isCurrent(operation)) await refreshEffectsSelectionFromScene();
  }
  return true;
}

function splitParagonId(id: string) {
  const s = String(id || "");
  const idx = s.indexOf("::p");
  return idx >= 0 ? s.slice(0, idx) : s;
}

function isRealTokenId(id: string) {
  return !!id && id !== LAIR_ID && !id.startsWith(EPIC_ACT_PREFIX);
}

function displayName(name: string) {
  return String(name || "").trim() || "Unnamed";
}

function factionKey(target: any) {
  const attitude = String(target?.metadata?.[META_KEY]?.attitude || "neutral").toLowerCase();
  return ["pc", "ally", "neutral", "enemy"].includes(attitude) ? attitude : "neutral";
}

function factionColor(target: any) {
  const attitude = factionKey(target);
  if (attitude === "enemy") return "#ef4444";
  if (attitude === "ally") return "#22c55e";
  if (attitude === "pc") return "#38bdf8";
  return "#eab308";
}

function conditionRows(target: any) {
  const conditions = target?.metadata?.[META_KEY]?.conditions || {};
  return getConditionInstances(conditions).map((instance: any) => ({
    id: String(instance.id || ""),
    targetId: String(target.id || ""),
    targetName: displayName(target.name),
    name: String(instance.condition || ""),
    label: formatConditionInstance(instance),
    managed: instance.type === "initiative-card",
  }));
}

async function getSceneState() {
  const md = await OBR.scene.getMetadata();
  return md?.[STATE_KEY] || { order: [], current: 0, round: 1 };
}

async function loadData(sourceId: string) {
  const state: any = await getSceneState();
  const order = Array.isArray(state?.order) ? state.order : [];
  const orderedIds = Array.from(new Set(order.map((id: string) => splitParagonId(id)).filter(isRealTokenId)));
  const ordered = new Set(orderedIds);
  const items = await OBR.scene.items.getItems((it) => {
    const meta = it.metadata?.[META_KEY];
    const hasConditions = getConditionInstances(meta?.conditions || {}).length > 0;
    return !!meta && (meta.inInitiative === true || ordered.has(it.id) || it.id === sourceId || hasConditions);
  });
  const byId = new Map(items.map((it) => [it.id, it]));
  const targets = orderedIds.map((id) => byId.get(id)).filter(Boolean) as any[];
  for (const it of items) {
    if (!targets.some((target) => target.id === it.id) && it.metadata?.[META_KEY]?.inInitiative === true) {
      targets.push(it);
    }
  }
  const source = byId.get(sourceId) || targets.find((it) => it.id === sourceId) || null;
  const conditionTargets = items.filter((it) => (
    getConditionInstances(it.metadata?.[META_KEY]?.conditions || {}).length > 0
  ));
  return { source, targets, conditionTargets, state };
}

function styleBase() {
  document.documentElement.style.setProperty("--obrt-text", "#fff");
  document.documentElement.style.setProperty("--obrt-hover", "rgba(255,255,255,.06)");
}

function field<T extends HTMLElement>(el: T) {
  el.classList.add("effects-control");
  return el;
}

function caption(text: string) {
  const element = document.createElement("div");
  element.className = "effects-field__label";
  element.textContent = text;
  return element;
}

function cell(label: string, el: HTMLElement) {
  const wrap = document.createElement("div");
  wrap.dataset.effectsField = "1";
  wrap.className = "effects-field";
  const labelElement = caption(label);
  wrap.append(labelElement, field(el));
  return wrap;
}

function commandButton(text: string, tone: "neutral" | "primary" | "danger" = "neutral") {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = text;
  button.className = `effects-btn${tone === "primary" ? " effects-btn-primary" : tone === "danger" ? " effects-btn-danger" : ""}`;
  return button;
}

function setButtonEnabled(button: HTMLButtonElement, enabled: boolean) {
  button.disabled = !enabled;
  button.style.opacity = enabled ? "1" : ".5";
  button.style.cursor = enabled ? "pointer" : "default";
}

async function render(sourceId: string, preservedTargetIds: string[] | null = null) {
  const operation = sceneLifecycle.capture({ operationId: sceneOperationId("render") });
  if (!sceneLifecycle.isCurrent(operation)) return;
  effectsSelectionApply = null;
  const app = document.getElementById("app");
  if (!app) return;
  const { source, targets, conditionTargets, state } = await loadData(sourceId);
  if (!sceneLifecycle.isCurrent(operation)) return;
  if (!source) {
    app.textContent = "Token non trovato.";
    return;
  }
  const quickActionPreset = preservedTargetIds === null
    ? findQuickAction(getInitiativeCard(source), QUICK_ACTION_ID)
    : null;
  const conditionPreset = quickActionPreset?.kind === "condition"
    ? quickActionPreset
    : null;

  const header = document.createElement("header");
  header.className = "effects-header";
  header.dataset.dragHandle = "1";
  header.draggable = true;
  header.title = "Trascina per spostare";

  const title = document.createElement("h1");
  title.className = "effects-title";
  title.textContent = "Condizioni";

  const close = document.createElement("button");
  close.id = "close";
  close.type = "button";
  close.className = "effects-close-button";
  close.textContent = "×";
  close.title = "Chiudi";
  close.setAttribute("aria-label", "Chiudi");
  close.addEventListener("click", closeEffectsPopover);

  header.append(title, close);

  const scroll = document.createElement("div");
  scroll.className = "effects-scroll";

  const grid = document.createElement("div");
  grid.dataset.effectsFormGrid = "1";
  grid.className = "effects-form-grid";

  const effectSelect = document.createElement("select");
  for (const name of APPLICABLE_CONDITION_LIST) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = formatConditionName(name);
    effectSelect.appendChild(option);
  }
  const CUSTOM_EFFECT_VALUE = "__custom__";
  const customOption = document.createElement("option");
  customOption.value = CUSTOM_EFFECT_VALUE;
  customOption.textContent = "Personalizzata...";
  effectSelect.appendChild(customOption);

  const customEffectInput = document.createElement("input");
  customEffectInput.type = "text";
  customEffectInput.maxLength = 80;
  customEffectInput.autocomplete = "off";
  customEffectInput.spellcheck = false;
  customEffectInput.placeholder = "Es. Santuario del Crepuscolo";
  customEffectInput.style.display = "none";
  customEffectInput.style.marginTop = "6px";

  const effectCell = document.createElement("div");
  effectCell.dataset.effectsField = "1";
  effectCell.className = "effects-field";
  const effectCaption = caption("CONDIZIONE");
  customEffectInput.style.gridColumn = "2";
  effectCell.append(effectCaption, field(effectSelect), field(customEffectInput));

  const durationInput = document.createElement("input");
  durationInput.type = "number";
  durationInput.min = "1";
  durationInput.step = "1";
  durationInput.value = "1";

  const expirySelect = document.createElement("select");
  for (const [value, text] of [
    ["manual", "Manuale"],
    ["rounds", "N round"],
    ["turn-start", "Inizio turno"],
    ["turn-end", "Fine turno"],
  ]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = text;
    expirySelect.appendChild(option);
  }

  let actorId = source.id;
  let actorName = displayName(source.name);
  const actorPicker = document.createElement("div");
  Object.assign(actorPicker.style, { position: "relative", minWidth: "0" });
  actorPicker.addEventListener("pointerdown", (event) => event.stopPropagation());

  const actorButton = field(document.createElement("button"));
  actorButton.type = "button";
  actorButton.textContent = actorName;
  actorButton.setAttribute("aria-haspopup", "menu");
  actorButton.setAttribute("aria-expanded", "false");
  Object.assign(actorButton.style, {
    textAlign: "left",
    paddingRight: "30px",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    cursor: "pointer",
  });

  const actorCaret = document.createElement("span");
  actorCaret.className = "obrt-select-caret";
  actorCaret.setAttribute("aria-hidden", "true");
  Object.assign(actorCaret.style, {
    position: "absolute",
    top: "50%",
    right: "11px",
    pointerEvents: "none",
    transform: "translateY(-50%)",
  });

  const actorMenu = document.createElement("div");
  actorMenu.setAttribute("role", "menu");
  Object.assign(actorMenu.style, {
    display: "none",
    position: "absolute",
    zIndex: "30",
    top: "36px",
    left: "0",
    width: "max(100%, 220px)",
    maxHeight: "220px",
    overflowY: "auto",
    padding: "5px",
    border: "1px solid rgba(148,163,184,.28)",
    borderRadius: "10px",
    background: "rgba(15,23,42,.97)",
    boxShadow: "0 8px 20px rgba(0,0,0,.45)",
  });

  const setActorMenuOpen = (open: boolean) => {
    actorMenu.style.display = open ? "grid" : "none";
    actorButton.setAttribute("aria-expanded", String(open));
  };

  const addActorOption = (id: string, name: string, text: string) => {
    const option = document.createElement("button");
    option.type = "button";
    option.setAttribute("role", "menuitem");
    option.textContent = text;
    Object.assign(option.style, {
      minHeight: "30px",
      padding: "6px 8px",
      border: "0",
      borderRadius: "8px",
      background: "transparent",
      color: "var(--obrt-text)",
      font: "inherit",
      textAlign: "left",
      cursor: "pointer",
    });
    option.addEventListener("mouseenter", () => { option.style.background = "rgba(255,255,255,.1)"; });
    option.addEventListener("mouseleave", () => { option.style.background = "transparent"; });
    option.addEventListener("click", () => {
      actorId = id;
      actorName = name;
      actorButton.textContent = text;
      setActorMenuOpen(false);
    });
    actorMenu.appendChild(option);
  };

  addActorOption("", "Nessuna fonte", "[Nessuna]");
  for (const target of targets) {
    const name = displayName(target.name);
    addActorOption(target.id, name, name);
  }
  actorButton.addEventListener("click", () => {
    if (!actorButton.disabled) setActorMenuOpen(actorMenu.style.display === "none");
  });
  actorPicker.append(actorButton, actorCaret, actorMenu);
  scroll.addEventListener("pointerdown", () => setActorMenuOpen(false));

  const actorCell = document.createElement("div");
  actorCell.dataset.effectsField = "1";
  actorCell.className = "effects-field";
  const actorCaption = caption("FONTE");
  actorCell.append(actorCaption, actorPicker);

  const addButton = commandButton("Aggiungi", "primary");
  addButton.style.gridColumn = "1 / -1";
  grid.append(
    effectCell,
    actorCell,
    cell("SCADENZA", expirySelect),
    cell("DURATA", durationInput),
    addButton
  );

  const targetWrap = document.createElement("section");
  targetWrap.className = "effects-target-section";

  const targetHeader = document.createElement("div");
  targetHeader.className = "effects-target-header";

  const targetHeading = document.createElement("div");
  targetHeading.className = "effects-target-heading";

  const targetTitle = caption("BERSAGLI");
  const targetSelectionCount = document.createElement("div");
  targetSelectionCount.className = "effects-target-count";
  targetHeading.append(targetTitle, targetSelectionCount);

  const targetActions = document.createElement("div");
  targetActions.className = "effects-filter-bar";

  const targetNameFilter = document.createElement("input");
  targetNameFilter.id = "targetNameFilter";
  targetNameFilter.type = "search";
  targetNameFilter.className = "effects-search-input";
  targetNameFilter.placeholder = "Cerca nome…";
  targetNameFilter.setAttribute("aria-label", "Filtra bersagli per nome");

  const activeFactionFilters = new Set<string>();
  const factionButtons = new Map<string, HTMLButtonElement>();
  for (const [value, label] of [
    ["pc", "PG"],
    ["ally", "Alleati"],
    ["neutral", "Neutrali"],
    ["enemy", "Nemici"],
  ]) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "effects-faction-btn";
    button.dataset.faction = value;
    button.textContent = label;
    button.setAttribute("aria-pressed", "false");
    factionButtons.set(value, button);
  }
  targetActions.append(targetNameFilter, ...factionButtons.values());
  targetHeader.append(targetHeading, targetActions);

  const targetGrid = document.createElement("div");
  targetGrid.dataset.effectsTargetGrid = "1";
  targetGrid.className = "effects-target-grid";

  targetWrap.append(targetHeader, targetGrid);

  let initialTargetIds = preservedTargetIds === null
    ? []
    : preservedTargetIds.filter((id) => targets.some((target) => target.id === id));
  if (preservedTargetIds === null) {
    if (conditionPreset?.targetMode === "self") {
      initialTargetIds = [sourceId];
    } else {
      try {
        const selected = await OBR.player.getSelection();
        initialTargetIds = (Array.isArray(selected) ? selected : [])
          .filter((id) => targets.some((target) => target.id === id));
      } catch {}
    }
    if (!initialTargetIds.length) initialTargetIds = [sourceId];
  }
  const initialIds = new Set(initialTargetIds);
  const targetControls = new Map<string, {
    checkbox: HTMLInputElement;
    row: HTMLLabelElement;
    faction: string;
    name: string;
  }>();

  for (const target of targets) {
    const row = document.createElement("label");
    row.className = "effects-target-row";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = initialIds.has(target.id);
    checkbox.value = target.id;
    checkbox.style.accentColor = "#2563eb";
    checkbox.style.margin = "0";
    const faction = document.createElement("span");
    const color = factionColor(target);
    faction.className = "effects-target-dot";
    faction.style.background = color;
    faction.style.color = color;
    const name = document.createElement("span");
    name.className = "effects-target-name";
    name.textContent = displayName(target.name);
    row.append(checkbox, faction, name);
    targetGrid.appendChild(row);
    targetControls.set(target.id, {
      checkbox,
      row,
      faction: factionKey(target),
      name: displayName(target.name).toLocaleLowerCase("it"),
    });
  }
  targetWrap.append(targetHeader, targetGrid);

  const activeWrap = document.createElement("section");
  activeWrap.className = "effects-active-section";

  const activeHeader = document.createElement("div");
  activeHeader.className = "effects-active-header";

  const activeTitle = caption("EFFETTI ATTIVI");
  const removeSelectedButton = commandButton("Rimuovi selezionati", "danger");
  const removeAllButton = commandButton("Rimuovi Tutto", "danger");
  const activeActions = document.createElement("div");
  activeActions.style.display = "flex";
  activeActions.style.alignItems = "center";
  activeActions.style.gap = "6px";
  for (const button of [removeSelectedButton, removeAllButton]) {
    button.style.minHeight = "28px";
    button.style.padding = "0 9px";
    button.style.fontSize = "var(--obrt-type-secondary, 11px)";
  }
  setButtonEnabled(removeAllButton, false);
  activeActions.append(removeSelectedButton, removeAllButton);
  activeHeader.append(activeTitle, activeActions);

  const activeList = document.createElement("div");
  activeList.className = "effects-active-list";
  activeWrap.append(activeHeader, activeList);

  const selectedEffectRows = new Set<string>();
  let visibleEffectRows: ReturnType<typeof conditionRows> = [];

  const selectedTargetIds = () => Array.from(targetControls.entries())
    .filter(([, control]) => control.checkbox.checked)
    .map(([id]) => id);
  const selectedEffectName = () => effectSelect.value === CUSTOM_EFFECT_VALUE
    ? customEffectInput.value.trim()
    : effectSelect.value;

  const updateRemoveSelectedButton = () => {
    setButtonEnabled(removeSelectedButton, selectedEffectRows.size > 0);
  };

  const removeRows = async (rows: ReturnType<typeof conditionRows>) => {
    const operation = sceneLifecycle.capture({ operationId: sceneOperationId("remove-effects") });
    if (!sceneLifecycle.isCurrent(operation)) return;
    rows = rows.filter((row) => !row.managed);
    if (!rows.length) return;
    const targetIds = selectedTargetIds();
    const label = rows.length > 1 ? "Rimossi effetti multipli" : `Rimossa: ${rows[0].name}`;
    const ownerSceneContext = await getEffectsMutationSceneContext({
      commandId: operation.operationId,
    });
    if (!sceneLifecycle.isCurrent(operation)) return;
    const mutation = await runEffectsMutation([{
      type: "condition:remove-instances",
      removals: rows.map((row) => ({ itemId: row.targetId, instanceId: row.id })),
    }], {
      kind: "condition",
      label,
      targetIds,
      commandId: ownerSceneContext.commandId,
      sceneIdentity: ownerSceneContext.sceneIdentity,
      history: { kind: "condition", label },
    });
    if (!sceneLifecycle.isCurrent(operation)) return;
    requireAppliedEffectsMutation(mutation);
    const changedIds = mutation.changedIds;
    await refreshConditionLabels(changedIds);
    if (!sceneLifecycle.isCurrent(operation)) return;
    await render(sourceId, targetIds);
  };

  const renderActiveRows = () => {
    activeList.replaceChildren();
    selectedEffectRows.clear();
    updateRemoveSelectedButton();

    visibleEffectRows = conditionTargets.flatMap((target) => conditionRows(target));
    setButtonEnabled(removeAllButton, visibleEffectRows.some((row) => !row.managed));

    if (!visibleEffectRows.length) {
      const empty = document.createElement("div");
      empty.textContent = "Nessun effetto attivo.";
      empty.style.textAlign = "center";
      empty.style.color = "rgba(255,255,255,.75)";
      empty.style.fontSize = "var(--obrt-type-body, 12px)";
      empty.style.padding = "10px";
      activeList.appendChild(empty);
      return;
    }

    for (const row of visibleEffectRows) {
      const key = `${row.targetId}\u0000${row.id}`;
      const line = document.createElement("div");
      line.className = "effects-active-row";

      const selectRow = document.createElement("label");
      selectRow.style.display = "flex";
      selectRow.style.alignItems = "center";
      selectRow.style.gap = "8px";
      selectRow.style.minWidth = "0";
      selectRow.style.flex = "1 1 auto";
      selectRow.style.cursor = "pointer";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.disabled = row.managed;
      checkbox.style.accentColor = "#2563eb";
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) selectedEffectRows.add(key);
        else selectedEffectRows.delete(key);
        updateRemoveSelectedButton();
      });

      const text = document.createElement("span");
      text.style.minWidth = "0";
      text.style.overflow = "hidden";
      text.style.textOverflow = "ellipsis";
      text.style.whiteSpace = "nowrap";
      text.style.fontSize = "var(--obrt-type-body, 12px)";

      const targetBadge = document.createElement("strong");
      targetBadge.textContent = row.targetName;
      targetBadge.style.marginRight = "7px";
      const effectText = document.createTextNode(row.label);
      text.append(targetBadge, effectText);
      if (row.managed) {
        const managed = document.createElement("small");
        managed.textContent = " · scheda iniziativa";
        managed.style.color = "rgba(255,255,255,.55)";
        text.appendChild(managed);
        selectRow.style.cursor = "default";
      }
      selectRow.append(checkbox, text);

      const referenceButton = makeReferenceButton(`Apri Enciclopedia: ${row.name}`, () => {
        void openReferencePopover({
          tab: "conditions",
          entry: row.name,
          closeId: MODAL_ID,
        }).catch((error) => console.warn("[effects] reference open error:", error?.message || error));
      });

      const removeButton = commandButton("Rimuovi", "danger");
      removeButton.style.flex = "0 0 auto";
      removeButton.style.minHeight = "28px";
      removeButton.style.padding = "0 8px";
      removeButton.style.fontSize = "var(--obrt-type-secondary, 11px)";
      removeButton.addEventListener("click", () => removeRows([row]));

      line.append(selectRow, referenceButton);
      if (!row.managed) line.append(removeButton);
      activeList.appendChild(line);
    }
  };

  const updateTargetSelection = () => {
    const nameQuery = targetNameFilter.value.trim().toLocaleLowerCase("it");
    const selectedCount = selectedTargetIds().length;
    targetSelectionCount.textContent = selectedCount === 1 ? "1 selezionato" : `${selectedCount} selezionati`;
    for (const control of targetControls.values()) {
      const selected = control.checkbox.checked;
      const matchesFaction = activeFactionFilters.size === 0 || activeFactionFilters.has(control.faction);
      const matchesName = !nameQuery || control.name.includes(nameQuery);
      control.row.style.display = matchesFaction && matchesName
        ? "flex"
        : "none";
      control.row.classList.toggle("selected", selected);
    }
    setButtonEnabled(addButton, selectedTargetIds().length > 0 && selectedEffectName().length > 0);
  };

  const syncEffectControls = () => {
    const custom = effectSelect.value === CUSTOM_EFFECT_VALUE;
    customEffectInput.style.display = custom ? "block" : "none";
    updateTargetSelection();
    if (custom) customEffectInput.focus();
  };
  effectSelect.addEventListener("change", syncEffectControls);
  customEffectInput.addEventListener("input", updateTargetSelection);
  targetNameFilter.addEventListener("input", updateTargetSelection);
  for (const [faction, button] of factionButtons) {
    button.addEventListener("click", () => {
      if (activeFactionFilters.has(faction)) activeFactionFilters.delete(faction);
      else activeFactionFilters.add(faction);
      const active = activeFactionFilters.has(faction);
      button.setAttribute("aria-pressed", String(active));
      updateTargetSelection();
    });
  }

  effectsSelectionApply = (ids: string[]) => {
    const selected = new Set(ids);
    for (const [id, control] of targetControls) control.checkbox.checked = selected.has(id);
    updateTargetSelection();
  };

  for (const [id, control] of targetControls) {
    control.checkbox.addEventListener("change", () => {
      updateTargetSelection();
      void updateSceneTargetSelection([id], control.checkbox.checked);
    });
  }
  removeSelectedButton.addEventListener("click", () => {
    const rows = visibleEffectRows.filter((row) => selectedEffectRows.has(`${row.targetId}\u0000${row.id}`));
    void removeRows(rows);
  });
  removeAllButton.addEventListener("click", () => {
    void removeRows(visibleEffectRows);
  });

  const syncExpiryControls = () => {
    const mode = expirySelect.value;
    const usesDuration = mode === "rounds" || mode === "turn-start" || mode === "turn-end";
    durationInput.disabled = !usesDuration;
    actorButton.disabled = false;
    durationInput.style.opacity = usesDuration ? "1" : ".45";
    actorButton.style.opacity = "1";
    actorButton.style.cursor = "pointer";
  };
  expirySelect.addEventListener("change", syncExpiryControls);

  addButton.addEventListener("click", async () => {
    if (!sceneLifecycle.isReady()) return;
    const operation = sceneLifecycle.capture({ operationId: sceneOperationId("add-effect") });
    if (!sceneLifecycle.isCurrent(operation)) return;
    const ids = selectedTargetIds();
    if (!ids.length) return;
    const effectName = selectedEffectName();
    if (!effectName) {
      customEffectInput.focus();
      return;
    }
    const isCustomEffect = effectSelect.value === CUSTOM_EFFECT_VALUE;
    setButtonEnabled(addButton, false);

    const mode = expirySelect.value;
    const expiry: any = { mode };
    if (mode === "rounds" || mode === "turn-start" || mode === "turn-end") {
      expiry.remaining = Math.max(1, Math.floor(Number(durationInput.value) || 1));
    }
    if (mode === "turn-start" || mode === "turn-end") {
      expiry.actor = actorId ? "source" : "target";
      if (actorId) {
        expiry.actorId = actorId;
        expiry.actorName = actorName;
      }
    }

    const order = Array.isArray(state?.order) ? state.order : [];
    const activeId = order[state?.current] || null;
    const ownerSceneContext = await getEffectsMutationSceneContext({
      commandId: operation.operationId,
    });
    if (!sceneLifecycle.isCurrent(operation)) return;
    await executeConditionApplication({
      conditionName: effectName,
      targetIds: ids,
      conditionMode: isCustomEffect ? "custom" : "add",
      sourceId: actorId,
      sourceName: actorId ? actorName : "",
      appliedAt: {
        round: Math.max(1, Number(state?.round || 1)),
        actorId: activeId,
        phase: "turn",
        turnKey: currentInitiativeTurnKey(state),
      },
      expiry,
      sceneIdentity: ownerSceneContext.sceneIdentity,
      commandId: ownerSceneContext.commandId,
    });
    if (!sceneLifecycle.isCurrent(operation)) return;
    await render(sourceId, ids);
  });

  scroll.append(grid, targetWrap, activeWrap);
  app.replaceChildren(header, scroll);
  if (conditionPreset) {
    const knownCondition = Array.from(effectSelect.options)
      .some((option) => option.value === conditionPreset.conditionName);
    if (knownCondition) {
      effectSelect.value = conditionPreset.conditionName;
    } else {
      effectSelect.value = CUSTOM_EFFECT_VALUE;
      customEffectInput.value = conditionPreset.conditionName;
    }
    expirySelect.value = conditionPreset.expiryMode;
    if (conditionPreset.duration) {
      durationInput.value = String(conditionPreset.duration);
    }
  }
  syncExpiryControls();
  syncEffectControls();
  renderActiveRows();
  void refreshEffectsSelectionFromScene();
  effectSelect.focus();
}

OBR.onReady(async () => {
  styleBase();
  const sourceId = new URLSearchParams(window.location.search).get("source") || "";
  sceneLifecycle.subscribe((event) => {
    if (event.phase === "unavailable") {
      effectsSelectionApply = null;
      if (effectsSelectionPollTimer) window.clearInterval(effectsSelectionPollTimer);
      effectsSelectionPollTimer = null;
      document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement | HTMLTextAreaElement>(
        "input, select, textarea, button",
      ).forEach((control) => {
        if (control.id !== "close") control.disabled = true;
      });
    } else if (event.phase === "ready" && event.reason !== "scene-bootstrap-ready") {
      void render(sourceId);
      mountEffectsSelectionSync();
    }
  });
  sceneLifecycle.registerSceneCleanup(() => {
    if (effectsSelectionPollTimer) window.clearInterval(effectsSelectionPollTimer);
    effectsSelectionPollTimer = null;
  });
  await sceneLifecycle.mount();
  if (!sceneLifecycle.isReady()) return;
  mountEffectsSelectionSync();
  await render(sourceId);
});

window.addEventListener("pagehide", () => {
  effectsSelectionUnsubscribe?.();
  effectsSelectionUnsubscribe = null;
  if (effectsSelectionPollTimer) window.clearInterval(effectsSelectionPollTimer);
  effectsSelectionPollTimer = null;
  sceneLifecycle.dispose();
});
