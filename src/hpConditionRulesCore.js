import { conditionKey } from "./conditionRulesCore.js";

export const ZERO_HP_UNCONSCIOUS_TYPE = "hp-zero";

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
    .filter((instance) => String(instance.type || "") === ZERO_HP_UNCONSCIOUS_TYPE)
    .map((instance) => String(instance.id || "").trim())
    .filter(Boolean);
  const shouldHave = shouldPCBeUnconsciousAtZeroHP(meta);
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
