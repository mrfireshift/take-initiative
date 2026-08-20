import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { createSpellInstanceId } from "./spells.js";
import { getConditionInstances, refreshConditionLabels } from "./conditions.js";
import { spellEffectConditionOptions } from "./spellEffectCore.js";
import {
  requireAppliedEffectsMutation,
  runEffectsMutation,
} from "./effectsMutations.js";
import {
  buildSpellApplicationIntent,
  buildSpellApplicationPlan,
} from "./spellApplicationPlanCore.js";
import { buildSpellActiveActionPlan } from "./spellActiveActionCore.js";
import {
  buildSpellActiveResolutionFailureOperations,
  buildSpellActiveResolutionSuccessOperations,
  buildSpellActiveResolutionLinkedEffectRemovals,
  buildSpellActiveResolutionResourceOperations,
  normalizeActiveResolutionTargetIds,
  resolveSpellActiveResolutionDamage,
  validateSpellActiveResolutionPayload,
} from "./spellActiveResolutionCore.js";
import { validateSpellActiveResolutionCommit } from "./spellActiveResolutionValidation.js";
import {
  calculateQuickHPChange,
  QUICK_HP_FACTORS,
  QUICK_HP_MODES,
} from "./quickHpCore.js";
import { spellCasterHealingChange } from "./spellDamageHealingCore.js";
import {
  resolveZeroHPUnconsciousAction,
  resolveDamageEndsConditionRemovals,
  ZERO_HP_UNCONSCIOUS_TYPE,
} from "./hpConditionRulesCore.js";
import { currentInitiativeTurnKey } from "./turnBoundaryCore.js";
import { emitMatchedSpellVisual } from "./embersMatchedVisualRenderer.js";
import {
  requestSpellAreaPlacement,
  requestSpellZoneMovement,
} from "./spellAreaPlacementClient.js";
import {
  createSpellBoardTokenId,
  getSpellBoardTokenRule,
} from "./spellBoardTokenCore.js";
import { buildStaticSpellChildZoneItem } from "./spellStaticZone.js";
import { SPELL_STATIC_ZONE_META_KEY, translatedZoneArea } from "./spellStaticZoneCore.js";
import { planWallOfLightShortening } from "./wallOfLightActiveCore.js";
import {
  attachSpellExecutionHistory,
} from "./spellExecutionHistoryCore.js";
import { buildSpellCausality } from "./combatLogCausalityCore.js";

const STATE_KEY = `${ID}/state`;

export async function executeSpellZoneMovement({
  group = null,
  action = null,
  casterName = "",
  movementChoice = "",
  sceneEpoch = null,
  sceneIdentity = null,
  commandId = "",
  isCurrent = null,
} = {}) {
  const ruleId = String(action?.ruleId || "").trim();
  const instanceId = String(group?.instanceId || action?.instanceId || "").trim();
  const zoneItemId = String(action?.zoneItemId || "").trim();
  const casterId = String(group?.casterId || "").trim();
  if (!ruleId || !instanceId || !zoneItemId || !casterId) {
    throw new Error("Invalid spell zone movement: context-required");
  }
  if (typeof isCurrent === "function" && sceneEpoch != null && !isCurrent(sceneEpoch)) {
    throw new Error("scene-epoch-stale-before-zone-movement");
  }
  const result = await requestSpellZoneMovement({
    ruleId,
    casterId,
    instanceId,
    zoneItemId,
    movementChoice,
  }, {
    broadcast: OBR.broadcast,
    windowRef: globalThis.window,
  });
  if (result?.status !== "confirmed" || !result?.preview) {
    if (result?.status === "cancelled") return [];
    throw new Error(
      String(result?.error || "Il movimento della zona non è stato confermato."),
    );
  }
  if (typeof isCurrent === "function" && sceneEpoch != null && !isCurrent(sceneEpoch)) {
    throw new Error("scene-epoch-stale-before-zone-mutation");
  }
  const preview = result.preview;
  const movement = await runEffectsMutation([], {
    kind: "spell-zone-move",
    label: `Sposta zona: ${String(group?.name || "Incantesimo").trim()}`,
    targetIds: [casterId],
    sideEffects: [{
      type: "static-zone:move",
      zoneItemId,
      instanceId,
      ruleId,
      casterId,
      initialPosition: preview.initialPosition,
      proposedPosition: preview.proposedPosition,
      ...(preview.contactTargetId
        ? { contactTargetId: String(preview.contactTargetId).trim() }
        : {}),
      ...(preview.movementChoice
        ? { movementChoice: String(preview.movementChoice).trim() }
        : {}),
    }],
    history: {
      kind: "spell-zone-move",
      label: `Sposta zona: ${String(group?.name || casterName || "Incantesimo").trim()}`,
      payload: {
        instanceId,
        zoneItemId,
        ruleId,
        causality: buildSpellCausality({
          eventType: "zone-move",
          spellId: group?.spellId,
          spellName: group?.name,
          instanceId,
          casterId,
          casterName: casterName || group?.casterName,
          phase: group?.castContext?.phase,
          targetIds: preview?.contactTargetId ? [preview.contactTargetId] : [],
          zone: {
            action: "move",
            zoneItemId,
            ruleId,
            movementChoice: preview?.movementChoice || movementChoice,
          },
        }),
      },
    },
    ...(sceneIdentity ? { sceneIdentity } : {}),
    ...(commandId ? { commandId } : {}),
  });
  requireAppliedEffectsMutation(movement);
  if (typeof isCurrent === "function" && sceneEpoch != null && !isCurrent(sceneEpoch)) {
    return attachSpellExecutionHistory(movement.changedIds || [], {
      ...movement,
      stale: true,
      postCommitPending: true,
    });
  }
  return attachSpellExecutionHistory(movement.changedIds || [], movement);
}

export async function executeSpellZoneDirection({
  group = null,
  action = null,
  casterName = "",
  sceneEpoch = null,
  sceneIdentity = null,
  commandId = "",
  isCurrent = null,
} = {}) {
  const ruleId = String(action?.ruleId || "").trim();
  const instanceId = String(group?.instanceId || action?.instanceId || "").trim();
  const zoneItemId = String(action?.zoneItemId || "").trim();
  const casterId = String(group?.casterId || "").trim();
  if (!ruleId || !instanceId || !zoneItemId || !casterId) {
    throw new Error("Invalid spell zone direction: context-required");
  }
  if (typeof isCurrent === "function" && sceneEpoch != null && !isCurrent(sceneEpoch)) {
    throw new Error("scene-epoch-stale-before-zone-direction");
  }
  const result = await requestSpellAreaPlacement({
    ruleId,
    casterId,
    context: {
      instanceId,
      zoneItemId,
      directionChange: true,
    },
  }, {
    broadcast: OBR.broadcast,
    windowRef: globalThis.window,
  });
  if (result?.status !== "confirmed" || !result?.preview) {
    if (result?.status === "cancelled") return [];
    throw new Error(
      String(result?.error || "La nuova direzione della zona non è stata confermata."),
    );
  }
  if (typeof isCurrent === "function" && sceneEpoch != null && !isCurrent(sceneEpoch)) {
    throw new Error("scene-epoch-stale-before-zone-mutation");
  }
  const preview = result.preview;
  const direction = await runEffectsMutation([], {
    kind: "spell-zone-direction",
    label: `Cambia direzione: ${String(group?.name || "Incantesimo").trim()}`,
    targetIds: [casterId],
    sideEffects: [{
      type: "static-zone:reorient",
      zoneItemId,
      instanceId,
      ruleId,
      casterId,
      preview,
    }],
    history: {
      kind: "spell-zone-direction",
      label: `Cambia direzione: ${String(group?.name || casterName || "Incantesimo").trim()}`,
      payload: {
        instanceId,
        zoneItemId,
        ruleId,
        causality: buildSpellCausality({
          eventType: "zone-reorient",
          spellId: group?.spellId,
          spellName: group?.name,
          instanceId,
          casterId,
          casterName: casterName || group?.casterName,
          phase: group?.castContext?.phase,
          zone: { action: "reorient", zoneItemId, ruleId },
        }),
      },
    },
    ...(sceneIdentity ? { sceneIdentity } : {}),
    ...(commandId ? { commandId } : {}),
  });
  requireAppliedEffectsMutation(direction);
  if (typeof isCurrent === "function" && sceneEpoch != null && !isCurrent(sceneEpoch)) {
    return attachSpellExecutionHistory(direction.changedIds || [], {
      ...direction,
      stale: true,
      postCommitPending: true,
    });
  }
  return attachSpellExecutionHistory(direction.changedIds || [], direction);
}

export async function getCurrentSpellAppliedAt() {
  try {
    const metadata = await OBR.scene.getMetadata();
    const state = metadata?.[STATE_KEY] || {};
    const order = Array.isArray(state.order) ? state.order : [];
    return {
      round: Math.max(1, Number(state.round || 1)),
      actorId: order[state.current] || null,
      phase: "turn",
      turnKey: currentInitiativeTurnKey(state),
    };
  } catch {
    return null;
  }
}

export async function executeSpellActiveAction({
  spell = null,
  actionId = "",
  group = null,
  selectedTargetIds = [],
  appliedAt = undefined,
  casterName = "",
  sceneEpoch = null,
  sceneIdentity = null,
  commandId = "",
  isCurrent = null,
} = {}) {
  if (typeof isCurrent === "function" && sceneEpoch != null && !isCurrent(sceneEpoch)) {
    throw new Error("scene-epoch-stale-before-active-action");
  }
  const resolvedAppliedAt = appliedAt === undefined
    ? await getCurrentSpellAppliedAt()
    : appliedAt;
  if (typeof isCurrent === "function" && sceneEpoch != null && !isCurrent(sceneEpoch)) {
    throw new Error("scene-epoch-stale-before-active-action");
  }
  const actionPlan = buildSpellActiveActionPlan({
    spell,
    actionId,
    group,
    selectedTargetIds,
    appliedAt: resolvedAppliedAt,
    casterName,
  });
  if (!actionPlan.valid) {
    throw new Error("Invalid active spell action: " + actionPlan.errors.join(", "));
  }

  const sideEffects = [];
  if (actionPlan.zoneRuleChoice) {
    sideEffects.push({
      type: "static-zone:set-rule-choice",
      selector: { instanceId: group?.instanceId || "" },
      ruleChoice: actionPlan.zoneRuleChoice,
      requireMatch: true,
    });
    if (actionPlan.action?.clearChildZones === true) {
      sideEffects.push({
        type: "static-zone:child-zones",
        parentZoneId: String(group?.zoneItemId || "").trim(),
        parentInstanceId: String(group?.instanceId || "").trim(),
        casterId: String(group?.casterId || "").trim(),
        removeAllChildren: true,
        items: [],
      });
    }
  }
  if (actionPlan.entityAction) {
    sideEffects.push({
      type: "spell-board-token:update-state",
      instanceId: String(group?.instanceId || "").trim(),
      action: actionPlan.entityAction,
      targetIds: actionPlan.subjectIds,
    });
  }
  const mutation = await runEffectsMutation(actionPlan.operations, {
    kind: "spell",
    label: actionPlan.historyLabel,
    targetIds: [String(group?.casterId || "").trim(), ...selectedTargetIds].filter(Boolean),
    sideEffects,
    history: {
      kind: "spell",
      label: actionPlan.historyLabel,
      payload: {
        causality: buildSpellCausality({
          eventType: "active-action",
          spellId: spell?.id || group?.spellId,
          spellName: spell?.displayName || spell?.name || group?.name,
          instanceId: group?.instanceId,
          slotLevel: group?.castContext?.slotLevel,
          phase: group?.castContext?.phase,
          casterId: group?.casterId,
          casterName: casterName || group?.casterName,
          targets: group?.targets,
          targetIds: actionPlan.subjectIds,
          action: actionPlan.action,
          concentrationAction: actionPlan.action?.concentrationAction,
          concentrationInstanceId: group?.instanceId,
        }),
      },
    },
    ...(sceneIdentity ? { sceneIdentity } : {}),
    ...(commandId ? { commandId } : {}),
  });
  requireAppliedEffectsMutation(mutation);
  const changedIds = mutation.changedIds;
  if (typeof isCurrent === "function" && sceneEpoch != null && !isCurrent(sceneEpoch)) {
    return attachSpellExecutionHistory(changedIds, {
      ...mutation,
      stale: true,
      postCommitPending: true,
    });
  }
  await refreshConditionLabels(changedIds);
  if (typeof isCurrent === "function" && sceneEpoch != null && !isCurrent(sceneEpoch)) {
    return attachSpellExecutionHistory(changedIds, {
      ...mutation,
      stale: true,
      postCommitPending: true,
    });
  }
  return attachSpellExecutionHistory(changedIds, mutation);
}

function metadataSnapshot(meta, field) {
  return Object.prototype.hasOwnProperty.call(meta || {}, field)
    ? { present: true, value: meta[field] }
    : { present: false };
}

function activeResolutionAction(payload) {
  return payload?.action && typeof payload.action === "object"
    ? payload.action
    : null;
}

function activeResolutionOutcome(payload, targetId, attackOutcome) {
  return payload?.action?.resolutionKind === "single-attack"
    ? String(attackOutcome || "").trim()
    : String(payload?.outcomes?.[targetId] || "").trim();
}

function childPlacementEntries(placement) {
  if (Array.isArray(placement?.children)) return placement.children.filter(Boolean);
  return placement?.start && placement?.end ? [placement] : [];
}

export async function executeSpellActiveResolution({
  payload = null,
  placement = null,
  targetIds = [],
  outcomes = {},
  damageRoll = 0,
  attackOutcome = "",
  attacks = [],
  shorteningFrom = "",
  naturalStormBonus = false,
  sceneEpoch = null,
  sceneIdentity = null,
  commandId = "",
  isCurrent = null,
} = {}) {
  if (typeof isCurrent === "function" && sceneEpoch != null && !isCurrent(sceneEpoch)) {
    throw new Error("scene-epoch-stale-before-active-resolution");
  }
  const normalizedPayload = {
    ...(payload && typeof payload === "object" ? payload : {}),
    ...(outcomes && typeof outcomes === "object" ? { outcomes } : {}),
  };
  const payloadValidation = validateSpellActiveResolutionPayload(payload);
  if (!payloadValidation.valid) {
    throw new Error("Invalid active spell resolution: " + payloadValidation.errors.join(", "));
  }
  const attackEntries = (Array.isArray(attacks) ? attacks : [])
    .map((entry) => ({
      targetId: String(entry?.targetId || entry?.id || "").trim(),
      attackOutcome: String(entry?.attackOutcome || entry?.outcome || "").trim(),
      damageRoll: entry?.damageRoll ?? entry?.damage ?? 0,
    }))
    .filter((entry) => entry.targetId);
  const ids = normalizeActiveResolutionTargetIds([
    ...targetIds,
    ...attackEntries.map((entry) => entry.targetId),
  ]);
  if (!ids.length && payload?.action?.resolutionKind !== "child-zone") {
    throw new Error("active-resolution-targets-required");
  }
  const commitInput = {
    payload: normalizedPayload,
    placement,
    targetIds: ids,
    outcomes,
    damageRoll,
    attackOutcome,
    attacks: attackEntries,
    shorteningFrom,
  };
  const preflight = await validateSpellActiveResolutionCommit(commitInput);
  if (typeof isCurrent === "function" && sceneEpoch != null && !isCurrent(sceneEpoch)) {
    throw new Error("scene-epoch-stale-before-active-resolution");
  }
  if (!preflight.valid) {
    throw new Error("Invalid active spell resolution: " + preflight.errors.join(", "));
  }

  const items = await OBR.scene.items.getItems(ids);
  if (typeof isCurrent === "function" && sceneEpoch != null && !isCurrent(sceneEpoch)) {
    throw new Error("scene-epoch-stale-before-active-resolution");
  }
  const byId = new Map(items.map((item) => [item.id, item]));
  const metadataPatches = [];
  const operations = [];
  const unconsciousIds = [];
  const unconsciousRemovals = [];
  const resolutionDamageByTarget = new Map();
  const action = activeResolutionAction(payload);
  let staticZoneShortening = null;
  if (action?.shortenStaticZone && payload?.zoneItemId) {
    const [[zoneItem], scale] = await Promise.all([
      OBR.scene.items.getItems([payload.zoneItemId]),
      OBR.scene.grid.getScale().catch(() => ({ parsed: { multiplier: 1.5, unit: "m" } })),
    ]);
    if (typeof isCurrent === "function" && sceneEpoch != null && !isCurrent(sceneEpoch)) {
      throw new Error("scene-epoch-stale-before-active-resolution");
    }
    const zoneMetadata = zoneItem?.metadata?.[SPELL_STATIC_ZONE_META_KEY];
    if (
      !zoneItem
      || zoneMetadata?.role !== "root"
      || String(zoneMetadata.instanceId || "") !== String(payload.instanceId || "")
      || String(zoneMetadata.casterId || "") !== String(payload.casterId || "")
    ) {
      throw new Error("active-resolution-zone-shortening-context-invalid");
    }
    const configuredFrom = String(action.shortenStaticZone.from || "end").trim();
    const requestedFrom = String(shorteningFrom || "").trim();
    const shorteningSide = action.shortenStaticZone.chooseFrom === true
      && ["start", "end"].includes(requestedFrom)
      ? requestedFrom
      : configuredFrom;
    const shortening = planWallOfLightShortening({
      zoneItem,
      scale: scale?.parsed || scale,
      meters: action.shortenStaticZone.meters,
      from: shorteningSide,
    });
    if (!shortening.valid) {
      throw new Error(
        `active-resolution-zone-shortening-invalid: ${(shortening.errors || []).join(", ")}`,
      );
    }
    staticZoneShortening = {
      ...shortening,
      ruleId: String(zoneMetadata.ruleId || ""),
    };
    if (shortening.endsSpell && action.shortenStaticZone.endSpellAtZero === true) {
      operations.push(
        {
          type: "concentration:break",
          casterIds: [payload.casterId],
          reference: payload.instanceId,
        },
        {
          type: "spell:remove-instance",
          targetIds: [payload.casterId],
          instanceId: payload.instanceId,
        },
      );
    }
  }
  if (action?.resource) {
    const [casterItem] = await OBR.scene.items.getItems([payload.casterId]);
    if (typeof isCurrent === "function" && sceneEpoch != null && !isCurrent(sceneEpoch)) {
      throw new Error("scene-epoch-stale-before-active-resolution");
    }
    const casterMeta = casterItem?.metadata?.[`${ID}/meta`] || {};
    const casterSpells = Array.isArray(casterMeta[`${ID}/spells`]) ? casterMeta[`${ID}/spells`] : [];
    const spellEntry = casterSpells.find((entry) => (
      String(entry?.instanceId || "").trim() === String(payload.instanceId || "").trim()
    ));
    const resourcePlan = buildSpellActiveResolutionResourceOperations({
      action,
      payload,
      spellEntry,
    });
    if (!resourcePlan.valid) {
      throw new Error(`Invalid active spell resource: ${(resourcePlan.errors || []).join(", ")}`);
    }
    operations.push(...resourcePlan.operations);
    if (casterItem) byId.set(payload.casterId, casterItem);
  }
  if (action?.concentrationAction === "dismiss") {
    operations.push(
      {
        type: "concentration:break",
        casterIds: [payload.casterId],
        reference: payload.instanceId,
      },
      {
        type: "spell:remove-instance",
        targetIds: [payload.casterId],
        instanceId: payload.instanceId,
      },
    );
  }
  if (action?.replaceLinkedEffectId) {
    const linkedItems = await OBR.scene.items.getItems();
    if (typeof isCurrent === "function" && sceneEpoch != null && !isCurrent(sceneEpoch)) {
      throw new Error("scene-epoch-stale-before-active-resolution");
    }
    const removals = buildSpellActiveResolutionLinkedEffectRemovals({
      action,
      payload,
      items: linkedItems,
    });
    if (removals.length) {
      operations.push({ type: "condition:remove-instances", removals });
    }
  }
  const sideEffects = [{
    type: "spell-active-resolution:validate",
    ...commitInput,
    naturalStormBonus: naturalStormBonus === true,
  }];
  if (staticZoneShortening?.endsSpell) {
    sideEffects.push({
      type: "static-zone:remove-ended",
      selectors: [{
        instanceId: payload.instanceId,
        casterId: payload.casterId,
      }],
    });
  } else if (staticZoneShortening?.preview) {
    sideEffects.push({
      type: "static-zone:reorient",
      zoneItemId: payload.zoneItemId,
      instanceId: payload.instanceId,
      ruleId: staticZoneShortening.ruleId,
      casterId: payload.casterId,
      preview: staticZoneShortening.preview,
    });
  }
  if (action?.moveRootToTarget === true && ids.length === 1 && payload?.zoneItemId) {
    const target = byId.get(ids[0]);
    const targetPosition = target?.position;
    if (targetPosition && Number.isFinite(Number(targetPosition.x)) && Number.isFinite(Number(targetPosition.y))) {
      sideEffects.push({
        type: "token:teleport",
        targetId: payload.zoneItemId,
        position: { x: Number(targetPosition.x), y: Number(targetPosition.y) },
        skipAnimation: true,
      });
    }
  }
  if (action?.childZone?.ruleChoice) {
    sideEffects.push({
      type: "static-zone:set-rule-choice",
      selector: { instanceId: payload.instanceId },
      ruleChoice: action.childZone.ruleChoice,
      requireMatch: true,
    });
  }
  if (action?.resolutionKind === "child-zone") {
    const childZone = action.childZone || {};
    const [parentZone] = payload.zoneItemId
      ? await OBR.scene.items.getItems([payload.zoneItemId])
      : [];
    const parentArea = translatedZoneArea(parentZone);
    const activationId = String(
      placement?.activationId
      || `${payload.instanceId}:${payload.actionId}:${Date.now()}`,
    ).trim();
    const childItems = childPlacementEntries(placement).map((preview, index) =>
      buildStaticSpellChildZoneItem({
        ruleId: childZone.placementRuleId || action.placementRuleId,
        instanceId: payload.instanceId,
        casterId: payload.casterId,
        parentId: payload.zoneItemId,
        parentArea,
        spellName: payload.spellName,
        preview,
        childKind: childZone.childKind,
        childIndex: index,
        activationId,
        sceneEpoch: payload.sceneEpoch,
        variant: childZone.ruleChoice || "",
        depthRoll: preview?.depthRoll,
      })
    );
    sideEffects.push({
      type: "static-zone:child-zones",
      parentZoneId: payload.zoneItemId,
      parentInstanceId: payload.instanceId,
      casterId: payload.casterId,
      items: childItems,
      ...(childZone.replaceChildKind
        ? { replaceChildKind: childZone.replaceChildKind }
        : {}),
      ...(childZone.singleActivation === true
        ? { singleActivation: true }
        : {}),
    });
    const failureEffect = childZone.failureEffect;
    const failedIds = ids.filter((targetId) => outcomes?.[targetId] === "failed");
    if (failureEffect && failedIds.length) {
      operations.push({
        type: "condition:add",
        targetIds: failedIds,
        conditionName: String(failureEffect.label || "Caduto nella fessura").trim(),
        options: {
          sourceId: payload.casterId,
          sourceName: payload.casterName,
          parentEffectId: payload.instanceId,
          type: "spell",
          effectId: String(failureEffect.effectId || `${payload.spellId}-${childZone.childKind}`).trim(),
          effectDetail: String(failureEffect.detail || "").trim(),
          manualRemoval: true,
          endsParentOnRemoval: true,
          expiry: { mode: "concentration" },
        },
      });
      operations.push({ type: "condition:automate", subjectIds: failedIds });
    }
  } else {
    const resolutionEntries = attackEntries.length
      ? attackEntries
      : ids.map((targetId) => ({ targetId, attackOutcome, damageRoll }));
    const currentHpById = new Map();
    for (const entry of resolutionEntries) {
      const targetId = entry.targetId;
      const item = byId.get(targetId);
      const meta = item?.metadata?.[`${ID}/meta`] || {};
      const outcome = action?.resolutionKind === "single-attack"
        ? entry.attackOutcome
        : activeResolutionOutcome(normalizedPayload, targetId, attackOutcome);
      if (!action?.damage) {
        resolutionDamageByTarget.set(targetId, { damage: null, outcome });
        continue;
      }
      const damage = resolveSpellActiveResolutionDamage({
        action,
        slotLevel: payload.slotLevel,
        outcome,
        roll: action?.resolutionKind === "single-attack" ? entry.damageRoll : damageRoll,
      });
      if (!damage.valid) throw new Error("active-resolution-damage-invalid");
      resolutionDamageByTarget.set(targetId, { damage, outcome });
      if (damage.amount <= 0) continue;
      if (!item
        || !Object.prototype.hasOwnProperty.call(meta, "hp")
        || !Object.prototype.hasOwnProperty.call(meta, "hpMax")) {
        throw new Error("active-resolution-hp-required");
      }
      const currentHp = currentHpById.has(targetId)
        ? currentHpById.get(targetId)
        : meta.hp;
      const hpChange = calculateQuickHPChange({
        mode: QUICK_HP_MODES.DAMAGE,
        value: damage.amount,
        factor: QUICK_HP_FACTORS.FULL,
        hp: currentHp,
        hpMax: meta.hpMax,
      });
      currentHpById.set(targetId, hpChange.afterHP);
      if (!hpChange.changed) continue;
      const existingPatch = metadataPatches.find((patch) => patch.id === targetId);
      if (existingPatch) {
        existingPatch.fields.hp.value = hpChange.afterHP;
        existingPatch.fields.hpMax.value = hpChange.hpMax;
      } else {
        metadataPatches.push({
          id: targetId,
          fields: {
            hp: {
              expected: metadataSnapshot(meta, "hp"),
              value: hpChange.afterHP,
            },
            hpMax: {
              expected: metadataSnapshot(meta, "hpMax"),
              value: hpChange.hpMax,
            },
          },
        });
      }
    }
    const casterHealingRatio = Number(action?.casterHealingFromAppliedDamage) || 0;
    if (casterHealingRatio > 0) {
      const damageChanges = ids.map((targetId) => ({
        requested: resolutionDamageByTarget.get(targetId)?.damage?.amount,
      }));
      const [casterItem] = await OBR.scene.items.getItems([payload.casterId]);
      if (typeof isCurrent === "function" && sceneEpoch != null && !isCurrent(sceneEpoch)) {
        throw new Error("scene-epoch-stale-before-active-resolution");
      }
      const casterMeta = casterItem?.metadata?.[`${ID}/meta`] || {};
      if (casterItem
        && Object.prototype.hasOwnProperty.call(casterMeta, "hp")
        && Object.prototype.hasOwnProperty.call(casterMeta, "hpMax")) {
        const healingChange = spellCasterHealingChange({
          damageChanges,
          ratio: casterHealingRatio,
          hp: casterMeta.hp,
          hpMax: casterMeta.hpMax,
        });
        if (healingChange.changed) {
          metadataPatches.push({
            id: payload.casterId,
            fields: {
              hp: {
                expected: metadataSnapshot(casterMeta, "hp"),
                value: healingChange.afterHP,
              },
              hpMax: {
                expected: metadataSnapshot(casterMeta, "hpMax"),
                value: healingChange.hpMax,
              },
            },
          });
          byId.set(payload.casterId, casterItem);
        }
      }
    }
    for (const patch of metadataPatches) {
      const item = byId.get(patch.id);
      const meta = item?.metadata?.[`${ID}/meta`] || {};
      const zeroAction = resolveZeroHPUnconsciousAction(
        { ...meta, hp: patch.fields.hp.value, hpMax: patch.fields.hpMax.value },
        getConditionInstances(meta.conditions || {}),
      );
      if (zeroAction.add) unconsciousIds.push(patch.id);
      unconsciousRemovals.push(...zeroAction.removeInstanceIds.map((instanceId) => ({
        itemId: patch.id,
        instanceId,
      })));
      if (patch.fields?.hp?.value < patch.fields?.hp?.expected?.value) {
        for (const instanceId of resolveDamageEndsConditionRemovals(getConditionInstances(meta.conditions || {}))) {
          unconsciousRemovals.push({ itemId: patch.id, instanceId });
        }
      }
    }
    operations.push(...buildSpellActiveResolutionFailureOperations({
      action,
      payload,
      targetIds: ids,
      outcomes,
    }));
    operations.push(...buildSpellActiveResolutionSuccessOperations({
      action,
      payload,
      targetIds: ids,
      outcomes,
    }));
    const actionEffects = Array.isArray(action?.effects) ? action.effects : [];
    const hitEffectTargetIds = attackEntries.length
      ? normalizeActiveResolutionTargetIds(
        attackEntries
          .filter((entry) => ["hit", "critical"].includes(entry.attackOutcome))
          .map((entry) => entry.targetId),
      )
      : attackOutcome === "hit" && action?.resolutionKind === "single-attack"
        ? ids
        : [];
    if (hitEffectTargetIds.length && action?.effectOn === "hit") {
      for (const effect of actionEffects) {
        const conditionName = String(effect?.label || "").trim();
        if (!conditionName) continue;
        operations.push({
          type: "condition:add",
          targetIds: hitEffectTargetIds,
          conditionName,
          options: spellEffectConditionOptions(
            effect,
            {
              sourceId: payload.casterId,
              sourceName: payload.casterName,
              expiry: effect.expiry || { mode: "manual" },
            },
            payload.instanceId,
          ),
        });
      }
      if (operations.some((operation) => operation.type === "condition:add")) {
        operations.push({ type: "condition:automate", subjectIds: hitEffectTargetIds });
      }
    }
  }
  if (unconsciousIds.length) {
    operations.push({
      type: "condition:add",
      targetIds: unconsciousIds,
      conditionName: "Privo di sensi",
      options: { type: ZERO_HP_UNCONSCIOUS_TYPE, expiry: { mode: "manual" } },
    });
    operations.push({ type: "condition:automate", subjectIds: unconsciousIds });
  }
  if (unconsciousRemovals.length) {
    operations.push({ type: "condition:remove-instances", removals: unconsciousRemovals });
  }
  const spellName = String(payload.spellName || payload.spellId).trim();
  const actionLabel = String(action.buttonLabel || action.label || "Attivazione").trim();
  const causalTargets = ids.map((targetId) => {
    const item = byId.get(targetId);
    const resolution = resolutionDamageByTarget.get(targetId);
    const damage = resolution?.damage;
    const patch = metadataPatches.find((entry) => entry.id === targetId);
    const meta = item?.metadata?.[`${ID}/meta`] || {};
    const beforeHP = Number(meta.hp);
    const afterHP = patch ? Number(patch.fields.hp.value) : beforeHP;
    const appliedHpDelta = Number.isFinite(beforeHP) && Number.isFinite(afterHP)
      ? afterHP - beforeHP
      : undefined;
    return {
      id: targetId,
      ...(item?.name ? { name: item.name } : {}),
      ...(resolution?.outcome ? { outcome: resolution.outcome } : {}),
      ...(damage ? { requestedDamage: damage.amount, damageFactor: damage.factor } : {}),
      ...(appliedHpDelta !== undefined ? { appliedHpDelta } : {}),
    };
  });
  const causalAction = {
    ...(action || {}),
    ...(action?.resolutionKind === "single-attack" && attackEntries.length === 1
      ? { damageRoll: attackEntries[0].damageRoll, attackOutcome: attackEntries[0].attackOutcome }
      : { damageRoll }),
  };
  const mutation = await runEffectsMutation(operations, {
    kind: "spell-active-resolution",
    label: `Attivazione: ${spellName} · ${actionLabel}`,
    targetIds: [payload.casterId, ...ids],
    metadataPatches,
    sideEffects,
    ...(sceneIdentity ? { sceneIdentity } : {}),
    ...(commandId ? { commandId } : {}),
    history: {
      kind: "spell-active-resolution",
      label: `Attivazione: ${spellName} · ${actionLabel}`,
      payload: {
        type: payload.type,
        spellId: payload.spellId,
        instanceId: payload.instanceId,
        casterId: payload.casterId,
        actionId: payload.actionId,
        slotLevel: payload.slotLevel,
        targetIds: ids,
        outcomes,
        attackOutcome: String(attackOutcome || ""),
        damageRoll: Math.max(0, Math.floor(Number(damageRoll) || 0)),
        attacks: attackEntries,
        ...(action?.shortenStaticZone ? { shorteningFrom: String(shorteningFrom || action.shortenStaticZone.from || "end") } : {}),
        naturalStormBonus: naturalStormBonus === true,
        causality: buildSpellCausality({
          eventType: "resolution",
          spellId: payload.spellId,
          spellName: payload.spellName,
          instanceId: payload.instanceId,
          slotLevel: payload.slotLevel,
          phase: payload.castContext?.phase || payload.phase,
          casterId: payload.casterId,
          casterName: payload.casterName,
          targets: causalTargets,
          targetIds: ids,
          outcomes,
          attacks: attackEntries,
          actionId: payload.actionId,
          action: causalAction,
          concentrationAction: action?.concentrationAction,
          concentrationInstanceId: payload.instanceId,
          zone: payload.zoneItemId
            ? {
              action: action?.childZone ? "resolve" : undefined,
              zoneItemId: payload.zoneItemId,
              ruleId: action?.placementRuleId || action?.childZone?.placementRuleId,
            }
            : undefined,
        }),
      },
    },
  });
  requireAppliedEffectsMutation(mutation);
  if (typeof isCurrent === "function" && sceneEpoch != null && !isCurrent(sceneEpoch)) {
    return attachSpellExecutionHistory(mutation, {
      ...mutation,
      stale: true,
      postCommitPending: true,
    });
  }
  await refreshConditionLabels(mutation.changedIds || []);
  if (typeof isCurrent === "function" && sceneEpoch != null && !isCurrent(sceneEpoch)) {
    return attachSpellExecutionHistory(mutation, {
      ...mutation,
      stale: true,
      postCommitPending: true,
    });
  }
  return attachSpellExecutionHistory(mutation, mutation);
}

export async function executeSpellBoardTokenStateUpdate({
  group = null,
  hp = undefined,
  sceneEpoch = null,
  sceneIdentity = null,
  commandId = "",
  isCurrent = null,
} = {}) {
  if (typeof isCurrent === "function" && sceneEpoch != null && !isCurrent(sceneEpoch)) {
    throw new Error("scene-epoch-stale-before-board-token-update");
  }
  const instanceId = String(group?.instanceId || "").trim();
  const casterId = String(group?.casterId || "").trim();
  const itemId = String(group?.itemId || "").trim();
  if (!instanceId || !casterId) throw new Error("Invalid spell board token state: context-required");
  const rule = getSpellBoardTokenRule(group?.spellId);
  const endsAtZero = rule?.spellId === "arcane-hand"
    && hp !== undefined
    && Number.isFinite(Number(hp))
    && Number(hp) === 0;
  const removesAtZero = (endsAtZero || rule?.spellId === "animate-objects")
    && hp !== undefined
    && Number.isFinite(Number(hp))
    && Number(hp) === 0;
  const operations = endsAtZero
    ? [
      {
        type: "concentration:break",
        casterIds: [casterId],
        reference: instanceId,
      },
      {
        type: "spell:remove-instance",
        targetIds: [casterId],
        instanceId,
      },
    ]
    : [];
  const label = endsAtZero
    ? `Terminata pedina: ${String(group?.name || "Incantesimo").trim()}`
    : `Aggiorna pedina: ${String(group?.name || "Incantesimo").trim()}`;
  const mutation = await runEffectsMutation(operations, {
    kind: "spell-board-token",
    label,
    targetIds: [casterId],
    sideEffects: [{
      type: "spell-board-token:update-state",
      instanceId,
      ...(itemId ? { itemId } : {}),
      hp,
      ...(removesAtZero ? { removeWhenZero: true } : {}),
    }],
    history: {
      kind: "spell-board-token",
      label,
      payload: {
        causality: buildSpellCausality({
          eventType: "board-token-update",
          spellId: group?.spellId,
          spellName: group?.name,
          instanceId,
          slotLevel: group?.castContext?.slotLevel,
          phase: group?.castContext?.phase,
          casterId,
          casterName: group?.casterName,
          actionLabel: label,
          concentrationAction: endsAtZero ? "break" : undefined,
          concentrationInstanceId: instanceId,
        }),
      },
    },
    ...(sceneIdentity ? { sceneIdentity } : {}),
    ...(commandId ? { commandId } : {}),
  });
  requireAppliedEffectsMutation(mutation);
  if (typeof isCurrent === "function" && sceneEpoch != null && !isCurrent(sceneEpoch)) {
    return attachSpellExecutionHistory(
      mutation.commitResult?.sideEffectChanges || [],
      { ...mutation, stale: true, postCommitPending: true },
    );
  }
  return attachSpellExecutionHistory(
    mutation.commitResult?.sideEffectChanges || [],
    mutation,
  );
}

export async function executeSpellBoardTokenRecreate({
  group = null,
  position = null,
  sceneEpoch = null,
  sceneIdentity = null,
  commandId = "",
  isCurrent = null,
} = {}) {
  if (typeof isCurrent === "function" && sceneEpoch != null && !isCurrent(sceneEpoch)) {
    throw new Error("scene-epoch-stale-before-board-token-recreate");
  }
  const instanceId = String(group?.instanceId || "").trim();
  const casterId = String(group?.casterId || "").trim();
  const rule = getSpellBoardTokenRule(group?.spellId);
  if (
    !instanceId
    || !casterId
    || !rule
    || !Number.isFinite(Number(position?.x))
    || !Number.isFinite(Number(position?.y))
  ) {
    throw new Error("Invalid spell board token recreation: context-required");
  }
  const label = `Ricrea pedina: ${String(group?.name || rule.label).trim()}`;
  const mutation = await runEffectsMutation([], {
    kind: "spell-board-token",
    label,
    targetIds: [casterId],
    sideEffects: [{
      type: "spell-board-token:place",
      entityId: createSpellBoardTokenId(),
      spellId: rule.spellId,
      instanceId,
      casterId,
      slotLevel: group?.castContext?.slotLevel,
      position: { x: Number(position.x), y: Number(position.y) },
    }],
    history: {
      kind: "spell-board-token",
      label,
      payload: {
        causality: buildSpellCausality({
          eventType: "board-token-update",
          spellId: rule.spellId,
          spellName: group?.name || rule.label,
          instanceId,
          slotLevel: group?.castContext?.slotLevel,
          phase: group?.castContext?.phase,
          casterId,
          casterName: group?.casterName,
          action: { id: "recreate", label },
        }),
      },
    },
    ...(sceneIdentity ? { sceneIdentity } : {}),
    ...(commandId ? { commandId } : {}),
  });
  requireAppliedEffectsMutation(mutation);
  if (typeof isCurrent === "function" && sceneEpoch != null && !isCurrent(sceneEpoch)) {
    return attachSpellExecutionHistory(
      mutation.commitResult?.sideEffectChanges || [],
      { ...mutation, stale: true, postCommitPending: true },
    );
  }
  return attachSpellExecutionHistory(
    mutation.commitResult?.sideEffectChanges || [],
    mutation,
  );
}

export async function executeSpellApplication({
  spell,
  enteredName = "",
  turns = 1,
  casterId = "",
  targetIds = [],
  castContext = {},
  selectedChoice = "",
  phasePlan = null,
  applyAutomatedConditions = true,
  activeConcentration = null,
  historyLabel = "",
  requestedConcentration = false,
  appliedAt = undefined,
  casterName = "",
  sceneEpoch = null,
  sceneIdentity = null,
  commandId = "",
  isCurrent = null,
} = {}) {
  const intent = buildSpellApplicationIntent({
    spell,
    enteredName,
    turns,
    casterId,
    targetIds,
    castContext,
    selectedChoice,
    phasePlan,
    applyAutomatedConditions,
    activeConcentration,
    historyLabel,
    requestedConcentration,
  });
  if (!intent) return [];

  const instanceId = String(activeConcentration?.instanceId || "").trim()
    || createSpellInstanceId();
  if (typeof isCurrent === "function" && sceneEpoch != null && !isCurrent(sceneEpoch)) {
    throw new Error("scene-epoch-stale-before-spell-application");
  }
  const resolvedAppliedAt = appliedAt === undefined
    ? await getCurrentSpellAppliedAt()
    : appliedAt;
  if (typeof isCurrent === "function" && sceneEpoch != null && !isCurrent(sceneEpoch)) {
    throw new Error("scene-epoch-stale-before-spell-application");
  }
  const applicationPlan = buildSpellApplicationPlan({
    intent,
    instanceId,
    appliedAt: resolvedAppliedAt,
    casterName,
  });
  const removeReplacedZones = intent.wantsConcentration
    && applicationPlan.concentrationAction === "replace"
    && casterId;
  const boardTokenRule = applicationPlan.phasePlan?.phase === "prepare"
    ? null
    : getSpellBoardTokenRule(spell);
  const sideEffects = [];
  if (removeReplacedZones) {
    sideEffects.push({
      type: "static-zone:remove-ended",
      selectors: [{ casterId }],
    });
  }
  const mutation = await runEffectsMutation(applicationPlan.operations, {
    kind: "spell",
    label: applicationPlan.historyLabel,
    targetIds: [casterId, ...targetIds],
    sideEffects,
    history: {
      kind: "spell",
      label: applicationPlan.historyLabel,
      payload: {
        causality: buildSpellCausality({
          eventType: applicationPlan.phasePlan?.phase === "prepare"
            ? "prepare"
            : applicationPlan.phasePlan?.phase === "resolve"
              ? "resolution"
              : "application/cast",
          spellId: spell?.id,
          spellName: spell?.displayName || spell?.name || intent.name,
          instanceId,
          slotLevel: intent.persistedCastContext?.slotLevel || castContext?.slotLevel,
          phase: applicationPlan.phasePlan?.phase || intent.persistedCastContext?.phase,
          casterId,
          casterName,
          targetIds: intent.subjects,
          actionId: castContext?.actionId || intent.persistedCastContext?.actionId,
          actionLabel: applicationPlan.historyLabel,
          concentrationAction: intent.wantsConcentration
            ? applicationPlan.concentrationAction
            : undefined,
          concentrationInstanceId: instanceId,
        }),
      },
    },
    ...(sceneIdentity ? { sceneIdentity } : {}),
    ...(commandId ? { commandId } : {}),
  });
  requireAppliedEffectsMutation(mutation);
  const changedIds = mutation.changedIds;
  if (typeof isCurrent === "function" && sceneEpoch != null && !isCurrent(sceneEpoch)) {
    return attachSpellExecutionHistory([...changedIds], {
      ...mutation,
      stale: true,
      postCommitPending: true,
    });
  }
  if (applicationPlan.phasePlan?.phase !== "prepare" && !boardTokenRule) {
    void emitMatchedSpellVisual({
      spellId: spell?.id,
      casterId,
      targetIds,
      eventId: instanceId,
      lifecycleId: instanceId,
      sceneEpoch,
    }).catch((error) => {
      console.warn("[spell] matched visual:", error?.message || error);
    });
  }
  await refreshConditionLabels(changedIds);
  if (typeof isCurrent === "function" && sceneEpoch != null && !isCurrent(sceneEpoch)) {
    return attachSpellExecutionHistory([...changedIds], {
      ...mutation,
      stale: true,
      postCommitPending: true,
    });
  }
  return attachSpellExecutionHistory([...changedIds], mutation);
}
