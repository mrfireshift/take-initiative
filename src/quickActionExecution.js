import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { sanitizeQuickAction } from "./quickActionsCore.js";
import {
  buildDirectQuickActionConditionRequest,
} from "./quickActionConditionExecutionCore.js";
import {
  buildQuickActionSpellLaunchPlan,
  quickActionConcentrationNames,
} from "./quickActionSpellExecutionCore.js";
import { executeConditionApplication } from "./conditionApplicationExecutor.js";
import {
  executeSpellApplication,
  getCurrentSpellAppliedAt,
} from "./spellApplicationExecutor.js";
import { findActiveSpellConcentration } from "./spellCastPhaseCore.js";
import { executeSpellUnifiedLifecycle } from "./spellUnifiedLifecycleAdapter.js";
import { getSpellDefinition } from "./spells-srd.js";

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
    : buildQuickActionSpellLaunchPlan(buildArgs);
  if (decision.mode !== "direct") return decision;

  const validationTargetIds = decision.kind === "spell"
    ? decision.session.targetIds
    : normalized?.targetMode === "selection"
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

  const spell = decision.kind === "spell"
    ? getSpellDefinition(decision.spellId)
    : null;
  const concentrationNames = decision.kind === "spell" && decision.replacesConcentration
    ? quickActionConcentrationNames(freshSource)
    : [];
  if (concentrationNames.length) {
    const message = [
      `${freshSource.name || "Il personaggio"} sta già mantenendo la concentrazione su`,
      concentrationNames.join(", "),
      `Lanciare ${spell?.displayName || spell?.name || decision.spellId} la sostituirà. Continuare?`,
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
  if (decision.kind === "condition") {
    const changedIds = await executeConditionApplication({
      ...decision.request,
      appliedAt,
      sourceName: freshSource.name || "",
    });
    return { ...decision, mode: "executed", changedIds };
  }

  const lifecycleResult = await executeSpellUnifiedLifecycle({
    contract: decision.contract,
    session: decision.session,
    runtime: {
      spell,
      appliedAt,
      casterName: freshSource.name || "",
      resolveActiveConcentration: async () => findActiveSpellConcentration(
        freshSource.metadata?.[META_KEY]?.[`${ID}/concentration`],
        spell,
      ),
      executor: executeSpellApplication,
    },
  });
  if (lifecycleResult.status === "rejected") {
    return {
      ...decision,
      mode: "review",
      reason: lifecycleResult.error?.code || "session-incomplete",
      lifecycleResult,
    };
  }
  if (lifecycleResult.status === "failed") {
    throw new Error(lifecycleResult.error?.code || "quick-action-spell-failed");
  }
  return {
    ...decision,
    mode: "executed",
    changedIds: lifecycleResult.changedIds,
    lifecycleResult,
  };
}
