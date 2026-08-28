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
const REMINDER_EVENTS = new Set(["turn-start", "turn-end", "enter", "leave"]);
const REMINDER_RESOLUTIONS = new Set(["informational", "manual-save", "manual-damage", "manual-effect"]);
const REMINDER_ABILITIES = new Set(["str", "dex", "con", "int", "wis", "cha"]);
const REMINDER_DAMAGE_ON_SAVE = new Set(["half", "zero", "none"]);

const normalizedText = (value, fallback = "", maxLength = 160) =>
  (String(value || "").trim() || fallback).slice(0, maxLength);

export function createCustomAuraChildId(prefix = "item") {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch {}
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeCustomAuraPill(value = {}, fallbackLabel = "Pill", fallbackId = "") {
  const id = normalizedText(value?.id, fallbackId || createCustomAuraChildId("pill"), 120);
  const enabled = value?.enabled !== false;
  const label = normalizedText(value?.label, fallbackLabel, 100);
  const detail = normalizedText(value?.detail, "", 320);
  const kind = value?.kind === "debuff" ? "debuff" : "buff";
  return {
    id,
    enabled,
    label,
    detail,
    kind,
  };
}

export function normalizeCustomAuraReminder(
  value = {},
  fallbackAuraName = "Aura personalizzata",
  fallbackId = "",
) {
  const id = normalizedText(value?.id, fallbackId || createCustomAuraChildId("reminder"), 120);
  const enabled = value?.enabled !== false;
  const rawEvent = String(value?.event || value?.timing || "turn-start").trim().toLowerCase();
  const event = REMINDER_EVENTS.has(rawEvent) ? rawEvent : "turn-start";
  const rawResolution = String(value?.resolution || "informational").trim().toLowerCase();
  const resolution = REMINDER_RESOLUTIONS.has(rawResolution) ? rawResolution : "informational";

  let label = normalizedText(value?.label, "", 240);
  if (!label) {
    if (event === "turn-start") label = `Inizia il turno nell'aura ${fallbackAuraName}.`;
    else if (event === "turn-end") label = `Termina il turno nell'aura ${fallbackAuraName}.`;
    else if (event === "enter") label = `Entra nell'aura ${fallbackAuraName}.`;
    else if (event === "leave") label = `Esce dall'aura ${fallbackAuraName}.`;
  }

  const result = {
    id,
    enabled,
    event,
    label,
    resolution: resolution === "manual-effect" ? "manual-damage" : resolution,
  };

  if (result.resolution === "manual-save") {
    const rawAbility = String(value?.ability || "dex").trim().toLowerCase();
    result.ability = REMINDER_ABILITIES.has(rawAbility) ? rawAbility : "dex";
    const dcMode = value?.dcMode === "fixed" ? "fixed" : "caster";
    result.dcMode = dcMode;
    if (dcMode === "fixed") {
      const numDc = Number(value?.dc);
      result.dc = Number.isFinite(numDc) ? Math.max(1, Math.min(99, Math.round(numDc))) : 15;
    } else {
      result.dc = null;
    }
  }

  const damageDice = normalizedText(
    value?.damage?.dice || value?.damageDice || value?.damageFormula
      || (typeof value?.damage === "string" ? value.damage : ""),
    "",
    80,
  );
  const damageType = normalizedText(value?.damage?.type || value?.damageType || "", "", 80);
  if (damageDice) {
    const rawOnSave = String(value?.damage?.onSave || value?.damageOnSave || "half").trim().toLowerCase();
    const onSave = REMINDER_DAMAGE_ON_SAVE.has(rawOnSave) ? rawOnSave : "half";
    result.damage = {
      dice: damageDice,
      type: damageType || "danno",
      onSave,
      onFailed: "full",
      onPassed: onSave === "half" ? "half" : "zero",
      onImmune: "zero",
    };
  }

  const failureConditionName = normalizedText(
    value?.failureCondition?.condition
      || value?.failureCondition?.name
      || (typeof value?.failureCondition === "string" ? value.failureCondition : "")
      || value?.conditionOnFail,
    "",
    100,
  );
  if (failureConditionName && result.resolution === "manual-save") {
    result.failureCondition = {
      condition: failureConditionName,
      name: failureConditionName,
    };
  }

  return result;
}

export function normalizeCustomAuraDefinition(value = {}) {
  const name = normalizedText(value?.name, "Aura personalizzata", 100);
  const rawRadius = value?.radiusMeters;
  const numericRadius =
    typeof rawRadius === "number" ||
    (typeof rawRadius === "string" && rawRadius.trim() !== "")
      ? Number(rawRadius)
      : Number.NaN;
  const radiusMeters = Number.isFinite(numericRadius)
    ? Number(
        (
          Math.round(Math.max(0, Math.min(300, numericRadius)) / 1.5) * 1.5
        ).toFixed(10),
      )
    : 3;
  const style = normalizeAoEStyle({
    ...DEFAULT_CUSTOM_AURA_STYLE,
    ...(value?.style && typeof value.style === "object" ? value.style : {}),
  });
  const filter = TARGET_FILTERS.has(String(value?.targeting?.filter || ""))
    ? String(value.targeting.filter)
    : "all";

  let pills = [];
  if (Array.isArray(value?.pills)) {
    pills = value.pills.map((p, idx) => normalizeCustomAuraPill(p, name, `pill-${idx + 1}`));
  } else if (value?.pill && typeof value.pill === "object") {
    pills = [normalizeCustomAuraPill({ ...value.pill, id: value.pill.id || "pill" }, name, "pill")];
  }

  let reminders = [];
  if (Array.isArray(value?.reminders)) {
    reminders = value.reminders.map((r, idx) => normalizeCustomAuraReminder(r, name, `reminder-${idx + 1}`));
  } else {
    if (value?.warnings?.start) {
      reminders.push(normalizeCustomAuraReminder({
        id: "warning-start",
        enabled: value.warnings.start.enabled === true,
        event: "turn-start",
        label: value.warnings.start.label || `Inizia il turno nell'aura ${name}.`,
        resolution: "informational",
      }, name, "warning-start"));
    }
    if (value?.warnings?.end) {
      reminders.push(normalizeCustomAuraReminder({
        id: "warning-end",
        enabled: value.warnings.end.enabled === true,
        event: "turn-end",
        label: value.warnings.end.label || `Termina il turno nell'aura ${name}.`,
        resolution: "informational",
      }, name, "warning-end"));
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

export function normalizeCustomAura(value = {}) {
  const id = normalizedText(value?.id, "", 120);
  let presetRef = undefined;
  if (value?.presetRef && typeof value.presetRef === "object" && value.presetRef.presetId) {
    presetRef = {
      presetId: normalizedText(value.presetRef.presetId, "", 120),
      revision: Math.max(1, Math.floor(Number(value.presetRef.revision) || 1)),
    };
  }

  return {
    id,
    enabled: value?.enabled !== false,
    ...normalizeCustomAuraDefinition(value),
    ...(presetRef ? { presetRef } : {}),
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
  const effects = (Array.isArray(aura.pills) ? aura.pills : [])
    .filter((pill) => pill?.enabled === true)
    .map((pill) => ({
      id: `${aura.id}:${pill.id}`,
      label: pill.label,
      kind: pill.kind,
      detail: pill.detail,
      theme: {
        background: aura.style.fillColor,
        accent: aura.style.strokeColor,
      },
    }));

  const triggers = (Array.isArray(aura.reminders) ? aura.reminders : [])
    .filter((reminder) => reminder?.enabled === true)
    .map((reminder) => {
      const triggerId = `${aura.id}:${reminder.id}`;
      const resolution = reminder.resolution === "manual-damage"
        ? "manual-effect"
        : (reminder.resolution || "informational");
      const trigger = {
        id: triggerId,
        event: reminder.event,
        targetMode: "actor",
        frequency: "once-per-turn",
        resolution,
        label: reminder.label,
        effectType: CUSTOM_AURA_EFFECT_TYPE,
      };
      if (resolution === "manual-save") {
        trigger.ability = reminder.ability || "dex";
        if (reminder.dcMode === "fixed" && reminder.dc !== null) {
          trigger.dc = reminder.dc;
          trigger.resolutionData = { dc: reminder.dc };
        }
      }
      if (reminder.damage) {
        trigger.damage = { ...reminder.damage };
        trigger.resolutionData = {
          ...(trigger.resolutionData || {}),
          damage: { ...reminder.damage },
        };
      }
      if (reminder.failureCondition) {
        trigger.failureCondition = { ...reminder.failureCondition };
        trigger.resolutionData = {
          ...(trigger.resolutionData || {}),
          failureCondition: { ...reminder.failureCondition },
        };
      }
      return trigger;
    });

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
  activeEffectKeys = null,
  metaKey = "",
} = {}) {
  const active = new Set(
    (Array.isArray(activeInstanceIds) ? activeInstanceIds : [])
      .map((value) => String(value || "").trim())
      .filter(Boolean),
  );
  const validEffectKeys = activeEffectKeys instanceof Set
    ? activeEffectKeys
    : Array.isArray(activeEffectKeys)
      ? new Set(activeEffectKeys.map((value) => String(value || "").trim()).filter(Boolean))
      : null;
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
      ) {
        continue;
      }
      const parentEffectId = String(instance?.parentEffectId || "").trim();
      const effectId = String(instance?.effectId || "").trim();
      const instanceId = String(instance?.id || "").trim();
      if (!item?.id || !instanceId) continue;
      if (!active.has(parentEffectId)) {
        removals.push({ itemId: item.id, instanceId });
      } else if (validEffectKeys && !validEffectKeys.has(`${parentEffectId}:${effectId}`)) {
        removals.push({ itemId: item.id, instanceId });
      }
    }
  }
  return removals;
}
