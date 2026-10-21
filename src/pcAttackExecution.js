import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { getInitiativeCard } from "./initiativeCards.js";
import { findQuickAction } from "./quickActionsCore.js";
import { isBossActionCreature } from "./bossActionExecutionCore.js";
import { bossActionTargets } from "./bossActionsViewCore.js";
import { postBossDamage } from "./bossActionExecution.js";
import { buildPcAttackAreaMutation, buildPcAttackMutation, buildPcAttackQuiveringPalmMutation, pcAttackAction, pcAttackNearbyIds } from "./pcAttackCore.js";
import { bossFeetPerCell } from "./bossActionsViewCore.js";
import { getEffectsMutationSceneContext, runEffectsMutation, requireAppliedEffectsMutation } from "./effectsMutations.js";
import { currentSceneEpoch, isCurrentSceneEpoch } from "./sceneEpoch.js";
import { withBossLinkDefenses } from "./bossLinkResistanceCore.js";

const newId = () => `pc-attack:${globalThis.crypto?.randomUUID?.() || Date.now().toString(36)+":"+Math.random().toString(36).slice(2)}`;
// The map labels of a creature whose pills changed without damage (an activation's pill on the attacker).
const refreshPillLabels = async ids => {const {refreshConditionLabels}=await import("./conditions.js");await refreshConditionLabels(ids);};
// Temporary hit points (Inspiring Smite): the HP bar, HP text, hpMemory and labels, like a damage projection but
// without its concentration warnings and save reminders (nothing was damaged).
async function projectTempHp({rows,sceneEpoch,isCurrent}) {
  const [{syncHPBarNow,syncHPTextBatchNow},{syncHPBatchToMemory},{refreshConditionLabels}]=await Promise.all([
    import("./hpbar-items.js"),import("./hpMemory.js"),import("./conditions.js")]);
  if(!isCurrent()) return;
  const updates=rows.map(row=>({tokenId:row.item.id,hp:row.change.afterHP,hpMax:row.change.hpMax}));
  for(const update of updates) syncHPBarNow(update.tokenId,update.hp,update.hpMax);
  await syncHPTextBatchNow(updates);
  if(!isCurrent()) return;
  await syncHPBatchToMemory(updates.map(update=>({itemId:update.tokenId,hp:update.hp,hpMax:update.hpMax})),{sceneEpoch,items:rows.map(row=>row.item),isCurrent});
  if(isCurrent()) await refreshConditionLabels(updates.map(update=>update.tokenId));
}

// Same command path as a boss attack: the coordinator commits canonical HP and History, then the
// existing projections (map HP bar, HP text, hpMemory, concentration and save reminders) run once.
export function createPcAttackRuntime({
  api=OBR,getCard=getInitiativeCard,
  getSceneContext=getEffectsMutationSceneContext,runMutation=runEffectsMutation,
  requireApplied=requireAppliedEffectsMutation,postDamage=postBossDamage,refreshLabels=refreshPillLabels,postTempHp=projectTempHp,
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
  // Rimebound Link: a token linked to its boss resists in memory while the link is active (never written back).
  async function withLinkDefenses(item,round) {
    const sourceId=item?.metadata?.[`${ID}/meta`]?.sharedHpSourceId;
    if(!item || !sourceId) return item;
    const [source]=await api.scene.items.getItems([sourceId]);
    return withBossLinkDefenses(item,source,Number(round));
  }
  async function getPcAttackPresentation(sourceId,actionId) {
    const scope=await session(sourceId);
    const action=attackOf(scope.item,actionId);
    const items=await api.scene.items.getItems();
    if(!scope.isCurrent()) throw new Error("Scena cambiata: riapri l'attacco.");
    const round=Number(scope.turnState?.round);
    const targets=bossActionTargets(items,scope.item.id).map(item=>withBossLinkDefenses(item,items.find(entry=>entry.id===item.metadata?.[`${ID}/meta`]?.sharedHpSourceId),round));
    return {item:scope.item,action,targets,turnState:scope.turnState,sceneIdentity:scope.scene.sceneIdentity};
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
      const [rawTargetItem]=targetId?await api.scene.items.getItems([targetId]):[];
      const targetItem=await withLinkDefenses(rawTargetItem,scope.turnState?.round);
      if(!targetItem) throw new Error("Il bersaglio non è più presente nella scena.");
      // The second creature (Green-Flame Blade, or an activation's die such as Sweeping Attack), read like the target.
      const secondaryId=request.weaponCantrip?.secondary?.targetId
        || (Array.isArray(request.activations)?request.activations:[]).find(activation=>activation?.secondaryTargetId)?.secondaryTargetId || "";
      const [rawSecondaryItem]=secondaryId?await api.scene.items.getItems([secondaryId]):[];
      const secondaryItem=await withLinkDefenses(rawSecondaryItem,scope.turnState?.round);
      // The coordinator's Rimebound Link notice says the damage was already halved for these tokens.
      const bossLinkResisted=[[targetItem,rawTargetItem],[secondaryItem,rawSecondaryItem]].filter(([item,raw])=>item && item!==raw).map(([item])=>item.id);
      if(secondaryId && !secondaryItem) throw new Error("La seconda creatura non è più presente nella scena.");
      // Inspiring Smite: the creatures that receive temporary hit points, read like the target.
      const tempHpIds=[...new Set((Array.isArray(request.activations)?request.activations:[])
        .flatMap(activation=>Array.isArray(activation?.tempHp)?activation.tempHp.map(entry=>entry?.targetId):[]).filter(Boolean))];
      const tempHpItems=tempHpIds.length?await api.scene.items.getItems(tempHpIds):[];
      // Bursting Arrow: the creatures around the target, read like the target.
      const burstIds=[...new Set((Array.isArray(request.activations)?request.activations:[])
        .flatMap(activation=>Array.isArray(activation?.burstTargetIds)?activation.burstTargetIds:[]).filter(Boolean))];
      const burstItems=burstIds.length?await api.scene.items.getItems(burstIds):[];
      if(!scope.isCurrent()) throw new Error("Scena cambiata: riapri l'attacco.");
      const attackInstanceId=request.attackInstanceId || newId();
      const decisionKey=JSON.stringify({sourceId,actionId,targetId,outcome:request.outcome || "",
        componentAmounts:Object.entries(request.componentAmounts || {}).sort(([a],[b])=>a.localeCompare(b)),
        ignoredDefenses:request.ignoredDefenses ?? null,expectedDefenses:request.expectedDefenses ?? null,
        riders:request.riders ?? null,extras:request.extras ?? null,spellId:request.spellId || "",
        weaponCantrip:request.weaponCantrip ?? null,expectedSecondaryDefenses:request.expectedSecondaryDefenses ?? null,sharedHp:request.sharedHp || null,
        activations:request.activations ?? null,attackMode:request.attackMode || "",modeAmount:request.modeAmount ?? null,
        expectedBurstDefenses:request.expectedBurstDefenses ?? null});
      let draft=drafts.get(attackInstanceId);
      if(draft && (draft.decisionKey!==decisionKey || draft.options.sceneIdentity!==scope.scene.sceneIdentity))
        throw new Error("Le decisioni o la scena dell'attacco sono cambiate: riapri l'attacco.");
      if(draft?.result) return {...structuredClone(draft.result),duplicate:true};
      if(!draft) {
        const plan=buildPcAttackMutation({action,sourceItem:scope.item,targetItem,outcome:request.outcome,
          componentAmounts:request.componentAmounts || {},attackInstanceId,ignoredDefenses:request.ignoredDefenses || [],
          expectedDefenses:request.expectedDefenses,turnState:scope.turnState,riders:request.riders || [],extras:request.extras || [],
          spellId:request.spellId || "",weaponCantrip:request.weaponCantrip || null,secondaryItem:secondaryItem || null,
          expectedSecondaryDefenses:request.expectedSecondaryDefenses,activations:request.activations || [],tempHpItems,
          attackMode:request.attackMode || "",modeAmount:request.modeAmount ?? null,burstItems,expectedBurstDefenses:request.expectedBurstDefenses || {}});
        draft={decisionKey,plan,options:{...plan.options,...(bossLinkResisted.length?{bossLinkResisted}:{}),
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
        ...(plan.secondaryChange?.changed?[{item:plan.secondaryItem,change:plan.secondaryChange}]:[]),
        ...(plan.burstChanges || []).map(row=>({item:row.item,change:row.change}))];
      if(result.duplicate!==true && scope.isCurrent()) for(const row of damaged) {
        try {warnings.push(...(await postDamage({item:row.item,change:row.change,result,sceneEpoch:scope.epoch,
          sceneIdentity:scope.scene.sceneIdentity,isCurrent:scope.isCurrent}) || []));}
        catch(error) {warnings.push(String(error?.message || error));}
      }
      if(result.duplicate!==true && plan.tempHpChanges?.length && scope.isCurrent()) {
        try {await postTempHp({rows:plan.tempHpChanges,sceneEpoch:scope.epoch,isCurrent:scope.isCurrent});}
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
        tempHp:(plan.tempHpChanges || []).map(row=>({id:row.item.id,name:row.item.name || row.item.id,before:row.change.hp,after:row.change.afterHP})),
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
  // 3C: the tracked creatures near a token (the caster for an area cantrip, the target for Bursting Arrow), by the
  // edge-to-edge grid distance of the area tool. A proposal: the GM ticks or unticks them.
  async function getPcAttackNearby({sourceId,centerId,radiusFeet}={}) {
    const scope=await session(sourceId);
    const items=await api.scene.items.getItems();
    const tracked=[scope.item,...bossActionTargets(items,scope.item.id)];
    if(!tracked.some(item=>item.id===centerId)) return [];
    const [dpi,scale]=await Promise.all([api.scene.grid.getDpi(),api.scene.grid.getScale()]);
    const rows=[];
    for(const item of tracked) {
      try {rows.push({id:item.id,bounds:await api.scene.items.getItemBounds([item.id])});} catch {}
    }
    if(!scope.isCurrent()) throw new Error("Scena cambiata: riapri l'attacco.");
    return pcAttackNearbyIds({centerId,rows,dpi,feetPerCell:bossFeetPerCell(scale),radiusFeet});
  }
  // 3C: an attack against every creature of an area (area cantrips, Piercing Arrow): one command for all of them.
  async function executePcAttackArea(request={}) {
    const {sourceId,actionId}=request;
    if(busy.has(sourceId)) throw new Error("Registrazione già in corso.");
    busy.add(sourceId);
    try {
      const scope=await session(sourceId);
      const action=attackOf(scope.item,actionId);
      if(request.expectedAction!==undefined && JSON.stringify(request.expectedAction)!==JSON.stringify(action))
        throw new Error("L'azione è cambiata nel profilo: riapri l'attacco.");
      const wanted=Array.isArray(request.members)?request.members:[];
      const ids=wanted.map(member=>member?.targetId).filter(Boolean);
      const items=ids.length?await api.scene.items.getItems(ids):[];
      const members=wanted.map(member=>{
        const item=items.find(candidate=>candidate.id===member?.targetId);
        if(!item) throw new Error("Una creatura dell'area non è più presente nella scena.");
        return {item,outcome:member.outcome};
      });
      if(!scope.isCurrent()) throw new Error("Scena cambiata: riapri l'attacco.");
      const attackInstanceId=request.attackInstanceId || newId();
      const decisionKey=JSON.stringify({kind:"area",sourceId,actionId,spellId:request.spellId || "",attackMode:request.attackMode || "",
        members:wanted,componentAmounts:Object.entries(request.componentAmounts || {}).sort(([a],[b])=>a.localeCompare(b)),
        riders:request.riders ?? null,extras:request.extras ?? null,modeAmount:request.modeAmount ?? null,expectedDefenses:request.expectedDefenses ?? null});
      let draft=drafts.get(attackInstanceId);
      if(draft && (draft.decisionKey!==decisionKey || draft.options.sceneIdentity!==scope.scene.sceneIdentity))
        throw new Error("Le decisioni o la scena dell'attacco sono cambiate: riapri l'attacco.");
      if(draft?.result) return {...structuredClone(draft.result),duplicate:true};
      if(!draft) {
        const plan=buildPcAttackAreaMutation({action,spellId:request.spellId || "",attackMode:request.attackMode || "",sourceItem:scope.item,members,
          componentAmounts:request.componentAmounts || {},riders:request.riders || [],extras:request.extras || [],modeAmount:request.modeAmount ?? null,
          attackInstanceId,expectedDefenses:request.expectedDefenses || {},turnState:scope.turnState});
        draft={decisionKey,plan,options:{...plan.options,sceneIdentity:request.sceneIdentity || scope.scene.sceneIdentity,sceneEpoch:scope.epoch}};
        drafts.set(attackInstanceId,draft);
      }
      const plan=draft.plan;
      const result=await runMutation(structuredClone(plan.operations),structuredClone(draft.options));
      try {requireApplied(result);}
      catch(error) {
        if(["conflict","rejected"].includes(result?.status) && result.committed!==true)
          error.message="Lo stato è cambiato prima del commit (creature, profilo o turno). Riapri l'attacco e verifica.";
        throw error;
      }
      const warnings=[];
      if(result.duplicate!==true && scope.isCurrent()) for(const row of plan.changes) {
        try {warnings.push(...(await postDamage({item:row.item,change:row.change,result,sceneEpoch:scope.epoch,
          sceneIdentity:scope.scene.sceneIdentity,isCurrent:scope.isCurrent}) || []));}
        catch(error) {warnings.push(String(error?.message || error));}
      }
      draft.result={...result,attackInstanceId,area:true,warnings,
        rows:plan.rows.map(row=>({id:row.item.id,name:row.item.name || row.item.id,outcome:row.outcome,
          damage:row.damageComponents.reduce((sum,component)=>sum+component.amount,0),before:row.change.hp,after:row.change.afterHP})),
        historyEntryId:result.historyEntry?.id || null,
        undoAvailable:!result.historyPending && !result.historySkipped && !!result.historyEntry?.id};
      return structuredClone(draft.result);
    } finally {busy.delete(sourceId);}
  }
  // Quivering Palm, ending the vibrations: an action of its own (not an attack), the same command path.
  async function endQuiveringPalm(request={}) {
    const {sourceId,targetId}=request;
    if(busy.has(sourceId)) throw new Error("Registrazione già in corso.");
    busy.add(sourceId);
    try {
      const scope=await session(sourceId);
      const [rawTargetItem]=targetId?await api.scene.items.getItems([targetId]):[];
      const targetItem=await withLinkDefenses(rawTargetItem,scope.turnState?.round);
      if(!targetItem) throw new Error("Il bersaglio non è più presente nella scena.");
      if(!scope.isCurrent()) throw new Error("Scena cambiata: riapri l'attacco.");
      const attackInstanceId=request.attackInstanceId || newId();
      const decisionKey=JSON.stringify({kind:"quivering-palm",sourceId,targetId,outcome:request.outcome || "",amount:request.amount ?? null,
        ignoredDefenses:request.ignoredDefenses ?? null,expectedDefenses:request.expectedDefenses ?? null});
      let draft=drafts.get(attackInstanceId);
      if(draft && (draft.decisionKey!==decisionKey || draft.options.sceneIdentity!==scope.scene.sceneIdentity))
        throw new Error("Le decisioni o la scena sono cambiate: riapri l'attacco.");
      if(draft?.result) return {...structuredClone(draft.result),duplicate:true};
      if(!draft) {
        const plan=buildPcAttackQuiveringPalmMutation({sourceItem:scope.item,targetItem,outcome:request.outcome,amount:request.amount,attackInstanceId,
          ignoredDefenses:request.ignoredDefenses || [],expectedDefenses:request.expectedDefenses,turnState:scope.turnState});
        draft={decisionKey,plan,options:{...plan.options,...(targetItem!==rawTargetItem?{bossLinkResisted:[targetItem.id]}:{}),
          sceneIdentity:request.sceneIdentity || scope.scene.sceneIdentity,sceneEpoch:scope.epoch}};
        drafts.set(attackInstanceId,draft);
      }
      const plan=draft.plan;
      const result=await runMutation(structuredClone(plan.operations),structuredClone(draft.options));
      try {requireApplied(result);}
      catch(error) {
        if(["conflict","rejected"].includes(result?.status) && result.committed!==true)
          error.message="Lo stato è cambiato prima del commit (bersaglio o profilo). Riapri l'attacco e verifica.";
        throw error;
      }
      const warnings=[];
      if(result.duplicate!==true && scope.isCurrent()) {
        if(plan.change?.changed) {
          try {warnings.push(...(await postDamage({item:targetItem,change:plan.change,result,sceneEpoch:scope.epoch,
            sceneIdentity:scope.scene.sceneIdentity,isCurrent:scope.isCurrent}) || []));}
          catch(error) {warnings.push(String(error?.message || error));}
        } else {
          try {await refreshLabels([targetItem.id]);}
          catch(error) {warnings.push(String(error?.message || error));}
        }
      }
      draft.result={...result,attackInstanceId,outcome:request.outcome,quiveringPalm:true,damageComponents:plan.damageComponents,warnings,
        target:{id:targetItem.id,name:targetItem.name || targetItem.id},
        hpChange:plan.change?{before:plan.change.hp,after:plan.change.afterHP,hpMax:plan.change.hpMax}:null,
        historyEntryId:result.historyEntry?.id || null,
        undoAvailable:!result.historyPending && !result.historySkipped && !!result.historyEntry?.id};
      return structuredClone(draft.result);
    } finally {busy.delete(sourceId);}
  }
  return {getPcAttackPresentation,executePcAttack,endQuiveringPalm,executePcAttackArea,getPcAttackNearby};
}
const runtime=createPcAttackRuntime();
export const getPcAttackPresentation=(...args)=>runtime.getPcAttackPresentation(...args);
export const executePcAttack=(...args)=>runtime.executePcAttack(...args);
export const endQuiveringPalm=(...args)=>runtime.endQuiveringPalm(...args);
export const executePcAttackArea=(...args)=>runtime.executePcAttackArea(...args);
export const getPcAttackNearby=(...args)=>runtime.getPcAttackNearby(...args);
