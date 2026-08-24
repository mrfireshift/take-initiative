import { combatEventCategory, combatEventFromHistoryEntry, normalizeCombatLogEvent } from "./combatLogCore.js";

export const COMBAT_LOG_V3_VERSION = 3;

const MOVEMENT_ORIGIN_KINDS = new Set([
  "scene-drag",
  "speed-tool",
  "system-effect",
  "history-undo",
  "obr-native-undo",
  "unknown",
]);

const HP_SNAPSHOT_KEYS = new Set(["before", "after", "hpMax", "delta", "hpMaxDelta"]);

function clone(value) {
  if (value === undefined) return undefined;
  if (typeof globalThis.structuredClone === "function") return globalThis.structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value || {}, key);
}

function textOrNull(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function booleanOrNull(value) {
  return typeof value === "boolean" ? value : null;
}

function normalizedPosition(value) {
  if (!isObject(value)) return null;
  const x = numberOrNull(value.x);
  const y = numberOrNull(value.y);
  return x === null || y === null ? null : { x, y };
}

function normalizePerson(value) {
  if (!isObject(value)) return null;
  const result = {};
  for (const key of ["id", "name", "role", "kind"]) {
    const normalized = textOrNull(value[key]);
    if (normalized !== null) result[key] = normalized;
  }
  return Object.keys(result).length ? result : null;
}

function normalizeCause(value) {
  if (!isObject(value)) return null;
  return clone(value);
}

function explicitCausality(event) {
  const payloadCausality = event?.payload?.causality;
  return isObject(payloadCausality) ? payloadCausality : null;
}

function collectionItemsForProvenance(event) {
  const items = [];
  for (const field of ["conditions", "spells", "concentrations"]) {
    const facet = event?.facets?.[field];
    if (!isObject(facet)) continue;
    items.push(
      ...(Array.isArray(facet.added) ? facet.added : []),
      ...(Array.isArray(facet.removed) ? facet.removed : []),
      ...(Array.isArray(facet.updated)
        ? facet.updated.map((item) => item?.after || item)
        : []),
    );
    for (const target of Array.isArray(facet.targets) ? facet.targets : []) {
      items.push(
        ...(Array.isArray(target?.added) ? target.added : []),
        ...(Array.isArray(target?.removed) ? target.removed : []),
        ...(Array.isArray(target?.updated)
          ? target.updated.map((item) => item?.after || item)
          : []),
      );
    }
  }
  return items;
}

function explicitClassFeatureSource(event) {
  const item = collectionItemsForProvenance(event).find((candidate) => (
    candidate?.type === "class-feature"
      && (textOrNull(candidate?.sourceId) || textOrNull(candidate?.sourceName))
      && (textOrNull(candidate?.effectId) || textOrNull(candidate?.parentEffectId))
  ));
  if (!item) return null;
  return {
    sourceId: textOrNull(item.sourceId),
    sourceName: textOrNull(item.sourceName),
    effectId: textOrNull(item.effectId),
    parentEffectId: textOrNull(item.parentEffectId),
  };
}

function normalizeActor(event) {
  if (isObject(event?.provenance?.actor)) {
    const actor = normalizePerson(event.provenance.actor);
    if (actor) return actor;
  }
  const causality = explicitCausality(event);
  if (isObject(causality?.actor)) {
    const actor = normalizePerson(causality.actor);
    if (actor) return actor;
  }
  if (isObject(causality?.caster)) {
    const actor = normalizePerson(causality.caster);
    if (actor) return actor;
  }
  if (causality?.casterId || causality?.casterName) {
    return normalizePerson({ id: causality.casterId, name: causality.casterName });
  }
  const classFeature = explicitClassFeatureSource(event);
  if (classFeature && (classFeature.sourceId || classFeature.sourceName)) {
    return normalizePerson({
      id: classFeature.sourceId,
      name: classFeature.sourceName,
      role: "source",
    });
  }
  return null;
}

function normalizeCauseValue(event) {
  if (isObject(event?.provenance?.cause)) {
    const cause = normalizeCause(event.provenance.cause);
    if (Object.keys(cause || {}).length) return cause;
  }
  const causality = explicitCausality(event);
  if (isObject(causality?.cause)) {
    const cause = normalizeCause(causality.cause);
    if (Object.keys(cause || {}).length) return cause;
  }
  if (causality?.spellId || causality?.spellName) {
    return {
      kind: "spell",
      ...(textOrNull(causality.spellId) ? { spellId: textOrNull(causality.spellId) } : {}),
      ...(textOrNull(causality.spellName) ? { spellName: textOrNull(causality.spellName) } : {}),
      ...(textOrNull(causality.instanceId) ? { instanceId: textOrNull(causality.instanceId) } : {}),
    };
  }
  const classFeature = explicitClassFeatureSource(event);
  if (classFeature) {
    return {
      kind: "class-feature",
      ...(classFeature.sourceId ? { sourceId: classFeature.sourceId } : {}),
      ...(classFeature.sourceName ? { sourceName: classFeature.sourceName } : {}),
      ...(classFeature.effectId ? { effectId: classFeature.effectId } : {}),
      ...(classFeature.parentEffectId ? { parentEffectId: classFeature.parentEffectId } : {}),
    };
  }
  return null;
}

function normalizeRecordingSource(event, { legacy = false, defaultValue = null } = {}) {
  const explicit = event?.provenance?.recordingSource
    ?? event?.recordingSource
    ?? defaultValue;
  const value = textOrNull(explicit);
  if (value) return value;
  return legacy ? "unknown" : null;
}

export function normalizeCombatLogTurnContext(value, fallback = null) {
  const raw = isObject(value) ? value : (isObject(fallback) ? fallback : {});
  return {
    activeId: textOrNull(raw.activeId ?? raw.id ?? raw.tokenId),
    activeName: textOrNull(raw.activeName ?? raw.name),
    turnIndex: numberOrNull(raw.turnIndex),
    turnKey: textOrNull(raw.turnKey),
    orderRevision: numberOrNull(raw.orderRevision),
  };
}

export function mergeCombatLogTurnContext(
  base,
  override,
  sessionOrderRevision = null,
) {
  const baseContext = normalizeCombatLogTurnContext(base);
  const overrideContext = isObject(override) ? override : null;
  const merged = {};
  for (const field of ["activeId", "activeName", "turnIndex", "turnKey"]) {
    merged[field] = overrideContext && hasOwn(overrideContext, field)
      ? overrideContext[field]
      : baseContext[field];
  }
  const overrideRevision = overrideContext && hasOwn(overrideContext, "orderRevision")
    ? numberOrNull(overrideContext.orderRevision)
    : null;
  merged.orderRevision = overrideRevision
    ?? numberOrNull(baseContext.orderRevision)
    ?? numberOrNull(sessionOrderRevision);
  return normalizeCombatLogTurnContext(merged);
}

export function normalizeCombatLogProvenance(event, options = {}) {
  const legacy = options.legacy === true;
  return {
    recordingSource: normalizeRecordingSource(event, { legacy, defaultValue: options.defaultValue }),
    actor: normalizeActor(event),
    cause: normalizeCauseValue(event),
  };
}

function normalizeHpTarget(target) {
  const raw = isObject(target) ? target : {};
  const before = isObject(raw.before) ? raw.before : {};
  const after = isObject(raw.after) ? raw.after : {};
  const beforeHp = numberOrNull(before.hp);
  const afterHp = numberOrNull(after.hp);
  const beforeMax = numberOrNull(before.hpMax);
  const afterMax = numberOrNull(after.hpMax);
  return {
    id: textOrNull(raw.id),
    name: textOrNull(raw.name),
    before: { hp: beforeHp, hpMax: beforeMax },
    after: { hp: afterHp, hpMax: afterMax },
    delta: numberOrNull(hasOwn(raw, "delta") ? raw.delta : (beforeHp !== null && afterHp !== null ? afterHp - beforeHp : null)),
    hpMaxDelta: numberOrNull(hasOwn(raw, "hpMaxDelta")
      ? raw.hpMaxDelta
      : (beforeMax !== null && afterMax !== null ? afterMax - beforeMax : null)),
  };
}

function hpTargetsFromEvent(event) {
  const facetTargets = event?.facets?.hp?.targets;
  if (Array.isArray(facetTargets)) return facetTargets;
  if (Array.isArray(event?.targets)) {
    const targets = event.targets.filter((target) => isObject(target) && (
      isObject(target.before) || isObject(target.after)
      || hasOwn(target, "delta") || hasOwn(target, "hpMaxDelta")
    ));
    if (targets.length) return targets;
  }
  const hpChange = event?.payload?.hpChange;
  const targetId = textOrNull(event?.payload?.targetId);
  if (isObject(hpChange) && (hasOwn(hpChange, "before") || hasOwn(hpChange, "after") || hasOwn(hpChange, "hpMax"))) {
    return [{
      id: targetId,
      name: textOrNull(event?.payload?.targetName),
      before: { hp: hpChange.before, hpMax: hpChange.hpMax },
      after: { hp: hpChange.after, hpMax: hpChange.hpMax },
    }];
  }
  return [];
}

function hpAction(targets, fallback = "change") {
  const actions = targets.map((target) => numberOrNull(target.delta)).filter((delta) => delta !== null && delta !== 0);
  if (!targets.length || targets.some((target) => numberOrNull(target.delta) === null)) return fallback;
  if (actions.length && actions.every((delta) => delta < 0)) return "damage";
  if (actions.length && actions.every((delta) => delta > 0)) return "healing";
  return fallback;
}

export function normalizeCombatLogHpFacet(event) {
  const raw = isObject(event?.facets?.hp) ? event.facets.hp : {};
  const targets = hpTargetsFromEvent(event).map(normalizeHpTarget);
  if (!targets.length && !isObject(event?.facets?.hp)) return null;
  return {
    ...(textOrNull(raw.action) ? { action: textOrNull(raw.action) } : { action: hpAction(targets) }),
    targets,
  };
}

function normalizeLineage(value) {
  return isObject(value) ? clone(value) : null;
}

function normalizeEffectItem(value, { includeLineage = true } = {}) {
  const item = isObject(value) ? clone(value) : { value: clone(value) };
  if (includeLineage && !hasOwn(item, "lineage")) item.lineage = null;
  return item;
}

function normalizeRemovedItem(value) {
  const item = normalizeEffectItem(value);
  item.removalReason = hasOwn(item, "removalReason") ? textOrNull(item.removalReason) : null;
  item.causeHistoryEntryId = hasOwn(item, "causeHistoryEntryId")
    ? textOrNull(item.causeHistoryEntryId)
    : null;
  return item;
}

function normalizeUpdatedItem(value) {
  const item = isObject(value) ? clone(value) : { value: clone(value) };
  if (!hasOwn(item, "lineage")) item.lineage = normalizeLineage(item.after?.lineage);
  if (isObject(item.after) && hasOwn(item.after, "lineage")) delete item.after.lineage;
  return item;
}

function normalizeCollectionTarget(value) {
  const target = isObject(value) ? clone(value) : {};
  target.added = Array.isArray(target.added) ? target.added.map((item) => normalizeEffectItem(item)) : [];
  target.updated = Array.isArray(target.updated) ? target.updated.map(normalizeUpdatedItem) : [];
  target.removed = Array.isArray(target.removed) ? target.removed.map(normalizeRemovedItem) : [];
  delete target.removalReason;
  delete target.causeHistoryEntryId;
  delete target.lineage;
  return target;
}

export function normalizeCombatLogCollectionFacet(value) {
  if (!isObject(value)) return null;
  const added = Array.isArray(value.added) ? value.added.map((item) => normalizeEffectItem(item)) : [];
  const updated = Array.isArray(value.updated) ? value.updated.map(normalizeUpdatedItem) : [];
  const removed = Array.isArray(value.removed) ? value.removed.map(normalizeRemovedItem) : [];
  const targets = Array.isArray(value.targets) ? value.targets.map(normalizeCollectionTarget) : [];
  const result = { ...clone(value), added, updated, removed, targets };
  // Questi attributi sono per-item: una copia al livello facet renderebbe
  // ambiguo quale rimozione o causa stiano descrivendo.
  delete result.removalReason;
  delete result.causeHistoryEntryId;
  delete result.lineage;
  return result;
}

function reminderNotices(event) {
  const replay = event?.payload?.replay;
  return [
    replay?.warning?.notice,
    replay?.descriptor?.notice,
    replay?.notice,
  ].filter(isObject);
}

function explicitRemovalCauseHistoryEntryId(event) {
  const payloadId = textOrNull(event?.payload?.causeHistoryEntryId);
  if (payloadId) return payloadId;
  for (const notice of reminderNotices(event)) {
    const id = textOrNull(notice.causeHistoryEntryId);
    if (id) return id;
  }
  return null;
}

function explicitReminderActions(event) {
  const notices = reminderNotices(event);
  const outcome = textOrNull(event?.payload?.outcome);
  const actions = [];
  for (const notice of notices) {
    const outcomes = notice?.resolution?.outcomes;
    if (!isObject(outcomes)) continue;
    const selected = outcome && isObject(outcomes[outcome])
      ? [outcomes[outcome]]
      : Object.values(outcomes);
    for (const resolution of selected) {
      if (Array.isArray(resolution?.actions)) actions.push(...resolution.actions);
    }
  }
  return actions.filter(isObject);
}

function explicitRemovalReason(event, item) {
  const payloadReason = textOrNull(event?.payload?.removalReason);
  if (payloadReason) return payloadReason;
  const actions = explicitReminderActions(event);
  if (actions.some((action) => (
    action.kind === "concentration" && action.action === "break"
  ))) {
    return "concentration-break";
  }
  const outcome = textOrNull(event?.payload?.outcome);
  if (outcome === "passed" && actions.some((action) => (
    action.kind === "condition" && action.action === "remove-instance"
  ))) {
    return "save-success";
  }
  if (outcome === "immune" && actions.some((action) => (
    action.kind === "condition" && action.action === "remove-instance"
  ))) {
    return "save-immunity";
  }
  if (event?.kind === "effects:tick-boundaries" && isObject(item?.expiry)) {
    const expiryMode = textOrNull(item.expiry.mode);
    if (expiryMode) return "temporal-expiry";
  }
  // The class-feature runtime emits a dedicated class-feature removal entry;
  // this is an explicit producer marker, unlike manualRemoval on the effect
  // itself, which only describes whether the effect is removable.
  if (
    event?.kind === "class-feature"
    && item?.type === "class-feature"
    && item?.manualRemoval === true
  ) {
    return "manual-removal";
  }
  return null;
}

function enrichCollectionRemovals(facet, event) {
  if (!isObject(facet)) return facet;
  const causeHistoryEntryId = explicitRemovalCauseHistoryEntryId(event);
  const enrich = (item) => {
    if (!isObject(item)) return item;
    const reason = item.removalReason || explicitRemovalReason(event, item);
    const cause = item.causeHistoryEntryId || causeHistoryEntryId;
    return {
      ...item,
      removalReason: reason || null,
      causeHistoryEntryId: cause || null,
    };
  };
  return {
    ...facet,
    removed: Array.isArray(facet.removed) ? facet.removed.map(enrich) : [],
    targets: Array.isArray(facet.targets)
      ? facet.targets.map((target) => ({
        ...target,
        removed: Array.isArray(target?.removed) ? target.removed.map(enrich) : [],
      }))
      : [],
  };
}

function normalizeMovementOrigin(value, fallback = "unknown") {
  const raw = isObject(value) ? value : {};
  const kind = textOrNull(raw.kind);
  return {
    ...clone(raw),
    kind: kind && MOVEMENT_ORIGIN_KINDS.has(kind) ? kind : fallback,
  };
}

function movementTargetsFromEvent(event) {
  const rawTargets = Array.isArray(event?.facets?.movement?.targets)
    ? event.facets.movement.targets
    : (event?.kind === "move" || event?.category === "movement" ? event.targets : []);
  return (Array.isArray(rawTargets) ? rawTargets : []).map((target) => ({
    ...clone(target),
    id: textOrNull(target?.id),
    name: textOrNull(target?.name),
    cells: numberOrNull(target?.cells),
    from: normalizedPosition(target?.from),
    to: normalizedPosition(target?.to),
  }));
}

export function normalizeCombatLogMovementFacet(event, options = {}) {
  const raw = isObject(event?.facets?.movement) ? event.facets.movement : null;
  const targets = movementTargetsFromEvent(event);
  if (!raw && !targets.length) return null;
  const origin = normalizeMovementOrigin(
    raw?.origin || event?.payload?.movement?.origin,
    options.defaultOrigin || "unknown",
  );
  return {
    ...(raw ? clone(raw) : {}),
    origin,
    targets,
  };
}

function normalizeHpOperation(value) {
  if (!isObject(value)) return null;
  return clone(value);
}

function removeHpSnapshotPayload(payload) {
  if (!isObject(payload)) return {};
  const result = clone(payload);
  const hpChange = result.hpChange;
  if (isObject(hpChange)) {
    const remainder = Object.fromEntries(Object.entries(hpChange).filter(([key]) => !HP_SNAPSHOT_KEYS.has(key)));
    if (Object.keys(remainder).length) result.hpChange = remainder;
    else delete result.hpChange;
  }
  return result;
}

function normalizeGenericTarget(target, category, hasHpFacet = false) {
  const raw = isObject(target) ? clone(target) : { value: clone(target) };
  if (category === "hp" || hasHpFacet) {
    for (const key of HP_SNAPSHOT_KEYS) delete raw[key];
  }
  return raw;
}

export function normalizeCombatLogInitiativeCardFacet(event) {
  const raw = event?.facets?.initiativeCard;
  if (isObject(raw)) return clone(raw);
  if (String(event?.kind || "") !== "initiative-card") return null;
  const explicitDiff = event?.payload?.initiativeCardDiff
    || event?.payload?.initiativeCard?.diff
    || event?.payload?.diff;
  if (isObject(explicitDiff)) {
    return {
      diff: clone(explicitDiff),
      changedFields: Array.isArray(explicitDiff.changedFields)
        ? explicitDiff.changedFields.map((field) => String(field))
        : [],
    };
  }
  const changes = Array.isArray(event?.changes) ? event.changes : [];
  const diffs = changes.map((change) => {
    const before = isObject(change?.beforeMetadata) ? clone(change.beforeMetadata) : null;
    const after = isObject(change?.afterMetadata) ? clone(change.afterMetadata) : null;
    if (!before && !after) return null;
    const changedFields = Array.from(new Set([
      ...Object.keys(before || {}),
      ...Object.keys(after || {}),
    ])).filter((key) => JSON.stringify(before?.[key]) !== JSON.stringify(after?.[key]));
    const changedBefore = Object.fromEntries(changedFields
      .filter((key) => hasOwn(before, key))
      .map((key) => [key, clone(before[key])]));
    const changedAfter = Object.fromEntries(changedFields
      .filter((key) => hasOwn(after, key))
      .map((key) => [key, clone(after[key])]));
    return {
      targetId: textOrNull(change?.id),
      changedFields,
      before: changedBefore,
      after: changedAfter,
    };
  }).filter(Boolean);
  if (!diffs.length) return { diff: null };
  return {
    diff: diffs.length === 1 ? diffs[0] : null,
    ...(diffs.length > 1 ? { diffs } : {}),
    changedFields: Array.from(new Set(diffs.flatMap((diff) => diff.changedFields))),
  };
}

export function normalizeCombatLogEventV3(event, options = {}) {
  const copy = normalizeCombatLogEvent(event);
  const legacy = Number(copy.version) < COMBAT_LOG_V3_VERSION;
  const category = String(copy.category || combatEventCategory(copy.kind));
  const turnContext = normalizeCombatLogTurnContext(copy.turnContext, copy.turn);
  const provenance = normalizeCombatLogProvenance(copy, {
    legacy,
    defaultValue: options.recordingSource,
  });
  const payload = removeHpSnapshotPayload(copy.payload);
  // reminder-resolution appartiene alla categoria save, ma il suo risultato
  // HP resta comunque canonico nella facet HP.
  const hp = normalizeCombatLogHpFacet(copy);
  const movement = normalizeCombatLogMovementFacet(copy, {
    defaultOrigin: options.movementOrigin,
  });
  const facets = {
    ...(isObject(copy.facets) ? clone(copy.facets) : {}),
    ...(hp ? { hp } : {}),
    ...(movement ? { movement } : {}),
  };
  for (const field of ["conditions", "spells", "concentrations"]) {
    if (facets[field]) {
      facets[field] = enrichCollectionRemovals(
        normalizeCombatLogCollectionFacet(facets[field]),
        copy,
      );
    }
  }
  if (facets.roster && isObject(facets.roster)) {
    const rosterSnapshot = normalizeCombatLogRosterSnapshot(facets.roster);
    if (rosterSnapshot) facets.roster = rosterSnapshot;
  }
  const initiativeCard = normalizeCombatLogInitiativeCardFacet(copy);
  if (initiativeCard) facets.initiativeCard = initiativeCard;
  if (payload.hpOperation !== undefined) {
    const hpOperation = normalizeHpOperation(payload.hpOperation);
    if (hpOperation) payload.hpOperation = hpOperation;
    else delete payload.hpOperation;
  }
  return {
    ...copy,
    version: COMBAT_LOG_V3_VERSION,
    category,
    turnContext,
    provenance,
    payload,
    targets: Array.isArray(copy.targets)
      ? copy.targets.map((target) => normalizeGenericTarget(target, category, Boolean(hp)))
      : [],
    ...(Object.keys(facets).length ? { facets } : {}),
  };
}

function sideEffects(entry) {
  return Array.isArray(entry?.effectsMutation?.sideEffects)
    ? entry.effectsMutation.sideEffects
    : (Array.isArray(entry?.sideEffects) ? entry.sideEffects : []);
}

function teleportMovement(entry) {
  const teleports = sideEffects(entry).filter((effect) => effect?.type === "token:teleport");
  if (!teleports.length) return null;
  const causality = explicitCausality(entry);
  const cause = isObject(causality?.cause) ? causality.cause : {};
  const targets = teleports.map((effect) => ({
    id: textOrNull(effect.id || effect.targetId),
    name: textOrNull(effect.name || effect.after?.name || effect.before?.name),
    cells: null,
    from: normalizedPosition(effect.beforePosition || effect.before?.position),
    to: normalizedPosition(effect.afterPosition || effect.after?.position),
  }));
  return {
    origin: {
      kind: "system-effect",
      ...(textOrNull(cause.spellId || causality?.spellId) ? { spellId: textOrNull(cause.spellId || causality.spellId) } : {}),
      ...(textOrNull(cause.spellName || causality?.spellName) ? { spellName: textOrNull(cause.spellName || causality.spellName) } : {}),
      ...(textOrNull(cause.instanceId || causality?.instanceId) ? { instanceId: textOrNull(cause.instanceId || causality.instanceId) } : {}),
    },
    targets,
  };
}

function positionsDiffer(left, right) {
  return JSON.stringify(normalizedPosition(left)) !== JSON.stringify(normalizedPosition(right));
}

function genericPositionMovement(entry) {
  const sources = [
    ...(Array.isArray(entry?.changes) ? entry.changes : []),
    ...(Array.isArray(entry?.effectsMutation?.changes) ? entry.effectsMutation.changes : []),
    ...sideEffects(entry),
  ];
  const targets = sources.map((source) => {
    const from = source?.beforePosition || source?.before?.position;
    const to = source?.afterPosition || source?.after?.position;
    if (!normalizedPosition(from) || !normalizedPosition(to) || !positionsDiffer(from, to)) return null;
    return {
      id: textOrNull(source?.id || source?.targetId || source?.after?.id || source?.before?.id),
      name: textOrNull(source?.name || source?.after?.name || source?.before?.name),
      cells: numberOrNull(source?.movement?.cells || source?.cells),
      from: normalizedPosition(from),
      to: normalizedPosition(to),
    };
  }).filter(Boolean);
  if (!targets.length) return null;
  return {
    origin: normalizeMovementOrigin(entry?.payload?.movement?.origin, "unknown"),
    targets,
  };
}

function explicitMovement(entry) {
  if (isObject(entry?.facets?.movement)) return clone(entry.facets.movement);
  if (isObject(entry?.payload?.movement)) return clone(entry.payload.movement);
  if (isObject(entry?.payload?.movementFacet)) return clone(entry.payload.movementFacet);
  return null;
}

function historyHpOperation(entry, hpFacet) {
  if (isObject(entry?.payload?.hpOperation)) return clone(entry.payload.hpOperation);
  if (isObject(entry?.hpOperation)) return clone(entry.hpOperation);
  const changes = [
    ...(Array.isArray(entry?.changes) ? entry.changes : []),
    ...(Array.isArray(entry?.effectsMutation?.changes) ? entry.effectsMutation.changes : []),
  ];
  const maxChanged = changes.some((change) => (
    change?.fields?.hpMax === true
    || change?.metadataFields?.hpMax === true
    || (isObject(change?.before) && isObject(change?.after)
      && (hasOwn(change.before, "hpMax") || hasOwn(change.after, "hpMax"))
      && numberOrNull(change.before.hpMax) !== numberOrNull(change.after.hpMax))
  ));
  const changedFields = [
    ...(changes.some((change) => change?.fields?.hp === true || change?.metadataFields?.hp === true) ? ["hp"] : []),
    ...(maxChanged ? ["hpMax"] : []),
  ];
  if (entry?.source === "manual" && changedFields.length) {
    return { kind: "sheet-edit", fields: changedFields };
  }
  // Il delta osservato classifica il risultato nella facet HP, ma non prova
  // l'intento dell'operatore. L'intento resta null finché il producer non lo
  // espone esplicitamente.
  void hpFacet;
  return null;
}

function conditionItemName(item) {
  return textOrNull(item?.condition || item?.name);
}

function nativeDerivedLineage(item, parent) {
  const parentId = textOrNull(parent?.id);
  if (!parentId) return null;
  return {
    relation: "derived",
    parentInstanceId: parentId,
    parentEffectId: textOrNull(parent?.parentEffectId),
    parentCondition: conditionItemName(parent),
  };
}

function enrichNativeConditionLineage(facet, entry) {
  if (!isObject(facet)) return facet;
  const collections = [
    ...(Array.isArray(facet.added) ? facet.added : []),
    ...(Array.isArray(facet.removed) ? facet.removed : []),
    ...(Array.isArray(facet.updated) ? facet.updated.map((item) => item?.after || item) : []),
  ];
  const byId = new Map(collections
    .filter((item) => textOrNull(item?.id))
    .map((item) => [String(item.id), item]));
  const parentFor = (item) => {
    const id = textOrNull(item?.id);
    const marker = id?.match(/^(.*):automatic:[^:]+$/u);
    if (!marker?.[1]) return null;
    const parent = byId.get(marker[1]);
    return parent && parent !== item ? parent : null;
  };
  const causeHistoryEntryId = textOrNull(entry?.id || entry?.historyEntryId);
  const addLineage = (item) => {
    if (!isObject(item) || hasOwn(item, "lineage") && item.lineage) return item;
    const parent = parentFor(item);
    if (!parent) return item;
    return {
      ...item,
      lineage: {
        ...nativeDerivedLineage(item, parent),
        causeHistoryEntryId,
      },
    };
  };
  return {
    ...facet,
    added: Array.isArray(facet.added) ? facet.added.map(addLineage) : [],
    removed: Array.isArray(facet.removed) ? facet.removed.map(addLineage) : [],
    updated: Array.isArray(facet.updated) ? facet.updated.map((item) => {
      if (!isObject(item) || (hasOwn(item, "lineage") && item.lineage)) return item;
      const enriched = addLineage(item.after || item);
      return enriched === (item.after || item)
        ? item
        : { ...item, lineage: enriched.lineage };
    }) : [],
  };
}

export function combatEventFromHistoryEntryV3(entry, context = {}) {
  const legacy = combatEventFromHistoryEntry(entry, context);
  const teleport = teleportMovement(entry);
  const movement = teleport || explicitMovement(entry) || genericPositionMovement(entry) || (
    legacy.kind === "move"
      ? {
        origin: isObject(entry?.payload?.movement?.origin)
          ? clone(entry.payload.movement.origin)
          : {
            kind: entry?.payload?.nativeUndo === true
              ? "obr-native-undo"
              : entry?.payload?.undoSource === "history"
                ? "history-undo"
                : "unknown",
          },
        targets: legacy.targets,
      }
      : null
  );
  const recordingSource = textOrNull(
    entry?.provenance?.recordingSource
      || entry?.recordingSource
      || context?.recordingSource
      || "history-observer",
  ) || "history-observer";
  const event = {
    ...legacy,
    version: COMBAT_LOG_V3_VERSION,
    ...(isObject(context?.turnContext) ? { turnContext: context.turnContext } : {}),
    provenance: {
      recordingSource,
      actor: normalizeActor(entry),
      cause: normalizeCauseValue(entry),
    },
    ...(movement ? { facets: { ...(legacy.facets || {}), movement } } : {}),
  };
  const normalized = normalizeCombatLogEventV3(event, {
    recordingSource,
    movementOrigin: movement?.origin?.kind,
  });
  const hpOperation = historyHpOperation(entry, normalized.facets?.hp);
  if (hpOperation) {
    normalized.payload = {
      ...(normalized.payload || {}),
      hpOperation,
    };
  }
  const initiativeCardInput = {
    ...normalized,
    facets: { ...(normalized.facets || {}) },
    changes: entry?.changes,
  };
  delete initiativeCardInput.facets.initiativeCard;
  const initiativeCard = normalizeCombatLogInitiativeCardFacet(initiativeCardInput);
  if (initiativeCard) normalized.facets = { ...(normalized.facets || {}), initiativeCard };
  if (normalized.facets?.conditions) {
    normalized.facets.conditions = enrichNativeConditionLineage(
      normalized.facets.conditions,
      entry,
    );
  }
  return normalized;
}

function normalizeRosterEntry(value) {
  const entry = isObject(value) ? clone(value) : {};
  return {
    ...entry,
    id: textOrNull(entry.id),
    name: textOrNull(entry.name),
    attitude: entry.attitude === null || entry.attitude === undefined ? null : clone(entry.attitude),
    hp: numberOrNull(entry.hp),
    hpMax: numberOrNull(entry.hpMax),
    initiative: numberOrNull(entry.initiative),
  };
}

export function normalizeCombatLogRosterSnapshot(value) {
  if (!isObject(value)) return null;
  return {
    ...clone(value),
    capturedAt: numberOrNull(value.capturedAt),
    capturedAtSequence: numberOrNull(value.capturedAtSequence),
    orderRevision: numberOrNull(value.orderRevision),
    orderIds: Array.isArray(value.orderIds)
      ? value.orderIds.map((id) => textOrNull(id)).filter((id) => id !== null)
      : [],
    entries: Array.isArray(value.entries) ? value.entries.map(normalizeRosterEntry) : [],
  };
}

export function normalizeCombatLogSessionV3(session) {
  const copy = isObject(session) ? clone(session) : {};
  const roster = isObject(copy.roster) ? copy.roster : {};
  const atExport = hasOwn(roster, "atExport") ? roster.atExport : roster.final;
  const normalizedRoster = { ...roster };
  delete normalizedRoster.final;
  return {
    ...copy,
    version: COMBAT_LOG_V3_VERSION,
    roster: {
      ...normalizedRoster,
      initial: normalizeCombatLogRosterSnapshot(roster.initial),
      atExport: normalizeCombatLogRosterSnapshot(atExport),
    },
  };
}

export function combatLogOrderSignature(order) {
  if (!Array.isArray(order)) return null;
  return JSON.stringify(order.map((id) => (id === null || id === undefined ? null : String(id))));
}

export function nextCombatLogOrderRevision(session, order) {
  const signature = combatLogOrderSignature(order);
  const previousSignature = textOrNull(session?.orderSignature);
  const previousRevision = numberOrNull(session?.orderRevision);
  if (!signature) {
    return { orderRevision: previousRevision, orderSignature: previousSignature };
  }
  if (signature === previousSignature && previousRevision !== null) {
    return { orderRevision: previousRevision, orderSignature: signature };
  }
  return {
    orderRevision: previousRevision === null ? 1 : previousRevision + 1,
    orderSignature: signature,
  };
}

export const MOVEMENT_ORIGIN_KIND = Object.freeze({
  SCENE_DRAG: "scene-drag",
  SPEED_TOOL: "speed-tool",
  SYSTEM_EFFECT: "system-effect",
  HISTORY_UNDO: "history-undo",
  OBR_NATIVE_UNDO: "obr-native-undo",
  UNKNOWN: "unknown",
});

export const normalizeCombatLogV3Event = normalizeCombatLogEventV3;
export const normalizeCombatLogV3Session = normalizeCombatLogSessionV3;
