import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { getInitiativeCard } from "./initiativeCards.js";
import { findQuickAction } from "./quickActionsCore.js";
import { isBossActionCreature } from "./bossActionExecutionCore.js";
import { bossActionTargets } from "./bossActionsViewCore.js";
import { postBossDamage } from "./bossActionExecution.js";
import { buildPcAttackMutation, pcAttackAction } from "./pcAttackCore.js";
import { getEffectsMutationSceneContext, runEffectsMutation, requireAppliedEffectsMutation } from "./effectsMutations.js";
import { currentSceneEpoch, isCurrentSceneEpoch } from "./sceneEpoch.js";

const newId = () => `pc-attack:${globalThis.crypto?.randomUUID?.() || Date.now().toString(36)+":"+Math.random().toString(36).slice(2)}`;
// The map labels of a creature whose pills changed without damage (an activation's pill on the attacker).
const refreshPillLabels = async ids => {const {refreshConditionLabels}=await import("./conditions.js");await refreshConditionLabels(ids);};

// Same command path as a boss attack: the coordinator commits canonical HP and History, then the
// existing projections (map HP bar, HP text, hpMemory, concentration and save reminders) run once.
export function createPcAttackRuntime({
  api=OBR,getCard=getInitiativeCard,
  getSceneContext=getEffectsMutationSceneContext,runMutation=runEffectsMutation,
  requireApplied=requireAppliedEffectsMutation,postDamage=postBossDamage,refreshLabels=refreshPillLabels,
  getEpoch=currentSceneEpoch,isCurrentEpoch=isCurrentSceneEpoch,
}={}) {
  const busy=new Set();
  // Retain the prepared command for lost-ACK retries; History remains in the coordinator.
  const drafts=new Map();
  async function session(sourceId) {
    if(await api.player.getRole()!=="GM") throw new Error("Solo il GM può registrare un attacco.");
    const epoch=getEpoch();
    const scene=await getSceneContext();
    const [item]=await api.scene.items.getItems([sourceId]);
    if(!isBossActionCreature(item)) throw new Error("L'attaccante non è più un token creatura nella scena.");
    const metadata=await api.scene.getMetadata();
    if(!isCurrentEpoch(epoch)) throw new Error("Scena cambiata: riapri l'attacco.");
    return {item,epoch,scene,turnState:metadata?.[ID+"/state"] || null,isCurrent:()=>isCurrentEpoch(epoch)};
  }
  function attackOf(item,actionId) {
    const action=pcAttackAction(findQuickAction(getCard(item),actionId));
    if(!action) throw new Error("Azione di attacco non trovata nel profilo: riapri l'attacco.");
    return action;
  }
  async function getPcAttackPresentation(sourceId,actionId) {
    const scope=await session(sourceId);
    const action=attackOf(scope.item,actionId);
    const items=await api.scene.items.getItems();
    if(!scope.isCurrent()) throw new Error("Scena cambiata: riapri l'attacco.");
    return {item:scope.item,action,targets:bossActionTargets(items,scope.item.id),turnState:scope.turnState,sceneIdentity:scope.scene.sceneIdentity};
  }
  async function executePcAttack(request={}) {
    const {sourceId,actionId,targetId}=request;
    if(busy.has(sourceId)) throw new Error("Registrazione già in corso.");
    busy.add(sourceId);
    try {
      const scope=await session(sourceId);
      const action=attackOf(scope.item,actionId);
      // The definition the GM saw must be the one committed (the card assert guards the rest).
      if(request.expectedAction!==undefined && JSON.stringify(request.expectedAction)!==JSON.stringify(action))
        throw new Error("L'azione è cambiata nel profilo: riapri l'attacco.");
      const [targetItem]=targetId?await api.scene.items.getItems([targetId]):[];
      if(!targetItem) throw new Error("Il bersaglio non è più presente nella scena.");
      // Green-Flame Blade: the second creature, read like the target.
      const secondaryId=request.weaponCantrip?.secondary?.targetId || "";
      const [secondaryItem]=secondaryId?await api.scene.items.getItems([secondaryId]):[];
      if(secondaryId && !secondaryItem) throw new Error("La seconda creatura non è più presente nella scena.");
      if(!scope.isCurrent()) throw new Error("Scena cambiata: riapri l'attacco.");
      const attackInstanceId=request.attackInstanceId || newId();
      const decisionKey=JSON.stringify({sourceId,actionId,targetId,outcome:request.outcome || "",
        componentAmounts:Object.entries(request.componentAmounts || {}).sort(([a],[b])=>a.localeCompare(b)),
        ignoredDefenses:request.ignoredDefenses ?? null,expectedDefenses:request.expectedDefenses ?? null,
        riders:request.riders ?? null,extras:request.extras ?? null,spellId:request.spellId || "",
        weaponCantrip:request.weaponCantrip ?? null,expectedSecondaryDefenses:request.expectedSecondaryDefenses ?? null,sharedHp:request.sharedHp || null,
        activations:request.activations ?? null});
      let draft=drafts.get(attackInstanceId);
      if(draft && (draft.decisionKey!==decisionKey || draft.options.sceneIdentity!==scope.scene.sceneIdentity))
        throw new Error("Le decisioni o la scena dell'attacco sono cambiate: riapri l'attacco.");
      if(draft?.result) return {...structuredClone(draft.result),duplicate:true};
      if(!draft) {
        const plan=buildPcAttackMutation({action,sourceItem:scope.item,targetItem,outcome:request.outcome,
          componentAmounts:request.componentAmounts || {},attackInstanceId,ignoredDefenses:request.ignoredDefenses || [],
          expectedDefenses:request.expectedDefenses,turnState:scope.turnState,riders:request.riders || [],extras:request.extras || [],
          spellId:request.spellId || "",weaponCantrip:request.weaponCantrip || null,secondaryItem:secondaryItem || null,
          expectedSecondaryDefenses:request.expectedSecondaryDefenses,activations:request.activations || []});
        draft={decisionKey,plan,options:{...plan.options,
          sharedHp:request.sharedHp || {},sceneIdentity:request.sceneIdentity || scope.scene.sceneIdentity,sceneEpoch:scope.epoch}};
        drafts.set(attackInstanceId,draft);
      }
      const plan=draft.plan;
      const result=await runMutation(structuredClone(plan.operations),structuredClone(draft.options));
      try {requireApplied(result);}
      catch(error) {
        if(["conflict","rejected"].includes(result?.status) && result.committed!==true)
          error.message="Lo stato è cambiato prima del commit (bersaglio, profilo o turno). Riapri l'attacco e verifica.";
        throw error;
      }
      const warnings=[];
      // Post-commit projections run once; they never mutate canonical HP.
      const damaged=[...(plan.change?.changed?[{item:targetItem,change:plan.change}]:[]),
        ...(plan.secondaryChange?.changed?[{item:plan.secondaryItem,change:plan.secondaryChange}]:[])];
      if(result.duplicate!==true && scope.isCurrent()) for(const row of damaged) {
        try {warnings.push(...(await postDamage({item:row.item,change:row.change,result,sceneEpoch:scope.epoch,
          sceneIdentity:scope.scene.sceneIdentity,isCurrent:scope.isCurrent}) || []));}
        catch(error) {warnings.push(String(error?.message || error));}
      }
      // Pills on a creature the damage projection did not refresh (the attacker, or a target left at the same HP).
      const labelIds=(plan.labelTargetIds || []).filter(id=>!damaged.some(row=>row.item.id===id));
      if(result.duplicate!==true && labelIds.length && scope.isCurrent()) {
        try {await refreshLabels(labelIds);}
        catch(error) {warnings.push(String(error?.message || error));}
      }
      draft.result={...result,attackInstanceId,outcome:request.outcome,damageComponents:plan.damageComponents,warnings,
        riders:structuredClone(plan.causality.riders || []),extras:structuredClone(plan.causality.extras || []),
        activations:structuredClone(plan.causality.activations || []),
        followUps:[...(plan.followUps || [])],cantrip:plan.causality.cantrip ? structuredClone(plan.causality.cantrip) : null,
        manualRemainder:plan.options?.history?.payload?.manualRemainder || "",conditions:(plan.causality.conditionsApplied || []).map(entry=>entry.condition),
        target:{id:targetItem.id,name:targetItem.name || targetItem.id},
        ...(plan.causality.weaponCantrip?{weaponCantrip:structuredClone(plan.causality.weaponCantrip)}:{}),
        ...(plan.secondaryChange?{secondary:{id:plan.secondaryItem.id,name:plan.secondaryItem.name || plan.secondaryItem.id,
          before:plan.secondaryChange.hp,after:plan.secondaryChange.afterHP}}:{}),
        hpChange:plan.change?{before:plan.change.hp,after:plan.change.afterHP,hpMax:plan.change.hpMax}:null,
        historyEntryId:result.historyEntry?.id || null,
        undoAvailable:!result.historyPending && !result.historySkipped && !!result.historyEntry?.id};
      return structuredClone(draft.result);
    } finally {busy.delete(sourceId);}
  }
  return {getPcAttackPresentation,executePcAttack};
}
const runtime=createPcAttackRuntime();
export const getPcAttackPresentation=(...args)=>runtime.getPcAttackPresentation(...args);
export const executePcAttack=(...args)=>runtime.executePcAttack(...args);
