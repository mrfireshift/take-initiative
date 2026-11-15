// Lot SB3b of docs/STUDIO_GIOCO_ONLINE.md: writes what monsterHydrationExtrasCore.js plans for the monsters that just
// got their card from the registry (the tracker's hydration, GM only). The hit points go through the effects
// coordinator ("hp:set", expected values, History), as the sheet's Salva writes them (monsterHitPointsImport.js); size
// and Legendary outside the History, as at Salva. The map's bars and texts follow the hit points. A step that fails
// leaves the others; nothing is retried.
import OBR from "@owlbear-rodeo/sdk";
import { getEffectsMutationSceneContext, requireAppliedEffectsMutation, runEffectsMutation } from "./effectsMutations.js";
import { setMonsterLegendary } from "./monsterLegendaryCore.js";
import { planHydratedMonsterExtras } from "./monsterHydrationExtrasCore.js";

export async function applyHydratedMonsterExtras({ hydratedIds = [], isCurrent = () => true } = {}) {
  const result = { hitPoints: 0, sizes: 0, legendary: 0 };
  const items = await OBR.scene.items.getItems();
  if (!isCurrent()) return result;
  const plan = planHydratedMonsterExtras({ items, hydratedIds });

  if (plan.hitPoints.updates.length) {
    try {
      const context = await getEffectsMutationSceneContext();
      if (!isCurrent()) return result;
      const mutation = await runEffectsMutation([{ type: "hp:set", updates: plan.hitPoints.updates }], {
        history: true,
        kind: "hp",
        label: plan.hitPoints.label,
        targetIds: plan.hitPoints.targetIds,
        commandId: context.commandId,
        sceneIdentity: context.sceneIdentity,
      });
      requireAppliedEffectsMutation(mutation);
      result.hitPoints = plan.hitPoints.updates.length;
      if (isCurrent()) {
        try {
          const [{ syncHPBarNow, syncHPTextBatchNow }, { sharedHpCommittedUpdates }] = await Promise.all([
            import("./hpbar-items.js"), import("./sharedHpViewCore.js")]);
          const visual = sharedHpCommittedUpdates(mutation, plan.hitPoints.updates.map((update) => ({
            item: { id: update.itemId }, change: { afterHP: update.hp, hpMax: update.hpMax } })));
          for (const update of visual) syncHPBarNow(update.tokenId, update.hp, update.hpMax);
          await syncHPTextBatchNow(visual);
        } catch (error) {
          console.warn("[monster-hydration] barre dei PF:", error?.message || error);
        }
      }
    } catch (error) {
      // Refused by the expected values (another write came first) or by the scene: the token keeps what it has.
      console.warn("[monster-hydration] PF non impostati:", error?.message || error);
    }
  }

  for (const { id, cells } of plan.sizes) {
    if (!isCurrent()) return result;
    try {
      const { applyMonsterTokenSize } = await import("./monsterTokenSize.js");
      result.sizes += await applyMonsterTokenSize({ sourceId: id, cells, onlyIds: [id], isCurrent });
    } catch (error) {
      console.warn("[monster-hydration] taglia del token:", error?.message || error);
    }
  }

  if (plan.legendary.length && isCurrent()) {
    const byId = new Map(plan.legendary.map((entry) => [entry.id, entry.legendary]));
    try {
      await OBR.scene.items.updateItems([...byId.keys()], (drafts) => {
        for (const draft of drafts) if (setMonsterLegendary(draft, byId.get(draft.id))) result.legendary += 1;
      });
    } catch (error) {
      console.warn("[monster-hydration] Leggendario:", error?.message || error);
    }
  }
  return result;
}
