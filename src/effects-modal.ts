import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import {
  CONDITION_LIST,
  formatConditionName,
  formatConditionInstance,
  getConditionInstances,
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

function conditionRows(target: any) {
  const conditions = target?.metadata?.[META_KEY]?.conditions || {};
  return getConditionInstances(conditions).map((instance: any) => ({
    id: String(instance.id || ""),
    targetId: String(target.id || ""),
    targetName: displayName(target.name),
    name: String(instance.condition || ""),
    label: formatConditionInstance(instance),
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
  document.body.style.fontFamily = "system-ui, Roboto, Arial, sans-serif";
  document.body.style.fontSize = "12px";
  document.body.style.lineHeight = "1.2";
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
    border: "1px solid rgba(255,255,255,.15)",
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
    fontSize: "11px",
    fontWeight: "400",
    letterSpacing: "0",
    color: "rgba(255,255,255,.9)",
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
    borderRadius: "32px",
    background: palette.base,
    color: "var(--obrt-text)",
    font: "inherit",
    fontWeight: "400",
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
    textAlign: "center",
    fontSize: "15px",
    fontWeight: "700",
    marginBottom: "12px",
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
    border: "0",
    borderRadius: "32px",
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
  });

  const effectSelect = document.createElement("select");
  for (const name of CONDITION_LIST) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = formatConditionName(name);
    effectSelect.appendChild(option);
  }

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
    border: "1px solid rgba(255,255,255,.15)",
    borderRadius: "10px",
    background: "rgba(31,44,37,.96)",
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
    cell("CONDIZIONE", effectSelect),
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
    marginBottom: "5px",
  });
  const targetTitle = caption("BERSAGLI");
  targetTitle.style.margin = "0";

  const targetActions = document.createElement("div");
  Object.assign(targetActions.style, { display: "flex", gap: "6px" });
  const selectAllButton = commandButton("Tutti");
  const selectNoneButton = commandButton("Nessuno");
  for (const button of [selectAllButton, selectNoneButton]) {
    Object.assign(button.style, { minHeight: "26px", padding: "0 8px", fontSize: "11px" });
  }
  targetActions.append(selectAllButton, selectNoneButton);
  targetHeader.append(targetTitle, targetActions);

  const targetGrid = document.createElement("div");
  targetGrid.dataset.effectsTargetGrid = "1";
  Object.assign(targetGrid.style, {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "6px",
    maxHeight: "150px",
    overflowY: "auto",
    padding: "7px",
    border: "1px solid rgba(255,255,255,.18)",
    borderRadius: "6px",
    background: "rgba(0,0,0,.28)",
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
  const targetControls = new Map<string, { checkbox: HTMLInputElement; row: HTMLLabelElement }>();

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
      border: "1px solid rgba(255,255,255,.10)",
      borderRadius: "10px",
      cursor: "pointer",
    });
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = initialIds.has(target.id);
    checkbox.value = target.id;
    checkbox.style.accentColor = "#2563eb";
    const name = document.createElement("span");
    name.textContent = displayName(target.name);
    Object.assign(name.style, {
      minWidth: "0",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      fontSize: "12px",
    });
    row.append(checkbox, name);
    targetGrid.appendChild(row);
    targetControls.set(target.id, { checkbox, row });
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
      fontSize: "11px",
    });
  }
  setButtonEnabled(removeAllButton, false);
  activeActions.append(removeSelectedButton, removeAllButton);
  activeHeader.append(activeTitle, activeActions);

  const activeList = document.createElement("div");
  Object.assign(activeList.style, {
    display: "grid",
    gap: "6px",
    maxHeight: "190px",
    overflowY: "auto",
  });
  activeWrap.append(activeHeader, activeList);

  const selectedEffectRows = new Set<string>();
  let visibleEffectRows: ReturnType<typeof conditionRows> = [];

  const selectedTargetIds = () => Array.from(targetControls.entries())
    .filter(([, control]) => control.checkbox.checked)
    .map(([id]) => id);

  const updateRemoveSelectedButton = () => {
    setButtonEnabled(removeSelectedButton, selectedEffectRows.size > 0);
  };

  const removeRows = async (rows: ReturnType<typeof conditionRows>) => {
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
    setButtonEnabled(removeAllButton, visibleEffectRows.length > 0);

    if (!visibleEffectRows.length) {
      const empty = document.createElement("div");
      empty.textContent = "Nessun effetto attivo.";
      Object.assign(empty.style, {
        textAlign: "center",
        color: "rgba(255,255,255,.75)",
        fontSize: "12px",
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
        borderRadius: "10px",
        background: "var(--obrt-hover)",
        border: "1px solid rgba(255,255,255,.10)",
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
        fontSize: "12px",
      });
      const targetBadge = document.createElement("strong");
      targetBadge.textContent = row.targetName;
      targetBadge.style.marginRight = "7px";
      const effectText = document.createTextNode(row.label);
      text.append(targetBadge, effectText);
      selectRow.append(checkbox, text);

      const removeButton = commandButton("Rimuovi", "danger");
      Object.assign(removeButton.style, {
        flex: "0 0 auto",
        minHeight: "28px",
        padding: "0 8px",
        fontSize: "11px",
      });
      removeButton.addEventListener("click", () => removeRows([row]));
      line.append(selectRow, removeButton);
      activeList.appendChild(line);
    }
  };

  const updateTargetSelection = () => {
    for (const control of targetControls.values()) {
      const selected = control.checkbox.checked;
      control.row.style.background = selected ? "rgba(37,99,235,.30)" : "var(--obrt-hover)";
      control.row.style.borderColor = selected ? "rgba(96,165,250,.65)" : "rgba(255,255,255,.10)";
    }
    setButtonEnabled(addButton, selectedTargetIds().length > 0);
  };

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
  selectAllButton.addEventListener("click", () => {
    for (const control of targetControls.values()) control.checkbox.checked = true;
    updateTargetSelection();
    void updateSceneTargetSelection([...targetControls.keys()], true, true);
  });
  selectNoneButton.addEventListener("click", () => {
    for (const control of targetControls.values()) control.checkbox.checked = false;
    updateTargetSelection();
    void updateSceneTargetSelection([...targetControls.keys()], false);
  });
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
      label: `Applicata: ${effectSelect.value}`,
      itemIds: ids,
      fields: ["conditions"],
    }, () => addOrUpdateConditionForItems(ids, effectSelect.value, {
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
  updateTargetSelection();
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