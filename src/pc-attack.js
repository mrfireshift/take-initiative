import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { createSceneLifecycleAdapter } from "./sceneLifecycle.js";
import { createPcAttackRuntime } from "./pcAttackExecution.js";
import { PC_ATTACK_OUTCOME_LABELS, MAX_PC_ATTACK_EXTRAS, pcAttackPreview, pcAttackRiderOptions, pcAttackSelectionHint, pcAttackActivationOptions,
  pcAttackCantripDiceFor, pcAttackCantripIds, pcAttackResolvedAction, pcAttackOutcomesFor, pcAttackSaveLabel, pcAttackDamageFactor,
  pcAttackCantripPillLabels, pcAttackWeaponCantripOptions, pcAttackActionWeaponCantripIds, pcAttackQuiveringPalm } from "./pcAttackCore.js";
import { pcAttackHasPotentCantrip } from "./pcAttackRiderCatalog.js";
import { getPcAttackCantrip, pcAttackCantripBeams, PC_ATTACK_SAVE_LABELS } from "./pcAttackCantripCatalog.js";
import { totalCharacterLevel } from "./abilityModifiersCore.js";
import { pcAttackCriticalDice } from "./pcAttackRiderCatalog.js";
import { bossActionTargets, bossSelectionTarget, reconcileBossDraftTarget, bossTargetLabel } from "./bossActionsViewCore.js";
import { DAMAGE_TYPES, damageDefenseTag, damageTypeLabel, damageDefensesForItem } from "./damageDefensesCore.js";
import { PC_ATTACK_POPOVER_ID } from "./pcAttackLauncher.js";
import "./popoverDrag.js";

const META_KEY=`${ID}/meta`;
const STATE_KEY=`${ID}/state`;
const RANGE_LABELS=Object.freeze({melee:"Mischia",ranged:"Distanza"});
const newAttackId=()=>`pc-attack:${globalThis.crypto?.randomUUID?.() || Date.now().toString(36)+":"+Math.random().toString(36).slice(2)}`;

// Undo goes through the existing History, only for the latest confirmed entry (same rule as Boss Actions).
async function defaultPcAttackUndo(entryId,{epoch}) {
  const [{getHistoryEntries,undoHistoryThrough},{HISTORY_UNDO_OUTCOME,normalizeHistoryUndoResult}]=await Promise.all([
    import("./history.js"),import("./historyUndoResultCore.js")]);
  const entries=await getHistoryEntries();
  if(entries[entries.length-1]?.id!==entryId) return {ok:false,message:"Sono presenti modifiche successive: usa la Cronologia."};
  const outcome=normalizeHistoryUndoResult(await undoHistoryThrough(entryId,{sceneEpoch:epoch}));
  return outcome.outcome===HISTORY_UNDO_OUTCOME.COMMITTED ? {ok:true} : {ok:false,message:"Undo non applicato: verifica la Cronologia."};
}

function emptyDraft(action,targetId=null,spellId="") {
  const components=pcAttackResolvedAction(action,spellId)?.components || [];
  return {targetId,spellId,outcome:"",amounts:Object.fromEntries(components.map(component=>[component.id,""])),ignored:[],
    riders:{},activations:{},extras:[],woven:{spellId:"",amount:"",secondaryTargetId:"",secondaryAmount:""},attackInstanceId:newAttackId()};
}
// The cantrip a cantrip action opens with: the one this attacker used last, when this action still offers it.
export function defaultCantripId(action,sourceItem) {
  const offered=pcAttackCantripIds(action);
  const last=sourceItem?.metadata?.[`${ID}/meta`]?.pcAttackState?.lastAttack?.spellId;
  return offered.includes(last) ? last : offered[0] || "";
}
// The map selection drives the target until the GM has decided something for this attack.
const draftLocked=draft=>!!draft.outcome || Object.values(draft.amounts).some(value=>value!=="")
  || Object.values(draft.riders).some(rider=>rider.on) || Object.values(draft.activations || {}).some(activation=>activation.on) || draft.extras.length>0;
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
    ...(Array.isArray(activation.tempHp)?{amount:activation.amount,tempHp:activation.tempHp.map(entry=>({targetId:entry.targetId,amount:entry.amount}))}:{})}));
}
// The weapon cantrip woven into a melee weapon attack (only on a hit), with Green-Flame Blade's second creature.
export function chosenWeaponCantrip(draft) {
  const woven=draft?.woven;
  if(!hits(draft?.outcome) || !woven?.spellId) return null;
  return {spellId:woven.spellId,amount:woven.amount,
    ...(woven.secondaryTargetId?{secondary:{targetId:woven.secondaryTargetId,amount:woven.secondaryAmount}}:{})};
}
export function chosenExtras(draft) {
  return hits(draft?.outcome) ? (draft.extras || []).map(extra=>({type:extra.type,amount:extra.amount,label:extra.label})) : [];
}
const typeLabel=type=>{const label=damageTypeLabel(type);return label.charAt(0).toUpperCase()+label.slice(1);};

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

export function bootPcAttack(documentRef=document,overrides={}) {
  const api=overrides.api || OBR;
  const lifecycle=overrides.lifecycle || createSceneLifecycleAdapter({obr:api});
  const runtime=overrides.runtime || createPcAttackRuntime({api,
    getEpoch:()=>lifecycle.currentEpoch(),
    isCurrentEpoch:epoch=>lifecycle.isReady() && lifecycle.currentEpoch()===epoch});
  const undoEntry=overrides.undo || defaultPcAttackUndo;
  const schedule=overrides.schedule || ((callback,delay)=>setTimeout(callback,delay));
  const params=new URLSearchParams(globalThis.location?.search || "");
  const sourceId=overrides.sourceId ?? params.get("source");
  const actionId=overrides.actionId ?? params.get("action");
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
  const applyRow=$("pc-attack-apply-row");
  const cantripRow=$("pc-attack-cantrip-row"),cantripSelect=$("pc-attack-cantrip"),cantripNote=$("pc-attack-cantrip-note");
  const extrasCaption=$("pc-attack-extras-caption");
  let presentation=null,draft=null,busy=false,invalidated=false,lastUndo=null;
  // Eldritch Blast: the beams registered in this console for the cantrip in use (one registration per beam).
  let beamTally={spellId:"",count:0};
  const attackerCard=()=>presentation?.item?.metadata?.[META_KEY]?.initiativeCard || {};
  let selection={status:"none",target:null,candidates:[]},selectionSequence=0,refreshTimer=null,liveSignature="";
  const unsubscribers=[];
  const node=(tag,text="",className="")=>{const element=documentRef.createElement(tag);element.textContent=text;if(className)element.className=className;return element;};
  const setStatus=message=>{status.textContent=message;};
  const targetById=id=>presentation?.targets.find(item=>item.id===id) || null;

  function showUndo(entry) {
    lastUndo=entry?.undoAvailable && entry.historyEntryId ? {historyEntryId:entry.historyEntryId} : null;
    undoButton.hidden=!lastUndo;
  }
  function preview() {
    return pcAttackPreview({action:presentation?.action,spellId:draft?.spellId,sourceItem:presentation?.item,targetItem:targetById(draft?.targetId),outcome:draft?.outcome,
      amounts:draft?.amounts,ignoredDefenses:draft?.ignored,riders:chosenRiders(draft),extras:chosenExtras(draft),turnState:presentation?.turnState,
      weaponCantrip:chosenWeaponCantrip(draft),secondaryItem:targetById(secondaryTargetId()),activations:chosenActivations(draft),
      tempHpItems:presentation?[presentation.item,...presentation.targets]:[]});
  }
  // The second creature of this attack: Green-Flame Blade's, or an activation's (Sweeping Attack, Slashing Flourish…).
  const secondaryTargetId=()=>chosenWeaponCantrip(draft)?.secondary?.targetId
    || chosenActivations(draft).find(activation=>activation.secondaryTargetId)?.secondaryTargetId || "";
  function activationOptions() {
    return pcAttackActivationOptions({action:presentation?.action,spellId:draft?.spellId,sourceItem:presentation?.item,targetItem:targetById(draft?.targetId),
      turnState:presentation?.turnState,riders:chosenRiders(draft),extras:chosenExtras(draft),outcome:draft?.outcome || ""});
  }
  const wovenOptions=()=>pcAttackWeaponCantripOptions(presentation?.action,attackerCard());
  function riderOptions() {
    return pcAttackRiderOptions({action:presentation?.action,spellId:draft?.spellId,sourceItem:presentation?.item,targetItem:targetById(draft?.targetId),turnState:presentation?.turnState});
  }
  const resolved=()=>pcAttackResolvedAction(presentation?.action,draft?.spellId);
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
  // Cantrip actions: the cantrip picker, the on-hit effect still resolved by hand and Eldritch Blast's beams.
  function renderCantrip() {
    const offered=pcAttackCantripIds(presentation.action);
    cantripRow.hidden=!offered.length;
    if(!offered.length){cantripNote.hidden=true;return;}
    cantripSelect.replaceChildren(...offered.map(spellId=>{
      const cantrip=getPcAttackCantrip(spellId);
      const option=node("option",cantrip?.save?`${cantrip.name} · TS ${PC_ATTACK_SAVE_LABELS[cantrip.save]}`:cantrip?.name || spellId);
      option.value=spellId;return option;}));
    cantripSelect.value=draft.spellId;cantripSelect.disabled=busy;
    const cantrip=getPcAttackCantrip(draft.spellId);
    const pills=cantrip?pcAttackCantripPillLabels(cantrip.spellId):[];
    const beams=pcAttackCantripBeams(cantrip,characterLevel());
    const registered=beamTally.spellId===draft.spellId?beamTally.count:0;
    const beamNote=registered>=beams?`Raggi: registrati tutti e ${beams}.`
      :`Raggi: ${beams} al livello del personaggio${registered?` · registrati ${registered}`:""}. Registra un attacco per raggio.`;
    const notes=[...(cantrip?.scaling==="beams"?[beamNote]:[]),
      ...(cantrip?.save && pcAttackHasPotentCantrip(attackerCard())?["Trucchetto Potente: con il TS superato subisce metà danni."]:[]),
      ...(cantrip?.ruleNote?[cantrip.ruleNote]:[]),
      ...(pills.length?[`${cantrip.save?"Se fallisce":"Al colpo"}: pill ${pills.map(label=>`«${label}»`).join(", ")}.`]:[]),
      ...(cantrip?.effectNote?[`${cantrip.save?"Se fallisce":"Al colpo"}, da applicare a mano: ${cantrip.effectNote}`]:[]),
      ...(weaponCantripHint()?[weaponCantripHint()]:[])];
    cantripNote.textContent=notes.join(" ");cantripNote.hidden=!notes.length;
  }
  const typeSelect=(types,value,{placeholder="",format=typeLabel,className="field"}={})=>{
    const select=node("select","",className);
    const options=[...(placeholder?[["",placeholder]]:[]),...types.map(type=>[type,format(type)])].map(([optionValue,label])=>{const option=node("option",label);option.value=optionValue;return option;});
    select.replaceChildren(...options);select.value=value;return select;
  };
  const amountInput=(value,label)=>{
    const input=node("input","","amount");input.type="number";input.min="0";input.step="1";input.inputMode="numeric";input.value=value;
    input.setAttribute("aria-label",label);return input;
  };
  // Every damage row shares one grid: lead (checkbox, remove or nothing), name over a secondary line, amount.
  const componentRow=(lead,body,amount)=>{
    const row=node("div","","component-row");
    const leadCell=node("div","","component-lead");if(lead)leadCell.append(lead);
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
      toggle.addEventListener("change",()=>{state.on=toggle.checked;updateRiders();renderState();});
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
      // Smites: the slot level (never decremented: PC slots are not tracked), the undead/fiend bonus, the on-hit pill.
      if(option.slotLevels || option.onHit) {
        const extra=node("div","","component-options");extra.dataset.riderField="options";
        if(option.slotLevels) {
          const slot=node("select","","inline-select");slot.dataset.riderField="slot";slot.setAttribute("aria-label",`Livello dello slot di ${option.label}`);
          slot.title="Lo slot non viene scalato: aggiornalo sulla scheda del personaggio.";
          slot.replaceChildren(...option.slotLevels.map(level=>{const entry=node("option",`Slot ${level}°`);entry.value=String(level);return entry;}));
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
      const field=name=>row.querySelector(`[data-rider-field="${name}"]`);
      field("on").checked=state.on;field("on").disabled=busy || !option.available;
      field("amount").hidden=!state.on;field("amount").disabled=busy;
      if(field("type")) field("type").disabled=busy;
      const dice=option.slotLevels?(state.bonus?option.bonus.diceBySlot:option.diceBySlot)[state.slotLevel]:option.dice;
      field("dice").textContent=dice?(draft.outcome==="critical"?`${dice} · critico ${pcAttackCriticalDice(dice)}`:dice):"—";
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
      const toggle=node("input");toggle.type="checkbox";toggle.dataset.activationField="on";toggle.setAttribute("aria-label",option.label);
      toggle.addEventListener("change",()=>{
        state.on=toggle.checked;
        // One maneuver (one Arcane Shot, one flourish) per attack: ticking one unticks the others of its group.
        if(state.on && option.group) for(const other of activationOptions()) if(other.group===option.group && other.id!==option.id && draft.activations[other.id]) draft.activations[other.id].on=false;
        updateActivations();renderState();
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
        const list=node("div","","temp-hp-list");list.dataset.activationField="temp-hp";
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
    const critical=dice=>draft.outcome==="critical" && dice?`${dice} · critico ${pcAttackCriticalDice(dice)}`:dice;
    for(const option of options) {
      const row=activationsBox.querySelector(`[data-activation-id="${option.id}"]`);
      const state=draft.activations[option.id];
      // An activation that stops applying (another target, a new turn, a rider unticked) is unticked; its amount stays.
      if(!option.available) state.on=false;
      if(option.types.length && !option.types.includes(state.type)) state.type=option.types[0];
      const field=name=>row.querySelector(`[data-activation-field="${name}"]`);
      field("on").checked=state.on;field("on").disabled=busy || !option.available;
      const resource=option.resources.map(entry=>entry.unlimited || entry.current===null?entry.name:`${entry.name} ${entry.current}/${entry.maximum ?? "?"}`);
      const dice=option.tempHp?`${option.dice || "2d8 + livello"} PF temporanei`
        :option.damage || option.secondary?`${critical(option.dice) || "dado"} ${option.types.length===1?damageTypeLabel(option.types[0]):""}`.trim():"";
      // A choice's save and effect replace the activation's (Open Hand Technique).
      const choice=option.choices?option.choices.find(entry=>entry.id===state.choice) || null:null;
      const save=choice?choice.save:option.save;
      const saveText=save?`TS ${save.label}${save.dc?` CD ${save.dc}`:""}`:"";
      // Each part keeps its words together ("TS Saggezza CD 16"): the line wraps only between parts.
      field("meta").textContent=[dice,option.rollBonus?`${option.rollBonus} al tiro per colpire`:"",
        ...resource,saveText,option.size || ""].filter(Boolean).map(part=>part.replace(/ /gu," ")).join(" · ");
      field("reason").textContent=option.available?option.warning || "":option.reason;
      field("options").hidden=!state.on;
      // On a miss only the activations used on the roll itself are listed.
      row.hidden=draft.outcome==="miss" && !option.preRoll;
      field("amount").hidden=!state.on || !(option.damage || option.secondary || option.tempHp);field("amount").disabled=busy;
      if(field("choice")){field("choice").value=state.choice;field("choice").disabled=busy;}
      if(field("save")) field("save").hidden=!save;
      if(field("temp-hp")) updateTempHp(field("temp-hp"),option,state);
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
        option.trigger?`pill «Movimento: danni tuono» (${option.dice.trigger}) fino all'inizio del tuo prossimo turno`:""].filter(Boolean).join(" · ")
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
  function renderHeader() {
    const action=presentation?.action,attack=resolved();
    $("pc-attack-title").textContent=action?.label || "Attacco";
    // A saving throw cantrip names its save (and the actor's DC) instead of a range.
    const saveLabel=pcAttackSaveLabel(attack,presentation?.item?.metadata?.[META_KEY]?.initiativeCard);
    const parts=[presentation?.item?.name || presentation?.item?.id,...(attack?.cantrip?["Trucchetto"]:[]),saveLabel || RANGE_LABELS[attack?.range] || ""].filter(Boolean);
    $("pc-attack-subtitle").textContent=presentation?parts.join(" · "):"";
  }
  function renderTarget() {
    const options=[node("option","— Scegli il bersaglio —")];options[0].value="";
    for(const item of presentation.targets){const option=node("option",bossTargetLabel(item));option.value=item.id;options.push(option);}
    targetSelect.replaceChildren(...options);
    targetSelect.value=draft.targetId || "";
    targetSelect.disabled=busy;
    const message=draft.targetId?"":pcAttackSelectionHint(selection.status);
    hint.textContent=message;hint.hidden=!message;
  }
  function renderOutcomes() {
    outcomes.replaceChildren(...pcAttackOutcomesFor(resolved()).map(outcome=>{
      const button=node("button",PC_ATTACK_OUTCOME_LABELS[outcome]);button.type="button";button.dataset.outcome=outcome;
      button.setAttribute("aria-pressed",String(draft.outcome===outcome));button.disabled=busy;
      button.addEventListener("click",()=>{draft.outcome=outcome;renderOutcomes();renderDamage();updateWoven();updateRiders();updateActivations();renderState();});
      return button;
    }));
  }
  function renderDamage() {
    const attack=resolved();
    damage.replaceChildren(...(attack?.components || []).map(component=>{
      const body=node("div","","component-body");
      const typeName=typeLabel(component.type);
      // A cantrip's dice follow the character level; a weapon shows the formula written in its quick action.
      const meta=node("div","","component-meta");meta.dataset.damageMeta=component.id;
      body.append(node("span",typeName,"component-title"),meta);
      const input=amountInput(draft.amounts[component.id] ?? "",`Danni ${damageTypeLabel(component.type)}`);
      // No damage to enter on a miss or a passed save (half on a passed save with Potent Cantrip).
      input.disabled=busy || !!draft.outcome && pcAttackDamageFactor(attack,draft.outcome,attackerCard())==="zero";
      input.addEventListener("input",()=>{draft.amounts[component.id]=input.value.trim();renderState();});
      return componentRow(null,body,input);
    }));
    updateDamageMeta();
  }
  // The dice line of each damage row, patched in place: Toll the Dead changes die with the target's hit points.
  function updateDamageMeta() {
    const attack=resolved();
    for(const component of attack?.components || []) {
      const meta=damage.querySelector(`[data-damage-meta="${component.id}"]`);
      if(!meta) continue;
      // A cantrip's dice follow the character level; a weapon shows the formula written in its quick action.
      const formula=(attack.cantrip?pcAttackCantripDiceFor(attack,presentation.item.metadata?.[META_KEY]?.initiativeCard,targetById(draft.targetId)):component.formula) || "";
      meta.textContent=formula?(draft.outcome==="critical"?`${formula} · critico ${pcAttackCriticalDice(formula)}`:formula):"";
      meta.hidden=!formula;
    }
  }
  function renderState() {
    // On a miss the section stays only for the activations used on the roll (a bonus to hit); the extras need a hit.
    const preRollOnMiss=draft.outcome==="miss" && activationOptions().some(option=>option.preRoll);
    extrasSection.hidden=!hits(draft.outcome) && !preRollOnMiss;
    if(!hits(draft.outcome)) {if(wovenBox)wovenBox.hidden=true;ridersBox.hidden=true;}
    extrasBox.hidden=!hits(draft.outcome);addExtra.hidden=!hits(draft.outcome);
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
    total.replaceChildren();
    if(view.ready) {
      const strong=node("strong",String(draft.outcome==="miss"?0:view.total));
      total.append(strong,node("span",draft.outcome==="miss"?" danni":` danni · PF ${view.hp.before} → ${view.hp.after}`));
      if(view.secondary?.hp) total.append(node("span",` · seconda: ${view.secondary.total}`));
    } else total.textContent=view.blocker;
    apply.disabled=busy || invalidated || !view.ready;
  }
  function render() {
    if(!presentation || !draft){form.hidden=true;if(applyRow)applyRow.hidden=true;return;}
    form.hidden=false;if(applyRow)applyRow.hidden=false;renderHeader();renderTarget();renderPalm();renderOutcomes();renderCantrip();renderDamage();renderWoven();renderRiders();renderActivations();renderExtras();renderState();
  }
  // Selection and scene updates never rebuild the outcome buttons or the amount fields: a click in
  // flight or the caret in a field survives them.
  function renderLive() {
    if(!presentation || !draft){form.hidden=true;if(applyRow)applyRow.hidden=true;return;}
    renderTarget();renderPalm();updateDamageMeta();updateWoven();updateRiders();updateActivations();renderState();
  }

  async function perform(work) {
    if(busy || invalidated || !lifecycle.isReady()) return;
    const operation=lifecycle.capture();
    busy=true;render();
    try {await work(operation);}
    catch(error) {
      if(lifecycle.isCurrent(operation)) {
        // A definitive rejection needs a new attack identity; an uncertain ACK keeps it for the retry.
        if(["conflict","rejected"].includes(error?.status) && error.result?.committed!==true && draft) draft.attackInstanceId=newAttackId();
        setStatus(String(error?.message || error));
      }
    }
    finally {busy=false;render();}
  }
  async function refresh(operation) {
    const loaded=await runtime.getPcAttackPresentation(sourceId,actionId);
    if(!lifecycle.isCurrent(operation)) return;
    // A changed definition (components edited in the card) starts a new attack.
    const sameAction=JSON.stringify(loaded.action)===JSON.stringify(presentation?.action);
    presentation=loaded;
    const fresh=!draft || !sameAction;
    if(fresh) draft=emptyDraft(loaded.action,draft?.targetId || null,defaultCantripId(loaded.action,loaded.item));
    if(draft.targetId && !targetById(draft.targetId)) draft.targetId=null;
    if(fresh || form.hidden) render();else renderLive();
  }
  function scheduleRefresh() {
    if(refreshTimer || invalidated) return;
    refreshTimer=schedule(()=>{refreshTimer=null;if(busy){scheduleRefresh();return;}
      const operation=lifecycle.capture();
      void refresh(operation).catch(error=>{if(lifecycle.isCurrent(operation))setStatus(String(error?.message || error));});},120);
  }
  function computeLiveSignature(items) {
    const source=items.find(item=>item.id===sourceId)?.metadata?.[META_KEY] || {};
    // The attacker's card, active features, pills and turn uses decide which riders apply; the targets'
    // HP, defenses and pills (Preda dell'Uccisore, Maledizione) too.
    return JSON.stringify([source.initiativeCard ?? null,source.classFeatureState ?? null,source.conditions ?? null,source.pcAttackState ?? null,
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
      if(draft && !busy) {
        const next=reconcileBossDraftTarget({targetId:draft.targetId,locked:draftLocked(draft)},selection);
        if(next.targetId && targetById(next.targetId)) draft.targetId=next.targetId;
        renderLive();
      }
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
    if(refreshTimer){clearTimeout(refreshTimer);refreshTimer=null;}
    lifecycle.dispose();
  }

  targetSelect.addEventListener("change",()=>{draft.targetId=targetSelect.value || null;draft.ignored=[];renderLive();});
  // Another cantrip: other damage (fresh amount), range and notes; the target, outcome and extras stay.
  cantripSelect.addEventListener("change",()=>{
    draft.spellId=cantripSelect.value;
    beamTally={spellId:"",count:0};
    draft.amounts=Object.fromEntries((resolved()?.components || []).map(component=>[component.id,""]));
    // From an attack roll to a saving throw (or back): the outcome chosen before no longer exists.
    if(!pcAttackOutcomesFor(resolved()).includes(draft.outcome)) draft.outcome="";
    renderHeader();renderCantrip();renderOutcomes();renderDamage();updateRiders();updateActivations();renderState();
  });
  addExtra.addEventListener("click",()=>{
    if(!draft || draft.extras.length>=MAX_PC_ATTACK_EXTRAS) return;
    draft.extras.push({type:"",amount:"",label:""});
    renderExtras();renderState();
    extrasBox.querySelector(`[data-extra-index="${draft.extras.length-1}"] select`)?.focus?.();
  });
  apply.addEventListener("click",()=>perform(async operation=>{
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
      ...(draft.spellId?{spellId:draft.spellId}:{}),
      ...(chosenWeaponCantrip(draft)?{weaponCantrip:(({spellId,amount,secondary})=>({spellId,...(amount!==""?{amount:Number(amount)}:{}),
        ...(secondary?{secondary:{targetId:secondary.targetId,amount:Number(secondary.amount)}}:{})}))(chosenWeaponCantrip(draft))}:{}),
      ...(view.secondary?{expectedSecondaryDefenses:view.secondary.profileDefenses}:{}),
      attackInstanceId:draft.attackInstanceId,sceneIdentity:presentation.sceneIdentity};
    const result=await runtime.executePcAttack(request);
    if(!lifecycle.isCurrent(operation)) return;
    showUndo(result);
    setStatus([resultSummary(result),...(result.followUps || []),...(result.warnings || [])].join("\n"));
    if(getPcAttackCantrip(draft.spellId)?.scaling==="beams")
      beamTally=beamTally.spellId===draft.spellId?{...beamTally,count:beamTally.count+1}:{spellId:draft.spellId,count:1};
    // Ready for the next attack (Extra Attack, two weapons, another beam): same target, a new identity.
    draft=emptyDraft(presentation.action,draft.targetId,draft.spellId);
    await refresh(operation);
    render();
  }));
  palmAmount?.addEventListener("input",()=>{palmDraft.amount=palmAmount.value.trim();renderPalm();});
  palmApply?.addEventListener("click",()=>perform(async operation=>{
    const target=targetById(palmDraft.targetId);
    if(!target || !palmDraft.outcome) return;
    const result=await runtime.endQuiveringPalm({sourceId,targetId:target.id,outcome:palmDraft.outcome,
      ...(palmDraft.outcome==="passed"?{amount:Number(palmDraft.amount),expectedDefenses:damageDefensesForItem(target,META_KEY)}:{}),
      attackInstanceId:palmDraft.id,sceneIdentity:presentation.sceneIdentity});
    if(!lifecycle.isCurrent(operation)) return;
    showUndo(result);
    setStatus([quiveringPalmSummary(result),...(result.warnings || [])].join("\n"));
    palmDraft={targetId:"",outcome:"",amount:"",id:newAttackId()};
    await refresh(operation);
  }));
  undoButton.addEventListener("click",()=>{
    if(!lastUndo) return;
    const entry=lastUndo;
    return perform(async operation=>{
      const outcome=await undoEntry(entry.historyEntryId,{epoch:operation.epoch});
      if(!lifecycle.isCurrent(operation)) return;
      showUndo(null);setStatus(outcome?.ok?"Ultimo attacco annullato.":outcome?.message || "Undo non applicato.");
      await refresh(operation);
    });
  });
  $("pc-attack-close").addEventListener("click",()=>{destroy();void api.popover.close(PC_ATTACK_POPOVER_ID);});
  documentRef.addEventListener?.("keydown",event=>{if(event.key==="Escape" && !busy){destroy();void api.popover.close(PC_ATTACK_POPOVER_ID);}});
  const unsubscribe=lifecycle.subscribe(event=>{
    if(event.phase==="unavailable"){
      invalidated=true;presentation=null;draft=null;unmountLiveUpdates();render();showUndo(null);
      setStatus("Scena cambiata: chiudi e riapri l'attacco.");
    }
  });
  showUndo(null);
  const ready=lifecycle.mount().then(()=>perform(async operation=>{
    if(await api.player.getRole()!=="GM"){invalidated=true;throw new Error("Solo il GM può registrare un attacco.");}
    await refresh(operation);
    mountLiveUpdates();
  })).then(()=>readSelection());
  globalThis.addEventListener?.("beforeunload",()=>{unsubscribe();destroy();},{once:true});
  return {ready,getPresentation:()=>presentation,getDraft:()=>draft,destroy:()=>{unsubscribe();destroy();}};
}
if(typeof document!=="undefined") OBR.onReady(()=>bootPcAttack(document));
