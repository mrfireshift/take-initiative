import { ID } from "./constants.js";
import { refreshConditionLabels } from "./conditions.js";
import {
  commitEffectsMutationPlan,
  conditionMutationOperations,
  prepareEffectsMutation,
} from "./effectsMutations.js";
import { withItemMetaHistory } from "./history.js";

const SPELLS_META_KEY = `${ID}/spells`;
const CONC_META_KEY = `${ID}/concentration`;

export async function executeConditionApplication({
  conditionName = "",
  targetIds = [],
  conditionMode = "add",
  sourceId = "",
  sourceName = "",
  appliedAt = null,
  expiry = { mode: "manual" },
} = {}) {
  const normalizedName = String(conditionName || "").trim();
  if (!normalizedName || !targetIds.length) return [];

  const mutationPlan = await prepareEffectsMutation(conditionMutationOperations({
    targetIds,
    conditionName: normalizedName,
    mode: conditionMode,
    options: {
      sourceId,
      sourceName,
      appliedAt,
      expiry,
    },
  }));
  const changedIds = mutationPlan.changedIds;
  await withItemMetaHistory({
    kind: "condition",
    label: `Applicata: ${normalizedName}`,
    itemIds: changedIds,
    fields: ["conditions", SPELLS_META_KEY, CONC_META_KEY],
  }, () => commitEffectsMutationPlan(mutationPlan));
  await refreshConditionLabels(changedIds);
  return changedIds;
}
