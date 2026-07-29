import { currentInitiativeTurnKey } from "./turnBoundaryCore.js";
import { SPELL_STATIC_ZONE_META_KEY } from "./spellStaticZoneCore.js";

// Fase reminder sospesa: il planner resta disponibile per la riattivazione
// futura, ma nessun controller deve produrre o consumare attivazioni.
export const SPELL_ZONE_TRIGGER_WORKFLOW_ENABLED = false;

const uniqueIds = (values = []) => Array.from(new Set(
  (Array.isArray(values) ? values : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean)
));

const clone = (value) => {
  if (value === undefined) return undefined;
  if (typeof globalThis.structuredClone === "function") {
    return globalThis.structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
};

function normalizedPoint(value) {
  const x = Number(value?.x);
  const y = Number(value?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function samePoint(left, right) {
  return (!left && !right)
    || (!!left && !!right && left.x === right.x && left.y === right.y);
}

function initiativeActorId(state) {
  const order = Array.isArray(state?.order) ? state.order : [];
  if (!order.length) return "";
  const current = Math.max(
    0,
    Math.min(order.length - 1, Math.floor(Number(state?.current) || 0)),
  );
  const raw = String(order[current] || "").trim();
  if (!raw || raw === "__LAIR__" || raw.startsWith("__EPIC__")) return "";
  return raw.replace(/::p\d+$/, "");
}

function normalizedPending(value) {
  return (Array.isArray(value) ? value : []).map((entry) => {
    const id = String(entry?.id || "").trim();
    const targetIds = uniqueIds(entry?.targetIds);
    if (!id || !targetIds.length) return null;
    return {
      ...clone(entry),
      id,
      targetIds,
      createdAt: Math.max(0, Math.floor(Number(entry?.createdAt) || 0)),
    };
  }).filter(Boolean);
}

export function normalizeSpellZoneTriggerRuntime(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  return {
    version: 1,
    initialized: source.initialized === true,
    memberIds: uniqueIds(source.memberIds),
    evaluatedTurnKey: String(source.evaluatedTurnKey || "").trim(),
    evaluatedActorId: String(source.evaluatedActorId || "").trim(),
    areaPosition: normalizedPoint(source.areaPosition),
    handledKeys: uniqueIds(source.handledKeys),
    pending: normalizedPending(source.pending),
    sequence: Math.max(0, Math.floor(Number(source.sequence) || 0)),
  };
}

function frequencyKey(trigger, targetId, turnKey) {
  const group = String(trigger?.group || trigger?.id || "").trim();
  if (trigger?.frequency === "once") return `once:${group}:${targetId}`;
  if (trigger?.frequency === "once-per-turn") {
    return turnKey ? `turn:${turnKey}:${group}:${targetId}` : "";
  }
  return "";
}

function activationTargets({
  trigger,
  initialized,
  zoneMoved,
  entering,
  leaving,
  currentMembers,
  previousMembers,
  turnChanged,
  activeActorId,
  previousActorId,
}) {
  if (trigger.event === "enter") {
    if (!initialized || (zoneMoved && trigger.triggerOnAreaMove !== true)) return [];
    return trigger.requiresOwnTurn === true
      ? entering.filter((targetId) => targetId === activeActorId)
      : entering;
  }
  if (trigger.event === "leave") {
    if (!initialized || (zoneMoved && trigger.triggerOnAreaMove !== true)) return [];
    return trigger.requiresOwnTurn === true
      ? leaving.filter((targetId) => targetId === activeActorId)
      : leaving;
  }
  if (trigger.event === "turn-start") {
    return turnChanged && activeActorId && currentMembers.has(activeActorId)
      ? [activeActorId]
      : [];
  }
  if (trigger.event === "turn-end") {
    return turnChanged && previousActorId && previousMembers.has(previousActorId)
      ? [previousActorId]
      : [];
  }
  return [];
}

function activationTurnKey(trigger, currentTurnKey, previousTurnKey) {
  return trigger?.event === "turn-end" ? previousTurnKey : currentTurnKey;
}

export function planSpellZoneTriggers({
  rule = null,
  zoneMetadata = null,
  runtime = null,
  currentTargetIds = [],
  initiativeState = null,
  suppressedTargetIdsByTrigger = {},
  areaPosition = null,
  now = Date.now(),
} = {}) {
  const previous = normalizeSpellZoneTriggerRuntime(runtime);
  const currentIds = uniqueIds(currentTargetIds);
  const currentMembers = new Set(currentIds);
  const previousMembers = new Set(previous.memberIds);
  const entering = currentIds.filter((targetId) => !previousMembers.has(targetId));
  const leaving = previous.memberIds.filter((targetId) => !currentMembers.has(targetId));
  const currentTurnKey = currentInitiativeTurnKey(initiativeState);
  const activeActorId = initiativeActorId(initiativeState);
  const turnChanged = previous.initialized
    && !!previous.evaluatedTurnKey
    && !!currentTurnKey
    && previous.evaluatedTurnKey !== currentTurnKey;
  const nextAreaPosition = normalizedPoint(areaPosition);
  const zoneMoved = previous.initialized
    && !samePoint(previous.areaPosition, nextAreaPosition);
  const triggers = Array.isArray(rule?.zonePolicy?.triggers)
    ? rule.zonePolicy.triggers
    : [];
  const triggersById = new Map(
    triggers.map((trigger) => [String(trigger?.id || "").trim(), trigger])
  );
  const handled = new Set(previous.handledKeys);
  const pending = previous.pending.map((entry) => {
    const trigger = triggersById.get(String(entry.triggerId || "").trim());
    if (!trigger) return entry;
    const eventUsesCurrentMembership =
      trigger.event === "enter"
      || trigger.event === "turn-start";
    if (
      eventUsesCurrentMembership
      && entry.turnKey
      && currentTurnKey
      && entry.turnKey !== currentTurnKey
    ) {
      return null;
    }
    const suppressed = new Set(uniqueIds(
      suppressedTargetIdsByTrigger?.[trigger.id],
    ));
    const targetIds = entry.targetIds.filter((targetId) =>
      (!eventUsesCurrentMembership || currentMembers.has(targetId))
      && !suppressed.has(targetId)
    );
    if (!targetIds.length) return null;
    if (
      targetIds.length === entry.targetIds.length
      && targetIds.every((targetId, index) =>
        targetId === entry.targetIds[index]
      )
    ) {
      return entry;
    }
    return {
      ...entry,
      targetIds,
    };
  }).filter(Boolean);
  const pendingIds = new Set(pending.map((entry) => entry.id));
  const newActivations = [];
  let sequence = previous.sequence;

  for (const trigger of triggers) {
    const turnKey = activationTurnKey(
      trigger,
      currentTurnKey,
      previous.evaluatedTurnKey,
    );
    const suppressed = new Set(uniqueIds(
      suppressedTargetIdsByTrigger?.[trigger.id],
    ));
    const candidates = activationTargets({
      trigger,
      initialized: previous.initialized,
      zoneMoved,
      entering,
      leaving,
      currentMembers,
      previousMembers,
      turnChanged,
      activeActorId,
      previousActorId: previous.evaluatedActorId,
    }).filter((targetId) => !suppressed.has(targetId));
    const eligible = candidates.filter((targetId) => {
      const key = frequencyKey(trigger, targetId, turnKey);
      return !key || !handled.has(key);
    });
    if (!eligible.length) continue;

    sequence += 1;
    const activationId = [
      String(zoneMetadata?.instanceId || "zone"),
      String(trigger.id || "trigger"),
      String(turnKey || "event"),
      sequence,
    ].join(":");
    if (pendingIds.has(activationId)) continue;
    const activation = {
      id: activationId,
      instanceId: String(zoneMetadata?.instanceId || "").trim(),
      ruleId: String(zoneMetadata?.ruleId || rule?.id || "").trim(),
      spellId: String(zoneMetadata?.spellId || rule?.spellId || "").trim(),
      casterId: String(zoneMetadata?.casterId || "").trim(),
      triggerId: String(trigger.id || "").trim(),
      event: String(trigger.event || "").trim(),
      resolution: String(trigger.resolution || "").trim(),
      label: String(trigger.label || "").trim(),
      targetIds: eligible,
      turnKey,
      createdAt: Math.max(0, Math.floor(Number(now) || Date.now())),
      ...(String(trigger.ruleChoice || "").trim()
        ? { ruleChoice: String(trigger.ruleChoice).trim() }
        : {}),
      ...(trigger.damage && typeof trigger.damage === "object"
        ? { damage: clone(trigger.damage) }
        : {}),
    };
    pending.push(activation);
    pendingIds.add(activationId);
    newActivations.push(activation);
    for (const targetId of eligible) {
      const key = frequencyKey(trigger, targetId, turnKey);
      if (key) handled.add(key);
    }
  }

  const pendingTurnKeys = new Set(
    pending.map((entry) => String(entry.turnKey || "").trim()).filter(Boolean),
  );
  const handledKeys = [...handled].filter((key) =>
    key.startsWith("once:")
    || (currentTurnKey && key.startsWith(`turn:${currentTurnKey}:`))
    || [...pendingTurnKeys].some((turnKey) => key.startsWith(`turn:${turnKey}:`))
  );
  return {
    entering,
    leaving,
    newActivations,
    runtime: {
      version: 1,
      initialized: true,
      memberIds: currentIds,
      evaluatedTurnKey: currentTurnKey,
      evaluatedActorId: activeActorId,
      areaPosition: nextAreaPosition,
      handledKeys,
      pending,
      sequence,
    },
  };
}

export function consumeSpellZoneTrigger(runtime, activationId) {
  const normalized = normalizeSpellZoneTriggerRuntime(runtime);
  const wanted = String(activationId || "").trim();
  if (!wanted) return normalized;
  return {
    ...normalized,
    pending: normalized.pending.filter((entry) => entry.id !== wanted),
  };
}

export function mergePlannedSpellZoneTriggerRuntime(
  currentRuntime,
  plannedRuntime,
  newActivations = [],
  baseRuntime = null,
) {
  const current = normalizeSpellZoneTriggerRuntime(currentRuntime);
  const planned = normalizeSpellZoneTriggerRuntime(plannedRuntime);
  const base = baseRuntime === null
    ? null
    : normalizeSpellZoneTriggerRuntime(baseRuntime);
  const basePendingIds = new Set(
    (base?.pending || []).map((entry) => entry.id)
  );
  const plannedPendingById = new Map(
    planned.pending.map((entry) => [entry.id, entry])
  );
  const pending = current.pending.flatMap((entry) => {
    if (!base || !basePendingIds.has(entry.id)) return [entry];
    const replacement = plannedPendingById.get(entry.id);
    return replacement ? [replacement] : [];
  });
  const pendingIds = new Set(pending.map((entry) => entry.id));
  for (const activation of normalizedPending(newActivations)) {
    if (pendingIds.has(activation.id)) continue;
    pending.push(activation);
    pendingIds.add(activation.id);
  }
  return {
    ...planned,
    pending,
    handledKeys: uniqueIds([
      ...current.handledKeys.filter((key) => key.startsWith("once:")),
      ...planned.handledKeys,
    ]),
    sequence: Math.max(current.sequence, planned.sequence),
  };
}

export function pendingSpellZoneTriggerActivations(items = []) {
  const pending = [];
  for (const item of Array.isArray(items) ? items : []) {
    const metadata = item?.metadata?.[SPELL_STATIC_ZONE_META_KEY];
    if (metadata?.role !== "root") continue;
    const runtime = normalizeSpellZoneTriggerRuntime(metadata.triggerRuntime);
    for (const activation of runtime.pending) {
      pending.push({
        ...activation,
        zoneItemId: item.id,
      });
    }
  }
  return pending.sort((left, right) =>
    left.createdAt - right.createdAt || left.id.localeCompare(right.id)
  );
}
