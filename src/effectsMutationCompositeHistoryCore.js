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
  for (const change of entry?.changes || []) {
    if (
      Object.prototype.hasOwnProperty.call(change || {}, "sceneBefore")
      && Object.prototype.hasOwnProperty.call(change || {}, "sceneAfter")
    ) {
      sideEffects.push({
        id: change.id,
        type: "item",
        before: clone(change.sceneBefore),
        after: clone(change.sceneAfter),
      });
      continue;
    }
    const normalized = byId.get(change.id) || {
      id: change.id,
      fields: {},
      before: {},
      after: {},
    };
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
  const fields = Array.from(new Set(changes.flatMap((change) => [
    ...Object.keys(change.fields || {}).filter((field) => change.fields[field]),
    ...Object.keys(change.metadataFields || {}).filter((field) => change.metadataFields[field]),
  ])));
  return {
    ...entry,
    effectsMutation: {
      version: 1,
      commandId: mutation?.commandId || `history-command:${entry.id}`,
      correlationId: mutation?.correlationId || mutation?.commandId || `history-command:${entry.id}`,
      commandType: entry.kind,
      sceneEpoch: mutation?.sceneEpoch ?? null,
      sceneIdentity: mutation?.sceneIdentity || null,
      targetIds: Array.from(new Set(changes.map((change) => change.id))),
      fields,
      changes,
      sideEffects,
      legacyComposite: true,
    },
  };
}
