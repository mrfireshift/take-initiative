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
