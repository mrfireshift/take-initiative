import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { openTrackedPopover } from "./popoverDragHost.js";

export const PC_ATTACK_POPOVER_ID = `${ID}/pc-attack`;
export const PC_ATTACK_WIDTH = 380;
export const PC_ATTACK_HEIGHT = 560;
// The console answers a ping on this channel while it is open (pcAttackTurnController.js never reloads an open one).
export const PC_ATTACK_CONSOLE_CHANNEL = `${ID}/pc-attack-console`;
// The console asks the tracker to launch a spell of the book, as the 🪄 menu does (initiativeList.js answers).
export const PC_ATTACK_SPELL_LAUNCH_CHANNEL = `${ID}/pc-attack-spell-launch`;

// Compact floating console for one attack quick action; drag and stored position come from openTrackedPopover.
// spellId: the cantrip or leveled spell the console opens with (from the spellbook or the 🪄 menu).
export async function openPcAttackPopover(sourceId, actionId, spellId = "") {
  if(!sourceId || !actionId || String(sourceId).startsWith("__") || String(sourceId).includes("::")) return;
  if(await OBR.player.getRole()!=="GM") return;
  const query=new URLSearchParams({source:String(sourceId),action:String(actionId),...(spellId?{spell:String(spellId)}:{})});
  await openPcAttackQuery(query);
}

// The console for the actor's turn (pcAttackTurnController.js): no action, the console opens on the last attack.
export async function openPcAttackConsoleForActor(sourceId) {
  if(!sourceId || String(sourceId).startsWith("__") || String(sourceId).includes("::")) return;
  if(await OBR.player.getRole()!=="GM") return;
  await openPcAttackQuery(new URLSearchParams({source:String(sourceId)}));
}

async function openPcAttackQuery(query) {
  await openTrackedPopover({id:PC_ATTACK_POPOVER_ID,url:`/pc-attack.html?${query}`,
    width:PC_ATTACK_WIDTH,height:PC_ATTACK_HEIGHT,anchorReference:"POSITION",anchorPosition:{left:80,top:60},
    anchorOrigin:{horizontal:"LEFT",vertical:"TOP"},transformOrigin:{horizontal:"LEFT",vertical:"TOP"},disableClickAway:true,
    marginThreshold:12,hidePaper:true});
}
