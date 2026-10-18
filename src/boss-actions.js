import OBR, { buildImage } from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { createSceneLifecycleAdapter } from "./sceneLifecycle.js";
import { importBossActionHTML } from "./bossActionProfileCore.js";
import { createBossActionProfileStore, latestRevision } from "./bossActionProfileStore.js";
import { createBossActionRuntime } from "./bossActionExecution.js";
import { bossAuraId } from "./bossAuraCore.js";
import { bossActionTargets,bossActionGroups,bossActionExecutionKind,bossActionDamageComponents,bossActionAttackSummary,
  validateBossActionSelection,isBossActionSourceItem,bossDamageTypeLabel,bossActionAutomationSummary,bossActionResultSummary,
  bossSelectionTarget,reconcileBossDraftTarget,bossSelectionHint,bossActionRowMeta,bossDamageTotal,bossAbilityLabel,bossPhaseLabel,
  reconcileBossDraftGroup,reconcileBossAreaGroup,bossGroupApplyBlocker,bossGroupRestrictions,validateBossActionGroupSelection,
  bossDefendedDamage,bossConditionDurationText,bossAreaNoun,bossCombatGroups,bossPassiveAbilities,
  bossFeetPerCell,bossInnerTargetIds,bossPointTooClose,bossGroupConfirmationText,bossGroupOutcomes,bossGroupMissingDamageIds,bossAreaTheme,bossPointDistanceFeet,
  validateBossThrowSelection,validateBossEffectEndSelection,bossReachFeet,
  BOSS_ACTIONS_HEIGHT } from "./bossActionsViewCore.js";
import { damageDefensesForItem, relevantDamageDefenses, damageDefenseTag, EVASION_DEFENSE, evasionAppliesTo, evasionForItem, evasionFactor } from "./damageDefensesCore.js";
import { bossActionAreaRuleId,bossAreaShapeLabel,bossGroupRequiresConfirmation,bossTargetImmune,bossGrappledIds,bossGrappleBlocker,bossEffectSummaryParts,
  bossMarkApplies,bossMarkReady,bossTargetMarked,bossMarkBlocker,bossMarkedDefenses,bossTriggerMet,bossActiveEffects,bossThrowDistances,
  bossSeamRuleId,BOSS_SEAM_ITEM_KEY,bossSeamSegments,bossSeamSegmentLabel } from "./bossActionExecutionCore.js";
import { requestSpellAreaPlacement, cancelSpellAreaPlacementRequest, createSpellAreaPlacementRequestId } from "./spellAreaPlacementClient.js";
import { spellTeleportDestinationPosition } from "./spellTeleportCore.js";
import { bossSeamDrawingIds,bossSeamPortalSpecs,bossSeamChainPortalSpecs,BOSS_SEAM_PORTAL_ASSET,BOSS_SEAM_PORTAL_PIXELS,BOSS_SEAM_PORTAL_CELLS } from "./bossSeamPortalCore.js";
import "./popoverDrag.js";

const POPOVER_ID=`${ID}/boss-actions`;
const META_KEY=`${ID}/meta`;
const STATE_KEY=`${ID}/state`;
const DEFAULT_HEIGHT=BOSS_ACTIONS_HEIGHT;
const DRAFT_STORAGE_PREFIX=`${ID}/boss-actions-draft/`;
const MINIMIZED_STORAGE_KEY=`${ID}/boss-actions-minimized`;
const LIST_TAB_STORAGE_KEY=`${ID}/boss-actions-list-tab`;
const capitalize=value=>String(value || "").charAt(0).toUpperCase()+String(value || "").slice(1);

function sessionStore() {
  try {return globalThis.sessionStorage || null;} catch {return null;}
}
function readSession(key) {
  try {return JSON.parse(sessionStore()?.getItem(key) || "null");} catch {return null;}
}
function writeSession(key,value) {
  try {if(value===null)sessionStore()?.removeItem(key);else sessionStore()?.setItem(key,JSON.stringify(value));} catch {}
}

// Undo goes through the existing History, only for the latest confirmed entry (same rule as the HP console).
export async function defaultBossActionUndo(entryId,{epoch}) {
  const [{getHistoryEntries,undoHistoryThrough},{HISTORY_UNDO_OUTCOME,normalizeHistoryUndoResult}]=await Promise.all([
    import("./history.js"),import("./historyUndoResultCore.js")]);
  const entries=await getHistoryEntries();
  if(entries[entries.length-1]?.id!==entryId) return {ok:false,message:"Sono presenti modifiche successive: usa la Cronologia."};
  const outcome=normalizeHistoryUndoResult(await undoHistoryThrough(entryId,{sceneEpoch:epoch}));
  return outcome.outcome===HISTORY_UNDO_OUTCOME.COMMITTED ? {ok:true} : {ok:false,message:"Undo non applicato: verifica la Cronologia."};
}

export function bootBossActions(documentRef=document, overrides={}) {
  const api=overrides.api || OBR;
  const store=overrides.store || createBossActionProfileStore();
  const lifecycle=overrides.lifecycle || createSceneLifecycleAdapter({obr:api});
  const runtime=overrides.runtime || createBossActionRuntime({api,store,
    getEpoch:()=>lifecycle.currentEpoch(),
    isCurrentEpoch:epoch=>lifecycle.isReady() && lifecycle.currentEpoch()===epoch});
  const undoEntry=overrides.undo || defaultBossActionUndo;
  // The shared area tool owns geometry and hit detection; the console only requests a drawing.
  const placeArea=overrides.placeArea || (request=>requestSpellAreaPlacement(request,{broadcast:api.broadcast,windowRef:globalThis.window}));
  const cancelArea=overrides.cancelArea || (requestId=>cancelSpellAreaPlacementRequest(requestId,{broadcast:api.broadcast}));
  const schedule=overrides.schedule || ((callback,delay)=>setTimeout(callback,delay));
  const sourceId=overrides.sourceId ?? new URLSearchParams(globalThis.location?.search || "").get("source");
  const $=id=>documentRef.getElementById(id);
  const status=$("boss-status"),abilities=$("boss-abilities"),resolution=$("boss-resolution"),profileSelect=$("boss-profile");
  const listView=$("boss-list-view"),manageView=$("boss-manage-view"),undoButton=$("boss-undo");
  const toolbar=["boss-import","boss-bind","boss-unbind","boss-export","boss-refresh"].map($).filter(Boolean);
  let presentation=null,targets=[],busy=false,invalidated=false,view="list",draft=null,lastUndo=null;
  let selection={status:"none",target:null,candidates:[]},searchQuery="",minimized=false,restoreHeight=DEFAULT_HEIGHT;
  // Remembered per viewer for this popover session: the combat list or the passive summary.
  let listTab=readSession(LIST_TAB_STORAGE_KEY)==="passives"?"passives":"actions";
  let refreshing=false,refreshPending=false,refreshTimer=null,liveSignature="",selectionSequence=0;
  const unsubscribers=[];
  const node=(tag,text="",className="")=>{const element=documentRef.createElement(tag);element.textContent=text;if(className)element.className=className;return element;};
  const button=(text,className="small")=>{const element=node("button",text,className);element.type="button";return element;};
  const clear=element=>element?.replaceChildren();
  const setStatus=message=>{status.textContent=message;};
  const selectedProfile=()=>store.list()[Number(profileSelect.value)] || null;
  const availabilityFor=action=>presentation?.availability?.[action?.id];
  const available=action=>availabilityFor(action)?.available!==false;
  const targetById=id=>targets.find(item=>item.id===id) || null;
  function toolbarState() {toolbar.forEach(element=>{element.disabled=busy || invalidated || !lifecycle.isReady();});}
  function showUndo(entry) {
    lastUndo=entry?.undoAvailable && entry.historyEntryId ? {historyEntryId:entry.historyEntryId} : null;
    if(undoButton){undoButton.hidden=!lastUndo;undoButton.disabled=busy;}
  }
  async function perform(work) {
    if(busy || invalidated || !lifecycle.isReady()) return;
    const operation=lifecycle.capture();
    busy=true;toolbarState();renderBusy();
    try {await work(operation);}
    catch(error) {
      if(lifecycle.isCurrent(operation)) {
        // A definitive rejection needs a new action identity; an uncertain ACK keeps its draft and identity.
        if(["conflict","rejected"].includes(error?.status) && error.result?.committed!==true && draft) {
          closeDraft({persist:false});
        }
        setStatus(String(error?.message || error));
      }
    }
    finally {
      busy=false;toolbarState();renderBusy();
      // The cleanup buttons are drawn while busy (e.g. the first, asking click): re-enable them now.
      renderCleanup();renderResources();renderAuras();
      if(undoButton)undoButton.disabled=false;
      if(refreshPending)scheduleRefresh();
    }
  }

  // ---- draft persistence: survives a popover reload only while nothing has been sent ----
  const draftStorageKey=()=>DRAFT_STORAGE_PREFIX+sourceId;
  function persistDraft() {
    if(!draft || draft.attempted) {writeSession(draftStorageKey(),null);return;}
    writeSession(draftStorageKey(),{actionId:draft.action.id,profileRevision:presentation?.profile?.profileRevision,
      bossInstanceId:presentation?.bossInstanceId,targetId:draft.targetId,locked:draft.locked,mode:draft.mode,
      outcome:draft.outcome,amounts:draft.amounts,manualConfirmed:draft.manualConfirmed,targetIds:draft.targetIds,outcomes:draft.outcomes,area:draft.area,ignoredDefenses:draft.ignoredDefenses,
      areas:draft.areas,innerIds:draft.innerIds,seamSegments:draft.seamSegments ?? null,targetAmounts:draft.targetAmounts,distance:draft.distance,damage:draft.damage,landing:draft.landing,effect:draft.effect,roll:draft.roll,
      rider:draft.rider,collisionTargetId:draft.collisionTargetId,collisionOutcome:draft.collisionOutcome,seam:draft.seam,sequenceConfirmed:draft.sequenceConfirmed,
      teleport:draft.teleport});
  }
  function restoreDraft() {
    const saved=readSession(draftStorageKey());
    if(!saved || !presentation?.profile || saved.profileRevision!==presentation.profile.profileRevision
      || saved.bossInstanceId!==presentation.bossInstanceId) {writeSession(draftStorageKey(),null);return;}
    const action=presentation.profile.abilities.find(item=>item.id===saved.actionId);
    if(!action) return;
    openAction(action,{restore:saved});
  }

  // ---- header / minimize ----
  function renderHeader() {
    const profile=presentation?.profile;
    $("boss-name").textContent=presentation?.item?.name || profile?.name || "Boss Actions";
    const parts=[];
    if(profile)parts.push(profile.name+" · "+bossPhaseLabel(profile.phaseId));
    if(Number.isSafeInteger(presentation?.round))parts.push("Round "+presentation.round);
    // v19: one Epic Action at the end of each character's turn.
    const slot=presentation?.sequence?.slot;
    if(slot)parts.push(slot.index?`Azione Epica ${slot.index}/${slot.total}${slot.last?" (ultima)":""}`:`Azioni Epiche: ${slot.total}`);
    if(minimized && draft)parts.push(draft.action.name);
    $("boss-phase").textContent=parts.join(" · ");
  }
  async function setMinimized(next) {
    minimized=!!next;
    if(documentRef.body?.dataset)documentRef.body.dataset.minimized=String(minimized);
    const toggle=$("boss-minimize");
    if(toggle){toggle.textContent=minimized?"+":"−";toggle.title=minimized?"Ripristina":"Riduci";toggle.setAttribute("aria-label",toggle.title);toggle.setAttribute("aria-expanded",String(!minimized));}
    writeSession(MINIMIZED_STORAGE_KEY,minimized || null);
    renderHeader();
    try {
      if(minimized) {
        restoreHeight=Number(await api.popover?.getHeight?.(POPOVER_ID)) || restoreHeight;
        const header=documentRef.querySelector?.(".header");
        await api.popover?.setHeight?.(POPOVER_ID,Math.ceil((header?.offsetHeight || 44)+2));
      } else await api.popover?.setHeight?.(POPOVER_ID,restoreHeight || DEFAULT_HEIGHT);
    } catch {}
  }

  // ---- views ----
  function setView(next) {
    view=next;
    listView.hidden=next!=="list";resolution.hidden=next!=="resolve";if(manageView)manageView.hidden=next!=="manage";
  }
  // ---- local library: revision labels, stale binding warning, two-step cleanup ----
  let sceneBindings=[],pendingCleanup=null;
  const sameRevision=(a,b)=>!!a && !!b && a.profileId===b.profileId && a.profileRevision===b.profileRevision;
  const usersOf=profile=>sceneBindings.filter(row=>sameRevision(row,profile));
  function renderLibrary(selected=null) {
    clear(profileSelect);
    const profiles=store.list();
    profiles.forEach((profile,index)=>{
      const users=usersOf(profile);
      const flags=[sameRevision(profile,presentation?.binding)?"collegata qui":users.length?`in uso (${users.length})`:"",
        latestRevision(profile.profileId,profiles)?.profileRevision!==profile.profileRevision?"superata":""].filter(Boolean);
      const option=node("option",`${profile.name} — ${profile.phaseId} · v${profile.profileVersion} · ${profile.profileRevision.slice(0,8)}${flags.length?" · "+flags.join(" · "):""}`);
      option.value=String(index);profileSelect.appendChild(option);
      if(selected?.profileId===profile.profileId && selected.profileRevision===profile.profileRevision) profileSelect.value=String(index);
    });
    const info=$("boss-profile-info");
    if(info)info.textContent=presentation?.profile
      ? `Collegato: ${presentation.profile.name} (${presentation.profile.phaseId}, v${presentation.profile.profileVersion} · ${presentation.profile.profileRevision.slice(0,8)}). ${presentation.profile.abilities.length} capacità, ${presentation.profile.diagnostics?.length || 0} con risoluzione manuale.`
      : "Nessun profilo collegato a questo token.";
    // A token bound to an older revision keeps that revision's rules (e.g. a 1/Phase limit since corrected).
    const warning=$("boss-profile-warning");
    const newest=presentation?.binding?latestRevision(presentation.binding.profileId,profiles):null;
    const stale=!!newest && !sameRevision(newest,presentation.binding);
    if(warning){warning.hidden=!stale;warning.textContent=stale?`Il token usa una revisione superata: è disponibile ${newest.profileRevision.slice(0,8)} (v${newest.profileVersion}). Selezionala e premi «Collega al token» per usare le regole aggiornate.`:"";}
    renderCleanup();renderResources();renderAuras();
  }
  function renderCleanup() {
    const info=$("boss-cleanup-info"),prune=$("boss-prune"),remove=$("boss-delete-revision");
    let stale=[];try{stale=store.supersededRevisions({keep:sceneBindings});}catch{}
    if(prune){prune.textContent=pendingCleanup?.kind==="prune"?`Conferma: elimina ${pendingCleanup.count}`:`Pulisci superate (${stale.length})`;
      prune.classList?.toggle?.("is-confirming",pendingCleanup?.kind==="prune");prune.disabled=busy || !stale.length;}
    if(remove){const confirming=pendingCleanup?.kind==="remove";remove.textContent=confirming?"Conferma eliminazione":"Elimina revisione";
      remove.classList?.toggle?.("is-confirming",confirming);remove.disabled=busy || !store.list().length;}
    if(info)info.textContent=pendingCleanup?.message
      || `${store.list().length} revisioni nella libreria di questo browser. Le revisioni in uso dai token di questa scena non vengono mai eliminate.`;
  }
  function resetCleanup() {if(pendingCleanup){pendingCleanup=null;renderCleanup();}}
  // ---- boss resources: every 1/Round and 1/Phase counter and the mark's per-round use, cleared in one undoable command ----
  let pendingReset=false,pendingAuraRestore=false;
  // Trait auras of the bound profile: on the token, enabled, or missing (removed in the aura editor).
  const auraStateText=aura=>!aura.present?"mancante":aura.enabled?"attiva":"disattivata";
  function renderAuras() {
    const info=$("boss-aura-info"),restore=$("boss-restore-auras");
    const auras=presentation?.auras || [];
    if(info)info.textContent=!presentation?.profile?"Nessun profilo collegato."
      : !auras.length?"Il profilo non definisce aure."
      : `Sul token come aure personalizzate: ${auras.map(aura=>`${aura.name} (${auraStateText(aura)})`).join(", ")}. Si modificano dall’editor delle aure del token.`;
    if(restore){restore.textContent=pendingAuraRestore?"Conferma ripristino":"Ripristina aure";restore.classList?.toggle?.("is-confirming",pendingAuraRestore);
      restore.disabled=busy || !presentation?.profile || !auras.length;}
  }
  function requestAuraRestore() {
    return perform(async operation=>{
      if(!presentation?.profile || !presentation.auras?.length){pendingAuraRestore=false;throw new Error("Il profilo non definisce aure.");}
      if(!pendingAuraRestore) {
        pendingAuraRestore=true;
        setStatus("Riscrivi le aure del profilo sul token? Le modifiche fatte a queste aure nell’editor vanno perse; le altre aure del token restano. Premi di nuovo per confermare.");
        return;
      }
      pendingAuraRestore=false;
      const result=await runtime.restoreBossAuras({sourceId,profileId:presentation.profile.profileId,profileRevision:presentation.profile.profileRevision,
        bossInstanceId:presentation.bossInstanceId,sceneIdentity:presentation.sceneIdentity});
      if(!lifecycle.isCurrent(operation))return;
      const names=[...(result.restored || []),...(result.added || [])];
      setStatus(result.changed?`Aure ripristinate dal profilo: ${names.join(", ")}.`:"Le aure sul token coincidono già con il profilo.");
      await refresh(operation);
    });
  }
  const resetLabel=()=>pendingReset?"Conferma azzeramento":"Azzera risorse";
  function renderResources() {
    const summary=presentation?.usageSummary;
    const info=$("boss-resource-info");
    if(info)info.textContent=!presentation?.profile?"Nessun profilo collegato."
      : !summary?.total?"Nessun uso registrato su questo token."
      : `Usi registrati: ${summary.rounds.length?`round ${summary.rounds.join(", ")}`:"nessun round"}; ${summary.phaseUses} per fase; ${summary.markUses} marchi usati in questo round.${summary.futureRounds.length?" Alcuni round sono successivi al round attuale.":""}`;
    for(const id of ["boss-reset-resources","boss-reset-resources-inline"]) {
      const control=$(id);if(!control)continue;
      control.textContent=resetLabel();control.classList?.toggle?.("is-confirming",pendingReset);
      control.disabled=busy || !presentation?.profile || !summary?.total;
    }
  }
  function requestReset() {
    return perform(async operation=>{
      if(!presentation?.profile || !presentation.usageSummary?.total){pendingReset=false;throw new Error("Nessuna risorsa da azzerare.");}
      if(!pendingReset) {
        pendingReset=true;
        setStatus("Azzeri tutti i contatori 1/Round e 1/Phase e l’uso del marchio di questo token (ad esempio per un nuovo combattimento)? Premi di nuovo per confermare: l’azione è annullabile dalla Cronologia.");
        return;
      }
      pendingReset=false;
      const result=await runtime.resetBossActionResources({sourceId,profileId:presentation.profile.profileId,profileRevision:presentation.profile.profileRevision,
        bossInstanceId:presentation.bossInstanceId,sceneIdentity:presentation.sceneIdentity});
      if(!lifecycle.isCurrent(operation))return;
      setStatus(`Risorse azzerate${result.rounds?.length?`: round ${result.rounds.join(", ")}`:""}${result.phaseUses?`, ${result.phaseUses} usi per fase`:""}.`);
      showUndo(result);
      await refresh(operation);
    });
  }
  async function loadSceneBindings() {
    try {
      if(typeof runtime.listSceneBindings==="function"){sceneBindings=await runtime.listSceneBindings();return;}
    } catch {}
    sceneBindings=presentation?.binding?[{tokenId:sourceId,name:presentation.item?.name || sourceId,...presentation.binding}]:[];
  }
  function selectionLine() {
    const line=node("div","","target-line");
    line.appendChild(node("span","Bersaglio","caption"));
    const target=selection.status==="single"?selection.target:null;
    const name=node("span",target?target.name || target.id:bossSelectionHint(selection.status),"target-name"+(target?"":" is-empty"));
    line.appendChild(name);
    if(target)line.appendChild(node("span",hpText(target),"target-hp"));
    line.id="boss-selection-line";
    return line;
  }
  const defensesOf=id=>damageDefensesForItem(targetById(id),META_KEY);
  const ignoredFor=id=>draft?.ignoredDefenses?.[id] || [];
  // Boss mark (cold-ward-break): ready while the target is marked and the rule is unused this round.
  const hasCold=()=>bossActionDamageComponents(draft?.action).some(component=>component.type==="cold");
  const markReadyFor=id=>!!draft && hasCold() && bossMarkReady(targetById(id),presentation?.profile,presentation?.item,presentation?.round);
  // Evasion (Rogue, from the Actor Profile class build) on DEX saves that halve damage; ignorable per resolution.
  const evasionFor=id=>!!draft && evasionAppliesTo(draft.action.execution) && evasionForItem(targetById(id),META_KEY);
  const evasionUsedFor=id=>evasionFor(id) && !ignoredFor(id).includes(EVASION_DEFENSE);
  const outcomeFactor=(outcome,id)=>{
    if(outcome==="miss" || (outcome==="passed" && draft?.action?.execution?.success==="none")) return "zero";
    const base=outcome==="passed"?"half":"full";
    return id && evasionUsedFor(id)?evasionFactor(base):base;
  };
  // Divine Brilliance: each attack of the group has its own damage roll.
  const attackGroup=()=>draft?.kind==="group-save" && draft.action.execution?.kind==="attack-damage";
  const amountsFor=id=>attackGroup()?(draft.targetAmounts?.[id] || {}):draft.amounts;
  const markAppliesFor=(id,outcome)=>!!draft && bossMarkApplies({profile:presentation?.profile,sourceItem:presentation?.item,targetItem:targetById(id),
    round:presentation?.round,components:bossActionDamageComponents(draft.action),amounts:amountsFor(id),factor:outcomeFactor(outcome,id)});
  // Meteor Swarm: an inner-scoped component reaches only the creatures kept "within" a drawn point.
  const componentsFor=id=>bossActionDamageComponents(draft.action).filter(component=>!component.scope || (draft.innerIds || []).includes(id));
  function defendedDamage(id,outcome) {
    return bossDefendedDamage(componentsFor(id),amountsFor(id),outcome,defensesOf(id),ignoredFor(id),markReadyFor(id),evasionUsedFor(id));
  }
  function markBadge(id) {
    if(!draft || !bossTargetMarked(targetById(id),presentation?.profile)) return null;
    const ready=markReadyFor(id);
    const badge=node("small",ready?"Marchio":"Marchio (usato)","mark-badge"+(ready?"":" is-spent"));
    badge.title=ready?"Marchio: in questa risoluzione il freddo ignora la Resistenza e l'Immunità vale come Resistenza (una volta per round)."
      :hasCold()?"Marchio già usato in questo round: le difese al freddo valgono normalmente.":"Marchiato dal boss.";
    return badge;
  }
  // Actor Profile defenses relevant to this action; a click ignores one for this resolution only (explicit, locks the draft).
  function defenseChips(id,onChange) {
    const effective=markReadyFor(id)?bossMarkedDefenses(defensesOf(id)):defensesOf(id);
    const rows=relevantDamageDefenses(effective,bossActionDamageComponents(draft.action),ignoredFor(id));
    if(evasionFor(id))rows.push({type:EVASION_DEFENSE,defense:"evasion",ignored:ignoredFor(id).includes(EVASION_DEFENSE)});
    if(!rows.length) return null;
    const wrap=node("span","","defense-chips");wrap.dataset.defensesFor=id;
    for(const row of rows) {
      const chip=button(row.type===EVASION_DEFENSE?"Elusione":damageDefenseTag(row),"defense-chip");chip.dataset.defenseType=row.type;
      chip.setAttribute("aria-pressed",String(!row.ignored));chip.disabled=busy;
      chip.title=row.ignored?"Ignorata in questa risoluzione: clic per riapplicarla":"Dal profilo attore: clic per ignorarla in questa risoluzione";
      chip.addEventListener("click",event=>{
        event.stopPropagation?.();
        if(!draft || busy) return;
        const current=new Set(ignoredFor(id));
        if(current.has(row.type))current.delete(row.type);else current.add(row.type);
        draft.ignoredDefenses={...draft.ignoredDefenses,[id]:[...current]};
        lockDraft();onChange();persistDraft();
      });
      wrap.appendChild(chip);
    }
    return wrap;
  }
  function hpText(item) {
    const meta=item?.metadata?.[META_KEY] || {};
    return Number.isFinite(meta.hp) && Number.isFinite(meta.hpMax) ? `${meta.hp}/${meta.hpMax} PF` : "";
  }
  function actionRow(action) {
    const meta=bossActionRowMeta(action,availabilityFor(action));
    const row=button("","action-row"+(meta.exhausted?" is-exhausted":""));row.dataset.actionId=action.id;
    const text=node("span");text.append(node("span",action.name,"action-name"),node("span",meta.tag,"action-tag"));
    row.appendChild(text);
    if(meta.badge){const badge=node("span",meta.badge,"badge"+(meta.exhausted?" is-exhausted":""));row.appendChild(badge);}
    // A sequence or hit point block names its reason; a spent counter keeps the generic text.
    const blockReason=availabilityFor(action)?.sequenceBlocked || availabilityFor(action)?.hpGated ? availabilityFor(action)?.reason : "";
    row.title=blockReason?`${blockReason} Consultabile, non eseguibile.`:meta.exhausted?"Esaurita: consultabile, non eseguibile":action.name;
    row.addEventListener("click",()=>{if(!busy && !invalidated)openAction(action);});
    return row;
  }
  function renderList() {
    clear(abilities);
    if(!presentation?.binding){abilities.appendChild(node("p","Nessun profilo collegato a questo token. Usa «Gestisci profilo» per importarlo e collegarlo.","muted"));return;}
    if(!presentation.profile){abilities.appendChild(node("p","Definizione non presente su questo browser: importa il profilo JSON della stessa revisione da «Gestisci profilo».","muted"));return;}
    abilities.appendChild(selectionLine());
    const stale=presentation.usageSummary?.futureRounds || [];
    if(stale.length) {
      // Uses after the current round can only come from an earlier combat or a round reset.
      const warning=node("div","","note warning resource-warning");warning.id="boss-resource-warning";
      warning.appendChild(node("span",`Usi registrati nei round ${stale.join(", ")}, oltre il round attuale ${presentation.round}: restano da un combattimento precedente e bloccano le azioni. Se è un nuovo combattimento, azzera le risorse.`));
      const reset=button(resetLabel(),"small"+(pendingReset?" is-confirming":""));reset.id="boss-reset-resources-inline";reset.disabled=busy;
      reset.addEventListener("click",()=>{void requestReset();});warning.appendChild(reset);
      abilities.appendChild(warning);
    }
    renderSequenceNotes();
    // A reaction with an HP trigger (Divine Brilliance): the console reminds it while the boss is below the threshold.
    for(const action of presentation.profile.abilities.filter(entry=>entry.execution?.trigger && available(entry) && bossTriggerMet(entry,presentation.item))) {
      const warning=node("div","","note warning trigger-warning");warning.id="boss-trigger-warning";
      warning.appendChild(node("span",`${presentation.item?.name || "Il boss"} è sotto ${action.execution.trigger.hpBelow} PF (${presentation.item?.metadata?.[META_KEY]?.hp}): ${action.name} si innesca, se la Reazione è disponibile.`));
      // Drawn during a refresh (busy): never disabled here, the click checks busy itself.
      const openTrigger=button("Apri","small");openTrigger.id="boss-trigger-open";
      openTrigger.addEventListener("click",()=>{if(!busy && !invalidated)openAction(action);});warning.appendChild(openTrigger);
      abilities.appendChild(warning);
    }
    // Two spaces: combat abilities (by manifestation, then reactions) and the passive traits summary.
    const groups=bossCombatGroups(presentation.profile),passives=bossPassiveAbilities(presentation.profile);
    const combatCount=groups.reduce((sum,group)=>sum+group.abilities.length,0);
    if(listTab==="passives" && !passives.length)listTab="actions";
    const tabs=node("div","","segmented list-tabs");tabs.id="boss-list-tabs";tabs.setAttribute("role","tablist");
    for(const [value,label] of [["actions",`Azioni (${combatCount})`],["passives",`Passive (${passives.length})`]]) {
      const tab=button(label,"");tab.id=`boss-tab-${value}`;tab.dataset.listTab=value;tab.setAttribute("role","tab");
      tab.setAttribute("aria-selected",String(listTab===value));tab.setAttribute("aria-pressed",String(listTab===value));
      tab.disabled=value==="passives" && !passives.length;
      tab.addEventListener("click",()=>{if(listTab===value)return;listTab=value;writeSession(LIST_TAB_STORAGE_KEY,value);renderList();});
      tabs.appendChild(tab);
    }
    abilities.appendChild(tabs);
    if(listTab==="passives") {
      const list=node("div","","passive-list");list.id="boss-passives";list.setAttribute("role","tabpanel");
      passives.forEach(passive=>{
        const item=node("article","","passive");item.dataset.passiveId=passive.id;
        const title=node("h3",passive.name,"passive-name");
        // A trait that runs as a custom aura on the token says so (and whether it is still there).
        const keys=(presentation.profile.abilities.find(entry=>entry.id===passive.id)?.auras || []).map(aura=>bossAuraId(presentation.profile,aura.key));
        const states=keys.map(id=>(presentation.auras || []).find(aura=>aura.id===id)).filter(Boolean);
        if(keys.length) {
          const working=states.length===keys.length && states.every(aura=>aura.present && aura.enabled);
          const tag=node("span",working?"Aura sul token":"Aura non attiva","aura-tag"+(working?"":" is-off"));
          tag.title=states.map(aura=>`${aura.name}: ${auraStateText(aura)}`).join(" · ") || "Collega di nuovo il profilo o usa «Ripristina aure».";
          title.appendChild(tag);
        }
        item.append(title,node("p",passive.text,"passive-text"));list.appendChild(item);
      });
      abilities.appendChild(list);
      return;
    }
    if(combatCount>8) {
      const search=node("input","","search");search.id="boss-action-search";search.type="search";search.placeholder="Cerca azione…";
      search.setAttribute("aria-label","Cerca azione");search.value=searchQuery;
      search.addEventListener("input",()=>{searchQuery=search.value;renderListRows();});
      abilities.appendChild(search);
    }
    const rows=node("div","","action-groups");rows.id="boss-action-rows";rows.setAttribute("role","tabpanel");abilities.appendChild(rows);
    function renderListRows() {
      const q=searchQuery.trim().toLocaleLowerCase(),visible=action=>!q || action.name.toLocaleLowerCase().includes(q);
      clear(rows);
      for(const group of groups) {
        const shown=group.abilities.filter(visible);if(!shown.length)continue;
        const section=node("section","","action-group");section.dataset.group=group.key;
        section.appendChild(node("h3",group.label,"action-group-title"));
        const list=node("div","","action-list");shown.forEach(action=>list.appendChild(actionRow(action)));
        section.appendChild(list);rows.appendChild(section);
      }
      if(!rows.childElementCount)rows.appendChild(node("p","Nessuna azione corrisponde alla ricerca.","muted"));
    }
    renderListRows();
  }

  // ---- Epic Action sequence (profile v19) ----
  const sequenceWarning=action=>presentation?.sequence?.warnings?.[action?.id] || "";
  const actionName=id=>presentation?.profile?.abilities.find(entry=>entry.id===id)?.name || id;
  function renderSequenceNotes() {
    const sequence=presentation?.sequence;
    if(!sequence) return;
    const seam=sequence.seam;
    if(seam) {
      const seamAction=presentation.profile.abilities.find(entry=>entry.id===seam.actionId);
      const tear=presentation.profile.abilities.find(entry=>entry.sequence?.after===seam.actionId);
      const blocked=(seamAction?.execution?.seam?.blocks || []).map(actionName);
      const note=node("p",`Cucitura attiva (${seam.lengthFeet} ft) fino alla fine del round ${seam.round}${blocked.length?`: ${blocked.join(", ")} bloccat${blocked.length===1?"o":"i"}`:""}${tear?`; ${tear.name} come ultima Azione Epica.`:"."}${seam.itemIds?.length?"":" Il disegno non è sulla mappa."}`,"note seam-note");
      note.id="boss-seam-note";abilities.appendChild(note);
    }
    if(sequence.staleSeamItemIds?.length) {
      const warning=node("div","","note warning seam-warning");warning.id="boss-seam-warning";
      warning.appendChild(node("span","Una cucitura non più attiva è ancora disegnata sulla mappa."));
      const remove=button("Rimuovi","small");remove.id="boss-remove-seams";
      remove.addEventListener("click",()=>{if(busy || invalidated)return;void perform(async operation=>{
        const result=await runtime.removeStaleBossSeams({sourceId,profileId:presentation.binding?.profileId,profileRevision:presentation.binding?.profileRevision,bossInstanceId:presentation.bossInstanceId});
        if(!lifecycle.isCurrent(operation))return;
        setStatus(result.removed.length?"Cucitura rimossa dalla mappa.":"Nessuna cucitura da rimuovere.");await refresh(operation);
      });});
      warning.appendChild(remove);abilities.appendChild(warning);
    }
  }
  // A seam drawing of this boss that was never applied (redrawn, or the draft closed): removed by exact id.
  async function dropSeamDrawing(ids) {
    const list=(Array.isArray(ids)?ids:[]).filter(Boolean);
    if(!list.length) return;
    try {
      const items=await api.scene.items.getItems(list);
      const own=items.filter(item=>item?.metadata?.[BOSS_SEAM_ITEM_KEY]?.sourceId===sourceId).map(item=>item.id);
      if(own.length)await api.scene.items.deleteItems(own);
    } catch {}
  }
  // Cucitura: a void portal on the Props layer at each end of the seam, attached to the seam drawing. Returns the
  // ids that were added; a failure leaves the seam without portals (the seam itself is unaffected).
  async function addSeamPortals(specs) {
    if(!specs.length) return [];
    const size=BOSS_SEAM_PORTAL_PIXELS;
    const url=new URL(BOSS_SEAM_PORTAL_ASSET,String(globalThis.location?.origin || "http://localhost")).href;
    try {
      const items=specs.map(spec=>buildImage({width:size,height:size,url,mime:"image/webp"},{dpi:size/BOSS_SEAM_PORTAL_CELLS,offset:{x:size/2,y:size/2}})
        .id(spec.id).position(spec.position).attachedTo(spec.attachedTo).layer("PROP").locked(true).disableHit(true)
        .disableAttachmentBehavior(["ROTATION","SCALE"]).visible(true).name(spec.name).metadata(spec.metadata).build());
      await api.scene.items.addItems(items);
      return specs.map(spec=>spec.id);
    } catch {return [];}
  }
  // "Last Epic Action of the round": a warning the GM confirms when the initiative order says otherwise.
  function sequenceStep(form) {
    const warning=sequenceWarning(draft.action);
    if(!warning) return;
    const step=node("div","","manual-step sequence-step");step.id="boss-sequence-step";
    const label=node("label");const input=node("input");input.type="checkbox";input.id="boss-sequence-confirmed";input.checked=!!draft.sequenceConfirmed;
    input.addEventListener("change",()=>{draft.sequenceConfirmed=input.checked;lockDraft();renderDraftState();persistDraft();});
    const text=node("span",`È l’ultima Azione Epica del round. ${warning}`);text.title=warning;
    label.append(input,text);step.appendChild(label);form.appendChild(step);
  }
  const sequenceBlocker=()=>sequenceWarning(draft?.action) && !draft.sequenceConfirmed?"Conferma che è l’ultima Azione Epica del round.":"";
  // Cucitura del Non-Luogo: the GM draws the seam; the drawing stays on the map and the seam is recorded at Apply.
  function renderSeamResolution() {
    const action=draft.action,seam=action.execution.seam;
    const form=node("form");form.id="boss-action-form";form.className="view";
    form.appendChild(node("p",seam.points
      ? `${seam.points-1} cuciture larghe ${seam.width} ft fra ${seam.points} punti entro ${seam.range} ft · fino a ${seam.maxLength} ft ciascuna · fino alla fine del round · prima Azione Epica del round`
      : `Cucitura larga ${seam.width} ft fra due punti entro ${seam.range} ft · lunga al massimo ${seam.maxLength} ft · fino alla fine del round · prima Azione Epica del round`,"stat-line"));
    const blocked=seam.blocks.map(actionName);
    const tear=presentation?.profile?.abilities.find(entry=>entry.sequence?.after===action.id);
    form.appendChild(node("p",[blocked.length?`Finché esiste blocca ${blocked.join(", ")}.`:"",tear?`${tear.name} la usa come ultima Azione Epica del round.`:""].filter(Boolean).join(" "),"note"));
    const areaStep=node("div","","area-step");areaStep.id="boss-seam-step";
    const label=node("span","","area-label");label.id="boss-seam-label";
    const draw=button("","small");draw.id="boss-draw-seam";const cancel=button("Annulla disegno","small");cancel.id="boss-cancel-seam";
    draw.addEventListener("click",()=>{void drawSeam();});
    cancel.addEventListener("click",()=>{if(draft?.drawing)void cancelArea(draft.drawing).catch(()=>{});});
    areaStep.append(label,draw,cancel);
    // Cucitura Spezzata: a partial chain can be started again from the first point.
    if(seam.points) {
      const restart=button("Ricomincia","small");restart.id="boss-restart-seam";areaStep.appendChild(restart);
      restart.addEventListener("click",()=>{if(!draft || busy || draft.drawing || !draft.seam)return;void dropSeamDrawing(draft.seam.itemIds);draft.seam=null;
        setStatus("Cuciture annullate: ricomincia dal punto A.");renderSpecialState();persistDraft();});
    }
    form.appendChild(areaStep);
    form.appendChild(manualRulesBlock("A mano: "+action.manualText));
    applyRow(form,"Applica",submitSeam);
    resolution.appendChild(form);
    renderSpecialState();
  }
  async function drawSeam() {
    if(!draft || busy || draft.drawing || draft.kind!=="seam") return;
    if(draft.action.execution.seam.points) return drawSeamSegment();
    const active=draft,operation=lifecycle.capture(),seam=active.action.execution.seam;
    const requestId=createSpellAreaPlacementRequestId();
    const itemId=`boss-seam-${globalThis.crypto?.randomUUID?.() || Date.now().toString(36)+Math.random().toString(36).slice(2)}`;
    active.drawing=requestId;lockDraft();renderSpecialState();
    setStatus(`Disegna la cucitura: trascina dal primo punto al secondo (al massimo ${seam.maxLength} ft), poi «Conferma sagoma». Esc annulla.`);
    const restore=!minimized;
    if(restore)await setMinimized(true);
    const theme=bossAreaTheme(presentation?.profile);
    let result;
    try {result=await placeArea({ruleId:bossSeamRuleId(seam),casterId:sourceId,requestId,context:{phase:"boss-action",actionId:active.action.id,...(theme?{areaTheme:theme}:{}),
      keepOnMap:{id:itemId,name:active.action.name,metadata:{[BOSS_SEAM_ITEM_KEY]:{sourceId,actionInstanceId:active.binding.actionInstanceId}}}}});}
    catch(error) {result={status:"error",error:String(error?.message || error)};}
    if(restore && minimized)await setMinimized(false);
    if(draft!==active || active.drawing!==requestId || !lifecycle.isCurrent(operation) || invalidated) {void dropSeamDrawing(bossSeamDrawingIds(itemId));return;}
    active.drawing=null;
    if(result?.status==="confirmed" && result.preview) {
      const start={x:Number(result.preview.start?.x),y:Number(result.preview.start?.y)},end={x:Number(result.preview.end?.x),y:Number(result.preview.end?.y)};
      // The length on the scene grid, in whole cells (5 ft each when the grid scale is unknown).
      let lengthFeet=null;
      try {
        const [dpi,scale]=await Promise.all([api.scene.grid.getDpi(),api.scene.grid.getScale()]);
        const feetPerCell=bossFeetPerCell(scale);
        if(dpi>0)lengthFeet=Math.round(bossPointDistanceFeet(start,end,dpi,feetPerCell || 5)/(feetPerCell || 5))*(feetPerCell || 5);
      } catch {}
      if(draft!==active || !lifecycle.isCurrent(operation)) return;
      const portalIds=await addSeamPortals(bossSeamPortalSpecs({itemId,sourceId,actionInstanceId:active.binding.actionInstanceId,start,end,name:active.action.name}));
      if(draft!==active || !lifecycle.isCurrent(operation)) return;
      const previous=active.seam?.itemIds || [];
      active.seam={start,end,lengthFeet:Math.min(seam.maxLength,Math.max(0,lengthFeet ?? 0)),itemIds:[itemId,`${itemId}-geometry`,...portalIds]};
      if(previous.length)void dropSeamDrawing(previous);
      setStatus(`Cucitura disegnata: ${active.seam.lengthFeet} ft. Premi «Applica» per registrarla.`);
    } else {
      setStatus(result?.status==="cancelled"?"Disegno annullato: nessuna modifica.":`Disegno non riuscito${result?.error?": "+result.error:""}.`);
    }
    renderSpecialState();persistDraft();
  }
  const seamLetter=index=>String.fromCharCode(65+index);
  const samePoint=(a,b)=>!!a && !!b && Math.abs(Number(a.x)-Number(b.x))<0.5 && Math.abs(Number(a.y)-Number(b.y))<0.5;
  // Cucitura Spezzata (v22): the chain is drawn one segment at a time. Each segment starts where the previous one
  // ended and reaches up to the printed length.
  async function drawSeamSegment() {
    const active=draft,operation=lifecycle.capture(),seam=active.action.execution.seam,count=seam.points;
    // A complete chain is drawn again from point A.
    if(active.seam?.points?.length===count){void dropSeamDrawing(active.seam.itemIds);active.seam=null;}
    const drawn=active.seam?structuredClone(active.seam):{baseId:`boss-seam-${globalThis.crypto?.randomUUID?.() || Date.now().toString(36)+Math.random().toString(36).slice(2)}`,
      points:[],segmentsFeet:[],segmentIds:[],itemIds:[]};
    const index=drawn.segmentsFeet.length,budget=seam.maxLength;
    const segmentId=`${drawn.baseId}-s${index+1}`,from=index?drawn.points[index]:null;
    const requestId=createSpellAreaPlacementRequestId();
    active.drawing=requestId;lockDraft();renderSpecialState();
    setStatus(`Cucitura ${index+1}/${count-1}: trascina ${from?`dal punto ${seamLetter(index)} (già fissato)`:"dal punto A"} verso il punto ${seamLetter(index+1)} (al massimo ${budget} ft), poi «Conferma sagoma». Esc annulla.`);
    const restore=!minimized;
    if(restore)await setMinimized(true);
    const theme=bossAreaTheme(presentation?.profile);
    let result;
    try {result=await placeArea({ruleId:`boss-action-area:line:${budget}ft:${seam.width}ft`,casterId:sourceId,requestId,context:{phase:"boss-action",actionId:active.action.id,
      ...(theme?{areaTheme:theme}:{}),...(from?{lineStart:from}:{}),
      keepOnMap:{id:segmentId,name:`${active.action.name} ${seamLetter(index)}–${seamLetter(index+1)}`,metadata:{[BOSS_SEAM_ITEM_KEY]:{sourceId,actionInstanceId:active.binding.actionInstanceId,segment:index}}}}});}
    catch(error) {result={status:"error",error:String(error?.message || error)};}
    if(restore && minimized)await setMinimized(false);
    const segmentIds=[segmentId,`${segmentId}-geometry`];
    if(draft!==active || active.drawing!==requestId || !lifecycle.isCurrent(operation) || invalidated) {void dropSeamDrawing(segmentIds);return;}
    active.drawing=null;
    if(result?.status==="confirmed" && result.preview) {
      const start={x:Number(result.preview.start?.x),y:Number(result.preview.start?.y)},end={x:Number(result.preview.end?.x),y:Number(result.preview.end?.y)};
      let lengthFeet=null;
      try {
        const [dpi,scale]=await Promise.all([api.scene.grid.getDpi(),api.scene.grid.getScale()]);
        const feetPerCell=bossFeetPerCell(scale);
        if(dpi>0)lengthFeet=Math.round(bossPointDistanceFeet(start,end,dpi,feetPerCell || 5)/(feetPerCell || 5))*(feetPerCell || 5);
      } catch {}
      if(draft!==active || !lifecycle.isCurrent(operation)) {void dropSeamDrawing(segmentIds);return;}
      lengthFeet=Math.min(budget,Math.max(0,lengthFeet ?? 0));
      if(!(lengthFeet>0) || (from && !samePoint(start,from)) || samePoint(start,end)) {
        void dropSeamDrawing(segmentIds);
        setStatus(from && !samePoint(start,from)?`La cucitura non parte dal punto ${seamLetter(index)}: disegnala di nuovo.`:"Lunghezza della cucitura non leggibile: disegnala di nuovo.");
        renderSpecialState();persistDraft();return;
      }
      drawn.points=index?[...drawn.points,end]:[start,end];
      drawn.segmentsFeet=[...drawn.segmentsFeet,lengthFeet];
      drawn.segmentIds=[...drawn.segmentIds,segmentId];
      drawn.itemIds=[...drawn.itemIds,...segmentIds];
      drawn.lengthFeet=drawn.segmentsFeet.reduce((sum,value)=>sum+value,0);
      drawn.start=drawn.points[0];drawn.end=drawn.points[drawn.points.length-1];
      const complete=drawn.points.length===count;
      if(complete) {
        const portalIds=await addSeamPortals(bossSeamChainPortalSpecs({baseId:drawn.baseId,segmentIds:drawn.segmentIds,sourceId,
          actionInstanceId:active.binding.actionInstanceId,points:drawn.points,name:active.action.name}));
        drawn.itemIds=[...drawn.itemIds,...portalIds];
        if(draft!==active || !lifecycle.isCurrent(operation)) {void dropSeamDrawing(drawn.itemIds);return;}
      }
      active.seam=drawn;
      setStatus(complete?`Cuciture disegnate: ${count-1} tratti, ${drawn.lengthFeet} ft in tutto. Premi «Applica» per registrarle.`
        :`Cucitura ${seamLetter(index)}–${seamLetter(index+1)}: ${lengthFeet} ft. Disegna la successiva.`);
    } else {
      setStatus(result?.status==="cancelled"?"Disegno annullato: nessuna modifica.":`Disegno non riuscito${result?.error?": "+result.error:""}.`);
    }
    renderSpecialState();persistDraft();
  }
  function seamBlocker() {
    if(!available(draft.action)) return availabilityFor(draft.action)?.reason || "Non disponibile.";
    if(draft.drawing) return "Completa o annulla il disegno.";
    const chain=draft.action.execution.seam.points;
    if(chain && (draft.seam?.points?.length || 0)<chain) return `Disegna tutte le cuciture (${Math.max(0,(draft.seam?.points?.length || 1)-1)}/${chain-1}).`;
    if(!draft.seam) return "Disegna la cucitura sulla mappa.";
    if(!(draft.seam.lengthFeet>0)) return "Lunghezza della cucitura non leggibile: ridisegnala.";
    return "";
  }
  function submitSeam() {
    if(!draft || busy || draft.kind!=="seam") return;
    const reason=seamBlocker();
    if(reason){setStatus(reason);return;}
    const active=draft,seam=structuredClone(draft.seam);
    return perform(async operation=>{
      active.attempted=true;active.locked=true;persistDraft();
      const result=await runtime.executeBossAction({sourceId,actionId:active.action.id,seam,...active.binding});
      if(!lifecycle.isCurrent(operation))return;
      setStatus(`${active.action.name}: ${bossActionResultSummary(result) || "registrata"}.${result.undoAvailable?"":result.historyPending?" History in attesa di conferma: non ripetere l’azione.":" Verifica la Cronologia per annullare."}${result.manualText?"\nManuale: "+result.manualText:""}`);
      showUndo(result);
      if(draft===active)closeDraft({persist:false});
      await refresh(operation);
    });
  }

  // ---- resolution ----
  function newDraft(action) {
    return {action,kind:bossActionExecutionKind(action),targetId:null,locked:false,mode:action.execution?.attack?.modes?.[0] || "",
      outcome:"",targetIds:[],outcomes:{},targetAmounts:{},distance:null,damage:"",landing:"",effect:null,roll:"",rider:"",collisionTargetId:"",collisionOutcome:"",seam:null,sequenceConfirmed:false,teleport:null,teleportReach:null,groupSuggestion:null,area:null,areas:[],innerIds:[],drawing:null,ignoredDefenses:{},amounts:Object.fromEntries(bossActionDamageComponents(action).map(component=>[component.id,String(component.defaultAmount)])),
      manualConfirmed:false,picker:false,attempted:false,
      binding:{profileId:presentation.profile.profileId,profileRevision:presentation.profile.profileRevision,
        bossInstanceId:presentation.bossInstanceId,sceneIdentity:presentation.sceneIdentity,
        actionInstanceId:"boss-action:"+(globalThis.crypto?.randomUUID?.() || Date.now().toString(36)+":"+Math.random().toString(36).slice(2))}};
  }
  function lockDraft() {if(draft && !draft.locked){draft.locked=true;}}
  function openAction(action,{restore=null}={}) {
    draft=newDraft(action);
    if(restore)Object.assign(draft,{targetId:restore.targetId ?? null,locked:!!restore.locked,mode:restore.mode || draft.mode,
      outcome:restore.outcome || "",amounts:{...draft.amounts,...(restore.amounts || {})},manualConfirmed:!!restore.manualConfirmed,
      targetIds:Array.isArray(restore.targetIds)?[...restore.targetIds]:[],outcomes:{...(restore.outcomes || {})},area:restore.area || null,ignoredDefenses:{...(restore.ignoredDefenses || {})},
      areas:Array.isArray(restore.areas)?structuredClone(restore.areas):[],innerIds:Array.isArray(restore.innerIds)?[...restore.innerIds]:[],
      ...(Array.isArray(restore.seamSegments)?{seamSegments:restore.seamSegments.filter(Number.isInteger)}:{}),
      targetAmounts:restore.targetAmounts && typeof restore.targetAmounts==="object"?structuredClone(restore.targetAmounts):{},
      distance:restore.distance ?? null,damage:restore.damage ?? "",landing:restore.landing || "",effect:restore.effect || null,roll:restore.roll ?? "",
      rider:restore.rider || "",collisionTargetId:restore.collisionTargetId || "",collisionOutcome:restore.collisionOutcome || "",
      seam:restore.seam && typeof restore.seam==="object"?structuredClone(restore.seam):null,sequenceConfirmed:restore.sequenceConfirmed===true,
      teleport:Number.isFinite(restore.teleport?.x) && Number.isFinite(restore.teleport?.y)?{x:restore.teleport.x,y:restore.teleport.y}:null});
    else applySelectionToDraft();
    setView("resolve");renderResolution();persistDraft();renderHeader();
    resolution.querySelector?.("[data-autofocus]")?.focus?.();
    void readSelection();
  }
  function closeDraft({persist=true,focusAction=true}={}) {
    const actionId=draft?.action?.id;
    if(draft?.drawing)void cancelArea(draft.drawing).catch(()=>{});
    if(draft?.kind==="seam" && draft.seam && !draft.attempted)void dropSeamDrawing(draft.seam.itemIds);
    draft=null;clear(resolution);resolution.classList?.remove?.("is-group");setView("list");if(persist)persistDraft();else writeSession(draftStorageKey(),null);
    renderList();renderHeader();
    if(focusAction && actionId)[...abilities.querySelectorAll("button")].find(row=>row.dataset.actionId===actionId)?.focus?.();
  }
  function applySelectionToDraft() {
    if(draft?.kind==="group-save" && !busy) {
      const next=draft.action.execution.target?.selection==="area" ? reconcileBossAreaGroup({...draft,area:areaDrawn()?draft.area || draft.areas:null},selection) : reconcileBossDraftGroup(draft,selection);
      draft.targetIds=next.targetIds;draft.groupSuggestion=next.suggestion;
      return;
    }
    if(!draft || busy || !["attack-damage","save-damage","throw"].includes(draft.kind)) return;
    const next=reconcileBossDraftTarget(draft,selection);
    draft.targetId=next.targetId;draft.suggestion=next.suggestion;draft.candidates=next.candidates;
    // Hurl: without a map selection, the only creature the boss holds is the target.
    if(draft.kind==="throw" && !draft.targetId){const held=bossGrappledIds(targets,sourceId);if(held.length===1)draft.targetId=held[0];}
  }
  function chooseTarget(id,{explicit=true}={}) {
    if(!draft || busy) return;
    const changed=draft.targetId && draft.targetId!==id;
    draft.targetId=id;draft.picker=false;draft.suggestion=null;draft.candidates=[];
    // An explicit retarget keeps typed damage but never carries a hit/save outcome to another creature.
    if(changed && draft.outcome){draft.outcome="";setStatus("Bersaglio cambiato: scegli di nuovo l’esito.");}
    if(explicit)lockDraft();
    renderTargetBox();renderDecisions();persistDraft();
  }
  function renderTargetBox() {
    if(draft?.kind==="group-save") return renderGroupTargets();
    const box=resolution.querySelector?.("#boss-target-box");
    if(!box || !draft) return;
    clear(box);
    const target=targetById(draft.targetId);
    const line=node("div","","target-line");
    line.appendChild(node("span","Bersaglio","caption"));
    const hint=draft.targetId?"Bersaglio non più nel tracker.":draft.candidates?.length?bossSelectionHint("multiple")
      :selection.status==="single"?"Scegli il bersaglio.":bossSelectionHint(selection.status) || bossSelectionHint("none");
    const name=node("span",target?target.name || target.id:hint,"target-name"+(target?"":" is-empty"));
    name.id="boss-target-name";line.appendChild(name);
    if(target)line.appendChild(node("span",hpText(target),"target-hp"));
    let chips=target?defenseChips(target.id,()=>{renderTargetBox();renderDraftState();}):null;
    const mark=target?markBadge(target.id):null;
    if(mark){if(!chips){chips=node("span","","defense-chips");chips.dataset.defensesFor=target.id;}chips.appendChild(mark);}
    const change=button(draft.picker?"Chiudi":"Cambia");change.id="boss-target-change";change.disabled=busy;
    change.addEventListener("click",()=>{if(!draft || busy)return;draft.picker=!draft.picker;renderTargetBox();});
    line.appendChild(change);box.appendChild(line);
    if(chips){const defenses=node("div","","target-line");defenses.id="boss-target-defenses";defenses.append(node("span","Difese","caption"),chips);box.appendChild(defenses);}
    const choices=draft.picker?targets:draft.candidates?.length?draft.candidates:[];
    if(draft.suggestion && !draft.picker) {
      const offer=node("div","","target-line");offer.appendChild(node("span",`Selezione mappa: ${draft.suggestion.name || draft.suggestion.id}`,"muted"));
      const use=button("Usa questo");use.id="boss-target-use-selection";use.disabled=busy;
      use.addEventListener("click",()=>chooseTarget(draft.suggestion.id));offer.appendChild(use);box.appendChild(offer);
    }
    if(choices.length) {
      const list=node("div","","target-choices");list.id="boss-target-choices";
      choices.forEach(item=>{
        const choice=button(`${item.name || item.id}${hpText(item)?" · "+hpText(item):""}`);choice.dataset.targetId=item.id;choice.disabled=busy;
        choice.setAttribute("aria-pressed",String(draft.targetId===item.id));
        choice.addEventListener("click",()=>chooseTarget(item.id));list.appendChild(choice);
      });
      box.appendChild(list);
      const names=choices.map(item=>item.name || item.id);
      if(new Set(names).size<names.length)box.appendChild(node("p","Nomi uguali: seleziona un solo token sulla mappa.","muted"));
    } else if(draft.picker) box.appendChild(node("p","Nessuna creatura nel tracker.","muted"));
  }
  function segmented(id,className,options,current,onChoose) {
    const group=node("div","","segmented "+className);group.id=id;group.setAttribute("role","group");
    options.forEach(([value,label],index)=>{
      const choice=button(label,"");choice.dataset[className==="mode"?"mode":"outcome"]=value;
      choice.setAttribute("aria-pressed",String(current===value));choice.disabled=busy;
      if(index===0 && className==="outcome")choice.dataset.autofocus="true";
      choice.addEventListener("click",()=>{if(!busy)onChoose(value);});group.appendChild(choice);
    });
    return group;
  }
  function renderDecisions() {
    if(!draft) return;
    if(draft.kind==="group-save") return renderGroupState();
    if(["throw","effect-end","seam"].includes(draft.kind)) return renderSpecialState();
    for(const group of resolution.querySelectorAll(".segmented")) {
      for(const choice of group.children) {
        const value=choice.dataset.mode ?? choice.dataset.outcome;
        if(value===undefined) continue;
        const current=choice.dataset.mode!==undefined?draft.mode:draft.outcome;
        choice.setAttribute("aria-pressed",String(current===value));choice.disabled=busy;
      }
    }
    resolution.querySelectorAll("[data-component-id]").forEach(input=>{input.disabled=busy || draft.outcome==="miss" || noDamageOutcome();});
    const confirm=$("boss-manual-confirmed");if(confirm){confirm.checked=draft.manualConfirmed;confirm.disabled=busy;}
    // Arto che Precede il Corpo: the chosen effect shows only on a hit.
    const hitChoice=$("boss-hit-choice");if(hitChoice)hitChoice.hidden=draft.outcome!=="hit";
    resolution.querySelectorAll("[data-hit-rider]").forEach(choice=>{choice.setAttribute("aria-pressed",String(draft.rider===choice.dataset.hitRider));choice.disabled=busy;});
    renderDraftState();
  }
  function renderBusy() {if(draft && view==="resolve"){renderTargetBox();renderDecisions();}}
  function renderDraftState() {
    if(!draft || view!=="resolve") return;
    if(draft.kind==="group-save") return renderGroupState();
    if(["throw","effect-end","seam"].includes(draft.kind)) return renderSpecialState();
    const total=$("boss-total");
    if(total && ["attack-damage","save-damage"].includes(draft.kind)) {
      const amount=noDamageOutcome()?0:draft.targetId?defendedDamage(draft.targetId,draft.outcome):bossDamageTotal(bossActionDamageComponents(draft.action),draft.amounts,draft.outcome);
      clear(total);total.append("Totale ",node("strong",String(amount)),noDamageOutcome()?" (nessun danno)":draft.outcome==="passed"?" (metà)":draft.outcome==="miss"?" (mancato)":"");
      if(draft.action.execution.drain && draft.outcome==="hit" && draft.targetId) {
        const necrotic=bossDefendedDamage(bossActionDamageComponents(draft.action).filter(component=>component.id===draft.action.execution.drain.component),
          draft.amounts,"hit",defensesOf(draft.targetId),ignoredFor(draft.targetId));
        total.append(` · boss +${necrotic} PF`);
      }
    }
    const apply=$("boss-apply");
    if(apply) {
      const reason=applyBlocker();
      apply.disabled=busy || !!reason;apply.title=reason || "Applica";
      const hint=$("boss-apply-hint");if(hint)hint.textContent=busy?"Applicazione in corso…":reason;
    }
    resolution.querySelectorAll?.("[data-resource-commit]").forEach(element=>{if(element!==apply)element.disabled=busy || !available(draft.action);});
    renderTeleportState();
  }
  // ---- Il Corpo Non Era Qui (v21): the destination of the boss's teleport, as with Misty Step ----
  function teleportStep(teleport) {
    const wrap=node("div");
    const step=node("div","","area-step");step.id="boss-teleport-step";
    const label=node("span","","area-label");label.id="boss-teleport-label";
    const pick=button("","small");pick.id="boss-pick-teleport";
    const cancel=button("Annulla","small");cancel.id="boss-cancel-teleport";
    pick.addEventListener("click",()=>{void pickTeleport(teleport);});
    cancel.addEventListener("click",()=>{if(draft?.drawing)void cancelArea(draft.drawing).catch(()=>{});});
    step.append(label,pick,cancel);
    const warning=node("p","","note warning");warning.id="boss-teleport-warning";warning.hidden=true;
    wrap.append(step,warning);
    return wrap;
  }
  function renderTeleportState() {
    const teleport=draft?.action?.execution?.teleport;
    const label=$("boss-teleport-label");
    if(!teleport || !label) return;
    const boss=presentation?.item?.name || "Il boss";
    label.textContent=draft.drawing?`Sulla mappa: clicca la casella d'arrivo entro ${teleport.range} ft (Esc annulla).`
      :draft.teleport?`Destinazione scelta: ${boss} si teletrasporta all'Applica.`:`1 · Dove si teletrasporta ${boss} (entro ${teleport.range} ft).`;
    const pick=$("boss-pick-teleport"),cancel=$("boss-cancel-teleport");
    if(pick){pick.textContent=draft.teleport?"Cambia":"Scegli destinazione";pick.disabled=busy || !!draft.drawing || !available(draft.action);}
    if(cancel){cancel.hidden=!draft.drawing;cancel.disabled=busy;}
    void checkTeleportReach();
    const warning=$("boss-teleport-warning");
    if(warning) {
      const reach=draft.teleportReach,range=draft.action.execution.target.range;
      const show=!!reach && reach.targetId===draft.targetId && reach.ok===false;
      warning.hidden=!show;
      warning.textContent=show?`${targetById(draft.targetId)?.name || "Il bersaglio"} non è entro ${range} ft dallo spazio lasciato né da quello d'arrivo: verifica sulla mappa.`:"";
    }
  }
  // A warning, never a block: the creature must be within range of the space left or the one reached.
  async function checkTeleportReach() {
    const active=draft,destination=active?.teleport,targetId=active?.targetId,range=active?.action?.execution?.target?.range;
    if(!destination || !targetId || !range) return;
    const key=`${targetId}|${destination.x}|${destination.y}`;
    if(active.teleportReach?.key===key || active.teleportReachPending===key) return;
    active.teleportReachPending=key;
    try {
      const [dpi,scale,bossBounds,targetBounds]=await Promise.all([api.scene.grid.getDpi(),api.scene.grid.getScale(),
        api.scene.items.getItemBounds([sourceId]),api.scene.items.getItemBounds([targetId])]);
      const position=presentation?.item?.position;
      const dx=Number(destination.x)-Number(position?.x),dy=Number(destination.y)-Number(position?.y);
      if(!Number.isFinite(dx) || !Number.isFinite(dy)) return;
      const arrived={min:{x:bossBounds.min.x+dx,y:bossBounds.min.y+dy},max:{x:bossBounds.max.x+dx,y:bossBounds.max.y+dy}};
      const feetPerCell=bossFeetPerCell(scale);
      const reaches=[bossReachFeet(bossBounds,targetBounds,dpi,feetPerCell),bossReachFeet(arrived,targetBounds,dpi,feetPerCell)].filter(value=>value!==null);
      if(draft!==active || !reaches.length) return;
      active.teleportReach={key,targetId,ok:Math.min(...reaches)<=range};
      renderTeleportState();
    } catch {} finally {if(active.teleportReachPending===key)active.teleportReachPending=null;}
  }
  async function pickTeleport(teleport) {
    if(!draft || busy || draft.drawing || !draft.action.execution?.teleport) return;
    const active=draft,operation=lifecycle.capture(),requestId=createSpellAreaPlacementRequestId();
    active.drawing=requestId;lockDraft();renderDraftState();
    setStatus(`Clicca sulla mappa la casella d'arrivo di ${presentation?.item?.name || "boss"} (entro ${teleport.range} ft). Esc annulla.`);
    const restore=!minimized;
    if(restore)await setMinimized(true);
    const theme=bossAreaTheme(presentation?.profile);
    let result;
    try {result=await placeArea({ruleId:`boss-action-area:teleport:${teleport.range}ft`,casterId:sourceId,requestId,
      // One click picks the cell (aligned to the boss's footprint) and confirms it, like Blink's return.
      context:{phase:"boss-action",actionId:active.action.id,pointSelection:true,directPointSelection:true,autoConfirmPoint:true,...(theme?{areaTheme:theme}:{})}});}
    catch(error) {result={status:"error",error:String(error?.message || error)};}
    if(restore && minimized)await setMinimized(false);
    if(draft!==active || active.drawing!==requestId || !lifecycle.isCurrent(operation) || invalidated) return;
    active.drawing=null;
    const destination=result?.status==="confirmed"?spellTeleportDestinationPosition(result.preview):null;
    if(destination) {
      active.teleport=destination;active.teleportReach=null;
      setStatus(`Destinazione scelta: ${presentation?.item?.name || "il boss"} si teletrasporta all'Applica.`);
    } else setStatus(result?.status==="cancelled"?"Scelta annullata: nessuna modifica.":`Destinazione non scelta${result?.error?": "+result.error:""}.`);
    renderDraftState();persistDraft();
  }
  function applyBlocker() {
    if(!draft) return "";
    if(!available(draft.action)) return availabilityFor(draft.action)?.reason || "Risorsa esaurita.";
    if(draft.action.execution?.teleport) {
      if(draft.drawing) return "Completa o annulla la scelta della destinazione.";
      if(!draft.teleport) return "Scegli dove si teletrasporta il boss.";
    }
    if(!targetById(draft.targetId)) return "Seleziona il bersaglio.";
    const grapple=bossGrappleBlocker(draft.action,draft.targetId,bossGrappledIds(targets,sourceId))
      || bossMarkBlocker(draft.action,targetById(draft.targetId),presentation?.profile);
    if(grapple) return grapple;
    if(!draft.outcome) return draft.kind==="attack-damage"?"Scegli Colpito o Mancato.":"Scegli l’esito del tiro salvezza.";
    if(draft.kind==="attack-damage" && draft.outcome==="hit" && draft.action.execution.onHit) {
      if(!draft.action.execution.onHit.choices.some(choice=>choice.id===draft.rider)) return "Scegli l’effetto del colpo.";
      if(draft.rider==="grab" && bossGrappledIds(targets,sourceId).length) return "Il boss tiene già una creatura Afferrata.";
    }
    if(manualPrerequisite(draft.action) && !draft.manualConfirmed) return "Conferma il prerequisito.";
    return "";
  }
  // Titan's Grasp: a passed save means no damage at all.
  const noDamageOutcome=()=>draft?.kind==="save-damage" && draft.outcome==="passed" && draft.action.execution.success==="none";
  const manualPrerequisite=action=>bossActionExecutionKind(action)==="attack-damage" && !action.execution?.drain && !action.execution?.onHit && !action.sequence && action.automation==="PARTIAL" && !!String(action.manualText || "").trim();
  function manualRulesBlock(text) {
    const details=node("details","","details manual-rules");
    details.append(node("summary","Regole e verifiche del DM"),node("pre",text));
    return details;
  }
  function detailsBlock(action) {
    const details=node("details","","details");details.id="boss-action-details";
    details.appendChild(node("summary","Dettagli e testo originale"));
    const automation=bossActionAutomationSummary(action,availabilityFor(action));
    if(automation)details.appendChild(node("pre",automation.automatic+"\n"+automation.manual));
    details.appendChild(node("pre",action.rawText));
    return details;
  }
  function resolveHead(action) {
    const head=node("div","","resolve-head");
    const back=button("←","icon-button");back.id="boss-back";back.title="Torna alle azioni";back.setAttribute("aria-label","Torna alle azioni");
    back.addEventListener("click",()=>{if(!busy)closeDraft({persist:false});});
    head.appendChild(back);
    const title=node("h2",action.name,"title");title.id="boss-action-title";head.appendChild(title);
    const meta=bossActionRowMeta(action,availabilityFor(action));
    if(meta.badge){const badge=node("span",meta.badge,"badge"+(meta.exhausted?" is-exhausted":""));badge.id="boss-resource-badge";head.appendChild(badge);}
    return head;
  }
  function renderResolution() {
    clear(resolution);
    if(!draft) return;
    const action=draft.action;
    resolution.appendChild(resolveHead(action));
    if(draft.kind==="spell-reference") {
      // One button per printed spell (v8); a v1-v7 profile lists Slow alone. Area, targets and saves go to the spell panel.
      const spells=Array.isArray(action.execution.spells)?action.execution.spells:[{spellId:action.execution.spellId,name:"lentezza"}];
      resolution.appendChild(node("p",`CD ${action.execution.saveDC} · attacco +${action.execution.attackBonus}. Area, bersagli e TS si risolvono nel pannello incantesimi; l’uso 1/round viene registrato solo alla risoluzione.`,"note"));
      const list=node("div","","spell-choices");list.id="boss-spells";
      spells.forEach((spell,index)=>{
        const label=capitalize(spell.name)+(spell.atWill?" · a volontà":spell.perDay?` · ${spell.perDay}/giorno`:"");
        const cast=button(label,"apply secondary");cast.id=`boss-cast-${spell.spellId}`;cast.dataset.spellId=spell.spellId;cast.dataset.resourceCommit="true";
        if(index===0)cast.dataset.autofocus="true";
        cast.disabled=busy || !available(action);
        cast.addEventListener("click",()=>{
          if(!available(action) || busy)return;
          return perform(async operation=>{
            await runtime.launchBossActionSpell({sourceId,actionId:action.id,spellId:spell.spellId,...draft.binding});
            if(lifecycle.isCurrent(operation))setStatus(`Pannello ${capitalize(spell.name)} aperto: scegli area e bersagli e risolvi lì.`);
          });
        });
        list.appendChild(cast);
      });
      resolution.appendChild(list);
      resolution.appendChild(node("p","Limiti per giorno: verificali tu, non vengono contati.","note"));
      resolution.appendChild(detailsBlock(action));renderDraftState();return;
    }
    if(draft.kind==="group-save") return renderGroupResolution();
    if(draft.kind==="throw") return renderThrowResolution();
    if(draft.kind==="effect-end") return renderEffectEndResolution();
    if(draft.kind==="seam") return renderSeamResolution();
    if(!["attack-damage","save-damage"].includes(draft.kind)) {
      resolution.appendChild(node("pre",action.rawText,"reference-text"));
      // Every manual combat ability can record its use (History, Combat Log); a 1/Round or 1/Phase one also spends its counter.
      if(action.automation==="UNSUPPORTED" && ["epic-action","action","reaction"].includes(action.category)) {
        const counted=action.usage?.limit===1 && ["round","phase"].includes(action.usage?.period);
        const step=node("div","","manual-step");const label=node("label");
        const input=node("input");input.type="checkbox";input.id="boss-manual-confirmed";
        input.addEventListener("change",()=>{draft.manualConfirmed=input.checked;renderDraftState();});
        label.append(input,node("span","Ho risolto manualmente l’abilità e verificato le restrizioni."));step.appendChild(label);resolution.appendChild(step);
        const row=node("div","","apply-row");row.appendChild(node("span",counted?"Registra solo l’uso: nessun effetto automatico.":"Registra l’uso in Cronologia e Combat Log: nessun effetto automatico, nessun contatore.","total"));
        const register=button("Registra uso","apply secondary");register.id="boss-register";register.dataset.resourceCommit="true";register.disabled=busy || !available(action);
        register.addEventListener("click",()=>{
          if(!available(action) || busy)return;
          if(!draft.manualConfirmed){setStatus("Conferma la risoluzione manuale prima di registrare l’uso.");return;}
          return perform(async operation=>{
            draft.attempted=true;persistDraft();
            const result=await runtime.registerBossActionUse({sourceId,actionId:action.id,manualConfirmed:true,...draft.binding});
            if(!lifecycle.isCurrent(operation))return;
            setStatus(`Uso registrato: ${action.name}.`);showUndo(result);
            closeDraft({persist:false});await refresh(operation);
          });
        });
        row.appendChild(register);resolution.appendChild(row);
      } else resolution.appendChild(node("p","Riferimento manuale: nessun effetto automatico.","note"));
      renderDraftState();return;
    }
    const form=node("form");form.id="boss-action-form";form.className="view";
    const targetBox=node("div","","target-box");targetBox.id="boss-target-box";form.appendChild(targetBox);
    const execution=action.execution;
    if(execution.teleport)form.appendChild(teleportStep(execution.teleport));
    if(draft.kind==="attack-damage") {
      form.appendChild(node("p",bossActionAttackSummary(action).replace(" (verifica manuale)",""),"stat-line"));
      if(execution.attack.modes.length>1)form.appendChild(segmented("boss-mode","mode",execution.attack.modes.map(value=>[value,value==="melee"?"Mischia":"Distanza"]),draft.mode,
        value=>{draft.mode=value;lockDraft();renderDecisions();persistDraft();}));
    } else {
      const failed=(execution.onFailed?.conditions || []).map(entry=>`${entry.condition}${entry.escapeDC?` (fuga CD ${entry.escapeDC})`:""}`).join(" e ");
      form.appendChild(node("p",[`TS ${bossAbilityLabel(execution.save.ability)} CD ${execution.save.dc}`,...(execution.target.range?[`entro ${execution.target.range} ft.`]:[]),
        execution.success==="none"?"nessun danno su successo":"metà danni su successo",...(failed?[`${failed} sui falliti`]:[]),
        ...(execution.grapple==="hold"?["solo la creatura Afferrata dal boss, che resta Afferrata e Trattenuta"]:[])].join(" · "),"stat-line"));
    }
    form.appendChild(segmented("boss-outcome","outcome",draft.kind==="attack-damage"?[["hit","Colpito"],["miss","Mancato"]]:[["failed","TS fallito"],["passed","TS superato"]],draft.outcome,
      value=>{draft.outcome=value;lockDraft();renderTargetBox();renderDecisions();persistDraft();}));
    if(draft.kind==="attack-damage" && execution.onHit) {
      const labels={pull:choice=>`Trascinare · ${choice.distance} ft`,grab:choice=>`Afferrare · CD ${choice.escapeDC}`};
      const pick=choiceGroup("boss-hit-rider","Sul colpo",execution.onHit.choices.map(choice=>[choice.id,labels[choice.id](choice)]),"hitRider",value=>{
        draft.rider=value;lockDraft();renderDecisions();persistDraft();
      });
      pick.id="boss-hit-choice";pick.hidden=draft.outcome!=="hit";form.appendChild(pick);
    }
    const damage=node("div","","damage-list");damage.id="boss-damage";
    for(const component of bossActionDamageComponents(action)) {
      const row=node("label","","damage-row");
      row.append(node("span",capitalize(bossDamageTypeLabel(component.type)),"damage-type"),
        node("span",`${component.formula} · ${component.printedAverage!==undefined?"media "+component.printedAverage:"calc. "+component.average}`,"damage-formula"));
      const input=node("input");input.type="number";input.min="0";input.max="1000000";input.step="1";input.inputMode="numeric";
      input.value=draft.amounts[component.id] ?? "";input.dataset.componentId=component.id;
      input.setAttribute("aria-label",`Danni ${bossDamageTypeLabel(component.type)}`);
      input.addEventListener("input",()=>{draft.amounts[component.id]=input.value;lockDraft();renderDraftState();renderTargetBox();persistDraft();});
      row.appendChild(input);damage.appendChild(row);
    }
    form.appendChild(damage);
    if(execution.printedTotalAverage!==undefined) {
      const components=bossActionDamageComponents(action);
      form.appendChild(node("p",`Totale stampato ${execution.printedTotalAverage}; medie calcolate ${components.map(c=>c.defaultAmount).join(" + ")} = ${components.reduce((sum,c)=>sum+Number(c.defaultAmount || 0),0)}. Nessuna ripartizione automatica del resto.`,"note"));
    }
    if(execution.drain && String(action.manualText || "").trim()) {
      form.appendChild(manualRulesBlock("A mano: "+action.manualText));
    }
    if(manualPrerequisite(action)) {
      const step=node("div","","manual-step");const label=node("label");
      const input=node("input");input.type="checkbox";input.id="boss-manual-confirmed";input.checked=draft.manualConfirmed;
      input.addEventListener("change",()=>{draft.manualConfirmed=input.checked;lockDraft();renderDraftState();renderTargetBox();persistDraft();});
      label.append(input,node("span","Prerequisito soddisfatto: "+action.manualText));step.appendChild(label);form.appendChild(step);
    } else if(draft.kind==="save-damage" && String(action.manualText || "").trim() && execution.grapple!=="hold") {
      // Crush's text is already in the stat line; Titan's Grasp mixes a check before rolling with an effect;
      // the teleport's remainder (a free space, the target's distance) is checked before, not on a failure.
      const before=execution.grapple==="grab" || execution.teleport;
      form.appendChild(manualRulesBlock((before?"A mano: ":"Manuale su TS fallito: ")+action.manualText));
    }
    form.appendChild(detailsBlock(action));
    const row=node("div","","apply-row");
    const totals=node("div","","total");const total=node("div");total.id="boss-total";const hint=node("div","","");hint.id="boss-apply-hint";
    totals.append(total,hint);row.appendChild(totals);
    const apply=button("Applica","apply");apply.type="submit";apply.id="boss-apply";apply.dataset.resourceCommit="true";row.appendChild(apply);
    form.appendChild(row);
    form.addEventListener("submit",event=>{event.preventDefault?.();return submitDraft();});
    resolution.appendChild(form);
    renderTargetBox();renderDecisions();
  }
  // ---- Hurl (the creature the boss holds) and Epic Resistance (an effect on the boss), profile v16 ----
  const heldIds=()=>bossGrappledIds(targets,sourceId);
  const throwComponent=()=>bossActionDamageComponents(draft.action)[0];
  // The printed average per step, times the steps of the chosen distance (3 per 10 ft for Hurl).
  // A flat throw (Scagliare) counts one step whatever the distance.
  const throwSteps=distance=>draft.action.execution.distance.step?Math.round(Number(distance)/draft.action.execution.distance.step):1;
  const throwAverage=distance=>{const component=throwComponent();
    return Number.isInteger(component?.defaultAmount)?component.defaultAmount*throwSteps(distance):"";};
  const throwFormula=distance=>{const component=throwComponent();const match=String(component?.formula || "").match(/^(\d+)d(\d+)$/);
    return match?`${Number(match[1])*throwSteps(distance)}d${match[2]}`:component?.formula || "";};
  function throwBlocker() {
    if(!available(draft.action)) return availabilityFor(draft.action)?.reason || "Risorsa esaurita.";
    if(!targetById(draft.targetId)) return heldIds().length?"Seleziona la creatura Afferrata dal boss.":"Il boss non tiene nessuna creatura Afferrata.";
    if(!heldIds().includes(draft.targetId)) return "Il bersaglio deve essere Afferrato dal boss.";
    const execution=draft.action.execution;
    if(execution.distance.step && !draft.distance) return "Scegli la distanza del lancio.";
    const amount=Number(draft.damage);
    if(String(draft.damage ?? "").trim()==="" || !Number.isInteger(amount) || amount<0) return "Inserisci i danni del lancio.";
    if(execution.edge && !draft.landing) return "Scegli dove atterra il bersaglio.";
    if(draft.collisionTargetId && draft.collisionTargetId===draft.targetId) return "La creatura colpita deve essere un’altra.";
    if(draft.collisionTargetId && !["failed","passed"].includes(draft.collisionOutcome)) return "Scegli l’esito del TS della creatura colpita.";
    return "";
  }
  const effectsOnBoss=()=>bossActiveEffects(presentation?.item);
  const effectKey=entry=>entry?`${entry.kind}:${entry.instanceId}`:"";
  function effectEndBlocker() {
    if(!effectsOnBoss().length) return "Nessun effetto attivo sul boss.";
    if(!effectsOnBoss().some(entry=>effectKey(entry)===effectKey(draft.effect))) return "Scegli l’effetto da terminare.";
    const die=draft.action.execution.roll.die,value=Number(draft.roll);
    if(String(draft.roll ?? "").trim()==="" || !Number.isInteger(value) || value<1 || value>die) return `Inserisci il risultato del d${die} (1–${die}).`;
    return "";
  }
  function renderSpecialState() {
    if(!draft) return;
    // One selector at a time (the test DOM has no selector lists).
    const all=selectors=>selectors.flatMap(selector=>[...resolution.querySelectorAll(selector)]);
    all(["[data-throw-distance]","[data-throw-landing]","[data-effect-key]","[data-collision-target]","[data-collision-outcome]"]).forEach(choice=>{
      const current=choice.dataset.throwDistance!==undefined?String(draft.distance || ""):choice.dataset.throwLanding!==undefined?draft.landing
        :choice.dataset.collisionTarget!==undefined?draft.collisionTargetId || "":choice.dataset.collisionOutcome!==undefined?draft.collisionOutcome:effectKey(draft.effect);
      const value=choice.dataset.throwDistance ?? choice.dataset.throwLanding ?? choice.dataset.collisionTarget ?? choice.dataset.collisionOutcome ?? choice.dataset.effectKey;
      choice.setAttribute("aria-pressed",String(current===value));
      // The thrown creature cannot be the one it is thrown against.
      choice.disabled=busy || (choice.dataset.collisionTarget!==undefined && !!choice.dataset.collisionTarget && choice.dataset.collisionTarget===draft.targetId);
    });
    const collisionSave=$("boss-collision-save");if(collisionSave)collisionSave.hidden=!draft.collisionTargetId;
    all(["[data-throw-damage]","[data-effect-roll]"]).forEach(input=>{input.disabled=busy;});
    const formula=$("boss-throw-formula");
    if(formula && draft.kind==="throw"){const label=capitalize(bossDamageTypeLabel(throwComponent().type));
      formula.textContent=draft.distance || !draft.action.execution.distance.step?`${label} ${throwFormula(draft.distance)}`:label;}
    const total=$("boss-total");
    if(total && draft.kind==="throw") {
      const amount=draft.targetId?bossDefendedDamage([throwComponent()],{[throwComponent().id]:draft.damage},"hit",defensesOf(draft.targetId),ignoredFor(draft.targetId)):0;
      clear(total);total.append("Totale ",node("strong",String(amount)),draft.landing==="edge"?" · oltre il bordo":draft.landing==="platform"?" · Prono":"");
      const hit=targetById(draft.collisionTargetId);
      if(hit && draft.collisionOutcome==="failed")total.append(` · ${hit.name || hit.id} −${bossDefendedDamage([throwComponent()],{[throwComponent().id]:draft.damage},"hit",defensesOf(hit.id),ignoredFor(hit.id))} e Prono`);
      else if(hit && draft.collisionOutcome==="passed")total.append(` · ${hit.name || hit.id} illeso`);
    }
    if(draft.kind==="seam" && draft.action.execution.seam.points) {
      const chain=draft.action.execution.seam.points,segments=Math.max(0,(draft.seam?.points?.length || 1)-1),complete=segments===chain-1;
      const label=$("boss-seam-label"),draw=$("boss-draw-seam"),cancel=$("boss-cancel-seam"),restart=$("boss-restart-seam");
      if(label)label.textContent=draft.drawing?"Sulla mappa: trascina fino al punto successivo, poi «Conferma sagoma» (Esc annulla)."
        :complete?`Cuciture disegnate: ${segments} tratti, ${draft.seam.lengthFeet} ft in tutto.`
        :segments?`Cuciture ${segments}/${chain-1}: ${draft.seam.segmentsFeet.join(" + ")} ft.`
        :`Traccia ${chain-1} cuciture fra ${chain} punti, uno dopo l’altro.`;
      if(draw){draw.textContent=complete?"Ridisegna":segments?`Disegna cucitura ${segments+1}/${chain-1}`:"Disegna cuciture";draw.disabled=busy || !!draft.drawing || !available(draft.action);}
      if(cancel){cancel.hidden=!draft.drawing;cancel.disabled=busy;}
      if(restart){restart.hidden=!segments || complete || !!draft.drawing;restart.disabled=busy;}
      if(total){clear(total);if(complete)total.append("Cuciture ",node("strong",`${draft.seam.lengthFeet} ft`)," fino a fine round");}
    } else if(draft.kind==="seam") {
      const label=$("boss-seam-label"),draw=$("boss-draw-seam"),cancel=$("boss-cancel-seam");
      if(label)label.textContent=draft.drawing?"Sulla mappa: dal primo punto al secondo, poi «Conferma sagoma» (Esc annulla).":draft.seam?`Cucitura disegnata: ${draft.seam.lengthFeet} ft.`:"Traccia la cucitura fra i due punti.";
      if(draw){draw.textContent=draft.seam?"Ridisegna":"Disegna cucitura";draw.disabled=busy || !!draft.drawing || !available(draft.action);}
      if(cancel){cancel.hidden=!draft.drawing;cancel.disabled=busy;}
      if(total){clear(total);if(draft.seam)total.append("Cucitura ",node("strong",`${draft.seam.lengthFeet} ft`)," fino a fine round");}
    }
    if(total && draft.kind==="effect-end") {
      const chosen=effectsOnBoss().find(entry=>effectKey(entry)===effectKey(draft.effect));
      const value=Number(draft.roll),threshold=draft.action.execution.roll.threshold;
      clear(total);
      if(chosen && Number.isInteger(value) && value>=1)total.append(node("strong",value>=threshold?"Riuscita":"Fallita"),` · ${chosen.name} ${value>=threshold?"termina":"resta"}`);
    }
    const apply=$("boss-apply");
    if(apply) {
      const reason=draft.kind==="throw"?throwBlocker():draft.kind==="seam"?seamBlocker():effectEndBlocker();
      apply.disabled=busy || !!reason;apply.title=reason || apply.textContent;
      const hint=$("boss-apply-hint");if(hint)hint.textContent=busy?"Applicazione in corso…":reason;
    }
  }
  function applyRow(form,label,onSubmit) {
    form.appendChild(detailsBlock(draft.action));
    const row=node("div","","apply-row");
    const totals=node("div","","total");const total=node("div");total.id="boss-total";const hint=node("div","","");hint.id="boss-apply-hint";
    totals.append(total,hint);row.appendChild(totals);
    const apply=button(label,"apply");apply.type="submit";apply.id="boss-apply";apply.dataset.resourceCommit="true";row.appendChild(apply);
    form.appendChild(row);
    form.addEventListener("submit",event=>{event.preventDefault?.();return onSubmit();});
  }
  function choiceGroup(id,label,options,dataName,onChoose) {
    const wrap=node("div","","decision");wrap.appendChild(node("span",label,"caption"));
    const group=node("div","","segmented choices");group.id=id;group.setAttribute("role","group");group.setAttribute("aria-label",label);
    for(const [value,text] of options) {
      const choice=button(text,"");choice.dataset[dataName]=value;choice.addEventListener("click",()=>{if(!busy)onChoose(value);});group.appendChild(choice);
    }
    wrap.appendChild(group);return wrap;
  }
  function renderThrowResolution() {
    const action=draft.action,execution=action.execution;
    // The creature the boss holds is the only valid target: picked at once when it is the only one.
    if(!draft.targetId && heldIds().length===1)draft.targetId=heldIds()[0];
    const form=node("form");form.id="boss-action-form";form.className="view";
    const damageLabel=bossDamageTypeLabel(execution.damage[0].type);
    form.appendChild(node("p",execution.distance.step
      ? `Lancia la creatura Afferrata fino a ${execution.distance.max} ft · ${execution.damage[0].formula} ${damageLabel} ogni ${execution.distance.step} ft · Prono sulla piattaforma, TS DES CD ${execution.edge.save.dc} oltre il bordo`
      : `Lancia la creatura Afferrata fino a ${execution.distance.max} ft · ${execution.damage[0].formula} ${damageLabel} · sempre Prono${execution.collision?` · contro un’altra creatura: TS DES CD ${execution.collision.save.dc}`:""}`,"stat-line"));
    const targetBox=node("div","","target-box");targetBox.id="boss-target-box";form.appendChild(targetBox);
    // A flat throw starts from the printed average; a stepped one waits for the distance.
    if(!execution.distance.step && !draft.damage)draft.damage=String(throwAverage(execution.distance.max));
    if(!execution.edge)draft.landing="platform";
    if(execution.distance.step)form.appendChild(choiceGroup("boss-throw-distance","Distanza",bossThrowDistances(execution).map(value=>[String(value),`${value} ft`]),"throwDistance",value=>{
      const previousAverage=draft.distance?String(throwAverage(draft.distance)):"";
      draft.distance=Number(value);
      // The suggested damage follows the distance until the GM types a roll.
      if(!draft.damage || draft.damage===previousAverage)draft.damage=String(throwAverage(value));
      const input=resolution.querySelector?.("[data-throw-damage]");if(input)input.value=draft.damage;
      lockDraft();renderSpecialState();persistDraft();
    }));
    const damage=node("label","","damage-row");
    const formula=node("span",capitalize(damageLabel),"damage-type");formula.id="boss-throw-formula";
    const input=node("input");input.type="number";input.min="0";input.max="1000000";input.step="1";input.inputMode="numeric";input.value=draft.damage ?? "";
    input.dataset.throwDamage="true";input.setAttribute("aria-label",`Danni ${damageLabel} del lancio`);
    input.addEventListener("input",()=>{draft.damage=input.value;lockDraft();renderSpecialState();persistDraft();});
    const average=throwComponent()?.defaultAmount;
    damage.append(formula,node("span",execution.distance.step?`media ${average} ogni ${execution.distance.step} ft`:`media ${average}`,"damage-formula"),input);form.appendChild(damage);
    if(execution.edge)form.appendChild(choiceGroup("boss-throw-landing","Atterra",[["platform","Sulla piattaforma · Prono"],["edge",`Oltre il bordo · TS DES ${execution.edge.save.dc}`]],"throwLanding",value=>{
      draft.landing=value;lockDraft();renderSpecialState();persistDraft();
    }));
    if(execution.collision) {
      // Scagliare: the creature it is thrown against (optional) and its DEX save.
      const others=targets.filter(item=>item.id!==sourceId);
      form.appendChild(choiceGroup("boss-collision-target","Scagliato contro (facoltativo)",[["","Nessuna"],...others.map(item=>[item.id,item.name || item.id])],"collisionTarget",value=>{
        draft.collisionTargetId=value;if(!value)draft.collisionOutcome="";lockDraft();renderSpecialState();persistDraft();
      }));
      const save=choiceGroup("boss-collision-outcome",`TS DES CD ${execution.collision.save.dc} della creatura colpita`,[["failed","Fallito · stessi danni e Prono"],["passed","Superato · illesa"]],"collisionOutcome",value=>{
        draft.collisionOutcome=value;lockDraft();renderSpecialState();persistDraft();
      });
      save.id="boss-collision-save";save.hidden=!draft.collisionTargetId;form.appendChild(save);
    }
    form.appendChild(manualRulesBlock("A mano: "+action.manualText));
    applyRow(form,"Applica",submitThrow);
    resolution.appendChild(form);
    renderTargetBox();renderSpecialState();
  }
  function renderEffectEndResolution() {
    const action=draft.action,execution=action.execution;
    const form=node("form");form.id="boss-action-form";form.className="view";
    form.appendChild(node("p",`d${execution.roll.die} · con ${execution.roll.threshold}+ l’effetto scelto termina · riuscita o fallita, il tentativo finisce nel Combat Log`,"stat-line"));
    const effects=effectsOnBoss();
    const list=node("div","","effect-choices");list.id="boss-effect-choices";list.setAttribute("role","group");list.setAttribute("aria-label",`Effetti attivi su ${presentation?.item?.name || "boss"}`);
    if(!effects.length)list.appendChild(node("p",`Nessun effetto attivo su ${presentation?.item?.name || "boss"}.`,"muted"));
    for(const entry of effects) {
      const detail=entry.kind==="spell"
        ? ["Incantesimo",entry.sourceName,entry.concentration?"concentrazione":"",entry.conditions.length?`con ${entry.conditions.join(", ")}`:""].filter(Boolean).join(" · ")
        : [entry.effectKind==="debuff"?"Penalità":entry.effectKind==="buff"?"Beneficio":"Condizione",entry.sourceName].filter(Boolean).join(" · ");
      const choice=button("","small effect-choice");choice.dataset.effectKey=effectKey(entry);
      choice.append(node("span",entry.name,"effect-name"),node("small",detail,"effect-detail"));
      choice.addEventListener("click",()=>{if(busy)return;draft.effect={kind:entry.kind,instanceId:entry.instanceId};lockDraft();renderSpecialState();persistDraft();});
      list.appendChild(choice);
    }
    form.appendChild(list);
    const roll=node("label","","damage-row");
    const input=node("input");input.type="number";input.min="1";input.max=String(execution.roll.die);input.step="1";input.inputMode="numeric";input.value=draft.roll ?? "";
    input.dataset.effectRoll="true";input.setAttribute("aria-label",`Risultato del d${execution.roll.die}`);
    input.addEventListener("input",()=>{draft.roll=input.value;lockDraft();renderSpecialState();persistDraft();});
    roll.append(node("span",`d${execution.roll.die}`,"damage-type"),node("span","niente bonus, Vantaggio o Svantaggio","damage-formula"),input);form.appendChild(roll);
    applyRow(form,"Registra",submitEffectEnd);
    resolution.appendChild(form);
    renderSpecialState();
  }
  function submitThrow() {
    if(!draft || busy) return;
    const frozen=structuredClone({targetId:draft.targetId,distance:draft.distance,damage:draft.damage,landing:draft.landing,defenses:defensesOf(draft.targetId),
      collisionTargetId:draft.collisionTargetId || "",collisionOutcome:draft.collisionOutcome || "",collisionDefenses:draft.collisionTargetId?defensesOf(draft.collisionTargetId):undefined});
    const validation=validateBossThrowSelection({sourceId,action:draft.action,targetId:frozen.targetId,targets,grappledIds:heldIds(),
      distance:frozen.distance,damage:frozen.damage,landing:frozen.landing,collisionTargetId:frozen.collisionTargetId,collisionOutcome:frozen.collisionOutcome});
    if(!validation.ok){setStatus(validation.error);return;}
    const active=draft;
    return perform(async operation=>{
      active.attempted=true;active.locked=true;persistDraft();
      const result=await runtime.executeBossAction({...validation.value,ignoredDefenses:ignoredFor(frozen.targetId),expectedDefenses:frozen.defenses,
        ...(frozen.collisionTargetId?{collisionIgnoredDefenses:ignoredFor(frozen.collisionTargetId),collisionExpectedDefenses:frozen.collisionDefenses}:{}),...active.binding});
      if(!lifecycle.isCurrent(operation))return;
      setStatus(`${active.action.name}: ${bossActionResultSummary(result) || "applicata"}.${result.undoAvailable?"":result.historyPending?" History in attesa di conferma: non ripetere l’azione.":" Verifica la Cronologia per annullare."}${result.warnings?.length?"\n"+result.warnings.join("\n"):""}`);
      showUndo(result);
      if(draft===active)closeDraft({persist:false});
      await refresh(operation);
    });
  }
  function submitEffectEnd() {
    if(!draft || busy) return;
    const validation=validateBossEffectEndSelection({sourceId,action:draft.action,effects:effectsOnBoss(),effect:draft.effect,roll:draft.roll});
    if(!validation.ok){setStatus(validation.error);return;}
    const active=draft;
    return perform(async operation=>{
      active.attempted=true;active.locked=true;persistDraft();
      const result=await runtime.executeBossAction({...validation.value,...active.binding});
      if(!lifecycle.isCurrent(operation))return;
      setStatus(`${active.action.name} ${bossActionResultSummary(result) || "registrata"}.${result.undoAvailable?"":result.historyPending?" History in attesa di conferma: non ripetere l’azione.":" Verifica la Cronologia per annullare."}`);
      showUndo(result);
      if(draft===active)closeDraft({persist:false});
      await refresh(operation);
    });
  }
  // ---- multi-target save (Breath of the Long Night) ----
  const groupComponents=()=>bossActionDamageComponents(draft.action);
  const areaAction=()=>draft?.action?.execution?.target?.selection==="area";
  // Only a recharge to verify (Breath) asks for a confirmation step before drawing.
  const confirmNeeded=()=>bossGroupRequiresConfirmation(draft?.action);
  const groupArea=()=>draft?.action?.execution?.target?.area || null;
  const multiArea=()=>groupArea()?.count?groupArea():null;
  // v22 (Strappare le Cuciture): the segments of this round's chained seam and the ones the GM chose.
  const segmentArea=()=>groupArea()?.segments?groupArea():null;
  const seamSegments=()=>bossSeamSegments(presentation?.sequence?.seam);
  const chosenSegments=()=>(Array.isArray(draft?.seamSegments)?draft.seamSegments:seamSegments().map(entry=>entry.index)).filter(index=>seamSegments().some(entry=>entry.index===index));
  const areaDrawn=()=>multiArea()?(draft.areas || []).length===multiArea().count:segmentArea()?!!chosenSegments().length && (draft.areas || []).length===chosenSegments().length:!!draft?.area;
  const immuneTo=id=>!!draft?.action?.execution?.onPassed?.immunity && bossTargetImmune(targetById(id),draft.action);
  function groupRowDamage(outcome,id) {return outcome ? (id ? defendedDamage(id,outcome) : bossDamageTotal(groupComponents(),draft.amounts,outcome)) : null;}
  function setGroup(ids,{explicit=true}={}) {
    const next=[...new Set(ids)];
    const changed=next.length!==draft.targetIds.length || next.some(id=>!draft.targetIds.includes(id));
    draft.targetIds=next;draft.groupSuggestion=null;
    // Outcomes stay keyed by creature. Without a drawing the confirmation covers the chosen creatures.
    draft.outcomes=Object.fromEntries(Object.entries(draft.outcomes).filter(([id])=>next.includes(id)));
    if(changed && draft.manualConfirmed && !areaAction()){draft.manualConfirmed=false;setStatus("Gruppo cambiato: conferma di nuovo le verifiche manuali.");}
    if(explicit)lockDraft();
    renderGroupTargets();renderGroupState();persistDraft();
  }
  function setGroupOutcome(ids,outcome) {
    if(!draft || busy) return;
    for(const id of ids)draft.outcomes[id]=outcome;
    if(attackGroup() && outcome==="hit") {
      const averages=Object.fromEntries(groupComponents().map(component=>[component.id,String(component.defaultAmount)]));
      draft.targetAmounts={...draft.targetAmounts,...Object.fromEntries(ids.filter(id=>!draft.targetAmounts?.[id]).map(id=>[id,{...averages}]))};
    }
    lockDraft();renderGroupTargets();renderGroupState();persistDraft();
  }
  function renderGroupTargets() {
    const list=$("boss-group-targets"),offer=$("boss-group-offer"),count=$("boss-group-count");
    if(!list || !draft) return;
    clear(list);
    if(count)count.textContent=`Bersagli (${draft.targetIds.length})`;
    if(!draft.targetIds.length)list.appendChild(node("p",areaAction()
      ? (areaDrawn()?"Nessuna creatura del tracker nell’area.":multiArea()?`Disegna le ${multiArea().count} esplosioni: le creature colpite compariranno qui.`:`${capitalize(groupArea()?.shape==="emanation"?"posiziona":"disegna")} ${bossAreaNoun(groupArea())}: le creature colpite compariranno qui.`)
      : selection.status==="boss"?bossSelectionHint("boss"):draft.action.execution.target.maxTargets===1?"Seleziona sulla mappa una creatura.":draft.action.execution.target.maxTargets?`Seleziona sulla mappa fino a ${draft.action.execution.target.maxTargets} creature.`:"Seleziona sulla mappa le creature nell’area.","muted"));
    const failedConditions=draft.action.execution.onFailed?.conditions || (draft.action.execution.onFailed?.effect || draft.action.execution.onFailed?.mark?[{condition:draft.action.name}]:[]);
    for(const id of draft.targetIds) {
      const item=targetById(id),outcome=draft.outcomes[id] || "";
      const row=node("div","","group-row");row.dataset.targetId=id;
      const name=node("span","","group-name");const title=node("span","","group-title");
      // First line: the name alone (it must stay readable); HP and chips share the second line.
      const label=node("span",item?.name || id,"group-label");label.title=item?.name || id;title.appendChild(label);
      name.appendChild(title);
      const details=node("span","","group-details");details.appendChild(node("small",item?hpText(item):"non nel tracker","group-hp"));
      name.appendChild(details);
      // Second line: defenses and immunity, so the name and HP keep the first line.
      let chips=item?defenseChips(id,()=>{renderGroupTargets();renderGroupState();}):null;
      const mark=item?markBadge(id):null;
      if(mark){if(!chips){chips=node("span","","defense-chips");chips.dataset.defensesFor=id;}chips.appendChild(mark);}
      if(multiArea()?.innerRadius) {
        // Computed from the drawn centres; the GM can correct it per creature.
        if(!chips){chips=node("span","","defense-chips");chips.dataset.defensesFor=id;}
        const within=(draft.innerIds || []).includes(id);
        const inner=button(`≤${multiArea().innerRadius} ft`,"defense-chip inner-chip");inner.dataset.innerFor=id;
        inner.setAttribute("aria-pressed",String(within));inner.disabled=busy || !!draft.drawing;
        inner.title=within?"Entro il raggio interno di un punto: subisce anche i danni contundenti. Clic per escluderlo.":"Fuori dal raggio interno: clic per includerlo.";
        inner.addEventListener("click",event=>{
          event.stopPropagation?.();if(!draft || busy)return;
          const next=new Set(draft.innerIds || []);if(next.has(id))next.delete(id);else next.add(id);
          draft.innerIds=[...next];lockDraft();renderGroupTargets();renderGroupState();persistDraft();
        });
        chips.appendChild(inner);
      }
      if(immuneTo(id)) {
        if(!chips){chips=node("span","","defense-chips");chips.dataset.defensesFor=id;}
        const badge=node("small","Immune","immune-badge");badge.title=`Già immune a ${draft.action.execution.onPassed.immunity.condition} di ${draft.action.name}: subisce i danni, non la condizione.`;
        chips.appendChild(badge);
      }
      if(chips)details.appendChild(chips);
      row.appendChild(name);
      const damageCell=node("span","","group-damage");
      if(attackGroup() && outcome==="hit") {
        // One damage roll per hit, typed on the row; only the row total is redrawn while typing.
        const typed=node("span","","row-damage");typed.dataset.damageFor=id;
        for(const component of groupComponents()) {
          const input=node("input");input.type="number";input.min="0";input.max="1000000";input.step="1";input.inputMode="numeric";
          input.className="row-amount";input.dataset.targetComponent=component.id;input.disabled=busy;
          input.value=draft.targetAmounts?.[id]?.[component.id] ?? "";input.placeholder=bossDamageTypeLabel(component.type);
          input.title=`${capitalize(bossDamageTypeLabel(component.type))} ${component.formula}`;input.setAttribute("aria-label",`Danni ${bossDamageTypeLabel(component.type)} di ${item?.name || id}`);
          input.addEventListener("input",()=>{
            draft.targetAmounts={...draft.targetAmounts,[id]:{...(draft.targetAmounts?.[id] || {}),[component.id]:input.value}};
            lockDraft();damageCell.textContent="−"+groupRowDamage("hit",id);renderGroupState();persistDraft();
          });
          typed.appendChild(input);
        }
        details.appendChild(typed);
      }
      const seg=node("div","","segmented mini");seg.setAttribute("role","group");seg.setAttribute("aria-label",`Esito di ${item?.name || id}`);
      for(const [value,label] of bossGroupOutcomes(draft.action)) {
        const choice=button(label,"");choice.dataset.groupOutcome=value;choice.dataset.outcome=value;
        choice.setAttribute("aria-pressed",String(outcome===value));choice.disabled=busy;
        choice.addEventListener("click",()=>setGroupOutcome([id],value));seg.appendChild(choice);
      }
      row.appendChild(seg);
      const damage=groupRowDamage(outcome,id);
      damageCell.textContent=!groupComponents().length?"":damage===null?"—":"−"+damage;
      row.appendChild(damageCell);
      const immunity=draft.action.execution.onPassed?.immunity;
      // An effect pill (Soul-Numbing Cold) shows a short tag; its parts are in the tooltip.
      const effect=draft.action.execution.onFailed?.effect;
      const markRule=draft.action.execution.onFailed?.mark;
      const tag=node("span",outcome==="failed"?(immuneTo(id)?"Immune":effect?"Debuff":markRule?(bossTargetMarked(item,presentation?.profile)?"Già marchiato":"Marchio"):failedConditions.map(entry=>entry.condition).join(", "))
        :outcome==="passed" && immunity && !immuneTo(id)?"→ Immune":"","group-tag");
      if(effect && outcome==="failed")tag.title=`${draft.action.name}: ${bossEffectSummaryParts(effect).map(part=>part.label).join(", ")}`;
      row.appendChild(tag);
      const remove=button("×","icon-button group-remove");remove.title=`Togli ${item?.name || id}`;remove.setAttribute("aria-label",remove.title);remove.disabled=busy;
      remove.addEventListener("click",()=>{if(!busy)setGroup(draft.targetIds.filter(entry=>entry!==id));});
      row.appendChild(remove);list.appendChild(row);
    }
    if(offer) {
      clear(offer);offer.hidden=!draft.groupSuggestion;
      if(draft.groupSuggestion) {
        const names=draft.groupSuggestion.map(id=>targetById(id)?.name || id);
        offer.appendChild(node("span",`Selezione mappa: ${names.join(", ")}`,"muted"));
        const additive=areaAction();
        const use=button(additive?"Aggiungi":"Usa selezione");use.id="boss-group-use-selection";use.disabled=busy || !!draft.drawing;
        use.addEventListener("click",()=>{if(!busy && draft.groupSuggestion)setGroup(additive?[...draft.targetIds,...draft.groupSuggestion]:draft.groupSuggestion);});
        offer.appendChild(use);
      }
    }
  }
  function renderGroupState() {
    if(!draft) return;
    const confirm=$("boss-manual-confirmed");if(confirm){confirm.checked=draft.manualConfirmed;confirm.disabled=busy || !!draft.drawing;}
    // A completed step collapses to one line so the target list keeps its room; unchecking shows it in full again.
    const restrictionsText=$("boss-group-restrictions-text");
    // A confirmed step collapses to one line at once; the full text stays in the tooltip and returns when unchecked.
    if(restrictionsText){
      const collapsed=areaAction() && draft.manualConfirmed;
      restrictionsText.textContent=collapsed?(draft.action.execution.trigger?"1 · Innesco e Reazione verificati.":draft.action.usage?.note?"1 · Ricarica e sequenza verificate.":"1 · Requisito e sequenza verificati."):restrictionsText.dataset.full;
      restrictionsText.title=collapsed?restrictionsText.dataset.full:"";
    }
    const conditionName=(draft.action.execution.onFailed?.conditions || [])[0]?.condition || (draft.action.execution.onFailed?.effect || draft.action.execution.onFailed?.mark?draft.action.name:"");
    resolution.querySelectorAll("[data-component-id]").forEach(input=>{input.disabled=busy;});
    renderAreaStep();
    resolution.querySelectorAll("[data-group-all]").forEach(element=>{element.disabled=busy || !draft.targetIds.length;});
    const total=$("boss-total");
    if(total) {
      const damages=draft.targetIds.map(id=>groupRowDamage(draft.outcomes[id],id)).filter(value=>value!==null);
      const affected=draft.targetIds.filter(id=>draft.outcomes[id]==="failed" && !immuneTo(id)).length;
      const label=conditionName==="Accecato"?`Accecat${affected===1?"o":"i"}`:conditionName;
      clear(total);
      if(groupComponents().length)total.append("Totale ",node("strong",String(damages.reduce((sum,value)=>sum+value,0))),affected && conditionName?` · ${affected} ${label}`:"");
      else total.append(node("strong",String(affected))," con ",draft.action.name);
    }
    const apply=$("boss-apply");
    if(apply) {
      const missing=draft.targetIds.find(id=>!targetById(id));
      const trigger=draft.action.execution.trigger;
      const reason=!available(draft.action)?availabilityFor(draft.action)?.reason || "Non disponibile.":sequenceBlocker()
        || (draft.drawing?"Completa o annulla il disegno.":missing?"Un bersaglio non è più nel tracker."
        :segmentArea() && !chosenSegments().length?"Scegli almeno una cucitura da strappare."
        :segmentArea() && !areaDrawn()?`Mostra le linee delle cuciture scelte (${(draft.areas || []).length}/${chosenSegments().length}).`
        :trigger && !bossTriggerMet(draft.action,presentation?.item)?`Innesco non avvenuto: ${presentation?.item?.name || "il boss"} deve essere sotto ${trigger.hpBelow} PF.`
        :bossGroupApplyBlocker({...draft,areaRequired:areaAction(),confirmationRequired:confirmNeeded(),areaShape:groupArea(),
          maxTargets:draft.action.execution.target.maxTargets || 0,confirmationText:bossGroupConfirmationText(draft.action),
          drawnCount:(draft.areas || []).length,...((multiArea() || segmentArea())&&areaDrawn()?{area:draft.areas}:{}),
          outcomeValues:bossGroupOutcomes(draft.action).map(([value])=>value),
          missingDamageIds:bossGroupMissingDamageIds(draft.action,draft.targetIds,draft.outcomes,draft.targetAmounts)}));
      apply.disabled=busy || !!reason;apply.title=reason || "Applica";
      const hint=$("boss-apply-hint");if(hint)hint.textContent=busy?"Applicazione in corso…":reason;
    }
  }
  function renderAreaStep() {
    const step=$("boss-area-step");
    if(!step || !draft) return;
    const area=draft.action.execution.target.area;
    const [label,draw,cancel,restart]=step.children;
    const number=confirmNeeded()?"2 · ":"1 · ",shape=capitalize(bossAreaShapeLabel(area));
    if(area.count) {
      const drawn=(draft.areas || []).length;
      label.textContent=draft.drawing
        ? `${number}Sulla mappa: i ${area.count} centri uno dopo l’altro; trascina il cerchio arancione per spostarne uno, poi «Conferma sagoma» una volta sola (Esc annulla).`
        : drawn===area.count
          ? `${number}${area.count} esplosioni disegnate: ${draft.targetIds.length} creature${area.innerRadius?`, ${(draft.innerIds || []).filter(id=>draft.targetIds.includes(id)).length} entro ${area.innerRadius} ft`:""}.`
          : `${number}Esplosioni ${drawn}/${area.count}: raggio ${area.size} ft${area.innerRadius?`, punti ad almeno ${area.innerRadius*2} ft`:""}.`;
      draw.textContent=drawn===area.count?"Ridisegna tutte":drawn?`Disegna esplosione ${drawn+1}/${area.count}`:`Disegna le ${area.count} esplosioni`;
      const locked=confirmNeeded() && !draft.manualConfirmed;
      draw.disabled=busy || !!draft.drawing || locked;draw.title=locked?"Conferma prima il requisito.":"";
      cancel.hidden=!draft.drawing;cancel.disabled=busy;
      if(restart){restart.hidden=!drawn || !!draft.drawing || drawn===area.count;restart.disabled=busy;}
      return;
    }
    if(area.segments) {
      const chosen=chosenSegments(),drawn=(draft.areas || []).length,next=chosen[drawn];
      label.textContent=draft.drawing
        ? `${number}Sulla mappa: la linea sulla cucitura ${bossSeamSegmentLabel(next ?? chosen[0] ?? 0)}, controllala e «Conferma sagoma» (Esc annulla).`
        : !seamSegments().length ? `${number}Nessuna cucitura in questo round.`
        : areaDrawn() ? `${number}${drawn} ${drawn===1?"linea mostrata":"linee mostrate"}: ${draft.targetIds.length} creature colpite.`
        : `${number}Linee ${drawn}/${chosen.length} sulle cuciture scelte.`;
      draw.textContent=areaDrawn()?"Mostra di nuovo":drawn?`Mostra la linea ${bossSeamSegmentLabel(next)}`:"Mostra le linee";
      draw.disabled=busy || !!draft.drawing || !chosen.length;
      draw.title=!seamSegments().length?"Nessuna cucitura in questo round.":!chosen.length?"Scegli almeno una cucitura.":"";
      cancel.hidden=!draft.drawing;cancel.disabled=busy;
      renderSegmentChoice();
      return;
    }
    const gesture={cone:"origine, direzione",circle:"centro",emanation:`la sagoma è centrata su ${presentation?.item?.name || "boss"}`,seam:"la linea è già sulla cucitura, controllala"}[area.shape] || "area";
    label.textContent=draft.drawing
      ? `${number}Sulla mappa: ${gesture}, poi «Conferma sagoma» (Esc annulla).`
      : draft.area
        ? `${number}${shape} ${area.size} ft ${area.shape==="emanation"?"posizionata":area.shape==="seam"?"disegnata":"disegnato"}: ${draft.area.areaTargetIds.length} creature colpite.`
        : `${number}${shape} ${area.size} ft, ${area.shape==="emanation"?`centrata su ${presentation?.item?.name || area.origin}`:`origine libera (${area.origin})`}.`;
    draw.textContent=draft.area?"Ridisegna":area.shape==="emanation"?"Posiziona emanazione":area.shape==="seam"?"Mostra la linea":`Disegna ${bossAreaShapeLabel(area)}`;
    // Strappare la Cucitura: the line follows the seam of this round.
    const noSeam=area.shape==="seam" && !presentation?.sequence?.seam;
    const locked=(confirmNeeded() && !draft.manualConfirmed) || noSeam;
    draw.disabled=busy || !!draft.drawing || locked;
    draw.title=noSeam?"Nessuna cucitura in questo round.":locked?"Conferma prima i requisiti.":"";
    cancel.hidden=!draft.drawing;cancel.disabled=busy;
  }
  // Meteor Swarm: the drawn points, all together or one more. The inner circles may not overlap; "within" is measured on the scene grid.
  async function addExplosions(active,operation,drawnAreas,multi) {
    let measure=null;
    try {
      const [dpi,scale]=await Promise.all([api.scene.grid.getDpi(),api.scene.grid.getScale()]);
      const feetPerCell=bossFeetPerCell(scale);
      if(dpi>0 && feetPerCell)measure={dpi,feetPerCell};
    } catch {}
    if(draft!==active || !lifecycle.isCurrent(operation)) return;
    const batch=drawnAreas.length>1;
    const rows=[];
    for(const drawnArea of drawnAreas) {
      const centre=drawnArea.start;
      if(measure && multi.innerRadius) {
        const close=bossPointTooClose(centre,[...(active.areas || []),...rows].map(row=>row.start),{radiusFeet:multi.innerRadius,...measure});
        if(close>=0){renderGroupTargets();renderGroupState();persistDraft();
          setStatus(batch?`Esplosione ${rows.length+1} troppo vicina alla ${close+1}: i punti devono distare almeno ${multi.innerRadius*2} ft. Ridisegna le esplosioni.`
            :`Esplosione troppo vicina alla ${close+1}: i punti devono distare almeno ${multi.innerRadius*2} ft. Ridisegnala.`);return;}
      }
      let inner=[];
      if(measure && multi.innerRadius && drawnArea.areaTargetIds.length) {
        const bounds=[];
        for(const id of drawnArea.areaTargetIds) {
          try {bounds.push({id,bounds:await api.scene.items.getItemBounds([id])});} catch {}
        }
        if(draft!==active || !lifecycle.isCurrent(operation)) return;
        inner=bossInnerTargetIds({center:centre,radiusFeet:multi.innerRadius,...measure,bounds});
      }
      rows.push({...drawnArea,innerTargetIds:inner});
    }
    active.areas=[...(active.areas || []),...rows];
    const inner=[...new Set(rows.flatMap(row=>row.innerTargetIds))];
    active.innerIds=[...new Set([...(active.innerIds || []),...inner])];
    // The group is the union of the explosions; creatures added by hand stay.
    const hit=[...new Set(rows.flatMap(row=>row.areaTargetIds))];
    setGroup([...new Set([...draft.targetIds,...hit])]);
    const done=active.areas.length===multi.count;
    const creatures=count=>`${count} ${count===1?"creatura":"creature"}`;
    const within=multi.innerRadius?`, ${inner.length} entro ${multi.innerRadius} ft`:"";
    setStatus(`${measure?"":`Scala della griglia non disponibile: indica a mano chi è entro ${multi.innerRadius} ft. `}${batch?`${rows.length} esplosioni`:`Esplosione ${active.areas.length}/${multi.count}`}: ${creatures(hit.length)}${within}.${done?" Inserisci i tiri salvezza.":` Disegna l’esplosione ${active.areas.length+1}.`}`);
  }
  async function drawArea() {
    if(!draft || busy || draft.drawing || (confirmNeeded() && !draft.manualConfirmed) || !areaAction()) return;
    const active=draft,operation=lifecycle.capture();
    const ruleId=bossActionAreaRuleId(active.action.execution.target.area);
    const multi=active.action.execution.target.area.count?active.action.execution.target.area:null;
    // Every missing point in one drawing: each released shape stays on the map and one confirmation returns them all.
    const pending=multi?multi.count-((active.areas || []).length===multi.count?0:(active.areas || []).length):0;
    const requestId=createSpellAreaPlacementRequestId();
    active.drawing=requestId;lockDraft();renderGroupTargets();renderGroupState();
    setStatus(pending>1
      ? `Disegna ${pending} esplosioni sulla mappa: ogni rilascio fissa un centro (almeno ${multi.innerRadius*2} ft tra i centri). Per spostarne una trascina il suo cerchio arancione${multi.innerRadius?` (entro ${multi.innerRadius} ft: danno extra)`:""}. Poi «Conferma sagoma» una volta sola. Esc annulla.`
      : `${capitalize(active.action.execution.target.area.shape==="emanation"?"posiziona":"disegna")} ${bossAreaNoun(active.action.execution.target.area)} sulla mappa, poi premi «Conferma sagoma». Esc annulla.`);
    const restore=!minimized;
    if(restore)await setMinimized(true);
    let result;
    const theme=bossAreaTheme(presentation?.profile);
    // Strappare le Cuciture: the next chosen segment (all of them again once every line is shown).
    const segmentsMode=!!active.action.execution.target.area.segments;
    if(segmentsMode && areaDrawn()){active.areas=[];setGroup([]);}
    const segment=segmentsMode?seamSegments().find(entry=>entry.index===chosenSegments()[(active.areas || []).length]):null;
    if(segmentsMode && !segment){active.drawing=null;renderGroupState();setStatus("Scegli almeno una cucitura da strappare.");if(restore)await setMinimized(false);return;}
    const seamLine=segmentsMode?segment:active.action.execution.target.area.shape==="seam"?presentation?.sequence?.seam:null;
    if(active.action.execution.target.area.shape==="seam" && !seamLine){active.drawing=null;renderGroupState();setStatus("Nessuna cucitura in questo round.");if(restore)await setMinimized(false);return;}
    const context={phase:"boss-action",actionId:active.action.id,...(theme?{areaTheme:theme}:{}),...(seamLine?{presetLine:{start:seamLine.start,end:seamLine.end}}:{}),...(pending>1?{areaBatch:{count:pending,minDistanceFeet:(multi.innerRadius || 0)*2,innerRadiusFeet:multi.innerRadius || 0}}:{})};
    try {result=await placeArea({ruleId,casterId:sourceId,requestId,context});}
    catch(error) {result={status:"error",error:String(error?.message || error)};}
    if(restore && minimized)await setMinimized(false);
    if(draft!==active || active.drawing!==requestId || !lifecycle.isCurrent(operation) || invalidated) return;
    active.drawing=null;
    if(result?.status==="confirmed" && result.preview) {
      // A batch result lists every shape; otherwise the preview is the one shape.
      const shapes=multi && pending>1 && Array.isArray(result.preview.areas) && result.preview.areas.length===pending?result.preview.areas:[result.preview];
      const idsOf=shape=>[...new Set((Array.isArray(shape?.targetIds)?shape.targetIds:[]).map(id=>String(id || "")).filter(id=>id && id!==sourceId))];
      const hits=[...new Set(shapes.flatMap(idsOf))];
      const items=hits.length?await api.scene.items.getItems(hits):[];
      if(draft!==active || !lifecycle.isCurrent(operation)) return;
      const tracked=bossActionTargets(items,sourceId);
      tracked.forEach(item=>{const index=targets.findIndex(existing=>existing.id===item.id);if(index>=0)targets[index]=item;else targets.push(item);});
      const drawnAreas=shapes.map(shape=>({ruleId,start:{x:Number(shape.start?.x),y:Number(shape.start?.y)},
        end:{x:Number(shape.end?.x),y:Number(shape.end?.y)},areaTargetIds:idsOf(shape).filter(id=>tracked.some(item=>item.id===id))}));
      if(segmentsMode) {
        // Each line joins the group; a creature in several lines is counted once (one save, one damage).
        active.areas=[...(active.areas || []),{...drawnAreas[0],segment:segment.index}];
        setGroup([...new Set([...draft.targetIds,...drawnAreas[0].areaTargetIds])]);
        const done=areaDrawn();
        const creatures=count=>`${count} ${count===1?"creatura":"creature"}`;
        setStatus(`Linea ${bossSeamSegmentLabel(segment.index)}: ${creatures(drawnAreas[0].areaTargetIds.length)}.${done?` Inserisci i tiri salvezza (${creatures(draft.targetIds.length)} in tutto).`:" Mostro la successiva."}`);
        if(!done)setTimeout(()=>{if(draft===active && !draft.drawing)void drawArea();},0);
        return;
      }
      if(multi) {
        // "Ridisegna tutte": the previous complete set is replaced only once the new one is confirmed.
        if((active.areas || []).length===multi.count){active.areas=[];active.innerIds=[];setGroup([]);}
        return addExplosions(active,operation,drawnAreas,multi);
      }
      const [drawnArea]=drawnAreas;
      // Divine Brilliance: only conscious creatures (above 0 HP) join the group; the drawing keeps every hit.
      const conscious=active.action.execution.target.conscious;
      const ids=conscious?drawnArea.areaTargetIds.filter(id=>Number(targetById(id)?.metadata?.[META_KEY]?.hp)>0):drawnArea.areaTargetIds;
      const unconscious=drawnArea.areaTargetIds.length-ids.length;
      active.area=drawnArea;
      setGroup(ids);
      const shape=capitalize(bossAreaShapeLabel(active.action.execution.target.area));
      const done=["emanation","seam"].includes(active.action.execution.target.area.shape)?"confermata":"confermato";
      const excluded=unconscious?` (${unconscious} a 0 PF esclus${unconscious===1?"a":"e"})`:"";
      setStatus(ids.length?`${shape} ${done}: ${ids.length} creature${excluded}. ${attackGroup()?"Inserisci i tiri per colpire e i danni.":"Inserisci i tiri salvezza."}`:`${shape} ${done}, ma non contiene creature${conscious?" coscienti":""} del tracker${excluded}.`);
    } else {
      renderGroupTargets();renderGroupState();persistDraft();
      setStatus(result?.status==="cancelled"?"Disegno annullato: nessuna modifica.":`Disegno non riuscito${result?.error?": "+result.error:""}.`);
    }
  }
  // Strappare le Cuciture: which segments tear (all of them by default). A change clears the lines already shown.
  function renderSegmentChoice() {
    const box=$("boss-seam-segments");
    if(!box || !draft) return;
    clear(box);
    const seam=presentation?.sequence?.seam,chosen=chosenSegments();
    for(const segment of seamSegments()) {
      const label=node("label","","segment-choice");const input=node("input");input.type="checkbox";input.dataset.segment=String(segment.index);
      input.checked=chosen.includes(segment.index);input.disabled=busy || !!draft.drawing;
      input.addEventListener("change",()=>{
        if(!draft || busy || draft.drawing) return;
        const next=seamSegments().map(entry=>entry.index).filter(index=>index===segment.index?input.checked:chosenSegments().includes(index));
        draft.seamSegments=next;draft.areas=[];lockDraft();setGroup([]);renderAreaStep();
      });
      const feet=Number(seam?.segmentsFeet?.[segment.index]);
      label.append(input,node("span",`${bossSeamSegmentLabel(segment.index)}${Number.isFinite(feet)?` · ${feet} ft`:""}`));box.appendChild(label);
    }
  }
  function renderGroupResolution() {
    const action=draft.action,execution=action.execution;
    resolution.classList?.add?.("is-group");
    const form=node("form");form.id="boss-action-form";form.className="view group-form";
    const conditions=(execution.onFailed?.conditions || []).map(entry=>`${entry.condition} sui falliti ${bossConditionDurationText(entry,presentation?.item?.name)}`).join(", ");
    const immunity=execution.onPassed?.immunity?" · Immune sui superati":"";
    const sourceAttack=execution.sourceAction?presentation?.profile?.abilities.find(entry=>entry.id===execution.sourceAction)?.name || execution.sourceAction:"";
    form.appendChild(node("p",execution.kind==="attack-damage"
      ? `${sourceAttack} ${execution.attack.bonus>=0?"+":""}${execution.attack.bonus} · gittata ${execution.attack.range.normal} ft. · ogni creatura cosciente entro ${execution.target.area.size} ft.`
      : execution.onFailed?.mark
      ? `TS ${bossAbilityLabel(execution.save.ability)} CD ${execution.save.dc} · 1 creatura entro ${execution.target.range} ft. · marchio sul fallimento fino alla detonazione`
      : execution.kind==="save-effect"
      ? `TS ${bossAbilityLabel(execution.save.ability)} CD ${execution.save.dc} · fino a ${execution.target.maxTargets} creature entro ${execution.target.range} ft. · ${action.name} sui falliti fino alla fine del loro turno successivo`
      : [`TS ${bossAbilityLabel(execution.save.ability)} CD ${execution.save.dc}`,"metà danni su successo",...(conditions?[conditions]:[])].join(" · ")+immunity,"stat-line"));
    sequenceStep(form);
    if(execution.trigger) {
      const hp=presentation?.item?.metadata?.[META_KEY]?.hp,met=bossTriggerMet(action,presentation?.item);
      const line=node("p",`Innesco: ${presentation?.item?.name || "boss"} a ${Number.isFinite(hp)?hp:"?"} PF · ${met?`sotto ${execution.trigger.hpBelow}: innescata`:`non ancora sotto ${execution.trigger.hpBelow}`}`,"note"+(met?"":" warning"));
      line.id="boss-trigger-state";form.appendChild(line);
    }
    if(confirmNeeded()) {
      const step=node("div","","manual-step");step.id="boss-group-restrictions";const label=node("label");
      const input=node("input");input.type="checkbox";input.id="boss-manual-confirmed";input.checked=draft.manualConfirmed;
      input.addEventListener("change",()=>{draft.manualConfirmed=input.checked;lockDraft();renderGroupState();persistDraft();});
      const restrictionsText=node("span",(areaAction()?"1 · ":"")+"Verificato da me: "+bossGroupRestrictions(action).join(" · "));
      restrictionsText.id="boss-group-restrictions-text";restrictionsText.dataset.full=restrictionsText.textContent;
      label.append(input,restrictionsText);
      step.appendChild(label);form.appendChild(step);
    } else if(bossGroupRestrictions(action).length) {
      // Nothing to confirm beforehand: the manual remainder is a reminder, not a gate.
      const note=node("p","A mano: "+bossGroupRestrictions(action).join(" · "),"note clamp");note.id="boss-group-restrictions";note.title=note.textContent;form.appendChild(note);
    }
    if(areaAction()) {
      const areaStep=node("div","","area-step");areaStep.id="boss-area-step";
      areaStep.append(node("span","","area-label"),button("","small"),button("Annulla disegno","small"));
      const [,draw,cancel]=areaStep.children;draw.id="boss-draw-area";cancel.id="boss-cancel-area";
      if(groupArea()?.segments) {
        const choice=node("div","","segment-choices");choice.id="boss-seam-segments";form.appendChild(choice);
      }
      if(groupArea()?.count) {
        const restart=button("Ricomincia","small");restart.id="boss-restart-area";areaStep.appendChild(restart);
        restart.addEventListener("click",()=>{if(!draft || busy || draft.drawing)return;draft.areas=[];draft.innerIds=[];setGroup([]);setStatus("Esplosioni annullate: ricomincia dalla prima.");});
      }
      draw.addEventListener("click",()=>{void drawArea();});
      cancel.addEventListener("click",()=>{if(draft?.drawing)void cancelArea(draft.drawing).catch(()=>{});});
      form.appendChild(areaStep);
    }
    const head=node("div","","group-head");
    const count=node("span","","caption");count.id="boss-group-count";head.appendChild(count);
    for(const [value,text] of execution.kind==="attack-damage"?[["hit","Tutti colpiti"],["miss","Tutti mancati"]]:[["failed","Tutti falliti"],["passed","Tutti superati"]]) {
      const all=button(text,"small");all.dataset.groupAll=value;
      all.addEventListener("click",()=>{if(!busy && draft.targetIds.length)setGroupOutcome(draft.targetIds,value);});head.appendChild(all);
    }
    form.appendChild(head);
    const offer=node("div","","target-line");offer.id="boss-group-offer";offer.hidden=true;form.appendChild(offer);
    const list=node("div","","group-list");list.id="boss-group-targets";list.setAttribute("role","list");form.appendChild(list);
    const tags=execution.onFailed?.conditions?.length || execution.onFailed?.effect || execution.onFailed?.mark || execution.onPassed?.immunity;
    if(!tags)list.classList?.add?.("no-tag");
    const damage=node("div","","damage-inline");damage.id="boss-damage";
    if(execution.kind==="attack-damage") {
      // No shared roll: each hit types its own damage on its row (prefilled with the averages).
      // One line: the list keeps its room; the full rule stays in the tooltip.
      const note=node("p",`Danni di ogni colpito: ${groupComponents().map(component=>`${bossDamageTypeLabel(component.type)} ${component.formula}`).join(" + ")} (medie ${groupComponents().map(component=>component.defaultAmount).join(" + ")}), un tiro per bersaglio.`,"note clamp");
      note.title=`${note.textContent} Per un critico inserisci i dadi raddoppiati.`;damage.appendChild(note);
    }
    for(const component of execution.kind==="attack-damage"?[]:groupComponents()) {
      const row=node("label","","damage-cell");
      row.append(node("span",`${capitalize(bossDamageTypeLabel(component.type))} ${component.formula}`,"damage-type"));
      const amount=node("input");amount.type="number";amount.min="0";amount.max="1000000";amount.step="1";amount.inputMode="numeric";
      amount.value=draft.amounts[component.id] ?? "";amount.dataset.componentId=component.id;
      amount.title=component.printedAverage!==undefined?`Media stampata ${component.printedAverage}`:"";
      amount.setAttribute("aria-label",`Danni base ${bossDamageTypeLabel(component.type)}`);
      amount.addEventListener("input",()=>{draft.amounts[component.id]=amount.value;lockDraft();renderGroupTargets();renderGroupState();persistDraft();});
      row.appendChild(amount);damage.appendChild(row);
    }
    form.appendChild(damage);
    form.appendChild(detailsBlock(action));
    const row=node("div","","apply-row");
    const totals=node("div","","total");const total=node("div");total.id="boss-total";const hint=node("div","","");hint.id="boss-apply-hint";
    totals.append(total,hint);row.appendChild(totals);
    const apply=button("Applica","apply");apply.type="submit";apply.id="boss-apply";apply.dataset.resourceCommit="true";row.appendChild(apply);
    form.appendChild(row);
    form.addEventListener("submit",event=>{event.preventDefault?.();return submitGroupDraft();});
    resolution.appendChild(form);
    renderGroupTargets();renderGroupState();
  }
  function submitGroupDraft() {
    if(!draft || busy) return;
    // Freeze the whole group: later map selections cannot add, remove or move a decision.
    if(draft.drawing){setStatus("Completa o annulla il disegno prima di applicare.");return;}
    if(!available(draft.action)){setStatus(availabilityFor(draft.action)?.reason || "Non disponibile.");return;}
    if(sequenceBlocker()){setStatus(sequenceBlocker());return;}
    const frozen=structuredClone({targetIds:draft.targetIds,outcomes:draft.outcomes,amounts:draft.amounts,targetAmounts:draft.targetAmounts || {},manualConfirmed:draft.manualConfirmed,area:draft.area,
      areas:draft.areas || [],innerIds:draft.innerIds || [],
      ignoredDefenses:Object.fromEntries(draft.targetIds.map(id=>[id,ignoredFor(id)])),
      expectedDefenses:Object.fromEntries(draft.targetIds.map(id=>[id,defensesOf(id)])),
      expectedImmuneIds:draft.targetIds.filter(id=>immuneTo(id)),
      expectedMarkedIds:draft.targetIds.filter(id=>markAppliesFor(id,draft.outcomes[id])),
      expectedEvasionIds:draft.targetIds.filter(id=>evasionFor(id))});
    const validation=validateBossActionGroupSelection({sourceId,action:draft.action,targetIds:frozen.targetIds,targets,
      outcomes:frozen.outcomes,componentAmounts:frozen.amounts,manualConfirmed:frozen.manualConfirmed===true,area:frozen.area,
      areas:frozen.areas,innerIds:frozen.innerIds,targetAmounts:frozen.targetAmounts});
    if(!validation.ok){setStatus(validation.error);return;}
    const active=draft;
    return perform(async operation=>{
      active.attempted=true;active.locked=true;persistDraft();
      const result=await runtime.executeBossAction({...validation.value,ignoredDefenses:frozen.ignoredDefenses,
        expectedDefenses:frozen.expectedDefenses,...(active.action.execution.onPassed?.immunity?{expectedImmuneIds:frozen.expectedImmuneIds}:{}),
        expectedMarkedIds:frozen.expectedMarkedIds,...(evasionAppliesTo(active.action.execution)?{expectedEvasionIds:frozen.expectedEvasionIds}:{}),
        ...(sequenceWarning(active.action)?{sequenceConfirmed:active.sequenceConfirmed===true}:{}),...active.binding});
      if(!lifecycle.isCurrent(operation))return;
      setStatus(`${active.action.name}:\n${bossActionResultSummary(result) || "applicata"}${result.undoAvailable?"":result.historyPending?"\nHistory in attesa di conferma: non ripetere l’azione.":"\nVerifica la Cronologia per annullare."}${result.warnings?.length?"\n"+result.warnings.join("\n"):""}`);
      showUndo(result);
      if(draft===active)closeDraft({persist:false});
      await refresh(operation);
    });
  }
  function submitDraft() {
    if(!draft || busy) return;
    if(!available(draft.action)){setStatus(availabilityFor(draft.action)?.reason || "Risorsa esaurita.");return;}
    // Freeze every decision before the commit: later selection changes cannot alter this request.
    const frozen=structuredClone({targetId:draft.targetId,mode:draft.mode,outcome:draft.outcome,amounts:draft.amounts,manualConfirmed:draft.manualConfirmed,rider:draft.rider,teleport:draft.teleport,
      defenses:defensesOf(draft.targetId),marked:markAppliesFor(draft.targetId,draft.outcome),evasion:evasionFor(draft.targetId)});
    const validation=validateBossActionSelection({sourceId,action:draft.action,targetId:frozen.targetId,targets,
      mode:frozen.mode || draft.action.execution.attack?.modes?.[0] || "",outcome:frozen.outcome,manualConfirmed:frozen.manualConfirmed===true,
      componentAmounts:frozen.amounts,rider:frozen.rider,teleport:frozen.teleport});
    if(!validation.ok){setStatus(validation.error);return;}
    const active=draft;
    return perform(async operation=>{
      active.attempted=true;active.locked=true;persistDraft();
      const result=await runtime.executeBossAction({...validation.value,ignoredDefenses:ignoredFor(frozen.targetId),
        expectedDefenses:frozen.defenses,expectedMarkedIds:frozen.marked?[frozen.targetId]:[],
        ...(evasionAppliesTo(active.action.execution)?{expectedEvasion:frozen.evasion}:{}),...active.binding});
      if(!lifecycle.isCurrent(operation))return;
      const summary=bossActionResultSummary(result);
      setStatus(`${active.action.name}: ${summary || "applicata"}.${result.undoAvailable?"":result.historyPending?" History in attesa di conferma: non ripetere l’azione.":" Verifica la Cronologia per annullare."}${result.manualText?"\nManuale: "+result.manualText:""}${result.warnings?.length?"\n"+result.warnings.join("\n"):""}`);
      showUndo(result);
      if(draft===active)closeDraft({persist:false});
      await refresh(operation);
    });
  }

  // ---- map selection (local subscription, removed on close/scene change) ----
  async function readSelection(ids) {
    if(invalidated || !lifecycle.isReady() || typeof api.player?.getSelection!=="function" && !Array.isArray(ids)) return;
    const operation=lifecycle.capture(),sequence=++selectionSequence;
    try {
      const selected=Array.isArray(ids)?ids:await api.player.getSelection();
      const list=Array.isArray(selected)?selected.filter(id=>typeof id==="string"):[];
      const items=list.length?await api.scene.items.getItems(list):[];
      if(!lifecycle.isCurrent(operation) || sequence!==selectionSequence || invalidated) return;
      selection=bossSelectionTarget(items,sourceId);
      // Newly selected tracked creatures become valid targets without a manual refresh.
      selection.candidates.forEach(item=>{const index=targets.findIndex(existing=>existing.id===item.id);if(index>=0)targets[index]=item;else targets.push(item);});
      if(view==="list"){const line=$("boss-selection-line");if(line)line.replaceWith(selectionLine());}
      if(draft){applySelectionToDraft();renderTargetBox();renderDraftState();persistDraft();}
    } catch {}
  }

  // ---- live refresh of resources and targets (local, debounced) ----
  // Boss immunity pills (Blinding Gleam) change what a resolution applies, so they refresh the console.
  function immunityKeys(item) {
    const value=item?.metadata?.[META_KEY]?.conditions;
    const instances=Array.isArray(value)?value:Array.isArray(value?.instances)?value.instances:[];
    return instances.map(instance=>String(instance?.effectId || "")).filter(id=>(id.startsWith("monster-action:") && id.endsWith(":immune")) || id.startsWith("monster-mark:")).sort();
  }
  function computeLiveSignature(items) {
    const boss=items.find(item=>item.id===sourceId)?.metadata?.[META_KEY] || {};
    // The boss's own effects feed Epic Resistance's list, so they refresh the console too.
    return JSON.stringify([boss.bossActionState ?? null,boss.initiativeCard?.bossActionBinding ?? null,boss.hp ?? null,boss.conditions ?? null,boss[ID+"/spells"] ?? null,
      bossActionTargets(items,sourceId).map(item=>[item.id,item.name,item.metadata?.[META_KEY]?.hp,item.metadata?.[META_KEY]?.hpMax,
        damageDefensesForItem(item,META_KEY),immunityKeys(item)]),bossGrappledIds(items,sourceId)]);
  }
  function scheduleRefresh() {
    refreshPending=true;
    if(refreshTimer || busy || refreshing || invalidated) return;
    refreshTimer=schedule(()=>{refreshTimer=null;void liveRefresh();},120);
  }
  async function liveRefresh() {
    if(busy || refreshing || invalidated || !lifecycle.isReady()) return;
    refreshPending=false;refreshing=true;
    const operation=lifecycle.capture();
    try {await refresh(operation,{preserveResolution:true});}
    catch(error) {if(lifecycle.isCurrent(operation))setStatus(String(error?.message || error));}
    finally {refreshing=false;if(refreshPending)scheduleRefresh();}
  }
  function mountLiveUpdates() {
    const add=unsubscribe=>{if(typeof unsubscribe==="function")unsubscribers.push(unsubscribe);};
    if(typeof api.player?.onChange==="function")add(api.player.onChange(player=>{if(Array.isArray(player?.selection))void readSelection(player.selection);}));
    // v19: with an Epic Action sequence, a new turn moves the slot of the round too.
    let turn="";
    if(typeof api.scene?.onMetadataChange==="function")add(api.scene.onMetadataChange(metadata=>{
      const state=metadata?.[STATE_KEY],round=state?.round,next=JSON.stringify([state?.current ?? null,state?.order ?? null]);
      const moved=next!==turn;turn=next;
      if(presentation && (round!==presentation.round || (moved && presentation.sequence)))scheduleRefresh();}));
    if(typeof api.scene?.items?.onChange==="function")add(api.scene.items.onChange(items=>{
      const signature=computeLiveSignature(Array.isArray(items)?items:[]);
      if(signature!==liveSignature){liveSignature=signature;scheduleRefresh();}}));
    // Re-read the selection when the pointer comes back from the map; local to this popover document.
    documentRef.body?.addEventListener?.("pointerenter",()=>{void readSelection();});
  }
  function unmountLiveUpdates() {unsubscribers.splice(0).forEach(unsubscribe=>{try{unsubscribe();}catch{}});}

  async function refresh(operation,{preserveResolution=false}={}) {
    const previous=presentation;
    const loaded=await runtime.getBossActionPresentation(sourceId);
    const items=await api.scene.items.getItems();
    if(!lifecycle.isCurrent(operation))return;
    if(!isBossActionSourceItem(loaded.item))throw new Error("Seleziona il token reale del boss.");
    const sameDraftBinding=previous?.profile?.profileId===loaded.profile?.profileId
      && previous?.profile?.profileRevision===loaded.profile?.profileRevision
      && previous?.bossInstanceId===loaded.bossInstanceId && previous?.sceneIdentity===loaded.sceneIdentity
      && previous?.binding?.profileId===loaded.binding?.profileId && previous?.binding?.profileRevision===loaded.binding?.profileRevision;
    presentation=loaded;targets=bossActionTargets(items,sourceId);liveSignature=computeLiveSignature(items);
    await loadSceneBindings();
    if(!lifecycle.isCurrent(operation))return;
    const keep=!!draft && preserveResolution && sameDraftBinding && !!loaded.profile?.abilities.some(action=>action.id===draft.action.id);
    if(draft && !keep) {
      const hadDraft=!!draft;closeDraft({persist:false,focusAction:false});
      if(hadDraft && preserveResolution)setStatus("Profilo o istanza del boss cambiati: riapri l’azione.");
    }
    renderLibrary(loaded.profile);renderHeader();renderList();
    if(draft) {
      const head=resolution.querySelector?.(".resolve-head");if(head)head.replaceWith(resolveHead(draft.action));
      renderTargetBox();renderDecisions();
    }
  }
  function runRefresh() {return perform(async operation=>{await refresh(operation,{preserveResolution:true});if(lifecycle.isCurrent(operation))setStatus("Azioni e risorse aggiornate.");});}

  $("boss-refresh")?.addEventListener("click",runRefresh);
  $("boss-manage-open")?.addEventListener("click",()=>{if(!busy){renderLibrary(presentation?.profile);setView("manage");}});
  $("boss-manage-back")?.addEventListener("click",()=>setView(draft?"resolve":"list"));
  $("boss-import").addEventListener("click",()=>perform(async operation=>{
    const file=$("boss-file").files?.[0];
    if(!file)throw new Error("Seleziona un file HTML o JSON.");
    const content=await file.text();
    if(!lifecycle.isCurrent(operation))return;
    const profile=/\.json$/i.test(file.name)?store.importProfile(content):store.put(await importBossActionHTML(content,{sourceName:file.name}));
    if(!lifecycle.isCurrent(operation))return;
    renderLibrary(profile);setStatus(`Importato: ${profile.abilities.length} capacità. Collega la definizione al token per usarla.`);
    if(presentation?.binding && !presentation.profile)await refresh(operation);
  }));
  $("boss-bind").addEventListener("click",()=>perform(async operation=>{
    const profile=selectedProfile();if(!profile)throw new Error("Importa o seleziona una definizione.");
    const bound=await runtime.bindBossActionProfile(sourceId,profile);
    const added=bound?.auraChange?.added || [],updated=bound?.auraChange?.updated || [],removed=bound?.auraChange?.removed || [];
    if(lifecycle.isCurrent(operation)){await refresh(operation);setView("list");
      setStatus(`Profilo collegato. HP del token preservati.${added.length?` Aure attivate sul token: ${added.join(", ")}.`:""}${updated.length?` Aure allineate al profilo (bersagli, pill, promemoria; raggio e colori restano i tuoi): ${updated.join(", ")}.`:""}${removed.length?` Aure rimosse: ${removed.join(", ")}.`:""}`);}
  }));
  $("boss-unbind").addEventListener("click",()=>perform(async operation=>{
    const unbound=await runtime.unbindBossActionProfile(sourceId);
    const removed=unbound?.auraChange?.removed || [];
    if(lifecycle.isCurrent(operation)){await refresh(operation);setStatus(`Profilo scollegato.${removed.length?` Aure rimosse dal token: ${removed.join(", ")}.`:""}`);}
  }));
  $("boss-reset-resources")?.addEventListener("click",()=>{void requestReset();});
  $("boss-restore-auras")?.addEventListener("click",()=>{void requestAuraRestore();});
  // Two-step cleanup: the first click shows what would be removed, the second removes it.
  profileSelect.addEventListener?.("change",resetCleanup);
  $("boss-delete-revision")?.addEventListener("click",()=>perform(async operation=>{
    const profile=selectedProfile();if(!profile)throw new Error("Seleziona una definizione.");
    const users=usersOf(profile);
    if(users.length){pendingCleanup=null;renderCleanup();throw new Error(`Revisione in uso da ${users.map(row=>row.name).join(", ")}: collega un'altra revisione o scollega prima di eliminarla.`);}
    if(!sameRevision(pendingCleanup?.profile,profile) || pendingCleanup.kind!=="remove") {
      pendingCleanup={kind:"remove",profile,message:`Elimini ${profile.name} (${profile.phaseId}) · ${profile.profileRevision.slice(0,8)}? Premi di nuovo per confermare. I token di altre scene collegati a questa revisione dovranno reimportarla.`};
      renderCleanup();return;
    }
    store.remove(profile.profileId,profile.profileRevision);pendingCleanup=null;
    if(lifecycle.isCurrent(operation)){renderLibrary(presentation?.profile);setStatus(`Revisione ${profile.profileRevision.slice(0,8)} eliminata dalla libreria.`);}
  }));
  $("boss-prune")?.addEventListener("click",()=>perform(async operation=>{
    await loadSceneBindings();
    const stale=store.supersededRevisions({keep:sceneBindings});
    if(!stale.length){pendingCleanup=null;renderCleanup();setStatus("Nessuna revisione superata da eliminare.");return;}
    if(pendingCleanup?.kind!=="prune" || pendingCleanup.count!==stale.length) {
      pendingCleanup={kind:"prune",count:stale.length,message:`Restano l'ultima revisione di ogni fase e quelle in uso in questa scena; ${stale.length} revisioni superate verranno eliminate. Premi di nuovo per confermare.`};
      renderCleanup();return;
    }
    const removed=store.prune({keep:sceneBindings});pendingCleanup=null;
    if(lifecycle.isCurrent(operation)){renderLibrary(presentation?.profile);setStatus(`Libreria ripulita: ${removed} revisioni superate eliminate.`);}
  }));
  $("boss-export").addEventListener("click",()=>perform(async()=>{
    const profile=selectedProfile();if(!profile)throw new Error("Seleziona una definizione.");
    const json=store.exportProfile(profile.profileId,profile.profileRevision);
    const url=URL.createObjectURL(new Blob([json],{type:"application/json"}));
    const link=node("a");link.href=url;link.download=`${profile.profileId}-${profile.profileRevision.slice(0,8)}.json`;
    documentRef.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    setStatus("Profilo completo esportato, con HTML originale.");
  }));
  undoButton?.addEventListener("click",()=>{
    if(!lastUndo)return;
    const entry=lastUndo;
    return perform(async operation=>{
      const outcome=await undoEntry(entry.historyEntryId,{epoch:operation.epoch});
      if(!lifecycle.isCurrent(operation))return;
      showUndo(null);setStatus(outcome?.ok?"Ultima azione annullata.":outcome?.message || "Undo non applicato.");
      await refresh(operation,{preserveResolution:true});
    });
  });
  $("boss-minimize")?.addEventListener("click",()=>{void setMinimized(!minimized);});
  documentRef.addEventListener?.("keydown",event=>{
    if(event.key!=="Escape" || busy) return;
    if(view==="resolve"){event.preventDefault?.();closeDraft({persist:false});}
    else if(view==="manage"){event.preventDefault?.();setView("list");}
  });
  function destroy() {
    unmountLiveUpdates();
    if(refreshTimer){clearTimeout(refreshTimer);refreshTimer=null;}
    lifecycle.dispose();
  }
  $("boss-close").addEventListener("click",()=>{writeSession(draftStorageKey(),null);writeSession(MINIMIZED_STORAGE_KEY,null);destroy();void api.popover.close(POPOVER_ID);});
  const unsubscribe=lifecycle.subscribe(event=>{
    if(event.phase==="unavailable"){
      invalidated=true;presentation=null;draft=null;unmountLiveUpdates();clear(abilities);clear(resolution);setView("list");showUndo(null);
      setStatus("Scena cambiata: chiudi e riapri Boss Actions.");toolbarState();
    }
  });
  setView("list");showUndo(null);
  const ready=lifecycle.mount().then(()=>perform(async operation=>{
    if(await api.player.getRole()!=="GM"){invalidated=true;throw new Error("Solo il GM può usare Boss Actions.");}
    await refresh(operation);
    if(!presentation?.binding || !presentation?.profile){renderLibrary(presentation?.profile);setView("manage");}
    mountLiveUpdates();
    if(readSession(MINIMIZED_STORAGE_KEY)===true)await setMinimized(true);
  })).then(async()=>{
    if(invalidated) return;
    await readSelection();
    if(!draft && presentation?.profile)restoreDraft();
  });
  globalThis.addEventListener?.("beforeunload",()=>{unsubscribe();destroy();},{once:true});
  return {ready,refresh:runRefresh,getPresentation:()=>presentation,getDraft:()=>draft,
    destroy:()=>{unsubscribe();destroy();}};
}
if(typeof document!=="undefined") OBR.onReady(()=>bootBossActions(document));
