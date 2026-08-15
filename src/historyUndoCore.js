const clone = (value) => {
  if (value === undefined) return undefined;
  if (typeof globalThis.structuredClone === "function") return globalThis.structuredClone(value);
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
      position: false,
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

export function historyUndoItemMatches(item, change, {
  phase = "before",
  metadataKey,
  effectKeys,
  normalizeConditions,
} = {}) {
  if (!item) return false;
  if (change?.lifecycle) {
    return historyUndoSame(item, phase === "before" ? change.lifecycle.before : change.lifecycle.after);
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
    if (!historyUndoSame(
      historyUndoSnapshot(canonical, field),
      snapshotValue(metadataPart[field], false),
    )) return false;
  }
  if (change?.position) {
    const expected = phase === "before" ? change.beforePosition : change.afterPosition;
    if (!historyUndoSame(item.position, expected)) return false;
  }
  for (const patch of change?.externalMetadata || []) {
    const expected = phase === "before" ? patch.before : patch.after;
    if (!historyUndoSame(
      historyUndoSnapshot(item.metadata || {}, patch.metadataKey),
      expected,
    )) return false;
  }
  return true;
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
      if (!historyUndoSame(actual, expected)) {
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
  if (!initial.has(itemId)) initial.set(itemId, simulated.has(itemId) ? clone(simulated.get(itemId)) : null);
  const current = simulated.has(itemId) ? simulated.get(itemId) : null;
  if (after === null) {
    if (current !== null) conflict(conflicts, entry, itemId, "scene-item-not-absent", null, {
      expected: null,
      actual: clone(current),
    });
  } else if (!current || !historyUndoSame(current, after)) {
    conflict(conflicts, entry, itemId, "scene-item-snapshot-mismatch", null, {
      expected: clone(after),
      actual: clone(current),
    });
  }
  const touch = ensureTouch(touches, itemId);
  if (entry?.id) touch.entryIds.add(entry.id);
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

  for (const field of metadataFieldNames(rawChange, effectFields, keys)) {
    const before = rawChange?.beforeMetadata && hasOwn(rawChange.beforeMetadata, field)
      ? snapshotValue(rawChange.beforeMetadata[field], false)
      : descriptorFor(rawChange?.before || {}, field, false);
    const after = rawChange?.afterMetadata && hasOwn(rawChange.afterMetadata, field)
      ? snapshotValue(rawChange.afterMetadata[field], false)
      : descriptorFor(rawChange?.after || {}, field, false);
    const actual = historyUndoSnapshot(metadata(item, keys.meta), field);
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
  const id = String(sideEffect?.id || "").trim();
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
  if (sideEffect.type === "static-zone-move") {
    if (!historyUndoSame(item.position, sideEffect.afterPosition)) {
      conflict(conflicts, entry, id, "current-value-mismatch", "position", {
        expected: clone(sideEffect.afterPosition),
        actual: clone(item.position),
      });
      return;
    }
    touch.position = true;
    item.position = clone(sideEffect.beforePosition);
  }
  void keys;
}

function addSideEffectChange({
  entry,
  sideEffect,
  simulated,
  initial,
  touches,
  conflicts,
  keys,
}) {
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
  if (sideEffect?.type === "item") {
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
    const mutationChanges = Array.isArray(entry?.effectsMutation?.changes)
      ? entry.effectsMutation.changes
      : null;
    if (mutationChanges) {
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
      }
    } else {
      for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
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
    }
    for (const sideEffect of Array.isArray(entry?.effectsMutation?.sideEffects)
      ? entry.effectsMutation.sideEffects
      : []) {
      if (!addSideEffectChange({
        entry,
        sideEffect,
        simulated,
        initial,
        touches,
        conflicts,
        keys,
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
    const external = [];
    for (const metadataKeyName of touch.externalMetadata) {
      external.push({
        metadataKey: metadataKeyName,
        before: historyUndoSnapshot(beforeItem.metadata || {}, metadataKeyName),
        after: historyUndoSnapshot(afterItem.metadata || {}, metadataKeyName),
      });
    }
    if (external.length) change.externalMetadata = external;
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
      || change.externalMetadata?.length
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
