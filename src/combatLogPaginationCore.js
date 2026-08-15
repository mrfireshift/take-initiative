export function createCombatLogPageState(sessionId = "") {
  return {
    sessionId: String(sessionId || ""),
    events: new Map(),
    totalCount: 0,
    hasOlder: false,
    hasNewer: false,
  };
}

export function resetCombatLogPageState(state, sessionId = "") {
  state.sessionId = String(sessionId || "");
  state.events.clear();
  state.totalCount = 0;
  state.hasOlder = false;
  state.hasNewer = false;
  return state;
}

export function mergeCombatLogPageState(
  state,
  session,
  page,
  { loadAll = false, requestedDirection = "backward" } = {},
) {
  const sessionId = String(session?.id || "");
  if (state.sessionId !== sessionId) resetCombatLogPageState(state, sessionId);
  if (!sessionId) return [];
  const incoming = Array.isArray(page?.events) ? page.events : [];
  if (page?.totalCount === 0) state.events.clear();
  for (const event of incoming) {
    const key = String(event?.id || `sequence:${event?.sequence}`);
    if (key) state.events.set(key, event);
  }
  state.totalCount = loadAll
    ? state.events.size
    : Math.max(0, Number(page?.totalCount) || 0);
  if (loadAll) {
    state.hasOlder = false;
    state.hasNewer = false;
  } else if (requestedDirection === "backward" && page) {
    if (state.events.size === incoming.length || page.hasOlder === false) {
      state.hasOlder = page.hasOlder === true;
    } else if (page.hasOlder === true) {
      state.hasOlder = true;
    }
    state.hasNewer = page.hasNewer === true;
  }
  return [...state.events.values()]
    .sort((left, right) => Number(left?.sequence) - Number(right?.sequence));
}

export function getCombatLogPageControlState(
  state,
  { loading = false, storageAction = false } = {},
) {
  const disabled = loading || storageAction;
  const loadedCount = state.events.size;
  return {
    loadedCount,
    loadOlderDisabled: !state.hasOlder || disabled,
    loadAllDisabled: state.totalCount <= loadedCount || disabled,
  };
}

export function getCombatLogTimelineWindow(events, limit = 250) {
  const allEvents = Array.isArray(events) ? events : [];
  const safeLimit = Math.max(1, Math.floor(Number(limit)) || 1);
  const visibleEvents = allEvents.length > safeLimit
    ? allEvents.slice(-safeLimit)
    : allEvents;
  return {
    events: visibleEvents,
    totalCount: allEvents.length,
    hasMore: visibleEvents.length < allEvents.length,
  };
}
