// PC attack tracking: one attack of an actor against one creature, as one command.
// Pure: no SDK, DOM or runtime state. The GM enters the rolled total of each typed component;
// no formula is evaluated and no eligibility (advantage, reach, weapon properties) is checked.
// Phase 1 adds the extra damage on a hit: class feature riders (pcAttackRiderCatalog.js), counted per
// initiative turn, and components the GM adds on the fly (Booming Blade, Hunter's Mark, a magic weapon).
import { ID } from "./constants.js";
import { calculateQuickHPChange } from "./quickHpCore.js";
import { sanitizeQuickAction, QUICK_ACTION_ATTACK_DAMAGE_TYPES } from "./quickActionsCore.js";
import {
  isBossActionCreature, bossMetadataSnapshot, bossConditionAppliedAt,
  damageAmount, defendedComponents, targetProfileAssert, bossGroupConditionInstanceId,
} from "./bossActionExecutionCore.js";
import { bossDefendedDamage } from "./bossActionsViewCore.js";
import { damageDefensesForItem, damageTypeLabel, relevantDamageDefenses } from "./damageDefensesCore.js";
import { getClassFeatureDefinition, getEnabledClassFeatures } from "./classFeatureCatalog.js";
import { getPcAttackRider, pcAttackRiderDice, pcAttackRiderFeatureActive, pcAttackRidersForCard, pcAttackRiderSlotLevels } from "./pcAttackRiderCatalog.js";

export const PC_ATTACK_HISTORY_KIND = "pc-attack";
// The attacker's last attack and the riders it used in the current turn. Every attack rewrites it,
// so a miss is still a command with a History entry (and a Combat Log event).
export const PC_ATTACK_STATE_FIELD = "pcAttackState";
export const PC_ATTACK_STATE_VERSION = 1;
export const PC_ATTACK_OUTCOMES = Object.freeze(["hit", "critical", "miss"]);
export const MAX_PC_ATTACK_EXTRAS = 3;
const META_KEY = `${ID}/meta`;
const STATE_KEY = `${ID}/state`;
const damageTypeSet = new Set(QUICK_ACTION_ATTACK_DAMAGE_TYPES);

export function pcAttackAction(action) {
  const normalized = sanitizeQuickAction(action);
  return normalized?.kind === "attack" ? normalized : null;
}

export const PC_ATTACK_OUTCOME_LABELS = Object.freeze({ hit: "Colpito", critical: "Critico", miss: "Mancato" });

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
export function pcAttackRiderOptions({ action, sourceItem, targetItem = null, turnState = null } = {}) {
  const attack = pcAttackAction(action);
  if (!attack || !sourceItem) return [];
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
function attackComponents(attack, riders = [], extras = []) {
  return [
    ...attack.components.map((component) => ({ ...component, source: { kind: "weapon" } })),
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
  action, sourceItem = null, targetItem = null, outcome = "", amounts = {}, ignoredDefenses = [],
  riders = [], extras = [], turnState = null,
} = {}) {
  const attack = pcAttackAction(action);
  if (!attack) return { ready: false, blocker: "Azione di attacco non valida.", defenses: [], profileDefenses: {}, total: 0, hp: null };
  const miss = outcome === "miss";
  const chosenRiders = miss ? [] : riders;
  const chosenExtras = miss ? [] : extras.map((extra) => ({ ...extra, label: extraLabel(extra.label) }));
  const components = attackComponents(attack, chosenRiders, chosenExtras);
  const allAmounts = {
    ...amounts,
    ...Object.fromEntries(chosenRiders.map((rider) => [`r:${rider.id}`, rider.amount])),
    ...Object.fromEntries(chosenExtras.map((extra, index) => [`x${index + 1}`, extra.amount])),
  };
  const profileDefenses = targetItem ? damageDefensesForItem(targetItem, META_KEY) : {};
  const defenses = relevantDamageDefenses(profileDefenses, components.filter((component) => damageTypeSet.has(component.type)), ignoredDefenses);
  const total = targetItem && outcome ? bossDefendedDamage(components, allAmounts, outcome, profileDefenses, ignoredDefenses) : 0;
  const meta = targetItem?.metadata?.[META_KEY] || {};
  const hp = targetItem && Number.isFinite(meta.hp) && Number.isFinite(meta.hpMax)
    ? { before: meta.hp, after: miss ? meta.hp : calculateQuickHPChange({ value: total, hp: meta.hp, hpMax: meta.hpMax }).afterHP, hpMax: meta.hpMax }
    : null;
  const options = chosenRiders.length ? pcAttackRiderOptions({ action: attack, sourceItem, targetItem, turnState }) : [];
  const riderBlock = chosenRiders.map((rider) => {
    const option = options.find((entry) => entry.id === rider.id);
    if (!option) return "Extra non disponibile per questo attaccante.";
    if (!option.available) return `${option.label}: ${option.reason}`;
    if (option.slotLevels && !option.slotLevels.includes(rider.slotLevel)) return `${option.label}: scegli il livello dello slot.`;
    return option.types.includes(rider.type) ? "" : `${option.label}: scegli il tipo di danno.`;
  }).find(Boolean) || "";
  const blocker = !targetItem ? "Scegli il bersaglio."
    : !PC_ATTACK_OUTCOMES.includes(outcome) ? "Scegli l'esito dell'attacco."
    : !miss && attack.components.some((component) => !validAmount(amounts?.[component.id])) ? "Inserisci il danno di ogni componente."
    : riderBlock ? riderBlock
    : chosenExtras.some((extra) => !damageTypeSet.has(extra.type)) ? "Scegli il tipo di ogni componente extra."
    : [...chosenRiders, ...chosenExtras].some((entry) => !validAmount(entry.amount)) ? "Inserisci il danno di ogni extra."
    : !hp ? "Il bersaglio non ha HP canonici validi."
    : "";
  return { ready: !blocker, blocker, defenses, profileDefenses, total, hp };
}

export function buildPcAttackMutation({
  action, sourceItem, targetItem, outcome = "", componentAmounts = {}, attackInstanceId,
  ignoredDefenses = [], expectedDefenses, turnState = null, riders = [], extras = [],
} = {}) {
  if (!isBossActionCreature(sourceItem) || !isBossActionCreature(targetItem))
    throw new Error("Attaccante e bersaglio devono essere token creatura reali.");
  if (sourceItem.id === targetItem.id) throw new Error("L'attaccante non può essere anche il bersaglio.");
  if (!attackInstanceId || typeof attackInstanceId !== "string") throw new Error("Identità dell'attacco mancante.");
  const attack = pcAttackAction(action);
  if (!attack) throw new Error("Azione rapida di attacco non valida.");
  if (!PC_ATTACK_OUTCOMES.includes(outcome)) throw new Error("Scegli l'esito dell'attacco.");
  const miss = outcome === "miss";
  const riderRequests = Array.isArray(riders) ? riders : [];
  const extraRequests = Array.isArray(extras) ? extras : [];
  if (miss && (riderRequests.length || extraRequests.length)) throw new Error("Gli extra al colpo valgono solo se l'attacco colpisce.");
  if (new Set(riderRequests.map((rider) => rider?.id)).size !== riderRequests.length) throw new Error("Lo stesso extra è indicato due volte.");
  if (extraRequests.length > MAX_PC_ATTACK_EXTRAS) throw new Error(`Al massimo ${MAX_PC_ATTACK_EXTRAS} componenti extra.`);
  const turn = attackTurn(turnState);
  const sourceMeta = sourceItem.metadata?.[META_KEY] || {};
  // Riders are checked against the live attacker, target and turn: the console may be stale.
  const options = riderRequests.length ? pcAttackRiderOptions({ action: attack, sourceItem, targetItem, turnState }) : [];
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
  const amounts = componentAmounts && typeof componentAmounts === "object" ? componentAmounts : {};
  if (!miss && Object.keys(amounts).some((id) => !attack.components.some((component) => component.id === id)))
    throw new Error("Componente di danno sconosciuta.");
  const components = attackComponents(attack, chosenRiders, chosenExtras);
  const inputs = Object.fromEntries([
    ...attack.components.map((component) => [component.id, miss ? null : damageAmount(amounts[component.id])]),
    ...chosenRiders.map((rider) => [`r:${rider.id}`, rider.amount]),
    ...chosenExtras.map((extra, index) => [`x${index + 1}`, extra.amount]),
  ]);
  // A critical hit keeps the full factor: the totals the GM enters already include the doubled dice.
  const damageComponents = defendedComponents(components, inputs, miss ? "zero" : "full", targetItem, ignoredDefenses, expectedDefenses);
  const requestedDamage = damageComponents.reduce((sum, component) => sum + component.amount, 0);
  const targetMeta = targetItem.metadata?.[META_KEY] || {};
  let change = null;
  if (!miss) {
    if (!Number.isFinite(targetMeta.hp) || !Number.isFinite(targetMeta.hpMax)
        || targetMeta.hp < 0 || targetMeta.hpMax < 0) throw new Error("Il bersaglio non ha HP canonici validi.");
    change = calculateQuickHPChange({ value: requestedDamage, hp: targetMeta.hp, hpMax: targetMeta.hpMax });
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
      attackInstanceId, quickActionId: attack.id, targetId: targetItem.id, outcome,
      ...(turn ? { round: turn.round, turnKey: turn.turnKey } : {}),
    },
    ...(riderUses.length ? { riderUses } : {}),
  };
  const componentOf = (id) => damageComponents.find((component) => component.id === id);
  const causality = {
    actor: { id: sourceItem.id, tokenId: sourceItem.id, name: sourceName, role: "attacker" },
    cause: { kind: PC_ATTACK_HISTORY_KIND, quickActionId: attack.id, actionName: attack.label, attackInstanceId, range: attack.range },
    action: { id: attack.id, label: attack.label, attackOutcome: outcome },
    attack: { range: attack.range, outcome },
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
    targets: [{
      id: targetItem.id, name: targetName, outcome, requestedDamage,
      ...(change ? { appliedHpDelta: change.delta } : {}),
      damageComponents: structuredClone(damageComponents),
    }],
  };
  const label = `${sourceName}: ${attack.label} → ${targetName}`;
  // On-hit conditions (Eldritch Smite: Prono): standard pills, removed by hand, undone with the attack.
  const appliedAt = bossConditionAppliedAt(turnState);
  const conditions = chosenRiders.filter((rider) => rider.onHit).map((rider) => ({
    condition: rider.option.onHit.condition, featureId: rider.id,
    instanceId: bossGroupConditionInstanceId(attackInstanceId, rider.option.onHit.condition, targetItem.id),
  }));
  if (conditions.length) causality.conditionsApplied = conditions.map((entry) => ({ targetId: targetItem.id, ...entry, ...(appliedAt ? { appliedAt } : {}) }));
  const conditionOperations = conditions.map((entry) => ({ type: "condition:add", targetIds: [targetItem.id], conditionName: entry.condition,
    instanceIds: { [targetItem.id]: entry.instanceId },
    options: { sourceId: sourceItem.id, sourceName, parentEffectId: "", type: "automatic", manualRemoval: true,
      expiry: { mode: "manual" }, ...(appliedAt ? { appliedAt } : {}) } }));
  return {
    change, damageComponents, causality, followUps: pcAttackFollowUps(sourceMeta.initiativeCard, chosenRiders),
    operations: [...(change?.changed ? [{ type: "hp:set", updates: [{
      itemId: targetItem.id, hp: change.afterHP, hpMax: change.hpMax,
      hpIntent: { mode: "damage", amount: change.requested, eventId: attackInstanceId },
      expectedHP: bossMetadataSnapshot(targetMeta, "hp"), expectedHPMax: bossMetadataSnapshot(targetMeta, "hpMax"),
    }] }] : []), ...conditionOperations,
    ...(conditionOperations.length ? [{ type: "condition:automate", subjectIds: [targetItem.id] }] : [])],
    options: {
      commandId: attackInstanceId, correlationId: attackInstanceId, sourceId: sourceItem.id,
      targetIds: [targetItem.id], kind: PC_ATTACK_HISTORY_KIND, label,
      // The quick action read from the attacker's card, and the defenses read from the target's card,
      // must still be the ones at commit.
      metadataPatches: [
        { id: sourceItem.id, fields: {
          initiativeCard: { mode: "assert", expected: bossMetadataSnapshot(sourceMeta, "initiativeCard") },
          [PC_ATTACK_STATE_FIELD]: { value: state, expected: bossMetadataSnapshot(sourceMeta, PC_ATTACK_STATE_FIELD) },
        } },
        ...(change?.changed ? [targetProfileAssert(targetItem)] : []),
      ],
      // A use counted per turn belongs to the turn the GM saw: a turn change before the commit refuses it.
      ...(newUses.length ? { sceneMetadataPreconditions: [
        { key: STATE_KEY, field: "round", value: turnState?.round },
        { key: STATE_KEY, field: "current", value: turnState?.current },
      ] } : {}),
      history: { kind: PC_ATTACK_HISTORY_KIND, label, payload: { causality, damageComponents: structuredClone(damageComponents) } },
    },
  };
}
