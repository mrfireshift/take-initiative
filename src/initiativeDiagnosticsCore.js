function rounded(value) {
  return Math.round(value * 100) / 100;
}

function finiteDuration(value) {
  const duration = Number(value);
  return Number.isFinite(duration) && duration >= 0 ? duration : null;
}

function summarizeDurations(events) {
  const durations = events
    .map((entry) => finiteDuration(entry.durationMs))
    .filter((value) => value !== null);
  if (!durations.length) return { samples: 0, averageMs: 0, maxMs: 0 };
  return {
    samples: durations.length,
    averageMs: rounded(durations.reduce((sum, value) => sum + value, 0) / durations.length),
    maxMs: rounded(Math.max(...durations)),
  };
}

export function summarizeInitiativeDiagnostics(events = []) {
  const rows = Array.isArray(events) ? events.filter(Boolean) : [];
  const counts = {};
  for (const entry of rows) {
    counts[entry.event] = (counts[entry.event] || 0) + 1;
  }

  const first = rows[0];
  const last = rows[rows.length - 1];
  const renderRows = rows.filter((entry) => String(entry.event || "").startsWith("render:"));
  const committedRows = renderRows.filter((entry) => entry.event === "render:committed");
  const skippedRows = renderRows.filter((entry) => entry.event.includes("skipped"));
  const byReason = {};

  for (const entry of committedRows) {
    const reason = String(entry.reason || "unspecified");
    if (!byReason[reason]) byReason[reason] = [];
    byReason[reason].push(entry);
  }

  const reconciliations = rows.filter((entry) => entry.event === "render:cards-reconciled");
  const preservedCards = reconciliations.reduce(
    (sum, entry) => sum + Math.max(0, Number(entry.preserved) || 0),
    0
  );
  const replacedCards = reconciliations.reduce(
    (sum, entry) => sum + Math.max(0, Number(entry.replaced) || 0),
    0
  );

  return {
    events: rows.length,
    durationMs: first && last ? Math.max(0, Number(last.ms) - Number(first.ms)) : 0,
    counts,
    lastEvent: last ? { ...last } : null,
    render: {
      requested: counts["render:requested"] || 0,
      committed: committedRows.length,
      skipped: skippedRows.length,
      timing: summarizeDurations(committedRows),
      byReason: Object.fromEntries(
        Object.entries(byReason).map(([reason, entries]) => [
          reason,
          { count: entries.length, ...summarizeDurations(entries) },
        ])
      ),
      cards: {
        reconciliations: reconciliations.length,
        preserved: preservedCards,
        replaced: replacedCards,
      },
    },
  };
}
