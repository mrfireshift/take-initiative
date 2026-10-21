import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { createSceneLifecycleAdapter } from "./sceneLifecycle.js";
import { createPcAttackRuntime } from "./pcAttackExecution.js";
import { PC_ATTACK_OUTCOME_LABELS, MAX_PC_ATTACK_EXTRAS, pcAttackPreview, pcAttackRiderOptions, pcAttackSelectionHint,
  pcAttackCantripDiceFor, pcAttackCantripIds, pcAttackResolvedAction, pcAttackOutcomesFor, pcAttackSaveLabel, pcAttackDamageFactor,
  pcAttackCantripPillLabels, pcAttackWeaponCantripOptions, pcAttackActionWeaponCantripIds } from "./pcAttackCore.js";
import { pcAttackHasPotentCantrip } from "./pcAttackRiderCatalog.js";
import { getPcAttackCantrip, pcAttackCantripBeams, PC_ATTACK_SAVE_LABELS } from "./pcAttackCantripCatalog.js";
import { totalCharacterLevel } from "./abilityModifiersCore.js";
import { pcAttackCriticalDice } from "./pcAttackRiderCatalog.js";
import { bossActionTargets, bossSelectionTarget, reconcileBossDraftTarget, bossTargetLabel } from "./bossActionsViewCore.js";
import { DAMAGE_TYPES, damageDefenseTag, damageTypeLabel } from "./damageDefensesCore.js";
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
    riders:{},extras:[],woven:{spellId:"",amount:"",secondaryTargetId:"",secondaryAmount:""},attackInstanceId:newAttackId()};
}
// The cantrip a cantrip action opens with: the one this attacker used last, when this action still offers it.
export function defaultCantripId(action,sourceItem) {
  const offered=pcAttackCantripIds(action);
  const last=sourceItem?.metadata?.[`${ID}/meta`]?.pcAttackState?.lastAttack?.spellId;
  return offered.includes(last) ? last : offered[0] || "";
}
// The map selection drives the target until the GM has decided something for this attack.
const draftLocked=draft=>!!draft.outcome || Object.values(draft.amounts).some(value=>value!=="")
  || Object.values(draft.riders).some(rider=>rider.on) || draft.extras.length>0;
// The outcomes that deal damage: a hit, a critical, a failed save (a miss and a passed save deal none).
const hits=outcome=>outcome==="hit" || outcome==="critical" || outcome==="failed";
// Riders and extra components only exist on a hit; a miss sends neither.
export function chosenRiders(draft) {
  return hits(draft?.outcome) ? Object.entries(draft.riders || {}).filter(([,rider])=>rider.on).map(([id,rider])=>({id,type:rider.type,amount:rider.amount,
    ...(rider.slotLevel?{slotLevel:rider.slotLevel}:{}),...(rider.bonus?{bonus:true}:{}),...(rider.onHit?{onHit:true}:{})})) : [];
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
    ...(result?.extras || []).map(extra=>extra.label || extra.typeLabel)];
  const second=result?.secondary?` ${result.secondary.name}: PF ${result.secondary.before} → ${result.secondary.after}.`:"";
  const conditions=(result?.conditions || []).length?` ${name}: ${result.conditions.join(", ")}.`:"";
  return `Registrato: ${outcome}, ${damage} danni a ${name}.${hp}${extras.length?` Extra: ${extras.join(", ")}.`:""}${second}${conditions}`;
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
      weaponCantrip:chosenWeaponCantrip(draft),secondaryItem:targetById(draft?.woven?.secondaryTargetId)});
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
      button.addEventListener("click",()=>{draft.outcome=outcome;renderOutcomes();renderDamage();updateWoven();updateRiders();renderState();});
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
    extrasSection.hidden=!hits(draft.outcome);
    if(extrasCaption) extrasCaption.textContent=resolved()?.cantrip?.save?"Extra al danno":"Extra al colpo";
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
    form.hidden=false;if(applyRow)applyRow.hidden=false;renderHeader();renderTarget();renderOutcomes();renderCantrip();renderDamage();renderWoven();renderRiders();renderExtras();renderState();
  }
  // Selection and scene updates never rebuild the outcome buttons or the amount fields: a click in
  // flight or the caret in a field survives them.
  function renderLive() {
    if(!presentation || !draft){form.hidden=true;if(applyRow)applyRow.hidden=true;return;}
    renderTarget();updateDamageMeta();updateWoven();updateRiders();renderState();
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
    renderHeader();renderCantrip();renderOutcomes();renderDamage();updateRiders();renderState();
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
      ...(draft.spellId?{spellId:draft.spellId}:{}),
      ...(chosenWeaponCantrip(draft)?{weaponCantrip:(({spellId,amount,secondary})=>({spellId,...(amount!==""?{amount:Number(amount)}:{}),
        ...(secondary?{secondary:{targetId:secondary.targetId,amount:Number(secondary.amount)}}:{})}))(chosenWeaponCantrip(draft)),
        ...(view.secondary?{expectedSecondaryDefenses:view.secondary.profileDefenses}:{})}:{}),
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
