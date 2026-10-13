import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { openTrackedPopover } from "./popoverDragHost.js";
import { BOSS_ACTIONS_WIDTH, BOSS_ACTIONS_HEIGHT } from "./bossActionsViewCore.js";

// Compact floating console; drag and stored position come from openTrackedPopover / popoverDrag.

export async function openBossActionsPopover(sourceId) {
  if(!sourceId || String(sourceId).startsWith("__") || String(sourceId).includes("::")) return;
  if(await OBR.player.getRole()!=="GM") return;
  await openTrackedPopover({id:`${ID}/boss-actions`,url:`/boss-actions.html?source=${encodeURIComponent(sourceId)}`,
    width:BOSS_ACTIONS_WIDTH,height:BOSS_ACTIONS_HEIGHT,anchorReference:"POSITION",anchorPosition:{left:80,top:60},
    anchorOrigin:{horizontal:"LEFT",vertical:"TOP"},transformOrigin:{horizontal:"LEFT",vertical:"TOP"},disableClickAway:true,
    marginThreshold:12,hidePaper:true});
}
