// PC attack tracking: one attack of an actor against one creature, as one command.
// Pure: no SDK, DOM or runtime state. The GM enters the rolled total of each typed component;
// no formula is evaluated and no eligibility (advantage, reach, weapon properties) is checked.
// Phase 1 adds the extra damage on a hit: class feature riders (pcAttackRiderCatalog.js), counted per
// initiative turn, and components the GM adds on the fly (Booming Blade, Hunter's Mark, a magic weapon).
// Phase 3A adds the activations on a hit (pcAttackActivationCatalog.js): the class feature's resource, its die,
// its save and its pill, committed with the attack.
import { ID } from "./constants.js";
import { calculateQuickHPChange, QUICK_HP_MODES } from "./quickHpCore.js";
import { takesDeathSaveDamage } from "./deathSaveCore.js";
import { spellCasterHealingChange } from "./spellDamageHealingCore.js";
import { sanitizeQuickAction, sanitizeQuickActions, QUICK_ACTION_ATTACK_DAMAGE_TYPES, QUICK_ACTION_VERSION } from "./quickActionsCore.js";
import { pcAttackBreathActionId, pcAttackBreathFeatureId } from "./pcAttackBreathId.js";
import {
  isBossActionCreature, bossMetadataSnapshot, bossConditionAppliedAt,
  damageAmount, defendedComponents, targetProfileAssert, bossGroupConditionInstanceId,
} from "./bossActionExecutionCore.js";
import { bossDefendedDamage } from "./bossActionsViewCore.js";
import { getSpellDefinition, getSpellEffects, getSpellSummaryParts } from "./spells-srd.js";
import { catalogSpellApplicationOperations } from "./spellLifecycleOperationsCore.js";
import { spellEffectThemeFor } from "./spellColorCore.js";
import { damageDefensesForItem, damageTypeLabel, relevantDamageDefenses } from "./damageDefensesCore.js";
import { CLASS_FEATURE_RESOURCE_POOL_BY_ID, getClassFeatureDefinition, getClassFeatureResourcePool, getEnabledClassFeatures } from "./classFeatureCatalog.js";
import {
  CLASS_FEATURE_STATE_FIELD, classFeatureConditionInstancesForActivation, classFeatureResourceEntries, normalizeClassFeatureState,
  planClassFeatureActivation, planClassFeatureDeactivation, planClassFeatureResourceAdjustment,
} from "./classFeatureCore.js";
import {
  pcAttackActivationsForCard, pcAttackActivationLabel, pcAttackActivationCosts, pcAttackActivationDice, pcAttackActivationSaveDC,
  pcAttackActivationLimitKey, pcAttackActivationLimit, pcAttackActivationDealsDamage, pcAttackActivationEffect, getPcAttackActivation,
  pcAttackActivationRollBonus, pcAttackModesForCard,
} from "./pcAttackActivationCatalog.js";
import { bossReachFeet } from "./bossActionsViewCore.js";
import { PC_ATTACK_CANTRIPS, PC_ATTACK_SAVE_LABELS, getPcAttackCantrip, pcAttackCantripDice, pcAttackWeaponCantripDice } from "./pcAttackCantripCatalog.js";
import { PC_ATTACK_SPELLS, getPcAttackSpell, pcAttackSpellCount, pcAttackSpellDice } from "./pcAttackSpellCatalog.js";
import { abilitySaveDC, totalCharacterLevel } from "./abilityModifiersCore.js";
import { PC_ATTACK_RIDERS, getPcAttackRider, pcAttackHasPotentCantrip, pcAttackRiderDice, pcAttackRiderFeatureActive, pcAttackRidersForCard, pcAttackRiderSlotLevels } from "./pcAttackRiderCatalog.js";

export const PC_ATTACK_HISTORY_KIND = "pc-attack";
// The attacker's last attack and the riders it used in the current turn. Every attack rewrites it,
// so a miss is still a command with a History entry (and a Combat Log event).
export const PC_ATTACK_STATE_FIELD = "pcAttackState";
export const PC_ATTACK_STATE_VERSION = 1;
export const PC_ATTACK_OUTCOMES = Object.freeze(["hit", "critical", "miss"]);
// Saving throw cantrips (C2): the target saves; a failure takes the damage, a success none.
export const PC_ATTACK_SAVE_OUTCOMES = Object.freeze(["failed", "passed"]);
// Darts that hit without an attack roll (Magic Missile, lotto L4): the only outcome is the hit.
export const PC_ATTACK_AUTO_OUTCOMES = Object.freeze(["hit"]);
const DAMAGING_OUTCOMES = new Set(["hit", "critical", "failed"]);
// Activations need an attack roll (a saving throw cantrip has none) and, except those used on the roll itself
// (a bonus to hit), a hit.
const ATTACK_HITS = new Set(["hit", "critical"]);
const ATTACK_ROLL_OUTCOMES = new Set(["hit", "critical", "miss"]);

// The save that replaces the attack roll: a saving throw cantrip's, or an arrow's without attack roll (3C).
export function pcAttackSave(attack) {
  return attack?.cantrip?.save || attack?.save || "";
}

// What this outcome deals: the full damage on a hit, a critical or a failed save; half on a passed save when the
// caster has Potent Cantrip, or for an arrow that halves it (Seeking, Piercing); nothing otherwise.
export function pcAttackDamageFactor(attack, outcome, card = {}) {
  if (DAMAGING_OUTCOMES.has(outcome)) return "full";
  if (outcome === "passed" && attack?.saveHalf) return "half";
  return outcome === "passed" && attack?.cantrip?.save && pcAttackHasPotentCantrip(card) ? "half" : "zero";
}

// The extras (riders, components added on the fly) follow the damage: a hit, a failed save, or a passed save that
// still halves the arrow's damage.
function extrasAllowedFor(attack, outcome) {
  return DAMAGING_OUTCOMES.has(outcome) || (!!attack?.saveHalf && outcome === "passed");
}

// The outcomes the GM picks for this (resolved) attack.
export function pcAttackOutcomesFor(attack) {
  if (attack?.spell?.delivery === "auto") return PC_ATTACK_AUTO_OUTCOMES;
  return pcAttackSave(attack) ? PC_ATTACK_SAVE_OUTCOMES : PC_ATTACK_OUTCOMES;
}
export const MAX_PC_ATTACK_EXTRAS = 3;
const META_KEY = `${ID}/meta`;
const STATE_KEY = `${ID}/state`;
const damageTypeSet = new Set(QUICK_ACTION_ATTACK_DAMAGE_TYPES);

export function pcAttackAction(action) {
  if (action?.source?.kind === "breath") return breathActionShape(action);
  const normalized = sanitizeQuickAction(action);
  return normalized?.kind === "attack" ? normalized : null;
}

// A dragonborn's breath weapon (a species trait with a breath spec): an area of creatures picked by hand, a save that
// halves the damage, one damage roll of the ancestry's type. Built from the trait, never stored: its id is
// "breath:<trait id>" (pcAttackBreathId.js) and its use is the trait's own, spent with the damage.
function breathActionShape(action) {
  const featureId = pcAttackBreathFeatureId(action?.id);
  const breath = featureId === action?.source?.featureId ? getClassFeatureDefinition(featureId)?.breath : null;
  const component = Array.isArray(action?.components) ? action.components[0] : null;
  if (!breath || component?.type !== breath.damageType) return null;
  return {
    version: QUICK_ACTION_VERSION, id: pcAttackBreathActionId(featureId), label: String(action.label || ""), kind: "attack",
    targetMode: "selection", range: "ranged", source: { kind: "breath", featureId },
    components: [{ id: "c1", type: breath.damageType, ...(component.formula ? { formula: String(component.formula) } : {}) }],
  };
}

// The breath's dice at the character's total level ("3d6" at 6th level for the PHB breath).
export function pcAttackBreathDice(breath, card = {}) {
  const level = totalCharacterLevel(card?.characterBuild) || 1;
  const steps = Object.entries(breath?.dice || {}).map(([from, dice]) => [Number(from), dice]).sort((left, right) => left[0] - right[0]);
  return steps.filter(([from]) => level >= from).at(-1)?.[1] || steps[0]?.[1] || "";
}

// The breath action of this card for that id, or null when the card has no such enabled trait (another species,
// another ancestry, a level too low).
export function pcAttackBreathAction(card = {}, actionId = "") {
  const featureId = pcAttackBreathFeatureId(actionId);
  const feature = featureId ? getEnabledClassFeatures(card).find((entry) => entry.id === featureId && entry.breath) : null;
  if (!feature) return null;
  return breathActionShape({ id: actionId, label: feature.name, source: { kind: "breath", featureId },
    components: [{ type: feature.breath.damageType, formula: pcAttackBreathDice(feature.breath, card) }] });
}

// The breath weapons a card offers: one per enabled breath trait.
export function pcAttackBreathActionsForCard(card = {}) {
  return getEnabledClassFeatures(card).filter((feature) => feature.breath)
    .map((feature) => pcAttackBreathAction(card, pcAttackBreathActionId(feature.id))).filter(Boolean);
}

// The cantrips a cantrip quick action offers: the ones the actor knows, or every attack cantrip.
export function pcAttackCantripIds(action) {
  const attack = pcAttackAction(action);
  if (attack?.source?.kind !== "cantrip") return [];
  const offered = attack.source.spellIds?.length ? [...attack.source.spellIds] : PC_ATTACK_CANTRIPS.map((cantrip) => cantrip.spellId);
  // Booming Blade and Green-Flame Blade are woven into a melee weapon attack, Create Bonfire is the spell panel's:
  // never picked here.
  return offered.filter((spellId) => getPcAttackCantrip(spellId) && !["weapon", "panel"].includes(getPcAttackCantrip(spellId).delivery));
}

// The leveled spells an attack spell quick action offers (lotto L4): the ones the actor knows, or every attack spell.
export function pcAttackSpellIds(action) {
  const attack = pcAttackAction(action);
  if (attack?.source?.kind !== "spell") return [];
  return attack.source.spellIds?.length ? [...attack.source.spellIds] : PC_ATTACK_SPELLS.map((spell) => spell.spellId);
}

// The cantrips a cantrip action lists that the spell panel casts (Create Bonfire): the console points there.
export function pcAttackActionPanelCantripIds(action) {
  const attack = pcAttackAction(action);
  if (attack?.source?.kind !== "cantrip") return [];
  const offered = attack.source.spellIds?.length ? attack.source.spellIds : PC_ATTACK_CANTRIPS.map((cantrip) => cantrip.spellId);
  return offered.filter((spellId) => getPcAttackCantrip(spellId)?.delivery === "panel");
}

// The weapon cantrips a cantrip action lists (Booming Blade, Green-Flame Blade): not picked in its console but
// woven into a melee weapon attack, so the console points there.
export function pcAttackActionWeaponCantripIds(action) {
  const attack = pcAttackAction(action);
  if (attack?.source?.kind !== "cantrip") return [];
  const offered = attack.source.spellIds?.length ? attack.source.spellIds : PC_ATTACK_CANTRIPS.map((cantrip) => cantrip.spellId);
  return offered.filter((spellId) => getPcAttackCantrip(spellId)?.delivery === "weapon");
}

// The weapon cantrips (C4) a melee weapon attack offers: those the actor's cantrip quick actions list (an action
// that lists none offers them all).
export function pcAttackWeaponCantripIds(action, card = {}) {
  const attack = pcAttackAction(action);
  if (!attack || ["cantrip", "spell"].includes(attack.source?.kind) || attack.range !== "melee") return [];
  const known = new Set();
  for (const quick of sanitizeQuickActions(card?.quickActions, { limit: 64 })) {
    if (quick.kind !== "attack" || quick.source?.kind !== "cantrip") continue;
    for (const spellId of quick.source.spellIds?.length ? quick.source.spellIds : PC_ATTACK_CANTRIPS.map((cantrip) => cantrip.spellId)) known.add(spellId);
  }
  return PC_ATTACK_CANTRIPS.filter((cantrip) => cantrip.delivery === "weapon" && known.has(cantrip.spellId)).map((cantrip) => cantrip.spellId);
}

export function pcAttackWeaponCantripOptions(action, card = {}) {
  const level = totalCharacterLevel(card?.characterBuild);
  return pcAttackWeaponCantripIds(action, card).map((spellId) => {
    const cantrip = getPcAttackCantrip(spellId);
    return { spellId, name: cantrip.name, type: cantrip.type, dice: pcAttackWeaponCantripDice(cantrip, level),
      trigger: !!cantrip.trigger, secondary: !!cantrip.secondary };
  });
}

// The attack as it is resolved: a weapon attack as configured; a cantrip attack with the range and the
// damage component of the cantrip chosen in the console (null when that cantrip is not offered).
// attackMode (3C): an arrow that replaces the attack roll (Seeking, Piercing): a save that halves the damage, and for
// Piercing an area of creatures. An area cantrip carries its area too.
export function pcAttackResolvedAction(action, spellId = "", attackMode = "") {
  const attack = pcAttackAction(action);
  if (!attack) return null;
  if (attack.source?.kind === "breath") {
    const feature = getClassFeatureDefinition(attack.source.featureId);
    const breath = feature?.breath;
    if (!breath) return null;
    return { ...attack, save: breath.save, saveHalf: true,
      area: { manual: true, shape: breath.shape, lengthFeet: breath.lengthFeet, ...(breath.widthFeet ? { widthFeet: breath.widthFeet } : {}) },
      breath: { featureId: feature.id, name: feature.name, damageType: breath.damageType } };
  }
  // A leveled attack spell (lotto L4): its range and one damage component, of the first of its types until the
  // console picks one (pcAttackWithSpellType).
  if (attack.source?.kind === "spell") {
    const spell = getPcAttackSpell(spellId);
    if (!spell || !pcAttackSpellIds(attack).includes(spell.spellId)) return null;
    return { ...attack, range: spell.range, components: [{ id: "c1", type: spell.types ? spell.types[0] : spell.type }],
      spell: { spellId: spell.spellId, name: spell.name, level: spell.level, ...(spell.delivery ? { delivery: spell.delivery } : {}),
        ...(spell.types ? { types: [...spell.types] } : {}), ...(spell.ruleNote ? { ruleNote: spell.ruleNote } : {}),
        ...(spell.leap ? { leap: { ...spell.leap } } : {}), ...(spell.casterHealRatio ? { casterHealRatio: spell.casterHealRatio } : {}),
        ...(spell.fromActiveSpell ? { fromActiveSpell: true } : {}) } };
  }
  if (attack.source?.kind !== "cantrip") {
    if (!attackMode) return attack;
    const mode = getPcAttackActivation(attackMode);
    if (!mode?.mode || (mode.requires?.range && attack.range !== mode.requires.range)) return null;
    return { ...attack, save: mode.save, saveHalf: true,
      mode: { id: mode.id, kind: mode.mode, label: pcAttackActivationLabel(mode), type: mode.type },
      ...(mode.mode === "area" ? { area: { manual: true } } : {}) };
  }
  const cantrip = getPcAttackCantrip(spellId);
  if (!cantrip || !pcAttackCantripIds(attack).includes(cantrip.spellId)) return null;
  return { ...attack, range: cantrip.range, components: [{ id: "c1", type: cantrip.type }],
    cantrip: { spellId: cantrip.spellId, name: cantrip.name, ...(cantrip.save ? { save: cantrip.save } : {}),
      ...(cantrip.ruleNote ? { ruleNote: cantrip.ruleNote } : {}), ...(cantrip.effectNote ? { effectNote: cantrip.effectNote } : {}) },
    ...(cantrip.area ? { area: { ...cantrip.area } } : {}) };
}

// The dice of the chosen cantrip at the attacker's character level (5th/11th/17th), shown and recorded.
// targetItem: Toll the Dead rolls its larger die against a creature missing hit points (temporary hit points,
// stored above hpMax, never count as missing ones).
export function pcAttackCantripDiceFor(attack, card = {}, targetItem = null) {
  if (!attack?.cantrip) return null;
  const meta = targetItem?.metadata?.[META_KEY] || {};
  const targetDamaged = Number.isFinite(meta.hp) && Number.isFinite(meta.hpMax) && Math.min(meta.hp, meta.hpMax) < meta.hpMax;
  return pcAttackCantripDice(getPcAttackCantrip(attack.cantrip.spellId), totalCharacterLevel(card?.characterBuild), { targetDamaged });
}

// Lotto L4: the damage type picked in the console for a spell with several (Chromatic Orb, Chaos Bolt's d8).
export function pcAttackWithSpellType(attack, damageType = "") {
  if (!attack?.spell?.types?.includes(damageType)) return attack;
  return { ...attack, components: [{ ...attack.components[0], type: damageType }] };
}

const CONCENTRATION_FIELD = `${ID}/concentration`;
// The caster's own active cast of a spell (Vampiric Touch): its concentration entry, with the slot level it was cast at.
function activeSpellCast(sourceMeta, spellId) {
  const entries = sourceMeta?.[CONCENTRATION_FIELD] && typeof sourceMeta[CONCENTRATION_FIELD] === "object" ? Object.values(sourceMeta[CONCENTRATION_FIELD]) : [];
  const entry = entries.find((value) => value?.spellId === spellId);
  if (!entry) return null;
  const slotLevel = Math.floor(Number(entry.castContext?.slotLevel));
  return { instanceId: String(entry.instanceId || ""), slotLevel: Number.isInteger(slotLevel) ? slotLevel : null };
}

function shieldedFrom(targetItem, spellId) {
  return conditionInstancesOf(targetItem).some((instance) => instance?.active !== false
    && Array.isArray(instance?.mechanics?.immunities) && instance.mechanics.immunities.includes(spellId));
}

// The cast of this spell the console may continue: same spell and turn, with rays or darts left or a pending leap.
export function pcAttackOpenSpellCast({ sourceItem, spellId = "", turnState = null } = {}) {
  const live = sourceItem?.metadata?.[META_KEY]?.[PC_ATTACK_STATE_FIELD]?.spellCast || null;
  if (!live || live.spellId !== spellId) return null;
  if ((live.turnKey || "") !== (attackTurn(turnState)?.turnKey || "")) return null;
  return live.index < live.total || live.leapPending === true ? { ...live, targetIds: [...(live.targetIds || [])] } : null;
}

// A leveled spell's registration (lotto L4): its slot level and dice, the ray or dart it is, and whether it opens the
// cast (and spends the slot in its command) or continues the one recorded in pcAttackState.spellCast (the same cast id,
// spell and turn, with rays left or a pending leap). spellCast: the console's { castId, slotLevel, damageType, doubles }.
// Vampiric Touch spends nothing: its slot and concentration come from the cast of the spell panel.
export function pcAttackSpellCastPlan({ attack, sourceItem, targetItem = null, spellCast = null, turnState = null, outcome = "" } = {}) {
  const spell = getPcAttackSpell(attack?.spell?.spellId);
  if (!spell) return null;
  const sourceMeta = sourceItem?.metadata?.[META_KEY] || {};
  const blocked = (reason) => ({ ok: false, reason, spell });
  if (spell.types && !spell.types.includes(spellCast?.damageType)) return blocked("Scegli il tipo di danno.");
  if (spell.delivery === "auto" && targetItem && shieldedFrom(targetItem, spell.spellId))
    return blocked(`Il bersaglio è protetto da Scudo: ${spell.name} non lo colpisce.`);
  if (spell.fromActiveSpell) {
    const active = activeSpellCast(sourceMeta, spell.spellId);
    if (!active) return blocked(`${spell.name}: lancialo prima dal pannello incantesimi, poi registra qui il tocco.`);
    const slotLevel = Math.max(spell.level, active.slotLevel || spell.level);
    return { ok: true, spell, slotLevel, dice: pcAttackSpellDice(spell, slotLevel), firstOfCast: false, fromActiveSpell: true,
      instanceId: active.instanceId, index: 1, total: 1, next: null };
  }
  const turn = attackTurn(turnState);
  const turnKey = turn?.turnKey || "";
  const castId = String(spellCast?.castId || "").trim().slice(0, 120);
  if (!castId) return blocked("Lancio non identificato: riapri l'attacco.");
  const live = sourceMeta[PC_ATTACK_STATE_FIELD]?.spellCast || null;
  const continuing = !!live && live.castId === castId && live.spellId === spell.spellId && (live.turnKey || "") === turnKey
    && (live.index < live.total || live.leapPending === true);
  const requested = Math.floor(Number(spellCast?.slotLevel));
  const slotLevel = continuing ? live.slotLevel : (Number.isInteger(requested) && requested >= spell.level && requested <= 9 ? requested : null);
  if (!slotLevel) return blocked("Scegli il livello dello slot.");
  const targetIds = continuing && Array.isArray(live.targetIds) ? live.targetIds : [];
  // Chaos Bolt: each creature only once per cast, the leap included.
  if (spell.leap && targetItem && targetIds.includes(targetItem.id)) return blocked("Il dardo balza solo su una creatura non ancora bersagliata da questo lancio.");
  const index = continuing ? live.index + 1 : 1;
  const total = continuing ? (live.index < live.total ? live.total : live.total + 1) : pcAttackSpellCount(spell, slotLevel);
  const leapPending = !!spell.leap && spellCast?.doubles === true && ATTACK_HITS.has(outcome);
  // Pact Magic chosen in the console: the slot spent is the pact's (spellSlotSpendCore.js).
  const pact = continuing ? live.pact === true : spellCast?.pact === true;
  const next = index < total || leapPending
    ? { castId, spellId: spell.spellId, slotLevel, index, total, targetIds: [...targetIds, ...(targetItem ? [targetItem.id] : [])], turnKey, leapPending,
      ...(pact ? { pact: true } : {}) }
    : null;
  return { ok: true, spell, slotLevel, dice: pcAttackSpellDice(spell, slotLevel), firstOfCast: !continuing, index, total,
    ...(continuing && live.leapPending ? { leap: true } : {}), ...(pact ? { pact: true } : {}), leapPending, next };
}

// "TS Destrezza (CD 14)": the save of a saving throw cantrip, with the actor's spell save DC when the card has it; an
// arrow's save uses the Arcane Archer's DC.
export function pcAttackSaveLabel(attack, card = {}) {
  const ability = PC_ATTACK_SAVE_LABELS[pcAttackSave(attack)];
  if (!ability) return "";
  const dc = pcAttackSaveDC(attack, card);
  return `TS ${ability}${dc ? ` (CD ${dc})` : ""}`;
}

function pcAttackSaveDC(attack, card = {}) {
  if (attack?.mode) return pcAttackActivationSaveDC(getPcAttackActivation(attack.mode.id), card) || null;
  if (attack?.breath) return abilitySaveDC(card, "con");
  const dc = Number(card?.spellSaveDC);
  return Number.isFinite(dc) && dc > 0 ? dc : null;
}

export const PC_ATTACK_OUTCOME_LABELS = Object.freeze({ hit: "Colpito", critical: "Critico", miss: "Mancato", failed: "TS fallito", passed: "TS superato" });

export function pcAttackSelectionHint(status) {
  return {
    none: "Seleziona il bersaglio sulla mappa o nell'elenco.",
    boss: "Hai selezionato l'attaccante: seleziona il bersaglio.",
    untracked: "La creatura selezionata non è nel tracker.",
    invalid: "Seleziona una creatura sulla mappa.",
    multiple: "Più token selezionati: scegline uno nell'elenco.",
  }[status] || "";
}

function validAmount(value) {
  if (value === "" || value === null || value === undefined) return false;
  const amount = Number(value);
  return Number.isSafeInteger(amount) && amount >= 0 && amount <= 1000000;
}

function getEnabledClassFeatureIds(card) {
  return new Set(getEnabledClassFeatures(card || {}).map((feature) => feature.id));
}

function conditionInstancesOf(item) {
  const value = item?.metadata?.[META_KEY]?.conditions;
  return Array.isArray(value) ? value : Array.isArray(value?.instances) ? value.instances : [];
}

// A turn key only while the initiative order exists: out of combat nothing is counted per turn.
function attackTurn(turnState) {
  const turn = bossConditionAppliedAt(turnState);
  return turn?.turnKey ? turn : null;
}

function currentRiderUses(sourceMeta, turnKey) {
  const uses = sourceMeta?.[PC_ATTACK_STATE_FIELD]?.riderUses;
  return turnKey && Array.isArray(uses)
    ? uses.filter((use) => use && use.turnKey === turnKey && typeof use.riderId === "string").map((use) => ({ ...use }))
    : [];
}

function featureActive(sourceItem, featureId, round) {
  const meta = sourceItem?.metadata?.[META_KEY] || {};
  if (pcAttackRiderFeatureActive(meta, featureId, round)) return true;
  // The same state applied by hand from the Conditions popover (e.g. the "Ira" pill) counts too.
  const conditionName = getClassFeatureDefinition(featureId)?.effectPlan?.conditionName;
  return !!conditionName && conditionInstancesOf(sourceItem).some((instance) => instance?.active !== false && instance?.condition === conditionName);
}

function riderBlocker(rider, { attack, sourceItem, targetItem, turn, uses, round }) {
  const requires = rider.requires || {};
  // An arrow without attack roll (Seeking, Piercing) never "hits": no damage rider applies.
  if (attack.mode) return "Solo con un tiro per colpire.";
  // Casters' riders exist only on cantrips (Agonizing Blast only on Eldritch Blast); the others need a weapon.
  if (rider.spellOnly && !attack.cantrip) return "Solo per i trucchetti.";
  if (rider.spellIds && !rider.spellIds.includes(attack.cantrip?.spellId)) return rider.spellReason || "Non per questo trucchetto.";
  if ((attack.cantrip || attack.spell) && !rider.anyAttack && !rider.spellOnly) return "Solo per gli attacchi con arma.";
  if (requires.range && attack.range !== requires.range) return "Solo per gli attacchi in mischia.";
  if (requires.activeFeatureId && !featureActive(sourceItem, requires.activeFeatureId, round))
    return `${getClassFeatureDefinition(requires.activeFeatureId)?.name || "Il privilegio"} non è attiva.`;
  if (rider.limit?.per === "own-turn" && turn && turn.actorId !== sourceItem.id) return "Solo nel proprio turno.";
  if (rider.limit && turn) {
    const spent = uses.some((use) => use.riderId === rider.id && (rider.limit.scope !== "target" || use.targetId === targetItem?.id));
    if (spent) return rider.limit.scope === "target" ? "Già usato su questo bersaglio in questo turno." : "Già usato in questo turno.";
  }
  if ((requires.targetCondition || requires.targetBelowMax) && !targetItem) return "Scegli il bersaglio.";
  if (requires.targetCondition && !conditionInstancesOf(targetItem).some((instance) => (
    instance?.active !== false && instance?.condition === requires.targetCondition && instance?.sourceId === sourceItem.id
  ))) return `Il bersaglio non ha «${requires.targetCondition}» di ${sourceItem.name || "questo attaccante"}.`;
  if (requires.targetBelowMax) {
    const meta = targetItem.metadata?.[META_KEY] || {};
    // Temporary hit points are stored above hpMax: they never put a creature below its maximum.
    if (!Number.isFinite(meta.hp) || !Number.isFinite(meta.hpMax) || Math.min(meta.hp, meta.hpMax) >= meta.hpMax)
      return "Il bersaglio è al massimo dei PF.";
  }
  return "";
}

// The riders of this attacker for this attack: availability, suggested dice and the damage types allowed.
// Recomputed from live state at commit, so a rider spent or invalidated meanwhile is refused.
export function pcAttackRiderOptions({ action, spellId = "", attackMode = "", sourceItem, targetItem = null, turnState = null } = {}) {
  const attack = pcAttackResolvedAction(action, spellId, attackMode);
  if (!attack || !sourceItem) return [];
  return riderOptionsFor(attack, { sourceItem, targetItem, turnState });
}

function riderOptionsFor(attack, { sourceItem, targetItem = null, turnState = null }) {
  if (attack?.breath) return [];
  const sourceMeta = sourceItem.metadata?.[META_KEY] || {};
  const card = sourceMeta.initiativeCard || {};
  const turn = attackTurn(turnState);
  const uses = currentRiderUses(sourceMeta, turn?.turnKey);
  const weaponTypes = [...new Set(attack.components.map((component) => component.type))];
  // The attacker's riders, and those a pill grants whatever its class features (Call the Hunt on a willing ally).
  const own = pcAttackRidersForCard(card);
  const granted = PC_ATTACK_RIDERS.filter((rider) => rider.grantedByCondition && !own.includes(rider)
    && conditionInstancesOf(sourceItem).some((instance) => instance?.active !== false && instance?.condition === rider.grantedByCondition));
  return [...own, ...granted].map((rider) => {
    const slotLevels = pcAttackRiderSlotLevels(rider, card);
    const reason = riderBlocker(rider, { attack, sourceItem, targetItem, turn, uses, round: turnState?.round ?? null })
      || (rider.slot && !slotLevels.length ? "Livello da warlock mancante nel profilo." : "");
    // A smite's dice follow the slot level (and the undead/fiend bonus): one entry per level the GM may pick.
    const diceBySlot = (bonus) => Object.fromEntries(slotLevels.map((slotLevel) => [slotLevel, pcAttackRiderDice(rider, card, { slotLevel, bonus })]));
    return {
      id: rider.id, label: rider.label, dice: slotLevels.length ? pcAttackRiderDice(rider, card, { slotLevel: slotLevels[0] }) : pcAttackRiderDice(rider, card),
      types: rider.type === "weapon" ? weaponTypes : rider.type?.choice ? [...rider.type.choice] : [rider.type],
      limit: rider.limit ? { ...rider.limit } : null, available: !reason, reason,
      ...(slotLevels.length ? { slotLevels, diceBySlot: diceBySlot(false) } : {}),
      ...(rider.bonus && slotLevels.length ? { bonus: { label: rider.bonus.label, diceBySlot: diceBySlot(true) } } : {}),
      ...(rider.onHit ? { onHit: { ...rider.onHit } } : {}),
      ...(rider.limit && !turn ? { warning: "Fuori dal combattimento: il limite per turno non viene contato." } : {}),
    };
  });
}

// The cantrip's on-hit (or failed-save) pills, built by the spell pipeline the spell panel uses: the spell
// instance on the target, its effect pills and their expiry, so the existing pill, expiry and reminder engine
// handles them. Only the operations that apply them are kept, and only when there is at least one pill (a cantrip
// without an effect leaves nothing on the target).
const CANTRIP_PILL_OPERATIONS = new Set(["spell:upsert", "condition:add", "condition:automate"]);
export function pcAttackCantripPillOperations({ attack, sourceItem, targetItem, attackInstanceId, appliedAt = null, spellId = "", slotLevel = 0 } = {}) {
  // spellId: a weapon cantrip woven into a weapon attack (Booming Blade), or a leveled spell (Guiding Bolt, with its
  // slot level); otherwise the cantrip of the attack.
  const spell = getSpellDefinition(spellId || attack?.cantrip?.spellId || "");
  if (!spell || !sourceItem?.id || !targetItem?.id) return [];
  const castContext = { slotLevel, phase: "cast", choice: "", applyAutomatedConditions: true };
  const effects = getSpellEffects(spell, "", castContext);
  if (!effects.length) return [];
  // Always the spell on the target (the large pill, in the spell's colour) with its effects as linked mini pills
  // (parentEffectId), as the spell panel lays out a cast: also for Chill Touch and Ray of Frost, whose attack
  // resolution path would otherwise leave a lone effect pill without its spell.
  const name = spell.displayName || spell.name;
  const expiry = spell.expiry ? { ...spell.expiry } : { mode: "rounds", remaining: 1 };
  const theme = spellEffectThemeFor(spell);
  const summaryParts = getSpellSummaryParts(spell, "", castContext);
  const operations = catalogSpellApplicationOperations({
    targetIds: [targetItem.id], casterId: sourceItem.id, enteredName: name, name, storedName: spell.name, turns: 1,
    concentration: false, instanceId: `${attackInstanceId}:spell`, spellId: spell.id, spellExpiry: spell.expiry ? { ...spell.expiry } : null,
    appliedAt, castContext, ...(summaryParts.length ? { summaryParts } : {}), proposedEffects: effects,
    conditionOptions: { sourceId: sourceItem.id, sourceName: sourceItem.name || "", appliedAt, expiry, ...(theme ? { theme } : {}) },
    casterName: sourceItem.name || "", onSpellEnd: spell.onSpellEnd, persistSpell: true,
  });
  return operations.filter((operation) => CANTRIP_PILL_OPERATIONS.has(operation?.type));
}

// The pill labels a cantrip applies on a hit or a failed save (shown in the console before the commit).
export function pcAttackCantripPillLabels(spellId) {
  return (getSpellDefinition(spellId)?.effects || []).map((effect) => effect.label).filter(Boolean);
}

// Activations on a hit (phase 3A). The class feature's own rules decide what the card's activation decides (its
// resource, its parent feature, a pill already on the target): the attack plans them with the same pure functions.
function activationResources(activation, card, state) {
  const costs = pcAttackActivationCosts(activation);
  if (!costs.length) return [];
  return classFeatureResourceEntries(state, [{ resourceCosts: costs }], CLASS_FEATURE_RESOURCE_POOL_BY_ID, card.characterBuild, card.abilityModifiers)
    .map((entry) => ({ poolId: entry.pool.id, name: entry.pool.name, current: entry.current, maximum: entry.maximum, unlimited: entry.unlimited,
      amount: Number(costs.find((cost) => cost.poolId === entry.pool.id)?.amount) || 1 }));
}

function planActivationPill({ feature, card, state, sourceItem, targetId, turn, turnState, instanceId }) {
  return planClassFeatureActivation({
    state, feature, poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID, characterBuild: card.characterBuild, abilityModifiers: card.abilityModifiers,
    sourceId: sourceItem.id, targetIds: [targetId], currentRound: turn?.round ?? turnState?.round ?? 1, currentTurnKey: turn?.turnKey || "",
    instanceId, enabledFeatureIds: getEnabledClassFeatures(card).map((entry) => entry.id),
  });
}

function activationPlanReason(plan) {
  if (plan?.reason === "parent-feature-required") return `${getClassFeatureDefinition(plan.parentFeatureId)?.name || "La capacità di base"} non è attiva.`;
  if (plan?.reason === "feature-already-active") return "Già attiva su questo bersaglio.";
  if (plan?.reason === "resource-empty") return `${getClassFeatureResourcePool(plan.poolId)?.name || "Risorsa"}: nessun uso rimasto.`;
  return "Attivazione non disponibile.";
}

function activationBlocker(activation, { attack, sourceItem, targetItem, turn, uses, turnState, riderIds, damageTypes, resources, card, state, effect, outcome }) {
  const requires = activation.requires || {};
  const limit = pcAttackActivationLimit(activation);
  if (pcAttackSave(attack) || attack.spell?.delivery === "auto") return "Solo con un tiro per colpire.";
  if (outcome && !activation.preRoll && !ATTACK_HITS.has(outcome)) return "Solo se l'attacco colpisce.";
  if (activation.spellIds) {
    if (!activation.spellIds.includes(attack.cantrip?.spellId)) return "Solo con la Deflagrazione occulta.";
  } else if ((attack.cantrip || attack.spell) && !activation.anyAttack) return "Solo per gli attacchi con arma.";
  if (requires.range && attack.range !== requires.range) return requires.range === "melee" ? "Solo per gli attacchi in mischia." : "Solo per gli attacchi a distanza.";
  if ((requires.ownTurn || limit?.per === "own-turn") && turn && turn.actorId !== sourceItem.id) return "Solo nel proprio turno.";
  if (requires.reaction && turn && turn.actorId === sourceItem.id) return "Solo come reazione, fuori dal proprio turno.";
  if (requires.firstRound && turn && turn.round !== 1) return "Solo nel primo round del combattimento.";
  if (requires.activeFeatureId && !featureActive(sourceItem, requires.activeFeatureId, turnState?.round ?? null))
    return `${getClassFeatureDefinition(requires.activeFeatureId)?.name || "Il privilegio"} non è attiva.`;
  if (requires.riderId && !riderIds.includes(requires.riderId)) return `Solo insieme a ${getPcAttackRider(requires.riderId)?.label || "il suo extra"}.`;
  if (requires.damageType && !damageTypes.includes(requires.damageType)) return `Solo con danni da ${damageTypeLabel(requires.damageType)}.`;
  if (limit && turn && uses.some((use) => use.riderId === pcAttackActivationLimitKey(activation)))
    return activation.groupLimit ? `Già usato in questo turno (${activation.groupLabel}).` : "Già usato in questo turno.";
  const empty = resources.find((entry) => !entry.unlimited && entry.current !== null && entry.current < entry.amount);
  if (empty) return `${empty.name}: nessun uso rimasto.`;
  // A pill follows the card's activation rules: its parent feature, no second copy on the same creature.
  if (effect?.kind === "pill" && (effect.self || targetItem)) {
    const plan = planActivationPill({ feature: getClassFeatureDefinition(activation.id), card, state, sourceItem,
      targetId: effect.self ? sourceItem.id : targetItem.id, turn, turnState, instanceId: "pc-attack:preview" });
    if (!plan.ok) return activationPlanReason(plan);
  }
  return "";
}

// The activations of this attacker for this attack: availability, dice, save and effect. riders and extras are the
// ones chosen in the console (Wrath of the Order follows Divine Strike; Thunderbolt Strike needs lightning damage).
export function pcAttackActivationOptions({ action, spellId = "", attackMode = "", sourceItem, targetItem = null, turnState = null, riders = [], extras = [], outcome = "" } = {}) {
  const attack = pcAttackResolvedAction(action, spellId, attackMode);
  if (!attack || !sourceItem) return [];
  return activationOptionsFor(attack, { sourceItem, targetItem, turnState, outcome,
    riderIds: riders.map((rider) => rider?.id).filter(Boolean),
    damageTypes: [...riders, ...extras].map((entry) => entry?.type).filter(Boolean) });
}

function activationOptionsFor(attack, { sourceItem, targetItem = null, turnState = null, riderIds = [], damageTypes = [], outcome = "" }) {
  const sourceMeta = sourceItem.metadata?.[META_KEY] || {};
  const card = sourceMeta.initiativeCard || {};
  const turn = attackTurn(turnState);
  const uses = currentRiderUses(sourceMeta, turn?.turnKey);
  const state = sourceMeta[CLASS_FEATURE_STATE_FIELD];
  const weaponTypes = [...new Set(attack.components.map((component) => component.type))];
  return pcAttackActivationsForCard(card).map((activation) => {
    const effect = pcAttackActivationEffect(activation);
    const resources = activationResources(activation, card, state);
    const reason = activationBlocker(activation, { attack, sourceItem, targetItem, turn, uses, turnState, riderIds,
      damageTypes: [...weaponTypes, ...damageTypes], resources, card, state, effect, outcome });
    // The die is rolled once: it damages the target (damage) and/or a second creature (secondary). Inspiring Smite's dice
    // are a total of temporary hit points, never damage.
    const deals = pcAttackActivationDealsDamage(activation, card) && !activation.tempHp;
    const damage = deals && (!activation.secondary || activation.secondary.targetDamage);
    const dc = pcAttackActivationSaveDC(activation, card);
    const limit = pcAttackActivationLimit(activation);
    const rollBonus = pcAttackActivationRollBonus(activation, card);
    return {
      id: activation.id, label: pcAttackActivationLabel(activation),
      ...(activation.group ? { group: activation.group, groupLabel: activation.groupLabel } : {}),
      damage, dice: deals || activation.tempHp ? pcAttackActivationDice(activation, card) : null,
      ...(activation.tempHp ? { tempHp: true } : {}),
      ...(activation.choices ? { choices: activation.choices.map((choice) => {
        const choiceDc = pcAttackActivationSaveDC(activation, card, choice.save);
        return { id: choice.id, label: choice.label, effect: pcAttackActivationEffect(activation, choice.effect),
          save: choice.save ? { ability: choice.save, label: PC_ATTACK_SAVE_LABELS[choice.save], ...(choiceDc ? { dc: choiceDc } : {}) } : null };
      }) } : {}),
      ...(activation.hint ? { hint: activation.hint } : {}),
      ...(activation.burst ? { burst: { radiusFeet: activation.burst.radiusFeet } } : {}),
      types: !deals ? [] : activation.type === "weapon" ? weaponTypes : [activation.type],
      ...(deals && activation.secondary ? { secondary: { targetDamage: !!activation.secondary.targetDamage, note: activation.secondary.note } } : {}),
      ...(activation.preRoll ? { preRoll: true, ...(rollBonus ? { rollBonus } : {}) } : {}),
      save: activation.save ? { ability: activation.save, label: PC_ATTACK_SAVE_LABELS[activation.save], ...(dc ? { dc } : {}) } : null,
      effect, ...(activation.size ? { size: activation.size } : {}), ...(activation.note ? { note: activation.note } : {}),
      resources, limit: limit ? { ...limit } : null, available: !reason, reason,
      ...(limit && !turn ? { warning: "Fuori dal combattimento: il limite per turno non viene contato." } : {}),
    };
  });
}

// What the GM may do next because of this attack (shown after the commit, never applied by it).
// Inspiring Smite (Oath of Glory) follows a Divine Smite: a Channel Divinity the GM activates separately.
export function pcAttackFollowUps(card = {}, riders = [], activationIds = []) {
  const notes = riders.filter((rider) => rider.slotLevel)
    .map((rider) => `${rider.option?.label || rider.id}: slot di ${rider.slotLevel}° livello speso.`);
  if (riders.some((rider) => rider.id === "paladino-punizione-divina")
      && !activationIds.includes("paladino-giuramento-di-gloria-incanalare-divinita-punizione-ispiratrice")
      && getEnabledClassFeatureIds(card).has("paladino-giuramento-di-gloria-incanalare-divinita-punizione-ispiratrice"))
    notes.push("Punizione Ispiratrice: puoi usare Incanalare Divinità come azione bonus (capacità di classe del paladino).");
  return notes;
}

// The arrows that replace the attack roll for this attack (Seeking, Piercing): availability (enabled, a use of Arcane
// Shot left, one per turn), the arrow's extra die and the save DC. Offered for a ranged weapon attack only.
export function pcAttackModeOptions({ action, sourceItem, turnState = null } = {}) {
  const attack = pcAttackAction(action);
  if (!attack || ["cantrip", "spell", "breath"].includes(attack.source?.kind) || !sourceItem) return [];
  const card = sourceItem.metadata?.[META_KEY]?.initiativeCard || {};
  return pcAttackModesForCard(card).filter((mode) => !mode.requires?.range || mode.requires.range === attack.range)
    .map((mode) => modeOptionFor(mode, { sourceItem, turnState }));
}

function modeOptionFor(mode, { sourceItem, turnState = null }) {
  const sourceMeta = sourceItem.metadata?.[META_KEY] || {};
  const card = sourceMeta.initiativeCard || {};
  const turn = attackTurn(turnState);
  const uses = currentRiderUses(sourceMeta, turn?.turnKey);
  const resources = activationResources(mode, card, sourceMeta[CLASS_FEATURE_STATE_FIELD]);
  const limit = pcAttackActivationLimit(mode);
  const empty = resources.find((entry) => !entry.unlimited && entry.current !== null && entry.current < entry.amount);
  const reason = limit && turn && uses.some((use) => use.riderId === pcAttackActivationLimitKey(mode))
    ? `Già usato in questo turno (${mode.groupLabel}).` : empty ? `${empty.name}: nessun uso rimasto.` : "";
  const dc = pcAttackActivationSaveDC(mode, card);
  return { id: mode.id, kind: mode.mode, label: pcAttackActivationLabel(mode), damage: true, types: [mode.type],
    dice: pcAttackActivationDice(mode, card), save: { ability: mode.save, label: PC_ATTACK_SAVE_LABELS[mode.save], ...(dc ? { dc } : {}) },
    resources, limit: limit ? { ...limit } : null, available: !reason, reason,
    ...(limit && !turn ? { warning: "Fuori dal combattimento: il limite per turno non viene contato." } : {}) };
}

// The mode's resource and its per-turn use, planned on the attacker's class feature state.
function planModeSpend({ attack, sourceItem, turnState, turn, state }) {
  const mode = getPcAttackActivation(attack.mode.id);
  const option = modeOptionFor(mode, { sourceItem, turnState });
  if (!pcAttackModesForCard(sourceItem.metadata?.[META_KEY]?.initiativeCard || {}).includes(mode))
    throw new Error(`${option.label}: capacità non abilitata.`);
  if (!option.available) throw new Error(`${option.label}: ${option.reason} Riapri l'attacco.`);
  const card = sourceItem.metadata?.[META_KEY]?.initiativeCard || {};
  let next = state;
  for (const cost of pcAttackActivationCosts(mode)) {
    const pool = getClassFeatureResourcePool(cost.poolId);
    const entry = activationResources({ cost: [cost] }, card, next)[0];
    if (!pool || !entry) throw new Error(`${option.label}: risorsa sconosciuta.`);
    next = planClassFeatureResourceAdjustment(next, pool, card.characterBuild, { delta: -entry.amount }, card.abilityModifiers).state;
  }
  const spent = activationResources(mode, card, state).map((entry) => {
    const after = activationResources(mode, card, next).find((row) => row.poolId === entry.poolId);
    return { poolId: entry.poolId, name: entry.name, amount: entry.amount, ...(entry.current !== null ? { before: entry.current } : {}),
      ...(after?.current !== null && after?.current !== undefined ? { after: after.current } : {}) };
  });
  return { option, state: next, spent, uses: option.limit && turn ? [{ riderId: pcAttackActivationLimitKey(mode), turnKey: turn.turnKey }] : [] };
}

// The breath's own use (its trait's pool), read on the attacker's class feature state.
function breathOptionFor(attack, card, state) {
  const feature = getEnabledClassFeatures(card).find((entry) => entry.id === attack.breath.featureId) || null;
  const resources = feature
    ? classFeatureResourceEntries(state, [feature], CLASS_FEATURE_RESOURCE_POOL_BY_ID, card.characterBuild, card.abilityModifiers)
      .map((entry) => ({ poolId: entry.pool.id, name: entry.pool.name, current: entry.current, unlimited: entry.unlimited, amount: 1 }))
    : [];
  const empty = resources.find((entry) => !entry.unlimited && entry.current !== null && entry.current < entry.amount);
  const reason = !feature ? "tratto non disponibile per questo personaggio." : empty ? "nessun uso rimasto." : "";
  return { feature, resources, available: !reason, reason };
}

function planBreathSpend({ attack, card, state }) {
  const option = breathOptionFor(attack, card, state);
  if (!option.available) throw new Error(`${attack.breath.name}: ${option.reason} Riapri l'attacco.`);
  let next = state;
  for (const entry of option.resources) {
    next = planClassFeatureResourceAdjustment(next, getClassFeatureResourcePool(entry.poolId), card.characterBuild, { delta: -1 }, card.abilityModifiers).state;
  }
  const after = breathOptionFor(attack, card, next).resources;
  const spent = option.resources.map((entry) => {
    const left = after.find((row) => row.poolId === entry.poolId)?.current;
    return { poolId: entry.poolId, name: entry.name, amount: 1, ...(entry.current !== null ? { before: entry.current } : {}),
      ...(left !== null && left !== undefined ? { after: left } : {}) };
  });
  return { state: next, spent };
}

// What the console shows of a breath: its dice at this level, its DC and the shape of its area.
export function pcAttackBreathInfo(attack, card = {}) {
  if (!attack?.breath) return null;
  const feature = getClassFeatureDefinition(attack.breath.featureId);
  return { name: attack.breath.name, dice: pcAttackBreathDice(feature?.breath, card), damageType: attack.breath.damageType,
    shape: attack.area?.shape || "", dc: pcAttackSaveDC(attack, card), save: pcAttackSave(attack) };
}

// Creatures near a token (3C): the edge-to-edge grid distance of the area tool, within radiusFeet. The caster's
// emanation (area cantrips) or the target's (Bursting Arrow); the centre itself never counts.
export function pcAttackNearbyIds({ centerId, rows = [], dpi, feetPerCell, radiusFeet } = {}) {
  const center = rows.find((row) => row?.id === centerId);
  if (!center?.bounds || !(radiusFeet > 0)) return [];
  return rows.filter((row) => row?.id && row.id !== centerId && row.bounds)
    .filter((row) => { const reach = bossReachFeet(center.bounds, row.bounds, dpi, feetPerCell); return reach !== null && reach <= radiusFeet; })
    .map((row) => row.id);
}

// Weapon components first, then the chosen riders and activations, then the components added on the fly.
function attackComponents(attack, riders = [], extras = [], woven = null, activations = []) {
  return [
    ...attack.components.map((component) => ({ ...component, source: { kind: "weapon" } })),
    // A weapon cantrip's extra dice on the hit (from 5th level): a component of its own type.
    ...(woven ? [{ id: `w:${woven.spellId}`, type: woven.type, source: { kind: "cantrip", spellId: woven.spellId, name: woven.name } }] : []),
    ...riders.map((rider) => ({ id: `r:${rider.id}`, type: rider.type,
      source: { kind: "class-feature", featureId: rider.id, name: getPcAttackRider(rider.id)?.label || rider.id } })),
    ...activations.filter((activation) => activation.option?.damage).map((activation) => ({ id: `a:${activation.id}`, type: activation.type,
      source: { kind: "class-feature", featureId: activation.id, name: activation.option.label, activation: true } })),
    ...extras.map((extra, index) => ({ id: `x${index + 1}`, type: extra.type, ...(extra.label ? { label: extra.label } : {}),
      source: { kind: "manual", ...(extra.label ? { label: extra.label } : {}) } })),
  ];
}

function extraLabel(value) {
  return String(value ?? "").trim().slice(0, 40);
}

// What the GM sees before committing: the defenses that apply, the damage after them and the HP it leaves.
// The commit recomputes everything from live state; this is a read model only.
export function pcAttackPreview({
  action, spellId = "", sourceItem = null, targetItem = null, outcome = "", amounts = {}, ignoredDefenses = [],
  riders = [], extras = [], turnState = null, weaponCantrip = null, secondaryItem = null, activations = [], tempHpItems = [],
  attackMode = "", modeAmount = "", burstItems = [], spellCast = null,
} = {}) {
  const resolved = pcAttackResolvedAction(action, spellId, attackMode);
  if (!resolved) return { ready: false, blocker: pcAttackAction(action)
    ? (attackMode ? "Freccia non disponibile per questo attacco." : pcAttackAction(action).source?.kind === "spell" ? "Scegli l'incantesimo." : "Scegli il trucchetto.")
    : "Azione di attacco non valida.", defenses: [], profileDefenses: {}, total: 0, hp: null };
  // A leveled spell (lotto L4): the type picked, and the cast this registration opens or continues.
  const attack = pcAttackWithSpellType(resolved, spellCast?.damageType);
  const spellPlan = attack.spell && sourceItem ? pcAttackSpellCastPlan({ attack, sourceItem, targetItem, spellCast, turnState, outcome }) : null;
  if (attack.area) return { ready: false, blocker: "Attacco ad area: scegli le creature dell'area.", defenses: [], profileDefenses: {}, total: 0, hp: null };
  const card = sourceItem?.metadata?.[META_KEY]?.initiativeCard || {};
  // A miss or a passed save deals no damage (half with Potent Cantrip); extras only with a hit or a failed save.
  const factor = pcAttackDamageFactor(attack, outcome, sourceItem?.metadata?.[META_KEY]?.initiativeCard);
  const miss = factor === "zero";
  const extrasAllowed = extrasAllowedFor(attack, outcome);
  const chosenRiders = extrasAllowed ? riders : [];
  const chosenExtras = extrasAllowed ? extras.map((extra) => ({ ...extra, label: extraLabel(extra.label) })) : [];
  const wovenOption = extrasAllowed && weaponCantrip?.spellId
    ? pcAttackWeaponCantripOptions(action, card).find((option) => option.spellId === weaponCantrip.spellId) || null : null;
  const woven = wovenOption?.dice?.hit ? wovenOption : null;
  // Activations: only with an attack roll (on a miss only those used on the roll), checked like the riders.
  const activationOptions = ATTACK_ROLL_OUTCOMES.has(outcome) && activations.length && sourceItem
    ? activationOptionsFor(attack, { sourceItem, targetItem, turnState, outcome, riderIds: chosenRiders.map((rider) => rider.id),
      damageTypes: [...chosenRiders, ...chosenExtras].map((entry) => entry.type).filter(Boolean) }) : [];
  const chosenActivations = ATTACK_ROLL_OUTCOMES.has(outcome)
    ? activations.map((request) => ({ ...request, option: activationOptions.find((entry) => entry.id === request.id) || null })) : [];
  // The arrow that replaces the attack roll: its extra die is one more component, halved with the rest on a success.
  const modeOption = attack.mode && sourceItem ? modeOptionFor(getPcAttackActivation(attack.mode.id), { sourceItem, turnState }) : null;
  if (modeOption && outcome && factor !== "zero") chosenActivations.push({ id: modeOption.id, type: modeOption.types[0], amount: modeAmount, option: { ...modeOption, save: null } });
  const components = attackComponents(attack, chosenRiders, chosenExtras, woven, chosenActivations.filter((activation) => activation.option));
  const allAmounts = {
    ...amounts,
    ...(woven ? { [`w:${woven.spellId}`]: weaponCantrip.amount } : {}),
    ...Object.fromEntries(chosenActivations.filter((activation) => activation.option?.damage).map((activation) => [`a:${activation.id}`, activation.amount])),
    ...Object.fromEntries(chosenRiders.map((rider) => [`r:${rider.id}`, rider.amount])),
    ...Object.fromEntries(chosenExtras.map((extra, index) => [`x${index + 1}`, extra.amount])),
  };
  const profileDefenses = targetItem ? damageDefensesForItem(targetItem, META_KEY) : {};
  const defenses = relevantDamageDefenses(profileDefenses, components.filter((component) => damageTypeSet.has(component.type)), ignoredDefenses);
  // Full damage on a hit, a critical or a failed save (the shared helper would halve a "passed" save).
  const total = targetItem && outcome && !miss
    ? bossDefendedDamage(components, allAmounts, factor === "half" ? "passed" : "hit", profileDefenses, ignoredDefenses) : 0;
  const meta = targetItem?.metadata?.[META_KEY] || {};
  const hp = targetItem && Number.isFinite(meta.hp) && Number.isFinite(meta.hpMax)
    ? { before: meta.hp, after: miss ? meta.hp : calculateQuickHPChange({ value: total, hp: meta.hp, hpMax: meta.hpMax }).afterHP, hpMax: meta.hpMax }
    : null;
  const options = chosenRiders.length && sourceItem ? riderOptionsFor(attack, { sourceItem, targetItem, turnState }) : [];
  const riderBlock = chosenRiders.map((rider) => {
    const option = options.find((entry) => entry.id === rider.id);
    if (!option) return "Extra non disponibile per questo attaccante.";
    if (!option.available) return `${option.label}: ${option.reason}`;
    if (option.slotLevels && !option.slotLevels.includes(rider.slotLevel)) return `${option.label}: scegli il livello dello slot.`;
    return option.types.includes(rider.type) ? "" : `${option.label}: scegli il tipo di danno.`;
  }).find(Boolean) || "";
  // The second creature: Green-Flame Blade's fire or an activation's die (Sweeping Attack, Slashing Flourish, Wails
  // from the Grave). One per attack; its own defenses, its own hit points.
  const wovenSecondary = wovenOption?.secondary && weaponCantrip?.secondary?.targetId
    ? { targetId: weaponCantrip.secondary.targetId, amount: weaponCantrip.secondary.amount, type: wovenOption.type } : null;
  const activationSecondary = chosenActivations.find((activation) => activation.option?.secondary && activation.secondaryTargetId) || null;
  const secondarySource = wovenSecondary
    || (activationSecondary ? { targetId: activationSecondary.secondaryTargetId, amount: activationSecondary.amount, type: activationSecondary.type } : null);
  const secondaryWanted = !!secondarySource;
  const secondaryDefenses = secondaryWanted && secondaryItem ? damageDefensesForItem(secondaryItem, META_KEY) : {};
  const secondaryMeta = secondaryItem?.metadata?.[META_KEY] || {};
  const secondaryTotal = secondaryWanted && secondaryItem && validAmount(secondarySource.amount) && damageTypeSet.has(secondarySource.type)
    ? bossDefendedDamage([{ id: "s1", type: secondarySource.type }], { s1: secondarySource.amount }, "hit", secondaryDefenses, []) : 0;
  const secondary = secondaryWanted && secondaryItem ? { id: secondaryItem.id, total: secondaryTotal, profileDefenses: secondaryDefenses,
    hp: Number.isFinite(secondaryMeta.hp) && Number.isFinite(secondaryMeta.hpMax)
      ? { before: secondaryMeta.hp, after: calculateQuickHPChange({ value: secondaryTotal, hp: secondaryMeta.hp, hpMax: secondaryMeta.hpMax }).afterHP, hpMax: secondaryMeta.hpMax }
      : null } : null;
  const wovenBlocker = !weaponCantrip?.spellId || !extrasAllowed ? ""
    : !wovenOption ? "Trucchetto con l'arma non disponibile per questo attacco."
    : woven && !validAmount(weaponCantrip.amount) ? `Inserisci il danno di ${wovenOption.name}.`
    : wovenSecondary && !validAmount(wovenSecondary.amount) ? "Inserisci il danno della seconda creatura."
    : "";
  const secondaryBlocker = !secondaryWanted ? ""
    : wovenSecondary && activationSecondary ? "Una sola seconda creatura per attacco."
    : !secondaryItem || secondaryItem.id === targetItem?.id || secondaryItem.id !== secondarySource.targetId ? "Scegli un'altra creatura come seconda."
    : !secondary?.hp ? "La seconda creatura non ha HP canonici validi."
    : "";
  const groups = new Set();
  const activationBlock = chosenActivations.map((activation) => {
    const option = activation.option;
    if (!option) return "Attivazione non disponibile per questo attaccante.";
    if (!option.available) return `${option.label}: ${option.reason}`;
    if (option.group && groups.has(option.group)) return `${option.label}: ${option.groupLabel}.`;
    if (option.group) groups.add(option.group);
    if (option.types.length && !option.types.includes(activation.type)) return `${option.label}: scegli il tipo di danno.`;
    if (option.secondary && !activation.secondaryTargetId) return `${option.label}: scegli la seconda creatura.`;
    if ((option.damage || option.secondary) && !validAmount(activation.amount)) return `Inserisci il danno di ${option.label}.`;
    const choice = option.choices ? option.choices.find((entry) => entry.id === activation.choice) : null;
    if (option.choices && !choice) return `${option.label}: scegli l'effetto.`;
    if (option.tempHp) {
      const reason = tempHpBlocker(option, activation, { items: tempHpItems, targetItem, secondaryItem });
      if (reason) return reason;
    }
    if (option.burst) {
      const reason = burstBlocker(option, activation, { items: burstItems, targetItem, secondaryItem });
      if (reason) return reason;
    }
    return (choice ? choice.save : option.save) && !PC_ATTACK_SAVE_OUTCOMES.includes(activation.saveOutcome)
      ? `${option.label}: scegli l'esito del tiro salvezza.` : "";
  }).find(Boolean) || "";
  const modeBlocker = !modeOption ? "" : !modeOption.available ? `${modeOption.label}: ${modeOption.reason}` : "";
  // Vampiric Touch: the caster regains half the necrotic damage dealt.
  const sourceMeta = sourceItem?.metadata?.[META_KEY] || {};
  // Only the spell's own necrotic damage counts (after the target's defenses), not the extras.
  const spellDamage = spellPlan?.ok && attack.spell.casterHealRatio && targetItem && outcome && !miss && validAmount(amounts?.c1)
    ? bossDefendedDamage([attack.components[0]], { c1: amounts.c1 }, "hit", profileDefenses, ignoredDefenses) : 0;
  const casterHeal = spellDamage > 0 && Number.isFinite(sourceMeta.hp) && Number.isFinite(sourceMeta.hpMax)
    ? spellCasterHealingChange({ damageChanges: [{ requested: spellDamage }], ratio: attack.spell.casterHealRatio, hp: sourceMeta.hp, hpMax: sourceMeta.hpMax })
    : null;
  const spellBlocker = attack.spell && !spellPlan ? "Scegli l'attaccante." : spellPlan && !spellPlan.ok ? spellPlan.reason : "";
  const blocker = !targetItem ? "Scegli il bersaglio."
    : spellBlocker ? spellBlocker
    : modeBlocker ? modeBlocker
    : !pcAttackOutcomesFor(attack).includes(outcome) ? (pcAttackSave(attack) ? "Scegli l'esito del tiro salvezza." : "Scegli l'esito dell'attacco.")
    : !miss && attack.components.some((component) => !validAmount(amounts?.[component.id])) ? "Inserisci il danno di ogni componente."
    : riderBlock ? riderBlock
    : chosenExtras.some((extra) => !damageTypeSet.has(extra.type)) ? "Scegli il tipo di ogni componente extra."
    : [...chosenRiders, ...chosenExtras].some((entry) => !validAmount(entry.amount)) ? "Inserisci il danno di ogni extra."
    : wovenBlocker ? wovenBlocker
    : activationBlock ? activationBlock
    : secondaryBlocker ? secondaryBlocker
    : !hp ? "Il bersaglio non ha HP canonici validi."
    : "";
  return { ready: !blocker, blocker, defenses, profileDefenses, total, hp, ...(secondary ? { secondary } : {}),
    ...(spellPlan?.ok ? { spell: { slotLevel: spellPlan.slotLevel, dice: spellPlan.dice, index: spellPlan.index, total: spellPlan.total,
      firstOfCast: spellPlan.firstOfCast, ...(spellPlan.leap ? { leap: true } : {}), ...(spellPlan.fromActiveSpell ? { fromActiveSpell: true } : {}),
      ...(casterHeal ? { casterHeal: { amount: casterHeal.requested, before: casterHeal.hp, after: casterHeal.afterHP, hpMax: casterHeal.hpMax } } : {}) } } : {}) };
}

export function buildPcAttackMutation({
  action, sourceItem, targetItem, outcome = "", componentAmounts = {}, attackInstanceId,
  ignoredDefenses = [], expectedDefenses, turnState = null, riders = [], extras = [], spellId = "",
  weaponCantrip = null, secondaryItem = null, expectedSecondaryDefenses, activations = [], tempHpItems = [],
  attackMode = "", modeAmount = null, burstItems = [], expectedBurstDefenses = {}, spellCast = null, linkItems = [],
} = {}) {
  if (!isBossActionCreature(sourceItem) || !isBossActionCreature(targetItem))
    throw new Error("Attaccante e bersaglio devono essere token creatura reali.");
  if (sourceItem.id === targetItem.id) throw new Error("L'attaccante non può essere anche il bersaglio.");
  if (!attackInstanceId || typeof attackInstanceId !== "string") throw new Error("Identità dell'attacco mancante.");
  if (!pcAttackAction(action)) throw new Error("Azione rapida di attacco non valida.");
  const resolved = pcAttackResolvedAction(action, spellId, attackMode);
  if (!resolved) throw new Error(attackMode ? "Freccia non disponibile per questo attacco."
    : pcAttackAction(action).source?.kind === "spell" ? "Incantesimo non disponibile per questa azione." : "Trucchetto non disponibile per questa azione.");
  const attack = pcAttackWithSpellType(resolved, spellCast?.damageType);
  if (attack.area) throw new Error("Attacco ad area: registralo con le creature dell'area.");
  if (!pcAttackOutcomesFor(attack).includes(outcome))
    throw new Error(pcAttackSave(attack) ? "Scegli l'esito del tiro salvezza." : "Scegli l'esito dell'attacco.");
  // A leveled spell (lotto L4): checked against the live cast (pcAttackState.spellCast) and the caster's concentration.
  const spellPlan = attack.spell ? pcAttackSpellCastPlan({ attack, sourceItem, targetItem, spellCast, turnState, outcome }) : null;
  if (spellPlan && !spellPlan.ok) throw new Error(`${spellPlan.reason} Riapri l'attacco.`);
  const factor = pcAttackDamageFactor(attack, outcome, sourceItem.metadata?.[META_KEY]?.initiativeCard);
  const miss = factor === "zero";
  const riderRequests = Array.isArray(riders) ? riders : [];
  const extraRequests = Array.isArray(extras) ? extras : [];
  if (!extrasAllowedFor(attack, outcome) && (riderRequests.length || extraRequests.length))
    throw new Error(pcAttackSave(attack) ? "Gli extra valgono solo se il tiro salvezza fallisce." : "Gli extra al colpo valgono solo se l'attacco colpisce.");
  if (new Set(riderRequests.map((rider) => rider?.id)).size !== riderRequests.length) throw new Error("Lo stesso extra è indicato due volte.");
  if (extraRequests.length > MAX_PC_ATTACK_EXTRAS) throw new Error(`Al massimo ${MAX_PC_ATTACK_EXTRAS} componenti extra.`);
  const turn = attackTurn(turnState);
  const sourceMeta = sourceItem.metadata?.[META_KEY] || {};
  // Riders are checked against the live attacker, target and turn: the console may be stale.
  const options = riderRequests.length ? riderOptionsFor(attack, { sourceItem, targetItem, turnState }) : [];
  const chosenRiders = riderRequests.map((request) => {
    const option = options.find((entry) => entry.id === request?.id);
    if (!option) throw new Error("Extra non disponibile per questo attaccante: riapri l'attacco.");
    if (!option.available) throw new Error(`${option.label}: ${option.reason} Riapri l'attacco.`);
    if (!option.types.includes(request.type)) throw new Error(`${option.label}: tipo di danno non valido.`);
    // A smite needs one of its slot levels; the bonus and the on-hit effect exist only where the rider has them.
    const slotLevel = option.slotLevels ? request.slotLevel : null;
    if (option.slotLevels && !option.slotLevels.includes(slotLevel)) throw new Error(`${option.label}: scegli il livello dello slot.`);
    if (request.bonus === true && !option.bonus) throw new Error(`${option.label}: bonus non previsto.`);
    if (request.onHit === true && !option.onHit) throw new Error(`${option.label}: effetto non previsto.`);
    const bonus = request.bonus === true;
    const dice = slotLevel ? (bonus ? option.bonus.diceBySlot : option.diceBySlot)[slotLevel] : option.dice;
    return { id: option.id, type: request.type, amount: damageAmount(request.amount), option, slotLevel, bonus, onHit: request.onHit === true, dice };
  });
  const chosenExtras = extraRequests.map((request) => {
    if (!damageTypeSet.has(request?.type)) throw new Error("Tipo di danno non valido in una componente extra.");
    return { type: request.type, label: extraLabel(request.label), amount: damageAmount(request.amount) };
  });
  // A weapon cantrip (Booming Blade, Green-Flame Blade): only on a hit with a melee weapon the actor weaves it into.
  let woven = null;
  if (weaponCantrip) {
    if (!DAMAGING_OUTCOMES.has(outcome)) throw new Error("Il trucchetto con l'arma vale solo se l'attacco colpisce.");
    const option = pcAttackWeaponCantripOptions(action, sourceMeta.initiativeCard).find((entry) => entry.spellId === weaponCantrip.spellId);
    if (!option) throw new Error("Trucchetto con l'arma non disponibile per questo attacco: riapri l'attacco.");
    let secondary = null;
    if (weaponCantrip.secondary) {
      if (!option.secondary) throw new Error(`${option.name}: nessuna seconda creatura.`);
      if (!secondaryItem || secondaryItem.id !== weaponCantrip.secondary.targetId) throw new Error("La seconda creatura non è più nella scena.");
      if (!isBossActionCreature(secondaryItem) || [sourceItem.id, targetItem.id].includes(secondaryItem.id))
        throw new Error("Scegli come seconda creatura un'altra creatura.");
      secondary = { item: secondaryItem, amount: damageAmount(weaponCantrip.secondary.amount) };
    }
    woven = { ...option, amount: option.dice.hit ? damageAmount(weaponCantrip.amount) : null, secondary };
  }
  const activationPlan = planPcAttackActivations({ requests: activations, attack, outcome, sourceItem, targetItem, turnState, turn,
    attackInstanceId, chosenRiders, chosenExtras, secondaryItem, wovenSecondary: !!woven?.secondary, tempHpItems, burstItems,
    modeAmount, factor });
  const amounts = componentAmounts && typeof componentAmounts === "object" ? componentAmounts : {};
  if (!miss && Object.keys(amounts).some((id) => !attack.components.some((component) => component.id === id)))
    throw new Error("Componente di danno sconosciuta.");
  const components = attackComponents(attack, chosenRiders, chosenExtras, woven?.amount !== null && woven ? woven : null, activationPlan.chosen);
  const inputs = Object.fromEntries([
    ...attack.components.map((component) => [component.id, miss ? null : damageAmount(amounts[component.id])]),
    ...(woven && woven.amount !== null ? [[`w:${woven.spellId}`, woven.amount]] : []),
    ...chosenRiders.map((rider) => [`r:${rider.id}`, rider.amount]),
    ...activationPlan.chosen.filter((activation) => activation.option.damage).map((activation) => [`a:${activation.id}`, activation.amount]),
    ...chosenExtras.map((extra, index) => [`x${index + 1}`, extra.amount]),
  ]);
  // A critical hit keeps the full factor: the totals the GM enters already include the doubled dice.
  const damageComponents = defendedComponents(components, inputs, factor, targetItem, ignoredDefenses, expectedDefenses);
  const requestedDamage = damageComponents.reduce((sum, component) => sum + component.amount, 0);
  const targetMeta = targetItem.metadata?.[META_KEY] || {};
  let change = null;
  if (!miss) {
    if (!Number.isFinite(targetMeta.hp) || !Number.isFinite(targetMeta.hpMax)
        || targetMeta.hp < 0 || targetMeta.hpMax < 0) throw new Error("Il bersaglio non ha HP canonici validi.");
    change = calculateQuickHPChange({ value: requestedDamage, hp: targetMeta.hp, hpMax: targetMeta.hpMax,
      deathSaveDamage: takesDeathSaveDamage(targetMeta) });
  }
  // The second creature: Green-Flame Blade's fire, or an activation's die (Sweeping Attack, Slashing Flourish, Wails from
  // the Grave); its own defenses (as seen in the console) and HP.
  const activationSecondary = activationPlan.secondary;
  const secondaryItemUsed = woven?.secondary?.item || activationSecondary?.item || null;
  const secondaryComponents = woven?.secondary
    ? defendedComponents([{ id: "s1", type: woven.type, source: { kind: "cantrip", spellId: woven.spellId, name: woven.name } }],
      { s1: woven.secondary.amount }, "full", secondaryItemUsed, [], expectedSecondaryDefenses)
    : activationSecondary
      ? defendedComponents([{ id: "s1", type: activationSecondary.type, source: { kind: "class-feature", featureId: activationSecondary.id,
        name: activationSecondary.option.label, activation: true } }], { s1: activationSecondary.amount }, "full", secondaryItemUsed, [], expectedSecondaryDefenses)
      : [];
  // Vampiric Touch: the caster regains half the spell's necrotic damage, after the target's defenses.
  const sourceHpMeta = sourceItem.metadata?.[META_KEY] || {};
  const spellNecrotic = spellPlan?.ok && attack.spell.casterHealRatio && !miss
    ? damageComponents.find((component) => component.id === "c1")?.amount || 0 : 0;
  const casterHealChange = spellNecrotic > 0 && Number.isFinite(sourceHpMeta.hp) && Number.isFinite(sourceHpMeta.hpMax)
    ? spellCasterHealingChange({ damageChanges: [{ requested: spellNecrotic }], ratio: attack.spell.casterHealRatio, hp: sourceHpMeta.hp, hpMax: sourceHpMeta.hpMax })
    : null;
  const secondaryMeta = secondaryItemUsed?.metadata?.[META_KEY] || {};
  let secondaryChange = null;
  if (secondaryItemUsed) {
    if (!Number.isFinite(secondaryMeta.hp) || !Number.isFinite(secondaryMeta.hpMax) || secondaryMeta.hp < 0 || secondaryMeta.hpMax < 0)
      throw new Error("La seconda creatura non ha HP canonici validi.");
    secondaryChange = calculateQuickHPChange({ value: secondaryComponents.reduce((sum, component) => sum + component.amount, 0),
      hp: secondaryMeta.hp, hpMax: secondaryMeta.hpMax, deathSaveDamage: takesDeathSaveDamage(secondaryMeta) });
  }
  // Bursting Arrow: the die hits every creature the GM kept around the target, each with its own defenses and HP.
  const burstRows = (activationPlan.burst?.items || []).map((item) => {
    const meta = item.metadata?.[META_KEY] || {};
    if (!Number.isFinite(meta.hp) || !Number.isFinite(meta.hpMax) || meta.hp < 0 || meta.hpMax < 0)
      throw new Error(`${item.name || item.id} non ha HP canonici validi.`);
    const components = defendedComponents([{ id: "b1", type: activationPlan.burst.type, source: { kind: "class-feature",
      featureId: activationPlan.burst.id, name: activationPlan.burst.option.label, activation: true } }],
    { b1: activationPlan.burst.amount }, "full", item, [], expectedBurstDefenses?.[item.id]);
    return { item, meta, components, change: calculateQuickHPChange({ value: components.reduce((sum, component) => sum + component.amount, 0),
      hp: meta.hp, hpMax: meta.hpMax, deathSaveDamage: takesDeathSaveDamage(meta) }) };
  });
  const sourceName = sourceItem.name || sourceItem.id;
  const targetName = targetItem.name || targetItem.id;
  // Only the uses of the current turn are kept: the field never grows past one turn.
  const newUses = turn ? chosenRiders.filter((rider) => rider.option.limit).map((rider) => ({
    riderId: rider.id, turnKey: turn.turnKey, ...(rider.option.limit.scope === "target" ? { targetId: targetItem.id } : {}),
  })) : [];
  const riderUses = [...currentRiderUses(sourceMeta, turn?.turnKey), ...newUses, ...activationPlan.uses];
  const state = {
    version: PC_ATTACK_STATE_VERSION,
    lastAttack: {
      attackInstanceId, quickActionId: attack.id, targetId: targetItem.id, outcome, ...(attack.cantrip ? { spellId: attack.cantrip.spellId } : {}),
      ...(attack.spell ? { spellId: attack.spell.spellId } : {}), ...(turn ? { round: turn.round, turnKey: turn.turnKey } : {}),
    },
    ...(riderUses.length ? { riderUses } : {}),
    // The cast still open: rays or darts left, or a pending leap. Any other attack closes it.
    ...(spellPlan?.next ? { spellCast: spellPlan.next } : {}),
  };
  const componentOf = (id) => damageComponents.find((component) => component.id === id);
  // A cantrip is named by the spell; its dice follow the attacker's character level.
  const actionName = attack.cantrip ? attack.cantrip.name : attack.spell ? attack.spell.name : attack.label;
  const cantripDice = pcAttackCantripDiceFor(attack, sourceMeta.initiativeCard, targetItem);
  const saveLabel = pcAttackSaveLabel(attack, sourceMeta.initiativeCard);
  const causality = {
    actor: { id: sourceItem.id, tokenId: sourceItem.id, name: sourceName, role: "attacker" },
    cause: { kind: PC_ATTACK_HISTORY_KIND, quickActionId: attack.id, actionName: actionName, attackInstanceId, range: attack.range,
      ...(attack.cantrip ? { spellId: attack.cantrip.spellId, spellName: attack.cantrip.name } : {}),
      ...(attack.spell ? { spellId: attack.spell.spellId, spellName: attack.spell.name, slotLevel: spellPlan.slotLevel } : {}) },
    action: { id: attack.id, label: actionName, ...(pcAttackSave(attack) ? {} : { attackOutcome: outcome }) },
    attack: { range: attack.range, outcome, source: attack.cantrip ? "cantrip" : attack.spell ? "spell" : "weapon" },
    // slotTracked turns true when pcAttackExecution.js spends the slot in the first registration's command.
    ...(attack.spell ? { spell: { spellId: attack.spell.spellId, name: attack.spell.name, level: attack.spell.level,
      slotLevel: spellPlan.slotLevel, dice: spellPlan.dice, type: attack.components[0].type, typeLabel: damageTypeLabel(attack.components[0].type),
      index: spellPlan.index, total: spellPlan.total, firstOfCast: spellPlan.firstOfCast, slotTracked: false, ...(spellPlan.pact ? { pact: true } : {}),
      ...(spellPlan.leap ? { leap: true } : {}), ...(spellPlan.leapPending ? { leapPending: true } : {}),
      ...(spellPlan.fromActiveSpell ? { fromActiveSpell: true, instanceId: spellPlan.instanceId } : {}),
      ...(casterHealChange?.changed ? { casterHeal: { amount: casterHealChange.requested, before: casterHealChange.hp, after: casterHealChange.afterHP } } : {}) } } : {}),
    ...(attack.cantrip ? { cantrip: { ...attack.cantrip, ...(cantripDice ? { dice: cantripDice } : {}), ...(saveLabel ? { saveLabel } : {}) } } : {}),
    ...(pcAttackSave(attack) ? { save: { ability: pcAttackSave(attack), outcome, ...(factor === "half" && !attack.saveHalf ? { potentCantrip: true } : {}),
      ...(pcAttackSaveDC(attack, sourceMeta.initiativeCard) ? { dc: pcAttackSaveDC(attack, sourceMeta.initiativeCard) } : {}) } } : {}),
    // An arrow that replaced the attack roll (Seeking): its name and the halving on a success.
    ...(attack.mode ? { mode: { id: attack.mode.id, label: attack.mode.label, kind: attack.mode.kind } } : {}),
    ...(turn ? { turn } : {}),
    ...(chosenRiders.length ? { riders: chosenRiders.map((rider) => ({
      featureId: rider.id, name: rider.option.label, ...(rider.dice ? { dice: rider.dice } : {}),
      type: rider.type, typeLabel: damageTypeLabel(rider.type), inputAmount: rider.amount, amount: componentOf(`r:${rider.id}`).amount,
      ...(rider.option.limit ? { limit: { ...rider.option.limit } } : {}),
      // slotTracked turns true when pcAttackExecution.js spends the slot in the attack's command.
      ...(rider.slotLevel ? { slotLevel: rider.slotLevel, slotTracked: false } : {}),
      ...(rider.bonus ? { bonus: rider.option.bonus.label } : {}),
      ...(rider.onHit ? { condition: rider.option.onHit.condition } : {}),
    })) } : {}),
    ...(activationPlan.chosen.length ? { activations: activationPlan.chosen.map((activation) => ({
      featureId: activation.id, name: activation.option.label, ...(activation.option.group ? { group: activation.option.group } : {}),
      ...(activation.option.damage ? { ...(activation.option.dice ? { dice: activation.option.dice } : {}), type: activation.type,
        typeLabel: damageTypeLabel(activation.type), inputAmount: activation.amount, amount: componentOf(`a:${activation.id}`).amount } : {}),
      ...(activation.choice ? { choice: { id: activation.choice.id, label: activation.choice.label } } : {}),
      ...(activation.save ? { save: { ability: activation.save.ability, label: activation.save.label,
        ...(activation.save.dc ? { dc: activation.save.dc } : {}), outcome: activation.saveOutcome } } : {}),
      ...(activation.effect ? { effect: { kind: activation.effect.kind, label: activation.effect.label,
        ...(activation.effect.self ? { self: true } : {}), applied: activation.applies } } : {}),
      ...(activation.tempHp ? { dice: activation.option.dice, total: activation.amount, tempHp: activation.tempHp.map((row) => ({
        targetId: row.item.id, name: row.item.name || row.item.id, amount: row.amount, before: row.change.hp, after: row.change.afterHP })) } : {}),
      ...(activation.spent.length ? { spent: activation.spent } : {}),
      ...(activation.option.rollBonus ? { rollBonus: activation.option.rollBonus } : {}),
      ...(activationSecondary?.id === activation.id ? { secondary: { targetId: activationSecondary.item.id,
        name: activationSecondary.item.name || activationSecondary.item.id } } : {}),
      ...(activationPlan.burst?.id === activation.id ? { burst: burstRows.map((row) => ({ targetId: row.item.id, name: row.item.name || row.item.id })) } : {}),
    })) } : {}),
    ...(chosenExtras.length ? { extras: chosenExtras.map((extra, index) => ({
      ...(extra.label ? { label: extra.label } : {}), type: extra.type, typeLabel: damageTypeLabel(extra.type),
      inputAmount: extra.amount, amount: componentOf(`x${index + 1}`).amount,
    })) } : {}),
    ...(woven ? { weaponCantrip: { spellId: woven.spellId, name: woven.name, type: woven.type,
      ...(woven.dice.hit ? { dice: woven.dice.hit } : {}), ...(woven.dice.trigger ? { triggerDice: woven.dice.trigger } : {}),
      ...(woven.secondary ? { secondaryDice: woven.dice.secondary, secondaryTargetId: secondaryItemUsed.id } : {}) } } : {}),
    targets: [{
      id: targetItem.id, name: targetName, outcome, requestedDamage,
      ...(change ? { appliedHpDelta: change.delta } : {}),
      damageComponents: structuredClone(damageComponents),
    }, ...(secondaryItemUsed ? [{
      id: secondaryItemUsed.id, name: secondaryItemUsed.name || secondaryItemUsed.id, outcome: "secondary",
      requestedDamage: secondaryComponents.reduce((sum, component) => sum + component.amount, 0),
      appliedHpDelta: secondaryChange.delta, damageComponents: structuredClone(secondaryComponents),
    }] : []), ...burstRows.map((row) => ({
      id: row.item.id, name: row.item.name || row.item.id, outcome: "burst", requestedDamage: row.change.requested,
      appliedHpDelta: row.change.delta, damageComponents: structuredClone(row.components),
    }))],
  };
  const label = `${sourceName}: ${actionName} → ${targetName}`;
  // On-hit conditions (Eldritch Smite: Prono): standard pills, removed by hand, undone with the attack.
  const appliedAt = bossConditionAppliedAt(turnState);
  const conditions = chosenRiders.filter((rider) => rider.onHit).map((rider) => ({
    condition: rider.option.onHit.condition, featureId: rider.id,
    instanceId: bossGroupConditionInstanceId(attackInstanceId, rider.option.onHit.condition, targetItem.id),
  }));
  // A cantrip that deals its damage (hit, critical, failed save) also applies its pills; a half on a passed save
  // (Potent Cantrip) has "no other effect".
  const cantripOperations = DAMAGING_OUTCOMES.has(outcome)
    ? [...(attack.cantrip ? pcAttackCantripPillOperations({ attack, sourceItem, targetItem, attackInstanceId, appliedAt }) : []),
      // A leveled spell's pills on a hit (Guiding Bolt); Vampiric Touch's spell stays the panel's cast on the caster.
      ...(attack.spell && !attack.spell.fromActiveSpell ? pcAttackCantripPillOperations({ spellId: attack.spell.spellId, sourceItem, targetItem,
        attackInstanceId, appliedAt, slotLevel: spellPlan.slotLevel }) : []),
      // Booming Blade: its pill from the spell catalog, with the movement damage at this level in the detail and as data
      // (mechanics.movementDamage), for the movement reminder (CAP-LINK).
      ...(woven?.trigger ? pcAttackCantripPillOperations({ spellId: woven.spellId, sourceItem, targetItem, attackInstanceId, appliedAt })
        .map((operation) => operation.type !== "condition:add" ? operation : { ...operation, options: { ...operation.options,
          effectDetail: `${operation.options?.effectDetail || ""} Danni: ${woven.dice.trigger} da tuono.`.trim(),
          mechanics: { ...(operation.options?.mechanics || {}), movementDamage: { dice: woven.dice.trigger, type: "tuono" } } } }) : [])]
    : [];
  const cantripPills = cantripOperations.filter((operation) => operation.type === "condition:add").map((operation) => operation.conditionName);
  if (cantripPills.length && attack.cantrip) causality.cantrip = { ...causality.cantrip, pills: cantripPills };
  if (cantripPills.length && attack.spell) causality.spell = { ...causality.spell, pills: cantripPills };
  if (cantripPills.length && woven) causality.weaponCantrip = { ...causality.weaponCantrip, pills: cantripPills };
  // Activations: the class feature's pills (on the target, or on the attacker for a self effect) and a standard
  // condition (Trip Attack: Prono), only when the save fails or there is none.
  const activationConditions = activationPlan.conditions.map((entry) => ({ ...entry,
    instanceId: bossGroupConditionInstanceId(`${attackInstanceId}:${entry.featureId}`, entry.condition, targetItem.id) }));
  const appliedConditions = [...conditions.map((entry) => ({ targetId: targetItem.id, ...entry, ...(appliedAt ? { appliedAt } : {}) })),
    ...activationConditions.map((entry) => ({ targetId: targetItem.id, ...entry, ...(appliedAt ? { appliedAt } : {}) })),
    ...Object.entries(activationPlan.instancesByTarget).flatMap(([targetId, instances]) => instances.map((instance) => ({
      targetId, condition: instance.condition, featureId: activationPlan.pillFeatureIds[instance.id] || "", instanceId: instance.id,
      ...(appliedAt ? { appliedAt } : {}) }))),
    ...cantripPills.map((condition) => ({ targetId: targetItem.id, condition, spellId: attack.cantrip?.spellId || attack.spell?.spellId || woven?.spellId,
      ...(appliedAt ? { appliedAt } : {}) }))];
  if (appliedConditions.length) causality.conditionsApplied = appliedConditions;
  // A condition with an expiry ends by itself (Open Hand: no reactions until the end of the monk's next turn); the
  // others are removed by hand.
  const conditionOperations = [...conditions, ...activationConditions].map((entry) => ({ type: "condition:add", targetIds: [targetItem.id], conditionName: entry.condition,
    instanceIds: { [targetItem.id]: entry.instanceId },
    options: { sourceId: sourceItem.id, sourceName, parentEffectId: "", type: "automatic", manualRemoval: !entry.expiry,
      expiry: entry.expiry ? { ...entry.expiry, ...(entry.expiry.actor === "source" ? { actorId: sourceItem.id } : {}) } : { mode: "manual" },
      ...(appliedAt ? { appliedAt } : {}) } }));
  const activationPillOperations = Object.keys(activationPlan.instancesByTarget).length
    ? [{ type: "condition:add-instances", instancesByTarget: activationPlan.instancesByTarget }] : [];
  // CAP-LINK: Invisibility and Compelled Duel ended by this attack, in its own command (one Undo brings them back).
  const linkEnds = pcAttackLinkEnds({ sourceItem, targetItem, linkItems, damaged: !!change?.changed && change.requested > 0 });
  if (linkEnds.length) causality.linkEnds = linkEnds.map(({ itemId, spellId, reason }) => ({ itemId, spellId, reason }));
  // The ids whose pills the attack changes outside the damaged creatures (a self pill on the attacker, an ended link).
  const pillTargetIds = [...new Set([...Object.keys(activationPlan.instancesByTarget), ...linkEnds.map((end) => end.itemId)])];
  if (activationPlan.notes.length) causality.notes = [...activationPlan.notes];
  return {
    change, damageComponents, causality,
    followUps: [...pcAttackFollowUps(sourceMeta.initiativeCard, chosenRiders, activationPlan.chosen.map((activation) => activation.id)), ...activationPlan.notes],
    // Temporary hit points (Inspiring Smite): their own projections after the commit (no concentration warnings).
    tempHpChanges: activationPlan.tempHp.filter((row) => row.change.changed).map((row) => ({ item: row.item, change: row.change })),
    labelTargetIds: [...new Set([...pillTargetIds, ...(activationConditions.length ? [targetItem.id] : [])])],
    ...(secondaryItemUsed ? { secondaryChange, secondaryItem: secondaryItemUsed } : {}),
    // The creatures of Bursting Arrow: their own post-damage projections after the commit.
    burstChanges: burstRows.filter((row) => row.change.changed).map((row) => ({ item: row.item, change: row.change })),
    // Vampiric Touch's healing of the caster: its own projection after the commit (no concentration warnings).
    ...(casterHealChange?.changed ? { casterHealChange: { item: sourceItem, change: casterHealChange } } : {}),
    operations: [...(change?.changed || secondaryChange?.changed || activationPlan.tempHp.some((row) => row.change.changed)
      || burstRows.some((row) => row.change.changed) || casterHealChange?.changed ? [{ type: "hp:set", updates: [
      ...(change?.changed ? [{
        itemId: targetItem.id, hp: change.afterHP, hpMax: change.hpMax,
        // A critical hit on a PC at 0 HP: two death save failures.
        hpIntent: { mode: "damage", amount: change.requested, eventId: attackInstanceId,
          ...(outcome === "critical" && change.deathSaveDamage ? { critical: true } : {}) },
        expectedHP: bossMetadataSnapshot(targetMeta, "hp"), expectedHPMax: bossMetadataSnapshot(targetMeta, "hpMax"),
      }] : []),
      ...(secondaryChange?.changed ? [{
        itemId: secondaryItemUsed.id, hp: secondaryChange.afterHP, hpMax: secondaryChange.hpMax,
        hpIntent: { mode: "damage", amount: secondaryChange.requested, eventId: attackInstanceId },
        expectedHP: bossMetadataSnapshot(secondaryMeta, "hp"), expectedHPMax: bossMetadataSnapshot(secondaryMeta, "hpMax"),
      }] : []),
      ...burstRows.filter((row) => row.change.changed).map((row) => ({
        itemId: row.item.id, hp: row.change.afterHP, hpMax: row.change.hpMax,
        hpIntent: { mode: "damage", amount: row.change.requested, eventId: attackInstanceId },
        expectedHP: bossMetadataSnapshot(row.meta, "hp"), expectedHPMax: bossMetadataSnapshot(row.meta, "hpMax"),
      })),
      ...activationPlan.tempHp.filter((row) => row.change.changed).map((row) => ({
        itemId: row.item.id, hp: row.change.afterHP, hpMax: row.change.hpMax,
        hpIntent: { mode: QUICK_HP_MODES.TEMP, amount: row.change.requested, eventId: attackInstanceId },
        expectedHP: bossMetadataSnapshot(row.item.metadata?.[META_KEY] || {}, "hp"),
        expectedHPMax: bossMetadataSnapshot(row.item.metadata?.[META_KEY] || {}, "hpMax"),
      })),
      // One write for the caster in the same command, as the boss's drain: the target is never the caster.
      ...(casterHealChange?.changed ? [{
        itemId: sourceItem.id, hp: casterHealChange.afterHP, hpMax: casterHealChange.hpMax,
        hpIntent: { mode: QUICK_HP_MODES.HEAL, amount: casterHealChange.requested, eventId: attackInstanceId },
        expectedHP: bossMetadataSnapshot(sourceHpMeta, "hp"), expectedHPMax: bossMetadataSnapshot(sourceHpMeta, "hpMax"),
      }] : []),
    ] }] : []), ...conditionOperations,
    ...(conditionOperations.length ? [{ type: "condition:automate", subjectIds: [targetItem.id] }] : []), ...cantripOperations,
    ...activationPillOperations,
    ...(linkEnds.length ? [{ type: "condition:remove-instances", removals: linkEnds.map(({ itemId, instanceId }) => ({ itemId, instanceId })) }] : [])],
    options: {
      commandId: attackInstanceId, correlationId: attackInstanceId, sourceId: sourceItem.id,
      targetIds: [...new Set([targetItem.id, ...(secondaryItemUsed ? [secondaryItemUsed.id] : []), ...pillTargetIds,
        ...burstRows.map((row) => row.item.id), ...(casterHealChange?.changed ? [sourceItem.id] : [])])], kind: PC_ATTACK_HISTORY_KIND, label,
      // The quick action read from the attacker's card, and the defenses read from the target's card,
      // must still be the ones at commit.
      metadataPatches: [
        { id: sourceItem.id, fields: {
          initiativeCard: { mode: "assert", expected: bossMetadataSnapshot(sourceMeta, "initiativeCard") },
          [PC_ATTACK_STATE_FIELD]: { value: state, expected: bossMetadataSnapshot(sourceMeta, PC_ATTACK_STATE_FIELD) },
          // The resources the activations spent and their active instances: the field the card's activation writes.
          ...(activationPlan.stateChanged ? { [CLASS_FEATURE_STATE_FIELD]: { value: activationPlan.state,
            expected: bossMetadataSnapshot(sourceMeta, CLASS_FEATURE_STATE_FIELD) } } : {}),
        } },
        ...(change?.changed ? [targetProfileAssert(targetItem)] : []),
        ...(secondaryChange?.changed ? [targetProfileAssert(secondaryItemUsed)] : []),
        ...burstRows.filter((row) => row.change.changed && row.item.id !== sourceItem.id).map((row) => targetProfileAssert(row.item)),
      ],
      // A use counted per turn belongs to the turn the GM saw: a turn change before the commit refuses it.
      ...(newUses.length || activationPlan.uses.length ? { sceneMetadataPreconditions: [
        { key: STATE_KEY, field: "round", value: turnState?.round },
        { key: STATE_KEY, field: "current", value: turnState?.current },
      ] } : {}),
      history: { kind: PC_ATTACK_HISTORY_KIND, label, payload: { causality, damageComponents: structuredClone(damageComponents),
        // The cantrip's on-hit effect is not applied yet: it is recorded as the part the GM resolves by hand.
        ...(DAMAGING_OUTCOMES.has(outcome) && attack.cantrip?.effectNote ? { manualRemainder: attack.cantrip.effectNote } : {}) } },
    },
  };
}

// CAP-LINK: the links an attack ends (2014 texts). The spell is read from the instance on the token (the pill's parent),
// never from the pill's name: "Invisibile" also comes from Greater Invisibility and other effects, which go on.
const SPELLS_FIELD = `${ID}/spells`;
function linkedSpellPills(item, spellId) {
  const meta = item?.metadata?.[META_KEY] || {};
  const instanceIds = new Set((Array.isArray(meta[SPELLS_FIELD]) ? meta[SPELLS_FIELD] : [])
    .filter((entry) => entry?.spellId === spellId).map((entry) => String(entry?.instanceId || "")).filter(Boolean));
  return conditionInstancesOf(item).filter((instance) => instance?.active !== false && instance?.id
    && instanceIds.has(String(instance?.parentEffectId || "")));
}
function attitudeSide(item) {
  const attitude = String(item?.metadata?.[META_KEY]?.attitude || "neutral").toLocaleLowerCase("it");
  return attitude === "enemy" ? "enemy" : attitude === "pc" || attitude === "ally" ? "friendly" : "neutral";
}
// Invisibility ends for its bearer who attacks or casts (any registration of the console); Compelled Duel ends when
// its caster attacks another creature, or when a creature friendly to the caster damages the duel's target.
export function pcAttackLinkEnds({ sourceItem, targetItem, linkItems = [], damaged = false } = {}) {
  const ends = linkedSpellPills(sourceItem, "invisibility").map((instance) => ({ itemId: sourceItem.id, instanceId: instance.id,
    spellId: "invisibility", reason: "Ha attaccato o lanciato un incantesimo." }));
  const byId = new Map([...(Array.isArray(linkItems) ? linkItems : []), targetItem, sourceItem].filter((item) => item?.id).map((item) => [item.id, item]));
  for (const item of byId.values()) {
    for (const instance of linkedSpellPills(item, "phb2014-duello-obbligato")) {
      const casterId = String(instance.sourceId || "");
      if (casterId === sourceItem.id && item.id !== targetItem.id) {
        ends.push({ itemId: item.id, instanceId: instance.id, spellId: "phb2014-duello-obbligato", reason: "Il caster ha attaccato un'altra creatura." });
      } else if (item.id === targetItem.id && casterId && casterId !== sourceItem.id && damaged) {
        const caster = byId.get(casterId);
        if (caster && attitudeSide(caster) !== "neutral" && attitudeSide(caster) === attitudeSide(sourceItem))
          ends.push({ itemId: item.id, instanceId: instance.id, spellId: "phb2014-duello-obbligato", reason: "Una creatura alleata del caster ha danneggiato il bersaglio." });
      }
    }
  }
  return ends;
}

// Phase 3A: the activations chosen for this attack, checked against the live attacker, target and turn, and planned
// with the class feature's own pure functions. Returns the damage rows, the new classFeatureState (resources spent,
// active instances), the pills by creature, the standard conditions, the notes and the per-turn uses.
function planPcAttackActivations({ requests = [], attack, outcome, sourceItem, targetItem, turnState, turn, attackInstanceId, chosenRiders, chosenExtras,
  secondaryItem = null, wovenSecondary = false, tempHpItems = [], burstItems = [], modeAmount = null, factor = "full" }) {
  const list = Array.isArray(requests) ? requests : [];
  const empty = { chosen: [], state: null, stateChanged: false, instancesByTarget: {}, pillFeatureIds: {}, conditions: [], notes: [], uses: [],
    secondary: null, tempHp: [], burst: null };
  if (!list.length && !attack.mode) return empty;
  if (list.length && !ATTACK_ROLL_OUTCOMES.has(outcome)) throw new Error("Le attivazioni richiedono un tiro per colpire.");
  if (new Set(list.map((request) => request?.id)).size !== list.length) throw new Error("La stessa attivazione è indicata due volte.");
  const sourceMeta = sourceItem.metadata?.[META_KEY] || {};
  const card = sourceMeta.initiativeCard || {};
  const sourceName = sourceItem.name || sourceItem.id;
  const options = activationOptionsFor(attack, { sourceItem, targetItem, turnState, outcome, riderIds: chosenRiders.map((rider) => rider.id),
    damageTypes: [...chosenRiders, ...chosenExtras].map((entry) => entry.type).filter(Boolean) });
  const groups = new Set();
  const originalState = normalizeClassFeatureState(sourceMeta[CLASS_FEATURE_STATE_FIELD]);
  let state = originalState;
  const result = { ...empty, chosen: [] };
  // The arrow that replaced the attack roll (Seeking): a use of Arcane Shot, one per turn, and its die as a component
  // (halved with the rest on a passed save; none recorded when the save makes it zero).
  if (attack.mode) {
    const spend = planModeSpend({ attack, sourceItem, turnState, turn, state });
    state = spend.state;
    result.uses.push(...spend.uses);
    const deals = factor !== "zero";
    if (deals && !validAmount(modeAmount)) throw new Error(`Inserisci il danno di ${spend.option.label}.`);
    result.chosen.push({ id: spend.option.id, option: { ...spend.option, damage: deals }, applies: true, spent: spend.spent, save: null, effect: null,
      choice: null, saveOutcome: null, mode: true, ...(deals ? { type: spend.option.types[0], amount: damageAmount(modeAmount) } : {}) });
  }
  for (const request of list) {
    const activation = getPcAttackActivation(request?.id);
    const option = options.find((entry) => entry.id === request?.id);
    if (!activation || !option) throw new Error("Attivazione non disponibile per questo attaccante: riapri l'attacco.");
    if (!option.available) throw new Error(`${option.label}: ${option.reason} Riapri l'attacco.`);
    if (option.group && groups.has(option.group)) throw new Error(`${option.label}: ${option.groupLabel}.`);
    if (option.group) groups.add(option.group);
    if (option.types.length && !option.types.includes(request.type)) throw new Error(`${option.label}: tipo di danno non valido.`);
    // A choice (Open Hand Technique) brings its own save and effect.
    const choice = option.choices ? option.choices.find((entry) => entry.id === request.choice) || null : null;
    if (option.choices && !choice) throw new Error(`${option.label}: scegli l'effetto.`);
    const save = choice ? choice.save : option.save;
    const effect = choice ? choice.effect : option.effect;
    if (save && !PC_ATTACK_SAVE_OUTCOMES.includes(request.saveOutcome)) throw new Error(`${option.label}: scegli l'esito del tiro salvezza.`);
    // Inspiring Smite: the total rolled, shared among the creatures the GM picks (not the creatures the attack damages).
    if (option.burst) {
      const reason = burstBlocker(option, request, { items: burstItems, targetItem, secondaryItem });
      if (reason) throw new Error(reason);
      result.burst = { id: activation.id, option, type: request.type, amount: damageAmount(request.amount),
        items: (request.burstTargetIds || []).map((id) => burstItems.find((item) => item.id === id)) };
    }
    if (option.tempHp) {
      const reason = tempHpBlocker(option, request, { items: tempHpItems, targetItem, secondaryItem });
      if (reason) throw new Error(reason);
      result.tempHp = request.tempHp.map((entry) => {
        const item = tempHpItems.find((candidate) => candidate.id === entry.targetId);
        const meta = item.metadata?.[META_KEY] || {};
        const amount = damageAmount(entry.amount);
        return { item, amount, change: calculateQuickHPChange({ mode: QUICK_HP_MODES.TEMP, value: amount, hp: meta.hp, hpMax: meta.hpMax }) };
      });
    }
    // The second creature of the activation's die: one per attack, another creature than the attacker and the target.
    if (option.secondary) {
      if (wovenSecondary || result.secondary) throw new Error("Una sola seconda creatura per attacco.");
      if (!request.secondaryTargetId) throw new Error(`${option.label}: scegli la seconda creatura.`);
      if (!secondaryItem || secondaryItem.id !== request.secondaryTargetId) throw new Error("La seconda creatura non è più nella scena.");
      if (!isBossActionCreature(secondaryItem) || [sourceItem.id, targetItem.id].includes(secondaryItem.id))
        throw new Error("Scegli come seconda creatura un'altra creatura.");
      result.secondary = { id: activation.id, option, item: secondaryItem, type: request.type, amount: damageAmount(request.amount) };
    }
    // The effect applies without a save or with a failed one; a passed save still spends the resource and adds the die.
    const applies = !save || request.saveOutcome === "failed";
    const feature = getClassFeatureDefinition(activation.id);
    const before = state;
    if (applies && effect?.kind === "pill") {
      const targetId = effect.self ? sourceItem.id : targetItem.id;
      const plan = planActivationPill({ feature, card, state, sourceItem, targetId, turn, turnState, instanceId: `${attackInstanceId}:${activation.id}` });
      if (!plan.ok) throw new Error(`${option.label}: ${activationPlanReason(plan)} Riapri l'attacco.`);
      state = plan.state;
      for (const instance of classFeatureConditionInstancesForActivation(feature, plan.instance, sourceName, card.characterBuild)) {
        (result.instancesByTarget[instance.targetId] ||= []).push(instance);
        result.pillFeatureIds[instance.id] = activation.id;
      }
    } else {
      for (const cost of pcAttackActivationCosts(activation)) {
        const pool = getClassFeatureResourcePool(cost.poolId);
        const entry = activationResources({ cost: [cost] }, card, state)[0];
        if (!pool || !entry) throw new Error(`${option.label}: risorsa sconosciuta.`);
        if (!entry.unlimited && entry.current !== null && entry.current < entry.amount) throw new Error(`${option.label}: ${entry.name}: nessun uso rimasto.`);
        state = planClassFeatureResourceAdjustment(state, pool, card.characterBuild, { delta: -entry.amount }, card.abilityModifiers).state;
      }
    }
    if (applies && effect?.kind === "condition") result.conditions.push({ condition: effect.label, featureId: activation.id,
      ...(effect.expiry ? { expiry: { ...effect.expiry } } : {}) });
    if (applies && effect?.kind === "note") result.notes.push(`${option.label}: ${effect.label}`);
    if (option.note) result.notes.push(`${option.label}: ${option.note}`);
    // What this activation spent, for the Combat Log (the resource as it was before and after).
    const spent = activationResources(activation, card, before).map((entry) => {
      const after = activationResources(activation, card, state).find((next) => next.poolId === entry.poolId);
      return { poolId: entry.poolId, name: entry.name, amount: entry.amount, ...(entry.current !== null ? { before: entry.current } : {}),
        ...(after?.current !== null && after?.current !== undefined ? { after: after.current } : {}) };
    });
    if (option.limit && turn) result.uses.push({ riderId: pcAttackActivationLimitKey(activation), turnKey: turn.turnKey });
    result.chosen.push({ id: activation.id, option, applies, spent, save, effect, choice, saveOutcome: save ? request.saveOutcome : null,
      ...(option.types.length ? { type: request.type, amount: damageAmount(request.amount) } : {}),
      ...(option.tempHp ? { amount: damageAmount(request.amount), tempHp: result.tempHp } : {}) });
  }
  if (result.secondary && result.tempHp.some((row) => row.item.id === result.secondary.item.id))
    throw new Error("La seconda creatura dell'attacco non può ricevere i PF temporanei.");
  result.state = state;
  result.stateChanged = JSON.stringify(state) !== JSON.stringify(originalState);
  // One use per limit key, even when two activations share it.
  result.uses = result.uses.filter((use, index, uses) => uses.findIndex((other) => other.riderId === use.riderId) === index);
  return result;
}

// Inspiring Smite's distribution: the total rolled, at least one creature, each once, a positive amount, the sum not over
// the total; never a creature the attack damages (one HP write per creature in a command).
function tempHpBlocker(option, request, { items = [], targetItem = null, secondaryItem = null } = {}) {
  if (!validAmount(request.amount) || Number(request.amount) <= 0) return `Inserisci il totale di ${option.label}.`;
  const entries = Array.isArray(request.tempHp) ? request.tempHp : [];
  if (!entries.length || entries.some((entry) => !entry?.targetId)) return `${option.label}: scegli chi riceve i PF temporanei.`;
  if (new Set(entries.map((entry) => entry.targetId)).size !== entries.length) return `${option.label}: la stessa creatura è indicata due volte.`;
  if (entries.some((entry) => entry.targetId === targetItem?.id || entry.targetId === secondaryItem?.id))
    return `${option.label}: le creature colpite dall'attacco non ricevono PF temporanei.`;
  for (const entry of entries) {
    const item = items.find((candidate) => candidate.id === entry.targetId);
    const meta = item?.metadata?.[META_KEY] || {};
    if (!item || !isBossActionCreature(item)) return `${option.label}: una creatura scelta non è più nella scena.`;
    if (!Number.isFinite(meta.hp) || !Number.isFinite(meta.hpMax)) return `${option.label}: ${item.name || item.id} non ha HP canonici validi.`;
    if (!validAmount(entry.amount) || Number(entry.amount) <= 0) return `${option.label}: inserisci i PF temporanei di ${item.name || item.id}.`;
  }
  const sum = entries.reduce((total, entry) => total + Number(entry.amount), 0);
  return sum > Number(request.amount) ? `${option.label}: distribuiti ${sum} PF temporanei su ${Number(request.amount)}.` : "";
}

// Quivering Palm, ending the vibrations (3B-2): an action of the monk, not an attack. The target with this monk's
// vibrations makes a Constitution save: on a failure it drops to 0 hit points, on a success it takes 10d10 necrotic
// damage; the monk may also end them harmlessly. The pill and the active class feature end with them.
export const PC_ATTACK_QUIVERING_PALM_FEATURE_ID = "monaco-via-della-mano-aperta-palmo-tremante";
export const PC_ATTACK_QUIVERING_PALM_OUTCOMES = Object.freeze(["failed", "passed", "none"]);

export function pcAttackQuiveringPalm(sourceItem, targetItem) {
  if (!sourceItem?.id || !targetItem?.id) return null;
  const card = sourceItem.metadata?.[META_KEY]?.initiativeCard || {};
  if (!getEnabledClassFeatureIds(card).has(PC_ATTACK_QUIVERING_PALM_FEATURE_ID)) return null;
  const pillName = getClassFeatureDefinition(PC_ATTACK_QUIVERING_PALM_FEATURE_ID)?.effectPlan?.conditionName || "Palmo Tremante";
  const pill = conditionInstancesOf(targetItem).find((instance) => instance?.active !== false && instance?.condition === pillName
    && instance?.sourceId === sourceItem.id);
  if (!pill?.id) return null;
  const dc = abilitySaveDC(card, "wis");
  return { instanceId: pill.id, dice: "10d10", ...(dc ? { dc } : {}) };
}

export function buildPcAttackQuiveringPalmMutation({
  sourceItem, targetItem, outcome = "", amount = null, attackInstanceId, ignoredDefenses = [], expectedDefenses, turnState = null,
} = {}) {
  if (!isBossActionCreature(sourceItem) || !isBossActionCreature(targetItem)) throw new Error("Monaco e bersaglio devono essere token creatura reali.");
  if (!attackInstanceId || typeof attackInstanceId !== "string") throw new Error("Identità dell'azione mancante.");
  const palm = pcAttackQuiveringPalm(sourceItem, targetItem);
  if (!palm) throw new Error(`Il bersaglio non ha le vibrazioni del Palmo Tremante di ${sourceItem.name || "questo monaco"}.`);
  if (!PC_ATTACK_QUIVERING_PALM_OUTCOMES.includes(outcome)) throw new Error("Scegli l'esito del tiro salvezza.");
  const sourceMeta = sourceItem.metadata?.[META_KEY] || {};
  const targetMeta = targetItem.metadata?.[META_KEY] || {};
  if (outcome !== "none" && (!Number.isFinite(targetMeta.hp) || !Number.isFinite(targetMeta.hpMax) || targetMeta.hp < 0 || targetMeta.hpMax < 0))
    throw new Error("Il bersaglio non ha HP canonici validi.");
  const name = getClassFeatureDefinition(PC_ATTACK_QUIVERING_PALM_FEATURE_ID)?.name || "Palmo Tremante";
  let damageComponents = [];
  let change = null;
  if (outcome === "failed") {
    // Reduced to 0 hit points, temporary ones included: not damage of a type, no defense applies.
    change = calculateQuickHPChange({ value: targetMeta.hp, hp: targetMeta.hp, hpMax: targetMeta.hpMax });
  } else if (outcome === "passed") {
    if (!validAmount(amount)) throw new Error("Inserisci i danni necrotici (10d10).");
    damageComponents = defendedComponents([{ id: "c1", type: "necrotic", source: { kind: "class-feature", featureId: PC_ATTACK_QUIVERING_PALM_FEATURE_ID, name } }],
      { c1: damageAmount(amount) }, "full", targetItem, ignoredDefenses, expectedDefenses);
    change = calculateQuickHPChange({ value: damageComponents.reduce((sum, component) => sum + component.amount, 0), hp: targetMeta.hp, hpMax: targetMeta.hpMax,
      deathSaveDamage: takesDeathSaveDamage(targetMeta) });
  }
  // The active class feature on this target ends with the vibrations (the card shows it no more).
  const state = normalizeClassFeatureState(sourceMeta[CLASS_FEATURE_STATE_FIELD]);
  const active = state.instances.find((instance) => instance.featureId === PC_ATTACK_QUIVERING_PALM_FEATURE_ID
    && (Array.isArray(instance.targetIds) ? instance.targetIds : []).includes(targetItem.id));
  const deactivation = active ? planClassFeatureDeactivation(state, active.instanceId) : { changed: false };
  const sourceName = sourceItem.name || sourceItem.id;
  const targetName = targetItem.name || targetItem.id;
  const label = `${sourceName}: ${name} → ${targetName}`;
  const turn = attackTurn(turnState);
  const causality = {
    actor: { id: sourceItem.id, tokenId: sourceItem.id, name: sourceName, role: "attacker" },
    cause: { kind: PC_ATTACK_HISTORY_KIND, actionName: name, attackInstanceId, featureId: PC_ATTACK_QUIVERING_PALM_FEATURE_ID },
    action: { id: PC_ATTACK_QUIVERING_PALM_FEATURE_ID, label: name },
    quiveringPalm: { outcome, dice: palm.dice, ...(palm.dc ? { dc: palm.dc } : {}) },
    ...(outcome !== "none" ? { save: { ability: "con", outcome, ...(palm.dc ? { dc: palm.dc } : {}) } } : {}),
    ...(turn ? { turn } : {}),
    targets: [{ id: targetItem.id, name: targetName, outcome: outcome === "none" ? "ended" : outcome,
      requestedDamage: change ? change.requested : 0, ...(change ? { appliedHpDelta: change.delta } : {}),
      damageComponents: structuredClone(damageComponents) }],
  };
  return {
    change, damageComponents, causality, labelTargetIds: [targetItem.id],
    operations: [...(change?.changed ? [{ type: "hp:set", updates: [{ itemId: targetItem.id, hp: change.afterHP, hpMax: change.hpMax,
      hpIntent: { mode: "damage", amount: change.requested, eventId: attackInstanceId },
      expectedHP: bossMetadataSnapshot(targetMeta, "hp"), expectedHPMax: bossMetadataSnapshot(targetMeta, "hpMax") }] }] : []),
    { type: "condition:remove-instances", removals: [{ itemId: targetItem.id, instanceId: palm.instanceId }] }],
    options: {
      commandId: attackInstanceId, correlationId: attackInstanceId, sourceId: sourceItem.id, targetIds: [targetItem.id],
      kind: PC_ATTACK_HISTORY_KIND, label,
      metadataPatches: [
        { id: sourceItem.id, fields: {
          initiativeCard: { mode: "assert", expected: bossMetadataSnapshot(sourceMeta, "initiativeCard") },
          ...(deactivation.changed ? { [CLASS_FEATURE_STATE_FIELD]: { value: deactivation.state,
            expected: bossMetadataSnapshot(sourceMeta, CLASS_FEATURE_STATE_FIELD) } } : {}),
        } },
        ...(outcome === "passed" && change?.changed ? [targetProfileAssert(targetItem)] : []),
      ],
      history: { kind: PC_ATTACK_HISTORY_KIND, label, payload: { causality, damageComponents: structuredClone(damageComponents) } },
    },
  };
}

// Bursting Arrow's creatures: those the GM kept around the target, each once, never the target (it takes the die as
// a component) nor the attack's second creature.
function burstBlocker(option, request, { items = [], targetItem = null, secondaryItem = null } = {}) {
  const ids = Array.isArray(request.burstTargetIds) ? request.burstTargetIds : [];
  if (new Set(ids).size !== ids.length) return `${option.label}: la stessa creatura è indicata due volte.`;
  if (ids.some((id) => id === targetItem?.id || id === secondaryItem?.id)) return `${option.label}: il bersaglio subisce già il danno della freccia.`;
  for (const id of ids) {
    const item = items.find((candidate) => candidate.id === id);
    const meta = item?.metadata?.[META_KEY] || {};
    if (!item || !isBossActionCreature(item)) return `${option.label}: una creatura scelta non è più nella scena.`;
    if (!Number.isFinite(meta.hp) || !Number.isFinite(meta.hpMax)) return `${option.label}: ${item.name || item.id} non ha HP canonici validi.`;
  }
  return "";
}

// 3C: an attack against every creature of an area (area cantrips around the caster, Piercing Arrow's line). One damage
// roll; each creature saves on its own: a failure takes it all, a success half (Piercing Arrow, Potent Cantrip) or
// nothing; each with its own defenses and hit points. One command, one History entry, one Undo.
function areaFactor(attack, outcome, card) {
  if (outcome === "failed") return "full";
  return outcome === "passed" && (attack.saveHalf || (attack.cantrip && pcAttackHasPotentCantrip(card))) ? "half" : "zero";
}

// The roll's components: the cantrip's (or the weapon's), the casters' riders, the arrow's extra die, the extras.
function areaComponents(attack, riders = [], extras = [], modeOption = null) {
  return attackComponents(attack, riders, extras, null,
    modeOption ? [{ id: modeOption.id, type: modeOption.types[0], option: { ...modeOption, damage: true } }] : []);
}

function areaInputs(attack, { amounts = {}, riders = [], extras = [], modeOption = null, modeAmount = null } = {}) {
  return {
    ...Object.fromEntries(attack.components.map((component) => [component.id, amounts?.[component.id]])),
    ...Object.fromEntries(riders.map((rider) => [`r:${rider.id}`, rider.amount])),
    ...Object.fromEntries(extras.map((extra, index) => [`x${index + 1}`, extra.amount])),
    ...(modeOption ? { [`a:${modeOption.id}`]: modeAmount } : {}),
  };
}

export function pcAttackAreaPreview({
  action, spellId = "", attackMode = "", sourceItem = null, members = [], amounts = {}, riders = [], extras = [], modeAmount = "", turnState = null,
} = {}) {
  const attack = pcAttackResolvedAction(action, spellId, attackMode);
  if (!attack?.area) return { ready: false, blocker: "Non è un attacco ad area.", rows: [], total: 0 };
  const card = sourceItem?.metadata?.[META_KEY]?.initiativeCard || {};
  const chosen = (Array.isArray(members) ? members : []).filter((member) => member?.item);
  const modeOption = attack.mode && sourceItem ? modeOptionFor(getPcAttackActivation(attack.mode.id), { sourceItem, turnState }) : null;
  const breathOption = attack.breath && sourceItem
    ? breathOptionFor(attack, card, normalizeClassFeatureState(sourceItem.metadata?.[META_KEY]?.[CLASS_FEATURE_STATE_FIELD])) : null;
  const chosenExtras = extras.map((extra) => ({ ...extra, label: extraLabel(extra.label) }));
  const components = areaComponents(attack, riders, chosenExtras, modeOption);
  const inputs = areaInputs(attack, { amounts, riders, extras: chosenExtras, modeOption, modeAmount });
  const amountsReady = Object.values(inputs).every(validAmount);
  const rows = chosen.map((member) => {
    const factor = areaFactor(attack, member.outcome, card);
    const meta = member.item.metadata?.[META_KEY] || {};
    const profileDefenses = damageDefensesForItem(member.item, META_KEY);
    const total = member.outcome && factor !== "zero" && amountsReady
      ? bossDefendedDamage(components, inputs, factor === "half" ? "passed" : "hit", profileDefenses, []) : 0;
    const hp = Number.isFinite(meta.hp) && Number.isFinite(meta.hpMax)
      ? { before: meta.hp, after: calculateQuickHPChange({ value: total, hp: meta.hp, hpMax: meta.hpMax }).afterHP, hpMax: meta.hpMax } : null;
    return { id: member.item.id, name: member.item.name || member.item.id, outcome: member.outcome || "", factor, total, hp, profileDefenses };
  });
  const options = riders.length && sourceItem ? riderOptionsFor(attack, { sourceItem, targetItem: null, turnState }) : [];
  const riderBlock = riders.map((rider) => {
    const option = options.find((entry) => entry.id === rider.id);
    if (!option) return "Extra non disponibile per questo attaccante.";
    if (!option.available) return `${option.label}: ${option.reason}`;
    return option.types.includes(rider.type) ? "" : `${option.label}: scegli il tipo di danno.`;
  }).find(Boolean) || "";
  const blocker = !chosen.length ? "Scegli le creature dell'area."
    : modeOption && !modeOption.available ? `${modeOption.label}: ${modeOption.reason}`
    : breathOption && !breathOption.available ? `${attack.breath.name}: ${breathOption.reason}`
    : rows.some((row) => !PC_ATTACK_SAVE_OUTCOMES.includes(row.outcome)) ? "Scegli l'esito del tiro salvezza di ogni creatura."
    : attack.components.some((component) => !validAmount(amounts?.[component.id])) ? "Inserisci il danno."
    : riderBlock ? riderBlock
    : chosenExtras.some((extra) => !damageTypeSet.has(extra.type)) ? "Scegli il tipo di ogni componente extra."
    : [...riders, ...chosenExtras].some((entry) => !validAmount(entry.amount)) ? "Inserisci il danno di ogni extra."
    : modeOption && !validAmount(modeAmount) ? `Inserisci il danno di ${modeOption.label}.`
    : rows.find((row) => !row.hp) ? `${rows.find((row) => !row.hp).name} non ha HP canonici validi.`
    : "";
  return { ready: !blocker, blocker, rows, total: rows.reduce((sum, row) => sum + row.total, 0) };
}

export function buildPcAttackAreaMutation({
  action, spellId = "", attackMode = "", sourceItem, members = [], componentAmounts = {}, riders = [], extras = [], modeAmount = null,
  attackInstanceId, expectedDefenses = {}, turnState = null,
} = {}) {
  if (!isBossActionCreature(sourceItem)) throw new Error("L'attaccante deve essere un token creatura reale.");
  if (!attackInstanceId || typeof attackInstanceId !== "string") throw new Error("Identità dell'attacco mancante.");
  if (!pcAttackAction(action)) throw new Error("Azione rapida di attacco non valida.");
  const attack = pcAttackResolvedAction(action, spellId, attackMode);
  if (!attack?.area) throw new Error("Non è un attacco ad area: riapri l'attacco.");
  const list = Array.isArray(members) ? members : [];
  if (!list.length) throw new Error("Scegli le creature dell'area.");
  if (new Set(list.map((member) => member?.item?.id)).size !== list.length) throw new Error("La stessa creatura è indicata due volte.");
  for (const member of list) {
    if (!isBossActionCreature(member?.item)) throw new Error("Una creatura dell'area non è più nella scena.");
    if (member.item.id === sourceItem.id) throw new Error("L'attaccante non è tra le creature colpite dalla sua area.");
    if (!PC_ATTACK_SAVE_OUTCOMES.includes(member.outcome)) throw new Error("Scegli l'esito del tiro salvezza di ogni creatura.");
  }
  const sourceMeta = sourceItem.metadata?.[META_KEY] || {};
  const card = sourceMeta.initiativeCard || {};
  const turn = attackTurn(turnState);
  const riderRequests = Array.isArray(riders) ? riders : [];
  const extraRequests = Array.isArray(extras) ? extras : [];
  if (new Set(riderRequests.map((rider) => rider?.id)).size !== riderRequests.length) throw new Error("Lo stesso extra è indicato due volte.");
  if (extraRequests.length > MAX_PC_ATTACK_EXTRAS) throw new Error(`Al massimo ${MAX_PC_ATTACK_EXTRAS} componenti extra.`);
  const options = riderRequests.length ? riderOptionsFor(attack, { sourceItem, targetItem: null, turnState }) : [];
  const chosenRiders = riderRequests.map((request) => {
    const option = options.find((entry) => entry.id === request?.id);
    if (!option) throw new Error("Extra non disponibile per questo attaccante: riapri l'attacco.");
    if (!option.available) throw new Error(`${option.label}: ${option.reason} Riapri l'attacco.`);
    if (!option.types.includes(request.type)) throw new Error(`${option.label}: tipo di danno non valido.`);
    return { id: option.id, type: request.type, amount: damageAmount(request.amount), option, dice: option.dice };
  });
  const chosenExtras = extraRequests.map((request) => {
    if (!damageTypeSet.has(request?.type)) throw new Error("Tipo di danno non valido in una componente extra.");
    return { type: request.type, label: extraLabel(request.label), amount: damageAmount(request.amount) };
  });
  // Piercing Arrow: a use of Arcane Shot (one per turn) and its extra die.
  const originalState = normalizeClassFeatureState(sourceMeta[CLASS_FEATURE_STATE_FIELD]);
  const spend = attack.mode ? planModeSpend({ attack, sourceItem, turnState, turn, state: originalState }) : null;
  const breathSpend = attack.breath ? planBreathSpend({ attack, card, state: originalState }) : null;
  const modeOption = spend ? { ...spend.option } : null;
  const components = areaComponents(attack, chosenRiders, chosenExtras, modeOption);
  const amounts = componentAmounts && typeof componentAmounts === "object" ? componentAmounts : {};
  const inputs = Object.fromEntries([
    ...attack.components.map((component) => [component.id, damageAmount(amounts[component.id])]),
    ...chosenRiders.map((rider) => [`r:${rider.id}`, rider.amount]),
    ...chosenExtras.map((extra, index) => [`x${index + 1}`, extra.amount]),
    ...(modeOption ? [[`a:${modeOption.id}`, damageAmount(modeAmount)]] : []),
  ]);
  const rows = list.map((member) => {
    const meta = member.item.metadata?.[META_KEY] || {};
    if (!Number.isFinite(meta.hp) || !Number.isFinite(meta.hpMax) || meta.hp < 0 || meta.hpMax < 0)
      throw new Error(`${member.item.name || member.item.id} non ha HP canonici validi.`);
    const factor = areaFactor(attack, member.outcome, card);
    const damageComponents = defendedComponents(components, inputs, factor, member.item, [], expectedDefenses?.[member.item.id]);
    const requested = damageComponents.reduce((sum, component) => sum + component.amount, 0);
    return { item: member.item, meta, outcome: member.outcome, factor, damageComponents,
      change: calculateQuickHPChange({ value: requested, hp: meta.hp, hpMax: meta.hpMax, deathSaveDamage: takesDeathSaveDamage(meta) }) };
  });
  const newUses = [
    ...(turn ? chosenRiders.filter((rider) => rider.option.limit).map((rider) => ({ riderId: rider.id, turnKey: turn.turnKey })) : []),
    ...(spend?.uses || []),
  ];
  const state = {
    version: PC_ATTACK_STATE_VERSION,
    lastAttack: { attackInstanceId, quickActionId: attack.id, targetIds: rows.map((row) => row.item.id), outcome: "area",
      ...(attack.cantrip ? { spellId: attack.cantrip.spellId } : {}), ...(turn ? { round: turn.round, turnKey: turn.turnKey } : {}) },
    ...([...currentRiderUses(sourceMeta, turn?.turnKey), ...newUses].length ? { riderUses: [...currentRiderUses(sourceMeta, turn?.turnKey), ...newUses] } : {}),
  };
  const sourceName = sourceItem.name || sourceItem.id;
  const actionName = attack.cantrip ? attack.cantrip.name : attack.breath ? attack.breath.name : `${attack.label} · ${attack.mode.label}`;
  const breathInfo = attack.breath ? pcAttackBreathInfo(attack, card) : null;
  const cantripDice = attack.cantrip ? pcAttackCantripDiceFor(attack, card, null) : null;
  const dc = pcAttackSaveDC(attack, card);
  const label = `${sourceName}: ${actionName} → ${rows.length === 1 ? rows[0].item.name || rows[0].item.id : `${rows.length} creature`}`;
  const causality = {
    actor: { id: sourceItem.id, tokenId: sourceItem.id, name: sourceName, role: "attacker" },
    cause: { kind: PC_ATTACK_HISTORY_KIND, quickActionId: attack.id, actionName, attackInstanceId, range: attack.range,
      ...(attack.cantrip ? { spellId: attack.cantrip.spellId, spellName: attack.cantrip.name } : {}) },
    action: { id: attack.id, label: actionName },
    attack: { range: attack.range, outcome: "area", source: attack.cantrip ? "cantrip" : attack.breath ? "breath" : "weapon" },
    ...(breathInfo ? { breath: { featureId: attack.breath.featureId, name: breathInfo.name, dice: breathInfo.dice, shape: breathInfo.shape,
      type: breathInfo.damageType, typeLabel: damageTypeLabel(breathInfo.damageType), spent: breathSpend.spent } } : {}),
    ...(attack.cantrip ? { cantrip: { ...attack.cantrip, ...(cantripDice ? { dice: cantripDice } : {}), saveLabel: pcAttackSaveLabel(attack, card) } } : {}),
    ...(attack.mode ? { mode: { id: attack.mode.id, label: attack.mode.label, kind: attack.mode.kind } } : {}),
    save: { ability: pcAttackSave(attack), ...(dc ? { dc } : {}) },
    area: attack.area.manual ? { manual: true, count: rows.length, ...(attack.area.shape ? { shape: attack.area.shape, lengthFeet: attack.area.lengthFeet } : {}) }
      : { radiusFeet: attack.area.radiusFeet, origin: "caster", count: rows.length },
    ...(turn ? { turn } : {}),
    ...(chosenRiders.length ? { riders: chosenRiders.map((rider) => ({ featureId: rider.id, name: rider.option.label, ...(rider.dice ? { dice: rider.dice } : {}),
      type: rider.type, typeLabel: damageTypeLabel(rider.type), inputAmount: rider.amount })) } : {}),
    ...(chosenExtras.length ? { extras: chosenExtras.map((extra) => ({ ...(extra.label ? { label: extra.label } : {}), type: extra.type,
      typeLabel: damageTypeLabel(extra.type), inputAmount: extra.amount })) } : {}),
    ...(spend ? { activations: [{ featureId: modeOption.id, name: modeOption.label, ...(modeOption.dice ? { dice: modeOption.dice } : {}),
      type: modeOption.types[0], typeLabel: damageTypeLabel(modeOption.types[0]), inputAmount: inputs[`a:${modeOption.id}`],
      ...(spend.spent.length ? { spent: spend.spent } : {}) }] } : {}),
    targets: rows.map((row) => ({ id: row.item.id, name: row.item.name || row.item.id, outcome: row.outcome,
      requestedDamage: row.change.requested, appliedHpDelta: row.change.delta, damageComponents: structuredClone(row.damageComponents) })),
  };
  const changed = rows.filter((row) => row.change.changed);
  const nextFeatureState = spend?.state || breathSpend?.state || null;
  const stateChanged = !!nextFeatureState && JSON.stringify(nextFeatureState) !== JSON.stringify(originalState);
  return {
    causality, rows, changes: changed.map((row) => ({ item: row.item, change: row.change })),
    operations: changed.length ? [{ type: "hp:set", updates: changed.map((row) => ({
      itemId: row.item.id, hp: row.change.afterHP, hpMax: row.change.hpMax,
      hpIntent: { mode: "damage", amount: row.change.requested, eventId: attackInstanceId },
      expectedHP: bossMetadataSnapshot(row.meta, "hp"), expectedHPMax: bossMetadataSnapshot(row.meta, "hpMax"),
    })) }] : [],
    options: {
      commandId: attackInstanceId, correlationId: attackInstanceId, sourceId: sourceItem.id, targetIds: rows.map((row) => row.item.id),
      kind: PC_ATTACK_HISTORY_KIND, label,
      metadataPatches: [
        { id: sourceItem.id, fields: {
          initiativeCard: { mode: "assert", expected: bossMetadataSnapshot(sourceMeta, "initiativeCard") },
          [PC_ATTACK_STATE_FIELD]: { value: state, expected: bossMetadataSnapshot(sourceMeta, PC_ATTACK_STATE_FIELD) },
          ...(stateChanged ? { [CLASS_FEATURE_STATE_FIELD]: { value: nextFeatureState, expected: bossMetadataSnapshot(sourceMeta, CLASS_FEATURE_STATE_FIELD) } } : {}),
        } },
        ...changed.map((row) => targetProfileAssert(row.item)),
      ],
      ...(newUses.length ? { sceneMetadataPreconditions: [
        { key: STATE_KEY, field: "round", value: turnState?.round },
        { key: STATE_KEY, field: "current", value: turnState?.current },
      ] } : {}),
      history: { kind: PC_ATTACK_HISTORY_KIND, label, payload: { causality,
        damageComponents: structuredClone(rows.flatMap((row) => row.damageComponents)) } },
    },
  };
}
