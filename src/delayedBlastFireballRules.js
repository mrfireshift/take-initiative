// Rules and canonical per-instance state for Delayed Blast Fireball.
//
// The lifecycle gateway treats terminalResolution as an opaque descriptor. This
// module owns the spell-specific shape and the small amount of state that is
// needed while the pearl is waiting to detonate.

export const DELAYED_BLAST_FIREBALL_ID = "delayed-blast-fireball";
export const DELAYED_BLAST_FIREBALL_RULE_ID = `${DELAYED_BLAST_FIREBALL_ID}:cast`;
export const DELAYED_BLAST_FIREBALL_BASE_DICE = 12;
export const DELAYED_BLAST_FIREBALL_MAX_ACCUMULATED_DICE = 10;
export const DELAYED_BLAST_FIREBALL_RADIUS_METERS = 6;
export const DELAYED_BLAST_FIREBALL_RANGE_METERS = 45;
export const DELAYED_BLAST_FIREBALL_THROW_METERS = 12;

const clone = (value) => {
  if (value === undefined) return undefined;
  if (typeof globalThis.structuredClone === "function") return globalThis.structuredClone(value);
  return JSON.parse(JSON.stringify(value));
};

const text = (value) => String(value ?? "").trim();

function point(value) {
  const x = Number(value?.x);
  const y = Number(value?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function boundedInteger(value, fallback = 0, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(number)));
}

export function delayedBlastFireballSlotLevel(value) {
  return boundedInteger(value, 7, 7, 9);
}

export function delayedBlastFireballBaseDice(slotLevel = 7) {
  return DELAYED_BLAST_FIREBALL_BASE_DICE
    + Math.max(0, delayedBlastFireballSlotLevel(slotLevel) - 7);
}

export function delayedBlastFireballAccumulatedDice(value) {
  return boundedInteger(
    value,
    0,
    0,
    DELAYED_BLAST_FIREBALL_MAX_ACCUMULATED_DICE,
  );
}

export function delayedBlastFireballCurrentDice(value = {}) {
  const context = value?.delayedBlastFireball
    || value?.castContext?.delayedBlastFireball
    || value;
  const slotLevel = context?.slotLevel
    ?? value?.slotLevel
    ?? value?.castContext?.slotLevel
    ?? 7;
  const baseDice = boundedInteger(
    context?.baseDice,
    delayedBlastFireballBaseDice(slotLevel),
    DELAYED_BLAST_FIREBALL_BASE_DICE,
    DELAYED_BLAST_FIREBALL_BASE_DICE + 2,
  );
  return baseDice + delayedBlastFireballAccumulatedDice(context?.accumulatedDice);
}

export function delayedBlastFireballTerminalResolutionDescriptor() {
  return {
    kind: DELAYED_BLAST_FIREBALL_ID,
    spellId: DELAYED_BLAST_FIREBALL_ID,
    radiusMeters: DELAYED_BLAST_FIREBALL_RADIUS_METERS,
    save: {
      ability: "dex",
    },
    damage: {
      diceSides: 6,
      type: "fuoco",
    },
    accumulation: {
      mode: "turn-end",
      actor: "caster",
      max: DELAYED_BLAST_FIREBALL_MAX_ACCUMULATED_DICE,
      path: ["delayedBlastFireball", "accumulatedDice"],
    },
  };
}

export function delayedBlastFireballCastContext({
  slotLevel = 7,
  position = null,
  spellSaveDC = null,
  accumulatedDice = 0,
} = {}) {
  const normalizedSlot = delayedBlastFireballSlotLevel(slotLevel);
  const normalizedPosition = point(position);
  const hasDc = spellSaveDC !== null
    && spellSaveDC !== undefined
    && text(spellSaveDC) !== "";
  const normalizedDc = hasDc ? Number(spellSaveDC) : NaN;
  return {
    slotLevel: normalizedSlot,
    delayedBlastFireball: {
      baseDice: delayedBlastFireballBaseDice(normalizedSlot),
      accumulatedDice: delayedBlastFireballAccumulatedDice(accumulatedDice),
      ...(normalizedPosition ? { position: normalizedPosition } : {}),
      radiusMeters: DELAYED_BLAST_FIREBALL_RADIUS_METERS,
    },
    terminalResolution: delayedBlastFireballTerminalResolutionDescriptor(),
    ...(Number.isFinite(normalizedDc) ? { spellSaveDC: Math.round(normalizedDc) } : {}),
  };
}

export function delayedBlastFireballSummaryParts(value = {}) {
  const currentDice = delayedBlastFireballCurrentDice(value);
  return [{ id: "delayed-blast-fireball-damage", label: `${currentDice}d6 fuoco` }];
}

export function isDelayedBlastFireball(value) {
  return text(value?.id || value?.spellId || value) === DELAYED_BLAST_FIREBALL_ID;
}

export function delayedBlastFireballPosition(value) {
  const context = value?.delayedBlastFireball
    || value?.castContext?.delayedBlastFireball
    || value;
  return point(context?.position || value?.position);
}

export function delayedBlastFireballWithAccumulation(spell, accumulatedDice) {
  if (!spell || typeof spell !== "object") return spell;
  const castContext = spell.castContext && typeof spell.castContext === "object"
    ? spell.castContext
    : {};
  const currentState = castContext.delayedBlastFireball
    && typeof castContext.delayedBlastFireball === "object"
    ? castContext.delayedBlastFireball
    : {};
  const nextCastContext = {
    ...castContext,
    delayedBlastFireball: {
      ...currentState,
      baseDice: Number.isFinite(Number(currentState.baseDice))
        ? Number(currentState.baseDice)
        : delayedBlastFireballBaseDice(castContext.slotLevel),
      accumulatedDice: delayedBlastFireballAccumulatedDice(accumulatedDice),
    },
  };
  return {
    ...spell,
    castContext: nextCastContext,
    summaryParts: delayedBlastFireballSummaryParts(nextCastContext),
  };
}

export function delayedBlastFireballTerminalPreview({
  position = null,
  dpi = 1,
  targetIds = [],
  preview = null,
} = {}) {
  const center = point(position)
    || point(preview?.position)
    || point(preview?.origin)
    || point(preview?.start);
  if (!center) return null;
  const resolvedDpi = Number.isFinite(Number(preview?.dpi)) && Number(preview.dpi) > 0
    ? Number(preview.dpi)
    : Math.max(1, Number(dpi) || 1);
  const radiusPixels = (DELAYED_BLAST_FIREBALL_RADIUS_METERS / 1.5) * resolvedDpi;
  return {
    ...(preview && typeof preview === "object" ? clone(preview) : {}),
    type: "circle",
    start: center,
    end: { x: center.x + radiusPixels, y: center.y },
    gridOrigin: center,
    position: center,
    dpi: resolvedDpi,
    targetIds: Array.from(new Set((Array.isArray(targetIds) ? targetIds : [])
      .map((id) => text(id)).filter(Boolean))),
  };
}

export function buildDelayedBlastFireballTerminalCommand({
  casterId = "",
  instanceId = "",
  requestId = "",
  sceneEpoch = null,
  slotLevel = 7,
  castContext = {},
  position = null,
  preview = null,
  targetIds = [],
  outcomes = {},
  damage = null,
} = {}) {
  const normalizedCasterId = text(casterId);
  const normalizedInstanceId = text(instanceId);
  const normalizedRequestId = text(requestId);
  const ids = Array.from(new Set((Array.isArray(targetIds) ? targetIds : [])
    .map((id) => text(id)).filter(Boolean)));
  const normalizedOutcomes = Object.fromEntries(ids.map((id) => [
    id,
    text(outcomes?.[id]).toLocaleLowerCase("it") === "passed" ? "passed" : "failed",
  ]));
  const currentDice = delayedBlastFireballCurrentDice(castContext);
  const amount = Math.max(0, Math.floor(Number(damage ?? currentDice) || 0));
  const areaPreview = delayedBlastFireballTerminalPreview({
    position,
    preview,
    targetIds: ids,
  });
  return {
    type: "spell-area-resolution",
    source: {
      kind: "terminal-resolution",
      sceneEpoch: sceneEpoch ?? null,
      parentInstanceId: normalizedInstanceId || null,
      requestId: normalizedRequestId || null,
    },
    spell: {
      spellId: DELAYED_BLAST_FIREBALL_ID,
      casterId: normalizedCasterId || null,
      slotLevel: delayedBlastFireballSlotLevel(slotLevel),
      phase: "terminal",
      castContext: normalizeDelayedBlastFireballCastContext(castContext, {
        slotLevel,
        position,
      }),
    },
    targeting: {
      mode: "geometric",
      targetIds: ids,
      primaryTargetId: null,
      targetContexts: {},
      locked: true,
      allowEmptyTargets: true,
      ignoreTargetLimit: true,
      capacity: { maximum: null, effectiveMaximum: null },
    },
    placement: {
      policy: "required",
      status: "confirmed",
      ruleId: DELAYED_BLAST_FIREBALL_RULE_ID,
      spellId: DELAYED_BLAST_FIREBALL_ID,
      casterId: normalizedCasterId || null,
      confirmed: true,
      targetLocked: true,
      preview: areaPreview,
      targetIds: ids,
    },
    outcomes: {
      required: true,
      byTarget: normalizedOutcomes,
    },
    hp: {
      required: false,
      mode: "damage",
      amount,
      primaryAmount: null,
      primaryTargetId: "",
      outcomeFactors: Object.fromEntries(ids.map((id) => [
        id,
        normalizedOutcomes[id] === "passed" ? "half" : "full",
      ])),
      targetIds: ids,
    },
    execution: {
      lane: "area-transaction",
      hasHP: true,
      hasZones: false,
      hasTokens: false,
      requiresCompositeUndo: true,
    },
    valid: !!normalizedCasterId && !!normalizedInstanceId && !!normalizedRequestId && !!areaPreview,
    errors: [],
  };
}

export function normalizeDelayedBlastFireballCastContext(value = {}, fallback = {}) {
  const source = value && typeof value === "object" ? value : {};
  const state = source.delayedBlastFireball && typeof source.delayedBlastFireball === "object"
    ? source.delayedBlastFireball
    : {};
  return {
    ...delayedBlastFireballCastContext({
      slotLevel: source.slotLevel ?? fallback.slotLevel ?? 7,
      position: state.position || fallback.position,
      spellSaveDC: source.spellSaveDC ?? fallback.spellSaveDC,
      accumulatedDice: state.accumulatedDice,
    }),
    ...source,
    delayedBlastFireball: {
      ...delayedBlastFireballCastContext({
        slotLevel: source.slotLevel ?? fallback.slotLevel ?? 7,
        position: state.position || fallback.position,
        accumulatedDice: state.accumulatedDice,
      }).delayedBlastFireball,
      ...clone(state),
    },
    terminalResolution: {
      ...delayedBlastFireballTerminalResolutionDescriptor(),
      ...(source.terminalResolution && typeof source.terminalResolution === "object"
        ? clone(source.terminalResolution)
        : {}),
    },
  };
}
