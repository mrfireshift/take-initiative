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
