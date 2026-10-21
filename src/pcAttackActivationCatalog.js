// Activations on a hit (phase 3A of PC attack tracking): the class features the attacker uses when an attack hits
// (maneuvers, Arcane Shot, Stunning Strike, runes…), committed with the attack as one command. A closed, curated
// table: the class feature catalog gives each feature its resource cost, pill, expiry and parent; the dice, the save
// and the limits not structured there are read from the printed text (PHB 2014, Xanathar, Tasha) and checked by
// test/pcAttackActivationCatalog.test.js against the catalog ids.
// Pure: no SDK, DOM or runtime state.
import { getClassFeatureDefinition, getClassFeatureResourcePool, getEnabledClassFeatures } from "./classFeatureCatalog.js";
import { characterClassLevel, resolveClassFeatureResourceDie } from "./classFeatureCore.js";
import { abilityModifier, abilitySaveDC } from "./abilityModifiersCore.js";
import { getPcAttackRider, pcAttackRiderDice } from "./pcAttackRiderCatalog.js";

export const PC_ATTACK_ACTIVATION_CATALOG_VERSION = 1;

// limit.per: "turn" (any turn) or "own-turn" (only the attacker's turn), counted per initiative turn like the riders.
// 3B-1: secondary: the die (or half the Sneak Attack dice) damages a second creature, rolled once; targetDamage says
// whether the target takes it too. preRoll: used on the attack roll itself (a bonus to hit), so also on a miss;
// rollBonus is what it adds to the roll.
// group: activations of one group exclude each other in an attack (one maneuver per attack); a limited group is
// counted once for all its members (one Arcane Shot per turn, whatever the arrow).
const ONCE_PER_TURN = Object.freeze({ per: "turn" });
const ONCE_PER_OWN_TURN = Object.freeze({ per: "own-turn" });
const SUPERIORITY = Object.freeze({ pool: "guerriero-dadi-superiorita" });
const BARDIC_DIE = Object.freeze({ pool: "bardo-ispirazione-bardica-usi" });
const ARCANE_SHOT_DICE = Object.freeze({ classId: "guerriero", table: Object.freeze({ 3: "2d6", 18: "4d6" }) });
// The die of Martial Arts and of Psionic Energy: not structured in the catalog (PHB 2014 monk table, Tasha).
const MARTIAL_ARTS_DIE = Object.freeze({ 1: "1d4", 5: "1d6", 11: "1d8", 17: "1d10" });
const PSIONIC_DIE = Object.freeze({ 3: "1d6", 5: "1d8", 11: "1d10", 17: "1d12" });
const SIZE_NOTE = "Grande o inferiore";

const maneuver = (slug, fields) => Object.freeze({
  id: `guerriero-maestro-di-battaglia-manovre-${slug}`, group: "manovra", groupLabel: "una manovra per attacco",
  dice: SUPERIORITY, type: "weapon", dc: "str-or-dex", ...fields,
});
const arcaneShot = (slug, fields) => Object.freeze({
  id: `guerriero-arciere-arcano-tiro-arcano-freccia-${slug}`, group: "tiro-arcano", groupLabel: "un Tiro Arcano per turno",
  groupLimit: ONCE_PER_TURN, dice: ARCANE_SHOT_DICE, dc: "int", effect: Object.freeze({ pill: true }),
  requires: Object.freeze({ range: "ranged" }), ...fields,
});

export const PC_ATTACK_ACTIVATIONS = Object.freeze([
  // Battle Master: the superiority die adds to the damage; the save DC is 8 + proficiency + Strength or Dexterity.
  maneuver("attacco-minaccioso", { save: "wis", effect: Object.freeze({ pill: true }) }),
  maneuver("attacco-adescante", { save: "wis", effect: Object.freeze({ pill: true }) }),
  maneuver("colpo-distraente", { effect: Object.freeze({ pill: true }) }),
  maneuver("attacco-sbilanciante", { save: "str", size: SIZE_NOTE, effect: Object.freeze({ condition: "Prono" }) }),
  maneuver("attacco-con-spinta", { save: "str", size: SIZE_NOTE, effect: Object.freeze({ note: "Spinto fino a 4,5 m lontano dal guerriero." }) }),
  maneuver("attacco-disarmante", { save: "str", effect: Object.freeze({ note: "Lascia cadere un oggetto impugnato scelto dal guerriero." }) }),
  maneuver("attacco-con-manovra", { effect: Object.freeze({ note: "Un alleato può muoversi di metà velocità con la reazione senza provocare attacchi di opportunità dal bersaglio." }) }),
  maneuver("attacco-con-affondo", { requires: Object.freeze({ range: "melee", ownTurn: true }) }),
  maneuver("attacco-con-spazzata", { requires: Object.freeze({ range: "melee" }),
    secondary: Object.freeze({ targetDamage: false, note: "entro 1,5 m dal bersaglio, se il tiro per colpire la colpirebbe" }) }),
  maneuver("attacco-preciso", { dice: null, rollBonus: SUPERIORITY, preRoll: true }),
  maneuver("attacco-con-finta", { requires: Object.freeze({ ownTurn: true }) }),
  // Monk: Ki.
  Object.freeze({ id: "monaco-colpo-stordente", save: "con", dc: "wis", effect: Object.freeze({ pill: true }),
    requires: Object.freeze({ range: "melee" }) }),
  Object.freeze({ id: "monaco-via-della-misericordia-mano-del-dolore", dice: Object.freeze({ martialArts: true, plus: "wis" }),
    type: "necrotic", limit: ONCE_PER_TURN, requires: Object.freeze({ range: "melee" }) }),
  Object.freeze({ id: "monaco-via-del-kensei-tutt-uno-con-la-lama", label: "Colpo Abile", dice: Object.freeze({ martialArts: true }),
    type: "weapon", limit: ONCE_PER_TURN }),
  // Fangs of the Fire Snake: while it is active, 1 more Ki on a hit for 1d10 fire (the feature's own cost: 1 Ki).
  Object.freeze({ id: "monaco-via-dei-quattro-elementi-discipline-elementali-zanne-del-serpente-di-fuoco",
    label: "Zanne del Serpente di Fuoco (+1d10)", dice: Object.freeze({ fixed: "1d10" }), type: "fire", spendOnly: true,
    requires: Object.freeze({ activeFeatureId: "monaco-via-dei-quattro-elementi-discipline-elementali-zanne-del-serpente-di-fuoco" }) }),
  // Arcane Archer: once per turn, with a magic arrow; 2d6 (4d6 from 18th level), Banishing Arrow's damage only from 18th.
  arcaneShot("afferrante", { type: "poison" }),
  arcaneShot("ammaliante", { type: "psychic", save: "wis" }),
  arcaneShot("d-ombra", { type: "psychic", save: "wis" }),
  arcaneShot("indebolente", { type: "necrotic", save: "con" }),
  arcaneShot("esiliante", { type: "force", save: "cha", dice: Object.freeze({ classId: "guerriero", table: Object.freeze({ 18: "2d6" }) }) }),
  // Rune Knight: the fire rune's extra 2d6 fire on the hit; the save DC is 8 + proficiency + Constitution.
  Object.freeze({ id: "guerriero-cavaliere-runico-intagliatore-di-rune-runa-del-fuoco", dice: Object.freeze({ fixed: "2d6" }), type: "fire",
    save: "str", dc: "con", effect: Object.freeze({ pill: true }) }),
  Object.freeze({ id: "guerriero-guerriero-psionico-potere-psionico-colpo-psionico", dice: Object.freeze({ psionic: true, plus: "int" }),
    type: "force", limit: ONCE_PER_OWN_TURN }),
  Object.freeze({ id: "guerriero-cavaliere-errante-marchio-incrollabile", effect: Object.freeze({ pill: true }),
    requires: Object.freeze({ range: "melee" }) }),
  Object.freeze({ id: "guerriero-cavaliere-mistico-colpo-mistico",
    effect: Object.freeze({ note: "Svantaggio al prossimo TS contro un incantesimo del guerriero prima della fine del suo prossimo turno." }) }),
  Object.freeze({ id: "guerriero-cavaliere-errante-mantenere-la-posizione", requires: Object.freeze({ range: "melee" }),
    effect: Object.freeze({ note: "Con un attacco di opportunità: velocità 0 fino alla fine del turno." }) }),
  // Bard: Bardic Inspiration.
  Object.freeze({ id: "bardo-collegio-dei-sussurri-lame-psichiche", dice: Object.freeze({ classId: "bardo",
    table: Object.freeze({ 3: "2d6", 5: "3d6", 10: "5d6", 15: "8d6" }) }), type: "psychic", limit: ONCE_PER_TURN }),
  Object.freeze({ id: "bardo-collegio-delle-spade-virtuosismo-della-lama-virtuosismo-difensivo", group: "virtuosismo",
    groupLabel: "un virtuosismo per attacco", dice: BARDIC_DIE, type: "weapon", effect: Object.freeze({ pill: true, self: true }) }),
  // Slashing Flourish: one roll of the die damages the target and another creature within 1.5 m of the bard.
  Object.freeze({ id: "bardo-collegio-delle-spade-virtuosismo-della-lama-virtuosismo-tagliente", group: "virtuosismo",
    groupLabel: "un virtuosismo per attacco", dice: BARDIC_DIE, type: "weapon",
    cost: Object.freeze([Object.freeze({ poolId: "bardo-ispirazione-bardica-usi", amount: 1 })]),
    secondary: Object.freeze({ targetDamage: true, note: "entro 1,5 m dal bardo" }) }),
  Object.freeze({ id: "bardo-collegio-delle-spade-virtuosismo-della-lama-virtuosismo-mobile", group: "virtuosismo",
    groupLabel: "un virtuosismo per attacco", dice: BARDIC_DIE, type: "weapon",
    cost: Object.freeze([Object.freeze({ poolId: "bardo-ispirazione-bardica-usi", amount: 1 })]),
    effect: Object.freeze({ note: "Spinto di 1,5 m più il risultato del dado; il bardo può seguirlo con la reazione." }) }),
  // Barbarian: while raging.
  Object.freeze({ id: "barbaro-cammino-del-guardiano-ancestrale-protettori-ancestrali", effect: Object.freeze({ pill: true }),
    limit: ONCE_PER_OWN_TURN, requires: Object.freeze({ activeFeatureId: "barbaro-ira" }) }),
  Object.freeze({ id: "barbaro-cammino-del-combattente-totemico-sintonia-totemica-lupo", size: SIZE_NOTE, effect: Object.freeze({ pill: true }),
    requires: Object.freeze({ activeFeatureId: "barbaro-ira", range: "melee" }) }),
  // Cleric.
  Object.freeze({ id: "chierico-dominio-dell-ordine-ira-dell-ordine", effect: Object.freeze({ pill: true }), limit: ONCE_PER_OWN_TURN,
    requires: Object.freeze({ riderId: "chierico-dominio-dell-ordine-colpo-divino" }) }),
  Object.freeze({ id: "chierico-dominio-della-tempesta-colpo-del-tuono-e-del-fulmine", anyAttack: true, size: SIZE_NOTE,
    requires: Object.freeze({ damageType: "lightning" }), effect: Object.freeze({ note: "Spinto fino a 3 m lontano dal chierico." }) }),
  // Rogue.
  Object.freeze({ id: "ladro-esploratore-maestro-di-imboscate", effect: Object.freeze({ pill: true }), limit: ONCE_PER_TURN,
    requires: Object.freeze({ firstRound: true }) }),
  // Wails from the Grave: right after Sneak Attack on the rogue's turn, half its dice (rounded up) as necrotic damage to
  // another creature within 9 m of the first.
  Object.freeze({ id: "ladro-fantasma-lamenti-dalla-tomba", dice: Object.freeze({ halfSneak: true }), type: "necrotic",
    requires: Object.freeze({ riderId: "ladro-attacco-furtivo", ownTurn: true }),
    secondary: Object.freeze({ targetDamage: false, note: "entro 9 m dalla prima creatura" }) }),
  // Guided Strike (War Domain, Conquest): +10 to an attack roll, decided after seeing the roll.
  Object.freeze({ id: "chierico-dominio-della-guerra-incanalare-divinita-colpo-guidato", anyAttack: true, preRoll: true, rollBonus: Object.freeze({ fixed: "+10" }) }),
  Object.freeze({ id: "paladino-giuramento-di-conquista-incanalare-divinita-colpo-guidato", anyAttack: true, preRoll: true, rollBonus: Object.freeze({ fixed: "+10" }) }),
  // Warlock.
  Object.freeze({ id: "warlock-l-immondo-scagliare-all-inferno", anyAttack: true, effect: Object.freeze({ pill: true }),
    note: "Una volta per riposo lungo: l'uso non è conteggiato." }),
  Object.freeze({ id: "warlock-suppliche-occulte-lancia-della-letargia", spellIds: Object.freeze(["eldritch-blast"]),
    limit: ONCE_PER_OWN_TURN, effect: Object.freeze({ pill: true }) }),
  Object.freeze({ id: "warlock-suppliche-occulte-deflagrazione-respingente", spellIds: Object.freeze(["eldritch-blast"]),
    effect: Object.freeze({ note: "Spinto di 3 m in linea retta lontano dal warlock." }) }),
  Object.freeze({ id: "warlock-suppliche-occulte-stretta-di-hadar", spellIds: Object.freeze(["eldritch-blast"]), limit: ONCE_PER_OWN_TURN,
    effect: Object.freeze({ note: "Tirato di 3 m in linea retta verso il warlock." }) }),
]);

const ACTIVATION_BY_ID = new Map(PC_ATTACK_ACTIVATIONS.map((activation) => [activation.id, activation]));

export function getPcAttackActivation(id) {
  return ACTIVATION_BY_ID.get(String(id || "")) || null;
}

// The activations of this actor: the curated ones whose class feature is enabled in the Actor Profile.
export function pcAttackActivationsForCard(card = {}) {
  const enabled = new Set(getEnabledClassFeatures(card || {}).map((feature) => feature.id));
  return PC_ATTACK_ACTIVATIONS.filter((activation) => enabled.has(activation.id));
}

export function pcAttackActivationLabel(activation) {
  return activation?.label || getClassFeatureDefinition(activation?.id)?.name || activation?.id || "";
}

// The resource costs an activation spends: the catalog's, or the curated one where the catalog has none.
export function pcAttackActivationCosts(activation) {
  const costs = activation?.cost || getClassFeatureDefinition(activation?.id)?.resourceCosts;
  return (Array.isArray(costs) ? costs : []).filter((cost) => cost?.poolId && Number(cost.amount) > 0);
}

function tableValue(table, level) {
  let value = null;
  for (const [minimum, entry] of Object.entries(table || {})) if (level >= Number(minimum)) value = entry;
  return value;
}

const signed = (value) => (value >= 0 ? `+${value}` : String(value));

// The dice the GM rolls for this activation at the actor's level ("1d8", "2d6", "1d6+3"), or null (no damage, or
// unknown: the level or a modifier is missing from the Actor Profile). spec: another dice field (rollBonus).
export function pcAttackActivationDice(activation, card = {}, spec = activation?.dice) {
  const dice = spec;
  if (!dice) return null;
  const build = card?.characterBuild;
  const withModifier = (base, ability) => {
    if (!base) return null;
    if (!ability) return base;
    const modifier = abilityModifier(card?.abilityModifiers, ability);
    return Number.isFinite(modifier) ? `${base}${signed(modifier)}` : null;
  };
  if (dice.fixed) return dice.fixed;
  // Half the Sneak Attack dice at the rogue's level, rounded up ("5d6" → "3d6").
  if (dice.halfSneak) {
    const sneak = pcAttackRiderDice(getPcAttackRider("ladro-attacco-furtivo"), card);
    const match = /^(\d+)d(\d+)$/u.exec(String(sneak || ""));
    return match ? `${Math.ceil(Number(match[1]) / 2)}d${match[2]}` : null;
  }
  if (dice.pool) {
    const die = resolveClassFeatureResourceDie(getClassFeatureResourcePool(dice.pool), build);
    return die ? `1${die}` : null;
  }
  if (dice.martialArts) return withModifier(tableValue(MARTIAL_ARTS_DIE, characterClassLevel(build, "monaco")), dice.plus);
  if (dice.psionic) return withModifier(tableValue(PSIONIC_DIE, characterClassLevel(build, "guerriero")), dice.plus);
  if (dice.table) return tableValue(dice.table, characterClassLevel(build, dice.classId));
  return null;
}

// Whether this activation adds a damage component at the actor's level: a table without a value yet means no damage
// (Banishing Arrow before 18th level); a die with a missing modifier still deals damage (the GM enters the total).
export function pcAttackActivationDealsDamage(activation, card = {}) {
  const dice = activation?.dice;
  if (!dice) return false;
  if (dice.table && !dice.martialArts && !dice.psionic) return !!tableValue(dice.table, characterClassLevel(card?.characterBuild, dice.classId));
  return true;
}

// What the activation does to the target (or, with effect.self, to the attacker): the pill of the class feature,
// a standard condition, or a note for an effect the map shows (a push, a dropped weapon).
export function pcAttackActivationEffect(activation) {
  const effect = activation?.effect;
  if (!effect) return null;
  if (effect.pill) {
    const plan = getClassFeatureDefinition(activation.id)?.effectPlan;
    return plan?.conditionName ? { kind: "pill", label: plan.conditionName, self: effect.self === true } : null;
  }
  if (effect.condition) return { kind: "condition", label: effect.condition };
  return effect.note ? { kind: "note", label: effect.note } : null;
}

// What a pre-roll activation adds to the attack roll: "+1d10" (Precision Attack), "+10" (Guided Strike), or null.
export function pcAttackActivationRollBonus(activation, card = {}) {
  if (!activation?.rollBonus) return null;
  const value = pcAttackActivationDice(activation, card, activation.rollBonus);
  return value ? (value.startsWith("+") ? value : `+${value}`) : null;
}

// The save DC of this activation (8 + proficiency + the feature's ability; maneuvers: the better of Strength and
// Dexterity), or null when the Actor Profile lacks the level or the modifier.
export function pcAttackActivationSaveDC(activation, card = {}) {
  if (!activation?.save) return null;
  if (activation.dc === "str-or-dex") {
    const values = ["str", "dex"].map((ability) => abilitySaveDC(card, ability)).filter(Number.isFinite);
    return values.length ? Math.max(...values) : null;
  }
  return abilitySaveDC(card, activation.dc);
}

// The key a limited use is counted under: the group's for a limited group (Arcane Shot), else the activation's.
export function pcAttackActivationLimitKey(activation) {
  return activation?.groupLimit ? `group:${activation.group}` : activation?.id || "";
}

export function pcAttackActivationLimit(activation) {
  return activation?.groupLimit || activation?.limit || null;
}
