export const QUICK_ACTION_VERSION = 2;
export const MAX_QUICK_ACTIONS = 12;

export const QUICK_ACTION_KINDS = Object.freeze([
  "spell",
  "condition",
  "feature",
]);

export const QUICK_ACTION_TARGET_MODES = Object.freeze([
  "self",
  "selection",
]);

export const QUICK_ACTION_SPELL_LAUNCH_MODES = Object.freeze([
  "auto",
  "review",
]);

export const QUICK_ACTION_EXPIRY_MODES = Object.freeze([
  "manual",
  "rounds",
  "turn-start",
  "turn-end",
]);

const kindSet = new Set(QUICK_ACTION_KINDS);
const targetModeSet = new Set(QUICK_ACTION_TARGET_MODES);
const spellLaunchModeSet = new Set(QUICK_ACTION_SPELL_LAUNCH_MODES);
const expiryModeSet = new Set(QUICK_ACTION_EXPIRY_MODES);

function shortText(value, maxLength) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function optionalInteger(value, min, max) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function sanitizeId(value) {
  return shortText(value, 96).replace(/[^a-zA-Z0-9:_-]/g, "");
}

export function sanitizeQuickAction(value) {
  if (!value || typeof value !== "object") return null;

  const id = sanitizeId(value.id);
  const kind = kindSet.has(value.kind) ? value.kind : "";
  const label = shortText(value.label, 80);
  if (!id || !kind || !label) return null;

  const targetMode = targetModeSet.has(value.targetMode)
    ? value.targetMode
    : "selection";

  if (kind === "spell") {
    const spellId = shortText(value.spellId, 160);
    if (!spellId) return null;
    const legacyLaunchMode = value.workflow === "area" ? "review" : "auto";
    const launchMode = spellLaunchModeSet.has(value.launchMode)
      ? value.launchMode
      : legacyLaunchMode;
    return {
      version: QUICK_ACTION_VERSION,
      id,
      label,
      kind,
      spellId,
      targetMode,
      slotLevel: optionalInteger(value.slotLevel, 1, 9),
      turns: optionalInteger(value.turns, 1, 999),
      applyAutomations: value.applyAutomations !== false,
      launchMode,
    };
  }

  if (kind === "feature") {
    const featureId = shortText(value.featureId, 220);
    if (!featureId) return null;
    return {
      version: QUICK_ACTION_VERSION,
      id,
      label,
      kind,
      featureId,
      targetMode,
    };
  }

  const conditionName = shortText(value.conditionName, 80);
  if (!conditionName) return null;
  const expiryMode = expiryModeSet.has(value.expiryMode)
    ? value.expiryMode
    : "manual";
  return {
    version: QUICK_ACTION_VERSION,
    id,
    label,
    kind,
    conditionName,
    targetMode,
    expiryMode,
    duration: expiryMode === "manual"
      ? null
      : optionalInteger(value.duration, 1, 999) ?? 1,
  };
}

export function sanitizeQuickActions(values, { limit = MAX_QUICK_ACTIONS } = {}) {
  const source = Array.isArray(values) ? values : [];
  const maximum = Math.max(1, Math.min(256, Math.floor(Number(limit) || MAX_QUICK_ACTIONS)));
  const seen = new Set();
  const actions = [];
  for (const value of source) {
    const action = sanitizeQuickAction(value);
    if (!action || seen.has(action.id)) continue;
    seen.add(action.id);
    actions.push(action);
    if (actions.length >= maximum) break;
  }
  return actions;
}

export function findQuickAction(profile, actionId) {
  const wantedId = sanitizeId(actionId);
  if (!wantedId) return null;
  return sanitizeQuickActions(profile?.quickActions)
    .find((action) => action.id === wantedId) || null;
}

export function quickActionInitialTargetIds(action, sourceId, selectedIds = []) {
  const normalized = sanitizeQuickAction(action);
  if (!normalized) return [];
  const normalizedSourceId = String(sourceId || "").trim();
  if (normalized.targetMode === "self") {
    return normalizedSourceId ? [normalizedSourceId] : [];
  }
  return Array.from(new Set(
    (Array.isArray(selectedIds) ? selectedIds : [])
      .map((id) => String(id || "").trim())
      .filter(Boolean)
  ));
}

export function quickActionDirectTargetIds(action, sourceId, selectedIds = []) {
  const normalized = sanitizeQuickAction(action);
  if (!normalized) return [];
  const initialIds = quickActionInitialTargetIds(
    normalized,
    sourceId,
    selectedIds,
  );
  if (normalized.targetMode === "self") return initialIds;
  return initialIds.length === 1 ? initialIds : [];
}
