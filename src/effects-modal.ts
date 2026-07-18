import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import {
  APPLICABLE_CONDITION_LIST,
  formatConditionName,
  formatConditionInstance,
  getConditionInstances,
  addCustomForItems,
  addOrUpdateConditionForItems,
  removeConditionInstancesFromItems,
  refreshConditionLabels,
} from "./conditions.js";
import { withItemMetaHistory } from "./history.js";

const META_KEY = `${ID}/meta`;
const STATE_KEY = `${ID}/state`;
const MODAL_ID = `${ID}/effects-modal`;
const TRACKER_POPOVER_TOGGLE_CHANNEL = ID + "/tracker-popover-toggle";

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
  effectsSelectionPollBusy = true;
  try {
    const selected = await OBR.player.getSelection();
    effectsSelectionApply?.(Array.isArray(selected) ? selected : []);
  } catch {} finally {
    effectsSelectionPollBusy = false;
  }
}

function mountEffectsSelectionSync() {
  if (effectsSelectionUnsubscribe) return;
  effectsSelectionUnsubscribe = OBR.player.onChange((player) => {
    if (effectsSelectionWriteDepth === 0 && Array.isArray(player?.selection)) {
      effectsSelectionApply?.(player.selection);
    }
  });
  effectsSelectionPollTimer = window.setInterval(refreshEffectsSelectionFromScene, 120);
}

async function updateSceneTargetSelection(ids: string[], selected: boolean, replace = false) {
  effectsSelectionWriteDepth += 1;
  try {
    if (selected) await OBR.player.select(ids, replace);
    else await OBR.player.deselect(ids);
  } finally {
    effectsSelectionWriteDepth -= 1;
    await refreshEffectsSelectionFromScene();
  }
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
  document.documentElement.style.margin = "0";
  document.documentElement.style.background = "transparent";
  document.body.style.margin = "0";
  document.body.style.background = "transparent";
  document.body.style.color = "var(--obrt-text)";
  document.body.style.fontFamily = 'var(--obrt-font-ui, "Helvetica Neue", Helvetica, Arial, sans-serif)';
  document.body.style.fontSize = "var(--obrt-type-body, 12px)";
  document.body.style.lineHeight = "1.25";
  const responsive = document.createElement("style");
  responsive.textContent = `
    @media (max-width: 620px) {
      [data-effects-form-grid] { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
      [data-effects-form-grid] > button { width: 100%; }
    }
    @media (max-width: 420px) {
      [data-effects-form-grid] { grid-template-columns: 1fr !important; }
      [data-effects-target-grid] { grid-template-columns: 1fr !important; }
    }
  `;
  document.head.appendChild(responsive);
}

function field<T extends HTMLElement>(el: T) {
  Object.assign(el.style, {
    width: "100%",
    boxSizing: "border-box",
    minHeight: "32px",
    padding: "6px 8px",
    borderRadius: "10px",
    border: "1px solid rgba(148,163,184,.28)",
    background: "rgba(0,0,0,.35)",
    color: "var(--obrt-text)",
    font: "inherit",
    lineHeight: "1.2",
    outline: "none",
  });
  return el;
}

function caption(text: string) {
  const element = document.createElement("div");
  element.textContent = text;
  Object.assign(element.style, {
    display: "block",
    margin: "0 0 4px",
    textAlign: "left",
    fontSize: "var(--obrt-type-caption, 10px)",
    fontWeight: "var(--obrt-weight-bold, 700)",
    letterSpacing: ".07em",
    color: "rgba(255,255,255,.66)",
  });
  return element;
}

function cell(label: string, el: HTMLElement) {
  const wrap = document.createElement("div");
  wrap.style.minWidth = "0";
  wrap.append(caption(label), field(el));
  return wrap;
}

function commandButton(text: string, tone: "neutral" | "primary" | "danger" = "neutral") {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = text;
  const palette = tone === "primary"
    ? { base: "#2563eb", hover: "#1d4ed8", border: "rgba(255,255,255,.20)" }
    : tone === "danger"
      ? { base: "rgba(220,38,38,.28)", hover: "rgba(220,38,38,.46)", border: "rgba(248,113,113,.42)" }
      : { base: "rgba(255,255,255,.07)", hover: "rgba(255,255,255,.12)", border: "rgba(255,255,255,.15)" };
  Object.assign(button.style, {
    minHeight: "32px",
    padding: "8px 12px",
    border: `1px solid ${palette.border}`,
    borderRadius: "9px",
    background: palette.base,
    color: "var(--obrt-text)",
    font: "inherit",
    fontWeight: "var(--obrt-weight-semibold, 600)",
    cursor: "pointer",
    transition: "background-color .12s ease, border-color .12s ease, opacity .12s ease",
  });
  button.addEventListener("mouseenter", () => {
    if (!button.disabled) button.style.background = palette.hover;
  });
  button.addEventListener("mouseleave", () => { button.style.background = palette.base; });
  return button;
}

function setButtonEnabled(button: HTMLButtonElement, enabled: boolean) {
  button.disabled = !enabled;
  button.style.opacity = enabled ? "1" : ".6";
  button.style.cursor = enabled ? "pointer" : "default";
}

async function render(sourceId: string, preservedTargetIds: string[] | null = null) {
  effectsSelectionApply = null;
  const app = document.getElementById("app");
  if (!app) return;
  const { source, targets, conditionTargets, state } = await loadData(sourceId);
  if (!source) {
    app.textContent = "Token non trovato.";
    return;
  }

  const panel = document.createElement("div");

  Object.assign(panel.style, {
    boxSizing: "border-box",
    padding: "12px",
    background: "transparent",
    color: "var(--obrt-text)",
  });

  const title = document.createElement("div");
  title.textContent = `Effetti: ${displayName(source.name)}`;
  Object.assign(title.style, {
    paddingRight: "40px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    textAlign: "left",
    fontSize: "var(--obrt-type-panel-title, 16px)",
    fontWeight: "var(--obrt-weight-bold, 700)",
    letterSpacing: "-.01em",
    marginBottom: "10px",
  });

  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "X";
  close.title = "Chiudi";
  Object.assign(close.style, {
    position: "fixed",
    right: "12px",
    top: "9px",
    width: "30px",
    height: "30px",
    border: "1px solid transparent",
    borderRadius: "9px",
    background: "transparent",
    color: "var(--obrt-text)",
    font: "inherit",
    fontSize: "15px",
    cursor: "pointer",
  });
  close.addEventListener("mouseenter", () => { close.style.background = "rgba(255,255,255,.08)"; });
  close.addEventListener("mouseleave", () => { close.style.background = "transparent"; });
  close.addEventListener("click", closeEffectsPopover);

  const grid = document.createElement("div");
  grid.dataset.effectsFormGrid = "1";
  Object.assign(grid.style, {
    display: "grid",
    gridTemplateColumns: "minmax(170px,1.35fr) 82px 125px minmax(150px,1fr) auto",
    gap: "6px",
    alignItems: "end",
    padding: "8px",
    border: "1px solid rgba(148,163,184,.20)",
    borderRadius: "11px",
    background: "rgba(3,7,18,.30)",
  });

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
  effectCell.style.minWidth = "0";
  effectCell.append(caption("CONDIZIONE"), field(effectSelect), field(customEffectInput));

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

  let actorId = "";
  let actorName = "Bersaglio";
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
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    cursor: "pointer",
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

  addActorOption("", "Bersaglio", "[Bersaglio]");
  for (const target of targets) {
    const name = displayName(target.name);
    addActorOption(target.id, name, name);
  }
  actorButton.addEventListener("click", () => {
    if (!actorButton.disabled) setActorMenuOpen(actorMenu.style.display === "none");
  });
  actorPicker.append(actorButton, actorMenu);
  panel.addEventListener("pointerdown", () => setActorMenuOpen(false));

  const actorCell = document.createElement("div");
  actorCell.style.minWidth = "0";
  actorCell.append(caption("TURNO DI"), actorPicker);

  const addButton = commandButton("Aggiungi", "primary");
  grid.append(
    effectCell,
    cell("DURATA", durationInput),
    cell("SCADENZA", expirySelect),
    actorCell,
    addButton
  );

  const targetWrap = document.createElement("div");
  Object.assign(targetWrap.style, { marginTop: "10px" });

  const targetHeader = document.createElement("div");
  Object.assign(targetHeader.style, {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "7px",
  });
  const targetTitle = caption("BERSAGLI");
  targetTitle.style.margin = "0";

  const targetActions = document.createElement("div");
  Object.assign(targetActions.style, {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    flexWrap: "wrap",
    gap: "5px",
  });
  const targetNameFilter = document.createElement("input");
  targetNameFilter.type = "search";
  targetNameFilter.placeholder = "Cerca nome…";
  targetNameFilter.setAttribute("aria-label", "Filtra bersagli per nome");
  Object.assign(targetNameFilter.style, {
    width: "116px",
    minHeight: "28px",
    padding: "4px 8px",
    border: "1px solid rgba(148,163,184,.28)",
    borderRadius: "8px",
    background: "rgba(15,23,42,.9)",
    color: "inherit",
    font: "inherit",
    fontSize: "var(--obrt-type-secondary, 11px)",
    outline: "none",
  });
  const activeFactionFilters = new Set<string>();
  const factionButtons = new Map<string, HTMLButtonElement>();
  for (const [value, label] of [
    ["pc", "PG"],
    ["ally", "Alleati"],
    ["neutral", "Neutrali"],
    ["enemy", "Nemici"],
  ]) {
    const button = commandButton(label);
    button.setAttribute("aria-pressed", "false");
    Object.assign(button.style, {
      minHeight: "28px",
      padding: "0 7px",
      fontSize: "var(--obrt-type-caption, 10px)",
      fontWeight: "var(--obrt-weight-semibold, 600)",
    });
    factionButtons.set(value, button);
  }
  targetActions.append(targetNameFilter, ...factionButtons.values());
  targetHeader.append(targetTitle, targetActions);

  const targetGrid = document.createElement("div");
  targetGrid.dataset.effectsTargetGrid = "1";
  Object.assign(targetGrid.style, {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "5px",
    maxHeight: "150px",
    overflowY: "auto",
    padding: "6px",
    border: "1px solid rgba(148,163,184,.20)",
    borderRadius: "11px",
    background: "rgba(0,0,0,.20)",
  });

  let initialTargetIds = preservedTargetIds === null
    ? []
    : preservedTargetIds.filter((id) => targets.some((target) => target.id === id));
  if (preservedTargetIds === null) {
    try {
      const selected = await OBR.player.getSelection();
      initialTargetIds = (Array.isArray(selected) ? selected : [])
        .filter((id) => targets.some((target) => target.id === id));
    } catch {}
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
    Object.assign(row.style, {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      minWidth: "0",
      minHeight: "32px",
      padding: "5px 8px",
      boxSizing: "border-box",
      border: "1px solid rgba(148,163,184,.14)",
      borderRadius: "9px",
      background: "rgba(255,255,255,.025)",
      cursor: "pointer",
    });
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = initialIds.has(target.id);
    checkbox.value = target.id;
    checkbox.style.accentColor = "#2563eb";
    checkbox.style.margin = "0";
    const faction = document.createElement("span");
    const color = factionColor(target);
    Object.assign(faction.style, {
      width: "8px",
      height: "8px",
      flex: "0 0 8px",
      borderRadius: "50%",
      background: color,
      color,
      boxShadow: "0 0 8px currentColor",
    });
    const name = document.createElement("span");
    name.textContent = displayName(target.name);
    Object.assign(name.style, {
      minWidth: "0",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      fontSize: "var(--obrt-type-body, 12px)",
      fontWeight: "var(--obrt-weight-semibold, 600)",
      letterSpacing: "0",
    });
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
  Object.assign(activeWrap.style, { marginTop: "10px" });
  const activeHeader = document.createElement("div");
  Object.assign(activeHeader.style, {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "10px",
    marginBottom: "6px",
  });
  const activeTitle = caption("EFFETTI ATTIVI");
  activeTitle.style.margin = "0";
  const removeSelectedButton = commandButton("Rimuovi selezionati", "danger");
  const removeAllButton = commandButton("Rimuovi Tutto", "danger");
  const activeActions = document.createElement("div");
  Object.assign(activeActions.style, {
    display: "flex",
    alignItems: "center",
    gap: "6px",
  });
  for (const button of [removeSelectedButton, removeAllButton]) {
    Object.assign(button.style, {
      minHeight: "28px",
      padding: "0 9px",
      fontSize: "var(--obrt-type-secondary, 11px)",
      fontWeight: "var(--obrt-weight-semibold, 600)",
    });
  }
  setButtonEnabled(removeAllButton, false);
  activeActions.append(removeSelectedButton, removeAllButton);
  activeHeader.append(activeTitle, activeActions);

  const activeList = document.createElement("div");
  Object.assign(activeList.style, {
    display: "grid",
    gap: "5px",
    maxHeight: "190px",
    overflowY: "auto",
    padding: "6px",
    border: "1px solid rgba(148,163,184,.20)",
    borderRadius: "11px",
    background: "rgba(0,0,0,.20)",
  });
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
    rows = rows.filter((row) => !row.managed);
    if (!rows.length) return;
    const targetIds = selectedTargetIds();
    const changedIds = Array.from(new Set(rows.map((row) => row.targetId)));
    await withItemMetaHistory({
      kind: "condition",
      label: rows.length > 1 ? "Rimossi effetti multipli" : `Rimossa: ${rows[0].name}`,
      itemIds: changedIds,
      fields: ["conditions"],
    }, () => removeConditionInstancesFromItems(
      rows.map((row) => ({ itemId: row.targetId, instanceId: row.id }))
    ));
    await refreshConditionLabels(changedIds);
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
      Object.assign(empty.style, {
        textAlign: "center",
        color: "rgba(255,255,255,.75)",
        fontSize: "var(--obrt-type-body, 12px)",
        padding: "10px",
      });
      activeList.appendChild(empty);
      return;
    }

    for (const row of visibleEffectRows) {
      const key = `${row.targetId}\u0000${row.id}`;
      const line = document.createElement("div");
      Object.assign(line.style, {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        minWidth: "0",
        padding: "6px 8px",
        borderRadius: "9px",
        background: "rgba(255,255,255,.025)",
        border: "1px solid rgba(148,163,184,.14)",
      });

      const selectRow = document.createElement("label");
      Object.assign(selectRow.style, {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        minWidth: "0",
        flex: "1 1 auto",
        cursor: "pointer",
      });
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
      Object.assign(text.style, {
        minWidth: "0",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        fontSize: "var(--obrt-type-body, 12px)",
      });
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

      const removeButton = commandButton("Rimuovi", "danger");
      Object.assign(removeButton.style, {
        flex: "0 0 auto",
        minHeight: "28px",
        padding: "0 8px",
        fontSize: "var(--obrt-type-secondary, 11px)",
      });
      removeButton.addEventListener("click", () => removeRows([row]));
      line.append(selectRow);
      if (!row.managed) line.append(removeButton);
      activeList.appendChild(line);
    }
  };

  const updateTargetSelection = () => {
    const nameQuery = targetNameFilter.value.trim().toLocaleLowerCase("it");
    for (const control of targetControls.values()) {
      const selected = control.checkbox.checked;
      const matchesFaction = activeFactionFilters.size === 0 || activeFactionFilters.has(control.faction);
      const matchesName = !nameQuery || control.name.includes(nameQuery);
      control.row.style.display = matchesFaction && matchesName
        ? "flex"
        : "none";
      control.row.style.background = selected ? "rgba(30,64,175,.24)" : "rgba(255,255,255,.025)";
      control.row.style.borderColor = selected ? "rgba(96,165,250,.62)" : "rgba(148,163,184,.14)";
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
      button.style.background = active ? "rgba(37,99,235,.42)" : "rgba(255,255,255,.055)";
      button.style.borderColor = active ? "rgba(96,165,250,.72)" : "rgba(148,163,184,.28)";
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
    const usesActor = mode === "turn-start" || mode === "turn-end";
    durationInput.disabled = !usesDuration;
    actorButton.disabled = !usesActor;
    durationInput.style.opacity = usesDuration ? "1" : ".45";
    actorButton.style.opacity = usesActor ? "1" : ".45";
    actorButton.style.cursor = usesActor ? "pointer" : "default";
    if (!usesActor) setActorMenuOpen(false);
  };
  expirySelect.addEventListener("change", syncExpiryControls);

  addButton.addEventListener("click", async () => {
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
      expiry.actor = "target";
      if (actorId) {
        expiry.actorId = actorId;
        expiry.actorName = actorName;
      }
    }

    const order = Array.isArray(state?.order) ? state.order : [];
    const activeId = order[state?.current] || null;
    await withItemMetaHistory({
      kind: "condition",
      label: `Applicata: ${effectName}`,
      itemIds: ids,
      fields: ["conditions"],
    }, () => (isCustomEffect ? addCustomForItems : addOrUpdateConditionForItems)(ids, effectName, {
      sourceId,
      sourceName: displayName(source.name),
      appliedAt: {
        round: Math.max(1, Number(state?.round || 1)),
        actorId: activeId,
        phase: "turn",
      },
      expiry,
    }));
    await refreshConditionLabels(ids);
    await render(sourceId, ids);
  });

  panel.append(close, title, grid, targetWrap, activeWrap);
  app.replaceChildren(panel);
  syncExpiryControls();
  syncEffectControls();
  renderActiveRows();
  void refreshEffectsSelectionFromScene();
  effectSelect.focus();
}

OBR.onReady(async () => {
  styleBase();
  mountEffectsSelectionSync();
  const sourceId = new URLSearchParams(window.location.search).get("source") || "";
  await render(sourceId);
});
