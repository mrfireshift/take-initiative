// "Annulla" for the tracker's two header resets (decision D3): what to save before them and what to write back.
// Pure: the tracker reads the state, writes the patch through setSceneState and restores the tokens' flags.

// The fields "Svuota iniziativa" resets (resetTrackerState); the other state fields are left as they are.
export const CLEARED_INITIATIVE_STATE_FIELDS = Object.freeze(["order", "current", "round", "seededGroups"]);

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function roundOf(state) {
  return Math.max(1, Math.floor(Number(state?.round) || 1));
}

// Before "Svuota iniziativa": the tokens it takes out and the turn state it resets. Null when there is nothing to undo.
export function clearedInitiativeSnapshot(state, itemIds = []) {
  const ids = [...new Set((Array.isArray(itemIds) ? itemIds : []).map((id) => String(id || "").trim()).filter(Boolean))];
  const order = Array.isArray(state?.order) ? state.order.filter(Boolean) : [];
  if (!ids.length && !order.length) return null;
  return Object.freeze({
    itemIds: Object.freeze(ids),
    state: Object.freeze({
      order: clone(order),
      current: Math.max(0, Math.floor(Number(state?.current) || 0)),
      round: roundOf(state),
      seededGroups: clone(state?.seededGroups && typeof state.seededGroups === "object" ? state.seededGroups : {}),
    }),
  });
}

// The state to write back, or null when a new combat has started since: the order is no longer empty.
export function clearedInitiativeRestorePatch(currentState, snapshot) {
  if (!snapshot?.state) return null;
  const order = Array.isArray(currentState?.order) ? currentState.order.filter(Boolean) : [];
  if (order.length) return null;
  return {
    ...(currentState || {}),
    order: clone(snapshot.state.order),
    current: snapshot.state.current,
    round: snapshot.state.round,
    seededGroups: clone(snapshot.state.seededGroups),
  };
}

// "Reset round" only changes the round: undo puts it back while it is still 1. Null when there is nothing to do.
export function roundResetRestorePatch(currentState, previousRound) {
  const round = Math.max(1, Math.floor(Number(previousRound) || 1));
  if (round <= 1 || roundOf(currentState) !== 1) return null;
  return { ...(currentState || {}), round };
}
