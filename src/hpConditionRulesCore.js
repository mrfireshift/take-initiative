import { conditionKey } from "./conditionRulesCore.js";

export const ZERO_HP_UNCONSCIOUS_TYPE = "hp-zero";
// The type a reminder's damage gave its Privo di sensi before it used the one above: still the automatic pill.
const LEGACY_ZERO_HP_UNCONSCIOUS_TYPES = new Set([ZERO_HP_UNCONSCIOUS_TYPE, "zero-hp-unconscious"]);

export function shouldPCBeUnconsciousAtZeroHP(meta = {}) {
  const attitude = String(meta?.attitude || "").trim().toLocaleLowerCase("it");
  const hp = Number(meta?.hp);
  const hpMax = Number(meta?.hpMax);
  return attitude === "pc"
    && Number.isFinite(hp)
    && Number.isFinite(hpMax)
    && hpMax > 0
    && hp <= 0;
}

export function resolveZeroHPUnconsciousAction(meta = {}, instances = []) {
  const automaticIds = (Array.isArray(instances) ? instances : [])
    .filter((instance) => instance?.active !== false)
    .filter((instance) => conditionKey(instance) === "privo di sensi")
    .filter((instance) => LEGACY_ZERO_HP_UNCONSCIOUS_TYPES.has(String(instance.type || "")))
    .map((instance) => String(instance.id || "").trim())
    .filter(Boolean);
  // A PC dead by its death saves ("Morto") is no longer unconscious: that pill takes the place of this one.
  const dead = (Array.isArray(instances) ? instances : [])
    .some((instance) => instance?.active !== false && conditionKey(instance) === "morto");
  const shouldHave = shouldPCBeUnconsciousAtZeroHP(meta) && !dead;
  return {
    shouldHave,
    add: shouldHave && automaticIds.length === 0,
    removeInstanceIds: shouldHave ? [] : automaticIds,
  };
}

export function resolveDamageEndsConditionRemovals(instances = []) {
  return (Array.isArray(instances) ? instances : [])
    .filter((instance) => instance?.active !== false)
    .filter((instance) => instance?.mechanics?.endsOnDamage === true || instance?.endsOnDamage === true)
    .map((instance) => String(instance.id || "").trim())
    .filter(Boolean);
}
