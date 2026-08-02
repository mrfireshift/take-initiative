import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import { createSpellInstanceId } from "./spells.js";
import { refreshConditionLabels } from "./conditions.js";
import {
  commitEffectsMutationPlan,
  prepareEffectsMutation,
} from "./effectsMutations.js";
import {
  buildSpellApplicationIntent,
  buildSpellApplicationPlan,
} from "./spellApplicationPlanCore.js";
import { withItemMetaHistory } from "./history.js";
import {
  commitWithStaticSpellZoneRemoval,
  getStaticSpellZoneItems,
  setStaticSpellZoneRuleChoice,
} from "./spellStaticZone.js";
import { buildSpellActiveActionPlan } from "./spellActiveActionCore.js";
import { currentInitiativeTurnKey } from "./turnBoundaryCore.js";

const STATE_KEY = `${ID}/state`;
const SPELLS_META_KEY = `${ID}/spells`;
const CONC_META_KEY = `${ID}/concentration`;

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

  const zoneItems = actionPlan.zoneRuleChoice
    ? await getStaticSpellZoneItems({ instanceId: group?.instanceId })
    : [];
  if (actionPlan.zoneRuleChoice && !zoneItems.length) {
    throw new Error("La zona dell'incantesimo non è più presente sulla scena.");
  }

  const mutationPlan = await prepareEffectsMutation(actionPlan.operations);
  const changedIds = mutationPlan.changedIds;
  await withItemMetaHistory({
    kind: "spell",
    label: actionPlan.historyLabel,
    itemIds: changedIds,
    sceneItemIds: zoneItems.map((item) => item.id),
    fields: [SPELLS_META_KEY, CONC_META_KEY, "conditions"],
  }, async () => {
    await commitEffectsMutationPlan(mutationPlan);
    if (actionPlan.zoneRuleChoice) {
      await setStaticSpellZoneRuleChoice(zoneItems, actionPlan.zoneRuleChoice);
    }
  });
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
  const replacedStaticZoneItems = intent.wantsConcentration
    && applicationPlan.concentrationAction === "replace"
    && casterId
    ? await getStaticSpellZoneItems({ casterId })
    : [];
  const mutationPlan = await prepareEffectsMutation(applicationPlan.operations);
  const changedIds = mutationPlan.changedIds;

  await withItemMetaHistory({
    kind: "spell",
    label: applicationPlan.historyLabel,
    itemIds: changedIds,
    sceneItemIds: replacedStaticZoneItems.map((item) => item.id),
    fields: [SPELLS_META_KEY, CONC_META_KEY, "conditions"],
  }, () => commitWithStaticSpellZoneRemoval(
    replacedStaticZoneItems,
    () => commitEffectsMutationPlan(mutationPlan),
  ));
  await refreshConditionLabels(changedIds);
  return changedIds;
}
