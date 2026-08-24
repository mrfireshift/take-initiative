const DEFAULT_THRESHOLD = 3;

function positiveThreshold(value, fallback = DEFAULT_THRESHOLD) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function nonNegativeCount(value, threshold) {
  const number = Math.floor(Number(value));
  return Math.max(0, Math.min(threshold, Number.isFinite(number) ? number : 0));
}

function normalizedOutcome(value) {
  const key = String(value || "")
    .trim()
    .toLocaleLowerCase("it")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
  if (["success", "successo", "passed", "pass", "passed-save", "s"].includes(key)) {
    return "success";
  }
  if (["failure", "fallimento", "failed", "fail", "failed-save", "f"].includes(key)) {
    return "failure";
  }
  return "";
}

function terminalFor(progress) {
  if (progress.successes >= progress.successThreshold) return "success";
  if (progress.failures >= progress.failureThreshold) return "failure";
  return null;
}

export function normalizeRepeatedSaveProgress(
  value = {},
  { successThreshold = DEFAULT_THRESHOLD, failureThreshold = DEFAULT_THRESHOLD } = {},
) {
  const successLimit = positiveThreshold(
    value?.successThreshold ?? successThreshold,
    positiveThreshold(successThreshold),
  );
  const failureLimit = positiveThreshold(
    value?.failureThreshold ?? failureThreshold,
    positiveThreshold(failureThreshold),
  );
  const progress = {
    successes: nonNegativeCount(value?.successes ?? value?.success ?? 0, successLimit),
    failures: nonNegativeCount(value?.failures ?? value?.failure ?? 0, failureLimit),
    successThreshold: successLimit,
    failureThreshold: failureLimit,
  };
  return { ...progress, terminal: terminalFor(progress) };
}

export function normalizeRepeatedSaveOutcome(value) {
  return normalizedOutcome(value);
}

export function advanceRepeatedSaveProgress(
  value = {},
  outcome = "",
  thresholds = {},
) {
  const current = normalizeRepeatedSaveProgress(value, thresholds);
  const normalized = normalizedOutcome(outcome);
  if (!normalized || current.terminal) {
    return {
      outcome: normalized || null,
      progress: current,
      terminal: current.terminal,
      changed: false,
    };
  }

  const next = normalizeRepeatedSaveProgress({
    ...current,
    successes: current.successes + (normalized === "success" ? 1 : 0),
    failures: current.failures + (normalized === "failure" ? 1 : 0),
  }, thresholds);
  return {
    outcome: normalized,
    progress: next,
    terminal: next.terminal,
    changed: next.successes !== current.successes || next.failures !== current.failures,
  };
}

export function repeatedSaveProgressLabel(value = {}, thresholds = {}) {
  const progress = normalizeRepeatedSaveProgress(value, thresholds);
  return `S ${progress.successes}/${progress.successThreshold} · F ${progress.failures}/${progress.failureThreshold}`;
}
