import assert from "node:assert/strict";
import test from "node:test";
import { buildBossActionMutation, bossInstanceForItem, isBossActionCreature } from "../src/bossActionExecutionCore.js";
import { scaledQuickHPAmount } from "../src/quickHpCore.js";

const META = "com.thebigpicture.initiative/meta";
const profile = { profileId:"auril-fase2", profileRevision:"a".repeat(64), phaseId:"fase2", bossDefinitionId:"auril" };
const binding = { ...profile };
const source = () => ({ id:"auril-token", name:"Auril", type:"IMAGE", layer:"CHARACTER", metadata:{[META]:{
  initiativeCard:{bossActionBinding:binding}, hp:580,hpMax:580, unrelated:"keep",
}} });
const target = () => ({ id:"dars",name:"Dars", type:"IMAGE",layer:"CHARACTER",position:{x:50,y:20},metadata:{[META]:{hp:60,hpMax:60,inInitiative:true,unrelated:"keep"}} });
const ice = { id:"icekiss-2",name:"Icekiss +2",category:"epic-action",automation:"SUPPORTED",rawText:"original",
execution:{kind:"attack-damage",attack:{bonus:12,modes:["melee","ranged"],reach:10,range:{normal:150,long:600}},
target:{mode:"single",maxTargets:1},damage:[{id:"slashing",formula:"2d10+7",printedAverage:18,type:"slashing"},{id:"cold",formula:"2d6",printedAverage:7,type:"cold"}]} };
const blizzard = { id:"blizzard-strike",name:"Blizzard Strike",category:"epic-action",automation:"PARTIAL",rawText:"original",
manualText:"Il bersaglio viene spinto fino a 20 ft. in una direzione scelta da Auril.",
execution:{kind:"save-damage",save:{ability:"str",dc:15},target:{mode:"single",maxTargets:1,range:60},
damage:[{id:"bludgeoning",formula:"2d8",average:9,type:"bludgeoning"},{id:"cold",formula:"2d8",average:9,type:"cold"}],success:"half"} };
const plan = (overrides={}) => buildBossActionMutation({ profile,action:ice,sourceItem:source(),targetItem:target(),mode:"melee",outcome:"hit",componentAmounts:{slashing:18,cold:7},actionInstanceId:"action-one",...overrides });

for(const mode of ["melee","ranged"]) test(`Icekiss ${mode}: separate typed components and one coordinated command`,()=>{
  const result = plan({mode});
  assert.equal(result.change.afterHP,35);
  assert.deepEqual(result.damageComponents.map(c=>[c.id,c.formula,c.type,c.amount]),[
    ["slashing","2d10+7","slashing",18],["cold","2d6","cold",7],
  ]);
  assert.equal(result.operations.length,1);
  assert.equal(result.operations[0].type,"hp:set");
  assert.deepEqual(result.operations[0].updates[0].expectedHP,{present:true,value:60});
  const cause=result.options.history.payload.causality;
  assert.deepEqual(cause.actor,{id:"auril-token",tokenId:"auril-token",name:"Auril",bossInstanceId:bossInstanceForItem(source(),profile)});
  assert.equal(cause.cause.kind,"monster-action");
  assert.equal(cause.cause.profileRevision,profile.profileRevision);
  assert.equal(cause.cause.actionInstanceId,"action-one");
  assert.equal(cause.attack.mode,mode);
  assert.equal(result.options.metadataPatches.length,2);
  assert.ok(result.options.metadataPatches[0].fields.bossActionState);
  assert.equal(result.options.metadataPatches[1].fields.initiativeCard.mode,"assert","target defenses are a commit precondition");
  assert.equal(result.options.history.kind,"monster-action");
});
test("miss records execution without HP mutation or invented damage",()=>{
  const result=plan({outcome:"miss",componentAmounts:{}});
  assert.deepEqual(result.operations,[]);
  assert.equal(result.change,null);
  assert.equal(result.damageComponents.every(c=>c.amount===0),true);
  assert.equal(result.options.history.payload.causality.attack.outcome,"miss");
  assert.equal(result.options.metadataPatches[0].fields.bossActionState.value.lastAction.outcome,"miss");
});
for(const outcome of ["failed","passed"]) test(`Blizzard ${outcome}: shared rounding, no movement command and manual remainder`,()=>{
  const result=plan({profile:{...profile,phaseId:"fase3"},action:blizzard,mode:"",outcome,componentAmounts:{bludgeoning:9,cold:9}});
  const factor=outcome==="passed"?"half":"full";
  assert.equal(result.change.requested,2*scaledQuickHPAmount(9,factor));
  assert.equal(result.damageComponents[0].amount,scaledQuickHPAmount(9,factor));
  assert.equal(result.operations.every(op=>op.type==="hp:set"),true);
  assert.equal(result.options.history.payload.causality.save.dc,15);
  assert.equal(result.manualText,outcome==="failed"?blizzard.manualText:"");
  assert.equal(Object.hasOwn(result,"position"),false);
});
test("unknown mechanics, missing decisions, wrong mode and missing HP fail before mutation",()=>{
  assert.throws(()=>plan({mode:"magic"}));
  assert.throws(()=>plan({outcome:""}));
  assert.throws(()=>plan({componentAmounts:{slashing:18}}));
  assert.throws(()=>plan({componentAmounts:{slashing:"",cold:7}}));
  assert.throws(()=>plan({action:{...ice,automation:"UNSUPPORTED",execution:undefined}}));
  const noHP=target(); delete noHP.metadata[META].hp;
  assert.throws(()=>plan({targetItem:noHP}));
  assert.throws(()=>plan({sourceItem:{...source(),id:"__EPIC__::auril-token::after::dars"}}));
});
test("duplicate token preserves definition but gets independent boss instance; rename does not change instance",()=>{
  const item=source();
  item.metadata[META].bossActionState={version:1,boundTokenId:item.id,bossDefinitionId:"auril",bossInstanceId:"instance-a"};
  assert.equal(bossInstanceForItem(item,profile),"instance-a");
  assert.equal(bossInstanceForItem({...item,name:"Renamed"},profile),"instance-a");
  assert.notEqual(bossInstanceForItem({...item,id:"duplicate"},profile),"instance-a");
  assert.equal(isBossActionCreature({...target(),attachedTo:"auril-token"}),false);
});
