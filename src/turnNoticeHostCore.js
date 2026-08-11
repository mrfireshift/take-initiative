export const TURN_NOTICE_SPAM_GUARD_ENABLED = true;

function isTurnNoticePayload(payload) {
  return payload?.type === "show-turn-notice";
}

export function enqueueTurnNoticeHostPayload(
  pendingPayloads = [],
  payload = null,
  { latestWins = TURN_NOTICE_SPAM_GUARD_ENABLED } = {},
) {
  const pending = Array.isArray(pendingPayloads) ? [...pendingPayloads] : [];
  if (!payload || typeof payload !== "object") return pending;
  if (!latestWins || !isTurnNoticePayload(payload)) return [...pending, payload];

  const previousTurnIndex = pending.findIndex(isTurnNoticePayload);
  if (previousTurnIndex < 0) return [...pending, payload];
  const next = pending.filter((entry) => !isTurnNoticePayload(entry));
  next.splice(Math.min(previousTurnIndex, next.length), 0, payload);
  return next;
}

export function shouldSuppressTurnNoticeBroadcast({
  enabled = TURN_NOTICE_SPAM_GUARD_ENABLED,
  flushRevision = 0,
  currentRevision = 0,
  hasPendingNavigation = false,
  flushedActiveId = "",
  latestActiveId = "",
} = {}) {
  if (!enabled) return false;
  if (Number(flushRevision) !== Number(currentRevision)) return true;
  if (hasPendingNavigation) return true;
  return !!flushedActiveId
    && !!latestActiveId
    && String(flushedActiveId) !== String(latestActiveId);
}
