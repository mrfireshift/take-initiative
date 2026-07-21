function canonicalizeMetadata(value) {
  if (Array.isArray(value)) return value.map(canonicalizeMetadata);
  if (!value || typeof value !== "object") return value;

  const normalized = {};
  for (const key of Object.keys(value).sort()) {
    if (value[key] !== undefined) normalized[key] = canonicalizeMetadata(value[key]);
  }
  return normalized;
}

export function initiativeStateDigest(state) {
  return JSON.stringify(canonicalizeMetadata(state ?? null));
}

export function advanceInitiativeState(state, direction) {
  const order = Array.isArray(state?.order) ? state.order : [];
  if (!order.length) return state;
  const step = direction < 0 ? -1 : 1;
  const current = Math.max(0, Math.min(order.length - 1, Math.floor(Number(state?.current) || 0)));
  const nextCurrent = (current + step + order.length) % order.length;
  const wrappedForward = step > 0 && nextCurrent === 0;
  const wrappedBackward = step < 0 && nextCurrent === order.length - 1;
  const round = Math.max(
    1,
    Math.floor(Number(state?.round) || 1) + (wrappedForward ? 1 : 0) - (wrappedBackward ? 1 : 0),
  );
  return { ...state, current: nextCurrent, round };
}

export function isCurrentRenderRevision(renderRevision, latestAcceptedRevision) {
  return renderRevision === latestAcceptedRevision;
}

export function createSerialProcessor() {
  let tail = Promise.resolve();
  let pending = 0;

  return {
    enqueue(task) {
      pending += 1;
      const run = async () => {
        try {
          return await task();
        } finally {
          pending -= 1;
        }
      };
      const result = tail.then(run, run);
      tail = result.catch(() => {});
      return result;
    },
    idle() {
      return tail;
    },
    get pending() {
      return pending;
    },
  };
}
