export function spellEffectConditionOptions(effect, conditionOptions = {}, parentEffectId = "") {
  return {
    ...conditionOptions,
    parentEffectId,
    type: "spell",
    effectId: String(effect?.id || ""),
    effectKind: effect?.kind === "buff" || effect?.kind === "debuff" ? effect.kind : "",
    effectDetail: String(effect?.detail || ""),
    manualRemoval: effect?.manualRemoval === true,
    ...(effect?.endsParentOnRemoval === true ? { endsParentOnRemoval: true } : {}),
    ...(effect?.expiry ? { expiry: effect.expiry } : {}),
  };
}
