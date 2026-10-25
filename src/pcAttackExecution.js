import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { pcAttackBreathAction } from "./pcAttackCore.js";
import { PC_ATTACK_BREATH_PREFIX } from "./pcAttackBreathId.js";
import { getInitiativeCard } from "./initiativeCards.js";
import { findQuickAction } from "./quickActionsCore.js";
import { isBossActionCreature } from "./bossActionExecutionCore.js";
import { bossActionTargets } from "./bossActionsViewCore.js";
import { postBossDamage } from "./bossActionExecution.js";
import { buildPcAttackAreaMutation, buildPcAttackMutation, buildPcAttackQuiveringPalmMutation, pcAttackAction, pcAttackNearbyIds } from "./pcAttackCore.js";
import { pcAttackPickerDefault, pcAttackPickerEntries } from "./pcAttackPickerCore.js";
import { buildPcGrappleEndMutation, buildPcManeuverMutation } from "./pcAttackManeuverCore.js";
import { bossFeetPerCell } from "./bossActionsViewCore.js";
import { getEffectsMutationSceneContext, runEffectsMutation, requireAppliedEffectsMutation } from "./effectsMutations.js";
import { currentSceneEpoch, isCurrentSceneEpoch } from "./sceneEpoch.js";
import { withBossLinkDefenses } from "./bossLinkResistanceCore.js";
import { getPcAttackRider } from "./pcAttackRiderCatalog.js";
import { planSpellSlotSpend, spellSlotSpendOperation } from "./spellSlotSpendCore.js";
import { CLASS_FEATURE_STATE_FIELD, planClassFeatureResourceAdjustment } from "./classFeatureCore.js";
import { getEnabledClassFeatures } from "./classFeatureCatalog.js";
import { pcAttackFeatureState } from "./pcAttackFeatureFormCore.js";
import { isOffTurn, planReactionSpend } from "./reactionTrackerCore.js";

// The slot each smite of the attack spends (Divine Smite at its level, Eldritch Smite from Pact Magic), in order:
// [{rider,name,plan}]. riders are the console's ({id}) or the plan's causality ({featureId,name}).
export function pcAttackSmiteSlotPlans(item,riders=[]) {
  const card=item?.metadata?.[`${ID}/meta`]?.initiativeCard || {};
  let resources=item?.metadata?.[`${ID}/meta`]?.classFeatureState?.resources || {};
  const plans=[];
  for(const rider of Array.isArray(riders)?riders:[]) {
    const definition=getPcAttackRider(rider?.featureId || rider?.id);
    if(!rider?.slotLevel || !definition?.slot) continue;
    const plan=planSpellSlotSpend({characterBuild:card.characterBuild,resources,spellLevel:1,slotLevel:rider.slotLevel,
      source:definition.slot.pact?"pact":""});
    plans.push({rider,name:rider.name || definition.label,plan});
    if(plan.spend) resources={...resources,[plan.spend.poolId]:{...resources[plan.spend.poolId],current:plan.spend.current-1}};
  }
  return plans;
}

// The smites' slots are spent in the attack's own command, so its Undo gives them back. With no slot left the
// console asks first and sends castWithoutSlot. When an activation of the attack already writes the attacker's
// classFeatureState (a metadata patch), the slot is spent inside that patch: the coordinator takes one writer per field.
function spendSmiteSlots(item,plan,castWithoutSlot=false) {
  const card=item?.metadata?.[`${ID}/meta`]?.initiativeCard || {};
  const statePatch=(plan.options?.metadataPatches || []).find(patch=>patch.id===item.id)?.fields?.[CLASS_FEATURE_STATE_FIELD];
  for(const {rider,name,plan:slotPlan} of pcAttackSmiteSlotPlans(item,plan.causality?.riders)) {
    if(slotPlan.exhausted && !castWithoutSlot) throw new Error(`${name}: ${slotPlan.message} Conferma l'attacco senza slot.`);
    if(!slotPlan.spend) continue;
    const operation=spellSlotSpendOperation({sourceId:item.id,poolId:slotPlan.spend.poolId,characterBuild:card.characterBuild,
      abilityModifiers:card.abilityModifiers || null});
    if(statePatch) statePatch.value=planClassFeatureResourceAdjustment(statePatch.value,operation.pool,operation.characterBuild,
      operation.adjustment,operation.abilityModifiers).state;
    else plan.operations.push(operation);
    rider.slotTracked=true;
  }
}

// A leveled attack spell (lotto L4): the first registration of a cast spends its slot (or Pact Magic) in its own
// command, like the smites; the next rays and darts, and Vampiric Touch's touches (cast from the spell panel), spend
// nothing. With no slot left the console asks first and sends castWithoutSlot.
export function pcAttackSpellSlotPlan(item,spell) {
  if(!spell?.firstOfCast || spell.fromActiveSpell) return null;
  const meta=item?.metadata?.[`${ID}/meta`] || {};
  const card=meta.initiativeCard || {};
  return planSpellSlotSpend({characterBuild:card.characterBuild,resources:meta.classFeatureState?.resources || {},
    spellLevel:spell.level,slotLevel:spell.slotLevel,source:spell.pact?"pact":""});
}

// An attack off turn with the reaction (an opportunity attack, a readied attack): "Reazione usata" in the attack's own
// command, so its Undo gives it back. Read again at the commit: in combat, still off turn, the reaction still free.
function spendAttackReaction(item,plan,turnState,useReaction=false) {
  if(!useReaction || !isOffTurn(turnState,item?.id)) return null;
  const reaction=planReactionSpend({casterId:item.id,casterName:item.name,conditions:item.metadata?.[`${ID}/meta`]?.conditions,initiativeState:turnState});
  if(!reaction.applies) return null;
  plan.operations.push(...reaction.operations);
  if(reaction.operations.length) plan.labelTargetIds=[...new Set([...(plan.labelTargetIds || []),item.id])];
  return {spent:!reaction.alreadyUsed,alreadyUsed:reaction.alreadyUsed};
}

function spendSpellCastSlot(item,plan,castWithoutSlot=false) {
  const spell=plan.causality?.spell;
  const slotPlan=pcAttackSpellSlotPlan(item,spell);
  if(!slotPlan) return;
  if(slotPlan.exhausted && !castWithoutSlot) throw new Error(`${spell.name}: ${slotPlan.message} Conferma l'attacco senza slot.`);
  if(!slotPlan.spend) return;
  const card=item?.metadata?.[`${ID}/meta`]?.initiativeCard || {};
  const statePatch=(plan.options?.metadataPatches || []).find(patch=>patch.id===item.id)?.fields?.[CLASS_FEATURE_STATE_FIELD];
  const operation=spellSlotSpendOperation({sourceId:item.id,poolId:slotPlan.spend.poolId,characterBuild:card.characterBuild,
    abilityModifiers:card.abilityModifiers || null});
  if(statePatch) statePatch.value=planClassFeatureResourceAdjustment(statePatch.value,operation.pool,operation.characterBuild,
    operation.adjustment,operation.abilityModifiers).state;
  else plan.operations.push(operation);
  spell.slotTracked=true;
  spell.slotSpent=slotPlan.spend.pact?`slot del Patto (${slotPlan.spend.level}°)`:`slot di ${slotPlan.spend.level}° livello`;
}

const newId =() => `pc-attack:${globalThis.crypto?.randomUUID?.() || Date.now().toString(36)+":"+Math.random().toString(36).slice(2)}`;
// The map labels of a creature whose pills changed without damage (an activation's pill on the attacker).
const refreshPillLabels = async ids => {const {refreshConditionLabels}=await import("./conditions.js");await refreshConditionLabels(ids);};
// The cantrip's Embers animation: the same matched visual the spell panel sends, decorative and best-effort; a
// cantrip without one is ignored by the renderer. Its loop (persistent) lasts with the cantrip's pill: lifecycleId is
// the spell instance on the target; without a pill (a miss, a passed save) only the one-shot layers are sent.
async function emitCantripVisual({spellId,casterId,targetIds,eventId,lifecycleId=eventId,persistent=false,sceneEpoch}) {
  const {emitMatchedSpellVisual}=await import("./embersMatchedVisualRenderer.js");
  return emitMatchedSpellVisual({spellId,casterId,targetIds,eventId,lifecycleId,persistent,sceneEpoch});
}
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
  getEpoch=currentSceneEpoch,isCurrentEpoch=isCurrentSceneEpoch,emitVisual=emitCantripVisual,
}={}) {
  const busy=new Set();
  // After the commit, once (never on a retry): the cantrip's animation from the caster to its targets, whatever the
  // outcome (a missed Fire Bolt still flies). Never awaited: the animation never delays or fails the command.
  const animateCantrip=({spellId,casterId,targetIds,eventId,lifecycleId=eventId,persistent=false,scope})=>{
    if(!spellId || !scope.isCurrent()) return;
    void Promise.resolve().then(()=>emitVisual({spellId,casterId,targetIds,eventId,lifecycleId,persistent,sceneEpoch:scope.epoch}))
      .catch(error=>console.warn("[pc-attack] matched visual:",error?.message || error));
  };
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
    // A dragonborn's breath weapon: built from the species trait, not stored among the quick actions.
    const action=String(actionId || "").startsWith(PC_ATTACK_BREATH_PREFIX)
      ? pcAttackBreathAction(getCard(item),actionId)
      : pcAttackAction(findQuickAction(getCard(item),actionId));
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
    // The console's picker (pcAttackPickerCore.js). Without an action: the last attack, else the first weapon; an actor
    // with spells and no attack opens with no action (the console shows its spells).
    const card=getCard(scope.item);
    const picker=pcAttackPickerEntries(card);
    const chosen=actionId?null:pcAttackPickerDefault(picker,{lastAttack:scope.item?.metadata?.[`${ID}/meta`]?.pcAttackState?.lastAttack,attackOnly:true});
    const action=actionId || chosen?attackOf(scope.item,actionId || chosen.actionId):null;
    const items=await api.scene.items.getItems();
    if(!scope.isCurrent()) throw new Error("Scena cambiata: riapri l'attacco.");
    const round=Number(scope.turnState?.round);
    const targets=bossActionTargets(items,scope.item.id).map(item=>withBossLinkDefenses(item,items.find(entry=>entry.id===item.metadata?.[`${ID}/meta`]?.sharedHpSourceId),round));
    // The Capacità tab: each feature's active instances and resources, as the character sheet reads them.
    const featureState=picker.some(entry=>entry.featureId)
      ?pcAttackFeatureState(card,scope.item?.metadata?.[`${ID}/meta`]?.[CLASS_FEATURE_STATE_FIELD],getEnabledClassFeatures(card),Number.isFinite(round)?round:null)
      :null;
    return {item:scope.item,action,actionId:action?.id || "",...(chosen?.spellId?{spellId:chosen.spellId}:{}),picker,featureState,
      targets,turnState:scope.turnState,sceneIdentity:scope.scene.sceneIdentity};
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
      // CAP-LINK: the creatures whose links this attack may end (a Compelled Duel on another creature).
      const linkItems=(await api.scene.items.getItems()).filter(item=>isBossActionCreature(item));
      if(!scope.isCurrent()) throw new Error("Scena cambiata: riapri l'attacco.");
      const attackInstanceId=request.attackInstanceId || newId();
      const decisionKey=JSON.stringify({sourceId,actionId,targetId,outcome:request.outcome || "",
        componentAmounts:Object.entries(request.componentAmounts || {}).sort(([a],[b])=>a.localeCompare(b)),
        ignoredDefenses:request.ignoredDefenses ?? null,expectedDefenses:request.expectedDefenses ?? null,
        riders:request.riders ?? null,extras:request.extras ?? null,spellId:request.spellId || "",
        weaponCantrip:request.weaponCantrip ?? null,expectedSecondaryDefenses:request.expectedSecondaryDefenses ?? null,sharedHp:request.sharedHp || null,
        activations:request.activations ?? null,attackMode:request.attackMode || "",modeAmount:request.modeAmount ?? null,
        expectedBurstDefenses:request.expectedBurstDefenses ?? null,castWithoutSlot:request.castWithoutSlot===true,
        useReaction:request.useReaction===true,
        spellCast:request.spellCast ?? null});
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
          attackMode:request.attackMode || "",modeAmount:request.modeAmount ?? null,burstItems,expectedBurstDefenses:request.expectedBurstDefenses || {},
          spellCast:request.spellCast || null,linkItems});
        spendSmiteSlots(scope.item,plan,request.castWithoutSlot===true);
        spendSpellCastSlot(scope.item,plan,request.castWithoutSlot===true);
        const reaction=spendAttackReaction(scope.item,plan,scope.turnState,request.useReaction===true);
        draft={decisionKey,plan,reaction,options:{...plan.options,...(bossLinkResisted.length?{bossLinkResisted}:{}),
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
      // The cantrip of the attack, or the one woven into a weapon attack (Booming Blade; Green-Flame Blade leaps to
      // its second creature). The pill's spell instance is the loop's lifecycle.
      const woven=plan.causality.weaponCantrip;
      const withPill=plan.operations.some(operation=>operation.type==="spell:upsert");
      if(result.duplicate!==true) animateCantrip({spellId:plan.causality.cantrip?.spellId || plan.causality.spell?.spellId || woven?.spellId,casterId:scope.item.id,
        targetIds:[targetItem.id,...(woven?.secondaryTargetId?[woven.secondaryTargetId]:[])],eventId:attackInstanceId,
        lifecycleId:withPill?`${attackInstanceId}:spell`:attackInstanceId,persistent:withPill,scope});
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
      // Vampiric Touch: the caster's healing, projected like temporary hit points (HP bar, text, hpMemory, labels).
      if(result.duplicate!==true && plan.casterHealChange && scope.isCurrent()) {
        try {await postTempHp({rows:[plan.casterHealChange],sceneEpoch:scope.epoch,isCurrent:scope.isCurrent});}
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
        spell:plan.causality.spell ? structuredClone(plan.causality.spell) : null,
        manualRemainder:plan.options?.history?.payload?.manualRemainder || "",conditions:(plan.causality.conditionsApplied || []).map(entry=>entry.condition),
        ...(draft.reaction?{reaction:{...draft.reaction}}:{}),
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
      if(result.duplicate!==true) animateCantrip({spellId:plan.causality.cantrip?.spellId,casterId:scope.item.id,
        targetIds:plan.rows.map(row=>row.item.id),eventId:attackInstanceId,scope});
      const warnings=[];
      if(result.duplicate!==true && scope.isCurrent()) for(const row of plan.changes) {
        try {warnings.push(...(await postDamage({item:row.item,change:row.change,result,sceneEpoch:scope.epoch,
          sceneIdentity:scope.scene.sceneIdentity,isCurrent:scope.isCurrent}) || []));}
        catch(error) {warnings.push(String(error?.message || error));}
      }
      // The metallic breath's conditions on creatures the damage projection did not refresh.
      const areaLabelIds=(plan.labelTargetIds || []).filter(id=>!plan.changes.some(row=>row.item.id===id));
      if(result.duplicate!==true && areaLabelIds.length && scope.isCurrent()) {
        try {await refreshLabels(areaLabelIds);}
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
  // Grapple and Shove (pcAttackManeuverCore.js), and the end of a grapple: actions of their own, the same command path.
  // The plan is built from the creatures read now; the draft keeps it for a retry after a lost acknowledgement.
  async function runManeuver(request,decision,build) {
    const {sourceId}=request;
    if(busy.has(sourceId)) throw new Error("Registrazione già in corso.");
    busy.add(sourceId);
    try {
      const scope=await session(sourceId);
      const attackInstanceId=request.attackInstanceId || newId();
      const decisionKey=JSON.stringify(decision);
      let draft=drafts.get(attackInstanceId);
      if(draft && (draft.decisionKey!==decisionKey || draft.options.sceneIdentity!==scope.scene.sceneIdentity))
        throw new Error("Le decisioni o la scena sono cambiate: riapri l'azione.");
      if(draft?.result) return {...structuredClone(draft.result),duplicate:true};
      if(!draft) {
        const plan=await build(scope,attackInstanceId);
        if(!scope.isCurrent()) throw new Error("Scena cambiata: riapri l'azione.");
        draft={decisionKey,plan,options:{...plan.options,sceneIdentity:request.sceneIdentity || scope.scene.sceneIdentity,sceneEpoch:scope.epoch}};
        drafts.set(attackInstanceId,draft);
      }
      const plan=draft.plan;
      const result=await runMutation(structuredClone(plan.operations),structuredClone(draft.options));
      try {requireApplied(result);}
      catch(error) {
        if(["conflict","rejected"].includes(result?.status) && result.committed!==true)
          error.message="Lo stato è cambiato prima del commit (creature o condizioni). Riapri l'azione e verifica.";
        throw error;
      }
      const warnings=[];
      // The pills changed without damage: the map labels of the creatures concerned.
      if(result.duplicate!==true && scope.isCurrent() && plan.labelTargetIds?.length) {
        try {await refreshLabels(plan.labelTargetIds);}
        catch(error) {warnings.push(String(error?.message || error));}
      }
      draft.result={...result,attackInstanceId,maneuver:structuredClone(plan.causality.maneuver),warnings,
        target:{id:plan.causality.targets[0].id,name:plan.causality.targets[0].name},
        ...(plan.manualText?{manualText:plan.manualText}:{}),
        historyEntryId:result.historyEntry?.id || null,
        undoAvailable:!result.historyPending && !result.historySkipped && !!result.historyEntry?.id};
      return structuredClone(draft.result);
    } finally {busy.delete(sourceId);}
  }
  async function executePcManeuver(request={}) {
    const {sourceId,targetId}=request;
    return runManeuver(request,{kind:"maneuver",sourceId,targetId,maneuver:request.kind || "",outcome:request.outcome || "",effect:request.effect || ""},
      async(scope,attackInstanceId)=>{
        const [targetItem]=targetId?await api.scene.items.getItems([targetId]):[];
        if(!targetItem) throw new Error("Il bersaglio non è più presente nella scena.");
        return buildPcManeuverMutation({kind:request.kind,sourceItem:scope.item,targetItem,outcome:request.outcome,effect:request.effect,
          attackInstanceId,turnState:scope.turnState});
      });
  }
  async function endPcGrapple(request={}) {
    const {sourceId,grappledId,instanceId}=request;
    return runManeuver(request,{kind:"grapple-end",sourceId,grappledId,instanceId,outcome:request.outcome || ""},
      async(scope,attackInstanceId)=>{
        const items=(await api.scene.items.getItems()).filter(item=>isBossActionCreature(item));
        const grappledItem=grappledId===scope.item.id?scope.item:items.find(item=>item.id===grappledId);
        if(!grappledItem) throw new Error("La creatura afferrata non è più presente nella scena.");
        return buildPcGrappleEndMutation({sourceItem:scope.item,grappledItem,instanceId,outcome:request.outcome,items,
          attackInstanceId,turnState:scope.turnState});
      });
  }
  return {getPcAttackPresentation,executePcAttack,endQuiveringPalm,executePcAttackArea,getPcAttackNearby,executePcManeuver,endPcGrapple};
}
const runtime=createPcAttackRuntime();
export const getPcAttackPresentation=(...args)=>runtime.getPcAttackPresentation(...args);
export const executePcAttack=(...args)=>runtime.executePcAttack(...args);
export const endQuiveringPalm=(...args)=>runtime.endQuiveringPalm(...args);
export const executePcAttackArea=(...args)=>runtime.executePcAttackArea(...args);
export const getPcAttackNearby=(...args)=>runtime.getPcAttackNearby(...args);
export const executePcManeuver=(...args)=>runtime.executePcManeuver(...args);
export const endPcGrapple=(...args)=>runtime.endPcGrapple(...args);
