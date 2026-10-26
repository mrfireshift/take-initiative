// A monster's hit points from its stat block, written after the sheet's Salva (attacchi dei mostri, lotto 5): one "hp:set"
// command through the effects coordinator, with History (Undo puts the previous values back), then the HP bars and
// texts on the map, as the quick HP console does. hpMemory stays out: characters are never written here.
import OBR from "@owlbear-rodeo/sdk";
import { getEffectsMutationSceneContext, requireAppliedEffectsMutation, runEffectsMutation } from "./effectsMutations.js";
import { syncHPBarNow, syncHPTextBatchNow } from "./hpbar-items.js";
import { sharedHpCommittedUpdates } from "./sharedHpViewCore.js";
import { planMonsterHitPointsImport } from "./monsterHitPointsImportCore.js";

export async function applyMonsterHitPoints({ sourceId, hp, overwrite = false, sameName = false, sceneIdentity = null, isCurrent = () => true } = {}) {
  const items = await OBR.scene.items.getItems();
  if (!isCurrent()) throw new Error("Scena cambiata: PF non impostati.");
  const plan = planMonsterHitPointsImport({ items, sourceId, hp, overwrite, sameName });
  if (!plan.updates.length) return { plan, committed: false };
  const name = items.find((item) => item.id === sourceId)?.name || sourceId;
  const context = await getEffectsMutationSceneContext({ sceneIdentity });
  if (!isCurrent()) throw new Error("Scena cambiata: PF non impostati.");
  const mutation = await runEffectsMutation([{ type: "hp:set", updates: plan.updates }], {
    history: true,
    kind: "hp",
    label: `${name}: PF dallo statblock (${hp})${plan.updates.length > 1 ? ` · ${plan.updates.length} token` : ""}`,
    targetIds: plan.targetIds,
    commandId: context.commandId,
    sceneIdentity: context.sceneIdentity,
  });
  requireAppliedEffectsMutation(mutation);
  if (isCurrent()) {
    const visual = sharedHpCommittedUpdates(mutation, plan.updates.map((update) => ({
      item: { id: update.itemId }, change: { afterHP: update.hp, hpMax: update.hpMax } })));
    for (const update of visual) syncHPBarNow(update.tokenId, update.hp, update.hpMax);
    await syncHPTextBatchNow(visual);
  }
  return { plan, committed: true, historyEntry: mutation.historyEntry || null };
}
