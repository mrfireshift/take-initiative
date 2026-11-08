// Avvisi di reazione, lot R5 (docs/STUDIO_AVVISI_REAZIONE.md §6.16): the GM's popover after a movement. The same prompt
// as the consoles (reactionPromptView.js, "after": the movement happened), so the characters' rows reach the players'
// screens too (lot R6). Usa on Opportunity Attack opens the attack console off turn for the reacting creature, the
// mover selected (the flow of lot R3c: Registra spends the reaction); Halo of Spores uses its feature. It closes with
// Ignora, after Usa, or when the turn changes (J5).
import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { reactionTurnKey } from "./opportunityAttackCore.js";
import { createReactionPrompt } from "./reactionPromptView.js";
import { createReactionPromptOption } from "./reactionPromptOption.js";

const POPOVER_ID = `${ID}/reaction-move`;
const STATE_KEY = `${ID}/state`;
const box = document.getElementById("reaction-move");
const status = document.getElementById("reaction-move-status");
const params = new URLSearchParams(location.search);
let events = [];
try { events = JSON.parse(params.get("events") || "[]"); } catch { events = []; }
const turnKey = String(params.get("turn") || "");
let closing = false;

function close(delay = 0) {
  if (closing) return;
  closing = true;
  setTimeout(() => { void OBR.popover.close(POPOVER_ID).catch(() => {}); }, delay);
}
function say(message, state = "ok") {
  if (!status) return;
  status.textContent = message;
  status.dataset.state = state;
  status.hidden = !message;
}

async function onUse(candidate) {
  if (candidate.flow === "off-turn-attack") {
    const moverId = (candidate.targetIds || [])[0];
    if (moverId) await Promise.resolve(OBR.player.select([moverId], true)).catch(() => {});
    const { openPcAttackConsoleForActor } = await import("./pcAttackLauncher.js");
    await openPcAttackConsoleForActor(candidate.reactorId);
    say(`${candidate.reactorName} · ${candidate.label}: nella console attacchi, fuori turno.`);
    close(1200);
    return;
  }
  const { useReactionFeature } = await import("./reactionFeatureRuntime.js");
  const result = await useReactionFeature({ sourceId: candidate.reactorId, featureId: candidate.featureId,
    monster: candidate.source === "monster", label: candidate.label });
  if (!result.ok) { say(result.message, "error"); close(4000); return; }
  say(`${candidate.reactorName} · ${candidate.label}: reazione segnata. ${candidate.rule}`);
  close(2500);
}

OBR.onReady(async () => {
  if (!box || !Array.isArray(events) || !events.length) { close(); return; }
  const [items, metadata] = await Promise.all([OBR.scene.items.getItems(), OBR.scene.getMetadata()]);
  const state = metadata?.[STATE_KEY] || null;
  if (turnKey && reactionTurnKey(state) !== turnKey) { close(); return; }
  // The options read before the prompt: the switches decide what it shows at once (Movimento is off by default).
  const option = createReactionPromptOption();
  await option.subscribe(() => {});
  const prompt = createReactionPrompt(box, { documentRef: document, onUse, option, buttonClass: "reaction-prompt-button", ignoreHint: "",
    onRender: (shown) => { if (!shown && !closing && !status?.textContent) close(); } });
  prompt.showAfter({ event: events, items, state, draftKey: `move|${params.get("at") || ""}` });
  if (!prompt.current().length) { close(); return; }
  // J5: a new turn closes it.
  OBR.scene.onMetadataChange((next) => {
    if (reactionTurnKey(next?.[STATE_KEY]) !== turnKey) { prompt.destroy(); close(); }
  });
  window.addEventListener("pagehide", () => prompt.destroy(), { once: true });
});
