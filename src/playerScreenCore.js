// The menu «Schermo» of a player in the Online room profile (audit online, lot O2b): the player's own Segui, tracker
// size and spell animations, kept in this browser's local options. They only take away from what the room allows:
// the animations stay off when the room turns them off, and the Table profile reads none of them.
import { normalizeTrackerScale, TRACKER_SCALE_CHOICES } from "./trackerScaleCore.js";

export const PLAYER_SCREEN_SCALE_ROOM = "room";

export function playerScreenScaleChoices() {
  return [
    { value: PLAYER_SCREEN_SCALE_ROOM, label: "Come la stanza" },
    ...TRACKER_SCALE_CHOICES.map((scale) => ({ value: String(scale), label: `${Math.round(scale * 100)}%` })),
  ];
}

export function playerScreenScaleValue(scale) {
  return scale === null || scale === undefined ? PLAYER_SCREEN_SCALE_ROOM : String(normalizeTrackerScale(scale));
}

// The local options document after one change of the menu: { follow }, { scale } or { animations }.
export function applyPlayerScreenChange(current, change) {
  const local = current && typeof current === "object" ? current : {};
  const tracker = { ...(local.tracker || {}) };
  const runtime = { ...(local.runtime || {}) };
  if (Object.hasOwn(change || {}, "follow")) tracker.playerFollowActiveTurn = change.follow === true;
  if (Object.hasOwn(change || {}, "scale")) {
    tracker.playerScale = change.scale === PLAYER_SCREEN_SCALE_ROOM || change.scale === null
      ? null
      : normalizeTrackerScale(change.scale);
  }
  if (Object.hasOwn(change || {}, "animations")) runtime.playerAnimations = change.animations !== false;
  return { ...local, tracker, runtime };
}
