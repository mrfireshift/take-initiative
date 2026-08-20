const clone = (value) => {
  if (value === undefined) return undefined;
  if (typeof globalThis.structuredClone === "function") {
    try {
      return globalThis.structuredClone(value);
    } catch {
      // OBR.updateItems espone i metadata come draft Immer (Proxy).
      // I Proxy contengono dati JSON validi ma non sono clonabili con structuredClone.
    }
  }
  return JSON.parse(JSON.stringify(value));
};

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
}

export function historyUndoSame(left, right) {
  try {
    return JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));
  } catch {
    return left === right;
  }
}

export function historyUndoSnapshot(value, field) {
  const present = hasOwn(value, field);
  return present
    ? { present: true, value: clone(value[field]) }
    : { present: false };
}

function snapshotValue(value, fallbackPresent = false) {
  if (value && typeof value === "object" && typeof value.present === "boolean") {
    return clone(value);
  }
  return fallbackPresent
    ? { present: true, value: clone(value) }
    : { present: false };
}

export const TECHNICAL_METADATA_KEYS = Object.freeze([
  "com.thebigpicture.initiative/spellStaticZone",
  "com.thebigpicture.initiative/spellBoardToken",
  "com.thebigpicture.initiative/condLabel",
  "com.thebigpicture.initiative/condWidgetOf",
  "com.thebigpicture.initiative/hpbar",
  "com.thebigpicture.initiative/hpWidgetOf",
  "com.thebigpicture.initiative/effectsLocalProbe",
]);

export function isTakeInitiativeTechnicalItem(item) {
  if (!item || typeof item !== "object") return false;
  const meta = item.metadata || {};
  return TECHNICAL_METADATA_KEYS.some((key) => hasOwn(meta, key) && meta[key] !== undefined && meta[key] !== null);
}

export function technicalItemIdentityMatches(actual, expected) {
  if (!actual || !expected) return !actual && !expected;
  if (!isTakeInitiativeTechnicalItem(actual) || !isTakeInitiativeTechnicalItem(expected)) {
    return historyUndoSame(actual, expected);
  }
  const actualMeta = actual.metadata || {};
  const expectedMeta = expected.metadata || {};
  const staticZoneKey = "com.thebigpicture.initiative/spellStaticZone";
  if (hasOwn(expectedMeta, staticZoneKey)) {
    const act = actualMeta[staticZoneKey];
    const exp = expectedMeta[staticZoneKey];
    if (!act || !exp) return false;
    return String(act.instanceId || "") === String(exp.instanceId || "")
      && String(act.spellId || "") === String(exp.spellId || "")
      && String(act.ruleId || "") === String(exp.ruleId || "");
  }
  const boardTokenKey = "com.thebigpicture.initiative/spellBoardToken";
  if (hasOwn(expectedMeta, boardTokenKey)) {
    const act = actualMeta[boardTokenKey];
    const exp = expectedMeta[boardTokenKey];
    if (!act || !exp) return false;
    return String(act.instanceId || "") === String(exp.instanceId || "");
  }
  return true;
}

function isOwnedEffectCondition(instance) {
  if (!instance || typeof instance !== "object") return false;
  return !!String(instance.parentEffectId || "").trim()
    && !!String(instance.effectId || "").trim();
}

export function conditionIdentityKey(instance) {
  if (!instance || typeof instance !== "object") return "";
  const cond = String(instance.condition || instance.name || "").trim();
  const sourceId = String(instance.sourceId || "").trim();
  const parentEffectId = String(instance.parentEffectId || "").trim();
  const effectId = String(instance.effectId || "").trim();
  const targetId = String(instance.targetId || "").trim();
  const type = String(instance.type || instance.effectType || "").trim();

  // Le membership dinamiche di aree/aure vengono legittimamente rimosse e
  // ricreate dai reconciler con history:false. L'instance id è quindi runtime
  // bookkeeping, mentre parentEffectId + effectId identificano l'effetto
  // posseduto semanticamente dalla spell/feature.
  if (parentEffectId && effectId) {
    return `effect:${parentEffectId}:${effectId}:${sourceId}:${targetId}:${type}:${cond}`;
  }

  const id = String(instance.id || instance.instanceId || "").trim();
  if (id) return `id:${id}`;
  return `cond:${cond}:${sourceId}:${parentEffectId}`;
}

function conditionOwnedSnapshot(instance) {
  const next = clone(instance || {});
  if (!isOwnedEffectCondition(next)) return next;
  // Questi campi cambiano quando un reconciler ricrea la stessa membership e
  // non rappresentano una modifica semantica dell'effetto posseduto.
  delete next.id;
  delete next.instanceId;
  delete next.createdAt;
  delete next.appliedAt;
  return next;
}

function conditionSnapshotSame(left, right) {
  if (!left || !right) return !left && !right;
  if (conditionIdentityKey(left) !== conditionIdentityKey(right)) return false;
  if (isOwnedEffectCondition(left) && isOwnedEffectCondition(right)) {
    return historyUndoSame(conditionOwnedSnapshot(left), conditionOwnedSnapshot(right));
  }
  return historyUndoSame(left, right);
}

export function granularReconcileConditions(current = [], before = [], after = []) {
  const currentList = Array.isArray(current) ? current : [];
  const beforeList = Array.isArray(before) ? before : [];
  const afterList = Array.isArray(after) ? after : [];

  const currentMap = new Map(currentList.map((c) => [conditionIdentityKey(c), c]));
  const beforeMap = new Map(beforeList.map((c) => [conditionIdentityKey(c), c]));
  const afterMap = new Map(afterList.map((c) => [conditionIdentityKey(c), c]));

  const allTouchedKeys = new Set([
    ...[...beforeMap.keys()].filter((k) => !conditionSnapshotSame(beforeMap.get(k), afterMap.get(k))),
    ...[...afterMap.keys()].filter((k) => !conditionSnapshotSame(beforeMap.get(k), afterMap.get(k))),
  ]);

  let conflictReason = null;
  let conflictExpected = null;
  let conflictActual = null;

  for (const key of allTouchedKeys) {
    const afterInst = afterMap.get(key);
    const beforeInst = beforeMap.get(key);
    const currentInst = currentMap.get(key);

    if (afterInst && !beforeInst) {
      if (!currentInst || !conditionSnapshotSame(currentInst, afterInst)) {
        conflictReason = "current-value-mismatch";
        conflictExpected = clone(afterInst);
        conflictActual = currentInst ? clone(currentInst) : null;
        break;
      }
    } else if (beforeInst && !afterInst) {
      if (currentInst && !conditionSnapshotSame(currentInst, beforeInst)) {
        conflictReason = "current-value-mismatch";
        conflictExpected = null;
        conflictActual = clone(currentInst);
        break;
      }
    } else if (beforeInst && afterInst) {
      if (!currentInst || !conditionSnapshotSame(currentInst, afterInst)) {
        conflictReason = "current-value-mismatch";
        conflictExpected = clone(afterInst);
        conflictActual = currentInst ? clone(currentInst) : null;
        break;
      }
    }
  }

  if (conflictReason) {
    return { conflict: true, reason: conflictReason, expected: conflictExpected, actual: conflictActual };
  }

  let next = [...currentList];
  for (const key of allTouchedKeys) {
    const beforeInst = beforeMap.get(key);
    const afterInst = afterMap.get(key);

    if (afterInst && !beforeInst) {
      next = next.filter((c) => conditionIdentityKey(c) !== key);
    } else if (beforeInst && !afterInst) {
      if (!next.some((c) => conditionIdentityKey(c) === key)) {
        next.push(clone(beforeInst));
      }
    } else if (beforeInst && afterInst) {
      next = next.map((c) => conditionIdentityKey(c) === key ? clone(beforeInst) : c);
    }
  }

  return { conflict: false, reconciled: next };
}


function spellIdentityKey(spell) {
  if (!spell || typeof spell !== "object") return "";
  const instanceId = String(spell.instanceId || "").trim();
  if (instanceId) return `instance:${instanceId}`;
  const id = String(spell.id || "").trim();
  if (id) return `id:${id}`;
  const spellId = String(spell.spellId || "").trim();
  const casterId = String(spell.casterId || "").trim();
  const name = String(spell.name || "").trim();
  return `spell:${spellId}:${casterId}:${name}`;
}

function spellRuntimeComparableSnapshot(spell) {
  const next = clone(spell || {});
  delete next.turns;
  if (next.expiry && typeof next.expiry === "object") {
    const expiry = { ...next.expiry };
    delete expiry.remaining;
    next.expiry = expiry;
  }
  return next;
}

function runtimeCounterProgressCompatible(currentValue, expectedValue) {
  const expectedPresent = expectedValue !== undefined && expectedValue !== null;
  const currentPresent = currentValue !== undefined && currentValue !== null;
  if (!expectedPresent) return !currentPresent;
  const expected = Number(expectedValue);
  const current = Number(currentValue);
  if (!Number.isFinite(expected) || !Number.isFinite(current)) {
    return historyUndoSame(currentValue, expectedValue);
  }
  return current >= 0 && current <= expected;
}

function spellSnapshotCompatibleWithRuntimeProgress(current, expected) {
  if (!current || !expected) return !current && !expected;
  if (spellIdentityKey(current) !== spellIdentityKey(expected)) return false;
  if (!historyUndoSame(
    spellRuntimeComparableSnapshot(current),
    spellRuntimeComparableSnapshot(expected),
  )) return false;
  if (!runtimeCounterProgressCompatible(current.turns, expected.turns)) return false;
  const currentRemaining = current?.expiry?.remaining;
  const expectedRemaining = expected?.expiry?.remaining;
  return runtimeCounterProgressCompatible(currentRemaining, expectedRemaining);
}

export function granularReconcileSpells(current = [], before = [], after = []) {
  const currentList = Array.isArray(current) ? current : [];
  const beforeList = Array.isArray(before) ? before : [];
  const afterList = Array.isArray(after) ? after : [];

  const currentMap = new Map(currentList.map((spell) => [spellIdentityKey(spell), spell]));
  const beforeMap = new Map(beforeList.map((spell) => [spellIdentityKey(spell), spell]));
  const afterMap = new Map(afterList.map((spell) => [spellIdentityKey(spell), spell]));

  const allTouchedKeys = new Set([
    ...[...beforeMap.keys()].filter((key) => !historyUndoSame(beforeMap.get(key), afterMap.get(key))),
    ...[...afterMap.keys()].filter((key) => !historyUndoSame(beforeMap.get(key), afterMap.get(key))),
  ]);

  for (const key of allTouchedKeys) {
    const beforeSpell = beforeMap.get(key);
    const afterSpell = afterMap.get(key);
    const currentSpell = currentMap.get(key);

    if (afterSpell && !beforeSpell) {
      // A cast owns the existence/identity and semantic payload of the spell,
      // not the countdown bookkeeping advanced by history:false round/boundary ticks.
      if (!currentSpell || !spellSnapshotCompatibleWithRuntimeProgress(currentSpell, afterSpell)) {
        return {
          conflict: true,
          expected: clone(afterSpell),
          actual: currentSpell ? clone(currentSpell) : null,
        };
      }
    } else if (beforeSpell && !afterSpell) {
      // A removal can be undone only while that same spell has not reappeared.
      if (currentSpell) {
        return { conflict: true, expected: null, actual: clone(currentSpell) };
      }
    } else if (beforeSpell && afterSpell) {
      // For a genuine modification, keep strict ownership semantics. Runtime
      // drift must not mask a later edit to the same spell instance.
      if (!currentSpell || !historyUndoSame(currentSpell, afterSpell)) {
        return {
          conflict: true,
          expected: clone(afterSpell),
          actual: currentSpell ? clone(currentSpell) : null,
        };
      }
    }
  }

  let next = [...currentList];
  for (const key of allTouchedKeys) {
    const beforeSpell = beforeMap.get(key);
    const afterSpell = afterMap.get(key);
    if (afterSpell && !beforeSpell) {
      next = next.filter((spell) => spellIdentityKey(spell) !== key);
    } else if (beforeSpell && !afterSpell) {
      if (!next.some((spell) => spellIdentityKey(spell) === key)) next.push(clone(beforeSpell));
    } else if (beforeSpell && afterSpell) {
      next = next.map((spell) => spellIdentityKey(spell) === key ? clone(beforeSpell) : spell);
    }
  }

  return { conflict: false, reconciled: next };
}

function granularReconcileClassFeatureState(actualSnapshot, beforeDescriptor, afterDescriptor) {
  const actual = actualSnapshot?.present ? actualSnapshot.value || {} : {};
  const beforeVal = beforeDescriptor?.present ? beforeDescriptor.value || {} : {};
  const afterVal = afterDescriptor?.present ? afterDescriptor.value || {} : {};

  const beforeRes = beforeVal.resources || {};
  const afterRes = afterVal.resources || {};
  const allPoolIds = new Set([...Object.keys(beforeRes), ...Object.keys(afterRes)]);
  const touchedPoolIds = [...allPoolIds].filter((poolId) => !historyUndoSame(beforeRes[poolId], afterRes[poolId]));

  const beforeInstList = Array.isArray(beforeVal.instances) ? beforeVal.instances : [];
  const afterInstList = Array.isArray(afterVal.instances) ? afterVal.instances : [];
  const beforeInstMap = new Map(beforeInstList.map((i) => [String(i?.instanceId || "").trim(), i]));
  const afterInstMap = new Map(afterInstList.map((i) => [String(i?.instanceId || "").trim(), i]));
  const allInstIds = new Set([...beforeInstMap.keys(), ...afterInstMap.keys()]);
  allInstIds.delete("");
  const touchedInstIds = [...allInstIds].filter((instId) => !historyUndoSame(beforeInstMap.get(instId), afterInstMap.get(instId)));

  if (!touchedPoolIds.length && !touchedInstIds.length) {
    if (!historyUndoSame(actualSnapshot, afterDescriptor)) {
      return { conflict: true, expected: clone(afterDescriptor), actual: clone(actualSnapshot) };
    }
    return { conflict: false, restored: beforeDescriptor.present ? clone(beforeDescriptor.value) : undefined };
  }

  const actualRes = actual.resources || {};
  const actualInstList = Array.isArray(actual.instances) ? actual.instances : [];
  const actualInstMap = new Map(actualInstList.map((i) => [String(i?.instanceId || "").trim(), i]));

  for (const poolId of touchedPoolIds) {
    if (!historyUndoSame(actualRes[poolId], afterRes[poolId])) {
      return { conflict: true, field: `classFeatureState.resources.${poolId}`, expected: clone(afterRes[poolId]), actual: clone(actualRes[poolId]) };
    }
  }
  for (const instId of touchedInstIds) {
    if (!historyUndoSame(actualInstMap.get(instId), afterInstMap.get(instId))) {
      return { conflict: true, field: `classFeatureState.instances.${instId}`, expected: clone(afterInstMap.get(instId)), actual: clone(actualInstMap.get(instId)) };
    }
  }

  const nextState = clone(actual);
  nextState.resources ||= {};
  for (const poolId of touchedPoolIds) {
    if (hasOwn(beforeRes, poolId)) nextState.resources[poolId] = clone(beforeRes[poolId]);
    else delete nextState.resources[poolId];
  }
  let nextInstances = clone(actualInstList);
  for (const instId of touchedInstIds) {
    if (beforeInstMap.has(instId)) {
      const idx = nextInstances.findIndex((i) => String(i?.instanceId || "").trim() === instId);
      if (idx >= 0) nextInstances[idx] = clone(beforeInstMap.get(instId));
      else nextInstances.push(clone(beforeInstMap.get(instId)));
    } else {
      nextInstances = nextInstances.filter((i) => String(i?.instanceId || "").trim() !== instId);
    }
  }
  nextState.instances = nextInstances;
  return { conflict: false, restored: nextState };
}

function metadata(item, metadataKey) {
  const value = item?.metadata?.[metadataKey];
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function writeMetadata(item, metadataKey, next) {
  item.metadata = { ...(item.metadata || {}), [metadataKey]: next };
}

function normalizeConditionInstances(value, normalizeConditions) {
  const raw = Array.isArray(value)
    ? { version: 1, instances: value }
    : value || {};
  const normalized = typeof normalizeConditions === "function"
    ? normalizeConditions(raw)
    : Array.isArray(raw?.instances) ? raw.instances : [];
  return (Array.isArray(normalized) ? normalized : []).map((instance) => {
    const next = clone(instance);
    if (next && typeof next === "object") delete next.legacy;
    return next;
  });
}

function effectValue(item, field, keys, normalizeConditions) {
  const meta = metadata(item, keys.meta);
  if (field === "conditions") {
    return normalizeConditionInstances(meta[keys.conditions], normalizeConditions);
  }
  if (field === "spells") {
    return Array.isArray(meta[keys.spells]) ? clone(meta[keys.spells]) : [];
  }
  return meta[keys.concentrations] && typeof meta[keys.concentrations] === "object"
    ? clone(meta[keys.concentrations])
    : {};
}

function effectInput(value, field, normalizeConditions) {
  const raw = value && typeof value === "object" && typeof value.present === "boolean"
    ? (value.present ? value.value : undefined)
    : value;
  if (field === "conditions") return normalizeConditionInstances(raw, normalizeConditions);
  if (field === "spells") return Array.isArray(raw) ? clone(raw) : [];
  return raw && typeof raw === "object" ? clone(raw) : {};
}

function setEffectValue(item, field, value, keys) {
  const next = { ...metadata(item, keys.meta) };
  if (field === "conditions") {
    if (value.length) {
      next[keys.conditions] = { version: keys.conditionVersion, instances: clone(value) };
    } else {
      delete next[keys.conditions];
    }
  } else if (field === "spells") {
    next[keys.spells] = clone(value);
  } else {
    next[keys.concentrations] = clone(value);
  }
  writeMetadata(item, keys.meta, next);
}

function directEffectField(field, keys) {
  if (field === "conditions" || field === keys.conditions) return "conditions";
  if (field === "spells" || field === keys.spells) return "spells";
  if (field === "concentrations" || field === keys.concentrations) return "concentrations";
  return "";
}

function conflict(conflicts, entry, itemId, reason, field = null, extra = {}) {
  conflicts.push({
    entryId: entry?.id || null,
    itemId: itemId || null,
    ...(field ? { field } : {}),
    reason,
    ...extra,
  });
}

function positionFrom(change, before) {
  const movement = change?.movement || {};
  return {
    hasBefore: hasOwn(change, "beforePosition") || hasOwn(movement, "beforePosition"),
    hasAfter: hasOwn(change, "afterPosition") || hasOwn(movement, "afterPosition"),
    before: hasOwn(change, "beforePosition") ? change.beforePosition : movement.beforePosition,
    after: hasOwn(change, "afterPosition") ? change.afterPosition : movement.afterPosition,
    fallback: before,
  };
}

function lifecycleChange(change) {
  if (change?.lifecycle && typeof change.lifecycle === "object") {
    return { before: change.lifecycle.before, after: change.lifecycle.after };
  }
  const direct = hasOwn(change, "sceneBefore") && hasOwn(change, "sceneAfter");
  return direct
    ? { before: change.sceneBefore, after: change.sceneAfter }
    : null;
}

function ensureTouch(touches, id) {
  let touch = touches.get(id);
  if (!touch) {
    touch = {
      entryIds: new Set(),
      effects: new Set(),
      metadata: new Set(),
      externalMetadata: new Set(),
      zoneTriggerActivations: new Map(),
      position: false,
      commands: false,
      lifecycle: false,
    };
    touches.set(id, touch);
  }
  return touch;
}

function descriptorFor(container, field, fallbackPresent) {
  return snapshotValue(
    container && hasOwn(container, field) ? container[field] : undefined,
    container && hasOwn(container, field) ? true : fallbackPresent,
  );
}

function metadataFieldNames(change, effectFields, keys) {
  const names = new Set(
    Object.keys(change?.metadataFields || {}).filter((field) => change.metadataFields[field]),
  );
  if (change?.effectsMutationChange) return [...names];
  for (const field of new Set([
    ...Object.keys(change?.before || {}),
    ...Object.keys(change?.after || {}),
  ])) {
    if (!effectFields.has(field) && !directEffectField(field, keys)) names.add(field);
  }
  return [...names];
}

function zoneTriggerPending(metadataValue) {
  const runtime = metadataValue?.triggerRuntime && typeof metadataValue.triggerRuntime === "object"
    ? metadataValue.triggerRuntime
    : {};
  return Array.isArray(runtime.pending) ? runtime.pending : [];
}

function zoneTriggerActivation(metadataValue, activationId) {
  const wanted = String(activationId || "").trim();
  if (!wanted) return null;
  return zoneTriggerPending(metadataValue)
    .find((entry) => String(entry?.id || "").trim() === wanted) || null;
}

function writeZoneTriggerActivation(item, patch, present) {
  const metadataKey = String(patch?.metadataKey || "").trim();
  const activationId = String(patch?.activationId || "").trim();
  if (!metadataKey || !activationId) return;
  const metadataValue = item?.metadata?.[metadataKey] && typeof item.metadata[metadataKey] === "object"
    ? clone(item.metadata[metadataKey])
    : {};
  const runtime = metadataValue.triggerRuntime && typeof metadataValue.triggerRuntime === "object"
    ? clone(metadataValue.triggerRuntime)
    : {};
  const pending = zoneTriggerPending(metadataValue)
    .filter((entry) => String(entry?.id || "").trim() !== activationId)
    .map(clone);
  if (present && patch?.activation) pending.push(clone(patch.activation));
  runtime.pending = pending;
  metadataValue.triggerRuntime = runtime;
  item.metadata = {
    ...(item.metadata || {}),
    [metadataKey]: metadataValue,
  };
}

function zoneTriggerActivationMatches(item, patch, present) {
  const metadataKey = String(patch?.metadataKey || "").trim();
  const activationId = String(patch?.activationId || "").trim();
  if (!metadataKey || !activationId) return false;
  const current = zoneTriggerActivation(item?.metadata?.[metadataKey], activationId);
  if (!present) return !current;
  return !!current && historyUndoSame(current, patch.activation);
}

export function historyUndoItemMatches(item, change, {
  phase = "before",
  metadataKey,
  effectKeys,
  normalizeConditions,
} = {}) {
  if (!item) return false;
  if (change?.lifecycle) {
    return technicalItemIdentityMatches(
      item,
      phase === "before" ? change.lifecycle.before : change.lifecycle.after,
    );
  }
  const canonical = metadata(item, metadataKey);
  const effectPart = phase === "before" ? change?.before || {} : change?.after || {};
  for (const field of Object.keys(change?.fields || {}).filter((field) => change.fields[field])) {
    const actual = effectValue(item, field, { ...effectKeys, meta: metadataKey }, normalizeConditions);
    if (!historyUndoSame(actual, effectInput(effectPart[field], field, normalizeConditions))) return false;
  }
  const metadataPart = phase === "before"
    ? change?.beforeMetadata || {}
    : change?.afterMetadata || {};
  for (const field of Object.keys(change?.metadataFields || {}).filter((field) => change.metadataFields[field])) {
    const beforeDesc = descriptorFor(change?.beforeMetadata || change?.before || {}, field, false);
    const afterDesc = descriptorFor(change?.afterMetadata || change?.after || {}, field, false);
    const actualDesc = historyUndoSnapshot(canonical, field);
    if (!historyUndoSame(
      actualDesc,
      phase === "before" ? beforeDesc : afterDesc,
    )) return false;
  }
  if (change?.position) {
    const expected = phase === "before" ? change.beforePosition : change.afterPosition;
    if (!historyUndoSame(item.position, expected)) return false;
  }
  if (change?.commands) {
    const expected = phase === "before" ? change.beforeCommands : change.afterCommands;
    if (!historyUndoSame(item.commands, expected)) return false;
  }
  for (const patch of change?.externalMetadata || []) {
    const expected = phase === "before" ? patch.before : patch.after;
    if (!historyUndoSame(
      historyUndoSnapshot(item.metadata || {}, patch.metadataKey),
      expected,
    )) return false;
  }
  for (const patch of change?.zoneTriggerActivations || []) {
    const expectedPresent = phase === "before"
      ? patch.beforePresent === true
      : patch.afterPresent === true;
    if (!zoneTriggerActivationMatches(item, patch, expectedPresent)) return false;
  }
  return true;
}

function historyUndoLifecycleMatchesBefore(item, sideEffect) {
  const before = sideEffect?.before ?? null;
  if (before === null) return !item;
  if (!item) return false;
  return technicalItemIdentityMatches(item, before);
}

function historyUndoSideEffectMatchesBefore(item, sideEffect) {
  const type = String(sideEffect?.type || "").trim();
  if (type === "item" || isLegacyLifecycleSideEffect(sideEffect)) {
    return historyUndoLifecycleMatchesBefore(item, sideEffect);
  }
  if (!item) return false;
  if (type === "metadata") {
    const metadataKey = String(sideEffect?.metadataKey || "").trim();
    return !!metadataKey && historyUndoSame(
      historyUndoSnapshot(item.metadata || {}, metadataKey),
      snapshotValue(sideEffect?.before, false),
    );
  }
  if (type === "static-zone-move") {
    return historyUndoSame(item.position, sideEffect?.beforePosition);
  }
  if (type === "static-zone-reorient") {
    if (!historyUndoSame(item.position, sideEffect?.beforePosition)) return false;
    if (!historyUndoSame(item.commands, sideEffect?.beforeCommands)) return false;
    for (const patch of Array.isArray(sideEffect?.metadataChanges) ? sideEffect.metadataChanges : []) {
      if (!historyUndoSame(
        historyUndoSnapshot(item.metadata || {}, patch?.metadataKey),
        snapshotValue(patch?.before, false),
      )) return false;
    }
    return true;
  }
  if (type === "reminder-zone-activation") {
    const metadataKey = String(sideEffect?.metadataKey || "").trim();
    const activationId = String(sideEffect?.activationId || "").trim();
    if (!metadataKey || !activationId) return false;
    const activation = zoneTriggerActivation(item?.metadata?.[metadataKey], activationId);
    return !!activation && historyUndoSame(activation, sideEffect?.activation);
  }
  if (type === "token:teleport" || type === "token-position") {
    const beforePosition = sideEffect?.beforePosition ?? sideEffect?.before?.position ?? null;
    return !!beforePosition && historyUndoSame(item.position, beforePosition);
  }
  return false;
}

/**
 * Recovery predicate for a single stale History entry whose inverse state is
 * already present on the scene (for example: Undo committed but History
 * cleanup was lost after a runtime reload).  This never mutates the scene: it
 * only proves that every field/side effect owned by the entry is already at
 * its recorded `before` value.
 */
export function historyEntryMatchesUndoBefore({
  sceneItems = [],
  entry = null,
  metadataKey = "com.thebigpicture.initiative/meta",
  effectKeys = {},
  normalizeConditions = (value) => Array.isArray(value?.instances) ? clone(value.instances) : [],
} = {}) {
  if (!entry || typeof entry !== "object") return false;
  const keys = {
    meta: metadataKey,
    conditions: effectKeys.conditions || "conditions",
    spells: effectKeys.spells || "com.thebigpicture.initiative/spells",
    concentrations: effectKeys.concentrations || "com.thebigpicture.initiative/concentration",
  };
  const itemsById = new Map((Array.isArray(sceneItems) ? sceneItems : []).map((item) => [String(item?.id || ""), item]));
  const mutationChanges = Array.isArray(entry?.effectsMutation?.changes)
    ? entry.effectsMutation.changes
    : [];
  const seenIds = new Set();
  const changes = [];
  for (const change of mutationChanges) {
    changes.push({ ...change, effectsMutationChange: true });
    if (change?.id) seenIds.add(String(change.id));
  }
  for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
    const id = String(change?.id || "");
    if (id && seenIds.has(id)) continue;
    changes.push(change);
  }

  for (const change of changes) {
    const id = String(change?.id || "").trim();
    const lifecycle = lifecycleChange(change);
    const item = itemsById.get(id) || null;
    if (lifecycle) {
      if (lifecycle.before === null) {
        if (item) return false;
      } else if (!item || !technicalItemIdentityMatches(item, lifecycle.before)) {
        return false;
      }
      continue;
    }
    if (!id || !item || !historyUndoItemMatches(item, change, {
      phase: "before",
      metadataKey: keys.meta,
      effectKeys: keys,
      normalizeConditions,
    })) return false;
  }

  for (const sideEffect of Array.isArray(entry?.effectsMutation?.sideEffects)
    ? entry.effectsMutation.sideEffects
    : []) {
    const id = String(sideEffect?.id || sideEffect?.itemId || sideEffect?.targetId || "").trim();
    const item = itemsById.get(id) || null;
    if (!historyUndoSideEffectMatchesBefore(item, sideEffect)) return false;
  }
  return changes.length > 0 || (entry?.effectsMutation?.sideEffects?.length || 0) > 0;
}

function planIds(plan) {
  return Array.from(new Set([
    ...(Array.isArray(plan?.initialItems) ? plan.initialItems : []).map((entry) => entry?.id),
    ...(Array.isArray(plan?.finalItems) ? plan.finalItems : []).map((entry) => entry?.id),
  ].filter(Boolean)));
}

export function historyUndoPlanConflicts(
  plan,
  sceneItems = [],
  { phase = "before", normalizeConditions = null } = {},
) {
  const actualById = new Map((Array.isArray(sceneItems) ? sceneItems : []).map((item) => [item?.id, item]));
  const expectedById = new Map(
    (Array.isArray(plan?.[phase === "before" ? "initialItems" : "finalItems"])
      ? plan[phase === "before" ? "initialItems" : "finalItems"]
      : [])
      .map((entry) => [entry?.id, entry?.item || null]),
  );
  const changesById = new Map((Array.isArray(plan?.changes) ? plan.changes : []).map((change) => [change.id, change]));
  const lifecycleById = new Map((Array.isArray(plan?.lifecycle) ? plan.lifecycle : [])
    .map((change) => [change.id, change]));
  const conflicts = [];
  for (const id of planIds(plan)) {
    const actual = actualById.get(id) || null;
    const expected = expectedById.get(id) || null;
    const change = changesById.get(id);
    const lifecycle = lifecycleById.get(id);
    const ownerEntryId = lifecycle?.entryIds?.[0] || change?.entryIds?.[0] || null;
    if (!expected) {
      if (actual) {
        conflict(
          conflicts,
          { id: ownerEntryId },
          id,
          phase === "before" ? "item-id-collision" : "expected-item-absent",
        );
      }
      continue;
    }
    if (!actual) {
      conflict(conflicts, { id: ownerEntryId }, id, "missing-item", "item");
      continue;
    }
    if (change?.lifecycle || lifecycle) {
      if (!technicalItemIdentityMatches(actual, expected)) {
        conflict(conflicts, { id: ownerEntryId }, id, "scene-item-snapshot-mismatch", "scene-item");
      }
      continue;
    }
    if (!historyUndoItemMatches(actual, change || {}, {
      phase,
      metadataKey: plan.metadataKey,
      effectKeys: plan.effectKeys,
      normalizeConditions: normalizeConditions || plan.normalizeConditions,
    })) {
      conflict(conflicts, { id: ownerEntryId }, id, "current-value-mismatch", "owned-fields");
    }
  }
  return conflicts;
}

function processLifecycle({
  entry,
  id,
  before,
  after,
  simulated,
  initial,
  touches,
  conflicts,
}) {
  const itemId = String(id || "").trim();
  if (!itemId || (!before && !after)) {
    conflict(conflicts, entry, itemId, "invalid-scene-snapshot");
    return;
  }
  const touch = ensureTouch(touches, itemId);
  if (entry?.id) touch.entryIds.add(entry.id);

  touch.lifecycleTransitions ||= [];
  // Defensive legacy dedup only: collapse the exact same lifecycle transition.
  // Technical identity alone is intentionally insufficient because the same
  // plugin-owned item can have multiple legitimate transitions in one entry.
  const isDuplicateTransition = touch.lifecycleTransitions.some((t) => (
    historyUndoSame(t.before, before)
    && historyUndoSame(t.after, after)
  ));
  if (isDuplicateTransition) return;
  touch.lifecycleTransitions.push({ before: clone(before), after: clone(after) });

  if (!initial.has(itemId)) initial.set(itemId, simulated.has(itemId) ? clone(simulated.get(itemId)) : null);
  const current = simulated.has(itemId) ? simulated.get(itemId) : null;
  if (after === null) {
    if (current !== null) conflict(conflicts, entry, itemId, "scene-item-not-absent", null, {
      expected: null,
      actual: clone(current),
    });
  } else if (!current || !technicalItemIdentityMatches(current, after)) {
    conflict(conflicts, entry, itemId, "scene-item-snapshot-mismatch", null, {
      expected: clone(after),
      actual: clone(current),
    });
  }
  touch.lifecycle = true;
  if (conflicts.some((item) => item.entryId === (entry?.id || null) && item.itemId === itemId)) return;
  simulated.set(itemId, before === null ? null : clone(before));
}

function processChange({
  entry,
  rawChange,
  simulated,
  initial,
  touches,
  conflicts,
  keys,
  normalizeConditions,
  effectsMutationChange = false,
}) {
  const id = String(rawChange?.id || "").trim();
  const lifecycle = lifecycleChange(rawChange);
  if (lifecycle) {
    processLifecycle({
      entry,
      id,
      before: lifecycle.before,
      after: lifecycle.after,
      simulated,
      initial,
      touches,
      conflicts,
    });
    return;
  }
  if (!id) {
    conflict(conflicts, entry, null, "item-id-required");
    return;
  }
  if (!initial.has(id)) initial.set(id, simulated.has(id) ? clone(simulated.get(id)) : null);
  const item = simulated.has(id) ? simulated.get(id) : null;
  if (!item) {
    conflict(conflicts, entry, id, "missing-item");
    return;
  }

  const effectFields = new Set();
  for (const field of Object.keys(rawChange?.fields || {}).filter((field) => rawChange.fields[field])) {
    const normalized = directEffectField(field, keys);
    if (normalized) effectFields.add(normalized);
  }
  if (!effectsMutationChange) {
    for (const field of new Set([
      ...Object.keys(rawChange?.before || {}),
      ...Object.keys(rawChange?.after || {}),
    ])) {
      const normalized = directEffectField(field, keys);
      if (normalized) effectFields.add(normalized);
    }
  }
  const touch = ensureTouch(touches, id);
  if (entry?.id) touch.entryIds.add(entry.id);
  const effectBefore = rawChange?.before || {};
  const effectAfter = rawChange?.after || {};
  for (const field of effectFields) {
    const before = effectInput(
      effectBefore[field] ?? effectBefore[keys[field]],
      field,
      normalizeConditions,
    );
    const after = effectInput(
      effectAfter[field] ?? effectAfter[keys[field]],
      field,
      normalizeConditions,
    );
    const actual = effectValue(item, field, keys, normalizeConditions);
    if (field === "conditions") {
      const res = granularReconcileConditions(actual, before, after);
      if (res.conflict) {
        conflict(conflicts, entry, id, "current-value-mismatch", field, {
          expected: res.expected,
          actual: res.actual,
        });
        continue;
      }
      touch.effects.add(field);
      setEffectValue(item, field, res.reconciled, keys);
    } else if (field === "spells") {
      const res = granularReconcileSpells(actual, before, after);
      if (res.conflict) {
        conflict(conflicts, entry, id, "current-value-mismatch", field, {
          expected: res.expected,
          actual: res.actual,
        });
        continue;
      }
      touch.effects.add(field);
      setEffectValue(item, field, res.reconciled, keys);
    } else {
      if (!historyUndoSame(actual, after)) {
        conflict(conflicts, entry, id, "current-value-mismatch", field, {
          expected: clone(after),
          actual: clone(actual),
        });
        continue;
      }
      touch.effects.add(field);
      setEffectValue(item, field, before, keys);
    }
  }

  for (const field of metadataFieldNames(rawChange, effectFields, keys)) {
    const before = rawChange?.beforeMetadata && hasOwn(rawChange.beforeMetadata, field)
      ? snapshotValue(rawChange.beforeMetadata[field], false)
      : descriptorFor(rawChange?.before || {}, field, false);
    const after = rawChange?.afterMetadata && hasOwn(rawChange.afterMetadata, field)
      ? snapshotValue(rawChange.afterMetadata[field], false)
      : descriptorFor(rawChange?.after || {}, field, false);
    const actual = historyUndoSnapshot(metadata(item, keys.meta), field);
    if (field === "classFeatureState" && before.present && after.present) {
      const res = granularReconcileClassFeatureState(actual, before, after);
      if (res.conflict) {
        conflict(conflicts, entry, id, "current-value-mismatch", res.field || field, {
          expected: res.expected,
          actual: res.actual,
        });
        continue;
      }
      touch.metadata.add(field);
      const next = { ...metadata(item, keys.meta) };
      if (res.restored !== undefined) next[field] = clone(res.restored);
      else delete next[field];
      writeMetadata(item, keys.meta, next);
    } else {
      if (!historyUndoSame(actual, after)) {
        conflict(conflicts, entry, id, "current-value-mismatch", field, {
          expected: clone(after),
          actual: clone(actual),
        });
        continue;
      }
      touch.metadata.add(field);
      const next = { ...metadata(item, keys.meta) };
      if (before.present) next[field] = clone(before.value);
      else delete next[field];
      writeMetadata(item, keys.meta, next);
    }
  }

  const movement = positionFrom(rawChange);
  if (movement.hasBefore || movement.hasAfter) {
    if (!movement.hasBefore || !movement.hasAfter) {
      conflict(conflicts, entry, id, "invalid-position-snapshot");
    } else if (!historyUndoSame(item.position, movement.after)) {
      conflict(conflicts, entry, id, "current-value-mismatch", "position", {
        expected: clone(movement.after),
        actual: clone(item.position),
      });
    } else {
      touch.position = true;
      item.position = clone(movement.before);
    }
  }
}

function processExternalMetadata({
  entry,
  sideEffect,
  simulated,
  initial,
  touches,
  conflicts,
  keys,
}) {
  const id = String(sideEffect?.id || sideEffect?.targetId || sideEffect?.itemId || "").trim();
  const metadataKey = String(sideEffect?.metadataKey || "").trim();
  if (!id || !metadataKey) {
    conflict(conflicts, entry, id || null, "invalid-metadata-side-effect");
    return;
  }
  if (!initial.has(id)) initial.set(id, simulated.has(id) ? clone(simulated.get(id)) : null);
  const item = simulated.get(id);
  if (!item) {
    conflict(conflicts, entry, id, "missing-item", metadataKey);
    return;
  }
  if (sideEffect.type === "static-zone-move") {
    if (!historyUndoSame(item.position, sideEffect.afterPosition)) {
      conflict(conflicts, entry, id, "current-value-mismatch", "position", {
        expected: clone(sideEffect.afterPosition),
        actual: clone(item.position),
      });
      return;
    }
    const expectedInstanceId = String(sideEffect.instanceId || sideEffect.after?.value?.instanceId || "");
    const actualInstanceId = String(item.metadata?.[metadataKey]?.instanceId || "");
    if (expectedInstanceId && actualInstanceId && expectedInstanceId !== actualInstanceId) {
      conflict(conflicts, entry, id, "current-value-mismatch", metadataKey);
      return;
    }
    const touch = ensureTouch(touches, id);
    if (entry?.id) touch.entryIds.add(entry.id);
    touch.position = true;
    item.position = clone(sideEffect.beforePosition);
    return;
  }

  const actual = historyUndoSnapshot(item.metadata || {}, metadataKey);
  const expected = snapshotValue(sideEffect.after, false);
  if (!historyUndoSame(actual, expected)) {
    conflict(conflicts, entry, id, "current-value-mismatch", metadataKey, {
      expected: clone(expected),
      actual: clone(actual),
    });
    return;
  }
  const touch = ensureTouch(touches, id);
  if (entry?.id) touch.entryIds.add(entry.id);
  touch.externalMetadata.add(`${metadataKey}`);
  const next = { ...(item.metadata || {}) };
  const restore = snapshotValue(sideEffect.before, false);
  if (restore.present) next[metadataKey] = clone(restore.value);
  else delete next[metadataKey];
  item.metadata = next;
  void keys;
}

function processZoneTriggerActivation({
  entry,
  sideEffect,
  simulated,
  initial,
  touches,
  conflicts,
}) {
  const id = String(sideEffect?.id || sideEffect?.targetId || sideEffect?.itemId || "").trim();
  const metadataKey = String(sideEffect?.metadataKey || "").trim();
  const activationId = String(sideEffect?.activationId || "").trim();
  const activation = sideEffect?.activation && typeof sideEffect.activation === "object"
    ? clone(sideEffect.activation)
    : null;
  if (!id || !metadataKey || !activationId || !activation) {
    conflict(conflicts, entry, id || null, "invalid-zone-trigger-activation-side-effect", metadataKey || null);
    return;
  }
  if (!initial.has(id)) initial.set(id, simulated.has(id) ? clone(simulated.get(id)) : null);
  const item = simulated.get(id);
  if (!item) {
    conflict(conflicts, entry, id, "missing-item", metadataKey);
    return;
  }
  // La risoluzione ha consumato una sola activation. Al momento dell'Undo
  // quella activation deve essere assente; gli altri campi del triggerRuntime
  // possono invece essere avanzati dal controller dell'aura senza bloccare Undo.
  if (zoneTriggerActivation(item?.metadata?.[metadataKey], activationId)) {
    conflict(conflicts, entry, id, "current-value-mismatch", `${metadataKey}.triggerRuntime.pending`, {
      activationId,
      expected: null,
      actual: clone(zoneTriggerActivation(item?.metadata?.[metadataKey], activationId)),
    });
    return;
  }
  const touch = ensureTouch(touches, id);
  if (entry?.id) touch.entryIds.add(entry.id);
  touch.zoneTriggerActivations.set(`${metadataKey}:${activationId}`, {
    metadataKey,
    activationId,
    activation,
    beforePresent: false,
    afterPresent: true,
  });
  writeZoneTriggerActivation(item, { metadataKey, activationId, activation }, true);
}

function processStaticZoneReorient({
  entry,
  sideEffect,
  simulated,
  initial,
  touches,
  conflicts,
}) {
  const id = String(sideEffect?.id || sideEffect?.targetId || sideEffect?.itemId || "").trim();
  if (!id) {
    conflict(conflicts, entry, null, "invalid-static-zone-reorient-side-effect");
    return;
  }
  if (!initial.has(id)) initial.set(id, simulated.has(id) ? clone(simulated.get(id)) : null);
  const item = simulated.get(id);
  if (!item) {
    conflict(conflicts, entry, id, "missing-item");
    return;
  }
  const touch = ensureTouch(touches, id);
  if (entry?.id) touch.entryIds.add(entry.id);

  if (!touch.position) {
    if (!historyUndoSame(item.position, sideEffect.afterPosition)) {
      conflict(conflicts, entry, id, "current-value-mismatch", "position", {
        expected: clone(sideEffect.afterPosition),
        actual: clone(item.position),
      });
    } else {
      touch.position = true;
      item.position = clone(sideEffect.beforePosition);
    }
  }

  if (!touch.commands) {
    if (!historyUndoSame(item.commands, sideEffect.afterCommands)) {
      conflict(conflicts, entry, id, "current-value-mismatch", "commands", {
        expected: clone(sideEffect.afterCommands),
        actual: clone(item.commands),
      });
    } else {
      touch.commands = true;
      item.commands = clone(sideEffect.beforeCommands);
    }
  }

  for (const patch of Array.isArray(sideEffect?.metadataChanges) ? sideEffect.metadataChanges : []) {
    const metadataKey = String(patch?.metadataKey || "").trim();
    if (!metadataKey) continue;
    const actual = historyUndoSnapshot(item.metadata || {}, metadataKey);
    const expected = snapshotValue(patch.after, false);
    if (!historyUndoSame(actual, expected)) {
      conflict(conflicts, entry, id, "current-value-mismatch", metadataKey, {
        expected: clone(expected),
        actual: clone(actual),
      });
      continue;
    }
    touch.externalMetadata.add(metadataKey);
    const restore = snapshotValue(patch.before, false);
    const next = { ...(item.metadata || {}) };
    if (restore.present) next[metadataKey] = clone(restore.value);
    else delete next[metadataKey];
    item.metadata = next;
  }
}

function processTokenTeleport({
  entry,
  sideEffect,
  simulated,
  initial,
  touches,
  conflicts,
  teleportAnimationLookup = null,
}) {
  const id = String(sideEffect?.id || sideEffect?.targetId || sideEffect?.itemId || "").trim();
  const beforePosition = sideEffect?.beforePosition ?? sideEffect?.before?.position ?? null;
  const afterPosition = sideEffect?.afterPosition ?? sideEffect?.after?.position ?? null;
  if (!id || !beforePosition || !afterPosition) {
    conflict(conflicts, entry, id || null, "invalid-token-teleport-side-effect");
    return;
  }
  if (!initial.has(id)) initial.set(id, simulated.has(id) ? clone(simulated.get(id)) : null);
  const item = simulated.get(id);
  if (!item) {
    conflict(conflicts, entry, id, "token-teleport-target-missing");
    return;
  }
  const touch = ensureTouch(touches, id);
  if (entry?.id) touch.entryIds.add(entry.id);
  if (touch.position) return;

  const matchesAfter = historyUndoSame(item.position, afterPosition);
  let matchesAllowed = matchesAfter;
  if (!matchesAfter && historyUndoSame(item.position, beforePosition)) {
    const activeAnim = typeof teleportAnimationLookup === "function"
      ? teleportAnimationLookup(id)
      : null;
    const sideEffectOpId = String(sideEffect?.operationId || entry?.effectsMutation?.commandId || "").trim();
    if (activeAnim && activeAnim.operationId && sideEffectOpId && activeAnim.operationId === sideEffectOpId) {
      matchesAllowed = true;
    }
  }

  if (!matchesAllowed) {
    conflict(conflicts, entry, id, "current-value-mismatch", "position", {
      expected: clone(afterPosition),
      actual: clone(item.position),
    });
    return;
  }
  touch.position = true;
  item.position = clone(beforePosition);
  item.visible = true;
}

function isLegacyLifecycleSideEffect(sideEffect) {
  const type = String(sideEffect?.type || "").trim();
  if (type) return false;
  const id = String(sideEffect?.id || "").trim();
  if (!id) return false;
  const hasBefore = sideEffect?.before !== null && sideEffect?.before !== undefined;
  const hasAfter = sideEffect?.after !== null && sideEffect?.after !== undefined;
  if (hasBefore === hasAfter) return false;
  const snapshot = hasBefore ? sideEffect.before : sideEffect.after;
  return !!snapshot
    && typeof snapshot === "object"
    && String(snapshot.id || "").trim() === id;
}

function addSideEffectChange({
  entry,
  sideEffect,
  simulated,
  initial,
  touches,
  conflicts,
  keys,
  teleportAnimationLookup = null,
}) {
  if (sideEffect?.type === "token:teleport" || sideEffect?.type === "token-position") {
    processTokenTeleport({
      entry,
      sideEffect,
      simulated,
      initial,
      touches,
      conflicts,
      teleportAnimationLookup,
    });
    return true;
  }
  if (sideEffect?.type === "reminder-zone-activation") {
    processZoneTriggerActivation({
      entry,
      sideEffect,
      simulated,
      initial,
      touches,
      conflicts,
    });
    return true;
  }
  if (sideEffect?.type === "static-zone-reorient") {
    processStaticZoneReorient({
      entry,
      sideEffect,
      simulated,
      initial,
      touches,
      conflicts,
    });
    return true;
  }
  if (sideEffect?.type === "metadata" || sideEffect?.type === "static-zone-move") {
    processExternalMetadata({
      entry,
      sideEffect,
      simulated,
      initial,
      touches,
      conflicts,
      keys,
    });
    return true;
  }
  if (sideEffect?.type === "item" || isLegacyLifecycleSideEffect(sideEffect)) {
    processLifecycle({
      entry,
      id: sideEffect.id,
      before: sideEffect.before ?? null,
      after: sideEffect.after ?? null,
      simulated,
      initial,
      touches,
      conflicts,
    });
    return true;
  }
  return false;
}

export function buildHistoryUndoPlan({
  sceneItems = [],
  entryOrEntries = [],
  metadataKey = "com.thebigpicture.initiative/meta",
  effectKeys = {},
  normalizeConditions = (value) => Array.isArray(value?.instances) ? clone(value.instances) : [],
  conditionVersion = 1,
  teleportAnimationLookup = null,
} = {}) {
  const keys = {
    meta: metadataKey,
    conditions: effectKeys.conditions || "conditions",
    spells: effectKeys.spells || "com.thebigpicture.initiative/spells",
    concentrations: effectKeys.concentrations || "com.thebigpicture.initiative/concentration",
    conditionVersion,
  };
  const entries = Array.isArray(entryOrEntries) ? entryOrEntries : [entryOrEntries];
  const initialScene = new Map((Array.isArray(sceneItems) ? sceneItems : []).map((item) => [item?.id, clone(item)]));
  const simulated = new Map([...initialScene].map(([id, item]) => [id, clone(item)]));
  const initial = new Map();
  const touches = new Map();
  const conflicts = [];
  const unsupportedSideEffects = [];

  for (const entry of entries) {
    const processedIds = new Set();
    const mutationChanges = Array.isArray(entry?.effectsMutation?.changes)
      ? [...entry.effectsMutation.changes].reverse()
      : [];
    for (const change of mutationChanges) {
      processChange({
        entry,
        rawChange: { ...change, effectsMutationChange: true },
        simulated,
        initial,
        touches,
        conflicts,
        keys,
        normalizeConditions,
        effectsMutationChange: true,
      });
      if (change?.id) processedIds.add(change.id);
    }
    const entryChanges = Array.isArray(entry?.changes)
      ? [...entry.changes].reverse()
      : [];
    for (const change of entryChanges) {
      if (change?.id && processedIds.has(change.id)) continue;
      processChange({
        entry,
        rawChange: change,
        simulated,
        initial,
        touches,
        conflicts,
        keys,
        normalizeConditions,
      });
    }
    const sideEffects = Array.isArray(entry?.effectsMutation?.sideEffects)
      ? [...entry.effectsMutation.sideEffects].reverse()
      : [];
    for (const sideEffect of sideEffects) {
      if (!addSideEffectChange({
        entry,
        sideEffect,
        simulated,
        initial,
        touches,
        conflicts,
        keys,
        teleportAnimationLookup,
      })) {
        unsupportedSideEffects.push({
          entryId: entry?.id || null,
          sideEffect: clone(sideEffect),
        });
      }
    }
  }

  if (unsupportedSideEffects.length) {
    for (const sideEffect of unsupportedSideEffects) {
      conflict(
        conflicts,
        { id: sideEffect.entryId },
        sideEffect.sideEffect?.id || null,
        "unsupported-side-effect",
        sideEffect.sideEffect?.type || null,
      );
    }
  }
  if (conflicts.length) return { status: "conflict", conflicts, historyUndo: true };

  const ids = [...touches.keys()];
  const changes = [];
  const lifecycle = [];
  for (const id of ids) {
    const touch = touches.get(id);
    const beforeItem = initial.get(id) ?? null;
    const afterItem = simulated.has(id) ? simulated.get(id) : null;
    if (touch.lifecycle) {
      lifecycle.push({
        id,
        entryIds: [...touch.entryIds],
        before: clone(beforeItem),
        after: clone(afterItem),
      });
    }
    if (!beforeItem || !afterItem) continue;
    const change = {
      id,
      entryIds: [...touch.entryIds],
      fields: Object.fromEntries([...touch.effects].map((field) => [field, true])),
      before: Object.fromEntries([...touch.effects].map((field) => [
        field,
        effectValue(beforeItem, field, keys, normalizeConditions),
      ])),
      after: Object.fromEntries([...touch.effects].map((field) => [
        field,
        effectValue(afterItem, field, keys, normalizeConditions),
      ])),
    };
    if (touch.metadata.size) {
      change.metadataFields = Object.fromEntries([...touch.metadata].map((field) => [field, true]));
      change.beforeMetadata = Object.fromEntries([...touch.metadata].map((field) => [
        field,
        historyUndoSnapshot(metadata(beforeItem, keys.meta), field),
      ]));
      change.afterMetadata = Object.fromEntries([...touch.metadata].map((field) => [
        field,
        historyUndoSnapshot(metadata(afterItem, keys.meta), field),
      ]));
    }
    if (touch.position) {
      change.position = true;
      change.beforePosition = clone(beforeItem.position);
      change.afterPosition = clone(afterItem.position);
    }
    if (touch.commands) {
      change.commands = true;
      change.beforeCommands = clone(beforeItem.commands);
      change.afterCommands = clone(afterItem.commands);
    }
    const external = [];
    for (const metadataKeyName of touch.externalMetadata) {
      external.push({
        metadataKey: metadataKeyName,
        before: historyUndoSnapshot(beforeItem.metadata || {}, metadataKeyName),
        after: historyUndoSnapshot(afterItem.metadata || {}, metadataKeyName),
      });
    }
    if (external.length) change.externalMetadata = external;
    const zoneTriggerActivations = [...touch.zoneTriggerActivations.values()].map(clone);
    if (zoneTriggerActivations.length) change.zoneTriggerActivations = zoneTriggerActivations;
    if (touch.lifecycle) {
      change.lifecycle = {
        before: clone(beforeItem),
        after: clone(afterItem),
      };
    }
    if (
      Object.keys(change.fields).length
      || Object.keys(change.metadataFields || {}).length
      || change.position
      || change.commands
      || change.externalMetadata?.length
      || change.zoneTriggerActivations?.length
      || change.lifecycle
    ) changes.push(change);
  }

  const initialItems = ids.map((id) => ({ id, item: clone(initial.get(id) ?? null) }));
  const finalItems = ids.map((id) => ({ id, item: clone(simulated.has(id) ? simulated.get(id) : null) }));
  return {
    historyUndo: true,
    operations: [],
    metadataKey,
    effectKeys: {
      conditions: keys.conditions,
      spells: keys.spells,
      concentrations: keys.concentrations,
    },
    changes,
    changedIds: ids,
    lifecycle,
    initialItems,
    finalItems,
    undoSideEffects: [],
    sideEffectsPending: [],
    states: finalItems.map((entry) => ({
      id: entry.id,
      metadata: entry.item ? clone(metadata(entry.item, keys.meta)) : {},
      conditions: entry.item ? effectValue(entry.item, "conditions", keys, normalizeConditions) : [],
      spells: entry.item ? effectValue(entry.item, "spells", keys, normalizeConditions) : [],
      concentrations: entry.item
        ? effectValue(entry.item, "concentrations", keys, normalizeConditions)
        : {},
    })),
  };
}
