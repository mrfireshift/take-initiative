// Another player's roll, replayed in 3D (docs/PIANO_DADI_ONLINE.md, lot D-4). The background's host
// (diceRollHost.js) opens this window with the roll in its URL and closes it when told the replay is over. The dice
// show the values the roller drew, in the roller's style.
import OBR from "@owlbear-rodeo/sdk";
import { diceRollDetail, normalizeDiceRollRecord } from "./diceCore.js";
import { DICE_NOTICE_DONE_CHANNEL, diceRollAuthor } from "./diceTrayCore.js";

// How long the result stays on screen once the dice stop.
const RESULT_HOLD_MS = 3500;

const $ = (id) => document.getElementById(id);
let record = null;
try { record = normalizeDiceRollRecord(JSON.parse(new URLSearchParams(location.search).get("roll") || "null")); } catch {}

let doneSent = false;
function done() {
  if (doneSent || !record) return;
  doneSent = true;
  void OBR.broadcast.sendMessage(DICE_NOTICE_DONE_CHANNEL, { id: record.id }, { destination: "LOCAL" }).catch(() => {});
}

if (record) {
  $("who").textContent = diceRollAuthor(record);
  $("formula").textContent = record.formula;
  $("formula").title = diceRollDetail(record);
  $("total").textContent = "…";
}
$("shell").addEventListener("click", done);

OBR.onReady(async () => {
  if (!record) return done();
  try {
    const { createDiceTray } = await import("./diceScene.js");
    const canvas = $("tray");
    // A hidden Owlbear tab draws no animation frames: the dice go straight to where they stop.
    const tray = await createDiceTray({ canvas, base: import.meta.env.BASE_URL || "/", reducedMotion: document.hidden ? true : null });
    tray.resize(canvas.clientWidth, canvas.clientHeight);
    await tray.roll(record, { style: record.style });
  } catch (error) {
    console.warn("[dice-notice] riproduzione:", error?.message || error);
  }
  $("total").textContent = String(record.total);
  $("formula").textContent = diceRollDetail(record);
  setTimeout(done, RESULT_HOLD_MS);
});
