// The menu «Schermo» of a player in the Online room profile (audit online, lot O2b): opened from the player's tracker,
// it writes this browser's local options only (playerScreenCore.js).
import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { runtimeOptionsService, startRuntimeOptions } from "./options/optionsRuntime.js";
import { selectOptionsPanelModel, selectPlayerScreenPreferences } from "./options/optionsSelectors.js";
import {
  applyPlayerScreenChange,
  playerScreenScaleChoices,
  playerScreenScaleValue,
} from "./playerScreenCore.js";

const POPOVER_ID = `${ID}/player-screen`;
const follow = document.getElementById("playerScreenFollow");
const scale = document.getElementById("playerScreenScale");
const animations = document.getElementById("playerScreenAnimations");

for (const choice of playerScreenScaleChoices()) {
  const option = document.createElement("option");
  option.value = choice.value;
  option.textContent = choice.label;
  scale.appendChild(option);
}

function render(preferences) {
  follow.checked = preferences.follow;
  scale.value = playerScreenScaleValue(preferences.scale);
  // The room's switch comes first: a player cannot turn on what the GM turned off.
  let roomAnimations = true;
  try { roomAnimations = runtimeOptionsService.get(selectOptionsPanelModel).room.embersAnimations !== false; } catch {}
  animations.disabled = !roomAnimations;
  animations.checked = roomAnimations && preferences.animations;
  animations.title = roomAnimations ? "" : "Il GM ha spento le animazioni per tutta la stanza";
}

function save(change) {
  void runtimeOptionsService.updateLocal((current) => applyPlayerScreenChange(current, change)).catch((error) => {
    console.warn("[player-screen] preferenza non salvata:", error?.message || error);
    void OBR.notification.show("Preferenza non salvata: riprova.", "WARNING").catch(() => {});
  });
}

follow.addEventListener("change", () => save({ follow: follow.checked }));
scale.addEventListener("change", () => save({ scale: scale.value }));
animations.addEventListener("change", () => save({ animations: animations.checked }));
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") void OBR.popover.close(POPOVER_ID).catch(() => {});
});

OBR.onReady(async () => {
  await startRuntimeOptions().catch(() => {});
  runtimeOptionsService.subscribe(selectPlayerScreenPreferences, render);
  follow.focus();
});
