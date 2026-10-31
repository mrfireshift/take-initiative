import OBR, { buildImage } from "@owlbear-rodeo/sdk";
import { committedHpFor, sharedHpCommittedUpdates } from "./sharedHpViewCore.js";
import { ID, EFFECT_SAVE_REMINDER_NOTICE_CHANNEL } from "./constants.js";
import { getInitiativeCard, saveInitiativeCard } from "./initiativeCards.js";
import { sanitizeBossActionBinding, bossSpellReferenceIds } from "./bossActionProfileCore.js";
import { createBossActionProfileStore } from "./bossActionProfileStore.js";
import { BOSS_ACTION_STATE_FIELD, bossInstanceForItem, isBossActionCreature, buildBossActionMutation, buildBossActionUse, bossRuntimeStateForItem, buildBossResourceReset,
  buildBossActionGroupMutation, isBossActionGroupExecution, bossGrappledIds, buildBossThrowMutation, buildBossEffectEndMutation,
  bossProfileUsesSequence, bossSequenceBlocker, bossSequenceWarning, bossHpGateBlocker, bossEpicSlot, bossActiveSeam, buildBossSeamMutation, BOSS_SEAM_ITEM_KEY,
  sanitizeBossAreaPlacement } from "./bossActionExecutionCore.js";
import { bossCollapseMarkerSpec } from "./bossCollapseCore.js";
import { createMonsterActionContext } from "./monsterActionContextCore.js";
import { getEffectsMutationSceneContext, runEffectsMutation, requireAppliedEffectsMutation } from "./effectsMutations.js";
import { currentSceneEpoch, isCurrentSceneEpoch } from "./sceneEpoch.js";
import { buildSpellUnifiedPanelRouteQuery } from "./spellUnifiedPanelRoutingCore.js";
import { getSpellDefinition } from "./spells-srd.js";

import { bossActionUsageAvailability, bossActionUsageSummary } from "./bossActionUsageCore.js";
import { CUSTOM_AURAS_FIELD, normalizeCustomAuras } from "./customAuraCore.js";
import { bossAuraStatus, mergeBossAuras, removeBossAuras } from "./bossAuraCore.js";
import { BOSS_LINK_RESISTANCE_FIELD, bossLinkResistanceRecord, bossLinkResistanceState } from "./bossLinkResistanceCore.js";

const META_KEY = `${ID}/meta`;
const newId = () => `boss-action:${globalThis.crypto?.randomUUID?.() || Date.now().toString(36)+":"+Math.random().toString(36).slice(2)}`;
const sameBinding = (left,right) => JSON.stringify(sanitizeBossActionBinding(left)) === JSON.stringify(sanitizeBossActionBinding(right));

// Strappare la Cucitura: once committed the seam disappears from the map too. Only the drawings this boss's
// seam recorded, and only if they still carry this boss's seam marker.
async function removeBossSeamDrawings({api=OBR,sourceId,itemIds=[],isCurrent}) {
  if(!itemIds.length || !isCurrent()) return [];
  const items=await api.scene.items.getItems(itemIds);
  const ids=items.filter(item=>item?.metadata?.[BOSS_SEAM_ITEM_KEY]?.sourceId===sourceId).map(item=>item.id);
  if(ids.length && isCurrent()) await api.scene.items.deleteItems(ids);
  return [];
}

export async function postBossDamage({item,change,result,sceneEpoch,sceneIdentity,isCurrent}) {
  if (!change?.changed || !isCurrent()) return [];
  const [{syncHPBarNow,syncHPTextBatchNow},{syncHPBatchToMemory},{refreshConditionLabels},
    {broadcastConcentrationSaveWarnings},{effectSaveReminderNoticesForDamage},{sendProjectedReminderPayload}] = await Promise.all([
    import("./hpbar-items.js"),import("./hpMemory.js"),import("./conditions.js"),
    import("./concentrationSaveReminder.js"),import("./effectSaveReminderCore.js"),import("./options/reminderProjectionBroadcast.js"),
  ]);
  if (!isCurrent()) return [];
  const updates=sharedHpCommittedUpdates(result,[{item,change}]);
  const memoryItems=result?.plan?.sharedHpGroups?.length ? await OBR.scene.items.getItems(updates.map(update=>update.tokenId)) : [item];
  if(!isCurrent()) return [];
  const jobs=[
    Promise.resolve().then(()=>{if(isCurrent())for(const update of updates)syncHPBarNow(update.tokenId,update.hp,update.hpMax);}),
    Promise.resolve().then(()=>isCurrent()?syncHPTextBatchNow(updates):undefined),
    Promise.resolve().then(()=>isCurrent()?syncHPBatchToMemory(updates.map(update=>({itemId:update.tokenId,hp:update.hp,hpMax:update.hpMax})),{sceneEpoch,items:memoryItems,isCurrent}):undefined),
    Promise.resolve().then(()=>isCurrent()?refreshConditionLabels([item.id]):undefined),
    Promise.resolve().then(()=>isCurrent()?broadcastConcentrationSaveWarnings([{itemId:item.id,damage:change.requested}],{
      causeHistoryEntryId:result.historyEntry?.id || "",sceneEpoch,warningRuntimeScope:sceneIdentity,
    }):undefined),
    Promise.resolve().then(async()=>{
      if(!isCurrent()) return;
      const notices=effectSaveReminderNoticesForDamage({items:[item],damageById:new Map([[item.id,change.requested]]),eventId:result.commandId});
      if(notices.length) await sendProjectedReminderPayload(EFFECT_SAVE_REMINDER_NOTICE_CHANNEL,{type:"show-effect-save-notices",notices});
    }),
  ];
  return (await Promise.allSettled(jobs)).filter(r=>r.status==="rejected").map(r=>String(r.reason?.message || r.reason));
}

// Hand Slam: once committed, the cracked area goes on the Props layer at the centre of the drawn circle. The id
// comes from the action instance, so a retry never adds a second image.
async function placeBossCollapseMarker({api=OBR,spec,isCurrent}) {
  if(!spec || !isCurrent()) return [];
  const [existing]=await api.scene.items.getItems([spec.id]);
  if(existing || !isCurrent()) return [];
  const url=new URL(spec.asset,String(globalThis.location?.origin || "http://localhost")).href;
  const item=buildImage({width:spec.pixels,height:spec.pixels,url,mime:"image/webp"},{dpi:spec.pixels/spec.cells,offset:{x:spec.pixels/2,y:spec.pixels/2}})
    .id(spec.id).position(spec.position).layer("PROP").locked(true).visible(true).name(spec.name).metadata(spec.metadata).build();
  await api.scene.items.addItems([item]);
  return [];
}

// Hurl beyond the edge: once committed, the DEX save arrives as a reminder on the "Appeso al bordo" pill.
async function postBossEdgeSave({api=OBR,edge,sourceName,activationId,isCurrent}) {
  if(!edge || !isCurrent()) return [];
  const [{bossEdgeSaveNotice},{sendProjectedReminderPayload}]=await Promise.all([import("./bossEdgeSaveCore.js"),import("./options/reminderProjectionBroadcast.js")]);
  const [item]=await api.scene.items.getItems([edge.targetId]);
  if(!isCurrent()) return [];
  const notice=bossEdgeSaveNotice({item,edge,sourceName,activationId});
  if(!notice) return ["Promemoria del TS sul bordo non disponibile: risolvilo a mano."];
  await sendProjectedReminderPayload(EFFECT_SAVE_REMINDER_NOTICE_CHANNEL,{type:"show-effect-save-notices",notices:[notice]});
  return [];
}

// Reads started together and awaited one by one in the caller's order: a rejection is reported where it is
// awaited (none is left unhandled when an earlier check throws first).
export function quietReads(reads) {
  return reads.map((read) => {
    const promise = Promise.resolve(read);
    promise.catch(() => {});
    return promise;
  });
}

// Runtime reads definitions and canonical token state only. It never parses ability prose.
export function createBossActionRuntime({
  api=OBR,store=null,getCard=getInitiativeCard,saveCard=saveInitiativeCard,
  getSceneContext=getEffectsMutationSceneContext,runMutation=runEffectsMutation,
  requireApplied=requireAppliedEffectsMutation,postDamage=postBossDamage,postEdgeSave=postBossEdgeSave,removeSeamDrawings=removeBossSeamDrawings,
  placeCollapseMarker=placeBossCollapseMarker,
  getEpoch=currentSceneEpoch,isCurrentEpoch=isCurrentSceneEpoch,
}={}) {
  const definitions=()=>store || createBossActionProfileStore();
  const busy=new Set();
  // Retain the prepared UI command for lost-ACK retries; History remains in the coordinator.
  const drafts=new Map();
  async function readSource(sourceId) {
    const [item]=await api.scene.items.getItems([sourceId]);
    if(!isBossActionCreature(item)) throw new Error("Seleziona il token reale del boss.");
    return item;
  }
  async function session(sourceId) {
    const epoch=getEpoch();
    // The four reads start together; their answers are checked in the order they were read before (role, scene,
    // boss token, metadata), so the same error wins, and a non-GM fails without waiting for the others.
    const [role,sceneRead,sourceRead,metadataRead]=quietReads([api.player.getRole(),getSceneContext(),
      readSource(sourceId),api.scene.getMetadata()]);
    if(await role!=="GM") throw new Error("Solo il GM può usare la console Boss.");
    const scene=await sceneRead;
    const item=await sourceRead;
    const metadata=await metadataRead;
    if(!isCurrentEpoch(epoch)) throw new Error("Scena cambiata: riapri la console Boss.");
    return {item,epoch,scene,round:metadata?.[ID+"/state"]?.round,turnState:metadata?.[ID+"/state"] || null,isCurrent:()=>isCurrentEpoch(epoch)};
  }
  // v19: the Epic Action slot of the round, read from the initiative order and the player characters in it.
  async function epicSlotFor(scope) {
    const order=Array.isArray(scope.turnState?.order)?[...new Set(scope.turnState.order.map(id=>String(id || "")).filter(Boolean))]:[];
    const items=order.length?await api.scene.items.getItems(order):[];
    return bossEpicSlot(scope.turnState,items);
  }
  async function getBossActionPresentation(sourceId) {
    const scope=await session(sourceId);
    const binding=sanitizeBossActionBinding(getCard(scope.item).bossActionBinding);
    const profile=binding?definitions().get(binding.profileId,binding.profileRevision):null;
    if(profile && !sameBinding(profile,binding)) throw new Error("Identità del profilo non coerente col binding.");
    const state=profile?bossRuntimeStateForItem(scope.item,profile):null;
    const availability=profile?Object.fromEntries(profile.abilities.map(action=>[action.id,
      bossActionUsageAvailability(action,state,{phaseId:profile.phaseId,round:scope.round})])):{};
    // v22: an ability for the boss above or at/below half its hit points (from the token's canonical HP).
    if(profile) for(const action of profile.abilities) {
      const gated=bossHpGateBlocker(action,scope.item);
      if(gated && availability[action.id]?.available!==false) availability[action.id]={...availability[action.id],available:false,reason:gated,hpGated:true};
    }
    // v19 Epic Action sequence: a block from the token's round log, a "last slot" warning from the order,
    // the seam of this round and the seam drawings left on the map.
    let sequence=null;
    if(profile && bossProfileUsesSequence(profile)) {
      const slot=await epicSlotFor(scope);
      const warnings={};
      for(const action of profile.abilities) {
        const blocked=bossSequenceBlocker(profile,action,state,scope.round,scope.item.name);
        if(blocked && availability[action.id]?.available!==false) availability[action.id]={...availability[action.id],available:false,reason:blocked,sequenceBlocked:true};
        const warning=bossSequenceWarning(action,slot);
        if(warning)warnings[action.id]=warning;
      }
      const seam=bossActiveSeam(state,scope.round);
      // Every piece of a drawing (the area and its attached outline) is listed: each one is removed by its id.
      const drawings=(await api.scene.items.getItems(item=>item?.metadata?.[BOSS_SEAM_ITEM_KEY]?.sourceId===scope.item.id))
        .map(item=>({id:item.id,active:!!seam?.itemIds?.includes(item.id)}));
      sequence={slot,warnings,log:state.epicLog?.round===scope.round?[...state.epicLog.actionIds]:[],
        seam:seam?structuredClone(seam):null,staleSeamItemIds:drawings.filter(row=>!row.active).map(row=>row.id)};
    }
    return {item:scope.item,binding,profile,bossInstanceId:profile?bossInstanceForItem(scope.item,profile):null,
      round:scope.round,availability,
      usageSummary:profile?bossActionUsageSummary(state,scope.round):null,
      auras:profile?bossAuraStatus(scope.item.metadata?.[META_KEY]?.[CUSTOM_AURAS_FIELD],profile):[],
      // v26: Rimebound Link, for the GM only (the console's status line).
      ...(profile?.abilities?.some(ability=>ability.linkResistance)?{linkResistance:bossLinkResistanceState(scope.item,scope.round)}:{}),
      ...(sequence?{sequence}:{}),
      sceneIdentity:scope.scene.sceneIdentity};
  }
  // A seam that collapsed at the end of its round (or was undone) leaves its drawing: the GM removes it here.
  // Only drawings of this boss's seams that are not the seam of the current round.
  async function removeStaleBossSeams(request={}) {
    const presentation=await getBossActionPresentation(request.sourceId);
    expectedProfile(request,presentation);
    const ids=presentation.sequence?.staleSeamItemIds || [];
    if(!ids.length) return {removed:[]};
    await api.scene.items.deleteItems(ids);
    return {removed:ids};
  }
  // Trait auras (profile v11) live on the bound token as custom auras. The token metadata is merged, never
  // replaced, and the custom aura controller picks the change up like any edit made in the aura editor.
  async function updateBossAuras(scope,change) {
    const before=normalizeCustomAuras(scope.item.metadata?.[META_KEY]?.[CUSTOM_AURAS_FIELD]);
    const planned=change(before);
    if(JSON.stringify(planned.auras)===JSON.stringify(before)) return {...planned,changed:false};
    if(!scope.isCurrent()) throw new Error("Scena cambiata: riapri la console Boss.");
    let result=planned;
    await api.scene.items.updateItems([scope.item.id],drafts=>{
      for(const draft of drafts) {
        if(draft?.id!==scope.item.id) continue;
        const meta={...(draft.metadata?.[META_KEY] || {})};
        // Recomputed on the fresh draft: an aura edited meanwhile is never lost.
        result=change(normalizeCustomAuras(meta[CUSTOM_AURAS_FIELD]));
        if(result.auras.length)meta[CUSTOM_AURAS_FIELD]=result.auras;else delete meta[CUSTOM_AURAS_FIELD];
        draft.metadata={...(draft.metadata || {}),[META_KEY]:meta};
      }
    });
    return {...result,changed:true};
  }
  // Rimebound Link (v26): the record on the boss token follows the binding (merged, the rest of the metadata is kept);
  // the round in which the link was broken stays when the same trait is bound again.
  async function updateBossLinkRecord(scope,profile) {
    const before=scope.item.metadata?.[META_KEY]?.[BOSS_LINK_RESISTANCE_FIELD];
    const wanted=profile?bossLinkResistanceRecord(profile,before):null;
    if(JSON.stringify(wanted ?? null)===JSON.stringify(before ?? null)) return;
    if(!scope.isCurrent()) throw new Error("Scena cambiata: riapri la console Boss.");
    await api.scene.items.updateItems([scope.item.id],drafts=>{
      for(const draft of drafts) {
        if(draft?.id!==scope.item.id) continue;
        const meta={...(draft.metadata?.[META_KEY] || {})};
        const next=profile?bossLinkResistanceRecord(profile,meta[BOSS_LINK_RESISTANCE_FIELD]):null;
        if(next)meta[BOSS_LINK_RESISTANCE_FIELD]=next;else delete meta[BOSS_LINK_RESISTANCE_FIELD];
        draft.metadata={...(draft.metadata || {}),[META_KEY]:meta};
      }
    });
  }
  async function bindBossActionProfile(sourceId,value) {
    const scope=await session(sourceId);
    const profile=definitions().put(value);
    const binding=sanitizeBossActionBinding(profile);
    const previous=sanitizeBossActionBinding(getCard(scope.item).bossActionBinding);
    await saveCard(sourceId,scope.item.name,{bossActionBinding:binding},{
      preserveExhaustion:true,isCurrent:scope.isCurrent,sceneIdentity:scope.scene.sceneIdentity,
    });
    // The profile's auras start working with the binding; another boss's managed auras leave the token.
    const auraChange=await updateBossAuras(scope,values=>{
      const other=previous && previous.bossDefinitionId!==profile.bossDefinitionId ? removeBossAuras(values,previous.bossDefinitionId) : {auras:values,removed:[]};
      const merged=mergeBossAuras(other.auras,profile);
      return {...merged,removed:[...other.removed,...merged.removed]};
    });
    await updateBossLinkRecord(scope,profile);
    return {...await getBossActionPresentation(sourceId),auraChange:{added:auraChange.added,updated:auraChange.updated || [],removed:auraChange.removed}};
  }
  // "Ripristina aure": the profile's auras rewritten from the profile (the GM's edits to them are discarded).
  async function restoreBossAuras(request={}) {
    const scope=await session(request.sourceId);
    const binding=sanitizeBossActionBinding(getCard(scope.item).bossActionBinding);
    const profile=binding?definitions().get(binding.profileId,binding.profileRevision):null;
    expectedProfile(request,{binding,profile,bossInstanceId:profile?bossInstanceForItem(scope.item,profile):null});
    const change=await updateBossAuras(scope,values=>mergeBossAuras(values,profile,{replace:true}));
    return {added:change.added,restored:change.restored,removed:change.removed,changed:change.changed};
  }
  // GM tool: one undoable command that clears the boss token's counters (new combat, replayed phase).
  async function resetBossActionResources(request={}) {
    const {sourceId}=request;
    if(busy.has(sourceId)) throw new Error("Risoluzione già in corso.");
    busy.add(sourceId);
    try {
      const scope=await session(sourceId);
      const binding=sanitizeBossActionBinding(getCard(scope.item).bossActionBinding);
      const profile=binding?definitions().get(binding.profileId,binding.profileRevision):null;
      expectedProfile(request,{binding,profile,bossInstanceId:profile?bossInstanceForItem(scope.item,profile):null});
      const plan=buildBossResourceReset({profile,sourceItem:scope.item,actionInstanceId:request.actionInstanceId || newId(),round:scope.round});
      const result=await runMutation([],{...plan.options,sceneIdentity:request.sceneIdentity || scope.scene.sceneIdentity,sceneEpoch:scope.epoch});
      requireApplied(result);
      return {...structuredClone(plan.causality.resourceReset),historyEntryId:result.historyEntry?.id || null,
        undoAvailable:!result.historyPending && !result.historySkipped && !!result.historyEntry?.id};
    } finally {busy.delete(sourceId);}
  }
  // Which revisions the tokens of this scene use: the library cleanup never removes those.
  // items: the scene's items when the caller has just read them (the console's refresh), else read here.
  async function listSceneBindings(sceneItems=null) {
    const items=Array.isArray(sceneItems)?sceneItems:await api.scene.items.getItems();
    return items.filter(isBossActionCreature).map(item=>({tokenId:item.id,name:item.name || item.id,
      binding:sanitizeBossActionBinding(getCard(item)?.bossActionBinding)})).filter(row=>row.binding)
      .map(row=>({tokenId:row.tokenId,name:row.name,profileId:row.binding.profileId,profileRevision:row.binding.profileRevision}));
  }
  async function unbindBossActionProfile(sourceId) {
    const scope=await session(sourceId);
    const previous=sanitizeBossActionBinding(getCard(scope.item).bossActionBinding);
    await saveCard(sourceId,scope.item.name,{bossActionBinding:null},{
      preserveExhaustion:true,isCurrent:scope.isCurrent,sceneIdentity:scope.scene.sceneIdentity,
    });
    // The boss's managed auras go with the binding; every other aura of the token stays.
    const auraChange=previous?await updateBossAuras(scope,values=>removeBossAuras(values,previous.bossDefinitionId)):{removed:[]};
    await updateBossLinkRecord(scope,null);
    return {...await getBossActionPresentation(sourceId),auraChange:{added:[],removed:auraChange.removed}};
  }
  function expectedProfile(request,presentation) {
    if(presentation.profile && !sameBinding(presentation.profile,presentation.binding)) throw new Error("Identità del binding non coerente col profilo.");
    if(!presentation.binding || !presentation.profile) throw new Error("Definizione locale mancante: importa il profilo prima di usare l'azione.");
    if(request.profileId!==undefined && request.profileId!==presentation.binding.profileId
      || request.profileRevision!==undefined && request.profileRevision!==presentation.binding.profileRevision
      || request.bossInstanceId!==undefined && request.bossInstanceId!==presentation.bossInstanceId)
      throw new Error("Profilo o binding cambiato: riapri l'azione.");
  }
  async function executeBossAction(request={},manualRegistration=false) {
    const {sourceId,actionId,targetId}=request;
    if(busy.has(sourceId)) throw new Error("Risoluzione già in corso.");
    busy.add(sourceId);
    try {
      const scope=await session(sourceId);
      const binding=sanitizeBossActionBinding(getCard(scope.item).bossActionBinding);
      const profile=binding?definitions().get(binding.profileId,binding.profileRevision):null;
      expectedProfile(request,{binding,profile,bossInstanceId:profile?bossInstanceForItem(scope.item,profile):null});
      const action=profile.abilities.find(a=>a.id===actionId);
      const group=!manualRegistration && isBossActionGroupExecution(action);
      // Group targets are deduplicated in request order; every requested creature must still exist.
      const targetIds=group?[...new Set((Array.isArray(request.targetIds)?request.targetIds:[]).map(id=>String(id || "")).filter(Boolean))]:[];
      const groupItems=group&&targetIds.length?await api.scene.items.getItems(targetIds):[];
      const targetItems=targetIds.map(id=>groupItems.find(item=>item.id===id)).filter(Boolean);
      if(group && targetItems.length!==targetIds.length) throw new Error("Un bersaglio non è più presente nella scena: riapri l’azione.");
      // Epic Resistance acts on the boss itself, a seam on the map: no target to read.
      const effectEnd=!manualRegistration && action?.execution?.kind==="effect-end";
      const seamAction=!manualRegistration && action?.execution?.kind==="seam";
      const [targetItem]=manualRegistration || group || effectEnd || seamAction ? [] : await api.scene.items.getItems([targetId]);
      if(!scope.isCurrent()) throw new Error("Scena cambiata: riapri la console Boss.");
      const actionInstanceId=request.actionInstanceId || newId();
      const decisionKey=JSON.stringify({sourceId,actionId,targetId,targetIds,binding,mode:request.mode || "",
        sharedHp:request.sharedHp || null,
        outcome:request.outcome || "",outcomes:Object.entries(request.outcomes || {}).sort(([a],[b])=>a.localeCompare(b)),areaPlacement:request.areaPlacement || null,
        areaPlacements:request.areaPlacements || null,innerIds:request.innerIds || null,
        targetAmounts:request.targetAmounts ? Object.entries(request.targetAmounts).sort(([a],[b])=>a.localeCompare(b)) : null,
        ignoredDefenses:request.ignoredDefenses ?? null,expectedDefenses:request.expectedDefenses ?? null,expectedImmuneIds:request.expectedImmuneIds ?? null,expectedMarkedIds:request.expectedMarkedIds ?? null,expectedEvasionIds:request.expectedEvasionIds ?? null,expectedEvasion:request.expectedEvasion ?? null,
        manualRegistration,manualConfirmed:request.manualConfirmed===true,componentAmounts:Object.entries(request.componentAmounts || {}).sort(([a],[b])=>a.localeCompare(b)),
        distance:request.distance ?? null,damage:request.damage ?? null,landing:request.landing ?? null,effect:request.effect ?? null,roll:request.roll ?? null,
        rider:request.rider ?? null,collisionTargetId:request.collisionTargetId ?? null,collisionOutcome:request.collisionOutcome ?? null,
        collisionIgnoredDefenses:request.collisionIgnoredDefenses ?? null,collisionExpectedDefenses:request.collisionExpectedDefenses ?? null,
        seam:request.seam ?? null,sequenceConfirmed:request.sequenceConfirmed===true,teleport:request.teleport ?? null,critical:request.critical===true});
      let draft=drafts.get(actionInstanceId);
      if(draft && (draft.decisionKey!==decisionKey || draft.options.sceneIdentity!==scope.scene.sceneIdentity))
        throw new Error("Le decisioni o la scena del draft sono cambiate: riapri l'azione.");
      if(draft?.result) return {...structuredClone(draft.result),duplicate:true};
      if(!draft) {
        // v19: the last Epic Action of the round is confirmed by the GM when the order says otherwise (a spent
        // counter is reported by the plan first).
        const spent=action?bossActionUsageAvailability(action,bossRuntimeStateForItem(scope.item,profile),{phaseId:profile.phaseId,round:scope.round}).available===false:false;
        if(!spent && action?.sequence?.slot==="last" && bossProfileUsesSequence(profile)) {
          const warning=bossSequenceWarning(action,await epicSlotFor(scope));
          if(!scope.isCurrent()) throw new Error("Scena cambiata: riapri la console Boss.");
          if(warning && request.sequenceConfirmed!==true) throw new Error(`Conferma che è l’ultima Azione Epica del round. ${warning}`);
        }
        let plan;
        if(manualRegistration) {
          if(action?.execution || request.manualConfirmed!==true)
            throw new Error("Conferma l’uso manuale di una capacità non automatizzata.");
          const use=buildBossActionUse({profile,action,sourceItem:scope.item,actionInstanceId,round:scope.round});
          // A manual combat ability (e.g. Epic Resistance) records its use even without a counter; traits never do.
          if(!use.resources.length && !["epic-action","action","reaction"].includes(action.category))
            throw new Error("Un tratto passivo non ha un uso da registrare.");
          const label=scope.item.name+": "+action.name+" (uso manuale)";
          const causality={...use.context,resources:use.resources,manualExecution:true};
          plan={operations:[],damageComponents:[],manualText:action.rawText,options:{
            commandId:actionInstanceId,correlationId:actionInstanceId,sourceId,kind:"monster-action",label,
            metadataPatches:use.metadataPatches,sceneMetadataPreconditions:use.sceneMetadataPreconditions,
            history:{kind:"monster-action",label,payload:{causality,manualRemainder:action.rawText}},
          }};
        } else if(group) {
          plan=buildBossActionGroupMutation({profile,action,sourceItem:scope.item,targetItems,outcomes:request.outcomes,
            componentAmounts:request.componentAmounts,targetAmounts:request.targetAmounts || {},actionInstanceId,round:scope.round,turnState:scope.turnState,
            manualConfirmed:request.manualConfirmed===true,areaPlacement:request.areaPlacement || null,
            areaPlacements:request.areaPlacements || null,innerIds:request.innerIds || null,
            ignoredDefenses:request.ignoredDefenses || {},expectedDefenses:request.expectedDefenses,expectedImmuneIds:request.expectedImmuneIds,
            expectedMarkedIds:request.expectedMarkedIds,expectedEvasionIds:request.expectedEvasionIds});
        } else if(seamAction) {
          plan=buildBossSeamMutation({profile,action,sourceItem:scope.item,seam:request.seam,actionInstanceId,round:scope.round});
        } else if(effectEnd) {
          plan=buildBossEffectEndMutation({profile,action,sourceItem:scope.item,effect:request.effect,roll:request.roll,actionInstanceId,round:scope.round});
        } else if(action?.execution?.kind==="throw") {
          // Hurl: only the creature the boss holds now, across the whole scene.
          const grappledIds=bossGrappledIds(await api.scene.items.getItems(),scope.item.id);
          // Scagliare: the creature it is thrown against, read like the target.
          const [collisionItem]=request.collisionTargetId?await api.scene.items.getItems([request.collisionTargetId]):[];
          if(request.collisionTargetId && !collisionItem) throw new Error("La creatura colpita non è più nella scena: riapri l’azione.");
          if(!scope.isCurrent()) throw new Error("Scena cambiata: riapri la console Boss.");
          plan=buildBossThrowMutation({profile,action,sourceItem:scope.item,targetItem,distance:request.distance,damage:request.damage,landing:request.landing,
            actionInstanceId,round:scope.round,grappledIds,ignoredDefenses:request.ignoredDefenses || [],expectedDefenses:request.expectedDefenses,
            collisionItem:collisionItem || null,collisionOutcome:request.collisionOutcome || "",
            collisionIgnoredDefenses:request.collisionIgnoredDefenses || [],collisionExpectedDefenses:request.collisionExpectedDefenses});
        } else {
          // The grapple rule reads who the boss holds now, across the whole scene.
          const grappledIds=action?.execution?.grapple || action?.execution?.onHit?bossGrappledIds(await api.scene.items.getItems(),scope.item.id):[];
          if(!scope.isCurrent()) throw new Error("Scena cambiata: riapri la console Boss.");
          plan=buildBossActionMutation({...request,profile,action,sourceItem:scope.item,targetItem,actionInstanceId,round:scope.round,
            turnState:scope.turnState,grappledIds});
        }
        // Strappare la Cucitura: the drawings of the seam it tears go once the tear is committed.
        if(group && action.execution.target.area?.shape==="seam")
          plan.seamDrawingIds=[...(bossActiveSeam(bossRuntimeStateForItem(scope.item,profile),scope.round)?.itemIds || [])];
        draft={decisionKey,plan,options:{...plan.options,
          sharedHp:request.sharedHp || {},sceneIdentity:request.sceneIdentity || scope.scene.sceneIdentity,sceneEpoch:scope.epoch}};
        drafts.set(actionInstanceId,draft);
      }
      const plan=draft.plan;
      const result=await runMutation(structuredClone(plan.operations),structuredClone(draft.options));
      try {requireApplied(result);}
      catch(error) {
        if(["conflict","rejected"].includes(result?.status) && result.committed!==true)
          error.message="Lo stato è cambiato prima del commit. Riapri l’azione e verifica bersaglio, esito e risorse.";
        throw error;
      }
      let warnings=[];
      // Post-commit projections run once per damaged creature; they never mutate canonical HP.
      const damaged=group
        ? plan.changes.filter(row=>row.change?.changed).map(row=>({item:targetItems.find(item=>item.id===row.targetId),change:row.change}))
        : [...(plan.change?.changed ? [{item:targetItem,change:plan.change}] : []),...(plan.extraChanges || [])];
      if(result.duplicate!==true && scope.isCurrent()) {
        for(const row of damaged) {
          try {warnings.push(...(await postDamage({item:row.item,change:row.change,result,sceneEpoch:scope.epoch,
            sceneIdentity:scope.scene.sceneIdentity,isCurrent:scope.isCurrent}) || []));}
          catch(error) {warnings.push(String(error?.message || error));}
        }
      }
      if(plan.seamDrawingIds?.length && result.duplicate!==true && scope.isCurrent()) {
        try {warnings.push(...(await removeSeamDrawings({api,sourceId,itemIds:plan.seamDrawingIds,isCurrent:scope.isCurrent}) || []));}
        catch(error) {warnings.push(`Disegno della cucitura non rimosso: ${String(error?.message || error)}`);}
      }
      // An area that collapses later (Hand Slam): its image, from the drawn centre and the round of the action.
      const collapseSpec=group && action.execution.target?.area && result.duplicate!==true
        ? bossCollapseMarkerSpec({profile,action,sourceId,actionInstanceId,round:scope.round,
          center:sanitizeBossAreaPlacement(request.areaPlacement,action.execution.target.area)?.start})
        : null;
      if(collapseSpec && scope.isCurrent()) {
        try {warnings.push(...(await placeCollapseMarker({api,spec:collapseSpec,isCurrent:scope.isCurrent}) || []));}
        catch(error) {warnings.push(`Immagine dell’area non piazzata: ${String(error?.message || error)}`);}
      }
      if(plan.edge && result.duplicate!==true && scope.isCurrent()) {
        try {warnings.push(...(await postEdgeSave({api,edge:plan.edge,sourceName:scope.item.name,activationId:`${actionInstanceId}:edge`,isCurrent:scope.isCurrent}) || []));}
        catch(error) {warnings.push(String(error?.message || error));}
      }
      // Read-only summary fields for the GM; values come from the committed plan, never re-derived.
      draft.result={...result,damageComponents:plan.damageComponents,manualText:plan.manualText,warnings,
        outcome:manualRegistration?"":request.outcome || "",
        target:targetItem?{id:targetItem.id,name:targetItem.name || targetItem.id}:null,
        hpChange:plan.change?{before:plan.change.hp,after:(targetItem?committedHpFor(result,targetItem.id):null) ?? plan.change.afterHP,hpMax:plan.change.hpMax}:null,
        ...(!group && plan.conditions?.length?{conditions:plan.conditions.map(entry=>entry.condition)}:{}),
        ...(!group && plan.drain?{drain:structuredClone(plan.drain)}:{}),
        ...(!group && plan.causality?.markConsumed?{markConsumed:true}:{}),
        ...(!group && plan.causality?.mark?{markRule:true}:{}),
        ...(!group && plan.causality?.targets?.[0]?.evasion==="applied"?{evasion:true}:{}),
        ...(plan.causality?.throw?{throw:structuredClone(plan.causality.throw)}:{}),
        ...(plan.causality?.onHit?{onHit:structuredClone(plan.causality.onHit)}:{}),
        ...(plan.causality?.effectEnd?{effectEnd:{name:plan.effect.name,roll:plan.roll,threshold:plan.causality.effectEnd.threshold,passed:plan.passed}}:{}),
        ...(plan.causality?.seam?{seam:{lengthFeet:plan.causality.seam.lengthFeet,...(plan.causality.seam.segmentsFeet?{segments:plan.causality.seam.segmentsFeet.length}:{})}}:{}),
        ...(plan.causality?.teleport?{teleport:structuredClone(plan.causality.teleport)}:{}),
        ...(plan.seamDrawingIds?{seamTorn:true,...(action.execution.target?.area?.segments?{seamChain:true}:{})}:{}),
        ...(group?{groupTargets:plan.causality.targets.map(target=>({id:target.id,name:target.name || target.id,outcome:target.outcome,
          ...(target.requestedDamage!==undefined?{damage:target.requestedDamage,hpBefore:target.hpBefore,hpAfter:target.hpAfter}:{}),
          conditions:target.conditions.map(condition=>condition.condition),
          ...(target.immune?{immune:true}:{}),...(target.immunityApplied?{immunityApplied:true}:{}),
          ...(target.markRule?{markRule:true}:{}),...(target.alreadyMarked?{alreadyMarked:true}:{}),
          ...(target.evasion==="applied"?{evasion:true}:{}),...(target.inner?{inner:true}:{})}))}:{}),
        resources:structuredClone(plan.options?.history?.payload?.causality?.resources || []),
        historyEntryId:result.historyEntry?.id || null,
        undoAvailable:!result.historyPending && !result.historySkipped && !!result.historyEntry?.id};
      return structuredClone(draft.result);
    } finally {busy.delete(sourceId);}
  }
  async function launchBossActionSpell(request={}) {
    const presentation=await getBossActionPresentation(request.sourceId);
    expectedProfile(request,presentation);
    const action=presentation.profile.abilities.find(a=>a.id===request.actionId);
    if(!["SUPPORTED","PARTIAL"].includes(action?.automation) || action?.execution?.kind!=="spell-reference")
      throw new Error("Questa capacità non ha un riferimento a incantesimi supportato.");
    const availability=presentation.availability[action.id];
    if(!availability.available) throw new Error(availability.reason || "Risorsa esaurita.");
    // The GM picks one of the printed spells; the first one when the request names none (v1-v7: Slow).
    const spellIds=bossSpellReferenceIds(action.execution);
    const spellId=request.spellId ?? spellIds[0];
    if(!spellIds.includes(spellId)) throw new Error("Incantesimo non previsto da questa capacità.");
    const spell=getSpellDefinition(spellId);
    if(!spell) throw new Error("Incantesimo non disponibile nel catalogo: usa il riferimento manuale.");
    const monsterActionContext=createMonsterActionContext({profile:presentation.profile,
      bossInstanceId:presentation.bossInstanceId,tokenId:presentation.item.id,actorName:presentation.item.name,
      action,actionInstanceId:request.actionInstanceId || newId(),spellId});
    if (!monsterActionContext) throw new Error("Provenienza degli incantesimi non valida.");
    const query=buildSpellUnifiedPanelRouteQuery({sourceId:presentation.item.id,casterId:presentation.item.id,
      spellId:spell.id,slotLevel:spell.level,origin:"monster-action",monsterActionContext});
    await api.popover.open({id:`${ID}/spells-modal`,url:`/spell-unified-panel.html?${query}`,
      width:640,height:640,anchorReference:"POSITION",anchorPosition:{left:60,top:60},
      anchorOrigin:{horizontal:"LEFT",vertical:"TOP"},transformOrigin:{horizontal:"LEFT",vertical:"TOP"},
      disableClickAway:true});
    return monsterActionContext;
  }
  return {getBossActionPresentation,bindBossActionProfile,unbindBossActionProfile,restoreBossAuras,listSceneBindings,resetBossActionResources,executeBossAction,launchBossActionSpell,removeStaleBossSeams,
    registerBossActionUse:request=>executeBossAction(request,true)};
}
const runtime=createBossActionRuntime();
export const getBossActionPresentation=(...args)=>runtime.getBossActionPresentation(...args);
export const bindBossActionProfile=(...args)=>runtime.bindBossActionProfile(...args);
export const unbindBossActionProfile=(...args)=>runtime.unbindBossActionProfile(...args);
export const executeBossAction=(...args)=>runtime.executeBossAction(...args);
export const launchBossActionSpell=(...args)=>runtime.launchBossActionSpell(...args);
export const registerBossActionUse=(...args)=>runtime.registerBossActionUse(...args);
export const removeStaleBossSeams=(...args)=>runtime.removeStaleBossSeams(...args);
export const loadBossActionBinding=(item)=>sanitizeBossActionBinding(getInitiativeCard(item).bossActionBinding);
