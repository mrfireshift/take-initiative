import {
  areaMembershipPlan,
  areaMembershipTargetIds,
  staleAreaMembershipEffectRemovals,
} from "./spellAreaMembershipCore.js";
import { getSpellAreaRules } from "./spellAreaRules.js";
import { resolveSpellEffect } from "./spellMechanicsCore.js";
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

const SPIRIT_SHROUD_ID = "tasha-sudario-spirituale";
const SPIRIT_SHROUD_DAMAGE_TYPES = new Set(["radiosi", "necrotici", "freddo"]);

function castContextForActiveSpell(spell) {
  const context = spell?.castContext && typeof spell.castContext === "object"
    ? { ...spell.castContext }
    : {};
  if (context.slotLevel === undefined && Number.isFinite(Number(spell?.slotLevel))) {
    context.slotLevel = Math.floor(Number(spell.slotLevel));
  }
  if (!String(context.choice || "").trim()) {
    const choice = String(
      spell?.choiceValue || spell?.variant || spell?.choice?.value || "",
    ).trim();
    if (choice) context.choice = choice;
  }
  return context;
}

function resolvedMobileAuraRule(aura) {
  const rule = aura?.rule;
  if (aura?.spellId !== SPIRIT_SHROUD_ID || !rule) return rule;
  const effect = rule.effectPolicy?.effect;
  if (!effect) return rule;
  const rawChoice = String(aura?.castContext?.choice || "")
    .trim()
    .toLocaleLowerCase("it");
  const type = SPIRIT_SHROUD_DAMAGE_TYPES.has(rawChoice)
    ? rawChoice
    : String(effect.mechanics?.damageBonus?.type || "danni").trim();
  const resolved = resolveSpellEffect({
    ...effect,
    mechanics: {
      ...(effect.mechanics || {}),
      damageBonus: {
        ...(effect.mechanics?.damageBonus || {}),
        type,
      },
    },
  }, aura.castContext || {});
  const damageDice = String(resolved.mechanics?.damageBonus?.dice || "1d8").trim();
  return {
    ...rule,
    effectPolicy: {
      ...rule.effectPolicy,
      effect: {
        ...resolved,
        detail: `Quando il caster colpisce una creatura entro 3 metri, l'attacco infligge +${damageDice} danni ${type}; bonus e applicazione restano manuali al tavolo.`,
      },
    },
  };
}

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
      const castContext = castContextForActiveSpell(spell);
      const aura = {
        instanceId,
        spellId: String(spell.spellId || "").trim(),
        spellName: String(spell.name || spell.spellName || "").trim(),
        casterId,
        castContext,
        rule,
      };
      auras.set(instanceId, {
        ...aura,
        rule: resolvedMobileAuraRule(aura),
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
    rule: resolvedMobileAuraRule(aura),
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
