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
import { SPELL_STATIC_ZONE_META_KEY } from "./spellStaticZoneCore.js";
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

function sameValue(left, right) {
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return left === right;
  }
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

async function prepareEffectsSideEffects(plan, command) {
  const descriptors = Array.isArray(command?.sideEffects) ? command.sideEffects : [];
  const prepared = [];
  for (const descriptor of descriptors) {
    if (descriptor?.type === "static-zone:remove-ended") {
      const candidates = await zoneItemsForSelectors(descriptor.selectors || []);
      const { staticSpellZoneItemsEndedByPlan } = await import("./spellStaticZoneCore.js");
      prepared.push({
        type: descriptor.type,
        items: staticSpellZoneItemsEndedByPlan(candidates, plan),
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

async function retryPendingEffectsPostCommit() {
  await retryPendingEffectsSideEffects();
  await retryPendingEffectsHistory();
}

function enqueuePendingEffectsPostCommitRetry() {
  if (
    !effectsMutationCoordinator
    || (!pendingHistoryRecords.size && !pendingSideEffectRecords.size)
  ) return Promise.resolve();
  return effectsMutationCoordinator.enqueueMaintenance(retryPendingEffectsPostCommit);
}

function schedulePendingEffectsHistoryRetry() {
  if (
    pendingHistoryRetryTimer
    || (!pendingHistoryRecords.size && !pendingSideEffectRecords.size)
  ) return;
  pendingHistoryRetryTimer = setTimeout(() => {
    pendingHistoryRetryTimer = null;
    void enqueuePendingEffectsPostCommitRetry();
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
    beforeExecute: enqueuePendingEffectsPostCommitRetry,
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
  return compatibilityPlan(result);
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
  return compatibilityPlan(result);
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
