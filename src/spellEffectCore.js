import { normalizeDeferredEffects } from "./spellLifecycleContracts.js";

function optionalSnapshotDC(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.max(0, Math.min(99, Math.round(number)))
    : null;
}

function saveReminderWithSnapshotDC(value, dc) {
  const apply = (reminder) => {
    if (!reminder || typeof reminder !== "object") return reminder;
    return {
      ...reminder,
      ...(optionalSnapshotDC(reminder.dc) === null ? { dc } : {}),
    };
  };
  return Array.isArray(value) ? value.map(apply) : apply(value);
}

export function spellEffectConditionName(effect) {
  return String(effect?.conditionName || effect?.label || "").trim();
}

export function spellEffectConditionOptions(effect, conditionOptions = {}, parentEffectId = "") {
  const transientDC = optionalSnapshotDC(
    conditionOptions?.spellSaveDC ?? conditionOptions?.saveDC,
  );
  const {
    spellSaveDC: _spellSaveDC,
    saveDC: _saveDC,
    ...persistedConditionOptions
  } = conditionOptions && typeof conditionOptions === "object"
    ? conditionOptions
    : {};
  const resolvedParentEffectId = Object.prototype.hasOwnProperty.call(effect || {}, "parentEffectId")
    ? String(effect.parentEffectId || "")
    : parentEffectId;
  return {
    ...persistedConditionOptions,
    parentEffectId: resolvedParentEffectId,
    type: "spell",
    effectId: String(effect?.id || ""),
    effectKind: effect?.kind === "buff" || effect?.kind === "debuff" ? effect.kind : "",
    ...(String(effect?.displayLabel || "").trim()
      ? { displayLabel: String(effect.displayLabel).trim() }
      : {}),
    effectDetail: String(effect?.detail || ""),
    ...(effect?.mechanics && typeof effect.mechanics === "object"
      ? { mechanics: effect.mechanics }
      : {}),
    ...(Array.isArray(effect?.summaryParts)
      ? { summaryParts: effect.summaryParts }
      : {}),
    ...(effect?.mapVisible === false ? { mapVisible: false } : {}),
    magical: true,
    ...(effect?.saveReminder && typeof effect.saveReminder === "object"
      ? {
        saveReminder: transientDC === null
          ? effect.saveReminder
          : saveReminderWithSnapshotDC(effect.saveReminder, transientDC),
      }
      : {}),
    ...(normalizeDeferredEffects(effect?.deferredEffects ?? effect?.deferredEffect).length
      ? {
        deferredEffects: normalizeDeferredEffects(
          effect?.deferredEffects ?? effect?.deferredEffect,
        ),
      }
      : {}),
    manualRemoval: effect?.manualRemoval === true,
    ...(effect?.endsParentOnRemoval === true ? { endsParentOnRemoval: true } : {}),
    ...(effect?.parentRemoval === "target" || effect?.parentRemoval === "spell"
      ? { parentRemoval: effect.parentRemoval }
      : {}),
    ...(effect?.expiry ? { expiry: effect.expiry } : {}),
  };
}
