const clone = (value) => {
  if (value === undefined) return undefined;
  if (typeof globalThis.structuredClone === "function") return globalThis.structuredClone(value);
  return JSON.parse(JSON.stringify(value));
};

const same = (left, right) => {
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return left === right;
  }
};

function snapshot(metadata, field) {
  const present = Object.prototype.hasOwnProperty.call(metadata || {}, field);
  return present ? { present: true, value: clone(metadata[field]) } : { present: false };
}

function snapshotMatches(actual, expected) {
  if (!expected || typeof expected !== "object") return true;
  if (!!actual?.present !== !!expected.present) return false;
  return !actual.present || same(actual.value, expected.value);
}

function legacyEffectField(field, keys) {
  if (field === keys.conditions) return "conditions";
  if (field === keys.spells) return "spells";
  if (field === keys.concentrations) return "concentrations";
  return "";
}

function legacyEffectValue(field, fieldSnapshot, keys, normalizeConditions) {
  const value = fieldSnapshot?.present ? fieldSnapshot.value : undefined;
  if (field === keys.conditions) return normalizeConditions(value || {});
  if (field === keys.spells) return Array.isArray(value) ? clone(value) : [];
  if (field === keys.concentrations) {
    return value && typeof value === "object" ? clone(value) : {};
  }
  return undefined;
}

function coordinatedChanges(entryOrEntries, keys, normalizeConditions) {
  const entries = Array.isArray(entryOrEntries) ? entryOrEntries : [entryOrEntries];
  return entries.flatMap((entry) => {
    if (Array.isArray(entry?.effectsMutation?.changes)) {
      return entry.effectsMutation.changes.map((change) => ({ entry, change }));
    }
    return (Array.isArray(entry?.changes) ? entry.changes : []).map((legacy) => {
      const fields = {};
      const before = {};
      const after = {};
      const metadataFields = {};
      const beforeMetadata = {};
      const afterMetadata = {};
      for (const field of Object.keys(legacy?.before || {})) {
        const effectField = legacyEffectField(field, keys);
        if (effectField) {
          fields[effectField] = true;
          before[effectField] = legacyEffectValue(
            field,
            legacy.before?.[field],
            keys,
            normalizeConditions,
          );
          after[effectField] = legacyEffectValue(
            field,
            legacy.after?.[field],
            keys,
            normalizeConditions,
          );
        } else {
          metadataFields[field] = true;
          beforeMetadata[field] = clone(legacy.before?.[field]);
          afterMetadata[field] = clone(legacy.after?.[field]);
        }
      }
      return {
        entry,
        change: {
          id: legacy?.id,
          fields,
          before,
          after,
          metadataFields,
          beforeMetadata,
          afterMetadata,
          unsupported: !!legacy?.beforePosition
            || !!legacy?.afterPosition
            || Object.prototype.hasOwnProperty.call(legacy || {}, "sceneBefore")
            || Object.prototype.hasOwnProperty.call(legacy || {}, "sceneAfter"),
        },
      };
    });
  });
}

export function buildCoordinatedEffectsUndoPlan({
  currentStates = [],
  sceneItems = [],
  entryOrEntries = [],
  metadataKeys = {},
  normalizeConditions = (value) => Array.isArray(value?.instances) ? clone(value.instances) : [],
} = {}) {
  const keys = {
    conditions: metadataKeys.conditions || "conditions",
    spells: metadataKeys.spells || "spells",
    concentrations: metadataKeys.concentrations || "concentrations",
  };
  const current = new Map(currentStates.map((state) => [state.id, clone(state)]));
  const simulated = new Map([...current].map(([id, state]) => [id, clone(state)]));
  const touched = new Map();
  const metadataTouched = new Map();
  const conflicts = [];

  for (const { entry, change } of coordinatedChanges(entryOrEntries, keys, normalizeConditions)) {
    const id = String(change?.id || "").trim();
    const state = simulated.get(id);
    if (!id || !state) {
      conflicts.push({ entryId: entry?.id || null, itemId: id || null, reason: "missing-item" });
      continue;
    }
    if (change.unsupported) {
      conflicts.push({
        entryId: entry?.id || null,
        itemId: id,
        reason: "unsupported-mixed-legacy-change",
      });
      continue;
    }

    const fields = touched.get(id) || new Set();
    for (const field of ["conditions", "spells", "concentrations"]) {
      if (!change?.fields?.[field]) continue;
      if (!same(state[field], change.after?.[field])) {
        conflicts.push({
          entryId: entry?.id || null,
          itemId: id,
          field,
          reason: "current-value-mismatch",
          expected: clone(change.after?.[field]),
          actual: clone(state[field]),
        });
        continue;
      }
      fields.add(field);
      state[field] = clone(change.before?.[field]);
    }
    touched.set(id, fields);

    const metaFields = metadataTouched.get(id) || new Set();
    for (const field of Object.keys(change?.metadataFields || {})) {
      if (!change.metadataFields[field]) continue;
      const actual = snapshot(state.metadata, field);
      const expected = change.afterMetadata?.[field];
      if (!snapshotMatches(actual, expected)) {
        conflicts.push({
          entryId: entry?.id || null,
          itemId: id,
          field,
          reason: "current-value-mismatch",
          expected: clone(expected),
          actual: clone(actual),
        });
        continue;
      }
      metaFields.add(field);
      const restored = clone(change.beforeMetadata?.[field] || { present: false });
      if (restored.present) state.metadata[field] = restored.value;
      else delete state.metadata[field];
    }
    metadataTouched.set(id, metaFields);
  }

  const undoSideEffects = (Array.isArray(entryOrEntries) ? entryOrEntries : [entryOrEntries])
    .flatMap((entry) => Array.isArray(entry?.effectsMutation?.sideEffects)
      ? entry.effectsMutation.sideEffects
      : [])
    .map((change) => change?.type === "metadata"
      ? {
        id: change?.id,
        type: "metadata",
        metadataKey: String(change?.metadataKey || ""),
        restore: clone(change?.before || { present: false }),
        expected: clone(change?.after || { present: false }),
      }
      : {
        id: change?.id,
        type: "item",
        restore: clone(change?.before ?? null),
        expected: clone(change?.after ?? null),
      });
  const sceneById = new Map(sceneItems.map((item) => [item.id, item]));
  for (const sideEffect of undoSideEffects) {
    const actual = sceneById.get(sideEffect.id) || null;
    const matches = sideEffect.type === "metadata"
      ? !!actual && snapshotMatches(snapshot(actual.metadata, sideEffect.metadataKey), sideEffect.expected)
      : sideEffect.expected === null ? actual === null : same(actual, sideEffect.expected);
    if (!matches) {
      conflicts.push({
        itemId: sideEffect.id || null,
        field: sideEffect.type === "metadata" ? sideEffect.metadataKey : null,
        reason: "scene-side-effect-mismatch",
      });
    }
  }

  if (conflicts.length) return { status: "conflict", conflicts };

  const changes = [];
  for (const id of new Set([...touched.keys(), ...metadataTouched.keys()])) {
    const fields = touched.get(id) || new Set();
    const metaFields = metadataTouched.get(id) || new Set();
    const beforeState = current.get(id);
    const afterState = simulated.get(id);
    const change = {
      id,
      fields: Object.fromEntries([...fields].map((field) => [field, true])),
      before: Object.fromEntries([...fields].map((field) => [field, clone(beforeState[field])])),
      after: Object.fromEntries([...fields].map((field) => [field, clone(afterState[field])])),
    };
    if (metaFields.size) {
      change.metadataFields = Object.fromEntries([...metaFields].map((field) => [field, true]));
      change.beforeMetadata = Object.fromEntries([...metaFields].map((field) => [
        field,
        snapshot(beforeState.metadata, field),
      ]));
      change.afterMetadata = Object.fromEntries([...metaFields].map((field) => [
        field,
        snapshot(afterState.metadata, field),
      ]));
    }
    changes.push(change);
  }
  return {
    operations: [],
    changes,
    changedIds: changes.map((change) => change.id),
    undoSideEffects,
    states: changes.map((change) => ({ id: change.id, ...clone(simulated.get(change.id)) })),
  };
}
