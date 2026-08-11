import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { createSpellInstanceId } from "./spells.js";
import { getConditionInstances, refreshConditionLabels } from "./conditions.js";
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
import {
  resolveZeroHPUnconsciousAction,
  ZERO_HP_UNCONSCIOUS_TYPE,
} from "./hpConditionRulesCore.js";
import { currentInitiativeTurnKey } from "./turnBoundaryCore.js";
import { currentSceneEpoch } from "./sceneEpoch.js";
import { emitMatchedSpellVisual } from "./embersMatchedVisualRenderer.js";
import { requestSpellZoneMovement } from "./spellAreaPlacementClient.js";
import {
  createSpellBoardTokenId,
  getSpellBoardTokenRule,
} from "./spellBoardTokenCore.js";
import { buildStaticSpellChildZoneItem } from "./spellStaticZone.js";
import { translatedZoneArea } from "./spellStaticZoneCore.js";

const STATE_KEY = `${ID}/state`;

export async function executeSpellZoneMovement({
  group = null,
  action = null,
  casterName = "",
  movementChoice = "",
} = {}) {
  const ruleId = String(action?.ruleId || "").trim();
  const instanceId = String(group?.instanceId || action?.instanceId || "").trim();
  const zoneItemId = String(action?.zoneItemId || "").trim();
  const casterId = String(group?.casterId || "").trim();
  if (!ruleId || !instanceId || !zoneItemId || !casterId) {
    throw new Error("Invalid spell zone movement: context-required");
  }
  const result = await requestSpellZoneMovement({
    ruleId,
    casterId,
    instanceId,
    zoneItemId,
    movementChoice,
    sceneEpoch: currentSceneEpoch(),
  });
  if (result?.status !== "confirmed" || !result?.preview) {
    if (result?.status === "cancelled") return [];
    throw new Error(
      String(result?.error || "Il movimento della zona non è stato confermato."),
    );
  }
  const preview = result.preview;
  const movement = await runEffectsMutation([], {
    sceneEpoch: Number.isFinite(Number(preview.sceneEpoch))
      ? Number(preview.sceneEpoch)
      : undefined,
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
      payload: { instanceId, zoneItemId, ruleId },
    },
  });
  requireAppliedEffectsMutation(movement);
  return movement.changedIds || [];
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
} = {}) {
  const resolvedAppliedAt = appliedAt === undefined
    ? await getCurrentSpellAppliedAt()
    : appliedAt;
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
  });
  requireAppliedEffectsMutation(mutation);
  const changedIds = mutation.changedIds;
  await refreshConditionLabels(changedIds);
  return changedIds;
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
  naturalStormBonus = false,
} = {}) {
  const normalizedPayload = {
    ...(payload && typeof payload === "object" ? payload : {}),
    ...(outcomes && typeof outcomes === "object" ? { outcomes } : {}),
  };
  const payloadValidation = validateSpellActiveResolutionPayload(payload);
  if (!payloadValidation.valid) {
    throw new Error("Invalid active spell resolution: " + payloadValidation.errors.join(", "));
  }
  const ids = normalizeActiveResolutionTargetIds(targetIds);
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
  };
  const preflight = await validateSpellActiveResolutionCommit(commitInput);
  if (!preflight.valid) {
    throw new Error("Invalid active spell resolution: " + preflight.errors.join(", "));
  }

  const items = await OBR.scene.items.getItems(ids);
  const byId = new Map(items.map((item) => [item.id, item]));
  const metadataPatches = [];
  const operations = [];
  const unconsciousIds = [];
  const unconsciousRemovals = [];
  const action = activeResolutionAction(payload);
  const sideEffects = [{
    type: "spell-active-resolution:validate",
    ...commitInput,
    naturalStormBonus: naturalStormBonus === true,
  }];
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
    for (const targetId of ids) {
      const item = byId.get(targetId);
      const meta = item?.metadata?.[`${ID}/meta`] || {};
      const outcome = activeResolutionOutcome(normalizedPayload, targetId, attackOutcome);
      const damage = resolveSpellActiveResolutionDamage({
        action,
        slotLevel: payload.slotLevel,
        outcome,
        roll: damageRoll,
      });
      if (!damage.valid) throw new Error("active-resolution-damage-invalid");
      if (damage.amount <= 0) continue;
      if (!item
        || !Object.prototype.hasOwnProperty.call(meta, "hp")
        || !Object.prototype.hasOwnProperty.call(meta, "hpMax")) {
        throw new Error("active-resolution-hp-required");
      }
      const hpChange = calculateQuickHPChange({
        mode: QUICK_HP_MODES.DAMAGE,
        value: damage.amount,
        factor: QUICK_HP_FACTORS.FULL,
        hp: meta.hp,
        hpMax: meta.hpMax,
      });
      if (!hpChange.changed) continue;
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
      const zeroAction = resolveZeroHPUnconsciousAction(
        { ...meta, hp: hpChange.afterHP, hpMax: hpChange.hpMax },
        getConditionInstances(meta.conditions || {}),
      );
      if (zeroAction.add) unconsciousIds.push(targetId);
      unconsciousRemovals.push(...zeroAction.removeInstanceIds.map((instanceId) => ({
        itemId: targetId,
        instanceId,
      })));
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
  const mutation = await runEffectsMutation(operations, {
    sceneEpoch: payload.sceneEpoch,
    kind: "spell-active-resolution",
    label: `Attivazione: ${spellName} · ${actionLabel}`,
    targetIds: [payload.casterId, ...ids],
    metadataPatches,
    sideEffects,
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
        naturalStormBonus: naturalStormBonus === true,
      },
    },
  });
  requireAppliedEffectsMutation(mutation);
  await refreshConditionLabels(mutation.changedIds || []);
  return mutation;
}

export async function executeSpellBoardTokenStateUpdate({
  group = null,
  hp = undefined,
} = {}) {
  const instanceId = String(group?.instanceId || "").trim();
  const casterId = String(group?.casterId || "").trim();
  if (!instanceId || !casterId) throw new Error("Invalid spell board token state: context-required");
  const rule = getSpellBoardTokenRule(group?.spellId);
  const endsAtZero = rule?.spellId === "arcane-hand"
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
      hp,
      ...(endsAtZero ? { removeWhenZero: true } : {}),
    }],
  });
  requireAppliedEffectsMutation(mutation);
  return mutation.commitResult?.sideEffectChanges || [];
}

export async function executeSpellBoardTokenRecreate({
  group = null,
  position = null,
} = {}) {
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
  });
  requireAppliedEffectsMutation(mutation);
  return mutation.commitResult?.sideEffectChanges || [];
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
  const resolvedAppliedAt = appliedAt === undefined
    ? await getCurrentSpellAppliedAt()
    : appliedAt;
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
  });
  requireAppliedEffectsMutation(mutation);
  const changedIds = mutation.changedIds;
  if (applicationPlan.phasePlan?.phase !== "prepare" && !boardTokenRule) {
    void emitMatchedSpellVisual({
      spellId: spell?.id,
      casterId,
      targetIds,
      eventId: instanceId,
      lifecycleId: instanceId,
    }).catch((error) => {
      console.warn("[spell] matched visual:", error?.message || error);
    });
  }
  await refreshConditionLabels(changedIds);
  return changedIds;
}
