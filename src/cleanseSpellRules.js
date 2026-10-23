import { ID } from "./constants.js";
import { conditionKey } from "./conditionRulesCore.js";

// CAP-CLEANSE (docs/PIANO_AUTOMAZIONE_INCANTESIMI.md, PHB 2014 texts): spells that end pills and spells on one
// creature, Heal and Power Word Heal with their healing. The area command reads the live item at the confirmation
// and applies the plan: condition:remove-instances, spell:remove-requested and an HP write.
const META_KEY = `${ID}/meta`;
const SPELLS_KEY = `${ID}/spells`;

export const CLEANSE_SPELL_IDS = Object.freeze([
  "heal",
  "phb2014-parola-del-potere-guarire",
  "lesser-restoration",
  "dispel-magic",
]);
export const CLEANSE_SPELL_ID_SET = new Set(CLEANSE_SPELL_IDS);

const HEAL_ENDS = Object.freeze(["accecato", "assordato"]);
const POWER_WORD_HEAL_ENDS = Object.freeze(["affascinato", "paralizzato", "spaventato", "stordito"]);

function meta(item) {
  return item?.metadata?.[META_KEY] || {};
}

function activeConditions(item) {
  const conditions = meta(item).conditions;
  const instances = Array.isArray(conditions) ? conditions : Array.isArray(conditions?.instances) ? conditions.instances : [];
  return instances.filter((instance) => instance?.active !== false && String(instance?.id || "").trim());
}

// A disease: the pills of Contagion (contagionRules.js).
export function isDiseaseInstance(instance) {
  return !!instance?.mechanics?.contagionDiseaseId
    || String(instance?.effectId || "").trim().startsWith("contagion");
}

// Heal and Power Word Heal have no effect on constructs and undead (the creature type on the token).
export function cleanseHealingUnaffected(value = {}) {
  const type = String(value?.creatureType || value?.creatureTypeName || value?.creatureTypeLabel || "")
    .trim().toLocaleLowerCase("it");
  return /costrutt|construct|non.?mort|undead/u.test(type);
}

function conditionIds(item, keys, { diseases = false } = {}) {
  const wanted = new Set(keys);
  return activeConditions(item)
    .filter((instance) => wanted.has(conditionKey(instance)) || (diseases && isDiseaseInstance(instance)))
    .map((instance) => String(instance.id).trim());
}

// The spells on the creature: its spell instances, the zones it owns on the map left out.
function spellsOn(item) {
  const spells = meta(item)[SPELLS_KEY];
  return (Array.isArray(spells) ? spells : [])
    .filter((spell) => String(spell?.instanceId || "").trim() && spell?.castContext?.staticZoneOwner !== true);
}

function spellLevel(spell, levelOf) {
  const cast = Number(spell?.castContext?.slotLevel);
  if (Number.isInteger(cast) && cast >= 0) return cast;
  const catalog = Number(typeof levelOf === "function" ? levelOf(String(spell?.spellId || "").trim()) : NaN);
  return Number.isInteger(catalog) && catalog >= 0 ? catalog : 0;
}

const empty = () => ({ removeInstanceIds: [], endSpells: [], keptSpells: [], healing: 0, note: "" });

export function planCleanseTarget({ spellId = "", item = null, slotLevel = null, context = {}, levelOf = null } = {}) {
  const plan = empty();
  const value = meta(item);
  if (!item?.id) return plan;
  const slot = Math.max(0, Math.floor(Number(slotLevel) || 0));
  if (spellId === "heal" || spellId === "phb2014-parola-del-potere-guarire") {
    if (cleanseHealingUnaffected(value)) {
      return { ...plan, note: `${item.name || "La creatura"}: nessun effetto su costrutti e non morti.` };
    }
    const hp = Number(value.hp);
    const hpMax = Number(value.hpMax);
    if (Number.isFinite(hp) && Number.isFinite(hpMax) && hpMax > 0) {
      plan.healing = spellId === "heal"
        ? 70 + 10 * Math.max(0, Math.max(6, slot) - 6)
        : Math.max(0, Math.floor(hpMax) - Math.floor(Math.min(hp, hpMax)));
    }
    plan.removeInstanceIds = spellId === "heal"
      ? conditionIds(item, HEAL_ENDS, { diseases: true })
      : conditionIds(item, POWER_WORD_HEAL_ENDS);
    return plan;
  }
  if (spellId === "lesser-restoration") {
    const chosen = String(context?.cleanseCondition || "").trim();
    plan.removeInstanceIds = chosen === "disease"
      ? activeConditions(item).filter(isDiseaseInstance).map((instance) => String(instance.id).trim())
      : chosen ? conditionIds(item, [conditionKey(chosen)]) : [];
    return plan;
  }
  if (spellId === "dispel-magic") {
    // 3rd level or lower ends; a higher slot ends the spells up to its level; the others need the check.
    const limit = Math.max(3, slot);
    const passed = String(context?.dispelCheck || "").trim() === "passed";
    for (const spell of spellsOn(item)) {
      const level = spellLevel(spell, levelOf);
      const entry = { instanceId: String(spell.instanceId).trim(), name: String(spell.name || spell.spellId || "Incantesimo"), level };
      if (level <= limit || passed) plan.endSpells.push(entry);
      else plan.keptSpells.push({ ...entry, dc: 10 + level });
    }
    if (plan.keptSpells.length) {
      const kept = plan.keptSpells.map((spell) => `${spell.name} (CD ${spell.dc})`).join(", ");
      plan.note = String(context?.dispelCheck || "").trim() === "failed"
        ? `${item.name || "La creatura"}: restano ${kept}, la prova è fallita.`
        : `${item.name || "La creatura"}: restano ${kept}; se la prova del caster riesce, terminali dal registro degli incantesimi attivi.`;
    }
    return plan;
  }
  return plan;
}
