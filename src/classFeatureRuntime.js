import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import {
  gridFootprintSize,
  gridGeometryFromBounds,
} from "./distance3dCore.js";
import { calculateQuickHPChange, QUICK_HP_MODES } from "./quickHpCore.js";
import { getInitiativeCard } from "./initiativeCards.js";
import { getConditionInstances, refreshConditionLabels } from "./conditions.js";
import { EXHAUSTION_CONDITION } from "./exhaustionCore.js";
import { getSpellsFromItem } from "./spells.js";
import { getSpellDefinition } from "./spells-srd.js";
import {
  requireAppliedEffectsMutation,
  runEffectsMutation,
} from "./effectsMutations.js";
import { spellAreaGridCells } from "./spellAreaPlacementCore.js";
import { currentInitiativeTurnKey } from "./turnBoundaryCore.js";
import { currentSceneEpoch, isCurrentSceneEpoch } from "./sceneEpoch.js";
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
  classFeatureResourceRefreshEvents,
  classFeatureResourceEntries,
  normalizeClassFeatureState,
  planClassFeatureActivation,
  planClassFeatureDeactivation,
} from "./classFeatureCore.js";
import {
  CLASS_FEATURE_RESOURCE_POOL_BY_ID,
  getClassFeatureDefinition,
  getAvailableClassFeatures,
  getEnabledClassFeatures,
  getSpeciesFeatures,
  getClassFeatureResourcePool,
} from "./classFeatureCatalog.js";
import { emitMatchedClassFeatureVisual } from "./embersMatchedVisualRenderer.js";
import { spellSlotPoolId, spellSlotStatus } from "./spellSlotCore.js";
import { quickActionUsesPool } from "./quickActionsCore.js";
import { getHistoryEntries } from "./history.js";
import { planSpeciesHpTrait, SPECIES_HP_TRAIT_KINDS, speciesHpTraitAmount, speciesLastDamageTaken } from "./speciesHpTraitCore.js";
import { isReactionClassFeature, planReactionSpend } from "./reactionTrackerCore.js";

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

function metadataFieldExpectation(meta, field) {
  return Object.prototype.hasOwnProperty.call(meta || {}, field)
    ? { present: true, value: structuredClone(meta[field]) }
    : { present: false };
}

function classFeatureStateOperationId(kind = "state") {
  return `${createInstanceId()}:${String(kind || "state")}`;
}

function classFeatureMutationResult(mutation, operationId) {
  const results = mutation?.classFeatureMutationResults
    || mutation?.plan?.classFeatureMutationResults
    || [];
  const entry = results.find((candidate) => candidate?.operationId === operationId) || null;
  if (!entry) return null;
  const {
    operationId: _operationId,
    type: _type,
    sourceId: _sourceId,
    ...result
  } = entry;
  return result;
}

function requireClassFeatureStateMutation(mutation, operationId) {
  const conflict = (Array.isArray(mutation?.conflicts) ? mutation.conflicts : [])
    .find((entry) => !operationId || entry?.operationId === operationId);
  if (conflict?.reason) throw classFeatureError(conflict.reason, conflict.poolId);
  requireAppliedEffectsMutation(mutation);
  const result = classFeatureMutationResult(mutation, operationId);
  if (!result) throw classFeatureError("invalid-activation");
  return result;
}

function classFeatureMutationPools(feature) {
  const poolIds = new Set((Array.isArray(feature?.resourceCosts) ? feature.resourceCosts : [])
    .map((entry) => String(entry?.poolId || "").trim())
    .filter(Boolean));
  return [...poolIds]
    .map((poolId) => getClassFeatureResourcePool(poolId))
    .filter(Boolean);
}

function classFeatureError(reason, poolId = "") {
  if (reason === "feature-not-found") return new Error("Capacità non trovata.");
  if (reason === "feature-not-automated") {
    return new Error("Questa capacità è nel catalogo, ma non è ancora automatizzata.");
  }
  if (reason === "feature-not-enabled") {
    return new Error("Questa capacità non è abilitata per il personaggio.");
  }
  if (reason === "parent-feature-required") {
    return new Error("Questa capacità richiede prima l'attivazione della capacità collegata.");
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
  if (reason === "spell-slot-unavailable") {
    return new Error("Nessuno slot di quel livello disponibile da convertire.");
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
    state,
  };
}

// A feature used with a reaction spends the actor's reaction ("Reazione usata", reactionTrackerCore.js) in the
// feature's own command, so one Undo gives both back; in combat only, and never twice.
function classFeatureReactionSpend(feature, sourceItem, initiativeState, applies = true) {
  return planReactionSpend({
    applies: applies && isReactionClassFeature(feature),
    casterId: sourceItem?.id,
    casterName: sourceItem?.name,
    conditions: sourceItem?.metadata?.[META_KEY]?.conditions,
    initiativeState,
  });
}
const reactionResult = (reaction) => (reaction.applies ? { reaction: { spent: !reaction.alreadyUsed, alreadyUsed: reaction.alreadyUsed } } : {});

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
  const enabledFeatureIds = getEnabledClassFeatures(profile).map((entry) => entry.id);
  const activationInput = {
    feature,
    characterBuild: profile.characterBuild,
    abilityModifiers: profile.abilityModifiers,
    sourceId: sourceItem.id,
    targetIds: resolvedTargetIds,
    currentRound: turnState.round,
    currentTurnKey: turnState.turnKey,
    instanceId,
    resourceValues: { [cost.poolId]: costAmount },
    enabledFeatureIds,
  };
  const currentItems = await OBR.scene.items.getItems(itemIds);
  const currentById = new Map(currentItems.map((item) => [item.id, item]));
  const currentSourceItem = currentById.get(sourceItem.id);
  const targetItem = currentById.get(targetId);
  if (!currentSourceItem || !targetItem) throw classFeatureError("target-required");
  const preflightActivation = planClassFeatureActivation({
    ...activationInput,
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    state: currentSourceItem.metadata?.[META_KEY]?.[CLASS_FEATURE_STATE_FIELD],
  });
  if (!preflightActivation.ok) {
    throw classFeatureError(preflightActivation.reason || "invalid-activation", preflightActivation.poolId);
  }
  let hpChange = null;
  const metadataPatches = [];
  if (normalizedMode === "heal") {
    const targetMeta = targetItem.metadata?.[META_KEY] || {};
    const hp = Number(targetMeta.hp);
    const hpMax = Number(targetMeta.hpMax);
    if (!Number.isFinite(hp) || !Number.isFinite(hpMax) || hpMax <= 0) {
      throw classFeatureError("hp-invalid");
    }
    hpChange = calculateQuickHPChange({
      mode: QUICK_HP_MODES.HEAL,
      value: requestedValue,
      hp,
      hpMax,
    });
    if (hpChange.changed) {
      metadataPatches.push({
        id: targetId,
        fields: {
          hp: {
            mode: "set",
            value: hpChange.afterHP,
            expected: metadataFieldExpectation(targetMeta, "hp"),
          },
          hpMax: {
            mode: "assert",
            expected: metadataFieldExpectation(targetMeta, "hpMax"),
          },
        },
      });
    }
  }
  const operationId = classFeatureStateOperationId("lay-on-hands");
  const mutation = await runEffectsMutation([{
    type: "class-feature:activate-state",
    operationId,
    ...activationInput,
    pools: classFeatureMutationPools(feature),
  }], {
    kind: "class-feature",
    label: `Capacità: ${feature.name}`,
    targetIds: itemIds,
    metadataPatches,
  });
  const activation = requireClassFeatureStateMutation(mutation, operationId);
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

// A species trait's option (Fey Gift, speciesTraitCore.js): the raw option, with what the card's choice list leaves out.
function speciesChoiceOption(feature, choiceId) {
  if (!feature?.speciesId || !choiceId) return null;
  return (Array.isArray(feature.choiceOptions) ? feature.choiceOptions : []).find((option) => option?.id === choiceId) || null;
}

// Fey Gift's Passage: the hobgoblin gets the pill too, without being selected.
function speciesChoiceTargetIds(feature, choiceId, sourceId, targetIds) {
  return speciesChoiceOption(feature, choiceId)?.includeSource && !targetIds.includes(sourceId) ? [...targetIds, sourceId] : targetIds;
}

// Fey Gift's Hospitality: the hobgoblin and the creature helped each gain the proficiency bonus + the d6 rolled at
// the table (value) in temporary hit points.
function speciesChoiceTemporaryHp(feature, profile, choiceId, sourceItem, targetIds, value) {
  const spec = speciesChoiceOption(feature, choiceId)?.temporaryHp;
  if (!spec) return [];
  const base = speciesHpTraitAmount(spec.amount, profile);
  if (base === null) throw new Error(`${feature.name}: manca il livello del personaggio sulla scheda.`);
  const faces = Number(String(spec.bonusDie || "").match(/d(\d+)/u)?.[1]) || 0;
  const roll = faces ? Number(value) : 0;
  if (faces && (!Number.isInteger(roll) || roll < 1 || roll > faces)) throw new Error(`${feature.name}: inserisci il ${spec.bonusDie} tirato (1–${faces}).`);
  const amount = base + roll;
  return [...new Set([sourceItem.id, ...targetIds])].map((targetId) => ({ targetId, amount }));
}

function speciesShiftTemporaryHp(feature, profile, sourceItem, value) {
  if (feature?.hpTrait?.kind !== SPECIES_HP_TRAIT_KINDS.SHIFT) return [];
  const plan = planSpeciesHpTrait({
    feature,
    card: profile,
    targetMeta: sourceItem.metadata?.[META_KEY] || {},
    targetName: sourceItem.name,
    value,
  });
  if (!plan.ok) throw new Error(plan.blocker);
  return [{ targetId: sourceItem.id, amount: plan.amount }];
}

// The kind of the HP command of a species trait: an HP event of the combat log (combatLogCore.js).
export const SPECIES_HP_TRAIT_HISTORY_KIND = "hp-species-trait";

// The use of a trait: its pool before and after, for the combat log.
function speciesTraitSpent(feature, profile, beforeState, afterState) {
  const entries = (state) => classFeatureResourceEntries(state, [feature], CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    profile.characterBuild, profile.abilityModifiers);
  const after = entries(afterState);
  return entries(beforeState).map((entry) => {
    const left = after.find((row) => row.pool.id === entry.pool.id)?.current;
    return { poolId: entry.pool.id, name: entry.pool.name, amount: 1, ...(entry.current !== null ? { before: entry.current } : {}),
      ...(left !== null && left !== undefined ? { after: left } : {}) };
  });
}

// A species trait that changes hit points (speciesHpTraitCore.js): Relentless Endurance, Healing Hands, Adrenaline
// Rush, Hungry Jaws, Stone's Endurance and Hadozee Dodge. One command writes the HP through hp:set (death saves,
// Unconscious, shared HP) and spends the trait's use, so one Undo restores both. Stone's Endurance and Hadozee Dodge
// give back the damage just taken, read from the history when nothing changed the HP since (else entered by the GM).
// Shifting gives its temporary hit points with its pill, in activateClassFeature.
async function applySpeciesHpTraitResolved({
  feature,
  sourceItem,
  profile,
  targetIds,
  value = "",
  damage = "",
  hit = true,
  sceneEpoch = null,
} = {}) {
  const originEpoch = Number.isInteger(sceneEpoch) ? sceneEpoch : currentSceneEpoch();
  const spec = feature?.hpTrait;
  if (!spec || spec.kind === SPECIES_HP_TRAIT_KINDS.SHIFT) throw classFeatureError("invalid-activation");
  const resolvedTargetIds = spec.kind === SPECIES_HP_TRAIT_KINDS.HEAL
    ? await resolveTargetIds(sourceItem.id, feature, targetIds, profile.characterBuild)
    : [sourceItem.id];
  const [targetId] = resolvedTargetIds;
  const itemIds = Array.from(new Set([sourceItem.id, targetId]));
  const currentItems = await OBR.scene.items.getItems(itemIds);
  const currentById = new Map(currentItems.map((entry) => [entry.id, entry]));
  const currentSource = currentById.get(sourceItem.id);
  const targetItem = currentById.get(targetId);
  if (!currentSource || !targetItem) throw classFeatureError("target-required");
  const sourceMeta = currentSource.metadata?.[META_KEY] || {};
  const targetMeta = targetItem.metadata?.[META_KEY] || {};
  const lastDamage = spec.kind === SPECIES_HP_TRAIT_KINDS.REDUCE
    ? speciesLastDamageTaken(await getHistoryEntries().catch(() => []), targetId, Number(targetMeta.hp))
    : null;
  if (spec.kind === SPECIES_HP_TRAIT_KINDS.REDUCE && !lastDamage && Number(targetMeta.hp) <= 0) {
    throw new Error(`${feature.name}: a 0 PF, senza gli ultimi danni nella cronologia, correggi i PF a mano.`);
  }
  const plan = planSpeciesHpTrait({
    feature,
    card: profile,
    targetMeta,
    targetName: targetItem.name,
    value,
    damage: lastDamage ? lastDamage.amount : damage,
    hit,
  });
  if (!plan.ok) throw new Error(plan.blocker);
  const turnState = await currentTurnState();
  const instanceId = createInstanceId();
  const beforeState = sourceMeta[CLASS_FEATURE_STATE_FIELD];
  const activation = planClassFeatureActivation({
    state: beforeState,
    feature,
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: profile.characterBuild,
    abilityModifiers: profile.abilityModifiers,
    sourceId: sourceItem.id,
    targetIds: resolvedTargetIds,
    currentRound: turnState.round,
    currentTurnKey: turnState.turnKey,
    instanceId,
    enabledFeatureIds: getEnabledClassFeatures(profile).map((entry) => entry.id),
  });
  if (!activation.ok) {
    throw classFeatureError(activation.reason || "invalid-activation", activation.poolId);
  }
  const sourceName = String(currentSource.name || "Personaggio").trim() || "Personaggio";
  const targetName = String(targetItem.name || "Bersaglio").trim() || "Bersaglio";
  const label = `${sourceName}: ${feature.name}${targetId !== sourceItem.id ? ` → ${targetName}` : ""}`;
  const change = plan.change;
  const hpChanged = !!change?.changed;
  const speciesTrait = {
    featureId: feature.id,
    name: feature.name,
    actor: { id: sourceItem.id, name: sourceName },
    target: { id: targetId, name: targetName },
    detail: plan.detail,
    ...(lastDamage ? { damageFrom: "history" } : {}),
    spent: speciesTraitSpent(feature, profile, beforeState, activation.state),
  };
  const kind = hpChanged ? SPECIES_HP_TRAIT_HISTORY_KIND : "class-feature";
  const reaction = classFeatureReactionSpend(feature, currentSource, turnState.state);
  const mutation = await runEffectsMutation(
    [...(hpChanged ? [{
      type: "hp:set",
      updates: [{
        itemId: targetId,
        hp: change.afterHP,
        hpMax: change.hpMax,
        hpIntent: { mode: plan.mode, amount: plan.amount, eventId: instanceId },
        expectedHP: metadataFieldExpectation(targetMeta, "hp"),
        expectedHPMax: metadataFieldExpectation(targetMeta, "hpMax"),
      }],
    }] : []), ...reaction.operations],
    {
      kind,
      label,
      targetIds: itemIds,
      sceneEpoch: originEpoch,
      metadataPatches: [{
        id: sourceItem.id,
        fields: {
          [CLASS_FEATURE_STATE_FIELD]: {
            mode: "set",
            value: activation.state,
            expected: metadataFieldExpectation(sourceMeta, CLASS_FEATURE_STATE_FIELD),
          },
        },
      }],
      history: { kind, label, payload: { speciesTrait } },
    },
  );
  requireAppliedEffectsMutation(mutation);
  await refreshConditionLabels(itemIds);
  return {
    feature,
    state: activation.state,
    targetIds: resolvedTargetIds,
    hpChange: change,
    detail: plan.detail,
    ...(plan.warning ? { warning: plan.warning } : {}),
    ...(lastDamage ? { lastDamage } : {}),
    ...reactionResult(reaction),
  };
}

export async function applySpeciesHpTrait({
  sourceId,
  featureId,
  targetIds,
  value = "",
  damage = "",
  hit = true,
  sceneEpoch = null,
} = {}) {
  const feature = getClassFeatureDefinition(featureId);
  const { sourceItem, profile } = await loadEnabledClassFeatureSource(sourceId, feature);
  return applySpeciesHpTraitResolved({ feature, sourceItem, profile, targetIds, value, damage, hit, sceneEpoch });
}

// The damage a reduction trait would give back now (read from the history), for the card's controls. Reads only.
export async function previewSpeciesHpTrait({ sourceId, featureId } = {}) {
  const feature = getClassFeatureDefinition(featureId);
  if (feature?.hpTrait?.kind !== SPECIES_HP_TRAIT_KINDS.REDUCE) return { lastDamage: null };
  const [sourceItem] = await OBR.scene.items.getItems([sourceId]);
  const hp = Number(sourceItem?.metadata?.[META_KEY]?.hp);
  return { lastDamage: speciesLastDamageTaken(await getHistoryEntries().catch(() => []), sourceId, Number.isFinite(hp) ? hp : null) };
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
  const requestedInstanceId = String(spellInstanceId || "").trim();
  const requestedName = String(spellName || "").trim().toLocaleLowerCase();

  const turnState = await currentTurnState();
  const instanceId = createInstanceId();
  const activationInput = {
    feature,
    characterBuild: profile.characterBuild,
    abilityModifiers: profile.abilityModifiers,
    sourceId: sourceItem.id,
    targetIds: resolvedTargetIds,
    currentRound: turnState.round,
    currentTurnKey: turnState.turnKey,
    instanceId,
    enabledFeatureIds: getEnabledClassFeatures(profile).map((entry) => entry.id),
  };
  const preflightActivation = planClassFeatureActivation({
    ...activationInput,
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    state: sourceItem.metadata?.[META_KEY]?.[CLASS_FEATURE_STATE_FIELD],
  });
  if (!preflightActivation.ok) {
    throw classFeatureError(
      preflightActivation.reason || "invalid-activation",
      preflightActivation.poolId,
    );
  }

  const operationId = classFeatureStateOperationId("purify-spell");
  const mutation = await runEffectsMutation([{
    type: "class-feature:activate-state",
    operationId,
    ...activationInput,
    pools: classFeatureMutationPools(feature),
  }, {
    type: "spell:remove-requested",
    targetIds: [targetId],
    instanceId: requestedInstanceId,
    name: requestedName,
  }], {
    kind: "spell",
    label: "Tocco Purificatore",
    targetIds: [targetId],
    requireChanges: true,
    sideEffects: [{ type: "static-zone:remove-ended", selectors: [{ all: true }] }],
  });
  const activation = requireClassFeatureStateMutation(mutation, operationId);
  if (!mutation.changedIds?.length) throw classFeatureError("target-spell-required");
  const targetChange = mutation.changes.find((change) => change.id === targetId);
  const remainingIds = new Set((targetChange?.after?.spells || []).map((entry) => entry?.instanceId));
  const spell = (targetChange?.before?.spells || []).find((entry) =>
    entry?.instanceId && !remainingIds.has(entry.instanceId)
  ) || null;
  const finalInstanceId = String(spell?.instanceId || requestedInstanceId).trim();
  const changedIds = Array.from(new Set(mutation.changedIds));
  await refreshConditionLabels(changedIds);
  return {
    feature,
    instance: activation.instance,
    state: activation.state,
    targetIds: resolvedTargetIds,
    spell,
    spellInstanceId: finalInstanceId,
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
  const reminder = "Se il tiro fallisce, conserva il dado; rimuovi l'etichetta soltanto quando il dado è consumato con successo o scade.";
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
  const label = `Concentrazione terminata: ${feature.name}`;
  const mutation = await runEffectsMutation([{
    type: "concentration:break",
    casterIds: [sourceId],
  }], {
    kind: "concentration",
    label,
    targetIds: [sourceId],
    sideEffects: [{
      type: "static-zone:remove-ended",
      selectors: [{ casterId: sourceId }],
    }],
  });
  requireAppliedEffectsMutation(mutation);
  const changedIds = Array.isArray(mutation?.changedIds)
    ? mutation.changedIds
    : [];
  if (!changedIds.length) return [];
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
  const operationId = classFeatureStateOperationId("create-spell-slot");
  const mutation = await runEffectsMutation([{
    type: "class-feature:activate-state",
    operationId,
    sourceId: sourceItem.id,
    feature: reminderFeature,
    pools: classFeatureMutationPools(reminderFeature),
    characterBuild: profile.characterBuild,
    abilityModifiers: profile.abilityModifiers,
    targetIds: [sourceItem.id],
    currentRound: turnState.round,
    currentTurnKey: turnState.turnKey,
    instanceId,
    choiceId: `slot-${level}`,
    resourceValues: { [poolId]: costAmount },
    enabledFeatureIds: getEnabledClassFeatures(profile).map((entry) => entry.id),
  },
  // The created slot joins the inventory, even above the maximum, until it is spent or the long rest.
  ...(getClassFeatureResourcePool(spellSlotPoolId(level)) ? [{
    type: "class-feature:adjust-resource",
    operationId: classFeatureStateOperationId("create-spell-slot-inventory"),
    sourceId: sourceItem.id,
    pool: getClassFeatureResourcePool(spellSlotPoolId(level)),
    characterBuild: profile.characterBuild,
    abilityModifiers: profile.abilityModifiers,
    adjustment: { delta: 1, allowAboveMaximum: true },
  }] : [])], {
    kind: "class-feature",
    label: `Slot temporaneo di livello ${level}`,
    targetIds: [sourceItem.id],
  });
  const activation = requireClassFeatureStateMutation(mutation, operationId);
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
  // The slot comes out of the inventory in the same command: a slot of that level, or a Pact Magic slot of
  // that level when none is left.
  const slots = spellSlotStatus(profile.characterBuild, getClassFeatureState(sourceItem).resources)
    .filter((row) => row.level === level && row.current > 0);
  const slot = slots.find((row) => !row.pact) || slots[0] || null;
  if (!slot) throw classFeatureError("spell-slot-unavailable");
  const operationId = classFeatureStateOperationId("convert-spell-slot");
  const mutation = await runEffectsMutation([{
    type: "class-feature:adjust-resource",
    operationId,
    sourceId: sourceItem.id,
    pool,
    characterBuild: profile.characterBuild,
    abilityModifiers: profile.abilityModifiers,
    adjustment: { delta: level },
  }, {
    type: "class-feature:adjust-resource",
    operationId: classFeatureStateOperationId("convert-spell-slot-inventory"),
    sourceId: sourceItem.id,
    pool: getClassFeatureResourcePool(slot.poolId),
    characterBuild: profile.characterBuild,
    abilityModifiers: profile.abilityModifiers,
    adjustment: { delta: -1 },
  }], {
    kind: "class-feature",
    label: `Slot di livello ${level} convertito in punti stregoneria`,
    targetIds: [sourceItem.id],
  });
  const result = requireClassFeatureStateMutation(mutation, operationId);
  return {
    feature,
    ...result,
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
  const operationId = classFeatureStateOperationId("sorcerous-restoration");
  const mutation = await runEffectsMutation([{
    type: "class-feature:special-refresh",
    operationId,
    sourceId: sourceItem.id,
    pool,
    characterBuild: profile.characterBuild,
    abilityModifiers: profile.abilityModifiers,
    event: "riposo_breve",
  }], {
    kind: "class-feature",
    label: "Ripristino Stregonesco: +4 punti",
    targetIds: [sourceItem.id],
  });
  const result = requireClassFeatureStateMutation(mutation, operationId);
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
          detail: `Il Ladro ha rubato ${spellLabel} per 8 ore. Il marker è un promemoria: non blocca il lancio del bersaglio e non aggiunge l'incantesimo all'inventario del Ladro.`,
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
  sceneEpoch = null,
  damage = "",
  hit = true,
  spendReaction = true,
} = {}) {
  const originEpoch = Number.isInteger(sceneEpoch) ? sceneEpoch : currentSceneEpoch();
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
      sceneEpoch: originEpoch,
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
  // A species trait that changes hit points (Shifting excepted: its pill goes on below, with its temporary HP).
  if (feature.hpTrait && feature.hpTrait.kind !== SPECIES_HP_TRAIT_KINDS.SHIFT) {
    return applySpeciesHpTraitResolved({
      feature,
      sourceItem,
      profile,
      targetIds,
      value,
      damage,
      hit,
      sceneEpoch: originEpoch,
    });
  }
  if (!featureOverride && adapter === "unsettling-words") {
    const prepared = prepareUnsettlingWordsFeatureActivation({
      feature,
      characterBuild: profile.characterBuild,
      abilityModifiers: profile.abilityModifiers,
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
      sceneEpoch: originEpoch,
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
      sceneEpoch: originEpoch,
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
      sceneEpoch: originEpoch,
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
      sceneEpoch: originEpoch,
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
        sceneEpoch: originEpoch,
        spendReaction: false,
      }));
    }
  }

  const resolvedTargetIds = speciesChoiceTargetIds(feature, choiceId, sourceItem.id, await resolveTargetIds(
    sourceItem.id,
    feature,
    targetIds,
    profile.characterBuild,
  ));
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
  const temporaryHpApplications = [
    ...classFeatureTemporaryHpApplications(feature, {
      sourceId: sourceItem.id,
      targetIds: resolvedTargetIds,
      choiceId,
    }),
    // A shifter's Shifting: temporary hit points from the sheet (Beasthide's d6 entered at the table, as value).
    ...speciesShiftTemporaryHp(feature, profile, sourceItem, value),
    ...speciesChoiceTemporaryHp(feature, profile, choiceId, sourceItem, resolvedTargetIds, value),
  ];
  activation = planClassFeatureActivation({
    state: sourceItem.metadata?.[META_KEY]?.[CLASS_FEATURE_STATE_FIELD],
    feature,
    poolsById: CLASS_FEATURE_RESOURCE_POOL_BY_ID,
    characterBuild: profile.characterBuild,
    abilityModifiers: profile.abilityModifiers,
    sourceId: sourceItem.id,
    targetIds: resolvedTargetIds,
    currentRound: round,
    currentTurnKey: turnState.turnKey,
    instanceId,
    choiceId,
    resourceValues,
    enabledFeatureIds: getEnabledClassFeatures(profile).map((entry) => entry.id),
  });
  if (!activation.ok) {
    throw classFeatureError(activation.reason || "invalid-activation", activation.poolId);
  }
  const conditionFeature = adapter === "bardic-inspiration"
    ? featureWithEloquenceInfallibleReminder(feature, profile)
    : feature;
  const additions = classFeatureConditionInstancesForActivation(
    conditionFeature,
    activation.instance,
    sourceItem.name,
    profile.characterBuild,
  );
  const instancesByTarget = {};
  for (const instance of additions) {
    (instancesByTarget[instance.targetId] ||= []).push(instance);
  }
  const currentItems = await OBR.scene.items.getItems(itemIds);
  const currentById = new Map(currentItems.map((item) => [item.id, item]));
  // Only the feature the GM used: a parent or a child activated along with it spends nothing.
  const reaction = classFeatureReactionSpend(feature, currentById.get(sourceItem.id) || sourceItem, turnState.state, spendReaction);
  const metadataPatches = [{
    id: sourceItem.id,
    fields: {
      [CLASS_FEATURE_STATE_FIELD]: {
        mode: "set",
        value: activation.state,
        expected: metadataFieldExpectation(
          sourceItem.metadata?.[META_KEY] || {},
          CLASS_FEATURE_STATE_FIELD,
        ),
      },
    },
  }];
  for (const application of temporaryHpApplications) {
    const item = currentById.get(application.targetId);
    const meta = item?.metadata?.[META_KEY] || {};
    const hp = Number(meta.hp);
    const hpMax = Number(meta.hpMax);
    if (!Number.isFinite(hp) || !Number.isFinite(hpMax) || hpMax <= 0) continue;
    const change = calculateQuickHPChange({
      mode: QUICK_HP_MODES.TEMP,
      value: application.amount,
      hp,
      hpMax,
    });
    if (!change.changed) continue;
    metadataPatches.push({
      id: application.targetId,
      fields: {
        hp: {
          mode: "set",
          value: change.afterHP,
          expected: metadataFieldExpectation(meta, "hp"),
        },
        hpMax: {
          mode: "assert",
          expected: metadataFieldExpectation(meta, "hpMax"),
        },
      },
    });
  }
  const activationOperations = Object.keys(instancesByTarget).length
    ? [{ type: "condition:add-instances", instancesByTarget }]
    : [];
  if (classFeatureBreaksConcentration(feature)) {
    activationOperations.push({
      type: "concentration:break",
      casterIds: [sourceItem.id],
    });
  }
  activationOperations.push(...reaction.operations);
  const classFeatureMutation = await runEffectsMutation(
    activationOperations,
    {
      kind: "class-feature",
      label: `Capacità: ${feature.name}`,
      targetIds: itemIds,
      metadataPatches,
      sceneEpoch: originEpoch,
      sideEffects: classFeatureBreaksConcentration(feature)
        ? [{
          type: "static-zone:remove-ended",
          selectors: [{ casterId: sourceItem.id }],
        }]
        : [],
    },
  );
  requireAppliedEffectsMutation(classFeatureMutation);
  if (adapter === "bardic-inspiration") {
    void emitMatchedClassFeatureVisual({
      featureId: feature.id,
      casterId: sourceItem.id,
      targetIds: resolvedTargetIds,
      eventId: activation.instance?.instanceId || instanceId,
      lifecycleId: activation.instance?.instanceId || instanceId,
      sceneEpoch: originEpoch,
    }).catch((error) => {
      console.warn("[class-feature] matched visual:", error?.message || error);
    });
  }
  await refreshConditionLabels(Array.from(new Set([
    ...itemIds,
    ...(classFeatureMutation.changedIds || []),
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
        sceneEpoch: originEpoch,
        spendReaction: false,
      }));
    }
  }
  return {
    feature,
    instance: activation.instance,
    state: activation.state,
    targetIds: resolvedTargetIds,
    autoResults,
    ...reactionResult(reaction),
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
  const sourceMeta = sourceItem.metadata?.[META_KEY] || {};
  const frenzyMeta = { conditions: structuredClone(sourceMeta.conditions || {}) };
  for (const entry of endedFrenzyEntries) {
    applyBerserkerFrenzyExhaustion(frenzyMeta, sourceId, entry.instanceId);
  }
  const previousConditionIds = new Set(conditionInstancesForMeta(sourceMeta).map((entry) => entry.id));
  const frenzyAdditions = conditionInstancesForMeta(frenzyMeta)
    .filter((entry) => !previousConditionIds.has(entry.id));
  const operations = [{
    type: "condition:remove-parent-effects",
    parentEffectIds: [...removedInstanceIds],
    conditionTypes: ["class-feature", "class-feature-area"],
  }];
  if (frenzyAdditions.length) {
    operations.push({
      type: "condition:add-instances",
      instancesByTarget: { [sourceId]: frenzyAdditions },
    });
  }
  const mutation = await runEffectsMutation(operations, {
    kind: "class-feature",
    label: "Capacità terminata",
    targetIds: itemIds,
    metadataPatches: [{
      id: sourceId,
      fields: {
        [CLASS_FEATURE_STATE_FIELD]: {
          mode: "set",
          value: plannedRemoval.state,
          expected: metadataFieldExpectation(sourceMeta, CLASS_FEATURE_STATE_FIELD),
        },
      },
    }],
  });
  requireAppliedEffectsMutation(mutation);
  await refreshConditionLabels(itemIds);
  return plannedRemoval || {
    changed: false,
    state: getClassFeatureState(sourceItem),
  };
}

export async function reconcileClassFeatureActivationsAfterConditionRemoval(
  removedConditions = [],
  {
    returnDetails = false,
    isCurrent = () => true,
    sourceItems = null,
  } = {},
) {
  const emptyResult = () => returnDetails ? { changed: [], details: [] } : [];
  if (!isCurrent()) return emptyResult();
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
  if (!grouped.size) return emptyResult();

  const sourceIds = Array.from(new Set([...grouped.values()].map((entry) => entry.sourceId)));
  const sources = Array.isArray(sourceItems)
    ? sourceItems.filter((item) => sourceIds.includes(item?.id))
    : await OBR.scene.items.getItems(sourceIds);
  if (!isCurrent()) return emptyResult();
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

  if (!updates.size) return emptyResult();
  const ids = [...updates.keys()];
  const details = [];
  for (const source of sources) {
      const update = updates.get(source.id);
      if (!update) continue;
      const meta = structuredClone(source.metadata?.[META_KEY] || {});
      const beforeState = metadataFieldExpectation(meta, CLASS_FEATURE_STATE_FIELD);
      const beforeConditions = structuredClone(conditionInstancesForMeta(meta));
      meta[CLASS_FEATURE_STATE_FIELD] = update.nextState;
      for (const instanceId of update.removedFrenzyInstanceIds || []) {
        applyBerserkerFrenzyExhaustion(meta, source.id, instanceId);
      }
      details.push({
        id: source.id,
        beforeState,
        afterState: metadataFieldExpectation(meta, CLASS_FEATURE_STATE_FIELD),
        beforeConditions,
        afterConditions: structuredClone(conditionInstancesForMeta(meta)),
      });
  }
  return returnDetails ? { changed: ids, details } : ids;
}

// The attack console's "Usa reazione": a feature used with a reaction and nothing to spend (Uncanny Dodge, Deflect
// Missiles) marks only "Reazione usata", undoable; in combat only, and never twice.
export async function useClassFeatureReaction({ sourceId, featureId } = {}) {
  const feature = getClassFeatureDefinition(featureId);
  if (!isReactionClassFeature(feature)) throw new Error("Questa capacità non usa la reazione.");
  // Not automated by definition: only enabled for the character (loadEnabledClassFeatureSource refuses the rest).
  const [sourceItem] = await OBR.scene.items.getItems([sourceId]);
  if (!sourceItem) throw classFeatureError("source-not-found");
  if (!getEnabledClassFeatures(getInitiativeCard(sourceItem)).some((entry) => entry.id === feature.id)) {
    throw classFeatureError("feature-not-enabled");
  }
  const reaction = classFeatureReactionSpend(feature, sourceItem, (await currentTurnState()).state);
  if (!reaction.applies) throw new Error("Fuori dal combattimento: nessuna reazione da segnare.");
  if (reaction.alreadyUsed) throw new Error(reaction.message);
  const mutation = await runEffectsMutation(reaction.operations, {
    kind: "class-feature",
    label: `Reazione: ${feature.name}`,
    targetIds: [sourceItem.id],
  });
  requireAppliedEffectsMutation(mutation);
  await refreshConditionLabels([sourceItem.id]);
  return { feature, ...reactionResult(reaction) };
}

// featureId: the feature the resource is spent for (the attack console's Spendi): one used with a reaction spends the
// reaction too, in the same command.
export async function adjustClassFeatureResource(
  sourceId,
  poolId,
  adjustment = {},
  { featureId = "" } = {},
) {
  const pool = getClassFeatureResourcePool(poolId);
  if (!pool) throw classFeatureError("resource-pool-missing", poolId);
  const [sourceItem] = await OBR.scene.items.getItems([sourceId]);
  if (!sourceItem) throw classFeatureError("source-not-found");
  const profile = getInitiativeCard(sourceItem);
  const operationId = classFeatureStateOperationId("adjust-resource");
  const spentFor = featureId ? getClassFeatureDefinition(featureId) : null;
  const reaction = isReactionClassFeature(spentFor) && Number(adjustment?.delta) < 0
    ? classFeatureReactionSpend(spentFor, sourceItem, (await currentTurnState()).state)
    : planReactionSpend({ applies: false });
  const mutation = await runEffectsMutation([{
    type: "class-feature:adjust-resource",
    operationId,
    sourceId,
    pool,
    characterBuild: profile.characterBuild,
    abilityModifiers: profile.abilityModifiers,
    adjustment,
  }, ...reaction.operations], {
    kind: "class-feature",
    label: `Risorsa: ${pool.name}`,
    targetIds: [sourceId],
    // A manual edit from the card: the caller gets its answer once the token is written; the History follows
    // on the Effects lane (effectsRecovery.js).
    deferRecoveryHistory: true,
  });
  const result = requireClassFeatureStateMutation(mutation, operationId);
  return reaction.applies ? { ...result, ...reactionResult(reaction) } : result;
}

// Every resource pool of the character: those already in its state, those of its class and species features
// (spell slots included, resolved by id), and the uses of its spell quick actions with a counter of their own.
function characterResourcePools(sourceItem, profile) {
  const currentState = getClassFeatureState(sourceItem);
  const poolIds = new Set(Object.keys(currentState.resources));
  for (const feature of [...getAvailableClassFeatures(profile.characterBuild), ...getSpeciesFeatures(profile)]) {
    for (const cost of Array.isArray(feature.resourceCosts) ? feature.resourceCosts : []) {
      if (cost?.poolId) poolIds.add(String(cost.poolId));
    }
    for (const poolId of Array.isArray(feature.trackedResourcePoolIds)
      ? feature.trackedResourcePoolIds
      : []) {
      if (poolId) poolIds.add(String(poolId));
    }
  }
  const quickActionPools = (Array.isArray(profile.quickActions) ? profile.quickActions : [])
    .map(quickActionUsesPool)
    .filter(Boolean);
  return [
    ...[...poolIds].map((poolId) => getClassFeatureResourcePool(poolId)).filter(Boolean),
    ...quickActionPools,
  ];
}

export async function resetClassFeatureResources(sourceId) {
  return resetCharacterResources(sourceId);
}

export async function shortRestClassFeatureResources(sourceId) {
  return resetCharacterResources(sourceId, { shortRest: true });
}

async function resetCharacterResources(sourceId, { shortRest = false } = {}) {
  const [sourceItem] = await OBR.scene.items.getItems([sourceId]);
  if (!sourceItem) throw classFeatureError("source-not-found");
  const profile = getInitiativeCard(sourceItem);
  // A short rest restores the pools that come back with it at the character's level (Pact Magic, ki, Channel
  // Divinity...); the long rest, every pool.
  const pools = characterResourcePools(sourceItem, profile).filter((pool) => (
    !shortRest || classFeatureResourceRefreshEvents(pool, profile.characterBuild).includes("riposo_breve")
  ));
  const operationId = classFeatureStateOperationId(shortRest ? "short-rest" : "reset-resources");
  const mutation = await runEffectsMutation([{
    type: "class-feature:reset-resources",
    operationId,
    sourceId,
    pools,
    characterBuild: profile.characterBuild,
    abilityModifiers: profile.abilityModifiers,
    poolIds: pools.map((pool) => pool.id),
  }], {
    kind: "class-feature",
    label: shortRest ? "Riposo breve: risorse ripristinate" : "Risorse di classe ripristinate",
    targetIds: [sourceId],
  });
  return requireClassFeatureStateMutation(mutation, operationId);
}
