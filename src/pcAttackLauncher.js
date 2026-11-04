import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { openTrackedPopover, readStoredPosition } from "./popoverDragHost.js";
import { PC_ATTACK_MAX_HEIGHT, PC_ATTACK_MIN_HEIGHT } from "./pcAttackWindowCore.js";

export const PC_ATTACK_POPOVER_ID = `${ID}/pc-attack`;
export const PC_ATTACK_WIDTH = 380;
export const PC_ATTACK_HEIGHT = 560;
const PC_ATTACK_TOP = 60;
// The window follows its content (pcAttackWindowCore.js): it opens at the height it last had, not to jump.
const LAST_HEIGHT_KEY = `${ID}/pc-attack-last-height`;
export function rememberPcAttackHeight(height) {
  try { globalThis.localStorage?.setItem(LAST_HEIGHT_KEY, String(height)); } catch {}
}
function openingHeight() {
  try {
    const height = Number(globalThis.localStorage?.getItem(LAST_HEIGHT_KEY));
    return height >= PC_ATTACK_MIN_HEIGHT && height <= PC_ATTACK_MAX_HEIGHT ? height : PC_ATTACK_HEIGHT;
  } catch { return PC_ATTACK_HEIGHT; }
}
// Where the window's top is: where the GM dragged it, or where it opens.
export function pcAttackWindowTop() {
  try { return readStoredPosition(PC_ATTACK_POPOVER_ID)?.top ?? PC_ATTACK_TOP; } catch { return PC_ATTACK_TOP; }
}
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
    width:PC_ATTACK_WIDTH,height:openingHeight(),anchorReference:"POSITION",anchorPosition:{left:80,top:PC_ATTACK_TOP},
    anchorOrigin:{horizontal:"LEFT",vertical:"TOP"},transformOrigin:{horizontal:"LEFT",vertical:"TOP"},disableClickAway:true,
    marginThreshold:12,hidePaper:true});
}
