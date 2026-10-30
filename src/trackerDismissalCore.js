// A player's tracker closed by hand (audit online, O2a). In the Online room profile it stays closed until the GM
// opens the tracker again (a new `at` in the shared UI record) or a combat starts; the Table profile never reads it,
// so the table screen follows the GM as always. Pure: the storage and the SDK are the callers'.
import { ID } from "./constants.js";

export const TRACKER_DISMISSAL_KEY = `${ID}/tracker-player-dismissed`;

export function normalizeTrackerDismissal(value) {
  if (!value || typeof value !== "object") return null;
  const gmOpenAt = Number(value.gmOpenAt);
  return { gmOpenAt: Number.isFinite(gmOpenAt) ? gmOpenAt : 0 };
}

// The dismissal remembers which opening of the GM the player closed.
export function trackerDismissalFor(sharedUi) {
  return { gmOpenAt: Number(sharedUi?.at) || 0 };
}

// Whether the GM's open tracker must stay closed on this player's screen.
export function keepsTrackerDismissed({ online, dismissal, sharedUi }) {
  const current = normalizeTrackerDismissal(dismissal);
  if (!online || !current || !sharedUi?.open) return false;
  return current.gmOpenAt === (Number(sharedUi.at) || 0);
}

// A combat starts when the initiative order goes from empty to not empty; the first reading only sets the baseline.
export function combatStarted(previousOrderLength, nextOrderLength) {
  return previousOrderLength === 0 && nextOrderLength > 0;
}

export function readTrackerDismissal(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(TRACKER_DISMISSAL_KEY);
    return raw ? normalizeTrackerDismissal(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function writeTrackerDismissal(dismissal, storage = globalThis.localStorage) {
  try {
    if (dismissal) storage?.setItem(TRACKER_DISMISSAL_KEY, JSON.stringify(normalizeTrackerDismissal(dismissal)));
    else storage?.removeItem(TRACKER_DISMISSAL_KEY);
  } catch {}
}
