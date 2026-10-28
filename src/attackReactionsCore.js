import { ID } from "./constants.js";
import { damageTypeLabel } from "./damageDefensesCore.js";
import { hasReactionUsed } from "./reactionTrackerCore.js";
import { spellbookGroupsForProfile } from "./spellbookCatalog.js";
import { speciesFeaturesForProfile } from "./speciesTraitCore.js";
import { totalCharacterLevel } from "./abilityModifiersCore.js";

// CAP-REACTION, lotto 1 (PHB and Xanathar 2014): what an attack recorded in the PC attack console or the Boss console
// meets on its target, shown under the target (the same place as Mirror Image):
// - Sanctuary: the attacker saves on Wisdom first, against the DC of the warding caster;
// - Fire Shield, Shadow of Moil: an attacker that hits takes the shield's 2d8 (the retaliation of the pill's mechanics);
// - the reactions the target can still cast: Shield when hit, Absorb Elements on its damage types, Hellish Rebuke
//   when damaged.
const META_KEY = `${ID}/meta`;
const SPELLS_KEY = `${ID}/spells`;
const text = (value) => String(value ?? "").trim();

export const ABSORB_ELEMENTS_SPELL_ID = "xanathar-assorbire-elementi";
// Absorb Elements' choice (its Italian id in spells-srd.js) for each damage type it absorbs.
export const ABSORB_ELEMENTS_CHOICES = Object.freeze({
  acid: "acido", cold: "freddo", fire: "fuoco", lightning: "fulmine", thunder: "tuono",
});

function metaOf(item) {
  return item?.metadata?.[META_KEY] || {};
}

function activePills(item) {
  const value = metaOf(item).conditions;
  const instances = Array.isArray(value) ? value : Array.isArray(value?.instances) ? value.instances : [];
  return instances.filter((instance) => instance && instance.active !== false);
}

function hasActiveSpell(item, spellId) {
  const spells = Array.isArray(metaOf(item)[SPELLS_KEY]) ? metaOf(item)[SPELLS_KEY] : [];
  return spells.some((spell) => text(spell?.spellId) === spellId);
}

// The spells the creature can cast now: its prepared book, its quick actions and its species' innate spells.
export function creatureCastableSpellIds(item) {
  const card = metaOf(item).initiativeCard || {};
  const ids = new Set();
  for (const group of spellbookGroupsForProfile(card)) {
    for (const spell of group.spells || []) if (spell.prepared !== false && text(spell.id)) ids.add(text(spell.id));
  }
  for (const action of Array.isArray(card.quickActions) ? card.quickActions : []) {
    if (action?.kind === "spell" && text(action.spellId)) ids.add(text(action.spellId));
  }
  for (const feature of speciesFeaturesForProfile(card, totalCharacterLevel(card.characterBuild))) {
    if (text(feature?.innateSpell?.spellId)) ids.add(text(feature.innateSpell.spellId));
  }
  return ids;
}

// attack: { roll (an attack roll), melee, outcome ("hit", "critical", "miss", "failed", "passed"), damageTypes }.
export function attackTargetReactions({ target = null, attacker = null, attack = {}, items = [] } = {}) {
  if (!target) return { sanctuary: null, retaliations: [], offers: [] };
  const byId = new Map((Array.isArray(items) ? items : []).filter((item) => item?.id).map((item) => [item.id, item]));
  const outcome = text(attack.outcome);
  const hit = outcome === "hit" || outcome === "critical";
  const damaging = hit || outcome === "failed" || outcome === "passed";
  const attackerName = text(attacker?.name) || "L'attaccante";
  const pills = activePills(target);

  const sanctuaryPill = pills.find((pill) => pill.mechanics?.sanctuary === true);
  const casterCard = sanctuaryPill ? metaOf(byId.get(text(sanctuaryPill.sourceId))).initiativeCard || {} : {};
  const dc = Number.isFinite(Number(casterCard.spellSaveDC)) && Number(casterCard.spellSaveDC) > 0
    ? Math.floor(Number(casterCard.spellSaveDC)) : null;
  const sanctuary = sanctuaryPill ? {
    text: `Santuario: ${attackerName} tira prima un TS Saggezza ${dc ? `CD ${dc}` : "(CD del caster)"}; se fallisce, sceglie un altro bersaglio o perde l'attacco.`,
  } : null;

  const retaliations = hit ? pills.filter((pill) => pill.mechanics?.retaliation
    && (pill.mechanics.retaliation.meleeOnly !== true || attack.melee === true)).map((pill) => {
    const rule = pill.mechanics.retaliation;
    const typeLabel = damageTypeLabel(rule.type);
    return {
      instanceId: text(pill.id),
      label: text(rule.label) || "Ritorsione",
      dice: text(rule.dice),
      type: text(rule.type),
      typeLabel,
      text: `${text(rule.label) || "Ritorsione"}: ${attackerName} subisce ${text(rule.dice)} danni da ${typeLabel}`
        + `${rule.reachMeters ? ` se è entro ${String(rule.reachMeters).replace(".", ",")} m` : ""}.`,
    };
  }) : [];

  const offers = [];
  if (!hasReactionUsed(metaOf(target).conditions)) {
    const castable = creatureCastableSpellIds(target);
    if (hit && attack.roll === true && castable.has("shield") && !hasActiveSpell(target, "shield")) {
      offers.push({ spellId: "shield", label: "Lancia Scudo", direct: true,
        text: "Scudo (reazione): +5 CA fino al suo prossimo turno, anche contro questo attacco; se il tiro non arriva alla CA + 5, segna Mancato." });
    }
    const absorbed = (Array.isArray(attack.damageTypes) ? attack.damageTypes : []).map(text).find((type) => ABSORB_ELEMENTS_CHOICES[type]);
    if (damaging && absorbed && castable.has(ABSORB_ELEMENTS_SPELL_ID) && !hasActiveSpell(target, ABSORB_ELEMENTS_SPELL_ID)) {
      offers.push({ spellId: ABSORB_ELEMENTS_SPELL_ID, label: "Assorbire elementi", direct: false, variant: ABSORB_ELEMENTS_CHOICES[absorbed],
        text: `Assorbire elementi (reazione): resistenza ai danni da ${damageTypeLabel(absorbed)}, anche contro questo danno; +1d6 al suo prossimo colpo in mischia.` });
    }
    if (damaging && attacker?.id && castable.has("hellish-rebuke")) {
      offers.push({ spellId: "hellish-rebuke", label: "Intimorire infernale", direct: false, targetIds: [attacker.id],
        text: `Intimorire infernale (reazione): dopo il danno, ${attackerName} tira un TS Destrezza; 2d10 fuoco, metà se lo supera.` });
    }
  }
  return { sanctuary, retaliations, offers };
}
