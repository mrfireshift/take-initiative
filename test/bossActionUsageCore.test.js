import assert from "node:assert/strict";
import test from "node:test";
const core=await import("../src/bossActionUsageCore.js").catch(()=>({}));
const action={id:"blizzard-strike",usage:{limit:1,period:"round"}};
test("round usage starts available and consumption blocks only that round",()=>{
  assert.equal(typeof core.bossActionUsageAvailability,"function");
  const initial={version:1,bossInstanceId:"boss"};
  assert.equal(core.bossActionUsageAvailability(action,initial,{phaseId:"fase3",round:1}).remaining,1);
  const next=core.consumeBossActionUsage(action,initial,{phaseId:"fase3",round:1});
  assert.equal(core.bossActionUsageAvailability(action,next,{phaseId:"fase3",round:1}).available,false);
  assert.equal(core.bossActionUsageAvailability(action,next,{phaseId:"fase3",round:2}).available,true);
  assert.equal(initial.usageState,undefined);
});
test("phase use survives revision rebind and round changes but another phase is independent",()=>{
  const limited={id:"gather",usage:{limit:1,period:"phase"}};
  const next=core.consumeBossActionUsage(limited,{}, {phaseId:"fase2",round:1});
  assert.equal(core.bossActionUsageAvailability(limited,next,{phaseId:"fase2",round:20}).remaining,0);
  assert.equal(core.bossActionUsageAvailability(limited,next,{phaseId:"fase3",round:20}).remaining,1);
  assert.throws(()=>core.consumeBossActionUsage(limited,next,{phaseId:"fase2",round:20}),/esaurit/i);
});
test("round rewind preserves previous round consumption rather than granting extra uses",()=>{
  let state=core.consumeBossActionUsage(action,{}, {phaseId:"fase3",round:1});
  state=core.consumeBossActionUsage(action,state, {phaseId:"fase3",round:2});
  assert.equal(core.bossActionUsageAvailability(action,state,{phaseId:"fase3",round:1}).remaining,0);
});
test("round resources require a canonical positive integer round",()=>{
  for(const round of [null,undefined,0,1.5,"1"]){
    assert.throws(()=>core.consumeBossActionUsage(action,{}, {phaseId:"fase3",round}),/round/i);
  }
});
test("unlimited actions do not create counters and per-day/recharge remain manual",()=>{
  assert.deepEqual(core.consumeBossActionUsage({id:"ray",usage:{}},{kept:1},{phaseId:"fase3"}),{kept:1});
  assert.equal(core.bossActionUsageAvailability({id:"day",usage:{limit:3,period:"day"}},{},{phaseId:"fase3"}).tracked,false);
  assert.equal(core.bossActionUsageAvailability({id:"breath",usage:{note:"Special Recharge"}},{},{phaseId:"fase3"}).tracked,false);
});

test("malformed existing usage state fails closed",()=>{
  for(const usageState of [null,{version:2,rounds:{},phases:{}},{version:1,rounds:[],phases:{}},{version:1,rounds:{"1":{"bad":-1}},phases:{}}]){
    assert.throws(()=>core.bossActionUsageAvailability(action,{usageState},{phaseId:"fase3",round:1}),/valid/i);
  }
});

test("a new use keeps only the current and the previous round; the summary flags rounds after the current one",()=>{
  let state=core.consumeBossActionUsage(action,{}, {phaseId:"fase3",round:4});
  state=core.consumeBossActionUsage(action,state,{phaseId:"fase3",round:5});
  assert.deepEqual(core.bossActionUsageSummary(state,2),{valid:true,rounds:[4,5],futureRounds:[4,5],phaseUses:0,markUses:0,total:2},
    "a later combat back at round 2 sees rounds 4 and 5 as leftovers");
  state=core.consumeBossActionUsage(action,state,{phaseId:"fase3",round:2});
  assert.deepEqual(Object.keys(state.usageState.rounds),["2"],"leftover rounds 4 and 5 are dropped by the next use");
  state=core.consumeBossActionUsage({id:"gather",usage:{limit:1,period:"phase"}},{...state,markUses:{dars:2}},{phaseId:"fase2",round:3});
  assert.deepEqual(Object.keys(state.usageState.rounds),["2"],"a phase use in round 3 keeps round 2 and adds no round entry");
  assert.deepEqual(core.bossActionUsageSummary(state,3),{valid:true,rounds:[2],futureRounds:[],phaseUses:1,markUses:1,total:3});
  assert.equal(core.bossActionUsageSummary({usageState:{version:9}},1).valid,false);
});
