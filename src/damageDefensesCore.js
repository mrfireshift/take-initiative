// Damage-type defenses stored in the Actor Profile (initiativeCard.damageDefenses).
// Pure data + arithmetic: no SDK, no metadata writes.
import { scaledQuickHPAmount } from "./quickHpCore.js";
import { classFeatureEffectPlan, sanitizeCharacterBuild, sanitizeEnabledClassFeatureIds } from "./classFeatureCore.js";
import { CLASS_FEATURE_BY_ID, CLASS_FEATURES, classFeatureAvailableForBuild, getEnabledClassFeatures } from "./classFeatureCatalog.js";
import { SPECIES_FIELD, speciesDamageDefenses } from "./speciesTraitCore.js";

export const DAMAGE_DEFENSES_FIELD = "damageDefenses";

export const DAMAGE_TYPES = Object.freeze([
  Object.freeze({ id: "acid", label: "acido" }),
  Object.freeze({ id: "bludgeoning", label: "contundenti" }),
  Object.freeze({ id: "cold", label: "freddo" }),
  Object.freeze({ id: "fire", label: "fuoco" }),
  Object.freeze({ id: "force", label: "forza" }),
  Object.freeze({ id: "lightning", label: "fulmine" }),
  Object.freeze({ id: "necrotic", label: "necrotici" }),
  Object.freeze({ id: "piercing", label: "perforanti" }),
  Object.freeze({ id: "poison", label: "veleno" }),
  Object.freeze({ id: "psychic", label: "psichici" }),
  Object.freeze({ id: "radiant", label: "radiosi" }),
  Object.freeze({ id: "slashing", label: "taglienti" }),
  Object.freeze({ id: "thunder", label: "tuono" }),
]);
const TYPE_IDS = new Set(DAMAGE_TYPES.map((type) => type.id));
// Precedence when a type is listed twice: immunity wins, then resistance, then vulnerability.
const DEFENSE_LISTS = Object.freeze([
  ["immunities", "immunity"],
  ["resistances", "resistance"],
  ["vulnerabilities", "vulnerability"],
]);
export const DAMAGE_DEFENSE_LABELS = Object.freeze({ immunity: "Imm.", resistance: "Res.", vulnerability: "Vuln." });

export function damageTypeLabel(type) {
  return DAMAGE_TYPES.find((entry) => entry.id === type)?.label || String(type || "");
}

export function sanitizeDamageDefenses(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const seen = new Set();
  const result = {};
  for (const [list] of DEFENSE_LISTS) {
    result[list] = (Array.isArray(source[list]) ? source[list] : [])
      .map((type) => String(type || "").trim().toLowerCase())
      .filter((type) => TYPE_IDS.has(type) && !seen.has(type) && seen.add(type))
      .sort((left, right) => DAMAGE_TYPES.findIndex((entry) => entry.id === left) - DAMAGE_TYPES.findIndex((entry) => entry.id === right));
  }
  return result;
}

export function hasDamageDefenses(value) {
  const defenses = sanitizeDamageDefenses(value);
  return DEFENSE_LISTS.some(([list]) => defenses[list].length > 0);
}

export function damageDefenseFor(defenses, type) {
  const clean = sanitizeDamageDefenses(defenses);
  return DEFENSE_LISTS.find(([list]) => clean[list].includes(type))?.[1] || null;
}

// Order follows the 2024 rules: other modifiers (save halving) first, then resistance, then vulnerability.
// Every step uses the shared floor policy, so UI previews and commits always agree.
export function componentDamageAfterDefense(inputAmount, outcomeFactor, defense) {
  const afterOutcome = scaledQuickHPAmount(inputAmount, outcomeFactor);
  if (defense === "immunity") return 0;
  if (defense === "resistance") return scaledQuickHPAmount(afterOutcome, "half");
  if (defense === "vulnerability") return scaledQuickHPAmount(afterOutcome, "double");
  return afterOutcome;
}

// A passive class feature gives its defense while the card's class and level enable it, as a species' trait does (Purity
// of Body, Soul of the Forge): passiveMechanics.damageDefenses in the catalog, never written on the card. One that depends
// on an option the sheet saves (Storm Soul's environment, the genie's kind) is in passiveMechanics.damageDefensesByOption,
// keyed by the option's feature id. Two more hold only against some damage: nonmagicalDamageDefenses against nonmagical
// weapons or attacks (Avatar of Battle; Saint of Forge and Fire, its heavy armor taken as worn), and spellDamageResistance
// against the damage of spells (the Abjurer's Spell Resistance). The catalog is read at call time only: the modules import
// each other.
const PASSIVE_DEFENSE_FIELDS = Object.freeze(["damageDefenses", "damageDefensesByOption", "nonmagicalDamageDefenses", "spellDamageResistance"]);
let passiveDefenseFeatures = null;
function classFeaturePassiveProfile(card) {
  const build = sanitizeCharacterBuild(card?.characterBuild);
  if (!build.length) return null;
  passiveDefenseFeatures ??= CLASS_FEATURES.filter((feature) => PASSIVE_DEFENSE_FIELDS.some((field) => feature.passiveMechanics?.[field]));
  if (!passiveDefenseFeatures.some((feature) => classFeatureAvailableForBuild(feature, build))) return null;
  const enabled = new Set(getEnabledClassFeatures(card).map((feature) => feature.id));
  const features = passiveDefenseFeatures.filter((feature) => enabled.has(feature.id));
  return {
    defenses: mergeDamageDefenses(...features.flatMap((feature) => [
      feature.passiveMechanics.damageDefenses,
      ...Object.entries(feature.passiveMechanics.damageDefensesByOption || {})
        .filter(([optionId]) => enabled.has(optionId))
        .map(([, defenses]) => defenses),
    ])),
    nonmagical: mergeDamageDefenses(...features.map((feature) => feature.passiveMechanics.nonmagicalDamageDefenses)),
    spellResistance: features.some((feature) => feature.passiveMechanics.spellDamageResistance === true),
  };
}
export function classFeaturePassiveDamageDefenses(card) {
  return classFeaturePassiveProfile(card)?.defenses ?? null;
}
export function classFeatureNonmagicalDamageDefenses(card) {
  return classFeaturePassiveProfile(card)?.nonmagical ?? null;
}

// The Actor Profile's own defenses plus the passive ones of its species (a dragonborn's ancestry resistance) and of its
// class features. A defense against nonmagical damage only counts here like any other, as a monster's does: spells and the GM
// get through it (nonmagicalDefenseMarker).
export function profileDamageDefenses(card) {
  const passive = classFeaturePassiveProfile(card);
  return mergeDamageDefenses(card?.[DAMAGE_DEFENSES_FIELD], speciesDamageDefenses(card?.[SPECIES_FIELD]),
    passive?.defenses, passive?.nonmagical);
}

export function profileDamageDefensesForItem(item, metaKey) {
  return profileDamageDefenses(item?.metadata?.[metaKey]?.initiativeCard);
}

// A class feature's pill keeps no defense in the token (the user's choice, 06/11): while it is active, its defense is read
// from the catalog, in effectPlan.damageDefenses of its feature (of the chosen option, if any). An aura's member reads the
// damageDefenses of the targetEffect whose condition it bears, since its pill does not say the option. Neither field
// reaches a pill: classFeatureEffectProjection copies only the plan's mechanics. The pill types and the aura's effect id
// are those of classFeatureAuraCore.js (CLASS_FEATURE_AREA_EFFECT_TYPE, classFeatureAuraEffectId), not imported so that
// this module does not load the areas. The catalog is read at call time only: the modules import each other.
const CLASS_FEATURE_PILL_TYPE = "class-feature";
const CLASS_FEATURE_AREA_PILL_TYPE = "class-feature-area";
const CLASS_FEATURE_AREA_SUFFIX = ":area";
// The catalog's effect behind a pill: the plan of its feature, or the aura's target effect (with damageDefenses or
// spellDamageResistance, the Aura of Warding's) whose condition the member bears.
function classFeaturePillCatalogEffect(instance) {
  const effectId = String(instance?.effectId || "").trim();
  if (instance?.type === CLASS_FEATURE_PILL_TYPE) {
    const feature = CLASS_FEATURE_BY_ID.get(effectId);
    return feature ? classFeatureEffectPlan(feature, instance.choiceId) : null;
  }
  if (instance?.type !== CLASS_FEATURE_AREA_PILL_TYPE || !effectId.endsWith(CLASS_FEATURE_AREA_SUFFIX)) return null;
  const feature = CLASS_FEATURE_BY_ID.get(effectId.slice(0, -CLASS_FEATURE_AREA_SUFFIX.length));
  const condition = String(instance.condition || "").trim();
  const options = Array.isArray(feature?.choiceOptions) ? feature.choiceOptions : [];
  return [feature?.effectPlan, ...options.map((option) => option?.effectPlan)]
    .map((plan) => plan?.targetEffect)
    .find((effect) => (effect?.damageDefenses || effect?.spellDamageResistance) && effect.conditionName === condition) ?? null;
}
export function classFeaturePillDamageDefenses(instance) {
  return classFeaturePillCatalogEffect(instance)?.damageDefenses ?? null;
}

function activeConditionInstances(item, metaKey) {
  const value = item?.metadata?.[metaKey]?.conditions;
  const instances = Array.isArray(value) ? value : Array.isArray(value?.instances) ? value.instances : [];
  return instances.filter((instance) => instance && instance.active !== false);
}

// Resistance to the damage of spells (the Abjurer's Spell Resistance, the Aura of Warding): every type, but only the damage
// of a spell reads it (magicalDamageDefensesForItem, the attack console's spells). From the profile or from an active pill.
export const SPELL_DAMAGE_RESISTANCE = Object.freeze({ resistances: Object.freeze(DAMAGE_TYPES.map((type) => type.id)) });
export function spellDamageResistanceForItem(item, metaKey) {
  if (classFeaturePassiveProfile(item?.metadata?.[metaKey]?.initiativeCard)?.spellResistance) return true;
  return activeConditionInstances(item, metaKey)
    .some((instance) => classFeaturePillCatalogEffect(instance)?.spellDamageResistance === true);
}
// The defenses against a spell's damage: a creature that resists spells resists every type, unless it is immune.
export function withSpellDamageResistance(defenses, item, metaKey) {
  return spellDamageResistanceForItem(item, metaKey) ? mergeDamageDefenses(defenses, SPELL_DAMAGE_RESISTANCE) : defenses;
}

// Active effects (species traits, consumables, buffs) may grant defenses through
// instance.mechanics.damageDefenses, the same shape as the Actor Profile field; a class feature's pill, from the catalog.
export function effectDamageDefensesForItem(item, metaKey) {
  return mergeDamageDefenses(...activeConditionInstances(item, metaKey)
    .flatMap((instance) => [instance.mechanics?.[DAMAGE_DEFENSES_FIELD], classFeaturePillDamageDefenses(instance)]));
}

// Union of several defense sets; sanitizing applies the usual precedence (immunity, resistance, vulnerability).
export function mergeDamageDefenses(...sets) {
  const lists = { immunities: [], resistances: [], vulnerabilities: [] };
  for (const set of sets) {
    const clean = sanitizeDamageDefenses(set);
    for (const [list] of DEFENSE_LISTS) lists[list].push(...clean[list]);
  }
  return sanitizeDamageDefenses(lists);
}

// Effective defenses: the Actor Profile plus every active effect. The profile itself is never rewritten.
export function damageDefensesForItem(item, metaKey) {
  return mergeDamageDefenses(profileDamageDefensesForItem(item, metaKey), effectDamageDefensesForItem(item, metaKey));
}

// Defenses that matter for these components, minus the ones the GM chose to ignore for this resolution.
export function relevantDamageDefenses(defenses, components = [], ignoredTypes = []) {
  const ignored = new Set(Array.isArray(ignoredTypes) ? ignoredTypes : []);
  return components
    .map((component) => ({ type: component.type, defense: damageDefenseFor(defenses, component.type) }))
    .filter((row, index, rows) => row.defense && rows.findIndex((other) => other.type === row.type) === index)
    .map((row) => ({ ...row, ignored: ignored.has(row.type) }));
}

// Evasion is a defense the Actor Profile derives from the class build: the Rogue class feature
// "ladro-elusione" (7th level, enabled by default; once features are configured, only if enabled).
// It applies to any effect whose DEX save halves the damage: success → no damage, failure → half.
export const EVASION_DEFENSE = "evasion";
export const EVASION_FEATURE = Object.freeze({ id: "ladro-elusione", classId: "ladro", minimumLevel: 7 });
export function actorHasEvasion(card) {
  const rogue = sanitizeCharacterBuild(card?.characterBuild).find((entry) => entry.classId === EVASION_FEATURE.classId);
  if (!rogue || rogue.level < EVASION_FEATURE.minimumLevel) return false;
  return card?.classFeaturesConfigured === true
    ? sanitizeEnabledClassFeatureIds(card.enabledClassFeatureIds).includes(EVASION_FEATURE.id) : true;
}
export function evasionForItem(item, metaKey) {
  return actorHasEvasion(item?.metadata?.[metaKey]?.initiativeCard);
}
export function evasionAppliesTo(execution) {
  return execution?.save?.ability === "dex" && execution?.success === "half";
}
export function evasionFactor(factor) {
  return factor === "full" ? "half" : factor === "half" ? "zero" : factor;
}

// A monster's defense that holds only against nonmagical weapons (card.monster.nonmagicalDefenses) is an ordinary entry of
// its damage defenses, as Stoneskin's is: it counts unless ignored. This only says so on the rows that show it.
const NONMAGICAL_MATERIAL_LABELS = Object.freeze({ silvered: "d'argento", adamantine: "di adamantio" });
export function nonmagicalDefenseText(except = []) {
  const materials = (Array.isArray(except) ? except : []).map((material) => NONMAGICAL_MATERIAL_LABELS[material]).filter(Boolean);
  return ["non magici", ...materials].join(" né ");
}
// The types whose defense holds only against nonmagical damage ({ types, except }): a monster's, as its card says, or a
// character's from a class feature (Avatar of Battle), unless another of its sources resists or ignores the type as well.
// covering: the defenses of its active effects (Rage's resistance holds against magic too).
export function nonmagicalDefenseMarker(card, covering = null) {
  const monster = card?.monster?.nonmagicalDefenses;
  if (Array.isArray(monster?.types) && monster.types.length) return monster;
  const passive = classFeaturePassiveProfile(card);
  if (!passive) return null;
  const limited = passive.nonmagical;
  const others = mergeDamageDefenses(card?.[DAMAGE_DEFENSES_FIELD], speciesDamageDefenses(card?.[SPECIES_FIELD]), passive.defenses, covering);
  const types = DEFENSE_LISTS.flatMap(([list]) => limited[list])
    .filter((type) => !["immunity", "resistance"].includes(damageDefenseFor(others, type)));
  return types.length ? { types, except: [] } : null;
}
export function nonmagicalDefenseMarkerForItem(item, metaKey) {
  return nonmagicalDefenseMarker(item?.metadata?.[metaKey]?.initiativeCard, effectDamageDefensesForItem(item, metaKey));
}
export function markNonmagicalDefenses(rows, card) {
  const marker = nonmagicalDefenseMarker(card);
  if (!Array.isArray(marker?.types) || !marker.types.length) return rows;
  return rows.map((row) => (marker.types.includes(row.type) ? { ...row, nonmagical: nonmagicalDefenseText(marker.except) } : row));
}

// short: the words of a chip on one line, "non magici" without its materials (its tooltip says them).
export function damageDefenseTag({ type, defense, nonmagical = "", short = false }) {
  const limit = !nonmagical ? "" : short ? " non magici" : ` (${nonmagical})`;
  return `${DAMAGE_DEFENSE_LABELS[defense] || defense} ${damageTypeLabel(type)}${limit}`;
}

// The same tag with what the defense did to the damage typed ("Res. taglienti: 10 → 5"): the tag alone while nothing is
// typed, or when the GM ignores it.
export function damageDefenseCount({ before = 0, after = 0, ignored = false, ...row }) {
  const tag = damageDefenseTag(row);
  return before > 0 && !ignored ? `${tag}: ${before} → ${after}` : tag;
}
