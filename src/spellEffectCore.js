import { normalizeDeferredEffects } from "./spellLifecycleContracts.js";

export function spellEffectConditionOptions(effect, conditionOptions = {}, parentEffectId = "") {
  const resolvedParentEffectId = Object.prototype.hasOwnProperty.call(effect || {}, "parentEffectId")
    ? String(effect.parentEffectId || "")
    : parentEffectId;
  return {
    ...conditionOptions,
    parentEffectId: resolvedParentEffectId,
    type: "spell",
    effectId: String(effect?.id || ""),
    effectKind: effect?.kind === "buff" || effect?.kind === "debuff" ? effect.kind : "",
    effectDetail: String(effect?.detail || ""),
    ...(effect?.mechanics && typeof effect.mechanics === "object"
      ? { mechanics: effect.mechanics }
      : {}),
    ...(effect?.saveReminder && typeof effect.saveReminder === "object"
      ? { saveReminder: effect.saveReminder }
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
