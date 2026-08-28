import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import {
  CUSTOM_AURAS_FIELD,
  DEFAULT_CUSTOM_AURA_STYLE,
  createCustomAuraChildId,
  normalizeCustomAuras,
} from "./customAuraCore.js";
import {
  applyPresetToCustomAura,
  appendPresetToCustomAuraList,
  createPresetFromAura,
  detachCustomAuraPreset,
  duplicatePreset,
  updatePresetDefinition,
} from "./customAuraPresetCore.js";
import { getCustomAuraPresetStore } from "./customAuraPresetStore.js";
import { createSceneLifecycleAdapter } from "./sceneLifecycle.js";

const META_KEY = `${ID}/meta`;
const MODAL_ID = `${ID}/custom-aura-modal`;
const tokenIds = [...new Set(
  new URLSearchParams(window.location.search)
    .getAll("tokenId")
    .map((value) => String(value || "").trim())
    .filter(Boolean),
)];
const list = document.querySelector("#list");
const status = document.querySelector("#status");
const tokenName = document.querySelector("#token-name");
const modalTitle = document.querySelector("#modal-title");
const saveButton = document.querySelector("#save");
const presetsButton = document.querySelector("#presets-btn");
const addButton = document.querySelector("#add");
const cancelBtn = document.querySelector("#cancel-btn");
const closeBtn = document.querySelector("#close");
const sceneLifecycle = createSceneLifecycleAdapter({ obr: OBR });
const presetStore = getCustomAuraPresetStore();

let tokens = [];
let auras = [];
let saving = false;
let closeTimer = null;
let statusTimer = null;
let presetDialogTargetIndex = null; // null = standalone library, number = applying to aura index
let presetViewActive = false;
let renamingPresetId = null;
let editingPresetIndex = null;
let editingAuraIndex = null;
let editingAuraIsNew = false;
let quickApplyPresetId = null;
let initialDraftSnapshot = null;
const expandedPills = new Set();
const expandedReminders = new Set();
const quickApplyMode = new URLSearchParams(window.location.search).get("mode") === "apply-preset";

function setStatus(message, { isError = false, timeout = 2500 } = {}) {
  if (statusTimer) {
    window.clearTimeout(statusTimer);
    statusTimer = null;
  }
  if (!status) return;
  if (isError) status.classList.add("error");
  else status.classList.remove("error");
  status.textContent = message || "";
  if (timeout > 0 && message) {
    statusTimer = window.setTimeout(() => {
      statusTimer = null;
      if (status && status.textContent === message) {
        status.textContent = "";
        status.classList.remove("error");
      }
    }, timeout);
  }
}

function defaultAura() {
  const id = createCustomAuraChildId("aura");
  return {
    id,
    enabled: true,
    name: "Aura personalizzata",
    radiusMeters: 3,
    style: { ...DEFAULT_CUSTOM_AURA_STYLE },
    targeting: { filter: "all", includeSource: false },
    pills: [],
    reminders: [],
  };
}

function escapeAttribute(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function checked(value) {
  return value === true ? " checked" : "";
}

function disabled(value) {
  return value ? " disabled" : "";
}

function option(value, current, label) {
  return `<option value="${value}"${current === value ? " selected" : ""}>${label}</option>`;
}

function formatAuraSummary(aura) {
  const parts = [`${aura.radiusMeters} m`];
  const pillsCount = aura.pills?.length || 0;
  const remsCount = aura.reminders?.length || 0;
  if (pillsCount > 0) parts.push(`${pillsCount} pill`);
  if (remsCount > 0) parts.push(`${remsCount} reminder`);
  if (aura.presetRef?.presetId) {
    const preset = presetStore.getPreset(aura.presetRef.presetId);
    const name = preset?.name || "Preset collegato";
    parts.push(`Preset: ${name}`);
  }
  return parts.join(" · ");
}

function pillTemplate(pill, pillIndex, readOnly = false) {
  const isExpanded = expandedPills.has(pillIndex);
  const title = pill.label || "Nuova pill";
  const kindLabel = pill.kind === "debuff" ? "Penalità" : "Beneficio";
  const kindClass = pill.kind === "debuff" ? "badge-debuff" : "badge-buff";

  return `
    <div class="sub-card${isExpanded ? " is-open" : ""}" data-pill-index="${pillIndex}">
      <div class="sub-card-head" data-toggle-pill="${pillIndex}">
        <label class="toggle toggle-sm" title="Attiva/disattiva pill" onclick="event.stopPropagation()">
          <input type="checkbox" data-field="pills.${pillIndex}.enabled"${checked(pill.enabled)}${disabled(readOnly)}>
          Attiva
        </label>
        <div class="sub-card-summary">
          <span class="sub-card-title">${escapeAttribute(title)}</span>
          <span class="badge ${kindClass}">${kindLabel}</span>
        </div>
        <span class="chevron ${isExpanded ? "open" : ""}">▾</span>
        <button class="button-sm danger" type="button" data-action="delete-pill" style="margin-left:4px;"${disabled(readOnly)}>Rimuovi</button>
      </div>
      ${isExpanded ? `
        <div class="sub-card-body">
          <div class="grid">
            <label class="field">Etichetta
              <input type="text" maxlength="100" data-field="pills.${pillIndex}.label" value="${escapeAttribute(pill.label)}"${disabled(readOnly)}>
            </label>
            <label class="field">Tipo
              <select data-field="pills.${pillIndex}.kind"${disabled(readOnly)}>
                ${option("buff", pill.kind, "Beneficio (Buff)")}
                ${option("debuff", pill.kind, "Penalità (Debuff)")}
              </select>
            </label>
          </div>
          <label class="field">Descrizione
            <textarea maxlength="320" data-field="pills.${pillIndex}.detail"${disabled(readOnly)}>${escapeAttribute(pill.detail)}</textarea>
          </label>
        </div>
      ` : ""}
    </div>
  `;
}

function formatReminderSummary(rem) {
  const eventLabels = {
    "turn-start": "Inizio turno",
    "turn-end": "Fine turno",
    "enter": "Entrata nell'aura",
    "leave": "Uscita dall'aura",
  };
  const eventText = eventLabels[rem.event] || "Inizio turno";
  let resText = "Avviso";
  if (rem.resolution === "manual-save") {
    const abilities = { dex: "Des", con: "Cos", wis: "Sag", str: "For", int: "Int", cha: "Car" };
    const ab = abilities[rem.ability] || "Des";
    const dcText = rem.dcMode === "fixed" ? `CD ${rem.dc ?? 15}` : "CD token";
    const dmg = rem.damage?.dice ? ` · ${rem.damage.dice}${rem.damage?.type ? " " + rem.damage.type : ""}` : "";
    resText = `TS ${ab} ${dcText}${dmg}`;
  } else if (rem.resolution === "manual-damage") {
    const dmg = [rem.damage?.dice, rem.damage?.type].filter(Boolean).join(" ");
    resText = `Danno ${dmg || "diretto"}`;
  }
  return `${eventText} · ${resText}`;
}

function reminderTemplate(rem, remIndex, readOnly = false) {
  const isExpanded = expandedReminders.has(remIndex);
  const isManualSave = rem.resolution === "manual-save";
  const isManualDamage = rem.resolution === "manual-damage";
  const isFixedDC = rem.dcMode === "fixed";
  const damageDice = rem.damage?.dice || "";
  const damageType = rem.damage?.type || "";
  const damageOnSave = rem.damage?.onSave || "half";
  const failCondition = rem.failureCondition?.condition || "";
  const summaryTitle = formatReminderSummary(rem);

  return `
    <div class="sub-card${isExpanded ? " is-open" : ""}" data-rem-index="${remIndex}">
      <div class="sub-card-head" data-toggle-rem="${remIndex}">
        <label class="toggle toggle-sm" title="Attiva/disattiva reminder" onclick="event.stopPropagation()">
          <input type="checkbox" data-field="reminders.${remIndex}.enabled"${checked(rem.enabled)}${disabled(readOnly)}>
          Attivo
        </label>
        <div class="sub-card-summary">
          <span class="sub-card-title">${escapeAttribute(summaryTitle)}</span>
        </div>
        <span class="chevron ${isExpanded ? "open" : ""}">▾</span>
        <button class="button-sm danger" type="button" data-action="delete-reminder" style="margin-left:4px;"${disabled(readOnly)}>Rimuovi</button>
      </div>
      ${isExpanded ? `
        <div class="sub-card-body">
          <div class="grid">
            <label class="field">Evento
              <select data-field="reminders.${remIndex}.event"${disabled(readOnly)}>
                ${option("turn-start", rem.event, "Inizio turno")}
                ${option("turn-end", rem.event, "Fine turno")}
                ${option("enter", rem.event, "Entrata nell'aura")}
                ${option("leave", rem.event, "Uscita dall'aura")}
              </select>
            </label>
            <label class="field">Tipo
              <select data-field="reminders.${remIndex}.resolution" data-rerender="true"${disabled(readOnly)}>
                ${option("informational", rem.resolution, "Avviso informativo")}
                ${option("manual-save", rem.resolution, "Tiro salvezza (TS)")}
                ${option("manual-damage", rem.resolution, "Danno diretto (senza TS)")}
              </select>
            </label>
          </div>
          <label class="field">Messaggio
            <input type="text" maxlength="240" data-field="reminders.${remIndex}.label" value="${escapeAttribute(rem.label)}"${disabled(readOnly)}>
          </label>
          ${isManualSave ? `
            <div class="grid three">
              <label class="field">Caratteristica TS
                <select data-field="reminders.${remIndex}.ability"${disabled(readOnly)}>
                  ${option("dex", rem.ability, "Destrezza")}
                  ${option("con", rem.ability, "Costituzione")}
                  ${option("wis", rem.ability, "Saggezza")}
                  ${option("str", rem.ability, "Forza")}
                  ${option("int", rem.ability, "Intelligenza")}
                  ${option("cha", rem.ability, "Carisma")}
                </select>
              </label>
              <label class="field">Modalità CD
                <select data-field="reminders.${remIndex}.dcMode" data-rerender="true"${disabled(readOnly)}>
                  ${option("caster", rem.dcMode, "CD incantesimi del token")}
                  ${option("fixed", rem.dcMode, "CD fissa")}
                </select>
              </label>
              ${isFixedDC ? `
                <label class="field">Valore CD
                  <input type="number" min="1" max="99" data-field="reminders.${remIndex}.dc" value="${escapeAttribute(rem.dc ?? 15)}"${disabled(readOnly)}>
                </label>
              ` : `<div></div>`}
            </div>
            <div class="grid three">
              <label class="field">Formula danno (es. 2d6)
                <input type="text" maxlength="40" data-field="reminders.${remIndex}.damage.dice" value="${escapeAttribute(damageDice)}" placeholder="opzionale"${disabled(readOnly)}>
              </label>
              <label class="field">Tipo danno
                <input type="text" maxlength="40" data-field="reminders.${remIndex}.damage.type" value="${escapeAttribute(damageType)}" placeholder="es. fuoco"${disabled(readOnly)}>
              </label>
              <label class="field">Danno su TS superato
                <select data-field="reminders.${remIndex}.damage.onSave"${disabled(readOnly)}>
                  ${option("half", damageOnSave, "Metà danno")}
                  ${option("zero", damageOnSave, "Nessun danno")}
                </select>
              </label>
            </div>
            <label class="field">Condizione su fallimento TS (opzionale)
              <input type="text" maxlength="100" data-field="reminders.${remIndex}.failureCondition.condition" value="${escapeAttribute(failCondition)}" placeholder="es. Prono"${disabled(readOnly)}>
            </label>
          ` : ""}
          ${isManualDamage ? `
            <div class="grid">
              <label class="field">Formula danno (es. 2d8)
                <input type="text" maxlength="40" data-field="reminders.${remIndex}.damage.dice" value="${escapeAttribute(damageDice)}"${disabled(readOnly)}>
              </label>
              <label class="field">Tipo danno
                <input type="text" maxlength="40" data-field="reminders.${remIndex}.damage.type" value="${escapeAttribute(damageType)}" placeholder="es. radioso"${disabled(readOnly)}>
              </label>
            </div>
          ` : ""}
        </div>
      ` : ""}
    </div>
  `;
}

function auraSummaryTemplate(aura, index) {
  const isDraft = editingAuraIsNew && editingAuraIndex === index;
  const detailOpen = Number.isInteger(editingAuraIndex);
  const quickDisabled = isDraft || detailOpen;
  const summaryMeta = formatAuraSummary(aura);

  return `
    <article class="aura-summary-card${!aura.enabled ? " is-disabled" : ""}${isDraft ? " draft" : ""}" data-index="${index}" data-existing-summary>
      <div class="aura-summary-main">
        <div class="aura-summary-title-row">
          <span class="aura-summary-name">${escapeAttribute(aura.name)}</span>
          <input type="hidden" data-existing-rename value="${escapeAttribute(aura.name)}">
        </div>
        <div class="aura-summary-meta">
          ${escapeAttribute(summaryMeta)}
        </div>
      </div>
      <div class="aura-summary-actions">
        <label class="toggle" title="Attiva/disattiva questa aura">
          <input type="checkbox" data-existing-toggle${checked(aura.enabled)}${disabled(quickDisabled)}>
          Attiva
        </label>
        <button type="button" class="button-sm primary" data-action="edit-details" data-index="${index}"${disabled(quickDisabled)}>Modifica</button>
        <button type="button" class="button-sm danger" data-action="delete-existing" data-index="${index}"${disabled(quickDisabled)}>Elimina</button>
      </div>
    </article>
  `;
}

function auraTemplate(aura, index, { isNew = false } = {}) {
  const pills = Array.isArray(aura.pills) ? aura.pills : [];
  const reminders = Array.isArray(aura.reminders) ? aura.reminders : [];
  const isLinked = !!aura.presetRef?.presetId;
  const isEditingPreset = editingPresetIndex === index;
  const readOnly = isLinked && !isEditingPreset;
  const canEditName = isNew || isEditingPreset;
  const linkedPreset = isLinked ? presetStore.getPreset(aura.presetRef.presetId) : null;
  const presetName = linkedPreset?.name || (isLinked ? "Preset collegato" : "");

  return `
    <section class="aura-card aura-detail-card" data-index="${index}">
      <div class="aura-editor-head">
        <label class="field">Nome aura
          <input class="name" type="text" maxlength="100" data-field="name" value="${escapeAttribute(aura.name)}" aria-label="Nome aura"${disabled(readOnly)}>
        </label>
        <label class="toggle toggle-editor">
          <input type="checkbox" data-field="enabled"${checked(aura.enabled)}>
          Attiva
        </label>
      </div>

      ${isLinked ? `
        <div class="preset-banner">
          <div class="preset-banner-info">
            <span class="preset-badge">Preset: ${escapeAttribute(presetName)}</span>
            ${isEditingPreset ? '<span class="preset-editing-tag">Modifica preset globale</span>' : ""}
          </div>
          <div class="preset-banner-actions">
            ${isEditingPreset
              ? '<button type="button" class="button-sm" data-action="cancel-preset-edit">Annulla modifica preset</button>'
              : '<button type="button" class="button-sm" data-action="update-preset">Modifica preset</button>'}
            <button type="button" class="button-sm" data-action="detach-preset">Scollega</button>
          </div>
        </div>
      ` : `
        <div class="preset-action-row">
          <button type="button" class="preset-link-action" data-action="save-as-preset">Salva come preset…</button>
        </div>
      `}

      <div class="section">
        <div class="section-title">Dimensione e bersagli</div>
        <div class="grid-radius-targeting">
          <label class="field">Raggio in metri
            <input type="number" min="0" max="300" step="1.5" data-field="radiusMeters" value="${escapeAttribute(aura.radiusMeters)}"${disabled(readOnly)}>
          </label>
          <div class="targeting-group">
            <label class="field">Token interessati
              <select data-field="targeting.filter"${disabled(readOnly)}>
                ${option("all", aura.targeting?.filter, "Tutti")}
                ${option("friendly", aura.targeting?.filter, "Alleati")}
                ${option("hostile", aura.targeting?.filter, "Ostili")}
              </select>
            </label>
            <label class="inline targeting-include-source"><input type="checkbox" data-field="targeting.includeSource"${checked(aura.targeting?.includeSource)}${disabled(readOnly)}> Includi anche il token sorgente</label>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Aspetto sulla mappa</div>
        <div class="style-compact-grid">
          <div class="style-composite-row">
            <label class="field style-color-field">Riempimento
              <input type="color" data-field="style.fillColor" value="${escapeAttribute(aura.style?.fillColor)}"${disabled(readOnly)}>
            </label>
            <label class="field style-slider-field">Opacità
              <input type="range" min="0.05" max="0.45" step="0.01" data-field="style.fillOpacity" value="${escapeAttribute(aura.style?.fillOpacity)}"${disabled(readOnly)}>
            </label>
          </div>
          <div class="style-composite-row">
            <label class="field style-color-field">Bordo
              <input type="color" data-field="style.strokeColor" value="${escapeAttribute(aura.style?.strokeColor)}"${disabled(readOnly)}>
            </label>
            <label class="field style-slider-field">Spessore
              <input type="range" min="0.4" max="3" step="0.1" data-field="style.strokeWidth" value="${escapeAttribute(aura.style?.strokeWidth)}"${disabled(readOnly)}>
            </label>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="section-header">
          <div class="section-title">Pill (${pills.length})</div>
          <button type="button" class="button-sm" data-action="add-pill"${disabled(readOnly)}>+ Aggiungi pill</button>
        </div>
        ${!pills.length
          ? '<div class="sub-empty">Nessuna pill configurata.</div>'
          : `<div class="sub-list">${pills.map((pill, pIdx) => pillTemplate(pill, pIdx, readOnly)).join("")}</div>`}
      </div>

      <div class="section">
        <div class="section-header">
          <div class="section-title">Reminder (${reminders.length})</div>
          <button type="button" class="button-sm" data-action="add-reminder"${disabled(readOnly)}>+ Aggiungi reminder</button>
        </div>
        ${!reminders.length
          ? '<div class="sub-empty">Nessun reminder configurato.</div>'
          : `<div class="sub-list">${reminders.map((rem, rIdx) => reminderTemplate(rem, rIdx, readOnly)).join("")}</div>`}
      </div>
    </section>
  `;
}

function formatPresetSummary(preset) {
  const def = preset.definition || {};
  const parts = [`${def.radiusMeters || 3} m`];
  const pillsCount = def.pills?.length || 0;
  const remsCount = def.reminders?.length || 0;
  if (pillsCount > 0) parts.push(`${pillsCount} pill`);
  if (remsCount > 0) parts.push(`${remsCount} reminder`);
  return parts.join(" · ");
}

function renderPresetDialog() {
  presetViewActive = true;
  const presets = presetStore.getActivePresets();
  list.innerHTML = `
    <div class="preset-dialog">
      ${!presets.length
        ? `<div class="empty-state">
            <p class="empty-text">Nessun preset salvato.</p>
            <p class="empty-hint">Salva un’aura come preset dall’editor per riutilizzarla rapidamente su qualsiasi token.</p>
          </div>`
        : presets.map((preset) => {
            if (renamingPresetId === preset.id) {
              return `
                <div class="preset-item" data-preset-id="${escapeAttribute(preset.id)}">
                  <div class="preset-rename-box">
                    <input type="text" class="name preset-rename-input" data-preset-rename-id="${escapeAttribute(preset.id)}" value="${escapeAttribute(preset.name)}" maxlength="100" autofocus>
                    <button type="button" class="button-sm primary" data-preset-action="save-rename" data-preset-id="${escapeAttribute(preset.id)}">Salva</button>
                    <button type="button" class="button-sm" data-preset-action="cancel-rename">Annulla</button>
                  </div>
                </div>
              `;
            }
            return `
              <div class="preset-item" data-preset-id="${escapeAttribute(preset.id)}">
                <div class="preset-item-info">
                  <div class="preset-item-name">${escapeAttribute(preset.name)}</div>
                  <div class="preset-item-meta">${escapeAttribute(formatPresetSummary(preset))}</div>
                </div>
                <div class="preset-item-actions">
                  <button type="button" class="button-sm primary" data-preset-action="apply" data-preset-id="${escapeAttribute(preset.id)}">${quickApplyMode ? "Applica" : "Usa"}</button>
                  <button type="button" class="button-sm" data-preset-action="start-rename" data-preset-id="${escapeAttribute(preset.id)}">Rinomina</button>
                  <button type="button" class="button-sm" data-preset-action="duplicate" data-preset-id="${escapeAttribute(preset.id)}">Duplica</button>
                  <button type="button" class="button-sm danger" data-preset-action="delete" data-preset-id="${escapeAttribute(preset.id)}">Elimina</button>
                </div>
              </div>
            `;
          }).join("")}
    </div>
  `;
  updateSaveState();
}

function closePresetDialog() {
  presetDialogTargetIndex = undefined;
  presetViewActive = false;
  renamingPresetId = null;
  render();
}

function render() {
  if (presetViewActive || quickApplyMode) {
    renderPresetDialog();
    return;
  }

  const isEditing = Number.isInteger(editingAuraIndex) && auras[editingAuraIndex];
  if (isEditing) {
    list.innerHTML = auraTemplate(auras[editingAuraIndex], editingAuraIndex, { isNew: editingAuraIsNew });
    updateSaveState();
    return;
  }

  if (!auras.length) {
    list.innerHTML = `
      <div class="empty-state">
        <p class="empty-text">Nessuna aura configurata per questo token.</p>
        <div class="empty-actions">
          <button type="button" class="button primary" data-action="create-aura">+ Nuova aura</button>
          <button type="button" class="button" data-action="open-presets">Libreria preset</button>
        </div>
      </div>
    `;
  } else {
    list.innerHTML = `
      <div class="aura-list">
        ${auras.map((aura, index) => auraSummaryTemplate(aura, index)).join("")}
      </div>
    `;
  }
  updateSaveState();
}

function updateTokenSummary() {
  const primaryToken = tokens[0];
  if (!tokenName) return;
  if (!primaryToken) {
    tokenName.textContent = "Nessun token selezionato";
    return;
  }
  tokenName.textContent = tokens.length === 1
    ? primaryToken.name || "Token"
    : `${tokens.length} token selezionati`;
}

function updateSaveState() {
  const hasDetailDraft = Number.isInteger(editingAuraIndex);
  const isPresetView = presetViewActive || quickApplyMode;

  if (modalTitle) {
    if (isPresetView) {
      modalTitle.textContent = quickApplyMode ? "Applica preset aura" : "Libreria preset";
    } else if (hasDetailDraft) {
      modalTitle.textContent = editingAuraIsNew ? "Nuova aura" : "Modifica aura";
    } else {
      modalTitle.textContent = "Aure personalizzate";
    }
  }

  if (tokenName) {
    if (isPresetView && !quickApplyMode) {
      tokenName.textContent = "Preset globali";
    } else if (hasDetailDraft) {
      tokenName.textContent = auras[editingAuraIndex]?.name || "Aura personalizzata";
    } else {
      const primaryToken = tokens[0];
      tokenName.textContent = !primaryToken
        ? "Nessun token selezionato"
        : tokens.length === 1
          ? primaryToken.name || "Token"
          : `${tokens.length} token selezionati`;
    }
  }

  if (saveButton) {
    saveButton.hidden = !hasDetailDraft;
    saveButton.disabled = saving || !tokens.length || !sceneLifecycle.isReady() || !hasDetailDraft;
  }
  if (cancelBtn) {
    cancelBtn.hidden = !hasDetailDraft;
    cancelBtn.disabled = saving;
  }
  if (presetsButton) {
    presetsButton.hidden = hasDetailDraft || isPresetView;
    presetsButton.disabled = saving;
  }
  if (addButton) {
    addButton.hidden = hasDetailDraft || isPresetView;
    addButton.disabled = saving;
  }
}

async function persistExistingAuraChange(index, mutate, successMessage) {
  if (saving || Number.isInteger(editingAuraIndex) || tokens.length !== 1) return;
  const auraId = String(auras[index]?.id || "").trim();
  if (!auraId || !tokens.length || !sceneLifecycle.isReady()) return;
  const operation = sceneLifecycle.capture({
    operationId: `custom-aura-existing:${Date.now().toString(36)}`,
  });
  if (!sceneLifecycle.isCurrent(operation)) return;

  saving = true;
  updateSaveState();
  setStatus("Salvataggio…", { timeout: 0 });
  try {
    await OBR.scene.items.updateItems([tokens[0].id], (drafts) => {
      for (const draft of drafts) {
        if (!draft) continue;
        const meta = { ...(draft.metadata?.[META_KEY] || {}) };
        const current = normalizeCustomAuras(meta[CUSTOM_AURAS_FIELD]);
        const currentIndex = current.findIndex((entry) => entry.id === auraId);
        if (currentIndex < 0) continue;
        const nextAura = mutate(current[currentIndex], draft);
        if (nextAura === null) current.splice(currentIndex, 1);
        else current[currentIndex] = nextAura;
        if (current.length) meta[CUSTOM_AURAS_FIELD] = current;
        else delete meta[CUSTOM_AURAS_FIELD];
        draft.metadata = { ...(draft.metadata || {}), [META_KEY]: meta };
      }
    });
    if (!sceneLifecycle.isCurrent(operation)) return;
    await loadTokensFromScene();
    if (!sceneLifecycle.isCurrent(operation)) return;
    refreshAurasFromPrimaryToken();
    render();
    if (successMessage) setStatus(successMessage, { timeout: 2200 });
  } catch (error) {
    if (!sceneLifecycle.isCurrent(operation)) {
      setStatus("Scena cambiata: riapri l’editor delle aure.", { isError: true, timeout: 3500 });
      return;
    }
    setStatus(`Errore: ${String(error?.message || error)}`, { isError: true, timeout: 4000 });
  } finally {
    saving = false;
    updateSaveState();
  }
}

function existingAuraIndexFromElement(element) {
  const index = Number(element?.closest("[data-existing-summary]")?.dataset.index);
  return Number.isInteger(index) ? index : -1;
}

function handleExistingAuraToggle(input) {
  const index = existingAuraIndexFromElement(input);
  if (index < 0) return;
  void persistExistingAuraChange(
    index,
    (aura) => ({ ...aura, enabled: input.checked }),
    input.checked ? "Aura attivata" : "Aura disattivata",
  );
}

function handleExistingAuraRename(input) {
  const index = existingAuraIndexFromElement(input);
  if (index < 0) return;
  const name = String(input.value || "").trim();
  if (!name) {
    setStatus("Il nome dell’aura non può essere vuoto.", { isError: true, timeout: 3000 });
    render();
    return;
  }
  void persistExistingAuraChange(
    index,
    (aura) => ({ ...aura, name }),
    `Aura rinominata in “${name}”`,
  );
}

function setAtPath(target, path, value) {
  const keys = String(path || "").split(".").filter(Boolean);
  let cursor = target;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    const nextKey = keys[i + 1];
    if (cursor[key] === undefined || cursor[key] === null) {
      cursor[key] = /^\d+$/.test(nextKey) ? [] : {};
    }
    cursor = cursor[key];
  }
  if (keys.length) cursor[keys.at(-1)] = value;
}

function inputValue(input) {
  if (input.type === "checkbox") return input.checked;
  if (input.type === "number" || input.type === "range") {
    return input.value === "" ? "" : Number(input.value);
  }
  return input.value;
}

function updateFromInput(input) {
  if (!sceneLifecycle.isReady()) return;
  const card = input.closest("[data-index]");
  const index = Number(card?.dataset.index);
  if (!Number.isInteger(index) || !auras[index] || !input.dataset.field) return;
  if (
    auras[index].presetRef?.presetId
    && editingPresetIndex !== index
    && input.dataset.field !== "enabled"
  ) return;
  setAtPath(auras[index], input.dataset.field, inputValue(input));
  if (input.dataset.rerender === "true") {
    render();
  }
}

function isDraftDirty() {
  if (!Number.isInteger(editingAuraIndex) || !auras[editingAuraIndex]) return false;
  if (!initialDraftSnapshot) return false;
  return JSON.stringify(auras[editingAuraIndex]) !== initialDraftSnapshot;
}

function detailDraftActive() {
  return Number.isInteger(editingAuraIndex);
}

function blockSecondWorkflow() {
  if (!detailDraftActive()) return false;
  setStatus("Salva o annulla la bozza corrente prima di aprire un altro flusso.", { isError: true, timeout: 3000 });
  return true;
}

async function closeModal({ discard = false } = {}) {
  if (!discard && isDraftDirty() && !saving && !window.confirm("La bozza non salvata verrà scartata. Continuare?")) {
    return;
  }
  if (presetViewActive && !quickApplyMode) {
    closePresetDialog();
    return;
  }
  await OBR.popover.close(MODAL_ID).catch(() => {});
}

async function loadTokensFromScene() {
  if (!sceneLifecycle.isReady() || !tokenIds.length) return;
  const requestedIds = new Set(tokenIds);
  const items = await OBR.scene.items.getItems((item) => requestedIds.has(item.id));
  tokens = tokenIds
    .map((id) => items.find((item) => item.id === id))
    .filter(Boolean);
  updateTokenSummary();
  updateSaveState();
}

function refreshAurasFromPrimaryToken() {
  auras = normalizeCustomAuras(
    tokens[0]?.metadata?.[META_KEY]?.[CUSTOM_AURAS_FIELD],
  );
}

async function cancelDetailEditor() {
  if (isDraftDirty() && !window.confirm("Le modifiche non salvate verranno scartate. Continuare?")) {
    return;
  }
  if (editingAuraIsNew && Number.isInteger(editingAuraIndex)) {
    auras.splice(editingAuraIndex, 1);
  }
  editingAuraIndex = null;
  editingAuraIsNew = false;
  editingPresetIndex = null;
  initialDraftSnapshot = null;
  expandedPills.clear();
  expandedReminders.clear();
  await loadTokensFromScene();
  refreshAurasFromPrimaryToken();
  render();
  setStatus("Modifiche annullate.", { timeout: 2000 });
}

async function closeDetailEditor() {
  await cancelDetailEditor();
}

async function quickApplyPresetToTokens(preset) {
  if (saving || !sceneLifecycle.isReady() || !tokens.length) return;
  const operation = sceneLifecycle.capture({ operationId: `custom-aura-quick-apply:${Date.now().toString(36)}` });
  if (!sceneLifecycle.isCurrent(operation)) return;

  saving = true;
  updateSaveState();
  setStatus("Applicazione preset…", { timeout: 0 });
  try {
    await OBR.scene.items.updateItems(tokens.map((item) => item.id), (drafts) => {
      for (const draft of drafts) {
        if (!draft) continue;
        const meta = { ...(draft.metadata?.[META_KEY] || {}) };
        const current = normalizeCustomAuras(meta[CUSTOM_AURAS_FIELD]);
        meta[CUSTOM_AURAS_FIELD] = appendPresetToCustomAuraList(current, preset);
        draft.metadata = { ...(draft.metadata || {}), [META_KEY]: meta };
      }
    });
    if (!sceneLifecycle.isCurrent(operation)) return;
    setStatus(`Preset "${preset.name}" applicato.`, { timeout: 2000 });
    if (closeTimer) window.clearTimeout(closeTimer);
    closeTimer = window.setTimeout(() => {
      closeTimer = null;
      if (sceneLifecycle.isCurrent(operation)) void closeModal({ discard: true });
    }, 220);
  } catch (error) {
    if (!sceneLifecycle.isCurrent(operation)) return;
    setStatus(`Errore: ${String(error?.message || error)}`, { isError: true, timeout: 3500 });
  } finally {
    saving = false;
    updateSaveState();
  }
}

async function save() {
  if (!Number.isInteger(editingAuraIndex)) return;
  const operation = sceneLifecycle.capture({ operationId: `custom-aura-save:${Date.now().toString(36)}` });
  if (!sceneLifecycle.isCurrent(operation)) return;
  try {
    await loadTokensFromScene();
    if (!sceneLifecycle.isCurrent(operation)) return;
  } catch (error) {
    setStatus(`Errore: ${String(error?.message || error)}`, { isError: true, timeout: 3500 });
    return;
  }
  if (!tokens.length) {
    setStatus("Token non disponibili sulla battlemap", { isError: true, timeout: 3000 });
    return;
  }
  if (!quickApplyMode && tokens.length !== 1) {
    setStatus("L’editor dettagliato richiede un solo token.", { isError: true, timeout: 3000 });
    return;
  }
  saving = true;
  updateSaveState();
  setStatus("Salvataggio in corso…", { timeout: 0 });
  try {
    let normalized = normalizeCustomAuras(auras);
    if (!sceneLifecycle.isCurrent(operation)) {
      saving = false;
      updateSaveState();
      return;
    }
    if (quickApplyPresetId) {
      const preset = presetStore.getPreset(quickApplyPresetId);
      if (!preset || preset.deleted) {
        setStatus("Preset non disponibile: nessuna istanza è stata modificata.", { isError: true, timeout: 3500 });
        saving = false;
        updateSaveState();
        return;
      }
      await OBR.scene.items.updateItems(tokens.map((item) => item.id), (drafts) => {
        for (const draft of drafts) {
          if (!draft) continue;
          const meta = { ...(draft.metadata?.[META_KEY] || {}) };
          const current = normalizeCustomAuras(meta[CUSTOM_AURAS_FIELD]);
          meta[CUSTOM_AURAS_FIELD] = appendPresetToCustomAuraList(current, preset);
          draft.metadata = { ...(draft.metadata || {}), [META_KEY]: meta };
        }
      });
      const [primaryAfterApply] = await OBR.scene.items.getItems([tokens[0].id]);
      normalized = normalizeCustomAuras(
        primaryAfterApply?.metadata?.[META_KEY]?.[CUSTOM_AURAS_FIELD],
      );
      quickApplyPresetId = null;
    } else {
      if (Number.isInteger(editingPresetIndex)) {
        const editedAura = normalized[editingPresetIndex];
        const existingPreset = presetStore.getPreset(editedAura?.presetRef?.presetId);
        if (!existingPreset || existingPreset.deleted) {
          setStatus("Preset collegato non trovato: l’istanza resta invariata.", { isError: true, timeout: 3500 });
          saving = false;
          updateSaveState();
          return;
        }
        const updatedPreset = updatePresetDefinition(existingPreset, {
          name: editedAura.name,
          definition: editedAura,
        });
        const savedPreset = presetStore.savePreset(updatedPreset);
        normalized[editingPresetIndex] = applyPresetToCustomAura(savedPreset, {
          existingAura: editedAura,
        });
        editingPresetIndex = null;
      }
      await OBR.scene.items.updateItems([tokens[0].id], (drafts) => {
        for (const draft of drafts) {
          if (!draft) continue;
          const meta = { ...(draft.metadata?.[META_KEY] || {}) };
          if (normalized.length) meta[CUSTOM_AURAS_FIELD] = normalized;
          else delete meta[CUSTOM_AURAS_FIELD];
          draft.metadata = { ...(draft.metadata || {}), [META_KEY]: meta };
        }
      });
    }
    if (!sceneLifecycle.isCurrent(operation)) {
      setStatus("Scena cambiata: riapri l’editor delle aure.", { isError: true, timeout: 3500 });
      saving = false;
      updateSaveState();
      return;
    }
    auras = normalized;
    editingAuraIndex = null;
    editingAuraIsNew = false;
    editingPresetIndex = null;
    initialDraftSnapshot = null;
    expandedPills.clear();
    expandedReminders.clear();
    saving = false;
    render();
    updateSaveState();
    setStatus(quickApplyMode ? "Preset applicato" : "Aura salvata.", { timeout: 2000 });
  } catch (error) {
    if (!sceneLifecycle.isCurrent(operation)) {
      setStatus("Scena cambiata: riapri l’editor delle aure.", { isError: true, timeout: 3500 });
      saving = false;
      updateSaveState();
      return;
    }
    setStatus(`Errore: ${String(error?.message || error)}`, { isError: true, timeout: 3500 });
    saving = false;
    updateSaveState();
  }
}

list.addEventListener("input", (event) => updateFromInput(event.target));
list.addEventListener("change", (event) => {
  const target = event.target;
  if (target.matches("[data-existing-toggle]")) {
    handleExistingAuraToggle(target);
    return;
  }
  if (target.matches("[data-existing-rename]")) {
    handleExistingAuraRename(target);
    return;
  }
  updateFromInput(target);
});
list.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && event.target.matches("[data-preset-rename-id]")) {
    event.preventDefault();
    const presetId = event.target.dataset.presetRenameId;
    const preset = presetStore.getPreset(presetId);
    const newName = String(event.target.value || "").trim();
    if (preset && newName) {
      const updated = updatePresetDefinition(preset, { name: newName });
      presetStore.savePreset(updated);
      renamingPresetId = null;
      renderPresetDialog();
      setStatus(`Preset rinominato in "${newName}".`, { timeout: 2000 });
    }
    return;
  }
  if (event.key === "Escape" && renamingPresetId) {
    renamingPresetId = null;
    renderPresetDialog();
    return;
  }
  if (event.key === "Enter" && event.target.matches("[data-existing-rename]")) {
    event.preventDefault();
    event.target.blur();
  }
});
list.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  const togglePillEl = button ? null : event.target.closest("[data-toggle-pill]");
  if (togglePillEl) {
    const pIdx = Number(togglePillEl.dataset.togglePill);
    if (Number.isInteger(pIdx)) {
      if (expandedPills.has(pIdx)) expandedPills.delete(pIdx);
      else expandedPills.add(pIdx);
      render();
      return;
    }
  }

  const toggleRemEl = button ? null : event.target.closest("[data-toggle-rem]");
  if (toggleRemEl) {
    const rIdx = Number(toggleRemEl.dataset.toggleRem);
    if (Number.isInteger(rIdx)) {
      if (expandedReminders.has(rIdx)) expandedReminders.delete(rIdx);
      else expandedReminders.add(rIdx);
      render();
      return;
    }
  }

  const emptyActionBtn = event.target.closest("[data-action]");
  if (emptyActionBtn) {
    const emptyAction = emptyActionBtn.dataset.action;
    if (emptyAction === "create-aura") {
      if (blockSecondWorkflow()) return;
      const aura = defaultAura();
      auras.push(aura);
      editingAuraIndex = auras.length - 1;
      editingAuraIsNew = true;
      editingPresetIndex = null;
      initialDraftSnapshot = JSON.stringify(aura);
      expandedPills.clear();
      expandedReminders.clear();
      render();
      return;
    }
    if (emptyAction === "open-presets") {
      if (blockSecondWorkflow()) return;
      presetDialogTargetIndex = null;
      renderPresetDialog();
      return;
    }
  }

  if (!button) return;
  const card = button.closest("[data-index]");
  const index = Number(card?.dataset.index);
  if (!Number.isInteger(index) || !auras[index]) return;
  const action = button.dataset.action;

  if (action === "edit-details") {
    editingAuraIndex = index;
    editingAuraIsNew = false;
    editingPresetIndex = auras[index].presetRef?.presetId ? index : null;
    initialDraftSnapshot = JSON.stringify(auras[index]);
    expandedPills.clear();
    expandedReminders.clear();
    render();
    return;
  }
  if (action === "close-details") {
    void cancelDetailEditor();
    return;
  }
  if (action === "delete-existing") {
    if (!window.confirm(`Eliminare l’aura “${auras[index].name}”?`)) return;
    void persistExistingAuraChange(
      index,
      () => null,
      `Aura “${auras[index].name}” eliminata`,
    );
    return;
  }
  if (action === "cancel-new") {
    void cancelDetailEditor();
    return;
  }
  if (action === "delete") {
    if (editingPresetIndex === index) editingPresetIndex = null;
    auras.splice(index, 1);
    render();
    return;
  }
  if (action === "add-pill") {
    if (auras[index].presetRef?.presetId && editingPresetIndex !== index) return;
    auras[index].pills ||= [];
    const newIdx = auras[index].pills.length;
    auras[index].pills.push({
      id: createCustomAuraChildId("pill"),
      enabled: true,
      label: auras[index].name || "Pill",
      detail: "",
      kind: "buff",
    });
    expandedPills.add(newIdx);
    render();
    return;
  }
  if (action === "delete-pill") {
    if (auras[index].presetRef?.presetId && editingPresetIndex !== index) return;
    const pillCard = button.closest("[data-pill-index]");
    const pillIndex = Number(pillCard?.dataset.pillIndex);
    if (Number.isInteger(pillIndex) && Array.isArray(auras[index].pills)) {
      auras[index].pills.splice(pillIndex, 1);
      expandedPills.delete(pillIndex);
      render();
    }
    return;
  }
  if (action === "add-reminder") {
    if (auras[index].presetRef?.presetId && editingPresetIndex !== index) return;
    auras[index].reminders ||= [];
    const newIdx = auras[index].reminders.length;
    auras[index].reminders.push({
      id: createCustomAuraChildId("reminder"),
      enabled: true,
      event: "turn-start",
      label: `Inizia il turno nell'aura ${auras[index].name}.`,
      resolution: "informational",
    });
    expandedReminders.add(newIdx);
    render();
    return;
  }
  if (action === "delete-reminder") {
    if (auras[index].presetRef?.presetId && editingPresetIndex !== index) return;
    const remCard = button.closest("[data-rem-index]");
    const remIndex = Number(remCard?.dataset.remIndex);
    if (Number.isInteger(remIndex) && Array.isArray(auras[index].reminders)) {
      auras[index].reminders.splice(remIndex, 1);
      expandedReminders.delete(remIndex);
      render();
    }
    return;
  }
  if (action === "save-as-preset") {
    const name = window.prompt("Nome del nuovo preset:", auras[index].name || "Preset aura");
    if (!name) return;
    const preset = createPresetFromAura(auras[index], { name });
    presetStore.savePreset(preset);
    auras[index] = applyPresetToCustomAura(preset, { existingAura: auras[index] });
    render();
    setStatus(`Preset "${name}" creato e collegato.`, { timeout: 2500 });
    return;
  }
  if (action === "update-preset") {
    const presetId = auras[index].presetRef?.presetId;
    const existing = presetStore.getPreset(presetId);
    if (!existing) {
      setStatus("Preset collegato non trovato nella libreria.", { isError: true, timeout: 3000 });
      return;
    }
    editingPresetIndex = index;
    editingAuraIndex = index;
    editingAuraIsNew = false;
    render();
    setStatus(`Modifica in corso del preset "${existing.name}".`, { timeout: 2500 });
    return;
  }
  if (action === "cancel-preset-edit") {
    editingPresetIndex = null;
    render();
    return;
  }
  if (action === "detach-preset") {
    if (editingPresetIndex === index) editingPresetIndex = null;
    auras[index] = detachCustomAuraPreset(auras[index]);
    render();
    setStatus("Aura scollegata dal preset (modifica locale).", { timeout: 2500 });
    return;
  }
  if (action === "apply-preset") {
    presetDialogTargetIndex = index;
    renderPresetDialog();
    return;
  }
});

document.body.addEventListener("click", (event) => {
  const presetBtn = event.target.closest("[data-preset-action]");
  if (!presetBtn) return;
  const action = presetBtn.dataset.presetAction;
  if (action === "close-dialog") {
    closePresetDialog();
    return;
  }
  const itemEl = presetBtn.closest("[data-preset-id]");
  const presetId = itemEl?.dataset.presetId;
  const preset = presetId ? presetStore.getPreset(presetId) : null;
  if (!preset && action !== "cancel-rename") return;

  if (action === "apply") {
    if (quickApplyMode) {
      void quickApplyPresetToTokens(preset);
      return;
    }
    if (presetDialogTargetIndex !== null && Number.isInteger(presetDialogTargetIndex) && auras[presetDialogTargetIndex]) {
      auras[presetDialogTargetIndex] = applyPresetToCustomAura(preset, {
        existingAura: auras[presetDialogTargetIndex],
      });
      setStatus(`Preset "${preset.name}" applicato all’aura esistente.`, { timeout: 2500 });
    } else {
      const newAura = applyPresetToCustomAura(preset);
      auras.push(newAura);
      editingAuraIndex = auras.length - 1;
      editingAuraIsNew = true;
      editingPresetIndex = null;
      initialDraftSnapshot = JSON.stringify(newAura);
      expandedPills.clear();
      expandedReminders.clear();
      setStatus(`Aura creata dal preset "${preset.name}".`, { timeout: 2500 });
    }
    closePresetDialog();
    render();
    return;
  }
  if (action === "start-rename") {
    renamingPresetId = preset.id;
    renderPresetDialog();
    return;
  }
  if (action === "save-rename") {
    const input = itemEl?.querySelector(`input[data-preset-rename-id="${escapeAttribute(preset.id)}"]`);
    const newName = String(input?.value || "").trim();
    if (newName) {
      const updated = updatePresetDefinition(preset, { name: newName });
      presetStore.savePreset(updated);
      renamingPresetId = null;
      renderPresetDialog();
      setStatus(`Preset rinominato in "${newName}".`, { timeout: 2000 });
    }
    return;
  }
  if (action === "cancel-rename") {
    renamingPresetId = null;
    renderPresetDialog();
    return;
  }
  if (action === "duplicate") {
    const copy = duplicatePreset(preset);
    presetStore.savePreset(copy);
    renderPresetDialog();
    setStatus(`Preset duplicato in "${copy.name}".`, { timeout: 2000 });
    return;
  }
  if (action === "delete") {
    if (window.confirm(`Eliminare il preset "${preset.name}"?`)) {
      presetStore.deletePreset(preset.id);
      renderPresetDialog();
      setStatus("Preset eliminato.", { timeout: 2000 });
    }
    return;
  }
});

if (addButton) {
  addButton.addEventListener("click", () => {
    if (blockSecondWorkflow()) return;
    const aura = defaultAura();
    auras.push(aura);
    editingAuraIndex = auras.length - 1;
    editingAuraIsNew = true;
    editingPresetIndex = null;
    initialDraftSnapshot = JSON.stringify(aura);
    expandedPills.clear();
    expandedReminders.clear();
    updateSaveState();
    render();
  });
}

if (presetsButton) {
  presetsButton.addEventListener("click", () => {
    if (blockSecondWorkflow()) return;
    presetDialogTargetIndex = null;
    renderPresetDialog();
  });
}

if (cancelBtn) {
  cancelBtn.addEventListener("click", () => void cancelDetailEditor());
}

if (saveButton) {
  saveButton.addEventListener("click", () => void save());
}

if (closeBtn) {
  closeBtn.addEventListener("click", () => void closeModal());
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (presetViewActive && !quickApplyMode) {
      closePresetDialog();
    } else if (Number.isInteger(editingAuraIndex)) {
      void cancelDetailEditor();
    } else {
      void closeModal();
    }
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    if (Number.isInteger(editingAuraIndex)) {
      void save();
    }
  }
});

OBR.onReady(async () => {
  sceneLifecycle.subscribe((event) => {
    if (event.phase === "unavailable") {
      tokens = [];
      auras = [];
      editingAuraIndex = null;
      editingAuraIsNew = false;
      editingPresetIndex = null;
      initialDraftSnapshot = null;
      list.replaceChildren();
      setStatus("Scena non disponibile: riapri l’editor delle aure.", { isError: true, timeout: 0 });
      updateTokenSummary();
      updateSaveState();
    } else if (event.phase === "ready" && event.reason !== "scene-bootstrap-ready") {
      setStatus("Scena pronta.", { timeout: 2000 });
      updateSaveState();
      void loadTokensFromScene();
    }
  });
  sceneLifecycle.registerSceneCleanup(() => {
    if (closeTimer) window.clearTimeout(closeTimer);
    closeTimer = null;
    if (statusTimer) window.clearTimeout(statusTimer);
    statusTimer = null;
  });
  await sceneLifecycle.mount();
  try {
    if (!sceneLifecycle.isReady()) throw new Error("Scena non disponibile: riapri l’editor delle aure.");
    const role = await OBR.player.getRole().catch(() => "PLAYER");
    if (!sceneLifecycle.isReady()) throw new Error("Scena cambiata: riapri l’editor delle aure.");
    if (role !== "GM") throw new Error("Solo il GM può gestire le aure.");
    if (!tokenIds.length) throw new Error("Token non specificato.");
    const requestedIds = new Set(tokenIds);
    const items = await OBR.scene.items.getItems((item) => requestedIds.has(item.id));
    if (!sceneLifecycle.isReady()) throw new Error("Scena cambiata: riapri l’editor delle aure.");
    tokens = tokenIds
      .map((id) => items.find((item) => item.id === id))
      .filter(Boolean);
    if (!tokens.length) throw new Error("Token non trovato nella scena.");
    if (!quickApplyMode && tokens.length !== 1) {
      await OBR.notification.show(
        "Gestisci aure personalizzate richiede un solo token. Per più token usa Applica preset aura…",
        "INFO",
      ).catch(() => {});
      await closeModal({ discard: true });
      return;
    }
    const primaryToken = tokens[0];
    editingAuraIndex = null;
    editingAuraIsNew = false;
    editingPresetIndex = null;
    initialDraftSnapshot = null;
    updateTokenSummary();
    auras = normalizeCustomAuras(
      primaryToken?.metadata?.[META_KEY]?.[CUSTOM_AURAS_FIELD],
    );
    if (quickApplyMode) {
      presetDialogTargetIndex = null;
      renderPresetDialog();
    } else {
      render();
    }
    updateSaveState();
  } catch (error) {
    setStatus(String(error?.message || error), { isError: true, timeout: 0 });
    if (saveButton) saveButton.disabled = true;
    list.innerHTML = '<div class="empty-state"><p class="empty-text">Editor non disponibile.</p></div>';
  }
});

window.addEventListener("pagehide", () => {
  if (closeTimer) window.clearTimeout(closeTimer);
  closeTimer = null;
  if (statusTimer) window.clearTimeout(statusTimer);
  statusTimer = null;
  sceneLifecycle.dispose();
});
