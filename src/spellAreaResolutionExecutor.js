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
import {
  resolveDamageEndsConditionRemovals,
  resolveZeroHPUnconsciousAction,
} from "./hpConditionRulesCore.js";
import { currentSceneEpoch, isCurrentSceneEpoch } from "./sceneEpoch.js";
import { currentInitiativeTurnKey } from "./turnBoundaryCore.js";
import {
  prismaticWallCastContext,
} from "./prismaticWallRules.js";
import {
  getAreaSaveAutomation,
  getSpellAttackResolution,
  getSpellDefinition,
  getSpellSummaryParts,
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
import { getSpellCastResolutionRule } from "./spellCastResolutionRules.js";
import {
  resolveTurbineTargetChains,
  turbineRestrainedOperations,
} from "./xanatharTurbineCore.js";
import { spellCasterHealingChange } from "./spellDamageHealingCore.js";
import { createSpellInstanceId } from "./spells.js";
import {
  confirmedSpellAreaTargetIds,
} from "./quickHpAreaWorkflowCore.js";
import {
  buildCallLightningCloudPreview,
} from "./spellAreaPlacementCore.js";
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
  protectStaticSpellZoneInstances,
  releaseStaticSpellZoneInstances,
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
  SPELL_BOARD_TOKEN_META_KEY,
  spellBoardTokenPlacementPosition,
} from "./spellBoardTokenCore.js";
import {
  getSpellTeleportRule,
  isTeleportSpell,
  spellTeleportDestinationPosition,
  spellTeleportDestinationForSubject,
  validateSpellTeleportPassenger,
} from "./spellTeleportCore.js";
import { expandAnimatedObjectComposition } from "./animatedObjectsCore.js";
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
import { buildSpellCausality } from "./combatLogCausalityCore.js";
import { syncHPBatchToMemory } from "./hpMemory.js";
import { syncHPBarNow, syncHPTextBatchNow } from "./hpbar-items.js";
import { emitFireballVisual } from "./fireballVisualRenderer.js";
import { emitMatchedSpellVisual } from "./embersMatchedVisualRenderer.js";
import { isMatchedSpellVisualSpell } from "./embersMatchedVisualCore.js";
import { PRISMATIC_SPRAY_SPELL_ID } from "./prismaticSprayRules.js";
import {
  consumeSpellZoneTrigger,
  pendingSpellZoneTriggerActivations,
} from "./spellZoneTriggerCore.js";
import {
  SPELL_AREA_RESOLUTION_COMMAND_TYPE,
} from "./spellAreaResolutionCommandCore.js";
import {
  DELAYED_BLAST_FIREBALL_ID,
  delayedBlastFireballCastContext,
  delayedBlastFireballSummaryParts,
  isDelayedBlastFireball,
} from "./delayedBlastFireballRules.js";
import { buildTerminationResumeOperation } from "./spellTerminationGatewayCore.js";

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

function teleportDestinationFromCommand(command, placement) {
  const explicit = command?.teleport?.destination;
  const x = Number(explicit?.x);
  const y = Number(explicit?.y);
  return Number.isFinite(x) && Number.isFinite(y)
    ? { x, y }
    : spellTeleportDestinationPosition(placement?.preview);
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
    status: status,
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
    ...(extra.committed === true ? { committed: true } : {}),
    ...(extra.partial === true ? { partial: true } : {}),
    ...(extra.postCommitPending === true ? { postCommitPending: true } : {}),
    ...(extra.stale === true ? { stale: true } : {}),
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
    // Usa la stessa chiave canonica del turn controller, così le active action
    // disponibili dal turno successivo non si aprono nel turno del cast.
    turnKey: currentInitiativeTurnKey(state),
  };
}

function normalizeFactor(value) {
  return value === "half" ? QUICK_HP_FACTORS.HALF : QUICK_HP_FACTORS.FULL;
}

function casterHealingEntryFromAppliedDamage({ entries = [], caster = null, ratio = 0 } = {}) {
  if (!trackedHP(caster)) return null;
  const meta = itemMeta(caster);
  const change = spellCasterHealingChange({
    damageChanges: (Array.isArray(entries) ? entries : []).map((entry) => entry?.change),
    ratio,
    hp: meta.hp,
    hpMax: meta.hpMax,
  });
  return change.changed ? { item: caster, change, outcome: "healing" } : null;
}

function prismaticSprayHPEntries(items, prismaticSprayPlan) {
  const contributionsByTarget = new Map();
  for (const contribution of prismaticSprayPlan?.damageContributions || []) {
    const targetId = text(contribution?.targetId);
    if (!targetId) continue;
    const entries = contributionsByTarget.get(targetId) || [];
    entries.push(clone(contribution));
    contributionsByTarget.set(targetId, entries);
  }
  return (Array.isArray(items) ? items : [])
    .filter(trackedHP)
    .map((item) => {
      const contributions = contributionsByTarget.get(text(item.id)) || [];
      if (!contributions.length) return null;
      const value = contributions.reduce(
        (total, contribution) => total + Math.max(0, Math.floor(Number(contribution.amount) || 0)),
        0,
      );
      const change = calculateQuickHPChange({
        mode: QUICK_HP_MODES.DAMAGE,
        value,
        factor: QUICK_HP_FACTORS.FULL,
        hp: itemMeta(item).hp,
        hpMax: itemMeta(item).hpMax,
      });
      return {
        item,
        outcome: prismaticSprayPlan.targetPlans
          ?.find((target) => target.targetId === item.id)?.outcome || "",
        change: {
          ...change,
          prismaticContributions: contributions,
        },
      };
    })
    .filter((entry) => entry?.change?.changed);
}

function hpEntries({ command, items, spell, prismaticSprayPlan = null }) {
  if (spell?.id === PRISMATIC_SPRAY_SPELL_ID && prismaticSprayPlan) {
    return prismaticSprayHPEntries(items, prismaticSprayPlan);
  }
  const hp = command?.hp || {};
  if (![QUICK_HP_MODES.DAMAGE, QUICK_HP_MODES.HEAL].includes(hp.mode)) return [];
  const amount = Math.max(0, Math.floor(Number(hp.amount) || 0));
  const primaryAmount = hp.primaryAmount === null || hp.primaryAmount === undefined
    ? 0
    : Math.max(0, Math.floor(Number(hp.primaryAmount) || 0));
  const primaryTargetId = text(hp.primaryTargetId || command?.targeting?.primaryTargetId);
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
      const areaChange = calculateQuickHPChange({
        mode,
        value: zeroDamage || outcome === SAVE_SPELL_OUTCOMES.IMMUNE ? 0 : amount,
        factor: factorName,
        hp: itemMeta(item).hp,
        hpMax: itemMeta(item).hpMax,
      });
      if (mode !== QUICK_HP_MODES.DAMAGE
        || targetId !== primaryTargetId
        || primaryAmount <= 0) {
        return { item, change: areaChange, outcome };
      }
      const primaryChange = calculateQuickHPChange({
        mode,
        value: primaryAmount,
        factor: hp.primaryDamageMode === "final-applied"
          ? QUICK_HP_FACTORS.FULL
          : normalizeFactor(hp.primaryOutcomeFactor),
        hp: itemMeta(item).hp,
        hpMax: itemMeta(item).hpMax,
      });
      const combinedChange = calculateQuickHPChange({
        mode,
        value: amount,
        factor: factorName,
        hp: primaryChange.afterHP,
        hpMax: itemMeta(item).hpMax,
      });
      return {
        item,
        outcome,
        change: {
          ...combinedChange,
          hp: primaryChange.hp,
          requested: primaryChange.requested + combinedChange.requested,
          delta: combinedChange.afterHP - primaryChange.hp,
          changed: combinedChange.afterHP !== primaryChange.hp,
          primaryRequested: primaryChange.requested,
          primaryFactor: primaryChange.factor,
          areaRequested: combinedChange.requested,
          areaFactor: combinedChange.factor,
        },
      };
    })
    .filter((entry) => entry.change.changed);
}

function castContextFor({ spell, resolution, command, mobileAura, boardToken, placement, caster }) {
  const hasActiveResolution = Array.isArray(spell?.activeActions)
    && spell.activeActions.some((action) => action?.resolutionKind);
  const spiritShroudContext = mobileAura && spell?.id === "tasha-sudario-spirituale"
    ? {
      ...(Number.isFinite(Number(command?.spell?.slotLevel))
        ? { slotLevel: Math.max(0, Math.floor(Number(command.spell.slotLevel))) }
        : {}),
      ...(text(command?.spell?.choiceValue)
        ? { choice: text(command.spell.choiceValue) }
        : {}),
    }
    : {};
  if (spell?.id === "prismatic-wall" && command?.source?.kind === "cast") {
    const requested = command?.spell?.castContext && typeof command.spell.castContext === "object"
      ? command.spell.castContext
      : {};
    const shape = String(
      placement?.ruleChoice
      || command?.spell?.choiceValue
      || requested?.prismaticWall?.shape
      || "wall",
    ).trim();
    const hasTargetSelection = Array.isArray(command?.targeting?.targetIds);
    const selectedExemptions = hasTargetSelection
      ? uniqueIds(command.targeting.targetIds)
      : uniqueIds([
        ...(Array.isArray(requested?.prismaticWall?.exemptCreatureIds)
          ? requested.prismaticWall.exemptCreatureIds
          : []),
        ...(Array.isArray(requested?.exemptCreatureIds)
          ? requested.exemptCreatureIds
          : []),
      ]);
    const effectiveCastContext = hasTargetSelection
      ? {
        ...requested,
        exemptCreatureIds: selectedExemptions,
        prismaticWall: {
          ...(requested?.prismaticWall && typeof requested.prismaticWall === "object"
            ? requested.prismaticWall
            : {}),
          exemptCreatureIds: selectedExemptions,
        },
      }
      : requested;
    return prismaticWallCastContext({
      castContext: effectiveCastContext,
      shape,
      ruleChoice: shape,
      casterId: command?.spell?.casterId || caster?.id,
      exemptCreatureIds: selectedExemptions,
    });
  }
  if (isDelayedBlastFireball(spell) && command?.source?.kind === "cast") {
    const previewPosition = placement?.preview?.position
      || placement?.preview?.origin
      || placement?.preview?.start
      || placement?.preview?.gridOrigin;
    const casterSaveDC = Number(caster?.metadata?.[META_KEY]?.initiativeCard?.spellSaveDC);
    return delayedBlastFireballCastContext({
      slotLevel: command?.spell?.slotLevel,
      position: previewPosition,
      spellSaveDC: command?.spell?.castContext?.spellSaveDC
        ?? (Number.isFinite(casterSaveDC) ? casterSaveDC : null),
      accumulatedDice: command?.spell?.castContext?.delayedBlastFireball?.accumulatedDice,
    });
  }
  if (!hasActiveResolution && !mobileAura && !boardToken
    && !resolution?.targeting && !resolution?.choice) return null;
  return {
    ...(command?.spell?.castContext && typeof command.spell.castContext === "object"
      ? clone(command.spell.castContext)
      : {}),
    ...(hasActiveResolution ? { slotLevel: command.spell.slotLevel } : {}),
    ...(mobileAura ? { mobileAura: true } : {}),
    ...spiritShroudContext,
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

function defaultSyncHPVisuals(updates = [], isCurrent = null) {
  if (typeof isCurrent === "function" && !isCurrent()) return;
  for (const update of updates) syncHPBarNow(update.tokenId, update.hp, update.hpMax);
  return syncHPTextBatchNow(updates);
}

async function defaultReadAuthoritativeHPVisualUpdates(
  itemIds = [],
  sceneEpoch = currentSceneEpoch(),
  isCurrent = null,
) {
  const current = typeof isCurrent === "function"
    ? () => isCurrent()
    : () => isCurrentSceneEpoch(sceneEpoch);
  if (!current()) return [];
  const ids = uniqueIds(itemIds);
  if (!ids.length) return [];
  const items = await OBR.scene.items.getItems(ids);
  if (!current()) return [];
  return items.filter(trackedHP).map((item) => ({
    tokenId: item.id,
    hp: Math.max(0, Math.floor(Number(itemMeta(item).hp) || 0)),
    hpMax: Math.max(0, Math.floor(Number(itemMeta(item).hpMax) || 0)),
  }));
}

function defaultRuntime(overrides = {}) {
  const epoch = currentSceneEpoch();
  const runtime = {
    sceneEpoch: epoch,
    visualSceneEpoch: epoch,
    isCurrent: (value = epoch) => isCurrentSceneEpoch(value),
    readItems: (ids = []) => ids.length ? OBR.scene.items.getItems(ids) : Promise.resolve([]),
    readAllItems: () => OBR.scene.items.getItems(),
    readSceneMetadata: () => OBR.scene.getMetadata(),
    updateItems: (ids, callback) => OBR.scene.items.updateItems(ids, callback),
    addItems: (items) => OBR.scene.items.addItems(items),
    deleteItems: (ids) => OBR.scene.items.deleteItems(ids),
    getStaticZoneItems: (selector) => getStaticSpellZoneItems(selector),
    getItemBounds: (ids = []) => OBR.scene.items.getItemBounds(ids),
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
    buildCallLightningCloudPlacement: async (_casterId, preview) => {
      const cloudPreview = buildCallLightningCloudPreview(preview);
      return cloudPreview
        ? {
          ruleId: "call-lightning:cloud",
          spellId: "call-lightning",
          preview: cloudPreview,
        }
        : null;
    },
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
  if (!Number.isInteger(overrides.visualSceneEpoch)) {
    runtime.visualSceneEpoch = runtime.sceneEpoch;
  }
  return runtime;
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

function zoneTriggerConsumeSideEffects(activation, rootItems = []) {
  const activationId = text(activation?.id || activation?.activationId);
  if (!activationId) return [];
  const targetId = uniqueIds(activation?.targetIds)[0] || "";
  return (Array.isArray(rootItems) ? rootItems : []).flatMap((item) => {
    const metadataKey = item?.metadata?.[SPELL_STATIC_ZONE_META_KEY]
      ? SPELL_STATIC_ZONE_META_KEY
      : item?.metadata?.[SPELL_AURA_META_KEY]
        ? SPELL_AURA_META_KEY
        : "";
    if (!item?.id || !metadataKey) return [];
    return [{
      type: "reminder:consume-zone-activation",
      itemId: item.id,
      metadataKey,
      activationId,
      ...(targetId ? { targetId } : {}),
    }];
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
    const placementChoice = text(
      command?.placement?.ruleChoice || command?.spell?.choiceValue,
    );
    return getSpellAreaRuleForPlacement(
      placementId,
      placementChoice,
    ) || getSpellAreaRuleById(placementId);
  }
  const triggerId = text(command?.execution?.zoneTrigger?.ruleId);
  if (triggerId) return getSpellAreaRuleById(triggerId);
  return getSpellAreaRules(spell?.id, { triggerType: "cast" })
    .find((rule) => rule.kind === "aura" || rule.kind === "zone" || rule.kind === "board-token")
    || null;
}

function auraMembershipOwnsCasterEffects(rule) {
  const targeting = rule?.zonePolicy?.membershipTargeting
    || rule?.targeting
    || {};
  const effectPolicy = rule?.effectPolicy || {};
  const hasMembershipEffects = !!effectPolicy.effect
    || (Array.isArray(effectPolicy.effects) && effectPolicy.effects.length > 0);
  return effectPolicy.mode === "while-inside"
    && targeting.includeCaster === true
    && hasMembershipEffects;
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
  const teleportRule = getSpellTeleportRule(spell.id);
  const commandTargetIds = uniqueIds(command?.targeting?.targetIds);
  const passengerId = text(
    command?.teleport?.passengerId
      || (teleportRule && commandTargetIds.length === 1 ? commandTargetIds[0] : ""),
  );
  const targetIds = uniqueIds([
    ...commandTargetIds,
    ...(teleportRule && passengerId ? [passengerId] : []),
  ]);
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
    ? allById.get(casterId)
      || liveById.get(casterId)
      || (await runtime.readItems([casterId]))[0]
      || null
    : null;
  const passenger = passengerId
    ? allById.get(passengerId) || liveById.get(passengerId) || null
    : null;
  if (teleportRule) {
    if (passengerId && !passenger) {
      return {
        valid: false,
        errors: [{
          code: "target-missing",
          message: `Passeggero non più presente: ${passengerId}.`,
        }],
      };
    }
    const passengerValidation = validateSpellTeleportPassenger({
      rule: teleportRule,
      caster,
      passenger,
    });
    if (!passengerValidation.valid) {
      return {
        valid: false,
        errors: errorList(passengerValidation.errors, "passenger-invalid"),
      };
    }
    if (command?.targeting?.spatialValidation?.passengerAdjacent === false) {
      return {
        valid: false,
        errors: [{
          code: "passenger-not-adjacent",
          message: "Il passeggero deve essere adiacente al caster.",
        }],
      };
    }
  }
  const teleportSubjectIds = teleportRule
    ? uniqueIds([casterId, passengerId])
    : [];
  const placement = command?.placement || null;
  const placementRuleChoice = text(
    placement?.ruleChoice || command?.spell?.choiceValue,
  );
  const placementRule = placementRuleFor(command, spell);
  const zoneTriggerResolution = command?.source?.kind === "zone-trigger";
  const mobileAura = !zoneTriggerResolution && placementRule?.kind === "aura";
  const mobileAuraMembershipOwnsCasterEffects = mobileAura
    && auraMembershipOwnsCasterEffects(placementRule);
  const boardToken = !zoneTriggerResolution && placementRule?.kind === "board-token";
  const cloudPending = spell.id === "call-lightning"
    && text(placement?.ruleId) === "call-lightning:cast";
  const terminalResolutionRequest = command?.source?.kind === "terminal-resolution";
  const staticZonePlacement = !zoneTriggerResolution
    && !terminalResolutionRequest
    && placementRule?.kind === "zone"
    && placement?.status === "confirmed";
  const delayedBlastFireballCast = isDelayedBlastFireball(spell)
    && command?.source?.kind === "cast"
    && text(command?.spell?.phase) === "cast";
  const targetScopedStaticZone = staticZonePlacement
    && placementRule?.zonePolicy?.targetScope === "spell-targets";
  const allowEmptyTargets = command?.targeting?.allowEmptyTargets === true
    || staticZonePlacement
    || mobileAura
    || boardToken
    || cloudPending
    || isTeleportSpell(spell.id);
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
  const directDamageCast = command?.source?.kind === "cast"
    && text(command?.spell?.phase) === "cast"
    && getSpellCastResolutionRule(spell)?.resolution === "manual-damage";
  const configuredAutomation = command?.automation
    || getAreaSaveAutomation(spell, text(command?.spell?.choiceValue))
    || spell.saveAutomation
    || null;
  const suppressInitialZoneAutomation = staticZonePlacement
    && placementRule?.zonePolicy?.initialResolution === "none";
  const automation = suppressInitialZoneAutomation
    ? {
      ...(configuredAutomation?.concentrationAction
        ? { concentrationAction: configuredAutomation.concentrationAction }
        : {}),
      trackOutcomes: [],
    }
    : configuredAutomation;
  let validation;
  try {
    validation = await runtime.validateSpatial({
      command,
      spell,
      items: allItems,
      targetIds,
      caster,
    });
  } catch (error) {
    if (!teleportRule) throw error;
    // Range/occupancy/visibility decisions that cannot be measured by the
    // plugin stay GM-assisted. The explicit destination and the shared
    // teleport side effect remain executable; a deterministic validation
    // result is still honored above this fallback.
    validation = {
      valid: true,
      errors: [],
      unavailable: true,
      diagnostic: error?.message || error?.name || "spatial-validation-unavailable",
    };
  }
  if (validation?.valid === false) {
    return {
      valid: false,
      errors: errorList(validation.errors, "spatial-validation-failed"),
    };
  }
  const resolution = teleportRule
    ? {
      valid: true,
      errors: [],
      spellId: spell.id,
      spellName: spell.displayName || spell.name,
      concentration: false,
      casterId,
      targetIds,
      spellTargetIds: [],
      conditionApplications: [],
    }
    : terminalResolutionRequest
    ? {
      valid: true,
      errors: [],
      spellId: spell.id,
      spellName: spell.displayName || spell.name,
      concentration: false,
      casterId,
      targetIds,
      spellTargetIds: [],
      conditionApplications: [],
    }
    : delayedBlastFireballCast
    ? {
      valid: true,
      errors: [],
      spellId: spell.id,
      spellName: spell.displayName || spell.name,
      concentration: spell.concentration === true,
      casterId,
      targetIds: [],
      spellTargetIds: casterId ? [casterId] : [],
      persistence: { owner: "caster" },
      conditionApplications: [],
    }
    : attackResolution
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
    : directDamageCast
      ? {
        valid: true,
        errors: [],
        spellId: spell.id,
        spellName: spell.displayName || spell.name,
        concentration: spell.concentration === true,
        casterId,
        targetIds,
        spellTargetIds: [...targetIds],
        conditionApplications: Array.isArray(command?.resolution?.conditionApplications)
          ? command.resolution.conditionApplications
          : [],
      }
    : resolveSaveSpellResolution({
      spell,
      casterId,
      targetIds,
      outcomes: command?.outcomes?.required
        ? outcomes
        : saveWorkflowRule?.manualSaveAtTable === true
          ? new Map(targetIds.map((id) => [
            id,
            outcomes.get(id) || saveWorkflowRule.assumedOutcome || SAVE_SPELL_OUTCOMES.FAILED,
          ]))
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
      ignoreTargetLimit: command?.targeting?.ignoreTargetLimit === true,
    });
  if (!resolution.valid) {
    return { valid: false, errors: errorList(resolution.errors, "spell-resolution-invalid") };
  }

  const turbineChains = spell.id === "xanathar-turbine" && !zoneTriggerResolution
    ? resolveTurbineTargetChains({
      targetIds,
      outcomes,
      targetContexts,
      targetItems: liveItems,
      gridDpi: placement?.preview?.dpi,
    })
    : null;
  if (turbineChains && !turbineChains.valid) {
    return {
      valid: false,
      errors: turbineChains.errors.map((error) => ({
        code: error.code,
        message: `${error.targetId}: ${error.message}`,
      })),
    };
  }

  const stateMetadata = await runtime.readSceneMetadata();
  const appliedAt = appliedAtForState(
    stateMetadata?.[`${ID}/state`] || {},
    await runtime.getInitiativeActorId(),
  );
  const activeConcentration = activeConcentrationForSpell(caster, spell);
  if (terminalResolutionRequest) {
    const parentInstanceId = text(command?.source?.parentInstanceId);
    const requestId = text(command?.source?.requestId);
    const pending = activeConcentration?.pendingTermination;
    if (!parentInstanceId || !requestId
      || text(activeConcentration?.instanceId) !== parentInstanceId
      || text(pending?.instanceId) !== parentInstanceId
      || text(pending?.requestId) !== requestId) {
      return {
        valid: false,
        errors: [{
          code: "terminal-resolution-stale",
          message: "La risoluzione terminale non è più attiva per questa istanza.",
        }],
      };
    }
  }
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
    resolved.spellTargetIds = boardToken && placementRule?.boardToken?.spellOwner === "caster"
      ? [casterId]
      : mobileAura && placementRule?.targeting?.confirmTargets === false
        ? [casterId]
        : uniqueIds([...resolved.spellTargetIds, casterId]);
  }
  const effectSubjectIds = uniqueIds([
    ...resolved.spellTargetIds,
    ...(resolved.conditionApplications || []).flatMap((application) => application.targetIds || []),
    ...teleportSubjectIds,
  ]);
  let effectOperations = [];
  if (terminalResolutionRequest) {
    spellInstanceId = text(command?.source?.parentInstanceId);
    concentrationAction = "terminal";
  } else if (trigger) {
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
        placement,
        caster,
      }),
      summaryParts: getSpellSummaryParts(
        spell,
        text(command?.spell?.choiceValue),
        castContextFor({
          spell,
          resolution: resolved,
          command,
          mobileAura,
          boardToken,
          placement,
          caster,
        }) || { slotLevel: command?.spell?.slotLevel },
      ),
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
      // Se la membership include il caster, il controller dell’aura applica
      // già l’effetto condiviso sul caster. Gli effetti personali restano
      // soltanto per le aure che lo escludono dalla membership.
      const personalEffects = mobileAuraMembershipOwnsCasterEffects
        ? []
        : spell.effects
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

  if (turbineChains?.captureTargetIds?.length) {
    effectOperations.push(...turbineRestrainedOperations({
      targetIds: turbineChains.captureTargetIds,
      parentEffectId: spellInstanceId,
      sourceId: casterId,
      sourceName: itemName(caster),
      spellName: spell.displayName || spell.name,
      spellId: spell.id,
      appliedAt,
    }));
  }

  if (terminalResolutionRequest) {
    effectOperations.push(buildTerminationResumeOperation({
      casterId,
      instanceId: spellInstanceId,
      requestId: text(command?.source?.requestId),
    }));
    effectSubjectIds.push(casterId);
  }

  const teleportDestination = teleportRule
    ? teleportDestinationFromCommand(command, placement)
    : null;
  const teleportOperationId = text(
    command?.commandId
      || command?.correlationId
      || runtime.operationId
      || runtime.commandId,
  );
  const teleportOrigin = caster?.position
    && Number.isFinite(Number(caster.position.x))
    && Number.isFinite(Number(caster.position.y))
    ? {
      x: Number(caster.position.x),
      y: Number(caster.position.y),
    }
    : null;
  const passengerRelativeOffset = command?.teleport?.passengerRelativeOffset
    && Number.isFinite(Number(command.teleport.passengerRelativeOffset.x))
    && Number.isFinite(Number(command.teleport.passengerRelativeOffset.y))
    ? {
      x: Number(command.teleport.passengerRelativeOffset.x),
      y: Number(command.teleport.passengerRelativeOffset.y),
    }
    : null;
  const livePassengerDestination = passengerId && teleportDestination
    ? spellTeleportDestinationForSubject(
      teleportDestination,
      teleportOrigin,
      passenger?.position,
    )
    : null;
  const passengerDestination = passengerId && teleportDestination
    ? livePassengerDestination
      || (passengerRelativeOffset ? {
        x: teleportDestination.x + passengerRelativeOffset.x,
        y: teleportDestination.y + passengerRelativeOffset.y,
      } : null)
    : null;
  if (teleportRule && passengerId && !passengerDestination) {
    return {
      valid: false,
      errors: [{
        code: "passenger-relative-position-missing",
        message: "La posizione relativa del passeggero non è disponibile.",
      }],
    };
  }
  const teleportSideEffects = teleportRule && teleportDestination && casterId
    ? teleportSubjectIds.map((targetId) => ({
      type: "token:teleport",
      spellId: spell.id,
      targetId,
      position: targetId === casterId ? teleportDestination : passengerDestination,
      skipAnimation: true,
      ...(teleportOperationId ? { operationId: teleportOperationId } : {}),
    }))
    : [];

  const visualSceneEpoch = Number.isInteger(runtime.visualSceneEpoch)
    ? runtime.visualSceneEpoch
    : runtime.sceneEpoch;

  const fireballVisualContext = spell.id === "fireball" && placement?.preview
    ? {
      casterId,
      eventId: spellInstanceId,
      preview: clone(placement.preview),
      sceneEpoch: visualSceneEpoch,
    }
    : null;
  let matchedVisualContext = null;
  const chainLightningVisualTargetIds = uniqueIds(command?.targeting?.targetIds);
  const matchedVisualPlacementChoice = text(
    command?.spell?.choiceValue || placement?.ruleChoice,
  );
  if (teleportRule && teleportDestination) {
    matchedVisualContext = {
      spellId: spell.id,
      casterId,
      targetIds: casterId ? [casterId] : [],
      eventId: spellInstanceId,
      lifecycleId: spellInstanceId,
      preview: {
        destination: teleportDestination,
        origin: teleportOrigin || teleportDestination,
        start: teleportDestination,
        end: teleportDestination,
        type: "circle",
      },
      sceneEpoch: visualSceneEpoch,
    };
  } else if (spell.id === "chain-lightning" && chainLightningVisualTargetIds.length) {
    matchedVisualContext = {
      spellId: spell.id,
      casterId,
      targetIds: chainLightningVisualTargetIds,
      eventId: spellInstanceId,
      lifecycleId: spellInstanceId,
      sceneEpoch: visualSceneEpoch,
    };
  } else if (
    !placement?.preview
    && isMatchedSpellVisualSpell(spell.id)
    && resolved.spellTargetIds.length
  ) {
    matchedVisualContext = {
      spellId: spell.id,
      casterId,
      targetIds: resolved.spellTargetIds,
      eventId: spellInstanceId,
      lifecycleId: spellInstanceId,
      sceneEpoch: visualSceneEpoch,
    };
  } else if (placement?.preview && !teleportRule && !boardToken && spell.id !== "call-lightning") {
    const matchedVisualPreview = clone(placement.preview);
    if (spell.id === "wall-of-fire" && placementRule?.geometry?.widthAnchor) {
      matchedVisualPreview.widthAnchor = placementRule.geometry.widthAnchor;
    }
    matchedVisualContext = {
      spellId: spell.id,
      casterId,
      targetIds: resolved.spellTargetIds,
      eventId: spellInstanceId,
      lifecycleId: spellInstanceId,
      preview: matchedVisualPreview,
      ...(matchedVisualPlacementChoice
        ? { placementChoice: matchedVisualPlacementChoice }
        : {}),
      sceneEpoch: visualSceneEpoch,
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
  // La baseline dei trigger di una zona è la membership geometrica al cast,
  // non soltanto i target che il save workflow decide di tracciare.
  // Spell come Unto usano track:false: senza questa baseline, i token già
  // presenti al cast verrebbero scambiati per nuovi ingressi al primo reconcile.
  const staticZoneCastMemberIds = staticZonePlacement
    ? targetScopedStaticZone
      ? staticZoneTargetIds
      : confirmedSpellAreaTargetIds(placement, allItems.map((item) => item.id))
    : [];
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
      ruleChoice: placementRuleChoice,
      slotLevel: command?.spell?.slotLevel,
      castContext: castContextFor({
        spell,
        resolution: resolved,
        command,
        mobileAura,
        boardToken,
        placement,
        caster,
      }),
      summaryParts: getSpellSummaryParts(
        spell,
        placementRuleChoice,
        castContextFor({
          spell,
          resolution: resolved,
          command,
          mobileAura,
          boardToken,
          placement,
          caster,
        }) || { slotLevel: command?.spell?.slotLevel },
      ),
    });
    if (ownerOperation) effectOperations.push(ownerOperation);
    const passiveTargetIds = staticZoneCastMemberIds;
    // Muro di Luce usa la membership dinamica della zona come unica fonte
    // della pill sui token. Applicarla anche qui al commit del cast può
    // concorrere con il primo reconcile e creare due istanze identiche.
    const runtimeOwnedZoneMembership = spell.id === "xanathar-muro-di-luce";
    if (!runtimeOwnedZoneMembership) {
      const membershipItems = Array.isArray(runtime.targetItems) && runtime.targetItems.length
        ? runtime.targetItems
        : allItems;
      const passivePlan = areaMembershipPlan({
        instanceId: spellInstanceId,
        sourceId: casterId,
        rule: placementRule,
        ruleChoice: placementRuleChoice,
        desiredTargetIds: passiveTargetIds,
        items: membershipItems,
        metaKey: META_KEY,
        sourceName: itemName(caster),
        defaultExpiry: { mode: "manual" },
      });
      effectOperations.push(...passivePlan.operations);
    }
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
  const compositionKey = text(placementRule?.composition?.key) || "composition";
  const compositionObjects = boardToken && placementRule?.composition
    ? expandAnimatedObjectComposition(command?.spell?.castContext?.[compositionKey])
    : [];
  const batchPlacements = boardToken && placementRule?.composition
    ? (Array.isArray(placement?.preview?.positions) ? placement.preview.positions : [])
      .map((entry, index) => ({
        position: spellBoardTokenPlacementPosition(entry),
        objectSize: text(entry?.objectSize || compositionObjects[index]?.id),
        ordinal: Number.isInteger(Number(entry?.ordinal)) ? Number(entry.ordinal) : index,
      }))
      .filter((entry) => entry.position)
    : boardToken
      ? [{ position: spellBoardTokenPlacementPosition(placement?.preview), objectSize: "", ordinal: 0 }]
      : [];
  if (boardToken && placementRule?.composition
    && (batchPlacements.length !== compositionObjects.length
      || compositionObjects.some((object, index) => (
        text(batchPlacements[index]?.objectSize) !== object.id
      )))) {
    return {
      valid: false,
      errors: [{
        code: "animated-objects-placement-incomplete",
        message: "Ogni oggetto animato deve avere una posizione confermata.",
      }],
    };
  }
  const boardTokenEntityIds = batchPlacements.map(() => createSpellBoardTokenId());
  const boardTokenEntityId = boardTokenEntityIds[0] || "";
  const spellBoardTokenSideEffects = [
    ...teleportSideEffects,
    ...(breaksExistingConcentration ? [{
      type: "static-zone:remove-ended",
      selectors: [{ casterId }],
    }] : []),
    ...batchPlacements.map((entry, index) => ({
      type: "spell-board-token:place",
      entityId: boardTokenEntityIds[index],
      spellId: spell.id,
      instanceId: spellInstanceId,
      casterId,
      slotLevel: command?.spell?.slotLevel,
      position: entry.position,
      ...(entry.objectSize ? { objectSize: entry.objectSize } : {}),
      ...(placementRule?.composition ? { batch: true } : {}),
    })),
  ];
  const previousStaticZoneItems = terminalResolutionRequest
    ? await runtime.getStaticZoneItems({ instanceId: spellInstanceId })
    : breaksExistingConcentration
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
      ruleChoice: placementRuleChoice,
      targetIds: staticZoneCastMemberIds,
      exemptCreatureIds: castContextFor({
        spell,
        resolution: resolved,
        command,
        mobileAura,
        boardToken,
        placement,
        caster,
      })?.prismaticWall?.exemptCreatureIds || [],
      followCaster: placementRule?.zonePolicy?.followCaster === true,
      casterOrigin: caster?.position,
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
  const teleportHPItems = liveItems;
  const entries = hpEntries({
    command,
    items: teleportHPItems,
    spell,
    prismaticSprayPlan: resolution.prismaticSpray,
  });
  const casterHealingRatio = Number(getSpellCastResolutionRule(spell.id)?.casterHealingFromAppliedDamage) || 0;
  const casterHealingEntry = casterHealingEntryFromAppliedDamage({
    entries,
    caster,
    ratio: casterHealingRatio,
  });
  if (casterHealingEntry && !entries.some((entry) => entry.item?.id === casterHealingEntry.item?.id)) {
    entries.push(casterHealingEntry);
  }
  const zeroHPBoardTokenIds = uniqueIds(entries
    .filter((entry) => (
      entry.change.afterHP === 0
      && entry.item?.layer === "PROP"
      && entry.item?.metadata?.[SPELL_BOARD_TOKEN_META_KEY]?.kind === "spell-board-token"
    ))
    .map((entry) => entry.item.id));
  const damageEndsRemovals = entries
    .filter((entry) => entry.change?.afterHP < entry.change?.hp)
    .flatMap((entry) => {
      const meta = itemMeta(entry.item);
      const instances = getConditionInstances(meta.conditions || {});
      const removalIds = resolveDamageEndsConditionRemovals(instances);
      return removalIds.map((instanceId) => ({
        itemId: entry.item.id,
        instanceId,
      }));
    });
  const zeroHPReconcileIds = quickHPZeroReconcileTargetIds(
    entries.filter((entry) => !zeroHPBoardTokenIds.includes(entry.item.id)),
    (entry) => {
      const meta = itemMeta(entry.item);
      return resolveZeroHPUnconsciousAction({
        ...meta,
        hp: entry.change.afterHP,
        hpMax: entry.change.hpMax,
      }, getConditionInstances(meta.conditions || {}));
    },
  );
  spellBoardTokenSideEffects.push(...zeroHPBoardTokenIds.map((itemId) => ({
    type: "spell-board-token:remove",
    itemId,
  })));
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
    ...(command?.source?.kind === "prepared-resolution" && casterId ? [casterId] : []),
    ...(cloudPlacement || teleportRule ? teleportSubjectIds : []),
    ...await runtime.getZeroHPConditionHistoryIds(ids),
  ]);
  const staticZoneSceneItemIds = uniqueIds([
    ...previousStaticZoneItems.map((item) => item.id),
    ...nextStaticZoneItems.map((item) => item.id),
    ...previousBoardTokenItems.map((item) => item.id),
    ...boardTokenEntityIds,
    ...zeroHPBoardTokenIds,
    ...triggerRootItems.map((item) => item.id),
    ...(teleportRule ? teleportSubjectIds : []),
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
    boardTokenEntityIds,
    spellBoardTokenSideEffects,
    zeroHPReconcileIds,
    damageEndsRemovals,
    affectedIds,
    historyIds,
    staticZoneSceneItemIds,
    fireballVisualContext,
    matchedVisualContext,
    prismaticSprayPlan: resolution.prismaticSpray || null,
    ...(turbineChains ? { turbineChains } : {}),
    appliedAt,
    hpMode: command?.hp?.mode,
    operationSceneEpoch: runtime.sceneEpoch,
  };
}

function causalDamageFactor(value) {
  const number = Number(value);
  if (Number.isFinite(number)) return number;
  return {
    zero: 0,
    none: 0,
    quarter: 0.25,
    half: 0.5,
    full: 1,
    double: 2,
  }[text(value).toLocaleLowerCase("it")];
}

function spellAreaCausality(plan) {
  const command = plan?.command || {};
  const allItems = Array.isArray(plan?.allItems) ? plan.allItems : [];
  const itemsById = new Map(allItems.map((item) => [String(item?.id || ""), item]));
  const changesById = new Map((Array.isArray(plan?.entries) ? plan.entries : [])
    .map((entry) => [String(entry?.item?.id || ""), entry]));
  const teleportRule = getSpellTeleportRule(plan?.spell?.id);
  const targetIds = uniqueIds([
    ...(command?.targeting?.targetIds || []),
    ...(plan?.effectSubjectIds || []),
    ...(plan?.ids || []),
    ...(teleportRule && plan?.caster?.id ? [plan.caster.id] : []),
  ]);
  const outcomeMap = command?.outcomes?.byTarget || {};
  const hpMode = text(command?.hp?.mode);
  const rawAmount = Number(command?.hp?.amount);
  const hasRawDamage = hpMode === QUICK_HP_MODES.DAMAGE && Number.isFinite(rawAmount);
  const targets = targetIds.map((id) => {
    const item = itemsById.get(id);
    const entry = changesById.get(id);
    const change = entry?.change;
    const outcome = text(outcomeMap?.[id]);
    const factor = change?.factor !== undefined
      ? causalDamageFactor(change.factor)
      : hasRawDamage
        ? causalDamageFactor(command?.hp?.outcomeFactors?.[id] || (
          outcome === SAVE_SPELL_OUTCOMES.IMMUNE ? "zero" : "full"
        ))
        : undefined;
    const requestedDamage = change?.requested !== undefined
      ? Number(change.requested)
      : hasRawDamage && factor !== undefined
        ? Math.floor(Math.max(0, rawAmount) * factor)
        : undefined;
    const meta = itemMeta(item);
    const appliedHpDelta = change?.delta !== undefined
      ? Number(change.delta)
      : hasRawDamage
        && Object.prototype.hasOwnProperty.call(meta, "hp")
        && Number.isFinite(Number(meta.hp))
        ? 0
        : undefined;
    return {
      id,
      ...(item?.name ? { name: item.name } : {}),
      ...(outcome ? { outcome } : {}),
      ...(Number.isFinite(requestedDamage) ? { requestedDamage } : {}),
      ...(Number.isFinite(appliedHpDelta) ? { appliedHpDelta } : {}),
      ...(factor !== undefined ? { damageFactor: factor } : {}),
      ...(Array.isArray(change?.prismaticContributions)
        ? { damageContributions: clone(change.prismaticContributions) }
        : {}),
    };
  });
  const placement = command?.placement || {};
  const trigger = plan?.requestedZoneTrigger || command?.execution?.zoneTrigger;
  const zone = trigger
    ? {
      action: "resolve",
      zoneItemId: trigger.zoneItemId,
      ruleId: trigger.ruleId,
    }
    : placement?.ruleId
      ? {
        action: "place",
        zoneItemId: placement.zoneItemId,
        ruleId: placement.ruleId,
      }
      : undefined;
  const concentrationAction = plan?.spell?.concentration === true
    || ["dismiss", "end", "break", "trigger", "extend"].includes(plan?.concentrationAction)
    ? plan?.concentrationAction
    : undefined;
  const attackOutcome = text(command?.outcomes?.attack);
  const primaryTargetId = text(
    command?.targeting?.primaryTargetId || command?.hp?.primaryTargetId,
  );
  const primaryAmount = Number(command?.hp?.primaryAmount);
  const primaryFactor = causalDamageFactor(command?.hp?.primaryOutcomeFactor);
  return {
    source: "spell-area",
    spellId: plan?.spell?.id || "",
    spellName: plan?.spell?.displayName || plan?.spell?.name || plan?.spell?.id || "",
    casterId: plan?.caster?.id || "",
    ...(plan?.caster?.name ? { casterName: plan.caster.name } : {}),
    ...(teleportRule
      ? {
        teleport: true,
        destination: teleportDestinationFromCommand(command, placement),
        ...(command?.teleport?.passengerId
          ? { passengerId: text(command.teleport.passengerId) }
          : {}),
        ...(command?.teleport?.passengerRelativeOffset
          ? { passengerRelativeOffset: clone(command.teleport.passengerRelativeOffset) }
          : {}),
      }
      : {}),
    targets,
    outcomes: outcomeMap,
    ...(attackOutcome ? { attackOutcome } : {}),
    ...(primaryTargetId ? { primaryTargetId } : {}),
    ...(Number.isFinite(primaryAmount) && primaryAmount >= 0
      ? {
        primaryDamage: {
          targetId: primaryTargetId || undefined,
          requestedDamage: Math.max(0, Math.floor(primaryAmount)),
          ...(primaryFactor !== undefined ? { damageFactor: primaryFactor } : {}),
        },
      }
      : {}),
    damageRoll: hasRawDamage ? Math.max(0, Math.floor(rawAmount)) : undefined,
    concentrationAction,
    concentrationInstanceId: plan?.spellInstanceId,
    zone,
    reminder: trigger?.activationId ? { activationId: trigger.activationId } : undefined,
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
    ...(entry.change.primaryRequested !== undefined
      ? {
        primaryRequested: entry.change.primaryRequested,
        primaryFactor: entry.change.primaryFactor,
        areaRequested: entry.change.areaRequested,
        areaFactor: entry.change.areaFactor,
      }
      : {}),
    outcome: entry.outcome || null,
    ...(Array.isArray(entry.change.prismaticContributions)
      ? { damageContributions: clone(entry.change.prismaticContributions) }
      : {}),
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
  if (
    command?.source?.kind === "prepared-resolution"
    && command?.spell?.spellId === "phb2014-raffica-di-spine"
    && command?.outcomes?.attack === "miss"
  ) {
    return {
      ...resultBase(command, RESULT_STATUSES.NOOP, {}),
      instanceId: plan.spellInstanceId,
      pending: true,
      reason: "prepared-attack-miss",
    };
  }
  const {
    runtime,
    entries,
    effectOperations,
    spellBoardTokenSideEffects,
  } = plan;
  if (!entries.length && !effectOperations.length
    && !plan.nextStaticZoneItems.length && !plan.requestedZoneTrigger
    && !spellBoardTokenSideEffects.length
    && !plan.fireballVisualContext
    && !plan.matchedVisualContext) {
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
  let canonicalCommitted = false;
  let suppressMatchedVisual = false;
  let teleportHistoryPending = false;
  const sceneEpoch = plan.operationSceneEpoch;
  const optimisticUpdates = quickHPVisualUpdates(entries);
  if (optimisticUpdates.length && runtime.isCurrent(sceneEpoch)) {
    hpVisualTransaction = createQuickHPVisualTransaction(optimisticUpdates, {
      syncVisuals: (updates) => runtime.syncHPVisuals(
        updates,
        () => runtime.isCurrent(sceneEpoch),
      ),
      onPreviewError: (error) => warnings.push(normalizedError(error, "hp-visual-preview")),
    });
  }
  if (plan.fireballVisualContext) {
    visualEvents.push({ type: "fireball", phase: "pre-commit", spellId: plan.spell.id });
    void runtime.emitFireballVisual(plan.fireballVisualContext).catch((error) => {
      warnings.push(normalizedError(error, "fireball-visual"));
    });
  }
  const pendingZoneInstanceIds = uniqueIds(plan.nextStaticZoneItems.map((item) => (
    item?.metadata?.[SPELL_STATIC_ZONE_META_KEY]?.instanceId
  )));
  if (pendingZoneInstanceIds.length) {
    protectStaticSpellZoneInstances(pendingZoneInstanceIds);
  }
  try {
    const isTeleport = isTeleportSpell(plan.spell.id);
    let historyResult;
    if (isTeleport) {
      const hpUpdates = entries.map((entry) => ({
        itemId: entry.item.id,
        hp: entry.change.afterHP,
        hpMax: entry.change.hpMax,
        expectedHP: entry.change.hp,
        expectedHPMax: entry.change.hpMax,
      }));
      const operations = [
        ...(hpUpdates.length ? [{
          type: "hp:set",
          updates: hpUpdates,
        }] : []),
        ...(plan.zeroHPReconcileIds.length ? [{
          type: "condition:reconcile-zero-hp",
          targetIds: plan.zeroHPReconcileIds,
        }] : []),
        ...(plan.damageEndsRemovals?.length ? [{
          type: "condition:remove-instances",
          removals: plan.damageEndsRemovals,
        }] : []),
        ...effectOperations,
      ];
      const coordinatedSideEffects = spellBoardTokenSideEffects;
      const mutation = await runtime.runEffectsMutation(operations, {
        history: {
          kind: "spell",
          label: `Lancio incantesimo · ${plan.spell.displayName || plan.spell.name || "Porta Dimensionale"}`,
          payload: { causality: spellAreaCausality(plan) },
        },
        kind: "spell",
        label: `Lancio incantesimo · ${plan.spell.displayName || plan.spell.name || "Porta Dimensionale"}`,
        targetIds: uniqueIds([
          ...plan.ids,
          ...plan.effectSubjectIds,
          plan.caster?.id,
          plan.command?.teleport?.passengerId,
        ]),
        sideEffects: coordinatedSideEffects,
        sceneEpoch,
        ...(runtime.sceneIdentity ? { sceneIdentity: runtime.sceneIdentity } : {}),
        ...((command?.commandId || runtime.operationId)
          ? { commandId: command.commandId || runtime.operationId }
          : {}),
        ...((command?.correlationId || command?.commandId || runtime.operationId)
          ? { correlationId: command.correlationId || command.commandId || runtime.operationId }
          : {}),
      });
      if (!runtime.isCurrent(sceneEpoch)) throw new Error("scene-epoch-stale-after-teleport");
      runtime.requireAppliedEffectsMutation(mutation);
      coordinatedMutation = mutation.commitResult || mutation;
      canonicalCommitted = mutation.committed === true
        || mutation.commitResult?.committed === true;
      recordedEntry = mutation.historyEntry || null;
      suppressMatchedVisual = mutation.duplicate === true;
      teleportHistoryPending = mutation.historyPending === true;
      warnings.push(...warningsFromMutation(mutation));
      historyResult = {
        partial: false,
        committed: canonicalCommitted,
        historyEntryId: recordedEntry?.id || null,
        historyPending: mutation.historyPending === true,
        changes: mutation.changes || mutation.commitResult?.changes || [],
      };
    } else {
      historyResult = await runtime.withItemMetaHistory({
        kind: "save-resolution",
        label: `Effetti ad area · ${plan.spell.displayName || plan.spell.name || plan.spell.id}`,
      itemIds: plan.historyIds,
      sceneItemIds: plan.staticZoneSceneItemIds,
      fields: ["hp", "hpMax", "conditions", SPELLS_KEY, CONCENTRATION_KEY],
      onRecorded: (entry) => { recordedEntry = entry; },
      decorateEntry: (entry) => {
        const decorated = decorateCompositeEffectsHistoryEntry({
          entry,
          mutation: coordinatedMutation,
          effectMetadataFields: ["conditions", SPELLS_KEY, CONCENTRATION_KEY],
        });
        return {
          ...decorated,
          payload: {
            ...(decorated?.payload || {}),
            causality: spellAreaCausality(plan),
          },
        };
      },
      sceneEpoch,
      isCurrent: () => runtime.isCurrent(sceneEpoch),
    }, async () => {
      try {
        if (!runtime.isCurrent(sceneEpoch)) throw new Error("scene-epoch-stale-before-commit");
        if (plan.previousStaticZoneItems.length) {
          await runtime.deleteItems(plan.previousStaticZoneItems.map((item) => item.id));
          removedPreviousZone = true;
          canonicalCommitted = true;
          if (!runtime.isCurrent(sceneEpoch)) throw new Error("scene-epoch-stale-after-zone-delete");
        }
        await updateHP(runtime, entries);
        if (entries.length) {
          canonicalCommitted = true;
          if (!runtime.isCurrent(sceneEpoch)) throw new Error("scene-epoch-stale-after-hp-commit");
        }
        const operations = [
          ...(plan.zeroHPReconcileIds.length ? [{
            type: "condition:reconcile-zero-hp",
            targetIds: plan.zeroHPReconcileIds,
          }] : []),
          ...(plan.damageEndsRemovals?.length ? [{
            type: "condition:remove-instances",
            removals: plan.damageEndsRemovals,
          }] : []),
          ...effectOperations,
        ];
        const zoneTriggerSideEffects = plan.requestedZoneTrigger
          ? zoneTriggerConsumeSideEffects(plan.requestedZoneTrigger, plan.triggerRootItems)
          : [];
        const coordinatedSideEffects = [
          ...spellBoardTokenSideEffects,
          ...zoneTriggerSideEffects,
        ];
        const commitCoordinatedEffects = async () => {
          if (!operations.length && !coordinatedSideEffects.length) return true;
          coordinatedMutation = await runtime.runEffectsMutation(operations, {
            history: false,
            kind: isTeleport ? "spell" : "save-resolution",
            label: isTeleport
              ? `Lancio incantesimo · ${plan.spell.displayName || plan.spell.name || "Passo Velato"}`
              : "Effetti collegati alla risoluzione spell",
            targetIds: uniqueIds([
              ...plan.ids,
              ...plan.effectSubjectIds,
              ...(isTeleport
                ? [plan.caster?.id, plan.command?.teleport?.passengerId]
                : []),
            ]),
            sideEffects: coordinatedSideEffects,
            ...(runtime.sceneIdentity ? { sceneIdentity: runtime.sceneIdentity } : {}),
            ...((command?.commandId || runtime.operationId)
              ? { commandId: command.commandId || runtime.operationId }
              : {}),
            ...((command?.correlationId || command?.commandId || runtime.operationId)
              ? { correlationId: command.correlationId || command.commandId || runtime.operationId }
              : {}),
          });
          if (coordinatedMutation?.committed === true
            || coordinatedMutation?.commitResult?.committed === true) canonicalCommitted = true;
          if (!runtime.isCurrent(sceneEpoch)) return false;
          runtime.requireAppliedEffectsMutation(coordinatedMutation);
          warnings.push(...warningsFromMutation(coordinatedMutation));
          return true;
        };
        // La nuova zona deve nascere dopo la persistenza dell'owner spell.
        // Il controller static-zone è un servizio separato e può osservare il
        // root nel breve intervallo precedente: senza questo ordine il primo
        // cast può essere classificato come zona orfana e rimosso.
        if (plan.nextStaticZoneItems.length) {
          if (!await commitCoordinatedEffects()) return;
          await runtime.addItems(plan.nextStaticZoneItems);
          addedNextZone = true;
          canonicalCommitted = true;
          if (!runtime.isCurrent(sceneEpoch)) throw new Error("scene-epoch-stale-after-zone-add");
        } else {
          await commitCoordinatedEffects();
        }
      } catch (error) {
        if (runtime.isCurrent(sceneEpoch)) {
          if (addedNextZone) await runtime.deleteItems(plan.nextStaticZoneItems.map((item) => item.id)).catch(() => {});
          if (removedPreviousZone) await runtime.addItems(plan.previousStaticZoneItems).catch(() => {});
          await restoreHPIfUnchanged(runtime, entries).catch(() => {});
        }
        throw error;
      }
      });
    }
    if (historyResult?.partial) {
      if (hpVisualTransaction) {
        await hpVisualTransaction.recover((ids) => runtime.readAuthoritativeHPVisualUpdates(
          ids, sceneEpoch, () => runtime.isCurrent(sceneEpoch),
        )).catch((error) => warnings.push(normalizedError(error, "hp-visual-recovery")));
      }
      return resultBase(command, RESULT_STATUSES.APPLIED, {
        instanceId: plan.spellInstanceId,
        committed: true, partial: true,
        changedIds: (historyResult.changes || []).map((change) => change.id),
        historyEntryId: historyResult.historyEntryId,
        undoAvailable: !historyResult.historyPending && !!historyResult.historyEntryId,
        warnings: [...warnings, normalizedError(historyResult.error, "partial-commit")],
        visualEvents,
      });
    }
  } catch (error) {
    if (!runtime.isCurrent(sceneEpoch)) {
      return resultBase(command, canonicalCommitted ? RESULT_STATUSES.APPLIED : RESULT_STATUSES.REJECTED, {
        instanceId: plan.spellInstanceId,
        changedIds: canonicalCommitted ? changedIdsFrom(plan, coordinatedMutation) : [],
        warnings,
        errors: [normalizedError(error, canonicalCommitted
          ? "scene-epoch-stale-post-commit"
          : "scene-epoch-stale")],
        visualEvents,
        committed: canonicalCommitted,
        postCommitPending: canonicalCommitted,
        stale: true,
      });
    }
    if (hpVisualTransaction) {
      await hpVisualTransaction.recover((ids) => runtime.readAuthoritativeHPVisualUpdates(
        ids,
        sceneEpoch,
        () => runtime.isCurrent(sceneEpoch),
      ))
        .catch((recoveryError) => warnings.push(normalizedError(recoveryError, "hp-visual-recovery")));
    }
    return resultBase(command, RESULT_STATUSES.FAILED, {
      instanceId: plan.spellInstanceId,
      changedIds: [],
      warnings,
      errors: [normalizedError(error)],
      visualEvents,
    });
  } finally {
    if (pendingZoneInstanceIds.length) {
      releaseStaticSpellZoneInstances(pendingZoneInstanceIds);
    }
  }

  if (!runtime.isCurrent(sceneEpoch)) {
    return resultBase(command, canonicalCommitted ? RESULT_STATUSES.APPLIED : RESULT_STATUSES.REJECTED, {
      instanceId: plan.spellInstanceId,
      changedIds: canonicalCommitted ? changedIdsFrom(plan, coordinatedMutation) : [],
      warnings,
      errors: [{
        code: canonicalCommitted ? "scene-epoch-stale-post-commit" : "scene-epoch-stale",
        message: canonicalCommitted
          ? "Commit completato nella scena precedente; gli output successivi sono sospesi."
          : "La scena è cambiata prima del commit.",
      }],
      visualEvents,
      committed: canonicalCommitted,
      postCommitPending: canonicalCommitted,
      stale: true,
    });
  }

  if (plan.matchedVisualContext && !suppressMatchedVisual) {
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
      isCurrent: () => runtime.isCurrent(sceneEpoch),
    }).catch((error) => warnings.push(normalizedError(error, "hp-memory"))),
    Promise.resolve(runtime.onConcentrationWarnings(entries, plan))
      .catch((error) => warnings.push(normalizedError(error, "concentration-warning"))),
    Promise.resolve(runtime.onEffectSaveWarnings(entries, plan))
      .catch((error) => warnings.push(normalizedError(error, "effect-save-warning"))),
  ]);
  if (!runtime.isCurrent(sceneEpoch)) {
    return resultBase(command, canonicalCommitted ? RESULT_STATUSES.APPLIED : RESULT_STATUSES.REJECTED, {
      instanceId: plan.spellInstanceId,
      changedIds: canonicalCommitted ? changedIdsFrom(plan, coordinatedMutation) : [],
      warnings,
      errors: [{
        code: "scene-epoch-stale-post-commit",
        message: "Commit completato nella scena precedente; gli output successivi sono sospesi.",
      }],
      visualEvents,
      committed: canonicalCommitted,
      postCommitPending: true,
      stale: true,
    });
  }
  if (hpVisualTransaction) await hpVisualTransaction.completion;
  if (!runtime.isCurrent(sceneEpoch)) {
    return resultBase(command, RESULT_STATUSES.APPLIED, {
      instanceId: plan.spellInstanceId,
      changedIds: changedIdsFrom(plan, coordinatedMutation),
      warnings,
      errors: [{
        code: "scene-epoch-stale-post-commit",
        message: "Commit completato nella scena precedente; gli output successivi sono sospesi.",
      }],
      visualEvents,
      committed: true,
      postCommitPending: true,
      stale: true,
    });
  }
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
    ...(isTeleportSpell(plan.spell.id) && teleportHistoryPending
      ? { historyPending: true, recoveryPending: coordinatedMutation?.recoveryPending === true }
      : {}),
    visualEvents,
    warnings,
  });
}

export const SPELL_AREA_RESOLUTION_RESULT_STATUSES = RESULT_STATUSES;
