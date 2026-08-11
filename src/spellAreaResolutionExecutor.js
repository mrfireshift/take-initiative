import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import {
  QUICK_HP_FACTORS,
  QUICK_HP_MODES,
  calculateQuickHPChange,
  createQuickHPVisualTransaction,
  quickHPVisualUpdates,
  quickHPZeroReconcileTargetIds,
} from "./quickHpCore.js";
import { getConditionInstances } from "./conditions.js";
import { resolveZeroHPUnconsciousAction } from "./hpConditionRulesCore.js";
import { currentSceneEpoch, isCurrentSceneEpoch } from "./sceneEpoch.js";
import {
  getAreaSaveAutomation,
  getSpellAttackResolution,
  getSpellDefinition,
} from "./spells-srd.js";
import {
  AREA_HEALING_SPELL_ID_SET,
} from "./areaSaveSpellRules.js";
import {
  resolveSaveSpellResolution,
  SAVE_SPELL_OUTCOMES,
} from "./saveSpellCore.js";
import { spellEffectConditionOptions } from "./spellEffectCore.js";
import {
  getSpellSaveWorkflowRule,
} from "./spellSaveWorkflowRules.js";
import { createSpellInstanceId } from "./spells.js";
import {
  confirmedSpellAreaTargetIds,
} from "./quickHpAreaWorkflowCore.js";
import {
  getSpellAreaRuleById,
  getSpellAreaRuleForPlacement,
  getSpellAreaRules,
} from "./spellAreaRules.js";
import {
  areaMembershipPlan,
} from "./spellAreaMembershipCore.js";
import {
  buildStaticSpellZoneItems,
  getStaticSpellZoneItems,
} from "./spellStaticZone.js";
import {
  SPELL_STATIC_ZONE_META_KEY,
  staticSpellZoneOwnerOperation,
} from "./spellStaticZoneCore.js";
import {
  getSpellBoardTokenItems,
  buildSpellBoardTokenItem,
} from "./spellBoardToken.js";
import {
  createSpellBoardTokenId,
  spellBoardTokenPlacementPosition,
} from "./spellBoardTokenCore.js";
import { SPELL_AURA_META_KEY } from "./spellAuraCore.js";
import {
  getZeroHPConditionHistoryIds,
} from "./hpConditionAutomation.js";
import {
  saveSpellResolutionOperations,
  saveSpellTriggerResolutionOperations,
} from "./saveSpellOperationsCore.js";
import {
  requireAppliedEffectsMutation,
  runEffectsMutation,
} from "./effectsMutations.js";
import {
  getHistoryEntries,
  withItemMetaHistory,
} from "./history.js";
import {
  decorateCompositeEffectsHistoryEntry,
} from "./effectsMutationCompositeHistoryCore.js";
import { syncHPBatchToMemory } from "./hpMemory.js";
import { syncHPBarNow, syncHPTextBatchNow } from "./hpbar-items.js";
import { emitFireballVisual } from "./fireballVisualRenderer.js";
import { emitMatchedSpellVisual } from "./embersMatchedVisualRenderer.js";
import {
  consumeSpellZoneTrigger,
  pendingSpellZoneTriggerActivations,
} from "./spellZoneTriggerCore.js";
import {
  SPELL_AREA_RESOLUTION_COMMAND_TYPE,
} from "./spellAreaResolutionCommandCore.js";

const META_KEY = `${ID}/meta`;
const SPELLS_KEY = `${ID}/spells`;
const CONCENTRATION_KEY = `${ID}/concentration`;

const RESULT_STATUSES = Object.freeze({
  APPLIED: "applied",
  NOOP: "noop",
  REJECTED: "rejected",
  FAILED: "failed",
});

const text = (value) => String(value ?? "").trim();

function uniqueIds(values = []) {
  const source = values instanceof Set
    ? [...values]
    : Array.isArray(values)
      ? values
      : [];
  return [...new Set(source.map(text).filter(Boolean))];
}

function clone(value) {
  if (value === undefined) return undefined;
  if (typeof globalThis.structuredClone === "function") return globalThis.structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function normalizedError(error, fallbackCode = "spell-area-resolution-failed") {
  if (typeof error === "string") return { code: fallbackCode, message: error };
  return {
    code: text(error?.code || error?.reason || error?.name) || fallbackCode,
    message: text(error?.message || error?.reason || error) || fallbackCode,
  };
}

function errorList(errors = [], fallbackCode = "spell-area-resolution-invalid") {
  return (Array.isArray(errors) ? errors : [errors])
    .filter((error) => error !== null && error !== undefined && error !== "")
    .map((error) => normalizedError(error, fallbackCode));
}

function resultBase(command, status, extra = {}) {
  return {
    status,
    commandType: text(command?.type) || SPELL_AREA_RESOLUTION_COMMAND_TYPE,
    spellId: text(command?.spell?.spellId),
    instanceId: text(extra.instanceId),
    casterId: text(command?.spell?.casterId),
    changedIds: uniqueIds(extra.changedIds),
    hpChanges: Array.isArray(extra.hpChanges) ? extra.hpChanges : [],
    effectChanges: Array.isArray(extra.effectChanges) ? extra.effectChanges : [],
    sceneItemChanges: Array.isArray(extra.sceneItemChanges) ? extra.sceneItemChanges : [],
    triggerChanges: Array.isArray(extra.triggerChanges) ? extra.triggerChanges : [],
    historyEntryId: text(extra.historyEntryId),
    undoAvailable: extra.undoAvailable === true,
    visualEvents: Array.isArray(extra.visualEvents) ? extra.visualEvents : [],
    warnings: Array.isArray(extra.warnings) ? extra.warnings : [],
    errors: Array.isArray(extra.errors) ? extra.errors : [],
  };
}

function trackedHP(item) {
  const meta = item?.metadata?.[META_KEY];
  return !!meta
    && Number.isFinite(Number(meta.hp))
    && Number.isFinite(Number(meta.hpMax));
}

function itemName(item) {
  return text(item?.name) || "Token";
}

function itemMeta(item) {
  return item?.metadata?.[META_KEY] && typeof item.metadata[META_KEY] === "object"
    ? item.metadata[META_KEY]
    : {};
}

function spellNames(spell) {
  return new Set([
    spell?.id,
    spell?.name,
    spell?.displayName,
    spell?.catalogLabel,
  ].map((value) => text(value).toLocaleLowerCase("it")).filter(Boolean));
}

function activeConcentrationForSpell(caster, spell) {
  const concentrations = itemMeta(caster)[CONCENTRATION_KEY];
  if (!spell || !concentrations || typeof concentrations !== "object") return null;
  const names = spellNames(spell);
  return Object.entries(concentrations)
    .map(([key, entry]) => ({
      key,
      ...(entry && typeof entry === "object" ? entry : {}),
    }))
    .find((entry) => (
      text(entry.spellId) === text(spell.id)
      || names.has(text(entry.name || entry.key).toLocaleLowerCase("it"))
    )) || null;
}

function remainingSpellTurns(items, instanceId, fallback = 1) {
  const wanted = text(instanceId);
  const turns = (Array.isArray(items) ? items : []).flatMap((item) => {
    const spells = itemMeta(item)[SPELLS_KEY];
    if (!Array.isArray(spells)) return [];
    return spells
      .filter((entry) => text(entry?.instanceId || entry?.id) === wanted)
      .map((entry) => Math.floor(Number(entry?.turns) || 0))
      .filter((value) => value > 0);
  });
  return turns.length
    ? Math.min(...turns)
    : Math.max(1, Math.floor(Number(fallback) || 1));
}

function appliedAtForState(state, actorId = null) {
  if (!state || typeof state !== "object") return null;
  const order = Array.isArray(state.order) ? state.order : [];
  const current = Math.max(0, Math.min(
    order.length ? order.length - 1 : 0,
    Math.floor(Number(state.current) || 0),
  ));
  return {
    round: Math.max(1, Math.floor(Number(state.round) || 1)),
    actorId: actorId || (order[current] ? text(order[current]).replace(/::p\d+$/u, "") : null),
    phase: "turn",
    turnKey: `${Math.max(1, Math.floor(Number(state.round) || 1))}:${current}`,
  };
}

function normalizeFactor(value) {
  return value === "half" ? QUICK_HP_FACTORS.HALF : QUICK_HP_FACTORS.FULL;
}

function hpEntries({ command, items, spell }) {
  const hp = command?.hp || {};
  if (![QUICK_HP_MODES.DAMAGE, QUICK_HP_MODES.HEAL].includes(hp.mode)) return [];
  const amount = Math.max(0, Math.floor(Number(hp.amount) || 0));
  const outcomes = command?.outcomes?.byTarget || {};
  const mode = hp.mode === "heal" || AREA_HEALING_SPELL_ID_SET.has(text(spell?.id))
    ? QUICK_HP_MODES.HEAL
    : QUICK_HP_MODES.DAMAGE;
  return (Array.isArray(items) ? items : [])
    .filter(trackedHP)
    .map((item) => {
      const targetId = text(item.id);
      const outcome = text(outcomes[targetId]);
      const zeroDamage = hp.outcomeFactors?.[targetId] === "zero";
      const factorName = zeroDamage
        ? QUICK_HP_FACTORS.FULL
        : normalizeFactor(hp.outcomeFactors?.[targetId]);
      const change = calculateQuickHPChange({
        mode,
        value: zeroDamage || outcome === SAVE_SPELL_OUTCOMES.IMMUNE ? 0 : amount,
        factor: factorName,
        hp: itemMeta(item).hp,
        hpMax: itemMeta(item).hpMax,
      });
      return { item, change, outcome };
    })
    .filter((entry) => entry.change.changed);
}

function castContextFor({ spell, resolution, command, mobileAura, boardToken }) {
  const hasActiveResolution = Array.isArray(spell?.activeActions)
    && spell.activeActions.some((action) => action?.resolutionKind);
  if (!hasActiveResolution && !mobileAura && !boardToken
    && !resolution?.targeting && !resolution?.choice) return null;
  return {
    ...(hasActiveResolution ? { slotLevel: command.spell.slotLevel } : {}),
    ...(mobileAura ? { mobileAura: true } : {}),
    ...(boardToken ? { boardToken: true } : {}),
    ...(resolution?.targeting?.slotLevel !== undefined
      ? { slotLevel: resolution.targeting.slotLevel }
      : {}),
    ...(resolution?.choice?.value ? { choice: resolution.choice.value } : {}),
    ...(resolution?.targetContexts && Object.keys(resolution.targetContexts).length
      ? { targetContexts: resolution.targetContexts }
      : {}),
  };
}

function serializableEffectChanges(mutation) {
  return (Array.isArray(mutation?.changes) ? mutation.changes : [])
    .map((change) => ({
      id: text(change?.id),
      fields: Object.keys(change?.fields || change?.after || {}).filter(Boolean),
    }))
    .filter((change) => change.id);
}

function serializableSceneChanges(plan) {
  return uniqueIds(plan?.staticZoneSceneItemIds)
    .map((id) => ({ id, kind: "scene-item" }));
}

function defaultSyncHPVisuals(updates = []) {
  for (const update of updates) syncHPBarNow(update.tokenId, update.hp, update.hpMax);
  return syncHPTextBatchNow(updates);
}

async function defaultReadAuthoritativeHPVisualUpdates(itemIds = [], sceneEpoch = currentSceneEpoch()) {
  if (!isCurrentSceneEpoch(sceneEpoch)) return [];
  const ids = uniqueIds(itemIds);
  if (!ids.length) return [];
  const items = await OBR.scene.items.getItems(ids);
  if (!isCurrentSceneEpoch(sceneEpoch)) return [];
  return items.filter(trackedHP).map((item) => ({
    tokenId: item.id,
    hp: Math.max(0, Math.floor(Number(itemMeta(item).hp) || 0)),
    hpMax: Math.max(0, Math.floor(Number(itemMeta(item).hpMax) || 0)),
  }));
}

function defaultRuntime(overrides = {}) {
  const epoch = currentSceneEpoch();
  return {
    sceneEpoch: epoch,
    isCurrent: (value = epoch) => isCurrentSceneEpoch(value),
    readItems: (ids = []) => ids.length ? OBR.scene.items.getItems(ids) : Promise.resolve([]),
    readAllItems: () => OBR.scene.items.getItems(),
    readSceneMetadata: () => OBR.scene.getMetadata(),
    updateItems: (ids, callback) => OBR.scene.items.updateItems(ids, callback),
    addItems: (items) => OBR.scene.items.addItems(items),
    deleteItems: (ids) => OBR.scene.items.deleteItems(ids),
    getStaticZoneItems: (selector) => getStaticSpellZoneItems(selector),
    getBoardTokenItems: (selector) => getSpellBoardTokenItems(selector),
    targetItems: [],
    buildStaticZoneItems: (options) => buildStaticSpellZoneItems(options),
    buildBoardTokenItem: (options) => buildSpellBoardTokenItem(options),
    createSpellInstanceId,
    runEffectsMutation,
    requireAppliedEffectsMutation,
    withItemMetaHistory,
    getHistoryEntries,
    syncHPVisuals: defaultSyncHPVisuals,
    readAuthoritativeHPVisualUpdates: defaultReadAuthoritativeHPVisualUpdates,
    syncHPBatchToMemory,
    emitFireballVisual,
    emitMatchedSpellVisual,
    getZeroHPConditionHistoryIds,
    onConcentrationWarnings: async () => {},
    onEffectSaveWarnings: async () => {},
    buildCallLightningCloudPlacement: async () => null,
    getInitiativeActorId: async () => null,
    validateSpatial: async () => ({ valid: true, errors: [] }),
    zoneTriggerRootItems: async (activation, runtime) => defaultZoneTriggerRootItems(
      activation,
      runtime,
    ),
    consumeZoneTrigger: (activation, runtime) => defaultConsumeZoneTrigger(
      activation,
      runtime,
    ),
    restoreZoneTrigger: (snapshot, runtime) => defaultRestoreZoneTrigger(
      snapshot,
      runtime,
    ),
    ...overrides,
  };
}

async function defaultZoneTriggerRootItems(activation, runtime) {
  const ids = uniqueIds([
    ...(activation?.zoneItemIds || []),
    activation?.zoneItemId,
  ]);
  if (!ids.length) return [];
  const items = await runtime.readItems(ids);
  return items.filter((item) => pendingSpellZoneTriggerActivations([item])
    .some((entry) => entry.id === activation.id));
}

async function defaultConsumeZoneTrigger(activation, runtime) {
  const ids = uniqueIds([
    ...(activation?.zoneItemIds || []),
    activation?.zoneItemId,
  ]);
  if (!ids.length) return;
  await runtime.updateItems(ids, (drafts) => {
    for (const item of drafts) {
      const metadataKey = item.metadata?.[SPELL_STATIC_ZONE_META_KEY]
        ? SPELL_STATIC_ZONE_META_KEY
        : item.metadata?.[SPELL_AURA_META_KEY]
          ? SPELL_AURA_META_KEY
          : "";
      const metadata = item.metadata?.[metadataKey];
      if (!metadataKey || !metadata) continue;
      item.metadata = {
        ...(item.metadata || {}),
        [metadataKey]: {
          ...metadata,
          triggerRuntime: consumeSpellZoneTrigger(
            metadata.triggerRuntime,
            activation.id,
          ),
        },
      };
    }
  });
}

async function defaultRestoreZoneTrigger(snapshot, runtime) {
  const snapshots = Array.isArray(snapshot) ? snapshot : [snapshot];
  const ids = snapshots.map((entry) => entry?.id).filter(Boolean);
  if (!ids.length) return;
  const byId = new Map(snapshots.map((entry) => [entry.id, entry]));
  await runtime.updateItems(ids, (drafts) => {
    for (const item of drafts) {
      const original = byId.get(item.id);
      const metadataKey = original?.metadata?.[SPELL_STATIC_ZONE_META_KEY]
        ? SPELL_STATIC_ZONE_META_KEY
        : original?.metadata?.[SPELL_AURA_META_KEY]
          ? SPELL_AURA_META_KEY
          : "";
      const metadata = original?.metadata?.[metadataKey];
      if (!metadataKey || !metadata) continue;
      item.metadata = {
        ...(item.metadata || {}),
        [metadataKey]: clone(metadata),
      };
    }
  });
}

function placementRuleFor(command, spell) {
  const placementId = text(command?.placement?.ruleId);
  if (placementId) {
    return getSpellAreaRuleForPlacement(
      placementId,
      text(command?.spell?.choiceValue),
    ) || getSpellAreaRuleById(placementId);
  }
  const triggerId = text(command?.execution?.zoneTrigger?.ruleId);
  if (triggerId) return getSpellAreaRuleById(triggerId);
  return getSpellAreaRules(spell?.id, { triggerType: "cast" })
    .find((rule) => rule.kind === "aura" || rule.kind === "zone" || rule.kind === "board-token")
    || null;
}

function appliedTargetIds(command, placement) {
  const placementTargets = uniqueIds(placement?.targetIds);
  return placementTargets.length && placement?.status === "confirmed"
    ? placementTargets
    : uniqueIds(command?.targeting?.targetIds);
}

function triggerFrom(command, runtime) {
  if (command?.source?.kind !== "zone-trigger") return null;
  return runtime.zoneTrigger || command.execution?.zoneTrigger || null;
}

async function buildPlan(command, runtime) {
  const spellId = text(command?.spell?.spellId);
  const spell = getSpellDefinition(spellId);
  if (!spell) return { valid: false, errors: [{ code: "spell-not-found", message: "Spell non trovato." }] };
  const targetIds = uniqueIds(command?.targeting?.targetIds);
  const liveItems = targetIds.length ? await runtime.readItems(targetIds) : [];
  const liveById = new Map(liveItems.map((item) => [item.id, item]));
  const missingTargetIds = targetIds.filter((id) => !liveById.has(id));
  if (missingTargetIds.length) {
    return {
      valid: false,
      errors: [{
        code: "target-missing",
        message: `Bersagli non più presenti: ${missingTargetIds.join(", ")}.`,
      }],
    };
  }
  const allItems = await runtime.readAllItems();
  const allById = new Map(allItems.map((item) => [item.id, item]));
  const casterId = text(command?.spell?.casterId);
  const caster = casterId
    ? allById.get(casterId) || (await runtime.readItems([casterId]))[0] || null
    : null;
  const placement = command?.placement || null;
  const placementRule = placementRuleFor(command, spell);
  const zoneTriggerResolution = command?.source?.kind === "zone-trigger";
  const mobileAura = !zoneTriggerResolution && placementRule?.kind === "aura";
  const boardToken = !zoneTriggerResolution && placementRule?.kind === "board-token";
  const cloudPending = spell.id === "call-lightning"
    && text(placement?.ruleId) === "call-lightning:cast";
  const staticZonePlacement = !zoneTriggerResolution
    && placementRule?.kind === "zone"
    && placement?.status === "confirmed";
  const targetScopedStaticZone = staticZonePlacement
    && placementRule?.zonePolicy?.targetScope === "spell-targets";
  const allowEmptyTargets = staticZonePlacement || mobileAura || boardToken || cloudPending;
  const targetContexts = command?.targeting?.targetContexts || {};
  const outcomeEntries = Object.entries(command?.outcomes?.byTarget || {});
  const outcomes = new Map(outcomeEntries);
  const saveWorkflowRule = getSpellSaveWorkflowRule(spell.id);
  const attackResolution = getSpellAttackResolution(
    spell,
    text(command?.spell?.choiceValue),
    { slotLevel: command?.spell?.slotLevel },
  );
  const phaseResolution = command?.phaseResolution && typeof command.phaseResolution === "object"
    ? command.phaseResolution
    : null;
  const automation = command?.automation
    || getAreaSaveAutomation(spell, text(command?.spell?.choiceValue))
    || spell.saveAutomation
    || null;
  const validation = await runtime.validateSpatial({
    command,
    spell,
    items: allItems,
    targetIds,
    caster,
  });
  if (validation?.valid === false) {
    return {
      valid: false,
      errors: errorList(validation.errors, "spatial-validation-failed"),
    };
  }
  const resolution = attackResolution
    ? {
      valid: true,
      errors: [],
      spellId: spell.id,
      spellName: spell.displayName || spell.name,
      concentration: spell.concentration === true,
      casterId,
      targetIds,
      spellTargetIds: [],
      conditionApplications: [],
    }
    : phaseResolution
      ? {
        valid: true,
        errors: [],
        spellId: spell.id,
        spellName: spell.displayName || spell.name,
        concentration: spell.concentration === true,
        casterId,
        targetIds,
        spellTargetIds: [...targetIds],
        conditionApplications: [],
      }
    : resolveSaveSpellResolution({
      spell,
      casterId,
      targetIds,
      outcomes: command?.outcomes?.required
        ? outcomes
        : new Map(targetIds.map((id) => [id, SAVE_SPELL_OUTCOMES.FAILED])),
      automation,
      allowEmptyTargets,
      saveWorkflowRule,
      slotLevel: command?.spell?.slotLevel,
      choiceValue: text(command?.spell?.choiceValue),
      pairwiseDistancesMeters: command?.targeting?.spatialValidation?.pairwiseDistancesMeters,
      casterDistancesMeters: command?.targeting?.spatialValidation?.casterDistancesMeters,
      validateSpatial: false,
      targetContexts,
    });
  if (!resolution.valid) {
    return { valid: false, errors: errorList(resolution.errors, "spell-resolution-invalid") };
  }

  const stateMetadata = await runtime.readSceneMetadata();
  const appliedAt = appliedAtForState(
    stateMetadata?.[`${ID}/state`] || {},
    await runtime.getInitiativeActorId(),
  );
  const activeConcentration = activeConcentrationForSpell(caster, spell);
  if (command?.source?.kind === "prepared-resolution") {
    const parentInstanceId = text(command.source.parentInstanceId);
    if (!parentInstanceId) {
      return {
        valid: false,
        errors: [{
          code: "prepared-instance-required",
          message: "La risoluzione preparata richiede l'istanza parent.",
        }],
      };
    }
    if (!activeConcentration?.instanceId) {
      return {
        valid: false,
        errors: [{
          code: "prepared-instance-missing",
          message: "L'istanza preparata non è più attiva.",
        }],
      };
    }
    if (text(activeConcentration.instanceId) !== parentInstanceId) {
      return {
        valid: false,
        errors: [{
          code: "prepared-instance-stale",
          message: "L'istanza preparata è cambiata: ripeti la risoluzione.",
        }],
      };
    }
  }
  const rawTrigger = triggerFrom(command, runtime);
  const trigger = command?.execution?.zoneTrigger || null;
  let spellInstanceId = text(trigger?.instanceId);
  let concentrationAction = "";
  let resolved = {
    ...resolution,
    spellTargetIds: [...(resolution.spellTargetIds || [])],
  };
  if ((mobileAura || boardToken) && casterId) {
    resolved.spellTargetIds = uniqueIds([...resolved.spellTargetIds, casterId]);
  }
  const effectSubjectIds = uniqueIds([
    ...resolved.spellTargetIds,
    ...(resolved.conditionApplications || []).flatMap((application) => application.targetIds || []),
  ]);
  let effectOperations = [];
  if (trigger) {
    concentrationAction = "trigger";
    effectOperations = saveSpellTriggerResolutionOperations({
      resolution: resolved,
      instanceId: spellInstanceId,
      casterName: itemName(caster),
      turns: remainingSpellTurns(allItems, spellInstanceId, spell.defaultTurns || 1),
      spellExpiry: spell.concentration ? { mode: "concentration" } : spell.expiry || null,
      appliedAt,
    });
  } else {
    const preparedParentInstanceId = text(command?.source?.parentInstanceId);
    concentrationAction = command?.source?.kind === "prepared-resolution"
      ? "dismiss"
      : automation?.concentrationAction === "dismiss"
      ? "dismiss"
      : "replace";
    spellInstanceId = concentrationAction === "extend"
      ? text(activeConcentration.instanceId)
      : concentrationAction === "dismiss" && preparedParentInstanceId
        ? preparedParentInstanceId
      : (await runtime.createSpellInstanceId?.() || `spell:${Date.now().toString(36)}`);
    effectOperations = saveSpellResolutionOperations({
      resolution: resolved,
      instanceId: spellInstanceId,
      casterName: itemName(caster),
      turns: spell.defaultTurns || 1,
      spellExpiry: spell.concentration ? { mode: "concentration" } : spell.expiry || null,
      appliedAt,
      concentrationAction,
      ...(command?.source?.kind === "prepared-resolution"
        ? { concentrationReference: preparedParentInstanceId }
        : {}),
      castContext: castContextFor({
        spell,
        resolution: resolved,
        command,
        mobileAura,
        boardToken,
      }),
    });
    const attackEffects = Array.isArray(attackResolution?.effects)
      ? attackResolution.effects
      : attackResolution?.effect
        ? [attackResolution.effect]
        : [];
    if (attackEffects.length && targetIds.length) {
      for (const effect of attackEffects) {
        const attackEffectOptions = spellEffectConditionOptions(
          effect,
          {
            sourceId: casterId,
            sourceName: itemName(caster),
            ...(appliedAt ? { appliedAt } : {}),
            expiry: effect.expiry || { mode: "manual" },
          },
        );
        effectOperations.push({
          type: "condition:add",
          targetIds,
          conditionName: text(effect.label),
          options: {
            ...attackEffectOptions,
            parentEffectId: "",
            type: "automatic",
          },
        });
      }
      effectOperations.push({
        type: "condition:automate",
        subjectIds: targetIds,
      });
    }
    if (mobileAura && casterId && Array.isArray(spell.effects)) {
      const personalEffects = spell.effects
        .filter((effect) => (
          (effect?.kind === "buff" || effect?.kind === "debuff")
          && text(effect?.label)
        ))
        .map((effect) => ({
          type: "condition:add",
          targetIds: [casterId],
          conditionName: text(effect.label),
          options: spellEffectConditionOptions(effect, {
            sourceId: casterId,
            sourceName: itemName(caster),
            appliedAt,
            expiry: spell.concentration ? { mode: "concentration" } : { mode: "manual" },
          }, spellInstanceId),
        }));
      if (personalEffects.length) {
        effectOperations.push(...personalEffects, {
          type: "condition:automate",
          subjectIds: [casterId],
        });
      }
    }
  }

  const fireballVisualContext = spell.id === "fireball" && placement?.preview
    ? {
      casterId,
      eventId: spellInstanceId,
      preview: clone(placement.preview),
      sceneEpoch: runtime.sceneEpoch,
    }
    : null;
  let matchedVisualContext = null;
  const chainLightningVisualTargetIds = uniqueIds(command?.targeting?.targetIds);
  if (spell.id === "chain-lightning" && chainLightningVisualTargetIds.length) {
    matchedVisualContext = {
      spellId: spell.id,
      casterId,
      targetIds: chainLightningVisualTargetIds,
      eventId: spellInstanceId,
      lifecycleId: spellInstanceId,
      sceneEpoch: runtime.sceneEpoch,
    };
  } else if (spell.id === "banishment" && resolved.spellTargetIds.length) {
    matchedVisualContext = {
      spellId: spell.id,
      casterId,
      targetIds: resolved.spellTargetIds,
      eventId: spellInstanceId,
      lifecycleId: spellInstanceId,
      sceneEpoch: runtime.sceneEpoch,
    };
  } else if (placement?.preview && !boardToken && spell.id !== "call-lightning") {
    matchedVisualContext = {
      spellId: spell.id,
      casterId,
      targetIds: resolved.spellTargetIds,
      eventId: spellInstanceId,
      lifecycleId: spellInstanceId,
      preview: clone(placement.preview),
      sceneEpoch: runtime.sceneEpoch,
    };
  }

  let cloudPlacement = null;
  let cloudRule = null;
  if (cloudPending) {
    cloudPlacement = await runtime.buildCallLightningCloudPlacement(casterId, placement?.preview);
    cloudRule = cloudPlacement ? getSpellAreaRuleById(cloudPlacement.ruleId) : null;
    if (!cloudPlacement || !cloudRule) {
      return {
        valid: false,
        errors: [{ code: "call-lightning-cloud-placement-unavailable", message: "Posizionamento della nube non disponibile." }],
      };
    }
    if (matchedVisualContext) matchedVisualContext.preview = clone(cloudPlacement.preview);
  }

  const staticZoneTargetIds = uniqueIds(resolved.spellTargetIds);
  const committedStaticZonePlacement = staticZonePlacement
    && (!targetScopedStaticZone || staticZoneTargetIds.length > 0);
  if (committedStaticZonePlacement) {
    const hasTrackedSpellInstance = effectOperations.some((operation) => (
      operation?.type === "spell:upsert"
      && text(operation.instanceId) === spellInstanceId
    ));
    const ownerOperation = staticSpellZoneOwnerOperation({
      rule: placementRule,
      spell,
      instanceId: spellInstanceId,
      casterId,
      appliedAt,
      trackConcentration: spell.concentration === true && !hasTrackedSpellInstance,
      ruleChoice: text(command?.spell?.choiceValue),
      slotLevel: command?.spell?.slotLevel,
    });
    if (ownerOperation) effectOperations.push(ownerOperation);
    const passiveTargetIds = targetScopedStaticZone
      ? staticZoneTargetIds
      : confirmedSpellAreaTargetIds({
        status: "confirmed",
        preview: { targetIds: placement?.targetIds || [] },
      }, allItems.map((item) => item.id));
    const membershipItems = Array.isArray(runtime.targetItems) && runtime.targetItems.length
      ? runtime.targetItems
      : allItems;
    const passivePlan = areaMembershipPlan({
      instanceId: spellInstanceId,
      sourceId: casterId,
      rule: placementRule,
      desiredTargetIds: passiveTargetIds,
      items: membershipItems,
      metaKey: META_KEY,
      sourceName: itemName(caster),
      defaultExpiry: { mode: "manual" },
    });
    effectOperations.push(...passivePlan.operations);
    effectSubjectIds.push(...passiveTargetIds);
  }
  if (cloudPlacement && cloudRule) {
    const ownerOperation = staticSpellZoneOwnerOperation({
      rule: cloudRule,
      spell,
      instanceId: spellInstanceId,
      casterId,
      appliedAt,
      trackConcentration: true,
      slotLevel: command?.spell?.slotLevel,
    });
    if (ownerOperation) effectOperations.push(ownerOperation);
  }

  const breaksExistingConcentration = effectOperations.some((operation) => (
    operation?.type === "concentration:break"
  ));
  const previousBoardTokenItems = breaksExistingConcentration
    ? await runtime.getBoardTokenItems({ casterId })
    : boardToken
      ? await runtime.getBoardTokenItems({ instanceId: spellInstanceId })
      : [];
  const boardTokenEntityId = boardToken ? createSpellBoardTokenId() : "";
  const boardTokenPosition = boardToken
    ? spellBoardTokenPlacementPosition(placement?.preview)
    : null;
  const spellBoardTokenSideEffects = [
    ...(breaksExistingConcentration ? [{
      type: "static-zone:remove-ended",
      selectors: [{ casterId }],
    }] : []),
    ...(boardToken && boardTokenPosition ? [{
      type: "spell-board-token:place",
      entityId: boardTokenEntityId,
      spellId: spell.id,
      instanceId: spellInstanceId,
      casterId,
      slotLevel: command?.spell?.slotLevel,
      position: boardTokenPosition,
    }] : []),
  ];
  const previousStaticZoneItems = breaksExistingConcentration
    ? await runtime.getStaticZoneItems({ casterId })
    : (committedStaticZonePlacement || cloudPlacement)
      ? await runtime.getStaticZoneItems({ instanceId: spellInstanceId })
      : [];
  const nextStaticZoneItems = [
    ...(committedStaticZonePlacement ? runtime.buildStaticZoneItems({
      ruleId: placement.ruleId,
      instanceId: spellInstanceId,
      casterId,
      spellName: spell.displayName || spell.name,
      preview: placement.preview,
      ruleChoice: text(command?.spell?.choiceValue),
      targetIds: staticZoneTargetIds,
    }) : []),
    ...(cloudPlacement ? runtime.buildStaticZoneItems({
      ruleId: cloudPlacement.ruleId,
      instanceId: spellInstanceId,
      casterId,
      spellName: spell.displayName || spell.name,
      preview: cloudPlacement.preview,
    }) : []),
  ];
  if (matchedVisualContext && nextStaticZoneItems.length) {
    const zoneRoot = nextStaticZoneItems.find((item) => (
      item?.metadata?.[SPELL_STATIC_ZONE_META_KEY]?.role === "root"
    ));
    if (zoneRoot?.id) matchedVisualContext.zoneId = zoneRoot.id;
  }

  effectSubjectIds.push(
    ...effectOperations.flatMap((operation) => [
      ...(Array.isArray(operation?.targetIds) ? operation.targetIds : []),
      ...(Array.isArray(operation?.subjectIds) ? operation.subjectIds : []),
    ]),
  );
  const entries = hpEntries({ command, items: liveItems, spell });
  const zeroHPReconcileIds = quickHPZeroReconcileTargetIds(entries, (entry) => {
    const meta = itemMeta(entry.item);
    return resolveZeroHPUnconsciousAction({
      ...meta,
      hp: entry.change.afterHP,
      hpMax: entry.change.hpMax,
    }, getConditionInstances(meta.conditions || {}));
  });
  const requestedZoneTrigger = trigger ? (rawTrigger || trigger) : null;
  const triggerRootItems = requestedZoneTrigger
    ? await runtime.zoneTriggerRootItems(requestedZoneTrigger, runtime)
    : [];
  if (requestedZoneTrigger && !triggerRootItems.length) {
    return {
      valid: false,
      errors: [{ code: "zone-trigger-unavailable", message: "L'attivazione della zona non è più disponibile." }],
    };
  }
  const ids = entries.map((entry) => entry.item.id);
  const affectedIds = uniqueIds([
    ...ids,
    ...effectSubjectIds,
    ...(requestedZoneTrigger ? targetIds : []),
  ]);
  const historyIds = uniqueIds([
    ...ids,
    ...effectSubjectIds,
    ...(cloudPlacement ? [casterId] : []),
    ...await runtime.getZeroHPConditionHistoryIds(ids),
  ]);
  const staticZoneSceneItemIds = uniqueIds([
    ...previousStaticZoneItems.map((item) => item.id),
    ...nextStaticZoneItems.map((item) => item.id),
    ...previousBoardTokenItems.map((item) => item.id),
    boardTokenEntityId,
    ...triggerRootItems.map((item) => item.id),
  ]);
  return {
    valid: true,
    command,
    runtime,
    spell,
    caster,
    allItems,
    liveItems,
    entries,
    ids,
    effectOperations,
    effectSubjectIds: uniqueIds(effectSubjectIds),
    spellInstanceId,
    concentrationAction,
    requestedZoneTrigger,
    triggerRootItems,
    previousStaticZoneItems,
    nextStaticZoneItems,
    previousBoardTokenItems,
    boardTokenEntityId,
    spellBoardTokenSideEffects,
    zeroHPReconcileIds,
    affectedIds,
    historyIds,
    staticZoneSceneItemIds,
    fireballVisualContext,
    matchedVisualContext,
    appliedAt,
    hpMode: command?.hp?.mode,
    operationSceneEpoch: runtime.sceneEpoch,
  };
}

async function updateHP(runtime, entries) {
  if (!entries.length) return;
  const updates = new Map(entries.map((entry) => [entry.item.id, entry.change]));
  await runtime.updateItems(entries.map((entry) => entry.item.id), (drafts) => {
    for (const item of drafts) {
      const update = updates.get(item.id);
      if (!update) continue;
      const previous = item.metadata?.[META_KEY] || {};
      item.metadata = {
        ...(item.metadata || {}),
        [META_KEY]: {
          ...previous,
          hp: update.afterHP,
          hpMax: update.hpMax,
        },
      };
    }
  });
}

async function restoreHPIfUnchanged(runtime, entries) {
  if (!entries.length) return;
  const ids = entries.map((entry) => entry.item.id);
  const current = await runtime.readItems(ids);
  const currentById = new Map(current.map((item) => [item.id, item]));
  await runtime.updateItems(ids, (drafts) => {
    for (const item of drafts) {
      const entry = entries.find((candidate) => candidate.item.id === item.id);
      const currentItem = currentById.get(item.id);
      if (!entry || !currentItem) continue;
      const meta = itemMeta(item);
      if (Number(meta.hp) !== Number(entry.change.afterHP)
        || Number(meta.hpMax) !== Number(entry.change.hpMax)) continue;
      item.metadata = {
        ...(item.metadata || {}),
        [META_KEY]: {
          ...meta,
          hp: entry.change.hp,
          hpMax: entry.change.hpMax,
        },
      };
    }
  });
}

function hpResultChanges(entries) {
  return entries.map((entry) => ({
    id: entry.item.id,
    before: entry.change.hp,
    after: entry.change.afterHP,
    delta: entry.change.delta,
    requested: entry.change.requested,
    mode: entry.change.mode,
    factor: entry.change.factor,
    outcome: entry.outcome || null,
  }));
}

function triggerResultChanges(plan) {
  return plan.requestedZoneTrigger
    ? [{
      activationId: text(plan.requestedZoneTrigger.id || plan.requestedZoneTrigger.activationId),
      instanceId: plan.spellInstanceId,
      consumed: true,
    }]
    : [];
}

function warningsFromMutation(mutation) {
  return [
    ...(Array.isArray(mutation?.postCommitErrors) ? mutation.postCommitErrors : []),
    ...(Array.isArray(mutation?.sideEffectsPending) && mutation.sideEffectsPending.length
      ? [{ code: "side-effects-pending", message: "Alcuni effetti visivi o di scena sono in attesa." }]
      : []),
  ].map((entry) => normalizedError(entry, "effects-side-effect-warning"));
}

function changedIdsFrom(plan, mutation) {
  return uniqueIds([
    ...plan.affectedIds,
    ...(mutation?.changedIds || []),
    ...plan.staticZoneSceneItemIds,
  ]);
}

export async function buildSpellAreaResolutionExecutionPlan(
  command,
  runtimeDependencies = {},
) {
  if (command?.type !== SPELL_AREA_RESOLUTION_COMMAND_TYPE) {
    return {
      valid: false,
      errors: [{ code: "command-type-invalid", message: "Comando spell ad area non valido." }],
    };
  }
  const runtime = defaultRuntime(runtimeDependencies);
  if (command.valid !== true) {
    return {
      valid: false,
      errors: errorList(command.errors, "command-invalid"),
      runtime,
    };
  }
  const lane = command.execution?.lane;
  const boardTokenLifecycle = lane === "spell-lifecycle"
    && command.execution?.hasTokens === true;
  if (lane !== "area-transaction" && lane !== "active-resolution" && !boardTokenLifecycle) {
    return {
      valid: false,
      errors: [{ code: "lane-incompatible", message: "Il comando non appartiene alla lane area-transaction." }],
      runtime,
    };
  }
  const expectedEpoch = command.source?.sceneEpoch;
  if (expectedEpoch !== null && expectedEpoch !== undefined
    && String(expectedEpoch) !== String(runtime.sceneEpoch)) {
    return {
      valid: false,
      errors: [{ code: "scene-epoch-mismatch", message: "La scena è cambiata durante la risoluzione." }],
      runtime,
    };
  }
  if (!runtime.isCurrent(runtime.sceneEpoch)) {
    return {
      valid: false,
      errors: [{ code: "scene-epoch-stale", message: "La scena non è più attiva." }],
      runtime,
    };
  }
  return buildPlan(command, runtime);
}

export async function executeSpellAreaResolution(
  command,
  runtimeDependencies = {},
) {
  const plan = await buildSpellAreaResolutionExecutionPlan(command, runtimeDependencies);
  if (!plan.valid) return resultBase(command, RESULT_STATUSES.REJECTED, { errors: plan.errors });
  const {
    runtime,
    entries,
    effectOperations,
    spellBoardTokenSideEffects,
  } = plan;
  if (!entries.length && !effectOperations.length
    && !plan.nextStaticZoneItems.length && !plan.requestedZoneTrigger) {
    return resultBase(command, RESULT_STATUSES.NOOP, {
      instanceId: plan.spellInstanceId,
      warnings: [],
    });
  }

  let hpVisualTransaction = null;
  const visualEvents = [];
  const warnings = [];
  let coordinatedMutation = null;
  let recordedEntry = null;
  let removedPreviousZone = false;
  let addedNextZone = false;
  let consumedZoneTrigger = false;
  const sceneEpoch = plan.operationSceneEpoch;
  const optimisticUpdates = quickHPVisualUpdates(entries);
  if (optimisticUpdates.length && runtime.isCurrent(sceneEpoch)) {
    hpVisualTransaction = createQuickHPVisualTransaction(optimisticUpdates, {
      syncVisuals: runtime.syncHPVisuals,
      onPreviewError: (error) => warnings.push(normalizedError(error, "hp-visual-preview")),
    });
  }
  if (plan.fireballVisualContext) {
    visualEvents.push({ type: "fireball", phase: "pre-commit", spellId: plan.spell.id });
    void runtime.emitFireballVisual(plan.fireballVisualContext).catch((error) => {
      warnings.push(normalizedError(error, "fireball-visual"));
    });
  }
  try {
    await runtime.withItemMetaHistory({
      kind: "save-resolution",
      label: `Effetti ad area · ${plan.spell.displayName || plan.spell.name || plan.spell.id}`,
      itemIds: plan.historyIds,
      sceneItemIds: plan.staticZoneSceneItemIds,
      fields: ["hp", "hpMax", "conditions", SPELLS_KEY, CONCENTRATION_KEY],
      onRecorded: (entry) => { recordedEntry = entry; },
      decorateEntry: (entry) => decorateCompositeEffectsHistoryEntry({
        entry,
        mutation: coordinatedMutation,
        effectMetadataFields: ["conditions", SPELLS_KEY, CONCENTRATION_KEY],
      }),
      sceneEpoch,
    }, async () => {
      try {
        if (!runtime.isCurrent(sceneEpoch)) throw new Error("scene-epoch-stale-before-commit");
        if (plan.previousStaticZoneItems.length) {
          await runtime.deleteItems(plan.previousStaticZoneItems.map((item) => item.id));
          removedPreviousZone = true;
        }
        if (plan.nextStaticZoneItems.length) {
          await runtime.addItems(plan.nextStaticZoneItems);
          addedNextZone = true;
        }
        await updateHP(runtime, entries);
        if (plan.requestedZoneTrigger) {
          await runtime.consumeZoneTrigger(plan.requestedZoneTrigger, runtime);
          consumedZoneTrigger = true;
        }
        const operations = [
          ...(plan.zeroHPReconcileIds.length ? [{
            type: "condition:reconcile-zero-hp",
            targetIds: plan.zeroHPReconcileIds,
          }] : []),
          ...effectOperations,
        ];
        if (operations.length || spellBoardTokenSideEffects.length) {
          coordinatedMutation = await runtime.runEffectsMutation(operations, {
            history: false,
            kind: "save-resolution",
            label: "Effetti collegati alla risoluzione spell",
            targetIds: uniqueIds([...plan.ids, ...plan.effectSubjectIds]),
            sideEffects: spellBoardTokenSideEffects,
            sceneEpoch,
          });
          runtime.requireAppliedEffectsMutation(coordinatedMutation);
          warnings.push(...warningsFromMutation(coordinatedMutation));
        }
      } catch (error) {
        if (addedNextZone) await runtime.deleteItems(plan.nextStaticZoneItems.map((item) => item.id)).catch(() => {});
        if (removedPreviousZone) await runtime.addItems(plan.previousStaticZoneItems).catch(() => {});
        if (consumedZoneTrigger) await runtime.restoreZoneTrigger(plan.triggerRootItems, runtime).catch(() => {});
        await restoreHPIfUnchanged(runtime, entries).catch(() => {});
        throw error;
      }
    });
  } catch (error) {
    if (hpVisualTransaction) {
      await hpVisualTransaction.recover((ids) => runtime.readAuthoritativeHPVisualUpdates(ids, sceneEpoch))
        .catch((recoveryError) => warnings.push(normalizedError(recoveryError, "hp-visual-recovery")));
    }
    return resultBase(command, RESULT_STATUSES.FAILED, {
      instanceId: plan.spellInstanceId,
      changedIds: [],
      warnings,
      errors: [normalizedError(error)],
      visualEvents,
    });
  }

  if (plan.matchedVisualContext) {
    visualEvents.push({ type: "matched-spell", phase: "post-commit", spellId: plan.spell.id });
    void runtime.emitMatchedSpellVisual(plan.matchedVisualContext).catch((error) => {
      warnings.push(normalizedError(error, "matched-spell-visual"));
    });
  }
  const hpChanges = hpResultChanges(entries);
  await Promise.all([
    runtime.syncHPBatchToMemory(entries.map((entry) => ({
      itemId: entry.item.id,
      hp: entry.change.afterHP,
      hpMax: entry.change.hpMax,
    })), {
      sceneEpoch,
      items: entries.map((entry) => entry.item),
    }).catch((error) => warnings.push(normalizedError(error, "hp-memory"))),
    Promise.resolve(runtime.onConcentrationWarnings(entries, plan))
      .catch((error) => warnings.push(normalizedError(error, "concentration-warning"))),
    Promise.resolve(runtime.onEffectSaveWarnings(entries, plan))
      .catch((error) => warnings.push(normalizedError(error, "effect-save-warning"))),
  ]);
  if (hpVisualTransaction) await hpVisualTransaction.completion;
  const history = await runtime.getHistoryEntries().catch(() => []);
  const undoAvailable = !!recordedEntry?.id
    && history.some((entry) => entry?.id === recordedEntry.id);
  return resultBase(command, RESULT_STATUSES.APPLIED, {
    instanceId: plan.spellInstanceId,
    changedIds: changedIdsFrom(plan, coordinatedMutation),
    hpChanges,
    effectChanges: serializableEffectChanges(coordinatedMutation),
    sceneItemChanges: serializableSceneChanges(plan),
    triggerChanges: triggerResultChanges(plan),
    historyEntryId: recordedEntry?.id,
    undoAvailable,
    visualEvents,
    warnings,
  });
}

export const SPELL_AREA_RESOLUTION_RESULT_STATUSES = RESULT_STATUSES;
