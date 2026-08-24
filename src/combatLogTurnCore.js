import {
  nextCombatLogOrderRevision,
} from "./combatLogV3Core.js";

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
  resolveRoster,
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
  const orderRevisionState = nextCombatLogOrderRevision(latest, state.order);
  const orderChanged = Object.prototype.hasOwnProperty.call(latest || {}, "orderSignature")
    && latest.orderSignature !== orderRevisionState.orderSignature;
  if (latest.lastTurnKey === turnKey && !orderChanged) return [];

  const turn = await resolveTurn(activeId, { sceneEpoch, isCurrent });
  if (!canUseEpoch(isCurrent, sceneEpoch)) return [];

  const turnContext = {
    activeId: activeId || null,
    activeName: turn?.name || null,
    turnIndex: Number.isFinite(Number(state.current)) ? Number(state.current) : null,
    turnKey,
    orderRevision: orderRevisionState.orderRevision,
  };

  let rosterInitialCandidate = null;
  let orderSnapshot = null;
  if ((!latest?.roster?.initial || orderChanged) && typeof resolveRoster === "function") {
    const rosterSnapshot = await resolveRoster(state, {
      sceneEpoch,
      isCurrent,
      capturedAtSequence: Number(latest?.nextSequence) || null,
      orderRevision: orderRevisionState.orderRevision,
    });
    if (!canUseEpoch(isCurrent, sceneEpoch)) return [];
    if (!latest?.roster?.initial) rosterInitialCandidate = rosterSnapshot;
    if (orderChanged && rosterSnapshot) {
      // The turn event must remain idempotent across concurrent recorders:
      // capture timestamps belong to the session snapshot, not the dedupe key.
      orderSnapshot = {
        orderRevision: orderRevisionState.orderRevision,
        orderIds: Array.isArray(rosterSnapshot.orderIds) ? rosterSnapshot.orderIds : [],
        entries: Array.isArray(rosterSnapshot.entries) ? rosterSnapshot.entries : [],
      };
    }
  }

  const inputs = [];
  if (Number(latest.lastRound) !== round) {
    inputs.push({
      source: "automatic",
      round,
      turn,
      kind: "round",
      action: "start",
      label: `Inizio Round ${round}`,
      // The turn recorder can run in more than one Owlbear runtime. Keep the
      // storage identity stable so a retry/concurrent recorder is a no-op.
      dedupeKey: `round:${round}`,
      targets: [],
      payload: {},
      version: 3,
      turnContext,
      provenance: {
        recordingSource: "turn-recorder",
        actor: null,
        cause: null,
      },
    });
  }
  inputs.push({
    source: "automatic",
    round,
    turn,
    kind: "turn",
    action: "start",
    label: `Turno di ${turn?.name || "Token"}`,
    // lastTurnKey is an in-memory fast path; this key is the cross-runtime
    // idempotency boundary enforced by appendEventsNow/IndexedDB.
    dedupeKey: `turn:${turnKey}`,
    targets: turn ? [turn] : [],
    payload: { actorId: activeId, actorName: turn?.name || "Token" },
    ...(orderSnapshot ? { facets: { roster: orderSnapshot } } : {}),
    version: 3,
    turnContext,
    provenance: {
      recordingSource: "turn-recorder",
      actor: null,
      cause: null,
    },
  });

  if (!canUseEpoch(isCurrent, sceneEpoch)) return [];
  const created = await appendEvents(
    session.id,
    inputs,
    {
      lastRound: round,
      lastTurnKey: turnKey,
      orderRevision: orderRevisionState.orderRevision,
      orderSignature: orderRevisionState.orderSignature,
      ...(rosterInitialCandidate ? { rosterInitialCandidate } : {}),
    },
    { sceneEpoch, isCurrent },
  );
  return canUseEpoch(isCurrent, sceneEpoch) ? created : [];
}
