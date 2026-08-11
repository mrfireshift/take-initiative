function text(value) {
  return String(value ?? "").trim();
}

function nestedResults(value) {
  if (!value || typeof value !== "object") return [];
  return [value.result, value.mutation, value.executionResult]
    .filter((entry) => entry && typeof entry === "object");
}

export function spellExecutionHistoryDetails(...results) {
  const queue = results.filter((result) => result && typeof result === "object");
  const seen = new Set();
  let historyEntryId = "";
  let historyPending = false;
  let explicitUndoAvailable = null;

  while (queue.length) {
    const result = queue.shift();
    if (!result || seen.has(result)) continue;
    seen.add(result);
    historyEntryId ||= text(result.historyEntryId || result.historyEntry?.id);
    historyPending ||= result.historyPending === true;
    if (typeof result.undoAvailable === "boolean" && explicitUndoAvailable === null) {
      explicitUndoAvailable = result.undoAvailable;
    }
    queue.push(...nestedResults(result));
  }

  return {
    historyEntryId,
    historyPending,
    undoAvailable: historyPending
      ? false
      : explicitUndoAvailable ?? !!historyEntryId,
  };
}

export function attachSpellExecutionHistory(result, ...sources) {
  const details = spellExecutionHistoryDetails(result, ...sources);
  if (!Array.isArray(result)) {
    if (result && typeof result === "object") return { ...result, ...details };
    return result;
  }

  for (const [key, value] of Object.entries(details)) {
    const descriptor = Object.getOwnPropertyDescriptor(result, key);
    if (descriptor && descriptor.configurable === false) continue;
    Object.defineProperty(result, key, {
      value,
      enumerable: false,
      configurable: true,
      writable: true,
    });
  }
  return result;
}
