import {
  CLASS_FEATURE_STATE_FIELD,
  normalizeClassFeatureState,
  planClassFeatureActivation,
  planClassFeatureResourceAdjustment,
  planClassFeatureResourceReset,
  planClassFeatureSpecialRefresh,
} from "./classFeatureCore.js";

export const CLASS_FEATURE_STATE_OPERATION_TYPES = Object.freeze([
  "class-feature:activate-state",
  "class-feature:adjust-resource",
  "class-feature:reset-resources",
  "class-feature:special-refresh",
  "class-feature:clear-stale-suppressions",
]);

const CLASS_FEATURE_STATE_OPERATION_TYPE_SET = new Set(
  CLASS_FEATURE_STATE_OPERATION_TYPES,
);

const clone = (value) => {
  if (value === undefined) return undefined;
  if (typeof globalThis.structuredClone === "function") return globalThis.structuredClone(value);
  return JSON.parse(JSON.stringify(value));
};

const sameValue = (left, right) => JSON.stringify(left) === JSON.stringify(right);

const uniqueIds = (values = []) => Array.from(new Set(
  (Array.isArray(values) ? values : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean),
));

function metadataFieldSnapshot(meta, field) {
  const present = Object.prototype.hasOwnProperty.call(meta || {}, field);
  return present ? { present: true, value: clone(meta[field]) } : { present: false };
}

function poolsById(values = []) {
  return new Map((Array.isArray(values) ? values : [])
    .filter((pool) => pool?.id)
    .map((pool) => [String(pool.id), pool]));
}

function clearStaleSuppressions(stateValue, removals = []) {
  const state = normalizeClassFeatureState(stateValue);
  const byInstance = new Map();
  for (const removal of Array.isArray(removals) ? removals : []) {
    const instanceId = String(removal?.instanceId || "").trim();
    const targetIds = uniqueIds(removal?.targetIds);
    if (!instanceId || !targetIds.length) continue;
    const stale = byInstance.get(instanceId) || new Set();
    for (const targetId of targetIds) stale.add(targetId);
    byInstance.set(instanceId, stale);
  }
  let changed = false;
  const instances = state.instances.map((instance) => {
    const stale = byInstance.get(instance.instanceId);
    if (!stale?.size) return instance;
    const suppressedTargetIds = instance.suppressedTargetIds
      .filter((targetId) => !stale.has(targetId));
    if (suppressedTargetIds.length === instance.suppressedTargetIds.length) return instance;
    changed = true;
    return { ...instance, suppressedTargetIds };
  });
  return {
    changed,
    state: changed ? { ...state, instances } : state,
  };
}

export function isClassFeatureStateMutationOperation(operation) {
  return CLASS_FEATURE_STATE_OPERATION_TYPE_SET.has(String(operation?.type || ""));
}

function operationConflict(operation, reason, extra = {}) {
  return {
    itemId: String(operation?.sourceId || "").trim() || null,
    operationId: String(operation?.operationId || "").trim() || null,
    type: String(operation?.type || "").trim() || null,
    reason,
    ...extra,
  };
}

function planOperation(state, operation) {
  if (operation.type === "class-feature:activate-state") {
    const result = planClassFeatureActivation({
      state,
      feature: operation.feature,
      poolsById: poolsById(operation.pools),
      characterBuild: operation.characterBuild,
      sourceId: operation.sourceId,
      targetIds: operation.targetIds,
      currentRound: operation.currentRound,
      currentTurnKey: operation.currentTurnKey,
      instanceId: operation.instanceId,
      choiceId: operation.choiceId,
      resourceValues: operation.resourceValues,
      enabledFeatureIds: operation.enabledFeatureIds,
      createdAt: operation.createdAt,
    });
    return result.ok
      ? { ok: true, changed: !sameValue(state, result.state), result }
      : { ok: false, reason: result.reason || "invalid-activation", result };
  }
  if (operation.type === "class-feature:adjust-resource") {
    if (!operation.pool?.id) return { ok: false, reason: "resource-pool-missing" };
    const result = planClassFeatureResourceAdjustment(
      state,
      operation.pool,
      operation.characterBuild,
      operation.adjustment,
    );
    return { ok: true, changed: result.changed, result };
  }
  if (operation.type === "class-feature:reset-resources") {
    const result = planClassFeatureResourceReset(
      state,
      poolsById(operation.pools),
      operation.characterBuild,
      operation.poolIds,
    );
    return { ok: true, changed: result.changed, result };
  }
  if (operation.type === "class-feature:special-refresh") {
    if (!operation.pool?.id) return { ok: false, reason: "resource-pool-missing" };
    const result = planClassFeatureSpecialRefresh(
      state,
      operation.pool,
      operation.characterBuild,
      { event: operation.event },
    );
    return result.refresh
      ? { ok: true, changed: result.changed, result }
      : { ok: false, reason: result.reason || "special-refresh-unavailable", result };
  }
  if (operation.type === "class-feature:clear-stale-suppressions") {
    const result = clearStaleSuppressions(state, operation.removals);
    return { ok: true, changed: result.changed, result };
  }
  return { ok: false, reason: "unsupported-class-feature-state-operation" };
}

export function planClassFeatureStateMutations(
  sceneItems = [],
  operations = [],
  { metadataKey } = {},
) {
  const itemsById = new Map((Array.isArray(sceneItems) ? sceneItems : [])
    .filter((item) => item?.id)
    .map((item) => [String(item.id), item]));
  const stateBySource = new Map();
  const results = [];

  for (const operation of Array.isArray(operations) ? operations : []) {
    const sourceId = String(operation?.sourceId || "").trim();
    const item = itemsById.get(sourceId);
    if (!sourceId || !item) {
      if (sourceId && operation?.ignoreMissing === true) {
        results.push({
          operationId: String(operation.operationId || ""),
          type: operation.type,
          sourceId,
          changed: false,
          state: null,
        });
        continue;
      }
      return {
        status: "conflict",
        conflicts: [operationConflict(operation, "missing-item")],
        patches: [],
        results: [],
      };
    }
    let entry = stateBySource.get(sourceId);
    if (!entry) {
      const meta = item.metadata?.[metadataKey] || {};
      const before = metadataFieldSnapshot(meta, CLASS_FEATURE_STATE_FIELD);
      entry = {
        id: sourceId,
        before,
        state: normalizeClassFeatureState(before.present ? before.value : undefined),
        changed: false,
      };
      stateBySource.set(sourceId, entry);
    }
    const planned = planOperation(entry.state, operation);
    if (!planned.ok) {
      return {
        status: "conflict",
        conflicts: [operationConflict(operation, planned.reason, {
          ...(planned.result?.poolId ? { poolId: planned.result.poolId } : {}),
        })],
        patches: [],
        results: [],
      };
    }
    entry.state = planned.result.state;
    entry.changed ||= planned.changed;
    results.push({
      operationId: String(operation.operationId || ""),
      type: operation.type,
      sourceId,
      ...clone(planned.result),
    });
  }

  const patches = [...stateBySource.values()]
    .filter((entry) => entry.changed)
    .map((entry) => ({
      id: entry.id,
      fields: {
        [CLASS_FEATURE_STATE_FIELD]: {
          mode: "set",
          expected: entry.before,
          value: clone(entry.state),
        },
      },
    }));
  return { patches, results };
}
