import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import {
  gridFootprintSize,
  gridGeometryFromBounds,
} from "./distance3dCore.js";
import { withItemMetaHistory } from "./history.js";
import { calculateQuickHPChange, QUICK_HP_MODES } from "./quickHpCore.js";
import { getInitiativeCard } from "./initiativeCards.js";
import { getConditionInstances, refreshConditionLabels } from "./conditions.js";
import {
  commitEffectsMutationPlan,
  prepareEffectsMutation,
} from "./effectsMutations.js";
import {
  commitWithStaticSpellZoneRemoval,
  getStaticSpellZoneItems,
} from "./spellStaticZone.js";
import { staticSpellZoneItemsEndedByPlan } from "./spellStaticZoneCore.js";
import { spellAreaGridCells } from "./spellAreaPlacementCore.js";
import { currentInitiativeTurnKey } from "./turnBoundaryCore.js";
import {
  CLASS_FEATURE_STATE_FIELD,
  classFeatureBreaksConcentration,
  classFeatureConditionInstancesForActivation,
  classFeatureEffectProjection,
  classFeatureTemporaryHpApplications,
  classFeatureRuntimeSupport,
  classFeatureTargetIds,
  classFeatureTargetWithinRange,
  classFeatureTargeting,
  normalizeClassFeatureState,
  planClassFeatureActivation,
  planClassFeatureDeactivation,
  planClassFeatureResourceAdjustment,
  planClassFeatureResourceReset,
} from "./classFeatureCore.js";
import {
  CLASS_FEATURE_RESOURCE_POOL_BY_ID,
  getClassFeatureDefinition,
  getAvailableClassFeatures,
  getEnabledClassFeatures,
  getClassFeatureResourcePool,
} from "./classFeatureCatalog.js";

const META_KEY = `${ID}/meta`;
const STATE_KEY = `${ID}/state`;
const SPELLS_META_KEY = `${ID}/spells`;
const CONC_META_KEY = `${ID}/concentration`;
const CONDITION_SCHEMA_VERSION = 2;

function createInstanceId() {
  return typeof globalThis.crypto?.randomUUID === "function"
    ? `class-feature-${globalThis.crypto.randomUUID()}`
    : `class-feature-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function classFeatureError(reason, poolId = "") {
  if (reason === "feature-not-found") return new Error("Capacità non trovata.");
  if (reason === "feature-not-automated") {
    return new Error("Questa capacitÃ  Ã¨ nel catalogo, ma non Ã¨ ancora automatizzata.");
  }
  if (reason === "feature-not-enabled") {
    return new Error("Questa capacità non è abilitata per il personaggio.");
  }
  if (reason === "parent-feature-required") {
    return new Error("Questa capacitÃ  richiede prima l'attivazione della capacitÃ  collegata.");
  }
  if (reason === "choice-required") {
    return new Error("Scegli una variante della capacità prima di attivarla.");
  }
  if (reason === "invalid-choice") {
    return new Error("La variante scelta non è valida.");
  }
  if (reason === "source-not-found") return new Error("Token sorgente non trovato.");
  if (reason === "target-required") {
    return new Error("Seleziona almeno un bersaglio sulla mappa.");
  }
  if (reason === "target-too-many") {
    return new Error("Questa capacità richiede un solo bersaglio diverso dal caster.");
  }
  if (reason === "target-out-of-range") {
    return new Error("Il bersaglio selezionato è fuori portata.");
  }
  if (reason === "resource-pool-missing") {
    return new Error(`Risorsa non disponibile${poolId ? `: ${poolId}` : ""}.`);
  }
  if (reason === "resource-empty") return new Error("Usi della capacità esauriti.");
  return new Error("Attivazione della capacità non riuscita.");
}

async function currentTurnState() {
  const metadata = await OBR.scene.getMetadata().catch(() => ({}));
  const state = metadata?.[STATE_KEY] || {};
  return {
    round: Math.max(1, Math.floor(Number(state.round) || 1)),
    turnKey: currentInitiativeTurnKey(state),
  };
}

async function resolveTargetIds(sourceId, feature, requestedTargetIds) {
  const targeting = classFeatureTargeting(feature);
  if (targeting.mode === "self" || targeting.mode === "aura") return [sourceId];
  const selected = Array.isArray(requestedTargetIds)
    ? requestedTargetIds
    : await OBR.player.getSelection().catch(() => []);
  const ids = classFeatureTargetIds(feature, sourceId, selected);
  const resolvedIds = ids.length || targeting.excludeSource ? ids : [sourceId];
  if (!resolvedIds.length) throw classFeatureError("target-required");
  const items = await OBR.scene.items.getItems(resolvedIds);
  const validItems = items
    .filter((entry) => (
      entry?.layer === "CHARACTER"
      && !entry.attachedTo
      && (!targeting.excludeSource || entry.id !== sourceId)
    ));
  const valid = validItems.map((entry) => entry.id);
  if (!valid.length) throw classFeatureError("target-required");
  if (targeting.maxTargets !== null && valid.length > targeting.maxTargets) {
    throw classFeatureError("target-too-many");
  }

  if (targeting.rangeMeters) {
    const [dpiValue, scale, sourceBounds, targetBounds] = await Promise.all([
      OBR.scene.grid.getDpi().catch(() => 1),
      OBR.scene.grid.getScale().catch(() => ({ parsed: { multiplier: 1.5, unit: "m" } })),
      OBR.scene.items.getItemBounds([sourceId]).catch(() => null),
      Promise.all(valid.map(async (targetId) => [
        targetId,
        await OBR.scene.items.getItemBounds([targetId]).catch(() => null),
      ])),
    ]);
    const dpi = Math.max(1, Number(dpiValue) || 1);
    const parsedScale = scale?.parsed && typeof scale.parsed === "object"
      ? scale.parsed
      : { multiplier: 1.5, unit: "m" };
    const rangeCells = spellAreaGridCells(
      { value: targeting.rangeMeters, unit: "m" },
      parsedScale,
    );
    const sourceGeometry = sourceBounds
      ? gridGeometryFromBounds(sourceBounds, dpi)
      : null;
    let sourceItemGeometry = sourceGeometry;
    if (!sourceItemGeometry) {
      const [sourceItem] = await OBR.scene.items.getItems([sourceId]).catch(() => []);
      sourceItemGeometry = sourceItem
        ? {
          position: sourceItem.position,
          size: gridFootprintSize(sourceItem, dpi),
        }
        : null;
    }
    const outOfRange = targetBounds.some(([targetId, bounds]) => {
      const targetItem = validItems.find((entry) => entry.id === targetId);
      const targetGeometry = bounds
        ? gridGeometryFromBounds(bounds, dpi)
        : {
          position: targetItem?.position,
          size: gridFootprintSize(targetItem, dpi),
        };
      if (!sourceItemGeometry?.position || !targetGeometry?.position) return false;
      return !classFeatureTargetWithinRange(
        sourceItemGeometry,
        targetGeometry,
        rangeCells,
        dpi,
      );
    });
    if (outOfRange) throw classFeatureError("target-out-of-range");
  }
  return valid;
}

function conditionInstancesForMeta(meta) {
  return getConditionInstances(meta?.conditions || {});
}

function isClassFeatureConditionType(value) {
  return value === "class-feature" || value === "class-feature-area";
}

function setConditionInstances(meta, instances) {
  const next = Array.isArray(instances) ? instances.filter(Boolean) : [];
  if (next.length) {
    meta.conditions = {
      version: CONDITION_SCHEMA_VERSION,
      instances: next,
    };
  } else {
    delete meta.conditions;
  }
}

function appendConditionInstances(meta, additions = []) {
  const current = conditionInstancesForMeta(meta);
  const byId = new Map(current.map((entry) => [String(entry.id || ""), entry]));
  for (const addition of additions) {
    if (!addition?.id) continue;
    byId.set(String(addition.id), addition);
  }
  setConditionInstances(meta, [...byId.values()]);
}

function removeClassFeatureParent(meta, parentId) {
  const wanted = String(parentId || "").trim();
  if (!wanted) return false;
  const current = conditionInstancesForMeta(meta);
  const next = current.filter((entry) => !(
    isClassFeatureConditionType(String(entry?.type || ""))
    && String(entry?.parentEffectId || "") === wanted
  ));
  if (next.length === current.length) return false;
  setConditionInstances(meta, next);
  return true;
}

async function terminateConcentrationForClassFeature(sourceId, feature) {
  if (!classFeatureBreaksConcentration(feature)) return [];
  const mutationPlan = await prepareEffectsMutation([{
    type: "concentration:break",
    casterIds: [sourceId],
  }]);
  const changedIds = Array.isArray(mutationPlan?.changedIds)
    ? mutationPlan.changedIds
    : [];
  if (!changedIds.length) return [];
  const staticZoneCandidates = await getStaticSpellZoneItems({ casterId: sourceId });
  const staticZoneItems = staticSpellZoneItemsEndedByPlan(
    staticZoneCandidates,
    mutationPlan,
  );
  await withItemMetaHistory({
    kind: "spell",
    label: `Concentrazione terminata: ${feature.name}`,
    itemIds: changedIds,
    sceneItemIds: staticZoneItems.map((item) => item.id),
    fields: [SPELLS_META_KEY, CONC_META_KEY, "conditions"],
  }, () => commitWithStaticSpellZoneRemoval(
    staticZoneItems,
    () => commitEffectsMutationPlan(mutationPlan),
  ));
  await refreshConditionLabels(changedIds);
  return changedIds;
}

export function getClassFeatureState(item) {
  return normalizeClassFeatureState(
    item?.metadata?.[META_KEY]?.[CLASS_FEATURE_STATE_FIELD]
  );
}

export async function activateClassFeature({
  sourceId,
  featureId,
  targetIds,
  choiceId,
  autoChoiceIds = {},
  suppressAutoActivation = false,
} = {}) {
  const feature = getClassFeatureDefinition(featureId);
  if (!feature) throw classFeatureError("feature-not-found");
  if (!classFeatureRuntimeSupport(feature).ready) {
    throw classFeatureError("feature-not-automated");
  }
  const [sourceItem] = await OBR.scene.items.getItems([sourceId]);
  if (!sourceItem) throw classFeatureError("source-not-found");
  const profile = getInitiativeCard(sourceItem);
  if (!getEnabledClassFeatures(profile).some((entry) => entry.id === feature.id)) {
    throw classFeatureError("feature-not-enabled");
  }

  const resolvedTargetIds = await resolveTargetIds(sourceItem.id, feature, targetIds);
  const turnState = await currentTurnState();
  const round = turnState.round;
  const instanceId = createInstanceId();
  let activation = null;
  const itemIds = Array.from(new Set([sourceItem.id, ...resolvedTargetIds]));
  const temporaryHpApplications = classFeatureTemporaryHpApplications(feature, {
    sourceId: sourceItem.id,
    targetIds: resolvedTargetIds,
    choiceId,
  });
  await withItemMetaHistory({
    kind: "class-feature",
    label: `Capacità: ${feature.name}`,
    itemIds,
    fields: [
      CLASS_FEATURE_STATE_FIELD,
      "conditions",
      ...(temporaryHpApplications.length ? ["hp"] : []),
    ],
  }, () => OBR.scene.items.updateItems(itemIds, (drafts) => {
    const sourceDraft = drafts.find((entry) => entry.id === sourceItem.id);
    if (!sourceDraft) return;
    const meta = { ...(sourceDraft.metadata?.[META_KEY] || {}) };
    activation = planClassFeatureActivation({
      state: meta[CLASS_FEATURE_STATE_FIELD],
      feature,
      poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
      characterBuild: profile.characterBuild,
      sourceId: sourceItem.id,
      targetIds: resolvedTargetIds,
      currentRound: round,
      currentTurnKey: turnState.turnKey,
      instanceId,
      choiceId,
    });
    if (!activation.ok) return;
    meta[CLASS_FEATURE_STATE_FIELD] = activation.state;
    sourceDraft.metadata = { ...(sourceDraft.metadata || {}), [META_KEY]: meta };

    const additions = classFeatureConditionInstancesForActivation(
      feature,
      activation.instance,
      sourceItem.name,
    );
    const additionsByTarget = new Map();
    for (const instance of additions) {
      const list = additionsByTarget.get(instance.targetId) || [];
      list.push(instance);
      additionsByTarget.set(instance.targetId, list);
    }
    for (const draft of drafts) {
      const targetAdditions = additionsByTarget.get(draft.id);
      if (!targetAdditions?.length) continue;
      const targetMeta = { ...(draft.metadata?.[META_KEY] || {}) };
      appendConditionInstances(targetMeta, targetAdditions);
      draft.metadata = { ...(draft.metadata || {}), [META_KEY]: targetMeta };
    }
    for (const application of temporaryHpApplications) {
      const draft = drafts.find((entry) => entry.id === application.targetId);
      if (!draft) continue;
      const targetMeta = { ...(draft.metadata?.[META_KEY] || {}) };
      const hp = Number(targetMeta.hp);
      const hpMax = Number(targetMeta.hpMax);
      if (!Number.isFinite(hp) || !Number.isFinite(hpMax) || hpMax <= 0) continue;
      const change = calculateQuickHPChange({
        mode: QUICK_HP_MODES.TEMP,
        value: application.amount,
        hp,
        hpMax,
      });
      if (!change.changed) continue;
      targetMeta.hp = change.afterHP;
      draft.metadata = { ...(draft.metadata || {}), [META_KEY]: targetMeta };
    }
  }));

  if (!activation?.ok) {
    throw classFeatureError(
      activation?.reason || "invalid-activation",
      activation?.poolId
    );
  }
  const concentrationChangedIds = await terminateConcentrationForClassFeature(
    sourceItem.id,
    feature,
  );
  await refreshConditionLabels(Array.from(new Set([
    ...itemIds,
    ...concentrationChangedIds,
  ])));
  const autoResults = [];
  if (!suppressAutoActivation && Array.isArray(feature.autoActivateFeatureIds)) {
    const enabledIds = new Set(
      getEnabledClassFeatures(profile).map((entry) => entry.id)
    );
    const latestSource = (await OBR.scene.items.getItems([sourceItem.id]))[0] || sourceItem;
    const latestState = normalizeClassFeatureState(
      latestSource.metadata?.[META_KEY]?.[CLASS_FEATURE_STATE_FIELD]
    );
    for (const childFeatureId of feature.autoActivateFeatureIds) {
      const childId = String(childFeatureId || "").trim();
      if (!childId || !enabledIds.has(childId)) continue;
      if (latestState.instances.some((entry) => entry.featureId === childId)) continue;
      const child = getClassFeatureDefinition(childId);
      if (!child || (Array.isArray(child.choiceOptions) && child.choiceOptions.length
        && !String(autoChoiceIds?.[childId] || "").trim())) continue;
      autoResults.push(await activateClassFeature({
        sourceId: sourceItem.id,
        featureId: childId,
        choiceId: String(autoChoiceIds?.[childId] || "").trim(),
        suppressAutoActivation: true,
      }));
    }
  }
  return {
    feature,
    instance: activation.instance,
    state: activation.state,
    targetIds: resolvedTargetIds,
    autoResults,
  };
}

export async function deactivateClassFeature(sourceId, instanceId) {
  const [sourceItem] = await OBR.scene.items.getItems([sourceId]);
  if (!sourceItem) throw classFeatureError("source-not-found");
  const currentState = getClassFeatureState(sourceItem);
  const plannedRemoval = planClassFeatureDeactivation(currentState, instanceId);
  const removedInstanceIds = new Set(plannedRemoval.removedInstanceIds || [String(instanceId || "")]);
  const removedEntries = currentState.instances.filter((entry) => removedInstanceIds.has(entry.instanceId));
  const sceneItems = await OBR.scene.items.getItems();
  const parentItems = sceneItems.filter((item) =>
    conditionInstancesForMeta(item?.metadata?.[META_KEY])
      .some((entry) => (
        isClassFeatureConditionType(String(entry?.type || ""))
        && removedInstanceIds.has(String(entry?.parentEffectId || ""))
      ))
  );
  const itemIds = Array.from(new Set([
    sourceId,
    ...removedEntries.flatMap((entry) => entry.targetIds || []),
    ...parentItems.map((item) => item.id),
  ]));
  let result = null;
  await withItemMetaHistory({
    kind: "class-feature",
    label: "Capacità terminata",
    itemIds,
    fields: [CLASS_FEATURE_STATE_FIELD, "conditions"],
  }, () => OBR.scene.items.updateItems(itemIds, (drafts) => {
    const sourceDraft = drafts.find((entry) => entry.id === sourceId);
    if (!sourceDraft) return;
    const meta = { ...(sourceDraft.metadata?.[META_KEY] || {}) };
    result = planClassFeatureDeactivation(meta[CLASS_FEATURE_STATE_FIELD], instanceId);
    if (result.changed) {
      meta[CLASS_FEATURE_STATE_FIELD] = result.state;
      sourceDraft.metadata = { ...(sourceDraft.metadata || {}), [META_KEY]: meta };
    }
    for (const draft of drafts) {
      const draftMeta = { ...(draft.metadata?.[META_KEY] || {}) };
      let changed = false;
      for (const removedId of removedInstanceIds) {
        if (removeClassFeatureParent(draftMeta, removedId)) changed = true;
      }
      if (!changed) continue;
      draft.metadata = { ...(draft.metadata || {}), [META_KEY]: draftMeta };
    }
  }));
  await refreshConditionLabels(itemIds);
  return result || {
    changed: false,
    state: getClassFeatureState(sourceItem),
  };
}

export async function reconcileClassFeatureActivationsAfterConditionRemoval(
  removedConditions = [],
  { inline = false } = {},
) {
  const grouped = new Map();
  for (const instance of Array.isArray(removedConditions) ? removedConditions : []) {
    if (!isClassFeatureConditionType(String(instance?.type || ""))) continue;
    const sourceId = String(instance?.sourceId || "").trim();
    const parentEffectId = String(instance?.parentEffectId || "").trim();
    const targetId = String(instance?.targetId || "").trim();
    if (!sourceId || !parentEffectId || !targetId) continue;
    const key = `${sourceId}\u0000${parentEffectId}`;
    const entry = grouped.get(key) || {
      sourceId,
      parentEffectId,
      targetIds: new Set(),
      areaTargetIds: new Set(),
    };
    entry.targetIds.add(targetId);
    if (String(instance?.type || "") === "class-feature-area") {
      entry.areaTargetIds.add(targetId);
    }
    grouped.set(key, entry);
  }
  if (!grouped.size) return [];

  const sourceIds = Array.from(new Set([...grouped.values()].map((entry) => entry.sourceId)));
  const sources = await OBR.scene.items.getItems(sourceIds);
  const bySourceId = new Map(sources.map((item) => [item.id, item]));
  const updates = new Map();

  for (const entry of grouped.values()) {
    const source = bySourceId.get(entry.sourceId);
    if (!source) continue;
    const state = updates.get(source.id)?.nextState || getClassFeatureState(source);
    const active = state.instances.find((value) => value.instanceId === entry.parentEffectId);
    if (!active) continue;
    const feature = getClassFeatureDefinition(active.featureId);
    const projection = classFeatureEffectProjection(feature, active.choiceId);
    const targeting = classFeatureTargeting(feature);
    const sourceConditionRemoved = entry.targetIds.has(active.sourceId)
      && !entry.areaTargetIds.has(active.sourceId);
    const areaConditionRemoved = entry.areaTargetIds.size > 0;
    const areaTargetOnly = projection.kind === "aura"
      && areaConditionRemoved
      && !sourceConditionRemoved;
    const removeWhole = projection.kind !== "aura"
      || targeting.mode === "self"
      || targeting.mode === "single-target"
      || !areaTargetOnly;
    const nextInstances = removeWhole
      ? planClassFeatureDeactivation(state, entry.parentEffectId).state.instances
      : state.instances.map((value) => value.instanceId !== entry.parentEffectId
        ? value
        : {
          ...value,
          suppressedTargetIds: Array.from(new Set([
            ...(value.suppressedTargetIds || []),
            ...entry.areaTargetIds,
          ])),
        }
      );
    if (JSON.stringify(nextInstances) === JSON.stringify(state.instances)) continue;
    updates.set(source.id, { nextState: { ...state, instances: nextInstances } });
  }

  if (!updates.size) return [];
  const ids = [...updates.keys()];
  const changed = [];
  await withItemMetaHistory({
    kind: "class-feature",
    label: "Terminata capacità dopo rimozione effetto",
    itemIds: ids,
    fields: [CLASS_FEATURE_STATE_FIELD],
    inline,
  }, () => OBR.scene.items.updateItems(ids, (drafts) => {
    for (const draft of drafts) {
      const update = updates.get(draft.id);
      if (!update) continue;
      const meta = { ...(draft.metadata?.[META_KEY] || {}) };
      meta[CLASS_FEATURE_STATE_FIELD] = update.nextState;
      draft.metadata = { ...(draft.metadata || {}), [META_KEY]: meta };
      changed.push(draft.id);
    }
  }));
  return changed;
}

export async function adjustClassFeatureResource(
  sourceId,
  poolId,
  adjustment = {},
) {
  const pool = getClassFeatureResourcePool(poolId);
  if (!pool) throw classFeatureError("resource-pool-missing", poolId);
  const [sourceItem] = await OBR.scene.items.getItems([sourceId]);
  if (!sourceItem) throw classFeatureError("source-not-found");
  const profile = getInitiativeCard(sourceItem);
  let result = null;

  await withItemMetaHistory({
    kind: "class-feature",
    label: `Risorsa: ${pool.name}`,
    itemIds: [sourceId],
    fields: [CLASS_FEATURE_STATE_FIELD],
  }, () => OBR.scene.items.updateItems([sourceId], (drafts) => {
    const draft = drafts[0];
    if (!draft) return;
    const meta = { ...(draft.metadata?.[META_KEY] || {}) };
    result = planClassFeatureResourceAdjustment(
      meta[CLASS_FEATURE_STATE_FIELD],
      pool,
      profile.characterBuild,
      adjustment
    );
    if (!result.changed) return;
    meta[CLASS_FEATURE_STATE_FIELD] = result.state;
    draft.metadata = { ...(draft.metadata || {}), [META_KEY]: meta };
  }));
  return result || {
    changed: false,
    state: getClassFeatureState(sourceItem),
  };
}

export async function resetClassFeatureResources(sourceId) {
  const [sourceItem] = await OBR.scene.items.getItems([sourceId]);
  if (!sourceItem) throw classFeatureError("source-not-found");
  const profile = getInitiativeCard(sourceItem);
  const currentState = getClassFeatureState(sourceItem);
  const poolIds = new Set(Object.keys(currentState.resources));
  for (const feature of getAvailableClassFeatures(profile.characterBuild)) {
    for (const cost of Array.isArray(feature.resourceCosts) ? feature.resourceCosts : []) {
      if (cost?.poolId) poolIds.add(String(cost.poolId));
    }
  }

  let result = null;
  await withItemMetaHistory({
    kind: "class-feature",
    label: "Risorse di classe ripristinate",
    itemIds: [sourceId],
    fields: [CLASS_FEATURE_STATE_FIELD],
  }, () => OBR.scene.items.updateItems([sourceId], (drafts) => {
    const draft = drafts[0];
    if (!draft) return;
    const meta = { ...(draft.metadata?.[META_KEY] || {}) };
    result = planClassFeatureResourceReset(
      meta[CLASS_FEATURE_STATE_FIELD],
      CLASS_FEATURE_RESOURCE_POOL_BY_ID,
      profile.characterBuild,
      [...poolIds],
    );
    if (!result.changed) return;
    meta[CLASS_FEATURE_STATE_FIELD] = result.state;
    draft.metadata = { ...(draft.metadata || {}), [META_KEY]: meta };
  }));
  return result || {
    changed: false,
    state: getClassFeatureState(sourceItem),
    poolIds: [],
  };
}
