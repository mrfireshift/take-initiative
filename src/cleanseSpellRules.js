import { ID } from "./constants.js";
import { conditionKey } from "./conditionRulesCore.js";
import { exhaustionLevelFromInstances } from "./exhaustionCore.js";
import { MAX_HP_SUMMARY_PART_SUFFIX, maxHpModifierOf, maxHpSummaryLabel } from "./maxHpModifierCore.js";

// CAP-CLEANSE (docs/PIANO_AUTOMAZIONE_INCANTESIMI.md, PHB 2014 texts): spells that end pills and spells on one
// creature, Heal and Power Word Heal with their healing. The area command reads the live item at the confirmation
// and applies the plan: condition:remove-instances, spell:remove-requested and an HP write.
const META_KEY = `${ID}/meta`;
const SPELLS_KEY = `${ID}/spells`;

export const CLEANSE_SPELL_IDS = Object.freeze([
  "heal",
  // CAP-ALLOCATION: its share of the 700 hit points comes in the context (massHealCore.js).
  "mass-heal",
  "phb2014-parola-del-potere-guarire",
  "lesser-restoration",
  // CAP-MAXHP, lotto X3: one effect of the GM's choice, or a level of exhaustion.
  "greater-restoration",
  // CAP-MAXHP, lotto X4: the cures of the feast and the pill of its benefits.
  "heroes-feast",
  "dispel-magic",
  "remove-curse",
]);
export const CLEANSE_SPELL_ID_SET = new Set(CLEANSE_SPELL_IDS);
// The same on the lifecycle lane: the spell keeps its own pill, and its cast takes off what it ends.
export const CAST_CLEANSE_SPELL_ID_SET = new Set(["protection-from-poison"]);

// What Remove Curse ends on the creature it touches: each of these spells says so in its text. Modify Memory names it too, but
// what comes back is the memory, which the plugin does not track; a cursed item stays at the table.
const REMOVE_CURSE_ENDS = new Set(["bestow-curse", "geas", "phb2014-sortilegio"]);
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

// A disease: the pills of Contagion (contagionRules.js) and Harm's reduction of the maximum (CAP-MAXHP, decision M10).
export function isDiseaseInstance(instance) {
  return !!instance?.mechanics?.contagionDiseaseId
    || instance?.mechanics?.disease === true
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

const empty = () => ({ removeInstanceIds: [], endSpells: [], keptSpells: [], healing: 0, exhaustionLevel: null, addConditions: [],
  note: "" });

// The pill of Heroes' Feast's benefits on one creature, with its own roll.
export function heroesFeastCondition(roll) {
  const amount = Math.max(0, Math.floor(Number(roll) || 0));
  return {
    conditionName: "Banchetto degli eroi",
    options: {
      parentEffectId: "",
      spellId: "heroes-feast",
      spellName: "Banchetto degli eroi",
      effectId: "heroes-feast-benefits",
      effectDetail: `${maxHpSummaryLabel(amount)}. Curato da malattie e veleno; per 24 ore immune al veleno e a spaventato, `
        + "vantaggio ai TS di Saggezza, PF massimi e attuali aumentati (già compresi nel massimo). Quando finisce togli la pill: "
        + "il massimo torna com'era.",
      summaryParts: [
        { id: `heroes-feast${MAX_HP_SUMMARY_PART_SUFFIX}`, label: maxHpSummaryLabel(amount) },
        { id: "heroes-feast-immunities", label: "Imm. Veleno, Spaventato" },
        { id: "heroes-feast-wisdom", label: "Vant. TS Sag" },
      ],
      mechanics: {
        maxHp: { amount, raisesCurrent: true, stack: "heroes-feast" },
        conditionImmunities: { names: ["Spaventato", "Avvelenato"], label: "Banchetto degli eroi: immune a veleno e spaventato" },
        damageDefenses: { immunities: ["poison"] },
      },
      expiry: { mode: "manual" },
      manualRemoval: true,
    },
  };
}

// Why Mass Heal leaves a creature as it is: "unaffected" (a construct or an undead, by the token), "dead" (Morto), "".
// The area command gives it no share of the 700 on its own (massHealCore.js).
export function massHealSkipped(item) {
  if (cleanseHealingUnaffected(meta(item))) return "unaffected";
  return activeConditions(item).some((instance) => conditionKey(instance) === "morto") ? "dead" : "";
}

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
  // Mass Heal (decisions A-D2–A-D4 of 11/11/2026): its share of the 700, and Heal's conditions on every creature it
  // reaches, a share of 0 too; no effect on constructs and undead, and a dead creature stays dead.
  if (spellId === "mass-heal") {
    const skipped = massHealSkipped(item);
    if (skipped === "unaffected") {
      return { ...plan, note: `${item.name || "La creatura"}: nessun effetto su costrutti e non morti.` };
    }
    if (skipped === "dead") {
      return { ...plan, note: `${item.name || "La creatura"}: è morta, la cura non la riporta in vita.` };
    }
    plan.healing = Math.max(0, Math.floor(Number(context?.massHealShare) || 0));
    plan.removeInstanceIds = conditionIds(item, HEAL_ENDS, { diseases: true });
    return plan;
  }
  if (spellId === "lesser-restoration") {
    const chosen = String(context?.cleanseCondition || "").trim();
    plan.removeInstanceIds = chosen === "disease"
      ? activeConditions(item).filter(isDiseaseInstance).map((instance) => String(instance.id).trim())
      : chosen ? conditionIds(item, [conditionKey(chosen)]) : [];
    return plan;
  }
  // CAP-MAXHP, lotto X3 (2014): one level of exhaustion less, or one of these effects ended: one that charmed or petrified
  // the creature, one curse, one reduction of an ability score (the plugin does not keep them: a note), one reduction of the
  // hit point maximum, the strongest of its pills (decision M7: only a pill; the coordinator gives the maximum back).
  if (spellId === "greater-restoration") {
    const chosen = String(context?.cleanseCondition || "").trim();
    const name = item.name || "La creatura";
    if (chosen === "exhaustion") {
      const level = exhaustionLevelFromInstances(activeConditions(item).filter((instance) => instance?.exhaustionContribution !== true));
      if (level > 0) plan.exhaustionLevel = level - 1;
      else plan.note = `${name}: nessun livello di indebolimento da togliere.`;
      return plan;
    }
    if (chosen === "Affascinato" || chosen === "Pietrificato") {
      plan.removeInstanceIds = conditionIds(item, [conditionKey(chosen)]).slice(0, 1);
    } else if (chosen === "curse") {
      plan.endSpells = spellsOn(item)
        .filter((spell) => REMOVE_CURSE_ENDS.has(String(spell?.spellId || "").trim()))
        .slice(0, 1)
        .map((spell) => ({ instanceId: String(spell.instanceId).trim(), name: String(spell.name || spell.spellId), level: 0 }));
    } else if (chosen === "max-hp") {
      const strongest = activeConditions(item)
        .map((instance) => ({ instance, modifier: maxHpModifierOf(instance) }))
        .filter(({ modifier }) => modifier && modifier.amount < 0)
        .sort((left, right) => left.modifier.amount - right.modifier.amount)[0];
      if (strongest) plan.removeInstanceIds = [String(strongest.instance.id).trim()];
    } else if (chosen === "ability") {
      plan.note = `${name}: il plugin non tiene le riduzioni di caratteristica, toglila a mano.`;
      return plan;
    }
    if (!plan.removeInstanceIds.length && !plan.endSpells.length) plan.note = `${name}: niente da terminare per la scelta fatta.`;
    return plan;
  }
  // CAP-MAXHP, lotto X4 (2014): Heroes' Feast, on each creature that eats: every disease and poison cured, and for 24 hours
  // immune to poison and to being frightened, advantage on Wisdom saves (a label), the maximum and the hit points up by its
  // own 2d10 (decision M6, written in its row). Its pill ends by hand (M8); the coordinator writes the maximum.
  if (spellId === "heroes-feast") {
    plan.removeInstanceIds = activeConditions(item)
      .filter((instance) => isDiseaseInstance(instance) || conditionKey(instance) === conditionKey("Avvelenato"))
      .map((instance) => String(instance.id).trim());
    const roll = Number(context?.feastRoll);
    if (!Number.isInteger(roll) || roll < 2 || roll > 20) {
      plan.note = `${item.name || "La creatura"}: il tiro di 2d10 va da 2 a 20, il banchetto non le dà i suoi benefici.`;
      return plan;
    }
    plan.addConditions = [heroesFeastCondition(roll)];
    return plan;
  }
  // One poison: the plugin cannot tell them apart, so with more than one it takes the first listed and the others stay.
  if (spellId === "protection-from-poison") {
    plan.removeInstanceIds = conditionIds(item, [conditionKey("Avvelenato")]).slice(0, 1);
    return plan;
  }
  if (spellId === "remove-curse") {
    // The spell ends with its caster's concentration and its pills, as with Dispel Magic (spell:remove-requested).
    plan.endSpells = spellsOn(item)
      .filter((spell) => REMOVE_CURSE_ENDS.has(String(spell?.spellId || "").trim()))
      .map((spell) => ({ instanceId: String(spell.instanceId).trim(), name: String(spell.name || spell.spellId), level: 0 }));
    if (!plan.endSpells.length) plan.note = `${item.name || "La creatura"}: nessuna maledizione da terminare.`;
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
