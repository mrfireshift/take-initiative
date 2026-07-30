import OBR from "@owlbear-rodeo/sdk";
import {
  ID,
  TRACKER_PANEL_REQUEST_CHANNEL,
} from "./constants.js";
import {
  SAVE_KEYS,
  getInitiativeCard,
  loadInitiativeCard,
  hasInitiativeCardValues,
  saveInitiativeCard,
} from "./initiativeCards.js";
import {
  APPLICABLE_CONDITION_LIST,
  formatConditionName,
} from "./conditions.js";
import {
  getSpellDefinition,
  getQuickActionSpellOptions,
} from "./spells-srd.js";
import {
  MAX_QUICK_ACTIONS,
  quickActionPanel,
  sanitizeQuickActions,
} from "./quickActionsCore.js";
import { executeDirectQuickAction } from "./quickActionExecution.js";

const META_KEY = `${ID}/meta`;
const MODAL_ID = `${ID}/initiative-card-modal`;
const TRACKER_POPOVER_TOGGLE_CHANNEL = ID + "/tracker-popover-toggle";

function closeInitiativeCardPopover() {
  void OBR.broadcast.sendMessage(TRACKER_POPOVER_TOGGLE_CHANNEL, {
    type: "closed",
    id: MODAL_ID,
  }, { destination: "LOCAL" }).catch(() => {});
  void OBR.popover.close(MODAL_ID);
}
const sourceId = new URLSearchParams(window.location.search).get("source") || "";
const labels = { str: "FOR", dex: "DES", con: "COS", int: "INT", wis: "SAG", cha: "CAR" };
const $ = (id) => document.getElementById(id);

let item = null;
let profile = null;
let isGM = false;
let exhaustionSaving = false;
let quickActionLaunching = false;
let activeCardTab = "stats";
let editing = false;

const spellOptions = getQuickActionSpellOptions();
const spellOptionsById = new Map(spellOptions.map((entry) => [entry.id, entry]));

function requestPopoverHeight(height) {
  void OBR.broadcast.sendMessage(TRACKER_POPOVER_TOGGLE_CHANNEL, {
    type: "resize",
    id: MODAL_ID,
    height,
  }, { destination: "LOCAL" }).catch(() => {});
}

function setQuickActionsTabCount(count) {
  $("quickActionsTabCount").textContent = String(Math.max(0, Number(count) || 0));
}

function syncCardTabs() {
  const quickActionsActive = activeCardTab === "quick-actions";
  $("statsTab").setAttribute("aria-selected", quickActionsActive ? "false" : "true");
  $("quickActionsTab").setAttribute("aria-selected", quickActionsActive ? "true" : "false");
  $("statsTab").tabIndex = quickActionsActive ? -1 : 0;
  $("quickActionsTab").tabIndex = quickActionsActive ? 0 : -1;
  $("view").hidden = editing || quickActionsActive;
  $("quickActionsView").hidden = editing || !quickActionsActive;
  $("statsEditPane").hidden = !editing || quickActionsActive;
  $("quickActionsEditPane").hidden = !editing || !quickActionsActive;
  $("form").classList.toggle("active", editing);
  $("edit").style.display = isGM && !editing ? "inline-block" : "none";
  requestPopoverHeight(editing
    ? (quickActionsActive ? 680 : 640)
    : 560);
}

function setCardTab(tab) {
  activeCardTab = tab === "quick-actions" ? "quick-actions" : "stats";
  syncCardTabs();
}

function valueText(value, suffix = "") {
  return value === null || value === undefined ? "-" : `${value}${suffix}`;
}

function signedText(value) {
  if (value === null || value === undefined) return "-";
  return value >= 0 ? `+${value}` : String(value);
}

function quickActionId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `quick-${globalThis.crypto.randomUUID()}`;
  }
  return `quick-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function selectControl(options, value = "") {
  const select = document.createElement("select");
  for (const [optionValue, label] of options) {
    const option = document.createElement("option");
    option.value = optionValue;
    option.textContent = label;
    select.appendChild(option);
  }
  select.value = value;
  return select;
}

function quickActionReference(action) {
  if (action?.kind === "spell") {
    const spell = getSpellDefinition(action.spellId);
    return spell?.catalogLabel || spell?.displayName || spell?.name || action.spellId || "";
  }
  return action?.conditionName || "";
}

function quickActionSummary(action) {
  const target = action.targetMode === "self" ? "su di sé" : "selezione corrente";
  if (action.kind === "condition") {
    return `${action.conditionName} · ${target}`;
  }
  const workflow = action.workflow === "area" ? "Console area" : "Incantesimi";
  return `${workflow} · ${target}`;
}

async function launchQuickAction(action) {
  if (!item || quickActionLaunching) return;
  const panel = quickActionPanel(action);
  if (!panel) return;
  quickActionLaunching = true;
  const status = $("quickActionRunStatus");
  const setStatus = (message, tone = "") => {
    status.textContent = message;
    status.dataset.tone = tone;
  };
  const setButtonsDisabled = (disabled) => {
    $("quickActions").querySelectorAll("button").forEach((button) => {
      button.disabled = disabled;
    });
  };
  setButtonsDisabled(true);
  setStatus(`Esecuzione: ${action.label}…`);
  try {
    const result = await executeDirectQuickAction({
      action,
      sourceItem: item,
      confirmConcentration: (message) => window.confirm(message),
    });
    if (result.mode === "executed") {
      setStatus(`Applicata: ${action.label}.`, "success");
      quickActionLaunching = false;
      setButtonsDisabled(false);
      return;
    }
    if (result.mode === "cancelled") {
      setStatus(`Annullata: ${action.label}.`);
      quickActionLaunching = false;
      setButtonsDisabled(false);
      return;
    }

    if (action.targetMode === "self") {
      await OBR.player.select([item.id], true);
    }
    await OBR.broadcast.sendMessage(TRACKER_PANEL_REQUEST_CHANNEL, {
      type: "open",
      panel,
      sourceId: item.id,
      quickActionId: action.id,
    }, { destination: "LOCAL" });
    closeInitiativeCardPopover();
  } catch (error) {
    console.warn("[initiative-card] quick action:", error?.message || error);
    setStatus(`Applicazione non riuscita: ${action.label}.`, "error");
    quickActionLaunching = false;
    setButtonsDisabled(false);
  }
}

function renderQuickActions() {
  const list = $("quickActions");
  const actions = Array.isArray(profile?.quickActions) ? profile.quickActions : [];
  setQuickActionsTabCount(actions.length);
  list.replaceChildren();
  $("quickActionRunStatus").textContent = "";
  $("quickActionRunStatus").dataset.tone = "";

  if (!actions.length) {
    const empty = document.createElement("div");
    empty.className = "quick-actions-empty";
    empty.textContent = "Nessuna azione rapida configurata.";
    list.appendChild(empty);
    return;
  }

  for (const action of actions) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "quick-action";
    button.title = `Precompila ${action.label}`;
    const icon = document.createElement("span");
    icon.className = "quick-action-icon";
    icon.textContent = action.kind === "condition" ? "C" : "✦";
    const copy = document.createElement("span");
    copy.className = "quick-action-copy";
    const label = document.createElement("strong");
    label.textContent = action.label;
    const summary = document.createElement("small");
    summary.textContent = quickActionSummary(action);
    copy.append(label, summary);
    button.append(icon, copy);
    button.addEventListener("click", () => void launchQuickAction(action));
    list.appendChild(button);
  }
}

function populateQuickActionDatalists() {
  $("quickActionSpellOptions").replaceChildren(...spellOptions.map((entry) => {
    const option = document.createElement("option");
    option.value = entry.label;
    return option;
  }));
  $("quickActionConditionOptions").replaceChildren(...APPLICABLE_CONDITION_LIST.map((name) => {
    const option = document.createElement("option");
    option.value = name;
    option.label = formatConditionName(name);
    return option;
  }));
}

function syncQuickActionAddState() {
  const count = $("quickActionEditorList").querySelectorAll("[data-quick-action-row='1']").length;
  setQuickActionsTabCount(count);
  $("quickActionAdd").disabled = count >= MAX_QUICK_ACTIONS;
  $("quickActionAdd").title = count >= MAX_QUICK_ACTIONS
    ? `Massimo ${MAX_QUICK_ACTIONS} azioni rapide`
    : "Aggiungi azione rapida";
}

function buildQuickActionEditorRow(action = null) {
  const current = action || {
    id: quickActionId(),
    label: "",
    kind: "spell",
    targetMode: "selection",
    workflow: "spell",
    slotLevel: null,
    turns: null,
    conditionName: "",
    expiryMode: "manual",
    duration: null,
  };

  const row = document.createElement("div");
  row.className = "quick-action-editor-row";
  row.dataset.quickActionRow = "1";
  row.dataset.actionId = current.id || quickActionId();

  const head = document.createElement("div");
  head.className = "quick-action-editor-head";
  const labelInput = document.createElement("input");
  labelInput.type = "text";
  labelInput.maxLength = 80;
  labelInput.placeholder = "Etichetta pulsante";
  labelInput.value = current.label || "";
  labelInput.dataset.quickActionField = "label";

  const tools = document.createElement("div");
  tools.className = "quick-action-editor-tools";
  const up = document.createElement("button");
  up.type = "button";
  up.textContent = "↑";
  up.title = "Sposta su";
  const down = document.createElement("button");
  down.type = "button";
  down.textContent = "↓";
  down.title = "Sposta giù";
  const remove = document.createElement("button");
  remove.type = "button";
  remove.textContent = "×";
  remove.title = "Rimuovi";
  tools.append(up, down, remove);
  head.append(labelInput, tools);

  const grid = document.createElement("div");
  grid.className = "quick-action-editor-grid";
  const kindSelect = selectControl([
    ["spell", "Incantesimo"],
    ["condition", "Condizione"],
  ], current.kind || "spell");
  kindSelect.dataset.quickActionField = "kind";
  const targetSelect = selectControl([
    ["selection", "Selezione corrente"],
    ["self", "Su di sé"],
  ], current.targetMode || "selection");
  targetSelect.dataset.quickActionField = "targetMode";

  const referenceInput = document.createElement("input");
  referenceInput.type = "text";
  referenceInput.maxLength = 160;
  referenceInput.autocomplete = "off";
  referenceInput.spellcheck = false;
  referenceInput.value = quickActionReference(current);
  referenceInput.dataset.quickActionField = "reference";

  const workflowSelect = selectControl([
    ["spell", "Pannello Incantesimi"],
    ["area", "Console effetti ad area"],
  ], current.workflow || "spell");
  workflowSelect.dataset.quickActionField = "workflow";
  workflowSelect.dataset.touched = action ? "1" : "0";

  const slotInput = document.createElement("input");
  slotInput.type = "number";
  slotInput.min = "1";
  slotInput.max = "9";
  slotInput.placeholder = "Catalogo";
  slotInput.value = current.slotLevel ?? "";
  slotInput.dataset.quickActionField = "slotLevel";

  const turnsInput = document.createElement("input");
  turnsInput.type = "number";
  turnsInput.min = "1";
  turnsInput.max = "999";
  turnsInput.placeholder = "Catalogo";
  turnsInput.value = current.turns ?? "";
  turnsInput.dataset.quickActionField = "turns";

  const expirySelect = selectControl([
    ["manual", "Manuale"],
    ["rounds", "N round"],
    ["turn-start", "Inizio turno"],
    ["turn-end", "Fine turno"],
  ], current.expiryMode || "manual");
  expirySelect.dataset.quickActionField = "expiryMode";

  const durationInput = document.createElement("input");
  durationInput.type = "number";
  durationInput.min = "1";
  durationInput.max = "999";
  durationInput.value = current.duration ?? "1";
  durationInput.dataset.quickActionField = "duration";

  const makeLabel = (text, control, className = "") => {
    const label = document.createElement("label");
    if (className) label.className = className;
    label.append(text, control);
    return label;
  };
  const kindLabel = makeLabel("Tipo", kindSelect);
  const targetLabel = makeLabel("Bersaglio", targetSelect);
  const referenceLabel = makeLabel("Incantesimo", referenceInput, "wide");
  const workflowLabel = makeLabel("Apertura", workflowSelect);
  const slotLabel = makeLabel("Slot", slotInput);
  const turnsLabel = makeLabel("Durata in round", turnsInput);
  const expiryLabel = makeLabel("Scadenza", expirySelect);
  const durationLabel = makeLabel("Occorrenze", durationInput);
  grid.append(
    kindLabel,
    targetLabel,
    referenceLabel,
    workflowLabel,
    slotLabel,
    turnsLabel,
    expiryLabel,
    durationLabel,
  );

  const syncKind = () => {
    const spell = kindSelect.value === "spell";
    referenceLabel.firstChild.textContent = spell ? "Incantesimo" : "Condizione";
    referenceInput.setAttribute(
      "list",
      spell ? "quickActionSpellOptions" : "quickActionConditionOptions",
    );
    workflowLabel.hidden = !spell;
    slotLabel.hidden = !spell;
    turnsLabel.hidden = !spell;
    expiryLabel.hidden = spell;
    durationLabel.hidden = spell || expirySelect.value === "manual";
  };

  kindSelect.addEventListener("change", () => {
    referenceInput.value = "";
    if (!labelInput.value.trim()) labelInput.value = "";
    syncKind();
    referenceInput.focus();
  });
  workflowSelect.addEventListener("change", () => {
    workflowSelect.dataset.touched = "1";
  });
  referenceInput.addEventListener("change", () => {
    if (kindSelect.value === "spell") {
      const spell = getSpellDefinition(referenceInput.value);
      if (spell) {
        referenceInput.value = spell.catalogLabel || spell.displayName || spell.name;
        if (!labelInput.value.trim()) labelInput.value = spell.displayName || spell.name;
        if (workflowSelect.dataset.touched !== "1") {
          workflowSelect.value = spellOptionsById.get(spell.id)?.area ? "area" : "spell";
        }
      }
    } else if (!labelInput.value.trim()) {
      labelInput.value = referenceInput.value.trim();
    }
  });
  expirySelect.addEventListener("change", syncKind);
  up.addEventListener("click", () => {
    const previous = row.previousElementSibling;
    if (previous) previous.before(row);
  });
  down.addEventListener("click", () => {
    const next = row.nextElementSibling;
    if (next) next.after(row);
  });
  remove.addEventListener("click", () => {
    row.remove();
    syncQuickActionAddState();
  });

  row.append(head, grid);
  syncKind();
  return row;
}

function buildQuickActionEditor() {
  const list = $("quickActionEditorList");
  const actions = Array.isArray(profile?.quickActions) ? profile.quickActions : [];
  list.replaceChildren(...actions.map((action) => buildQuickActionEditorRow(action)));
  syncQuickActionAddState();
}

function collectQuickActions() {
  const rows = Array.from(
    $("quickActionEditorList").querySelectorAll("[data-quick-action-row='1']")
  );
  const drafts = rows.map((row) => {
    const field = (name) => row.querySelector(`[data-quick-action-field='${name}']`);
    const kind = field("kind").value;
    const reference = field("reference").value.trim();
    const label = field("label").value.trim() || reference;
    if (!reference || !label) throw new Error("Completa nome e contenuto di ogni azione rapida.");
    if (kind === "spell") {
      const spell = getSpellDefinition(reference);
      if (!spell) throw new Error(`Incantesimo non riconosciuto: ${reference}`);
      return {
        id: row.dataset.actionId,
        label,
        kind,
        spellId: spell.id,
        workflow: field("workflow").value,
        targetMode: field("targetMode").value,
        slotLevel: field("slotLevel").value,
        turns: field("turns").value,
        applyAutomations: true,
      };
    }
    return {
      id: row.dataset.actionId,
      label,
      kind,
      conditionName: reference,
      targetMode: field("targetMode").value,
      expiryMode: field("expiryMode").value,
      duration: field("duration").value,
    };
  });
  const actions = sanitizeQuickActions(drafts);
  if (actions.length !== drafts.length) {
    throw new Error("Una o più azioni rapide non sono valide.");
  }
  return actions;
}

function applyFactionTheme() {
  const meta = item?.metadata?.[META_KEY] || {};
  const attitude = String(meta.attitude || (meta.inInitiative === true ? "ally" : "neutral"))
    .trim()
    .toLowerCase();
  document.documentElement.dataset.faction = ["pc", "ally", "neutral", "enemy"].includes(attitude)
    ? attitude
    : "neutral";
}

function renderPortrait() {
  const portrait = $("portrait");
  const fallback = $("portraitFallback");
  const name = String(item?.name || "").trim();
  fallback.textContent = name.slice(0, 1).toUpperCase() || "?";
  const source = String(item?.image?.url || item?.image?.src || item?.image?.href || item?.data?.src || "").trim();
  portrait.querySelector("img")?.remove();
  fallback.style.display = "grid";
  if (!source) return;
  const image = document.createElement("img");
  image.alt = "";
  image.src = source;
  image.addEventListener("load", () => { fallback.style.display = "none"; });
  image.addEventListener("error", () => image.remove());
  portrait.appendChild(image);
}

function renderView() {
  const meta = item?.metadata?.[META_KEY] || {};
  $("title").textContent = item?.name || "Scheda iniziativa";
  renderPortrait();
  $("hp").textContent = `${valueText(meta.hp)} / ${valueText(meta.hpMax)}`;
  $("armorClass").textContent = valueText(profile.armorClass);
  $("passivePerception").textContent = valueText(profile.passivePerception);
  $("speed").textContent = valueText(profile.speed, profile.speed === null ? "" : " m");
  $("spellSaveDC").textContent = valueText(profile.spellSaveDC);
  $("spellAttackBonus").textContent = signedText(profile.spellAttackBonus);
  $("notes").textContent = profile.notes || "";
  $("notesBlock").hidden = !profile.notes;
  renderQuickActions();
  $("exhaustion").textContent = String(profile.exhaustion || 0);
  for (const [id, disabled] of [
    ["exhaustionDown", exhaustionSaving || !isGM || profile.exhaustion <= 0],
    ["exhaustionUp", exhaustionSaving || !isGM || profile.exhaustion >= 5],
  ]) {
    const button = $(id);
    button.style.display = isGM ? "inline-block" : "none";
    button.disabled = disabled;
  }
  $("saves").replaceChildren(...SAVE_KEYS.map((key) => {
    const row = document.createElement("div");
    row.className = "save";
    const label = document.createElement("span");
    label.textContent = labels[key];
    const value = document.createElement("strong");
    value.textContent = signedText(profile.savingThrows[key]);
    row.append(label, value);
    return row;
  }));
}

function setEditing(active) {
  editing = !!active;
  if (!editing) {
    setQuickActionsTabCount(profile?.quickActions?.length || 0);
    syncCardTabs();
    return;
  }
  $("armorClassInput").value = profile.armorClass ?? "";
  $("passivePerceptionInput").value = profile.passivePerception ?? "";
  $("speedInput").value = profile.speed ?? "";
  $("exhaustionInput").value = profile.exhaustion ?? 0;
  $("spellSaveDCInput").value = profile.spellSaveDC ?? "";
  $("spellAttackBonusInput").value = profile.spellAttackBonus ?? "";
  $("notesInput").value = profile.notes ?? "";
  buildQuickActionEditor();
  for (const key of SAVE_KEYS) $(`save-${key}`).value = profile.savingThrows[key] ?? "";
  $("status").textContent = "";
  syncCardTabs();
}

async function adjustExhaustion(delta) {
  if (!isGM || !item || exhaustionSaving) return;
  const next = Math.max(0, Math.min(5, Number(profile.exhaustion || 0) + delta));
  if (next === profile.exhaustion) return;
  exhaustionSaving = true;
  renderView();
  try {
    await saveInitiativeCard(item.id, item.name, { ...profile, exhaustion: next });
    [item] = await OBR.scene.items.getItems([item.id]);
    profile = getInitiativeCard(item);
  } catch (err) {
    console.warn("[initiative-card] Indebolimento:", err?.message || err);
  } finally {
    exhaustionSaving = false;
    renderView();
  }
}

function buildSaveInputs() {
  $("saveInputs").replaceChildren(...SAVE_KEYS.map((key) => {
    const label = document.createElement("label");
    label.textContent = labels[key];
    const input = document.createElement("input");
    input.id = `save-${key}`;
    input.type = "number";
    input.min = "-99";
    input.max = "99";
    label.appendChild(input);
    return label;
  }));
}

OBR.onReady(async () => {
  try {
    const [items, role] = await Promise.all([
      OBR.scene.items.getItems([sourceId]),
      OBR.player.getRole(),
    ]);
    item = items[0] || null;
    isGM = role === "GM";
    if (!item) throw new Error("Token non trovato");
    applyFactionTheme();
    profile = await loadInitiativeCard(item, { hydrate: isGM });
    populateQuickActionDatalists();
    buildSaveInputs();
    renderView();
    if (isGM && !hasInitiativeCardValues(profile)) setEditing(true);
    else syncCardTabs();
  } catch (err) {
    $("title").textContent = "Scheda non disponibile";
    $("edit").style.display = "none";
    $("hp").textContent = err?.message || "Errore";
  }
});

$("close").addEventListener("click", closeInitiativeCardPopover);
$("edit").addEventListener("click", () => setEditing(true));
$("cancel").addEventListener("click", () => setEditing(false));
$("statsTab").addEventListener("click", () => setCardTab("stats"));
$("quickActionsTab").addEventListener("click", () => setCardTab("quick-actions"));
$("exhaustionDown").addEventListener("click", () => void adjustExhaustion(-1));
$("exhaustionUp").addEventListener("click", () => void adjustExhaustion(1));
$("quickActionAdd").addEventListener("click", () => {
  const list = $("quickActionEditorList");
  if (list.querySelectorAll("[data-quick-action-row='1']").length >= MAX_QUICK_ACTIONS) return;
  const row = buildQuickActionEditorRow();
  list.appendChild(row);
  syncQuickActionAddState();
  row.querySelector("[data-quick-action-field='label']")?.focus();
});
$("form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!isGM || !item) return;
  const submit = event.submitter;
  if (submit) submit.disabled = true;
  $("status").textContent = "";
  try {
    const savingThrows = Object.fromEntries(SAVE_KEYS.map((key) => [key, $(`save-${key}`).value]));
    await saveInitiativeCard(item.id, item.name, {
      armorClass: $("armorClassInput").value,
      passivePerception: $("passivePerceptionInput").value,
      speed: $("speedInput").value,
      exhaustion: $("exhaustionInput").value,
      spellSaveDC: $("spellSaveDCInput").value,
      spellAttackBonus: $("spellAttackBonusInput").value,
      notes: $("notesInput").value,
      quickActions: collectQuickActions(),
      savingThrows,
    });
    [item] = await OBR.scene.items.getItems([item.id]);
    profile = getInitiativeCard(item);
    renderView();
    setEditing(false);
  } catch (err) {
    $("status").textContent = err?.message || "Salvataggio non riuscito";
  } finally {
    if (submit) submit.disabled = false;
  }
});
