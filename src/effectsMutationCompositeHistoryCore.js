const clone = (value) => value === undefined ? undefined : structuredClone(value);

export function decorateCompositeEffectsHistoryEntry({
  entry,
  mutation = null,
  effectMetadataFields = [],
} = {}) {
  const byId = new Map((mutation?.changes || []).map((change) => {
    const fields = Object.fromEntries(
      Object.entries(change?.fields || {}).filter(([, touched]) => touched)
    );
    return [change.id, {
      id: change.id,
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
  for (const change of entry?.changes || []) {
    if (
      Object.prototype.hasOwnProperty.call(change || {}, "sceneBefore")
      && Object.prototype.hasOwnProperty.call(change || {}, "sceneAfter")
    ) {
      continue;
    }
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
      if (effectMetadataFields.includes(field)) continue;
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
    ? entry.changes
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
      ].filter(Boolean))),
      fields,
      changes,
      sideEffects,
      legacyComposite: true,
    },
  };
}
