export const QUICK_ACTION_VERSION = 1;
export const MAX_QUICK_ACTIONS = 12;

export const QUICK_ACTION_KINDS = Object.freeze([
  "spell",
  "condition",
]);

export const QUICK_ACTION_TARGET_MODES = Object.freeze([
  "self",
  "selection",
]);

export const QUICK_ACTION_SPELL_WORKFLOWS = Object.freeze([
  "spell",
  "area",
]);

export const QUICK_ACTION_EXPIRY_MODES = Object.freeze([
  "manual",
  "rounds",
  "turn-start",
  "turn-end",
]);

const kindSet = new Set(QUICK_ACTION_KINDS);
const targetModeSet = new Set(QUICK_ACTION_TARGET_MODES);
const spellWorkflowSet = new Set(QUICK_ACTION_SPELL_WORKFLOWS);
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
    const workflow = spellWorkflowSet.has(value.workflow)
      ? value.workflow
      : "spell";
    return {
      version: QUICK_ACTION_VERSION,
      id,
      label,
      kind,
      spellId,
      workflow,
      targetMode,
      slotLevel: optionalInteger(value.slotLevel, 1, 9),
      turns: optionalInteger(value.turns, 1, 999),
      applyAutomations: value.applyAutomations !== false,
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

export function sanitizeQuickActions(values) {
  const source = Array.isArray(values) ? values : [];
  const seen = new Set();
  const actions = [];
  for (const value of source) {
    const action = sanitizeQuickAction(value);
    if (!action || seen.has(action.id)) continue;
    seen.add(action.id);
    actions.push(action);
    if (actions.length >= MAX_QUICK_ACTIONS) break;
  }
  return actions;
}

export function findQuickAction(profile, actionId) {
  const wantedId = sanitizeId(actionId);
  if (!wantedId) return null;
  return sanitizeQuickActions(profile?.quickActions)
    .find((action) => action.id === wantedId) || null;
}

export function quickActionPanel(action) {
  const normalized = sanitizeQuickAction(action);
  if (!normalized) return "";
  if (normalized.kind === "condition") return "conditions";
  return normalized.workflow === "area" ? "quick-hp" : "spells";
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
