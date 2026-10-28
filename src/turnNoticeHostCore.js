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

// The first turn notice of a closed popup rides in its URL, as the death save and the boss link do; any other
// payload, or one too long for a URL, goes through the ready handshake. Empty when it does not ride.
export const TURN_NOTICE_URL_PAYLOAD_MAX_CHARS = 6000;

export function turnNoticeUrlPayload(payload, maxChars = TURN_NOTICE_URL_PAYLOAD_MAX_CHARS) {
  if (!isTurnNoticePayload(payload)) return "";
  let encoded = "";
  try { encoded = encodeURIComponent(JSON.stringify(payload)); } catch { return ""; }
  return encoded.length <= maxChars ? encoded : "";
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

function normalizedLayoutRevision(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0
    ? Math.floor(numeric)
    : 0;
}

export function acceptTurnNoticeLayoutRevision(latestRevision = 0, incomingRevision = 0) {
  const latest = normalizedLayoutRevision(latestRevision);
  const incoming = normalizedLayoutRevision(incomingRevision);
  if (!incoming) return { accepted: true, revision: latest };
  if (latest && incoming < latest) return { accepted: false, revision: latest };
  return { accepted: true, revision: incoming };
}

export function shouldCloseTurnNoticeFromHiddenLayout({
  scheduledLayoutRevision = 0,
  latestLayoutRevision = 0,
  awaitingVisibleLayout = false,
  scheduledActivityRevision = 0,
  currentActivityRevision = 0,
  pendingPayloadCount = 0,
} = {}) {
  const scheduled = normalizedLayoutRevision(scheduledLayoutRevision);
  const latest = normalizedLayoutRevision(latestLayoutRevision);
  if (awaitingVisibleLayout) return false;
  if (scheduled && latest && scheduled !== latest) return false;
  if (Number(scheduledActivityRevision) !== Number(currentActivityRevision)) return false;
  if (Math.max(0, Math.floor(Number(pendingPayloadCount) || 0)) > 0) return false;
  return true;
}

export function shouldHonorTurnNoticeCloseRequest({
  popoverOpen = false,
  requestSceneEpoch = null,
  currentSceneEpoch = 0,
  pendingPayloadCount = 0,
} = {}) {
  if (!popoverOpen) return false;
  const requestEpoch = Number(requestSceneEpoch);
  if (Number.isFinite(requestEpoch) && requestEpoch >= 0) {
    if (Math.floor(requestEpoch) !== Math.floor(Number(currentSceneEpoch) || 0)) return false;
  }
  if (Math.max(0, Math.floor(Number(pendingPayloadCount) || 0)) > 0) return false;
  return true;
}
