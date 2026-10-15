import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { createVersionedIndexedDB, versionedKeyRange } from "../test-support/fakeVersionedIndexedDb.js";
import { classifySceneItemChanges } from "../src/sceneItemChangeDispatcherCore.js";

globalThis.indexedDB = createVersionedIndexedDB();
globalThis.IDBKeyRange = versionedKeyRange;
globalThis.location = { pathname: "/background.html" };

const META_KEY = "com.thebigpicture.initiative/meta";
const HISTORY_KEY = "com.thebigpicture.initiative/history";
const clone = (value) => structuredClone(value);

let sceneItems = [];
let sceneMetadata = {};
let roomMetadata = {};
let testSequence = 0;
const broadcastListeners = new Map();

const sdk = {
  onReady() {},
  player: { getRole: async () => "GM" },
  room: {
    id: "actor-vitals-history-room",
    getMetadata: async () => clone(roomMetadata),
    setMetadata: async (update) => {
      roomMetadata = { ...roomMetadata, ...clone(update) };
    },
    onMetadataChange: () => () => {},
  },
  scene: {
    isReady: async () => true,
    onReadyChange: () => () => {},
    getMetadata: async () => clone(sceneMetadata),
    setMetadata: async (update) => {
      sceneMetadata = { ...sceneMetadata, ...clone(update) };
    },
    items: {
      getItems: async (ids) => clone(sceneItems.filter((item) => (
        !ids || (typeof ids === "function" ? ids(item) : ids.includes(item.id))
      ))),
      updateItems: async (ids, updater) => {
        const drafts = clone(sceneItems.filter((item) => (
          typeof ids === "function" ? ids(item) : ids.includes(item.id)
        )));
        updater(drafts);
        const byId = new Map(drafts.map((item) => [item.id, item]));
        sceneItems = sceneItems.map((item) => byId.get(item.id) || item);
      },
      addItems: async (items) => { sceneItems.push(...clone(items)); },
      deleteItems: async (ids) => {
        sceneItems = sceneItems.filter((item) => !ids.includes(item.id));
      },
      onChange: () => () => {},
    },
  },
  broadcast: {
    onMessage(channel, listener) {
      const listeners = broadcastListeners.get(channel) || new Set();
      listeners.add(listener);
      broadcastListeners.set(channel, listeners);
      return () => listeners.delete(listener);
    },
    async sendMessage(channel, data) {
      for (const listener of [...(broadcastListeners.get(channel) || [])]) {
        await listener({ data: clone(data) });
      }
    },
  },
};

mock.module("@owlbear-rodeo/sdk", {
  exports: {
    default: sdk,
    buildLabel() {},
    buildImage() {},
    buildText() {},
    buildPath() {},
    buildShape() {},
    Command: class {},
  },
});


const effects = await import("../src/effectsMutations.js");
const history = await import("../src/history.js");
const historyOwner = await import("../src/historyOwner.js");
const { currentSceneEpoch, markSceneEpochReady } = await import("../src/sceneEpoch.js");
const { createBossActionRuntime } = await import("../src/bossActionExecution.js");
const { importBossActionHTML } = await import("../src/bossActionProfileCore.js");
const { createBossActionProfileStore } = await import("../src/bossActionProfileStore.js");
const { combatEventFromHistoryEntryV3 } = await import("../src/combatLogV3Core.js");
const { readFile } = await import("node:fs/promises");
const p2 = await importBossActionHTML(await readFile(new URL("./fixtures/boss-actions/auril-phase-2.html",import.meta.url),"utf8"));
const p3 = await importBossActionHTML(await readFile(new URL("./fixtures/boss-actions/auril-phase-3.html",import.meta.url),"utf8"));
const memory = new Map();
const storage = {getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v)};
const store = createBossActionProfileStore({storage});
let runtime;
let baselineCount;
const meta = id => sceneItems.find(i=>i.id===id).metadata[META_KEY];
// The fully automated action of that kind when there is one (Icekiss / Polar Ray), whatever the stat-block order.
const ability = (p,kind) => (p.abilities.find(a=>a.execution?.kind===kind && a.automation==="SUPPORTED") || p.abilities.find(a=>a.execution?.kind===kind)).id;

test.beforeEach(async()=>{
  effects.unmountEffectsMutationCoordinatorService(); historyOwner.unmountHistoryOwner();
  sdk.room.id = `boss-action-history-${++testSequence}`;
  memory.clear(); store.put(p2); store.put(p3);
  sceneItems = [
    {id:"auril",name:"Auril",type:"IMAGE",layer:"CHARACTER",position:{x:0,y:0},metadata:{[META_KEY]:{hp:580,hpMax:580,inInitiative:true,epic:true,untouched:"actor"}}},
    {id:"dars",name:"Dars",type:"IMAGE",layer:"CHARACTER",position:{x:40,y:20},metadata:{[META_KEY]:{hp:60,hpMax:60,inInitiative:true,untouched:"target"}}},
  ];
  sceneMetadata = {["com.thebigpicture.initiative/state"]:{round:1,order:["auril","dars"],current:0},[HISTORY_KEY]:{version:1,roomId:sdk.room.id,entries:[]}};
  roomMetadata = {};
  markSceneEpochReady("boss-test");
  await historyOwner.mountHistoryOwner(); await effects.mountEffectsMutationCoordinatorService();
  runtime = createBossActionRuntime({api:sdk,store,postDamage:async()=>[]});
  await runtime.bindBossActionProfile("auril",p2);
  baselineCount=(await history.getHistoryEntries()).length;
});
test.after(()=>{effects.unmountEffectsMutationCoordinatorService(); historyOwner.unmountHistoryOwner();});
async function resolve(profile,kind,decisions){
  const presentation = await runtime.getBossActionPresentation("auril");
  return runtime.executeBossAction({sourceId:"auril",actionId:ability(profile,kind),targetId:"dars",
    profileId:profile.profileId,profileRevision:profile.profileRevision,bossInstanceId:presentation.bossInstanceId,
    sceneIdentity:presentation.sceneIdentity,...decisions});
}
test("production coordinator: Icekiss has exactly one History entry and Undo restores complete mutation",async()=>{
  await resolve(p2,"attack-damage",{mode:"ranged",outcome:"hit",componentAmounts:{slashing:18,cold:7}});
  assert.equal(meta("dars").hp,35);
  assert.equal(meta("auril").untouched,"actor");
  assert.equal(meta("dars").untouched,"target");
  const entries=await history.getHistoryEntries();
  assert.equal(entries.length,baselineCount+1);
  assert.equal(entries.find(entry=>entry.kind==="monster-action").payload.damageComponents.length,2);
  const event=combatEventFromHistoryEntryV3(entries.find(entry=>entry.kind==="monster-action"));
  assert.equal(event.provenance.actor.id,"auril");
  assert.equal(event.provenance.actor.tokenId,"auril");
  assert.equal(event.provenance.cause.kind,"monster-action");
  assert.equal(event.provenance.cause.profileRevision,p2.profileRevision);
  assert.equal(event.provenance.cause.actionInstanceId,event.correlationId);
  const undone=await history.undoHistoryThrough(entries.find(entry=>entry.kind==="monster-action").id,{sceneEpoch:currentSceneEpoch()});
  assert.equal(undone.status,"applied",JSON.stringify(undone));
  assert.equal(meta("dars").hp,60);
  assert.equal(Object.hasOwn(meta("auril"),"bossActionState"),false);
});
test("miss produces one logical History/log event, no damage, and is undoable",async()=>{
  await resolve(p2,"attack-damage",{mode:"melee",outcome:"miss",componentAmounts:{}});
  assert.equal(meta("dars").hp,60);
  const entries=await history.getHistoryEntries(); assert.equal(entries.length,baselineCount+1);
  assert.equal(combatEventFromHistoryEntryV3(entries.find(entry=>entry.kind==="monster-action")).provenance.cause.kind,"monster-action");
  await history.undoHistoryThrough(entries.find(entry=>entry.kind==="monster-action").id,{sceneEpoch:currentSceneEpoch()});
  assert.equal(Object.hasOwn(meta("auril"),"bossActionState"),false);
});
for(const [outcome,remaining] of [["failed",42],["passed",52]]) test(`Blizzard ${outcome}: one entry, no token relocation, Undo`,async()=>{
  await runtime.bindBossActionProfile("auril",p3);
  baselineCount=(await history.getHistoryEntries()).length;
  const beforePosition=clone(sceneItems[1].position);
  const result=await resolve(p3,"save-damage",{outcome,componentAmounts:{bludgeoning:9,cold:9}});
  assert.equal(meta("dars").hp,remaining);
  assert.deepEqual(sceneItems[1].position,beforePosition);
  if(outcome==="failed") assert.match(result.manualText,/20 ft/);
  const entries=await history.getHistoryEntries(); assert.equal(entries.length,baselineCount+1);
  assert.deepEqual(entries.find(entry=>entry.kind==="monster-action").payload.damageComponents.map(c=>c.type),["bludgeoning","cold"]);
  await history.undoHistoryThrough(entries.find(entry=>entry.kind==="monster-action").id,{sceneEpoch:currentSceneEpoch()});
  assert.equal(meta("dars").hp,60); assert.deepEqual(sceneItems[1].position,beforePosition);
});
test("binding is compact, survives rename/reload; duplicated token has independent instance; unbind preserves HP",async()=>{
  const original=await runtime.getBossActionPresentation("auril");
  assert.equal(Object.hasOwn(meta("auril").initiativeCard.bossActionBinding,"rawSource"),false);
  assert.equal(JSON.stringify(roomMetadata).includes("<!DOCTYPE"),false);
  assert.equal(JSON.stringify(roomMetadata).includes("abilities"),false);
  sceneItems[0].name="Auril rinominata";
  const reloaded=createBossActionRuntime({api:sdk,store:createBossActionProfileStore({storage}),postDamage:async()=>[]});
  assert.equal((await reloaded.getBossActionPresentation("auril")).profile.name,p2.name);
  const copy=clone(sceneItems[0]); copy.id="auril-copy";
  copy.metadata[META_KEY].bossActionState={version:1,boundTokenId:"auril",bossDefinitionId:p2.bossDefinitionId,bossInstanceId:original.bossInstanceId};
  sceneItems.push(copy);
  assert.notEqual((await reloaded.getBossActionPresentation("auril-copy")).bossInstanceId,original.bossInstanceId);
  await reloaded.unbindBossActionProfile("auril");
  assert.equal((await reloaded.getBossActionPresentation("auril")).binding,null);
  assert.equal(meta("auril").hp,580);
});
test("changed binding rejects pending action before mutation",async()=>{
  const old=await runtime.getBossActionPresentation("auril");
  await runtime.bindBossActionProfile("auril",p3);
  baselineCount=(await history.getHistoryEntries()).length;
  await assert.rejects(()=>runtime.executeBossAction({sourceId:"auril",actionId:ability(p2,"attack-damage"),targetId:"dars",
    profileId:p2.profileId,profileRevision:p2.profileRevision,bossInstanceId:old.bossInstanceId,sceneIdentity:old.sceneIdentity,
    mode:"melee",outcome:"hit",componentAmounts:{slashing:18,cold:7}}),/profilo|binding|cambiat/i);
  assert.equal(meta("dars").hp,60); assert.equal((await history.getHistoryEntries()).length,baselineCount);
});

test("Spellcasting uses actual catalog Slow and one production History entry; Undo restores concentration and conditions",async()=>{
  const {routeSpellUnifiedPanelOpenRequest}=await import("../src/spellUnifiedPanelRoutingCore.js");
  const {createSpellPanelSession,updateSpellPanelSession}=await import("../src/spellUnifiedPanelCore.js");
  const {buildSpellUnifiedAreaCommand}=await import("../src/spellUnifiedAreaAdapter.js");
  const {executeSpellAreaResolution}=await import("../src/spellAreaResolutionExecutor.js");
  const {getSpellDefinition}=await import("../src/spells-srd.js");
  let opened;
  sdk.popover={open:async options=>{opened=options;}};
  await runtime.launchBossActionSpell({sourceId:"auril",actionId:ability(p2,"spell-reference")});
  assert.match(opened.url,/spell-unified-panel.html/);
  const route=routeSpellUnifiedPanelOpenRequest(Object.fromEntries(new URL(opened.url,"https://local.test").searchParams));
  assert.equal(route.contract.spell.id,getSpellDefinition("slow").id);
  let session=createSpellPanelSession({contract:route.contract,...route.session});
  session=updateSpellPanelSession(session,{slotLevel:3,targetIds:["dars"],outcomes:{dars:"failed"},
    placement:{status:"confirmed",confirmed:true,ruleId:"slow:cast",spellId:"slow",casterId:"auril",targetLocked:true,targetIds:["dars"],
      preview:{type:"square",start:{x:0,y:0},end:{x:150,y:0},gridOrigin:{x:0,y:0},dpi:150,targetIds:["dars"],targetLocked:true}}});
  const command=buildSpellUnifiedAreaCommand({contract:route.contract,session,source:{sceneEpoch:currentSceneEpoch(),
    commandId:session.monsterActionContext.cause.actionInstanceId}});
  assert.equal(command.valid,true,command.errors.join(","));
  const result=await executeSpellAreaResolution(command,{
    sceneEpoch:currentSceneEpoch(),isCurrent:()=>true,
    readAllItems:()=>sdk.scene.items.getItems(),readItems:ids=>sdk.scene.items.getItems(ids),
    readSceneMetadata:()=>sdk.scene.getMetadata(),readBossActionProfile:binding=>store.get(binding.profileId,binding.profileRevision),
    validateSpatial:async()=>({valid:true,errors:[]}),
    createSpellInstanceId:async()=>"slow-instance",
    emitMatchedSpellVisual:async()=>{},
    syncHPBatchToMemory:async()=>{},
  });
  assert.equal(result.status,"applied",JSON.stringify(result));
  assert.equal(meta("dars").hp,60);
  assert.ok(meta("dars").conditions);
  assert.ok(meta("auril")["com.thebigpicture.initiative/concentration"] || Object.keys(meta("auril")).some(k=>/conc/i.test(k)));
  const entries=await history.getHistoryEntries();
  assert.equal(entries.length,baselineCount+1);
  const entry=entries.find(entry=>entry.payload?.causality?.cause?.kind==="monster-action");
  const log=combatEventFromHistoryEntryV3(entry,{turnContext:{activeId:"dars"}});
  assert.equal(log.provenance.actor.id,"auril");
  assert.equal(log.provenance.cause.actionName,"Spellcasting");
  assert.equal(log.provenance.cause.actionInstanceId,session.monsterActionContext.cause.actionInstanceId);
  assert.equal(entry.payload.causality.referencedSpell.id,"slow");
  assert.equal((await runtime.getBossActionPresentation("auril")).availability[ability(p2,"spell-reference")].remaining,0);
  assert.equal(entry.payload.causality.resources[0].afterUsed,1);
  assert.equal(p2.abilities.find(a=>a.execution?.kind==="spell-reference").execution.damage,undefined);
  await history.undoHistoryThrough(entry.id,{sceneEpoch:currentSceneEpoch()});
  assert.equal(meta("dars").hp,60);
  const conditionInstances=meta("dars").conditions?.instances || [];
  assert.equal(conditionInstances.length,0);
  assert.equal((meta("dars")["com.thebigpicture.initiative/spells"] || []).length,0);
  assert.equal((await runtime.getBossActionPresentation("auril")).availability[ability(p2,"spell-reference")].remaining,1);
});
test("zero HP consequences remain in the same action History and Undo restores them",async()=>{
  meta("dars").hp=10;meta("dars").attitude="pc";
  await resolve(p2,"attack-damage",{mode:"melee",outcome:"hit",componentAmounts:{slashing:18,cold:7}});
  assert.equal(meta("dars").hp,0);
  const entries=await history.getHistoryEntries();assert.equal(entries.length,baselineCount+1);
  const entry=entries.find(entry=>entry.kind==="monster-action");
  assert.ok(entry.changes.some(change=>Object.hasOwn(change.after,"conditions")));
  await history.undoHistoryThrough(entry.id,{sceneEpoch:currentSceneEpoch()});
  assert.equal(meta("dars").hp,10);
  assert.equal((meta("dars").conditions?.instances || []).length,0);
});

test("bind/unbind preserve effective exhaustion and existing Actor Profile fields",async()=>{
  const {getInitiativeCard}=await import("../src/initiativeCards.js");
  meta("auril").initiativeCard.exhaustion=2;
  meta("auril").initiativeCard.notes="Existing notes";
  meta("auril").conditions={version:2,instances:[
    {id:"base-exhaustion",condition:"Indebolimento",active:true,level:2,targetId:"auril",type:"initiative-card",expiry:{mode:"manual"},createdAt:1},
    {id:"contribution",condition:"Indebolimento",active:true,level:1,targetId:"auril",exhaustionContribution:true,expiry:{mode:"manual"},createdAt:2},
  ]};
  for(const contribution of [1,4]) {
  meta("auril").conditions.instances.find(i=>i.id==="contribution").level=contribution;
  const effective=Math.min(5,2+contribution);
  assert.equal(getInitiativeCard(sceneItems[0]).exhaustion,effective);
  await runtime.bindBossActionProfile("auril",p3);
  assert.equal(meta("auril").initiativeCard.exhaustion,2);
  assert.equal(getInitiativeCard(sceneItems[0]).exhaustion,effective);
  assert.equal(meta("auril").initiativeCard.notes,"Existing notes");
  await runtime.unbindBossActionProfile("auril");
  assert.equal(meta("auril").initiativeCard.exhaustion,2);
  assert.equal(getInitiativeCard(sceneItems[0]).exhaustion,effective);
  assert.equal(meta("auril").conditions.instances.find(i=>i.id==="base-exhaustion").level,2);
  }
});

test("retry of the same committed action never projects hypothetical HP or repeats post-damage reminders",async()=>{
  const projected=[];
  runtime=createBossActionRuntime({api:sdk,store,postDamage:async({change})=>{projected.push(change.afterHP);return[];}});
  const decisions={actionInstanceId:"retry-stable",mode:"melee",outcome:"hit",componentAmounts:{slashing:18,cold:7}};
  await resolve(p2,"attack-damage",decisions);
  const repeat=await resolve(p2,"attack-damage",decisions);
  assert.equal(repeat.duplicate,true);
  assert.equal(meta("dars").hp,35);
  assert.deepEqual(projected,[35]);
  assert.equal((await history.getHistoryEntries()).length,baselineCount+1);
});

test("lost ACK retries the identical prepared command through the real broker",async()=>{
  const {createEffectsMutationBackgroundBroker}=await import("../src/effectsMutationBroker.js");
  const presentation=await runtime.getBossActionPresentation("auril");
  let commits=0,lost=true;
  const broker=createEffectsMutationBackgroundBroker({
    executeApply:async(operations,options)=>{commits++;return effects.runEffectsMutation(operations,options);},
    executeUndo:async()=>{},
  });
  broker.setSceneIdentity(presentation.sceneIdentity);
  runtime=createBossActionRuntime({api:sdk,store,postDamage:async()=>[],runMutation:async(operations,options)=>{
    const reply=await broker.handle({kind:"apply",requestId:options.commandId,command:{operations,...options}});
    if(lost){lost=false;throw new Error("ACK lost");}
    return {...reply.result,duplicate:reply.duplicate};
  }});
  const decisions={actionInstanceId:"lost-ack",mode:"melee",outcome:"hit",componentAmounts:{slashing:18,cold:7}};
  await assert.rejects(()=>resolve(p2,"attack-damage",decisions),/ACK lost/);
  assert.equal(meta("dars").hp,35);
  const recovered=await resolve(p2,"attack-damage",decisions);
  assert.equal(recovered.duplicate,true);
  assert.equal(commits,1);
  assert.equal(meta("dars").hp,35);
  assert.equal((await history.getHistoryEntries()).length,baselineCount+1);
  await assert.rejects(()=>resolve(p2,"attack-damage",{...decisions,componentAmounts:{slashing:19,cold:7}}),/draft|decision|cambiat/i);
});
test("deferred or skipped History never advertises Undo even with a provisional entry id",async()=>{
  for(const flags of [{historyPending:true},{historySkipped:true}]){
    runtime=createBossActionRuntime({api:sdk,store,postDamage:async()=>[],runMutation:async()=>({
      status:"applied",historyEntry:{id:"provisional"},...flags,
    })});
    const result=await resolve(p2,"attack-damage",{mode:"melee",outcome:"miss"});
    assert.equal(result.undoAvailable,false);
  }
});

test("binding changed inside SDK commit blocks all Boss Action mutation and History",async()=>{
  const original=sdk.scene.items.updateItems;
  let injected=false;
  sdk.scene.items.updateItems=async(ids,updater)=>{
    if(!injected && ids.includes("dars")){injected=true;meta("auril").initiativeCard.bossActionBinding={profileId:p3.profileId,profileRevision:p3.profileRevision,phaseId:p3.phaseId,bossDefinitionId:p3.bossDefinitionId};}
    return original(ids,updater);
  };
  try {
    await assert.rejects(()=>resolve(p2,"attack-damage",{mode:"melee",outcome:"hit",componentAmounts:{slashing:18,cold:7}}));
    assert.equal(injected,true);assert.equal(meta("dars").hp,60);
    assert.equal(Object.hasOwn(meta("auril"),"bossActionState"),false);
    assert.equal((await history.getHistoryEntries()).length,baselineCount);
  } finally {sdk.scene.items.updateItems=original;}
});
test("commit-only assertions neither mutate their source nor add it to History or Undo",async()=>{
  const before=clone(meta("auril"));
  const result=await effects.runEffectsMutation([{type:"hp:set",updates:[{itemId:"dars",hp:55,hpMax:60}]}],{
    commandId:"assert-only-source",metadataPatches:[{id:"auril",fields:{initiativeCard:{mode:"assert",expected:{present:true,value:clone(meta("auril").initiativeCard)}}}}],
    kind:"hp",history:{kind:"hp",label:"test assert only"},
  });
  effects.requireAppliedEffectsMutation(result);assert.deepEqual(meta("auril"),before);
  assert.deepEqual(result.changedIds,["dars"]);
  assert.deepEqual(result.historyEntry.changes.map(c=>c.id),["dars"]);
  await history.undoHistoryThrough(result.historyEntry.id,{sceneEpoch:currentSceneEpoch()});
  assert.equal(meta("dars").hp,60);assert.deepEqual(meta("auril"),before);
});
for(const field of ["initiativeCard","bossActionState"]) test("Slow stops if "+field+" changes inside the SDK commit callback",async()=>{
  const {routeSpellUnifiedPanelOpenRequest}=await import("../src/spellUnifiedPanelRoutingCore.js");
  const {createSpellPanelSession,updateSpellPanelSession}=await import("../src/spellUnifiedPanelCore.js");
  const {buildSpellUnifiedAreaCommand}=await import("../src/spellUnifiedAreaAdapter.js");
  const {executeSpellAreaResolution}=await import("../src/spellAreaResolutionExecutor.js");
  let opened;
  sdk.popover={open:async options=>{opened=options;}};
  await runtime.launchBossActionSpell({sourceId:"auril",actionId:ability(p2,"spell-reference")});
  const route=routeSpellUnifiedPanelOpenRequest(Object.fromEntries(new URL(opened.url,"https://local.test").searchParams));
  const session=updateSpellPanelSession(createSpellPanelSession({contract:route.contract,...route.session}),{
    slotLevel:3,targetIds:["dars"],outcomes:{dars:"failed"},
    placement:{status:"confirmed",confirmed:true,ruleId:"slow:cast",spellId:"slow",casterId:"auril",targetLocked:true,targetIds:["dars"],
      preview:{type:"square",start:{x:0,y:0},end:{x:150,y:0},gridOrigin:{x:0,y:0},dpi:150,targetIds:["dars"],targetLocked:true}},
  });
  const command=buildSpellUnifiedAreaCommand({contract:route.contract,session,source:{sceneEpoch:currentSceneEpoch(),commandId:"slow-commit-race"}});
  const original=sdk.scene.items.updateItems;let injected=false;
  sdk.scene.items.updateItems=async(ids,updater)=>{
    if(!injected && ids.includes("dars")){
      injected=true;
      if(field==="initiativeCard")meta("auril").initiativeCard.bossActionBinding={profileId:p3.profileId,profileRevision:p3.profileRevision,phaseId:p3.phaseId,bossDefinitionId:p3.bossDefinitionId};
      else meta("auril").bossActionState={version:1,boundTokenId:"auril",bossDefinitionId:"auril",bossInstanceId:"replacement"};
    }
    return original(ids,updater);
  };
  try {
    const result=await executeSpellAreaResolution(command,{
      sceneEpoch:currentSceneEpoch(),isCurrent:()=>true,
      readAllItems:()=>sdk.scene.items.getItems(),readItems:ids=>sdk.scene.items.getItems(ids),readSceneMetadata:()=>sdk.scene.getMetadata(),readBossActionProfile:binding=>store.get(binding.profileId,binding.profileRevision),
      validateSpatial:async()=>({valid:true,errors:[]}),createSpellInstanceId:async()=>"slow-race-instance",
      emitMatchedSpellVisual:async()=>{},syncHPBatchToMemory:async()=>{},
    });
    assert.equal(injected,true);
    assert.equal(result.status,"failed",JSON.stringify(result));
    assert.equal((meta("dars").conditions?.instances || []).length,0);
    assert.equal((meta("dars")["com.thebigpicture.initiative/spells"] || []).length,0);
    assert.equal((await history.getHistoryEntries()).length,baselineCount);
  } finally {sdk.scene.items.updateItems=original;}
});

for(const mode of ["missing field","missing card"]) test("bind/unbind preserves legacy condition exhaustion with "+mode,async()=>{
  const {getInitiativeCard}=await import("../src/initiativeCards.js");
  for(const contribution of [1,4]){
    if(mode==="missing card")delete meta("auril").initiativeCard;
    else delete meta("auril").initiativeCard.exhaustion;
    meta("auril").conditions={version:2,instances:[
      {id:"legacy-base",condition:"Indebolimento",active:true,level:2,targetId:"auril",expiry:{mode:"manual"},createdAt:1},
      {id:"contribution",condition:"Indebolimento",active:true,level:contribution,targetId:"auril",exhaustionContribution:true,expiry:{mode:"manual"},createdAt:2},
    ]};
    await runtime.bindBossActionProfile("auril",p2);
    assert.equal(meta("auril").initiativeCard.exhaustion,2);
    assert.equal(getInitiativeCard(sceneItems[0]).exhaustion,Math.min(5,2+contribution));
    await runtime.unbindBossActionProfile("auril");
    assert.equal(meta("auril").initiativeCard.exhaustion,2);
    assert.equal(meta("auril").conditions.instances.find(i=>i.id==="legacy-base").level,2);
    assert.equal(meta("auril").hp,580);
  }
});

test("Blizzard resource commits with HP, blocks overspend and Undo restores both",async()=>{
  await runtime.bindBossActionProfile("auril",p3);baselineCount=(await history.getHistoryEntries()).length;
  await resolve(p3,"save-damage",{outcome:"failed",componentAmounts:{bludgeoning:9,cold:9}});
  assert.equal(meta("dars").hp,42);
  const info=await runtime.getBossActionPresentation("auril");
  assert.equal(info.availability[ability(p3,"save-damage")].remaining,0);
  await assert.rejects(()=>resolve(p3,"save-damage",{outcome:"passed",componentAmounts:{bludgeoning:9,cold:9}}),/esaurit/i);
  assert.equal(meta("dars").hp,42);assert.equal((await history.getHistoryEntries()).length,baselineCount+1);
  const entry=(await history.getHistoryEntries()).find(e=>e.kind==="monster-action");
  assert.ok(entry.payload.causality.resources?.length);
  await history.undoHistoryThrough(entry.id,{sceneEpoch:currentSceneEpoch()});
  assert.equal(meta("dars").hp,60);
  assert.equal((await runtime.getBossActionPresentation("auril")).availability[ability(p3,"save-damage")].remaining,1);
});
test("round change re-enables Blizzard without reset listeners and rewind preserves its earlier use",async()=>{
  await runtime.bindBossActionProfile("auril",p3);
  await resolve(p3,"save-damage",{outcome:"failed",componentAmounts:{bludgeoning:0,cold:0}});
  sceneMetadata["com.thebigpicture.initiative/state"].round=2;
  assert.equal((await runtime.getBossActionPresentation("auril")).availability[ability(p3,"save-damage")].available,true);
  await resolve(p3,"save-damage",{outcome:"passed",componentAmounts:{bludgeoning:0,cold:0}});
  sceneMetadata["com.thebigpicture.initiative/state"].round=1;
  assert.equal((await runtime.getBossActionPresentation("auril")).availability[ability(p3,"save-damage")].available,false);
});
test("manual 1/Phase registration consumes only a counter and survives rebind until Undo",async()=>{
  const gather=p2.abilities.find(a=>a.name==="Gather the Winter Sky");
  const info=await runtime.getBossActionPresentation("auril");
  const before=clone(meta("dars"));
  const result=await runtime.registerBossActionUse({sourceId:"auril",actionId:gather.id,...info.binding,bossInstanceId:info.bossInstanceId,manualConfirmed:true});
  assert.deepEqual(meta("dars"),before);
  assert.equal(result.undoAvailable,true);
  await runtime.unbindBossActionProfile("auril");await runtime.bindBossActionProfile("auril",p2);
  assert.equal((await runtime.getBossActionPresentation("auril")).availability[gather.id].remaining,0);
  await assert.rejects(()=>runtime.registerBossActionUse({sourceId:"auril",actionId:gather.id,manualConfirmed:true}),/esaurit/i);
});
test("two runtime clients cannot spend the same round use twice",async()=>{
  await runtime.bindBossActionProfile("auril",p3);baselineCount=(await history.getHistoryEntries()).length;
  const other=createBossActionRuntime({api:sdk,store,postDamage:async()=>[]});
  const actionId=ability(p3,"save-damage");
  const results=await Promise.allSettled([runtime,other].map(client=>client.executeBossAction({sourceId:"auril",actionId,targetId:"dars",outcome:"failed",componentAmounts:{bludgeoning:9,cold:9}})));
  assert.equal(results.filter(r=>r.status==="fulfilled").length,1);
  assert.equal(meta("dars").hp,42);assert.equal((await history.getHistoryEntries()).length,baselineCount+1);
});

test("round-only scene precondition does not conflict with turn navigation",async()=>{
  sceneMetadata["com.thebigpicture.initiative/state"].current=1;
  const result=await effects.runEffectsMutation([{type:"hp:set",updates:[{itemId:"dars",hp:55,hpMax:60}]}],{
    commandId:"round-selector",sceneMetadataPreconditions:[{key:"com.thebigpicture.initiative/state",field:"round",value:1}],
    kind:"hp",history:{kind:"hp",label:"test round selector"},
  });
  effects.requireAppliedEffectsMutation(result);assert.equal(meta("dars").hp,55);
});
test("round changed during preparation prevents resource and HP commit",async()=>{
  await runtime.bindBossActionProfile("auril",p3);
  baselineCount=(await history.getHistoryEntries()).length;
  const original=sdk.scene.items.getItems;let changed=false;
  sdk.scene.items.getItems=async(ids)=>{
    // Coordinator prepares against a complete item snapshot after runtime selected source/target.
    const result=await original(ids);
    if(!ids && !changed){changed=true;sceneMetadata["com.thebigpicture.initiative/state"].round=2;}
    return result;
  };
  try{
    await assert.rejects(()=>resolve(p3,"save-damage",{outcome:"failed",componentAmounts:{bludgeoning:9,cold:9}}));
    assert.equal(changed,true);assert.equal(meta("dars").hp,60);
    assert.equal(meta("auril").bossActionState,undefined);
    assert.equal((await history.getHistoryEntries()).length,baselineCount);
  }finally{sdk.scene.items.getItems=original;}
});

for(const [name,amounts,remaining] of [
  ["Polar Ray",{cold:10,necrotic:10},40],
  ["Rock",{bludgeoning:29},31],
]) test(name+" uses real parsed components, one entry and Undo",async()=>{
  const profile=name==="Rock"?p2:p3;
  await runtime.bindBossActionProfile("auril",profile);
  // v20: Rock only in the round of Gather the Winter Sky (registered first, as the first Epic Action).
  if(name==="Rock")await runtime.registerBossActionUse({sourceId:"auril",actionId:p2.abilities.find(a=>a.name==="Gather the Winter Sky").id,manualConfirmed:true});
  baselineCount=(await history.getHistoryEntries()).length;
  const action=profile.abilities.find(a=>a.name===name);
  const result=await runtime.executeBossAction({sourceId:"auril",actionId:action.id,targetId:"dars",
    mode:"ranged",outcome:"hit",componentAmounts:amounts});
  assert.equal(meta("dars").hp,remaining);
  assert.deepEqual(result.damageComponents.map(c=>[c.id,c.formula,c.type,c.amount]),
    action.execution.damage.map(c=>[c.id,c.formula,c.type,amounts[c.id]]));
  const entries=await history.getHistoryEntries();assert.equal(entries.length,baselineCount+1);
  const entry=entries.filter(e=>e.kind==="monster-action").at(-1);
  assert.equal(entry.payload.causality.actor.id,"auril");
  assert.equal(entry.payload.causality.attack.type,name==="Rock"?"weapon":"spell");
  await history.undoHistoryThrough(entry.id,{sceneEpoch:currentSceneEpoch()});
  assert.equal(meta("dars").hp,60);
});
test("Rock requires Gather the Winter Sky in the same round before any mutation",async()=>{
  const rock=p2.abilities.find(a=>a.name==="Rock");
  await assert.rejects(()=>runtime.executeBossAction({sourceId:"auril",actionId:rock.id,targetId:"dars",
    mode:"ranged",outcome:"hit",componentAmounts:{bludgeoning:29},manualConfirmed:true}),/Rock richiede Gather the Winter Sky nello stesso round/);
  assert.equal(meta("dars").hp,60);assert.equal((await history.getHistoryEntries()).length,baselineCount);
});
test("manual resource use is undoable and cannot be registered without confirmation",async()=>{
  const gather=p2.abilities.find(a=>a.name==="Gather the Winter Sky");
  await assert.rejects(()=>runtime.registerBossActionUse({sourceId:"auril",actionId:gather.id}),/conferma/i);
  const result=await runtime.registerBossActionUse({sourceId:"auril",actionId:gather.id,manualConfirmed:true});
  assert.equal((await history.getHistoryEntries()).length,baselineCount+1);
  const entry=(await history.getHistoryEntries()).find(e=>e.id===result.historyEntryId);
  assert.equal(entry.payload.causality.manualExecution,true);
  assert.deepEqual(entry.changes.map(c=>c.id),["auril"]);
  await history.undoHistoryThrough(entry.id,{sceneEpoch:currentSceneEpoch()});
  assert.equal((await runtime.getBossActionPresentation("auril")).availability[gather.id].remaining,1);
});
test("clone receives independent counters while reload and same-phase revision preserve consumption",async()=>{
  const gather=p2.abilities.find(a=>a.name==="Gather the Winter Sky");
  await runtime.registerBossActionUse({sourceId:"auril",actionId:gather.id,manualConfirmed:true});
  const copy=clone(sceneItems[0]);copy.id="auril-copy";sceneItems.push(copy);
  const reloaded=createBossActionRuntime({api:sdk,store,postDamage:async()=>[]});
  assert.equal((await reloaded.getBossActionPresentation("auril")).availability[gather.id].remaining,0);
  assert.equal((await reloaded.getBossActionPresentation("auril-copy")).availability[gather.id].remaining,1);
  const revision=await importBossActionHTML(p2.rawSource.html+"\n",{sourceName:"updated.html"});
  await reloaded.bindBossActionProfile("auril",revision);
  assert.equal((await reloaded.getBossActionPresentation("auril")).availability[gather.id].remaining,0);
});

async function preparedSlow(outcome="passed", commandId="slow-prepared") {
  const {routeSpellUnifiedPanelOpenRequest}=await import("../src/spellUnifiedPanelRoutingCore.js");
  const {createSpellPanelSession,updateSpellPanelSession}=await import("../src/spellUnifiedPanelCore.js");
  const {buildSpellUnifiedAreaCommand}=await import("../src/spellUnifiedAreaAdapter.js");
  let opened;sdk.popover={open:async options=>{opened=options;}};
  await runtime.launchBossActionSpell({sourceId:"auril",actionId:ability(p2,"spell-reference")});
  const route=routeSpellUnifiedPanelOpenRequest(Object.fromEntries(new URL(opened.url,"https://local.test").searchParams));
  const session=updateSpellPanelSession(createSpellPanelSession({contract:route.contract,...route.session}),{
    slotLevel:3,targetIds:["dars"],outcomes:{dars:outcome},
    placement:{status:"confirmed",confirmed:true,ruleId:"slow:cast",spellId:"slow",casterId:"auril",targetLocked:true,targetIds:["dars"],
      preview:{type:"square",start:{x:0,y:0},end:{x:150,y:0},gridOrigin:{x:0,y:0},dpi:150,targetIds:["dars"],targetLocked:true}},
  });
  return buildSpellUnifiedAreaCommand({contract:route.contract,session,source:{sceneEpoch:currentSceneEpoch(),commandId}});
}
function slowRuntime(overrides={}) {
  return {
    sceneEpoch:currentSceneEpoch(),isCurrent:()=>true,
    readAllItems:()=>sdk.scene.items.getItems(),readItems:ids=>sdk.scene.items.getItems(ids),
    readSceneMetadata:()=>sdk.scene.getMetadata(),readBossActionProfile:binding=>store.get(binding.profileId,binding.profileRevision),
    validateSpatial:async()=>({valid:true,errors:[]}),createSpellInstanceId:async()=>"slow-resource-instance",
    emitMatchedSpellVisual:async()=>{},syncHPBatchToMemory:async()=>{},...overrides,
  };
}
test("opening Slow consumes nothing; all passed saves consume once and Undo restores availability",async()=>{
  const {executeSpellAreaResolution}=await import("../src/spellAreaResolutionExecutor.js");
  const command=await preparedSlow();
  assert.equal((await runtime.getBossActionPresentation("auril")).availability[ability(p2,"spell-reference")].remaining,1);
  assert.equal((await history.getHistoryEntries()).length,baselineCount);
  const result=await executeSpellAreaResolution(command,slowRuntime());
  assert.equal(result.status,"applied",JSON.stringify(result));
  assert.equal((meta("dars").conditions?.instances || []).length,0);
  assert.equal((await runtime.getBossActionPresentation("auril")).availability[ability(p2,"spell-reference")].remaining,0);
  assert.equal((await history.getHistoryEntries()).length,baselineCount+1);
  await assert.rejects(()=>runtime.launchBossActionSpell({sourceId:"auril",actionId:ability(p2,"spell-reference")}),/esaurit/i);
  const second=await executeSpellAreaResolution({...command,commandId:"second-spend"},slowRuntime());
  assert.notEqual(second.status,"applied");
  assert.equal((await history.getHistoryEntries()).length,baselineCount+1);
  await history.undoHistoryThrough(result.historyEntryId,{sceneEpoch:currentSceneEpoch()});
  assert.equal((await runtime.getBossActionPresentation("auril")).availability[ability(p2,"spell-reference")].remaining,1);
});
test("Slow lost ACK preserves one History entry and Undo restores resource plus conditions",async()=>{
  const {executeSpellAreaResolution}=await import("../src/spellAreaResolutionExecutor.js");
  const command=await preparedSlow("failed","slow-lost-ack");
  const result=await executeSpellAreaResolution(command,slowRuntime({
    runEffectsMutation:async(operations,options)=>{
      const committed=await effects.runEffectsMutation(operations,options);
      effects.requireAppliedEffectsMutation(committed);
      throw new Error("ACK lost after Slow commit");
    },
  }));
  assert.equal(result.status,"applied",JSON.stringify(result));
  assert.equal(result.partial,true);assert.equal(result.undoAvailable,true);
  assert.equal((await history.getHistoryEntries()).length,baselineCount+1);
  assert.equal((await runtime.getBossActionPresentation("auril")).availability[ability(p2,"spell-reference")].remaining,0);
  assert.ok(meta("dars").conditions.instances.length);
  await history.undoHistoryThrough(result.historyEntryId,{sceneEpoch:currentSceneEpoch()});
  assert.equal((await runtime.getBossActionPresentation("auril")).availability[ability(p2,"spell-reference")].remaining,1);
  assert.equal((meta("dars").conditions?.instances || []).length,0);
});

test("Slow returned transport failure after commit keeps resource in the same Undo",async()=>{
  const {executeSpellAreaResolution}=await import("../src/spellAreaResolutionExecutor.js");
  const command=await preparedSlow("failed","slow-returned-transport-failure");
  const result=await executeSpellAreaResolution(command,slowRuntime({
    runEffectsMutation:async(operations,options)=>{
      const committed=await effects.runEffectsMutation(operations,options);
      effects.requireAppliedEffectsMutation(committed);
      return {status:"failed",error:{name:"BackgroundTransportError",message:"ACK lost"},changes:[],changedIds:[]};
    },
  }));
  assert.equal(result.status,"applied",JSON.stringify(result));assert.equal(result.undoAvailable,true);
  assert.equal((await history.getHistoryEntries()).length,baselineCount+1);
  const entry=(await history.getHistoryEntries()).find(e=>e.id===result.historyEntryId);
  assert.ok(entry.effectsMutation.changes.some(c=>c.id==="auril"&&c.metadataFields?.bossActionState));
  await history.undoHistoryThrough(result.historyEntryId,{sceneEpoch:currentSceneEpoch()});
  assert.equal((await runtime.getBossActionPresentation("auril")).availability[ability(p2,"spell-reference")].remaining,1);
  assert.equal((meta("dars").conditions?.instances || []).length,0);
});

test("a definitive action conflict tells the GM to reopen without claiming a commit",async()=>{
  runtime=createBossActionRuntime({api:sdk,store,postDamage:async()=>[],runMutation:async()=>({
    status:"conflict",committed:false,changes:[],changedIds:[],
  })});
  await assert.rejects(()=>resolve(p2,"attack-damage",{mode:"melee",outcome:"hit",componentAmounts:{slashing:18,cold:7}}),
    error=>error.status==="conflict" && /riapri.*azione/i.test(error.message));
  assert.equal(meta("dars").hp,60);assert.equal((await history.getHistoryEntries()).length,baselineCount);
});
