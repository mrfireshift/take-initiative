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
import { EXHAUSTION_CONDITION } from "./exhaustionCore.js";
import { getSpellsFromItem } from "./spells.js";
import { getSpellDefinition } from "./spells-srd.js";
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
  activeClassFeatureInstances,
  classFeatureAutoActivateParentFeatureId,
  classFeatureBreaksConcentration,
  classFeatureConditionInstancesForActivation,
  classFeatureEffectProjection,
  classFeatureSpellSlotCreationCost,
  classFeatureTemporaryHpApplications,
  classFeatureRuntimeSupport,
  classFeatureTargetIds,
  classFeatureTargetWithinRange,
  classFeatureTargeting,
  resolveClassFeatureResourceDie,
  normalizeClassFeatureState,
  planClassFeatureActivation,
  planClassFeatureDeactivation,
  planClassFeatureResourceAdjustment,
  planClassFeatureSpecialRefresh,
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
const BARDIC_INSPIRATION_FEATURE_ID = "bardo-ispirazione-bardica";
const BARDIC_INSPIRATION_POOL_ID = "bardo-ispirazione-bardica-usi";
const ELOQUENCE_SUBCLASS_ID = "bardo-collegio-dell-eloquenza";
const ELOQUENCE_INFALLIBLE_FEATURE_ID = "bardo-collegio-dell-eloquenza-ispirazione-infallibile";
const BERSERKER_FRENZY_FEATURE_ID = "barbaro-cammino-del-berserker-frenesia";

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
  if (reason === "target-effect-already-active") {
    return new Error("Il bersaglio possiede già Ispirazione Bardica.");
  }
  if (reason === "feature-already-active") {
    return new Error("Questa capacità è già attiva.");
  }
  if (reason === "resource-pool-missing") {
    return new Error(`Risorsa non disponibile${poolId ? `: ${poolId}` : ""}.`);
  }
  if (reason === "resource-empty") return new Error("Usi della capacità esauriti.");
  if (reason === "resource-value-required") {
    return new Error("Inserisci un valore positivo per questa capacità.");
  }
  if (reason === "invalid-inspiration-die-value") {
    return new Error("Inserisci un risultato intero tra 1 e il massimo del dado di Ispirazione Bardica.");
  }
  if (reason === "universal-speech-mode-required") {
    return new Error("Scegli come usare Linguaggio Universale.");
  }
  if (reason === "night-eyes-mode-required") {
    return new Error("Scegli come usare Occhi della Notte.");
  }
  if (reason === "slot-confirmation-required") {
    return new Error("Conferma che lo slot di Linguaggio Universale sia già stato speso.");
  }
  if (reason === "night-eyes-slot-confirmation-required") {
    return new Error("Conferma che lo slot di Occhi della Notte sia già stato speso.");
  }
  if (reason === "turn-undead-mode-required") {
    return new Error("Conferma se applicare Scacciato ai fallimenti oppure consumare l'uso senza bersagli.");
  }
  if (reason === "turn-creatures-mode-required") {
    return new Error("Conferma se applicare l'effetto ai fallimenti oppure consumare l'uso senza bersagli.");
  }
  if (reason === "hp-invalid") {
    return new Error("Il bersaglio non ha HP validi per questa operazione.");
  }
  if (reason === "spell-slot-level-invalid") {
    return new Error("Scegli un livello di slot valido per Fonte di Magia.");
  }
  if (reason === "special-refresh-unavailable") {
    return new Error("Ripristino Stregonesco disponibile solo dal livello 20.");
  }
  if (reason === "target-spell-required") {
    return new Error("Seleziona un incantesimo attivo del bersaglio.");
  }
  if (reason === "spell-mode-required") {
    return new Error("Scegli se negare l'effetto o rubare l'incantesimo.");
  }
  if (reason === "spell-required") {
    return new Error("Seleziona un incantesimo dal catalogo.");
  }
  if (reason === "spell-cantrip-invalid") {
    return new Error("La modalità Incantesimo rubato richiede un incantesimo di almeno 1° livello.");
  }
  if (reason === "spell-level-confirmation-required") {
    return new Error("Conferma manualmente che il Ladro può lanciare questo livello.");
  }
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

async function resolveTargetIds(sourceId, feature, requestedTargetIds, characterBuild = []) {
  const targeting = classFeatureTargeting(feature, characterBuild);
  if (targeting.mode === "self" || targeting.mode === "aura") return [sourceId];
  const selected = Array.isArray(requestedTargetIds)
    ? requestedTargetIds
    : await OBR.player.getSelection().catch(() => []);
  const ids = classFeatureTargetIds(feature, sourceId, selected, characterBuild);
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

async function loadEnabledClassFeatureSource(sourceId, feature) {
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
  return { sourceItem, profile };
}

async function applyLayOnHandsResolved({
  feature,
  sourceItem,
  profile,
  targetIds,
  value,
  mode = "heal",
  conditionCount = 0,
} = {}) {
  const normalizedMode = ["disease", "poison", "disease-poison"].includes(
    String(mode || "").trim().toLowerCase()
  )
    ? "disease-poison"
    : "heal";
  const rawValue = Number(value);
  const rawConditions = Number(conditionCount);
  const requestedValue = Number.isInteger(rawValue) && rawValue > 0 ? rawValue : null;
  const requestedConditions = Number.isInteger(rawConditions) && rawConditions > 0
    ? rawConditions
    : null;
  const costAmount = normalizedMode === "disease-poison"
    ? requestedConditions * 5
    : requestedValue;
  if (!Number.isInteger(costAmount) || costAmount <= 0) {
    throw classFeatureError("resource-value-required");
  }

  const resolvedTargetIds = await resolveTargetIds(
    sourceItem.id,
    feature,
    targetIds,
    profile.characterBuild,
  );
  const [targetId] = resolvedTargetIds;
  const cost = (Array.isArray(feature.resourceCosts) ? feature.resourceCosts : [])
    .find((entry) => entry?.variable === true)
    || feature.resourceCosts?.[0];
  if (!cost?.poolId) throw classFeatureError("resource-pool-missing");

  const turnState = await currentTurnState();
  const instanceId = createInstanceId();
  const itemIds = Array.from(new Set([sourceItem.id, targetId]));
  let activation = null;
  let hpChange = null;
  await withItemMetaHistory({
    kind: "class-feature",
    label: `Capacità: ${feature.name}`,
    itemIds,
    fields: [CLASS_FEATURE_STATE_FIELD, "hp"],
  }, () => OBR.scene.items.updateItems(itemIds, (drafts) => {
    const sourceDraft = drafts.find((entry) => entry.id === sourceItem.id);
    const targetDraft = drafts.find((entry) => entry.id === targetId);
    if (!sourceDraft || !targetDraft) {
      activation = { ok: false, reason: "target-required" };
      return;
    }
    const sourceMeta = { ...(sourceDraft.metadata?.[META_KEY] || {}) };
    activation = planClassFeatureActivation({
      state: sourceMeta[CLASS_FEATURE_STATE_FIELD],
      feature,
      poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
      characterBuild: profile.characterBuild,
      sourceId: sourceItem.id,
      targetIds: resolvedTargetIds,
      currentRound: turnState.round,
      currentTurnKey: turnState.turnKey,
      instanceId,
      resourceValues: { [cost.poolId]: costAmount },
      enabledFeatureIds: getEnabledClassFeatures(profile).map((entry) => entry.id),
    });
    if (!activation.ok) return;

    if (normalizedMode === "heal") {
      const targetMeta = { ...(targetDraft.metadata?.[META_KEY] || {}) };
      const hp = Number(targetMeta.hp);
      const hpMax = Number(targetMeta.hpMax);
      if (!Number.isFinite(hp) || !Number.isFinite(hpMax) || hpMax <= 0) {
        activation = { ok: false, reason: "hp-invalid" };
        return;
      }
      hpChange = calculateQuickHPChange({
        mode: QUICK_HP_MODES.HEAL,
        value: requestedValue,
        hp,
        hpMax,
      });
      if (targetDraft.id === sourceDraft.id) {
        if (hpChange.changed) sourceMeta.hp = hpChange.afterHP;
      } else if (hpChange.changed) {
        targetMeta.hp = hpChange.afterHP;
        targetDraft.metadata = { ...(targetDraft.metadata || {}), [META_KEY]: targetMeta };
      }
    }

    sourceMeta[CLASS_FEATURE_STATE_FIELD] = activation.state;
    sourceDraft.metadata = { ...(sourceDraft.metadata || {}), [META_KEY]: sourceMeta };
  }));

  if (!activation?.ok) {
    throw classFeatureError(activation?.reason || "invalid-activation", activation?.poolId);
  }
  await refreshConditionLabels(itemIds);
  return {
    feature,
    instance: activation.instance,
    state: activation.state,
    targetIds: resolvedTargetIds,
    mode: normalizedMode,
    requestedValue: normalizedMode === "heal" ? requestedValue : requestedConditions,
    resourceSpent: costAmount,
    hpChange,
  };
}

export async function applyLayOnHands({
  sourceId,
  featureId = "paladino-imposizione-delle-mani",
  targetIds,
  value,
  mode = "heal",
  conditionCount = 0,
} = {}) {
  const feature = getClassFeatureDefinition(featureId);
  const { sourceItem, profile } = await loadEnabledClassFeatureSource(sourceId, feature);
  return applyLayOnHandsResolved({
    feature,
    sourceItem,
    profile,
    targetIds,
    value,
    mode,
    conditionCount,
  });
}

export async function purifyClassFeatureSpell({
  sourceId,
  featureId = "paladino-tocco-purificatore",
  targetIds,
  spellInstanceId = "",
  spellName = "",
} = {}) {
  const feature = getClassFeatureDefinition(featureId);
  const { sourceItem, profile } = await loadEnabledClassFeatureSource(sourceId, feature);
  const resolvedTargetIds = await resolveTargetIds(
    sourceItem.id,
    feature,
    targetIds,
    profile.characterBuild,
  );
  const [targetId] = resolvedTargetIds;
  const [targetItem] = await OBR.scene.items.getItems([targetId]);
  const requestedInstanceId = String(spellInstanceId || "").trim();
  const requestedName = String(spellName || "").trim().toLocaleLowerCase();
  const activeSpells = getSpellsFromItem(targetItem).filter((spell) =>
    spell?.castContext?.staticZoneOwner !== true
  );
  const spell = activeSpells.find((entry) =>
    requestedInstanceId
      && String(entry?.instanceId || "").trim() === requestedInstanceId
  ) || activeSpells.find((entry) =>
    requestedName
      && String(entry?.name || "").trim().toLocaleLowerCase() === requestedName
  );
  const instanceId = String(spell?.instanceId || "").trim();
  if (!spell || !instanceId) throw classFeatureError("target-spell-required");

  const operations = [];
  if (spell.conc === true && spell.casterId) {
    operations.push({
      type: "concentration:break-targets",
      casterIds: [spell.casterId],
      reference: instanceId,
      targetIds: [targetId],
    });
  }
  operations.push({
    type: "spell:remove-instance",
    targetIds: [targetId],
    instanceId,
  });
  const mutationPlan = await prepareEffectsMutation(operations);
  if (!mutationPlan.changedIds?.length) throw classFeatureError("target-spell-required");
  const staticZoneCandidates = await getStaticSpellZoneItems({ instanceId });
  const staticZoneItems = staticSpellZoneItemsEndedByPlan(
    staticZoneCandidates,
    mutationPlan,
  );
  const changedIds = Array.from(new Set(mutationPlan.changedIds));
  await withItemMetaHistory({
    kind: "spell",
    label: `Tocco Purificatore: ${spell.name || "Incantesimo"}`,
    itemIds: changedIds,
    sceneItemIds: staticZoneItems.map((item) => item.id),
    fields: [SPELLS_META_KEY, CONC_META_KEY, "conditions"],
  }, () => commitWithStaticSpellZoneRemoval(
    staticZoneItems,
    () => commitEffectsMutationPlan(mutationPlan),
  ));
  await refreshConditionLabels(changedIds);
  return {
    feature,
    targetIds: resolvedTargetIds,
    spell,
    spellInstanceId: instanceId,
    changedIds,
  };
}

function conditionInstancesForMeta(meta) {
  return getConditionInstances(meta?.conditions || {});
}

function inspirationDieFaces(die) {
  const match = String(die || "").match(/d(\d+)/iu);
  const faces = Number(match?.[1]);
  return Number.isInteger(faces) && faces > 0 ? faces : null;
}

export function prepareUnsettlingWordsFeatureActivation({
  feature,
  characterBuild = [],
  value,
} = {}) {
  const pool = CLASS_FEATURE_RESOURCE_POOL_BY_ID.get(BARDIC_INSPIRATION_POOL_ID);
  const die = resolveClassFeatureResourceDie(pool, characterBuild);
  const faces = inspirationDieFaces(die);
  const normalizedValue = Number(value);
  if (!faces
    || !Number.isInteger(normalizedValue)
    || normalizedValue < 1
    || normalizedValue > faces) {
    throw classFeatureError("invalid-inspiration-die-value");
  }
  const basePlan = feature?.effectPlan && typeof feature.effectPlan === "object"
    ? feature.effectPlan
    : {};
  const detail = `Il bersaglio sottrae ${normalizedValue} al prossimo tiro salvezza prima dell'inizio del prossimo turno del Bardo. Il tiro e la sua riuscita restano manuali.`;
  return {
    choiceId: `value-${normalizedValue}`,
    value: normalizedValue,
    die,
    feature: {
      ...feature,
      effectPlan: {
        ...basePlan,
        conditionName: `Parole Inquietanti −${normalizedValue}`,
        detail,
        targetEffect: {
          ...(basePlan.targetEffect && typeof basePlan.targetEffect === "object"
            ? basePlan.targetEffect
            : {}),
          conditionName: `Parole Inquietanti −${normalizedValue}`,
          effectKind: "debuff",
          detail,
        },
      },
    },
  };
}

export function prepareDailyOrSlotFeatureActivation({
  feature,
  mode,
  slotConfirmed = false,
  modeRequiredReason = "daily-or-slot-mode-required",
  slotConfirmationRequiredReason = "slot-confirmation-required",
} = {}) {
  const normalizedMode = String(mode || "").trim().toLowerCase();
  if (normalizedMode !== "daily" && normalizedMode !== "slot") {
    throw classFeatureError(modeRequiredReason);
  }
  if (normalizedMode === "slot" && slotConfirmed !== true) {
    throw classFeatureError(slotConfirmationRequiredReason);
  }
  return {
    choiceId: normalizedMode,
    mode: normalizedMode,
    feature: {
      ...feature,
      resourceCosts: normalizedMode === "slot"
        ? []
        : Array.isArray(feature?.resourceCosts) ? [...feature.resourceCosts] : [],
    },
  };
}

export function prepareUniversalSpeechFeatureActivation({
  feature,
  mode,
  slotConfirmed = false,
} = {}) {
  return prepareDailyOrSlotFeatureActivation({
    feature,
    mode,
    slotConfirmed,
    modeRequiredReason: "universal-speech-mode-required",
  });
}

export function prepareTurnCreaturesFeatureActivation({
  feature,
  mode,
  modeRequiredReason = "turn-creatures-mode-required",
} = {}) {
  const normalizedMode = String(mode || "").trim().toLowerCase();
  if (normalizedMode !== "failed-targets" && normalizedMode !== "no-targets") {
    throw classFeatureError(modeRequiredReason);
  }
  if (normalizedMode === "failed-targets") {
    return {
      choiceId: normalizedMode,
      mode: normalizedMode,
      feature,
    };
  }
  return {
    choiceId: normalizedMode,
    mode: normalizedMode,
    feature: {
      ...feature,
      targeting: {
        mode: "self",
        maxTargets: 1,
        excludeSource: false,
      },
      trackingMode: "instant",
      effectPlan: { kind: "none" },
    },
  };
}

export function prepareTurnUndeadFeatureActivation({
  feature,
  mode,
} = {}) {
  return prepareTurnCreaturesFeatureActivation({
    feature,
    mode,
    modeRequiredReason: "turn-undead-mode-required",
  });
}

function eloquenceInfallibleEnabled(profile) {
  const build = Array.isArray(profile?.characterBuild)
    ? profile.characterBuild
    : [];
  const bardo = build.find((entry) => (
    String(entry?.classId || "").trim() === "bardo"
    && String(entry?.subclassId || "").trim() === ELOQUENCE_SUBCLASS_ID
    && Number(entry?.level) >= 6
  ));
  if (!bardo) return false;
  return getEnabledClassFeatures(profile)
    .some((entry) => entry.id === ELOQUENCE_INFALLIBLE_FEATURE_ID);
}

function featureWithEloquenceInfallibleReminder(feature, profile) {
  if (![
    BARDIC_INSPIRATION_FEATURE_ID,
    "bardo-collegio-dell-eloquenza-ispirazione-contagiosa",
  ].includes(String(feature?.id || "").trim())) {
    return feature;
  }
  if (!eloquenceInfallibleEnabled(profile)) return feature;
  const basePlan = feature?.effectPlan && typeof feature.effectPlan === "object"
    ? feature.effectPlan
    : {};
  const reminder = "Se il tiro fallisce, conserva il dado; rimuovi la pill soltanto quando il dado è consumato con successo o scade.";
  const baseDetail = String(basePlan.detail || feature?.name || "").trim();
  if (baseDetail.includes(reminder)) return feature;
  return {
    ...feature,
    effectPlan: {
      ...basePlan,
      detail: `Ispirazione Bardica d6/d8/d10/d12: usa dopo il d20 e prima dell'esito su prova, attacco o TS. ${reminder}`,
    },
  };
}

async function preflightBardicInspirationTarget(feature, targetIds, characterBuild = []) {
  const maximum = Number(feature?.stacking?.sameEffectMaxInstancesPerTarget);
  if (!Number.isInteger(maximum) || maximum < 1) return;
  const projection = classFeatureEffectProjection(feature, "", characterBuild);
  const effectId = String(projection.conditionEffectId || feature?.id || "").trim();
  if (!effectId) return;
  const targets = await OBR.scene.items.getItems(targetIds);
  const alreadyInspired = targets.some((target) =>
    getConditionInstances(target?.metadata?.[META_KEY]?.conditions || {})
      .filter((instance) => (
        instance?.active !== false
        && String(instance?.effectId || "").trim() === effectId
      )).length >= maximum
  );
  if (alreadyInspired) throw classFeatureError("target-effect-already-active");
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

function applyBerserkerFrenzyExhaustion(meta, sourceId, frenzyInstanceId) {
  const instanceId = String(frenzyInstanceId || "").trim();
  const targetId = String(sourceId || "").trim();
  if (!instanceId || !targetId) return false;
  const conditionId = `class-feature:${instanceId}:indebolimento`;
  const current = conditionInstancesForMeta(meta);
  if (current.some((entry) => String(entry?.id || "") === conditionId)) return false;
  setConditionInstances(meta, [
    ...current,
    {
      id: conditionId,
      condition: EXHAUSTION_CONDITION,
      active: true,
      level: 1,
      targetId,
      expiry: { mode: "manual" },
      type: "class-feature-exhaustion",
      sourceId: targetId,
      parentFeatureId: BERSERKER_FRENZY_FEATURE_ID,
      exhaustionContribution: true,
      createdAt: Date.now(),
    },
  ]);
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

async function createSorcerySlot({ sourceId, feature, slotLevel } = {}) {
  const { sourceItem, profile } = await loadEnabledClassFeatureSource(sourceId, feature);
  const level = Number(slotLevel);
  const costAmount = classFeatureSpellSlotCreationCost(feature, level);
  if (!costAmount) throw classFeatureError("spell-slot-level-invalid");
  const poolId = feature.resourceCosts?.[0]?.poolId;
  if (!poolId) throw classFeatureError("resource-pool-missing");
  const turnState = await currentTurnState();
  const instanceId = createInstanceId();
  const reminderFeature = {
    ...feature,
    trackingMode: "active",
    duration: { rounds: null },
  };
  let activation = null;
  await withItemMetaHistory({
    kind: "class-feature",
    label: `Slot temporaneo di livello ${level}`,
    itemIds: [sourceItem.id],
    fields: [CLASS_FEATURE_STATE_FIELD],
  }, () => OBR.scene.items.updateItems([sourceItem.id], (drafts) => {
    const draft = drafts[0];
    if (!draft) return;
    const meta = { ...(draft.metadata?.[META_KEY] || {}) };
    activation = planClassFeatureActivation({
      state: meta[CLASS_FEATURE_STATE_FIELD],
      feature: reminderFeature,
      poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
      characterBuild: profile.characterBuild,
      sourceId: sourceItem.id,
      targetIds: [sourceItem.id],
      currentRound: turnState.round,
      currentTurnKey: turnState.turnKey,
      instanceId,
      choiceId: `slot-${level}`,
      resourceValues: { [poolId]: costAmount },
      enabledFeatureIds: getEnabledClassFeatures(profile).map((entry) => entry.id),
    });
    if (!activation.ok) return;
    meta[CLASS_FEATURE_STATE_FIELD] = activation.state;
    draft.metadata = { ...(draft.metadata || {}), [META_KEY]: meta };
  }));
  if (!activation?.ok) {
    throw classFeatureError(activation?.reason || "invalid-activation", activation?.poolId);
  }
  return {
    feature,
    instance: activation.instance,
    state: activation.state,
    slotLevel: level,
    resourceSpent: costAmount,
  };
}

export async function createClassFeatureSpellSlot({
  sourceId,
  featureId = "stregone-fonte-di-magia",
  slotLevel,
} = {}) {
  const feature = getClassFeatureDefinition(featureId);
  return createSorcerySlot({ sourceId, feature, slotLevel });
}

export async function convertClassFeatureSpellSlot({
  sourceId,
  featureId = "stregone-fonte-di-magia",
  slotLevel,
} = {}) {
  const feature = getClassFeatureDefinition(featureId);
  const { sourceItem, profile } = await loadEnabledClassFeatureSource(sourceId, feature);
  const level = Number(slotLevel);
  if (!Number.isInteger(level) || level < 1 || level > 9) {
    throw classFeatureError("spell-slot-level-invalid");
  }
  const poolId = feature.resourceCosts?.[0]?.poolId;
  const pool = getClassFeatureResourcePool(poolId);
  if (!pool) throw classFeatureError("resource-pool-missing", poolId);
  let result = null;
  await withItemMetaHistory({
    kind: "class-feature",
    label: `Slot di livello ${level} convertito in punti stregoneria`,
    itemIds: [sourceItem.id],
    fields: [CLASS_FEATURE_STATE_FIELD],
  }, () => OBR.scene.items.updateItems([sourceItem.id], (drafts) => {
    const draft = drafts[0];
    if (!draft) return;
    const meta = { ...(draft.metadata?.[META_KEY] || {}) };
    result = planClassFeatureResourceAdjustment(
      meta[CLASS_FEATURE_STATE_FIELD],
      pool,
      profile.characterBuild,
      { delta: level },
    );
    if (!result.changed) return;
    meta[CLASS_FEATURE_STATE_FIELD] = result.state;
    draft.metadata = { ...(draft.metadata || {}), [META_KEY]: meta };
  }));
  return {
    feature,
    ...(result || {
      changed: false,
      state: getClassFeatureState(sourceItem),
    }),
    slotLevel: level,
    pointsRecovered: level,
  };
}

export async function applySorcerousRestoration({
  sourceId,
  featureId = "stregone-ripristino-stregonesco",
} = {}) {
  const feature = getClassFeatureDefinition(featureId);
  const { sourceItem, profile } = await loadEnabledClassFeatureSource(sourceId, feature);
  const pool = getClassFeatureResourcePool("stregone-punti-stregoneria");
  if (!pool) throw classFeatureError("resource-pool-missing", "stregone-punti-stregoneria");
  let result = null;
  await withItemMetaHistory({
    kind: "class-feature",
    label: "Ripristino Stregonesco: +4 punti",
    itemIds: [sourceItem.id],
    fields: [CLASS_FEATURE_STATE_FIELD],
  }, () => OBR.scene.items.updateItems([sourceItem.id], (drafts) => {
    const draft = drafts[0];
    if (!draft) return;
    const meta = { ...(draft.metadata?.[META_KEY] || {}) };
    result = planClassFeatureSpecialRefresh(
      meta[CLASS_FEATURE_STATE_FIELD],
      pool,
      profile.characterBuild,
      { event: "riposo_breve" },
    );
    if (!result.changed) return;
    meta[CLASS_FEATURE_STATE_FIELD] = result.state;
    draft.metadata = { ...(draft.metadata || {}), [META_KEY]: meta };
  }));
  if (!result?.refresh) throw classFeatureError("special-refresh-unavailable");
  return { feature, ...result };
}

export async function restoreWildMagicTidesOfChaos(sourceId) {
  return adjustClassFeatureResource(
    sourceId,
    "stregone-magia-selvaggia-onde-di-caos-usi",
    { delta: 1 },
  );
}

export function prepareSpellThiefFeatureActivation({
  feature,
  spellId = "",
  spellName = "",
  mode = "",
  spellLevelConfirmed = false,
} = {}) {
  const normalizedMode = String(mode || "").trim().toLowerCase();
  if (normalizedMode !== "deny" && normalizedMode !== "steal") {
    throw classFeatureError("spell-mode-required");
  }
  const spell = getSpellDefinition(spellId || spellName);
  if (!spell) throw classFeatureError("spell-required");
  if (normalizedMode === "steal" && Number(spell.level) < 1) {
    throw classFeatureError("spell-cantrip-invalid");
  }
  if (normalizedMode === "steal" && spellLevelConfirmed !== true) {
    throw classFeatureError("spell-level-confirmation-required");
  }
  const spellLabel = spell.catalogLabel || spell.displayName || spell.name || spell.id;
  return {
    choiceId: spell.id,
    mode: normalizedMode,
    spell,
    feature: {
      ...feature,
      trackingMode: normalizedMode === "steal" ? "active" : "instant",
      effectPlan: normalizedMode === "steal"
        ? {
          kind: "condition",
          conditionName: `Incantesimo rubato: ${spellLabel}`,
          detail: `Il Ladro ha rubato ${spellLabel} per 8 ore. Il marker è un reminder: non blocca il lancio del bersaglio e non aggiunge lo spell all'inventario del Ladro.`,
        }
        : { kind: "none" },
    },
  };
}

export async function activateClassFeature({
  sourceId,
  featureId,
  targetIds,
  choiceId,
  autoChoiceIds = {},
  suppressAutoActivation = false,
  value,
  mode = "heal",
  slotConfirmed = false,
  conditionCount = 0,
  spellInstanceId = "",
  spellName = "",
  spellId = "",
  spellMode = "",
  spellLevelConfirmed = false,
  resourceValues = {},
  featureOverride = null,
} = {}) {
  const feature = featureOverride || getClassFeatureDefinition(featureId);
  if (!featureOverride && feature?.runtimeSupport?.adapter === "spell-thief") {
    const prepared = prepareSpellThiefFeatureActivation({
      feature,
      spellId,
      spellName,
      mode: spellMode,
      spellLevelConfirmed,
    });
    const result = await activateClassFeature({
      sourceId,
      featureId,
      targetIds,
      choiceId: prepared.choiceId,
      autoChoiceIds,
      suppressAutoActivation,
      resourceValues,
      featureOverride: prepared.feature,
    });
    return {
      ...result,
      spell: prepared.spell,
      spellMode: prepared.mode,
    };
  }
  const { sourceItem, profile } = await loadEnabledClassFeatureSource(sourceId, feature);
  const adapter = String(feature?.runtimeSupport?.adapter || "").trim();
  if (adapter === "lay-on-hands") {
    return applyLayOnHandsResolved({
      feature,
      sourceItem,
      profile,
      targetIds,
      value,
      mode,
      conditionCount,
    });
  }
  if (adapter === "purifying-touch") {
    return purifyClassFeatureSpell({
      sourceId: sourceItem.id,
      featureId: feature.id,
      targetIds,
      spellInstanceId,
      spellName,
    });
  }
  if (!featureOverride && adapter === "unsettling-words") {
    const prepared = prepareUnsettlingWordsFeatureActivation({
      feature,
      characterBuild: profile.characterBuild,
      value,
    });
    const result = await activateClassFeature({
      sourceId: sourceItem.id,
      featureId: feature.id,
      targetIds,
      choiceId: prepared.choiceId,
      autoChoiceIds,
      suppressAutoActivation,
      resourceValues,
      featureOverride: prepared.feature,
    });
    return {
      ...result,
      manualValue: prepared.value,
      inspirationDie: prepared.die,
    };
  }
  if (!featureOverride && adapter === "universal-speech") {
    const prepared = prepareUniversalSpeechFeatureActivation({
      feature,
      mode,
      slotConfirmed,
    });
    const result = await activateClassFeature({
      sourceId: sourceItem.id,
      featureId: feature.id,
      targetIds,
      choiceId: prepared.choiceId,
      autoChoiceIds,
      suppressAutoActivation,
      resourceValues,
      featureOverride: prepared.feature,
    });
    return {
      ...result,
      paymentMode: prepared.mode,
    };
  }
  if (!featureOverride && adapter === "night-eyes") {
    const prepared = prepareDailyOrSlotFeatureActivation({
      feature,
      mode,
      slotConfirmed,
      modeRequiredReason: "night-eyes-mode-required",
      slotConfirmationRequiredReason: "night-eyes-slot-confirmation-required",
    });
    const result = await activateClassFeature({
      sourceId: sourceItem.id,
      featureId: feature.id,
      targetIds,
      choiceId: prepared.choiceId,
      autoChoiceIds,
      suppressAutoActivation,
      resourceValues,
      featureOverride: prepared.feature,
    });
    return {
      ...result,
      paymentMode: prepared.mode,
    };
  }
  if (!featureOverride && (adapter === "turn-undead" || adapter === "turn-creatures")) {
    const prepared = adapter === "turn-undead"
      ? prepareTurnUndeadFeatureActivation({
        feature,
        mode,
      })
      : prepareTurnCreaturesFeatureActivation({
        feature,
        mode,
      });
    const result = await activateClassFeature({
      sourceId: sourceItem.id,
      featureId: feature.id,
      targetIds,
      choiceId: prepared.choiceId,
      autoChoiceIds,
      suppressAutoActivation,
      resourceValues,
      featureOverride: prepared.feature,
    });
    return {
      ...result,
      targetMode: prepared.mode,
    };
  }

  const prerequisiteResults = [];
  const autoActivateParentFeatureId = classFeatureAutoActivateParentFeatureId(feature);
  if (autoActivateParentFeatureId) {
    const turnState = await currentTurnState();
    const currentState = getClassFeatureState(sourceItem);
    const active = activeClassFeatureInstances(currentState, turnState.round);
    const alreadyActive = active.some((entry) => entry.featureId === feature.id);
    const parentActive = active.some((entry) => entry.featureId === autoActivateParentFeatureId);
    if (!alreadyActive && !parentActive) {
      prerequisiteResults.push(await activateClassFeature({
        sourceId: sourceItem.id,
        featureId: autoActivateParentFeatureId,
        suppressAutoActivation,
      }));
    }
  }

  const resolvedTargetIds = await resolveTargetIds(
    sourceItem.id,
    feature,
    targetIds,
    profile.characterBuild,
  );
  if (adapter === "bardic-inspiration") {
    await preflightBardicInspirationTarget(
      feature,
      resolvedTargetIds,
      profile.characterBuild,
    );
  }
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
      resourceValues,
      enabledFeatureIds: getEnabledClassFeatures(profile).map((entry) => entry.id),
    });
    if (!activation.ok) return;
    meta[CLASS_FEATURE_STATE_FIELD] = activation.state;
    sourceDraft.metadata = { ...(sourceDraft.metadata || {}), [META_KEY]: meta };

    const conditionFeature = adapter === "bardic-inspiration"
      ? featureWithEloquenceInfallibleReminder(feature, profile)
      : feature;
    const additions = classFeatureConditionInstancesForActivation(
      conditionFeature,
      activation.instance,
      sourceItem.name,
      profile.characterBuild,
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
  const autoResults = [...prerequisiteResults];
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
  const endedFrenzyEntries = removedEntries.filter((entry) =>
    String(entry?.featureId || "") === BERSERKER_FRENZY_FEATURE_ID
  );
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
      for (const entry of endedFrenzyEntries) {
        applyBerserkerFrenzyExhaustion(meta, sourceId, entry.instanceId);
      }
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
    const previousUpdate = updates.get(source.id);
    const state = previousUpdate?.nextState || getClassFeatureState(source);
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
    const removeSingleTarget = feature?.targetRemovalMode === "single"
      && projection.kind !== "aura"
      && !sourceConditionRemoved;
    let nextInstances;
    if (removeSingleTarget) {
      const removedTargetIds = new Set(Array.from(entry.targetIds).map((id) => String(id)));
      const remainingTargetIds = (Array.isArray(active.targetIds) ? active.targetIds : [])
        .filter((id) => !removedTargetIds.has(String(id)));
      if (!remainingTargetIds.length) {
        nextInstances = planClassFeatureDeactivation(state, entry.parentEffectId).state.instances;
      } else {
        nextInstances = state.instances.map((value) => value.instanceId !== entry.parentEffectId
          ? value
          : {
            ...value,
            targetIds: remainingTargetIds,
            suppressedTargetIds: (value.suppressedTargetIds || [])
              .filter((id) => remainingTargetIds.includes(id)),
          }
        );
      }
    } else {
      const removeWhole = projection.kind !== "aura"
        || targeting.mode === "self"
        || targeting.mode === "single-target"
        || !areaTargetOnly;
      nextInstances = removeWhole
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
    }
    if (JSON.stringify(nextInstances) === JSON.stringify(state.instances)) continue;
    const removedFrenzyInstanceIds = new Set(previousUpdate?.removedFrenzyInstanceIds || []);
    const nextInstanceIds = new Set(nextInstances.map((value) => value.instanceId));
    for (const value of state.instances) {
      if (
        value.featureId === BERSERKER_FRENZY_FEATURE_ID
        && !nextInstanceIds.has(value.instanceId)
      ) {
        removedFrenzyInstanceIds.add(value.instanceId);
      }
    }
    updates.set(source.id, {
      nextState: { ...state, instances: nextInstances },
      removedFrenzyInstanceIds: [...removedFrenzyInstanceIds],
    });
  }

  if (!updates.size) return [];
  const ids = [...updates.keys()];
  const changed = [];
  await withItemMetaHistory({
    kind: "class-feature",
    label: "Terminata capacità dopo rimozione effetto",
    itemIds: ids,
    fields: [CLASS_FEATURE_STATE_FIELD, "conditions"],
    inline,
  }, () => OBR.scene.items.updateItems(ids, (drafts) => {
    for (const draft of drafts) {
      const update = updates.get(draft.id);
      if (!update) continue;
      const meta = { ...(draft.metadata?.[META_KEY] || {}) };
      meta[CLASS_FEATURE_STATE_FIELD] = update.nextState;
      for (const instanceId of update.removedFrenzyInstanceIds || []) {
        applyBerserkerFrenzyExhaustion(meta, draft.id, instanceId);
      }
      draft.metadata = { ...(draft.metadata || {}), [META_KEY]: meta };
      changed.push(draft.id);
    }
  }));
  await refreshConditionLabels(ids);
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
    for (const poolId of Array.isArray(feature.trackedResourcePoolIds)
      ? feature.trackedResourcePoolIds
      : []) {
      if (poolId) poolIds.add(String(poolId));
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
