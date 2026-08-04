const LAIR_ID = "__LAIR__";
const EPIC_PREFIX = "__EPIC__";

function entryForId(id, entriesById) {
  const direct = entriesById?.get?.(id);
  if (direct) return direct;
  const baseId = String(id || "").split("::p")[0];
  return entriesById?.get?.(baseId) || null;
}

function entryName(id, entriesById) {
  const entry = entryForId(id, entriesById);
  const rawName = String(entry?.name || "").trim();
  if (id === LAIR_ID) return rawName || "Azioni di Tana";
  if (String(id || "").startsWith(EPIC_PREFIX)) {
    return rawName ? rawName + " (Azione Epica)" : "Azione Epica";
  }
  if (rawName) return rawName;

  return "Creatura";
}

export function buildTurnNoticePayload(state, entriesById) {
  const order = Array.isArray(state?.order) ? state.order.filter(Boolean) : [];
  if (!order.length) return null;
  const current = Math.max(0, Math.min(order.length - 1, Math.floor(Number(state?.current) || 0)));
  const currentId = order[current];
  const nextId = order[(current + 1) % order.length];
  const currentEntry = entryForId(currentId, entriesById);
  const portrait = String(currentEntry?.portrait || "").trim();
  const round = Math.max(1, Math.floor(Number(state?.round) || 1));
  return {
    currentId,
    nextId,
    currentName: entryName(currentId, entriesById),
    nextName: entryName(nextId, entriesById),
    currentPortrait: portrait.length <= 2048 ? portrait : "",
    currentAttitude: String(currentEntry?.attitude || "neutral").trim().toLowerCase(),
    round,
    turnKey: `${round}:${current}:${currentId}`,
  };
}

export function isInitiativeTurnTransition(previousState, nextState) {
  const previousOrder = Array.isArray(previousState?.order)
    ? previousState.order.filter(Boolean)
    : [];
  const nextOrder = Array.isArray(nextState?.order)
    ? nextState.order.filter(Boolean)
    : [];
  if (
    !previousOrder.length
    || previousOrder.length !== nextOrder.length
    || previousOrder.some((id, index) => id !== nextOrder[index])
  ) {
    return false;
  }
  const previousCurrent = Math.max(
    0,
    Math.min(
      previousOrder.length - 1,
      Math.floor(Number(previousState?.current) || 0),
    ),
  );
  const nextCurrent = Math.max(
    0,
    Math.min(
      nextOrder.length - 1,
      Math.floor(Number(nextState?.current) || 0),
    ),
  );
  return previousOrder[previousCurrent] !== nextOrder[nextCurrent];
}

export function isTurnNoticeForScene(payload, sceneEpoch, sceneReady = true) {
  return sceneReady === true && Number(payload?.sceneEpoch) === Number(sceneEpoch);
}
