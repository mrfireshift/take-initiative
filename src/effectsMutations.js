import OBR from "@owlbear-rodeo/sdk";
import {
  EFFECTS_MUTATION_COMMAND_CHANNEL,
  EFFECTS_MUTATION_RESULT_CHANNEL,
  ID,
} from "./constants.js";
import {
  CONDITION_LIST,
  getConditionInstances,
  reconcileExhaustionCondition,
} from "./conditions.js";
import { CLASS_FEATURE_STATE_FIELD } from "./classFeatureCore.js";
import { effectsDiagnostics } from "./effectsDiagnostics.js";
import {
  saveSpellResolutionOperations,
  saveSpellTriggerResolutionOperations,
} from "./saveSpellOperationsCore.js";
import { catalogSpellApplicationOperations } from "./spellLifecycleOperationsCore.js";
import {
  resolveZeroHPUnconsciousAction,
  ZERO_HP_UNCONSCIOUS_TYPE,
} from "./hpConditionRulesCore.js";
import {
  buildEffectsMutationPlan,
  EFFECTS_MUTATION_CONDITION_VERSION,
} from "./effectsMutationCore.js";
import {
  SPELL_STATIC_ZONE_META_KEY,
  SPELL_ZONE_MOVEMENT_CONTROL_FIELD,
  translatedZoneArea,
} from "./spellStaticZoneCore.js";
import {
  isSpellChildZoneMetadata,
  validateChildZoneContainment,
} from "./spellChildZoneCore.js";
import { getSpellAreaRuleById } from "./spellAreaRules.js";
import { spellAreaOriginWithinRange } from "./spellAreaPlacementCore.js";
import { planSpellZoneMovement } from "./spellZoneMovementCore.js";
import {
  SPELL_BOARD_TOKEN_META_KEY,
  getSpellBoardTokenRule,
  planSpellBoardTokenStateUpdate,
  spellBoardTokenItemsEndedByPlan,
} from "./spellBoardTokenCore.js";
import { SPELL_AURA_META_KEY } from "./spellAuraCore.js";
import { CLASS_FEATURE_AURA_META_KEY } from "./classFeatureAuraCore.js";
import { CUSTOM_AURA_META_KEY } from "./customAuraCore.js";
import { consumeSpellZoneTrigger, normalizeSpellZoneTriggerRuntime } from "./spellZoneTriggerCore.js";
import {
  createEffectsMutationCoordinator,
  EFFECTS_MUTATION_STATUS,
  mutationResultError,
} from "./effectsMutationCoordinator.js";
import { createEffectsMutationBackgroundBroker } from "./effectsMutationBroker.js";
import { buildCoordinatedEffectsUndoPlan } from "./effectsMutationUndoCore.js";
import {
  currentSceneEpoch,
  invalidateSceneEpoch,
  isCurrentSceneEpoch,
  markSceneEpochReady,
} from "./sceneEpoch.js";
import { emitMatchedVisualEndsFromMutation } from "./embersMatchedVisualRenderer.js";
import { initiativeTurnKeyAtOrdinal } from "./turnBoundaryCore.js";

const META_KEY = `${ID}/meta`;
const SPELLS_META_KEY = `${ID}/spells`;
const CONC_META_KEY = `${ID}/concentration`;

const clone = (value) => {
  if (value === undefined) return undefined;
  if (typeof globalThis.structuredClone === "function") return globalThis.structuredClone(value);
  return JSON.parse(JSON.stringify(value));
};

function isBackgroundRuntime(options = {}) {
  const pathname = String(globalThis.location?.pathname || "");
  return options.transport === "background"
    || backgroundServiceMounted
    || /background\.html$/iu.test(pathname);
}

function backgroundTransportAvailable() {
  return typeof OBR?.broadcast?.sendMessage === "function"
    && typeof OBR?.broadcast?.onMessage === "function";
}

function assertSerializableCommand(value) {
  const seen = new Set();
  const visit = (entry, path = "command") => {
    const type = typeof entry;
    if (["function", "symbol", "bigint"].includes(type)) {
      throw new TypeError(`${path}-must-be-json-safe`);
    }
    if (type === "undefined") return;
    if (type === "number" && !Number.isFinite(entry)) {
      throw new TypeError(`${path}-must-be-json-safe`);
    }
    if (!entry || type !== "object") return;
    if (seen.has(entry)) throw new TypeError(`${path}-must-not-be-cyclic`);
    seen.add(entry);
    if (Array.isArray(entry)) {
      entry.forEach((item, index) => visit(item, `${path}[${index}]`));
      seen.delete(entry);
      return;
    }
    const prototype = Object.getPrototypeOf(entry);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError(`${path}-must-be-a-plain-object`);
    }
    for (const [key, item] of Object.entries(entry)) visit(item, `${path}.${key}`);
    seen.delete(entry);
  };
  visit(value);
}

function jsonSafeClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function backgroundResultError(commandId, message) {
  return {
    status: EFFECTS_MUTATION_STATUS.FAILED,
    commandId,
    correlationId: commandId,
    error: { name: "BackgroundTransportError", message },
    changedIds: [],
    changes: [],
  };
}

function mountBackgroundResultListener() {
  if (backgroundResultUnsubscribe || typeof OBR?.broadcast?.onMessage !== "function") return;
  backgroundResultUnsubscribe = OBR.broadcast.onMessage(
    EFFECTS_MUTATION_RESULT_CHANNEL,
    (event) => {
      const data = event?.data;
      const request = backgroundPendingRequests.get(data?.requestId);
      if (!request) return;
      backgroundPendingRequests.delete(data.requestId);
      clearTimeout(request.timer);
      request.resolve(data.result || backgroundResultError(data.requestId, "Risposta coordinatore mancante."));
    },
  );
}

function requestBackgroundMutation(kind, payload, commandId) {
  mountBackgroundResultListener();
  const requestId = createId("effects-transport");
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      backgroundPendingRequests.delete(requestId);
      resolve(backgroundResultError(
        commandId,
        "Timeout del coordinatore effetti in background.",
      ));
    }, BACKGROUND_TRANSPORT_TIMEOUT_MS);
    backgroundPendingRequests.set(requestId, { resolve, timer });
    void OBR.broadcast.sendMessage(
      EFFECTS_MUTATION_COMMAND_CHANNEL,
      { requestId, kind, ...payload },
      { destination: "LOCAL" },
    ).catch((error) => {
      const request = backgroundPendingRequests.get(requestId);
      if (!request) return;
      backgroundPendingRequests.delete(requestId);
      clearTimeout(request.timer);
      request.resolve(backgroundResultError(
        commandId,
        String(error?.message || error || "Invio al coordinatore fallito."),
      ));
    });
  });
}

async function requestBackgroundSceneIdentity(commandId) {
  const result = await requestBackgroundMutation("context", {}, commandId);
  if (result?.status !== EFFECTS_MUTATION_STATUS.APPLIED || !result.sceneIdentity) {
    throw mutationResultError(result);
  }
  return result.sceneIdentity;
}

const uniqueIds = (values = []) => Array.from(new Set(
  (Array.isArray(values) ? values : []).map((value) => String(value || "").trim()).filter(Boolean)
));

function createId(prefix) {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch {}
  return `${prefix}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`;
}

function normalizedSceneItem(item) {
  const meta = item?.metadata?.[META_KEY] || {};
  const conditions = getConditionInstances(meta.conditions || {}).map((instance) => {
    const next = clone(instance);
    delete next.legacy;
    return next;
  });
  return {
    id: item?.id,
    name: item?.name,
    spells: Array.isArray(meta[SPELLS_META_KEY]) ? meta[SPELLS_META_KEY] : [],
    concentrations: meta[CONC_META_KEY] && typeof meta[CONC_META_KEY] === "object"
      ? meta[CONC_META_KEY]
      : {},
    conditions,
  };
}

function prepareOperation(operation) {
  const next = clone(operation || {});
  next.operationId ||= createId("effect-operation");
  next.createdAt ||= Date.now();
  const targetIds = uniqueIds(next.targetIds);
  next.targetIds = targetIds;

  if (["condition:add", "condition:add-custom", "condition:toggle", "condition:set-instances"].includes(next.type)) {
    next.instanceIds = { ...(next.instanceIds || {}) };
    next.consequenceInstanceIds = { ...(next.consequenceInstanceIds || {}) };
    const consequenceTargetIds = uniqueIds([
      ...targetIds,
      ...Object.keys(next.instancesByTarget || {}),
    ]);
    for (const targetId of consequenceTargetIds) {
      if (next.type !== "condition:set-instances") {
        next.instanceIds[targetId] ||= createId("condition");
      }
      next.consequenceInstanceIds[targetId] = {
        ...(next.consequenceInstanceIds[targetId] || {}),
        prono: next.consequenceInstanceIds[targetId]?.prono || createId("condition-auto"),
      };
    }
  }

  if (next.type === "spell:upsert") {
    next.entryIds = { ...(next.entryIds || {}) };
    for (const targetId of targetIds) {
      next.entryIds[targetId] ||= createId("spell-entry");
    }
  }
  return next;
}

function metadataFieldSnapshot(meta, field) {
  const present = Object.prototype.hasOwnProperty.call(meta || {}, field);
  return present ? { present: true, value: clone(meta[field]) } : { present: false };
}

function sceneItemMetadataSnapshot(item, field) {
  return metadataFieldSnapshot(item?.metadata || {}, field);
}

function metadataSnapshotMatches(actual, expected) {
  if (!expected || typeof expected !== "object") return true;
  if (!!actual?.present !== !!expected.present) return false;
  return !actual.present || sameValue(actual.value, expected.value);
}

function applyMetadataPatchesToPlan(plan, sceneItems, metadataPatches = []) {
  const itemsById = new Map(sceneItems.map((item) => [item.id, item]));
  const changesById = new Map((plan.changes || []).map((change) => [change.id, change]));
  const conflicts = [];
  for (const patch of Array.isArray(metadataPatches) ? metadataPatches : []) {
    const id = String(patch?.id || "").trim();
    const item = itemsById.get(id);
    if (!id || !item) {
      conflicts.push({ itemId: id || null, reason: "missing-item" });
      continue;
    }
    const meta = item.metadata?.[META_KEY] || {};
    let change = changesById.get(id) || {
      id,
      fields: { spells: false, concentrations: false, conditions: false },
      before: {
        spells: clone(normalizedSceneItem(item).spells),
        concentrations: clone(normalizedSceneItem(item).concentrations),
        conditions: clone(normalizedSceneItem(item).conditions),
      },
      after: {
        spells: clone(normalizedSceneItem(item).spells),
        concentrations: clone(normalizedSceneItem(item).concentrations),
        conditions: clone(normalizedSceneItem(item).conditions),
      },
    };
    change.metadataFields ||= {};
    change.beforeMetadata ||= {};
    change.afterMetadata ||= {};
    for (const [field, descriptor] of Object.entries(patch?.fields || {})) {
      if (["conditions", SPELLS_META_KEY, CONC_META_KEY].includes(field)) {
        conflicts.push({ itemId: id, field, reason: "effects-field-requires-operation" });
        continue;
      }
      const actual = metadataFieldSnapshot(meta, field);
      if (!metadataSnapshotMatches(actual, descriptor?.expected)) {
        conflicts.push({ itemId: id, field, reason: "current-value-mismatch" });
        continue;
      }
      if (descriptor?.mode === "assert") continue;
      const after = descriptor?.mode === "delete"
        ? { present: false }
        : { present: true, value: clone(descriptor?.value) };
      if (sameValue(actual, after)) continue;
      change.metadataFields[field] = true;
      change.beforeMetadata[field] = actual;
      change.afterMetadata[field] = after;
    }
    if (Object.keys(change.metadataFields).length) {
      changesById.set(id, change);
    }
  }
  if (conflicts.length) return { status: EFFECTS_MUTATION_STATUS.CONFLICT, conflicts };
  plan.changes = [...changesById.values()];
  plan.changedIds = plan.changes.map((change) => change.id);
  return plan;
}

function expandStateDependentOperations(operations, sceneItems) {
  const byId = new Map(sceneItems.map((item) => [item.id, item]));
  return operations.flatMap((operation) => {
    if (operation?.type === "condition:reconcile-exhaustion") {
      const instancesByTarget = {};
      for (const targetId of uniqueIds(operation.targetIds)) {
        const item = byId.get(targetId);
        const next = reconcileExhaustionCondition(
          item?.metadata?.[META_KEY]?.conditions,
          operation.level,
          targetId,
        );
        instancesByTarget[targetId] = getConditionInstances(next || {});
      }
      return [{ type: "condition:set-instances", instancesByTarget }];
    }
    if (operation?.type === "condition:reconcile-zero-hp") {
      const addIds = [];
      const removals = [];
      for (const targetId of uniqueIds(operation.targetIds)) {
        const item = byId.get(targetId);
        if (!item) continue;
        const meta = item.metadata?.[META_KEY] || {};
        const action = resolveZeroHPUnconsciousAction(
          meta,
          getConditionInstances(meta.conditions || {}),
        );
        if (action.add) addIds.push(targetId);
        for (const instanceId of action.removeInstanceIds) removals.push({ itemId: targetId, instanceId });
      }
      return [
        ...(addIds.length ? [{
          type: "condition:add",
          targetIds: addIds,
          conditionName: "Privo di sensi",
          options: { type: ZERO_HP_UNCONSCIOUS_TYPE, expiry: { mode: "manual" } },
        }] : []),
        ...(removals.length ? [{ type: "condition:remove-instances", removals }] : []),
        ...(addIds.length ? [{ type: "condition:automate", subjectIds: addIds }] : []),
      ];
    }
    if (operation?.type === "spell:remove-requested") {
      const targetId = uniqueIds(operation.targetIds)[0];
      const item = byId.get(targetId);
      const spells = Array.isArray(item?.metadata?.[META_KEY]?.[SPELLS_META_KEY])
        ? item.metadata[META_KEY][SPELLS_META_KEY]
        : [];
      const requestedInstanceId = String(operation.instanceId || "").trim();
      const requestedName = String(operation.name || "").trim().toLocaleLowerCase();
      const spell = spells.filter((entry) => entry?.castContext?.staticZoneOwner !== true)
        .find((entry) => requestedInstanceId && String(entry?.instanceId || "").trim() === requestedInstanceId)
        || spells.filter((entry) => entry?.castContext?.staticZoneOwner !== true)
          .find((entry) => requestedName && String(entry?.name || "").trim().toLocaleLowerCase() === requestedName);
      const instanceId = String(spell?.instanceId || "").trim();
      if (!targetId || !spell || !instanceId) return [];
      return [
        ...(spell.conc === true && spell.casterId ? [{
          type: "concentration:break-targets",
          casterIds: [spell.casterId],
          reference: instanceId,
          targetIds: [targetId],
        }] : []),
        { type: "spell:remove-instance", targetIds: [targetId], instanceId },
      ];
    }
    return [operation];
  });
}

function projectedSceneItems(sceneItems, plan) {
  const changes = new Map((plan?.changes || []).map((change) => [change.id, change]));
  return sceneItems.map((item) => {
    const projected = clone(item);
    const change = changes.get(item.id);
    if (!change) return projected;
    const meta = { ...(projected.metadata?.[META_KEY] || {}) };
    if (change.fields?.spells) meta[SPELLS_META_KEY] = clone(change.after.spells || []);
    if (change.fields?.concentrations) {
      meta[CONC_META_KEY] = clone(change.after.concentrations || {});
    }
    if (change.fields?.conditions) {
      const instances = clone(change.after.conditions || []);
      if (instances.length) {
        meta.conditions = { version: EFFECTS_MUTATION_CONDITION_VERSION, instances };
      } else {
        delete meta.conditions;
      }
    }
    for (const [field, descriptor] of Object.entries(change.afterMetadata || {})) {
      if (!change.metadataFields?.[field]) continue;
      if (descriptor?.present) meta[field] = clone(descriptor.value);
      else delete meta[field];
    }
    projected.metadata = { ...(projected.metadata || {}), [META_KEY]: meta };
    return projected;
  });
}

function removedClassFeatureConditionsForPlan(plan) {
  const removed = [];
  const skipped = new Set(plan?.skipClassFeatureReconcileIds || []);
  for (const change of plan?.changes || []) {
    if (!change.fields?.conditions) continue;
    const before = Array.isArray(change.before?.conditions) ? change.before.conditions : [];
    const after = Array.isArray(change.after?.conditions) ? change.after.conditions : [];
    const afterIds = new Set(after.map((instance) => String(instance?.id || "")));
    const afterClassFeatures = after.filter((instance) =>
      ["class-feature", "class-feature-area"].includes(String(instance?.type || ""))
    );
    for (const instance of before) {
      const replaced = afterClassFeatures.some((next) =>
        String(next?.parentEffectId || "") === String(instance?.parentEffectId || "")
        && String(next?.sourceId || "") === String(instance?.sourceId || "")
        && String(next?.targetId || "") === String(instance?.targetId || "")
        && String(next?.effectId || "") === String(instance?.effectId || "")
      );
      if (
        ["class-feature", "class-feature-area"].includes(String(instance?.type || ""))
        && !afterIds.has(String(instance?.id || ""))
        && !replaced
        && !skipped.has(String(instance?.id || ""))
      ) {
        removed.push(instance);
      }
    }
  }
  return removed;
}

function mergeClassFeatureReconciliation(plan, details = []) {
  const byId = new Map((plan?.changes || []).map((change) => [change.id, change]));
  for (const detail of details) {
    let change = byId.get(detail.id);
    if (!change) {
      change = {
        id: detail.id,
        fields: { spells: false, concentrations: false, conditions: false },
        before: { conditions: clone(detail.beforeConditions) },
        after: { conditions: clone(detail.beforeConditions) },
      };
      plan.changes.push(change);
      byId.set(detail.id, change);
      if (!plan.changedIds.includes(detail.id)) plan.changedIds.push(detail.id);
    }
    if (!sameValue(detail.beforeConditions, detail.afterConditions)) {
      change.fields ||= {};
      change.fields.conditions = true;
      change.before ||= {};
      change.after ||= {};
      if (!Object.prototype.hasOwnProperty.call(change.before, "conditions")) {
        change.before.conditions = clone(detail.beforeConditions);
      }
      change.after.conditions = clone(detail.afterConditions);
    }
    if (!sameValue(detail.beforeState, detail.afterState)) {
      change.metadataFields ||= {};
      change.beforeMetadata ||= {};
      change.afterMetadata ||= {};
      change.metadataFields[CLASS_FEATURE_STATE_FIELD] = true;
      change.beforeMetadata[CLASS_FEATURE_STATE_FIELD] = clone(detail.beforeState);
      change.afterMetadata[CLASS_FEATURE_STATE_FIELD] = clone(detail.afterState);
    }
  }
}

const mutationStats = {
  plans: 0,
  commits: 0,
  noChange: 0,
  failed: 0,
  commands: 0,
  changedItems: 0,
  updateCalls: 0,
  requestedItems: 0,
  lastPlan: null,
};

export function resetEffectsMutationDiagnostics() {
  Object.assign(mutationStats, {
    plans: 0,
    commits: 0,
    noChange: 0,
    failed: 0,
    commands: 0,
    changedItems: 0,
    updateCalls: 0,
    requestedItems: 0,
    lastPlan: null,
  });
}

export function getEffectsMutationDiagnostics() {
  return clone(mutationStats);
}

export async function prepareEffectsMutation(operations = [], {
  command = {},
  isCurrent = null,
} = {}) {
  const canPrepare = () => typeof isCurrent !== "function" || isCurrent();
  const mutationId = createId("effects-mutation");
  const sceneItems = await OBR.scene.items.getItems();
  if (!canPrepare()) return { status: EFFECTS_MUTATION_STATUS.REJECTED, reason: "stale-after-read" };
  const preparedOperations = expandStateDependentOperations(
    Array.isArray(operations) ? operations : [],
    sceneItems,
  ).map(prepareOperation).filter((operation) => operation.type);
  const plan = buildEffectsMutationPlan(
    sceneItems.map(normalizedSceneItem),
    preparedOperations,
    {
      knownConditionNames: CONDITION_LIST,
      maxCustomConditions: 3,
    }
  );
  const patchedPlan = applyMetadataPatchesToPlan(
    plan,
    sceneItems,
    command.metadataPatches,
  );
  if (patchedPlan?.status) return patchedPlan;
  plan.mutationId = mutationId;
  plan.scannedItems = sceneItems.length;
  plan.skipClassFeatureReconcileIds = preparedOperations
    .filter((operation) => operation.type === "condition:remove-instances")
    .flatMap((operation) => (Array.isArray(operation.removals) ? operation.removals : []))
    .filter((removal) => removal?.skipClassFeatureReconcile === true)
    .map((removal) => String(removal.instanceId || "").trim())
    .filter(Boolean);
  const removedClassFeatureConditions = removedClassFeatureConditionsForPlan(plan);
  if (removedClassFeatureConditions.length) {
    const { reconcileClassFeatureActivationsAfterConditionRemoval } =
      await import("./classFeatureRuntime.js");
    if (!canPrepare()) {
      return { status: EFFECTS_MUTATION_STATUS.REJECTED, reason: "stale-before-class-feature-plan" };
    }
    const reconciliation = await reconcileClassFeatureActivationsAfterConditionRemoval(
      removedClassFeatureConditions,
      {
        returnDetails: true,
        isCurrent: canPrepare,
        sourceItems: projectedSceneItems(sceneItems, plan),
      },
    );
    if (!canPrepare()) {
      return { status: EFFECTS_MUTATION_STATUS.REJECTED, reason: "stale-after-class-feature-plan" };
    }
    mergeClassFeatureReconciliation(plan, reconciliation?.details || []);
  }

  mutationStats.plans += 1;
  mutationStats.commands += preparedOperations.length;
  mutationStats.changedItems += plan.changedIds.length;
  mutationStats.lastPlan = {
    mutationId,
    commands: preparedOperations.map((operation) => operation.type),
    changedIds: [...plan.changedIds],
    scannedItems: sceneItems.length,
  };
  effectsDiagnostics.event("mutation:plan", {
    mutationId,
    commands: preparedOperations.map((operation) => operation.type),
    changedItems: plan.changedIds.length,
    scannedItems: sceneItems.length,
  });
  return plan;
}

async function commitEffectsMutationPlan(plan, { isCurrent = null } = {}) {
  const canCommit = () => typeof isCurrent !== "function" || isCurrent();
  if (!backgroundServiceMounted) throw new Error("effects-commit-requires-background-runtime");
  if (!canCommit()) return [];
  const changes = Array.isArray(plan?.changes) ? plan.changes : [];
  const mutationId = String(plan?.mutationId || createId("effects-mutation"));
  if (!changes.length) {
    mutationStats.noChange += 1;
    effectsDiagnostics.event("mutation:no-change", { mutationId });
    return { changedIds: [], committed: false };
  }

  const byId = new Map(changes.map((change) => [change.id, change]));
  const ids = [...byId.keys()];
  let writeAuthorized = false;
  try {
    if (!canCommit()) {
      return {
        status: EFFECTS_MUTATION_STATUS.REJECTED,
        reason: "stale-before-effects-write",
        committed: false,
        changedIds: [],
      };
    }
    mutationStats.updateCalls += 1;
    mutationStats.requestedItems += ids.length;
    await OBR.scene.items.updateItems(ids, (drafts) => {
      if (!canCommit()) return;
      writeAuthorized = true;
      for (const item of drafts) {
        const change = byId.get(item.id);
        if (!change) continue;
        const meta = { ...(item.metadata?.[META_KEY] || {}) };
        if (change.fields?.spells) {
          meta[SPELLS_META_KEY] = clone(change.after.spells || []);
        }
        if (change.fields?.concentrations) {
          meta[CONC_META_KEY] = clone(change.after.concentrations || {});
        }
        if (change.fields?.conditions) {
          const instances = clone(change.after.conditions || []);
          if (instances.length) {
            meta.conditions = {
              version: EFFECTS_MUTATION_CONDITION_VERSION,
              instances,
            };
          } else {
            delete meta.conditions;
          }
        }
        for (const [field, descriptor] of Object.entries(change.afterMetadata || {})) {
          if (!change.metadataFields?.[field]) continue;
          if (descriptor?.present) meta[field] = clone(descriptor.value);
          else delete meta[field];
        }
        item.metadata = { ...(item.metadata || {}), [META_KEY]: meta };
      }
    });
    if (!writeAuthorized) {
      return {
        status: EFFECTS_MUTATION_STATUS.REJECTED,
        reason: "stale-before-effects-write",
        committed: false,
        changedIds: [],
      };
    }
    mutationStats.commits += 1;
    effectsDiagnostics.event("mutation:commit", {
      mutationId,
      updateCalls: 1,
      changedItems: ids.length,
    });
    return { changedIds: ids, committed: true };
  } catch (error) {
    mutationStats.failed += 1;
    effectsDiagnostics.event("mutation:failed", {
      mutationId,
      changedItems: ids.length,
      message: String(error?.message || error),
    });
    throw error;
  }
}

const BACKGROUND_TRANSPORT_TIMEOUT_MS = 8000;
let backgroundServiceUnsubscribe = null;
let backgroundSceneReadyUnsubscribe = null;
let backgroundResultUnsubscribe = null;
let backgroundServiceMounted = false;
let backgroundSceneIdentity = null;
const backgroundPendingRequests = new Map();
const pendingHistoryRecords = new Map();
const pendingSideEffectRecords = new Map();
const recoveredPostCommitResults = new Map();
let backgroundCommandBroker = null;
let pendingHistoryRetryTimer = null;
let pendingHistoryRetryQueue = Promise.resolve();

function sameValue(left, right) {
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return left === right;
  }
}

function nextCasterTurnKey(state, casterId) {
  const order = Array.isArray(state?.order) ? state.order : [];
  const wanted = String(casterId || "").trim();
  if (!order.length || !wanted) return "";
  const round = Math.max(1, Math.floor(Number(state?.round) || 1));
  const current = Math.max(
    0,
    Math.min(order.length - 1, Math.floor(Number(state?.current) || 0)),
  );
  for (let offset = 1; offset <= order.length; offset += 1) {
    const ordinal = ((round - 1) * order.length) + current + offset;
    const index = ordinal % order.length;
    const actorId = String(order[index] || "").replace(/::p\d+$/u, "");
    if (actorId === wanted) return initiativeTurnKeyAtOrdinal(order, ordinal);
  }
  return "";
}

export async function prepareEffectsMutationUndo(entryOrEntries, {
  sceneEpoch = null,
  isCurrent = null,
} = {}) {
  const canPrepare = () => (
    typeof isCurrent !== "function" || isCurrent()
  );
  if (!canPrepare()) return { status: EFFECTS_MUTATION_STATUS.REJECTED, reason: "stale-scene-epoch" };
  const sceneItems = await OBR.scene.items.getItems();
  if (!canPrepare()) return { status: EFFECTS_MUTATION_STATUS.REJECTED, reason: "stale-after-read" };
  const plan = buildCoordinatedEffectsUndoPlan({
    currentStates: sceneItems.map((item) => {
      const state = normalizedSceneItem(item);
      state.metadata = clone(item?.metadata?.[META_KEY] || {});
      return state;
    }),
    sceneItems,
    entryOrEntries,
    metadataKeys: {
      conditions: "conditions",
      spells: SPELLS_META_KEY,
      concentrations: CONC_META_KEY,
    },
    normalizeConditions: getConditionInstances,
  });
  if (plan.status) return plan;
  plan.mutationId = createId("effects-undo");
  plan.sceneEpoch = sceneEpoch;
  return plan;
}

async function zoneItemsForSelectors(selectors = []) {
  const { getStaticSpellZoneItems } = await import("./spellStaticZone.js");
  const byId = new Map();
  for (const selector of Array.isArray(selectors) ? selectors : []) {
    const items = selector?.all === true
      ? await getStaticSpellZoneItems()
      : await getStaticSpellZoneItems({
        instanceId: selector?.instanceId || "",
        casterId: selector?.casterId || "",
      });
    for (const item of items) if (item?.id) byId.set(item.id, item);
  }
  return [...byId.values()];
}

async function boardTokenItemsForSelectors(selectors = []) {
  const { getSpellBoardTokenItems } = await import("./spellBoardToken.js");
  const byId = new Map();
  for (const selector of Array.isArray(selectors) ? selectors : []) {
    const items = selector?.all === true
      ? await getSpellBoardTokenItems()
      : await getSpellBoardTokenItems({
        instanceId: selector?.instanceId || "",
        casterId: selector?.casterId || "",
      });
    for (const item of items) if (item?.id) byId.set(item.id, item);
  }
  return [...byId.values()];
}

function itemCenter(bounds, item) {
  const x = Number(bounds?.center?.x ?? item?.position?.x);
  const y = Number(bounds?.center?.y ?? item?.position?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function boardTokenStartPosition(bounds, item, dpi = 1) {
  const center = itemCenter(bounds, item);
  if (!center) return null;
  const safeDpi = Math.max(1, Number(dpi) || 1);
  const maximumX = Number(bounds?.max?.x);
  return {
    x: Number.isFinite(maximumX) ? maximumX + safeDpi / 2 : center.x + safeDpi,
    y: center.y,
  };
}

async function prepareEffectsSideEffects(plan, command) {
  const descriptors = Array.isArray(command?.sideEffects) ? command.sideEffects : [];
  const prepared = [];
  for (const descriptor of descriptors) {
    if (descriptor?.type === "spell-active-resolution:validate") {
      const { validateSpellActiveResolutionCommit } = await import(
        "./spellActiveResolutionValidation.js"
      );
      const validation = await validateSpellActiveResolutionCommit(descriptor);
      if (!validation.valid) {
        return {
          status: EFFECTS_MUTATION_STATUS.CONFLICT,
          conflicts: validation.errors.map((reason) => ({ reason })),
        };
      }
      prepared.push({ type: descriptor.type });
    } else if (descriptor?.type === "static-zone:remove-ended") {
      const candidates = await zoneItemsForSelectors(descriptor.selectors || []);
      const boardTokenCandidates = await boardTokenItemsForSelectors(
        descriptor.selectors || [],
      );
      const { staticSpellZoneItemsEndedByPlan } = await import("./spellStaticZoneCore.js");
      prepared.push({
        type: descriptor.type,
        items: [
          ...staticSpellZoneItemsEndedByPlan(candidates, plan),
          ...spellBoardTokenItemsEndedByPlan(boardTokenCandidates, plan),
        ],
      });
    } else if (descriptor?.type === "spell-board-token:place") {
      const spellId = String(descriptor.spellId || "").trim();
      const instanceId = String(descriptor.instanceId || "").trim();
      const casterId = String(descriptor.casterId || "").trim();
      const entityId = String(descriptor.entityId || "").trim();
      const objectSize = String(descriptor.objectSize || "").trim();
      const batch = descriptor.batch === true;
      const position = {
        x: Number(descriptor.position?.x),
        y: Number(descriptor.position?.y),
      };
      const rule = getSpellBoardTokenRule(spellId);
      if (
        !rule
        || !instanceId
        || !casterId
        || !entityId
        || !Number.isFinite(position.x)
        || !Number.isFinite(position.y)
      ) {
        return {
          status: EFFECTS_MUTATION_STATUS.CONFLICT,
          conflicts: [{ reason: "spell-board-token-placement-required" }],
        };
      }
      const existing = await boardTokenItemsForSelectors([{ instanceId }]);
      if (!batch && existing.length > 1) {
        return {
          status: EFFECTS_MUTATION_STATUS.CONFLICT,
          conflicts: [{ reason: "duplicate-spell-board-token", itemId: existing[0]?.id || null }],
        };
      }
      const [caster] = await OBR.scene.items.getItems([casterId]);
      const [bounds, dpi, scale] = await Promise.all([
        caster
          ? OBR.scene.items.getItemBounds([casterId]).catch(() => null)
          : null,
        OBR.scene.grid.getDpi().catch(() => 150),
        OBR.scene.grid.getScale().catch(() => ({ parsed: { multiplier: 1.5, unit: "m" } })),
      ]);
      const casterOrigin = itemCenter(bounds, caster);
      if (!caster || !casterOrigin) {
        return {
          status: EFFECTS_MUTATION_STATUS.CONFLICT,
          conflicts: [{ reason: "spell-board-token-caster-missing", itemId: casterId || null }],
        };
      }
      if (!spellAreaOriginWithinRange({
        origin: position,
        casterOrigin,
        range: { value: rule.creationRangeMeters, unit: "m" },
        dpi,
        scale: scale?.parsed || scale,
      })) {
        return {
          status: EFFECTS_MUTATION_STATUS.CONFLICT,
          conflicts: [{ reason: "spell-board-token-out-of-range", itemId: casterId }],
        };
      }
      const existingItem = existing.find((item) => item.id === entityId)
        || (!batch && existing.length === 1 ? existing[0] : null);
      if (existingItem) {
        const before = clone(existingItem);
        const after = { ...clone(existingItem), position: clone(position) };
        prepared.push({ type: descriptor.type, before, after });
        continue;
      }
      const [idCollision] = await OBR.scene.items.getItems([entityId]);
      if (idCollision) {
        return {
          status: EFFECTS_MUTATION_STATUS.CONFLICT,
          conflicts: [{ reason: "spell-board-token-id-conflict", itemId: entityId }],
        };
      }
      const { buildSpellBoardTokenItem } = await import("./spellBoardToken.js");
      const item = buildSpellBoardTokenItem({
        entityId,
        spellId,
        instanceId,
        casterId,
        slotLevel: descriptor.slotLevel,
        casterHpMax: caster?.metadata?.[META_KEY]?.hpMax,
        casterAttitude: caster?.metadata?.[META_KEY]?.attitude,
        casterName: caster?.name || "",
        objectSize,
        position,
      });
      prepared.push({ type: descriptor.type, before: null, after: item });
    } else if (descriptor?.type === "spell-board-token:remove") {
      const itemId = String(descriptor.itemId || "").trim();
      const [item] = itemId ? await OBR.scene.items.getItems([itemId]) : [];
      if (
        !item
        || item.layer !== "PROP"
        || item.metadata?.[SPELL_BOARD_TOKEN_META_KEY]?.kind !== "spell-board-token"
      ) {
        return {
          status: EFFECTS_MUTATION_STATUS.CONFLICT,
          conflicts: [{ reason: "spell-board-token-missing", itemId: itemId || null }],
        };
      }
      prepared.push({ type: descriptor.type, item: clone(item) });
    } else if (descriptor?.type === "spell-board-token:create") {
      const spellId = String(descriptor.spellId || "").trim();
      const instanceId = String(descriptor.instanceId || "").trim();
      const casterId = String(descriptor.casterId || "").trim();
      const entityId = String(descriptor.entityId || "").trim();
      const rule = getSpellBoardTokenRule(spellId);
      if (!rule || !instanceId || !casterId || !entityId) {
        return {
          status: EFFECTS_MUTATION_STATUS.CONFLICT,
          conflicts: [{ reason: "spell-board-token-context-required" }],
        };
      }
      const existing = await boardTokenItemsForSelectors([{ instanceId }]);
      if (existing.length > 1) {
        return {
          status: EFFECTS_MUTATION_STATUS.CONFLICT,
          conflicts: [{ reason: "duplicate-spell-board-token", itemId: existing[0]?.id || null }],
        };
      }
      if (existing.length === 1) {
        prepared.push({ type: descriptor.type, item: null });
        continue;
      }
      const [caster] = await OBR.scene.items.getItems([casterId]);
      const [bounds, dpi] = await Promise.all([
        caster
          ? OBR.scene.items.getItemBounds([casterId]).catch(() => null)
          : null,
        OBR.scene.grid.getDpi().catch(() => 150),
      ]);
      const position = boardTokenStartPosition(bounds, caster, dpi);
      if (!caster || !position) {
        return {
          status: EFFECTS_MUTATION_STATUS.CONFLICT,
          conflicts: [{ reason: "spell-board-token-caster-missing", itemId: casterId || null }],
        };
      }
      const [idCollision] = await OBR.scene.items.getItems([entityId]);
      if (idCollision) {
        return {
          status: EFFECTS_MUTATION_STATUS.CONFLICT,
          conflicts: [{ reason: "spell-board-token-id-conflict", itemId: entityId }],
        };
      }
      const { buildSpellBoardTokenItem } = await import("./spellBoardToken.js");
      const item = buildSpellBoardTokenItem({
        entityId,
        spellId,
        instanceId,
        casterId,
        slotLevel: descriptor.slotLevel,
        casterHpMax: caster?.metadata?.[META_KEY]?.hpMax,
        casterAttitude: caster?.metadata?.[META_KEY]?.attitude,
        casterName: caster?.name || "",
        position,
      });
      prepared.push({ type: descriptor.type, item });
    } else if (descriptor?.type === "spell-board-token:update-state") {
      const instanceId = String(descriptor.instanceId || "").trim();
      const itemId = String(descriptor.itemId || "").trim();
      const candidates = await boardTokenItemsForSelectors([{ instanceId }]);
      const items = itemId
        ? candidates.filter((candidate) => candidate.id === itemId)
        : candidates;
      const item = items[0] || null;
      if ((itemId && items.length !== 1) || (!itemId && candidates.length !== 1)) {
        return {
          status: EFFECTS_MUTATION_STATUS.CONFLICT,
          conflicts: [{ reason: "spell-board-token-missing", itemId: item?.id || null }],
        };
      }
      const statePlan = planSpellBoardTokenStateUpdate({
        item,
        instanceId,
        action: descriptor.action,
        hp: descriptor.hp,
        targetIds: descriptor.targetIds,
      });
      if (!statePlan.valid) {
        return {
          status: EFFECTS_MUTATION_STATUS.CONFLICT,
          conflicts: statePlan.errors.map((reason) => ({ reason, itemId: item.id })),
        };
      }
      const boardTokenRule = getSpellBoardTokenRule(
        item.metadata?.[SPELL_BOARD_TOKEN_META_KEY]?.spellId,
      );
      const syncCanonicalHp = descriptor.hp !== undefined && boardTokenRule?.hasHitPoints === true;
      const canonicalBefore = syncCanonicalHp
        ? sceneItemMetadataSnapshot(item, META_KEY)
        : null;
      const canonicalBase = canonicalBefore?.present && canonicalBefore.value
        && typeof canonicalBefore.value === "object"
        ? clone(canonicalBefore.value)
        : {};
      const canonicalAfter = syncCanonicalHp
        ? {
          present: true,
          value: {
            ...canonicalBase,
            hp: statePlan.after.hp,
            hpMax: statePlan.after.hpMax,
          },
        }
        : null;
      prepared.push({
        type: descriptor.type,
        id: item.id,
        metadataKey: SPELL_BOARD_TOKEN_META_KEY,
        before: sceneItemMetadataSnapshot(item, SPELL_BOARD_TOKEN_META_KEY),
        after: { present: true, value: clone(statePlan.metadata) },
        ...(syncCanonicalHp
          ? {
            canonicalMetadataKey: META_KEY,
            canonicalBefore,
            canonicalAfter,
          }
          : {}),
        ...(descriptor.removeWhenZero === true && statePlan.after.hp === 0
          ? { removeWhenZero: true, beforeItem: clone(item) }
          : {}),
      });
    } else if (descriptor?.type === "static-zone:set-rule-choice") {
      const items = await zoneItemsForSelectors([descriptor.selector || {}]);
      if (descriptor.requireMatch === true && !items.length) {
        return { status: EFFECTS_MUTATION_STATUS.CONFLICT, conflicts: [{ reason: "missing-static-zone" }] };
      }
      prepared.push({
        type: descriptor.type,
        items,
        ruleChoice: String(descriptor.ruleChoice || "").trim(),
      });
    } else if (descriptor?.type === "static-zone:child-zones") {
      const rootId = String(descriptor.parentZoneId || descriptor.rootId || "").trim();
      const instanceId = String(descriptor.parentInstanceId || descriptor.instanceId || "").trim();
      const casterId = String(descriptor.casterId || "").trim();
      const [root] = rootId ? await OBR.scene.items.getItems([rootId]) : [];
      const rootMetadata = root?.metadata?.[SPELL_STATIC_ZONE_META_KEY];
      const allItems = await OBR.scene.items.getItems();
      const existingChildren = allItems.filter((item) => {
        const metadata = item?.metadata?.[SPELL_STATIC_ZONE_META_KEY];
        return metadata?.role === "subzone"
          && String(metadata.parentZoneId || metadata.parentId || "") === rootId
          && String(metadata.parentInstanceId || metadata.instanceId || "") === instanceId;
      });
      if (
        !root
        || rootMetadata?.role !== "root"
        || String(rootMetadata.instanceId || "") !== instanceId
        || String(rootMetadata.casterId || "") !== casterId
        || !instanceId
        || !casterId
      ) {
        return {
          status: EFFECTS_MUTATION_STATUS.CONFLICT,
          conflicts: [{ reason: "child-zone-parent-missing", itemId: rootId || null }],
        };
      }
      const parentArea = translatedZoneArea(root);
      const requested = Array.isArray(descriptor.items)
        ? descriptor.items.filter(Boolean)
        : [];
      const requestedIds = new Set();
      for (const item of requested) {
        const metadata = item?.metadata?.[SPELL_STATIC_ZONE_META_KEY];
        if (
          !item?.id
          || requestedIds.has(item.id)
          || !isSpellChildZoneMetadata(metadata)
          || metadata.parentZoneId !== rootId
          || metadata.parentInstanceId !== instanceId
          || metadata.casterId !== casterId
          || !parentArea
          || !validateChildZoneContainment({
            parentArea,
            childArea: translatedZoneArea(item),
            childKind: metadata.childKind,
          })
        ) {
          return {
            status: EFFECTS_MUTATION_STATUS.CONFLICT,
            conflicts: [{ reason: "child-zone-geometry-invalid", itemId: item?.id || null }],
          };
        }
        requestedIds.add(item.id);
      }
      const replaceKind = String(descriptor.replaceChildKind || "").trim();
      const beforeItems = existingChildren.filter((item) =>
        descriptor.removeAllChildren === true
        || (replaceKind
          && String(item.metadata?.[SPELL_STATIC_ZONE_META_KEY]?.childKind || "") === replaceKind)
        || (Array.isArray(descriptor.removeChildKinds)
          && descriptor.removeChildKinds.includes(
            String(item.metadata?.[SPELL_STATIC_ZONE_META_KEY]?.childKind || ""),
          ))
      );
      if (descriptor.singleActivation === true && existingChildren.length) {
        return {
          status: EFFECTS_MUTATION_STATUS.CONFLICT,
          conflicts: [{ reason: "child-zone-activation-already-used", itemId: existingChildren[0]?.id || null }],
        };
      }
      for (const item of requested) {
        const collision = allItems.find((candidate) => candidate.id === item.id);
        if (collision && !beforeItems.some((before) => before.id === item.id)) {
          return {
            status: EFFECTS_MUTATION_STATUS.CONFLICT,
            conflicts: [{ reason: "child-zone-item-id-conflict", itemId: item.id }],
          };
        }
      }
      prepared.push({
        type: descriptor.type,
        parentZoneId: rootId,
        parentInstanceId: instanceId,
        beforeItems: beforeItems.map((item) => clone(item)),
        afterItems: requested.map((item) => clone(item)),
      });
    } else if (descriptor?.type === "static-zone:move") {
      const zoneItemId = String(descriptor.zoneItemId || "").trim();
      const instanceId = String(descriptor.instanceId || "").trim();
      const ruleId = String(descriptor.ruleId || "").trim();
      const casterId = String(descriptor.casterId || "").trim();
      const [root] = zoneItemId
        ? await OBR.scene.items.getItems([zoneItemId])
        : [];
      const rule = getSpellAreaRuleById(ruleId);
      const allItems = await OBR.scene.items.getItems();
      const candidates = allItems
        .filter((item) => (
          item?.layer === "CHARACTER"
          && !item?.attachedTo
          && !!item?.metadata?.[META_KEY]
        ))
        .map(async (item) => ({
          id: item.id,
          bounds: await OBR.scene.items.getItemBounds([item.id]).catch(() => null),
        }));
      const [dpi, scale, sceneMetadata] = await Promise.all([
        OBR.scene.grid.getDpi().catch(() => 150),
        OBR.scene.grid.getScale().catch(() => ({ parsed: { multiplier: 1.5, unit: "m" } })),
        OBR.scene.getMetadata().catch(() => ({})),
      ]);
      const movementPlan = planSpellZoneMovement({
        rule,
        zoneItem: root,
        initialPosition: descriptor.initialPosition,
        proposedPosition: descriptor.proposedPosition,
        dpi,
        scale,
        instanceId,
        casterId,
        sceneEpoch: command?.sceneEpoch,
        currentSceneEpoch: currentSceneEpoch(),
        contactCandidates: await Promise.all(candidates),
        contactTargetId: descriptor.contactTargetId,
        movementChoice: descriptor.movementChoice,
      });
      if (!movementPlan.valid) {
        return {
          status: EFFECTS_MUTATION_STATUS.CONFLICT,
          conflicts: movementPlan.errors.map((reason) => ({
            reason,
            itemId: zoneItemId || null,
          })),
        };
      }
      const metadata = root?.metadata?.[SPELL_STATIC_ZONE_META_KEY];
      const runtime = normalizeSpellZoneTriggerRuntime(metadata?.triggerRuntime);
      const contactTargets = movementPlan.firstContact?.targetId
        ? [movementPlan.firstContact.targetId]
        : [];
      const areaMoveTargetIds = Object.fromEntries(
        (rule?.zonePolicy?.triggers || [])
          .filter((trigger) => (
            trigger?.requiresAreaMove === true
            && trigger?.triggerOnAreaMove === true
          ))
          .map((trigger) => [trigger.id, contactTargets]),
      );
      const afterMetadata = {
        ...metadata,
        [SPELL_ZONE_MOVEMENT_CONTROL_FIELD]: {
          commandId: String(command?.commandId || "").trim(),
          position: clone(movementPlan.finalPosition),
        },
        triggerRuntime: {
          ...runtime,
          areaMoveTargetIds,
        },
      };
      if (!root || !metadata) {
        return {
          status: EFFECTS_MUTATION_STATUS.CONFLICT,
          conflicts: [{ reason: "missing-static-zone", itemId: zoneItemId || null }],
        };
      }
      let subzone = null;
      if (
        rule?.spellId === "xanathar-diavoletto-di-polvere"
        && movementPlan.movementChoice === "dust-terrain"
      ) {
        const { buildStaticSpellZoneSubzoneItem } = await import("./spellStaticZone.js");
        const existingSubzones = allItems.filter((item) => {
          const itemMetadata = item?.metadata?.[SPELL_STATIC_ZONE_META_KEY];
          return itemMetadata?.role === "subzone"
            && String(itemMetadata.instanceId || "") === instanceId;
        });
        const translated = translatedZoneArea(root, movementPlan.finalPosition);
        const center = translated?.origin || movementPlan.finalPosition;
        const expiresTurnKey = nextCasterTurnKey(
          sceneMetadata?.[`${ID}/state`],
          casterId,
        );
        const afterSubzone = buildStaticSpellZoneSubzoneItem({
          ruleId,
          instanceId,
          casterId,
          parentId: zoneItemId,
          spellName: root?.name?.replace(/^Zona:\s*/u, "") || rule.spellId,
          center,
          radiusMeters: 3,
          dpi,
          scale,
          expiresTurnKey,
          style: root?.metadata?.[`${ID}/aoeArea`]?.style,
        });
        subzone = {
          beforeItems: existingSubzones.map((item) => clone(item)),
          afterItem: clone(afterSubzone),
        };
      } else if (rule?.spellId === "xanathar-diavoletto-di-polvere") {
        const existingSubzones = allItems.filter((item) => {
          const itemMetadata = item?.metadata?.[SPELL_STATIC_ZONE_META_KEY];
          return itemMetadata?.role === "subzone"
            && String(itemMetadata.instanceId || "") === instanceId;
        });
        subzone = {
          beforeItems: existingSubzones.map((item) => clone(item)),
          afterItem: null,
        };
      }
      prepared.push({
        type: descriptor.type,
        id: zoneItemId,
        instanceId,
        ruleId,
        casterId,
        beforePosition: clone(root.position),
        afterPosition: clone(movementPlan.finalPosition),
        metadataKey: SPELL_STATIC_ZONE_META_KEY,
        beforeMetadata: sceneItemMetadataSnapshot(root, SPELL_STATIC_ZONE_META_KEY),
        afterMetadata: { present: true, value: clone(afterMetadata) },
        movementPlan,
        ...(subzone ? { subzone } : {}),
      });
    } else if (descriptor?.type === "reminder:consume-zone-activation") {
      const itemId = String(descriptor.itemId || "").trim();
      const metadataKey = String(descriptor.metadataKey || "").trim();
      const activationId = String(descriptor.activationId || "").trim();
      const allowedKeys = new Set([
        SPELL_STATIC_ZONE_META_KEY,
        SPELL_AURA_META_KEY,
        CLASS_FEATURE_AURA_META_KEY,
        CUSTOM_AURA_META_KEY,
      ]);
      const [item] = itemId ? await OBR.scene.items.getItems([itemId]) : [];
      const metadata = item?.metadata?.[metadataKey];
      const runtime = normalizeSpellZoneTriggerRuntime(metadata?.triggerRuntime);
      const activation = runtime.pending.find((entry) => entry.id === activationId);
      const targetId = String(descriptor.targetId || "").trim();
      if (
        !item
        || !allowedKeys.has(metadataKey)
        || !metadata
        || !activation
        || (targetId && !activation.targetIds.includes(targetId))
      ) {
        return {
          status: EFFECTS_MUTATION_STATUS.CONFLICT,
          conflicts: [{ reason: "stale-reminder-activation", itemId: itemId || null }],
        };
      }
      const after = {
        ...metadata,
        triggerRuntime: consumeSpellZoneTrigger(runtime, activationId),
      };
      prepared.push({
        type: descriptor.type,
        id: itemId,
        metadataKey,
        activationId,
        before: { present: true, value: clone(metadata) },
        after: { present: true, value: clone(after) },
      });
    }
  }
  plan.preparedSideEffects = prepared;
  return plan;
}

async function restoreUpdatedSceneItems(snapshots = []) {
  const byId = new Map(snapshots.map((item) => [item?.id, item]).filter(([id]) => id));
  if (!byId.size) return;
  await OBR.scene.items.updateItems([...byId.keys()], (drafts) => {
    for (const draft of drafts) {
      const snapshot = byId.get(draft.id);
      if (snapshot) draft.metadata = clone(snapshot.metadata || {});
    }
  });
}

async function restoreSceneItemMetadataFields(snapshots = []) {
  const byId = new Map(snapshots.map((entry) => [entry?.id, entry]).filter(([id]) => id));
  if (!byId.size) return;
  await OBR.scene.items.updateItems([...byId.keys()], (drafts) => {
    for (const draft of drafts) {
      const entry = byId.get(draft.id);
      if (!entry?.metadataKey) continue;
      const metadata = { ...(draft.metadata || {}) };
      if (entry.snapshot?.present) metadata[entry.metadataKey] = clone(entry.snapshot.value);
      else delete metadata[entry.metadataKey];
      draft.metadata = metadata;
    }
  });
}

function postCommitError(phase, error) {
  return {
    phase,
    name: String(error?.name || "Error"),
    message: String(error?.message || error || "Post-commit effects operation failed."),
  };
}

function staticZoneRuleChoiceAfterSnapshot(item, ruleChoice) {
  const metadata = clone(item?.metadata?.[SPELL_STATIC_ZONE_META_KEY]);
  if (!metadata || typeof metadata !== "object") return { present: false };
  const triggerRuntime = metadata.triggerRuntime
    && typeof metadata.triggerRuntime === "object"
    ? { ...metadata.triggerRuntime, pending: [] }
    : metadata.triggerRuntime;
  return {
    present: true,
    value: {
      ...metadata,
      ruleChoice: String(ruleChoice || "").trim(),
      ...(triggerRuntime ? { triggerRuntime } : {}),
    },
  };
}

async function applyPreparedSideEffect(sideEffect, isCurrent) {
  if (!isCurrent()) throw new Error("stale-before-side-effect");
  if (sideEffect.type === "spell-active-resolution:validate") return [];
  if (sideEffect.type === "spell-board-token:place") {
    const before = sideEffect.before || null;
    const after = sideEffect.after || null;
    if (!after?.id) return [];
    const [actual] = await OBR.scene.items.getItems([after.id]);
    if (before === null) {
      if (actual) throw new Error("spell-board-token-place-create-conflict");
      if (!isCurrent()) throw new Error("stale-before-spell-board-token-place-create");
      await OBR.scene.items.addItems([clone(after)]);
    } else {
      if (!actual || !sameValue(actual, before)) {
        throw new Error("spell-board-token-place-update-conflict");
      }
      if (!isCurrent()) throw new Error("stale-before-spell-board-token-place-update");
      await OBR.scene.items.updateItems([after.id], (drafts) => {
        for (const draft of drafts) {
          if (draft.id === after.id) draft.position = clone(after.position);
        }
      });
    }
    return [{
      id: after.id,
      type: "item",
      before: clone(before),
      after: clone(after),
    }];
  }
  if (sideEffect.type === "spell-board-token:create") {
    const item = sideEffect.item;
    if (!item?.id) return [];
    const [existing] = await OBR.scene.items.getItems([item.id]);
    if (existing) {
      if (sameValue(existing, item)) return [];
      throw new Error("spell-board-token-create-conflict");
    }
    if (!isCurrent()) throw new Error("stale-before-spell-board-token-create");
    await OBR.scene.items.addItems([clone(item)]);
    return [{ id: item.id, type: "item", before: null, after: clone(item) }];
  }
  if (sideEffect.type === "spell-board-token:remove") {
    const expected = sideEffect.item;
    if (!expected?.id) return [];
    const [actual] = await OBR.scene.items.getItems([expected.id]);
    if (!actual) return [];
    if (!sameValue(actual, expected)) throw new Error("spell-board-token-remove-conflict");
    if (!isCurrent()) throw new Error("stale-before-spell-board-token-remove");
    await OBR.scene.items.deleteItems([expected.id]);
    return [{
      id: expected.id,
      type: "item",
      before: clone(expected),
      after: null,
    }];
  }
  if (sideEffect.type === "spell-board-token:update-state") {
    const [item] = await OBR.scene.items.getItems([sideEffect.id]);
    if (!item) throw new Error("spell-board-token-update-missing");
    const actual = sceneItemMetadataSnapshot(item, sideEffect.metadataKey);
    if (!metadataSnapshotMatches(actual, sideEffect.before)) {
      throw new Error("spell-board-token-update-stale");
    }
    if (sideEffect.canonicalMetadataKey && !metadataSnapshotMatches(
      sceneItemMetadataSnapshot(item, sideEffect.canonicalMetadataKey),
      sideEffect.canonicalBefore,
    )) {
      throw new Error("spell-board-token-canonical-hp-stale");
    }
    if (!isCurrent()) throw new Error("stale-before-spell-board-token-update");
    if (sideEffect.removeWhenZero === true) {
      await OBR.scene.items.deleteItems([sideEffect.id]);
      return [{
        id: sideEffect.id,
        type: "item",
        before: clone(sideEffect.beforeItem || item),
        after: null,
      }];
    }
    await OBR.scene.items.updateItems([sideEffect.id], (drafts) => {
      for (const draft of drafts) {
        if (draft.id !== sideEffect.id) continue;
        const metadata = { ...(draft.metadata || {}) };
        metadata[sideEffect.metadataKey] = clone(sideEffect.after.value);
        if (sideEffect.canonicalMetadataKey) {
          metadata[sideEffect.canonicalMetadataKey] = clone(sideEffect.canonicalAfter.value);
        }
        draft.metadata = metadata;
      }
    });
    const changes = [{
      id: sideEffect.id,
      type: "metadata",
      metadataKey: sideEffect.metadataKey,
      before: clone(sideEffect.before),
      after: clone(sideEffect.after),
    }];
    if (sideEffect.canonicalMetadataKey) {
      changes.push({
        id: sideEffect.id,
        type: "metadata",
        metadataKey: sideEffect.canonicalMetadataKey,
        before: clone(sideEffect.canonicalBefore),
        after: clone(sideEffect.canonicalAfter),
      });
    }
    return changes;
  }
  if (sideEffect.type === "static-zone:remove-ended") {
    const items = sideEffect.items || [];
    const ids = items.map((item) => item?.id).filter(Boolean);
    const existing = ids.length ? await OBR.scene.items.getItems(ids) : [];
    if (!isCurrent()) throw new Error("stale-after-zone-removal-read");
    const existingIds = existing.map((item) => item?.id).filter(Boolean);
    if (existingIds.length) await OBR.scene.items.deleteItems(existingIds);
    return items.map((item) => ({ id: item.id, before: clone(item), after: null }));
  }
  if (sideEffect.type === "static-zone:set-rule-choice") {
    const items = sideEffect.items || [];
    if (!items.length || !sideEffect.ruleChoice) return [];
    const { setStaticSpellZoneRuleChoice } = await import("./spellStaticZone.js");
    if (!isCurrent()) throw new Error("stale-before-zone-rule-choice");
    await setStaticSpellZoneRuleChoice(items, sideEffect.ruleChoice);
    return items.map((item) => ({
      id: item.id,
      type: "metadata",
      metadataKey: SPELL_STATIC_ZONE_META_KEY,
      before: sceneItemMetadataSnapshot(item, SPELL_STATIC_ZONE_META_KEY),
      after: staticZoneRuleChoiceAfterSnapshot(item, sideEffect.ruleChoice),
    }));
  }
  if (sideEffect.type === "static-zone:child-zones") {
    const beforeItems = Array.isArray(sideEffect.beforeItems)
      ? sideEffect.beforeItems
      : [];
    const afterItems = Array.isArray(sideEffect.afterItems)
      ? sideEffect.afterItems
      : [];
    const beforeIds = beforeItems.map((item) => item?.id).filter(Boolean);
    const current = beforeIds.length
      ? await OBR.scene.items.getItems(beforeIds)
      : [];
    if (
      current.length !== beforeItems.length
      || current.some((item) => {
        const expected = beforeItems.find((candidate) => candidate?.id === item.id);
        return !expected || !sameValue(item, expected);
      })
    ) {
      throw new Error("child-zone-stale");
    }
    if (!isCurrent()) throw new Error("stale-before-child-zone");
    if (beforeIds.length) await OBR.scene.items.deleteItems(beforeIds);
    if (afterItems.length) await OBR.scene.items.addItems(afterItems.map((item) => clone(item)));
    return [
      ...beforeItems.map((item) => ({
        id: item.id,
        type: "item",
        before: clone(item),
        after: null,
      })),
      ...afterItems.map((item) => ({
        id: item.id,
        type: "item",
        before: null,
        after: clone(item),
      })),
    ];
  }
  if (sideEffect.type === "static-zone:move") {
    const [current] = await OBR.scene.items.getItems([sideEffect.id]);
    if (!current) throw new Error("static-zone-move-item-missing");
    if (!sameValue(current.position, sideEffect.beforePosition)) {
      throw new Error("static-zone-move-position-stale");
    }
    const actual = sceneItemMetadataSnapshot(current, sideEffect.metadataKey);
    if (!metadataSnapshotMatches(actual, sideEffect.beforeMetadata)) {
      throw new Error("static-zone-move-metadata-stale");
    }
    if (!isCurrent()) throw new Error("stale-before-static-zone-move");
    const subzone = sideEffect.subzone;
    const beforeSubzones = Array.isArray(subzone?.beforeItems)
      ? subzone.beforeItems
      : [];
    const beforeSubzoneIds = beforeSubzones.map((item) => item?.id).filter(Boolean);
    const currentSubzones = beforeSubzoneIds.length
      ? await OBR.scene.items.getItems(beforeSubzoneIds)
      : [];
    if (currentSubzones.length !== beforeSubzoneIds.length
      || currentSubzones.some((item) => {
        const expected = beforeSubzones.find((candidate) => candidate?.id === item.id);
        return !expected || !sameValue(item, expected);
      })) {
      throw new Error("static-zone-subzone-stale");
    }
    await OBR.scene.items.updateItems([sideEffect.id], (drafts) => {
      for (const draft of drafts) {
        if (draft.id !== sideEffect.id) continue;
        draft.position = clone(sideEffect.afterPosition);
        draft.metadata = {
          ...(draft.metadata || {}),
          [sideEffect.metadataKey]: clone(sideEffect.afterMetadata.value),
        };
      }
    });
    const changes = [{
      id: sideEffect.id,
      type: "static-zone-move",
      metadataKey: sideEffect.metadataKey,
      beforePosition: clone(sideEffect.beforePosition),
      afterPosition: clone(sideEffect.afterPosition),
      beforeMetadata: clone(sideEffect.beforeMetadata),
      afterMetadata: clone(sideEffect.afterMetadata),
      instanceId: sideEffect.instanceId,
      ruleId: sideEffect.ruleId,
    }];
    if (beforeSubzoneIds.length) {
      await OBR.scene.items.deleteItems(beforeSubzoneIds);
      changes.push(...beforeSubzones.map((item) => ({
        id: item.id,
        type: "item",
        before: clone(item),
        after: null,
      })));
    }
    if (subzone?.afterItem) {
      await OBR.scene.items.addItems([clone(subzone.afterItem)]);
      changes.push({
        id: subzone.afterItem.id,
        type: "item",
        before: null,
        after: clone(subzone.afterItem),
      });
    }
    return changes;
  }
  if (sideEffect.type === "reminder:consume-zone-activation") {
    const [item] = await OBR.scene.items.getItems([sideEffect.id]);
    if (!item) throw new Error("reminder-zone-item-missing");
    const actual = sceneItemMetadataSnapshot(item, sideEffect.metadataKey);
    if (!metadataSnapshotMatches(actual, sideEffect.before)) {
      throw new Error("reminder-zone-activation-stale-before-consume");
    }
    if (!isCurrent()) throw new Error("stale-before-reminder-zone-consume");
    await OBR.scene.items.updateItems([sideEffect.id], (drafts) => {
      for (const draft of drafts) {
        if (draft.id !== sideEffect.id) continue;
        draft.metadata = {
          ...(draft.metadata || {}),
          [sideEffect.metadataKey]: clone(sideEffect.after.value),
        };
      }
    });
    return [{
      id: sideEffect.id,
      type: "metadata",
      metadataKey: sideEffect.metadataKey,
      before: clone(sideEffect.before),
      after: clone(sideEffect.after),
    }];
  }
  return [];
}

async function applyUndoSideEffect(sideEffect, isCurrent) {
  if (!isCurrent()) throw new Error("stale-before-undo-side-effect");
  const currentItems = await OBR.scene.items.getItems([sideEffect.id]);
  if (!isCurrent()) throw new Error("stale-after-undo-side-effect-read");
  const current = currentItems[0] || null;
  if (sideEffect.type === "metadata") {
    if (!current) throw new Error("undo-side-effect-item-missing");
    const actual = sceneItemMetadataSnapshot(current, sideEffect.metadataKey);
    if (metadataSnapshotMatches(actual, sideEffect.restore)) return [];
    if (!metadataSnapshotMatches(actual, sideEffect.expected)) {
      throw new Error("undo-side-effect-conflict");
    }
    if (!isCurrent()) throw new Error("stale-before-undo-metadata-restore");
    await restoreSceneItemMetadataFields([{
      id: sideEffect.id,
      metadataKey: sideEffect.metadataKey,
      snapshot: sideEffect.restore,
    }]);
    return [];
  }
  if (sideEffect.type === "static-zone-move") {
    if (!current) throw new Error("undo-side-effect-item-missing");
    if (sameValue(current.position, sideEffect.restorePosition)) return [];
    if (!sameValue(current.position, sideEffect.expectedPosition)) {
      throw new Error("undo-side-effect-conflict");
    }
    const metadata = sideEffect.restoreMetadata;
    if (!metadata?.present) throw new Error("undo-static-zone-metadata-missing");
    if (!isCurrent()) throw new Error("stale-before-undo-static-zone-move");
    await OBR.scene.items.updateItems([sideEffect.id], (drafts) => {
      for (const draft of drafts) {
        if (draft.id !== sideEffect.id) continue;
        draft.position = clone(sideEffect.restorePosition);
        const restoredMetadata = clone(metadata.value);
        restoredMetadata[SPELL_ZONE_MOVEMENT_CONTROL_FIELD] = {
          commandId: "undo",
          position: clone(sideEffect.restorePosition),
        };
        draft.metadata = {
          ...(draft.metadata || {}),
          [sideEffect.metadataKey]: restoredMetadata,
        };
      }
    });
    return [];
  }
  if (sideEffect.restore && sideEffect.expected === null) {
    if (current && sameValue(current, sideEffect.restore)) return [];
    if (current) throw new Error("undo-side-effect-conflict");
    if (!isCurrent()) throw new Error("stale-before-undo-item-add");
    await OBR.scene.items.addItems([sideEffect.restore]);
    return [];
  }
  if (sideEffect.restore === null && sideEffect.expected) {
    if (!current) return [];
    if (!sameValue(current, sideEffect.expected)) throw new Error("undo-side-effect-conflict");
    if (!isCurrent()) throw new Error("stale-before-undo-item-delete");
    await OBR.scene.items.deleteItems([sideEffect.id]);
    return [];
  }
  if (sideEffect.restore && sideEffect.expected) {
    if (current && sameValue(current, sideEffect.restore)) return [];
    if (!current || !sameValue(current, sideEffect.expected)) {
      throw new Error("undo-side-effect-conflict");
    }
    if (!isCurrent()) throw new Error("stale-before-undo-item-restore");
    await restoreUpdatedSceneItems([sideEffect.restore]);
  }
  return [];
}

async function runPostCommitSideEffects(sideEffects, isCurrent) {
  const changes = [];
  const work = Array.isArray(sideEffects) ? sideEffects : [];
  for (let index = 0; index < work.length; index += 1) {
    const entry = work[index];
    try {
      const nextChanges = entry.kind === "undo"
        ? await applyUndoSideEffect(entry.value, isCurrent)
        : await applyPreparedSideEffect(entry.value, isCurrent);
      changes.push(...nextChanges);
    } catch (error) {
      return {
        changes,
        pending: clone(work.slice(index)),
        errors: [postCommitError(
          entry.kind === "undo" ? "undo-side-effect" : "side-effect",
          error,
        )],
      };
    }
  }
  return { changes, pending: [], errors: [] };
}

async function commitCoordinatedEffectsPlan(plan, { isCurrent }) {
  if (!isCurrent()) {
    return {
      status: EFFECTS_MUTATION_STATUS.REJECTED,
      reason: "stale-before-effects-commit",
      committed: false,
      changedIds: [],
    };
  }
  const effectsCommit = await commitEffectsMutationPlan(plan, { isCurrent });
  if (effectsCommit?.status === EFFECTS_MUTATION_STATUS.REJECTED) return effectsCommit;
  const sideEffects = [
    ...(Array.isArray(plan?.undoSideEffects) ? plan.undoSideEffects : [])
      .map((value) => ({ kind: "undo", value })),
    ...(Array.isArray(plan?.preparedSideEffects) ? plan.preparedSideEffects : [])
      .map((value) => ({ kind: "apply", value })),
  ];
  const sideEffectResult = await runPostCommitSideEffects(sideEffects, isCurrent);
  return {
    changedIds: effectsCommit.changedIds,
    committed: effectsCommit.committed || sideEffectResult.changes.length > 0,
    postCommitErrors: sideEffectResult.errors,
    sideEffectChanges: sideEffectResult.changes,
    sideEffectsPending: sideEffectResult.pending,
  };
}

let effectsMutationCoordinator = null;

function createBackgroundEffectsMutationCoordinator() {
  return createEffectsMutationCoordinator({
  prepare: async (operations, context) => {
    const preconditions = Array.isArray(context.command?.sceneMetadataPreconditions)
      ? context.command.sceneMetadataPreconditions
      : [];
    if (preconditions.length) {
      const metadata = await OBR.scene.getMetadata();
      if (!context.isCurrent()) return { status: EFFECTS_MUTATION_STATUS.REJECTED };
      const conflicts = preconditions
        .filter((entry) => !sameValue(metadata?.[entry?.key], entry?.value))
        .map((entry) => ({ key: entry?.key || null, reason: "scene-metadata-mismatch" }));
      if (conflicts.length) return { status: EFFECTS_MUTATION_STATUS.CONFLICT, conflicts };
    }
    const plan = await prepareEffectsMutation(operations, context);
    if (plan?.status) return plan;
    if (context.command?.requireChanges === true && !plan.changedIds?.length) {
      return { status: EFFECTS_MUTATION_STATUS.CONFLICT, conflicts: [{ reason: "required-effect-not-found" }] };
    }
    if (!context.isCurrent()) return { status: EFFECTS_MUTATION_STATUS.REJECTED };
    return prepareEffectsSideEffects(plan, context.command);
  },
  commit: (plan, { isCurrent }) => commitCoordinatedEffectsPlan(plan, { isCurrent }),
  prepareUndo: (entries, { sceneEpoch, isCurrent }) => prepareEffectsMutationUndo(entries, {
    sceneEpoch,
    isCurrent,
  }),
  isCurrent: (sceneIdentity, command = {}) => {
    return !!backgroundServiceMounted
      && !!sceneIdentity
      && sceneIdentity === backgroundSceneIdentity
      && isCurrentSceneEpoch(command.sceneEpoch);
  },
  recordHistory: async ({ command, plan, commitResult, sceneEpoch }) => {
    if (commitResult?.sideEffectsPending?.length) {
      throw new Error("effects-side-effects-pending");
    }
    const { recordEffectsMutationHistory } = await import("./history.js");
    return recordEffectsMutationHistory({ command, plan, commitResult, sceneEpoch });
  },
  });
}

async function retryPendingEffectsSideEffects() {
  for (const [commandId, pending] of [...pendingSideEffectRecords]) {
    if (
      !backgroundSceneIdentity
      || pending.sceneIdentity !== backgroundSceneIdentity
      || !isCurrentSceneEpoch(pending.sceneEpoch)
    ) {
      pendingSideEffectRecords.delete(commandId);
      pendingHistoryRecords.delete(commandId);
      continue;
    }
    const retried = await runPostCommitSideEffects(
      pending.commitResult?.sideEffectsPending || [],
      () => (
        backgroundServiceMounted
        && pending.sceneIdentity === backgroundSceneIdentity
        && isCurrentSceneEpoch(pending.sceneEpoch)
      ),
    );
    pending.commitResult.sideEffectChanges = [
      ...(pending.commitResult.sideEffectChanges || []),
      ...retried.changes,
    ];
    pending.commitResult.sideEffectsPending = retried.pending;
    pending.commitResult.postCommitErrors = retried.errors;
    const historyPending = pendingHistoryRecords.get(commandId);
    if (historyPending) historyPending.commitResult = pending.commitResult;
    if (!retried.pending.length) {
      pendingSideEffectRecords.delete(commandId);
      recoveredPostCommitResults.set(commandId, clone(pending.commitResult));
      if (recoveredPostCommitResults.size > 256) {
        recoveredPostCommitResults.delete(recoveredPostCommitResults.keys().next().value);
      }
    }
  }
}

async function retryPendingEffectsHistory() {
  if (!pendingHistoryRecords.size) return;
  const { recordEffectsMutationHistory } = await import("./history.js");
  for (const [commandId, pending] of [...pendingHistoryRecords]) {
    if (
      !backgroundSceneIdentity
      || pending.sceneIdentity !== backgroundSceneIdentity
      || !isCurrentSceneEpoch(pending.sceneEpoch)
    ) {
      pendingHistoryRecords.delete(commandId);
      continue;
    }
    if (pendingSideEffectRecords.has(commandId)) continue;
    try {
      await recordEffectsMutationHistory(pending);
      pendingHistoryRecords.delete(commandId);
    } catch {}
  }
}

function enqueuePendingEffectsSideEffectRetry() {
  if (
    !effectsMutationCoordinator
    || !pendingSideEffectRecords.size
  ) return Promise.resolve();
  return effectsMutationCoordinator.enqueueMaintenance(retryPendingEffectsSideEffects);
}

function enqueuePendingEffectsHistoryRetry() {
  if (!pendingHistoryRecords.size) return Promise.resolve();
  const task = pendingHistoryRetryQueue.then(
    retryPendingEffectsHistory,
    retryPendingEffectsHistory,
  );
  pendingHistoryRetryQueue = task.catch(() => {});
  return task;
}

function enqueuePendingEffectsPostCommitRetry() {
  return Promise.all([
    enqueuePendingEffectsSideEffectRetry(),
    enqueuePendingEffectsHistoryRetry(),
  ]);
}

function schedulePendingEffectsHistoryRetry() {
  if (
    pendingHistoryRetryTimer
    || (!pendingHistoryRecords.size && !pendingSideEffectRecords.size)
  ) return;
  pendingHistoryRetryTimer = setTimeout(() => {
    pendingHistoryRetryTimer = null;
    void enqueuePendingEffectsPostCommitRetry().finally(() => {
      if (pendingHistoryRecords.size || pendingSideEffectRecords.size) {
        schedulePendingEffectsHistoryRetry();
      }
    });
  }, 750);
}

export async function mountEffectsMutationCoordinatorService() {
  if (backgroundServiceUnsubscribe) return true;
  if (typeof OBR?.broadcast?.onMessage !== "function") return false;
  try {
    if (await OBR.player.getRole() !== "GM") return false;
  } catch {
    return false;
  }
  backgroundServiceMounted = true;
  effectsMutationCoordinator = createBackgroundEffectsMutationCoordinator();
  let sceneReady = await OBR.scene.isReady().catch(() => false);
  if (sceneReady) {
    markSceneEpochReady("scene-ready-at-mount");
    backgroundSceneIdentity = createId("scene");
  } else {
    backgroundSceneIdentity = null;
    invalidateSceneEpoch("scene-unavailable-at-mount");
  }
  backgroundCommandBroker = createEffectsMutationBackgroundBroker({
    beforeExecute: enqueuePendingEffectsSideEffectRetry,
    executeApply: (operations, command) => {
      const { operations: _operations, ...options } = command;
      return runEffectsMutation(operations, {
        ...options,
        transport: "background",
        sceneEpoch: currentSceneEpoch(),
      });
    },
    executeUndo: (entry, command) => {
      const { entry: _entry, ...options } = command;
      return undoEffectsMutation(entry, {
        ...options,
        transport: "background",
        sceneEpoch: currentSceneEpoch(),
      });
    },
  });
  backgroundCommandBroker.setSceneIdentity(backgroundSceneIdentity);

  backgroundServiceUnsubscribe = OBR.broadcast.onMessage(
    EFFECTS_MUTATION_COMMAND_CHANNEL,
    (event) => {
      const data = event?.data;
      if (!data?.requestId || !["context", "apply", "undo"].includes(data.kind)) return;
      void (async () => {
        let result;
        try {
          const handled = await backgroundCommandBroker.handle(data);
          result = handled.result;
          if (data.kind !== "context") {
            const commandId = String(handled.command?.commandId || data.requestId);
            const recoveredCommitResult = recoveredPostCommitResults.get(commandId);
            if (
              handled.duplicate
              && recoveredCommitResult
              && !pendingSideEffectRecords.has(commandId)
            ) {
              result = {
                ...result,
                commitResult: clone(recoveredCommitResult),
                postCommitErrors: [],
                sideEffectsPending: [],
                sideEffectsRecovered: true,
              };
            }
            if (
              handled.duplicate
              && result?.historyPending
              && !pendingHistoryRecords.has(commandId)
            ) {
              result = {
                ...result,
                historyPending: false,
                historyRecovered: true,
                historyError: null,
              };
            }
            if (!handled.duplicate && result?.plan) {
              const pending = {
                command: handled.command,
                plan: result.plan,
                commitResult: result.commitResult,
                sceneEpoch: result.sceneEpoch,
                sceneIdentity: handled.command?.sceneIdentity,
              };
              if (result?.commitResult?.sideEffectsPending?.length) {
                pendingSideEffectRecords.set(commandId, pending);
              }
              if (result?.historyPending) pendingHistoryRecords.set(commandId, pending);
            }
            if (
              pendingHistoryRecords.has(commandId)
              || pendingSideEffectRecords.has(commandId)
            ) {
              schedulePendingEffectsHistoryRetry();
            }
          }
        } catch (error) {
          result = backgroundResultError(
            data.requestId,
            String(error?.message || error || "Coordinatore effetti fallito."),
          );
        }
        await OBR.broadcast.sendMessage(
          EFFECTS_MUTATION_RESULT_CHANNEL,
          { requestId: data.requestId, result },
          { destination: "LOCAL" },
        ).catch((error) => {
          console.warn("[effects-coordinator] response:", error?.message || error);
        });
      })();
    },
  );

  if (typeof OBR?.scene?.onReadyChange === "function") {
    backgroundSceneReadyUnsubscribe = OBR.scene.onReadyChange((ready) => {
      if (ready && !sceneReady) {
        sceneReady = true;
        markSceneEpochReady("scene-ready");
        backgroundSceneIdentity = createId("scene");
        backgroundCommandBroker?.setSceneIdentity(backgroundSceneIdentity);
        pendingHistoryRecords.clear();
        pendingSideEffectRecords.clear();
        recoveredPostCommitResults.clear();
        clearTimeout(pendingHistoryRetryTimer);
        pendingHistoryRetryTimer = null;
      } else if (sceneReady) {
        sceneReady = false;
        backgroundSceneIdentity = null;
        backgroundCommandBroker?.clear();
        pendingHistoryRecords.clear();
        pendingSideEffectRecords.clear();
        recoveredPostCommitResults.clear();
        clearTimeout(pendingHistoryRetryTimer);
        pendingHistoryRetryTimer = null;
        invalidateSceneEpoch("scene-unload");
      }
    });
  }
  return true;
}

export function unmountEffectsMutationCoordinatorService() {
  backgroundServiceUnsubscribe?.();
  backgroundServiceUnsubscribe = null;
  backgroundSceneReadyUnsubscribe?.();
  backgroundSceneReadyUnsubscribe = null;
  backgroundResultUnsubscribe?.();
  backgroundResultUnsubscribe = null;
  backgroundServiceMounted = false;
  effectsMutationCoordinator = null;
  backgroundSceneIdentity = null;
  backgroundCommandBroker?.clear();
  backgroundCommandBroker = null;
  pendingHistoryRecords.clear();
  pendingSideEffectRecords.clear();
  recoveredPostCommitResults.clear();
  pendingHistoryRetryQueue = Promise.resolve();
  clearTimeout(pendingHistoryRetryTimer);
  pendingHistoryRetryTimer = null;
}

function compatibilityPlan(result) {
  const plan = result?.plan || {};
  return {
    ...plan,
    ...result,
    plan: result?.plan || null,
    operations: result?.operations || plan.operations || [],
    changes: result?.changes || plan.changes || [],
    changedIds: result?.changedIds || plan.changedIds || [],
    states: plan.states || [],
  };
}

export async function runEffectsMutation(operations = [], options = {}) {
  const commandId = String(options.commandId || "").trim() || createId("effects-command");
  assertSerializableCommand({ operations, options });
  const serializableOperations = jsonSafeClone(operations);
  const serializableOptions = jsonSafeClone(options);
  if (!isBackgroundRuntime(options)) {
    if (!backgroundTransportAvailable()) return compatibilityPlan(backgroundResultError(
      commandId,
      "Runtime background non disponibile.",
    ));
    const sceneIdentity = options.sceneIdentity || await requestBackgroundSceneIdentity(commandId);
    const result = await requestBackgroundMutation(
      "apply",
      {
        command: {
          operations: serializableOperations,
          ...serializableOptions,
          commandId,
          sceneIdentity,
        },
      },
      commandId,
    );
    return compatibilityPlan(result);
  }
  if (!effectsMutationCoordinator) return compatibilityPlan(backgroundResultError(
    commandId,
    "Coordinatore effetti background non inizializzato.",
  ));
  const result = await effectsMutationCoordinator.enqueue({
    operations: serializableOperations,
    ...serializableOptions,
    commandId,
    sceneEpoch: options.sceneEpoch ?? currentSceneEpoch(),
    sceneIdentity: options.sceneIdentity || backgroundSceneIdentity,
  });
  const compatible = compatibilityPlan(result);
  void emitMatchedVisualEndsFromMutation(compatible, {
    sceneEpoch: options.sceneEpoch ?? currentSceneEpoch(),
  }).catch((error) => {
    console.warn("[effects] matched visual end:", error?.message || error);
  });
  return compatible;
}

export async function undoEffectsMutation(entryOrEntries, options = {}) {
  const commandId = String(options.commandId || "").trim() || createId("effects-undo-command");
  assertSerializableCommand({ entryOrEntries, options });
  const serializableEntries = jsonSafeClone(entryOrEntries);
  const serializableOptions = jsonSafeClone(options);
  if (!isBackgroundRuntime(options)) {
    if (!backgroundTransportAvailable()) return compatibilityPlan(backgroundResultError(
      commandId,
      "Runtime background non disponibile.",
    ));
    const sceneIdentity = options.sceneIdentity || await requestBackgroundSceneIdentity(commandId);
    const result = await requestBackgroundMutation(
      "undo",
      {
        entry: serializableEntries,
        options: {
          ...serializableOptions,
          commandId,
          sceneIdentity,
        },
      },
      commandId,
    );
    return compatibilityPlan(result);
  }
  if (!effectsMutationCoordinator) return compatibilityPlan(backgroundResultError(
    commandId,
    "Coordinatore Undo background non inizializzato.",
  ));
  const result = await effectsMutationCoordinator.enqueueUndo(serializableEntries, {
    ...serializableOptions,
    commandId,
    sceneEpoch: options.sceneEpoch ?? currentSceneEpoch(),
    sceneIdentity: options.sceneIdentity || backgroundSceneIdentity,
  });
  const compatible = compatibilityPlan(result);
  void emitMatchedVisualEndsFromMutation(compatible, {
    sceneEpoch: options.sceneEpoch ?? currentSceneEpoch(),
  }).catch((error) => {
    console.warn("[effects] matched visual end after undo:", error?.message || error);
  });
  return compatible;
}

export function getEffectsMutationCoordinatorState() {
  return effectsMutationCoordinator?.getState() || {
    queued: 0,
    running: false,
    completed: 0,
    runtime: "client",
  };
}

export { EFFECTS_MUTATION_STATUS, mutationResultError };

export function requireAppliedEffectsMutation(result) {
  if (result?.status !== EFFECTS_MUTATION_STATUS.APPLIED) {
    throw mutationResultError(result);
  }
  return result;
}

export async function tickRoundEffects(itemIds, delta) {
  if (!itemIds?.length || !Number.isFinite(delta) || delta === 0) return new Map();
  const ids = uniqueIds(itemIds);
  const plan = await runEffectsMutation([{
    type: "effects:tick-round",
    targetIds: ids,
    delta,
  }], { history: false, kind: "effects:tick-round", targetIds: ids });
  requireAppliedEffectsMutation(plan);
  const updates = new Map();
  const scope = new Set(ids);
  for (const change of plan.changes) {
    if (scope.has(change.id)) {
      updates.set(change.id, change.after);
    }
  }
  return updates;
}

export async function advanceTurnBoundaryEffects(itemIds, boundaries = []) {
  if (!itemIds?.length || !boundaries?.length) return new Map();
  const ids = uniqueIds(itemIds);
  const plan = await runEffectsMutation([{
    type: "effects:tick-boundaries",
    targetIds: ids,
    boundaries,
  }], { history: false, kind: "effects:tick-boundaries", targetIds: ids });
  requireAppliedEffectsMutation(plan);
  const updates = new Map();
  const scope = new Set(ids);
  for (const change of plan.changes) {
    if (scope.has(change.id)) updates.set(change.id, change.after);
  }
  return updates;
}

export function conditionMutationOperations({
  targetIds = [],
  conditionName = "",
  options = {},
  mode = "add",
  automate = true,
} = {}) {
  const ids = uniqueIds(targetIds);
  const type = mode === "toggle"
    ? "condition:toggle"
    : mode === "custom"
    ? "condition:add-custom"
    : "condition:add";
  const operations = [{ type, targetIds: ids, conditionName, options }];
  if (automate) operations.push({ type: "condition:automate", subjectIds: ids });
  return operations;
}

export function spellApplicationOperations({
  targetIds = [],
  casterId = "",
  enteredName = "",
  name = "",
  storedName = "",
  turns = 1,
  concentration = false,
  instanceId = "",
  spellId = "",
  spellExpiry = null,
  appliedAt = null,
  castContext = null,
  proposedConditions = [],
  proposedEffects = [],
  conditionOptions = {},
  concentrationAction = "replace",
} = {}) {
  return catalogSpellApplicationOperations({
    targetIds,
    casterId,
    enteredName,
    name,
    storedName,
    turns,
    concentration,
    instanceId,
    spellId,
    spellExpiry,
    appliedAt,
    castContext,
    proposedConditions,
    proposedEffects,
    conditionOptions,
    concentrationAction,
  });
}

export {
  saveSpellResolutionOperations,
  saveSpellTriggerResolutionOperations,
};

globalThis.__tbpEffectsMutations = {
  reset: resetEffectsMutationDiagnostics,
  report: getEffectsMutationDiagnostics,
  coordinator: getEffectsMutationCoordinatorState,
};
