import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import {
  CUSTOM_AURAS_FIELD,
  DEFAULT_CUSTOM_AURA_STYLE,
  createCustomAuraChildId,
  normalizeCustomAuraPill,
  normalizeCustomAuraReminder,
  normalizeCustomAuras,
} from "./customAuraCore.js";
import {
  applyPresetToCustomAura,
  appendPresetToCustomAuraList,
  createPresetFromAura,
  createPresetId,
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
const saveButton = document.querySelector("#save");
const presetsButton = document.querySelector("#presets-btn");
const sceneLifecycle = createSceneLifecycleAdapter({ obr: OBR });
const presetStore = getCustomAuraPresetStore();

let tokens = [];
let auras = [];
let saving = false;
let closeTimer = null;
let presetDialogTargetIndex = null; // null = standalone library, number = applying to aura index
let editingPresetIndex = null;
let editingAuraIndex = null;
let editingAuraIsNew = false;
let quickApplyPresetId = null;
const quickApplyMode = new URLSearchParams(window.location.search).get("mode") === "apply-preset";

function defaultAura() {
  const id = createCustomAuraChildId("aura");
  return {
    id,
    enabled: true,
    name: "Aura personalizzata",
    radiusMeters: 3,
    style: { ...DEFAULT_CUSTOM_AURA_STYLE },
    targeting: { filter: "all", includeSource: false },
    pills: [
      {
        id: createCustomAuraChildId("pill"),
        enabled: true,
        label: "Nell'aura",
        detail: "",
        kind: "buff",
      },
    ],
    reminders: [
      {
        id: createCustomAuraChildId("reminder"),
        enabled: false,
        event: "turn-start",
        label: "Inizia il turno nell'aura.",
        resolution: "informational",
      },
      {
        id: createCustomAuraChildId("reminder"),
        enabled: false,
        event: "turn-end",
        label: "Termina il turno nell'aura.",
        resolution: "informational",
      },
    ],
    // Backward compatibility mirrors
    pill: {
      enabled: true,
      label: "Nell'aura",
      detail: "",
      kind: "buff",
    },
    warnings: {
      start: { enabled: false, label: "Inizia il turno nell'aura." },
      end: { enabled: false, label: "Termina il turno nell'aura." },
    },
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

function pillTemplate(pill, pillIndex, auraIndex, readOnly = false) {
  return `
    <div class="sub-card" data-pill-index="${pillIndex}">
      <div class="sub-card-head">
        <label class="toggle"><input type="checkbox" data-field="pills.${pillIndex}.enabled"${checked(pill.enabled)}${disabled(readOnly)}> Attiva</label>
        <button class="button-sm danger" type="button" data-action="delete-pill" style="margin-left:auto"${disabled(readOnly)}>Rimuovi</button>
      </div>
      <div class="grid">
        <label class="field">Testo pill
          <input type="text" maxlength="100" data-field="pills.${pillIndex}.label" value="${escapeAttribute(pill.label)}"${disabled(readOnly)}>
        </label>
        <label class="field">Tipo
          <select data-field="pills.${pillIndex}.kind"${disabled(readOnly)}>
            ${option("buff", pill.kind, "Beneficio (Buff)")}
            ${option("debuff", pill.kind, "Penalità (Debuff)")}
          </select>
        </label>
      </div>
      <label class="field">Descrizione dettaglio
        <textarea maxlength="320" data-field="pills.${pillIndex}.detail"${disabled(readOnly)}>${escapeAttribute(pill.detail)}</textarea>
      </label>
    </div>
  `;
}

function reminderTemplate(rem, remIndex, auraIndex, readOnly = false) {
  const isManualSave = rem.resolution === "manual-save";
  const isManualDamage = rem.resolution === "manual-damage";
  const isFixedDC = rem.dcMode === "fixed";
  const damageDice = rem.damage?.dice || "";
  const damageType = rem.damage?.type || "";
  const damageOnSave = rem.damage?.onSave || "half";
  const failCondition = rem.failureCondition?.condition || "";

  return `
    <div class="sub-card" data-rem-index="${remIndex}">
      <div class="sub-card-head">
        <label class="toggle"><input type="checkbox" data-field="reminders.${remIndex}.enabled"${checked(rem.enabled)}${disabled(readOnly)}> Attivo</label>
        <button class="button-sm danger" type="button" data-action="delete-reminder" style="margin-left:auto"${disabled(readOnly)}>Rimuovi</button>
      </div>
      <div class="grid">
        <label class="field">Evento
          <select data-field="reminders.${remIndex}.event"${disabled(readOnly)}>
            ${option("turn-start", rem.event, "Inizio Turno")}
            ${option("turn-end", rem.event, "Fine Turno")}
            ${option("enter", rem.event, "Entrata nell'Aura")}
            ${option("leave", rem.event, "Uscita dall'Aura")}
          </select>
        </label>
        <label class="field">Tipo Notifica
          <select data-field="reminders.${remIndex}.resolution" data-rerender="true"${disabled(readOnly)}>
            ${option("informational", rem.resolution, "Avviso Informativo")}
            ${option("manual-save", rem.resolution, "Tiro Salvezza (TS)")}
            ${option("manual-damage", rem.resolution, "Danno Diretto (Senza TS)")}
          </select>
        </label>
      </div>
      <label class="field">Testo Notifica
        <input type="text" maxlength="240" data-field="reminders.${remIndex}.label" value="${escapeAttribute(rem.label)}"${disabled(readOnly)}>
      </label>
      ${isManualSave ? `
        <div class="grid three" style="margin-top:4px;">
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
              ${option("caster", rem.dcMode, "CD Incantesimo Caster")}
              ${option("fixed", rem.dcMode, "CD Fissa")}
            </select>
          </label>
          ${isFixedDC ? `
            <label class="field">Valore CD
              <input type="number" min="1" max="99" data-field="reminders.${remIndex}.dc" value="${escapeAttribute(rem.dc ?? 15)}"${disabled(readOnly)}>
            </label>
          ` : `<div></div>`}
        </div>
        <div class="grid three" style="margin-top:4px;">
          <label class="field">Formula Danno (es. 2d6)
            <input type="text" maxlength="40" data-field="reminders.${remIndex}.damage.dice" value="${escapeAttribute(damageDice)}" placeholder="opzionale"${disabled(readOnly)}>
          </label>
          <label class="field">Tipo Danno
            <input type="text" maxlength="40" data-field="reminders.${remIndex}.damage.type" value="${escapeAttribute(damageType)}" placeholder="es. fuoco"${disabled(readOnly)}>
          </label>
          <label class="field">Danno su TS Superato
            <select data-field="reminders.${remIndex}.damage.onSave"${disabled(readOnly)}>
              ${option("half", damageOnSave, "Metà danno")}
              ${option("zero", damageOnSave, "Nessun danno")}
            </select>
          </label>
        </div>
        <label class="field" style="margin-top:4px;">Condizione su Fallimento TS (opzionale)
          <input type="text" maxlength="100" data-field="reminders.${remIndex}.failureCondition.condition" value="${escapeAttribute(failCondition)}" placeholder="es. Prono"${disabled(readOnly)}>
        </label>
      ` : ""}
      ${isManualDamage ? `
        <div class="grid" style="margin-top:4px;">
          <label class="field">Formula Danno (es. 2d8)
            <input type="text" maxlength="40" data-field="reminders.${remIndex}.damage.dice" value="${escapeAttribute(damageDice)}"${disabled(readOnly)}>
          </label>
          <label class="field">Tipo Danno
            <input type="text" maxlength="40" data-field="reminders.${remIndex}.damage.type" value="${escapeAttribute(damageType)}" placeholder="es. radioso"${disabled(readOnly)}>
          </label>
        </div>
      ` : ""}
    </div>
  `;
}

function auraSummaryTemplate(aura, index) {
  const isDraft = editingAuraIsNew && editingAuraIndex === index;
  const isLinked = !!aura.presetRef?.presetId;
  const linkedPreset = isLinked ? presetStore.getPreset(aura.presetRef.presetId) : null;
  const presetLabel = linkedPreset?.name || (isLinked ? `Preset #${aura.presetRef.presetId.slice(-6)}` : "");
  const detailOpen = Number.isInteger(editingAuraIndex);
  const quickDisabled = isDraft || detailOpen;
  return `
    <article class="aura-summary-card${isDraft ? " draft" : ""}" data-index="${index}" data-existing-summary>
      <div class="aura-summary-main">
        <div class="aura-summary-title-row">
          <span class="aura-summary-status${aura.enabled ? " active" : " inactive"}">${aura.enabled ? "Attiva" : "Disattivata"}</span>
          <input
            class="aura-summary-name"
            type="text"
            maxlength="100"
            value="${escapeAttribute(aura.name)}"
            aria-label="Nome aura ${escapeAttribute(aura.name)}"
            data-existing-rename
            ${disabled(quickDisabled || isLinked)}
          >
        </div>
        <div class="aura-summary-meta">
          ${aura.radiusMeters}m · ${aura.pills?.length || 0} pill · ${aura.reminders?.length || 0} reminder
          ${isLinked ? ` · 🔗 ${escapeAttribute(presetLabel)}` : ""}
          ${isDraft ? " · bozza non salvata" : ""}
        </div>
      </div>
      <div class="aura-summary-actions">
        <label class="toggle" title="Persisti subito lo stato dell'aura">
          <input type="checkbox" data-existing-toggle${checked(aura.enabled)}${disabled(quickDisabled)}>
          Attiva
        </label>
        <button type="button" class="button-sm" data-action="edit-details"${disabled(quickDisabled)}>Modifica dettagli</button>
        <button type="button" class="button-sm danger" data-action="delete-existing"${disabled(quickDisabled)}>Elimina</button>
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
  const presetName = linkedPreset?.name || (isLinked ? `Preset #${aura.presetRef.presetId.slice(-6)}` : "");

  return `
    <section class="aura-card aura-detail-card" data-index="${index}">
      <div class="card-head">
        <div class="aura-detail-heading">
          <div class="section-title">${isNew ? "Nuova aura" : "Modifica dettagli"}</div>
          ${canEditName
            ? `<input class="name" type="text" maxlength="100" data-field="name" value="${escapeAttribute(aura.name)}" aria-label="Nome aura"${disabled(readOnly)}>`
            : `<strong class="aura-detail-name">${escapeAttribute(aura.name)}</strong>`}
        </div>
        ${isNew
          ? `<label class="toggle"><input type="checkbox" data-field="enabled"${checked(aura.enabled)}> Attiva</label>`
          : `<span class="aura-detail-note">Stato e nome si gestiscono dall’elenco sopra.</span>`}
        <button class="button-sm" type="button" data-action="${isNew ? "cancel-new" : "close-details"}">${isNew ? "Annulla" : "Fine"}</button>
      </div>

      <div class="preset-row">
        ${isLinked ? `
          <span class="preset-badge">🔗 Collegato: ${escapeAttribute(presetName)} (rev ${aura.presetRef.revision || 1})</span>
          ${isEditingPreset
            ? '<button type="button" class="button-sm" data-action="cancel-preset-edit">Annulla modifica preset</button>'
            : '<button type="button" class="button-sm" data-action="update-preset">Modifica preset</button>'}
          <button type="button" class="button-sm" data-action="detach-preset">Scollega (Modifica solo questa)</button>
        ` : `
          <button type="button" class="button-sm" data-action="save-as-preset">Salva come preset…</button>
          <button type="button" class="button-sm" data-action="apply-preset">Carica da preset…</button>
        `}
      </div>

      <div class="section">
        <div class="section-title">Dimensione e bersagli</div>
        <div class="grid">
          <label class="field">Raggio in metri
            <input type="number" min="0.5" max="300" step="0.5" data-field="radiusMeters" value="${escapeAttribute(aura.radiusMeters)}"${disabled(readOnly)}>
          </label>
          <label class="field">Token interessati
            <select data-field="targeting.filter"${disabled(readOnly)}>
              ${option("all", aura.targeting?.filter, "Tutti")}
              ${option("friendly", aura.targeting?.filter, "Alleati")}
              ${option("hostile", aura.targeting?.filter, "Ostili")}
            </select>
          </label>
        </div>
        <label class="inline"><input type="checkbox" data-field="targeting.includeSource"${checked(aura.targeting?.includeSource)}${disabled(readOnly)}> Includi anche il token sorgente</label>
      </div>

      <div class="section">
        <div class="section-title">Aspetto sulla mappa</div>
        <div class="grid">
          <label class="field">Riempimento
            <div class="color-row"><input type="color" data-field="style.fillColor" value="${escapeAttribute(aura.style?.fillColor)}"${disabled(readOnly)}><span>${escapeAttribute(aura.style?.fillColor)}</span></div>
          </label>
          <label class="field">Bordo
            <div class="color-row"><input type="color" data-field="style.strokeColor" value="${escapeAttribute(aura.style?.strokeColor)}"${disabled(readOnly)}><span>${escapeAttribute(aura.style?.strokeColor)}</span></div>
          </label>
          <label class="field">Opacità riempimento
            <input type="range" min="0.05" max="0.45" step="0.01" data-field="style.fillOpacity" value="${escapeAttribute(aura.style?.fillOpacity)}"${disabled(readOnly)}>
          </label>
          <label class="field">Spessore bordo
            <input type="range" min="0.4" max="3" step="0.1" data-field="style.strokeWidth" value="${escapeAttribute(aura.style?.strokeWidth)}"${disabled(readOnly)}>
          </label>
        </div>
      </div>

      <div class="section">
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <div class="section-title">Pill Condizione (${pills.length})</div>
          <button type="button" class="button-sm" data-action="add-pill"${disabled(readOnly)}>+ Aggiungi pill</button>
        </div>
        <div class="sub-list">
          ${pills.map((pill, pIdx) => pillTemplate(pill, pIdx, index, readOnly)).join("")}
        </div>
      </div>

      <div class="section">
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <div class="section-title">Reminder e Trigger (${reminders.length})</div>
          <button type="button" class="button-sm" data-action="add-reminder"${disabled(readOnly)}>+ Aggiungi reminder</button>
        </div>
        <div class="sub-list">
          ${reminders.map((rem, rIdx) => reminderTemplate(rem, rIdx, index, readOnly)).join("")}
        </div>
      </div>

      <!-- Hidden backward-compatibility elements to mirror primary pill/warnings for existing test selectors -->
      <div style="display:none;" aria-hidden="true">
        <input type="checkbox" data-field="pill.enabled"${checked(aura.pills?.[0]?.enabled !== false)}>
        <input type="text" data-field="pill.label" value="${escapeAttribute(aura.pills?.[0]?.label || "")}">
        <input type="checkbox" data-field="warnings.start.enabled"${checked(aura.reminders?.some((r) => r.event === "turn-start" && r.enabled))}>
        <input type="checkbox" data-field="warnings.end.enabled"${checked(aura.reminders?.some((r) => r.event === "turn-end" && r.enabled))}>
      </div>
    </section>
  `;
}

function renderPresetDialog() {
  const existingBackdrop = document.querySelector("#preset-dialog-backdrop");
  if (existingBackdrop) existingBackdrop.remove();
  if (presetDialogTargetIndex === undefined || presetDialogTargetIndex === false) return;

  const presets = presetStore.getActivePresets();
  const backdrop = document.createElement("div");
  backdrop.id = "preset-dialog-backdrop";
  backdrop.className = "preset-dialog-backdrop";
  backdrop.innerHTML = `
    <div class="preset-dialog">
      <div class="preset-dialog-header">
        <h2 style="margin:0;font-size:15px;">Libreria Preset Aura</h2>
        <button type="button" class="close" data-preset-action="close-dialog">×</button>
      </div>
      <div class="preset-dialog-body">
        ${!presets.length ? '<div class="empty">Nessun preset salvato. Usa “Salva come preset” su un’aura per crearne uno.</div>' : ""}
        ${presets.map((preset) => `
          <div class="preset-item" data-preset-id="${preset.id}">
            <div class="preset-item-info">
              <div class="preset-item-name">${escapeAttribute(preset.name)}</div>
              <div class="preset-item-meta">Raggio: ${preset.definition?.radiusMeters || 3}m · ${preset.definition?.pills?.length || 0} pill · ${preset.definition?.reminders?.length || 0} reminder · rev ${preset.revision}</div>
            </div>
            <div class="preset-item-actions">
              <button type="button" class="button-sm primary" data-preset-action="apply">${presetDialogTargetIndex !== null ? "Applica" : "Usa come nuova"}</button>
              <button type="button" class="button-sm" data-preset-action="duplicate">Duplica</button>
              <button type="button" class="button-sm danger" data-preset-action="delete">Elimina</button>
            </div>
          </div>
        `).join("")}
      </div>
      <div class="preset-dialog-footer">
        <button type="button" class="button" data-preset-action="close-dialog">Chiudi</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);
}

function closePresetDialog() {
  presetDialogTargetIndex = undefined;
  const existingBackdrop = document.querySelector("#preset-dialog-backdrop");
  if (existingBackdrop) existingBackdrop.remove();
}

function render() {
  const editing = Number.isInteger(editingAuraIndex) && auras[editingAuraIndex]
    ? editingAuraIndex
    : null;
  const existingMarkup = auras.length
    ? `<div class="sub-list">${auras.map((aura, index) => auraSummaryTemplate(aura, index)).join("")}</div>`
    : '<div class="empty">Nessuna aura configurata per questo token.<br>Usa “Nuova aura” o “Libreria Preset” per crearne una.</div>';
  list.innerHTML = `
    <section class="section aura-management-section">
      <div class="section-title">Aure configurate</div>
      <div class="aura-management-hint">Attiva, rinomina o elimina un’aura dall’elenco: queste tre operazioni vengono salvate subito.</div>
      ${existingMarkup}
    </section>
    ${editing === null
      ? `<section class="section aura-create-hint">
          <div class="section-title">Configurazione</div>
          <div class="aura-management-hint">Usa “Nuova aura” per aprire l’editor di raggio, stile, pill e reminder. Le modifiche dettagliate richiedono Salva.</div>
        </section>`
      : `<section class="section aura-editor-section">${auraTemplate(auras[editing], editing, { isNew: editingAuraIsNew })}</section>`}
  `;
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
    : `${tokens.length} token selezionati · modifica collettiva (modello: ${primaryToken.name || "Token"})`;
}

function updateSaveState() {
  const hasDetailDraft = Number.isInteger(editingAuraIndex);
  saveButton.hidden = !hasDetailDraft;
  saveButton.disabled = saving || !tokens.length || !sceneLifecycle.isReady() || !hasDetailDraft;
}

async function persistExistingAuraChange(index, mutate, successMessage) {
  if (saving || Number.isInteger(editingAuraIndex)) return;
  const auraId = String(auras[index]?.id || "").trim();
  if (!auraId || !tokens.length || !sceneLifecycle.isReady()) return;
  const operation = sceneLifecycle.capture({
    operationId: `custom-aura-existing:${Date.now().toString(36)}`,
  });
  if (!sceneLifecycle.isCurrent(operation)) return;

  saving = true;
  updateSaveState();
  status.classList.remove("error");
  status.textContent = "Aggiornamento aura…";
  try {
    await OBR.scene.items.updateItems(tokens.map((item) => item.id), (drafts) => {
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
    status.textContent = successMessage;
  } catch (error) {
    if (!sceneLifecycle.isCurrent(operation)) {
      status.classList.add("error");
      status.textContent = "Scena cambiata: riapri l’editor delle aure.";
      return;
    }
    status.classList.add("error");
    status.textContent = `Errore: ${String(error?.message || error)}`;
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
    status.classList.add("error");
    status.textContent = "Il nome dell’aura non può essere vuoto.";
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
  if (input.type === "color") {
    const label = input.parentElement?.querySelector("span");
    if (label) label.textContent = input.value;
  }
  if (input.dataset.rerender === "true") {
    render();
  }
}

async function closeModal() {
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

async function closeDetailEditor() {
  editingAuraIndex = null;
  editingAuraIsNew = false;
  editingPresetIndex = null;
  await loadTokensFromScene();
  refreshAurasFromPrimaryToken();
  render();
  updateSaveState();
  status.textContent = "Gestione rapida pronta.";
}

async function save() {
  if (!Number.isInteger(editingAuraIndex)) return;
  const operation = sceneLifecycle.capture({ operationId: `custom-aura-save:${Date.now().toString(36)}` });
  if (!sceneLifecycle.isCurrent(operation)) return;
  try {
    await loadTokensFromScene();
    if (!sceneLifecycle.isCurrent(operation)) return;
  } catch (error) {
    status.classList.add("error");
    status.textContent = `Errore: ${String(error?.message || error)}`;
    return;
  }
  if (!tokens.length) {
    status.textContent = "Token non disponibili sulla battlemap";
    return;
  }
  saving = true;
  updateSaveState();
  status.classList.remove("error");
  status.textContent = "Salvataggio…";
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
        status.classList.add("error");
        status.textContent = "Preset non disponibile: nessuna istanza è stata modificata.";
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
          status.classList.add("error");
          status.textContent = "Preset collegato non trovato: l’istanza resta invariata.";
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
      await OBR.scene.items.updateItems(tokens.map((item) => item.id), (drafts) => {
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
      status.classList.add("error");
      status.textContent = "Scena cambiata: riapri l’editor delle aure.";
      saving = false;
      updateSaveState();
      return;
    }
    auras = normalized;
    editingAuraIndex = null;
    editingAuraIsNew = false;
    editingPresetIndex = null;
    status.textContent = quickApplyMode
      ? "Preset applicato come nuova aura su ogni token"
      : "Aure aggiornate";
    if (closeTimer) window.clearTimeout(closeTimer);
    closeTimer = window.setTimeout(() => {
      closeTimer = null;
      if (sceneLifecycle.isCurrent(operation)) void closeModal();
    }, 220);
  } catch (error) {
    if (!sceneLifecycle.isCurrent(operation)) {
      status.classList.add("error");
      status.textContent = "Scena cambiata: riapri l’editor delle aure.";
      saving = false;
      updateSaveState();
      return;
    }
    status.classList.add("error");
    status.textContent = `Errore: ${String(error?.message || error)}`;
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
  if (event.key !== "Enter" || !event.target.matches("[data-existing-rename]")) return;
  event.preventDefault();
  event.target.blur();
});
list.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const card = button.closest("[data-index]");
  const index = Number(card?.dataset.index);
  if (!Number.isInteger(index) || !auras[index]) return;
  const action = button.dataset.action;

  if (action === "edit-details") {
    editingAuraIndex = index;
    editingAuraIsNew = false;
    editingPresetIndex = auras[index].presetRef?.presetId ? index : null;
    render();
    updateSaveState();
    status.textContent = `Modifica dettagli: “${auras[index].name}”.`;
    return;
  }
  if (action === "close-details") {
    void closeDetailEditor();
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
    auras.splice(index, 1);
    editingAuraIndex = null;
    editingAuraIsNew = false;
    editingPresetIndex = null;
    render();
    updateSaveState();
    status.textContent = "Nuova aura annullata.";
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
    auras[index].pills.push({
      id: createCustomAuraChildId("pill"),
      enabled: true,
      label: auras[index].name || "Pill",
      detail: "",
      kind: "buff",
    });
    render();
    return;
  }
  if (action === "delete-pill") {
    if (auras[index].presetRef?.presetId && editingPresetIndex !== index) return;
    const pillCard = button.closest("[data-pill-index]");
    const pillIndex = Number(pillCard?.dataset.pillIndex);
    if (Number.isInteger(pillIndex) && Array.isArray(auras[index].pills)) {
      auras[index].pills.splice(pillIndex, 1);
      render();
    }
    return;
  }
  if (action === "add-reminder") {
    if (auras[index].presetRef?.presetId && editingPresetIndex !== index) return;
    auras[index].reminders ||= [];
    auras[index].reminders.push({
      id: createCustomAuraChildId("reminder"),
      enabled: true,
      event: "turn-start",
      label: `Inizia il turno nell'aura ${auras[index].name}.`,
      resolution: "informational",
    });
    render();
    return;
  }
  if (action === "delete-reminder") {
    if (auras[index].presetRef?.presetId && editingPresetIndex !== index) return;
    const remCard = button.closest("[data-rem-index]");
    const remIndex = Number(remCard?.dataset.remIndex);
    if (Number.isInteger(remIndex) && Array.isArray(auras[index].reminders)) {
      auras[index].reminders.splice(remIndex, 1);
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
    status.textContent = `Preset "${name}" creato e collegato.`;
    return;
  }
  if (action === "update-preset") {
    const presetId = auras[index].presetRef?.presetId;
    const existing = presetStore.getPreset(presetId);
    if (!existing) {
      status.classList.add("error");
      status.textContent = "Preset collegato non trovato nella libreria.";
      return;
    }
    editingPresetIndex = index;
    editingAuraIndex = index;
    editingAuraIsNew = false;
    render();
    status.textContent = `Modifica il preset "${existing.name}" e salva per incrementare la revisione.`;
    return;
  }
  if (action === "cancel-preset-edit") {
    void closeDetailEditor();
    return;
  }
  if (action === "detach-preset") {
    if (editingPresetIndex === index) editingPresetIndex = null;
    auras[index] = detachCustomAuraPreset(auras[index]);
    render();
    status.textContent = "Aura scollegata dal preset (modifica locale).";
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
  if (!preset) return;

  if (action === "apply") {
    if (quickApplyMode) {
      quickApplyPresetId = preset.id;
      auras.push(applyPresetToCustomAura(preset));
      editingAuraIndex = auras.length - 1;
      editingAuraIsNew = true;
      editingPresetIndex = null;
      status.textContent = `Preset "${preset.name}" pronto: verrà aggiunto separatamente a ogni token.`;
    } else if (presetDialogTargetIndex !== null && Number.isInteger(presetDialogTargetIndex) && auras[presetDialogTargetIndex]) {
      auras[presetDialogTargetIndex] = applyPresetToCustomAura(preset, {
        existingAura: auras[presetDialogTargetIndex],
      });
      status.textContent = `Applicato preset "${preset.name}" all'aura esistente.`;
    } else {
      const newAura = applyPresetToCustomAura(preset);
      auras.push(newAura);
      editingAuraIndex = auras.length - 1;
      editingAuraIsNew = true;
      editingPresetIndex = null;
      status.textContent = `Aggiunta nuova aura da preset "${preset.name}".`;
    }
    closePresetDialog();
    render();
    return;
  }
  if (action === "duplicate") {
    const copy = duplicatePreset(preset);
    presetStore.savePreset(copy);
    renderPresetDialog();
    return;
  }
  if (action === "delete") {
    if (window.confirm(`Eliminare il preset "${preset.name}"?`)) {
      presetStore.deletePreset(preset.id);
      renderPresetDialog();
    }
    return;
  }
});

document.querySelector("#add").addEventListener("click", () => {
  auras.push(defaultAura());
  editingAuraIndex = auras.length - 1;
  editingAuraIsNew = true;
  editingPresetIndex = null;
  updateSaveState();
  render();
  document.querySelector(".aura-editor-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
});
if (presetsButton) {
  presetsButton.addEventListener("click", () => {
    presetDialogTargetIndex = null;
    renderPresetDialog();
  });
}
document.querySelector("#save").addEventListener("click", () => void save());
document.querySelector("#close").addEventListener("click", () => void closeModal());
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (document.querySelector("#preset-dialog-backdrop")) closePresetDialog();
    else void closeModal();
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    void save();
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
      list.replaceChildren();
      status.classList.add("error");
      status.textContent = "Scena non disponibile: riapri l’editor delle aure.";
      updateTokenSummary();
      updateSaveState();
    } else if (event.phase === "ready" && event.reason !== "scene-bootstrap-ready") {
      status.classList.remove("error");
      status.textContent = "Scena pronta: riapri l’editor delle aure se necessario.";
      updateSaveState();
      void loadTokensFromScene();
    }
  });
  sceneLifecycle.registerSceneCleanup(() => {
    if (closeTimer) window.clearTimeout(closeTimer);
    closeTimer = null;
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
    const primaryToken = tokens[0];
    editingAuraIndex = null;
    editingAuraIsNew = false;
    editingPresetIndex = null;
    updateTokenSummary();
    auras = normalizeCustomAuras(
      primaryToken.metadata?.[META_KEY]?.[CUSTOM_AURAS_FIELD],
    );
    if (quickApplyMode) {
      // Quick apply è sempre append-only: l'eventuale aura primaria serve
      // soltanto come anteprima, il commit rilegge la lista di ogni token.
      presetDialogTargetIndex = null;
      renderPresetDialog();
    }
    render();
    updateSaveState();
  } catch (error) {
    status.classList.add("error");
    status.textContent = String(error?.message || error);
    saveButton.disabled = true;
    list.innerHTML = '<div class="empty">Editor non disponibile.</div>';
  }
});

window.addEventListener("pagehide", () => {
  if (closeTimer) window.clearTimeout(closeTimer);
  closeTimer = null;
  sceneLifecycle.dispose();
});
