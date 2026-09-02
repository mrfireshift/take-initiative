import referenceData from "./spell-reference-it.json" with { type: "json" };

export const TELEKINESIS_SPELL_ID = "telekinesis";
export const TELEKINESIS_CONTEST_RESOLUTION_KIND = "telekinesis-contest";
export const TELEKINESIS_MAINTAIN_ACTION_ID = "telekinesis-maintain";
export const TELEKINESIS_RETARGET_ACTION_ID = "telekinesis-retarget";
export const TELEKINESIS_OUTCOMES = Object.freeze(["passed", "failed"]);

const rawSpell = referenceData?.spells?.[TELEKINESIS_SPELL_ID] || {};
const rawRange = Number(String(rawSpell.range || "").match(/\d+(?:[.,]\d+)?/u)?.[0]?.replace(",", "."));
export const TELEKINESIS_RANGE_METERS = Number.isFinite(rawRange) && rawRange > 0
  ? rawRange
  : 18;

const clone = (value) => {
  if (value === undefined) return undefined;
  if (typeof globalThis.structuredClone === "function") return globalThis.structuredClone(value);
  return JSON.parse(JSON.stringify(value));
};

function text(value) {
  return String(value || "").trim();
}

function normalizeOutcome(value) {
  const normalized = text(value).toLocaleLowerCase("it");
  if (["passed", "superato", "successo", "vinta", "vinto"].includes(normalized)) {
    return "passed";
  }
  if (["failed", "fallito", "fallimento", "persa", "perso"].includes(normalized)) {
    return "failed";
  }
  return "";
}

function normalizeLastActivation(value) {
  if (!value || typeof value !== "object") return null;
  const turnKey = text(value.turnKey);
  const activationId = text(value.activationId);
  const actionId = text(value.actionId);
  if (!turnKey || !activationId || !actionId) return null;
  return { turnKey, activationId, actionId };
}

function normalizeRestraint(value) {
  if (!value || typeof value !== "object") return null;
  const actorId = text(value.actorId);
  const phase = text(value.phase) || "turn-end";
  const anchor = text(value.anchor) || "next-turn";
  const remaining = Math.max(0, Math.floor(Number(value.remaining) || 0));
  if (!actorId || !remaining) return null;
  return {
    actorId,
    phase,
    anchor,
    remaining,
    ...(text(value.turnKey) ? { turnKey: text(value.turnKey) } : {}),
  };
}

export function telekinesisStateFromCastContext(castContext = {}) {
  const raw = castContext?.telekinesis;
  const state = raw && typeof raw === "object" ? raw : {};
  const targetId = text(state.targetId);
  const contest = normalizeOutcome(state.contest) || (state.status === "pending" ? "pending" : "");
  const status = ["controlled", "contested", "pending"].includes(text(state.status))
    ? text(state.status)
    : contest === "passed"
      ? "controlled"
      : contest === "failed"
        ? "contested"
        : "pending";
  return {
    version: 1,
    mode: "creature",
    targetId,
    contest: contest || "pending",
    status,
    restrainedUntil: normalizeRestraint(state.restrainedUntil),
    lastActivation: normalizeLastActivation(state.lastActivation),
  };
}

export function telekinesisCastContext({
  castContext = {},
  casterId = "",
  targetId = "",
  outcome = "",
  turnKey = "",
  activationId = "",
  actionId = "",
} = {}) {
  const context = castContext && typeof castContext === "object" ? clone(castContext) : {};
  const current = telekinesisStateFromCastContext(context);
  const normalizedCasterId = text(casterId);
  const normalizedTargetId = text(targetId) || current.targetId;
  const normalizedOutcome = normalizeOutcome(outcome) || current.contest;
  const hasOutcome = TELEKINESIS_OUTCOMES.includes(normalizedOutcome);
  const next = {
    version: 1,
    mode: "creature",
    targetId: normalizedTargetId,
    contest: hasOutcome ? normalizedOutcome : "pending",
    status: normalizedOutcome === "passed"
      ? "controlled"
      : normalizedOutcome === "failed"
        ? "contested"
        : "pending",
    restrainedUntil: normalizedOutcome === "passed" && normalizedTargetId
      ? {
        actorId: normalizedCasterId,
        phase: "turn-end",
        anchor: "next-turn",
        remaining: 1,
        ...(text(turnKey) ? { turnKey: text(turnKey) } : {}),
      }
      : null,
    lastActivation: current.lastActivation,
  };
  if (text(activationId) && text(actionId) && text(turnKey)) {
    next.lastActivation = {
      turnKey: text(turnKey),
      activationId: text(activationId),
      actionId: text(actionId),
    };
  }
  return {
    ...context,
    telekinesis: next,
  };
}

export function telekinesisActivationId(instanceId, actionId, turnKey) {
  const instance = text(instanceId);
  const action = text(actionId);
  const turn = text(turnKey);
  return instance && action && turn ? `${instance}:${action}:${turn}` : "";
}

export function telekinesisActivationAlreadyUsed(castContext = {}, turnKey = "") {
  const state = telekinesisStateFromCastContext(castContext);
  const requestedTurnKey = text(turnKey);
  return !!requestedTurnKey
    && !!state.lastActivation
    && state.lastActivation.turnKey === requestedTurnKey;
}

export function telekinesisRestrainedConditionOptions({
  casterId = "",
  casterName = "",
  instanceId = "",
  appliedAt = null,
} = {}) {
  return {
    ...(text(casterId) ? { sourceId: text(casterId) } : {}),
    ...(text(casterName) ? { sourceName: text(casterName) } : {}),
    ...(text(instanceId) ? { parentEffectId: text(instanceId) } : {}),
    spellName: "Telecinesi",
    spellId: TELEKINESIS_SPELL_ID,
    type: "spell",
    effectId: "telekinesis-restrained",
    effectDetail: "La creatura è Trattenuta dalla morsa telecinetica. Spostamento e sospensione verticale restano manuali al tavolo.",
    expiry: {
      mode: "turn-end",
      actor: "source",
      ...(text(casterId) ? { actorId: text(casterId) } : {}),
      remaining: 1,
      anchor: "next-turn",
    },
    manualRemoval: true,
    magical: true,
    ...(appliedAt && typeof appliedAt === "object" ? { appliedAt: clone(appliedAt) } : {}),
  };
}

export function telekinesisSummaryParts() {
  return [];
}
