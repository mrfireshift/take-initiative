import { spellEffectConditionOptions } from "./spellEffectCore.js";
import { isPreparedSpellCast } from "./spellCastPhaseCore.js";

const uniqueIds = (values = []) => Array.from(new Set(
  (Array.isArray(values) ? values : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean)
));

const clone = (value) => {
  if (value === undefined) return undefined;
  if (typeof globalThis.structuredClone === "function") return globalThis.structuredClone(value);
  return JSON.parse(JSON.stringify(value));
};

function manualActions(spell) {
  return Array.isArray(spell?.activeActions)
    ? spell.activeActions.filter((action) => String(action?.id || "").trim())
    : [];
}

function linkedEffectIds(effectInstances = []) {
  return new Set((Array.isArray(effectInstances) ? effectInstances : [])
    .filter((entry) => entry?.active !== false)
    .map((entry) => String(entry?.effectId || "").trim())
    .filter(Boolean));
}

function consumedEffectIds(action) {
  return uniqueIds(action?.consumesEffectIds);
}

export function getSpellOverviewActions({
  spell = null,
  castContext = null,
  casterId = "",
  targetIds = [],
  effectInstances = [],
} = {}) {
  if (!spell) return [];
  const actions = [];
  if (isPreparedSpellCast({
    spell,
    castContext,
    casterId,
    targetIds,
  })) {
    actions.push({
      id: "resolve-prepared",
      type: "resolve",
      buttonLabel: "Risolvi",
      subjectMode: "selected",
      requiresTargets: true,
    });
  }

  const availableEffectIds = linkedEffectIds(effectInstances);
  for (const action of manualActions(spell)) {
    const consumedIds = consumedEffectIds(action);
    if (consumedIds.length && !consumedIds.every((id) => availableEffectIds.has(id))) {
      continue;
    }
    actions.push({
      ...action,
      type: "manual",
      subjectMode: action.subjectMode === "caster" ? "caster" : "selected",
      requiresTargets: action.subjectMode !== "caster",
    });
  }
  return actions;
}

export function spellActiveActionPresentation(action, selectedCount = 0) {
  const count = Math.max(0, Math.floor(Number(selectedCount) || 0));
  const label = String(action?.buttonLabel || action?.label || "Attiva").trim() || "Attiva";
  const needsTargets = action?.subjectMode !== "caster";
  const singular = String(action?.countLabelSingular || "bersaglio").trim();
  const plural = String(action?.countLabelPlural || "bersagli").trim();
  return {
    disabled: needsTargets && count < 1,
    text: needsTargets ? `${label} · ${count} ${count === 1 ? singular : plural}` : label,
    title: needsTargets && count < 1
      ? String(action?.emptySelectionTitle || "Seleziona almeno un bersaglio.").trim()
      : String(action?.detail || label).trim(),
  };
}

export function buildSpellActiveActionPlan({
  spell = null,
  actionId = "",
  group = null,
  selectedTargetIds = [],
  appliedAt = null,
  casterName = "",
} = {}) {
  const action = manualActions(spell)
    .find((candidate) => String(candidate?.id || "") === String(actionId || ""));
  const casterId = String(group?.casterId || "").trim();
  const parentInstanceId = String(group?.instanceId || "").trim();
  const subjectIds = action?.subjectMode === "caster"
    ? uniqueIds([casterId])
    : uniqueIds(selectedTargetIds);
  const errors = [];
  if (!action) errors.push("action-required");
  if (!casterId) errors.push("caster-required");
  if (!parentInstanceId) errors.push("instance-required");
  if (!subjectIds.length) errors.push("targets-required");

  const effectInstances = Array.isArray(group?.effectInstances)
    ? group.effectInstances
    : [];
  const removals = [];
  for (const effectId of consumedEffectIds(action)) {
    const matches = effectInstances.filter((entry) =>
      entry?.active !== false
      && String(entry?.effectId || "") === effectId
    );
    if (!matches.length) {
      errors.push(`effect-unavailable:${effectId}`);
      continue;
    }
    for (const entry of matches) {
      const itemId = String(entry?.itemId || "").trim();
      const instanceId = String(entry?.instanceId || "").trim();
      if (itemId && instanceId) removals.push({ itemId, instanceId });
    }
  }

  if (errors.length) {
    return {
      valid: false,
      errors,
      action,
      operations: [],
      historyLabel: "",
    };
  }

  const operations = [];
  if (removals.length) {
    operations.push({
      type: "condition:remove-instances",
      removals,
    });
  }
  for (const effect of action.effects || []) {
    const label = String(effect?.label || "").trim();
    const kind = effect?.kind === "buff" || effect?.kind === "debuff"
      ? effect.kind
      : "";
    if (!label || !kind) continue;
    operations.push({
      type: "condition:add",
      targetIds: subjectIds,
      conditionName: label,
      options: spellEffectConditionOptions(effect, {
        sourceId: casterId,
        sourceName: String(casterName || "").trim(),
        ...(appliedAt ? { appliedAt: clone(appliedAt) } : {}),
      }, parentInstanceId),
    });
  }
  if (operations.some((operation) => operation.type === "condition:add")) {
    operations.push({
      type: "condition:automate",
      subjectIds,
    });
  }

  const spellName = String(spell?.displayName || spell?.name || group?.name || "Incantesimo");
  const actionLabel = String(action.buttonLabel || action.label || "Attivazione");
  return {
    valid: operations.length > 0,
    errors: operations.length ? [] : ["operations-required"],
    action,
    operations,
    subjectIds,
    historyLabel: `Attivazione: ${spellName} · ${actionLabel}`,
  };
}
