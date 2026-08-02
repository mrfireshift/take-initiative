export const QUICK_HP_MODES = Object.freeze({
  DAMAGE: "damage",
  HEAL: "heal",
  TEMP: "temp",
  SAVE: "save",
});

export const QUICK_HP_FACTORS = Object.freeze({
  FULL: "full",
  HALF: "half",
  QUARTER: "quarter",
  DOUBLE: "double",
});

const FACTOR_VALUES = Object.freeze({
  [QUICK_HP_FACTORS.FULL]: 1,
  [QUICK_HP_FACTORS.HALF]: 0.5,
  [QUICK_HP_FACTORS.QUARTER]: 0.25,
  [QUICK_HP_FACTORS.DOUBLE]: 2,
});

function nonNegativeInteger(value) {
  return Math.max(0, Math.floor(Number(value) || 0));
}

export function scaledQuickHPAmount(value, factor = QUICK_HP_FACTORS.FULL) {
  const multiplier = FACTOR_VALUES[factor] ?? FACTOR_VALUES[QUICK_HP_FACTORS.FULL];
  return Math.floor(nonNegativeInteger(value) * multiplier);
}

export function calculateQuickHPChange({
  mode = QUICK_HP_MODES.DAMAGE,
  value = 0,
  factor = QUICK_HP_FACTORS.FULL,
  hp = 0,
  hpMax = 0,
} = {}) {
  const beforeHP = nonNegativeInteger(hp);
  const maxHP = nonNegativeInteger(hpMax);
  const requested = scaledQuickHPAmount(value, factor);
  let afterHP = beforeHP;

  if (mode === QUICK_HP_MODES.HEAL) {
    afterHP = beforeHP > maxHP
      ? beforeHP
      : Math.min(maxHP, beforeHP + requested);
  } else if (mode === QUICK_HP_MODES.TEMP) {
    const baseHP = Math.min(beforeHP, maxHP);
    const existingTempHP = Math.max(0, beforeHP - maxHP);
    afterHP = baseHP + Math.max(existingTempHP, requested);
  } else {
    afterHP = Math.max(0, beforeHP - requested);
  }

  const delta = afterHP - beforeHP;
  return {
    mode,
    factor: FACTOR_VALUES[factor] == null ? QUICK_HP_FACTORS.FULL : factor,
    hp: beforeHP,
    hpMax: maxHP,
    requested,
    afterHP,
    delta,
    changed: delta !== 0,
  };
}

export function failedQuickHPTargetIds(items = [], outcomes = new Map()) {
  const readOutcome = typeof outcomes?.get === "function"
    ? (id) => outcomes.get(id)
    : (id) => outcomes?.[id];
  return (Array.isArray(items) ? items : [])
    .map((item) => item?.id)
    .filter((id) => id && readOutcome(id) === "failed");
}

export function quickHPVisualUpdates(entries = [], { phase = "after" } = {}) {
  const useBefore = phase === "before";
  const updatesById = new Map();
  for (const entry of Array.isArray(entries) ? entries : []) {
    const tokenId = String(entry?.item?.id || "").trim();
    if (!tokenId) continue;
    updatesById.set(tokenId, {
      tokenId,
      hp: nonNegativeInteger(useBefore ? entry?.change?.hp : entry?.change?.afterHP),
      hpMax: nonNegativeInteger(entry?.change?.hpMax),
    });
  }
  return [...updatesById.values()];
}

export function quickHPZeroReconcileTargetIds(entries = [], resolveAction) {
  const ids = new Set();
  for (const entry of Array.isArray(entries) ? entries : []) {
    const itemId = String(entry?.item?.id || "").trim();
    if (!itemId) continue;
    if (typeof resolveAction !== "function") {
      ids.add(itemId);
      continue;
    }
    const action = resolveAction(entry) || {};
    if (action.add === true || (Array.isArray(action.removeInstanceIds) && action.removeInstanceIds.length)) {
      ids.add(itemId);
    }
  }
  return [...ids];
}

export function createQuickHPVisualTransaction(
  updates = [],
  { syncVisuals, onPreviewError = () => {} } = {},
) {
  if (typeof syncVisuals !== "function") {
    throw new TypeError("syncVisuals must be a function");
  }
  const batch = (Array.isArray(updates) ? updates : []).map((update) => ({ ...update }));
  const targetIds = Array.from(new Set(batch.map((update) => update.tokenId).filter(Boolean)));
  let previewResult;
  try {
    previewResult = syncVisuals(batch);
  } catch (error) {
    previewResult = Promise.reject(error);
  }
  const completion = Promise.resolve(previewResult).catch((error) => {
    onPreviewError(error);
  });
  return {
    targetIds,
    completion,
    async recover(readAuthoritativeUpdates) {
      await completion;
      if (typeof readAuthoritativeUpdates !== "function") return;
      const authoritativeUpdates = await readAuthoritativeUpdates([...targetIds]);
      await syncVisuals(Array.isArray(authoritativeUpdates) ? authoritativeUpdates : []);
    },
  };
}

export function shouldHandleQuickHPUndoShortcut({
  key = "",
  ctrlKey = false,
  metaKey = false,
  shiftKey = false,
  busy = false,
  hasHistoryEntry = false,
} = {}) {
  return String(key).toLocaleLowerCase() === "z"
    && (ctrlKey === true || metaKey === true)
    && shiftKey !== true
    && busy !== true
    && hasHistoryEntry === true;
}
