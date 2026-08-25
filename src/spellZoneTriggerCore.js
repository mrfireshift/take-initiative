import { currentInitiativeTurnKey } from "./turnBoundaryCore.js";
import { CLASS_FEATURE_AURA_META_KEY } from "./classFeatureAuraCore.js";
import { CUSTOM_AURA_META_KEY } from "./customAuraCore.js";
import { SPELL_AURA_META_KEY } from "./spellAuraCore.js";
import { SPELL_STATIC_ZONE_META_KEY } from "./spellStaticZoneCore.js";

export const SPELL_ZONE_TRIGGER_WORKFLOW_ENABLED = true;

const uniqueIds = (values = []) => Array.from(new Set(
  (Array.isArray(values) ? values : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean)
));

const clone = (value) => {
  if (value === undefined) return undefined;
  if (typeof globalThis.structuredClone === "function") {
    try {
      return globalThis.structuredClone(value);
    } catch {
      // OBR.updateItems espone metadata come draft Immer (Proxy), che
      // structuredClone non accetta pur contenendo esclusivamente dati JSON.
    }
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

function optionalDC(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Math.min(99, Math.round(number)));
}

function normalizedMemberPositions(value = {}) {

  const source = value && typeof value === "object" ? value : {};
  const entries = Array.isArray(source)
    ? source.map((entry) => [entry?.id, entry])
    : Object.entries(source);
  const positions = {};
  for (const [rawId, rawPoint] of entries) {
    const id = String(rawId || "").trim();
    const position = normalizedPoint(rawPoint);
    if (id && position) positions[id] = position;
  }
  return positions;
}

function normalizedTargetIdsByTrigger(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  return Object.fromEntries(
    Object.entries(source)
      .map(([triggerId, targetIds]) => [
        String(triggerId || "").trim(),
        uniqueIds(targetIds),
      ])
      .filter(([triggerId]) => triggerId),
  );
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
    memberIdsByTrigger: normalizedTargetIdsByTrigger(source.memberIdsByTrigger),
    memberPositions: normalizedMemberPositions(source.memberPositions),
    evaluatedTurnKey: String(source.evaluatedTurnKey || "").trim(),
    evaluatedActorId: String(source.evaluatedActorId || "").trim(),
    areaPosition: normalizedPoint(source.areaPosition),
    areaMoveTargetIds: normalizedTargetIdsByTrigger(source.areaMoveTargetIds),
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
  casterId,
  initialized,
  zoneMoved,
  entering,
  leaving,
  moving,
  currentMembers,
  currentDirectMembers,
  previousMembers,
  turnChanged,
  activeActorId,
  previousActorId,
  areaMoveTargetIds,
  crossing = [],
}) {
  if (trigger.requiresAreaMove === true && !zoneMoved) return [];
  const targetMode = String(trigger?.targetMode || "actor").trim();
  if (trigger.event === "cast") {
    if (initialized) return [];
    return targetMode === "caster" && casterId
      ? [casterId]
      : [...currentMembers];
  }
  if (trigger.event === "enter") {
    if (!initialized || (zoneMoved && trigger.triggerOnAreaMove !== true)) return [];
    if (targetMode === "direct-members") {
      return zoneMoved
        ? (Array.isArray(areaMoveTargetIds?.[trigger.id])
          ? [...areaMoveTargetIds[trigger.id]]
          : [...currentDirectMembers])
        : [];
    }
    const candidates = trigger.requiresCrossing === true
      ? uniqueIds([...entering, ...crossing])
      : entering;
    return trigger.requiresOwnTurn === true
      ? candidates.filter((targetId) => targetId === activeActorId)
      : candidates;
  }
  if (trigger.event === "leave") {
    if (!initialized || (zoneMoved && trigger.triggerOnAreaMove !== true)) return [];
    return trigger.requiresOwnTurn === true
      ? leaving.filter((targetId) => targetId === activeActorId)
      : leaving;
  }
  if (trigger.event === "move") {
    if (!initialized || (zoneMoved && trigger.triggerOnAreaMove !== true)) return [];
    return trigger.requiresOwnTurn === true
      ? moving.filter((targetId) => targetId === activeActorId)
      : moving;
  }
  if (trigger.event === "turn-start") {
    if (
      trigger.requiresSourceTurn === true
      && (!casterId || activeActorId !== casterId)
    ) {
      return [];
    }
    if (turnChanged && targetMode === "caster") {
      return casterId ? [casterId] : [];
    }
    if (turnChanged && targetMode === "members") {
      return [...currentMembers];
    }
    return turnChanged && activeActorId && currentMembers.has(activeActorId)
      ? [activeActorId]
      : [];
  }
  if (trigger.event === "turn-end") {
    if (
      trigger.requiresSourceTurn === true
      && (!casterId || previousActorId !== casterId)
    ) {
      return [];
    }
    if (turnChanged && targetMode === "caster") {
      return casterId ? [casterId] : [];
    }
    if (turnChanged && targetMode === "members") {
      return [...previousMembers];
    }
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
  currentDirectTargetIds = [],
  currentTargetIdsByTrigger = {},
  crossingTargetIdsByTrigger = {},
  currentTargetPositions = {},
  initiativeState = null,
  suppressedTargetIdsByTrigger = {},
  preservePendingActivationIds = [],
  suppressGeometricActivationTargetIds = [],
  areaPosition = null,
  now = Date.now(),
} = {}) {
  const previous = normalizeSpellZoneTriggerRuntime(runtime);
  const preservedPendingIds = new Set(uniqueIds(preservePendingActivationIds));
  const suppressedGeometricTargetIds = new Set(
    uniqueIds(suppressGeometricActivationTargetIds),
  );
  const preservedPendingTargetKeys = new Set(
    previous.pending
      .filter((entry) => preservedPendingIds.has(entry.id))
      .flatMap((entry) => entry.targetIds.map((targetId) => (
        `${String(entry.triggerId || "").trim()}:${targetId}`
      ))),
  );
  const currentIds = uniqueIds(currentTargetIds);
  const currentMembers = new Set(currentIds);
  const currentDirectMembers = new Set(uniqueIds(currentDirectTargetIds));
  const previousMembers = new Set(previous.memberIds);
  const currentIdsByTrigger = normalizedTargetIdsByTrigger(
    currentTargetIdsByTrigger,
  );
  const crossingIdsByTrigger = normalizedTargetIdsByTrigger(
    crossingTargetIdsByTrigger,
  );
  const previousIdsByTrigger = previous.memberIdsByTrigger || {};
  const hasPerTriggerMembership = Object.keys(currentIdsByTrigger).length > 0
    || Object.keys(previousIdsByTrigger).length > 0;
  const entering = currentIds.filter((targetId) => !previousMembers.has(targetId));
  const leaving = previous.memberIds.filter((targetId) => !currentMembers.has(targetId));
  const normalizedCurrentPositions = normalizedMemberPositions(
    currentTargetPositions,
  );
  const currentMemberPositions = Object.fromEntries(
    currentIds
      .filter((targetId) => normalizedCurrentPositions[targetId])
      .map((targetId) => [
        targetId,
        normalizedCurrentPositions[targetId],
      ])
  );
  const moving = currentIds.filter((targetId) =>
    previousMembers.has(targetId)
    && !!previous.memberPositions[targetId]
    && !!currentMemberPositions[targetId]
    && !samePoint(
      previous.memberPositions[targetId],
      currentMemberPositions[targetId],
    )
  );
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
    : Array.isArray(rule?.triggerPolicy?.triggers)
      ? rule.triggerPolicy.triggers
      : [];
  const activeRuleChoice = String(zoneMetadata?.ruleChoice || "").trim();
  const triggersById = new Map(
    triggers.map((trigger) => [String(trigger?.id || "").trim(), trigger])
  );
  const handled = new Set(previous.handledKeys);
  const pending = previous.pending.map((entry) => {
    const trigger = triggersById.get(String(entry.triggerId || "").trim());
    if (!trigger) return entry;
    const eventUsesCurrentMembership =
      trigger.persistsAfterExit !== true
      && (
        trigger.event === "enter"
        || trigger.event === "move"
        || trigger.event === "turn-start"
      );
    if (
      eventUsesCurrentMembership
      && entry.turnKey
      && currentTurnKey
      && entry.turnKey !== currentTurnKey
      && !preservedPendingIds.has(entry.id)
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
    if (
      trigger?.requiresChildZone === true
      && zoneMetadata?.role === "root"
    ) {
      continue;
    }
    const requiredRuleChoices = uniqueIds(trigger?.requiresRuleChoices);
    if (
      requiredRuleChoices.length
      && !requiredRuleChoices.includes(activeRuleChoice)
    ) {
      continue;
    }
    const turnKey = activationTurnKey(
      trigger,
      currentTurnKey,
      previous.evaluatedTurnKey,
    );
    const suppressed = new Set(uniqueIds(
      suppressedTargetIdsByTrigger?.[trigger.id],
    ));
    const triggerId = String(trigger?.id || "").trim();
    const triggerCurrentIds = Object.prototype.hasOwnProperty.call(
      currentIdsByTrigger,
      triggerId,
    )
      ? currentIdsByTrigger[triggerId]
      : currentIds;
    const triggerPreviousIds = Object.prototype.hasOwnProperty.call(
      previousIdsByTrigger,
      triggerId,
    )
      ? previousIdsByTrigger[triggerId]
      : previous.memberIds;
    const triggerCurrentMembers = new Set(triggerCurrentIds);
    const triggerPreviousMembers = new Set(triggerPreviousIds);
    const triggerEntering = triggerCurrentIds.filter((targetId) =>
      !triggerPreviousMembers.has(targetId)
    );
    const triggerLeaving = triggerPreviousIds.filter((targetId) =>
      !triggerCurrentMembers.has(targetId)
    );
    const candidates = activationTargets({
      trigger,
      casterId: String(zoneMetadata?.casterId || "").trim(),
      initialized: previous.initialized,
      zoneMoved,
      entering: triggerEntering,
      leaving: triggerLeaving,
      moving: moving.filter((targetId) => triggerCurrentMembers.has(targetId)),
      currentMembers: triggerCurrentMembers,
      currentDirectMembers: new Set(
        uniqueIds(currentDirectTargetIds).filter((targetId) =>
          triggerCurrentMembers.has(targetId)
        ),
      ),
      previousMembers: triggerPreviousMembers,
      turnChanged,
      activeActorId,
      previousActorId: previous.evaluatedActorId,
      areaMoveTargetIds: previous.areaMoveTargetIds,
      crossing: crossingIdsByTrigger[triggerId] || [],
    }).filter((targetId) => !suppressed.has(targetId));
    const geometricTrigger = ["enter", "leave", "move"].includes(
      String(trigger?.event || "").trim(),
    );
    const eligible = candidates.filter((targetId) => {
      const key = frequencyKey(trigger, targetId, turnKey);
      return (
        !(geometricTrigger && suppressedGeometricTargetIds.has(targetId))
        && !preservedPendingTargetKeys.has(`${String(trigger.id || "").trim()}:${targetId}`)
        && (!key || !handled.has(key))
      );
    });
    if (!eligible.length) continue;

    sequence += 1;
    const activationScope = String(
      zoneMetadata?.activationId
      || zoneMetadata?.instanceId
      || "zone",
    );
    const activationId = [
      activationScope,
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
      ...(String(
        trigger.effectType
          || trigger.resolutionData?.effectType
          || zoneMetadata?.effectType
          || "",
      ).trim()
        ? {
          effectType: String(
            trigger.effectType
              || trigger.resolutionData?.effectType
              || zoneMetadata?.effectType,
          ).trim(),
        }
        : {}),
      ...(String(trigger.metadataKey || zoneMetadata?.metadataKey || "").trim()
        ? {
          metadataKey: String(
            trigger.metadataKey || zoneMetadata?.metadataKey,
          ).trim(),
        }
        : {}),
      ...(trigger.requiresConcentration === true ? { requiresConcentration: true } : {}),
      ...(String(trigger.ability || "").trim()
        ? { ability: String(trigger.ability).trim() }
        : {}),
      ...(optionalDC(trigger.dc ?? trigger.resolutionData?.dc) !== null
        ? { dc: optionalDC(trigger.dc ?? trigger.resolutionData?.dc) }
        : {}),
      label: String(trigger.label || "").trim(),
      ...(String(trigger.failureEffect || "").trim()
        ? { failureEffect: String(trigger.failureEffect).trim() }
        : {}),
      targetIds: eligible,
      turnKey,
      noticeTurnKey: currentTurnKey || turnKey,
      createdAt: Math.max(0, Math.floor(Number(now) || Date.now())),
      ...(String(trigger.ruleChoice || "").trim()
        ? { ruleChoice: String(trigger.ruleChoice).trim() }
        : {}),
      ...(trigger.damage && typeof trigger.damage === "object"
        ? { damage: clone(trigger.damage) }
        : trigger.resolutionData?.damage && typeof trigger.resolutionData.damage === "object"
          ? { damage: clone(trigger.resolutionData.damage) }
        : {}),
      ...(trigger.failureCondition && typeof trigger.failureCondition === "object"
        ? { failureCondition: clone(trigger.failureCondition) }
        : trigger.resolutionData?.failureCondition
          && typeof trigger.resolutionData.failureCondition === "object"
          ? { failureCondition: clone(trigger.resolutionData.failureCondition) }
          : {}),
      ...(trigger.resolutionData && typeof trigger.resolutionData === "object"
        ? { resolutionData: clone(trigger.resolutionData) }
        : {}),
      ...(trigger.success && typeof trigger.success === "object"
        ? { success: clone(trigger.success) }
        : {}),
      ...(trigger.immune && typeof trigger.immune === "object"
        ? { immune: clone(trigger.immune) }
        : {}),
    };
    if (activation.resolution !== "informational") {
      pending.push(activation);
      pendingIds.add(activationId);
    }
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
    moving,
    newActivations,
    runtime: {
      version: 1,
      initialized: true,
      memberIds: currentIds,
      ...(hasPerTriggerMembership
        ? {
          memberIdsByTrigger: Object.fromEntries(
            triggers
              .map((trigger) => {
                const triggerId = String(trigger?.id || "").trim();
                if (!triggerId) return null;
                return [
                  triggerId,
                  Object.prototype.hasOwnProperty.call(currentIdsByTrigger, triggerId)
                    ? currentIdsByTrigger[triggerId]
                    : currentIds,
                ];
              })
              .filter(Boolean),
          ),
        }
        : {}),
      memberPositions: currentMemberPositions,
      evaluatedTurnKey: currentTurnKey,
      evaluatedActorId: activeActorId,
      areaPosition: nextAreaPosition,
      areaMoveTargetIds: {},
      handledKeys,
      pending,
      sequence,
    },
  };
}

export function consumeSpellZoneTrigger(runtime, activationId, targetId = "") {
  const normalized = normalizeSpellZoneTriggerRuntime(runtime);
  const wanted = String(activationId || "").trim();
  const target = String(targetId || "").trim();
  if (!wanted) return normalized;
  if (!target) {
    return {
      ...normalized,
      pending: normalized.pending.filter((entry) => entry.id !== wanted),
    };
  }
  return {
    ...normalized,
    pending: normalized.pending.flatMap((entry) => {
      if (entry.id !== wanted) return [entry];
      const remainingTargetIds = entry.targetIds.filter((id) => id !== target);
      return remainingTargetIds.length
        ? [{ ...entry, targetIds: remainingTargetIds }]
        : [];
    }),
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
    if (
      activation.resolution === "informational"
      || pendingIds.has(activation.id)
    ) {
      continue;
    }
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
  const pendingById = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const staticMetadata = item?.metadata?.[SPELL_STATIC_ZONE_META_KEY];
    const auraMetadata = item?.metadata?.[SPELL_AURA_META_KEY];
    const classFeatureAuraMetadata = item?.metadata?.[CLASS_FEATURE_AURA_META_KEY];
    const customAuraMetadata = item?.metadata?.[CUSTOM_AURA_META_KEY];
    const metadata = staticMetadata
      && ["root", "subzone"].includes(staticMetadata.role)
      ? staticMetadata
      : auraMetadata || classFeatureAuraMetadata || customAuraMetadata;
    if (!metadata) continue;
    const runtime = normalizeSpellZoneTriggerRuntime(metadata.triggerRuntime);
    for (const activation of runtime.pending) {
      const zoneItemId = String(item?.id || "").trim();
      const current = pendingById.get(activation.id);
      const next = {
        ...activation,
        zoneItemId: current?.zoneItemId || zoneItemId,
        zoneItemIds: uniqueIds([
          ...(current?.zoneItemIds || []),
          ...(current?.zoneItemId ? [current.zoneItemId] : []),
          zoneItemId,
        ]),
        targetIds: uniqueIds([
          ...(current?.targetIds || []),
          ...activation.targetIds,
        ]),
      };
      pendingById.set(activation.id, next);
    }
  }
  return [...pendingById.values()].sort((left, right) =>
    left.createdAt - right.createdAt || left.id.localeCompare(right.id)
  );
}
