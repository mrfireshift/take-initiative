import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { sanitizeQuickAction } from "./quickActionsCore.js";
import {
  buildDirectQuickActionConditionRequest,
} from "./quickActionConditionExecutionCore.js";
import {
  buildDirectQuickActionSpellRequest,
  quickActionConcentrationNames,
} from "./quickActionSpellExecutionCore.js";
import { executeConditionApplication } from "./conditionApplicationExecutor.js";
import {
  executeSpellApplication,
  getCurrentSpellAppliedAt,
} from "./spellApplicationExecutor.js";

const META_KEY = `${ID}/meta`;

export async function executeDirectQuickAction({
  action = null,
  sourceItem = null,
  selectedTargetIds = null,
  confirmConcentration = null,
} = {}) {
  const normalized = sanitizeQuickAction(action);
  const resolvedSelectedTargetIds = normalized?.targetMode === "selection"
    ? Array.isArray(selectedTargetIds)
      ? selectedTargetIds
      : await OBR.player.getSelection().catch(() => [])
    : [];
  const buildArgs = {
    action,
    sourceId: sourceItem?.id,
    selectedTargetIds: resolvedSelectedTargetIds,
  };
  const decision = normalized?.kind === "condition"
    ? buildDirectQuickActionConditionRequest(buildArgs)
    : buildDirectQuickActionSpellRequest(buildArgs);
  if (decision.mode !== "direct") return decision;

  const validationTargetIds = normalized?.targetMode === "selection"
    ? resolvedSelectedTargetIds
    : decision.request.targetIds;
  const requestedItemIds = Array.from(new Set([
    sourceItem?.id,
    ...validationTargetIds,
  ].filter(Boolean)));
  const freshItems = await OBR.scene.items
    .getItems(requestedItemIds)
    .catch(() => []);
  const freshById = new Map(freshItems.map((item) => [item.id, item]));
  const freshSource = freshById.get(sourceItem?.id);
  if (!freshSource) throw new Error("quick-action-source-missing");
  if (
    normalized?.targetMode === "selection"
    && validationTargetIds.some((id) => {
      const target = freshById.get(id);
      return !target
        || target.layer !== "CHARACTER"
        || target.metadata?.[META_KEY]?.inInitiative !== true;
    })
  ) {
    return {
      ...decision,
      mode: "review",
      reason: "target-invalid",
    };
  }

  const concentrationNames = decision.kind === "spell" && decision.replacesConcentration
    ? quickActionConcentrationNames(freshSource)
    : [];
  if (concentrationNames.length) {
    const message = [
      `${freshSource.name || "Il personaggio"} sta già mantenendo la concentrazione su`,
      concentrationNames.join(", "),
      `Lanciare ${decision.request.spell.displayName || decision.request.spell.name} la sostituirà. Continuare?`,
    ].join("\n\n");
    const confirmed = typeof confirmConcentration === "function"
      ? await confirmConcentration(message, concentrationNames)
      : false;
    if (!confirmed) {
      return {
        ...decision,
        mode: "cancelled",
        reason: "concentration-replacement-cancelled",
      };
    }
  }

  const appliedAt = await getCurrentSpellAppliedAt();
  const changedIds = decision.kind === "condition"
    ? await executeConditionApplication({
      ...decision.request,
      appliedAt,
      sourceName: freshSource.name || "",
    })
    : await executeSpellApplication({
      ...decision.request,
      appliedAt,
      casterName: freshSource.name || "",
    });
  return {
    ...decision,
    mode: "executed",
    changedIds,
  };
}
