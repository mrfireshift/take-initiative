// Extra damage on a hit (phase 1 of PC attack tracking): a closed, curated table. The class feature catalog
// structures the dice of Sneak Attack only; every other value here is read from the printed text (PHB 2014,
// Xanathar, Tasha) and checked by test/pcAttackRiderCatalog.test.js against the catalog ids.
// Pure: no SDK, DOM or runtime state.
import { getClassFeatureDefinition, getEnabledClassFeatures } from "./classFeatureCatalog.js";
import { activeClassFeatureInstances, characterClassLevel, resolveClassFeatureDice } from "./classFeatureCore.js";
import { abilityModifier, proficiencyBonusForLevel, totalCharacterLevel } from "./abilityModifiersCore.js";

export const PC_ATTACK_RIDER_CATALOG_VERSION = 1;

// limit.per: "turn" (any turn, reactions included) or "own-turn" (only the attacker's own turn).
// limit.scope: "attacker" (once for the attacker) or "target" (once for each creature hit).
const ONCE_PER_TURN = Object.freeze({ per: "turn", scope: "attacker" });
const ONCE_PER_OWN_TURN = Object.freeze({ per: "own-turn", scope: "attacker" });
const ONCE_PER_TURN_PER_TARGET = Object.freeze({ per: "turn", scope: "target" });
const DIVINE_STRIKE_DICE = Object.freeze({ table: Object.freeze({ 8: "1d8", 14: "2d8" }) });
// Divine Strike: "once on each of your turns" for every domain, whatever the Italian wording.
const divineStrike = (domain, type) => Object.freeze({
  id: `chierico-${domain}-colpo-divino`, label: "Colpo Divino", dice: DIVINE_STRIKE_DICE, type, limit: ONCE_PER_OWN_TURN,
});
const colossusSlayer = (id) => Object.freeze({
  id, label: "Sterminatore di Colossi", dice: Object.freeze({ fixed: "1d8" }), type: "weapon", limit: ONCE_PER_TURN,
  requires: Object.freeze({ targetBelowMax: true }),
});

export const PC_ATTACK_RIDERS = Object.freeze([
  Object.freeze({ id: "ladro-attacco-furtivo", label: "Attacco Furtivo", dice: Object.freeze({ catalog: true }), type: "weapon", limit: ONCE_PER_TURN }),
  divineStrike("dominio-della-guerra", "weapon"),
  divineStrike("dominio-dell-inganno", "poison"),
  divineStrike("dominio-della-natura", Object.freeze({ choice: Object.freeze(["cold", "fire", "lightning"]) })),
  divineStrike("dominio-della-tempesta", "thunder"),
  divineStrike("dominio-della-vita", "radiant"),
  divineStrike("dominio-della-forgia", "fire"),
  divineStrike("dominio-del-crepuscolo", "radiant"),
  divineStrike("dominio-dell-ordine", "psychic"),
  Object.freeze({ id: "paladino-punizione-divina-migliorata", label: "Punizione Divina Migliorata", dice: Object.freeze({ fixed: "1d8" }),
    type: "radiant", limit: null, requires: Object.freeze({ range: "melee" }) }),
  colossusSlayer("ranger-cacciatore-preda-del-cacciatore-sterminatore-di-colossi"),
  colossusSlayer("ranger-revised-conclave-del-cacciatore-preda-del-cacciatore-sterminatore-di-colossi"),
  Object.freeze({ id: "ranger-viandante-fatato-colpi-terribili", label: "Colpi Terribili", dice: Object.freeze({ table: Object.freeze({ 3: "1d4", 11: "1d6" }) }),
    type: "psychic", limit: ONCE_PER_TURN_PER_TARGET }),
  Object.freeze({ id: "barbaro-cammino-dello-zelota-furia-divina", label: "Furia Divina", dice: Object.freeze({ halfLevel: "1d6" }),
    type: Object.freeze({ choice: Object.freeze(["necrotic", "radiant"]) }), limit: ONCE_PER_OWN_TURN,
    requires: Object.freeze({ activeFeatureId: "barbaro-ira" }) }),
  Object.freeze({ id: "barbaro-ira", label: "Danno dell'Ira", dice: Object.freeze({ table: Object.freeze({ 1: "+2", 9: "+3", 16: "+4" }) }),
    type: "weapon", limit: null, requires: Object.freeze({ activeFeatureId: "barbaro-ira", range: "melee" }) }),
  Object.freeze({ id: "ranger-uccisore-di-mostri-preda-dell-uccisore", label: "Preda dell'Uccisore", dice: Object.freeze({ fixed: "1d6" }),
    type: "weapon", limit: ONCE_PER_TURN_PER_TARGET, requires: Object.freeze({ targetCondition: "Preda dell'Uccisore" }) }),
  Object.freeze({ id: "warlock-la-lama-del-sortilegio-maledizione-della-lama-del-sortilegio", label: "Maledizione della Lama del Sortilegio",
    dice: Object.freeze({ proficiency: true }), type: "weapon", limit: null,
    requires: Object.freeze({ targetCondition: "Maledizione della Lama del Sortilegio" }) }),
  Object.freeze({ id: "warlock-suppliche-occulte-succhiavita", label: "Succhiavita", dice: Object.freeze({ ability: "cha", minimum: 1 }),
    type: "necrotic", limit: null }),
  // Phase 2: smites spend a spell slot. The slot is never counted (PC slots are not tracked): the GM picks
  // its level, the dice follow it. Divine Smite: 2d8 at 1st level, +1d8 per level, at most 5d8, +1d8
  // against an undead or a fiend (a GM toggle: creature types are not tracked).
  Object.freeze({ id: "paladino-punizione-divina", label: "Punizione Divina", dice: Object.freeze({ slot: Object.freeze({ atFirst: 2, max: 5 }) }),
    type: "radiant", limit: null, requires: Object.freeze({ range: "melee" }), slot: Object.freeze({ choose: true }),
    bonus: Object.freeze({ label: "Non morto o immondo", dice: 1 }) }),
  // Eldritch Smite: a pact slot (its level follows the warlock level), 1d8 + 1d8 per slot level, once per
  // turn, and the GM may knock the target prone (Huge or smaller: the size is the GM's call).
  Object.freeze({ id: "warlock-suppliche-occulte-punizione-occulta", label: "Punizione Occulta", dice: Object.freeze({ slot: Object.freeze({ atFirst: 2 }) }),
    type: "force", limit: ONCE_PER_TURN, slot: Object.freeze({ pact: true }),
    onHit: Object.freeze({ condition: "Prono", label: "Prono (taglia Enorme o inferiore)" }) }),
]);

export const PC_ATTACK_SLOT_LEVELS = Object.freeze([1, 2, 3, 4, 5]);
// Pact Magic: every warlock slot has the same level (PHB 2014 warlock table).
const PACT_SLOT_LEVEL = Object.freeze({ 1: 1, 3: 2, 5: 3, 7: 4, 9: 5 });

const RIDER_BY_ID = new Map(PC_ATTACK_RIDERS.map((rider) => [rider.id, rider]));

export function getPcAttackRider(id) {
  return RIDER_BY_ID.get(String(id || "")) || null;
}

function tableValue(table, level) {
  let value = null;
  for (const [minimum, entry] of Object.entries(table || {})) if (level >= Number(minimum)) value = entry;
  return value;
}

// The slot levels a smite may use: any level for Divine Smite (the GM knows the actor's slots), the pact
// slot level for Eldritch Smite. Empty for riders without a slot.
export function pcAttackRiderSlotLevels(rider, card = {}) {
  if (rider?.slot?.choose) return [...PC_ATTACK_SLOT_LEVELS];
  if (rider?.slot?.pact) {
    const level = tableValue(PACT_SLOT_LEVEL, characterClassLevel(card?.characterBuild, "warlock"));
    return level ? [level] : [];
  }
  return [];
}

// The dice the GM rolls for this rider at the actor's level ("3d6", "1d6+5", "+2"), or null when unknown.
// A smite needs its slot level (and the undead/fiend bonus for Divine Smite).
export function pcAttackRiderDice(rider, card = {}, { slotLevel = null, bonus = false } = {}) {
  const feature = getClassFeatureDefinition(rider?.id);
  const build = card?.characterBuild;
  const level = feature?.classId ? characterClassLevel(build, feature.classId) : 0;
  const dice = rider?.dice || {};
  if (dice.slot) {
    if (!Number.isInteger(slotLevel) || slotLevel < 1) return null;
    // Both smites: 2d8 with a 1st-level slot, +1d8 for each level above.
    const count = Math.min(dice.slot.max ?? Infinity, dice.slot.atFirst + slotLevel - 1);
    return `${count + (bonus && rider.bonus ? rider.bonus.dice : 0)}d8`;
  }
  if (dice.catalog) return resolveClassFeatureDice(feature, build);
  if (dice.fixed) return dice.fixed;
  if (dice.table) return tableValue(dice.table, level);
  if (dice.halfLevel) return level ? `${dice.halfLevel}+${Math.floor(level / 2)}` : null;
  if (dice.proficiency) {
    const bonus = proficiencyBonusForLevel(totalCharacterLevel(build));
    return bonus ? `+${bonus}` : null;
  }
  if (dice.ability) {
    const modifier = abilityModifier(card?.abilityModifiers, dice.ability);
    return Number.isFinite(modifier) ? `+${Math.max(dice.minimum ?? modifier, modifier)}` : null;
  }
  return null;
}

// A critical hit doubles the dice, never the flat bonus: "3d6" → "6d6", "1d6+5" → "2d6+5", "+2" stays.
export function pcAttackCriticalDice(value) {
  return String(value || "").replace(/(\d+)d(\d+)/gu, (match, count, sides) => `${Number(count) * 2}d${sides}`);
}

// The riders of this actor: the curated ones whose class feature is enabled in the Actor Profile.
export function pcAttackRidersForCard(card = {}) {
  const enabled = new Set(getEnabledClassFeatures(card || {}).map((feature) => feature.id));
  return PC_ATTACK_RIDERS.filter((rider) => enabled.has(rider.id));
}

export function pcAttackRiderFeatureActive(meta = {}, featureId, round = null) {
  return activeClassFeatureInstances(meta?.classFeatureState, round).some((instance) => instance.featureId === featureId);
}
