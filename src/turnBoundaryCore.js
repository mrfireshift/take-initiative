function normalizedOrder(state) {
  return Array.isArray(state?.order) ? state.order : [];
}

export function initiativeTurnKeyAtOrdinal(order, ordinal) {
  const entries = Array.isArray(order) ? order : [];
  const value = Math.floor(Number(ordinal));
  if (!entries.length || !Number.isFinite(value) || value < 0) return "";
  const index = value % entries.length;
  const actorId = String(entries[index] || "").trim();
  if (!actorId) return "";
  const round = Math.floor(value / entries.length) + 1;
  return `${round}:${index}:${actorId}`;
}

export function currentInitiativeTurnKey(state) {
  const order = normalizedOrder(state);
  if (!order.length) return "";
  const current = Math.max(
    0,
    Math.min(order.length - 1, Math.floor(Number(state?.current) || 0))
  );
  const round = Math.max(1, Math.floor(Number(state?.round) || 1));
  return initiativeTurnKeyAtOrdinal(order, ((round - 1) * order.length) + current);
}

// The furthest turn the combat has reached, so a boundary already counted is never counted again (lot L15 of the
// bugfix pass): ◀ followed by ▶, a creature removed before the active one, two turns written at once.
// A mark is { round, actorId, index }: the turn's round, its order entry and its position when it was reached. Its
// ordinal is read again in the current order (the entry's position may have shifted), the old position when the
// entry left the order.
export function initiativeTurnMark(state) {
  const order = normalizedOrder(state);
  if (!order.length) return null;
  const index = Math.max(0, Math.min(order.length - 1, Math.floor(Number(state?.current) || 0)));
  const round = Math.max(1, Math.floor(Number(state?.round) || 1));
  return { round, actorId: String(order[index] || ""), index };
}

export function initiativeTurnMarkOrdinal(mark, order) {
  const entries = Array.isArray(order) ? order : [];
  if (!mark || !entries.length) return -1;
  const found = entries.indexOf(mark.actorId);
  const index = found >= 0 ? found : Math.max(0, Math.min(entries.length - 1, Math.floor(Number(mark.index) || 0)));
  return ((Math.max(1, Math.floor(Number(mark.round) || 1)) - 1) * entries.length) + index;
}

// The mark after nextState. Forward: the new turn. A single step back (◀, also several in a row) keeps the mark, so
// the turns redone with ▶ count nothing. Any other jump back (Reset round, a new combat) starts the mark again there.
// stepBack: the caller knows the move was a ◀ (navigation hint).
export function nextInitiativeTurnMark(mark, previousState, nextState, { stepBack = false } = {}) {
  const next = initiativeTurnMark(nextState);
  if (!next) return null;
  if (!mark) return next;
  const order = normalizedOrder(nextState);
  const markOrdinal = initiativeTurnMarkOrdinal(mark, order);
  const nextOrdinal = initiativeTurnMarkOrdinal(next, order);
  if (nextOrdinal >= markOrdinal) return nextOrdinal > markOrdinal ? next : mark;
  const previous = initiativeTurnMark(previousState);
  const previousOrdinal = previous ? initiativeTurnMarkOrdinal(previous, order) : -1;
  return stepBack || previousOrdinal - nextOrdinal === 1 ? mark : next;
}

// Where the boundaries of a move from previousState to nextState start counting, in nextState's order: past the
// previous turn and past the mark (the turns already reached). -1 when nothing new is reached.
export function initiativeTurnCountFrom(mark, previousState, nextState) {
  const order = normalizedOrder(nextState);
  const previous = initiativeTurnMark(previousState);
  const next = initiativeTurnMark(nextState);
  if (!previous || !next || !order.length) return -1;
  const from = Math.max(initiativeTurnMarkOrdinal(previous, order), initiativeTurnMarkOrdinal(mark, order));
  return initiativeTurnMarkOrdinal(next, order) > from ? from : -1;
}
