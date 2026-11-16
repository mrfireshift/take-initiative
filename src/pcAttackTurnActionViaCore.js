// The features that grant an action of the attack console's Azioni tab as a bonus action (lot T4a of
// docs/STUDIO_AZIONI_DI_TURNO.md, decision A1). Each does the same action through the same command
// (buildPcTurnActionMutation), with its own cost in it (Step of the Wind's ki, a species trait's use) and its name in the
// log; Adrenaline Rush adds its temporary hit points as its own trait gives them (speciesHpTraitCore.js). The plugin counts
// no action of the turn: a feature here only says where the action comes from and what it spends. Pure.
import { classFeatureResourceStatus, getClassFeatureDefinition, getClassFeatureResourcePool, getEnabledClassFeatures } from "./classFeatureCatalog.js";
import { activeClassFeatureInstances } from "./classFeatureCore.js";
import { ID } from "./constants.js";
import { bossConditionAppliedAt, bossGroupConditionInstanceId, bossMetadataSnapshot } from "./bossActionExecutionCore.js";
import { planSpeciesHpTrait } from "./speciesHpTraitCore.js";
import { NO_OPPORTUNITY_PILL } from "./opportunityAttackCore.js";
import { initiativeTurnCreatureId, planReactionSpend } from "./reactionTrackerCore.js";

const META_KEY = `${ID}/meta`;
const freezeVia = (kinds, extra = {}) => Object.freeze({ kinds: Object.freeze(kinds), ...extra });

// kinds: the actions it grants; note: what stays at the table (the plugin measures no distance); whileActive: only while
// the feature is active (the Eagle totem spirit comes and goes with Rage).
export const PC_TURN_ACTION_VIAS = Object.freeze({
  "ladro-azione-scaltra": freezeVia(["dash", "disengage", "hide"]),
  "monaco-ki-passo-del-vento": freezeVia(["dash", "disengage"], { note: "Per il turno raddoppia anche la distanza dei salti." }),
  "ranger-revised-passo-veloce": freezeVia(["dash"]),
  "ranger-svanire": freezeVia(["hide"]),
  "ranger-revised-svanire": freezeVia(["hide"]),
  "ladro-pianificatore-maestro-di-tattiche": freezeVia(["help"],
    { note: "Aiutando in un attacco, il nemico può essere fino a 9 m dal ladro invece che entro 1,5 m." }),
  "specie-goblin-fuga-agile": freezeVia(["disengage", "hide"]),
  "specie-goblin-multiverso-fuga-agile": freezeVia(["disengage", "hide"]),
  "specie-orco-aggressivo": freezeVia(["dash"],
    { note: "Solo verso una creatura ostile che vede o sente, finendo il movimento più vicino a lei." }),
  "specie-orco-multiverso-scarica-di-adrenalina": freezeVia(["dash"],
    { note: "Con lo Scatto, PF temporanei pari al bonus di competenza: non si sommano a quelli che ha già." }),
  "barbaro-cammino-del-combattente-totemico-spirito-totemico-aquila": freezeVia(["dash"], { whileActive: true }),
});

const text = (value) => String(value ?? "").trim();
const metaOf = (item) => item?.metadata?.[META_KEY] || {};

export function pcTurnActionViaKinds(featureId) {
  return [...(PC_TURN_ACTION_VIAS[text(featureId)]?.kinds || [])];
}

export function pcTurnActionViaNote(featureId) {
  return PC_TURN_ACTION_VIAS[text(featureId)]?.note || "";
}

// The feature's cost now, as the sheet reads it: the first pool it spends, with what is left (null: it spends nothing).
function viaCost(feature, card, stateValue) {
  const status = classFeatureResourceStatus(feature, card, stateValue);
  const entry = status.entries.find((value) => value.poolId) || null;
  if (!entry) return null;
  const pool = getClassFeatureResourcePool(entry.poolId);
  return { pool, poolId: entry.poolId, name: text(pool?.name) || entry.poolId, amount: entry.amount, ready: entry.ready,
    current: entry.current, maximum: entry.maximum, unlimited: entry.unlimited };
}

// The feature's pool spent once (class-feature:adjust-resource, as a reaction feature spends it): { operations, spent },
// spent the pool's name with what is left («Punti Ki 1/2»).
function featureCostPlan(feature, sourceItem, eventId) {
  const meta = metaOf(sourceItem);
  const card = meta.initiativeCard || {};
  const cost = viaCost(feature, card, meta.classFeatureState);
  if (!cost || cost.unlimited) return { operations: [], spent: "" };
  const left = Number.isFinite(cost.current) ? Math.max(0, cost.current - cost.amount) : null;
  return {
    operations: [{ type: "class-feature:adjust-resource", operationId: `${eventId}:via-resource`, sourceId: sourceItem.id, pool: cost.pool,
      characterBuild: card.characterBuild, abilityModifiers: card.abilityModifiers || null, adjustment: { delta: -cost.amount } }],
    spent: left !== null && Number.isFinite(cost.maximum) ? `${cost.name} ${left}/${cost.maximum}` : `${cost.name} −${cost.amount}`,
  };
}

// Why the feature cannot grant that action now, or "": not a feature of the sheet, not this action, not active (the Eagle
// without Rage), its pool spent. The turn's own checks (its turn, a Help's target) stay with the action.
export function pcTurnActionViaBlocker({ featureId = "", kind = "", sourceItem = null, turnState = null } = {}) {
  const spec = PC_TURN_ACTION_VIAS[text(featureId)];
  const feature = getClassFeatureDefinition(featureId);
  if (!spec || !feature) return "Capacità non valida per questa azione.";
  if (!spec.kinds.includes(kind)) return `${feature.name} non dà questa azione.`;
  const meta = metaOf(sourceItem);
  const card = meta.initiativeCard || {};
  if (!getEnabledClassFeatures(card).some((entry) => entry.id === feature.id)) return `${feature.name} non è nella scheda.`;
  if (spec.whileActive && !activeClassFeatureInstances(meta.classFeatureState, turnState?.round ?? null)
    .some((instance) => instance.featureId === feature.id)) return `${feature.name}: solo mentre è attivo (in Ira).`;
  const cost = viaCost(feature, card, meta.classFeatureState);
  if (cost && !cost.ready) return `${feature.name}: nessun uso rimasto (${cost.name}).`;
  if (cost && !cost.pool) return `${feature.name}: risorsa non trovata.`;
  return "";
}

// The feature's part of the command: { featureId, name, spent, operations, tempHp, warning }. Its pool spent once
// (class-feature:adjust-resource, as a reaction feature spends it); Adrenaline Rush's temporary hit points on the
// creature, with the same plan and the same hp:set as its trait (none when it already has more: they do not add up).
export function planPcTurnActionVia({ featureId = "", kind = "", sourceItem = null, turnState = null, eventId = "" } = {}) {
  const blocker = pcTurnActionViaBlocker({ featureId, kind, sourceItem, turnState });
  if (blocker) throw new Error(blocker);
  const feature = getClassFeatureDefinition(featureId);
  const meta = metaOf(sourceItem);
  const card = meta.initiativeCard || {};
  const { operations, spent } = featureCostPlan(feature, sourceItem, eventId);
  let tempHp = null;
  let warning = "";
  if (feature.hpTrait) {
    const plan = planSpeciesHpTrait({ feature, card, targetMeta: meta, targetName: sourceItem.name || "" });
    if (!plan.ok) throw new Error(plan.blocker);
    warning = plan.warning || "";
    if (plan.change?.changed) {
      operations.push({ type: "hp:set", updates: [{ itemId: sourceItem.id, hp: plan.change.afterHP, hpMax: plan.change.hpMax,
        tempHp: plan.change.afterTempHp, hpIntent: { mode: plan.mode, amount: plan.amount, eventId },
        expectedHP: bossMetadataSnapshot(meta, "hp"), expectedHPMax: bossMetadataSnapshot(meta, "hpMax") }] });
      tempHp = { amount: plan.amount, after: plan.change.afterTempHp };
    }
  }
  return { featureId: feature.id, name: feature.name, spent, operations, tempHp, warning };
}

// Lot T4b (decision A2): the features that let a creature move without provoking opportunity attacks. Their card puts
// «Movimento: no AdO», Zephyr Strike's pill, on whoever moves, until the end of the turn under way: these movements are
// no Disengage, so Sentinel does not override them (opportunityAttackCore.js). The feature's cost and, for a reaction
// of its own, the reaction are in the same command. subject: "self", or "selection" (Mantle of Inspiration: the creatures
// selected on the map, up to the Charisma modifier); ownTurn: an action or a bonus action, on the creature's own turn;
// reaction: the move spends the creature's reaction (Skirmisher, Swiftstride); whileActive: only while the feature is
// (Swiftstride, while shifted). The healing of Balm of Peace and the temporary hit points of the Mantle stay apart.
const freezeMove = (fields) => Object.freeze({ subject: "self", ...fields });
const SWIFTSTRIDE_NOTE = "In mutazione, quando una creatura finisce il turno entro 1,5 m da lui: fino a 3 m.";
export const PC_NO_OPPORTUNITY_FEATURES = Object.freeze({
  "chierico-dominio-della-pace-incanalare-divinita-balsamo-della-pace": freezeMove({ ownTurn: true,
    note: "Si muove fino alla sua velocità; chi gli passa entro 1,5 m può recuperare 2d6 + Saggezza PF, da registrare a parte." }),
  "stregone-stregoneria-della-tempesta-magia-tempestosa": freezeMove({ ownTurn: true,
    note: "Dopo un incantesimo di 1° livello o superiore: vola fino a 3 m." }),
  "specie-harengon-salto-del-coniglio": freezeMove({ ownTurn: true,
    note: "Salta fino a 1,5 m per punto del bonus di competenza, se la sua velocità è superiore a 0." }),
  "paladino-giuramento-di-vendetta-vendicatore-implacabile": freezeMove({
    note: "Dopo un attacco di opportunità a segno: fino a metà velocità, con la stessa reazione dell'attacco." }),
  "ladro-esploratore-schermagliatore": freezeMove({ reaction: true,
    note: "Quando un nemico finisce il turno entro 1,5 m da lui: fino a metà velocità." }),
  "specie-shifter-mutazione-passo-rapido": freezeMove({ reaction: true, whileActive: true, note: SWIFTSTRIDE_NOTE }),
  "specie-shifter-multiverso-mutazione-passo-rapido": freezeMove({ reaction: true, whileActive: true, note: SWIFTSTRIDE_NOTE }),
  "bardo-collegio-dell-incanto-manto-di-ispirazione": freezeMove({ subject: "selection", ownTurn: true,
    note: "Le creature scelte, fino al modificatore di Carisma, si muovono con la loro reazione fino alla velocità; i PF temporanei si danno a parte." }),
});

export function pcNoOpportunitySpec(featureId) {
  return PC_NO_OPPORTUNITY_FEATURES[text(featureId)] || null;
}

// Mantle of Inspiration: up to the bard's Charisma modifier, at least one.
export function pcNoOpportunityMaxTargets(featureId, card = {}) {
  const spec = pcNoOpportunitySpec(featureId);
  if (spec?.subject !== "selection") return 1;
  return Math.max(1, Math.floor(Number(card?.abilityModifiers?.cha) || 0));
}

function inCombatBlocker(sourceItem, turnState) {
  if (!sourceItem?.id) return "Nessuna creatura per questa capacità.";
  const order = Array.isArray(turnState?.order) ? turnState.order.filter(Boolean) : [];
  return order.length ? "" : "Solo in combattimento, con un ordine di iniziativa.";
}

// Why the feature cannot let anyone move now, or "": in combat; its own turn for an action or a bonus action; on the
// sheet; active when it must be (Swiftstride); its pool; the reaction it spends not used yet; the creatures chosen.
export function pcNoOpportunityBlocker({ featureId = "", sourceItem = null, turnState = null, targetItems = [] } = {}) {
  const spec = pcNoOpportunitySpec(featureId);
  const feature = getClassFeatureDefinition(featureId);
  if (!spec || !feature) return "Capacità non valida per questo movimento.";
  const combat = inCombatBlocker(sourceItem, turnState);
  if (combat) return combat;
  if (spec.ownTurn && initiativeTurnCreatureId(turnState) !== sourceItem.id) return "Solo nel turno della creatura.";
  const meta = metaOf(sourceItem);
  const card = meta.initiativeCard || {};
  if (!getEnabledClassFeatures(card).some((entry) => entry.id === feature.id)) return `${feature.name} non è nella scheda.`;
  if (spec.whileActive && !activeClassFeatureInstances(meta.classFeatureState, turnState?.round ?? null)
    .some((instance) => instance.featureId === feature.id)) return `${feature.name}: solo mentre è attiva.`;
  const cost = viaCost(feature, card, meta.classFeatureState);
  if (cost && !cost.ready) return `${feature.name}: nessun uso rimasto (${cost.name}).`;
  if (cost && !cost.pool) return `${feature.name}: risorsa non trovata.`;
  if (spec.reaction) {
    const reaction = planReactionSpend({ casterId: sourceItem.id, casterName: sourceItem.name, conditions: meta.conditions, initiativeState: turnState });
    if (reaction.alreadyUsed) return reaction.message;
  }
  if (spec.subject === "selection") {
    const list = Array.isArray(targetItems) ? targetItems.filter((item) => item?.id) : [];
    if (!list.length) return "Seleziona sulla mappa le creature che si muovono.";
    const max = pcNoOpportunityMaxTargets(featureId, card);
    if (list.length > max) return `${feature.name}: al massimo ${max} ${max === 1 ? "creatura" : "creature"} (modificatore di Carisma).`;
  }
  return "";
}

// The command: «Movimento: no AdO» on each creature that moves until the end of the turn under way (its creature's id
// in the expiry: a reaction comes in someone else's turn), the feature's pool, the reaction it spends. Its causality is
// a turn action of kind "no-opportunity", read by the console and the Combat Log as the others (with lot T4a's via).
// "pc-attack": PC_ATTACK_HISTORY_KIND (pcAttackCore.js), written out to keep this module light.
export function buildPcNoOpportunityMutation({ featureId = "", sourceItem = null, turnState = null, targetItems = [], attackInstanceId = "" } = {}) {
  if (!attackInstanceId || typeof attackInstanceId !== "string") throw new Error("Identità dell'azione mancante.");
  const blocker = pcNoOpportunityBlocker({ featureId, sourceItem, turnState, targetItems });
  if (blocker) throw new Error(blocker);
  const spec = pcNoOpportunitySpec(featureId);
  const feature = getClassFeatureDefinition(featureId);
  const meta = metaOf(sourceItem);
  const sourceName = sourceItem.name || sourceItem.id;
  const movers = spec.subject === "selection" ? targetItems.filter((item) => item?.id) : [sourceItem];
  const moverIds = [...new Set(movers.map((item) => item.id))];
  const appliedAt = bossConditionAppliedAt(turnState);
  const turnCreatureId = initiativeTurnCreatureId(turnState) || sourceItem.id;
  const { operations: costOperations, spent } = featureCostPlan(feature, sourceItem, attackInstanceId);
  const reaction = spec.reaction
    ? planReactionSpend({ casterId: sourceItem.id, casterName: sourceItem.name, conditions: meta.conditions, initiativeState: turnState })
    : { operations: [] };
  const instanceIds = Object.fromEntries(moverIds.map((id) => [id, bossGroupConditionInstanceId(attackInstanceId, NO_OPPORTUNITY_PILL, id)]));
  const names = movers.map((item) => item.name || item.id);
  const label = spec.subject === "selection" ? `${sourceName}: ${feature.name} → ${names.join(", ")}` : `${sourceName}: ${feature.name}`;
  const causality = {
    actor: { id: sourceItem.id, tokenId: sourceItem.id, name: sourceName, role: "attacker" },
    cause: { kind: "pc-attack", actionName: feature.name, attackInstanceId, turnAction: "no-opportunity" },
    action: { id: "turn-action:no-opportunity", label: feature.name },
    turnAction: { kind: "no-opportunity", condition: NO_OPPORTUNITY_PILL, movers: names, ...(spec.reaction ? { reaction: true } : {}),
      via: { featureId: feature.id, name: feature.name, ...(spent ? { spent } : {}) } },
    ...(appliedAt?.turnKey ? { turn: appliedAt } : {}),
    targets: movers.map((item) => ({ id: item.id, name: item.name || item.id,
      conditions: [{ condition: NO_OPPORTUNITY_PILL, instanceId: instanceIds[item.id] }] })),
  };
  return {
    condition: NO_OPPORTUNITY_PILL, causality, manualText: "", labelTargetIds: moverIds,
    operations: [{
      type: "condition:add", targetIds: moverIds, conditionName: NO_OPPORTUNITY_PILL, instanceIds,
      options: { sourceId: sourceItem.id, sourceName, parentEffectId: "", type: "automatic", manualRemoval: true,
        expiry: { mode: "turn-end", actor: "source", actorId: turnCreatureId, remaining: 1 }, ...(appliedAt ? { appliedAt } : {}) },
    }, { type: "condition:automate", subjectIds: moverIds }, ...costOperations, ...reaction.operations],
    options: {
      commandId: attackInstanceId, correlationId: attackInstanceId, sourceId: sourceItem.id, targetIds: moverIds,
      kind: "pc-attack", label, history: { kind: "pc-attack", label, payload: { causality, damageComponents: [] } },
    },
  };
}
