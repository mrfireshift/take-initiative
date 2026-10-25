// The popups a History Undo brings back (a save, a zone trigger, a death save) belong to that Undo: the next Undo
// moves to an earlier event, so the popups the previous one reopened close, unless this Undo reopens them again.
// history.js announces each Undo with the activations it reopens (REMINDER_HISTORY_REARM_CHANNEL); the popups
// (turn-notice.ts, deathSaveNoticeHost.js) keep what the last Undo reopened.
export const HISTORY_UNDO_REMINDERS_MESSAGE = "history-undo-reminders";

function activationIdSet(values) {
  return new Set((Array.isArray(values) ? values : [...(values || [])])
    .map((value) => String(value || "").trim())
    .filter(Boolean));
}

// previousIds: what the last Undo reopened; data: this Undo's message. withdraw: the popups to close now;
// next: what this Undo reopens, the set to keep for the following one.
export function historyReminderReplayWithdrawal(previousIds, data) {
  if (data?.type !== HISTORY_UNDO_REMINDERS_MESSAGE) return null;
  const next = activationIdSet(data.activationIds);
  const withdraw = [...activationIdSet(previousIds)].filter((activationId) => !next.has(activationId));
  return { withdraw, next };
}
