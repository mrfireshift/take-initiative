import { CLASS_FEATURE_STATE_FIELD } from "./classFeatureCore.js";

const clone = (value) => {
  if (value === undefined) return undefined;
  if (typeof globalThis.structuredClone === "function") {
    try {
      return globalThis.structuredClone(value);
    } catch {}
  }
  return JSON.parse(JSON.stringify(value));
};

const UNDO_TRANSPORT_MARKER_FIELDS = Object.freeze([
  "hp",
  "hpMax",
  "conditions",
  "initiativeCard",
]);

const UNDO_TRANSPORT_VISUAL_FIELDS = Object.freeze([
  "spells",
  "concentrations",
]);

const UNDO_TRANSPORT_SPELL_FIELDS = Object.freeze([
  "instanceId",
  "spellId",
  "casterId",
]);

const UNDO_TRANSPORT_CONCENTRATION_FIELDS = Object.freeze([
  "instanceId",
  "spellId",
  "targets",
]);

const UNDO_TRANSPORT_FEATURE_FIELDS = Object.freeze([
  "instanceId",
  "featureId",
  "targetIds",
]);

function hasOwnUndoTransportField(value, field) {
  return Object.prototype.hasOwnProperty.call(value || {}, field);
}

function compactUndoSpell(value) {
  if (!value || typeof value !== "object") return value;
  const output = {};
  for (const field of UNDO_TRANSPORT_SPELL_FIELDS) {
    if (hasOwnUndoTransportField(value, field)) output[field] = clone(value[field]);
  }
  return output;
}

function compactUndoConcentrations(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => {
    if (!entry || typeof entry !== "object") return [key, entry];
    const compact = {};
    for (const field of UNDO_TRANSPORT_CONCENTRATION_FIELDS) {
      if (hasOwnUndoTransportField(entry, field)) compact[field] = clone(entry[field]);
    }
    return [key, compact];
  }));
}

function compactUndoFeatureState(value) {
  const source = value && typeof value === "object" ? value : {};
  const instances = Array.isArray(source.instances)
    ? source.instances.map((instance) => {
      if (!instance || typeof instance !== "object") return instance;
      const compact = {};
      for (const field of UNDO_TRANSPORT_FEATURE_FIELDS) {
        if (hasOwnUndoTransportField(instance, field)) compact[field] = clone(instance[field]);
      }
      return compact;
    })
    : [];
  return { instances };
}

function compactUndoFeatureSnapshot(value) {
  if (value && typeof value === "object" && hasOwnUndoTransportField(value, "present")) {
    return value.present === true
      ? { present: true, value: compactUndoFeatureState(value.value) }
      : { present: false };
  }
  return compactUndoFeatureState(value);
}

function compactUndoChangePart(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const output = {};
  for (const field of UNDO_TRANSPORT_MARKER_FIELDS) {
    if (hasOwnUndoTransportField(value, field)) output[field] = null;
  }
  for (const field of UNDO_TRANSPORT_VISUAL_FIELDS) {
    if (!hasOwnUndoTransportField(value, field)) continue;
    output[field] = field === "spells"
      ? (Array.isArray(value[field]) ? value[field].map(compactUndoSpell) : [])
      : compactUndoConcentrations(value[field]);
  }
  return Object.keys(output).length ? output : undefined;
}

function compactUndoMetadataPart(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const output = {};
  for (const field of UNDO_TRANSPORT_MARKER_FIELDS) {
    if (hasOwnUndoTransportField(value, field)) output[field] = null;
  }
  if (hasOwnUndoTransportField(value, CLASS_FEATURE_STATE_FIELD)) {
    output[CLASS_FEATURE_STATE_FIELD] = compactUndoFeatureSnapshot(value[CLASS_FEATURE_STATE_FIELD]);
  }
  return Object.keys(output).length ? output : undefined;
}

function compactUndoChange(change) {
  if (!change || typeof change !== "object") return null;
  const output = { id: change.id };
  const before = compactUndoChangePart(change.before);
  const after = compactUndoChangePart(change.after);
  const beforeMetadata = compactUndoMetadataPart(change.beforeMetadata);
  const afterMetadata = compactUndoMetadataPart(change.afterMetadata);
  if (before) output.before = before;
  if (after) output.after = after;
  if (beforeMetadata) output.beforeMetadata = beforeMetadata;
  if (afterMetadata) output.afterMetadata = afterMetadata;
  return output;
}

function compactUndoCommitResult(value) {
  if (!value || typeof value !== "object") return value;
  const output = {};
  for (const field of ["status", "committed", "reason", "failure", "recovery", "postCommitErrors"]) {
    if (hasOwnUndoTransportField(value, field)) output[field] = clone(value[field]);
  }
  return output;
}

function compactUndoPlan(plan, changedIds = []) {
  return {
    historyUndo: plan.historyUndo === true,
    changes: (Array.isArray(plan.changes) ? plan.changes : [])
      .map(compactUndoChange)
      .filter(Boolean),
    changedIds: clone(Array.isArray(plan.changedIds) ? plan.changedIds : changedIds),
    ...(plan.metadataKey ? { metadataKey: String(plan.metadataKey) } : {}),
    ...(plan.effectKeys && typeof plan.effectKeys === "object"
      ? { effectKeys: clone(plan.effectKeys) }
      : {}),
  };
}

// L'Undo generico costruisce internamente snapshot completi degli item per
// prevalidazione, commit e recovery. Quegli snapshot appartengono però al
// coordinatore background: al client servono solo i change-set necessari al
// reconcile derivato. Evita quindi di trasportare initialItems/finalItems/states
// attraverso OBR.broadcast dopo che il commit è già avvenuto.
export function compactBackgroundUndoTransportResult(result) {
  if (!result || typeof result !== "object" || !result.plan || typeof result.plan !== "object") {
    return result;
  }
  const plan = result.plan;
  const changedIds = Array.isArray(result.changedIds)
    ? result.changedIds
    : plan.changedIds || [];
  const compact = {
    status: result.status,
    commandId: result.commandId,
    correlationId: result.correlationId,
    sceneEpoch: result.sceneEpoch,
    sceneIdentity: result.sceneIdentity,
    kind: result.kind,
    committed: result.committed === true,
    changedIds: clone(changedIds),
    plan: compactUndoPlan(plan, changedIds),
    ...(hasOwnUndoTransportField(result, "commitResult")
      ? { commitResult: compactUndoCommitResult(result.commitResult) }
      : {}),
  };
  for (const field of [
    "reason",
    "error",
    "conflicts",
    "recovery",
    "postCommitErrors",
    "historyError",
    "historyPending",
    "historyRecovered",
    "historySkipped",
  ]) {
    if (hasOwnUndoTransportField(result, field)) compact[field] = clone(result[field]);
  }
  return compact;
}
