import {
  areaMembershipPlan,
  areaMembershipTargetIds,
  staleAreaMembershipEffectRemovals,
} from "./spellAreaMembershipCore.js";
import { getSpellAreaRules } from "./spellAreaRules.js";
import { ID } from "./constants.js";

export const SPELL_AURA_META_KEY = `${ID}/spellAura`;

const uniqueIds = (values = []) => Array.from(new Set(
  (Array.isArray(values) ? values : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean)
));

export function getMobileAuraRule(spellId) {
  return getSpellAreaRules(spellId, { triggerType: "cast" })
    .find((rule) => rule.kind === "aura") || null;
}

export function collectActiveMobileAuras(items = [], {
  metaKey = "",
  spellsKey = "",
} = {}) {
  const auras = new Map();
  for (const target of Array.isArray(items) ? items : []) {
    const spells = target?.metadata?.[metaKey]?.[spellsKey];
    for (const spell of Array.isArray(spells) ? spells : []) {
      if (spell?.castContext?.mobileAura !== true) continue;
      const rule = getMobileAuraRule(spell?.spellId);
      const instanceId = String(spell?.instanceId || "").trim();
      const casterId = String(spell?.casterId || target?.id || "").trim();
      if (!rule || !instanceId || !casterId || auras.has(instanceId)) continue;
      auras.set(instanceId, {
        instanceId,
        spellId: String(spell.spellId || "").trim(),
        spellName: String(spell.name || spell.spellName || "").trim(),
        casterId,
        rule,
      });
    }
  }
  return [...auras.values()];
}

export function mobileAuraTargetIds({
  aura = null,
  area = null,
  candidates = [],
  metaKey = "",
} = {}) {
  if (!aura) return [];
  return areaMembershipTargetIds({
    sourceId: aura.casterId,
    rule: aura.rule,
    area,
    candidates,
    metaKey,
  });
}

export function mobileAuraMembershipPlan({
  aura = null,
  desiredTargetIds = [],
  items = [],
  metaKey = "",
  sourceName = "",
} = {}) {
  if (!aura) return { entering: [], leaving: [], operations: [] };
  return areaMembershipPlan({
    instanceId: aura.instanceId,
    sourceId: aura.casterId,
    rule: aura.rule,
    desiredTargetIds,
    items,
    metaKey,
    sourceName,
    defaultExpiry: { mode: "concentration" },
  });
}

export function staleMobileAuraEffectRemovals(items = [], {
  activeInstanceIds = [],
  auraEffectIds = [],
  metaKey = "",
} = {}) {
  return staleAreaMembershipEffectRemovals(items, {
    activeInstanceIds,
    effectIds: auraEffectIds,
    metaKey,
  });
}
