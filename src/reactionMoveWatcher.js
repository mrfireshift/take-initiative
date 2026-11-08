// Avvisi di reazione, lot R5 (docs/STUDIO_AVVISI_REAZIONE.md §6.16, decisions J1-J5): the GM's client watches the
// movement segments history.js already makes (teleports, Undo and the plugin's own moves are left out there), gathers
// those of one movement and, once the token stops, asks the reaction engine who can react: Opportunity Attack when it
// leaves a reach, Halo of Spores when it comes within 3 m. Only the creature whose turn it is (J1), only with the
// "Movimento" switch on (off by default, D3). It writes nothing: it opens the GM's popover (reaction-move.html).
import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { activeTurnCreatureId, movementReactionEvents, reactionTurnKey } from "./opportunityAttackCore.js";
import { loadReactionSceneGrid } from "./reactionSceneContext.js";
import { createReactionPromptOption } from "./reactionPromptOption.js";
import { reactionPromptCandidates } from "./reactionPromptView.js";

export const REACTION_MOVE_POPOVER_ID = `${ID}/reaction-move`;
const STATE_KEY = `${ID}/state`;
const SETTLE_MS = 700;
const POPOVER_WIDTH = 400;

const pending = new Map();
let optionStore = null;
let optionsReady = null;
let options = null;

function readOptions() {
  if (!optionsReady) {
    optionStore = createReactionPromptOption();
    optionsReady = Promise.resolve(optionStore.subscribe((value) => { options = value; })).catch(() => null);
  }
  return optionsReady.then(() => options);
}

// The popover's height for its rows (header, a row each, footer).
export function reactionMovePopoverHeight(rowCount) {
  return 52 + Math.max(1, Math.min(6, Math.floor(Number(rowCount) || 1))) * 44 + 34;
}

async function settle(itemId) {
  const entry = pending.get(itemId);
  pending.delete(itemId);
  if (!entry || entry.points.length < 2) return;
  const opts = await readOptions();
  if (!opts?.enabled || !opts?.triggers?.move) return;
  const [items, metadata] = await Promise.all([OBR.scene.items.getItems(), OBR.scene.getMetadata()]);
  const state = metadata?.[STATE_KEY] || null;
  if (activeTurnCreatureId(state) !== itemId) return;
  const mover = items.find((item) => item.id === itemId);
  const order = new Set((Array.isArray(state?.order) ? state.order : []).map((id) => String(id || "").replace(/::p\d+$/u, "")));
  const others = items.filter((item) => item.id !== itemId && order.has(item.id));
  const distance = await loadReactionSceneGrid(OBR, { squares: true });
  const events = movementReactionEvents({ mover, path: entry.points, others, distance });
  if (!events.length) return;
  const candidates = reactionPromptCandidates({ event: events, items, state, options: opts }, "after");
  if (!candidates.length) return;
  const [width, height] = await Promise.all([
    Promise.resolve(OBR.viewport.getWidth()).catch(() => 1200),
    Promise.resolve(OBR.viewport.getHeight()).catch(() => 800),
  ]);
  const query = new URLSearchParams({ events: JSON.stringify(events), turn: reactionTurnKey(state), at: String(entry.startedAt) });
  await OBR.popover.open({
    id: REACTION_MOVE_POPOVER_ID,
    url: `/reaction-move.html?${query}`,
    width: POPOVER_WIDTH,
    height: reactionMovePopoverHeight(candidates.length),
    anchorReference: "POSITION",
    anchorPosition: { left: (Number(width) || 1200) - 16, top: (Number(height) || 800) - 16 },
    anchorOrigin: { horizontal: "RIGHT", vertical: "BOTTOM" },
    transformOrigin: { horizontal: "RIGHT", vertical: "BOTTOM" },
    hidePaper: true,
    disableClickAway: true,
    marginThreshold: 8,
  });
}

// The handler of subscribeMovementSegments (history.js), next to the Speed Tracker's: the segments of one movement
// gathered until the token stops (with the Movimento tool, one per square: J2).
export function handleReactionMoveSegments(changes) {
  for (const change of Array.isArray(changes) ? changes : []) {
    const id = String(change?.id || "");
    if (!id) continue;
    if (change.undo === true || change.relocation === true) {
      const entry = pending.get(id);
      if (entry) clearTimeout(entry.timer);
      pending.delete(id);
      continue;
    }
    let entry = pending.get(id);
    if (!entry) {
      entry = { points: [change.beforePosition], timer: null, startedAt: Date.now() };
      pending.set(id, entry);
    }
    entry.points.push(change.afterPosition);
    clearTimeout(entry.timer);
    entry.timer = setTimeout(() => {
      void settle(id).catch((error) => console.warn("[reaction-move] settle:", error?.message || error));
    }, SETTLE_MS);
  }
}
