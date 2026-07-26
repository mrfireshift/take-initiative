import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { CONDITION_LIST, getConditionInstances } from "./conditions.js";
import { effectsDiagnostics } from "./effectsDiagnostics.js";
import { spellEffectConditionOptions } from "./spellEffectCore.js";
import { saveSpellResolutionOperations } from "./saveSpellOperationsCore.js";
import {
  buildEffectsMutationPlan,
  EFFECTS_MUTATION_CONDITION_VERSION,
} from "./effectsMutationCore.js";

const META_KEY = `${ID}/meta`;
const SPELLS_META_KEY = `${ID}/spells`;
const CONC_META_KEY = `${ID}/concentration`;

const clone = (value) => {
  if (value === undefined) return undefined;
  if (typeof globalThis.structuredClone === "function") return globalThis.structuredClone(value);
  return JSON.parse(JSON.stringify(value));
};

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

  if (["condition:add", "condition:add-custom", "condition:toggle"].includes(next.type)) {
    next.instanceIds = { ...(next.instanceIds || {}) };
    next.consequenceInstanceIds = { ...(next.consequenceInstanceIds || {}) };
    for (const targetId of targetIds) {
      next.instanceIds[targetId] ||= createId("condition");
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

export async function prepareEffectsMutation(operations = []) {
  const mutationId = createId("effects-mutation");
  const preparedOperations = (Array.isArray(operations) ? operations : [])
    .map(prepareOperation)
    .filter((operation) => operation.type);
  const sceneItems = await OBR.scene.items.getItems();
  const plan = buildEffectsMutationPlan(
    sceneItems.map(normalizedSceneItem),
    preparedOperations,
    {
      knownConditionNames: CONDITION_LIST,
      maxCustomConditions: 3,
    }
  );
  plan.mutationId = mutationId;
  plan.scannedItems = sceneItems.length;

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

export async function commitEffectsMutationPlan(plan) {
  const changes = Array.isArray(plan?.changes) ? plan.changes : [];
  const mutationId = String(plan?.mutationId || createId("effects-mutation"));
  if (!changes.length) {
    mutationStats.noChange += 1;
    effectsDiagnostics.event("mutation:no-change", { mutationId });
    return [];
  }

  const byId = new Map(changes.map((change) => [change.id, change]));
  const ids = [...byId.keys()];
  try {
    mutationStats.updateCalls += 1;
    mutationStats.requestedItems += ids.length;
    await OBR.scene.items.updateItems(ids, (drafts) => {
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
        item.metadata = { ...(item.metadata || {}), [META_KEY]: meta };
      }
    });
    mutationStats.commits += 1;
    effectsDiagnostics.event("mutation:commit", {
      mutationId,
      updateCalls: 1,
      changedItems: ids.length,
    });
    return ids;
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

export async function runEffectsMutation(operations = []) {
  const plan = await prepareEffectsMutation(operations);
  await commitEffectsMutationPlan(plan);
  return plan;
}

export async function tickRoundEffects(itemIds, delta) {
  if (!itemIds?.length || !Number.isFinite(delta) || delta === 0) return new Map();
  const ids = uniqueIds(itemIds);
  const plan = await runEffectsMutation([{
    type: "effects:tick-round",
    targetIds: ids,
    delta,
  }]);
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
  }]);
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
  proposedConditions = [],
  proposedEffects = [],
  conditionOptions = {},
} = {}) {
  const targets = uniqueIds(targetIds);
  const caster = String(casterId || "").trim();
  const operations = [];
  if (concentration && caster) {
    operations.push({ type: "concentration:break", casterIds: [caster] });
  }
  operations.push({
    type: "spell:upsert",
    targetIds: targets,
    name,
    turns,
    conc: concentration && !!caster,
    source: caster,
    instanceId,
    spellId,
    ...(spellExpiry ? { expiry: spellExpiry } : {}),
    ...(appliedAt ? { appliedAt } : {}),
    replaceNames: uniqueIds([enteredName, name, storedName]),
  });
  for (const proposedCondition of proposedConditions || []) {
    const conditionName = typeof proposedCondition === "string"
      ? proposedCondition
      : String(proposedCondition?.name || "").trim();
    if (!conditionName) continue;
    const proposedOptions = proposedCondition && typeof proposedCondition === "object"
      ? proposedCondition.options || {}
      : {};
    operations.push({
      type: "condition:add",
      targetIds: targets,
      conditionName,
      options: {
        ...conditionOptions,
        parentEffectId: instanceId,
        type: "spell",
        ...proposedOptions,
      },
    });
  }
  for (const effect of proposedEffects || []) {
    const effectLabel = String(effect?.label || "").trim();
    const effectKind = effect?.kind === "buff" || effect?.kind === "debuff"
      ? effect.kind
      : "";
    if (!effectLabel || !effectKind) continue;
    operations.push({
      type: "condition:add",
      targetIds: targets,
      conditionName: effectLabel,
      options: spellEffectConditionOptions(effect, conditionOptions, instanceId),
    });
  }
  if (concentration && caster) {
    operations.push({
      type: "concentration:register",
      casterId: caster,
      targetIds: targets,
      name,
      instanceId,
      spellId,
    });
  }
  if (proposedConditions?.length) {
    operations.push({ type: "condition:automate", subjectIds: targets });
  }
  return operations;
}

export { saveSpellResolutionOperations };

globalThis.__tbpEffectsMutations = {
  reset: resetEffectsMutationDiagnostics,
  report: getEffectsMutationDiagnostics,
};
