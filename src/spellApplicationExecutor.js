import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { createSpellInstanceId } from "./spells.js";
import { refreshConditionLabels } from "./conditions.js";
import {
  requireAppliedEffectsMutation,
  runEffectsMutation,
} from "./effectsMutations.js";
import {
  buildSpellApplicationIntent,
  buildSpellApplicationPlan,
} from "./spellApplicationPlanCore.js";
import { buildSpellActiveActionPlan } from "./spellActiveActionCore.js";
import { currentInitiativeTurnKey } from "./turnBoundaryCore.js";
import { currentSceneEpoch } from "./sceneEpoch.js";
import { emitMatchedSpellVisual } from "./embersMatchedVisualRenderer.js";
import { requestSpellZoneMovement } from "./spellAreaPlacementClient.js";

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

  const mutation = await runEffectsMutation(actionPlan.operations, {
    kind: "spell",
    label: actionPlan.historyLabel,
    targetIds: selectedTargetIds,
    sideEffects: actionPlan.zoneRuleChoice ? [{
      type: "static-zone:set-rule-choice",
      selector: { instanceId: group?.instanceId || "" },
      ruleChoice: actionPlan.zoneRuleChoice,
      requireMatch: true,
    }] : [],
  });
  requireAppliedEffectsMutation(mutation);
  const changedIds = mutation.changedIds;
  await refreshConditionLabels(changedIds);
  return changedIds;
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
  const mutation = await runEffectsMutation(applicationPlan.operations, {
    kind: "spell",
    label: applicationPlan.historyLabel,
    targetIds: [casterId, ...targetIds],
    sideEffects: removeReplacedZones ? [{
      type: "static-zone:remove-ended",
      selectors: [{ casterId }],
    }] : [],
  });
  requireAppliedEffectsMutation(mutation);
  const changedIds = mutation.changedIds;
  if (applicationPlan.phasePlan?.phase !== "prepare") {
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
