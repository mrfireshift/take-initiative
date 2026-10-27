import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { openTrackedPopover } from "./popoverDragHost.js";
import { BOSS_ACTIONS_WIDTH, BOSS_ACTIONS_HEIGHT } from "./bossActionsViewCore.js";

// Compact floating console; drag and stored position come from openTrackedPopover / popoverDrag.
// Boss Actions answers a ping on this channel while it is open (with its boss and whether it is idle): the turn
// controller (pcAttackTurnController.js) never reloads an open one, and closes an idle one when the boss's turn ends.
export const BOSS_ACTIONS_CONSOLE_CHANNEL = `${ID}/boss-actions-console`;
export const BOSS_ACTIONS_POPOVER_ID = `${ID}/boss-actions`;

export async function openBossActionsPopover(sourceId) {
  if(!sourceId || String(sourceId).startsWith("__") || String(sourceId).includes("::")) return;
  if(await OBR.player.getRole()!=="GM") return;
  await openTrackedPopover({id:BOSS_ACTIONS_POPOVER_ID,url:`/boss-actions.html?source=${encodeURIComponent(sourceId)}`,
    width:BOSS_ACTIONS_WIDTH,height:BOSS_ACTIONS_HEIGHT,anchorReference:"POSITION",anchorPosition:{left:80,top:60},
    anchorOrigin:{horizontal:"LEFT",vertical:"TOP"},transformOrigin:{horizontal:"LEFT",vertical:"TOP"},disableClickAway:true,
    marginThreshold:12,hidePaper:true});
}
