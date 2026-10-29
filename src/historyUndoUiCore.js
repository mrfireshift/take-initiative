export function shouldHandleHistoryUndoShortcut({
  key = "",
  ctrlKey = false,
  metaKey = false,
  shiftKey = false,
  altKey = false,
  repeat = false,
  isComposing = false,
  editableTarget = false,
  busy = false,
  enabled = true,
} = {}) {
  return enabled === true
    && busy !== true
    && editableTarget !== true
    && repeat !== true
    && isComposing !== true
    && shiftKey !== true
    && altKey !== true
    && (ctrlKey === true || metaKey === true)
    && String(key || "").toLocaleLowerCase() === "z";
}

export function shouldAutoRefreshHistoryUndoReadiness(undoState = {}) {
  return undoState?.status === "blocked"
    && (
      undoState?.reason === "history-pending"
      || undoState?.reason === "history-removal-pending"
    );
}

// An entry the plugin wrote by itself in reaction to another (a class feature ended because its source fell
// unconscious): undone alone, the reaction comes back at once and Undo never gets past it. It is undone with the entry
// before it, which caused it.
export function isAutomaticConsequenceEntry(entry) {
  return entry?.payload?.automaticConsequence === true;
}

// The number of rows (newest first) an Undo selection really covers: an automatic consequence at its oldest end takes
// the row before it too (checked), or leaves with it (unchecked). 0 when that row cannot be undone.
export function historyUndoDepthWithCauses(rows = [], depth = 0, { extend = true } = {}) {
  const source = Array.isArray(rows) ? rows : [];
  let next = Math.max(0, Math.min(source.length, Math.floor(Number(depth) || 0)));
  if (extend) {
    while (next > 0 && next < source.length && isAutomaticConsequenceEntry(source[next - 1]?.entry ?? source[next - 1])) {
      next += 1;
    }
    if (next > 0 && isAutomaticConsequenceEntry(source[next - 1]?.entry ?? source[next - 1])) return 0;
    if (next > 0 && source.slice(0, next).some((row) => row?.undoable === false)) return 0;
    return next;
  }
  while (next > 0 && isAutomaticConsequenceEntry(source[next - 1]?.entry ?? source[next - 1])) next -= 1;
  return next;
}

export function partitionHistoryUndoRows(rows = []) {
  const source = Array.isArray(rows) ? rows.filter(Boolean) : [];
  const undoable = source.filter((row) => row?.undoable === true);
  const nonUndoable = source.filter((row) => row?.undoable !== true);
  return {
    undoable,
    nonUndoable,
    conflictCount: nonUndoable.filter((row) => row?.status === "conflict").length,
    invalidCount: nonUndoable.filter((row) => row?.status === "invalid").length,
  };
}
