import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { importBossActionHTML } from "../src/bossActionProfileCore.js";
import { createMonsterActionContext } from "../src/monsterActionContextCore.js";
import { buildSpellUnifiedPanelRouteQuery,routeSpellUnifiedPanelOpenRequest } from "../src/spellUnifiedPanelRoutingCore.js";
import { createSpellPanelSession,updateSpellPanelSession,buildSpellPanelViewModel } from "../src/spellUnifiedPanelCore.js";
import { buildSpellUnifiedAreaCommand } from "../src/spellUnifiedAreaAdapter.js";
const profile=await importBossActionHTML(await readFile(new URL("./fixtures/boss-actions/auril-phase-2.html",import.meta.url),"utf8"));
const action=profile.abilities.find(a=>a.execution?.kind==="spell-reference");
const context=createMonsterActionContext({profile,action,bossInstanceId:"instance",tokenId:"auril",actorName:"Auril",actionInstanceId:"action-slow"});
const query=buildSpellUnifiedPanelRouteQuery({sourceId:"auril",casterId:"auril",spellId:"slow",monsterActionContext:context});
const route=routeSpellUnifiedPanelOpenRequest(Object.fromEntries(query));
test("actual spell session normalization and user edits preserve Spellcasting provenance",()=>{
  let session=createSpellPanelSession({contract:route.contract,...route.session});
  assert.deepEqual(session.monsterActionContext,context);
  session=updateSpellPanelSession(session,{targetIds:["dars"],outcomes:{dars:"failed"},slotLevel:3});
  assert.deepEqual(session.monsterActionContext,context);
  const command=buildSpellUnifiedAreaCommand({contract:route.contract,session,source:{commandId:"action-slow"}});
  assert.deepEqual(command.monsterActionContext,context);
});
test("a boss spell session refuses another caster or spell instead of silently losing the action",()=>{
  const session=createSpellPanelSession({contract:route.contract,...route.session});
  assert.throws(()=>updateSpellPanelSession(session,{casterId:"dars"}),/monster-action-context-invalid/);
  assert.throws(()=>updateSpellPanelSession(session,{spellId:"fireball"}),/monster-action-context-invalid/);
});

test("a completed monster spell action stays single-use through edits, reset and Undo",()=>{
  let session=createSpellPanelSession({contract:route.contract,...route.session});
  session=updateSpellPanelSession(session,{monsterActionCompleted:true,commitState:{state:"committed",activationId:"history-slow"}});
  for(const patch of [{},{commitState:{state:"idle"},targetIds:[]},{undoState:{state:"undone",available:false}}]){
    session=updateSpellPanelSession(session,patch);
    const model=buildSpellPanelViewModel(route.contract,session);
    assert.equal(model.primaryAction.disabled,true);
    assert.match(model.primaryAction.label,/riapri Spellcasting/);
  }
});
