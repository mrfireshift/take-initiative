import assert from "node:assert/strict";
import test,{mock} from "node:test";
import {readFile} from "node:fs/promises";
import {createBossActionProfileStore} from "../src/bossActionProfileStore.js";
import {createBossActionsDocument,textOf,createMemorySessionStorage} from "../test-support/fakeBossActionsDom.js";
const META="com.thebigpicture.initiative/meta";
const STATE="com.thebigpicture.initiative/state";
const sdk={onReady(){},broadcast:{onMessage:()=>()=>{},sendMessage:async()=>{}},scene:{items:{getItems:async()=>[]}},popover:{close:async()=>{}}};
// buildImage records what the console sets (the Cucitura portals); the other builders are unused here.
function buildImage(image,grid){const item={type:"IMAGE",image,grid};const chain=new Proxy({},{get:(t,key)=>key==="build"?()=>item:value=>{item[key]=value;return chain;}});return chain;}
mock.module("@owlbear-rodeo/sdk",{exports:{default:sdk,buildLabel(){},buildImage,buildPath(){},buildShape(){},buildText(){},Command:class{}}});
globalThis.sessionStorage=createMemorySessionStorage();
const {bootBossActions}=await import("../src/boss-actions.js");
const tick=()=>new Promise(resolve=>setTimeout(resolve,5));

function fixture(options={}){
  const documentRef=createBossActionsDocument();
  let readyHandler;
  const creature=(id,name,hp,extra={})=>({id,name,type:"IMAGE",layer:"CHARACTER",metadata:{[META]:{hp,hpMax:hp,inInitiative:true,...extra}}});
  const items=[creature("auril","Auril",580),creature("dars","Dars",60),creature("mira","Mira",45)];
  const data=new Map();
  const store=createBossActionProfileStore({storage:{getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)}});
  let bound=options.bound || null,selection=options.selection || [],round=3;
  const calls=[],spellCalls=[],registerCalls=[],undoCalls=[],heights=[],availability={},added=[];
  const listeners={player:new Set(),meta:new Set(),items:new Set()};
  const subscribe=(set,listener)=>{set.add(listener);return()=>set.delete(listener);};
  const api={
    player:{getRole:async()=>"GM",getSelection:async()=>selection,onChange:listener=>subscribe(listeners.player,listener)},
    scene:{isReady:async()=>true,onReadyChange:h=>{readyHandler=h;return()=>{};},onMetadataChange:listener=>subscribe(listeners.meta,listener),
      items:{getItems:async ids=>Array.isArray(ids)?items.filter(item=>ids.includes(item.id)):items,onChange:listener=>subscribe(listeners.items,listener),
        addItems:async values=>{added.push(...values);}}},
    popover:{close:async()=>{},getHeight:async()=>500,setHeight:async(id,height)=>{heights.push([id,height]);}},
  };
  const runtime={
    getBossActionPresentation:async()=>({item:items[0],profile:bound,binding:bound?{profileId:bound.profileId,profileRevision:bound.profileRevision}:null,
      bossInstanceId:"instance",sceneIdentity:"scene-A",round,availability}),
    bindBossActionProfile:async(id,profile)=>{assert.equal(id,"auril");bound=profile;},
    unbindBossActionProfile:async()=>{bound=null;},
    executeBossAction:async request=>{calls.push(request);return{historyEntryId:"entry-"+calls.length,undoAvailable:true,warnings:[],outcome:request.outcome,
      target:{id:request.targetId,name:request.targetId},damageComponents:[],manualText:""};},
    launchBossActionSpell:async request=>{spellCalls.push(request);},
    registerBossActionUse:async request=>{registerCalls.push(request);return{undoAvailable:true,historyEntryId:"use-1"};},
  };
  // Simulated shared area tool: each request waits until the test resolves it like the map tool would.
  const placements=[],cancelled=[];
  const controller=bootBossActions(documentRef,{api,store,runtime,sourceId:"auril",schedule:callback=>setTimeout(callback,0),
    undo:async(entryId)=>{undoCalls.push(entryId);return{ok:true};},
    placeArea:request=>new Promise(resolve=>placements.push({request,resolve})),
    cancelArea:async requestId=>{cancelled.push(requestId);const pending=placements.find(entry=>entry.request.requestId===requestId);pending?.resolve({status:"cancelled"});}});
  const $=id=>documentRef.getElementById(id);
  return {documentRef,$,store,controller,calls,spellCalls,registerCalls,undoCalls,heights,availability,api,runtime,items,placements,cancelled,added,
    select:async ids=>{selection=ids;for(const listener of listeners.player)listener({selection:ids});await tick();},
    setRound:async value=>{round=value;for(const listener of listeners.meta)listener({[STATE]:{round:value}});await tick();await tick();},
    listenerCount:()=>listeners.player.size+listeners.meta.size+listeners.items.size,
    changeScene:()=>readyHandler(false),getBound:()=>bound};
}
async function importAndBind(f,name){
  const content=await readFile(new URL("./fixtures/boss-actions/"+name,import.meta.url),"utf8");
  f.$("boss-file").files=[{name,text:async()=>content}];
  await f.$("boss-import").click();
  f.$("boss-profile").value="0";
  await f.$("boss-bind").click();
  await tick();
}
const profileOf=f=>f.controller.getPresentation().profile;
const listGroups=f=>f.$("boss-action-rows").children.filter(section=>section.dataset?.group).map(section=>[section.children[0].textContent,
  section.children[1].children.map(row=>profileOf(f).abilities.find(a=>a.id===row.dataset.actionId).name)]);
const actionNamed=(f,name)=>profileOf(f).abilities.find(a=>a.name===name);
const row=(f,name)=>f.$("boss-abilities").querySelectorAll("button").find(b=>b.dataset.actionId===actionNamed(f,name)?.id);
const outcome=(f,value)=>f.$("boss-resolution").querySelector(`[data-outcome="${value}"]`);
const targetName=f=>f.$("boss-target-name")?.textContent;
const apply=f=>f.$("boss-resolution").querySelectorAll("button").find(b=>b.id==="boss-apply");
async function open(f,name){await row(f,name).click();await tick();}
async function submit(f){await f.$("boss-resolution").querySelector("#boss-action-form").emit("submit");await tick();}

test("unbound token opens profile management; import and bind real fixtures then list executable actions",async()=>{
  const f=fixture();await f.controller.ready;
  assert.equal(f.$("boss-manage-view").hidden,false,"without a binding the console starts in Gestisci profilo");
  await importAndBind(f,"auril-phase-2.html");
  assert.equal(f.store.list()[0].abilities.length,21);
  assert.equal(f.$("boss-list-view").hidden,false);
  assert.match(f.$("boss-phase").textContent,/Fase 2 · Round 3/);
  assert.deepEqual(listGroups(f),[
    ["Titano",["Breathe Deep","Breath of the Long Night","Titan's Grasp","Crush","Hurl","Rock","Hand Slam"]],
    ["Proiezione Fatata",["Icekiss +2","Frostmaiden's Kiss","Mark of the Frostmaiden","Spellcasting","Meteor Swarm"]],
    ["Auril",["Gather the Winter Sky","Epic Resistance"]],
  ],"combat abilities by manifestation; traits are not in this list");
  assert.equal(f.$("boss-tab-actions").textContent,"Azioni (14)");
  assert.equal(f.$("boss-tab-passives").textContent,"Passive (7)");
  f.controller.destroy();
});

test("Icekiss with a selected map creature: Colpito then Applica sends frozen decisions once and offers Undo",async()=>{
  const f=fixture({selection:["dars"]});await f.controller.ready;await importAndBind(f,"auril-phase-2.html");
  await open(f,"Icekiss +2");
  assert.equal(targetName(f),"Dars");
  assert.equal(f.$("boss-list-view").hidden,true,"resolution replaces the action list in the same window");
  assert.equal(apply(f).disabled,true);
  await outcome(f,"hit").click();
  assert.equal(apply(f).disabled,false);
  assert.match(textOf(f.$("boss-total")),/Totale 25/);
  await submit(f);
  assert.equal(f.calls.length,1);
  assert.deepEqual(f.calls[0].componentAmounts,{slashing:18,cold:7});
  assert.equal(f.calls[0].mode,"melee");assert.equal(f.calls[0].targetId,"dars");assert.equal(f.calls[0].outcome,"hit");
  assert.equal(f.calls[0].profileRevision,profileOf(f).profileRevision);assert.equal(f.calls[0].sceneIdentity,"scene-A");
  assert.match(f.calls[0].actionInstanceId,/^boss-action:/);
  assert.equal(f.$("boss-list-view").hidden,false,"after commit the console returns to the action list");
  assert.equal(f.$("boss-undo").hidden,false);
  await f.$("boss-undo").click();
  assert.deepEqual(f.undoCalls,["entry-1"]);assert.equal(f.$("boss-undo").hidden,true);
  f.controller.destroy();
});

test("Undo is offered only for a confirmed History entry",async()=>{
  const f=fixture({selection:["dars"]});await f.controller.ready;await importAndBind(f,"auril-phase-2.html");
  f.runtime.executeBossAction=async request=>{f.calls.push(request);return{historyEntryId:"pending",undoAvailable:false,historyPending:true,warnings:[]};};
  await open(f,"Icekiss +2");await outcome(f,"miss").click();await submit(f);
  assert.equal(f.$("boss-undo").hidden,true);
  assert.match(f.$("boss-status").textContent,/non ripetere/);
  f.controller.destroy();
});

test("Blizzard: TS outcome buttons, halved total preview, unhalved components to the shared executor, forced movement manual",async()=>{
  const f=fixture({selection:["mira"]});await f.controller.ready;await importAndBind(f,"auril-phase-3.html");
  await open(f,"Blizzard Strike");
  assert.match(textOf(f.$("boss-resolution")),/TS FOR CD 15/);
  assert.match(textOf(f.$("boss-resolution")),/Manuale su TS fallito: Il bersaglio viene spinto/);
  assert.equal(f.$("boss-mode"),null,"no mode choice for a save action");
  await outcome(f,"passed").click();
  assert.match(textOf(f.$("boss-total")),/Totale 8 \(metà\)/);
  await submit(f);
  assert.deepEqual(f.calls[0].componentAmounts,{bludgeoning:9,cold:9});assert.equal(f.calls[0].outcome,"passed");
  f.controller.destroy();
});

test("map selection: boss, virtual ids and untracked creatures never become the target; multiple requires an explicit choice",async()=>{
  const f=fixture({selection:["auril","__EPIC__:dars:1"]});await f.controller.ready;await importAndBind(f,"auril-phase-2.html");
  await open(f,"Icekiss +2");
  assert.match(targetName(f),/Il boss è l’attore|Seleziona una creatura/);
  f.items.push({id:"bystander",name:"Bystander",type:"IMAGE",layer:"CHARACTER",metadata:{[META]:{hp:5,hpMax:5}}});
  await f.select(["bystander"]);assert.match(targetName(f),/non è nel tracker/);
  await f.select(["dars","mira"]);
  assert.match(targetName(f),/Più token selezionati/);
  const choices=f.$("boss-target-choices").querySelectorAll("button").map(b=>b.dataset.targetId);
  assert.deepEqual(choices.sort(),["dars","mira"]);
  assert.equal(apply(f).disabled,true,"no arbitrary first token");
  await f.$("boss-target-choices").querySelectorAll("button").find(b=>b.dataset.targetId==="mira").click();
  assert.equal(targetName(f),"Mira");
  await f.select([]);assert.equal(targetName(f),"Mira","an explicit choice locks the draft target");
  f.controller.destroy();
});

test("draft rule: selection follows only while pristine; after an outcome a new selection is offered, never transferred",async()=>{
  const f=fixture({selection:["dars"]});await f.controller.ready;await importAndBind(f,"auril-phase-2.html");
  await open(f,"Icekiss +2");
  await f.select(["mira"]);assert.equal(targetName(f),"Mira","pristine draft follows the map");
  await outcome(f,"hit").click();
  await f.select(["dars"]);
  assert.equal(targetName(f),"Mira","outcome is not moved to another creature");
  const use=f.$("boss-target-use-selection");assert.ok(use);
  await use.click();
  assert.equal(targetName(f),"Dars");
  assert.equal(outcome(f,"hit").getAttribute("aria-pressed"),"false","explicit retarget clears the outcome");
  assert.equal(apply(f).disabled,true);
  await outcome(f,"miss").click();await submit(f);
  assert.equal(f.calls[0].targetId,"dars");assert.equal(f.calls[0].outcome,"miss");
  f.controller.destroy();
});

test("an edited damage amount also locks the target",async()=>{
  const f=fixture({selection:["dars"]});await f.controller.ready;await importAndBind(f,"auril-phase-3.html");
  await open(f,"Polar Ray");
  const cold=f.$("boss-resolution").querySelector('[data-component-id="cold"]');cold.value="14";await cold.emit("input");
  await f.select(["mira"]);assert.equal(targetName(f),"Dars");
  f.controller.destroy();
});

test("Polar Ray shows printed total separately, ranged only, and submits edited components",async()=>{
  const f=fixture({selection:["dars"]});await f.controller.ready;await importAndBind(f,"auril-phase-3.html");
  await open(f,"Polar Ray");
  assert.equal(f.$("boss-mode"),null,"single ranged attack needs no mode choice");
  assert.match(textOf(f.$("boss-resolution")),/Totale stampato 21; medie calcolate 10 \+ 10 = 20/);
  assert.doesNotMatch(textOf(f.$("boss-resolution")),/undefined/);
  const cold=f.$("boss-resolution").querySelector('[data-component-id="cold"]');cold.value="11";await cold.emit("input");
  await outcome(f,"hit").click();await submit(f);
  assert.deepEqual(f.calls[0].componentAmounts,{cold:11,necrotic:10});assert.equal(f.calls[0].mode,"ranged");
  f.controller.destroy();
});

test("Rock: no manual prerequisite (Gather is checked from the round log) and an uncertain retry keeps the same identity",async()=>{
  const f=fixture({selection:["dars"]});await f.controller.ready;await importAndBind(f,"auril-phase-2.html");
  await open(f,"Rock");await outcome(f,"hit").click();
  assert.equal(f.$("boss-manual-confirmed"),null,"v20: no prerequisite to tick");
  assert.equal(apply(f).disabled,false);
  f.runtime.executeBossAction=async request=>{f.calls.push(request);throw new Error("Conferma incerta");};
  await submit(f);await submit(f);
  assert.equal(f.calls.length,2);assert.equal(f.calls[0].manualConfirmed,undefined);
  assert.equal(f.calls[0].actionInstanceId,f.calls[1].actionInstanceId);
  assert.ok(f.$("boss-resolution").querySelector("#boss-action-form"),"uncertain confirmation keeps the draft");
  f.controller.destroy();
});

test("definitive conflict closes the stale draft; reopening creates a fresh identity",async()=>{
  const f=fixture({selection:["dars"]});await f.controller.ready;await importAndBind(f,"auril-phase-2.html");
  const execute=f.runtime.executeBossAction;
  f.runtime.executeBossAction=async request=>{f.calls.push(request);const error=new Error("Lo stato è cambiato. Riapri l’azione.");
    error.status="conflict";error.result={status:"conflict",committed:false};throw error;};
  await open(f,"Icekiss +2");await outcome(f,"hit").click();await submit(f);
  assert.equal(f.$("boss-resolution").querySelector("#boss-action-form"),null);
  assert.match(f.$("boss-status").textContent,/Riapri/);
  f.runtime.executeBossAction=execute;
  await open(f,"Icekiss +2");await outcome(f,"hit").click();await submit(f);
  assert.equal(f.calls.length,2);assert.notEqual(f.calls[0].actionInstanceId,f.calls[1].actionInstanceId);
  f.controller.destroy();
});

test("back and Escape return to the list without any mutation",async()=>{
  const f=fixture({selection:["dars"]});await f.controller.ready;await importAndBind(f,"auril-phase-2.html");
  await open(f,"Icekiss +2");await outcome(f,"hit").click();
  await f.$("boss-back").click();
  assert.equal(f.$("boss-list-view").hidden,false);assert.equal(f.calls.length,0);
  await open(f,"Icekiss +2");
  assert.equal(outcome(f,"hit").getAttribute("aria-pressed"),"false","reopening starts a fresh draft");
  await f.documentRef.keydown("Escape");
  assert.equal(f.$("boss-list-view").hidden,false);assert.equal(f.calls.length,0);
  f.controller.destroy();
});

test("unsupported abilities stay consultable; Slow opens the existing workflow; a changed scene blocks commits",async()=>{
  const f=fixture();await f.controller.ready;await importAndBind(f,"auril-phase-2.html");
  const raw=profileOf(f).abilities.find(a=>a.automation==="UNSUPPORTED" && a.category!=="trait");
  assert.equal(raw.name,"Breathe Deep");
  await row(f,raw.name).click();await tick();
  assert.equal(f.$("boss-resolution").querySelector("pre").textContent,raw.rawText);
  assert.equal(f.$("boss-resolution").querySelector("#boss-action-form"),null);
  await f.$("boss-back").click();
  await open(f,"Spellcasting");
  assert.deepEqual(f.$("boss-spells").children.map(button=>button.textContent),["Lentezza · 3/giorno","Tempesta di ghiaccio · 3/giorno","Sfera congelante di Otiluke · 1/giorno","Passo velato · a volontà"]);
  await f.$("boss-resolution").querySelector("#boss-cast-slow").click();
  assert.equal(f.spellCalls[0].sourceId,"auril");assert.equal(f.spellCalls[0].actionId,actionNamed(f,"Spellcasting").id);
  assert.equal(f.spellCalls[0].spellId,"slow");
  assert.match(f.$("boss-status").textContent,/Pannello Lentezza aperto/);
  await f.$("boss-resolution").querySelector("#boss-cast-ice-storm").click();
  assert.equal(f.spellCalls[1].spellId,"ice-storm");
  assert.match(f.$("boss-status").textContent,/Pannello Tempesta di ghiaccio aperto/);
  f.changeScene();
  await f.$("boss-bind").click();
  assert.equal(f.calls.length,0);
  assert.match(f.$("boss-status").textContent,/Scena cambiata/);
  f.controller.destroy();
});

test("action search filters executable and manual rows",async()=>{
  const f=fixture();await f.controller.ready;await importAndBind(f,"auril-phase-2.html");
  const search=f.$("boss-action-search");assert.ok(search);
  search.value="rock";await search.emit("input");
  const visible=f.$("boss-abilities").querySelectorAll("button").filter(b=>b.dataset.actionId).map(b=>profileOf(f).abilities.find(a=>a.id===b.dataset.actionId).name);
  assert.deepEqual(visible,["Rock"]);
  search.value="breath";await search.emit("input");
  assert.deepEqual(listGroups(f),[["Titano",["Breathe Deep","Breath of the Long Night"]]],"manual and automated rows are searched together");
  search.value="zzz";await search.emit("input");
  assert.match(textOf(f.$("boss-action-rows")),/Nessuna azione corrisponde/);
  f.controller.destroy();
});

test("an exhausted action shows a short badge, stays consultable and cannot be applied",async()=>{
  const f=fixture({selection:["mira"]});await f.controller.ready;await importAndBind(f,"auril-phase-3.html");
  const action=actionNamed(f,"Blizzard Strike");
  f.availability[action.id]={tracked:true,available:false,remaining:0,used:1,limit:1,period:"round",reason:"Risorsa esaurita."};
  await f.controller.refresh();
  assert.match(textOf(row(f,"Blizzard Strike")),/Esaurita/);
  await open(f,"Blizzard Strike");await outcome(f,"failed").click();
  assert.equal(apply(f).disabled,true);assert.match(f.$("boss-apply-hint").textContent,/esaurita/i);
  await submit(f);assert.equal(f.calls.length,0);
  f.controller.destroy();
});

test("a round change refreshes resources automatically and keeps the open draft",async()=>{
  const f=fixture({selection:["mira"]});await f.controller.ready;await importAndBind(f,"auril-phase-3.html");
  const action=actionNamed(f,"Blizzard Strike");
  f.availability[action.id]={tracked:true,available:false,remaining:0,used:1,limit:1,period:"round",reason:"Risorsa esaurita."};
  await f.controller.refresh();await open(f,"Blizzard Strike");
  const cold=f.$("boss-resolution").querySelector('[data-component-id="cold"]');cold.value="15";await cold.emit("input");
  await outcome(f,"failed").click();
  f.availability[action.id]={tracked:true,available:true,remaining:1,used:0,limit:1,period:"round"};
  await f.setRound(4);
  assert.match(f.$("boss-phase").textContent,/Round 4/);
  assert.equal(apply(f).disabled,false);
  assert.equal(f.$("boss-resolution").querySelector('[data-component-id="cold"]').value,"15");
  assert.equal(outcome(f,"failed").getAttribute("aria-pressed"),"true");
  f.controller.destroy();
});

test("a binding change closes an open draft",async()=>{
  const f=fixture({selection:["dars"]});await f.controller.ready;await importAndBind(f,"auril-phase-2.html");
  await open(f,"Icekiss +2");
  const read=f.runtime.getBossActionPresentation;f.runtime.getBossActionPresentation=async()=>({...await read(),bossInstanceId:"new-instance"});
  await f.$("boss-refresh").click();
  assert.equal(f.$("boss-resolution").querySelector("#boss-action-form"),null);
  f.controller.destroy();
});

test("manual 1/Phase registration requires confirmation and forwards the bound identity",async()=>{
  const f=fixture();await f.controller.ready;await importAndBind(f,"auril-phase-2.html");
  const action=actionNamed(f,"Breathe Deep");
  f.availability[action.id]={tracked:true,available:true,remaining:1,used:0,limit:1,period:"phase"};await f.controller.refresh();
  await open(f,"Breathe Deep");
  await f.$("boss-resolution").querySelector("#boss-register").click();assert.equal(f.registerCalls.length,0);
  const confirm=f.$("boss-manual-confirmed");confirm.checked=true;await confirm.emit("change");
  await f.$("boss-resolution").querySelector("#boss-register").click();
  assert.equal(f.registerCalls.length,1);assert.equal(f.registerCalls[0].manualConfirmed,true);assert.equal(f.registerCalls[0].actionId,action.id);
  assert.equal(f.registerCalls[0].sceneIdentity,"scene-A");assert.ok(f.registerCalls[0].actionInstanceId);
  f.controller.destroy();
});

test("minimize and restore keep the draft and resize through the popover API",async()=>{
  const f=fixture({selection:["dars"]});await f.controller.ready;await importAndBind(f,"auril-phase-2.html");
  await open(f,"Icekiss +2");await outcome(f,"hit").click();
  const cold=f.$("boss-resolution").querySelector('[data-component-id="cold"]');cold.value="12";await cold.emit("input");
  await f.$("boss-minimize").click();await tick();
  assert.equal(f.documentRef.body.dataset.minimized,"true");assert.match(f.$("boss-phase").textContent,/Icekiss \+2/);
  await f.$("boss-minimize").click();await tick();
  assert.deepEqual(f.heights.map(([,height])=>height),[46,500]);
  assert.equal(f.$("boss-resolution").querySelector('[data-component-id="cold"]').value,"12");
  assert.equal(outcome(f,"hit").getAttribute("aria-pressed"),"true");
  f.controller.destroy();
});

test("a popover reload restores a pristine-of-commits draft but never one that was sent",async()=>{
  globalThis.sessionStorage.clear();
  const first=fixture({selection:["dars"]});await first.controller.ready;await importAndBind(first,"auril-phase-2.html");
  await open(first,"Icekiss +2");await outcome(first,"hit").click();
  const bound=first.getBound();first.controller.destroy();
  const second=fixture({selection:["mira"],bound});await second.controller.ready;await tick();
  assert.equal(second.$("boss-action-title").textContent,"Icekiss +2");
  assert.equal(targetName(second),"Dars","restored locked target is not replaced by the new selection");
  assert.equal(outcome(second,"hit").getAttribute("aria-pressed"),"true");
  await submit(second);assert.equal(second.calls.length,1);second.controller.destroy();
  const third=fixture({selection:["mira"],bound});await third.controller.ready;await tick();
  assert.equal(third.$("boss-resolution").querySelector("#boss-action-form"),null,"a committed draft is not restored");
  third.controller.destroy();
});

test("live subscriptions are local and removed on destroy",async()=>{
  const f=fixture();await f.controller.ready;await importAndBind(f,"auril-phase-2.html");
  assert.equal(f.listenerCount(),3);
  f.controller.destroy();
  assert.equal(f.listenerCount(),0);
});

const groupRows=f=>f.$("boss-group-targets").querySelectorAll("[data-target-id]");
const groupOutcome=(f,id,value)=>groupRows(f).find(row=>row.dataset.targetId===id).querySelector(`[data-group-outcome="${value}"]`);
async function confirmGroup(f){const box=f.$("boss-manual-confirmed");box.checked=true;await box.emit("change");}
async function drawCone(f,targetIds,{status="confirmed"}={}){
  await f.$("boss-draw-area").click();await tick();
  const pending=f.placements.at(-1);
  pending.resolve(status==="confirmed"?{status,preview:{start:{x:10,y:20},end:{x:610,y:20},targetIds}}:{status});
  await tick();await tick();
  return pending.request;
}
function addSera(f){f.items.push({id:"sera",name:"Sera",type:"IMAGE",layer:"CHARACTER",metadata:{[META]:{hp:38,hpMax:38,inInitiative:true}}});}

test("Breath: draw the cone, enter saves, apply — the drawn hits become the group",async()=>{
  const f=fixture({selection:["dars","mira"]});await f.controller.ready;await importAndBind(f,"auril-phase-2.html");addSera(f);
  await open(f,"Breath of the Long Night");
  assert.equal(groupRows(f).length,0,"the map selection does not build the group before a drawing");
  // v20: the recharge and the sequence come from the round log: no confirmation step, a reminder only.
  assert.equal(f.$("boss-manual-confirmed"),null);
  assert.match(textOf(f.$("boss-group-restrictions")),/A mano: La ricarica viene da Breathe Deep/);
  assert.doesNotMatch(textOf(f.$("boss-group-restrictions")),/scegli tu le creature/);
  assert.equal(f.$("boss-draw-area").disabled,false);
  assert.match(f.$("boss-apply-hint").textContent,/Disegna il cono/);
  const request=await drawCone(f,["auril","dars","mira","sera","dars","__EPIC__:x"]);
  assert.equal(request.ruleId,"boss-action-area:cone:60ft");assert.equal(request.casterId,"auril");
  assert.deepEqual(f.heights.map(([,height])=>height),[46,500],"the console steps aside while drawing");
  assert.deepEqual(groupRows(f).map(row=>row.dataset.targetId),["dars","mira","sera"]);
  assert.match(textOf(f.$("boss-area-step")),/Cono 60 ft disegnato: 3 creature/);
  assert.match(f.$("boss-apply-hint").textContent,/Manca l’esito di 3 bersagli/);
  await groupOutcome(f,"dars","failed").click();await groupOutcome(f,"mira","passed").click();await groupOutcome(f,"sera","passed").click();
  assert.match(textOf(groupRows(f)[0]),/−46 Accecato/);assert.match(textOf(groupRows(f)[1]),/−22/);
  assert.equal(apply(f).disabled,false);
  await submit(f);
  assert.equal(f.calls.length,1);
  assert.deepEqual([...f.calls[0].targetIds].sort(),["dars","mira","sera"]);
  assert.deepEqual(f.calls[0].outcomes,{dars:"failed",mira:"passed",sera:"passed"});
  assert.deepEqual(f.calls[0].areaPlacement,{ruleId:"boss-action-area:cone:60ft",start:{x:10,y:20},end:{x:610,y:20},areaTargetIds:["dars","mira","sera"]});
  f.controller.destroy();
});

test("Breath: a cancelled drawing changes nothing; back during a drawing cancels the tool request",async()=>{
  const f=fixture({selection:["dars"]});await f.controller.ready;await importAndBind(f,"auril-phase-2.html");
  await open(f,"Breath of the Long Night");
  await drawCone(f,[],{status:"cancelled"});
  assert.equal(groupRows(f).length,0);assert.match(f.$("boss-status").textContent,/Disegno annullato/);
  await f.$("boss-draw-area").click();await tick();
  assert.equal(f.$("boss-cancel-area").hidden,false);assert.equal(apply(f).disabled,true);
  await f.$("boss-back").click();await tick();
  assert.equal(f.cancelled.length,1,"leaving the draft cancels the pending drawing");
  assert.equal(f.calls.length,0);
  f.controller.destroy();
});

test("Breath: after the drawing the map selection only adds creatures; removing and redrawing are explicit",async()=>{
  const f=fixture({selection:[]});await f.controller.ready;await importAndBind(f,"auril-phase-2.html");addSera(f);
  await open(f,"Breath of the Long Night");
  await drawCone(f,["dars","mira"]);
  await groupOutcome(f,"dars","failed").click();
  await f.select(["sera","dars"]);
  assert.deepEqual(groupRows(f).map(row=>row.dataset.targetId),["dars","mira"],"nothing is replaced silently");
  assert.match(textOf(f.$("boss-group-offer")),/Selezione mappa: Sera Aggiungi/);
  await f.$("boss-group-use-selection").click();
  assert.deepEqual(groupRows(f).map(row=>row.dataset.targetId),["dars","mira","sera"]);
  assert.equal(groupOutcome(f,"dars","failed").getAttribute("aria-pressed"),"true","existing outcomes stay with their creature");
  await groupRows(f)[1].querySelector(".group-remove").click();
  assert.deepEqual(groupRows(f).map(row=>row.dataset.targetId),["dars","sera"]);
  await drawCone(f,["mira"]);
  assert.deepEqual(groupRows(f).map(row=>row.dataset.targetId),["mira"],"Ridisegna replaces the group explicitly");
  assert.equal(groupOutcome(f,"mira","failed").getAttribute("aria-pressed"),"false");
  f.controller.destroy();
});

test("Breath: bulk outcomes and edited base damage keep shared halving per row",async()=>{
  const f=fixture({selection:[]});await f.controller.ready;await importAndBind(f,"auril-phase-2.html");
  await open(f,"Breath of the Long Night");await drawCone(f,["dars","mira"]);
  await f.$("boss-resolution").querySelector('[data-group-all="passed"]').click();
  const cold=f.$("boss-resolution").querySelector('[data-component-id="cold"]');cold.value="7";await cold.emit("input");
  const necrotic=f.$("boss-resolution").querySelector('[data-component-id="necrotic"]');necrotic.value="5";await necrotic.emit("input");
  assert.match(textOf(groupRows(f)[0]),/−5/,"floor(7/2)+floor(5/2)");
  await submit(f);
  assert.deepEqual(f.calls[0].componentAmounts,{cold:7,necrotic:5});
  f.controller.destroy();
});

test("Breath: back before Applica sends nothing and the drawn group survives a reload until sent",async()=>{
  globalThis.sessionStorage.clear();
  const first=fixture({selection:[]});await first.controller.ready;await importAndBind(first,"auril-phase-2.html");
  await open(first,"Breath of the Long Night");await drawCone(first,["dars","mira"]);
  await groupOutcome(first,"dars","failed").click();
  const bound=first.getBound();first.controller.destroy();
  const second=fixture({selection:["mira"],bound});await second.controller.ready;await tick();
  assert.deepEqual(groupRows(second).map(row=>row.dataset.targetId),["dars","mira"]);
  assert.equal(groupOutcome(second,"dars","failed").getAttribute("aria-pressed"),"true");
  assert.match(textOf(second.$("boss-area-step")),/disegnato: 2 creature/);
  await second.$("boss-back").click();
  assert.equal(second.calls.length,0);
  second.controller.destroy();
});

function resistCold(f,id){const item=f.items.find(entry=>entry.id===id);item.metadata[META].initiativeCard={damageDefenses:{immunities:[],resistances:["cold"],vulnerabilities:[]}};}

test("defenses: Icekiss shows the target's cold resistance, previews it and can ignore it explicitly",async()=>{
  const f=fixture({selection:["dars"]});await f.controller.ready;await importAndBind(f,"auril-phase-2.html");resistCold(f,"dars");
  await f.controller.refresh();await open(f,"Icekiss +2");await outcome(f,"hit").click();
  const chip=f.$("boss-target-defenses").querySelector('[data-defense-type="cold"]');
  assert.equal(chip.textContent,"Res. freddo");assert.equal(chip.getAttribute("aria-pressed"),"true");
  assert.match(textOf(f.$("boss-total")),/Totale 21/,"18 + floor(7/2)");
  await chip.click();
  assert.match(textOf(f.$("boss-total")),/Totale 25/);
  await submit(f);
  assert.deepEqual(f.calls[0].ignoredDefenses,["cold"]);
  assert.deepEqual(f.calls[0].expectedDefenses,{immunities:[],resistances:["cold"],vulnerabilities:[]});
  f.controller.destroy();
});

test("defenses: Breath rows apply each creature's resistance and send the frozen defenses per target",async()=>{
  const f=fixture({selection:[]});await f.controller.ready;await importAndBind(f,"auril-phase-2.html");resistCold(f,"dars");
  await f.controller.refresh();await open(f,"Breath of the Long Night");await drawCone(f,["dars","mira"]);
  await f.$("boss-resolution").querySelector('[data-group-all="failed"]').click();
  assert.match(textOf(groupRows(f)[0]),/Res\. freddo.*−29/);
  assert.match(textOf(groupRows(f)[1]),/−46/);assert.doesNotMatch(textOf(groupRows(f)[1]),/Res\./);
  assert.match(textOf(f.$("boss-total")),/Totale 75/);
  await submit(f);
  assert.deepEqual(f.calls[0].expectedDefenses.dars.resistances,["cold"]);
  assert.deepEqual(f.calls[0].expectedDefenses.mira,{immunities:[],resistances:[],vulnerabilities:[]});
  assert.deepEqual(f.calls[0].ignoredDefenses,{dars:[],mira:[]});
  f.controller.destroy();
});

// ---- tranche 4: circle on a free point, emanation from the boss, immunity ----
function markImmune(f,id){f.items.find(entry=>entry.id===id).metadata[META].conditions={version:2,instances:[{id:"imm-"+id,condition:"Immune · Blinding Gleam",active:true,
  effectId:"monster-action:blinding-gleam:immune",effectKind:"buff",sourceId:"auril",expiry:{mode:"manual"}}]};}

test("Hand Slam: no confirmation step; draw the 20 ft circle, saves, apply with Prono on failures",async()=>{
  const f=fixture({selection:[]});await f.controller.ready;await importAndBind(f,"auril-phase-2.html");
  await open(f,"Hand Slam");
  assert.equal(f.$("boss-manual-confirmed"),null,"nothing to confirm before drawing");
  assert.match(textOf(f.$("boss-group-restrictions")),/^A mano: L'area colpita diventa Terreno Difficile/);
  assert.match(textOf(f.$("boss-resolution")),/TS DES CD 18 · metà danni su successo · Prono sui falliti fino a rimozione manuale/);
  assert.equal(f.$("boss-draw-area").disabled,false);
  assert.equal(f.$("boss-draw-area").textContent,"Disegna cerchio");
  assert.match(f.$("boss-apply-hint").textContent,/Disegna il cerchio sulla mappa/);
  const request=await drawCone(f,["dars","mira"]);
  assert.equal(request.ruleId,"boss-action-area:circle:20ft");
  assert.match(textOf(f.$("boss-area-step")),/1 · Cerchio 20 ft disegnato: 2 creature/);
  await groupOutcome(f,"dars","failed").click();await groupOutcome(f,"mira","passed").click();
  assert.match(textOf(groupRows(f)[0]),/−34 Prono/);assert.match(textOf(groupRows(f)[1]),/−16/);
  assert.match(textOf(f.$("boss-total")),/Totale 50 · 1 Prono/);
  await submit(f);
  assert.equal(f.calls.length,1);
  assert.equal(f.calls[0].manualConfirmed,false);
  assert.equal(Object.hasOwn(f.calls[0],"expectedImmuneIds"),false,"no immunity to freeze for Hand Slam");
  f.controller.destroy();
});

test("Blinding Gleam: the emanation is centred on the boss, an immune creature shows Immune and is frozen as such",async()=>{
  const f=fixture({selection:[]});await f.controller.ready;await importAndBind(f,"auril-phase-3.html");markImmune(f,"mira");
  await f.controller.refresh();await open(f,"Blinding Gleam");
  assert.equal(f.$("boss-manual-confirmed"),null);
  assert.match(textOf(f.$("boss-resolution")),/Accecato sui falliti per 1 minuto \(TS COS 19 a fine turno\) · Immune sui superati/);
  assert.equal(f.$("boss-draw-area").textContent,"Posiziona emanazione");
  assert.match(textOf(f.$("boss-area-step")),/Emanazione 30 ft, centrata su Auril/);
  const request=await drawCone(f,["dars","mira"]);
  assert.equal(request.ruleId,"boss-action-area:emanation:30ft");assert.equal(request.casterId,"auril");
  assert.match(textOf(f.$("boss-area-step")),/Emanazione 30 ft posizionata: 2 creature/);
  assert.match(textOf(groupRows(f)[1]),/Mira.*Immune/);
  await groupOutcome(f,"dars","passed").click();
  assert.match(textOf(groupRows(f)[0]),/−13 → Immune/);
  await groupOutcome(f,"mira","failed").click();
  assert.match(textOf(groupRows(f)[1]),/−27 Immune/,"damage, but Immune instead of Accecato");
  assert.match(textOf(f.$("boss-total")),/Totale 40\s*$/,"no Accecato counted for the immune creature");
  await submit(f);
  assert.deepEqual(f.calls[0].expectedImmuneIds,["mira"]);
  f.controller.destroy();
});

// ---- tranche 5: Titan's Grasp, Crush, Soul-Numbing Cold ----
function markGrappled(f,id){f.items.find(entry=>entry.id===id).metadata[META].conditions={version:2,instances:[{id:"held-"+id,condition:"Afferrato",active:true,sourceId:"auril",expiry:{mode:"manual"}}]};}

test("Titan's Grasp: all-or-nothing damage, the grapple conditions on failure, and no damage inputs on a success",async()=>{
  const f=fixture({selection:["dars"]});await f.controller.ready;await importAndBind(f,"auril-phase-2.html");
  await open(f,"Titan's Grasp");
  assert.match(textOf(f.$("boss-resolution")),/TS DES CD 18 · nessun danno su successo · Afferrato \(fuga CD 18\) e Trattenuto sui falliti/);
  await outcome(f,"passed").click();
  assert.match(textOf(f.$("boss-total")),/Totale 0 \(nessun danno\)/);
  assert.ok(f.$("boss-resolution").querySelectorAll("[data-component-id]").every(input=>input.disabled));
  await outcome(f,"failed").click();
  assert.match(textOf(f.$("boss-total")),/Totale 43/);
  assert.equal(apply(f).disabled,false);
  await submit(f);
  assert.equal(f.calls.length,1);assert.equal(f.calls[0].outcome,"failed");assert.equal(f.calls[0].targetId,"dars");
  f.controller.destroy();
});

test("Titan's Grasp is blocked while Auril holds another creature",async()=>{
  const f=fixture({selection:["dars"]});await f.controller.ready;await importAndBind(f,"auril-phase-2.html");markGrappled(f,"mira");
  await f.controller.refresh();await open(f,"Titan's Grasp");await outcome(f,"failed").click();
  assert.equal(apply(f).disabled,true);
  assert.match(f.$("boss-apply-hint").textContent,/tiene già una creatura Afferrata/);
  f.controller.destroy();
});

test("Crush asks for the creature Auril holds and then resolves it",async()=>{
  const f=fixture({selection:["dars"]});await f.controller.ready;await importAndBind(f,"auril-phase-2.html");
  await open(f,"Crush");
  assert.match(textOf(f.$("boss-resolution")),/TS COS CD 19 · metà danni su successo · solo la creatura Afferrata dal boss, che resta Afferrata e Trattenuta/);
  await outcome(f,"passed").click();
  assert.match(f.$("boss-apply-hint").textContent,/deve essere Afferrato dal boss/);
  markGrappled(f,"dars");await f.controller.refresh();
  assert.equal(apply(f).disabled,false);
  assert.match(textOf(f.$("boss-total")),/Totale 21 \(metà\)/);
  f.controller.destroy();
});

test("Soul-Numbing Cold: map-selected group without area or damage, at most three creatures",async()=>{
  const f=fixture({selection:["dars","mira"]});await f.controller.ready;await importAndBind(f,"auril-phase-3.html");
  await open(f,"Soul-Numbing Cold");
  assert.equal(f.$("boss-area-step"),null,"no drawing step");
  assert.equal(f.$("boss-manual-confirmed"),null,"nothing to confirm");
  assert.equal(f.$("boss-resolution").querySelectorAll("[data-component-id]").length,0,"no damage inputs");
  assert.match(textOf(f.$("boss-resolution")),/TS COS CD 15 · fino a 3 creature entro 60 ft\. · Soul-Numbing Cold sui falliti fino alla fine del loro turno successivo/);
  assert.deepEqual(groupRows(f).map(row=>row.dataset.targetId),["dars","mira"]);
  await groupOutcome(f,"dars","failed").click();await groupOutcome(f,"mira","passed").click();
  assert.match(textOf(groupRows(f)[0]),/Debuff/);
  assert.match(textOf(f.$("boss-total")),/1 con Soul-Numbing Cold/);
  f.items.push({id:"sera",name:"Sera",type:"IMAGE",layer:"CHARACTER",metadata:{[META]:{hp:38,hpMax:38,inInitiative:true}}},
    {id:"goblin",name:"Goblin",type:"IMAGE",layer:"CHARACTER",metadata:{[META]:{hp:7,hpMax:7,inInitiative:true}}});
  await f.select(["dars","mira","sera","goblin"]);
  await f.$("boss-group-use-selection").click();
  assert.equal(groupRows(f).length,4);
  assert.match(f.$("boss-apply-hint").textContent,/Al massimo 3 bersagli: togline 1/);
  await groupRows(f).find(row=>row.dataset.targetId==="goblin").querySelectorAll("button").find(b=>b.textContent==="×").click();await tick();
  for(const id of ["sera"])await groupOutcome(f,id,"failed").click();
  assert.equal(apply(f).disabled,false);
  await submit(f);
  assert.deepEqual([...f.calls[0].targetIds].sort(),["dars","mira","sera"]);
  assert.deepEqual(f.calls[0].componentAmounts,{});
  f.controller.destroy();
});

// ---- tranche 6: Mark of the Frostmaiden, Detonation of the Mark, Frostmaiden's Kiss ----
const MARK_PILL={id:"mark-seed",condition:"Mark of the Frostmaiden",active:true,effectId:"monster-mark:auril:mark-of-the-frostmaiden",effectKind:"debuff",sourceId:"auril",expiry:{mode:"manual"}};
function markTarget(f,id){const meta=f.items.find(entry=>entry.id===id).metadata[META];meta.conditions={version:2,instances:[...(meta.conditions?.instances || []),{...MARK_PILL}]};}

test("Frostmaiden's Kiss: no prerequisite to confirm, a manual maximum-HP note and the boss healing in the preview",async()=>{
  const f=fixture({selection:["dars"]});await f.controller.ready;await importAndBind(f,"auril-phase-2.html");
  await open(f,"Frostmaiden's Kiss");
  assert.equal(f.$("boss-manual-confirmed"),null);
  assert.match(textOf(f.$("boss-resolution")),/A mano: Riduci a mano il massimo dei Punti Ferita/);
  await outcome(f,"hit").click();
  assert.match(textOf(f.$("boss-total")),/Totale 25 · boss \+18 PF/);
  assert.equal(apply(f).disabled,false);
  await submit(f);
  assert.equal(f.calls.length,1);assert.deepEqual(f.calls[0].expectedMarkedIds,[]);
  f.controller.destroy();
});

test("a marked creature: the Marchio badge, the cold resistance ignored in the preview, then spent for the round",async()=>{
  const f=fixture({selection:["dars"]});await f.controller.ready;await importAndBind(f,"auril-phase-2.html");
  resistCold(f,"dars");markTarget(f,"dars");
  await f.controller.refresh();await open(f,"Icekiss +2");await outcome(f,"hit").click();
  assert.match(textOf(f.$("boss-target-defenses")),/Marchio/);
  assert.doesNotMatch(textOf(f.$("boss-target-defenses")),/Res\. freddo/,"the mark removes the cold resistance for this hit");
  assert.match(textOf(f.$("boss-total")),/Totale 25/);
  await submit(f);
  assert.deepEqual(f.calls[0].expectedMarkedIds,["dars"]);
  f.controller.destroy();
  const g=fixture({selection:["dars"]});await g.controller.ready;await importAndBind(g,"auril-phase-2.html");
  resistCold(g,"dars");markTarget(g,"dars");g.items[0].metadata[META].bossActionState={markUses:{dars:3}};
  await g.controller.refresh();await open(g,"Icekiss +2");await outcome(g,"hit").click();
  assert.match(textOf(g.$("boss-target-defenses")),/Res\. freddo.*Marchio \(usato\)/);
  assert.match(textOf(g.$("boss-total")),/Totale 21/);
  await submit(g);
  assert.deepEqual(g.calls[0].expectedMarkedIds,[]);
  g.controller.destroy();
});

test("Mark of the Frostmaiden: one creature from the map, Marchio on a failure, Già marchiato for a marked one",async()=>{
  const f=fixture({selection:["dars","mira"]});await f.controller.ready;await importAndBind(f,"auril-phase-2.html");markTarget(f,"mira");
  await f.controller.refresh();await open(f,"Mark of the Frostmaiden");
  assert.match(textOf(f.$("boss-resolution")),/TS COS CD 19 · 1 creatura entro 60 ft\. · marchio sul fallimento fino alla detonazione/);
  await groupOutcome(f,"dars","failed").click();await groupOutcome(f,"mira","failed").click();
  assert.match(f.$("boss-apply-hint").textContent,/Un solo bersaglio: togline 1/);
  assert.match(textOf(groupRows(f).find(row=>row.dataset.targetId==="dars")),/Marchio/);
  assert.match(textOf(groupRows(f).find(row=>row.dataset.targetId==="mira")),/Già marchiato/);
  await groupRows(f).find(row=>row.dataset.targetId==="mira").querySelectorAll("button").find(b=>b.textContent==="×").click();await tick();
  assert.equal(apply(f).disabled,false);
  await submit(f);
  assert.deepEqual(f.calls[0].targetIds,["dars"]);
  f.controller.destroy();
});

test("Detonation of the Mark waits for a marked creature",async()=>{
  const f=fixture({selection:["dars"]});await f.controller.ready;await importAndBind(f,"auril-phase-3.html");
  await open(f,"Detonation of the Mark");await outcome(f,"failed").click();
  assert.match(f.$("boss-apply-hint").textContent,/deve essere marchiato dal boss/);
  markTarget(f,"dars");await f.controller.refresh();
  assert.equal(apply(f).disabled,false);
  assert.match(textOf(f.$("boss-target-defenses")),/Marchio/);
  f.controller.destroy();
});

// ---- library cleanup and stale binding warning ----
async function importVariant(f,name,edit){
  const content=edit(await readFile(new URL("./fixtures/boss-actions/"+name,import.meta.url),"utf8"));
  f.$("boss-file").files=[{name,text:async()=>content}];await f.$("boss-import").click();await tick();
}
const optionTexts=f=>f.$("boss-profile").children.map(option=>option.textContent);

test("library: a token on a superseded revision is flagged; cleanup is two-step and never removes a revision in use",async()=>{
  const f=fixture({selection:[]});await f.controller.ready;await importAndBind(f,"auril-phase-2.html");
  await importVariant(f,"auril-phase-2.html",html=>html.replace("Auril occupa due","Auril ora occupa due"));
  await f.controller.refresh();
  assert.match(optionTexts(f)[0],/v22 · [a-f0-9]{8} · collegata qui · superata/);
  assert.doesNotMatch(optionTexts(f)[1],/superata/);
  assert.equal(f.$("boss-profile-warning").hidden,false);
  assert.match(f.$("boss-profile-warning").textContent,/Il token usa una revisione superata/);
  assert.equal(f.$("boss-prune").textContent,"Pulisci superate (0)","the bound revision is kept");
  await importVariant(f,"auril-phase-2.html",html=>html.replace("Auril occupa due","Auril adesso occupa due"));
  await f.controller.refresh();
  assert.equal(f.$("boss-prune").textContent,"Pulisci superate (1)");
  await f.$("boss-prune").click();await tick();
  assert.equal(f.store.list().length,3,"the first click only asks");
  assert.equal(f.$("boss-prune").textContent,"Conferma: elimina 1");
  assert.equal(f.$("boss-prune").disabled,false,"the confirm button is clickable once the first click has finished");
  await f.$("boss-prune").click();await tick();
  assert.equal(f.store.list().length,2);
  assert.match(f.$("boss-status").textContent,/1 revisioni superate eliminate/);
  f.$("boss-profile").value="0";await f.$("boss-delete-revision").click();await tick();
  assert.equal(f.store.list().length,2,"the revision bound to this token is protected");
  assert.match(f.$("boss-status").textContent,/in uso da Auril/);
  f.$("boss-profile").value="1";await f.$("boss-delete-revision").click();await tick();
  assert.equal(f.store.list().length,2);
  assert.match(f.$("boss-cleanup-info").textContent,/Premi di nuovo per confermare/);
  assert.equal(f.$("boss-delete-revision").disabled,false,"the confirm button is clickable");
  await f.$("boss-delete-revision").click();await tick();
  assert.equal(f.store.list().length,1);
  assert.equal(f.$("boss-profile-warning").hidden,true,"only the bound revision is left");
  f.controller.destroy();
});

// ---- boss resources reset ----
test("leftover counters from an earlier combat are flagged in the list; the reset asks once, then sends one request",async()=>{
  const f=fixture({selection:[]});await f.controller.ready;await importAndBind(f,"auril-phase-2.html");
  const resets=[];
  const base=f.runtime.getBossActionPresentation;
  f.runtime.getBossActionPresentation=async()=>({...(await base()),usageSummary:resets.length
    ?{valid:true,rounds:[],futureRounds:[],phaseUses:0,markUses:0,total:0}
    :{valid:true,rounds:[2,3],futureRounds:[2,3],phaseUses:1,markUses:0,total:3}});
  f.runtime.resetBossActionResources=async request=>{resets.push(request);return{rounds:[2,3],phaseUses:1,markUses:0,undoAvailable:true,historyEntryId:"reset-1"};};
  await f.controller.refresh();
  assert.match(textOf(f.$("boss-resource-warning")),/Usi registrati nei round 2, 3, oltre il round attuale 3/);
  const inline=()=>f.$("boss-reset-resources-inline");
  assert.equal(inline().textContent,"Azzera risorse");assert.equal(inline().disabled,false);
  await inline().click();await tick();
  assert.equal(resets.length,0,"the first click only asks");
  assert.equal(inline().textContent,"Conferma azzeramento");assert.equal(inline().disabled,false,"the confirm button is clickable");
  assert.match(f.$("boss-status").textContent,/Premi di nuovo per confermare/);
  await inline().click();await tick();await tick();
  assert.equal(resets.length,1);
  assert.deepEqual({profileId:resets[0].profileId,sourceId:resets[0].sourceId},{profileId:profileOf(f).profileId,sourceId:"auril"});
  assert.match(f.$("boss-status").textContent,/Risorse azzerate: round 2, 3, 1 usi per fase/);
  assert.equal(f.$("boss-resource-warning"),null,"no leftovers after the reset");
  assert.equal(f.$("boss-undo").hidden,false,"Undo is offered");
  assert.match(f.$("boss-resource-info").textContent,/Nessun uso registrato/);
  assert.equal(f.$("boss-reset-resources").disabled,true);
  f.controller.destroy();
});

test("passive traits live in their own tab as a read-only summary; phase 3 shows its reactions after the epic actions",async()=>{
  const f=fixture();await f.controller.ready;await importAndBind(f,"auril-phase-2.html");
  await f.$("boss-tab-passives").click();await tick();
  assert.equal(f.$("boss-action-rows"),null,"the combat list is replaced");
  const passives=f.$("boss-passives").children;
  assert.deepEqual(passives.map(item=>item.children[0].textContent),["Doppia Manifestazione","Rimebound Link","Titano Immobile","Movimento Sfuggente","Resistenza alla Magia","Essere Divino","Aura Gelida"]);
  assert.match(passives[1].children[1].textContent,/^All'inizio di ogni round, il Titano ottiene Resistenza/,"the text without the printed title");
  assert.ok(passives.every(item=>!item.querySelectorAll("button").length),"summary only: nothing to click");
  assert.equal(f.$("boss-tab-passives").getAttribute("aria-selected"),"true");
  f.controller.destroy();
  const g=fixture();await g.controller.ready;await importAndBind(g,"auril-phase-3.html");
  assert.equal(g.$("boss-passives")?.children.length,7,"the chosen tab is remembered for this popover session");
  await g.$("boss-tab-actions").click();await tick();
  assert.deepEqual(listGroups(g).map(([label,names])=>[label,names.length]),[["Azioni Epiche",6],["Reazioni",2]]);
  g.controller.destroy();
});

test("Epic Resistance: pick an effect on Auril, enter the d20; failed or passed, the attempt is sent and named",async()=>{
  const f=fixture({selection:[]});await f.controller.ready;await importAndBind(f,"auril-phase-2.html");
  f.items[0].metadata[META].conditions={version:2,instances:[{id:"blind-1",condition:"Accecato",active:true,sourceName:"Dars"}]};
  f.items[0].metadata[META]["com.thebigpicture.initiative/spells"]=[{instanceId:"hold-1",name:"Blocca mostri",casterName:"Mira",conc:true}];
  await f.controller.refresh();
  await open(f,"Epic Resistance");
  const choices=f.$("boss-effect-choices").querySelectorAll("[data-effect-key]");
  assert.deepEqual(choices.map(choice=>textOf(choice).trim()),["Blocca mostri Incantesimo · Mira · concentrazione","Accecato Condizione · Dars"]);
  assert.match(f.$("boss-apply-hint").textContent,/Scegli l’effetto da terminare/);
  await choices[1].click();await tick();
  const roll=f.$("boss-resolution").querySelector("[data-effect-roll]");
  roll.value="7";await roll.emit("input");
  assert.match(textOf(f.$("boss-total")),/Fallita · Accecato resta/);
  assert.equal(f.$("boss-apply").disabled,false,"a failed roll is recorded too");
  roll.value="21";await roll.emit("input");
  assert.match(f.$("boss-apply-hint").textContent,/Inserisci il risultato del d20 \(1–20\)/);
  roll.value="12";await roll.emit("input");
  assert.match(textOf(f.$("boss-total")),/Riuscita · Accecato termina/);
  await submit(f);
  assert.equal(f.calls.length,1);
  assert.deepEqual([f.calls[0].effect,f.calls[0].roll],[{kind:"condition",instanceId:"blind-1"},12]);
  assert.equal(f.registerCalls.length,0,"not a manual registration any more");
  f.controller.destroy();
});

test("Hurl: the held creature is picked, distance sets the suggested damage, landing beyond the edge is sent",async()=>{
  const f=fixture({selection:[]});await f.controller.ready;await importAndBind(f,"auril-phase-2.html");
  f.items[1].metadata[META].conditions={version:2,instances:[{id:"grab-1",condition:"Afferrato",active:true,sourceId:"auril"}]};
  await f.controller.refresh();
  await open(f,"Hurl");
  assert.equal(f.$("boss-target-name").textContent,"Dars","the only creature the boss holds");
  assert.match(f.$("boss-apply-hint").textContent,/Scegli la distanza del lancio/);
  await f.$("boss-throw-distance").querySelectorAll("[data-throw-distance]")[1].click();await tick();
  const damage=f.$("boss-resolution").querySelector("[data-throw-damage]");
  assert.equal(damage.value,"6","20 ft: twice the printed average");
  assert.equal(f.$("boss-throw-formula").textContent,"Contundenti 2d6");
  await f.$("boss-throw-distance").querySelectorAll("[data-throw-distance]")[2].click();await tick();
  assert.equal(damage.value,"9","the suggestion follows the distance until the GM types");
  damage.value="11";await damage.emit("input");
  await f.$("boss-throw-distance").querySelectorAll("[data-throw-distance]")[0].click();await tick();
  assert.equal(damage.value,"11","a typed roll stays");
  assert.match(f.$("boss-apply-hint").textContent,/Scegli dove atterra/);
  await f.$("boss-throw-landing").querySelectorAll("[data-throw-landing]")[1].click();await tick();
  assert.match(textOf(f.$("boss-total")),/Totale 11 · oltre il bordo/);
  await submit(f);
  assert.equal(f.calls.length,1);
  assert.deepEqual([f.calls[0].targetId,f.calls[0].distance,f.calls[0].damage,f.calls[0].landing],["dars",10,11,"edge"]);
  f.controller.destroy();
  const g=fixture({selection:[]});await g.controller.ready;await importAndBind(g,"auril-phase-2.html");
  await open(g,"Hurl");
  assert.match(g.$("boss-apply-hint").textContent,/Il boss non tiene nessuna creatura Afferrata/);
  g.controller.destroy();
});

// ---- tranche 8: Meteor Swarm ----
test("Meteor Swarm: one drawing asks for every point and one confirmation returns all four explosions",async()=>{
  const f=fixture({selection:[]});await f.controller.ready;await importAndBind(f,"auril-phase-2.html");
  f.api.scene.grid={getDpi:async()=>150,getScale:async()=>({parsed:{multiplier:5,unit:"ft"}})};
  const positions={dars:{x:150,y:0},mira:{x:1200,y:0}};
  f.api.scene.items.getItemBounds=async([id])=>({min:{x:positions[id].x-75,y:-75},max:{x:positions[id].x+75,y:75}});
  await open(f,"Meteor Swarm");
  assert.equal(f.$("boss-draw-area").textContent,"Disegna le 4 esplosioni");
  await f.$("boss-draw-area").click();await tick();
  assert.deepEqual(f.placements.at(-1).request.context.areaBatch,{count:4,minDistanceFeet:20,innerRadiusFeet:10});
  assert.match(textOf(f.$("boss-area-step")),/i 4 centri uno dopo l’altro; trascina il cerchio arancione per spostarne uno, poi «Conferma sagoma» una volta sola/);
  const shape=(x,ids)=>({start:{x,y:0},end:{x:x+1200,y:0},radius:1200,targetIds:ids});
  f.placements.at(-1).resolve({status:"confirmed",preview:{...shape(0,["dars","mira"]),targetIds:["dars","mira"],
    areas:[shape(0,["dars","mira"]),shape(3000,["mira"]),shape(6000,[]),shape(9000,[])]}});
  await tick();await tick();await tick();await tick();
  assert.match(textOf(f.$("boss-area-step")),/4 esplosioni disegnate: 2 creature, 1 entro 10 ft/);
  assert.match(f.$("boss-status").textContent,/^4 esplosioni: 2 creature, 1 entro 10 ft\. Inserisci i tiri salvezza\./);
  assert.equal(f.$("boss-draw-area").textContent,"Ridisegna tutte");
  // Redrawing keeps the confirmed set until a new one is confirmed.
  await f.$("boss-draw-area").click();await tick();
  assert.equal(f.placements.at(-1).request.context.areaBatch.count,4);
  f.placements.at(-1).resolve({status:"cancelled"});await tick();await tick();
  assert.match(textOf(f.$("boss-area-step")),/4 esplosioni disegnate/,"a cancelled redraw keeps the previous points");
  await groupOutcome(f,"dars","failed").click();await groupOutcome(f,"mira","failed").click();
  await submit(f);
  assert.equal(f.calls.length,1);
  assert.equal(f.calls[0].areaPlacements.length,4);
  assert.deepEqual(f.calls[0].areaPlacements[0].innerTargetIds,["dars"]);
  assert.deepEqual(f.calls[0].areaPlacements[1].areaTargetIds,["mira"]);
  f.controller.destroy();
});

test("Meteor Swarm: draw four spaced points, within 10 ft from the drawn centres, then apply",async()=>{
  const f=fixture({selection:[]});await f.controller.ready;await importAndBind(f,"auril-phase-2.html");
  f.api.scene.grid={getDpi:async()=>150,getScale:async()=>({parsed:{multiplier:5,unit:"ft"}})};
  const positions={dars:{x:150,y:0},mira:{x:1200,y:0}};
  f.api.scene.items.getItemBounds=async([id])=>({min:{x:positions[id].x-75,y:-75},max:{x:positions[id].x+75,y:75}});
  await open(f,"Meteor Swarm");
  // v20: Gather the Winter Sky and the last slot are checked from the round log, not confirmed by hand.
  assert.equal(f.$("boss-manual-confirmed"),null);
  assert.equal(f.$("boss-draw-area").disabled,false);
  const point=async(x,ids)=>{await f.$("boss-draw-area").click();await tick();
    f.placements.at(-1).resolve({status:"confirmed",preview:{start:{x,y:0},end:{x:x+1200,y:0},targetIds:ids}});await tick();await tick();await tick();};
  assert.equal(f.$("boss-draw-area").textContent,"Disegna le 4 esplosioni");
  await point(0,["dars","mira"]);
  assert.equal(f.$("boss-draw-area").textContent,"Disegna esplosione 2/4","a shape without areas falls back to one point at a time");
  assert.match(textOf(f.$("boss-area-step")),/Esplosioni 1\/4/);
  await point(300,["dars"]);
  assert.match(f.$("boss-status").textContent,/troppo vicina alla 1: i punti devono distare almeno 20 ft/);
  assert.match(textOf(f.$("boss-area-step")),/Esplosioni 1\/4/,"the rejected point is not added");
  await point(3000,["mira"]);await point(6000,[]);
  assert.match(f.$("boss-apply-hint").textContent,/Disegna tutte le 4 esplosioni \(3\/4\)/);
  await point(9000,[]);
  assert.match(textOf(f.$("boss-area-step")),/4 esplosioni disegnate: 2 creature, 1 entro 10 ft/);
  assert.equal(f.$("boss-draw-area").textContent,"Ridisegna tutte");
  const innerChip=id=>groupRows(f).find(row=>row.dataset.targetId===id).querySelectorAll("button").find(b=>b.dataset.innerFor===id);
  assert.equal(innerChip("dars").getAttribute("aria-pressed"),"true");
  assert.equal(innerChip("mira").getAttribute("aria-pressed"),"false");
  await groupOutcome(f,"dars","failed").click();await groupOutcome(f,"mira","failed").click();
  assert.match(textOf(groupRows(f).find(row=>row.dataset.targetId==="dars")),/−82/);
  assert.match(textOf(groupRows(f).find(row=>row.dataset.targetId==="mira")),/−49/);
  await innerChip("mira").click();await tick();
  assert.match(textOf(groupRows(f).find(row=>row.dataset.targetId==="mira")),/−82/,"the GM includes Mira within 10 ft");
  await submit(f);
  assert.equal(f.calls.length,1);
  assert.equal(f.calls[0].areaPlacements.length,4);
  assert.deepEqual(f.calls[0].areaPlacements[0].innerTargetIds,["dars"]);
  assert.deepEqual([...f.calls[0].innerIds].sort(),["dars","mira"]);
  assert.equal(f.calls[0].manualConfirmed,false,"v20: nothing to confirm by hand");
  f.controller.destroy();
});

// ---- tranche 9: Divine Brilliance ----
test("Divine Brilliance: reminded below 105 PF, confirm, emanation of conscious creatures, hit/miss and one damage roll per hit",async()=>{
  const f=fixture({selection:[]});await f.controller.ready;await importAndBind(f,"auril-phase-3.html");
  assert.equal(f.$("boss-trigger-warning"),null,"no reminder above the threshold");
  f.items[0].metadata[META].hp=98;await f.controller.refresh();
  assert.match(textOf(f.$("boss-trigger-warning")),/Auril è sotto 105 PF \(98\): Divine Brilliance si innesca, se la Reazione è disponibile\./);
  await f.$("boss-trigger-open").click();await tick();
  assert.match(textOf(f.$("boss-resolution")),/Polar Ray \+11 · gittata 120 ft\. · ogni creatura cosciente entro 120 ft\./);
  assert.match(textOf(f.$("boss-trigger-state")),/Innesco: Auril a 98 PF · sotto 105: innescata/);
  assert.match(f.$("boss-apply-hint").textContent,/Conferma innesco e Reazione disponibile/);
  assert.equal(f.$("boss-draw-area").disabled,true);
  await confirmGroup(f);
  assert.match(f.$("boss-group-restrictions-text").textContent,/^1 · Innesco e Reazione verificati\.$/);
  f.items.push({id:"sera",name:"Sera",type:"IMAGE",layer:"CHARACTER",metadata:{[META]:{hp:0,hpMax:38,inInitiative:true}}});
  await f.controller.refresh();
  const request=await drawCone(f,["dars","mira","sera"]);
  assert.equal(request.ruleId,"boss-action-area:emanation:120ft");
  assert.equal(request.context.areaTheme,"frost","Auril's areas use the frost theme");
  assert.match(f.$("boss-status").textContent,/2 creature \(1 a 0 PF esclusa\)\. Inserisci i tiri per colpire e i danni\./);
  assert.deepEqual(groupRows(f).map(row=>row.dataset.targetId),["dars","mira"]);
  assert.deepEqual(f.$("boss-resolution").querySelectorAll("[data-group-all]").map(button=>button.textContent),["Tutti colpiti","Tutti mancati"]);
  await groupOutcome(f,"dars","hit").click();await groupOutcome(f,"mira","miss").click();
  const dars=()=>groupRows(f).find(row=>row.dataset.targetId==="dars");
  const inputs=dars().querySelectorAll("[data-target-component]");
  assert.deepEqual(inputs.map(input=>[input.dataset.targetComponent,input.value]),[["cold","10"],["necrotic","10"]],"a hit starts from the averages");
  assert.match(textOf(dars()),/−20/);
  assert.equal(groupRows(f).find(row=>row.dataset.targetId==="mira").querySelectorAll("[data-target-component]").length,0,"a miss has no damage roll");
  inputs[0].value="14";await inputs[0].emit("input");
  assert.match(textOf(dars()),/−24/,"the row total follows its own roll");
  inputs[1].value="";await inputs[1].emit("input");
  assert.match(f.$("boss-apply-hint").textContent,/Inserisci i danni di 1 bersaglio colpito/);
  inputs[1].value="10";await inputs[1].emit("input");
  assert.equal(f.$("boss-apply").disabled,false);
  await submit(f);
  assert.equal(f.calls.length,1);
  assert.deepEqual(f.calls[0].targetAmounts,{dars:{cold:14,necrotic:10}});
  assert.deepEqual(f.calls[0].outcomes,{dars:"hit",mira:"miss"});
  assert.equal(f.calls[0].areaPlacement.ruleId,"boss-action-area:emanation:120ft");
  assert.equal(f.calls[0].manualConfirmed,true);
  f.items[0].metadata[META].hp=150;await f.controller.refresh();
  assert.equal(f.$("boss-trigger-warning"),null);
  await open(f,"Divine Brilliance");
  assert.match(textOf(f.$("boss-trigger-state")),/a 150 PF · non ancora sotto 105/);
  await confirmGroup(f);await drawCone(f,["dars"]);await groupOutcome(f,"dars","miss").click();
  assert.match(f.$("boss-apply-hint").textContent,/Innesco non avvenuto: Auril deve essere sotto 105 PF\./);
  f.controller.destroy();
});

// ---- tranche 10: trait auras on the bound token ----
test("trait auras: activated with the binding, tagged in the passives, listed and restorable from Gestisci profilo",async()=>{
  const {mergeBossAuras,bossAuraStatus}=await import("../src/bossAuraCore.js");
  const f=fixture({selection:[]});await f.controller.ready;
  const boss=f.items[0].metadata[META];const restores=[];
  const present=f.runtime.getBossActionPresentation;
  f.runtime.getBossActionPresentation=async()=>{const value=await present();return {...value,auras:value.profile?bossAuraStatus(boss.customAuras,value.profile):[]};};
  const bind=f.runtime.bindBossActionProfile;
  f.runtime.bindBossActionProfile=async(id,profile)=>{await bind(id,profile);const merged=mergeBossAuras(boss.customAuras,profile);boss.customAuras=merged.auras;
    return {auraChange:{added:merged.added,removed:merged.removed}};};
  f.runtime.restoreBossAuras=async request=>{restores.push(request);const merged=mergeBossAuras(boss.customAuras,f.getBound(),{replace:true});boss.customAuras=merged.auras;
    return {restored:merged.restored,added:merged.added,removed:merged.removed,changed:merged.changed};};
  await importAndBind(f,"auril-phase-3.html");
  assert.match(f.$("boss-status").textContent,/Profilo collegato\. HP del token preservati\. Aure attivate sul token: Primal Blizzard, Primal Blizzard · Vento, Aura Gelida\./);
  await f.$("boss-tab-passives").click();await tick();
  const passive=name=>f.$("boss-passives").children.find(item=>item.children[0].textContent.startsWith(name));
  assert.match(textOf(passive("Primal Blizzard")),/Aura sul token/);
  assert.match(textOf(passive("Aura Gelida")),/Aura sul token/);
  assert.doesNotMatch(textOf(passive("Edge of the Storm")),/Aura/);
  // The GM switches the wind off in the aura editor: the trait says so and Gestisci profilo lists it.
  boss.customAuras=boss.customAuras.map(aura=>aura.name==="Primal Blizzard · Vento"?{...aura,enabled:false}:aura);
  await f.controller.refresh();
  assert.match(textOf(passive("Primal Blizzard")),/Aura non attiva/);
  assert.match(f.$("boss-aura-info").textContent,/Primal Blizzard \(attiva\), Primal Blizzard · Vento \(disattivata\), Aura Gelida \(attiva\)/);
  await f.$("boss-restore-auras").click();await tick();
  assert.equal(restores.length,0,"the first click only asks");
  assert.match(f.$("boss-status").textContent,/Premi di nuovo per confermare/);
  assert.equal(f.$("boss-restore-auras").textContent,"Conferma ripristino");
  assert.equal(f.$("boss-restore-auras").disabled,false,"enabled again after the asking click");
  await f.$("boss-restore-auras").click();await tick();await tick();
  assert.equal(restores.length,1);
  assert.equal(restores[0].profileRevision,f.getBound().profileRevision);
  assert.match(f.$("boss-status").textContent,/Aure ripristinate dal profilo: Primal Blizzard, Primal Blizzard · Vento, Aura Gelida\./);
  assert.match(f.$("boss-aura-info").textContent,/Primal Blizzard · Vento \(attiva\)/);
  f.controller.destroy();
});

// ---- Shothragoth S2 ----
test("Arto che Precede il Corpo: after a hit the effect is chosen; a grab is refused while the boss holds a creature",async()=>{
  const f=fixture({selection:["dars"]});await f.controller.ready;await importAndBind(f,"shothragoth.html");
  if(f.$("boss-tab-actions"))await f.$("boss-tab-actions").click();await tick(); // the list tab is remembered for the session
  await open(f,"Arto che Precede il Corpo");
  assert.equal(f.$("boss-hit-choice").hidden,true,"no choice before the hit");
  assert.equal(f.$("boss-manual-confirmed"),null,"the manual text is a follow-up, not a prerequisite");
  await f.$("boss-outcome").querySelectorAll("[data-outcome]")[0].click();await tick();
  assert.equal(f.$("boss-hit-choice").hidden,false);
  assert.deepEqual(f.$("boss-hit-rider").querySelectorAll("[data-hit-rider]").map(choice=>choice.textContent),["Trascinare · 10 ft","Afferrare · CD 18"]);
  assert.match(f.$("boss-apply-hint").textContent,/Scegli l’effetto del colpo/);
  await f.$("boss-hit-rider").querySelectorAll("[data-hit-rider]")[1].click();await tick();
  assert.equal(f.$("boss-apply").disabled,false);
  await submit(f);
  assert.deepEqual([f.calls[0].targetId,f.calls[0].outcome,f.calls[0].rider],["dars","hit","grab"]);
  f.controller.destroy();
  const g=fixture({selection:["mira"]});await g.controller.ready;await importAndBind(g,"shothragoth.html");
  g.items[1].metadata[META].conditions={version:2,instances:[{id:"grab-1",condition:"Afferrato",active:true,sourceId:"auril"}]};
  await g.controller.refresh();
  await open(g,"Arto che Precede il Corpo");
  await g.$("boss-outcome").querySelectorAll("[data-outcome]")[0].click();await tick();
  await g.$("boss-hit-rider").querySelectorAll("[data-hit-rider]")[1].click();await tick();
  assert.match(g.$("boss-apply-hint").textContent,/Il boss tiene già una creatura Afferrata/);
  await g.$("boss-hit-rider").querySelectorAll("[data-hit-rider]")[0].click();await tick();
  assert.equal(g.$("boss-apply").disabled,false,"a pull is still possible");
  g.controller.destroy();
});

test("Scagliare: the held creature, the printed average, always Prono; a creature it hits needs its DEX save",async()=>{
  const f=fixture({selection:[]});await f.controller.ready;await importAndBind(f,"shothragoth.html");
  f.items[1].metadata[META].conditions={version:2,instances:[{id:"grab-1",condition:"Afferrato",active:true,sourceId:"auril"}]};
  await f.controller.refresh();
  if(f.$("boss-tab-actions"))await f.$("boss-tab-actions").click();await tick();
  await open(f,"Scagliare");
  assert.equal(f.$("boss-target-name").textContent,"Dars");
  assert.equal(f.$("boss-throw-distance"),null,"no distance choice for a flat throw");
  assert.equal(f.$("boss-throw-landing"),null,"no edge: always Prono");
  assert.equal(f.$("boss-resolution").querySelector("[data-throw-damage]").value,"13");
  assert.equal(f.$("boss-throw-formula").textContent,"Forza 3d8");
  assert.match(textOf(f.$("boss-total")),/Totale 13 · Prono/);
  const collision=f.$("boss-collision-target").querySelectorAll("[data-collision-target]");
  assert.deepEqual(collision.map(choice=>choice.textContent),["Nessuna","Dars","Mira"]);
  assert.equal(collision[1].disabled,true,"the thrown creature cannot be hit by itself");
  await collision[2].click();await tick();
  assert.equal(f.$("boss-collision-save").hidden,false);
  assert.match(f.$("boss-apply-hint").textContent,/Scegli l’esito del TS della creatura colpita/);
  await f.$("boss-collision-outcome").querySelectorAll("[data-collision-outcome]")[0].click();await tick();
  assert.match(textOf(f.$("boss-total")),/Mira −13 e Prono/);
  await submit(f);
  assert.deepEqual([f.calls[0].targetId,f.calls[0].damage,f.calls[0].landing,f.calls[0].collisionTargetId,f.calls[0].collisionOutcome],["dars",13,"platform","mira","failed"]);
  f.controller.destroy();
});

// Shothragoth S3: the console reads the sequence from the presentation (slot, warnings, seam, stale drawings).
function withSequence(f,sequence){
  const base=f.runtime.getBossActionPresentation;
  f.runtime.getBossActionPresentation=async(...args)=>({...await base(...args),sequence:{slot:{total:3,index:1,last:false,after:"Dars",remaining:["Mira","Sera"]},
    warnings:{},log:[],seam:null,staleSeamItemIds:[],...sequence(f)}});
}
const SEAM_LINE={start:{x:0,y:0},end:{x:900,y:0}};
function grid(f){f.api.scene.grid={getDpi:async()=>100,getScale:async()=>({parsed:{multiplier:5,unit:"ft"}})};}

test("Cucitura: the slot in the header, the seam drawn up to 120 ft and kept on the map with a portal at each end, then sent with its drawing",async()=>{
  const f=fixture({selection:[]});await f.controller.ready;await importAndBind(f,"shothragoth.html");grid(f);
  withSequence(f,()=>({}));await f.controller.refresh();
  if(f.$("boss-tab-actions"))await f.$("boss-tab-actions").click();await tick();
  assert.match(f.$("boss-phase").textContent,/Round 3 · Azione Epica 1\/3/);
  assert.match(textOf(row(f,"Cucitura del Non-Luogo")),/Cucitura fino a 120 ft · prima del round/);
  await open(f,"Cucitura del Non-Luogo");
  assert.match(textOf(f.$("boss-resolution")),/Finché esiste blocca Il Corpo Non Era Qui\. Strappare la Cucitura la usa come ultima Azione Epica del round\./);
  assert.equal(f.$("boss-draw-seam").textContent,"Disegna cucitura");
  assert.match(f.$("boss-apply-hint").textContent,/Disegna la cucitura sulla mappa/);
  await f.$("boss-draw-seam").click();await tick();
  const pending=f.placements.at(-1);
  assert.equal(pending.request.ruleId,"boss-action-area:line:120ft:5ft");
  assert.equal(pending.request.context.areaTheme,"void");
  const keep=pending.request.context.keepOnMap;
  assert.match(keep.id,/^boss-seam-/);
  assert.deepEqual(keep.metadata,{"com.thebigpicture.initiative/bossSeam":{sourceId:"auril",actionInstanceId:keep.metadata["com.thebigpicture.initiative/bossSeam"].actionInstanceId}});
  pending.resolve({status:"confirmed",preview:{...SEAM_LINE,targetIds:[]}});await tick();await tick();
  assert.equal(f.$("boss-seam-label").textContent,"Cucitura disegnata: 45 ft.");
  // A portal on the Props layer at each end, attached to the seam drawing and marked as part of it.
  const portalIds=[`${keep.id}-portal-start`,`${keep.id}-portal-end`];
  assert.deepEqual(f.added.map(item=>[item.id,item.layer,item.attachedTo,item.position,item.metadata["com.thebigpicture.initiative/bossSeam"].portal]),
    [[portalIds[0],"PROP",keep.id,SEAM_LINE.start,"start"],[portalIds[1],"PROP",keep.id,SEAM_LINE.end,"end"]]);
  assert.match(f.added[0].image.url,/\/boss-seam-portal\.webp$/);
  assert.deepEqual([f.added[0].image.width,f.added[0].grid.dpi,f.added[0].locked,f.added[0].disableHit],[1254,627,true,true]);
  assert.match(textOf(f.$("boss-total")),/Cucitura 45 ft fino a fine round/);
  assert.equal(f.$("boss-draw-seam").textContent,"Ridisegna");
  assert.equal(apply(f).disabled,false);
  await submit(f);
  assert.equal(f.calls.length,1);
  assert.deepEqual(f.calls[0].seam,{...SEAM_LINE,lengthFeet:45,itemIds:[keep.id,`${keep.id}-geometry`,...portalIds]});
  assert.equal(f.calls[0].actionId,actionNamed(f,"Cucitura del Non-Luogo").id);
  f.controller.destroy();
});

// Cucitura Spezzata: A–B, B–C, C–D on a 100 px grid of 5 ft cells (20 + 15 + 20 ft).
const CHAIN=[{x:0,y:0},{x:400,y:0},{x:400,y:300},{x:800,y:300}];
test("Cucitura Spezzata: three segments one after the other, each from the previous end and up to 120 ft; a portal on every point",async()=>{
  const f=fixture({selection:[]});await f.controller.ready;await importAndBind(f,"shothragoth.html");grid(f);
  withSequence(f,()=>({}));await f.controller.refresh();
  if(f.$("boss-tab-actions"))await f.$("boss-tab-actions").click();await tick();
  assert.match(textOf(row(f,"Cucitura Spezzata")),/4 punti · fino a 120 ft per tratto · prima del round/);
  await open(f,"Cucitura Spezzata");
  assert.match(textOf(f.$("boss-resolution")),/3 cuciture larghe 5 ft fra 4 punti entro 60 ft · fino a 120 ft ciascuna/);
  assert.equal(f.$("boss-draw-seam").textContent,"Disegna cuciture");
  assert.match(f.$("boss-apply-hint").textContent,/Disegna tutte le cuciture \(0\/3\)/);
  const draw=async(start,end)=>{await f.$("boss-draw-seam").click();await tick();const pending=f.placements.at(-1);
    pending.resolve({status:"confirmed",preview:{start,end,targetIds:[]}});await tick();await tick();return pending.request;};
  const [A,B,C,D]=CHAIN;
  const first=await draw(A,B);
  assert.equal(first.ruleId,"boss-action-area:line:120ft:5ft");
  assert.equal(first.context.lineStart,undefined);
  assert.match(first.context.keepOnMap.id,/^boss-seam-.+-s1$/);
  assert.equal(f.$("boss-seam-label").textContent,"Cuciture 1/3: 20 ft.");
  assert.equal(f.$("boss-draw-seam").textContent,"Disegna cucitura 2/3");
  assert.equal(f.$("boss-restart-seam").hidden,false);
  const second=await draw(B,C);
  assert.equal(second.ruleId,"boss-action-area:line:120ft:5ft","every segment reaches the full 120 ft");
  assert.deepEqual(second.context.lineStart,B,"the segment starts where the previous one ended");
  assert.equal(f.added.length,0,"the portals wait for the whole chain");
  const third=await draw(C,D);
  assert.equal(third.ruleId,"boss-action-area:line:120ft:5ft");
  assert.deepEqual(third.context.lineStart,C);
  const base=first.context.keepOnMap.id.replace(/-s1$/,"");
  assert.deepEqual(f.added.map(item=>[item.id,item.layer,item.attachedTo,item.position]),[[`${base}-portal-1`,"PROP",`${base}-s1`,A],
    [`${base}-portal-2`,"PROP",`${base}-s1`,B],[`${base}-portal-3`,"PROP",`${base}-s2`,C],[`${base}-portal-4`,"PROP",`${base}-s3`,D]]);
  assert.equal(f.$("boss-seam-label").textContent,"Cuciture disegnate: 3 tratti, 55 ft in tutto.");
  assert.equal(f.$("boss-restart-seam").hidden,true);
  assert.equal(apply(f).disabled,false);
  await submit(f);
  assert.deepEqual([f.calls[0].seam.points,f.calls[0].seam.segmentsFeet,f.calls[0].seam.lengthFeet],[CHAIN,[20,15,20],55]);
  assert.equal(f.calls[0].seam.itemIds.length,10,"three areas, their outlines and four portals");
  f.controller.destroy();
});

test("Strappare le Cuciture: the GM picks the segments; a line on each one in turn, the group is their union",async()=>{
  const f=fixture({selection:[]});await f.controller.ready;await importAndBind(f,"shothragoth.html");
  const [A,B,C,D]=CHAIN;
  const seam={round:3,actionId:actionNamed(f,"Cucitura Spezzata").id,start:A,end:D,points:CHAIN,segmentsFeet:[20,15,20],lengthFeet:55,itemIds:[]};
  withSequence(f,()=>({seam,slot:{total:3,index:3,last:true,after:"Sera",remaining:[]}}));await f.controller.refresh();
  if(f.$("boss-tab-actions"))await f.$("boss-tab-actions").click();await tick();
  await open(f,"Strappare le Cuciture");
  const boxes=f.$("boss-seam-segments").querySelectorAll("input");
  assert.deepEqual(boxes.map(box=>[box.dataset.segment,box.checked]),[["0",true],["1",true],["2",true]],"every segment by default");
  assert.match(textOf(f.$("boss-seam-segments")),/A–B · 20 ft.*B–C · 15 ft.*C–D · 20 ft/);
  boxes[1].checked=false;await boxes[1].emit("change");await tick();
  assert.equal(f.$("boss-draw-area").textContent,"Mostra le linee");
  assert.match(f.$("boss-apply-hint").textContent,/Mostra le linee delle cuciture scelte \(0\/2\)/);
  await f.$("boss-draw-area").click();await tick();
  let pending=f.placements.at(-1);
  assert.equal(pending.request.ruleId,"boss-action-area:seam:20ft");
  assert.deepEqual(pending.request.context.presetLine,{start:A,end:B});
  pending.resolve({status:"confirmed",preview:{start:A,end:B,targetIds:["dars","mira"]}});await tick();await tick();await tick();
  pending=f.placements.at(-1);
  assert.deepEqual(pending.request.context.presetLine,{start:C,end:D},"the next chosen segment follows on its own");
  pending.resolve({status:"confirmed",preview:{start:C,end:D,targetIds:["dars"]}});await tick();await tick();
  assert.equal(f.placements.length,2);
  assert.match(textOf(f.$("boss-area-step")),/2 linee mostrate: 2 creature colpite/);
  await groupOutcome(f,"dars","failed").click();await groupOutcome(f,"mira","passed").click();
  await submit(f);
  assert.deepEqual(f.calls[0].areaPlacements.map(row=>[row.start,row.end,row.segment,row.areaTargetIds]),[[A,B,0,["dars","mira"]],[C,D,2,["dars"]]]);
  assert.deepEqual(f.calls[0].targetIds,["dars","mira"],"Dars, in two lines, is one target");
  f.controller.destroy();
});

test("Strappare la Cucitura: the line is laid on the seam; outside the last slot the GM confirms and the confirmation is sent",async()=>{
  const f=fixture({selection:[]});await f.controller.ready;await importAndBind(f,"shothragoth.html");
  let seam=null;
  withSequence(f,g=>({seam,warnings:{[actionNamed(g,"Strappare la Cucitura").id]:"Non è l’ultimo slot del round: devono ancora agire Mira, Sera. Confermalo solo se è davvero l’ultima Azione Epica del round."}}));
  await f.controller.refresh();
  if(f.$("boss-tab-actions"))await f.$("boss-tab-actions").click();await tick();
  await open(f,"Strappare la Cucitura");
  assert.equal(f.$("boss-manual-confirmed"),null,"the recharge follows the sequence: no manual step");
  assert.equal(f.$("boss-draw-area").disabled,true);
  assert.equal(f.$("boss-draw-area").title,"Nessuna cucitura in questo round.");
  await f.$("boss-back").click();await tick();
  seam={round:3,actionId:actionNamed(f,"Cucitura del Non-Luogo").id,...SEAM_LINE,lengthFeet:45,itemIds:["boss-seam-a","boss-seam-a-geometry"]};
  await f.controller.refresh();
  assert.match(textOf(f.$("boss-seam-note")),/Cucitura attiva \(45 ft\) fino alla fine del round 3: Il Corpo Non Era Qui bloccato; Strappare la Cucitura come ultima Azione Epica\./);
  await open(f,"Strappare la Cucitura");
  assert.match(textOf(f.$("boss-sequence-step")),/È l’ultima Azione Epica del round\. Non è l’ultimo slot del round: devono ancora agire Mira, Sera/);
  assert.equal(f.$("boss-draw-area").textContent,"Mostra la linea");
  await f.$("boss-draw-area").click();await tick();
  const pending=f.placements.at(-1);
  assert.equal(pending.request.ruleId,"boss-action-area:seam:20ft");
  assert.deepEqual(pending.request.context.presetLine,SEAM_LINE);
  pending.resolve({status:"confirmed",preview:{...SEAM_LINE,targetIds:["dars","mira"]}});await tick();await tick();
  await groupOutcome(f,"dars","failed").click();await groupOutcome(f,"mira","passed").click();
  assert.match(textOf(groupRows(f)[0]),/−36 Prono/);
  assert.match(f.$("boss-apply-hint").textContent,/Conferma che è l’ultima Azione Epica del round/);
  assert.equal(apply(f).disabled,true);
  const box=f.$("boss-sequence-confirmed");box.checked=true;await box.emit("change");
  assert.equal(apply(f).disabled,false);
  await submit(f);
  assert.equal(f.calls[0].sequenceConfirmed,true);
  assert.deepEqual(f.calls[0].areaPlacement,{ruleId:"boss-action-area:seam:20ft",...SEAM_LINE,areaTargetIds:["dars","mira"]});
  assert.deepEqual(f.calls[0].componentAmounts,{force:18,psychic:18});
  f.controller.destroy();
});

test("a sequence block greys the row; a stale seam drawing is reported and removed on request",async()=>{
  const f=fixture({selection:[]});await f.controller.ready;await importAndBind(f,"shothragoth.html");
  const removals=[];f.runtime.removeStaleBossSeams=async request=>{removals.push(request);return{removed:["boss-seam-old","boss-seam-old-geometry"]};};
  withSequence(f,()=>({staleSeamItemIds:["boss-seam-old","boss-seam-old-geometry"]}));
  f.availability[actionNamed(f,"Cucitura del Non-Luogo").id]={tracked:false,available:false,sequenceBlocked:true,
    reason:"Cucitura del Non-Luogo dev’essere la prima Azione Epica del round: nel round 3 Auril ha già usato Fauce Impossibile."};
  await f.controller.refresh();
  if(f.$("boss-tab-actions"))await f.$("boss-tab-actions").click();await tick();
  assert.match(textOf(row(f,"Cucitura del Non-Luogo")),/Bloccata/);
  await open(f,"Cucitura del Non-Luogo");
  assert.match(f.$("boss-apply-hint").textContent,/prima Azione Epica del round: nel round 3 Auril ha già usato Fauce Impossibile/);
  assert.equal(f.$("boss-draw-seam").disabled,true);
  await f.$("boss-back").click();await tick();
  assert.match(textOf(f.$("boss-seam-warning")),/Una cucitura non più attiva è ancora disegnata sulla mappa/);
  await f.$("boss-remove-seams").click();await tick();await tick();
  assert.equal(removals.length,1);
  assert.equal(removals[0].sourceId,"auril");
  assert.match(f.$("boss-status").textContent,/Cucitura rimossa dalla mappa/);
  f.controller.destroy();
});

test("Il Corpo Non Era Qui: the destination is picked on the map like Misty Step, then sent with the save",async()=>{
  const f=fixture({selection:["mira"]});await f.controller.ready;await importAndBind(f,"shothragoth.html");
  if(f.$("boss-tab-actions"))await f.$("boss-tab-actions").click();await tick();
  await open(f,"Il Corpo Non Era Qui");
  assert.equal(f.$("boss-pick-teleport").textContent,"Scegli destinazione");
  assert.match(f.$("boss-teleport-label").textContent,/Dove si teletrasporta Auril \(entro 60 ft\)/);
  await outcome(f,"failed").click();await tick();
  assert.match(f.$("boss-apply-hint").textContent,/Scegli dove si teletrasporta il boss/);
  assert.equal(apply(f).disabled,true);
  await f.$("boss-pick-teleport").click();await tick();
  const pending=f.placements.at(-1);
  assert.equal(pending.request.ruleId,"boss-action-area:teleport:60ft");
  // One click on the map picks and confirms the cell.
  assert.deepEqual([pending.request.context.directPointSelection,pending.request.context.autoConfirmPoint],[true,true]);
  assert.equal(pending.request.casterId,"auril");
  pending.resolve({status:"confirmed",preview:{type:"square",position:{x:750,y:300},start:{x:675,y:225},end:{x:825,y:375}}});await tick();await tick();
  assert.equal(f.$("boss-pick-teleport").textContent,"Cambia");
  assert.match(f.$("boss-teleport-label").textContent,/Destinazione scelta/);
  assert.equal(apply(f).disabled,false);
  await submit(f);
  assert.deepEqual([f.calls[0].targetId,f.calls[0].outcome,f.calls[0].teleport],["mira","failed",{x:750,y:300}]);
  f.controller.destroy();
});
