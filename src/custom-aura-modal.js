import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import {
  CUSTOM_AURAS_FIELD,
  DEFAULT_CUSTOM_AURA_STYLE,
  normalizeCustomAuras,
} from "./customAuraCore.js";
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
const sceneLifecycle = createSceneLifecycleAdapter({ obr: OBR });
let tokens = [];
let auras = [];
let selectionUnsubscribe = null;
let selectionPollTimer = null;
let selectionPollBusy = false;
let selectionRevision = 0;
let saving = false;
let closeTimer = null;

function createId() {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch {}
  return `aura-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function defaultAura() {
  return {
    id: createId(),
    enabled: true,
    name: "Aura personalizzata",
    radiusMeters: 3,
    style: { ...DEFAULT_CUSTOM_AURA_STYLE },
    targeting: { filter: "all", includeSource: false },
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

function option(value, current, label) {
  return `<option value="${value}"${current === value ? " selected" : ""}>${label}</option>`;
}

function auraTemplate(aura, index) {
  return `
    <section class="aura-card" data-index="${index}">
      <div class="card-head">
        <label class="toggle"><input type="checkbox" data-field="enabled"${checked(aura.enabled)}> Attiva</label>
        <input class="name" type="text" maxlength="100" data-field="name" value="${escapeAttribute(aura.name)}" aria-label="Nome aura">
        <button class="danger" type="button" data-action="delete">Elimina</button>
      </div>

      <div class="section">
        <div class="section-title">Dimensione e bersagli</div>
        <div class="grid">
          <label class="field">Raggio in metri
            <input type="number" min="0.5" max="300" step="0.5" data-field="radiusMeters" value="${escapeAttribute(aura.radiusMeters)}">
          </label>
          <label class="field">Token interessati
            <select data-field="targeting.filter">
              ${option("all", aura.targeting.filter, "Tutti")}
              ${option("friendly", aura.targeting.filter, "Alleati")}
              ${option("hostile", aura.targeting.filter, "Ostili")}
            </select>
          </label>
        </div>
        <label class="inline"><input type="checkbox" data-field="targeting.includeSource"${checked(aura.targeting.includeSource)}> Includi anche il token sorgente</label>
      </div>

      <div class="section">
        <div class="section-title">Aspetto sulla mappa</div>
        <div class="grid">
          <label class="field">Riempimento
            <div class="color-row"><input type="color" data-field="style.fillColor" value="${escapeAttribute(aura.style.fillColor)}"><span>${escapeAttribute(aura.style.fillColor)}</span></div>
          </label>
          <label class="field">Bordo
            <div class="color-row"><input type="color" data-field="style.strokeColor" value="${escapeAttribute(aura.style.strokeColor)}"><span>${escapeAttribute(aura.style.strokeColor)}</span></div>
          </label>
          <label class="field">Opacità riempimento
            <input type="range" min="0.05" max="0.45" step="0.01" data-field="style.fillOpacity" value="${escapeAttribute(aura.style.fillOpacity)}">
          </label>
          <label class="field">Spessore bordo
            <input type="range" min="0.4" max="3" step="0.1" data-field="style.strokeWidth" value="${escapeAttribute(aura.style.strokeWidth)}">
          </label>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Pill mentre il token è nell'aura</div>
        <label class="inline"><input type="checkbox" data-field="pill.enabled"${checked(aura.pill.enabled)}> Mostra la pill sul token</label>
        <div class="grid">
          <label class="field">Testo pill
            <input type="text" maxlength="100" data-field="pill.label" value="${escapeAttribute(aura.pill.label)}">
          </label>
          <label class="field">Tipo
            <select data-field="pill.kind">
              ${option("buff", aura.pill.kind, "Beneficio")}
              ${option("debuff", aura.pill.kind, "Penalità")}
            </select>
          </label>
        </div>
        <label class="field">Descrizione
          <textarea maxlength="320" data-field="pill.detail">${escapeAttribute(aura.pill.detail)}</textarea>
        </label>
      </div>

      <div class="section">
        <div class="section-title">Warning di turno</div>
        <div class="warning">
          <label class="toggle"><input type="checkbox" data-field="warnings.start.enabled"${checked(aura.warnings.start.enabled)}> Inizio</label>
          <input type="text" maxlength="240" data-field="warnings.start.label" value="${escapeAttribute(aura.warnings.start.label)}">
        </div>
        <div class="warning">
          <label class="toggle"><input type="checkbox" data-field="warnings.end.enabled"${checked(aura.warnings.end.enabled)}> Fine</label>
          <input type="text" maxlength="240" data-field="warnings.end.label" value="${escapeAttribute(aura.warnings.end.label)}">
        </div>
      </div>
    </section>
  `;
}

function render() {
  if (!auras.length) {
    list.innerHTML = '<div class="empty">Nessuna aura configurata per questo token.<br>Usa “Nuova aura” per crearne una.</div>';
    return;
  }
  list.innerHTML = auras.map(auraTemplate).join("");
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
    : `${tokens.length} token selezionati · modello: ${primaryToken.name || "Token"}`;
}

function updateSaveState() {
  saveButton.disabled = saving || !tokens.length || !sceneLifecycle.isReady();
}

function setAtPath(target, path, value) {
  const keys = String(path || "").split(".").filter(Boolean);
  let cursor = target;
  for (const key of keys.slice(0, -1)) {
    cursor[key] ||= {};
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
  setAtPath(auras[index], input.dataset.field, inputValue(input));
  if (input.type === "color") {
    const label = input.parentElement?.querySelector("span");
    if (label) label.textContent = input.value;
  }
}

async function closeModal() {
  await OBR.popover.close(MODAL_ID).catch(() => {});
}

async function save() {
  const operation = sceneLifecycle.capture({ operationId: `custom-aura-save:${Date.now().toString(36)}` });
  if (!sceneLifecycle.isCurrent(operation)) return;
  try {
    await setActiveSelection(await OBR.player.getSelection());
    if (!sceneLifecycle.isCurrent(operation)) return;
  } catch (error) {
    status.classList.add("error");
    status.textContent = `Errore: ${String(error?.message || error)}`;
    return;
  }
  if (!tokens.length) {
    status.textContent = "Seleziona almeno un token sulla battlemap";
    return;
  }
  saving = true;
  updateSaveState();
  status.classList.remove("error");
  status.textContent = "Salvataggio…";
  try {
    const normalized = normalizeCustomAuras(auras);
    if (!sceneLifecycle.isCurrent(operation)) {
      saving = false;
      updateSaveState();
      return;
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
    if (!sceneLifecycle.isCurrent(operation)) {
      status.classList.add("error");
      status.textContent = "Scena cambiata: riapri l’editor delle aure.";
      saving = false;
      updateSaveState();
      return;
    }
    auras = normalized;
    status.textContent = "Aure aggiornate";
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

async function setActiveSelection(selection, { preserveInitialOnEmpty = false } = {}) {
  const operation = sceneLifecycle.capture({ operationId: `custom-aura-selection:${Date.now().toString(36)}` });
  if (!sceneLifecycle.isCurrent(operation)) return;
  if (!Array.isArray(selection)) return;
  const revision = ++selectionRevision;
  const selectedIds = [...new Set(
    selection.map((id) => String(id || "").trim()).filter(Boolean),
  )];
  if (!selectedIds.length && preserveInitialOnEmpty) return;
  const selectedItems = selectedIds.length
    ? await OBR.scene.items.getItems(selectedIds)
    : [];
  if (revision !== selectionRevision || !sceneLifecycle.isCurrent(operation)) return;
  tokens = selectedItems.filter((item) => (
    item?.layer === "CHARACTER"
    && !item.attachedTo
  ));
  updateTokenSummary();
  updateSaveState();
  status.classList.remove("error");
  status.textContent = tokens.length
    ? `${tokens.length} token nella selezione attiva`
    : "Seleziona almeno un token sulla battlemap";
}

async function refreshSelectionFromScene(options = {}) {
  if (!sceneLifecycle.isReady()) return;
  if (selectionPollBusy) return;
  selectionPollBusy = true;
  try {
    await setActiveSelection(await OBR.player.getSelection(), options);
  } catch (error) {
    status.classList.add("error");
    status.textContent = `Errore: ${String(error?.message || error)}`;
  } finally {
    selectionPollBusy = false;
  }
}

function mountSelectionSync() {
  if (selectionUnsubscribe) return;
  selectionUnsubscribe = OBR.player.onChange((player) => {
    if (!Array.isArray(player?.selection)) return;
    void setActiveSelection(player.selection).catch((error) => {
      status.classList.add("error");
      status.textContent = `Errore: ${String(error?.message || error)}`;
    });
  });
  selectionPollTimer = window.setInterval(() => void refreshSelectionFromScene(), 150);
  void refreshSelectionFromScene({ preserveInitialOnEmpty: true });
}

list.addEventListener("input", (event) => updateFromInput(event.target));
list.addEventListener("change", (event) => updateFromInput(event.target));
list.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action='delete']");
  if (!button) return;
  const index = Number(button.closest("[data-index]")?.dataset.index);
  if (!Number.isInteger(index)) return;
  auras.splice(index, 1);
  render();
});
document.querySelector("#add").addEventListener("click", () => {
  auras.push(defaultAura());
  render();
  list.lastElementChild?.scrollIntoView({ behavior: "smooth", block: "start" });
});
document.querySelector("#save").addEventListener("click", () => void save());
document.querySelector("#close").addEventListener("click", () => void closeModal());
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") void closeModal();
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    void save();
  }
});

OBR.onReady(async () => {
  sceneLifecycle.subscribe((event) => {
    if (event.phase === "unavailable") {
      selectionRevision += 1;
      tokens = [];
      auras = [];
      selectionUnsubscribe?.();
      selectionUnsubscribe = null;
      if (selectionPollTimer) window.clearInterval(selectionPollTimer);
      selectionPollTimer = null;
      list.replaceChildren();
      status.classList.add("error");
      status.textContent = "Scena non disponibile: riapri l’editor delle aure.";
      updateTokenSummary();
      updateSaveState();
    } else if (event.phase === "ready" && event.reason !== "scene-bootstrap-ready") {
      status.classList.remove("error");
      status.textContent = "Scena pronta: riapri l’editor delle aure se necessario.";
      updateSaveState();
      mountSelectionSync();
    }
  });
  sceneLifecycle.registerSceneCleanup(() => {
    selectionUnsubscribe?.();
    selectionUnsubscribe = null;
    if (selectionPollTimer) window.clearInterval(selectionPollTimer);
    selectionPollTimer = null;
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
    document.querySelector("#token-name").textContent = tokens.length === 1
      ? primaryToken.name || "Token"
      : `${tokens.length} token selezionati · modello: ${primaryToken.name || "Token"}`;
    auras = normalizeCustomAuras(
      primaryToken.metadata?.[META_KEY]?.[CUSTOM_AURAS_FIELD],
    );
    render();
    updateSaveState();
    mountSelectionSync();
  } catch (error) {
    status.classList.add("error");
    status.textContent = String(error?.message || error);
    saveButton.disabled = true;
    list.innerHTML = '<div class="empty">Editor non disponibile.</div>';
  }
});

window.addEventListener("pagehide", () => {
  selectionUnsubscribe?.();
  selectionUnsubscribe = null;
  if (selectionPollTimer) window.clearInterval(selectionPollTimer);
  selectionPollTimer = null;
  if (closeTimer) window.clearTimeout(closeTimer);
  closeTimer = null;
  sceneLifecycle.dispose();
});
