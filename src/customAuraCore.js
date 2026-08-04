import { ID } from "./constants.js";
import { normalizeAoEStyle } from "./aoeStyle.js";
import {
  areaMembershipPlan,
  areaMembershipTargetIds,
} from "./spellAreaMembershipCore.js";

export const CUSTOM_AURAS_FIELD = "customAuras";
export const CUSTOM_AURA_META_KEY = `${ID}/customAura`;
export const CUSTOM_AURA_EFFECT_TYPE = "custom-aura";

export const DEFAULT_CUSTOM_AURA_STYLE = Object.freeze({
  fillColor: "#7c3aed",
  strokeColor: "#c4b5fd",
  fillOpacity: 0.16,
  strokeWidth: 1.4,
});

const TARGET_FILTERS = new Set(["all", "friendly", "hostile"]);

const normalizedText = (value, fallback = "", maxLength = 160) =>
  (String(value || "").trim() || fallback).slice(0, maxLength);

function normalizedWarning(value, fallback) {
  return {
    enabled: value?.enabled === true,
    label: normalizedText(value?.label, fallback, 240),
  };
}

export function normalizeCustomAura(value = {}) {
  const id = normalizedText(value?.id, "", 120);
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
  const pillEnabled = value?.pill?.enabled === true;
  const pillKind = value?.pill?.kind === "debuff" ? "debuff" : "buff";

  return {
    id,
    enabled: value?.enabled !== false,
    name,
    radiusMeters,
    style,
    targeting: {
      filter,
      includeSource: value?.targeting?.includeSource === true,
    },
    pill: {
      enabled: pillEnabled,
      label: normalizedText(value?.pill?.label, name, 100),
      detail: normalizedText(value?.pill?.detail, "", 320),
      kind: pillKind,
    },
    warnings: {
      start: normalizedWarning(
        value?.warnings?.start,
        `Inizia il turno nell'aura ${name}.`,
      ),
      end: normalizedWarning(
        value?.warnings?.end,
        `Termina il turno nell'aura ${name}.`,
      ),
    },
  };
}

export function normalizeCustomAuras(values = []) {
  const byId = new Map();
  for (const value of Array.isArray(values) ? values : []) {
    const aura = normalizeCustomAura(value);
    if (!aura.id || byId.has(aura.id)) continue;
    byId.set(aura.id, aura);
  }
  return [...byId.values()];
}

export function collectActiveCustomAuras(items = [], { metaKey = "" } = {}) {
  const result = [];
  for (const item of Array.isArray(items) ? items : []) {
    const sourceId = String(item?.id || "").trim();
    if (!sourceId) continue;
    const values = item?.metadata?.[metaKey]?.[CUSTOM_AURAS_FIELD];
    for (const aura of normalizeCustomAuras(values)) {
      if (!aura.enabled) continue;
      result.push({
        ...aura,
        sourceId,
        sourceName: normalizedText(item?.name, "Token", 100),
        instanceId: `${sourceId}:${aura.id}`,
      });
    }
  }
  return result;
}

export function customAuraRule(aura = null) {
  if (!aura) return null;
  const effects = aura.pill?.enabled
    ? [{
      id: `${aura.id}:pill`,
      label: aura.pill.label,
      kind: aura.pill.kind,
      detail: aura.pill.detail,
      theme: {
        background: aura.style.fillColor,
        accent: aura.style.strokeColor,
      },
    }]
    : [];
  const triggers = [];
  if (aura.warnings?.start?.enabled) {
    triggers.push({
      id: `${aura.id}:turn-start`,
      event: "turn-start",
      targetMode: "actor",
      frequency: "once-per-turn",
      resolution: "informational",
      label: aura.warnings.start.label,
    });
  }
  if (aura.warnings?.end?.enabled) {
    triggers.push({
      id: `${aura.id}:turn-end`,
      event: "turn-end",
      targetMode: "actor",
      frequency: "once-per-turn",
      resolution: "informational",
      label: aura.warnings.end.label,
    });
  }
  return {
    zonePolicy: {
      membershipTargeting: {
        includeCaster: aura.targeting.includeSource === true,
        filter: aura.targeting.filter,
      },
    },
    effectPolicy: {
      mode: "while-inside",
      effects,
    },
    triggerPolicy: { triggers },
  };
}

export function customAuraTargetIds({
  aura = null,
  area = null,
  candidates = [],
  metaKey = "",
} = {}) {
  const rule = customAuraRule(aura);
  const hasPill = !!rule?.effectPolicy?.effects?.length;
  const hasWarnings = !!rule?.triggerPolicy?.triggers?.length;
  if (!aura || !area || (!hasPill && !hasWarnings)) return [];
  return areaMembershipTargetIds({
    sourceId: aura.sourceId,
    rule,
    area,
    candidates,
    metaKey,
  });
}

export function customAuraMembershipPlan({
  aura = null,
  desiredTargetIds = [],
  items = [],
  metaKey = "",
} = {}) {
  const rule = customAuraRule(aura);
  if (!aura || !rule?.effectPolicy?.effects?.length) {
    return { entering: [], leaving: [], operations: [] };
  }
  return areaMembershipPlan({
    instanceId: aura.instanceId,
    sourceId: aura.sourceId,
    rule,
    desiredTargetIds,
    items,
    metaKey,
    sourceName: aura.sourceName,
    defaultExpiry: { mode: "manual" },
    effectType: CUSTOM_AURA_EFFECT_TYPE,
  });
}

export function staleCustomAuraEffectRemovals(items = [], {
  activeInstanceIds = [],
  metaKey = "",
} = {}) {
  const active = new Set(
    (Array.isArray(activeInstanceIds) ? activeInstanceIds : [])
      .map((value) => String(value || "").trim())
      .filter(Boolean),
  );
  const removals = [];
  for (const item of Array.isArray(items) ? items : []) {
    const conditions = item?.metadata?.[metaKey]?.conditions;
    const instances = Array.isArray(conditions)
      ? conditions
      : Array.isArray(conditions?.instances) ? conditions.instances : [];
    for (const instance of instances) {
      if (
        instance?.active === false
        || String(instance?.type || "") !== CUSTOM_AURA_EFFECT_TYPE
        || active.has(String(instance?.parentEffectId || ""))
      ) {
        continue;
      }
      const instanceId = String(instance?.id || "").trim();
      if (item?.id && instanceId) removals.push({ itemId: item.id, instanceId });
    }
  }
  return removals;
}
