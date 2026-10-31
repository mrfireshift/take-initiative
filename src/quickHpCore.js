export const QUICK_HP_MODES = Object.freeze({
  DAMAGE: "damage",
  HEAL: "heal",
  TEMP: "temp",
  SAVE: "save",
});

// The console's starting tab requested by the opener (`?mode=damage`); "" keeps the page default.
export function quickHPModeFromQuery(search = "") {
  const requested = new URLSearchParams(search).get("mode") || "";
  return Object.values(QUICK_HP_MODES).includes(requested) ? requested : "";
}

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

// CAP-TEMP: the colour of the temporary hit points on the cards and in the HP editor, a light cyan apart from the PCs'
// blue (#3aa7ff) of the cards they sit on.
export const TEMP_HP_COLOR = "#A5F3FC";

// The HP bar's two parts on the total (cards and map): the HP, then the temporary hit points right after them, as a
// reserve on top. The scale is the maximum, or the HP and the temporary hit points together when they pass it (the
// fill of the HP shrinks to make room). colorRatio: the HP on the maximum, for the bar's colour.
export function quickHPBarSegments({ hp = 0, hpMax = 0, tempHp = 0 } = {}) {
  const state = quickHPStateOf({ hp, hpMax, tempHp });
  const scale = Math.max(state.hpMax, state.hp + state.tempHp);
  if (!scale) return { hpRatio: 0, tempRatio: 0, colorRatio: 0 };
  return {
    hpRatio: state.hp / scale,
    tempRatio: state.tempHp / scale,
    colorRatio: state.hpMax ? Math.min(1, state.hp / state.hpMax) : 0,
  };
}

// What happened to a creature's temporary hit points, for the combat log: "granted" (from none), "raised", "absorbed"
// (damage took them), "lost" (a death without damage), "removed" (set lower by hand), or null when unchanged.
export function quickHPTempHpChangeMode({ before = 0, after = 0, damage = false, instantDeath = false } = {}) {
  const from = nonNegativeInteger(before);
  const to = nonNegativeInteger(after);
  if (from === to) return null;
  if (to > from) return from > 0 ? "raised" : "granted";
  if (instantDeath) return "lost";
  return damage ? "absorbed" : "removed";
}

// CAP-TEMP, lotto T3a: where the temporary hit points come from, meta.tempHpSource: the pill that gave them (False Life,
// Armor of Agathys, Heroism), whose end takes the ones left. A write that takes over the pool brings its own source
// (none from a console or a trait); damage keeps it; with none left there is none. Returns the source after the write
// ("" for none), or null when it stays as it is.
export function quickHPTempHpSourceAfter({ beforeTemp = 0, afterTemp = 0, currentSource = "", grantSource = "" } = {}) {
  const before = nonNegativeInteger(beforeTemp);
  const after = nonNegativeInteger(afterTemp);
  const current = String(currentSource || "").trim();
  if (after === 0) return current ? "" : null;
  if (after > before) {
    const next = String(grantSource || "").trim();
    return next === current ? null : next;
  }
  return null;
}

// The temporary hit points' source field of a metadata patch: the pill's id, or its removal ("": absent).
export function quickHPTempHpSourcePatchField(meta = {}, source = "") {
  const value = String(source || "").trim();
  if (value) return { value };
  return Object.prototype.hasOwnProperty.call(meta || {}, "tempHpSource") ? { mode: "delete" } : null;
}

// CAP-TEMP: the hit points of a token's metadata, meta.hp up to hpMax and the temporary ones in meta.tempHp. A meta.hp
// above hpMax is the old encoding of temporary hit points (before meta.tempHp): its part above hpMax reads as
// temporary, so a token written before reads the same and moves to meta.tempHp at its next HP write.
export function quickHPStateOf({ hp = 0, hpMax = 0, tempHp = 0 } = {}) {
  const total = nonNegativeInteger(hp);
  const maxHP = nonNegativeInteger(hpMax);
  const excess = maxHP > 0 ? Math.max(0, total - maxHP) : 0;
  return { hp: total - excess, hpMax: maxHP, tempHp: nonNegativeInteger(tempHp) + excess };
}

// An HP write ({ hp, hpMax, tempHp }) in that encoding: its hp up to hpMax, the part above added to its temporary hit
// points (a writer of the old encoding: a typed value, a restored memory). A write without tempHp and within hpMax
// leaves the temporary hit points as they are, and comes back unchanged.
export function quickHPWriteWithinMax(update = {}) {
  const hp = Number(update?.hp);
  const hpMax = Number(update?.hpMax);
  const declared = Number(update?.tempHp);
  const excess = Number.isFinite(hp) && Number.isFinite(hpMax) && hpMax > 0 && hp > hpMax ? Math.floor(hp - hpMax) : 0;
  if (!excess && (update?.tempHp === undefined || update?.tempHp === null)) return update;
  return {
    ...update,
    ...(excess ? { hp: Math.floor(hpMax) } : {}),
    tempHp: (Number.isFinite(declared) ? nonNegativeInteger(declared) : 0) + excess,
  };
}

// The temporary hit points field of a metadata patch: the value, or its removal at 0 (absent, as before CAP-TEMP).
export function quickHPTempHpPatchField(meta = {}, tempHp = 0, expected = undefined) {
  const value = nonNegativeInteger(tempHp);
  const withExpected = expected === undefined ? {} : { expected };
  if (value > 0) return { value, ...withExpected };
  return Object.prototype.hasOwnProperty.call(meta || {}, "tempHp") ? { mode: "delete", ...withExpected } : null;
}

export function calculateQuickHPChange({
  mode = QUICK_HP_MODES.DAMAGE,
  value = 0,
  factor = QUICK_HP_FACTORS.FULL,
  hp = 0,
  hpMax = 0,
  tempHp = 0,
  deathSaveDamage = false,
} = {}) {
  const state = quickHPStateOf({ hp, hpMax, tempHp });
  const beforeHP = state.hp;
  const maxHP = state.hpMax;
  const beforeTempHP = state.tempHp;
  const requested = scaledQuickHPAmount(value, factor);
  let afterHP = beforeHP;
  let afterTempHP = beforeTempHP;
  let absorbed = 0;

  if (mode === QUICK_HP_MODES.HEAL) {
    // Healing never gives temporary hit points back (PHB 2014, p. 198).
    afterHP = Math.max(beforeHP, Math.min(maxHP, beforeHP + requested));
  } else if (mode === QUICK_HP_MODES.TEMP) {
    // They don't add up: the creature keeps the higher (PHB 2014, p. 198). At 0 HP they neither wake nor stabilize
    // it, as they sit apart from its HP, but they take the damage first.
    afterTempHP = Math.max(beforeTempHP, requested);
  } else {
    // The damage goes to the temporary hit points first, what is left to the HP.
    absorbed = Math.min(beforeTempHP, requested);
    afterTempHP = beforeTempHP - absorbed;
    afterHP = Math.max(0, beforeHP - (requested - absorbed));
  }

  const hpDelta = afterHP - beforeHP;
  const tempDelta = afterTempHP - beforeTempHP;
  // The delta counts the temporary hit points too: damage they took is still damage (concentration, the texts).
  const delta = hpDelta + tempDelta;
  // A PC already at 0 HP (takesDeathSaveDamage): the HP stay at 0, but the hit counts on its death saves,
  // so the change goes on to the coordinator. Not when its temporary hit points took all of it.
  const deathSaveHit = deathSaveDamage === true && mode === QUICK_HP_MODES.DAMAGE && beforeHP <= 0
    && requested > absorbed;
  return {
    mode,
    factor: FACTOR_VALUES[factor] == null ? QUICK_HP_FACTORS.FULL : factor,
    hp: beforeHP,
    hpMax: maxHP,
    tempHp: beforeTempHP,
    requested,
    afterHP,
    afterTempHp: afterTempHP,
    absorbedByTempHp: absorbed,
    hpDelta,
    tempDelta,
    delta,
    changed: delta !== 0 || deathSaveHit,
    ...(deathSaveHit ? { deathSaveDamage: true } : {}),
  };
}

export function isQuickHPDamageChange(change = {}) {
  return Number(change?.delta) < 0;
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

// The line after a command (lot L20): the targets it changed, not every target it reached (a heal on full HP changes
// nothing), with the unchanged ones said apart.
export function quickHPAppliedMessage({ save = false, changedCount = 0, unchangedCount = 0 } = {}) {
  const targets = (count) => `${count} ${count === 1 ? "bersaglio" : "bersagli"}`;
  const head = save ? `Risoluzione applicata a ${targets(changedCount)}` : `Applicato a ${targets(changedCount)}`;
  const unchanged = Math.max(0, Math.floor(Number(unchangedCount) || 0));
  return `${head}${unchanged ? ` (${unchanged === 1 ? "1 invariato" : `${unchanged} invariati`})` : ""}.`;
}
