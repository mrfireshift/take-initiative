// The teleports of a species: Fey Step (eladrin), Blessing of the Raven Queen (shadar-kai), Starlight Step (astral elf).
// Up to 9 m to a free space the character can see, picked on the map with the boss's teleport rule (a cell within
// range of the token); the move, the trait's use and its effects go in one command. From 3rd level the shadar-kai
// resists all damage until the start of its next turn, and the eladrin adds its season (the species option):
// Winter frightens one creature, Autumn charms up to two, Spring teleports a willing creature instead, Summer burns
// the creatures around. The creatures are the ones the GM selects (those that failed the save, for Winter and Autumn).
// Pure: no SDK, DOM or runtime state.
import { abilityModifier, proficiencyBonusForLevel, totalCharacterLevel } from "./abilityModifiersCore.js";
import { DAMAGE_TYPES, componentDamageAfterDefense, damageDefenseFor } from "./damageDefensesCore.js";
import { calculateQuickHPChange } from "./quickHpCore.js";
import { speciesTraitSave } from "./speciesInnateSpellCore.js";

// The boss's teleport rule (spellAreaRules.js): one free cell within range of the token, picked with one click.
export function speciesTeleportRuleId(feature) {
  const feet = Number(feature?.speciesTeleport?.rangeFeet);
  return Number.isInteger(feet) && feet > 0 ? `boss-action-area:teleport:${feet}ft` : "";
}

const NEXT_TURN_START = Object.freeze({ mode: "turn-start", actor: "source", remaining: 1, anchor: "next-turn" });
const NEXT_TURN_END = Object.freeze({ mode: "turn-end", actor: "source", remaining: 1, anchor: "next-turn" });
const ALL_DAMAGE_TYPES = Object.freeze(DAMAGE_TYPES.map((type) => type.id));

export const SPECIES_TELEPORT_SEASONS = Object.freeze({
  inverno: Object.freeze({ label: "Inverno", maxTargets: 1, condition: "Spaventato", expiry: NEXT_TURN_END,
    help: "Seleziona la creatura entro 1,5 m che fallisce il TS: spaventata fino alla fine del tuo prossimo turno." }),
  autunno: Object.freeze({ label: "Autunno", maxTargets: 2, condition: "Affascinato", rounds: 10, endsOnDamage: true,
    help: "Seleziona fino a due creature entro 3 m che falliscono il TS: affascinate per 1 minuto, o finché non subiscono danni." }),
  primavera: Object.freeze({ label: "Primavera", maxTargets: 1, minTargets: 1, swap: true,
    help: "Seleziona la creatura consenziente entro 1,5 m: si teletrasporta lei al posto tuo." }),
  estate: Object.freeze({ label: "Estate", maxTargets: null, damage: true,
    help: "Seleziona le creature entro 1,5 m dalla destinazione: subiscono i danni da fuoco." }),
});

// The season in play: the species option, from the level it applies; "" otherwise.
export function speciesTeleportSeason(feature, card = {}) {
  const seasons = feature?.speciesTeleport?.seasons;
  if (!seasons) return "";
  const season = String(card?.species?.ancestryId || "");
  return SPECIES_TELEPORT_SEASONS[season] && totalCharacterLevel(card?.characterBuild) >= seasons.fromLevel ? season : "";
}

// Summer's fire damage: the Charisma modifier (minimum 1) or the proficiency bonus.
export function speciesTeleportSummerDamage(feature, card = {}) {
  const spec = feature?.speciesTeleport?.seasons?.summer;
  if (spec === "pb") return proficiencyBonusForLevel(totalCharacterLevel(card?.characterBuild));
  const cha = abilityModifier(card?.abilityModifiers, "cha");
  return cha === null ? null : Math.max(1, cha);
}

export function speciesTeleportResistsAll(feature, card = {}) {
  const level = Number(feature?.speciesTeleport?.resistAllFromLevel);
  return Number.isInteger(level) && totalCharacterLevel(card?.characterBuild) >= level;
}

// What the card shows before the teleport: the season and whom to select, the save's DC, the resistance.
export function speciesTeleportInfo(feature, card = {}) {
  const season = speciesTeleportSeason(feature, card);
  const spec = season ? SPECIES_TELEPORT_SEASONS[season] : null;
  const save = spec && (spec.condition) ? speciesTraitSave(feature, card) : null;
  const summer = spec?.damage ? speciesTeleportSummerDamage(feature, card) : null;
  const parts = [`Fino a ${Math.round((feature.speciesTeleport.rangeFeet / 5) * 1.5 * 10) / 10} m: scegli la casella sulla mappa.`];
  if (spec) parts.push(`${spec.label}: ${spec.help}${save ? ` ${save.label}.` : ""}${spec.damage ? ` ${summer ?? "?"} danni da fuoco.` : ""}`);
  if (speciesTeleportResistsAll(feature, card)) parts.push("Poi resistenza a tutti i danni fino all'inizio del tuo prossimo turno.");
  return { season, spec, save, summer, text: parts.join(" ") };
}

function blocked(blocker) {
  return { ok: false, blocker };
}

/**
 * The teleport's command. sourceItem: the character; targets: the creatures selected (items); position: the
 * destination. Returns { ok, subjectId, conditions, damage, detail } or { ok: false, blocker }:
 * - subjectId: who moves (the character, or Spring's willing creature);
 * - conditions: { targetId, condition, label, detail, expiry, mechanics } (Winter, Autumn, the shadar-kai's resistance);
 * - damage: { item, amount, defense, change } (Summer's fire, after each creature's defenses).
 */
export function planSpeciesTeleport({ feature, card = {}, sourceItem, targets = [], position = null, metaKey = "", defensesFor = () => ({}) } = {}) {
  const name = String(feature?.name || "Teletrasporto");
  if (!feature?.speciesTeleport) return blocked(`${name}: non è un teletrasporto.`);
  if (!sourceItem?.id) return blocked(`${name}: personaggio non trovato.`);
  if (!Number.isFinite(Number(position?.x)) || !Number.isFinite(Number(position?.y))) return blocked(`${name}: scegli la destinazione sulla mappa.`);
  const others = (Array.isArray(targets) ? targets : []).filter((item) => item?.id && item.id !== sourceItem.id);
  const season = speciesTeleportSeason(feature, card);
  const spec = season ? SPECIES_TELEPORT_SEASONS[season] : null;
  if (spec?.maxTargets && others.length > spec.maxTargets) {
    return blocked(`${name} (${spec.label}): al massimo ${spec.maxTargets} ${spec.maxTargets === 1 ? "creatura" : "creature"} selezionate.`);
  }
  if (spec?.minTargets && others.length < spec.minTargets) return blocked(`${name} (${spec.label}): seleziona la creatura consenziente.`);
  const conditions = [];
  const damage = [];
  const details = [];
  let subjectId = sourceItem.id;
  if (spec?.swap) {
    subjectId = others[0].id;
    details.push(`${spec.label}: si teletrasporta ${others[0].name || "la creatura"}`);
  } else if (spec?.condition) {
    for (const item of others) {
      conditions.push({ targetId: item.id, condition: spec.condition, label: `${spec.condition} · ${name} (${spec.label.toLowerCase()})`,
        detail: spec.help, ...(spec.expiry ? { expiry: spec.expiry } : { rounds: spec.rounds }),
        ...(spec.endsOnDamage ? { mechanics: { endsOnDamage: true } } : {}) });
    }
    details.push(`${spec.label}: ${others.length ? others.map((item) => item.name || item.id).join(", ") : "nessuno"} ${spec.condition.toLowerCase()}`);
  } else if (spec?.damage) {
    const amount = speciesTeleportSummerDamage(feature, card);
    if (amount === null && others.length) return blocked(`${name} (${spec.label}): manca il modificatore sulla scheda.`);
    for (const item of others) {
      const meta = item.metadata?.[metaKey] || {};
      if (!Number.isFinite(meta.hp) || !Number.isFinite(meta.hpMax)) return blocked(`${item.name || item.id} non ha PF validi.`);
      const defense = damageDefenseFor(defensesFor(item), "fire");
      const value = componentDamageAfterDefense(amount, "full", defense);
      damage.push({ item, amount: value, defense, change: calculateQuickHPChange({ value, hp: meta.hp, hpMax: meta.hpMax }) });
    }
    details.push(`${spec.label}: ${amount ?? 0} danni da fuoco${others.length ? ` a ${others.map((item) => item.name || item.id).join(", ")}` : ", nessuna creatura"}`);
  }
  if (speciesTeleportResistsAll(feature, card)) {
    conditions.push({ targetId: sourceItem.id, condition: "Resistenza ai danni", label: `Resistenza ai danni · ${name}`,
      detail: "Resistenza a tutti i danni fino all'inizio del suo prossimo turno.", expiry: NEXT_TURN_START,
      mechanics: { damageDefenses: { resistances: [...ALL_DAMAGE_TYPES] } } });
    details.push("resistenza a tutti i danni");
  }
  return { ok: true, subjectId, season, conditions, damage,
    detail: [`Teletrasporto di ${subjectId === sourceItem.id ? sourceItem.name || "il personaggio" : others[0].name || "la creatura"}`, ...details].join(" · ") };
}
