// Trasformazioni, decision G41 (docs/PIANO_TRASFORMAZIONI.md §5.8): back on a map where the token is still in a form, and
// the creature was hurt or healed elsewhere. The memory does not write over the form's HP: the form ends and the
// registry's HP come back, in one command of the coordinator. The removal carries the mark, so the stash is not written
// over them; the write is no damage and no heal (a "rest" intent: no Warding Bond, no condition that ends on damage, no
// death save), and already counts the token's pills on the maximum (maxHpAware). Outside the History, as the memory's own
// restore is.
import { requireAppliedEffectsMutation, runEffectsMutation } from "./effectsMutations.js";
import { currentSceneEpoch, isCurrentSceneEpoch } from "./sceneEpoch.js";
import { TRANSFORMATION_REVERTED_FLAG } from "./transformationHpCore.js";

// restores: [{ itemId, instanceId, hp, hpMax, expectedFields: { hp, hpMax } }], hp and hpMax with the token's pills.
export async function endTransformationsForRestoredHp(restores = [], { sceneEpoch = currentSceneEpoch() } = {}) {
  if (!isCurrentSceneEpoch(sceneEpoch)) return [];
  const list = (Array.isArray(restores) ? restores : [])
    .filter((restore) => restore?.itemId && restore.instanceId && Number.isFinite(Number(restore.hp))
      && Number(restore.hpMax) > 0);
  if (!list.length) return [];
  const targetIds = [...new Set(list.map((restore) => restore.itemId))];
  const mutation = await runEffectsMutation([
    { type: "condition:remove-instances", removals: list.map((restore) => ({ itemId: restore.itemId,
      instanceId: restore.instanceId, [TRANSFORMATION_REVERTED_FLAG]: true })) },
    { type: "hp:set", damageEnds: false, updates: list.map((restore) => ({
      itemId: restore.itemId,
      hp: Math.max(0, Math.floor(Number(restore.hp))),
      hpMax: Math.floor(Number(restore.hpMax)),
      maxHpAware: true,
      hpIntent: { mode: "rest", amount: 0, eventId: "actor-vitals-transformation" },
      ...(restore.expectedFields?.hp ? { expectedHP: restore.expectedFields.hp } : {}),
      ...(restore.expectedFields?.hpMax ? { expectedHPMax: restore.expectedFields.hpMax } : {}),
    })) },
  ], {
    history: false,
    kind: "hp",
    label: "PF dalla memoria: forma finita",
    targetIds,
  });
  if (mutation.status === "rejected") return [];
  requireAppliedEffectsMutation(mutation);
  return isCurrentSceneEpoch(sceneEpoch) ? mutation.changedIds : [];
}
