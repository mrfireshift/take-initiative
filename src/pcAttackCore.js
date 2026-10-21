// PC attack tracking: one attack of an actor against one creature, as one command.
// Pure: no SDK, DOM or runtime state. The GM enters the rolled total of each typed component;
// no formula is evaluated and no eligibility (advantage, reach, weapon properties) is checked.
// Phase 1 adds the extra damage on a hit: class feature riders (pcAttackRiderCatalog.js), counted per
// initiative turn, and components the GM adds on the fly (Booming Blade, Hunter's Mark, a magic weapon).
import { ID } from "./constants.js";
import { calculateQuickHPChange } from "./quickHpCore.js";
import { sanitizeQuickAction, sanitizeQuickActions, QUICK_ACTION_ATTACK_DAMAGE_TYPES } from "./quickActionsCore.js";
import {
  isBossActionCreature, bossMetadataSnapshot, bossConditionAppliedAt,
  damageAmount, defendedComponents, targetProfileAssert, bossGroupConditionInstanceId,
} from "./bossActionExecutionCore.js";
import { bossDefendedDamage } from "./bossActionsViewCore.js";
import { getSpellDefinition, getSpellEffects, getSpellSummaryParts } from "./spells-srd.js";
import { catalogSpellApplicationOperations } from "./spellLifecycleOperationsCore.js";
import { spellEffectThemeFor } from "./spellColorCore.js";
import { damageDefensesForItem, damageTypeLabel, relevantDamageDefenses } from "./damageDefensesCore.js";
import { getClassFeatureDefinition, getEnabledClassFeatures } from "./classFeatureCatalog.js";
import { PC_ATTACK_CANTRIPS, PC_ATTACK_SAVE_LABELS, getPcAttackCantrip, pcAttackCantripDice, pcAttackWeaponCantripDice } from "./pcAttackCantripCatalog.js";
import { totalCharacterLevel } from "./abilityModifiersCore.js";
import { getPcAttackRider, pcAttackHasPotentCantrip, pcAttackRiderDice, pcAttackRiderFeatureActive, pcAttackRidersForCard, pcAttackRiderSlotLevels } from "./pcAttackRiderCatalog.js";

export const PC_ATTACK_HISTORY_KIND = "pc-attack";
// The attacker's last attack and the riders it used in the current turn. Every attack rewrites it,
// so a miss is still a command with a History entry (and a Combat Log event).
export const PC_ATTACK_STATE_FIELD = "pcAttackState";
export const PC_ATTACK_STATE_VERSION = 1;
export const PC_ATTACK_OUTCOMES = Object.freeze(["hit", "critical", "miss"]);
// Saving throw cantrips (C2): the target saves; a failure takes the damage, a success none.
export const PC_ATTACK_SAVE_OUTCOMES = Object.freeze(["failed", "passed"]);
const DAMAGING_OUTCOMES = new Set(["hit", "critical", "failed"]);

// What this outcome deals: the full damage on a hit, a critical or a failed save; half on a passed save when the
// caster has Potent Cantrip; nothing otherwise (a miss, a passed save).
export function pcAttackDamageFactor(attack, outcome, card = {}) {
  if (DAMAGING_OUTCOMES.has(outcome)) return "full";
  return outcome === "passed" && attack?.cantrip?.save && pcAttackHasPotentCantrip(card) ? "half" : "zero";
}

// The outcomes the GM picks for this (resolved) attack.
export function pcAttackOutcomesFor(attack) {
  return attack?.cantrip?.save ? PC_ATTACK_SAVE_OUTCOMES : PC_ATTACK_OUTCOMES;
}
export const MAX_PC_ATTACK_EXTRAS = 3;
const META_KEY = `${ID}/meta`;
const STATE_KEY = `${ID}/state`;
const damageTypeSet = new Set(QUICK_ACTION_ATTACK_DAMAGE_TYPES);

export function pcAttackAction(action) {
  const normalized = sanitizeQuickAction(action);
  return normalized?.kind === "attack" ? normalized : null;
}

// The cantrips a cantrip quick action offers: the ones the actor knows, or every attack cantrip.
export function pcAttackCantripIds(action) {
  const attack = pcAttackAction(action);
  if (attack?.source?.kind !== "cantrip") return [];
  const offered = attack.source.spellIds?.length ? [...attack.source.spellIds] : PC_ATTACK_CANTRIPS.map((cantrip) => cantrip.spellId);
  // Booming Blade and Green-Flame Blade are woven into a melee weapon attack, never picked here.
  return offered.filter((spellId) => getPcAttackCantrip(spellId)?.delivery !== "weapon");
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
  if (!attack || attack.source?.kind === "cantrip" || attack.range !== "melee") return [];
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
export function pcAttackResolvedAction(action, spellId = "") {
  const attack = pcAttackAction(action);
  if (!attack || attack.source?.kind !== "cantrip") return attack;
  const cantrip = getPcAttackCantrip(spellId);
  if (!cantrip || !pcAttackCantripIds(attack).includes(cantrip.spellId)) return null;
  return { ...attack, range: cantrip.range, components: [{ id: "c1", type: cantrip.type }],
    cantrip: { spellId: cantrip.spellId, name: cantrip.name, ...(cantrip.save ? { save: cantrip.save } : {}),
      ...(cantrip.ruleNote ? { ruleNote: cantrip.ruleNote } : {}), ...(cantrip.effectNote ? { effectNote: cantrip.effectNote } : {}) } };
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

// "TS Destrezza (CD 14)": the save of a saving throw cantrip, with the actor's spell save DC when the card has it.
export function pcAttackSaveLabel(attack, card = {}) {
  const ability = PC_ATTACK_SAVE_LABELS[attack?.cantrip?.save];
  if (!ability) return "";
  const dc = Number(card?.spellSaveDC);
  return `TS ${ability}${Number.isFinite(dc) && dc > 0 ? ` (CD ${dc})` : ""}`;
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
  // Casters' riders exist only on cantrips (Agonizing Blast only on Eldritch Blast); the others need a weapon.
  if (rider.spellOnly && !attack.cantrip) return "Solo per i trucchetti.";
  if (rider.spellIds && !rider.spellIds.includes(attack.cantrip?.spellId)) return rider.spellReason || "Non per questo trucchetto.";
  if (attack.cantrip && !rider.anyAttack && !rider.spellOnly) return "Solo per gli attacchi con arma.";
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
export function pcAttackRiderOptions({ action, spellId = "", sourceItem, targetItem = null, turnState = null } = {}) {
  const attack = pcAttackResolvedAction(action, spellId);
  if (!attack || !sourceItem) return [];
  return riderOptionsFor(attack, { sourceItem, targetItem, turnState });
}

function riderOptionsFor(attack, { sourceItem, targetItem = null, turnState = null }) {
  const sourceMeta = sourceItem.metadata?.[META_KEY] || {};
  const card = sourceMeta.initiativeCard || {};
  const turn = attackTurn(turnState);
  const uses = currentRiderUses(sourceMeta, turn?.turnKey);
  const weaponTypes = [...new Set(attack.components.map((component) => component.type))];
  return pcAttackRidersForCard(card).map((rider) => {
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
export function pcAttackCantripPillOperations({ attack, sourceItem, targetItem, attackInstanceId, appliedAt = null, spellId = "" } = {}) {
  // spellId: a weapon cantrip woven into a weapon attack (Booming Blade); otherwise the cantrip of the attack.
  const spell = getSpellDefinition(spellId || attack?.cantrip?.spellId || "");
  if (!spell || !sourceItem?.id || !targetItem?.id) return [];
  const castContext = { slotLevel: 0, phase: "cast", choice: "", applyAutomatedConditions: true };
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

// What the GM may do next because of this attack (shown after the commit, never applied by it).
// Inspiring Smite (Oath of Glory) follows a Divine Smite: a Channel Divinity the GM activates separately.
export function pcAttackFollowUps(card = {}, riders = []) {
  const notes = riders.filter((rider) => rider.slotLevel)
    .map((rider) => `${rider.option?.label || rider.id}: slot di ${rider.slotLevel}° livello speso, scalalo dalla scheda (non è conteggiato).`);
  if (riders.some((rider) => rider.id === "paladino-punizione-divina")
      && getEnabledClassFeatureIds(card).has("paladino-giuramento-di-gloria-incanalare-divinita-punizione-ispiratrice"))
    notes.push("Punizione Ispiratrice: puoi usare Incanalare Divinità come azione bonus (capacità di classe del paladino).");
  return notes;
}

// Weapon components first, then the chosen riders, then the components added on the fly.
function attackComponents(attack, riders = [], extras = [], woven = null) {
  return [
    ...attack.components.map((component) => ({ ...component, source: { kind: "weapon" } })),
    // A weapon cantrip's extra dice on the hit (from 5th level): a component of its own type.
    ...(woven ? [{ id: `w:${woven.spellId}`, type: woven.type, source: { kind: "cantrip", spellId: woven.spellId, name: woven.name } }] : []),
    ...riders.map((rider) => ({ id: `r:${rider.id}`, type: rider.type,
      source: { kind: "class-feature", featureId: rider.id, name: getPcAttackRider(rider.id)?.label || rider.id } })),
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
  riders = [], extras = [], turnState = null, weaponCantrip = null, secondaryItem = null,
} = {}) {
  const attack = pcAttackResolvedAction(action, spellId);
  if (!attack) return { ready: false, blocker: pcAttackAction(action) ? "Scegli il trucchetto." : "Azione di attacco non valida.",
    defenses: [], profileDefenses: {}, total: 0, hp: null };
  const card = sourceItem?.metadata?.[META_KEY]?.initiativeCard || {};
  // A miss or a passed save deals no damage (half with Potent Cantrip); extras only with a hit or a failed save.
  const factor = pcAttackDamageFactor(attack, outcome, sourceItem?.metadata?.[META_KEY]?.initiativeCard);
  const miss = factor === "zero";
  const extrasAllowed = DAMAGING_OUTCOMES.has(outcome);
  const chosenRiders = extrasAllowed ? riders : [];
  const chosenExtras = extrasAllowed ? extras.map((extra) => ({ ...extra, label: extraLabel(extra.label) })) : [];
  const wovenOption = extrasAllowed && weaponCantrip?.spellId
    ? pcAttackWeaponCantripOptions(action, card).find((option) => option.spellId === weaponCantrip.spellId) || null : null;
  const woven = wovenOption?.dice?.hit ? wovenOption : null;
  const components = attackComponents(attack, chosenRiders, chosenExtras, woven);
  const allAmounts = {
    ...amounts,
    ...(woven ? { [`w:${woven.spellId}`]: weaponCantrip.amount } : {}),
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
  // Green-Flame Blade's second creature: its own defenses, its own hit points.
  const secondaryWanted = wovenOption?.secondary && !!weaponCantrip?.secondary?.targetId;
  const secondaryDefenses = secondaryWanted && secondaryItem ? damageDefensesForItem(secondaryItem, META_KEY) : {};
  const secondaryMeta = secondaryItem?.metadata?.[META_KEY] || {};
  const secondaryTotal = secondaryWanted && secondaryItem && validAmount(weaponCantrip.secondary.amount)
    ? bossDefendedDamage([{ id: "s1", type: wovenOption.type }], { s1: weaponCantrip.secondary.amount }, "hit", secondaryDefenses, []) : 0;
  const secondary = secondaryWanted && secondaryItem ? { id: secondaryItem.id, total: secondaryTotal, profileDefenses: secondaryDefenses,
    hp: Number.isFinite(secondaryMeta.hp) && Number.isFinite(secondaryMeta.hpMax)
      ? { before: secondaryMeta.hp, after: calculateQuickHPChange({ value: secondaryTotal, hp: secondaryMeta.hp, hpMax: secondaryMeta.hpMax }).afterHP, hpMax: secondaryMeta.hpMax }
      : null } : null;
  const wovenBlocker = !weaponCantrip?.spellId || !extrasAllowed ? ""
    : !wovenOption ? "Trucchetto con l'arma non disponibile per questo attacco."
    : woven && !validAmount(weaponCantrip.amount) ? `Inserisci il danno di ${wovenOption.name}.`
    : secondaryWanted && (!secondaryItem || secondaryItem.id === targetItem?.id) ? "Scegli un'altra creatura come seconda."
    : secondaryWanted && !validAmount(weaponCantrip.secondary.amount) ? "Inserisci il danno della seconda creatura."
    : secondaryWanted && !secondary?.hp ? "La seconda creatura non ha HP canonici validi."
    : "";
  const blocker = !targetItem ? "Scegli il bersaglio."
    : !pcAttackOutcomesFor(attack).includes(outcome) ? (attack.cantrip?.save ? "Scegli l'esito del tiro salvezza." : "Scegli l'esito dell'attacco.")
    : !miss && attack.components.some((component) => !validAmount(amounts?.[component.id])) ? "Inserisci il danno di ogni componente."
    : riderBlock ? riderBlock
    : chosenExtras.some((extra) => !damageTypeSet.has(extra.type)) ? "Scegli il tipo di ogni componente extra."
    : [...chosenRiders, ...chosenExtras].some((entry) => !validAmount(entry.amount)) ? "Inserisci il danno di ogni extra."
    : wovenBlocker ? wovenBlocker
    : !hp ? "Il bersaglio non ha HP canonici validi."
    : "";
  return { ready: !blocker, blocker, defenses, profileDefenses, total, hp, ...(secondary ? { secondary } : {}) };
}

export function buildPcAttackMutation({
  action, sourceItem, targetItem, outcome = "", componentAmounts = {}, attackInstanceId,
  ignoredDefenses = [], expectedDefenses, turnState = null, riders = [], extras = [], spellId = "",
  weaponCantrip = null, secondaryItem = null, expectedSecondaryDefenses,
} = {}) {
  if (!isBossActionCreature(sourceItem) || !isBossActionCreature(targetItem))
    throw new Error("Attaccante e bersaglio devono essere token creatura reali.");
  if (sourceItem.id === targetItem.id) throw new Error("L'attaccante non può essere anche il bersaglio.");
  if (!attackInstanceId || typeof attackInstanceId !== "string") throw new Error("Identità dell'attacco mancante.");
  if (!pcAttackAction(action)) throw new Error("Azione rapida di attacco non valida.");
  const attack = pcAttackResolvedAction(action, spellId);
  if (!attack) throw new Error("Trucchetto non disponibile per questa azione.");
  if (!pcAttackOutcomesFor(attack).includes(outcome))
    throw new Error(attack.cantrip?.save ? "Scegli l'esito del tiro salvezza." : "Scegli l'esito dell'attacco.");
  const factor = pcAttackDamageFactor(attack, outcome, sourceItem.metadata?.[META_KEY]?.initiativeCard);
  const miss = factor === "zero";
  const riderRequests = Array.isArray(riders) ? riders : [];
  const extraRequests = Array.isArray(extras) ? extras : [];
  if (!DAMAGING_OUTCOMES.has(outcome) && (riderRequests.length || extraRequests.length))
    throw new Error(attack.cantrip?.save ? "Gli extra valgono solo se il tiro salvezza fallisce." : "Gli extra al colpo valgono solo se l'attacco colpisce.");
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
  const amounts = componentAmounts && typeof componentAmounts === "object" ? componentAmounts : {};
  if (!miss && Object.keys(amounts).some((id) => !attack.components.some((component) => component.id === id)))
    throw new Error("Componente di danno sconosciuta.");
  const components = attackComponents(attack, chosenRiders, chosenExtras, woven?.amount !== null && woven ? woven : null);
  const inputs = Object.fromEntries([
    ...attack.components.map((component) => [component.id, miss ? null : damageAmount(amounts[component.id])]),
    ...(woven && woven.amount !== null ? [[`w:${woven.spellId}`, woven.amount]] : []),
    ...chosenRiders.map((rider) => [`r:${rider.id}`, rider.amount]),
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
    change = calculateQuickHPChange({ value: requestedDamage, hp: targetMeta.hp, hpMax: targetMeta.hpMax });
  }
  // Green-Flame Blade's second creature: the fire jumps to it; its own defenses (as seen in the console) and HP.
  const secondaryItemUsed = woven?.secondary?.item || null;
  const secondaryComponents = secondaryItemUsed
    ? defendedComponents([{ id: "s1", type: woven.type, source: { kind: "cantrip", spellId: woven.spellId, name: woven.name } }],
      { s1: woven.secondary.amount }, "full", secondaryItemUsed, [], expectedSecondaryDefenses) : [];
  const secondaryMeta = secondaryItemUsed?.metadata?.[META_KEY] || {};
  let secondaryChange = null;
  if (secondaryItemUsed) {
    if (!Number.isFinite(secondaryMeta.hp) || !Number.isFinite(secondaryMeta.hpMax) || secondaryMeta.hp < 0 || secondaryMeta.hpMax < 0)
      throw new Error("La seconda creatura non ha HP canonici validi.");
    secondaryChange = calculateQuickHPChange({ value: secondaryComponents.reduce((sum, component) => sum + component.amount, 0),
      hp: secondaryMeta.hp, hpMax: secondaryMeta.hpMax });
  }
  const sourceName = sourceItem.name || sourceItem.id;
  const targetName = targetItem.name || targetItem.id;
  // Only the uses of the current turn are kept: the field never grows past one turn.
  const newUses = turn ? chosenRiders.filter((rider) => rider.option.limit).map((rider) => ({
    riderId: rider.id, turnKey: turn.turnKey, ...(rider.option.limit.scope === "target" ? { targetId: targetItem.id } : {}),
  })) : [];
  const riderUses = [...currentRiderUses(sourceMeta, turn?.turnKey), ...newUses];
  const state = {
    version: PC_ATTACK_STATE_VERSION,
    lastAttack: {
      attackInstanceId, quickActionId: attack.id, targetId: targetItem.id, outcome, ...(attack.cantrip ? { spellId: attack.cantrip.spellId } : {}),
      ...(turn ? { round: turn.round, turnKey: turn.turnKey } : {}),
    },
    ...(riderUses.length ? { riderUses } : {}),
  };
  const componentOf = (id) => damageComponents.find((component) => component.id === id);
  // A cantrip is named by the spell; its dice follow the attacker's character level.
  const actionName = attack.cantrip ? attack.cantrip.name : attack.label;
  const cantripDice = pcAttackCantripDiceFor(attack, sourceMeta.initiativeCard, targetItem);
  const saveLabel = pcAttackSaveLabel(attack, sourceMeta.initiativeCard);
  const causality = {
    actor: { id: sourceItem.id, tokenId: sourceItem.id, name: sourceName, role: "attacker" },
    cause: { kind: PC_ATTACK_HISTORY_KIND, quickActionId: attack.id, actionName: actionName, attackInstanceId, range: attack.range,
      ...(attack.cantrip ? { spellId: attack.cantrip.spellId, spellName: attack.cantrip.name } : {}) },
    action: { id: attack.id, label: actionName, ...(attack.cantrip?.save ? {} : { attackOutcome: outcome }) },
    attack: { range: attack.range, outcome, source: attack.cantrip ? "cantrip" : "weapon" },
    ...(attack.cantrip ? { cantrip: { ...attack.cantrip, ...(cantripDice ? { dice: cantripDice } : {}), ...(saveLabel ? { saveLabel } : {}) } } : {}),
    ...(attack.cantrip?.save ? { save: { ability: attack.cantrip.save, outcome, ...(factor === "half" ? { potentCantrip: true } : {}),
      ...(Number(sourceMeta.initiativeCard?.spellSaveDC) > 0 ? { dc: Number(sourceMeta.initiativeCard.spellSaveDC) } : {}) } } : {}),
    ...(turn ? { turn } : {}),
    ...(chosenRiders.length ? { riders: chosenRiders.map((rider) => ({
      featureId: rider.id, name: rider.option.label, ...(rider.dice ? { dice: rider.dice } : {}),
      type: rider.type, typeLabel: damageTypeLabel(rider.type), inputAmount: rider.amount, amount: componentOf(`r:${rider.id}`).amount,
      ...(rider.option.limit ? { limit: { ...rider.option.limit } } : {}),
      // The slot is spent at the table: PC slots are not tracked, so it is recorded, never decremented.
      ...(rider.slotLevel ? { slotLevel: rider.slotLevel, slotTracked: false } : {}),
      ...(rider.bonus ? { bonus: rider.option.bonus.label } : {}),
      ...(rider.onHit ? { condition: rider.option.onHit.condition } : {}),
    })) } : {}),
    ...(chosenExtras.length ? { extras: chosenExtras.map((extra, index) => ({
      ...(extra.label ? { label: extra.label } : {}), type: extra.type, typeLabel: damageTypeLabel(extra.type),
      inputAmount: extra.amount, amount: componentOf(`x${index + 1}`).amount,
    })) } : {}),
    ...(woven ? { weaponCantrip: { spellId: woven.spellId, name: woven.name, type: woven.type,
      ...(woven.dice.hit ? { dice: woven.dice.hit } : {}), ...(woven.dice.trigger ? { triggerDice: woven.dice.trigger } : {}),
      ...(secondaryItemUsed ? { secondaryDice: woven.dice.secondary, secondaryTargetId: secondaryItemUsed.id } : {}) } } : {}),
    targets: [{
      id: targetItem.id, name: targetName, outcome, requestedDamage,
      ...(change ? { appliedHpDelta: change.delta } : {}),
      damageComponents: structuredClone(damageComponents),
    }, ...(secondaryItemUsed ? [{
      id: secondaryItemUsed.id, name: secondaryItemUsed.name || secondaryItemUsed.id, outcome: "secondary",
      requestedDamage: secondaryComponents.reduce((sum, component) => sum + component.amount, 0),
      appliedHpDelta: secondaryChange.delta, damageComponents: structuredClone(secondaryComponents),
    }] : [])],
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
      // Booming Blade: its pill from the spell catalog, with the movement damage at this level in the detail.
      ...(woven?.trigger ? pcAttackCantripPillOperations({ spellId: woven.spellId, sourceItem, targetItem, attackInstanceId, appliedAt })
        .map((operation) => operation.type !== "condition:add" ? operation : { ...operation, options: { ...operation.options,
          effectDetail: `${operation.options?.effectDetail || ""} Danni: ${woven.dice.trigger} da tuono.`.trim() } }) : [])]
    : [];
  const cantripPills = cantripOperations.filter((operation) => operation.type === "condition:add").map((operation) => operation.conditionName);
  if (cantripPills.length && attack.cantrip) causality.cantrip = { ...causality.cantrip, pills: cantripPills };
  if (cantripPills.length && woven) causality.weaponCantrip = { ...causality.weaponCantrip, pills: cantripPills };
  const appliedConditions = [...conditions.map((entry) => ({ targetId: targetItem.id, ...entry, ...(appliedAt ? { appliedAt } : {}) })),
    ...cantripPills.map((condition) => ({ targetId: targetItem.id, condition, spellId: attack.cantrip?.spellId || woven?.spellId,
      ...(appliedAt ? { appliedAt } : {}) }))];
  if (appliedConditions.length) causality.conditionsApplied = appliedConditions;
  const conditionOperations = conditions.map((entry) => ({ type: "condition:add", targetIds: [targetItem.id], conditionName: entry.condition,
    instanceIds: { [targetItem.id]: entry.instanceId },
    options: { sourceId: sourceItem.id, sourceName, parentEffectId: "", type: "automatic", manualRemoval: true,
      expiry: { mode: "manual" }, ...(appliedAt ? { appliedAt } : {}) } }));
  return {
    change, damageComponents, causality, followUps: pcAttackFollowUps(sourceMeta.initiativeCard, chosenRiders),
    ...(secondaryItemUsed ? { secondaryChange, secondaryItem: secondaryItemUsed } : {}),
    operations: [...(change?.changed || secondaryChange?.changed ? [{ type: "hp:set", updates: [
      ...(change?.changed ? [{
        itemId: targetItem.id, hp: change.afterHP, hpMax: change.hpMax,
        hpIntent: { mode: "damage", amount: change.requested, eventId: attackInstanceId },
        expectedHP: bossMetadataSnapshot(targetMeta, "hp"), expectedHPMax: bossMetadataSnapshot(targetMeta, "hpMax"),
      }] : []),
      ...(secondaryChange?.changed ? [{
        itemId: secondaryItemUsed.id, hp: secondaryChange.afterHP, hpMax: secondaryChange.hpMax,
        hpIntent: { mode: "damage", amount: secondaryChange.requested, eventId: attackInstanceId },
        expectedHP: bossMetadataSnapshot(secondaryMeta, "hp"), expectedHPMax: bossMetadataSnapshot(secondaryMeta, "hpMax"),
      }] : []),
    ] }] : []), ...conditionOperations,
    ...(conditionOperations.length ? [{ type: "condition:automate", subjectIds: [targetItem.id] }] : []), ...cantripOperations],
    options: {
      commandId: attackInstanceId, correlationId: attackInstanceId, sourceId: sourceItem.id,
      targetIds: [targetItem.id, ...(secondaryItemUsed ? [secondaryItemUsed.id] : [])], kind: PC_ATTACK_HISTORY_KIND, label,
      // The quick action read from the attacker's card, and the defenses read from the target's card,
      // must still be the ones at commit.
      metadataPatches: [
        { id: sourceItem.id, fields: {
          initiativeCard: { mode: "assert", expected: bossMetadataSnapshot(sourceMeta, "initiativeCard") },
          [PC_ATTACK_STATE_FIELD]: { value: state, expected: bossMetadataSnapshot(sourceMeta, PC_ATTACK_STATE_FIELD) },
        } },
        ...(change?.changed ? [targetProfileAssert(targetItem)] : []),
        ...(secondaryChange?.changed ? [targetProfileAssert(secondaryItemUsed)] : []),
      ],
      // A use counted per turn belongs to the turn the GM saw: a turn change before the commit refuses it.
      ...(newUses.length ? { sceneMetadataPreconditions: [
        { key: STATE_KEY, field: "round", value: turnState?.round },
        { key: STATE_KEY, field: "current", value: turnState?.current },
      ] } : {}),
      history: { kind: PC_ATTACK_HISTORY_KIND, label, payload: { causality, damageComponents: structuredClone(damageComponents),
        // The cantrip's on-hit effect is not applied yet: it is recorded as the part the GM resolves by hand.
        ...(DAMAGING_OUTCOMES.has(outcome) && attack.cantrip?.effectNote ? { manualRemainder: attack.cantrip.effectNote } : {}) } },
    },
  };
}
