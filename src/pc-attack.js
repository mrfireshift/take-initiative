import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { createSceneLifecycleAdapter } from "./sceneLifecycle.js";
import { createPcAttackRuntime, pcAttackSmiteSlotPlans, pcAttackSpellSlotPlan } from "./pcAttackExecution.js";
import { spellSlotStatus } from "./spellSlotCore.js";
import { PC_ATTACK_OUTCOME_LABELS, MAX_PC_ATTACK_EXTRAS, pcAttackPreview, pcAttackRiderOptions, pcAttackSelectionHint, pcAttackActivationOptions,
  pcAttackCantripDiceFor, pcAttackCantripIds, pcAttackResolvedAction, pcAttackOutcomesFor, pcAttackSaveLabel, pcAttackDamageFactor,
  pcAttackCantripPillLabels, pcAttackWeaponCantripOptions, pcAttackActionWeaponCantripIds, pcAttackQuiveringPalm,
  pcAttackModeOptions, pcAttackAreaPreview, pcAttackActionPanelCantripIds, pcAttackSpellIds, pcAttackWithSpellType, pcAttackOpenSpellCast,
  pcAttackMonsterAreaNote, pcAttackMonsterTags } from "./pcAttackCore.js";
import { MONSTER_PROFILE_FIELD, sanitizeMonsterProfile } from "./monsterProfileCore.js";
import { PC_ATTACK_MONSTER_GROUP_TITLES, pcAttackMonsterTraitEntries } from "./pcAttackMonsterTraitsCore.js";
import { monsterStatblockTextRef } from "./monsterStatblockTextCore.js";
import { createMonsterStatblockTextLoader } from "./monsterStatblockTextLoader.js";
import { getPcAttackSpell, pcAttackSpellDice } from "./pcAttackSpellCatalog.js";
import { spellSlotChoices } from "./spellSlotSpendCore.js";
import { pcAttackHasPotentCantrip } from "./pcAttackRiderCatalog.js";
import { getPcAttackCantrip, pcAttackCantripBeams, PC_ATTACK_SAVE_LABELS } from "./pcAttackCantripCatalog.js";
import { totalCharacterLevel } from "./abilityModifiersCore.js";
import { pcAttackCriticalDice } from "./pcAttackRiderCatalog.js";
import { bossActionTargets, bossSelectionTarget, reconcileBossDraftTarget, bossTargetLabel } from "./bossActionsViewCore.js";
import { DAMAGE_TYPES, damageDefenseTag, damageTypeLabel, damageDefensesForItem } from "./damageDefensesCore.js";
import { PC_ATTACK_CONSOLE_CHANNEL, PC_ATTACK_HEIGHT, PC_ATTACK_POPOVER_ID, PC_ATTACK_SPELL_LAUNCH_CHANNEL, PC_ATTACK_WIDTH } from "./pcAttackLauncher.js";
import { loadSpellbookSpellReference, spellbookSpellDetails, spellbookSpellReferenceLoaded } from "./spellbookCatalog.js";
import { getClassFeatureDefinition } from "./classFeatureCatalog.js";
import { classFeatureTargeting } from "./classFeatureCore.js";
import { pcAttackFeatureForm, pcAttackFeatureRequest } from "./pcAttackFeatureFormCore.js";
import { getSpellCatalog } from "./spells-srd.js";
import { hasReactionUsed, isOffTurn, isReactionClassFeature } from "./reactionTrackerCore.js";
import { openTrackedPopover } from "./popoverDragHost.js";
import { classFeatureDescription, classFeatureDescriptionsLoaded, loadClassFeatureDescriptions } from "./classFeatureDescriptions.js";
import { pcAttackPickerDefault, pcAttackPickerEntries, pcAttackPickerEntryFor, pcAttackPickerTabs } from "./pcAttackPickerCore.js";
import { PC_MANEUVER_CONTEST, PC_MANEUVER_NOTES, PC_MANEUVER_OUTCOMES, PC_MANEUVER_OUTCOME_LABELS, PC_SHOVE_EFFECTS, PC_SHOVE_EFFECT_LABELS,
  pcAttackManeuverEntries, pcGrappleHolds, pcGrapplesOn, pcManeuverBlocker, pcManeuverLabel } from "./pcAttackManeuverCore.js";
import { isEpicActionId, isLairId, splitParagonId } from "./initiativeSelectionProjectionCore.js";
import { requestSpellAreaPlacement, cancelSpellAreaPlacementRequest, createSpellAreaPlacementRequestId } from "./spellAreaPlacementClient.js";
import { pcBreathAreaRuleId } from "./pcAttackBreathId.js";
import "./popoverDrag.js";
import { perfBootPage } from "./perfProbe.js";

perfBootPage(OBR);

const META_KEY=`${ID}/meta`;
const STATE_KEY=`${ID}/state`;
const RANGE_LABELS=Object.freeze({melee:"Mischia",ranged:"Distanza"});
const newAttackId=()=>`pc-attack:${globalThis.crypto?.randomUUID?.() || Date.now().toString(36)+":"+Math.random().toString(36).slice(2)}`;
const newLaunchId=()=>`pc-launch:${globalThis.crypto?.randomUUID?.() || Date.now().toString(36)+":"+Math.random().toString(36).slice(2)}`;
// The tracker acknowledges a launch at once; without it the tracker is closed (it hosts the 🪄 routing).
const LAUNCH_ACK_TIMEOUT_MS=1500;
// Once opened for a cast, the tracker gets this many tries (each LAUNCH_ACK_TIMEOUT_MS) to load and answer.
const TRACKER_OPEN_ATTEMPTS=5;
const newCastId=()=>`pc-cast:${globalThis.crypto?.randomUUID?.() || Date.now().toString(36)+":"+Math.random().toString(36).slice(2)}`;

// Undo goes through the existing History, only for the latest confirmed entry (same rule as Boss Actions).
async function defaultPcAttackUndo(entryId,{epoch}) {
  const [{getHistoryEntries,undoHistoryThrough},{HISTORY_UNDO_OUTCOME,normalizeHistoryUndoResult}]=await Promise.all([
    import("./history.js"),import("./historyUndoResultCore.js")]);
  const entries=await getHistoryEntries();
  if(entries[entries.length-1]?.id!==entryId) return {ok:false,message:"Sono presenti modifiche successive: usa la Cronologia."};
  const outcome=normalizeHistoryUndoResult(await undoHistoryThrough(entryId,{sceneEpoch:epoch}));
  return outcome.outcome===HISTORY_UNDO_OUTCOME.COMMITTED ? {ok:true} : {ok:false,message:"Annullamento non applicato: verifica la Cronologia."};
}

// attackMode: an arrow that replaces the attack roll (Seeking, Piercing); area: the creatures of an area attack.
function emptyDraft(action,targetId=null,spellId="",attackMode="") {
  const components=pcAttackResolvedAction(action,spellId,attackMode)?.components || [];
  return {targetId,spellId,attackMode,modeAmount:"",outcome:"",amounts:Object.fromEntries(components.map(component=>[component.id,""])),ignored:[],
    riders:{},activations:{},extras:[],woven:{spellId:"",amount:"",secondaryTargetId:"",secondaryAmount:""},
    area:{members:{},proposalKey:""},attackInstanceId:newAttackId(),
    // A leveled attack spell (lotto L4): the cast this registration belongs to, its slot, the type picked, matching d8.
    spell:{castId:newCastId(),slotLevel:null,pact:false,damageType:"",doubles:false,fresh:false}};
}
// The cantrip a cantrip action opens with: the one this attacker used last, when this action still offers it.
export function defaultCantripId(action,sourceItem) {
  const offered=[...pcAttackCantripIds(action),...pcAttackSpellIds(action)];
  const last=sourceItem?.metadata?.[`${ID}/meta`]?.pcAttackState?.lastAttack?.spellId;
  return offered.includes(last) ? last : offered[0] || "";
}
// The map selection drives the target until the GM has decided something for this attack.
const draftLocked=draft=>!!draft.outcome || Object.values(draft.amounts).some(value=>value!=="")
  || Object.values(draft.riders).some(rider=>rider.on && !rider.auto) || Object.values(draft.activations || {}).some(activation=>activation.on) || draft.extras.length>0;
// The outcomes that deal damage: a hit, a critical, a failed save (a miss and a passed save deal none).
const hits=outcome=>outcome==="hit" || outcome==="critical" || outcome==="failed";
// Riders and extra components only exist on a hit; a miss sends neither.
export function chosenRiders(draft) {
  return hits(draft?.outcome) ? Object.entries(draft.riders || {}).filter(([,rider])=>rider.on).map(([id,rider])=>({id,type:rider.type,amount:rider.amount,
    ...(rider.slotLevel?{slotLevel:rider.slotLevel}:{}),...(rider.bonus?{bonus:true}:{}),...(rider.onHit?{onHit:true}:{})})) : [];
}
// Activations (maneuvers, Arcane Shot, Stunning Strike…): only with an attack roll. On a miss the console keeps only
// those used on the roll itself (Precision Attack, Guided Strike): the others are unticked as unavailable.
export function chosenActivations(draft) {
  if(!["hit","critical","miss"].includes(draft?.outcome)) return [];
  return Object.entries(draft.activations || {}).filter(([,activation])=>activation.on).map(([id,activation])=>({id,
    ...(activation.type?{type:activation.type,amount:activation.amount}:{}),...(activation.saveOutcome?{saveOutcome:activation.saveOutcome}:{}),
    ...(activation.secondaryTargetId?{secondaryTargetId:activation.secondaryTargetId}:{}),...(activation.choice?{choice:activation.choice}:{}),
    ...(Array.isArray(activation.tempHp)?{amount:activation.amount,tempHp:activation.tempHp.map(entry=>({targetId:entry.targetId,amount:entry.amount}))}:{}),
    ...(activation.burst?{burstTargetIds:[...activation.burst.ids]}:{})}));
}
// The weapon cantrip woven into a melee weapon attack (only on a hit), with Green-Flame Blade's second creature.
export function chosenWeaponCantrip(draft) {
  const woven=draft?.woven;
  if(!hits(draft?.outcome) || !woven?.spellId) return null;
  return {spellId:woven.spellId,amount:woven.amount,
    ...(woven.secondaryTargetId?{secondary:{targetId:woven.secondaryTargetId,amount:woven.secondaryAmount}}:{})};
}
// An arrow that replaces the attack roll still deals half on a passed save: its extras too.
export function chosenExtras(draft) {
  return hits(draft?.outcome) || (draft?.attackMode && draft?.outcome==="passed")
    ? (draft.extras || []).map(extra=>({type:extra.type,amount:extra.amount,label:extra.label})) : [];
}
// An area attack: every creature hit and its save outcome.
export function areaSummary(result,name="Attacco") {
  // An area without damage (the metallic breath) names only the outcomes: the HP did not move.
  const damaged=(result?.rows || []).some(row=>row.before!==row.after);
  const rows=(result?.rows || []).map(row=>`${row.name} ${PC_ATTACK_OUTCOME_LABELS[row.outcome] || ""}${damaged || row.before!==row.after?`, PF ${row.before} → ${row.after}`:""}`);
  return `Registrato: ${name} su ${rows.length} ${rows.length===1?"creatura":"creature"}.${rows.length?` ${rows.join("; ")}.`:""}`;
}
const typeLabel=type=>{const label=damageTypeLabel(type);return label.charAt(0).toUpperCase()+label.slice(1);};

// A leveled spell: the ray or dart it was, the slot spent at the start of the cast, the caster's healing.
export function spellResultSummary(spell) {
  if(!spell) return "";
  const progress=spell.total>1?` ${spell.leap?"balzo ":""}${spell.index}/${spell.total}`:spell.leap?" balzo":"";
  return [`${spell.name}${progress}, ${spell.slotLevel}° livello`,
    ...(spell.slotSpent?[`speso: ${spell.slotSpent}`]:spell.firstOfCast && !spell.fromActiveSpell?["nessuno slot scalato"]:[]),
    ...(spell.casterHeal?[`il caster recupera ${spell.casterHeal.amount} PF (${spell.casterHeal.before} → ${spell.casterHeal.after})`]:[]),
    ...(spell.leapPending?["d8 uguali: registra il balzo su un'altra creatura entro 9 m"]:[])].join(" · ")+".";
}

export function resultSummary(result) {
  const outcome=PC_ATTACK_OUTCOME_LABELS[result?.outcome] || "";
  const name=result?.target?.name || "bersaglio";
  // No damage at all: a miss or a passed save (Potent Cantrip still deals half on a passed save).
  if((result?.outcome==="miss" || result?.outcome==="passed") && !result?.hpChange) return `Registrato: ${outcome} su ${name}.`;
  const hp=result?.hpChange?` PF ${result.hpChange.before} → ${result.hpChange.after}.`:"";
  const damage=(result?.damageComponents || []).reduce((sum,component)=>sum+(Number(component.amount) || 0),0);
  const extras=[...(result?.weaponCantrip?[result.weaponCantrip.name]:[]),...(result?.riders || []).map(rider=>rider.name),
    ...(result?.activations || []).map(activation=>activation.save?`${activation.name} (${PC_ATTACK_OUTCOME_LABELS[activation.save.outcome] || ""})`:activation.name),
    ...(result?.extras || []).map(extra=>extra.label || extra.typeLabel)];
  const second=result?.secondary?` ${result.secondary.name}: PF ${result.secondary.before} → ${result.secondary.after}.`:"";
  const conditions=(result?.conditions || []).length?` ${name}: ${result.conditions.join(", ")}.`:"";
  const tempHp=(result?.tempHp || []).length?` PF temporanei: ${result.tempHp.map(row=>`${row.name} ${row.before} → ${row.after}`).join(", ")}.`:"";
  return `Registrato: ${outcome}, ${damage} danni a ${name}.${hp}${extras.length?` Extra: ${extras.join(", ")}.`:""}${second}${conditions}${tempHp}`;
}

// Quivering Palm, ended: the save outcome and what it did.
export function quiveringPalmSummary(result) {
  const name=result?.target?.name || "bersaglio";
  if(result?.outcome==="none") return `Registrato: vibrazioni del Palmo Tremante terminate su ${name}, senza effetto.`;
  const hp=result?.hpChange?` PF ${result.hpChange.before} → ${result.hpChange.after}.`:"";
  return `Registrato: Palmo Tremante su ${name}, ${PC_ATTACK_OUTCOME_LABELS[result?.outcome] || ""}.${hp}`;
}

// Grapple, Shove and the end of a grapple: what was registered.
export function maneuverSummary(result) {
  const maneuver=result?.maneuver || {};
  const target=result?.target?.name || "il bersaglio";
  if(maneuver.kind==="grapple-end") return maneuver.outcome==="release"?`Registrato: ${maneuver.grapplerName || "chi afferra"} lascia andare ${maneuver.grappledName || target}.`
    :`Registrato: ${maneuver.grappledName || target} ${maneuver.outcome==="escaped"?"sfugge alla":"non sfugge alla"} presa di ${maneuver.grapplerName || "una creatura"}.`;
  const name=pcManeuverLabel(maneuver.kind) || "Manovra";
  if(maneuver.outcome!=="success") return `Registrato: ${name} su ${target} fallita.`;
  const effect=maneuver.kind==="grapple"?`${target} Afferrato`:maneuver.effect==="prone"?`${target} Prono`:`${target} spinto via di 1,5 m`;
  return `Registrato: ${name} riuscita, ${effect}.`;
}

export function bootPcAttack(documentRef=document,overrides={}) {
  const api=overrides.api || OBR;
  const lifecycle=overrides.lifecycle || createSceneLifecycleAdapter({obr:api});
  const runtime=overrides.runtime || createPcAttackRuntime({api,
    getEpoch:()=>lifecycle.currentEpoch(),
    isCurrentEpoch:epoch=>lifecycle.isReady() && lifecycle.currentEpoch()===epoch});
  const undoEntry=overrides.undo || defaultPcAttackUndo;
  const schedule=overrides.schedule || ((callback,delay)=>setTimeout(callback,delay));
  // A monster's full stat block, kept in this browser (fase 4, lotto 5): its traits, reactions and legendary actions.
  let statblockText=overrides.statblockText || null;
  async function monsterTraitEntries(item) {
    const card=item?.metadata?.[META_KEY]?.initiativeCard || {};
    // The console is the GM's (pcAttackLauncher.js): the sheet's rule, an NPC's monster card only.
    const ref=monsterStatblockTextRef({isGM:true,attitude:item?.metadata?.[META_KEY]?.attitude,card});
    if(!ref) return [];
    statblockText ||= createMonsterStatblockTextLoader();
    // Read again only when the card's monster changes (a new import): the reloads on every token change cost nothing.
    const view=await statblockText.view(ref,{fromArchive:card[MONSTER_PROFILE_FIELD]?.source==="5etools",
      revision:JSON.stringify(card[MONSTER_PROFILE_FIELD] || null)}).catch(()=>null);
    return pcAttackMonsterTraitEntries(view);
  }
  const params=new URLSearchParams(globalThis.location?.search || "");
  // The open console follows the turn (pcAttackTurnController.js): the actor changes in place.
  let sourceId=overrides.sourceId ?? params.get("source");
  // The picker switches the action (and the spell) in place: both change with it.
  let actionId=overrides.actionId ?? params.get("action") ?? "";
  // The spell the console opens with (the spellbook's or the 🪄 menu's), when the action offers it.
  let requestedSpellId=overrides.spellId ?? params.get("spell") ?? "";
  // The entry last used with each actor, in this browser: opened for the actor without an entry asked (the card's 🗡️,
  // the turn's auto-open, a new actor in place), the console goes back to it. Never needed: storage may be refused.
  const lastEntryKey=id=>`${ID}/pc-attack-last-entry/${id}`;
  const rememberEntry=key=>{try{if(key && sourceId)globalThis.localStorage?.setItem(lastEntryKey(sourceId),key);}catch{}};
  const rememberedEntry=()=>{try{return globalThis.localStorage?.getItem(lastEntryKey(sourceId)) || "";}catch{return "";}};
  let restoreLastAsked=!actionId && !requestedSpellId;
  const confirmSwitch=overrides.confirm || (message=>typeof globalThis.confirm==="function"?globalThis.confirm(message):true);
  // The GM's tracker, opened for a cast (trackerPopover.js, loaded only then): the players' tracker is left as it is.
  const openTracker=overrides.openTracker || (async()=>{
    const module=await import("./trackerPopover.js");
    module.markTrackerPopoverClosed();
    await module.setTrackerPopoverOpen(true);
  });
  const $=id=>documentRef.getElementById(id);
  const form=$("pc-attack-form"),status=$("pc-attack-status"),targetSelect=$("pc-attack-target"),hint=$("pc-attack-target-hint");
  const outcomes=$("pc-attack-outcomes"),damage=$("pc-attack-damage"),defensesBox=$("pc-attack-defenses");
  const total=$("pc-attack-total"),apply=$("pc-attack-apply"),undoButton=$("pc-attack-undo");
  const extrasSection=$("pc-attack-extras-section"),ridersBox=$("pc-attack-riders"),extrasBox=$("pc-attack-extras"),addExtra=$("pc-attack-add-extra");
  const wovenBox=$("pc-attack-woven");
  const activationsBox=$("pc-attack-activations"),activationsCaption=$("pc-attack-activations-caption");
  const palmBox=$("pc-attack-palm"),palmNote=$("pc-attack-palm-note"),palmOutcomes=$("pc-attack-palm-outcomes"),palmAmount=$("pc-attack-palm-amount"),palmApply=$("pc-attack-palm-apply");
  // Quivering Palm: the decision to end the vibrations of the selected target (its own command, its own identity).
  let palmDraft={targetId:"",outcome:"",amount:"",id:newAttackId()};
  // Grapple and Shove (Attacchi tab): the contest's decisions, their own identity; the grapples in progress above the form.
  const maneuverBox=$("pc-attack-maneuver"),maneuverTarget=$("pc-attack-maneuver-target"),maneuverHint=$("pc-attack-maneuver-hint");
  const maneuverEffects=$("pc-attack-maneuver-effects"),maneuverContest=$("pc-attack-maneuver-contest"),maneuverOutcomes=$("pc-attack-maneuver-outcomes");
  const maneuverNote=$("pc-attack-maneuver-note"),grappleBox=$("pc-attack-grapple");
  let maneuverDraft={kind:"",targetId:"",outcome:"",effect:"",id:newAttackId()},grappleSignature="",maneuverSignature="";
  const applyRow=$("pc-attack-apply-row");
  const reactionRow=$("pc-attack-reaction");
  let useReaction=true,reactionSignature="";
  const cantripRow=$("pc-attack-cantrip-row"),cantripSelect=$("pc-attack-cantrip"),cantripNote=$("pc-attack-cantrip-note");
  const spellControls=$("pc-attack-spell-controls");
  const picker=$("pc-attack-picker"),pickerTabs=$("pc-attack-picker-tabs"),pickerSelect=$("pc-attack-picker-select"),pickerList=$("pc-attack-picker-list");
  // The long lists' search.
  const pickerSearch=$("pc-attack-picker-search");
  // The attacks and cantrips in a menu of its own: the entry in use on its button, the cost of each on the right.
  const pickerDropdown=$("pc-attack-picker-dropdown"),dropdownButton=$("pc-attack-picker-dropdown-button"),pickerMenu=$("pc-attack-picker-menu");
  let menuOpen=false;
  function setMenuOpen(open,{focus=false}={}) {
    if(!pickerMenu || !dropdownButton) return;
    menuOpen=!!open && !busy;
    pickerMenu.hidden=!menuOpen;
    dropdownButton.setAttribute("aria-expanded",String(menuOpen));
    if(menuOpen) (pickerMenu.querySelector('[aria-pressed="true"]') || pickerMenu.querySelector("button"))?.focus?.();
    else if(focus) dropdownButton.focus?.();
  }
  dropdownButton?.addEventListener("click",()=>setMenuOpen(!menuOpen));
  dropdownButton?.addEventListener("keydown",event=>{if(event.key==="ArrowDown"){event.preventDefault?.();setMenuOpen(true);}});
  // Up and down move through the menu's entries.
  pickerMenu?.addEventListener("keydown",event=>{
    if(!["ArrowDown","ArrowUp"].includes(event.key)) return;
    event.preventDefault?.();
    const rows=[...pickerMenu.querySelectorAll("button")],at=rows.indexOf(documentRef.activeElement);
    rows[Math.max(0,Math.min(rows.length-1,at+(event.key==="ArrowDown"?1:-1)))]?.focus?.();
  });
  // A click elsewhere closes it.
  documentRef.addEventListener?.("click",event=>{if(menuOpen && !event.target?.closest?.("#pc-attack-picker-dropdown"))setMenuOpen(false);});
  const autoOpenRow=$("pc-attack-auto-open-row"),autoOpenBox=$("pc-attack-auto-open"),autoOpenMonstersBox=$("pc-attack-auto-open-monsters");
  const attackView=$("pc-attack-attack-view"),launchBox=$("pc-attack-launch"),casterLine=$("pc-attack-caster");
  // A monster's card: its Multiattack over the Attacchi tab, its action's note (what the console does not automate).
  const multiattackLine=$("pc-attack-multiattack"),monsterNote=$("pc-attack-monster-note");
  // A spell the console does not resolve (launched, woven into a weapon, or by hand): its card replaces the attack form.
  let launchKey="",launchBusy=false,launchSignature="";
  // Lancia / Usa in the fixed row; the spell's accordion in the attack form; one open state for both.
  const launchButton=$("pc-attack-launch-button"),spellDetailsBox=$("pc-attack-spell-details"),spellDetailsBody=$("pc-attack-spell-details-body");
  let detailsOpen=false,spellDetailsSignature="";
  spellDetailsBox?.addEventListener("toggle",()=>{detailsOpen=!!spellDetailsBox.open;});
  launchButton?.addEventListener("click",()=>{
    const entry=currentEntry();
    if(!launching() || !entry) return;
    if(entry.mode==="maneuver") void registerManeuver(entry);
    else if(entry.mode==="activate") void runFeature(entry);else void launchSpell(entry);
  });
  // The turn moved on while this attack holds decisions: the actor it waits to move to ({sourceId, name}).
  const followBar=$("pc-attack-follow");
  // pendingReady: the attack that held the console is registered, the move is ready.
  let pendingFollow=null,pendingReady=false,followSignature="";
  // Off-turn actions (a reaction, an opportunity attack): the selected creature in the console, then back to the turn's.
  const useSelectedButton=$("pc-attack-use-selected"),useSelectedRow=$("pc-attack-use-selected-row");
  let offPing=null,offAutoOpen=null;
  const extrasCaption=$("pc-attack-extras-caption");
  const modeSelect=$("pc-attack-mode"),outcomeBlock=$("pc-attack-outcome-block"),targetCaption=$("pc-attack-target-caption");
  const areaBox=$("pc-attack-area"),areaNote=$("pc-attack-area-note"),areaList=$("pc-attack-area-list");
  const areaPropose=$("pc-attack-area-propose"),areaAllFailed=$("pc-attack-area-all-failed"),areaAllPassed=$("pc-attack-area-all-passed");
  // A breath weapon's cone or line drawn on the map with the shared area tool (spellAreaRules.js): its creatures are ticked.
  const areaDraw=$("pc-attack-area-draw");
  const placeArea=overrides.placeArea || (request=>requestSpellAreaPlacement(request,{broadcast:api.broadcast,windowRef:globalThis.window}));
  const cancelArea=overrides.cancelArea || (requestId=>cancelSpellAreaPlacementRequest(requestId,{broadcast:api.broadcast}));
  let drawing="";
  // The colour of the drawn shape: the breath's damage type (the metallic breath has none: the arcane colour).
  const breathAreaType=attack=>attack?.breath?(attack.breath.damageType || "force"):"";
  let presentation=null,draft=null,busy=false,committing=false,invalidated=false,lastUndo=null;
  // Eldritch Blast: the beams registered in this console for the cantrip in use (one registration per beam).
  let beamTally={spellId:"",count:0};
  const attackerCard=()=>presentation?.item?.metadata?.[META_KEY]?.initiativeCard || {};
  let selection={status:"none",target:null,candidates:[]},selectionSequence=0,refreshTimer=null,liveSignature="";
  // Every creature selected on the map, the attacker included: who a feature acting on the selection reaches ("Su:").
  let selectedItems=[];
  const unsubscribers=[];
  const node=(tag,text="",className="")=>{const element=documentRef.createElement(tag);element.textContent=text;if(className)element.className=className;return element;};
  // kind: "ok" (done), "warn" (cancelled, nothing done), "error"; none for plain information. The text is unchanged.
  const setStatus=(message,kind="")=>{status.textContent=message;status.dataset.kind=message?kind:"";};
  const targetById=id=>presentation?.targets.find(item=>item.id===id) || null;
  // Any tracked creature, the attacker included (temporary hit points, Bursting Arrow's creatures).
  const creatureById=id=>id===presentation?.item?.id?presentation.item:targetById(id);

  function showUndo(entry) {
    lastUndo=entry?.undoAvailable && entry.historyEntryId ? {historyEntryId:entry.historyEntryId} : null;
    undoButton.hidden=!lastUndo;
  }
  // Lotto L4: the spell cast this registration opens or continues, as the core expects it.
  const isSpellAction=()=>presentation?.action?.source?.kind==="spell";
  const openSpellCast=()=>isSpellAction() && draft?.spellId
    ? pcAttackOpenSpellCast({sourceItem:presentation.item,spellId:draft.spellId,turnState:presentation.turnState}) : null;
  // A cast left open continues by itself (its id and slot), unless the GM starts a new one.
  function syncSpellDraft() {
    if(!isSpellAction() || !draft) return;
    const spell=getPcAttackSpell(draft.spellId);
    const open=draft.spell.fresh?null:openSpellCast();
    if(open){draft.spell.castId=open.castId;draft.spell.slotLevel=open.slotLevel;draft.spell.pact=open.pact===true;return;}
    if(spell && !spell.fromActiveSpell && !Number.isInteger(draft.spell.slotLevel)) {
      const choices=slotChoices();
      const choice=choices.find(entry=>entry.current>0) || choices[0] || null;
      draft.spell.slotLevel=choice?.level ?? spell.level;draft.spell.pact=!!choice?.pact;
    }
  }
  function slotChoices() {
    const spell=getPcAttackSpell(draft?.spellId);
    const meta=presentation?.item?.metadata?.[META_KEY] || {};
    return spell?spellSlotChoices({characterBuild:meta.initiativeCard?.characterBuild,resources:meta.classFeatureState?.resources || {},spellLevel:spell.level}):[];
  }
  function chosenSpellCast(currentDraft=draft) {
    if(!isSpellAction() || !currentDraft?.spellId) return null;
    const spell=currentDraft.spell;
    return {castId:spell.castId,...(Number.isInteger(spell.slotLevel)?{slotLevel:spell.slotLevel}:{}),...(spell.pact?{pact:true}:{}),
      ...(spell.damageType?{damageType:spell.damageType}:{}),...(spell.doubles?{doubles:true}:{})};
  }
  const typedAttack=()=>pcAttackWithSpellType(resolved(),draft?.spell?.damageType);
  function preview() {
    return pcAttackPreview({action:presentation?.action,spellId:draft?.spellId,sourceItem:presentation?.item,targetItem:targetById(draft?.targetId),outcome:draft?.outcome,spellCast:chosenSpellCast(),
      amounts:draft?.amounts,ignoredDefenses:draft?.ignored,riders:chosenRiders(draft),extras:chosenExtras(draft),turnState:presentation?.turnState,
      weaponCantrip:chosenWeaponCantrip(draft),secondaryItem:targetById(secondaryTargetId()),activations:chosenActivations(draft),
      tempHpItems:presentation?[presentation.item,...presentation.targets]:[],attackMode:draft?.attackMode || "",modeAmount:draft?.modeAmount ?? "",
      burstItems:presentation?[presentation.item,...presentation.targets]:[]});
  }
  // 3C: an area attack (area cantrip, Piercing Arrow): the creatures ticked with their save outcomes, one damage roll.
  const isArea=()=>!!resolved()?.area;
  const areaRiders=()=>Object.entries(draft?.riders || {}).filter(([,rider])=>rider.on).map(([id,rider])=>({id,type:rider.type,amount:rider.amount}));
  const areaMembers=()=>Object.entries(draft?.area?.members || {}).filter(([,member])=>member.on)
    .map(([id,member])=>({item:targetById(id),outcome:member.outcome})).filter(member=>member.item);
  function areaPreview() {
    return pcAttackAreaPreview({action:presentation?.action,spellId:draft?.spellId,attackMode:draft?.attackMode || "",sourceItem:presentation?.item,
      members:areaMembers(),amounts:draft?.amounts,riders:areaRiders(),extras:(draft?.extras || []).map(extra=>({...extra})),
      modeAmount:draft?.modeAmount ?? "",turnState:presentation?.turnState});
  }
  const modeOptions=()=>pcAttackModeOptions({action:presentation?.action,sourceItem:presentation?.item,turnState:presentation?.turnState});
  // The second creature of this attack: Green-Flame Blade's, or an activation's (Sweeping Attack, Slashing Flourish…).
  const secondaryTargetId=()=>chosenWeaponCantrip(draft)?.secondary?.targetId
    || chosenActivations(draft).find(activation=>activation.secondaryTargetId)?.secondaryTargetId || "";
  function activationOptions() {
    if(isArea()) return [];
    return pcAttackActivationOptions({action:presentation?.action,spellId:draft?.spellId,attackMode:draft?.attackMode || "",sourceItem:presentation?.item,
      targetItem:targetById(draft?.targetId),turnState:presentation?.turnState,riders:chosenRiders(draft),extras:chosenExtras(draft),outcome:draft?.outcome || ""});
  }
  const wovenOptions=()=>pcAttackWeaponCantripOptions(presentation?.action,attackerCard());
  function riderOptions() {
    return pcAttackRiderOptions({action:presentation?.action,spellId:draft?.spellId,attackMode:draft?.attackMode || "",sourceItem:presentation?.item,
      targetItem:isArea()?null:targetById(draft?.targetId),turnState:presentation?.turnState});
  }
  const resolved=()=>pcAttackResolvedAction(presentation?.action,draft?.spellId,draft?.attackMode || "");
  const characterLevel=()=>totalCharacterLevel(presentation?.item?.metadata?.[META_KEY]?.initiativeCard?.characterBuild);
  // Booming Blade and Green-Flame Blade are cast with a melee weapon attack: the cantrip console points there (or
  // says that this actor has no melee weapon attack to cast them with).
  function weaponCantripHint() {
    const names=pcAttackActionWeaponCantripIds(presentation?.action).map(spellId=>getPcAttackCantrip(spellId)?.name).filter(Boolean);
    if(!names.length) return "";
    const listed=names.length>1?`${names.slice(0,-1).join(", ")} e ${names.at(-1)}`:names[0];
    const hasMeleeWeapon=(Array.isArray(attackerCard().quickActions)?attackerCard().quickActions:[])
      .some(action=>action?.kind==="attack" && action?.source?.kind!=="cantrip" && (action.range || "melee")==="melee");
    return hasMeleeWeapon
      ?`${listed}: usal${names.length>1?"e":"a"} dall'attacco con arma da mischia (Extra al colpo › Trucchetto con l'arma).`
      :`${listed}: aggiungi all'attore un'azione Attacco con arma da mischia per usarl${names.length>1?"e":"a"}.`;
  }
  // Create Bonfire: a lasting zone with concentration, cast from the spell panel.
  function panelCantripHint() {
    const names=pcAttackActionPanelCantripIds(presentation?.action).map(spellId=>getPcAttackCantrip(spellId)?.name).filter(Boolean);
    return names.length?`${names.join(", ")}: lancialo dal pannello incantesimi (zona con concentrazione e TS all'ingresso).`:"";
  }
  // Cantrip actions: the cantrip picker, the on-hit effect still resolved by hand and Eldritch Blast's beams.
  // Leveled attack spells (lotto L4): the spell picker, its slot, the type, matching d8 and where the cast stands.
  function renderSpell() {
    const offered=pcAttackSpellIds(presentation.action);
    cantripRow.hidden=!offered.length;
    cantripSelect.setAttribute("aria-label","Incantesimo");
    cantripSelect.replaceChildren(...offered.map(spellId=>{
      const spell=getPcAttackSpell(spellId);
      const option=node("option",spell?`${spell.name} · ${spell.level}°`:spellId);option.value=spellId;return option;}));
    cantripSelect.value=draft.spellId;cantripSelect.disabled=busy;cantripSelect.hidden=pickerShown();
    const spell=getPcAttackSpell(draft.spellId);
    syncSpellDraft();
    const open=draft.spell.fresh?null:openSpellCast();
    const controls=[];
    if(spell && !spell.fromActiveSpell) {
      const choices=slotChoices();
      const slot=node("select","","inline-select");slot.setAttribute("aria-label","Slot");
      const options=choices.length?choices.map(choice=>{const option=node("option",`Slot ${choice.label}`);option.value=choice.pact?"pact":String(choice.level);return option;})
        :[spell.level,...[1,2,3,4,5,6,7,8,9].filter(level=>level>spell.level)].map(level=>{const option=node("option",`Slot di ${level}°`);option.value=String(level);return option;});
      slot.replaceChildren(...options);
      slot.value=draft.spell.pact?"pact":String(draft.spell.slotLevel ?? spell.level);
      slot.disabled=busy || !!open;
      slot.addEventListener("change",()=>{
        const choice=choices.find(entry=>(entry.pact?"pact":String(entry.level))===slot.value);
        draft.spell.slotLevel=choice?.level ?? Number(slot.value);draft.spell.pact=!!choice?.pact;renderSpell();updateDamageMeta();renderState();});
      controls.push(slot);
      if(open) {
        const fresh=node("button","Nuovo lancio","temp-hp-add");fresh.type="button";fresh.disabled=busy;
        fresh.addEventListener("click",()=>{draft.spell={castId:newCastId(),slotLevel:null,pact:false,damageType:"",doubles:false,fresh:true};renderSpell();updateDamageMeta();renderState();});
        controls.push(fresh);
      }
    }
    if(spell?.types) {
      const type=typeSelect(spell.types,draft.spell.damageType,{placeholder:"— Tipo di danno —",className:"inline-select"});type.setAttribute("aria-label","Tipo di danno");
      type.disabled=busy;
      type.addEventListener("change",()=>{draft.spell.damageType=type.value;renderDamage();renderState();});
      controls.push(type);
    }
    if(spell?.leap) {
      const label=node("label","","option-check");const box=node("input");box.type="checkbox";box.checked=draft.spell.doubles;box.disabled=busy;
      box.addEventListener("change",()=>{draft.spell.doubles=box.checked;renderState();});
      label.append(box,node("span","d8 uguali: balza"));controls.push(label);
    }
    if(spellControls){spellControls.replaceChildren(...controls);spellControls.hidden=!controls.length;}
    const pills=spell && !spell.fromActiveSpell?pcAttackCantripPillLabels(spell.spellId):[];
    const slotLevel=draft.spell.slotLevel ?? spell?.level;
    const progress=open?`${open.leapPending?"Balzo del dardo":`Lancio in corso: ${open.index}/${open.total} registrati`} · slot di ${open.slotLevel}° già speso. ${open.leapPending?"Scegli un'altra creatura entro 9 metri.":""}`
      :spell?.count?`${spell.spellId==="magic-missile"?"Dardi":"Raggi"}: ${spell.count.base+spell.count.perSlot*Math.max(0,(slotLevel || spell.level)-spell.level)} con questo slot; il primo spende lo slot.`:"";
    const notes=[...(progress?[progress.trim()]:[]),...(spell?.ruleNote?[spell.ruleNote]:[]),
      ...(pills.length?[`Al colpo: etichetta ${pills.map(label=>`«${label}»`).join(", ")}.`]:[]),
      ...(spell?.casterHealRatio?["Il caster recupera metà dei danni necrotici inflitti."]:[])];
    cantripNote.textContent=notes.join(" ");cantripNote.hidden=!notes.length;
    renderSpellDetails();
  }
  function renderCantrip() {
    if(isSpellAction()) return renderSpell();
    if(spellControls) spellControls.hidden=true;
    const offered=pcAttackCantripIds(presentation.action);
    cantripRow.hidden=!offered.length;
    if(!offered.length){cantripNote.hidden=true;renderSpellDetails();return;}
    cantripSelect.replaceChildren(...offered.map(spellId=>{
      const cantrip=getPcAttackCantrip(spellId);
      const option=node("option",cantrip?.save?`${cantrip.name} · ${cantrip.area?"area, ":""}TS ${PC_ATTACK_SAVE_LABELS[cantrip.save]}`:cantrip?.name || spellId);
      option.value=spellId;return option;}));
    cantripSelect.value=draft.spellId;cantripSelect.disabled=busy;cantripSelect.hidden=pickerShown();
    const cantrip=getPcAttackCantrip(draft.spellId);
    const pills=cantrip?pcAttackCantripPillLabels(cantrip.spellId):[];
    const beams=pcAttackCantripBeams(cantrip,characterLevel());
    const registered=beamTally.spellId===draft.spellId?beamTally.count:0;
    const beamNote=registered>=beams?`Raggi: registrati tutti e ${beams}.`
      :`Raggi: ${beams} al livello del personaggio${registered?` · registrati ${registered}`:""}. Registra un attacco per raggio.`;
    const notes=[...(cantrip?.scaling==="beams"?[beamNote]:[]),
      ...(cantrip?.save && pcAttackHasPotentCantrip(attackerCard())?["Trucchetto Potente: con il TS superato subisce metà danni."]:[]),
      ...(cantrip?.ruleNote?[cantrip.ruleNote]:[]),
      ...(pills.length?[`${cantrip.save?"Se fallisce":"Al colpo"}: etichetta ${pills.map(label=>`«${label}»`).join(", ")}.`]:[]),
      ...(cantrip?.effectNote?[`${cantrip.save?"Se fallisce":"Al colpo"}, da applicare a mano: ${cantrip.effectNote}`]:[]),
      ...(weaponCantripHint()?[weaponCantripHint()]:[]),...(panelCantripHint()?[panelCantripHint()]:[])];
    cantripNote.textContent=notes.join(" ");cantripNote.hidden=!notes.length;
    renderSpellDetails();
  }
  const typeSelect=(types,value,{placeholder="",format=typeLabel,className="field"}={})=>{
    const select=node("select","",className);
    const options=[...(placeholder?[["",placeholder]]:[]),...types.map(type=>[type,format(type)])].map(([optionValue,label])=>{const option=node("option",label);option.value=optionValue;return option;});
    select.replaceChildren(...options);select.value=value;return select;
  };
  const amountInput=(value,label)=>{
    const input=node("input","","amount");input.type="number";input.min="0";input.step="1";input.inputMode="numeric";input.value=value;
    input.setAttribute("aria-label",label);input.title="Il totale tirato";return input;
  };
  // Every damage row shares one grid: lead (checkbox, remove or nothing), name over a secondary line, amount.
  const componentRow=(lead,body,amount)=>{
    const row=node("div","","component-row");
    const leadCell=node(lead?.type==="checkbox"?"label":"div","","component-lead");if(lead)leadCell.append(lead);
    row.append(leadCell,body,amount);return row;
  };
  const separator=()=>node("span","·","separator");
  // One row per rider of this attacker. Availability, reason and dice change in place (updateRiders),
  // so a selection or turn change never steals the caret from an amount field.
  function renderRiders() {
    const options=riderOptions();
    ridersBox.dataset.riderIds=options.map(option=>option.id).join("|");
    ridersBox.replaceChildren(...options.map(option=>{
      const state=draft.riders[option.id] ||= {on:false,type:option.types[0] || "",amount:"",
        ...(option.slotLevels?{slotLevel:option.slotLevels[0],bonus:false}:{}),...(option.onHit?{onHit:false}:{})};
      const toggle=node("input");toggle.type="checkbox";toggle.dataset.riderField="on";toggle.setAttribute("aria-label",option.label);
      toggle.addEventListener("change",()=>{state.on=toggle.checked;state.auto=false;state.touched=true;updateRiders();renderState();if(state.on)focusAmount(ridersBox,"rider",option.id);});
      const body=node("div","","component-body");
      const title=node("span",option.label,"component-title");
      const meta=node("div","","component-meta");
      const dice=node("span");dice.dataset.riderField="dice";
      const type=option.types.length>1?typeSelect(option.types,state.type,{format:damageTypeLabel,className:"inline-select"}):node("span",damageTypeLabel(option.types[0]));
      if(option.types.length>1){type.dataset.riderField="type";type.setAttribute("aria-label",`Tipo di danno di ${option.label}`);
        type.addEventListener("change",()=>{state.type=type.value;renderState();});}
      meta.append(dice,separator(),type);
      const reason=node("span","","component-reason");reason.dataset.riderField="reason";
      body.append(title,meta,reason);
      // Smites: the slot level (spent with the attack; each level shows what is left), the undead/fiend bonus, the on-hit pill.
      if(option.slotLevels || option.onHit) {
        const extra=node("div","","component-options");extra.dataset.riderField="options";
        if(option.slotLevels) {
          const slot=node("select","","inline-select");slot.dataset.riderField="slot";slot.setAttribute("aria-label",`Livello dello slot di ${option.label}`);
          slot.title="Lo slot si scala con l'attacco; l'annullamento lo restituisce.";
          const meta=presentation?.item?.metadata?.[META_KEY] || {};
          const rows=spellSlotStatus(meta.initiativeCard?.characterBuild,meta.classFeatureState?.resources);
          const slotLabel=level=>{
            const row=option.slotLevels.length===1?rows.find(entry=>entry.pact && entry.level===level) || rows.find(entry=>entry.level===level):rows.find(entry=>!entry.pact && entry.level===level);
            return `Slot ${level}°${row?` · ${row.current}/${row.maximum}`:""}`;
          };
          slot.replaceChildren(...option.slotLevels.map(level=>{const entry=node("option",slotLabel(level));entry.value=String(level);return entry;}));
          slot.value=String(state.slotLevel);slot.disabled=option.slotLevels.length===1;
          slot.addEventListener("change",()=>{state.slotLevel=Number(slot.value);updateRiders();renderState();});
          extra.append(slot);
        }
        const check=(field,label)=>{
          const wrap=node("label","","option-check");const box=node("input");box.type="checkbox";box.dataset.riderField=field;box.checked=state[field]===true;
          box.addEventListener("change",()=>{state[field]=box.checked;updateRiders();renderState();});
          wrap.append(box,node("span",label));return wrap;
        };
        if(option.bonus) extra.append(check("bonus",option.bonus.label));
        if(option.onHit) extra.append(check("onHit",option.onHit.label));
        body.append(extra);
      }
      const amount=amountInput(state.amount,`Danni di ${option.label}`);amount.dataset.riderField="amount";
      amount.addEventListener("input",()=>{state.amount=amount.value.trim();renderState();});
      const row=componentRow(toggle,body,amount);row.dataset.riderId=option.id;
      return row;
    }));
    updateRiders(options);
  }
  function updateRiders(options=riderOptions()) {
    // Other riders, or a new draft after a commit: rebuild the rows (fresh fields) instead of patching them.
    if(ridersBox.dataset.riderIds!==options.map(option=>option.id).join("|") || options.some(option=>!draft.riders[option.id])) return renderRiders();
    ridersBox.hidden=!options.length;
    for(const option of options) {
      const row=ridersBox.querySelector(`[data-rider-id="${option.id}"]`);
      const state=draft.riders[option.id];
      // A rider that stops applying (another target, a new turn) is unticked; its amount stays.
      if(!option.available) state.on=false;
      // One that applies to every hit (Improved Divine Smite) ticks itself, until the GM unticks it for this attack.
      else if(option.auto && !state.touched && !state.on){state.on=true;state.auto=true;}
      const field=name=>row.querySelector(`[data-rider-field="${name}"]`);
      field("on").checked=state.on;field("on").disabled=busy || !option.available;
      field("amount").hidden=!state.on;field("amount").disabled=busy;
      if(field("type")) field("type").disabled=busy;
      const dice=option.slotLevels?(state.bonus?option.bonus.diceBySlot:option.diceBySlot)[state.slotLevel]:option.dice;
      field("dice").textContent=dice?(draft.outcome==="critical"?`${dice} · critico ${pcAttackCriticalDice(dice)}`:dice):"—";
      field("amount").placeholder=dice?(draft.outcome==="critical"?pcAttackCriticalDice(dice):dice):"";
      if(field("options")) field("options").hidden=!state.on;
      for(const name of ["slot","bonus","onHit"]) if(field(name)) field(name).disabled=busy || (name==="slot" && option.slotLevels.length===1);
      field("reason").textContent=option.available?option.warning || "":option.reason;
      row.dataset.unavailable=option.available?"false":"true";
    }
  }
  // One row per activation of this attacker (the same grid as the riders): its die and type, the resource left, the
  // save and its DC; ticked, the amount, the save outcome and the effect. Rebuilt only when the list changes.
  function renderActivations() {
    if(!activationsBox) return;
    const options=activationOptions();
    activationsBox.dataset.activationIds=options.map(option=>option.id).join("|");
    activationsBox.replaceChildren(...options.map(option=>{
      const state=draft.activations[option.id] ||= {on:false,type:option.types[0] || "",amount:"",saveOutcome:"",secondaryTargetId:"",choice:"",
        ...(option.tempHp?{tempHp:[{targetId:"",amount:""}]}:{})};
      let tempHpList=null;
      const toggle=node("input");toggle.type="checkbox";toggle.dataset.activationField="on";toggle.setAttribute("aria-label",option.label);
      toggle.addEventListener("change",()=>{
        state.on=toggle.checked;
        // One maneuver (one Arcane Shot, one flourish) per attack: ticking one unticks the others of its group.
        if(state.on && option.group) for(const other of activationOptions()) if(other.group===option.group && other.id!==option.id && draft.activations[other.id]) draft.activations[other.id].on=false;
        updateActivations();renderState();
        if(state.on) focusAmount(activationsBox,"activation",option.id);
      });
      const body=node("div","","component-body");
      const title=node("span",option.label,"component-title");
      const meta=node("div","","component-meta");meta.dataset.activationField="meta";
      const reason=node("span","","component-reason");reason.dataset.activationField="reason";
      body.append(title,meta,reason);
      const extra=node("div","","component-options");extra.dataset.activationField="options";
      if(option.types.length>1) {
        const type=typeSelect(option.types,state.type,{format:damageTypeLabel,className:"inline-select"});type.dataset.activationField="type";
        type.setAttribute("aria-label",`Tipo di danno di ${option.label}`);type.addEventListener("change",()=>{state.type=type.value;renderState();});
        extra.append(type);
      }
      // Open Hand Technique: the effect, each with its own save.
      if(option.choices) {
        const choice=node("select","","inline-select");choice.dataset.activationField="choice";choice.setAttribute("aria-label",`Effetto di ${option.label}`);
        choice.replaceChildren(...[["","Scegli l'effetto"],...option.choices.map(entry=>[entry.id,entry.label])].map(([value,label])=>{const entry=node("option",label);entry.value=value;return entry;}));
        choice.value=state.choice;
        choice.addEventListener("change",()=>{state.choice=choice.value;state.saveOutcome="";updateActivations();renderState();});
        extra.append(choice);
      }
      // Inspiring Smite: the creatures that share the total (the row's amount), each with its temporary hit points.
      if(option.tempHp) {
        tempHpList=node("div","","temp-hp-list");tempHpList.dataset.activationField="temp-hp";
      }
      // Bursting Arrow: the creatures around the target, proposed from the map and ticked by the GM.
      if(option.burst) {
        const list=node("div","","burst-list");list.dataset.activationField="burst";
        extra.append(list);
      }
      // The second creature the die also (or only) damages: any other tracked creature than the attacker and the target.
      if(option.secondary) {
        const second=node("select","","inline-select");second.dataset.activationField="secondary";second.setAttribute("aria-label",`Seconda creatura di ${option.label}`);
        second.addEventListener("change",()=>{state.secondaryTargetId=second.value;updateActivations();renderState();});
        extra.append(second);
      }
      if(option.save || option.choices?.some(entry=>entry.save)) {
        const group=node("div","","segmented mini");group.setAttribute("role","group");group.setAttribute("aria-label",`Tiro salvezza contro ${option.label}`);
        group.dataset.activationField="save";
        for(const outcome of ["failed","passed"]) {
          const button=node("button",PC_ATTACK_OUTCOME_LABELS[outcome]);button.type="button";button.dataset.outcome=outcome;button.dataset.activationField=`save-${outcome}`;
          button.addEventListener("click",()=>{state.saveOutcome=outcome;updateActivations();renderState();});
          group.append(button);
        }
        extra.append(group);
      }
      const effect=node("span","","effect-hint");effect.dataset.activationField="effect";extra.append(effect);
      body.append(extra);
      const amount=amountInput(state.amount,option.tempHp?`Totale PF temporanei di ${option.label}`:`Danni di ${option.label}`);amount.dataset.activationField="amount";
      amount.addEventListener("input",()=>{state.amount=amount.value.trim();renderState();});
      const row=componentRow(toggle,body,amount);row.dataset.activationId=option.id;
      if(tempHpList) row.append(tempHpList);
      return row;
    }));
    updateActivations(options);
  }
  function updateActivations(options=activationOptions()) {
    if(!activationsBox) return;
    if(activationsBox.dataset.activationIds!==options.map(option=>option.id).join("|") || options.some(option=>!draft.activations[option.id])) return renderActivations();
    activationsBox.hidden=!options.length;
    // On a miss the section caption already says what these are ("Prima del tiro").
    if(activationsCaption) activationsCaption.hidden=!options.length || draft.outcome==="miss";
    const resourceText=option=>option.resources.map(entry=>entry.unlimited || entry.current===null?entry.name:`${entry.name} ${entry.current}/${entry.maximum ?? "?"}`);
    const listed=options.filter(option=>draft.outcome!=="miss" || option.preRoll).map(option=>resourceText(option).join(" · "));
    const common=activationsCaption && !activationsCaption.hidden && listed.length>1 && listed[0] && listed.every(text=>text===listed[0])?listed[0]:"";
    if(activationsCaption) activationsCaption.replaceChildren(node("span","Attivazioni"),...(common?[node("span",` · ${common}`,"subcaption-detail")]:[]));
    const critical=dice=>draft.outcome==="critical" && dice?`${dice} · critico ${pcAttackCriticalDice(dice)}`:dice;
    for(const option of options) {
      const row=activationsBox.querySelector(`[data-activation-id="${option.id}"]`);
      const state=draft.activations[option.id];
      // An activation that stops applying (another target, a new turn, a rider unticked) is unticked; its amount stays.
      if(!option.available) state.on=false;
      if(option.types.length && !option.types.includes(state.type)) state.type=option.types[0];
      const field=name=>row.querySelector(`[data-activation-field="${name}"]`);
      field("on").checked=state.on;field("on").disabled=busy || !option.available;
      const resource=common?[]:resourceText(option);
      const dice=option.tempHp?`${option.dice || "2d8 + livello"} PF temporanei`
        :option.damage || option.secondary?`${(option.noCriticalDouble?option.dice:critical(option.dice)) || "dado"} ${option.types.length===1?damageTypeLabel(option.types[0]):""}`.trim():"";
      // A choice's save and effect replace the activation's (Open Hand Technique).
      const choice=option.choices?option.choices.find(entry=>entry.id===state.choice) || null:null;
      const save=choice?choice.save:option.save;
      const saveText=save?`TS ${save.label}${save.dc?` CD ${save.dc}`:""}`:"";
      // Each part keeps its words together ("TS Saggezza CD 16"): the line wraps only between parts.
      field("meta").textContent=[dice,option.rollBonus?`${option.rollBonus} al tiro per colpire`:"",
        ...resource,...(state.on?[saveText,option.size || ""]:[])].filter(Boolean).map(part=>part.replace(/ /gu," ")).join(" · ");
      field("reason").textContent=option.available?option.warning || "":option.reason;
      field("options").hidden=!state.on;
      // On a miss only the activations used on the roll itself are listed.
      row.hidden=draft.outcome==="miss" && !option.preRoll;
      field("amount").hidden=!state.on || !(option.damage || option.secondary || option.tempHp);field("amount").disabled=busy;
      field("amount").placeholder=option.tempHp?"":critical(option.dice)?.split(" · critico ").at(-1) || "";
      if(field("choice")){field("choice").value=state.choice;field("choice").disabled=busy;}
      if(field("save")) field("save").hidden=!save;
      if(field("temp-hp")){field("temp-hp").hidden=!state.on;updateTempHp(field("temp-hp"),option,state);}
      if(field("burst")) updateBurst(field("burst"),option,state);
      const second=field("secondary");
      if(second) {
        const others=presentation.targets.filter(item=>item.id!==draft.targetId);
        if(state.secondaryTargetId && !others.some(item=>item.id===state.secondaryTargetId)) state.secondaryTargetId="";
        second.replaceChildren(...[["","Seconda creatura"],...others.map(item=>[item.id,bossTargetLabel(item)])].map(([value,label])=>{const entry=node("option",label);entry.value=value;return entry;}));
        second.value=state.secondaryTargetId;second.disabled=busy;
      }
      if(field("type")) field("type").disabled=busy;
      for(const outcome of ["failed","passed"]) {
        const button=field(`save-${outcome}`);
        if(button){button.setAttribute("aria-pressed",String(state.saveOutcome===outcome));button.disabled=busy;}
      }
      // What happens: the pill (on the target, or on the attacker), the condition or the note, and when.
      const shownEffect=choice?choice.effect:option.effect;
      const effect=shownEffect?(shownEffect.kind==="note"?shownEffect.label
        :`${save?"Se fallisce":"Effetto"}: ${shownEffect.self?`${shownEffect.label} su di sé`:shownEffect.label}`):"";
      const secondNote=option.secondary?`Seconda creatura ${option.secondary.note}${option.secondary.targetDamage?", stesso dado del bersaglio":""}.`:"";
      field("effect").textContent=[effect,secondNote,option.note || "",option.hint || ""].filter(Boolean).join(" ");
      field("effect").hidden=!field("effect").textContent;
      row.dataset.unavailable=option.available?"false":"true";
    }
  }
  // Inspiring Smite's distribution: a creature picker and an amount per line (the attacker included, never the creatures
  // the attack damages), rebuilt only when lines are added or removed so a typed amount keeps its caret.
  function updateTempHp(list,option,state) {
    const recipients=[presentation.item,...presentation.targets].filter(item=>item.id!==draft.targetId && item.id!==secondaryTargetId());
    for(const entry of state.tempHp) if(entry.targetId && !recipients.some(item=>item.id===entry.targetId)) entry.targetId="";
    const signature=`${state.tempHp.length}|${recipients.map(item=>item.id).join(",")}`;
    if(list.dataset.signature!==signature) {
      list.dataset.signature=signature;
      const rows=state.tempHp.map((entry,index)=>{
        const row=node("div","","temp-hp-row");row.dataset.tempHpIndex=String(index);
        const who=node("select","","inline-select");who.dataset.tempHpField="target";who.setAttribute("aria-label","Creatura che riceve i PF temporanei");
        who.replaceChildren(...[["","Creatura"],...recipients.map(item=>[item.id,item.id===presentation.item.id?`${item.name || item.id} (sé)`:bossTargetLabel(item)])]
          .map(([value,label])=>{const option=node("option",label);option.value=value;return option;}));
        who.addEventListener("change",()=>{entry.targetId=who.value;renderState();});
        const amount=amountInput(entry.amount,"PF temporanei");amount.dataset.tempHpField="amount";
        amount.addEventListener("input",()=>{entry.amount=amount.value.trim();renderState();});
        const remove=node("button","×","lead-remove");remove.type="button";remove.title="Rimuovi creatura";remove.setAttribute("aria-label","Rimuovi creatura");
        remove.addEventListener("click",()=>{state.tempHp.splice(index,1);if(!state.tempHp.length)state.tempHp.push({targetId:"",amount:""});updateActivations();renderState();});
        row.append(remove,who,amount);return row;
      });
      const add=node("button","+ Creatura","temp-hp-add");add.type="button";add.dataset.tempHpField="add";
      add.addEventListener("click",()=>{state.tempHp.push({targetId:"",amount:""});updateActivations();renderState();});
      list.replaceChildren(...rows,add);
    }
    list.querySelectorAll("[data-temp-hp-index]").forEach(row=>{
      const entry=state.tempHp[Number(row.dataset.tempHpIndex)];
      const who=row.querySelector('[data-temp-hp-field="target"]');who.value=entry.targetId;who.disabled=busy;
      row.querySelector('[data-temp-hp-field="amount"]').disabled=busy;
      row.querySelector(".lead-remove").disabled=busy;
    });
    const add=list.querySelector('[data-temp-hp-field="add"]');
    if(add) add.disabled=busy || state.tempHp.length>=Math.max(1,recipients.length);
  }
  // Bursting Arrow's creatures: those within its radius of the target (a proposal read from the map when the row is ticked
  // or the target changes), each with a tick; never the target, which takes the die as a component.
  function updateBurst(list,option,state) {
    state.burst ||= {targetId:"",ids:[]};
    if(state.on && draft.targetId && state.burst.targetId!==draft.targetId) {
      const targetId=draft.targetId;
      state.burst={targetId,ids:[],pending:true};
      if(typeof runtime.getPcAttackNearby==="function")
        void runtime.getPcAttackNearby({sourceId,centerId:targetId,radiusFeet:option.burst.radiusFeet}).then(ids=>{
          if(state.burst.targetId!==targetId) return;
          state.burst={targetId,ids:ids.filter(id=>id!==targetId && creatureById(id))};
          updateActivations();renderState();
        }).catch(()=>{if(state.burst.targetId===targetId)state.burst.pending=false;});
    }
    const candidates=[presentation.item,...presentation.targets].filter(item=>item.id!==draft.targetId && item.id!==secondaryTargetId());
    state.burst.ids=state.burst.ids.filter(id=>candidates.some(item=>item.id===id));
    const signature=candidates.map(item=>item.id).join(",");
    if(list.dataset.signature!==signature) {
      list.dataset.signature=signature;
      list.replaceChildren(...candidates.map(item=>{
        const wrap=node("label","","option-check");const box=node("input");box.type="checkbox";box.dataset.burstId=item.id;
        box.addEventListener("change",()=>{state.burst.ids=box.checked?[...new Set([...state.burst.ids,item.id])]:state.burst.ids.filter(id=>id!==item.id);renderState();});
        wrap.append(box,node("span",item.id===presentation.item.id?`${item.name || item.id} (sé)`:bossTargetLabel(item)));return wrap;
      }));
    }
    list.querySelectorAll("[data-burst-id]").forEach(box=>{box.checked=state.burst.ids.includes(box.dataset.burstId);box.disabled=busy;});
  }
  // The arrow that replaces the attack roll: picked before the outcome (the outcomes become saves; Piercing an area).
  function renderMode() {
    if(!modeSelect) return;
    const options=modeOptions();
    modeSelect.hidden=!options.length;
    if(!options.length) return;
    modeSelect.replaceChildren(...[{id:"",label:"Tiro per colpire",available:true},...options].map(option=>{
      const entry=node("option",option.id?`${option.label} · ${option.kind==="area"?"linea, ":""}TS ${option.save.label}${option.save.dc?` CD ${option.save.dc}`:""}`:option.label);
      entry.value=option.id;entry.disabled=!option.available && option.id!==draft.attackMode;if(option.reason)entry.title=option.reason;return entry;
    }));
    modeSelect.value=draft.attackMode || "";modeSelect.disabled=busy;
  }
  // The creatures of an area attack: proposed from the map around the caster (area cantrips), or ticked by hand
  // (Piercing Arrow's line); each with its save outcome.
  function renderArea() {
    if(!areaBox) return;
    const attack=resolved(),area=attack?.area;
    areaBox.hidden=!area;
    if(!area) return;
    const name=presentation.item?.name || "l'attaccante";
    // A breath weapon: its cone or line, its dice at this level (the damage's hint), its save and DC.
    // Acid Spit: its one creature, nothing on a success. The metallic breath: its condition on a failure, no damage.
    const breathWhere=area.shape==="target"?"Un bersaglio entro 9 m: spuntalo. "
      :`${area.shape==="line"?"Linea di 9 m":"Cono di 4,5 m"}: disegnalo sulla mappa o spunta le creature colpite. `;
    const onFail=attack.breath?.onFail;
    const breathEffect=onFail
      ?`${pcAttackSaveLabel(attack,attackerCard())}: chi fallisce è ${onFail.condition.toLowerCase()}${onFail.when?` ${onFail.when}`:""}.${onFail.note?` ${onFail.note}`:""}`
      :`${attack.components[0]?.formula || ""} ${damageTypeLabel(attack.breath?.damageType)} · ${pcAttackSaveLabel(attack,attackerCard())}, ${attack.breath?.half===false?"niente se superato":"metà se superato"}.`;
    const breathNote=attack.breath?breathWhere+breathEffect:"";
    areaNote.textContent=breathNote || pcAttackMonsterAreaNote(attack,attackerCard()) || (area.manual?"Sulla linea di 9 m: spunta le creature colpite."
      :`Entro 1,5 m da ${name}${area.chosen?", solo quelle che scegli":", alleati compresi"}.`);
    areaPropose.hidden=!!area.manual;
    if(areaDraw){areaDraw.hidden=!pcBreathAreaRuleId(area.shape,breathAreaType(attack));areaDraw.textContent=drawing?"Disegno…":"Disegna";}
    const key=`${draft.spellId}|${draft.attackMode}`;
    if(!area.manual && draft.area.proposalKey!==key && typeof runtime.getPcAttackNearby==="function") {
      draft.area.proposalKey=key;
      void runtime.getPcAttackNearby({sourceId,centerId:sourceId,radiusFeet:area.radiusFeet}).then(ids=>{
        if(draft?.area?.proposalKey!==key) return;
        for(const item of presentation.targets) draft.area.members[item.id]={on:ids.includes(item.id),outcome:draft.area.members[item.id]?.outcome || ""};
        renderArea();renderState();
      }).catch(()=>{});
    }
    const signature=presentation.targets.map(item=>item.id).join(",");
    if(areaList.dataset.signature!==signature) {
      areaList.dataset.signature=signature;
      areaList.replaceChildren(...presentation.targets.map(item=>{
        const row=node("div","","area-row");row.dataset.areaId=item.id;
        const lead=node("label","","component-lead");
        const box=node("input");box.type="checkbox";box.dataset.areaField="on";box.setAttribute("aria-label",`${item.name || item.id} nell'area`);
        box.addEventListener("change",()=>{const member=draft.area.members[item.id] ||= {on:false,outcome:""};member.on=box.checked;renderArea();renderState();});
        lead.append(box);
        const label=node("span","","area-name");label.dataset.areaField="name";
        const outcomesBox=node("div","","segmented mini");outcomesBox.setAttribute("role","group");outcomesBox.setAttribute("aria-label",`Tiro salvezza di ${item.name || item.id}`);
        for(const outcome of ["failed","passed"]) {
          const button=node("button",PC_ATTACK_OUTCOME_LABELS[outcome]);button.type="button";button.dataset.outcome=outcome;button.dataset.areaField=outcome;
          button.addEventListener("click",()=>{const member=draft.area.members[item.id] ||= {on:false,outcome:""};member.on=true;member.outcome=outcome;renderArea();renderState();});
          outcomesBox.append(button);
        }
        row.append(lead,label,outcomesBox);return row;
      }));
    }
    for(const item of presentation.targets) {
      const row=areaList.querySelector(`[data-area-id="${item.id}"]`);
      if(!row) continue;
      const member=draft.area.members[item.id] || {on:false,outcome:""};
      const meta=item.metadata?.[META_KEY] || {};
      row.dataset.on=String(!!member.on);
      const box=row.querySelector('[data-area-field="on"]');box.checked=!!member.on;box.disabled=busy;
      const label=row.querySelector('[data-area-field="name"]');label.replaceChildren(node("span",item.name || item.id));
      if(Number.isFinite(meta.hp)) label.append(node("span",` · ${meta.hp}/${meta.hpMax} PF`,"area-hp"));
      for(const outcome of ["failed","passed"]) {
        const button=row.querySelector(`[data-area-field="${outcome}"]`);
        button.setAttribute("aria-pressed",String(!!member.on && member.outcome===outcome));button.disabled=busy;
      }
    }
    for(const button of [areaPropose,areaAllFailed,areaAllPassed]) button.disabled=busy;
    if(areaDraw) areaDraw.disabled=busy || !!drawing;
  }
  // Quivering Palm: the target carries this monk's vibrations; ending them is an action of its own (save outcome, the
  // 10d10 on a success), committed apart from the attack.
  function renderPalm() {
    if(!palmBox) return;
    const target=targetById(draft?.targetId);
    const palm=presentation && target?pcAttackQuiveringPalm(presentation.item,target):null;
    palmBox.hidden=!palm;
    if(!palm) return;
    if(palmDraft.targetId!==target.id) palmDraft={targetId:target.id,outcome:"",amount:"",id:newAttackId()};
    palmNote.textContent=`vibrazioni attive · TS Costituzione${palm.dc?` CD ${palm.dc}`:""}`;
    palmOutcomes.replaceChildren(...[["failed","TS fallito · 0 PF"],["passed",`TS superato · ${palm.dice}`],["none","Senza effetto"]].map(([value,label])=>{
      const button=node("button",label);button.type="button";button.dataset.outcome=value;
      button.setAttribute("aria-pressed",String(palmDraft.outcome===value));button.disabled=busy;
      button.addEventListener("click",()=>{palmDraft.outcome=value;renderPalm();});
      return button;
    }));
    palmAmount.hidden=palmDraft.outcome!=="passed";palmAmount.disabled=busy;
    if(palmAmount.value!==palmDraft.amount) palmAmount.value=palmDraft.amount;
    palmApply.disabled=busy || invalidated || !palmDraft.outcome
      || (palmDraft.outcome==="passed" && !(palmDraft.amount!=="" && Number.isSafeInteger(Number(palmDraft.amount)) && Number(palmDraft.amount)>=0));
  }
  // Booming Blade / Green-Flame Blade woven into a melee weapon attack: the cantrip picker, its extra damage on the hit
  // (from 5th level) and Green-Flame Blade's second creature. Rebuilt only when the cantrip changes (updateWoven
  // patches the rest in place, so a selection never steals the caret).
  function renderWoven() {
    if(!wovenBox) return;
    const options=wovenOptions();
    wovenBox.hidden=!options.length;
    if(!options.length){wovenBox.replaceChildren();return;}
    const state=draft.woven;
    const option=options.find(entry=>entry.spellId===state.spellId) || null;
    if(!option) state.spellId="";
    const picker=node("select","","inline-select");picker.dataset.wovenField="spell";picker.setAttribute("aria-label","Trucchetto con l'arma");
    picker.replaceChildren(...[["","Nessuno"],...options.map(entry=>[entry.spellId,entry.name])].map(([value,label])=>{const entry=node("option",label);entry.value=value;return entry;}));
    picker.value=state.spellId;picker.disabled=busy;
    picker.addEventListener("change",()=>{Object.assign(state,{spellId:picker.value,amount:"",secondaryTargetId:"",secondaryAmount:""});renderWoven();renderState();});
    const body=node("div","","component-body");
    const title=node("span","","component-title");title.append("Trucchetto con l'arma");
    const meta=node("div","","component-meta");meta.dataset.wovenField="meta";
    const pickerLine=node("div","","component-options");pickerLine.append(picker);
    body.append(title,pickerLine,meta);
    const amount=amountInput(state.amount,`Danni di ${option?.name || "trucchetto"}`);amount.dataset.wovenField="amount";
    amount.hidden=!option?.dice?.hit;amount.disabled=busy;
    amount.addEventListener("input",()=>{state.amount=amount.value.trim();renderState();});
    const rows=[componentRow(null,body,amount)];
    if(option?.secondary) {
      const secondBody=node("div","","component-body");
      const secondTitle=node("span","Seconda creatura","component-title");
      const target=node("select","","inline-select");target.dataset.wovenField="secondary";target.setAttribute("aria-label","Seconda creatura");
      target.addEventListener("change",()=>{state.secondaryTargetId=target.value;renderState();updateWoven();});
      const secondMeta=node("div","","component-meta");secondMeta.dataset.wovenField="secondaryMeta";
      const secondLine=node("div","","component-options");secondLine.append(target);
      secondBody.append(secondTitle,secondLine,secondMeta);
      const secondAmount=amountInput(state.secondaryAmount,"Danni della seconda creatura");secondAmount.dataset.wovenField="secondaryAmount";
      secondAmount.disabled=busy;
      secondAmount.addEventListener("input",()=>{state.secondaryAmount=secondAmount.value.trim();renderState();updateWoven();});
      rows.push(componentRow(null,secondBody,secondAmount));
    }
    wovenBox.replaceChildren(...rows);
    wovenBox.dataset.spellId=state.spellId;
    updateWoven();
  }
  function updateWoven() {
    if(!wovenBox) return;
    // Another cantrip, or a new draft after a commit: rebuild the rows instead of patching them.
    if((wovenBox.dataset.spellId || "")!==(draft.woven.spellId || "") || wovenBox.hidden!==!wovenOptions().length) return renderWoven();
    if(wovenBox.hidden) return;
    const state=draft.woven;
    const option=wovenOptions().find(entry=>entry.spellId===state.spellId) || null;
    const field=name=>wovenBox.querySelector(`[data-woven-field="${name}"]`);
    const critical=dice=>draft.outcome==="critical" && dice?`${dice} · critico ${pcAttackCriticalDice(dice)}`:dice;
    const meta=field("meta");
    if(meta) meta.textContent=!option?"Lama Roboante o Lama Verdefiamma, se l'attacco colpisce."
      :[option.dice.hit?`${critical(option.dice.hit)} ${damageTypeLabel(option.type)}`:"",
        option.trigger?`etichetta «Movimento: danni tuono» (${option.dice.trigger}) fino all'inizio del tuo prossimo turno`:""].filter(Boolean).join(" · ")
        || "Nessun danno extra al colpo prima del 5° livello.";
    const target=field("secondary");
    if(target) {
      // The second creature: any other tracked creature than the attacker and the target, or none.
      const others=presentation.targets.filter(item=>item.id!==draft.targetId);
      if(state.secondaryTargetId && !others.some(item=>item.id===state.secondaryTargetId)) state.secondaryTargetId="";
      target.replaceChildren(...[["","Nessuna"],...others.map(item=>[item.id,bossTargetLabel(item)])].map(([value,label])=>{const entry=node("option",label);entry.value=value;return entry;}));
      target.value=state.secondaryTargetId;target.disabled=busy;
      const second=preview().secondary;
      field("secondaryMeta").textContent=`${option.dice.secondary} ${damageTypeLabel(option.type)}${second?.hp?` · PF ${second.hp.before} → ${second.hp.after}`:""}`;
      field("secondaryAmount").hidden=!state.secondaryTargetId;
    }
  }
  // Components added on the fly for this attack only (Booming Blade, Hunter's Mark, a magic weapon).
  function renderExtras() {
    extrasBox.replaceChildren(...draft.extras.map((extra,index)=>{
      const remove=node("button","×","lead-remove");remove.type="button";remove.title="Rimuovi componente";remove.setAttribute("aria-label","Rimuovi componente");
      remove.addEventListener("click",()=>{draft.extras.splice(index,1);renderExtras();renderState();});
      const type=typeSelect(DAMAGE_TYPES.map(entry=>entry.id),extra.type,{placeholder:"Tipo"});type.dataset.extraField="type";type.setAttribute("aria-label","Tipo di danno extra");
      type.addEventListener("change",()=>{extra.type=type.value;renderState();});
      const label=node("input","","field");label.type="text";label.maxLength=40;label.placeholder="Etichetta (es. Lama Roboante)";label.value=extra.label;
      label.dataset.extraField="label";label.setAttribute("aria-label","Etichetta della componente extra");label.addEventListener("input",()=>{extra.label=label.value;});
      const fields=node("div","","component-body extra-fields");fields.append(type,label);
      const amount=amountInput(extra.amount,"Danni extra");amount.dataset.extraField="amount";
      amount.addEventListener("input",()=>{extra.amount=amount.value.trim();renderState();});
      for(const element of [type,amount,label,remove]) element.disabled=busy;
      const row=componentRow(remove,fields,amount);row.dataset.extraIndex=String(index);
      return row;
    }));
    addExtra.disabled=busy || draft.extras.length>=MAX_PC_ATTACK_EXTRAS;
  }
  // The picker (pcAttackPickerCore.js): the actor's weapon attacks, cantrips and attack spells. With one entry it
  // hides; when it shows, the cantrip or spell select below gives way to it (its notes and slot controls stay).
  const pickerShown=()=>!!picker && !picker.hidden;
  // The casting time at a glance: azione, azione bonus, reazione, or the time itself (1 minuto, 10 minuti…); "" until
  // the reference is loaded.
  function castingTimeLabel(spellId) {
    const text=String(spellId?spellbookSpellDetails(spellId)?.castingTime || "":"").trim().toLocaleLowerCase("it");
    if(!text) return "";
    if(text.includes("reazione")) return "reazione";
    if(text.includes("azione bonus")) return "azione bonus";
    if(/^1 azione\b/u.test(text)) return "azione";
    return text.split(",")[0];
  }
  // The cost of an action, capitalised and colour-coded as in Baldur's Gate 3 (pc-attack.html: action green, bonus action
  // orange, reaction purple); any other activation or casting time keeps the neutral colour.
  const COST_KINDS=Object.freeze({"azione":"action","azione bonus":"bonus","reazione":"reaction"});
  const costKind=label=>COST_KINDS[String(label || "").trim().toLocaleLowerCase("it")] || "";
  function costTag(label,className="cost-tag") {
    const tag=node("span",capitalized(String(label || "")),className);
    const kind=costKind(label);
    if(kind) tag.dataset.cost=kind;
    return tag;
  }
  // The entry on screen: the spell card shown, else the attack in the form.
  function currentEntry() {
    const entries=presentation?.picker || [];
    if(launchKey) return entries.find(entry=>entry.key===launchKey) || null;
    return draft?pcAttackPickerEntryFor(entries,actionId,draft.spellId):null;
  }
  // The spell card replaces the form: a spell chosen in the picker, or an actor without attacks (spells only).
  const launching=()=>!!launchKey || !draft;
  let pickerSignature="";
  function renderPicker() {
    if(!picker) return;
    const entries=presentation?.picker || [];
    const current=currentEntry();
    picker.hidden=entries.length<2 || !current;
    if(picker.hidden){pickerSignature="";return;}
    const tabs=pcAttackPickerTabs(entries),inTab=entries.filter(entry=>entry.tab===current.tab);
    // The spells and features tabs are lists (by level, by group); the other tabs keep the select.
    const asList=["spells","features"].includes(current.tab) && !!pickerList;
    // A leveled spell cast left open (rays or darts still to register) says so in its entry.
    const inProgress=entry=>entry.mode==="attack" && entry.tab==="spells"
      && !!pcAttackOpenSpellCast({sourceItem:presentation.item,spellId:entry.spellId,turnState:presentation.turnState});
    // In the cantrips and spells tabs ⚔ marks what the console resolves, ★ the favourites (as the 🪄 menu); the select
    // names the casting time too.
    const label=entry=>[entry.pinned?"★ ":"",entry.label,entry.tab!=="attacks" && entry.mode==="attack"?" ⚔":"",
      entry.spellId && castingTimeLabel(entry.spellId)?` · ${capitalized(castingTimeLabel(entry.spellId))}`:"",inProgress(entry)?" · in corso":""].join("");
    if(["cantrips","spells"].includes(current.tab) && !spellbookSpellReferenceLoaded()) {
      void loadSpellbookSpellReference().then(()=>{pickerSignature="";renderPicker();}).catch(()=>{});
    }
    const featureState=presentation.featureState || {};
    const featureUses=entry=>(featureState.resources?.[entry.featureId] || []).filter(row=>!row.unlimited && Number.isFinite(row.current) && Number.isFinite(row.maximum));
    const featureActive=entry=>!!featureState.active?.[entry.featureId]?.length;
    // The slots by level (the spells tab's level headers), and what a row can no longer be used with.
    const sourceMeta=presentation.item?.metadata?.[META_KEY] || {};
    const slots=current.tab==="spells"?spellSlotStatus(sourceMeta.initiativeCard?.characterBuild,sourceMeta.classFeatureState?.resources).filter(row=>row.maximum>0):[];
    const exhausted=entry=>{
      if(entry.tab==="features") {
        const first=(featureState.resources?.[entry.featureId] || [])[0];
        return !!first && !first.unlimited && first.current===0 && !featureActive(entry);
      }
      return entry.tab==="spells" && Number.isInteger(entry.level) && entry.level>0 && slots.length>0 && !inProgress(entry)
        && !slots.some(row=>row.level>=entry.level && row.current>0);
    };
    // A row's marks: its cost first (the activation, or the casting time), coloured, then the uses left (a badge, red at
    // zero) or the spell's marks, each explained in its tooltip. A favourite spell, listed apart, names its level.
    const favourite=entry=>entry.tab==="spells" && entry.pinned;
    const rowCost=entry=>entry.tab==="features"?entry.activation:entry.tab==="attacks"?"azione":castingTimeLabel(entry.spellId);
    const rowParts=entry=>(entry.tab==="features"
      ?[...featureUses(entry).map(row=>({text:`${row.current}/${row.maximum}`,title:row.name,uses:true,zero:row.current===0})),
        featureActive(entry)?{text:"attiva",title:"Capacità attiva"}:null]
      :[favourite(entry)?{text:`${entry.level}°`,title:`Incantesimo di ${entry.level}° livello`}:null,
        entry.tab!=="attacks" && entry.mode==="attack"?{text:"⚔",title:"Si risolve nella console"}:null,entry.concentration?{text:"Conc.",title:"Concentrazione"}:null,
        entry.ritual?{text:"Rit.",title:"Rituale"}:null,inProgress(entry)?{text:"in corso",title:"Lancio in corso: raggi o dardi ancora da registrare"}:null]).filter(Boolean);
    const rowTags=entry=>[capitalized(rowCost(entry)),...rowParts(entry).map(part=>part.text),exhausted(entry)?"esaurita":""].filter(Boolean).join(" · ");
    const rowTagsNode=entry=>{
      const box=node("span","","picker-row-tags"),cost=rowCost(entry);
      const parts=[...(cost?[costTag(cost)]:[]),...rowParts(entry).map(part=>{
        const span=node("span",part.text,part.uses?"uses-badge":"");
        if(part.title) span.title=part.title;
        if(part.zero) span.dataset.zero="true";
        return span;
      })];
      parts.forEach((part,index)=>{if(index)box.append(node("span","·","tag-sep"));box.append(part);});
      return box;
    };
    const groupOf=entry=>entry.tab==="features"?entry.group:favourite(entry)?"pinned":entry.level;
    const groupTitle=group=>group==="pinned"?"★ Preferiti":group==="usable"?"Utilizzabili":group==="other"?"Altre capacità":Number.isInteger(group)?`${group}° livello`
      :PC_ATTACK_MONSTER_GROUP_TITLES[group] || "Altri";
    // The favourites first, then the levels (or the features' groups) in their order.
    const groups=[...new Set(inTab.map(groupOf))].sort((left,right)=>Number(right==="pinned")-Number(left==="pinned"));
    // A level header carries its slots (shown by the CSS from data-slots): "slot 2/3", the pact's "patto 1/2".
    const levelSlots=group=>{
      const rows=Number.isInteger(group) && group>0?slots.filter(row=>row.level===group):[];
      return rows.length?{text:rows.map(row=>`${row.pact?"patto":"slot"} ${row.current}/${row.maximum}`).join(" · "),zero:rows.every(row=>row.current===0)}:null;
    };
    // The features to read (passive, triggered, reference) fold under their header: open when the GM opens it, or when
    // the entry on screen is one of them.
    const otherShown=otherOpen || (current.tab==="features" && current.group==="other");
    // Another tab starts its search afresh.
    if(pickerQueryTab!==current.tab){pickerQueryTab=current.tab;pickerQuery="";if(pickerSearch)pickerSearch.value="";}
    // Rebuilt only when the list changes: a live update never closes the select the GM has open, nor scrolls the list.
    const signature=JSON.stringify([tabs.map(tab=>tab.id),current.tab,asList,otherShown,inTab.map(entry=>[entry.key,label(entry),rowTags(entry)]),
      slots.map(row=>[row.level,row.pact,row.current,row.maximum])]);
    if(signature!==pickerSignature) {
      pickerSignature=signature;
      pickerTabs.replaceChildren(...tabs.map(tab=>{
        const button=node("button",tab.label);button.type="button";button.dataset.pickerTab=tab.id;
        button.addEventListener("click",()=>{
          if(tab.id===currentEntry()?.tab) return;
          chooseEntry(pcAttackPickerDefault(presentation?.picker,{tab:tab.id,lastAttack:presentation?.item?.metadata?.[META_KEY]?.pcAttackState?.lastAttack}));
        });
        return button;
      }));
      pickerSelect.replaceChildren(...(asList?[]:inTab.map(entry=>{const option=node("option",label(entry));option.value=entry.key;return option;})));
      // The menu's entries, the list's rows: the name on the left, the cost and marks on the right.
      if(pickerMenu) pickerMenu.replaceChildren(...(asList?[]:inTab.map(entry=>{
        const row=node("button","","picker-row");row.type="button";row.dataset.pickerKey=entry.key;row.title=label(entry);
        row.append(node("span",`${entry.pinned?"★ ":""}${entry.label}`,"picker-row-name"),rowTagsNode(entry));
        row.addEventListener("click",()=>{setMenuOpen(false,{focus:true});chooseEntry((presentation?.picker || []).find(item=>item.key===entry.key));});
        return row;
      })));
      // The spells by level (as in the 🪄 menu), the features by group: one row each, its marks on the right.
      if(pickerList) pickerList.replaceChildren(...(!asList?[]:groups.flatMap(group=>[
        (()=>{
          const header=node("div",groupTitle(group),"picker-level"),count=levelSlots(group);header.dataset.group=String(group);
          if(count){header.dataset.slots=count.text;if(count.zero)header.dataset.slotsZero="true";}
          if(group==="other") {
            // A header that opens and closes its group, with the number of entries it holds.
            header.dataset.count=String(inTab.filter(entry=>groupOf(entry)==="other").length);header.dataset.open=String(otherShown);
            header.setAttribute("role","button");header.setAttribute("tabindex","0");header.setAttribute("aria-expanded",String(otherShown));
            const toggle=()=>{otherOpen=!otherShown;pickerSignature="";renderPicker();};
            header.addEventListener("click",toggle);
            header.addEventListener("keydown",event=>{if(event.key==="Enter" || event.key===" "){event.preventDefault?.();toggle();}});
          }
          return header;
        })(),
        ...inTab.filter(entry=>groupOf(entry)===group).map(entry=>{
          const row=node("button","","picker-row");row.type="button";row.dataset.pickerKey=entry.key;row.dataset.group=String(group);
          row.dataset.name=entry.label;row.title=entry.label;
          if(exhausted(entry)) row.dataset.exhausted="true";
          row.append(node("span",`${entry.pinned && !favourite(entry)?"★ ":""}${entry.label}`,"picker-row-name"),rowTagsNode(entry));
          row.addEventListener("click",()=>chooseEntry((presentation?.picker || []).find(item=>item.key===entry.key)));
          return row;
        })])));
      if(pickerList) pickerList.dataset.otherOpen=String(otherShown);
    }
    pickerTabs.hidden=tabs.length<2;
    for(const button of pickerTabs.querySelectorAll("button")){button.setAttribute("aria-pressed",String(button.dataset.pickerTab===current.tab));button.disabled=busy;}
    const asDropdown=!asList && !!pickerDropdown && !!dropdownButton && inTab.length>=2;
    pickerSelect.hidden=asList || asDropdown || inTab.length<2;
    if(!asList){pickerSelect.value=current.key;pickerSelect.disabled=busy;}
    if(pickerDropdown) {
      pickerDropdown.hidden=!asDropdown;
      if(!asDropdown) setMenuOpen(false);
      else {
        dropdownButton.replaceChildren(node("span",`${current.pinned?"★ ":""}${current.label}`,"picker-row-name"),rowTagsNode(current),node("span","","picker-dropdown-caret"));
        dropdownButton.title=label(current);dropdownButton.disabled=busy;
        if(busy) setMenuOpen(false);
        for(const row of pickerMenu?.querySelectorAll("button") || []){row.setAttribute("aria-pressed",String(row.dataset.pickerKey===current.key));row.disabled=busy;}
      }
    }
    if(pickerSearch) {
      pickerSearch.hidden=!(asList && inTab.length>12);
      pickerSearch.placeholder=current.tab==="features"?"Cerca capacità…":"Cerca incantesimo…";
    }
    if(pickerList) {
      pickerList.hidden=!asList;
      pickerList.setAttribute("aria-label",current.tab==="features"?"Capacità":"Incantesimi");
      for(const row of pickerList.querySelectorAll("button")){row.setAttribute("aria-pressed",String(row.dataset.pickerKey===current.key));row.disabled=busy;}
      filterPicker();
    }
  }
  // The list's rows that match the search (by name, accents and case aside); without a search, the folded group's rows
  // stay hidden. A header whose rows are all filtered out hides too.
  let pickerQuery="",pickerQueryTab="",otherOpen=false;
  const searchKey=text=>String(text || "").normalize("NFD").replace(/[\u0300-\u036f]/gu,"").toLocaleLowerCase("it").trim();
  function filterPicker() {
    if(!pickerList) return;
    const query=pickerSearch && !pickerSearch.hidden?searchKey(pickerQuery):"";
    const shown=new Set();
    for(const row of pickerList.querySelectorAll("button")) {
      row.hidden=query?!searchKey(row.dataset.name).includes(query):row.dataset.group==="other" && pickerList.dataset.otherOpen!=="true";
      if(!row.hidden) shown.add(row.dataset.group);
    }
    for(const header of pickerList.querySelectorAll(".picker-level")) header.hidden=!!query && !shown.has(header.dataset.group);
  }
  pickerSearch?.addEventListener("input",()=>{pickerQuery=pickerSearch.value;filterPicker();});
  // Another cantrip or spell of the same action changes in place; another action loads it with a fresh draft
  // (the target stays), after a confirmation when this attack already holds decisions.
  // A spell the console does not resolve only shows its card: the attack in progress stays, untouched, behind it.
  function chooseEntry(entry) {
    if(!entry || busy || invalidated || !presentation) return;
    if(entry.mode!=="attack"){launchKey=entry.key;render();return;}
    const previousLaunch=launchKey,fromLaunch=!!launchKey;
    launchKey="";
    if(draft && entry.actionId===actionId) {
      if(entry.spellId && entry.spellId!==draft.spellId) selectSpell(entry.spellId);else renderPicker();
      if(fromLaunch) render();
      return;
    }
    if(draft && draftLocked(draft) && !confirmSwitch("Passare a un altro attacco? Le scelte di questo attacco andranno perse.")){launchKey=previousLaunch;render();return;}
    const previous=actionId;
    actionId=entry.actionId;requestedSpellId=entry.spellId;
    beamTally={spellId:"",count:0};palmDraft={targetId:"",outcome:"",amount:"",id:newAttackId()};
    void perform(async operation=>{
      try {await refresh(operation);}
      catch(error) {if(lifecycle.isCurrent(operation)){actionId=previous;requestedSpellId="";}throw error;}
    });
  }
  // The caster at a glance in the cantrips and spells tabs: the concentration in progress, only when there is one (the
  // slots left sit in the spells' level headers).
  const concentrationNames=()=>Object.entries(presentation?.item?.metadata?.[META_KEY]?.[`${ID}/concentration`] || {})
    .map(([key,entry])=>String(entry?.name || entry?.spellId || key).trim()).filter(Boolean);
  function renderMonster() {
    const multiattack=sanitizeMonsterProfile(attackerCard()[MONSTER_PROFILE_FIELD])?.multiattack || "";
    if(multiattackLine) {
      multiattackLine.hidden=!multiattack || currentEntry()?.tab!=="attacks";
      multiattackLine.textContent=multiattack?`Multiattacco: ${multiattack}`:"";
    }
    const note=launching()?"":resolved()?.note || "";
    if(monsterNote){monsterNote.hidden=!note;monsterNote.textContent=note?`Da risolvere al tavolo: ${note}`:"";}
  }
  function renderCaster() {
    if(!casterLine) return;
    const tab=currentEntry()?.tab;
    const names=["cantrips","spells"].includes(tab)?concentrationNames():[];
    casterLine.hidden=!names.length;
    if(casterLine.hidden) return;
    casterLine.replaceChildren(node("span",`Concentrazione: ${names.join(", ")}`,"concentrating"));
  }
  // A feature of the Capacità tab: the form the character sheet shows for it (pcAttackFeatureFormCore.js), run by the
  // console itself; its activation, target, uses left and whether it is active (presentation.featureState).
  const capitalized=text=>text?text.charAt(0).toUpperCase()+text.slice(1):"";
  // The values the GM entered, by feature: they survive a re-render (a live update, another entry and back).
  const featureValues=new Map();
  const featureForm=entry=>pcAttackFeatureForm(getClassFeatureDefinition(entry.featureId),presentation?.featureState || {},
    {characterBuild:presentation?.item?.metadata?.[META_KEY]?.initiativeCard?.characterBuild || [],
      spellSlots:spellSlotStatus(presentation?.item?.metadata?.[META_KEY]?.initiativeCard?.characterBuild,presentation?.item?.metadata?.[META_KEY]?.classFeatureState?.resources),
      reaction:{inCombat:Array.isArray(presentation?.turnState?.order) && presentation.turnState.order.some(Boolean),
        used:hasReactionUsed(presentation?.item?.metadata?.[META_KEY]?.conditions)}});
  // Purifying Touch: the creature the GM selected on the map (else the actor) and its active spells.
  function purifyTarget() {
    const item=selection.target || presentation?.item || null;
    const spells=(Array.isArray(item?.metadata?.[META_KEY]?.[`${ID}/spells`])?item.metadata[META_KEY][`${ID}/spells`]:[])
      .filter(spell=>spell?.castContext?.staticZoneOwner!==true && (spell?.instanceId || spell?.name));
    return {item,spells};
  }
  // A feature used with a reaction, in combat, by an actor that has already used its reaction this round: the runtime
  // spends nothing more, and the console asks first, as for a reaction spell (spellReactionCore.js).
  const reactionAlreadyUsed=definition=>isReactionClassFeature(definition)
    && (Array.isArray(presentation?.turnState?.order)?presentation.turnState.order.filter(Boolean).length>0:false)
    && hasReactionUsed(presentation?.item?.metadata?.[META_KEY]?.conditions);
  // A feature acting on the map selection (Lay on Hands, Unsettling Words…): who it reaches if Usa is clicked now, as
  // runFeature reads it (the selection, the actor left out unless the feature takes it), and the runtime's fallback on
  // the actor when nothing is selected. Purifying Touch names its target in its own field. Only shown, never sent.
  function featureTargetInfo(entry,form,definition) {
    if(!form.selectionTargets || form.call==="purifyClassFeatureSpell") return null;
    const fresh=item=>item.id===presentation?.item?.id?presentation.item:targetById(item.id) || item;
    const picked=selectedItems.filter(item=>form.includeSource || item.id!==sourceId).map(fresh);
    if(picked.length) return {text:picked.map(item=>item.id===presentation?.item?.id?`${item.name || item.id} (sé)`:bossTargetLabel(item)).join(", "),warning:false};
    const targeting=classFeatureTargeting(definition,presentation?.item?.metadata?.[META_KEY]?.initiativeCard?.characterBuild || []);
    return targeting.excludeSource?{text:"seleziona una creatura sulla mappa",warning:true}
      :{text:`nessuna selezione: su ${presentation?.item?.name || "l'attore"}`,warning:false};
  }
  function featureCard(entry) {
    const form=featureForm(entry);
    const state=presentation?.featureState || {};
    const resources=(state.resources?.[entry.featureId] || []).map(row=>row.unlimited?`${row.name}: illimitati`
      :Number.isFinite(row.current) && Number.isFinite(row.maximum)?`${row.name} ${row.current}/${row.maximum}`:row.name);
    const active=state.active?.[entry.featureId] || [];
    const definition=getClassFeatureDefinition(entry.featureId);
    const targeting=definition?.targeting?.mode;
    const target=form.auraMeters?`aura ${form.auraMeters} m`:targeting==="aura"?"aura":targeting==="single-target"?"bersaglio":entry.mode==="activate"?"su di sé":"";
    const remaining=active[0]?.remainingRounds;
    const firstPool=(state.resources?.[entry.featureId] || [])[0];
    const spent=["activate","toggle"].includes(form.kind) && !active.length && firstPool && !firstPool.unlimited && firstPool.current===0;
    return {
      form,
      tags:[...(entry.activation?[[capitalized(entry.activation),""]]:[]),...(target?[[target,""]]:[]),
        ...(active.length?[[Number.isFinite(remaining)?`Attiva · ${remaining} r`:"Attiva","warning"]]:[]),...(entry.species?[["Specie",""]]:[])],
      detailText:resources.join(" · "),
      notes:[...(form.note?[[form.note,""]]:[]),...(form.disabledReason?[[form.disabledReason,"warning"]]:[]),
        ...(spent && !form.disabledReason?[["Nessun uso rimasto.","warning"]]:[]),
        ...(!["reference","reaction"].includes(form.kind) && reactionAlreadyUsed(definition)?[["Reazione già usata in questo round.","warning"]]:[])],
      blocked:!!form.disabledReason || spent,
      // Why Usa is off, beside it in the fixed row.
      blockReason:form.disabledReason || (spent?"Nessun uso rimasto.":""),
      target:featureTargetInfo(entry,form,definition),
    };
  }
  // The form's fields, in the card: a select, a number, the target's spell (Purifying Touch).
  // The catalog's spells, suggested in a spell field (Spell Thief), as the sheet's list: built once, on first use.
  let spellOptionsList=null;
  function spellOptions() {
    if(spellOptionsList || !documentRef.body) return spellOptionsList;
    spellOptionsList=node("datalist");spellOptionsList.id="pc-attack-spell-options";
    spellOptionsList.append(...getSpellCatalog().map(spell=>{const option=node("option");option.value=spell.catalogLabel || spell.displayName || spell.name || spell.id;return option;}));
    documentRef.body.append(spellOptionsList);
    return spellOptionsList;
  }
  function featureFields(entry,form,blocked=false) {
    const values=featureValues.get(entry.featureId) || {};
    featureValues.set(entry.featureId,values);
    const rows=[];
    // A field shown only for one value of another (a confirmation for a slot spent, for a stolen spell).
    const syncShown=()=>{for(const row of rows) if(row.__showWhen) row.hidden=values[row.__showWhen.field]!==row.__showWhen.value;};
    const fields=(form.fields || []).map(field=>{
      const row=node("label","",field.type==="checkbox"?"feature-field feature-check":"feature-field");
      if(field.type!=="checkbox") row.append(node("span",field.label,"feature-field-label"));
      let control;
      if(field.type==="checkbox") {
        control=node("input");control.type="checkbox";
        if(values[field.id]===undefined) values[field.id]=false;
        control.checked=values[field.id]===true;
        control.addEventListener("change",()=>{values[field.id]=control.checked;});
        row.append(control,node("span",field.label,"feature-field-label"));
      } else if(field.type==="spell-text") {
        control=node("input","","field");control.type="text";control.autocomplete="off";control.spellcheck=false;
        control.placeholder="Nome dal catalogo";
        if(spellOptions()) control.setAttribute("list",spellOptionsList.id);
        if(values[field.id]===undefined) values[field.id]="";
        control.value=values[field.id];
        control.addEventListener("input",()=>{values[field.id]=control.value;});
      } else if(field.type==="number") {
        control=node("input","","amount");control.type="number";control.step="1";
        if(Number.isFinite(field.min)) control.min=String(field.min);
        if(Number.isFinite(field.max)) control.max=String(field.max);
        if(values[field.id]===undefined) values[field.id]=field.value ?? "";
        control.value=values[field.id];
        control.addEventListener("input",()=>{values[field.id]=control.value.trim();});
      } else if(field.type==="target-spell") {
        const {item,spells}=purifyTarget();
        control=node("select","","inline-select");
        control.replaceChildren(...(spells.length?spells.map(spell=>{const option=node("option",spell.name || spell.instanceId);option.value=spell.instanceId || spell.name;return option;})
          :[node("option",`${item?.name || "Il bersaglio"}: nessun incantesimo attivo`)]));
        control.disabled=!spells.length;
        const chosen=spells.find(spell=>(spell.instanceId || spell.name)===values.spellKey) || spells[0];
        values.spellKey=chosen?(chosen.instanceId || chosen.name):"";
        control.value=values.spellKey;
        control.addEventListener("change",()=>{values.spellKey=control.value;});
        row.append(node("span",`Bersaglio: ${item?.name || "—"} (selezionalo sulla mappa)`,"feature-field-hint"));
      } else {
        control=node("select","","inline-select");
        control.replaceChildren(...(field.options || []).map(option=>{const element=node("option",option.label);element.value=option.value;return element;}));
        if(!(field.options || []).some(option=>option.value===values[field.id])) values[field.id]=field.options?.[0]?.value ?? "";
        control.value=values[field.id];
        control.addEventListener("change",()=>{values[field.id]=control.value;syncShown();});
      }
      control.disabled=control.disabled || busy || launchBusy || invalidated || blocked;
      // The number already there (Lay on Hands' 1) is replaced by typing.
      if(field.type==="number") control.addEventListener("focus",()=>{control.select?.();});
      if(field.type!=="checkbox") row.append(control);
      if(field.showWhen) row.__showWhen=field.showWhen;
      rows.push(row);
      return row;
    });
    syncShown();
    return fields;
  }
  // The character sheet, for the features whose controls only it hosts.
  function openCharacterSheet() {
    void openTrackedPopover({id:`${ID}/initiative-card-modal`,url:`/initiative-card-modal.html?source=${encodeURIComponent(sourceId)}`,
      width:440,height:560,anchorReference:"POSITION",anchorPosition:{left:80+PC_ATTACK_WIDTH+12,top:60},
      anchorOrigin:{horizontal:"LEFT",vertical:"TOP"},transformOrigin:{horizontal:"LEFT",vertical:"TOP"},disableClickAway:true,
      marginThreshold:12,hidePaper:true}).catch(error=>setStatus(String(error?.message || error),"error"));
  }
  // Wild Magic Surge's d100 engine, beside the console.
  function openWildMagicSurge() {
    void openTrackedPopover({id:`${ID}/wild-magic-surge`,url:`/wild-magic-surge.html?source=${encodeURIComponent(sourceId)}`,
      width:420,height:600,anchorReference:"POSITION",anchorPosition:{left:80+PC_ATTACK_WIDTH+12,top:60},
      anchorOrigin:{horizontal:"LEFT",vertical:"TOP"},transformOrigin:{horizontal:"LEFT",vertical:"TOP"},disableClickAway:true,
      marginThreshold:12,hidePaper:true}).catch(error=>setStatus(String(error?.message || error),"error"));
  }
  // Usa / Attiva / Disattiva / Termina: the runtime call the sheet makes, with the targets selected on the map.
  async function runFeature(entry) {
    if(launchBusy || busy || invalidated || entry?.mode!=="activate") return;
    const definition=getClassFeatureDefinition(entry.featureId);
    const card=featureCard(entry),form=card.form;
    if(form.kind==="sheet"){openCharacterSheet();setStatus(`${entry.label}: usala dalla scheda personaggio.`);return;}
    if(form.kind==="wild-magic"){openWildMagicSurge();setStatus(`${entry.label}: scrivi il d100 nel popup.`);return;}
    if(card.blocked) return;
    const values={...(featureValues.get(entry.featureId) || {})};
    let targetIds;
    if(form.call==="purifyClassFeatureSpell") {
      const {item,spells}=purifyTarget();
      const spell=spells.find(entry2=>(entry2.instanceId || entry2.name)===values.spellKey) || spells[0];
      values.spell=spell?{instanceId:spell.instanceId || "",name:spell.name || ""}:null;
      targetIds=item?.id?[item.id]:undefined;
    } else if(form.selectionTargets) {
      targetIds=await Promise.resolve(api.player?.getSelection?.())
        .then(ids=>(Array.isArray(ids)?ids:[]).filter(id=>form.includeSource || id!==sourceId)).catch(()=>[]);
    }
    const request=pcAttackFeatureRequest(definition,form,values,{sourceId,targetIds});
    if(request.error){setStatus(request.error,"error");return;}
    const name=definition?.name || entry.label;
    if(request.fn!=="deactivateClassFeature" && reactionAlreadyUsed(definition)
      && !confirmSwitch(`${presentation?.item?.name || "Il personaggio"} ha già usato la reazione in questo round.\n\nUsare comunque ${name}?`)) {
      setStatus(`${name}: annullata, reazione già usata.`,"warn");return;
    }
    launchBusy=true;launchSignature="";renderLaunch();
    try {
      const runtime=overrides.featureRuntime || await import("./classFeatureRuntime.js");
      const result=await (request.args?runtime[request.fn](...request.args):runtime[request.fn](request.params));
      // "Capacità" agrees with every verb, whatever the feature's gender (il Tocco, l'Aura).
      const done=request.done?request.done:request.fn==="deactivateClassFeature"?`Capacità ${form.kind==="toggle"?"disattivata":"terminata"}: ${name}.`
        :definition?.trackingMode==="instant" || form.label==="Usa"?`Capacità usata: ${name}.`:`Capacità attivata: ${name}.`;
      setStatus(result?.reaction?.spent && form.kind!=="reaction"?`${done} Reazione segnata.`:done,"ok");
      rememberEntry(entry.key);
    } catch(error) {
      if(!error?.cancelled) setStatus(String(error?.message || error || "Capacità non applicata."),"error");
    } finally {launchBusy=false;launchSignature="";renderLaunch();}
  }
  // The feature's text (the character sheet's), loaded once on the first feature shown; a species trait carries its own.
  function featureDetailsNodes(entry) {
    if(!classFeatureDescriptionsLoaded()) {
      void loadClassFeatureDescriptions().then(()=>{launchSignature="";if(launching())renderLaunch();}).catch(()=>{});
    }
    const text=classFeatureDescription(getClassFeatureDefinition(entry.featureId));
    return [text?node("p",text,"spell-text"):node("p",classFeatureDescriptionsLoaded()?"Testo non disponibile.":"Caricamento del testo…","launch-details")];
  }
  // The spell's details under an accordion ("Dettagli"): tags, casting time, range, components, duration, then the
  // text of the spell and its higher levels. One open state for every accordion of the console: open stays open.
  function spellDetailsNodes(spellId,tags=[]) {
    if(spellId && !spellbookSpellReferenceLoaded()) {
      // The Italian reference loads once, on the first spell shown.
      void loadSpellbookSpellReference().then(()=>{launchSignature="";if(launching())renderLaunch();else renderSpellDetails();}).catch(()=>{});
    }
    const details=spellId?spellbookSpellDetails(spellId):null;
    const nodes=[];
    if(tags.length){const row=node("div","","launch-meta");row.append(...tags.map(([text,kind])=>node("span",text,`launch-tag${kind?" "+kind:""}`)));nodes.push(row);}
    const line=details?[details.castingTime,details.range,details.components,details.duration].filter(Boolean).join(" · "):"";
    if(line) nodes.push(node("p",line,"launch-details"));
    if(details?.description) nodes.push(node("p",details.description,"spell-text"));
    if(details?.higherLevels) nodes.push(node("p",`Ai livelli superiori. ${details.higherLevels}`,"spell-text"));
    if(spellId && !details) nodes.push(node("p",spellbookSpellReferenceLoaded()?"Testo non disponibile.":"Caricamento del testo…","launch-details"));
    return nodes;
  }
  function detailsAccordion(children) {
    const box=node("details","","spell-details");box.open=detailsOpen;
    box.addEventListener("toggle",()=>{detailsOpen=!!box.open;});
    box.append(node("summary","Dettagli"),...children);
    return box;
  }
  // The attack form's own accordion: the cantrip or spell the attack records.
  function renderSpellDetails() {
    if(!spellDetailsBox || !spellDetailsBody) return;
    const spellId=!launching() && draft?.spellId && (getPcAttackCantrip(draft.spellId) || getPcAttackSpell(draft.spellId))?draft.spellId:"";
    spellDetailsBox.hidden=!spellId;
    if(!spellId){spellDetailsSignature="";return;}
    const nodes=spellDetailsNodes(spellId);
    const signature=JSON.stringify([spellId,nodes.length,spellbookSpellReferenceLoaded()]);
    if(signature===spellDetailsSignature) return;
    spellDetailsSignature=signature;
    spellDetailsBox.open=detailsOpen;
    spellDetailsBody.replaceChildren(...nodes);
  }
  // A segmented choice (the contest's outcome, the Shove's effect): its pressed state, off while saving.
  function choiceButton(label,pressed,onClick,data={}) {
    const button=node("button",label);button.type="button";
    for(const [key,value] of Object.entries(data)) button.dataset[key]=value;
    button.setAttribute("aria-pressed",String(pressed));button.disabled=busy || invalidated;
    button.addEventListener("click",onClick);
    return button;
  }
  // Grapple or Shove: the target (the attack's, else the creature selected on the map), the Shove's effect, the outcome
  // of the contest rolled at the table; Registra in the fixed row. Never the reaction (not an opportunity attack).
  function renderManeuver(entry) {
    if(!maneuverBox) return;
    maneuverBox.hidden=false;
    const kind=entry.maneuver;
    if(maneuverDraft.kind!==kind) maneuverDraft={...maneuverDraft,kind,outcome:"",effect:"",id:newAttackId()};
    if(maneuverDraft.targetId && !targetById(maneuverDraft.targetId)) maneuverDraft.targetId="";
    if(!maneuverDraft.targetId) maneuverDraft.targetId=(draft?.targetId && targetById(draft.targetId)?draft.targetId:"")
      || (selection.status==="single" && targetById(selection.target?.id)?selection.target.id:"");
    $("pc-attack-title").textContent=actorName();
    $("pc-attack-subtitle").textContent=`${entry.label} · Attacco speciale in mischia`;
    // Rebuilt only when what it shows changes: a live update never eats a click in flight or closes the open select.
    const signature=JSON.stringify([kind,presentation.targets.map(item=>[item.id,bossTargetLabel(item)]),maneuverDraft.targetId,maneuverDraft.outcome,
      maneuverDraft.effect,selection.status,busy,invalidated]);
    if(signature!==maneuverSignature) {
      maneuverSignature=signature;
      const options=[node("option","— Scegli il bersaglio —")];options[0].value="";
      for(const item of presentation.targets){const option=node("option",bossTargetLabel(item));option.value=item.id;options.push(option);}
      maneuverTarget.replaceChildren(...options);
      maneuverTarget.value=maneuverDraft.targetId || "";
      maneuverTarget.disabled=busy || invalidated;
      const message=maneuverDraft.targetId?"":pcAttackSelectionHint(selection.status);
      maneuverHint.textContent=message;maneuverHint.hidden=!message;
      maneuverEffects.hidden=kind!=="shove";
      maneuverEffects.replaceChildren(...(kind==="shove"?PC_SHOVE_EFFECTS.map(effect=>choiceButton(PC_SHOVE_EFFECT_LABELS[effect],maneuverDraft.effect===effect,
        ()=>{maneuverDraft.effect=effect;renderManeuver(entry);},{effect})):[]));
      maneuverContest.textContent=PC_MANEUVER_CONTEST;
      maneuverOutcomes.replaceChildren(...PC_MANEUVER_OUTCOMES.map(outcome=>choiceButton(PC_MANEUVER_OUTCOME_LABELS[outcome],maneuverDraft.outcome===outcome,
        ()=>{maneuverDraft.outcome=outcome;renderManeuver(entry);},{outcome})));
      maneuverNote.textContent=PC_MANEUVER_NOTES[kind] || "";
    }
    const target=targetById(maneuverDraft.targetId);
    const blocker=pcManeuverBlocker({kind,sourceItem:presentation.item,targetItem:target,outcome:maneuverDraft.outcome,effect:maneuverDraft.effect});
    if(applyRow) applyRow.hidden=false;
    apply.hidden=true;
    if(launchButton) {
      launchButton.hidden=false;
      launchButton.textContent=committing?"Registro…":"Registra";
      launchButton.disabled=busy || invalidated || !!blocker;
    }
    total.replaceChildren();total.dataset.kind="";
    const name=target?.name || "il bersaglio";
    total.textContent=blocker || (maneuverDraft.outcome!=="success"?`${entry.label} fallita: nessun effetto.`
      :kind==="grapple"?`${name} sarà Afferrato.`:maneuverDraft.effect==="prone"?`${name} sarà Prono.`:`Sposta ${name} di 1,5 m sulla mappa.`);
    total.title=total.textContent;
  }
  async function registerManeuver(entry) {
    const target=targetById(maneuverDraft.targetId);
    return perform(async operation=>{
      const blocker=pcManeuverBlocker({kind:entry.maneuver,sourceItem:presentation.item,targetItem:target,outcome:maneuverDraft.outcome,effect:maneuverDraft.effect});
      if(blocker) throw new Error(blocker);
      try {
        const result=await runtime.executePcManeuver({sourceId,kind:entry.maneuver,targetId:target.id,outcome:maneuverDraft.outcome,
          ...(entry.maneuver==="shove"?{effect:maneuverDraft.effect}:{}),attackInstanceId:maneuverDraft.id,sceneIdentity:presentation.sceneIdentity});
        if(!lifecycle.isCurrent(operation)) return;
        showUndo(result);
        setStatus([maneuverSummary(result),...(result.manualText?[result.manualText]:[]),...(result.warnings || [])].join("\n"),"ok");
        markPendingReady();
        // Ready for the next attack of the action: same target, a new identity.
        maneuverDraft={...maneuverDraft,outcome:"",effect:"",id:newAttackId()};
        await refresh(operation);
      } catch(error) {
        // A definitive rejection needs a new identity; an uncertain acknowledgement keeps it for the retry.
        if(["conflict","rejected"].includes(error?.status) && error.result?.committed!==true) maneuverDraft.id=newAttackId();
        throw error;
      }
    },{commit:true});
  }
  // The grapples of the actor: the creatures it holds (let go, or record their escape) and the ones holding it (its escape).
  function renderGrapple() {
    if(!grappleBox) return;
    const holds=presentation?pcGrappleHolds(presentation.targets,sourceId):[];
    const on=presentation?pcGrapplesOn(presentation.item,presentation.targets):[];
    grappleBox.hidden=!holds.length && !on.length;
    if(grappleBox.hidden){grappleSignature="";return;}
    const signature=JSON.stringify([holds,on,busy,invalidated]);
    if(signature===grappleSignature) return;
    grappleSignature=signature;
    const actor=actorName();
    // A short name beside the buttons; the whole sentence in its tooltip.
    const row=(text,title,buttons)=>{
      const line=node("div","","grapple-row");line.append(node("span",text,"grapple-name"));
      line.title=title;line.append(...buttons);
      return line;
    };
    const button=(label,title,onClick)=>{const element=node("button",label,"mini-button");element.type="button";element.title=title;
      element.disabled=busy || invalidated;element.addEventListener("click",onClick);return element;};
    const escapeTitle=(who,dc)=>dc?`${who} supera il TS per sfuggire (CD ${dc})`:`${who} vince la prova contrapposta (Atletica o Acrobazia contro Atletica)`;
    grappleBox.replaceChildren(node("span","Presa","caption"),
      ...holds.map(hold=>row(`✊ Tiene ${hold.name}`,`${hold.name}: Afferrato da ${actor}`,[
        button("Lascia andare",`${actor} lascia andare ${hold.name} (nessuna azione)`,()=>void endGrapple(hold.targetId,hold.instanceId,"release")),
        button("Sfugge",escapeTitle(hold.name),()=>void endGrapple(hold.targetId,hold.instanceId,"escaped")),
        button("Non sfugge",`${hold.name} tenta di sfuggire e resta Afferrato`,()=>void endGrapple(hold.targetId,hold.instanceId,"escape-failed"))])),
      ...on.map(grab=>row(`✊ Afferrato${grab.name?` da ${grab.name}`:""}${grab.escapeDC?` (CD ${grab.escapeDC})`:""}`,
        `${actor}: Afferrato${grab.name?` da ${grab.name}`:""}${grab.escapeDC?` (CD ${grab.escapeDC} per sfuggire)`:""}`,[
        button("Sfugge",escapeTitle(actor,grab.escapeDC),()=>void endGrapple(sourceId,grab.instanceId,"escaped")),
        button("Non sfugge",`${actor} tenta di sfuggire e resta Afferrato`,()=>void endGrapple(sourceId,grab.instanceId,"escape-failed"))])));
  }
  function endGrapple(grappledId,instanceId,outcome) {
    return perform(async operation=>{
      const result=await runtime.endPcGrapple({sourceId,grappledId,instanceId,outcome,attackInstanceId:newAttackId(),sceneIdentity:presentation.sceneIdentity});
      if(!lifecycle.isCurrent(operation)) return;
      showUndo(result);
      setStatus([maneuverSummary(result),...(result.warnings || [])].join("\n"),"ok");
      markPendingReady();
      await refresh(operation);
    });
  }
  // The card of an entry the console does not resolve. The warnings stay in view, the details sit in the accordion,
  // and Lancia (a spell) or Usa (a ⚡ quick action) waits in the fixed row at the bottom, always visible.
  function renderLaunch() {
    if(!launchBox) return;
    if(attackView) attackView.hidden=true;
    // Grapple and Shove have a card of their own.
    if(currentEntry()?.mode==="maneuver"){launchBox.hidden=true;launchSignature="";renderManeuver(currentEntry());return;}
    if(maneuverBox) maneuverBox.hidden=true;
    launchBox.hidden=false;
    const entry=currentEntry();
    if(entry?.mode==="monster"){renderMonsterTrait(entry);return;}
    const level=entry?.level;
    const isFeature=entry?.mode==="activate" || entry?.mode==="reference";
    $("pc-attack-title").textContent=actorName();
    $("pc-attack-subtitle").textContent=!entry?"":[plainLabel(entry.label),
      ...(isFeature?[entry.species?"Tratto di specie":"Capacità di classe"]:[level===0?"Trucchetto":`Incantesimo di ${level}° livello`])].filter(Boolean).join(" · ");
    const others=concentrationNames().filter(name=>name.toLocaleLowerCase("it")!==String(entry?.label || "").toLocaleLowerCase("it"));
    const meta=presentation?.item?.metadata?.[META_KEY] || {};
    const freeSlot=!level || spellSlotStatus(meta.initiativeCard?.characterBuild,meta.classFeatureState?.resources)
      .some(row=>row.level>=level && row.current>0);
    const feature=isFeature?featureCard(entry):null;
    const notes=!entry?[["Nessun attacco, incantesimo o capacità da mostrare per questo attore.",""]]
      :isFeature?feature.notes
      :entry.mode==="weapon"?[["Si lancia con un attacco con arma da mischia: scegli l'arma nella scheda Attacchi e attivalo fra gli extra al colpo.",""]]
      :entry.mode==="manual"?[["Non automatizzato: risolvilo al tavolo.",""]]
      :[...(entry.concentration && others.length?[[`Lanciandolo termina la concentrazione su ${others.join(", ")}.`,"warning"]]:[]),
        ...(!freeSlot?[[`Nessuno slot libero dal ${level}° livello in su.`,"warning"]]:[]),
        ...(entry.recordOnly?[["Il plugin registra il lancio e lo slot: gli effetti si risolvono al tavolo.",""]]:[])];
    const canLaunch=entry?.mode==="launch" || (entry?.mode==="activate" && feature?.form.kind!=="manual");
    // The fixed row: what it costs at a glance, and the button.
    const details=entry?.spellId?spellbookSpellDetails(entry.spellId):null;
    if(applyRow) applyRow.hidden=!canLaunch;
    apply.hidden=true;
    if(launchButton) {
      launchButton.hidden=!canLaunch;
      launchButton.textContent=isFeature?`${feature.form.label || "Usa"}${launchBusy?"…":""}`:(launchBusy?"Lancio…":"Lancia");
      launchButton.disabled=launchBusy || busy || invalidated || !!feature?.blocked;
    }
    // The casting time in short (Azione, Reazione, 1 minuto…) on one line; the full text in its tooltip.
    if(canLaunch) {
      const cost=!isFeature && details?castingTimeLabel(entry.spellId):"";
      total.replaceChildren();
      // A blocked feature says why beside its button, in place of what it costs.
      total.dataset.kind=isFeature && feature.blocked && feature.blockReason?"warning":"";
      if(isFeature) total.textContent=feature.blocked && feature.blockReason?[feature.blockReason,feature.detailText].filter(Boolean).join(" "):feature.detailText;
      else if(!details) total.textContent="";
      else {
        if(cost) total.append(costTag(cost));
        if(details.range) total.append(node("span",`${cost?" · ":""}${details.range}`));
      }
      total.title=isFeature?feature.detailText:details?[details.castingTime,details.range].filter(Boolean).join(" · "):"";
    }
    const tags=isFeature?feature.tags:entry?[...(entry.concentration?[["Concentrazione",""]]:[]),...(entry.ritual?[["Rituale",""]]:[])]:[];
    // A feature keeps its tags and uses in view, its text in the accordion; a spell's details all go in the accordion.
    const body=isFeature?featureDetailsNodes(entry):entry?.spellId?spellDetailsNodes(entry.spellId,tags):[];
    // A feature's form follows its state and, for Purifying Touch, the creature selected and its spells.
    const formSignature=isFeature?[feature.form.kind,feature.form.label,(feature.form.fields || []).map(field=>[field.id,field.max,field.options?.length]),
      (feature.form.fields || []).some(field=>field.type==="target-spell")?(()=>{const {item,spells}=purifyTarget();return [item?.id,spells.map(spell=>spell.instanceId || spell.name)];})():null]:null;
    const signature=JSON.stringify([entry?.key,notes,isFeature?[tags,feature.detailText,!!feature.target]:null,formSignature,body.length,launchBusy,busy,
      spellbookSpellReferenceLoaded(),classFeatureDescriptionsLoaded()]);
    // Who the feature reaches follows the map selection in place: the card (and a field being typed in) is not rebuilt.
    const syncTarget=()=>{
      const line=launchBox.querySelector("[data-feature-target]");
      if(!line || !feature?.target) return;
      line.dataset.warning=String(feature.target.warning);
      line.replaceChildren(node("span","Su","caption"),node("span",capitalized(feature.target.text),"feature-target-text"));
    };
    if(signature===launchSignature){syncTarget();return;}
    launchSignature=signature;
    const children=[];
    // The feature's activation pill takes its cost colour (Azione, Azione bonus, Reazione).
    if(isFeature && tags.length){const row=node("div","","launch-meta");row.append(...tags.map(([text,kind])=>{
      const cost=costKind(text),pill=node("span",text,`launch-tag${kind?" "+kind:""}${cost?" cost-tag":""}`);
      if(cost) pill.dataset.cost=cost;
      return pill;}));children.push(row);}
    if(isFeature && feature.target){const line=node("p","","feature-target");line.dataset.featureTarget="1";children.push(line);}
    // The uses left sit in the fixed row when the feature has a button; the reason it is off too.
    if(isFeature && feature.detailText && !canLaunch) children.push(node("p",feature.detailText,"launch-details"));
    if(isFeature && feature.form.fields?.length) children.push(...featureFields(entry,feature.form,feature.blocked));
    const shownNotes=isFeature && canLaunch && feature.blocked?notes.filter(([text])=>text!==feature.blockReason):notes;
    children.push(...shownNotes.map(([text,kind])=>node("p",text,`launch-note${kind?" "+kind:""}`)));
    if(!entry) {
      const sheet=node("button","Apri la scheda","small");sheet.type="button";
      sheet.addEventListener("click",()=>openCharacterSheet());
      children.push(sheet);
    }
    if(body.length) children.push(detailsAccordion(body));
    // Never an empty card.
    if(!children.length) children.push(node("p","Nessun dettaglio da mostrare.","launch-details"));
    launchBox.replaceChildren(...children);
    syncTarget();
  }
  // A monster's trait, reaction or legendary action (fase 4, lotto 5): its text to read, no button (decision D9).
  function renderMonsterTrait(entry) {
    $("pc-attack-title").textContent=actorName();
    const kind={"monster-trait":"Tratto","monster-reaction":"Reazione","monster-legendary":"Azione leggendaria"}[entry.group] || "";
    $("pc-attack-subtitle").textContent=[plainLabel(entry.label),kind].filter(Boolean).join(" · ");
    if(applyRow) applyRow.hidden=true;
    apply.hidden=true;
    if(launchButton) launchButton.hidden=true;
    const signature=JSON.stringify(["monster",entry.key,entry.label,entry.text]);
    if(signature===launchSignature) return;
    launchSignature=signature;
    const children=[];
    if(entry.activation){
      const row=node("div","","launch-meta"),text=capitalized(entry.activation),cost=costKind(text);
      const pill=node("span",text,`launch-tag${cost?" cost-tag":""}`);
      if(cost) pill.dataset.cost=cost;
      row.append(pill);children.push(row);
    }
    children.push(node("p",entry.text || "Testo non disponibile.","spell-text"));
    if(entry.group==="monster-legendary") children.push(node("p","Le azioni leggendarie si segnano sui diamanti del tracker.","launch-details"));
    launchBox.replaceChildren(...children);
  }
  // Lancia: the tracker casts the spell as the 🪄 menu does (the spell panel, or the cast at once when nothing is asked).
  function askTrackerToLaunch(entry,{ackTimeoutMs=overrides.launchAckTimeoutMs ?? LAUNCH_ACK_TIMEOUT_MS}={}) {
    return new Promise(resolve=>{
      const requestId=newLaunchId();
      let off=()=>{},timer=null;
      const finish=value=>{clearTimeout(timer);off();resolve(value);};
      const wait=()=>{clearTimeout(timer);timer=setTimeout(()=>finish(null),ackTimeoutMs);};
      off=api.broadcast.onMessage(PC_ATTACK_SPELL_LAUNCH_CHANNEL,event=>{
        const data=event?.data;
        if(data?.requestId!==requestId) return;
        // Accepted: the cast may take its time (a panel to open, a command to commit).
        if(data.type==="launch-accepted") clearTimeout(timer);
        else if(data.type==="launch-result") finish(data);
      }) || (()=>{});
      wait();
      Promise.resolve().then(()=>api.broadcast.sendMessage(PC_ATTACK_SPELL_LAUNCH_CHANNEL,
        {type:"launch",requestId,sourceId,actionId:entry.actionId},{destination:"LOCAL"})).catch(()=>finish(null));
    });
  }
  // What the tracker did with the spell, in the status bar.
  function launchSummary(entry,result) {
    if(!result) return `Il tracker non risponde: lancia ${entry.label} dal suo menu 🪄.`;
    if(!result.ok) return String(result.message || `${entry.label}: lancio non riuscito.`);
    return result.mode==="review"?(result.message?String(result.message):`${entry.label}: pannello incantesimi aperto.`)
      :result.mode==="executed"?`${entry.label}: lancio registrato.`
      :String(result.message || `${entry.label}: lancio non valido.`);
  }
  async function launchSpell(entry) {
    if(launchBusy || busy || invalidated || entry?.mode!=="launch") return;
    if(typeof api.broadcast?.onMessage!=="function"){setStatus("Lancio non disponibile.","error");return;}
    launchBusy=true;renderLaunch();
    try {
      let result=await askTrackerToLaunch(entry);
      if(!result) {
        // No answer: the tracker is closed (it hosts the 🪄 routing). Open it and ask again while it loads; a request it
        // never received is lost, never run twice.
        setStatus(`Apro il tracker per lanciare ${entry.label}…`);
        if(await openTracker().then(()=>true,()=>false)) {
          for(let attempt=0;attempt<TRACKER_OPEN_ATTEMPTS && !result && !invalidated;attempt+=1) result=await askTrackerToLaunch(entry);
        }
      }
      setStatus(launchSummary(entry,result),!result?"warn":result.ok && ["review","executed"].includes(result.mode)?"ok":"error");
      if(result?.ok) rememberEntry(entry.key);
    } finally {launchBusy=false;renderLaunch();}
  }
  // The title is who acts (D3 of the console's audit); what it does goes in the subtitle, without the catalog's emoji.
  const actorName=()=>presentation?.item?.name || presentation?.item?.id || "Attacco";
  const plainLabel=text=>String(text || "").replace(/^[\p{Extended_Pictographic}️‍\s]+/u,"").trim();
  // Whose turn it is, beside the actor's name: its own, or another's (an off-turn action); nothing out of combat.
  const turnBadge=$("pc-attack-turn");
  function renderTurnBadge() {
    if(!turnBadge) return;
    const order=Array.isArray(presentation?.turnState?.order)?presentation.turnState.order.filter(Boolean):[];
    turnBadge.hidden=!presentation || !order.length;
    if(turnBadge.hidden) return;
    const off=isOffTurn(presentation.turnState,sourceId);
    turnBadge.dataset.turn=off?"off":"own";
    turnBadge.textContent=off?"Fuori turno":"Turno";
  }
  function renderHeader() {
    const action=presentation?.action,attack=resolved();
    $("pc-attack-title").textContent=actorName();
    // The subtitle names the cantrip or spell chosen, not the action that records it.
    const named=attack?.cantrip?.name || attack?.spell?.name || "";
    // A saving throw cantrip names its save (and the actor's DC) instead of a range.
    const saveLabel=pcAttackSaveLabel(attack,presentation?.item?.metadata?.[META_KEY]?.initiativeCard);
    const parts=[named || action?.label,...(attack?.cantrip?["Trucchetto"]:[]),...(attack?.spell?[`Incantesimo di ${attack.spell.level}° livello`]:[]),
      saveLabel || (attack?.spell?.delivery==="auto"?"Senza tiro per colpire":RANGE_LABELS[attack?.range]) || "",
      // A monster's attack: its bonus, reach or range, recharge and uses, as its stat block prints them; the uses left and a
      // recharge already used from the actor's resources.
      ...pcAttackMonsterTags(attack,presentation?.item?.metadata?.[META_KEY]?.classFeatureState?.resources || {})].filter(Boolean);
    $("pc-attack-subtitle").textContent=presentation?parts.join(" · "):"";
  }
  function renderTarget() {
    // An area attack replaces the target with the creatures of its area.
    const area=isArea();
    if(targetCaption) targetCaption.textContent=area?"Creature colpite":"Bersaglio";
    targetSelect.hidden=area;
    renderArea();
    if(area){hint.hidden=true;return;}
    const options=[node("option","— Scegli il bersaglio —")];options[0].value="";
    for(const item of presentation.targets){const option=node("option",bossTargetLabel(item));option.value=item.id;options.push(option);}
    targetSelect.replaceChildren(...options);
    targetSelect.value=draft.targetId || "";
    targetSelect.disabled=busy;
    const message=draft.targetId?"":pcAttackSelectionHint(selection.status);
    hint.textContent=message;hint.hidden=!message;
  }
  // The focus follows the GM's own click to what is typed next, never a live update: after an outcome that deals
  // damage, the first damage field still empty; after ticking an extra, its amount.
  function focusDamage() {
    if(!draft || !["hit","critical","failed","passed"].includes(draft.outcome)) return;
    [...damage.querySelectorAll("input")].find(input=>!input.disabled && !input.hidden && input.value==="")?.focus?.();
  }
  // box: the riders' or activations' list; kind: "rider" or "activation" (their data-*-id and data-*-field).
  function focusAmount(box,kind,id) {
    const amount=box.querySelector(`[data-${kind}-id="${id}"]`)?.querySelector(`[data-${kind}-field="amount"]`);
    if(amount && !amount.hidden && !amount.disabled) amount.focus?.();
  }
  function renderOutcomes() {
    renderMode();
    // An area attack has a save for each creature: no single outcome (the block stays for the arrow picker).
    outcomes.hidden=isArea();
    if(outcomeBlock) outcomeBlock.hidden=isArea() && !modeOptions().length;
    outcomes.replaceChildren(...pcAttackOutcomesFor(resolved()).map(outcome=>{
      const button=node("button",PC_ATTACK_OUTCOME_LABELS[outcome]);button.type="button";button.dataset.outcome=outcome;
      button.setAttribute("aria-pressed",String(draft.outcome===outcome));button.disabled=busy;
      button.addEventListener("click",()=>{draft.outcome=outcome;renderOutcomes();renderDamage();updateWoven();updateRiders();updateActivations();renderState();focusDamage();});
      return button;
    }));
  }
  function renderDamage() {
    const attack=typedAttack();
    damage.replaceChildren(...(attack?.components || []).map(component=>{
      const body=node("div","","component-body");
      const typeName=typeLabel(component.type);
      // A cantrip's dice follow the character level; a weapon shows the formula written in its quick action.
      const meta=node("div","","component-meta");meta.dataset.damageMeta=component.id;
      body.append(node("span",typeName,"component-title"),meta);
      const input=amountInput(draft.amounts[component.id] ?? "",`Danni ${damageTypeLabel(component.type)}`);input.dataset.damageInput=component.id;
      // No damage to enter on a miss or a passed save (half on a passed save with Potent Cantrip).
      input.disabled=busy || !!draft.outcome && pcAttackDamageFactor(attack,draft.outcome,attackerCard())==="zero";
      input.addEventListener("input",()=>{draft.amounts[component.id]=input.value.trim();renderState();});
      return componentRow(null,body,input);
    }),...(attack?.mode?[modeRow(attack)]:[]));
    updateDamageMeta();
  }
  // The arrow's extra die (Seeking, Piercing): a row of its own under the weapon's.
  function modeRow(attack) {
    const option=modeOptions().find(entry=>entry.id===attack.mode.id);
    const body=node("div","","component-body");
    const meta=node("div","","component-meta");
    meta.textContent=[option?.dice || "",damageTypeLabel(attack.mode.type)].filter(Boolean).join(" ");
    body.append(node("span",attack.mode.label,"component-title"),meta);
    const input=amountInput(draft.modeAmount ?? "",`Danni di ${attack.mode.label}`);input.dataset.modeAmount="1";
    input.disabled=busy;
    input.addEventListener("input",()=>{draft.modeAmount=input.value.trim();renderState();});
    return componentRow(null,body,input);
  }
  // The dice line of each damage row, patched in place: Toll the Dead changes die with the target's hit points.
  function updateDamageMeta() {
    const attack=resolved();
    for(const component of attack?.components || []) {
      const meta=damage.querySelector(`[data-damage-meta="${component.id}"]`);
      if(!meta) continue;
      // A cantrip's dice follow the character level; a weapon shows the formula written in its quick action.
      const formula=(attack.cantrip?pcAttackCantripDiceFor(attack,presentation.item.metadata?.[META_KEY]?.initiativeCard,targetById(draft.targetId))
        :attack.spell?preview().spell?.dice || pcAttackSpellDice(getPcAttackSpell(attack.spell.spellId),draft.spell?.slotLevel):component.formula) || "";
      meta.textContent=formula?(draft.outcome==="critical"?`${formula} · critico ${pcAttackCriticalDice(formula)}`:formula):"";
      const input=damage.querySelector(`[data-damage-input="${component.id}"]`);
      if(input) input.placeholder=formula?(draft.outcome==="critical"?pcAttackCriticalDice(formula):formula):"";
      meta.hidden=!formula;
    }
  }
  // Off turn (another creature's turn, the Lair's, an Epic Action's) an attack is taken with the reaction: a checkbox
  // above Registra, on by default; with the reaction already used, a warning instead (the attack marks nothing).
  function attackReaction() {
    if(!presentation || !draft || launching() || isArea() || !isOffTurn(presentation.turnState,sourceId)) return null;
    return {used:hasReactionUsed(presentation.item?.metadata?.[META_KEY]?.conditions)};
  }
  function renderReaction() {
    if(!reactionRow) return;
    const reaction=attackReaction();
    reactionRow.hidden=!reaction;
    if(!reaction){reactionSignature="";return;}
    const signature=JSON.stringify([reaction.used,useReaction,busy]);
    if(signature===reactionSignature) return;
    reactionSignature=signature;
    if(reaction.used){reactionRow.replaceChildren(node("span","Reazione già usata in questo round: l'attacco non la segna.","reaction-warning"));return;}
    const label=node("label","","reaction-toggle");
    const box=node("input");box.type="checkbox";box.checked=useReaction;box.disabled=busy || invalidated;
    box.addEventListener("change",()=>{useReaction=box.checked;reactionSignature="";});
    label.append(box,node("span","Usa la reazione (attacco di opportunità)"));
    reactionRow.replaceChildren(label);
  }
  function renderState() {
    renderReaction();
    if(isArea()) return renderAreaState();
    // On a miss the section stays only for the activations used on the roll (a bonus to hit); the extras need a hit,
    // or a passed save that still halves an arrow's damage.
    const damaging=hits(draft.outcome) || (!!resolved()?.saveHalf && draft.outcome==="passed");
    const preRollOnMiss=draft.outcome==="miss" && activationOptions().some(option=>option.preRoll);
    extrasSection.hidden=!damaging && !preRollOnMiss;
    if(!damaging) {if(wovenBox)wovenBox.hidden=true;ridersBox.hidden=true;}
    extrasBox.hidden=!damaging;addExtra.hidden=!damaging;
    // Activations follow the outcome and the riders chosen (Wrath of the Order, Wails from the Grave).
    updateActivations();
    if(extrasCaption) extrasCaption.textContent=preRollOnMiss?"Prima del tiro":resolved()?.cantrip?.save?"Extra al danno":"Extra al colpo";
    const view=preview();
    defensesBox.replaceChildren(...view.defenses.map(row=>{
      const chip=node("button",damageDefenseTag(row),"defense-chip");chip.type="button";
      chip.setAttribute("aria-pressed",String(!row.ignored));chip.title=row.ignored?"Difesa ignorata: clic per applicarla":"Clic per ignorarla in questo attacco";
      chip.disabled=busy;
      chip.addEventListener("click",()=>{
        draft.ignored=row.ignored?draft.ignored.filter(type=>type!==row.type):[...draft.ignored,row.type];renderState();
      });
      return chip;
    }));
    total.replaceChildren();total.title=view.ready?"":view.blocker;total.dataset.kind="";
    if(view.ready) {
      const strong=node("strong",String(draft.outcome==="miss"?0:view.total));
      total.append(strong,node("span",draft.outcome==="miss"?" danni":` danni · PF ${view.hp.before} → ${view.hp.after}`));
      if(view.secondary?.hp) total.append(node("span",` · seconda: ${view.secondary.total}`));
      if(view.spell?.casterHeal) total.append(node("span",` · caster PF ${view.spell.casterHeal.before} → ${view.spell.casterHeal.after}`));
    } else total.textContent=view.blocker;
    apply.disabled=busy || invalidated || !view.ready;
  }
  // An area attack: the extras of the roll (casters' riders, components added on the fly), the creatures' total.
  function renderAreaState() {
    extrasSection.hidden=false;
    if(wovenBox) wovenBox.hidden=true;
    if(activationsBox) activationsBox.hidden=true;
    if(activationsCaption) activationsCaption.hidden=true;
    extrasBox.hidden=false;addExtra.hidden=false;
    if(extrasCaption) extrasCaption.textContent="Extra al danno";
    defensesBox.replaceChildren();
    const view=areaPreview();
    total.replaceChildren();total.title=view.ready?"":view.blocker;total.dataset.kind="";
    // An area without damage (the metallic breath): the creatures it reaches.
    if(view.ready && !resolved()?.components?.length) total.append(node("strong",String(view.rows.length)),node("span",` ${view.rows.length===1?"creatura":"creature"} · nessun danno`));
    else if(view.ready) total.append(node("strong",String(view.total)),node("span",` danni · ${view.rows.length} ${view.rows.length===1?"creatura":"creature"}`));
    else total.textContent=view.blocker;
    apply.disabled=busy || invalidated || !view.ready;
  }
  function render() {
    // Saving or loading: the console says so to assistive technology, Registra in words.
    documentRef.querySelector?.(".glass-shell")?.setAttribute?.("aria-busy",String(busy || launchBusy));
    apply.textContent=committing?"Registro…":"Registra";
    renderFollow();renderUseSelected();renderReaction();renderTurnBadge();
    if(!presentation || (!draft && !launchBox)){form.hidden=true;if(applyRow)applyRow.hidden=true;return;}
    form.hidden=false;
    // A spell that left the book (or a launch view on an entry gone) falls back to the attack, or the first spell.
    if(launchKey && !(presentation.picker || []).some(entry=>entry.key===launchKey)) launchKey="";
    if(!draft && !launchKey) launchKey=pcAttackPickerDefault(presentation.picker,{})?.key || "";
    renderPicker();renderCaster();renderMonster();renderGrapple();
    if(launching()){renderReaction();renderLaunch();return;}
    if(attackView) attackView.hidden=false;
    if(maneuverBox) maneuverBox.hidden=true;
    if(launchBox){launchBox.hidden=true;launchSignature="";}
    if(launchButton) launchButton.hidden=true;
    apply.hidden=false;
    if(applyRow)applyRow.hidden=false;renderHeader();renderTarget();renderPalm();renderOutcomes();renderCantrip();renderDamage();renderWoven();renderRiders();renderActivations();renderExtras();renderState();
    if(palmBox && isArea()) palmBox.hidden=true;
  }
  // Selection and scene updates never rebuild the outcome buttons or the amount fields: a click in
  // flight or the caret in a field survives them.
  function renderLive() {
    renderFollow();renderUseSelected();renderReaction();renderTurnBadge();
    if(!presentation || (!draft && !launchBox)){form.hidden=true;if(applyRow)applyRow.hidden=true;return;}
    renderPicker();renderCaster();renderMonster();renderGrapple();
    if(launching()){renderLaunch();return;}
    renderTarget();renderPalm();updateDamageMeta();updateWoven();updateRiders();updateActivations();renderState();
  }

  // commit: the work registers the attack (Registra reads "Registro…" meanwhile).
  async function perform(work,{commit=false}={}) {
    if(busy || invalidated || !lifecycle.isReady()) return;
    const operation=lifecycle.capture();
    busy=true;committing=commit;render();
    try {await work(operation);}
    catch(error) {
      if(lifecycle.isCurrent(operation)) {
        // A definitive rejection needs a new attack identity; an uncertain ACK keeps it for the retry.
        if(["conflict","rejected"].includes(error?.status) && error.result?.committed!==true && draft) draft.attackInstanceId=newAttackId();
        setStatus(String(error?.message || error),"error");
      }
    }
    finally {busy=false;committing=false;render();}
  }
  async function refresh(operation) {
    const asked=actionId,askedSource=sourceId;
    const loaded=await runtime.getPcAttackPresentation(askedSource,asked);
    const traits=await monsterTraitEntries(loaded?.item);
    // A load for an action the picker has already left, or for the actor before the turn moved on, is stale.
    if(!lifecycle.isCurrent(operation) || asked!==actionId || askedSource!==sourceId) return;
    // A monster's traits join the Capacità tab; Grapple and Shove: every creature can try them (never counted as
    // something to show by pcAttackPickerEntries).
    loaded.picker=[...(loaded.picker || []),...traits,...pcAttackManeuverEntries()];
    // Without an action asked for, the runtime picked one (the last attack, else the first weapon).
    const switched=!!presentation && loaded.actionId!==undefined && loaded.actionId!==presentation.actionId;
    if(loaded.actionId) actionId=loaded.actionId;
    // An actor without attacks: only its spells, no attack form.
    if(!loaded.action){presentation=loaded;draft=null;requestedSpellId="";render();return;}
    // A changed definition (components edited in the card) starts a new attack.
    const sameAction=JSON.stringify(loaded.action)===JSON.stringify(presentation?.action);
    presentation=loaded;
    const fresh=!draft || !sameAction || switched;
    const wanted=requestedSpellId || loaded.spellId || "";
    const requested=fresh && [...pcAttackCantripIds(loaded.action),...pcAttackSpellIds(loaded.action)].includes(wanted)?wanted:"";
    requestedSpellId="";
    // Another action (the picker) starts without the previous one's arrow.
    if(fresh) draft=emptyDraft(loaded.action,draft?.targetId || null,requested || defaultCantripId(loaded.action,loaded.item),switched?"":draft?.attackMode || "");
    if(draft.targetId && !targetById(draft.targetId)) draft.targetId=null;
    if(fresh || form.hidden) render();else renderLive();
  }
  function scheduleRefresh() {
    if(refreshTimer || invalidated) return;
    refreshTimer=schedule(()=>{refreshTimer=null;if(busy){scheduleRefresh();return;}
      const operation=lifecycle.capture();
      void refresh(operation).catch(error=>{if(lifecycle.isCurrent(operation))setStatus(String(error?.message || error),"error");});},120);
  }
  function computeLiveSignature(items) {
    const source=items.find(item=>item.id===sourceId)?.metadata?.[META_KEY] || {};
    // The attacker's card, active features, pills and turn uses decide which riders apply; the targets'
    // HP, defenses and pills (Preda dell'Uccisore, Maledizione) too.
    return JSON.stringify([source.initiativeCard ?? null,source.classFeatureState ?? null,source.conditions ?? null,source.pcAttackState ?? null,
      source.hp ?? null,source[`${ID}/concentration`] ?? null,
      bossActionTargets(items,sourceId).map(item=>[item.id,item.name,item.metadata?.[META_KEY]?.hp,item.metadata?.[META_KEY]?.hpMax,
        item.metadata?.[META_KEY]?.initiativeCard?.damageDefenses ?? null,item.metadata?.[META_KEY]?.conditions ?? null])]);
  }
  async function readSelection(ids) {
    if(invalidated || !lifecycle.isReady() || !presentation) return;
    const operation=lifecycle.capture(),sequence=++selectionSequence;
    try {
      const selected=Array.isArray(ids)?ids:await api.player.getSelection();
      const list=Array.isArray(selected)?selected.filter(id=>typeof id==="string"):[];
      const items=list.length?await api.scene.items.getItems(list):[];
      if(!lifecycle.isCurrent(operation) || sequence!==selectionSequence || invalidated) return;
      selection=bossSelectionTarget(items,sourceId);
      selectedItems=(Array.isArray(items)?items:[]).filter(item=>item?.id);
      // Grapple and Shove follow the map selection like the attack, until the outcome is chosen.
      if(launching() && currentEntry()?.mode==="maneuver" && !busy) {
        const next=reconcileBossDraftTarget({targetId:maneuverDraft.targetId || null,locked:!!maneuverDraft.outcome},selection);
        if(next.targetId && targetById(next.targetId)) maneuverDraft.targetId=next.targetId;
      }
      if(draft && !busy) {
        const next=reconcileBossDraftTarget({targetId:draft.targetId,locked:draftLocked(draft)},selection);
        if(next.targetId && targetById(next.targetId)) draft.targetId=next.targetId;
        renderLive();
      } else if(launching()) renderLaunch();
      renderUseSelected();
    } catch {}
  }
  function mountLiveUpdates() {
    const add=unsubscribe=>{if(typeof unsubscribe==="function")unsubscribers.push(unsubscribe);};
    if(typeof api.player?.onChange==="function")add(api.player.onChange(player=>{if(Array.isArray(player?.selection))void readSelection(player.selection);}));
    if(typeof api.scene?.items?.onChange==="function")add(api.scene.items.onChange(items=>{
      const signature=computeLiveSignature(Array.isArray(items)?items:[]);
      if(signature!==liveSignature){liveSignature=signature;scheduleRefresh();}}));
    // A new turn changes what "once per turn" allows: re-read the turn with the presentation.
    let turn=JSON.stringify([presentation?.turnState?.round ?? null,presentation?.turnState?.current ?? null,presentation?.turnState?.order ?? null]);
    if(typeof api.scene?.onMetadataChange==="function")add(api.scene.onMetadataChange(metadata=>{
      const state=metadata?.[STATE_KEY],next=JSON.stringify([state?.round ?? null,state?.current ?? null,state?.order ?? null]);
      if(next!==turn){turn=next;scheduleRefresh();}}));
    documentRef.body?.addEventListener?.("pointerenter",()=>{void readSelection();});
  }
  function unmountLiveUpdates() {unsubscribers.splice(0).forEach(unsubscribe=>{try{unsubscribe();}catch{}});}
  function destroy() {
    unmountLiveUpdates();
    try{offPing?.();}catch{}
    try{offAutoOpen?.();}catch{}
    offPing=null;offAutoOpen=null;
    if(refreshTimer){clearTimeout(refreshTimer);refreshTimer=null;}
    lifecycle.dispose();
  }

  targetSelect.addEventListener("change",()=>{draft.targetId=targetSelect.value || null;draft.ignored=[];renderLive();});
  // Another cantrip: other damage (fresh amount), range and notes; the target, outcome and extras stay.
  function selectSpell(spellId) {
    draft.spellId=spellId;
    beamTally={spellId:"",count:0};
    draft.spell={castId:newCastId(),slotLevel:null,pact:false,damageType:"",doubles:false,fresh:false};
    // Another area (or none): the creatures are proposed again.
    draft.area={members:{},proposalKey:""};
    draft.amounts=Object.fromEntries((resolved()?.components || []).map(component=>[component.id,""]));
    // From an attack roll to a saving throw (or back): the outcome chosen before no longer exists.
    if(!pcAttackOutcomesFor(resolved()).includes(draft.outcome)) draft.outcome="";
    renderPicker();renderHeader();renderTarget();renderCantrip();renderOutcomes();renderDamage();updateRiders();updateActivations();renderState();
  }
  cantripSelect.addEventListener("change",()=>selectSpell(cantripSelect.value));
  pickerSelect?.addEventListener("change",()=>chooseEntry((presentation?.picker || []).find(entry=>entry.key===pickerSelect.value)));
  // The arrow that replaces the attack roll: the outcome kind changes (saves), and Piercing turns the target into an area.
  modeSelect?.addEventListener("change",()=>{
    draft.attackMode=modeSelect.value;draft.modeAmount="";draft.outcome="";draft.area={members:{},proposalKey:""};
    render();
  });
  const setAllOutcomes=outcome=>{
    for(const member of Object.values(draft.area.members)) if(member.on) member.outcome=outcome;
    renderArea();renderState();
  };
  areaAllFailed?.addEventListener("click",()=>setAllOutcomes("failed"));
  areaAllPassed?.addEventListener("click",()=>setAllOutcomes("passed"));
  areaPropose?.addEventListener("click",()=>{draft.area.proposalKey="";renderArea();});
  areaDraw?.addEventListener("click",()=>void drawBreathArea());
  // The console folds to its header while the GM draws on the map, then gets its height back.
  // Riduci (−): the console folds to its header, as while drawing, and unfolds (+) to the height it had. A new actor
  // (the turn moved on, an off-turn action) unfolds it.
  const minimizeButton=$("pc-attack-minimize");
  let minimizedHeight=0;
  function renderMinimized() {
    documentRef.body?.setAttribute?.("data-minimized",String(!!minimizedHeight));
    if(!minimizeButton) return;
    minimizeButton.textContent=minimizedHeight?"+":"−";
    minimizeButton.title=minimizedHeight?"Espandi":"Riduci";
    minimizeButton.setAttribute("aria-label",minimizeButton.title);
    minimizeButton.setAttribute("aria-expanded",String(!minimizedHeight));
    minimizeButton.disabled=!!drawing;
  }
  async function setMinimized(on) {
    if(drawing || on===!!minimizedHeight) return;
    if(on){minimizedHeight=await foldConsole(true) || PC_ATTACK_HEIGHT;}
    else {const height=minimizedHeight;minimizedHeight=0;await foldConsole(false,height);}
    renderMinimized();
  }
  minimizeButton?.addEventListener("click",()=>{void setMinimized(!minimizedHeight);});
  renderMinimized();
  async function foldConsole(fold,restore=0) {
    try {
      if(fold) {
        const height=Number(await api.popover?.getHeight?.(PC_ATTACK_POPOVER_ID)) || PC_ATTACK_HEIGHT;
        const header=documentRef.querySelector?.(".header");
        await api.popover?.setHeight?.(PC_ATTACK_POPOVER_ID,Math.ceil((header?.offsetHeight || 44)+2));
        return height;
      }
      if(restore) await api.popover?.setHeight?.(PC_ATTACK_POPOVER_ID,restore);
    } catch {}
    return 0;
  }
  // The breath's cone or line on the map, from the attacker's token: the creatures inside are ticked (never the
  // attacker); the GM still marks each save and may tick or untick by hand. Esc in the tool cancels.
  async function drawBreathArea() {
    const attack=resolved();
    const ruleId=pcBreathAreaRuleId(attack?.area?.shape,breathAreaType(attack));
    if(!ruleId || drawing || busy || !draft) return;
    const requestId=createSpellAreaPlacementRequestId(),active=draft,shape=attack.area.shape==="line"?"la linea":"il cono";
    drawing=requestId;renderArea();renderMinimized();
    setStatus(`Disegna ${shape} dal token di ${presentation.item?.name || "l'attaccante"}, poi conferma la sagoma. Esc annulla.`);
    const height=await foldConsole(true);
    let result;
    try {result=await placeArea({ruleId,casterId:sourceId,requestId,context:{phase:"pc-attack",actionId}});}
    catch(error) {result={status:"error",error:String(error?.message || error)};}
    await foldConsole(false,height);
    if(drawing!==requestId) return;
    drawing="";renderMinimized();
    if(draft!==active){void cancelArea(requestId).catch(()=>{});renderArea();return;}
    if(result?.status==="confirmed" && result.preview) {
      const ids=new Set((Array.isArray(result.preview.targetIds)?result.preview.targetIds:[]).map(id=>String(id || "")).filter(id=>id && id!==sourceId));
      for(const item of presentation.targets) {
        const member=draft.area.members[item.id] ||= {on:false,outcome:""};
        member.on=ids.has(item.id);
      }
      const listed=presentation.targets.filter(item=>ids.has(item.id)).length,untracked=ids.size-listed;
      setStatus(`${attack.area.shape==="line"?"Sulla linea":"Nel cono"}: ${listed} ${listed===1?"creatura":"creature"}`
        +`${untracked>0?` (${untracked} senza PF tracciati, escluse)`:""}. Segna i tiri salvezza.`,"ok");
    } else setStatus(result?.status==="cancelled"?"Disegno annullato.":`Disegno non riuscito${result?.error?`: ${result.error}`:""}.`,result?.status==="cancelled"?"warn":"error");
    renderArea();renderState();
  }
  addExtra.addEventListener("click",()=>{
    if(!draft || draft.extras.length>=MAX_PC_ATTACK_EXTRAS) return;
    draft.extras.push({type:"",amount:"",label:""});
    renderExtras();renderState();
    extrasBox.querySelector(`[data-extra-index="${draft.extras.length-1}"] select`)?.focus?.();
  });
  apply.addEventListener("click",()=>perform(async operation=>{
    if(isArea()) {
      const view=areaPreview();
      if(!view.ready) throw new Error(view.blocker);
      const attack=resolved();
      const result=await runtime.executePcAttackArea({sourceId,actionId,expectedAction:presentation.action,
        ...(draft.spellId?{spellId:draft.spellId}:{}),...(draft.attackMode?{attackMode:draft.attackMode,modeAmount:Number(draft.modeAmount)}:{}),
        members:areaMembers().map(member=>({targetId:member.item.id,outcome:member.outcome})),
        componentAmounts:Object.fromEntries(Object.entries(draft.amounts).map(([id,value])=>[id,Number(value)])),
        riders:areaRiders().map(rider=>({...rider,amount:Number(rider.amount)})),
        extras:(draft.extras || []).map(extra=>({type:extra.type,amount:Number(extra.amount),label:String(extra.label || "").trim()})),
        expectedDefenses:Object.fromEntries(view.rows.map(row=>[row.id,row.profileDefenses])),
        attackInstanceId:draft.attackInstanceId,sceneIdentity:presentation.sceneIdentity});
      if(!lifecycle.isCurrent(operation)) return;
      showUndo(result);
      setStatus([areaSummary(result,attack.cantrip?.name || attack.breath?.name || attack.monster?.name || attack.mode?.label),...(result.warnings || [])].join("\n"),"ok");
      rememberEntry(currentEntry()?.key);
      markPendingReady();
      draft=emptyDraft(presentation.action,null,draft.spellId,draft.attackMode);
      await refresh(operation);
      render();
      return;
    }
    const view=preview();
    if(!view.ready) throw new Error(view.blocker);
    // Freeze every decision before the commit: later selection changes cannot alter this request.
    const request={sourceId,actionId,targetId:draft.targetId,outcome:draft.outcome,
      componentAmounts:draft.outcome==="miss"?{}:Object.fromEntries(Object.entries(draft.amounts).map(([id,value])=>[id,Number(value)])),
      ignoredDefenses:[...draft.ignored],expectedDefenses:view.profileDefenses,expectedAction:presentation.action,
      riders:chosenRiders(draft).map(rider=>({...rider,amount:Number(rider.amount)})),
      extras:chosenExtras(draft).map(extra=>({...extra,amount:Number(extra.amount),label:String(extra.label || "").trim()})),
      activations:chosenActivations(draft).map(activation=>({...activation,...(activation.amount!==undefined?{amount:Number(activation.amount)}:{}),
        ...(activation.tempHp?{tempHp:activation.tempHp.map(entry=>({targetId:entry.targetId,amount:Number(entry.amount)}))}:{})})),
      ...(draft.spellId?{spellId:draft.spellId}:{}),...(chosenSpellCast()?{spellCast:chosenSpellCast()}:{}),
      ...(chosenWeaponCantrip(draft)?{weaponCantrip:(({spellId,amount,secondary})=>({spellId,...(amount!==""?{amount:Number(amount)}:{}),
        ...(secondary?{secondary:{targetId:secondary.targetId,amount:Number(secondary.amount)}}:{})}))(chosenWeaponCantrip(draft))}:{}),
      ...(view.secondary?{expectedSecondaryDefenses:view.secondary.profileDefenses}:{}),
      ...(draft.attackMode?{attackMode:draft.attackMode,...(draft.modeAmount!==""?{modeAmount:Number(draft.modeAmount)}:{})}:{}),
      ...(chosenActivations(draft).some(activation=>activation.burstTargetIds?.length)?{expectedBurstDefenses:Object.fromEntries(
        chosenActivations(draft).flatMap(activation=>activation.burstTargetIds || []).map(id=>[id,damageDefensesForItem(creatureById(id),META_KEY)]))}:{}),
      ...(useReaction && attackReaction()?.used===false?{useReaction:true}:{}),
      attackInstanceId:draft.attackInstanceId,sceneIdentity:presentation.sceneIdentity};
    // A smite without a slot left: the GM decides before the commit.
    const exhausted=pcAttackSmiteSlotPlans(presentation.item,request.riders).filter(entry=>entry.plan.exhausted);
    // The first registration of a leveled spell spends its slot: the same question when none is left.
    const spellAttack=resolved()?.spell;
    const spellSlot=spellAttack && view.spell ? pcAttackSpellSlotPlan(presentation.item,{...view.spell,level:spellAttack.level,...(draft.spell.pact?{pact:true}:{})}) : null;
    if(spellSlot?.exhausted) exhausted.push({name:spellAttack.name,plan:spellSlot});
    if(exhausted.length) {
      const message=exhausted.map(entry=>`${entry.name}: ${entry.plan.message}`).join("\n");
      if(!window.confirm(`${message}\n\nRegistrare comunque l'attacco senza scalare lo slot?`)) {
        setStatus("Attacco non registrato: nessuno slot disponibile.","warn");
        return;
      }
      request.castWithoutSlot=true;
    }
    const result=await runtime.executePcAttack(request);
    if(!lifecycle.isCurrent(operation)) return;
    showUndo(result);
    setStatus([resultSummary(result),...(result.spell?[spellResultSummary(result.spell)]:[]),...(result.reaction?.spent?["Reazione segnata."]:[]),
      ...(result.followUps || []),...(result.warnings || [])].join("\n"),"ok");
    rememberEntry(currentEntry()?.key);
    markPendingReady();
    if(getPcAttackCantrip(draft.spellId)?.scaling==="beams")
      beamTally=beamTally.spellId===draft.spellId?{...beamTally,count:beamTally.count+1}:{spellId:draft.spellId,count:1};
    // Ready for the next attack (Extra Attack, two weapons, another beam): same target, a new identity.
    draft=emptyDraft(presentation.action,draft.targetId,draft.spellId,draft.attackMode);
    await refresh(operation);
    render();
  },{commit:true}));
  maneuverTarget?.addEventListener("change",()=>{maneuverDraft.targetId=maneuverTarget.value;const entry=currentEntry();if(entry?.mode==="maneuver")renderManeuver(entry);});
  palmAmount?.addEventListener("input",()=>{palmDraft.amount=palmAmount.value.trim();renderPalm();});
  palmApply?.addEventListener("click",()=>perform(async operation=>{
    const target=targetById(palmDraft.targetId);
    if(!target || !palmDraft.outcome) return;
    const result=await runtime.endQuiveringPalm({sourceId,targetId:target.id,outcome:palmDraft.outcome,
      ...(palmDraft.outcome==="passed"?{amount:Number(palmDraft.amount),expectedDefenses:damageDefensesForItem(target,META_KEY)}:{}),
      attackInstanceId:palmDraft.id,sceneIdentity:presentation.sceneIdentity});
    if(!lifecycle.isCurrent(operation)) return;
    showUndo(result);
    setStatus([quiveringPalmSummary(result),...(result.warnings || [])].join("\n"),"ok");
    markPendingReady();
    palmDraft={targetId:"",outcome:"",amount:"",id:newAttackId()};
    await refresh(operation);
  }));
  undoButton.addEventListener("click",()=>{
    if(!lastUndo) return;
    const entry=lastUndo;
    return perform(async operation=>{
      const outcome=await undoEntry(entry.historyEntryId,{epoch:operation.epoch});
      if(!lifecycle.isCurrent(operation)) return;
      showUndo(null);setStatus(outcome?.ok?"Ultimo attacco annullato.":outcome?.message || "Annullamento non applicato.",outcome?.ok?"ok":"error");
      await refresh(operation);
    });
  });
  function restoreLastEntry() {
    if(!restoreLastAsked || invalidated || busy || !presentation) return;
    restoreLastAsked=false;
    const key=rememberedEntry(),entry=(presentation.picker || []).find(item=>item.key===key);
    if(entry && entry.key!==currentEntry()?.key) chooseEntry(entry);
  }
  function closeConsole() {destroy();void api.popover.close(PC_ATTACK_POPOVER_ID);}
  // A registration while a turn change waits: the bar offers the move in evidence (another attack still can be made).
  function markPendingReady() {
    if(!pendingFollow) return;
    pendingReady=true;renderFollow();
  }
  // A new actor in place: a fresh attack (no target, no undo of the previous actor's entry: History keeps it).
  function switchActor(next,name="",{offTurn=false}={}) {
    void setMinimized(false);
    pendingFollow=null;pendingReady=false;renderFollow();
    sourceId=next;actionId="";requestedSpellId="";launchKey="";launchSignature="";
    presentation=null;draft=null;liveSignature="";useReaction=true;reactionSignature="";
    beamTally={spellId:"",count:0};palmDraft={targetId:"",outcome:"",amount:"",id:newAttackId()};
    maneuverDraft={kind:"",targetId:"",outcome:"",effect:"",id:newAttackId()};grappleSignature="";maneuverSignature="";
    selection={status:"none",target:null,candidates:[]};selectedItems=[];
    showUndo(null);setStatus(name?offTurn?`Fuori turno: ${name}.`:`Turno di ${name}.`:"");
    render();
    restoreLastAsked=true;
    void perform(async operation=>{await refresh(operation);}).then(()=>readSelection()).then(()=>restoreLastEntry());
  }
  // The turn moved on (next: "" for a turn with nothing to show). A clean console moves or closes by itself; one holding
  // decisions (an outcome, an amount, an extra, a cast in flight) waits for the GM.
  function followTurn(next,name="") {
    if(invalidated) return;
    if(next===sourceId){pendingFollow=null;pendingReady=false;renderFollow();return;}
    if(busy || launchBusy || palmDraft.outcome || maneuverDraft.outcome || (draft && draftLocked(draft))){pendingFollow={sourceId:next,name};pendingReady=false;renderFollow();return;}
    if(!next){closeConsole();return;}
    switchActor(next,name);
  }
  // A creature the console can show: something in its picker (an attack, a spell, a feature).
  const hasEntries=item=>!!item && pcAttackPickerEntries(item.metadata?.[META_KEY]?.initiativeCard || {}).length>0;
  const leaveDraft=()=>!((draft && draftLocked(draft)) || palmDraft.outcome || maneuverDraft.outcome)
    || confirmSwitch("Lasciare questo attacco? Le scelte non registrate andranno perse.");
  // The actor in the turn (presentation.turnState): never the Lair or an Epic Action slot; a Paragon's extra turn is its
  // creature's. Only a creature the console can show.
  function turnActor() {
    const state=presentation?.turnState;
    const order=Array.isArray(state?.order)?state.order.filter(id=>typeof id==="string" && id):[];
    if(!order.length) return null;
    const actorId=order[Math.max(0,Math.min(order.length-1,Math.floor(Number(state.current) || 0)))];
    if(isLairId(actorId) || isEpicActionId(actorId)) return null;
    const id=splitParagonId(actorId).baseId;
    const item=id===presentation.item?.id?presentation.item:(presentation.targets || []).find(target=>target.id===id);
    return item && hasEntries(item)?{id,name:String(item.name || "")}:null;
  }
  function renderFollow() {
    if(!followBar) return;
    const away=!pendingFollow && presentation?(()=>{const actor=turnActor();return actor && actor.id!==sourceId?actor:null;})():null;
    followBar.hidden=!pendingFollow && !away;
    if(followBar.hidden){followBar.replaceChildren();followSignature="";return;}
    // Off turn: one click back to the turn's actor (rebuilt only when it changes: a live update keeps the button).
    if(!pendingFollow) {
      const signature=JSON.stringify(["away",away.id,away.name,busy,launchBusy]);
      if(signature===followSignature) return;
      followSignature=signature;
      const back=node("button",away.name?`Torna a ${away.name}`:"Torna al turno","small");back.type="button";
      back.disabled=busy || launchBusy;
      back.addEventListener("click",()=>{if(!busy && !launchBusy && leaveDraft())switchActor(away.id,away.name);});
      followBar.dataset.kind="off";
      followBar.replaceChildren(node("span",`Fuori turno${away.name?`: è il turno di ${away.name}`:""}.`),back);
      return;
    }
    const {sourceId:next,name}=pendingFollow;
    const pendingSignature=JSON.stringify(["pending",next,name,pendingReady]);
    if(pendingSignature===followSignature) return;
    followSignature=pendingSignature;
    const button=node("button",next?(name?`Passa a ${name}`:"Passa al nuovo turno"):"Chiudi",pendingReady?"apply primary follow-ready":"small");button.type="button";
    button.addEventListener("click",()=>{
      const target=pendingFollow;
      if(!target || busy || launchBusy) return;
      if(((draft && draftLocked(draft)) || palmDraft.outcome || maneuverDraft.outcome) && !confirmSwitch("Lasciare questo attacco? Le scelte non registrate andranno perse.")) return;
      if(!target.sourceId){closeConsole();return;}
      switchActor(target.sourceId,target.name);
    });
    // The turn moved on (amber), or the attack is registered and the move is the main action (blue).
    followBar.dataset.kind=pendingReady?"ready":"moved";
    followBar.classList?.toggle?.("ready",pendingReady);
    followBar.replaceChildren(node("span",pendingReady?`Registrato. ${name?`È il turno di ${name}.`:"È cambiato il turno."}`:name?`È il turno di ${name}.`:"È cambiato il turno."),button);
  }
  function renderUseSelected() {
    if(!useSelectedButton) return;
    const target=selection.status==="single"?selection.target:null;
    const show=!!presentation && !!target && target.id!==sourceId && hasEntries(target);
    useSelectedButton.hidden=!show;
    if(useSelectedRow) useSelectedRow.hidden=!show;
    if(!show) return;
    const name=String(target.name || "il token selezionato");
    useSelectedButton.textContent=`⇄ Agisci con ${name}`;
    useSelectedButton.title=`Passa a ${name} (selezionato sulla mappa): un'azione fuori turno`;
    useSelectedButton.setAttribute("aria-label",useSelectedButton.title);
    useSelectedButton.disabled=busy || launchBusy;
  }
  useSelectedButton?.addEventListener("click",()=>{
    const target=selection.status==="single"?selection.target:null;
    if(!target || target.id===sourceId || busy || launchBusy || !leaveDraft()) return;
    switchActor(target.id,String(target.name || ""),{offTurn:true});
  });
  $("pc-attack-close").addEventListener("click",()=>closeConsole());
  documentRef.addEventListener?.("keydown",event=>{
    // Esc closes the console, after asking when an attack holds decisions not registered yet.
    if(event.key==="Escape" && menuOpen){setMenuOpen(false,{focus:true});return;}
    if(event.key==="Escape"){
      if(busy) return;
      if(((draft && draftLocked(draft)) || palmDraft.outcome || maneuverDraft.outcome) && !confirmSwitch("Chiudere la console? Le scelte non registrate andranno perse.")) return;
      closeConsole();return;
    }
    // Enter in a typed field (an amount, a feature's number) registers the attack, or runs the spell or feature, once
    // its summary is ready: the button it would press is enabled. Not in a field with suggestions (Spell Thief).
    const field=event.target;
    if(event.key!=="Enter" || event.isComposing || busy || launchBusy || field?.tagName!=="INPUT" || ["checkbox","radio"].includes(field.type) || field.getAttribute?.("list")) return;
    const button=launching()?launchButton:apply;
    if(!button || button.hidden) return;
    if(button.disabled) {
      const boxes=launching()?[launchBox]:[damage,wovenBox,ridersBox,activationsBox,extrasBox];
      const amounts=boxes.filter(Boolean).flatMap(box=>[...box.querySelectorAll(".amount")]).filter(input=>!input.hidden && !input.disabled && input.offsetParent!==null);
      const next=amounts.slice(amounts.indexOf(field)+1).find(input=>input.value==="") || amounts.find(input=>input!==field && input.value==="");
      if(next){event.preventDefault?.();next.focus?.();}
      return;
    }
    event.preventDefault?.();
    button.click();
  });
  // The turn controller (pcAttackTurnController.js) asks whether a console is open: an open one is never reloaded.
  if(typeof api.broadcast?.onMessage==="function") offPing=api.broadcast.onMessage(PC_ATTACK_CONSOLE_CHANNEL,event=>{
    if(event?.data?.type==="follow"){followTurn(String(event.data.sourceId || ""),String(event.data.name || ""));return;}
    if(event?.data?.type!=="ping") return;
    void Promise.resolve().then(()=>api.broadcast.sendMessage(PC_ATTACK_CONSOLE_CHANNEL,{type:"pong",sourceId,actionId},{destination:"LOCAL"})).catch(()=>{});
  });
  // The turn auto-open: local options of this browser, switched here or in the options panel (pcAttackAutoOpenOption.js),
  // one for characters and allies (PG), one for monsters and bosses (Mostri, following PG until touched).
  const offAutoOpens=[];
  const bindAutoOpen=(box,override,monsters,who)=>{
    if(!box) return;
    const option=override?Promise.resolve(override)
      :import("./pcAttackAutoOpenOption.js").then(module=>module.createPcAttackAutoOpenOption(undefined,{monsters}));
    void option.then(async value=>{
      const off=await value.subscribe(on=>{box.checked=on;if(autoOpenRow)autoOpenRow.hidden=false;});
      offAutoOpens.push(()=>{off?.();value.stop?.();});
      box.addEventListener("change",()=>{
        const on=box.checked;
        void Promise.resolve().then(()=>value.set(on)).then(()=>setStatus(on
          ?`La console si aprirà da sola a ogni turno di ${who} con attacchi.`
          :`La console non si aprirà più da sola al turno di ${who}.`,"ok")).catch(error=>setStatus(String(error?.message || error),"error"));
      });
    }).catch(error=>console.warn("[pc-attack] auto-open option:",error?.message || error));
  };
  bindAutoOpen(autoOpenBox,overrides.autoOpenOption,false,"un personaggio o alleato");
  bindAutoOpen(autoOpenMonstersBox,overrides.autoOpenMonstersOption,true,"un mostro");
  offAutoOpen=()=>{for(const off of offAutoOpens.splice(0)) off();};
  const unsubscribe=lifecycle.subscribe(event=>{
    if(event.phase==="unavailable"){
      invalidated=true;presentation=null;draft=null;unmountLiveUpdates();render();showUndo(null);
      setStatus("Scena cambiata: chiudi e riapri l'attacco.","error");
    }
  });
  showUndo(null);
  const ready=lifecycle.mount().then(()=>perform(async operation=>{
    if(await api.player.getRole()!=="GM"){invalidated=true;throw new Error("Solo il GM può registrare un attacco.");}
    await refresh(operation);
    mountLiveUpdates();
  })).then(()=>readSelection()).then(()=>restoreLastEntry());
  globalThis.addEventListener?.("beforeunload",()=>{unsubscribe();destroy();},{once:true});
  return {ready,getPresentation:()=>presentation,getDraft:()=>draft,destroy:()=>{unsubscribe();destroy();}};
}
if(typeof document!=="undefined") OBR.onReady(()=>bootPcAttack(document));
