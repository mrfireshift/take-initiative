const clone = (value) => value === undefined ? undefined : structuredClone(value);

export function decorateCompositeEffectsHistoryEntry({
  entry,
  mutation = null,
  effectMetadataFields = [],
} = {}) {
  if (Array.isArray(mutation)) {
    const combined = new Map();
    for (const result of mutation.filter(Boolean)) {
      for (const change of result.changes || []) {
        const previous = combined.get(change.id);
        if (!previous) { combined.set(change.id, clone(change)); continue; }
        for (const [field, touched] of Object.entries(change.fields || {})) {
          if (!touched) continue;
          if (!previous.fields[field]) previous.before[field] = clone(change.before[field]);
          previous.fields[field] = true;
          previous.after[field] = clone(change.after[field]);
        }
        for (const field of Object.keys(change.metadataFields || {})) {
          previous.metadataFields ||= {};
          previous.beforeMetadata ||= {};
          previous.afterMetadata ||= {};
          if (!previous.metadataFields[field]) previous.beforeMetadata[field] = clone(change.beforeMetadata[field]);
          previous.metadataFields[field] = true;
          previous.afterMetadata[field] = clone(change.afterMetadata[field]);
        }
      }
    }
    mutation = { ...mutation.find(Boolean), changes: [...combined.values()], commitResult: {
      sideEffectChanges: mutation.flatMap((result) => result?.commitResult?.sideEffectChanges || []),
    } };
  }
  const byId = new Map((mutation?.changes || []).map((change) => {
    const fields = Object.fromEntries(
      Object.entries(change?.fields || {}).filter(([, touched]) => touched)
    );
    return [change.id, {
      id: change.id,
      ...(change.metadataFields ? {
        metadataFields: clone(change.metadataFields),
        beforeMetadata: clone(change.beforeMetadata || {}),
        afterMetadata: clone(change.afterMetadata || {}),
      } : {}),
      ...(String(change?.name || "").trim() ? { name: String(change.name).trim() } : {}),
      fields,
      before: Object.fromEntries(Object.keys(fields).map((field) => [
        field,
        clone(change.before?.[field]),
      ])),
      after: Object.fromEntries(Object.keys(fields).map((field) => [
        field,
        clone(change.after?.[field]),
      ])),
    }];
  }));
  const sideEffects = [];
  const mutationSideEffects = Array.isArray(mutation?.commitResult?.sideEffectChanges)
    ? mutation.commitResult.sideEffectChanges
    : Array.isArray(mutation?.sideEffects)
      ? mutation.sideEffects
      : [];
  for (const sideEffect of mutationSideEffects) {
    if (sideEffect && !sideEffects.some((s) => s.id === sideEffect.id && s.type === sideEffect.type)) {
      sideEffects.push(clone(sideEffect));
    }
  }
  const coordinatedItemSideEffects = sideEffects.filter(
    (sideEffect) => sideEffect?.type === "item" && String(sideEffect.id || "").trim(),
  );
  const coordinatedItemIds = new Set(
    sideEffects
      .filter((sideEffect) => sideEffect?.type === "item")
      .map((sideEffect) => String(sideEffect.id || "").trim())
      .filter(Boolean),
  );
  // A coordinated scene-item create/delete is already represented by the
  // item side effect. The outer capture can also see the same lifecycle, but
  // its SDK-normalized snapshot is not necessarily byte-identical to the
  // pre-add builder snapshot. Keep one owner for that transition so the Undo
  // planner cannot process it once as a scene lifecycle and once as a side
  // effect with a different snapshot.
  const entryChanges = (entry?.changes || []).filter((change) => {
    const hasSceneLifecycle = Object.prototype.hasOwnProperty.call(change || {}, "sceneBefore")
      && Object.prototype.hasOwnProperty.call(change || {}, "sceneAfter");
    if (!hasSceneLifecycle || !coordinatedItemIds.has(String(change?.id || "").trim())) return true;
    const matchingSideEffect = coordinatedItemSideEffects.find((sideEffect) => (
      String(sideEffect.id || "").trim() === String(change.id || "").trim()
      && (
        change.sceneBefore === null
          && (sideEffect.before ?? null) === null
          && sideEffect.after?.id === change.sceneAfter?.id
        || change.sceneAfter === null
          && (sideEffect.after ?? null) === null
          && sideEffect.before?.id === change.sceneBefore?.id
      )
    ));
    return !matchingSideEffect;
  });
  for (const change of entry?.changes || []) {
    if (
      Object.prototype.hasOwnProperty.call(change || {}, "sceneBefore")
      && Object.prototype.hasOwnProperty.call(change || {}, "sceneAfter")
    ) {
      continue;
    }
    const coordinated = byId.has(change.id);
    const normalized = byId.get(change.id) || {
      id: change.id,
      ...(String(change?.name || "").trim() ? { name: String(change.name).trim() } : {}),
      fields: {},
      before: {},
      after: {},
    };
    if (!normalized.name && String(change?.name || "").trim()) normalized.name = String(change.name).trim();
    normalized.metadataFields ||= {};
    normalized.beforeMetadata ||= {};
    normalized.afterMetadata ||= {};
    for (const field of Object.keys(change?.before || {})) {
      if (coordinated && effectMetadataFields.includes(field)) continue;
      // A coordinated HP patch owns its actual commit baseline. The outer
      // wrapper's earlier snapshot must not absorb a concurrent HP change.
      if (normalized.metadataFields[field]) continue;
      normalized.metadataFields[field] = true;
      normalized.beforeMetadata[field] = clone(change.before[field]);
      normalized.afterMetadata[field] = clone(change.after?.[field]);
    }
    if (!Object.keys(normalized.metadataFields).length) {
      delete normalized.metadataFields;
      delete normalized.beforeMetadata;
      delete normalized.afterMetadata;
    }
    byId.set(change.id, normalized);
  }
  const changes = [...byId.values()];
  const sideEffectItemChanges = sideEffects
    .filter((s) => (s?.type === "item" || s?.type === "token:teleport" || s?.type === "token-position") && s.id)
    .map((s) => ({
      id: s.id,
      name: String(s.after?.name || s.before?.name || s.name || "").trim(),
      beforePosition: clone(s.beforePosition || s.before?.position),
      afterPosition: clone(s.afterPosition || s.after?.position),
    }));
  const effectiveChanges = (Array.isArray(entry?.changes) && entry.changes.length > 0)
    ? entryChanges
    : sideEffectItemChanges;
  const fields = Array.from(new Set(changes.flatMap((change) => [
    ...Object.keys(change.fields || {}).filter((field) => change.fields[field]),
    ...Object.keys(change.metadataFields || {}).filter((field) => change.metadataFields[field]),
  ])));
  return {
    ...entry,
    changes: effectiveChanges,
    effectsMutation: {
      version: 1,
      commandId: mutation?.commandId || `history-command:${entry.id}`,
      correlationId: mutation?.correlationId || mutation?.commandId || `history-command:${entry.id}`,
      commandType: entry.kind,
      sceneEpoch: mutation?.sceneEpoch ?? null,
      sceneIdentity: mutation?.sceneIdentity || null,
      targetIds: Array.from(new Set([
        ...changes.map((change) => change.id),
        ...effectiveChanges.map((change) => change.id),
        ...sideEffects.map((sideEffect) => sideEffect?.id),
      ].filter(Boolean))),
      fields,
      changes,
      sideEffects,
      legacyComposite: true,
    },
  };
}
