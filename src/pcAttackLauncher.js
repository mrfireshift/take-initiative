import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { openTrackedPopover } from "./popoverDragHost.js";

export const PC_ATTACK_POPOVER_ID = `${ID}/pc-attack`;
export const PC_ATTACK_WIDTH = 380;
export const PC_ATTACK_HEIGHT = 560;

// Compact floating console for one attack quick action; drag and stored position come from openTrackedPopover.
// spellId: the cantrip or leveled spell the console opens with (from the spellbook or the 🪄 menu).
export async function openPcAttackPopover(sourceId, actionId, spellId = "") {
  if(!sourceId || !actionId || String(sourceId).startsWith("__") || String(sourceId).includes("::")) return;
  if(await OBR.player.getRole()!=="GM") return;
  const query=new URLSearchParams({source:String(sourceId),action:String(actionId),...(spellId?{spell:String(spellId)}:{})});
  await openTrackedPopover({id:PC_ATTACK_POPOVER_ID,url:`/pc-attack.html?${query}`,
    width:PC_ATTACK_WIDTH,height:PC_ATTACK_HEIGHT,anchorReference:"POSITION",anchorPosition:{left:80,top:60},
    anchorOrigin:{horizontal:"LEFT",vertical:"TOP"},transformOrigin:{horizontal:"LEFT",vertical:"TOP"},disableClickAway:true,
    marginThreshold:12,hidePaper:true});
}
