import {
  areaMembershipPlan,
  areaMembershipTargetIds,
  staleAreaMembershipEffectRemovals,
} from "./spellAreaMembershipCore.js";
import { getSpellAreaRules } from "./spellAreaRules.js";
import { ID } from "./constants.js";

export const SPELL_AURA_META_KEY = `${ID}/spellAura`;

// Il descriptor personale resta nel catalogo per il pannello/fallback, ma
// Aura di Vita ora proietta la stessa pill tramite la membership condivisa.
const MOBILE_AURA_LEGACY_CASTER_EFFECT_IDS = Object.freeze({
  "phb2014-aura-di-vita": Object.freeze(["aura-of-life"]),
});

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

export function mobileAuraLegacyCasterEffectRemovals({
  aura = null,
  items = [],
  metaKey = "",
} = {}) {
  const effectIds = MOBILE_AURA_LEGACY_CASTER_EFFECT_IDS[aura?.spellId] || [];
  const targeting = aura?.rule?.zonePolicy?.membershipTargeting
    || aura?.rule?.targeting
    || {};
  const casterId = String(aura?.casterId || "").trim();
  const parentEffectId = String(aura?.instanceId || "").trim();
  if (
    !effectIds.length
    || aura?.rule?.effectPolicy?.mode !== "while-inside"
    || targeting.includeCaster !== true
    || !casterId
    || !parentEffectId
  ) return [];
  const effectIdSet = new Set(effectIds);
  return (Array.isArray(items) ? items : [])
    .filter((item) => String(item?.id || "").trim() === casterId)
    .flatMap((item) => {
      const instances = item?.metadata?.[metaKey]?.conditions?.instances;
      return (Array.isArray(instances) ? instances : [])
        .filter((instance) => (
          instance?.active !== false
          && String(instance?.parentEffectId || "").trim() === parentEffectId
          && effectIdSet.has(String(instance?.effectId || "").trim())
          && String(instance?.id || "").trim()
        ))
        .map((instance) => ({
          itemId: casterId,
          instanceId: String(instance.id).trim(),
        }));
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
