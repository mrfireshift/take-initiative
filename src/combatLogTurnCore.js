function canUseEpoch(isCurrent, sceneEpoch) {
  return typeof isCurrent !== "function" || isCurrent(sceneEpoch);
}

export async function recordCombatTurnForEpoch({
  state,
  sceneEpoch,
  isCurrent,
  ensureSession,
  getStoredSession,
  resolveTurn,
  appendEvents,
} = {}) {
  if (!state || !Array.isArray(state.order) || !state.order.length) return [];
  if (!canUseEpoch(isCurrent, sceneEpoch)) return [];

  const session = await ensureSession({ sceneEpoch, isCurrent });
  if (!canUseEpoch(isCurrent, sceneEpoch) || !session) return [];

  const round = Math.max(1, Number(state.round) || 1);
  const activeId = String(state.order[state.current] || "");
  const turnKey = `${round}:${activeId}`;
  const latest = (await getStoredSession(session.id, { sceneEpoch, isCurrent })) || session;
  if (!canUseEpoch(isCurrent, sceneEpoch)) return [];
  if (latest.lastTurnKey === turnKey) return [];

  const turn = await resolveTurn(activeId, { sceneEpoch, isCurrent });
  if (!canUseEpoch(isCurrent, sceneEpoch)) return [];

  const inputs = [];
  if (Number(latest.lastRound) !== round) {
    inputs.push({
      source: "automatic",
      round,
      turn,
      kind: "round",
      action: "start",
      label: `Inizio Round ${round}`,
      targets: [],
      payload: {},
    });
  }
  inputs.push({
    source: "automatic",
    round,
    turn,
    kind: "turn",
    action: "start",
    label: `Turno di ${turn?.name || "Token"}`,
    targets: turn ? [turn] : [],
    payload: { actorId: activeId, actorName: turn?.name || "Token" },
  });

  if (!canUseEpoch(isCurrent, sceneEpoch)) return [];
  const created = await appendEvents(
    session.id,
    inputs,
    { lastRound: round, lastTurnKey: turnKey },
    { sceneEpoch, isCurrent },
  );
  return canUseEpoch(isCurrent, sceneEpoch) ? created : [];
}
