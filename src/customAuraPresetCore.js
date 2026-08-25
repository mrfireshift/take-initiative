import {
  DEFAULT_CUSTOM_AURA_STYLE,
  createCustomAuraChildId,
  normalizeCustomAuraPill,
  normalizeCustomAuraReminder,
} from "./customAuraCore.js";
import { normalizeAoEStyle } from "./aoeStyle.js";

const TARGET_FILTERS = new Set(["all", "friendly", "hostile"]);

const normalizedText = (value, fallback = "", maxLength = 160) =>
  (String(value || "").trim() || fallback).slice(0, maxLength);

function samePresetDefinition(left, right) {
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

export function createPresetId() {
  return createCustomAuraChildId("preset");
}

export function normalizeCustomAuraPresetDefinition(value = {}) {
  const name = normalizedText(value?.name, "Aura personalizzata", 100);
  const radiusMeters = Math.max(
    0.5,
    Math.min(300, Number(value?.radiusMeters) || 3),
  );
  const style = normalizeAoEStyle({
    ...DEFAULT_CUSTOM_AURA_STYLE,
    ...(value?.style && typeof value.style === "object" ? value.style : {}),
  });
  const filter = TARGET_FILTERS.has(String(value?.targeting?.filter || ""))
    ? String(value.targeting.filter)
    : "all";

  let pills = [];
  if (Array.isArray(value?.pills)) {
    pills = value.pills.map((p, idx) =>
      normalizeCustomAuraPill(p, name, `pill-${idx + 1}`)
    );
  } else if (value?.pill && typeof value.pill === "object") {
    pills = [normalizeCustomAuraPill(value.pill, name, "pill")];
  }

  let reminders = [];
  if (Array.isArray(value?.reminders)) {
    reminders = value.reminders.map((r, idx) =>
      normalizeCustomAuraReminder(r, name, `reminder-${idx + 1}`)
    );
  } else {
    if (value?.warnings?.start) {
      reminders.push(
        normalizeCustomAuraReminder(
          {
            id: "warning-start",
            enabled: value.warnings.start.enabled === true,
            event: "turn-start",
            label: value.warnings.start.label || `Inizia il turno nell'aura ${name}.`,
            resolution: "informational",
          },
          name,
          "warning-start",
        ),
      );
    }
    if (value?.warnings?.end) {
      reminders.push(
        normalizeCustomAuraReminder(
          {
            id: "warning-end",
            enabled: value.warnings.end.enabled === true,
            event: "turn-end",
            label: value.warnings.end.label || `Termina il turno nell'aura ${name}.`,
            resolution: "informational",
          },
          name,
          "warning-end",
        ),
      );
    }
  }

  return {
    name,
    radiusMeters,
    style,
    targeting: {
      filter,
      includeSource: value?.targeting?.includeSource === true,
    },
    pills,
    reminders,
  };
}

export function normalizeCustomAuraPreset(value = {}) {
  const id = normalizedText(value?.id, "", 120);
  if (!id) return null;
  const revision = Math.max(1, Math.floor(Number(value?.revision) || 1));
  const updatedAt = Math.max(0, Math.floor(Number(value?.updatedAt) || 0)) || Date.now();

  if (value?.deleted === true) {
    return {
      id,
      deleted: true,
      revision,
      updatedAt,
    };
  }

  const name = normalizedText(value?.name, "Preset aura", 100);
  const definition = normalizeCustomAuraPresetDefinition(
    value?.definition || value,
  );

  return {
    id,
    revision,
    name,
    updatedAt,
    definition,
  };
}

export function normalizeCustomAuraPresets(values = []) {
  const byId = new Map();
  for (const item of Array.isArray(values) ? values : []) {
    const normalized = normalizeCustomAuraPreset(item);
    if (!normalized?.id) continue;
    byId.set(normalized.id, normalized);
  }
  return [...byId.values()];
}

export function createPresetFromAura(aura, { name = "", id = null } = {}) {
  const presetId = id ? String(id).trim() : createPresetId();
  const definition = normalizeCustomAuraPresetDefinition(aura);
  const presetName = normalizedText(name || aura?.name, "Preset aura", 100);
  return {
    id: presetId,
    revision: 1,
    name: presetName,
    updatedAt: Date.now(),
    definition,
  };
}

export function updatePresetDefinition(existingPreset, { name, definition } = {}) {
  const normalized = normalizeCustomAuraPreset(existingPreset);
  if (!normalized || normalized.deleted) {
    throw new Error("Cannot update a non-existent or deleted preset");
  }
  const nextRevision = normalized.revision + 1;
  const nextName = name !== undefined ? normalizedText(name, normalized.name, 100) : normalized.name;
  const nextDefinition = definition !== undefined
    ? normalizeCustomAuraPresetDefinition(definition)
    : normalized.definition;

  return {
    id: normalized.id,
    revision: nextRevision,
    name: nextName,
    updatedAt: Date.now(),
    definition: nextDefinition,
  };
}

export function duplicatePreset(existingPreset, { newName = "" } = {}) {
  const normalized = normalizeCustomAuraPreset(existingPreset);
  if (!normalized || normalized.deleted) {
    throw new Error("Cannot duplicate a non-existent or deleted preset");
  }
  const name = normalizedText(newName || `${normalized.name} (Copia)`, "Preset aura copia", 100);
  return {
    id: createPresetId(),
    revision: 1,
    name,
    updatedAt: Date.now(),
    definition: JSON.parse(JSON.stringify(normalized.definition)),
  };
}

export function createPresetTombstone(existingPreset) {
  const normalized = normalizeCustomAuraPreset(existingPreset);
  const id = normalized?.id || (typeof existingPreset === "string" ? existingPreset : "");
  if (!id) throw new Error("Preset ID required for tombstone");
  const revision = (normalized?.revision || 1) + 1;
  return {
    id,
    deleted: true,
    revision,
    updatedAt: Date.now(),
  };
}

export function applyPresetToCustomAura(preset, {
  existingAura = null,
  auraId = null,
  enabled = true,
} = {}) {
  const normalizedPreset = normalizeCustomAuraPreset(preset);
  if (!normalizedPreset || normalizedPreset.deleted) {
    throw new Error("Cannot apply a non-existent or deleted preset");
  }
  const id = String(auraId || existingAura?.id || createCustomAuraChildId("aura")).trim();
  const isEnabled = existingAura?.enabled !== undefined ? existingAura.enabled !== false : enabled !== false;
  const definition = JSON.parse(JSON.stringify(normalizedPreset.definition));

  return {
    id,
    enabled: isEnabled,
    ...definition,
    presetRef: {
      presetId: normalizedPreset.id,
      revision: normalizedPreset.revision,
    },
  };
}

export function appendPresetToCustomAuraList(values = [], preset) {
  const current = Array.isArray(values) ? values : [];
  return [
    ...current,
    applyPresetToCustomAura(preset),
  ];
}

export function detachCustomAuraPreset(aura) {
  if (!aura || typeof aura !== "object") return aura;
  const copy = JSON.parse(JSON.stringify(aura));
  delete copy.presetRef;
  return copy;
}

export function syncCustomAuraWithPresets(aura, presetCatalog = []) {
  if (!aura || typeof aura !== "object") return aura;
  if (!aura.presetRef?.presetId) return aura;

  const presetId = String(aura.presetRef.presetId).trim();
  const currentRevision = Math.max(1, Math.floor(Number(aura.presetRef.revision) || 1));

  const catalog = Array.isArray(presetCatalog) ? presetCatalog : [];
  const preset = catalog.find((p) => String(p?.id || "").trim() === presetId);

  if (!preset) {
    // Preset non disponibile: conserva lo snapshot corrente
    return aura;
  }

  const normalized = normalizeCustomAuraPreset(preset);
  if (!normalized) return aura;

  if (normalized.deleted) {
    // Se è un tombstone con revisione >= alla nostra, distacca conservando lo snapshot
    if (normalized.revision >= currentRevision) {
      return detachCustomAuraPreset(aura);
    }
    return aura;
  }

  // Preset attivo: aggiorna anche un'istanza che presenta drift a parità di
  // revision. Le modifiche locali devono passare da detach, non restare una
  // linked aura ambigua.
  const currentDefinition = normalizeCustomAuraPresetDefinition(aura);
  const definitionDrifted = !samePresetDefinition(
    currentDefinition,
    normalized.definition,
  );
  if (
    normalized.revision > currentRevision
    || (normalized.revision === currentRevision && definitionDrifted)
  ) {
    const updated = applyPresetToCustomAura(normalized, {
      existingAura: aura,
      auraId: aura.id,
      enabled: aura.enabled,
    });
    return updated;
  }

  return aura;
}

export function syncCustomAurasListWithPresets(auras = [], presetCatalog = []) {
  let changed = false;
  const synced = (Array.isArray(auras) ? auras : []).map((aura) => {
    const updated = syncCustomAuraWithPresets(aura, presetCatalog);
    if (JSON.stringify(updated) !== JSON.stringify(aura)) {
      changed = true;
      return updated;
    }
    return aura;
  });
  return { auras: synced, changed };
}
